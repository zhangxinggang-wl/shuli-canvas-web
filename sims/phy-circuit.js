/* 数理无限画布 · 高中物理 · 闭合电路欧姆定律
 * 模式①：I = E/(R外 + r)，U = E − Ir；电源 U-I 图像（纵截距 E，横截距短路电流 E/r）；
 *        输出功率 P = E²R/(R+r)²，R = r 时最大 Pm = E²/(4r)。
 * 模式②：滑动变阻器的限流接法与分压接法（理想电表），比较负载电压的调节范围。
 * 电流方向：外电路从电源正极流向负极，电源内部从负极流向正极（小点表示正电荷定向移动方向）。
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#8a94a6';

  GW.registerSim({
    id: 'phy-circuit', name: '闭合电路', category: 'physics', group: '电磁学',
    desc: '闭合电路欧姆定律：拖动滑片改变外电阻，同步 U-I 图像与输出功率 P-R 曲线；限流与分压接法对比',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h7M14 6h7M10 3v6M14 4.5v3M3 6v12h5M16 18h5V6"/><rect x="8" y="16" width="8" height="4"/><path d="M12 12v3"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      if (!S.mode) S.mode = 'closed';
      S.c1 = Object.assign({ E: 6, r: 2, R0: 1, Rmax: 20, x: 0.25, sw: true }, S.c1 || {});
      S.c2 = Object.assign({ E: 6, r: 0.5, Rx: 10, Rab: 20, x: 0.5, conn: 'divider', sw: true }, S.c2 || {});
      const save = () => ctx.save();

      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 750, H = 620;
      kit.onResize((w, h) => { W = w; H = h; });

      // ---------- 绘图助手 ----------
      function label(t, x, y, col, align, font) {
        c.save(); c.font = font || '15px sans-serif'; c.fillStyle = col || INK; c.textAlign = align || 'center'; c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 4; c.lineJoin = 'round';
        c.strokeText(t, x, y); c.fillText(t, x, y); c.restore();
      }
      function wire(pts) {
        c.save(); c.strokeStyle = INK; c.lineWidth = 2.5; c.lineJoin = 'round'; c.lineCap = 'round';
        c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); c.restore();
      }
      function node(x, y) { c.save(); c.fillStyle = INK; c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill(); c.restore(); }
      function terminal(x, y) { c.save(); c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore(); }
      // 电阻（水平/竖直），中心 (x,y)
      function resistor(x, y, vertical, name, len) {
        const L = len || 56, T = 18;
        c.save(); c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 2.5;
        if (vertical) { c.fillRect(x - T / 2, y - L / 2, T, L); c.strokeRect(x - T / 2, y - L / 2, T, L); }
        else { c.fillRect(x - L / 2, y - T / 2, L, T); c.strokeRect(x - L / 2, y - T / 2, L, T); }
        c.restore();
        if (name) label(name, vertical ? x - 26 : x, vertical ? y : y - 24, INK, 'center', 'italic 17px "Times New Roman", serif');
      }
      // 电池：正极（长细线）在 dir 指向的反侧。x 为中心，plusLeft = 正极在左
      function battery(x, y, plusLeft) {
        c.save(); c.strokeStyle = INK;
        const xl = x - 6, xs = x + 6; // 长线、短线位置
        const pl = plusLeft ? xl : xs, sh = plusLeft ? xs : xl;
        c.fillStyle = '#fff'; c.fillRect(x - 10, y - 24, 20, 48);
        c.lineWidth = 2.5; c.beginPath(); c.moveTo(pl, y - 22); c.lineTo(pl, y + 22); c.stroke();
        c.lineWidth = 6; c.beginPath(); c.moveTo(sh, y - 11); c.lineTo(sh, y + 11); c.stroke();
        c.restore();
        label('+', pl + (plusLeft ? -10 : 10), y - 24, RED, 'center', 'bold 16px sans-serif');
        label('−', sh + (plusLeft ? 10 : -10), y - 24, BLUE, 'center', 'bold 16px sans-serif');
      }
      function meter(x, y, ch, reading, col, below) {
        c.save(); c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 2.5;
        c.beginPath(); c.arc(x, y, 17, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
        label(ch, x, y + 1, INK, 'center', 'bold 17px sans-serif');
        if (reading) {
          c.save(); c.font = 'bold 15px sans-serif';
          const tw = c.measureText(reading).width + 14;
          const bx = x - tw / 2, by = below ? y + 24 : y - 50;
          c.fillStyle = col || CYAN; c.beginPath(); c.roundRect ? c.roundRect(bx, by, tw, 24, 6) : c.rect(bx, by, tw, 24); c.fill();
          c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(reading, x, by + 12.5);
          c.restore();
        }
      }
      function switchSym(x1, x2, y, closed) {
        // 水平开关：x1 固定端，x2 触点
        terminal(x1, y); terminal(x2, y);
        c.save(); c.strokeStyle = INK; c.lineWidth = 2.5; c.lineCap = 'round';
        const a = closed ? 0 : -0.5, L = x2 - x1;
        c.beginPath(); c.moveTo(x1, y); c.lineTo(x1 + Math.cos(a) * L, y + Math.sin(a) * L); c.stroke(); c.restore();
        label('S', (x1 + x2) / 2, y + 20, INK, 'center', 'italic 16px "Times New Roman", serif');
      }
      // 滑动变阻器：水平主体 xa..xb，滑片位置 xp，返回触点坐标
      function rheostat(xa, xb, y, xp, name) {
        c.save(); c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 2.5;
        c.fillRect(xa, y - 9, xb - xa, 18); c.strokeRect(xa, y - 9, xb - xa, 18);
        // 绕线示意
        c.strokeStyle = 'rgba(27,36,51,0.18)'; c.lineWidth = 1.5;
        for (let x = xa + 6; x < xb - 3; x += 7) { c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 3, y + 9); c.stroke(); }
        c.restore();
        // 滑片箭头
        GW.draw.arrow(c, xp, y - 40, xp, y - 10, { color: INK, width: 2.5, head: 11 });
        c.save(); c.strokeStyle = CYAN; c.lineWidth = 2.5; c.fillStyle = 'rgba(15,157,138,0.15)';
        c.beginPath(); c.arc(xp, y - 26, 14, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
        label('P', xp + 22, y - 30, INK, 'center', 'italic 16px "Times New Roman", serif');
        label('a', xa - 4, y + 24, INK, 'center', 'italic 16px "Times New Roman", serif');
        label('b', xb + 4, y + 24, INK, 'center', 'italic 16px "Times New Roman", serif');
        if (name) label(name, (xa + xb) / 2, y + 26, INK, 'center', '15px sans-serif');
      }
      // 沿折线的电流小点：phase 为已流过的“电荷”对应的路程
      function pathLen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
      function dots(path, phase) {
        const L = pathLen(path), sp = 26;
        if (L < 1) return;
        c.save(); c.fillStyle = 'rgba(228,87,46,0.9)';
        let s0 = ((phase % sp) + sp) % sp;
        for (let s = s0; s < L; s += sp) {
          let r = s;
          for (let i = 1; i < path.length; i++) {
            const a = path[i - 1], b = path[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (r <= l) { c.beginPath(); c.arc(a[0] + (b[0] - a[0]) * r / l, a[1] + (b[1] - a[1]) * r / l, 3.6, 0, Math.PI * 2); c.fill(); break; }
            r -= l;
          }
        }
        c.restore();
      }
      function graphBox(x, y, w, h, title) {
        c.save(); c.fillStyle = '#fbfcfd'; c.strokeStyle = '#e3e7ee'; c.lineWidth = 1; c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h); c.restore();
        if (title) label(title, x + w - 8, y + 14, '#5b6576', 'right', '14px sans-serif');
      }
      function plot(ax, fn, x0, x1, col, w, dash, area) {
        c.save(); c.beginPath(); c.rect(area.x, area.y, area.w, area.h); c.clip();
        c.strokeStyle = col; c.lineWidth = w || 2.5; if (dash) c.setLineDash(dash);
        c.beginPath();
        for (let k = 0; k <= 200; k++) { const v = x0 + (x1 - x0) * k / 200, X = ax.toX(v), Y = ax.toY(fn(v)); k ? c.lineTo(X, Y) : c.moveTo(X, Y); }
        c.stroke(); c.restore();
      }
      function guide(ax, xv, yv, col) {
        c.save(); c.strokeStyle = col || 'rgba(27,36,51,0.45)'; c.lineWidth = 1.5; c.setLineDash([5, 4]);
        c.beginPath(); c.moveTo(ax.toX(xv), ax.toY(yv)); c.lineTo(ax.toX(xv), ax.toY(0)); c.moveTo(ax.toX(xv), ax.toY(yv)); c.lineTo(ax.toX(0), ax.toY(yv)); c.stroke(); c.restore();
      }
      function pointDot(X, Y, col) { c.save(); c.fillStyle = col; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(X, Y, 6.5, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore(); }

      // ---------- 电流相位 ----------
      const ph = {};
      const KDOT = 22; // 每安培每秒移动的像素
      function adv(key, I, dt) { ph[key] = (ph[key] || 0) + I * KDOT * dt * (I > 3 ? 3 / I * (1 + Math.log(I / 3)) : 1); return ph[key]; }

      // =============== 模式①：闭合电路 ===============
      function solve1() {
        const p = S.c1;
        const Rp = p.x * p.Rmax, Rext = p.R0 + Rp;
        const I = p.sw ? p.E / (Rext + p.r) : 0;
        return { Rp, Rext, I, U: p.sw ? I * Rext : p.E, Ur: I * p.r };
      }
      const G1 = () => {
        const L = 60, R = W - 60, top = 70, bot = H * 0.5;
        return { L, R, top, bot, bx: W * 0.42, xa: L + (R - L) * 0.42, xb: L + (R - L) * 0.42 + 190 };
      };
      function drawClosed(dt) {
        const p = S.c1, g = G1(), s = solve1();
        const { L, R, top, bot, bx, xa, xb } = g;
        const xp = xa + p.x * (xb - xa);
        const rX = bx + 70;
        // 电源虚线框
        c.save(); c.strokeStyle = 'rgba(27,36,51,0.45)'; c.setLineDash([6, 5]); c.lineWidth = 1.5;
        c.strokeRect(bx - 32, top - 34, 140, 68); c.restore();
        label('电源', bx - 32 + 4, top + 46, '#5b6576', 'left', '14px sans-serif');
        // 导线
        const yS = top + (bot - top) * 0.45, sw1 = yS - 24, sw2 = yS + 24;
        wire([[bx - 6, top], [L, top], [L, sw1]]);
        wire([[L, sw2 + 1], [L, bot], [xa, bot]]);
        wire([[xp, bot - 40], [xp, bot - 64], [xb + 36, bot - 64], [xb + 36, bot], [R, bot], [R, top], [bx + 6, top]]);
        // 开关（竖直）
        terminal(L, sw1); terminal(L, sw2);
        c.save(); c.strokeStyle = INK; c.lineWidth = 2.5; c.lineCap = 'round';
        const ang = p.sw ? 0 : -0.55;
        c.beginPath(); c.moveTo(L, sw2); c.lineTo(L + Math.sin(-ang) * 48 * -1, sw2 - Math.cos(ang) * 48); c.stroke(); c.restore();
        label('S', L - 20, yS, INK, 'center', 'italic 16px "Times New Roman", serif');
        // 元件
        battery(bx, top, true);
        label('E', bx, top + 22 + 14, INK, 'center', 'italic 17px "Times New Roman", serif');
        resistor(rX, top, false, '', 46);
        label('r', rX, top + 24, INK, 'center', 'italic 17px "Times New Roman", serif');
        resistor(L + (xa - L) * 0.5, bot, false, 'R₀');
        rheostat(xa, xb, bot, xp, '');
        terminal(xb, bot);
        label('R（接入 aP 段）', (xa + xb) / 2, bot + 26, INK, 'center', '15px sans-serif');
        // 电流表
        const ay = (top + bot) / 2;
        meter(R, ay, 'A', s.I.toFixed(2) + ' A', CYAN, false);
        // 电压表：并联在电源两端（虚线框外）
        const vy = top - 52, vxl = bx - 52, vxr = bx + 126;
        wire([[vxl, top], [vxl, vy], [bx + 37 - 18, vy]]);
        wire([[bx + 37 + 18, vy], [vxr, vy], [vxr, top]]);
        node(vxl, top); node(vxr, top);
        meter(bx + 37, vy, 'V', null);
        label('U = ' + s.U.toFixed(2) + ' V', bx + 37 + 30, vy - 1, '#fff', 'left', 'bold 15px sans-serif');
        c.save(); c.font = 'bold 15px sans-serif'; const tw = c.measureText('U = ' + s.U.toFixed(2) + ' V').width + 14;
        c.fillStyle = BLUE; c.beginPath(); c.roundRect ? c.roundRect(bx + 60, vy - 12, tw, 24, 6) : c.rect(bx + 60, vy - 12, tw, 24); c.fill();
        c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('U = ' + s.U.toFixed(2) + ' V', bx + 67, vy + 0.5); c.restore();
        // 电流小点：外电路 正极 → 左 → 下 → R₀ → aP → P → … → 电流表 → r → 负极；电源内部 负极 → 正极
        if (p.sw && s.I > 1e-6) {
          const phs = adv('c1', s.I, dt);
          dots([[bx - 8, top], [L, top], [L, bot], [xp, bot], [xp, bot - 64], [xb + 36, bot - 64], [xb + 36, bot], [R, bot], [R, top], [bx + 8, top]], phs);
          // 方向箭头
          GW.draw.arrow(c, L + 50, top - 12, L + 20, top - 12, { color: RED, width: 2.5, head: 9 });
          GW.draw.arrow(c, R + 14, bot - 50, R + 14, bot - 80, { color: RED, width: 2.5, head: 9 });
          label('I', L + 60, top - 14, RED, 'left', 'italic bold 16px "Times New Roman", serif');
        }
        // 图像
        const gy = bot + 50, gh = H - gy - 10, gw = (W - 36) / 2;
        drawUI({ x: 12, y: gy, w: gw, h: gh }, s);
        drawPR({ x: 24 + gw, y: gy, w: gw, h: gh }, s);
        return s;
      }
      function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; for (const k of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m <= k + 1e-9) return k * p; return 10 * p; }
      function drawUI(area, s) {
        const p = S.c1;
        graphBox(area.x, area.y, area.w, area.h, '电源的 U-I 图像');
        const Isc = p.E / p.r;
        const imax = niceMax(Isc * 1.08), umax = niceMax(p.E * 1.12);
        const ox = area.x + 40, oy = area.y + area.h - 26;
        const ax = GW.draw.axes(c, { x: ox - 30, y: area.y + 2, w: area.x + area.w - 2 - (ox - 30), h: area.h - 4 }, { ox, oy, sx: (area.w - 64) / imax, sy: (area.h - 54) / umax, xLabel: 'I/A', yLabel: 'U/V', color: '#5b6576' });
        // 外电阻的 U-I 图线 U = IR外（虚线）
        plot(ax, (i) => i * s.Rext, 0, imax, 'rgba(242,165,65,0.9)', 2, [6, 5], area);
        plot(ax, (i) => p.E - i * p.r, 0, Isc, BLUE, 3, null, area);
        label('E = ' + p.E.toFixed(1) + ' V', ax.toX(0) + 8, ax.toY(p.E) - 12, BLUE, 'left');
        pointDot(ax.toX(0), ax.toY(p.E), BLUE);
        pointDot(ax.toX(Isc), ax.toY(0), BLUE);
        label('I短 = E/r = ' + Isc.toFixed(2) + ' A', area.x + area.w - 8, ax.toY(0) - 34, BLUE, 'right');
        if (p.sw) {
          guide(ax, s.I, s.U);
          pointDot(ax.toX(s.I), ax.toY(s.U), RED);
          label('(' + s.I.toFixed(2) + ' A, ' + s.U.toFixed(2) + ' V)', ax.toX(s.I) + 10, ax.toY(s.U) - 14, RED, 'left');
        }
        label('斜率绝对值 = r', area.x + area.w - 10, area.y + 34, '#5b6576', 'right', '13px sans-serif');
        label('虚线：外电阻 U = IR外', area.x + area.w - 10, area.y + 52, '#b9771a', 'right', '13px sans-serif');
      }
      function drawPR(area, s) {
        const p = S.c1;
        graphBox(area.x, area.y, area.w, area.h, '输出功率 P-R外 图像');
        const Rm = p.R0 + p.Rmax;
        const Pm = p.E * p.E / (4 * p.r);
        const pmax = niceMax(Pm * 1.15), rmax = niceMax(Math.max(Rm, p.r * 2.2));
        const ox = area.x + 40, oy = area.y + area.h - 26;
        const ax = GW.draw.axes(c, { x: ox - 30, y: area.y + 2, w: area.x + area.w - 2 - (ox - 30), h: area.h - 4 }, { ox, oy, sx: (area.w - 64) / rmax, sy: (area.h - 54) / pmax, xLabel: 'R外/Ω', yLabel: 'P/W', color: '#5b6576' });
        // 可调范围
        c.save(); c.fillStyle = 'rgba(15,157,138,0.08)';
        c.fillRect(ax.toX(p.R0), area.y + 4, ax.toX(Rm) - ax.toX(p.R0), area.h - 30); c.restore();
        plot(ax, (R) => p.E * p.E * R / ((R + p.r) * (R + p.r)), 0, rmax, CYAN, 3, null, area);
        guide(ax, p.r, Pm, 'rgba(242,165,65,0.9)');
        pointDot(ax.toX(p.r), ax.toY(Pm), GOLD);
        label('R外 = r 时 Pₘ = E²/(4r) = ' + Pm.toFixed(2) + ' W', ax.toX(p.r) + 10, ax.toY(Pm) - 14, '#b9771a', 'left');
        if (p.sw) {
          const P = s.U * s.I;
          pointDot(ax.toX(s.Rext), ax.toY(P), RED);
        }
      }

      // =============== 模式②：限流与分压 ===============
      function solve2(conn, x) {
        const p = S.c2;
        const Rx = p.Rx, R0 = p.Rab, r = p.r;
        if (!p.sw) return { Ux: 0, Ix: 0, Itot: 0, IaP: 0 };
        if (conn === 'limit') {
          const Ru = (1 - x) * R0; // 接入 Pb 段
          const I = p.E / (Rx + Ru + r);
          return { Ux: I * Rx, Ix: I, Itot: I, IaP: 0 };
        }
        const RaP = x * R0, RPb = (1 - x) * R0;
        const Rpar = RaP < 1e-9 ? 0 : (Rx * RaP) / (Rx + RaP);
        const Itot = p.E / (RPb + Rpar + r);
        const Ux = Itot * Rpar;
        return { Ux, Ix: Ux / Rx, Itot, IaP: RaP < 1e-9 ? Itot : Ux / RaP };
      }
      const G2 = () => {
        const L = 80, R = W - 80, top = 60, bot = H * 0.52, yl = top + (bot - top) * 0.45;
        return { L, R, top, bot, yl, bx: W * 0.5, xa: L, xb: R };
      };
      function drawDivider(dt) {
        const p = S.c2, g = G2(), conn = p.conn;
        const { L, R, top, bot, yl, bx, xa, xb } = g;
        const xp = xa + 10 + p.x * (xb - xa - 20);
        const s = solve2(conn, p.x);
        // 电源 + 开关（顶部）
        wire([[bx - 6, top], [L, top], [L, yl]]);
        if (conn === 'divider') { wire([[L, yl], [L, bot], [xa, bot]]); node(L, yl); }
        else terminal(xa, bot);
        wire([[bx + 6, top], [bx + 60, top]]);
        wire([[bx + 110, top], [R, top], [R, bot], [xb, bot]]);
        switchSym(bx + 60, bx + 110, top, p.sw);
        battery(bx, top, true);
        label('E, r', bx, top + 38, INK, 'center', 'italic 16px "Times New Roman", serif');
        rheostat(xa, xb, bot, xp, '');
        // 负载支路：J(L,yl) → Rx → 电流表 → (xp,yl) → 滑片
        const rxX = L + 120, amX = L + 230;
        const kx = amX + 44, ky = bot - 64;
        wire([[L, yl], [kx, yl], [kx, ky], [xp, ky], [xp, bot - 40]]);
        resistor(rxX, yl, false, 'Rₓ');
        meter(amX, yl, 'A', s.Ix.toFixed(3) + ' A', CYAN, true);
        // 电压表并联在 Rx 两端
        const vy = yl - 52;
        wire([[rxX - 50, yl], [rxX - 50, vy], [rxX - 18, vy]]); wire([[rxX + 18, vy], [rxX + 50, vy], [rxX + 50, yl]]);
        node(rxX - 50, yl); node(rxX + 50, yl);
        meter(rxX, vy, 'V', null);
        c.save(); c.font = 'bold 15px sans-serif'; const tt = 'Uₓ = ' + s.Ux.toFixed(2) + ' V'; const tw = c.measureText(tt).width + 14;
        c.fillStyle = BLUE; c.beginPath(); c.roundRect ? c.roundRect(rxX + 60, vy - 12, tw, 24, 6) : c.rect(rxX + 60, vy - 12, tw, 24); c.fill();
        c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(tt, rxX + 67, vy + 0.5); c.restore();
        label(conn === 'divider' ? '分压接法' : '限流接法', R - 4, yl - 30, conn === 'divider' ? CYAN : '#b9771a', 'right', 'bold 17px sans-serif');
        // 电流小点
        if (p.sw) {
          dots([[bx - 8, top], [L, top], [L, yl]], adv('t', s.Itot, dt));
          dots([[L, yl], [kx, yl], [kx, ky], [xp, ky], [xp, bot - 10]], adv('x', s.Ix, dt));
          if (conn === 'divider') dots([[L, yl], [L, bot], [xp, bot]], adv('aP', s.IaP, dt));
          dots([[xp, bot], [xb, bot], [R, bot], [R, top], [bx + 8, top]], adv('Pb', s.Itot, dt));
        }
        // U-x 图
        const gy = bot + 50, gh = H - gy - 10;
        const area = { x: 12, y: gy, w: W - 24, h: gh };
        graphBox(area.x, area.y, area.w, area.h, '负载电压 Uₓ 随滑片位置的变化');
        const umax = niceMax(p.E * 1.1);
        const ox = area.x + 44, oy = area.y + area.h - 26;
        const ax = GW.draw.axes(c, { x: ox - 30, y: area.y + 2, w: area.x + area.w - 2 - (ox - 30), h: area.h - 4 }, { ox, oy, sx: (area.w - 80) / 1, sy: (area.h - 50) / umax, xLabel: 'aP/ab', yLabel: 'Uₓ/V', color: '#5b6576', stepX: 0.2 });
        const fL = (x) => solve2('limit', x).Ux, fD = (x) => solve2('divider', x).Ux;
        plot(ax, fL, 0, 1, conn === 'limit' ? GOLD : 'rgba(242,165,65,0.45)', conn === 'limit' ? 3.5 : 2, conn === 'limit' ? null : [6, 5], area);
        plot(ax, fD, 0, 1, conn === 'divider' ? CYAN : 'rgba(15,157,138,0.45)', conn === 'divider' ? 3.5 : 2, conn === 'divider' ? null : [6, 5], area);
        label('限流：' + fL(0).toFixed(2) + ' ~ ' + fL(1).toFixed(2) + ' V', ax.toX(0.02), ax.toY(fL(0)) - 14, '#b9771a', 'left');
        label('分压：0 ~ ' + fD(1).toFixed(2) + ' V', ax.toX(0.55), ax.toY(fD(0.55)) + 18, CYAN, 'left');
        if (p.sw) {
          guide(ax, p.x, s.Ux);
          pointDot(ax.toX(p.x), ax.toY(s.Ux), RED);
        }
        return s;
      }

      // ---------- 交互：拖动滑片 ----------
      function sliderGeom() {
        if (S.mode === 'closed') { const g = G1(); return { xa: g.xa, xb: g.xb, y: g.bot, x0: g.xa, x1: g.xb, p: S.c1 }; }
        const g = G2(); return { xa: g.xa, xb: g.xb, y: g.bot, x0: g.xa + 10, x1: g.xb - 10, p: S.c2 };
      }
      kit.drag((pt) => {
        const sg = sliderGeom(), xp = sg.x0 + sg.p.x * (sg.x1 - sg.x0);
        if (Math.hypot(pt.x - xp, pt.y - (sg.y - 26)) < 22) return 'slider';
        if (pt.x >= sg.xa - 4 && pt.x <= sg.xb + 4 && Math.abs(pt.y - sg.y) < 16) return 'slider';
        // 开关
        if (S.mode === 'closed') { const g = G1(); if (Math.abs(pt.x - g.L) < 30 && Math.abs(pt.y - (g.top + (g.bot - g.top) * 0.45)) < 32) return 'sw'; }
        else { const g = G2(); if (pt.x > g.bx + 50 && pt.x < g.bx + 120 && Math.abs(pt.y - g.top) < 30) return 'sw'; }
        return null;
      }, (t, pt, e, start) => {
        if (t === 'sw') { if (start) { const p = S.mode === 'closed' ? S.c1 : S.c2; p.sw = !p.sw; tSw.set(p.sw); save(); } return; }
        const sg = sliderGeom();
        sg.p.x = Math.round(GW.clamp((pt.x - sg.x0) / (sg.x1 - sg.x0), 0, 1) * 200) / 200;
        (S.mode === 'closed' ? sX1 : sX2).set(sg.p.x);
      }, () => save());

      // ---------- 面板 ----------
      const modeSeg = GW.ui.segmented({ options: [{ value: 'closed', label: '闭合电路' }, { value: 'divider', label: '限流与分压' }], value: S.mode, onChange(v) { S.mode = v; syncPanel(); save(); } });
      const tSw = GW.ui.toggle({ label: '开关 S 闭合', value: (S.mode === 'closed' ? S.c1 : S.c2).sw, onChange(v) { (S.mode === 'closed' ? S.c1 : S.c2).sw = v; save(); } });
      const p1 = S.c1, p2 = S.c2;
      const ch = (o, k) => (v) => { o[k] = v; save(); };
      const sE1 = GW.ui.slider({ label: '电动势 E', min: 1.5, max: 12, step: 0.5, value: p1.E, unit: 'V', onInput: ch(p1, 'E') });
      const sr1 = GW.ui.slider({ label: '内阻 r', min: 0.5, max: 6, step: 0.1, value: p1.r, unit: 'Ω', onInput: ch(p1, 'r') });
      const sR0 = GW.ui.slider({ label: '定值电阻 R₀', min: 0, max: 5, step: 0.5, value: p1.R0, unit: 'Ω', onInput: ch(p1, 'R0') });
      const sRm = GW.ui.slider({ label: '变阻器最大阻值', min: 5, max: 30, step: 1, value: p1.Rmax, unit: 'Ω', onInput: ch(p1, 'Rmax') });
      const sX1 = GW.ui.slider({ label: '滑片位置 aP/ab', min: 0, max: 1, step: 0.005, value: p1.x, onInput: ch(p1, 'x') });
      const g1 = GW.ui.group('电路参数（可拖动滑片 P）', sE1.el, sr1.el, sR0.el, sRm.el, sX1.el);

      const connSeg = GW.ui.segmented({ options: [{ value: 'limit', label: '限流接法' }, { value: 'divider', label: '分压接法' }], value: p2.conn, onChange(v) { p2.conn = v; save(); } });
      const sE2 = GW.ui.slider({ label: '电动势 E', min: 1.5, max: 12, step: 0.5, value: p2.E, unit: 'V', onInput: ch(p2, 'E') });
      const sr2 = GW.ui.slider({ label: '内阻 r', min: 0, max: 3, step: 0.1, value: p2.r, unit: 'Ω', onInput: ch(p2, 'r') });
      const sRx = GW.ui.slider({ label: '负载电阻 Rₓ', min: 2, max: 50, step: 1, value: p2.Rx, unit: 'Ω', onInput: ch(p2, 'Rx') });
      const sRab = GW.ui.slider({ label: '变阻器总阻值 Rab', min: 5, max: 100, step: 1, value: p2.Rab, unit: 'Ω', onInput: ch(p2, 'Rab') });
      const sX2 = GW.ui.slider({ label: '滑片位置 aP/ab', min: 0, max: 1, step: 0.005, value: p2.x, onInput: ch(p2, 'x') });
      const g2 = GW.ui.group('接法与参数（可拖动滑片 P）', connSeg.el, sE2.el, sr2.el, sRx.el, sRab.el, sX2.el);

      const ro = [0, 1, 2, 3, 4, 5, 6].map(() => GW.ui.readout(''));
      const note = GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: '1.5' } });
      kit.panel.append(GW.ui.group('模式', modeSeg.el, tSw.el), g1, g2, GW.ui.group('读数（理想电表）', ...ro.map((r) => r.el), note));
      function setRO(i, l, v) { ro[i].el.firstChild.textContent = l; ro[i].set(v); ro[i].el.style.display = l ? '' : 'none'; }
      function syncPanel() {
        g1.style.display = S.mode === 'closed' ? '' : 'none';
        g2.style.display = S.mode === 'divider' ? '' : 'none';
        tSw.set((S.mode === 'closed' ? S.c1 : S.c2).sw);
        note.textContent = S.mode === 'closed'
          ? '外电阻增大 → 电流减小 → 内电压 Ir 减小 → 路端电压 U 增大；断路时 U = E，短路时 I = E/r。外电阻等于内阻时电源输出功率最大。'
          : '限流接法：Rₓ 与变阻器 Pb 段串联，Uₓ 不能调到 0；分压接法：Rₓ 与 aP 段并联，Uₓ 可从 0 连续调节，调节范围大。闭合开关前，限流接法滑片应置于阻值最大处（a 端），分压接法应使 Uₓ = 0（a 端）。';
      }
      syncPanel();

      let roT = 0;
      kit.loop((dt) => {
        kit.background();
        roT += dt;
        if (S.mode === 'closed') {
          const s = drawClosed(dt), p = S.c1;
          if (roT > 0.1 || dt === 0) {
            roT = 0;
            setRO(0, '外电阻 R外 = R₀ + R', s.Rext.toFixed(2) + ' Ω');
            setRO(1, '电流 I = E/(R外+r)', s.I.toFixed(3) + ' A');
            setRO(2, '路端电压 U = E − Ir', s.U.toFixed(3) + ' V');
            setRO(3, '内电压 Ir', s.Ur.toFixed(3) + ' V');
            setRO(4, '输出功率 P出 = UI', (s.U * s.I).toFixed(3) + ' W');
            setRO(5, '总功率 P总 = EI', (p.E * s.I).toFixed(3) + ' W');
            setRO(6, '效率 η = U/E', p.sw ? (s.U / p.E * 100).toFixed(1) + '%' : '—');
          }
        } else {
          const s = drawDivider(dt);
          if (roT > 0.1 || dt === 0) {
            roT = 0;
            setRO(0, '负载电压 Uₓ', s.Ux.toFixed(3) + ' V');
            setRO(1, '负载电流 Iₓ', s.Ix.toFixed(3) + ' A');
            setRO(2, '干路电流 I', s.Itot.toFixed(3) + ' A');
            setRO(3, '限流接法 Uₓ 范围', solve2('limit', 0).Ux.toFixed(2) + ' ~ ' + solve2('limit', 1).Ux.toFixed(2) + ' V');
            setRO(4, '分压接法 Uₓ 范围', '0 ~ ' + solve2('divider', 1).Ux.toFixed(2) + ' V');
            setRO(5, '', ''); setRO(6, '', '');
          }
        }
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
