/* 数理无限画布 · 高中数学 · 平面向量
 * 加法（三角形 / 平行四边形法则）、减法、数乘、数量积与投影、基底分解
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#5b6576';
  const PURPLE = '#8e44ad';
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const TAU = Math.PI * 2;

  const dec = (v, d = 2) => { if (!isFinite(v)) return '—'; let s = (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d).replace(/\.?0+$/, ''); return s.replace('-', '−'); };
  // 模长：整数平方根时给出根式
  function normStr(x, y) {
    const s2 = x * x + y * y, r = Math.sqrt(s2);
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    if (Math.abs(s2 - Math.round(s2)) < 1e-9) {
      let n = Math.round(s2), out = 1;
      for (let k = 2; k * k <= n; k++) while (n % (k * k) === 0) { n /= k * k; out *= k; }
      return (out > 1 ? out : '') + '√' + n + ' ≈ ' + dec(r);
    }
    return dec(r);
  }
  const vstr = (x, y) => '(' + dec(x) + ', ' + dec(y) + ')';

  GW.registerSim({
    id: 'math-vector', name: '平面向量', category: 'math', group: '向量',
    desc: '向量的加减、数乘、数量积与投影、平面向量基本定理',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20L10 6M4 20l15-5M10 6l9 9" /><path d="M7.5 7.8L10 6l.9 2.9M16 17.6l3-2.6-3.5-1"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const st = ctx.state;
      if (!['add', 'sub', 'scale', 'dot', 'basis'].includes(st.mode)) st.mode = 'add';
      st.a = st.a || { sx: -3, sy: -2, x: 4, y: 1 };
      st.b = st.b || { sx: -3, sy: -2, x: 1, y: 3 };
      st.basis = st.basis || { ox: -2, oy: -2, e1: [2, 0], e2: [1, 2], c: [5, 4] };
      if (st.rule !== 'para') st.rule = 'tri';
      if (st.lambda == null) st.lambda = 2;
      if (st.snap == null) st.snap = true;

      const kit = GW.simKit.layout(ctx.root, { panelWidth: 270 });
      const c2 = kit.ctx2d;
      let W = 0, H = 0, dirty = true;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      let saveT = 0;
      const save = (later) => { clearTimeout(saveT); if (later) saveT = setTimeout(() => ctx.save(), 400); else ctx.save(); };

      let U = 50, ox = 0, oy = 0;
      const X = (x) => ox + x * U, Y = (y) => oy - y * U;
      const fx = (px) => (px - ox) / U, fy = (py) => (oy - py) / U;
      function fit() { U = Math.max(22, Math.min(W / 18, H / 13)); ox = Math.round(W * 0.56); oy = Math.round(H * 0.6); }
      const snapV = (v) => (st.snap ? Math.round(v) : Math.round(v * 10) / 10);

      // ---------- 绘制助手 ----------
      function line(x1, y1, x2, y2, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; c2.lineCap = 'round'; if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke(); c2.restore();
      }
      function vec(x1, y1, x2, y2, color, opts = {}) {
        GW.draw.arrow(c2, X(x1), Y(y1), X(x2), Y(y2), { color, width: opts.w || 3.4, head: opts.head || 15, dash: opts.dash || null });
      }
      // 带箭头的向量名（字母上加 →）。parts: [{t, v:bool}]
      function vlabel(parts, x, y, color, size = 21, align = 'center') {
        c2.save(); c2.font = 'italic bold ' + size + 'px ' + MATH; c2.textBaseline = 'alphabetic'; c2.textAlign = 'left';
        const ws = parts.map((p) => { c2.font = (p.v ? 'italic bold ' : p.i ? 'italic ' : '') + size + 'px ' + (p.v || p.i ? MATH : FONT); return c2.measureText(p.t).width; });
        const tot = ws.reduce((s, w) => s + w, 0);
        let cx = align === 'center' ? x - tot / 2 : align === 'right' ? x - tot : x;
        const by = y + size * 0.35;
        // 底色
        c2.fillStyle = 'rgba(255,255,255,0.85)'; c2.fillRect(cx - 4, by - size * 1.15, tot + 8, size * 1.35);
        parts.forEach((p, i) => {
          c2.font = (p.v ? 'italic bold ' : p.i ? 'italic ' : '') + size + 'px ' + (p.v || p.i ? MATH : FONT);
          c2.fillStyle = color; c2.fillText(p.t, cx, by);
          if (p.v) {
            const ay = by - size * 0.86, w = ws[i];
            c2.strokeStyle = color; c2.lineWidth = 1.6;
            c2.beginPath(); c2.moveTo(cx + 1, ay); c2.lineTo(cx + w + 1, ay); c2.stroke();
            c2.beginPath(); c2.moveTo(cx + w - 3, ay - 3); c2.lineTo(cx + w + 1, ay); c2.lineTo(cx + w - 3, ay + 3); c2.stroke();
          }
          cx += ws[i];
        });
        c2.restore();
      }
      const V = (t) => ({ t, v: true }), T = (t) => ({ t }), I = (t) => ({ t, i: true });
      function labelAt(parts, x1, y1, x2, y2, color, side = 1, fr = 0.5) {
        const mx = X(x1 + (x2 - x1) * fr), my = Y(y1 + (y2 - y1) * fr), dx = X(x2) - X(x1), dy = Y(y2) - Y(y1), L = Math.hypot(dx, dy) || 1;
        vlabel(parts, mx - dy / L * 22 * side, my + dx / L * 22 * side, color);
      }
      function handle(x, y, color, hollow) {
        c2.beginPath(); c2.arc(X(x), Y(y), 9, 0, TAU);
        c2.fillStyle = hollow ? '#fff' : color; c2.fill(); c2.lineWidth = 3; c2.strokeStyle = hollow ? color : '#fff'; c2.stroke();
        c2.beginPath(); c2.arc(X(x), Y(y), 16, 0, TAU); c2.fillStyle = 'rgba(0,0,0,0.04)'; c2.fill();
      }
      function txt(t, x, y, color, font, al) {
        c2.save(); c2.font = font || '16px ' + FONT; c2.textAlign = al || 'left'; c2.textBaseline = 'middle';
        c2.lineWidth = 4; c2.strokeStyle = 'rgba(255,255,255,0.9)'; c2.strokeText(t, x, y); c2.fillStyle = color || INK; c2.fillText(t, x, y); c2.restore();
      }

      function drawGrid() {
        c2.lineWidth = 1;
        c2.strokeStyle = 'rgba(27,36,51,0.08)'; c2.beginPath();
        for (let v = Math.ceil(fx(0)); v <= fx(W); v++) { const x = Math.round(X(v)) + 0.5; c2.moveTo(x, 0); c2.lineTo(x, H); }
        for (let v = Math.ceil(fy(H)); v <= fy(0); v++) { const y = Math.round(Y(v)) + 0.5; c2.moveTo(0, y); c2.lineTo(W, y); }
        c2.stroke();
        GW.draw.arrow(c2, 0, oy, W - 3, oy, { color: INK, width: 2, head: 12 });
        GW.draw.arrow(c2, ox, H, ox, 3, { color: INK, width: 2, head: 12 });
        c2.font = '14px ' + MATH; c2.fillStyle = GRAY; c2.textAlign = 'center'; c2.textBaseline = 'top';
        const stp = U < 34 ? 2 : 1;
        for (let v = Math.ceil(fx(0) / stp) * stp; v <= fx(W - 24); v += stp) if (v) c2.fillText(String(v).replace('-', '−'), X(v), oy + 4);
        c2.textAlign = 'right'; c2.textBaseline = 'middle';
        for (let v = Math.ceil(fy(H) / stp) * stp; v <= fy(24); v += stp) if (v) c2.fillText(String(v).replace('-', '−'), ox - 5, Y(v));
        txt('x', W - 10, oy + 16, INK, 'italic 18px ' + MATH, 'right');
        txt('y', ox + 12, 12, INK, 'italic 18px ' + MATH);
        txt('O', ox - 6, oy + 14, INK, 'italic 17px ' + MATH, 'right');
      }

      // ---------- 各模式 ----------
      const A = () => st.a, B = () => st.b;
      function drawAB(showB = true) {
        const a = A(), b = B();
        vec(a.sx, a.sy, a.sx + a.x, a.sy + a.y, RED);
        labelAt([V('a')], a.sx, a.sy, a.sx + a.x, a.sy + a.y, RED, 1);
        if (showB) { vec(b.sx, b.sy, b.sx + b.x, b.sy + b.y, BLUE); labelAt([V('b')], b.sx, b.sy, b.sx + b.x, b.sy + b.y, BLUE, -1); }
      }
      function handlesAB(showB = true) {
        const a = A(), b = B();
        handle(a.sx, a.sy, RED, true); handle(a.sx + a.x, a.sy + a.y, RED);
        if (showB) { handle(b.sx, b.sy, BLUE, true); handle(b.sx + b.x, b.sy + b.y, BLUE); }
      }
      function info(lines) {
        c2.save(); c2.font = '17px ' + FONT;
        const h = lines.length * 26 + 12;
        let w = 0; lines.forEach((l) => { w = Math.max(w, measureParts(l)); });
        c2.fillStyle = 'rgba(255,255,255,0.94)'; c2.strokeStyle = '#e3e7ee'; c2.lineWidth = 1;
        c2.beginPath(); c2.rect(12, 12, w + 26, h); c2.fill(); c2.stroke();
        c2.restore();
        lines.forEach((l, i) => drawParts(l, 25, 12 + 19 + i * 26));
      }
      function measureParts(l) {
        let w = 0; l.forEach((p) => { c2.font = (p.v ? 'italic bold ' : p.i ? 'italic ' : '') + '17px ' + (p.v || p.i ? MATH : FONT); w += c2.measureText(p.t).width; }); return w;
      }
      function drawParts(l, x, y) {
        // 复用 vlabel 的逐段绘制（左对齐，单色可分段着色）
        let cx = x;
        l.forEach((p) => {
          c2.font = (p.v ? 'italic bold ' : p.i ? 'italic ' : '') + '17px ' + (p.v || p.i ? MATH : FONT);
          const w = c2.measureText(p.t).width;
          c2.fillStyle = p.c || INK; c2.textBaseline = 'middle'; c2.textAlign = 'left'; c2.fillText(p.t, cx, y);
          if (p.v) {
            const ay = y - 12; c2.strokeStyle = p.c || INK; c2.lineWidth = 1.5;
            c2.beginPath(); c2.moveTo(cx + 1, ay); c2.lineTo(cx + w + 1, ay); c2.lineTo(cx + w - 3, ay - 3); c2.moveTo(cx + w + 1, ay); c2.lineTo(cx + w - 3, ay + 3); c2.stroke();
          }
          cx += w;
        });
      }
      const Vc = (t, c) => ({ t, v: true, c }), Tc = (t, c) => ({ t, c });

      function drawAdd() {
        const a = A(), b = B();
        const P0 = [a.sx, a.sy], P1 = [a.sx + a.x, a.sy + a.y], S = [P0[0] + a.x + b.x, P0[1] + a.y + b.y];
        if (st.rule === 'tri') {
          // 把 b 平移到 a 的终点
          vec(P1[0], P1[1], S[0], S[1], 'rgba(51,102,255,0.6)', { dash: [8, 6], w: 3 });
          labelAt([V('b')], P1[0], P1[1], S[0], S[1], 'rgba(51,102,255,0.9)', -1);
        } else {
          const Q = [P0[0] + b.x, P0[1] + b.y];
          vec(P0[0], P0[1], Q[0], Q[1], 'rgba(51,102,255,0.6)', { dash: [8, 6], w: 3 });
          line(X(P1[0]), Y(P1[1]), X(S[0]), Y(S[1]), GRAY, 1.8, [6, 6]);
          line(X(Q[0]), Y(Q[1]), X(S[0]), Y(S[1]), GRAY, 1.8, [6, 6]);
          c2.save(); c2.beginPath(); c2.moveTo(X(P0[0]), Y(P0[1])); c2.lineTo(X(P1[0]), Y(P1[1])); c2.lineTo(X(S[0]), Y(S[1])); c2.lineTo(X(Q[0]), Y(Q[1])); c2.closePath();
          c2.fillStyle = 'rgba(15,157,138,0.07)'; c2.fill(); c2.restore();
        }
        vec(P0[0], P0[1], S[0], S[1], CYAN, { w: 4 });
        labelAt([V('a'), T(' + '), V('b')], P0[0], P0[1], S[0], S[1], CYAN, st.rule === 'tri' ? -1 : 1);
        drawAB(); handlesAB();
        const sx = a.x + b.x, sy = a.y + b.y;
        info([
          [Vc('a', RED), Tc(' = ' + vstr(a.x, a.y), RED), Tc('，|', GRAY), Vc('a', GRAY), Tc('| = ' + normStr(a.x, a.y), GRAY)],
          [Vc('b', BLUE), Tc(' = ' + vstr(b.x, b.y), BLUE), Tc('，|', GRAY), Vc('b', GRAY), Tc('| = ' + normStr(b.x, b.y), GRAY)],
          [Vc('a', CYAN), Tc(' + ', CYAN), Vc('b', CYAN), Tc(' = (' + dec(a.x) + ' + ' + dec(b.x) + ', ' + dec(a.y) + ' + ' + dec(b.y) + ') = ' + vstr(sx, sy), CYAN)],
          [Tc('|', GRAY), Vc('a', GRAY), Tc(' + ', GRAY), Vc('b', GRAY), Tc('| = ' + normStr(sx, sy), GRAY), Tc(st.rule === 'tri' ? '   三角形法则：首尾相接' : '   平行四边形法则：共起点', GRAY)],
        ]);
      }
      function drawSub() {
        const a = A(), b = B();
        const P0 = [a.sx, a.sy], Pa = [a.sx + a.x, a.sy + a.y], Pb = [a.sx + b.x, a.sy + b.y];
        vec(P0[0], P0[1], Pb[0], Pb[1], 'rgba(51,102,255,0.6)', { dash: [8, 6], w: 3 });
        labelAt([V('b')], P0[0], P0[1], Pb[0], Pb[1], 'rgba(51,102,255,0.9)', -1);
        vec(Pb[0], Pb[1], Pa[0], Pa[1], PURPLE, { w: 4 });
        labelAt([V('a'), T(' − '), V('b')], Pb[0], Pb[1], Pa[0], Pa[1], PURPLE, 1);
        drawAB(); handlesAB();
        const dx = a.x - b.x, dy = a.y - b.y;
        info([
          [Vc('a', RED), Tc(' = ' + vstr(a.x, a.y), RED), Tc('，', GRAY), Vc('b', BLUE), Tc(' = ' + vstr(b.x, b.y), BLUE)],
          [Vc('a', PURPLE), Tc(' − ', PURPLE), Vc('b', PURPLE), Tc(' = (' + dec(a.x) + ' − ' + dec(b.x) + ', ' + dec(a.y) + ' − ' + dec(b.y) + ') = ' + vstr(dx, dy), PURPLE)],
          [Tc('|', GRAY), Vc('a', GRAY), Tc(' − ', GRAY), Vc('b', GRAY), Tc('| = ' + normStr(dx, dy), GRAY)],
          [Tc('共起点时，', GRAY), Vc('a', GRAY), Tc(' − ', GRAY), Vc('b', GRAY), Tc(' 由 ', GRAY), Vc('b', GRAY), Tc(' 的终点指向 ', GRAY), Vc('a', GRAY), Tc(' 的终点', GRAY)],
        ]);
      }
      function drawScale() {
        const a = A(), l = st.lambda;
        const P0 = [a.sx, a.sy], Q = [a.sx + l * a.x, a.sy + l * a.y];
        // 所在直线
        const L = Math.hypot(a.x, a.y);
        if (L > 1e-9) {
          const ux = a.x / L, uy = a.y / L, far = 40;
          line(X(P0[0] - ux * far), Y(P0[1] - uy * far), X(P0[0] + ux * far), Y(P0[1] + uy * far), 'rgba(27,36,51,0.18)', 1.5, [4, 6]);
          // 数乘向量偏移一点画，避免与 a 重合
          const off = 0.18, nx = -uy * off, ny = ux * off;
          if (Math.abs(l) > 1e-9) {
            vec(P0[0] + nx, P0[1] + ny, Q[0] + nx, Q[1] + ny, GOLD, { w: 4.5 });
            labelAt([I(dec(l) === '−1' ? '−' : dec(l) === '1' ? '' : dec(l)), V('a')], P0[0] + nx, P0[1] + ny, Q[0] + nx, Q[1] + ny, '#b9741a', 1.6);
          }
        }
        drawAB(false); handlesAB(false);
        info([
          [Vc('a', RED), Tc(' = ' + vstr(a.x, a.y) + '，|', RED), Vc('a', RED), Tc('| = ' + normStr(a.x, a.y), RED)],
          [Tc('λ', '#b9741a'), Vc('a', '#b9741a'), Tc(' = ' + dec(l) + ' × ' + vstr(a.x, a.y) + ' = ' + vstr(l * a.x, l * a.y), '#b9741a')],
          [Tc('|λ', GRAY), Vc('a', GRAY), Tc('| = |λ|·|', GRAY), Vc('a', GRAY), Tc('| = ' + dec(Math.abs(l) * L), GRAY)],
          [Tc(l > 0 ? 'λ > 0：与 ' : l < 0 ? 'λ < 0：与 ' : 'λ = 0：λ', GRAY)].concat(l === 0 ? [Vc('a', GRAY), Tc(' = ', GRAY), Vc('0', GRAY)] : [Vc('a', GRAY), Tc(l > 0 ? ' 方向相同' : ' 方向相反', GRAY)]),
        ]);
      }
      function drawDot() {
        const a = A(), b = B();
        const P0 = [a.sx, a.sy], Pa = [P0[0] + a.x, P0[1] + a.y], Pb = [P0[0] + b.x, P0[1] + b.y];
        const La = Math.hypot(a.x, a.y), Lb = Math.hypot(b.x, b.y), d = a.x * b.x + a.y * b.y;
        const cos = La && Lb ? d / La / Lb : NaN, th = Math.acos(Math.max(-1, Math.min(1, cos)));
        // a 所在直线
        if (La > 1e-9) {
          const ux = a.x / La, uy = a.y / La;
          line(X(P0[0] - ux * 40), Y(P0[1] - uy * 40), X(P0[0] + ux * 40), Y(P0[1] + uy * 40), 'rgba(27,36,51,0.18)', 1.5, [4, 6]);
          const pr = d / La; // b 在 a 上的投影数量 |b|cosθ
          const F = [P0[0] + ux * pr, P0[1] + uy * pr];
          line(X(Pb[0]), Y(Pb[1]), X(F[0]), Y(F[1]), GRAY, 1.8, [6, 5]);
          // 直角符号
          if (Math.abs(pr) > 1e-6 && Math.hypot(Pb[0] - F[0], Pb[1] - F[1]) > 1e-6) {
            const s = 0.28, vx = (Pb[0] - F[0]), vy = (Pb[1] - F[1]), vl = Math.hypot(vx, vy);
            const wx = -Math.sign(pr) * ux * s, wy = -Math.sign(pr) * uy * s, nx = vx / vl * s, ny = vy / vl * s;
            c2.save(); c2.strokeStyle = GRAY; c2.lineWidth = 1.5; c2.beginPath();
            c2.moveTo(X(F[0] + wx), Y(F[1] + wy)); c2.lineTo(X(F[0] + wx + nx), Y(F[1] + wy + ny)); c2.lineTo(X(F[0] + nx), Y(F[1] + ny)); c2.stroke(); c2.restore();
          }
          if (Math.abs(pr) > 1e-6) {
            // 投影向量（沿 a 方向偏移一点显示）
            const off = -0.22, nx = -uy * off, ny = ux * off;
            vec(P0[0] + nx, P0[1] + ny, F[0] + nx, F[1] + ny, GOLD, { w: 5, head: 13 });
          }
          c2.beginPath(); c2.arc(X(F[0]), Y(F[1]), 4, 0, TAU); c2.fillStyle = GRAY; c2.fill();
        }
        // b 平移到共起点
        const bShift = Math.abs(b.sx - a.sx) > 1e-9 || Math.abs(b.sy - a.sy) > 1e-9;
        if (bShift) { vec(P0[0], P0[1], Pb[0], Pb[1], 'rgba(51,102,255,0.6)', { dash: [8, 6], w: 3 }); }
        // 夹角
        if (La && Lb) {
          const a0 = Math.atan2(a.y, a.x), a1 = Math.atan2(b.y, b.x);
          let da = a1 - a0; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
          const r = Math.min(40, U * 0.8);
          c2.save(); c2.beginPath(); c2.moveTo(X(P0[0]), Y(P0[1])); c2.arc(X(P0[0]), Y(P0[1]), r, -a0, -(a0 + da), da > 0); c2.closePath();
          c2.fillStyle = 'rgba(15,157,138,0.15)'; c2.fill(); c2.strokeStyle = CYAN; c2.lineWidth = 2; c2.stroke(); c2.restore();
          const am = a0 + da / 2;
          txt('θ', X(P0[0]) + Math.cos(am) * (r + 14), Y(P0[1]) - Math.sin(am) * (r + 14), CYAN, 'italic 19px ' + MATH, 'center');
        }
        drawAB(); handlesAB();
        const deg = th * 180 / Math.PI;
        info([
          [Vc('a', RED), Tc(' = ' + vstr(a.x, a.y), RED), Tc('，', GRAY), Vc('b', BLUE), Tc(' = ' + vstr(b.x, b.y), BLUE)],
          [Vc('a', INK), Tc(' · ', INK), Vc('b', INK), Tc(' = ' + dec(a.x) + '×' + dec(b.x) + ' + ' + dec(a.y) + '×' + dec(b.y) + ' = ' + dec(d), INK)],
          [Tc('cos θ = ', CYAN), Vc('a', CYAN), Tc('·', CYAN), Vc('b', CYAN), Tc(' / (|', CYAN), Vc('a', CYAN), Tc('||', CYAN), Vc('b', CYAN), Tc('|) = ' + dec(cos, 3) + '，θ ≈ ' + dec(deg, 1) + '°', CYAN)],
          [Vc('b', '#b9741a'), Tc(' 在 ', '#b9741a'), Vc('a', '#b9741a'), Tc(' 上的投影向量 = ' + vstr(La ? d / La / La * a.x : NaN, La ? d / La / La * a.y : NaN) + '（|', '#b9741a'), Vc('b', '#b9741a'), Tc('|cos θ = ' + dec(La ? d / La : NaN) + '）', '#b9741a')],
          [Tc(Math.abs(d) < 1e-9 ? '数量积为 0：' : d > 0 ? 'θ 为锐角（或 0）' : 'θ 为钝角（或 π）', GRAY)].concat(Math.abs(d) < 1e-9 && La && Lb ? [Vc('a', GRAY), Tc(' ⊥ ', GRAY), Vc('b', GRAY)] : []),
        ]);
      }
      function basisSolve() {
        const { e1, e2, c } = st.basis;
        const det = e1[0] * e2[1] - e1[1] * e2[0];
        if (Math.abs(det) < 1e-9) return null;
        return [(c[0] * e2[1] - c[1] * e2[0]) / det, (e1[0] * c[1] - e1[1] * c[0]) / det];
      }
      function drawBasis() {
        const B0 = st.basis, o = [B0.ox, B0.oy];
        const { e1, e2, c } = B0;
        const sol = basisSolve();
        const E1 = [o[0] + e1[0], o[1] + e1[1]], E2 = [o[0] + e2[0], o[1] + e2[1]], C = [o[0] + c[0], o[1] + c[1]];
        // e1、e2 所在直线
        [[e1, RED], [e2, BLUE]].forEach(([e, col]) => {
          const L = Math.hypot(e[0], e[1]); if (L < 1e-9) return;
          line(X(o[0] - e[0] / L * 40), Y(o[1] - e[1] / L * 40), X(o[0] + e[0] / L * 40), Y(o[1] + e[1] / L * 40), col === RED ? 'rgba(228,87,46,0.25)' : 'rgba(51,102,255,0.25)', 1.5, [4, 6]);
        });
        if (sol) {
          const [x, y] = sol;
          const M = [o[0] + x * e1[0], o[1] + x * e1[1]], N = [o[0] + y * e2[0], o[1] + y * e2[1]];
          c2.save(); c2.beginPath(); c2.moveTo(X(o[0]), Y(o[1])); c2.lineTo(X(M[0]), Y(M[1])); c2.lineTo(X(C[0]), Y(C[1])); c2.lineTo(X(N[0]), Y(N[1])); c2.closePath();
          c2.fillStyle = 'rgba(15,157,138,0.07)'; c2.fill(); c2.restore();
          line(X(M[0]), Y(M[1]), X(C[0]), Y(C[1]), GRAY, 1.8, [6, 6]);
          line(X(N[0]), Y(N[1]), X(C[0]), Y(C[1]), GRAY, 1.8, [6, 6]);
          if (Math.abs(x) > 1e-9) { vec(o[0], o[1], M[0], M[1], 'rgba(228,87,46,0.55)', { w: 6, head: 16 }); labelAt([I(dec(x)), V('e₁')], o[0], o[1], M[0], M[1], RED, -1.3, 0.85); }
          if (Math.abs(y) > 1e-9) { vec(o[0], o[1], N[0], N[1], 'rgba(51,102,255,0.55)', { w: 6, head: 16 }); labelAt([I(dec(y)), V('e₂')], o[0], o[1], N[0], N[1], BLUE, 1.3, 0.85); }
        }
        vec(o[0], o[1], E1[0], E1[1], RED, { w: 3.6 }); labelAt([V('e₁')], o[0], o[1], E1[0], E1[1], RED, 1, 0.4);
        vec(o[0], o[1], E2[0], E2[1], BLUE, { w: 3.6 }); labelAt([V('e₂')], o[0], o[1], E2[0], E2[1], BLUE, -1, 0.4);
        vec(o[0], o[1], C[0], C[1], CYAN, { w: 4 }); labelAt([V('c')], o[0], o[1], C[0], C[1], CYAN, 1);
        handle(o[0], o[1], INK, true); handle(E1[0], E1[1], RED); handle(E2[0], E2[1], BLUE); handle(C[0], C[1], CYAN);
        const lines = [
          [Vc('e₁', RED), Tc(' = ' + vstr(e1[0], e1[1]), RED), Tc('，', GRAY), Vc('e₂', BLUE), Tc(' = ' + vstr(e2[0], e2[1]), BLUE), Tc('，', GRAY), Vc('c', CYAN), Tc(' = ' + vstr(c[0], c[1]), CYAN)],
        ];
        if (sol) {
          lines.push([Vc('c', INK), Tc(' = ' + dec(sol[0]), INK), Vc('e₁', RED), Tc((sol[1] < 0 ? ' − ' : ' + ') + dec(Math.abs(sol[1])), INK), Vc('e₂', BLUE)]);
          lines.push([Tc('由 ' + dec(c[0]) + ' = ' + dec(e1[0]) + 'x + ' + dec(e2[0]) + 'y，' + dec(c[1]) + ' = ' + dec(e1[1]) + 'x + ' + dec(e2[1]) + 'y 解得 x = ' + dec(sol[0]) + '，y = ' + dec(sol[1]), GRAY)]);
        } else lines.push([Vc('e₁', RED), Tc(' 与 ', INK), Vc('e₂', BLUE), Tc(' 共线，不能作为基底！', RED)]);
        info(lines);
      }

      // ---------- 拖拽 ----------
      function targets() {
        const out = [];
        if (st.mode === 'basis') {
          const b = st.basis;
          out.push({ k: 'c', x: b.ox + b.c[0], y: b.oy + b.c[1] }, { k: 'e1', x: b.ox + b.e1[0], y: b.oy + b.e1[1] }, { k: 'e2', x: b.ox + b.e2[0], y: b.oy + b.e2[1] }, { k: 'o', x: b.ox, y: b.oy });
          return out;
        }
        const a = A(), b = B();
        out.push({ k: 'aT', x: a.sx + a.x, y: a.sy + a.y });
        if (st.mode !== 'scale') out.push({ k: 'bT', x: b.sx + b.x, y: b.sy + b.y });
        out.push({ k: 'aS', x: a.sx, y: a.sy });
        if (st.mode !== 'scale') out.push({ k: 'bS', x: b.sx, y: b.sy });
        return out;
      }
      let grab = null;
      kit.drag(
        (p) => {
          let best = null;
          targets().forEach((t) => { const d = Math.hypot(X(t.x) - p.x, Y(t.y) - p.y); if (d < 22 && (!best || d < best.d)) best = { d, t }; });
          return best ? best.t.k : null;
        },
        (k, p, e, first) => {
          const x = snapV(fx(p.x)), y = snapV(fy(p.y));
          const a = A(), b = B(), bs = st.basis;
          if (first) grab = k;
          if (k === 'aT') { a.x = x - a.sx; a.y = y - a.sy; }
          else if (k === 'bT') { b.x = x - b.sx; b.y = y - b.sy; }
          else if (k === 'aS') { const linked = Math.abs(a.sx - b.sx) < 1e-9 && Math.abs(a.sy - b.sy) < 1e-9; a.sx = x; a.sy = y; if (linked) { b.sx = x; b.sy = y; } }
          else if (k === 'bS') { b.sx = x; b.sy = y; }
          else if (k === 'o') { bs.ox = x; bs.oy = y; }
          else if (k === 'e1') { bs.e1 = [x - bs.ox, y - bs.oy]; }
          else if (k === 'e2') { bs.e2 = [x - bs.ox, y - bs.oy]; }
          else if (k === 'c') { bs.c = [x - bs.ox, y - bs.oy]; }
          dirty = true;
        },
        () => { grab = null; save(); }
      );

      // ---------- 面板 ----------
      const panel = kit.panel;
      const modeSel = GW.ui.segmented({ options: [{ value: 'add', label: '加法' }, { value: 'sub', label: '减法' }, { value: 'scale', label: '数乘' }], value: st.mode, onChange: (v) => setMode(v) });
      const modeSel2 = GW.ui.segmented({ options: [{ value: 'dot', label: '数量积' }, { value: 'basis', label: '基底分解' }], value: st.mode, onChange: (v) => setMode(v) });
      panel.append(GW.ui.group('运算', modeSel.el, modeSel2.el));
      const optBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      const optGroup = GW.ui.group('选项', optBox);
      panel.append(optGroup);
      const snapT = GW.ui.toggle({ label: '吸附整点', value: st.snap, onChange: (v) => { st.snap = v; save(); } });
      const common = GW.ui.button({ label: '移到共同起点', onClick: () => { st.b.sx = st.a.sx; st.b.sy = st.a.sy; dirty = true; save(); } });
      const resetB = GW.ui.button({ label: '↺ 重置', onClick: () => {
        st.a = { sx: -3, sy: -2, x: 4, y: 1 }; st.b = { sx: -3, sy: -2, x: 1, y: 3 }; st.basis = { ox: -2, oy: -2, e1: [2, 0], e2: [1, 2], c: [5, 4] }; st.lambda = 2; build(); save();
      } });
      panel.append(GW.ui.group('操作', snapT.el, GW.h('div', { class: 'gw-row' }, common.el, resetB.el),
        GW.h('div', { style: { fontSize: '12px', color: GRAY, lineHeight: '1.6' } }, '拖动实心圆点改变向量终点；拖动空心圆点平移向量（向量不变）。')));
      function setMode(v) { st.mode = v; modeSel.set(v); modeSel2.set(v); build(); save(); }
      function build() {
        modeSel.set(st.mode); modeSel2.set(st.mode);
        optBox.innerHTML = '';
        if (st.mode === 'add') optBox.append(GW.ui.segmented({ options: [{ value: 'tri', label: '三角形法则' }, { value: 'para', label: '平行四边形法则' }], value: st.rule, onChange: (v) => { st.rule = v; dirty = true; save(); } }).el);
        else if (st.mode === 'scale') {
          const sl = GW.ui.slider({ label: 'λ', min: -3, max: 3, step: 0.1, value: st.lambda, onInput: (v) => { st.lambda = v; dirty = true; save(true); } });
          sl.el.querySelector('span').style.cssText = 'font: italic 18px ' + MATH;
          optBox.append(sl.el);
        }
        optGroup.style.display = optBox.children.length ? '' : 'none';
        common.el.style.display = st.mode === 'scale' || st.mode === 'basis' ? 'none' : '';
        dirty = true;
      }
      build();

      kit.loop(() => {
        if (!dirty || !W) return;
        dirty = false;
        fit();
        kit.background();
        drawGrid();
        ({ add: drawAdd, sub: drawSub, scale: drawScale, dot: drawDot, basis: drawBasis })[st.mode]();
        void grab;
      });
      return { destroy() { clearTimeout(saveT); kit.destroy(); } };
    },
  });
})();
