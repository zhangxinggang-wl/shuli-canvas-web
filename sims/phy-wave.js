/* 数理无限画布 · 高中物理 · 机械波（横波传播 / 波的叠加 / 驻波 / 双波源干涉） */
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
    id: 'phy-wave', name: '机械波', category: 'physics', group: '振动与波',
    desc: '横波的形成与传播、波形图与振动图像对照、波的叠加、驻波与双波源干涉',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0 3.5-4 5-2"/><circle cx="4.5" cy="8" r="1" fill="currentColor"/><path d="M4.5 10.5V5.5" /></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      const D = { mode: 'trav', lam: 4, T: 2, A: 6, dir: 'right', sel: 12, showArr: true,
        A1: 6, A2: 4, pw: 2, pv: 2, showComp: true, sLam: 4, sT: 2, sA: 4, sComp: true,
        iLam: 3, iD: 8, iShade: true, iCirc: true, iLines: true, iDots: false, iAnti: false, speed: 1 };
      for (const k in D) if (S[k] === undefined) S[k] = D[k];
      const save = () => ctx.save();
      const kit = GW.simKit.layout(ctx.root);
      const g2 = kit.ctx2d;
      const LM = 12, NP = 49; // 介质长度 12 m，49 个质点（间隔 0.25 m）
      let t = 0, frozen = null;

      // ---------- 面板 ----------
      const P = kit.panel;
      const box = () => GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
      const modeSel = GW.ui.select({ label: '演示内容', value: S.mode, options: [{ value: 'trav', label: '① 横波的传播' }, { value: 'sup', label: '② 两列波的叠加' }, { value: 'stand', label: '③ 驻波' }, { value: 'intf', label: '④ 双波源干涉' }], onChange: (v) => { S.mode = v; save(); reset(); sync(); } });
      const sl = (key, label, min, max, step, unit, after) => GW.ui.slider({ label, min, max, step, value: S[key], unit, onInput: (v) => { S[key] = v; save(); after && after(); } });
      const tg = (key, label, after) => GW.ui.toggle({ label, value: S[key], onChange: (v) => { S[key] = v; save(); after && after(); } });
      const R = {};
      const ro = (k, l) => (R[k] = GW.ui.readout(l)).el;
      const transport = GW.simKit.transport(kit, () => reset());
      const spSeg = GW.ui.segmented({ options: [{ value: 0.25, label: '×0.25' }, { value: 0.5, label: '×0.5' }, { value: 1, label: '×1' }], value: S.speed, onChange: (v) => { S.speed = v; save(); } });

      // ① 横波
      const bTrav = box();
      const dirSeg = GW.ui.segmented({ options: [{ value: 'right', label: '向右传播 →' }, { value: 'left', label: '← 向左传播' }], value: S.dir, onChange: (v) => { S.dir = v; save(); reset(); } });
      const freezeB = GW.ui.button({ label: '❄ 冻结此刻波形', primary: true, onClick: () => { frozen = t; transport.setRunning(false); } });
      const unfreezeB = GW.ui.button({ label: '清除冻结', onClick: () => { frozen = null; } });
      bTrav.append(
        GW.ui.group('传播方向', dirSeg.el),
        GW.ui.group('参数', sl('lam', '波长 λ', 1, 6, 0.5, 'm', reset).el, sl('T', '周期 T', 0.5, 4, 0.1, 's', reset).el, sl('A', '振幅 A', 2, 9, 0.5, 'cm').el),
        GW.ui.group('波形图与振动图像', freezeB.el, unfreezeB.el, tg('showArr', '质点振动方向箭头').el,
          GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: 1.5 } }, '点击上方任一质点，下方画出它的振动图像（y-t）。')),
        GW.ui.group('读数', ro('lam', '波长 λ'), ro('T', '周期 T'), ro('f', '频率 f = 1/T'), ro('v', '波速 v = λ/T'), ro('px', '所选质点 P 平衡位置'), ro('py', '质点 P 位移 y')),
      );
      // ② 叠加
      const bSup = box();
      bSup.append(
        GW.ui.group('两个脉冲', sl('A1', '脉冲 1 振幅 A₁（向右传）', -8, 8, 0.5, 'cm', reset).el, sl('A2', '脉冲 2 振幅 A₂（向左传）', -8, 8, 0.5, 'cm', reset).el,
          sl('pw', '脉冲宽度', 1, 4, 0.25, 'm', reset).el, sl('pv', '波速 v', 0.5, 4, 0.25, 'm/s', reset).el, tg('showComp', '显示两列分波（虚线）').el,
          GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: 1.5 } }, '振幅取负值表示脉冲在平衡位置下方。相遇时 y = y₁ + y₂，分离后各自保持原状继续传播。')),
        GW.ui.group('读数', ro('st', '时间 t'), ro('ymax', '合位移最大值')),
      );
      // ③ 驻波
      const bStand = box();
      bStand.append(
        GW.ui.group('参数', sl('sLam', '波长 λ', 2, 8, 0.5, 'm').el, sl('sT', '周期 T', 0.5, 4, 0.1, 's').el, sl('sA', '每列波振幅 A', 2, 5, 0.5, 'cm').el, tg('sComp', '显示两列反向行波（虚线）').el),
        GW.ui.group('读数', ro('sd', '相邻波节间距'), ro('sAmp', '波腹振幅'), ro('sv', '行波波速')),
      );
      // ④ 干涉
      const bIntf = box();
      const iDS = sl('iD', '波源间距 d', 2, 14, 0.5, 'cm');
      bIntf.append(
        GW.ui.group('参数', sl('iLam', '波长 λ', 1.5, 5, 0.1, 'cm').el, iDS.el, tg('iAnti', 'S₂ 与 S₁ 反相').el),
        GW.ui.group('显示', tg('iCirc', '波峰（实线）/波谷（虚线）').el, tg('iLines', '振动加强线 / 减弱线').el, tg('iDots', '标出加强点●与减弱点○').el, tg('iShade', '水面位移着色').el,
          GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: 1.5 } }, '波峰与波峰、波谷与波谷相遇处振动加强；波峰与波谷相遇处振动减弱。可拖动波源调节间距。')),
        GW.ui.group('读数', ro('in', '加强线条数'), ro('id', '路程差条件')),
      );
      P.append(GW.ui.group('', modeSel.el), GW.ui.group('控制', transport.el, GW.h('div', { style: { fontSize: '12px', color: '#5b6576' } }, '慢放'), spSeg.el), bTrav, bSup, bStand, bIntf);
      function sync() {
        bTrav.style.display = S.mode === 'trav' ? 'flex' : 'none';
        bSup.style.display = S.mode === 'sup' ? 'flex' : 'none';
        bStand.style.display = S.mode === 'stand' ? 'flex' : 'none';
        bIntf.style.display = S.mode === 'intf' ? 'flex' : 'none';
      }
      function reset() { t = 0; frozen = null; transport.setRunning(true); }
      sync();

      // ---------- 公共坐标 ----------
      let W = 0, H = 0, X0 = 60, X1 = 0, SX = 1;
      let SY = 7; // 每厘米像素
      const px = (x) => X0 + x * SX;

      function axesXY(yc, yLab, xLab, unitX, maxX, step, ext) {
        g2.save();
        g2.strokeStyle = 'rgba(27,36,51,0.07)'; g2.lineWidth = 1;
        for (let v = step; v <= maxX + 1e-9; v += step) { const x = X0 + v * SX * (ext || 1); g2.beginPath(); g2.moveTo(x, yc - 75); g2.lineTo(x, yc + 75); g2.stroke(); }
        g2.font = '15px ' + SANS; g2.fillStyle = '#5b6576'; g2.textAlign = 'center'; g2.textBaseline = 'top';
        for (let v = step; v <= maxX + 1e-9; v += step) { const x = X0 + v * SX * (ext || 1); if (x < X1 - 20) g2.fillText(+v.toFixed(2), x, yc + 5); }
        g2.restore();
        GW.draw.arrow(g2, X0 - 10, yc, X1 + 18, yc, { color: C.ink, width: 2 });
        GW.draw.arrow(g2, X0, yc + 80, X0, yc - 86, { color: C.ink, width: 2 });
        rich(g2, xLab, X1 + 2, yc - 16, { size: 16 }); label(g2, unitX, X1 + 11, yc - 16);
        rich(g2, 'y', X0 + 10, yc - 82, { size: 16 }); label(g2, '/cm', X0 + 19, yc - 82);
        label(g2, 'O', X0 - 12, yc + 12, { align: 'center' });
      }
      function yTicks(yc, A) {
        g2.save(); g2.font = '15px ' + SANS; g2.fillStyle = '#5b6576'; g2.textAlign = 'right'; g2.textBaseline = 'middle';
        [A, -A].forEach((v) => { const y = yc - v * SY; g2.fillText(+v.toFixed(1), X0 - 6, y); g2.fillRect(X0 - 3, y - 1, 6, 2); });
        g2.restore();
      }
      function curve(fn, color, width, dash, x0, x1) {
        g2.save(); g2.strokeStyle = color; g2.lineWidth = width; g2.lineJoin = 'round'; if (dash) g2.setLineDash(dash);
        g2.beginPath();
        const n = 400;
        for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, p = fn(x); i ? g2.lineTo(p[0], p[1]) : g2.moveTo(p[0], p[1]); }
        g2.stroke(); g2.restore();
      }
      function dot(x, y, r, fill, stroke) { g2.fillStyle = fill; g2.strokeStyle = stroke || C.ink; g2.lineWidth = 2; g2.beginPath(); g2.arc(x, y, r, 0, 7); g2.fill(); g2.stroke(); }

      // ---------- ① 横波 ----------
      // 波源 t=0 从平衡位置开始向上振动：y_S = A sin(ωt)；距波源 s 的质点：t ≥ s/v 时 y = A sin ω(t − s/v)
      function travY(x, tt) {
        const v = S.lam / S.T, s = S.dir === 'right' ? x : LM - x, tau = tt - s / v;
        return tau < 0 ? 0 : S.A * Math.sin(2 * Math.PI * tau / S.T);
      }
      function travVy(x, tt) {
        const v = S.lam / S.T, s = S.dir === 'right' ? x : LM - x, tau = tt - s / v;
        return tau < 0 ? 0 : S.A * 2 * Math.PI / S.T * Math.cos(2 * Math.PI * tau / S.T);
      }
      function drawTrav() {
        const yc = 175, yv = H - 125;
        label(g2, '波形图（某时刻各质点的位移 y-x）', X0, 22, { weight: 'bold' });
        axesXY(yc, 'y', 'x', '/m', LM, 1);
        yTicks(yc, S.A);
        const v = S.lam / S.T, front = Math.min(LM, v * t);
        // 波源
        const sx = S.dir === 'right' ? px(0) : px(LM);
        g2.fillStyle = '#5b6576'; g2.fillRect(sx - 3, yc + 48, 6, 30);
        label(g2, '波源 S', sx, yc + 92, { align: 'center', color: '#5b6576' });
        // 冻结的波形
        if (frozen != null) curve((x) => [px(x), yc - travY(x, frozen) * SY], C.gold, 3, [8, 5], 0, LM);
        // 波形（实时）
        curve((x) => [px(x), yc - travY(x, t) * SY], 'rgba(15,157,138,0.55)', 2.5, null, 0, LM);
        // λ 标注：在已形成的波中找相邻两个波峰
        const wavePart = Math.min(LM, v * t);
        if (wavePart > 1.25 * S.lam) {
          // 右传：相位 φ = ω(t − x/v)，波峰 φ = π/2 + 2πn → x = v(t − T/4 − nT)
          let best = null;
          for (let n = 0; n < 40; n++) {
            const s = v * (t - S.T / 4 - n * S.T);
            if (s < 0) break;
            const s2 = s - S.lam;
            if (s2 >= 0 && s <= LM) { best = [s2, s]; if (s2 < LM * 0.55) break; }
          }
          if (best) {
            let [a, b] = best;
            if (S.dir === 'left') { a = LM - a; b = LM - b; }
            const xa = px(Math.min(a, b)), xb = px(Math.max(a, b)), y = yc - S.A * SY - 18;
            g2.save(); g2.strokeStyle = C.red; g2.lineWidth = 1.5; g2.setLineDash([3, 3]);
            g2.beginPath(); g2.moveTo(xa, y - 6); g2.lineTo(xa, yc - S.A * SY); g2.moveTo(xb, y - 6); g2.lineTo(xb, yc - S.A * SY); g2.stroke(); g2.restore();
            GW.draw.arrow(g2, (xa + xb) / 2, y, xa, y, { color: C.red, width: 2, head: 8 });
            GW.draw.arrow(g2, (xa + xb) / 2, y, xb, y, { color: C.red, width: 2, head: 8 });
            rich(g2, 'λ', (xa + xb) / 2, y - 12, { color: C.red, align: 'center', size: 17 });
          }
        }
        // 传播方向
        const ax = S.dir === 'right' ? X1 - 150 : X0 + 160;
        GW.draw.arrow(g2, ax, 52, ax + (S.dir === 'right' ? 70 : -70), 52, { color: C.blue, width: 3 });
        rich(g2, 'v', ax + (S.dir === 'right' ? 82 : -86), 52, { color: C.blue, weight: 'bold', size: 18 });
        label(g2, '传播方向', ax + (S.dir === 'right' ? 35 : -35), 34, { align: 'center', color: C.blue });
        // 质点
        for (let i = 0; i < NP; i++) {
          const x = i * LM / (NP - 1), X = px(x), y = travY(x, t), Y = yc - y * SY;
          g2.fillStyle = 'rgba(27,36,51,0.18)'; g2.beginPath(); g2.arc(X, yc, 2, 0, 7); g2.fill();
          const mark = i % 4 === 0;
          if (i === S.sel) continue;
          dot(X, Y, mark ? 5.5 : 4, mark ? C.cyan : '#fff', mark ? C.ink : '#5b6576');
          if (mark && S.showArr) {
            const vy = travVy(x, t), L = 30 * vy / (S.A * 2 * Math.PI / S.T);
            if (Math.abs(L) > 4) GW.draw.arrow(g2, X, Y - Math.sign(L) * 7, X, Y - Math.sign(L) * 7 - L, { color: C.red, width: 2.5, head: 8 });
          }
        }
        // 选中质点 P
        const xp = S.sel * LM / (NP - 1), Xp = px(xp), Yp = yc - travY(xp, t) * SY;
        dot(Xp, Yp, 7.5, C.red);
        { const vy = travVy(xp, t), L = 30 * vy / (S.A * 2 * Math.PI / S.T); if (S.showArr && Math.abs(L) > 4) GW.draw.arrow(g2, Xp, Yp - Math.sign(L) * 9, Xp, Yp - Math.sign(L) * 9 - L, { color: C.red, width: 3, head: 9 }); }
        rich(g2, 'P', Xp + 12, Yp - 14, { color: C.red, weight: 'bold', size: 17 });
        g2.save(); g2.strokeStyle = 'rgba(228,87,46,0.35)'; g2.setLineDash([4, 4]); g2.lineWidth = 1.5;
        g2.beginPath(); g2.moveTo(Xp, yc + 75); g2.lineTo(Xp, yv - 90); g2.stroke(); g2.restore();
        // 波前
        if (front < LM) { const xf = S.dir === 'right' ? px(front) : px(LM - front); label(g2, '波前', xf, yc + 24, { align: 'center', color: '#5b6576' }); }
        if (frozen != null) label(g2, '黄色虚线：t = ' + frozen.toFixed(2) + ' s 时的波形图', X1 - 4, yc + 110, { align: 'right', color: '#b87400' });

        // 振动图像
        const tw = Math.max(4 * S.T, 6), t0 = Math.max(0, t - 0.8 * tw), st = niceStep((X1 - X0) / tw, 55);
        label(g2, '质点 P 的振动图像（位移随时间变化 y-t）', X0, yv - 108, { weight: 'bold', color: C.red });
        g2.save();
        g2.strokeStyle = 'rgba(27,36,51,0.07)'; g2.lineWidth = 1; g2.font = '15px ' + SANS; g2.fillStyle = '#5b6576'; g2.textAlign = 'center'; g2.textBaseline = 'top';
        const TX = (tt) => X0 + (tt - t0) / tw * (X1 - X0);
        for (let v2 = Math.ceil(t0 / st) * st; v2 <= t0 + tw; v2 += st) { const x = TX(v2); if (x <= X0 + 4) continue; g2.beginPath(); g2.moveTo(x, yv - 75); g2.lineTo(x, yv + 75); g2.stroke(); if (x < X1 - 20) g2.fillText(+v2.toFixed(2), x, yv + 5); }
        g2.restore();
        GW.draw.arrow(g2, X0 - 10, yv, X1 + 18, yv, { color: C.ink, width: 2 });
        GW.draw.arrow(g2, X0, yv + 80, X0, yv - 86, { color: C.ink, width: 2 });
        rich(g2, 't', X1 + 4, yv - 16, { size: 16 }); label(g2, '/s', X1 + 10, yv - 16);
        rich(g2, 'y', X0 + 10, yv - 82, { size: 16 }); label(g2, '/cm', X0 + 19, yv - 82);
        yTicks(yv, S.A);
        curve((tt) => [TX(tt), yv - travY(xp, tt) * SY], C.red, 3, null, t0, t);
        dot(TX(t), yv - travY(xp, t) * SY, 6, C.red);
        if (frozen != null && frozen >= t0) {
          const x = TX(frozen);
          g2.save(); g2.strokeStyle = C.gold; g2.lineWidth = 2; g2.setLineDash([6, 4]); g2.beginPath(); g2.moveTo(x, yv - 80); g2.lineTo(x, yv + 75); g2.stroke(); g2.restore();
          dot(x, yv - travY(xp, frozen) * SY, 6, C.gold);
          label(g2, 't = ' + frozen.toFixed(2) + ' s', x + 6, yv + 62, { color: '#b87400' });
        }
        R.lam.set(S.lam.toFixed(1) + ' m'); R.T.set(S.T.toFixed(1) + ' s'); R.f.set((1 / S.T).toFixed(3) + ' Hz'); R.v.set((S.lam / S.T).toFixed(2) + ' m/s');
        R.px.set('x = ' + xp.toFixed(2) + ' m'); R.py.set(travY(xp, t).toFixed(2) + ' cm');
      }

      // ---------- ② 叠加 ----------
      function pulse(x, xc, A, w) { const d = x - xc; return Math.abs(d) < w / 2 ? A * Math.cos(Math.PI * d / w) ** 2 : 0; }
      function drawSup() {
        const yc = H / 2 - 20;
        const c1 = -S.pw / 2 + 1 + S.pv * t, c2 = LM + S.pw / 2 - 1 - S.pv * t;
        const y1 = (x) => pulse(x, c1, S.A1, S.pw), y2 = (x) => pulse(x, c2, S.A2, S.pw);
        if (c1 - S.pw / 2 > LM + 0.5 && kit.running) transport.setRunning(false);
        label(g2, '两列波的叠加：y = y₁ + y₂', X0, 30, { weight: 'bold' });
        axesXY(yc, 'y', 'x', '/m', LM, 1);
        yTicks(yc, Math.max(Math.abs(S.A1), Math.abs(S.A2), 0.5));
        const Am = Math.max(Math.abs(S.A1), Math.abs(S.A2), 0.5);
        if (S.showComp) {
          curve((x) => [px(x), yc - y1(x) * SY], C.blue, 2.5, [7, 5], GW.clamp(c1 - S.pw / 2, 0, LM), GW.clamp(c1 + S.pw / 2, 0, LM));
          curve((x) => [px(x), yc - y2(x) * SY], C.red, 2.5, [7, 5], GW.clamp(c2 - S.pw / 2, 0, LM), GW.clamp(c2 + S.pw / 2, 0, LM));
        }
        curve((x) => [px(x), yc - (y1(x) + y2(x)) * SY], C.cyan, 3.5, null, 0, LM);
        let ym = 0;
        for (let i = 0; i < NP; i++) { const x = i * LM / (NP - 1), y = y1(x) + y2(x); dot(px(x), yc - y * SY, 4, '#fff', '#5b6576'); }
        for (let i = 0; i <= 600; i++) { const x = i * LM / 600, y = y1(x) + y2(x); if (Math.abs(y) > Math.abs(ym)) ym = y; }
        // 传播方向标签
        const lab = (c, A, col, dir, name) => {
          if (c < -S.pw || c > LM + S.pw) return;
          const X = px(GW.clamp(c, 0.3, LM - 0.3)), Y = yc - A * SY + (A >= 0 ? -30 : 30);
          GW.draw.arrow(g2, X - dir * 22, Y, X + dir * 22, Y, { color: col, width: 2.5 });
          rich(g2, name, X, Y + (A >= 0 ? -18 : 18), { color: col, align: 'center', size: 16 });
        };
        lab(c1, S.A1, C.blue, 1, 'y_1'); lab(c2, S.A2, C.red, -1, 'y_2');
        const overlap = Math.abs(c1 - c2) < S.pw;
        if (overlap) label(g2, '相遇区域：各质点位移等于两列波单独引起的位移的矢量和', W / 2, yc + 120, { align: 'center', color: C.cyan, weight: 'bold' });
        R.st.set(t.toFixed(2) + ' s'); R.ymax.set(ym.toFixed(2) + ' cm');
        void Am;
      }

      // ---------- ③ 驻波 ----------
      function drawStand() {
        const yc = H / 2 - 10, k = 2 * Math.PI / S.sLam, w = 2 * Math.PI / S.sT, A = S.sA;
        const yA = (x) => A * Math.sin(k * x - w * t), yB = (x) => A * Math.sin(k * x + w * t);
        label(g2, '驻波：两列振幅、频率相同、传播方向相反的波叠加 y = 2A sin kx · cos ωt', X0, 30, { weight: 'bold' });
        axesXY(yc, 'y', 'x', '/m', LM, 1);
        yTicks(yc, 2 * A);
        // 包络
        g2.save(); g2.fillStyle = 'rgba(15,157,138,0.07)'; g2.beginPath();
        for (let i = 0; i <= 400; i++) { const x = LM * i / 400; g2.lineTo(px(x), yc - 2 * A * Math.abs(Math.sin(k * x)) * SY); }
        for (let i = 400; i >= 0; i--) { const x = LM * i / 400; g2.lineTo(px(x), yc + 2 * A * Math.abs(Math.sin(k * x)) * SY); }
        g2.fill(); g2.restore();
        curve((x) => [px(x), yc - 2 * A * Math.abs(Math.sin(k * x)) * SY], 'rgba(15,157,138,0.35)', 1.5, [3, 4], 0, LM);
        curve((x) => [px(x), yc + 2 * A * Math.abs(Math.sin(k * x)) * SY], 'rgba(15,157,138,0.35)', 1.5, [3, 4], 0, LM);
        if (S.sComp) {
          curve((x) => [px(x), yc - yA(x) * SY], C.blue, 2, [7, 5], 0, LM);
          curve((x) => [px(x), yc - yB(x) * SY], C.red, 2, [7, 5], 0, LM);
          GW.draw.arrow(g2, X1 - 140, 62, X1 - 90, 62, { color: C.blue, width: 2.5 }); label(g2, '向右行波', X1 - 84, 62, { color: C.blue });
          GW.draw.arrow(g2, X1 - 90, 86, X1 - 140, 86, { color: C.red, width: 2.5 }); label(g2, '向左行波', X1 - 84, 86, { color: C.red });
        }
        curve((x) => [px(x), yc - (yA(x) + yB(x)) * SY], C.cyan, 3.5, null, 0, LM);
        for (let i = 0; i < NP; i++) { const x = i * LM / (NP - 1); dot(px(x), yc - (yA(x) + yB(x)) * SY, 4, '#fff', '#5b6576'); }
        // 波节 / 波腹
        for (let n = 0; n * S.sLam / 2 <= LM + 1e-9; n++) {
          const xn = n * S.sLam / 2, X = px(xn);
          dot(X, yc, 7, C.ink, C.ink);
          label(g2, '节', X, yc + 2 * A * SY + 34, { align: 'center', weight: 'bold' });
          const xa = xn + S.sLam / 4;
          if (xa <= LM) {
            const Xa = px(xa);
            g2.save(); g2.strokeStyle = 'rgba(228,87,46,0.6)'; g2.lineWidth = 1.5; g2.setLineDash([4, 4]);
            g2.beginPath(); g2.moveTo(Xa, yc - 2 * A * SY - 10); g2.lineTo(Xa, yc + 2 * A * SY + 10); g2.stroke(); g2.restore();
            label(g2, '腹', Xa, yc + 2 * A * SY + 34, { align: 'center', weight: 'bold', color: C.red });
          }
        }
        label(g2, '● 波节：始终静止    虚线处为波腹：振幅最大（2A）', X0, H - 40, { color: '#5b6576' });
        R.sd.set((S.sLam / 2).toFixed(2) + ' m（λ/2）'); R.sAmp.set((2 * A).toFixed(1) + ' cm（2A）'); R.sv.set((S.sLam / S.sT).toFixed(2) + ' m/s');
      }

      // ---------- ④ 干涉 ----------
      const off = document.createElement('canvas');
      const offc = off.getContext('2d');
      const IS = 22; // 像素/厘米
      function srcPos() { const cx = W / 2, cy = H / 2 + 10; return [[cx - S.iD / 2 * IS, cy], [cx + S.iD / 2 * IS, cy]]; }
      function drawIntf() {
        const lam = S.iLam, Tw = 1, v = lam / Tw, [s1, s2] = srcPos(), ph2 = S.iAnti ? Math.PI : 0;
        const front = v * t; // cm
        if (S.iShade) {
          const q = 3, w = Math.ceil(W / q), h = Math.ceil(H / q);
          if (off.width !== w || off.height !== h) { off.width = w; off.height = h; }
          const img = offc.createImageData(w, h), d = img.data, k = 2 * Math.PI / lam, om = 2 * Math.PI / Tw;
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const X = i * q + q / 2, Y = j * q + q / 2;
            const r1 = Math.hypot(X - s1[0], Y - s1[1]) / IS, r2 = Math.hypot(X - s2[0], Y - s2[1]) / IS;
            let z = 0;
            if (r1 < front) z += Math.sin(om * t - k * r1);
            if (r2 < front) z += Math.sin(om * t - k * r2 + ph2);
            const u = z / 2, a = Math.abs(u) * 0.42, p = (j * w + i) * 4;
            if (u > 0) { d[p] = 255 - a * (255 - 51); d[p + 1] = 255 - a * (255 - 102); d[p + 2] = 255; }
            else { d[p] = 255; d[p + 1] = 255 - a * (255 - 87); d[p + 2] = 255 - a * (255 - 46); }
            d[p + 3] = 255;
          }
          offc.putImageData(img, 0, 0);
          g2.imageSmoothingEnabled = true; g2.drawImage(off, 0, 0, w * q, h * q);
        }
        // 波峰 / 波谷圆：y = A sin(ωt − kr + φ)，波峰处相位 = π/2 + 2πn
        const circles = (s, phi) => {
          const res = { crest: [], trough: [] };
          for (let n = -2; n < 60; n++) {
            const rc = lam * (t / Tw - 0.25 - n + phi / (2 * Math.PI)), rt = rc - lam / 2;
            if (rc > 0 && rc < front) res.crest.push(rc);
            if (rt > 0 && rt < front) res.trough.push(rt);
          }
          return res;
        };
        const c1 = circles(s1, 0), c2 = circles(s2, ph2), maxR = Math.hypot(W, H) / IS;
        if (S.iCirc) {
          g2.save(); g2.lineWidth = 2;
          [[s1, c1], [s2, c2]].forEach(([s, c]) => {
            g2.strokeStyle = 'rgba(27,36,51,0.75)'; g2.setLineDash([]);
            c.crest.forEach((r) => { if (r < maxR) { g2.beginPath(); g2.arc(s[0], s[1], r * IS, 0, 7); g2.stroke(); } });
            g2.strokeStyle = 'rgba(27,36,51,0.55)'; g2.setLineDash([6, 6]);
            c.trough.forEach((r) => { if (r < maxR) { g2.beginPath(); g2.arc(s[0], s[1], r * IS, 0, 7); g2.stroke(); } });
          });
          g2.restore();
        }
        // 加强线 / 减弱线（双曲线 r₁ − r₂ = Δ）
        const dcm = S.iD, cx = W / 2, cy = s1[1];
        const strongD = [], weakD = [];
        for (let n = -20; n <= 20; n++) {
          const ds = (n + (S.iAnti ? 0.5 : 0)) * lam, dw = (n + (S.iAnti ? 0 : 0.5)) * lam;
          if (Math.abs(ds) < dcm) strongD.push(ds);
          if (Math.abs(dw) < dcm) weakD.push(dw);
        }
        const hyper = (delta) => {
          // 焦点 (±c, 0)，r₁ − r₂ = δ，S₁ 在左。δ>0 → 靠近 S₂（右支）
          const cc = dcm / 2, a = Math.abs(delta) / 2, b = Math.sqrt(Math.max(cc * cc - a * a, 1e-9)), sg = delta >= 0 ? 1 : -1;
          const pts = [];
          for (let i = -120; i <= 120; i++) {
            const u = i / 120 * 4;
            const x = a < 1e-9 ? 0 : sg * a * Math.cosh(u), y = (a < 1e-9 ? u * 6 : b * Math.sinh(u));
            pts.push([cx + x * IS, cy - y * IS]);
          }
          return pts;
        };
        if (S.iLines) {
          g2.save(); g2.lineWidth = 3;
          strongD.forEach((dl) => {
            const pts = hyper(dl);
            g2.strokeStyle = 'rgba(228,87,46,0.85)'; g2.setLineDash([]); g2.beginPath(); pts.forEach((p, i) => (i ? g2.lineTo(p[0], p[1]) : g2.moveTo(p[0], p[1]))); g2.stroke();
            const top = pts.find((p) => p[1] > 46) || pts[pts.length - 1];
            const tp = pts.slice().reverse().find((p) => p[1] < 40) ? pts.filter((p) => p[1] >= 40).pop() : null;
            const lp = tp || top;
            if (lp && lp[0] > 100 && lp[0] < W - 130) label(g2, '加强', lp[0], 28, { align: 'center', color: C.red, size: 15, weight: 'bold' });
          });
          g2.lineWidth = 2.5;
          weakD.forEach((dl) => {
            const pts = hyper(dl);
            g2.strokeStyle = 'rgba(51,102,255,0.85)'; g2.setLineDash([9, 6]); g2.beginPath(); pts.forEach((p, i) => (i ? g2.lineTo(p[0], p[1]) : g2.moveTo(p[0], p[1]))); g2.stroke();
            const lp = pts.filter((p) => p[1] >= 40).pop();
            if (lp && lp[0] > 110 && lp[0] < W - 20) label(g2, '减弱', lp[0], H - 26, { align: 'center', color: C.blue, size: 15, weight: 'bold' });
          });
          g2.restore();
        }
        // 交点：峰-峰 / 谷-谷（加强 ●），峰-谷（减弱 ○）
        if (S.iDots) {
          const meet = (ra, rb, fill) => {
            ra.forEach((r1) => rb.forEach((r2) => {
              const dd = dcm, x = (r1 * r1 - r2 * r2 + dd * dd) / (2 * dd), yy = r1 * r1 - x * x;
              if (yy < 0) return;
              const y = Math.sqrt(yy);
              [y, -y].forEach((yv) => {
                const X = s1[0] + x * IS, Y = s1[1] + yv * IS;
                if (X < 0 || X > W || Y < 0 || Y > H) return;
                g2.beginPath(); g2.arc(X, Y, 5, 0, 7);
                if (fill) { g2.fillStyle = C.red; g2.fill(); } else { g2.fillStyle = '#fff'; g2.fill(); g2.strokeStyle = C.blue; g2.lineWidth = 2.5; g2.stroke(); }
              });
            }));
          };
          meet(c1.crest, c2.crest, true); meet(c1.trough, c2.trough, true);
          meet(c1.crest, c2.trough, false); meet(c1.trough, c2.crest, false);
        }
        // 波源
        [[s1, 'S₁'], [s2, 'S₂']].forEach(([s, n]) => {
          dot(s[0], s[1], 9, C.gold);
          label(g2, n, s[0], s[1] + 24, { align: 'center', weight: 'bold', size: 16 });
        });
        // 比例尺
        g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(20, H - 22); g2.lineTo(20 + 2 * IS, H - 22); g2.moveTo(20, H - 28); g2.lineTo(20, H - 16); g2.moveTo(20 + 2 * IS, H - 28); g2.lineTo(20 + 2 * IS, H - 16); g2.stroke();
        label(g2, '2 cm', 26 + 2 * IS, H - 22);
        label(g2, '俯视图', 16, H - 50, { weight: 'bold' });
        R.in.set(strongD.length + ' 条');
        R.id.set(S.iAnti ? '加强 Δr=(n+½)λ，减弱 Δr=nλ' : '加强 Δr=nλ，减弱 Δr=(n+½)λ');
      }
      kit.drag((p) => {
        if (S.mode === 'intf') {
          const [s1, s2] = srcPos();
          if (Math.hypot(p.x - s1[0], p.y - s1[1]) < 20) return 's1';
          if (Math.hypot(p.x - s2[0], p.y - s2[1]) < 20) return 's2';
          return null;
        }
        if (S.mode === 'trav') {
          // 点击质点选择
          if (p.y > 60 && p.y < 300) {
            const i = Math.round((p.x - X0) / SX / (LM / (NP - 1)));
            if (i >= 0 && i < NP && Math.abs(px(i * LM / (NP - 1)) - p.x) < 16) return 'sel';
          }
        }
        return null;
      }, (o, p) => {
        if (o === 'sel') { S.sel = GW.clamp(Math.round((p.x - X0) / SX / (LM / (NP - 1))), 0, NP - 1); return; }
        const d = Math.abs(p.x - W / 2) * 2 / IS;
        S.iD = GW.clamp(Math.round(d * 2) / 2, 2, 14);
        iDS.set(S.iD);
      }, () => save());

      kit.loop((dt) => {
        const sz = kit.size(); W = sz.w; H = sz.h;
        if (!W) return;
        X1 = W - 40; SX = (X1 - X0) / LM; SY = S.mode === 'sup' ? 12 : S.mode === 'stand' ? 10 : 7;
        t += dt * S.speed;
        kit.background();
        if (S.mode === 'trav') drawTrav();
        else if (S.mode === 'sup') drawSup();
        else if (S.mode === 'stand') drawStand();
        else drawIntf();
        if (S.mode !== 'intf') label(g2, 't = ' + t.toFixed(2) + ' s', W - 16, 22, { align: 'right', weight: 'bold', size: 17 });
        else label(g2, 't = ' + t.toFixed(2) + ' s', W - 16, 20, { align: 'right', weight: 'bold', size: 17 });
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
