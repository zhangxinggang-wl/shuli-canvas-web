/* 数理无限画布 · 高中物理 · 光的干涉与衍射（选择性必修一 · 光）
 * 双缝干涉：理想双缝（忽略缝宽），I ∝ cos²(πd·x / λL)，条纹间距 Δx = Lλ/d。
 * 单缝衍射：夫琅禾费近似，I ∝ (sinβ/β)²，β = πa·x / λL；中央亮纹宽 2Lλ/a，是其余亮纹的两倍。
 * 白光：400–700 nm 每 10 nm 叠加一次（只显示颜色，不画强度曲线的绝对值）。小角近似 x ≪ L 在界面里写明。
 */
(function () {
  'use strict';
  const INK = '#1b2433', SUB = '#5b6576', GRID = '#e3e7ee', CYAN = '#0f9d8a', RED = '#e02020';
  const SYM = 'italic 16px "Times New Roman", serif';
  const sinc2 = (b) => (Math.abs(b) < 1e-9 ? 1 : Math.pow(Math.sin(b) / b, 2));
  const M = {
    dx: (L, lam, d) => L * lam / d,                                     // 双缝条纹间距（m）
    centralWidth: (L, lam, a) => 2 * L * lam / a,                      // 单缝中央亮纹宽度（m）
    Idouble: (x, L, lam, d) => Math.pow(Math.cos(Math.PI * d * x / (lam * L)), 2),
    Isingle: (x, L, lam, a) => sinc2(Math.PI * a * x / (lam * L)),
  };
  GW.simModels = GW.simModels || {};
  GW.simModels['phy-interference'] = M;
  // 波长 → 近似 RGB（380–780 nm 常用分段公式）
  function lamRGB(nm) {
    let r = 0, g = 0, b = 0;
    if (nm < 440) { r = -(nm - 440) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; } else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; } else { r = 1; }
    const f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (780 - nm) / 80 : 1;
    return [r * f, g * f, b * f];
  }
  const SCREEN = 0.015;                                                 // 屏上显示 x ∈ [−15, 15] mm

  GW.registerSim({
    id: 'phy-interference', name: '光的干涉与衍射', category: 'physics', group: '光学',
    keywords: '双缝干涉 单缝衍射 条纹间距 波长 白光 杨氏 光的波动性',
    desc: '双缝干涉 / 单缝衍射：调波长、缝间距（缝宽）、屏距，条纹与光强曲线同步，Δx = Lλ/d 实时验算，可切白光',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 4v16"/><path d="M8 4v6M8 14v6"/><path d="M14 4v16M17 4v16M20 4v16"/></svg>',
    width: 1060, height: 660,
    create(ctx) {
      const S = ctx.state;
      S.mode = S.mode || 'double'; S.lam = S.lam || 600; S.d = S.d || 0.25; S.a = S.a || 0.10; S.L = S.L || 1.0; S.white = !!S.white;
      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 760, H = 660, dirty = true;
      const I = (x, nm) => (S.mode === 'double' ? M.Idouble(x, S.L, nm * 1e-9, S.d * 1e-3) : M.Isingle(x, S.L, nm * 1e-9, S.a * 1e-3));
      function txt(t, x, y, font, col, al, bl) { c.font = font || '13px sans-serif'; c.fillStyle = col || INK; c.textAlign = al || 'left'; c.textBaseline = bl || 'alphabetic'; c.fillText(t, x, y); }
      function drawSchematic(L0, R0, y0, y1) {
        const cy = (y0 + y1) / 2, xs = L0 + 40, x1 = L0 + (R0 - L0) * 0.22, x2 = L0 + (R0 - L0) * 0.36, xr = R0 - 30;
        const col = S.white ? '#c9a227' : 'rgb(' + lamRGB(S.lam).map((v) => Math.round(v * 255)).join(',') + ')';
        // 光源
        c.save(); c.fillStyle = col; c.beginPath(); c.arc(xs, cy, 11, 0, Math.PI * 2); c.fill();
        c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
        txt(S.white ? '白光' : '单色光', xs, y1 + 2, '12px sans-serif', SUB, 'center', 'top');
        // 单缝 S（双缝模式下作为相干光源）+ 双缝 / 单缝屏
        const wall = (x, gaps) => {
          c.strokeStyle = INK; c.lineWidth = 4;
          let y = y0;
          gaps.forEach((g) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x, g - 3); c.stroke(); y = g + 3; });
          c.beginPath(); c.moveTo(x, y); c.lineTo(x, y1); c.stroke();
        };
        const gap = S.mode === 'double' ? Math.max(10, Math.min(38, S.d * 90)) : 0;
        if (S.mode === 'double') wall(x1, [cy]);
        const g2 = S.mode === 'double' ? [cy - gap / 2, cy + gap / 2] : [cy];
        wall(x2, g2);
        // 光屏
        c.fillStyle = '#e9edf2'; c.fillRect(xr, y0 - 6, 10, y1 - y0 + 12); c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(xr, y0 - 6, 10, y1 - y0 + 12);
        // 光线（到屏上 P 点，示意）
        const py = cy - (y1 - y0) * 0.28;
        c.strokeStyle = col; c.lineWidth = 1.3; c.globalAlpha = 0.85;
        c.beginPath(); c.moveTo(xs, cy); c.lineTo(S.mode === 'double' ? x1 : x2, cy); c.stroke();
        if (S.mode === 'double') g2.forEach((g) => { c.beginPath(); c.moveTo(x1, cy); c.lineTo(x2, g); c.lineTo(xr, py); c.stroke(); });
        else { c.beginPath(); c.moveTo(x2, cy); c.lineTo(xr, py); c.moveTo(x2, cy); c.lineTo(xr, cy); c.stroke(); }
        c.globalAlpha = 1;
        c.fillStyle = RED; c.beginPath(); c.arc(xr, py, 3.5, 0, Math.PI * 2); c.fill();
        txt('P', xr - 8, py - 6, SYM, INK, 'right');
        // 标注 d / a、L
        c.strokeStyle = SUB; c.lineWidth = 1; c.setLineDash([3, 3]);
        c.beginPath(); c.moveTo(x2, y1 + 14); c.lineTo(xr, y1 + 14); c.stroke(); c.setLineDash([]);
        txt('L = ' + S.L.toFixed(2) + ' m', (x2 + xr) / 2, y1 + 18, '13px sans-serif', INK, 'center', 'top');
        txt(S.mode === 'double' ? 'd = ' + S.d.toFixed(2) + ' mm' : 'a = ' + S.a.toFixed(3) + ' mm', x2 + 10, y0 + 2, '13px sans-serif', INK, 'left', 'top');
        txt(S.mode === 'double' ? 'S' : '', x1 - 8, cy - 8, SYM, INK, 'right');
        if (S.mode === 'double') { txt('S₁', x2 + 8, g2[0] - 6, SYM); txt('S₂', x2 + 8, g2[1] + 16, SYM); }
        txt('示意图（未按比例：实际 L ≫ d）', R0 - 4, y0 - 12, '12px sans-serif', SUB, 'right');
        c.restore();
      }
      // 条纹用离屏像素画：深色主题外壳会把「接近黑的 fillStyle」翻成浅色，暗纹必须绕开它（drawImage 不经颜色映射）
      const off = document.createElement('canvas');
      function drawFringes(L0, R0, y0, y1) {
        const w = Math.max(2, Math.round(R0 - L0));
        if (off.width !== w) { off.width = w; off.height = 1; }
        const oc = off.getContext('2d'), img = oc.createImageData(w, 1);
        for (let i = 0; i < w; i++) {
          const x = (i / w - 0.5) * 2 * SCREEN;
          let r = 0, g = 0, b = 0;
          if (S.white) {
            let n = 0;
            for (let nm = 400; nm <= 700; nm += 10) { const k = I(x, nm), q = lamRGB(nm); r += q[0] * k; g += q[1] * k; b += q[2] * k; n++; }
            r = r / n * 2.6; g = g / n * 2.6; b = b / n * 2.6;
          } else { const k = I(x, S.lam), q = lamRGB(S.lam); r = q[0] * k; g = q[1] * k; b = q[2] * k; }
          img.data[i * 4] = Math.min(255, Math.round(r * 255)); img.data[i * 4 + 1] = Math.min(255, Math.round(g * 255));
          img.data[i * 4 + 2] = Math.min(255, Math.round(b * 255)); img.data[i * 4 + 3] = 255;
        }
        oc.putImageData(img, 0, 0);
        c.save(); c.imageSmoothingEnabled = true; c.drawImage(off, L0, y0, R0 - L0, y1 - y0); c.restore();
        c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(L0, y0, R0 - L0, y1 - y0);
        txt('光屏上的条纹（屏中央为 x = 0）', L0, y0 - 8, '12px sans-serif', SUB);
      }
      function drawCurve(L0, R0, y0, y1) {
        const w = R0 - L0, X = (x) => L0 + (x / (2 * SCREEN) + 0.5) * w, Y = (v) => y1 - v * (y1 - y0 - 10);
        c.save(); c.strokeStyle = GRID; c.lineWidth = 1;
        c.font = '12px sans-serif'; c.fillStyle = SUB; c.textAlign = 'center'; c.textBaseline = 'top';
        for (let mm = -15; mm <= 15; mm += 5) { c.beginPath(); c.moveTo(X(mm / 1000), y0); c.lineTo(X(mm / 1000), y1); c.stroke(); c.fillText(mm, X(mm / 1000), y1 + 5); }
        c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.moveTo(L0, y1); c.lineTo(R0, y1); c.moveTo(X(0), y1); c.lineTo(X(0), y0 - 6); c.stroke();
        txt('x', R0 - 36, y1 - 8, SYM); txt('/mm', R0 - 28, y1 - 8, '12px sans-serif', SUB);
        txt('I', X(0) + 8, y0 + 6, SYM); txt('（相对光强）', X(0) + 16, y0 + 6, '12px sans-serif', SUB);
        const draw = (nm, col, lw) => {
          c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
          for (let i = 0; i <= w; i++) { const x = (i / w - 0.5) * 2 * SCREEN, yy = Y(I(x, nm)); i ? c.lineTo(L0 + i, yy) : c.moveTo(L0, yy); }
          c.stroke();
        };
        if (S.white) [450, 550, 650].forEach((nm) => { const q = lamRGB(nm); draw(nm, 'rgb(' + q.map((v) => Math.round(v * 220)).join(',') + ')', 1.6); });
        else draw(S.lam, CYAN, 2.4);
        // 标出 Δx 或中央亮纹宽度
        const lam = (S.white ? 550 : S.lam) * 1e-9;
        const span = S.mode === 'double' ? M.dx(S.L, lam, S.d * 1e-3) : M.centralWidth(S.L, lam, S.a * 1e-3);
        const xa = S.mode === 'double' ? 0 : -span / 2, xb = xa + span;
        if (span < 2 * SCREEN) {
          const yb = y0 + 30;
          c.strokeStyle = RED; c.fillStyle = RED; c.lineWidth = 1.4;
          c.beginPath(); c.moveTo(X(xa), yb); c.lineTo(X(xb), yb); c.moveTo(X(xa), yb - 5); c.lineTo(X(xa), yb + 5); c.moveTo(X(xb), yb - 5); c.lineTo(X(xb), yb + 5); c.stroke();
          txt((S.mode === 'double' ? 'Δx = ' : '2Lλ/a = ') + (span * 1000).toFixed(2) + ' mm', (X(xa) + X(xb)) / 2, yb - 8, 'bold 13px sans-serif', RED, 'center', 'bottom');
        }
        c.restore();
      }

      // ---------- 面板 ----------
      const seg = GW.ui.segmented({ options: [{ value: 'double', label: '双缝干涉' }, { value: 'single', label: '单缝衍射' }], value: S.mode, onChange: (v) => { S.mode = v; sync(); } });
      const sl = GW.ui.slider({ label: '波长 λ', min: 400, max: 700, step: 5, value: S.lam, unit: 'nm', onInput: (v) => { S.lam = v; sync(); } });
      const tw = GW.ui.toggle({ label: '白光（400–700 nm 叠加）', value: S.white, onChange: (v) => { S.white = v; sync(); } });
      const sd = GW.ui.slider({ label: '双缝间距 d', min: 0.1, max: 1, step: 0.01, value: S.d, unit: 'mm', onInput: (v) => { S.d = v; sync(); } });
      const sa = GW.ui.slider({ label: '单缝宽度 a', min: 0.04, max: 0.4, step: 0.005, value: S.a, unit: 'mm', onInput: (v) => { S.a = v; sync(); } });
      const sL = GW.ui.slider({ label: '缝屏距离 L', min: 0.5, max: 2, step: 0.05, value: S.L, unit: 'm', onInput: (v) => { S.L = v; sync(); } });
      const ro1 = GW.ui.readout('条纹间距 Δx'), ro2 = GW.ui.readout('中央亮纹宽度');
      const note = GW.h('div', { style: { fontSize: '12px', color: SUB, lineHeight: '1.65' } });
      kit.panel.append(GW.ui.group('实验', seg.el), GW.ui.group('光源', sl.el, tw.el), GW.ui.group('装置', sd.el, sa.el, sL.el), GW.ui.group('读数', ro1.el, ro2.el, note));
      function sync() {
        sd.el.style.display = S.mode === 'double' ? '' : 'none';
        sa.el.style.display = S.mode === 'single' ? '' : 'none';
        const lam = (S.white ? 550 : S.lam) * 1e-9;
        ro1.set(S.mode === 'double' ? (M.dx(S.L, lam, S.d * 1e-3) * 1000).toFixed(3) + ' mm' : '—（单缝条纹不等距）');
        ro2.set(S.mode === 'single' ? (M.centralWidth(S.L, lam, S.a * 1e-3) * 1000).toFixed(3) + ' mm' : (M.dx(S.L, lam, S.d * 1e-3) * 1000).toFixed(3) + ' mm');
        note.innerHTML = S.mode === 'double'
          ? '双缝：Δx = <i>L</i>λ/<i>d</i>，相邻亮纹（或暗纹）等间距。<br>理想双缝，忽略缝宽造成的衍射包络；小角近似 <i>x</i> ≪ <i>L</i>。' + (S.white ? '<br>白光：中央亮纹为白色，两侧是彩色条纹（内紫外红）。' : '')
          : '单缝：中央亮纹最宽最亮，宽度 2<i>L</i>λ/<i>a</i>，是其他亮纹的两倍；缝越窄，衍射越明显。<br>夫琅禾费近似。';
        dirty = true; ctx.save && ctx.save();
      }
      sync();
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      kit.running = false;
      kit.loop(() => {
        if (!dirty) return; dirty = false;
        kit.background();
        const L0 = 40, R0 = W - 30;
        drawSchematic(L0, R0, 40, Math.round(H * 0.27));
        drawFringes(L0, R0, Math.round(H * 0.38), Math.round(H * 0.50));
        drawCurve(L0, R0, Math.round(H * 0.58), H - 44);
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
