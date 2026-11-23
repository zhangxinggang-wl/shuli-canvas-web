/* 数理无限画布 · 高中物理 · 带电粒子在电场、磁场中的运动
 * 数值积分采用 Boris 推进（纯磁场中严格保持速率），F = q(E + v×B)。
 * 坐标：物理坐标 x 向右、y 向上、z 垂直纸面向外；B 向里为 Bz<0（×），向外 Bz>0（·）。
 * 教学单位：长度 m（100 px = 1 m），q 以 C、m 以 kg、B 以 T、E 以 V/m 计（理想化数值，便于观察）。
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#8a94a6';
  const PX = 100, VS = 36; // VS：速度箭头每 1 m/s 的像素长

  const PRESETS = {
    circle: { label: '磁场中的匀速圆周运动' },
    bounded: { label: '有界磁场（矩形边界）' },
    selector: { label: '速度选择器' },
    deflect: { label: '电场中的偏转（类平抛）' },
    cyclotron: { label: '回旋加速器' },
    spectro: { label: '质谱仪' },
    custom: { label: '自定义：电场 + 磁场' },
  };
  const DEF = {
    circle: { q: 1, m: 1, v0: 1.5, ang: 0, x: 0, y: -1.5, B: 1, Bdir: -1, E: 0, Edir: 270 },
    bounded: { q: 1, m: 1, v0: 1.5, ang: 0, x: -3.3, y: 0, B: 1, Bdir: -1, E: 0, Edir: 270 },
    selector: { q: 1, m: 1, v0: 1.5, ang: 0, x: -3.5, y: 0, B: 1, Bdir: -1, E: 1.5, Edir: 270 },
    deflect: { q: 1, m: 1, v0: 2, ang: 0, x: -3.5, y: 0, B: 0, Bdir: -1, E: 0.4, Edir: 270 },
    cyclotron: { q: 1, m: 1, v0: 0, ang: 0, x: 0, y: 0, B: 1, Bdir: -1, E: 0, Edir: 0, U: 0.4 },
    spectro: { q: 1, m: 1, v0: 0, ang: 270, x: -1.6, y: 2.75, B: 1, Bdir: -1, E: 0, Edir: 270, U: 1, m2: 1.5 },
    custom: { q: 1, m: 1, v0: 1.5, ang: 0, x: -3.4, y: 0.4, B: 0.8, Bdir: -1, E: 0.8, Edir: 90 },
  };
  // 各预设的几何
  const GEO = {
    bounded: { x0: -1.2, x1: 1.2, y0: -1.6, y1: 1.6 },
    selector: { x0: -2.2, x1: 2.2, yt: 0.9, yb: -0.9 },
    deflect: { x0: -2.5, x1: 0.5, yt: 1.0, yb: -1.0, screen: 3.0 },
    cyclotron: { R: 2.6, g: 0.24 },
    spectro: { s1: 2.75, s2: 1.95, film: 1.5 },
    custom: { x0: -2, x1: 2, y0: -2, y1: 2 },
  };
  const fmt = (v, d = 2) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(d));

  GW.registerSim({
    id: 'phy-particle', name: '带电粒子在场中的运动', category: 'physics', group: '电磁学',
    desc: '洛伦兹力与电场力作用下的轨迹：圆周运动、有界磁场、速度选择器、类平抛、回旋加速器、质谱仪',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18a8 8 0 1 1 8 3"/><circle cx="12" cy="21" r="1.6" fill="currentColor"/><path d="M7 7l2 2M9 7l-2 2M15 7l2 2M17 7l-2 2"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      if (!S.preset || !PRESETS[S.preset]) S.preset = 'circle';
      if (!S.p) S.p = {};
      for (const k in DEF) S.p[k] = Object.assign({}, DEF[k], S.p[k] || {});
      if (S.showF == null) S.showF = true;
      if (S.speed == null) S.speed = 1;
      const save = () => ctx.save();
      const P = () => S.p[S.preset];

      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 750, H = 620;
      kit.onResize((w, h) => { W = w; H = h; });
      const sx = (x) => W / 2 + x * PX, sy = (y) => H / 2 - y * PX;
      const wx = (px) => (px - W / 2) / PX, wy = (py) => (H / 2 - py) / PX;

      // ---------- 场 ----------
      function fields(x, y, t, part) {
        const p = P(), pre = S.preset;
        const Bz = p.B * p.Bdir;
        const er = (p.Edir * Math.PI) / 180;
        let Ex = 0, Ey = 0, B = 0;
        if (pre === 'circle') B = Bz;
        else if (pre === 'bounded') { const g = GEO.bounded; if (x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1) B = Bz; }
        else if (pre === 'selector') { const g = GEO.selector; if (x >= g.x0 && x <= g.x1 && y > g.yb && y < g.yt) { B = Bz; Ex = p.E * Math.cos(er); Ey = p.E * Math.sin(er); } }
        else if (pre === 'deflect') { const g = GEO.deflect; if (x >= g.x0 && x <= g.x1 && y > g.yb && y < g.yt) { Ex = p.E * Math.cos(er); Ey = p.E * Math.sin(er); } }
        else if (pre === 'custom') { const g = GEO.custom; if (x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1) { B = Bz; Ex = p.E * Math.cos(er); Ey = p.E * Math.sin(er); } }
        else if (pre === 'cyclotron') {
          const g = GEO.cyclotron;
          if (Math.hypot(x, y) <= g.R) {
            B = Bz;
            if (Math.abs(x) < g.g / 2) {
              // 交变电压：方波，周期等于回旋周期 T = 2πm/(|q|B)
              const T = 2 * Math.PI * part.m / (Math.abs(part.q) * p.B);
              const ph = Math.cos((2 * Math.PI * t) / T) >= 0 ? 1 : -1;
              Ex = Math.sign(part.q) * ph * p.U / g.g;
            }
          }
        } else if (pre === 'spectro') {
          const g = GEO.spectro;
          if (y < g.film) B = Bz;
          if (y <= g.s1 && y >= g.s2 && Math.abs(x - p.x) < 0.3) Ey = -Math.sign(part.q) * p.U / (g.s1 - g.s2); // 加速电场
        }
        return { Ex, Ey, Bz: B };
      }

      // ---------- 粒子 ----------
      let parts = [], simT = 0, marks = [];
      function makeParticles() {
        const p = P();
        const q = p.q, m = p.m;
        const a = (p.ang * Math.PI) / 180;
        const base = { q, m, x: p.x, y: p.y, vx: p.v0 * Math.cos(a), vy: p.v0 * Math.sin(a), alive: true, trail: [[p.x, p.y]], col: q > 0 ? RED : BLUE, turns: 0, acc: 0, inGap: false, done: null };
        parts = [base];
        if (S.preset === 'cyclotron') { base.x = -GEO.cyclotron.g / 2 * Math.sign(q) * 0.98; base.trail = [[base.x, base.y]]; base.vx = 0; base.vy = 0; }
        if (S.preset === 'spectro') {
          // 正离子向右偏、负离子向左偏：入射狭缝放在相应一侧，保证落点在画面内
          p.x = q > 0 ? -1.6 : 1.6; base.x = p.x; base.trail = [[p.x, p.y]];
          base.vx = 0; base.vy = -0.02; base.label = 'm₁';
          const b2 = Object.assign({}, base, { m: p.m2, trail: [[p.x, p.y]], col: GOLD, label: 'm₂' });
          parts.push(b2);
        }
        simT = 0; marks = [];
      }
      function reset() { makeParticles(); updateReadouts(); }

      function step(dt) {
        const n = Math.max(1, Math.ceil(dt / 0.004));
        const h = dt / n;
        for (let s = 0; s < n; s++) {
          simT += h;
          for (const pt of parts) {
            if (!pt.alive) continue;
            const f = fields(pt.x, pt.y, simT, pt);
            const qm = pt.q / pt.m;
            // Boris
            let vx = pt.vx + qm * f.Ex * h / 2, vy = pt.vy + qm * f.Ey * h / 2;
            const tt = qm * f.Bz * h / 2, ss = 2 * tt / (1 + tt * tt);
            const v1x = vx + vy * tt, v1y = vy - vx * tt;
            vx += v1y * ss; vy -= v1x * ss;
            vx += qm * f.Ex * h / 2; vy += qm * f.Ey * h / 2;
            const ox = pt.x, oy = pt.y;
            pt.vx = vx; pt.vy = vy;
            pt.x += vx * h; pt.y += vy * h;
            collide(pt, ox, oy);
            const last = pt.trail[pt.trail.length - 1];
            if (Math.hypot(last[0] - pt.x, last[1] - pt.y) > 0.015) { pt.trail.push([pt.x, pt.y]); if (pt.trail.length > 6000) pt.trail.shift(); }
          }
        }
      }
      function collide(pt, ox, oy) {
        const pre = S.preset;
        const out = Math.abs(pt.x) > W / 2 / PX + 0.3 || Math.abs(pt.y) > H / 2 / PX + 0.3;
        if (out) { pt.alive = false; pt.done = pt.done || '离开视野'; return; }
        if (pre === 'selector') {
          const g = GEO.selector;
          if (pt.x >= g.x0 && pt.x <= g.x1 && (pt.y >= g.yt || pt.y <= g.yb)) { pt.alive = false; pt.done = '打在极板上'; pt.y = GW.clamp(pt.y, g.yb, g.yt); }
          if (ox < g.x1 + 0.6 && pt.x >= g.x1 + 0.6) { // 出口狭缝
            if (Math.abs(pt.y) > 0.12) { pt.alive = false; pt.done = '被出口挡板挡住'; } else pt.done = '从狭缝通过';
          }
        } else if (pre === 'deflect') {
          const g = GEO.deflect;
          if (pt.x >= g.x0 && pt.x <= g.x1 && (pt.y >= g.yt || pt.y <= g.yb)) { pt.alive = false; pt.done = '打在极板上'; pt.y = GW.clamp(pt.y, g.yb, g.yt); }
          if (ox < g.screen && pt.x >= g.screen) { pt.alive = false; pt.x = g.screen; marks.push({ x: g.screen, y: pt.y, col: pt.col }); pt.done = '打在荧光屏上'; }
        } else if (pre === 'spectro') {
          const g = GEO.spectro;
          if (oy < g.film && pt.y >= g.film && pt.vy > 0) { pt.alive = false; pt.y = g.film; marks.push({ x: pt.x, y: g.film, col: pt.col, label: pt.label, d: Math.abs(pt.x - P().x) }); pt.done = '打在底片上'; }
        } else if (pre === 'cyclotron') {
          const g = GEO.cyclotron;
          const inGap = Math.abs(pt.x) < g.g / 2 && Math.hypot(pt.x, pt.y) <= g.R;
          if (pt.inGap && !inGap) pt.acc++;
          pt.inGap = inGap;
          if (!pt.left && Math.hypot(pt.x, pt.y) > g.R) { pt.left = true; pt.done = '离开 D 形盒'; }
        }
      }

      // ---------- 绘制 ----------
      function drawBRegion(x0, y0, x1, y1, Bz, clipCircle) {
        const X0 = sx(x0), X1 = sx(x1), Y0 = sy(y1), Y1 = sy(y0);
        c.save();
        if (clipCircle) { c.beginPath(); c.arc(sx(0), sy(0), clipCircle * PX, 0, Math.PI * 2); c.clip(); }
        c.fillStyle = 'rgba(15,157,138,0.06)';
        c.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
        if (Bz !== 0) {
          c.strokeStyle = GRAY; c.fillStyle = GRAY; c.lineWidth = 2;
          const sp = 50;
          const ox = W / 2 % sp + sp / 2, oy = H / 2 % sp + sp / 2;
          for (let X = ox - sp; X < W + sp; X += sp) for (let Y = oy - sp; Y < H + sp; Y += sp) {
            if (X < X0 + 6 || X > X1 - 6 || Y < Y0 + 6 || Y > Y1 - 6) continue;
            if (Bz < 0) { c.beginPath(); c.moveTo(X - 5, Y - 5); c.lineTo(X + 5, Y + 5); c.moveTo(X + 5, Y - 5); c.lineTo(X - 5, Y + 5); c.stroke(); }
            else { c.beginPath(); c.arc(X, Y, 3.2, 0, Math.PI * 2); c.fill(); }
          }
        }
        c.restore();
      }
      function drawRectBorder(x0, y0, x1, y1) {
        c.save(); c.strokeStyle = CYAN; c.lineWidth = 2; c.setLineDash([8, 5]);
        c.strokeRect(sx(x0), sy(y1), (x1 - x0) * PX, (y1 - y0) * PX); c.restore();
      }
      function drawPlates(x0, x1, yt, yb, E, Edir, q) {
        // 极板与电场线
        const up = Math.sin((Edir * Math.PI) / 180) > 0; // 场强向上则下板为正
        const topPos = !up;
        c.save();
        if (E > 0) {
          c.globalAlpha = 0.45;
          // 电场线放在 × 标记的间隙中（× 位于 W/2+25 (mod 50)，此处取 W/2 (mod 50)）
          for (let X = sx(0) - Math.floor((sx(0) - sx(x0) - 12) / 50) * 50; X < sx(x1) - 12; X += 50) {
            if (up) GW.draw.arrow(c, X, sy(yb) - 8, X, sy(yt) + 8, { color: CYAN, width: 2, head: 9 });
            else GW.draw.arrow(c, X, sy(yt) + 8, X, sy(yb) - 8, { color: CYAN, width: 2, head: 9 });
          }
          c.globalAlpha = 1;
        }
        const plate = (y, pos) => {
          c.fillStyle = E > 0 ? (pos ? RED : BLUE) : '#9aa3b2';
          c.fillRect(sx(x0), sy(y) - 4, (x1 - x0) * PX, 8);
          if (E > 0) {
            c.font = 'bold 16px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(pos ? '+' : '−', sx(x0) - 14, sy(y));
          }
        };
        plate(yt, topPos); plate(yb, !topPos);
        c.restore();
      }
      function drawFieldLabel(text, x, y, color) {
        c.save(); c.font = '15px sans-serif'; c.fillStyle = color || INK; c.textAlign = 'left'; c.textBaseline = 'top';
        c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 4; c.lineJoin = 'round';
        c.strokeText(text, x, y); c.fillText(text, x, y); c.restore();
      }

      function drawScene() {
        const p = P(), pre = S.preset, Bz = p.B * p.Bdir;
        const Bname = p.B > 0 ? 'B = ' + p.B.toFixed(2) + ' T（' + (Bz < 0 ? '垂直纸面向里 ×' : '垂直纸面向外 ·') + '）' : 'B = 0';
        if (pre === 'circle') {
          drawBRegion(-10, -10, 10, 10, Bz);
          drawFieldLabel(Bname, 12, 10, CYAN);
        } else if (pre === 'bounded' || pre === 'custom') {
          const g = GEO[pre];
          drawBRegion(g.x0, g.y0, g.x1, g.y1, Bz);
          drawRectBorder(g.x0, g.y0, g.x1, g.y1);
          if (pre === 'custom' && p.E > 0) {
            const er = (p.Edir * Math.PI) / 180, ux = Math.cos(er), uy = -Math.sin(er);
            c.save(); c.globalAlpha = 0.4;
            for (let k = -1; k <= 1; k++) {
              const cx = sx(0) - uy * k * 100, cy = sy(0) + ux * k * 100;
              GW.draw.arrow(c, cx - ux * 170, cy - uy * 170, cx + ux * 170, cy + uy * 170, { color: CYAN, width: 2, head: 11 });
            }
            c.restore();
          }
          drawFieldLabel(Bname, sx(g.x0), sy(g.y1) - 26, CYAN);
          if (pre === 'custom') drawFieldLabel('E = ' + p.E.toFixed(2) + ' V/m（' + dirName(p.Edir) + '）', sx(g.x0), sy(g.y0) + 6, CYAN);
        } else if (pre === 'selector') {
          const g = GEO.selector;
          drawBRegion(g.x0, g.yb, g.x1, g.yt, Bz);
          drawPlates(g.x0, g.x1, g.yt, g.yb, p.E, p.Edir);
          // 入口、出口挡板
          c.fillStyle = INK;
          const slit = (x) => { c.fillRect(sx(x) - 3, sy(1.6), 6, (1.6 - 0.12) * PX); c.fillRect(sx(x) - 3, sy(-0.12), 6, (1.6 - 0.12) * PX); };
          slit(g.x1 + 0.6);
          drawFieldLabel(Bname + '，E = ' + p.E.toFixed(2) + ' V/m', sx(g.x0), sy(g.yt) - 34, CYAN);
        } else if (pre === 'deflect') {
          const g = GEO.deflect;
          drawPlates(g.x0, g.x1, g.yt, g.yb, p.E, p.Edir);
          c.fillStyle = '#c5ccd6'; c.fillRect(sx(g.screen), sy(2.6), 8, 5.2 * PX);
          drawFieldLabel('荧光屏', sx(g.screen) - 20, sy(2.6) - 24);
          drawFieldLabel('E = ' + p.E.toFixed(2) + ' V/m，板长 L = ' + (g.x1 - g.x0).toFixed(1) + ' m', sx(g.x0), sy(g.yt) - 34, CYAN);
          // 中线
          c.save(); c.strokeStyle = 'rgba(27,36,51,0.25)'; c.setLineDash([5, 6]); c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(sx(-3.7), sy(0)); c.lineTo(sx(g.screen), sy(0)); c.stroke(); c.restore();
          for (const mk of marks) { c.fillStyle = mk.col; c.beginPath(); c.arc(sx(mk.x) + 4, sy(mk.y), 6, 0, Math.PI * 2); c.fill(); }
        } else if (pre === 'cyclotron') {
          const g = GEO.cyclotron;
          drawBRegion(-g.R, -g.R, g.R, g.R, Bz, g.R);
          c.save();
          c.strokeStyle = INK; c.lineWidth = 3;
          const R = g.R * PX, gx = g.g / 2 * PX;
          // 两个 D 形盒
          c.beginPath(); c.arc(sx(0) + gx, sy(0), R, -Math.PI / 2, Math.PI / 2); c.closePath(); c.stroke();
          c.beginPath(); c.arc(sx(0) - gx, sy(0), R, Math.PI / 2, Math.PI * 1.5); c.closePath(); c.stroke();
          // 间隙中的交变电场
          const pt = parts[0];
          const T = 2 * Math.PI * pt.m / (Math.abs(pt.q) * p.B);
          const ph = Math.cos((2 * Math.PI * simT) / T) >= 0 ? 1 : -1;
          const dirR = Math.sign(pt.q) * ph > 0;
          c.globalAlpha = 0.85;
          for (let yy = -2.2; yy <= 2.21; yy += 0.55) {
            const Y = sy(yy);
            if (dirR) GW.draw.arrow(c, sx(0) - gx + 1, Y, sx(0) + gx - 1, Y, { color: CYAN, width: 2, head: 7 });
            else GW.draw.arrow(c, sx(0) + gx - 1, Y, sx(0) - gx + 1, Y, { color: CYAN, width: 2, head: 7 });
          }
          c.restore();
          drawFieldLabel('D₁', sx(-1.3), sy(2.0), INK); drawFieldLabel('D₂', sx(1.1), sy(2.0), INK);
          drawFieldLabel(Bname, 12, 10, CYAN);
          drawFieldLabel('交变电压 U = ' + p.U.toFixed(2) + ' V，周期 = 回旋周期', 12, 32, CYAN);
          // 交流电源符号，导线接到两个 D 形盒
          c.save();
          const cx0 = sx(0), cy0 = Math.max(24, sy(0) - R - 26), off = gx + 26;
          const yD = sy(0) - Math.sqrt(Math.max(0, R * R - (off - gx) * (off - gx)));
          c.strokeStyle = INK; c.lineWidth = 2;
          c.beginPath(); c.moveTo(cx0 - 14, cy0); c.lineTo(cx0 - off, cy0); c.lineTo(cx0 - off, yD);
          c.moveTo(cx0 + 14, cy0); c.lineTo(cx0 + off, cy0); c.lineTo(cx0 + off, yD); c.stroke();
          c.fillStyle = '#fff'; c.beginPath(); c.arc(cx0, cy0, 14, 0, Math.PI * 2); c.fill(); c.stroke();
          c.beginPath();
          for (let k = 0; k <= 20; k++) { const xx = cx0 - 8 + k * 0.8, yy = cy0 - 5 * Math.sin((k / 20) * Math.PI * 2); k ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
          c.stroke();
          c.restore();
        } else if (pre === 'spectro') {
          const g = GEO.spectro;
          drawBRegion(-10, -10, 10, g.film, Bz);
          // 底片
          c.fillStyle = '#5b6576';
          c.fillRect(sx(-3.75), sy(g.film) - 3, (p.x - 0.12 + 3.75) * PX, 6);
          c.fillRect(sx(p.x + 0.12), sy(g.film) - 3, (3.75 - p.x - 0.12) * PX, 6);
          drawFieldLabel('照相底片', sx(2.4), sy(g.film) - 26);
          // 加速电场：两块带狭缝的极板 S₁、S₂
          const pos1 = parts[0] && parts[0].q > 0; // 正离子：S₁ 板为正
          c.fillStyle = pos1 ? RED : BLUE;
          c.fillRect(sx(p.x - 0.7), sy(g.s1) - 3, 0.6 * PX, 6); c.fillRect(sx(p.x + 0.1), sy(g.s1) - 3, 0.6 * PX, 6);
          c.fillStyle = pos1 ? BLUE : RED;
          c.fillRect(sx(p.x - 0.7), sy(g.s2) - 3, 0.6 * PX, 6); c.fillRect(sx(p.x + 0.1), sy(g.s2) - 3, 0.6 * PX, 6);
          drawFieldLabel('S₁', sx(p.x + 0.75), sy(g.s1) - 10); drawFieldLabel('S₂', sx(p.x + 0.75), sy(g.s2) - 10);
          drawFieldLabel('加速电压 U = ' + p.U.toFixed(2) + ' V', sx(p.x + 1.1), sy(g.s1) + 10, CYAN);
          drawFieldLabel(Bname, 12, H - 28, CYAN);
          for (const mk of marks) {
            c.fillStyle = mk.col; c.beginPath(); c.arc(sx(mk.x), sy(mk.y), 7, 0, Math.PI * 2); c.fill();
            drawFieldLabel(mk.label + '：2r = ' + mk.d.toFixed(2) + ' m', sx(mk.x) - 40, sy(mk.y) - 50 - (mk.label === 'm₂' ? 0 : 22), mk.col === GOLD ? '#b9771a' : mk.col);
          }
        }
      }
      function dirName(d) { return { 0: '水平向右', 90: '竖直向上', 180: '水平向左', 270: '竖直向下' }[d] || d + '°'; }

      function drawParticles() {
        for (const pt of parts) {
          if (pt.trail.length > 1) {
            c.save(); c.strokeStyle = pt.col; c.lineWidth = 2.5; c.lineJoin = 'round'; c.globalAlpha = 0.85;
            c.beginPath(); pt.trail.forEach((q, i) => (i ? c.lineTo(sx(q[0]), sy(q[1])) : c.moveTo(sx(q[0]), sy(q[1])))); c.stroke(); c.restore();
          }
        }
        for (const pt of parts) {
          const X = sx(pt.x), Y = sy(pt.y);
          if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
          if (S.showF && pt.alive) {
            const f = fields(pt.x, pt.y, simT, pt);
            const v = Math.hypot(pt.vx, pt.vy);
            if (v > 0.02) GW.draw.arrow(c, X, Y, X + pt.vx * VS, Y - pt.vy * VS, { color: INK, width: 2.5, head: 11 });
            if (v > 0.02) drawFieldLabel('v', X + pt.vx * VS + 6, Y - pt.vy * VS - 8, INK);
            // 洛伦兹力 F = q v×B
            const fbx = pt.q * pt.vy * f.Bz, fby = -pt.q * pt.vx * f.Bz;
            const fb = Math.hypot(fbx, fby);
            if (fb > 1e-3) {
              const L = 24 + 46 * Math.tanh(fb / 2);
              GW.draw.arrow(c, X, Y, X + fbx / fb * L, Y - fby / fb * L, { color: '#d98a12', width: 3, head: 11 });
              drawFieldLabel('F洛', X + fbx / fb * (L + 8) - 10, Y - fby / fb * (L + 8) - 8, '#c27a0e');
            }
            const fex = pt.q * f.Ex, fey = pt.q * f.Ey, fe = Math.hypot(fex, fey);
            if (fe > 1e-3) {
              const L = 24 + 46 * Math.tanh(fe / 2);
              GW.draw.arrow(c, X, Y, X + fex / fe * L, Y - fey / fe * L, { color: CYAN, width: 3, head: 11 });
              drawFieldLabel('F电', X + fex / fe * (L + 8) - 10, Y - fey / fe * (L + 8) - 8, CYAN);
            }
          }
          c.fillStyle = pt.col === GOLD ? GOLD : pt.q > 0 ? RED : BLUE;
          c.beginPath(); c.arc(X, Y, 9, 0, Math.PI * 2); c.fill();
          c.strokeStyle = '#fff'; c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(X - 4.5, Y); c.lineTo(X + 4.5, Y); if (pt.q > 0) { c.moveTo(X, Y - 4.5); c.lineTo(X, Y + 4.5); } c.stroke();
        }
      }

      // 起点与速度箭头（未运动或时间为 0 时可拖动）
      const canAim = () => ['circle', 'bounded', 'custom'].includes(S.preset);
      function drawHandles() {
        if (!canAim()) return;
        const p = P(), a = (p.ang * Math.PI) / 180;
        const X = sx(p.x), Y = sy(p.y);
        const TX = X + Math.cos(a) * p.v0 * VS, TY = Y - Math.sin(a) * p.v0 * VS;
        c.save();
        c.globalAlpha = simT > 0 ? 0.35 : 1;
        GW.draw.arrow(c, X, Y, TX, TY, { color: INK, width: 2, head: 10, dash: [5, 4] });
        c.strokeStyle = CYAN; c.lineWidth = 2; c.fillStyle = 'rgba(15,157,138,0.15)';
        c.beginPath(); c.arc(TX, TY, 11, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.arc(X, Y, 14, 0, Math.PI * 2); c.stroke();
        c.restore();
        if (simT === 0) drawFieldLabel('拖动粒子改位置，拖动箭头端点改 v₀', 12, H - 30, '#5b6576');
      }
      function drawPredict() {
        // 匀强磁场中预测圆（虚线）与圆心
        if (S.preset !== 'circle') return;
        const pt = parts[0], p = P();
        if (!pt || p.B <= 0) return;
        const v = Math.hypot(pt.vx, pt.vy); if (v < 1e-3) return;
        const Bz = p.B * p.Bdir, r = pt.m * v / (Math.abs(pt.q) * p.B);
        // 圆心沿力的方向：F ∝ q v×B
        const fx = pt.q * pt.vy * Bz, fy = -pt.q * pt.vx * Bz, fm = Math.hypot(fx, fy);
        const cx = pt.x + fx / fm * r, cy = pt.y + fy / fm * r;
        c.save(); c.strokeStyle = 'rgba(27,36,51,0.3)'; c.setLineDash([6, 6]); c.lineWidth = 2;
        c.beginPath(); c.arc(sx(cx), sy(cy), r * PX, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(sx(cx), sy(cy)); c.lineTo(sx(pt.x), sy(pt.y)); c.stroke();
        c.setLineDash([]); c.fillStyle = INK; c.beginPath(); c.arc(sx(cx), sy(cy), 4, 0, Math.PI * 2); c.fill();
        drawFieldLabel('O', sx(cx) + 6, sy(cy) + 2, INK);
        drawFieldLabel('r', (sx(cx) + sx(pt.x)) / 2 + 6, (sy(cy) + sy(pt.y)) / 2, INK);
        c.restore();
      }

      // ---------- 交互 ----------
      kit.drag((pt) => {
        if (!canAim()) return null;
        const p = P(), a = (p.ang * Math.PI) / 180;
        const X = sx(p.x), Y = sy(p.y);
        const TX = X + Math.cos(a) * p.v0 * VS, TY = Y - Math.sin(a) * p.v0 * VS;
        if (Math.hypot(pt.x - TX, pt.y - TY) < 18) return 'tip';
        if (Math.hypot(pt.x - X, pt.y - Y) < 20) return 'pos';
        return null;
      }, (t, pt) => {
        const p = P();
        if (t === 'pos') { p.x = GW.clamp(wx(pt.x), -3.6, 3.6); p.y = GW.clamp(wy(pt.y), -2.95, 2.95); }
        else {
          const dx = (pt.x - sx(p.x)) / VS, dy = -(pt.y - sy(p.y)) / VS;
          p.v0 = GW.clamp(Math.round(Math.hypot(dx, dy) * 20) / 20, 0.3, 4);
          let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
          ang = Math.round(ang / 5) * 5; if (ang < 0) ang += 360;
          p.ang = ang;
          sV.set(p.v0); sAng.set(p.ang);
        }
        reset(); transport.setRunning(false);
      }, () => { save(); transport.setRunning(true); });

      // ---------- 面板 ----------
      const presetSel = GW.ui.select({ label: '情景', value: S.preset, options: Object.keys(PRESETS).map((k) => ({ value: k, label: PRESETS[k].label })), onChange(v) { S.preset = v; syncPanel(); reset(); transport.setRunning(true); save(); } });
      const transport = GW.simKit.transport(kit, () => { reset(); transport.setRunning(true); });
      const sSpeed = GW.ui.slider({ label: '播放速度', min: 0.25, max: 4, step: 0.25, value: S.speed, unit: '×', onInput(v) { S.speed = v; save(); } });

      const ch = (key) => (v) => { P()[key] = v; reset(); save(); };
      const qSeg = GW.ui.segmented({ options: [{ value: 1, label: '正电荷 +q' }, { value: -1, label: '负电荷 −q' }], value: Math.sign(P().q), onChange(v) { const p = P(); p.q = Math.abs(p.q) * +v; reset(); save(); } });
      const sQ = GW.ui.slider({ label: '电荷量 |q|', min: 0.5, max: 3, step: 0.5, value: Math.abs(P().q), unit: 'C', onInput(v) { const p = P(); p.q = Math.sign(p.q) * v; reset(); save(); } });
      const sM = GW.ui.slider({ label: '质量 m', min: 0.5, max: 4, step: 0.1, value: P().m, unit: 'kg', onInput: ch('m') });
      const sM2 = GW.ui.slider({ label: '另一离子质量 m₂', min: 0.5, max: 4, step: 0.1, value: P().m2 || 1.5, unit: 'kg', onInput: ch('m2') });
      const sV = GW.ui.slider({ label: '初速度 v₀', min: 0.3, max: 4, step: 0.05, value: P().v0, unit: 'm/s', onInput: ch('v0') });
      const sAng = GW.ui.slider({ label: 'v₀ 方向（与 x 轴夹角）', min: 0, max: 355, step: 5, value: P().ang, unit: '°', onInput: ch('ang') });
      const bSeg = GW.ui.segmented({ options: [{ value: -1, label: '× 向里' }, { value: 1, label: '· 向外' }], value: P().Bdir, onChange(v) { P().Bdir = +v; reset(); save(); } });
      const sB = GW.ui.slider({ label: '磁感应强度 B', min: 0, max: 2, step: 0.05, value: P().B, unit: 'T', onInput: ch('B') });
      const sE = GW.ui.slider({ label: '电场强度 E', min: 0, max: 3, step: 0.05, value: P().E, unit: 'V/m', onInput: ch('E') });
      const eDir = GW.ui.segmented({ options: [{ value: 90, label: '↑' }, { value: 270, label: '↓' }, { value: 180, label: '←' }, { value: 0, label: '→' }], value: P().Edir, onChange(v) { P().Edir = +v; reset(); save(); } });
      const sU = GW.ui.slider({ label: '加速电压 U', min: 0.05, max: 2, step: 0.05, value: P().U || 0.25, unit: 'V', onInput: ch('U') });
      const tF = GW.ui.toggle({ label: '显示速度与受力矢量', value: S.showF, onChange(v) { S.showF = v; save(); } });
      const ro = [GW.ui.readout(''), GW.ui.readout(''), GW.ui.readout(''), GW.ui.readout(''), GW.ui.readout('')];
      const note = GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: '1.5' } });

      const gPart = GW.ui.group('粒子', qSeg.el, sQ.el, sM.el, sM2.el, sV.el, sAng.el);
      const gField = GW.ui.group('场', bSeg.el, sB.el, sE.el, eDir.el, sU.el);
      kit.panel.append(GW.ui.group('情景', presetSel.el, transport.el, sSpeed.el, tF.el), gPart, gField, GW.ui.group('读数', ...ro.map((r) => r.el), note));

      function show(ctrl, on) { ctrl.el.style.display = on ? '' : 'none'; }
      function syncPanel() {
        const p = P(), pre = S.preset;
        qSeg.set(Math.sign(p.q)); sQ.set(Math.abs(p.q)); sM.set(p.m); sV.set(p.v0); sAng.set(p.ang);
        bSeg.set(p.Bdir); sB.set(p.B); sE.set(p.E); eDir.set(p.Edir);
        if (p.U != null) sU.set(p.U); if (p.m2 != null) sM2.set(p.m2);
        show(sM2, pre === 'spectro');
        show(sV, !['cyclotron', 'spectro'].includes(pre));
        show(sAng, canAim());
        show(bSeg, pre !== 'deflect'); show(sB, pre !== 'deflect');
        show(sE, ['selector', 'deflect', 'custom'].includes(pre));
        show(eDir, pre === 'custom');
        show(sU, ['cyclotron', 'spectro'].includes(pre));
        const notes = {
          circle: '洛伦兹力 F = qvB 始终与速度垂直，只改变速度方向，粒子做匀速圆周运动。正、负电荷偏转方向相反。',
          bounded: '粒子从左侧射入矩形磁场区域，在场内做圆弧运动后射出。偏转角等于轨迹圆弧所对圆心角。',
          selector: '上板带正电，E 向下，B 向里。当 qE = qv₀B 即 v₀ = E/B 时，粒子做匀速直线运动穿过狭缝；与粒子电性、质量无关。',
          deflect: '粒子垂直电场射入，水平方向匀速，竖直方向匀加速：y = qEL²/(2mv₀²)，tanθ = qEL/(mv₀²)。',
          cyclotron: '粒子每经过一次狭缝被加速一次（ΔEk = qU），在 D 形盒内做半径逐渐增大的半圆运动；回旋周期 T = 2πm/(qB) 与速度无关。最大动能 Ekm = q²B²R²/(2m) 与 U 无关。',
          spectro: '离子经电压 U 加速：qU = mv²/2；进入磁场做半圆运动，打在底片上，r = (1/B)·√(2mU/q)。质量越大，半径越大。',
          custom: '可同时调节电场与磁场，观察合力作用下的复杂运动（如摆线）。',
        };
        note.textContent = notes[pre];
      }

      function setRO(i, label, val) { ro[i].el.firstChild.textContent = label; ro[i].set(val); ro[i].el.style.display = label ? '' : 'none'; }
      function updateReadouts() {
        const p = P(), pre = S.preset, pt = parts[0];
        const aq = Math.abs(p.q);
        for (let i = 0; i < ro.length; i++) setRO(i, '', '');
        if (!pt) return;
        const v = Math.hypot(pt.vx, pt.vy);
        if (pre === 'circle' || pre === 'bounded' || pre === 'custom') {
          setRO(0, '速率 v', v.toFixed(2) + ' m/s');
          if (p.B > 0) {
            setRO(1, '半径 r = mv/(qB)', (p.m * p.v0 / (aq * p.B)).toFixed(2) + ' m');
            setRO(2, '周期 T = 2πm/(qB)', (2 * Math.PI * p.m / (aq * p.B)).toFixed(2) + ' s');
          }
          if (pre === 'bounded') {
            const dev = Math.abs(Math.atan2(pt.vy, pt.vx) - (p.ang * Math.PI) / 180);
            const d = Math.min(dev, 2 * Math.PI - dev) * 180 / Math.PI;
            setRO(3, '偏转角', d.toFixed(1) + '°');
          }
          setRO(4, '时间 t', simT.toFixed(2) + ' s');
        } else if (pre === 'selector') {
          setRO(0, 'qE（电场力）', (aq * p.E).toFixed(2) + ' N');
          setRO(1, 'qv₀B（洛伦兹力）', (aq * p.v0 * p.B).toFixed(2) + ' N');
          setRO(2, '通过条件 v = E/B', p.B > 0 ? (p.E / p.B).toFixed(2) + ' m/s' : '—');
          setRO(3, '结果', pt.done || '运动中');
        } else if (pre === 'deflect') {
          const g = GEO.deflect, L = g.x1 - g.x0;
          const y = aq * p.E * L * L / (2 * p.m * p.v0 * p.v0);
          setRO(0, '加速度 a = qE/m', (aq * p.E / p.m).toFixed(2) + ' m/s²');
          setRO(1, '出板侧移 y = qEL²/(2mv₀²)', y < g.yt ? y.toFixed(2) + ' m' : '打板');
          setRO(2, 'tanθ = qEL/(mv₀²)', (aq * p.E * L / (p.m * p.v0 * p.v0)).toFixed(3));
          setRO(3, '结果', pt.done || '运动中');
        } else if (pre === 'cyclotron') {
          const R = GEO.cyclotron.R;
          setRO(0, '回旋周期 T = 2πm/(qB)', (2 * Math.PI * p.m / (aq * p.B)).toFixed(2) + ' s');
          setRO(1, '加速次数', pt.acc + ' 次');
          setRO(2, '动能 Ek', (0.5 * p.m * v * v).toFixed(2) + ' J');
          setRO(3, '最大动能 q²B²R²/(2m)', (aq * aq * p.B * p.B * R * R / (2 * p.m)).toFixed(2) + ' J');
          setRO(4, '当前半径 r', p.B > 0 ? (p.m * v / (aq * p.B)).toFixed(2) + ' m' : '—');
        } else if (pre === 'spectro') {
          const r1 = Math.sqrt(2 * p.m * p.U / aq) / p.B, r2 = Math.sqrt(2 * p.m2 * p.U / aq) / p.B;
          setRO(0, '进入磁场速度 v₁', Math.sqrt(2 * aq * p.U / p.m).toFixed(2) + ' m/s');
          setRO(1, 'm₁ 半径 r₁', p.B > 0 ? r1.toFixed(2) + ' m' : '—');
          setRO(2, 'm₂ 半径 r₂', p.B > 0 ? r2.toFixed(2) + ' m' : '—');
          setRO(3, '时间 t', simT.toFixed(2) + ' s');
        }
      }

      syncPanel();
      reset();
      let roT = 0;
      kit.loop((dt) => {
        if (dt > 0) step(dt * S.speed);
        roT += dt; if (roT > 0.1) { roT = 0; updateReadouts(); }
        kit.background();
        drawScene();
        drawPredict();
        drawParticles();
        drawHandles();
        // 结束提示
        const pt = parts[0];
        if (pt && pt.done && (S.preset === 'selector' || S.preset === 'deflect' || S.preset === 'bounded')) {
          drawFieldLabel(pt.done, W - 170, H - 30, pt.done.includes('通过') || pt.done.includes('荧光') ? CYAN : RED);
        }
      });

      // _advance：测试/调试用，直接推进仿真时间
      return { destroy() { kit.destroy(); }, _advance(t) { for (let k = 0; k < t / 0.05; k++) step(0.05); updateReadouts(); } };
    },
  });
})();
