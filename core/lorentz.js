/* 1.3.2 / 1.3.3：磁场里的带电粒子 —— 静态圆弧版
 *
 * 1.3.3 按老师反馈改成「调参圆弧曲线」（不再是动画）：
 *   · 电荷从磁场边界上一点射入，轨迹是磁场内的那一段圆弧，画完就定格在画布上。
 *   · 改任何一个参数（电荷量 / B / 质量 / 速率 / 入射角 / 入射位置），
 *     圆弧形状与初速度箭头**立刻**跟着变 —— 它就是个普通图形，跟着选中、拖动、导出、撤销走。
 *   · 画面里不写任何文字参数；粗细/颜色/虚线取图形自己的样式（参数面板与别的图形同一个）。
 *
 * 物理：磁场内 v ⊥ B ⇒ 速率不变、轨迹是正圆，r = v/ω、T = 2π/ω，ω = 2|q|B/m。
 *   （系数 2 只是为了默认参数下周期正好 π 秒，r = m·v/(|q|B) 仍然严格成立。）
 *   圆弧到边界就停：出了磁场之后没有洛伦兹力，画出来的部分只保留场内的那一段。
 */
(() => {
  const GW = window.GW;
  const L = (GW.lorentz = {});
  const DEF = { B: 1, q: 1, m: 1, v: 160, tilt: 0, t: -1 };
  const STEP = 0.045;          // 圆弧采样角步长（弧度）

  // ---------- 几何：边界上的点、内法线 ----------
  function edges(pts) {
    const out = [], n = pts.length / 2;
    if (n < 3) return out;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = pts[i * 2], y1 = pts[i * 2 + 1], x2 = pts[j * 2], y2 = pts[j * 2 + 1];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      out.push({ i, x1, y1, x2, y2, dx, dy, len });
    }
    return out;
  }
  function insidePoly(pts, x, y) {
    if (GW.geom && GW.geom.pointInPoly) return GW.geom.pointInPoly(x, y, pts);
    let c = false;
    const n = pts.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) c = !c;
    }
    return c;
  }
  // 边 i 的内法线（指向区域里面）
  function inwardNormal(pts, e) {
    const nx = -e.dy / e.len, ny = e.dx / e.len;
    const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
    const probe = Math.max(0.8, e.len * 0.002);
    return insidePoly(pts, mx + nx * probe, my + ny * probe) ? { nx, ny } : { nx: -nx, ny: -ny };
  }
  function totalLen(es) { let s = 0; for (const e of es) s += e.len; return s; }
  // t∈[0,1) → 边界上的点 + 内法线
  function pointAtT(pts, t) {
    const es = edges(pts);
    if (!es.length) return null;
    const T = totalLen(es);
    let d = (((t % 1) + 1) % 1) * T;
    for (const e of es) {
      if (d <= e.len || e === es[es.length - 1]) {
        const k = e.len > 1e-9 ? Math.min(1, d / e.len) : 0;
        const n = inwardNormal(pts, e);
        return { x: e.x1 + e.dx * k, y: e.y1 + e.dy * k, nx: n.nx, ny: n.ny, t: (((t % 1) + 1) % 1) };
      }
      d -= e.len;
    }
    return null;
  }
  // 默认入射位置：内法线最朝 +x 的那条边的中点（矩形就是「从左边界水平射入」）
  function homeT(pts) {
    const es = edges(pts);
    if (!es.length) return 0;
    const T = totalLen(es);
    let best = 0, bestD = -9, acc = 0;
    for (const e of es) {
      const n = inwardNormal(pts, e);
      if (n.nx > bestD) { bestD = n.nx; best = (acc + e.len / 2) / T; }
      acc += e.len;
    }
    return best;
  }
  function nearestOnBoundary(pts, x, y) {
    const es = edges(pts);
    const T = totalLen(es);
    let best = 0, bestD = Infinity, acc = 0;
    for (const e of es) {
      const dx = e.dx / (e.len || 1), dy = e.dy / (e.len || 1);
      let k = ((x - e.x1) * dx + (y - e.y1) * dy) / (e.len || 1);
      k = Math.max(0, Math.min(1, k));
      const px = e.x1 + e.dx * k, py = e.y1 + e.dy * k;
      const d = Math.hypot(x - px, y - py);
      if (d < bestD) { bestD = d; best = (acc + e.len * k) / T; }
      acc += e.len;
    }
    return best;
  }

  // ---------- 物理量 ----------
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const omegaOf = (it) => 2 * Math.abs(num(it.q, 1) || 1) * num(it.B, 1) / Math.max(0.05, num(it.m, 1));
  const radiusOf = (it) => num(it.v, 160) / Math.max(1e-6, omegaOf(it));
  const periodOf = (it) => (2 * Math.PI) / Math.max(1e-6, omegaOf(it));
  // 旋转方向：× 向里 + 正电荷 ⇒ 逆时针（屏幕上朝上偏）
  const spinOf = (it) => (it.mf === 'cross' ? -1 : 1) * Math.sign(num(it.q, 1) || 1);
  // 入射方向 = 内法线绕起点转 tilt
  function dirOf(it, p) {
    const a = Math.atan2(p.ny, p.nx) + num(it.tilt, 0);
    return { ux: Math.cos(a), uy: Math.sin(a) };
  }

  // ---------- 核心：按参数重建圆弧 ----------
  function sync(it) {
    const region = it.field || it.pts;
    if (!region || region.length < 6) return false;
    const t = (it.t == null || it.t < 0) ? homeT(region) : it.t;
    it.t = t;
    const p = pointAtT(region, t);
    if (!p) return false;
    const d = dirOf(it, p);
    const r = radiusOf(it);
    const s = spinOf(it);
    // 圆心：沿「运动方向的左侧/右侧」法向偏移 r（s 决定哪一侧）
    const cx = p.x - r * (s * d.uy), cy = p.y - r * (-s * d.ux);
    const a0 = Math.atan2(p.y - cy, p.x - cx);
    const pts = [p.x, p.y];
    let a = a0, out = null;
    const nMax = Math.ceil((2 * Math.PI) / STEP) + 2;
    for (let i = 0; i < nMax; i++) {
      const na = a + s * STEP;
      const x = cx + r * Math.cos(na), y = cy + r * Math.sin(na);
      if (!insidePoly(region, x, y)) {
        // 出了磁场：二分找到边界上的那一点，圆弧到此为止
        let lo = 0, hi = 1;
        for (let k = 0; k < 24; k++) {
          const mid = (lo + hi) / 2;
          const aa = a + s * STEP * mid;
          const mx = cx + r * Math.cos(aa), my = cy + r * Math.sin(aa);
          if (insidePoly(region, mx, my)) lo = mid; else hi = mid;
        }
        const aa = a + s * STEP * lo;
        const ex = cx + r * Math.cos(aa), ey = cy + r * Math.sin(aa);
        pts.push(ex, ey);
        out = { x: ex, y: ey, a: aa };
        break;
      }
      pts.push(x, y);
      a = na;
      if (Math.abs(a - a0) > 2 * Math.PI - 1e-9) break;   // 整圈都在场内
    }
    it.pts = pts;
    it.x = p.x; it.y = p.y;
    it._u = d;
    it._arc = { cx, cy, r, a0, a1: a, spin: s, entry: { x: p.x, y: p.y }, exit: out };
    if (!it.color) it.color = num(it.q, 1) >= 0 ? '#e02020' : '#2563eb';
    if (it.width == null) it.width = 2;
    GW.invalidate(it);
    return true;
  }

  // ---------- 绘制：圆弧 + 初速度箭头（不写任何文字） ----------
  function arrow(ctx, x, y, ux, uy, len, lw, zoom) {
    const ex = x + ux * len, ey = y + uy * len;
    const hw = Math.max(6, Math.min(13, len * 0.40));
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * hw - uy * hw * 0.55, ey - uy * hw + ux * hw * 0.55);
    ctx.lineTo(ex - ux * hw + uy * hw * 0.55, ey - uy * hw - ux * hw * 0.55);
    ctx.closePath();
    ctx.fill();
  }
  function draw(ctx, it, opts) {
    const zoom = (GW.camera && GW.camera.s) || 1;
    const col = it.color || '#e02020';
    const lw = Math.max(1, num(it.width, 2));
    const pts = it.pts;
    if (!pts || pts.length < 4) return;
    ctx.save();
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.setLineDash(it.dash ? [lw * 3, lw * 3] : []);
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 可选：半径虚线圆（教学用，默认关）
    const A = it._arc;
    if (it.showR && A && A.r > 2) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(0.8, 1 / zoom);
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath(); ctx.arc(A.cx, A.cy, A.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // 电荷本体：一个小圆 + 中间的 +/−
    if (A) {
      const R = Math.max(4, 6 / zoom);
      ctx.beginPath(); ctx.arc(A.entry.x, A.entry.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.strokeStyle = GW.theme && GW.theme.dark ? '#0d1218' : '#ffffff';
      ctx.lineWidth = Math.max(1, R * 0.34);
      ctx.beginPath();
      ctx.moveTo(A.entry.x - R * 0.55, A.entry.y); ctx.lineTo(A.entry.x + R * 0.55, A.entry.y);
      if (num(it.q, 1) >= 0) { ctx.moveTo(A.entry.x, A.entry.y - R * 0.55); ctx.lineTo(A.entry.x, A.entry.y + R * 0.55); }
      ctx.stroke();
      ctx.restore();
    }
    // 初速度箭头（方向随「入射角 / 入射位置 / 场向」实时变）
    if (it.showV !== false && it._u) {
      const L0 = Math.max(34, 42 / zoom);
      arrow(ctx, A.entry.x, A.entry.y, it._u.ux, it._u.uy, L0, lw, zoom);
    }
    ctx.restore();
  }

  // ---------- 对外 API ----------
  function add(field, sign) {
    if (!field || !field.mf || !field.pts) return null;
    const it = {
      id: GW.uid(), kind: 'shape', type: 'lor',
      field: field.pts.slice(), mf: field.mf,
      B: DEF.B, q: sign < 0 ? -1 : 1, m: DEF.m, v: DEF.v, tilt: 0, t: -1,
      color: sign < 0 ? '#2563eb' : '#e02020', width: Math.max(2, (GW.tool.pen && GW.tool.pen.width) || 2),
      dash: false, showV: true, showR: false,
    };
    if (!sync(it)) return null;
    const pg = GW.page();
    if (pg && pg.ink.indexOf(it) < 0) pg.ink.push(it);
    GW.invalidate(it);
    GW.commit({ add: [it] });
    GW.requestRender();
    return it;
  }
  function setT(it, t) { it.t = Math.max(0, Math.min(0.9999, t)); sync(it); GW.requestRender(); return it; }
  function setPos(it, x, y) {
    const region = it.field;
    if (!region) return it;
    it.t = nearestOnBoundary(region, x, y);
    sync(it); GW.requestRender();
    return it;
  }
  function info(it) {
    const A = it._arc;
    return { r: radiusOf(it), T: periodOf(it), w: omegaOf(it), inside: !!A, arc: A || null };
  }
  // 1.3.2 时代留下的接口：现在不再有动画，保持空实现，免得别处调用报错
  function noop() {}
  const penWidth = () => Math.max(1, (GW.tool && GW.tool.pen && +GW.tool.pen.width) || 2);

  L.add = add;
  L.sync = sync;
  L.draw = draw;
  L.setT = setT;
  L.setPos = setPos;
  L.homeT = homeT;
  L.nearestOnBoundary = nearestOnBoundary;
  L.info = info;
  L.radiusOf = radiusOf;
  L.periodOf = periodOf;
  L.omegaOf = omegaOf;
  L.spinOf = spinOf;
  L.dirOf = (it) => (it._u || null);
  L.penWidth = penWidth;
  L.skipInk = () => false;      // 静态图形：墨迹层照常画（导出也走这条路）
  L.setFrozen = noop;
  L.play = sync;
  L.pause = noop;
  L.reset = (it) => { it.t = -1; sync(it); GW.requestRender(); };
  L.setPlaying = (it) => { sync(it); GW.requestRender(); };
  L.stepFor = () => 0;
})();
