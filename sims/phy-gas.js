/* 数理无限画布 · 高中物理 · 理想气体状态方程（选择性必修三 · 热学）
 * 气缸 + 活塞 + 分子运动（速率 ∝ √T，仅示意）；三种过程：等温 / 等压 / 等容。
 * 定量部分：pV = nRT（p 用 kPa，V 用 L，则 p·V 的单位是 J），R = 8.314 J/(mol·K)。
 * 右侧 p–V / p–T / V–T 三图可切换：等温线是双曲线，等容线、等压线的延长线过 T = 0 K（虚线表示）。
 */
(function () {
  'use strict';
  const INK = '#1b2433', SUB = '#5b6576', GRID = '#e3e7ee', BLUE = '#3366ff', RED = '#e02020', CYAN = '#0f9d8a', GOLD = '#f2a541';
  const SYM = 'italic 17px "Times New Roman", serif';
  const R = 8.314;
  // 纯模型（供 scripts/check-sims-200.js 断言）
  const M = {
    R,
    p: (n, T, V) => n * R * T / V,          // kPa（V 以 L 计）
    V: (n, T, p) => n * R * T / p,          // L
    T: (n, p, V) => p * V / (n * R),        // K
  };
  GW.simModels = GW.simModels || {};
  GW.simModels['phy-gas'] = M;
  const MODES = [
    { value: 'T', label: '等温', law: '玻意耳定律：pV = C' },
    { value: 'p', label: '等压', law: '盖-吕萨克定律：V/T = C' },
    { value: 'V', label: '等容', law: '查理定律：p/T = C' },
  ];
  const VMIN = 4, VMAX = 24, TMIN = 100, TMAX = 600;

  GW.registerSim({
    id: 'phy-gas', name: '理想气体状态方程', category: 'physics', group: '热学',
    keywords: '气体 等温 等压 等容 玻意耳 查理 盖吕萨克 pV图 热学 气缸 活塞',
    desc: '气缸与活塞：等温 / 等压 / 等容三种过程，p–V、p–T、V–T 图同步描点，pV = nRT 实时验算',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 4v16h10V4"/><path d="M3 9h14"/><path d="M10 9V2"/><circle cx="8" cy="15" r="1"/><circle cx="12" cy="13" r="1"/><path d="M19 20c0-6 2-10 3-12"/></svg>',
    width: 1060, height: 640,
    create(ctx) {
      const S = ctx.state;
      S.mode = S.mode || 'T';
      S.n = S.n || 0.5; S.T = S.T || 300; S.V = S.V || 10;
      S.p = M.p(S.n, S.T, S.V);
      S.graph = S.graph || 'pV';
      const trail = [];
      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 760, H = 640;
      const mol = [];
      for (let i = 0; i < 70; i++) mol.push({ x: Math.random(), y: Math.random(), a: Math.random() * Math.PI * 2 });

      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      function solve() {
        if (S.mode === 'T' || S.mode === 'V') S.p = M.p(S.n, S.T, S.V);
        else S.V = M.V(S.n, S.T, S.p);
        // 等压时 V 可能被推出范围：把 T 拉回能放下的区间
        if (S.V > VMAX || S.V < VMIN) { S.V = clamp(S.V, VMIN, VMAX); S.T = M.T(S.n, S.p, S.V); }
        const last = trail[trail.length - 1];
        if (!last || Math.abs(last.p - S.p) + Math.abs(last.V - S.V) + Math.abs(last.T - S.T) > 1e-6) trail.push({ p: S.p, V: S.V, T: S.T });
        if (trail.length > 400) trail.shift();
      }
      const pAxisMax = () => { const m = M.p(S.n, TMAX, VMIN); const st = m > 800 ? 200 : 100; return Math.ceil(m / st) * st; };
      const tempCol = (T) => { const u = clamp((T - TMIN) / (TMAX - TMIN), 0, 1); return 'rgb(' + Math.round(51 + 173 * u) + ',' + Math.round(102 - 70 * u) + ',' + Math.round(255 - 223 * u) + ')'; };
      function txt(t, x, y, font, col, al, bl) { c.font = font || '14px sans-serif'; c.fillStyle = col || INK; c.textAlign = al || 'left'; c.textBaseline = bl || 'alphabetic'; c.fillText(t, x, y); }

      function drawCylinder(dt) {
        const x0 = 46, cw = Math.max(150, Math.min(240, W * 0.26)), yb = H - 64, hmax = H - 200;
        const hg = hmax * S.V / VMAX, yt = yb - hg;
        // 缸体（开口向上的 U 形，粗线）
        c.save(); c.strokeStyle = INK; c.lineWidth = 4; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(x0, yb - hmax - 34); c.lineTo(x0, yb); c.lineTo(x0 + cw, yb); c.lineTo(x0 + cw, yb - hmax - 34); c.stroke();
        // 气体
        const col = tempCol(S.T);
        c.fillStyle = col; c.globalAlpha = 0.10; c.fillRect(x0 + 2, yt, cw - 4, hg - 2); c.globalAlpha = 1;
        // 分子（示意：速率 ∝ √T，数量不变）
        const sp = 0.45 * Math.sqrt(S.T / 300);
        c.fillStyle = col;
        mol.forEach((m) => {
          m.x += Math.cos(m.a) * sp * dt; m.y += Math.sin(m.a) * sp * dt * (VMAX / S.V) * 0.35;
          if (m.x < 0) { m.x = -m.x; m.a = Math.PI - m.a; } if (m.x > 1) { m.x = 2 - m.x; m.a = Math.PI - m.a; }
          if (m.y < 0) { m.y = -m.y; m.a = -m.a; } if (m.y > 1) { m.y = 2 - m.y; m.a = -m.a; }
          m.x = clamp(m.x, 0, 1); m.y = clamp(m.y, 0, 1);
          c.beginPath(); c.arc(x0 + 8 + m.x * (cw - 16), yt + 6 + m.y * Math.max(1, hg - 14), 3.2, 0, Math.PI * 2); c.fill();
        });
        // 活塞 + 连杆
        c.fillStyle = '#8a94a6'; c.fillRect(x0 + 3, yt - 16, cw - 6, 16);
        c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(x0 + 3, yt - 16, cw - 6, 16);
        c.fillStyle = '#5b6576'; c.fillRect(x0 + cw / 2 - 5, yt - 16 - 70, 10, 70);
        c.restore();
        // 标注
        txt('p', x0 + cw + 14, yt + 20, SYM); txt(' = ' + S.p.toFixed(1) + ' kPa', x0 + cw + 24, yt + 20, '14px sans-serif');
        txt('V', x0 + cw + 14, yt + 42, SYM); txt(' = ' + S.V.toFixed(2) + ' L', x0 + cw + 26, yt + 42, '14px sans-serif');
        txt('T', x0 + cw + 14, yt + 64, SYM); txt(' = ' + S.T.toFixed(0) + ' K', x0 + cw + 24, yt + 64, '14px sans-serif', col);
        txt('分子运动仅为示意：平均速率 ∝ √T', x0, yb + 30, '12px sans-serif', SUB);
        return x0 + cw + 120;
      }

      function axesFor(g) {
        const pm = pAxisMax();
        if (g === 'pV') return { xk: 'V', yk: 'p', xm: 26, ym: pm, xl: 'V/L', yl: 'p/kPa' };
        if (g === 'pT') return { xk: 'T', yk: 'p', xm: 650, ym: pm, xl: 'T/K', yl: 'p/kPa' };
        return { xk: 'T', yk: 'V', xm: 650, ym: 26, xl: 'T/K', yl: 'V/L' };
      }
      function procStates() {
        const out = [];
        if (S.mode === 'T') for (let i = 0; i <= 120; i++) { const V = VMIN + (VMAX - VMIN) * i / 120; out.push({ V, T: S.T, p: M.p(S.n, S.T, V) }); }
        else for (let i = 0; i <= 130; i++) {
          const T = TMAX * i / 130;
          out.push(S.mode === 'p' ? { p: S.p, T, V: M.V(S.n, T, S.p) } : { V: S.V, T, p: M.p(S.n, T, S.V) });
        }
        return out;
      }
      function niceStep(m) { const r = m / 6, e = Math.pow(10, Math.floor(Math.log10(r))), f = r / e; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e; }
      function drawGraph(gx) {
        const A = axesFor(S.graph);
        const L = gx + 40, T0 = 46, Rr = W - 28, B = H - 70;
        const gw = Rr - L, gh = B - T0;
        if (gw < 120) return;
        const X = (v) => L + v / A.xm * gw, Y = (v) => B - v / A.ym * gh;
        // 网格 + 刻度
        c.save(); c.lineWidth = 1; c.strokeStyle = GRID;
        const sx = niceStep(A.xm), sy = niceStep(A.ym);
        c.font = '12px sans-serif'; c.fillStyle = SUB;
        for (let v = sx; v <= A.xm + 1e-9; v += sx) { c.beginPath(); c.moveTo(X(v), T0); c.lineTo(X(v), B); c.stroke(); c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(+v.toFixed(3), X(v), B + 5); }
        for (let v = sy; v <= A.ym + 1e-9; v += sy) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(Rr, Y(v)); c.stroke(); c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(+v.toFixed(3), L - 6, Y(v)); }
        c.textAlign = 'right'; c.textBaseline = 'top'; c.fillText('O', L - 4, B + 4);
        // 坐标轴（带箭头）
        c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(L, B); c.lineTo(Rr + 10, B); c.moveTo(L, B); c.lineTo(L, T0 - 14); c.stroke();
        c.beginPath(); c.moveTo(Rr + 16, B); c.lineTo(Rr + 6, B - 4); c.lineTo(Rr + 6, B + 4); c.fill();
        c.beginPath(); c.moveTo(L, T0 - 20); c.lineTo(L - 4, T0 - 10); c.lineTo(L + 4, T0 - 10); c.fill();
        c.restore();
        const [xq, xu] = A.xl.split('/'), [yq, yu] = A.yl.split('/');
        txt(xq, Rr - 30, B - 10, SYM); txt('/' + xu, Rr - 19, B - 10, '13px sans-serif', SUB);
        txt(yq, L + 8, T0 - 8, SYM); txt('/' + yu, L + 20, T0 - 8, '13px sans-serif', SUB);
        // 过程线：T < TMIN 的部分画虚线（实验达不到，只表示延长线过 0 K）
        c.save(); c.beginPath(); c.rect(L, T0 - 2, gw + 2, gh + 2); c.clip();
        const pts = procStates();
        c.strokeStyle = CYAN; c.lineWidth = 2.4;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          c.setLineDash(b.T < TMIN - 1e-9 ? [6, 5] : []);
          c.beginPath(); c.moveTo(X(a[A.xk]), Y(a[A.yk])); c.lineTo(X(b[A.xk]), Y(b[A.yk])); c.stroke();
        }
        c.setLineDash([]);
        // 轨迹
        c.fillStyle = 'rgba(138,148,166,0.55)';
        trail.forEach((s) => { c.beginPath(); c.arc(X(s[A.xk]), Y(s[A.yk]), 2.2, 0, Math.PI * 2); c.fill(); });
        // 当前状态点 + 投影虚线
        const px = X(S[A.xk]), py = Y(S[A.yk]);
        c.strokeStyle = SUB; c.lineWidth = 1; c.setLineDash([4, 4]);
        c.beginPath(); c.moveTo(px, py); c.lineTo(px, B); c.moveTo(px, py); c.lineTo(L, py); c.stroke(); c.setLineDash([]);
        c.fillStyle = RED; c.beginPath(); c.arc(px, py, 6, 0, Math.PI * 2); c.fill();
        c.restore();
        const md = MODES.find((m) => m.value === S.mode);
        txt(md.label + '过程 · ' + md.law, L + 10, T0 + 18, 'bold 14px sans-serif', CYAN);
        if (S.mode !== 'T' && S.graph !== 'pV') txt('虚线：延长线过 T = 0 K（低温下气体已液化，实验做不到）', L + 10, T0 + 38, '12px sans-serif', SUB);
      }

      // ---------- 面板 ----------
      const seg = GW.ui.segmented({ options: MODES.map((m) => ({ value: m.value, label: m.label })), value: S.mode, onChange: (v) => { S.mode = v; sync(true); } });
      const gseg = GW.ui.segmented({ options: [{ value: 'pV', label: 'p–V' }, { value: 'pT', label: 'p–T' }, { value: 'VT', label: 'V–T' }], value: S.graph, onChange: (v) => { S.graph = v; sync(); } });
      const sn = GW.ui.slider({ label: '物质的量 n', min: 0.2, max: 1, step: 0.05, value: S.n, unit: 'mol', onInput: (v) => { S.n = v; if (S.mode === 'p') S.p = M.p(S.n, S.T, S.V); trail.length = 0; sync(true); } });
      const sT = GW.ui.slider({ label: '温度 T', min: TMIN, max: TMAX, step: 1, value: S.T, unit: 'K', onInput: (v) => { S.T = v; sync(true); } });
      const sV = GW.ui.slider({ label: '体积 V', min: VMIN, max: VMAX, step: 0.1, value: S.V, unit: 'L', onInput: (v) => { S.V = v; sync(true); } });
      const sp = GW.ui.slider({ label: '压强 p', min: 40, max: 600, step: 1, value: Math.round(S.p), unit: 'kPa', onInput: (v) => { S.p = v; sync(true); } });
      const bClr = GW.ui.button({ label: '清除轨迹', onClick: () => { trail.length = 0; sync(true); } });
      const roC = GW.ui.readout('pV/T');
      const roE = GW.ui.readout('nR');
      const note = GW.h('div', { class: 'gw-note', style: { fontSize: '12px', color: SUB, lineHeight: '1.65' } });
      kit.panel.append(
        GW.ui.group('过程', seg.el),
        GW.ui.group('状态参量', sn.el, sT.el, sV.el, sp.el),
        GW.ui.group('图像', gseg.el, bClr.el),
        GW.ui.group('验算', roC.el, roE.el, note)
      );
      function sync(moved) {
        solve();
        sV.el.style.display = S.mode === 'p' ? 'none' : '';
        sp.el.style.display = S.mode === 'p' ? '' : 'none';
        sT.set(Math.round(S.T)); sV.set(+S.V.toFixed(1)); sp.set(Math.round(S.p));
        roC.set((S.p * S.V / S.T).toFixed(3) + ' J/K');
        roE.set((S.n * R).toFixed(3) + ' J/K');
        note.innerHTML = '理想气体：pV = nRT，R = 8.314 J/(mol·K)。<br>p 以 kPa、V 以 L 计时 pV 的单位恰好是 J。<br>同一过程中 pV/T 保持不变（= nR）。';
        ctx.save && ctx.save();
        void moved;
      }
      sync(true);

      kit.onResize((w, h) => { W = w; H = h; });
      kit.loop((dt) => {
        kit.background();
        const gx = drawCylinder(dt);
        drawGraph(gx);
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
