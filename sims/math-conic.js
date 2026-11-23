/* 数理无限画布 · 高中数学 · 圆锥曲线
 * 椭圆 / 双曲线 / 抛物线；焦点、准线、渐近线、离心率；可拖动动点 P；定义轨迹动画
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#5b6576';
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const TAU = Math.PI * 2;
  const f2 = (v, d = 2) => { if (!isFinite(v)) return '∞'; let s = (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d); return s.replace(/\.?0+$/, '').replace('-', '−'); };
  const num = (v) => f2(v, 2);

  GW.registerSim({
    id: 'math-conic', name: '圆锥曲线', category: 'math', group: '解析几何',
    desc: '椭圆、双曲线、抛物线的定义与几何性质：焦点、准线、离心率、动点距离',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9" ry="5.5"/><circle cx="6.5" cy="12" r="1" fill="currentColor"/><circle cx="17.5" cy="12" r="1" fill="currentColor"/><path d="M6.5 12L10 7.2l7.5 4.8"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const st = ctx.state;
      if (!['ellipse', 'hyperbola', 'parabola'].includes(st.kind)) st.kind = 'ellipse';
      if (st.axis !== 'y') st.axis = 'x';
      st.a = st.a || 5; st.b = st.b || 3; st.p = st.p || 2;
      st.pa = st.pa || 3; st.pb = st.pb || 2.5; // 双曲线参数单独保存
      if (st.open !== -1) st.open = 1;
      if (st.t == null) st.t = 1.0;
      if (st.branch !== -1) st.branch = 1;
      if (st.zoom == null) st.zoom = 1;
      const o = (st.opts = st.opts || {});
      ['foci', 'directrix', 'asym', 'dist', 'vertices'].forEach((k) => { if (o[k] == null) o[k] = true; });

      const kit = GW.simKit.layout(ctx.root, { panelWidth: 270 });
      const c2 = kit.ctx2d, canvas = kit.canvas;
      let W = 0, H = 0, dirty = true;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      let saveT = 0;
      const save = (later) => { clearTimeout(saveT); if (later) saveT = setTimeout(() => ctx.save(), 400); else ctx.save(); };
      let anim = false, trail = [], animT = 0;

      // ---------- 几何（标准坐标 u 沿焦点所在轴，v 垂直） ----------
      const A = () => (st.kind === 'hyperbola' ? st.pa : st.a);
      const B = () => (st.kind === 'hyperbola' ? st.pb : st.b);
      function geo() {
        const a = A(), b = B();
        if (st.kind === 'ellipse') { const c = Math.sqrt(Math.max(0, a * a - b * b)); return { a, b, c, e: c / a, dir: c > 1e-9 ? a * a / c : Infinity }; }
        if (st.kind === 'hyperbola') { const c = Math.hypot(a, b); return { a, b, c, e: c / a, dir: a * a / c }; }
        return { p: st.p, e: 1 };
      }
      // 参数 → 标准坐标
      function curvePt(t, br) {
        const g = geo();
        if (st.kind === 'ellipse') return [g.a * Math.cos(t), g.b * Math.sin(t)];
        if (st.kind === 'hyperbola') return [br * g.a * Math.cosh(t), g.b * Math.sinh(t)];
        return [st.open * t * t / (2 * g.p), t]; // v = t
      }
      const toXY = (u, v) => (st.axis === 'x' ? [u, v] : [v, u]);
      let scale = 40, ox = 0, oy = 0;
      const SX = (x) => ox + x * scale, SY = (y) => oy - y * scale;
      const S = (uv) => { const p = toXY(uv[0], uv[1]); return [SX(p[0]), SY(p[1])]; };
      const fromS = (px, py) => { const x = (px - ox) / scale, y = (oy - py) / scale; return st.axis === 'x' ? [x, y] : [y, x]; };

      function viewRange() {
        const g = geo();
        let r;
        if (st.kind === 'ellipse') r = Math.max(g.a, g.b, isFinite(g.dir) ? Math.min(g.dir, 2.2 * g.a) : 0) * 1.25;
        else if (st.kind === 'hyperbola') r = Math.max(g.dir, g.c, g.a * 2.4, g.b * 1.6) * 1.15;
        else r = Math.max(4, st.p * 2.6);
        return r;
      }
      function fit() {
        const r = viewRange();
        scale = Math.min(W - 40, H - 40) / 2 / r * st.zoom;
        scale = Math.max(4, scale);
        ox = W / 2; oy = H / 2;
      }

      // ---------- 绘图助手 ----------
      function lineS(p, q, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; c2.lineCap = 'round'; if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.moveTo(p[0], p[1]); c2.lineTo(q[0], q[1]); c2.stroke(); c2.restore();
      }
      function dotS(p, r, fill, stroke) { c2.beginPath(); c2.arc(p[0], p[1], r, 0, TAU); c2.fillStyle = fill; c2.fill(); if (stroke) { c2.lineWidth = 2.5; c2.strokeStyle = stroke; c2.stroke(); } }
      function txt(t, x, y, color, font, al, bl) {
        c2.save(); c2.font = font || 'italic 18px ' + MATH; c2.textAlign = al || 'left'; c2.textBaseline = bl || 'middle';
        c2.lineWidth = 4; c2.strokeStyle = 'rgba(255,255,255,0.92)'; c2.lineJoin = 'round'; c2.strokeText(t, x, y);
        c2.fillStyle = color || INK; c2.fillText(t, x, y); c2.restore();
      }
      // 带下标的点名，如 F₁
      const sub = (s) => s.replace(/1/g, '₁').replace(/2/g, '₂');

      function drawAxes() {
        const step = (() => { const raw = 60 / scale, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; })();
        c2.lineWidth = 1; c2.strokeStyle = 'rgba(27,36,51,0.08)'; c2.beginPath();
        for (let v = Math.ceil(-ox / scale / step) * step; v <= (W - ox) / scale; v += step) { const x = Math.round(SX(v)) + 0.5; c2.moveTo(x, 0); c2.lineTo(x, H); }
        for (let v = Math.ceil((oy - H) / scale / step) * step; v <= oy / scale; v += step) { const y = Math.round(SY(v)) + 0.5; c2.moveTo(0, y); c2.lineTo(W, y); }
        c2.stroke();
        GW.draw.arrow(c2, 0, oy, W - 3, oy, { color: INK, width: 2, head: 12 });
        GW.draw.arrow(c2, ox, H, ox, 3, { color: INK, width: 2, head: 12 });
        c2.font = '14px ' + MATH; c2.fillStyle = GRAY;
        c2.textAlign = 'center'; c2.textBaseline = 'top';
        for (let v = Math.ceil(-ox / scale / step) * step; v <= (W - ox) / scale; v += step) {
          if (Math.abs(v) < step / 2 || SX(v) > W - 26) continue;
          c2.fillText(String(+v.toFixed(6)).replace('-', '−'), SX(v), oy + 5);
          lineS([SX(v), oy], [SX(v), oy - 4], INK, 1.5);
        }
        c2.textAlign = 'right'; c2.textBaseline = 'middle';
        for (let v = Math.ceil((oy - H) / scale / step) * step; v <= oy / scale; v += step) {
          if (Math.abs(v) < step / 2 || SY(v) < 24) continue;
          c2.fillText(String(+v.toFixed(6)).replace('-', '−'), ox - 6, SY(v));
          lineS([ox, SY(v)], [ox + 4, SY(v)], INK, 1.5);
        }
        txt('x', W - 10, oy + 16, INK, 'italic 18px ' + MATH, 'right');
        txt('y', ox + 12, 12, INK, 'italic 18px ' + MATH, 'left');
        txt('O', ox - 6, oy + 14, INK, 'italic 17px ' + MATH, 'right');
      }

      // 曲线路径（可截断到参数 tmax 用于轨迹）
      function curvePolys() {
        const g = geo(), out = [];
        const R = Math.hypot(W, H) / scale;
        if (st.kind === 'ellipse') {
          const pts = []; for (let i = 0; i <= 360; i++) pts.push(curvePt(i / 360 * TAU)); out.push(pts);
        } else if (st.kind === 'hyperbola') {
          const T = Math.acosh(Math.max(1.0001, R / Math.min(g.a, g.b) + 1));
          [1, -1].forEach((br) => { const pts = []; for (let i = 0; i <= 400; i++) pts.push(curvePt(-T + 2 * T * i / 400, br)); out.push(pts); });
        } else {
          const Y = Math.sqrt(2 * g.p * R) + R; const pts = [];
          for (let i = 0; i <= 400; i++) { const v = -Y + 2 * Y * i / 400; pts.push(curvePt(v)); }
          out.push(pts);
        }
        return out;
      }
      function strokePoly(pts, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w; c2.lineJoin = 'round'; if (dash) c2.setLineDash(dash);
        c2.beginPath(); pts.forEach((p, i) => { const s = S(p); i ? c2.lineTo(s[0], s[1]) : c2.moveTo(s[0], s[1]); }); c2.stroke(); c2.restore();
      }

      // 焦点、准线
      function foci() {
        const g = geo();
        if (st.kind === 'parabola') return [[st.open * g.p / 2, 0]];
        return [[-g.c, 0], [g.c, 0]];
      }
      function currentP() { return curvePt(st.t, st.branch); }

      // ---------- 方程文字 ----------
      function frac(x, y, nTop, nBot, col) {
        c2.save(); c2.font = 'italic 20px ' + MATH; c2.fillStyle = col || INK; c2.textAlign = 'center'; c2.textBaseline = 'middle';
        const w = Math.max(c2.measureText(nTop).width, c2.measureText(nBot).width) + 6;
        c2.fillText(nTop, x + w / 2, y - 13); c2.fillText(nBot, x + w / 2, y + 14);
        c2.fillRect(x, y - 0.8, w, 1.6); c2.restore();
        return w;
      }
      function drawEquation() {
        const g = geo();
        const pad = 12; let x = 22; const y = 42;
        c2.save();
        c2.fillStyle = 'rgba(255,255,255,0.92)'; c2.strokeStyle = '#e3e7ee'; c2.lineWidth = 1;
        const bw = 300, bh = 64;
        c2.beginPath(); c2.rect(12, 10, bw, bh); c2.fill(); c2.stroke();
        c2.font = 'italic 20px ' + MATH; c2.fillStyle = INK; c2.textBaseline = 'middle'; c2.textAlign = 'left';
        const X = st.axis === 'x' ? 'x' : 'y', Y = st.axis === 'x' ? 'y' : 'x';
        const sq = (v) => num(v * v);
        if (st.kind === 'ellipse' || st.kind === 'hyperbola') {
          x += frac(x, y, X + '²', sq(g.a)) + 6;
          c2.fillText(st.kind === 'ellipse' ? '+' : '−', x, y); x += 18;
          x += frac(x, y, Y + '²', sq(g.b)) + 6;
          c2.fillText('= 1', x, y); x += 40;
        } else {
          const coef = num(2 * g.p * st.open);
          c2.fillText(Y + '² = ' + coef + X, x, y); x += c2.measureText(Y + '² = ' + coef + X).width + 12;
        }
        c2.font = '15px ' + FONT; c2.fillStyle = GRAY;
        c2.fillText(st.kind === 'ellipse' ? (g.a > g.b ? '（a > b > 0）' : '') : st.kind === 'hyperbola' ? '（a > 0，b > 0）' : '（p > 0）', x, y);
        c2.restore();
        void pad;
      }

      function render() {
        kit.background();
        fit();
        drawAxes();
        const g = geo();
        // 渐近线
        if (st.kind === 'hyperbola' && o.asym) {
          const R = Math.hypot(W, H) / scale;
          [1, -1].forEach((sg) => lineS(S([-R, -sg * R * g.b / g.a]), S([R, sg * R * g.b / g.a]), GRAY, 1.8, [8, 6]));
          const k = g.b / g.a;
          const lp = S([g.a * 1.9, g.b * 1.9]);
          txt(st.axis === 'x' ? 'y = ±' + num(k) + 'x' : 'y = ±' + num(1 / k) + 'x', lp[0] + 14, lp[1] + 4, GRAY, 'italic 16px ' + MATH);
          // 特征矩形
          const rc = [[g.a, g.b], [-g.a, g.b], [-g.a, -g.b], [g.a, -g.b]].map(S);
          c2.save(); c2.setLineDash([3, 5]); c2.strokeStyle = 'rgba(91,101,118,0.6)'; c2.lineWidth = 1.4; c2.beginPath();
          rc.forEach((p, i) => (i ? c2.lineTo(p[0], p[1]) : c2.moveTo(p[0], p[1]))); c2.closePath(); c2.stroke(); c2.restore();
        }
        // 准线
        if (o.directrix) {
          const R = Math.hypot(W, H) / scale;
          const ds = st.kind === 'parabola' ? [-st.open * g.p / 2] : isFinite(g.dir) && g.dir * scale < 3 * Math.max(W, H) ? [-g.dir, g.dir] : [];
          ds.forEach((d, i) => {
            lineS(S([d, -R]), S([d, R]), CYAN, 2, [10, 6]);
            const lab = (st.axis === 'x' ? 'x' : 'y') + ' = ' + num(d);
            const lp = st.axis === 'x' ? [SX(d) + (d >= 0 ? 6 : -6), SX(d) < 340 ? 96 : 24] : [W - 16, SY(d) - 14];
            txt(lab, lp[0], lp[1], CYAN, 'italic 16px ' + MATH, st.axis === 'x' ? (d >= 0 ? 'left' : 'right') : 'right');
            void i;
          });
        }
        // 曲线
        const polys = curvePolys();
        if (anim) {
          polys.forEach((p) => strokePoly(p, 'rgba(51,102,255,0.18)', 2, [4, 6]));
          if (trail.length > 1) strokePoly(trail, BLUE, 3.2);
        } else polys.forEach((p) => strokePoly(p, BLUE, 3));
        // 顶点
        if (o.vertices) {
          const vs = [];
          if (st.kind === 'ellipse') vs.push([[g.a, 0], 'A2'], [[-g.a, 0], 'A1'], [[0, g.b], 'B2'], [[0, -g.b], 'B1']);
          else if (st.kind === 'hyperbola') vs.push([[g.a, 0], 'A2'], [[-g.a, 0], 'A1']);
          else vs.push([[0, 0], '']);
          vs.forEach(([p, n]) => {
            const s = S(p); dotS(s, 4.5, INK);
            if (!n) return;
            const isA = n[0] === 'A', sgn = (isA ? p[0] : p[1]) > 0 ? 1 : -1;
            // 标签放在外侧
            let dx = 0, dy = 0;
            if ((st.axis === 'x') === isA) { dx = sgn * 12; dy = 16; } else { dx = 12; dy = -sgn * 14; }
            txt(sub(n), s[0] + dx, s[1] + dy, INK, 'italic 18px ' + MATH, dx < 0 ? 'right' : 'left');
          });
        }
        // 焦点
        const F = foci();
        // 动点
        const P = anim && trail.length ? trail[trail.length - 1] : currentP();
        const sP = S(P);
        if (o.dist) {
          if (st.kind === 'parabola') {
            const d = -st.open * g.p / 2, Hh = [d, P[1]];
            lineS(sP, S(F[0]), RED, 2.6);
            lineS(sP, S(Hh), GOLD, 2.6);
            dotS(S(Hh), 4, GOLD);
            txt('H', S(Hh)[0] + (st.axis === 'x' ? -st.open * 12 : 10), S(Hh)[1] + (st.axis === 'x' ? 0 : st.open * 14), INK, 'italic 18px ' + MATH, st.axis === 'x' && st.open > 0 ? 'right' : 'left');
          } else {
            lineS(sP, S(F[0]), RED, 2.6);
            lineS(sP, S(F[1]), GOLD, 2.6);
            if (o.directrix && isFinite(g.dir)) {
              // 对应准线：与 P 同侧（双曲线按所在支）
              const side = st.kind === 'hyperbola' ? (anim ? Math.sign(P[0]) || 1 : st.branch) : P[0] >= 0 ? 1 : -1;
              const Hh = [side * g.dir, P[1]];
              if (g.dir * scale < 3 * Math.max(W, H)) { lineS(sP, S(Hh), CYAN, 2.2, [3, 4]); dotS(S(Hh), 4, CYAN); }
            }
          }
        }
        if (o.foci) F.forEach((f, i) => {
          const s = S(f); dotS(s, 6, RED, '#fff');
          txt(F.length === 1 ? 'F' : sub('F' + (i + 1)), s[0] + (st.axis === 'x' ? 0 : 12), s[1] + (st.axis === 'x' ? -20 : 0), RED, 'italic 19px ' + MATH, st.axis === 'x' ? 'center' : 'left');
        });
        dotS(sP, 9, BLUE, '#fff');
        dotS(sP, 15, 'rgba(51,102,255,0.12)');
        txt('P', sP[0] + 14, sP[1] - 16, BLUE, 'italic bold 20px ' + MATH);
        drawEquation();
        // 关系式（画布底部）
        const info = relations(P);
        c2.save();
        c2.font = '17px ' + FONT;
        const bw = c2.measureText(info).width + 26;
        c2.fillStyle = 'rgba(255,255,255,0.93)'; c2.strokeStyle = '#e3e7ee'; c2.lineWidth = 1;
        c2.beginPath(); c2.rect(12, H - 46, bw, 34); c2.fill(); c2.stroke();
        c2.fillStyle = INK; c2.textBaseline = 'middle'; c2.textAlign = 'left'; c2.fillText(info, 25, H - 29);
        c2.restore();
        updateReadouts(P);
      }
      const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      function relations(P) {
        const g = geo(), F = foci();
        if (st.kind === 'ellipse') return '|PF₁| + |PF₂| = ' + num(dist(P, F[0])) + ' + ' + num(dist(P, F[1])) + ' = ' + num(dist(P, F[0]) + dist(P, F[1])) + ' = 2a';
        if (st.kind === 'hyperbola') return '||PF₁| − |PF₂|| = |' + num(dist(P, F[0])) + ' − ' + num(dist(P, F[1])) + '| = ' + num(Math.abs(dist(P, F[0]) - dist(P, F[1]))) + ' = 2a';
        const d = Math.abs(P[0] + st.open * g.p / 2);
        return '|PF| = ' + num(dist(P, F[0])) + '，|PH| = ' + num(d) + '，|PF| = |PH|（e = 1）';
      }

      // ---------- 交互：拖动 P ----------
      function nearestParam(px, py) {
        const target = fromS(px, py);
        let best = null;
        const g = geo();
        const test = (t, br) => { const q = curvePt(t, br), d = dist(q, target); if (!best || d < best.d) best = { t, br, d }; };
        if (st.kind === 'ellipse') for (let i = 0; i < 720; i++) test(i / 720 * TAU, 1);
        else if (st.kind === 'hyperbola') { const T = Math.acosh(Math.max(1.0001, Math.hypot(W, H) / scale / Math.min(g.a, g.b) + 1)); [1, -1].forEach((br) => { for (let i = 0; i <= 800; i++) test(-T + 2 * T * i / 800, br); }); }
        else { const R = Math.hypot(W, H) / scale, Y = Math.sqrt(2 * g.p * R) + R; for (let i = 0; i <= 1200; i++) test(-Y + 2 * Y * i / 1200, 1); }
        // 局部细化
        let h = st.kind === 'ellipse' ? TAU / 720 : 0.05;
        for (let k = 0; k < 30; k++) { test(best.t - h, best.br); test(best.t + h, best.br); h *= 0.6; }
        return { t: best.t, br: best.br, dpx: best.d * scale };
      }
      let dragging = false;
      kit.drag(
        (p, e, hover) => {
          if (anim) return null;
          const sP = S(currentP());
          if (Math.hypot(sP[0] - p.x, sP[1] - p.y) < 24) return 'P';
          const n = nearestParam(p.x, p.y);
          return n.dpx < 16 ? 'C' : null;
        },
        (obj, p) => {
          dragging = true;
          const n = nearestParam(p.x, p.y);
          st.t = n.t; st.branch = n.br; dirty = true;
        },
        () => { dragging = false; save(); }
      );
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault(); e.stopPropagation();
        st.zoom = GW.clamp(st.zoom * Math.exp(-e.deltaY * 0.0012), 0.3, 4); dirty = true; save(true);
      }, { passive: false });

      // ---------- 面板 ----------
      const panel = kit.panel;
      const kindSeg = GW.ui.segmented({ options: [{ value: 'ellipse', label: '椭圆' }, { value: 'hyperbola', label: '双曲线' }, { value: 'parabola', label: '抛物线' }], value: st.kind, onChange: (v) => { st.kind = v; resetP(); stopAnim(); build(); save(); } });
      const axisSeg = GW.ui.segmented({ options: [{ value: 'x', label: '焦点在 x 轴' }, { value: 'y', label: '焦点在 y 轴' }], value: st.axis, onChange: (v) => { st.axis = v; build(); dirty = true; save(); } });
      const paramBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
      panel.append(GW.ui.group('曲线', kindSeg.el, axisSeg.el, paramBox));
      const rE = GW.ui.readout('离心率 e'), rC = GW.ui.readout('焦距 2c'), rPF1 = GW.ui.readout('|PF₁|'), rPF2 = GW.ui.readout('|PF₂|'), rSum = GW.ui.readout('和'), rD = GW.ui.readout('P 到准线距离 d'), rRatio = GW.ui.readout('|PF| / d'), rP = GW.ui.readout('P 坐标');
      panel.append(GW.ui.group('数据', rE.el, rC.el, rP.el, rPF1.el, rPF2.el, rSum.el, rD.el, rRatio.el));
      const togBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
      panel.append(GW.ui.group('显示', togBox));
      const animBtn = GW.ui.button({ label: '▶ 动点轨迹动画（演示定义）', primary: true, onClick: () => (anim ? stopAnim() : startAnim()) });
      const zoomBtn = GW.ui.button({ label: '⌖ 复位缩放', onClick: () => { st.zoom = 1; dirty = true; save(); } });
      panel.append(GW.ui.group('演示', animBtn.el, zoomBtn.el, GW.h('div', { style: { fontSize: '12px', color: GRAY, lineHeight: '1.6' } }, '拖动曲线上的点 P（或点击曲线）观察距离关系；滚轮缩放。')));

      function resetP() { st.t = st.kind === 'parabola' ? 2.5 : st.kind === 'hyperbola' ? 0.8 : 1.0; st.branch = 1; dirty = true; }
      function build() {
        kindSeg.set(st.kind); axisSeg.set(st.axis);
        paramBox.innerHTML = '';
        if (st.kind === 'ellipse') {
          let sa, sb;
          sa = GW.ui.slider({ label: '长半轴 a', min: 1, max: 8, step: 0.1, value: st.a, onInput: (v) => { st.a = v; if (st.b > v - 0.1) { st.b = Math.max(0.5, +(v - 0.1).toFixed(1)); sb.set(st.b); } dirty = true; save(true); } });
          sb = GW.ui.slider({ label: '短半轴 b', min: 0.5, max: 7.9, step: 0.1, value: Math.min(st.b, st.a - 0.1), onInput: (v) => { st.b = v; if (st.a < v + 0.1) { st.a = +(v + 0.1).toFixed(1); sa.set(st.a); } dirty = true; save(true); } });
          paramBox.append(sa.el, sb.el);
        } else if (st.kind === 'hyperbola') {
          paramBox.append(GW.ui.slider({ label: '实半轴 a', min: 0.5, max: 6, step: 0.1, value: st.pa, onInput: (v) => { st.pa = v; dirty = true; save(true); } }).el,
            GW.ui.slider({ label: '虚半轴 b', min: 0.5, max: 6, step: 0.1, value: st.pb, onInput: (v) => { st.pb = v; dirty = true; save(true); } }).el);
        } else {
          paramBox.append(GW.ui.slider({ label: '焦准距 p', min: 0.5, max: 6, step: 0.1, value: st.p, onInput: (v) => { st.p = v; dirty = true; save(true); } }).el);
          const opts = st.axis === 'x' ? [{ value: '1', label: '开口向右' }, { value: '-1', label: '开口向左' }] : [{ value: '1', label: '开口向上' }, { value: '-1', label: '开口向下' }];
          paramBox.append(GW.ui.segmented({ options: opts, value: String(st.open), onChange: (v) => { st.open = +v; dirty = true; save(); } }).el);
        }
        togBox.innerHTML = '';
        const tg = (label, key) => togBox.append(GW.ui.toggle({ label, value: o[key], onChange: (v) => { o[key] = v; dirty = true; save(); } }).el);
        tg('焦点', 'foci'); tg('准线', 'directrix');
        if (st.kind === 'hyperbola') tg('渐近线', 'asym');
        tg('顶点', 'vertices'); tg('P 到焦点 / 准线的连线', 'dist');
        const isPar = st.kind === 'parabola';
        rC.el.style.display = isPar ? 'none' : '';
        rPF2.el.style.display = isPar ? 'none' : '';
        rSum.el.firstChild.textContent = st.kind === 'ellipse' ? '|PF₁| + |PF₂|' : st.kind === 'hyperbola' ? '||PF₁| − |PF₂||' : '|PF| − d';
        rPF1.el.firstChild.textContent = isPar ? '|PF|' : '|PF₁|';
        dirty = true;
      }
      function updateReadouts(P) {
        const g = geo(), F = foci(), xy = toXY(P[0], P[1]);
        rE.set(st.kind === 'parabola' ? '1' : num(g.e) + (st.kind === 'ellipse' ? '（0 < e < 1）' : '（e > 1）'));
        rP.set('(' + num(xy[0]) + ', ' + num(xy[1]) + ')');
        if (st.kind === 'parabola') {
          const d = Math.abs(P[0] + st.open * g.p / 2);
          rC.set(''); rPF1.set(num(dist(P, F[0]))); rD.set(num(d)); rSum.set(num(dist(P, F[0]) - d)); rRatio.set(num(dist(P, F[0]) / d));
          return;
        }
        rC.set(num(2 * g.c));
        const d1 = dist(P, F[0]), d2 = dist(P, F[1]);
        rPF1.set(num(d1)); rPF2.set(num(d2));
        rSum.set((st.kind === 'ellipse' ? num(d1 + d2) : num(Math.abs(d1 - d2))) + ' = 2a = ' + num(2 * g.a));
        if (!isFinite(g.dir)) { rD.set('—（圆无准线）'); rRatio.set('—'); return; }
        const side = st.kind === 'hyperbola' ? (Math.sign(P[0]) || 1) : P[0] >= 0 ? 1 : -1;
        const d = Math.abs(P[0] - side * g.dir), pf = side > 0 ? d2 : d1;
        rD.set(num(d) + '（对应 ' + (side > 0 ? 'F₂' : 'F₁') + '）');
        rRatio.set(num(pf / d) + ' = e');
      }

      // ---------- 动画 ----------
      function startAnim() { anim = true; trail = []; animT = 0; animBtn.set('⏸ 停止动画'); dirty = true; }
      function stopAnim() { anim = false; trail = []; animBtn.set('▶ 动点轨迹动画（演示定义）'); dirty = true; }
      function animStep(dt) {
        const g = geo();
        animT += dt;
        let P;
        if (st.kind === 'ellipse') {
          const T = 6, t = (animT % T) / T * TAU; P = curvePt(t);
          if (animT % T < dt) trail = [];
        } else if (st.kind === 'hyperbola') {
          const R = Math.hypot(W, H) / scale * 0.55, Tm = Math.acosh(Math.max(1.0001, R / Math.min(g.a, g.b) + 1)), T = 8;
          const ph = (animT % T) / T; // 前半右支，后半左支
          const br = ph < 0.5 ? 1 : -1, q = (ph % 0.5) / 0.5;
          if ((animT % (T / 2)) < dt) trail = [];
          P = curvePt(-Tm + 2 * Tm * q, br);
        } else {
          const R = Math.hypot(W, H) / scale * 0.5, Y = Math.sqrt(2 * g.p * R), T = 6;
          if (animT % T < dt) trail = [];
          P = curvePt(-Y + 2 * Y * ((animT % T) / T));
        }
        trail.push(P);
        dirty = true;
      }

      build();
      kit.loop((dt) => {
        if (anim && dt) animStep(dt);
        if (!dirty || !W) return;
        dirty = false;
        render();
      });
      void dragging;
      return { destroy() { clearTimeout(saveT); kit.destroy(); } };
    },
  });
})();
