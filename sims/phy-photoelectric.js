/* 数理无限画布 · 高中物理 · 光电效应（选择性必修三 · 原子与量子初步）
 * 定量：Ek = hν − W₀，遏止电压 Uc = Ek/e，截止频率 νc = W₀/h（逸出功取人教版教材表中数值）。
 * I–U 曲线：饱和电流 ∝ 光强（定量比例），曲线弯曲部分为定性示意（已在界面注明）；Uc 与 Is 是严格的。
 * Ek–ν 图：各金属直线斜率都是普朗克常量 h（互相平行），纵截距 −W₀。
 */
(function () {
  'use strict';
  const INK = '#1b2433', SUB = '#5b6576', GRID = '#e3e7ee', CYAN = '#0f9d8a', RED = '#e02020', BLUE = '#3366ff', GOLD = '#f2a541';
  const SYM = 'italic 16px "Times New Roman", serif';
  const H_EV = 4.135667e-15;                      // 普朗克常量 h，单位 eV·s
  const METALS = [
    { k: 'W', name: '钨', W0: 4.54 }, { k: 'Ca', name: '钙', W0: 3.20 }, { k: 'Na', name: '钠', W0: 2.29 },
    { k: 'K', name: '钾', W0: 2.25 }, { k: 'Rb', name: '铷', W0: 2.13 },
  ];
  const F0 = 0.55;                                 // U = 0 时到达阳极的电子比例（定性）
  const M = {
    h: H_EV,
    Ek: (nu, W0) => H_EV * nu - W0,                // eV
    Uc: (nu, W0) => Math.max(0, H_EV * nu - W0),   // V（数值上等于以 eV 计的 Ek）
    nuC: (W0) => W0 / H_EV,                        // Hz
    I: (U, nu, W0, Is) => {                        // μA
      const ek = H_EV * nu - W0;
      if (ek <= 0 || Is <= 0) return 0;
      if (U >= 0) return Is * (1 - (1 - F0) * Math.exp(-U / 0.8));
      return Is * F0 * Math.max(0, 1 + U / ek);
    },
  };
  GW.simModels = GW.simModels || {};
  GW.simModels['phy-photoelectric'] = M;
  const nuColor = (nu) => {                         // 可见光 3.9–7.9×10¹⁴ Hz 着色；紫外用淡紫灰
    const nm = 3e8 / nu * 1e9;
    if (nm < 380) return '#9b7fd1';
    if (nm > 750) return '#b03030';
    const t = [[380, '#7a3cff'], [450, '#3366ff'], [495, '#18a0c8'], [530, '#2fb344'], [580, '#d4c21a'], [620, '#f08a24'], [750, '#e02020']];
    for (let i = 1; i < t.length; i++) if (nm <= t[i][0]) return t[i][1];
    return '#e02020';
  };

  GW.registerSim({
    id: 'phy-photoelectric', name: '光电效应', category: 'physics', group: '原子与量子',
    keywords: '光电效应 逸出功 遏止电压 截止频率 饱和电流 爱因斯坦光电效应方程 光电管 普朗克常量 近代物理',
    desc: '光电管实验：改频率、光强、电压与阴极金属，I–U 曲线与 Ek–ν 图同步；Ek = hν − W₀、遏止电压实时验算',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="7" width="18" height="10" rx="5"/><path d="M7 9v6"/><path d="M17 10v4"/><path d="M2 2l5 6M6 1l4 6"/></svg>',
    width: 1060, height: 640,
    create(ctx) {
      const S = ctx.state;
      S.metal = S.metal || 'Na'; S.nu = S.nu || 7.5; S.inten = S.inten == null ? 70 : S.inten; S.U = S.U == null ? 1 : S.U; S.graph = S.graph || 'IU';
      const refs = [];
      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 760, H = 640;
      const els = [];
      const W0 = () => METALS.find((m) => m.k === S.metal).W0;
      const nuHz = () => S.nu * 1e14;
      const Is = () => S.inten / 10;              // 光强 100% ↔ 饱和电流 10 μA
      function txt(t, x, y, font, col, al, bl) { c.font = font || '13px sans-serif'; c.fillStyle = col || INK; c.textAlign = al || 'left'; c.textBaseline = bl || 'alphabetic'; c.fillText(t, x, y); }
      let acc = 0;
      function stepElectrons(dt) {
        const ek = M.Ek(nuHz(), W0());
        if (ek > 0 && S.inten > 0) {
          acc += dt * S.inten * 0.45;
          while (acc > 1) {
            acc -= 1;
            const E = Math.random() * ek, th = (Math.random() * 2 - 1) * 1.2, v0 = 1.6 * Math.sqrt(E);
            els.push({ x: 0, y: 0.2 + Math.random() * 0.6, vx: v0 * Math.cos(th), vy: v0 * Math.sin(th) * 0.8 });
          }
        }
        const a = 1.28 * S.U;
        for (let i = els.length - 1; i >= 0; i--) {
          const e = els[i];
          e.vx += a * dt; e.x += e.vx * dt; e.y += e.vy * dt;
          if (e.x < -0.01 || e.x > 1 || e.y < 0 || e.y > 1) els.splice(i, 1);
        }
        if (els.length > 400) els.splice(0, els.length - 400);
      }
      function drawTube(dt) {
        const x0 = 30, w = Math.max(260, Math.min(380, W * 0.42)), y0 = 70, h = 170;
        const kx = x0 + 50, ax = x0 + w - 46, cy = y0 + h / 2;
        // 入射光
        const ek = M.Ek(nuHz(), W0()), col = nuColor(nuHz());
        if (S.inten > 0) {
          c.save(); c.strokeStyle = col; c.lineWidth = 1 + S.inten / 35; c.globalAlpha = 0.85;
          for (let k = 0; k < 3; k++) { const yy = cy - 40 + k * 32; c.beginPath(); c.moveTo(x0 + 6 + k * 18, y0 - 46); c.lineTo(kx - 4, yy); c.stroke(); }
          c.restore();
        }
        // 玻璃管
        c.save(); c.strokeStyle = SUB; c.lineWidth = 2; c.beginPath();
        const r = h / 2; c.moveTo(x0 + r, y0); c.lineTo(x0 + w - r, y0); c.arc(x0 + w - r, cy, r, -Math.PI / 2, Math.PI / 2); c.lineTo(x0 + r, y0 + h); c.arc(x0 + r, cy, r, Math.PI / 2, Math.PI * 1.5); c.stroke();
        // 阴极 K（弧形）与阳极 A
        c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.arc(kx - 70, cy, 76, -0.62, 0.62); c.stroke();
        c.lineWidth = 4; c.beginPath(); c.moveTo(ax, cy - 34); c.lineTo(ax, cy + 34); c.stroke();
        c.restore();
        txt('K', kx - 18, y0 + h - 8, SYM); txt('A', ax + 10, y0 + h - 8, SYM);
        // 电子
        stepElectrons(dt);
        c.fillStyle = BLUE;
        els.forEach((e) => { c.beginPath(); c.arc(kx + 2 + e.x * (ax - kx - 4), y0 + 18 + e.y * (h - 36), 2.6, 0, Math.PI * 2); c.fill(); });
        // 外电路：K、A 向下接电源与微安表
        const yb = y0 + h + 70;
        c.save(); c.strokeStyle = INK; c.lineWidth = 1.8;
        c.beginPath(); c.moveTo(kx - 6, cy); c.lineTo(x0 - 4, cy); c.lineTo(x0 - 4, yb); c.lineTo(x0 + w * 0.36, yb);
        c.moveTo(x0 + w * 0.46, yb); c.lineTo(x0 + w * 0.62, yb); c.moveTo(x0 + w * 0.62 + 36, yb); c.lineTo(x0 + w + 6, yb); c.lineTo(x0 + w + 6, cy); c.lineTo(ax, cy); c.stroke();
        // 电源（长线为正极）：U_AK > 0 时正极接 A
        const bx = x0 + w * 0.36, pos = S.U >= 0;
        const lx = pos ? bx + w * 0.1 : bx, sx = pos ? bx : bx + w * 0.1;
        c.lineWidth = 2.4; c.beginPath(); c.moveTo(lx, yb - 18); c.lineTo(lx, yb + 18); c.stroke();
        c.lineWidth = 5; c.beginPath(); c.moveTo(sx, yb - 9); c.lineTo(sx, yb + 9); c.stroke();
        c.lineWidth = 1.8; c.beginPath(); c.moveTo(bx, yb); c.lineTo(bx + w * 0.1, yb); c.stroke();
        // 微安表
        const gx = x0 + w * 0.62 + 18;
        c.beginPath(); c.arc(gx, yb, 18, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.stroke();
        c.restore();
        txt('μA', gx, yb + 1, '13px "Times New Roman", serif', INK, 'center', 'middle');
        const I = M.I(S.U, nuHz(), W0(), Is());
        txt('I = ' + I.toFixed(2) + ' μA', gx, yb + 38, 'bold 14px sans-serif', CYAN, 'center');
        txt('U', bx - 6, yb - 26, SYM); txt('AK', bx + 6, yb - 22, '11px serif');
        txt(S.U >= 0 ? '正向电压（A 接正极）' : '反向电压（K 接正极）', bx + 44, yb - 26, '13px sans-serif', S.U >= 0 ? CYAN : RED);
        txt(ek > 0 ? 'Ek,max = ' + ek.toFixed(2) + ' eV' : 'ν < νc：无论光多强都没有光电子', x0, y0 + h + 30, 'bold 14px sans-serif', ek > 0 ? RED : SUB);
        return x0 + w + 40;
      }
      function frame(L, T, R, B, xr, yr, xs, ys, xq, xu, yq, yu) {
        const X = (v) => L + (v - xr[0]) / (xr[1] - xr[0]) * (R - L), Y = (v) => B - (v - yr[0]) / (yr[1] - yr[0]) * (B - T);
        c.save(); c.strokeStyle = GRID; c.lineWidth = 1; c.font = '12px sans-serif'; c.fillStyle = SUB;
        for (let v = Math.ceil(xr[0] / xs) * xs; v <= xr[1] + 1e-9; v += xs) { c.beginPath(); c.moveTo(X(v), T); c.lineTo(X(v), B); c.stroke(); c.textAlign = 'center'; c.textBaseline = 'top'; if (Math.abs(v) > 1e-9) c.fillText(+v.toFixed(2), X(v), Y(0) + 4); }
        for (let v = Math.ceil(yr[0] / ys) * ys; v <= yr[1] + 1e-9; v += ys) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(R, Y(v)); c.stroke(); c.textAlign = 'right'; c.textBaseline = 'middle'; if (Math.abs(v) > 1e-9) c.fillText(+v.toFixed(2), X(0) - 5, Y(v)); }
        c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.moveTo(L, Y(0)); c.lineTo(R + 8, Y(0)); c.moveTo(X(0), B); c.lineTo(X(0), T - 10); c.stroke();
        c.fillStyle = INK; c.beginPath(); c.moveTo(R + 14, Y(0)); c.lineTo(R + 4, Y(0) - 4); c.lineTo(R + 4, Y(0) + 4); c.fill();
        c.beginPath(); c.moveTo(X(0), T - 16); c.lineTo(X(0) - 4, T - 6); c.lineTo(X(0) + 4, T - 6); c.fill();
        c.restore();
        txt('O', X(0) - 5, Y(0) + 4, 'italic 13px serif', SUB, 'right', 'top');
        txt(xq, R - 26, Y(0) - 10, SYM); txt(xu, R - 16, Y(0) - 10, '12px sans-serif', SUB);
        txt(yq, X(0) + 8, T + 2, SYM); txt(yu, X(0) + 8 + c.measureText(yq).width + 14, T + 2, '12px sans-serif', SUB);
        return { X, Y };
      }
      function drawIU(L, T, R, B) {
        const { X, Y } = frame(L, T, R, B, [-5, 5], [0, 12], 1, 2, 'U', '/V', 'I', '/μA');
        const curve = (nu, W0v, is, col, lw, dash) => {
          c.save(); c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.beginPath();
          for (let i = 0; i <= 200; i++) { const U = -5 + i / 20; const y = Y(M.I(U, nu, W0v, is)); i ? c.lineTo(X(U), y) : c.moveTo(X(U), y); }
          c.stroke(); c.restore();
        };
        refs.forEach((r, i) => { curve(r.nu, r.W0, r.is, ['#8a94a6', '#c58b2b', '#8e5cd9', '#e2559a'][i], 1.6, [6, 4]); txt(r.tag, X(4.9), Y(M.I(5, r.nu, r.W0, r.is)) - 4, '11px sans-serif', SUB, 'right', 'bottom'); });
        curve(nuHz(), W0(), Is(), CYAN, 2.6);
        const uc = M.Uc(nuHz(), W0());
        if (uc > 0 && uc <= 5) {
          c.fillStyle = RED; c.beginPath(); c.arc(X(-uc), Y(0), 4, 0, Math.PI * 2); c.fill();
          txt('−Uc = −' + uc.toFixed(2) + ' V', X(-uc), Y(0) + 22, 'bold 12px sans-serif', RED, 'center', 'top');
        }
        if (Is() > 0 && uc > 0) { c.save(); c.strokeStyle = SUB; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(X(-5), Y(Is())); c.lineTo(X(5), Y(Is())); c.stroke(); c.restore(); txt('Is = ' + Is().toFixed(1) + ' μA', X(-4.9), Y(Is()) - 4, '12px sans-serif', SUB, 'left', 'bottom'); }
        const I = M.I(S.U, nuHz(), W0(), Is());
        c.fillStyle = RED; c.beginPath(); c.arc(X(S.U), Y(I), 6, 0, Math.PI * 2); c.fill();
        txt('曲线弯曲段为定性示意；遏止电压 Uc、饱和电流 Is 为定量', L + 4, B + 50, '12px sans-serif', SUB);
      }
      function drawEk(L, T, R, B) {
        const { X, Y } = frame(L, T, R, B, [0, 15], [-5, 6], 1, 1, 'ν', '/(10¹⁴ Hz)', 'Ek', '/eV');
        METALS.forEach((m) => {
          const on = m.k === S.metal, nc = M.nuC(m.W0) / 1e14;
          c.save(); c.strokeStyle = on ? BLUE : 'rgba(138,148,166,0.6)'; c.lineWidth = on ? 2.6 : 1.2;
          c.setLineDash([5, 4]); c.beginPath(); c.moveTo(X(0), Y(-m.W0)); c.lineTo(X(nc), Y(0)); c.stroke();
          c.setLineDash([]); c.beginPath(); c.moveTo(X(nc), Y(0)); c.lineTo(X(15), Y(M.Ek(15e14, m.W0))); c.stroke(); c.restore();
          txt(m.name, X(14.6), Y(M.Ek(14.6e14, m.W0)) - 6, (on ? 'bold ' : '') + '12px sans-serif', on ? BLUE : SUB, 'right', 'bottom');
          if (on) { txt('νc = ' + nc.toFixed(2) + '×10¹⁴ Hz', X(nc) + 6, Y(0) + 18, '12px sans-serif', BLUE); txt('−W₀', X(0) + 6, Y(-m.W0), 'italic 13px serif', BLUE, 'left', 'middle'); }
        });
        const ek = M.Ek(nuHz(), W0());
        if (ek > 0) { c.fillStyle = RED; c.beginPath(); c.arc(X(S.nu), Y(ek), 6, 0, Math.PI * 2); c.fill(); }
        txt('各直线斜率都等于普朗克常量 h（互相平行）；纵截距为 −W₀', L + 4, B + 50, '12px sans-serif', SUB);
      }

      // ---------- 面板 ----------
      const selM = GW.ui.select({ label: '阴极金属', options: METALS.map((m) => ({ value: m.k, label: m.name + '（W₀ = ' + m.W0.toFixed(2) + ' eV）' })), value: S.metal, onChange: (v) => { S.metal = v; sync(); } });
      const snu = GW.ui.slider({ label: '入射光频率 ν', min: 4, max: 15, step: 0.05, value: S.nu, unit: '×10¹⁴ Hz', onInput: (v) => { S.nu = v; sync(); } });
      const sI = GW.ui.slider({ label: '光强', min: 0, max: 100, step: 1, value: S.inten, unit: '%', onInput: (v) => { S.inten = v; sync(); } });
      const sU = GW.ui.slider({ label: 'A、K 间电压 U', min: -5, max: 5, step: 0.05, value: S.U, unit: 'V', onInput: (v) => { S.U = v; sync(); } });
      const gseg = GW.ui.segmented({ options: [{ value: 'IU', label: 'I–U 曲线' }, { value: 'Ek', label: 'Ek–ν 图' }], value: S.graph, onChange: (v) => { S.graph = v; sync(); } });
      const bRec = GW.ui.button({ label: '记下这条曲线', onClick: () => { if (refs.length >= 4) refs.shift(); refs.push({ nu: nuHz(), W0: W0(), is: Is(), tag: METALS.find((m) => m.k === S.metal).name + ' ν=' + S.nu.toFixed(1) + ' ' + S.inten + '%' }); } });
      const bClr = GW.ui.button({ label: '清除', onClick: () => { refs.length = 0; } });
      const roL = GW.ui.readout('波长 λ'), roE = GW.ui.readout('最大初动能 Ek'), roU = GW.ui.readout('遏止电压 Uc'), roC = GW.ui.readout('截止频率 νc');
      kit.panel.append(
        GW.ui.group('光电管', selM.el, sU.el),
        GW.ui.group('入射光', snu.el, sI.el),
        GW.ui.group('图像', gseg.el, GW.h('div', { style: { display: 'flex', gap: '8px' } }, bRec.el, bClr.el)),
        GW.ui.group('爱因斯坦光电效应方程 Ek = hν − W₀', roL.el, roE.el, roU.el, roC.el)
      );
      function sync() {
        const nu = nuHz(), ek = M.Ek(nu, W0()), nm = 3e8 / nu * 1e9;
        roL.set(nm.toFixed(0) + ' nm' + (nm < 380 ? '（紫外）' : nm > 760 ? '（红外）' : ''));
        roE.set(ek > 0 ? ek.toFixed(2) + ' eV' : '0（不发生光电效应）');
        roU.set(ek > 0 ? ek.toFixed(2) + ' V' : '—');
        roC.set((M.nuC(W0()) / 1e14).toFixed(2) + '×10¹⁴ Hz');
        ctx.save && ctx.save();
      }
      sync();
      kit.onResize((w, h) => { W = w; H = h; });
      kit.loop((dt) => {
        kit.background();
        const gx = drawTube(dt);
        const L = Math.max(gx + 20, W * 0.5), T = 60, R = W - 36, B = H - 90;
        if (R - L > 160) (S.graph === 'IU' ? drawIU : drawEk)(L, T, R, B);
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
