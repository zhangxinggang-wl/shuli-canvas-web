// 项目空间（1.0.16）：把「导入的多页文件」当成可翻页的项目。
// 进入后只显示当前这一页，其它对象与别处的墨迹全部隐掉，画布铺满这一页；
// 底部一条浮条翻页 / 打开页面索引，Esc 或点「退出」回到整块无限画布。
// 不改渲染循环：隐墨迹靠 GW.hiddenIds（board.js 的 renderInk 本来就认它），
// 隐对象靠给 .obj 元素设 visibility —— 退出时逐个还原。
(function () {
  'use strict';
  const GW = window.GW, h = GW.h;
  const PAGE_TYPES = { pdfpage: 1, image: 1, book: 1 };

  let cur = null;            // 当前正在单页显示的 obj
  let bar = null, idxBox = null;
  let prevHidden = undefined; // 进入前的 hiddenIds（可能本来就是 null）
  let prevCam = null;
  let savedVis = null;        // [{ el, vis }]
  let keptTag = null;         // 退出后仍保留的「上一次看的那页」：别让别页的板书叠回来

  // 1.0.20：在项目空间里画的每一笔都记下「属于哪本册子的哪一页」（it.pg）。
  // 翻页时只显示当前页的笔迹 ⇒ 一张画布同一时刻只有一页内容，板书不会跨页重叠。
  function inkTag() {
    if (!cur || !isBook(cur)) return null;
    return 'b:' + cur.id + ':' + (curIdx(cur) + 1);
  }
  // 1.0.21：项目空间里只显示「当前这本册子、当前这一页」的笔迹：
  //   · 主画布上画的笔迹（没有 pg）一律不进项目空间 —— 它属于「无限画布」，不属于某页；
  //   · 别的页的笔迹也不显示，避免翻页后板书叠在一起；
  //   · 退出空间后全部恢复显示（主画布本来就是整块板书，不需要藏）。
  function hideInkItem(it) {
    const t = inkTag();
    if (!t || !it) return false;
    if (!it.pg) return true;
    return it.pg !== t;
  }
  // 给「在项目空间里新落的墨迹」打页标记。挂 addItems 上，是因为 undo 历史里存的
  // 就是这次 add 的对象本身，标记必须在 commit 之前写好，撤销重做才不会丢。
  (function tagInkOnAdd() {
    const add = GW.addItems;
    if (!add || add._spaceTagged) return;
    GW.addItems = function (items, record, opts) {
      const t = inkTag();
      if (t && items) {
        const list = Array.isArray(items) ? items : [items];
        for (const it of list) if (it && it.kind !== 'obj' && !it.pg) it.pg = t;
      }
      return add.apply(this, arguments);
    };
    GW.addItems._spaceTagged = 1;
  })();

  // 同一份文件的多页：1.0.16 起导入时会打 data.pg（组）/pn（页号）/pc（总页数）。
  // 老文档没打标记，就按页面上「同类的页面对象」从上到下兜底，至少能翻。
  function pagesOf(o) {
    if (!o) return [];
    if (!PAGE_TYPES[o.type]) return [o];   // 不是页面：它就是「单页项目」，别去串别的 PDF
    if (o.type === 'book') return [o];     // 册子：一个对象内部 N 页，页数由 data.n 给
    const objs = GW.page().objs;
    const gid = o.data && o.data.pg;
    if (gid) {
      const same = objs.filter((x) => x !== o && x.data && x.data.pg === gid);
      if (same.length) return [o].concat(same).sort((a, b) => (a.data.pn || 0) - (b.data.pn || 0));
    }
    const docs = objs.filter((x) => PAGE_TYPES[x.type]).sort((a, b) => (a.y - b.y) || (a.x - b.x));
    return docs.length > 1 ? docs : [o];
  }
  // 册子（1.0.19）：一个对象里有 N 页，翻页发生在对象内部，不换对象
  function isBook(o) { return !!o && o.type === 'book'; }
  function bookN(o) { return GW.books ? GW.books.total(o) : Math.max(1, (o.data && (o.data.n || o.data.pc)) || 1); }
  function listLen(o) { return isBook(o) ? bookN(o) : pagesOf(o).length; }
  function curIdx(o) { return isBook(o) ? (GW.books ? GW.books.page(o) : 1) - 1 : idxOf(pagesOf(o)); }
  function idxOf(list) {
    for (let i = 0; i < list.length; i++) if (list[i] === cur) return i;
    return 0;
  }
  function fit(o) {
    const s = GW.camera.s || 1;
    GW.stopView && GW.stopView();
    GW.fitRect({ x: o.x, y: o.y - 46 / s, w: o.w, h: o.h + 46 / s }, 26);
  }
  function hideOthers(o) {
    if (!savedVis) savedVis = [];
    for (const x of GW.page().objs) {
      if (!x._el) continue;
      if (x === o) { x._el.style.visibility = ''; continue; }
      if (!savedVis.some((v) => v.el === x._el)) savedVis.push({ el: x._el, vis: x._el.style.visibility });
      x._el.style.visibility = 'hidden';
    }
  }
  function hideInk(o) {
    // 页面矩形附近的墨迹留着（老师可能已经在这一页上写过），远处的隐掉
    GW.hiddenIds = new Set();
    const R = o, s = GW.camera.s || 1, pad = 24 / s;
    for (const it of GW.page().ink) {
      let b;
      try { b = GW.bbox(it); } catch (_) { continue; }
      if (!b) continue;
      const near = b.x + b.w > R.x - pad && b.x < R.x + R.w + pad && b.y + b.h > R.y - pad && b.y < R.y + R.h + pad;
      if (!near) GW.hiddenIds.add(it.id);
    }
  }
  function restore() {
    // 严格还原成进入前的值（可能是 undefined：从没设过 hiddenIds 时保持 undefined，
    // 不能顺手写成 null —— 探针与后续代码都靠 === 判断「有没有变」）
    GW.hiddenIds = prevHidden;
    prevHidden = undefined;
    if (savedVis) for (const v of savedVis) v.el.style.visibility = v.vis;
    savedVis = null;
    if (prevCam) { GW.stopView && GW.stopView(); GW.setView(prevCam.tx, prevCam.ty, prevCam.s); prevCam = null; }
  }

  // ---------- 底部浮条 ----------
  function label() {
    if (isBook(cur)) {
      const name = (cur.data && cur.data.name) || cur._kindTitle || '册子';
      return '第 ' + (curIdx(cur) + 1) + '/' + bookN(cur) + ' 页 · ' + String(name).replace(/\.[a-z0-9]+$/i, '');
    }
    const list = pagesOf(cur);
    const i = idxOf(list);
    const name = (cur.data && (cur.data.name || cur.data.title)) || cur._kindTitle || '当前页';
    const pn = cur.data && cur.data.pn, pc = cur.data && cur.data.pc;
    const pos = pc ? (pn + 1) + '/' + pc : (i + 1) + '/' + list.length;
    return '第 ' + pos + ' 页 · ' + String(name).replace(/\.[a-z0-9]+$/i, '');
  }
  function buildBar() {
    if (bar) {
      bar.querySelector('.space-lbl').textContent = label();
      if (bar._upd) bar._upd();
      return;
    }
    const prev = h('button', { class: 'space-b', title: '上一页（PageUp / ←）', html: GW.icon('chevronL') });
    const next = h('button', { class: 'space-b', title: '下一页（PageDown / →）', html: GW.icon('chevronR') });
    const lab = h('span', { class: 'space-lbl' }, label());
    const idx = h('button', { class: 'space-b space-txt', title: '页面索引（Ctrl+G）' }, '页码');
    const out = h('button', { class: 'space-b space-txt', title: '退出项目空间（Esc）' }, '退出');
    prev.onclick = () => go(-1);
    next.onclick = () => go(1);
    idx.onclick = () => openIndex();
    out.onclick = () => exit();
    bar = h('div', { class: 'space-bar' }, prev, lab, next, h('span', { class: 'space-sep' }), idx, out);
    document.body.append(bar);
    const disabled = () => {
      const n = listLen(cur), i = curIdx(cur);
      bar._di = i; bar._dn = n;
      prev.disabled = n < 2 || i <= 0;
      next.disabled = n < 2 || i >= n - 1;
    };
    bar._upd = disabled;
    disabled();
  }
  function go(d) {
    if (!cur) return;
    if (isBook(cur)) {                        // 册子：翻的是对象内部页号
      const n = bookN(cur);
      if (n < 2) return;
      const p = Math.max(1, Math.min(n, curIdx(cur) + 1 + d));
      if (p === curIdx(cur) + 1) return;
      // 走册子自己的翻页动效（body._flip 会转一页、画新页、刷渲染）
      const el = cur._el && (cur._el.querySelector('.obj-body.book') || cur._el.querySelector('.obj-body'));
      if (el && el._flip) el._flip(d);
      else if (GW.books) GW.books.setPage(cur, p);
      if (bar && bar._upd) bar._upd();
      buildBar();
      GW.requestRender();
      return;
    }
    const list = pagesOf(cur);
    if (list.length < 2) return;
    const i = idxOf(list), j = Math.max(0, Math.min(list.length - 1, i + d));
    if (j === i) return;
    show(list[j]);
  }
  function show(o) {
    if (!o) return;
    cur = o;
    hideOthers(o); hideInk(o);
    fit(o);
    if (bar && bar._upd) bar._upd();
    buildBar();
    GW.requestRender();
  }
  function openIndex() {
    if (!cur) return;
    if (idxBox) { idxBox.remove(); idxBox = null; return; }
    const grid = h('div', { class: 'space-grid' });
    if (isBook(cur)) {
      const n = bookN(cur), at = curIdx(cur) + 1;
      for (let i = 1; i <= n; i++) {
        const b = h('button', { class: 'space-chip' + (i === at ? ' on' : '') }, String(i));
        b.onclick = () => { closeIndex(); if (GW.books) GW.books.setPage(cur, i); show(cur); };
        grid.append(b);
      }
      idxBox = h('div', { class: 'space-index' },
        h('div', { class: 'space-it' }, '页面索引 · 共 ' + n + ' 页'),
        grid,
        h('div', { class: 'space-tip' }, '点页码直接跳；Esc 退出项目空间'));
      document.body.append(idxBox);
      return;
    }
    const list = pagesOf(cur);
    list.forEach((o, i) => {
      const pn = o.data && o.data.pn, n = pn != null ? pn + 1 : i + 1;
      const b = h('button', { class: 'space-chip' + (o === cur ? ' on' : '') }, String(n));
      b.onclick = () => { closeIndex(); show(o); };
      grid.append(b);
    });
    idxBox = h('div', { class: 'space-index' },
      h('div', { class: 'space-it' }, '页面索引 · 共 ' + list.length + ' 页'),
      grid,
      h('div', { class: 'space-tip' }, '点页码直接跳；Esc 退出项目空间'));
    document.body.append(idxBox);
  }  function closeIndex() { if (idxBox) { idxBox.remove(); idxBox = null; } }

  // ---------- 进出 ----------
  function enter(o) {
    if (!o) return;
    if (cur === o) { exit(); return; }
    if (cur) {               // 已经在空间里：换页，不恢复相机
      show(o);
      return;
    }
    cur = o;
    keptTag = null;
    prevHidden = GW.hiddenIds === undefined ? undefined : GW.hiddenIds;
    prevCam = { tx: GW.camera.tx, ty: GW.camera.ty, s: GW.camera.s };
    document.body.dataset.space = '1';
    GW.selection.clear();
    show(o);
    GW.toast('已进入项目空间：底部翻页，Esc 退出', 2200);
  }
  function exit() {
    if (!cur) return;
    keptTag = null;          // 1.0.21：退出后不再按页藏笔迹，主画布恢复成整块板书
    cur = null;
    closeIndex();
    if (bar) { bar.remove(); bar = null; }
    delete document.body.dataset.space;
    restore();
    GW.requestRender();
  }
  function toggle() {
    if (cur) { exit(); return; }
    let target = GW.selection.items.find((x) => PAGE_TYPES[x.type]) || null;
    if (!target) target = nearestPage();
    if (target) enter(target);
    else GW.toast('先选中一个页面（导入的 PDF / PPT / 图片），或点它标题栏上的「单页」按钮', 2600);
  }
  // 没选中时：找视口中心最近的页面对象
  function nearestPage() {
    const vr = GW.viewRect(), cx = vr.x + vr.w / 2, cy = vr.y + vr.h / 2;
    let best = null, bd = Infinity;
    for (const o of GW.page().objs) {
      if (!PAGE_TYPES[o.type]) continue;
      const d = Math.abs(o.x + o.w / 2 - cx) + Math.abs(o.y + o.h / 2 - cy);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  GW.space = {
    enter: enter, exit: exit, toggle: toggle, openIndex: openIndex, pages: pagesOf,
    isOn: () => !!cur, current: () => cur,
    inkTag: () => inkTag() || keptTag, hideInkItem: hideInkItem,
    showAllInk: () => { keptTag = null; GW.requestRender(); },
  };

  // 键盘：Esc 退出 / ←→ 翻页 / Ctrl+G 页码。输入框里不抢。
  window.addEventListener('keydown', (e) => {
    if (!cur) return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    if (e.key === 'Escape') { e.preventDefault(); exit(); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(1); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); openIndex(); }
  });

  // 当前页被删掉（或删了又撤销）：自动退出，别停在一个空壳里
  GW.bus.on('objremove', (o) => {
    if (!cur) return;
    if (o === cur || !GW.page().objs.includes(cur)) exit();
  });
})();
