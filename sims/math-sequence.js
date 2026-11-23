/* 数理无限画布 · 高中数学 · 等差数列与等比数列（选择性必修二 · 数列）
 * aₙ 用柱状 + 点表示；可叠加「看作函数」（等差：一次函数上的孤立点；等比 q>0：指数型函数上的孤立点）。
 * 等差数列可演示「倒序相加」：两组台阶拼成 n × (a₁ + aₙ) 的矩形 ⇒ Sₙ = n(a₁ + aₙ)/2。
 */
(function () {
  'use strict';
  const INK = '#1b2433', SUB = '#5b6576', GRID = '#eef1f5', AX = '#8a94a6', BLUE = '#3366ff', RED = '#e4572e', CYAN = '#0f9d8a', GOLD = '#f2a541';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const M = {
    arith: (a1, d, n) => a1 + (n - 1) * d,
    arithSum: (a1, d, n) => n * a1 + n * (n - 1) / 2 * d,
    geo: (a1, q, n) => a1 * Math.pow(q, n - 1),
    geoSum: (a1, q, n) => (Math.abs(q - 1) < 1e-12 ? n * a1 : a1 * (1 - Math.pow(q, n)) / (1 - q)),
  };
  GW.simModels = GW.simModels || {};
  GW.simModels['math-sequence'] = M;
  const fmt = (v) => { if (!isFinite(v)) return '—'; const r = Math.abs(v) >= 1e5 ? v.toExponential(3) : (+v.toFixed(4)).toString(); return r.replace('-', '−'); };

  GW.registerSim({
    id: 'math-sequence', name: '等差与等比数列', category: 'math', group: '数列',
    keywords: '数列 等差数列 等比数列 通项 前n项和 公差 公比 倒序相加 错位相减 选择性必修二',
    desc: '等差 / 等比数列：调首项、公差（公比）、项数，看通项与前 n 项和；等差可演示倒序相加，可把数列看作函数图像上的点',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20v-3M9 20v-6M14 20v-9M19 20V5"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      S.type = S.type || 'arith'; S.a1 = S.a1 == null ? 1 : S.a1; S.d = S.d == null ? 2 : S.d; S.q = S.q == null ? 1.5 : S.q; S.n = S.n || 8;
      S.fn = !!S.fn; S.rev = !!S.rev;
      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 680, H = 620;
      const a = (k) => (S.type === 'arith' ? M.arith(S.a1, S.d, k) : M.geo(S.a1, S.q, k));
      const Sn = (k) => (S.type === 'arith' ? M.arithSum(S.a1, S.d, k) : M.geoSum(S.a1, S.q, k));
      function txt(s, x, y, font, col, al, bl) { c.font = font || '14px ' + MATH; c.fillStyle = col || INK; c.textAlign = al || 'left'; c.textBaseline = bl || 'alphabetic'; c.fillText(s, x, y); }
      function niceStep(r) { const e = Math.pow(10, Math.floor(Math.log10(r))), f = r / e; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e; }
      function draw() {
        kit.background();
        const n = S.n, rev = S.rev && S.type === 'arith';
        const vals = []; for (let k = 1; k <= n; k++) vals.push(a(k));
        let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
        if (rev) hi = Math.max(hi, S.a1 + a(n)), lo = Math.min(lo, S.a1 + a(n));
        if (hi - lo < 1e-9) hi = lo + 1;
        const L = 60, R = W - 30, T = 50, B = H - 60, pad = (hi - lo) * 0.08;
        lo -= lo < 0 ? pad : 0; hi += pad;
        const X = (k) => L + (k - 0.5) / n * (R - L), Y = (v) => B - (v - lo) / (hi - lo) * (B - T), bw = Math.min(46, (R - L) / n * 0.62);
        // 网格
        const st = niceStep((hi - lo) / 6);
        c.save(); c.strokeStyle = GRID; c.lineWidth = 1; c.fillStyle = SUB; c.font = '12px ' + MATH; c.textAlign = 'right'; c.textBaseline = 'middle';
        for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(R, Y(v)); c.stroke(); c.fillText(fmt(+v.toPrecision(6)), L - 6, Y(v)); }
        c.strokeStyle = AX; c.lineWidth = 1.4; c.beginPath(); c.moveTo(L, Y(0)); c.lineTo(R + 6, Y(0)); c.moveTo(L, B); c.lineTo(L, T - 10); c.stroke();
        c.restore();
        txt('n', R + 4, Y(0) - 8, 'italic 16px ' + MATH); txt('aₙ', L + 6, T - 14, 'italic 16px ' + MATH);
        // 柱 + 点（倒序相加时：每根柱上再叠一根倒序的柱）
        for (let k = 1; k <= n; k++) {
          const v = a(k), x = X(k);
          c.fillStyle = 'rgba(51,102,255,0.22)'; c.strokeStyle = BLUE; c.lineWidth = 1.4;
          c.fillRect(x - bw / 2, Math.min(Y(v), Y(0)), bw, Math.abs(Y(v) - Y(0))); c.strokeRect(x - bw / 2, Math.min(Y(v), Y(0)), bw, Math.abs(Y(v) - Y(0)));
          if (rev) {
            const r = a(n + 1 - k);
            c.fillStyle = 'rgba(242,165,65,0.30)'; c.strokeStyle = GOLD;
            c.fillRect(x - bw / 2, Math.min(Y(v + r), Y(v)), bw, Math.abs(Y(v + r) - Y(v))); c.strokeRect(x - bw / 2, Math.min(Y(v + r), Y(v)), bw, Math.abs(Y(v + r) - Y(v)));
          }
          c.fillStyle = BLUE; c.beginPath(); c.arc(x, Y(v), 4.5, 0, Math.PI * 2); c.fill();
          c.fillStyle = SUB; c.font = '12px ' + MATH; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(String(k), x, Y(0) + (lo < 0 ? 4 : 6));
          if (n <= 14) txt(fmt(v), x, Y(v) + (v >= 0 ? -8 : 18), '12px ' + MATH, BLUE, 'center');
        }
        if (rev) {
          const top = S.a1 + a(n);
          c.save(); c.strokeStyle = RED; c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(L, Y(top)); c.lineTo(R, Y(top)); c.stroke(); c.restore();
          txt('a₁ + aₙ = ' + fmt(top), R - 4, Y(top) - 8, 'bold 14px ' + MATH, RED, 'right');
          txt('两组拼成 n 个 (a₁ + aₙ)：2Sₙ = n(a₁ + aₙ)', L + 8, T + 4, 'bold 14px sans-serif', RED);
        }
        // 看作函数
        if (S.fn && (S.type === 'arith' || S.q > 0)) {
          c.save(); c.strokeStyle = CYAN; c.lineWidth = 1.8; c.setLineDash([6, 4]); c.beginPath();
          for (let i = 0; i <= 200; i++) { const x = 0.6 + (n + 0.4 - 0.6) * i / 200, v = S.type === 'arith' ? S.a1 + (x - 1) * S.d : S.a1 * Math.pow(S.q, x - 1); const px = L + (x - 0.5) / n * (R - L); i ? c.lineTo(px, Y(v)) : c.moveTo(px, Y(v)); }
          c.stroke(); c.restore();
          txt(S.type === 'arith' ? 'y = ' + fmt(S.d) + 'x + ' + fmt(S.a1 - S.d) + '（x ∈ N*，孤立的点）' : 'y = ' + fmt(S.a1) + '·' + fmt(S.q) + '^(x−1)（x ∈ N*）', R - 4, B + 36, '13px ' + MATH, CYAN, 'right');
        }
      }

      // ---------- 面板 ----------
      const seg = GW.ui.segmented({ options: [{ value: 'arith', label: '等差数列' }, { value: 'geo', label: '等比数列' }], value: S.type, onChange: (v) => { S.type = v; sync(); } });
      const s1 = GW.ui.slider({ label: '首项 a₁', min: -10, max: 10, step: 0.5, value: S.a1, onInput: (v) => { S.a1 = v; sync(); } });
      const sd = GW.ui.slider({ label: '公差 d', min: -5, max: 5, step: 0.5, value: S.d, onInput: (v) => { S.d = v; sync(); } });
      const sq = GW.ui.slider({ label: '公比 q', min: -2, max: 2.5, step: 0.05, value: S.q, onInput: (v) => { S.q = Math.abs(v) < 0.025 ? 0.05 : v; sync(); } });
      const sn = GW.ui.slider({ label: '项数 n', min: 1, max: 20, step: 1, value: S.n, onInput: (v) => { S.n = v; sync(); } });
      const tf = GW.ui.toggle({ label: '看作函数图像上的点', value: S.fn, onChange: (v) => { S.fn = v; sync(); } });
      const tr = GW.ui.toggle({ label: '倒序相加（等差）', value: S.rev, onChange: (v) => { S.rev = v; sync(); } });
      const ro1 = GW.ui.readout('通项 aₙ'), ro2 = GW.ui.readout('第 n 项'), ro3 = GW.ui.readout('前 n 项和 Sₙ');
      const note = GW.h('div', { style: { fontSize: '12px', color: SUB, lineHeight: '1.65' } });
      kit.panel.append(GW.ui.group('类型', seg.el), GW.ui.group('参数', s1.el, sd.el, sq.el, sn.el), GW.ui.group('演示', tf.el, tr.el), GW.ui.group('读数', ro1.el, ro2.el, ro3.el, note));
      function sync() {
        const ar = S.type === 'arith';
        sd.el.style.display = ar ? '' : 'none'; sq.el.style.display = ar ? 'none' : ''; tr.el.style.display = ar ? '' : 'none';
        ro1.set(ar ? 'aₙ = ' + fmt(S.a1) + ' + (n − 1)·' + fmt(S.d) : 'aₙ = ' + fmt(S.a1) + '·' + fmt(S.q) + '^(n−1)');
        ro2.set('a' + S.n + ' = ' + fmt(a(S.n))); ro3.set('S' + S.n + ' = ' + fmt(Sn(S.n)));
        note.innerHTML = ar ? 'Sₙ = n(a₁ + aₙ)/2 = na₁ + n(n−1)d/2；d > 0 递增，d < 0 递减。'
          : (Math.abs(S.q - 1) < 1e-9 ? 'q = 1：Sₙ = na₁。' : 'Sₙ = a₁(1 − qⁿ)/(1 − q)（q ≠ 1，错位相减法推导）。') + (Math.abs(S.q) < 1 ? '<br>|q| < 1：n → ∞ 时 Sₙ → a₁/(1 − q) = ' + fmt(S.a1 / (1 - S.q)) + '。' : '');
        ctx.save && ctx.save();
      }
      sync();
      kit.onResize((w, h) => { W = w; H = h; });
      kit.running = false;
      let last = '';
      kit.loop(() => { const k = JSON.stringify(S) + W + 'x' + H; if (k !== last) { last = k; draw(); } });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
