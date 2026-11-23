/* 数理无限画布 · 初中数学 · 全等三角形的判定
 * SSS / SAS / ASA / AAS / HL 都唯一确定一个三角形；SSA 在 b·sinA < a < b 时有两个解 ——
 * 两个三角形都满足条件却不全等，这是八上第 12 章的难点，静态板书很难画准
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#5b6576';
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const TAU = Math.PI * 2, DEG = Math.PI / 180;

  const MODES = ['SSS', 'SAS', 'ASA', 'AAS', 'HL', 'SSA'];
  const MODE_NAME = { SSS: '边边边', SAS: '边角边', ASA: '角边角', AAS: '角角边', HL: '斜边、直角边', SSA: '边边角（不能判定全等）' };

  // 读数与标注的数字格式：负号一律用 U+2212（同 math-prob.js:11 的写法，本文件另写一份，不跨文件引用）
  const dec = (v, d = 2) => { if (!isFinite(v)) return '—'; let s = v.toFixed(d).replace(/\.?0+$/, ''); return s.replace('-', '−'); };
  const num = (v, def, lo, hi) => { const x = +v; return GW.clamp(isFinite(x) ? x : def, lo, hi); };
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

  // ---------- 纯函数：已知条件 → 三角形数组（长度可以是 0、1 或 2） ----------
  // 统一约定：A 在原点、AB 沿 x 轴正方向；a = BC、b = AC、c = AB；角是度数
  function solve(mode, P) {
    const A = P.A1 * DEG, B = P.A2 * DEG;
    const out = [];
    if (mode === 'SSS') {
      // 三边：不满足三角不等式（含退化的 a + b = c）就构不成三角形
      const a = P.s1, b = P.s2, c = P.s3;
      if (a + b > c + 1e-9 && a + c > b + 1e-9 && b + c > a + 1e-9) {
        const x = (b * b + c * c - a * a) / (2 * c);
        out.push([[0, 0], [c, 0], [x, Math.sqrt(Math.max(0, b * b - x * x))]]);
      }
    } else if (mode === 'SAS') {
      // 两边和它们的夹角：先把 AB 画在 x 轴上，再按 ∠A 定出 AC
      out.push([[0, 0], [P.s1, 0], [P.s2 * Math.cos(A), P.s2 * Math.sin(A)]]);
    } else if (mode === 'ASA' || mode === 'AAS') {
      // 两角：∠A + ∠B ≥ 180° 时两条边平行，接不上
      if (P.A1 + P.A2 < 180 - 1e-9) {
        // ASA 的已知边是夹边 AB = c；AAS 的已知边是 BC = a，先用正弦定理把 AB 算出来
        const c = mode === 'ASA' ? P.s1 : P.s1 * Math.sin(Math.PI - A - B) / Math.sin(A);
        const t = c * Math.sin(B) / Math.sin(A + B);   // 射线 A 与射线 B 的交点到 A 的距离
        out.push([[0, 0], [c, 0], [t * Math.cos(A), t * Math.sin(A)]]);
      }
    } else if (mode === 'HL') {
      // 斜边和一条直角边：斜边必须比直角边长
      const hyp = P.s1, leg = P.s2;
      if (hyp > leg + 1e-9) out.push([[0, 0], [leg, 0], [0, Math.sqrt(hyp * hyp - leg * leg)]]);
    } else if (mode === 'SSA') {
      // 已知 ∠A、邻边 b = AC、对边 a = BC：B 落在射线 AB 上，等价于「以 C 为圆心、a 为半径的圆
      // 与射线 AB 的交点」。C = (b·cosA, b·sinA)，设 AB = c： (c − b·cosA)² + (b·sinA)² = a²
      const a = P.s1, b = P.s2;
      const h = b * Math.sin(A);    // C 到射线 AB 所在直线的距离 = b·sinA
      const x0 = b * Math.cos(A);   // C 的横坐标
      const tol = 1e-7;
      if (P.A1 >= 90 - 1e-9) {
        // ∠A 是直角或钝角时，B 只有落在 A 之外（a > b）才成立；a = b 时 B 与 A 重合、退化
        if (a > b + tol) out.push([[0, 0], [x0 + Math.sqrt(Math.max(0, a * a - h * h)), 0], [x0, h]]);
      } else if (a < h - tol) {
        // a < b·sinA：圆够不着射线 AB，无解
      } else if (Math.abs(a - h) <= tol) {
        // a = b·sinA：刚好相切，一个解（直角那种）
        out.push([[0, 0], [x0, 0], [x0, h]]);
      } else {
        // 两个交点里落在射线 AB 正方向上的才有效：b·sinA < a < b 时两个都有效（两个解），
        // a ≥ b 时只剩 c = b·cosA + d 这一个
        const d = Math.sqrt(Math.max(0, a * a - h * h));
        [x0 + d, x0 - d].forEach((c) => { if (c > tol) out.push([[0, 0], [c, 0], [x0, h]]); });
      }
    }
    return out;
  }

  // ---------- 纯函数：画面上要加粗标注的「已知元素」与作图痕迹（都用世界坐标） ----------
  function scene(mode, P) {
    const A = P.A1 * DEG, B = P.A2 * DEG;
    const tris = solve(mode, P);
    const t = tris[0] || null;
    const S = { tris, pts: [[0, 0]], sides: [], angles: [], circles: [], rays: [], right: null, note: '' };
    const side = (p, q, name) => S.sides.push({ p, q, name });
    if (mode === 'SSS') {
      const a = P.s1, b = P.s2, c = P.s3;
      S.note = '已知三边：a = BC = ' + dec(a, 1) + '，b = AC = ' + dec(b, 1) + '，c = AB = ' + dec(c, 1);
      S.pts.push([c, 0]);
      side([0, 0], [c, 0], 'c = ' + dec(c, 1));
      if (t) { S.pts.push(t[2]); side(t[1], t[2], 'a = ' + dec(a, 1)); side(t[2], t[0], 'b = ' + dec(b, 1)); }
      S.circles.push({ c: [0, 0], r: b, w: 1.8 });   // 以 A 为圆心、b 为半径
      S.circles.push({ c: [c, 0], r: a, w: 1.8 });   // 以 B 为圆心、a 为半径
    } else if (mode === 'SAS') {
      S.note = '已知两边及其夹角：AB = ' + dec(P.s1, 1) + '，AC = ' + dec(P.s2, 1) + '，∠A = ' + dec(P.A1, 0) + '°';
      const C = [P.s2 * Math.cos(A), P.s2 * Math.sin(A)];
      S.pts.push([P.s1, 0], C);
      side([0, 0], [P.s1, 0], 'AB = ' + dec(P.s1, 1));
      side([0, 0], C, 'AC = ' + dec(P.s2, 1));
      S.angles.push({ v: [0, 0], p: [P.s1, 0], q: C, name: '∠A = ' + dec(P.A1, 0) + '°' });
      S.circles.push({ c: [0, 0], r: P.s2, w: 1.6 });
    } else if (mode === 'ASA' || mode === 'AAS') {
      if (mode === 'ASA') {
        S.note = '已知两角及其夹边：∠A = ' + dec(P.A1, 0) + '°，∠B = ' + dec(P.A2, 0) + '°，AB = ' + dec(P.s1, 1);
      } else {
        S.note = '已知两角及其中一个角的对边：∠A = ' + dec(P.A1, 0) + '°，∠B = ' + dec(P.A2, 0) + '°，BC = ' + dec(P.s1, 1);
      }
      if (t) {
        S.pts.push(t[1], t[2]);
        S.angles.push({ v: t[0], p: t[1], q: t[2], name: '∠A = ' + dec(P.A1, 0) + '°' });
        S.angles.push({ v: t[1], p: t[0], q: t[2], name: '∠B = ' + dec(P.A2, 0) + '°' });
        if (mode === 'ASA') side(t[0], t[1], 'AB = ' + dec(P.s1, 1));
        else side(t[1], t[2], 'BC = ' + dec(P.s1, 1));
      } else {
        // 零个解：只画已知的那条边，并说明两角和已经 ≥ 180°
        S.note += '（∠A + ∠B = ' + dec(P.A1 + P.A2, 0) + '° ≥ 180°，两条边永远接不上）';
        S.pts.push([P.s1, 0]);
        side([0, 0], [P.s1, 0], (mode === 'ASA' ? 'AB = ' : 'BC = ') + dec(P.s1, 1));
        S.rays.push({ p: [0, 0], q: [P.s1 * Math.cos(A) * 4, P.s1 * Math.sin(A) * 4] });
        S.rays.push({ p: [P.s1, 0], q: [P.s1 - P.s1 * Math.cos(B) * 4, P.s1 * Math.sin(B) * 4] });
      }
      S.circles.push({ c: [0, 0], r: P.s1 * 0.55, w: 1.4 });
    } else if (mode === 'HL') {
      const leg = P.s2;
      S.note = '已知斜边和一条直角边：AB = ' + dec(P.s1, 1) + '（斜边），AC = ' + dec(P.s2, 1) + '（直角边）';
      S.pts.push([leg, 0]);
      if (t) S.pts.push(t[2]);
      side([0, 0], [leg, 0], 'AC = ' + dec(P.s2, 1));
      if (t) side(t[1], t[2], 'AB = ' + dec(P.s1, 1));
      S.right = { v: [0, 0], p: [leg, 0], q: t ? t[2] : [0, P.s2] };
      S.circles.push({ c: [0, 0], r: leg, w: 1.6 });
    } else if (mode === 'SSA') {
      const a = P.s1, b = P.s2;
      const h = b * Math.sin(A), x0 = b * Math.cos(A);
      S.note = '已知∠A 与邻边 b = AC，以及对边 a = BC：∠A = ' + dec(P.A1, 0) + '°，b = ' + dec(b, 1)
        + '，a = ' + dec(a, 1) + '（b·sinA = ' + dec(b * Math.sin(A), 2) + '）';
      S.pts.push([x0, h]);
      side([0, 0], [x0, h], 'b = ' + dec(b, 1));
      S.angles.push({ v: [0, 0], p: [1, 0], q: [x0, h], name: '∠A = ' + dec(P.A1, 0) + '°' });
      // 射线 AB：B 只能落在这条射线上
      S.rays.push({ p: [0, 0], q: [x0 + a + 0.9, 0] });
      // 以 C 为圆心、a 为半径的圆：它和射线 AB 的交点个数就是解的个数
      S.circles.push({ c: [x0, h], r: a, w: 2.2, key: true });
      S.pts.push([x0 + a, h], [x0 - a, h]);
    }
    return S;
  }

  GW.registerSim({
    id: 'math-congruent', name: '全等三角形的判定', category: 'math', group: '初中 · 图形与几何',
    desc: 'SSS、SAS、ASA、AAS、HL 唯一确定三角形；SSA 的两个解都满足条件却不全等',
    keywords: '全等 全等三角形 判定 边边边 边角边 角边角 角角边 斜边直角边 SSS SAS ASA AAS HL SSA 八年级 初中',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18L12 4z"/><path d="M7.5 12h9"/><path d="M12 4v16"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const st = ctx.state;
      // 逐个字段校验并给默认值：state 可能是空对象（重新开始）、老存档，或探针塞的垃圾
      if (!MODES.includes(st.mode)) st.mode = 'SSS';
      st.s1 = num(st.s1, 5, 2, 10);
      st.s2 = num(st.s2, 4, 2, 10);
      st.s3 = num(st.s3, 6, 2, 10);
      st.A1 = num(st.A1, 30, 10, 170);
      st.A2 = num(st.A2, 50, 10, 170);
      if (typeof st.marks !== 'boolean') st.marks = false;

      const kit = GW.simKit.layout(ctx.root, { panelWidth: 260 });
      const c2 = kit.ctx2d;
      let W = 0, H = 0, dirty = true;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      const save = () => ctx.save();

      // ---------- 坐标变换：世界（边长单位）→ 屏幕 ----------
      let fit = { s: 1, X: (x) => x, Y: (y) => y };
      function fitTo(pts) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        pts.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
        if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1; }
        const w = Math.max(1e-6, x1 - x0), h = Math.max(1e-6, y1 - y0);
        const s = Math.max(2, Math.min((W - 184) / w, (H - 156) / h, 150));
        const ox = (W - (x0 + x1) * s) / 2, oy = (H + (y0 + y1) * s) / 2;
        fit = { s, X: (x) => ox + x * s, Y: (y) => oy - y * s };
      }

      // ---------- 绘制助手 ----------
      function line(x1, y1, x2, y2, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; c2.lineCap = 'round';
        if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke(); c2.restore();
      }
      function poly(pts, color, w, dash, fill) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; c2.lineJoin = 'round';
        if (dash) c2.setLineDash(dash);
        c2.beginPath(); pts.forEach((p, i) => (i ? c2.lineTo(p[0], p[1]) : c2.moveTo(p[0], p[1]))); c2.closePath();
        if (fill) { c2.fillStyle = fill; c2.fill(); }
        c2.stroke(); c2.restore();
      }
      function text(t, x, y, color, font, al, bl) {
        c2.font = font || '15px ' + FONT; c2.fillStyle = color || INK;
        c2.textAlign = al || 'left'; c2.textBaseline = bl || 'middle'; c2.fillText(t, x, y);
      }
      // 压在图形上的标签用白色描边光晕（同 phy-incline.js 的 halo 写法）
      function halo(t, x, y, color, font, al) {
        c2.save(); c2.font = font || 'bold 15px ' + FONT; c2.textAlign = al || 'center'; c2.textBaseline = 'middle';
        c2.lineWidth = 3.5; c2.lineJoin = 'round'; c2.strokeStyle = 'rgba(255,255,255,0.92)'; c2.strokeText(t, x, y);
        c2.fillStyle = color || INK; c2.fillText(t, x, y); c2.restore();
      }
      function dot(x, y, color, r) { c2.beginPath(); c2.arc(x, y, r || 4.5, 0, TAU); c2.fillStyle = color; c2.fill(); }
      function circleAt(x, y, r, color, w, dash) {
        if (!(r > 0.5)) return;
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 1.6;
        if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.arc(x, y, r, 0, TAU); c2.stroke(); c2.restore();
      }
      // 角弧：只取两条射线之间的劣弧，度数写在角平分线上
      function drawAngle(an) {
        const vx = fit.X(an.v[0]), vy = fit.Y(an.v[1]);
        const a0 = Math.atan2(-(an.p[1] - an.v[1]), an.p[0] - an.v[0]);
        const a1 = Math.atan2(-(an.q[1] - an.v[1]), an.q[0] - an.v[0]);
        let d = a1 - a0; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        const R = 34;
        c2.save(); c2.strokeStyle = GOLD; c2.lineWidth = 4;
        c2.beginPath(); c2.arc(vx, vy, R, a0, a0 + d, d < 0); c2.stroke(); c2.restore();
        const am = a0 + d / 2, la = R + 22;
        halo(an.name, vx + Math.cos(am) * la, vy + Math.sin(am) * la, '#b9741a', 'bold 14px ' + FONT);
      }
      function dirTo(from, to) {
        const ax = fit.X(to[0]) - fit.X(from[0]), ay = fit.Y(to[1]) - fit.Y(from[1]);
        const L = Math.hypot(ax, ay) || 1; return [ax / L, ay / L];
      }
      // 直角符号（HL 用）
      function drawRight(rt) {
        const vx = fit.X(rt.v[0]), vy = fit.Y(rt.v[1]);
        const u1 = dirTo(rt.v, rt.p), u2 = dirTo(rt.v, rt.q), s = 15;
        c2.save(); c2.strokeStyle = INK; c2.lineWidth = 2.2; c2.beginPath();
        c2.moveTo(vx + u1[0] * s, vy + u1[1] * s);
        c2.lineTo(vx + (u1[0] + u2[0]) * s, vy + (u1[1] + u2[1]) * s);
        c2.lineTo(vx + u2[0] * s, vy + u2[1] * s);
        c2.stroke(); c2.restore();
      }

      // ---------- 画面 ----------
      function drawScene() {
        const P = { s1: st.s1, s2: st.s2, s3: st.s3, A1: st.A1, A2: st.A2 };
        const S = scene(st.mode, P);
        const pts = [];
        S.tris.forEach((t) => t.forEach((p) => pts.push(p)));
        S.pts.forEach((p) => pts.push(p));
        fitTo(pts);
        const PX = (p) => fit.X(p[0]), PY = (p) => fit.Y(p[1]);

        // 作图痕迹（圆规弧）：marks 打开时画；零个解时不画就什么都看不见，所以也一并画出来
        if (st.marks || !S.tris.length) {
          S.circles.forEach((c) => circleAt(fit.X(c.c[0]), fit.Y(c.c[1]), c.r * fit.s,
            c.key ? 'rgba(15,157,138,0.75)' : 'rgba(91,101,118,0.5)', c.w || 1.6, [7, 5]));
        }
        // 射线
        S.rays.forEach((r) => line(PX(r.p), PY(r.p), PX(r.q), PY(r.q), 'rgba(91,101,118,0.85)', 2, [8, 6]));

        // 三角形：一个解是实线，第二个解用 RED 虚线叠画
        S.tris.forEach((t, i) => {
          const sp = t.map((v) => [fit.X(v[0]), fit.Y(v[1])]);
          if (i === 0) poly(sp, INK, 2.4, null, 'rgba(51,102,255,0.07)');
          else poly(sp, RED, 2.6, [9, 6], null);
        });

        // 图心：标签一律朝外推
        let cx = 0, cy = 0, cn = 0;
        S.tris.forEach((t) => t.forEach((v) => { cx += fit.X(v[0]); cy += fit.Y(v[1]); cn++; }));
        if (!cn) { S.pts.forEach((p) => { cx += fit.X(p[0]); cy += fit.Y(p[1]); cn++; }); }
        cx = cn ? cx / cn : W / 2; cy = cn ? cy / cn : H / 2;
        const outward = (x, y, d) => {
          const dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy) || 1;
          return [x + dx / L * d, y + dy / L * d];
        };

        // 已知边：BLUE 加粗并标数值
        S.sides.forEach((sd) => {
          const x1 = PX(sd.p), y1 = PY(sd.p), x2 = PX(sd.q), y2 = PY(sd.q);
          line(x1, y1, x2, y2, BLUE, 4);
          const [lx, ly] = outward((x1 + x2) / 2, (y1 + y2) / 2, 17);
          halo(sd.name, lx, ly, '#2749c8', 'bold 14px ' + FONT);
        });
        // 已知角：GOLD 弧 + 度数
        S.angles.forEach(drawAngle);
        if (S.right) drawRight(S.right);

        // 顶点
        S.tris.forEach((t, i) => {
          [[0, 'A'], [1, i === 1 ? 'B′' : 'B'], [2, 'C']].forEach(([j, name]) => {
            if (i === 1 && j !== 1) return;   // A、C 是两个解共用的，只标一次
            const x = fit.X(t[j][0]), y = fit.Y(t[j][1]);
            dot(x, y, i === 0 ? INK : RED, 4.5);
            const [lx, ly] = outward(x, y, 20);
            halo(name, lx, ly, i === 0 ? INK : RED, 'bold 16px ' + MATH);
          });
        });

        // 文字说明
        text(S.note, 14, 20, INK, '15px ' + FONT);
        const n = S.tris.length;
        text(n === 2 ? '两个三角形都满足条件，但不全等' : n === 1 ? '条件唯一确定一个三角形' : '构不成三角形',
          14, H - 18, n === 2 ? RED : n === 1 ? CYAN : GRAY, 'bold 16px ' + FONT);
        if (st.mode === 'SSA') text('以 C 为圆心、a 为半径的圆与射线 AB 的交点个数 = 满足条件的三角形个数', W - 14, H - 46, GRAY, '13px ' + FONT, 'right');
      }

      // ---------- 面板 ----------
      const panel = kit.panel;
      const modeSeg = GW.ui.segmented({
        options: MODES.map((m) => ({ value: m, label: m })), value: st.mode,
        onChange: (v) => { st.mode = v; build(); save(); },
      });
      const modeCap = GW.h('div', { style: { fontSize: '13px', color: '#5b6576', marginTop: '7px' } });
      panel.append(GW.ui.group('判定方法', modeSeg.el, modeCap));

      const optBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      panel.append(GW.ui.group('已知条件', optBox));

      const marksTg = GW.ui.toggle({ label: '作图痕迹（尺规弧）', value: st.marks, onChange: (v) => { st.marks = v; dirty = true; save(); } });
      panel.append(GW.ui.group('显示', marksTg.el));

      const rd1 = GW.ui.readout('满足条件的三角形'), rd2 = GW.ui.readout('结论'), rd3 = GW.ui.readout('第三边');
      panel.append(GW.ui.group('结论', rd1.el, rd2.el, rd3.el));
      function setRd(r, label, v) { r.el.style.display = label ? '' : 'none'; r.el.firstChild.textContent = label; r.set(v); }

      // 各模式的面板控件顺序固定（探针按「第几个 range」poke）：
      // SSS: s1 s2 s3 ／ SAS: s1 A1 s2 ／ SSA: s1 s2 A1
      function build() {
        modeSeg.set(st.mode);
        modeCap.textContent = st.mode + '（' + MODE_NAME[st.mode] + '）';
        optBox.innerHTML = '';
        const sl = (label, key, min, max, step) => GW.ui.slider({
          label, min, max, step, value: st[key],
          onInput: (v) => { st[key] = v; dirty = true; save(); },
        });
        if (st.mode === 'SSS') {
          optBox.append(sl('边 a（BC）', 's1', 2, 10, 0.5).el, sl('边 b（AC）', 's2', 2, 10, 0.5).el, sl('边 c（AB）', 's3', 2, 10, 0.5).el);
        } else if (st.mode === 'SAS') {
          optBox.append(sl('边 AB', 's1', 2, 10, 0.5).el, sl('夹角 ∠A（度）', 'A1', 10, 170, 1).el, sl('边 AC', 's2', 2, 10, 0.5).el);
        } else if (st.mode === 'ASA') {
          optBox.append(sl('角 ∠A（度）', 'A1', 10, 170, 1).el, sl('夹边 AB', 's1', 2, 10, 0.5).el, sl('角 ∠B（度）', 'A2', 10, 170, 1).el);
        } else if (st.mode === 'AAS') {
          optBox.append(sl('角 ∠A（度）', 'A1', 10, 170, 1).el, sl('角 ∠B（度）', 'A2', 10, 170, 1).el, sl('边 BC', 's1', 2, 10, 0.5).el);
        } else if (st.mode === 'HL') {
          optBox.append(sl('斜边 AB', 's1', 2, 10, 0.5).el, sl('直角边 AC', 's2', 2, 10, 0.5).el);
        } else {
          optBox.append(sl('对边 a（BC）', 's1', 2, 10, 0.5).el, sl('邻边 b（AC）', 's2', 2, 10, 0.5).el, sl('角 ∠A（度）', 'A1', 10, 170, 1).el);
        }
        dirty = true;
      }

      function updateReadouts() {
        const tris = solve(st.mode, { s1: st.s1, s2: st.s2, s3: st.s3, A1: st.A1, A2: st.A2 });
        const n = tris.length;
        setRd(rd1, '满足条件的三角形', n + ' 个');
        setRd(rd2, '结论', n === 2 ? '不唯一，不能判定全等' : n === 1 ? '唯一确定，可判定全等' : '构不成三角形');
        // 第三边只有 SAS 才谈得上（另外两个角一给，边就定了）
        if (st.mode === 'SAS' && n) setRd(rd3, '第三边', dec(dist(tris[0][1], tris[0][2]), 2));
        else setRd(rd3, '', '');
      }

      build();
      kit.loop(() => {
        if (!dirty || !W) return;
        dirty = false;
        kit.background();
        drawScene();
        updateReadouts();
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
