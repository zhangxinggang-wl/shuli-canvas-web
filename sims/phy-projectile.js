/* 数理无限画布 · 高中物理 · 抛体运动（平抛 / 斜抛，可选线性空气阻力 f = kv 对比） */
(function () {
  'use strict';
  const C = { ink: '#1b2433', cyan: '#0f9d8a', red: '#e4572e', blue: '#3366ff', gold: '#f2a541', grey: '#8a94a6' };
  const SANS = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif';
  const SERIF = '"Times New Roman",serif';

  // 带下标文字：'v_0'、'F_N'、'v_{x}'；下标正体，主体可斜体
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
  function label(ctx, s, x, y, o) { rich(ctx, s, x, y, Object.assign({ italic: false, family: SANS, size: 15 }, o)); }
  function niceStep(pxPerUnit, minPx) {
    const raw = (minPx || 60) / pxPerUnit, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 2 ? 2 : m < 5 ? 5 : 10) * p;
  }
  const f2 = (v, d = 2) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d);

  // ---------- 运动学（解析解，无积分漂移） ----------
  // 无阻力：x = vx0 t，y = h + vy0 t − ½gt²
  // 线性阻力 a = g − b v（b = k/m）：x = vx0(1−e^{−bt})/b，y = h + (vy0+g/b)(1−e^{−bt})/b − g t/b
  function makeShot(p, drag) {
    const th = p.theta * Math.PI / 180, vx0 = p.v0 * Math.cos(th), vy0 = p.v0 * Math.sin(th), g = p.g, h = p.h, b = p.b;
    const s = { vx0, vy0, g, h, b, drag };
    if (!drag) {
      s.pos = (t) => [vx0 * t, h + vy0 * t - 0.5 * g * t * t];
      s.vel = (t) => [vx0, vy0 - g * t];
      s.T = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * h)) / g;
      s.tPeak = vy0 > 0 ? vy0 / g : 0;
    } else {
      const vt = g / b;
      s.pos = (t) => { const e = Math.exp(-b * t); return [vx0 * (1 - e) / b, h + (vy0 + vt) * (1 - e) / b - vt * t]; };
      s.vel = (t) => { const e = Math.exp(-b * t); return [vx0 * e, (vy0 + vt) * e - vt]; };
      s.tPeak = vy0 > 0 ? Math.log(1 + b * vy0 / g) / b : 0;
      let lo = s.tPeak, hi = Math.max(lo + 0.01, 0.1);
      while (s.pos(hi)[1] > 0 && hi < 1e4) hi *= 2;
      if (h <= 0 && vy0 <= 0) { lo = hi = 0; }
      for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (s.pos(m)[1] > 0) lo = m; else hi = m; }
      s.T = hi;
    }
    if (!(s.T > 0)) s.T = 0;
    s.range = s.pos(s.T)[0];
    s.H = s.pos(s.tPeak)[1];
    return s;
  }

  GW.registerSim({
    id: 'phy-projectile', name: '抛体运动', category: 'physics', group: '力学',
    desc: '平抛与斜抛：轨迹、频闪照片、速度与位移的分解，可对比空气阻力的影响',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M4 18C7 6 13 4 20 18"/><circle cx="12" cy="8" r="1.6" fill="currentColor"/><path d="M4 18l4-6"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      const D = { mode: 'oblique', v0: 15, theta: 45, h: 0, g: 9.8, drag: false, b: 0.3, strobe: true, dts: 0.2, proj: true, comp: true, disp: false, keep: true, speed: 1 };
      for (const k in D) if (S[k] === undefined) S[k] = D[k];
      const save = () => ctx.save();
      const kit = GW.simKit.layout(ctx.root);
      const g2 = kit.ctx2d;

      let shot = null, shotDrag = null, t = 0, flying = false, history = [];
      let view = { s: 0, ox: 70, oy: 0 };
      const params = () => ({ v0: S.v0, theta: S.mode === 'flat' ? 0 : S.theta, h: S.h, g: S.g, b: S.b });

      function prepare() {
        const p = params();
        shot = makeShot(p, false);
        shotDrag = S.drag ? makeShot(p, true) : null;
        t = 0; flying = false;
      }
      function launch() {
        if (shot && t > 0 && S.keep) {
          history.push({ shot, shotDrag, n: history.length + 1 });
          if (history.length > 6) history.shift();
        }
        prepare();
        flying = true;
        transport.setRunning(true);
      }
      function totalT() { return Math.max(shot.T, shotDrag ? shotDrag.T : 0); }

      // ---------- 面板 ----------
      const P = kit.panel;
      const modeSeg = GW.ui.segmented({ options: [{ value: 'flat', label: '平抛' }, { value: 'oblique', label: '斜抛' }], value: S.mode, onChange: (v) => { S.mode = v; thS.el.style.display = v === 'flat' ? 'none' : ''; save(); prepare(); } });
      const v0S = GW.ui.slider({ label: '初速度 v₀', min: 0, max: 30, step: 0.5, value: S.v0, unit: 'm/s', onInput: (v) => { S.v0 = v; save(); prepare(); } });
      const thS = GW.ui.slider({ label: '抛射角 θ', min: -60, max: 90, step: 1, value: S.theta, unit: '°', onInput: (v) => { S.theta = v; save(); prepare(); } });
      thS.el.style.display = S.mode === 'flat' ? 'none' : '';
      const hS = GW.ui.slider({ label: '抛出点高度 h', min: 0, max: 50, step: 0.5, value: S.h, unit: 'm', onInput: (v) => { S.h = v; save(); prepare(); } });
      const gS = GW.ui.slider({ label: '重力加速度 g', min: 1, max: 20, step: 0.1, value: S.g, unit: 'm/s²', onInput: (v) => { S.g = v; save(); prepare(); } });
      const gRow = GW.h('div', { class: 'gw-row' },
        GW.ui.button({ label: '地球 9.8', onClick: () => { S.g = 9.8; gS.set(9.8); save(); prepare(); } }).el,
        GW.ui.button({ label: '月球 1.6', onClick: () => { S.g = 1.6; gS.set(1.6); save(); prepare(); } }).el);
      const dragT = GW.ui.toggle({ label: '对比空气阻力 f = kv', value: S.drag, onChange: (v) => { S.drag = v; bS.el.style.display = v ? '' : 'none'; save(); prepare(); } });
      const bS = GW.ui.slider({ label: '阻力系数 k/m', min: 0.05, max: 1.5, step: 0.05, value: S.b, unit: 's⁻¹', onInput: (v) => { S.b = v; save(); prepare(); } });
      bS.el.style.display = S.drag ? '' : 'none';
      const strobeT = GW.ui.toggle({ label: '频闪点（等时间间隔）', value: S.strobe, onChange: (v) => { S.strobe = v; save(); } });
      const dtsS = GW.ui.slider({ label: '频闪间隔 Δt', min: 0.05, max: 1, step: 0.05, value: S.dts, unit: 's', onInput: (v) => { S.dts = v; save(); } });
      const projT = GW.ui.toggle({ label: '频闪点在坐标轴上的投影', value: S.proj, onChange: (v) => { S.proj = v; save(); } });
      const compT = GW.ui.toggle({ label: '速度矢量及分解', value: S.comp, onChange: (v) => { S.comp = v; save(); } });
      const dispT = GW.ui.toggle({ label: '位移矢量及分解', value: S.disp, onChange: (v) => { S.disp = v; save(); } });
      const keepT = GW.ui.toggle({ label: '保留历次轨迹对比', value: S.keep, onChange: (v) => { S.keep = v; save(); } });
      const clearB = GW.ui.button({ label: '清除轨迹', onClick: () => { history = []; } });
      const fireB = GW.ui.button({ label: '🚀 发射', primary: true, onClick: launch });
      const transport = GW.simKit.transport(kit, () => { prepare(); });
      const spSeg = GW.ui.segmented({ options: [{ value: 0.25, label: '×0.25' }, { value: 0.5, label: '×0.5' }, { value: 1, label: '×1' }], value: S.speed, onChange: (v) => { S.speed = v; save(); } });
      const R = {};
      const ro = (k, l) => (R[k] = GW.ui.readout(l)).el;
      P.append(
        GW.ui.group('运动类型', modeSeg.el),
        GW.ui.group('发射', fireB.el, transport.el, GW.h('div', { style: { fontSize: '12px', color: '#5b6576' } }, '慢放'), spSeg.el),
        GW.ui.group('参数', v0S.el, thS.el, hS.el, gS.el, gRow),
        GW.ui.group('读数（以抛出点正下方地面为原点）', ro('t', '时间 t'), ro('x', '水平位移 x'), ro('y', '高度 y'), ro('vx', '水平速度 vₓ'), ro('vy', '竖直速度 v_y'), ro('v', '速度大小 v'),
          ro('R', '射程'), ro('H', '最大高度'), ro('T', '飞行时间'), ro('vl', '落地速度'), ro('dR', '有阻力时射程'), ro('dH', '有阻力时最大高度')),
        GW.ui.group('空气阻力', dragT.el, bS.el),
        GW.ui.group('显示', strobeT.el, dtsS.el, projT.el, compT.el, dispT.el, keepT.el, clearB.el),
      );
      R.vy.el.firstChild.innerHTML = '竖直速度 v<sub>y</sub>';
      R.dR.el.style.display = R.dH.el.style.display = 'none';

      // ---------- 拖拽：拖动初速度箭头端点设定 v₀ 与 θ，拖动平台顶部改变 h ----------
      const ARROW_K = () => GW.clamp(85 / Math.max(S.v0, 8), 2, 10);
      function launchPx() { return [view.ox, view.oy - S.h * view.s]; }
      kit.drag((p) => {
        const [lx, ly] = launchPx();
        const th = (S.mode === 'flat' ? 0 : S.theta) * Math.PI / 180, L = S.v0 * ARROW_K();
        const tx = lx + L * Math.cos(th), ty = ly - L * Math.sin(th);
        if (Math.hypot(p.x - tx, p.y - ty) < 22) return 'arrow';
        if (Math.abs(p.y - ly) < 16 && p.x > lx - 60 && p.x < lx + 6) return 'h';
        return null;
      }, (obj, p) => {
        const [lx, ly] = launchPx();
        if (obj === 'arrow') {
          const dx = p.x - lx, dy = ly - p.y;
          S.v0 = GW.clamp(Math.round(Math.hypot(dx, dy) / ARROW_K() * 2) / 2, 0, 30); v0S.set(S.v0);
          if (S.mode === 'oblique') { S.theta = GW.clamp(Math.round(Math.atan2(dy, dx) * 180 / Math.PI), -60, 90); thS.set(S.theta); }
        } else {
          S.h = GW.clamp(Math.round((view.oy - p.y) / view.s * 2) / 2, 0, 50); hS.set(S.h);
        }
        prepare();
      }, () => save());

      // ---------- 绘制 ----------
      function fitView(W, H) {
        let xm = 6, ym = 4;
        const all = [shot, shotDrag].concat(...history.map((hh) => [hh.shot, hh.shotDrag])).filter(Boolean);
        all.forEach((s) => { xm = Math.max(xm, s.range); ym = Math.max(ym, s.H, s.h); });
        // 预留初速度箭头空间
        ym = Math.max(ym, S.h + 2);
        const left = 100, right = 40, top = 50, bot = 46;
        const target = Math.min((W - left - right) / (xm * 1.06), (H - top - bot) / (ym * 1.12));
        view.s = view.s ? view.s + (target - view.s) * 0.18 : target;
        view.ox = left; view.oy = H - bot;
      }
      function drawAxes(W, H) {
        const { s, ox, oy } = view;
        const st = niceStep(s, 70);
        g2.save();
        g2.lineWidth = 1; g2.strokeStyle = 'rgba(27,36,51,0.07)';
        for (let v = st; ox + v * s < W - 10; v += st) { g2.beginPath(); g2.moveTo(ox + v * s, 30); g2.lineTo(ox + v * s, oy); g2.stroke(); }
        for (let v = st; oy - v * s > 30; v += st) { g2.beginPath(); g2.moveTo(ox, oy - v * s); g2.lineTo(W - 10, oy - v * s); g2.stroke(); }
        // 地面
        g2.fillStyle = '#eef1f5'; g2.fillRect(0, oy, W, H - oy);
        g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(0, oy); g2.lineTo(W, oy); g2.stroke();
        g2.font = '15px ' + SANS; g2.fillStyle = '#5b6576'; g2.textAlign = 'center'; g2.textBaseline = 'top';
        for (let v = st; ox + v * s < W - 30; v += st) { g2.fillText(+v.toFixed(3), ox + v * s, oy + 6); g2.fillRect(ox + v * s - 1, oy, 2, 5); }
        g2.textAlign = 'right'; g2.textBaseline = 'middle';
        const tx = S.h > 0 ? ox - 62 : ox - 8;
        for (let v = st; oy - v * s > 40; v += st) g2.fillText(+v.toFixed(3), tx, oy - v * s);
        g2.restore();
        GW.draw.arrow(g2, ox, oy, W - 14, oy, { color: C.ink, width: 2, head: 11 });
        GW.draw.arrow(g2, ox, oy, ox, 22, { color: C.ink, width: 2, head: 11 });
        rich(g2, 'x', W - 30, oy - 16, { size: 17 }); label(g2, '/m', W - 22, oy - 16, { align: 'left' });
        rich(g2, 'y', ox + 12, 28, { size: 17 }); label(g2, '/m', ox + 21, 28);
        label(g2, 'O', ox - 10, oy + 14, { align: 'center' });
        // 抛出平台
        if (S.h > 0) {
          const ly = oy - S.h * s;
          g2.fillStyle = '#d9dee6'; g2.fillRect(ox - 54, ly, 54, oy - ly);
          g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.strokeRect(ox - 54, ly, 54, oy - ly);
          if (oy - ly > 44) { rich(g2, 'h', ox - 27, (ly + oy) / 2 - 10, { align: 'center', size: 17 }); label(g2, S.h.toFixed(1) + ' m', ox - 27, (ly + oy) / 2 + 12, { align: 'center', size: 15 }); }
          else label(g2, 'h = ' + S.h.toFixed(1) + ' m', ox - 27, ly - 14, { align: 'center', size: 15 });
        }
      }
      const P2 = (x, y) => [view.ox + x * view.s, view.oy - y * view.s];
      function pathOf(sh, tEnd, color, width, dash) {
        const n = Math.max(2, Math.ceil(tEnd / sh.T * 240) || 2);
        g2.save(); g2.strokeStyle = color; g2.lineWidth = width; g2.lineJoin = 'round';
        if (dash) g2.setLineDash(dash);
        g2.beginPath();
        for (let i = 0; i <= n; i++) { const [x, y] = sh.pos(tEnd * i / n); const q = P2(x, y); i ? g2.lineTo(q[0], q[1]) : g2.moveTo(q[0], q[1]); }
        g2.stroke(); g2.restore();
      }
      function ball(x, y, color, r) {
        const [px, py] = P2(x, y);
        g2.save(); g2.fillStyle = color; g2.strokeStyle = C.ink; g2.lineWidth = 2;
        g2.beginPath(); g2.arc(px, py, r, 0, Math.PI * 2); g2.fill(); g2.stroke(); g2.restore();
      }
      function strobe(sh, tEnd, color) {
        const n = Math.floor(tEnd / S.dts + 1e-9);
        for (let i = 0; i <= n; i++) {
          const tt = i * S.dts; if (tt > sh.T + 1e-9) break;
          const [x, y] = sh.pos(tt), [px, py] = P2(x, y);
          if (S.proj && !sh.drag) {
            g2.save(); g2.fillStyle = color; g2.globalAlpha = 0.55;
            g2.beginPath(); g2.arc(px, view.oy, 4, 0, 7); g2.fill();
            g2.beginPath(); g2.arc(view.ox, py, 4, 0, 7); g2.fill();
            g2.strokeStyle = color; g2.lineWidth = 1; g2.setLineDash([2, 4]); g2.globalAlpha = 0.35;
            g2.beginPath(); g2.moveTo(px, py); g2.lineTo(px, view.oy); g2.moveTo(px, py); g2.lineTo(view.ox, py); g2.stroke();
            g2.restore();
          }
          g2.save(); g2.fillStyle = '#fff'; g2.strokeStyle = color; g2.lineWidth = 2.5;
          g2.beginPath(); g2.arc(px, py, 5.5, 0, 7); g2.fill(); g2.stroke(); g2.restore();
        }
      }
      function vectors(sh, tt) {
        const [x, y] = sh.pos(tt), [vx, vy] = sh.vel(tt), [px, py] = P2(x, y), k = ARROW_K();
        if (S.disp && tt > 0) {
          const [lx, ly] = P2(0, sh.h);
          GW.draw.arrow(g2, lx, ly, px, ly, { color: C.gold, width: 2.5, dash: [6, 4] });
          GW.draw.arrow(g2, px, ly, px, py, { color: C.gold, width: 2.5, dash: [6, 4] });
          GW.draw.arrow(g2, lx, ly, px, py, { color: '#c77d0a', width: 3 });
          rich(g2, 'x', (lx + px) / 2, ly + (py < ly ? 14 : -14), { color: '#a8680a', align: 'center' });
          rich(g2, 'y', px + 10, (ly + py) / 2, { color: '#a8680a' });
          rich(g2, 's', (lx + px) / 2 - 12, (ly + py) / 2 - 10, { color: '#a8680a', weight: 'bold' });
        }
        if (S.comp) {
          GW.draw.arrow(g2, px, py, px + vx * k, py, { color: C.blue, width: 2.5, dash: [6, 4] });
          GW.draw.arrow(g2, px, py, px, py - vy * k, { color: C.blue, width: 2.5, dash: [6, 4] });
          g2.save(); g2.strokeStyle = 'rgba(51,102,255,0.35)'; g2.lineWidth = 1.5; g2.setLineDash([3, 4]);
          g2.beginPath(); g2.moveTo(px + vx * k, py); g2.lineTo(px + vx * k, py - vy * k); g2.lineTo(px, py - vy * k); g2.stroke(); g2.restore();
          if (Math.abs(vx * k) > 14) rich(g2, 'v_x', px + vx * k + 6, py + 12, { color: C.blue });
          if (Math.abs(vy * k) > 14) rich(g2, 'v_y', px + 8, py - vy * k + (vy > 0 ? -8 : 10), { color: C.blue });
          GW.draw.arrow(g2, px, py, px + vx * k, py - vy * k, { color: C.red, width: 3, head: 12 });
          rich(g2, 'v', px + vx * k + 8, py - vy * k - 10, { color: C.red, weight: 'bold', size: 18 });
        }
      }

      kit.loop((dt) => {
        const { w: W, h: H } = kit.size();
        if (!W) return;
        if (!shot) prepare();
        if (flying && kit.running) {
          t += dt * S.speed;
          if (t >= totalT()) { t = totalT(); flying = false; }
        }
        fitView(W, H);
        g2.clearRect(0, 0, W, H);
        kit.background();
        drawAxes(W, H);

        // 历史轨迹
        history.forEach((hh, i) => {
          const a = 0.35 + 0.5 * (i + 1) / history.length;
          g2.save(); g2.globalAlpha = a;
          pathOf(hh.shot, hh.shot.T, '#7fa7a0', 2, null);
          if (hh.shotDrag) pathOf(hh.shotDrag, hh.shotDrag.T, '#d9a08f', 2, [6, 4]);
          const [px, py] = P2(hh.shot.range, 0);
          label(g2, '第' + hh.n + '次', px, py - 14, { align: 'center', color: '#5b6576', size: 15 });
          g2.restore();
        });

        const tI = Math.min(t, shot.T);
        // 最大高度与射程标注（运动完成后）
        if (!flying && t > 0 && shot.T > 0) {
          const [hx, hy] = P2(shot.pos(shot.tPeak)[0], shot.H);
          g2.save(); g2.strokeStyle = 'rgba(15,157,138,0.6)'; g2.lineWidth = 1.5; g2.setLineDash([5, 5]);
          g2.beginPath(); g2.moveTo(view.ox, hy); g2.lineTo(hx, hy); g2.moveTo(hx, hy); g2.lineTo(hx, view.oy); g2.stroke(); g2.restore();
          label(g2, '最大高度 ' + f2(shot.H) + ' m', view.ox + 8, hy - 13, { color: C.cyan });
          const [rx] = P2(shot.range, 0);
          label(g2, '射程 ' + f2(shot.range) + ' m', rx - 20, view.oy - 40, { align: 'center', color: C.cyan });
        }
        if (shotDrag) {
          const tD = Math.min(t, shotDrag.T);
          pathOf(shotDrag, tD, C.red, 2.5, [7, 5]);
          if (S.strobe) strobe(shotDrag, tD, C.red);
        }
        pathOf(shot, tI, C.cyan, 3, null);
        if (S.strobe) strobe(shot, tI, C.cyan);
        if (shotDrag) { const [x, y] = shotDrag.pos(Math.min(t, shotDrag.T)); ball(x, y, '#f6b7a5', 8); }
        const [bx, by] = shot.pos(tI);
        ball(bx, by, C.gold, 10);
        vectors(shot, tI);
        // 未发射时：提示
        if (t === 0) {
          const [lx, ly] = launchPx();
          const th = (S.mode === 'flat' ? 0 : S.theta) * Math.PI / 180, L = S.v0 * ARROW_K();
          g2.save(); g2.strokeStyle = 'rgba(228,87,46,0.35)'; g2.lineWidth = 2; g2.setLineDash([3, 3]);
          g2.beginPath(); g2.arc(lx + L * Math.cos(th), ly - L * Math.sin(th), 16, 0, 7); g2.stroke(); g2.restore();
          if (S.mode === 'oblique' && S.v0 > 0) {
            g2.save(); g2.strokeStyle = C.ink; g2.lineWidth = 1.5;
            g2.beginPath(); g2.moveTo(lx, ly); g2.lineTo(lx + 60, ly); g2.stroke();
            g2.beginPath(); g2.arc(lx, ly, 34, -Math.max(th, 0), -Math.min(th, 0)); g2.stroke(); g2.restore();
            rich(g2, 'θ', lx + 40, ly - 14 * Math.sign(th || 1), { size: 16 });
          }
          label(g2, '拖动初速度箭头端点可调 v₀、θ；点「发射」开始', 16, 18, { color: '#5b6576' });
        }
        // 图例
        let ly0 = 18;
        if (t !== 0) { label(g2, 't = ' + t.toFixed(2) + ' s', 16, ly0, { size: 17, weight: 'bold' }); }
        if (shotDrag) {
          const lx0 = W - 210;
          g2.save(); g2.lineWidth = 3; g2.strokeStyle = C.cyan; g2.beginPath(); g2.moveTo(lx0, ly0); g2.lineTo(lx0 + 30, ly0); g2.stroke();
          g2.strokeStyle = C.red; g2.setLineDash([7, 5]); g2.beginPath(); g2.moveTo(lx0, ly0 + 24); g2.lineTo(lx0 + 30, ly0 + 24); g2.stroke(); g2.restore();
          label(g2, '无空气阻力', lx0 + 38, ly0); label(g2, '有阻力 f = kv', lx0 + 38, ly0 + 24);
        }

        // 读数
        const [vx, vy] = shot.vel(tI);
        R.t.set(tI.toFixed(2) + ' s'); R.x.set(f2(bx) + ' m'); R.y.set(f2(by) + ' m');
        R.vx.set(f2(vx) + ' m/s'); R.vy.set(f2(vy) + ' m/s'); R.v.set(f2(Math.hypot(vx, vy)) + ' m/s');
        R.R.set(f2(shot.range) + ' m'); R.H.set(f2(shot.H) + ' m'); R.T.set(f2(shot.T) + ' s');
        const [lvx, lvy] = shot.vel(shot.T);
        R.vl.set(f2(Math.hypot(lvx, lvy)) + ' m/s，与水平 ' + (Math.atan2(-lvy, lvx) * 180 / Math.PI).toFixed(1) + '°向下');
        R.dR.el.style.display = R.dH.el.style.display = shotDrag ? '' : 'none';
        if (shotDrag) { R.dR.set(f2(shotDrag.range) + ' m'); R.dH.set(f2(shotDrag.H) + ' m'); }
      });

      prepare();
      return { destroy() { kit.destroy(); } };
    },
  });
})();
