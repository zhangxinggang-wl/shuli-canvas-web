/* 物理图形库 · 电磁学实验（1.1.6）
   11 个图形逐个移植自「唐波的物理白板 · 独立实现」生成的单文件 HTML：
   游标卡尺 10/20/50 分度、螺旋测微器、电压表、电流表、电流表内接/外接局部电路、
   分压式/限流式内外接电路、磁聚焦与磁发散动画。
   移植原则：原页面的 draw() 逐行搬过来（配色、字体、比例、刻度系数都不改），只把
   画布尺寸换成设计画布 r.w/r.h，把页面的状态变量换成对象参数（o.em<前缀>_xxx），
   把页面外壳（滑块面板、按钮、时间轴、拖拽交互、dpr、resize）去掉——白板统一提供
   参数面板、动画播放与画布缩放。坐标落在设计画布左上角（P.emDefine 已 translate+scale）。 */
(function () {
'use strict';
if (!window.GW || !window.GW.physShapes) return;

/* ── em2/anim_orbit_motion.js ── */
/* 天体运动（可调参 · 白板动画图形）
   移植自 src/sims/phy-orbit.js：砍掉 DOM 面板、发射/变轨按钮与数值积分，只留中心天体、
   轨道全貌、卫星与速度/引力矢量、开普勒等时扫过面积；坐标改成 860×560 设计画布，
   页面状态改成对象参数 + o.animT。
   动画是 o.animT 的纯函数：中心天体质量 M、轨道半径 r、初速 v 直接给出二体问题的
   比机械能 E、角动量 h 与偏心率 e，再由开普勒方程（椭圆）/ 巴克方程（抛物线）/
   双曲开普勒方程（双曲线）解析求位置与速度 —— 不积分、不累加、不读时钟。 */
(function () {
  'use strict';
  const P = window.GW.physShapes;
  if (!P || !P.emDefine) return;

  const DW = 860, DH = 560;
  const RE = 6.371e6, GME = 3.986e14;   // 地球半径与地心引力常数
  const TAU = Math.PI * 2;

  /* 深色画布上的墨色；强调色照抄源页面 */
  const INK = '#e6edf7', DIM = '#8fa3c0';
  const CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541';
  const SANS = '"Microsoft YaHei","PingFang SC",sans-serif';
  const NUM = '"Times New Roman",Georgia,"Songti SC",serif';

  const AXX0 = 24, AXX1 = 628, AXY0 = 62, AXY1 = 506;   // 轨道绘图区
  const PX0 = 648, PY0 = 58, PX1 = 846, PY1 = 502;       // 右侧读数面板
  const LOOP = 5;                                        // 一圈 5 s（animT 的纯函数周期）

  function num(v, def, lo, hi) {
    const x = typeof v === 'number' && isFinite(v) ? v : def;
    return x < lo ? lo : (x > hi ? hi : x);
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function txt(c, s, x, y, size, color, align, family, bold) {
    c.save();
    c.fillStyle = color;
    c.font = (bold ? '700 ' : '') + Math.round(size) + 'px ' + (family || SANS);
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    c.fillText(s, x, y);
    c.restore();
  }

  function arrow(c, x1, y1, x2, y2, color, lw, head) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    if (!(L > 0.6)) return;
    const ux = dx / L, uy = dy / L, a = Math.atan2(uy, ux);
    const h = Math.min(head || 9, L * 0.45);
    c.save();
    c.strokeStyle = color;
    c.lineWidth = lw;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - h * Math.cos(a - 0.42), y2 - h * Math.sin(a - 0.42));
    c.moveTo(x2, y2);
    c.lineTo(x2 - h * Math.cos(a + 0.42), y2 - h * Math.sin(a + 0.42));
    c.stroke();
    c.restore();
  }

  function rr(c, x, y, w, h, rad) {
    const d = Math.max(0, Math.min(rad, Math.min(w, h) / 2));
    c.beginPath();
    c.moveTo(x + d, y);
    c.lineTo(x + w - d, y);
    c.arcTo(x + w, y, x + w, y + d, d);
    c.lineTo(x + w, y + h - d);
    c.arcTo(x + w, y + h, x + w - d, y + h, d);
    c.lineTo(x + d, y + h);
    c.arcTo(x, y + h, x, y + h - d, d);
    c.lineTo(x, y + d);
    c.arcTo(x, y, x + d, y, d);
    c.closePath();
  }

  /* ===== 开普勒方程的三个解 ===== */
  function solveE(M, e) {                 // 椭圆：E - e·sinE = M
    let E = M + e * Math.sin(M);
    for (let i = 0; i < 9; i++) {
      const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= d;
      if (Math.abs(d) < 1e-11) break;
    }
    return E;
  }
  function solveD(K) {                    // 抛物线：D + D³/3 = K（巴克方程）
    let D = Math.cbrt(3 * K);
    if (!(D > 0)) D = 1e-6;
    for (let i = 0; i < 24; i++) {
      const g = D + D * D * D / 3 - K;
      const d = g / (1 + D * D);
      D -= d;
      if (D < 0) D = 0;
      if (Math.abs(d) < 1e-12) break;
    }
    return D;
  }
  function solveH(M, e) {                 // 双曲线：e·sinhH - H = M
    let H = Math.asinh(M / e);
    for (let i = 0; i < 30; i++) {
      const g = e * Math.sinh(H) - H - M;
      const d = g / (e * Math.cosh(H) - 1);
      H -= d;
      if (Math.abs(d) < 1e-12) break;
    }
    return H;
  }
  function meanFromTrue(f, e) {
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(f / 2), Math.sqrt(1 + e) * Math.cos(f / 2));
    return E - e * Math.sin(E);
  }

  /* ===== 二体问题：由 (r, v, M) 直接得到轨道要素 ===== */
  function orbitModel(o) {
    const Mm = num(o.uo_M, 1, 0.2, 3);
    const rR = num(o.uo_r, 2, 1.2, 8);
    const vk = num(o.uo_v, 6.5, 4, 14);
    const show = num(o.uo_showtrail, 1, 0, 1) >= 0.5;

    const mu = GME * Mm, r0 = rR * RE, v0 = vk * 1000;
    const E = 0.5 * v0 * v0 - mu / r0;
    const h = r0 * v0;
    const e = Math.sqrt(Math.max(0, 1 + 2 * E * h * h / (mu * mu)));
    const p = h * h / mu;
    const vc = Math.sqrt(mu / r0), ve = Math.sqrt(2 * mu / r0);
    const peri0 = v0 >= vc;              // 从近地点出发（否则从远地点出发）
    const w = peri0 ? 0 : Math.PI;       // 近地点方向
    const f0 = peri0 ? 0 : Math.PI;      // 出发点真近点角

    let kind = 'ell';
    if (e > 1.0005) kind = 'hyp';
    else if (e >= 0.9995) kind = 'par';

    /* a = -mu/(2E)：E<0 得椭圆、E>0 得负半长轴（双曲线）、E=0 趋于无穷 */
    const a = Math.abs(E) > 1e-9 ? -mu / (2 * E) : Infinity;
    const n = kind === 'ell' ? Math.sqrt(mu / (a * a * a))
      : (isFinite(a) ? Math.sqrt(mu / Math.pow(-a, 3)) : 0);
    const kpar = Math.sqrt(mu / (2 * p * p * p));
    const rp = p / (1 + e);
    const ra = e < 1 ? p / (1 - e) : Infinity;

    /* 视口半径：远地点不夸张时整条轨道入画，否则只描到 8 r0 */
    const Rview = kind === 'ell' ? Math.min(ra * 1.02, 8.0 * r0) : 3.0 * r0;

    return {
      Mm: Mm, rR: rR, vk: vk, show: show,
      mu: mu, r0: r0, v0: v0, E: E, h: h, e: e, p: p,
      vc: vc, ve: ve, peri0: peri0, w: w, f0: f0,
      kind: kind, a: a, n: n, kpar: kpar, rp: rp, ra: ra,
      Rview: Rview
    };
  }

  /* 由时间求位置与速度（真实秒；t=0 在出发点） */
  function stateAt(m, t) {
    let f, r;
    if (m.kind === 'ell') {
      let Mv = m.f0 + m.n * t;
      Mv = Mv % TAU;
      if (Mv < 0) Mv += TAU;
      const E = solveE(Mv, m.e);
      f = 2 * Math.atan2(Math.sqrt(1 + m.e) * Math.sin(E / 2), Math.sqrt(1 - m.e) * Math.cos(E / 2));
      r = m.a * (1 - m.e * Math.cos(E));
    } else if (m.kind === 'par') {
      const D = solveD(Math.max(0, t) * m.kpar);
      f = 2 * Math.atan(D);
      r = m.p * (1 + D * D) / 2;
    } else {
      const H = solveH(Math.max(0, t) * m.n, m.e);
      const ch = Math.cosh(H);
      const cf = clamp((m.e - ch) / (m.e * ch - 1), -1, 1);
      const sf = (H >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, 1 - cf * cf));
      f = Math.atan2(sf, cf);
      r = m.a * (1 - m.e * ch);
    }
    const eUse = m.kind === 'par' ? 1 : m.e;
    const vr = m.mu / m.h * eUse * Math.sin(f);
    const vt = m.h / r;
    const th = m.w + f;
    const cs = Math.cos(th), sn = Math.sin(th);
    return {
      f: f, r: r,
      x: r * cs, y: r * sn,
      vx: vr * cs - vt * sn,
      vy: vr * sn + vt * cs
    };
  }

  /* 由真近点角求时间（抛物线 / 双曲线） */
  function timeAtF(m, f) {
    if (m.kind === 'hyp') {
      const ch = (m.e + Math.cos(f)) / (1 + m.e * Math.cos(f));
      const H = Math.acosh(Math.max(1, ch)) * (f >= 0 ? 1 : -1);
      return (m.e * Math.sinh(H) - H) / m.n;
    }
    const D = Math.tan(f / 2);
    return (D + D * D * D / 3) / m.kpar;
  }

  /* 半径为 R 处的真近点角（出射支） */
  function fAtR(m, R) {
    return Math.acos(clamp((m.p / R - 1) / m.e, -1, 1));
  }

  /* 一个周期里实际演示的时长：整圈 / 到视口边缘 / 撞地为止 */
  function spanOf(m) {
    let span;
    if (m.kind === 'ell') {
      const full = TAU * Math.sqrt(m.a * m.a * m.a / m.mu);
      if (!m.peri0 || m.ra <= 8.0 * m.r0) span = full;
      else span = meanFromTrue(fAtR(m, m.Rview), m.e) / m.n;
    } else {
      const fmax = m.kind === 'hyp' ? Math.acos(-1 / m.e) : 2.6;
      const fc = Math.min(fAtR(m, m.Rview), fmax * 0.92);
      span = timeAtF(m, fc);
    }
    if (!(span > 0.05)) span = 1;

    /* 近地点在地面以下：从远地点出发会撞地，演示到撞地为止 */
    let tCrash = Infinity;
    if (m.kind === 'ell' && !m.peri0 && m.rp < RE) {
      const cf = clamp((m.p / RE - 1) / m.e, -1, 1);
      const fc = Math.acos(cf);
      const fcross = TAU - fc;
      tCrash = (meanFromTrue(fcross, m.e) - Math.PI) / m.n;
      if (tCrash > 0) span = Math.min(span, tCrash);
    }
    return { span: span, tCrash: tCrash };
  }

  /* 整条圆锥曲线（超出 capR 的点丢掉；画布自己会裁掉画外部分） */
  function orbitPath(m, capR) {
    const out = [], e = m.e, p = m.p, w = m.w;
    if (m.kind === 'ell') {
      for (let i = 0; i <= 260; i++) {
        const f = i / 260 * TAU;
        const r = p / (1 + e * Math.cos(f));
        if (r > 0 && r <= capR) out.push({ x: r * Math.cos(w + f), y: r * Math.sin(w + f) });
      }
    } else {
      const fmax = m.kind === 'hyp' ? Math.acos(-1 / e) : 2.6;
      for (let i = 0; i <= 260; i++) {
        const f = -fmax + 2 * fmax * i / 260;
        const r = p / (1 + e * Math.cos(f));
        if (r > 0 && r <= capR) out.push({ x: r * Math.cos(w + f), y: r * Math.sin(w + f) });
      }
    }
    return out;
  }

  P.emDefine({
    key: 'anim_orbit_motion',
    label: '天体运动',
    dw: DW, dh: DH,
    animatable: true,
    topic: 'orbit',
    base: 'dark',
    params: [
      { key: 'uo_r', label: '轨道半径 r', min: 1.2, max: 8, step: 0.1, def: 2, unit: ' R' },
      { key: 'uo_v', label: '初速度 v', min: 4, max: 14, step: 0.1, def: 6.5, unit: ' km/s' },
      { key: 'uo_M', label: '中心质量 M', min: 0.2, max: 3, step: 0.1, def: 1, unit: ' M' },
      { key: 'uo_showtrail', label: '显示轨迹', min: 0, max: 1, step: 1, def: 1, unit: '', type: 'toggle' }
    ],

    draw(c, o, r) {
      const k = r.k || 1;
      const m = orbitModel(o);
      const sp = spanOf(m);
      const animT = typeof o.animT === 'number' ? o.animT : 0;

      let u = animT / LOOP;
      u -= Math.floor(u);
      let t = u * sp.span;
      if (isFinite(sp.tCrash)) t = Math.min(t, sp.tCrash);
      const st = stateAt(m, t);
      const crashed = t >= sp.tCrash - 1e-9 || (m.kind === 'ell' && m.rp < RE && st.r < RE);

      /* ── 视口：按限制在 Rview 内的轨道点求包围盒，等比塞进左侧绘图区 ── */
      const pts = orbitPath(m, m.Rview);
      let bx0 = 0, bx1 = 0, by0 = 0, by1 = 0;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i];
        if (q.x < bx0) bx0 = q.x;
        if (q.x > bx1) bx1 = q.x;
        if (q.y < by0) by0 = q.y;
        if (q.y > by1) by1 = q.y;
      }
      const pad = 16;
      const bw = Math.max(1e-6, bx1 - bx0), bh = Math.max(1e-6, by1 - by0);
      const s = Math.min((AXX1 - AXX0 - 2 * pad) / bw, (AXY1 - AXY0 - 2 * pad) / bh);
      const cx = (AXX0 + AXX1) / 2 - (bx0 + bx1) / 2 * s;
      const cy = (AXY0 + AXY1) / 2 + (by0 + by1) / 2 * s;
      const X = (x) => cx + x * s;
      const Y = (y) => cy - y * s;
      /* 裁到“天空”区域：逃逸后飞出画面的部分不许画到右侧面板上 */
      c.save();
      c.beginPath();
      c.rect(AXX0, AXY0, AXX1 - AXX0, AXY1 - AXY0);
      c.clip();

      /* ── 1. 等时间扫过的扇形（开普勒第二定律） ── */
      if (t > 1e-6) {
        const N = 44;
        c.save();
        c.fillStyle = GOLD;
        c.globalAlpha = 0.15;
        c.beginPath();
        c.moveTo(X(0), Y(0));
        for (let i = 0; i <= N; i++) {
          const q = stateAt(m, t * i / N);
          c.lineTo(X(q.x), Y(q.y));
        }
        c.closePath();
        c.fill();
        c.globalAlpha = 0.42;
        c.strokeStyle = GOLD;
        c.lineWidth = 1.2 * k;
        c.stroke();
        c.restore();
      }

      /* ── 2. 轨道全貌（虚线）── 只落笔在画布内的点，画外部分自然断开 */
      const capR = m.kind === 'ell' ? 24 * m.r0 : 14 * m.r0;
      const path = orbitPath(m, capR);
      if (path.length > 1) {
        c.save();
        c.strokeStyle = DIM;
        c.globalAlpha = 0.7;
        c.lineWidth = 2 * k;
        c.setLineDash([7 * k, 6 * k]);
        c.lineJoin = 'round';
        c.beginPath();
        let pen = false;
        for (let i = 0; i < path.length; i++) {
          const px = X(path[i].x), py = Y(path[i].y);
          if (px < AXX0 || px > AXX1 || py < AXY0 || py > AXY1) { pen = false; continue; }
          if (pen) c.lineTo(px, py);
          else { c.moveTo(px, py); pen = true; }
        }
        c.stroke();
        c.restore();
      }

      /* ── 3. 出发点所在的参考圆已省去：整圈轨道已用虚线画出，避免双虚线叠画 ── */

      /* ── 4. 中心天体 ── */
      const gx = X(0), gy = Y(0), er = RE * s;
      const grd = c.createRadialGradient(gx - er * 0.35, gy - er * 0.35, er * 0.1, gx, gy, er);
      grd.addColorStop(0, '#8fb4ff');
      grd.addColorStop(1, '#2f5fd0');
      c.save();
      c.fillStyle = grd;
      c.beginPath();
      c.arc(gx, gy, er, 0, TAU);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 2 * k;
      c.stroke();
      c.restore();
      if (er > 26) {
        txt(c, '地球', gx, gy, clamp(er * 0.16, 12, 18), '#ffffff', 'center', SANS, true);
      } else {
        txt(c, '地球', gx, gy + er + 13, 11, DIM, 'center', SANS, false);
      }

      /* ── 5. 已走过的轨迹与卫星 ── */
      if (m.show && t > 1e-6) {
        const N = 150;
        c.save();
        c.strokeStyle = CYAN;
        c.lineWidth = 2.6 * k;
        c.lineJoin = 'round';
        c.lineCap = 'round';
        c.beginPath();
        let first = true;
        for (let i = 0; i <= N; i++) {
          const q = stateAt(m, t * i / N);
          if (q.r < RE) { first = true; continue; }
          if (first) c.moveTo(X(q.x), Y(q.y));
          else c.lineTo(X(q.x), Y(q.y));
          first = false;
        }
        c.stroke();
        c.restore();
      }

      const sx = X(st.x), sy = Y(st.y);
      c.save();
      c.fillStyle = crashed ? '#999999' : GOLD;
      c.strokeStyle = INK;
      c.lineWidth = 1.8 * k;
      c.beginPath();
      c.arc(sx, sy, 6, 0, TAU);
      c.fill();
      c.stroke();
      c.restore();

      /* 速度与引力加速度矢量 */
      if (!crashed) {
        const vn = Math.hypot(st.vx, st.vy) || 1;
        const ux = st.vx / vn, uy = st.vy / vn;
        arrow(c, sx, sy, sx + ux * 46, sy - uy * 46, BLUE, 2.6 * k, 9);
        txt(c, 'v', clamp(sx + ux * 46 + 9, 20, 600), sy - uy * 46 - 9, 14, BLUE, 'left', NUM, true);
        const gdx = gx - sx, gdy = gy - sy, gl = Math.hypot(gdx, gdy) || 1;
        arrow(c, sx, sy, sx + gdx / gl * 30, sy + gdy / gl * 30, RED, 2.4 * k, 8);
        txt(c, 'a', clamp(sx + gdx / gl * 30 + 7, 20, 600), sy + gdy / gl * 30 + 12, 14, RED, 'left', NUM, true);
      } else if (isFinite(sp.tCrash)) {
        txt(c, '坠落', clamp(sx + 12, 40, 590), sy - 12, 12, RED, 'left', SANS, true);
      }

      /* ── 6. 近地点 / 远地点 ── */
      if (m.kind === 'ell' && m.e > 0.02 && !crashed) {
        const items = [
          [m.rp, m.w, '近地点 P'],
          [m.ra, m.w + Math.PI, '远地点 Q']
        ];
        for (let i = 0; i < items.length; i++) {
          const rr2 = items[i][0], ang = items[i][1], name = items[i][2];
          const mx = X(rr2 * Math.cos(ang)), my = Y(rr2 * Math.sin(ang));
          if (mx < AXX0 || mx > AXX1 || my < AXY0 || my > AXY1) continue;
          c.save();
          c.fillStyle = INK;
          c.beginPath();
          c.arc(mx, my, 3.6, 0, TAU);
          c.fill();
          c.restore();
          txt(c, name, clamp(mx + Math.cos(ang) * 58, 84, 596), clamp(my - Math.sin(ang) * 26, 84, 486), 11, DIM, 'center', SANS, false);
        }
      }

      c.restore();

      /* ── 7. 标题 / 读数面板 / 比例尺 / 脚注 ── */
      txt(c, '天体运动', 12, 18, 17, INK, 'left', SANS, true);
      txt(c, 'r = ' + m.rR.toFixed(1) + ' R   v = ' + m.vk.toFixed(1) + ' km/s   M = ' + m.Mm.toFixed(1) + ' M',
        94, 18, 12, DIM, 'left', SANS, false);

      const typ = crashed ? '椭圆（会撞地）'
        : m.kind === 'ell' ? (m.e < 0.01 ? '圆' : '椭圆')
          : m.kind === 'par' ? '抛物线（恰好逃逸）' : '双曲线（逃逸）';
      txt(c, '轨道：' + typ, PX1, 18, 13, crashed ? RED : CYAN, 'right', SANS, true);

      /* 面板底 */
      c.save();
      c.fillStyle = 'rgba(230,237,247,0.04)';
      rr(c, PX0, PY0, PX1 - PX0, PY1 - PY0, 12);
      c.fill();
      c.strokeStyle = DIM;
      c.globalAlpha = 0.38;
      c.lineWidth = 1.4 * k;
      c.stroke();
      c.restore();

      txt(c, '轨道参数', PX0 + 14, PY0 + 24, 13, INK, 'left', SANS, true);

      const vnow = Math.hypot(st.vx, st.vy);
      const T = m.kind === 'ell' ? TAU * Math.sqrt(m.a * m.a * m.a / m.mu) : Infinity;
      const rows = [
        ['中心质量 M', m.Mm.toFixed(1) + ' M'],
        ['偏心率 e', m.e.toFixed(3)],
        ['半长轴 a', m.kind === 'ell' ? (m.a / RE).toFixed(2) + ' R' : '—'],
        ['近地点 r', (m.rp / RE).toFixed(2) + ' R'],
        ['远地点 r', isFinite(m.ra) ? (m.ra / RE).toFixed(2) + ' R' : '∞'],
        ['周期 T', m.kind === 'ell' ? (T / 60).toFixed(1) + ' min' : '不闭合'],
        ['当前速度 v', (vnow / 1000).toFixed(2) + ' km/s'],
        ['扫过面积 S', (0.5 * m.h * t / (RE * RE)).toFixed(2) + ' R²'],
        ['面积速率', (0.5 * m.h * 60 / (RE * RE)).toFixed(2) + ' R²/min']
      ];
      const rows2 = [
        ['比机械能 E/m', (m.E / 1e6).toFixed(2) + ' MJ/kg'],
        ['环绕速度', (m.vc / 1000).toFixed(2) + ' km/s'],
        ['逃逸速度', (m.ve / 1000).toFixed(2) + ' km/s']
      ];
      let ry = PY0 + 50;
      for (let i = 0; i < rows.length; i++) {
        txt(c, rows[i][0], PX0 + 14, ry, 11.5, DIM, 'left', SANS, false);
        txt(c, rows[i][1], PX1 - 14, ry, 12.5, INK, 'right', NUM, false);
        ry += 24;
      }
      c.save();
      c.strokeStyle = DIM;
      c.globalAlpha = 0.32;
      c.lineWidth = 1.2 * k;
      c.beginPath();
      c.moveTo(PX0 + 14, ry - 10);
      c.lineTo(PX1 - 14, ry - 10);
      c.stroke();
      c.restore();
      for (let i = 0; i < rows2.length; i++) {
        txt(c, rows2[i][0], PX0 + 14, ry, 11.5, DIM, 'left', SANS, false);
        txt(c, rows2[i][1], PX1 - 14, ry, 12.5, INK, 'right', NUM, false);
        ry += 24;
      }

      txt(c, '开普勒第二定律：等时间', PX0 + 14, PY1 - 62, 11, GOLD, 'left', SANS, false);
      txt(c, '扫过的面积相等（S 与 t 成正比）', PX0 + 14, PY1 - 42, 11, GOLD, 'left', SANS, false);

      /* 比例尺（右下） */
      let bar = RE, bl = '1 R（6371 km）';
      if (RE * s > 150) { bar = RE / 2; bl = '0.5 R'; }
      if (RE * s < 26) { bar = 2 * RE; bl = '2 R'; }
      const sbx1 = 846, sbx0 = sbx1 - Math.max(28, bar * s), bby = 532;
      c.save();
      c.strokeStyle = INK;
      c.lineWidth = 2 * k;
      c.beginPath();
      c.moveTo(sbx0, bby);
      c.lineTo(sbx1, bby);
      c.moveTo(sbx0, bby - 6);
      c.lineTo(sbx0, bby + 6);
      c.moveTo(sbx1, bby - 6);
      c.lineTo(sbx1, bby + 6);
      c.stroke();
      c.restore();
      txt(c, bl, sbx1, bby - 16, 11, DIM, 'right', SANS, false);

      txt(c, 'v 决定轨道形状：圆 / 椭圆 / 抛物线 / 双曲线', 12, 547, 12, DIM, 'left', SANS, false);
    }
  });
})();

/* ── em_ammeter.js ── */
/* 电流表（可调） —— 移植自「电流表-可调参.html」，深色霓虹底板 + 半圆表盘 */
(function () {
  'use strict';
  const P = window.GW.physShapes;

  /* ===== 表盘配置：只改这里就能换表 ===== */
  const CFG = {
    sym: 'A',
    outer: ['0', '1', '2', '3'],
    inner: ['0', '0.2', '0.4', '0.6'],
    div: 30,
    t0: 0.66,
  };

  const A0 = 153, A1 = 27, SPAN = A0 - A1, D2R = Math.PI / 180;
  const INK = '#e6edf7', DIM = '#8fa3c0', ACC = '#f59e0b';
  const FRAC = [0, 1 / 3, 2 / 3, 1];
  const NUM = '"Times New Roman",Georgia,"Songti SC",serif';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function rr(c, x, y, w, h, rad) {
    const rd = Math.max(0, Math.min(rad, Math.min(w, h) / 2));
    c.beginPath();
    c.moveTo(x + rd, y);
    c.lineTo(x + w - rd, y);
    c.arcTo(x + w, y, x + w, y + rd, rd);
    c.lineTo(x + w, y + h - rd);
    c.arcTo(x + w, y + h, x + w - rd, y + h, rd);
    c.lineTo(x + rd, y + h);
    c.arcTo(x, y + h, x, y + h - rd, rd);
    c.lineTo(x, y + rd);
    c.arcTo(x, y, x + rd, y, rd);
    c.closePath();
  }

  /* ===== 深色底板：圆角 + 径向渐变 + 网格 + 描边（照抄原页面 body 观感） ===== */
  function plate(c, o, r) {
    const W = r.w, H = r.h, k = r.k || 1;
    if (!(W > 2) || !(H > 2)) return;
    const rad = Math.min(W, H) * 0.036;
    const MAXD = Math.hypot(W * 0.5, H * 0.45) || 1;

    c.save();
    rr(c, 0, 0, W, H, rad);
    c.clip();

    /* 底色：#060c18 → #0a1428 → #0b1020（原 body 的 linear-gradient 改成径向） */
    let g = c.createRadialGradient(W * 0.46, H * 0.40, 0, W * 0.46, H * 0.40, Math.max(W, H) * 0.82);
    g.addColorStop(0, '#0a1428');
    g.addColorStop(0.55, '#081120');
    g.addColorStop(1, '#060c18');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    /* 左上青色、右下靛色两团柔光（原 body 的两处 radial-gradient） */
    g = c.createRadialGradient(W * 0.18, H * 0.12, 0, W * 0.18, H * 0.12, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(56,189,248,0.22)');
    g.addColorStop(1, 'rgba(56,189,248,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    g = c.createRadialGradient(W * 0.82, H * 0.88, 0, W * 0.82, H * 0.88, Math.max(W, H) * 0.60);
    g.addColorStop(0, 'rgba(129,140,248,0.20)');
    g.addColorStop(1, 'rgba(129,140,248,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    /* 网格：52px，amber 3.5% 透明（原 body::before） */
    c.strokeStyle = 'rgba(245,190,120,0.035)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 52; x < W; x += 52) {
      const xx = Math.round(x) + 0.5;
      c.moveTo(xx, 0); c.lineTo(xx, H);
    }
    for (let y = 52; y < H; y += 52) {
      const yy = Math.round(y) + 0.5;
      c.moveTo(0, yy); c.lineTo(W, yy);
    }
    c.stroke();

    /* 网格向外淡出（原 mask-image: radial-gradient(circle at 50% 45%, #000 55%, transparent)） */
    g = c.createRadialGradient(W * 0.5, H * 0.45, MAXD * 0.55, W * 0.5, H * 0.45, MAXD);
    g.addColorStop(0, 'rgba(7,13,26,0)');
    g.addColorStop(1, 'rgba(7,13,26,0.94)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.restore();

    /* 描边：一圈暖色细边 */
    c.save();
    rr(c, 0.5, 0.5, W - 1, H - 1, rad);
    c.lineWidth = 1.4 * k;
    c.strokeStyle = 'rgba(245,190,120,0.20)';
    c.stroke();
    c.restore();
  }

  P.emDefine({
    key: 'em_ammeter',
    label: '电流表（可调）',
    dw: 760,
    dh: 520,
    animatable: false,
    params: [
      { key: 'ema_t', label: '指针位置', min: 0, max: 1000, step: 1, def: 660, unit: '' },
    ],

    draw(c, o, r) {
      const W = r.w, H = r.h, k = r.k || 1;
      /* 1.1.7：不画底板 —— 画布即背景（深色页面由宿主把墨色换成浅墨） */

      /* ===== 布局：内容包围盒推导（原 layout()，Hc 不再扣滑杆 64px） ===== */
      const Hc = H;
      const R = Math.min(W * 0.96 / 2.42, Hc * 0.92 / 1.52);
      const px = W / 2, py = Hc / 2 + R * 0.6175;
      const lw = clamp(R * 0.0105, 2.8, 5.6);
      const fs = clamp(R * 0.155, 16, 76);
      if (!(R > 1) || !isFinite(R)) return;

      const p = (rr0, ad) => {
        const a = ad * D2R;
        return [px + rr0 * Math.cos(a), py - rr0 * Math.sin(a)];
      };
      const ang = (i) => A0 - SPAN * i;

      /* 滑杆 0..1000 → 指针 0..1（原 sld.value/1000） */
      const v = o && isFinite(o.ema_t) ? (+o.ema_t) / 1000 : CFG.t0;
      const t = clamp(isFinite(v) ? v : CFG.t0, 0, 1);

      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';

      /* 主弧 */
      c.beginPath();
      c.arc(px, py, R, -A0 * D2R, -A1 * D2R, false);
      c.lineWidth = lw * k;
      c.strokeStyle = INK;
      c.stroke();

      /* 两端短横杠 */
      for (let e = 0; e < 2; e++) {
        const ae = ang(e), q1 = p(R * 0.88, ae), q2 = p(R * 1.16, ae);
        c.beginPath(); c.moveTo(q1[0], q1[1]); c.lineTo(q2[0], q2[1]);
        c.lineWidth = lw * k;
        c.strokeStyle = INK;
        c.stroke();
      }

      /* 刻度线：每 10 格长、每 5 格中、其余短 */
      const N = CFG.div;
      for (let i = 0; i <= N; i++) {
        const major = (i % 10 === 0), mid = (i % 5 === 0);
        const len = (major ? 0.152 : (mid ? 0.112 : 0.068)) * R;
        const a = ang(i / N);
        const qa = p(R, a), qb = p(R + len, a);
        c.beginPath(); c.moveTo(qa[0], qa[1]); c.lineTo(qb[0], qb[1]);
        c.lineWidth = (major ? lw * 1.15 : (mid ? lw : lw * 0.85)) * k;
        c.strokeStyle = INK;
        c.stroke();
      }

      /* 数字：外圈粗读数、内圈细读数 */
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = fs + 'px ' + NUM;
      c.fillStyle = INK;
      for (let i = 0; i < FRAC.length; i++) {
        const a = ang(FRAC[i]), qa = p(R * 1.30, a);
        c.fillText(CFG.outer[i], qa[0], qa[1]);
      }
      c.font = (fs * 0.92) + 'px ' + NUM;
      c.fillStyle = DIM;
      for (let i = 0; i < FRAC.length; i++) {
        const a = ang(FRAC[i]), qa = p(R * 0.775, a);
        c.fillText(CFG.inner[i], qa[0], qa[1]);
      }

      /* 表符：圆心正上方、刻度正下方 */
      c.font = (fs * 1.15) + 'px ' + NUM;
      c.fillStyle = DIM;
      c.fillText(CFG.sym, px, py - R * 0.352);

      /* 指针 */
      const a = ang(t);
      const ux = Math.cos(a * D2R), uy = -Math.sin(a * D2R);
      const tipx = px + R * 0.998 * ux, tipy = py + R * 0.998 * uy;
      const tlx = px - R * 0.120 * ux, tly = py - R * 0.120 * uy;
      c.beginPath(); c.moveTo(tlx, tly); c.lineTo(tipx, tipy);
      c.lineWidth = Math.max(2.2, lw * 0.62) * k;
      c.strokeStyle = ACC;
      c.stroke();

      /* 箭头 */
      const bx = px + R * 0.878 * ux, by = py + R * 0.878 * uy, hw = R * 0.0235;
      c.beginPath();
      c.moveTo(tipx, tipy);
      c.lineTo(bx + hw * (-uy), by + hw * ux);
      c.lineTo(bx - hw * (-uy), by - hw * ux);
      c.closePath();
      c.fillStyle = ACC;
      c.fill();

      /* 转轴 + 表符 */
      c.beginPath();
      c.arc(px, py, R * 0.026, 0, Math.PI * 2);
      c.fillStyle = ACC;
      c.fill();

      c.restore();
    },
  });
})();

/* ── em_ammeter_in.js ── */
/* 电流表内接法（局部电路） —— 逐行移植自 批量高中物理html/测Rx电流表内接.html
   源文件是 600×350 的 SVG：导线 stroke-width 4、圆角连接与端点、Times New Roman 三处标签
   （V / A 正体、Rx 斜体带下标）、两个黑色接点圆点。这里按 viewBox 等比缩放整幅画进图形框，
   元件坐标、线宽、字号、引线折点、接点半径全部照搬，一个数字都没有改。
   静态素材：无滑杆、无按钮、无动画，params 为空数组。 */
(function () {
  'use strict';
  const P = window.GW.physShapes;
  P.emDefine({
    key: 'em_ammeter_in',
    label: '电流表内接法（局部电路）',
    dw: 600, dh: 350,
    animatable: false,
    params: [],
    draw(c, o, r) {
      const W = r.w, H = r.h, k = r.k || 1;
      const VB = { w: 600, h: 350 };                 // 源文件 viewBox
      const s = Math.min(W / VB.w, H / VB.h);
      if (!(s > 0) || !isFinite(s)) return;
      const ox = (W - VB.w * s) / 2, oy = (H - VB.h * s) / 2;

      const COLOR = '#15171a';                       // 源文件 stroke="black"
      const LW = 4 * k;                              // 源文件 stroke-width="4"
      const SERIF = '"Times New Roman", Times, serif';

      c.save();
      c.translate(ox, oy);
      c.scale(s, s);                                 // 之后一律用源文件的 SVG 坐标
      c.lineCap = 'round';                           // stroke-linecap="round"
      c.lineJoin = 'round';                          // stroke-linejoin="round"
      c.strokeStyle = COLOR;
      c.fillStyle = COLOR;

      const seg = function (a, b, d, e) {
        c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.lineWidth = LW; c.stroke();
      };
      const poly = function (pts) {
        c.beginPath();
        for (let i = 0; i < pts.length; i += 2) { if (i) c.lineTo(pts[i], pts[i + 1]); else c.moveTo(pts[i], pts[i + 1]); }
        c.lineWidth = LW; c.stroke();
      };
      const ring = function (x, y, rad) {
        c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.lineWidth = LW; c.stroke();
      };
      const dot = function (x, y, rad) {
        c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
      };
      const txt = function (str, x, y, size, italic) {
        c.font = (italic ? 'italic ' : '') + size + 'px ' + SERIF;
        c.textAlign = 'center'; c.textBaseline = 'alphabetic';
        c.fillText(str, x, y);
      };

      /* ---- 导线：主线（电阻与电流表处留缺口） ---- */
      seg(50, 250, 150, 250);
      seg(300, 250, 400, 250);
      seg(500, 250, 550, 250);
      /* ---- 电压表支路：左折线 / 右折线 ---- */
      poly([100, 250, 100, 100, 260, 100]);
      poly([360, 100, 520, 100, 520, 250]);

      /* ---- 元件 ---- */
      c.lineWidth = LW;
      c.strokeRect(150, 230, 150, 40);               // 电阻 Rx（x=150 y=230 w=150 h=40）
      ring(310, 100, 50);                            // 电压表 V
      ring(450, 250, 50);                            // 电流表 A

      /* ---- 接点 ---- */
      dot(100, 250, 8);
      dot(520, 250, 8);

      /* ---- 标签 ---- */
      txt('V', 310, 120, 60, false);
      txt('A', 450, 270, 60, false);
      (function () {
        c.font = 'italic 60px ' + SERIF;
        const w1 = c.measureText('R').width;
        c.font = 'italic 36px ' + SERIF;
        const w2 = c.measureText('x').width;
        const bx = 225 - (w1 + w2) / 2;              // 源文件 text-anchor="middle" @ x=225
        c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        c.font = 'italic 60px ' + SERIF; c.fillText('R', bx, 200);
        c.font = 'italic 36px ' + SERIF; c.fillText('x', bx + w1, 200 + 36 * 0.28);
      })();

      c.restore();
    },
  });
})();

/* ── em_ammeter_out.js ── */
/* 电流表外接法（局部电路） —— 逐行移植自 批量高中物理html/测Rx电流表外接.html
   源文件是 900×550 的 SVG（显示尺寸 800×480）：导线 stroke-width 6、圆角连接、Times New Roman
   三处标签（V / A 正体、Rx 斜体带下标）、两个半径 12 的黑色接点。这里按 viewBox 等比缩放，
   元件坐标、线宽、字号、引线折点、接点半径全部照搬。
   静态素材：无滑杆、无按钮、无动画，params 为空数组。 */
(function () {
  'use strict';
  const P = window.GW.physShapes;
  P.emDefine({
    key: 'em_ammeter_out',
    label: '电流表外接法（局部电路）',
    dw: 900, dh: 550,
    animatable: false,
    params: [],
    draw(c, o, r) {
      const W = r.w, H = r.h, k = r.k || 1;
      const VB = { w: 900, h: 550 };                 // 源文件 viewBox
      const s = Math.min(W / VB.w, H / VB.h);
      if (!(s > 0) || !isFinite(s)) return;
      const ox = (W - VB.w * s) / 2, oy = (H - VB.h * s) / 2;

      const COLOR = '#15171a';                       // 源文件 stroke="black"
      const LW = 6 * k;                              // 源文件 stroke-width="6"
      const SERIF = '"Times New Roman", Times, serif';

      c.save();
      c.translate(ox, oy);
      c.scale(s, s);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = COLOR;
      c.fillStyle = COLOR;

      const seg = function (a, b, d, e) {
        c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.lineWidth = LW; c.stroke();
      };
      const poly = function (pts) {
        c.beginPath();
        for (let i = 0; i < pts.length; i += 2) { if (i) c.lineTo(pts[i], pts[i + 1]); else c.moveTo(pts[i], pts[i + 1]); }
        c.lineWidth = LW; c.stroke();
      };
      const ring = function (x, y, rad) {
        c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.lineWidth = LW; c.stroke();
      };
      const dot = function (x, y, rad) {
        c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
      };
      const txt = function (str, x, y, size, italic) {
        c.font = (italic ? 'italic ' : '') + size + 'px ' + SERIF;
        c.textAlign = 'center'; c.textBaseline = 'alphabetic';
        c.fillText(str, x, y);
      };

      /* ---- 导线：底部主线在电阻与电流表处留缺口 ---- */
      seg(20, 420, 100, 420);
      seg(100, 420, 200, 420);
      seg(480, 420, 550, 420);
      seg(550, 420, 615, 420);
      seg(745, 420, 880, 420);
      /* ---- 电压表支路 ---- */
      poly([100, 420, 100, 120, 255, 120]);
      poly([385, 120, 550, 120, 550, 420]);

      /* ---- 元件 ---- */
      c.lineWidth = LW;
      c.strokeRect(200, 390, 280, 60);               // 电阻 Rx（x=200 y=390 w=280 h=60）
      ring(320, 120, 65);                            // 电压表 V
      ring(680, 420, 65);                            // 电流表 A

      /* ---- 接点 ---- */
      dot(100, 420, 12);
      dot(550, 420, 12);

      /* ---- 标签 ---- */
      txt('V', 320, 150, 85, false);
      txt('A', 680, 450, 85, false);
      (function () {
        c.font = 'italic 85px ' + SERIF;
        const w1 = c.measureText('R').width;
        c.font = 'italic 55px ' + SERIF;
        const w2 = c.measureText('x').width;
        const bx = 340 - (w1 + w2) / 2;              // 源文件 text-anchor="middle" @ x=340
        c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        c.font = 'italic 85px ' + SERIF; c.fillText('R', bx, 345);
        c.font = 'italic 55px ' + SERIF; c.fillText('x', bx + w1, 345 + 55 * 0.28);
      })();

      c.restore();
    },
  });
})();

/* ── em_caliper10.js ── */
/* 游标卡尺（10 分度）—— 移植自「游标卡尺读数-10分度.html」的 draw()
   设计画布 900×330（原页面是很扁的横条），白底透明、无底板。
   改动只有四处：W/H/reserve→r.w/r.h（reserve=0）、S.v→o.emcal10_v、删掉 dpr 与整幅清除、lineWidth 乘 r.k。 */
(function () {
  'use strict';
  const P = window.GW.physShapes;

  const N = 10;                       /* 分度 */
  const VMAX = 30;                    /* 量程 mm */
  const INK = '#15171a', ACC = '#d5382c', ZERO = '#1a6fd4';
  const SER = '"Times New Roman",Georgia,"Songti SC",SimSun,serif';

  P.emDefine({
    key: 'em_caliper10',
    label: '游标卡尺（10 分度）',
    dw: 900,
    dh: 330,
    animatable: false,
    params: [
      { key: 'emcal10_v', label: '平移游标尺', min: 0, max: VMAX, step: 1 / N, def: 12.3, unit: ' mm' },
    ],
    draw(c, o, r) {
      const W = r.w, H = r.h;
      const LW = 2;
      const VDIV = (N - 1) / N;
      const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
      const ln = (x1, y1, x2, y2, w) => {
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
        c.lineWidth = (w || LW) * r.k; c.strokeStyle = INK; c.stroke();
      };
      const num = (s, x, y, size, align, base, col) => {
        c.font = size.toFixed(1) + 'px ' + SER;
        c.fillStyle = col || INK;
        c.textAlign = align || 'center';
        c.textBaseline = base || 'middle';
        c.fillText(s, x, y);
      };

      c.lineJoin = 'round'; c.lineCap = 'round';

      /* 游标读数（10 分度 = 0.1 mm 一格），范围与源页面滑杆一致 */
      const raw = +o.emcal10_v;
      const v = clamp(Math.round((isFinite(raw) ? raw : 12.3) * N) / N, 0, VMAX);

      const pad = Math.max(16, Math.min(W, H) * 0.04);
      const availW = W - 2 * pad;
      let availH = H - pad;                       /* reserve = 0：原页面底部给滑杆面板留的高度去掉 */
      if (availH < 160) availH = 160;

      /* 可见跨度：游标全长 + 两边余量，且不少于 28 mm */
      const span = Math.max(N - 1 + 12, 28);
      const XL = Math.max(5, (span - (N - 1)) / 2);
      const pp = availW / span;
      const cx0 = pad;
      const X = (mm) => cx0 + (mm - (v - XL)) * pp;
      const X0 = X(v);
      const fs = clamp(Math.min(availH * 0.048, pp * 1.25), 11, 34);
      const yM = H / 2 + pad * 0.4;

      const hh1 = Math.min(availH * 0.25, Math.max(pp * 1.9, availH * 0.055));
      const hh2 = Math.min(availH * 0.20, Math.max(pp * 1.4, availH * 0.045));

      /* ── 主尺（整毫米刻线向上） ── */
      const step = (pp * 5 >= fs * 2.9) ? 5 : 10;
      const m0 = Math.ceil(v - XL), m1 = Math.floor(v + span - XL);
      for (let m = m0; m <= m1; m++) {
        const xm = X(m);
        if (xm < pad - 1 || xm > W - pad + 1) continue;
        const isCm = (m % 10 === 0), is5 = (m % 5 === 0);
        ln(xm, yM - (isCm ? hh1 : (is5 ? hh1 * 0.72 : hh1 * 0.46)), xm, yM, isCm ? LW * 1.15 : LW * 0.85);
        if (isCm && step === 10) num(String(m), xm, yM - hh1 - fs * 0.66, fs, 'center', 'bottom');
        else if (step === 5 && is5) num(String(m), xm, yM - hh1 - fs * 0.66, fs, 'center', 'bottom');
      }
      /* 基准线 */
      ln(pad, yM, W - pad, yM, LW * 1.2);

      /* ── 游标（刻线向下） ── */
      const labJ = (VDIV * pp * 5 >= fs * 2.9) ? 5 : 10;
      const kAl = Math.round((v - Math.floor(v)) * N) % N;   /* 与主尺刻线重合的游标格 */
      for (let j = 0; j <= N; j++) {
        const Xj = X0 + j * VDIV * pp;
        if (Xj > W - pad + 1) break;
        const isL = (j % 5 === 0), is0 = (j === 0);
        const h = (is0 ? hh2 * 1.45 : (isL ? hh2 : hh2 * 0.66));
        ln(Xj, yM, Xj, yM + h, is0 ? LW * 1.15 : (isL ? LW * 0.95 : LW * 0.8));
        if (isL && j % labJ === 0 && j !== 0 && j !== kAl) num(String(j), Xj, yM + hh2 * 1.45 + fs * 0.62, fs, 'center', 'top');
      }
      /* 游标零线向上延一点，便于对准主尺 */
      ln(X0, yM - hh1 * 0.36, X0, yM, LW * 0.9);

      /* ── 彩色标记：游标零刻线（蓝）、与主尺重合的那条线（红） ── */
      const yvL = yM + hh2 * 1.45, yTop = yM - hh1 * 0.22;
      c.strokeStyle = ZERO; c.lineWidth = LW * 1.25 * r.k;
      c.beginPath(); c.moveTo(X0, yTop); c.lineTo(X0, yvL); c.stroke();
      num('0', X0, yM + hh2 * 1.45 + fs * 0.62, fs, 'center', 'top', ZERO);
      if (kAl > 0) {
        const xa = X0 + kAl * VDIV * pp;
        if (xa <= W - pad + 1) {
          c.strokeStyle = ACC; c.lineWidth = LW * 1.25 * r.k;
          c.beginPath(); c.moveTo(xa, yM); c.lineTo(xa, yvL); c.stroke();
          num(String(kAl), xa, yM + hh2 * 1.45 + fs * 0.62, fs, 'center', 'top', ACC);
        }
      }
    },
  });
})();

/* ── em_caliper20.js ── */
/* 游标卡尺（20 分度）—— 移植自「游标卡尺读数-20分度.html」的 draw()
   设计画布 900×330（原页面是很扁的横条），白底透明、无底板。
   改动只有四处：W/H/reserve→r.w/r.h（reserve=0）、S.v→o.emcal20_v、删掉 dpr 与整幅清除、lineWidth 乘 r.k。 */
(function () {
  'use strict';
  const P = window.GW.physShapes;

  const N = 20;                       /* 分度 */
  const VMAX = 30;                    /* 量程 mm */
  const INK = '#15171a', ACC = '#d5382c', ZERO = '#1a6fd4';
  const SER = '"Times New Roman",Georgia,"Songti SC",SimSun,serif';

  P.emDefine({
    key: 'em_caliper20',
    label: '游标卡尺（20 分度）',
    dw: 900,
    dh: 330,
    animatable: false,
    params: [
      { key: 'emcal20_v', label: '平移游标尺', min: 0, max: VMAX, step: 1 / N, def: 12.35, unit: ' mm' },
    ],
    draw(c, o, r) {
      const W = r.w, H = r.h;
      const LW = 2;
      const VDIV = (N - 1) / N;
      const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
      const ln = (x1, y1, x2, y2, w) => {
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
        c.lineWidth = (w || LW) * r.k; c.strokeStyle = INK; c.stroke();
      };
      const num = (s, x, y, size, align, base, col) => {
        c.font = size.toFixed(1) + 'px ' + SER;
        c.fillStyle = col || INK;
        c.textAlign = align || 'center';
        c.textBaseline = base || 'middle';
        c.fillText(s, x, y);
      };

      c.lineJoin = 'round'; c.lineCap = 'round';

      /* 游标读数（20 分度 = 0.05 mm 一格），范围与源页面滑杆一致 */
      const raw = +o.emcal20_v;
      const v = clamp(Math.round((isFinite(raw) ? raw : 12.35) * N) / N, 0, VMAX);

      const pad = Math.max(16, Math.min(W, H) * 0.04);
      const availW = W - 2 * pad;
      let availH = H - pad;                       /* reserve = 0：原页面底部给滑杆面板留的高度去掉 */
      if (availH < 160) availH = 160;

      /* 可见跨度：游标全长 + 两边余量，且不少于 28 mm */
      const span = Math.max(N - 1 + 12, 28);
      const XL = Math.max(5, (span - (N - 1)) / 2);
      const pp = availW / span;
      const cx0 = pad;
      const X = (mm) => cx0 + (mm - (v - XL)) * pp;
      const X0 = X(v);
      const fs = clamp(Math.min(availH * 0.048, pp * 1.25), 11, 34);
      const yM = H / 2 + pad * 0.4;

      const hh1 = Math.min(availH * 0.25, Math.max(pp * 1.9, availH * 0.055));
      const hh2 = Math.min(availH * 0.20, Math.max(pp * 1.4, availH * 0.045));

      /* ── 主尺（整毫米刻线向上） ── */
      const step = (pp * 5 >= fs * 2.9) ? 5 : 10;
      const m0 = Math.ceil(v - XL), m1 = Math.floor(v + span - XL);
      for (let m = m0; m <= m1; m++) {
        const xm = X(m);
        if (xm < pad - 1 || xm > W - pad + 1) continue;
        const isCm = (m % 10 === 0), is5 = (m % 5 === 0);
        ln(xm, yM - (isCm ? hh1 : (is5 ? hh1 * 0.72 : hh1 * 0.46)), xm, yM, isCm ? LW * 1.15 : LW * 0.85);
        if (isCm && step === 10) num(String(m), xm, yM - hh1 - fs * 0.66, fs, 'center', 'bottom');
        else if (step === 5 && is5) num(String(m), xm, yM - hh1 - fs * 0.66, fs, 'center', 'bottom');
      }
      /* 基准线 */
      ln(pad, yM, W - pad, yM, LW * 1.2);

      /* ── 游标（刻线向下） ── */
      const labJ = (VDIV * pp * 5 >= fs * 2.9) ? 5 : 10;
      const kAl = Math.round((v - Math.floor(v)) * N) % N;   /* 与主尺刻线重合的游标格 */
      for (let j = 0; j <= N; j++) {
        const Xj = X0 + j * VDIV * pp;
        if (Xj > W - pad + 1) break;
        const isL = (j % 5 === 0), is0 = (j === 0);
        const h = (is0 ? hh2 * 1.45 : (isL ? hh2 : hh2 * 0.66));
        ln(Xj, yM, Xj, yM + h, is0 ? LW * 1.15 : (isL ? LW * 0.95 : LW * 0.8));
        if (isL && j % labJ === 0 && j !== 0 && j !== kAl) num(String(j), Xj, yM + hh2 * 1.45 + fs * 0.62, fs, 'center', 'top');
      }
      /* 游标零线向上延一点，便于对准主尺 */
      ln(X0, yM - hh1 * 0.36, X0, yM, LW * 0.9);

      /* ── 彩色标记：游标零刻线（蓝）、与主尺重合的那条线（红） ── */
      const yvL = yM + hh2 * 1.45, yTop = yM - hh1 * 0.22;
      c.strokeStyle = ZERO; c.lineWidth = LW * 1.25 * r.k;
      c.beginPath(); c.moveTo(X0, yTop); c.lineTo(X0, yvL); c.stroke();
      num('0', X0, yM + hh2 * 1.45 + fs * 0.62, fs, 'center', 'top', ZERO);
      if (kAl > 0) {
        const xa = X0 + kAl * VDIV * pp;
        if (xa <= W - pad + 1) {
          c.strokeStyle = ACC; c.lineWidth = LW * 1.25 * r.k;
          c.beginPath(); c.moveTo(xa, yM); c.lineTo(xa, yvL); c.stroke();
          num(String(kAl), xa, yM + hh2 * 1.45 + fs * 0.62, fs, 'center', 'top', ACC);
        }
      }
    },
  });
})();

/* ── em_caliper50.js ── */
/* 游标卡尺（50 分度）—— 移植自「游标卡尺读数-50分度.html」的 draw()
   设计画布 900×330（原页面是很扁的横条），白底透明、无底板。
   改动只有四处：W/H/reserve→r.w/r.h（reserve=0）、S.v→o.emcal50_v、删掉 dpr 与整幅清除、lineWidth 乘 r.k。 */
(function () {
  'use strict';
  const P = window.GW.physShapes;

  const N = 50;                       /* 分度 */
  const VMAX = 30;                    /* 量程 mm */
  const INK = '#15171a', ACC = '#d5382c', ZERO = '#1a6fd4';
  const SER = '"Times New Roman",Georgia,"Songti SC",SimSun,serif';

  P.emDefine({
    key: 'em_caliper50',
    label: '游标卡尺（50 分度）',
    dw: 900,
    dh: 330,
    animatable: false,
    params: [
      { key: 'emcal50_v', label: '平移游标尺', min: 0, max: VMAX, step: 1 / N, def: 12.34, unit: ' mm' },
    ],
    draw(c, o, r) {
      const W = r.w, H = r.h;
      const LW = 2;
      const VDIV = (N - 1) / N;
      const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
      const ln = (x1, y1, x2, y2, w) => {
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
        c.lineWidth = (w || LW) * r.k; c.strokeStyle = INK; c.stroke();
      };
      const num = (s, x, y, size, align, base, col) => {
        c.font = size.toFixed(1) + 'px ' + SER;
        c.fillStyle = col || INK;
        c.textAlign = align || 'center';
        c.textBaseline = base || 'middle';
        c.fillText(s, x, y);
      };

      c.lineJoin = 'round'; c.lineCap = 'round';

      /* 游标读数（50 分度 = 0.02 mm 一格），范围与源页面滑杆一致 */
      const raw = +o.emcal50_v;
      const v = clamp(Math.round((isFinite(raw) ? raw : 12.34) * N) / N, 0, VMAX);

      const pad = Math.max(16, Math.min(W, H) * 0.04);
      const availW = W - 2 * pad;
      let availH = H - pad;                       /* reserve = 0：原页面底部给滑杆面板留的高度去掉 */
      if (availH < 160) availH = 160;

      /* 可见跨度：游标全长 + 两边余量，且不少于 28 mm */
      const span = Math.max(N - 1 + 12, 28);
      const XL = Math.max(5, (span - (N - 1)) / 2);
      const pp = availW / span;
      const cx0 = pad;
      const X = (mm) => cx0 + (mm - (v - XL)) * pp;
      const X0 = X(v);
      const fs = clamp(Math.min(availH * 0.048, pp * 1.25), 11, 34);
      const yM = H / 2 + pad * 0.4;

      const hh1 = Math.min(availH * 0.25, Math.max(pp * 1.9, availH * 0.055));
      const hh2 = Math.min(availH * 0.20, Math.max(pp * 1.4, availH * 0.045));

      /* ── 主尺（整毫米刻线向上） ── */
      const step = (pp * 5 >= fs * 2.9) ? 5 : 10;
      const m0 = Math.ceil(v - XL), m1 = Math.floor(v + span - XL);
      for (let m = m0; m <= m1; m++) {
        const xm = X(m);
        if (xm < pad - 1 || xm > W - pad + 1) continue;
        const isCm = (m % 10 === 0), is5 = (m % 5 === 0);
        ln(xm, yM - (isCm ? hh1 : (is5 ? hh1 * 0.72 : hh1 * 0.46)), xm, yM, isCm ? LW * 1.15 : LW * 0.85);
        if (isCm && step === 10) num(String(m), xm, yM - hh1 - fs * 0.66, fs, 'center', 'bottom');
        else if (step === 5 && is5) num(String(m), xm, yM - hh1 - fs * 0.66, fs, 'center', 'bottom');
      }
      /* 基准线 */
      ln(pad, yM, W - pad, yM, LW * 1.2);

      /* ── 游标（刻线向下） ── */
      const labJ = (VDIV * pp * 5 >= fs * 2.9) ? 5 : 10;
      const kAl = Math.round((v - Math.floor(v)) * N) % N;   /* 与主尺刻线重合的游标格 */
      for (let j = 0; j <= N; j++) {
        const Xj = X0 + j * VDIV * pp;
        if (Xj > W - pad + 1) break;
        const isL = (j % 5 === 0), is0 = (j === 0);
        const h = (is0 ? hh2 * 1.45 : (isL ? hh2 : hh2 * 0.66));
        ln(Xj, yM, Xj, yM + h, is0 ? LW * 1.15 : (isL ? LW * 0.95 : LW * 0.8));
        if (isL && j % labJ === 0 && j !== 0 && j !== kAl) num(String(j), Xj, yM + hh2 * 1.45 + fs * 0.62, fs, 'center', 'top');
      }
      /* 游标零线向上延一点，便于对准主尺 */
      ln(X0, yM - hh1 * 0.36, X0, yM, LW * 0.9);

      /* ── 彩色标记：游标零刻线（蓝）、与主尺重合的那条线（红） ── */
      const yvL = yM + hh2 * 1.45, yTop = yM - hh1 * 0.22;
      c.strokeStyle = ZERO; c.lineWidth = LW * 1.25 * r.k;
      c.beginPath(); c.moveTo(X0, yTop); c.lineTo(X0, yvL); c.stroke();
      num('0', X0, yM + hh2 * 1.45 + fs * 0.62, fs, 'center', 'top', ZERO);
      if (kAl > 0) {
        const xa = X0 + kAl * VDIV * pp;
        if (xa <= W - pad + 1) {
          c.strokeStyle = ACC; c.lineWidth = LW * 1.25 * r.k;
          c.beginPath(); c.moveTo(xa, yM); c.lineTo(xa, yvL); c.stroke();
          num(String(kAl), xa, yM + hh2 * 1.45 + fs * 0.62, fs, 'center', 'top', ACC);
        }
      }
    },
  });
})();

/* ── em_divider.js ── */
/* 分压式接法（电流表内接 / 外接）—— 移植自「批量高中物理html/已导入/分压式-内外接.html」
   白底透明（源页面 body 就是 #fff / nobg），不铺 plate。
   源页面按 TOPOLOGY='div' 画：画幅比 fh/fw = 0.80。设计画布 700×583。 */
(function () {
  'use strict';

  var PS = window.GW.physShapes;
  var INK = '#15171a';
  var SER = '"Times New Roman", Georgia, "Songti SC", SimSun, serif';

  /* 源页面的 fit() 用 availW = W-32、fy = (availH-fh)/2+4 排版，图形本体只占 u∈[U0,U1]、v∈[V0,V1]；
     直接照搬会空出 8% 以上的边（宿主按 min(w/dw,h/dh) 缩放，白边就是缩小）。这里把这三个数
     固定下来当「图形外接框」，再把外接框居中填满设计画布 —— 只换坐标映射，图里一个像素都没改。
     V0 = 电压表圆顶（yVr - rV/fh），V1 = 电源长极板下沿（yB2 + 0.050）。 */
  var AP = 0.80;
  var U0 = 0.0515, U1 = 0.905;   /* U0 再往左让出变阻器接点实心点半径（0.0106·fh/fw = 0.00848） */
  var V0 = 0.039, V1 = 0.925;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  PS.emDefine({
    key: 'em_divider',
    label: '分压式接法（内外接）',
    dw: 700, dh: 583,
    animatable: false,
    params: [
      { key: 'emdv_conn', label: '电流表接法', min: 0, max: 1, step: 1, def: 1, unit: '0内接1外接' },
      { key: 'emdv_sw', label: '开关', min: 0, max: 1, step: 1, def: 1, unit: '0断开1闭合' },
      { key: 'emdv_p', label: '滑片位置', min: 0, max: 100, step: 1, def: 55, unit: '%' },
    ],
    draw(c, o, r) {
      var pad = Math.min(r.w, r.h) * 0.010;
      var fw = Math.min((r.w - 2 * pad) / (U1 - U0), (r.h - 2 * pad) / ((V1 - V0) * AP));
      if (!(fw > 0)) return;
      var fh = fw * AP;
      var ccx = r.w / 2, ccy = r.h / 2;
      var ucx = (U0 + U1) / 2, vcy = (V0 + V1) / 2;
      var k = r.k;

      var LW = clamp(fh * 0.0052, 1.4, 4.2);
      var DR = clamp(fh * 0.0106, 3, 8);
      var rM = Math.min(fw * 0.086, fh * 0.118);
      var rV = rM * 0.94;
      var FS = clamp(fh * 0.085, 15, 56);
      var hhR = 0.0335;    /* 待测电阻 Rx 半高（v 单位） */
      var hhS = 0.0305;    /* 滑动变阻器电阻体半高 */

      function X(u) { return ccx + (u - ucx) * fw; }
      function Y(v) { return ccy + (v - vcy) * fh; }
      function line(x1, y1, x2, y2) {
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      }
      function dot(x, y) {
        c.beginPath(); c.arc(x, y, DR, 0, Math.PI * 2); c.fill();
      }
      function meter(cx, cy, rad, ch) {
        c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2);
        c.fillStyle = '#fff'; c.fill();
        c.strokeStyle = INK; c.lineWidth = LW * k; c.stroke();
        c.fillStyle = INK;
        c.font = (rad * 1.06) + 'px ' + SER;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(ch, cx, cy + rad * 0.03);
      }
      /* 定值电阻 / 滑动变阻器的电阻体：只有矩形。
         分压式、限流式用的是「滑动变阻器」（外部滑片 arrowDown 压向电阻体）和「待测电阻 Rx」，
         两者都不是电阻箱 —— 之前误用了框内斜箭头（电阻箱符号），已纠正。
         电阻箱（可调电阻器）的标准符号在 physshapes-proj.js 的 elShape.rbox 里。 */
      function res(u1, u2, cy, hh) {
        var x1 = X(u1), x2 = X(u2), h = hh * fh;
        c.beginPath();
        c.rect(x1, cy - h, x2 - x1, 2 * h);
        c.fillStyle = '#fff'; c.fill();
        c.strokeStyle = INK; c.lineWidth = LW * k; c.stroke();
      }
      function lab(ch, sub, cx, cy, size) {
        c.fillStyle = INK;
        c.textBaseline = 'middle';
        if (!sub) {
          c.font = 'italic ' + size + 'px ' + SER;
          c.textAlign = 'center';
          c.fillText(ch, cx, cy);
          return;
        }
        c.font = 'italic ' + size + 'px ' + SER;
        var w1 = c.measureText(ch).width;
        var ss = size * 0.58;
        c.font = 'italic ' + ss + 'px ' + SER;
        var w2 = c.measureText(sub).width;
        var gap = size * 0.03;
        var x0 = cx - (w1 + w2 + gap) / 2;
        c.textAlign = 'left';
        c.font = 'italic ' + size + 'px ' + SER;
        c.fillText(ch, x0, cy);
        c.font = 'italic ' + ss + 'px ' + SER;
        c.fillText(sub, x0 + w1 + gap, cy + size * 0.30);
      }
      function arrowDown(x, tipY, ah, aw) {
        c.beginPath();
        c.moveTo(x, tipY);
        c.lineTo(x - aw, tipY - ah);
        c.lineTo(x + aw, tipY - ah);
        c.closePath();
        c.fillStyle = INK; c.fill();
      }
      /* 开关：两接柱 + 刀片，闭合平搭，断开抬起 21° */
      function switchSw(uSw1, uSw2, yRail) {
        var x1 = X(uSw1), x2 = X(uSw2);
        var hP = 0.028 * fh;
        var yp = yRail - hP;
        line(x1, yRail, x1, yp);
        line(x2, yRail, x2, yp);
        if (o.emdv_sw === 1) {
          line(x2, yp, x1, yp);
        } else {
          var L = Math.abs(x2 - x1);
          var th = 21 * Math.PI / 180;
          line(x2, yp, x2 - L * Math.cos(th), yp - L * Math.sin(th));
        }
      }

      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = INK;
      c.fillStyle = INK;
      c.lineWidth = LW * k;

      var aRu = rM / fw;               /* 电流表半径（u 单位） */
      var tapL, tapR, uA, vcx;

      /* ---- 分压式（源页面 TOPOLOGY='div' 分支，逐行搬） ---- */
      var xl2 = 0.060, xr2 = 0.905;
      var yVr = 0.140, yT2 = 0.300, yR = 0.620, yB2 = 0.875;
      var uR1x2 = 0.255, uR2x2 = 0.465;
      uA = 0.630;
      tapL = xl2;
      tapR = (o.emdv_conn === 0) ? (uA + aRu + 0.050) : 0.500;
      var vRet = 0.470;

      /* 电压表 */
      vcx = (X(tapL) + X(tapR)) / 2;
      line(X(tapL), Y(yT2), X(tapL), Y(yVr));
      line(X(tapL), Y(yVr), vcx - rV, Y(yVr));
      line(vcx + rV, Y(yVr), X(tapR), Y(yVr));
      line(X(tapR), Y(yVr), X(tapR), Y(yT2));
      meter(vcx, Y(yVr), rV, 'V');
      dot(X(tapL), Y(yT2)); dot(X(tapR), Y(yT2));

      /* 上导轨 */
      line(X(xl2), Y(yT2), X(uR1x2), Y(yT2));
      res(uR1x2, uR2x2, Y(yT2), hhR);
      line(X(uR2x2), Y(yT2), X(uA) - rM, Y(yT2));
      meter(X(uA), Y(yT2), rM, 'A');
      line(X(uA) + rM, Y(yT2), X(xr2), Y(yT2));
      lab('R', 'x', X((uR1x2 + uR2x2) / 2), Y(yT2) + hhR * fh + FS * 0.98, FS);

      /* 左竖边（兼作分压左端） */
      line(X(xl2), Y(yT2), X(xl2), Y(yB2));

      /* 负载回路：电流表右 - 下行 - 左行 - 滑片 */
      var uRl1 = 0.445, uRl2 = 0.665;
      var us2 = uRl1 + (o.emdv_p / 100) * (uRl2 - uRl1);
      var ah2 = 0.029 * fh, aw2 = fw * 0.0105;
      var tipY2 = Y(yR) - hhS * fh;

      line(X(xr2), Y(yT2), X(xr2), Y(vRet));
      line(X(xr2), Y(vRet), X(us2), Y(vRet));
      line(X(us2), Y(vRet), X(us2), tipY2 - ah2);
      arrowDown(X(us2), tipY2, ah2, aw2);

      /* 滑动变阻器：电阻体 + 上方外部滑片（滑片位置由 emdv_p 决定） */
      line(X(xl2), Y(yR), X(uRl1), Y(yR));
      res(uRl1, uRl2, Y(yR), hhS);
      line(X(uRl2), Y(yR), X(xr2), Y(yR));
      line(X(xr2), Y(yR), X(xr2), Y(yB2));
      dot(X(xl2), Y(yR));
      lab('R', null, X((uRl1 + uRl2) / 2), Y(yR) + hhS * fh + FS * 0.98, FS);

      /* 下导轨：电源 - 开关 */
      var uBat2 = 0.300, uSw1b = 0.680, uSw2b = 0.830;
      var pg2 = fw * 0.016, bx2 = X(uBat2);
      line(X(xl2), Y(yB2), bx2 - pg2, Y(yB2));
      line(bx2 - pg2, Y(yB2) - 0.050 * fh, bx2 - pg2, Y(yB2) + 0.050 * fh);
      line(bx2 + pg2, Y(yB2) - 0.031 * fh, bx2 + pg2, Y(yB2) + 0.031 * fh);
      line(bx2 + pg2, Y(yB2), X(uSw1b), Y(yB2));
      switchSw(uSw1b, uSw2b, Y(yB2));
      line(X(uSw2b), Y(yB2), X(xr2), Y(yB2));

      lab('S', null, X((uSw1b + uSw2b) / 2), Y(yB2) - 0.135 * fh, FS);
      lab('E', null, bx2 - fw * 0.052, Y(yB2) - 0.106 * fh, FS);
    },
  });
})();

/* ── em_limiter.js ── */
/* 限流式接法（电流表内接 / 外接）—— 移植自「批量高中物理html/已导入/限流式-内外接.html」
   白底透明（源页面 body 就是 #fff / nobg），不铺 plate。
   源页面按 TOPOLOGY='lim' 画：画幅比 fh/fw = 0.74。设计画布 800×613。
   与分压式的拓扑不同：变阻器在下导轨与开关/电源串联（限流），电压表只并在 Rx 两端。 */
(function () {
  'use strict';

  var PS = window.GW.physShapes;
  var INK = '#15171a';
  var SER = '"Times New Roman", Georgia, "Songti SC", SimSun, serif';

  /* 同 em_divider：源页面 fit() 的 32px 页边与 fy 偏移在宿主里没意义，这里把图形本体实际占用的
     u/v 范围固定成外接框，居中填满设计画布 —— 坐标映射变了，图里的几何一个像素没改。
     V0 = 电压表圆顶（yV - rV/fh），V1 = 变阻器 R 标签的下沿。 */
  var AP = 0.74;
  var U0 = 0.055, U1 = 0.9528;   /* U1 再往右让出滑片引线端点实心点半径（0.0106·fh/fw = 0.00784） */
  var V0 = 0.0388, V1 = 0.964;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  PS.emDefine({
    key: 'em_limiter',
    label: '限流式接法（内外接）',
    dw: 800, dh: 613,
    animatable: false,
    params: [
      { key: 'emlm_conn', label: '电流表接法', min: 0, max: 1, step: 1, def: 1, unit: '0内接1外接' },
      { key: 'emlm_sw', label: '开关', min: 0, max: 1, step: 1, def: 1, unit: '0断开1闭合' },
      { key: 'emlm_p', label: '滑片位置', min: 0, max: 100, step: 1, def: 55, unit: '%' },
    ],
    draw(c, o, r) {
      var pad = Math.min(r.w, r.h) * 0.010;
      var fw = Math.min((r.w - 2 * pad) / (U1 - U0), (r.h - 2 * pad) / ((V1 - V0) * AP));
      if (!(fw > 0)) return;
      var fh = fw * AP;
      var ccx = r.w / 2, ccy = r.h / 2;
      var ucx = (U0 + U1) / 2, vcy = (V0 + V1) / 2;
      var k = r.k;

      var LW = clamp(fh * 0.0052, 1.4, 4.2);
      var DR = clamp(fh * 0.0106, 3, 8);
      var rM = Math.min(fw * 0.086, fh * 0.118);
      var rV = rM * 0.94;
      var FS = clamp(fh * 0.085, 15, 56);
      var hhR = 0.0335;    /* 待测电阻 Rx 半高（v 单位） */
      var hhS = 0.0305;    /* 滑动变阻器电阻体半高 */

      function X(u) { return ccx + (u - ucx) * fw; }
      function Y(v) { return ccy + (v - vcy) * fh; }
      function line(x1, y1, x2, y2) {
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      }
      function dot(x, y) {
        c.beginPath(); c.arc(x, y, DR, 0, Math.PI * 2); c.fill();
      }
      function meter(cx, cy, rad, ch) {
        c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2);
        c.fillStyle = '#fff'; c.fill();
        c.strokeStyle = INK; c.lineWidth = LW * k; c.stroke();
        c.fillStyle = INK;
        c.font = (rad * 1.06) + 'px ' + SER;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(ch, cx, cy + rad * 0.03);
      }
      /* 定值电阻 / 滑动变阻器的电阻体：只有矩形。
         分压式、限流式用的是「滑动变阻器」（外部滑片 arrowDown 压向电阻体）和「待测电阻 Rx」，
         两者都不是电阻箱 —— 之前误用了框内斜箭头（电阻箱符号），已纠正。
         电阻箱（可调电阻器）的标准符号在 physshapes-proj.js 的 elShape.rbox 里。 */
      function res(u1, u2, cy, hh) {
        var x1 = X(u1), x2 = X(u2), h = hh * fh;
        c.beginPath();
        c.rect(x1, cy - h, x2 - x1, 2 * h);
        c.fillStyle = '#fff'; c.fill();
        c.strokeStyle = INK; c.lineWidth = LW * k; c.stroke();
      }
      function lab(ch, sub, cx, cy, size) {
        c.fillStyle = INK;
        c.textBaseline = 'middle';
        if (!sub) {
          c.font = 'italic ' + size + 'px ' + SER;
          c.textAlign = 'center';
          c.fillText(ch, cx, cy);
          return;
        }
        c.font = 'italic ' + size + 'px ' + SER;
        var w1 = c.measureText(ch).width;
        var ss = size * 0.58;
        c.font = 'italic ' + ss + 'px ' + SER;
        var w2 = c.measureText(sub).width;
        var gap = size * 0.03;
        var x0 = cx - (w1 + w2 + gap) / 2;
        c.textAlign = 'left';
        c.font = 'italic ' + size + 'px ' + SER;
        c.fillText(ch, x0, cy);
        c.font = 'italic ' + ss + 'px ' + SER;
        c.fillText(sub, x0 + w1 + gap, cy + size * 0.30);
      }
      function arrowDown(x, tipY, ah, aw) {
        c.beginPath();
        c.moveTo(x, tipY);
        c.lineTo(x - aw, tipY - ah);
        c.lineTo(x + aw, tipY - ah);
        c.closePath();
        c.fillStyle = INK; c.fill();
      }
      /* 开关：两接柱 + 刀片，闭合平搭，断开抬起 21° */
      function switchSw(uSw1, uSw2, yRail) {
        var x1 = X(uSw1), x2 = X(uSw2);
        var hP = 0.028 * fh;
        var yp = yRail - hP;
        line(x1, yRail, x1, yp);
        line(x2, yRail, x2, yp);
        if (o.emlm_sw === 1) {
          line(x2, yp, x1, yp);
        } else {
          var L = Math.abs(x2 - x1);
          var th = 21 * Math.PI / 180;
          line(x2, yp, x2 - L * Math.cos(th), yp - L * Math.sin(th));
        }
      }

      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = INK;
      c.fillStyle = INK;
      c.lineWidth = LW * k;

      var aRu = rM / fw;               /* 电流表半径（u 单位） */
      var yV, tapL, tapR, uA, vcx;

      /* ---- 限流式（源页面 TOPOLOGY='lim' 分支，逐行搬） ---- */
      var xl = 0.055, xr = 0.945, yT = 0.300, yB = 0.825;
      var uR1x = 0.275, uR2x = 0.485;
      uA = 0.660;
      tapL = 0.150;
      tapR = (o.emlm_conn === 0) ? (uA + aRu + 0.050) : 0.520;
      yV = yT - 0.152;

      /* 电压表 */
      vcx = (X(tapL) + X(tapR)) / 2;
      line(X(tapL), Y(yT), X(tapL), Y(yV));
      line(X(tapL), Y(yV), vcx - rV, Y(yV));
      line(vcx + rV, Y(yV), X(tapR), Y(yV));
      line(X(tapR), Y(yV), X(tapR), Y(yT));
      meter(vcx, Y(yV), rV, 'V');
      dot(X(tapL), Y(yT)); dot(X(tapR), Y(yT));

      /* 上导轨 */
      line(X(xl), Y(yT), X(uR1x), Y(yT));
      res(uR1x, uR2x, Y(yT), hhR);
      line(X(uR2x), Y(yT), X(uA) - rM, Y(yT));
      meter(X(uA), Y(yT), rM, 'A');
      line(X(uA) + rM, Y(yT), X(xr), Y(yT));
      lab('R', 'x', X((uR1x + uR2x) / 2), Y(yT) + hhR * fh + FS * 0.98, FS);

      /* 左右竖边 */
      line(X(xl), Y(yT), X(xl), Y(yB));
      line(X(xr), Y(yT), X(xr), Y(yB));

      /* 下导轨：开关 - 电源 - 滑动变阻器 */
      var uSw1 = 0.145, uSw2 = 0.285, uBat = 0.405;
      var uRl1 = 0.545, uRl2 = 0.765;
      var pg = fw * 0.016, bx = X(uBat);

      line(X(xl), Y(yB), X(uSw1), Y(yB));
      switchSw(uSw1, uSw2, Y(yB));
      line(X(uSw2), Y(yB), bx - pg, Y(yB));
      line(bx - pg, Y(yB) - 0.050 * fh, bx - pg, Y(yB) + 0.050 * fh);
      line(bx + pg, Y(yB) - 0.031 * fh, bx + pg, Y(yB) + 0.031 * fh);
      line(bx + pg, Y(yB), X(uRl1), Y(yB));
      res(uRl1, uRl2, Y(yB), hhS);
      line(X(uRl2), Y(yB), X(xr), Y(yB));

      lab('S', null, X((uSw1 + uSw2) / 2) + 0.004, Y(yB) - 0.104 * fh, FS);
      lab('E', null, bx - fw * 0.050, Y(yB) + 0.086 * fh, FS);
      lab('R', null, X((uRl1 + uRl2) / 2), Y(yB) + hhS * fh + FS * 0.98, FS);

      /* 滑片：向上 - 右行 - 并入右竖边 */
      var us = uRl1 + (o.emlm_p / 100) * (uRl2 - uRl1);
      var yS = yB - 0.146;
      var tipY = Y(yB) - hhS * fh;
      var ah = 0.029 * fh, aw = fw * 0.0105;
      line(X(us), Y(yS), X(us), tipY - ah);
      arrowDown(X(us), tipY, ah, aw);
      line(X(us), Y(yS), X(xr), Y(yS));
      dot(X(xr), Y(yS));
    },
  });
})();

/* ── em_magfocus.js ── */
/* 磁聚焦与磁发散（可调参） —— 移植自「磁聚焦磁发散-可调参动画.html」
   左场区：边界上的点源向场内发散，出射成一束平行光；
   右场区：平行光射入同半径的圆场区，r = R 时会聚到边界一点 P（k≠1 时明显不聚焦）。
   轨迹在 buildScene 里一次算成「点 + 累计时刻」的折线，draw 只按 o.animT 插值 —— 纯函数，无跨帧状态。 */
(function () {
  'use strict';
  const P = window.GW.physShapes;

  const DW = 900, DH = 560;

  /* ===== 世界单位：磁场区半径 R = 1；速率 V（世界单位/秒） ===== */
  const V = 1.15;                 // 粒子速率
  const OUT_L = 0.60;             // 发散束出射后到交接面的直线长度
  const HANDOFF = 1 + OUT_L;      // 交接面 x：发散束在此交给右侧场区
  const FLY = 0.95;               // 交接面到右侧场区入射点的自由飞行距离
  const DX = HANDOFF + FLY + 1;   // 聚焦圆心相对发散圆心的 x 偏移
  const HOLD = 0.30;              // 收尾留白（秒）

  const HL = '#e6edf7';
  const DIM = '#8fa3c0';
  const FAM_SANS = 'system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  // 每条轨迹一种颜色（色相均匀排开，深底可辨）
  const TRAIL = ['#22d3ee', '#fbbf24', '#e53935', '#43a047', '#a78bfa', '#fb923c',
                 '#60a5fa', '#f472b6', '#a3e635', '#e879f9', '#2dd4bf'];

  /* ===== 画布状态：每次 draw 重置 ===== */
  let C = null;
  let SC = 1, CX = 0, CY = 0, OX = 0, OY = 0, FS = 16;

  function num(v, def, lo, hi) {
    const x = typeof v === 'number' && isFinite(v) ? v : def;
    return x < lo ? lo : (x > hi ? hi : x);
  }

  function tint(hex, a) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16);
    if (!isFinite(n)) return 'rgba(230,237,247,' + a + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function rr(c, x, y, w, h, rad) {
    const rd = Math.max(0, Math.min(rad, Math.min(w, h) / 2));
    c.beginPath();
    c.moveTo(x + rd, y);
    c.lineTo(x + w - rd, y);
    c.arcTo(x + w, y, x + w, y + rd, rd);
    c.lineTo(x + w, y + h - rd);
    c.arcTo(x + w, y + h, x + w - rd, y + h, rd);
    c.lineTo(x + rd, y + h);
    c.arcTo(x, y + h, x, y + h - rd, rd);
    c.lineTo(x, y + rd);
    c.arcTo(x, y, x + rd, y, rd);
    c.closePath();
  }

  /* ===== 深色底板：圆角 + 160° 底色 + 两团柔光 + 52px 网格（照抄原页面 body 观感） ===== */
  function plate(c, o, r) {
    const W = r.w || DW, H = r.h || DH, k = r.k || 1;
    if (!(W > 4) || !(H > 4)) return;
    const rad = Math.min(W, H) * 0.036;

    c.save();
    rr(c, 0, 0, W, H, rad);
    c.clip();

    /* 底色：linear-gradient(160deg,#060c18 0%,#0a1428 45%,#0b1020 100%) */
    let g = c.createLinearGradient(W * 0.18, 0, W * 0.58, H);
    g.addColorStop(0, '#060c18');
    g.addColorStop(0.45, '#0a1428');
    g.addColorStop(1, '#0b1020');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    /* 左上青、右下靛两团柔光（原 body 的两处 radial-gradient） */
    g = c.createRadialGradient(W * 0.12, H * -0.08, 0, W * 0.12, H * -0.08, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(56,189,248,0.22)');
    g.addColorStop(1, 'rgba(56,189,248,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    g = c.createRadialGradient(W * 0.92, H * 1.12, 0, W * 0.92, H * 1.12, Math.max(W, H) * 0.60);
    g.addColorStop(0, 'rgba(129,140,248,0.20)');
    g.addColorStop(1, 'rgba(129,140,248,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    /* 网格：52px，amber 3.5%（原 body::before） */
    c.strokeStyle = 'rgba(245,190,120,0.035)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 52; x < W; x += 52) {
      const xx = Math.round(x) + 0.5;
      c.moveTo(xx, 0); c.lineTo(xx, H);
    }
    for (let y = 52; y < H; y += 52) {
      const yy = Math.round(y) + 0.5;
      c.moveTo(0, yy); c.lineTo(W, yy);
    }
    c.stroke();

    /* 网格边缘淡出（近似原 mask-image: radial-gradient(ellipse 90% 80% at 50% 50%, #000 30%, transparent)） */
    const md = Math.hypot(W * 0.5, H * 0.5) || 1;
    g = c.createRadialGradient(W * 0.5, H * 0.5, md * 0.42, W * 0.5, H * 0.5, md * 0.94);
    g.addColorStop(0, 'rgba(7,13,26,0)');
    g.addColorStop(0.62, 'rgba(7,13,26,0.20)');
    g.addColorStop(1, 'rgba(7,13,26,0.62)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    c.restore();

    /* 描边：一圈暖色细边 */
    c.save();
    rr(c, 0.5, 0.5, W - 1, H - 1, rad);
    c.lineWidth = 1.4 * k;
    c.strokeStyle = 'rgba(245,190,120,0.20)';
    c.stroke();
    c.restore();
  }

  /* ===== 坐标：世界 → 设计画布 ===== */
  function X(x) { return CX + (x + OX) * SC; }
  function Y(y) { return CY - (y + OY) * SC; }
  function at(ox, oy) { OX = ox; OY = oy; }

  /* ===== 物理：几何求解 =====
     磁场区域是以 site 圆心为圆心、半径 R=1 的圆；区域外无场。
     粒子轨道半径 r = kR，曲率中心在速度右侧（顺时针 s=1）。
     轨迹预先算成「点 + 每点累计时间」的折线，逐帧只按 t 插值，不逐帧累加。 */
  function solveArc(S0, u, r, s) {
    const nx = s * u.y, ny = -s * u.x;              // 曲率中心方向 = s·rot(u,-90°)
    const O1x = S0.x + r * nx, O1y = S0.y + r * ny;
    const d = Math.hypot(O1x, O1y);
    if (!(d > 1e-9)) return { arc: [{ x: S0.x, y: S0.y }], A: { x: S0.x, y: S0.y }, dir: { x: u.x, y: u.y }, sweep: 0 };

    const a = (d * d + 1 - r * r) / (2 * d);
    const h2 = 1 - a * a;
    const h = Math.sqrt(h2 > 0 ? h2 : 0);
    const ux = O1x / d, uy = O1y / d;
    const bx = a * ux, by = a * uy;
    const p1x = bx - h * uy, p1y = by + h * ux;
    const p2x = bx + h * uy, p2y = by - h * ux;
    const d1 = Math.hypot(p1x - S0.x, p1y - S0.y), d2 = Math.hypot(p2x - S0.x, p2y - S0.y);
    const Ax = d1 > d2 ? p1x : p2x, Ay = d1 > d2 ? p1y : p2y;   // 出射点（不是 S0）

    const a0 = Math.atan2(S0.y - O1y, S0.x - O1x);
    const a1 = Math.atan2(Ay - O1y, Ax - O1x);
    let sweep;
    if (s > 0) { sweep = a0 - a1; while (sweep <= 0) sweep += Math.PI * 2; }
    else { sweep = a1 - a0; while (sweep <= 0) sweep += Math.PI * 2; }
    while (sweep > Math.PI * 2) sweep -= Math.PI * 2;

    const steps = Math.max(12, Math.ceil(sweep / 0.05));
    const arc = [];
    for (let j = 0; j <= steps; j++) {
      const ang = a0 + (s > 0 ? -sweep : sweep) * (j / steps);
      arc.push({ x: O1x + r * Math.cos(ang), y: O1y + r * Math.sin(ang) });
    }
    const edx = s > 0 ? Math.sin(a1) : -Math.sin(a1);
    const edy = s > 0 ? -Math.cos(a1) : Math.cos(a1);
    return { arc: arc, A: { x: Ax, y: Ay }, dir: { x: edx, y: edy }, sweep: sweep };
  }

  /* 折算路程时间：时间 = 路程 / 速率，逐点累计 */
  function finishPath(pts, focusIdx) {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / V;
      pts[i].t = acc;
    }
    pts[0].t = 0;
    return { pts: pts, T: acc, tFocus: pts[Math.max(0, focusIdx)] ? pts[Math.max(0, focusIdx)].t : 0 };
  }

  /* 磁聚焦：平行束沿 +x 入射，入射高度 y（圆心在原点） */
  function buildFocusPath(y, r, s, x0) {
    const S0 = { x: -Math.sqrt(Math.max(0, 1 - y * y)), y: y };
    const g = solveArc(S0, { x: 1, y: 0 }, r, s);
    const pts = [{ x: x0, y: y }];
    for (let i = 0; i < g.arc.length; i++) pts.push(g.arc[i]);
    // 出射直线至少越过会聚点 P=(0,-s)，让「聚成一点」真的画在轨迹上
    const px = 0, py = -s;
    const d = (px - g.A.x) * g.dir.x + (py - g.A.y) * g.dir.y;
    const Lb = d > 0 ? d + 0.45 : 0.55;
    pts.push({ x: g.A.x + g.dir.x * Lb, y: g.A.y + g.dir.y * Lb });
    return finishPath(pts, g.arc.length);
  }

  /* 磁发散：点源 P 在边界上，沿与向内法线成 t 弧度的方向发射 */
  function buildDivergePath(t, r, s) {
    const ninx = 0, niny = s;
    const u = {
      x: ninx * Math.cos(t) - niny * Math.sin(t),
      y: ninx * Math.sin(t) + niny * Math.cos(t)
    };
    const g = solveArc({ x: 0, y: -s }, u, r, s);
    const pts = [];
    for (let i = 0; i < g.arc.length; i++) pts.push(g.arc[i]);
    // 出射端截到交接面：光束末端齐平，并在此交给右侧场区
    let ex = g.A.x + g.dir.x * OUT_L, ey = g.A.y + g.dir.y * OUT_L, cont = false;
    if (g.dir.x > 0.02 && Math.abs(g.dir.y) < 0.30) {   // 出射接近水平才算平行束
      const L = (HANDOFF - g.A.x) / g.dir.x;
      if (L > 0 && L < 5) { ex = HANDOFF; ey = g.A.y + g.dir.y * L; cont = true; }
    }
    pts.push({ x: ex, y: ey });
    const out = finishPath(pts, 0);
    out.cont = cont;          // 出射方向是否朝 +x，可进入右侧场区
    out.y = ey;
    return out;
  }

  /* 一站（圆心在原点）的包围盒：轨迹点 + 圆盘 + 文字边距 */
  /* 横向范围取轨迹极值；纵向由标题/脚注决定，使内容长宽比贴近设计画布 900:560 */
  function bbOf(list) {
    let x0 = -1, x1 = 1, y0 = -1, y1 = 1;
    for (let i = 0; i < list.length; i++) {
      const pts = list[i].pts;
      for (let j = 0; j < pts.length; j++) {
        const q = pts[j];
        if (q.x < x0) x0 = q.x;
        if (q.x > x1) x1 = q.x;
        if (q.y < y0) y0 = q.y;
        if (q.y > y1) y1 = q.y;
      }
    }
    // 上下各留一点给线宽与文字；纵向范围在 buildScene 里统一给
    return { x0: x0 - 0.005, x1: x1 + 0.005, y0: y0, y1: y1 };
  }

  /* 两段共用一套参数：先发散（相位 1），再聚焦（相位 2） */
  function buildScene(k, n, s) {
    const r = Math.max(0.05, k), A = [], B = [];
    let T = 0;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      const a = buildDivergePath(u * 1.255, r, s);   // ±72°
      a.off = 0;                                     // 同时从点源出发
      a.ci = i;                                      // 颜色序号跟着粒子走
      A.push(a);
    }
    // 聚焦束的入射高度：取理想情形（k=1）的出射高度。这样任何 k 下右场区都有一整束平行光，
    // 同时 k=1 时两段能在交接面上严格接上（同一颗粒子接着走）。
    const ideal = [];
    let relay = true;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      ideal.push(buildDivergePath(u * 1.255, 1, s));
      if (!A[i].cont || Math.abs(A[i].y - ideal[i].y) > 1e-12) relay = false;
    }
    for (let i = 0; i < ideal.length; i++) {
      const y = ideal[i].y;
      if (Math.abs(y) > 0.96) continue;                       // 擦边的粒子不进场
      // k=1 从交接面接上；k≠1 两幅图各自独立，平行束直接从场区边界入场
      const x0 = relay ? HANDOFF - DX : -Math.sqrt(Math.max(0, 1 - y * y));
      const b = buildFocusPath(y, r, s, x0);
      b.off = relay ? A[i].T : 0;                     // k=1 无缝接力；k≠1 各自从 t=0 演示
      b.ci = relay ? A[i].ci : i;                     // 同一颗粒子同一种颜色
      B.push(b);
      if (b.off + b.T > T) T = b.off + b.T;
    }
    const bx = DX, by = 0;
    const a = bbOf(A), b = bbOf(B);
    return {
      A: A, B: B, T: T + HOLD, bx: bx, by: by,
      bb: {
        x0: Math.min(a.x0, bx + b.x0), x1: Math.max(a.x1, bx + b.x1),
        y0: -1.85, y1: 1.645               // 上方标题 + 下方脚注，纵向刚好填满设计画布
      }
    };
  }

  let cache = null;
  function sceneFor(k, n, s) {
    const key = k.toFixed(4) + '|' + n + '|' + s;
    if (cache && cache.key === key) return cache;
    cache = buildScene(k, n, s);
    cache.key = key;
    return cache;
  }

  /* 按局部时间取位置（折线线性插值，解析、不累加） */
  function posAt(pts, tt) {
    const last = pts.length - 1;
    if (tt <= 0) return { x: pts[0].x, y: pts[0].y, i: 0, f: 0 };
    if (tt >= pts[last].t) return { x: pts[last].x, y: pts[last].y, i: last, f: 1 };
    let lo = 0, hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].t <= tt) lo = mid; else hi = mid;
    }
    const seg = pts[hi].t - pts[lo].t;
    const f = seg > 0 ? (tt - pts[lo].t) / seg : 0;
    return {
      x: pts[lo].x + (pts[hi].x - pts[lo].x) * f,
      y: pts[lo].y + (pts[hi].y - pts[lo].y) * f,
      i: lo, f: f
    };
  }

  /* ===== 绘制 ===== */
  function strokePoly(pts, upto, alpha, width, color) {
    C.save();
    C.strokeStyle = tint(color || HL, alpha);
    C.lineWidth = width;
    C.lineCap = 'round';
    C.lineJoin = 'round';
    C.setLineDash([]);
    C.beginPath();
    C.moveTo(X(pts[0].x), Y(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      if (upto !== undefined && pts[i].t > upto) break;
      C.lineTo(X(pts[i].x), Y(pts[i].y));
    }
    if (upto !== undefined) {
      const p = posAt(pts, upto);
      C.lineTo(X(p.x), Y(p.y));
    }
    C.stroke();
    C.restore();
  }

  function label(text, wx, wy, color, size, align, baseline) {
    C.save();
    C.fillStyle = color;
    C.font = '600 ' + size + 'px ' + FAM_SANS;
    C.textAlign = align || 'left';
    C.textBaseline = baseline || 'middle';
    C.fillText(text, X(wx), Y(wy));
    C.restore();
  }

  /* 一个磁场区（圆心在当前所在 site 的原点） */
  function drawField(st) {
    const lw = st.lw, s = 1;
    // 区域填充 + B 标记
    C.save();
    C.beginPath();
    C.arc(X(0), Y(0), SC, 0, Math.PI * 2);
    if (st.fillA > 0.5) { C.fillStyle = tint(HL, st.fillA / 100); C.fill(); }
    C.clip();
    const gap = 0.27, sym = Math.max(2.2, lw * 0.6);
    C.strokeStyle = tint(HL, 0.40);
    C.fillStyle = tint(HL, 0.40);
    C.lineWidth = Math.max(1, lw * 0.16);
    C.setLineDash([]);
    for (let gx = -0.93; gx <= 0.931; gx += gap) {
      for (let gy = -0.93; gy <= 0.931; gy += gap) {
        if (gx * gx + gy * gy > 0.87) continue;
        const px = X(gx), py = Y(gy);
        if (s > 0) {                     // B 垂直纸面向外：⊙
          C.beginPath();
          C.arc(px, py, Math.max(1.5, sym * 0.5), 0, Math.PI * 2);
          C.fill();
        } else {                         // B 垂直纸面向里：⊗
          const d = Math.max(2.6, sym);
          C.beginPath();
          C.moveTo(px - d, py - d); C.lineTo(px + d, py + d);
          C.moveTo(px + d, py - d); C.lineTo(px - d, py + d);
          C.stroke();
        }
      }
    }
    C.restore();

    // 区域边界
    C.save();
    C.strokeStyle = HL;
    C.lineWidth = lw;
    C.lineCap = 'round';
    C.setLineDash([]);
    C.beginPath();
    C.arc(X(0), Y(0), SC, 0, Math.PI * 2);
    C.stroke();
    C.restore();

    // 半径 R（虚线辅助线）
    C.save();
    C.strokeStyle = tint(HL, 0.30);
    C.lineWidth = Math.max(1.2, lw * 0.42);
    C.setLineDash([lw * 2.6, lw * 2.2]);
    C.beginPath();
    C.moveTo(X(0), Y(0));
    C.lineTo(X(Math.cos(2.5)), Y(Math.sin(2.5)));
    C.stroke();
    C.restore();
    label('R = ' + st.Rcm.toFixed(1) + ' cm', Math.cos(2.28) * 0.62, Math.sin(2.28) * 0.62,
      DIM, st.fs * 0.88, 'center');

    // 圆心
    C.save();
    C.fillStyle = tint(HL, 0.55);
    C.beginPath();
    C.arc(X(0), Y(0), Math.max(2.4, lw * 0.55), 0, Math.PI * 2);
    C.fill();
    C.restore();

    // B 标注
    const bs = st.fs * 0.95;
    label('B', 0.60, 0.70, DIM, bs, 'left');
    C.save();
    C.strokeStyle = tint(HL, 0.55);
    C.lineWidth = Math.max(1.2, lw * 0.36);
    C.setLineDash([]);
    const bx = X(0.80), by = Y(0.70), br = bs * 0.34;
    C.beginPath(); C.arc(bx, by, br, 0, Math.PI * 2); C.stroke();
    if (s > 0) {
      C.fillStyle = tint(HL, 0.65);
      C.beginPath(); C.arc(bx, by, Math.max(1.1, br * 0.36), 0, Math.PI * 2); C.fill();
    } else {
      C.beginPath();
      C.moveTo(bx - br * 0.7, by - br * 0.7); C.lineTo(bx + br * 0.7, by + br * 0.7);
      C.moveTo(bx + br * 0.7, by - br * 0.7); C.lineTo(bx - br * 0.7, by + br * 0.7);
      C.stroke();
    }
    C.restore();
  }

  /* 一束粒子：完整轨迹（淡）+ 已走过（亮）+ 粒子本体 */
  function drawBeam(st, list, t) {
    const lw = st.lw, nc = TRAIL.length;
    for (let i = 0; i < list.length; i++) {
      strokePoly(list[i].pts, undefined, 0.18, Math.max(1.2, lw * 0.5),
        TRAIL[(list[i].ci == null ? i : list[i].ci) % nc]);
    }
    for (let i = 0; i < list.length; i++) {
      const item = list[i], col = TRAIL[(item.ci == null ? i : item.ci) % nc];
      const tau = t - item.off;
      if (tau < 0) continue;                     // 还没出发
      const done = tau >= item.T - 1e-9;
      const tc = done ? item.T : tau;
      strokePoly(item.pts, tc, 0.92, Math.max(1.4, lw * 0.75), col);
      let p;
      if (done) {                                // 走完就停在终点，保留整条亮轨迹
        p = posAt(item.pts, item.T);
        if (t < st.T - 1e-9) {                   // 上一段结束后留一个小头，暗示已到位
          C.save();
          C.fillStyle = col;
          C.beginPath();
          C.arc(X(p.x), Y(p.y), Math.max(2.2, lw * 0.6), 0, Math.PI * 2);
          C.fill();
          C.restore();
        }
        continue;
      }
      for (let j = 1; j <= 10; j++) {
        const tt = tc - j * (item.T * 0.018);
        if (tt < 0) break;
        const q = posAt(item.pts, tt);
        C.save();
        C.fillStyle = tint(col, 0.34 * (1 - j / 11));
        C.beginPath();
        C.arc(X(q.x), Y(q.y), Math.max(1.1, lw * 0.34), 0, Math.PI * 2);
        C.fill();
        C.restore();
      }
      p = posAt(item.pts, tc);
      C.save();
      C.fillStyle = col;
      C.beginPath();
      C.arc(X(p.x), Y(p.y), Math.max(2.6, lw * 0.72), 0, Math.PI * 2);
      C.fill();
      C.restore();
    }
  }

  /* 特征点：点源 / 汇聚点 */
  function drawSpot(st, text, inside) {
    const s = 1, y = -s;
    C.save();
    C.strokeStyle = HL;
    C.lineWidth = Math.max(1.6, st.lw * 0.5);
    C.setLineDash([]);
    C.beginPath();
    C.arc(X(0), Y(y), Math.max(5, st.lw * 1.5), 0, Math.PI * 2);
    C.stroke();
    C.fillStyle = tint(HL, 0.30);
    C.beginPath();
    C.arc(X(0), Y(y), Math.max(2, st.lw * 0.6), 0, Math.PI * 2);
    C.fill();
    C.restore();
    if (!text) return;
    if (inside) label(text, 0.10, y - s * 0.16, HL, st.fs, 'left');
    else label(text, 0, y - s * 0.38, DIM, st.fs * 0.92, 'center');
  }

  /* 每个磁场区的标题（在圆上方） */
  function caption(st, text) {
    label(text, 0, 1.59, DIM, st.fs * 0.95, 'center');
  }

  function layout(scene, sizeF) {
    const bb = scene.bb, pad = 0;
    const bw = Math.max(1e-6, bb.x1 - bb.x0), bh = Math.max(1e-6, bb.y1 - bb.y0);
    let fit = Math.min((DW - 2 * pad) / bw, (DH - 2 * pad) / bh);
    if (!(fit > 0) || !isFinite(fit)) fit = 10;
    SC = fit * sizeF;
    CX = DW / 2 - (bb.x0 + bb.x1) / 2 * SC;
    CY = DH / 2 + (bb.y0 + bb.y1) / 2 * SC;
    OX = 0; OY = 0;
    FS = Math.round(Math.max(12, Math.min(17, SC * 0.105)));
  }

  P.emDefine({
    key: 'em_magfocus',
    label: '磁聚焦与磁发散',
    cat: 'em',               // 1.1.10：从「电磁学实验」挪进「电磁」（实验分页只留量具、仪表与电路）
    dw: DW,
    dh: DH,
    animatable: true,
    plate: plate,
    params: [
      { key: 'emmf_Rcm', label: '场区半径 R', min: 6, max: 14, step: 0.5, def: 9, unit: ' cm' },
      { key: 'emmf_k', label: '轨道半径比 r/R', min: 0.5, max: 2, step: 0.02, def: 1, unit: '' },
      { key: 'emmf_n', label: '粒子数', min: 3, max: 11, step: 1, def: 7, unit: ' 条' },
      { key: 'emmf_lw', label: '线宽', min: 1.5, max: 10, step: 0.5, def: 4, unit: '' },
      { key: 'emmf_fillA', label: '磁场区填充', min: 0, max: 60, step: 1, def: 18, unit: ' %' },
      { key: 'emmf_speed', label: '播放速度', min: 0.2, max: 3, step: 0.1, def: 1, unit: '×' }
    ],

    draw(c, o, r) {
      const Rcm = num(o.emmf_Rcm, 9, 6, 14);
      const kk = num(o.emmf_k, 1, 0.5, 2);
      const n = Math.round(num(o.emmf_n, 7, 3, 11));
      const lwP = num(o.emmf_lw, 4, 1.5, 10);
      const fillA = num(o.emmf_fillA, 18, 0, 60);
      const speed = num(o.emmf_speed, 1, 0.2, 3);

      C = c;
      const scene = sceneFor(kk, n, 1);
      // 原页面的 sizeF：R 越大整体越大；同时让同一个 animT 下改 R 看得出变化
      layout(scene, 0.961 + 0.028 * (Rcm - 6) / 8);

      // 动画状态 = animT 的纯函数：t = animT × speed，到片尾就停在终点
      const t = Math.max(0, Math.min(scene.T, (typeof o.animT === 'number' ? o.animT : 0) * speed));
      const st = { lw: lwP * (r.k || 1), fs: FS, fillA: fillA, t: t, T: scene.T, Rcm: Rcm };

      at(0, 0);
      drawField(st);
      drawBeam(st, scene.A, t);
      drawSpot(st, '点源', false);
      caption(st, '磁发散');

      at(scene.bx, scene.by);
      drawField(st);
      drawBeam(st, scene.B, t);
      drawSpot(st, 'P', true);
      caption(st, '磁聚焦');

      // 底部脚注：原页面 HUD 的读数换成一句图内说明
      at(0, 0);
      const midX = (scene.bb.x0 + scene.bb.x1) / 2;
      label('同一个磁场区：点源发散为平行束，平行束再聚焦于边界点 P',
        midX, -1.79, DIM, st.fs * 0.86, 'center');

      at(0, 0);
      C = null;
    }
  });
})();

/* ── em_micrometer.js ── */
/* 螺旋测微器 —— 移植自「螺旋测微器读数.html」的 draw()
   设计画布 760×430（按原页面内容比例 1.7 定，源页面 R=min(availW/1.90,availH/1.06) 成立），白底透明、无底板。
   改动只有四处：W/H/reserve→r.w/r.h（reserve=0）、S.r→o.emmic_r（源滑杆 sR/1000 的 mm 值）、删掉 dpr 与整幅清除、lineWidth 乘 r.k。 */
(function () {
  'use strict';
  const P = window.GW.physShapes;

  const INK = '#15171a';
  const SER = '"Times New Roman",Georgia,"Songti SC",SimSun,serif';

  P.emDefine({
    key: 'em_micrometer',
    label: '螺旋测微器',
    dw: 760,
    dh: 430,
    animatable: false,
    params: [
      /* 源页面滑杆 sR：min 0 / max 25000 / step 1，读数 = sR/1000（0–25 mm，0.001 mm 一格） */
      { key: 'emmic_r', label: '旋转微分筒', min: 0, max: 25, step: 0.001, def: 6.12, unit: ' mm' },
    ],
    draw(c, o, r) {
      const W = r.w, H = r.h;
      const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));

      let LW = 2;
      const ln = (x1, y1, x2, y2, w) => {
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
        c.lineWidth = (w || LW) * r.k; c.strokeStyle = INK; c.stroke();
      };
      const num = (s, x, y, size, align, base) => {
        c.font = size.toFixed(1) + 'px ' + SER;
        c.fillStyle = INK;
        c.textAlign = align || 'center';
        c.textBaseline = base || 'middle';
        c.fillText(s, x, y);
      };

      c.lineJoin = 'round'; c.lineCap = 'round';

      /* 读数（mm）：源页面 setR 把范围夹在 0–25 */
      const raw = +o.emmic_r;
      const S = clamp(isFinite(raw) ? raw : 6.12, 0, 25);

      const pad = Math.max(14, Math.min(W, H) * 0.035);
      const availW = W - 2 * pad;
      let availH = H - pad;                       /* reserve = 0：原页面底部给滑杆面板留的高度去掉 */
      if (availH < 220) availH = 220;

      const R = Math.min(availW / 1.90, availH / 1.06);
      const cx = W / 2, cy = pad + availH * 0.50;
      LW = clamp(R * 0.0075, 1.4, 5);
      const PPR = R * 0.098;                      /* 套筒 1 mm 的宽度 */

      const fsT = clamp(R * 0.150, 16, 110);      /* 微分筒格数 */
      const fsS = clamp(R * 0.085, 11, 62);       /* 套筒毫米数 */
      const dy = R * 0.084;                       /* 微分筒一格的高度 */
      const xB = cx + R * 0.02;                   /* 微分筒前缘（读数基准） */
      const xL = cx - R * 0.76;                   /* 套筒左端 */
      const hS = R * 0.385, hT = R * 0.465;       /* 套筒细、微分筒粗（包住套筒） */
      const yT = cy - hT, yBm = cy + hT, xR = cx + R * 0.70;

      /* ── 套筒（左侧筒身） ── */
      c.beginPath();
      c.moveTo(xL, cy - hS); c.lineTo(xB, cy - hS); c.lineTo(xB, cy + hS); c.lineTo(xL, cy + hS); c.closePath();
      c.lineWidth = LW * 0.95 * r.k; c.strokeStyle = INK; c.stroke();

      /* 套筒整毫米刻度（基准线之上） */
      const step = (PPR >= fsS * 2.6) ? 1 : ((PPR >= fsS * 1.2) ? 2 : 5);
      for (let m = Math.floor(S); m >= 0; m--) {
        const X = xB - (S - m) * PPR; if (X < xL + R * 0.04) break;
        const big = (m % 5 === 0);
        ln(X, cy - (big ? R * 0.26 : R * 0.155), X, cy, big ? LW * 0.95 : LW * 0.72);
        if (m % step === 0) num(String(m), X, cy - R * 0.285, fsS, 'center', 'bottom');
      }
      /* 半毫米刻度（基准线之下） */
      for (let i2 = Math.floor(S - 0.5); i2 >= 0; i2--) {
        const Xh = xB - (S - (i2 + 0.5)) * PPR; if (Xh < xL + R * 0.04) break;
        ln(Xh, cy, Xh, cy + R * 0.115, LW * 0.72);
      }
      /* 基准线 */
      ln(xL, cy, xB, cy, LW * 1.1);

      /* ── 微分筒（圆筒展开的刻度带） ── */
      const kk = Math.round(S * 100) % 50, frac = S * 100 - Math.round(S * 100);
      /* 微分筒：粗筒裹住套筒，前缘竖线 + 完整上下轮廓线 */
      ln(xB, yT, xB, yBm, LW * 1.15);
      ln(xB, yT, xR, yT + (yT - cy) * 0.075, LW * 0.95);
      ln(xB, yBm, xR, yBm + (yBm - cy) * 0.075, LW * 0.95);

      const labJ = 5;
      for (let dd = -5; dd <= 5; dd++) {
        const nn = ((kk - dd) % 50 + 50) % 50;   /* 数字向上递增：读数变大时刻度带向下滚 */
        const y = cy + (dd + frac) * dy;         /* 位置 = (读数-该格数)*dy：读数增大则刻度带整体下移 */
        if (y < yT + R * 0.02 || y > yBm - R * 0.02) continue;
        const isL = (nn % labJ === 0);
        const xe = cx + R * (isL ? 0.66 : 0.60);
        const tilt = (y - cy) * 0.075;           /* 圆筒表面的轻微倾斜 */
        ln(xB + LW * 0.7, y, xe, y + tilt, isL ? LW * 0.9 : LW * 0.62);
        if (isL) num(String(nn), xe + fsT * 0.60, y + tilt, fsT, 'center', 'middle');
      }
    },
  });
})();

/* ── em_voltmeter.js ── */
/* 电压表（可调） —— 移植自「电压表-可调参.html」，深色霓虹底板 + 半圆表盘 */
(function () {
  'use strict';
  const P = window.GW.physShapes;

  /* ===== 表盘配置：只改这里就能换表 ===== */
  const CFG = {
    sym: 'V',
    outer: ['0', '5', '10', '15'],
    inner: ['0', '1', '2', '3'],
    div: 30,
    t0: 0.62,
  };

  const A0 = 153, A1 = 27, SPAN = A0 - A1, D2R = Math.PI / 180;
  const INK = '#e6edf7', DIM = '#8fa3c0', ACC = '#f59e0b';
  const FRAC = [0, 1 / 3, 2 / 3, 1];
  const NUM = '"Times New Roman",Georgia,"Songti SC",serif';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function rr(c, x, y, w, h, rad) {
    const rd = Math.max(0, Math.min(rad, Math.min(w, h) / 2));
    c.beginPath();
    c.moveTo(x + rd, y);
    c.lineTo(x + w - rd, y);
    c.arcTo(x + w, y, x + w, y + rd, rd);
    c.lineTo(x + w, y + h - rd);
    c.arcTo(x + w, y + h, x + w - rd, y + h, rd);
    c.lineTo(x + rd, y + h);
    c.arcTo(x, y + h, x, y + h - rd, rd);
    c.lineTo(x, y + rd);
    c.arcTo(x, y, x + rd, y, rd);
    c.closePath();
  }

  /* ===== 深色底板：圆角 + 径向渐变 + 网格 + 描边（照抄原页面 body 观感） ===== */
  function plate(c, o, r) {
    const W = r.w, H = r.h, k = r.k || 1;
    if (!(W > 2) || !(H > 2)) return;
    const rad = Math.min(W, H) * 0.036;
    const MAXD = Math.hypot(W * 0.5, H * 0.45) || 1;

    c.save();
    rr(c, 0, 0, W, H, rad);
    c.clip();

    /* 底色：#060c18 → #0a1428 → #0b1020（原 body 的 linear-gradient 改成径向） */
    let g = c.createRadialGradient(W * 0.46, H * 0.40, 0, W * 0.46, H * 0.40, Math.max(W, H) * 0.82);
    g.addColorStop(0, '#0a1428');
    g.addColorStop(0.55, '#081120');
    g.addColorStop(1, '#060c18');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    /* 左上青色、右下靛色两团柔光（原 body 的两处 radial-gradient） */
    g = c.createRadialGradient(W * 0.18, H * 0.12, 0, W * 0.18, H * 0.12, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(56,189,248,0.22)');
    g.addColorStop(1, 'rgba(56,189,248,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    g = c.createRadialGradient(W * 0.82, H * 0.88, 0, W * 0.82, H * 0.88, Math.max(W, H) * 0.60);
    g.addColorStop(0, 'rgba(129,140,248,0.20)');
    g.addColorStop(1, 'rgba(129,140,248,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    /* 网格：52px，amber 3.5% 透明（原 body::before） */
    c.strokeStyle = 'rgba(245,190,120,0.035)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 52; x < W; x += 52) {
      const xx = Math.round(x) + 0.5;
      c.moveTo(xx, 0); c.lineTo(xx, H);
    }
    for (let y = 52; y < H; y += 52) {
      const yy = Math.round(y) + 0.5;
      c.moveTo(0, yy); c.lineTo(W, yy);
    }
    c.stroke();

    /* 网格向外淡出（原 mask-image: radial-gradient(circle at 50% 45%, #000 55%, transparent)） */
    g = c.createRadialGradient(W * 0.5, H * 0.45, MAXD * 0.55, W * 0.5, H * 0.45, MAXD);
    g.addColorStop(0, 'rgba(7,13,26,0)');
    g.addColorStop(1, 'rgba(7,13,26,0.94)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.restore();

    /* 描边：一圈暖色细边 */
    c.save();
    rr(c, 0.5, 0.5, W - 1, H - 1, rad);
    c.lineWidth = 1.4 * k;
    c.strokeStyle = 'rgba(245,190,120,0.20)';
    c.stroke();
    c.restore();
  }

  P.emDefine({
    key: 'em_voltmeter',
    label: '电压表（可调）',
    dw: 760,
    dh: 520,
    animatable: false,
    params: [
      { key: 'emv_t', label: '指针位置', min: 0, max: 1000, step: 1, def: 620, unit: '' },
    ],

    draw(c, o, r) {
      const W = r.w, H = r.h, k = r.k || 1;
      /* 1.1.7：不画底板 —— 画布即背景（深色页面由宿主把墨色换成浅墨） */

      /* ===== 布局：内容包围盒推导（原 layout()，Hc 不再扣滑杆 64px） ===== */
      const Hc = H;
      const R = Math.min(W * 0.96 / 2.42, Hc * 0.92 / 1.52);
      const px = W / 2, py = Hc / 2 + R * 0.6175;
      const lw = clamp(R * 0.0105, 2.8, 5.6);
      const fs = clamp(R * 0.155, 16, 76);
      if (!(R > 1) || !isFinite(R)) return;

      const p = (rr0, ad) => {
        const a = ad * D2R;
        return [px + rr0 * Math.cos(a), py - rr0 * Math.sin(a)];
      };
      const ang = (i) => A0 - SPAN * i;

      /* 滑杆 0..1000 → 指针 0..1（原 sld.value/1000） */
      const v = o && isFinite(o.emv_t) ? (+o.emv_t) / 1000 : CFG.t0;
      const t = clamp(isFinite(v) ? v : CFG.t0, 0, 1);

      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';

      /* 主弧 */
      c.beginPath();
      c.arc(px, py, R, -A0 * D2R, -A1 * D2R, false);
      c.lineWidth = lw * k;
      c.strokeStyle = INK;
      c.stroke();

      /* 两端短横杠 */
      for (let e = 0; e < 2; e++) {
        const ae = ang(e), q1 = p(R * 0.88, ae), q2 = p(R * 1.16, ae);
        c.beginPath(); c.moveTo(q1[0], q1[1]); c.lineTo(q2[0], q2[1]);
        c.lineWidth = lw * k;
        c.strokeStyle = INK;
        c.stroke();
      }

      /* 刻度线：每 10 格长、每 5 格中、其余短 */
      const N = CFG.div;
      for (let i = 0; i <= N; i++) {
        const major = (i % 10 === 0), mid = (i % 5 === 0);
        const len = (major ? 0.152 : (mid ? 0.112 : 0.068)) * R;
        const a = ang(i / N);
        const qa = p(R, a), qb = p(R + len, a);
        c.beginPath(); c.moveTo(qa[0], qa[1]); c.lineTo(qb[0], qb[1]);
        c.lineWidth = (major ? lw * 1.15 : (mid ? lw : lw * 0.85)) * k;
        c.strokeStyle = INK;
        c.stroke();
      }

      /* 数字：外圈粗读数、内圈细读数 */
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = fs + 'px ' + NUM;
      c.fillStyle = INK;
      for (let i = 0; i < FRAC.length; i++) {
        const a = ang(FRAC[i]), qa = p(R * 1.30, a);
        c.fillText(CFG.outer[i], qa[0], qa[1]);
      }
      c.font = (fs * 0.92) + 'px ' + NUM;
      c.fillStyle = DIM;
      for (let i = 0; i < FRAC.length; i++) {
        const a = ang(FRAC[i]), qa = p(R * 0.775, a);
        c.fillText(CFG.inner[i], qa[0], qa[1]);
      }

      /* 表符：圆心正上方、刻度正下方 */
      c.font = (fs * 1.15) + 'px ' + NUM;
      c.fillStyle = DIM;
      c.fillText(CFG.sym, px, py - R * 0.352);

      /* 指针 */
      const a = ang(t);
      const ux = Math.cos(a * D2R), uy = -Math.sin(a * D2R);
      const tipx = px + R * 0.998 * ux, tipy = py + R * 0.998 * uy;
      const tlx = px - R * 0.120 * ux, tly = py - R * 0.120 * uy;
      c.beginPath(); c.moveTo(tlx, tly); c.lineTo(tipx, tipy);
      c.lineWidth = Math.max(2.2, lw * 0.62) * k;
      c.strokeStyle = ACC;
      c.stroke();

      /* 箭头 */
      const bx = px + R * 0.878 * ux, by = py + R * 0.878 * uy, hw = R * 0.0235;
      c.beginPath();
      c.moveTo(tipx, tipy);
      c.lineTo(bx + hw * (-uy), by + hw * ux);
      c.lineTo(bx - hw * (-uy), by - hw * ux);
      c.closePath();
      c.fillStyle = ACC;
      c.fill();

      /* 转轴 + 表符 */
      c.beginPath();
      c.arc(px, py, R * 0.026, 0, Math.PI * 2);
      c.fillStyle = ACC;
      c.fill();

      c.restore();
    },
  });
})();
/* ── em_multimeter.js ── */
/* 万用表表盘（可调参） —— 移植自 教学html动画/万用表表盘-可调参/万用表表盘-可调参.html
   原页面是深底浅线的全屏素材页（拖动转指针 + 底部调参面板 + 色板/线型）；
   这里做成白板墨线版：纸色取 o.color（深色页面由 emDefine 自动反相），留四个滑杆
   （指针位置 / 张角 / 刻度字号 / 线宽），其余逐行照搬 —— 三条弧的半径、Ω 挡的中值定标
   R中=15Ω（tOfR 一条式子算出全部标签位置，不手写不拟合）、刻度列表与错层摆放、
   三行 V 刻度、A/V~ 刻度、端口符号、指针形状（细杆 + 实心三角箭头）。
   原页面的两遍 REC 测包围盒也保留：第一遍量、第二遍居中，图随框大小等比缩放。 */
(function () {
  'use strict';
  const P = window.GW.physShapes;
  const D2R = Math.PI / 180;
  const FONT_NUM = '"Times New Roman",Georgia,"Songti SC",serif';

  /* 三条弧的半径（以最外弧为 1） */
  const R1 = 1.000, R2 = 0.948, R3 = 0.775;
  const ROWV = [0.892, 0.852, 0.812];      // 二号刻度三行文字半径
  const LABR = 1.072;                      // 一号刻度标签基准半径

  /* 欧姆挡定标：中值电阻 R中 = 15 Ω。归一化位置 t = R中/(R中+R)，R = R中 时 t = 0.5。 */
  const RMID = 15;
  const tOfR = (r) => RMID / (RMID + r);
  const OHM = [
    { l: '∞', t: 0, ro: 0.000 },
    { l: '1k', t: tOfR(1000), ro: 0.034 },   // 左端极密：1k 外移一层，免得压住 ∞ 与 500
    { l: '500', t: tOfR(500), ro: 0.000 },
    { l: '200', t: tOfR(200), ro: 0.000 },
    { l: '100', t: tOfR(100), ro: 0.000 },
    { l: '50', t: tOfR(50), ro: 0.000 },
    { l: '40', t: tOfR(40), ro: 0.000 },
    { l: '30', t: tOfR(30), ro: 0.000 },
    { l: '20', t: tOfR(20), ro: 0.000 },
    { l: '15', t: tOfR(15), ro: 0.000 },     // = 0.5，中值电阻正在弧心
    { l: '10', t: tOfR(10), ro: 0.000 },
    { l: '5', t: tOfR(5), ro: 0.000 },
    { l: '0', t: 1, ro: 0.000 },
  ];

  P.emDefine({
    key: 'em_multimeter',
    label: '万用表表盘（可调参）',
    dw: 820, dh: 640,
    animatable: false,
    params: [
      { key: 'emMmT', label: '指针位置', min: 0, max: 1, step: 0.01, def: 0.34 },
      { key: 'emMmHalf', label: '张角', min: 16, max: 37, step: 1, def: 37, unit: '°' },
      { key: 'emMmFs', label: '刻度字号', min: 70, max: 140, step: 1, def: 70, unit: '%' },
      { key: 'emMmLw', label: '线宽', min: 1.5, max: 10, step: 0.1, def: 1.5 },
    ],
    draw(c, o, r) {
      const DW = r.w, DH = r.h;
      const num = (v, d) => ((typeof v === 'number' && isFinite(v)) ? v : d);
      const cl = (v, a, b) => (v < a ? a : (v > b ? b : v));
      const INK = o.color || '#15171a';
      const T = cl(num(o.emMmT, 0.34), 0, 1);
      const HALF = cl(num(o.emMmHalf, 37), 16, 37);
      const FSZ = cl(num(o.emMmFs, 70), 70, 140);
      const LWB = cl(num(o.emMmLw, 1.5), 1.5, 10);
      const baseDash = (c.getLineDash && c.getLineDash()) || [];

      let R = 800, drawOn = false, EXT = null;

      /* ---- 量尺（照搬原页面的 REC/EXT 两遍法） ---- */
      const rec = function (x, y) {
        if (!EXT) return;
        if (x < EXT[0]) EXT[0] = x; if (y < EXT[1]) EXT[1] = y;
        if (x > EXT[2]) EXT[2] = x; if (y > EXT[3]) EXT[3] = y;
      };
      const Pt = function (rr, ad) {
        const a = ad * D2R;
        const x = R * rr * Math.cos(a), y = -R * rr * Math.sin(a);
        rec(x, y); return [x, y];
      };
      const polar = function (rr, ad) {
        const a = ad * D2R;
        return [R * rr * Math.cos(a), -R * rr * Math.sin(a)];
      };
      const recBox = function (x, y, w, h, rot) {
        if (!EXT) return;
        const cc = Math.abs(Math.cos(rot)), ss = Math.abs(Math.sin(rot));
        const hw = (w * cc + h * ss) / 2, hh = (w * ss + h * cc) / 2;
        rec(x - hw, y - hh); rec(x + hw, y + hh);
      };
      const line = function (x0, y0, x1, y1, w) {
        rec(x0, y0); rec(x1, y1);
        if (!drawOn) return;
        c.setLineDash([]);
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
        c.lineWidth = w; c.strokeStyle = INK; c.stroke();
      };
      const tick = function (r0, r1, ad, w) {
        const a = Pt(r0, ad), b = Pt(r1, ad);
        if (!drawOn) return;
        c.setLineDash([]);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
        c.lineWidth = w; c.strokeStyle = INK; c.stroke();
      };
      const arc = function (rr, a0, a1, w) {
        Pt(rr, a0); Pt(rr, a1);
        if (!drawOn) return;
        c.setLineDash(baseDash);
        c.beginPath(); c.arc(0, 0, R * rr, -a0 * D2R, -a1 * D2R, false);
        c.lineWidth = w; c.strokeStyle = INK; c.stroke();
        c.setLineDash([]);
      };
      /* 沿弧排的刻度数字 */
      const tag = function (txt, rr, ad, fs, rot) {
        const p = Pt(rr, ad);
        const ro = (rot === undefined) ? (90 - ad) : rot;
        c.font = fs + 'px ' + FONT_NUM;
        const w = c.measureText(txt).width;
        recBox(p[0], p[1], w, fs, ro * D2R);
        if (!drawOn) return;
        c.save(); c.translate(p[0], p[1]); c.rotate(ro * D2R);
        c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(txt, 0, 0); c.restore();
      };
      /* 绝对位置文字（盘面铭牌） */
      const ta = function (txt, x, y, fs) {
        c.font = fs + 'px ' + FONT_NUM;
        const w = c.measureText(txt).width;
        if (EXT) { rec(x - w / 2, y - fs * 0.55); rec(x + w / 2, y + fs * 0.55); }
        if (!drawOn) return;
        c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(txt, x, y);
      };
      /* 直流符号：一根短线 */
      const symDC = function (x, y, hw, w) { line(x - hw, y, x + hw, y, w); };
      /* 交流符号：一个「～」 */
      const symAC = function (x, y, hw, w) {
        if (EXT) { rec(x - hw, y - hw * 0.6); rec(x + hw, y + hw * 0.6); }
        if (!drawOn) return;
        c.setLineDash([]);
        c.beginPath();
        c.moveTo(x - hw, y);
        c.bezierCurveTo(x - hw * 0.33, y - hw * 1.1, x + hw * 0.33, y + hw * 1.1, x + hw, y);
        c.lineWidth = w; c.strokeStyle = INK; c.stroke();
      };

      /* 按角度间隔自动收缩字号，保证刻度数字不重叠（两项 ro 不同且径向拉开到一个行高以上＝错层） */
      const roOf = (it) => ((it && it.ro !== undefined) ? it.ro : 0);
      const layered = (a, b, fs) => Math.abs(roOf(a) - roOf(b)) * R >= fs;
      const fitFont = function (items, rr, spanDeg, fs0, offDeg, fsMin) {
        let fs = fs0, guard = 0, i, gap, w, j;
        const lo = Math.max(7, fsMin || 0);
        while (guard++ < 12) {
          c.font = fs + 'px ' + FONT_NUM;
          let okAll = true;
          for (i = 1; i < items.length; i++) {
            j = i - 1;
            while (j >= 0 && layered(items[j], items[i], fs)) j--;
            if (j < 0) continue;
            gap = Math.abs(items[i].t - items[j].t) * spanDeg * D2R * R * rr;
            if (j === 0 && offDeg) gap -= offDeg * D2R * R * rr;
            w = (c.measureText(items[i].l).width + c.measureText(items[j].l).width) / 2;
            if (w > gap * 0.86) { okAll = false; break; }
          }
          if (okAll || fs < lo) break;
          fs *= 0.9;
        }
        return fs;
      };

      /* ---- 绘制（原页面 scene()） ---- */
      const scene = function () {
        const A0 = 90 + HALF, A1 = 90 - HALF, SP = A0 - A1;
        const s = FSZ / 100;
        const lw = Math.max(1.4, LWB * R / 800);
        let f1 = Math.max(9, R * 0.038 * s);
        let f2 = Math.max(8, R * 0.034 * s);
        f2 = Math.min(f2, R * 0.044);            /* 三行数字不得互相压住 */
        let f3 = Math.max(8, R * 0.041 * s);
        let fB = Math.max(11, R * 0.069 * s);
        fB = Math.min(fB, 0.26 * Math.sin(HALF * D2R) * R);   /* 铭牌不宽过盘面 */

        c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash([]);

        /* 首列数字让开指针所在的那条半径 */
        const off0 = Math.min(2.6, Math.max(1.2, (SP / 5) * 0.24));

        const it2 = [], it3 = [];
        let k2;
        for (k2 = 0; k2 <= 5; k2++) { it2.push({ t: k2 / 5, l: '250' }); it3.push({ t: k2 / 5, l: (k2 * 0.5).toFixed(1) }); }
        f1 = fitFont(OHM, LABR, SP, f1, 0, R * 0.019);
        f2 = fitFont(it2, ROWV[2], SP, f2, off0);
        f3 = fitFont(it3, R3 - 0.078, SP, f3, off0);

        /* ---------- 一号弧：Ω ---------- */
        arc(R1, A0, A1, lw);

        const tl = [];
        let i, j;
        for (i = 0; i < OHM.length; i++) tl.push({ t: OHM[i].t, lv: 2, k: i });
        for (i = 1; i < OHM.length; i++) {
          const ta0 = OHM[i - 1].t, tb0 = OHM[i].t, dt = tb0 - ta0;
          const n = cl(Math.round(dt / 0.016), 1, 4);
          for (j = 1; j < n; j++) tl.push({ t: ta0 + dt * j / n, lv: (n === 4 && j === 2) ? 1 : 0, k: -1 });
        }
        tl.sort(function (a, b) { return a.t - b.t; });
        for (i = 0; i < tl.length; i++) {
          const tk = tl[i], ad = A0 - tk.t * SP;
          let len = (tk.lv === 2) ? 0.050 : (tk.lv === 1 ? 0.033 : 0.020);
          if (tk.k >= 0) len = Math.max(len, LABR + OHM[tk.k].ro - 0.026 - R1);
          tick(R1, R1 + len, ad, lw * (tk.lv === 2 ? 1.2 : (tk.lv === 1 ? 1 : 0.82)));
        }
        /* Ω 标签：字号已收敛到可读下限；极窄张角或小框下仍排不开的，就只留刻度线不印数 */
        const drawn = [];
        for (i = 0; i < OHM.length; i++) {
          const ad1 = A0 - OHM[i].t * SP, rr1 = LABR + OHM[i].ro;
          c.font = f1 + 'px ' + FONT_NUM;
          const wi = c.measureText(OHM[i].l).width;
          let okDraw = true;
          for (let k = drawn.length - 1; k >= 0; k--) {
            const d2 = drawn[k];
            if (layered(OHM[d2], OHM[i], f1)) continue;       /* 径向错开，互不干扰 */
            const gapPx = Math.abs(OHM[i].t - OHM[d2].t) * SP * D2R * R * LABR;
            if ((wi + c.measureText(OHM[d2].l).width) / 2 > gapPx - 2) okDraw = false;
            break;
          }
          if (!okDraw) continue;
          drawn.push(i);
          tag(OHM[i].l, rr1, ad1, f1, 90 - ad1);
        }

        /* ---------- 二号弧：V（三行） ---------- */
        arc(R2, A0, A1, lw);
        /* 50 小格：每格 = 满量程/50，读数才估读得到 0.05/0.2/1 V 这一档（20 格是画错的） */
        for (i = 0; i <= 50; i++) {
          const tv = i / 50, lv2 = (i % 10 === 0) ? 2 : ((i % 5 === 0) ? 1 : 0), ad2 = A0 - tv * SP;
          tick(R2, R2 - (lv2 === 2 ? 0.040 : (lv2 === 1 ? 0.027 : 0.015)), ad2, lw * (lv2 === 2 ? 1.2 : (lv2 === 1 ? 1 : 0.72)));
        }
        for (i = 0; i <= 5; i++) {
          const ad3 = A0 - (i / 5) * SP - (i === 0 ? off0 : 0);   /* 首个 0 避开指针所在的那条半径 */
          tag(String(i * 50), ROWV[0], ad3, f2, 90 - ad3);
          tag(String(i * 10), ROWV[1], ad3, f2, 90 - ad3);
          tag(String(i * 2), ROWV[2], ad3, f2, 90 - ad3);
        }

        /* ---------- 三号弧：A / V~ ---------- */
        arc(R3, A0, A1, lw);
        for (i = 0; i <= 50; i++) {
          const tv3 = i / 50, lv3 = (i % 10 === 0) ? 2 : ((i % 5 === 0) ? 1 : 0), ad4 = A0 - tv3 * SP;
          tick(R3, R3 - (lv3 === 2 ? 0.038 : (lv3 === 1 ? 0.026 : 0.014)), ad4, lw * (lv3 === 2 ? 1.2 : (lv3 === 1 ? 1 : 0.72)));
        }
        for (i = 0; i <= 5; i++) {
          const ad5 = A0 - (i / 5) * SP - (i === 0 ? off0 : 0);
          tag(String(i * 0.5), R3 - 0.078, ad5, f3, 90 - ad5);
        }

        /* ---------- 端口符号：贴在端口外侧，不接引线 ---------- */
        const p2 = polar(R2, A0), p3 = polar(R3, A0), p1r = polar(R1, A1);
        symDC(p2[0] - 0.078 * R, p2[1] - 0.032 * R, 0.024 * R, lw);   /* 中弧左端：直流 */
        symAC(p2[0] - 0.078 * R, p2[1] + 0.034 * R, 0.024 * R, lw);   /* 中弧左端：交流 */
        ta('V', p3[0] - 0.072 * R, p3[1] - 0.010 * R, f3);            /* 内弧左端：V */
        symAC(p3[0] - 0.072 * R, p3[1] + 0.052 * R, 0.024 * R, lw);   /* 内弧左端：~ */
        ta('Ω', p1r[0] + 0.052 * R, p1r[1] + 0.010 * R, f3);          /* 外弧右端：Ω */

        /* ---------- 盘面铭牌 ---------- */
        const yAV = (0.697 - (f3 + fB) * 0.62 / R - 0.024) * R;
        ta('A — V — Ω', 0, -yAV, fB);

        /* ---------- 指针（细杆 + 实心三角箭头，橙黄） ---------- */
        const pcol = '#f59e0b';
        const adp = A0 - T * SP;
        const ux = Math.cos(adp * D2R), uy = -Math.sin(adp * D2R);
        const rTail = R3 * 0.955, rTip = R1 + 0.004;
        const q0 = [ux * rTail * R, uy * rTail * R], q1 = [ux * rTip * R, uy * rTip * R];
        const al = 0.040 * R, hw = 0.0090 * R;
        const bx = q1[0] - ux * al, by = q1[1] - uy * al;
        rec(q0[0], q0[1]); rec(q1[0], q1[1]);
        rec(bx - uy * hw, by + ux * hw); rec(bx + uy * hw, by - ux * hw);
        if (!drawOn) return;
        c.setLineDash([]);
        c.beginPath(); c.moveTo(q0[0], q0[1]); c.lineTo(q1[0], q1[1]);
        c.lineWidth = Math.max(2, lw * 0.62); c.strokeStyle = pcol; c.stroke();
        c.beginPath();
        c.moveTo(q1[0], q1[1]);
        c.lineTo(bx - uy * hw, by + ux * hw);
        c.lineTo(bx + uy * hw, by - ux * hw);
        c.closePath(); c.fillStyle = pcol; c.fill();
      };

      /* 第一遍：R=800 量包围盒，定出缩放到设计画布的比例（原页面 layout() 的同款两遍） */
      R = 800; EXT = [1e9, 1e9, -1e9, -1e9]; drawOn = false; scene();
      const bw0 = Math.max(1, EXT[2] - EXT[0]), bh0 = Math.max(1, EXT[3] - EXT[1]);
      const k0 = Math.min((DW - 28) / (bw0 + 160), (DH - 28) / (bh0 + 160));
      R = Math.max(60, 800 * k0);

      /* 第二遍：用真实 R 再量一次，把内容放到设计画布正中 */
      EXT = [1e9, 1e9, -1e9, -1e9]; scene();
      const cx = DW / 2 - (EXT[0] + EXT[2]) / 2;
      const cy = DH / 2 - (EXT[1] + EXT[3]) / 2;

      c.save();
      c.translate(cx, cy);
      drawOn = true;
      try { scene(); } finally { c.restore(); }
    },
  });
})();

/* ── em_multimeter_use.js / em_multimeter_hookup ── */
/* 指针式万用表「使用与读数」：一张表盘，两张卡。
     em_multimeter_use     只画表（760×1200）—— 老板书里这张图的画布、坐标、参数全部不动；
     em_multimeter_hookup  表 + 被测电路 + 读数窗（1300×1280）—— 讲接法、给答案。
   两张卡共用 drawFace()：机身、表盘三条弧、玻璃扇环、选择开关、欧姆调零旋钮、正负插孔
   只在一处维护。单一数据源：RANGES（挡位/量程/刻度行/最小分度/估读位）+ OHM + readOf。
   读数窗默认关闭；关闭时画面仍是纯图形，不出现任何数字。 */
(function () {
  'use strict';
  const P = window.GW && window.GW.physShapes;
  if (!P || !P.emDefine) return;

  const DW = 760, DH = 1200;                      // 旧卡画布：老板书里的尺寸，一个数字都不动
  const HDW = 1300, HDH = 1280;                   // 新卡画布：表 1:1 + 右侧电路与读数窗
  const D2R = Math.PI / 180;
  const FONT_NUM = '"Times New Roman",Georgia,"Songti SC",serif';
  const FONT_CN = '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
  const INK = '#15171a', DIM = '#6b7280', ACC = '#c2410c';
  /* 整机配色：米黄机身 + 近白表盘 + 炭灰旋钮 + 红/黑表笔插孔；刻度与文字保持墨色 */
  const CASE_OUT = '#dccca4', CASE_IN = '#f7f1df';
  const DIAL_OUT = '#d2d8de', DIAL_IN = '#fffdf6';
  const KNOB = '#59616b', KNOB_IN = '#6f7782', HUB = '#d9dee3';
  const METAL = '#b9c1c9', METAL_D = '#98a1ab';
  const JACK_POS = '#d94b3f', JACK_POS_IN = '#b2392f';
  const JACK_NEG = '#272c32', JACK_NEG_IN = '#0b0e11';
  const RED = '#c0392b';
  const RMID = 15;                                  // Ω 中值电阻，与 em_multimeter 一致
  /* 二极管正向在欧姆刻度上的读数（Ω）。它是「刻度读数」，要乘倍率才是结果：
     ×10 挡 → 12 Ω，×100 挡 → 120 Ω —— 之前把 12 Ω 写死，等于漏乘了倍率。 */
  const DIODE_FWD = 1.2;
  const tOfR = (r) => RMID / (RMID + r);            // Ω 刻度 → 指针归一化位置
  const rOfT = (t) => (t >= 1 ? 0 : (t <= 0 ? Infinity : RMID * (1 - t) / t));
  const LIN = { rows: [250, 50, 10], base: 50, inner: 2.5 };

  /* Ω 基础刻度：与指针 T 用同一条 tOfR / rOfT 映射，不手写不拟合 */
  const OHM = [
    { l: '∞', t: 0, ro: 0 }, { l: '1k', t: tOfR(1000), ro: 0.034 },
    { l: '500', t: tOfR(500), ro: 0 }, { l: '200', t: tOfR(200), ro: 0 },
    { l: '100', t: tOfR(100), ro: 0 }, { l: '50', t: tOfR(50), ro: 0 },
    { l: '40', t: tOfR(40), ro: 0 }, { l: '30', t: tOfR(30), ro: 0 },
    { l: '20', t: tOfR(20), ro: 0 }, { l: '15', t: tOfR(15), ro: 0 },
    { l: '10', t: tOfR(10), ro: 0 }, { l: '5', t: tOfR(5), ro: 0 },
    { l: '0', t: 1, ro: 0 },
  ];

  /* 挡位表：kind V=直流电压 / A=直流电流 / R=电阻；fs 量程；mult 倍率；
     deg = 选择开关方位角（0 正上、顺时针为正）。Ω 挡的倍率就是挡位本身，
     所以「非法挡位 / 非法倍率」都落在同一个 0..13 枚举白名单上。
     row/div/est = 读数用哪一行刻度、最小分度、估读到几位小数（见下方 readOf 注释）。
     一号线性弧画 50 小格，于是每小格恒等于 量程/50，估读规则才能一一对上。 */
  const RANGES = [
    { id: 0,  label: '2.5 V',   kind: 'V', fs: 2.5,   deg: 207, row: 250, div: 0.05, est: 2 },
    { id: 1,  label: '10 V',    kind: 'V', fs: 10,    deg: 189, row: 10,  div: 0.2,  est: 1 },
    { id: 2,  label: '50 V',    kind: 'V', fs: 50,    deg: 171, row: 50,  div: 1,    est: 1 },
    { id: 3,  label: '250 V',   kind: 'V', fs: 250,   deg: 153, row: 250, div: 5,    est: 0 },
    { id: 4,  label: '500 V',   kind: 'V', fs: 500,   deg: 135, row: 50,  div: 10,   est: 0 },
    /* 直流电流挡 5 挡：全部实用量程、盘面带单位；从上到下量程由大到小 */
    { id: 5,  label: '2.5 mA',  kind: 'A', fs: 2.5,   deg: 225, unit: 'mA', row: 250, div: 0.05, est: 2 },
    { id: 6,  label: '25 mA',   kind: 'A', fs: 25,    deg: 243, unit: 'mA', row: 50,  div: 0.5,  est: 1 },
    { id: 7,  label: '250 mA',  kind: 'A', fs: 250,   deg: 261, unit: 'mA', row: 250, div: 5,    est: 0 },
    /* 电阻倍率 4 挡：×1k→×100→×10→×1 从左到右，全在 Ω 扇区内 */
    { id: 8,  label: '×1',      kind: 'R', mult: 1,    deg: 27 },
    { id: 9,  label: '×10',     kind: 'R', mult: 10,   deg: 9 },
    { id: 10, label: '×100',    kind: 'R', mult: 100,  deg: 351 },
    { id: 11, label: '×1k',     kind: 'R', mult: 1000, deg: 333 },
    { id: 12, label: '500 mA',  kind: 'A', fs: 500,   deg: 279, unit: 'mA', row: 50,  div: 10,   est: 0 },
    { id: 13, label: '2.5 A',   kind: 'A', fs: 2500,  deg: 297, unit: 'A',  row: 50,  div: 0.05, est: 2 },
  ];
  /* 右侧 V~ 交流区与 OFF：按参考图保留盘面标记，首版不启用、不进 hint 枚举 */
  const ACV = [
    { l: '2.5V~', deg: 45 }, { l: '10V~', deg: 63 }, { l: '50V~', deg: 81 },
    { l: '250V~', deg: 99 }, { l: '500V~', deg: 117 },
  ];

  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const fmt = (v) => {
    if (!isFinite(v)) return '∞';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1000) return String(Math.round(v));
    if (a >= 100) return String(Math.round(v * 10) / 10);
    return String(Math.round(v * 100) / 100);
  };

  /* 唯一的读数换算：线性挡按 0–50 刻度折算量程；Ω 挡先读基础刻度再乘倍率。
     答案、换算过程、操作提示、刻度高亮、挡位标题全部取这个返回值。 */
  function readOf(rangeIdx, t) {
    const idx = clamp(Math.round(num(rangeIdx, 2)), 0, RANGES.length - 1);
    const R = RANGES[idx];
    const T = clamp(num(t, 0.6), 0, 1);
    const lin50 = LIN.base * T;
    let base, result, unit, scaleLabel, scaleText, process;
    if (R.kind === 'R') {
      base = rOfT(T);
      result = base * R.mult;
      unit = 'Ω';
      scaleLabel = 'Ω 基础刻度';
      scaleText = fmt(base);
      process = 'Ω 基础刻度 ' + fmt(base) + ' × ' + R.mult + ' = ' + fmt(result) + ' Ω';
    } else {
      base = lin50;
      unit = R.kind === 'V' ? 'V' : (R.unit || 'mA');
      result = (lin50 / LIN.base) * R.fs;
      if (unit === 'A') result /= 1000;          // fs 以 mA 为基准，A 挡换算成安培
      scaleLabel = '0–50 刻度';
      scaleText = fmt(lin50);
      const fsShow = unit === 'A' ? R.fs / 1000 : R.fs;
      process = '0–50 刻度 ' + fmt(lin50) + ' ÷ 50 × ' + fmt(fsShow) + ' ' + unit
        + ' = ' + fmt(result) + ' ' + unit;
    }
    const kindName = R.kind === 'V' ? '直流电压' : (R.kind === 'A' ? '直流电流' : '电阻');
    const tip = R.kind === 'V'
      ? '电压挡：万用表并联接入被测电路；先选较大量程，再逐挡减小。'
      : (R.kind === 'A'
        ? '电流挡：万用表串联接入被测电路；不可直接跨接电源两端。'
        : '电阻挡：被测电路必须断电；短接表笔做欧姆调零，更换倍率挡后要重新调零。');
    return {
      idx, range: R, T, lin50, base, result, unit, scaleLabel, scaleText, process,
      answer: fmt(result) + ' ' + unit, kindName, tip,
      title: kindName + ' · ' + R.label,
    };
  }
  /* 表笔状态决定指针停在哪：测量 = 老师给定的位置；悬空 = 回零（Ω 挡落到 ∞）；
     短接 = 线性挡回零、Ω 挡落到欧姆零点，没调好零时差一点点（欧姆调零旋钮 zero<1）。
     三个状态都只在「老师显式选了」时生效，默认仍是 emMuT 说话。 */
  function needleT(rangeIdx, t, probe, zero) {
    const R = RANGES[clamp(Math.round(num(rangeIdx, 2)), 0, RANGES.length - 1)];
    const p = clamp(Math.round(num(probe, 0)), 0, 2);
    const z = clamp(num(zero, 1), 0, 1);
    if (p === 1) return 0;
    if (p === 2) return R.kind === 'R' ? 1 - (1 - z) * 0.10 : 0;
    return clamp(num(t, 0.6), 0, 1);
  }
  /* 读数窗的数值与文字：与 readOf 同一套量程数据，但按「估读」重新排版
     —— 小数位数由 RANGES.est 决定，末尾的 0 一律保留（1.50 V 不能写成 1.5 V）。 */
  function sig2(v) {
    if (!isFinite(v)) return '∞';
    if (v === 0) return '0';
    const a = Math.abs(v);
    const d = a >= 10 ? 0 : (a >= 1 ? 1 : 2);
    return v.toFixed(d);
  }
  function readCard(rangeIdx, T, probe, sk) {
    const R = RANGES[rangeIdx];
    const isR = R.kind === 'R';
    /* 挡位与接法必须同一类：V 接法配电压挡、A 配电流挡、电阻与二极管配电阻挡。
       不是一类就不给数字，直接说清楚该换哪一挡 —— 这是唯一允许出现的提示语。 */
    const need = sk === 'V' ? 'V' : (sk === 'A' ? 'A' : 'R');
    if (R.kind !== need) {
      const needTxt = need === 'V' ? '电压挡（V）' : (need === 'A' ? '电流挡（mA / A）' : '电阻挡（Ω）');
      const curTxt = isR ? ('电阻 ' + R.label)
        : (R.label + (R.kind === 'V' ? ' 直流电压' : ' 直流电流'));
      return {
        l1: '挡位与接法不符', num: '—', unit: '',
        l3: '这组接法要用 ' + needTxt, l4: '现在是 ' + curTxt + '，换挡后再读数',
      };
    }
    let l1 = '', l2 = '', l3 = '', l4 = '', unit = '';
    const isDiode = sk === 'D' || sk === 'DR';
    if (isR || isDiode) {
      /* 电阻挡与二极管走同一条换算：结果 = 欧姆刻度读数 × 倍率。
         二极管的正向读数不写死（以前写死 12 Ω，等于漏乘倍率）：指针固定在
         刻度 1.2 Ω 处，×10 → 12 Ω、×100 → 120 Ω、×1k → 1200 Ω。 */
      const base = rOfT(T), res = base * R.mult;
      unit = 'Ω';
      l2 = isFinite(base) ? sig2(res) : '∞';
      if (sk === 'D') {
        if (probe === 0 && isFinite(base)) l2 = '≈ ' + l2;
        l1 = '电阻 ' + R.label + ' 挡 · 正向';
        l3 = '欧姆刻度 ' + sig2(base) + ' × ' + R.mult;
        l4 = '黑表笔接正极（内部电池 +）';
      } else if (sk === 'DR') {
        l1 = '电阻 ' + R.label + ' 挡 · 反向';
        l3 = '反向截止 · 指针回到左端';
        l4 = '二极管反插，指针仍指 ∞';
      } else {
        l1 = '电阻 ' + R.label + ' 挡（中值 15 Ω）';
        l3 = '欧姆刻度 ' + sig2(base) + ' × ' + R.mult;
        l4 = '刻度不均匀 · 取中值附近 · 保留 2 位有效数字';
      }
    } else {
      l1 = (R.kind === 'V' ? '直流电压 · ' : '直流电流 · ') + R.label + ' 挡';
      unit = R.kind === 'A' ? (R.unit || 'mA') : 'V';
      const fsDisp = unit === 'A' ? R.fs / 1000 : R.fs;
      const v = T * fsDisp;
      l2 = v.toFixed(R.est);
      const rowV = R.row * T;
      const rowTxt = R.row >= 100 ? String(Math.round(rowV)) : rowV.toFixed(1);
      const f = fsDisp / R.row;
      const conv = Math.abs(f - 1) < 1e-9 ? '' : (f > 1 ? (' × ' + Math.round(f)) : (' ÷ ' + Math.round(1 / f)));
      l3 = '0–' + R.row + ' 刻度 ' + rowTxt + conv;
      const estTxt = R.est === 0 ? '1' : (R.est === 1 ? '0.1' : '0.01');
      l4 = '最小分度 ' + String(R.div) + ' ' + unit + ' ｜ 估读到 ' + estTxt + ' ' + unit;
    }
    if (probe === 1) {
      l3 = '表笔未接入';
      l4 = '指针回到零位';
    } else if (probe === 2) {
      l3 = (isR || isDiode) ? '两表笔短接 · 欧姆调零' : '两表笔短接';
      l4 = (isR || isDiode) ? '短接后指针应指 0 Ω' : '指针回到零位';
    }
    return { l1, num: l2, unit, l3, l4 };
  }
  P.emMuRanges = RANGES;
  P.emMuOhm = OHM;
  P.emMuRead = readOf;
  P.emMuNeedle = needleT;
  P.emMuCard = readCard;          // 读数窗排版（单测断言用）

  /* ---------- 基础图元（只用 Canvas 2D 基础 API，静态 SVG 导出可逐笔录制） ---------- */
  function T_(c, s, x, y, fs, font, align, col) {
    c.font = fs + 'px ' + (font || FONT_CN);
    c.textAlign = align || 'center';
    c.fillStyle = col || INK;
    c.fillText(s, x, y);
  }
  function L_(c, x0, y0, x1, y1, w, col) {
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
    c.lineWidth = w; c.strokeStyle = col || INK; c.stroke();
  }
  function C_(c, x, y, rad, w, col, fill) {
    c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (w) { c.lineWidth = w; c.strokeStyle = col || INK; c.stroke(); }
  }
  function R_(c, x, y, w, h, rad, lw, col, fill) {
    const q = Math.min(rad, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + q, y); c.lineTo(x + w - q, y);
    c.arc(x + w - q, y + q, q, -Math.PI / 2, 0);
    c.lineTo(x + w, y + h - q); c.arc(x + w - q, y + h - q, q, 0, Math.PI / 2);
    c.lineTo(x + q, y + h); c.arc(x + q, y + h - q, q, Math.PI / 2, Math.PI);
    c.lineTo(x, y + q); c.arc(x + q, y + q, q, Math.PI, Math.PI * 1.5);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (lw) { c.lineWidth = lw; c.strokeStyle = col || INK; c.stroke(); }
  }
  /* 交流符号：两拱波浪，跨度和线宽与直流直线一致，摆在一起才像正规盘面 */
  function W_(c, x0, x1, y, w, col) {
    const dx = x1 - x0, amp = Math.min(5, Math.abs(dx) * 0.12);
    c.beginPath(); c.moveTo(x0, y);
    c.bezierCurveTo(x0 + dx * 0.17, y - amp, x0 + dx * 0.33, y - amp, x0 + dx * 0.5, y);
    c.bezierCurveTo(x0 + dx * 0.67, y + amp, x0 + dx * 0.83, y + amp, x1, y);
    c.lineWidth = w; c.strokeStyle = col || INK; c.stroke();
  }

  /* ---------- 整机正面（两张卡共用） ----------
     st = { ri, zero, T, ticks }；返回指针的角度（度），供调用方画高亮/引线。 */
  function drawFace(c, st) {
    const ri = st.ri, zero = st.zero, T = st.T, NL = st.ticks || 50;
    const RG = RANGES[ri];

    c.lineCap = 'round'; c.lineJoin = 'round';
    c.setLineDash([]);
    c.textBaseline = 'middle';

    /* ---------- 整机正面 ---------- */
    R_(c, 58, 26, 644, 1024, 46, 2.4, INK, CASE_OUT);
    R_(c, 72, 40, 616, 996, 36, 1.6, INK, CASE_IN);

    /* ---------- 表盘窗口 ---------- */
    R_(c, 100, 100, 560, 440, 34, 2.2, INK, DIAL_OUT);
    R_(c, 112, 112, 536, 416, 26, 1.2, INK, DIAL_IN);

    const CX = 380, CY = 508, RAD = 360, HALF = 36;
    const A0 = 90 + HALF, A1 = 90 - HALF, SP = A0 - A1;
    const f1 = 17, f2 = 15, fB = 26;
    const polar = (q, ad) => [CX + RAD * q * Math.cos(ad * D2R), CY - RAD * q * Math.sin(ad * D2R)];
    const arcAt = (q, a0, a1, w, col) => {
      c.beginPath(); c.arc(CX, CY, RAD * q, -a0 * D2R, -a1 * D2R, false);
      c.lineWidth = w; c.strokeStyle = col || INK; c.stroke();
    };
    const tick = (q0, q1, ad, w, col) => {
      const a = polar(q0, ad), b = polar(q1, ad);
      L_(c, a[0], a[1], b[0], b[1], w, col);
    };
    const tag = (s, q, ad, fs, col) => {
      const p = polar(q, ad);
      c.save(); c.translate(p[0], p[1]); c.rotate((90 - ad) * D2R);
      c.font = fs + 'px ' + FONT_NUM; c.textAlign = 'center';
      c.fillStyle = col || INK; c.fillText(s, 0, 0); c.restore();
    };

    /* ---------- 表盘玻璃：一圈扇环罩住整个刻度盘 ---------- */
    /* 内径 0.29R（刚好在铭牌上方）、外径 1.12R 超出窗口，再由窗口圆角裁剪，
       于是玻璃上沿与表盘窗口边框重合，两侧与内缘是清晰的扇环边界。 */
    const GI = 0.290, GO = 1.120, GAG0 = 137, GAG1 = 43;
    const glassPath = () => {
      c.beginPath();
      c.arc(CX, CY, RAD * GO, -GAG0 * D2R, -GAG1 * D2R, false);
      const g1 = polar(GI, GAG1);
      c.lineTo(g1[0], g1[1]);
      c.arc(CX, CY, RAD * GI, -GAG1 * D2R, -GAG0 * D2R, true);
      c.closePath();
    };
    /* 玻璃内的一切（指针、反光、边框）都裁到「扇环 ∩ 表盘窗口」里 */
    const inGlass = (fn) => {
      c.save();
      R_(c, 112, 112, 536, 416, 26, 0, null);      // 只建路径、不描边
      c.clip();
      glassPath(); c.clip();
      fn();
      c.restore();
    };
    /* 玻璃本体的淡色（在刻度之前画，保证刻度数字的对比度不被削弱） */
    inGlass(() => { glassPath(); c.fillStyle = 'rgba(196,219,236,0.26)'; c.fill(); });

    /* 一号弧：Ω（非线性，左 ∞ → 右 0 Ω） */
    arcAt(1.000, A0, A1, 1.8);
    const tl = [];
    let i, j;
    for (i = 0; i < OHM.length; i++) tl.push({ t: OHM[i].t, lv: 2, k: i });
    for (i = 1; i < OHM.length; i++) {
      const ta0 = OHM[i - 1].t, tb0 = OHM[i].t, dt = tb0 - ta0;
      const n = clamp(Math.round(dt / 0.016), 1, 4);
      for (j = 1; j < n; j++) tl.push({ t: ta0 + dt * j / n, lv: (n === 4 && j === 2) ? 1 : 0, k: -1 });
    }
    tl.sort((a, b) => a.t - b.t);
    for (i = 0; i < tl.length; i++) {
      const tk = tl[i], ad = A0 - tk.t * SP;
      let len = tk.lv === 2 ? 0.050 : (tk.lv === 1 ? 0.033 : 0.020);
      if (tk.k >= 0) len = Math.max(len, 1.072 + OHM[tk.k].ro - 0.026 - 1.000);
      tick(1.000, 1.000 + len, ad, 1.6 * (tk.lv === 2 ? 1.2 : (tk.lv === 1 ? 1 : 0.82)));
    }
    const drawn = [];
    for (i = 0; i < OHM.length; i++) {
      const ad = A0 - OHM[i].t * SP, q = 1.072 + OHM[i].ro;
      c.font = f1 + 'px ' + FONT_NUM;
      const wi = c.measureText(OHM[i].l).width;
      let ok = true;
      if (drawn.length) {
        const d2 = drawn[drawn.length - 1];
        const gap = Math.abs(OHM[i].t - d2.t) * SP * D2R * RAD * 1.072;
        if ((wi + c.measureText(d2.l).width) / 2 > gap - 2) ok = false;
      }
      if (!ok) continue;
      drawn.push(OHM[i]);
      tag(OHM[i].l, q, ad, f1);
    }

    /* 二号弧：V / A 线性刻度（0–250 / 0–50 / 0–10 三行，50 小格） */
    arcAt(0.948, A0, A1, 1.8);
    for (i = 0; i <= NL; i++) {
      const tv = i / NL, lv = (i % 10 === 0) ? 2 : ((i % 5 === 0) ? 1 : 0), ad = A0 - tv * SP;
      tick(0.948, 0.948 - (lv === 2 ? 0.040 : (lv === 1 ? 0.027 : 0.015)), ad,
        1.6 * (lv === 2 ? 1.2 : (lv === 1 ? 1 : 0.72)));
    }
    for (i = 0; i <= 5; i++) {
      const ad = A0 - (i / 5) * SP - (i === 0 ? 2 : 0);
      tag(String(i * 50), 0.892, ad, f2);
      tag(String(i * 10), 0.852, ad, f2);
      tag(String(i * 2), 0.812, ad, f2);
    }

    /* 三号弧：A / V~ 的 0–2.5 刻度（同样 50 小格，每格 0.05） */
    arcAt(0.775, A0, A1, 1.8);
    for (i = 0; i <= NL; i++) {
      const tv = i / NL, lv = (i % 10 === 0) ? 2 : ((i % 5 === 0) ? 1 : 0), ad = A0 - tv * SP;
      tick(0.775, 0.775 - (lv === 2 ? 0.038 : (lv === 1 ? 0.026 : 0.014)), ad,
        1.6 * (lv === 2 ? 1.2 : (lv === 1 ? 1 : 0.72)));
    }
    for (i = 0; i <= 5; i++) {
      const ad = A0 - (i / 5) * SP - (i === 0 ? 2 : 0);
      tag(String(i * 0.5), 0.697, ad, f2);
    }

    /* 端口符号：V/A 直接压在二号弧左端外侧（放引线反而像划痕），
       直流直线与交流波浪等长、等粗、同起点，摆在一起才是正规盘面 */
    const pR = polar(1.000, A1);
    T_(c, 'V', 138, 234, 16, FONT_NUM, 'center', INK);
    T_(c, 'A', 158, 234, 16, FONT_NUM, 'center', INK);
    L_(c, 128, 247, 168, 247, 2.2, INK);            /* 直流：一根短直线 */
    W_(c, 128, 168, 261, 2.2, INK);                 /* 交流：一根等宽的波浪 */
    T_(c, 'Ω', pR[0] + 22, pR[1] + 6, 18, FONT_NUM, 'center', INK);
    T_(c, '5000 Ω/V', 138, 392, 12, FONT_NUM, 'left', DIM);
    T_(c, '2500 Ω/V~', 138, 410, 12, FONT_NUM, 'left', DIM);
    T_(c, 'A — V — Ω', CX, 452, fB, FONT_NUM, 'center', INK);

    /* 三号弧左端：2.5 V~ 专用刻度的同类标注（V + 同一根波浪） */
    const p3 = polar(0.775, A0);
    L_(c, 190, 303, p3[0] - 5, p3[1] + 7, 1.2, INK);
    T_(c, 'V', 176, 313, 15, FONT_NUM, 'center', INK);
    W_(c, 161, 191, 327, 2.0, INK);

    /* 右端欧姆零点的端点标记 */
    C_(c, pR[0], pR[1], 4, 0, null, ACC);
    L_(c, pR[0], pR[1], pR[0] + 14, pR[1] + 20, 1.4, ACC);

    /* 指针：一根穿过扇环的长针，只在玻璃内可见 */
    const adp = A0 - T * SP;
    const ux = Math.cos(adp * D2R), uy = -Math.sin(adp * D2R);
    const at = (q) => [CX + RAD * q * ux, CY + RAD * q * uy];
    inGlass(() => {
      const s0 = at(0.020), s1 = at(1.024), s2 = at(1.062);
      L_(c, s0[0], s0[1], s1[0], s1[1], 2.5, ACC);
      const hw2 = 7.2;
      c.beginPath();
      c.moveTo(s2[0], s2[1]);
      c.lineTo(s1[0] - uy * hw2, s1[1] + ux * hw2);
      c.lineTo(s1[0] + uy * hw2, s1[1] - ux * hw2);
      c.closePath(); c.fillStyle = ACC; c.fill();
    });

    /* 玻璃边框＋内缘高光：压在指针之上，读起来才是「指针在玻璃后面」 */
    inGlass(() => {
      glassPath();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(96,118,138,0.60)'; c.stroke();
      c.beginPath(); c.arc(CX, CY, RAD * (GI + 0.016), -124 * D2R, -96 * D2R, false);
      c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,0.55)'; c.stroke();
    });

    /* 表盘下沿 + 机械调零螺钉（A） */
    L_(c, 112, 528, 648, 528, 2, INK);
    C_(c, 250, 562, 12, 1.8, INK, METAL);
    C_(c, 510, 562, 12, 1.8, INK, METAL);
    C_(c, 380, 562, 21, 2.2, INK, METAL_D);
    L_(c, 366, 562, 394, 562, 2.6, INK);

    /* A / B / C 三条引线 */
    T_(c, 'A', 18, 562, 28, FONT_NUM, 'left', INK);
    L_(c, 48, 562, 355, 562, 1.8, INK);
    T_(c, 'B', 18, 810, 28, FONT_NUM, 'left', INK);
    L_(c, 48, 810, 178, 810, 1.8, INK);
    T_(c, 'C', 728, 752, 28, FONT_NUM, 'left', INK);
    L_(c, 622, 752, 716, 752, 1.8, INK);

    /* 选择开关：挡位标记 + 当前挡位高亮 + 指向该标记的旋钮手柄 */
    const KX = 300, KY = 810;
    C_(c, KX, KY, 120, 2.2, INK, KNOB);
    C_(c, KX, KY, 74, 1.6, DIM, KNOB_IN);
    const mark = (label, deg, on, dim) => {
      const s1 = Math.sin(deg * D2R), c1 = Math.cos(deg * D2R);
      const x0 = KX + 126 * s1, y0 = KY - 126 * c1;   // 刻度线紧贴开关外圈（r=120）
      const x1 = KX + 144 * s1, y1 = KY - 144 * c1;
      const xt = KX + 170 * s1, yt = KY - 170 * c1;   // 挡位文字随刻度一起收紧
      L_(c, x0, y0, x1, y1, on ? 3 : 1.6, on ? ACC : (dim ? DIM : INK));
      const fs = on ? 15 : (String(label).length >= 6 ? 11.5 : 12.5);  // 带单位的长标签自动缩一号
      T_(c, label, xt, yt, fs, FONT_CN, 'center', on ? ACC : (dim ? DIM : INK));
      if (on) {                       // 当前挡位：橙色 + 下划线，不再用会压字的圆点
        const hw2 = c.measureText(label).width / 2 + 4;
        L_(c, xt - hw2, yt + 12, xt + hw2, yt + 12, 2, ACC);
      }
    };
    for (i = 0; i < RANGES.length; i++) mark(RANGES[i].label, RANGES[i].deg, RANGES[i].id === ri, false);
    for (i = 0; i < ACV.length; i++) mark(ACV[i].l, ACV[i].deg, false, false);
    mark('OFF', 315, false, false);
    /* 扇区分界线：正好落在五个均匀扇区的边界上，红色 */
    for (const bd of [36, 126, 216, 306, 324]) {
      const s1 = Math.sin(bd * D2R), c1 = Math.cos(bd * D2R);
      L_(c, KX + 122 * s1, KY - 122 * c1, KX + 185 * s1, KY - 185 * c1, 2.2, RED);
    }
    /* 四个挡位区的功能符号：放在各均匀扇区中心的外侧，紧贴本区挡位 */
    T_(c, 'Ω', 300, 605, 19, FONT_NUM, 'center', INK);
    T_(c, 'mA', 88, 860, 16, FONT_NUM, 'center', INK);        // 内框内侧，避开 250 mA 与 B 引线
    L_(c, 74, 873, 102, 873, 1.4, INK);                        // 直流下划线
    T_(c, 'V', 332, 1012, 17, FONT_NUM, 'center', INK);
    L_(c, 324, 1025, 340, 1025, 1.4, INK);                     // 直流下划线
    T_(c, 'V', 502, 778, 17, FONT_NUM, 'center', INK);
    W_(c, 493, 511, 764, 1.4, INK);                            // 交流波浪线
    c.save();
    c.translate(KX, KY); c.rotate(RG.deg * D2R);
    c.beginPath();
    c.moveTo(-11, -30); c.lineTo(11, -30); c.lineTo(6, -108); c.lineTo(-6, -108);
    c.closePath(); c.fillStyle = ACC; c.fill();
    c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke();
    c.restore();
    C_(c, KX, KY, 26, 2, INK, HUB);

    /* 欧姆调零旋钮（C） */
    const OX = 585, OY = 752;
    C_(c, OX, OY, 35, 2.2, INK, METAL);
    C_(c, OX, OY, 22, 1.4, DIM, METAL_D);
    C_(c, OX, OY, 7, 1.6, INK, HUB);
    /* 一字槽跟着「欧姆调零」参数转：zero=1 是已经调到零位的样子 */
    c.save(); c.translate(OX, OY); c.rotate((-125 + zero * 250) * D2R);
    L_(c, -16, 0, 16, 0, 3, INK);
    c.restore();
    c.beginPath(); c.arc(OX, OY, 29, -0.35 * Math.PI, 0.85 * Math.PI);
    c.lineWidth = 2; c.strokeStyle = ACC; c.stroke();
    const ax = OX + 29 * Math.cos(0.85 * Math.PI), ay = OY + 29 * Math.sin(0.85 * Math.PI);
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax - 8, ay - 4); c.lineTo(ax - 2, ay - 10);
    c.closePath(); c.fillStyle = ACC; c.fill();
    T_(c, 'Ω', OX, OY + 50, 14, FONT_NUM, 'center', INK);

    /* 正负表笔插孔 */
    C_(c, 585, 872, 20, 2.2, INK, JACK_POS);            // 正插孔：红
    C_(c, 585, 872, 9, 1.6, '#f0b3ac', JACK_POS_IN);
    C_(c, 585, 950, 20, 2.2, INK, JACK_NEG);            // 负插孔：黑
    C_(c, 585, 950, 9, 1.6, '#9aa1a9', JACK_NEG_IN);
    T_(c, '+', 550, 848, 18, FONT_NUM, 'center', RED);
    T_(c, '−', 550, 926, 18, FONT_NUM, 'center', INK);

    return adp;
  }

  /* ---------- 表笔：笔尖在 tip，笔身朝 ang 方向（canvas 角度） ---------- */
  function drawPen(c, tip, ang, body, edge) {
    c.save(); c.translate(tip[0], tip[1]); c.rotate(ang);
    c.beginPath();                                           // 金属笔尖（锥形）
    c.moveTo(0, 0); c.lineTo(28, -5.6); c.lineTo(28, 5.6); c.closePath();
    c.fillStyle = METAL; c.fill(); c.lineWidth = 1.1; c.strokeStyle = METAL_D; c.stroke();
    c.beginPath(); c.rect(28, -8.5, 9, 17);                  // 笔尖根部护环
    c.fillStyle = '#8e969e'; c.fill(); c.strokeStyle = METAL_D; c.stroke();
    c.beginPath();                                           // 笔身（尾部圆头）
    c.moveTo(37, -9);
    c.lineTo(86, -6.5);
    c.quadraticCurveTo(98, -6.5, 98, 0);
    c.quadraticCurveTo(98, 6.5, 86, 6.5);
    c.lineTo(37, 9);
    c.closePath();
    c.fillStyle = body; c.fill(); c.lineWidth = 1.6; c.strokeStyle = edge; c.stroke();
    c.restore();
  }
  const tailOf = (tip, ang) => [tip[0] + Math.cos(ang) * 98, tip[1] + Math.sin(ang) * 98];
  /* 导线：插孔 → 抬到 runY → 横走 → 落到笔尾；全程只做 S 形过渡，不与另一根交叉 */
  function drawLead(c, x0, y0, runY, tail, col) {
    const tx = tail[0], ty = tail[1];
    const mx = Math.max(x0 + 120, Math.min(tx - 30, (x0 + tx) / 2));
    c.beginPath();
    c.moveTo(x0, y0);
    c.bezierCurveTo(x0 + 46, y0, x0 + 86, runY, mx, runY);
    c.lineTo(tx - 26, runY);
    c.quadraticCurveTo(tx, runY, tx, ty);
    c.lineWidth = 4.2; c.strokeStyle = col; c.stroke();
  }

  /* ---------- 被测电路（新卡右下，比表小一圈；放大画布即可看清） ---------- */
  const CL = 800, CR = 1240, CT = 940, CB = 1210, BX = 1020;
  function drawCircuit(c, sk) {
    const W = (x0, y0, x1, y1, w) => L_(c, x0, y0, x1, y1, w || 3, INK);
    if (sk === 'V' || sk === 'A') {
      W(CL, CT, BX - 34, CT);
      W(BX + 34, CT, sk === 'V' ? CR : 1100, CT);
      if (sk === 'A') W(1190, CT, CR, CT);
      C_(c, BX, CT, 34, 3, INK, '#fff');                   // 小灯泡
      L_(c, BX - 24, CT - 24, BX + 24, CT + 24, 2, INK);
      L_(c, BX + 24, CT - 24, BX - 24, CT + 24, 2, INK);
      W(CL, CT, CL, CB);                                    // 左边缘
      W(CL, CB, 944, CB);
      L_(c, 944, CB - 24, 944, CB + 24, 4.6, INK);          // 电池负极（短粗）
      L_(c, 962, CB - 34, 962, CB + 34, 2.6, INK);          // 电池正极（长细）
      W(962, CB, 1060, CB);
      C_(c, 1060, CB, 5, 0, INK, INK);
      C_(c, 1170, CB, 5, 0, INK, INK);
      L_(c, 1060, CB, 1148, CB - 46, 3, INK);               // 开关刀（常开）
      W(1170, CB, CR, CB);
      W(CR, CB, CR, CT);
    } else if (sk === 'R') {
      W(890, 1115, 960, 1115); W(1080, 1115, 1150, 1115);
      R_(c, 960, 1093, 120, 44, 2, 3, INK, '#fff');
      T_(c, 'R', 1014, 1068, 26, FONT_NUM, 'center', INK);
      T_(c, 'x', 1034, 1076, 16, FONT_NUM, 'center', INK);
    } else {
      W(910, 1115, 980, 1115); W(1060, 1115, 1140, 1115);
      /* 正接：三角在左、竖线在右（阳极在左）；反接：整个符号左右镜像，
         黑笔（左）落在阴极上、红笔（右）落在阳极上 —— 反偏截止。 */
      const dA = (sk === 'DR') ? 1060 : 980, dB = (sk === 'DR') ? 980 : 1060;
      c.beginPath();
      c.moveTo(dA, 1093); c.lineTo(dA, 1137); c.lineTo(dB, 1115);
      c.closePath(); c.fillStyle = INK; c.fill();      // 实心三角：填充与导线同色，深色主题随 emCtx 反相
      c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
      L_(c, dB, 1093, dB, 1137, 3, INK);
      T_(c, 'D', 1020, 1074, 19, FONT_NUM, 'center', INK);
    }
  }

  /* ---------- 读数窗（默认不画） ---------- */
  function drawReadout(c, rd) {
    R_(c, 760, 300, 500, 360, 20, 2.4, INK, '#fffdf6');
    R_(c, 774, 314, 472, 332, 14, 1.2, '#c9c3ae', null);
    T_(c, rd.l1, 800, 356, 22, FONT_CN, 'left', DIM);
    c.font = '88px ' + FONT_NUM; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = INK; c.fillText(rd.num, 800, 446);
    const wn = c.measureText(rd.num).width;
    if (rd.unit) {
      c.font = '40px ' + FONT_NUM;
      c.fillText(rd.unit, 800 + wn + 12, 452);
    }
    L_(c, 800, 486, 1230, 486, 1.4, '#d8d3c0');
    T_(c, rd.l3, 800, 528, 19, FONT_CN, 'left', INK);
    T_(c, rd.l4, 800, 578, 18, FONT_CN, 'left', DIM);
  }

  /* ================= 卡一：只画表（老板书里的那张，画布与坐标不动） ================= */
  P.emDefine({
    key: 'em_multimeter_use',
    label: '指针式万用表使用与读数',
    cat: 'emlab',
    dw: DW, dh: DH,
    animatable: false,
    params: [
      { key: 'emMuRange', label: '测量挡位', min: 0, max: 13, step: 1, def: 2,
        hint: RANGES.map((x) => ({ label: x.label, value: x.id })) },
      { key: 'emMuT', label: '指针位置', min: 0, max: 1, step: 0.001, def: 0.6 },
      { key: 'emMuProbe', label: '表笔', min: 0, max: 2, step: 1, def: 0,
        hint: [{ label: '测量', value: 0 }, { label: '悬空', value: 1 }, { label: '短接', value: 2 }] },
      { key: 'emMuZero', label: '欧姆调零', min: 0, max: 1, step: 0.01, def: 1 },
      { key: 'emMuShow', label: '显示答案', type: 'toggle', def: 0 },
    ],
    draw(c, o) {
      const ri = clamp(Math.round(num(o.emMuRange, 2)), 0, RANGES.length - 1);
      const probe = clamp(Math.round(num(o.emMuProbe, 0)), 0, 2);
      const zero = clamp(num(o.emMuZero, 1), 0, 1);
      const T = needleT(ri, o.emMuT, probe, zero);
      const show = num(o.emMuShow, 0) === 1;
      const adp = drawFace(c, { ri, zero, T, ticks: 50 });

      /* ---------- 红黑表笔：从 + / − 插孔引出，垂到机身下方 ---------- */
      const PBX = 560, PBY = 1082;
      const gapP = probe === 2 ? 0 : (probe === 1 ? 100 : 40);   // 短接=笔尖相碰，悬空=分开
      const tipR = [PBX + gapP / 2, PBY], tipB = [PBX - gapP / 2, PBY];
      const AR = 15 * D2R, AB = Math.PI - 15 * D2R;              // 笔身朝外、微微向下
      const endOf = (tp, ang, len) => [tp[0] + Math.cos(ang) * len, tp[1] + Math.sin(ang) * len];
      const eR = endOf(tipR, AR, 98), eB = endOf(tipB, AB, 98);
      const lead = (x0, y0, cx, cy, x1, y1, col) => {
        c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1);
        c.lineWidth = 4; c.strokeStyle = col; c.stroke();
      };
      lead(585, 872, 648, 986, eR[0], eR[1], RED);
      lead(585, 950, 508, 1012, eB[0], eB[1], JACK_NEG);
      drawPen(c, tipR, AR, RED, '#7d1f16');
      drawPen(c, tipB, AB, JACK_NEG, '#000000');
      if (probe === 2) C_(c, PBX, PBY, 3.6, 0, null, RED);        // 短接点：两个笔尖碰在一起

      /* 显示答案时只高亮指针对应的刻度线，不写任何文字 */
      if (show) {
        const a = [CXOF(0.775, adp)[0], CXOF(0.775, adp)[1]];
        const b = CXOF(1.030, adp);
        L_(c, a[0], a[1], b[0], b[1], 3.4, ACC);
      }
    },
  });
  /* 表盘圆心与半径：高亮线要用，独立成函数避免魔法数字散落 */
  function CXOF(q, ad) {
    return [380 + 360 * q * Math.cos(ad * D2R), 508 - 360 * q * Math.sin(ad * D2R)];
  }

  /* ================= 卡二：表 + 被测电路 + 读数窗 ================= */
  /* 场景表：0 自动（随挡位）/ 1 电压 / 2 电流 / 3 电阻 / 4 二极管正接 / 5 二极管反接 */
  const SCENE_KIND = ['auto', 'V', 'A', 'R', 'D', 'DR'];
  /* 每个场景红黑夹子落在哪：电压并联在灯两端（红高电位）、电流红进黑出（红在靠电池 + 一侧）、
     电阻两端、二极管正接黑接阳极 / 反接红黑对调。lift = 悬空时上抬的距离。 */
  function tipsOf(sk, lift) {
    const L = lift || 0;
    if (sk === 'V') return { b: [880, CT - L], r: [1130, CT - L] };
    if (sk === 'A') return { b: [1100, CT - L], r: [1190, CT - L] };
    if (sk === 'R') return { b: [890, 1115 - L], r: [1150, 1115 - L] };
    /* 反接不挪表笔，而是把二极管反过来插（符号左右镜像）——
       这样红黑导线的左右顺序恒定，两根线永远走平行的两条高度，不会交叉。 */
    return { b: [910, 1115 - L], r: [1140, 1115 - L] };
  }
  P.emMuTips = tipsOf;
  function sceneKind(scene, R) {
    const s = SCENE_KIND[scene];
    if (s !== 'auto') return s;
    return R.kind === 'V' ? 'V' : (R.kind === 'A' ? 'A' : 'R');
  }
  P.emDefine({
    key: 'em_multimeter_hookup',
    label: '指针式万用表（测量接线与读数）',
    cat: 'emlab',
    dw: HDW, dh: HDH,
    animatable: false,
    params: [
      { key: 'emMuRange', label: '测量挡位', min: 0, max: 13, step: 1, def: 2,
        hint: RANGES.map((x) => ({ label: x.label, value: x.id })) },
      { key: 'emMuScene', label: '被测电路', min: 0, max: 5, step: 1, def: 0,
        hint: [{ label: '自动', value: 0 }, { label: '电压·灯泡', value: 1 }, { label: '电流·灯泡', value: 2 },
          { label: '定值电阻', value: 3 }, { label: '二极管+', value: 4 }, { label: '二极管−', value: 5 }] },
      { key: 'emMuT', label: '指针位置', min: 0, max: 1, step: 0.001, def: 0.6 },
      { key: 'emMuProbe', label: '表笔', min: 0, max: 2, step: 1, def: 0,
        hint: [{ label: '测量', value: 0 }, { label: '悬空', value: 1 }, { label: '短接', value: 2 }] },
      { key: 'emMuZero', label: '欧姆调零', min: 0, max: 1, step: 0.01, def: 1 },
      { key: 'emMuShow', label: '显示读数', type: 'toggle', def: 0 },
    ],
    draw(c, o) {
      const ri = clamp(Math.round(num(o.emMuRange, 2)), 0, RANGES.length - 1);
      const scene = clamp(Math.round(num(o.emMuScene, 0)), 0, 5);
      const probe = clamp(Math.round(num(o.emMuProbe, 0)), 0, 2);
      const zero = clamp(num(o.emMuZero, 1), 0, 1);
      const show = num(o.emMuShow, 0) === 1;
      const sk = sceneKind(scene, RANGES[ri]);

      /* 二极管的正/反向由物理决定，不让「指针位置」和它打架 */
      let T = needleT(ri, o.emMuT, probe, zero);
      if (probe === 0 && (sk === 'D' || sk === 'DR')) T = sk === 'D' ? tOfR(DIODE_FWD) : 0;

      const adp = drawFace(c, { ri, zero, T, ticks: 50 });
      drawCircuit(c, sk);

      /* ---------- 表笔落点：五个场景各自一对夹子，导线在回路外侧走，互不交叉 ---------- */
      let tipB, tipR, angB = -105 * D2R, angR = -75 * D2R;
      const tp = tipsOf(sk, probe === 1 ? 60 : 0);
      tipB = tp.b; tipR = tp.r;

      if (probe === 2) {                       // 短接：两笔尖在电路左侧相碰
        const meet = [700, 1150];
        tipB = [meet[0] - 10, meet[1]]; tipR = [meet[0] + 10, meet[1]];
        angB = -115 * D2R; angR = -65 * D2R;
      }
      const tailB = tailOf(tipB, angB), tailR = tailOf(tipR, angR);
      if (probe === 2) {                        // 短接：两根线直接垂到笔尾
        c.beginPath(); c.moveTo(585, 950); c.bezierCurveTo(600, 1010, 622, 1061, tailB[0], tailB[1]);
        c.lineWidth = 4.2; c.strokeStyle = JACK_NEG; c.stroke();
        c.beginPath(); c.moveTo(585, 872); c.bezierCurveTo(660, 930, 716, 1061, tailR[0], tailR[1]);
        c.lineWidth = 4.2; c.strokeStyle = RED; c.stroke();
      } else {
        /* 两根导线走两条平行高度：左边那支夹子走 y=860、右边那支走 y=800。
           横向段永远落在另一根竖直段之外，落笔前再各自垂直下折，所以任何场景都不会交叉
           —— 二极管「反接」时红笔在左，两条高度自动对调。 */
        const redLeft = tailR[0] < tailB[0];
        drawLead(c, 585, 950, redLeft ? 800 : 860, tailB, JACK_NEG);
        drawLead(c, 585, 872, redLeft ? 860 : 800, tailR, RED);
      }
      drawPen(c, tipB, angB, JACK_NEG, '#000000');
      drawPen(c, tipR, angR, RED, '#7d1f16');
      if (probe === 2) C_(c, 700, 1150, 4, 0, null, RED);      // 短接点

      /* 显示读数：指针对应的刻度线仍然高亮，方便把数字对回表盘 */
      if (show) {
        const a = CXOF(0.775, adp), b = CXOF(1.030, adp);
        L_(c, a[0], a[1], b[0], b[1], 3.4, ACC);
        drawReadout(c, readCard(ri, T, probe, sk));
      }
    },
  });
})();

/* ── 电阻箱读数（1.7.12 · 复刻 ggb「12.3 电阻箱」· 可调参） ──
   四个旋钮 ×1000 / ×100 / ×10 / ×1：外环 1 格、内环 0.5 格，内环上 10 个刻度点；
   0–9 十个数字沿圆周自正下方起逆时针排列、各自旋转（字头朝圆心），
   正下方 ▲ 所指的数字就是该挡读数；读数 R = 1000n₁ + 100n₂ + 10n₃ + n₄。
   四个挡位数字 + 「读数答案」都做成参数：出题时关掉读数，对答案时打开。
   墨色沿用 ggb 原件（#006400 环 / #ff0000 刻度点与读数 / #993300 底板），深浅底由 emCtx 换档。 */
(function () {
  'use strict';
  const P = window.GW.physShapes;
  if (!P || !P.emDefine) return;
  if (P.get && P.get('em_resbox')) return;

  const DW = 620, DH = 680;
  const U = 86;                                  // 一格（旋钮半径）＝ 86 设计像素
  const CX = DW / 2, PY = 34;                    // 底板左上角
  const PW = 6 * U, PH = 6.6 * U;
  const CY = PY + PH / 2;
  const GREEN = '#159447', RED = '#ff0000', INK = '#000000', BROWN = '#993300';
  const NUM = '"Times New Roman",Georgia,"Songti SC",serif';
  const TAU = Math.PI * 2;
  // 旋钮位置（屏幕坐标，相对底板中心；y 向下为正）
  const DIALS = [
    { x: -1.5, y: -2.0, cap: '×1000' },
    { x: 1.5, y: -2.0, cap: '×100' },
    { x: -1.5, y: 1.0, cap: '×10' },
    { x: 1.5, y: 1.0, cap: '×1' },
  ];   // 相对底板中心：原件里旋钮整体偏上（下方要给 ▲ 与倍率留位置）
  function cl(v, d) { const x = Math.round(+v); return isFinite(x) ? Math.min(9, Math.max(0, x)) : d; }

  P.emDefine({
    key: 'em_resbox', label: '电阻箱读数', cat: 'emlab', dw: DW, dh: DH,
    params: [
      { key: 'emRbTh', label: '千挡数字', min: 0, max: 9, step: 1, def: 2 },
      { key: 'emRbH', label: '百挡数字', min: 0, max: 9, step: 1, def: 1 },
      { key: 'emRbT', label: '十挡数字', min: 0, max: 9, step: 1, def: 6 },
      { key: 'emRbU', label: '个挡数字', min: 0, max: 9, step: 1, def: 2 },
      { key: 'emRbShow', label: '读数答案', type: 'toggle', def: 0 },   // 默认收起：插入后先让学生读数
    ],
    // 每次插入随机一个读数：同一节课插十张图就是十道不同的题
    onInsert(o) {
      const r = () => Math.floor(Math.random() * 10);
      o.emRbTh = r(); o.emRbH = r(); o.emRbT = r(); o.emRbU = r();
    },
    draw(c, o, r) {
      const k = (r && r.k) || 1;
      const val = [cl(o.emRbTh, 2), cl(o.emRbH, 1), cl(o.emRbT, 6), cl(o.emRbU, 2)];

      // 底板
      c.save();
      c.strokeStyle = BROWN; c.lineWidth = 3.4 * k;
      c.strokeRect(CX - PW / 2, PY, PW, PH);
      c.restore();

      for (let i = 0; i < 4; i++) {
        const cx = CX + DIALS[i].x * U, cy = CY + DIALS[i].y * U;
        // 双环 + 内圈 10 个刻度点 + 中心轴
        c.save();
        c.strokeStyle = GREEN; c.lineWidth = 4.2 * k;
        c.beginPath(); c.arc(cx, cy, U, 0, TAU); c.stroke();
        c.beginPath(); c.arc(cx, cy, U * 0.5, 0, TAU); c.stroke();
        c.fillStyle = RED;
        for (let j = 0; j < 10; j++) {
          const b = j * TAU / 10;
          c.beginPath(); c.arc(cx + U * 0.5 * Math.sin(b), cy + U * 0.5 * Math.cos(b), 4.4 * k, 0, TAU); c.fill();
        }
        c.fillStyle = GREEN;
        c.beginPath(); c.arc(cx, cy, 3.4 * k, 0, TAU); c.fill();
        c.restore();

        // 0–9：第 j 个在「自正下方逆时针 36j°」，字身随位置转 -36j°（字头朝圆心）
        c.save();
        c.fillStyle = INK;
        c.font = '700 30px ' + NUM;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let j = 0; j < 10; j++) {
          const b = j * TAU / 10, rd = U * 0.76;
          const px = cx + rd * Math.sin(b), py = cy + rd * Math.cos(b);
          c.save(); c.translate(px, py); c.rotate(-b);
          c.fillText(String((val[i] + j) % 10), 0, 0);
          c.restore();
        }
        c.restore();

        // ▲ 指示 + 倍率
        const ty = cy + U * 1.30;
        c.save();
        c.fillStyle = INK;
        c.beginPath();
        c.moveTo(cx, ty - 9); c.lineTo(cx - 7.2, ty + 1.5); c.lineTo(cx + 7.2, ty + 1.5);
        c.closePath(); c.fill();
        c.font = '700 23px ' + NUM;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(DIALS[i].cap, cx, cy + U * 1.48);
        c.restore();
      }

      // 读数（出题时可关掉）
      if (+o.emRbShow === 1) {
        const ohms = 1000 * val[0] + 100 * val[1] + 10 * val[2] + val[3];
        c.save();
        c.fillStyle = RED;
        c.font = '700 27px ' + NUM;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('R = ' + ohms + ' Ω', CX, PY + PH + 44);
        c.restore();
      }
    },
  });
})();

(function () {
  var P = window.GW.physShapes; if (!P) return;
  var ORD = ['em_caliper10', 'em_caliper20', 'em_caliper50', 'em_micrometer',
    'em_voltmeter', 'em_ammeter', 'em_ammeter_in', 'em_ammeter_out', 'em_multimeter',
    'em_multimeter_use', 'em_multimeter_hookup', 'em_multimeter_internal',
    'em_resbox',
    'em_divider', 'em_limiter', 'em_magfocus'];
  // 插入面板的卡片图标：上游每个图形都自带一段 24×24 的线稿，这批模块没写，
  // 面板会退回一根斜线——11 张卡片全长一样，老师分不出哪个是卡尺。这里按图给一段。
  var ICON = {
    em_caliper10: '<path d="M3 10h18M5 10V8M9 10V8M13 10V8M17 10V8M21 10V8"/><path d="M10 10v5h9v-5"/>',
    em_caliper20: '<path d="M3 10h18M5 10V8M9 10V8M13 10V8M17 10V8M21 10V8"/><path d="M10 10v5h9v-5"/>',
    em_caliper50: '<path d="M3 10h18M5 10V8M9 10V8M13 10V8M17 10V8M21 10V8"/><path d="M10 10v5h9v-5"/>',
    em_micrometer: '<path d="M4 7v10M4 12h6"/><rect x="10" y="8" width="7" height="8" rx="1.5"/><path d="M17 12h3M10 10h7M10 14h7"/>',
    em_voltmeter: '<circle cx="12" cy="12" r="8.5"/><path d="M8.6 8.5L12 16l3.4-7.5"/>',
    em_ammeter: '<circle cx="12" cy="12" r="8.5"/><path d="M8.4 16.2L12 8l3.6 8.2M10.2 13.4h3.6"/>',
    em_ammeter_in: '<path d="M3 5v14M21 5v14"/><circle cx="12" cy="12" r="4"/><path d="M6 12h2M16 12h2"/><path d="M12 8v-3M12 16v3"/>',
    em_ammeter_out: '<path d="M3 5v14M21 5v14"/><circle cx="14" cy="12" r="4"/><path d="M3 12h7M18 12h3M8 12v-4h2M8 12v4h2"/>',
    em_multimeter: '<circle cx="12" cy="12" r="8.5"/><path d="M7.1 9.6a6.4 6.4 0 0 1 9.8 0"/><path d="M12 12l4.4-4.4"/><circle cx="12" cy="12" r="1.1"/>',
    em_multimeter_use: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M7 7a6 6 0 0 1 10 0"/><path d="M12 13V7"/><circle cx="12" cy="17" r="3.2"/><path d="M12 17l2.4-2.4"/><path d="M7 21h10"/>',
    em_multimeter_hookup: '<rect x="2" y="3" width="11" height="18" rx="2"/><path d="M4.5 8a4 4 0 0 1 6 0"/><path d="M7.5 12.5V8"/><path d="M15 6h7v9h-7z"/><path d="M15 18h2.5M19.5 18H22"/><path d="M13 21h9"/>',
    em_multimeter_internal: '<circle cx="7" cy="7" r="4.5"/><path d="M7 7V3.4M2.5 11.5h9M11.5 11.5v8.5M2.5 20h4.5"/><rect x="8.5" y="17" width="5" height="6" rx=".5"/><path d="M15 6h6M15 19h6"/>',
    em_resbox: '<circle cx="12" cy="11" r="7.5"/><circle cx="12" cy="11" r="3.2"/><path d="M12 3.5v1.8M12 16.7v1.8M4.5 11h1.8M17.7 11h1.8"/><path d="M12 19.4l-1.8 2.1h3.6z"/>',
    em_divider: '<path d="M3 8h5M16 8h5"/><rect x="8" y="6" width="8" height="4" rx=".5"/><path d="M12 10v4"/><path d="M3 16h18"/><path d="M8 19h3M14 19h3"/>',
    em_limiter: '<path d="M3 11h4"/><path d="M7.5 8v6M10 8v6"/><path d="M12 11h2.5"/><rect x="14.5" y="9" width="6" height="4" rx=".5"/><path d="M17.5 9V6.5"/>',
    em_magfocus: '<circle cx="7.5" cy="12" r="4.5"/><circle cx="16.5" cy="12" r="4.5"/><path d="M7.5 12h9"/><path d="M4 5.5v3M20 5.5v3"/>',
    anim_uniform_accel: '<path d="M3 16h18"/><rect x="6" y="11" width="7" height="4" rx=".6"/><path d="M13 13h5"/><path d="M18 11.5l2 1.5-2 1.5"/>',
    anim_projectile_motion: '<path d="M3 19h18"/><path d="M4 17c3-10 10-12 16-9"/><circle cx="4" cy="17" r="1.4"/><path d="M16 5.5v3M16 6l2 .8"/>',
    anim_collision_momentum: '<rect x="2.5" y="9" width="5" height="6" rx=".6"/><rect x="16.5" y="9" width="5" height="6" rx=".6"/><path d="M9.5 12h2.2M14.5 12h-2.2"/><path d="M11.4 10.6L12.8 12l-1.4 1.4M12.6 10.6L11.2 12l1.4 1.4"/>',
    anim_orbit_motion: '<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="9" ry="5.2"/><circle cx="20.4" cy="10.6" r="1.3"/>',
    anim_shm_oscillator: '<path d="M3 12h2"/><path d="M5 8.5l1.6 7 1.6-7 1.6 7 1.6-7"/><rect x="12" y="8.5" width="5" height="7" rx=".6"/><path d="M18.5 12h2.5"/>',
    anim_mech_wave: '<path d="M2.5 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/><circle cx="8.5" cy="12" r="1.2"/><circle cx="14.5" cy="12" r="1.2"/>',
    anim_incline_glider: '<path d="M3 19h18L3 8z"/><rect x="8" y="12.2" width="4" height="3" rx=".4"/><path d="M7 17.2h8"/>',
    anim_incline_fly: '<path d="M3 19h9L3 10z"/><path d="M12 16c3-6 6-7 9-4"/><rect x="6" y="13.5" width="3" height="2.6" rx=".3"/><path d="M17 8.6h1.6M17.8 7.8v1.6"/>',
  };
  for (var i = 0; i < ORD.length; i++) { var d = P.get(ORD[i]); if (d) { d.ord = i + 1; } }
  // 图标按 ICON 表的全部 key 挂（1.1.7 的 8 个仿真图形不在 ORD 里，只遍历 ORD 会漏）。
  for (var kk in ICON) { var dk = P.get(kk); if (dk) dk.icon = ICON[kk]; }
  // 1.1.7 配色基准：这三张图原本是给深色底画的（表盘/磁场卡片）。页面深色时原样照画，
  // 页面浅色时才反相 —— 否则深色圆盘 + 浅色字会在白底上变成白底白字。
  var BASE = { em_voltmeter: 1, em_ammeter: 1, em_magfocus: 1 };
  for (var kk in BASE) { var s0 = P.get(kk); if (s0) s0.base = 'dark'; }
  // 1.1.7：从仿真搬来的动画统一归到「物理仿真」大类（cat 'anim'），再由 topic 借进
  // 力学 / 振动与波 / 圆周与天体 —— 子代理写文件时不强制写 cat，这里兜一下。
  var _all = []; P.cats().forEach(function (c) { _all = _all.concat(P.list(c)); });
  _all.forEach(function (d) { if (d && d.topic && d.em) d.cat = 'anim'; });
})();
})();
