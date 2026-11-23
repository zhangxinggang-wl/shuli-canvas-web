/* 数理无限画布 · 高中数学 · 复数的几何意义（必修二 · 复数）
 * 复平面上拖动 z₁、z₂：加减法 = 向量的平行四边形 / 三角形法则；乘法 = 模相乘、辐角相加；除法 = 模相除、辐角相减；共轭 = 关于实轴对称。
 * 辐角取主值 (−π, π]，在面板里同时给出代数形式与三角形式。
 */
(function () {
  'use strict';
  const INK = '#1b2433', SUB = '#5b6576', GRID = '#eef1f5', AX = '#8a94a6', BLUE = '#3366ff', RED = '#e4572e', CYAN = '#0f9d8a', GOLD = '#f2a541', PURPLE = '#8e5cd9';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const M = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
    conj: (a) => [a[0], -a[1]],
    abs: (a) => Math.hypot(a[0], a[1]),
    arg: (a) => Math.atan2(a[1], a[0]),
  };
  GW.simModels = GW.simModels || {};
  GW.simModels['math-complex'] = M;
  const OPS = [
    { k: 'add', label: 'z₁ + z₂', sym: '+' }, { k: 'sub', label: 'z₁ − z₂', sym: '−' },
    { k: 'mul', label: 'z₁ · z₂', sym: '·' }, { k: 'div', label: 'z₁ / z₂', sym: '/' }, { k: 'conj', label: 'z̄₁（共轭）', sym: '' },
  ];
  const f = (v) => (Math.abs(v) < 5e-10 ? '0' : (+v.toFixed(3)).toString().replace('-', '−'));
  const cs = (z) => { const re = f(z[0]), im = Math.abs(z[1]) < 5e-10 ? '' : (z[1] < 0 ? ' − ' : ' + ') + (Math.abs(+z[1].toFixed(3)) === 1 ? '' : f(Math.abs(z[1]))) + 'i'; return (re === '0' && im ? im.replace(' + ', '').replace(' − ', '−') : re + im); };
  const deg = (r) => f(r * 180 / Math.PI) + '°';

  GW.registerSim({
    id: 'math-complex', name: '复数的几何意义', category: 'math', group: '复数',
    keywords: '复数 复平面 共轭 模 辐角 三角形式 复数乘法 复数加法 向量 必修二',
    desc: '复平面上拖动 z₁、z₂：加减法是向量运算，乘法是模相乘、辐角相加（旋转 + 伸缩），共轭关于实轴对称',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h18M12 3v18"/><path d="M12 12l6-5"/><circle cx="18" cy="7" r="1.4"/><path d="M15 12a3 3 0 0 0-.8-2"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const S = ctx.state;
      S.z1 = S.z1 || [2, 1]; S.z2 = S.z2 || [1, 2]; S.op = S.op || 'mul';
      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 680, H = 640, U = 60, ox = 340, oy = 320, dirty = true;
      const X = (x) => ox + x * U, Y = (y) => oy - y * U;
      const res = () => (S.op === 'conj' ? M.conj(S.z1) : M[S.op](S.z1, S.z2));
      function txt(s, x, y, font, col, al, bl) { c.font = font || '14px ' + MATH; c.fillStyle = col || INK; c.textAlign = al || 'left'; c.textBaseline = bl || 'alphabetic'; c.fillText(s, x, y); }
      function vec(z, col, lw, dash, label) {
        c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw; c.setLineDash(dash || []);
        const x2 = X(z[0]), y2 = Y(z[1]);
        c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(x2, y2); c.stroke(); c.setLineDash([]);
        const a = Math.atan2(y2 - Y(0), x2 - X(0));
        if (Math.hypot(x2 - X(0), y2 - Y(0)) > 12) { c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - 11 * Math.cos(a - 0.35), y2 - 11 * Math.sin(a - 0.35)); c.lineTo(x2 - 11 * Math.cos(a + 0.35), y2 - 11 * Math.sin(a + 0.35)); c.fill(); }
        c.beginPath(); c.arc(x2, y2, 5, 0, Math.PI * 2); c.fill();
        c.restore();
        if (label) txt(label, x2 + 9, y2 - 9, 'italic bold 16px ' + MATH, col);
      }
      function angle(z, r, col) {
        const t = M.arg(z); if (M.abs(z) < 1e-9) return;
        c.save(); c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath(); c.arc(X(0), Y(0), r, 0, -t, t > 0); c.stroke(); c.restore();
      }
      function draw() {
        kit.background();
        const r = res(), zs = [S.z1, S.z2, r];
        const ext = Math.max(4, ...zs.map((z) => Math.max(Math.abs(z[0]), Math.abs(z[1])) + 1));
        if (!drag) { U = Math.min((W - 40) / (2 * ext), (H - 40) / (2 * ext)); ox = W / 2; oy = H / 2; }   // 拖动中不改比例尺，免得点「跑」
        c.save(); c.strokeStyle = GRID; c.lineWidth = 1;
        const nx = Math.ceil(W / 2 / U), ny = Math.ceil(H / 2 / U);
        for (let i = -nx; i <= nx; i++) { c.beginPath(); c.moveTo(X(i), 0); c.lineTo(X(i), H); c.stroke(); }
        for (let i = -ny; i <= ny; i++) { c.beginPath(); c.moveTo(0, Y(i)); c.lineTo(W, Y(i)); c.stroke(); }
        c.strokeStyle = AX; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, Y(0)); c.lineTo(W, Y(0)); c.moveTo(X(0), 0); c.lineTo(X(0), H); c.stroke();
        c.fillStyle = SUB; c.font = '12px ' + MATH; c.textAlign = 'center'; c.textBaseline = 'top';
        for (let i = -nx; i <= nx; i++) if (i) c.fillText(String(i).replace('-', '−'), X(i), Y(0) + 4);
        c.textAlign = 'right'; c.textBaseline = 'middle';
        for (let i = -ny; i <= ny; i++) if (i) c.fillText((i === 1 ? '' : i === -1 ? '−' : String(i).replace('-', '−')) + 'i', X(0) - 5, Y(i));
        c.restore();
        txt('实轴', W - 8, Y(0) - 8, '13px sans-serif', SUB, 'right'); txt('虚轴', X(0) + 8, 16, '13px sans-serif', SUB);
        txt('O', X(0) - 5, Y(0) + 4, 'italic 14px ' + MATH, SUB, 'right', 'top');
        // 辅助：平行四边形 / 三角形 / 对称
        c.save(); c.strokeStyle = 'rgba(91,101,118,0.55)'; c.lineWidth = 1.2; c.setLineDash([5, 4]);
        if (S.op === 'add') { c.beginPath(); c.moveTo(X(S.z1[0]), Y(S.z1[1])); c.lineTo(X(r[0]), Y(r[1])); c.lineTo(X(S.z2[0]), Y(S.z2[1])); c.stroke(); }
        if (S.op === 'sub') { c.beginPath(); c.moveTo(X(S.z2[0]), Y(S.z2[1])); c.lineTo(X(S.z1[0]), Y(S.z1[1])); c.stroke(); txt('z₁ − z₂ 平移到原点', X(r[0]) + 8, Y(r[1]) + 18, '12px sans-serif', SUB); }
        if (S.op === 'conj') { c.beginPath(); c.moveTo(X(S.z1[0]), Y(S.z1[1])); c.lineTo(X(r[0]), Y(r[1])); c.stroke(); }
        c.restore();
        if (S.op === 'mul' || S.op === 'div') { angle(S.z1, 34, BLUE); angle(S.z2, 46, CYAN); angle(r, 58, RED); }
        vec(S.z1, BLUE, 2.4, null, 'z₁');
        if (S.op !== 'conj') vec(S.z2, CYAN, 2.4, null, 'z₂');
        vec(r, RED, 2.8, null, OPS.find((o) => o.k === S.op).label.replace('（共轭）', ''));
        txt('拖动 z₁、z₂ 的端点', 12, H - 12, '12px sans-serif', SUB);
      }
      // ---------- 面板 ----------
      const seg = GW.ui.segmented({ options: OPS.map((o, i) => ({ value: o.k, label: ['加', '减', '乘', '除', '共轭'][i] })), value: S.op, onChange: (v) => { S.op = v; sync(); } });
      const ro = [0, 1, 2].map(() => GW.ui.readout(''));
      const note = GW.h('div', { style: { fontSize: '12px', color: SUB, lineHeight: '1.65' } });
      kit.panel.append(GW.ui.group('运算', seg.el), GW.ui.group('读数', ...ro.map((x) => x.el), note));
      const setRO = (i, l, v) => { ro[i].el.firstChild.innerHTML = GW.mathLabel(l); ro[i].set(v); };
      const tri = (z) => f(M.abs(z)) + '(cos ' + deg(M.arg(z)) + ' + i sin ' + deg(M.arg(z)) + ')';
      function sync() {
        const r = res();
        setRO(0, 'z₁', cs(S.z1) + '<br><small>' + tri(S.z1) + '</small>');
        setRO(1, S.op === 'conj' ? '|z₁|' : 'z₂', S.op === 'conj' ? f(M.abs(S.z1)) : cs(S.z2) + '<br><small>' + tri(S.z2) + '</small>');
        setRO(2, '结果', (S.op === 'div' && M.abs(S.z2) < 1e-9) ? 'z₂ ≠ 0' : cs(r) + '<br><small>' + tri(r) + '</small>');
        note.innerHTML = { add: '加法：对应向量相加（平行四边形法则）。', sub: '减法：z₁ − z₂ 对应向量 Z₂Z₁，|z₁ − z₂| 是两点间距离。',
          mul: '乘法：模相乘 |z₁z₂| = |z₁||z₂|，辐角相加 —— 乘以 z₂ 相当于旋转 arg z₂ 再伸缩 |z₂| 倍。', div: '除法：模相除，辐角相减。',
          conj: '共轭：实部相同、虚部相反，关于实轴对称；z·z̄ = |z|²。' }[S.op];
        dirty = true; ctx.save && ctx.save();
      }
      sync();
      let drag = null;
      const snap = (v) => Math.round(v * 4) / 4;
      kit.canvas.addEventListener('pointerdown', (e) => {
        const p = kit.toLocal(e);
        const cand = [['z1', S.z1], ['z2', S.z2]].filter(([k]) => S.op !== 'conj' || k === 'z1');
        for (const [k, z] of cand) if (Math.hypot(p.x - X(z[0]), p.y - Y(z[1])) < 18) { drag = k; kit.canvas.setPointerCapture(e.pointerId); e.stopPropagation(); return; }
      });
      kit.canvas.addEventListener('pointermove', (e) => { if (!drag) return; const p = kit.toLocal(e); S[drag] = [snap((p.x - ox) / U), snap((oy - p.y) / U)]; sync(); e.stopPropagation(); });
      kit.canvas.addEventListener('pointerup', () => { drag = null; });
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      kit.running = false;
      kit.loop(() => { if (dirty) { dirty = false; draw(); } });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
