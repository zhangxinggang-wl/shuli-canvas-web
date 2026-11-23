/* 数理无限画布 · 初中数学 · 圆
 * 圆周角定理（P 在圆上动，∠APB 不变）、垂径定理（弦心距 + 半弦 + 半径的直角三角形）、切线长定理
 *
 * 【A / B 的摆放约定】（验收探针按这个摆法取的期望值，改摆法就得改探针）
 *   A 放在 0°，B 放在 arc°（arc 就是 ∠AOB 的度数，正方向从 A 逆时针转向 B）
 *   劣弧 = 角度落在 [0°, arc] 的那段，优弧 = 其余那段 [arc°, 360°]
 *   于是：P 在优弧上 → ∠APB = ½∠AOB；P 在劣弧上 → ∠APB = 180° − ½∠AOB
 *         p=270 / p=190 都在优弧（arc=100 时）→ 50°；p=10 在劣弧 → 130°
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#5b6576';
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const TAU = Math.PI * 2;
  const D2R = Math.PI / 180;
  const R = 5;              // 圆的半径固定为 5（弦心距 d、半弦 AM 都以它为单位）

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // v 为 null/'abc'/undefined 时必须落到 def —— `isFinite(+null)` 是 true（+null === 0），
  // 只写 isFinite 会把 null 当成 0，序列化重建后 0.6 就变成 0 了
  const num = (v, def, min, max) => clamp(v == null || v === '' || !isFinite(+v) ? def : +v, min, max);
  // 读数格式：四舍五入到 2 位小数，再去掉末尾的 0 和小数点（12 → `12`，20/3 → `6.67`）
  const fmt = (v) => { if (!isFinite(v)) return '—'; return String(+v.toFixed(2)).replace('-', '−'); };
  const degTxt = (v) => fmt(v) + '°';
  // 角的度数（0~180 的锐/钝角），A、B、顶点都只是普通三点，退化成 0 时返回 NaN 交给 fmt 显示 —
  function angDeg(px, py, ax, ay, bx, by) {
    const ux = ax - px, uy = ay - py, vx = bx - px, vy = by - py;
    const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
    if (!(nu > 1e-9) || !(nv > 1e-9)) return NaN;
    return Math.acos(clamp((ux * vx + uy * vy) / (nu * nv), -1, 1)) / D2R;
  }
  const wrap360 = (t) => ((t % 360) + 360) % 360;

  GW.registerSim({
    id: 'math-circle', name: '圆周角与垂径定理', category: 'math', group: '初中 · 图形与几何',
    desc: '动点演示圆周角定理、垂径定理与切线长定理',
    keywords: '圆 圆周角 圆心角 垂径定理 弦 弦心距 切线 切线长 直径所对的圆周角 九年级 初中',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><path d="M12 12 12 4M4.6 15.4 12 12l6 3"/><path d="M4.2 17.8 9 13"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      // ---------- state：逐个字段校验并给默认值（「重新开始」会把 state 置成 {}） ----------
      const st = ctx.state;
      if (!['inscribed', 'chord', 'tangent'].includes(st.mode)) st.mode = 'inscribed';
      st.arc = num(st.arc, 100, 20, 340);      // ∠AOB 的度数（B 相对 A 的逆时针转角）
      st.p = num(st.p, 270, 0, 359);           // P 的位置角
      st.d = num(st.d, 0.6, 0, 0.95);          // 弦心距与半径之比
      st.op = num(st.op, 5 / 3, 1.1, 3);       // OP 与 r 之比

      const kit = GW.simKit.layout(ctx.root, { panelWidth: 260 });
      const c2 = kit.ctx2d;
      let W = 0, H = 0, dirty = true;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      const save = () => ctx.save();

      // ---------- 屏幕布局：圆心与半径 ----------
      let CX = 0, CY = 0, S = 90;
      function geom() {
        CX = W * 0.42; CY = H * 0.5;
        // 留出切点、标签与刻度记号的位置，同时别让圆占掉整块画面（探针 ③ 要求非白像素 < 70%）
        S = Math.min(CX * 0.78, CY * 0.74);
      }
      const X = (u, v, s) => CX + u * s;          // 单位圆的数学坐标 → 画布像素
      const Y = (u, v, s) => CY - v * s;
      const pt = (ang, s) => [CX + s * Math.cos(ang * D2R), CY - s * Math.sin(ang * D2R)];

      // ---------- 绘制助手 ----------
      function line(x1, y1, x2, y2, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; c2.lineCap = 'round'; if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke(); c2.restore();
      }
      function poly(pts, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; c2.lineJoin = 'round'; if (dash) c2.setLineDash(dash);
        c2.beginPath();
        pts.forEach((q, i) => (i ? c2.lineTo(q[0], q[1]) : c2.moveTo(q[0], q[1])));
        c2.stroke(); c2.restore();
      }
      function text(t, x, y, color, font, al, bl) { c2.font = font || '15px ' + FONT; c2.fillStyle = color || INK; c2.textAlign = al || 'left'; c2.textBaseline = bl || 'middle'; c2.fillText(t, x, y); }
      // 压在网格/圆上的标签：白色描边光晕（照 phy-incline.js 的写法）
      function halo(t, x, y, color, font, al, bl) {
        c2.save(); c2.font = font || 'bold 15px ' + FONT; c2.textAlign = al || 'center'; c2.textBaseline = bl || 'middle';
        c2.lineWidth = 4; c2.strokeStyle = 'rgba(255,255,255,0.95)'; c2.lineJoin = 'round'; c2.strokeText(t, x, y);
        c2.fillStyle = color || INK; c2.fillText(t, x, y); c2.restore();
      }
      function dot(x, y, r, color) { c2.beginPath(); c2.arc(x, y, r, 0, TAU); c2.fillStyle = color; c2.fill(); c2.lineWidth = 1.5; c2.strokeStyle = '#fff'; c2.stroke(); }
      // 角弧：顶点 P，从角 a1 扫到 a2（弧度）；dir 为 +1/0/−1
      function angleArc(cx, cy, r, a1, a2, color, width, dir) {
        let d = a2 - a1;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        c2.save(); c2.strokeStyle = color; c2.lineWidth = width || 2.2; c2.beginPath();
        c2.arc(cx, cy, r, a1, a1 + d, d < 0); c2.stroke();
        if (dir) { // 箭头，标出「从 A 转到 B」的方向
          const ae = a1 + d, tip = [cx + r * Math.cos(ae), cy + r * Math.sin(ae)];
          const tg = [-Math.sin(ae) * Math.sign(d), Math.cos(ae) * Math.sign(d)];
          const nr = [Math.cos(ae), Math.sin(ae)];
          c2.beginPath(); c2.moveTo(tip[0], tip[1]);
          c2.lineTo(tip[0] - tg[0] * 8 + nr[0] * 4, tip[1] - tg[1] * 8 + nr[1] * 4);
          c2.lineTo(tip[0] - tg[0] * 8 - nr[0] * 4, tip[1] - tg[1] * 8 - nr[1] * 4);
          c2.closePath(); c2.fillStyle = color; c2.fill();
        }
        c2.restore();
      }
      // 直角符号：顶点 v，沿两条边方向各取边长 e
      function rightAngle(v, u1, u2, e, color) {
        const n1 = Math.hypot(u1[0], u1[1]) || 1, n2 = Math.hypot(u2[0], u2[1]) || 1;
        const a = [v[0] + u1[0] / n1 * e, v[1] + u1[1] / n1 * e];
        const b = [v[0] + u2[0] / n2 * e, v[1] + u2[1] / n2 * e];
        const c = [a[0] + (b[0] - v[0]), a[1] + (b[1] - v[1])];
        poly([a, c, b], color || INK, 2);
      }
      // 等长记号：在线段中点画 n 道垂直短线
      function tick(p1, p2, n, color) {
        const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
        const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy) || 1;
        const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
        c2.save(); c2.strokeStyle = color || INK; c2.lineWidth = 2;
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * 5;
          const bx = mx + ux * off, by = my + uy * off;
          c2.beginPath(); c2.moveTo(bx - nx * 6, by - ny * 6); c2.lineTo(bx + nx * 6, by + ny * 6); c2.stroke();
        }
        c2.restore();
      }

      // ---------- 读数（标签固定，探针按文字取；全部先建好，按模式显示） ----------
      const rdIn = { '∠AOB': GW.ui.readout('∠AOB'), '∠APB': GW.ui.readout('∠APB'), '关系': GW.ui.readout('关系') };
      const rdCh = { '半径 r': GW.ui.readout('半径 r'), '弦心距 d': GW.ui.readout('弦心距 d'), '半弦 AM': GW.ui.readout('半弦 AM'), '验证': GW.ui.readout('验证') };
      const rdTg = { 'OP': GW.ui.readout('OP'), '切线长 PA': GW.ui.readout('切线长 PA'), 'PB': GW.ui.readout('PB') };
      const setRd = (r, label, v) => { r.el.firstChild.textContent = label; r.set(v); };
      const allRd = [].concat(Object.values(rdIn), Object.values(rdCh), Object.values(rdTg));

      // ---------- inscribed：圆周角定理 ----------
      // A 固定 0°，B 固定 arc°；P 在 p°。返回 null 表示退化（三点重合），此时不画角也不出读数
      function inscribedData() {
        const arc = st.arc;
        const A = [Math.cos(0), Math.sin(0)];
        const B = [Math.cos(arc * D2R), Math.sin(arc * D2R)];
        const P = [Math.cos(st.p * D2R), Math.sin(st.p * D2R)];
        const AOB = angDeg(0, 0, A[0], A[1], B[0], B[1]);
        const pa = angDeg(P[0], P[1], A[0], A[1], B[0], B[1]);   // 注意：若 P 在圆上且不与 A/B 重合，
        const ap = pa > 180 ? 360 - pa : pa;                    // 这个角就是 ∠APB 本身，别再除 2
        if (!isFinite(ap) || !(Math.abs(pa - 180) > 1e-9)) return null;   // A、B、P 共线（P 在直径上）
        // P 落在劣弧 [0°, arc] 的**内部**时用补角那一档，否则就是 ½∠AOB
        const p2 = wrap360(st.p);
        const onMinor = p2 > 0 && p2 < arc;
        const val = onMinor ? 180 - arc / 2 : arc / 2;
        return { arc, A, B, P, AOB, ap, val, onMinor };
      }
      function drawInscribed() {
        const g = geom();
        const D = inscribedData();
        // 圆 + 圆心 O
        c2.save(); c2.beginPath(); c2.arc(CX, CY, S, 0, TAU); c2.strokeStyle = INK; c2.lineWidth = 2.4; c2.stroke(); c2.restore();
        dot(CX, CY, 3.4, INK);
        halo('O', CX - 14, CY + 12, INK, 'bold 15px ' + MATH);
        if (!D) { text('A、B、P 三点共线（P 落在直径上），圆周角退化', 20, 24, GRAY, '15px ' + FONT); return; }
        const A = pt(0, S), B = pt(D.arc, S), P = pt(st.p, S);
        const O = [CX, CY];
        // ∠AOB：圆心角（金色扇形 + 弧）
        c2.save(); c2.beginPath(); c2.moveTo(CX, CY); c2.arc(CX, CY, S * 0.5, 0, -D.arc * D2R, true); c2.closePath();
        c2.fillStyle = 'rgba(242,165,65,0.16)'; c2.fill(); c2.restore();
        line(CX, CY, A[0], A[1], GOLD, 2.4);
        line(CX, CY, B[0], B[1], GOLD, 2.4);
        angleArc(CX, CY, S * 0.28, 0, -D.arc * D2R, GOLD, 2.4, 1);
        halo('∠AOB = ' + degTxt(D.AOB), CX, CY + S * 0.4, '#b9741a', 'bold 15px ' + FONT, 'center');
        // ∠APB：圆周角（红色弧）
        line(P[0], P[1], A[0], A[1], RED, 2.6);
        line(P[0], P[1], B[0], B[1], RED, 2.6);
        const a1 = Math.atan2(A[1] - P[1], A[0] - P[0]), a2 = Math.atan2(B[1] - P[1], B[0] - P[0]);
        angleArc(P[0], P[1], Math.min(46, S * 0.3), a1, a2, RED, 2.6);
        const bis = (a1 + a2) / 2 + (Math.abs(a2 - a1) > Math.PI ? Math.PI : 0);
        const lr = Math.min(46, S * 0.3) + 26;
        halo('∠APB = ' + degTxt(D.val), P[0] + lr * Math.cos(bis), P[1] + lr * Math.sin(bis), RED, 'bold 16px ' + FONT, 'center');
        // 顶点与标签
        [['A', A, BLUE], ['B', B, BLUE], ['P', P, RED]].forEach(([t, q, col]) => {
          dot(q[0], q[1], 4.6, col);
          const ux = (q[0] - CX) / S, uy = (q[1] - CY) / S;
          halo(t, q[0] + ux * 20, q[1] + uy * 20, col, 'bold 16px ' + MATH);
        });
        // 直径所对的圆周角
        if (Math.abs(D.arc - 180) < 0.5) halo('AB 是直径 → ∠APB = 90°', 16, H - 60, CYAN, 'bold 16px ' + FONT, 'left');
        // 提示
        text(D.onMinor ? 'P 在劣弧上：∠APB = 180° − ½∠AOB' : 'P 在优弧上：∠APB = ½∠AOB', 16, H - 32, D.onMinor ? RED : CYAN, '15px ' + FONT);
        text('拖 P 沿圆跑一圈，看 ∠APB 什么时候变、什么时候不变', 16, H - 10, GRAY, '14px ' + FONT);
      }
      function updateInscribed() {
        const D = inscribedData();
        if (!D) { setRd(rdIn['∠AOB'], '∠AOB', '—'); setRd(rdIn['∠APB'], '∠APB', '—'); setRd(rdIn['关系'], '关系', 'A、B、P 共线，退化'); return; }
        setRd(rdIn['∠AOB'], '∠AOB', degTxt(D.AOB));
        setRd(rdIn['∠APB'], '∠APB', degTxt(D.val));
        setRd(rdIn['关系'], '关系', D.onMinor ? '∠APB = 180° − ½∠AOB' : '∠APB = ½∠AOB');
      }

      // ---------- chord：垂径定理 ----------
      function chordData() {
        const dR = st.d * R;                 // 弦心距（以长度计）
        const half = Math.sqrt(Math.max(0, R * R - dR * dR));
        return { dR, half, ok: Math.abs(R * R - (dR * dR + half * half)) < 1e-9 };
      }
      function drawChord() {
        geom();
        const D = chordData();
        const s = S / R;                     // 每单位长度多少像素
        const M = [CX, CY + D.dR * s];
        c2.save(); c2.beginPath(); c2.arc(CX, CY, S, 0, TAU); c2.strokeStyle = INK; c2.lineWidth = 2.4; c2.stroke(); c2.restore();
        // 弦 AB ⊥ OM
        const A = [CX - D.half * s, M[1]], B = [CX + D.half * s, M[1]];
        line(A[0], A[1], B[0], B[1], BLUE, 3);
        line(CX, CY, M[0], M[1], GOLD, 2.6);            // 弦心距 OM
        line(CX, CY, A[0], A[1], CYAN, 2.6);            // 半径 OA
        line(M[0], M[1], A[0], A[1], RED, 2.6);         // 半弦 AM
        rightAngle(M, [0, -1], [1, 0], 13, INK);
        tick(A, M, 1, INK); tick(M, B, 1, INK);         // AM = MB
        dot(CX, CY, 3.6, INK); dot(M[0], M[1], 3.6, INK);
        dot(A[0], A[1], 4.4, BLUE); dot(B[0], B[1], 4.4, BLUE);
        halo('O', CX - 14, CY - 12, INK, 'bold 15px ' + MATH);
        halo('M', M[0] + 14, M[1] + 12, INK, 'bold 15px ' + MATH);
        halo('A', A[0] - 16, A[1] + 4, BLUE, 'bold 16px ' + MATH);
        halo('B', B[0] + 16, B[1] + 4, BLUE, 'bold 16px ' + MATH);
        halo('r = ' + fmt(R), (CX + A[0]) / 2, (CY + A[1]) / 2 - 12, CYAN, 'bold 15px ' + MATH);
        halo('d = ' + fmt(D.dR), CX + 12, (CY + M[1]) / 2, '#b9741a', 'bold 15px ' + MATH, 'left');
        halo('AM = ' + fmt(D.half), (M[0] + A[0]) / 2, M[1] - 14, RED, 'bold 15px ' + MATH);
        text('垂径定理：垂直于弦的直径平分这条弦（AM = MB），且 r² = d² + AM²', 16, H - 32, INK, '15px ' + FONT);
        text('AM = MB 用等长记号标出；拖动「弦心距 d」看半弦怎么变', 16, H - 10, GRAY, '14px ' + FONT);
      }
      function updateChord() {
        const D = chordData();
        setRd(rdCh['半径 r'], '半径 r', fmt(R));
        setRd(rdCh['弦心距 d'], '弦心距 d', fmt(D.dR));
        setRd(rdCh['半弦 AM'], '半弦 AM', fmt(D.half));
        setRd(rdCh['验证'], '验证', 'r² = d² + AM² ' + (D.ok ? '✓' : '✗'));
      }

      // ---------- tangent：切线长定理 ----------
      function tangentData() {
        const op = st.op * R;
        const c = R / op;
        const halfAng = Math.acos(clamp(c, -1, 1)) / D2R;
        const pa = Math.sqrt(Math.max(0, op * op - R * R));
        return { op, halfAng, pa };
      }
      function drawTangent() {
        geom();
        const D = tangentData();
        const s = S / R;
        const rr = R * s, opx = D.op * s;
        const a1 = D.halfAng, a2 = -D.halfAng;
        const A = [CX + rr * Math.cos(a1 * D2R), CY - rr * Math.sin(a1 * D2R)];
        const B = [CX + rr * Math.cos(a2 * D2R), CY - rr * Math.sin(a2 * D2R)];
        const P = [CX + opx, CY];
        c2.save(); c2.beginPath(); c2.arc(CX, CY, rr, 0, TAU); c2.strokeStyle = INK; c2.lineWidth = 2.4; c2.stroke(); c2.restore();
        line(CX, CY, A[0], A[1], GOLD, 2.6);            // 半径 OA
        line(CX, CY, B[0], B[1], GOLD, 2.6);            // 半径 OB
        line(P[0], P[1], A[0], A[1], RED, 3);           // 切线 PA
        line(P[0], P[1], B[0], B[1], RED, 3);           // 切线 PB
        line(CX, CY, P[0], P[1], CYAN, 2.2, [8, 6]);    // OP
        line(A[0], A[1], B[0], B[1], GRAY, 1.8, [5, 5]); // 两切点的连线（与 OP 垂直）
        rightAngle(A, [CX - A[0], CY - A[1]], [P[0] - A[0], P[1] - A[1]], 13, INK);
        rightAngle(B, [CX - B[0], CY - B[1]], [P[0] - B[0], P[1] - B[1]], 13, INK);
        tick(P, A, 2, INK); tick(P, B, 2, INK);         // PA = PB
        dot(CX, CY, 3.6, INK); dot(A[0], A[1], 4.4, BLUE); dot(B[0], B[1], 4.4, BLUE); dot(P[0], P[1], 4.6, RED);
        halo('O', CX - 14, CY + 14, INK, 'bold 15px ' + MATH);
        halo('A', A[0] - 16, A[1] - 10, BLUE, 'bold 16px ' + MATH);
        halo('B', B[0] - 16, B[1] + 14, BLUE, 'bold 16px ' + MATH);
        halo('P', P[0] + 16, P[1] - 10, RED, 'bold 16px ' + MATH);
        halo('OA ⊥ PA', (CX + A[0]) / 2 - 46, (CY + A[1]) / 2 - 14, INK, '14px ' + FONT, 'center');
        halo('PA = PB = ' + fmt(D.pa), (P[0] + A[0]) / 2, (P[1] + A[1]) / 2 - 16, RED, 'bold 15px ' + MATH);
        text('切线长定理：从圆外一点引两条切线，切线长相等（PA = PB），且 OA ⊥ PA、OB ⊥ PB', 16, H - 32, INK, '15px ' + FONT);
        text('OP = ' + fmt(D.op) + '，切线长 PA = √(OP² − r²)（勾股定理）', 16, H - 10, GRAY, '14px ' + FONT);
      }
      function updateTangent() {
        const D = tangentData();
        setRd(rdTg['OP'], 'OP', fmt(D.op));
        setRd(rdTg['切线长 PA'], '切线长 PA', fmt(D.pa));
        setRd(rdTg['PB'], 'PB', fmt(D.pa));
      }

      // ---------- 画布：P 可以沿圆周拖动（inscribed 模式） ----------
      kit.drag(
        (q) => {
          if (st.mode !== 'inscribed') return null;
          geom();
          const d = Math.hypot(q.x - CX, q.y - CY);
          return Math.abs(d - S) < Math.max(22, S * 0.18) ? { p: st.p } : null;
        },
        (t, q) => {
          geom();
          st.p = wrap360(Math.round(Math.atan2(CY - q.y, q.x - CX) / D2R));
          pSl && pSl.set(st.p);
          dirty = true; save();
        },
        () => dirty = true
      );

      // ---------- 面板 ----------
      const panel = kit.panel;
      const modeSeg = GW.ui.segmented({
        options: [{ value: 'inscribed', label: '圆周角' }, { value: 'chord', label: '垂径定理' }, { value: 'tangent', label: '切线长' }],
        value: st.mode,
        onChange: (v) => { st.mode = v; build(); dirty = true; save(); },
      });
      panel.append(GW.ui.group('模式', modeSeg.el));
      const optBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      panel.append(GW.ui.group('参数', optBox));
      const rdBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column' } });
      panel.append(GW.ui.group('读数', rdBox));
      allRd.forEach((r) => rdBox.append(r.el));

      let pSl = null;   // inscribed 模式下的 P 滑块（拖动时反过来更新它）
      function build() {
        modeSeg.set(st.mode);
        optBox.innerHTML = '';
        pSl = null;
        const show = {
          inscribed: { arc: true, p: true, d: false, op: false },
          chord: { arc: false, p: false, d: true, op: false },
          tangent: { arc: false, p: false, d: false, op: true },
        }[st.mode];
        if (show.arc) {
          optBox.append(GW.ui.slider({
            label: '∠AOB（弧 AB 的度数）', min: 20, max: 340, step: 1, value: st.arc, unit: '°',
            onInput: (v) => { st.arc = num(v, 100, 20, 340); dirty = true; save(); },
          }).el);
        }
        if (show.p) {
          pSl = GW.ui.slider({
            label: 'P 的位置角', min: 0, max: 359, step: 1, value: st.p, unit: '°',
            onInput: (v) => { st.p = num(v, 270, 0, 359); dirty = true; save(); },
          });
          optBox.append(pSl.el);
        }
        if (show.d) {
          optBox.append(GW.ui.slider({
            label: '弦心距 d / r', min: 0, max: 0.95, step: 0.05, value: st.d,
            onInput: (v) => { st.d = num(v, 0.6, 0, 0.95); dirty = true; save(); },
          }).el);
        }
        if (show.op) {
          optBox.append(GW.ui.slider({
            label: 'OP / r', min: 1.1, max: 3, step: 0.01, value: st.op,
            onInput: (v) => { st.op = num(v, 5 / 3, 1.1, 3); dirty = true; save(); },
          }).el);
        }
        // 读数：只显示当前模式用得上的（其余留在 DOM 里，探针 ⑧ 要求有 .gw-readout）
        const vis = {
          inscribed: [rdIn['∠AOB'], rdIn['∠APB'], rdIn['关系']],
          chord: [rdCh['半径 r'], rdCh['弦心距 d'], rdCh['半弦 AM'], rdCh['验证']],
          tangent: [rdTg['OP'], rdTg['切线长 PA'], rdTg['PB']],
        }[st.mode];
        allRd.forEach((r) => (r.el.style.display = vis.includes(r) ? '' : 'none'));
        dirty = true;
      }

      build();
      kit.loop(() => {
        if (!dirty || !W) return;   // 只在需要时重画（探针 ④ 的「静置不变」靠这条）
        dirty = false;
        kit.background();
        if (st.mode === 'chord') { drawChord(); updateChord(); }
        else if (st.mode === 'tangent') { drawTangent(); updateTangent(); }
        else { drawInscribed(); updateInscribed(); }
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
