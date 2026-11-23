/* 数理无限画布 · 高中物理 · 电场线与等势面
 * 真实库仑场数值计算：电场线用 RK4 沿场方向积分追踪，等势线用 marching squares 提取。
 * 单位：1 m = 100 px（画布中心为原点），点电荷电荷量以 μC 计，k = 9×10⁹ N·m²/C²。
 * 平行板电容器：每块极板按“垂直纸面的无限长带电平面截面”处理（离散为二维线电荷，E = 2kλ/r），板间近似匀强。
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541';
  const K = 9e3;            // k × 1μC：E[N/C] = K·q[μC]/r²[m]
  const PX = 100;           // 每米像素
  const RQ = 0.14;          // 点电荷绘制半径 (m)
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sci(v, d = 2) {
    if (!isFinite(v)) return '∞';
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 0.01 && a < 1e4) return v.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : d);
    const e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e);
    return m.toFixed(d - 1 >= 0 ? d - 1 : 0) + '×10' + String(e).split('').map((c) => SUP[c]).join('');
  }

  const PRESETS = {
    single_pos: { label: '单个正电荷', items: [{ t: 'p', x: 0, y: 0, q: 2 }] },
    single_neg: { label: '单个负电荷', items: [{ t: 'p', x: 0, y: 0, q: -2 }] },
    dipole: { label: '等量异种电荷', items: [{ t: 'p', x: -1.2, y: 0, q: 2 }, { t: 'p', x: 1.2, y: 0, q: -2 }] },
    same: { label: '等量同种电荷', items: [{ t: 'p', x: -1.2, y: 0, q: 2 }, { t: 'p', x: 1.2, y: 0, q: 2 }] },
    unequal: { label: '不等量异种（+4q 与 −q）', items: [{ t: 'p', x: -0.9, y: 0, q: 4 }, { t: 'p', x: 0.9, y: 0, q: -1 }] },
    capacitor: { label: '平行板电容器', items: [{ t: 'plate', x: 0, y: -0.7, len: 4.6, s: 0.16 }, { t: 'plate', x: 0, y: 0.7, len: 4.6, s: -0.16 }] },
  };
  const PLATE_N = 110;

  GW.registerSim({
    id: 'phy-efield', name: '电场线与等势面', category: 'physics', group: '电磁学',
    desc: '点电荷/电容器的真实电场线（RK4 追踪）与等势线，可拖动电荷、移动并释放试探电荷',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="12" r="3"/><circle cx="17" cy="12" r="3"/><path d="M10 12h4M8.5 9.5C10 6 14 6 15.5 9.5M8.5 14.5C10 18 14 18 15.5 14.5"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      if (!S.items) S.items = JSON.parse(JSON.stringify(PRESETS.dipole.items));
      if (!S.preset) S.preset = 'dipole';
      if (S.showLines == null) S.showLines = true;
      if (S.showEq == null) S.showEq = true;
      if (!S.heat) S.heat = 'none';
      if (!S.density) S.density = 8;
      if (S.showTest == null) S.showTest = true;
      if (!S.test) S.test = { x: 0, y: -1.6 };
      if (!S.q0) S.q0 = 1;
      const save = () => ctx.save();

      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 750, H = 620, dirty = true;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      const toPx = (x, y) => [W / 2 + x * PX, H / 2 + y * PX];
      const toM = (p) => ({ x: (p.x - W / 2) / PX, y: (p.y - H / 2) / PX });

      let sel = S.items.length ? 0 : -1;
      let lines = [], grid = null, heatCanvas = null;
      let motion = null; // {x,y,vx,vy,trail:[]}

      // ---------- 场计算 ----------
      let elems = []; // 缓存的源：{x,y,q,two}
      let plateV = [];
      function buildElems() {
        elems = [];
        const pe = [];
        for (const it of S.items) {
          if (it.t === 'p') elems.push({ x: it.x, y: it.y, q: it.q, two: false });
        }
        const pls = S.items.filter((it) => it.t === 'plate');
        pls.forEach((it, k) => {
          const ds = it.len / PLATE_N;
          for (let i = 0; i < PLATE_N; i++) pe.push({ x: it.x - it.len / 2 + (i + 0.5) * ds, y: it.y, q: it.s * ds, two: true, plate: k, ds });
        });
        if (pls.length) solveConductors(pls, pe, elems.slice());
        elems = elems.concat(pe);
      }
      // 极板是导体：求解电荷分布使每块极板为等势体，且总电荷 = σ·L（含点电荷的静电感应）
      function solveConductors(pls, pe, pts) {
        const n = pe.length, m = pls.length, N = n + m;
        const A = new Float64Array(N * N), b = new Float64Array(N);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            const r = i === j ? 0 : Math.hypot(pe[i].x - pe[j].x, pe[i].y - pe[j].y);
            // 宽 ds 的均匀带电条在自身中心处的平均势：-2k[ln(ds/2) - 1]
            A[i * N + j] = i === j ? -2 * K * (Math.log(pe[i].ds / 2) - 1) : -2 * K * Math.log(r);
          }
          A[i * N + n + pe[i].plate] = -1;
          let ext = 0;
          for (const p of pts) ext += K * p.q / Math.max(0.02, Math.hypot(pe[i].x - p.x, pe[i].y - p.y));
          b[i] = -ext;
        }
        pls.forEach((it, k) => {
          const row = n + k;
          for (let j = 0; j < n; j++) if (pe[j].plate === k) A[row * N + j] = 1;
          b[row] = it.s * it.len;
        });
        // 高斯消元（列主元）
        for (let col = 0; col < N; col++) {
          let piv = col, best = Math.abs(A[col * N + col]);
          for (let r = col + 1; r < N; r++) { const v = Math.abs(A[r * N + col]); if (v > best) { best = v; piv = r; } }
          if (best < 1e-12) continue;
          if (piv !== col) {
            for (let c2 = 0; c2 < N; c2++) { const t = A[col * N + c2]; A[col * N + c2] = A[piv * N + c2]; A[piv * N + c2] = t; }
            const t = b[col]; b[col] = b[piv]; b[piv] = t;
          }
          const d = A[col * N + col];
          for (let r = col + 1; r < N; r++) {
            const f = A[r * N + col] / d;
            if (!f) continue;
            for (let c2 = col; c2 < N; c2++) A[r * N + c2] -= f * A[col * N + c2];
            b[r] -= f * b[col];
          }
        }
        const x = new Float64Array(N);
        for (let r = N - 1; r >= 0; r--) {
          let s = b[r];
          for (let c2 = r + 1; c2 < N; c2++) s -= A[r * N + c2] * x[c2];
          x[r] = Math.abs(A[r * N + r]) > 1e-12 ? s / A[r * N + r] : 0;
        }
        for (let i = 0; i < n; i++) pe[i].q = x[i];
        plateV = pls.map((_, k) => x[n + k]);
      }
      function field(x, y) {
        let ex = 0, ey = 0;
        for (let i = 0; i < elems.length; i++) {
          const e = elems[i], dx = x - e.x, dy = y - e.y;
          let r2 = dx * dx + dy * dy;
          if (r2 < 1e-6) r2 = 1e-6;
          // 点电荷 kq/r²；二维线电荷 2kλ/r
          const f = e.two ? (2 * K * e.q) / r2 : (K * e.q) / (r2 * Math.sqrt(r2));
          ex += f * dx; ey += f * dy;
        }
        return [ex, ey];
      }
      function potential(x, y) {
        let v = 0;
        for (let i = 0; i < elems.length; i++) {
          const e = elems[i], dx = x - e.x, dy = y - e.y;
          const r = Math.max(1e-3, Math.hypot(dx, dy));
          v += e.two ? -2 * K * e.q * Math.log(r) : (K * e.q) / r;
        }
        return v;
      }
      const plates = () => S.items.filter((it) => it.t === 'plate');
      const points = () => S.items.filter((it) => it.t === 'p');
      function segDist(px, py, it) {
        const x0 = it.x - it.len / 2, x1 = it.x + it.len / 2;
        const cx = Math.max(x0, Math.min(x1, px));
        return Math.hypot(px - cx, py - it.y);
      }
      // 返回 'neg' | 'pos' | null（是否落入某个电荷/极板）
      function hitSource(x, y) {
        for (const it of S.items) {
          if (it.t === 'p') { if (Math.hypot(x - it.x, y - it.y) < 0.09) return it.q > 0 ? 'pos' : 'neg'; }
          else if (segDist(x, y, it) < 0.035) return 'plate'; // 导体板：电场线终止于其表面的感应电荷
        }
        return null;
      }

      function trace(x, y, dir, stopAt) {
        const pts = [[x, y]];
        const h = dragging ? 0.04 : 0.022;
        const mx = W / 2 / PX + 3, my = H / 2 / PX + 3;
        const dirf = (x, y) => { const [ex, ey] = field(x, y); const m = Math.hypot(ex, ey) || 1e-12; return [dir * ex / m, dir * ey / m, m]; };
        let end = 'inf';
        for (let n = 0, nmax = dragging ? 900 : 2600; n < nmax; n++) {
          const [k1x, k1y, m1] = dirf(x, y);
          if (m1 < 1e-3) { end = 'stall'; break; }
          const [k2x, k2y] = dirf(x + h / 2 * k1x, y + h / 2 * k1y);
          const [k3x, k3y] = dirf(x + h / 2 * k2x, y + h / 2 * k2y);
          const [k4x, k4y] = dirf(x + h * k3x, y + h * k3y);
          x += h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
          y += h / 6 * (k1y + 2 * k2y + 2 * k3y + k4y);
          pts.push([x, y]);
          if (Math.abs(x) > mx || Math.abs(y) > my) { end = 'inf'; break; }
          if (n > 3) { const hs = hitSource(x, y); if (hs === stopAt || hs === 'plate') { end = hs; break; } }
        }
        return { pts, end };
      }

      function computeLines() {
        lines = [];
        const dens = S.density;
        // 正电荷：沿 E 方向发出，均匀分布，条数 ∝ 电荷量
        for (const it of S.items) {
          if (it.t === 'p' && it.q > 0) {
            const n = Math.max(2, Math.round(dens * it.q));
            const off = Math.PI / n * 0.5 * (S.items.indexOf(it) % 2);
            for (let i = 0; i < n; i++) {
              const a = off + (2 * Math.PI * i) / n;
              const r = trace(it.x + Math.cos(a) * 0.1, it.y + Math.sin(a) * 0.1, 1, 'neg');
              r.pts.unshift([it.x + Math.cos(a) * RQ * 0.9, it.y + Math.sin(a) * RQ * 0.9]);
              lines.push({ pts: r.pts, fwd: true });
            }
          }
        }
        // 导体板：两个表面的面电荷 λ = Eₙ·ds/(4πk)（高斯定理）；正电荷处发出电场线，负电荷处（来自无穷远的）回溯
        const patches = [];
        for (const e of elems) {
          if (!e.two) continue;
          for (const side of [-1, 1]) {
            const En = field(e.x, e.y + side * 0.04)[1] * side;
            patches.push({ x: e.x, y: e.y, ds: e.ds, side, lam: En * e.ds / (4 * Math.PI * K) });
          }
        }
        for (const sgn of [1, -1]) {
          const P = patches.filter((p) => p.lam * sgn > 0);
          let tot = 0; const cum = P.map((p) => (tot += Math.abs(p.lam)));
          const n = Math.round(dens * 3 * tot);
          let j = 0;
          for (let i = 0; i < n; i++) {
            const target = (i + 0.5) / n * tot;
            while (j < cum.length - 1 && cum[j] < target) j++;
            const prevC = j ? cum[j - 1] : 0, p = P[j];
            const x = p.x - p.ds / 2 + (target - prevC) / Math.max(1e-12, cum[j] - prevC) * p.ds;
            const r = trace(x, p.y + p.side * 0.05, sgn, sgn > 0 ? 'neg' : 'pos');
            if (sgn < 0 && (r.end === 'pos' || r.end === 'plate')) continue;
            r.pts.unshift([x, p.y + p.side * 0.012]);
            lines.push({ pts: r.pts, fwd: sgn > 0 });
          }
        }
        // 负电荷：逆着 E 回溯，只保留来自无穷远的电场线（来自正电荷的已画出）
        for (const it of S.items) {
          if (it.t === 'p' && it.q < 0) {
            const n = Math.max(2, Math.round(dens * -it.q));
            const off = Math.PI / n * 0.5;
            for (let i = 0; i < n; i++) {
              const a = off + (2 * Math.PI * i) / n;
              const r = trace(it.x + Math.cos(a) * 0.1, it.y + Math.sin(a) * 0.1, -1, 'pos');
              if (r.end === 'pos' || r.end === 'plate') continue;
              r.pts.unshift([it.x + Math.cos(a) * RQ * 0.9, it.y + Math.sin(a) * RQ * 0.9]);
              lines.push({ pts: r.pts, fwd: false });
            }
          }
        }
      }

      let GS = 5, dragging = false; // 网格像素（拖动场源时临时用粗网格保证流畅）
      function computeGrid() {
        GS = dragging ? 10 : 5;
        const nx = Math.ceil(W / GS) + 1, ny = Math.ceil(H / GS) + 1;
        const v = new Float32Array(nx * ny), e = new Float32Array(nx * ny), bad = new Uint8Array(nx * ny);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const x = (i * GS - W / 2) / PX, y = (j * GS - H / 2) / PX;
          const k = j * nx + i;
          // 同时求 φ 与 E（一次遍历场源）
          let ph = 0, ex = 0, ey = 0;
          for (let q = 0; q < elems.length; q++) {
            const el = elems[q], dx = x - el.x, dy = y - el.y;
            const r2 = Math.max(1e-6, dx * dx + dy * dy);
            if (el.two) { ph -= K * el.q * Math.log(r2); const f2 = (2 * K * el.q) / r2; ex += f2 * dx; ey += f2 * dy; }
            else { const r = Math.sqrt(r2); ph += (K * el.q) / Math.max(1e-3, r); const f3 = (K * el.q) / (r2 * r); ex += f3 * dx; ey += f3 * dy; }
          }
          v[k] = ph; e[k] = Math.hypot(ex, ey);
          for (const it of S.items) {
            if (it.t === 'p' && Math.hypot(x - it.x, y - it.y) < RQ * 1.05) bad[k] = 1;
            if (it.t === 'plate' && segDist(x, y, it) < 0.04) bad[k] = 1;
          }
        }
        grid = { nx, ny, v, e, bad };
        // 等势线间隔
        const pl = plates(), pts = points();
        let dphi;
        if (pl.length) {
          // 以两极板中心处实际电势差的 1/10 为间隔
          const vs = plateV;
          const span = vs.length > 1 ? Math.abs(vs[0] - vs[1]) : Math.abs(vs[0]) * 2;
          dphi = Math.max(1, span / 10);
        } else {
          const qmax = Math.max(0.5, ...pts.map((p) => Math.abs(p.q)));
          dphi = K * qmax / 2.0;
        }
        grid.dphi = dphi;
        grid.vmax = pl.length ? Infinity : K * Math.max(0.5, ...pts.map((p) => Math.abs(p.q))) / 0.36;
        buildHeat();
      }

      function buildHeat() {
        heatCanvas = null;
        if (S.heat === 'none' || !grid) return;
        const { nx, ny, v, e } = grid;
        const cv = document.createElement('canvas');
        cv.width = nx; cv.height = ny;
        const g = cv.getContext('2d'), img = g.createImageData(nx, ny);
        const vref = grid.dphi * 3;
        let eref = 0; for (let k = 0; k < e.length; k++) eref += Math.log(1 + e[k]);
        eref = eref / e.length;
        for (let k = 0; k < nx * ny; k++) {
          let r, gg, b, a;
          if (S.heat === 'phi') {
            const t = Math.tanh(v[k] / vref);
            if (t >= 0) { r = 228; gg = 87; b = 46; } else { r = 51; gg = 102; b = 255; }
            a = Math.abs(t) * 150;
          } else {
            const t = GW.clamp((Math.log(1 + e[k]) - eref + 2.2) / 4.4, 0, 1);
            r = 242; gg = Math.round(165 - 80 * t); b = Math.round(65 - 30 * t); a = t * 170;
          }
          img.data[k * 4] = r; img.data[k * 4 + 1] = gg; img.data[k * 4 + 2] = b; img.data[k * 4 + 3] = a;
        }
        g.putImageData(img, 0, 0);
        heatCanvas = cv;
      }

      function recompute() { buildElems(); computeLines(); computeGrid(); dirty = false; updateReadouts(); }

      // ---------- 绘制 ----------
      function drawEquip() {
        if (!grid) return;
        const { nx, ny, v, bad, dphi, vmax } = grid;
        c.save();
        c.lineWidth = 2;
        c.setLineDash([7, 5]);
        const kmin = -40, kmax = 40;
        for (let L = kmin; L <= kmax; L++) {
          const lv = L * dphi;
          if (Math.abs(lv) > vmax) continue;
          c.strokeStyle = L > 0 ? 'rgba(228,87,46,0.55)' : L < 0 ? 'rgba(51,102,255,0.55)' : 'rgba(27,36,51,0.45)';
          const polys = contour(lv);
          if (!polys.length) continue;
          c.beginPath();
          for (const P of polys) P.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])));
          c.stroke();
        }
        c.restore();
      }

      // marching squares：把同一等值线的小段串成连续折线（保证虚线连贯）
      function contour(lv) {
        const { nx, ny, v, bad } = grid;
        const pt = new Map(), adj = new Map();
        const link = (a, b) => {
          if (!adj.has(a)) adj.set(a, []);
          if (!adj.has(b)) adj.set(b, []);
          adj.get(a).push(b); adj.get(b).push(a);
        };
        for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
          const k0 = j * nx + i, k1 = k0 + 1, k2 = k0 + nx + 1, k3 = k0 + nx;
          if (bad[k0] || bad[k1] || bad[k2] || bad[k3]) continue;
          const a = v[k0] - lv, b = v[k1] - lv, cc = v[k2] - lv, d = v[k3] - lv;
          const idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (cc > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
          if (idx === 0 || idx === 15) continue;
          const x0 = i * GS, y0 = j * GS;
          // 边编号：水平边 = 2·(左端格点)，竖直边 = 2·(上端格点)+1，相邻格子共享同一条边
          const T = k0 * 2, B = k3 * 2, L = k0 * 2 + 1, R = k1 * 2 + 1;
          const P = (key) => {
            if (!pt.has(key)) {
              if (key === T) pt.set(key, [x0 + GS * a / (a - b), y0]);
              else if (key === R) pt.set(key, [x0 + GS, y0 + GS * b / (b - cc)]);
              else if (key === B) pt.set(key, [x0 + GS * d / (d - cc), y0 + GS]);
              else pt.set(key, [x0, y0 + GS * a / (a - d)]);
            }
            return key;
          };
          switch (idx) {
            case 1: case 14: link(P(L), P(T)); break;
            case 2: case 13: link(P(T), P(R)); break;
            case 3: case 12: link(P(L), P(R)); break;
            case 4: case 11: link(P(R), P(B)); break;
            case 6: case 9: link(P(T), P(B)); break;
            case 7: case 8: link(P(L), P(B)); break;
            case 5: link(P(L), P(T)); link(P(R), P(B)); break;
            case 10: link(P(T), P(R)); link(P(B), P(L)); break;
          }
        }
        const used = new Set(), polys = [];
        const keys = [...adj.keys()];
        const order = keys.filter((k) => adj.get(k).length === 1).concat(keys); // 先从端点出发，再处理闭合环
        for (const k0 of order) {
          if (used.has(k0)) continue;
          const poly = [];
          let cur = k0;
          while (cur != null) {
            used.add(cur); poly.push(pt.get(cur));
            const nb = adj.get(cur).find((n) => !used.has(n));
            if (nb == null && poly.length > 2 && adj.get(cur).includes(k0)) poly.push(pt.get(k0));
            cur = nb;
          }
          if (poly.length > 1) polys.push(poly);
        }
        return polys;
      }

      function drawLines() {
        c.save();
        c.lineWidth = 2;
        c.strokeStyle = 'rgba(27,36,51,0.82)';
        c.lineJoin = 'round';
        for (const ln of lines) {
          c.beginPath();
          ln.pts.forEach((p, i) => { const [x, y] = toPx(p[0], p[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); });
          c.stroke();
        }
        // 方向箭头：按弧长放置
        c.fillStyle = INK;
        for (const ln of lines) {
          const P = ln.pts;
          let s = 0, next = 0.85;
          const total = (() => { let t = 0; for (let i = 1; i < P.length; i++) t += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return t; })();
          for (let i = 1; i < P.length; i++) {
            s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
            if (s >= next) {
              next += 2.6;
              if (total - s < 0.35) break;
              const [x, y] = toPx(P[i][0], P[i][1]);
              if (x < 0 || x > W || y < 0 || y > H) continue;
              let dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1];
              if (!ln.fwd) { dx = -dx; dy = -dy; }
              const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
              const hl = 11, hw = 5.5;
              c.beginPath();
              c.moveTo(x + dx * hl * 0.5, y + dy * hl * 0.5);
              c.lineTo(x - dx * hl * 0.5 - dy * hw, y - dy * hl * 0.5 + dx * hw);
              c.lineTo(x - dx * hl * 0.5 + dy * hw, y - dy * hl * 0.5 - dx * hw);
              c.closePath(); c.fill();
            }
          }
        }
        c.restore();
      }

      function drawSources() {
        S.items.forEach((it, idx) => {
          const isSel = idx === sel;
          if (it.t === 'p') {
            const [x, y] = toPx(it.x, it.y);
            const r = RQ * PX;
            const col = it.q > 0 ? RED : BLUE;
            const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
            g.addColorStop(0, it.q > 0 ? '#ff9c7d' : '#8fa9ff'); g.addColorStop(1, col);
            c.fillStyle = g;
            c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
            if (isSel) { c.strokeStyle = GOLD; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r + 5, 0, Math.PI * 2); c.stroke(); }
            c.strokeStyle = '#fff'; c.lineWidth = 3;
            c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + 6, y);
            if (it.q > 0) { c.moveTo(x, y - 6); c.lineTo(x, y + 6); }
            c.stroke();
            c.font = 'bold 15px sans-serif'; c.fillStyle = col; c.textAlign = 'left'; c.textBaseline = 'bottom';
            c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 4; c.lineJoin = 'round';
            const lab = (it.q > 0 ? '+' : '−') + Math.abs(it.q) + ' μC';
            c.strokeText(lab, x + r + 4, y - r + 2); c.fillText(lab, x + r + 4, y - r + 2);
          } else {
            const [x0, y] = toPx(it.x - it.len / 2, it.y);
            const w = it.len * PX, col = it.s > 0 ? RED : BLUE;
            c.fillStyle = col;
            c.fillRect(x0, y - 4, w, 8);
            if (isSel) { c.strokeStyle = GOLD; c.lineWidth = 3; c.strokeRect(x0 - 4, y - 8, w + 8, 16); }
            const n = Math.max(4, Math.round(it.len * 3));
            c.fillStyle = col; c.font = 'bold 16px sans-serif'; c.textAlign = 'center';
            const other = plates().find((p) => p !== it);
            const out = other ? -Math.sign(other.y - it.y) || -1 : -1;
            c.textBaseline = out < 0 ? 'bottom' : 'top';
            for (let i = 0; i < n; i++) c.fillText(it.s > 0 ? '+' : '−', x0 + (i + 0.5) * w / n, y + out * 8);
            c.font = '15px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
            c.fillText('σ = ' + (it.s > 0 ? '+' : '−') + Math.abs(it.s).toFixed(2) + ' μC/m²', x0 + w + 10, y);
          }
        });
      }

      function testInfo() {
        const p = motion || S.test;
        const [ex, ey] = field(p.x, p.y);
        const E = Math.hypot(ex, ey), phi = potential(p.x, p.y);
        const q0 = S.q0 * 1e-8; // C
        return { p, ex, ey, E, phi, F: Math.abs(q0) * E, Ep: q0 * phi };
      }

      function drawTest() {
        if (!S.showTest) return;
        if (motion && motion.trail.length > 1) {
          c.save(); c.strokeStyle = GOLD; c.lineWidth = 2.5; c.beginPath();
          motion.trail.forEach((p, i) => { const [x, y] = toPx(p[0], p[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); });
          c.stroke(); c.restore();
        }
        const info = testInfo();
        const [x, y] = toPx(info.p.x, info.p.y);
        // 受力箭头 F = q₀E（长度按 tanh 压缩）
        if (info.E > 1e-6 && !hitSource(info.p.x, info.p.y)) {
          const L = 22 + 70 * Math.tanh(info.E / 9000);
          const sgn = Math.sign(S.q0);
          const ux = sgn * info.ex / info.E, uy = sgn * info.ey / info.E;
          GW.draw.arrow(c, x + ux * 10, y + uy * 10, x + ux * (10 + L), y + uy * (10 + L), { color: CYAN, width: 3, head: 12 });
          c.font = 'italic bold 16px "Times New Roman", serif'; c.fillStyle = CYAN; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('F', x + ux * (L + 26) - uy * 12, y + uy * (L + 26) + ux * 12);
        }
        c.fillStyle = '#fff'; c.strokeStyle = GOLD; c.lineWidth = 3;
        c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill(); c.stroke();
        c.strokeStyle = S.q0 > 0 ? RED : BLUE; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x - 4.5, y); c.lineTo(x + 4.5, y); if (S.q0 > 0) { c.moveTo(x, y - 4.5); c.lineTo(x, y + 4.5); } c.stroke();
        // 数值标签
        const txt1 = 'E = ' + sci(info.E) + ' N/C', txt2 = 'φ = ' + sci(info.phi) + ' V';
        c.font = '15px sans-serif';
        const tw = Math.max(c.measureText(txt1).width, c.measureText(txt2).width) + 16;
        let bx = x + 16, by = y + 14;
        if (bx + tw > W - 4) bx = x - 16 - tw;
        if (by + 48 > H - 4) by = y - 62;
        c.fillStyle = 'rgba(255,255,255,0.88)'; c.strokeStyle = 'rgba(242,165,65,0.8)'; c.lineWidth = 1.5;
        c.beginPath(); c.roundRect ? c.roundRect(bx, by, tw, 48, 8) : c.rect(bx, by, tw, 48); c.fill(); c.stroke();
        c.fillStyle = INK; c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillText(txt1, bx + 8, by + 6); c.fillText(txt2, bx + 8, by + 26);
      }

      function drawDecor() {
        c.save();
        c.strokeStyle = 'rgba(27,36,51,0.05)'; c.lineWidth = 1;
        for (let x = W / 2 % 50; x < W; x += 50) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
        for (let y = H / 2 % 50; y < H; y += 50) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
        c.restore();
      }
      function drawLegend() {
        c.save();
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.fillRect(10, H - 40, 330, 30);
        c.font = '15px sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left';
        c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(18, H - 25); c.lineTo(46, H - 25); c.stroke();
        c.fillStyle = INK; c.fillText('电场线', 52, H - 25);
        c.strokeStyle = 'rgba(228,87,46,0.7)'; c.setLineDash([7, 5]); c.beginPath(); c.moveTo(110, H - 25); c.lineTo(138, H - 25); c.stroke(); c.setLineDash([]);
        c.fillText('等势线', 144, H - 25);
        c.strokeStyle = INK; c.beginPath(); c.moveTo(212, H - 20); c.lineTo(212, H - 30); c.moveTo(212, H - 25); c.lineTo(262, H - 25); c.moveTo(262, H - 20); c.lineTo(262, H - 30); c.stroke();
        c.fillText('0.5 m', 270, H - 25);
        c.restore();
      }

      // ---------- 交互 ----------
      function hit(p) {
        if (S.showTest && !motion) {
          const [x, y] = toPx(S.test.x, S.test.y);
          if (Math.hypot(p.x - x, p.y - y) < 20) return { kind: 'test' };
        }
        for (let i = S.items.length - 1; i >= 0; i--) {
          const it = S.items[i];
          if (it.t === 'p') { const [x, y] = toPx(it.x, it.y); if (Math.hypot(p.x - x, p.y - y) < 22) return { kind: 'item', i }; }
        }
        for (let i = S.items.length - 1; i >= 0; i--) {
          const it = S.items[i];
          if (it.t === 'plate') { const m = toM(p); if (segDist(m.x, m.y, it) * PX < 16) return { kind: 'item', i }; }
        }
        return null;
      }
      let grab = null;
      kit.drag((p, e, hover) => hit(p), (t, p, e, start) => {
        const m = toM(p);
        m.x = GW.clamp(m.x, -W / 2 / PX + 0.1, W / 2 / PX - 0.1); m.y = GW.clamp(m.y, -H / 2 / PX + 0.1, H / 2 / PX - 0.1);
        if (t.kind === 'test') { S.test.x = m.x; S.test.y = m.y; updateReadouts(); return; }
        const it = S.items[t.i];
        if (start) { grab = { dx: it.x - m.x, dy: it.y - m.y }; dragging = true; if (sel !== t.i) { sel = t.i; syncSel(); } return; }
        it.x = m.x + grab.dx; it.y = m.y + grab.dy;
        dirty = true;
      }, (t) => { if (t.kind === 'item') { dragging = false; dirty = true; } save(); });

      // ---------- 面板 ----------
      const presetSel = GW.ui.select({
        label: '预设', value: S.preset,
        options: Object.keys(PRESETS).map((k) => ({ value: k, label: PRESETS[k].label })).concat([{ value: 'custom', label: '自定义' }]),
        onChange(v) {
          S.preset = v;
          if (PRESETS[v]) { S.items = JSON.parse(JSON.stringify(PRESETS[v].items)); sel = 0; }
          stopMotion(); syncSel(); dirty = true; save();
        },
      });
      const addPos = GW.ui.button({ label: '＋ 正电荷', onClick: () => addCharge(1) });
      const addNeg = GW.ui.button({ label: '－ 负电荷', onClick: () => addCharge(-1) });
      const delBtn = GW.ui.button({ label: '删除选中', onClick: () => { if (sel >= 0) { S.items.splice(sel, 1); sel = S.items.length - 1; markCustom(); syncSel(); dirty = true; save(); } } });
      delBtn.el.classList.add('danger');
      function markCustom() { S.preset = 'custom'; presetSel.set('custom'); }
      function addCharge(sgn) {
        // 找一个不与已有电荷重叠的位置
        let pos = { x: 0, y: 0 };
        const cands = [[0, 0], [0, -1.2], [0, 1.2], [-2, -1.5], [2, -1.5], [-2, 1.5], [2, 1.5], [-2.6, 0], [2.6, 0]];
        for (const [x, y] of cands) { if (S.items.every((it) => it.t === 'p' ? Math.hypot(it.x - x, it.y - y) > 0.6 : segDist(x, y, it) > 0.4)) { pos = { x, y }; break; } }
        S.items.push({ t: 'p', x: pos.x, y: pos.y, q: 2 * sgn });
        sel = S.items.length - 1; markCustom(); syncSel(); dirty = true; save();
      }
      const selInfo = GW.ui.readout('选中');
      const qSlider = GW.ui.slider({ label: '电荷量 q', min: -5, max: 5, step: 0.5, value: 2, unit: 'μC', onInput(v) {
        const it = S.items[sel]; if (!it || it.t !== 'p') return;
        if (v === 0) v = it.q > 0 ? 0.5 : -0.5;
        it.q = v; markCustom(); dirty = true; save();
      } });
      const sSlider = GW.ui.slider({ label: '面电荷密度 σ', min: -0.4, max: 0.4, step: 0.02, value: 0.2, unit: 'μC/m²', onInput(v) {
        const it = S.items[sel]; if (!it || it.t !== 'plate') return;
        if (v === 0) v = it.s > 0 ? 0.02 : -0.02;
        it.s = v; markCustom(); dirty = true; save();
      } });
      function syncSel() {
        const it = S.items[sel];
        if (!it) { selInfo.set('无（点选画布上的电荷）'); qSlider.el.style.display = 'none'; sSlider.el.style.display = 'none'; return; }
        if (it.t === 'p') { selInfo.set(it.q > 0 ? '正点电荷' : '负点电荷'); qSlider.el.style.display = ''; sSlider.el.style.display = 'none'; qSlider.set(it.q); }
        else { selInfo.set(it.s > 0 ? '正极板' : '负极板'); qSlider.el.style.display = 'none'; sSlider.el.style.display = ''; sSlider.set(it.s); }
      }

      const tLines = GW.ui.toggle({ label: '电场线', value: S.showLines, onChange(v) { S.showLines = v; save(); } });
      const tEq = GW.ui.toggle({ label: '等势线', value: S.showEq, onChange(v) { S.showEq = v; save(); } });
      const dens = GW.ui.slider({ label: '电场线密度（条/μC）', min: 4, max: 14, step: 1, value: S.density, onInput(v) { S.density = v; dirty = true; save(); } });
      const heat = GW.ui.segmented({ options: [{ value: 'none', label: '无底图' }, { value: 'phi', label: '电势 φ' }, { value: 'E', label: '场强 E' }], value: S.heat, onChange(v) { S.heat = v; buildHeat(); save(); } });

      const tTest = GW.ui.toggle({ label: '显示试探电荷', value: S.showTest, onChange(v) { S.showTest = v; if (!v) stopMotion(); save(); } });
      const q0Seg = GW.ui.segmented({ options: [{ value: 1, label: '+q₀' }, { value: -1, label: '−q₀' }], value: S.q0, onChange(v) { S.q0 = +v; updateReadouts(); save(); } });
      const relBtn = GW.ui.button({ label: '▶ 释放', primary: true, onClick() { if (motion) stopMotion(); else { motion = { x: S.test.x, y: S.test.y, vx: 0, vy: 0, trail: [[S.test.x, S.test.y]], t: 0 }; relBtn.set('■ 停止'); S.showTest = true; tTest.set(true); } } });
      const rE = GW.ui.readout('场强 E'), rPhi = GW.ui.readout('电势 φ'), rF = GW.ui.readout('电场力 F'), rEp = GW.ui.readout('电势能 Eₚ');
      function stopMotion() { if (motion) { motion = null; relBtn.set('▶ 释放'); } }
      function updateReadouts() {
        if (!elems) return;
        const i = testInfo();
        rE.set(sci(i.E) + ' N/C'); rPhi.set(sci(i.phi) + ' V'); rF.set(sci(i.F) + ' N'); rEp.set(sci(i.Ep) + ' J');
      }

      kit.panel.append(
        GW.ui.group('场源', presetSel.el, GW.h('div', { class: 'gw-row' }, addPos.el, addNeg.el), selInfo.el, qSlider.el, sSlider.el, delBtn.el),
        GW.ui.group('显示', tLines.el, tEq.el, dens.el, heat.el),
        GW.ui.group('试探电荷 q₀ = 1×10⁻⁸ C', tTest.el, q0Seg.el, relBtn.el, rE.el, rPhi.el, rF.el, rEp.el,
          GW.h('div', { style: { fontSize: '12px', color: '#5b6576' } }, '拖动金色小球测量；释放后它在电场力作用下由静止开始运动（不影响原电场）。')),
      );
      syncSel();

      // ---------- 主循环 ----------
      kit.loop((dt) => {
        if (dirty) recompute();
        if (motion && dt > 0) {
          // 试探电荷：a = q₀E/m，取 q₀/m 使运动可见；RK 小步积分
          const qm = Math.sign(S.q0) * 0.012; // (m/s²)/(N/C)
          const n = 20, h = dt / n;
          for (let s = 0; s < n && motion; s++) {
            const [ex, ey] = field(motion.x, motion.y);
            motion.vx += qm * ex * h; motion.vy += qm * ey * h;
            const sp = Math.hypot(motion.vx, motion.vy);
            if (sp > 12) { motion.vx *= 12 / sp; motion.vy *= 12 / sp; }
            motion.x += motion.vx * h; motion.y += motion.vy * h;
            if (hitSource(motion.x, motion.y) || Math.abs(motion.x) > W / 2 / PX || Math.abs(motion.y) > H / 2 / PX) {
              const tr = motion.trail; S.test.x = motion.x; S.test.y = motion.y; motion = null; relBtn.set('▶ 释放');
              lastTrail = tr; break;
            }
          }
          if (motion) {
            const last = motion.trail[motion.trail.length - 1];
            if (Math.hypot(last[0] - motion.x, last[1] - motion.y) > 0.02) motion.trail.push([motion.x, motion.y]);
            if (motion.trail.length > 4000) motion.trail.shift();
          }
          updateReadouts();
        }
        c.clearRect(0, 0, W, H);
        kit.background();
        drawDecor();
        if (heatCanvas) { c.save(); c.imageSmoothingEnabled = true; c.drawImage(heatCanvas, 0, 0, grid.nx * GS, grid.ny * GS); c.restore(); }
        if (S.showEq) drawEquip();
        if (S.showLines) drawLines();
        if (lastTrail && !motion && S.showTest) {
          c.save(); c.strokeStyle = 'rgba(242,165,65,0.6)'; c.lineWidth = 2.5; c.beginPath();
          lastTrail.forEach((p, i) => { const [x, y] = toPx(p[0], p[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.restore();
        }
        drawSources();
        drawTest();
        drawLegend();
      });
      let lastTrail = null;

      return { destroy() { kit.destroy(); } };
    },
  });
})();
