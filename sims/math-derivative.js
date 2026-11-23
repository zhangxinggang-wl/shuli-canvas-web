/* 数理无限画布 · 高中数学 · 导数的几何意义（选择性必修二 · 一元函数的导数及其应用）
 * 割线 PQ 的斜率 [f(x₀+h) − f(x₀)]/h，h → 0 时逼近切线斜率 f′(x₀)；
 * 可叠加导函数 y = f′(x) 的图像，以及「f′ > 0 递增 / f′ < 0 递减」的区间着色与极值点。
 * 导数用解析式（不是数值差分），断言见 scripts/check-sims-200.js。
 */
(function () {
  'use strict';
  const INK = '#1b2433', SUB = '#5b6576', GRID = '#eef1f5', AX = '#8a94a6', BLUE = '#3366ff', RED = '#e4572e', CYAN = '#0f9d8a', GOLD = '#f2a541', PURPLE = '#8e5cd9';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const FNS = [
    { k: 'x2', label: 'f(x) = x²', f: (x) => x * x, d: (x) => 2 * x, y: [-2, 8] },
    { k: 'x3', label: 'f(x) = x³ − 3x', f: (x) => x * x * x - 3 * x, d: (x) => 3 * x * x - 3, y: [-5, 5] },
    { k: 'sin', label: 'f(x) = sin x', f: Math.sin, d: Math.cos, y: [-2.5, 2.5] },
    { k: 'exp', label: 'f(x) = eˣ', f: Math.exp, d: Math.exp, y: [-1.5, 8] },
    { k: 'ln', label: 'f(x) = ln x', f: (x) => (x > 0 ? Math.log(x) : NaN), d: (x) => (x > 0 ? 1 / x : NaN), y: [-3.5, 3], dom: 0 },
    { k: 'inv', label: 'f(x) = 1/x', f: (x) => 1 / x, d: (x) => -1 / (x * x), y: [-5, 5], hole: 0 },
    { k: 'xex', label: 'f(x) = x·eˣ', f: (x) => x * Math.exp(x), d: (x) => (x + 1) * Math.exp(x), y: [-1.5, 4] },
  ];
  const M = { fns: FNS, secant: (f, x0, h) => (f(x0 + h) - f(x0)) / h };
  GW.simModels = GW.simModels || {};
  GW.simModels['math-derivative'] = M;

  GW.registerSim({
    id: 'math-derivative', name: '导数的几何意义', category: 'math', group: '导数',
    keywords: '导数 切线 割线 瞬时变化率 平均变化率 导函数 单调性 极值 选择性必修二',
    desc: '割线逼近切线：拖动 h → 0 看平均变化率变成瞬时变化率；可叠加导函数图像、单调区间与极值点',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 19c5 0 8-4 10-8s4-7 8-7"/><path d="M4 16l16-10" opacity=".55"/><circle cx="12" cy="11" r="1.6"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const S = ctx.state;
      S.fn = S.fn || 'x3'; S.x0 = S.x0 == null ? 1.5 : S.x0; S.h = S.h == null ? 1 : S.h;
      S.showD = S.showD !== false; S.mono = !!S.mono;
      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 680, H = 640, anim = 0;
      const F = () => FNS.find((q) => q.k === S.fn);
      let view = null;
      function fitView() {
        const q = F(), ymin = q.y[0], ymax = q.y[1];
        const s = (H - 40) / (ymax - ymin);
        view = { s, ox: W / 2, oy: 20 + ymax * s };
      }
      const X = (x) => view.ox + x * view.s, Y = (y) => view.oy - y * view.s, IX = (px) => (px - view.ox) / view.s;
      function txt(s, x, y, font, col, al, bl) { c.font = font || '14px ' + MATH; c.fillStyle = col || INK; c.textAlign = al || 'left'; c.textBaseline = bl || 'alphabetic'; c.fillText(s, x, y); }
      function curve(fn, col, lw, dash) {
        const q = F();
        c.save(); c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.beginPath();
        let pen = false;
        for (let px = 0; px <= W; px += 1.5) {
          const x = IX(px), y = fn(x);
          if (!isFinite(y) || Math.abs(Y(y)) > 4 * H || (q.hole === 0 && Math.abs(x) < 0.02)) { pen = false; continue; }
          pen ? c.lineTo(px, Y(y)) : c.moveTo(px, Y(y)); pen = true;
        }
        c.stroke(); c.restore();
      }
      function draw() {
        kit.background();
        fitView();
        const q = F();
        // 网格与坐标轴
        c.save(); c.strokeStyle = GRID; c.lineWidth = 1;
        for (let x = Math.ceil(IX(0)); x <= IX(W); x++) { c.beginPath(); c.moveTo(X(x), 0); c.lineTo(X(x), H); c.stroke(); }
        for (let y = Math.ceil(q.y[0]); y <= q.y[1]; y++) { c.beginPath(); c.moveTo(0, Y(y)); c.lineTo(W, Y(y)); c.stroke(); }
        c.strokeStyle = AX; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(0, Y(0)); c.lineTo(W, Y(0)); c.moveTo(X(0), 0); c.lineTo(X(0), H); c.stroke();
        c.fillStyle = SUB; c.font = '12px ' + MATH; c.textAlign = 'center'; c.textBaseline = 'top';
        for (let x = Math.ceil(IX(0)); x <= IX(W); x++) if (x) c.fillText(String(x).replace('-', '−'), X(x), Y(0) + 4);
        c.textAlign = 'right'; c.textBaseline = 'middle';
        for (let y = Math.ceil(q.y[0]); y <= q.y[1]; y++) if (y) c.fillText(String(y).replace('-', '−'), X(0) - 5, Y(y));
        c.restore();
        txt('x', W - 14, Y(0) - 8, 'italic 16px ' + MATH); txt('y', X(0) + 8, 14, 'italic 16px ' + MATH);
        // 单调区间：x 轴上着色
        if (S.mono) {
          for (let px = 0; px < W; px += 2) {
            const v = q.d(IX(px));
            if (!isFinite(v) || Math.abs(v) < 1e-9) continue;
            c.fillStyle = v > 0 ? 'rgba(15,157,138,0.22)' : 'rgba(228,87,46,0.20)';
            c.fillRect(px, Y(0) - 7, 2, 14);
          }
          for (let px = 2; px < W; px += 2) {                 // 导数变号处 = 极值点
            const a = q.d(IX(px - 2)), b = q.d(IX(px));
            if (isFinite(a) && isFinite(b) && a * b < 0 && (q.hole !== 0 || Math.abs(IX(px)) > 0.05)) {
              let lo = IX(px - 2), hi = IX(px);
              for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; (q.d(lo) * q.d(m) <= 0) ? (hi = m) : (lo = m); }
              const xe = (lo + hi) / 2, ye = q.f(xe), max = a > 0;
              c.fillStyle = max ? RED : CYAN; c.beginPath(); c.arc(X(xe), Y(ye), 5, 0, Math.PI * 2); c.fill();
              txt((max ? '极大值 ' : '极小值 ') + ye.toFixed(2), X(xe), Y(ye) + (max ? -12 : 20), 'bold 13px sans-serif', max ? RED : CYAN, 'center');
            }
          }
        }
        if (S.showD) curve(q.d, PURPLE, 2, [7, 5]);
        curve(q.f, BLUE, 2.8);
        const x0 = S.x0, y0 = q.f(x0), k = q.d(x0);
        if (!isFinite(y0) || !isFinite(k)) { txt('x₀ 不在定义域内', 16, 26, 'bold 14px sans-serif', RED); return; }
        const h = Math.abs(S.h) < 1e-3 ? 1e-3 : S.h, x1 = x0 + h, y1 = q.f(x1), ks = M.secant(q.f, x0, h);
        const line = (kk, col, lw, dash) => { c.save(); c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.beginPath(); c.moveTo(0, Y(y0 + kk * (IX(0) - x0))); c.lineTo(W, Y(y0 + kk * (IX(W) - x0))); c.stroke(); c.restore(); };
        if (isFinite(ks) && isFinite(y1)) line(ks, GOLD, 2, [8, 5]);
        line(k, RED, 2.2);
        if (isFinite(y1)) {
          c.save(); c.strokeStyle = SUB; c.setLineDash([3, 3]); c.lineWidth = 1;
          c.beginPath(); c.moveTo(X(x0), Y(y0)); c.lineTo(X(x1), Y(y0)); c.lineTo(X(x1), Y(y1)); c.stroke(); c.restore();
          txt('Δx', (X(x0) + X(x1)) / 2, Y(y0) + (y1 > y0 ? 16 : -6), 'italic 13px ' + MATH, SUB, 'center');
          txt('Δy', X(x1) + 6, (Y(y0) + Y(y1)) / 2, 'italic 13px ' + MATH, SUB, 'left', 'middle');
          c.fillStyle = GOLD; c.beginPath(); c.arc(X(x1), Y(y1), 5, 0, Math.PI * 2); c.fill();
          txt('Q', X(x1) + 8, Y(y1) - 8, 'italic bold 16px ' + MATH, '#b06a12');
        }
        c.fillStyle = RED; c.beginPath(); c.arc(X(x0), Y(y0), 6.5, 0, Math.PI * 2); c.fill();
        txt('P', X(x0) - 10, Y(y0) - 10, 'italic bold 16px ' + MATH, RED, 'right');
        // 图例
        const lg = [[BLUE, q.label, []], [RED, '切线（斜率 f′(x₀)）', []], [GOLD, '割线 PQ', [8, 5]]];
        if (S.showD) lg.push([PURPLE, '导函数 y = f′(x)', [7, 5]]);
        c.save(); c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(10, 10, 210, 12 + lg.length * 22); c.restore();
        lg.forEach(([col, s, dash], i) => { c.save(); c.strokeStyle = col; c.lineWidth = 2.4; c.setLineDash(dash); c.beginPath(); c.moveTo(18, 28 + i * 22); c.lineTo(46, 28 + i * 22); c.stroke(); c.restore(); txt(s, 54, 33 + i * 22, '14px ' + MATH); });
      }

      // ---------- 面板 ----------
      const sel = GW.ui.select({ label: '函数', options: FNS.map((q) => ({ value: q.k, label: q.label })), value: S.fn, onChange: (v) => { S.fn = v; if (F().dom === 0 && S.x0 <= 0) S.x0 = 1; sync(); } });
      const sx = GW.ui.slider({ label: '切点横坐标 x₀', min: -3, max: 3, step: 0.01, value: S.x0, onInput: (v) => { S.x0 = v; sync(); } });
      const sh = GW.ui.slider({ label: '增量 Δx = h', min: -2, max: 2, step: 0.01, value: S.h, onInput: (v) => { S.h = v; anim = 0; sync(); } });
      const bGo = GW.ui.button({ label: '让 h → 0', primary: true, onClick: () => { if (Math.abs(S.h) < 0.02) S.h = 1.5; anim = 1; } });
      const tD = GW.ui.toggle({ label: '显示导函数 f′(x)', value: S.showD, onChange: (v) => { S.showD = v; sync(); } });
      const tM = GW.ui.toggle({ label: '单调区间与极值点', value: S.mono, onChange: (v) => { S.mono = v; sync(); } });
      const ro1 = GW.ui.readout('平均变化率 Δy/Δx'), ro2 = GW.ui.readout('瞬时变化率 f′(x₀)'), ro3 = GW.ui.readout('切线');
      kit.panel.append(GW.ui.group('函数', sel.el), GW.ui.group('切点与增量', sx.el, sh.el, bGo.el), GW.ui.group('叠加', tD.el, tM.el), GW.ui.group('读数', ro1.el, ro2.el, ro3.el));
      const f2 = (v) => (Math.abs(v) < 5e-10 ? '0' : (+v.toFixed(3)).toString().replace('-', '−'));
      function sync() {
        const q = F(), x0 = S.x0, y0 = q.f(x0), k = q.d(x0), h = Math.abs(S.h) < 1e-3 ? 1e-3 : S.h;
        sx.set(S.x0); sh.set(+S.h.toFixed(3));
        const ks = M.secant(q.f, x0, h);
        ro1.set(isFinite(ks) ? f2(ks) : '—'); ro2.set(isFinite(k) ? f2(k) : '—');
        ro3.set(isFinite(k) && isFinite(y0) ? 'y = ' + f2(k) + '(x ' + (x0 < 0 ? '+ ' + f2(-x0) : '− ' + f2(x0)) + ') ' + (y0 < 0 ? '− ' + f2(-y0) : '+ ' + f2(y0)) : '—');
        ctx.save && ctx.save();
      }
      sync();
      // 拖动 P 点改 x₀
      let drag = false;
      kit.canvas.addEventListener('pointerdown', (e) => { const p = kit.toLocal(e), q = F(); if (view && Math.hypot(p.x - X(S.x0), p.y - Y(q.f(S.x0))) < 18) { drag = true; kit.canvas.setPointerCapture(e.pointerId); e.stopPropagation(); } });
      kit.canvas.addEventListener('pointermove', (e) => { if (!drag) return; const p = kit.toLocal(e); S.x0 = Math.max(-3, Math.min(3, Math.round(IX(p.x) * 100) / 100)); if (F().dom === 0 && S.x0 <= 0.01) S.x0 = 0.01; sync(); e.stopPropagation(); });
      kit.canvas.addEventListener('pointerup', () => { drag = false; });
      kit.onResize((w, h) => { W = w; H = h; });
      kit.loop((dt) => {
        if (anim) { S.h *= Math.pow(0.35, dt); if (Math.abs(S.h) < 0.002) { S.h = S.h < 0 ? -0.001 : 0.001; anim = 0; } sync(); }
        draw();
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
