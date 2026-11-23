/* 数理无限画布 · 高中物理 · 匀变速直线运动（x-t / v-t / a-t 图像，追及与相遇） */
(function () {
  'use strict';
  const C = { ink: '#1b2433', cyan: '#0f9d8a', red: '#e4572e', blue: '#3366ff', gold: '#f2a541', grey: '#8a94a6' };
  const SANS = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif';
  const SERIF = '"Times New Roman",serif';

  function rich(ctx, s, x, y, o) {
    o = o || {};
    const size = o.size || 16, it = o.italic === false ? '' : 'italic ';
    const segs = [];
    let i = 0, buf = '';
    while (i < s.length) {
      if (s[i] === '_') {
        if (buf) segs.push({ t: buf, sub: false }); buf = '';
        if (s[i + 1] === '{') { const j = s.indexOf('}', i); segs.push({ t: s.slice(i + 2, j), sub: true }); i = j + 1; }
        else { segs.push({ t: s[i + 1], sub: true }); i += 2; }
        continue;
      }
      buf += s[i++];
    }
    if (buf) segs.push({ t: buf, sub: false });
    const fMain = it + (o.weight || '') + ' ' + size + 'px ' + (o.family || SERIF);
    const fSub = Math.round(size * 0.68) + 'px ' + (o.family || SERIF);
    let w = 0;
    segs.forEach((g) => { ctx.font = g.sub ? fSub : fMain; g.w = ctx.measureText(g.t).width + (g.sub ? 1 : 0); w += g.w; });
    let cx = x - (o.align === 'center' ? w / 2 : o.align === 'right' ? w : 0);
    ctx.save();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    segs.forEach((g) => {
      ctx.font = g.sub ? fSub : fMain;
      const yy = y + (g.sub ? size * 0.3 : 0);
      if (o.halo !== false) { ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeText(g.t, cx, yy); }
      ctx.fillStyle = o.color || C.ink; ctx.fillText(g.t, cx, yy);
      cx += g.w;
    });
    ctx.restore();
    return w;
  }
  function label(ctx, s, x, y, o) { return rich(ctx, s, x, y, Object.assign({ italic: false, family: SANS, size: 15 }, o)); }
  function niceStep(pxPerUnit, minPx) {
    const raw = (minPx || 60) / pxPerUnit, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 2 ? 2 : m < 5 ? 5 : 10) * p;
  }

  // 运动学（可选“减速到零后停止”，即刹车问题）
  function makeCar(x0, v0, a, stop) {
    const ts = stop && a * v0 < 0 ? -v0 / a : Infinity;
    const xs = x0 + v0 * ts + 0.5 * a * ts * ts;
    return {
      x: (t) => (t <= ts ? x0 + v0 * t + 0.5 * a * t * t : xs),
      v: (t) => (t <= ts ? v0 + a * t : 0),
      a: (t) => (t <= ts ? a : 0),
      ts,
    };
  }

  GW.registerSim({
    id: 'phy-motion', name: '匀变速直线运动', category: 'physics', group: '力学',
    desc: '小车的匀变速直线运动与 x-t、v-t、a-t 图像，v-t 图面积表示位移；追及与相遇问题',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M3 17L19 6"/><path d="M3 21l16-15v15z" fill="currentColor" opacity=".18" stroke="none"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      const D = { mode: 'single', v0: 2, a: 1, stop: false, tmax: 12,
        xA: 0, vA: 10, aA: 0, xB: 0, vB: 0, aB: 2, speed: 1 };
      for (const k in D) if (S[k] === undefined) S[k] = D[k];
      const save = () => ctx.save();
      const kit = GW.simKit.layout(ctx.root);
      const g2 = kit.ctx2d;
      let t = 0, cars = [], frozen = false;   // frozen = 统一模型适配器的「静态模式」

      function build() {
        cars = S.mode === 'single' ? [makeCar(0, S.v0, S.a, S.stop)] : [makeCar(S.xA, S.vA, S.aA, S.stop), makeCar(S.xB, S.vB, S.aB, S.stop)];
      }
      function reset() { t = 0; build(); if (!frozen) transport.setRunning(true); }

      // ---------- 面板 ----------
      const P = kit.panel;
      // 1.7.6：缓存控件句柄，外部同步更新命名参数时也能刷新面板显示
      const CTRL = {};
      const sl = (key, label, min, max, step, unit) => {
        const c = GW.ui.slider({ label, min, max, step, value: S[key], unit, onInput: (val) => { S[key] = val; save(); reset(); } });
        CTRL[key] = c;
        return c;
      };
      const modeSeg = GW.ui.segmented({ options: [{ value: 'single', label: '单车运动' }, { value: 'chase', label: '追及相遇' }], value: S.mode, onChange: (val) => { S.mode = val; save(); sync(); reset(); } });
      const transport = GW.simKit.transport(kit, () => reset());
      const spSeg = GW.ui.segmented({ options: [{ value: 0.25, label: '×0.25' }, { value: 0.5, label: '×0.5' }, { value: 1, label: '×1' }], value: S.speed, onChange: (val) => { S.speed = val; save(); } });
      const stopT = GW.ui.toggle({ label: '减速到零后停止（刹车）', value: S.stop, onChange: (val) => { S.stop = val; save(); reset(); } });
      CTRL.mode = modeSeg; CTRL.speed = spSeg; CTRL.stop = stopT;
      const R = {};
      const ro = (k, l) => (R[k] = GW.ui.readout(l)).el;
      const single = GW.ui.group('小车（向右为正）', sl('v0', '初速度 v₀', -10, 15, 0.5, 'm/s').el, sl('a', '加速度 a', -5, 5, 0.1, 'm/s²').el);
      const chase = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        GW.ui.group('甲车（青）', sl('xA', '初位置 x₀', -50, 50, 1, 'm').el, sl('vA', '初速度 v₀', -10, 20, 0.5, 'm/s').el, sl('aA', '加速度 a', -5, 5, 0.1, 'm/s²').el),
        GW.ui.group('乙车（朱）', sl('xB', '初位置 x₀', -50, 50, 1, 'm').el, sl('vB', '初速度 v₀', -10, 20, 0.5, 'm/s').el, sl('aB', '加速度 a', -5, 5, 0.1, 'm/s²').el));
      const roSingle = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, ro('t', '时间 t'), ro('x', '位移 x'), ro('v', '速度 v'), ro('a', '加速度 a'), ro('s', '路程'));
      const roChase = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, ro('ct', '时间 t'), ro('xa', '甲 位置 / 速度'), ro('xb', '乙 位置 / 速度'), ro('d', '两车距离 |Δx|'), ro('meet', '相遇时刻'), ro('ext', '速度相等时刻'));
      P.append(
        GW.ui.group('', modeSeg.el),
        GW.ui.group('控制', transport.el, GW.h('div', { style: { fontSize: '12px', color: '#5b6576' } }, '慢放'), spSeg.el),
        single, chase,
        GW.ui.group('选项', sl('tmax', '演示时长', 4, 20, 1, 's').el, stopT.el),
        GW.ui.group('读数', roSingle, roChase),
        GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: 1.5 } }, '公式：v = v₀ + at，x = v₀t + ½at²，v² − v₀² = 2ax'),
      );
      function sync() {
        const sg = S.mode === 'single';
        single.style.display = sg ? '' : 'none'; chase.style.display = sg ? 'none' : 'flex';
        roSingle.style.display = sg ? 'flex' : 'none'; roChase.style.display = sg ? 'none' : 'flex';
      }
      sync();

      // ---------- 事件求解（数值扫描 + 二分，适用于刹车分段情形） ----------
      function roots(fn, T) {
        const out = [], N = 2000;
        let pv = fn(0);
        if (Math.abs(pv) < 1e-9) out.push(0);
        for (let i = 1; i <= N; i++) {
          const tt = T * i / N, cv = fn(tt);
          if (Math.abs(cv) < 1e-9) { if (!out.length || tt - out[out.length - 1] > T / N * 1.5) out.push(tt); }
          else if (pv * cv < 0 && Math.abs(pv) > 1e-9) {
            let lo = T * (i - 1) / N, hi = tt;
            for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (fn(lo) * fn(m) <= 0) hi = m; else lo = m; }
            out.push((lo + hi) / 2);
          }
          pv = cv;
        }
        return out;
      }

      // ---------- 图像 ----------
      function graph(area, title, yl, unit, fns, opts) {
        const { x, y, w, h } = area, T = S.tmax;
        // 纵轴范围
        let lo = 0, hi = 0;
        fns.forEach((f) => { for (let i = 0; i <= 200; i++) { const v = f.fn(T * i / 200); lo = Math.min(lo, v); hi = Math.max(hi, v); } });
        if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
        const pad = (hi - lo) * 0.12; hi += pad; lo -= (lo < 0 ? pad : 0);
        const ax = x + 46, aw = w - 64, top = y + 34, ah = h - 62;
        const X = (tt) => ax + tt / T * aw, Y = (v) => top + (hi - v) / (hi - lo) * ah;
        const oy = Y(0);
        g2.save();
        g2.fillStyle = '#fafbfd'; g2.fillRect(x, y, w, h);
        g2.strokeStyle = '#e3e7ee'; g2.lineWidth = 1; g2.strokeRect(x, y, w, h);
        g2.font = '15px ' + SANS; g2.fillStyle = '#5b6576';
        const stT = niceStep(aw / T, 34), stY = niceStep(ah / (hi - lo), 34);
        for (let v = stT; v <= T + 1e-9; v += stT) { const px = X(v); g2.strokeStyle = 'rgba(27,36,51,0.07)'; g2.beginPath(); g2.moveTo(px, top); g2.lineTo(px, top + ah); g2.stroke(); g2.textAlign = 'center'; g2.textBaseline = 'top'; if (px < ax + aw - 10) g2.fillText(+v.toFixed(2), px, GW.clamp(oy + 4, top, top + ah - 16)); }
        for (let v = Math.ceil(lo / stY) * stY; v <= hi + 1e-9; v += stY) { if (Math.abs(v) < 1e-9) continue; const py = Y(v); g2.strokeStyle = 'rgba(27,36,51,0.07)'; g2.beginPath(); g2.moveTo(ax, py); g2.lineTo(ax + aw, py); g2.stroke(); g2.textAlign = 'right'; g2.textBaseline = 'middle'; g2.fillText(+v.toFixed(2), ax - 5, py); }
        g2.restore();
        // 面积
        if (opts && opts.area) {
          const f = fns[0].fn, n = 300, tEnd = Math.min(t, T);
          [[1, 'rgba(15,157,138,0.25)'], [-1, 'rgba(228,87,46,0.22)']].forEach(([sg, col]) => {
            g2.fillStyle = col; g2.beginPath(); g2.moveTo(X(0), oy);
            for (let i = 0; i <= n; i++) { const tt = tEnd * i / n, v = f(tt); g2.lineTo(X(tt), Y(sg > 0 ? Math.max(v, 0) : Math.min(v, 0))); }
            g2.lineTo(X(tEnd), oy); g2.closePath(); g2.fill();
          });
        }
        GW.draw.arrow(g2, ax, oy, ax + aw + 12, oy, { color: C.ink, width: 2 });
        GW.draw.arrow(g2, ax, top + ah, ax, top - 10, { color: C.ink, width: 2 });
        rich(g2, 't', ax + aw + 2, oy - 14, { size: 16 }); label(g2, '/s', ax + aw + 8, oy - 14);
        const wl = rich(g2, yl, ax + 8, top - 4, { size: 16 }); label(g2, unit, ax + 10 + wl, top - 4);
        label(g2, title, x + w - 8, y + 14, { align: 'right', weight: 'bold' });
        g2.save(); g2.beginPath(); g2.rect(ax, top - 12, aw + 4, ah + 14); g2.clip();
        fns.forEach((f) => {
          // 全程虚线预览 + 已走过部分实线
          g2.strokeStyle = f.col; g2.globalAlpha = 0.3; g2.lineWidth = 2; g2.setLineDash([5, 5]);
          g2.beginPath(); for (let i = 0; i <= 300; i++) { const tt = T * i / 300; i ? g2.lineTo(X(tt), Y(f.fn(tt))) : g2.moveTo(X(tt), Y(f.fn(tt))); } g2.stroke();
          g2.globalAlpha = 1; g2.setLineDash([]); g2.lineWidth = 3;
          const tEnd = Math.min(t, T);
          g2.beginPath(); for (let i = 0; i <= 300; i++) { const tt = tEnd * i / 300; i ? g2.lineTo(X(tt), Y(f.fn(tt))) : g2.moveTo(X(tt), Y(f.fn(tt))); } g2.stroke();
          g2.fillStyle = f.col; g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.beginPath(); g2.arc(X(tEnd), Y(f.fn(tEnd)), 5, 0, 7); g2.fill(); g2.stroke();
        });
        g2.restore();
        return { X, Y, oy, top, ah, ax, aw };
      }
      function marker(G, tt, col, txt, yv, below) {
        const px = G.X(tt);
        g2.save(); g2.strokeStyle = col; g2.lineWidth = 2; g2.setLineDash([4, 4]);
        g2.beginPath(); g2.moveTo(px, G.top); g2.lineTo(px, G.top + G.ah); g2.stroke(); g2.restore();
        if (yv != null) { g2.fillStyle = col; g2.beginPath(); g2.arc(px, G.Y(yv), 5.5, 0, 7); g2.fill(); }
        if (txt) label(g2, txt, GW.clamp(px, G.ax + 40, G.ax + G.aw - 40), below ? G.top + G.ah - 10 : G.top + 8, { align: 'center', color: col, size: 15, weight: 'bold' });
      }
      function car(px, py, col, name, v, a, scale, below) {
        const w = 56, h = 24;
        g2.save();
        g2.fillStyle = col; g2.strokeStyle = C.ink; g2.lineWidth = 2;
        g2.beginPath(); g2.moveTo(px - w / 2, py - 8); g2.lineTo(px - w / 2, py - h); g2.lineTo(px + w / 4, py - h); g2.lineTo(px + w / 2, py - 14); g2.lineTo(px + w / 2, py - 8); g2.closePath(); g2.fill(); g2.stroke();
        g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(px - w / 4, py - 6, 6, 0, 7); g2.fill(); g2.stroke(); g2.beginPath(); g2.arc(px + w / 4, py - 6, 6, 0, 7); g2.fill(); g2.stroke();
        g2.restore();
        g2.fillStyle = C.ink; g2.beginPath(); g2.moveTo(px, py + 2); g2.lineTo(px - 5, py + 10); g2.lineTo(px + 5, py + 10); g2.closePath(); g2.fill();
        if (name) label(g2, name, px - 4, py - 16, { align: 'center', color: '#fff', halo: false, weight: 'bold' });
        const yv = below ? py + 22 : py - h - 12, ya = below ? py + 40 : py - h - 32;
        if (Math.abs(v) > 0.05) { const L = GW.clamp(v * scale, -110, 110); GW.draw.arrow(g2, px, yv, px + L, yv, { color: C.blue, width: 3 }); rich(g2, 'v', px + L + (L > 0 ? 8 : -16), yv, { color: C.blue, weight: 'bold', size: 16 }); }
        if (Math.abs(a) > 0.01) { const L = GW.clamp(a * 14, -80, 80); GW.draw.arrow(g2, px, ya, px + L, ya, { color: C.red, width: 2.5, head: 9 }); rich(g2, 'a', px + L + (L > 0 ? 8 : -16), ya, { color: C.red, weight: 'bold', size: 16 }); }
      }
      function track(y, xmin, xmax, W) {
        const L = 40, Rr = W - 40, sx = (Rr - L) / (xmax - xmin), P = (xx) => L + (xx - xmin) * sx;
        g2.strokeStyle = C.ink; g2.lineWidth = 2.5; g2.beginPath(); g2.moveTo(L - 10, y); g2.lineTo(Rr + 10, y); g2.stroke();
        const st = niceStep(sx, 60);
        g2.font = '15px ' + SANS; g2.fillStyle = '#5b6576'; g2.textAlign = 'center'; g2.textBaseline = 'top';
        for (let v = Math.ceil(xmin / st) * st; v <= xmax + 1e-9; v += st) { g2.fillRect(P(v) - 1, y, 2, 6); g2.fillText(+v.toFixed(2), P(v), y + 12); }
        label(g2, 'x/m', Rr + 4, y + 30, { align: 'right', color: '#5b6576' });
        return P;
      }

      kit.loop((dt) => {
        const { w: W, h: H } = kit.size();
        if (!W) return;
        if (!cars.length) build();
        if (kit.running) { t += dt * S.speed; if (t >= S.tmax) { t = S.tmax; transport.setRunning(false); } }
        kit.background();
        const T = S.tmax;
        // 轨道范围
        let xmin = Infinity, xmax = -Infinity, vmax = 0.1;
        cars.forEach((c) => { for (let i = 0; i <= 200; i++) { const tt = T * i / 200; xmin = Math.min(xmin, c.x(tt)); xmax = Math.max(xmax, c.x(tt)); vmax = Math.max(vmax, Math.abs(c.v(tt))); } });
        if (xmax - xmin < 10) { const m = (xmin + xmax) / 2; xmin = m - 5; xmax = m + 5; }
        const pad = (xmax - xmin) * 0.1; xmin -= pad; xmax += pad;
        const vs = 90 / vmax;
        label(g2, 't = ' + t.toFixed(2) + ' s', 16, 20, { weight: 'bold', size: 17 });
        const gy = S.mode === 'chase' ? 212 : 200, gh = H - gy - 10, gw = (W - 30) / 3;
        const areas = [0, 1, 2].map((i) => ({ x: 10 + i * (gw + 5), y: gy, w: gw, h: gh }));

        if (S.mode === 'single') {
          const c = cars[0];
          const ty = 150, Pp = track(ty, xmin, xmax, W);
          // 轨迹标记：每 1 s 的位置
          for (let k = 0; k <= Math.floor(t + 1e-9); k++) { g2.fillStyle = 'rgba(15,157,138,0.55)'; g2.beginPath(); g2.arc(Pp(c.x(k)), ty, 4, 0, 7); g2.fill(); }
          car(Pp(c.x(t)), ty - 2, C.cyan, '', c.v(t), c.a(t), vs);
          label(g2, '圆点：每隔 1 s 小车的位置', W - 16, 20, { align: 'right', color: '#5b6576' });
          const Gx = graph(areas[0], 'x-t 图像', 'x', '/m', [{ fn: c.x, col: C.cyan }]);
          const Gv = graph(areas[1], 'v-t 图像', 'v', '/(m·s⁻¹)', [{ fn: c.v, col: C.blue }], { area: true });
          graph(areas[2], 'a-t 图像', 'a', '/(m·s⁻²)', [{ fn: c.a, col: C.red }], { area: false });
          const disp = c.x(Math.min(t, T));
          label(g2, '阴影面积 = 位移 ' + disp.toFixed(2) + ' m', areas[1].x + areas[1].w / 2, areas[1].y + areas[1].h - 12, { align: 'center', color: '#0b7a6b', weight: 'bold' });
          const z = roots((tt) => c.v(tt), T).filter((tt) => tt > 1e-6 && tt < T && Math.abs(c.a(tt)) > 0);
          if (z.length && !S.stop) { marker(Gv, z[0], '#7a4fd6', 'v = 0，开始反向', 0); marker(Gx, z[0], '#7a4fd6', '离出发点最远', c.x(z[0])); }
          // 读数
          let path = 0; const n = 400; for (let i = 1; i <= n; i++) { path += Math.abs(c.x(t * i / n) - c.x(t * (i - 1) / n)); }
          R.t.set(t.toFixed(2) + ' s'); R.x.set(disp.toFixed(2) + ' m'); R.v.set(c.v(t).toFixed(2) + ' m/s'); R.a.set(c.a(t).toFixed(2) + ' m/s²'); R.s.set(path.toFixed(2) + ' m');
        } else {
          const [A, B] = cars;
          const P1 = track(100, xmin, xmax, W), y2 = 158;
          g2.strokeStyle = C.ink; g2.lineWidth = 2.5; g2.beginPath(); g2.moveTo(30, y2); g2.lineTo(W - 30, y2); g2.stroke();
          car(P1(A.x(t)), 98, C.cyan, '甲', A.v(t), A.a(t), vs);
          car(P1(B.x(t)), y2 - 2, C.red, '乙', B.v(t), B.a(t), vs, true);
          const dx = (tt) => B.x(tt) - A.x(tt), dv = (tt) => B.v(tt) - A.v(tt);
          const meets = roots(dx, T).filter((tm) => tm > 1e-6), exts = roots(dv, T).filter((tt) => tt > 1e-6 && tt < T - 1e-6);
          const Gx = graph(areas[0], 'x-t 图像', 'x', '/m', [{ fn: A.x, col: C.cyan }, { fn: B.x, col: C.red }]);
          const Gv = graph(areas[1], 'v-t 图像', 'v', '/(m·s⁻¹)', [{ fn: A.v, col: C.cyan }, { fn: B.v, col: C.red }]);
          const Gd = graph(areas[2], '两车间距 Δx = x乙 − x甲', 'Δx', '/m', [{ fn: dx, col: C.gold }]);
          meets.forEach((tm, i) => { marker(Gx, tm, '#b01f6b', i ? '' : '相遇', A.x(tm), true); marker(Gd, tm, '#b01f6b', '', 0); });
          exts.forEach((te) => {
            const d2 = (dx(te + 1e-3) + dx(te - 1e-3) - 2 * dx(te));
            const isMax = Math.abs(dx(te)) > 0 && Math.sign(d2) === -Math.sign(dx(te));
            marker(Gv, te, '#7a4fd6', '速度相等', A.v(te));
            marker(Gd, te, '#7a4fd6', isMax ? '距离最大' : '距离最小', dx(te));
          });
          // 相遇提示
          if (meets.some((tm) => Math.abs(tm - t) < 0.08 && tm > 0)) label(g2, '相遇！', W / 2, 20, { align: 'center', color: '#b01f6b', weight: 'bold', size: 18 });
          R.ct.set(t.toFixed(2) + ' s');
          R.xa.set(A.x(t).toFixed(2) + ' m / ' + A.v(t).toFixed(2) + ' m/s'); R.xb.set(B.x(t).toFixed(2) + ' m / ' + B.v(t).toFixed(2) + ' m/s');
          R.d.set(Math.abs(dx(t)).toFixed(2) + ' m');
          R.meet.set(meets.length ? meets.map((m) => m.toFixed(2) + ' s').join('，') : '演示时间内不相遇');
          R.ext.set(exts.length ? exts.map((e) => e.toFixed(2) + ' s（|Δx| = ' + Math.abs(dx(e)).toFixed(2) + ' m）').join('<br>') : '无');
          void Gv;
        }
      });
      reset();
      // 1.7.6 统一模型：暴露命名参数 / 播放与静态控制 / 运行时实例面。
      // 原来的 { destroy() } 语义不变，只是多了可被适配器调用的入口。
      return {
        destroy() { kit.destroy(); },
        state: S,
        defaults: Object.assign({}, D),
        transport: transport,
        kit: kit,
        get t() { return t; },
        set t(v) { t = Number(v) || 0; build(); },
        get frozen() { return frozen; },
        setStatic(v) { frozen = !!v; transport.setRunning(!frozen); },
        rebuild() { t = 0; build(); },
        reset: reset,
        // opts.silent：外部（LAN 同步 / 宿主 update）灌参数时只标脏、不调 save()。
        // save -> GW.netLive('sim') 会把刚收到的远端更新原样广播回去形成回环。
        applyParams(p, opts) {
          Object.keys(p || {}).forEach((k) => {
            if (!(k in D)) return;
            S[k] = p[k];
            if (CTRL[k] && CTRL[k].set) CTRL[k].set(p[k]);
          });
          if (opts && opts.silent) { if (GW.markDirty) GW.markDirty(); }
          else save();
          if (frozen) { t = 0; build(); } else reset();
          return Object.assign({}, S);
        },
      };
    },
  });

  /* ==========================================================================
   * 1.7.6 统一物理模型适配器（阶段三 · 动画试点 sim:phy-motion）
   * 只对本原生试点开放。网页外壳 simhtml/sims/phy-motion.html 不加载
   * physics-models.js，GW.physicsModels 不存在时本段直接返回，旧行为分毫不变。
   * 与 web:simhtml/sims/phy-motion.html 的入口 ID 不合并。
   * ========================================================================== */
  (function () {
    const M = GW.physicsModels;
    if (!M || M.disabled) return;
    const def = GW.sims && GW.sims['phy-motion'];
    if (!def) return;
    const SIM_ID = M.PILOT.SIM;

    // 命名参数：与 create 里的 D、面板控件一一对应。精确播放帧 t 不在此列，也不落盘。
    const PARAMS = [
      { key: 'mode', label: '模式', type: 'enum', enum: ['single', 'chase'], def: 'single' },
      { key: 'v0', label: '初速度 v0', min: -10, max: 15, step: 0.5, def: 2 },
      { key: 'a', label: '加速度 a', min: -5, max: 5, step: 0.1, def: 1 },
      { key: 'stop', label: '刹车', type: 'boolean', def: false },
      { key: 'tmax', label: '演示时长', min: 4, max: 20, step: 1, def: 12 },
      { key: 'xA', label: '甲初位置', min: -50, max: 50, step: 1, def: 0 },
      { key: 'vA', label: '甲初速度', min: -10, max: 20, step: 0.5, def: 10 },
      { key: 'aA', label: '甲加速度', min: -5, max: 5, step: 0.1, def: 0 },
      { key: 'xB', label: '乙初位置', min: -50, max: 50, step: 1, def: 0 },
      { key: 'vB', label: '乙初速度', min: -10, max: 20, step: 0.5, def: 0 },
      { key: 'aB', label: '乙加速度', min: -5, max: 5, step: 0.1, def: 2 },
      { key: 'speed', label: '倍速', type: 'enum', enum: [0.25, 0.5, 1], def: 1 },
    ];
    const RT = Object.create(null);   // 运行时实例表（不落盘，按 board item id 索引）

    const adapter = {
      // 纯构造：仍是旧 obj/sim 记录，参数落在 data.state（.gewu 现有结构）
      prepare(input, box) {
        const v = M.validateParams(SIM_ID, input && input.params, {});
        if (!v.ok) throw new Error(v.error);
        const b = box || { x0: 0, y0: 0, x1: 1000, y1: 620 };
        return {
          id: GW.uid(), kind: 'obj', type: 'sim',
          x: Math.min(b.x0, b.x1), y: Math.min(b.y0, b.y1),
          w: Math.abs(b.x1 - b.x0), h: Math.abs(b.y1 - b.y0), z: 0,
          data: { sim: 'phy-motion', state: v.params },
        };
      },
      readParams(it) {
        const s = (it && it.data && it.data.state) || {};
        const out = {};
        PARAMS.forEach((p) => { out[p.key] = s[p.key] === undefined ? p.def : s[p.key]; });
        return out;
      },
      applyParams(it, params) {
        const v = M.validateParams(SIM_ID, params, { partial: true });
        if (!v.ok) throw new Error(v.error);
        it.data = it.data || {};
        it.data.state = it.data.state || {};
        Object.assign(it.data.state, v.params);
        // 同步更新必须进入已挂载实例，否则界面与落盘状态会分叉
        const rt = RT[it.id];
        if (rt && rt.inst && rt.inst.applyParams) rt.inst.applyParams(v.params);
        return it;
      },
      // 实际 DOM 挂载由 objects.js 完成；create 包装时已把运行时登记到 RT
      mount(it) { return RT[it && it.id] || null; },
      // 可重复调用：第二次起直接返回 false，不重复清监听、不重复 cancel
      destroy(handle) {
        const rt = (handle && typeof handle === 'object') ? handle : RT[handle];
        if (!rt || typeof rt.destroy !== 'function') return false;
        return rt.destroy();
      },
      exportStatic() { return { kind: M.EXPORT_KIND.RASTER, source: 'rasterObject' }; },
    };

    M.register(SIM_ID, {
      label: '运动学仿真（原生宿主）', category: 'physics', source: 'registry',
      capabilities: [M.CAP.PREPARE, M.CAP.READ_PARAMS, M.CAP.APPLY_PARAMS,
        M.CAP.MOUNT, M.CAP.DESTROY, M.CAP.CONTROLS, M.CAP.RESTORE_PARAMS,
        M.CAP.EXPORT_STATIC],
      params: PARAMS,
      aspect: 1000 / 620, defaultSize: { w: 1000, h: 620 },
      exportStatic: M.EXPORT_KIND.RASTER,
      // 参数恢复与精确播放帧恢复分别声明：t 不落盘，故 restoreFrame=false
      runtime: { mounted: true, destroy: true, restoreParams: true, restoreFrame: false },
      controls: ['play', 'pause', 'reset', 'static'],
      notes: '参数落 obj/sim 的 data.state 可恢复；精确播放帧 t 不落盘（restoreFrame=false）。静态模式保留实例 ID、参数与布局，恢复交互仍是同一实例。与 web:simhtml/sims/phy-motion.html 是不同宿主。',
    }, adapter);

    const origCreate = def.create;
    def.create = function (ctx) {
      const inst = origCreate(ctx);
      if (!inst || !inst.kit) return inst;
      const root = ctx && ctx.root;
      const hostEl = root && root.closest ? root.closest('[data-id]') : null;
      const id = hostEl ? hostEl.getAttribute('data-id') : ('sim-' + GW.uid());
      const kit = inst.kit;
      let dead = false, resume = true;

      // 宿主可见性：切后台暂停，回来后按原状态恢复；静态模式不自动恢复播放。
      const onVis = () => {
        if (dead) return;
        if (typeof document !== 'undefined' && document.hidden) {
          resume = kit.running; kit.running = false;
        } else if (!inst.frozen) kit.running = resume;
      };
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', onVis);
      }
      // B1（1.7.6 修复）：不监听 'page'。GW.gotoPage 的真实顺序是
      //   unmountAll(销毁旧实例) -> doc.cur=i -> mount(新实例) -> bus.emit('page')，
      // 所以刚挂载的新实例也会收到这次事件；原来的无条件暂停会让「切进含仿真的页」
      // 时卡片一上来就是静止的，且 resume 状态被覆盖。旧实例的清理由
      // unmountAll -> unmount -> inst.destroy 负责（下面的 rt.destroy），无需这里兜底。
      // 后台暂停（visibilitychange）与静态模式（inst.frozen）保持不变。
      const rt = { id: id, inst: inst, kit: kit, staticMode: false };
      rt.destroy = function () {
        if (dead) return false;                 // 幂等：可重复调用
        dead = true;
        if (typeof document !== 'undefined' && document.removeEventListener) {
          document.removeEventListener('visibilitychange', onVis);
        }
        try { kit.destroy(); } catch (e) { /* noop */ }
        delete RT[id];
        return true;
      };
      inst.destroy = rt.destroy;               // objects.js 的 sim kind 会转发到这里
      RT[id] = rt;
      return inst;
    };

    // 播放 / 暂停 / 重置 / 静态模式：菜单与 AI 可控；全部按实例 id 定位，互不干扰
    function withRt(id) { return RT[id] || null; }
    GW.physicsSim = {
      list: () => Object.keys(RT),
      status(id) {
        const rt = withRt(id);
        if (!rt) return null;
        return { id: id, running: !!rt.kit.running, frozen: !!rt.inst.frozen,
          t: rt.inst.t, params: adapter.readParams({ data: { state: rt.inst.state } }) };
      },
      play(id) { const rt = withRt(id); if (!rt) return { ok: false, error: '实例未挂载' };
        rt.inst.setStatic(false); rt.inst.transport.setRunning(true); return { ok: true }; },
      pause(id) { const rt = withRt(id); if (!rt) return { ok: false, error: '实例未挂载' };
        rt.inst.transport.setRunning(false); return { ok: true }; },
      reset(id) { const rt = withRt(id); if (!rt) return { ok: false, error: '实例未挂载' };
        rt.inst.reset(); return { ok: true }; },
      setStatic(id, on) { const rt = withRt(id); if (!rt) return { ok: false, error: '实例未挂载' };
        rt.staticMode = !!on; rt.inst.setStatic(!!on); return { ok: true }; },
      destroy: (id) => adapter.destroy(id),
      instances: RT,
    };
  })();
})();
