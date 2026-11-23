/* 数理无限画布 · 动画上的批注层（方案 R3 / D5）
 *
 * 为什么要这层：老师放动画不是为了看，是为了边放边讲 —— 在画面上圈一个电流方向、标一个 U1，
 * 松手后这些笔迹要跟着动画对象一起移动缩放，不能画到画布墨迹层上（那样一拖对象就脱节）。
 *
 * 做法：每个 web/swf 对象的 body 里盖一张绝对定位的 canvas（在 iframe 之上），
 * 笔迹坐标按**归一化 0..1** 存进 o.data.ann.strokes，所以对象缩放 / 换屏 / 重开文件都不会错位。
 * 不开批注时 canvas 的 pointer-events 是 none：平移、缩放、点动画里的按钮照旧。
 */
(function () {
  'use strict';
  const GW = window.GW;

  const pick = (o) => {
    if (!o.data.ann || typeof o.data.ann !== 'object') o.data.ann = { on: false, strokes: [] };
    if (!Array.isArray(o.data.ann.strokes)) o.data.ann.strokes = [];
    if (typeof o.data.ann.on !== 'boolean') o.data.ann.on = false;
    return o.data.ann;
  };

  // 亮度：批注要压在课件画面上，白笔 / 浅黄笔在白底课件上等于没画 —— 这种颜色一律换成正红
  function luma(hex) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 0.5;
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  const inkColor = (c) => (luma(c) > 0.72 ? '#e02020' : (c || '#e02020'));

  function attach(o, body) {
    const state = pick(o);
    const cv = document.createElement('canvas');
    cv.className = 'obj-ann';
    body.append(cv);
    const ctx = cv.getContext('2d');
    let drawing = null;

    const size = () => {
      const r = body.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), hgt = Math.max(1, Math.round(r.height));
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hgt * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
      }
      cv.style.width = w + 'px'; cv.style.height = hgt + 'px';
      return { w, h: hgt, dpr };
    };

    function redraw() {
      const s = size();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      state.strokes.forEach((st) => {
        const pts = st.pts || [];
        if (pts.length < 2) return;
        ctx.strokeStyle = st.c || '#e02020';
        ctx.lineWidth = Math.max(1, (st.w || 3));
        ctx.beginPath();
        pts.forEach((p, i) => {
          const x = p[0] * s.w, y = p[1] * s.h;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
    }

    const at = (e) => {
      const r = cv.getBoundingClientRect();
      const u = (e.clientX - r.left) / Math.max(1, r.width);
      const v = (e.clientY - r.top) / Math.max(1, r.height);
      return [Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))];
    };

    const onDown = (e) => {
      if (!state.on) return;
      e.preventDefault(); e.stopPropagation();
      const pen = (GW.tool && GW.tool.pen) || { color: '#e02020', width: 3 };
      drawing = { c: inkColor(pen.color), w: Math.max(2, Math.min(10, (pen.width || 3) * 2)), pts: [at(e)] };
      state.strokes.push(drawing);
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      redraw();
    };
    const onMove = (e) => {
      if (!drawing) return;
      e.preventDefault(); e.stopPropagation();
      const p = at(e);
      const last = drawing.pts[drawing.pts.length - 1];
      if (Math.abs(p[0] - last[0]) * cv.clientWidth < 0.6 && Math.abs(p[1] - last[1]) * cv.clientHeight < 0.6) return;
      drawing.pts.push(p);
      redraw();
    };
    const onUp = (e) => {
      if (!drawing) return;
      e.preventDefault(); e.stopPropagation();
      if (drawing.pts.length < 2) state.strokes.pop();   // 点一下不留墨点
      drawing = null;
      redraw();
      if (GW.markDirty) GW.markDirty();
    };

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const sync = () => {
      cv.classList.toggle('on', !!state.on);
      redraw();
    };
    sync();

    const ro = window.ResizeObserver ? new ResizeObserver(() => redraw()) : null;
    if (ro) ro.observe(body);

    return {
      sync, redraw,
      clear() { state.strokes.length = 0; redraw(); if (GW.markDirty) GW.markDirty(); },
      toggle(v) {
        state.on = (v === undefined) ? !state.on : !!v;
        if (!state.on) drawing = null;
        sync();
        if (GW.markDirty) GW.markDirty();
        return state.on;
      },
      destroy() {
        window.removeEventListener('pointerup', onUp);
        if (ro) ro.disconnect();
        cv.remove();
      },
    };
  }

  // 给对象装一层（幂等：重复调用只保留一层）
  GW.annot = {
    attach(o, body) {
      if (o._ann) { o._ann.destroy(); o._ann = null; }
      const inst = attach(o, body);
      o._ann = inst;
      return inst;
    },
    get(o) { return o && o._ann; },
    // headButtons 用：开/关
    toggle(o) {
      const inst = o && o._ann;
      if (!inst) return null;
      const on = inst.toggle();
      GW.toast(on ? '批注：直接在画面上写（再点一次关闭）' : '批注已关闭');
      return on;
    },
    clear(o) {
      const inst = o && o._ann;
      if (!inst) return;
      inst.clear();
      GW.toast('已清除这个动画上的批注');
    },
    count(o) {
      const st = o && o.data && o.data.ann;
      return st && Array.isArray(st.strokes) ? st.strokes.length : 0;
    },
  };
})();
