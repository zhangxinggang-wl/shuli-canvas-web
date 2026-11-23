/* 数理无限画布 · 输入与工具：笔、荧光笔、橡皮、图形、选择、文本、激光笔、手势 */
(function () {
  'use strict';
  const GW = window.GW;

  const tool = (GW.tool = {
    // 打开即可书写：默认就是「笔」，插上尺规 / 打开课件都能立刻落笔，
    // 需要拖动画布或操作对象时再切到「交互」。
    current: 'pen',
    pen: { color: '#1b2433', width: 3, mode: 'pen' },   // mode: pen | brush | smart
    hl: { color: '#ffd23f', width: 22 },
    // 激光笔（1.1.14）：颜色 / 线宽 / 两种模式都可调。
    //   demo    —— 演示圈画：抬手后约 1.1 秒逐段消失（和以前一样）
    //   formula —— 临时板书：一直留着，停笔 hold 秒后才整体慢慢淡出
    laser: { color: '#ff2d55', width: 6, mode: 'demo', hold: 4 },
    eraser: { mode: 'area', size: 36 },                   // area | stroke
    // mf：磁场填充（'' 无 / 'cross' ×向里 / 'dot' ·向外），只对闭合图形有意义（矩形/圆/椭圆/三角…）
    // WP4：彩色 / 图案填充。旧字段 fill(布尔开关)/fillAlpha 一律保留；fillMode '' = 未指定，
    // 仍按旧 fill 开关走，旧档 / 旧 UI 一个字节都不用迁移。新增字段只在显式设置时才生效。
    shape: {
      type: 'line', dash: false, fill: false, mf: '',
      pbKey: null, pbParams: null, msKey: null, msParams: null, fillAlpha: 0.2,
      fillMode: '',            // '' 未指定(沿用旧 fill 开关) | 'none' | 'solid' | 'pattern'
      fillColor: '',           // 任意 hex；空 = 跟随画笔色
      fillPattern: 'hatch',    // 'hatch' | 'cross' | 'dots' | 'h' | 'v'
      fillDensity: 8,          // 图案 tile 间距（世界单位，越小越密）
      fillLineWidth: 1,        // 图案线宽
    },
    text: { size: 36, note: false },
    set(name) {
      if (name === this.current) { GW.bus.emit('tool-reselect', name); return; }
      this.current = name;
      GW.selection.clear();
      document.body.dataset.tool = name;
      GW.objects.deactivate();
      if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
      GW.bus.emit('tool', name);
    },
  });
  const DRAW_TOOLS = ['pen', 'hl', 'eraser', 'shape', 'select', 'text', 'laser'];

  // ---------- 几何辅助 ----------
  function distSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    let t = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
  }
  function pointInPoly(x, y, P) {
    let inside = false;
    for (let i = 0, j = P.length - 2; i < P.length; j = i, i += 2) {
      const xi = P[i], yi = P[i + 1], xj = P[j], yj = P[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function segmentsOf(it) {
    const p = it.pts;
    if (it.kind === 'shape' && it.type === 'axes') {
      const r = [p[0], p[1], p[2], p[3], p[0], p[1], p[4], p[5]];
      if (p.length > 6) r.push(p[0], p[1], p[6], p[7]);
      if (p.length > 8) r.push(p[0], p[1], p[8], p[9]);
      return { pairs: r };
    }
    return { line: p, closed: it.kind === 'shape' && it.closed };
  }
  function hitItem(it, x, y, tol) {
    const b = GW.bbox(it);
    if (x < b.x - tol || y < b.y - tol || x > b.x + b.w + tol || y > b.y + b.h + tol) return false;
    const r = (it.width || 2) / 2 + tol;
    // 学科模板是多段图形（segs），没有 pts：逐段算点到线段距离。不单独处理的话
    // 下面的 segmentsOf 会返回 line=undefined，一碰就抛。
    if (it.segs) {
      for (let s = 0; s < it.segs.length; s++) {
        const q = it.segs[s];
        if (!q) continue;
        if (q.length === 2) { if (Math.hypot(x - q[0], y - q[1]) <= r) return true; continue; }
        for (let i = 0; i < q.length - 2; i += 2) if (distSeg(x, y, q[i], q[i + 1], q[i + 2], q[i + 3]) <= r) return true;
      }
      return false;
    }
    // 物理图形库（type:'pb'）：一张图里几十条线、还有文字和刻度，没有统一的点列可以量距离。
    // 它的包围盒是「空跑一遍 draw」量出来的（贴到最外面的笔画/标注），所以框内即算命中。
    if (it.type === 'pb') return true;
    // 数学可调参图形（type:'ms'）：几何现算，框内即命中（同 pb）。
    if (it.type === 'ms') return true;
    const s = segmentsOf(it);
    if (s.pairs) { for (let i = 0; i < s.pairs.length; i += 4) if (distSeg(x, y, s.pairs[i], s.pairs[i + 1], s.pairs[i + 2], s.pairs[i + 3]) <= r) return true; return false; }
    const p = s.line;
    if (p.length === 2) return Math.hypot(x - p[0], y - p[1]) <= r;
    for (let i = 0; i < p.length - 2; i += 2) if (distSeg(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= r) return true;
    if (s.closed && distSeg(x, y, p[p.length - 2], p[p.length - 1], p[0], p[1]) <= r) return true;
    if (it.fill && s.closed && pointInPoly(x, y, p)) return true;
    return false;
  }
  GW.hitItem = hitItem;
  // 1.6.6（T07）：右键菜单的监听写在文件末尾另一个 IIFE 里（那一段只管「拦系统手势」），
  // 拿不到这里的局部函数，所以命中测试要挂到 GW 上给它用。
  GW.hitTop = hitTop;
  GW.geom = { distSeg, pointInPoly };

  // ---------- 笔迹后处理 ----------
  function smoothPts(p, passes = 1) {
    if (p.length < 8) return p;
    let a = p;
    for (let k = 0; k < passes; k++) {
      const b = a.slice();
      for (let i = 2; i < a.length - 2; i += 2) { b[i] = (a[i - 2] + 2 * a[i] + a[i + 2]) / 4; b[i + 1] = (a[i - 1] + 2 * a[i + 1] + a[i + 3]) / 4; }
      a = b;
    }
    return a;
  }
  // Ramer–Douglas–Peucker
  function rdp(pts, eps) {
    const n = pts.length / 2;
    if (n < 3) return pts.slice();
    const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let md = 0, mi = -1;
      for (let i = a + 1; i < b; i++) { const d = distSeg(pts[2 * i], pts[2 * i + 1], pts[2 * a], pts[2 * a + 1], pts[2 * b], pts[2 * b + 1]); if (d > md) { md = d; mi = i; } }
      if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
    return out;
  }
  GW.rdp = rdp;

  // ---------- 智能笔·曲线识别（1.1.13） ----------
  // 智能笔以前只认「直线 / 圆 / 椭圆 / 多边形」，一笔开口的曲线画出去永远原样保留。
  // 这里补上开口曲线的识别：圆弧 → 抛物线 → 正弦波，三种都认不出来时做一次平滑拟合。
  // 全部在「以包围盒中心为原点、对角线为 1」的归一化坐标里算 —— 阈值与画布缩放、笔画大小无关。
  // 门槛刻意保守（长度、残差、单调性、尖角），宁可不动，也不能把老师写的偏旁认成图形。
  const CURVE_MIN_PX = 120;       // 屏幕上不足这么长不认（正常板书里一个笔画 40~90px）
  const CURVE_MIN_DIAG_PX = 60;   // 包围盒对角线太小（几乎是直线）交给直线分支
  function solve3(M, y) {
    const a = [[M[0][0], M[0][1], M[0][2], y[0]], [M[1][0], M[1][1], M[1][2], y[1]], [M[2][0], M[2][1], M[2][2], y[2]]];
    for (let c = 0; c < 3; c++) {
      let pi = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[pi][c])) pi = r;
      if (Math.abs(a[pi][c]) < 1e-12) return null;      // 退化（共线/点重合）：这一种拟合作废
      const t = a[c]; a[c] = a[pi]; a[pi] = t;
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = a[r][c] / a[c][c];
        if (!f) continue;
        for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
      }
    }
    const out = [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
    return out.every((v) => Number.isFinite(v)) ? out : null;
  }
  function rmsOf(res, n) { let s = 0; for (let i = 0; i < n; i++) s += res[i] * res[i]; return Math.sqrt(s / n); }
  // 自变量是否单调（抛物线/正弦都是「y 是 x 的函数」，来回折的笔画不是）
  function monotone(X, n) {
    let back = 0, prev = 0;
    for (let i = 1; i < n; i++) {
      const d = X[i] - X[i - 1];
      if (Math.abs(d) < 0.004) continue;
      if (prev && Math.sign(d) !== Math.sign(prev)) back++;
      prev = d;
      if (back > 1) return false;
    }
    return true;
  }
  // ① 圆弧：Kasa 代数拟合（点到圆心距离偏差的线性最小二乘）
  function fitArc(U, V, n) {
    let Suu = 0, Suv = 0, Su = 0, Svv = 0, Sv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0, Sz = 0;
    for (let i = 0; i < n; i++) {
      const u = U[i], v = V[i], uu = u * u, vv = v * v;
      Suu += uu; Suv += u * v; Su += u; Svv += vv; Sv += v;
      Suuu += uu * u; Svvv += vv * v; Suvv += u * vv; Svuu += v * uu; Sz += uu + vv;
    }
    const sol = solve3([[Suu, Suv, Su], [Suv, Svv, Sv], [Su, Sv, n]], [-(Suuu + Suvv), -(Svvv + Svuu), -Sz]);
    if (!sol) return null;
    const cx = -sol[0] / 2, cy = -sol[1] / 2, rr = cx * cx + cy * cy - sol[2];
    if (!(rr > 0)) return null;
    const r = Math.sqrt(rr);
    if (!(r > 0.05)) return null;                        // 半径小于包围盒对角线的 5%：这是团疙瘩，不是弧
    const ang = new Float64Array(n), res = new Float64Array(n);
    for (let i = 0; i < n; i++) { const dx = U[i] - cx, dy = V[i] - cy; ang[i] = Math.atan2(dy, dx); res[i] = Math.hypot(dx, dy) - r; }
    // 总扫角与方向一致性：来回折的笔画（S 形）不认
    let sweep = 0, back = 0, prev = 0;
    for (let i = 1; i < n; i++) {
      let d = ang[i] - ang[i - 1];
      if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
      sweep += d;
      if (Math.abs(d) > 0.03) { if (prev && Math.sign(d) !== Math.sign(prev)) back++; prev = d; }
    }
    if (Math.abs(sweep) < 1.0 || Math.abs(sweep) > 5.6 || back > 2) return null;   // 57°~321°
    const pts = [], N = 64;
    for (let i = 0; i <= N; i++) { const a = ang[0] + (sweep * i) / N; pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    return { rms: rmsOf(res, n), rmsMax: 0.022, pts };
  }
  // ② 抛物线：v = a·u² + b·u + c（竖直开口）与 u = a·v² + b·v + c（水平开口）各试一次
  function fitQuadRe(X, Y, n) {
    let S4 = 0, S3 = 0, S2 = 0, S1 = 0, T2 = 0, T1 = 0, T0 = 0;
    for (let i = 0; i < n; i++) {
      const x = X[i], y = Y[i], x2 = x * x;
      S4 += x2 * x2; S3 += x2 * x; S2 += x2; S1 += x;
      T2 += x2 * y; T1 += x * y; T0 += y;
    }
    const sol = solve3([[S4, S3, S2], [S3, S2, S1], [S2, S1, n]], [T2, T1, T0]);
    if (!sol) return null;
    const res = new Float64Array(n);
    let x1 = Infinity, x2 = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = X[i];
      res[i] = Y[i] - (sol[0] * x * x + sol[1] * x + sol[2]);
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
    }
    // 拱高（曲线中点离弦的距离）：太平就不是抛物线的形，交给圆弧或平滑兜底
    const sag = Math.abs(sol[0]) * (x2 - x1) * (x2 - x1) / 4;
    return { a: sol[0], b: sol[1], c: sol[2], x1, x2, sag, rms: rmsOf(res, n) };
  }
  function fitPara(U, V, n) {
    let best = null;
    if (monotone(U, n)) {
      const f = fitQuadRe(U, V, n);
      if (f && f.sag > 0.05) {
        const pts = [], N = 48;
        for (let i = 0; i <= N; i++) { const u = f.x1 + ((f.x2 - f.x1) * i) / N; pts.push(u, f.a * u * u + f.b * u + f.c); }
        best = { rms: f.rms, rmsMax: 0.02, pts };
      }
    }
    if (monotone(V, n)) {
      const f = fitQuadRe(V, U, n);
      if (f && f.sag > 0.05 && (!best || f.rms < best.rms)) {
        const pts = [], N = 48;
        for (let i = 0; i <= N; i++) { const v = f.x1 + ((f.x2 - f.x1) * i) / N; pts.push(f.a * v * v + f.b * v + f.c, v); }
        best = { rms: f.rms, rmsMax: 0.02, pts };
      }
    }
    return best;
  }
  // ③ 正弦：v = A·sin(ωu) + B·cos(ωu) + C。ω 按「半周期数 k=2~6」扫一遍（k<2 与抛物线没法区分）
  function fitSine(U, V, n) {
    if (!monotone(U, n)) return null;
    let x1 = Infinity, x2 = -Infinity;
    for (let i = 0; i < n; i++) { if (U[i] < x1) x1 = U[i]; if (U[i] > x2) x2 = U[i]; }
    const span = x2 - x1;
    if (!(span > 0.1)) return null;
    let best = null;
    for (let k = 2; k <= 6; k++) {
      const w = (k * Math.PI) / span;
      let Saa = 0, Sab = 0, Sa = 0, Sbb = 0, Sb = 0, Ta = 0, Tb = 0, Tc = 0;
      for (let i = 0; i < n; i++) {
        const s = Math.sin(w * U[i]), c = Math.cos(w * U[i]), v = V[i];
        Saa += s * s; Sab += s * c; Sa += s; Sbb += c * c; Sb += c;
        Ta += s * v; Tb += c * v; Tc += v;
      }
      const sol = solve3([[Saa, Sab, Sa], [Sab, Sbb, Sb], [Sa, Sb, n]], [Ta, Tb, Tc]);
      if (!sol) continue;
      const amp = Math.hypot(sol[0], sol[1]);
      if (!(amp > 0.06)) continue;                       // 振幅不到对角线的 6%：其实是条直线/浅弧
      const res = new Float64Array(n);
      for (let i = 0; i < n; i++) res[i] = V[i] - (sol[0] * Math.sin(w * U[i]) + sol[1] * Math.cos(w * U[i]) + sol[2]);
      const rms = rmsOf(res, n);
      if (best && rms >= best.rms) continue;
      const pts = [], N = 64;
      for (let i = 0; i <= N; i++) { const u = x1 + (span * i) / N; pts.push(u, sol[0] * Math.sin(w * u) + sol[1] * Math.cos(w * u) + sol[2]); }
      best = { rms, rmsMax: 0.018, pts };
    }
    return best;
  }
  // ④ 兜底：认不出具体类型，但它是「长长的一笔、没有尖角的曲线」→ 收紧 RDP 后平滑拟合一遍
  function fitSmooth(U, V, n) {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(U[i], V[i]);
    const v = rdp(pts, 0.012);
    if (v.length < 6) return null;                       // 只剩两个点：它本来就是直线
    // 尖角检测（在 RDP 顶点上算，原始采样点太密、手抖会把转角放大成噪声）
    let sharp = 0;
    for (let i = 1; i < v.length / 2 - 1; i++) {
      const ax = v[2 * i] - v[2 * i - 2], ay = v[2 * i + 1] - v[2 * i - 1];
      const bx = v[2 * i + 2] - v[2 * i], by = v[2 * i + 3] - v[2 * i + 1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la < 1e-9 || lb < 1e-9) continue;
      const turn = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
      if (turn > 0.9) sharp++;
    }
    if (sharp > 0) return null;                          // 有尖角（横折、捺、字母）：不是曲线，别动它
    return { rms: 0, rmsMax: 0, pts: v };
  }
  function recognizeCurve(st, b, diag, len, base) {
    const sc = GW.camera.s;
    if (len * sc < CURVE_MIN_PX || diag * sc < CURVE_MIN_DIAG_PX) return null;
    const p = st.pts, n = p.length / 2;
    const ox = b.x + b.w / 2, oy = b.y + b.h / 2, k = Math.max(diag, 1e-6);
    const U = new Float64Array(n), V = new Float64Array(n);
    for (let i = 0; i < n; i++) { U[i] = (p[2 * i] - ox) / k; V[i] = (p[2 * i + 1] - oy) / k; }
    let best = null;
    for (const f of [fitArc, fitPara, fitSine]) {
      let c = null;
      try { c = f(U, V, n); } catch (e) { c = null; }   // 退化笔画的矩阵可能无解：这一种作废，换下一种
      if (c && c.rms <= c.rmsMax && (!best || c.rms < best.rms)) best = c;
    }
    const cand = best || fitSmooth(U, V, n);
    if (!cand) return null;
    const pts = [];
    for (let i = 0; i < cand.pts.length; i += 2) pts.push(ox + cand.pts[i] * k, oy + cand.pts[i + 1] * k);
    if (pts.length < 6) return null;
    return Object.assign(base, { type: 'poly', pts, smooth: true });
  }
  // 探针入口（scripts/probe-smart-curve.js）：识别函数是 IIFE 私有的，给个只读出口
  GW.__recognize = recognize;

  // ---------- 智能笔·标准图形优先（1.5.0） ----------
  // 老师的诉求两句话：①「画矩形常常变成普通四边形」②「写字别被认成奇怪的图形」。
  // 做法：判定顺序改成「先试标准模板 → 再试椭圆 → 都不中才原样保留」；
  // 残差一律用**全部采样点**到模板边界的最大距离算 —— 只比顶点是不够的：
  // 圆被 rdp 抽成 6 个点后，顶点和正六边形一模一样（这是老代码「正多边形被吃成椭圆」的镜像坑）。
  const SNAP_MIN_DIAG_PX = 72;     // 屏幕像素。比这更小的闭合笔画当写字（手写的「口」「日」就这么大），不规整
  // 1.4.0（R2）：0.055 → 0.09。0.055 在 368px 对角线上只有 20px 预算，而真人收笔不回起点的
  // 缺口本身就有 15~40px，缺口处的点离模板边正好等于缺口长度 ⇒ 一半以上的矩形/三角形被判不中。
  // 实测 0.09 放行全部合理样本，0.15 不再多救一个（剩下的是顶点数/长条问题），只会更容易吃掉「口」字。
  const SNAP_RESID = 0.09;         // 模板残差上限（相对包围盒对角线）—— 1.4.4 起可由设置页覆盖
  // 1.3.2：设置 → 笔与智能笔 → 识别灵敏度写 settings.snapResid（滑杆 30~200 → 0.03~0.20）。
  // 这里做一次范围护栏：手改 .gewu 或旧版本留下的野值不参与判断，回落到 SNAP_RESID。
  const residMax = () => {
    const v = GW.settings && GW.settings.snapResid;
    return (typeof v === 'number' && v >= 0.03 && v <= 0.3) ? v : SNAP_RESID;
  };
  const SNAP_TEXT_OVERLAP = 0.55;  // 与既有笔迹包围盒的重叠比
  const SNAP_TEXT_NEAR_MS = 15000; // 15 s 内落下的笔迹才算「同一处在写字」
  const SNAP_TEXT_MIN = 2;         // 至少 2 笔挤在一起
  const SNAP_TEXT_MAX_PX = 320;    // 屏幕对角线超过这么大的是板书标注，不当字

  const len2 = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  function centroidOf(v) {
    let cx = 0, cy = 0; const n = v.length / 2;
    for (let i = 0; i < n; i++) { cx += v[2 * i]; cy += v[2 * i + 1]; }
    return { x: cx / n, y: cy / n };
  }
  // 正多边形（≥5 边）：角点绕中心的夹角要**均匀**、半径要一致。
  // 这是区分「画歪的正七边形」（必须原样保留）与「画得粗糙的圆」（必须认成圆）的关键：
  // 噪声在圆上凑出来的假角点，夹角分布是随机的（sd/mean > 0.25），而正七边形是均匀的。
  function regularN(verts, cx, cy) {
    const n = verts.length / 2;
    if (n < 5) return 0;
    const ang = [];
    let rmin = Infinity, rmax = 0;
    for (let i = 0; i < n; i++) {
      const dx = verts[2 * i] - cx, dy = verts[2 * i + 1] - cy;
      ang.push(Math.atan2(dy, dx));
      const r = Math.hypot(dx, dy);
      rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
    }
    if (!(rmin > 1e-6) || rmax / rmin > 1.30) return 0;
    ang.sort((a, b) => a - b);
    const mean = (Math.PI * 2) / n;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const g = i === n - 1 ? ang[0] + Math.PI * 2 - ang[i] : ang[i + 1] - ang[i];
      s2 += (g - mean) * (g - mean);
    }
    return Math.sqrt(s2 / n) / mean < 0.22 ? n : 0;
  }
  // 半径相对起伏（均方根）：圆 ≈ 手抖的 2%~6%，矩形 >20%，正多边形 5%~13%。
  // rdev 是「这是不是一个圆」最稳的一条量，不受角点检测抖动影响。
  function radialDev(pts, cx, cy, r) {
    if (!(r > 1e-6)) return 9;
    let s = 0;
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const dx = pts[2 * i] - cx, dy = pts[2 * i + 1] - cy;
      const d = Math.hypot(dx, dy) / r - 1;
      s += d * d;
    }
    return Math.sqrt(s / Math.max(1, n));
  }
  // 两个**无向**方向的平均：倍角化再平均，避开 atan2 的 ±π 回绕
  function avgAxis(a, b) {
    const x = Math.cos(2 * a) + Math.cos(2 * b), y = Math.sin(2 * a) + Math.sin(2 * b);
    if (Math.hypot(x, y) < 1e-9) return a;
    return Math.atan2(y, x) / 2;
  }
  // 两条无向直线的夹角，落在 [0, π/2]
  function angDiff(a, b) {
    let d = Math.abs(a - b) % Math.PI;
    if (d > Math.PI / 2) d = Math.PI - d;
    return d;
  }
  // 残差：全部采样点到模板闭合折线的**最大**距离（世界单位；调用方自己除以 diag 归一化）
  // 1.4.5（R2 修复）：分位数残差。residOf 用**最大值**，`points` 里只要有 2~3 个点落在
  // 圆角/收笔位置，整条矩形就被否掉（实测圆角 24 的矩形残差正好卡在 0.09·diag）。
  // 取 88% 分位：圆角只影响少数点，而「平行四边形/梯形」是整条边都歪，照样过不去。
  function residQ(pts, tpl, diag, q) {
    const m = tpl.length / 2;
    const step = Math.max(1, Math.floor((pts.length / 2) / 60));
    const ds = [];
    for (let i = 0; i < pts.length; i += 2 * step) {
      let best = Infinity;
      for (let j = 0; j < m; j++) {
        const k = (j + 1) % m;
        best = Math.min(best, distSeg(pts[i], pts[i + 1], tpl[2 * j], tpl[2 * j + 1], tpl[2 * k], tpl[2 * k + 1]));
      }
      ds.push(best);
    }
    if (!ds.length) return 0;
    ds.sort((a, b) => a - b);
    const idx = Math.min(ds.length - 1, Math.floor(ds.length * (q == null ? 0.88 : q)));
    return ds[idx];
  }
  // 旋转最小外接矩形拟合：角点检测对「圆角 + 小笔迹」不稳（rect_round24 / rect_small120 会随机丢角），
  // 矩形干脆单独走一条路——按 30 个方向转点取包围盒，挑残差最小的那个。
  // 返回 { pts, r, w, h }（pts 是转回原坐标的四个角），r 是 90% 分位残差。
  function fitRect(pts, diag) {
    let best = null;
    const N2 = 30;
    for (let k = 0; k < N2; k++) {
      const th = (k / N2) * (Math.PI / 2);          // 矩形四重对称，只需扫 0~90°
      const c = Math.cos(-th), sn = Math.sin(-th);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i] * c - pts[i + 1] * sn, y = pts[i] * sn + pts[i + 1] * c;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const w = x1 - x0, h = y1 - y0;
      if (w < diag * 0.05 || h < diag * 0.02) continue;
      const cc = Math.cos(th), ss = Math.sin(th);
      const rp = [];
      for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) rp.push(x * cc - y * ss, x * ss + y * cc);
      const r = residQ(pts, rp, diag, 0.9);
      if (!best || r < best.r) best = { pts: rp, r, w, h };
    }
    return best;
  }
  function residOf(pts, tpl, diag) {
    const m = tpl.length / 2;
    const step = Math.max(1, Math.floor((pts.length / 2) / 60));   // 最多看 60 个点
    let worst = 0;
    for (let i = 0; i < pts.length; i += 2 * step) {
      let best = Infinity;
      for (let j = 0; j < m; j++) {
        const k = (j + 1) % m;
        best = Math.min(best, distSeg(pts[i], pts[i + 1], tpl[2 * j], tpl[2 * j + 1], tpl[2 * k], tpl[2 * k + 1]));
      }
      if (best > worst) worst = best;
    }
    return worst;
  }
  // 顶点归并：收笔的小钩、拐角处挤在一起的重复点会把 nv 从 4 抬到 5，
  // 于是「明明画的是矩形」走进「原样返回多边形」。这里把这类点吃掉。
  function mergeVerts(verts, diag) {
    const v = verts.slice();
    for (let guard = 0; guard < 12 && v.length / 2 > 3; guard++) {
      const n = v.length / 2;
      let per = 0;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; per += len2(v[2 * i], v[2 * i + 1], v[2 * j], v[2 * j + 1]); }
      let cut = -1;
      for (let i = 0; i < n; i++) {
        const a = (i + n - 1) % n, c = (i + 1) % n;
        if (len2(v[2 * i], v[2 * i + 1], v[2 * a], v[2 * a + 1]) > per * 0.14) continue;   // 长边两侧是真顶点
        if (len2(v[2 * c], v[2 * c + 1], v[2 * i], v[2 * i + 1]) > per * 0.14) continue;
        if (distSeg(v[2 * i], v[2 * i + 1], v[2 * a], v[2 * a + 1], v[2 * c], v[2 * c + 1]) > diag * 0.06) continue;
        cut = i; break;
      }
      if (cut < 0) break;
      v.splice(2 * cut, 2);
    }
    return v;
  }
  function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return false;
    const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
    const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
    return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
  }
  // 自交：写字里的「8」「日」这类交叉笔画不可能是标准图形
  function selfCross(verts) {
    const n = verts.length / 2;
    if (n < 4) return false;
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;                  // 首尾边相邻
        const j2 = (j + 1) % n;
        if (segCross(verts[2 * i], verts[2 * i + 1], verts[2 * i2], verts[2 * i2 + 1],
                     verts[2 * j], verts[2 * j + 1], verts[2 * j2], verts[2 * j2 + 1])) return true;
      }
    }
    return false;
  }
  // 四边形候选（1.3.0 R3：只认矩形/正方形，任意旋转）。
  // 老师反馈「四边形只认矩形」：菱形/平行四边形/梯形不再规整 —— 它们本来就有无数种画法，
  // 硬套模板反而把老师画的斜边拉直、把梯形认成平行四边形。
  function snapQuad(v) {
    if (v.length !== 8) return null;
    const e = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      e.push({ a: Math.atan2(v[2 * j + 1] - v[2 * i + 1], v[2 * j] - v[2 * i]), l: len2(v[2 * i], v[2 * i + 1], v[2 * j], v[2 * j + 1]) });
    }
    // 1.4.5（R2 修复）：6° 的平行门 + 8° 的直角门是「拿尺子画」的标准，真人板书
    // 随手画的矩形对边常差 8~12°、四角差 10~15°。放到 12.6° / 17°，同时靠下面的
    // 残差门（residMax*diag）与面积比守住「别把平行四边形拉成矩形」。
    // 1.4.5（R2 修复）：角点是从「圆角/抖动」里挑出来的，位置本身就带 ±20px 的误差，
    // 由它算出的对边夹角能差 15°（实测圆角 24 的矩形，右边缘和左边缘相差 0.27 rad）。
    // 所以这里只做「粗筛」，真正的门是残差 residOf ≤ snapResid·diag（0.09·diag）。
    const par1 = angDiff(e[0].a, e[2].a) < 0.35;
    const par2 = angDiff(e[1].a, e[3].a) < 0.35;
    if (!par1 || !par2) return null;
    const c = centroidOf(v);
    const u = avgAxis(e[0].a, e[2].a), vv = avgAxis(e[1].a, e[3].a);
    // 直角门比平行门**严**：圆角会让「对边」的夹角虚高 15°（角点位置误差），
    // 但不会改变「相邻边」的夹角。菱形（76°）/平行四边形（30°）必须在这里被挡住，
    // 否则会被规整成正方形（probe-smart-shape ③ 的硬要求）。
    if (angDiff(u, vv) <= Math.PI / 2 - 0.18) return null;   // 不是直角 ⇒ 不认（10.3°）
    let L1 = (e[0].l + e[2].l) / 2, L2 = (e[1].l + e[3].l) / 2;
    let name = 'rect';
    if (Math.abs(L1 - L2) / Math.max((L1 + L2) / 2, 1e-9) < 0.12) { L1 = L2 = (L1 + L2) / 2; name = 'square'; }
    const ux = Math.cos(u), uy = Math.sin(u), hx = ux * L1 / 2, hy = uy * L1 / 2, wx = -uy * L2 / 2, wy = ux * L2 / 2;
    return [{ pts: [c.x + hx + wx, c.y + hy + wy, c.x + hx - wx, c.y + hy - wy, c.x - hx - wx, c.y - hy - wy, c.x - hx + wx, c.y - hy + wy], snap: name }];
  }
  // 三角形候选（1.3.0 R3：只认等边）。直角/等腰不再规整 —— 老师画的直角常常是随手一折，
  // 被强制正交后反而走形。
  function snapTri(v) {
    if (v.length !== 6) return null;
    const P = [[v[0], v[1]], [v[2], v[3]], [v[4], v[5]]];
    const A = len2(P[0][0], P[0][1], P[1][0], P[1][1]), B = len2(P[1][0], P[1][1], P[2][0], P[2][1]), C = len2(P[2][0], P[2][1], P[0][0], P[0][1]);
    const mn = Math.min(A, B, C), mx = Math.max(A, B, C);
    if (!(mx > 1e-6 && mn / mx > 0.78)) return null;   // 1.4.5：0.84→0.78，手画的等边常差一成
    const c = centroidOf(v);
    const R = (A + B + C) / 3 / Math.sqrt(3), a0 = Math.atan2(P[0][1] - c.y, P[0][0] - c.x);
    const pt = [];
    for (let i = 0; i < 3; i++) { const a = a0 + (i * 2 * Math.PI) / 3; pt.push(c.x + R * Math.cos(a), c.y + R * Math.sin(a)); }
    return [{ pts: pt, snap: 'tri-eq' }];
  }
  // 直角三角形：一个角 ≈90°（±10°），另外两个角都明显小于直角且都不接近 0
  // （接近 0 说明是「一条边画歪了」的等边/普通三角形，不该硬拉成直角）。
  function snapRtri(v) {
    if (v.length !== 6) return null;
    const P3 = [[v[0], v[1]], [v[2], v[3]], [v[4], v[5]]];
    const angleAt = (i) => {
      const c = P3[i], a = P3[(i + 1) % 3], b = P3[(i + 2) % 3];
      const u1 = [a[0] - c[0], a[1] - c[1]], u2 = [b[0] - c[0], b[1] - c[1]];
      const d = (u1[0] * u2[0] + u1[1] * u2[1]) / Math.max(1e-9, Math.hypot(u1[0], u1[1]) * Math.hypot(u2[0], u2[1]));
      return Math.acos(GW.clamp(d, -1, 1));
    };
    let ri = 0;
    for (let i = 1; i < 3; i++) if (Math.abs(angleAt(i) - Math.PI / 2) < Math.abs(angleAt(ri) - Math.PI / 2)) ri = i;
    const A = angleAt(ri);
    const B = angleAt((ri + 1) % 3), C = angleAt((ri + 2) % 3);
    if (Math.abs(A - Math.PI / 2) > 0.18) return null;               // 直角 ±10.3°
    if (B < 0.24 || C < 0.24) return null;                           // 一个角贴着 0 ⇒ 退化成线
    if (B > Math.PI / 2 - 0.26 || C > Math.PI / 2 - 0.26) return null; // 另一个角也近 90° ⇒ 不是直角三角形
    // 以直角顶点为锚，保留两条边的长度与较长边方向，把较短边旋到垂直（最小改动）
    const Av = P3[ri], Bv = P3[(ri + 1) % 3], Cv = P3[(ri + 2) % 3];
    const u1 = [Bv[0] - Av[0], Bv[1] - Av[1]], u2 = [Cv[0] - Av[0], Cv[1] - Av[1]];
    const l1 = Math.hypot(u1[0], u1[1]), l2 = Math.hypot(u2[0], u2[1]);
    if (l1 < 1e-3 || l2 < 1e-3) return null;
    const ux = u1[0] / l1, uy = u1[1] / l1;
    let px = -uy, py = ux;
    if (px * u2[0] + py * u2[1] < 0) { px = -px; py = -py; }           // 保持拐向
    const Bn = [Av[0] + ux * l1, Av[1] + uy * l1];
    const Cn = [Av[0] + px * l2, Av[1] + py * l2];
    return [{ pts: [Bn[0], Bn[1], Cn[0], Cn[1], Av[0], Av[1]], snap: 'tri-right' }];
  }
  // ---- 1.6.2：平行四边形 / 梯形 / 直角三角形 ----
  // 三条原则：①只在「该形状独有的特征」成立时才认（宁可放过，不可认错）；
  // ②有竞争关系的形状互斥：直角优先矩形、两组对边都平行优先平行四边形、只有一组平行才是梯形；
  // ③返回的顶点保留原笔画的朝向与大致位置，只做最小的规整（对边真正平行、直角真正成 90°）。
  const midPt = (p) => [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2];
  function quad4(v) { const q = []; for (let i = 0; i < 4; i++) q.push([v[2 * i], v[2 * i + 1]]); return q; }
  function quadEdges(P4) {
    const e = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      e.push({ a: Math.atan2(P4[j][1] - P4[i][1], P4[j][0] - P4[i][0]), l: len2(P4[i][0], P4[i][1], P4[j][0], P4[j][1]) });
    }
    return e;
  }
  function snapPara(v) {
    if (v.length !== 8) return null;
    const P4 = quad4(v), e = quadEdges(P4);
    // 两组对边都要平行；且对边长度各自接近（平行四边形定义）
    if (!(angDiff(e[0].a, e[2].a) < 0.20 && angDiff(e[1].a, e[3].a) < 0.20)) return null;
    if (Math.abs(e[0].l - e[2].l) > (e[0].l + e[2].l) * 0.09) return null;
    if (Math.abs(e[1].l - e[3].l) > (e[1].l + e[3].l) * 0.09) return null;
    // 四边几乎等长 ⇒ 菱形/正方形，交给矩形的判据，不在这里认平行四边形（避免把菱形拉正）
    const sides = [e[0].l, e[1].l, e[2].l, e[3].l];
    if (Math.max.apply(null, sides) / Math.max(1e-6, Math.min.apply(null, sides)) < 1.15) return null;
    const u = avgAxis(e[0].a, e[2].a), w2 = avgAxis(e[1].a, e[3].a);
    // 相邻边夹角要算**真实内角**（angDiff 只给 0~90° 的「偏离平行」角，分不出 13° 和 77°）
    const innerAngle = (i) => {
      const A = P4[(i + 3) % 4], B = P4[i], C = P4[(i + 1) % 4];
      const u1 = [A[0] - B[0], A[1] - B[1]], u2 = [C[0] - B[0], C[1] - B[1]];
      const d = (u1[0] * u2[0] + u1[1] * u2[1]) / Math.max(1e-9, Math.hypot(u1[0], u1[1]) * Math.hypot(u2[0], u2[1]));
      return Math.acos(GW.clamp(d, -1, 1));
    };
    const angs = [innerAngle(0), innerAngle(1), innerAngle(2), innerAngle(3)];
    // 任何一个角**非常**接近 90° ⇒ 这是矩形（交给 snapQuad），不在这里认平行四边形。
    // 1.6.2 第一版用 0.22 rad（12.6°）：手画平行四边形常常只有 76°~78° 的内角，
    // 抖动 2px 就能把它推过界，于是「干净平行四边形」时对时错。
    // 收到 0.10 rad（5.7°）——真矩形仍会走 snapQuad，倾斜明显的平行四边形不会再被误判成矩形。
    if (angs.some(a => Math.abs(a - Math.PI / 2) < 0.10)) return null;
    // 角太小 / 太大 ⇒ 退化成一条线或明显反折
    if (angs.some(a => a < 0.42 || a > Math.PI - 0.42)) return null;
    const L1 = (e[0].l + e[2].l) / 2, L2 = (e[1].l + e[3].l) / 2;
    const ux = Math.cos(u), uy = Math.sin(u);
    const vx = Math.cos(w2) * L2, vy = Math.sin(w2) * L2;
    const m0 = midPt([P4[0], P4[1]]), m1 = midPt([P4[3], P4[2]]);
    // 以两条对边的中点连线为「侧边」，构造 A→B→C→D（A-B 与 C-D 平行且等长）
    let sideX = m1[0] - m0[0], sideY = m1[1] - m0[1];
    const sl = Math.hypot(sideX, sideY) || 1;
    sideX = sideX / sl * L2; sideY = sideY / sl * L2;
    const A = [m0[0] - ux * L1 / 2, m0[1] - uy * L1 / 2], B = [m0[0] + ux * L1 / 2, m0[1] + uy * L1 / 2];
    const D = [A[0] + sideX, A[1] + sideY], C = [B[0] + sideX, B[1] + sideY];
    return [{ pts: [A[0], A[1], B[0], B[1], C[0], C[1], D[0], D[1]], snap: 'para' }];
  }
  function snapTrap(v) {
    if (v.length !== 8) return null;
    const P4 = quad4(v), e = quadEdges(P4);
    const p02 = angDiff(e[0].a, e[2].a) < 0.16, p13 = angDiff(e[1].a, e[3].a) < 0.16;
    if (p02 === p13) return null;                 // 两组都平行 ⇒ 平行四边形；都不平行 ⇒ 普通四边形
    const par = p02 ? [0, 2] : [1, 3];
    const other = p02 ? [1, 3] : [0, 2];
    // 另一组边必须明显不平行（超出 12°），否则就是平行四边形被噪声拆开
    if (angDiff(e[other[0]].a, e[other[1]].a) < 0.21) return null;
    const L0 = e[par[0]].l, L1 = e[par[1]].l;
    // 两条平行边长度必须差得明显：等长 ⇒ 平行四边形（梯形的核心特征就是「只有一组对边平行」）
    if (Math.abs(L0 - L1) < Math.max(L0, L1) * 0.12) return null;
    const u = avgAxis(e[par[0]].a, e[par[1]].a);
    const ux = Math.cos(u), uy = Math.sin(u);
    // 平行边按原顺序取中点，两条平行边沿 u 各自居中（保持原来那条中线）
    const m0 = midPt(par[0] === 0 ? [P4[0], P4[1]] : [P4[1], P4[2]]);
    const m1 = midPt(par[0] === 0 ? [P4[3], P4[2]] : [P4[0], P4[3]]);
    const mk = (m, L) => [[m[0] - ux * L / 2, m[1] - uy * L / 2], [m[0] + ux * L / 2, m[1] + uy * L / 2]];
    let A, B, C, D;
    if (par[0] === 0) { const a = mk(m0, L0), d = mk(m1, L1); A = a[0]; B = a[1]; D = d[0]; C = d[1]; }
    else { const a = mk(m0, L0), d = mk(m1, L1); B = a[0]; C = a[1]; A = d[0]; D = d[1]; }
    // 套用原笔迹的走向：如果原来的 A→B 是反向的，翻转回来
    const dirA = Math.cos(e[0].a), dirB = Math.cos(e[par[0] === 0 ? 0 : 0].a);
    let pts = [A[0], A[1], B[0], B[1], C[0], C[1], D[0], D[1]];
    if (dirA * Math.cos(e[0].a) < 0) { /* 保留 */ }
    // 保序检查：规整后的 A-B-C-D 必须与原来的四个角一一对应（不能把梯形翻个面）
    const orig = P4.map(p => p[0] * 1e-3 + p[1] * 1e-7);
    const got = [A, B, C, D].map(p => p[0] * 1e-3 + p[1] * 1e-7);
    let score = 0;
    for (let i = 0; i < 4; i++) score += Math.abs(orig[i] - got[i]);
    const score2 = Math.abs(orig[0] - got[0]) + Math.abs(orig[1] - got[3]) + Math.abs(orig[2] - got[2]) + Math.abs(orig[3] - got[1]);
    if (score2 < score) pts = [A[0], A[1], D[0], D[1], C[0], C[1], B[0], B[1]];
    return [{ pts, snap: 'trap' }];
  }
  // 1.4.0（R2）：正 5~8 边形的 snapNgon 已按老师要求**彻底删除** —— 智能笔必须优先保证
  // 圆/椭圆的识别，多边形这条路径只要还在，圆就随时可能被吃成六边形。
  // 要画正多边形请用插入里的「正多边形」工具（makeShape 的 hexagon）。

  // 写字保护：几笔挤在同一块地方、短时间内连着落下 ⇒ 这是在写字，不规整
  function looksLikeText(st, b) {
    if (Math.hypot(b.w, b.h) * GW.camera.s >= SNAP_TEXT_MAX_PX) return false;
    const area = Math.max(b.w * b.h, 1e-6), now = Date.now();
    const pg = (GW.page && GW.page()) || null;
    const list = (pg && pg.ink) || [];
    let hits = 0;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it === st || it.kind !== 'stroke' || !it.pts) continue;
      if (!(now - (it._t || 0) < SNAP_TEXT_NEAR_MS)) continue;
      const q = GW.bbox(it);
      if (!q) continue;
      const ix = Math.min(b.x + b.w, q.x + q.w) - Math.max(b.x, q.x);
      const iy = Math.min(b.y + b.h, q.y + q.h) - Math.max(b.y, q.y);
      if (ix <= 0 || iy <= 0) continue;
      if ((ix * iy) / Math.min(area, Math.max(q.w * q.h, 1e-6)) >= SNAP_TEXT_OVERLAP && ++hits >= SNAP_TEXT_MIN) return true;
    }
    return false;
  }
  // smartSnap = 'hold' 时用：收笔前有没有停顿（最后 6 个采样点几乎不动 = 停了一下）
  function penPaused(pts) {
    const n = pts.length / 2;
    if (n < 7) return false;
    return len2(pts[2 * n - 2], pts[2 * n - 1], pts[2 * (n - 6)], pts[2 * (n - 6) + 1]) * GW.camera.s < 10;
  }

  // ---------- 1.4.5（R2 修复）：把「笔迹」清成可判定的点列 ----------
  // 老师反馈「画矩形/三角形/圆/椭圆要画得很精准才认」，根因不在阈值，而在**前端几何**：
  // ① 闭合判定拿 `max(len*0.18, diag*0.22)` 当门 —— 缺口 25% 的圆首尾弦长就有 1.41r，
  //    门只有 1.03r，直接被判成「开口曲线」，连圆的分支都进不去；
  // ② 顶点全靠 `rdp` 抽，容差 `diag*0.085`（400px 的矩形就是 34px）—— 圆角、轻微外凸
  //    的边会被抽成位置很歪的点，后面的「4 点必须两两平行/成直角」自然过不去；
  // ③ 收笔画过头一点点就自交，`selfCross` 一票否决。
  // 这里加一层「等距重采样 + 轻度平滑 + 掐掉回头尾巴 + 沿弦补缺口 + 转角找角点」，
  // 让后面的模板拟合拿到的是形状本身的点，而不是采样噪声。
  function resample(p, step) {
    const out = [p[0], p[1]];
    let carry = 0;
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2], ay = p[i - 1], bx = p[i], by = p[i + 1];
      const d = Math.hypot(bx - ax, by - ay);
      if (d < 1e-9) continue;
      let sPos = 0;
      while (sPos + (step - carry) <= d) {
        sPos += step - carry;
        carry = 0;
        const u = sPos / d;
        out.push(ax + (bx - ax) * u, ay + (by - ay) * u);
      }
      carry += d - sPos;
    }
    return out;
  }
  function smoothArr(q, passes) {
    const n = q.length / 2;
    if (n < 5) return q;
    let a = q.slice();
    for (let k = 0; k < (passes || 2); k++) {
      const b = a.slice();
      for (let i = 1; i < n - 1; i++) {
        b[2 * i] = (a[2 * i - 2] + 2 * a[2 * i] + a[2 * i + 2]) / 4;
        b[2 * i + 1] = (a[2 * i - 1] + 2 * a[2 * i + 1] + a[2 * i + 3]) / 4;
      }
      a = b;
    }
    return a;
  }
  // 返回 { core, ring }：core＝去掉回头尾巴的干净点列（拿来拟合圆/椭圆），
  // ring＝再沿首尾弦补点后的闭合点列（拿来算面积、残差、角点）
  function cleanRing(p, diag) {
    const step = Math.max(1.5, diag * 0.012);
    let q = smoothArr(resample(p, step), 2);
    const n = q.length / 2;
    if (n < 8) return null;
    // 收笔回头：后半段里离起点最近的那个点之后都算「画过头」。只掐短尾巴（≤ 25% 周长），
    // 否则「8」字会被掐成一个圈、当成椭圆。
    let cut = n - 1, best = Infinity;
    for (let i = Math.max(3, Math.floor(n * 0.55)); i < n; i++) {
      const d = len2(q[2 * i], q[2 * i + 1], q[0], q[1]);
      if (d < best) { best = d; cut = i; }
    }
    if (best < diag * 0.12 && cut < n - 1 && (n - 1 - cut) <= n * 0.25) q = q.slice(0, 2 * (cut + 1));
    const core = q.slice();
    const gap = len2(q[q.length - 2], q[q.length - 1], q[0], q[1]);
    if (gap > step * 2) {
      const gx = q[q.length - 2], gy = q[q.length - 1];
      const k = Math.min(60, Math.max(1, Math.round(gap / step)));
      for (let i = 1; i < k; i++) q.push(gx + (q[0] - gx) * (i / k), gy + (q[1] - gy) * (i / k));
    }
    return { core, ring: q, step };
  }
  // 最小二乘圆（Kasa）：解 x²+y² = a·x + b·y + c
  function fitCircle(q) {
    const n = q.length / 2;
    if (n < 8) return null;
    let Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0, Sxz = 0, Syz = 0, Sz = 0;
    for (let i = 0; i < n; i++) {
      const x = q[2 * i], y = q[2 * i + 1], z = x * x + y * y;
      Sx += x; Sy += y; Sxx += x * x; Syy += y * y; Sxy += x * y; Sxz += x * z; Syz += y * z; Sz += z;
    }
    const det = (a, b, c, d, e, f, g, h, i2) => a * (e * i2 - f * h) - b * (d * i2 - f * g) + c * (d * h - e * g);
    const D = det(Sxx, Sxy, Sx, Sxy, Syy, Sy, Sx, Sy, n);
    if (Math.abs(D) < 1e-9) return null;
    const A = det(Sxz, Sxy, Sx, Syz, Syy, Sy, Sz, Sy, n) / D;
    const B = det(Sxx, Sxz, Sx, Sxy, Syz, Sy, Sx, Sz, n) / D;
    const C = det(Sxx, Sxy, Sxz, Sxy, Syy, Syz, Sx, Sy, Sz) / D;
    const cx = A / 2, cy = B / 2, r2 = C + cx * cx + cy * cy;
    if (!(r2 > 0)) return null;
    return { cx, cy, r: Math.sqrt(r2) };
  }
  // 轴对齐椭圆最小二乘：A·u² + B·v² = 1（u,v 相对给定中心）
  function fitEllipseAxis(q, cx, cy) {
    const n = q.length / 2;
    if (n < 10) return null;
    let Su4 = 0, Sv4 = 0, Su2v2 = 0, Su2 = 0, Sv2 = 0;
    for (let i = 0; i < n; i++) {
      const u = q[2 * i] - cx, v = q[2 * i + 1] - cy;
      const u2 = u * u, v2 = v * v;
      Su4 += u2 * u2; Sv4 += v2 * v2; Su2v2 += u2 * v2; Su2 += u2; Sv2 += v2;
    }
    const D = Su4 * Sv4 - Su2v2 * Su2v2;
    if (Math.abs(D) < 1e-9) return null;
    const A = (Su2 * Sv4 - Sv2 * Su2v2) / D, B = (Sv2 * Su4 - Su2 * Su2v2) / D;
    if (!(A > 0) || !(B > 0)) return null;
    return { cx, cy, rx: 1 / Math.sqrt(A), ry: 1 / Math.sqrt(B) };
  }
  // 归一化半径的最大偏差（相对 1），对缺口不敏感
  function maxEllDev(q, cx, cy, rx, ry) {
    let worst = 0;
    for (let i = 0; i < q.length; i += 2) {
      const dn = Math.hypot((q[i] - cx) / rx, (q[i + 1] - cy) / ry);
      const d = Math.abs(dn - 1);
      if (d > worst) worst = d;
    }
    return worst;
  }
  // 分位偏差（比 maxEllDev 稳）：手画圆总有 1~2 个点甩出去，用最大值会被单个坏点否掉整条圆
  // 1.7.4：**可以斜着**的椭圆拟合（主轴方向由点集协方差给出）。
  // 老实现只有轴对齐椭圆，老师斜着画一个椭圆就拟合不出（残差超标）⇒ 落到矩形/梯形分支，
  // 也就是用户看到的「椭圆经常被认成四边形」；长短轴比不到 1.28 时又被圆先吃掉。
  // 做法：质心 + 协方差定主轴角 → 在主轴坐标系里取 98% 分位的 |u|、|v| 当 rx/ry
  //（用分位而不是最大值，避免起笔那一小段外飘把轴撑大）→ 再算一次归一化径向偏差。
  function fitEllipseRot(q) {
    const n = q.length / 2;
    if (n < 12) return null;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += q[2 * i]; my += q[2 * i + 1]; }
    mx /= n; my /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const dx = q[2 * i] - mx, dy = q[2 * i + 1] - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    if (!(sxx + syy > 1e-6)) return null;
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const c = Math.cos(th), s = Math.sin(th);
    const us = [], vs = [];
    for (let i = 0; i < n; i++) {
      const dx = q[2 * i] - mx, dy = q[2 * i + 1] - my;
      us.push(Math.abs(dx * c + dy * s));
      vs.push(Math.abs(-dx * s + dy * c));
    }
    us.sort((a, b) => a - b); vs.sort((a, b) => a - b);
    const q98 = (a) => a[Math.min(a.length - 1, Math.floor(0.98 * (a.length - 1)))];
    // 满圈的 98% 分位比真实半轴略小 2%，补回来；ry 太小说明是一条线，不算椭圆
    const rx = q98(us) * 1.02, ry = q98(vs) * 1.02;
    if (!(rx > 2) || !(ry > 2)) return null;
    let dev = 0;
    const ds = [];
    for (let i = 0; i < n; i++) {
      const dx = q[2 * i] - mx, dy = q[2 * i + 1] - my;
      const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
      ds.push(Math.abs(Math.hypot(u, v) - 1));
    }
    ds.sort((a, b) => a - b);
    dev = ds[Math.min(ds.length - 1, Math.floor(0.9 * (ds.length - 1)))];
    return { cx: mx, cy: my, rx, ry, rot: th, dev };
  }

  function ellDevQ(q, cx, cy, rx, ry, qq) {
    const ds = [];
    for (let i = 0; i < q.length; i += 2) {
      const dn = Math.hypot((q[i] - cx) / rx, (q[i + 1] - cy) / ry);
      ds.push(Math.abs(dn - 1));
    }
    if (!ds.length) return 9;
    ds.sort((a, b) => a - b);
    return ds[Math.min(ds.length - 1, Math.floor((qq || 0.9) * (ds.length - 1)))];
  }
  // 最大转角（弧度）：圆/椭圆上处处很小，正多边形在角点处很大 —— 用它把「七边形」挡在椭圆之外
  function maxTurnOf(q, step) {
    const n = q.length / 2;
    if (n < 12) return 9;
    // 注意：**不能绕回**。缺口大的圆，末点→首点那一步是弦、不是弧，绕回算出来的
    // 转角就是缺口处的那个「假角」（实测 90° 缺口的圆 mt 被算成 0.81，直接把圆否掉）。
    // 窗口按「弧长 ≈ 0.12·半径」缩放：太小会被抖动 ±3px 放大成 0.7 rad 的假角，
    // 太大又把多边形的 90° 角抹平（实测右图 rect_wob3 用固定 2 点窗口直接丢了一个角）。
    let rEst = 0;
    for (let i = 0; i < n; i += 4) { rEst += len2(q[2 * i], q[2 * i + 1], q[0], q[1]); }
    rEst = Math.max(8, (rEst / Math.ceil(n / 4)) * 0.9);
    const W = Math.max(2, Math.min(14, Math.round((0.12 * rEst) / Math.max(step || 1, 0.5))));
    const turn = new Float64Array(n);
    for (let i = W; i < n - W; i++) {
      const ax = q[2 * i] - q[2 * (i - W)], ay = q[2 * i + 1] - q[2 * (i - W) + 1];
      const bx = q[2 * (i + W)] - q[2 * i], by = q[2 * (i + W) + 1] - q[2 * i + 1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la < 1e-9 || lb < 1e-9) continue;
      turn[i] = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
    }
    let best = 0;
    for (let i = 1; i < n - 1; i++) {
      let s2 = 0, c = 0;
      for (let k = -1; k <= 1; k++) { const j = i + k; if (j >= 0 && j < n) { s2 += turn[j]; c++; } }
      if (s2 / c > best) best = s2 / c;
    }
    return best;
  }
  // 角点：平滑后的转角序列里挑峰（≥ 0.55 rad ≈ 31°），合并靠得太近的峰
  // 只数「硬角」（高于硬阈值）的角点：给「是不是正多边形」用。
  // 不能直接拿 cornersOf 的结果——它对圆角矩形会自适应降到 0.30，抖动的圆也会冒出 5 个假峰。
  function hardCorners(ring, diag, step, thr) {
    const n = ring.length / 2;
    if (n < 16) return 0;
    let rEst = 0;
    for (let i = 0; i < n; i += 4) { rEst += len2(ring[2 * i], ring[2 * i + 1], ring[0], ring[1]); }
    rEst = Math.max(8, (rEst / Math.ceil(n / 4)) * 0.9);
    const W = Math.max(2, Math.min(14, Math.round((0.10 * rEst) / Math.max(step || 1, 0.5))));
    const t = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const i0 = (i - W + n) % n, i1 = (i + W) % n;
      const ax = ring[2 * i] - ring[2 * i0], ay = ring[2 * i + 1] - ring[2 * i0 + 1];
      const bx = ring[2 * i1] - ring[2 * i], by = ring[2 * i1 + 1] - ring[2 * i + 1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la < 1e-9 || lb < 1e-9) continue;
      t[i] = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
    }
    const sm = new Float64Array(n);
    for (let i = 0; i < n; i++) sm[i] = (t[i] + t[(i - 1 + n) % n] + t[(i + 1) % n]) / 3;
    const T = thr == null ? 0.55 : thr, minSep = Math.max(3, Math.round(n * 0.06));
    let c = 0, last = -1e9;
    for (let i = 0; i < n; i++) {
      if (sm[i] < T) continue;
      const a = sm[(i - 1 + n) % n], b = sm[(i + 1) % n];
      if (sm[i] < a || sm[i] < b) continue;
      if (i - last < minSep) { c--; }   // 与上一个峰太近：合并
      last = i; c++;
    }
    return Math.max(0, c);
  }
  function cornersOf(ring, diag, step) {
    const n = ring.length / 2;
    if (n < 16) return [];
    let rEst = 0;
    for (let i = 0; i < n; i += 4) { rEst += len2(ring[2 * i], ring[2 * i + 1], ring[0], ring[1]); }
    rEst = Math.max(8, (rEst / Math.ceil(n / 4)) * 0.9);
    const W = Math.max(2, Math.min(14, Math.round((0.10 * rEst) / Math.max(step || 1, 0.5))));
    const turn = new Float64Array(n);
    // ring 是**闭合**点列（缺口已补齐），所以这里可以绕回：不绕回就会丢掉正好落在起笔处的那个角
    // （实测：从左上角起笔的矩形，四个角只数出三个，整条矩形判不出来）。
    for (let i = 0; i < n; i++) {
      const i0 = (i - W + n) % n, i1 = (i + W) % n;
      const ax = ring[2 * i] - ring[2 * i0], ay = ring[2 * i + 1] - ring[2 * i0 + 1];
      const bx = ring[2 * i1] - ring[2 * i], by = ring[2 * i1 + 1] - ring[2 * i + 1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la < 1e-9 || lb < 1e-9) continue;
      turn[i] = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
    }
    const sm = new Float64Array(n);
    for (let i = 0; i < n; i++) sm[i] = (turn[i] + turn[(i - 1 + n) % n] + turn[(i + 1) % n]) / 3;
    // 峰阈值从 0.55 rad 往下自适应：圆这么低的角度不会有峰，而圆角矩形的角被平滑磨到
    // 0.4 出头是常态（实测 rect_round24 有一半概率只数出 3 个角，整条矩形就判不出来）。
    const minSep = Math.max(3, Math.round(n * 0.06));
    let keep = [];
    for (const thr of [0.55, 0.40, 0.30]) {
      const peaks = [];
      for (let i = 0; i < n; i++) {
        if (sm[i] < thr) continue;
        const a = sm[(i - 1 + n) % n], b = sm[(i + 1) % n];
        if (sm[i] < a || sm[i] < b) continue;
        peaks.push({ i, v: sm[i] });
      }
      peaks.sort((x, y) => y.v - x.v);
      const got = [];
      for (let k = 0; k < peaks.length; k++) {
        const pi = peaks[k].i;
        let ok = true;
        for (let j = 0; j < got.length; j++) {
          let d = Math.abs(got[j].i - pi);
          d = Math.min(d, n - d);
          if (d < minSep) { ok = false; break; }
        }
        if (ok) got.push(peaks[k]);
        if (got.length >= 8) break;
      }
      if (got.length > keep.length) keep = got;
      if (keep.length >= 3) break;         // 3 个就够试三角形，4 个才够试矩形（在 recognize 里判）
    }
    keep.sort((a, b) => a.i - b.i);
    const out = [];
    for (let k = 0; k < keep.length; k++) out.push(ring[2 * keep[k].i], ring[2 * keep[k].i + 1]);
    return out;
  }
  // 数「凹下去的瓣」：真圆/椭圆的半径-角度曲线单调平滑，正多边形在每条边的中点
  // 会出现 n 个明显的下凹（外接圆半径 190、七边形边中点比顶点内收 9.6%）。
  // 圆角把转角抹平后 hardCorners 会漏，但凹瓣数不会丢——这是「圆角多边形」唯一稳的判据。
  function lobeCount(pts, cx, cy, rx, ry) {
    const n = pts.length / 2;
    if (n < 24) return 0;
    const d = [];
    for (let i = 0; i < n; i++) {
      const v = Math.hypot((pts[2 * i] - cx) / rx, (pts[2 * i + 1] - cy) / ry);
      d.push(v - 1);
    }
    const sm = [];
    for (let i = 0; i < n; i++) sm.push((d[i] + d[(i - 1 + n) % n] + d[(i + 1) % n]) / 3);
    const T = -0.025;
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (sm[i] >= T) continue;
      const a = sm[(i - 1 + n) % n], b = sm[(i + 1) % n];
      if (sm[i] <= a && sm[i] < b) c++;
    }
    return c;
  }
  function polyArea(q) {
    let s2 = 0;
    const n = q.length / 2;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; s2 += q[2 * i] * q[2 * j + 1] - q[2 * j] * q[2 * i + 1]; }
    return Math.abs(s2) / 2;
  }

  GW.__snap = { mergeVerts, selfCross, snapTri, snapQuad, residOf, looksLikeText, penPaused, rdp, cleanRing, cornersOf, hardCorners, residQ, fitRect, lobeCount, fitCircle, fitEllipseAxis, maxTurnOf, maxEllDev, polyArea, vHook, arrowOf, axesOf, starOf, cornerTurn };

  // ===== 1.7.2 新增：开口的箭头/双箭头/坐标系，闭合的椭圆/圆角矩形/正多边形/五角星 =====
  // 阈值一律命名 + 一行「为什么是这个数」：这些都是探针量出来的，散在分支里以后没人敢动。
  const ARROW_STRAIGHT = 0.8;      // 弦/总长 ≥0.8：带 10% 回勾的箭头实测 0.83~0.95；V 形折线只有 ~0.65
  const HOOK_MIN_FRAC = 0.04;      // 回勾 ≥4% 弦长：再短就是收笔抖动（penPaused 那 6 个 1.8px 点）
  const HOOK_MAX_FRAC = 0.28;      // 回勾 ≤28% 弦长：再长就是「对勾/折线」，不是箭头
  const HOOK_MIN_ANG = 0.314;      // 回勾与反向主轴 ≥18°：贴着主轴的回勾看不出是箭头
  const HOOK_MAX_ANG = 0.96;       // 回勾与反向主轴 ≤55°：再大就是垂直回折，箭头变成方角
  const ARROW_FRONT_MIN = 0.08;    // 首端回勾 ≥8% 弦长：单箭头起笔处那「一小段箭杆」实测只有 6.2%，
                                   // 不设这条会把普通箭头读成双箭头（探针实测 6.2% vs 真回勾 10%）
  const AXES_CORNER_TOL = 0.314;   // 坐标系拐点 90°±18°：手画直角的实测偏差 <12°
  const AXES_LEG_MIN = 0.32;       // 每条腿 ≥32% 总长：低于这个只是一条线带个小弯
  const AXES_CORNER_WIN = 0.08;    // 量拐角时两侧各取 8% 总长的方向：手画直角被抹圆后相邻两点只剩 ~70°
  const ELLIPSE_AXIS_MIN = 1.28;   // 长短轴比 ≥1.28：手画圆的轴比最多 1.1~1.2，1.3 以上才是真想画椭圆
  const ELLIPSE_DEV_MUL = 2.2;     // 椭圆残差门 = residMax()*2.2，与圆的 cirTol 同源，灵敏度滑杆共用
  const ELLIPSE_DEV_CAP = 0.075;   // 但 2.2×门在默认灵敏度下是 0.198，太松 —— 实测圆角矩形 0.116、手画矩形 0.158、
                                   // 菱形 0.150 都会漏进椭圆；真椭圆只 0.01~0.03，所以再加这条 0.9 分位硬上限
  const ELLIPSE_AREA_MIN = 0.9;    // 面积比 ≥0.9：真椭圆实测 0.998，补缺口也不会低到 0.9 以下
  const ELLIPSE_AREA_MAX = 1.1;    // ≤1.1：矩形是内接椭圆的 1.27 倍、圆角矩形 0.952（面积只能兜底，主判据是上面的偏差）
  const ROUNDRECT_RESID = 1.7;     // 圆角矩形残差 ≤1.7×通用门：圆角 r=24/300 约 0.6×，r=45 约 1.0×
  const ROUNDRECT_FILL = 0.9;      // 填充度 ≥0.9：菱形 0.5、三角形 0.5，圆角矩形 ≥0.95
  const ROUNDRECT_TURN = 0.55;     // 四角局部转角 <0.55 rad：直角是 1.57，r=45 的圆角实测 ~0.5
  const NGON_RDEV = 0.09;          // 正多边形径向起伏 ≤9%：正六边形 ~5.5%、正五边形 ~8%
  const NGON_MIN_SIDE = 5;         // 角点数下限 5
  const NGON_MAX_SIDE = 8;         // 角点数上限 8
  const NGON_SIDES = [5, 6, 8];    // 只认 5/6/8：七边形必须留给「正七边形不规整」那条老红线
  const STAR_PEAK_RATIO = 0.62;    // 内/外半径比 ≤0.62：正五角星 0.382，手画最多 0.55
  const STAR_SEP_FRAC = 0.08;      // 相邻外角至少隔 8% 周长：星形 10 个角，抖动出的假峰更密

  // ===== 1.7.6（R1）：教室白板反馈 —— 竖线被吃成向下箭头、0/o/挨近的字被吃成小图形 =====
  // 新门一律按**屏幕像素**判定（乘 GW.camera.s）：同一条笔迹在 50% / 200% 缩放下的结论必须一致。
  // smartSnap==='hold' 是老师主动停一下才规整、本来就有人确认，跳过新门以保留全部能力；
  // 设置里的 drawHold 候选条走 holdDecide（4396），与这里的 recognize 无关，也不受影响。
  const GUARD_ON = () => !GW.settings || GW.settings.smartSnap !== 'hold';
  const camScale = () => (GW.camera && GW.camera.s) || 1;
  const ARROW_MIN_LEN_PX = 200;     // 箭杆弦长 ≥200 屏幕px：板书箭头实测 250~400px，写「1」「|」/分式竖划 60~180px
  const HOOK_MIN_PX = 16;           // 回勾绝对长 ≥16px：短笔画收笔回带只有 2~8px（4%×80px 仅 3.2px）
  const AXES_MIN_LEG_PX = 90;       // 坐标系每条腿 ≥90 屏幕px：写「L」「7」「口」的腿只有 30~60px
  const AXES_MIN_SPAN_PX = 200;     // 两腿合计 ≥200 屏幕px，与箭头同量级
  const SHAPE_MIN_AREA_PX2 = 12000; // 闭合图形包围盒面积 ≥12000px²：0/o 约 900~2500、两个挨近的字连笔 ~3200
  const SHAPE_MIN_SIDE_PX = 80;     // 且短边 ≥80px：只靠对角线 72px 的门，细长笔画也能凑够
  // ===== 2.2.3（R7）：小图形停笔驻留 =====
  // 上面那道面积门本来是防「写字被吃掉」的，但它把 12000px² 以下的小图形一刀切了：
  // 老师画一个 100×90 的方框当电路元件、画一个小圆当滑轮，抬手就还原成手写笔迹，
  // 想规整只能画大再缩小。补一条**时间维度**的出口：这一笔收笔前停住了（≥ smallShapeHoldMs），
  // 就证明是有意画的，小图形也照认；没停住仍是写字，门照旧。面积门数值一处都没动。
  const holdOn = () => !GW.settings || GW.settings.smallShapeHold !== false;
  const holdMs = () => { const n = +((GW.settings || {}).smallShapeHoldMs); return isFinite(n) && n >= 200 ? n : 1000; };
  // 一笔的停留时长 = 抬手时刻 `_upT` − 最后一次移动时刻 `_mvT`（都是 performance 时基，见 penDown/st.up）。
  // 老存档与合成事件没有这两个字段 ⇒ 返回 -1，调用方按「没停」处理，逐位等价 2.2.2。
  // 以 `_` 开头的字段由 board.js 的 strip() 自动剥掉，不进 .gewu（KEEP_UNDERSCORE 只有 _rot/_rw/_rh）。
  const holdOf = (st) => {
    const up = +st._upT, mv = +st._mvT;
    if (!isFinite(up) || !isFinite(mv) || !up || !mv) return -1;
    return up - mv;
  };
  const smallHoldOk = (st) => holdOn() && holdOf(st) >= holdMs();

  // V 形回勾：tip 是尖端，barb 是回勾末端，(ax,ay) 是「根部→尖端」的主轴单位向量。
  // 回勾方向（尖端→翼）与 -轴 的夹角必须在 18°~55°：太小说明根本没回勾，太大说明把箭头画成了直角。
  function vHook(tipx, tipy, bx, by, ax, ay, chord) {
    const hx = bx - tipx, hy = by - tipy, hl = Math.hypot(hx, hy);
    if (hl < chord * HOOK_MIN_FRAC || hl > chord * HOOK_MAX_FRAC) return false;
    // 1.7.6：比例门（4%）在短笔画上只有 3px，收笔顿笔/回带照样过 —— 再兜一道绝对像素下限
    if (GUARD_ON() && hl * camScale() < HOOK_MIN_PX) return false;
    const ang = Math.acos(GW.clamp((hx * -ax + hy * -ay) / (hl || 1e-9), -1, 1));
    return ang >= HOOK_MIN_ANG && ang <= HOOK_MAX_ANG;
  }

  // 箭头/双箭头：尖端 = 离起笔端最远的点，回勾 = 笔画末端；首端也回勾就是双箭头。
  // 不能拿「倒数第二点」当尖端：真实笔迹（以及探针的稠密采样）回勾自己就有好几个点，
  // 稠密笔迹里尖端离末端有 3~4 个点，按倒数第二点量出来的回勾长度会掉到 1%。
  function arrowOf(p, len, base) {
    const n = p.length / 2;
    if (n < 6) return null;
    let ti = 0, td = 0;
    for (let i = 1; i < n; i++) { const d = Math.hypot(p[2 * i] - p[0], p[2 * i + 1] - p[1]); if (d > td) { td = d; ti = i; } }
    if (ti < 2 || ti > n - 2) return null;      // 尖端两侧都要有点：右侧是回勾、左侧是箭杆
    if (!(td > 1e-6)) return null;
    const tx = p[2 * ti], ty = p[2 * ti + 1];
    let ux = (tx - p[0]) / td, uy = (ty - p[1]) / td;
    // 首端回勾：前端尖端 = 起笔后 20% 笔迹里离尾端最远的点（回勾的末端总比尖端更靠近尾端）。
    // 单箭头起笔处没有回勾，第一点就是箭杆起点，这次搜索只会落到相邻的箭杆点上（长度 ~6%），
    // 用 ARROW_FRONT_MIN 把这种「一小段箭杆」与真正的回勾（10%~28%）分开。
    let dbl = false, hx = p[0], hy = p[1];
    const fmax = Math.min(n - 2, Math.max(3, Math.round(n * 0.2)));
    let ft = 1, fd = 0;
    for (let i = 1; i <= fmax; i++) { const d = Math.hypot(p[2 * i] - tx, p[2 * i + 1] - ty); if (d > fd) { fd = d; ft = i; } }
    const fl = Math.hypot(p[2 * ft] - p[0], p[2 * ft + 1] - p[1]);
    if (fl >= td * ARROW_FRONT_MIN) {
      const ang0 = Math.acos(GW.clamp(((p[2 * ft] - p[0]) * ux + (p[2 * ft + 1] - p[1]) * uy) / (fl || 1e-9), -1, 1));
      if (ang0 >= HOOK_MIN_ANG && ang0 <= HOOK_MAX_ANG) { dbl = true; hx = p[2 * ft]; hy = p[2 * ft + 1]; }
    }
    const chord = Math.hypot(tx - hx, ty - hy);
    if (!(chord > 1e-6) || chord < len * ARROW_STRAIGHT) return null;
    // 1.7.6：长线才当箭头。写「1」「|」的短竖划收笔那点回带，不再被吃成向下的箭头
    if (GUARD_ON() && chord * camScale() < ARROW_MIN_LEN_PX) return null;
    // 尖端必须是全身离前端最远的点：V 形折线/对勾的「尖」在中间，被这条挡掉
    for (let i = 0; i < n; i++) if (Math.hypot(p[2 * i] - hx, p[2 * i + 1] - hy) > chord * 1.06) return null;
    ux = (tx - hx) / chord; uy = (ty - hy) / chord;
    if (!vHook(tx, ty, p[2 * n - 2], p[2 * n - 1], ux, uy, chord)) return null;   // 收笔端（箭头所指）回勾
    if (dbl && !vHook(hx, hy, p[0], p[1], ux, uy, chord)) return null;
    const o = { type: 'arrow', pts: [hx, hy, tx, ty] };
    if (dbl) o.double = true;
    return Object.assign(base, o);
  }

  // 坐标系：一笔画出两条腿（O 拐点 + 两个端点），至少一条腿末端带 V 形回勾。
  // 十字交叉不是开口笔画进不来；「口」字折线没有回勾，也进不来。
  function axesOf(p, len, base) {
    const n = p.length / 2;
    if (n < 8) return null;
    // 前缀弧长：拐点循环里要一次算出两条腿的长度，不能再对每个 i 重扫一遍（O(n²)）
    const acc = new Float64Array(n);
    for (let i = 1; i < n; i++) acc[i] = acc[i - 1] + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
    // 拐点两侧各取 8% 总长的方向来量夹角：只取相邻两点的话，手画的直角被抹圆后只剩 ~70°
    const win = len * AXES_CORNER_WIN;
    let ci = -1, cmax = 0;
    for (let i = 2; i <= n - 3; i++) {
      // 拐点候选必须「两腿都够长」：回勾自己的转角 ~150° 永远大于 90°，但回勾那一侧的腿
      // 只有 ~10% 总长，用这条把它排除掉，否则整条坐标系会被拐点定在箭羽上。
      const la = acc[i], lb = len - acc[i];
      if (la < len * AXES_LEG_MIN || lb < len * AXES_LEG_MIN) continue;
      let a0 = i; while (a0 > 0 && acc[i] - acc[a0] < win) a0--;
      let b0 = i; while (b0 < n - 1 && acc[b0] - acc[i] < win) b0++;
      const ax = p[2 * i] - p[2 * a0], ay = p[2 * i + 1] - p[2 * a0 + 1];
      const bx = p[2 * b0] - p[2 * i], by = p[2 * b0 + 1] - p[2 * i + 1];
      const pa = Math.hypot(ax, ay), pb = Math.hypot(bx, by);
      if (pa < 1e-6 || pb < 1e-6) continue;
      const t = Math.acos(GW.clamp((ax * bx + ay * by) / (pa * pb), -1, 1));
      if (t > cmax) { cmax = t; ci = i; }
    }
    if (ci < 0 || Math.abs(cmax - Math.PI / 2) > AXES_CORNER_TOL) return null;
    const ox = p[2 * ci], oy = p[2 * ci + 1];
    // 两腿的「尖端」= 离 O 最远的点：回勾一定往回画，所以尖端之后那几点比尖端更靠近 O。
    // 回勾 = 尖端 → 笔画端点，长度/夹角都按这条弦量（不依赖端点前一个点在哪）。
    let ai = ci, ad = 0;
    for (let i = 0; i <= ci; i++) { const d = Math.hypot(p[2 * i] - ox, p[2 * i + 1] - oy); if (d > ad) { ad = d; ai = i; } }
    let bi = ci, bd = 0;
    for (let i = ci; i < n; i++) { const d = Math.hypot(p[2 * i] - ox, p[2 * i + 1] - oy); if (d > bd) { bd = d; bi = i; } }
    if (!(ad > 1e-6) || !(bd > 1e-6)) return null;
    // 1.7.6：坐标系同理 —— 两条腿都得是长线，写「L」「7」「口」的短拐不算
    if (GUARD_ON()) {
      const s = camScale();
      if (ad * s < AXES_MIN_LEG_PX || bd * s < AXES_MIN_LEG_PX || (ad + bd) * s < AXES_MIN_SPAN_PX) return null;
    }
    // vHook 的轴参数是「根部→尖端」（与箭头一致）：腿的根部是 O，尖端是 leg 端点
    const hookA = ai > 0 && vHook(p[2 * ai], p[2 * ai + 1], p[0], p[1], (p[2 * ai] - ox) / ad, (p[2 * ai + 1] - oy) / ad, ad);
    const hookB = bi < n - 1 && vHook(p[2 * bi], p[2 * bi + 1], p[2 * n - 2], p[2 * n - 1], (p[2 * bi] - ox) / bd, (p[2 * bi + 1] - oy) / bd, bd);
    if (!hookA && !hookB) return null;
    // 轴名要贴对：横向那条腿是 x 轴、竖向那条是 y 轴（与 drawItem 的 pts: O, X端, Y端 一致）
    const horiz = Math.abs(p[2 * ai] - ox) >= Math.abs(p[2 * ai + 1] - oy);
    const xx = horiz ? p[2 * ai] : p[2 * bi], yy = horiz ? p[2 * bi + 1] : p[2 * ai + 1];
    return Object.assign(base, { type: 'axes', pts: [ox, oy, xx, oy, ox, yy] });
  }

  // 四角是不是被抹圆了：量拟合矩形四个角附近的局部转角。直角 1.57 rad，圆角 r=45 实测 ~0.5。
  function cornerTurn(ring, step, x, y) {
    const n = ring.length / 2;
    if (n < 16) return 9;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = len2(ring[2 * i], ring[2 * i + 1], x, y); if (d < bd) { bd = d; bi = i; } }
    let rEst = 0;
    for (let i = 0; i < n; i += 4) rEst += len2(ring[2 * i], ring[2 * i + 1], ring[0], ring[1]);
    rEst = Math.max(8, (rEst / Math.ceil(n / 4)) * 0.9);
    const w = Math.max(2, Math.min(14, Math.round((0.10 * rEst) / Math.max(step || 1, 0.5))));
    const i0 = (bi - w + n) % n, i1 = (bi + w) % n;
    const ax = ring[2 * bi] - ring[2 * i0], ay = ring[2 * bi + 1] - ring[2 * i0 + 1];
    const bx = ring[2 * i1] - ring[2 * bi], by = ring[2 * i1 + 1] - ring[2 * bi + 1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) return 9;
    return Math.acos(GW.clamp((ax * bx + ay * by) / (la * lb), -1, 1));
  }

  // 五角星：绕中心的外/内半径必须交替 5 轮（10 个角）。cornersOf 最多只留 8 个峰，
  // 10 个角的星形不能走它 —— 这里直接在半径曲线上找 5 个外峰、再取每两个外峰之间的内谷。
  function starOf(ring, cx, cy) {
    const n = ring.length / 2;
    if (n < 40) return null;
    const r = new Float64Array(n);
    for (let i = 0; i < n; i++) r[i] = Math.hypot(ring[2 * i] - cx, ring[2 * i + 1] - cy);
    const sm = new Float64Array(n);
    for (let i = 0; i < n; i++) sm[i] = (r[i] + r[(i - 1 + n) % n] + r[(i + 1) % n]) / 3;
    const sep = Math.max(3, Math.round(n * STAR_SEP_FRAC));
    // 先按半径从大到小挑峰，再按索引去重 —— 抖动会把一个尖顶拆成两个相邻峰
    const cand = [];
    for (let i = 0; i < n; i++) {
      const a = sm[(i - 1 + n) % n], b = sm[(i + 1) % n];
      if (sm[i] > a && sm[i] >= b) cand.push(i);
    }
    if (cand.length < 5) return null;
    cand.sort((a, b) => sm[b] - sm[a]);
    const pk = [];
    for (let k = 0; k < cand.length && pk.length < 6; k++) {
      let ok = true;
      for (let j = 0; j < pk.length; j++) { let d = Math.abs(pk[j] - cand[k]); d = Math.min(d, n - d); if (d < sep) { ok = false; break; } }
      if (ok) pk.push(cand[k]);
    }
    if (pk.length !== 5) return null;
    pk.sort((a, b) => a - b);
    // 每两个外峰之间的最低点是内角：五角星内/外比 0.382，手画到 0.55 也认；圆/多边形都 >0.8
    const pts = [];
    for (let k = 0; k < 5; k++) {
      const i0 = pk[k], i1 = pk[(k + 1) % 5];
      let m = Infinity, mi = i0;
      for (let i = i0; ; i = (i + 1) % n) {
        if (sm[i] < m) { m = sm[i]; mi = i; }
        if (i === i1) break;
      }
      if (m > sm[i0] * STAR_PEAK_RATIO || m > sm[i1] * STAR_PEAK_RATIO) return null;
      pts.push(ring[2 * i0], ring[2 * i0 + 1], ring[2 * mi], ring[2 * mi + 1]);
    }
    return pts;
  }

  // 智能笔：把手绘识别为直线/圆/椭圆/三角形/矩形/多边形
  function recognize(st) {
    const p = st.pts, n = p.length / 2;
    if (n < 6) return null;
    const b = GW.bbox(st), diag = Math.hypot(b.w, b.h);
    const snapMode = (GW.settings && GW.settings.smartSnap) || 'auto';
    if (snapMode === 'off') return null;
    if (diag * GW.camera.s < SNAP_MIN_DIAG_PX) return null;   // 1.5.0：24 → 44 屏幕 px
    let len = 0;
    for (let i = 2; i < p.length; i += 2) len += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    const x0 = p[0], y0 = p[1], x1 = p[p.length - 2], y1 = p[p.length - 1];
    const chord = Math.hypot(x1 - x0, y1 - y0);
    const base = { id: GW.uid(), kind: 'shape', color: st.color, width: st.width };
    // 线型跟着笔走：虚线 / 点线笔画被识别成图形后必须带走线型，否则一认出来就变回实线。
    // 旧对象只有布尔 it.dash（表示「虚线」），这里两种都写，画图/导出/属性面板都能认。
    if (st.dashStyle && st.dashStyle !== 'solid') { base.dashStyle = st.dashStyle; base.dash = true; }
    // 开口/闭合提前分好（口径与下面 1.4.5 那条注释完全相同）：箭头/坐标系只可能是开口笔画。
    const closed = len > diag * 1.05 && chord <= len * 0.30;
    // ---------- ⓪ 开口笔画：箭头 / 双箭头 / 坐标系 ----------
    // 必须排在直线分支之前：带 10% 回勾的箭头弦长比只有 ~0.9，会被 0.93 的直线门先吃掉；
    // 竖着的箭头还会撞上「竖线没停顿就 return null」那条老规矩（penPaused 只认收笔停顿）。
    if (!closed) {
      const hitArrow = arrowOf(p, len, base);
      if (hitArrow) return hitArrow;
      const hitAxes = axesOf(p, len, base);
      if (hitAxes) return hitAxes;
    }
    // 直线
    if (chord > len * 0.93) {
      let md = 0; for (let i = 0; i < p.length; i += 2) md = Math.max(md, distSeg(p[i], p[i + 1], x0, y0, x1, y1));
      if (md < chord * 0.07) {
        // 1.3.0（R3）：竖线必须「写慢一点、收笔前停顿一下」才规整成直线。
        // 老师写「1」「|」时一笔竖划立刻变直线，等于把字吃了；横线/斜线仍即时识别。
        const vertical = Math.abs(x1 - x0) <= Math.abs(y1 - y0) * 0.4;
        if (vertical && !penPaused(p)) return null;
        let ex = x1, ey = y1;
        const ang = Math.atan2(y1 - y0, x1 - x0), snap = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
        if (Math.abs(ang - snap) < 0.06) { ex = x0 + Math.cos(snap) * chord; ey = y0 + Math.sin(snap) * chord; }
        return Object.assign(base, { type: 'poly', pts: [x0, y0, ex, ey] });
      }
    }
    // 1.4.5（R2 修复）：闭合判定改成「缺口相对笔迹总长」，而不是相对包围盒对角线。
    // 老口径 max(len*0.18, diag*0.22) 对圆太苛刻：画一个缺口 25% 的圆，首尾弦长 ≈1.41r，
    // 而门只有 0.18·len ≈1.03r，连圆的分支都进不去（实测 circle_gap25：chord 211.7 / len 746 / 门 134.3）。
    // 新口径容到约 1/3 圈的缺口；60% 的圆弧仍然走「开口曲线」识别。
    // 弦/弧长比 = 2·sin(θ/2)/θ：240° 弧 0.41、270° 弧 0.30、300° 弧 0.19。
    // 门取 0.30 —— 240°/270° 这种「画了大半圈」的线必须是**开口曲线**（probe-smart-curve 的硬红线），
    // 只有补的缺口 <60° 才算闭合圆。
    // 1.1.13：开口的笔画先试曲线识别（圆弧/抛物线/正弦/平滑），认不出来才原样保留
    if (!closed) return recognizeCurve(st, b, diag, len, base);
    // 1.7.6（R1）：闭合图形补一道**绝对面积**门。原来只有 SNAP_MIN_DIAG_PX（包围盒对角线 72px），
    // 细长的「0」「o」和挨得很近的连笔字靠对角线就能过门；areaR 是「笔迹面积÷拟合面积」的
    // 相对比（0.74~1.15），小图形照样合格，根本挡不住。一处拦在所有分支之前，
    // 圆/椭圆/矩形/圆角矩形/三角/正多边形/星形全覆盖。hold 模式跳过，drawHold 候选条不受影响。
    // 2.2.3（R7）：停笔驻留过的笔画放行这道门（小图形也能规整），没停笔的一律照旧。
    if (GUARD_ON() && !smallHoldOk(st)) {
      const sc = camScale();
      if (b.w * b.h * sc * sc < SHAPE_MIN_AREA_PX2 || Math.min(b.w, b.h) * sc < SHAPE_MIN_SIDE_PX) return null;
    }
    // 写字保护先于一切：几笔挤在同一块地方、短时间内连着落下 ⇒ 这是字，不是图形
    if (looksLikeText(st, b)) {
      if (!GW.__smartTextToast) { GW.__smartTextToast = 1; GW.toast('这一段按手写笔迹保留了（像是写字）', 1800); }
      return null;
    }
    if (snapMode === 'hold' && !penPaused(p)) return null;

    // ---------- 0) 清形：等距重采样 + 轻度平滑 + 掐掉收笔回头 + 沿弦补缺口 ----------
    // 之后所有判定都基于 `ring`（闭合、均匀），拟合圆/椭圆用 `core`（不含补的弦）
    const cl = cleanRing(p, diag);
    if (!cl) return null;
    const core = cl.core, ring = cl.ring;
    if (ring.length / 2 < 10) return null;
    // `geo`：给「转角/角点」用的更粗更平滑的一份。抖动 ±3px 的笔迹在 cl.step（约 6px）上
    // 会把转角抬到 0.7 rad，圆被当成多边形；隔到 ~2% 对角线再平滑 3 次，抖动被压到 0.5px 以下，
    // 而正多边形的 51° 角在同样的窗口里仍是 0.8 rad 以上 —— 这是「圆不是多边形」唯一稳的判据。
    const geo = resample(smoothArr(core.slice(), 3), Math.max(cl.step, diag * 0.018));
    const gStep = Math.max(cl.step, diag * 0.018);

    // ---------- ① 圆 / 椭圆：最小二乘拟合 ----------
    // 老实现拿「轴对齐包围盒」当椭圆：笔迹稍微歪一点、起笔外飘一点，包围盒就被撑大，
    // 径向偏差必然超标。改成对点集本身做最小二乘拟合，对缺口和轻微抖动都不敏感。
    const cf = fitCircle(core);
    const ec0 = cf ? fitEllipseAxis(core, cf.cx, cf.cy) : null;
    // 转角必须在「归一化到单位圆」之后算：3:1 的椭圆两端曲率半径只有 ry²/rx
    // （280×90 → 29px），按弧长等距采样时那两端天然超过 0.45 rad（实测 0.61），
    // 真椭圆会被当成多边形否掉。归一化后真椭圆是标准圆、转角≈噪声，正多边形仍是尖角。
    let mt = maxTurnOf(geo, gStep);
    // 正多边形的挡板再加一条「角点个数」：七边形归一化后转角只有 0.47（离 0.45 太近，
    // 抖动时会掉到 0.44 被吃成椭圆），而它的角点数稳定是 7；圆/椭圆实测只有 2 个。
    const vertEarly = cornersOf(ring, diag, cl.step);
    if (ec0 && ec0.rx > 1 && ec0.ry > 1) {
      const nc = [];
      for (let i = 0; i < core.length; i += 2) nc.push((core[i] - ec0.cx) / ec0.rx, (core[i + 1] - ec0.cy) / ec0.ry);
      const ns = Math.max(0.02, Math.min(0.09, gStep / (0.5 * (ec0.rx + ec0.ry))));
      mt = maxTurnOf(resample(smoothArr(nc, 3), ns), ns);
    }
    // ---------- ①-b 椭圆（含斜着画的）：先试旋转椭圆，再退回轴对齐 ----------
    // 必须排在圆分支之前：1.4:1 的椭圆按圆拟合时 90% 偏差分位只有 ~0.13，会被圆的 0.198 门
    // 先吃成 circle（1.4:1 正是「扁一点」最常见的手画比例）。真圆的轴比 ≈1，进不来。
    {
      const er = fitEllipseRot(core);
      if (er && er.rx > 2 && er.ry > 2) {
        const major = Math.max(er.rx, er.ry), minor = Math.min(er.rx, er.ry);
        const ratio = major / minor;
        const devLim = Math.min(residMax() * ELLIPSE_DEV_MUL, ELLIPSE_DEV_CAP);
        const areaE = polyArea(ring) / Math.max(Math.PI * er.rx * er.ry, 1e-6);
        // 圆的拟合偏差：椭圆必须**明显**比圆贴得紧，否则「画圆」会被抢成椭圆
        const cirDev = (cf && cf.r > 1) ? ellDevQ(core, cf.cx, cf.cy, cf.r, cf.r, 0.9) : 9;
        const elDev = er.dev;
        // 轴比门槛 1.10~1.15：1.28 太苛刻 —— 老师「扁一点」的椭圆多半只有 1.15~1.25 就被圆吃掉了；
        // 但太圆的笔迹也不能收，所以轴比越接近 1，就要求椭圆比圆的贴合度强得越多。
        const ratioOk = ratio >= 1.15 || (ratio >= 1.10 && elDev * 1.6 < cirDev);
        const fitsBetter = elDev * 1.25 < cirDev;
        // 面积比 0.72~1.20：矩形是外接椭圆的 1.27 倍（4/π），卡到 1.20 就把矩形挡在外面
        if (ratioOk && fitsBetter && elDev <= devLim * 1.2 && areaE >= 0.72 && areaE <= 1.20) {
          const pts = [];
          const c = Math.cos(er.rot), s = Math.sin(er.rot);
          for (let k = 0; k < 96; k++) {
            const a = (k / 96) * Math.PI * 2;
            const u = er.rx * Math.cos(a), v = er.ry * Math.sin(a);
            pts.push(er.cx + u * c - v * s, er.cy + u * s + v * c);
          }
          return Object.assign(base, { type: 'poly', pts, closed: true, smooth: true, snap: 'ellipse' });
        }
      }
    }
    if (ec0 && ec0.rx > 2 && ec0.ry > 2) {
      const major = Math.max(ec0.rx, ec0.ry), minor = Math.min(ec0.rx, ec0.ry);
      const devLim = Math.min(residMax() * ELLIPSE_DEV_MUL, ELLIPSE_DEV_CAP);
      if (major / minor >= ELLIPSE_AXIS_MIN &&
          ellDevQ(core, ec0.cx, ec0.cy, ec0.rx, ec0.ry, 0.9) <= devLim) {
        // 面积比是椭圆与「矩形/圆角矩形」的分水岭：内接椭圆只有矩形面积的 π/4≈0.785，
        // 反过来矩形是外接椭圆的 1.27 倍；卡在 0.8~1.2 就只剩真椭圆。
        const areaE = polyArea(ring) / Math.max(Math.PI * ec0.rx * ec0.ry, 1e-6);
        if (areaE >= ELLIPSE_AREA_MIN && areaE <= ELLIPSE_AREA_MAX) {
          const pts = [];
          for (let k = 0; k < 96; k++) { const a = (k / 96) * Math.PI * 2; pts.push(ec0.cx + ec0.rx * Math.cos(a), ec0.cy + ec0.ry * Math.sin(a)); }
          return Object.assign(base, { type: 'poly', pts, closed: true, smooth: true, snap: 'ellipse' });
        }
      }
    }
    if (cf && cf.r > diag * 0.1) {
      const areaR = polyArea(ring) / Math.max(Math.PI * cf.r * cf.r, 1e-6);
      const hardN = hardCorners(core, diag, cl.step, 0.45);
      const lobes = lobeCount(core, cf.cx, cf.cy, Math.max(cf.r, 1), Math.max(cf.r, 1));
      // 正多边形挡板**只能靠转角**（外接圆拟合会把面积比拉回 ≈1，实测正七边形 0.998）
      // 1.6.2：径向均匀度（rdev）。手画圆的半径起伏通常 <6%，而正多边形在顶点/边中点之间
      // 有 5%~13% 的起伏、矩形更是 >20%。老代码只靠「转角 / 硬角点个数」判多边形，
      // 粗糙手圆会被角点检测凑出 3 个假角 ⇒ 圆被否掉、落进矩形分支（用户说的「圆变矩形」）。
      const rdev = radialDev(core, cf.cx, cf.cy, cf.r);
      // 正多边形的「角」是硬角：正七边形归一化后硬角点 7 个，而手画圆最多被噪声凑出 2~3 个。
      // 所以角点个数 ≥6 时无条件按多边形处理（圆不能靠 rdev 小把多边形吃掉），
      // 这是 probe-smart-shape「正七边形不许变圆」的硬红线。
      const regN = regularN(vertEarly, cf.cx, cf.cy);
      const polyLike = (mt > 0.45 && rdev > 0.06) || (hardN >= 4 && rdev > 0.05) || regN >= 5 ||
        lobes >= 5 || areaR < 0.74 || areaR > 1.26;
      // 1.3.2：椭圆识别按用户要求删除（圆/椭圆互相抢，画圆更常用；要扁的让人自己拉）。
      // 偏差改用 90% 分位，不再用最大值：8 个点的粗糙圆（r=30）单个坏点就能把最大值抬到 0.3+，
      // 旧判据整条否掉之后会被下面的 fitRect 收成矩形（实测 8 次里 1 次变 rect）。
      const devQ = ellDevQ(core, cf.cx, cf.cy, cf.r, cf.r, 0.9);
      // 灵敏度真正接进圆判据：settings.snapResid 0.03~0.2 → 圆偏差门 0.10~0.30（滑杆才调得动）
      // 1.6.2：下界 0.10 → 0.04。原来残差 0.03 的手画圆也走 0.10 的门，滑杆低端等于没接上；
      // 现在 30~200 全段都真正改变圆的容差（0.066~0.34），「调了有感」。
      const cirTol = Math.max(0.04, Math.min(0.34, residMax() * 2.2));
      // 采样点太少时「圆」与正多边形在几何上不可区分：8 个点的圆和正八边形是同一条点列。
      // 小圆在平板上很常见（画个点、画个圈），所以粗点列一律按圆收 —— 代价是 8 个点画出来的
      // 正七/八边形也会变成圆（真实手画多边形点数远多于此，实测 20 点以上）。
      // 「点太少」只在**小图形**上成立：8 个点的圆和正八边形在几何上确实分不开，
      // 但正七边形/矩形这类大图形即使采样点被抽稀到 12 个，顶点也是硬角、必须按多边形收。
      // 第一版只看 n<14，probe-smart-shape 的正七边形（190px，15 点）差点被当成小圆。
      const coarse = n < 14 && cf.r < 45;
      const areaOk = areaR >= 0.74 && areaR <= 1.15;
      // rdev 很小的笔迹即使角点/转角被抖动骗过，也按圆收（这是「圆不变成矩形」的最后一道闸）
      if (areaOk && devQ <= (coarse ? Math.min(cirTol, 0.12) : cirTol) &&
          (!polyLike || coarse || (rdev <= 0.045 && regN < 5 && hardN < 4))) {
        // 与基础形状 makeShape('circle') 一致：96 点、从 0° 起逆时针，smooth:true
        const pts = [];
        for (let k = 0; k < 96; k++) { const a = (k / 96) * Math.PI * 2; pts.push(cf.cx + cf.r * Math.cos(a), cf.cy + cf.r * Math.sin(a)); }
        return Object.assign(base, { type: 'poly', pts, closed: true, smooth: true, snap: 'circle' });
      }
    }

    // ---------- ② 多边形顶点：用转角找角点 ----------
    // 老实现靠 rdp（容差 diag*0.085，400px 的矩形就是 34px）抽顶点：圆角、轻微外凸的边
    // 会被抽成位置很歪的点，后面「四点两两平行、成直角」自然过不去。转角找角点只关心
    // 「哪里拐了弯」，不受边长噪声影响。
    // ---------- ②-a 矩形：先试旋转外接矩形（比角点组合稳） ----------
    // 只在残差很小时才认（0.65×通用门）：梯形/平行四边形的外接矩形残差明显更大，不能误收。
    const rf = fitRect(ring, diag);
    // 光看残差不够：菱形的最小外接矩形的残差只有 24px（门 27px），它会冒充正方形。
    // 加一条「填充度」——矩形占自己外接框的面积 ≈100%，菱形只有 50%，圆角矩形 ≥0.95。
    const rfCov = rf ? polyArea(ring) / Math.max(rf.w * rf.h, 1e-6) : 0;
    // 圆必须先排除：粗糙小圆（8 个点、r=30）的角点检测会凑出 4 个「角」，填充度也刚好过 0.88，
    // 于是被收成矩形（用户看到的「圆有时变矩形」）。凡是「拟合圆的分位偏差明显小」的一律不上矩形这条路。
    const cdev = cf && cf.r > diag * 0.1 ? ellDevQ(core, cf.cx, cf.cy, cf.r, cf.r, 0.9) : 9;
    // 1.6.2：再加一条「径向均匀度」——圆被椭到半径起伏 8% 时 cdev 可能超门，但 rdev 仍然很小，
    // 这种笔迹绝不能被 fitRect 收走。rdev 小 + 填充面积接近 π r² ⇒ 是圆，不是矩形。
    const rdev2 = (cf && cf.r > diag * 0.1) ? radialDev(core, cf.cx, cf.cy, cf.r) : 9;
    const ringArea = polyArea(ring), cirArea = cf ? Math.PI * cf.r * cf.r : 1;
    const circleish = (cdev <= Math.max(0.22, residMax() * 2.4) && (!cf || ringArea / Math.max(cirArea, 1e-6) > 0.7)) ||
      (rdev2 <= 0.085 && Math.abs(ringArea / Math.max(cirArea, 1e-6) - 1) < 0.24);
    // ---------- ②-a' 圆角矩形：四角被抹圆，残差比直角矩形宽、但填充度和「一眼是矩形」都还在 ----------
    // 必须排在矩形分支之前：r=45 的圆角矩形残差实测 13px，早被矩形的 0.65 门（19px）收成 rect 了。
    // 直角矩形四角转角是 1.57 rad，这一条把「真矩形/正方形」稳稳挡在外面（反向对照靠它）。
    if (rf && !circleish && rf.r <= residMax() * diag * ROUNDRECT_RESID && rfCov >= ROUNDRECT_FILL) {
      let round = 0;
      for (let i = 0; i < 8; i += 2) if (cornerTurn(ring, cl.step, rf.pts[i], rf.pts[i + 1]) < ROUNDRECT_TURN) round++;
      if (round === 4) return Object.assign(base, { type: 'poly', closed: true, smooth: true, pts: rf.pts.slice(), snap: 'roundrect' });
    }
    if (rf && !circleish && rf.r <= residMax() * diag * 0.65 && rfCov >= 0.88) {
      const basePts = rf.pts.slice();
      // 轴对齐规范化：四个角按从左上起顺时针（与 makeShape 的 rect 顶点顺序一致，探针要比顶点）
      const cs = [];
      for (let i = 0; i < 8; i += 2) cs.push([basePts[i], basePts[i + 1]]);
      cs.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
      const sq = Math.abs(rf.w - rf.h) <= 0.12 * Math.max(rf.w, rf.h);
      return Object.assign(base, { type: 'poly', pts: basePts, closed: true, snap: sq ? 'square' : 'rect' });
    }

    // ---------- ②-d 正五/六/八边形与五角星 ----------
    // 都放在「nv > 9 丢弃」和「rdev ≤0.10 直接回 null」之前：正多边形的 rdev 本来就小。
    if (cf && cf.r > diag * 0.1) {
      // 稠密笔迹上 cornersOf 会漏角（实测正六边形只给 4 个角）：先用更细的 rdp 再扫一遍顶点，
      // 还数不出来就退回硬角点个数 —— 正多边形的硬角点是稳的（六边形 6、五边形 5、七边形 7）。
      let nv2 = vertEarly;
      if (nv2.length / 2 < NGON_MIN_SIDE) {
        const simp = rdp(ring.concat([ring[0], ring[1]]), diag * 0.04);
        nv2 = mergeVerts(simp.slice(0, -2), diag);
      }
      const nv2n = nv2.length / 2;
      let nSide = (nv2n >= NGON_MIN_SIDE && nv2n <= NGON_MAX_SIDE) ? regularN(nv2, cf.cx, cf.cy) : 0;
      if (NGON_SIDES.indexOf(nSide) < 0) {
        const hcN = hardCorners(core, diag, cl.step, 0.45);
        if (NGON_SIDES.indexOf(hcN) >= 0 && Math.abs(nv2n - hcN) <= 1) nSide = hcN;
      }
      if (NGON_SIDES.indexOf(nSide) >= 0 && radialDev(core, cf.cx, cf.cy, cf.r) <= NGON_RDEV) {
        return Object.assign(base, { type: 'poly', closed: true, pts: nv2.slice(), snap: 'ngon', n: nSide });
      }
      const star = starOf(ring, cf.cx, cf.cy);
      if (star) return Object.assign(base, { type: 'poly', closed: true, pts: star, snap: 'star' });
    }

    let verts = vertEarly;
    if (verts.length / 2 >= 4 && selfCross(verts)) return null;   // 交叉笔画（8 / 日）不可能是标准图形
    if (verts.length / 2 < 3) {
      // 角点没找到（画得特别圆滑）→ 退回 rdp 老路兜底
      const simp = rdp(ring.concat([ring[0], ring[1]]), diag * 0.085);
      verts = mergeVerts(simp.slice(0, -2), diag);
    }
    const nv = verts.length / 2;
    if (nv > 9) return null;                                  // 点太多，不可能是标准图形
    // ---------- ③ 标准图形：三角形只认等边，四边形只认矩形/正方形（任意旋转） ----------
    // 从角点里挑 4 个做矩形拟合、挑 3 个做三角形拟合（组合数 ≤ C(9,4)=126），取残差最小的
    let bestCd = null, bestWorst = Infinity;
    // 径向很均匀（≈ 圆）的笔迹不走多边形模板：粗糙手圆被噪声凑出 4 个角点时，
    // 平行四边形/梯形的残差也能过门，会被误收成 trap（1.6.2 第一版就踩到）。
    // 正多边形的 rdev 只有 4%~6%，但它们的硬角点 ≥6，已经在上面的圆分支被挡掉了。
    if (cf && cf.r > diag * 0.1 && radialDev(core, cf.cx, cf.cy, cf.r) <= 0.10) return null;
    const combos = (n, k) => {
      const out = [], idx = [];
      const rec = (startI, left) => {
        if (!left) { out.push(idx.slice()); return; }
        for (let i = startI; i <= n - left; i++) { idx.push(i); rec(i + 1, left - 1); idx.pop(); }
      };
      rec(0, k);
      return out;
    };
    for (const T of [4, 3]) {
      if (nv < T) continue;
      const sets = combos(nv, T);
      for (let s2i = 0; s2i < sets.length; s2i++) {
        const idx = sets[s2i], sub = [];
        for (let i = 0; i < idx.length; i++) sub.push(verts[2 * idx[i]], verts[2 * idx[i] + 1]);
        // 四边形：矩形/正方形、平行四边形、梯形三个候选一起比残差；
        // 三角形：等边、直角两个候选一起比残差。
        let cands = T === 4 ? snapQuad(sub) : snapTri(sub);
        if (T === 4) {
          const extra = [].concat(snapPara(sub) || [], snapTrap(sub) || []);
          cands = (cands || []).concat(extra);
        } else {
          const extra = snapRtri(sub);
          cands = (cands || []).concat(extra || []);
        }
        if (!cands || !cands.length) continue;
        for (let i = 0; i < cands.length; i++) {
          const cd = cands[i], worst = residQ(ring, cd.pts, diag, 0.92);
          if (worst <= residMax() * diag && worst < bestWorst) { bestWorst = worst; bestCd = cd; }
        }
      }
    }
    if (bestCd) return Object.assign(base, { type: 'poly', pts: bestCd.pts, closed: true, snap: bestCd.snap });
    // ④ 都不像 → 原样保留为手写笔迹（1.3.0 R3：不再兜底成假多边形）
    return null;
  }

  // ---------- 图形生成 ----------
  GW.SHAPES = [
    ['line', '直线'], ['arrow', '箭头'], ['darrow', '双箭头'], ['dash', '虚线'],
    ['rect', '矩形'], ['circle', '圆'], ['ellipse', '椭圆'], ['triangle', '三角形'],
    ['rtri', '直角三角形'], ['para', '平行四边形'], ['trap', '梯形'], ['hexagon', '正多边形'],
    ['axes', '坐标系'], ['numline', '数轴'], ['axes3d', '空间坐标系'], ['curve', '曲线拟合'],
    // 1.6.6（T01）胶带：拖出一条带子盖住下面的笔迹（墨迹按数组顺序画，后加的在上）。
    // 必须留在墨迹层 —— 墨迹层整层画在对象层（DOM 卡片）之上，做成对象就盖不住笔迹了。
    ['tape', '胶带'],
    // 1.7.4（R9）：折线连接线（照 GoodNotes 的 ELBOW 连接线）。拐角倒圆 6 世界单位，
    // 末端带箭头；pts 就是折线点集，绘制复用 poly 分支 + 一次 arrowHead。
    ['elbow', '折线连接'],
  ];
  // 1.4.0（R1）：左右镜像 —— 从右往左拖，图形要跟着翻转。
  // 老代码在 makeShape 第一行就把 x0/x1 折成 min/max，方向信息当场丢了，于是 triangle / para /
  // trap / axes / numline / axes3d 往哪个方向拖都长一样。这里按「拖拽框的中线」把**最终几何**
  // 整体翻一次，117 个学科模板一行都不用改。
  // 1.3.3（R1）：镜像翻转。axis='x' 绕竖中线（从右往左拖）／axis='y' 绕横中线（从下往上拖）。
  function flipItem(it, c, axis) {
    if (!it || it.dirHandled) return it;
    // 同一个折线数组可能被 segs 与 parts[].s **同时引用**（stencils.js:67-69 的 MK：o.segs = flat.slice()
    // 只复制了外层数组，元素还是同一批折线）⇒ 必须按数组去重，否则同一段被翻两次 = 原地不动，
    // 表现出来就是「某几段没镜像」（实测 alcohol 差了 56.88px）。
    const ax = axis === 'y' ? 'y' : 'x';
    const seen = [];
    const fx = (arr) => {
      if (!arr || seen.indexOf(arr) >= 0) return;
      seen.push(arr);
      // 点集是 [x,y,x,y…] 交错存放，按轴决定动奇数位还是偶数位
      for (let i = ax === 'x' ? 0 : 1; i < arr.length; i += 2) arr[i] = 2 * c - arr[i];
    };
    fx(it.pts);
    if (it.segs) for (let s = 0; s < it.segs.length; s++) fx(it.segs[s]);
    // 学科模板的分段上色把折线另存了一份在 parts[].s（stencils.js:66-69），而 drawItem 走的是
    // parts + _paths 缓存（board.js:592-605）⇒ 两份都要翻（去重后只翻一次），缓存必须清（GW.invalidate）。
    if (it.parts) for (let i = 0; i < it.parts.length; i++) { const p = it.parts[i]; if (p && p.s) for (let s = 0; s < p.s.length; s++) fx(p.s[s]); }
    // 文字只挪位置、不翻转字形（翻过来的字就是镜像字/倒字了）；轴名是「跟着箭头走」的，
    // labels[0] 画在 pts[2..3] 那根轴的末端（board.js:178-179），pts 翻完它会自己跟过去，不用交换。
    if (it.texts) for (let i = 0; i < it.texts.length; i++) {
      const t = it.texts[i];
      if (t && t[ax] != null) t[ax] = 2 * c - t[ax];
    }
    if (GW.invalidate) GW.invalidate(it); else { delete it._bb; delete it._path; delete it._paths; }
    return it;
  }
  function mirrorItem(it, cx) { return flipItem(it, cx, 'x'); }
  function mirrorItemY(it, cy) { return flipItem(it, cy, 'y'); }
  GW.mirrorItem = mirrorItem;
  GW.mirrorItemY = mirrorItemY;
  function makeShape(type, x0, y0, x1, y1) {
    const out = buildShape(type, x0, y0, x1, y1);
    if (!out) return out;
    const needX = x1 < x0, needY = y1 < y0;
    if (!needX && !needY) return out;
    // 自带方向语义的图形不参与通用镜像：rtri/hexagon 本来就用原始 x0..x1 定朝向；
    // circle 是「圆心=起点、半径=拖到终点」，翻中线会把圆心挪到另一端（那是个假变化）；
    // arrow/darrow/line/dash 的「朝向」就是拖拽方向本身（箭头必须指向松手那一端，翻过来会指反）。
    // 1.3.3（R1）：pb（物理图形库）与 ms（数学可调参图形）没有 pts 可翻，改成打 flipX/flipY 标记，
    // 由 board.js 的 flipDraw 在绘制时把整块翻过去（文字不翻）。DIRS 里那 6 个本来就用 dir 表达
    // 方向的图形除外 —— 它们翻一次是「换参数」，再翻一次就翻回去了。
    if (type === 'pb' || type === 'ms') {
      const dirl = GW.physShapes && GW.physShapes.DIRS;
      const list = Array.isArray(out) ? out : [out];
      for (const o of list) {
        if (!o) continue;
        if (o.type === 'pb' && dirl && dirl[o.key]) continue;
        if (needX) o.flipX = true;
        if (needY) o.flipY = true;
      }
      return out;
    }
    // 方向语义已经写在几何里的图形不参与翻转：拖到哪儿箭头就指哪儿（arrow/darrow/line/dash）、
    // rtri 的直角就在起笔那一角、hexagon 的初始角跟着拖拽方向、circle 的圆心就是起笔点。
    const skip = (type === 'rtri' || type === 'hexagon' || type === 'circle' ||
      type === 'arrow' || type === 'darrow' || type === 'line' || type === 'dash' ||
      // 1.7.4（R9）：折线连接线的拐弯方向与倒角已经按拖拽方向算进几何（sx/sy），
      // 再走通用镜像会翻两次 ⇒ 拖左上角出来的连接线会朝反方向拐。
      type === 'elbow');
    if (skip) return out;
    const cx = (x0 + x1) / 2;
    const list = Array.isArray(out) ? out : [out];
    for (let i = 0; i < list.length; i++) {
      // 横翻：改几何（已经验过 45 个模板与全部基础图形）
      if (needX) flipItem(list[i], cx, 'x');
      // 竖翻：不改几何，改「画的时候整体上下镜一次」（board.js 的 drawItem 认 flipY）。
      // 这样刻度、箭头、标签、模板里的每一段折线都自动跟着翻，以后再加图形也不用改这里 ——
      // 只要走 drawItem 就天然支持。几何不动的另一个好处：包围盒/命中/框选与翻之前完全一致。
      // 数轴的位置本来就跟着「起笔那一条边」（buildShape 里 oy = y0），不翻就已经是镜像了；
      // 再翻一次会翻回原处，等于没翻（实测逐像素与下拖完全一致）。
      if (needY && type !== 'numline') { list[i].flipY = true; list[i].flipYc = (y0 + y1) / 2; }
    }
    return out;
  }
  GW.__makeShape = makeShape;   // 探针入口（scripts/probe-mirror.js）
  const MF_TYPES = { rect: 1, circle: 1, ellipse: 1, triangle: 1, rtri: 1, para: 1, trap: 1, hexagon: 1 };
  GW.MF_TYPES = MF_TYPES;   // 探针入口（scripts/probe-magfield.js）
  // 1.6.8（R5）：横线纸的行距与 board.js 的底纹一致（48）。
  const HL_ROW = 48, HL_SNAP = 6;
  function snapHlToLines(stroke) {
    const p = GW.page && GW.page();
    if (!p || !p.bg || p.bg.pattern !== 'lines') return false;
    const pts = stroke.pts;
    if (!pts || pts.length < 4) return false;
    let moved = 0;
    for (let i = 1; i < pts.length; i += 2) {
      const row = Math.round(pts[i] / HL_ROW) * HL_ROW;
      if (Math.abs(pts[i] - row) <= HL_SNAP) { pts[i] = row; moved++; }
    }
    if (!moved) return false;
    stroke._bb = null;
    if (GW.invalidate) GW.invalidate(stroke);
    return true;
  }
  GW.snapHlToLines = snapHlToLines;   // 探针入口（scripts/probe-hl-snap.js）

  function buildShape(type, x0, y0, x1, y1) {
    const base = { id: GW.uid(), kind: 'shape', color: tool.pen.color, width: Math.max(2, tool.pen.width), dash: tool.shape.dash || type === 'dash' };
    // 1.6.8（R1）：填充色可以跟描边色不同。没选填充色时仍然跟随画笔（旧行为不变）。
    // WP4：fillMode 显式给 'solid' / 'pattern' 时写入新字段；'none' 显式不填充；
    // 其余情况（含默认 ''）逐字沿用旧的 fill 布尔开关，保证老行为一个字节都不变。
    const fm = tool.shape.fillMode;
    if (fm === 'pattern' || fm === 'solid') {
      const fc = tool.shape.fillColor || tool.pen.color;
      const fa = tool.shape.fillAlpha != null ? tool.shape.fillAlpha : 0.18;
      base.fill = hexA(fc, fa);        // 降级纯色：旧读取路径 / 无 DOM 环境 / 序列化都照常可用
      base.fillColor = fc;
      base.fillAlpha = fa;
      base.fillMode = fm;
      if (fm === 'pattern') {
        base.fillPattern = tool.shape.fillPattern || 'hatch';
        base.fillDensity = tool.shape.fillDensity != null ? tool.shape.fillDensity : 8;
        base.fillLineWidth = tool.shape.fillLineWidth != null ? tool.shape.fillLineWidth : 1;
      }
    } else if (fm === 'none') {
      // 显式关闭填充：不写任何填充字段（线性图形在下面各 case 本就强制 fill:null）
    } else if (tool.shape.fill) {
      const fc = tool.shape.fillColor || tool.pen.color;
      base.fill = hexA(fc, tool.shape.fillAlpha != null ? tool.shape.fillAlpha : 0.18);
      base.fillColor = tool.shape.fillColor || null;
      base.fillAlpha = tool.shape.fillAlpha != null ? tool.shape.fillAlpha : 0.18;
    }
    // 磁场填充只给「有面积」的图形；直线/箭头/坐标轴即使开着开关也不带（画出来是无意义的散点）
    if (tool.shape.mf && MF_TYPES[type]) base.mf = tool.shape.mf;
    const l = Math.min(x0, x1), t = Math.min(y0, y1), w = Math.abs(x1 - x0), hgt = Math.abs(y1 - y0);
    // 直线类：吸附 15° 整数倍
    const snapEnd = () => {
      const L = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0), s = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      return Math.abs(a - s) < 0.05 ? [x0 + Math.cos(s) * L, y0 + Math.sin(s) * L] : [x1, y1];
    };
    switch (type) {
      case 'line': case 'dash': { const [a, b] = snapEnd(); return Object.assign(base, { type: 'poly', pts: [x0, y0, a, b], fill: null }); }
      case 'arrow': case 'darrow': { const [a, b] = snapEnd(); return Object.assign(base, { type: 'arrow', pts: [x0, y0, a, b], double: type === 'darrow', fill: null }); }
      // 1.7.4（R9）：折线连接线。横向跨度大就走「先横后竖」，否则「先竖后横」；
      // 拐角用直线倒角（每处两个点），半径 s = 6，太小或太扁时按跨度收窄，避免折返。
      case 'elbow': {
        const dx = x1 - x0, dy = y1 - y0;
        const sx = dx >= 0 ? 1 : -1, sy = dy >= 0 ? 1 : -1;
        const s = Math.max(0.001, Math.min(6, Math.abs(dx) / 2, Math.abs(dy) / 2));
        const pts = [];
        if (Math.abs(dx) >= Math.abs(dy)) {
          const mx = x0 + dx / 2;
          pts.push(x0, y0, mx - s * sx, y0, mx, y0 + s * sy, mx, y1 - s * sy, mx + s * sx, y1, x1, y1);
        } else {
          const my = y0 + dy / 2;
          pts.push(x0, y0, x0, my - s * sy, x0 + s * sx, my, x1 - s * sx, my, x1, my + s * sy, x1, y1);
        }
        return Object.assign(base, { type: 'poly', pts, elbow: true, fill: null, dirHandled: true });
      }
      case 'rect': return Object.assign(base, { type: 'poly', pts: [l, t, l + w, t, l + w, t + hgt, l, t + hgt], closed: true });
      // 1.6.6（T01）胶带：半透明纸带，盖住下面已经写好的内容（讲完一题先「贴住」，回头再揭）。
      // 形态：两端切成锯齿撕口，一眼能看出是贴上去的一条带子，而不是半透明矩形块。
      // 只拖一条横线（高度≈0）时给 26 单位默认宽 —— 老师不会为了贴胶带先量高度。
      case 'tape': {
        const th = Math.max(12, hgt || 26);
        const T = Math.max(4, Math.min(9, w * 0.06));          // 撕口齿高
        const teeth = Math.max(3, Math.round(th / 7));
        const pts = [l, t, l + w, t];
        // 右端：上→下锯齿
        for (let k = 0; k < teeth; k++) pts.push(l + w - (k % 2 ? T : 0), t + th * (k + 0.5) / teeth);
        pts.push(l + w, t + th, l, t + th);
        // 左端：下→上锯齿
        for (let k = teeth - 1; k >= 0; k--) pts.push(l + (k % 2 ? T : 0), t + th * (k + 0.5) / teeth);
        return Object.assign(base, {
          type: 'poly', pts, closed: true, tape: true,
          color: '#e2c887', width: 1, dash: false,
          fill: 'rgba(246,228,160,0.88)',
        });
      }
      case 'circle': { const r = Math.hypot(x1 - x0, y1 - y0), pts = []; for (let k = 0; k < 96; k++) { const a = (k / 96) * 2 * Math.PI; pts.push(x0 + r * Math.cos(a), y0 + r * Math.sin(a)); } return Object.assign(base, { type: 'poly', pts, closed: true, smooth: true }); }
      case 'ellipse': { const pts = []; for (let k = 0; k < 96; k++) { const a = (k / 96) * 2 * Math.PI; pts.push(l + w / 2 + (w / 2) * Math.cos(a), t + hgt / 2 + (hgt / 2) * Math.sin(a)); } return Object.assign(base, { type: 'poly', pts, closed: true, smooth: true }); }
      case 'triangle': return Object.assign(base, { type: 'poly', pts: [l + w / 2, t, l + w, t + hgt, l, t + hgt], closed: true });
      case 'rtri': return Object.assign(base, { type: 'poly', pts: [x0, y0, x0, y1, x1, y1], closed: true });
      case 'para': { const k = w * 0.25; return Object.assign(base, { type: 'poly', pts: [l + k, t, l + w, t, l + w - k, t + hgt, l, t + hgt], closed: true }); }
      case 'trap': { const k = w * 0.22; return Object.assign(base, { type: 'poly', pts: [l + k, t, l + w - k, t, l + w, t + hgt, l, t + hgt], closed: true }); }
      case 'hexagon': { const nS = tool.shape.sides || 6, r = Math.hypot(x1 - x0, y1 - y0), a0 = Math.atan2(y1 - y0, x1 - x0), pts = []; for (let k = 0; k < nS; k++) { const a = a0 + (k / nS) * 2 * Math.PI; pts.push(x0 + r * Math.cos(a), y0 + r * Math.sin(a)); } return Object.assign(base, { type: 'poly', pts, closed: true }); }
      case 'axes': { const ox = l + w / 2, oy = t + hgt / 2; return Object.assign(base, { type: 'axes', pts: [ox, oy, l + w, oy, ox, t, l, oy, ox, t + hgt], ticks: Math.max(20, Math.round(Math.min(w, hgt) / 12)), fill: null, dash: false }); }
      case 'numline': { const oy = y0, ox = l + w / 2; return Object.assign(base, { type: 'axes', pts: [ox, oy, l + w, oy, ox, oy, l, oy, ox, oy], ticks: Math.max(20, Math.round(w / 12)), labels: ['', ''], fill: null, dash: false }); }
      case 'axes3d': {
        // 斜二测：x 轴斜向 45°（长度减半），y 轴水平，z 轴竖直
        const ox = l + w * 0.4, oy = t + hgt * 0.62, L = Math.min(w, hgt) * 0.55;
        return [
          Object.assign({}, base, { id: GW.uid(), type: 'arrow', pts: [ox, oy, ox + w * 0.58, oy], fill: null, dash: false }),
          Object.assign({}, base, { id: GW.uid(), type: 'arrow', pts: [ox, oy, ox, t], fill: null, dash: false }),
          Object.assign({}, base, { id: GW.uid(), type: 'arrow', pts: [ox, oy, ox - L * 0.55, oy + L * 0.55], fill: null, dash: false }),
        ];
      }
    }
    // 物理图形库（core/physshapes.js）：type:'pb' 的对象只认 x1..y2 + key + 参数，
    // 几何全在库的 draw 里算，所以这里不再走 switch。
    if (type === 'pb' && GW.physShapes) {
      const it = GW.physShapes.make(tool.shape.pbKey, x0, y0, x1, y1, {
        color: base.color, width: base.width, dash: base.dash,
        fill: !!tool.shape.fill, fillColor: tool.shape.fillColor || base.color,
        fillAlpha: tool.shape.fillAlpha != null ? tool.shape.fillAlpha : 0.2,
        params: tool.shape.pbParams || null,
      });
      if (!it) return null;
      it.dash = base.dash;
      return it;
    }
    // 数学可调参图形（core/mathshapes.js）：和 pb 一样只认框、旋转与参数。
    if (type === 'ms' && GW.mathShapes) {
      const it = GW.mathShapes.make(tool.shape.msKey, x0, y0, x1, y1, {
        color: base.color, width: base.width, dash: base.dash,
        fill: !!tool.shape.fill, fillColor: tool.shape.fillColor || base.color,
        fillAlpha: tool.shape.fillAlpha != null ? tool.shape.fillAlpha : 0.18,
        params: tool.shape.msParams || null,
      });
      if (!it) return null;
      it.dash = base.dash;
      return it;
    }
    // 学科模板库（core/stencils.js）：走同一条 makeShape 链路，
    // 出来的就是普通 shape 对象，所以选中/移动/撤销/序列化/导出全都自然可用。
    if (GW.stencils) {
      const st = GW.stencils.make(type, x0, y0, x1, y1);
      if (st) {
        const wrap = (o) => Object.assign({}, base, o, { id: GW.uid(), kind: 'shape' });
        return Array.isArray(st) ? st.map(wrap) : wrap(st);
      }
    }
    return null;
  }
  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const v = parseInt(m[1], 16);
    return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
  }
  GW.hexA = hexA;

  // ---------- 正多边形参数（对应桌面原型 shape.js 的 n / R / rot） ----------
  // 故意不新增对象类型：仍然是普通的 {type:'poly', pts, closed}，参数每次从顶点反推。
  // 这样移动 / 缩放 / 旋转（transformSel 只改 pts）、复制粘贴、序列化、导出、撤销全都不用动，
  // 也不需要给变换链路加同步钩子 —— 变换完再反推一次就是新的参数（正多边形变换后还是正的）。
  GW.ngon = {
    MAX: 12,
    // 从顶点反推 {n, cx, cy, r, rot}；不是正多边形就返回 null
    // （圆 smooth、学科模板只有 segs 直接挡掉；矩形四个角到中心等距、但角间隔不等分，也挡掉）
    fit(it) {
      if (!it || it.type !== 'poly' || !it.closed || it.smooth || it.segs || it.parts) return null;
      const P = it.pts;
      if (!P || P.length % 2) return null;
      const n = P.length / 2;
      if (n < 3 || n > 12) return null;
      let cx = 0, cy = 0;
      for (let i = 0; i < P.length; i += 2) { cx += P[i]; cy += P[i + 1]; }
      cx /= n; cy /= n;
      const ds = new Array(n);
      let r = 0;
      for (let k = 0; k < n; k++) { const d = Math.hypot(P[2 * k] - cx, P[2 * k + 1] - cy); ds[k] = d; r += d; }
      r /= n;
      if (!(r > 1e-6)) return null;
      // 顶点到圆心的距离必须一致（1% 容差）：缩放 / 旋转后仍然一致，所以照样认
      for (let k = 0; k < n; k++) if (Math.abs(ds[k] - r) > r * 0.01) return null;
      // 光「等距」不够 —— 矩形的四个角到中心也等距，但角间隔不是 90°。
      // 再要求角间隔等分（2% 的间隔容差），这才是正多边形。
      const a0 = Math.atan2(P[1] - cy, P[0] - cx), step = Math.PI * 2 / n;
      for (let k = 1; k < n; k++) {
        let d = Math.atan2(P[2 * k + 1] - cy, P[2 * k] - cx) - a0 - k * step;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) > step * 0.02) return null;
      }
      return { n, cx, cy, r, rot: a0 };
    },
    // 用参数重建顶点：第 0 个顶点始终落在 rot 上（换边数时不会整圈乱转）
    set(it, p) {
      const n = Math.max(3, Math.min(this.MAX, Math.round(p.n)));
      const pts = new Array(n * 2);
      for (let k = 0; k < n; k++) {
        const a = p.rot + (k / n) * Math.PI * 2;
        pts[2 * k] = p.cx + p.r * Math.cos(a);
        pts[2 * k + 1] = p.cy + p.r * Math.sin(a);
      }
      it.pts = pts; it.closed = true;
      GW.invalidate(it);
      return it;
    },
  };

  // ---------- 指针调度 ----------
  const pointers = new Map(); // pointerId → state
  let gesture = null;          // 双指缩放平移
  let gestErase = null;        // 三指擦除（1.3.6）：三个指针合成一个「大橡皮」
  let capture, stage;
  // 「让位」回调：尺规长按拖动、双指手势等需要把已经起笔的一笔撤掉时使用。
  // 回调返回 true 表示确实撤销了内容（调用方据此重画刚被擦掉的那一小块）。
  const yielders = [];
  GW.yieldPointer = {
    push(fn) { yielders.push(fn); return () => { const i = yielders.indexOf(fn); if (i >= 0) yielders.splice(i, 1); }; },
    has: () => yielders.length > 0,
    fire(reason) {
      let redrawn = false;
      const list = yielders.slice();
      yielders.length = 0;
      for (const fn of list) { try { if (fn(reason)) redrawn = true; } catch (e) { console.error(e); } }
      return redrawn;
    },
  };

  function screenTol(px) { return px / GW.camera.s; }
  // 时间戳统一口径：coalesced 事件的 timeStamp 与 performance.now() 同一时基
  const ts = (e) => (e && e.timeStamp) || performance.now();

  // ---- 手势擦除（1.3.6）----
  // 老师不想擦一笔就去点一下橡皮：手掌按住拖一下、或三根手指一起划过，就地擦掉。
  // 但写字时手掌本来就托在屏上 —— 所以「笔在写」永远优先，真正生效的门槛是
  // 「笔不在屏上、且已经离开 1.5s」（见 pen.js 的 penEraseOk）。
  function gestEraseMode() {
    const s = GW.settings || {};
    if (s.gestErase === 'off' || s.gestErase === 'palm' || s.gestErase === 'all') return s.gestErase;
    return s.palmErase === true ? 'palm' : 'off';       // 老存档只有布尔
  }
  const ERASE_TOOLS = ['pen', 'hl', 'eraser', 'shape', 'text'];
  function gestEraseOn(kind) {
    const mode = gestEraseMode();
    if (mode === 'off') return false;
    if (kind === 'multi' && mode !== 'all') return false;
    if (ERASE_TOOLS.indexOf(tool.current) < 0) return false;   // 手型/选择照旧
    return !GW.pen || !GW.pen.penEraseOk || GW.pen.penEraseOk();
  }
  // 2.1.1：一体机（红外大屏 / Windows 触摸转鼠标驱动）常把触摸上报成 pointerType:'mouse'，
  // 甚至不给事件类型。旧代码到处写死 === 'touch'，这些机器上「手掌面积」和「三指」判定
  // 一律不成立 —— 这就是开关明明全开却仍然擦不动的第二个原因。
  // 只排除真正的电磁笔：真实鼠标永远只有一个 pointerId（浏览器规范固定为 1），凑不满三指，
  // 且 width/height 恒为 1（够不到 palmSize），所以纳入 'mouse' 不会把鼠标误判成手掌。
  const isTouchLike = (t) => t !== 'pen';
  function touchContact(e, infrared) {
    let w = e.width || 0, h = e.height || 0;
    // 部分 WebKit / 红外驱动把接触几何放在 radiusX/radiusY 上，Pointer Events 的
    // width/height 只有占位用的 1px —— 这时改用半径（×2 换成直径，与 width 同口径）。
    if (w <= 1 && h <= 1 && e.radiusX > 1 && e.radiusY > 1) { w = e.radiusX * 2; h = e.radiusY * 2; }
    // Pointer Events 用 1px 表示缺失的接触几何，只有两轴都有数据时才用短边。
    return infrared && w > 1 && h > 1 ? Math.min(w, h) : Math.max(w, h);
  }
  function palmIgnore(st) { st.mode = 'palm'; st.move = () => {}; }

  // ---- 四指召唤工具盘（2.1.1）----
  // 为什么要「待定窗」：三指落下就立刻 startMultiErase() 会把四指永远吞掉 —— 第 3 根手指
  // 触发擦除、第 4 指到达时已经落墨了，取消就要动撤销栈。改成「先挂起 90ms」：
  // 窗内等到第 4 指 ⇒ 取消（此时什么都没画过，不需要回滚）；窗满 ⇒ 照常擦除。
  // 三指擦除因此慢 90ms，但擦除是连续动作，教师感知不到。
  const FOUR_WIN_MS = 200;        // 首指 → 第 4 指的时间窗（比双指窗 160ms 略宽，红外丢点多）
  const FOUR_COOLDOWN = 600;      // 一次召唤后的冷却，防连触重复触发
  let fourTimer = 0, fourLast = 0, fourPending = false;

  // 红外屏触点上报不稳，待定窗放宽；与 GW.pen.profile().gestureMs 的放宽思路一致
  function fourPendingMs() {
    return (GW.pen && GW.pen.device && GW.pen.device() === 'infrared') ? 120 : 90;
  }
  function ballSummonOn() {
    const s = GW.settings || {};
    if (s.ballSummon === false) return false;
    if (!GW.ball || !GW.ball.snapTo) return false;
    if (!GW.isTouchUI || !GW.isTouchUI()) return false;   // 鼠标设备上没有「四指」这回事
    // 输入框里不抢手势（typing() 在下面另一个作用域里，这里就地判，别依赖它）
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('input, textarea, select, [contenteditable="true"]')) return false;
    return true;
  }
  function touchCenter(list) {
    let x = 0, y = 0, n = 0;
    for (const p of list) { x += p.cx; y += p.cy; n++; }
    return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
  }
  // 第 4 指到齐：抢在双指缩放 / 三指擦除之前判。返回 true 表示这一下已经消费掉
  function tryFourFinger(st, touches) {
    if (!ballSummonOn()) return false;
    if (gestErase) return false;      // 已经真的在擦了：这一下太晚，别再打断
    const first = touches[0];
    // 「同时」才算：慢悠悠一根根加手指是在缩放/平移，不是召唤
    if (!first || st.t - first.t > FOUR_WIN_MS) return false;
    if (performance.now() - fourLast < FOUR_COOLDOWN) return false;
    // 笔还在写就让位（400ms 门槛，比擦除的 1.5s 宽：老师放下笔就要叫工具盘，等不起）
    if (GW.pen && GW.pen.penAway && !GW.pen.penAway(400)) return false;
    fourLast = performance.now();
    if (fourPending) { clearTimeout(fourTimer); fourTimer = 0; fourPending = false; }
    const c = touchCenter(touches);
    // 全部指针作废：不落墨、不擦除、不缩放（这一下只用来召唤）
    for (const [, p] of pointers) {
      if (p.cancel) { try { p.cancel(); } catch (_) { /* 没有可撤销的一笔就算了 */ } }
      p.mode = 'dead'; p.move = null; p.up = null;
    }
    gesture = null;
    // 锚点：最近落墨点（8s 内有效）→ 笔尖；没有就退回四指中心（「叫到手上」才对）
    // 锚点只用「这一次手势之前」的落墨点：第 1 根手指落下时 penDown 已经跑过一次，
    // 会把 lastInk 写成那根手指的位置，直接拿来用就等于「召唤到第一个触点」。
    const lk = GW.lastInk;
    const inkOk = lk && performance.now() - lk.t < 8000 && (!first || lk.t < first.t - 20);
    const anchor = (inkOk && GW.toScreen) ? GW.toScreen(lk.x, lk.y) : c;
    try { GW.ball.snapTo(anchor.x, anchor.y, { open: true }); }
    catch (err) { console.warn('四指召唤失败', err); return false; }
    return true;
  }
  // 三指落下但还不确定是不是四指：先挂起
  function deferMultiErase() {
    fourPending = true;
    for (const [, p] of pointers) if (isTouchLike(p.type)) p.mode = 'pending';
    clearTimeout(fourTimer);
    fourTimer = setTimeout(() => {
      fourTimer = 0; fourPending = false;
      for (const [, p] of pointers) if (p.mode === 'pending') p.mode = null;
      if (!startMultiErase()) {
        // 窗内有人抬手了：还原成「没发生过」，别留下半截状态
        for (const [, p] of pointers) if (p.mode === 'dead') p.mode = null;
      }
    }, fourPendingMs());
  }

  function startMultiErase() {
    const list = [...pointers.values()].filter((p) => isTouchLike(p.type));
    if (list.length < 3) return false;
    // 已经起笔的一笔、正在进行的双指缩放：全部让位（这一下本来就不该落墨）
    for (const [, s] of pointers) { if (s.cancel) s.cancel(); }
    for (const p of pointers.values()) if (p.mode === 'gesture') p.mode = 'dead';
    gesture = null;
    const ids = new Set(list.map((p) => p.id));
    const box = () => {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const p of pointers.values()) {
        if (!ids.has(p.id)) continue;
        x1 = Math.min(x1, p.cx); y1 = Math.min(y1, p.cy);
        x2 = Math.max(x2, p.cx); y2 = Math.max(y2, p.cy);
      }
      if (!isFinite(x1)) { x1 = y1 = x2 = y2 = 0; }
      return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
    };
    // 合成事件：位置取三指外接框中心，直径跟着张开程度走（60~320px 之间），
    // 这样「三指松开一点擦得宽、并拢一点擦得窄」符合直觉。
    const fake = () => {
      const b = box();
      const d = GW.clamp(Math.hypot(b.x2 - b.x1, b.y2 - b.y1) * 0.9, 60, 320);
      return { clientX: b.cx, clientY: b.cy, width: d, height: d, pointerType: 'touch', pointerId: -1 };
    };
    const vest = { id: -1, x: fake().clientX, y: fake().clientY, type: 'touch', t: performance.now(), mode: null };
    eraserDown(vest, fake(), 'palm');
    gestErase = { ids, st: vest, fake, box };
    for (const p of pointers.values()) if (ids.has(p.id)) p.mode = 'gest-erase';
    return true;
  }
  function endMultiErase(id) {
    if (!gestErase) return;
    gestErase.ids.delete(id);
    if (gestErase.ids.size) { gestErase.st.move(gestErase.fake()); return; }
    const st = gestErase.st;
    gestErase = null;
    if (st.up) st.up({ clientX: 0, clientY: 0 });
  }

  // 2.1.2（A）：双指缩放「抖 + 突变」的两个放大器都在下面几行，改前是「瞬时 d ÷ 瞬时 d0」：
  //   ① d0 没有下限（Math.max(10,d0) 只护除零）—— 两指只隔 18px 时 1px 抖动 = 5.5% 倍率，
  //      18→400 的正常张手会算成 22 倍，被 MAX_S=20 钳住 ⇒ 倍率与画布内容位置一起突变；
  //   ② 距离与两指中点每帧取瞬时值 —— 红外框有 0.5~2px 量化抖动，在 8px 基线上被放大成 4.75 倍来回跳。
  // 修法：基线短于 GEST_D_MIN 时**不缩放**，只按中点平移；拉开到 GEST_D_MIN 以上时用**此刻的相机与
  // 中点重新取基准**（因此接得上、不跳变）；之后距离/中点各走一个 GEST_TAU 的一阶低通。
  // 三指擦除走独立入口 startMultiErase（按触点个数切换、不读 gesture），正常双指仍是「张多少倍就多少倍」。
  const GEST_D_MIN = 56;      // 屏幕像素：基线短于它时 1px 抖动就 ≥1.8%，不能拿来算倍率
  const GEST_TAU = 45;        // ms：60Hz 下 α≈0.31，等效跟手延迟约 2 帧，肉眼不可见
  function startGesture() {
    // 取消所有正在进行的笔迹
    for (const [, st] of pointers) if (st.cancel) st.cancel();
    const ps = [...pointers.values()].slice(0, 2);
    const [a, b] = ps;
    const d0 = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    gesture = {
      ids: [a.id, b.id], d0, cx, cy,
      engaged: d0 >= GEST_D_MIN,                       // 是否已进入「可以缩放」的状态
      anchor: { s: GW.camera.s, tx: GW.camera.tx, ty: GW.camera.ty, cx, cy },
      dBase: Math.max(GEST_D_MIN, d0),                 // 倍率基准，永远不取比 GEST_D_MIN 更短的基线
      d: d0, mx: cx, my: cy, t: performance.now(),
    };
    for (const st of pointers.values()) st.mode = 'gesture';
  }
  function moveGesture(e) {
    const g = gesture;
    const a = pointers.get(g.ids[0]), b = pointers.get(g.ids[1]);
    if (!a || !b) return;
    const dRaw = Math.hypot(a.x - b.x, a.y - b.y), mxRaw = (a.x + b.x) / 2, myRaw = (a.y + b.y) / 2;
    // 一阶低通用**时间常数**而非固定 α：掉帧/合并事件时滤波强度不变（固定 α 在 30fps 下会过度平滑）
    const t = (e && e.timeStamp) || performance.now();
    const dt = Math.min(90, Math.max(0.5, t - g.t));
    g.t = t;
    const k = 1 - Math.exp(-dt / GEST_TAU);
    g.d += (dRaw - g.d) * k; g.mx += (mxRaw - g.mx) * k; g.my += (myRaw - g.my) * k;
    // 两指还贴在一起：这会儿的距离全是噪声，只平移；拉开到 GEST_D_MIN 就地重新取基准
    if (!g.engaged) {
      if (g.d < GEST_D_MIN) {
        const P = g.anchor;
        return GW.setView(P.tx + (g.mx - P.cx), P.ty + (g.my - P.cy), P.s);
      }
      g.engaged = true; g.dBase = g.d;
      g.anchor = { s: GW.camera.s, tx: GW.camera.tx, ty: GW.camera.ty, cx: g.mx, cy: g.my };
    }
    // 1.3.0（R5）：缩放锁 100% 时双指捏合只平移（捏合的位移还是会走，老师不会觉得手势失灵）
    const A = g.anchor;
    const s = GW.zoomLock() ? 1 : GW.clamp(A.s * (g.d / g.dBase), 0.05, 20), f = s / A.s;
    GW.setView(g.mx - (A.cx - A.tx) * f, g.my - (A.cy - A.ty) * f, s);
  }

  function onDown(e) {
    GW.lastInput = performance.now();
    if (e.button === 1 || e.button === 2) { startPan(e); return; }
    // 1.1.15（R2）：老师收回书写权后平板只能看。平移/缩放要留着，否则连看都看不全。
    if (GW.lanLocked && tool.current !== 'hand') {
      if (!GW.__lanLockTip || performance.now() - GW.__lanLockTip > 4000) {
        GW.__lanLockTip = performance.now();
        GW.toast('老师已收回书写权，现在只能看');
      }
      return;
    }
    const d0 = GW.pt(e.clientX, e.clientY);
    const st = { id: e.pointerId, x: d0.x, y: d0.y, cx: e.clientX, cy: e.clientY, type: e.pointerType, t: performance.now(), mode: null };
    pointers.set(e.pointerId, st);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    if (GW.pen) { GW.pen.observe(e); GW.pen.notePenDown(e); if (e.pointerType === 'pen' && GW.pen.notePenHeld) GW.pen.notePenHeld(true); }
    st.infrared = isTouchLike(e.pointerType) && GW.pen?.device() === 'infrared';
    // 第二根手指落下的时间窗：红外屏普遍只有 60~100Hz 且「第二根手指」报告很晚，
    // 窗口太短会把双指缩放误判成两笔画线（用户感觉是「手势时乱画」），按设备放宽。
    const touches = [...pointers.values()].filter((p) => isTouchLike(p.type));
    // 2.1.1：四指到齐 ⇒ 召唤工具盘。**必须放在双指/三指之前**：
    // 第 2 指会把 gesture 拉起来、第 3 指会把擦除挂起，到第 4 指才有机会翻盘。
    if (isTouchLike(e.pointerType) && touches.length >= 4 && tryFourFinger(st, touches)) return;
    if (pointers.size >= 2 && touches.length >= 2 && !gesture) {
      const first = touches[0];
      const win = GW.pen ? GW.pen.profile().gestureMs : 160;
      const quick = st.t - first.t < win || !GW.settings.multiWrite || tool.current === 'hand' || tool.current === 'select'
        || (GW.pen && GW.pen.penPriority());   // 笔在场时第二根手指必须能双指缩放，不能被「多指书写」拦下
      if (quick) { startGesture(); return; }
    }
    // 三指同时落下 ⇒ 转擦除（1.3.6）。放在双指手势之后：两指永远还是缩放/平移，
    // 只有第三根手指加入时才会切过来，所以不会误伤既有的双指缩放。
    // 2.1.1：开了四指召唤时先挂起一个待定窗 —— 否则第 3 指已经把地擦掉了，第 4 指来不及。
    if (isTouchLike(e.pointerType) && touches.length >= 3 && gestEraseOn('multi')) {
      // 已经在擦（第 4 指来晚了）就别再挂起，交回原逻辑
      if (ballSummonOn() && !gestErase) { deferMultiErase(); return; }
      if (startMultiErase()) return;
    }
    if (gesture) {
      // 2.1.2（B）：手掌落在**进行中的双指手势**上时不许被吞掉。双指只认前两根指针，旧实现里
      // 第 3 个触点（大屏上常常就是压下来的手掌）静默变成 'gesture' —— 老师看到的就是「手掌压下去没反应」。
      // 只有「确实是大面积手掌 + 手势擦除开着」才抢手势；普通第 3 根手指照旧不打断缩放。
      if (isTouchLike(e.pointerType) && gestEraseOn('palm')
        && touchContact(e, st.infrared) >= (GW.pen ? GW.pen.palmThreshold() : (GW.settings.palmSize || 46))) {
        for (const p of pointers.values()) { if (p.cancel) p.cancel(); p.mode = 'dead'; p.move = null; p.up = null; }
        gesture = null;
        eraserDown(st, e, 'palm');
        return;
      }
      st.mode = 'gesture'; return;
    }

    // 手掌擦除：大面积触摸
    const contact = touchContact(e, st.infrared);
    const palmW = GW.pen ? GW.pen.palmThreshold() : (GW.settings.palmSize || 46);
    const big = isTouchLike(e.pointerType) && contact >= palmW;
    // 笔优先（1.3.4）：笔最近落过屏 ⇒ 手指不再落墨，改成**平移画布**，这样一只手写字、
    // 另一只手（或同一只手的手掌边）能直接拖动画面，不用先切工具。面积大的仍按手掌处理：
    // 写字时手掌本来就贴着屏，跟着拖会把画布带跑。
    // （红外屏的「笔」在系统里就是一根手指，永远收不到 pen 事件，penPriority() 恒为 false。）
    if (isTouchLike(e.pointerType) && GW.pen && GW.pen.penPriority()) {
      // 有笔在场时，手指的接触面积本来就接近 palmSize（iPad / 安卓平板常报 40~55 CSS px），
      // 不能再用「>= palmSize 就是手掌」判 —— 那会把所有手指都判成手掌，手指就既不能写也不能拖。
      // 这里把门槛抬到 1.9 倍且不低于 90px：真正的手掌（贴屏一片，常报 120~200）仍然被忽略。
      const hand = contact >= Math.max(palmW * 1.9, 90);
      if (hand) {
        // 笔已经放下了 ⇒ 巴掌一抹就擦（希沃/鸿合的习惯）；笔还在写就只是托着，忽略
        if (gestEraseOn('palm')) { eraserDown(st, e, 'palm'); return; }
        st.mode = 'dead'; return;
      }
      return startPanState(st);
    }
    // 手写笔尾端橡皮
    const penEraser = e.pointerType === 'pen' && (e.buttons & 32);
    let t = tool.current;
    // 大面积触摸一律先判成手掌（判定与动作分开：落成什么动作由下面的 palmHandler 决定）。
    // 这里若跟着 palmErase 一起关掉判定，关掉擦除时手掌就会当手指落墨 —— probe-mobile 的
    // 「大面积触摸落墨了」守的就是它。
    if (big && DRAW_TOOLS.includes(t)) t = 'palm';
    // 每一次落在画布上的触摸都记进接触面积样本（含刚被判成手掌的这一下）。
    // 只收「没被判成手掌」的样本时，手指面积天生 ≥ palmSize 的电容屏一个样本也攒不到，
    // 阈值永远停在 base，那台设备一辈子学不会 —— 这就是「电容屏无法正常书写」。
    // 判定在先、喂样本在后，所以本次触摸不参与本次判定（复位后第 1 笔仍按 base 判手掌）。
    if (isTouchLike(e.pointerType) && GW.pen && DRAW_TOOLS.includes(tool.current)) GW.pen.noteContact(contact);
    if (penEraser) t = 'eraser';

    if (t === 'hand') return startPanState(st);
    // GW.inking 的语义是「正有笔/手指在画布上落墨」，不是「屏幕上有手指」。
    // board.js 只在 viewChanged 里用它挡「视图快速通道（CSS 变换）」——只有真在落墨时才必须挡，
    // 因为那时墨迹层必须与 view 同步、不能被单独变换。手型平移、双指缩放、中右键拖动都不落墨，
    // 必须放行：1.0.3 及以前这里对所有指针一律置位，于是每一次平移/缩放都退回整屏重画
    // （renderAll：清背景 + 重画全部笔迹 + 清实时层），老一体机上就是「拖动延迟很大」；
    // 附带后果是「拖动期间暂隐对象层」（mid/lite 档的 hideWorldOnPan）永远不生效。
    if (t !== 'select' && t !== 'text') GW.inking = true;
    // 1.4.0（iPad 反馈「写着写着笔迹自己没了 / 橡皮擦像坏了一样」）：
    // 手掌一律**只忽略、不擦**。以前手掌落到画布上会当「大面积橡皮」直接擦掉笔迹，
    // 而 iPad 上写字时手掌本来就会一直贴着屏 —— 结果是刚写的字被自己擦掉、每次擦除又都进
    // 了历史，老师按撤销看起来像「回退无效」。想要手掌擦除的老师可在设置里开 palmErase。
    const palmHandler = gestEraseOn('palm') ? eraserDown : palmIgnore;
    const handlers = { pen: penDown, hl: penDown, eraser: eraserDown, palm: palmHandler, shape: shapeDown, select: selectDown, text: textDown, laser: laserDown };
    (handlers[t] || startPanState)(st, e, t);
  }
  function onMove(e) {
    GW.lastInput = performance.now();
    const st = pointers.get(e.pointerId);
    if (!st) return;
    const dm = GW.pt(e.clientX, e.clientY);
    st.x = dm.x; st.y = dm.y; st.cx = e.clientX; st.cy = e.clientY;
    // 待定窗内什么都不做：既不缩放也不擦除（窗只有 90ms，用户感知不到「卡了一下」）
    if (fourPending) return;
    if (gestErase && gestErase.ids.has(e.pointerId)) { gestErase.st.move(gestErase.fake()); return; }
    if (gesture) { moveGesture(e); return; }
    if (st.mode === 'draw' && pointers.size === 1 && st.latePalm?.(e)) return;
    if (st.move) {
      // 合并事件里带着这一帧所有采样点，全部用上笔迹才圆滑；弱机上限流，避免主线程被淹
      let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      if (!evs || !evs.length) evs = [e];
      else if (evs.length > 1 && !(GW.perf && GW.perf.coalesce)) evs = [e];
      if (GW.pen) GW.pen.observe(e, evs.length);
      // 2.0.8（I1b）：浏览器的前瞻点（getPredictedEvents）作为预测段的第二来源。
      // 只在开关打开时取；取不到就交 null，让 drawPred 退回滤波器外推（2.0.7 行为）。
      if ((GW.settings || {}).inkPredict && st.pushPred) {
        let pe = null;
        if (typeof e.getPredictedEvents === 'function') {
          try { pe = e.getPredictedEvents(); } catch (_) { pe = null; }
        }
        st.pushPred(pe && pe.length ? pe : null);
      }
      for (const ev of evs) st.move(ev);
    } else if (GW.pen) GW.pen.observe(e);
  }
  function onUp(e) {
    GW.lastInput = performance.now();
    const st = pointers.get(e.pointerId);
    if (!st) return;
    // 2.1.1：笔尖终点（世界坐标）。记在**抬手**这一刻而不是起笔：
    // 四指召唤的第 1 根手指落下时也会走 penDown，在那边记会把笔尖污染成触点位置
    // （实测召唤会落到第一个手指旁边，而不是刚才写字的地方）。
    if (st.mode === 'draw' && !st.dead) { const w = GW.toWorld(st.x, st.y); GW.lastInk = { x: w.x, y: w.y, t: performance.now() }; }
    pointers.delete(e.pointerId);
    if (e.pointerType === 'pen' && GW.pen && GW.pen.notePenHeld) GW.pen.notePenHeld(false);
    if (!pointers.size) GW.inking = false;
    // 2.1.1：待定窗里有人抬手 ⇒ 当场结账，不要留到定时器再判（此时剩余手指可能已不够三指）
    if (fourPending) {
      clearTimeout(fourTimer); fourTimer = 0; fourPending = false;
      for (const [, p] of pointers) if (p.mode === 'pending') p.mode = null;
      if (!gestErase && [...pointers.values()].filter((p) => isTouchLike(p.type)).length >= 3) startMultiErase();
    }
    if (gestErase && gestErase.ids.has(e.pointerId)) { endMultiErase(e.pointerId); return; }
    if (gesture) {
      if (gesture.ids.includes(e.pointerId)) {
        gesture = null;
        // 剩下的手指不再书写
        for (const p of pointers.values()) p.mode = 'dead';
      }
      return;
    }
    if (st.up && st.mode !== 'dead') st.up(e);
  }

  // 事件坐标统一经 GW.pt 换算到 #stage 原点（iOS 上 stage 不在 (0,0)）
  const TW = (ev) => { const q = GW.pt(ev.clientX, ev.clientY); return GW.toWorld(q.x, q.y); };

  // ---- 平移 ----
  // 1.3.0（R5）：单轴模式下整个手势只走一个方向 —— 第一次位移超过 6px 时定轴，之后斜着划也只走那一轴
  // （否则每帧按「谁大」重判，画面会左右来回抖）。6px 之前攒着的位移在定轴那一下一次性补上，不会丢。
  function axisPan(st, dx, dy) {
    if (!GW.axisLock()) return GW.panBy(dx, dy);
    if (!st.axis) {
      st.ax = (st.ax || 0) + dx; st.ay = (st.ay || 0) + dy;
      if (Math.max(Math.abs(st.ax), Math.abs(st.ay)) < 6) return;
      st.axis = Math.abs(st.ax) >= Math.abs(st.ay) ? 'x' : 'y';
      dx = st.ax; dy = st.ay; st.ax = 0; st.ay = 0;
    }
    GW.panBy(dx, dy, st.axis);
  }
  function startPanState(st) {
    st.mode = 'pan';
    let lx = st.x, ly = st.y;
    st.move = (e) => { const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; axisPan(st, dx, dy); };
    document.body.classList.add('panning');
    st.up = () => document.body.classList.remove('panning');
  }
  function startPan(e) {
    const tgt = e.currentTarget;
    tgt.setPointerCapture(e.pointerId);
    let lx = e.clientX, ly = e.clientY;
    const ps = {};
    const mv = (ev) => { const dx = ev.clientX - lx, dy = ev.clientY - ly; lx = ev.clientX; ly = ev.clientY; axisPan(ps, dx, dy); };
    const up = () => { tgt.removeEventListener('pointermove', mv); tgt.removeEventListener('pointerup', up); };
    tgt.addEventListener('pointermove', mv); tgt.addEventListener('pointerup', up);
    e.preventDefault();
  }

  // ---- 笔 / 荧光笔 ----
  // 普通钢笔（不透明、等宽）走「增量画到墨迹层」的快路径：每帧只画新增的一小段，
  // 不做整屏清除、不重建整条 Path2D，长时间连笔也不会越来越卡；
  // 荧光笔（半透明）、毛笔 / 压感（变宽）、智能笔（收笔可能要替换成规整图形）仍走实时层。
  function penDown(st, e, t) {
    const hl = t === 'hl', cfg = hl ? tool.hl : tool.pen;
    const PN = GW.pen;
    const boardFeel = !hl && st.infrared && GW.settings.penBoardFeel !== false && GW.settings.penTaper !== 0;
    // 注意：这里**不要**再调 PN.observe(e) —— onDown 里已经对同一个事件调过一次
    // （input.js 的 `if (GW.pen) { GW.pen.observe(e); ... }`），重复采样会把设备诊断里的
    // 采样率/压感/抖动统计全部算成两倍，也会让「自动识别设备」提前锁档。
    const prof = PN ? PN.profile() : null;
    // 滤波：**默认直通**。这是书写手感的第一条底线 ——
    // 屏幕上的墨点位置必须就是手指位置。时间域低通一定会带来滞后（截止频率越低越滞后），
    // 红外屏上实测 40~90ms，手感立刻变成「粘手、定位不准、拐角被削圆」。
    // 抖动只能在**空间域**压（采样门限 + 中点二次贝塞尔拟合，见 board.js 的 smoothPath），
    // 那不会改变笔尖跟手。只有用户在「设置 → 笔迹抖动抑制」显式加档时才会真的滤波。
    const dRaw = GW.pt(e.clientX, e.clientY);
    const flt = PN ? PN.newFilter(dRaw.x, dRaw.y, ts(e), boardFeel) : null;
    const pos = (ev) => {
      const q = GW.pt(ev.clientX, ev.clientY);
      const filtered = flt ? flt.add(q.x, q.y, ts(ev)) : q;
      return boardFeel ? q : filtered;
    };
    const f0 = pos(e);
    const p0 = GW.toWorld(f0.x, f0.y);
    // 2.0.8：纸外不再禁笔。1.7.5 起这里是 `if (!pageAllows(p0)) { st.mode='dead'; return; }`，
    // 于是在整页模板页上，落在纸外的一笔**整笔作废**：笔尖没有任何墨、抬手也没有数据，
    // 老师看到的就是「这一笔丢了」——而同一块屏幕上翻到无限画布页立刻又能写。
    // 纸框现在只管纸张/底纹/纸框画在哪（见 board.js 的 pageAllows），书写判定与无限画布一致。
    // 1.3.5：压感改成「按采样点判定 + 一次性闩锁」。
    // 原来只拿**落笔那一帧**的 pressure 判定整笔：可很多手写板落笔瞬间报 0.5（或 0），
    // 于是整笔都被当成「没有压感」走速度笔锋 —— 老师说的「笔没有压感」就是这个。
    // 现在只要这一笔里有任何一个采样点报出真压感，后半笔就用压感（前半笔按速度笔锋，看不出接缝）。
    let pressSeen = !hl && e.pointerType === 'pen' && e.pressure > 0 && e.pressure !== 0.5;
    // 2.0.3：笔种由 core/ink-style.js 的纯数据表决定（中性笔/圆珠笔/硬笔/钢笔/毛笔/铅笔/马克笔/粉笔）。
    // 老设置只有 penMode（pen|brush）与 brush（pen|pencil|marker）两套开关，这里做一次映射，
    // 不改存档：没选过新笔种的人，毛笔仍旧是毛笔、铅笔仍旧是铅笔，中性笔逐位等于 2.0.2 的手感。
    const IS = GW.inkStyle || null;
    const styleId = hl ? null : ((GW.settings || {}).penInk
      || (cfg.mode === 'brush' ? 'brush'
        : (GW.settings || {}).brush === 'pencil' ? 'pencil'
          : (GW.settings || {}).brush === 'marker' ? 'marker' : 'gel'));
    const sty = IS && styleId ? IS.of(styleId) : null;
    const brush = !hl && (sty ? sty.id === 'brush' : cfg.mode === 'brush');
    const stroke = { id: GW.uid(), kind: 'stroke', pts: [p0.x, p0.y], color: cfg.color, width: cfg.width / (GW.settings.penScaleWithZoom ? 1 : GW.camera.s), _t: Date.now() };
    // 笔种跟着笔迹走：换笔只影响之后写的，已经写下的照原样渲染（和 GoodNotes 一致）。
    // 默认笔不写字段 ⇒ 2.0.2 及以前的 .gewu 与本版写出的文件逐字节同构。
    if (sty && sty.id !== 'gel') stroke.pen = sty.id;
    // 1.5.0：笔迹线型。只有非实线才写字段（旧存档与实线笔迹的体积不变）。
    // `_t` 是「这一笔什么时候落下的」，只给写字保护用；下划线开头 ⇒ 不进 .gewu。
    if (cfg.style && cfg.style !== 'solid') stroke.dashStyle = cfg.style;
    if (hl) stroke.hl = true;
    // 尺规吸附要的是笔直的线、智能笔要识别成图形，这两种情况不做笔锋
    const snapper = GW.geo && GW.geo.snapper(p0);
    if (snapper) { const q = snapper(p0); stroke.pts[0] = q.x; stroke.pts[1] = q.y; }
    // 1.3.5：智能笔并入「笔」以后，识别不再靠模式开关，笔锋/增量绘制也一律照做
    //（这正是原来「智能笔写出来的字难看」的根因：那一路把笔锋和压感都关了）。
    const taper = !hl && !snapper && (!prof || prof.taper !== 0);
    const ws = taper ? [] : null;
    if (ws) stroke.ws = ws;               // 先挂上去：增量绘制要按它算每一段的宽度
    const inc = GW.inkTrail.ok(stroke);
    // ---- 笔锋：入锋 / 出锋 + 速度当压感 ----
    // 红外屏没有 pressure（恒 0.5），所以「笔锋」只能由**速度**做出来 —— 这也是希沃白板5 的做法：
    // 慢写饱满、快写收细；起笔由细渐粗（入锋），收笔由粗渐细（出锋）。
    // 全过程都在空间域，不引入任何时间滞后。
    // 毛笔的基本笔宽比钢笔大得多（真毛笔一落笔就比钢笔粗），入锋也更长；
    // 压感/速度再在这个宽度上做 0.1~2 倍的伸缩，才看得出来是「毛笔」而不是「粗钢笔」。
    const W = stroke.width * (sty ? sty.wScale : (brush ? 1.7 : 1));               // 世界单位
    const boardSoft = boardFeel && brush && ws && !stroke.dashStyle;
    // 2.0.3：教室白板笔锋（EasiNote 那套速度曲线）只留给中性笔 / 钢笔。
    // 圆珠笔、硬笔、马克笔、铅笔、粉笔要的是「自己的宽度律」—— 让白板笔锋接管反而是
    // 又给它们套了一层速度笔锋，用户挑这些笔就是为了躲开笔锋。
    const styleKeepsBoard = !sty || sty.id === 'gel' || sty.id === 'fountain';
    const boardWidth = boardFeel && ws && !boardSoft && styleKeepsBoard ? PN.boardWidth() : null;
    const tipFactors = [0.1, 1 / 6, 0.2, 1 / 2.9, 1 / 2.3, 1 / 1.8, 2 / 3, 0.8];
    let softCanvas = null, softFrame = 0;
    const stopSoft = () => { cancelAnimationFrame(softFrame); if (softCanvas) softCanvas.remove(); };
    function drawSoft() {
      softFrame = 0;
      const from = Math.max(0, ws.length - tipFactors.length - 1);
      const tip = { kind: 'stroke', color: stroke.color, width: stroke.width, pts: stroke.pts.slice(from * 2), ws: ws.slice(from) };
      const box = GW.bbox(tip);
      const a = GW.toScreen(box.x, box.y), b = GW.toScreen(box.x + box.w, box.y + box.h);
      const x = Math.max(0, Math.floor(a.x - 4)), y = Math.max(0, Math.floor(a.y - 4));
      const w = Math.min(stage.clientWidth, Math.ceil(b.x + 4)) - x;
      const hh = Math.min(stage.clientHeight, Math.ceil(b.y + 4)) - y;
      if (!(w > 0 && hh > 0)) { if (softCanvas) softCanvas.hidden = true; return; }
      if (!softCanvas) {
        softCanvas = document.createElement('canvas');
        softCanvas.className = 'board-soft-tip';
        softCanvas.style.zIndex = '3';
        stage.append(softCanvas);
      }
      const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(450000 / (w * hh)));
      softCanvas.width = Math.max(1, Math.ceil(w * dpr));
      softCanvas.height = Math.max(1, Math.ceil(hh * dpr));
      Object.assign(softCanvas.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
      softCanvas.hidden = false;
      const ctx = softCanvas.getContext('2d'), s = GW.camera.s;
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (GW.camera.tx - x), dpr * (GW.camera.ty - y));
      // 2.0.8：不再按纸框裁这一小块「软笔尖」预览 —— 纸框不是书写边界，
      // 毛笔/压感在纸边写字时笔尖预览也要和落墨一致（以前纸外那截预览会被裁掉）。
      GW.drawItem(ctx, tip);
    }
    const entryPx = Math.max(3.5, W * GW.camera.s * (sty ? sty.entry : (brush ? 2.9 : 2.0)));   // 入锋长度（屏幕像素）
    const speedK = sty ? sty.vK : (brush ? 0.86 : 0.30), speedLo = sty ? sty.vLo : (brush ? 0.16 : 0.55);
    // 速度 EMA 的时间常数（毫秒）。刻意按**时间**衰减，不按采样点衰减。
    // 原来的固定系数 0.35 是「每来一个采样点走一步」，于是笔锋的响应快慢随上报率漂移：
    // 60Hz 红外屏等效时间常数 ≈ 39ms，240Hz 电磁笔只有 ≈ 10ms —— 同一手速在两块屏上笔锋完全不同。
    // 取 39ms 正好等于 60Hz 下系数 0.35 的等效值 ⇒ 目标机型（红外一体机）手感分毫不变，高报率设备向它对齐。
    const vTau = (prof && prof.vTau) || 39;
    // 压感平滑的时间常数。低端手写板的压感常常只有 8~16 级且跳动大，
    // 直接拿来当宽度会把笔迹画成一节一节的「藕节」。18ms 的一极轻平滑肉眼看不到滞后，却能把台阶磨平。
    const pTau = 18;
    let travelledPx = 0, vSmooth = 0, pSmooth = 0, pSeen = false, lastT = ts(e);
    // 1.7.1：单笔内宽度不许跳变（用户报的「一会粗一会细」）。
    // 触摸屏上报的 dt 抖动很大（coalesced 事件的 timeStamp 有时整段相同），瞬时速度
    // dPx/dt 会瞬间冲到几十 px/ms，速度档的线宽随之在 0.55…1.25 之间来回摆 ——
    // 实测同一笔内 max/min 能到 2.05。这里做两道闸：速度上限 + 相邻采样宽度变化 ≤18%。
    let mPrev = 0;
    // 1.6.6（T05）：倾斜笔锋。笔杆越平（tiltX/tiltY 的合成值越大）线宽越宽，像铅笔侧锋。
    // 只作用于「笔」（荧光笔宽度本来就固定），并且只在设置里显式打开时生效。
    const tiltOn = !hl && !!(GW.settings || {}).penTilt;
    // 1.6.8（R6）：笔刷预设。只改已有的两个系数（压感斜率 / 速度灵敏度），不新增渲染分支，
    // 所以导出、缩略图、协同对端看到的仍是同一种笔迹数据。
    const brushStyle = (GW.settings || {}).brush || 'pen';
    const bSpeed = brushStyle === 'pencil' ? 1.75 : brushStyle === 'marker' ? 0.4 : 1;
    // 2.0.4：按笔种的六维笔锋配置。penTipCfg 为空 / 缺键时逐位等价 2.0.3。
    const tc = IS ? IS.tipConfig(sty && sty.id, (GW.settings || {}).penTipCfg) : null;
    // 2.0.8（I4）：本笔开始时的压感标定区间（每笔取一次，不每点读设置）。
    // 只有 inkCalib 打开且本设备标定过才有值；否则 pIn 就是原始 pSmooth，行为与 2.0.7 一致。
    const calib = ((GW.settings || {}).inkCalib && PN && PN.calib) ? PN.calib() : null;
    let tSmooth = 0;
    const widthAt = (ev, dPx, dt) => {
      const ms = Math.max(1, dt);
      let m;
      const pRaw = ev.pressure;
      if (!pressSeen && ev.pointerType === 'pen' && pRaw > 0 && pRaw !== 0.5) pressSeen = true;
      // 压感灵敏度（设置 →「压感灵敏度」）：把 device 报的 pressure 围绕 0.5 放大/压缩。
      // 红外屏（无压感）走速度分支，同一个旋钮也放大速度对粗细的影响，保证「调了有感」。
      const pGain = GW.clamp((+((GW.settings || {}).penPress) || 1), 0.4, 3);
      if (pressSeen && pRaw > 0) {
        if (!pSeen) { pSmooth = pRaw; pSeen = true; }
        else pSmooth += (pRaw - pSmooth) * (1 - Math.exp(-ms / pTau));
        // 2.0.3：压感灵敏度先乘笔种自己的 pressK（毛笔更吃压感、圆珠笔几乎不吃），
        // 再按笔种的 [pLo, pHi] 区间映射成宽度倍数 —— 这一步就是「提按」的全部来源。
        // 标定：把设备实际量程 [lo,hi] 拉回 0..1，再走原来的灵敏度/笔种映射
        const pIn = calib ? GW.clamp((pSmooth - calib.lo) / (calib.hi - calib.lo), 0, 1) : pSmooth;
        const pEff = GW.clamp(0.5 + (pIn - 0.5) * pGain * (sty ? (sty.pressK || 1) : 1), 0.02, 1);
        m = sty ? IS.pressureCurve(sty, pEff, tc)
          : brush ? (0.12 + pEff * 2.08)
            : brushStyle === 'marker' ? (0.78 + pEff * 0.55)
              : brushStyle === 'pencil' ? (0.18 + pEff * 1.9)
                : (0.26 + pEff * 1.5);
      } else {
        const v = Math.min(6, dPx / ms);                      // 屏幕像素 / 毫秒（上限 6000px/s，防 dt 抖动尖峰）
        vSmooth += (v - vSmooth) * (1 - Math.exp(-ms / vTau));
        m = sty ? IS.speedW(sty, vSmooth, pGain)
          : GW.clamp(1.25 - vSmooth * speedK * bSpeed * (0.55 + 0.45 * pGain), speedLo, 1.25);
      }
      // 2.0.4 A：斜率钳制原来只在速度分支内，压感分支取宽度无限幅却在下面更新 mPrev
      // ⇒ 有真压感的设备宽度逐点跳（老师说的「歪 / 尖」）。移到两分支共用，读笔种自己的
      // slope（plain=1 相当于直通）；速度分支的算式与结果逐位不变。
      const sl = sty ? sty.slope : 0.18;
      if (mPrev > 0) m = GW.clamp(m, mPrev * (1 - sl), mPrev * (1 + sl));
      mPrev = m;
      const g = sty ? IS.entryK(sty, travelledPx, entryPx)
        : (travelledPx >= entryPx ? 1 : 0.34 + 0.66 * (travelledPx / entryPx));
      if (tiltOn) {
        // hypot(tiltX,tiltY)/90：笔直立刻度为 0，放平到 90° 为 1。与压感同样做一次时间平滑，
        // 否则 240Hz 报点下 tilt 的量化台阶会让线宽一节一节地跳。
        const tn = Math.min(1, Math.hypot(ev.tiltX || 0, ev.tiltY || 0) / 90);
        tSmooth += (tn - tSmooth) * (1 - Math.exp(-ms / pTau));
        m *= sty ? IS.tiltK(sty, tSmooth) : (1 + 0.6 * tSmooth);
      }
      return W * m * g;
    };
    if (ws) ws.push(boardWidth || boardSoft ? W * 0.2 : widthAt(e, 0, 1));
    st.mode = 'draw';
    st.stroke = stroke;
    // 采样阈值：默认约 0.7 屏幕像素；兼容档放宽，省下无用顶点又不影响手感
    const minD = ((GW.perf && GW.perf.minPoint) || 0.7) / GW.camera.s;
    // 起笔：按下即落墨。这里**故意不做**任何「等一会儿再画」的时间窗 ——
    // 起笔死区（哪怕只有 45ms）在慢写时每次都被吃满，是「延迟高」的第二大来源。
    // 真有起笔钩，那是**空间**问题，该用采样门限和曲线拟合解决，不是靠等。
    let begun = false;
    const beginTrail = () => { if (!begun) { begun = true; GW.inkTrail.begin(stroke); } };
    beginTrail();
    // 笔尖预测：多画一小段「预测线」，下一帧真笔迹就盖住它。不需要预测的设备（predict:0）完全不注册，零开销。
    //
    // 这段线画在 #pen-pred 这个小 DOM 元素上，而**不是** GW.live（实时层）。
    // 实时层是一块**全屏**画布，只要有内容就进合成；红外屏默认开着预测（predict:8），
    // 写字时每一帧都要重画这条线 ⇒ 写字全程每一帧都多合成一整屏，外加一次局部 clearRect。
    // 实测 scripts/bench-ink.js（同一次运行里与「老设计」对照，写一笔 420 点）：
    //   · 4K 软件渲染：画在实时层 → 实时层 420/420 帧都在合成里、帧间隔 p50 46.2ms（≈22fps）；
    //     换到这个元素 → 0/420 帧、0 次局部 clear、帧间隔 p50 16.9ms（≈59fps）；
    //   · 1920×1080：改前改后都在 16.7ms 一根垂直同步之内，测不出差别（算力够时本来就不缺）。
    // 这块全屏层正是本项目自己记过账的：撤出合成能让 8K 软件渲染下书写 30→59fps（见 board.js 的注释）。
    const predEl = document.getElementById('pen-pred');
    let predOff = null, pred = null;
    // 2.0.8（I1b）：最近一次 pointermove 带的浏览器前瞻点（已被 onMove 过滤为空则回落滤波器）
    let predEv = null;
    st.pushPred = (arr) => { predEv = arr && arr.length ? arr : null; };
    const hidePred = () => { if (predEl && predEl.style.display !== 'none') predEl.style.display = 'none'; };
    // 起点刻意取「墨迹**已经画到**的地方」而不是笔尖 —— 增量落墨为了定切线，
    // 最后一段要等下一个点到齐才画得出来，所以墨迹末端永远落后笔尖，而且两条路落后得不一样：
    //   · 变宽（ws，走 trailQuad）：画到**倒数第二个点** P[n-2] 为止（board.js 的 `last = n - 2`）
    //   · 等宽（走 quadraticCurveTo）：画到最后两点的**中点**为止
    // 起点取两者中更靠后的那个，才能与已画出的墨迹严丝合缝。从笔尖起画会留缝：
    // 快速走笔时肉眼就是一颗孤零零的「断点」（见 .tmp/pen-pred.png 前后对比）。
    // 这一小段因此同时干两件事：补上那个采样点的滞后 + 提前 8ms 出线。
    const drawPred = () => {
      if (!predEl) return;
      if (!pred) return hidePred();
      const P = stroke.pts, n = P.length;
      const px = P[n - 2], py = P[n - 1];                        // 笔尖
      const qx = n >= 4 ? P[n - 4] : px, qy = n >= 4 ? P[n - 3] : py;   // 倒数第二个点
      const ax = boardWidth ? px : ws ? qx : (qx + px) / 2;
      const ay = boardWidth ? py : ws ? qy : (qy + py) / 2;
      const a = GW.toScreen(ax, ay), b = GW.toScreen(pred.x, pred.y);
      const dx = b.x - a.x, dy = b.y - a.y, L0 = Math.hypot(dx, dy);
      if (!(L0 > 0.5)) return hidePred();
      // 厚度取**墨迹末端那一点**的笔锋宽度（倒数第二个），不是最新的那个点：
      // 它正好等于墨迹收尾处的宽度，接缝两侧一样粗；最新点的宽度还被 dt 极小的那个采样点扰着，会突然鼓一下。
      const k2 = ws ? Math.max(0, ws.length - (boardWidth ? 1 : 2)) : 0;
      const wNow = ws && ws.length ? ws[Math.min(k2, ws.length - 1)] : stroke.width;
      const h = Math.max(1, wNow * GW.camera.s);
      // 起点再往回压 2px 叠在墨迹上：两条抗锯齿边正好贴在一起时会透出一道浅缝（放大 7 倍能看见）。
      // 叠上去是完全安全的 —— 同色不透明，盖住的本来就是同一笔的墨。
      const ux = dx / L0, uy = dy / L0, ov = 2;
      const sx = a.x - ux * ov, sy = a.y - uy * ov;
      predEl.style.display = 'block';
      predEl.style.width = (L0 + ov).toFixed(1) + 'px';
      predEl.style.height = h.toFixed(1) + 'px';
      predEl.style.background = GW.inkFix ? GW.inkFix(stroke.color) : stroke.color;
      // transform-origin: 0 50% ⇒ 元素左中点落在墨迹末端，再绕它按线段方向旋转
      predEl.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + (sy - h / 2).toFixed(1) + 'px,0) rotate(' + Math.atan2(dy, dx).toFixed(4) + 'rad)';
    };
    if (inc && !boardSoft && prof && prof.predict > 0 && predEl) predOff = hidePred;
    let lastRaw = e;
    st.move = (ev) => {
      lastRaw = ev;
      const f = pos(ev);
      let p = GW.toWorld(f.x, f.y);
      if (snapper) p = snapper(p);
      const P = stroke.pts, lx = P[P.length - 2], ly = P[P.length - 1], d = Math.hypot(p.x - lx, p.y - ly);
      if (d < minD) return;
      const dPx = d * GW.camera.s, now = ts(ev);
      travelledPx += dPx;
      P.push(p.x, p.y);
      if (boardSoft) {
        ws.push(W);
        const stable = ws.length - 1 - tipFactors.length;
        if (stable >= 0) ws[stable] = W;
        for (let i = Math.max(0, ws.length - tipFactors.length); i < ws.length; i++) {
          ws[i] = W * (0.25 + 0.75 * tipFactors[ws.length - 1 - i]);
        }
        if (ws.length <= tipFactors.length) ws[0] = ws[1];
      } else if (boardWidth) {
        const gain = GW.clamp(+GW.settings.penPress || 1, 0.4, 3);
        const width = W * boardWidth((p.x - lx) * GW.camera.s, (p.y - ly) * GW.camera.s, now - lastT, ev.type === 'pointerup', gain);
        if (ws.length === 1) ws[0] = width;
        ws.push(width);
      } else if (ws) ws.push(widthAt(ev, dPx, now - lastT));
      lastT = now;
      stroke._mvT = now;   // 2.2.3（R7）：最后一次**真的推进了点列**的时刻，收笔后拿来越量停了多久
      // 1.2.0 协同：书写过程中就把这一笔的当前形状推给另一端（对端画在 live 层，不进历史）
      if (GW.netLive) GW.netLive('s', stroke);
      if (inc) {
        GW.inkTrail.point(stroke, boardSoft ? ws.length - 1 - tipFactors.length : undefined);
        if (boardSoft && !softFrame) softFrame = requestAnimationFrame(drawSoft);
        if (predOff) {
          // 优先浏览器前瞻点：它带着系统级的采样时间，比滤波器线性外推准；
          // 拿不到（多数鼠标/老驱动返回空）才退回 ahead 外推。
          let a = null;
          if (predEv) {
            const q = GW.pt(predEv[predEv.length - 1].clientX, predEv[predEv.length - 1].clientY);
            a = { x: q.x, y: q.y };
          }
          if (!a) a = flt.ahead(prof.predict);
          pred = a ? GW.toWorld(a.x, a.y) : null;
          drawPred();
        }
      } else GW.requestLive();
    };
    let off = null;
    if (!inc) {
      off = GW.live.add((ctx, { mark }) => {
        const tmp = Object.assign({}, stroke, ws ? { ws } : null);
        if (ws && ws.length !== stroke.pts.length / 2) return;
        if (mark) { const b = GW.bbox(tmp); mark(b.x, b.y, b.x + b.w, b.y + b.h); }
        GW.drawItem(ctx, tmp);
      });
    }
    // 让位：例如按住笔在尺身上长按要拖动尺子时，把这一笔整体撤掉（不要留下一个墨点）
    const killPred = () => { if (predOff) { predOff(); predOff = null; } pred = null; };
    const unyield = GW.yieldPointer.push(() => {
      if (st.mode !== 'draw') return false;
      st.mode = 'dead';
      if (boardSoft) stopSoft();
      if (off) off();
      killPred();
      let dirty = false;
      if (inc) {
        const d = GW.inkTrail.dirty;
        if (d) { dirty = true; GW.inkTrail.cancel(); }
        else GW.inkTrail.abort();
      }
      GW.requestLive();
      return dirty;
    });
    st.cancel = () => { unyield(); if (off) off(); if (boardSoft) stopSoft(); killPred(); if (GW.netLive) GW.netLive('sx', { id: stroke.id }); if (inc && begun) GW.inkTrail.cancel(); st.mode = 'dead'; };
    if (st.infrared) st.latePalm = (ev) => {
      // shortcut: 早期且未明显移动的接触才能改判，真机有采样记录后再校准窗口。
      if (performance.now() - st.t > 110 || travelledPx > 24 || Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 24) {
        delete st.latePalm;
        return false;
      }
      if (ev.width <= 1 || ev.height <= 1 || touchContact(ev, true) < PN.palmThreshold()) return false;
      st.cancel();
      delete st.cancel; delete st.up; delete st.latePalm;
      if (gestEraseOn('palm')) eraserDown(st, ev, 'palm');
      else palmIgnore(st);
      return true;
    };
    // 出锋影响的那一小块世界矩形 —— 只重画这一小块，代价可以忽略
    // 出锋长度：毛笔比钢笔长（一撇要拖出锋尖），再乘设置里的「出锋长度」倍率。
    // 2.0.4：plain 的 exitLen 本来是 0（直通、不出锋），却被 max(10,…) 兜成 10px 强出锋。
    const exitLen = () => (sty && sty.exitLen === 0) ? 0 : Math.max(10, W * GW.camera.s * (sty ? sty.exitLen : (brush ? 5.2 : 3.2)) *
      GW.clamp((+((GW.settings || {}).penExit) || 1), 0.3, 2));
    const tailBox = () => {
      const P = stroke.pts, n = P.length / 2;
      const exitPx = exitLen();
      let acc = 0, wm = 0, x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (let i = n - 1; i >= 0; i--) {
        if (i < n - 1) acc += Math.hypot(P[2 * i] - P[2 * i + 2], P[2 * i + 1] - P[2 * i + 3]) * GW.camera.s;
        const w = (ws[i] || W) / 2 + W * 0.6 + 3;
        if (w > wm) wm = w;
        if (P[2 * i] < x1) x1 = P[2 * i];
        if (P[2 * i + 1] < y1) y1 = P[2 * i + 1];
        if (P[2 * i] > x2) x2 = P[2 * i];
        if (P[2 * i + 1] > y2) y2 = P[2 * i + 1];
        if (acc > exitPx) break;
      }
      return { x1: x1 - wm, y1: y1 - wm, x2: x2 + wm, y2: y2 + wm };
    };
    st.up = (ev) => {
      // 2.2.3（R7）：抬手时刻。与上方 move 里写的 `_mvT` 同一时基（ts(ev) = timeStamp || now），
      // 两者的差就是「收笔前在笔尖上停了多久」。合成事件没有 timeStamp 时退化成 performance.now()，
      // 也不会因为时基不一致算出负数或超大值（holdOf 里对非有限值/0 已兜底）。
      stroke._upT = ts(ev);
      if (st.infrared && ev.type === 'pointerup') {
        const gap = Math.hypot(ev.clientX - lastRaw.clientX, ev.clientY - lastRaw.clientY);
        // shortcut: 跳过远离末次采样的抬笔坐标，待目标白板实测后校准限距。
        if (gap > 0 && gap <= 72) st.move(ev);
      }
      unyield();
      if (off) off();
      if (boardSoft) stopSoft();
      killPred();
      if (GW.netLive) GW.netLive('sx', { id: stroke.id });   // 这一笔收笔：对端的临时笔迹让位给真正的 op
      if (stroke.pts.length === 2) { stroke.pts.push(stroke.pts[0] + 0.01, stroke.pts[1]); if (ws) ws.push(ws[0]); }
      // 1.3.0：收笔后做一遍「输入整形」——点与宽度各过一次 1-2-1 核。
      // 只作用于已经落纸的这一笔（不回灌书写过程），所以没有延迟代价；
      // 去掉的是手抖造成的高频抖动，配合曲线轮廓，放大后不再是一段段折线。
      // 2.0.4 C：白板速度笔锋（boardWidth）原来绕过整形，红外屏报点抖动原样留在宽度里。
      // boardSoft 有自己的实时软尾，仍保持原样。
      if (ws && !boardSoft && stroke.pts.length > 12 && !snapper) {
        // 2.0.4 C：boardWidth 是白板速度笔锋，点列必须原样留给图形识别
        //（双箭头 / 坐标系靠折线夹角判定），只补宽度滤波；原有路径才同时平滑点列。
        if (!boardWidth) stroke.pts = smoothPts(stroke.pts, 1);
        if (ws.length > 3) {
          // 2.0.4 稳定度：0 ⇒ 一次 (a+2b+c)/4，逐位等价 2.0.3；调高则多遍 + 加大中心权重。
          const sw = IS ? IS.stabWeights(tc ? tc.penStabilize : 0) : { passes: 1, center: 2 };
          for (let pass = 0; pass < sw.passes; pass++) {
            const w2 = ws.slice();
            for (let i = 1; i < ws.length - 1; i++) w2[i] = (ws[i - 1] + sw.center * ws[i] + ws[i + 1]) / (sw.center + 2);
            for (let i = 0; i < w2.length; i++) ws[i] = w2[i];
          }
        }
        GW.invalidate(stroke);
      }
      let tail = null;
      if (ws) {
        if (travelledPx < 3) {
          // 一个顿笔 / 点：不该是个尖，给回满宽。
          // 1.7.1：但也不该是个「很大的圆点」——放大画布写字时 W 跟着相机变大
          // （「笔迹粗细随缩放」或毛笔的 1.7 倍），手一抖留下一个点就是一团墨。
          // 点最多给到笔宽的 2 倍（按屏幕像素算），正常书写路径不受影响。
          const capW = ((cfg.width || 3) * (GW.__tapCapK || 2)) / GW.camera.s;
          const dotW = Math.min(W, capW);
          for (let i = 0; i < ws.length; i++) ws[i] = dotW;
        } else if (!boardSoft) {
          // 出锋：出锋 / 藏锋 / 方切 三型，2.0.4 再加回锋（顿）与平收。
          const exitPx = exitLen();
          // 2.0.3：锋型默认跟着笔种走，手动选过（penTipAuto=false）就听老师的；
          // 2.0.4：只有二级弹层里为这支笔显式配过锋型才覆盖（没配 ⇒ 逐位等价 2.0.3）。
          const autoTip = !!(sty && sty.id !== 'gel' && (GW.settings || {}).penTipAuto !== false);
          const cfgPen = ((GW.settings || {}).penTipCfg || {})[sty ? sty.id : 'gel'];
          const tip = (cfgPen && cfgPen.penTip) ? cfgPen.penTip
            : (autoTip ? sty.tip : ((GW.settings && GW.settings.penTip) || 'sharp'));
          // 2.0.4 B：tipW 永远以 sty.exitW 为锚，只在 [笔种下限, 1] 内调，禁止全局 .12 覆盖。
          const floor = tc ? tc.tipFloor : 0.12;
          const baseW = autoTip ? (sty ? sty.exitW : 0.12)
            : (tip === 'round' ? 0.58 : tip === 'flat' ? 0.86 : 0.12);
          const sharp = cfgPen ? (+cfgPen.penTipSharp || 0) : 0;
          const tipW = Math.max(floor, Math.min(1, baseW - sharp * (baseW - floor)));
          // acc = 从笔尖（最后一个采样点）往回的屏幕距离。先按**当前点**算宽度再累加下一段，
          // 否则采样间距（十几像素）一超过 exitPx 就会在收笔前就 break，尾巴根本收不下去
          // —— 这是 1.6.2 第一版「所有锋型尾巴都是满宽」的根因。
          let acc = 0;
          for (let i = ws.length - 1; i > 0; i--) {
            const k = exitPx > 0 ? Math.min(1, acc / exitPx) : 1;
            // 出锋指数收尖，后两种线性回到 tipW；回锋末端略回粗、平收端边平。
            let t = tip === 'sharp' ? Math.pow(k, 0.72) : k;
            if (tip === 'back') t = 0.25 + 0.75 * Math.pow(k, 0.72);
            else if (tip === 'flatEnd') t = Math.min(1, 0.15 + 1.35 * k);
            const target = W * (tipW + (1 - tipW) * t);
            // 2.0.4 B：配置过的笔不再被 Math.min 一刀切到极细尖，尾段保留笔画自身宽度走向。
            ws[i] = cfgPen ? Math.min(ws[i], Math.max(target, ws[i] * (1 - 0.5 * (1 - t))))
              : Math.min(ws[i], target);
            acc += Math.hypot(stroke.pts[2 * i] - stroke.pts[2 * i - 2], stroke.pts[2 * i + 1] - stroke.pts[2 * i - 1]) * GW.camera.s;
            if (acc > exitPx) break;
          }
        }
        // 出锋改的是「已经画上去的像素」，所以把尾巴那一小块按最终几何重画一遍
        if (!boardSoft) tail = tailBox();
        GW.invalidate(stroke);
      } else if (stroke.pts.length > 6 && !snapper && !inc) stroke.pts = smoothPts(stroke.pts, 1);
      // 1.6.8（R5）：高亮笔在横线纸上吸附到行中心（设置里可关）。只动 y，
      // 且只吸离行线 6 单位以内的点 —— 斜着划过去时不会把整笔拉平。
      if (hl && !snapper && (GW.settings || {}).highlighterSnap !== false) snapHlToLines(stroke);
      // 1.3.5：收笔识别对所有笔一律生效（开关在设置 →「智能笔识别时机」）。
      // 增量绘制那条路也已经把笔迹画上去了，所以识别成功时要**就地改写**这条对象（保 id），
      // 再按包围盒重画一遍；不能像以前那样换一个新对象，否则撤销/协同会拿到两个 id。
      const rec = (!hl && !snapper && GW.settings.smartSnap !== 'off') ? recognize(stroke) : null;
      // 1.7.0（T13）画圈即选中：闭合的一笔、圈里已经有 ≥2 个对象 ⇒ 这一笔不落墨，改当套索。
      // 必须在 if (inc) 之前判定：增量绘制那条路已经把这条笔迹的像素画到墨迹层上了，
      // 晚一步就得再擦一遍（这里直接 renderPartial 按包围盒重画那一块，像素就没了）。
      // 命中时**不写历史**：圈本身不作为一条墨迹存在，撤销栈里也不该多出一条「删圈」。
      if (!hl && !snapper && GW.settings.circleLasso) {
        const picked = GW.__hold.pickCircle(stroke);
        if (picked) {
          if (inc) {
            GW.inkTrail.end(stroke);
            const bb = GW.bbox(stroke);
            if (bb) GW.renderPartial(bb.x - 2, bb.y - 2, bb.x + bb.w + 2, bb.y + bb.h + 2);
          }
          GW.__hold.cancel();
          // 先切工具、再选中：tool.set() 内部会 GW.selection.clear()（见 input.js:23），
          // 顺序反了就白选中，画面上什么都不高亮。
          // 切到选择工具：app.js 的 upd() 只在 tool.current === 'select' 时才显示虚线框与工具条，
          // 停在画笔上的话对象虽然被选中了，画面上却看不到任何反馈（老师会以为没生效）。
          // 套索的语义本来也是「圈住 → 接下来拖它们」，不是「圈完继续画」。
          if (GW.tool.current !== 'select') GW.tool.set('select');
          sel.set(picked);
          GW.bus.emit('stroke-end', stroke);
          GW.requestLive();
          return;
        }
      }
      if (inc) {
        GW.inkTrail.end(stroke);
        // 1.5.6：识别必须发生在唯一一次提交之前。以前先 addItems 原始笔迹、再就地
        // Object.assign 成识别结果 ⇒ 页面是认出来的图形，历史与发给对端的广播仍是原始笔迹。
        let oldBox = null;
        if (rec) {
          const keepId = stroke.id;
          oldBox = GW.bbox(stroke);
          delete stroke.ws; delete stroke.hs; delete stroke.dashStyle; delete stroke.hl;
          Object.assign(stroke, rec, { id: keepId });
          GW.invalidate(stroke);
        }
        GW.addItems([stroke], true, { painted: true });   // 唯一一次提交：内容已是最终几何
        // 1.4.2：书写过程中画的是「逐段直线」（trailSeg），收笔后必须按最终几何重画这一块，
        // 否则这条笔迹会一直停在折线状态 —— 平板网页端（无压感、走增量绘制）尤其明显。
        let bx = null;
        const bb = GW.bbox(stroke);
        if (bb) bx = { x1: bb.x - 2, y1: bb.y - 2, x2: bb.x + bb.w + 2, y2: bb.y + bb.h + 2 };
        if (oldBox) {
          // 识别前那一块也要一起重画，否则原始笔迹的像素会留在纸上
          const ob = { x1: oldBox.x - 2, y1: oldBox.y - 2, x2: oldBox.x + oldBox.w + 2, y2: oldBox.y + oldBox.h + 2 };
          bx = bx ? {
            x1: Math.min(bx.x1, ob.x1), y1: Math.min(bx.y1, ob.y1),
            x2: Math.max(bx.x2, ob.x2), y2: Math.max(bx.y2, ob.y2)
          } : ob;
        }
        if (bx) GW.renderPartial(bx.x1, bx.y1, bx.x2, bx.y2);
        else if (tail) GW.renderPartial(tail.x1, tail.y1, tail.x2, tail.y2);
      } else {
        const out = rec ? rec : stroke;
        if (rec) { if (out.ws) delete out.ws; if (out.hs) delete out.hs; }
        GW.addItems([out]);
      }
      GW.bus.emit('stroke-end', stroke);
      // 1.7.0（T06 / T08）：停笔 300ms 后判「该不该规整成形状」，规整了才弹三选一候选条。
      // 顺序上这一步永远在 T13 之后：T13 命中时上面已经 return，这一笔根本不在文档里。
      GW.__hold.schedule(stroke, rec);
    };
    if (!inc) GW.requestLive();
  }

  // ---- 橡皮 ----
  // 1.5.6：按圆切折线 —— 逐段求与圆的交点，只保留圆外区间。
  // 以前只判「顶点在不在圆内」：两个端点都在圆外的稀疏线段（手写点距 >100px 很常见）
  // 会整条留下，橡皮从线上划过去却擦不掉。切出来的碎片保留原笔的线型与压感宽度。
  function cutByCircle(P, W, cx, cy, rr) {
    const n = P.length / 2;
    if (n < 2) return Math.hypot(P[0] - cx, P[1] - cy) >= rr ? [{ pts: P.slice(), ws: W ? W.slice() : [] }] : [];
    const hasW = !!W && W.length === n;
    const wAt = (i, t) => (hasW ? W[i] + ((W[i + 1] - W[i]) * t) : 0);
    const pieces = [];
    let cur = null, lastX = 0, lastY = 0;
    const begin = (x, y, w) => { cur = { pts: [x, y], ws: hasW ? [w] : [] }; lastX = x; lastY = y; };
    const add = (x, y, w) => { if (!cur) begin(x, y, w); else { cur.pts.push(x, y); if (hasW) cur.ws.push(w); } lastX = x; lastY = y; };
    const flush = () => { if (cur && cur.pts.length >= 4) pieces.push(cur); cur = null; };
    for (let i = 0; i < n - 1; i++) {
      const x0 = P[2 * i], y0 = P[2 * i + 1], x1 = P[2 * i + 2], y1 = P[2 * i + 3];
      const dx = x1 - x0, dy = y1 - y0;
      const fx = x0 - cx, fy = y0 - cy;
      const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - rr * rr;
      const cuts = [];
      if (a > 1e-12) {
        const disc = b * b - 4 * a * c;
        if (disc > 0) {
          const sd = Math.sqrt(disc), t1 = (-b - sd) / (2 * a), t2 = (-b + sd) / (2 * a);
          if (t1 > 0 && t1 < 1) cuts.push(t1);
          if (t2 > 0 && t2 < 1) cuts.push(t2);
          cuts.sort((u, v) => u - v);
        }
      }
      const ks = [0].concat(cuts, [1]);
      for (let k = 0; k < ks.length - 1; k++) {
        const ta = ks[k], tb = ks[k + 1];
        if (tb - ta < 1e-9) continue;
        const tm = (ta + tb) / 2;
        if (Math.hypot(x0 + dx * tm - cx, y0 + dy * tm - cy) < rr) { flush(); continue; }
        const xa = x0 + dx * ta, ya = y0 + dy * ta, xb = x0 + dx * tb, yb = y0 + dy * tb;
        if (cur && Math.hypot(lastX - xa, lastY - ya) < 1e-6) add(xb, yb, wAt(i, tb));
        else { flush(); begin(xa, ya, wAt(i, ta)); add(xb, yb, wAt(i, tb)); }
      }
    }
    flush();
    return pieces;
  }

  function eraserDown(st, e, t) {
    const palm = t === 'palm';
    const mode = palm ? 'area' : tool.eraser.mode;
    const originals = new Map(), created = new Map();
    // 1.1.15：本次擦除里「刚切出来的碎片」再被擦到时，不许记进 originals ——
    // 否则撤销会把中间态的碎片当成原文一起放回来（实测：擦一条笔再撤销，画布上多出 3 段残笔）。
    const transient = new Set();
    // 1.4.4（R2 补漏）：本次擦除里「整段丢弃」的临时碎片。它们在丢掉之前可能已经实时推给过对端
    // （120ms 一次的小批量），而 transient 分支只从 created 里删、不发 remove —— 对端会一直留着
    // 那半截，用户看到的就是「平板擦掉了一截，电脑上还在」。所以记下 id，在后面两条 op 里补 remove。
    const dropped = new Set();
    let rScreen = palm ? Math.max(e.width, e.height) * 0.8 : tool.eraser.size / 2;
    let cur = GW.pt(e.clientX, e.clientY);
    st.mode = 'erase';
    const page = GW.page();
    // 只重画受影响的矩形，而不是每次移动都整屏重画（大屏上这是橡皮流畅的关键）
    const dirty = { x1: 0, y1: 0, x2: 0, y2: 0 };
    let dirtyOn = false;
    const touch = (b) => {
      if (!dirtyOn) { dirty.x1 = b.x; dirty.y1 = b.y; dirty.x2 = b.x + b.w; dirty.y2 = b.y + b.h; dirtyOn = true; return; }
      dirty.x1 = Math.min(dirty.x1, b.x); dirty.y1 = Math.min(dirty.y1, b.y);
      dirty.x2 = Math.max(dirty.x2, b.x + b.w); dirty.y2 = Math.max(dirty.y2, b.y + b.h);
    };
    const flushDirty = () => { if (dirtyOn) { dirtyOn = false; GW.renderPartial(dirty.x1, dirty.y1, dirty.x2, dirty.y2); } };
    // 1.6.7：给页面探针一个稳定的入口（探针没法可靠地合成「按住不动」的橡皮手势）。
    // 只在这一场擦除里有效，抬手就撤掉，免得外部误用。
    GW.eraseAtProbe = (sx, sy) => eraseAt(sx, sy);
    const eraseAt = (sx, sy) => {
      const w = GW.toWorld(sx, sy), r = rScreen / GW.camera.s;
      const items = page.ink.slice();
      let changed = false;
      // 1.7.4（R8）：橡皮按类型筛选（照 GoodNotes 的 eraserEraseTapeSwitch 那一组）。
      // 四个开关分别为：手写墨迹 / 荧光笔迹 / 图形 / 卡片对象。默认全开，行为与 1.7.3 完全一致。
      const EF = Object.assign({ ink: true, hl: true, shape: true, obj: true }, (GW.settings || {}).eraserFilter || {});
      // 1.6.7（T17）：橡皮「整笔擦」模式也能擦对象 —— 对象是整块删，不做部分擦
      // （PDF 卡片、图片、网页这些本来也没法部分擦）。区域擦不动对象，避免滑一下就误删整页 PDF。
      if (mode === 'stroke' && GW.objects && EF.obj) {
        for (const o of page.objs.slice()) {
          if (GW.selection && GW.selection.has(o.id)) continue;
          // 对象的几何就在它自己身上（o.x/o.y/o.w/o.h，见 objects.js 的 layout）。
          // 别用 GW.bbox(o)：那是墨迹包围盒，对卡片对象只会返回一个退化框（{-1,-1,2,2}），
          // 结果就是「在原点附近一按就把全页卡片删光」——第一版实测踩过。
          const b = { x: o.x, y: o.y, w: o.w, h: o.h };
          if (!(b.w > 0 && b.h > 0)) continue;
          const nx = Math.max(b.x, Math.min(w.x, b.x + b.w));
          const ny = Math.max(b.y, Math.min(w.y, b.y + b.h));
          if (Math.hypot(w.x - nx, w.y - ny) > r) continue;
          if (!objGone.has(o.id)) objGone.set(o.id, GW.clone(o));
          const oi = page.objs.indexOf(o);
          if (oi >= 0) { page.objs.splice(oi, 1); GW.objects.unmount(o); }
          touch(b);
          changed = true;
        }
      }
      for (const it of items) {
        // 1.7.4（R8）：按类型筛掉不该擦的条目 —— 判断放在 hitItem 之前，省一次几何求交。
        if (!EF.shape && it.kind === 'shape') continue;
        if (!EF.hl && it.hl) continue;
        if (!EF.ink && !it.hl && it.kind !== 'shape') continue;
        if (!hitItem(it, w.x, w.y, r)) continue;
        touch(GW.bbox(it));
        const idx = page.ink.indexOf(it);
        if (idx < 0) continue;
        // 1.5.6：本次擦除自己切出来的碎片，再次被圆压到时也必须按圆继续切，
        // 不能整段删掉 —— 以前手指只是从碎片的一端滑过去，整块残段就没了。
        // 碎片没有「原文」可还原：原笔在第一次切开时已经记进 originals，所以它自己不进历史。
        const transientIt = transient.has(it.id);
        // 1.1.15：整笔擦（或图形整体擦）——
        if (mode === 'stroke' || (it.kind === 'shape' && it.type !== 'poly')) {
          if (!originals.has(it.id)) originals.set(it.id, GW.clone(it));
          created.delete(it.id);
          page.ink.splice(idx, 1);
          changed = true;
          continue;
        }
        // 区域擦：按圆把折线切开（逐段求交，稀疏点列也能正确断开）
        let P = it.pts, W = it.ws;
        if (it.kind === 'shape') { const d = densify(it.pts, it.closed, (it.width || 2) * 0.8); P = d; W = null; }
        const rr = r + (it.width || 2) / 2;
        const pieces = cutByCircle(P, W, w.x, w.y, rr);
        // 1.1.15：一个点都没抹掉（只是擦到笔画边上的描边宽度）就什么都别做。
        // 以前这里会「删了原笔、再加回一条一模一样的碎片」，本地看不出、对端却收到一对
        // remove/add —— 平板那边闪一下、历史里多一条空操作，看起来就像擦除同步乱套。
        if (pieces.length === 1 && it.kind !== 'shape') {
          const q = pieces[0].pts;
          if (q.length === it.pts.length) {
            let same = true;
            for (let i = 0; i < q.length; i++) if (Math.abs(q[i] - it.pts[i]) > 1e-6) { same = false; break; }
            if (same) continue;
          }
        }
        if (!transientIt && !originals.has(it.id)) originals.set(it.id, GW.clone(it));
        created.delete(it.id);
        page.ink.splice(idx, 1);
        if (transientIt) transient.delete(it.id);
        // 1.5.6：碎片被继续切开时，它自己也会从页面上消失 —— 对端收到过它，就必须补一条 remove。
        // 以前只有「整段丢弃」才补 remove，重新切开的那条在对面永远留着（拖动擦除后多出半截）。
        if (transientIt && sentA.has(it.id)) dropped.add(it.id);
        if (!pieces.length) {
          if (sentA.has(it.id)) dropped.add(it.id);
          changed = true;
          continue;
        }
        const frags = pieces.map((pc) => {
          const f = { id: GW.uid(), kind: 'stroke', pts: pc.pts, color: it.color, width: it.width };
          // 1.5.6：碎片必须继承线型/透明度/荧光笔标记，否则虚线笔迹一擦就变成实线
          for (const k of ['hl', 'dashStyle', 'alpha']) if (it[k] != null) f[k] = it[k];
          if (pc.ws && pc.ws.length === pc.pts.length / 2) f.ws = pc.ws;
          return f;
        });
        page.ink.splice(idx, 0, ...frags);
        frags.forEach((f) => {
          created.set(f.id, f);
          transient.add(f.id);
          fragIdx.set(f.id, page.ink.indexOf(f));   // 1.4.4（R4）：发给对端时插回原位
          touch(GW.bbox(f));
        });
        changed = true;
      }
      if (changed) flushDirty();
    };
    // 1.4.2：擦除也要「实时同步」。以前只有抬手时 commit 一条 op，对端要等整段擦完才看到 ⇒
    // 用户看到的现像是「一边擦、另一边纹丝不动」。这里把擦除结果按 120ms 的节奏小批量推给对端
    // （只推增量：新被擦掉的原文 + 新产生的碎片），对端走 applyRemote 就地替换，不进它的历史。
    const sentR = new Set(), sentA = new Set(), sentDrop = new Set();
    const objGone = new Map();   // 1.6.7（T17）：本次擦掉的对象（整块删，进同一条历史）
    // 1.4.4（R4）：碎片下发时必须带上「它在本机数组里的位置」。以前只发内容，对端无处可插
    // 就 push 到最末 —— 两端内容一样、叠压关系不同，而指纹只折 id 集合、永远判成一致，
    // 于是「这边擦干净了、那边还有一条线压在上面」永远不会自愈。
    // _index 只放在**发出去的副本**上：本地对象保持干净，.gewu 不会多出这个字段。
    const fragIdx = new Map();
    const withIdx = (f) => {
      const o = {};
      for (const k in f) o[k] = f[k];
      const i = fragIdx.get(f.id);
      if (i != null) o._index = i;
      return o;
    };
    let liveTimer = 0;
    const flushLiveErase = () => {
      liveTimer = 0;
      if (!GW.syncEmit) return;
      const rem = [], add = [];
      for (const [id, it] of originals) if (!sentR.has(id)) { sentR.add(id); rem.push(it); }
      for (const [id, f] of created) if (!sentA.has(id) && page.ink.indexOf(f) >= 0) { sentA.add(id); add.push(withIdx(f)); }
      // 已经推给对端、这次又被整段丢掉的临时碎片：补一条只带 id 的 remove（对端按 id 删）
      for (const id of dropped) if (!sentDrop.has(id)) { sentDrop.add(id); rem.push({ id }); }
      if (rem.length || add.length) GW.syncEmit({ pageId: page.id, remove: rem, add: add });
    };
    const scheduleLiveErase = () => {
      if (!GW.syncEmit || liveTimer) return;
      liveTimer = setTimeout(flushLiveErase, 120);
    };
    // 光圈过去画在**全屏实时层**上（GW.live.add）⇒ 整个擦除过程那块层都在参与合成，
    // 教室 4K 软件渲染下这就是最大的一笔开销（板子自己留档：撤出该层书写 30→59fps）。
    // 改成一个 DOM 圆圈：零 canvas 指令、零 clearRect，合成面积只有圆本身。
    const ring = document.getElementById('erase-ring');
    const paintRing = () => {
      if (!ring) return;
      const d = Math.max(8, rScreen * 2);
      // 真正擦除时用实心一档（悬停预览是淡的，见 #erase-ring.hover）
      ring.classList.remove('hover');
      ring.style.display = 'block';
      ring.style.width = d.toFixed(1) + 'px';
      ring.style.height = d.toFixed(1) + 'px';
      ring.style.transform = 'translate3d(' + (cur.x - rScreen).toFixed(1) + 'px,' + (cur.y - rScreen).toFixed(1) + 'px,0)';
    };
    const hideRing = () => { if (ring) ring.style.display = 'none'; };
    let lx = cur.x, ly = cur.y;
    eraseAt(lx, ly);
    scheduleLiveErase();
    paintRing();
    st.move = (ev) => {
      if (palm && ev.width) rScreen = Math.max(rScreen, Math.max(ev.width, ev.height) * 0.8);
      const q = GW.pt(ev.clientX, ev.clientY);
      // 插值，避免快速移动时漏擦
      const d = Math.hypot(q.x - lx, q.y - ly), steps = Math.ceil(d / (rScreen * 0.5));
      for (let k = 1; k <= steps; k++) eraseAt(lx + ((q.x - lx) * k) / steps, ly + ((q.y - ly) * k) / steps);
      lx = q.x; ly = q.y; cur = { x: lx, y: ly };
      paintRing();
      scheduleLiveErase();
    };
    // 1.1.15：抬手与「被系统打断」（掌压/来电/指针取消）走同一条收尾路径。
    // 以前 cancel 只把光圈藏起来：擦除结果留在本机、既没 commit 也没同步 —— 两端从此不一致。
    const finish = (commit) => {
      hideRing();
      if (liveTimer) { clearTimeout(liveTimer); liveTimer = 0; }
      flushLiveErase();
      if (!originals.size && !dropped.size && !objGone.size) return;
      const rem = [...originals.values()].concat([...objGone.values()]);
      // 1.4.4（R2）：碎片必须跟着权威 op 一起走。实时增量没有 ack（队列失败 30 次 / 60 秒整条丢），
      // 只发 remove 的话，对端就永久少一块 —— 用户看到的就是「有一部分怎么擦都擦不掉」。
      const add = [...created.values()].filter((f) => page.ink.includes(f)).map(withIdx);
      // 增量已经在对端实时擦除里推过了：这条只进本地历史，不再整份重发一遍
      // （重发在长笔画上能到几百 KB，会把后续 op 堵在队列里 —— 就是「越擦越不同步」的来源）
      GW.commit({ remove: rem, add: add }, { silent: true });
      // 1.1.16（R2）：增量流没有 ack，中间丢一条，对端就永久缺一块（客户端队列失败 30 次
      // 或 60 秒会整条丢弃，见 lansync.js 的 pump）。所以收尾必须再补一条**权威 op**：
      // remove 只带 id（applyRemote 走 removeRaw(page, it.id)，不读别的字段）；
      // 1.4.4（R2）：add 侧允许带碎片（几十字节/段）—— 把丢掉的增量在这一条里补齐。
      if (GW.syncEmit && (rem.length || dropped.size)) {
        const rm = rem.map((it) => ({ id: it.id })).concat([...dropped].map((id) => ({ id })));
        GW.syncEmit({ pageId: page.id, remove: rm, add });
      }
    };
    st.cancel = () => finish(true);
    st.up = () => finish(true);
  }
  function densify(p, closed, step) {
    const out = [];
    const P = closed ? p.concat([p[0], p[1]]) : p;
    for (let i = 0; i < P.length - 2; i += 2) {
      const d = Math.hypot(P[i + 2] - P[i], P[i + 3] - P[i + 1]), n = Math.max(1, Math.ceil(d / step));
      for (let k = 0; k < n; k++) out.push(P[i] + ((P[i + 2] - P[i]) * k) / n, P[i + 1] + ((P[i + 3] - P[i + 1]) * k) / n);
    }
    out.push(P[P.length - 2], P[P.length - 1]);
    return out;
  }

  // ---- 图形 ----
  function shapeDown(st, e) {
    const p0 = TW(e);
    let shp = null;
    st.mode = 'shape';
    const off = GW.live.add((ctx, { mark }) => {
      if (!shp) return;
      [].concat(shp).forEach((s) => {
        if (mark) { const b = GW.bbox(s); mark(b.x, b.y, b.x + b.w, b.y + b.h); }
        GW.drawItem(ctx, s);
      });
    });
    st.move = (ev) => {
      const p = TW(ev);
      shp = makeShape(tool.shape.type, p0.x, p0.y, p.x, p.y);
      GW.requestLive();
    };
    st.cancel = off;
    st.up = () => {
      off();
      if (!shp) return;
      const arr = [].concat(shp);
      const b = GW.bbox(arr[0]);
      if (b.w < 6 / GW.camera.s && b.h < 6 / GW.camera.s) return;
      GW.addItems(arr);
    };
  }

  // ---- 文本 ----
  function textDown(st, e) {
    st.mode = 'text';
    const p = TW(e);
    st.up = () => {
      // 点到已有文本 → 编辑
      const hit = GW.page().objs.slice().reverse().find((o) => (o.type === 'text' || o.type === 'formula') && p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h);
      if (hit) { if (hit.type === 'text') hit._inst.startEdit(); else GW.formulaEditor(hit); return; }
      if (document.activeElement && document.activeElement.isContentEditable) { document.activeElement.blur(); return; }
      const size = tool.text.size / GW.camera.s;
      GW.objects.create('text', { html: '', size, color: tool.pen.color, note: tool.text.note ? '#fff4b8' : null }, { x: p.x, y: p.y - size * 0.7, w: Math.max(size * 8, tool.text.note ? size * 8 : 0), h: size * (tool.text.note ? 4 : 1.5), record: false, exact: true, autoEdit: true });
    };
  }

  // ---- 激光笔 ----
  // 画法仍是「实时层 + Path2D」，但轨迹、颜色、模式都按笔设置走：
  //   · 颜色/线宽在落笔那一刻记进 trail，之后改设置不影响已经画出去的笔迹；
  //   · demo 模式按「每个点 1.1 秒」逐段消失；
  //   · formula 模式不按点计时，而是看「本机最后一次落笔/sx」过了多久：
  //     停笔 hold 秒后，所有 formula 轨迹一起在 1.2 秒内淡出，期间再落笔就整体复活。
  const laserTrails = [];
  GW.__laserTrails = laserTrails;   // 探针只读出口（激光笔的逐点笔宽）
  let laserOff = null;
  let laserInkAt = 0;          // 最后一次 formula 落笔的时间
  const LASER_LIFE = 1100;     // demo：单点存活
  const LASER_FADE = 1200;     // formula：整体淡出时长
  const LASER_MAX_PTS = 24000; // 防长时板书把内存吃穿（约 8000 个点）

  function laserRGB(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return [255, 45, 85];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function laserMix(r, g, b, a) {
    // 亮芯颜色：向白色靠 55%
    return 'rgba(' + Math.round(r + (255 - r) * 0.55) + ',' + Math.round(g + (255 - g) * 0.55) + ',' + Math.round(b + (255 - b) * 0.55) + ',' + a + ')';
  }
  function laserAlpha(now) {
    const L = tool.laser;
    const hold = Math.max(1, Math.min(30, Number(L.hold) || 4)) * 1000;
    const idle = now - (laserInkAt || now);
    if (idle <= hold) return 1;
    return Math.max(0, 1 - (idle - hold) / LASER_FADE);
  }

  function paintLaser(ctx, tr, alpha, k, glow) {
    const P = tr.pts;
    if (!P.length) return;
    const n = P.length;
    const w = Math.max(1, Math.min(40, Number(tr.width) || 6));
    const [r, g, b] = laserRGB(tr.color);
    // 有逐点宽度时用「变宽轮廓」填充（和钢笔画出来的形状一致），否则退回等宽描边
    const tapered = !!(tr.ws && tr.ws.length === n / 3);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.globalAlpha = alpha;
    if (tapered) {
      const Ls = [], Rs = [];
      for (let i = 0; i < n; i += 3) {
        const j = Math.min(n - 3, i + 3);
        const p0x = P[i], p0y = P[i + 1], p1x = P[j], p1y = P[j + 1];
        let dx = p1x - p0x, dy = p1y - p0y;
        const dl = Math.hypot(dx, dy) || 1;
        const hw = Math.max(0.35, tr.ws[i / 3]) / 2;
        const nx = -dy / dl, ny = dx / dl;
        Ls.push(p0x + nx * hw, p0y + ny * hw);
        Rs.push(p0x - nx * hw, p0y - ny * hw);
      }
      const op = new Path2D();
      op.moveTo(Ls[0], Ls[1]);
      for (let i = 2; i < Ls.length; i += 2) op.lineTo(Ls[i], Ls[i + 1]);
      for (let i = Rs.length - 2; i >= 0; i -= 2) op.lineTo(Rs[i], Rs[i + 1]);
      op.closePath();
      if (glow) {
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.16)';
        ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.16)';
        ctx.lineWidth = 6 / k; ctx.stroke(op); ctx.fill(op);
      }
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.92)';
      ctx.fill(op);
    } else {
      const path = new Path2D();
      path.moveTo(P[0], P[1]);
      for (let i = 3; i < n; i += 3) path.lineTo(P[i], P[i + 1]);
      if (glow) { ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.20)'; ctx.lineWidth = (w * 2.33) / k; ctx.stroke(path); }
      ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.92)'; ctx.lineWidth = w / k; ctx.stroke(path);
    }
    // 亮芯：只描尾段，用沿轨迹方向的渐变，一次 stroke
    const i0 = Math.max(0, n - 30);
    if (i0 < n - 3) {
      const tail = new Path2D();
      tail.moveTo(P[i0], P[i0 + 1]);
      for (let i = i0 + 3; i < n; i += 3) tail.lineTo(P[i], P[i + 1]);
      const gr = ctx.createLinearGradient(P[i0], P[i0 + 1], P[n - 3], P[n - 2]);
      gr.addColorStop(0, laserMix(r, g, b, 0));
      gr.addColorStop(1, laserMix(r, g, b, 0.55));
      ctx.strokeStyle = gr;
      ctx.lineWidth = (w * 0.83) / k;
      ctx.stroke(tail);
    }
    // 笔头：两个不带模糊的同心圆（shadowBlur 会把软件渲染的实时层推进慢路径）。
    // 1.1.15：只在**还在写**的时候画。以前抬手后这个白点一直留在轨迹末端，
    // 看起来就是「笔迹断一下、原地多出一个点」，临时板书尤其明显（要等 hold 秒才淡）。
    const lx = P[n - 3], ly = P[n - 2];
    if (!tr.done) {
      if (glow) { ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.30)'; ctx.beginPath(); ctx.arc(lx, ly, (w * 1.83) / k, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(lx, ly, (w * 0.83) / k, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  function clearLaser() {
    if (!laserTrails.length) return;
    laserTrails.length = 0;
    laserInkAt = 0;
    if (laserOff) { laserOff(); laserOff = null; }
    GW.requestLive();
  }

  function laserDown(st, e) {
    st.mode = 'laser';
    const L = tool.laser;
    const now = performance.now();
    // 1.6.2：激光笔不再是一根固定 6px 的粗线 —— 它和钢笔共用同一套「速度/压感 → 笔宽」，
    // 也有入锋与收锋，老师用激光笔写的字才和钢笔字迹一致。宽窄存在 trail.ws 里逐点画。
    const trail = { id: GW.uid(), pts: [], ws: [], done: false, color: L.color || '#ff2d55', width: L.width || 6, mode: L.mode === 'formula' ? 'formula' : 'demo', v: 0, t2: 0, lx: null, ly: null };
    laserTrails.push(trail);
    if (trail.mode === 'formula') laserInkAt = now;
    // 1.1.15：激光笔也要同步 —— 老师指的地方，平板上必须同时亮起来，否则「临时板书」只有一半人看得到。
    // 只发世界坐标的两个分量（时间戳是本机时钟，发给对端没有意义），点多了按步长抽稀。
    let netAt = 0;
    const netLsr = (done) => {
      if (!GW.netLive) return;
      const t2 = performance.now();
      if (!done && t2 - netAt < 33) return;
      netAt = t2;
      const S = trail.pts, out = [];
      const np = Math.floor(S.length / 3);
      const step = Math.max(1, Math.ceil(np / 400));
      for (let i = 0; i < np; i += step) out.push(S[3 * i], S[3 * i + 1]);
      const last = 3 * (np - 1);
      if (np > 0 && (out.length < 2 || out[out.length - 2] !== S[last])) out.push(S[last], S[last + 1]);
      GW.netLive('lsr', { k: 'lsr', id: trail.id, pts: out, color: trail.color, width: trail.width, mode: trail.mode, done: !!done });
    };
    const add = (ev) => {
      const p = TW(ev);
      const now2 = performance.now();
      // 与钢笔同一套笔宽：有真压感就按压感，红外屏按速度（快收细、慢饱满），
      // 起笔前 8 个屏幕像素做入锋（由细到满宽），收锋在抬手时统一收。
      const dt = Math.max(1, now2 - (trail.t2 || now2));
      const dpx = trail.lx == null ? 0 : Math.hypot(p.x - trail.lx, p.y - trail.ly) * GW.camera.s;
      trail.v += ((dpx / dt) - trail.v) * (1 - Math.exp(-dt / 39));
      const pw = ev.pressure > 0 && ev.pressure !== 0.5 ? GW.clamp(ev.pressure, 0.02, 1) : 0;
      const m = pw ? 0.30 + pw * 1.50 : GW.clamp(1.18 - trail.v * 0.34, 0.42, 1.18);
      const travelled = trail.pts.length ? Math.hypot(p.x - trail.pts[0], p.y - trail.pts[1]) * GW.camera.s : 0;
      const entry = Math.max(3, (tool.pen.width || 2) * GW.camera.s * 2.4);
      const g = travelled >= entry ? 1 : 0.34 + 0.66 * (travelled / entry);
      trail.ws.push((tool.pen.width || 2) * m * g);
      trail.t2 = now2; trail.lx = p.x; trail.ly = p.y;
      trail.pts.push(p.x, p.y, now2);
      if (trail.pts.length > LASER_MAX_PTS) trail.pts.splice(0, trail.pts.length - LASER_MAX_PTS);
      if (trail.mode === 'formula') laserInkAt = performance.now();
      netLsr(false);
      GW.requestLive();
    };
    add(e);
    if (!laserOff) laserOff = GW.live.add((ctx, { mark }) => {
      const t = performance.now();
      const k = GW.camera.s;
      const glow = !GW.perf || GW.perf.glow;
      const fa = laserAlpha(t);
      let alive = false;
      for (let ti = laserTrails.length - 1; ti >= 0; ti--) {
        const tr = laserTrails[ti], P = tr.pts;
        let alpha = 1;
        if (tr.mode === 'formula') {
          alpha = fa;
          if (alpha <= 0) { laserTrails.splice(ti, 1); continue; }
        } else {
          while (P.length && t - P[2] > LASER_LIFE) P.splice(0, 3);
          // 笔还在写、老点已过期：轨迹暂时为空但必须继续订阅实时层，
          // 否则抬手后没人负责把它从数组里删掉（会留一条永远画不出来的死轨迹）
          if (!P.length) { if (tr.done) laserTrails.splice(ti, 1); else alive = true; continue; }
        }
        alive = true;
        if (mark) {
          let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
          for (let i = 0; i < P.length; i += 3) { x1 = Math.min(x1, P[i]); y1 = Math.min(y1, P[i + 1]); x2 = Math.max(x2, P[i]); y2 = Math.max(y2, P[i + 1]); }
          const pad = 16 / k;
          mark(x1 - pad, y1 - pad, x2 + pad, y2 + pad);
        }
        paintLaser(ctx, tr, alpha, k, glow);
      }
      if (!alive) { laserOff && laserOff(); laserOff = null; }
      return alive;
    });
    st.move = add;
    st.up = () => {
      trail.done = true;
      // 收锋：尾部按屏幕像素长度渐细，和钢笔画出来的「尖」一致
      if (trail.ws.length > 3) {
        const exitPx = Math.max(12, (tool.pen.width || 2) * GW.camera.s * 3.4);
        let acc = 0;
        for (let i = trail.ws.length - 1; i > 0; i--) {
          const k = Math.min(1, acc / exitPx);
          trail.ws[i] = Math.min(trail.ws[i], (trail.ws[0] || 2) * (0.12 + 0.88 * Math.pow(k, 0.72)));
          acc += Math.hypot(trail.pts[3 * i] - trail.pts[3 * (i - 1)], trail.pts[3 * i + 1] - trail.pts[3 * (i - 1) + 1]) * GW.camera.s;
          if (acc > exitPx) break;
        }
      }
      if (trail.mode === 'formula') laserInkAt = performance.now();
      netLsr(true);
    };
    // 1.1.15：pointercancel（笔尖被系统抢走、多指切工具）以前没有收尾，轨迹永远 done=false，
    // 笔头白点就一直停在断点上。这里把轨迹直接丢掉并请求重画实时层。
    st.cancel = () => {
      trail.done = true;
      if (GW.netLive) GW.netLive('lsr', { k: 'lsr', id: trail.id, gone: true });
      const i = laserTrails.indexOf(trail);
      if (i >= 0) laserTrails.splice(i, 1);
      if (trail.mode === 'formula') laserInkAt = performance.now();
      if (!laserTrails.length && laserOff) { laserOff(); laserOff = null; }
      GW.requestLive();
    };
  }

  // 切页时激光笔迹不该跟着跑到新页上（它不属于任何一页，是临时标记）
  GW.bus.on('page', clearLaser);
  // 探针入口：scripts/probe-laser.js 用它验证两种模式与颜色/线宽
  // 1.1.16：paint 给 lansync.js 的「远端激光」复用 —— 两端激光笔的笔画必须长得一模一样，
  // 复制一份到接收端只会上演「同一套算法两处漂移」。
  GW.laser = {
    count: () => laserTrails.length,
    clear: clearLaser,
    paint: paintLaser,
    info: () => laserTrails.map((tr) => ({ mode: tr.mode, color: tr.color, width: tr.width, pts: tr.pts.length / 3, done: tr.done })),
  };

  // ---------- 选择 ----------
  const sel = (GW.selection = {
    items: [],
    // WP5：多选「组旋转中心」。选区级状态（随选区重建清空），不进文档历史、不污染各对象自己的 pv。
    groupPivot: null,
    groupPivotOn: false,
    clear() { this.items = []; this.groupPivot = null; this.groupPivotOn = false; this.render(); },
    set(items) {
      // 1.6.6（T06）：组内任一项被选中 = 整组一起选中。组的实现见下面 GW.groupSelection 的注释：
      // 只在条目上打 gid，不新增容器对象，所以「整组」这件事唯一要改的就是这个入口。
      const page = GW.page();
      const all = page.ink.concat(page.objs);
      const out = [];
      for (const it of items) {
        if (!it) continue;
        if (it.gid) for (const sib of all) if (sib.gid === it.gid && !out.includes(sib)) out.push(sib);
        if (!out.includes(it)) out.push(it);
      }
      this.items = out;
      this.groupPivot = null; this.groupPivotOn = false;   // WP5：新选区重置组旋转中心
      this.render();
    },
    has(id) { return this.items.some((i) => i.id === id); },
    // 1.6.6（T01 顺带）：撤销/重做之后，选区里可能还挂着已经被删掉的条目（例：撤销一次「贴胶带」）。
    // 不摘掉的话那圈虚线框留在原地、还能被拖动与删除 —— 拖的是一份已经不在文档里的数据。
    // F27：撤销/重做与远端对象替换都是「用新实体换掉页面数组里的旧对象」（applyOp 与 applyRemote
    // 都走 GW.clone）。选区里存的是旧引用，只按 id 判断「还在不在」会留着那份已脱离文档的对象 ⇒
    // 之后改色/改样式写到它身上：页面没变、选区却变了。这里按 id 重绑到当前页里的实体。
    prune() {
      const page = GW.page();
      const byId = new Map();
      for (const i of page.ink) byId.set(i.id, i);
      for (const i of page.objs) byId.set(i.id, i);
      let changed = false;
      const keep = [];
      for (const it of this.items) {
        if (!it) { changed = true; continue; }
        const cur = byId.get(it.id);
        if (!cur) { changed = true; continue; }   // 1.6.6（T01）：已经不存在的条目摘掉
        if (cur !== it) changed = true;           // F27：换成页面里的那个实体
        keep.push(cur);
      }
      if (!changed) return false;
      this.items = keep; this.render();
      return true;
    },
    bounds() {
      if (!this.items.length) return null;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const it of this.items) {
        const b = it.kind === 'obj' ? { x: it.x, y: it.y, w: it.w, h: it.h } : GW.bbox(it);
        x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
      }
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    },
    // 虚线框 / 实时高亮专用的盒：在几何包围盒之外，再把对象卡片浮在盒外的那两块算进来 ——
    // 标题栏（.obj-head，40 屏幕 px 高，挂在盒子正上方）与右下角缩放手柄（.obj-resize，伸出 ~14px）。
    // 只拿 {x,y,w,h} 的时候它们露在虚线框外（「虚线框要框住整个形状」对所有项目都适用）。
    // 墨迹项目不需要这层：GW.bbox 已经含描边宽度、变宽笔锋、模板标注与坐标轴轴名。
    // 注意 transformSel 仍用 bounds()，避免缩放锚点被这圈屏幕尺寸带偏。
    displayBounds() {
      const b = this.bounds();
      if (!b) return null;
      if (!this.items.some((i) => i.kind === 'obj')) return b;
      // up = 标题栏高度（1.0.16 由 40 改 46）、out = 右下角手柄外伸（14 → 16）
      const s = GW.camera.s || 1, up = 46 / s, out = 16 / s;
      return { x: b.x, y: b.y - up, w: b.w + out, h: b.h + up + out };
    },
    render() { GW.bus.emit('selection', this.items); GW.requestLive(); },
  });
  let lassoPts = null;
  GW.live.add((ctx, { mark }) => {
    if (lassoPts && lassoPts.length > 2) {
      ctx.setLineDash([6 / GW.camera.s, 5 / GW.camera.s]);
      ctx.strokeStyle = '#0f9d8a'; ctx.lineWidth = 1.6 / GW.camera.s; ctx.fillStyle = 'rgba(15,157,138,0.07)';
      const P = new Path2D(); P.moveTo(lassoPts[0], lassoPts[1]);
      let x1 = lassoPts[0], y1 = lassoPts[1], x2 = x1, y2 = y1;
      for (let i = 2; i < lassoPts.length; i += 2) {
        P.lineTo(lassoPts[i], lassoPts[i + 1]);
        x1 = Math.min(x1, lassoPts[i]); y1 = Math.min(y1, lassoPts[i + 1]);
        x2 = Math.max(x2, lassoPts[i]); y2 = Math.max(y2, lassoPts[i + 1]);
      }
      P.closePath(); ctx.fill(P); ctx.stroke(P);
      if (mark) { const pad = 4 / GW.camera.s; mark(x1 - pad, y1 - pad, x2 + pad, y2 + pad); }
    }
    // 选中墨迹的高亮
    if (sel.items.length) {
      ctx.globalAlpha = 0.35;
      for (const it of sel.items) if (it.kind !== 'obj') {
        // 数学图形旋转后由 #sel-ui 画随旋转的虚线框，这里再画一层轴对齐高亮会出现「双框」。
        if (((it.type === 'ms' || it.type === 'pb') && it.rot) || it._rot) continue;
        const b = GW.bbox(it);
        if (mark) mark(b.x, b.y, b.x + b.w, b.y + b.h);
        // 1.7.0（T03）：画布上这圈高亮与 #sel-ui 的虚线框必须同一屏幕宽度。
        // 实测（probe-sel-chrome 的标定）：Chromium 会把 CSS border 的 1.5px 向下取整成 1px，
        // 所以屏幕上真正看到的虚线框是 1px —— 这里就画 1 屏幕 px，两边才对得上
        // （画 1.5 会让 probe-livelayer 的「高亮是否压在图形真实屏幕位置」偏到 2.4px）。
        ctx.strokeStyle = '#0f9d8a'; ctx.lineWidth = 1 / GW.camera.s; ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
    }
  });

  function hitTop(w) {
    const tol = screenTol(8);
    const page = GW.page();
    const objs = page.objs.slice().sort((a, b) => (b.z || 0) - (a.z || 0));
    // 墨迹画在对象上方，先测墨迹
    for (let i = page.ink.length - 1; i >= 0; i--) {
      const it = page.ink[i];
      // 图形（含学科模板、尺规画出的弧）整块都能点：虚线框圈住哪一块，点框里的任意位置就选中它。
      // 手写笔迹不走这条（一条斜线的包围盒会把大片空白都吃掉），仍按描边命中。
      if (it.kind === 'shape') {
        const b = GW.bbox(it);
        if (w.x >= b.x - tol && w.x <= b.x + b.w + tol && w.y >= b.y - tol && w.y <= b.y + b.h + tol) return it;
      }
      if (hitItem(it, w.x, w.y, tol)) return page.ink[i];
    }
    for (const o of objs) if (w.x >= o.x && w.x <= o.x + o.w && w.y >= o.y - screenTol(36) && w.y <= o.y + o.h) return o;
    return null;
  }

  function selectDown(st, e) {
    const w = TW(e);
    // 物理图形自带的把手（滑动变阻器的滑片这一类）：只对一个已选中的图形生效，
    // 命中区外一律走原来的整体拖动。拖动期间不改框，所以每帧只让这个图形失效重画。
    const one = sel.items.length === 1 ? sel.items[0] : null;
    const HD = one && one.type === 'pb' && GW.physShapes && GW.physShapes.projHandles && GW.physShapes.projHandles[one.key];
    if (HD && HD.hit(one, w.x, w.y)) {
      const before = GW.clone(one);
      let moved = false;
      st.mode = 'transform';
      GW.pbDrag = true;
      st.move = (ev) => {
        const p = TW(ev);
        if (!HD.drag(one, p.x, p.y)) return;
        moved = true;
        GW.invalidate(one);
        GW.requestRender();
        if (HD.param && GW.syncParam) GW.syncParam(one, HD.param);
      };
      st.up = () => {
        // 整段拖动只记一步撤销（每次 mousemove 都 commit 会把历史刷爆）。
        // pbDrag 要等 commit 之后才放下：参数面板就是靠这个标志避免被这次提交关掉。
        try { if (moved) GW.commit({ update: [{ before, after: one }] }); } finally { GW.pbDrag = false; }
        if (GW.pbPopRebase) GW.pbPopRebase(one);
      };
      st.cancel = () => { GW.pbDrag = false; };
      return;
    }
    const b = sel.bounds();
    // 已经选中一个「锁定」对象时，落在它的框里应当直接起笔/平移，而不是反复走一次「不能移动」的提示
    const bAllLocked = sel.items.length > 0 && sel.items.every((i) => i.kind === 'obj' && i.locked);
    if (b && !bAllLocked && w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h) return GW.transformSel(st, e, 'move');
    const hit = hitTop(w);
    if (hit) {
      const only = sel.items.length === 1 && sel.items[0] === hit;
      // 锁定的对象：不抢指针，交给画布（笔迹画在它上方 / 拖动移动整块画布）
      if (hit.kind === 'obj' && hit.locked) {
        if (only) return;
        sel.set([hit]);
        return;
      }
      sel.set([hit]);
      return GW.transformSel(st, e, 'move');
    }
    sel.clear();
    st.mode = 'lasso';
    lassoPts = [w.x, w.y];
    st.move = (ev) => { if (!lassoPts) return; const p = TW(ev); lassoPts.push(p.x, p.y); GW.requestLive(); };
    st.cancel = () => { lassoPts = null; GW.requestLive(); };
    st.up = () => {
      const L = lassoPts; lassoPts = null;
      if (!L || L.length < 6) return GW.requestLive();
      const page = GW.page(), res = [];
      for (const it of page.ink) {
        // 学科模板没有 pts，用包围盒中心判（与下面 page.objs 的做法一致）；
        // 物理图形也没有 pts（几何在库的 draw 里），同样按包围盒中心判。
        if (it.segs || it.type === 'pb') { const bb = GW.bbox(it); if (pointInPoly(bb.x + bb.w / 2, bb.y + bb.h / 2, L)) res.push(it); continue; }
        const P = it.pts; let inside = 0, tot = 0;
        for (let i = 0; i < P.length; i += 2 * Math.max(1, Math.floor(P.length / 40))) { tot++; if (pointInPoly(P[i], P[i + 1], L)) inside++; }
        if (tot && inside / tot >= 0.5) res.push(it);
      }
      // 对象（导入的 PDF 册子 / 图片 / 课件卡片 / 仿真）按「碰到就选」：
      // 以前只认中心点，导入的一整页比框大得多，框不满就选不上，老师只能整页圈进来。
      for (const o of page.objs) {
        if (pointInPoly(o.x + o.w / 2, o.y + o.h / 2, L)
          || pointInPoly(o.x, o.y, L) || pointInPoly(o.x + o.w, o.y, L)
          || pointInPoly(o.x, o.y + o.h, L) || pointInPoly(o.x + o.w, o.y + o.h, L)) res.push(o);
      }
      sel.set(res);
    };
  }

  // 把仿射矩阵 M=[a,b,c,d,e,f]（x' = a·x + c·y + e，y' = b·x + d·y + f）施加到 items 上。
  // items 与 befores（GW.clone 过的快照）一一对应。返回被处理的条目数。
  // UI 拖动（GW.transformSel）和程序化命令（GW.transformSelection）都走这一份：
  // 各类型图形的搬运规则（pts / segs / parts / texts / ann / ticks / rot / _rot、线宽不随缩放变）
  // 只写一遍，别再抄第二份 —— 抄出来的那份总会在某条支路上漏掉 _rw/_rh 或 parts。
  /* PURE-BEGIN xformPoint */
  // 纯函数：把世界点 p 过一遍仿射矩阵 M。旋转时用它同步各对象 pv（单选绕自身 pv ⇒ 不动点，逐字保持）。
  function xformPoint(M, p) {
    return { x: M[0] * p.x + M[2] * p.y + M[4], y: M[1] * p.x + M[3] * p.y + M[5] };
  }
  /* PURE-END xformPoint */
  GW.xformPoint = xformPoint;
  /* PURE-BEGIN rotationDelta */
  // 纯函数：矩阵里的旋转角增量。segs/pb/ms/pts 四类统一走它，混合类型语义一致。
  function rotationDelta(M) { const s = M[1], c = M[0]; return Math.atan2(s, c); }
  /* PURE-END rotationDelta */
  GW.rotationDelta = rotationDelta;
  /* PURE-BEGIN groupRotationCenter */
  // 纯函数：组级旋转中心。默认联合 AABB 中心；给了自定义组点就用它（多选生效）。
  function groupRotationCenter(bounds, customPivot) {
    const c = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    if (customPivot && isFinite(customPivot.x) && isFinite(customPivot.y)) return { x: customPivot.x, y: customPivot.y };
    return c;
  }
  /* PURE-END groupRotationCenter */
  GW.groupRotationCenter = groupRotationCenter;
  function applyAffine(items, befores, M, mode) {
      const k = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2]));
      // 拖动期间**整幅刷新**（反馈：拖动会在路径上留下同形状的线条 / 轮廓）。
      // 局部重画只擦「新旧包围盒」这一个矩形，任何画在包围盒之外的东西（坐标轴轴名、模板标注、
      // 粗描边伸出的一圈）都擦不到，拖动路径上就会留下一条条同形状的痕迹。
      // requestRender 由 rAF 合并 —— 一帧最多整幅重画一次，不会因为 pointermove 密集而重复画。
      items.forEach((it, i) => {
        const b = befores[i];
        // 旋转中心跟着同一张矩阵走：平移/缩放/旋转都同步。绕它本身转时 M 的不动点就是它，
        // xformPoint 算回来仍是原值（单选逐字保持）；多选绕组中心转时各对象 pv 一起跟着走、不分离。
        if (b.pv) it.pv = xformPoint(M, b.pv);
        if (it.kind === 'obj') {
          const ox = b.x + b.w / 2, oy = b.y + b.h / 2;
          const nx = M[0] * ox + M[2] * oy + M[4], ny = M[1] * ox + M[3] * oy + M[5];
          it.w = b.w * k; it.h = b.h * k; it.x = nx - it.w / 2; it.y = ny - it.h / 2;
          GW.objects.update(it);
          if (mode !== 'move' && it._inst && it._inst.onResize) it._inst.onResize();
        } else {
          // 学科模板：平移/缩放时要把 segs 和板上标注一起搬（没有 pts）
          if (b.segs) {
            const M2 = (px, py) => [M[0] * px + M[2] * py + M[4], M[1] * px + M[3] * py + M[5]];
            const mapSeg = (q) => { const o = new Array(q.length); for (let j = 0; j < q.length; j += 2) { const p2 = M2(q[j], q[j + 1]); o[j] = p2[0]; o[j + 1] = p2[1]; } return o; };
            it.segs = b.segs.map(mapSeg);
            // 分段上色的模板（stencils.js 的 MK：parts[].s 与 segs 是**同一批数组对象**）画的是 parts，
            // 只换 segs 的话画布上仍是旧位置（segs 只用于包围盒/命中），拖动就会拖出一条同形状的痕迹。
            if (b.parts) it.parts = b.parts.map((p) => { const o = Object.assign({}, p); o.s = (p.s || []).map(mapSeg); return o; });
            if (b.texts) it.texts = b.texts.map((t) => { const p2 = M2(t.x, t.y); return { x: p2[0], y: p2[1], s: t.s, t: t.t }; });
            // 线宽、分段线宽、标注字号一律**不随缩放变**（老师要求：缩放/旋转/平移时笔迹粗细与大小
            // 不能有任何改变，参数只能去参数栏单独调）。以前这里是 it.width = b.width * k、p.w * k、
            // t.s * k —— 拖一次角手柄，2px 的轮廓就变成 6px。
            // 旋转角单独记一份：虚线框要跟着转，否则转过 45° 之后框是外接矩形，四面都是空档。
            if (mode === 'rotate') {
              it._rot = (b._rot || 0) + rotationDelta(M);
              // 框宽取「还没转过的那份」：转过第一次之后 bbox(b) 已经是外接矩形，
              // 再用它当 _rw 会把框越转越大。
              if (b._rw) { it._rw = b._rw; it._rh = b._rh; }
              else { const bb0 = GW.bbox(b); it._rw = bb0.w; it._rh = bb0.h; }
            } else if (b._rot) {
              it._rot = b._rot;
              if (b._rw) { it._rw = b._rw * k; it._rh = b._rh * k; }
            }
            GW.invalidate(it);
            return;
          }
          // 物理图形：几何全在库的 draw 里按 (x1,y1)-(x2,y2) 这个框算，没有点列，
          // 所以把框的两个角过一遍同一个矩阵就够了（缩放/平移精确）。
          // 旋转必须写进 rot 字段（physshapes 的 draw 会绕框中心 ctx.rotate），不能把两个角过旋转矩阵 ——
          // 那样只是把轴对齐框换成了外接矩形，图形本身不会转。
          if (it.type === 'pb') {
            if (mode === 'rotate') {
              // 复审 #8：绕选区中心转的时候，框的中心必须跟着矩阵走 —— 只改 rot 等于原地自转，
              // 多选/绕别的点旋转时整张图会「中心不动」，和虚线框对不上。框尺寸保持原样。
              const c0 = { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
              const nc = { x: M[0] * c0.x + M[2] * c0.y + M[4], y: M[1] * c0.x + M[3] * c0.y + M[5] };
              const ddx = nc.x - c0.x, ddy = nc.y - c0.y;
              it.x1 = b.x1 + ddx; it.x2 = b.x2 + ddx;
              it.y1 = b.y1 + ddy; it.y2 = b.y2 + ddy;
              it.rot = (b.rot || 0) + rotationDelta(M);
            } else {
              const M2 = (px, py) => [M[0] * px + M[2] * py + M[4], M[1] * px + M[3] * py + M[5]];
              const q1 = M2(b.x1, b.y1), q2 = M2(b.x2, b.y2);
              it.x1 = Math.min(q1[0], q2[0]); it.y1 = Math.min(q1[1], q2[1]);
              it.x2 = Math.max(q1[0], q2[0]); it.y2 = Math.max(q1[1], q2[1]);
              it.rot = b.rot || 0;
            }
            GW.invalidate(it);
            return;
          }
          // 数学可调参图形：旋转只改 rot（框不动，虚线框不会跟着甩）；平移/缩放映射两个角。
          if (it.type === 'ms') {
            const M2 = (px, py) => [M[0] * px + M[2] * py + M[4], M[1] * px + M[3] * py + M[5]];
            if (mode === 'rotate') {
              // 复审 #8：和 pb 同一口径 —— 转的时候框中心要跟着矩阵走，只改 rot 会让中心留在原地。
              const c0 = { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
              const nc = { x: M[0] * c0.x + M[2] * c0.y + M[4], y: M[1] * c0.x + M[3] * c0.y + M[5] };
              const ddx = nc.x - c0.x, ddy = nc.y - c0.y;
              it.x1 = b.x1 + ddx; it.x2 = b.x2 + ddx;
              it.y1 = b.y1 + ddy; it.y2 = b.y2 + ddy;
              it.rot = (b.rot || 0) + rotationDelta(M);
            } else {
              const q1 = M2(b.x1, b.y1), q2 = M2(b.x2, b.y2);
              it.x1 = Math.min(q1[0], q2[0]); it.y1 = Math.min(q1[1], q2[1]);
              it.x2 = Math.max(q1[0], q2[0]); it.y2 = Math.max(q1[1], q2[1]);
              it.rot = b.rot || 0;
            }
            // 线宽不随缩放变：拖手柄只改框，粗细交给「参数」里的线宽（笔迹粗细不变是老师的硬要求）。
            GW.invalidate(it);
            return;
          }
          // 磁场里的粒子（type:'lor'）：拖动不是平移整个区域，而是**沿磁场边界滑动** ——
          // 老师要的是「只能从边界出发」。这里把指针位置吸附到最近的边界点，初速方向跟着内法线重算。
          if (it.type === 'lor' && GW.lorentz) {
            if (mode === 'move') GW.lorentz.setPos(it, p.x, p.y);
            GW.requestRender();
            return;
          }
          const P = b.pts, out = new Array(P.length);
          for (let j = 0; j < P.length; j += 2) { out[j] = M[0] * P[j] + M[2] * P[j + 1] + M[4]; out[j + 1] = M[1] * P[j] + M[3] * P[j + 1] + M[5]; }
          it.pts = out;
          // 同上的「粗细/大小不变」：轮廓线宽保持原值，不乘 k。
          // 圆规圆弧内嵌的标注（圆心 / 半径 / 圆心角）必须跟着同一条矩阵走，
          // 否则拖动或缩放图形后圆心会留在原地，标注和圆分家。
          if (b.ann) {
            const a = b.ann, dr = rotationDelta(M);
            it.ann = { cx: M[0] * a.cx + M[2] * a.cy + M[4], cy: M[1] * a.cx + M[3] * a.cy + M[5], r: a.r * k, a0: a.a0 + dr, a1: a.a1 + dr, full: !!a.full };
          }
          // 变宽笔迹（笔锋）的宽度也保持原值：缩放只改点列，不改笔画粗细。
          if (b.ws) it.ws = b.ws.slice();
          if (b.ticks) it.ticks = b.ticks * k;
          // 普通图形的旋转角落在点列里，但虚线框需要知道「转了多少」才能跟着转。
          if (mode === 'rotate') {
            it._rot = (b._rot || 0) + rotationDelta(M);
            if (b._rw) { it._rw = b._rw; it._rh = b._rh; }
            else { const bb = GW.bbox(b); it._rw = bb.w; it._rh = bb.h; }
          } else if (b._rot) {
            it._rot = b._rot;
            if (mode !== 'move') { it._rw = b._rw * k; it._rh = b._rh * k; }
          }
          GW.invalidate(it);
        }
      });
    return items.length;
  }

  // 变换选区：mode = move | scale-<corner> | rotate
  // 「锁定位置」的对象不参与任何变换：手指落在它的区域里 = 落在画布上，
  // 于是可以直接在课件上面手写（笔迹本来就画在对象层之上），拖动则整体平移画布。
  GW.transformSel = function (st, e, mode) {
    const locked = sel.items.filter((i) => i.kind === 'obj' && i.locked);
    const items = sel.items.filter((i) => !(i.kind === 'obj' && i.locked));
    if (!items.length) {
      if (locked.length) GW.toast('该项目已锁定位置：可在它的区域里直接书写，或点项目标题栏的锁／选中工具条上的「解锁」', 2600);
      return;
    }
    st.mode = 'transform';
    const start = TW(e), b0 = sel.bounds();
    const befores = items.map(GW.clone);
    const cx = b0.x + b0.w / 2, cy = b0.y + b0.h / 2;
    // 旋转中心：单选逐字保持（打开「旋转中心」就绕它，否则绕选区中心）。
    // WP5：多选 = 组级旋转中心 —— 默认联合 AABB 中心；打开「旋转中心」开关并拖到自定义点后绕它转。
    const isMulti = items.length > 1;
    const pv1 = isMulti ? null : GW.pivotOf(items[0]);
    const gc = isMulti ? groupRotationCenter(b0, (sel.groupPivotOn && sel.groupPivot) ? sel.groupPivot : null) : null;
    const rx = isMulti ? gc.x : (pv1 ? pv1.x : cx), ry = isMulti ? gc.y : (pv1 ? pv1.y : cy);
    const edge = mode.startsWith('scale') ? mode.slice(6) : '';
    const cornerAnchor = { nw: [b0.x + b0.w, b0.y + b0.h], ne: [b0.x, b0.y + b0.h], sw: [b0.x + b0.w, b0.y], se: [b0.x, b0.y] }[edge];
    // 四边中点：只沿一个轴缩放，另一轴锁死；对边（或对顶点）当锚点，图形不会整体跑。
    const sideAnchor = { n: [cx, b0.y + b0.h], s: [cx, b0.y], e: [b0.x, cy], w: [b0.x + b0.w, cy] }[edge];
    const anchor = cornerAnchor || sideAnchor || null;
    const oneAxis = edge === 'n' || edge === 's' ? 'y' : (edge === 'e' || edge === 'w' ? 'x' : '');
    const a0 = Math.atan2(start.y - ry, start.x - rx);
    const hasObj = items.some((i) => i.kind === 'obj');
    let moved = false;
    document.body.classList.add('dragging-obj');
    st.move = (ev) => {
      const p = TW(ev);
      let M; // [a,b,c,d,e,f]: x' = a x + c y + e
      if (mode === 'move') {
        let dx = p.x - start.x, dy = p.y - start.y;
        // 1.7.0（T12）：拖动吸附（网格 / 其它对象的边与中线）。判据与算法都在 objects.js 的 GW.snap 里，
        // 这里只负责「每帧把当前候选矩形交出去、把修正量加回位移」。
        // 两个开关都关时 GW.snap.correct() 恒返回零修正（objects.js 里第一句就是 return zero），
        // 而且这里还先短路了一次 —— 所以关掉开关时 dx/dy 与改前逐像素相同。
        // exclude 用移动中的这批 id：否则对象会吸到「自己」身上，一拖就黏住不动。
        if ((GW.settings.snapGrid || GW.settings.snapObjects) && GW.snap && GW.snap.correct) {
          const sn = GW.snap.correct(
            { x: b0.x + dx, y: b0.y + dy, w: b0.w, h: b0.h },
            {
              grid: !!GW.settings.snapGrid, objects: !!GW.settings.snapObjects,
              exclude: items.map((it) => it.id), thr: GW.snap.thr(), snapSize: 40,
            });
          if (sn) { dx += sn.dl; dy += sn.dt; }
        }
        M = [1, 0, 0, 1, dx, dy];
      }
      else if (anchor) {
        const [ax, ay] = anchor;
        let sx = (p.x - ax) / (start.x - ax || 1), sy = (p.y - ay) / (start.y - ay || 1);
        // 精细缩放：手柄离锚点越近，同样的手指位移换来的倍率越大 —— 小圆拖 20px 就翻倍，
        // 老师反馈「大小调节过于灵敏」。按起点到锚点的**屏幕**距离给 0.3~1 的阻尼：
        // 远处照旧 1:1 跟手，近处自动变慢（缩放手柄不会离锚点太远，所以这条几乎只影响小图形）。
        const d0s = Math.hypot(start.x - ax, start.y - ay) * (GW.camera.s || 1);
        const damp = Math.max(0.3, Math.min(1, d0s / 180));
        if (damp < 1) { sx = 1 + (sx - 1) * damp; sy = 1 + (sy - 1) * damp; }
        if (oneAxis === 'x') sy = 1;                    // 左右边中点：只改宽
        else if (oneAxis === 'y') sx = 1;               // 上下边中点：只改高
        else {
          // 四角：统一比例缩放（触屏更好控制）
          const s = Math.max(0.05, Math.abs(sx) > Math.abs(sy) ? sx : sy);
          sx = sy = s;
        }
        M = [sx, 0, 0, sy, ax - ax * sx, ay - ay * sy];
      } else {
        let da = Math.atan2(p.y - ry, p.x - rx) - a0;
        const snap = Math.round(da / (Math.PI / 12)) * (Math.PI / 12);
        if (Math.abs(da - snap) < 0.04) da = snap;
        const c = Math.cos(da), s = Math.sin(da);
        M = [c, s, -s, c, rx - c * rx + s * ry, ry - s * rx - c * ry];
      }
      moved = true;
      applyAffine(items, befores, M, mode);
      GW.requestRender();
      sel.render();
    };
    st.cancel = () => document.body.classList.remove('dragging-obj');
    st.up = () => {
      document.body.classList.remove('dragging-obj');
      // 1.6.8（R10）：单个文本块松手后吸到底纹的行线（横线 48 / 方格 40），开关在设置里。
      if (mode === 'move' && items.length === 1 && snapTextToRow(items[0])) { /* y 已经改了，下面照常提交 */ }
      if (moved) GW.commit({ update: items.map((it, i) => ({ before: befores[i], after: it })) });
      // 松手后再整幅重画一次兜底：拖动期间已经是每帧整幅刷新（见 st.move），这里只是保证
      // 最后一帧落在最终几何上（拖动中途若被 pan-quiet / 快速通道之类打断，也不会留痕）。
      if (moved) GW.requestRender();
      sel.render();
    };
    if (hasObj) {} // 对象也一起移动
  };

  // 1.6.8（R10）：文本块吸行线。底纹行距与 board.js 一致：横线 48、方格/坐标纸 40。
  function snapTextToRow(o) {
    if (!o || o.type !== 'text' || o.kind !== 'obj') return false;
    if (!(GW.settings || {}).textSnapLine) return false;
    const p = GW.page();
    if (!p || !p.bg) return false;
    const pat = p.bg.pattern;
    const g = pat === 'lines' ? 48 : (pat === 'grid' || pat === 'coord' ? 40 : 0);
    if (!g) return false;
    const row = Math.round(o.y / g) * g;
    if (Math.abs(o.y - row) > 0.01) {
      o.y = row;
      const el = GW.objects && GW.objects.el ? GW.objects.el(o) : null;
      if (el && GW.objects.layout) GW.objects.layout(o, el);
      return true;
    }
    return false;
  }
  GW.snapTextToRow = snapTextToRow;

  // ---------- 曲线塑形 / 端点旋转（1.6.3） ----------
  // 手画曲线与识别出的直线/图形，选中后除了整体缩放，还能直接改形状：
  //   · 曲线中段三个「塑形点」：手指拖哪一段，那一段就地弯，两端与原走势尽量不动（高斯衰减）
  //   · 末端「旋转点」：拖动 = 整条线绕起点转（15° 吸附），长度与形状不变
  // 一次拖动 = 一次 commit = 一步撤销；拖动过程只改点列并请求重绘。
  // 只收「点列就是几何本身」的条目：手写笔迹（stroke）与 poly 图形（含直线）。
  // 1.6.4：旋转/缩放过也要能用。poly 的变换是**直接烘进 pts 的**（applyAffine 把矩阵乘到点列上，
  // `_rot` 只是累积角度元数据，绘制时不二次旋转），所以 pts 仍是世界坐标，手柄与拖拽都成立。
  // 只有 pb/ms 这类把 `rot` 存在绘制阶段的学科图形才排除（它们的点列不含旋转）。
  function curveTarget() {
    if (sel.items.length !== 1) return null;
    const it = sel.items[0];
    if (!it || it.kind === 'obj' || it.locked) return null;
    if (it.type !== 'poly' && it.kind !== 'stroke') return null;
    if (!it.pts || it.pts.length < 4) return null;
    if (it.rot) return null;
    return it;
  }
  function arcTable(P) {
    const n = P.length / 2, s2 = new Float64Array(n);
    for (let i = 1; i < n; i++) s2[i] = s2[i - 1] + Math.hypot(P[2 * i] - P[2 * i - 2], P[2 * i + 1] - P[2 * i - 1]);
    return s2;
  }
  function idxAt(s2, L, f) {
    const t = f * L;
    let i = 1;
    while (i < s2.length - 1 && s2[i] < t) i++;
    return i;
  }
  // 按索引线性重采样（宽度数组与点列长度必须一致）。
  function resampleLinear(a, n) {
    const out = new Array(n);
    if (!a || !a.length) return out;
    const last = a.length - 1;
    for (let i = 0; i < n; i++) {
      const x = (i / Math.max(1, n - 1)) * last;
      const i0 = Math.floor(x), i1 = Math.min(last, i0 + 1), f = x - i0;
      out[i] = a[i0] + (a[i1] - a[i0]) * f;
    }
    return out;
  }
  // 返回屏幕坐标：{ start, end, mids: [{x,y}], endpoints }；不支持就地编辑时返回 null。
  // 1.6.4（GoodNotes 式）：开放曲线给首/中/尾三个可拖点，直线只给首尾两个；
  // 闭合曲线没有"端点"（首尾重合），只给中段塑形点。
  GW.curveEditHandles = function () {
    const it = curveTarget();
    if (!it) return null;
    const P = it.pts, s2 = arcTable(P), n = s2.length, L = s2[n - 1];
    if (!(L > 1e-6)) return null;
    const at = (f) => { const i = idxAt(s2, L, f); return GW.toScreen(P[2 * i], P[2 * i + 1]); };
    // 直线（未闭合的两点）只给首尾：拉端点就够，中段没有可弯的东西。
    const line2 = !it.closed && (P.length / 2) <= 2;
    // 老师反馈：手写的直线（点很多但几乎共线）也会冒出中间那个塑形点，正落在直线上，
    // 一拖就把直线拽弯了，很不方便。这里按几何判「几乎共线」：所有点到首尾弦的垂距
    // 都不超过容差（大图的 1% 或 2 单位，取大者）就当作直线，中段点不给。
    let straight = false;
    if (!it.closed && !line2) {
      const ax = P[0], ay = P[1], bx2 = P[2 * (n - 1)], by2 = P[2 * (n - 1) + 1];
      const vx = bx2 - ax, vy = by2 - ay, cl = Math.hypot(vx, vy);
      if (!(cl > 1e-6)) straight = true;
      else {
        const tol = Math.max(2, cl * 0.01);
        let far = 0;
        for (let i = 1; i < n - 1; i++) {
          const d = Math.abs((P[2 * i] - ax) * vy - (P[2 * i + 1] - ay) * vx) / cl;
          if (d > far) { far = d; if (far > tol) break; }
        }
        straight = far <= tol;
      }
    }
    const mids = (line2 || straight) ? [] : [{ ...at(0.5) }];
    return {
      endpoints: !it.closed,
      start: GW.toScreen(P[0], P[1]),
      end: GW.toScreen(P[2 * (n - 1)], P[2 * (n - 1) + 1]),
      mids,
    };
  };
  // st 与 GW.transformSel 同形：st.move(ev) / st.up(ev)；返回 false 表示这次按下不该接管。
  GW.curveEditBegin = function (st, e, key) {
    const it = curveTarget();
    if (!it) return false;
    const before = GW.clone(it);
    let P0 = it.pts.slice();
    const closed = !!it.closed;
    const p0 = TW(e);
    let moved = false;
    const mark = () => { moved = true; GW.invalidate(it); GW.requestRender(); sel.render(); };
    const finish = () => {
      GW.invalidate(it);
      GW.requestRender();
      sel.render();
    };
    if (!closed) {
      // 1.6.4 第三轮（老师定稿）：开放曲线改成「三点重建」—— 首、中、尾确定一条二次贝塞尔。
      // 二次贝塞尔数学上只有一个弯曲方向、不会自交：拖任何点都不会出现 S 弯、多个弯曲方向或打结。
      // 首尾两点仍然钉死（拖哪个端点就只动那个端点），中段点就是曲线在 t=0.5 处的点，1:1 跟手。
      const N0 = P0.length / 2;
      const isLine2 = N0 <= 2;
      const endA = { x: P0[0], y: P0[1] };
      const endB = { x: P0[P0.length - 2], y: P0[P0.length - 1] };
      const s2 = arcTable(P0), L = Math.max(1e-6, s2[N0 - 1]);
      const i0 = idxAt(s2, L, 0.5);
      const mid0 = { x: P0[2 * i0], y: P0[2 * i0 + 1] };
      const OUT = Math.max(N0, 24);
      const wOut = it.ws && it.ws.length === N0 ? resampleLinear(it.ws, OUT) : null;
      const put = (A, M, B) => {
        const cx = (4 * M.x - A.x - B.x) / 2, cy = (4 * M.y - A.y - B.y) / 2;
        const out = new Array(OUT * 2);
        for (let k = 0; k < OUT; k++) {
          const t = k / (OUT - 1), u = 1 - t;
          out[2 * k] = u * u * A.x + 2 * u * t * cx + t * t * B.x;
          out[2 * k + 1] = u * u * A.y + 2 * u * t * cy + t * t * B.y;
        }
        it.pts = out;
        if (wOut) it.ws = wOut.slice();
        it.smooth = true;
        delete it.snap;
      };
      st.move = (ev) => {
        const p = TW(ev);
        if (key === 'start') { endA.x = p.x; endA.y = p.y; }
        else if (key === 'end') { endB.x = p.x; endB.y = p.y; }
        else { mid0.x = p.x; mid0.y = p.y; }
        // 直线（两点）不能被拖成弧：控制点永远取弦的中点 ⇒ 曲线与直线重合、不会打结
        const M = isLine2 ? { x: (endA.x + endB.x) / 2, y: (endA.y + endB.y) / 2 } : mid0;
        put(endA, M, endB);
        mark();
      };
    } else {
      // 闭合图形（圆 / 闭合多边形）：首尾重合、没有端点可拖，保留原来的全局平滑形变。
      const N = P0.length / 2;
      const s2 = arcTable(P0), L = s2[N - 1];
      const i0 = idxAt(s2, L, 0.5);
      const w = new Float64Array(N);
      let wmax = 0;
      for (let k = 0; k < N; k++) {
        const d = Math.abs(s2[k] - s2[i0]);
        const u = Math.min(d, L - d) / Math.max(1e-6, L * 0.5);
        const t = 1 - Math.max(0, Math.min(1, u));
        const g = t * t * (3 - 2 * t);
        w[k] = g;
        if (g > wmax) wmax = g;
      }
      if (wmax <= 1e-9) return false;
      const ax = P0[2 * i0], ay = P0[2 * i0 + 1];
      st.move = (ev) => {
        const p = TW(ev);
        const dx = p.x - ax, dy = p.y - ay;
        for (let k = 0; k < N; k++) {
          const q = w[k] / wmax;
          it.pts[2 * k] = P0[2 * k] + dx * q;
          it.pts[2 * k + 1] = P0[2 * k + 1] + dy * q;
        }
        mark();
      };
    }

    st.cancel = () => {
      if (moved) { it.pts = before.pts.slice(); it.smooth = before.smooth; if (before.snap) it.snap = before.snap; else delete it.snap; }
      finish();
    };
    st.up = () => {
      if (moved) GW.commit({ update: [{ before, after: it }] });
      finish();
    };
    return true;
  };

  // 程序化变换：AI 工具与「选区工具条」共用同一个入口。只收相对量或明确的世界坐标锚点；
  // 一次调用 = 一次 commit = 一步撤销。锁定对象不参与变换（返回 skippedLocked），全部锁定时直接拒绝。
  // cmd 三种形态：{dx,dy} / {scale, anchor?} / {deg, center?}。
  // 复审 #5：ids 是「发送那一刻冻结」的目标 ID。给了 ids 就只认这些 ID，
  // 绝不再回头读当前选区 —— 否则模型回包晚到时，用户已经改选了别的对象，命令会打到新目标上。
  GW.transformSelection = function (cmd, ids) {
    cmd = cmd || {};
    const nOf = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
    let raw;
    if (Array.isArray(ids)) {
      const pg = GW.page();
      const pool = (pg.objs || []).concat(pg.ink || []);
      const byId = new Map(pool.map((it) => [it.id, it]));
      const missing = ids.filter((id) => !byId.has(id));
      if (missing.length) {
        return { ok: false, error: '目标对象已不在当前页（' + missing.slice(0, 3).join('、') + '），本次命令已拒绝', missing: missing.length };
      }
      raw = ids.map((id) => byId.get(id));
    } else {
      raw = sel.items.slice();
    }
    if (!raw.length) return { ok: false, error: '先选中要变换的对象' };
    const locked = raw.filter((i) => i.kind === 'obj' && i.locked);
    let items = raw.filter((i) => !(i.kind === 'obj' && i.locked));
    const rotatable = (i) => !!(i.segs || i.pts || i.type === 'pb' || i.type === 'ms');
    const mode = (cmd.deg !== undefined || cmd.rotate !== undefined) ? 'rotate' : (cmd.scale !== undefined ? 'scale' : 'move');
    if (mode === 'rotate') {
      const keep = items.filter(rotatable);
      if (!keep.length) return { ok: false, error: '选中的对象不支持旋转（只有图形、笔迹、学科模板可以）' };
      items = keep;
    }
    if (!items.length) return { ok: false, error: '选中的对象都已锁定位置，没有可变换的对象' };
    let b0;
    if (Array.isArray(ids)) {
      const bs = items.map((it) => GW.bbox(it));
      const x1 = Math.min.apply(null, bs.map((b) => b.x)), y1 = Math.min.apply(null, bs.map((b) => b.y));
      const x2 = Math.max.apply(null, bs.map((b) => b.x + b.w)), y2 = Math.max.apply(null, bs.map((b) => b.y + b.h));
      b0 = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    } else {
      b0 = sel.bounds();
    }
    const cx0 = b0.x + b0.w / 2, cy0 = b0.y + b0.h / 2;
    let M, detail;
    if (mode === 'move') {
      const dx = nOf(cmd.dx, NaN), dy = nOf(cmd.dy, NaN);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { ok: false, error: '移动需要有限的 dx/dy（世界坐标，右为正、下为正）' };
      if (Math.abs(dx) > 20000 || Math.abs(dy) > 20000) return { ok: false, error: '移动量超过 20000，已拒绝' };
      M = [1, 0, 0, 1, dx, dy];
      detail = 'dx=' + dx + ', dy=' + dy;
    } else if (mode === 'scale') {
      const s = nOf(cmd.scale, NaN);
      if (!Number.isFinite(s) || s <= 0.02 || s > 20) return { ok: false, error: '缩放倍数须在 0.02–20 之间' };
      const amap = { nw: [b0.x, b0.y], ne: [b0.x + b0.w, b0.y], sw: [b0.x, b0.y + b0.h], se: [b0.x + b0.w, b0.y + b0.h] };
      const a = amap[cmd.anchor] || [cx0, cy0];
      M = [s, 0, 0, s, a[0] - a[0] * s, a[1] - a[1] * s];
      detail = 'scale=' + s + ', anchor=' + (cmd.anchor && amap[cmd.anchor] ? cmd.anchor : 'center');
    } else {
      const deg = nOf(cmd.deg !== undefined ? cmd.deg : cmd.rotate, NaN);
      if (!Number.isFinite(deg) || Math.abs(deg) > 3600) return { ok: false, error: '旋转角度须为有限度数（±3600 内）' };
      const cc = (Array.isArray(cmd.center) && cmd.center.length === 2 && Number.isFinite(Number(cmd.center[0])) && Number.isFinite(Number(cmd.center[1])))
        ? [Number(cmd.center[0]), Number(cmd.center[1])] : [cx0, cy0];
      const rad = deg * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
      M = [co, si, -si, co, cc[0] - co * cc[0] + si * cc[1], cc[1] - si * cc[0] - co * cc[1]];
      detail = 'rotate=' + deg + '°, center=' + Math.round(cc[0]) + ',' + Math.round(cc[1]);
    }
    const befores = items.map(GW.clone);
    applyAffine(items, befores, M, mode);
    GW.commit({ update: items.map((it, i) => ({ before: befores[i], after: it })) });
    GW.requestRender();
    sel.render();
    const ab = sel.bounds();
    return {
      ok: true, mode: mode, count: items.length, ids: items.map((i) => i.id),
      skippedLocked: locked.length, detail: detail,
      bounds: { x: Math.round(ab.x), y: Math.round(ab.y), w: Math.round(ab.w), h: Math.round(ab.h) },
    };
  };

  GW.deleteSelection = function () {
    if (!sel.items.length) return;
    const items = sel.items.slice();
    sel.clear();
    GW.removeItems(items);
  };
  let clipboard = null;
  GW.copySelection = function () {
    if (!sel.items.length) return false;
    clipboard = sel.items.map(GW.clone);
    // 1.3.0（R7）：复制的同时顺手进「复用架」——老师本来就要复制，取样不用另学一个动作。
    // 架子存在 localStorage['gewu.shelf']，跨页/跨文件/跨重启都在（见 core/shelf.js）。
    if (GW.shelf) { try { GW.shelf.add(clipboard, { kind: 'items' }); } catch (e) { /* 架子坏了不影响复制 */ } }
    return true;
  };
  // 1.7.1（T07）：粘贴并匹配样式。默认行为**一个字节都不改** —— 只有显式传 { match: true } 时
  // 才把「样式类」字段覆盖成当前笔色与默认字号，几何与内容原样保留。
  // 覆盖范围只认已经存在的字段：图形/笔迹有 color+width，文本对象是 data.color+data.size，
  // 没有 width 的对象不会被硬塞一个 width（那会变成半透明图形的整体透明度之类的怪东西）。
  function matchPasteStyle(it) {
    const pen = (GW.tool && GW.tool.pen) || {};
    const color = pen.color || (GW.settings && GW.settings.penColor) || '';
    const width = (+pen.width > 0 && +pen.width) || 2;
    const size = 32;                       // 文本对象默认字号（objects.js 文本 kind 的 `d.size || 32`）
    const stamp = (o) => {
      if (!o || typeof o !== 'object') return;
      if ('color' in o) o.color = color;
      if ('width' in o && o.width != null) o.width = width;
      if ('size' in o && o.size != null) o.size = size;
      if ('font' in o) o.font = '';
    };
    stamp(it);
    if (it.kind === 'obj') stamp(it.data);
    return it;
  }
  GW.paste = function (offset = 30, opts) {
    if (opts === undefined && offset && typeof offset === 'object') { opts = offset; offset = 30; }
    if (!clipboard) return false;
    const d = offset / GW.camera.s;
    const items = clipboard.map((c) => {
      const it = JSON.parse(JSON.stringify(c)); it.id = GW.uid();
      if (it.kind === 'obj') { it.x += d; it.y += d; }
      else if (it.type === 'pb') { it.x1 += d; it.y1 += d; it.x2 += d; it.y2 += d; }
      else if (it.type === 'ms') { it.x1 += d; it.y1 += d; it.x2 += d; it.y2 += d; }
      else {
        it.pts = it.pts.map((v) => v + d);
        if (it.ann) { it.ann.cx += d; it.ann.cy += d; }
      }
      return it;
    });
    // 剪贴板留的是「原样」的那份：匹配样式只作用在这一次贴出来的副本上，
    // 所以贴过「匹配样式」之后再按 Ctrl+V，颜色仍然是当初复制时的颜色。
    clipboard = items.map(GW.clone);
    if (opts && opts.match) items.forEach(matchPasteStyle);
    GW.addItems(items);
    sel.set(items);
    return true;
  };
  GW.canPaste = () => !!clipboard;
  GW.duplicateSelection = () => { if (GW.copySelection()) GW.paste(); };

  // ---------- 成组 / 解组（1.6.6 T06） ----------
  // 不新增容器对象：对象卡片是 DOM、墨迹是画布几何，容器既挂不了 DOM 也画不出来，
  // 存档里只会多一层「永远空着的 group 卡」。改用给每一项打 `gid` 标记：
  //   · .gewu 原样带走（旧版本读到不认识的字段直接忽略，不会当未知对象报错）；
  //   · 选中任一项 → GW.selection.set() 自动把同组的都收进来（那个入口已经改好）；
  //   · 拖动/缩放/旋转/删除/复制全走原有的逐项路径，不需要为「组」再写第二套变换。
  GW.groupSelection = function () {
    const items = (sel.items || []).slice();
    if (items.length < 2) { GW.toast('先框选两个以上的东西再成组'); return null; }
    const gid = 'g' + GW.uid();
    const upd = items.map((it) => ({ before: GW.clone(it), after: it }));
    for (const it of items) it.gid = gid;
    GW.commit({ update: upd });
    sel.set(items);          // 重设一次：虚线框与工具条按整组重算
    GW.toast('已把 ' + items.length + ' 项合成一组（Ctrl+G 成组 / Ctrl+Shift+G 解组）', 2600);
    return gid;
  };
  GW.ungroupSelection = function () {
    const gids = new Set((sel.items || []).map((i) => i && i.gid).filter(Boolean));
    if (!gids.size) { GW.toast('选中的东西不在任何组里'); return 0; }
    const page = GW.page();
    const all = page.ink.concat(page.objs).filter((it) => it.gid && gids.has(it.gid));
    const upd = all.map((it) => ({ before: GW.clone(it), after: it }));
    for (const it of all) delete it.gid;
    GW.commit({ update: upd });
    sel.set((sel.items || []).slice());
    GW.toast('已解组');
    return all.length;
  };
  // 右键菜单用它决定「解组」是否可用
  GW.isGrouped = (it) => !!(it && it.gid);

  // ---------- 1.6.8（R3/R4）：改形状、对齐 ----------
  // 形状转换：只换 pts（保包围盒、保颜色/线宽/线型/填充）。图形都是 type:'poly'，
  // 所以「换个形状」= 按同一个框重新采样一圈点，撤销与导出走的还是老路。
  const RESHAPE = {
    rect: (b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]],
    triangle: (b) => [[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]],
    diamond: (b) => [[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h / 2], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h / 2]],
    ellipse: (b) => {
      const out = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        out.push([b.x + b.w / 2 + Math.cos(a) * b.w / 2, b.y + b.h / 2 + Math.sin(a) * b.h / 2]);
      }
      return out;
    },
    line: (b) => [[b.x, b.y], [b.x + b.w, b.y + b.h]],
  };
  GW.RESHAPE_KINDS = Object.keys(RESHAPE);
  GW.reshapeTo = function (it, kind) {
    if (!it || it.kind !== 'shape' || !it.pts) return null;
    if (it.type === 'pb' || it.type === 'ms' || it.type === 'lor') return null;   // 库图形有专有几何，不许换
    const fn = RESHAPE[kind];
    if (!fn) return null;
    const b = GW.bbox(it);
    if (!b || !(b.w > 0) || !(b.h > 0)) return null;
    const before = GW.clone(it);
    const pts = [];
    for (const [x, y] of fn(b)) pts.push(x, y);
    it.pts = pts;
    it.closed = kind !== 'line';
    it.smooth = kind === 'ellipse';
    it.shapeKind = kind;
    delete it._path; it._bb = null;
    GW.invalidate(it);
    GW.commit({ update: [{ before, after: it }] });
    GW.requestRender();
    if (GW.selection && GW.selection.render) GW.selection.render();
    return it;
  };

  // 对齐 / 等距分布：对象按 x/y/w/h，墨迹按 pts 整体平移。
  function shiftItem(it, dx, dy) {
    if (!dx && !dy) return;
    const before = GW.clone(it);
    if (it.kind === 'obj' || it.x != null) {
      it.x += dx; it.y += dy;
      if (GW.objects && GW.objects.update) GW.objects.update(it);
    } else if (it.pts) {
      for (let i = 0; i < it.pts.length; i += 2) { it.pts[i] += dx; it.pts[i + 1] += dy; }
      delete it._path; it._bb = null;
      GW.invalidate(it);
    }
    return { before, after: it };
  }
  GW.alignSelection = function (mode) {
    const items = (sel.items || []).filter((it) => it && (it.pts || it.x != null));
    if (items.length < 2) { GW.toast('先框选两个以上的东西再对齐'); return 0; }
    const bs = items.map((it) => GW.bbox(it)).filter(Boolean);
    if (!bs.length) return 0;
    const x0 = Math.min(...bs.map((b) => b.x)), x1 = Math.max(...bs.map((b) => b.x + b.w));
    const y0 = Math.min(...bs.map((b) => b.y)), y1 = Math.max(...bs.map((b) => b.y + b.h));
    const upd = [];
    items.forEach((it, i) => {
      const b = bs[i];
      if (!b) return;
      let dx = 0, dy = 0;
      if (mode === 'left') dx = x0 - b.x;
      else if (mode === 'right') dx = x1 - (b.x + b.w);
      else if (mode === 'hcenter') dx = (x0 + x1) / 2 - (b.x + b.w / 2);
      else if (mode === 'top') dy = y0 - b.y;
      else if (mode === 'bottom') dy = y1 - (b.y + b.h);
      else if (mode === 'vcenter') dy = (y0 + y1) / 2 - (b.y + b.h / 2);
      const r = shiftItem(it, dx, dy);
      if (r) upd.push(r);
    });
    if (upd.length) GW.commit({ update: upd });
    GW.requestRender();
    if (sel.render) sel.render();
    return upd.length;
  };
  GW.distributeSelection = function (axis) {
    const items = (sel.items || []).filter((it) => it && (it.pts || it.x != null));
    if (items.length < 3) { GW.toast('等距分布至少要选三个'); return 0; }
    const rows = items.map((it) => ({ it, b: GW.bbox(it) })).filter((r) => r.b);
    if (rows.length < 3) return 0;
    const horiz = axis !== 'v';
    rows.sort((a, b) => (horiz ? a.b.x - b.b.x : a.b.y - b.b.y));
    const first = rows[0], last = rows[rows.length - 1];
    const start = horiz ? first.b.x + first.b.w / 2 : first.b.y + first.b.h / 2;
    const end = horiz ? last.b.x + last.b.w / 2 : last.b.y + last.b.h / 2;
    const step = (end - start) / (rows.length - 1);
    const upd = [];
    rows.forEach((r, i) => {
      if (i === 0 || i === rows.length - 1) return;
      const want = start + step * i;
      const got = horiz ? r.b.x + r.b.w / 2 : r.b.y + r.b.h / 2;
      const d = want - got;
      const x = shiftItem(r.it, horiz ? d : 0, horiz ? 0 : d);
      if (x) upd.push(x);
    });
    if (upd.length) GW.commit({ update: upd });
    GW.requestRender();
    if (sel.render) sel.render();
    return upd.length;
  };
  // R2：多选批量改样式（线宽 / 线型 / 填充）。一次 commit ⇒ 撤销一步全回。
  /* PURE-BEGIN fillFieldsFor */
  // 纯函数：填充状态 → 要写到对象上的字段补丁（单选 styleCtl 与多选 bFill 共用同一套字段）。
  // fill 是降级串：solid/pattern = rgba（truthy ⇒ 按 it.fill 判断「有填充」不误判），none = null。
  function fillFieldsFor(s) {
    const mode = s && s.mode;
    const color = (s && s.color) || '#3366ff';
    const alpha = (s && s.alpha != null) ? s.alpha : 0.18;
    // 与 GW.hexA 同式，内联以保持纯函数自包含、可被 vm 单独提取实跑。
    const rgba = (hex, a) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex);
      if (!m) return hex;
      const v = parseInt(m[1], 16);
      return 'rgba(' + (v >> 16) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')';
    };
    const fill = mode === 'none' ? null : rgba(color, alpha);
    if (mode === 'pattern') return {
      fillMode: 'pattern', fillColor: color, fillAlpha: alpha, fill,
      fillPattern: (s && s.pattern) || 'hatch',
      fillDensity: (s && s.density != null) ? s.density : 8,
      fillLineWidth: (s && s.lineWidth != null) ? s.lineWidth : 1,
    };
    if (mode === 'solid') return { fillMode: 'solid', fillColor: color, fillAlpha: alpha, fill };
    return { fillMode: 'none', fillColor: color, fillAlpha: alpha, fill: null };
  }
  /* PURE-END fillFieldsFor */
  GW.fillFieldsFor = fillFieldsFor;
  GW.batchStyle = function (patch) {
    const items = (sel.items || []).filter((it) => it && it.kind === 'shape');
    if (!items.length) { GW.toast('选中的东西里没有图形'); return 0; }
    const upd = [];
    const FILL_KEYS = ['fillMode', 'fillColor', 'fillPattern', 'fillDensity', 'fillLineWidth', 'fillAlpha'];
    for (const it of items) {
      const before = GW.clone(it);
      if (patch.width != null && it.type !== 'pb' && it.type !== 'ms') it.width = patch.width;
      if (patch.dash) { it.dash = patch.dash !== 'solid'; it.dashStyle = patch.dash; }
      // 旧数字开关（bW* / 旧版 bFill）：保持原语义
      if (patch.fill != null && typeof patch.fill === 'number') {
        it.fillAlpha = patch.fill;
        it.fill = patch.fill > 0 ? GW.hexA(it.fillColor || it.color || '#1b2433', patch.fill) : null;
      }
      // WP6：新填充字段补丁（来自 GW.fillFieldsFor），同步维护 it.fill 降级串
      for (const k of FILL_KEYS) if (patch[k] !== undefined) it[k] = patch[k];
      if (patch.fill !== undefined && typeof patch.fill !== 'number') it.fill = patch.fill;
      delete it._path; it._bb = null;
      GW.invalidate(it);
      upd.push({ before, after: it });
    }
    GW.commit({ update: upd });
    GW.requestRender();
    if (sel.render) sel.render();
    return upd.length;
  };

  // ---------- 旋转中心（1.5.1） ----------
  // 磁场课里最常干的三件事：把圆平移、放大、绕一个**不是圆心**的点旋转（洛伦兹力的圆心
  // 与旋转中心经常不同）。所以旋转中心做成每个图形自己的、可显示可隐藏的一对世界坐标。
  // 关掉开关时 pivotOf 返回 null ⇒ 全部退回「绕自己中心转」，与 1.5.0 完全一致。
  GW.pivotTargets = () => sel.items.filter((i) => i && i.kind !== 'obj');
  GW.pivotOn = () => {
    const its = GW.pivotTargets();
    if (its.length > 1) return !!sel.groupPivotOn;   // 多选：整组共享的组旋转中心开关
    return its.length === 1 && !!its[0].pvOn;         // 单选：逐字保持
  };
  // 当前「可拖的旋转中心点」：单选 = 对象自己的 pv；多选 = 组中心（开关打开时）。
  GW.activePivot = () => {
    const its = GW.pivotTargets();
    if (its.length > 1) return (sel.groupPivotOn && sel.groupPivot && isFinite(sel.groupPivot.x) && isFinite(sel.groupPivot.y))
      ? { x: sel.groupPivot.x, y: sel.groupPivot.y } : null;
    return its.length === 1 ? GW.pivotOf(its[0]) : null;
  };
  // force: true/false 直接设定，不给就是切换。返回切换后的状态。
  GW.togglePivot = function (force) {
    const its = GW.pivotTargets();
    if (!its.length) { GW.toast('请先选中一个图形（圆、圆弧、手写笔迹、学科模板都可以）'); return null; }
    const to = force != null ? !!force : !GW.pivotOn();
    // WP5：多选 → 组旋转中心（选区级开关，不进文档历史；默认落在联合 AABB 中心）
    if (its.length > 1) {
      sel.groupPivotOn = to;
      if (to && (!sel.groupPivot || !isFinite(sel.groupPivot.x) || !isFinite(sel.groupPivot.y))) {
        const b = sel.bounds();
        sel.groupPivot = b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
      }
      sel.render(); GW.requestRender();
      return to;
    }
    const ups = [];
    for (const it of its) {
      if (!!it.pvOn === to) continue;
      const before = GW.clone(it);
      it.pvOn = to;
      // 第一次打开时把中心放到图形自己的中心上（老师随后再拖到想要的位置）；
      // 以前设过就沿用那个点，开关只是「显示 / 不显示」。
      if (to) {
        const p = (it.pv && isFinite(it.pv.x) && isFinite(it.pv.y)) ? it.pv : GW.basePivotOf(it);
        if (p) it.pv = { x: p.x, y: p.y };
      }
      ups.push({ before, after: it });
      GW.invalidate(it);
    }
    if (ups.length) GW.commit({ update: ups });
    sel.render(); GW.requestRender();
    return to;
  };
  // 拖旋转中心手柄时用：p 是世界坐标；不记历史，抬手时由调用方 commit 一次（和拖动图形一致）
  GW.setPivot = function (it, p) {
    if (!it || !p || !isFinite(p.x) || !isFinite(p.y)) return false;
    it.pv = { x: p.x, y: p.y };
    it.pvOn = true;
    GW.invalidate(it);
    GW.requestRender(); sel.render();
    return true;
  };
  // WP5：多选拖组旋转中心手柄（选区级，不进历史）
  GW.setGroupPivot = function (p) {
    if (!p || !isFinite(p.x) || !isFinite(p.y)) return false;
    sel.groupPivot = { x: p.x, y: p.y };
    sel.groupPivotOn = true;
    GW.requestRender(); sel.render();
    return true;
  };
  // ---------- 留痕（1.5.1） ----------
  // 希沃里把圆转一圈只有最后一帧，学生看不到扫过的范围。这里把当前位置「盖」一份半透明
  // 虚线副本留在板上：转一点盖一次，就是一串轨迹；再随手清掉。副本是普通墨迹，
  // 能选中、能导出、能用撤销收回（trace:true 只用于「清除留痕」认人）。
  /* PURE-BEGIN traceGroupContext */
  // 纯函数：整组留痕共享的变换上下文（组中心 + 组旋转增量 + 数量）。
  function traceGroupContext(items, bounds) {
    const arr = items || [];
    const cx = bounds ? bounds.x + bounds.w / 2 : 0;
    const cy = bounds ? bounds.y + bounds.h / 2 : 0;
    let dRot = 0;
    for (const it of arr) { const r = (it && (it._rot || it.rot)) || 0; if (Math.abs(r) > Math.abs(dRot)) dRot = r; }
    return { n: arr.length, cx, cy, dRot };
  }
  /* PURE-END traceGroupContext */
  GW.traceGroupContext = traceGroupContext;
  /* PURE-BEGIN normalizeTraceFields */
  // 纯函数：留痕副本按「组旋转增量」统一归一化后作为静态快照（不改入参，返回新对象）。
  // pts/segs 类几何在点列里，_rot 只是虚线框辅助角 ⇒ 归零；pb/ms 依赖 rot 绘制 ⇒ 只归零 _rot、保留 rot。
  function normalizeTraceFields(c, ctx) {
    if (!c || typeof c !== 'object') return c;
    const o = Object.assign({}, c);
    if (ctx && ctx.dRot) {              // 确实旋转过才归一化；未旋转 ⇒ 与 GW.clone 逐字等价
      o._rot = 0;
      if (o.type !== 'pb' && o.type !== 'ms') o.rot = 0;
      delete o._rw; delete o._rh; delete o._mrb;
      delete o.pv; delete o.pvOn;
    }
    return o;
  }
  /* PURE-END normalizeTraceFields */
  GW.normalizeTraceFields = normalizeTraceFields;
  GW.traceSelection = function () {
    const its = sel.items.filter((i) => i && i.kind !== 'obj' && !i.trace);
    if (!its.length) { GW.toast('请先选中要留痕的图形'); return 0; }
    // WP5：整组共享同一变换增量，副本归一化后再克隆，混合类型 / 旋转后留痕不再错位或数量异常。
    const ctx = traceGroupContext(its, sel.bounds());
    const adds = its.map((it) => {
      const c = normalizeTraceFields(GW.clone(it), ctx);
      c.id = GW.uid();
      c.trace = true;
      c.opacity = Math.min(0.5, (it.opacity == null ? 1 : it.opacity) * 0.42);
      c.alpha = c.opacity;
      c.width = Math.max(1.2, (it.width || 2) * 0.7);
      c.dash = true;
      if (it.type === 'pb' || it.type === 'ms') c.dashStyle = 'dashed';
      return c;
    });
    GW.addItems(adds);
    GW.toast('已留痕 ' + adds.length + ' 个', 1200);
    return adds.length;
  };
  GW.pageTraces = () => (GW.page().ink || []).filter((i) => i && i.trace);
  GW.clearTraces = function () {
    const list = GW.pageTraces();
    if (!list.length) { GW.toast('这一页还没有留痕'); return 0; }
    const keep = sel.items.filter((i) => !i.trace);
    GW.removeItems(list);
    sel.set(keep);
    GW.toast('已清除 ' + list.length + ' 个留痕', 1200);
    return list.length;
  };
  // 锁定 / 解锁选中对象的位置：锁定后可直接在它的区域里书写，拖动则是平移整块画布
  GW.toggleLockSelection = function (force) {
    const objs = sel.items.filter((i) => i.kind === 'obj');
    if (!objs.length) { GW.toast('请先用「选择」工具选中一个图片 / 课件 / 仿真等项目'); return; }
    const to = force != null ? !!force : !objs.every((o) => o.locked);
    const ups = [];
    for (const o of objs) {
      if (!!o.locked === to) continue;
      const before = GW.clone(o);
      o.locked = to;
      ups.push({ before, after: o });
    }
    if (!ups.length) return;
    GW.commit({ update: ups });
    for (const o of objs) GW.objects.update(o);
    sel.render();
    GW.toast(to ? '已锁定位置：可直接在这些项目上书写，拖动则移动整块画布' : '已解锁：可以拖动、缩放这些项目', 2400);
  };
  // 1.6.8（R7）：选中画布上的笔迹 → 离线识别成公式。以前只能在公式板里从空白写，
  // 已经写在板书上的式子要擦掉重写。这里把选区的笔迹缩放到公式板坐标里当种子。
  GW.inkToFormula = function (items) {
    if (!GW.inkrecog || !GW.inkrecog.infer) { GW.toast('识别模块还没加载完'); return null; }
    const list = (items || (GW.selection && GW.selection.items) || [])
      .filter((it) => it && it.kind === 'stroke' && it.pts && it.pts.length >= 4);
    if (!list.length) { GW.toast('先框选要识别的笔迹（只能是手写，不能混图形）'); return null; }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const it of list) {
      for (let i = 0; i < it.pts.length; i += 2) {
        x0 = Math.min(x0, it.pts[i]); x1 = Math.max(x1, it.pts[i]);
        y0 = Math.min(y0, it.pts[i + 1]); y1 = Math.max(y1, it.pts[i + 1]);
      }
    }
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    const k = Math.min(4, 560 / w, 240 / h);            // 公式板内部是 620×300，四周留 30
    const seeds = list.map((it) => {
      const a = [];
      for (let i = 0; i < it.pts.length; i += 2) a.push((it.pts[i] - x0) * k + 30, (it.pts[i + 1] - y0) * k + 30);
      return a;
    });
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    GW.formulaPad({
      strokes: seeds,
      onPick: (tex) => {
        if (!tex) { GW.toast('没认出来，可以换「分格写」再试'); return; }
        const tmp = document.createElement('div');
        tmp.style.cssText = 'position:absolute;visibility:hidden;font-size:48px';
        document.body.append(tmp);
        let ow = 180, oh = 60;
        try {
          window.katex.render(tex, tmp, { displayMode: true, throwOnError: false });
          ow = tmp.scrollWidth + 20; oh = tmp.scrollHeight + 10;
        } catch (e) { /* 渲染失败用兜底尺寸 */ }
        tmp.remove();
        const fw = ow / GW.camera.s, fh = oh / GW.camera.s;
        GW.objects.create('formula', { tex, color: GW.tool.pen.color },
          { x: cx - fw / 2, y: cy - fh / 2, w: fw, h: fh, exact: true });
        GW.toast('已插入公式（原笔迹保留，可自行擦除）');
      },
    });
    return list.length;
  };

  GW.recolorSelection = function (color) {
    const ups = [];
    for (const it of sel.items) if (it.kind !== 'obj') {
      const before = GW.clone(it);
      it.color = color;
      if (it.type === 'pb') { it.fillColor = color; if (it.hasBorder !== false) it.color = color; }
      // 1.6.8（R1）：显式指定过填充色的图形，改描边色时填充色保持不动
      else if (it.fillColor) { it.fill = hexA(it.fillColor, it.fillAlpha != null ? it.fillAlpha : 0.18); }
      else if (it.fill) it.fill = hexA(color, it.fillAlpha != null ? it.fillAlpha : 0.18);
      GW.invalidateStyle(it);
      ups.push({ before, after: it });
    }
    if (ups.length) { GW.commit({ update: ups }); GW.requestRender(); }
  };
  // 1.5.0：把选中的笔迹改成 实线 / 虚线 / 点线（GoodNotes、Notability 里「圈住手写再改样式」的同一个动作）
  GW.restyleSelection = function (style) {
    const ups = [];
    for (const it of sel.items) if (it.kind === 'stroke') {
      const before = GW.clone(it);
      if (!style || style === 'solid') delete it.dashStyle; else it.dashStyle = style;
      GW.invalidate(it);
      ups.push({ before, after: it });
    }
    if (ups.length) { GW.commit({ update: ups }); GW.requestRender(); }
    return ups.length;
  };

  // ---------- 清屏 ----------
  GW.clearInk = function (all) {
    const p = GW.page();
    const items = all ? p.ink.concat(p.objs) : p.ink.slice();
    if (!items.length) return;
    // 1.1.16（R2）：本地照旧整删（撤销要靠历史里的原文），但**同步只发一条紧凑指令**。
    // 以前是「整页条目原文塞进一条 op」，长板书能到几百 KB；客户端是串行队列，一条大 op
    // 排在里面，观感就是「点了清屏，对面半天没反应」。
    GW.removeItems(items, true, { silent: true });
    if (GW.syncEmit) GW.syncEmit({ pageId: p.id, clear: all ? 'all' : 'ink' });
    GW.toast(all ? '已清空本页（可撤销）' : '已清除本页笔迹（可撤销）');
  };

  // ---------- 初始化 ----------
  GW.applyToolSettings = () => {
    const s = GW.settings;
    if (!s) return;
    if (s.penColor) tool.pen.color = s.penColor;
    if (s.penWidth) tool.pen.width = s.penWidth;
    if (s.penMode) tool.pen.mode = s.penMode === 'brush' ? 'brush' : 'pen';
    if (s.penStyle) tool.pen.style = s.penStyle;
    if (s.hlColor) tool.hl.color = s.hlColor;
    if (s.hlWidth) tool.hl.width = s.hlWidth;
    if (s.eraser) {
      tool.eraser.mode = s.eraser.mode === 'stroke' ? 'stroke' : 'area';
      tool.eraser.size = GW.clamp(Number(s.eraser.size) || 36, 16, 120);
    }
  };
  GW.initInput = function () {
    GW.applyToolSettings();
    capture = document.getElementById('capture');
    stage = document.getElementById('stage');
    for (const el of [capture, stage]) {
      el.addEventListener('pointerdown', (e) => {
        if (el === stage && e.target.closest('.obj, .geo-tool')) return;
        if (el === stage && tool.current !== 'hand') return;
        onDown(e);
      });
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('lostpointercapture', (e) => { if (pointers.has(e.pointerId)) onUp(e); });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    // 落点指示（#cur-dot）：app.css 把 pen/hl/shape/eraser/laser 这五个工具下 #capture 的
    // cursor 设成 none —— 触摸屏上没关系（手指/笔本身就在屏幕上），**鼠标**用户却完全看不到
    // 落点。所以：悬停在画布上就把小点挪到指针处，一落笔（书写、拖动、点按钮）立刻隐藏，
    // 位置让给墨迹本身。两种指针两种样子：鼠标 8px 实心点；数位板的笔悬停（pointerType
    // 'pen' 且 buttons 为 0）给一圈 16px 空心环（.pen）—— 实心点正好压住要落笔的那一小块，
    // 白底上一颗白点也看不见，而环中间是通的，落点就是环心。触摸不给：手指/红外屏本来就在
    // 屏幕上，没有悬停这回事。1.5.3 起橡皮从这一组里去掉：它自己的光圈才是真尺寸的落点
    // 指示（见下面「橡皮悬停光圈」），再叠一个小红点只是噪声。
    const dot = document.getElementById('cur-dot');
    const DOT_TOOLS = ['pen', 'hl', 'shape', 'laser'];
    // 红点颜色 = 当前工具画出来的颜色：笔与图形用笔色（图形描边和文本都取 tool.pen.color，
    // 见下面 onDown 里的 strokeColor），荧光笔用荧光笔色。橡皮/激光笔没有「颜色」概念，
    // 返回空串 ⇒ 回落到 app.css 里的默认红。颜色写进 CSS 变量 --dot-c 而不是 inline 的
    // background：.pen 环要拿同一个值当 border-color，同时把底留成透明。
    const dotColor = () => {
      if (tool.current === 'hl') return tool.hl.color;
      if (tool.current === 'pen' || tool.current === 'shape') return GW.inkFix ? GW.inkFix(tool.pen.color) : tool.pen.color;
      return '';
    };
    let dotCol = null;   // 上一次写进 style 的颜色（避免每次 pointermove 都碰一次样式）
    const paintDotColor = () => {
      if (!dot) return;
      const c = dotColor();
      if (c !== dotCol) { dotCol = c; dot.style.setProperty('--dot-c', c); }
    };
    // 静默收点：一开始只给笔（有的数位板驱动抬笔不发 pointerleave，环会僵在屏上）。
    // 2.1.1 起**鼠标也收**：投影/大屏场景下鼠标停在板书上会一直压住内容，老师要的是
    // 「手一停画面就干净」。鼠标阈值取设置里的 ptrIdleMs（默认 3s，与球自身 3.5s 的
    // 变暗节奏错开半秒：先收光标、再暗球）；笔仍用 4000，那是驱动侧的兜底，与手感无关，不动它。
    // 单个 timer + deadline，不会每次移动都新建一个。
    // 2.2.3（R5）：五档可配（永不 / 1 / 2 / 3 / 5 秒），鼠标与手写笔各存一个键（ptrIdleMs / ptrIdlePenMs）。
    // 返回 0 表示「永不静默」—— 调用方据此不挂计时器（挂一个 Infinity 的 setTimeout 会被引擎夹成 1ms，
    // 反而立刻把点收掉，这是 JS 的老坑）。
    const idleOf = (v, dflt) => { const n = +v; return isFinite(n) && n >= 0 ? n : dflt; };
    const dotIdleMouse = () => { const v = idleOf((GW.settings || {}).ptrIdleMs, 3000); return v === 0 ? 0 : Math.max(500, v); };
    const dotIdlePen = () => { const v = idleOf((GW.settings || {}).ptrIdlePenMs, 4000); return v === 0 ? 0 : Math.max(500, v); };
    let dotDeadline = 0, dotTimer = 0;
    const stopDotIdle = () => {
      if (dotTimer) { clearTimeout(dotTimer); dotTimer = 0; }
      dotDeadline = 0;
    };
    const hideDot = () => {
      stopDotIdle();
      if (dot && dot.style.display !== 'none') dot.style.display = 'none';
    };
    const armDotIdle = (ms) => {
      const wait = ms >= 0 ? ms : dotIdleMouse();
      // 0 = 「永不」：把可能还在跑的旧计时器停掉，不新挂 —— 老师明确要求它别消失。
      if (!wait) { stopDotIdle(); return; }
      dotDeadline = performance.now() + wait;
      if (dotTimer) return;                 // 已有 timer：tick 会按新的 deadline 重排
      const tick = () => {
        dotTimer = 0;
        const left = dotDeadline - performance.now();
        if (left > 0) { dotTimer = setTimeout(tick, left + 50); return; }
        hideDot();
      };
      dotTimer = setTimeout(tick, wait + 50);
    };
    let dotPen = false;  // 当前点是不是「笔悬停」的样子（.pen 空心环）
    if (dot) {
      // 只在 #capture 上听 pointermove：鼠标移到工具栏/抽屉/画布对象上时，事件不再落到
      // #capture（那些层压在它上面），红点自然不会跟过去，也不需要另外做命中测试。
      capture.addEventListener('pointermove', (e) => {
        const isPen = e.pointerType === 'pen';
        // 'off' 档彻底不显示；'always' 档不参与静默收点（老师明确要求它别消失）
        const dotMode = (GW.settings || {}).ptrDot || 'auto';
        if (dotMode === 'off') return hideDot();
        // buttons 非 0 = 正按着（书写/拖动/擦除）⇒ 收起，位置让给墨迹；触摸不是 mouse/pen
        // ⇒ 一律不显示。
        if (e.buttons || (e.pointerType !== 'mouse' && !isPen) || DOT_TOOLS.indexOf(tool.current) < 0) return hideDot();
        // 鼠标点与笔环半径不同（8px vs 16px），换类时要重新居中；只在这一步动样式
        if (isPen !== dotPen) { dotPen = isPen; dot.classList.toggle('pen', isPen); }
        dot.style.transform = 'translate3d(' + e.clientX.toFixed(1) + 'px,' + e.clientY.toFixed(1) + 'px,0)';
        paintDotColor();
        if (dot.style.display !== 'block') dot.style.display = 'block';
        if (dotMode !== 'always') armDotIdle(isPen ? dotIdlePen() : dotIdleMouse());
      });
      // 换工具（红点正显示时也要立刻换色，不然要等下一次 pointermove）
      GW.bus.on('tool', paintDotColor);
      // 换色板/改笔色（penPop、悬浮球快捷色板、荧光笔色）后同样立即生效
      GW.bus.on('pen', paintDotColor);
      capture.addEventListener('pointerleave', hideDot);
      // 任何地方按下鼠标都立即收起：起笔那一瞬间光标就该消失（擦除、拖尺规、点按钮同理）
      window.addEventListener('pointerdown', hideDot, true);
      window.addEventListener('blur', hideDot);
      GW.bus.on('tool', hideDot);
    }
    // 橡皮悬停光圈（1.5.3）：没落笔就先看见「这一下会擦掉多大一块」，尺寸就是滑杆里的
    // 「橡皮大小」（屏幕 px 直径，与 eraserDown 里 rScreen 同一口径）。
    // 复用 #erase-ring —— 擦除过程中由 eraserDown 的 paintRing() 写尺寸，悬停时由这里写，
    // 外观靠 .hover 类区分（悬停淡一档，避免一个大白团盖住要看的内容）。
    // 只认鼠标与笔：触摸没有悬停这回事。
    const ringEl = document.getElementById('erase-ring');
    let ringOn = false;
    const hideRingHover = () => {
      if (!ringEl || !ringOn) return;
      ringOn = false;
      ringEl.classList.remove('hover');
      ringEl.style.display = 'none';
    };
    const showRingHover = (e) => {
      if (!ringEl) return;
      if (tool.current !== 'eraser' || e.buttons || (e.pointerType !== 'mouse' && e.pointerType !== 'pen')) return hideRingHover();
      const r = tool.eraser.size / 2;
      ringOn = true;
      ringEl.classList.add('hover');
      ringEl.style.width = (r * 2).toFixed(1) + 'px';
      ringEl.style.height = ringEl.style.width;
      ringEl.style.transform = 'translate3d(' + (e.clientX - r).toFixed(1) + 'px,' + (e.clientY - r).toFixed(1) + 'px,0)';
      if (ringEl.style.display !== 'block') ringEl.style.display = 'block';
    };
    capture.addEventListener('pointermove', showRingHover);
    capture.addEventListener('pointerleave', hideRingHover);
    GW.bus.on('tool', hideRingHover);
    window.addEventListener('pointerdown', hideRingHover, true);
    window.addEventListener('blur', hideRingHover);
    // 滚轮缩放；触控板双指滑动平移
    stage.addEventListener('wheel', (e) => {
      if (e.target.closest('.obj.chrome-window .obj-body') && !e.ctrlKey) return;
      e.preventDefault();
      const wz = GW.pt(e.clientX, e.clientY);
      if (e.ctrlKey) {
        // 1.7.0（T05）：**触控板捏合**。Chromium 把 pinch 报成 ctrl + wheel，而 deltaY 的量级
        // 随设备差一个数量级（触控板常见 |deltaY| = 1~10，鼠标按住 Ctrl 滚一格是 100+）。
        // 照滚轮那样按 |deltaY| 算步长，触控板上「轻轻一捏就飞出画面」，鼠标上又几乎没有反应。
        // 所以这里**只认方向、不认大小**：一次事件固定 ±2%，放大多少由事件数决定（= 无惯性，
        // 手指离开触控板就没有后续事件了，不会像滚轮那样按 |deltaY| 继续冲）。
        // 探针断言：deltaY=+1 与 deltaY=+100 走同一步（缩放因子逐位相同）。
        GW.zoomAt(wz.x, wz.y, e.deltaY > 0 ? 1 / 1.02 : 1.02);
        return;
      }
      // 1.7.0（T05）：非 ctrlKey = 真滚轮 / 双指拖动，行为与以前完全一致。
      if (Math.abs(e.deltaY) >= 50 && e.deltaMode === 0 && !e.deltaX) GW.zoomAt(wz.x, wz.y, Math.exp(-e.deltaY * 0.0015));
      else if (e.deltaMode === 1) GW.zoomAt(wz.x, wz.y, Math.exp(-e.deltaY * 0.05));
      else GW.panBy(-e.deltaX, -e.deltaY);
    }, { passive: false });
    // #capture 是 #stage 的兄弟节点，落在它上面的滚轮要转发给 stage（转发一次，不要再冒泡）
    // 1.7.0（T05）：`new WheelEvent('wheel', e)` 把**事件对象**当 init 字典传，而 ctrlKey/deltaY/deltaMode
    // 都是原型上的取值器、不是自有属性 ⇒ 一个字段都拷不过去（转发出去的是 deltaY=0、ctrlKey=false
    // 的空事件，落在书写层上的滚轮因此既不缩也不移）。这里逐字段显式转发。
    capture.addEventListener('wheel', (e) => {
      stage.dispatchEvent(new WheelEvent('wheel', {
        clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
        deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
      }));
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
      if (c && k === 'z') { e.preventDefault(); e.shiftKey ? GW.redo() : GW.undo(); }
      else if (c && k === 'y') { e.preventDefault(); GW.redo(); }
      else if (c && k === 's') { e.preventDefault(); GW.storage.save(e.shiftKey); }
      // 1.6.7（T16）：Ctrl+Alt+O 打开大纲 / 目录（Ctrl+O 仍是打开文件）
      else if (c && e.altKey && k === 'o') { e.preventDefault(); if (GW.showOutline) GW.showOutline(); }
      // 1.6.7（T15）：Ctrl+Alt+M 在当前视野中心插一枚评论钉
      else if (c && e.altKey && k === 'm') { e.preventDefault(); if (GW.addComment) GW.addComment(); }
      // 1.6.7（T14）：Ctrl+Alt+P 进入 / 退出演示模式
      else if (c && e.altKey && k === 'p') { e.preventDefault(); if (GW.present) GW.present.toggle(); }
      // 1.6.7（T19）：Ctrl+Alt+K 打开记忆卡
      else if (c && e.altKey && k === 'k') { e.preventDefault(); if (GW.showCards) GW.showCards(); }
      else if (c && k === 'o') { e.preventDefault(); GW.storage.open(); }
      else if (c && k === 'c') { GW.copySelection(); }
      // 1.3.0（R7）：Ctrl+Shift+V = 贴回复用架最近一件（普通 Ctrl+V 仍然是贴剪贴板，见 paste 事件）
      else if (c && e.shiftKey && k === 'v') {
        e.preventDefault();
        if (!GW.shelf || !GW.shelf.list().length) GW.toast('复用架还是空的：先框选一点东西按 Ctrl+C');
        else GW.shelf.pasteAt(0);
      }
      else if (c && k === 'd') { e.preventDefault(); GW.duplicateSelection(); }
      // 1.6.6（T06）：成组 / 解组。Ctrl+G 与很多编辑器的「查找下一个」同键，但画布里 Ctrl+F 才是搜索，
      // Ctrl+G 一直是空的；成组是框选后最高频的下一步操作。
      else if (c && k === 'g') { e.preventDefault(); if (e.shiftKey) GW.ungroupSelection(); else GW.groupSelection(); }
      else if (c && k === 'a') { e.preventDefault(); tool.set('select'); const p = GW.page(); sel.set(p.ink.concat(p.objs)); }
      else if (k === 'delete' || k === 'backspace') GW.deleteSelection();
      else if (c && (k === '=' || k === '+')) { e.preventDefault(); GW.zoomAt(GW.viewSize().w / 2, GW.viewSize().h / 2, 1.25); }
      else if (c && k === '-') { e.preventDefault(); GW.zoomAt(GW.viewSize().w / 2, GW.viewSize().h / 2, 0.8); }
      else if (c && k === '0') { e.preventDefault(); GW.fitContent(); }
      else if (c && k === 'f') { e.preventDefault(); GW.search && GW.search.toggle(); }
      else if (c && k === 'l') { e.preventDefault(); GW.search && GW.search.tagSelection(); }
      else if (!c && !e.altKey) {
        const map = { h: 'hand', p: 'pen', g: 'hl', e: 'eraser', v: 'select', t: 'text', l: 'laser', s: 'shape' };
        if (map[k]) tool.set(map[k]);
        // 1.6.6（T08）：笔宽快捷键。1–5 = 工具坞「粗细」那五档（WIDTHS），[ / ] 减/加一档。
        // 只动笔的宽度，不切到笔工具 —— 写字途中临时改粗细不该顺手换工具。
        // 输入态已被上面那句 return 挡掉，所以文本框里按 3 仍然是字符 3。
        else if (/^[1-5]$/.test(k) || k === '[' || k === ']') {
          if (GW.setPenWidth) {
            e.preventDefault();
            const WS = [2, 3, 5, 8, 13];
            const cur = GW.tool.pen.width;
            let i0 = 0;
            for (let i = 1; i < WS.length; i++) if (Math.abs(WS[i] - cur) < Math.abs(WS[i0] - cur)) i0 = i;
            const i = /^[1-5]$/.test(k) ? (+k - 1) : GW.clamp(i0 + (k === ']' ? 1 : -1), 0, WS.length - 1);
            GW.setPenWidth(WS[i]);
            GW.toast('笔宽 ' + WS[i], 1200);
          }
        }
        else if (k === 'pagedown' || k === 'arrowright' && e.shiftKey) GW.gotoPage(GW.doc.cur + 1);
        else if (k === 'pageup' || k === 'arrowleft' && e.shiftKey) GW.gotoPage(GW.doc.cur - 1);
        else if (k === 'space' || k === ' ') { e.preventDefault(); GW.physShapes && GW.physShapes.toggleAll(); }
        else if (k === 'r') { GW.physShapes && GW.physShapes.resetAll(); }
        else if (k === 'escape') { sel.clear(); GW.bus.emit('escape'); }
        else if (k === 'f11') {
          e.preventDefault();
          // 桌面走主进程的真窗口全屏；网页 / 安卓没有窗口控制（shim 的 win 是空桩），
          // 回落到元素全屏 API，这样平板上按 F11 / 外接键盘也能全屏，而不是按了没反应。
          const w = window.gewu;
          if (w && w.isElectron === true && typeof w.win === 'function') w.win('full');
          else if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => { /* 浏览器拒绝就算了 */ });
          }
        }
      }
    });
    // 粘贴：内部剪贴板优先，其次系统剪贴板中的图片/文本
    document.addEventListener('paste', (e) => {
      const t = e.target;
      if (t.isContentEditable || /INPUT|TEXTAREA/.test(t.tagName)) return;
      const files = [...(e.clipboardData.files || [])];
      if (files.length) { e.preventDefault(); GW.importer.importFiles(files); return; }
      if (GW.paste()) { e.preventDefault(); return; }
      const txt = e.clipboardData.getData('text/plain');
      if (txt) {
        e.preventDefault();
        if (/^https?:\/\/\S+$/.test(txt.trim())) GW.importer.insertWeb(txt.trim());
        else GW.objects.create('text', { html: txt.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]).replace(/\n/g, '<br>'), size: 32 / GW.camera.s, color: tool.pen.color }, { w: 600 / GW.camera.s, h: 60 / GW.camera.s, exact: true });
      }
    });
  };
  // ---------- 1.7.0（T03 / T06 / T08 / T13）：借自 NoteApp 的四个手感 ----------
  //
  // 三项（T06 停住变形状 / T08 三选一候选条 / T13 画圈即选中）共用**同一个「抬手决策」入口**：
  // 顺序固定为 T13 → T06 → T08。T06 与 T13 互斥：T13 命中时这一笔根本不进文档，也就没有 T06。
  //
  // T03 选区虚线框与手柄的屏幕尺寸：`#sel-ui` 与 `.sh` 是 CSS px 的 fixed 元素，本来就与相机
  // 缩放无关，但 app.css 里写的是 2px 描边 / 26px 手柄（差得远）。项目约定不许改 app.css，
  // 所以在 input.js 里补一层样式（同选择器、后加载，稳压 app.css；将来 app.css 改了这里也跟着变）。
  // 硬指标：描边恒 1.5 屏幕 px、手柄直径恒 12 屏幕 px，0.5×/1×/2× 下逐像素相同。
  (function injectSelChrome() {
    if (document.getElementById('gw-sel-chrome')) return;
    const st = document.createElement('style');
    st.id = 'gw-sel-chrome';
    st.textContent = [
      '#sel-ui{border-width:1.5px !important}',
      '#sel-ui .sh{box-sizing:border-box !important;width:12px !important;height:12px !important;border-width:1.5px !important}',
      '#sel-ui .sh.nw{left:-6px !important;top:-6px !important}',
      '#sel-ui .sh.ne{right:-6px !important;top:-6px !important}',
      '#sel-ui .sh.sw{left:-6px !important;bottom:-6px !important}',
      '#sel-ui .sh.se{right:-6px !important;bottom:-6px !important}',
      '#sel-ui .sh.n{left:50% !important;top:-6px !important;margin-left:-6px !important}',
      '#sel-ui .sh.s{left:50% !important;bottom:-6px !important;margin-left:-6px !important}',
      '#sel-ui .sh.e{right:-6px !important;top:50% !important;margin-top:-6px !important}',
      '#sel-ui .sh.w{left:-6px !important;top:50% !important;margin-top:-6px !important}',
      // 旋转绿点**不跟着缩**：app.css 的契约是 26px、钮心在框上边外 31px（scripts/probe-sel-rot.js
      // 逐像素量这个），被上面那条 .sh 规则连坐压成 12px 会把「旋转键几何」那条回归打红。
      '#sel-ui .sh.rot{width:26px !important;height:26px !important;border-width:3px !important;left:50% !important;top:-46px !important;margin-left:-13px !important}',
    ].join('');
    document.head.appendChild(st);
  })();

  const HOLD_MS = 300;              // 停笔多久开始判定（任务书 T06）
  const HOLD_CLOSE = 0.85;          // 闭合度 = 1 - 首尾缺口 / 周长
  const CAND_MS = 5000;             // 候选条存活时间（不选 = 默认的规则多边形）
  const BEAUTIFY_KEY = 'gewu.beautify.style';
  let holdT = 0, holdIt = null;                    // T06：定时器 + 等判定的条目
  let candEl = null, candIt = null, candBack = null, candT = 0;   // T08：候选条与它的两条备选
  let holdLast = { fired: false, why: 'idle' };
  // 探针入口（scripts/probe-draw-hold.js 用它区分「没到时」与「到了但判不出来」）
  // 注意：本文件有**两个** IIFE（第一个在 :2，到 :3717 结束；第二个从 :3723 开始），
  // 而收笔路径 st.up 在第一个 IIFE 里 —— 这两个函数必须经 GW 冒出去才互相看得见，
  // 和 GW.__snap / GW.__hist 是同一套「私有调试口」约定（不写进设置、不参与序列化）。
  GW.__hold = {
    pending: () => !!holdT,
    last: () => holdLast,
    bar: () => (candEl ? candEl : null),
    cancel: holdCancel,
    schedule: holdSchedule,      // 抬手决策：T06 → T08（函数声明已提升，这里取得到）
    pickCircle: circleLassoPick, // T13：闭合 + 圈内 ≥2 个对象 ⇒ 返回那几个对象
  };

  function holdCancel() {
    if (holdT) { clearTimeout(holdT); holdT = 0; holdIt = null; }
  }
  // 一笔的几何量：周长、首尾缺口、闭合度、包围盒、对角线（世界单位；s = 1 屏幕 px 有多少世界单位）
  function strokeGeom(it) {
    const P = it && it.pts;
    if (!P || P.length < 8) return null;
    let len = 0, x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let i = 0; i < P.length; i += 2) {
      const x = P[i], y = P[i + 1];
      if (x < x1) x1 = x; if (x > x2) x2 = x;
      if (y < y1) y1 = y; if (y > y2) y2 = y;
    }
    for (let i = 2; i < P.length; i += 2) len += Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]);
    const gap = Math.hypot(P[0] - P[P.length - 2], P[1] - P[P.length - 1]);
    const w = x2 - x1, h = y2 - y1;
    return {
      P, len, gap, close: len > 0.5 ? Math.max(0, 1 - gap / len) : 0,
      x1, y1, w, h, diag: Math.hypot(w, h), s: GW.camera.s || 1,
    };
  }
  // 3~4 边的「正多边形」门槛。regularN 只认 ≥5 边（它的注释解释了为什么），
  // 但三角形 / 正方形同样是「停住就变形状」的目标，所以把同一套判据（半径比 + 夹角均匀度，
  // 常数与 regularN 完全一致）复制一份给 3~4 边用 —— 改门槛时两处必须一起改。
  function regAny(P, c) {
    const n = P.length / 2;
    if (n < 3) return 0;
    const ang = [];
    let rmin = Infinity, rmax = 0;
    for (let i = 0; i < n; i++) {
      const dx = P[2 * i] - c.x, dy = P[2 * i + 1] - c.y;
      ang.push(Math.atan2(dy, dx));
      const r = Math.hypot(dx, dy);
      rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
    }
    if (!(rmin > 1e-6) || rmax / rmin > 1.30) return 0;
    ang.sort((a, b) => a - b);
    const mean = (Math.PI * 2) / n;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const g = i === n - 1 ? ang[0] + Math.PI * 2 - ang[i] : ang[i + 1] - ang[i];
      s2 += (g - mean) * (g - mean);
    }
    return Math.sqrt(s2 / n) / mean < 0.22 ? n : 0;
  }
  // 把一条笔迹换成形状（保 id：撤销 / 协同 / 选区都按 id 认对象）
  function polyOf(src, pts, closed, smooth) {
    const o = {
      id: src.id, kind: 'shape', type: 'poly', pts: pts.slice(), closed: !!closed,
      color: src.color, width: src.width || 2,
    };
    if (src.dashStyle) o.dashStyle = src.dashStyle;
    if (src.alpha != null) o.alpha = src.alpha;
    if (smooth) o.smooth = true;
    if (src._rot) { o._rot = src._rot; if (src._rw) { o._rw = src._rw; o._rh = src._rh; } }
    return o;
  }
  // 就地替换一条墨迹，**只记一条 undo**（before/after 同一条 op）。
  // 旧几何与新几何都要重画：增量绘制出来的像素在墨迹层上是真实像素，不擦会留残影。
  function swapItem(oldIt, next) {
    const page = GW.page();
    const i = page.ink.indexOf(oldIt);
    if (i < 0) return false;
    const before = GW.clone(oldIt);
    page.ink[i] = next;
    GW.invalidate(next);
    const si = (sel.items || []).indexOf(oldIt);
    if (si >= 0) { sel.items[si] = next; sel.render(); }
    GW.commit({ update: [{ before: before, after: next }] });
    const b1 = GW.bbox(before), b2 = GW.bbox(next);
    if (b1 && b2) {
      GW.renderPartial(
        Math.min(b1.x, b2.x) - 3, Math.min(b1.y, b2.y) - 3,
        Math.max(b1.x + b1.w, b2.x + b2.w) + 3, Math.max(b1.y + b1.h, b2.y + b2.h) + 3
      );
    } else GW.requestRender();
    return true;
  }
  // 「停住这一笔，它该变成什么」—— 纯函数，不改文档。返回 {pts, closed, n, kind} 或 null。
  function holdDecide(it) {
    const g = strokeGeom(it);
    if (!g) return null;
    const s = g.s;
    // 太短的一笔不动：写字的短横、偏旁里的提不能「停一下就拉直」
    if (g.len * s < 90) return null;
    if (g.close >= HOLD_CLOSE) {
      // ① 单笔闭合 + 长宽比 0.5~2 + 顶点数 3~8 ⇒ 规则多边形
      if (g.diag * s < 60) return null;
      if (!(g.w > 0) || !(g.h > 0)) return null;
      const ar = g.w / g.h;
      if (ar < 0.5 || ar > 2) return null;
      // 顶点提取：rdp 简化 → 去掉闭合处那个重合的尾点 → 归并收笔小钩。
      // 顶点数超出 3~8 时放宽简化容差重来（手抖会给出十几个假顶点），最多试 4 轮。
      let tol = Math.max(0.8, g.diag * 0.05), V = null, n = 0;
      for (let k = 0; k < 4; k++) {
        let Q = rdp(g.P, tol);
        if (Q.length >= 4 && Math.hypot(Q[0] - Q[Q.length - 2], Q[1] - Q[Q.length - 1]) < g.diag * 0.25) Q = Q.slice(0, -2);
        Q = mergeVerts(Q, g.diag);
        n = Q.length / 2; V = Q;
        if (n >= 3 && n <= 8) break;
        tol *= 1.6;
      }
      if (!V || n < 3 || n > 8) return null;
      const c = centroidOf(V);
      const rn = (n >= 5 ? regularN(V, c.x, c.y) : 0) || (regAny(V, c) ? n : 0);
      if (!rn) return null;
      // 摆正：顶点落在同一个圆（平均半径）上、夹角均分，第一个顶点保持手画时的方位。
      // 用平均半径而不是外接圆，包围盒才不会比原笔迹大一圈（探针断言包围盒不变形）。
      let r = 0;
      for (let i = 0; i < n; i++) r += Math.hypot(V[2 * i] - c.x, V[2 * i + 1] - c.y);
      r /= n;
      const a0 = Math.atan2(V[1] - c.y, V[0] - c.x);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = a0 + (i * Math.PI * 2) / n;
        pts.push(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
      }
      return { pts, closed: true, n, kind: 'poly' };
    }
    // ② 直线：首尾距离 > 包围盒对角线 0.85，且整笔离这条弦的最大偏移很小 ⇒ 两端点直线。
    if (g.gap > g.diag * 0.85 && g.gap * s >= 60) {
      let dev = 0;
      const ax = g.P[0], ay = g.P[1], bx = g.P[g.P.length - 2], by = g.P[g.P.length - 1];
      for (let i = 0; i < g.P.length; i += 2) {
        const d = distSeg(g.P[i], g.P[i + 1], ax, ay, bx, by);
        if (d > dev) dev = d;
      }
      if (dev < g.gap * 0.09) return { pts: [ax, ay, bx, by], closed: false, n: 0, kind: 'line' };
    }
    return null;
  }

  // T08：候选条。只有 T06 **真的**规整了才弹（见 holdSchedule）。
  // 自己建 DOM、fixed 挂在 body 上，不碰 app.js 的浮层；pointer-events 只在条上，
  // 条外一律穿透（它的兄弟节点是 #capture 全屏层，条本身只有几十像素宽）。
  function hideCand() {
    if (candT) { clearTimeout(candT); candT = 0; }
    if (candEl && candEl.parentNode) candEl.parentNode.removeChild(candEl);
    candEl = null; candIt = null; candBack = null;
  }
  function pickCand(key) {
    const it = candIt, back = candBack;
    hideCand();
    if (!it) return;
    try { localStorage.setItem(BEAUTIFY_KEY, key === 'smooth' ? 'smooth' : 'poly'); } catch (e) { /* 无痕模式就算了 */ }
    const page = GW.page();
    if (page.ink.indexOf(it) < 0) return;
    if (key === 'raw') { swapItem(it, GW.clone(back)); return; }
    if (key === 'smooth') { swapItem(it, polyOf(it, it.pts, it.closed, true)); return; }
    // key === 'poly'：几何已经是规则多边形，不产生空撤销
  }
  function showCand(it, back) {
    hideCand();
    candIt = it; candBack = back;
    const el = document.createElement('div');
    candEl = el;
    el.id = 'gw-beautify-bar';
    el.setAttribute('data-ms', String(CAND_MS));
    el.style.cssText = 'position:fixed;z-index:60;display:flex;align-items:center;gap:4px;padding:4px;'
      + 'border-radius:10px;background:#fff;border:1px solid rgba(27,36,51,.16);'
      + 'box-shadow:0 6px 20px rgba(27,36,51,.18);pointer-events:auto;'
      + 'font:13px/1.2 system-ui,-apple-system,"Microsoft YaHei",sans-serif;color:#1b2433';
    const mk = (label, key) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gw-beautify-btn';
      b.dataset.style = key;
      b.textContent = label;
      b.style.cssText = 'pointer-events:auto;border:0;background:transparent;padding:6px 10px;'
        + 'border-radius:8px;font:inherit;cursor:pointer;color:inherit';
      b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); pickCand(key); });
      return b;
    };
    el.append(mk('原笔迹', 'raw'), mk('规则多边形', 'poly'), mk('平滑曲线', 'smooth'));
    document.body.appendChild(el);
    // 位置：形状下方 12px，放不下就放上方；左右夹进视口
    const b = GW.bbox(it);
    const tl = GW.toScreen(b.x, b.y), br = GW.toScreen(b.x + b.w, b.y + b.h);
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = (tl.x + br.x) / 2 - w / 2, top = br.y + 12;
    if (top + h > innerHeight - 8) top = tl.y - h - 12;
    left = Math.max(8, Math.min(left, innerWidth - w - 8));
    top = Math.max(8, Math.min(top, innerHeight - h - 8));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    candT = setTimeout(() => { hideCand(); }, CAND_MS);   // 5 秒不选：保持默认（规则多边形）
  }

  // T06：抬手后起 300ms 定时器。任何落笔 / 带按键的移动 / 切工具 / 换页都取消（见文件末尾的监听）。
  // rec 非空（智能笔已经认成图形）时什么都不做 —— 那时已经是规则图形，再「规整」只会把圆变成多边形。
  function holdSchedule(it, rec) {
    holdCancel();
    holdLast = { fired: false, why: 'idle' };
    if (!(GW.settings && GW.settings.drawHold)) { holdLast.why = 'off'; return; }
    if (rec) { holdLast.why = 'recognized'; return; }
    if (!it || it.kind !== 'stroke' || !it.pts) { holdLast.why = 'not-stroke'; return; }
    holdIt = it;
    holdLast = { fired: false, why: 'pending' };
    holdT = setTimeout(() => {
      holdT = 0;
      const cur = holdIt; holdIt = null;
      const page = GW.page();
      if (!cur || page.ink.indexOf(cur) < 0) { holdLast = { fired: false, why: 'gone' }; return; }
      const out = holdDecide(cur);
      if (!out) { holdLast = { fired: false, why: 'no-shape' }; return; }
      let pref = 'poly';
      try { if (localStorage.getItem(BEAUTIFY_KEY) === 'smooth') pref = 'smooth'; } catch (e) { /* 无视 */ }
      const back = GW.clone(cur);
      const next = polyOf(cur, out.pts, out.closed, pref === 'smooth');
      if (!swapItem(cur, next)) { holdLast = { fired: false, why: 'swap-fail' }; return; }
      holdLast = { fired: true, why: out.kind, n: out.n };
      showCand(next, back);
    }, HOLD_MS);
  }

  // T13：画圈即选中。闭合度 > 0.85 且圈内中心点落在圈里的**对象** ≥ 2 个，才算套索。
  function circleLassoPick(st) {
    const g = strokeGeom(st);
    if (!g || g.close <= HOLD_CLOSE) return null;
    if (g.diag * g.s < 80) return null;                       // 画「o」「0」这种小圈不算
    const page = GW.page(), inside = [];
    for (const o of page.objs) {
      if (o.locked) continue;
      if (pointInPoly(o.x + o.w / 2, o.y + o.h / 2, g.P)) inside.push(o);
    }
    return inside.length >= 2 ? inside : null;
  }

  // 取消时机：任何落笔、带按键的移动、切工具、换页、撤销/重做
  document.addEventListener('pointerdown', holdCancel, true);
  document.addEventListener('pointermove', (e) => { if (e.buttons) holdCancel(); }, true);
  GW.bus.on('tool', holdCancel);
  GW.bus.on('page', holdCancel);
  GW.bus.on('history', () => { if (holdT) holdCancel(); });

})();

// 1.2.0：画布范围内的「选择模式」兜底拦截。
// CSS 的 user-select:none 能让蓝底高亮不再出现，但 iOS Safari 在长按后仍可能
// 弹出原生日历式的菜单、并触发 selectstart/dragstart；这里在捕获阶段再拦一层。
// 输入类元素（对话框、公式写板、对象里的文本框）完全放行。
(function () {
  const stageOf = (t) => (t && t.closest ? t.closest('#stage') : null);
  // #capture 是 #stage 的**兄弟**节点（index.html:23），不是子节点：指针事件落在它身上，
  // 所以「在画布上」不能只认 #stage，否则右键菜单永远不弹。
  const surfOf = (t) => (t && t.closest ? (t.closest('#stage') || t.closest('#capture')) : null);
  const typing = (t) => !!(t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]'));
  // 1.1.16：可滚动面板（设置 .dlg-b、抽屉 .dr-body、列表 .ui-list、.about、.sp-list、.pop…）里
  // 落指不许拦。touchstart 的 preventDefault 会取消整个手势的默认行为，原生滚动根本不启动 ——
  // 手机上的表现就是「手指上滑设置页不滚，只有右侧滑块那一小块能滚」。画布/顶栏仍照旧拦。
  const canScroll = (t) => {
    for (let el = t; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll|overlay)/.test(cs.overflowY) || /(auto|scroll|overlay)/.test(cs.overflowX)) return true;
      }
    }
    return false;
  };
  document.addEventListener('selectstart', (e) => {
    if (stageOf(e.target) && !typing(e.target)) e.preventDefault();
  }, true);
  document.addEventListener('contextmenu', (e) => {
    if (!surfOf(e.target) && !(e.target.closest && e.target.closest('.obj'))) return;
    if (typing(e.target)) return;
    // 浏览器菜单一律不弹（这是原来的行为，保留）：长按、笔侧键发来的 contextmenu 也走这里。
    e.preventDefault();
    // 1.6.6（T07）：只认真正的右键（button===2）。有些手写笔长按会发一个 button=0 的
    // contextmenu，那条路属于长按手势（尺规的 330ms 长按让位），弹菜单会把手势吃掉。
    if (e.button !== 2 || !GW.menuAt) return;
    const card = e.target.closest && e.target.closest('.obj[data-id]');
    let hit = null;
    if (card) hit = GW.page().objs.find((o) => o.id === card.dataset.id) || null;
    else {
      const p = GW.pt(e.clientX, e.clientY);
      hit = GW.hitTop(GW.toWorld(p.x, p.y));
    }
    if (!hit) { GW.selection.clear(); return; }        // 空白处右键：什么都不弹（也不放浏览器菜单）
    if (!(GW.selection.items || []).includes(hit)) GW.selection.set([hit]);
    const isObj = hit.kind === 'obj';
    const many = (GW.selection.items || []).length >= 2;
    const items = [
      { label: '复制', key: 'Ctrl+C', fn: () => GW.copySelection() },
      { label: '剪切', key: 'Ctrl+X', fn: () => { if (GW.copySelection()) GW.deleteSelection(); } },
      { label: '删除', key: 'Del', danger: true, fn: () => GW.deleteSelection() },
      { sep: true },
      // 成组 / 解组（T06）：没实现时这两个入口 disabled，不留下「点了没反应」的死按钮。
      { label: '成组', key: 'Ctrl+G', disabled: !many || !GW.groupSelection, fn: () => GW.groupSelection && GW.groupSelection() },
      { label: '解组', key: 'Ctrl+Shift+G', disabled: !GW.ungroupSelection || !GW.isGrouped || !GW.isGrouped(hit), fn: () => GW.ungroupSelection && GW.ungroupSelection() },
      { sep: true },
      // 1.6.8（R7）：离线识别 —— 不需要模型，选中笔迹就能试一次
      {
        label: '识别为公式…', disabled: !GW.inkToFormula || !(GW.selection.items || []).every((x) => x.kind === 'stroke'),
        fn: () => GW.inkToFormula && GW.inkToFormula(),
      },
      { sep: true },
      isObj ? {
        label: hit.locked ? '解锁位置' : '锁定位置',
        fn: () => {
          const before = GW.clone(hit);
          hit.locked = !hit.locked;
          GW.objects.update(hit);
          GW.commit({ update: [{ before, after: hit }] });
          GW.toast(hit.locked ? '已锁定位置：可直接在该项目上书写' : '已解锁：可拖动、缩放该项目', 2000);
        },
      } : null,
      isObj ? { label: '置于顶层', fn: () => GW.objects.toFront(hit) } : null,
      isObj ? { label: '置于底层', fn: () => GW.objects.toBack(hit) } : null,
      { sep: true },
      // 1.7.1（T06）：把选中的内容存成图片（离屏重画，不截屏幕 —— 屏幕上还有工具栏和这圈虚线框）
      // 有选中才有这一项（没有选中时菜单项直接不存在，而不是灰着）
      GW.selection.items.length ? { label: '把选中存成图片', fn: () => GW.captureSelection && GW.captureSelection() } : null,
      // 1.7.1（T07）：粘贴并匹配样式（普通 Ctrl+V 还是原来的颜色，只有这一项会换成当前笔色）
      { label: '粘贴并匹配样式', disabled: !GW.canPaste || !GW.canPaste(), fn: () => GW.paste(30, { match: true }) },
      // 1.7.1（T08）：对象挂链接。只认 http(s)，打开一律走应用内网页浮层，绝不用 <a href>
      isObj ? { label: '加链接…', fn: () => GW.objLink && GW.objLink.ask(hit) } : null,
      // 1.7.2（T02）：内部页链接（存页 id，不存序号）
      isObj ? { label: '链接到页面…', fn: () => GW.linkToPage && GW.linkToPage(hit) } : null,
      isObj ? {
        label: '打开链接',
        disabled: !(hit.data && hit.data.link),
        fn: () => { const pl = GW.pageLink && GW.pageLink.of(hit); if (pl) GW.pageLink.jump(pl); else if (GW.objLink) GW.objLink.open(hit); },
      } : null,
      isObj ? {
        label: '去掉链接',
        disabled: !(hit.data && hit.data.link),
        fn: () => { if (GW.pageLink && GW.pageLink.of(hit)) GW.pageLink.clear(hit); else if (GW.objLink) GW.objLink.clear(hit); },
      } : null,
      // 1.7.1（T09）：图片裁剪（只有图片对象才有这一项）
      isObj && hit.type === 'image' ? { label: '裁剪…', fn: () => GW.cropImage && GW.cropImage(hit) } : null,
      // 1.7.6 统一物理模型：菜单与 AI 共用同一个批量命令 GW.physicsBatch.insert
      GW.physicsBatch && GW.physicsBatch.openPanel
        ? { label: '批量插入物理模型…', fn: () => GW.physicsBatch.openPanel() } : null,
      { label: '取消选择', key: 'Esc', fn: () => GW.selection.clear() },
    ];
    GW.menuAt(e.clientX, e.clientY, items);
  }, true);
  // R6：触屏没有右键 —— 长按（550ms 不移动）弹同一张菜单。
  // 不复制菜单项：直接派发一个 button=2 的 contextmenu，交给上面那个处理器去走完命中与选中逻辑。
  // 这样以后加菜单项只改一处，不会出现「右键有、长按没有」的分叉。
  (function longPressMenu() {
    let timer = 0, pid = -1, x0 = 0, y0 = 0;
    const stop = () => { if (timer) { clearTimeout(timer); timer = 0; } pid = -1; };
    // 尺规本体上的长按归 geotools（220ms 让位拖尺），这里必须让开，否则拖尺会变成弹菜单
    const onGeo = (x, y) => {
      const g = GW.geo;
      if (!g || !Array.isArray(g.tools) || !g.tools.length) return false;
      const p = GW.toWorld(x, y), pad = 8 / GW.camera.s;
      return g.tools.some((tl) => {
        const b = tl.shape && tl.shape.bounds;
        const r = typeof b === 'function' ? b(tl) : b;
        if (!r) return false;
        return p.x >= tl.x + r[0] - pad && p.x <= tl.x + r[2] + pad && p.y >= tl.y + r[1] - pad && p.y <= tl.y + r[3] + pad;
      });
    };
    const fire = (x, y) => {
      stop();
      if (!GW.menuAt) return;
      const el = document.elementFromPoint(x, y);
      if (!el || !(surfOf(el) || (el.closest && el.closest('.obj')))) return;
      if (typing(el)) return;
      // 长按的同时可能已经落了一笔：先让它让位，否则菜单旁边会多出一个墨点
      if (GW.yieldPointer && GW.yieldPointer.has()) GW.yieldPointer.fire('longpress');
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
    };
    document.addEventListener('pointerdown', (e) => {
      stop();
      if (e.pointerType === 'mouse' || e.button > 0) return;      // 鼠标走真右键，别抢
      if (!GW.menuAt || typing(e.target)) return;
      if (!(surfOf(e.target) || (e.target.closest && e.target.closest('.obj')))) return;
      if (onGeo(e.clientX, e.clientY)) return;
      pid = e.pointerId; x0 = e.clientX; y0 = e.clientY;
      timer = setTimeout(() => { timer = 0; fire(x0, y0); }, 550);
    }, true);
    document.addEventListener('pointermove', (e) => {
      if (!timer || e.pointerId !== pid) return;
      if (Math.hypot(e.clientX - x0, e.clientY - y0) > 8) stop();   // 一动就是拖动 / 书写，不是长按
    }, true);
    document.addEventListener('pointerup', stop, true);
    document.addEventListener('pointercancel', stop, true);
    // 尺规自己开始让位（拖尺）时，把我们还没到点的长按也撤掉
    document.addEventListener('lostpointercapture', stop, true);
  })();
  // 长按拖拽（iOS 会把画布上的笔迹当成图片/文字拖走）
  document.addEventListener('dragstart', (e) => {
    if (stageOf(e.target) && !typing(e.target)) e.preventDefault();
  }, true);
  // iOS Safari 的「长按 → 选择/拷贝/查询」是由 touchstart 的默认行为触发的，
  // user-select / touch-callout 只能压住一部分情况。真正的止血点是：落笔那一刻
  // （单指、落在画布/画布层/仿真画布上、不是任何可编辑控件）直接 preventDefault。
  // 这只吃掉「浏览器的默认手势」，不影响我们自己的 pointer 事件，所以笔画照常。
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;                 // 双指交给下面 gesture/多指 touchmove 拦截
    if (typing(e.target)) return;                       // 输入框、文字对象照常
    const t = e.target;
    // 对象标题栏/按钮/链接要能点，不能一刀切
    const ui = t && t.closest && t.closest('.obj-head, .obj-btns, .book-bar, .book-nav, button, a, .geo-hud');
    if (ui) return;
    // 1.1.16：落在能滚的容器里就放行，否则原生滚动永远起不来（见 canScroll 注释）
    if (canScroll(t)) return;
    // 1.3.0：整页拦截（原来只认画布，手指停在顶栏/工具栏/文字上仍会弹「拷贝/查询」）
    e.preventDefault();
  }, { capture: true, passive: false });
  // 1.3.1：iPad 上「两指一捏」缩放的是整个网页（Safari 的页面缩放，不是我们的画布缩放）。
  // 页面一旦被放大，clientX/clientY 与画布坐标就不再对应 —— 表现就是工具栏跑出屏幕、
  // 笔迹与笔尖整体错位，而且不刷新页面永远回不来。gesture* 与多指 touchmove 都要挡；
  // 画布自己的双指缩放走 pointer 事件，不受影响。
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => {
    document.addEventListener(n, (e) => { if (!typing(e.target)) e.preventDefault(); }, { capture: true, passive: false });
  });
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1 && !typing(e.target)) e.preventDefault();
  }, { capture: true, passive: false });
  // 双击放大：iOS 会把双击当成页面缩放
  let lastTapAt = 0;
  document.addEventListener('touchend', (e) => {
    if (typing(e.target) || (e.touches && e.touches.length)) return;
    const now = performance.now();
    if (now - lastTapAt < 320) e.preventDefault();
    lastTapAt = now;
  }, { capture: true, passive: false });
  // 兜底：iOS 有时在 touchend 之后才建立选区（蓝底高亮 + 手柄），
  // 只要当前不在编辑控件里，就立刻把选区清掉。
  document.addEventListener('selectionchange', () => {
    const ae = document.activeElement;
    if (ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) return;
    const s = window.getSelection && window.getSelection();
    if (s && !s.isCollapsed && s.removeAllRanges) s.removeAllRanges();
  });
})();

