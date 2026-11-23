/* 数理无限画布 · 文件导入：PDF、图片/GIF、视频音频、SWF、GeoGebra、网页、Office、exe 等 */
(function () {
  'use strict';
  const GW = window.GW;

  const EXT = {
    image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'],
    video: ['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv', 'avi', 'wmv', 'flv', 'ts', 'm2ts', 'mts', 'mpg', 'mpeg', '3gp', 'f4v', 'rmvb', 'rm', 'asf', 'vob', 'divx', 'm2v'],
    audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
    pdf: ['pdf'],
    swf: ['swf'],
    ggb: ['ggb'],
    html: ['html', 'htm'],
    office: ['ppt', 'pptx', 'pps', 'ppsx', 'doc', 'docx', 'xls', 'xlsx', 'dps', 'wps', 'et'],
    doc: ['gewu'],
    text: ['txt', 'md'],
  };
  // 1.7.7（WP2）：mkv 是 Matroska 容器，不能再硬写成 video/webm；rmvb/rm/divx 浏览器支持极差，
  // 索性不写 MIME，走 objects.js 的 application/octet-stream 兜底。其余按容器给合理类型。
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif',
    mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska',
    avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', flv: 'video/x-flv', ts: 'video/mp2t', m2ts: 'video/mp2t', mts: 'video/mp2t',
    mpg: 'video/mpeg', mpeg: 'video/mpeg', '3gp': 'video/3gpp', f4v: 'video/mp4', asf: 'video/x-ms-asf', vob: 'video/mpeg', m2v: 'video/mpeg',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
    pdf: 'application/pdf', swf: 'application/x-shockwave-flash' };
  const extOf = (n) => (/\.([^.\\/]+)$/.exec(n) || [, ''])[1].toLowerCase();
  const baseName = (p) => p.split(/[\\/]/).pop();
  const catOf = (ext) => Object.keys(EXT).find((k) => EXT[k].includes(ext)) || 'file';

  const EMBED_LIMIT = 25 * 1024 * 1024; // 小于此大小的视频直接嵌入文档，便于拷贝到其他电脑

  function b64FromBuffer(buf) {
    const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  GW.b64FromBuffer = b64FromBuffer;
  const readAsB64 = (src) => (typeof src === 'string' ? window.gewu.readFile(src, 'base64') : src.arrayBuffer().then(b64FromBuffer));
  const sizeOf = async (src) => (typeof src === 'string' ? (await window.gewu.fileInfo(src)).size : src.size);

  // 3.x（跨端）：一律判「函数在不在」，不判 GW.isElectron —— 安卓 WebView 里 isElectron 恒为 false，
  // 但文件能力其实有一半；纯网页的 window.gewu 则是一堆空实现，同名桩存在却恒返回 null。
  // ⇒ 凡是「真本机路径」相关的能力（app:// 只读根、Office 转换、备份、录课直写）都要判函数存在，
  //   并且对「函数在、但返回 null」的情况再做一次返回值判断（shim 的桩就是这样）。
  const can = (k) => !!(window.gewu && typeof window.gewu[k] === 'function');
  // 桌面主进程才有 allowReadDir（把用户选中的目录登记成 app:// 只读根）；
  // 安卓 / 网页的 shim 没有它，openFiles 给的是 mem:// 句柄，写进 data.path 只会得到一张打不开的卡片。
  const canLocalPath = () => can('allowReadDir');
  // R2：canLocalPath() 只说明「这个壳上有 allowReadDir 这个函数」——安卓 shim 也定义了它（恒返回 false），
  // 所以真正该问的是「这个 path 是不是本机真路径」。mem:// 是 shim 的内存句柄，真身是 WebView 里的 File 对象，
  // 写进 data.path 只会得到一张点开没反应的死卡（fileURL 在非桌面原样返回 mem://…）。
  const isMemHandle = (p) => typeof p === 'string' && /^mem:\/\//i.test(p);
  const isLocalPath = (p) => !!p && !isMemHandle(p) && canLocalPath();

  // 1.7.7（WP2）：用户明确选中的本机文件，只把它所在目录登记成 app:// 的只读根。
  // 凡是写 data.path 的对象（大视频 / SWF 外部素材 / Office / 任意文件 / 离线网页）都经过这里；
  // 不登记的话 app://gewu/_local/… 会被协议拒（ERR_ACCESS_DENIED），画面空白或报「文件丢失或格式不支持」。
  // 只登记这一层目录：提不出目录（相对路径 / 根目录）就干脆不登记，绝不全局放行。
  async function allowPathDir(p) {
    if (!p || !window.gewu || typeof window.gewu.allowReadDir !== 'function') return;
    const cut = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    if (cut < 0) return;
    const dir = p.slice(0, cut);
    if (!dir) return;
    try { await window.gewu.allowReadDir(dir); }
    catch (e) { /* 旧主进程没有这个通道 */ }
  }

  // 读 SWF 舞台尺寸（px）。FWS 是明文；CWS 是 zlib 压缩体，解出开头那几字节就够读 RECT 了。
  // 认不出（ZWS / 自定义加密 / 畸形）一律返回 null，由调用方回落到默认窗口。
  // 只取 base64 头部约 256KB，避免为了一个 RECT 把几十 MB 的 SWF 全解开。
  async function swfStage(b64) {
    let sig, body;
    try {
      const cut = b64.length <= (1 << 18) ? b64.length : ((1 << 18) & ~3);
      const bin = atob(b64.slice(0, cut));
      const n = bin.length;
      if (n < 9) return null;
      const u = new Uint8Array(n);
      for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
      sig = String.fromCharCode(u[0], u[1], u[2]);
      if (sig === 'FWS') body = u.subarray(8);
      else if (sig === 'CWS') {
        const ds = new DecompressionStream('deflate');
        const w = ds.writable.getWriter();
        w.write(u.subarray(8)).catch(() => {}); w.close().catch(() => {});
        const rd = ds.readable.getReader();
        const pending = rd.read(); pending.catch(() => {});
        // 头部被截断时 deflate 流可能既不产出也不报错，给个上限免得把导入吊死
        const got = await Promise.race([pending, new Promise((r) => setTimeout(() => r(null), 800))]);
        try { rd.cancel(); } catch (_) {}
        if (!got || !got.value || !got.value.length) return null;
        body = got.value;
      } else return null;
    } catch (_) { return null; }
    try {
      if (body.length < 1) return null;
      const nbits = body[0] >> 3;
      if (nbits < 1 || nbits > 31) return null;
      const nbytes = Math.ceil((5 + nbits * 4) / 8);
      if (body.length < nbytes) return null;
      let bits = '';
      for (let i = 0; i < nbytes; i++) bits += body[i].toString(2).padStart(8, '0');
      const rd = (off) => {
        const v = parseInt(bits.slice(off, off + nbits), 2);
        return v >= (1 << (nbits - 1)) ? v - (1 << nbits) : v;   // RECT 四个字段都是有符号
      };
      const x0 = rd(5), x1 = rd(5 + nbits), y0 = rd(5 + nbits * 2), y1 = rd(5 + nbits * 3);
      const w = (x1 - x0) / 20, hh = (y1 - y0) / 20;             // twips = 1/20 px
      if (!(w >= 1 && hh >= 1 && w <= 8192 && hh <= 8192)) return null;
      return { w, h: hh };
    } catch (_) { return null; }
  }

  function progress(msg) {
    let el = document.getElementById('import-progress');
    if (!msg) { if (el) el.remove(); return; }
    if (!el) { el = GW.h('div', { id: 'import-progress' }, GW.h('i'), GW.h('span')); document.body.append(el); }
    el.lastChild.textContent = msg;
  }
  GW.progress = progress;

  // 依次排开多个导入对象
  let cascade = 0;
  const nextOffset = () => (cascade++ % 8) * 36 / GW.camera.s;

  // ---- F16：异步导入（图片解码 / PDF 解析）的「目标页票据」 ----
  // 这两条链路都是「put 资产 → 等解码 → 落对象」，等待期间老师可能已经翻到别的页、
  // 甚至换了文档；以前落点靠 GW.objects.create / GW.addItems 的默认值 = 完成时的当前页。
  // 票据记下发起时的页面对象与 doc.pages 的数组引用：storage.js 换文档时会把 doc.pages
  // 整个换成新数组，所以「数组引用变了」就等价于「换过文档」，不用另造 doc id。
  function pageTicket() {
    const pages = (GW.doc && GW.doc.pages) || null;
    return { pages: pages, page: GW.page() };
  }
  function ticketOk(tk) {
    if (!tk || !tk.page || !tk.pages) return false;
    if (!GW.doc || GW.doc.pages !== tk.pages) return false;   // 换过文档
    return tk.pages.indexOf(tk.page) >= 0;                    // 发起时那一页被删了
  }
  // assets.put 按内容去重，可能直接复用文档里已有的资产 id。那种「借来的」资产不能删，
  // 删了文档里原来引用它的图片就白屏 —— 只有这次真新建的才算临时资产。
  function putTemp(b64, mime, name) {
    const seen = {};
    for (const k in GW.doc.assets) seen[k] = 1;
    const id = GW.assets.put(b64, mime, name);
    return { id: id, fresh: !seen[id] };
  }
  function dropTemp(t) {
    if (!t || !t.fresh || !GW.doc || !GW.doc.assets) return;
    const u = GW.assets.url ? GW.assets.url(t.id) : '';
    delete GW.doc.assets[t.id];
    if (u) { try { URL.revokeObjectURL(u); } catch (e) { /* 已经失效 */ } }
  }

  const importer = (GW.importer = {
    EXT,
    catOf,          // WP2：暴露分类函数，供 scripts/check-insert-path.js 做行为自检
    // src: 本机路径（Electron）或 File 对象（浏览器 / 拖放）
    async importOne(src, at) {
      // T05：配额满了先导出 .gewu。importFiles 批量入口已拦，这里兜住直接调 importOne 的入口
      // （拖放回退、学科库卡片、从系统「打开方式」进 .ggb 等）。
      if (GW.quotaGuard && GW.quotaGuard('导入文件')) return null;
      const name = typeof src === 'string' ? baseName(src) : src.name;
      const path = typeof src === 'string' ? src : src.path || null;
      const ext = extOf(name), cat = catOf(ext);
      const off = nextOffset();
      try {
        // WP2：所有写 data.path 的分支共用这一段 —— 用户选中的文件，先把它所在目录
        // 登记成 app:// 的只读根（allowPathDir 内部只登记这一层，不放宽全局）。
        if (path) await allowPathDir(path);
        switch (cat) {
          case 'image': {
            const b64 = await readAsB64(src);
            return await importer.insertImageB64(b64, MIME[ext], name, at, off);
          }
          case 'pdf': {
            progress('正在解析 PDF：' + name);
            const b64 = await readAsB64(src);
            return await importer.insertPdf(b64, name, at);
          }
          case 'video': case 'audio': {
            const size = await sizeOf(src);
            const data = { name, audio: cat === 'audio' };
            if (isLocalPath(path) && size > EMBED_LIMIT) data.path = path;
            else { progress('正在载入：' + name); data.asset = GW.assets.put(await readAsB64(src), MIME[ext], name); }
            return GW.objects.create('video', data, Object.assign({ offset: off }, at));
          }
          case 'swf': {
            const b64 = await readAsB64(src);
            // 舞台尺寸开窗：按 SWF 自己的宽高比给窗口，宽度不足 480 时整体放大（不裁切）。
            // 认不出尺寸（sz === null）就交给 kind 的 defaultSize。
            const st = await swfStage(b64);
            const k = st ? Math.max(1, 480 / st.w) : 0;
            const sz = st ? { w: (st.w * k) / GW.camera.s, h: (st.h * k) / GW.camera.s } : null;
            const data = { name, asset: GW.assets.put(b64, MIME.swf, name) };
            // 留住原始路径：SWF 里用相对路径引用的外部素材要靠它推导 base
            if (isLocalPath(path)) data.path = path;
            return GW.objects.create('swf', data, Object.assign({ offset: off }, sz, at));
          }
          case 'ggb': {
            const b64 = await readAsB64(src);
            return GW.objects.create('ggb', { name: name.replace(/\.ggb$/i, ''), app: 'classic', base64: b64 }, Object.assign({ offset: off }, at));
          }
          case 'html': {
            if (isLocalPath(path)) {
              // 1.6.1 → 1.7.7：所在目录已由 importOne 开头的 allowPathDir 统一登记，
              // 否则 iframe 加载 app://gewu/_local/… 会被拒（ERR_ACCESS_DENIED），画面一片空白。
              const lr = GW.libRoot, data = { path, title: name };
              // 库内课件额外记一份相对库根的路径：板书换机器/换用户后还能按新库根找回来
              if (lr && (path.startsWith(lr + '\\') || path.startsWith(lr + '/'))) data.libRel = path.slice(lr.length + 1).replace(/\\/g, '/');
              return GW.objects.create('web', data, Object.assign({ offset: off }, at));
            }
            // 浏览器版：blob: URL 只在本次会话有效，写进 .gewu 重开就失效（WP2）。
            // 改成与 image / video 一致，把 HTML 正文存进文档资产，对象只记 asset id；
            // web kind 渲染时再用 GW.assets.url(asset) 现场生成同源 URL，保存/重开都能打开。
            const asset = GW.assets.put(await readAsB64(src), 'text/html', name);
            return GW.objects.create('web', { asset, title: name }, Object.assign({ offset: off }, at));
          }
          case 'doc': return GW.storage.open(path || src);
          case 'text': {
            const txt = typeof src === 'string' ? await window.gewu.readFile(src, 'utf8') : await src.text();
            const html = txt.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]).replace(/\n/g, '<br>');
            return GW.objects.create('text', { html, size: 28 / GW.camera.s }, Object.assign({ w: 700 / GW.camera.s, h: 400 / GW.camera.s, exact: true }, at));
          }
          case 'office':
            // R9：'office' 只对桌面有意义（静态页要靠本机 Office/WPS）。设置是随 .gewu / localStorage 走的，
            // 在桌面选过「静态页」再到手机上打开同一份设置，会把手机端唯一能走的路也挡掉。
            if ((ext === 'pptx' || ext === 'ppsx') && GW.pptx && (GW.settings.pptxMode !== 'office' || !GW.isElectron)) {
              try {
                progress('正在读取 PPT：' + name);
                return await GW.pptx.insert(src, name, Object.assign({ offset: off }, at));
              } catch (error) {
                if (!isLocalPath(path) || !can('officeToPdf') || GW.settings.officeAutoConvert === false || /切换了板书/.test(error.message)) throw error;
                GW.toast('PPT 原生导入失败，尝试用 Office/WPS 转成静态页：' + error.message, 5200);
              }
            }
            if (isLocalPath(path) && can('officeToPdf') && GW.settings.officeAutoConvert !== false) {
              const o = GW.objects.create('file', { path, name, ext }, Object.assign({ offset: off }, at));
              importer.officeToCanvas(path, o);
              return o;
            }
          // fallthrough
          default:
            // R2：原来只判 !path。安卓上 path 是 mem:// 句柄（非空），于是建出一张
            // 「▶ 打开」点下去只弹「这台设备无法打开本地程序」的死卡 —— 比直接说清楚更糟。
            // 这类设备根本没有能打开 doc/xls/ppt 的原生 App，明确拒绝并给出可执行的下一步。
            if (!path || isMemHandle(path)) {
              GW.toast('手机/网页版打不开 ' + (ext ? ext.toUpperCase() + ' ' : '') + '这类文件；请先转成 PDF 或图片再插入：' + name, 5200);
              return null;
            }
            return GW.objects.create('file', { path, name, ext }, Object.assign({ offset: off }, at));
        }
      } catch (e) {
        console.error(e);
        const msg = (e && e.message) ? String(e.message) : String(e);
        // WP2：别把「配额 / 文件过大 / 读取失败 / 格式不支持」一律吞成「导入失败」，老师没法自查
        let hint;
        if (/quota|配额|空间|ENOSPC|exceed/i.test(msg)) hint = '配额/空间不足：' + name + ' 未能写入，请先导出 .gewu 释放配额';
        else if (/too large|过大|超过|ALLOCATION|EMBED_LIMIT|文件太大/i.test(msg)) hint = '文件过大：' + name + ' 无法载入，请换较小的文件，或在桌面版以本机路径插入';
        else if (/ENOENT|EACCES|EPERM|ERR_ACCESS_DENIED|allowReadDir|readFile|读取|路径|找不到|不存在/i.test(msg)) hint = '文件读取失败：' + name + ' 的路径不可访问或已被移动，请重新选择文件';
        else if (/format|格式|decode|解析|unsupported|不支持|invalid|损坏/i.test(msg)) hint = '格式不支持或无法解析：' + name;
        else hint = '导入失败：' + name;
        GW.toast(hint + '（' + msg + '）', 4500);
      } finally { progress(null); }
    },
    async importFiles(list, at) {
      // T05：配额满了要先导出 .gewu —— 导入（含图片 / 视频 / PDF / 课件）一律先拦
      if (GW.quotaGuard && GW.quotaGuard('导入文件')) return;
      cascade = 0;
      for (const f of list) await importer.importOne(f, at);
    },
    async pick(filter) {
      const filters = {
        all: null,
        image: [{ name: '图片 / GIF', extensions: EXT.image }],
        pdf: [{ name: 'PDF', extensions: ['pdf'] }],
        video: [{ name: '视频 / 音频', extensions: EXT.video.concat(EXT.audio) }],
        swf: [{ name: 'Flash 动画', extensions: ['swf'] }],
        ggb: [{ name: 'GeoGebra', extensions: ['ggb'] }],
        html: [{ name: '网页 / 离线课件', extensions: ['html', 'htm'] }],
        pptx: [{ name: 'PowerPoint 课件', extensions: ['pptx', 'ppsx', 'ppt', 'pps'] }],
        office: [{ name: 'PPT / Word / Excel / WPS', extensions: EXT.office }],
        app: [{ name: '程序 / 快捷方式', extensions: ['exe', 'lnk', 'bat', 'url', 'cmd'] }],
      }[filter || 'all'];
      // 有原生多选就走原生（桌面能拿到真本机路径）；安卓 / 网页的 shim 里 openFiles 是 <input type=file>，
      // 拿到的只是 mem:// 句柄，所以两边都保留，只是优先原生。
      if (can('openFiles')) {
        // 桌面主进程只认 filters；安卓 / 网页的 shim（openFiles 内部是 <input type=file>）只认
        // extensions / ext 来拼 accept。两边都传：桌面忽略多余键，移动端的文件选择框才不会被限成「所有文件」。
        const fl = filters || [{ name: '所有支持的文件', extensions: ['*'] }];
        const paths = await window.gewu.openFiles({ purpose: 'insert', filters: fl, extensions: fl[0].extensions });
        if (paths.length) importer.importFiles(paths);
      } else {
        const inp = GW.h('input', { type: 'file', multiple: true, accept: filters ? filters[0].extensions.map((e) => '.' + e).join(',') : '' });
        inp.onchange = () => importer.importFiles([...inp.files]);
        inp.click();
      }
    },
    insertImageB64(b64, mime, name, at, off = 0) {
      // T05：插入图片 / 视频封面 / 截图都从这里落对象；配额满了先让老师导出
      if (GW.quotaGuard && GW.quotaGuard('插入图片')) return Promise.resolve(null);
      // F16：解码是异步的，落点必须是「发起导入时那一页」。以前不传页面，GW.objects.create
      // 默认取 GW.page() ⇒ 解码期间翻页就把图插到了新页上。
      const tk = pageTicket();
      const t = putTemp(b64, mime || 'image/png', name);
      const asset = t.id;
      return new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          // F16：目标页被删 / 换过文档 ⇒ 取消，并清掉这次新建的临时资产（否则会跟着 .gewu 存下去）
          if (!ticketOk(tk)) { dropTemp(t); res(null); return; }
          const k = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight)) / GW.camera.s;
          const w = (at && at.w) || img.naturalWidth * k, hh = (img.naturalHeight * w) / img.naturalWidth;
          res(GW.objects.create('image', { asset, name }, Object.assign({ offset: off }, at, { w, h: hh, exact: !!(at && at.w), page: tk.page })));
        };
        img.onerror = () => { dropTemp(t); GW.toast('图片无法解析：' + name); res(null); };
        img.src = GW.assets.url(asset);
      });
    },
    insertDataURL(dataUrl, name, at) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
      if (!m) return;
      return importer.insertImageB64(m[2], m[1], name || '截图', at);
    },
    async insertPdf(b64, name, at) {
      // F16：解析 PDF 也是异步的（loadPdf + getPage 都可能等上几百毫秒），落点必须是
      // 发起导入时那一页；以前走 GW.addItems ⇒ 落到解析完成时的当前页。
      const tk = pageTicket();
      const t = putTemp(b64, 'application/pdf', name);
      const asset = t.id;
      const pdf = await GW.loadPdf(asset);
      const n = pdf.numPages;
      progress('正在载入 ' + name + '：共 ' + n + ' 页');
      const first = await pdf.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      // 1.0.19：只落一个「册子」对象（屏幕上约 40% 宽），不再把 N 页竖着铺满画布。
      // 想一页页并排看时，册子标题栏上的「展开成单页」还能拆回去。
      const sw = Math.min(innerWidth * 0.38, 560);
      const W = sw / GW.camera.s;
      const H = (W * vp.height) / vp.width;
      const vc = GW.viewCenter();
      const x = at && at.x != null ? at.x : vc.x - W / 2;
      const y = at && at.y != null ? at.y : vc.y - H / 2;
      // F16：目标页被删 / 换过文档 ⇒ 取消，清掉这次新建的临时资产，别再往当前页塞
      if (!ticketOk(tk)) { dropTemp(t); return null; }
      const z0 = tk.page.objs.reduce((m, o) => Math.max(m, o.z || 0), 0);
      const obj = { id: GW.uid(), kind: 'obj', type: 'book', x, y, w: W, h: H, z: z0 + 1,
        data: { asset, name, page: 1, n, pc: n } };
      GW.addItemsOn(tk.page, [obj]);
      // 视图只对「仍然在眼前」的那一页聚焦；已经翻走的页别抢视口
      if (tk.page === GW.page()) GW.fitRect({ x: obj.x, y: obj.y, w: obj.w, h: obj.h }, 30);
      GW.toast('已导入 ' + name + '（' + n + ' 页）：点书上的箭头翻页，双击进项目空间逐页看');
      return obj;
    },
    insertWeb(url, title, opts = {}) {
      return GW.objects.create('web', Object.assign({ url, title: title || '' }, opts.data), opts);
    },
    insertSim(id, opts = {}) {
      const o = GW.objects.create('sim', { sim: id, state: {} }, opts);
      // 1.4.2：手机横屏只有 700~900 CSS px 宽，仿真按桌面默认尺寸（常见 900×600）落地后
      // 一半内容在屏幕外，新人第一眼看到的是「UI 太大、内容显示不出来」。插完直接把视图
      // 对准这个对象（focus 内部会留边并按视口算缩放），一屏就能看全。
      if (o && innerWidth < 900) { try { GW.objects.focus(o); } catch (e) {} }
      return o;
    },
    insertGgb(app, extra) {
      return GW.objects.create('ggb', Object.assign({ app }, extra || {}));
    },
    // PPT/Word → PDF → 页面
    async officeToCanvas(path, cardObj) {
      // 只有桌面主进程有 Office→PDF 转换（调本机 Office / WPS）。缺这个能力就直接退场，别留下挂着的提示。
      if (!can('officeToPdf')) {
        // 跨端口径：入口（对象卡片上的「⇩ 转为页面」）必须一直可见，点不到能力时要给一句说明，
        // 不能静默 return —— 否则安卓 / 网页版上老师点了没反应，以为是坏了。
        GW.toast('这台设备不能把该文件转成页面：转换要调本机 Office / WPS，只有桌面版有这个能力；手机与网页版请点「▶ 打开」用系统方式查看', 4600);
        return;
      }
      // 页数与文件名由 insertPdf 自己报（这里的 name / n 在 1.0.19 改册子时已经不在作用域里了）。
      // 这条路是 fire-and-forget 调用的（importOne 不 await 就返回，它自己的 finally 早就跑完了），
      // 所以收尾必须自己做：insertPdf 每导入一页都会写一次「正在载入 …：n/N」，
      // 它自己不清，这里不补 finally 的话，转换完那句提示会一直挂在屏幕上。
      try {
        const conv = await window.gewu.officeToPdf(path);
        progress(null);
        if (!conv || !conv.ok) {
          // 「挂住超时」和「没装 Office/WPS」是两回事，提示不能混为一谈：
          // 超时最常见的原因是 Office/WPS 已经有一个实例卡住，关掉它再试就好。
          GW.toast(conv && conv.why === 'timeout'
            ? '转换超时：Office / WPS 没有响应。关掉 Office / WPS 再试，或点「打开」用原软件放映'
            : '转换失败：未检测到 Microsoft Office 或 WPS。可点击「打开」用原软件放映', 4500);
          return;
        }
        const b64 = await window.gewu.readFile(conv.path, 'base64');
        const at = cardObj ? { x: cardObj.x + cardObj.w + 40 / GW.camera.s, y: cardObj.y } : null;
        await importer.insertPdf(b64, baseName(path), at);
      } catch (e) {
        // 原先这里没人接 Promise，转换/读文件/解析任何一步失败都是「静默不吭声 + 提示留在屏幕上」
        console.error(e);
        GW.toast('导入失败：' + baseName(path) + '（' + e.message + '）', 4000);
      } finally { progress(null); }
    },
  });

  // ---------- 拖放 ----------
  GW.initDrop = function () {
    const ov = GW.h('div', { id: 'drop-overlay' }, GW.h('div', null, GW.h('b', null, '松开即可导入'), GW.h('span', null, 'PDF · 图片 · GIF · 视频 · SWF · GeoGebra · PPT · Word · 网页 · 程序')));
    document.body.append(ov);
    let depth = 0;
    addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/uri-list')) { depth++; ov.classList.add('on'); e.preventDefault(); } });
    addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; ov.classList.remove('on'); } });
    addEventListener('dragover', (e) => e.preventDefault());
    addEventListener('drop', (e) => {
      e.preventDefault(); depth = 0; ov.classList.remove('on');
      const w = GW.toWorld(e.clientX, e.clientY);
      const files = [...e.dataTransfer.files];
      if (files.length) {
        const list = canLocalPath() ? files.map((f) => f.path || f) : files;
        importer.importFiles(list, { x: w.x, y: w.y });
        return;
      }
      const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (/^https?:/.test(url)) importer.insertWeb(url.trim(), '', { x: w.x, y: w.y });
    });
  };

  // ---------- 公式编辑器 ----------
  const TEMPLATES = [
    ['分式', '\\frac{a}{b}'], ['根式', '\\sqrt{x}'], ['n次根', '\\sqrt[n]{x}'], ['上标', 'x^{2}'], ['下标', 'a_{n}'],
    ['向量', '\\vec{F}'], ['向量AB', '\\overrightarrow{AB}'], ['求和', '\\sum_{i=1}^{n} a_i'], ['积分', '\\int_{a}^{b} f(x)\\,dx'], ['极限', '\\lim_{x \\to 0} \\frac{\\sin x}{x}'],
    ['导数', "f'(x)"], ['偏导', '\\frac{\\partial f}{\\partial x}'], ['方程组', '\\begin{cases} x+y=1 \\\\ x-y=3 \\end{cases}'], ['分段函数', 'f(x)=\\begin{cases} x^2, & x\\ge 0 \\\\ -x, & x<0 \\end{cases}'], ['矩阵', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'],
    ['集合', 'A=\\{x \\mid x>0\\}'], ['属于', '\\in'], ['并交', 'A\\cup B,\\ A\\cap B'], ['不等号', '\\le \\ \\ge \\ \\ne \\ \\approx'], ['角度', '\\angle ABC=90^\\circ'],
    ['三角', '\\sin^2\\alpha+\\cos^2\\alpha=1'], ['对数', '\\log_{a} b'], ['组合', '\\mathrm{C}_{n}^{k}=\\binom{n}{k}'], ['排列', '\\mathrm{A}_{n}^{k}'], ['概率', 'P(A\\mid B)=\\frac{P(AB)}{P(B)}'],
    ['牛二', 'F=ma'], ['动能定理', 'W=\\Delta E_k=\\frac{1}{2}mv_2^2-\\frac{1}{2}mv_1^2'], ['万有引力', 'F=G\\frac{Mm}{r^2}'], ['库仑定律', 'F=k\\frac{q_1q_2}{r^2}'], ['洛伦兹力', 'F=qvB,\\quad r=\\frac{mv}{qB}'],
    ['法拉第', 'E=n\\frac{\\Delta\\Phi}{\\Delta t}'], ['欧姆定律', 'I=\\frac{E}{R+r}'], ['质能方程', 'E=mc^2'], ['光电效应', 'E_k=h\\nu-W_0'], ['希腊字母', '\\alpha\\ \\beta\\ \\gamma\\ \\theta\\ \\lambda\\ \\mu\\ \\omega\\ \\Omega\\ \\varphi\\ \\Delta'],
  ];
  GW.formulaEditor = function (obj) {
    const tex0 = obj ? obj.data.tex : '';
    const ta = GW.h('textarea', { class: 'fx-src', spellcheck: 'false', placeholder: '输入 LaTeX，例如 \\frac{1}{2}mv^2' });
    ta.value = tex0;
    const prev = GW.h('div', { class: 'fx-prev' });
    const render = () => { try { window.katex.render(ta.value || '\\text{公式预览}', prev, { displayMode: true, throwOnError: false }); } catch (e) { prev.textContent = e.message; } };
    ta.addEventListener('input', render);
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    const insert = (t) => { const s = ta.selectionStart, e2 = ta.selectionEnd; ta.value = ta.value.slice(0, s) + t + ta.value.slice(e2); ta.focus(); ta.selectionStart = ta.selectionEnd = s + t.length; render(); };
    const tpl = GW.h('div', { class: 'fx-tpl' }, TEMPLATES.map(([n, t]) => {
      const b = GW.h('button', { title: t, onclick: () => insert(t) });
      try { window.katex.render(t, b, { throwOnError: false }); } catch (_) { b.textContent = n; }
      b.append(GW.h('small', null, n));
      return b;
    }));
    render();
    GW.dialog({
      title: obj ? '编辑公式' : '插入公式',
      width: 860,
      body: GW.h('div', { class: 'fx' }, prev, ta, tpl),
      ok: obj ? '更新' : '插入',
      onOk() {
        const tex = ta.value.trim();
        if (!tex) return;
        if (obj) { GW.objects.setData(obj, { tex }); GW.objects.update(obj); }
        else {
          const tmp = GW.h('div', { style: { position: 'absolute', visibility: 'hidden', fontSize: '48px' } });
          document.body.append(tmp);
          window.katex.render(tex, tmp, { displayMode: true, throwOnError: false });
          const w = tmp.scrollWidth + 20, hh = tmp.scrollHeight + 10;
          tmp.remove();
          GW.objects.create('formula', { tex, color: GW.tool.pen.color }, { w: w / GW.camera.s, h: hh / GW.camera.s, exact: true });
        }
      },
    });
    setTimeout(() => ta.focus(), 50);
  };
})();
