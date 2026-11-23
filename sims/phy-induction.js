/* 数理无限画布 · 高中物理 · 电磁感应
 * 模式①：导体棒在光滑平行导轨上切割磁感线。m dv/dt = F − B²L²v/R，收尾速度 v = FR/(B²L²)。
 *        感应电流方向由 F = qv×B（右手定则）求出，安培力 F安 = BIL 方向与 v 相反（楞次定律）。
 * 模式②：条形磁铁插入/拔出线圈。磁铁按“磁荷”模型（两极为等量异号点磁荷）计算每匝线圈的磁通量，
 *        Φ = Σ (p/2)·sgn·(1 − |z|/√(z²+a²))，感应电动势 e = −NΔΦ/Δt，检流计偏转方向由电流流入的接线柱决定。
 * 模式③：交流发电机：e = NBSω·sin ωt（从中性面开始计时），Φ = BS·cos ωt。
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#8a94a6', COPPER = '#c27a3a';

  GW.registerSim({
    id: 'phy-induction', name: '电磁感应', category: 'physics', group: '电磁学',
    desc: '导体棒切割磁感线（v-t 图与收尾速度）、磁铁插入线圈（楞次定律）、交流发电机（e-t 正弦图像）',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="9" width="8" height="6" rx="1"/><path d="M13 7c1.5 0 1.5 10 0 10M16 7c1.5 0 1.5 10 0 10M19 7c1.5 0 1.5 10 0 10"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      if (!S.mode) S.mode = 'rail';
      S.rail = Object.assign({ B: 1, L: 0.5, R: 1, m: 0.1, F: 0.5, v0: 3, drive: 'force', Bdir: -1 }, S.rail || {});
      S.coil = Object.assign({ N: 1, turns: 8, R: 1 }, S.coil || {});
      S.gen = Object.assign({ N: 10, B: 0.5, Sarea: 0.04, omega: 2, slow: 1 }, S.gen || {});
      const save = () => ctx.save();

      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 750, H = 620;
      kit.onResize((w, h) => { W = w; H = h; });

      // ---------- 通用绘图 ----------
      function label(t, x, y, col, align, font) {
        c.save(); c.font = font || '15px sans-serif'; c.fillStyle = col || INK; c.textAlign = align || 'center'; c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 4; c.lineJoin = 'round';
        c.strokeText(t, x, y); c.fillText(t, x, y); c.restore();
      }
      function crossOrDot(X, Y, Bz, col) {
        c.save(); c.strokeStyle = c.fillStyle = col || GRAY; c.lineWidth = 2;
        if (Bz < 0) { c.beginPath(); c.moveTo(X - 5, Y - 5); c.lineTo(X + 5, Y + 5); c.moveTo(X + 5, Y - 5); c.lineTo(X - 5, Y + 5); c.stroke(); }
        else { c.beginPath(); c.arc(X, Y, 3.2, 0, Math.PI * 2); c.fill(); }
        c.restore();
      }
      function smallArrow(x, y, ux, uy, col, size) {
        const s = size || 9;
        c.save(); c.fillStyle = col; c.beginPath();
        c.moveTo(x + ux * s, y + uy * s); c.lineTo(x - ux * s * 0.7 - uy * s * 0.7, y - uy * s * 0.7 + ux * s * 0.7); c.lineTo(x - ux * s * 0.7 + uy * s * 0.7, y - uy * s * 0.7 - ux * s * 0.7);
        c.closePath(); c.fill(); c.restore();
      }
      // 折线路径上的电流小点：path=[[x,y],...]（闭合），phase 像素
      function pathLen(path) { let L = 0; for (let i = 0; i < path.length; i++) { const a = path[i], b = path[(i + 1) % path.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } return L; }
      function pointAt(path, s) {
        for (let i = 0; i < path.length; i++) {
          const a = path[i], b = path[(i + 1) % path.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (s <= l) return [a[0] + (b[0] - a[0]) * s / l, a[1] + (b[1] - a[1]) * s / l];
          s -= l;
        }
        return path[0];
      }
      function drawDots(path, phase, col, spacing) {
        const L = pathLen(path), sp = spacing || 30;
        const n = Math.floor(L / sp);
        c.save(); c.fillStyle = col;
        for (let k = 0; k < n; k++) {
          let s = (phase + k * L / n) % L; if (s < 0) s += L;
          const p = pointAt(path, s);
          c.beginPath(); c.arc(p[0], p[1], 4, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      }
      // 小型坐标图
      function graph(area, data, opt) {
        const { x, y, w, h } = area;
        c.save();
        c.fillStyle = '#fbfcfd'; c.strokeStyle = '#e3e7ee'; c.lineWidth = 1;
        c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
        c.restore();
        const pad = 34;
        const ox = x + pad, oy = opt.sym ? y + h / 2 : y + h - 24;
        const sx = (w - pad - 16) / opt.tmax, sy = (opt.sym ? (h / 2 - 22) : (h - 46)) / opt.vmax;
        const ax = GW.draw.axes(c, { x: x + 4, y: y + 4, w: w - 8, h: h - 8 }, { ox, oy, sx, sy, xLabel: opt.xl, yLabel: opt.yl, color: '#5b6576' });
        if (opt.extra) opt.extra(ax);
        for (const ser of data) {
          if (ser.pts.length < 2) continue;
          c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
          c.strokeStyle = ser.col; c.lineWidth = ser.w || 2.5; if (ser.dash) c.setLineDash(ser.dash);
          c.beginPath(); ser.pts.forEach((p, i) => (i ? c.lineTo(ax.toX(p[0]), ax.toY(p[1])) : c.moveTo(ax.toX(p[0]), ax.toY(p[1])))); c.stroke();
          c.restore();
        }
        return ax;
      }

      // =============== 模式①：导体棒切割 ===============
      const rail = { x: 0, v: 0, t: 0, hist: [], tmax: 3, phase: 0 };
      function railReset() {
        const p = S.rail;
        rail.x = 0; rail.t = 0; rail.v = p.drive === 'v0' ? p.v0 : 0; rail.hist = [[0, rail.v]]; rail.phase = 0;
        const tau = p.m * p.R / (p.B * p.B * p.L * p.L);
        rail.tmax = Math.max(1, Math.min(30, 5 * tau));
      }
      function railStep(dt) {
        const p = S.rail;
        const k = p.B * p.B * p.L * p.L / p.R;
        const n = 20, h = dt / n;
        for (let i = 0; i < n; i++) {
          const F = p.drive === 'force' ? p.F : 0;
          // 半隐式，稳定
          rail.v = (rail.v + h * F / p.m) / (1 + h * k / p.m);
          rail.x += rail.v * h;
          rail.t += h;
        }
        const last = rail.hist[rail.hist.length - 1];
        if (rail.t - last[0] > 0.02) rail.hist.push([rail.t, rail.v]);
        if (rail.t > rail.tmax) rail.tmax = rail.t * 1.25;
      }
      function drawRail(dt) {
        const p = S.rail;
        const sceneH = H * 0.56;
        const PXm = 160;
        const sepPx = p.L * PXm;
        const yT = sceneH / 2 - sepPx / 2 + 6, yB = sceneH / 2 + sepPx / 2 + 6;
        const xR = 70, xEnd = W - 24;
        const xStart = xR + 90, trackLen = xEnd - 30 - xStart;
        const xb = xStart + ((rail.x * PXm) % trackLen + trackLen) % trackLen;
        // 磁场区
        c.save(); c.fillStyle = 'rgba(15,157,138,0.05)'; c.fillRect(xR + 30, 20, xEnd - xR - 30, sceneH - 30); c.restore();
        for (let X = xR + 60; X < xEnd; X += 50) for (let Y = 40; Y < sceneH - 10; Y += 50) {
          if (Math.abs(Y - yT) < 12 || Math.abs(Y - yB) < 12) continue;
          crossOrDot(X, Y, p.Bdir);
        }
        label('B = ' + p.B.toFixed(2) + ' T（' + (p.Bdir < 0 ? '垂直纸面向里 ×' : '垂直纸面向外 ·') + '）', xR + 34, 14, CYAN, 'left');
        // 导轨与电阻
        c.save(); c.strokeStyle = '#6b7383'; c.lineWidth = 5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(xR, yT); c.lineTo(xEnd, yT); c.moveTo(xR, yB); c.lineTo(xEnd, yB); c.stroke();
        c.lineWidth = 2.5; c.strokeStyle = INK;
        c.beginPath(); c.moveTo(xR, yT); c.lineTo(xR, (yT + yB) / 2 - 26); c.moveTo(xR, (yT + yB) / 2 + 26); c.lineTo(xR, yB); c.stroke();
        c.fillStyle = '#fff'; c.lineWidth = 2.5;
        c.fillRect(xR - 10, (yT + yB) / 2 - 26, 20, 52); c.strokeRect(xR - 10, (yT + yB) / 2 - 26, 20, 52);
        c.restore();
        label('R', xR - 26, (yT + yB) / 2, INK, 'center', 'italic 17px "Times New Roman", serif');
        // 物理量
        const emf = p.B * p.L * rail.v, I = emf / p.R, FA = p.B * I * p.L;
        // 电流方向：棒中正电荷受力 q v×B；v 沿 +x，B 沿 Bdir·z：v×B = v·Bdir·(x̂×ẑ) = −v·Bdir·ŷ → 物理 ŷ 向上
        const upInBar = -Math.sign(rail.v) * p.Bdir > 0; // 电流在棒中向上（流向上导轨）
        // 回路路径：棒(下→上) → 上导轨(向左) → 电阻(向下) → 下导轨(向右)
        const loop = [[xb, yB], [xb, yT], [xR, yT], [xR, yB]];
        const cur = Math.abs(I) > 1e-4;
        if (cur) {
          rail.phase += (upInBar ? 1 : -1) * Math.min(260, 60 * Math.abs(I) + 20) * dt;
          drawDots(loop, rail.phase, 'rgba(228,87,46,0.85)', 30);
          // 电流方向箭头
          const d = upInBar ? 1 : -1;
          smallArrow(xb + 16, yT + (yB - yT) * 0.28, 0, -d, RED, 10);
          smallArrow((xR + xb) / 2, yT - 14, -d, 0, RED, 10);
          smallArrow((xR + xb) / 2, yB + 14, d, 0, RED, 10);
          smallArrow(xR + 22, (yT + yB) / 2, 0, d, RED, 10);
          label('I', xb + 28, yT + (yB - yT) * 0.28, RED, 'left', 'italic bold 16px "Times New Roman", serif');
        }
        // 导体棒
        c.save(); c.fillStyle = COPPER; c.strokeStyle = '#7a4a1e'; c.lineWidth = 1.5;
        c.fillRect(xb - 6, yT - 14, 12, yB - yT + 28); c.strokeRect(xb - 6, yT - 14, 12, yB - yT + 28); c.restore();
        label('a', xb - 16, yT - 16, INK, 'center', 'italic 16px "Times New Roman", serif');
        label('b', xb - 16, yB + 16, INK, 'center', 'italic 16px "Times New Roman", serif');
        // 矢量：v、F、F安
        const ym = (yT + yB) / 2;
        const yv = yT - 30;
        if (Math.abs(rail.v) > 0.01) GW.draw.arrow(c, xb, yv, xb + Math.sign(rail.v) * (20 + 25 * Math.min(3, Math.abs(rail.v))), yv, { color: INK, width: 3, head: 11 });
        if (Math.abs(rail.v) > 0.01) label('v', xb + Math.sign(rail.v) * 30, yv - 15, INK, 'center', 'italic bold 16px "Times New Roman", serif');
        const yf = ym + (yB - yT) * 0.18;
        const fs = 70 / Math.max(0.2, p.F || 0.5);
        if (p.drive === 'force') {
          GW.draw.arrow(c, xb + 6, yf, xb + 24 + p.F * fs * 0.8, yf, { color: CYAN, width: 3, head: 11 });
          label('F', xb + 32 + p.F * fs * 0.8, yf, CYAN, 'left', 'italic bold 16px "Times New Roman", serif');
        }
        if (Math.abs(FA) > 1e-3) {
          const Lf = Math.min(110, 18 + Math.abs(FA) * (p.drive === 'force' ? fs * 0.8 : 60));
          GW.draw.arrow(c, xb - Math.sign(rail.v) * 6, yf, xb - Math.sign(rail.v) * (Lf + 6), yf, { color: GOLD, width: 3, head: 11 });
          label('F安', xb - Math.sign(rail.v) * (Lf + 26), yf, '#b9771a');
        }
        label('导轨足够长（棒到右端后循环显示）', xEnd, sceneH - 4, '#8a94a6', 'right', '13px sans-serif');
        // v-t 图
        const vt = p.F * p.R / (p.B * p.B * p.L * p.L);
        const vmax = Math.max(0.5, p.drive === 'force' ? vt * 1.25 : p.v0 * 1.15);
        graph({ x: 12, y: sceneH + 14, w: W - 24, h: H - sceneH - 24 }, [{ pts: rail.hist, col: RED }], {
          tmax: rail.tmax, vmax, xl: 't/s', yl: 'v/(m·s⁻¹)',
          extra(ax) {
            if (p.drive === 'force') {
              c.save(); c.strokeStyle = 'rgba(15,157,138,0.8)'; c.setLineDash([7, 5]); c.lineWidth = 2;
              c.beginPath(); c.moveTo(ax.toX(0), ax.toY(vt)); c.lineTo(ax.toX(rail.tmax * 2), ax.toY(vt)); c.stroke(); c.restore();
              label('收尾速度 vₘ = FR/(B²L²) = ' + vt.toFixed(2) + ' m/s', ax.toX(rail.tmax * 0.55), ax.toY(vt) - 12, CYAN);
            }
          },
        });
        return { emf, I, FA, vt };
      }

      // =============== 模式②：磁铁与线圈 ===============
      const coil = { mx: 0, vx: 0, auto: 0, Phi: 0, I: 0, needle: 0, hist: [], t: 0, last: null, dragX: null };
      const CO = () => {
        const sceneH = H * 0.6;
        return { cx: W * 0.62, cy: sceneH * 0.42, len: 220, a: 62, sceneH };
      };
      const MAG = { len: 170, th: 44, p: 1 };
      function coilReset() { const g = CO(); coil.mx = g.cx - g.len / 2 - 230; coil.auto = 0; coil.hist = []; coil.t = 0; coil.I = 0; coil.needle = 0; coil.Phi = flux(coil.mx); }
      // 磁铁中心 mx 时的总磁通匝链数（向右为正），单位任意
      function flux(mx) {
        const g = CO(), n = S.coil.turns;
        const nRight = S.coil.N > 0; // N 极朝右（朝向线圈）
        const poles = [{ x: mx + MAG.len / 2 - 8, p: nRight ? 1 : -1 }, { x: mx - MAG.len / 2 + 8, p: nRight ? -1 : 1 }];
        let tot = 0;
        for (let k = 0; k < n; k++) {
          const xl = g.cx - g.len / 2 + (k + 0.5) * g.len / n;
          for (const pl of poles) {
            const z = xl - pl.x;
            // 点磁荷对圆面的通量（立体角/4π × 总通量），向 +x 为正
            const solid = 0.5 * (1 - Math.abs(z) / Math.hypot(z, g.a)); // 占总通量的比例
            const sgn = z >= 0 ? 1 : -1;
            // z>0（线圈在磁荷右侧）：N 磁荷发出的磁感线向 +x 穿过；同时线圈外侧回流部分已包含在立体角中
            tot += pl.p * sgn * solid;
          }
          // 线圈位于两极之间（套在磁铁上）时，还要加上磁铁内部由 S 指向 N 的磁通 p，保证 B 的磁通连续
          const xs = Math.min(poles[0].x, poles[1].x), xn = Math.max(poles[0].x, poles[1].x);
          if (xl > xs && xl < xn) tot += nRight ? 1 : -1;
        }
        return tot; // 无量纲（单位：p）
      }
      function coilStep(dt) {
        const g = CO();
        if (coil.auto) {
          coil.mx += coil.auto * 260 * dt;
          const minX = 40 + MAG.len / 2, maxX = g.cx + 10;
          if (coil.mx >= maxX) { coil.mx = maxX; coil.auto = 0; }
          if (coil.mx <= g.cx - g.len / 2 - 230) { coil.mx = g.cx - g.len / 2 - 230; coil.auto = 0; }
          if (coil.mx < minX) coil.mx = minX;
        }
        const Phi = flux(coil.mx);
        const dPhi = Phi - coil.Phi;
        coil.Phi = Phi;
        // e = −N dΦ/dt；I = e/R（线圈电感忽略）；Φ 单位换算到 mWb：p = 0.5 mWb
        const k = 0.5e-3;
        const e = dt > 0 ? -(dPhi * k) / dt : 0;
        const I = e / S.coil.R;
        // 平滑（检流计机械惯性）
        coil.I += (I - coil.I) * Math.min(1, dt * 18);
        coil.needle += (GW.clamp(coil.I / 0.004, -1, 1) - coil.needle) * Math.min(1, dt * 10);
        coil.t += dt;
        if (dt > 0) { coil.hist.push([coil.t, Phi * k * 1000, coil.I * 1000]); if (coil.hist.length > 600) coil.hist.shift(); }
      }
      function drawCoil() {
        const g = CO();
        const x0 = g.cx - g.len / 2, x1 = g.cx + g.len / 2, n = S.coil.turns;
        const pitch = g.len / n, ew = 16; // 椭圆半宽（透视）
        const I = coil.I;
        // 后半圈（虚）
        c.save(); c.strokeStyle = 'rgba(194,122,58,0.55)'; c.lineWidth = 3;
        // 螺旋绕线：前半圈 顶(xa) → 底(xa+pitch/2)，后半圈 底(xa+pitch/2) → 顶(xa+pitch)
        for (let k = 0; k < n - 1; k++) {
          const xa = x0 + k * pitch;
          c.beginPath(); c.moveTo(xa + pitch / 2, g.cy + g.a); c.quadraticCurveTo(xa + pitch * 0.75 - ew * 1.6, g.cy, xa + pitch, g.cy - g.a); c.stroke();
        }
        c.restore();
        // 磁铁（在后半圈与前半圈之间绘制，可伸入线圈）
        drawMagnet();
        // 前半圈：从顶部 (x, cy−a) 斜向下到底部 (x+pitch, cy+a) —— 沿绕线方向前进
        c.save(); c.strokeStyle = COPPER; c.lineWidth = 4; c.lineCap = 'round';
        for (let k = 0; k < n; k++) {
          const xa = x0 + k * pitch;
          c.beginPath(); c.moveTo(xa, g.cy - g.a); c.quadraticCurveTo(xa + pitch * 0.25 + ew * 1.6, g.cy, xa + pitch / 2, g.cy + g.a); c.stroke();
        }
        c.beginPath(); c.moveTo(x0 + (n - 1) * pitch + pitch / 2, g.cy + g.a); c.lineTo(x1, g.cy + g.a); c.stroke();
        c.restore();
        // 电流方向（前侧导线）：I>0 定义为在线圈内部产生向右(+x)的磁场 → 前侧电流向下
        if (Math.abs(I) > 2e-5) {
          for (let k = 0; k < n; k += 2) {
            const xm = x0 + k * pitch + pitch * 0.25 + ew * 0.8;
            smallArrow(xm, g.cy, (I > 0 ? 1 : -1) * 0.2, (I > 0 ? 1 : -1) * 0.98, RED, 8);
          }
        }
        // 线圈两端引线到检流计
        const gx = g.cx, gy = g.sceneH - 64, gr = 44;
        c.save(); c.strokeStyle = INK; c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(x0, g.cy - g.a); c.lineTo(x0 - 20, g.cy - g.a); c.lineTo(x0 - 20, gy); c.lineTo(gx - gr, gy); // A 端 → 检流计左接线柱
        c.moveTo(x1, g.cy + g.a); c.lineTo(x1 + 20, g.cy + g.a); c.lineTo(x1 + 20, gy); c.lineTo(gx + gr, gy); // B 端 → 检流计右接线柱
        c.stroke(); c.restore();
        // 外电路电流（I>0：电流从 B 端流出，经检流计右接线柱流入，从左接线柱流出回到 A）
        if (Math.abs(I) > 2e-5) {
          const s = I > 0 ? 1 : -1;
          smallArrow(x1 + 20, (g.cy + g.a + gy) / 2, 0, s, RED, 9);
          smallArrow(x0 - 20, (g.cy - g.a + gy) / 2, 0, -s, RED, 9);
          smallArrow((x1 + 20 + gx + gr) / 2, gy, -s, 0, RED, 9);
          smallArrow((x0 - 20 + gx - gr) / 2, gy, -s, 0, RED, 9);
        }
        // 检流计（零点在中央）
        c.save();
        c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 2.5;
        c.beginPath(); c.arc(gx, gy, gr, 0, Math.PI * 2); c.fill(); c.stroke();
        c.lineWidth = 1.5;
        for (let k = -4; k <= 4; k++) {
          const a = -Math.PI / 2 + k * 0.17;
          c.beginPath(); c.moveTo(gx + Math.cos(a) * (gr - 6), gy + 8 + Math.sin(a) * (gr - 6)); c.lineTo(gx + Math.cos(a) * (gr - (k % 2 ? 11 : 15)), gy + 8 + Math.sin(a) * (gr - (k % 2 ? 11 : 15))); c.stroke();
        }
        const na = -Math.PI / 2 + coil.needle * 0.7;
        c.strokeStyle = RED; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(gx, gy + 8); c.lineTo(gx + Math.cos(na) * (gr - 8), gy + 8 + Math.sin(na) * (gr - 8)); c.stroke();
        c.fillStyle = INK; c.beginPath(); c.arc(gx, gy + 8, 3.5, 0, Math.PI * 2); c.fill();
        c.restore();
        label('G', gx, gy + 26, INK, 'center', 'bold 16px sans-serif');
        label('−', gx - gr - 12, gy - 14, INK); label('+', gx + gr + 12, gy - 14, INK);
        label('A', x0 - 32, g.cy - g.a, INK, 'center', 'italic 16px "Times New Roman", serif');
        label('B', x1 + 32, g.cy + g.a, INK, 'center', 'italic 16px "Times New Roman", serif');
        // 感应电流磁场的极性
        if (Math.abs(I) > 2e-4) {
          const leftN = I < 0; // I<0 → 线圈内磁场向左 → 左端为 N 极
          label(leftN ? 'N' : 'S', x0 - 6, g.cy - g.a - 22, leftN ? RED : BLUE, 'center', 'bold 18px sans-serif');
          label(leftN ? 'S' : 'N', x1 + 6, g.cy - g.a - 22, leftN ? BLUE : RED, 'center', 'bold 18px sans-serif');
          label('（感应电流的磁场）', g.cx, g.cy - g.a - 22, '#5b6576', 'center', '13px sans-serif');
        }
      }
      function drawMagnet() {
        const g = CO();
        const x = coil.mx, y = g.cy, L = MAG.len, t = MAG.th;
        const nRight = S.coil.N > 0;
        c.save();
        c.fillStyle = nRight ? BLUE : RED; c.fillRect(x - L / 2, y - t / 2, L / 2, t);
        c.fillStyle = nRight ? RED : BLUE; c.fillRect(x, y - t / 2, L / 2, t);
        c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(x - L / 2, y - t / 2, L, t);
        c.fillStyle = '#fff'; c.font = 'bold 20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(nRight ? 'S' : 'N', x - L / 4, y + 1); c.fillText(nRight ? 'N' : 'S', x + L / 4, y + 1);
        c.restore();
        // 拖动提示
        c.save(); c.strokeStyle = CYAN; c.lineWidth = 2; c.setLineDash([4, 4]);
        c.strokeRect(x - L / 2 - 5, y - t / 2 - 5, L + 10, t + 10); c.restore();
        // 速度箭头
        const v = coil.vx;
        if (Math.abs(v) > 20) GW.draw.arrow(c, x, y - t / 2 - 18, x + Math.sign(v) * Math.min(80, 20 + Math.abs(v) * 0.15), y - t / 2 - 18, { color: INK, width: 3, head: 10 });
      }
      function drawCoilScene(dt) {
        const g = CO();
        drawCoil();
        // 读数图：Φ-t 与 i-t
        const hist = coil.hist;
        const t1 = coil.t, t0 = Math.max(0, t1 - 8);
        const gy = g.sceneH + 8, gh = H - gy - 10, gw = (W - 36) / 2;
        const phiPts = hist.filter((p) => p[0] >= t0).map((p) => [p[0] - t0, p[1]]);
        const iPts = hist.filter((p) => p[0] >= t0).map((p) => [p[0] - t0, p[2]]);
        const phimax = 0.5 * S.coil.turns * 1.1 + 0.01;
        graph({ x: 12, y: gy, w: gw, h: gh }, [{ pts: phiPts, col: CYAN }], { tmax: 8, vmax: phimax, sym: true, xl: 't/s', yl: 'Φ总/mWb' });
        const imax = 6;
        graph({ x: 24 + gw, y: gy, w: gw, h: gh }, [{ pts: iPts.map((p) => [p[0], GW.clamp(p[1], -imax * 1.2, imax * 1.2)]), col: RED }], { tmax: 8, vmax: imax, sym: true, xl: 't/s', yl: 'i/mA' });
        label('拖动磁铁插入或拔出线圈', 14, 18, '#5b6576', 'left');
      }

      // =============== 模式③：交流发电机 ===============
      const gen = { th: 0, t: 0, hist: [] };
      function genReset() { gen.th = 0; gen.t = 0; gen.hist = []; }
      function drawGen(dt) {
        const p = S.gen;
        const sceneH = H * 0.58;
        const cx = W * 0.47, cy = sceneH * 0.44, s = Math.min(W, sceneH) * 0.32;
        const yaw = -0.5, el = 0.32;
        const proj = (x, y, z) => {
          const x1 = x * Math.cos(yaw) + z * Math.sin(yaw), z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
          const y1 = y * Math.cos(el) - z1 * Math.sin(el), z2 = y * Math.sin(el) + z1 * Math.cos(el);
          return [cx + x1 * s, cy - y1 * s, z2];
        };
        // 磁极
        const pole = (x0, name, col) => {
          const pts = [[x0, -0.75, -0.55], [x0, 0.75, -0.55], [x0, 0.75, 0.55], [x0, -0.75, 0.55]].map((q) => proj(q[0], q[1], q[2]));
          c.save(); c.fillStyle = col; c.globalAlpha = 0.85; c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill();
          c.globalAlpha = 1; c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); c.restore();
          const m = proj(x0, 0, 0);
          label(name, m[0], m[1], '#fff', 'center', 'bold 22px sans-serif');
        };
        pole(-1.25, 'N', RED);
        // 磁感线（N → S）
        c.save(); c.globalAlpha = 0.5;
        for (const yy of [-0.5, 0, 0.5]) for (const zz of [-0.35, 0.35]) {
          const a = proj(-1.2, yy, zz), b = proj(1.2, yy, zz);
          GW.draw.arrow(c, a[0], a[1], b[0], b[1], { color: CYAN, width: 2, head: 9 });
        }
        c.restore();
        // 中性面（与磁场垂直的平面 x = 0）
        const np = [[0, -0.85, -0.65], [0, 0.85, -0.65], [0, 0.85, 0.65], [0, -0.85, 0.65]].map((q) => proj(q[0], q[1], q[2]));
        c.save(); c.strokeStyle = 'rgba(242,165,65,0.9)'; c.setLineDash([6, 5]); c.lineWidth = 2; c.fillStyle = 'rgba(242,165,65,0.08)';
        c.beginPath(); np.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill(); c.stroke(); c.restore();
        label('中性面', np[1][0] + 4, np[1][1] - 12, '#b9771a', 'left');
        // 线圈：绕竖直轴转动，θ 为线圈平面法线与 B 的夹角（θ=0 时线圈处于中性面）
        const th = gen.th, hw = 0.55, hh = 0.6;
        const ux = -Math.sin(th), uz = Math.cos(th); // 线圈平面内的水平方向
        const P = [
          [hw * ux, hh, hw * uz], [-hw * ux, hh, -hw * uz], [-hw * ux, -hh, -hw * uz], [hw * ux, -hh, hw * uz],
        ];
        const Q = P.map((q) => proj(q[0], q[1], q[2]));
        // 转轴
        const ax0 = proj(0, 1.0, 0), ax1 = proj(0, -1.15, 0);
        c.save(); c.strokeStyle = '#9aa3b2'; c.lineWidth = 2; c.setLineDash([8, 4, 2, 4]); c.beginPath(); c.moveTo(ax0[0], ax0[1]); c.lineTo(ax1[0], ax1[1]); c.stroke(); c.restore();
        c.save(); c.fillStyle = 'rgba(194,122,58,0.12)'; c.beginPath(); Q.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill();
        c.strokeStyle = COPPER; c.lineWidth = 4.5; c.lineJoin = 'round'; c.stroke(); c.restore();
        label('a', Q[0][0] + 10, Q[0][1] - 10, INK, 'center', 'italic 16px "Times New Roman", serif');
        label('b', Q[1][0] - 10, Q[1][1] - 10, INK, 'center', 'italic 16px "Times New Roman", serif');
        label('c', Q[2][0] - 10, Q[2][1] + 12, INK, 'center', 'italic 16px "Times New Roman", serif');
        label('d', Q[3][0] + 10, Q[3][1] + 12, INK, 'center', 'italic 16px "Times New Roman", serif');
        // 物理量：e = NBSω sinθ。线圈法线 n = (cosθ,0,sinθ)，转动角速度为 −ω·ŷ。
        // 边 ad（r = +hw·u）速度 v = hw·ω(−cosθ,0,−sinθ)，v×B = −hw·ωB·sinθ·ŷ：sinθ>0 时电流 a→d（向下）
        const Em = p.N * p.B * p.Sarea * p.omega;
        const e = Em * Math.sin(th);
        if (Math.abs(Math.sin(th)) > 0.04) {
          const up = e > 0;
          const mid = (A, B) => [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
          const dir = (A, B) => { const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy); return [dx / L, dy / L]; };
          // 回路方向：e>0 时 a→d→c→b→a（其法线方向为 +n，阻碍 Φ = BScosθ 的减小）
          const seq = up ? [[0, 3], [2, 1], [1, 0]] : [[3, 0], [1, 2], [0, 1]];
          for (const [i, j] of seq) { const m = mid(Q[i], Q[j]), d = dir(Q[i], Q[j]); smallArrow(m[0], m[1], d[0], d[1], RED, 10); }
          // 切割边的速度方向
          for (const sgn of [1, -1]) {
            const r = [sgn * hw * ux, 0, sgn * hw * uz];
            const v = [-r[2], 0, r[0]]; // (−ω ŷ) × r
            const a = proj(r[0], 0, r[2]), b = proj(r[0] + v[0] * 0.6, 0, r[2] + v[2] * 0.6);
            GW.draw.arrow(c, a[0], a[1], b[0], b[1], { color: INK, width: 2.5, head: 9 });
          }
        }
        // 底部滑环与电刷 → 外电阻（线圈在底边转轴处断开引出：d 侧接上滑环 K₁，c 侧接下滑环 K₂）
        const r1 = proj(0, -0.92, 0), r2 = proj(0, -1.04, 0);
        c.save(); c.strokeStyle = '#7a4a1e'; c.lineWidth = 3;
        c.beginPath(); c.ellipse(r1[0], r1[1], 16, 5, 0, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.ellipse(r2[0], r2[1], 16, 5, 0, 0, Math.PI * 2); c.stroke();
        const Ry = r2[1] + 24;
        c.strokeStyle = INK; c.lineWidth = 2.5; c.fillStyle = '#fff';
        c.beginPath();
        c.moveTo(r1[0] - 16, r1[1]); c.lineTo(r1[0] - 70, r1[1]); c.lineTo(r1[0] - 70, Ry); c.lineTo(r1[0] - 24, Ry);
        c.moveTo(r2[0] + 16, r2[1]); c.lineTo(r1[0] + 70, r2[1]); c.lineTo(r1[0] + 70, Ry); c.lineTo(r1[0] + 24, Ry);
        c.stroke();
        c.fillRect(r1[0] - 24, Ry - 8, 48, 16); c.strokeRect(r1[0] - 24, Ry - 8, 48, 16);
        c.restore();
        label('R', r1[0] + 88, Ry, INK, 'center', 'italic 17px "Times New Roman", serif');
        if (Math.abs(Math.sin(th)) > 0.04) {
          // e>0 时电流 a→d，从 d 侧引线流出 → K₁ → R（自左向右）→ K₂ → c
          smallArrow(r1[0] - 70, (r1[1] + Ry) / 2, 0, e > 0 ? 1 : -1, RED, 9);
          smallArrow(r1[0] + 70, (r2[1] + Ry) / 2, 0, e > 0 ? -1 : 1, RED, 9);
          smallArrow(r1[0] - 40, Ry, e > 0 ? 1 : -1, 0, RED, 9);
        }
        label('B', proj(-0.95, 0.62, 0.35)[0] + 4, proj(-0.95, 0.62, 0.35)[1] - 12, CYAN, 'center', 'italic bold 17px "Times New Roman", serif');
        pole(1.25, 'S', BLUE);
        // e-t 图
        const T = 2 * Math.PI / p.omega;
        const tmax = 2 * T;
        const ts = gen.t % tmax;
        const pts = [], phiPts = [];
        for (let k = 0; k <= 300; k++) { const t = tmax * k / 300; pts.push([t, Em * Math.sin(p.omega * t)]); phiPts.push([t, Em * Math.cos(p.omega * t)]); }
        const done = pts.filter((q) => q[0] <= ts);
        graph({ x: 12, y: sceneH + 8, w: W - 24, h: H - sceneH - 16 }, [
          { pts: phiPts, col: 'rgba(15,157,138,0.55)', dash: [6, 5], w: 2 },
          { pts: pts, col: 'rgba(228,87,46,0.25)', w: 2 },
          { pts: done, col: RED, w: 3 },
        ], {
          tmax, vmax: Math.max(0.01, Em) * 1.15, sym: true, xl: 't/s', yl: 'e/V',
          extra(ax) {
            c.save(); c.strokeStyle = 'rgba(242,165,65,0.9)'; c.setLineDash([4, 4]); c.lineWidth = 2;
            for (let k = 0; k <= 4; k++) { const X = ax.toX(k * T / 2); c.beginPath(); c.moveTo(X, ax.toY(Em * 1.1)); c.lineTo(X, ax.toY(-Em * 1.1)); c.stroke(); }
            c.restore();
            for (let k = 0; k <= 4; k++) label('中性面', ax.toX(k * T / 2) + (k === 0 ? 30 : 0), ax.toY(-Em * 1.05) + 2, '#b9771a', 'center', '13px sans-serif');
            label('Eₘ', ax.toX(T / 4), ax.toY(Em) - 12, RED, 'center', 'italic 15px "Times New Roman", serif');
            label('Φ（虚线，示意）', ax.toX(tmax) - 70, ax.toY(Em) - 8, CYAN, 'center', '13px sans-serif');
            const X = ax.toX(ts);
            c.save(); c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X, ax.toY(Em * 1.12)); c.lineTo(X, ax.toY(-Em * 1.12)); c.stroke();
            c.fillStyle = RED; c.beginPath(); c.arc(X, ax.toY(e), 5, 0, Math.PI * 2); c.fill(); c.restore();
          },
        });
        return { Em, e, T };
      }

      // ---------- 交互 ----------
      kit.drag((pt) => {
        if (S.mode !== 'coil') return null;
        const g = CO();
        if (Math.abs(pt.x - coil.mx) < MAG.len / 2 + 14 && Math.abs(pt.y - g.cy) < MAG.th / 2 + 16) return { off: coil.mx - pt.x };
        return null;
      }, (t, pt, e, start) => {
        const g = CO();
        coil.auto = 0;
        const nx = GW.clamp(pt.x + t.off, 30 + MAG.len / 2, g.cx + 10);
        const now = performance.now();
        if (!start && coil.last) {
          const dts = Math.max(0.008, (now - coil.last.t) / 1000);
          coil.vx = (nx - coil.last.x) / dts;
        }
        coil.last = { x: nx, t: now };
        coil.mx = nx;
      }, () => { coil.last = null; coil.vx = 0; });

      // ---------- 面板 ----------
      const modeSeg = GW.ui.segmented({ options: [{ value: 'rail', label: '导体棒' }, { value: 'coil', label: '磁铁与线圈' }, { value: 'gen', label: '发电机' }], value: S.mode, onChange(v) { S.mode = v; syncPanel(); resetAll(); save(); } });
      const transport = GW.simKit.transport(kit, () => { resetAll(); transport.setRunning(true); });

      const rp = S.rail;
      const rch = (k) => (v) => { rp[k] = v; railReset(); save(); };
      const driveSeg = GW.ui.segmented({ options: [{ value: 'force', label: '恒力 F 拉动' }, { value: 'v0', label: '给初速度 v₀' }], value: rp.drive, onChange(v) { rp.drive = v; syncPanel(); railReset(); save(); } });
      const rBdir = GW.ui.segmented({ options: [{ value: -1, label: '× 向里' }, { value: 1, label: '· 向外' }], value: rp.Bdir, onChange(v) { rp.Bdir = +v; railReset(); save(); } });
      const sRB = GW.ui.slider({ label: '磁感应强度 B', min: 0.2, max: 2, step: 0.1, value: rp.B, unit: 'T', onInput: rch('B') });
      const sRL = GW.ui.slider({ label: '导轨间距 L', min: 0.3, max: 1.2, step: 0.05, value: rp.L, unit: 'm', onInput: rch('L') });
      const sRR = GW.ui.slider({ label: '电阻 R', min: 0.2, max: 5, step: 0.1, value: rp.R, unit: 'Ω', onInput: rch('R') });
      const sRm = GW.ui.slider({ label: '棒的质量 m', min: 0.05, max: 1, step: 0.05, value: rp.m, unit: 'kg', onInput: rch('m') });
      const sRF = GW.ui.slider({ label: '拉力 F', min: 0.1, max: 2, step: 0.05, value: rp.F, unit: 'N', onInput: rch('F') });
      const sRv = GW.ui.slider({ label: '初速度 v₀', min: 0.5, max: 6, step: 0.1, value: rp.v0, unit: 'm/s', onInput: rch('v0') });
      const gRail = GW.ui.group('导体棒与导轨（导轨光滑，棒电阻不计）', driveSeg.el, rBdir.el, sRB.el, sRL.el, sRR.el, sRm.el, sRF.el, sRv.el);

      const cp = S.coil;
      const nSeg = GW.ui.segmented({ options: [{ value: 1, label: 'N 极朝向线圈' }, { value: -1, label: 'S 极朝向线圈' }], value: cp.N, onChange(v) { cp.N = +v; coilReset(); save(); } });
      const sTurns = GW.ui.slider({ label: '线圈匝数（示意）', min: 4, max: 14, step: 1, value: cp.turns, unit: '匝', onInput(v) { cp.turns = v; coil.Phi = flux(coil.mx); save(); } });
      const insBtn = GW.ui.button({ label: '→ 插入', primary: true, onClick() { coil.auto = 1; transport.setRunning(true); } });
      const outBtn = GW.ui.button({ label: '← 拔出', onClick() { coil.auto = -1; transport.setRunning(true); } });
      const gCoil = GW.ui.group('磁铁与线圈', nSeg.el, sTurns.el, GW.h('div', { class: 'gw-row' }, insBtn.el, outBtn.el));

      const gp = S.gen;
      const gch = (k) => (v) => { gp[k] = v; save(); };
      const sGN = GW.ui.slider({ label: '匝数 N', min: 1, max: 50, step: 1, value: gp.N, unit: '匝', onInput: gch('N') });
      const sGB = GW.ui.slider({ label: '磁感应强度 B', min: 0.1, max: 1, step: 0.05, value: gp.B, unit: 'T', onInput: gch('B') });
      const sGS = GW.ui.slider({ label: '线圈面积 S', min: 0.01, max: 0.1, step: 0.005, value: gp.Sarea, unit: 'm²', onInput: gch('Sarea') });
      const sGw = GW.ui.slider({ label: '角速度 ω', min: 0.5, max: 6, step: 0.1, value: gp.omega, unit: 'rad/s', onInput(v) { gp.omega = v; gen.t = gen.th / v; save(); } });
      const gGen = GW.ui.group('发电机', sGN.el, sGB.el, sGS.el, sGw.el);

      const ro = [0, 1, 2, 3, 4, 5].map(() => GW.ui.readout(''));
      const note = GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: '1.5' } });
      kit.panel.append(GW.ui.group('模式', modeSeg.el, transport.el), gRail, gCoil, gGen, GW.ui.group('读数', ...ro.map((r) => r.el), note));
      function setRO(i, l, v) { ro[i].el.firstChild.textContent = l; ro[i].set(v); ro[i].el.style.display = l ? '' : 'none'; }
      function syncPanel() {
        gRail.style.display = S.mode === 'rail' ? '' : 'none';
        gCoil.style.display = S.mode === 'coil' ? '' : 'none';
        gGen.style.display = S.mode === 'gen' ? '' : 'none';
        sRF.el.style.display = rp.drive === 'force' ? '' : 'none';
        sRv.el.style.display = rp.drive === 'v0' ? '' : 'none';
        note.textContent = {
          rail: '红点表示电流方向（正电荷定向移动方向）。由右手定则判断棒中电流方向；安培力总是阻碍导体棒的相对运动，棒做加速度减小的变速运动，最终匀速（恒力）或停止（只给初速度）。',
          coil: '约定：电流从检流计“+”接线柱流入时指针右偏。磁铁靠近，磁通量增加，感应电流的磁场阻碍其增加（来拒）；磁铁远离，感应电流的磁场阻碍其减少（去留）。',
          gen: '线圈平面与磁场垂直的位置叫中性面：此时磁通量最大，但 ab、cd 边不切割磁感线，e = 0，电流方向在此改变。从中性面开始计时：e = Eₘsinωt，Eₘ = NBSω。',
        }[S.mode];
      }
      function resetAll() { railReset(); coilReset(); genReset(); }

      syncPanel();
      resetAll();
      let roT = 0;
      kit.loop((dt) => {
        kit.background();
        roT += dt;
        if (S.mode === 'rail') {
          if (dt > 0) railStep(dt);
          const r = drawRail(dt);
          if (roT > 0.08 || dt === 0) {
            roT = 0;
            setRO(0, '速度 v', rail.v.toFixed(3) + ' m/s');
            setRO(1, '电动势 E = BLv', r.emf.toFixed(3) + ' V');
            setRO(2, '电流 I = E/R', Math.abs(r.I).toFixed(3) + ' A');
            setRO(3, '安培力 F安 = B²L²v/R', Math.abs(r.FA).toFixed(3) + ' N');
            setRO(4, '加速度 a', (((rp.drive === 'force' ? rp.F : 0) - r.FA) / rp.m).toFixed(3) + ' m/s²');
            setRO(5, rp.drive === 'force' ? '收尾速度 FR/(B²L²)' : '总位移 mv₀R/(B²L²)', rp.drive === 'force' ? r.vt.toFixed(3) + ' m/s' : (rp.m * rp.v0 * rp.R / (rp.B * rp.B * rp.L * rp.L)).toFixed(3) + ' m');
          }
        } else if (S.mode === 'coil') {
          if (dt > 0) coilStep(dt);
          if (!coil.last && !coil.auto) coil.vx *= 0.8;
          if (coil.auto) coil.vx = coil.auto * 260;
          drawCoilScene(dt);
          if (roT > 0.08) {
            roT = 0;
            const k = 0.5;
            setRO(0, '总磁通量 Φ（向右为正）', (coil.Phi * k).toFixed(2) + ' mWb');
            setRO(1, '感应电流 i', (coil.I * 1000).toFixed(2) + ' mA');
            const g = CO();
            const inside = coil.mx + MAG.len / 2 > g.cx - g.len / 2;
            setRO(2, '磁铁位置', inside ? '已进入线圈' : '在线圈外');
            setRO(3, '检流计', Math.abs(coil.needle) < 0.03 ? '指针在零点' : coil.needle > 0 ? '指针向右偏' : '指针向左偏');
          }
        } else {
          if (dt > 0) { gen.t += dt; gen.th = gp.omega * gen.t; }
          const r = drawGen(dt);
          if (roT > 0.08) {
            roT = 0;
            const deg = ((gen.th * 180 / Math.PI) % 360 + 360) % 360;
            setRO(0, '转过角度 θ（自中性面）', deg.toFixed(0) + '°');
            setRO(1, '峰值 Eₘ = NBSω', r.Em.toFixed(3) + ' V');
            setRO(2, '瞬时值 e = Eₘsinωt', r.e.toFixed(3) + ' V');
            setRO(3, '有效值 E = Eₘ/√2', (r.Em / Math.SQRT2).toFixed(3) + ' V');
            setRO(4, '磁通量 Φ = BScosωt', (gp.B * gp.Sarea * Math.cos(gen.th)).toFixed(4) + ' Wb');
            setRO(5, '周期 T = 2π/ω', r.T.toFixed(2) + ' s');
          }
        }
      });
      return { destroy() { kit.destroy(); }, _advance(t) { for (let k = 0; k < t / 0.02; k++) { if (S.mode === 'rail') railStep(0.02); else if (S.mode === 'gen') { gen.t += 0.02; gen.th = gp.omega * gen.t; } else coilStep(0.02); } } };
    },
  });
})();
