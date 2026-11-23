/* 数理无限画布 · 高中物理 · 碰撞与动量守恒（一维两滑块，光滑气垫导轨） */
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

  GW.registerSim({
    id: 'phy-collision', name: '碰撞与动量守恒', category: 'physics', group: '力学',
    desc: '气垫导轨上两滑块的一维碰撞：弹性、完全非弹性与任意恢复系数，动量与动能对比',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 19h20"/><rect x="3" y="11" width="7" height="6" rx="1"/><rect x="14" y="12" width="6" height="5" rx="1"/><path d="M5 7h4l-1.5-1.5M5 7l1.5 1.5" /><path d="M19 7h-4"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      const D = { m1: 2, m2: 1, v1: 3, v2: -1, type: 'elastic', e: 0.5, xt: true, speed: 1 };
      for (const k in D) if (S[k] === undefined) S[k] = D[k];
      const save = () => ctx.save();
      const kit = GW.simKit.layout(ctx.root);
      const g2 = kit.ctx2d;
      const TRACK = 6; // 导轨长度 6 m（x 从 0 到 6）
      const X1_0 = 1.2, X2_0 = 4.2; // 初始中心位置
      const w1 = () => 0.42 + 0.07 * S.m1, w2 = () => 0.42 + 0.07 * S.m2; // 滑块宽度 m（随质量变化）

      let t = 0, x1, x2, u1, u2, collided = false, tc = null, hist = [], done = false;
      const eff = () => (S.type === 'elastic' ? 1 : S.type === 'inelastic' ? 0 : S.e);
      function post() {
        const e = eff(), M = S.m1 + S.m2, p = S.m1 * S.v1 + S.m2 * S.v2;
        return [(p - S.m2 * e * (S.v1 - S.v2)) / M, (p + S.m1 * e * (S.v1 - S.v2)) / M];
      }
      function reset() {
        t = 0; x1 = X1_0; x2 = X2_0; u1 = S.v1; u2 = S.v2; collided = false; tc = null; hist = [[0, x1, x2]]; done = false;
        transport.setRunning(true);
      }
      // 精确事件推进：在步长内若发生接触，先推进到接触时刻再交换速度
      function advance(dt) {
        let rem = dt;
        for (let k = 0; k < 3 && rem > 0; k++) {
          const gap = (x2 - w2() / 2) - (x1 + w1() / 2), rel = u1 - u2;
          if (!collided && rel > 1e-12 && gap <= rel * rem + 1e-12) {
            const tt = Math.max(0, gap / rel);
            x1 += u1 * tt; x2 += u2 * tt; t += tt; rem -= tt;
            const [a, b] = post(); u1 = a; u2 = b; collided = true; tc = t;
            continue;
          }
          x1 += u1 * rem; x2 += u2 * rem; t += rem; rem = 0;
        }
        // 完全非弹性碰撞后一起运动
        if (collided && eff() === 0) x2 = x1 + w1() / 2 + w2() / 2;
        // 跑出导轨或已远离 → 停止
        if (x1 - w1() / 2 <= 0 || x2 + w2() / 2 >= TRACK || t > 12) {
          done = true;
          const sh = x1 - w1() / 2 < 0 ? -(x1 - w1() / 2) : x2 + w2() / 2 > TRACK ? TRACK - (x2 + w2() / 2) : 0;
          // 回退到恰好到达导轨端点的时刻
          if (sh) { const u = sh < 0 ? u2 : u1, back = u ? sh / u : 0; x1 += u1 * back; x2 += u2 * back; t += back; }
        }
      }

      // ---------- 面板 ----------
      const P = kit.panel;
      const sl = (key, label, min, max, step, unit) => GW.ui.slider({ label, min, max, step, value: S[key], unit, onInput: (v) => { S[key] = v; save(); reset(); } });
      const typeSeg = GW.ui.segmented({ options: [{ value: 'elastic', label: '弹性' }, { value: 'inelastic', label: '完全非弹性' }, { value: 'e', label: '恢复系数 e' }], value: S.type, onChange: (v) => { S.type = v; eS.el.style.display = v === 'e' ? '' : 'none'; save(); reset(); } });
      const eS = sl('e', '恢复系数 e', 0, 1, 0.05, '');
      eS.el.style.display = S.type === 'e' ? '' : 'none';
      const transport = GW.simKit.transport(kit, () => reset());
      const spSeg = GW.ui.segmented({ options: [{ value: 0.25, label: '×0.25' }, { value: 0.5, label: '×0.5' }, { value: 1, label: '×1' }], value: S.speed, onChange: (v) => { S.speed = v; save(); } });
      const xtT = GW.ui.toggle({ label: '显示 x-t 图像', value: S.xt, onChange: (v) => { S.xt = v; save(); } });
      const R = {};
      const ro = (k, l) => (R[k] = GW.ui.readout(l)).el;
      const preset = (label, o) => GW.ui.button({ label, onClick: () => { Object.assign(S, o); m1S.set(S.m1); m2S.set(S.m2); v1S.set(S.v1); v2S.set(S.v2); typeSeg.set(S.type); eS.el.style.display = S.type === 'e' ? '' : 'none'; save(); reset(); } }).el;
      const m1S = sl('m1', '滑块 1 质量 m₁', 0.5, 5, 0.1, 'kg'), m2S = sl('m2', '滑块 2 质量 m₂', 0.5, 5, 0.1, 'kg');
      const v1S = sl('v1', '滑块 1 初速度 v₁', -4, 4, 0.1, 'm/s'), v2S = sl('v2', '滑块 2 初速度 v₂', -4, 4, 0.1, 'm/s');
      P.append(
        GW.ui.group('控制', transport.el, GW.h('div', { style: { fontSize: '12px', color: '#5b6576' } }, '慢放'), spSeg.el),
        GW.ui.group('碰撞类型', typeSeg.el, eS.el),
        GW.ui.group('参数（向右为正方向）', m1S.el, v1S.el, m2S.el, v2S.el),
        GW.ui.group('典型情形', GW.h('div', { class: 'gw-row' }, preset('等质量交换速度', { m1: 1, m2: 1, v1: 3, v2: 0, type: 'elastic' }), preset('大碰小', { m1: 4, m2: 1, v1: 3, v2: 0, type: 'elastic' })),
          GW.h('div', { class: 'gw-row' }, preset('小碰大', { m1: 1, m2: 4, v1: 3, v2: 0, type: 'elastic' }), preset('粘合', { m1: 2, m2: 2, v1: 3, v2: -1, type: 'inelastic' }))),
        GW.ui.group('读数', ro('p0', '碰前总动量'), ro('p1', '碰后总动量'), ro('E0', '碰前总动能'), ro('E1', '碰后总动能'), ro('dE', '动能损失'), ro('u1', '碰后 v₁′'), ro('u2', '碰后 v₂′')),
        GW.ui.group('显示', xtT.el),
      );

      // ---------- 绘制 ----------
      let W, H, TX0, TS;
      const tx = (x) => TX0 + x * TS;
      function drawTrack(y) {
        // 导轨
        g2.fillStyle = '#eef1f5'; g2.fillRect(tx(0) - 10, y, TRACK * TS + 20, 18);
        g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.strokeRect(tx(0) - 10, y, TRACK * TS + 20, 18);
        g2.fillStyle = '#c4cbd6';
        for (let x = 0.1; x < TRACK; x += 0.2) { g2.beginPath(); g2.arc(tx(x), y + 9, 2, 0, 7); g2.fill(); }
        g2.fillStyle = '#d9dee6'; g2.fillRect(tx(0) - 22, y - 30, 12, 60); g2.fillRect(tx(TRACK) + 10, y - 30, 12, 60);
        g2.strokeRect(tx(0) - 22, y - 30, 12, 60); g2.strokeRect(tx(TRACK) + 10, y - 30, 12, 60);
        // 刻度
        g2.font = '15px ' + SANS; g2.fillStyle = '#5b6576'; g2.textAlign = 'center'; g2.textBaseline = 'top';
        for (let x = 0; x <= TRACK; x++) { g2.fillRect(tx(x) - 1, y + 18, 2, 6); g2.fillText(x, tx(x), y + 26); }
        label(g2, 'x/m', tx(TRACK) + 34, y + 34, { color: '#5b6576' });
        label(g2, '气垫导轨（摩擦不计）', tx(0), y + 56, { color: '#5b6576' });
      }
      function block(xc, w, m, col, name, v, y) {
        const hgt = 34 + 7 * m, X = tx(xc - w / 2), Wd = w * TS;
        g2.fillStyle = col; g2.globalAlpha = 0.9; g2.fillRect(X, y - hgt, Wd, hgt); g2.globalAlpha = 1;
        g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.strokeRect(X, y - hgt, Wd, hgt);
        rich(g2, name, X + Wd / 2, y - hgt / 2 - 8, { align: 'center', size: 17, weight: 'bold', color: '#fff', halo: false });
        label(g2, m.toFixed(1) + ' kg', X + Wd / 2, y - hgt / 2 + 12, { align: 'center', size: 15, color: '#fff', halo: false });
        // 速度矢量
        if (Math.abs(v) > 0.02) {
          const pv = post(), vm = Math.max(Math.abs(S.v1), Math.abs(S.v2), Math.abs(pv[0]), Math.abs(pv[1]), 0.5), L = v * Math.min(30, 85 / vm), yv = y - hgt - 22, x0 = X + Wd / 2;
          GW.draw.arrow(g2, x0, yv, x0 + L, yv, { color: col === C.cyan ? '#0b7a6b' : '#c43d17', width: 3, head: 11 });
          label(g2, Math.abs(v).toFixed(2) + ' m/s', x0 + L / 2, yv - 17, { align: 'center', size: 15 });
        } else label(g2, '静止', X + Wd / 2, y - hgt - 18, { align: 'center', color: '#5b6576' });
      }
      function bars(x, y, w, h, title, vals, unit, signed) {
        // vals: [[label, value, color], ...]
        label(g2, title, x, y + 2, { weight: 'bold' });
        const top = y + 44, bot = y + h - 26, n = vals.length;
        let vmax = 1e-9; vals.forEach((v) => (vmax = Math.max(vmax, Math.abs(v[1]))));
        const zero = signed ? (top + bot) / 2 : bot, hh = signed ? (bot - top) / 2 - 16 : bot - top - 18;
        g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(x, zero); g2.lineTo(x + w, zero); g2.stroke();
        const bw = Math.min(46, w / (n * 1.6)), gap = (w - n * bw) / (n + 1);
        vals.forEach(([lab, v, col, sep], i) => {
          const bx = x + gap + i * (bw + gap) + (sep ? gap * 0.25 : 0), bh = v / vmax * hh;
          g2.fillStyle = col; g2.globalAlpha = 0.85; g2.fillRect(bx, zero - Math.max(bh, 0), bw, Math.abs(bh)); g2.globalAlpha = 1;
          if (bh < 0) g2.fillRect(bx, zero, 0, 0);
          if (bh < 0) { g2.fillStyle = col; g2.globalAlpha = 0.85; g2.fillRect(bx, zero, bw, -bh); g2.globalAlpha = 1; }
          g2.strokeStyle = col; g2.lineWidth = 2; g2.strokeRect(bx, Math.min(zero, zero - bh), bw, Math.abs(bh));
          label(g2, v.toFixed(2), bx + bw / 2, zero - bh + (bh >= 0 ? -11 : 11), { align: 'center', size: 15 });
          rich(g2, lab, bx + bw / 2, bot + 14, { align: 'center', size: 15 });
        });
        label(g2, unit, x + w, y + 2, { align: 'right', color: '#5b6576' });
      }
      function drawXT(x, y, w, h) {
        label(g2, '位移-时间图像（x-t）', x, y + 2, { weight: 'bold' });
        const tmax = Math.max(4, Math.ceil(t + 0.5));
        const ax = x + 30, ay = y + h - 20, aw = w - 50, ah = h - 46;
        const sx = aw / tmax, sy = ah / TRACK;
        g2.save(); g2.strokeStyle = 'rgba(27,36,51,0.07)'; g2.lineWidth = 1; g2.font = '15px ' + SANS; g2.fillStyle = '#5b6576';
        const stT = niceStep(sx, 40);
        for (let v = stT; v <= tmax + 1e-9; v += stT) { const X = ax + v * sx; g2.beginPath(); g2.moveTo(X, ay); g2.lineTo(X, ay - ah); g2.stroke(); g2.textAlign = 'center'; g2.textBaseline = 'top'; g2.fillText(+v.toFixed(2), X, ay + 3); }
        for (let v = 2; v <= TRACK; v += 2) { const Y = ay - v * sy; g2.beginPath(); g2.moveTo(ax, Y); g2.lineTo(ax + aw, Y); g2.stroke(); g2.textAlign = 'right'; g2.textBaseline = 'middle'; g2.fillText(v, ax - 5, Y); }
        g2.restore();
        GW.draw.arrow(g2, ax, ay, ax + aw + 12, ay, { color: C.ink, width: 2 });
        GW.draw.arrow(g2, ax, ay, ax, ay - ah - 10, { color: C.ink, width: 2 });
        rich(g2, 't', ax + aw + 4, ay - 14, { size: 16 }); label(g2, '/s', ax + aw + 10, ay - 14);
        rich(g2, 'x', ax + 8, ay - ah - 6, { size: 16 }); label(g2, '/m', ax + 16, ay - ah - 6);
        g2.save(); g2.beginPath(); g2.rect(ax, ay - ah - 4, aw + 4, ah + 4); g2.clip();
        [[1, C.cyan], [2, C.red]].forEach(([k, col]) => {
          g2.strokeStyle = col; g2.lineWidth = 3; g2.beginPath();
          hist.forEach((hh, i) => { const X = ax + hh[0] * sx, Y = ay - hh[k] * sy; i ? g2.lineTo(X, Y) : g2.moveTo(X, Y); });
          g2.stroke();
        });
        if (tc != null) {
          const X = ax + tc * sx;
          g2.strokeStyle = C.gold; g2.setLineDash([5, 4]); g2.lineWidth = 2; g2.beginPath(); g2.moveTo(X, ay); g2.lineTo(X, ay - ah); g2.stroke();
        }
        g2.restore();
        if (tc != null) label(g2, '碰撞', ax + tc * sx + 4, ay - ah + 6, { color: '#b87400' });
        rich(g2, '滑块1', ax + aw - 50, ay - 40, { color: C.cyan, italic: false, family: SANS, size: 15 });
        rich(g2, '滑块2', ax + aw - 50, ay - 20, { color: C.red, italic: false, family: SANS, size: 15 });
      }

      kit.loop((dt) => {
        const sz = kit.size(); W = sz.w; H = sz.h;
        if (!W) return;
        TX0 = 50; TS = (W - 120) / TRACK;
        if (kit.running && !done) {
          const T = dt * S.speed, n = Math.max(1, Math.ceil(T / 0.002));
          for (let i = 0; i < n && !done; i++) advance(T / n);
          hist.push([t, x1, x2]);
        }
        if (done && kit.running) transport.setRunning(false);
        kit.background();
        const ty = 205;
        drawTrack(ty);
        block(x1, w1(), S.m1, C.cyan, 'm_1', u1, ty);
        block(x2, w2(), S.m2, C.red, 'm_2', u2, ty);
        GW.draw.arrow(g2, W - 140, 26, W - 80, 26, { color: C.ink, width: 2 }); label(g2, '正方向', W - 74, 26);
        label(g2, 't = ' + t.toFixed(2) + ' s', 16, 22, { weight: 'bold', size: 17 });
        label(g2, collided ? '碰撞后' : '碰撞前', 16, 48, { color: collided ? C.red : C.cyan, weight: 'bold' });

        const willHit = S.v1 > S.v2;
        const [a, b] = willHit ? post() : [S.v1, S.v2];
        const p1 = S.m1 * S.v1, p2 = S.m2 * S.v2, q1 = S.m1 * a, q2 = S.m2 * b;
        const E1 = 0.5 * S.m1 * S.v1 * S.v1, E2 = 0.5 * S.m2 * S.v2 * S.v2, F1 = 0.5 * S.m1 * a * a, F2 = 0.5 * S.m2 * b * b;
        const by = 300, bh = H - by - 10;
        const panels = S.xt ? 3 : 2, pw = (W - 40) / panels;
        bars(20, by, pw - 30, bh, '动量 p', [['p_1', p1, C.cyan], ['p_2', p2, C.red], ['p_总', p1 + p2, C.gold], ['p_1′', q1, C.cyan, 1], ['p_2′', q2, C.red, 1], ['p_总′', q1 + q2, C.gold, 1]], 'kg·m/s', true);
        bars(20 + pw, by, pw - 30, bh, '动能 E_k', [['E_1', E1, C.cyan], ['E_2', E2, C.red], ['E_总', E1 + E2, C.gold], ['E_1′', F1, C.cyan, 1], ['E_2′', F2, C.red, 1], ['E_总′', F1 + F2, C.gold, 1]], 'J', false);
        // 碰前/碰后分隔
        [20, 20 + pw].forEach((x0) => {
          const xm = x0 + (pw - 30) / 2;
          g2.save(); g2.strokeStyle = '#c4cbd6'; g2.setLineDash([4, 4]); g2.lineWidth = 1.5; g2.beginPath(); g2.moveTo(xm, by + 40); g2.lineTo(xm, by + bh - 34); g2.stroke(); g2.restore();
          label(g2, '碰前', x0 + (pw - 30) / 4, by + 28, { align: 'center', color: '#5b6576' });
          label(g2, '碰后', x0 + 3 * (pw - 30) / 4, by + 28, { align: 'center', color: '#5b6576' });
        });
        if (S.xt) drawXT(20 + 2 * pw, by, pw - 10, bh);

        R.p0.set((p1 + p2).toFixed(3) + ' kg·m/s'); R.p1.set((q1 + q2).toFixed(3) + ' kg·m/s');
        R.E0.set((E1 + E2).toFixed(3) + ' J'); R.E1.set((F1 + F2).toFixed(3) + ' J');
        const loss = E1 + E2 - (F1 + F2);
        R.dE.set(Math.max(0, loss).toFixed(3) + ' J（' + ((E1 + E2) > 0 ? (Math.max(0, loss) / (E1 + E2) * 100).toFixed(1) : '0.0') + '%）');
        R.u1.set(willHit ? a.toFixed(3) + ' m/s' : '不会相碰'); R.u2.set(willHit ? b.toFixed(3) + ' m/s' : '不会相碰');
        if (!willHit) label(g2, 'v₁ ≤ v₂，两滑块不会相碰', W / 2, 90, { align: 'center', color: C.red, weight: 'bold' });
      });
      reset();
      return { destroy() { kit.destroy(); } };
    },
  });
})();
