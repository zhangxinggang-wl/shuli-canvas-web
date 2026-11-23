/* 移动版桥接（浏览器里代替 Electron 的 preload）
 *
 * 桌面端这一点叫 main/preload.js：把主进程能力挂到 window.gewu。
 * 手机/平板浏览器里没有主进程，所以这里用浏览器能做到的方式补齐：
 *   - 选文件 / 读文件：<input type=file> + 内存句柄（和 importer 的 web 分支配合）
 *   - 保存 / 导出：直接下载（Blob + a[download]）
 *   - 联网识别：fetch 直连（服务端必须允许跨域，DeepSeek 允许；不允许就提示用网页版）
 *   - 其余桌面专属（窗口、GPU、屏幕截图、Office 转换、桌面批注）给安全空实现，避免报错。
 */
(() => {
  // 2.2.x：安卓外壳里 window.gewu.lan 那一组要发的桥消息（lanStart / lanPush…）从这里取。
  // ask 只在上面的 android_asset 分支作用域里，所以先存到 IIFE 这一层给后面用；
  // 纯网页版它恒为 null ⇒ 下面 stub 就不会有 lan（网页版只能「加入」，不能当主机）。
  let lanAsk = null;
  if (window.top === window && location.protocol === 'file:' && location.pathname === '/android_asset/www/index.html') {
    const pending = new Map();
    let seq = 0;
    let receivePort;
    const ready = new Promise((resolve) => { receivePort = resolve; });
    function connect(event) {
      if (!event.isTrusted || event.source !== null || event.data !== 'gewu-native-v1' || event.ports.length !== 1) return;
      window.removeEventListener('message', connect);
      const port = event.ports[0];
      port.onmessage = (message) => {
        let result;
        try { result = JSON.parse(message.data); } catch (_) { return; }
        // 原生主动推送（投屏状态）：没有 id，只有 event
        if (result && result.event === 'cast-state') {
          try {
            window.dispatchEvent(new CustomEvent('gewu-cast-state', { detail: { state: result.state, message: result.message } }));
          } catch (_) {}
          return;
        }
        // 2.2.0 手机自己当协同主机：远端 op 与连接数变化，交给页面自己监听
        if (result && result.event === 'lan-op') {
          try {
            window.dispatchEvent(new CustomEvent('gewu-lan-op', { detail: result.data }));
          } catch (_) {}
          return;
        }
        if (result && result.event === 'lan-clients') {
          try {
            window.dispatchEvent(new CustomEvent('gewu-lan-clients', { detail: result.n }));
          } catch (_) {}
          return;
        }
        // 2.2.x：安卓当主机时，LanHost 每接一条新 SSE 连接就发一次这个 —— 宿主据此推一份快照
        // （与桌面端 main/lansync.js 同一个机制，见 bindHost 里的 lan-need-snapshot）。
        if (result && result.event === 'lan-need-snapshot') {
          try {
            window.dispatchEvent(new CustomEvent('gewu-lan-need-snapshot'));
          } catch (_) {}
          return;
        }
        const done = pending.get(result.id);
        if (done) done(result.value);
      };
      receivePort(port);
    }
    window.addEventListener('message', connect);
    const ask = (op, args) => new Promise((resolve) => {
      const id = ++seq;
      const done = (value) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(value);
      };
      const timer = setTimeout(() => done(false), 10000);
      pending.set(id, done);
      ready.then((port) => {
        if (!pending.has(id)) return;
        try { port.postMessage(JSON.stringify({ id, op, ...args })); } catch (_) { done(false); }
      });
    });
    lanAsk = ask;   // 2.2.x：给后面 window.gewu.lan 那组用（同一个 ask，同一套 id/超时）
    window.gewuNative = {
      platform: () => 'android',
      saveFile: (name, data) => ask('saveFile', { name, data }),
      printPdf: (data, landscape) => ask('printPdf', { data, landscape }),
      toast: (text) => ask('toast', { text }),
      exit: () => ask('exit'),
      // 2.2.0 手机投屏：扫码 / 共享屏幕 / 停止 / 状态。
      // 摄像头那条走原生界面（CameraCastActivity），由 castScan 拿到 uri 后再决定，
      // 这里只透传 —— 网页不碰 SDP、不碰采集。
      cast: {
        scan: () => ask('castScan'),
        start: (uri) => ask('castStart', { uri }),
        // 摄像头投屏：uri 来自 castScan 扫到的配对码，原生拉起 CameraCastActivity
        camera: (uri) => ask('castCamera', { uri }),
        stop: () => ask('castStop'),
        state: () => ask('castState'),
        // 2.2.1：手机反过来当接收方（CastHost 明文 HTTP 信令 + CastRecvActivity 显示画面）
        recv: () => ask('castRecv'),
        host: () => ask('castHostInfo'),
      },
      // 2.2.0：手机自己当协同主机（LanHost）。start 回 {ok,port,code,url,ips}，
      // info 同形；push 把本机产生的 op 广播出去。
      lan: {
        start: (code) => ask('lanStart', { code }),
        stop: () => ask('lanStop'),
        info: () => ask('lanInfo'),
        push: (json) => ask('lanPush', { json }),
      },
    };
  }

  const mem = new Map();
  let lastName = '';
  const pickName = (p) => String(p || lastName || 'export.bin').split(/[\\/]/).pop();

  const b64ToBytes = (s) => {
    const bin = atob(String(s || '').replace(/^data:[^,]+,/, ''));
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  };
  const bytesToB64 = (buf) => {
    const u = new Uint8Array(buf);
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
    return btoa(s);
  };
  const download = (name, blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 8000);
  };

  const files = {
    open: (opts) => new Promise((res) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      // R3：桌面 open-files 认的是 multi，shim 原来只认 multiple —— storage.open 传 { multi: false }，
      // 于是「打开一份板书」在安卓上变成多选框、还只取数组第一个。两边都认，只有明确 false 才单选。
      const multiOpt = opts ? (opts.multi !== undefined ? opts.multi : opts.multiple) : undefined;
      inp.multiple = multiOpt !== false;
      const ext = (opts && (opts.extensions || opts.ext)) || [];
      if (ext.length) inp.accept = ext.map((e) => (String(e).startsWith('.') ? e : '.' + e)).join(',');
      inp.style.display = 'none';
      // 审计 F24：点「取消」时 change 不会触发，旧实现让 Promise 永不结束、隐藏 input 留在 DOM 里，
      // 后续导入流程就卡住。cancel 事件（Chromium 108 起支持）与「窗口重新获得焦点后的延时检查」
      // 两条路都汇到 finish，保证只完成一次、节点必被移除。
      let done = false;
      const openedAt = Date.now();
      const finish = (out) => {
        if (done) return;
        done = true;
        inp.onchange = null;
        inp.oncancel = null;
        window.removeEventListener('focus', onFocus);
        inp.remove();
        res(out);
      };
      const onFocus = () => {
        // 150ms 内的 focus 是干扰（部分 WebView 点 input 时就派发一次），不能当成「用户取消」；
        // 真正的取消一定发生在系统选择器关闭之后，远晚于这个窗口。
        if (Date.now() - openedAt < 150) return;
        setTimeout(() => {
          window.removeEventListener('focus', onFocus);
          if (!done && (!inp.files || !inp.files.length)) finish([]);
        }, 350);
      };
      inp.onchange = () => {
        const out = [];
        for (const f of inp.files) {
          // R1：随机段放前面、原文件名必须是最后一段。旧写法把原名塞在中间，
          // importer 的 baseName/extOf 会取到 'pptx-a1b2c3' 这种脏后缀 → catOf 落 'file' → 建出打不开的死卡。
          // 文件名保持原样（只把斜杠换掉）：它只是 Map 的键，不是 URL。若在这里 encodeURIComponent，
          // importer 的 baseName 会把「课堂课件.pptx」显示成 %E8%AF%BE%E4%BB%B6.pptx，老师看不懂。
          const key = 'mem://' + Math.random().toString(36).slice(2, 8) + '/' + String(f.name).replace(/[\\/]/g, '_');
          mem.set(key, f);
          out.push(key);
        }
        finish(out);
      };
      inp.oncancel = () => finish([]);
      window.addEventListener('focus', onFocus);
      document.body.appendChild(inp);
      inp.click();
    }),
    read: async (p, enc) => {
      const f = mem.get(p);
      if (!f) throw new Error('移动版读不到这个路径：' + p);
      if (enc === 'base64') return bytesToB64(await f.arrayBuffer());
      return f.text();
    },
  };

  // ---------- 网页 / 安卓做不到的能力：登记出来（给老师看的一句话原因） ----------
  // check-end-parity.js 认这一张表：登记过的名字算「已明确说明不支持」，不算缺失。
  // 注意：stub 里**不能**再定义同名键 —— 渲染层大量用 !!window.gewu.xxx 做能力探测，
  // 定义成空函数会凭空长出「看起来能用、其实点了没用」的坏按钮。
  const NOT_SUPPORTED = {
    phonecast: '网页版/安卓端不能当投屏主机，请在对端发起投屏',
    pcsend: '网页版/安卓端不能当投屏主机，请在对端发起投屏',
    pickDir: '浏览器不能替老师选本机文件夹；请先「另存为」.gewu，再在桌面版导出课件包',
    mkdirP: '浏览器不能在本机建目录；请先「另存为」.gewu，再在桌面版导出课件包',
    copyFile: '浏览器不能往本机拷贝文件；请先「另存为」.gewu，再在桌面版导出课件包',
    favWrite: '网页/安卓版长期收藏存在浏览器本地（gewu.fav 键），不写文件夹',
    favRead: '网页/安卓版长期收藏存在浏览器本地（gewu.fav 键），不写文件夹',
    favRemove: '网页/安卓版长期收藏存在浏览器本地（gewu.fav 键），不写文件夹',
    favList: '网页/安卓版长期收藏存在浏览器本地（gewu.fav 键），不写文件夹',
    // R10：这三项原来是「永远是 null 的空实现」—— !!window.gewu.officeToPdf 为真，
    // 于是渲染层把它当成「这台设备能转换 Office」，走到一半才失败（还建出打不开的死卡）。
    // 删掉真身、登记到这里，能力探测就会如实地判为「不支持」，走各自的降级分支。
    officeToPdf: '把 Office 文档转成页面要调本机 Office / WPS，只有桌面版有；手机请点「▶ 打开」用系统方式查看',
    // 2.2.5：PPT 烘焙同样要调本机 WPS/Office（把每个动画步骤的末态导出成 PNG）。
    // 网页/安卓端没有这条通道，PPT 一律走内置 canvas 渲染器（降级不报错）。
    pptBake: 'PPT 保真放映要调本机 WPS / Office 导出画面，只有桌面版有；手机/网页版按内置渲染器放映',
    pptBakeSweep: 'PPT 烘焙缓存目录只在桌面版存在',
    // 2.2.9：PPT 大文件（200MB 级）桌面端走「主进程文件句柄按需读 + 按需解压媒体」，
    // 浏览器/安卓只有内存里的 File/Blob，没有随机读句柄，也没地方落地解压出来的 MP4。
    // 登记为不支持，渲染层就会如实降级：整份读进内存解析，媒体文件提示「无法播放」。
    pptZipOpen: '按需读大文件要主进程文件句柄，只有桌面版有；手机/网页版会把 PPT 整体读进内存解析',
    pptZipRead: '按需读大文件要主进程文件句柄，只有桌面版有；手机/网页版会把 PPT 整体读进内存解析',
    pptZipClose: '按需读大文件要主进程文件句柄，只有桌面版有；手机/网页版会把 PPT 整体读进内存解析',
    pptMediaPack: 'PPT 里的视频要解压到本机缓存目录才能播放，只有桌面版有；手机/网页版提示「无法播放」',
    pptMediaSweep: 'PPT 视频缓存目录只在桌面版存在',
    // 2.2.9 OBS-A：页面日志改走主进程落盘。以前只能借 console.warn，而主进程只把
    // level>=2 的 console 记进日志文件 —— 于是投屏每 5 秒一条的正常采样全变成 WARN，
    // 真正的警告被淹没。网页/安卓端没有日志文件，退回 console.warn 即可。
    pageLog: '网页/安卓端没有主进程日志文件，页面日志只打到浏览器控制台',
    // 2.2.9 PPT-A：WMF/EMF 光栅化要调本机 GDI+（PowerShell + System.Drawing），只有桌面版有。
    // 手机/网页版按「不支持」如实登记，渲染层会把这类媒体如实标成占位，而不是假装画出来。
    pptRaster: 'WMF/EMF 转 PNG 要调本机 GDI+，只有桌面版有；手机/网页版按不支持处理',
    // 2.2.9 PPT-D：原版放映由本机 WPS/Office 自己跑，只有桌面版有入口。
    pptShowStart: '原版放映要调本机 WPS / Office，只有桌面版有；手机/网页版用内置渲染器放映',
    pptShowStop: '原版放映要调本机 WPS / Office，只有桌面版有',
    cacheUrl: '网页/安卓端不走桌面缓存目录，在线资源用浏览器 Cache API 缓存',
    cached: '网页/安卓端不走桌面缓存目录，在线资源用浏览器 Cache API 缓存',
  };

  // ---------- 浏览器侧的「落盘」替身：localStorage ----------
  // 桌面端这些能力落在 <userData> 下的文件与目录里；网页 / 安卓端没有可写的文件系统，
  // 统一落到 localStorage。这里用的全是新键（既有 gewu.settings / gewu.fav / gewu.autosave /
  // gewu.shapesSelf 等键的语义一个都不动）。
  const LS = {
    get(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } },
    set(key, val) { try { window.localStorage.setItem(key, val); return true; } catch (_) { return false; } },
    del(key) { try { window.localStorage.removeItem(key); return true; } catch (_) { return false; } },
  };
  const byteLen = (s) => {
    const t = String(s == null ? '' : s);
    try { return new TextEncoder().encode(t).length; } catch (_) { return t.length; }
  };
  // 名字只做最小消毒（不许斜杠、不许 ..）；真正的路径校验在桌面端主进程里
  const safeKeyName = (name) => String(name == null ? '' : name).replace(/[^\w.-]/g, '_').slice(0, 80) || 'item';

  // 一套「文件柜」：桌面端是一个目录，这里是 localStorage 里的一组键 + 一张元数据表。
  // 读不存在的名字要 reject（storage.js 靠 catch 判断「这份副本/收藏没了」）。
  const makeCabinet = (prefix, metaKey, human) => {
    const keyOf = (name) => prefix + safeKeyName(name);
    const meta = () => { try { const m = JSON.parse(LS.get(metaKey) || '{}'); return m && typeof m === 'object' ? m : {}; } catch (_) { return {}; } };
    const saveMeta = (m) => { LS.set(metaKey, JSON.stringify(m)); };
    return {
      dir: async () => human,
      write: async (name, text) => {
        const s = String(text == null ? '' : text);
        const size = byteLen(s);
        if (!LS.set(keyOf(name), s)) throw new Error(human + ' 已满，写不进去了');
        const m = meta();
        m[safeKeyName(name)] = { size: size, mtime: Date.now() };
        saveMeta(m);
        return size;
      },
      read: async (name) => {
        const t = LS.get(keyOf(name));
        if (t == null) throw new Error('这一份不在了：' + String(name));
        return t;
      },
      remove: async (name) => {
        LS.del(keyOf(name));
        const m = meta();
        delete m[safeKeyName(name)];
        saveMeta(m);
        return true;
      },
      list: async () => {
        const m = meta();
        return Object.keys(m).filter((n) => LS.get(prefix + n) != null).map((n) => ({
          name: n,
          size: Number(m[n] && m[n].size) > 0 ? Number(m[n].size) : 0,
          mtime: Number(m[n] && m[n].mtime) > 0 ? Number(m[n].mtime) : 0,
        }));
      },
    };
  };
  const backupCab = makeCabinet('gewu.bk.', 'gewu.bk-meta', '浏览器本地存储');

  // ---------- 打印：安卓交给原生打印服务，网页丢给浏览器自带的 PDF 阅读器 ----------
  const printPdf = async (b64, landscape) => {
    const nat = window.gewuNative;
    if (nat && typeof nat.printPdf === 'function') {
      try {
        const done = await nat.printPdf(String(b64 || ''), !!landscape);
        return done ? { ok: true, path: '系统打印服务' } : { ok: false, error: '安卓外壳没能打开打印服务' };
      } catch (e) {
        return { ok: false, error: '打印失败：' + ((e && e.message) || e) };
      }
    }
    let url = '';
    try { url = URL.createObjectURL(new Blob([b64ToBytes(b64)], { type: 'application/pdf' })); } catch (_) { url = ''; }
    if (!url) return { ok: false, error: '这个浏览器打不开 PDF，请改用「导出 PDF」' };
    const w = window.open(url, '_blank');
    if (!w) {
      try { URL.revokeObjectURL(url); } catch (_) {}
      return { ok: false, error: '浏览器拦住了新标签页，请允许弹出窗口，或改用「导出 PDF」' };
    }
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 60000);
    return { ok: true, path: '浏览器新标签页' };
  };

  // ---------- 流式对话：浏览器里直接 fetch + ReadableStream ----------
  // 与 preload 的 aiStream 同契约：onEvent 只收 {chunk} / {end}，错误走 resolve 的 {ok:false}。
  // 有流就逐片喂；没有 ReadableStream（老 WebView）就一次性取全文喂一次，绝不把调用方挂住。
  const aiStream = (req, onEvent) => {
    const emit = (m) => { try { if (typeof onEvent === 'function') onEvent(m); } catch (_) {} };
    const url = String((req && req.url) || '');
    if (!url) return Promise.resolve({ ok: false, error: '没有接口地址' });
    if (typeof fetch !== 'function') return Promise.resolve({ ok: false, error: '这个浏览器不支持直连联网，请用桌面版' });
    const body = b64ToBytes((req && req.body) || '');
    const ms = Math.min(300000, Math.max(30000, Number(req && req.timeout) || 120000));
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = 0;
    const stop = () => { if (timer) { clearTimeout(timer); timer = 0; } };
    if (ctrl) timer = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, ms);
    const headers = Object.assign({ 'Content-Type': (req && req.contentType) || 'application/json' }, (req && req.headers) || {});
    return fetch(url, { method: (req && req.method) || 'POST', headers: headers, body: body, signal: ctrl ? ctrl.signal : undefined })
      .then((r) => {
        if (!r.ok) {
          return r.text().then((t) => {
            stop(); emit({ end: true });
            return { ok: false, status: r.status, error: String(t || '').slice(0, 400) || ('HTTP ' + r.status) };
          });
        }
        if (!r.body || typeof r.body.getReader !== 'function') {
          return r.text().then((t) => {
            stop(); if (t) emit({ chunk: t }); emit({ end: true });
            return { ok: true, status: r.status };
          });
        }
        const reader = r.body.getReader();
        const dec = typeof TextDecoder === 'function' ? new TextDecoder('utf-8') : null;
        const pump = () => reader.read().then((step) => {
          if (step.done) { stop(); emit({ end: true }); return { ok: true, status: r.status }; }
          const piece = dec ? dec.decode(step.value, { stream: true }) : String.fromCharCode.apply(null, step.value);
          if (piece) emit({ chunk: piece });
          return pump();
        });
        return pump();
      })
      .catch((e) => {
        stop(); emit({ end: true });
        const msg = (e && e.name === 'AbortError') ? ('请求超时（' + Math.round(ms / 1000) + ' 秒）') : String((e && e.message) || e);
        return { ok: false, error: '联网失败（网页版直连，可能被浏览器的跨域策略拦下）：' + msg };
      });
  };

  // ---------- 屏幕常亮：Screen Wake Lock（安卓 WebView 与新版浏览器都支持，不支持的静默降级） ----------
  let wakeSentinel = null;
  const keepAwake = (on) => {
    const v = !!on;
    try {
      const nav = window.navigator;
      if (!nav || !nav.wakeLock || typeof nav.wakeLock.request !== 'function') return false;
      if (v) {
        if (wakeSentinel) return true;
        nav.wakeLock.request('screen').then((s) => {
          wakeSentinel = s;
          if (s && typeof s.addEventListener === 'function') s.addEventListener('release', () => { if (wakeSentinel === s) wakeSentinel = null; });
        }).catch(() => {});
        return true;
      }
      const s = wakeSentinel;
      wakeSentinel = null;
      if (s && typeof s.release === 'function') s.release();
      return true;
    } catch (_) { return false; }
  };

  // ---------- 计时结束提醒：页面内定时器 + 系统通知（响铃仍由 classtools 的 beep 负责） ----------
  const remindTimers = new Map();
  const remindApi = {
    set: (o) => {
      const id = String((o && o.id) || 'default');
      const at = Number(o && o.at) || 0;
      const prev = remindTimers.get(id);
      if (prev) clearTimeout(prev);
      remindTimers.delete(id);
      const wait = Math.max(0, at - Date.now());
      if (!wait) return { ok: true };
      try {
        const N = window.Notification;
        if (N && N.permission === 'default' && typeof N.requestPermission === 'function') N.requestPermission();
      } catch (_) {}
      const timer = setTimeout(() => {
        remindTimers.delete(id);
        try {
          const N = window.Notification;
          if (N && N.permission === 'granted') new N((o && o.title) || '提醒', { body: (o && o.body) || '' });
        } catch (_) {}
      }, wait);
      remindTimers.set(id, timer);
      return { ok: true };
    },
    clear: (id) => {
      const k = String(id || 'default');
      const t = remindTimers.get(k);
      if (t) clearTimeout(t);
      remindTimers.delete(k);
      return { ok: true };
    },
    info: () => null,
    list: () => [],
    hover: () => false,
    close: () => true,
    action: () => false,
  };

  // ---------- 桌面批注层：网页/安卓没有第二块透明置顶窗口 ----------
  const NO_OVERLAY = '网页版没有桌面批注层，请先把桌面截图贴进画布';
  const overlayApi = {
    open: () => false,
    close: () => true,
    confirmClose: () => true,
    pass: () => true,
    togglePass: () => false,
    state: () => null,
    desktopShot: () => Promise.resolve(null),
    save: () => Promise.resolve({ ok: false, error: NO_OVERLAY }),
    toCanvas: () => Promise.resolve({ ok: false, error: NO_OVERLAY }),
  };

  // ---------- 课程表：网页/安卓没有系统日历调度 ----------
  const NO_CAL = '课程表导入只在桌面版可用（网页/安卓端没有系统日历提醒）';
  const calendarApi = {
    importICS: () => Promise.resolve({ ok: false, error: NO_CAL }),
    info: () => Promise.resolve({ ok: false, error: NO_CAL }),
    clear: () => Promise.resolve({ ok: false, error: NO_CAL }),
  };

  // ---------- 提词窗：只在桌面版开第二块屏 ----------
  const presenterApi = { open: () => false, close: () => true, state: () => true, cmd: () => true };

  // ---------- 录课分片：安卓走原生保存进「下载」，网页直接下载 ----------
  const recBuf = { name: '录课.webm', parts: [], bytes: 0 };
  const recApi = {
    begin: async (p) => {
      recBuf.name = pickName(p) || '录课.webm';
      recBuf.parts = [];
      recBuf.bytes = 0;
      return { ok: true, path: String(p || '') };
    },
    chunk: async (u8) => {
      const v = (u8 && typeof u8.length === 'number') ? u8 : new Uint8Array(u8 || []);
      recBuf.parts.push(v);
      recBuf.bytes += v.length;
      return { ok: true, bytes: recBuf.bytes };
    },
    end: async () => {
      const bytes = recBuf.bytes;
      const name = recBuf.name;
      const blob = new Blob(recBuf.parts, { type: 'video/webm' });
      recBuf.parts = [];
      recBuf.bytes = 0;
      try {
        const nat = window.gewuNative;
        if (nat && typeof nat.saveFile === 'function') {
          const saved = await nat.saveFile(name, bytesToB64(await blob.arrayBuffer()));
          return saved ? { ok: true, bytes: bytes, path: String(saved) } : { ok: false, bytes: bytes, error: '安卓外壳没保存成功' };
        }
        download(name, blob);
        return { ok: true, bytes: bytes, path: '浏览器下载' };
      } catch (e) {
        return { ok: false, bytes: bytes, error: '录课文件收尾失败：' + ((e && e.message) || e) };
      }
    },
    list: async () => [],
  };

  window.gewu = {
    isElectron: false,
    platform: 'web',
    // —— 文件 ——
    openFiles: (opts) => files.open(opts),
    saveDialog: async (o) => { lastName = (o && o.defaultPath) || 'export.bin'; return lastName; },
    readFile: (p, enc) => files.read(p, enc),
    writeFile: async (p, data, enc) => {
      const name = pickName(p);
      // 安卓外壳里有 Java 桥，直接写进系统「下载」目录（WebView 不支持 blob 下载）
      if (window.gewuNative && typeof window.gewuNative.saveFile === 'function') {
        const b64 = enc === 'base64' ? String(data || '') : bytesToB64(new TextEncoder().encode(String(data ?? '')));
        const saved = await window.gewuNative.saveFile(name, b64);
        // R4：安卓原生的 saveFile 只能落到「下载」目录，回读不了。落地成功就把内容留在 mem 表里，
        // 这样 storage.save 写进 doc.path 的那串仍然能被 readFile 打开（「保存后再保存」不必重新挑文件）。
        if (saved) {
          // 回读走的是 readFile → f.arrayBuffer() / f.text()，所以这里只要一个同形状的轻量对象。
          // 故意不用 Blob：安卓外壳的 WebView 有它，但纯 Node 的守门脚本（check-android-bridge.js）
          // 的 vm 里没有 —— 一个只为了「保存后还能读回来」的缓存不该让测试环境跟着受累。
          if (enc === 'base64') {
            const bin = b64ToBytes(b64);
            mem.set(saved, {
              name: name, size: bin.length,
              arrayBuffer: async () => bin.buffer,
              text: async () => (typeof TextDecoder === 'function' ? new TextDecoder().decode(bin) : String.fromCharCode.apply(null, bin)),
            });
          } else {
            const str = String(data == null ? '' : data);
            mem.set(saved, {
              name: name, size: new TextEncoder().encode(str).length,
              arrayBuffer: async () => new TextEncoder().encode(str).buffer,
              text: async () => str,
            });
          }
        }
        return saved || false;
      }
      if (enc === 'base64') download(name, new Blob([b64ToBytes(data)]));
      else download(name, new Blob([String(data == null ? '' : data)], { type: 'text/plain;charset=utf-8' }));
      return true;
    },
    fileInfo: async (p) => { const f = mem.get(p); return f ? { name: f.name, size: f.size, path: p } : null; },
    pathOf: (f) => (f && f.path) || '',
    userPath: async () => '',
    listLibrary: async () => [],
    openLibraryDir: async () => false,
    fileIcon: async () => '',
    openPath: async () => false,
    showInFolder: async () => false,
    openExternal: async (u) => { try { window.open(u, '_blank', 'noopener'); } catch (_) {} return true; },
    // —— 桌面专属：安全空实现 ——
    win: async () => {},
    pendingOpen: async () => null,
    gpuStatus: async () => ({ ok: true, state: 'web' }),
    gpuRetry: async () => {},
    capturePage: async () => null,
    captureScreen: async () => null,
    desktopMode: async () => false,
    ball: async () => {},
    // —— 浏览器能做的落盘 / 打印 / 提醒（1.8.x：补齐到与桌面 preload 同一套能力名） ——
    // 落盘类统一写 localStorage 的新键，桌面端那套路径语义（<userData>/backups 等）在网页里不存在。
    printPdf: (b64, landscape) => printPdf(b64, landscape),
    aiStream: (req, onEvent) => aiStream(req, onEvent),
    keepAwake: (on) => keepAwake(on),
    remind: remindApi,
    presenter: presenterApi,
    overlay: overlayApi,
    calendar: calendarApi,
    updateCheck: async () => ({ ok: false, reason: '网页版不检查更新' }),
    updateOpen: async () => false,
    autolaunch: {
      get: async () => ({ supported: false, openAtLogin: false }),
      set: async () => ({ supported: false, openAtLogin: false }),
    },
    rendererError: (rec) => { try { console.warn('[gewu] 渲染层异常', rec); } catch (_) {} },
    sessionMark: (d) => { LS.set('gewu.session.last', JSON.stringify(d || {})); return true; },
    // —— 设置的第二份副本（桌面端是 <userData>/settings-backup.json） ——
    settingsWrite: (text) => {
      const s = String(text == null ? '' : text);
      if (!s || s.length > 4 * 1024 * 1024) return false;
      return LS.set('gewu.settings.file', s);
    },
    settingsBackupPath: () => '浏览器本地存储（localStorage 的 gewu.settings.file）',
    // —— 恢复副本环（桌面端是 <userData>/backups/ 目录） ——
    backupWrite: (name, text) => backupCab.write(name, text),
    backupRead: (name) => backupCab.read(name),
    backupRemove: (name) => backupCab.remove(name),
    backupList: () => backupCab.list(),
    backupDir: () => backupCab.dir(),
    // —— 自定义图形（桌面端是 <userData>/shapes-self.json；这里就用 shapeself.js 自己的 localStorage 键） ——
    shapeSelfRead: () => LS.get('gewu.shapesSelf') || '',
    shapeSelfWrite: (text) => LS.set('gewu.shapesSelf', String(text == null ? '' : text)),
    // —— 录课分片（安卓交给原生保存进「下载」，网页直接下载；桌面端才是流式落盘） ——
    recFile: recApi,
    // —— 屏幕源 / 本机目录 / GeoGebra：网页与安卓都没有主进程那套本地服务 ——
    deskSources: async () => [],
    pendingGgb: async () => null,
    ggbHttpBase: async () => null,
    ggbEnsure: async () => ({ ok: false, error: '网页/安卓端直接用随包预解压的 GeoGebra 目录' }),
    pkgRoot: async () => false,
    allowReadDir: () => Promise.resolve(false),
    libraryMeta: async () => ({}),
    // 引导页的进度本来就在 localStorage 的 gewu.onboard 键里；桌面 preload 没有这个方法，
    // 这里给一个空对象（渲染层只做能力探测，不会调它的方法）。
    onboard: {},
    // —— 宿主/客户端事件 ——
    // 原生 → 网页的事件在 shim 顶部被派成 window 上的 CustomEvent；lansync 的 bindHost 却走
    // window.gewu.on(通道)。这里做一次映射，只认协同用到的那三个通道，其余保持空实现
    // （以前这里是 () => {}，连 lan-op-in 都收不到，安卓当主机等于半瘫）。
    on: (ch, fn) => {
      const ev = { 'lan-op-in': 'gewu-lan-op', 'lan-clients': 'gewu-lan-clients', 'lan-need-snapshot': 'gewu-lan-need-snapshot' }[ch];
      if (!ev || typeof fn !== 'function') return () => {};
      const h = (e) => { try { fn(e && e.detail); } catch (_) {} };
      window.addEventListener(ev, h);
      return () => { try { window.removeEventListener(ev, h); } catch (_) {} };
    },
    // —— 协同（2.2.x：手机自己当主机，原生 LanHost） ——
    // 浏览器纯网页版没有 window.gewuNative ⇒ 这里根本没有 lan ⇒ lansync 的 has() 为 false，
    // 只能「加入」别的主机（与以前一致，网页版开不了服务）。
    lan: lanAsk ? {
      host: true,
      start: async (o) => JSON.parse(await lanAsk('lanStart', { code: (o && o.code) || '' }) || '{}'),
      stop: () => lanAsk('lanStop'),
      info: async () => JSON.parse(await lanAsk('lanInfo') || '{}'),
      // 原生 LanHost.push(json) 直接把这段 JSON 当一条消息广播出去，
      // 所以类型字段要自己带上（桌面端是主进程按参数分拣的，这里不行）。
      op: (op) => lanAsk('lanPush', { json: JSON.stringify({ type: 'op', op }) }),
      goto: (i) => lanAsk('lanPush', { json: JSON.stringify({ type: 'goto', i }) }),
      live: (m) => lanAsk('lanPush', { json: JSON.stringify({ type: 'live', m }) }),
      snapshot: (snap) => lanAsk('lanPush', { json: JSON.stringify({ type: 'snap', snap }) }),
      // LanHost 没有 /asset 路由 ⇒ 资产随快照一起带过去（applySnapshot 优先用 snap.assets[].data）
      assets: async () => true,
      lock: async () => true,
      zone: async () => true,
      join: null,
    } : null,
    // —— 联网识别：直接在浏览器里请求（跨域被拦时给出可读错误） ——
    ocrRequest: async (o) => {
      try {
        const r = await fetch(o.url, {
          method: o.method || 'POST',
          headers: o.headers || {},
          body: o.body == null ? undefined : b64ToBytes(o.body),
        });
        return { ok: r.ok, status: r.status, body: await r.text() };
      } catch (e) {
        return { ok: false, status: 0, body: '联网失败（移动版直连，可能被浏览器的跨域策略拦下）：' + (e && e.message ? e.message : e) };
      }
    },
  };
})();

// 离线缓存 + 版本闸门（1.7.1）
//
// 事故背景：平板浏览器里留着一份两个月前的 JS，老师报的「书写问题」在清空缓存后变化极大，
// 谁也没法判断到底改没改好。所以网页端从这一版起：**每次打开都校一次服务器版本**，
// 对不上就清缓存 + 自动重载一次（不依赖老师会手动清缓存）。
if (/^https?:$/.test(location.protocol)) {
  const BUILD_KEY = 'gewu.web.build';
  const reloadGuard = () => {
    const t = +(sessionStorage.getItem('gewu.reloadAt') || 0);
    if (Date.now() - t < 15000) return false;             // 15 秒内只自动重载一次，防止死循环
    sessionStorage.setItem('gewu.reloadAt', String(Date.now()));
    return true;
  };
  const hardReload = (why) => {
    if (!reloadGuard()) return;
    sessionStorage.setItem('gewu.reloadWhy', why || '');
    location.replace(location.pathname + '?v=' + Date.now());
  };
  const nukeCaches = async (keep) => {
    try {
      const reg = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (reg) reg.postMessage({ type: 'nuke', keep: keep || null });
    } catch (_) {}
    try {
      if (window.caches && caches.keys) {
        const ks = await caches.keys();
        // 审计 F11：只清本应用前缀（gewu-）的缓存。同域下别的路径的 CacheStorage 不是我们的，
        // 旧实现 caches.delete 全删会连带清掉同域其它教学应用的离线缓存。keep 是刚准备好的新缓存。
        await Promise.all(ks.filter((k) => String(k).indexOf('gewu-') === 0 && k !== keep).map((k) => caches.delete(k)));
      }
    } catch (_) {}
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => { reg.update().catch(() => {}); }).catch(() => {});
    // 新版本接管后**自动**重载（老版本只弹一句 toast，老师不会去手动刷）
    let once = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (once) return;
      once = true;
      hardReload('controllerchange');
    });
  }

  // 审计 F10：握手必须能区分「失败」和「换了新版本」。旧实现把网络错误合成为
  // {"version":"0.0.0"} 的 200 响应，页面当成功、再看出「版本不同」⇒ 清缓存 + reload，
  // 断网就被判成升级。现在：非 200 / ok:false / 版本号不像版本 ⇒ 直接 return（保留本地版本、
  // 不清缓存、不 reload）；只有拿到有效新版本、且新版本的入口页与桥接脚本都实取成功
  // （新缓存要真的能落下来）才原子切换：先记新记号，再清旧缓存，最后重载。
  const handshake = async () => {
    try {
      let j = null;
      try {
        const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!r || !r.ok) return;          // 网络失败 / SW 返回 503 ⇒ 判为失败，什么都不做
        j = await r.json();
      } catch (_) { return; }             // 请求或 JSON 解析失败 ⇒ 同上
      if (!j || j.ok === false) return;   // 服务端/中间层显式声明失败
      const ver = String(j.version || '').trim();
      // 版本号必须是 x.y.z；'0.0.0' 是旧 SW 合成失败响应用的哨兵值，一并排除。
      if (!/^\d+\.\d+\.\d+/.test(ver) || ver === '0.0.0') return;
      const stamp = String(j.build || j.v || '').trim();
      const cur = String((window.GW && window.GW.APP_VERSION) || '');
      const seen = [ver, stamp, cur].join('|');
      const prev = localStorage.getItem(BUILD_KEY);
      if (prev === seen) return;
      const probe = async (u) => {
        try {
          const res = await fetch(u + (u.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), { cache: 'no-store' });
          return !!(res && res.ok);
        } catch (_) { return false; }
      };
      // 新版本的关键资源取不到 ⇒ 服务器并没有真的换版本（或网络抖），保留本地版本，不清缓存、不重载。
      if (!(await probe('index.html')) || !(await probe('mobile-shim.js'))) return;
      let hasCache = false;
      try {
        hasCache = !!(window.caches && (await caches.keys()).filter((k) => String(k).indexOf('gewu-') === 0).length);
      } catch (_) {}
      // 真·第一次安装（没有旧构建记录、也没有本应用缓存）就只记一笔，不折腾。
      if (!prev && !hasCache) { localStorage.setItem(BUILD_KEY, seen); return; }
      // 记的是「重载之后的页面应有的记号」：页面版本等于服务器版本，避免新页面起来后又多清一遍。
      localStorage.setItem(BUILD_KEY, [ver, stamp, ver].join('|'));
      await nukeCaches();
      hardReload('version');
    } catch (_) {}
  };
  if (document.readyState === 'complete') setTimeout(handshake, 0);
  else window.addEventListener('load', () => setTimeout(handshake, 0));
}
