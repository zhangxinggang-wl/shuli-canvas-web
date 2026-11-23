/* 数理无限画布 · 高中物理 · 天体运动（宇宙速度、圆/椭圆/抛物线/双曲线轨道、开普勒第二定律、霍曼变轨） */
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

  const GM = 3.986e14, RE = 6.371e6; // 地球
  const TSCALE = 600; // 动画 1 s ↔ 600 s（10 min）

  GW.registerSim({
    id: 'phy-orbit', name: '天体运动', category: 'physics', group: '力学',
    desc: '万有引力数值积分：宇宙速度与轨道形状、开普勒第二定律、近地点/远地点点火变轨',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="3.5"/><ellipse cx="12" cy="12" rx="10" ry="6"/><circle cx="22" cy="12" r="1.3" fill="currentColor"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      const D = { mode: 'launch', h: 1000, v: 8.6, vec: true, kepler: false, pred: true, r2: 3, dv: 0.5, speed: 1 };
      for (const k in D) if (S[k] === undefined) S[k] = D[k];
      const save = () => ctx.save();
      const kit = GW.simKit.layout(ctx.root);
      const g2 = kit.ctx2d;

      // 状态（SI 单位，地心为原点，y 轴向上）
      let plan = null, x, y, vx, vy, t, trail, crashed, E0, sectors, curSec, secDt, phase, burns, lastVr, msg, msgT;
      const r0 = () => RE + S.h * 1000;
      function energy() { return 0.5 * (vx * vx + vy * vy) - GM / Math.hypot(x, y); }
      function elements() {
        const r = Math.hypot(x, y), v2 = vx * vx + vy * vy, E = 0.5 * v2 - GM / r, Lz = x * vy - y * vx;
        const rv = x * vx + y * vy;
        const ex = ((v2 - GM / r) * x - rv * vx) / GM, ey = ((v2 - GM / r) * y - rv * vy) / GM;
        const e = Math.hypot(ex, ey), p = Lz * Lz / GM;
        return { r, E, Lz, e, ex, ey, p, a: E < 0 ? -GM / (2 * E) : Infinity };
      }
      function initState(vel) {
        x = -r0(); y = 0; vx = 0; vy = -vel * 1000;
        t = 0; trail = [[x, y]]; crashed = false; E0 = energy(); sectors = []; curSec = null; burns = []; lastVr = 0; msg = ''; msgT = 0;
        const el = elements();
        secDt = el.E < 0 && el.e < 0.98 ? 2 * Math.PI * Math.sqrt(el.a ** 3 / GM) / 12 : 600;
        phase = 0;
      }
      function reset() {
        if (S.mode === 'launch') initState(S.v);
        else initState(Math.sqrt(GM / r0()) / 1000);
        transport.setRunning(true);
      }
      function burn(dv) {
        const v = Math.hypot(vx, vy);
        vx += vx / v * dv; vy += vy / v * dv;
        burns.push([x, y, dv]);
        E0 = energy();
        const el = elements();
        secDt = el.E < 0 && el.e < 0.98 ? 2 * Math.PI * Math.sqrt(el.a ** 3 / GM) / 12 : 600;
        sectors = []; curSec = null;
      }
      function hohmann() {
        const r1 = Math.hypot(x, y), r2 = S.r2 * RE;
        return { dv1: Math.sqrt(GM / r1) * (Math.sqrt(2 * r2 / (r1 + r2)) - 1), dv2: Math.sqrt(GM / r2) * (1 - Math.sqrt(2 * r1 / (r1 + r2))), r1, r2 };
      }
      // 速度-Verlet（辛积分），步长随 r^1.5 自适应 → 长时间能量守恒
      function acc(px, py) { const r2 = px * px + py * py, r = Math.sqrt(r2), k = -GM / (r2 * r); return [k * px, k * py]; }
      function integrate(T) {
        let rem = T;
        while (rem > 0 && !crashed) {
          const r = Math.hypot(x, y), h = Math.min(rem, 0.002 * Math.sqrt(r * r * r / GM));
          const [ax, ay] = acc(x, y);
          vx += 0.5 * h * ax; vy += 0.5 * h * ay;
          x += h * vx; y += h * vy;
          const [bx, by] = acc(x, y);
          vx += 0.5 * h * bx; vy += 0.5 * h * by;
          t += h; rem -= h;
          if (Math.hypot(x, y) < RE) { crashed = true; msg = '卫星落回地面'; }
          else if (Math.hypot(x, y) > 60 * RE) { crashed = true; msg = '卫星已远离地球（r > 60 R），演示结束'; }
          // 开普勒扇形
          if (S.kepler) {
            if (!curSec) curSec = { t0: t, pts: [[x, y]], k: sectors.length };
            curSec.pts.push([x, y]);
            if (t - curSec.t0 >= secDt) {
              sectors.push(curSec); if (sectors.length > 12) sectors.shift();
              curSec = { t0: t, pts: [[x, y]], k: curSec.k + 1 };
            }
          }
          // 霍曼：转移轨道到达远地点（径向速度由正变负）时自动二次点火
          const vr = (x * vx + y * vy) / Math.hypot(x, y);
          if (S.mode === 'hohmann' && phase === 1 && lastVr > 0 && vr <= 0) {
            burn(plan.dv2); phase = 2; msg = '到达远地点 Q，第二次点火加速 Δv₂，进入高圆轨道'; msgT = 4;
          }
          lastVr = vr;
        }
        const last = trail[trail.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) > RE * 0.02) { trail.push([x, y]); if (trail.length > 4000) trail.shift(); }
      }

      // ---------- 面板 ----------
      const P = kit.panel;
      const modeSeg = GW.ui.segmented({ options: [{ value: 'launch', label: '发射与轨道' }, { value: 'hohmann', label: '变轨（霍曼）' }], value: S.mode, onChange: (v) => { S.mode = v; save(); sync(); reset(); } });
      const hS = GW.ui.slider({ label: '发射点高度 h', min: 0, max: 10000, step: 100, value: S.h, unit: 'km', onInput: (v) => { S.h = v; save(); reset(); } });
      const vS = GW.ui.slider({ label: '发射速度 v（水平）', min: 4, max: 14, step: 0.05, value: S.v, unit: 'km/s', onInput: (v) => { S.v = v; save(); reset(); } });
      const setV = (f) => () => { S.v = Math.round(f() / 10) / 100; vS.set(S.v); save(); initState(f() / 1000); transport.setRunning(true); };
      const vRow = GW.h('div', { class: 'gw-row' },
        GW.ui.button({ label: '= 环绕速度', onClick: setV(() => Math.sqrt(GM / r0())) }).el,
        GW.ui.button({ label: '= 逃逸速度', onClick: setV(() => Math.sqrt(2 * GM / r0())) }).el);
      const r2S = GW.ui.slider({ label: '目标圆轨道半径 r₂', min: 1.6, max: 6, step: 0.1, value: S.r2, unit: 'R', onInput: (v) => { S.r2 = v; save(); } });
      const hohB = GW.ui.button({ label: '🔥 开始霍曼转移', primary: true, onClick: () => {
        if (S.mode !== 'hohmann' || phase !== 0) { reset(); }
        plan = hohmann(); burn(plan.dv1); phase = 1; msg = '在近地点 P 第一次点火加速 Δv₁，进入椭圆转移轨道'; msgT = 4; transport.setRunning(true);
      } });
      const dvS = GW.ui.slider({ label: '手动点火 Δv', min: 0.1, max: 2, step: 0.05, value: S.dv, unit: 'km/s', onInput: (v) => { S.dv = v; save(); } });
      const burnRow = GW.h('div', { class: 'gw-row' },
        GW.ui.button({ label: '加速 +Δv', onClick: () => { if (!crashed) { burn(S.dv * 1000); phase = 3; msg = '沿速度方向点火加速'; msgT = 3; } } }).el,
        GW.ui.button({ label: '减速 −Δv', onClick: () => { if (!crashed) { burn(-S.dv * 1000); phase = 3; msg = '逆速度方向点火减速'; msgT = 3; } } }).el);
      const tg = (key, label, after) => GW.ui.toggle({ label, value: S[key], onChange: (v) => { S[key] = v; save(); after && after(); } });
      const transport = GW.simKit.transport(kit, () => reset());
      const spSeg = GW.ui.segmented({ options: [{ value: 0.25, label: '×0.25' }, { value: 0.5, label: '×0.5' }, { value: 1, label: '×1' }, { value: 4, label: '×4' }], value: S.speed, onChange: (v) => { S.speed = +v; save(); } });
      const R = {};
      const ro = (k, l) => (R[k] = GW.ui.readout(l)).el;
      const launchBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, vS.el, vRow);
      const hohBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, r2S.el, hohB.el, ro('dv1', 'Δv₁（近地点）'), ro('dv2', 'Δv₂（远地点）'));
      P.append(
        GW.ui.group('', modeSeg.el),
        GW.ui.group('控制', transport.el, GW.h('div', { style: { fontSize: '12px', color: '#5b6576' } }, '时间倍率（×1：动画 1 s = 实际 10 min）'), spSeg.el),
        GW.ui.group('发射', hS.el, launchBox, ro('v1', '第一宇宙速度'), ro('v2', '第二宇宙速度'), ro('vc', '该高度环绕速度'), ro('ve', '该高度逃逸速度')),
        GW.ui.group('变轨', hohBox, dvS.el, burnRow),
        GW.ui.group('读数', ro('type', '轨道类型'), ro('ecc', '偏心率 e'), ro('r', '到地心距离 r'), ro('vv', '速度 v'), ro('aa', '加速度 a = GM/r²'), ro('T', '周期 T'), ro('pa', '近/远地点高度'), ro('E', '比机械能 E/m'), ro('dE', '能量相对漂移')),
        GW.ui.group('显示', tg('vec', '速度 v 与加速度 a 矢量').el, tg('pred', '预测轨道（虚线）').el, tg('kepler', '开普勒第二定律：等时扫过面积', () => { sectors = []; curSec = null; }).el),
      );
      function sync() { launchBox.style.display = S.mode === 'launch' ? 'flex' : 'none'; hohBox.style.display = S.mode === 'hohmann' ? 'flex' : 'none'; }
      sync();

      // ---------- 视图 ----------
      let W, H, cx = 0, cy = 0, sc = 0;
      const SX = (wx) => cx + wx * sc, SY = (wy) => cy - wy * sc;
      function targetView() {
        const el = elements();
        let xmin, xmax, ymax;
        const rr = Math.hypot(x, y);
        if (el.E < 0 && el.a * (1 + el.e) < 40 * RE) {
          const ra = el.a * (1 + el.e), rp = el.a * (1 - el.e), b = el.a * Math.sqrt(1 - el.e * el.e);
          // 以拱线方向为准求包围盒（近似：用旋转后的椭圆取样）
          const ang = Math.atan2(el.ey, el.ex);
          xmin = Infinity; xmax = -Infinity; ymax = 0; let ymin = Infinity;
          for (let i = 0; i < 64; i++) {
            const E = i / 64 * 2 * Math.PI, px = el.a * (Math.cos(E) - el.e), py = b * Math.sin(E);
            const qx = px * Math.cos(ang) - py * Math.sin(ang), qy = px * Math.sin(ang) + py * Math.cos(ang);
            xmin = Math.min(xmin, qx); xmax = Math.max(xmax, qx); ymax = Math.max(ymax, qy); ymin = Math.min(ymin, qy);
          }
          if (S.mode === 'hohmann') { const r2 = S.r2 * RE; xmin = Math.min(xmin, -r2); xmax = Math.max(xmax, r2); ymax = Math.max(ymax, r2); ymin = Math.min(ymin, -r2); }
          void rp; void ra;
          xmin = Math.min(xmin, -RE); xmax = Math.max(xmax, RE); ymax = Math.max(ymax, RE); ymin = Math.min(ymin, -RE);
          return { xmin, xmax, ymin, ymax };
        }
        void rr;
        const q = r0() * 1.2;
        let b = { xmin: Math.min(-q, x - 2 * RE), xmax: Math.max(q, x + 2 * RE), ymin: Math.min(-q, y - 2 * RE), ymax: Math.max(q, y + 2 * RE) };
        const mx = (b.xmin + b.xmax) / 2, my = (b.ymin + b.ymax) / 2, hw = Math.max(b.xmax - b.xmin, 8 * RE) / 2, hh = Math.max(b.ymax - b.ymin, 5 * RE) / 2;
        return { xmin: mx - hw, xmax: mx + hw, ymin: my - hh, ymax: my + hh };
      }
      function fit() {
        const b = targetView(), m = 56;
        const s = Math.min((W - 2 * m) / (b.xmax - b.xmin), (H - 2 * m - 30) / (b.ymax - b.ymin));
        const tcx = W / 2 - (b.xmin + b.xmax) / 2 * s, tcy = H / 2 + 10 + (b.ymin + b.ymax) / 2 * s;
        if (!sc) { sc = s; cx = tcx; cy = tcy; }
        const k = 0.08;
        sc += (s - sc) * k; cx += (tcx - cx) * k; cy += (tcy - cy) * k;
      }

      function conicPath(el, dash, color, width) {
        // r(f) = p / (1 + e cos f)，f 相对近地点方向
        const ang = Math.atan2(el.ey, el.ex), e = el.e, p = el.p;
        const fmax = e < 1 ? Math.PI : Math.acos(-1 / e) - 0.02;
        let fmin = -fmax;
        if (e >= 1) { const fn = Math.atan2(y, x) - ang; fmin = Math.atan2(Math.sin(fn), Math.cos(fn)); if (el.Lz < 0) fmin = -fmax; }
        g2.save(); g2.strokeStyle = color; g2.lineWidth = width; if (dash) g2.setLineDash(dash);
        g2.beginPath();
        let first = true;
        for (let i = 0; i <= 720; i++) {
          const f = fmin + (fmax - fmin) * i / 720, r = p / (1 + e * Math.cos(f));
          if (!(r > 0) || r > 200 * RE) { first = true; continue; }
          const wx = r * Math.cos(f + ang), wy = r * Math.sin(f + ang);
          first ? g2.moveTo(SX(wx), SY(wy)) : g2.lineTo(SX(wx), SY(wy)); first = false;
        }
        g2.stroke(); g2.restore();
      }

      kit.loop((dt) => {
        const sz = kit.size(); W = sz.w; H = sz.h;
        if (!W) return;
        if (kit.running && !crashed) integrate(dt * S.speed * TSCALE);
        if (msgT > 0) msgT -= dt;
        fit();
        kit.background();
        const el = elements();

        // 开普勒扇形
        if (S.kepler) {
          const all = sectors.concat(curSec ? [curSec] : []);
          all.forEach((sec) => {
            g2.fillStyle = sec.k % 2 ? 'rgba(242,165,65,0.38)' : 'rgba(15,157,138,0.30)';
            g2.beginPath(); g2.moveTo(SX(0), SY(0));
            sec.pts.forEach((p) => g2.lineTo(SX(p[0]), SY(p[1])));
            g2.closePath(); g2.fill();
          });
          if (sectors.length) {
            const A = 0.5 * Math.abs(el.Lz) * secDt;
            label(g2, '每个扇形用时 Δt = ' + (secDt / 60).toFixed(1) + ' min，面积均为 ' + (A / (RE * RE)).toFixed(3) + ' R²', 16, H - 20, { color: '#b87400', weight: 'bold' });
          }
        }
        // 霍曼参考轨道
        if (S.mode === 'hohmann') {
          const r2 = S.r2 * RE;
          g2.save(); g2.strokeStyle = 'rgba(51,102,255,0.4)'; g2.lineWidth = 2; g2.setLineDash([3, 6]);
          g2.beginPath(); g2.arc(SX(0), SY(0), r2 * sc, 0, 7); g2.stroke();
          g2.beginPath(); g2.arc(SX(0), SY(0), r0() * sc, 0, 7); g2.stroke(); g2.restore();
          label(g2, '目标轨道', SX(0), SY(r2) - 14, { align: 'center', color: C.blue });
        }
        // 预测轨道
        if (S.pred && !crashed) conicPath(el, [8, 6], 'rgba(27,36,51,0.35)', 2);
        // 轨迹
        g2.save(); g2.strokeStyle = C.cyan; g2.lineWidth = 2.5; g2.lineJoin = 'round'; g2.beginPath();
        trail.forEach((p, i) => (i ? g2.lineTo(SX(p[0]), SY(p[1])) : g2.moveTo(SX(p[0]), SY(p[1]))));
        g2.lineTo(SX(x), SY(y)); g2.stroke(); g2.restore();
        // 地球
        const er = RE * sc, gx = SX(0), gy = SY(0);
        const grd = g2.createRadialGradient(gx - er * 0.35, gy - er * 0.35, er * 0.1, gx, gy, er);
        grd.addColorStop(0, '#8fb4ff'); grd.addColorStop(1, '#2f5fd0');
        g2.fillStyle = grd; g2.beginPath(); g2.arc(gx, gy, er, 0, 7); g2.fill();
        g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.stroke();
        if (er > 22) label(g2, '地球', gx, gy, { align: 'center', color: '#fff', halo: false, weight: 'bold' });
        else label(g2, '地球', gx, gy + er + 14, { align: 'center' });
        // 点火位置
        burns.forEach(([bx, by, dv]) => {
          const X = SX(bx), Y = SY(by);
          g2.save(); g2.strokeStyle = dv > 0 ? C.red : C.blue; g2.lineWidth = 2.5;
          g2.beginPath(); g2.moveTo(X - 7, Y - 7); g2.lineTo(X + 7, Y + 7); g2.moveTo(X + 7, Y - 7); g2.lineTo(X - 7, Y + 7); g2.stroke(); g2.restore();
        });
        // 近/远地点
        if (el.E < 0 && el.e > 0.02 && !crashed) {
          const ang = Math.atan2(el.ey, el.ex), rp = el.a * (1 - el.e), ra = el.a * (1 + el.e);
          [[rp, ang, '近地点 P'], [ra, ang + Math.PI, '远地点 Q']].forEach(([r, a, n]) => {
            const X = SX(r * Math.cos(a)), Y = SY(r * Math.sin(a));
            if (X < 0 || X > W || Y < 0 || Y > H) return;
            g2.fillStyle = C.ink; g2.beginPath(); g2.arc(X, Y, 4, 0, 7); g2.fill();
            const lx = GW.clamp(X + Math.cos(a) * 40, 44, W - 44), ly = GW.clamp(Y - Math.sin(a) * 30 + (Math.abs(Math.sin(a)) < 0.5 ? 20 : 0), 60, H - 50);
            label(g2, n, lx, ly, { align: 'center' });
          });
        }
        // 卫星与矢量
        const X = SX(x), Y = SY(y);
        if (S.vec && !crashed) {
          const v = Math.hypot(vx, vy), r = Math.hypot(x, y), a = GM / (r * r);
          const LV = 4.5 * v / 1000, LA = 26 * Math.sqrt(a / 9.8) * 2;
          GW.draw.arrow(g2, X, Y, X + vx / v * LV * 2, Y - vy / v * LV * 2, { color: C.blue, width: 3, head: 11 });
          rich(g2, 'v', X + vx / v * LV * 2 + 10, Y - vy / v * LV * 2 - 8, { color: C.blue, weight: 'bold', size: 18 });
          GW.draw.arrow(g2, X, Y, X - x / r * LA, Y + y / r * LA, { color: C.red, width: 3, head: 11 });
          rich(g2, 'a', X - x / r * LA - 6, Y + y / r * LA + 14, { color: C.red, weight: 'bold', size: 18 });
        }
        g2.fillStyle = crashed ? '#999' : C.gold; g2.strokeStyle = C.ink; g2.lineWidth = 2;
        g2.beginPath(); g2.arc(X, Y, 7, 0, 7); g2.fill(); g2.stroke();

        // 文本
        const typ = crashed ? '—' : el.E >= 0 ? (el.e > 1.005 ? '双曲线（逃逸）' : '抛物线（恰好逃逸）') : el.e < 0.005 ? '圆' : '椭圆';
        label(g2, 't = ' + (t / 60).toFixed(1) + ' min', 16, 20, { weight: 'bold', size: 17 });
        label(g2, '轨道：' + typ, 16, 44, { weight: 'bold', color: C.cyan });
        if (msg && (msgT > 0 || crashed)) label(g2, msg, W / 2, 20, { align: 'center', color: C.red, weight: 'bold' });
        // 比例尺
        let bar = RE, bl = '1 R（6371 km）';
        if (bar * sc > 160) { bar = RE / 2; bl = '0.5 R'; }
        g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.beginPath();
        g2.moveTo(W - 20 - bar * sc, H - 20); g2.lineTo(W - 20, H - 20);
        g2.moveTo(W - 20 - bar * sc, H - 26); g2.lineTo(W - 20 - bar * sc, H - 14); g2.moveTo(W - 20, H - 26); g2.lineTo(W - 20, H - 14); g2.stroke();
        label(g2, bl, Math.min(W - 20 - bar * sc / 2, W - 75), H - 36, { align: 'center', color: '#5b6576' });

        // 读数
        const r = Math.hypot(x, y), v = Math.hypot(vx, vy);
        R.v1.set(Math.sqrt(GM / RE / 1e6).toFixed(2) + ' km/s'); R.v2.set(Math.sqrt(2 * GM / RE / 1e6).toFixed(2) + ' km/s');
        R.vc.set((Math.sqrt(GM / r0()) / 1000).toFixed(2) + ' km/s'); R.ve.set((Math.sqrt(2 * GM / r0()) / 1000).toFixed(2) + ' km/s');
        R.type.set(typ); R.ecc.set(el.e.toFixed(3));
        R.r.set((r / 1000).toFixed(0) + ' km'); R.vv.set((v / 1000).toFixed(3) + ' km/s'); R.aa.set((GM / (r * r)).toFixed(3) + ' m/s²');
        R.T.set(el.E < 0 ? (2 * Math.PI * Math.sqrt(el.a ** 3 / GM) / 60).toFixed(1) + ' min' : '—（不闭合）');
        R.pa.set(el.E < 0 ? ((el.a * (1 - el.e) - RE) / 1000).toFixed(0) + ' / ' + ((el.a * (1 + el.e) - RE) / 1000).toFixed(0) + ' km' : ((el.p / (1 + el.e) - RE) / 1000).toFixed(0) + ' km / —');
        R.E.set((el.E / 1e6).toFixed(3) + ' MJ/kg');
        R.dE.set(Math.abs(E0) > 1 ? ((el.E - E0) / Math.abs(E0) * 100).toExponential(1) + ' %' : '—');
        if (S.mode === 'hohmann') {
          const r1 = r0(), r2 = S.r2 * RE;
          R.dv1.set((Math.sqrt(GM / r1) * (Math.sqrt(2 * r2 / (r1 + r2)) - 1) / 1000).toFixed(3) + ' km/s');
          R.dv2.set((Math.sqrt(GM / r2) * (1 - Math.sqrt(2 * r1 / (r1 + r2))) / 1000).toFixed(3) + ' km/s');
        }
      });
      reset();
      return { destroy() { kit.destroy(); } };
    },
  });
})();
