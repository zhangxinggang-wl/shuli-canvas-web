/* 数理无限画布 · 高中物理 · 光的折射与全反射
 * 折射定律 n₁sinθ₁ = n₂sinθ₂；临界角 sinC = n₂/n₁（n₁>n₂）。
 * 反射/透射光强按菲涅耳公式（自然光，取 s、p 分量平均）计算，用线条透明度表示。
 * 三棱镜色散：柯西公式 n(λ) = A + B/λ²（λ 以 μm 计）；所有光路由通用光线追迹器计算（含部分反射分支）。
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541';
  const D2R = Math.PI / 180;
  const MEDIA = [
    { name: '空气', n: 1.0 },
    { name: '水', n: 1.33 },
    { name: '玻璃', n: 1.5 },
    { name: '钻石', n: 2.42 },
  ];
  const GLASS = {
    crown: { name: '冕牌玻璃', A: 1.5046, B: 0.0042 },
    flint: { name: '重火石玻璃', A: 1.728, B: 0.01342 },
    diamond: { name: '钻石', A: 2.3818, B: 0.0121 },
  };
  const SPECTRUM = [
    { name: '红', lam: 0.70, col: '#e5262b' },
    { name: '橙', lam: 0.62, col: '#f47b20' },
    { name: '黄', lam: 0.58, col: '#e3b800' },
    { name: '绿', lam: 0.53, col: '#2fae4a' },
    { name: '蓝', lam: 0.47, col: '#2f6fe0' },
    { name: '靛', lam: 0.44, col: '#4b3cc9' },
    { name: '紫', lam: 0.405, col: '#8e3fd1' },
  ];

  // 菲涅耳反射率（自然光）
  function fresnelR(n1, n2, ci) {
    const si = Math.sqrt(Math.max(0, 1 - ci * ci));
    const st = (n1 / n2) * si;
    if (st >= 1) return 1;
    const ct = Math.sqrt(1 - st * st);
    const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
    const rp = (n1 * ct - n2 * ci) / (n1 * ct + n2 * ci);
    return (rs * rs + rp * rp) / 2;
  }

  // ---------- 通用光线追迹 ----------
  // shape.prims: [{type:'seg', x1,y1,x2,y2, nx,ny(外法线)}, {type:'arc', cx,cy,r,a0,a1}]
  function intersect(shape, ox, oy, dx, dy) {
    let best = null;
    for (const p of shape.prims) {
      if (p.type === 'seg') {
        const ex = p.x2 - p.x1, ey = p.y2 - p.y1;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((p.x1 - ox) * ey - (p.y1 - oy) * ex) / den;
        const s = ((p.x1 - ox) * dy - (p.y1 - oy) * dx) / den;
        if (t > 1e-6 && s >= -1e-9 && s <= 1 + 1e-9 && (!best || t < best.t)) best = { t, nx: p.nx, ny: p.ny };
      } else {
        const fx = ox - p.cx, fy = oy - p.cy;
        const b = fx * dx + fy * dy, cc = fx * fx + fy * fy - p.r * p.r;
        const disc = b * b - cc;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        for (const t of [-b - sq, -b + sq]) {
          if (t <= 1e-6) continue;
          const hx = ox + t * dx, hy = oy + t * dy;
          let a = Math.atan2(hy - p.cy, hx - p.cx);
          if (a < p.a0 - 1e-9) a += 2 * Math.PI;
          if (a > p.a1 + 1e-9) continue;
          if (!best || t < best.t) best = { t, nx: (hx - p.cx) / p.r, ny: (hy - p.cy) / p.r };
        }
      }
    }
    return best;
  }
  function traceRay(shape, nIn, nOut, ox, oy, dx, dy, w, depth, out, col, inside) {
    if (w < 0.015 || depth > 7) return;
    const hit = intersect(shape, ox, oy, dx, dy);
    if (!hit) { out.push({ x1: ox, y1: oy, x2: ox + dx * 3000, y2: oy + dy * 3000, w, col }); return; }
    const hx = ox + dx * hit.t, hy = oy + dy * hit.t;
    out.push({ x1: ox, y1: oy, x2: hx, y2: hy, w, col, inside });
    let nx = hit.nx, ny = hit.ny;
    let n1 = nOut, n2 = nIn;
    if (dx * nx + dy * ny > 0) { n1 = nIn; n2 = nOut; nx = -nx; ny = -ny; } // 从内部射出
    const ci = -(dx * nx + dy * ny);
    const eta = n1 / n2, k = 1 - eta * eta * (1 - ci * ci);
    const R = fresnelR(n1, n2, ci);
    const rx = dx + 2 * ci * nx, ry = dy + 2 * ci * ny;
    const nowInside = n1 === nIn;
    out.push({ hitx: hx, hity: hy, nx, ny, ci, n1, n2, depth, col, w, tir: k < 0 });
    if (k >= 0) {
      const tx = eta * dx + (eta * ci - Math.sqrt(k)) * nx, ty = eta * dy + (eta * ci - Math.sqrt(k)) * ny;
      traceRay(shape, nIn, nOut, hx, hy, tx, ty, w * (1 - R), depth + 1, out, col, !nowInside);
    }
    traceRay(shape, nIn, nOut, hx, hy, rx, ry, w * R, depth + 1, out, col, nowInside);
  }

  GW.registerSim({
    id: 'phy-refraction', name: '光的折射与全反射', category: 'physics', group: '光学',
    desc: '折射定律、菲涅耳反射强度、临界角与全反射；三棱镜色散（柯西公式）；半圆形玻璃砖实验',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20"/><path d="M4 3l8 9 4 9"/><path d="M12 12l8-9" opacity=".5"/><path d="M12 2v20" stroke-dasharray="2 2"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      if (!S.mode) S.mode = 'interface';
      if (S.n1 == null) S.n1 = 1.0;
      if (S.n2 == null) S.n2 = 1.5;
      if (S.th == null) S.th = 45;
      if (!S.glass) S.glass = 'flint';
      if (S.apex == null) S.apex = 60;
      if (S.pin == null) S.pin = 60;      // 三棱镜入射角（相对左侧面法线，度）
      if (S.nsemi == null) S.nsemi = 1.5;
      if (S.ths == null) S.ths = 30;      // 半圆砖中入射角
      const save = () => ctx.save();

      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 750, H = 620;
      kit.onResize((w, h) => { W = w; H = h; });

      // ---------- 绘制助手 ----------
      function label(t, x, y, col, align, font) {
        c.save(); c.font = font || '15px sans-serif'; c.fillStyle = col || INK; c.textAlign = align || 'center'; c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 4; c.lineJoin = 'round';
        c.strokeText(t, x, y); c.fillText(t, x, y); c.restore();
      }
      function beam(x1, y1, x2, y2, col, alpha, width, arrowAt) {
        c.save(); c.globalAlpha = alpha; c.strokeStyle = col; c.lineWidth = width || 3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
        if (arrowAt != null) {
          const L = Math.hypot(x2 - x1, y2 - y1);
          if (L > 40) {
            const ux = (x2 - x1) / L, uy = (y2 - y1) / L, mx = x1 + ux * L * arrowAt, my = y1 + uy * L * arrowAt;
            c.fillStyle = col; c.beginPath();
            c.moveTo(mx + ux * 9, my + uy * 9); c.lineTo(mx - ux * 7 - uy * 6.5, my - uy * 7 + ux * 6.5); c.lineTo(mx - ux * 7 + uy * 6.5, my - uy * 7 - ux * 6.5);
            c.closePath(); c.fill();
          }
        }
        c.restore();
      }
      function dashed(x1, y1, x2, y2, col, w) {
        c.save(); c.strokeStyle = col || 'rgba(27,36,51,0.55)'; c.lineWidth = w || 2; c.setLineDash([7, 6]);
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore();
      }
      // 角度弧：圆心 (x,y)，从方向角 a0 到 a1（画布角度）
      function angArc(x, y, r, a0, a1, col, text) {
        let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        if (Math.abs(d) < 0.01) return;
        c.save(); c.strokeStyle = col; c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, r, a0, a0 + d, d < 0); c.stroke(); c.restore();
        const am = a0 + d / 2;
        if (text) label(text, x + Math.cos(am) * (r + 22), y + Math.sin(am) * (r + 22), col, 'center', 'italic 16px "Times New Roman", serif');
      }
      function handle(x, y) {
        c.save(); c.strokeStyle = CYAN; c.lineWidth = 2.5; c.fillStyle = 'rgba(15,157,138,0.15)';
        c.beginPath(); c.arc(x, y, 15, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = CYAN; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); c.restore();
      }
      const alphaOf = (w) => Math.min(1, 0.1 + 0.9 * w);

      // ======================= 模式①：两种介质界面 =======================
      const I = { O: () => [W / 2, H * 0.5], R: () => Math.min(W, H) * 0.42 };
      function geoInterface() {
        const th = S.th * D2R, n1 = S.n1, n2 = S.n2;
        const s2 = (n1 / n2) * Math.sin(th);
        const tir = s2 > 1;
        const th2 = tir ? null : Math.asin(s2);
        const R = fresnelR(n1, n2, Math.cos(th));
        const crit = n1 > n2 ? Math.asin(n2 / n1) : null;
        return { th, th2, tir, R, T: tir ? 0 : 1 - R, crit };
      }
      function drawInterface() {
        const [ox, oy] = I.O(), R = I.R();
        const g = geoInterface();
        // 介质背景：折射率越大越深
        const tint = (n) => 'rgba(51,122,200,' + Math.min(0.32, (n - 1) * 0.2 + 0.02) + ')';
        c.fillStyle = tint(S.n1); c.fillRect(0, 0, W, oy);
        c.fillStyle = tint(S.n2); c.fillRect(0, oy, W, H - oy);
        c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, oy); c.lineTo(W, oy); c.stroke();
        const nm = (n) => { const m = MEDIA.find((m) => Math.abs(m.n - n) < 0.005); return (m ? m.name + ' ' : '') + 'n = ' + n.toFixed(2); };
        label('介质 1：' + nm(S.n1), 14, 22, INK, 'left');
        label('介质 2：' + nm(S.n2), 14, H - 22, INK, 'left');
        // 量角刻度
        c.save(); c.strokeStyle = 'rgba(27,36,51,0.25)'; c.lineWidth = 1.5;
        for (let a = 0; a < 360; a += 10) {
          const ar = a * D2R, l = a % 30 === 0 ? 12 : 6;
          c.beginPath(); c.moveTo(ox + Math.cos(ar) * R, oy + Math.sin(ar) * R); c.lineTo(ox + Math.cos(ar) * (R - l), oy + Math.sin(ar) * (R - l)); c.stroke();
        }
        c.beginPath(); c.arc(ox, oy, R, 0, Math.PI * 2); c.stroke();
        c.restore();
        // 法线
        dashed(ox, oy - R - 10, ox, oy + R + 10, 'rgba(27,36,51,0.6)');
        label('法线', ox + 22, oy - R - 4, '#5b6576');
        // 临界角
        if (g.crit != null) {
          const cx = ox - Math.sin(g.crit) * R, cy = oy - Math.cos(g.crit) * R;
          dashed(cx, cy, ox, oy, 'rgba(242,165,65,0.9)', 2);
          // 标注放在临界线下方、远离入射光手柄的位置
          const lx = ox - Math.sin(g.crit) * R * 0.62, ly = oy - Math.cos(g.crit) * R * 0.62;
          const off = g.th > g.crit ? 1 : -1;
          label('临界角 C = ' + (g.crit / D2R).toFixed(1) + '°', lx + off * 18 * Math.cos(g.crit), ly - off * 18 * Math.sin(g.crit) + (off > 0 ? 6 : -6), '#b9771a', off > 0 ? 'left' : 'right');
        }
        // 光线
        const ix = ox - Math.sin(g.th) * R, iy = oy - Math.cos(g.th) * R;
        const rx = ox + Math.sin(g.th) * R, ry = oy - Math.cos(g.th) * R;
        beam(ix, iy, ox, oy, RED, 1, 3.5, 0.55);
        beam(ox, oy, rx, ry, RED, alphaOf(g.R), 3.5, 0.55);
        if (!g.tir) {
          const tx = ox + Math.sin(g.th2) * R, ty = oy + Math.cos(g.th2) * R;
          beam(ox, oy, tx, ty, RED, alphaOf(g.T), 3.5, 0.55);
          angArc(ox, oy, 56, Math.PI / 2, Math.PI / 2 - g.th2, BLUE, 'θ₂');
          label('折射光 ' + (g.T * 100).toFixed(1) + '%', tx + (tx > ox + 40 ? -8 : 8), ty + 18, '#9b2e12', tx > ox + 40 ? 'right' : 'left');
        } else {
          label('全反射：没有折射光', ox + 30, oy + 40, RED, 'left', 'bold 16px sans-serif');
        }
        angArc(ox, oy, 56, -Math.PI / 2, -Math.PI / 2 - g.th, RED, 'θ₁');
        angArc(ox, oy, 72, -Math.PI / 2, -Math.PI / 2 + g.th, '#b04020', 'θ₁′');
        label('入射光', ix - 10, iy - 18, RED, 'right');
        label('反射光 ' + (g.R * 100).toFixed(1) + '%', rx + 10, ry - 18, '#b04020', 'left');
        handle(ix, iy);
      }

      // ======================= 模式②：三棱镜色散 =======================
      function prismShape() {
        const A = S.apex * D2R, side = Math.min(W * 0.42, H * 0.62);
        const h = side * Math.cos(A / 2), half = side * Math.sin(A / 2);
        const cx = W * 0.46, top = H * 0.5 - h * 0.55;
        const P = [[cx, top], [cx + half, top + h], [cx - half, top + h]];
        const cxm = (P[0][0] + P[1][0] + P[2][0]) / 3, cym = (P[0][1] + P[1][1] + P[2][1]) / 3;
        const prims = [];
        for (let i = 0; i < 3; i++) {
          const a = P[i], b = P[(i + 1) % 3];
          let nx = b[1] - a[1], ny = -(b[0] - a[0]); const L = Math.hypot(nx, ny); nx /= L; ny /= L;
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          if ((mx - cxm) * nx + (my - cym) * ny < 0) { nx = -nx; ny = -ny; }
          prims.push({ type: 'seg', x1: a[0], y1: a[1], x2: b[0], y2: b[1], nx, ny });
        }
        return { P, prims };
      }
      // 左侧面上的入射点与入射方向（由入射角 S.pin 决定，光从左下方射向左侧面）
      function prismInput(sh) {
        const a = sh.P[0], b = sh.P[2]; // 顶点 → 左底角
        const t = 0.55;
        const hx = a[0] + (b[0] - a[0]) * t, hy = a[1] + (b[1] - a[1]) * t;
        const nrm = sh.prims[2]; // 边 P2→P0
        const nx = nrm.nx, ny = nrm.ny; // 外法线（指向左上）
        // 入射方向 d：与 -n 夹角为 pin，偏向底边一侧（光线从左下射入时向上偏折）
        const pin = S.pin * D2R;
        // 切向单位向量（沿面从顶点指向底角）
        let tx = b[0] - a[0], ty = b[1] - a[1]; const L = Math.hypot(tx, ty); tx /= L; ty /= L;
        const dx = -nx * Math.cos(pin) - tx * Math.sin(pin), dy = -ny * Math.cos(pin) - ty * Math.sin(pin);
        return { hx, hy, dx, dy, nx, ny, sx: hx - dx * 190, sy: hy - dy * 190 };
      }
      const nOf = (lam) => { const g = GLASS[S.glass]; return g.A + g.B / (lam * lam); };
      function drawPrism() {
        const sh = prismShape(), inp = prismInput(sh);
        // 棱镜
        c.save(); c.fillStyle = 'rgba(120,190,230,0.25)'; c.strokeStyle = '#4a90c2'; c.lineWidth = 2.5;
        c.beginPath(); sh.P.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); c.stroke(); c.restore();
        angArc(sh.P[0][0], sh.P[0][1], 30, Math.atan2(sh.P[2][1] - sh.P[0][1], sh.P[2][0] - sh.P[0][0]), Math.atan2(sh.P[1][1] - sh.P[0][1], sh.P[1][0] - sh.P[0][0]), '#2f6f9c', '');
        label('A = ' + S.apex + '°', sh.P[0][0], sh.P[0][1] + 48, '#2f6f9c');
        // 法线
        dashed(inp.hx + inp.nx * 70, inp.hy + inp.ny * 70, inp.hx - inp.nx * 60, inp.hy - inp.ny * 60);
        // 入射白光
        beam(inp.sx, inp.sy, inp.hx, inp.hy, '#5b6576', 1, 5, 0.5);
        label('白光', inp.sx + 10, inp.sy + 20, '#5b6576', 'left');
        const ain = Math.atan2(-inp.dy, -inp.dx), an = Math.atan2(inp.ny, inp.nx);
        angArc(inp.hx, inp.hy, 40, an, ain, RED, 'i');
        // 七色光
        const res = [];
        c.save();
        for (const sp of SPECTRUM) {
          const out = [];
          const n = nOf(sp.lam);
          // 第一个界面单独处理：在入射点折射进入
          const ci = -(inp.dx * inp.nx + inp.dy * inp.ny);
          const eta = 1 / n, k = 1 - eta * eta * (1 - ci * ci);
          const R0 = fresnelR(1, n, ci);
          const tx = eta * inp.dx + (eta * ci - Math.sqrt(k)) * inp.nx, ty = eta * inp.dy + (eta * ci - Math.sqrt(k)) * inp.ny;
          traceRay(sh, n, 1, inp.hx, inp.hy, tx, ty, (1 - R0) / 1, 1, out, sp.col, true);
          let exitDir = null;
          for (const sgm of out) if (sgm.x1 != null) {
            const w = sgm.w;
            beam(sgm.x1, sgm.y1, sgm.x2, sgm.y2, sp.col, alphaOf(w), sgm.inside ? 2 : 2.5);
          }
          // 主出射光（第一条从内部射到外部且权重最大的）
          const segs = out.filter((s) => s.x1 != null && !s.inside);
          segs.sort((a, b) => b.w - a.w);
          if (segs[0]) exitDir = Math.atan2(segs[0].y2 - segs[0].y1, segs[0].x2 - segs[0].x1);
          res.push({ sp, n, exitDir, seg: segs[0] });
        }
        c.restore();
        // 反射白光（第一面）
        const ci = -(inp.dx * inp.nx + inp.dy * inp.ny);
        const R0 = fresnelR(1, nOf(0.58), ci);
        const rx = inp.dx + 2 * ci * inp.nx, ry = inp.dy + 2 * ci * inp.ny;
        beam(inp.hx, inp.hy, inp.hx + rx * 200, inp.hy + ry * 200, '#5b6576', alphaOf(R0), 3);
        handle(inp.sx, inp.sy);
        // 出射光端标注
        const r0 = res[0], r6 = res[6];
        if (r0.seg && r6.seg) {
          const lab = (r, t) => {
            const s = r.seg; const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
            const d = Math.min(L, (W - 30 - s.x1) / Math.max(0.2, (s.x2 - s.x1) / L));
            const x = s.x1 + (s.x2 - s.x1) / L * Math.min(d, 330), y = s.y1 + (s.y2 - s.y1) / L * Math.min(d, 330);
            label(t, x + 4, y + (t === '红' ? -14 : 14), r.sp.col, 'left', 'bold 15px sans-serif');
          };
          lab(r0, '红'); lab(r6, '紫');
        }
        return res;
      }

      // ======================= 模式③：半圆形玻璃砖 =======================
      function semiShape() {
        const cx = W / 2, cy = H * 0.44, r = Math.min(W * 0.3, H * 0.36);
        return { cx, cy, r, prims: [
          { type: 'seg', x1: cx - r, y1: cy, x2: cx + r, y2: cy, nx: 0, ny: -1 },
          { type: 'arc', cx, cy, r, a0: 0, a1: Math.PI },
        ] };
      }
      function drawSemi() {
        const sh = semiShape(), { cx, cy, r } = sh;
        const n = S.nsemi;
        // 量角器刻度
        const Rr = r + 70;
        c.save(); c.strokeStyle = 'rgba(27,36,51,0.22)'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(cx, cy, Rr, 0, Math.PI * 2); c.stroke();
        for (let a = 0; a < 360; a += 10) {
          const ar = a * D2R, l = a % 30 === 0 ? 12 : 6;
          c.beginPath(); c.moveTo(cx + Math.cos(ar) * Rr, cy + Math.sin(ar) * Rr); c.lineTo(cx + Math.cos(ar) * (Rr - l), cy + Math.sin(ar) * (Rr - l)); c.stroke();
        }
        c.restore();
        // 玻璃砖
        c.save(); c.fillStyle = 'rgba(120,190,230,0.3)'; c.strokeStyle = '#4a90c2'; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(cx - r, cy); c.lineTo(cx + r, cy); c.arc(cx, cy, r, 0, Math.PI); c.closePath(); c.fill(); c.stroke(); c.restore();
        label('玻璃 n = ' + n.toFixed(2), cx + r * 0.08, cy + r * 0.82, '#2f6f9c', 'left');
        label('空气', cx - r - 30, cy - 30, '#5b6576');
        dashed(cx, cy - Rr, cx, cy + Rr, 'rgba(27,36,51,0.55)');
        label('法线', cx + 22, cy - Rr - 4, '#5b6576');
        // 临界角
        const C = Math.asin(1 / n);
        dashed(cx - Math.sin(C) * Rr, cy + Math.cos(C) * Rr, cx, cy, 'rgba(242,165,65,0.9)');
        label('C = ' + (C / D2R).toFixed(1) + '°', cx - Math.sin(C) * Rr - 8, cy + Math.cos(C) * Rr + 16, '#b9771a', 'right');
        // 入射光：从左下方沿半径射向圆心 O
        const th = S.ths * D2R;
        const sx = cx - Math.sin(th) * Rr, sy = cy + Math.cos(th) * Rr;
        const out = [];
        // 沿半径射入：在圆弧面上垂直入射、方向不变（透射率 1−R₀），从弧面上的入射点开始追迹
        const ax = cx - Math.sin(th) * r, ay = cy + Math.cos(th) * r;
        const T0 = 1 - fresnelR(1, n, 1);
        beam(sx, sy, ax, ay, RED, 1, 3.2, 0.5);
        traceRay(sh, n, 1, ax, ay, Math.sin(th), -Math.cos(th), T0, 0, out, RED, true);
        for (const s of out) if (s.x1 != null) {
          const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
          let x2 = s.x2, y2 = s.y2;
          if (L > 1500) { // 射向空气的光线截到量角器圆周
            const ux = (s.x2 - s.x1) / L, uy = (s.y2 - s.y1) / L;
            const fx = s.x1 - cx, fy = s.y1 - cy, b = fx * ux + fy * uy, cc = fx * fx + fy * fy - Rr * Rr;
            const t = -b + Math.sqrt(Math.max(0, b * b - cc));
            x2 = s.x1 + ux * t; y2 = s.y1 + uy * t;
          }
          beam(s.x1, s.y1, x2, y2, RED, alphaOf(s.w), 3.2, s.w > 0.05 ? 0.5 : null);
        }
        const ci = Math.cos(th), s2 = n * Math.sin(th);
        const R = fresnelR(n, 1, ci);
        angArc(cx, cy, 50, Math.PI / 2, Math.PI / 2 + th, RED, 'θ₁');
        if (s2 < 1) {
          const th2 = Math.asin(s2);
          angArc(cx, cy, 50, -Math.PI / 2, -Math.PI / 2 + th2, BLUE, 'θ₂');
        } else label('全反射', cx + 40, cy - 40, RED, 'left', 'bold 16px sans-serif');
        label('O', cx - 12, cy - 14, INK, 'center', 'italic 16px "Times New Roman", serif');
        handle(sx, sy);
        return { th, s2, R, C };
      }

      // ---------- 交互 ----------
      kit.drag((p) => {
        if (S.mode === 'interface') {
          const [ox, oy] = I.O(), R = I.R(), th = S.th * D2R;
          const ix = ox - Math.sin(th) * R, iy = oy - Math.cos(th) * R;
          if (Math.hypot(p.x - ix, p.y - iy) < 24) return 'h';
          // 也允许点击上半部分圆周任意位置
          const d = Math.hypot(p.x - ox, p.y - oy);
          if (p.y < oy && p.x < ox && Math.abs(d - R) < 22) return 'h';
        } else if (S.mode === 'prism') {
          const inp = prismInput(prismShape());
          if (Math.hypot(p.x - inp.sx, p.y - inp.sy) < 24) return 'h';
        } else {
          const sh = semiShape(), Rr = sh.r + 70, th = S.ths * D2R;
          const sx = sh.cx - Math.sin(th) * Rr, sy = sh.cy + Math.cos(th) * Rr;
          if (Math.hypot(p.x - sx, p.y - sy) < 24) return 'h';
          const d = Math.hypot(p.x - sh.cx, p.y - sh.cy);
          if (p.y > sh.cy && p.x < sh.cx && Math.abs(d - Rr) < 22) return 'h';
        }
        return null;
      }, (t, p) => {
        if (S.mode === 'interface') {
          const [ox, oy] = I.O();
          const a = Math.atan2(ox - p.x, oy - p.y) / D2R; // 与法线夹角
          S.th = Math.round(GW.clamp(a, 0, 89) * 2) / 2; sTh.set(S.th);
        } else if (S.mode === 'prism') {
          const sh = prismShape(), inp = prismInput(sh);
          // 由拖动点相对入射点的方向反算入射角
          let dx = inp.hx - p.x, dy = inp.hy - p.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
          const a = sh.P[0], b = sh.P[2];
          let tx = b[0] - a[0], ty = b[1] - a[1]; const Lt = Math.hypot(tx, ty); tx /= Lt; ty /= Lt;
          const cn = -(dx * inp.nx + dy * inp.ny), st = -(dx * tx + dy * ty);
          S.pin = Math.round(GW.clamp(Math.atan2(st, cn) / D2R, -10, 85)); sPin.set(S.pin);
        } else {
          const sh = semiShape();
          const a = Math.atan2(sh.cx - p.x, p.y - sh.cy) / D2R;
          S.ths = Math.round(GW.clamp(a, 0, 89) * 2) / 2; sThs.set(S.ths);
        }
        updateRO();
      }, () => save());

      // ---------- 面板 ----------
      const modeSeg = GW.ui.segmented({ options: [{ value: 'interface', label: '折射定律' }, { value: 'prism', label: '三棱镜' }, { value: 'semi', label: '半圆砖' }], value: S.mode, onChange(v) { S.mode = v; syncPanel(); updateRO(); save(); } });
      const mediaOpts = MEDIA.map((m) => ({ value: m.n, label: m.name + '（' + m.n.toFixed(2) + '）' })).concat([{ value: 'x', label: '自定义' }]);
      const pickVal = (n) => (MEDIA.some((m) => Math.abs(m.n - n) < 0.005) ? MEDIA.find((m) => Math.abs(m.n - n) < 0.005).n : 'x');
      const sel1 = GW.ui.select({ label: '介质 1（入射侧）', options: mediaOpts, value: pickVal(S.n1), onChange(v) { if (v !== 'x') { S.n1 = +v; sN1.set(S.n1); } updateRO(); save(); } });
      const sN1 = GW.ui.slider({ label: '折射率 n₁', min: 1, max: 2.5, step: 0.01, value: S.n1, onInput(v) { S.n1 = v; sel1.set(pickVal(v)); updateRO(); save(); } });
      const sel2 = GW.ui.select({ label: '介质 2', options: mediaOpts, value: pickVal(S.n2), onChange(v) { if (v !== 'x') { S.n2 = +v; sN2.set(S.n2); } updateRO(); save(); } });
      const sN2 = GW.ui.slider({ label: '折射率 n₂', min: 1, max: 2.5, step: 0.01, value: S.n2, onInput(v) { S.n2 = v; sel2.set(pickVal(v)); updateRO(); save(); } });
      const swap = GW.ui.button({ label: '⇅ 交换两种介质', onClick() { const t = S.n1; S.n1 = S.n2; S.n2 = t; sN1.set(S.n1); sN2.set(S.n2); sel1.set(pickVal(S.n1)); sel2.set(pickVal(S.n2)); updateRO(); save(); } });
      const sTh = GW.ui.slider({ label: '入射角 θ₁', min: 0, max: 89, step: 0.5, value: S.th, unit: '°', onInput(v) { S.th = v; updateRO(); save(); } });
      const gInter = GW.ui.group('介质与入射角', sel1.el, sN1.el, sel2.el, sN2.el, swap.el, sTh.el);

      const selG = GW.ui.select({ label: '棱镜材料', options: Object.keys(GLASS).map((k) => ({ value: k, label: GLASS[k].name })), value: S.glass, onChange(v) { S.glass = v; updateRO(); save(); } });
      const sApex = GW.ui.slider({ label: '顶角 A', min: 30, max: 75, step: 1, value: S.apex, unit: '°', onInput(v) { S.apex = v; updateRO(); save(); } });
      const sPin = GW.ui.slider({ label: '入射角 i', min: -10, max: 85, step: 1, value: S.pin, unit: '°', onInput(v) { S.pin = v; updateRO(); save(); } });
      const gPrism = GW.ui.group('三棱镜', selG.el, sApex.el, sPin.el);

      const sNs = GW.ui.slider({ label: '玻璃折射率 n', min: 1.3, max: 2.5, step: 0.01, value: S.nsemi, onInput(v) { S.nsemi = v; updateRO(); save(); } });
      const sThs = GW.ui.slider({ label: '入射角 θ₁（玻璃中）', min: 0, max: 89, step: 0.5, value: S.ths, unit: '°', onInput(v) { S.ths = v; updateRO(); save(); } });
      const gSemi = GW.ui.group('半圆形玻璃砖', sNs.el, sThs.el);

      const ro = [0, 1, 2, 3, 4, 5].map(() => GW.ui.readout(''));
      const note = GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: '1.5' } });
      const gRO = GW.ui.group('读数', ...ro.map((r) => r.el), note);
      kit.panel.append(GW.ui.group('模式', modeSeg.el), gInter, gPrism, gSemi, gRO);
      function setRO(i, l, v) { ro[i].el.firstChild.textContent = l; ro[i].set(v); ro[i].el.style.display = l ? '' : 'none'; }
      function syncPanel() {
        gInter.style.display = S.mode === 'interface' ? '' : 'none';
        gPrism.style.display = S.mode === 'prism' ? '' : 'none';
        gSemi.style.display = S.mode === 'semi' ? '' : 'none';
        note.textContent = {
          interface: '拖动入射光线端点改变入射角。光从光密介质射向光疏介质（n₁>n₂）且入射角 ≥ 临界角 C 时发生全反射。线条深浅表示光强（菲涅耳公式）。',
          prism: '不同色光在同一介质中折射率不同（n = A + B/λ²），波长越短 n 越大、偏折越厉害：紫光偏折最大，红光最小。拖动白光光源改变入射角。',
          semi: '光沿半径射入，在圆弧面上不偏折，在平直面（圆心 O）处折射。增大入射角，折射光渐弱、反射光渐强，达到临界角时折射光消失。',
        }[S.mode];
      }
      function updateRO() {
        for (let i = 0; i < ro.length; i++) setRO(i, '', '');
        if (S.mode === 'interface') {
          const g = geoInterface();
          setRO(0, '入射角 θ₁', S.th.toFixed(1) + '°');
          setRO(1, '折射角 θ₂', g.tir ? '—（全反射）' : (g.th2 / D2R).toFixed(1) + '°');
          setRO(2, 'n₁sinθ₁', (S.n1 * Math.sin(g.th)).toFixed(3));
          setRO(3, '临界角 C', g.crit != null ? (g.crit / D2R).toFixed(1) + '°' : '无（n₁ ≤ n₂）');
          setRO(4, '反射光强', (g.R * 100).toFixed(1) + '%');
          setRO(5, '折射光强', (g.T * 100).toFixed(1) + '%');
        } else if (S.mode === 'prism') {
          const nr = nOf(0.70), nv = nOf(0.405);
          setRO(0, 'n（红 700 nm）', nr.toFixed(4));
          setRO(1, 'n（紫 405 nm）', nv.toFixed(4));
          const dev = (n) => {
            const A = S.apex * D2R, i1 = S.pin * D2R;
            const r1 = Math.asin(Math.sin(i1) / n), r2 = A - r1;
            const s = n * Math.sin(r2);
            if (Math.abs(s) > 1) return null;
            return (i1 + Math.asin(s) - A) / D2R;
          };
          const dr = dev(nr), dv = dev(nv);
          setRO(2, '红光偏向角 δ', dr == null ? '在第二面全反射' : dr.toFixed(2) + '°');
          setRO(3, '紫光偏向角 δ', dv == null ? '在第二面全反射' : dv.toFixed(2) + '°');
          if (dr != null && dv != null) setRO(4, '色散角', (dv - dr).toFixed(2) + '°');
          setRO(5, '柯西系数', 'A = ' + GLASS[S.glass].A + '，B = ' + GLASS[S.glass].B + ' μm²');
        } else {
          const th = S.ths * D2R, n = S.nsemi, s2 = n * Math.sin(th);
          const C = Math.asin(1 / n), R = fresnelR(n, 1, Math.cos(th));
          setRO(0, '入射角 θ₁（玻璃中）', S.ths.toFixed(1) + '°');
          setRO(1, '折射角 θ₂（空气中）', s2 < 1 ? (Math.asin(s2) / D2R).toFixed(1) + '°' : '—（全反射）');
          setRO(2, '临界角 C = arcsin(1/n)', (C / D2R).toFixed(1) + '°');
          setRO(3, '反射光强', (R * 100).toFixed(1) + '%');
          setRO(4, '折射光强', ((1 - R) * 100).toFixed(1) + '%');
        }
      }
      syncPanel(); updateRO();

      kit.loop(() => {
        kit.background();
        if (S.mode === 'interface') drawInterface();
        else if (S.mode === 'prism') drawPrism();
        else drawSemi();
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
