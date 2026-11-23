/* 数理无限画布 · 高中物理 · 简谐运动（单摆 / 水平弹簧振子 / 竖直弹簧振子） */
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
  // 第一类完全椭圆积分 K(k)（算术-几何平均）
  function ellipK(k) { let a = 1, b = Math.sqrt(1 - k * k); for (let i = 0; i < 30; i++) { const a1 = (a + b) / 2; b = Math.sqrt(a * b); a = a1; } return Math.PI / (2 * a); }

  function spring(ctx, x1, y1, x2, y2, coils, amp) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const lead = Math.min(14, L * 0.12), body = L - 2 * lead, n = coils * 2;
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + ux * lead, y1 + uy * lead);
    for (let i = 1; i <= n; i++) {
      const s = lead + body * (i - 0.5) / n, a = (i % 2 ? 1 : -1) * amp;
      ctx.lineTo(x1 + ux * s + nx * a, y1 + uy * s + ny * a);
    }
    ctx.lineTo(x2 - ux * lead, y2 - uy * lead); ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function hatch(ctx, x, y, w, h, dir) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = '#8a94a6'; ctx.lineWidth = 1.5;
    for (let i = -h - w; i < w + h; i += 9) { ctx.beginPath(); ctx.moveTo(x + i, y + (dir ? h : 0)); ctx.lineTo(x + i + h, y + (dir ? 0 : h)); ctx.stroke(); }
    ctx.restore();
  }

  GW.registerSim({
    id: 'phy-oscillator', name: '简谐运动', category: 'physics', group: '振动与波',
    desc: '单摆、水平与竖直弹簧振子：x-t 图像、速度/加速度/回复力矢量、能量转化与周期公式',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16"/><path d="M12 3l5 13"/><circle cx="17" cy="17.5" r="2.5"/><path d="M12 3v12" stroke-dasharray="2 2"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      const D = { mode: 'pend', L: 1, g: 9.8, th0: 10, pm: 0.5, cmp: true, k: 20, m: 0.5, A: 8, damp: false, c: 0.2, sv: true, sa: true, sf: false, speed: 1 };
      for (const k in D) if (S[k] === undefined) S[k] = D[k];
      const save = () => ctx.save();
      const kit = GW.simKit.layout(ctx.root);
      const g2 = kit.ctx2d;

      // 广义坐标 q（单摆：θ/rad；弹簧：x/m，竖直取向上为正，以平衡位置为原点），速度 w
      let qInit = 0, q = 0, w = 0, t = 0, qs = 0, hist = [], crossings = [], dragging = false, E0 = 1, aRef = 1, vRef = 1;
      const isP = () => S.mode === 'pend';
      const mass = () => (isP() ? S.pm : S.m);
      const cDamp = () => (S.damp ? S.c : 0);
      function accel(qq, ww) {
        if (isP()) return -(S.g / S.L) * Math.sin(qq) - cDamp() / S.pm * ww;
        return -(S.k / S.m) * qq - cDamp() / S.m * ww;
      }
      function amp0() { return isP() ? S.th0 * Math.PI / 180 : S.A / 100; }
      function omega0() { return isP() ? Math.sqrt(S.g / S.L) : Math.sqrt(S.k / S.m); }
      function energies(qq, ww) {
        if (isP()) return { k: 0.5 * S.pm * S.L * S.L * ww * ww, p: S.pm * S.g * S.L * (1 - Math.cos(qq)) };
        return { k: 0.5 * S.m * ww * ww, p: 0.5 * S.k * qq * qq };
      }
      function reset(fromQ) {
        q = qInit = fromQ != null ? fromQ : amp0(); w = 0; t = 0; hist = []; crossings = [];
        const e = energies(q, 0); E0 = Math.max(e.p, 1e-9);
        vRef = isP() ? Math.sqrt(2 * S.g * S.L * (1 - Math.cos(q))) : Math.abs(q) * omega0();
        aRef = isP() ? Math.max(S.g * Math.sin(Math.abs(q)), vRef * vRef / S.L) : Math.abs(q) * omega0() * omega0();
        vRef = Math.max(vRef, 1e-6); aRef = Math.max(aRef, 1e-6);
      }
      function step(h) {
        // 经典 RK4
        const k1q = w, k1w = accel(q, w);
        const k2q = w + 0.5 * h * k1w, k2w = accel(q + 0.5 * h * k1q, w + 0.5 * h * k1w);
        const k3q = w + 0.5 * h * k2w, k3w = accel(q + 0.5 * h * k2q, w + 0.5 * h * k2w);
        const k4q = w + h * k3w, k4w = accel(q + h * k3q, w + h * k3w);
        const qn = q + h / 6 * (k1q + 2 * k2q + 2 * k3q + k4q);
        w = w + h / 6 * (k1w + 2 * k2w + 2 * k3w + k4w);
        if (q < 0 && qn >= 0) { const tc = t + h * (-q) / (qn - q); crossings.push(tc); if (crossings.length > 6) crossings.shift(); }
        q = qn; t += h;
      }

      // ---------- 面板 ----------
      const P = kit.panel;
      const modeSeg = GW.ui.segmented({ options: [{ value: 'pend', label: '单摆' }, { value: 'hspr', label: '水平弹簧' }, { value: 'vspr', label: '竖直弹簧' }], value: S.mode, onChange: (v) => { S.mode = v; save(); syncPanel(); reset(); } });
      const sl = (key, label, min, max, step, unit) => GW.ui.slider({ label, min, max, step, value: S[key], unit, onInput: (v) => { S[key] = v; save(); reset(); } });
      const LS = sl('L', '摆长 L', 0.2, 2, 0.05, 'm'), gS = sl('g', '重力加速度 g', 1, 20, 0.1, 'm/s²'), thS = sl('th0', '振幅角 θ₀', 1, 80, 1, '°'), pmS = sl('pm', '摆球质量 m', 0.1, 2, 0.1, 'kg');
      const cmpT = GW.ui.toggle({ label: '对比小角近似解（虚影）', value: S.cmp, onChange: (v) => { S.cmp = v; save(); } });
      const kS = sl('k', '劲度系数 k', 5, 100, 1, 'N/m'), mS = sl('m', '振子质量 m', 0.1, 2, 0.05, 'kg'), AS = sl('A', '振幅 A', 1, 12, 0.5, 'cm');
      const dampT = GW.ui.toggle({ label: '有阻尼（f = −cv）', value: S.damp, onChange: (v) => { S.damp = v; cS.el.style.display = v ? '' : 'none'; save(); reset(); } });
      const cS = sl('c', '阻尼系数 c', 0.02, 1, 0.02, 'kg/s');
      cS.el.style.display = S.damp ? '' : 'none';
      const tg = (key, label) => GW.ui.toggle({ label, value: S[key], onChange: (v) => { S[key] = v; save(); } });
      const transport = GW.simKit.transport(kit, () => reset());
      const spSeg = GW.ui.segmented({ options: [{ value: 0.25, label: '×0.25' }, { value: 0.5, label: '×0.5' }, { value: 1, label: '×1' }], value: S.speed, onChange: (v) => { S.speed = v; save(); } });
      const R = {};
      const ro = (k, l) => (R[k] = GW.ui.readout(l)).el;
      const pendBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, LS.el, gS.el, thS.el, pmS.el, cmpT.el);
      const sprBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, kS.el, mS.el, AS.el);
      P.append(
        GW.ui.group('模型', modeSeg.el),
        GW.ui.group('控制', transport.el, GW.h('div', { style: { fontSize: '12px', color: '#5b6576' } }, '慢放'), spSeg.el),
        GW.ui.group('参数', pendBox, sprBox, dampT.el, cS.el),
        GW.ui.group('周期', ro('Tm', '实测周期 T'), ro('Tt', '理论'), ro('Te', '大角度精确值')),
        GW.ui.group('读数', ro('t', '时间 t'), ro('x', '位移 x'), ro('v', '速度 v'), ro('a', '加速度 a'), ro('F', '回复力 F')),
        GW.ui.group('显示矢量', tg('sv', '速度 v（蓝）').el, tg('sa', '加速度 a（朱）').el, tg('sf', '回复力 F（金）').el),
        GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: 1.5 } }, '提示：可直接拖动摆球/振子改变初始位移，松手后由静止释放。'),
      );
      function syncPanel() {
        pendBox.style.display = isP() ? 'flex' : 'none';
        sprBox.style.display = isP() ? 'none' : 'flex';
        R.Te.el.style.display = isP() ? '' : 'none';
      }
      syncPanel();

      // ---------- 几何 ----------
      let G = {};
      function geom(W, H) {
        const aw = 330;
        G = { aw, W, H, gx: aw + 20, gy: 26, gw: W - aw - 36, gh: 300, ex: aw + 20, ey: 360, ew: W - aw - 36, eh: H - 380 };
        if (isP()) {
          const th = Math.max(S.th0 * Math.PI / 180, 0.17);
          const Lr = Math.max(S.L, 1); G.s = Math.min(300 / Lr, 148 / (Lr * Math.sin(th))); G.px = aw / 2; G.py = 60;
        } else if (S.mode === 'hspr') {
          G.s = 900; G.ox = 190; G.oy = 300;
        } else {
          const x0 = S.m * 9.8 / S.k;
          G.s = Math.min(900, (H - 40 - 110 - 70) / (x0 + 0.12 + 0.01)); G.ceil = 40; G.L0 = 110;
          G.oy = G.ceil + G.L0 + x0 * G.s; G.ox = aw / 2;
        }
      }
      // 振子在画布上的位置
      function bobPos(qq) {
        if (isP()) return [G.px + S.L * G.s * Math.sin(qq), G.py + S.L * G.s * Math.cos(qq)];
        if (S.mode === 'hspr') return [G.ox + qq * G.s, G.oy];
        return [G.ox, G.oy - qq * G.s];
      }
      kit.drag((p) => { const [bx, by] = bobPos(q); return Math.hypot(p.x - bx, p.y - by) < 30 ? 'bob' : null; },
        (o, p) => {
          dragging = true;
          let nq;
          if (isP()) { nq = GW.clamp(Math.atan2(p.x - G.px, p.y - G.py), -80 * Math.PI / 180, 80 * Math.PI / 180); S.th0 = Math.max(1, Math.round(Math.abs(nq) * 180 / Math.PI)); thS.set(S.th0); nq = Math.sign(nq || 1) * S.th0 * Math.PI / 180; }
          else {
            const d = S.mode === 'hspr' ? (p.x - G.ox) / G.s : (G.oy - p.y) / G.s;
            S.A = GW.clamp(Math.round(Math.abs(d) * 200) / 2, 1, 12); AS.set(S.A); nq = Math.sign(d || 1) * S.A / 100;
          }
          reset(nq);
        }, () => { dragging = false; save(); transport.setRunning(true); });

      function drawApparatus() {
        const [bx, by] = bobPos(q);
        g2.lineCap = 'round';
        if (isP()) {
          // 悬点
          g2.fillStyle = '#d9dee6'; g2.fillRect(G.px - 70, G.py - 16, 140, 16); hatch(g2, G.px - 70, G.py - 16, 140, 16);
          g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(G.px - 70, G.py); g2.lineTo(G.px + 70, G.py); g2.stroke();
          // 竖直参考线与振幅
          g2.save(); g2.setLineDash([5, 5]); g2.strokeStyle = C.grey; g2.lineWidth = 1.5;
          g2.beginPath(); g2.moveTo(G.px, G.py); g2.lineTo(G.px, G.py + S.L * G.s + 30); g2.stroke();
          g2.beginPath(); g2.arc(G.px, G.py, S.L * G.s, Math.PI / 2 - amp0() - 0.05, Math.PI / 2 + amp0() + 0.05); g2.stroke();
          g2.restore();
          // 小角近似虚影
          if (S.cmp && !S.damp) {
            const [sx, sy] = bobPos(qs);
            g2.save(); g2.globalAlpha = 0.38; g2.strokeStyle = C.blue; g2.lineWidth = 2;
            g2.beginPath(); g2.moveTo(G.px, G.py); g2.lineTo(sx, sy); g2.stroke();
            g2.fillStyle = C.blue; g2.beginPath(); g2.arc(sx, sy, 13, 0, 7); g2.fill(); g2.restore();
          }
          g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(G.px, G.py); g2.lineTo(bx, by); g2.stroke();
          // θ 角
          if (Math.abs(q) > 0.03) {
            g2.strokeStyle = C.ink; g2.lineWidth = 1.5; g2.beginPath();
            g2.arc(G.px, G.py, 42, Math.PI / 2, Math.PI / 2 - q, q > 0); g2.stroke();
            rich(g2, 'θ', G.px + 56 * Math.sin(q / 2), G.py + 56 * Math.cos(q / 2), { align: 'center', size: 16 });
          }
          const grd = g2.createRadialGradient(bx - 4, by - 4, 2, bx, by, 14);
          grd.addColorStop(0, '#ffd99a'); grd.addColorStop(1, C.gold);
          g2.fillStyle = grd; g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.beginPath(); g2.arc(bx, by, 14, 0, 7); g2.fill(); g2.stroke();
          label(g2, 'O', G.px - 14, G.py + S.L * G.s + 26, { align: 'center' });
          const sb = 0.5 * G.s; g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(20, G.H - 60); g2.lineTo(20 + sb, G.H - 60); g2.moveTo(20, G.H - 66); g2.lineTo(20, G.H - 54); g2.moveTo(20 + sb, G.H - 66); g2.lineTo(20 + sb, G.H - 54); g2.stroke();
          label(g2, '0.5 m', 28 + sb, G.H - 60, { color: '#5b6576' });
          if (S.cmp && !S.damp) label(g2, '蓝色虚影：小角近似 θ = θ₀cos ωt', G.aw / 2, G.H - 24, { align: 'center', color: C.blue });
        } else if (S.mode === 'hspr') {
          const oy = G.oy, wallX = 24, bw = 54, bh = 54;
          g2.fillStyle = '#d9dee6'; g2.fillRect(wallX - 16, oy - 110, 16, 140); hatch(g2, wallX - 16, oy - 110, 16, 140);
          g2.fillStyle = '#eef1f5'; g2.fillRect(0, oy + bh / 2, G.aw, 18);
          g2.strokeStyle = C.ink; g2.lineWidth = 2;
          g2.beginPath(); g2.moveTo(wallX, oy - 110); g2.lineTo(wallX, oy + bh / 2); g2.lineTo(G.aw - 6, oy + bh / 2); g2.stroke();
          g2.strokeStyle = C.cyan; g2.lineWidth = 2.5; spring(g2, wallX, oy, bx - bw / 2, oy, 12, 11);
          // 平衡位置与 ±A
          g2.save(); g2.setLineDash([5, 5]); g2.lineWidth = 1.5;
          [[0, 'O'], [S.A / 100, '+A'], [-S.A / 100, '−A']].forEach(([d, s]) => {
            const x = G.ox + d * G.s; g2.strokeStyle = d ? C.grey : C.ink;
            g2.beginPath(); g2.moveTo(x, oy - 70); g2.lineTo(x, oy + bh / 2 + 18); g2.stroke();
            label(g2, s, x, oy + bh / 2 + 32, { align: 'center', color: d ? '#5b6576' : C.ink });
          });
          g2.restore();
          g2.fillStyle = '#ffe2b0'; g2.strokeStyle = C.ink; g2.lineWidth = 2;
          g2.fillRect(bx - bw / 2, oy - bh / 2, bw, bh); g2.strokeRect(bx - bw / 2, oy - bh / 2, bw, bh);
          rich(g2, 'm', bx, oy, { align: 'center', size: 18 });
          GW.draw.arrow(g2, G.ox, oy - 90, G.ox + 60, oy - 90, { color: C.ink, width: 2 }); rich(g2, 'x', G.ox + 68, oy - 90, { size: 16 });
          label(g2, '光滑水平面', G.aw / 2, oy + bh / 2 + 62, { align: 'center', color: '#5b6576' });
        } else {
          const ox = G.ox, bw = 56, bh = 50;
          g2.fillStyle = '#d9dee6'; g2.fillRect(ox - 80, G.ceil - 16, 160, 16); hatch(g2, ox - 80, G.ceil - 16, 160, 16);
          g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(ox - 80, G.ceil); g2.lineTo(ox + 80, G.ceil); g2.stroke();
          g2.strokeStyle = C.cyan; g2.lineWidth = 2.5; spring(g2, ox, G.ceil, ox, by - bh / 2, 12, 11);
          g2.save(); g2.setLineDash([5, 5]); g2.lineWidth = 1.5;
          const l0 = G.ceil + G.L0 - bh / 2;
          g2.strokeStyle = '#b5bcc8'; g2.beginPath(); g2.moveTo(ox - 60, l0); g2.lineTo(ox + 60, l0); g2.stroke();
          label(g2, '弹簧原长处', ox + 64, l0, { color: '#5b6576', size: 15 });
          [[0, '平衡位置 O'], [S.A / 100, '+A'], [-S.A / 100, '−A']].forEach(([d, s]) => {
            const y = G.oy - d * G.s; g2.strokeStyle = d ? C.grey : C.ink;
            g2.beginPath(); g2.moveTo(ox - 60, y); g2.lineTo(ox + 60, y); g2.stroke();
            label(g2, s, ox + 64, y, { color: d ? '#5b6576' : C.ink });
          });
          g2.restore();
          g2.fillStyle = '#ffe2b0'; g2.strokeStyle = C.ink; g2.lineWidth = 2;
          g2.fillRect(ox - bw / 2, by - bh / 2, bw, bh); g2.strokeRect(ox - bw / 2, by - bh / 2, bw, bh);
          rich(g2, 'm', ox, by, { align: 'center', size: 18 });
          GW.draw.arrow(g2, 24, G.ceil + 110, 24, G.ceil + 50, { color: C.ink, width: 2 }); rich(g2, 'x', 34, G.ceil + 52, { size: 16 });
          label(g2, '向上为正', 10, G.ceil + 128, { color: '#5b6576' });
        }
        // 矢量
        const a = accel(q, w);
        let ux, uy, vel, acc, accN = 0, F;
        if (isP()) {
          ux = Math.cos(q); uy = -Math.sin(q); // 切向（θ 增大方向）
          vel = S.L * w; acc = S.L * a; accN = S.L * w * w; F = -S.pm * S.g * Math.sin(q);
        } else if (S.mode === 'hspr') { ux = 1; uy = 0; vel = w; acc = a; F = -S.k * q; }
        else { ux = 0; uy = -1; vel = w; acc = a; F = -S.k * q; }
        const VL = 70;
        // 矢量画在振子中心，向外略错开避免重叠
        const off = isP() ? [0, 0] : S.mode === 'hspr' ? [0, -40] : [40, 0];
        const off2 = isP() ? [0, 0] : S.mode === 'hspr' ? [0, -58] : [-44, 0];
        if (S.sv && Math.abs(vel) / vRef * VL > 3) {
          const L = vel / vRef * VL;
          GW.draw.arrow(g2, bx + off[0], by + off[1], bx + off[0] + ux * L, by + off[1] + uy * L, { color: C.blue, width: 3 });
          rich(g2, 'v', bx + off[0] + ux * L + (isP() ? 0 : ux * 10) + (S.mode === 'vspr' ? 12 : 0), by + off[1] + uy * L - 12, { color: C.blue, weight: 'bold', size: 17 });
        }
        if (S.sa) {
          // 单摆：合加速度 = 切向 + 法向（指向悬点）
          const nx = (G.px - bx), ny = (G.py - by), nl = Math.hypot(nx, ny) || 1;
          const axv = ux * acc + (isP() ? nx / nl * accN : 0), ayv = uy * acc + (isP() ? ny / nl * accN : 0);
          const L = Math.hypot(axv, ayv) / aRef * VL;
          if (L > 3) {
            const m = Math.hypot(axv, ayv);
            const o = off2;
            GW.draw.arrow(g2, bx + o[0], by + o[1], bx + o[0] + axv / m * L, by + o[1] + ayv / m * L, { color: C.red, width: 3 });
            rich(g2, 'a', bx + o[0] + axv / m * L + 10, by + o[1] + ayv / m * L + 12, { color: C.red, weight: 'bold', size: 17 });
          }
        }
        if (S.sf) {
          const Fref = mass() * (isP() ? S.g * Math.sin(Math.max(amp0(), 0.02)) : amp0() * omega0() * omega0());
          const L = F / Fref * VL;
          if (Math.abs(L) > 3) {
            const o = isP() ? [0, 18] : S.mode === 'hspr' ? [0, 0] : [78, 0];
            GW.draw.arrow(g2, bx + o[0], by + o[1], bx + o[0] + ux * L, by + o[1] + uy * L, { color: '#d08a10', width: 3.5 });
            rich(g2, 'F', bx + o[0] + ux * L + (S.mode === 'vspr' ? 14 : 0), by + o[1] + uy * L + (S.mode === 'vspr' ? 0 : 18), { color: '#b87400', weight: 'bold', size: 17 });
          }
        }
      }

      const disp = (qq) => (isP() ? S.L * qq * 100 : qq * 100); // cm（单摆为弧长位移）
      function drawGraph() {
        const { gx, gy, gw, gh } = G;
        const win = 10, t0 = Math.max(0, t - win * 0.85);
        const Amax = Math.max(Math.abs(disp(amp0())), 0.5) * 1.18;
        const sx = gw / win, sy = (gh / 2 - 14) / Amax, oy = gy + gh / 2;
        g2.save();
        g2.fillStyle = '#fafbfd'; g2.fillRect(gx, gy, gw, gh);
        g2.strokeStyle = '#e3e7ee'; g2.lineWidth = 1; g2.strokeRect(gx, gy, gw, gh);
        // 网格与刻度
        g2.font = '15px ' + SANS; g2.fillStyle = '#5b6576'; g2.textAlign = 'center'; g2.textBaseline = 'top';
        for (let v = Math.ceil(t0); v <= t0 + win; v++) {
          const x = gx + 38 + (v - t0) * (gw - 38) / win;
          g2.strokeStyle = 'rgba(27,36,51,0.07)'; g2.beginPath(); g2.moveTo(x, gy); g2.lineTo(x, gy + gh); g2.stroke();
          if (x > gx + 44 && x < gx + gw - 30) g2.fillText(v, x, oy + 4);
        }
        const st = niceStep(sy, 40);
        g2.textAlign = 'right'; g2.textBaseline = 'middle';
        for (let v = -Math.floor(Amax / st) * st; v <= Amax; v += st) {
          const y = oy - v * sy;
          g2.strokeStyle = 'rgba(27,36,51,0.07)'; g2.beginPath(); g2.moveTo(gx, y); g2.lineTo(gx + gw, y); g2.stroke();
          if (Math.abs(v) > 1e-9) g2.fillText(+v.toFixed(2), gx + 34, y);
        }
        g2.restore();
        GW.draw.arrow(g2, gx + 38, oy, gx + gw - 4, oy, { color: C.ink, width: 2 });
        GW.draw.arrow(g2, gx + 38, gy + gh - 4, gx + 38, gy + 6, { color: C.ink, width: 2 });
        rich(g2, 't', gx + gw - 30, oy - 14, { size: 16 }); label(g2, '/s', gx + gw - 24, oy - 14);
        rich(g2, 'x', gx + 46, gy + 14, { size: 16 }); label(g2, '/cm' + (isP() ? '（弧长位移）' : ''), gx + 55, gy + 14);
        g2.save(); g2.beginPath(); g2.rect(gx + 38, gy, gw - 38, gh); g2.clip();
        const X = (tt) => gx + 38 + (tt - t0) * (gw - 38) / win;
        if (isP() && S.cmp && !S.damp) {
          g2.strokeStyle = 'rgba(51,102,255,0.55)'; g2.lineWidth = 2; g2.setLineDash([6, 4]); g2.beginPath();
          let first = true;
          hist.forEach((h) => { if (h[0] < t0 - 0.1) return; const x = X(h[0]), y = oy - h[2] * sy; first ? g2.moveTo(x, y) : g2.lineTo(x, y); first = false; });
          g2.stroke(); g2.setLineDash([]);
        }
        g2.strokeStyle = C.cyan; g2.lineWidth = 3; g2.lineJoin = 'round'; g2.beginPath();
        let first = true;
        hist.forEach((h) => { if (h[0] < t0 - 0.1) return; const x = X(h[0]), y = oy - h[1] * sy; first ? g2.moveTo(x, y) : g2.lineTo(x, y); first = false; });
        g2.stroke();
        const cx = X(t), cy = oy - disp(q) * sy;
        g2.fillStyle = C.gold; g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.beginPath(); g2.arc(cx, cy, 6, 0, 7); g2.fill(); g2.stroke();
        // 实测周期标注
        if (crossings.length >= 2) {
          const ta = crossings[crossings.length - 2], tb = crossings[crossings.length - 1];
          if (ta > t0) {
            const y = gy + gh - 18;
            g2.strokeStyle = C.red; g2.lineWidth = 2;
            g2.beginPath(); g2.moveTo(X(ta), oy); g2.lineTo(X(ta), y + 6); g2.moveTo(X(tb), oy); g2.lineTo(X(tb), y + 6); g2.stroke();
            GW.draw.arrow(g2, (X(ta) + X(tb)) / 2, y, X(ta), y, { color: C.red, width: 2, head: 8 });
            GW.draw.arrow(g2, (X(ta) + X(tb)) / 2, y, X(tb), y, { color: C.red, width: 2, head: 8 });
            rich(g2, 'T', (X(ta) + X(tb)) / 2, y - 14, { color: C.red, align: 'center', size: 16 });
          }
        }
        g2.restore();
        label(g2, '振动图像（x-t）', gx + gw - 8, gy + 14, { align: 'right', weight: 'bold' });
      }
      function drawEnergy() {
        const { ex, ey, ew, eh } = G;
        const e = energies(q, w), items = [['E_k', e.k, C.cyan, '动能'], ['E_p', e.p, C.blue, '势能'], ['E', e.k + e.p, C.gold, '机械能']];
        label(g2, '能量', ex, ey + 2, { weight: 'bold' });
        label(g2, isP() ? '以最低点为重力势能零点' : S.mode === 'vspr' ? 'E_p 含重力势能与弹性势能（以平衡位置为零点）' : 'E_p 为弹性势能 ½kx²', ex, ey + 24, { color: '#5b6576', size: 15 });
        const base = ey + eh - 26, top = ey + 58, hmax = base - top, bw = 64, gap = (ew - 3 * bw) / 4;
        g2.strokeStyle = C.ink; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(ex, base); g2.lineTo(ex + ew, base); g2.stroke();
        items.forEach(([sym, val, col, name], i) => {
          const x = ex + gap + i * (bw + gap), hgt = val / E0 * hmax;
          g2.fillStyle = col; g2.globalAlpha = 0.85; g2.fillRect(x, base - hgt, bw, hgt); g2.globalAlpha = 1;
          g2.strokeStyle = col; g2.lineWidth = 2; g2.strokeRect(x, base - hgt, bw, hgt);
          const unitJ = val < 0.1 ? (val * 1000).toFixed(1) + ' mJ' : val.toFixed(3) + ' J';
          label(g2, unitJ, x + bw / 2, base - hgt - 13, { align: 'center', size: 15 });
          const wsym = rich(g2, sym, 0, -100, { size: 16 });
          rich(g2, sym, x + bw / 2 - wsym / 2 - 18, base + 14, { size: 16 });
          label(g2, name, x + bw / 2 + wsym / 2 - 14, base + 14, { size: 15, color: '#5b6576' });
        });
      }

      kit.loop((dt) => {
        const { w: W, h: H } = kit.size();
        if (!W) return;
        geom(W, H);
        if (kit.running && !dragging && dt > 0) {
          const T = dt * S.speed, n = Math.max(1, Math.ceil(T / 0.0005)), hh = T / n;
          for (let i = 0; i < n; i++) step(hh);
          hist.push([t, disp(q), isP() ? disp(qInit * Math.cos(omega0() * t)) : 0]);
          while (hist.length && hist[0][0] < t - 12) hist.shift();
        }
        if (!hist.length) hist.push([t, disp(q), disp(q)]);
        qs = qInit * Math.cos(omega0() * t);
        kit.background();
        g2.strokeStyle = '#e3e7ee'; g2.lineWidth = 1; g2.beginPath(); g2.moveTo(G.aw, 10); g2.lineTo(G.aw, H - 10); g2.stroke();
        drawApparatus(); drawGraph(); drawEnergy();
        label(g2, 't = ' + t.toFixed(2) + ' s', 14, 18, { weight: 'bold', size: 17 });

        // 读数
        const a = accel(q, w);
        const Tm = crossings.length >= 2 ? crossings[crossings.length - 1] - crossings[crossings.length - 2] : null;
        R.Tm.set(Tm ? Tm.toFixed(3) + ' s' : '测量中…');
        const w0 = omega0(), Tth = 2 * Math.PI / w0;
        if (isP()) {
          R.Tt.set('2π√(L/g) = ' + Tth.toFixed(3) + ' s');
          R.Te.set((4 * Math.sqrt(S.L / S.g) * ellipK(Math.sin(amp0() / 2))).toFixed(3) + ' s');
          R.x.set((S.L * q * 100).toFixed(2) + ' cm（θ = ' + (q * 180 / Math.PI).toFixed(1) + '°）');
          R.v.set((S.L * w).toFixed(3) + ' m/s'); R.a.set((S.L * a).toFixed(3) + ' m/s²（切向）');
          R.F.set((-S.pm * S.g * Math.sin(q)).toFixed(3) + ' N');
        } else {
          const cm = cDamp(), disc = S.k / S.m - Math.pow(cm / (2 * S.m), 2);
          R.Tt.set('2π√(m/k) = ' + Tth.toFixed(3) + ' s' + (cm > 0 && disc > 0 ? '<br>阻尼时 ' + (2 * Math.PI / Math.sqrt(disc)).toFixed(3) + ' s' : ''));
          R.x.set((q * 100).toFixed(2) + ' cm'); R.v.set(w.toFixed(3) + ' m/s'); R.a.set(a.toFixed(3) + ' m/s²');
          R.F.set((-S.k * q).toFixed(3) + ' N');
        }
        R.t.set(t.toFixed(2) + ' s');
      });
      reset();
      return { destroy() { kit.destroy(); } };
    },
  });
})();
