/* 数理无限画布 · 高中数学 · 立体几何
 * 多面体与旋转体；拖动旋转；遮挡棱虚线；斜二测；连线、截面、展开图
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541';
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const DEG = Math.PI / 180;
  const DASH = [7, 6];

  // ---------- 向量 ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function rotAxis(p, a, b, ang) { // 绕直线 ab 旋转（罗德里格斯公式）
    const k = norm(sub(b, a)), v = sub(p, a), c = Math.cos(ang), s = Math.sin(ang);
    const kv = cross(k, v), kd = dot(k, v);
    return add(a, [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)]);
  }
  const fmt = (v, d = 3) => { let s = (Math.abs(v) < 5e-7 ? 0 : v).toFixed(d).replace(/\.?0+$/, ''); return s; };

  const TYPES = [
    { id: 'cube', label: '正方体', poly: true, dims: [{ k: 'a', label: '棱长 a', min: 1, max: 5, v: 3 }] },
    { id: 'box', label: '长方体', poly: true, dims: [{ k: 'a', label: '长 a', min: 1, max: 6, v: 4 }, { k: 'b', label: '宽 b', min: 1, max: 6, v: 2.5 }, { k: 'c', label: '高 c', min: 1, max: 6, v: 2 }] },
    { id: 'prism3', label: '正三棱柱', poly: true, dims: [{ k: 'a', label: '底面边长 a', min: 1, max: 5, v: 3 }, { k: 'h', label: '高 h', min: 1, max: 6, v: 3 }] },
    { id: 'pyr4', label: '正四棱锥', poly: true, dims: [{ k: 'a', label: '底面边长 a', min: 1, max: 5, v: 3 }, { k: 'h', label: '高 h', min: 0.5, max: 6, v: 3 }] },
    { id: 'tet', label: '正三棱锥', poly: true, dims: [{ k: 'a', label: '底面边长 a', min: 1, max: 5, v: 3.5 }, { k: 'h', label: '高 h', min: 0.5, max: 6, v: 2.5 }] },
    { id: 'bienao', label: '三棱锥（PA⊥底面）', poly: true, dims: [{ k: 'a', label: 'AB', min: 1, max: 5, v: 3 }, { k: 'b', label: 'BC', min: 1, max: 5, v: 2.5 }, { k: 'h', label: 'PA', min: 1, max: 6, v: 3 }] },
    { id: 'cyl', label: '圆柱', dims: [{ k: 'r', label: '底面半径 r', min: 0.5, max: 3, v: 1.5 }, { k: 'h', label: '高 h', min: 0.5, max: 6, v: 3 }] },
    { id: 'cone', label: '圆锥', dims: [{ k: 'r', label: '底面半径 r', min: 0.5, max: 3, v: 1.6 }, { k: 'h', label: '高 h', min: 0.5, max: 6, v: 3 }] },
    { id: 'frus', label: '圆台', dims: [{ k: 'R', label: '下底半径 R', min: 0.5, max: 3, v: 2 }, { k: 'r', label: '上底半径 r', min: 0.2, max: 3, v: 1 }, { k: 'h', label: '高 h', min: 0.5, max: 6, v: 2.5 }] },
    { id: 'sphere', label: '球', dims: [{ k: 'R', label: '半径 R', min: 0.5, max: 3, v: 2 }] },
  ];
  const TYPE = {};
  TYPES.forEach((t) => (TYPE[t.id] = t));

  // ---------- 多面体模型 ----------
  function buildPoly(type, d) {
    let V, N, F;
    const sq = (a, b, c) => {
      V = [[-a / 2, -b / 2, 0], [a / 2, -b / 2, 0], [a / 2, b / 2, 0], [-a / 2, b / 2, 0], [-a / 2, -b / 2, c], [a / 2, -b / 2, c], [a / 2, b / 2, c], [-a / 2, b / 2, c]];
      N = ['A', 'B', 'C', 'D', 'A₁', 'B₁', 'C₁', 'D₁'];
      F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    };
    const tri = (a) => { const t = a * Math.sqrt(3) / 6; return [[-a / 2, -t, 0], [a / 2, -t, 0], [0, 2 * t, 0]]; };
    if (type === 'cube') sq(d.a, d.a, d.a);
    else if (type === 'box') sq(d.a, d.b, d.c);
    else if (type === 'prism3') {
      const b = tri(d.a);
      V = b.concat(b.map((p) => [p[0], p[1], d.h]));
      N = ['A', 'B', 'C', 'A₁', 'B₁', 'C₁'];
      F = [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]];
    } else if (type === 'pyr4') {
      const a = d.a;
      V = [[-a / 2, -a / 2, 0], [a / 2, -a / 2, 0], [a / 2, a / 2, 0], [-a / 2, a / 2, 0], [0, 0, d.h]];
      N = ['A', 'B', 'C', 'D', 'P'];
      F = [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]];
    } else if (type === 'tet') {
      V = tri(d.a).concat([[0, 0, d.h]]);
      N = ['A', 'B', 'C', 'P'];
      F = [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]];
    } else if (type === 'bienao') {
      V = [[0, 0, 0], [d.a, 0, 0], [d.a, d.b, 0], [0, 0, d.h]];
      N = ['A', 'B', 'C', 'P'];
      F = [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]];
    }
    // 居中
    const mn = [0, 1, 2].map((i) => Math.min(...V.map((p) => p[i]))), mx = [0, 1, 2].map((i) => Math.max(...V.map((p) => p[i])));
    const c0 = mul(add(mn, mx), 0.5);
    V = V.map((p) => sub(p, c0));
    const G = mul(V.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / V.length);
    const faces = F.map((f) => {
      let n = cross(sub(V[f[1]], V[f[0]]), sub(V[f[2]], V[f[0]]));
      if (dot(n, sub(V[f[0]], G)) < 0) { f = f.slice().reverse(); n = mul(n, -1); }
      n = norm(n);
      return { v: f, n, d: dot(n, V[f[0]]) };
    });
    const emap = {};
    faces.forEach((f, fi) => f.v.forEach((a, k) => {
      const b = f.v[(k + 1) % f.v.length], key = Math.min(a, b) + '-' + Math.max(a, b);
      (emap[key] = emap[key] || { a: Math.min(a, b), b: Math.max(a, b), faces: [] }).faces.push(fi);
    }));
    const edges = Object.values(emap);
    const R = Math.max(...V.map(len));
    return { V, N, faces, edges, G, R, offset: c0 };
  }
  // 点是否在某多面体面上 → 返回所在面的下标数组
  function facesOf(P, p) {
    const out = [], eps = 1e-6 * (P.R + 1);
    P.faces.forEach((f, i) => {
      if (Math.abs(dot(f.n, p) - f.d) > eps) return;
      for (let k = 0; k < f.v.length; k++) {
        const a = P.V[f.v[k]], b = P.V[f.v[(k + 1) % f.v.length]];
        if (dot(cross(sub(b, a), sub(p, a)), f.n) < -eps) return;
      }
      out.push(i);
    });
    return out;
  }

  // ---------- 旋转体模型 ----------
  function buildRev(type, d) {
    let rings;
    if (type === 'cyl') rings = [{ z: 0, r: d.r }, { z: d.h, r: d.r }];
    else if (type === 'cone') rings = [{ z: 0, r: d.r }, { z: d.h, r: 0 }];
    else if (type === 'frus') rings = [{ z: 0, r: d.R }, { z: d.h, r: d.r }];
    else return null;
    const zc = (rings[0].z + rings[rings.length - 1].z) / 2;
    rings.forEach((r) => (r.z -= zc));
    const R = Math.max(...rings.map((r) => Math.hypot(r.r, r.z)));
    return { rings, R };
  }

  GW.registerSim({
    id: 'math-solid', name: '立体几何', category: 'math', group: '立体几何',
    desc: '多面体与旋转体：旋转观察、虚线遮挡、斜二测、截面与展开图',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8l5-4h11v12l-5 4H4z"/><path d="M4 8h11v12M15 8l5-4"/><path d="M4 20l5-4h11M9 4v12" stroke-dasharray="2 2.5"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const st = ctx.state;
      if (!TYPE[st.type]) st.type = 'cube';
      st.dims = st.dims || {};
      TYPES.forEach((t) => {
        st.dims[t.id] = st.dims[t.id] || {};
        t.dims.forEach((dm) => { if (typeof st.dims[t.id][dm.k] !== 'number') st.dims[t.id][dm.k] = dm.v; });
      });
      if (st.yaw == null) st.yaw = -38;
      if (st.elev == null) st.elev = 26;
      if (st.zoom == null) st.zoom = 1;
      st.oblique = !!st.oblique;
      if (st.labels == null) st.labels = true;
      st.segs = Array.isArray(st.segs) ? st.segs : [];
      st.section = Array.isArray(st.section) ? st.section : [];
      // 棱上的点默认在中点；拖动后记录 t∈(0,1)，连线/截面都按这个位置取点。
      st.pos = st.pos && typeof st.pos === 'object' ? st.pos : {};
      Object.keys(st.pos).forEach((k) => {
        const v = +st.pos[k];
        if (!(v > 0 && v < 1)) delete st.pos[k];
      });
      st.opts = st.opts || {};
      st.unfold = st.unfold || 0;
      st.net = !!st.net;
      let mode = 'rotate'; // rotate | connect | section
      let pendingPick = null, picks = [];
      let unfoldPlay = 0;

      const kit = GW.simKit.layout(ctx.root, { panelWidth: 270 });
      const c2 = kit.ctx2d, canvas = kit.canvas;
      let W = 0, H = 0, dirty = true;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      let saveT = 0;
      const save = (later) => { clearTimeout(saveT); if (later) saveT = setTimeout(() => ctx.save(), 400); else ctx.save(); };

      let model = null; // {poly} | {rev} | {sphere}
      function rebuild() {
        const t = TYPE[st.type], d = st.dims[st.type];
        if (t.poly) model = { poly: buildPoly(st.type, d) };
        else if (st.type === 'sphere') model = { sphere: { R: d.R }, R: d.R };
        else model = { rev: buildRev(st.type, d) };
        model.R = model.poly ? model.poly.R : model.rev ? model.rev.R : d.R;
        dirty = true;
      }

      // ---------- 投影 ----------
      let PR = null;
      function makeProj() {
        let V, f;
        if (st.oblique) {
          const c = 0.5 * Math.SQRT1_2;
          V = norm([c, -1, c]);
          f = (p) => [p[0] + c * p[1], p[2] + c * p[1]];
        } else {
          const th = st.yaw * DEG, e = st.elev * DEG, ct = Math.cos(th), sn = Math.sin(th), ce = Math.cos(e), se = Math.sin(e);
          V = [-sn * ce, -ct * ce, se];
          f = (p) => { const x1 = p[0] * ct - p[1] * sn, y1 = p[0] * sn + p[1] * ct; return [x1, p[2] * ce + y1 * se]; };
        }
        const uf = (st.type === 'cube' || st.type === 'box') && !st.net ? st.unfold : 0;
        const s = st.zoom * Math.min(W, H) * 0.40 / Math.max(model.R, 2.6) / (1 + 1.3 * uf);
        const cx = W / 2, cy = H / 2 + 6;
        PR = { V, s, S: (p) => { const q = f(p); return [cx + q[0] * s, cy - q[1] * s]; }, depth: (p) => dot(p, V) };
        return PR;
      }

      const shade = (n) => {
        const L = norm([-0.45, -0.6, 0.85]), lam = Math.max(0, dot(n, L));
        const k = 0.06 + 0.16 * (1 - lam);
        const m = (a, b) => Math.round(a + (b - a) * k);
        return 'rgb(' + m(255, 15) + ',' + m(255, 157) + ',' + m(255, 138) + ')';
      };
      function line(a, b, vis, color, width) {
        c2.save();
        c2.strokeStyle = color || INK; c2.lineWidth = width || (vis ? 2.4 : 2); c2.lineCap = 'round';
        if (!vis) { c2.setLineDash(DASH); c2.globalAlpha = 0.8; }
        c2.beginPath(); c2.moveTo(a[0], a[1]); c2.lineTo(b[0], b[1]); c2.stroke();
        c2.restore();
      }
      function poly2(pts) { c2.beginPath(); pts.forEach((p, i) => (i ? c2.lineTo(p[0], p[1]) : c2.moveTo(p[0], p[1]))); c2.closePath(); }
      function label(t, p, dir, color, size) {
        c2.save();
        c2.font = 'italic ' + (size || 19) + 'px ' + MATH; c2.textAlign = 'center'; c2.textBaseline = 'middle';
        const x = p[0] + dir[0] * 17, y = p[1] + dir[1] * 17;
        c2.lineWidth = 4; c2.strokeStyle = 'rgba(255,255,255,0.92)'; c2.lineJoin = 'round'; c2.strokeText(t, x, y);
        c2.fillStyle = color || INK; c2.fillText(t, x, y);
        c2.restore();
      }
      const dirFrom = (p, c) => { const dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy); return l < 1 ? [0, -1] : [dx / l, dy / l]; };

      // ---------- 拾取点（顶点 + 棱上点） ----------
      function edgeT(key) {
        const t = st.pos && st.pos[key];
        return t == null ? 0.5 : GW.clamp(+t, 0.02, 0.98);
      }
      function pickPoints() {
        const P = model.poly; if (!P) return [];
        const out = P.V.map((p, i) => ({ key: 'v' + i, p }));
        P.edges.forEach((e) => {
          const key = 'm' + e.a + '-' + e.b;
          out.push({ key, p: lerp(P.V[e.a], P.V[e.b], edgeT(key)) });
        });
        return out;
      }
      function keyPoint(key) {
        const P = model.poly; if (!P) return null;
        if (key[0] === 'v') return P.V[+key.slice(1)] || null;
        const [a, b] = key.slice(1).split('-').map(Number);
        return P.V[a] && P.V[b] ? lerp(P.V[a], P.V[b], edgeT(key)) : null;
      }
      function keyNames() {
        const P = model.poly, names = {};
        if (!P) return names;
        P.N.forEach((n, i) => (names['v' + i] = n));
        const used = new Set(P.N);
        const pool = 'EFGHMNQRSTUVW'.split('').filter((c) => !used.has(c));
        let k = 0;
        st.segs.concat([st.section]).flat().concat(picks).forEach((key) => { if (!names[key]) names[key] = pool[k++] || '?'; });
        return names;
      }

      // ---------- 截面 ----------
      function computeSection() {
        const P = model.poly;
        if (!P || st.section.length !== 3) return null;
        const [p, q, r] = st.section.map(keyPoint);
        if (!p || !q || !r) return null;
        let n = cross(sub(q, p), sub(r, p));
        if (len(n) < 1e-9) return { bad: true };
        n = norm(n);
        const d0 = dot(n, p), eps = 1e-7 * (P.R + 1);
        const pts = [];
        const addPt = (x) => { if (!pts.some((y) => len(sub(x, y)) < 1e-6)) pts.push(x); };
        P.V.forEach((v) => { if (Math.abs(dot(n, v) - d0) < eps) addPt(v); });
        P.edges.forEach((e) => {
          const da = dot(n, P.V[e.a]) - d0, db = dot(n, P.V[e.b]) - d0;
          if ((da > eps && db < -eps) || (da < -eps && db > eps)) addPt(lerp(P.V[e.a], P.V[e.b], da / (da - db)));
        });
        if (pts.length < 3) return { pts: [], n };
        const c = mul(pts.reduce((s, x) => add(s, x), [0, 0, 0]), 1 / pts.length);
        const u = norm(sub(pts[0], c)), w = cross(n, u);
        pts.sort((a, b) => Math.atan2(dot(sub(a, c), w), dot(sub(a, c), u)) - Math.atan2(dot(sub(b, c), w), dot(sub(b, c), u)));
        let area = 0;
        for (let i = 0; i < pts.length; i++) area += dot(cross(sub(pts[i], c), sub(pts[(i + 1) % pts.length], c)), n) / 2;
        return { pts, n, area: Math.abs(area), shape: shapeName(pts) };
      }
      function shapeName(pts) {
        const n = pts.length, L = [], tol = 1e-6;
        for (let i = 0; i < n; i++) L.push(len(sub(pts[(i + 1) % n], pts[i])));
        const eqSides = L.every((x) => Math.abs(x - L[0]) < tol * (1 + L[0]));
        const ang = (i) => { const a = sub(pts[(i + n - 1) % n], pts[i]), b = sub(pts[(i + 1) % n], pts[i]); return Math.acos(GW.clamp(dot(a, b) / len(a) / len(b), -1, 1)); };
        const A = pts.map((_, i) => ang(i)), eqAng = A.every((x) => Math.abs(x - A[0]) < 1e-6);
        const names = { 3: '三角形', 4: '四边形', 5: '五边形', 6: '六边形' };
        if (n === 3) {
          if (eqSides) return '正三角形';
          if (A.some((x) => Math.abs(x - Math.PI / 2) < 1e-6)) return '直角三角形';
          if (Math.abs(L[0] - L[1]) < tol || Math.abs(L[1] - L[2]) < tol || Math.abs(L[0] - L[2]) < tol) return '等腰三角形';
          return '三角形';
        }
        if (n === 4) {
          const par = (i, j) => len(cross(sub(pts[(i + 1) % 4], pts[i]), sub(pts[(j + 1) % 4], pts[j]))) < 1e-6 * (1 + L[i] * L[j]);
          const p1 = par(0, 2), p2 = par(1, 3);
          const right = A.every((x) => Math.abs(x - Math.PI / 2) < 1e-6);
          if (p1 && p2) return right ? (eqSides ? '正方形' : '矩形') : eqSides ? '菱形' : '平行四边形';
          if (p1 || p2) return '梯形';
          return '四边形';
        }
        return (eqSides && eqAng ? '正' : '') + (names[n] || n + ' 边形');
      }

      // ---------- 绘制：多面体 ----------
      function drawPoly() {
        const P = model.poly, pr = PR, V = pr.V;
        const front = P.faces.map((f) => dot(f.n, V) > -1e-9);
        const SP = P.V.map(pr.S);
        const center = pr.S([0, 0, 0]);
        P.faces.forEach((f, i) => { if (front[i]) { poly2(f.v.map((k) => SP[k])); c2.fillStyle = shade(f.n); c2.fill(); } });
        const segVis = (a, b) => facesOf(P, lerp(a, b, 0.5)).some((fi) => front[fi]);
        const extras = []; // {a,b,color,w}
        const o = st.opts;
        if ((st.type === 'cube' || st.type === 'box')) {
          if (o.bodyDiag) [[0, 6], [1, 7]].forEach(([i, j]) => extras.push({ a: P.V[i], b: P.V[j], color: RED }));
          if (o.faceDiag) [[0, 2], [1, 3], [4, 6], [5, 7]].forEach(([i, j]) => extras.push({ a: P.V[i], b: P.V[j], color: BLUE }));
        }
        let foot = null;
        if ((st.type === 'pyr4' || st.type === 'tet') && o.height) {
          const apex = P.V[P.V.length - 1];
          foot = [apex[0], apex[1], P.V[0][2]];
          extras.push({ a: apex, b: foot, color: RED });
        }
        // 截面
        const sec = computeSection();
        if (sec && sec.pts && sec.pts.length >= 3) {
          poly2(sec.pts.map(pr.S)); c2.fillStyle = 'rgba(242,165,65,0.38)'; c2.fill();
          sec.pts.forEach((p, i) => extras.push({ a: p, b: sec.pts[(i + 1) % sec.pts.length], color: '#c9741a', w: 2.6 }));
        }
        const names = keyNames();
        st.segs.forEach(([k1, k2]) => { const a = keyPoint(k1), b = keyPoint(k2); if (a && b) extras.push({ a, b, color: BLUE }); });
        // 先画虚线，再画实线
        const items = P.edges.map((e) => ({ a: SP[e.a], b: SP[e.b], vis: e.faces.some((fi) => front[fi]) }));
        extras.forEach((x) => items.push({ a: pr.S(x.a), b: pr.S(x.b), vis: segVis(x.a, x.b), color: x.color, w: x.w }));
        items.filter((x) => !x.vis).forEach((x) => line(x.a, x.b, false, x.color, x.w));
        items.filter((x) => x.vis).forEach((x) => line(x.a, x.b, true, x.color, x.w));
        if (sec && sec.pts) sec.pts.forEach((p) => { const s = pr.S(p); c2.beginPath(); c2.arc(s[0], s[1], 4, 0, 7); c2.fillStyle = '#c9741a'; c2.fill(); });
        // 拾取点
        if (mode !== 'rotate') {
          pickPoints().forEach((pp) => {
            const s = pr.S(pp.p), on = picks.includes(pp.key) || (mode === 'section' && st.section.includes(pp.key));
            c2.beginPath(); c2.arc(s[0], s[1], on ? 8 : 6, 0, 7);
            c2.fillStyle = on ? GOLD : 'rgba(255,255,255,0.9)'; c2.fill();
            c2.lineWidth = 2; c2.strokeStyle = on ? '#c9741a' : CYAN; c2.stroke();
          });
        }
        // 标注
        if (st.labels) {
          P.V.forEach((p, i) => label(P.N[i], SP[i], dirFrom(SP[i], center)));
          const usedKeys = new Set(st.segs.flat().concat(st.section).concat(picks));
          usedKeys.forEach((k) => {
            if (k[0] !== 'm') return;
            const p = keyPoint(k); if (!p) return;
            const s = pr.S(p);
            c2.beginPath(); c2.arc(s[0], s[1], 4, 0, 7); c2.fillStyle = INK; c2.fill();
            label(names[k], s, dirFrom(s, center), INK);
          });
          if (foot) { const s = pr.S(foot); c2.beginPath(); c2.arc(s[0], s[1], 3.5, 0, 7); c2.fillStyle = INK; c2.fill(); label('O', s, [0.6, 0.8]); }
        }
        return sec;
      }

      // ---------- 绘制：正方体/长方体展开 ----------
      function drawUnfold(t) {
        const P = model.poly, pr = PR;
        const F = P.faces.map((f) => f.v.slice());
        // 面：0 下底 ABCD，1 上底，2 前 ABB₁A₁，3 右，4 后，5 左（buildPoly 中的顺序，可能被反向但顶点集合不变）
        const findFace = (set) => P.faces.findIndex((f) => set.every((k) => f.v.includes(k)) && f.v.length === set.length);
        const fb = findFace([0, 1, 2, 3]), ft = findFace([4, 5, 6, 7]);
        const sides = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].map(findFace);
        const cen = (idx) => mul(idx.reduce((s, k) => add(s, P.V[k]), [0, 0, 0]), 1 / idx.length);
        const ang = t * Math.PI / 2;
        const tf = {}; // face index → function p→p'
        tf[fb] = (p) => p;
        const hinges = [[0, 1], [1, 2], [2, 3], [3, 0]];
        const baseC = cen(F[fb]);
        sides.forEach((fi, k) => {
          const [a, b] = hinges[k].map((i) => P.V[i]);
          const c = cen(F[fi]);
          const sgn = len(sub(rotAxis(c, a, b, Math.PI / 2), baseC)) > len(sub(rotAxis(c, a, b, -Math.PI / 2), baseC)) ? 1 : -1;
          tf[fi] = (p) => rotAxis(p, a, b, sgn * ang);
        });
        { // 上底连在前面的上棱 A₁B₁ 上
          const a = P.V[4], b = P.V[5], c = cen(F[ft]), pc = cen(F[sides[0]]);
          const sgn = len(sub(rotAxis(c, a, b, Math.PI / 2), pc)) > len(sub(rotAxis(c, a, b, -Math.PI / 2), pc)) ? 1 : -1;
          const parent = tf[sides[0]];
          tf[ft] = (p) => parent(rotAxis(p, a, b, sgn * ang));
        }
        const polys = F.map((f, fi) => {
          const pts3 = f.map((k) => tf[fi](P.V[k]));
          const depth = pts3.reduce((s, p) => s + pr.depth(p), 0) / pts3.length;
          return { fi, f, pts3, depth };
        }).sort((a, b) => a.depth - b.depth);
        const placed = [];
        polys.forEach((o) => {
          const pts = o.pts3.map(pr.S);
          poly2(pts);
          const n = norm(cross(sub(o.pts3[1], o.pts3[0]), sub(o.pts3[2], o.pts3[0])));
          c2.fillStyle = shade(dot(n, pr.V) >= 0 ? n : mul(n, -1)); c2.globalAlpha = 0.92; c2.fill(); c2.globalAlpha = 1;
          c2.strokeStyle = INK; c2.lineWidth = 2.2; c2.lineJoin = 'round'; c2.stroke();
          if (st.labels) {
            const cc = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
            pts.forEach((p, i) => {
              if (placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 8)) return;
              placed.push(p);
              const d = dirFrom(cc, p);
              c2.save(); c2.font = 'italic 16px ' + MATH; c2.fillStyle = INK; c2.textAlign = 'center'; c2.textBaseline = 'middle';
              c2.fillText(P.N[o.f[i]], p[0] + d[0] * 15, p[1] + d[1] * 15); c2.restore();
            });
          }
        });
      }

      // ---------- 绘制：旋转体 ----------
      function drawRev() {
        const { rings } = model.rev, pr = PR, V = pr.V;
        const cs = (t) => [Math.cos(t), Math.sin(t)];
        const ringPt = (rg, t) => [rg.r * Math.cos(t), rg.r * Math.sin(t), rg.z];
        const sideN = (i, t) => { const a = rings[i], b = rings[i + 1], dz = b.z - a.z; return norm([dz * Math.cos(t), dz * Math.sin(t), a.r - b.r]); };
        const capN = (i) => (i === 0 ? [0, 0, -1] : i === rings.length - 1 ? [0, 0, 1] : null);
        // 轮廓母线：n(t)·V = 0
        const roots = (i) => {
          const a = rings[i], b = rings[i + 1], dz = b.z - a.z;
          const A = dz * V[0], B = dz * V[1], C = (a.r - b.r) * V[2], rho = Math.hypot(A, B);
          if (rho < 1e-12 || Math.abs(C) > rho) return [];
          const t0 = Math.atan2(B, A), dt = Math.acos(GW.clamp(-C / rho, -1, 1));
          return [t0 + dt, t0 - dt];
        };
        // 侧面填充
        const NS = 96;
        for (let i = 0; i < rings.length - 1; i++) {
          for (let k = 0; k < NS; k++) {
            const t0 = k / NS * 2 * Math.PI, t1 = (k + 1) / NS * 2 * Math.PI, tm = (t0 + t1) / 2;
            const n = sideN(i, tm);
            if (dot(n, V) <= 0) continue;
            const pts = [ringPt(rings[i], t0), ringPt(rings[i], t1), ringPt(rings[i + 1], t1), ringPt(rings[i + 1], t0)].map(pr.S);
            poly2(pts); c2.fillStyle = shade(n); c2.fill(); c2.strokeStyle = c2.fillStyle; c2.lineWidth = 1; c2.stroke();
          }
        }
        rings.forEach((rg, i) => {
          const n = capN(i);
          if (n && rg.r > 0 && dot(n, V) > 0) {
            const pts = []; for (let k = 0; k < 120; k++) pts.push(pr.S(ringPt(rg, k / 120 * 2 * Math.PI)));
            poly2(pts); c2.fillStyle = shade(n); c2.fill();
          }
        });
        // 轴截面
        const o = st.opts;
        const hiddenItems = [], visItems = [];
        const push = (a, b, vis, color, w) => (vis ? visItems : hiddenItems).push({ a: pr.S(a), b: pr.S(b), vis, color, w });
        if (o.axial) {
          const pts = [ringPt(rings[0], 0), ringPt(rings[1], 0), ringPt(rings[1], Math.PI), ringPt(rings[0], Math.PI)];
          poly2(pts.map(pr.S)); c2.fillStyle = 'rgba(242,165,65,0.35)'; c2.fill();
          [0, Math.PI].forEach((t) => push(ringPt(rings[0], t), ringPt(rings[1], t), dot(sideN(0, t), V) > 0, '#c9741a', 2.6));
          rings.forEach((rg, i) => { if (rg.r > 0) push(ringPt(rg, 0), ringPt(rg, Math.PI), dot(capN(i), V) > 0, '#c9741a', 2.6); });
        }
        // 圆周（含轮廓点分段）
        const ringRuns = [];
        rings.forEach((rg, i) => {
          if (rg.r <= 0) return;
          let ts = [];
          for (let k = 0; k <= 240; k++) ts.push(k / 240 * 2 * Math.PI);
          [i - 1, i].forEach((j) => { if (j >= 0 && j < rings.length - 1) roots(j).forEach((t) => ts.push(((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI))); });
          ts.sort((a, b) => a - b);
          const cn = capN(i), capF = cn && dot(cn, V) > 1e-9;
          const visAt = (t) => capF || (i > 0 && dot(sideN(i - 1, t), V) > 1e-9) || (i < rings.length - 1 && dot(sideN(i, t), V) > 1e-9);
          let run = null;
          for (let k = 0; k < ts.length - 1; k++) {
            const tm = (ts[k] + ts[k + 1]) / 2, vis = visAt(tm);
            if (!run || run.vis !== vis) { if (run) ringRuns.push(run); run = { vis, pts: [pr.S(ringPt(rg, ts[k]))] }; }
            run.pts.push(pr.S(ringPt(rg, ts[k + 1])));
          }
          if (run) ringRuns.push(run);
        });
        // 轴
        const cBot = [0, 0, rings[0].z], cTop = [0, 0, rings[rings.length - 1].z];
        if (o.axis !== false) push(cBot, cTop, false, RED, 2.2);
        hiddenItems.forEach((x) => line(x.a, x.b, false, x.color, x.w));
        ringRuns.filter((r) => !r.vis).forEach(drawRun);
        ringRuns.filter((r) => r.vis).forEach(drawRun);
        // 轮廓母线
        for (let i = 0; i < rings.length - 1; i++) roots(i).forEach((t) => line(pr.S(ringPt(rings[i], t)), pr.S(ringPt(rings[i + 1], t)), true));
        visItems.forEach((x) => line(x.a, x.b, true, x.color, x.w));
        // 标注
        if (st.labels) {
          const bs = pr.S(cBot), ts2 = pr.S(cTop);
          const dot2 = (s) => { c2.beginPath(); c2.arc(s[0], s[1], 3.5, 0, 7); c2.fillStyle = INK; c2.fill(); };
          if (st.type === 'cone') {
            dot2(bs); label('O', bs, [0.7, 0.7]); label('S', ts2, [0, -1]);
          } else {
            dot2(bs); dot2(ts2); label('O', bs, [0.7, 0.7]); label('O′', ts2, [0.7, -0.7]);
          }
        }
      }
      function drawRun(r) {
        c2.save(); c2.strokeStyle = INK; c2.lineWidth = r.vis ? 2.4 : 2; c2.lineJoin = 'round'; c2.lineCap = 'round';
        if (!r.vis) { c2.setLineDash(DASH); c2.globalAlpha = 0.8; }
        c2.beginPath(); r.pts.forEach((p, i) => (i ? c2.lineTo(p[0], p[1]) : c2.moveTo(p[0], p[1]))); c2.stroke(); c2.restore();
      }

      // ---------- 绘制：球 ----------
      function drawSphere() {
        const R = model.sphere.R, pr = PR, V = pr.V;
        let u = norm(cross(V, [0, 0, 1])); if (len(cross(V, [0, 0, 1])) < 1e-6) u = [1, 0, 0];
        const w = norm(cross(V, u));
        const out = []; for (let k = 0; k < 160; k++) { const t = k / 160 * 2 * Math.PI; out.push(pr.S(add(mul(u, R * Math.cos(t)), mul(w, R * Math.sin(t))))); }
        const c = pr.S([0, 0, 0]);
        let mx = 0; out.forEach((p) => (mx = Math.max(mx, Math.hypot(p[0] - c[0], p[1] - c[1]))));
        const g = c2.createRadialGradient(c[0] - mx * 0.35, c[1] - mx * 0.4, mx * 0.1, c[0], c[1], mx);
        g.addColorStop(0, '#ffffff'); g.addColorStop(1, 'rgb(200,232,227)');
        poly2(out); c2.fillStyle = g; c2.fill();
        const o = st.opts;
        // 赤道
        if (o.equator !== false) {
          const runs = []; let run = null;
          for (let k = 0; k < 240; k++) {
            const t0 = k / 240 * 2 * Math.PI, t1 = (k + 1) / 240 * 2 * Math.PI, tm = (t0 + t1) / 2;
            const vis = Math.cos(tm) * V[0] + Math.sin(tm) * V[1] > 0;
            if (!run || run.vis !== vis) { if (run) runs.push(run); run = { vis, pts: [pr.S([R * Math.cos(t0), R * Math.sin(t0), 0])] }; }
            run.pts.push(pr.S([R * Math.cos(t1), R * Math.sin(t1), 0]));
          }
          runs.push(run);
          runs.filter((r) => !r.vis).forEach(drawRun); runs.filter((r) => r.vis).forEach(drawRun);
        }
        poly2(out); c2.strokeStyle = INK; c2.lineWidth = 2.6; c2.stroke();
        if (o.radius !== false) {
          const A = [R * Math.cos(-0.5), R * Math.sin(-0.5), 0];
          line(c, pr.S(A), false, RED, 2.2);
          if (st.labels) { const s = pr.S(A); c2.beginPath(); c2.arc(s[0], s[1], 3.5, 0, 7); c2.fillStyle = INK; c2.fill(); label('A', s, dirFrom(s, c)); }
        }
        if (st.labels) { c2.beginPath(); c2.arc(c[0], c[1], 3.5, 0, 7); c2.fillStyle = INK; c2.fill(); label('O', c, [-0.6, -0.8]); }
      }

      // ---------- 2D 展开图（圆柱、圆锥、圆台） ----------
      function drawNet() {
        const d = st.dims[st.type];
        const text = (t, x, y, col, al) => { c2.font = 'italic 18px ' + MATH; c2.fillStyle = col || INK; c2.textAlign = al || 'center'; c2.textBaseline = 'middle'; c2.fillText(t, x, y); };
        const fill = 'rgb(226,243,240)';
        const circle = (x, y, r) => { c2.beginPath(); c2.arc(x, y, r, 0, 2 * Math.PI); c2.fillStyle = fill; c2.fill(); c2.strokeStyle = INK; c2.lineWidth = 2.4; c2.stroke(); };
        c2.font = '16px ' + FONT; c2.fillStyle = '#5b6576'; c2.textAlign = 'left'; c2.textBaseline = 'top';
        if (st.type === 'cyl') {
          const r = d.r, h = d.h, L = 2 * Math.PI * r;
          const s = Math.min((W - 80) / L, (H - 70) / (h + 4 * r));
          const x0 = W / 2 - L * s / 2, y0 = H / 2 - h * s / 2;
          c2.beginPath(); c2.rect(x0, y0, L * s, h * s); c2.fillStyle = fill; c2.fill(); c2.strokeStyle = INK; c2.lineWidth = 2.4; c2.stroke();
          circle(W / 2, y0 - r * s, r * s); circle(W / 2, y0 + h * s + r * s, r * s);
          line([W / 2, y0 - r * s], [W / 2 + r * s, y0 - r * s], true, RED, 2);
          text('r', W / 2 + r * s / 2, y0 - r * s - 12, RED);
          text('2πr = ' + fmt(L, 2), x0 + L * s * 0.25, y0 + h * s - 16, BLUE);
          text('h = ' + fmt(h, 2), x0 + L * s + 8, y0 + h * s / 2, BLUE, 'left');
          c2.font = '16px ' + FONT; c2.fillStyle = '#5b6576'; c2.textAlign = 'left'; c2.textBaseline = 'top';
          c2.fillText('圆柱侧面展开图是矩形：长 = 底面周长 2πr，宽 = 高 h', 14, 12);
        } else {
          const R1 = st.type === 'cone' ? d.r : d.R, r2 = st.type === 'cone' ? 0 : d.r, h = d.h;
          if (Math.abs(R1 - r2) < 1e-9) { c2.fillText('上、下底半径相等时圆台退化为圆柱', 14, 12); return; }
          const big = Math.max(R1, r2), small = Math.min(R1, r2);
          const l = Math.hypot(R1 - r2, h); // 母线长
          const Lout = l * big / (big - small), Lin = Lout - l; // 扇环外/内半径
          const alpha = 2 * Math.PI * big / Lout; // 圆心角
          const a0 = Math.PI / 2 - alpha / 2, a1 = Math.PI / 2 + alpha / 2;
          const topU = Math.min(0, Lout * Math.sin(a0), Lin > 0 ? Lin - 2 * small : 0);
          const widU = Math.max(2 * big, 2 * Lout * (alpha >= Math.PI ? 1 : Math.sin(alpha / 2)));
          const s = Math.min((W - 80) / widU, (H - 100) / (Lout + 2 * big - topU));
          const cx = W / 2, cy = 66 - topU * s;
          if (Lin > 0) { // 补成圆锥的虚线
            c2.save(); c2.setLineDash(DASH); c2.strokeStyle = '#5b6576'; c2.lineWidth = 1.6; c2.beginPath();
            [a0, a1].forEach((t) => { c2.moveTo(cx, cy); c2.lineTo(cx + Math.cos(t) * Lin * s, cy + Math.sin(t) * Lin * s); }); c2.stroke(); c2.restore();
          }
          c2.beginPath(); c2.arc(cx, cy, Lout * s, a0, a1);
          if (Lin > 0) c2.arc(cx, cy, Lin * s, a1, a0, true); else c2.lineTo(cx, cy);
          c2.closePath(); c2.fillStyle = fill; c2.fill(); c2.strokeStyle = INK; c2.lineWidth = 2.4; c2.stroke();
          // 底面圆（与弧相切）
          circle(cx, cy + (Lout + big) * s, big * s);
          if (Lin > 0) circle(cx, cy + (Lin - small) * s, small * s);
          // 圆心角
          const ra = Math.min(30, Lout * s * 0.25);
          c2.beginPath(); c2.arc(cx, cy, ra, a0, a1); c2.strokeStyle = RED; c2.lineWidth = 2; c2.stroke();
          const deg = alpha / DEG;
          if (Lin > 0) text('θ = ' + fmt(deg, 1) + '°', cx - ra - 8, cy - 6, RED, 'right');
          else text('θ = ' + fmt(deg, 1) + '°', cx, cy + ra + 16, RED);
          // 母线长标注
          const ex = cx + Math.cos(a0) * Lout * s, ey = cy + Math.sin(a0) * Lout * s;
          const ix = cx + Math.cos(a0) * Lin * s, iy = cy + Math.sin(a0) * Lin * s;
          text('l = ' + fmt(l, 2), (ex + ix) / 2 + 30, (ey + iy) / 2 - 6, BLUE, 'left');
          text((st.type === 'cone' ? 'r = ' : 'R = ') + fmt(big, 2), cx + big * s + 10, cy + (Lout + big) * s, BLUE, 'left');
          if (Lin > 0) text('r = ' + fmt(small, 2), cx + small * s + 10, cy + (Lin - small) * s, BLUE, 'left');
          c2.font = '16px ' + FONT; c2.fillStyle = '#5b6576'; c2.textAlign = 'left'; c2.textBaseline = 'top';
          c2.fillText(st.type === 'cone' ? '圆锥侧面展开图是扇形：半径 = 母线 l，弧长 = 2πr，θ = 360°·r / l' : '圆台侧面展开图是扇环：θ = 360°·(R − r) / l', 14, 12);
        }
      }

      function drawGizmo() {
        if (!st.oblique) return;
        const ox = 70, oy = H - 50, L = 60;
        const c = Math.SQRT1_2;
        c2.save();
        GW.draw.arrow(c2, ox, oy, ox + L, oy, { color: '#5b6576', width: 2, head: 9 });
        GW.draw.arrow(c2, ox, oy, ox + L * 0.6 * c, oy - L * 0.6 * c, { color: '#5b6576', width: 2, head: 9 });
        GW.draw.arrow(c2, ox, oy, ox, oy - L, { color: '#5b6576', width: 2, head: 9 });
        c2.font = 'italic 16px ' + MATH; c2.fillStyle = '#5b6576'; c2.textAlign = 'left'; c2.textBaseline = 'middle';
        c2.fillText('x′', ox + L + 4, oy); c2.fillText('y′', ox + L * 0.6 * c + 4, oy - L * 0.6 * c - 6); c2.fillText('z′', ox + 6, oy - L);
        c2.fillText('O′', ox - 24, oy + 8);
        c2.beginPath(); c2.arc(ox, oy, 18, -Math.PI / 4, 0); c2.strokeStyle = RED; c2.lineWidth = 1.6; c2.stroke();
        c2.font = '15px ' + FONT; c2.fillStyle = RED; c2.fillText('45°', ox + 22, oy - 12);
        c2.restore();
      }

      function render() {
        kit.background();
        if (!model) return;
        makeProj();
        let sec = null;
        const canUnfold = st.type === 'cube' || st.type === 'box';
        if (st.net && (st.type === 'cyl' || st.type === 'cone' || st.type === 'frus')) drawNet();
        else if (canUnfold && st.unfold > 0.001) drawUnfold(st.unfold);
        else if (model.poly) sec = drawPoly();
        else if (model.rev) drawRev();
        else drawSphere();
        drawGizmo();
        // 提示
        c2.font = '15px ' + FONT; c2.textAlign = 'left'; c2.textBaseline = 'bottom'; c2.fillStyle = '#5b6576';
        let tip = '';
        if (mode === 'connect') tip = '连线：拖动棱上的圆点可沿线移动，再点两个点连线';
        else if (mode === 'section') tip = '截面：棱上圆点可拖动，点 3 个点确定截面（已选 ' + picks.length + '/3）';
        else if (!(st.net && !model.poly && !model.sphere)) tip = st.oblique ? '斜二测画法：x′ 轴水平，y′ 轴与 x′ 轴成 45°，y 方向长度减半' : '拖动旋转 · 滚轮/双指缩放';
        c2.fillText(tip, 14, H - 10);
        updateInfo(sec);
      }

      // ---------- 交互 ----------
      const ptrs = new Map();
      let drag = null, pinch = null, dragPoint = null, dragSection = null;
      function nearestPick(p, tol) {
        if (!model.poly || !PR) return null;
        let best = null;
        pickPoints().forEach((pp) => {
          const s = PR.S(pp.p), d = Math.hypot(s[0] - p.x, s[1] - p.y);
          if (d < (tol || 18) && (!best || d < best.d)) best = { d, key: pp.key };
        });
        return best;
      }
      // 截面顶点落在某条棱上：返回这条棱和它在线段上的位置，供拖动时反推 t。
      function edgeOfPoint(pt) {
        const P = model.poly; if (!P) return null;
        let loose = null;
        for (const e of P.edges) {
          const A = P.V[e.a], B = P.V[e.b], AB = sub(B, A), L2 = dot(AB, AB) || 1;
          const t = GW.clamp(dot(sub(pt, A), AB) / L2, 0, 1);
          if (len(sub(pt, lerp(A, B, t))) > 1e-6) continue;
          const cand = { a: e.a, b: e.b, t };
          if (t > 0.02 && t < 0.98) return cand;
          if (!loose) loose = cand;
        }
        return loose;
      }
      canvas.addEventListener('pointerdown', (e) => {
        const p = kit.toLocal(e);
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        ptrs.set(e.pointerId, p);
        e.preventDefault(); e.stopPropagation();
        if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()];
          pinch = { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z: st.zoom }; drag = null; dragPoint = null; dragSection = null; return;
        }
        // 截面模式：截面的橙色顶点本身也能沿线拖，拖它就等于调整定义平面的那个点。
        if (mode === 'section') {
          const sec = computeSection();
          if (sec && sec.pts) {
            let hit = null;
            sec.pts.forEach((pt) => {
              const s = PR.S(pt), d = Math.hypot(s[0] - p.x, s[1] - p.y);
              if (d < 16 && (!hit || d < hit.d)) hit = { d, pt };
            });
            if (hit) {
              const e = edgeOfPoint(hit.pt);
              if (e) {
                const defs = st.section.map(keyPoint);
                let idx = 0, bd = Infinity;
                defs.forEach((q, i) => { if (!q) return; const d = len(sub(q, hit.pt)); if (d < bd) { bd = d; idx = i; } });
                dragSection = { idx, a: e.a, b: e.b, key: 'm' + e.a + '-' + e.b, moved: false, x: p.x, y: p.y };
                drag = null; dragPoint = null;
                return;
              }
            }
          }
        }
        // 连线/截面模式：按住棱上的点可以直接沿线拖，拖动不旋转几何体。
        if (mode !== 'rotate') {
          const hit = nearestPick(p, 18);
          if (hit) { dragPoint = { key: hit.key, moved: false, x: p.x, y: p.y }; drag = null; return; }
        }
        drag = { x: p.x, y: p.y, yaw: st.yaw, elev: st.elev, moved: false };
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!ptrs.has(e.pointerId)) return;
        const p = kit.toLocal(e);
        ptrs.set(e.pointerId, p);
        if (pinch && ptrs.size >= 2) {
          const [a, b] = [...ptrs.values()];
          st.zoom = GW.clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 0.3, 3); dirty = true; return;
        }
        if (dragSection) {
          if (Math.hypot(p.x - dragSection.x, p.y - dragSection.y) > 3) dragSection.moved = true;
          if (dragSection.moved && model.poly) {
            const A = PR.S(model.poly.V[dragSection.a]), B = PR.S(model.poly.V[dragSection.b]);
            const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
            const t = GW.clamp(((p.x - A[0]) * dx + (p.y - A[1]) * dy) / L2, 0.04, 0.96);
            st.pos[dragSection.key] = Math.round(t * 1000) / 1000;
            st.section[dragSection.idx] = dragSection.key;
            dirty = true;
          }
          return;
        }
        if (dragPoint) {
          if (Math.hypot(p.x - dragPoint.x, p.y - dragPoint.y) > 3) dragPoint.moved = true;
          if (dragPoint.moved && dragPoint.key[0] === 'm' && model.poly) {
            const [a, b] = dragPoint.key.slice(1).split('-').map(Number);
            const A = PR.S(model.poly.V[a]), B = PR.S(model.poly.V[b]);
            const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
            const t = GW.clamp(((p.x - A[0]) * dx + (p.y - A[1]) * dy) / L2, 0.04, 0.96);
            st.pos[dragPoint.key] = Math.round(t * 1000) / 1000;
            dirty = true;
          }
          return;
        }
        if (!drag) return;
        if (Math.hypot(p.x - drag.x, p.y - drag.y) > 5) drag.moved = true;
        if (!drag.moved) return;
        if (st.net && !model.poly && !model.sphere) return;
        if (st.oblique) { st.oblique = false; viewSeg.set('ortho'); drag.yaw = st.yaw; drag.elev = st.elev; drag.x = p.x; drag.y = p.y; }
        st.yaw = drag.yaw - (p.x - drag.x) * 0.5;
        st.elev = GW.clamp(drag.elev + (p.y - drag.y) * 0.5, -85, 85);
        dirty = true;
      });
      const up = (e) => {
        if (!ptrs.has(e.pointerId)) return;
        const p = ptrs.get(e.pointerId);
        ptrs.delete(e.pointerId);
        if (ptrs.size < 2) pinch = null;
        if (dragSection) {
          dragSection = null;
          if (!ptrs.size) drag = null;
          save(true);
          return;
        }
        if (dragPoint) {
          if (!dragPoint.moved) onTap(p);
          dragPoint = null;
          if (!ptrs.size) drag = null;
          save(true);
          return;
        }
        if (drag && !drag.moved && mode !== 'rotate') onTap(p);
        if (ptrs.size === 0) drag = null;
        save(true);
      };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault(); e.stopPropagation();
        st.zoom = GW.clamp(st.zoom * Math.exp(-e.deltaY * 0.0012), 0.3, 3); dirty = true; save(true);
      }, { passive: false });

      function onTap(p) {
        if (!model.poly || !PR) return;
        const best = nearestPick(p, 20);
        if (!best) return;
        if (picks.includes(best.key)) { picks = picks.filter((k) => k !== best.key); dirty = true; return; }
        picks.push(best.key);
        if (mode === 'connect' && picks.length === 2) {
          if (!st.segs.some((s) => (s[0] === picks[0] && s[1] === picks[1]) || (s[0] === picks[1] && s[1] === picks[0]))) st.segs.push(picks.slice());
          picks = []; save();
        } else if (mode === 'section' && picks.length === 3) {
          st.section = picks.slice(); picks = [];
          const sec = computeSection();
          if (sec && sec.bad) { GW.toast('三点共线，不能确定平面'); st.section = []; }
          else if (sec && sec.pts.length < 3) GW.toast('该平面与几何体只交于点或线');
          save();
        }
        dirty = true;
      }

      // ---------- 面板 ----------
      const panel = kit.panel;
      const typeSel = GW.ui.select({ label: '几何体', options: TYPES.map((t) => ({ value: t.id, label: t.label })), value: st.type, onChange: (v) => { st.type = v; st.segs = []; st.section = []; st.pos = {}; picks = []; st.unfold = 0; st.net = false; unfoldPlay = 0; rebuild(); buildPanel(); save(); } });
      const dimBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
      panel.append(GW.ui.group('几何体', typeSel.el, dimBox));
      const viewSeg = GW.ui.segmented({ options: [{ value: 'ortho', label: '旋转视图' }, { value: 'oblique', label: '斜二测' }], value: st.oblique ? 'oblique' : 'ortho', onChange: (v) => { st.oblique = v === 'oblique'; dirty = true; save(); } });
      const resetView = GW.ui.button({ label: '↺ 复位视角', onClick: () => { st.yaw = -38; st.elev = 26; st.zoom = 1; st.oblique = false; viewSeg.set('ortho'); dirty = true; save(); } });
      const topView = GW.ui.button({ label: '俯视', onClick: () => { st.yaw = 0; st.elev = 85; st.oblique = false; viewSeg.set('ortho'); dirty = true; save(); } });
      const frontView = GW.ui.button({ label: '正视', onClick: () => { st.yaw = 0; st.elev = 0; st.oblique = false; viewSeg.set('ortho'); dirty = true; save(); } });
      const tLabels = GW.ui.toggle({ label: '显示字母', value: st.labels, onChange: (v) => { st.labels = v; dirty = true; save(); } });
      panel.append(GW.ui.group('视角', viewSeg.el, GW.h('div', { class: 'gw-row' }, frontView.el, topView.el), resetView.el, tLabels.el));
      const auxBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      const auxGroup = GW.ui.group('辅助线与截面', auxBox);
      panel.append(auxGroup);
      const netBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      const netGroup = GW.ui.group('展开图', netBox);
      panel.append(netGroup);
      const rV = GW.ui.readout('体积 V'), rS = GW.ui.readout('表面积 S'), rX = GW.ui.readout(''), rSec = GW.ui.readout('截面');
      const segList = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' } });
      panel.append(GW.ui.group('度量', rV.el, rS.el, rX.el, rSec.el, segList));
      let unfoldSl = null;

      function buildPanel() {
        const t = TYPE[st.type];
        typeSel.set(st.type);
        dimBox.innerHTML = '';
        t.dims.forEach((dm) => {
          const sl = GW.ui.slider({ label: dm.label, min: dm.min, max: dm.max, step: 0.1, value: st.dims[st.type][dm.k], onInput: (v) => { st.dims[st.type][dm.k] = v; rebuild(); save(true); } });
          dimBox.append(sl.el);
        });
        auxBox.innerHTML = '';
        const o = st.opts;
        const tg = (label, key, def) => GW.ui.toggle({ label, value: o[key] == null ? def : o[key], onChange: (v) => { o[key] = v; dirty = true; save(); } }).el;
        if (st.type === 'cube' || st.type === 'box') auxBox.append(tg('体对角线 AC₁、BD₁', 'bodyDiag', false), tg('面对角线 AC、BD、A₁C₁、B₁D₁', 'faceDiag', false));
        if (st.type === 'pyr4' || st.type === 'tet') auxBox.append(tg('高 PO（O 为底面中心）', 'height', false));
        if (st.type === 'cyl' || st.type === 'frus') auxBox.append(tg('轴 OO′', 'axis', true), tg('轴截面', 'axial', false));
        if (st.type === 'cone') auxBox.append(tg('高 SO', 'axis', true), tg('轴截面', 'axial', false));
        if (st.type === 'sphere') auxBox.append(tg('大圆（赤道）', 'equator', true), tg('半径 OA', 'radius', true));
        if (t.poly) {
          const modeSeg = GW.ui.segmented({ options: [{ value: 'rotate', label: '旋转' }, { value: 'connect', label: '连线' }, { value: 'section', label: '截面' }], value: mode, onChange: (v) => { mode = v; picks = []; dirty = true; } });
          const clr = GW.ui.button({ label: '清除连线', onClick: () => { st.segs = []; picks = []; dirty = true; save(); } });
          const clrS = GW.ui.button({ label: '清除截面', onClick: () => { st.section = []; picks = []; dirty = true; save(); } });
          const resetPts = GW.ui.button({ label: '棱上点复位', onClick: () => { st.pos = {}; picks = []; dirty = true; save(); } });
          auxBox.append(GW.h('div', { style: { fontSize: '12px', color: '#5b6576' } }, '连线/截面模式：拖动棱上的圆点可沿线移动，再点击选点'), modeSeg.el, GW.h('div', { class: 'gw-row' }, clr.el, clrS.el), resetPts.el);
          if (st.type === 'cube') {
            const ex1 = GW.ui.button({ label: '示例：截面 A₁BD', onClick: () => { st.section = ['v4', 'v1', 'v3']; dirty = true; save(); } });
            const ex2 = GW.ui.button({ label: '示例：正六边形截面', onClick: () => { st.section = ['m0-1', 'm1-2', 'm2-6']; dirty = true; save(); } });
            auxBox.append(ex1.el, ex2.el);
          }
        }
        auxGroup.style.display = auxBox.children.length ? '' : 'none';
        netBox.innerHTML = '';
        unfoldSl = null;
        if (st.type === 'cube' || st.type === 'box') {
          unfoldSl = GW.ui.slider({ label: '展开程度', min: 0, max: 1, step: 0.01, value: st.unfold, onInput: (v) => { st.unfold = v; unfoldPlay = 0; dirty = true; save(true); } });
          const play = GW.ui.button({ label: '▶ 展开 / 折叠', onClick: () => { unfoldPlay = st.unfold > 0.5 ? -1 : 1; } });
          netBox.append(unfoldSl.el, play.el);
        } else if (st.type === 'cyl' || st.type === 'cone' || st.type === 'frus') {
          netBox.append(GW.ui.toggle({ label: '显示侧面展开图', value: st.net, onChange: (v) => { st.net = v; dirty = true; save(); } }).el);
        }
        netGroup.style.display = netBox.children.length ? '' : 'none';
        dirty = true;
      }

      function updateInfo(sec) {
        const d = st.dims[st.type], PI = Math.PI;
        let V = 0, S = 0, x = '', xl = '';
        const tri = (a) => Math.sqrt(3) / 4 * a * a;
        switch (st.type) {
          case 'cube': V = d.a ** 3; S = 6 * d.a * d.a; xl = '体对角线'; x = fmt(Math.sqrt(3) * d.a) + '（√3a）'; break;
          case 'box': V = d.a * d.b * d.c; S = 2 * (d.a * d.b + d.b * d.c + d.a * d.c); xl = '体对角线'; x = fmt(Math.hypot(d.a, d.b, d.c)); break;
          case 'prism3': V = tri(d.a) * d.h; S = 2 * tri(d.a) + 3 * d.a * d.h; break;
          case 'pyr4': { V = d.a * d.a * d.h / 3; const hs = Math.hypot(d.h, d.a / 2); S = d.a * d.a + 2 * d.a * hs; xl = '斜高'; x = fmt(hs); break; }
          case 'tet': { V = tri(d.a) * d.h / 3; const r = d.a * Math.sqrt(3) / 6, hs = Math.hypot(d.h, r); S = tri(d.a) + 1.5 * d.a * hs; xl = '侧棱长'; x = fmt(Math.hypot(d.h, d.a / Math.sqrt(3))); break; }
          case 'bienao': { V = d.a * d.b / 2 * d.h / 3; const PB = Math.hypot(d.h, d.a); S = d.a * d.b / 2 + d.a * d.h / 2 + d.b * PB / 2 + Math.hypot(d.a, d.b) * d.h / 2; xl = 'PC'; x = fmt(Math.hypot(d.a, d.b, d.h)); break; }
          case 'cyl': V = PI * d.r * d.r * d.h; S = 2 * PI * d.r * d.r + 2 * PI * d.r * d.h; break;
          case 'cone': { const l = Math.hypot(d.r, d.h); V = PI * d.r * d.r * d.h / 3; S = PI * d.r * d.r + PI * d.r * l; xl = '母线 l'; x = fmt(l); break; }
          case 'frus': { const l = Math.hypot(d.R - d.r, d.h); V = PI * d.h * (d.R * d.R + d.R * d.r + d.r * d.r) / 3; S = PI * (d.R * d.R + d.r * d.r) + PI * (d.R + d.r) * l; xl = '母线 l'; x = fmt(l); break; }
          case 'sphere': V = 4 / 3 * PI * d.R ** 3; S = 4 * PI * d.R * d.R; break;
        }
        rV.set(fmt(V)); rS.set(fmt(S));
        rX.el.style.display = xl ? '' : 'none'; rX.el.firstChild.textContent = xl; rX.set(x);
        if (sec && sec.pts && sec.pts.length >= 3) { rSec.el.style.display = ''; rSec.set(sec.shape + '，面积 ' + fmt(sec.area)); }
        else rSec.el.style.display = 'none';
        const names = model.poly ? keyNames() : {};
        segList.innerHTML = '';
        if (model.poly && !(st.unfold > 0.001)) st.segs.forEach(([a, b]) => {
          const pa = keyPoint(a), pb = keyPoint(b); if (!pa || !pb) return;
          segList.append(GW.h('div', { class: 'gw-readout' }, GW.h('span', { style: { color: BLUE, fontFamily: MATH, fontStyle: 'italic', fontSize: '15px' } }, names[a] + names[b]), GW.h('b', null, fmt(len(sub(pa, pb))))));
        });
      }

      rebuild(); buildPanel();
      kit.loop((dt) => {
        if (unfoldPlay && dt) {
          st.unfold = GW.clamp(st.unfold + unfoldPlay * dt * 0.5, 0, 1);
          if (st.unfold === 0 || st.unfold === 1) { unfoldPlay = 0; save(); }
          unfoldSl && unfoldSl.set(st.unfold);
          dirty = true;
        }
        if (!dirty || !W) return;
        dirty = false;
        render();
      });
      return {
        destroy() { clearTimeout(saveT); kit.destroy(); },
        // 供探针核对「棱上点可拖动」：读当前拾取点与它们的屏幕坐标，不改变任何状态。
        points() { return pickPoints(); },
        screen(p) { return PR ? PR.S(p) : null; },
        setMode(m) { mode = m; picks = []; dragPoint = null; dragSection = null; dirty = true; },
        getMode() { return mode; },
        section() { return computeSection(); },
        state: st,
      };
    },
  });
})();
