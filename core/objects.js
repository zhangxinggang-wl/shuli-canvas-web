/* 数理无限画布 · 画布对象（DOM 层）：图片、PDF、视频、网页、SWF、GeoGebra、仿真、文本、公式、文件卡片 */
(function () {
  'use strict';
  const GW = window.GW, h = GW.h;

  // ---------- 资源仓库（文档内嵌的二进制，base64） ----------
  // 复审 C12：缓存键不能只用 assetId —— 两份文档可能都有 `a1` 但字节不同（同一份源文件的修改版）。
  // 现在用「id|内容指纹」，并在文档切换时整体失效。
  const urlCache = {};
  const cacheKey = (id) => {
    const a = GW.doc.assets && GW.doc.assets[id];
    return a ? (id + '|' + (a.key || (a.data ? a.data.length : 0))) : '';
  };
  // F07：弱指纹（长度 + 首尾各 64 字符）只当候选索引，真正的同一性由 put() 里的完整内容比较判定。
  function assetKey(b64) {
    return b64.length + ':' + b64.slice(0, 64) + b64.slice(-64);
  }
  GW.assets = {
    put(b64, mime, name) {
      // F07：旧实现只拿「长度 + 首尾各 64 字符」当身份，两份长度相同、首尾相同、只有中段不同的
      // 内容（同模板改参数的 SVG/JSON、同页不同编号的 PDF）会被判成同一份资产，第二份实际引用的
      // 是第一份的字节。现在指纹只做候选索引，命中后必须逐字节比较完整内容。
      // 项目里 put() 是同步 API，所以不引入异步哈希（crypto.subtle 返回 Promise），只在同长候选上比。
      const key = assetKey(b64);
      for (const id in GW.doc.assets) {
        const a = GW.doc.assets[id];
        if (a && a.key === key && a.data === b64) return id;
      }
      const id = 'a' + GW.uid();
      GW.doc.assets[id] = { key, mime, name, data: b64 };
      return id;
    },
    bytes(id) {
      const a = GW.doc.assets[id];
      if (!a) return null;
      const bin = atob(a.data), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    },
    url(id) {
      const ck = cacheKey(id);
      if (!ck) return '';
      if (urlCache[ck]) return urlCache[ck];
      const a = GW.doc.assets[id], b = this.bytes(id);
      if (!b) return '';
      return (urlCache[ck] = URL.createObjectURL(new Blob([b], { type: a.mime || 'application/octet-stream' })));
    },
    // 打开/新建/协同换快照时调用：旧 Blob URL 与 PDF 文档必须失效，否则会拿上一份文档的同名资产
    reset() {
      for (const k in urlCache) { try { URL.revokeObjectURL(urlCache[k]); } catch (e) { /* 已失效 */ } delete urlCache[k]; }
      for (const k in pdfDocs) delete pdfDocs[k];
      if (GW.docs && GW.docs.reset) GW.docs.reset();   // 解码缓存与绘制器一起作废（见文件后半段的 GW.docs）
    },
    // 清理没有被任何页面引用的资源
    gc() {
      const used = new Set();
      for (const p of GW.doc.pages) for (const o of p.objs) if (o.data && o.data.asset) used.add(o.data.asset);
      for (const id in GW.doc.assets) if (!used.has(id)) delete GW.doc.assets[id];
    },
  };
  // 本机文件 → 可嵌进画布的 URL。网页对象在创建 iframe 时另行隔离外来脚本。
  // 老 .gewu 里存的 local://file/… 仍然能开（主进程保留 local 通道），只是不同源、批注注入不进去。
  // 编码规则必须与 main/apppath.js 的 appLocalUrl() 一致。
  GW.fileURL = (p) => {
    // app://gewu 只由桌面主进程注册；安卓 WebView / 纯网页里没有它，原样返回就好。
    // 判桥自己的标记（window.gewu.isElectron）而不是只看 GW.isElectron：两者在生产里等价
    // （kit.js:67 就是由它推出的），但页面探针/instrument 只会改 GW.isElectron，两处都认更稳。
    if (!(window.gewu && window.gewu.isElectron === true) && GW.isElectron !== true) return p;
    return 'app://gewu/_local/' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  };

  // ---------- 对象类型注册 ----------
  // kind: { title(o), chrome:'window'|'bare', create(o, body, el) → {destroy?, onView?, serialize?}, minW, minH, keepAspect }
  const kinds = (GW.kinds = {});
  GW.defineKind = (name, def) => (kinds[name] = Object.assign({ chrome: 'window', minW: 80, minH: 60 }, def));

  const els = new Map(); // id → element

  function setTitle(o, text) {
    o._kindTitle = text;
    if (o._title) o._title.textContent = (o.locked ? '🔒 ' : '') + text;
  }
  function layout(o, el) {
    // 用 transform 定位而不是 left/top：拖动项目时是合成层平移，不会每帧触发一次
    // 布局 + 内嵌 iframe 重绘（拖动时项目「短暂消失」就是那笔开销）。
    el.style.transform = 'translate3d(' + o.x + 'px,' + o.y + 'px,0)';
    el.style.width = o.w + 'px'; el.style.height = o.h + 'px';
    const locked = !!o.locked;
    el.classList.toggle('locked', locked);
    // 锁定位置的对象默认「不接收指针事件」：手指落在它的区域里就是落在画布上 ——
    // 笔可以直接在上面写字（笔迹画在对象层之上），交互模式拖动则是移动整块画布。
    // 标题栏（含解锁按钮）与对象内容里的输入控件仍然保持可点。
    el.classList.toggle('pe-through', locked);
    // 1.7.1（T08）：挂了链接的对象，鼠标移上去给一个「可点」的指针（具体样式见 app.css 的 .obj.has-link）
    el.classList.toggle('has-link', !!(o.data && o.data.link));
    if (locked !== undefined && o._kindTitle != null) setTitle(o, o._kindTitle);
    pageClip(o, el);
  }
  // 1.7.5-03：分页版式下插入的项目必须被纸框**裁住**（以前只按中心切 visibility，
  // 项目跨过纸边时整块内容露在纸外）。
  // 2.0.8：纸框不再是显示/交互边界 —— 对象跨纸边照常整块显示、照常可点可拖，
  // 与无限画布一致。函数保留（layout / syncPagedObjects / 老存档切换都在调），
  // 唯一作用是**清掉旧版本可能留在元素上的 clip-path**，否则升级后那一刀会一直留着。
  function pageClip(o, el) {
    const body = o._body;
    if (!body) return;
    if (body.style.clipPath) body.style.clipPath = '';
  }

  // ---------- 网页课件「停车位」（1.7.12：翻页重载把整块画布卡死） ----------
  // 现象：翻到放着网页课件的那一页，界面直接无响应（主进程日志「窗口无响应」，之后渲染进程被回收）。
  // 原因：gotoPage 以前走 unmountAll()，web 的 destroy() 把 iframe 导航到 about:blank，
  // 翻回来再新建 iframe 重新加载同一份课件 —— 3 MB 级的单文件课件**第二次加载**会在渲染进程里
  // 把自己转死（实测：讲卷 3.3 MB，第二次加载 60 秒无响应，同一份文件在浏览器里单开却正常）。
  // 修法：翻页不销毁这些「重」对象，把整块 DOM（含活着的 iframe / 视频）寄存在停车场，
  // 翻回来原样挂回去 —— 页面一辈子只解析一次，翻页也不再重新缓冲。
  const PARK_KINDS = { web: 1, swf: 1, video: 1 };
  const PARK_MAX = 4;
  const parked = new Map();          // id → { el, sig, inst }
  function parkSig(o) {
    const d = o.data || {};
    const bg = GW.simBackground.normalize(d.simBackground);
    return [o.type, d.url, d.path, d.libRel, d.asset, d.work, d.sandbox ? 1 : 0, d.preset || '', bg?.color, bg?.style].join('|');
  }
  function parkDrop(id, destroy) {
    const rec = parked.get(id);
    if (!rec) return false;
    parked.delete(id);
    if (destroy) { try { rec.inst && rec.inst.destroy && rec.inst.destroy(); } catch (e) { console.error(e); } }
    rec.el.remove();
    return true;
  }
  function parkClear() { for (const id of [...parked.keys()]) parkDrop(id, true); }
  function parkOne(o) {
    if (parked.has(o.id)) return true;             // 已经停着了（连续换页时会再来一遍），别再动它
    const el = els.get(o.id);
    if (!el || !PARK_KINDS[o.type]) return false;
    const sig = parkSig(o);
    try { o._inst && o._inst.park && o._inst.park(); } catch (e) { console.error(e); }
    el.remove();                                   // 只摘 DOM，不调 destroy：iframe 不导航、视频不停在换 src 上
    els.delete(o.id);
    parked.set(o.id, { el, sig, inst: o._inst || null });
    delete o._el; delete o._body; delete o._title; delete o._inst; delete o._headH;
    while (parked.size > PARK_MAX) parkDrop(parked.keys().next().value, true);
    return true;
  }

  function mount(o) {
    if (els.has(o.id)) return;
    const k = kinds[o.type];
    if (!k) { console.warn('未知对象类型', o.type); return; }
    // 停车场里有同 id 的旧实例：数据没变就原样挂回去（不重新加载课件）
    const rec = parked.get(o.id);
    if (rec) {
      parked.delete(o.id);
      if (rec.sig === parkSig(o)) {
        const el = rec.el;
        o._el = el; o._body = el.querySelector('.obj-body'); o._title = el.querySelector('.obj-title');
        o._inst = rec.inst || {};
        els.set(o.id, el);
        layout(o, el);
        GW.worldEl.append(el);
        const head = el.querySelector('.obj-head');
        o._headH = (head && head.offsetHeight) || 0;
        pageClip(o, el);
        return;
      }
      // 数据换了（改网址 / 换文件）：旧实例没用了，销毁重建
      try { rec.inst && rec.inst.destroy && rec.inst.destroy(); } catch (e) { console.error(e); }
      rec.el.remove();
    }
    const title = h('span', { class: 'obj-title' }, k.title ? k.title(o) : o.type);
    o._kindTitle = title.textContent;
    const btns = h('div', { class: 'obj-btns' });
    const head = h('div', { class: 'obj-head' }, h('span', { class: 'obj-grip', html: GW.icon('move') }), title, btns);
    const body = h('div', { class: 'obj-body' });
    const grip = h('div', { class: 'obj-resize', html: GW.icon('resize') });
    const el = h('div', { class: 'obj chrome-' + k.chrome + ' type-' + o.type, 'data-id': o.id }, head, body, grip);
    // 2.0.7（R2/C1）：模板对象带 data-tpl="1"，工具条的一键开关按它批量切 locked
    if (o.tpl || (o.data && o.data.tpl)) el.setAttribute('data-tpl', '1');
    const addBtn = (icon, tip, fn, cls) => {
      const b = h('button', { class: 'obj-btn ' + (cls || ''), title: tip, html: GW.icon(icon) });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); });
      btns.append(b);
      return b;
    };
    o._el = el; o._title = title; o._body = body;
    if (k.headButtons) k.headButtons(o, addBtn);
    // 1.0.16：单页视图入口（导入的 PDF/PPT 一页一个对象，点它就只看得见这一页）
    if (GW.space) addBtn('maximize', '进入项目空间：只显示这一页，Esc 退出', () => GW.space.enter(o));
    // 册子：拆成一个个单页对象（老习惯、或要在画布上并排比页时用）
    if (o.type === 'book' && GW.books) addBtn('pages', '展开成单页对象（Ctrl+Z 收回册子）', () => GW.books.expand(o));
    // 1.3.0：每个项目都能就地接一个 AI 节点（以它的内容为输入写提示词）
    if (GW.nodes && o.type !== 'node') addBtn('star', '在这个项目旁边新开一个 AI 节点', () => GW.nodes.fromObject(o));
    addBtn('focus', '铺满屏幕', () => GW.objects.focus(o));
    const lockBtn = addBtn(o.locked ? 'lock' : 'unlock', '锁定位置：锁定后可在项目区域内直接书写，拖动则移动整块画布', (b) => {
      const before = GW.clone(o); o.locked = !o.locked;
      b.innerHTML = GW.icon(o.locked ? 'lock' : 'unlock');
      layout(o, el); GW.commit({ update: [{ before, after: o }] });
      GW.toast(o.locked ? '已锁定位置：可直接在该项目上书写' : '已解锁：可拖动、缩放该项目', 2000);
    });
    o._lockBtn = lockBtn;
    // 1.7.1（T08）：挂了链接的对象在标题栏给一个小链图标。**不用双击打开链接** ——
    // 文本对象的双击是「进编辑」，拿它当打开手势会把老师最常用的动作抢走；
    // 链接只走这个明确入口和右键菜单的「打开链接」。
    if (o.data && o.data.link) addBtn('link', '打开链接：' + o.data.link, () => GW.objLink.open(o), 'lnk');
    addBtn('front', '置于顶层', () => GW.objects.toFront(o));
    addBtn('close', '删除', () => GW.objects.remove(o), 'danger');
    setTitle(o, o._kindTitle);
    layout(o, el);
    GW.worldEl.append(el);
    // 1.7.5-03：标题栏高度要挂进 DOM 之后才量得准（上面那次 layout 在 append 之前，
    // 量出来是 0，会让裁剪把内容多切掉一条），量一次缓存起来给后续 pageClip 用。
    o._headH = head.offsetHeight;
    pageClip(o, el);
    els.set(o.id, el);
    try { o._inst = k.create(o, body, el) || {}; } catch (e) { console.error(e); body.append(h('div', { class: 'obj-error' }, '加载失败：' + e.message)); o._inst = {}; }
    bindFrame(o, el, head, grip, body, k);
  }
  function unmount(o, keep) {
    // 翻页（keep）= 停车，不销毁；真删对象 / 换文档才走下面的销毁
    if (keep && parkOne(o)) return;
    parkDrop(o.id, true);
    const el = els.get(o.id);
    if (!el) return;
    try { o._inst && o._inst.destroy && o._inst.destroy(); } catch (e) { console.error(e); }
    el.remove(); els.delete(o.id);
    delete o._el; delete o._inst; delete o._body; delete o._title;
  }
  function update(o) {
    const el = els.get(o.id);
    if (!el) { remount(o); return; }
    // 标题是惰性计算的，内容变了要重新取一次（例如网页加载完才知道标题）
    const k = kinds[o.type];
    if (k && k.title) setTitle(o, k.title(o));
    layout(o, el);
    o._inst && o._inst.onUpdate && o._inst.onUpdate();
  }
  // 元素不在 DOM 上时的「更新」= 重新挂载（例如撤销到另一个页面上的对象）
  function remount(o) {
    // 1.7.6：旧实例必须先销毁，再挂新实例。原来只 remove DOM 并覆盖 o._inst，
    // 上一轮的 RAF / ResizeObserver / 总线订阅 / 可见性监听会残留（泄漏 + 双份绘制）。
    if (els.has(o.id)) unmount(o);
    else {
      try { o._inst && o._inst.destroy && o._inst.destroy(); } catch (e) { console.error(e); }
      delete o._inst;
    }
    mount(o);
  }

  // 1.7.0（T15）：教师批注一键隐藏。评论钉是 DOM 元素（挂在 #world 里），不走墨迹层的 drawItem，
  // 所以隐藏必须在这里做：把带 data.teacher 的评论钉整体 display:none —— 数据一个字节都不动，
  // 导出/搜索/撤销照旧，随时把开关打开就回来（投影给学生看时用）。
  let lastTeacherHide = null;
  GW.applyTeacherAnnot = function (force) {
    const hide = !!(GW.settings && GW.settings.teacherAnnot === false);
    if (!force && hide === lastTeacherHide) return hide;
    lastTeacherHide = hide;
    const d = GW.doc;
    if (!d || !d.pages) return hide;
    for (const p of d.pages) {
      for (const o of (p.objs || [])) {
        if (o.type !== 'comment' || !o._el) continue;
        o._el.style.display = (hide && o.data && o.data.teacher) ? 'none' : '';
      }
    }
    return hide;
  };

  // ---------- 框架交互：拖动标题栏移动，右下角缩放 ----------
  function bindFrame(o, el, head, grip, body, k) {
    const dragFrom = (handle, mode) => handle.addEventListener('pointerdown', (e) => {
      if (GW.tool.current !== 'hand' && GW.tool.current !== 'select') return;
      if (e.button > 0) return;
      // 卡片里的按钮/输入框要自己吃掉这一下：拖拽一旦 setPointerCapture，Chromium 会把随后的
      // click/dblclick 重新定向到捕获元素（实测 pointerdown 落在图标 IMG 上、click 的 target 却成了
      // .obj-body），按钮的 onclick 就永远不触发 —— 表现正是「单击没反应、必须双击」。
      if (mode === 'move' && e.target !== handle && e.target.closest('button, input, textarea, select, a')) return;
      e.stopPropagation(); e.preventDefault();
      GW.objects.activate(o);
      // 锁定位置：移动与缩放都不响应，指针交给画布 —— 老师可以直接在课件上写字，
      // 也可以按住它的区域把整块画布拖走（笔迹留在内容上方）
      if (o.locked) { GW.toast('该项目已锁定位置：点标题栏的锁，或用「选择」工具选中后在工具条上解锁', 2400); return; }
      const before = GW.clone(o), sx = e.clientX, sy = e.clientY, s = GW.camera.s;
      const ox = o.x, oy = o.y, ow = o.w, oh = o.h, ratio = o.w / o.h;
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add('dragging-obj');
      const mv = (ev) => {
        const dx = (ev.clientX - sx) / s, dy = (ev.clientY - sy) / s;
        if (mode === 'move') { o.x = ox + dx; o.y = oy + dy; }
        else {
          o.w = Math.max(k.minW, ow + dx);
          o.h = k.keepAspect || ev.shiftKey ? o.w / ratio : Math.max(k.minH, oh + dy);
        }
        layout(o, el);
        if (mode !== 'move' && o._inst.onResize) o._inst.onResize();
        // 1.2.0 协同：拖动/缩放过程中对端跟着动（只在松手时提交，历史里仍是一条 update）
        if (GW.netLive) GW.netLive('o', { id: o.id, x: o.x, y: o.y, w: o.w, h: o.h });
      };
      const up = () => {
        handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
        document.body.classList.remove('dragging-obj');
        if (o.x !== ox || o.y !== oy || o.w !== ow || o.h !== oh) { GW.commit({ update: [{ before, after: o }] }); GW.requestRender(); }
        if (mode !== 'move' && o._inst.onResize) o._inst.onResize();
      };
      handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
    dragFrom(head, 'move');
    dragFrom(grip, 'resize');
    // 无交互内容的对象（图片、PDF页）整个都可拖动
    if (k.chrome === 'bare' && !k.editable) dragFrom(body, 'move');
    // 对象内的操作不要触发画布平移（锁定的对象整个让位，这里不拦）
    body.addEventListener('pointerdown', (e) => { if (o.locked) return; if (GW.tool.current === 'hand') { GW.objects.activate(o); e.stopPropagation(); } });
    body.addEventListener('wheel', (e) => { if (k.chrome === 'window' && !e.ctrlKey) e.stopPropagation(); }, { passive: true });
  }

  let active = null;
  GW.objects = {
    mount, unmount, update, pageClip,
    unmountAll() { for (const p of GW.doc.pages) for (const o of p.objs) unmount(o); els.forEach((el) => el.remove()); els.clear(); parkClear(); },
    // 换页专用：网页 / Flash / 视频停进停车场，翻回来直接挂回去（见上面的停车场注释）
    parkAll() { for (const p of GW.doc.pages) for (const o of p.objs) unmount(o, true); els.forEach((el) => el.remove()); els.clear(); },
    el: (o) => els.get(o.id),
    byId: (id) => GW.page().objs.find((o) => o.id === id),
    activate(o) {
      if (active === o) return;
      if (active && active._el) active._el.classList.remove('active');
      active = o;
      if (o && o._el) o._el.classList.add('active');
    },
    deactivate() { this.activate(null); },
    // 新建对象：默认放在视野中心，大小按屏幕比例自适应
    create(type, data, opts = {}) {
      const k = kinds[type];
      const vc = GW.viewCenter(), s = GW.camera.s;
      let w = opts.w || (k.defaultSize ? k.defaultSize(data).w : 800), hh = opts.h || (k.defaultSize ? k.defaultSize(data).h : 520);
      // 太大时缩到屏幕的 80%
      const maxW = (innerWidth * 0.8) / s, maxH = (innerHeight * 0.78) / s;
      if (!opts.exact && (w > maxW || hh > maxH)) { const f = Math.min(maxW / w, maxH / hh); w *= f; hh *= f; }
      const page = opts.page || GW.page();
      const z = page.objs.reduce((m, x) => Math.max(m, x.z || 0), 0) + 1;
      const o = { id: GW.uid(), kind: 'obj', type, x: opts.x != null ? opts.x : vc.x - w / 2, y: opts.y != null ? opts.y : vc.y - hh / 2, w, h: hh, z, data: data || {} };
      // 2.0.7（R2）：locked 透传（以前忽略这个字段 ⇒ 整页模板对象永远挡笔）。
      // tpl=1 是「模板对象」标记，供 C1 一键切换锁定；落盘走 data.tpl（顶层 tpl 也留一份给旧读法）。
      if (opts.locked) o.locked = true;
      if (opts.tpl) { o.tpl = 1; o.data.tpl = 1; }
      if (opts.offset) { o.x += opts.offset; o.y += opts.offset; }
      if (opts.autoEdit) o._autoEdit = true;
      GW.addItemsOn(page, [o], opts.record !== false);
      this.activate(o);
      return o;
    },
    remove(o) {
      if (active === o) active = null;
      GW.removeItems([o]);
      GW.bus.emit('objremove', o);
    },
    toFront(o) {
      const page = GW.page(), before = GW.clone(o);
      o.z = page.objs.reduce((m, x) => Math.max(m, x.z || 0), 0) + 1;
      page.objs.splice(page.objs.indexOf(o), 1); page.objs.push(o);
      GW.worldEl.append(o._el);
      GW.commit({ update: [{ before, after: o }] });
    },
    // 1.6.6（T07）：右键菜单要有「置于底层」。z 取全场最小再减一，DOM 也 prepend，
    // 两套顺序（z 排序与 DOM 顺序）必须一起动，否则下一次重排会被 z 又压回上面。
    toBack(o) {
      const page = GW.page(), before = GW.clone(o);
      o.z = page.objs.reduce((m, x) => Math.min(m, x.z || 0), 0) - 1;
      page.objs.splice(page.objs.indexOf(o), 1); page.objs.unshift(o);
      if (o._el) GW.worldEl.prepend(o._el);
      GW.commit({ update: [{ before, after: o }] });
    },
    focus(o) { GW.fitRect({ x: o.x, y: o.y - 46 / GW.camera.s, w: o.w, h: o.h + 46 / GW.camera.s }, 24); },
    // 修改对象数据并记录历史
    setData(o, patch) {
      const before = GW.clone(o);
      Object.assign(o.data, patch);
      GW.commit({ update: [{ before, after: o }] });
    },
  };

  // ---------- 对象挂链接（1.7.1 T08） ----------
  // data.link 是一个字符串 URL，跟着 .gewu 走（旧版本读到不认识的字段直接忽略）。
  // 只认 http(s)：javascript: / file: / data: 一律拒绝 —— 打开动作走应用内网页浮层
  // （GW.htmlFull），**绝不 <a href>**：Electron 里那样点一下会把整个应用导航走。
  GW.objLink = {
    valid(url) { return /^https?:\/\/[^\s]+$/i.test(String(url == null ? '' : url).trim()); },
    of(o) { return (o && o.data && typeof o.data.link === 'string' && o.data.link) || ''; },
    set(o, url) {
      if (!o || o.kind !== 'obj') return false;
      const u = String(url == null ? '' : url).trim();
      if (!this.valid(u)) { GW.toast('只支持 http:// 或 https:// 开头的网址', 2600); return false; }
      const before = GW.clone(o);
      o.data = o.data || {};
      o.data.link = u;
      GW.commit({ update: [{ before, after: o }] });
      // commit 之后页面里那一项是克隆出来的新对象，原引用已经不在文档里了：按 id 重取再重挂，
      // 否则标题栏的链图标不会出现（布局与按钮是 mount 时一次性建好的）。
      const fresh = GW.page().objs.filter((x) => x.id === o.id)[0];
      if (fresh) { remount(fresh); GW.selection.set([fresh]); }
      GW.markDirty();
      GW.toast('已挂上链接：' + u, 2400);
      return true;
    },
    clear(o) {
      if (!o || o.kind !== 'obj' || !this.of(o)) { GW.toast('这个对象还没有链接', 2200); return false; }
      const before = GW.clone(o);
      delete o.data.link;
      GW.commit({ update: [{ before, after: o }] });
      const fresh = GW.page().objs.filter((x) => x.id === o.id)[0];
      if (fresh) { remount(fresh); GW.selection.set([fresh]); }
      GW.markDirty();
      GW.toast('已去掉链接', 2000);
      return true;
    },
    open(o) {
      const u = this.of(o);
      if (!u) { GW.toast('这个对象还没有链接', 2200); return false; }
      if (!this.valid(u)) { GW.toast('链接不是 http(s) 地址，已拒绝打开', 2600); return false; }
      if (!GW.htmlFull) { GW.toast('当前环境打不开网页浮层', 2400); return false; }
      GW.htmlFull(u, (o.data && (o.data.name || o.data.title)) || '链接');
      return true;
    },
    ask(o) {
      const cur = this.of(o);
      const ask = GW.prompt ? GW.prompt('链接地址（只支持 http:// 或 https://）', cur) : Promise.resolve(null);
      Promise.resolve(ask).then((v) => { if (v == null) return; this.set(o, v); });
    },
  };

  // ---------- 图片裁剪（1.7.1 T09） ----------
  // 图上盖一个矩形框 + 8 个手柄，框外压半透明遮罩；确定后把 data.src 换成裁好的 dataURL，
  // 对象 w/h 同比缩。**裁剪不可撤销**，所以确认条上直接写死这句话。
  // 编码：裁出来的区域真有透明像素才保持 PNG，否则 image/jpeg 0.85（体积小一个数量级）。
  // 拖满全图 = 什么都没裁 ⇒ 不重编码，一个字节都不动（否则每点一次画质掉一次）。
  let cropUI = null;
  GW.cropImage = function (o) {
    if (!o || o.type !== 'image') { GW.toast('只有图片对象可以裁剪', 2200); return false; }
    if (cropUI) { cropUI.close(); cropUI = null; }
    const src = o.data && (o.data.asset ? GW.assets.url(o.data.asset) : o.data.src);
    if (!src) { GW.toast('这张图片没有可裁剪的源', 2400); return false; }
    const img = new Image();
    img.onload = () => { cropUI = openCrop(o, img, src); };
    img.onerror = () => GW.toast('图片读不出来，没法裁剪（外链失效？）', 2600);
    img.src = src;
    return true;
  };

  function openCrop(o, img, src) {
    const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
    if (!nw || !nh) { GW.toast('图片尺寸读不出来', 2400); return null; }
    const el = o._el;
    const R = el ? el.getBoundingClientRect() : { left: 0, top: 0, width: o.w * (GW.camera.s || 1), height: o.h * (GW.camera.s || 1) };
    const base = { l: R.left, t: R.top, w: Math.max(1, R.width), h: Math.max(1, R.height) };
    const box = { l: base.l, t: base.t, w: base.w, h: base.h };
    const ov = h('div', { class: 'crop-ov' });
    const bx = h('div', { class: 'crop-box' });
    bx.append(h('img', { class: 'crop-img', src, draggable: 'false' }));
    for (const k of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) bx.append(h('div', { class: 'crop-h crop-' + k, 'data-h': k }));
    const okB = h('button', { class: 'gw-btn primary' }, '裁剪');
    const noB = h('button', { class: 'gw-btn' }, '取消');
    const bar = h('div', { class: 'crop-bar' }, h('span', { class: 'crop-tip' }, '拖手柄选范围 · 裁剪不可撤销'), okB, noB);
    ov.append(bx, bar);
    document.body.append(ov);
    function place() {
      bx.style.left = box.l + 'px'; bx.style.top = box.t + 'px';
      bx.style.width = box.w + 'px'; bx.style.height = box.h + 'px';
      bar.style.left = Math.max(8, Math.min(box.l, innerWidth - 340)) + 'px';
      bar.style.top = (box.t + box.h + 52 > innerHeight ? Math.max(8, box.t - 52) : box.t + box.h + 10) + 'px';
    }
    place();
    let closed = false;
    function close() {
      if (closed) return; closed = true;
      ov.remove(); document.removeEventListener('keydown', onKey, true);
      if (cropUI && cropUI.close === close) cropUI = null;
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    noB.addEventListener('click', close);
    // 八个手柄：拖动改对应的边；框不许超出原图，也不许小于 12px（否则裁出来是 0 像素）
    bx.addEventListener('pointerdown', (e) => {
      const hd = e.target.closest && e.target.closest('.crop-h');
      if (!hd) return;
      e.preventDefault(); e.stopPropagation();
      const dir = hd.dataset.h;
      const sx = e.clientX, sy = e.clientY, b0 = Object.assign({}, box);
      const right = b0.l + b0.w, bottom = b0.t + b0.h;
      const MV = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        let l = b0.l, t = b0.t, r = right, b = bottom;
        if (dir.indexOf('w') >= 0) l = Math.max(base.l, Math.min(b0.l + dx, right - 12));
        if (dir.indexOf('e') >= 0) r = Math.min(base.l + base.w, Math.max(b0.l + 12, right + dx));
        if (dir.indexOf('n') >= 0) t = Math.max(base.t, Math.min(b0.t + dy, bottom - 12));
        if (dir.indexOf('s') >= 0) b = Math.min(base.t + base.h, Math.max(b0.t + 12, bottom + dy));
        box.l = l; box.t = t; box.w = r - l; box.h = b - t;
        place();
      };
      const UP = () => { window.removeEventListener('pointermove', MV, true); window.removeEventListener('pointerup', UP, true); };
      window.addEventListener('pointermove', MV, true);
      window.addEventListener('pointerup', UP, true);
    }, true);
    okB.addEventListener('click', () => {
      const kx = nw / base.w, ky = nh / base.h;
      const cx = Math.round((box.l - base.l) * kx), cy = Math.round((box.t - base.t) * ky);
      const cw = Math.max(1, Math.round(box.w * kx)), ch = Math.max(1, Math.round(box.h * ky));
      close();
      // 拖满全图 = 什么都没裁：不重编码（字节数必须和原来一样）
      if (cx <= 0 && cy <= 0 && cw >= nw && ch >= nh) { GW.toast('没有裁掉任何部分，图片保持原样', 2600); return; }
      const cv = h('canvas'); cv.width = cw; cv.height = ch;
      const g = cv.getContext('2d');
      g.drawImage(img, Math.max(0, cx), Math.max(0, cy), cw, ch, 0, 0, cw, ch);
      let alpha = false;
      try {
        const px = g.getImageData(0, 0, cw, ch).data;
        for (let i = 3; i < px.length; i += 4 * 11) if (px[i] < 250) { alpha = true; break; }
      } catch (err) { alpha = /^data:image\/(png|gif|webp|svg)/i.test(String(src)) && !/jpe?g/i.test(String(src)); }
      const url = cv.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.85);
      const before = GW.clone(o);
      o.data = o.data || {};
      o.data.src = url;
      if (o.data.asset) delete o.data.asset;   // 图片 kind 优先 data.asset，留着就看不到新 src
      o.w = Math.max(8, o.w * (cw / nw));
      o.h = Math.max(8, o.h * (ch / nh));
      GW.commit({ update: [{ before, after: o }] });
      const fresh = GW.page().objs.filter((x) => x.id === before.id)[0];
      if (fresh) { remount(fresh); GW.selection.set([fresh]); }
      GW.markDirty();
      GW.toast('已裁剪（不可撤销）', 2400);
    });
    return { close };
  }

  // 视图变化时：更新反向缩放变量让标题栏保持屏幕尺寸，并让文稿位图重新排队（见 GW.docs）
  GW.bus.on('view', (v) => {
    if (GW.worldEl) GW.worldEl.style.setProperty('--inv', 1 / v.s);
    lastViewAt = performance.now();
    GW.docs.repaint();
  });
  // 对象数据变了（换页 / 换文件 / 挂载）也要重排：以前靠每个实例自己起 160ms 定时器，
  // 12 页铺开时一次缩放要连做 12 次全页光栅，松手后就是一下明显卡顿。
  // 注意这里挂的是 history（撤销/重做会整体换掉对象数据，实例的 onUpdate 不一定被调到），
  // 不是早期那个从没人 emit 过的 'objupdate' —— 那条订阅是死代码，撤掉重做后位图不重光栅。
  GW.bus.on('history', () => GW.docs.repaint());
  GW.bus.on('page', () => GW.docs.repaint(0));
  // 放映 PPT / 切页导致「纸色」变了（board.js 的 GW.setInkPaper）：文本与公式的颜色是
  // 挂载时按 inkFix 算好写进 style 的，必须让它们重算一遍，否则深色幻灯片上仍是黑字。
  GW.bus.on('inkpaper', () => {
    for (const p of GW.doc.pages) {
      for (const o of p.objs) {
        if (!o._inst || !o._inst.onUpdate) continue;
        if (o.type !== 'text' && o.type !== 'formula') continue;
        try { o._inst.onUpdate(); } catch (e) { /* 单个对象坏了不影响其它 */ }
      }
    }
  });
  // 窗口从最小化/切后台回来：stepPaint 在 document.hidden 时直接返回，而恢复时只有
  // requestRender（不产生 view 事件），没有这一条「还没画过的页」会一直白到下次平移/缩放。
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) docRepaint(0);
  });

  // =============== 各类型实现 ===============

  // ---- 图片 / GIF ----
  GW.defineKind('image', {
    chrome: 'bare', keepAspect: true,
    title: (o) => o.data.name || '图片',
    create(o, body) {
      const img = h('img', { src: o.data.asset ? GW.assets.url(o.data.asset) : o.data.src, draggable: 'false' });
      img.onload = () => { o._thumb = img; };
      body.append(img);
    },
  });

  // ---- PDF 页面（按当前缩放清晰度动态重绘） ----
  const pdfDocs = {};
  GW.loadPdf = function (assetId) {
    const ck = cacheKey(assetId) || assetId;
    if (!pdfDocs[ck]) {
      const lib = window.pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
      // 失败不要永久污染：删掉这一项，下次还能重试
      // 注意：不要缓存这里解出来的 Uint8Array —— pdf.js 会把 buffer 转移给 worker（detach），
      // 缓存下来第二次就是一块空内存。
      // F03（CVE-2024-4367）：pdfjs-dist 3.11.174 解析字体时会拼字符串走 eval，恶意 PDF 可借此
      // 在渲染进程执行脚本。官方缓解措施就是关掉 eval 求值路径；不升级依赖版本（牵动 vendor/三端）。
      pdfDocs[ck] = lib.getDocument({ data: GW.assets.bytes(assetId), cMapUrl: 'vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: 'vendor/pdfjs/standard_fonts/', isEvalSupported: false }).promise;
      pdfDocs[ck].catch(() => { delete pdfDocs[ck]; });
    }
    return pdfDocs[ck];
  };

  // ---------- 文稿位图的密度策略与统一光栅调度（2.0.10） ----------
  // 旧实现三笔代价叠在一起，正是「插入后糊、缩放后卡」的来源：
  //   ① 密度被性能档位的 dprCap 钳住。dprCap 是为「每帧都要重画」的墨迹层定的，
  //      而退回软件渲染的机器（教室一体机基本都在这一档）dprCap=1 —— 150%/200% 缩放的屏上
  //      纸面只画到 0.55 倍分辨率，而且放大也不会变清（实测 crisp 恒为 0.55）。
  //   ② 每个 view 事件各起一个 160ms 定时器，12 页铺开时一次缩放的收尾要连做 12 次全页光栅
  //      （实测单页 17~51ms）→ 松手后 250~600ms 的主线程占用，就是那一下「卡」。
  //   ③ 每次光栅都新建一块离屏 canvas 再整块拷贝，最大 4096×5792（95MB）一次一换。
  // 现在：密度按原生 DPI + 全局像素预算；光栅统一排队、一帧一页、按离屏幕中心的远近排序，
  // 屏幕外的页收回到低清底图（滚进来不再是一片空白，也不再长期占着几十 MB）。
  // 预算口径：maxPx 是「所有**屏幕内**文稿页共享的像素总量」（1.6e7 px ≈ 64MB），
  // 按当前视野里的页数均摊 —— 放到 3 倍看一页，只有那一页在花钱。
  const DOC = { maxPx: 1.6e7, minBudget: 4e6, maxW: 4096, minW: 360, dprMax: 3, band: 0.18, downBand: 2.5, previewW: 620 };
  // 按 id 取活引用：commit → applyOp 的 replaceRaw 会把对象换成克隆，
  // create() 里拿到的 o 在第一次翻页后就读不到新值了（册子/单页都会踩到）。
  const liveObj = (o) => {
    if (!o || !o.id || !GW.page) return o;
    return GW.page().objs.find((x) => x.id === o.id) || o;
  };
  const docDensity = () => Math.min(DOC.dprMax, Math.max(1, window.devicePixelRatio || 1));
  let docBudgetPx = DOC.maxPx;
  // 目标位图宽（设备像素）。aspect = 高/宽，用来把像素预算换算成宽度上限。
  function docTargetW(wCss, scale, aspect) {
    const want = wCss * (scale || 1) * docDensity() * 1.06;
    const byPx = Math.sqrt(docBudgetPx / Math.max(0.2, aspect || 1.414));
    return Math.max(DOC.minW, Math.min(DOC.maxW, Math.round(Math.min(want, byPx))));
  }

  const painters = new Set();
  let paintTimer = 0, paintRaf = 0, lastViewAt = 0, budgetAt = 0;

  // 重排入口：视图/数据一变就调它。90ms 的合并窗口比旧实现的 160ms 短，
  // 但配合「一帧一页」的排队，整体收尾更快，且不会一瞬间打满主线程。
  function docRepaint(delay) {
    if (paintTimer || paintRaf) return;
    paintTimer = setTimeout(function () {
      paintTimer = 0;
      if (!paintRaf) paintRaf = requestAnimationFrame(stepPaint);
    }, delay == null ? 90 : delay);
  }
  function stepPaint() {
    paintRaf = 0;
    if (document.hidden) return;
    // 预算按「屏幕内的页数」均摊；每 200ms 才重算一次 —— 页正好压着视口边缘时，
    // onScreen 会来回跳，逐帧重算会让目标宽度反复跨过滞回带，变成每帧重光栅。
    const now = performance.now();
    if (now - budgetAt > 200) {
      budgetAt = now;
      let nVis = 0;
      for (const p of painters) if (p.alive && p.onScreen()) nVis++;
      docBudgetPx = Math.max(DOC.minBudget, DOC.maxPx / Math.max(1, nVis));
    }
    // 手势还在进行（110ms 内还有 view 事件）：这一刻出的图下一帧就作废，别抢主线程。
    // 但「从没画过」的页例外 —— 插入/翻页后至少要有一张低清底图，否则那半秒就是白屏。
    const gesturing = now - lastViewAt < 110;
    let blank = false;
    for (const p of painters) if (p.alive && !p.bmpW) blank = true;
    if (gesturing && !blank) { docRepaint(120); return; }
    let best = null, bestD = Infinity;
    for (const p of painters) {
      if (!p.alive || p.busy || !p.wants()) continue;
      const d = p.dist();
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best) return;
    best.run(null, gesturing && !best.bmpW ? Math.min(DOC.previewW, best.wantW) : null);
    paintRaf = requestAnimationFrame(stepPaint);   // 还有活就接着排：一帧只做一页
  }

  // 一个「文稿页面」位图绘制器：pdfpage 与 book 共用（book 另有翻页动效直接调用）。
  // getBox 返回 { x, y, w, h }（数据可能被 commit 换成克隆对象，所以每次都现取）。
  function makePainter(o, getCanvas, getBox, opts) {
    const o2 = opts || {};
    const p = {
      alive: true, busy: false, seq: 0,
      bmpW: 0, bmpPage: 0, wantW: 0, off: null, task: null,
      page() { return o2.page ? o2.page() : ((o.data && o.data.page) || 1); },
      onScreen() {
        const b = getBox(), vr = GW.viewRect();
        return !(b.x > vr.x + vr.w || b.y > vr.y + vr.h || b.x + b.w < vr.x || b.y + b.h < vr.y);
      },
      target() {
        const b = getBox();
        return docTargetW(b.w, GW.camera.s, b.h / Math.max(1, b.w));
      },
      dist() {
        const b = getBox(), c = GW.viewCenter();
        return Math.hypot((b.x + b.w / 2) - c.x, (b.y + b.h / 2) - c.y) * GW.camera.s;
      },
      wants() {
        if (!this.alive) return false;
        const w = this.target(), pg = this.page();
        this.wantW = w;
        if (pg !== this.bmpPage) return true;                 // 换页必须重画
        if (!this.bmpW) return true;                          // 从没画过
        // 屏幕内：小了就升清；只有「大得离谱」才降清。
        // 降清的门槛必须远大于升清 —— 缩小时每一页的位图都会立刻「超标」，
        // 门槛定在 1.6 倍就等于缩一次手要重光栅全部可见页（实测 12 页 / 288ms），
        // 而老师缩回去的概率很高，那一次降清纯属白烧。
        if (this.onScreen()) return this.bmpW < w * (1 - DOC.band) || this.bmpW > w * DOC.downBand;
        // 屏幕外：底图只要「够当占位」就行 —— 已经落在 minW..previewW 之间就一律不动。
        // 否则「低倍看全页 → 放大」时，每一页都要补一次 360→620 的无意义升清（实测 10 页 270ms）。
        if (this.bmpW < DOC.minW * 0.95) return true;
        return this.bmpW > Math.min(DOC.previewW, w) * 1.7;
      },
      // 直接画一页（翻页动效用）：返回 Promise，resolve 时画布已是新页
      paintNow(pg, target, into) {
        return this.run(pg, target, into);
      },
      async run(forcePage, forceTarget, into) {
        if (!this.alive || this.busy) return;
        this.busy = true;
        const my = ++this.seq;
        const pg = forcePage || this.page();
        const want = this.target();
        const target = forceTarget || (this.onScreen() ? want : Math.min(DOC.previewW, want));
        try {
          if (this.task) { try { this.task.cancel(); } catch (_) {} this.task = null; }
          const pdf = await GW.loadPdf(o.data.asset);
          if (!this.alive || my !== this.seq) return;
          const page = await pdf.getPage(pg);
          if (!this.alive || my !== this.seq) return;
          const vp0 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: target / vp0.width });
          const W = Math.round(vp.width), H = Math.round(vp.height);
          // 离屏画布按尺寸复用：一次缩放里尺寸不变就不再申请（旧实现每帧都新建一块）
          let off = this.off;
          if (!off || off.width !== W || off.height !== H) {
            off = document.createElement('canvas');
            off.width = W; off.height = H;
            this.off = off;
          }
          const task = page.render({ canvasContext: off.getContext('2d'), viewport: vp });
          this.task = task;
          await task.promise;
          this.task = null;
          if (!this.alive || my !== this.seq) return;
          const cv = into || getCanvas();
          if (!cv) return;
          // 先定尺寸再整块拷贝：两步在同一个任务里，中间不会有一帧白屏
          if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
          const g = cv.getContext('2d');
          if (g.setTransform) g.setTransform(1, 0, 0, 1, 0, 0);
          g.drawImage(off, 0, 0);
          this.bmpW = W; this.bmpPage = pg;
          if (o2.painted) { try { o2.painted(vp0, W); } catch (e) { console.error(e); } }
        } catch (e) {
          if (e && e.name !== 'RenderingCancelledException') console.error(e);
        } finally { this.busy = false; }
      },
      destroy() {
        this.alive = false;
        painters.delete(this);
        if (this.task) { try { this.task.cancel(); } catch (_) {} this.task = null; }
        this.off = null;
      },
    };
    painters.add(p);
    return p;
  }
  GW.docs = {
    repaint: docRepaint,
    painters: () => painters.size,
    // 供探针/诊断用：当前所有页面的位图宽度
    widths: () => [...painters].map((p) => p.bmpW),
  };
  // 换文档：所有绘制器作废（对象层已经整体重建，这里兜住没走 destroy 的残留）
  const docReset = () => { for (const p of [...painters]) p.destroy(); };
  GW.docs.reset = docReset;

  GW.defineKind('pdfpage', {
    chrome: 'bare', keepAspect: true,
    title: (o) => (o.data.name || 'PDF') + ' · 第 ' + o.data.page + ' 页',
    create(o, body) {
      const cv = h('canvas');
      body.append(cv);
      body.classList.add('paper');
      // 数据可能被 commit 换成克隆对象（见下面 book 的坑注释），坐标一律按 id 取活引用
      const p = makePainter(o, () => cv, () => liveObj(o), { painted: () => { o._thumb = cv; } });
      docRepaint(0);
      return {
        onView: () => docRepaint(), onUpdate: () => docRepaint(),
        destroy() { p.destroy(); },
      };
    },
  });

  // ---- 册子（多页 PDF / PPT / Word：一次导入只落这一个对象）----
  // 1.0.19：以前每页建一个 pdfpage、按 innerWidth*0.7 竖着铺满画布，30 页的 PDF 直接把画布占死。
  // 现在只落一个「册子」：画面上是当前页 + 页码 + 左右箭头，双击进项目空间逐页看。
  // 老文档里已经铺开的 pdfpage 一张都不动（space.js 靠 data.pg 仍能翻），只改新导入。
  //
  // 坑：setData 走 commit → applyOp 的 replaceRaw 会「换一个克隆对象回去」，
  // 所以 create 里拿到的 o 在第一次翻页后就过期了（读 data.page 会永远停在旧值）。
  // 这里一律用 L() 按 id 取活引用；GW.books 的四个函数也一样。
  GW.defineKind('book', {
    chrome: 'bare', keepAspect: true, minW: 160, minH: 120,
    title: (o) => (o.data.name || '册子') + ' · 第 ' + (o.data.page || 1) + '/' + (o.data.n || 1) + ' 页',
    create(o, body) {
      body.classList.add('paper', 'book');
      const L = () => liveObj(o);
      const cv = h('canvas', { class: 'book-cv' });
      const leaf = h('canvas', { class: 'book-leaf' });   // 翻页动效里转出去的那一页
      const stage = h('div', { class: 'book-stage' }, cv, leaf);
      const lab = h('div', { class: 'book-lab' }, '');
      const prev = h('button', { class: 'book-nav book-prev', title: '上一页（←）', html: GW.icon('chevronL') });
      const next = h('button', { class: 'book-nav book-next', title: '下一页（→）', html: GW.icon('chevronR') });
      const nav = h('div', { class: 'book-bar' }, prev, lab, next);
      body.append(stage, nav);
      let animating = false;

      const total = () => Math.max(1, L().data.n || L().data.pc || 1);
      const pageno = () => Math.min(total(), Math.max(1, L().data.page || 1));
      const paintLab = () => {
        lab.textContent = pageno() + ' / ' + total();
        prev.disabled = pageno() <= 1;
        next.disabled = pageno() >= total();
      };

      // 位图绘制统一交给 GW.docs 的调度器（密度策略、一帧一页、离屏复用都在那边）。
      // 这里只声明「画哪一页」「画完要做什么」。
      const painter = makePainter(o, () => cv, () => L(), {
        page: () => pageno(),
        painted(vp0) {
          const self = L();
          self._thumb = cv;
          // 第一页拿到真实比例后把书调整成该页面的比例（竖版 A4 不该显示成横的）
          if (!self.data.ratioFix) {
            const ratio = vp0.height / vp0.width;
            self.data.ratioFix = 1;
            if (Math.abs(self.h / self.w - ratio) > 0.02) {
              self.h = self.w * ratio;
              if (self._el) { self._el.style.width = self.w + 'px'; self._el.style.height = self.h + 'px'; }
              GW.requestRender();
            }
          }
        },
      });
      paintLab();
      docRepaint(0);

      // 翻页：不用 setData（它会换对象引用，bar 上的 cur 会过期），直接 commit 一条 update
      const turn = (d) => {
        const self = L();
        const p = Math.min(total(), Math.max(1, pageno() + d));
        if (p === pageno()) return p;
        const before = GW.clone(self);
        self.data.page = p;
        GW.commit({ update: [{ before, after: self }] });
        paintLab();
        return p;
      };
      // 翻页动效（1.0.20）：旧页拷到 leaf 上绕书脊转出去，同时把新页画进主 canvas。
      // 转完再排一次调度，所以不会出现「页号变了但画面还是旧页」。
      let flipSeq = 0;
      const flip = (d) => {
        const p = Math.min(total(), Math.max(1, pageno() + d));
        if (p === pageno()) return;
        // 连点也认：上一张还在转就立刻收尾（用序号作废旧动画的回调），接着翻下一张
        const my = ++flipSeq;
        animating = true;
        if (leaf.width !== cv.width || leaf.height !== cv.height) { leaf.width = cv.width || 4; leaf.height = cv.height || 4; }
        try { leaf.getContext('2d').drawImage(cv, 0, 0); } catch (_) { /* 首次还没画过：空 leaf 也能转 */ }
        turn(d);
        paintLab();
        // 先把「静止的旧页」摆上去，强制一次布局，让它真的从 0° 开始转
        leaf.className = 'book-leaf show';
        void leaf.offsetWidth;
        leaf.classList.add(d > 0 ? 'flip-l' : 'flip-r');
        // 新页直接画进主画布（用户主动翻页，不等调度）：画完再刷一次，避免「转完还是旧页」
        painter.paintNow(pageno())
          .then(() => GW.requestRender())
          .catch(() => {});
        setTimeout(() => {
          if (my !== flipSeq) return;        // 后面又翻了一页：交给后来者收尾
          leaf.className = 'book-leaf';
          animating = false;
          paintLab();
          docRepaint(0);
          GW.requestRender();
        }, 260);
      };
      body._flip = flip;         // 项目空间的翻页按钮也走这套动效
      prev.onclick = (e) => { e.stopPropagation(); flip(-1); };
      next.onclick = (e) => { e.stopPropagation(); flip(1); };
      body.addEventListener('dblclick', (e) => { e.stopPropagation(); if (GW.space) GW.space.enter(L()); });
      return {
        onView: () => docRepaint(),
        onUpdate: () => { paintLab(); docRepaint(); },
        destroy() { painter.destroy(); },
      };
    },
  });
  // 册子 → 单页：给「老习惯」留的出口（也用于把册子拆开在画布上并排对比）
  GW.books = {
    total(o) { const x = liveObj(o); return Math.max(1, (x && x.data && (x.data.n || x.data.pc)) || 1); },
    page(o) { const x = liveObj(o); return Math.min(GW.books.total(x), Math.max(1, (x && x.data && x.data.page) || 1)); },
    turn(o, d) {
      const x = liveObj(o);
      const p = Math.min(GW.books.total(x), Math.max(1, GW.books.page(x) + d));
      if (p === GW.books.page(x)) return p;
      const before = GW.clone(x); x.data.page = p;
      GW.commit({ update: [{ before, after: x }] });
      return p;
    },
    setPage(o, i) {
      const x = liveObj(o);
      const p = Math.min(GW.books.total(x), Math.max(1, (i | 0) || 1));
      if (p !== GW.books.page(x)) {
        const before = GW.clone(x); x.data.page = p;
        GW.commit({ update: [{ before, after: x }] });
      }
      return p;
    },
    expand(o) {
      const x = liveObj(o);
      if (!x || x.type !== 'book') return [];
      const n = GW.books.total(x), gid = 'pg' + GW.uid();
      const gap = x.w * 0.04;
      let y = x.y;
      const z0 = GW.page().objs.reduce((m, z) => Math.max(m, z.z || 0), 0);
      const items = [];
      for (let i = 1; i <= n; i++) {
        items.push({ id: GW.uid(), kind: 'obj', type: 'pdfpage', x: x.x, y, w: x.w, h: x.h, z: z0 + i,
          data: { asset: x.data.asset, page: i, name: x.data.name, pg: gid, pn: i - 1, pc: n } });
        y += x.h + gap;
      }
      GW.addItems(items, false);
      GW.removeItems([x], false);
      GW.commit({ add: items, remove: [x] });
      if (GW.space && GW.space.isOn && GW.space.isOn()) GW.space.exit();
      GW.toast('已展开成 ' + n + ' 个单页（Ctrl+Z 收回册子）');
      return items;
    },
  };
  // ---- 视频 / 音频 ----
  GW.defineKind('video', {
    chrome: 'window', keepAspect: false,
    title: (o) => '🎬 ' + (o.data.name || '视频'),
    create(o, body) {
      const src = o.data.asset ? GW.assets.url(o.data.asset) : GW.fileURL(o.data.path);
      const v = h(o.data.audio ? 'audio' : 'video', { src, controls: true, preload: 'metadata' });
      v.addEventListener('loadedmetadata', () => {
        if (!o.data.audio && !o.data.sized && v.videoWidth) {
          o.data.sized = true; o.h = o.w * v.videoHeight / v.videoWidth; update(o);
        }
      });
      // 1.7.12：播放中途出错（解码器抽风 / app:// 读到一半断流）先自动救一次：
      // 记住进度、重设 src 再拉回原位续播。真的救不回来才把错误条留在对象上，并带上错误码，
      // 免得老师只看到「文件丢失或格式不支持」却没法判断是不是该转码。
      let recovered = false;
      const showErr = (msg) => {
        if (body.querySelector('.obj-error')) return;
        body.append(h('div', { class: 'obj-error' }, msg));
      };
      v.onerror = () => {
        const code = (v.error && v.error.code) || 0;
        if (!recovered && !o.data.audio && code !== 1) {         // 1 = 用户主动中止，不救
          recovered = true;
          const at = v.currentTime || 0;
          GW.toast('视频播放中断，正在自动重试…', 2200);
          const once = () => {
            v.removeEventListener('loadedmetadata', once);
            try { if (at > 0.3) v.currentTime = at; v.play(); } catch (e) { /* 用户没点播放就不强行播 */ }
          };
          v.addEventListener('loadedmetadata', once);
          v.src = src;                                           // 同一个 URL 重新加载
          v.load();
          return;
        }
        const WHY = { 2: '网络/读取中断', 3: '解码失败（建议转成 H.264 MP4）', 4: '格式不支持（建议转成 H.264 MP4）' };
        showErr('无法播放：' + (o.data.path || o.data.name) + '（' + (WHY[code] || '未知错误') + '）');
      };
      // 1.1.15 协同：播放/暂停/拖动进度/改倍速都要同步给对端，否则「一起看视频」实际是各看各的。
      // 播放中每 1.8s 补一次时间戳纠偏（两端缓冲不同步，只发一次会越走越偏）。
      let vidAt = 0;
      const netV = (extra) => {
        if (!GW.netLive || o._vidApplying) return;
        const m = { k: 'v', id: o.id, t: Math.round(v.currentTime * 100) / 100, playing: !v.paused && !v.ended, rate: v.playbackRate };
        if (extra) for (const kk in extra) m[kk] = extra[kk];
        GW.netLive('v', m);
      };
      v.addEventListener('play', () => netV({ playing: true }));
      v.addEventListener('pause', () => netV({ playing: false }));
      v.addEventListener('seeked', () => netV());
      v.addEventListener('ratechange', () => netV());
      v.addEventListener('timeupdate', () => {
        const tt = performance.now();
        if (tt - vidAt < 1800) return;
        vidAt = tt;
        if (!v.paused) netV();
      });
      // 慢放控制（物理实验视频常用）
      const rates = [0.25, 0.5, 1, 1.5, 2];
      const bar = h('div', { class: 'video-rates' }, rates.map((r) => h('button', { class: r === 1 ? 'on' : '', onclick: (e) => { v.playbackRate = r; bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); } }, '×' + r)));
      const snap = h('button', { title: '截取当前帧到画布', onclick: () => {
        const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        GW.importer.insertDataURL(c.toDataURL('image/png'), '视频截图', { x: o.x + o.w + 30, y: o.y, w: o.w * 0.6 });
      } }, '📷 截帧');
      bar.append(snap);
      body.append(v);
      if (!o.data.audio) body.append(bar);
      // park：换页时只暂停，不清 src —— 翻回来接着原进度看（以前 destroy 会把视频整个卸掉重来）
      return { destroy() { v.pause(); v.removeAttribute('src'); v.load(); }, park() { try { v.pause(); } catch (e) { /* 已经没了 */ } } };
    },
    defaultSize: (d) => (d.audio ? { w: 520, h: 90 } : { w: 960, h: 540 }),
  });

  // ---- 网页（PhET、Desmos、GeoGebra 资源、任意网址） ----
  // ---------- 动画参数条（L1）：读本机 html 的 @params，改 iframe 的 query ----------
  // 只对**本机文件**生效（data.path / data.libRel）：网页对象既不读、也不改它的 query。
  // 解析规则与 scripts/anim-skeleton.html 的 parseMeta 一致 —— 取第一个含 @title 的注释块。
  function parseAnimMeta(text) {
    if (!text || typeof text !== 'string') return null;
    const all = /<!--([\s\S]*?)-->/g;
    let m, block = '';
    while ((m = all.exec(text))) { if (m[1].indexOf('@title') >= 0) { block = m[1]; break; } }
    if (!block) return null;
    const meta = {};
    block.split(/\r?\n/).forEach((line) => {
      const mm = /^\s*@(\w+)\s+(.*)$/.exec(line);
      if (mm) meta[mm[1]] = mm[2].trim();
    });
    if (!meta.title) return null;
    const params = [];
    String(meta.params || '').split(',').forEach((kv) => {
      const s = kv.trim(), i = s.indexOf('=');
      if (i <= 0) return;
      const k = s.slice(0, i).trim(), v = Number(s.slice(i + 1));
      if (k && isFinite(v)) params.push({ k, v });
    });
    return { meta, params };
  }
  GW.parseAnimMeta = parseAnimMeta;   // 给探针与以后的「按章检索」复用

  // base 上换掉 p 参数，其它 query 原样保留（值里带逗号/等号，交给 URLSearchParams 编码）
  function srcWithParams(base, kv) {
    const hashI = base.indexOf('#');
    const u = hashI >= 0 ? base.slice(0, hashI) : base;
    const hash = hashI >= 0 ? base.slice(hashI) : '';
    const qi = u.indexOf('?');
    const path = qi >= 0 ? u.slice(0, qi) : u;
    const q = new URLSearchParams(qi >= 0 ? u.slice(qi + 1) : '');
    if (kv) q.set('p', kv); else q.delete('p');
    const s = q.toString();
    return path + (s ? '?' + s : '') + hash;
  }
  GW.srcWithParams = srcWithParams;

  // 给 web 对象的 body 前置一条参数条；拿不到 metadata / 没有 @params 就什么都不加。
  // 改参数 = 改 iframe 的 src（页面自己按 §4 重新解析 query），所以对所有动画都生效、不用改内容件。
  // R3+：截帧时把批注一起烧进图里 —— 老师讲的圈画就在画面上，截下来少一层信息没人要。
  // 批注层是独立的 canvas（overlay 方案），所以这里要手动合成一次。
  function composeAnn(url, o) {
    return new Promise((resolve) => {
      const annCv = o._ann && o._body ? o._body.querySelector('.obj-ann') : null;
      const img = new Image();
      img.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth || 1; cv.height = img.naturalHeight || 1;
          const cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0);
          if (annCv && annCv.width) cx.drawImage(annCv, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL('image/png'));
        } catch (e) { resolve(url); }
      };
      img.onerror = () => resolve(url);
      img.src = url;
    });
  }

  // R4：把同源动画的当前画面截到板书上（方案 D5）。
  // 读不到、或页面没 expose window.__anim.capture() 时明确 toast 说明，不静默失败。
  GW.animShot = async function (o) {
    const f = o && o._body && o._body.querySelector('iframe');
    if (!f) { GW.toast('这个对象里没有动画页面'); return null; }
    let api = null;
    try { api = f.contentWindow && f.contentWindow.__anim; } catch (_) { /* 动画可能已跳到跨源页面 */ }
    if (!api || typeof api.capture !== 'function') {
      GW.toast('截不到：这个页面不是动画，或与画板不同源');
      return null;
    }
    let url = null;
    try { url = api.capture(); } catch (e) { GW.toast('截帧失败：' + (e && e.message || e)); return null; }
    if (!/^data:image\//.test(String(url))) { GW.toast('截帧失败：画面没有返回图片'); return null; }
    try { if (GW.annot && GW.annot.count && GW.annot.count(o) > 0) url = await composeAnn(url, o); } catch (e) { /* 合成失败就用原图 */ }
    let img = null;
    try { img = GW.importer.insertDataURL(url, '动画截帧', { x: o.x + o.w + 30, y: o.y, w: Math.round(o.w * 0.6) }); }
    catch (e) { GW.toast('截帧失败：' + (e && e.message || e)); return null; }
    if (img && typeof img.catch === 'function') img.catch((e) => GW.toast('截帧失败：' + (e && e.message || e)));
    GW.toast('已截到板书');
    return img || null;
  };

  // 1.7.4：**同一个参数改成「就地改」而不是「整页重载」**。
  // 老实现（1.1.15）是对端改参数就重拼 iframe 的 query 再 setAttribute('src') ——
  // 那等于把整个动画页重新加载一遍：动画从头开始、画面闪一下。老师点一下参数按钮，
  // 平板上整幅画面重来一次，这就是「参数按钮要同步画面」的由来。
  // 现在分三档，代价从低到高：
  //   ① 页面自己暴露了 window.__anim.setParam(k, v) → 直接调用，不重载（我们的新动画都支持）；
  //   ② 没这 API 但有 __anim.params(obj) 之类也不管 —— 退回 ③；
  //   ③ 只能改 query：仍然重载，但只在「值真的变了」时才重载，并且 120ms 内多次改动合并成一次。
  function animTryLiveSet(f, params) {
    let api = null;
    try { api = f.contentWindow && f.contentWindow.__anim; } catch (e) { api = null; }   // 跨源会抛
    if (!api || typeof api.setParam !== 'function') return false;
    try {
      for (let i = 0; i < params.length; i++) {
        const r = api.setParam(params[i].k, params[i].v);
        if (r === false) return false;      // 页面说「这个参数我不认」→ 整体退回重载
      }
      return true;
    } catch (e) { return false; }
  }
  const animPending = new WeakMap();        // iframe → { timer, url }
  function animSetParams(o, f, params, opts) {
    if (!o || !f || !Array.isArray(params)) return false;
    o.data = o.data || {};
    const prev = Array.isArray(o.data.animParams) ? o.data.animParams : [];
    const changed = params.length !== prev.length ||
      params.some((x, i) => !prev[i] || prev[i].k !== x.k || Number(prev[i].v) !== Number(x.v));
    o.data.animParams = params.map((x) => ({ k: x.k, v: x.v }));
    if (!changed) return true;             // 值没变就别动画面（遥控器连点同一个值很常见）
    if (animTryLiveSet(f, params)) return true;
    const raw = o.data.animBase || f.getAttribute('src') || '';
    const base = String(raw).replace(/\?.*$/, '');
    const url = (opts && opts.bare) ? String(opts.bare) : srcWithParams(base, params.map((x) => x.k + '=' + x.v).join(','));
    // 单次改动立刻生效（老师点一下要马上看到）；只有**连续**改动（拖滑杆/连点）才限频合并，
    // 上限约 12 次/秒 —— 动画页重载一次是几十毫秒，再快就会自己卡自己。
    const st = animPending.get(f) || { last: 0, timer: null, url: '' };
    const now = Date.now();
    const put = () => {
      try { if (f.isConnected) f.setAttribute('src', st.url); } catch (e) { /* 页面已经没了 */ }
      st.last = Date.now();
      st.timer = null;
    };
    if ((opts && opts.now) || now - st.last >= 80) {
      st.url = url;
      if (st.timer) { clearTimeout(st.timer); st.timer = null; }
      put();
    } else {
      st.url = url;
      if (!st.timer) st.timer = setTimeout(put, 80);
    }
    animPending.set(f, st);
    return true;
  }
  GW.animSetParams = animSetParams;

  // 对端改了动画参数条 —— 只改这一个对象、不重建、不整份重载快照。
  GW.animApplyParams = function (o, p) {
    if (!o || !Array.isArray(p)) return false;
    o.data = o.data || {};
    const f = o._body && o._body.querySelector('iframe');
    if (!f) { o.data.animParams = p.map((x) => ({ k: x.k, v: x.v })); return true; }
    const ok = animSetParams(o, f, p);
    const bar = o._body && o._body.querySelector('.anim-bar');
    if (bar) {
      const ins = bar.querySelectorAll('.anim-bar-in');
      (o.data.animParams || []).forEach((x, i) => { if (ins[i]) ins[i].value = String(x.v); });
    }
    return ok;
  };

  GW.animBar = function (o, body, iframe, localPath) {
    const read = window.gewu && window.gewu.readFile;
    if (!localPath || !read) return null;
    let alive = true;
    Promise.resolve(read(localPath, 'utf8')).then((text) => {
      if (!alive || !iframe.isConnected || iframe.previousSibling && iframe.previousSibling.className === 'anim-bar') return;
      const parsed = parseAnimMeta(text);
      if (!parsed || !parsed.params.length) return;
      const base = iframe.getAttribute('src') || iframe.src;
      const vals = parsed.params.map((x) => ({ k: x.k, v: x.v }));
      // 1.1.15：把「不带 query 的原始 src」和当前参数记在对象上。
      // 以前参数只改本机 iframe 的 src，既不落盘也不同步 —— 换页回来就回默认值，平板那边更是一点变化都没有。
      o.data.animBase = base;
      if (!Array.isArray(o.data.animParams)) o.data.animParams = vals.map((x) => ({ k: x.k, v: x.v }));
      const bar = h('div', { class: 'anim-bar' });
      bar.append(h('span', { class: 'anim-bar-t' }, '参数'));
      const apply = () => {
        // 1.7.4：先试就地改（有 __anim.setParam 的页面不重载、不打断动画），不行才改 query
        animSetParams(o, iframe, vals.map((x) => ({ k: x.k, v: x.v })));
        if (GW.netLive) GW.netLive('an', { k: 'an', id: o.id, p: o.data.animParams });
      };
      const inputs = [];
      vals.forEach((x) => {
        const inp = h('input', { class: 'anim-bar-in', type: 'number', step: Number.isInteger(x.v) ? 1 : 0.5, value: String(x.v) });
        inp.addEventListener('change', () => {
          const n = Number(inp.value);
          if (!isFinite(n)) { inp.value = String(x.v); return; }   // 乱输入退回原值，不把页面搞成 NaN
          x.v = n; apply();
        });
        inputs.push(inp);
        bar.append(h('label', { class: 'anim-bar-l' }, x.k, inp));
      });
      bar.append(h('button', {
        class: 'anim-bar-b', type: 'button', title: '回到 @params 的默认值',
        onclick: () => {
          vals.forEach((x, i) => { x.v = parsed.params[i].v; inputs[i].value = String(x.v); });
          // 1.7.4：重置也算一次参数变更 —— 同样先试就地改，再同步给对端（以前这里只改本机 src，平板不知道）
          // bare: 回默认时把 src 还原成**不带 p=** 的原始地址（1.1.15 的契约，probe-anim-bar ⑥ 守着）
          animSetParams(o, iframe, vals.map((x) => ({ k: x.k, v: x.v })), { bare: base, now: true });
          if (GW.netLive) GW.netLive('an', { k: 'an', id: o.id, p: o.data.animParams });
        },
      }, '重置'));
      if (parsed.meta.chapter) bar.append(h('span', { class: 'anim-bar-hint' }, parsed.meta.chapter));
      body.insertBefore(bar, iframe);
    }).catch(() => { /* 读不到就静默不加条：没参数条不影响打开 */ });
    return { destroy() { alive = false; } };
  };

  // L3：把本机动画打成一个 .gwanim（zip = anim.html + meta.json + preview.png）
  // meta.json 从课件自己的 meta 注释块生成，作者不用手写第二份；预览图取同源 capture()，取不到就不放预览图。
  GW.gwanimExport = async function (o) {
    const p = (o.data && o.data.libRel && GW.libRoot) ? GW.libRoot + '/' + o.data.libRel : (o.data && o.data.path);
    if (!p || !window.gewu || !window.gewu.readFile) { GW.toast('只有本机动画文件能打包'); return null; }
    try {
      const html = await window.gewu.readFile(p, 'utf8');
      let previewPng = null;
      try {
        const f = o._body.querySelector('iframe');
        const api = f && f.contentWindow && f.contentWindow.__anim;
        if (api && typeof api.capture === 'function') previewPng = GW.gwanim.dataUrlToBytes(api.capture()).data;
      } catch (e) { previewPng = null; }     // 截不到预览图不算失败
      const bytes = GW.gwanim.buildBundle({ html, previewPng });
      const base = p.split(/[\\/]/).pop().replace(/\.html?$/i, '');
      const picked = await window.gewu.saveDialog({
        title: '导出单文件动画',
        defaultPath: base + GW.gwanim.EXT,
        filters: [{ name: '单文件动画', extensions: ['gwanim'] }],
      });
      if (!picked) return null;
      const out = /\.gwanim$/i.test(picked) ? picked : picked + GW.gwanim.EXT;
      const b64 = GW.gwanim.bytesToDataUrl(bytes).replace(/^data:[^;]*;base64,/, '');
      await window.gewu.writeFile(out, b64, 'base64');
      GW.toast('已导出 ' + out.split(/[\\/]/).pop() + '（' + Math.round(bytes.length / 1024) + ' KB）');
      return out;
    } catch (e) {
      GW.toast('导出失败：' + (e && e.message || e));
      return null;
    }
  };

  // L3：导入 .gwanim → 落到 <userData>/library/物理/<章节路径>/<标题>.html + 同名 sidecar .json（R6 直接可检索）
  GW.gwanimImport = async function () {
    const g = window.gewu;
    if (!g || !g.openFiles) { GW.toast('导入只在桌面版可用'); return null; }
    let paths = [];
    try { paths = await g.openFiles({ title: '选择单文件动画（.gwanim）', filters: [{ name: '单文件动画', extensions: ['gwanim'] }], multi: false }); } catch (e) { paths = []; }
    const one = (paths || []).filter((p) => /\.gwanim$/i.test(p))[0];
    if (!one) return null;
    try {
      const b64 = await g.readFile(one, 'base64');
      const bin = atob(String(b64 || ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bun = GW.gwanim.readBundle(bytes);
      const dirs = GW.gwanim.chapterDirs(bun.chapter || '未分配');
      const stem = String(bun.title || 'anim').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 60) || 'anim';
      const relDir = 'library/物理/' + dirs.join('/') + '/';
      const htmlPath = await g.userPath(relDir + stem + '.html');
      await g.writeFile(htmlPath, bun.html, 'utf8');
      const side = { chapter: bun.chapter || '', tags: (bun.sidecar && bun.sidecar.tags) || String(bun.meta.tags || '').split(',').map((s) => s.trim()).filter(Boolean), title: bun.title || '' };
      await g.writeFile(htmlPath.replace(/\.html?$/i, '.json'), JSON.stringify(side, null, 2), 'utf8');
      if (bun.preview && bun.preview.length) {
        await g.writeFile(htmlPath.replace(/\.html$/i, '.png'), GW.gwanim.bytesToDataUrl(bun.preview, 'image/png').replace(/^data:[^;]*;base64,/, ''), 'base64');
      }
      GW.toast('已导入「' + (bun.title || stem) + '」到学科库' + (bun.chapter ? '（' + bun.chapter + '）' : ''));
      return htmlPath;
    } catch (e) {
      GW.toast('导入失败：' + (e && e.message || e));
      return null;
    }
  };

  // 1.7.4：外部 HTML / 仿真页面按内容尺寸适配。
  // 老师反馈：「插入外部 html 时默认显示 16:9 的所有内容，现在有的 html 打开后只显示部分内容，
  // 需要自己拖动右下角才能显示完全」。默认框（1100×680）比页面内容小的时候，iframe 里就出现了
  // 滚动条/被裁掉的下半截 —— 这里在加载完读一次页面的内容尺寸，**只放大不缩小**，
  // 并把内框直接撑到内容大小。读不到（跨源沙箱页、blob 预览）就返回 false，保持原样。
  function fitWeb(o, f, force) {
    let d = null;
    try { d = f.contentDocument; } catch (e) { d = null; }
    if (!d || !d.documentElement) return false;
    const de = d.documentElement, bd = d.body;
    // 有的页面 body 撑满、真正内容在绝对定位容器里；三个都取，取最大
    const cw = Math.max(de.scrollWidth || 0, bd ? bd.scrollWidth : 0, de.clientWidth || 0);
    const ch = Math.max(de.scrollHeight || 0, bd ? bd.scrollHeight : 0, de.clientHeight || 0);
    if (!(cw > 0 && ch > 0)) return false;
    const CAP = 2600;                      // 再大就不像个教具了（也防止把板书撑爆）
    const fw = o.w || 1100, fh = o.h || 680;
    let nw = Math.min(CAP, Math.max(fw, cw));
    let nh = Math.min(CAP, Math.max(fh, ch));
    if (force) {                           // 手动点「适配内容」时允许缩小
      nw = Math.min(CAP, Math.max(160, cw));
      nh = Math.min(CAP, Math.max(120, ch));
    } else {
      // 自动那次只处理「明显装不下」：小于 5% 的溢出多半是滚动条，不动
      const growW = cw > fw * 1.05, growH = ch > fh * 1.05;
      o.data.fitDone = 1;
      if (!growW && !growH) return true;
    }
    if (Math.abs(nw - fw) < 1 && Math.abs(nh - fh) < 1) { o.data.fitDone = 1; return true; }
    const before = GW.clone(o);
    o.w = nw; o.h = nh;
    o.data.fitDone = 1;
    if (o._el) { o._el.style.width = nw + 'px'; o._el.style.height = nh + 'px'; }
    GW.commit({ update: [{ before, after: o }] });
    GW.requestRender();
    if (force === 'toast' || force === true) GW.toast('已按内容适配：' + Math.round(nw) + '×' + Math.round(nh), 1600);
    return true;
  }
  GW.fitWeb = fitWeb;

  const WEB_SANDBOX = 'allow-scripts allow-pointer-lock allow-forms';
  const authorWebURL = (id) => id && GW.authorWorks ? GW.authorWorks.url(id) : '';
  const builtInSimURL = (src) => /^simhtml\/(?:sims\/)?[a-z0-9_-]+\.html$/i.test(src);
  GW.webFrameSandbox = function (src, work) {
    // 只信任程序自带的页面和现场生成的作者作品 URL，存档里的字段不能授予权限。
    if (builtInSimURL(src)) return '';
    if (src && src === authorWebURL(work)) return '';
    return WEB_SANDBOX;
  };
  function webSource(data) {
    const work = authorWebURL(data.work);
    const path = !work && (data.libRel && GW.libRoot ? GW.libRoot + '/' + data.libRel : data.path);
    const asset = !work && !path && data.asset;
    // 离线缓存（resources.js 的 Cache API 副本）只替换「显示用的 src」：
    // data.url 里存的仍是原网址，所以 .gewu 存档照旧可迁移、换端打开也对得上。
    const live = GW.webSrcOverride ? GW.webSrcOverride(data) : '';
    const src = live || work || (path ? GW.fileURL(path) : (asset ? GW.assets.url(asset) : data.url));
    const sandbox = data.sandbox || path || asset ? WEB_SANDBOX : GW.webFrameSandbox(src, data.work);
    return { src, path, sandbox };
  }

  function simBackgroundDialog(id) {
    const o = GW.objects.byId(id);
    if (!o) return;
    const bg = GW.simBackground.normalize(o.data.simBackground);
    const style = h('select', { 'aria-label': '背景样式' }, h('option', { value: '' }, '仿真原样'),
      GW.simBackground.styles.map(([value, label]) => h('option', { value }, label)));
    style.value = bg?.style || '';
    const color = h('input', { type: 'color', value: bg?.color || '#eaf3ff', 'aria-label': '背景颜色' });
    const sync = () => { color.disabled = !style.value; };
    style.addEventListener('change', sync); sync();
    GW.dialog({ title: '仿真背景', body: h('div', { class: 'gw-row' },
      h('label', null, '样式 ', style), h('label', null, '颜色 ', color)), ok: '应用',
    onOk() {
      const live = GW.objects.byId(id);
      if (!live) return;
      const value = style.value ? GW.simBackground.normalize({ color: color.value, style: style.value }) : null;
      if (value?.color === bg?.color && value?.style === bg?.style) return;
      GW.objects.setData(live, { simBackground: value });
      GW.objects.update(live);
    } });
  }

  function setWebSimBackground(frame, src, raw) {
    try {
      const win = frame.contentWindow, doc = frame.contentDocument;
      if (!win || !doc || new URL(src, location.href).href.split(/[?#]/)[0] !== doc.URL.split(/[?#]/)[0]) return;
      const bg = GW.simBackground.normalize(raw);
      const shell = win.__simshell?.root;
      if (shell) { shell.__gwSetBackground?.(bg); return; }
      if (!bg && !win.__gwSimBackground) return;
      win.__gwSimBackground = bg;
      const diagram = doc.querySelector('.circuit-container');
      const stage = diagram || doc.querySelector('#stage, .stage') || doc.body;
      GW.simBackground.apply(stage, bg, 'important');
      if (win.__sim?.setBackground) { win.__sim.setBackground(bg, !!bg && GW.simBackground.light(bg)); return; }
      const art = stage.querySelector('canvas, svg');
      if (art) art.style.filter = bg && GW.simBackground.light(bg) !== !!diagram ? 'invert(1) hue-rotate(180deg)' : '';
      win.dispatchEvent(new win.Event('gw-sim-background'));
    } catch (_) { /* 页面已跨源或被卸载 */ }
  }

  GW.defineKind('web', {
    chrome: 'window',
    title: (o) => o.data.title || o.data.url,
    headButtons(o, add) {
      // 1.7.12-07：刷新要能把卡死的课件救回来 —— 先导航到 about:blank 让 Chromium 掐掉旧文档，
      // 再加一个随机 query 重新加载（不换 query 会被当成同一次导航而原地不动）。
      add('refresh', '刷新（课件卡住时用它重载）', () => {
        const f = o._body && o._body.querySelector('iframe');
        if (!f) return;
        const cur = f.getAttribute('src') || '';
        f.src = 'about:blank';
        setTimeout(() => { f.src = cur + (cur.indexOf('?') >= 0 ? '&' : '?') + 'r=' + Date.now(); }, 60);
      });
      const { sandbox, src } = webSource(o.data);
      if (!sandbox && builtInSimURL(src)) add('bg', '仿真背景', () => simBackgroundDialog(o.id));
      if (!sandbox) add('camera', '截帧到板书', () => GW.animShot(o));
      // L3：导出单文件动画包（只有本机文件才有内容可打包）
      if (o.data && (o.data.path || o.data.libRel)) add('download', '导出 .gwanim 单文件动画', () => GW.gwanimExport(o));
      // R3：批注层开关 + 清除（笔迹存在对象上，跟着缩放走）
      if (GW.annot) {
        add('pen', '批注：在动画上直接写（再点一次关闭）', () => GW.annot.toggle(o));
        add('trash', '清除这个动画上的批注', () => GW.annot.clear(o));
      }
      if (!sandbox) add('fit', '按内容适配大小（把被裁掉的部分也露出来）', () => {
        const f = o._body && o._body.querySelector('iframe');
        if (!f) return;
        if (!fitWeb(o, f, true)) GW.toast('这个页面读不到内容尺寸（跨源），请手动拖右下角', 2400);
      });
      if (o.data.browser) add('globe', '编辑网址', () => {
        const u = prompt('输入网址', o.data.url);
        if (u) { GW.objects.setData(o, { url: /^\w+:/.test(u) ? u : 'https://' + u, title: '' }); unmount(o); mount(o); }
      });
    },
    create(o, body) {
      const { src, path, sandbox } = webSource(o.data);
      const builtInSim = !sandbox && builtInSimURL(src);
      const attrs = { src, allow: 'autoplay; fullscreen', allowfullscreen: true };
      if (sandbox) attrs.sandbox = sandbox;
      else attrs.allow += '; clipboard-read; clipboard-write; camera; microphone';
      const f = h('iframe', attrs);
      // 1.1.15：这个对象以前用参数条调过值（存在 data.animParams 里）—— 换页回来 / 协同对端都要按同组参数加载
      if (!o.data.sandbox && Array.isArray(o.data.animParams) && o.data.animParams.length) {
        try { f.setAttribute('src', srcWithParams(f.getAttribute('src') || src, o.data.animParams.map((x) => x.k + '=' + x.v).join(','))); } catch (e) { /* 拼不上就用原 src */ }
      }
      const loading = h('div', { class: 'obj-loading' }, h('i'), '正在加载…');
      const applyBackground = () => {
        if (builtInSim) setWebSimBackground(f, src, (GW.objects.byId(o.id) || o).data.simBackground);
      };
      f.onload = () => {
        loading.remove();
        if (sandbox) return;
        applyBackground();
        try { if (!o.data.title && f.contentDocument) setTitle(o, f.contentDocument.title); } catch (_) {}
        // 自动适配只做一次，老师手动调过的尺寸不被反复覆盖。
        setTimeout(() => { try { if (!o.data.fitDone) fitWeb(o, f, false); } catch (_) {} }, 160);
      };
      if (sandbox) f.title = '网页课件（已隔离）';
      body.append(f, loading);
      // 1.7.6：只给声明了状态桥的试点页面挂接管；旧卡片 / 其它页面完全按旧方式启动
      if (!sandbox && GW.physicsWebBridge) GW.physicsWebBridge.attach(o, f);
      // R3 批注层：盖在 iframe 上，笔迹归一化存 o.data.ann（关着的时候不吃指针事件）
      const ann = GW.annot ? GW.annot.attach(o, body) : null;
      // L1 参数条：本机 html 且有 @params 才出现（异步读 meta，不阻塞首帧）
      const bar = GW.animBar(o, body, f, path);
      // 网络超时提示
      const to = setTimeout(() => { if (loading.isConnected) loading.lastChild.textContent = '加载较慢…若教室网络不佳，可在资源库中使用「离线缓存」'; }, 12000);
      return { onUpdate: applyBackground, destroy() {
        clearTimeout(to);
        if (GW.physicsWebBridge) GW.physicsWebBridge.detach(o.id);
        if (bar) bar.destroy(); if (ann) ann.destroy(); f.src = 'about:blank';
      } };
    },
    // L2：单文件动画按 16:9 落位（1152×648）；浏览器网页仍按 1100×680
    defaultSize: (data) => (data && data.preset === 'anim' ? { w: 1152, h: 648 } : { w: 1100, h: 680 }),
  });

  // ---- SWF 动画（Ruffle 模拟器） ----
  GW.defineKind('swf', {
    chrome: 'window',
    title: (o) => '⚡ ' + (o.data.name || 'Flash 动画'),
    create(o, body) {
      if (!window.RufflePlayer || !window.RufflePlayer.newest) {
        body.append(h('div', { class: 'obj-error' }, 'Flash 播放组件未加载'));
        return;
      }
      // splashScreen 打开：加载/解码期间给一个可见提示，而不是一块全黑。
      // unmuteOverlay 可见：音频被浏览器策略拦下时留一个补救入口。
      // allowScriptAccess 保持 false：SWF 不得调用宿主页的 JS（window.gewu 就在那儿）。
      window.RufflePlayer.config = { publicPath: 'vendor/ruffle/', autoplay: 'on', unmuteOverlay: 'visible', letterbox: 'on', splashScreen: true, contextMenu: 'on', warnOnUnsupportedContent: false, allowScriptAccess: false, polyfills: false };
      const player = window.RufflePlayer.newest().createPlayer();
      player.style.width = '100%'; player.style.height = '100%';
      body.append(player);
      // R3 批注层：SWF 上也一样能写（笔迹跟着对象走）
      const ann = GW.annot ? GW.annot.attach(o, body) : null;
      // base 只在有原始路径时给：Ruffle 用它解析 SWF 内部用相对路径引用的外部素材。
      // 资源以 blob: 打开时 URL 没有「所在目录」概念，硬造一个 base 反而指错地方。
      const opts = { url: GW.assets.url(o.data.asset) };
      // 与 GW.fileURL 内部同一判据：只有桌面主进程能给出 app://gewu/_local/ 这种带目录的地址。
      const hasAppScheme = !!(window.gewu && window.gewu.isElectron === true) || GW.isElectron === true;
      if (o.data.path && hasAppScheme) opts.base = GW.fileURL(o.data.path.replace(/[^\\/]*$/, ''));
      player.load(opts).catch((e) => body.append(h('div', { class: 'obj-error' }, 'SWF 加载失败：' + e.message)));
      return { destroy() { try { if (ann) ann.destroy(); player.remove(); } catch (_) {} } };
    },
    defaultSize: () => ({ w: 880, h: 620 }),
  });

  // ---- GeoGebra ----
  const GGB_APPS = { graphing: '图形计算器', geometry: '几何', '3d': '3D 计算器', classic: '经典', cas: 'CAS 计算器', probability: '概率统计', suite: '计算器套件' };
  GW.GGB_APPS = GGB_APPS;
  GW.defineKind('ggb', {
    chrome: 'window',
    title: (o) => 'GeoGebra · ' + (o.data.name || GGB_APPS[o.data.app] || ''),
    create(o, body) {
      // 2.0.7：桌面端改用主进程的 http://127.0.0.1 本地服务承载 ggb.html 与离线包。
      // GeoGebra 的 GWT 引导按 location.protocol 分支，app:// 自定义协议下模块能起来
      // 但画板永远不渲染；标准 http:// 是官方验证过的环境。src 等拿到基址再设，
      // 避免 iframe 先加载一次 app:// 再跳 http://。
      const f = h('iframe', { allow: 'fullscreen' });
      body.append(f);
      let httpBase = '';
      const boot = () => {
        if (window.gewu && typeof window.gewu.ggbHttpBase === 'function') {
          window.gewu.ggbHttpBase().then((u) => {
            httpBase = u || '';
            f.src = httpBase ? httpBase + 'ggb.html' : 'ggb.html';
          }).catch(() => { f.src = 'ggb.html'; });
          return;
        }
        f.src = 'ggb.html';
      };
      boot();
      // 2.0.7：离线包地址是「候选列表」，由 ggb.html 逐个试 deployggb.js。
      const initFrame = () => {
        const REL = 'ggb/GeoGebra/HTML5/5.0/web3d/';   // 网页 / 安卓：构建时已预解压到 ggb/
        const send = (bases, error) => {
          if (!f.contentWindow) return;   // 卡片在这期间被关掉了
          f.contentWindow.postMessage({
            type: 'init', app: o.data.app || 'classic', base64: o.data.base64 || null,
            materialId: o.data.materialId || null,
            codebases: bases, codebase: bases[0], error: error || null,
          }, '*');
        };
        const custom = GW.settings.ggbPath ? GW.fileURL(GW.settings.ggbPath) : null;
        const finish = (builtIn, error) => {
          const list = [custom, builtIn, REL].filter(Boolean);
          if (httpBase) list.unshift(httpBase + 'GeoGebra/HTML5/5.0/web3d/');
          send(list.filter((v, i) => list.indexOf(v) === i), error);
        };
        if (httpBase) return finish(null, null);   // 标准 http 环境，不必再解压到 userData
        if (window.gewu && typeof window.gewu.ggbEnsure === 'function') {
          window.gewu.ggbEnsure().then((r) => {
            if (r && r.web3d) return finish(GW.fileURL(r.web3d), null);   // 有路径即可用，兼容旧主进程不带 ok 的缓存
            finish(null, '内置离线包不可用：' + ((r && r.error) || '主进程未返回 web3d 路径'));
          }).catch((e) => finish(null, '内置离线包解压调用失败：' + ((e && e.message) || e)));
          return;
        }
        finish(null, null);   // 网页 / 安卓：只用预解压的相对目录
      };
      const onMsg = (e) => {
        if (e.source !== f.contentWindow || !e.data) return;
        if (e.data.type === 'ggb-ready') {
          initFrame();
        } else if (e.data.type === 'ggb-state') {
          o.data.base64 = e.data.base64; GW.markDirty();
        }
      };
      addEventListener('message', onMsg);
      return { destroy() { removeEventListener('message', onMsg); } };
    },
    defaultSize: () => ({ w: 1100, h: 680 }),
  });

  // ---- 内置仿真 ----
  GW.defineKind('sim', {
    chrome: 'window',
    title: (o) => { const d = GW.sims[o.data.sim]; return d ? d.name : o.data.sim; },
    headButtons(o, add) {
      add('refresh', '重新开始', () => { o.data.state = {}; unmount(o); mount(o); GW.markDirty(); });
      add('bg', '仿真背景', () => simBackgroundDialog(o.id));
    },
    create(o, body) {
      const def = GW.sims[o.data.sim];
      if (!def) { body.append(h('div', { class: 'obj-error' }, '找不到仿真：' + o.data.sim)); return; }
      o.data.state = o.data.state || {};
      const inner = h('div', { class: 'sim-root' });
      inner.__gwNativeSim = true;
      inner.__gwSimBackground = o.data.simBackground;
      // 让 simKit 拿到持久化载体：参数面板里各控件的值、以及「面板收起」状态都记进 o.data.state
      inner.__gwState = o.data.state;
      const saveState = () => {
        GW.markDirty();
        // 1.2.0 协同：滑块/参数变了立刻让另一端跟上（仿真自己的播放循环另有轮询泵）
        if (GW.netLive && o.data.state) GW.netLive('sim', { k: 'sim', id: o.id, state: o.data.state });
      };
      inner.__gwSave = saveState;
      body.append(inner);
      const inst = def.create({ root: inner, state: o.data.state, save: saveState }) || {};
      // 把仿真自己暴露的只读调试面（棱上点/屏幕坐标等）透传出去，应用内探针要用。
      return {
        destroy: () => inst.destroy && inst.destroy(),
        get state() { return inst.state; },
        points: inst.points && (() => inst.points()),
        screen: inst.screen && ((p) => inst.screen(p)),
        setMode: inst.setMode && ((m) => inst.setMode(m)),
        getMode: inst.getMode && (() => inst.getMode()),
        section: inst.section && (() => inst.section()),
        // B2（1.7.6 修复）：LAN 同步改完 o.data.state 后调 GW.objects.update(o)，
        // 宿主的 update() 只会转发到 onUpdate。统一模型试点由此把新参数灌进
        // 实际运算状态 S 和面板控件，而不是让已挂载卡片继续用旧值跑。
        onUpdate() {
          inner.__gwSetBackground?.((GW.objects.byId(o.id) || o).data.simBackground);
          if (!inst || !inst.applyParams) return;    // 其它仿真没有统一入口，保持旧行为
          let st = o.data.state || (o.data.state = {});
          if (inst.state && inst.state !== st) {
            // 引用被替换过：并回实例持有的原对象，再把板书数据指回去，
            // 否则本机后续调参仍写旧对象，保存重开会把新值丢掉。
            Object.keys(inst.state).forEach((k) => { if (!(k in st)) delete inst.state[k]; });
            Object.assign(inst.state, st);
            o.data.state = inst.state;
            st = o.data.state;
          }
          inner.__gwState = st;
          inst.applyParams(st, { silent: true });   // 静默：不再反向广播
        },
      };
    },
    defaultSize: (d) => { const def = GW.sims[d.sim]; return def ? { w: def.width, h: def.height } : { w: 900, h: 600 }; },
  });

  // ---- 文件卡片（exe、PPT、Word 等外部程序） ----
  const EXT_LABEL = { exe: '应用程序', lnk: '快捷方式', ppt: 'PowerPoint', pptx: 'PowerPoint', doc: 'Word 文档', docx: 'Word 文档', xls: 'Excel', xlsx: 'Excel', ggb: 'GeoGebra', mp3: '音频', zip: '压缩包', wps: 'WPS', dps: 'WPS 演示', et: 'WPS 表格', html: '网页', txt: '文本', bat: '批处理', url: '网址' };
  GW.defineKind('file', {
    chrome: 'bare', minW: 200, minH: 120,
    title: (o) => o.data.name,
    create(o, body) {
      const ext = (o.data.ext || '').toLowerCase();
      const icon = h('div', { class: 'fc-icon' }, ext.toUpperCase().slice(0, 4));
      // 能力探测：桌面桥有真 fileIcon，网页/安卓 shim 里的同名函数恒返回 ''（画个后缀字块就够了）。
      const g = window.gewu;
      if (g && typeof g.fileIcon === 'function') {
        Promise.resolve(g.fileIcon(o.data.path)).then((u) => { if (u) { icon.innerHTML = ''; icon.append(h('img', { src: u })); } }).catch(() => {});
      }
      // 打开本地程序只有桌面桥能做到：网页版与安卓外壳的 openPath 是「返回 false 的空桩」。
      // 探到函数只是必要条件，所以还要看返回值 —— 拿不到就明确告诉用户为什么打不开，而不是让按钮点了没反应。
      const open = (desktopMode) => {
        const w = window.gewu;
        if (!w || typeof w.openPath !== 'function') return GW.toast('这台设备无法打开本地程序（只有桌面版能调起 Office / WPS 等外部软件）');
        return Promise.resolve(w.openPath(o.data.path, { desktopMode })).then((err) => {
          if (!err) return;                 // 桌面桥成功时返回空串
          // 网页/安卓的空桩返回 false：说明这台设备根本没有调起本地程序的能力
          if (err === false) return GW.toast('这台设备无法打开本地程序（只有桌面版能调起 Office / WPS 等外部软件）');
          GW.toast('打开失败：' + err);
        }).catch((e) => GW.toast('打开失败：' + ((e && e.message) || e)));
      };
      const actions = h('div', { class: 'fc-actions' },
        h('button', { class: 'gw-btn primary', onclick: () => open(false) }, '▶ 打开'),
        h('button', { class: 'gw-btn', title: '打开后显示桌面悬浮球，可在任意软件上批注', onclick: () => open(true) }, '✎ 打开并批注'));
      if (/^(pptx?|ppsx?|docx?|xlsx?|dps|wps|et)$/.test(ext)) actions.append(h('button', { class: 'gw-btn', onclick: () => GW.importer.officeToCanvas(o.data.path, o) }, '⇩ 转为页面'));
      body.append(h('div', { class: 'file-card' }, icon, h('div', { class: 'fc-name' }, o.data.name), h('div', { class: 'fc-type' }, EXT_LABEL[ext] || ext.toUpperCase() + ' 文件'), actions));
      // 双击卡片空白处 = 打开。但双击「打开并批注」按钮不能被当成双击卡片，
      // 否则同一次双击既触发 open(false) 又触发按钮的 open(true)，两个动作打架。
      body.addEventListener('dblclick', (e) => { if (!e.target.closest('.fc-actions')) open(false); });
    },
    defaultSize: () => ({ w: 300, h: 230 }),
  });

  // ---- 文本框 / 便签 ----
  // ---------- 文本格式条（1.6.6 T13）----------
  // 只走 execCommand：contenteditable 里它最稳，且序列化的是 innerHTML，
  // <b>/<i>/<u>/<sup>/<sub> 能原样写进 .gewu，导出时按对象栅格化也不会丢。
  let txtBar = null, txtEd = null, txtObj = null;
  // 1.7.4（R10）：字体清单。桌面端有 navigator.queryLocalFonts 就取系统字体（中文字体不打包），
  // 网页端没有就只用内置的几个字体栈 —— 一律走 fontFamily，不下载任何字体文件。
  GW.fonts = {
    builtin: [
      { id: '', label: '默认' },
      { id: 'Kalam, cursive', label: '手写' },
      { id: 'KaiTi, STKaiti, serif', label: '楷体' },
      { id: '"Microsoft YaHei", "PingFang SC", sans-serif', label: '黑体' },
      { id: 'SimSun, serif', label: '宋体' },
    ],
    _list: null,
    list() {
      if (this._list) return this._list;
      this._list = this.builtin.slice();
      return this._list;
    },
    async loadSystem() {
      try {
        if (!navigator.queryLocalFonts) return this.list();
        const fonts = await navigator.queryLocalFonts();
        const seen = {};
        const pref = ['PingFang', 'Microsoft YaHei', 'Noto Sans CJK', 'Source Han', 'KaiTi', 'SimSun', 'SimHei', 'FangSong'];
        const names = [];
        for (const f of fonts) {
          const fam = f && f.family;
          if (!fam || seen[fam] || fam.length > 24) continue;
          seen[fam] = 1;
          if (pref.some((p) => fam.toLowerCase().indexOf(p.toLowerCase()) >= 0)) names.push(fam);
        }
        names.slice(0, 12).forEach((fam) => this._list.push({ id: '"' + fam + '", sans-serif', label: fam }));
      } catch (e) { /* 权限被拒/不支持：只用内置清单 */ }
      return this._list;
    },
  };
  function txtBarPlace() {
    if (!txtBar || !txtEd || !txtBar.classList.contains('on')) return;
    const r = txtEd.getBoundingClientRect();
    txtBar.style.left = Math.round(r.left) + 'px';
    txtBar.style.top = Math.max(6, Math.round(r.top) - 38) + 'px';
  }
  function txtBarShow(ed, o) {
    if (!txtBar) {
      txtBar = h('div', { class: 'txt-bar' });
      [['bold', 'B', '加粗'], ['italic', 'I', '斜体'], ['underline', 'U', '下划线'],
        ['superscript', 'x²', '上标'], ['subscript', 'x₂', '下标'], ['removeFormat', '清除', '清除格式']]
        .forEach(([cmd, label, tip]) => {
          const b = h('button', { class: 'tb-btn', type: 'button', title: tip, 'data-cmd': cmd }, label);
          b.addEventListener('mousedown', (e) => e.preventDefault());   // 别让按钮抢走编辑框的选区
          b.addEventListener('click', () => {
            if (!txtEd) return;
            try { document.execCommand(cmd, false, null); } catch (err) { /* 老内核不支持就当没点 */ }
            txtEd.focus();
            txtBarPlace();
          });
          txtBar.append(b);
        });
      document.body.append(txtBar);
      window.addEventListener('resize', txtBarPlace);
      window.addEventListener('scroll', txtBarPlace, true);
      // 1.7.4（R10）：字体下拉。选中的字体作用于**整个文本框**（板书字体，不是局部字符），
      // 值存 o.data.font，随 .gewu 走；空串表示用主题默认字体。
      const sel = h('select', { class: 'tb-font', title: '字体' });
      const fill = () => {
        const cur = (txtObj && txtObj.data && txtObj.data.font) || '';
        sel.innerHTML = '';
        GW.fonts.list().forEach((f) => {
          const op = h('option', { value: f.id }, f.label);
          if (f.id === cur) op.selected = true;
          sel.append(op);
        });
      };
      fill();
      sel.addEventListener('mousedown', (e) => e.stopPropagation());
      sel.addEventListener('change', () => {
        if (!txtObj) return;
        txtObj.data.font = sel.value || '';
        if (txtEd) txtEd.style.fontFamily = txtObj.data.font;
        GW.markDirty && GW.markDirty();
      });
      txtBar.append(sel);
      GW.fonts.loadSystem().then(fill);
    }
    txtEd = ed; txtObj = o || null;
    txtBar.classList.add('on');
    txtBarPlace();
  }
  function txtBarHide(ed) {
    if (txtEd && ed && txtEd !== ed) return;   // 别的文本框正在编辑，不动它的条
    txtEd = null;
    if (txtBar) txtBar.classList.remove('on');
  }
  // 1.7.0（T04）：相机平移/缩放后由 board.js 调它，把格式条重新贴到编辑框上方，
  // 否则编辑中缩放一下，格式条就留在屏幕原处、离编辑框越来越远。
  GW.txtBarPlace = txtBarPlace;

  GW.defineKind('text', {
    chrome: 'bare', editable: true, minW: 60, minH: 30,
    title: (o) => (o.data.note ? '便签' : '文本'),
    create(o, body, el) {
      const d = o.data;
      const ed = h('div', { class: 'text-ed', contenteditable: 'false', spellcheck: 'false' });
      ed.innerHTML = d.html || '';
      const apply = () => {
        ed.style.fontSize = (d.size || 32) + 'px';
        // 2.2.7：文本同理，显示时补一次自动反差；存的数据不动。
        const c1 = d.color || '';
        ed.style.color = c1 ? (GW.inkFix ? GW.inkFix(c1) : c1) : '';
        ed.style.fontFamily = d.font || '';
        body.style.background = d.note ? d.note : '';
        body.classList.toggle('note', !!d.note);
      };
      apply();
      body.append(ed);
      let before = null;
      const startEdit = () => {
        if (ed.isContentEditable) return;
        before = GW.clone(o);
        ed.contentEditable = 'true'; el.classList.add('editing'); ed.focus();
        const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        txtBarShow(ed, o);
      };
      ed.addEventListener('dblclick', startEdit);
      ed.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') ed.blur(); });
      ed.addEventListener('input', () => { autoH(); txtBarPlace(); });
      const autoH = () => { const need = ed.scrollHeight + 4; if (need > o.h) { o.h = need; el.style.height = o.h + 'px'; } };
      ed.addEventListener('blur', () => {
        txtBarHide(ed);
        ed.contentEditable = 'false'; el.classList.remove('editing');
        if (!ed.textContent.trim() && !ed.querySelector('img')) { GW.removeItems([o], !!before && !!before.data.html); return; }
        d.html = ed.innerHTML;
        if (before && (before.data.html !== d.html || (before.data.font || '') !== (d.font || ''))) GW.commit({ update: [{ before, after: o }] });
        else if (before && !before.data.html) GW.commit({ add: [o] });
        before = null;
      });
      if (o._autoEdit) { delete o._autoEdit; setTimeout(startEdit, 30); }
      return { startEdit, onUpdate: apply };
    },
    defaultSize: () => ({ w: 420, h: 60 }),
  });

  // ---- 评论钉（1.6.7 / T15）----
  // 钉在页面上的一枚小徽标：单击弹出编辑框，可写/改/标已解决/删除。
  // 数据全在 o.data（num / text / resolved / at），随 .gewu 一起走，不联网、不要账号。
  GW.defineKind('comment', {
    chrome: 'bare', keepAspect: true, minW: 24, minH: 24,
    title: (o) => '评论' + (o.data && o.data.num ? ' #' + o.data.num : ''),
    create(o, body, el) {
      const pin = h('button', { class: 'cm-pin' });
      const num = h('span', { class: 'cm-num' });
      pin.append(num);
      body.append(pin);
      const render = () => {
        const d = o.data || {};
        num.textContent = d.num || '';
        el.classList.toggle('cm-done', !!d.resolved);
        el.classList.toggle('cm-empty', !d.text);
        pin.title = (d.resolved ? '已解决 · ' : '') + (d.text || '还没有内容，单击写一条');
      };
      pin.addEventListener('click', (e) => { e.stopPropagation(); if (GW.commentEditor) GW.commentEditor(o); });
      render();
      // 双击标题栏以外的地方也打开（手机上单击容易误触拖动）
      body.addEventListener('dblclick', (e) => { e.stopPropagation(); if (GW.commentEditor) GW.commentEditor(o); });
      return { onUpdate: render };
    },
    defaultSize: () => ({ w: 30, h: 30 }),
  });
  // ---- 公式（KaTeX） ----
  GW.defineKind('formula', {
    chrome: 'bare', keepAspect: true, minW: 40, minH: 20,
    title: () => '公式',
    create(o, body) {
      const box = h('div', { class: 'formula' });
      const render = () => {
        // 2.2.7 修：颜色一律过一遍自动反差（GW.inkFix）。白笔状态下插入的公式把 #ffffff 固化在
        // data.color 里，切到白底页 / 导印后就是白字看不见；inkFix 只在对比度 <2.8 时才把颜色往
        // 纸色对应的墨色上混（board.js 里同一套判据），深底上的白字原样保留。
        const c0 = o.data.color || '';
        box.style.color = c0 ? (GW.inkFix ? GW.inkFix(c0) : c0) : '';
        try { window.katex.render(o.data.tex || '', box, { displayMode: true, throwOnError: false }); } catch (e) { box.textContent = o.data.tex; }
        // 让公式随框缩放：按原始尺寸计算比例
        requestAnimationFrame(() => {
          const r = box.scrollWidth || 1, rh = box.scrollHeight || 1;
          const f = Math.min(o.w / r, o.h / rh);
          box.style.transform = `scale(${f})`;
        });
      };
      body.append(box);
      render();
      // 挂在 body 而不是 box 上：拖拽把指针捕获在 .obj-body 之后，dblclick 会被重定向到捕获元素，
      // 挂在 box 上的监听器收不到（实测双击公式中心，编辑次数 0 → 0）。
      body.addEventListener('dblclick', () => GW.formulaEditor(o));
      return { onUpdate: render, onResize: render };
    },
    defaultSize: () => ({ w: 420, h: 110 }),
  });
})();

/* 画布吸附（1.7.0 / T12）：纯几何、无 DOM、无相机依赖。
   输入是世界坐标矩形 {l,t,w,h}；输出是「把矩形平移 (dl,dt) 后落位」的修正量。
   两个开关（GW.settings.snapGrid / snapObjects）都在调用方：都为 false 时 correct() 恒返回零修正，
   这是反向对照的判据 —— 全关还吸得动就说明开关没真正生效。
   接线（拖动每一帧问一次、把 dl/dt 加到候选位置上）在 input.js，不在本文件。 */
(function () {
  'use strict';
  const GW = window.GW;

  const SCREEN_THR = 8;    // 屏幕 8px（阈值按屏幕算才不随缩放变「黏」）
  const DEFAULT_SIZE = 40; // 没传 snapSize 时的格距

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const num = (v, d) => (isNum(v) ? v : d);

  // 屏幕 8px 折回世界单位；GW.camera 不在（早期加载/单测）时按 8 世界单位
  function defaultThr() {
    const s = GW.camera && GW.camera.s;
    if (isNum(s) && s > 0) return SCREEN_THR / s;
    return SCREEN_THR;
  }

  // 接受 {l,t,w,h}（世界矩形）与 {x,y,w,h}（对象本体），两种写法都归一成 l/t
  function rectOf(r) {
    if (!r || typeof r !== 'object') return null;
    const l = num(r.l, num(r.x, NaN)), t = num(r.t, num(r.y, NaN));
    const w = num(r.w, NaN), hh = num(r.h, NaN);
    return (isNum(l) && isNum(t) && isNum(w) && isNum(hh)) ? { l: l, t: t, w: w, h: hh } : null;
  }

  // 每个轴各自吸到最近的格线（负数也能落到 -40 这种线）。阈值不在这里判，只在 correct 里判。
  function gridOf(r, size) {
    const s = num(size, DEFAULT_SIZE);
    if (!(s > 0)) return { dl: 0, dt: 0 };
    return { dl: Math.round(r.l / s) * s - r.l, dt: Math.round(r.t / s) * s - r.t };
  }

  // 候选线 = 每个对象的 左/中/右、上/中/下；x 与 y 各自独立取最近且不超 thr 的一条
  function objOf(r, others, thr) {
    const out = { dl: 0, dt: 0, kind: null, target: null };
    const lim = isNum(thr) && thr >= 0 ? thr : Infinity;
    const xs = [r.l, r.l + r.w / 2, r.l + r.w];
    const ys = [r.t, r.t + r.h / 2, r.t + r.h];
    let bx = Infinity, by = Infinity, tx = null, ty = null;
    const list = others || [];
    for (let i = 0; i < list.length; i++) {
      const b = rectOf(list[i]);
      if (!b) continue;
      const oxs = [b.l, b.l + b.w / 2, b.l + b.w];
      const oys = [b.t, b.t + b.h / 2, b.t + b.h];
      for (let a = 0; a < oxs.length; a++) {
        for (let c = 0; c < xs.length; c++) {
          const d = oxs[a] - xs[c];
          if (Math.abs(d) <= lim && Math.abs(d) < Math.abs(bx)) { bx = d; tx = list[i]; }
        }
      }
      for (let a = 0; a < oys.length; a++) {
        for (let c = 0; c < ys.length; c++) {
          const d = oys[a] - ys[c];
          if (Math.abs(d) <= lim && Math.abs(d) < Math.abs(by)) { by = d; ty = list[i]; }
        }
      }
    }
    if (isNum(bx)) { out.dl = bx; out.kind = 'obj'; }
    if (isNum(by)) { out.dt = by; out.kind = 'obj'; }
    // target 给「贡献了更近那一条」的对象（一样近时给 x 的）
    if (out.kind) out.target = Math.abs(out.dl) <= Math.abs(out.dt) ? (tx || ty) : (ty || tx);
    return out;
  }

  // 当前页里可用作吸附参照的对象：只收有几何包围盒的（对象盒子就是 x/y/w/h 本身）
  function othersOf(exclude, selfId) {
    const skip = {};
    if (Array.isArray(exclude)) for (let i = 0; i < exclude.length; i++) skip[exclude[i]] = 1;
    if (selfId != null) skip[selfId] = 1;
    const out = [];
    let src = [];
    try { src = (GW.page && GW.page() && GW.page().objs) || []; } catch (e) { src = []; }
    for (let i = 0; i < src.length; i++) {
      const o = src[i];
      if (!o || skip[o.id]) continue;
      if (!isNum(o.x) || !isNum(o.y) || !isNum(o.w) || !isNum(o.h)) continue;
      out.push(o);
    }
    return out;
  }

  const api = {
    // 屏幕 8px 折回世界的阈值；接线时可以直接用它填 opts.thr
    thr() { return defaultThr(); },

    // 网格吸附单独算：吸到最近的 snapSize 整数倍（也可以传 0.5 倍的间隔线）
    grid(rect, snapSize) {
      const r = rectOf(rect);
      return r ? gridOf(r, snapSize) : { dl: 0, dt: 0 };
    },

    // 对象吸附单独算：对齐到其它对象的 左/中/右、上/中/下
    objects(rect, others, thr) {
      const r = rectOf(rect);
      return r ? objOf(r, others, thr) : { dl: 0, dt: 0, kind: null, target: null };
    },

    // 候选修正量：网格与对象各算一份，取距离更小的一个
    correct(rect, opts) {
      const zero = { dl: 0, dt: 0, kind: null, dist: Infinity };
      const r = rectOf(rect);
      const o = opts || {};
      if (!r) return zero;
      if (!o.grid && !o.objects) return zero;  // 两个开关都关：一个字都不吸
      const lim = num(o.thr, defaultThr());
      const selfId = o.id != null ? o.id : rect.id;
      let best = zero;

      if (o.grid) {
        const g = gridOf(r, o.snapSize);
        // 每个轴各自判阈值 → 允许只吸一个方向；0 修正也算「已经对齐在格线上」，要能压过更远的对象线
        const okx = Math.abs(g.dl) <= lim, oky = Math.abs(g.dt) <= lim;
        if (okx || oky) {
          const dl = okx ? g.dl : 0, dt = oky ? g.dt : 0;
          const d = Math.hypot(dl, dt);
          if (d < best.dist) best = { dl: dl, dt: dt, kind: 'grid', dist: d };
        }
      }
      if (o.objects) {
        const others = o.others || othersOf(o.exclude, selfId);
        const ob = objOf(r, others, lim);
        if (ob.kind) {
          const d = Math.hypot(ob.dl, ob.dt);
          if (d < best.dist) best = { dl: ob.dl, dt: ob.dt, kind: 'obj', dist: d, target: ob.target };
        }
      }
      return best;
    },

    // 便捷函数：返回吸好的新矩形，不改入参
    apply(rect, opts) {
      const r = rectOf(rect);
      if (!r) return rect;
      const c = this.correct(r, opts);
      return { l: r.l + c.dl, t: r.t + c.dt, w: r.w, h: r.h };
    },
  };
  GW.snap = api;
})();
