/* 数理无限画布 · 高中物理 · 交变电流的产生与理想变压器（选择性必修二）
 * 发电机：线圈在匀强磁场中绕垂直于 B 的轴匀速转动，从中性面开始计时：
 *   Φ = BS·cosωt，e = Em·sinωt，Em = NBSω，有效值 E = Em/√2（正弦式）。
 *   画面转速是「慢放」后的（标注），读数用真实的 n、ω 计算。
 * 理想变压器：U₁/U₂ = n₁/n₂，I₁/I₂ = n₂/n₁，P₁ = P₂（无损耗、全耦合，界面注明）。
 */
(function () {
  'use strict';
  const INK = '#1b2433', SUB = '#5b6576', GRID = '#e3e7ee', RED = '#e02020', BLUE = '#3366ff', CYAN = '#0f9d8a', GOLD = '#f2a541';
  const SYM = 'italic 16px "Times New Roman", serif';
  const M = {
    Em: (N, B, S, w) => N * B * S * w,
    e: (t, N, B, S, w) => N * B * S * w * Math.sin(w * t),
    phi: (t, B, S, w) => B * S * Math.cos(w * t),
    eff: (Em) => Em / Math.SQRT2,
    U2: (U1, n1, n2) => U1 * n2 / n1,
    I1: (I2, n1, n2) => I2 * n2 / n1,
  };
  GW.simModels = GW.simModels || {};
  GW.simModels['phy-acgen'] = M;

  GW.registerSim({
    id: 'phy-acgen', name: '交变电流与变压器', category: 'physics', group: '电磁学',
    keywords: '交流电 交变电流 发电机 中性面 峰值 有效值 变压器 匝数比 正弦交流 选择性必修二',
    desc: '线圈在匀强磁场中转动：中性面、Φ–t 与 e–t 图同步；切到理想变压器看 U₁/U₂ = n₁/n₂ 与功率守恒',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/><circle cx="12" cy="12" r="10" opacity=".35"/></svg>',
    width: 1060, height: 640,
    create(ctx) {
      const S = ctx.state;
      S.mode = S.mode || 'gen'; S.N = S.N || 100; S.B = S.B || 0.5; S.A = S.A || 200; S.n = S.n || 0.5;
      S.U1 = S.U1 || 220; S.n1 = S.n1 || 1100; S.n2 = S.n2 || 55; S.R = S.R || 10;
      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 760, H = 640, t = 0, play = true;
      const SLOW = 1;                                     // 画面 1 s 对应真实 1 s（转速本身已取慢速档）
      const omega = () => 2 * Math.PI * S.n;
      function txt(s, x, y, font, col, al, bl) { c.font = font || '13px sans-serif'; c.fillStyle = col || INK; c.textAlign = al || 'left'; c.textBaseline = bl || 'alphabetic'; c.fillText(s, x, y); }
      function arrowLine(x1, y1, x2, y2, col, lw) {
        c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw || 1.5;
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
        const a = Math.atan2(y2 - y1, x2 - x1);
        c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4)); c.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4)); c.fill();
      }
      // 发电机端视图：沿转轴看，线圈是一条会转的线段；B 水平向右
      function drawGen(x0, y0, w, h) {
        const cx = x0 + w / 2, cy = y0 + h / 2, R = Math.min(w, h) * 0.34;
        txt('N', x0 + 8, cy + 6, 'bold 22px sans-serif', RED); txt('S', x0 + w - 8, cy + 6, 'bold 22px sans-serif', BLUE, 'right');
        c.fillStyle = 'rgba(224,32,32,0.10)'; c.fillRect(x0, cy - R - 20, 26, 2 * R + 40);
        c.fillStyle = 'rgba(51,102,255,0.10)'; c.fillRect(x0 + w - 26, cy - R - 20, 26, 2 * R + 40);
        for (let k = -3; k <= 3; k++) arrowLine(x0 + 34, cy + k * R / 3, x0 + w - 34, cy + k * R / 3, 'rgba(51,102,255,0.35)', 1.2);
        txt('B', x0 + w - 44, cy - R - 4, SYM, BLUE, 'right');
        const th = omega() * t;                          // 从中性面（线圈平面 ⊥ B）起转过的角度
        const ux = Math.sin(th), uy = Math.cos(th);      // 线圈平面在端视图中的方向（th=0 时竖直）
        c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.moveTo(cx - ux * R, cy - uy * R); c.lineTo(cx + ux * R, cy + uy * R); c.stroke();
        // 两条边：上边 a（⊙/⊗ 表示电流方向随 e 的正负变）
        const e = Math.sin(th);
        const mark = (px, py, out) => { c.save(); c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.arc(px, py, 9, 0, Math.PI * 2); c.fill(); c.stroke();
          if (Math.abs(e) > 0.05) { if (out) { c.fillStyle = INK; c.beginPath(); c.arc(px, py, 2.6, 0, Math.PI * 2); c.fill(); } else { c.beginPath(); c.moveTo(px - 5, py - 5); c.lineTo(px + 5, py + 5); c.moveTo(px + 5, py - 5); c.lineTo(px - 5, py + 5); c.stroke(); } } c.restore(); };
        mark(cx - ux * R, cy - uy * R, e > 0); mark(cx + ux * R, cy + uy * R, e <= 0);
        // 法线 n
        arrowLine(cx, cy, cx + uy * R * 0.62, cy - ux * R * 0.62, GOLD, 2);
        txt('n', cx + uy * R * 0.7, cy - ux * R * 0.7, SYM, '#b06a12', 'center', 'middle');
        c.fillStyle = INK; c.beginPath(); c.arc(cx, cy, 3.5, 0, Math.PI * 2); c.fill();
        const deg = ((th * 180 / Math.PI) % 360 + 360) % 360;
        const near = (a) => Math.min(Math.abs(deg - a), 360 - Math.abs(deg - a)) < 6;
        txt(near(0) || near(180) ? '中性面：Φ 最大，e = 0' : near(90) || near(270) ? '线圈平面 ∥ B：Φ = 0，e 最大' : '', cx, y0 + h - 6, 'bold 14px sans-serif', CYAN, 'center');
        txt('沿转轴方向观察（⊙ 电流流出纸面，⊗ 流入）', x0, y0 + 2, '12px sans-serif', SUB, 'left', 'top');
      }
      // 一个 y–t 小图：f(τ) 在 [0, 2T] 上，竖线游标在当前 t
      function plot(x0, y0, w, h, f, ymax, col, yq, yu, tNow, T) {
        const X = (tt) => x0 + tt / (2 * T) * w, Y = (v) => y0 + h / 2 - v / ymax * (h / 2 - 8);
        c.save(); c.strokeStyle = GRID; c.lineWidth = 1;
        for (let k = 1; k <= 4; k++) { c.beginPath(); c.moveTo(X(k * T / 2), y0); c.lineTo(X(k * T / 2), y0 + h); c.stroke(); }
        c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x0, Y(0)); c.lineTo(x0 + w + 8, Y(0)); c.moveTo(x0, y0 + h); c.lineTo(x0, y0 - 4); c.stroke();
        c.strokeStyle = col; c.lineWidth = 2.4; c.beginPath();
        for (let i = 0; i <= 240; i++) { const tt = 2 * T * i / 240; i ? c.lineTo(X(tt), Y(f(tt))) : c.moveTo(X(tt), Y(f(tt))); }
        c.stroke();
        const tc = tNow % (2 * T);
        c.strokeStyle = RED; c.lineWidth = 1; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(X(tc), y0); c.lineTo(X(tc), y0 + h); c.stroke(); c.setLineDash([]);
        c.fillStyle = RED; c.beginPath(); c.arc(X(tc), Y(f(tc)), 5, 0, Math.PI * 2); c.fill();
        c.restore();
        txt(yq, x0 + 6, y0 + 10, SYM, col); txt(yu, x0 + 6 + c.measureText(yq).width + 8, y0 + 10, '12px sans-serif', SUB);
        txt('t', x0 + w - 2, Y(0) - 8, SYM); 
        ['T/2', 'T', '3T/2', '2T'].forEach((s, k) => txt(s, X((k + 1) * T / 2), Y(0) + 16, 'italic 12px serif', SUB, 'center'));
        txt('O', x0 - 4, Y(0) + 4, 'italic 12px serif', SUB, 'right', 'top');
      }
      function drawTrans(x0, y0, w, h) {
        const cx = x0 + w / 2, cy = y0 + h * 0.42, cw = Math.min(260, w * 0.5), ch = 170;
        // 口字形铁芯
        c.save(); c.strokeStyle = '#8a94a6'; c.lineWidth = 22; c.strokeRect(cx - cw / 2, cy - ch / 2, cw, ch); c.restore();
        const coil = (x, n, col, left) => {
          const turns = Math.max(3, Math.min(18, Math.round(Math.sqrt(n))));
          c.save(); c.strokeStyle = col; c.lineWidth = 2.2;
          for (let i = 0; i < turns; i++) { const y = cy - ch / 2 + 18 + i * (ch - 36) / (turns - 1); c.beginPath(); c.ellipse(x, y, 20, 5, 0, left ? Math.PI * 0.5 : -Math.PI * 0.5, left ? Math.PI * 1.5 : Math.PI * 0.5); c.stroke(); }
          c.restore();
        };
        coil(cx - cw / 2, S.n1, RED, true); coil(cx + cw / 2, S.n2, BLUE, false);
        txt('n₁', cx - cw / 2 - 30, cy - ch / 2 - 18, SYM, RED, 'center'); txt('n₂', cx + cw / 2 + 30, cy - ch / 2 - 18, SYM, BLUE, 'center');
        // 原线圈接交流电源，副线圈接负载 R
        c.save(); c.strokeStyle = INK; c.lineWidth = 1.8;
        const lx = cx - cw / 2 - 26, rx = cx + cw / 2 + 26;
        c.beginPath(); c.moveTo(lx, cy - 60); c.lineTo(x0 + 20, cy - 60); c.lineTo(x0 + 20, cy + 60); c.lineTo(lx, cy + 60); c.stroke();
        c.beginPath(); c.moveTo(rx, cy - 60); c.lineTo(x0 + w - 20, cy - 60); c.lineTo(x0 + w - 20, cy + 60); c.lineTo(rx, cy + 60); c.stroke();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(x0 + 20, cy, 16, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(x0 + 10, cy); c.quadraticCurveTo(x0 + 15, cy - 9, x0 + 20, cy); c.quadraticCurveTo(x0 + 25, cy + 9, x0 + 30, cy); c.stroke();
        c.fillRect(x0 + w - 28, cy - 22, 16, 44); c.strokeRect(x0 + w - 28, cy - 22, 16, 44);
        c.restore();
        txt('U₁', x0 + 42, cy + 5, SYM, RED); txt('R', x0 + w - 36, cy + 5, SYM, INK, 'right');
        txt('理想变压器：无漏磁、无铜损铁损', cx, y0 + 6, '12px sans-serif', SUB, 'center', 'top');
        // 两路电压波形（有效值按比例；同频同相）
        const T = 1 / 50, U2 = M.U2(S.U1, S.n1, S.n2);
        const um = Math.max(S.U1, U2) * Math.SQRT2;
        plot(x0 + 20, y0 + h * 0.72, w - 40, h * 0.26, (tt) => S.U1 * Math.SQRT2 * Math.sin(2 * Math.PI * 50 * tt), um, RED, 'u', '/V（红：u₁  蓝：u₂）', t * 0.02, T);
        const X = (tt) => x0 + 20 + tt / (2 * T) * (w - 40), yy = y0 + h * 0.72, hh = h * 0.26;
        c.save(); c.strokeStyle = BLUE; c.lineWidth = 2.2; c.beginPath();
        for (let i = 0; i <= 240; i++) { const tt = 2 * T * i / 240, v = U2 * Math.SQRT2 * Math.sin(2 * Math.PI * 50 * tt); const py = yy + hh / 2 - v / um * (hh / 2 - 8); i ? c.lineTo(X(tt), py) : c.moveTo(X(tt), py); }
        c.stroke(); c.restore();
      }

      // ---------- 面板 ----------
      const seg = GW.ui.segmented({ options: [{ value: 'gen', label: '交流发电机' }, { value: 'trans', label: '理想变压器' }], value: S.mode, onChange: (v) => { S.mode = v; sync(); } });
      const sN = GW.ui.slider({ label: '线圈匝数 N', min: 10, max: 500, step: 10, value: S.N, onInput: (v) => { S.N = v; sync(); } });
      const sB = GW.ui.slider({ label: '磁感应强度 B', min: 0.1, max: 1, step: 0.05, value: S.B, unit: 'T', onInput: (v) => { S.B = v; sync(); } });
      const sA = GW.ui.slider({ label: '线圈面积 S', min: 50, max: 800, step: 10, value: S.A, unit: 'cm²', onInput: (v) => { S.A = v; sync(); } });
      const sn = GW.ui.slider({ label: '转速 n', min: 0.1, max: 2, step: 0.05, value: S.n, unit: 'r/s', onInput: (v) => { S.n = v; sync(); } });
      const bPlay = GW.ui.button({ label: '暂停', onClick: () => { play = !play; bPlay.set(play ? '暂停' : '继续'); } });
      const bZero = GW.ui.button({ label: '回到中性面', onClick: () => { t = 0; } });
      const sU1 = GW.ui.slider({ label: '原线圈电压 U₁（有效值）', min: 10, max: 400, step: 5, value: S.U1, unit: 'V', onInput: (v) => { S.U1 = v; sync(); } });
      const sn1 = GW.ui.slider({ label: '原线圈匝数 n₁', min: 50, max: 2000, step: 10, value: S.n1, onInput: (v) => { S.n1 = v; sync(); } });
      const sn2 = GW.ui.slider({ label: '副线圈匝数 n₂', min: 10, max: 2000, step: 5, value: S.n2, onInput: (v) => { S.n2 = v; sync(); } });
      const sR = GW.ui.slider({ label: '负载电阻 R', min: 1, max: 200, step: 1, value: S.R, unit: 'Ω', onInput: (v) => { S.R = v; sync(); } });
      const ro = [0, 1, 2, 3, 4].map(() => GW.ui.readout(''));
      const gGen = GW.ui.group('发电机', sN.el, sB.el, sA.el, sn.el, GW.h('div', { style: { display: 'flex', gap: '8px' } }, bPlay.el, bZero.el));
      const gTr = GW.ui.group('变压器', sU1.el, sn1.el, sn2.el, sR.el);
      kit.panel.append(GW.ui.group('情境', seg.el), gGen, gTr, GW.ui.group('读数', ...ro.map((r) => r.el)));
      const setRO = (i, label, val) => { ro[i].el.firstChild.innerHTML = GW.mathLabel(label); ro[i].set(val); ro[i].el.style.display = label ? '' : 'none'; };
      function sync() {
        gGen.style.display = S.mode === 'gen' ? '' : 'none'; gTr.style.display = S.mode === 'trans' ? '' : 'none';
        if (S.mode === 'gen') {
          const Em = M.Em(S.N, S.B, S.A * 1e-4, omega());
          setRO(0, '角速度 ω = 2πn', omega().toFixed(3) + ' rad/s'); setRO(1, '峰值 Em = NBSω', Em.toFixed(2) + ' V');
          setRO(2, '有效值 E = Em/√2', M.eff(Em).toFixed(2) + ' V'); setRO(3, '周期 T', (1 / S.n).toFixed(2) + ' s'); setRO(4, '磁通量最大值 Φm = BS', (S.B * S.A * 1e-4).toExponential(2) + ' Wb');
        } else {
          const U2 = M.U2(S.U1, S.n1, S.n2), I2 = U2 / S.R, I1 = M.I1(I2, S.n1, S.n2);
          setRO(0, 'U₂ = U₁n₂/n₁', U2.toFixed(2) + ' V'); setRO(1, 'I₂ = U₂/R', I2.toFixed(3) + ' A'); setRO(2, 'I₁ = I₂n₂/n₁', I1.toFixed(4) + ' A');
          setRO(3, 'P₁ = U₁I₁', (S.U1 * I1).toFixed(2) + ' W'); setRO(4, 'P₂ = U₂I₂', (U2 * I2).toFixed(2) + ' W');
        }
        ctx.save && ctx.save();
      }
      sync();
      kit.onResize((w, h) => { W = w; H = h; });
      kit.loop((dt) => {
        if (play) t += dt * SLOW;
        kit.background();
        if (S.mode === 'gen') {
          const gw = Math.min(W * 0.46, 420);
          drawGen(16, 20, gw, H - 40);
          const T = 1 / S.n, w = omega(), Em = M.Em(S.N, S.B, S.A * 1e-4, w), Pm = S.B * S.A * 1e-4;
          const px = gw + 50, pw = W - px - 30, ph = (H - 110) / 2;
          plot(px, 40, pw, ph, (tt) => M.phi(tt, S.B, S.A * 1e-4, w), Pm, GOLD, 'Φ', '/Wb（每匝）', t, T);
          plot(px, 70 + ph, pw, ph, (tt) => M.e(tt, S.N, S.B, S.A * 1e-4, w), Em, CYAN, 'e', '/V', t, T);
          txt('从中性面开始计时：Φ = BS cosωt，e = Em sinωt', px, H - 12, '12px sans-serif', SUB);
        } else drawTrans(16, 20, W - 32, H - 40);
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
