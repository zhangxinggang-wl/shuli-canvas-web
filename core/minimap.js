/* 数理无限画布 · 小地图 + 缩放菜单（1.7.0 · T11）
 *
 * 干什么：右下角一块 160×120 的小图，内容是当前页缩略图 + 蓝色半透明视口框；
 * 点/拖小地图 → 视口中心跟到那一点（**不改缩放**，fitRect 会改缩放所以不用它）；
 * 右键菜单给两项：「100%」与「适合内容」。
 *
 * 三条硬约定：
 *  1) 把整幅页重画进 160×120 在软件渲染下是纯 CPU 全屏滤波（perf.js:18-22 的实测），
 *     所以 refresh() 内部限频 ≥250ms：限频期间返回 false 且不重绘。拖动/书写只调 refreshSoon()。
 *  2) 世界→缩略图的映射必须与 GW.renderThumb（board.js:1801）逐字一致：
 *     s = min(tw/b.w, th/b.h) * 0.9，并按内容包围盒中心对齐（TW/2 - (b.x+b.w/2)*s）。
 *     不一致的话视口框与点击落点都会错位。
 *  3) 不用 desynchronized:true（perf.js 的约定，它会与 CSS 变换的快速通道打架）；
 *     refresh() 里所有异常自吞 —— 小地图坏了绝不能让主画布崩。
 *
 * 数据源：GW.page() / GW.camera / GW.renderThumb / GW.contentBounds / GW.viewRect / GW.viewCenter / GW.setView
 * 对外 API（主代理按这个接线）：
 *   GW.minimap = { mount, show, hide, toggle, visible, refresh, refreshSoon, el, destroy }
 */
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW) return;

  const TW = 160;              // 缩略图宽（位图与 CSS 都是这个值：缩放画布不会缩它）
  const TH = 120;
  const MIN_MS = 250;          // 限频下限
  const PAD = 0.9;             // 与 board.js:1808 的 `* 0.9` 保持一致
  const MAP_BOTTOM = 76;       // 14(bar-bottom) + 52(#pagebar 高) + 10 间隙：让开右下角的页码条
  const STYLE_ID = 'gw-minimap-style';

  let box = null;              // .gw-minimap 容器
  let cv = null;               // 160×120 的 canvas
  let ctx = null;
  let menu = null;             // 右键菜单（挂在 body 上，position:fixed）
  let styleEl = null;
  let shown = false;           // 逻辑可见（DOM 的 display 跟着它）
  let lastAt = -1e9;           // 上次真正重绘的时间（performance.now）
  let pending = false;         // refreshSoon 已排队
  let rafId = 0, timerId = 0;
  let dragging = false, winOn = false;
  let map = null;              // 最近一次绘制用的 世界→缩略图 映射 {s, ox, oy}
  const offs = [];             // GW.bus 退订函数

  // ---------- 样式（只注一次；destroy 时删掉） ----------
  function injectStyle() {
    if (styleEl && styleEl.isConnected) return;
    const old = document.getElementById(STYLE_ID);
    if (old) { styleEl = old; return; }
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = [
      '.gw-minimap{position:fixed;right:14px;bottom:' + MAP_BOTTOM + 'px;z-index:38;',
      '  border-radius:8px;border:1px solid rgba(20,30,50,.22);background:rgba(255,255,255,.82);',
      '  box-shadow:0 4px 14px rgba(20,30,50,.16);overflow:hidden;pointer-events:auto;',
      '  display:none;touch-action:none;user-select:none;-webkit-user-select:none}',
      '.gw-minimap>canvas{display:block;width:' + TW + 'px;height:' + TH + 'px;',
      '  cursor:crosshair;touch-action:none}',
      '.gw-minimap-menu{position:fixed;z-index:39;display:none;flex-direction:column;min-width:104px;',
      '  padding:4px;background:rgba(255,255,255,.98);border-radius:10px;',
      '  box-shadow:0 8px 24px rgba(20,30,50,.22),0 0 0 1px rgba(20,30,50,.08)}',
      '.gw-minimap-menu button{display:block;width:100%;padding:6px 10px;border:0;background:transparent;',
      '  font:13px/1.4 system-ui,"Microsoft YaHei",sans-serif;color:#1b2433;text-align:left;',
      '  border-radius:6px;cursor:pointer}',
      '.gw-minimap-menu button:hover{background:rgba(36,110,240,.1)}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(styleEl);
  }

  // ---------- DOM ----------
  function mount() {
    try {
      if (box && box.isConnected) return true;
      injectStyle();
      box = document.createElement('div');
      box.className = 'gw-minimap';
      box.setAttribute('data-gw-minimap', '1');
      cv = document.createElement('canvas');
      cv.width = TW;
      cv.height = TH;
      cv.setAttribute('aria-label', '小地图');
      // 普通 2d ctx：**不许** desynchronized:true
      ctx = cv.getContext('2d');
      box.appendChild(cv);
      document.body.appendChild(box);

      menu = document.createElement('div');
      menu.className = 'gw-minimap-menu';
      const mk = (label, act) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', (ev) => { ev.stopPropagation(); try { act(); } catch (e) { /* 自吞 */ } closeMenu(); });
        menu.appendChild(b);
      };
      mk('100%', zoom100);
      mk('适合内容', () => { try { GW.fitContent(); } catch (e) { /* 自吞 */ } refreshSoon(); });
      document.body.appendChild(menu);

      cv.addEventListener('contextmenu', onCtx);
      cv.addEventListener('pointerdown', onDown);
      cv.addEventListener('pointermove', onMove);
      cv.addEventListener('pointerup', onUp);
      cv.addEventListener('pointercancel', onUp);
      document.addEventListener('pointerdown', onDocDown, true);
      document.addEventListener('keydown', onKey, true);

      // 画布变了就低频跟一下：事件只做「标记」，真正的重绘在 refreshSoon 里排队 + 限频
      ['view', 'dirty', 'page', 'doc-loaded', 'stroke-end', 'history'].forEach((ev) => {
        try {
          if (GW.bus && GW.bus.on) offs.push(GW.bus.on(ev, () => refreshSoon()));
        } catch (e) { /* 没这个事件就算 */ }
      });
      return true;
    } catch (e) {
      box = null; cv = null; ctx = null;
      return false;
    }
  }

  // ---------- 世界 ↔ 缩略图 ----------
  // 与 GW.renderThumb 的变换逐字一致；没有内容时退回「把当前视口铺满」，这样空页点小地图也能动视口。
  function computeMap(page) {
    let b = null;
    try { if (page && GW.contentBounds) b = GW.contentBounds(page); } catch (e) { b = null; }
    if (b && b.w > 0 && b.h > 0) {
      const s = Math.min(TW / b.w, TH / b.h) * PAD;
      return { s: s, ox: TW / 2 - (b.x + b.w / 2) * s, oy: TH / 2 - (b.y + b.h / 2) * s };
    }
    const vr = viewRect();
    if (!vr || !(vr.w > 0) || !(vr.h > 0)) return null;
    const s = Math.min(TW / vr.w, TH / vr.h) * 0.98;
    return { s: s, ox: TW / 2 - (vr.x + vr.w / 2) * s, oy: TH / 2 - (vr.y + vr.h / 2) * s };
  }

  function viewRect() {
    try {
      if (GW.viewRect) { const r = GW.viewRect(); if (r && r.w > 0 && r.h > 0) return r; }
    } catch (e) { /* 退到下面的手算 */ }
    try {
      const a = GW.toWorld(0, 0), b = GW.toWorld(innerWidth, innerHeight);
      return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    } catch (e) { return null; }
  }

  // ---------- 重绘 ----------
  function draw() {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, TW, TH);
    ctx.fillStyle = '#f7f8fa';
    ctx.fillRect(0, 0, TW, TH);

    const page = (typeof GW.page === 'function') ? GW.page() : null;
    if (page && typeof GW.renderThumb === 'function') {
      const thumb = GW.renderThumb(page, TW, TH);
      if (thumb) ctx.drawImage(thumb, 0, 0);
    }
    map = computeMap(page);
    if (!map || !(map.s > 0)) return;

    const vr = viewRect();
    if (!vr) return;
    const x = vr.x * map.s + map.ox, y = vr.y * map.s + map.oy;
    const w = vr.w * map.s, h = vr.h * map.s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, TW, TH);
    ctx.clip();
    ctx.fillStyle = 'rgba(56,132,255,.16)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(36,110,240,.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  // 返回值：0 = 真画了；1 = 被限频（不重绘）；-1 = 出错 / 没挂上
  function drawOnce() {
    if (!ctx) return -1;
    const now = performance.now();
    if (now - lastAt < MIN_MS) return 1;
    lastAt = now;
    try { draw(); return 0; } catch (e) { return -1; }
  }

  function refresh() {
    if (!mount()) return false;
    return drawOnce() === 0;
  }

  function run() {
    rafId = 0;
    if (!pending) return;
    if (!shown || !box) { pending = false; return; }
    const r = drawOnce();
    if (r === 1) {
      // 还在限频窗口里：等窗口过去再来一次（只排一次，不递归堆定时器）
      timerId = setTimeout(function () { timerId = 0; run(); }, Math.max(16, MIN_MS - (performance.now() - lastAt) + 8));
      return;
    }
    pending = false;
  }

  function refreshSoon() {
    if (!mount()) return false;
    if (!shown) return false;      // 不可见就不画（省掉整幅缩略图的光栅化）
    if (pending) return true;
    pending = true;
    rafId = requestAnimationFrame(run);
    return true;
  }

  // ---------- 交互：点/拖 = 把视口中心挪过去（缩放不动） ----------
  function panTo(clientX, clientY) {
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    let px = clientX - r.left, py = clientY - r.top;
    px = Math.max(0, Math.min(TW, px));
    py = Math.max(0, Math.min(TH, py));
    const m = map || computeMap((typeof GW.page === 'function') ? GW.page() : null);
    if (!m || !(m.s > 0)) return;
    const wx = (px - m.ox) / m.s, wy = (py - m.oy) / m.s;
    const s = (GW.camera && GW.camera.s) || 1;
    let vp;
    try { vp = GW.viewSize(); } catch (e) { vp = { w: innerWidth, h: innerHeight }; }
    if (!vp || !(vp.w > 0)) vp = { w: innerWidth, h: innerHeight };
    try {
      if (GW.setView) GW.setView(vp.w / 2 - wx * s, vp.h / 2 - wy * s, s);
      else { GW.camera.tx = vp.w / 2 - wx * s; GW.camera.ty = vp.h / 2 - wy * s; }
    } catch (e) { return; }
    refreshSoon();
  }

  function onDown(e) {
    if (e.button != null && e.button !== 0) return;   // 右键留给菜单
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    dragging = true;
    try { if (cv && cv.setPointerCapture) cv.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件会抛 NotFoundError */ }
    addWin();
    panTo(e.clientX, e.clientY);
  }

  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    panTo(e.clientX, e.clientY);
  }

  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    try { if (cv && cv.releasePointerCapture && e && e.pointerId != null) cv.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
    removeWin();
    refreshSoon();
  }

  function addWin() {
    if (winOn) return;
    winOn = true;
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  }
  function removeWin() {
    if (!winOn) return;
    winOn = false;
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
  }

  // ---------- 右键菜单 ----------
  function onCtx(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!menu) return;
    menu.style.display = 'flex';
    const mw = menu.offsetWidth || 104, mh = menu.offsetHeight || 64;
    const x = Math.max(6, Math.min(e.clientX, innerWidth - mw - 6));
    const y = Math.max(6, Math.min(e.clientY, innerHeight - mh - 6));
    menu.style.left = Math.round(x) + 'px';
    menu.style.top = Math.round(y) + 'px';
  }
  function closeMenu() { if (menu) menu.style.display = 'none'; }
  function onDocDown(e) {
    if (!menu || menu.style.display === 'none') return;
    if (e.target && menu.contains(e.target)) return;
    closeMenu();
  }
  function onKey(e) { if (e.key === 'Escape') closeMenu(); }

  // 100%：保持视口中心不动地回到 1×（直接写 camera.s 会把画面往原点拽）
  function zoom100() {
    try {
      const s = 1;
      let vp;
      try { vp = GW.viewSize(); } catch (e) { vp = { w: innerWidth, h: innerHeight }; }
      if (!vp || !(vp.w > 0)) vp = { w: innerWidth, h: innerHeight };
      const c = GW.viewCenter ? GW.viewCenter() : { x: (vp.w / 2 - GW.camera.tx) / ((GW.camera.s) || 1), y: (vp.h / 2 - GW.camera.ty) / ((GW.camera.s) || 1) };
      if (GW.setView) GW.setView(vp.w / 2 - c.x * s, vp.h / 2 - c.y * s, s);
      else GW.camera.s = s;
      if (GW.requestRender) GW.requestRender();
    } catch (e) { /* 自吞 */ }
    refreshSoon();
  }

  // ---------- 显隐 ----------
  function show() {
    if (!mount()) return false;
    shown = true;
    box.style.display = 'block';
    refreshSoon();
    refresh();          // 第一次给个内容（限频窗口内会被挡，refreshSoon 会补）
    return true;
  }

  function hide() {
    shown = false;
    closeMenu();
    dragging = false;
    removeWin();
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (timerId) { clearTimeout(timerId); timerId = 0; }
    pending = false;
    if (box) box.style.display = 'none';
    return true;
  }

  function toggle() {
    if (shown) { hide(); return false; }
    show();
    return shown;
  }

  function visible() { return !!(shown && box && box.style.display !== 'none'); }

  function el() { mount(); return box; }

  function destroy() {
    hide();
    for (let i = 0; i < offs.length; i++) { try { offs[i](); } catch (e) { /* noop */ } }
    offs.length = 0;
    try { if (cv) { cv.removeEventListener('contextmenu', onCtx); cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerup', onUp); cv.removeEventListener('pointercancel', onUp); } } catch (e) { /* noop */ }
    try { document.removeEventListener('pointerdown', onDocDown, true); document.removeEventListener('keydown', onKey, true); } catch (e) { /* noop */ }
    try { if (menu) menu.remove(); } catch (e) { /* noop */ }
    try { if (box) box.remove(); } catch (e) { /* noop */ }
    try { if (styleEl) styleEl.remove(); } catch (e) { /* noop */ }
    box = null; cv = null; ctx = null; menu = null; styleEl = null; map = null;
    lastAt = -1e9; pending = false; rafId = 0; timerId = 0; dragging = false; winOn = false;
  }

  GW.minimap = {
    mount: mount,
    show: show,
    hide: hide,
    toggle: toggle,
    visible: visible,
    refresh: refresh,
    refreshSoon: refreshSoon,
    el: el,
    destroy: destroy,
  };
})();
