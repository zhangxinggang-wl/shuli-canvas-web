/* 数理无限画布 · 高中物理 · 斜面上物体的受力分析与运动 */
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
  function hatch(ctx, x, y, w, h) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = '#8a94a6'; ctx.lineWidth = 1.5;
    for (let i = -h; i < w + h; i += 9) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
    ctx.restore();
  }

  GW.registerSim({
    id: 'phy-incline', name: '斜面受力分析', category: 'physics', group: '力学',
    desc: '斜面上物体受重力、支持力、摩擦力与拉力：正交分解、静摩擦与滑动摩擦的判断、牛顿第二定律',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20V6z"/><rect x="10" y="9" width="5" height="4" transform="rotate(-32 12.5 11)"/><path d="M12 13v5"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      const D = { th: 30, m: 2, mu: 0.3, useF: false, F: 15, Fdir: 'up', v0: 0, decomp: true, showV: true, speed: 1 };
      for (const k in D) if (S[k] === undefined) S[k] = D[k];
      const save = () => ctx.save();
      const kit = GW.simKit.layout(ctx.root);
      const g2 = kit.ctx2d;
      const g = 9.8, LS = 8, S0 = 4; // 斜面长 5 m，初始位置（距底端）
      let s, v, t, ended;
      function reset() { s = S0; v = S.v0; t = 0; ended = ''; transport.setRunning(true); }

      // 受力（沿斜面向上为正）
      function forces(vel) {
        const th = S.th * Math.PI / 180, G = S.m * g, N = G * Math.cos(th), Gx = -G * Math.sin(th);
        const Fa = S.useF ? (S.Fdir === 'up' ? S.F : -S.F) : 0;
        const drive = Fa + Gx, fmax = S.mu * N;
        let f, kind, a;
        if (Math.abs(vel) < 1e-9) {
          if (Math.abs(drive) <= fmax + 1e-12) { f = -drive; kind = Math.abs(f) < 1e-9 ? 'none' : 'static'; a = 0; }
          else { f = -Math.sign(drive) * fmax; kind = 'kinetic'; a = (drive + f) / S.m; }
        } else { f = -Math.sign(vel) * fmax; kind = fmax > 0 ? 'kinetic' : 'none'; a = (drive + f) / S.m; }
        return { th, G, N, Gx, Fa, f, kind, a, fmax, drive };
      }
      // 分段匀变速精确推进（处理速度过零）
      function advance(T) {
        let rem = T;
        for (let k = 0; k < 4 && rem > 1e-12; k++) {
          const fo = forces(v), a = fo.a;
          if (Math.abs(v) > 1e-9 && a * v < 0) {
            const tz = -v / a;
            if (tz <= rem) { s += v * tz + 0.5 * a * tz * tz; t += tz; rem -= tz; v = 0; continue; }
          }
          s += v * rem + 0.5 * a * rem * rem; v += a * rem; t += rem; rem = 0;
        }
        if (s <= 0) { s = 0; v = 0; ended = '到达斜面底端'; }
        else if (s >= LS) { s = LS; v = 0; ended = '到达斜面顶端'; }
      }

      // ---------- 面板 ----------
      const P = kit.panel;
      const sl = (key, label, min, max, step, unit) => GW.ui.slider({ label, min, max, step, value: S[key], unit, onInput: (val) => { S[key] = val; save(); reset(); } });
      const transport = GW.simKit.transport(kit, () => reset());
      const spSeg = GW.ui.segmented({ options: [{ value: 0.25, label: '×0.25' }, { value: 0.5, label: '×0.5' }, { value: 1, label: '×1' }], value: S.speed, onChange: (val) => { S.speed = val; save(); } });
      const FS = sl('F', '拉力大小 F', 0, 80, 0.5, 'N');
      const dirSeg = GW.ui.segmented({ options: [{ value: 'up', label: '沿斜面向上' }, { value: 'down', label: '沿斜面向下' }], value: S.Fdir, onChange: (val) => { S.Fdir = val; save(); reset(); } });
      const fBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, FS.el, dirSeg.el);
      const useFT = GW.ui.toggle({ label: '施加沿斜面的拉力 F', value: S.useF, onChange: (val) => { S.useF = val; fBox.style.display = val ? 'flex' : 'none'; save(); reset(); } });
      fBox.style.display = S.useF ? 'flex' : 'none';
      const tg = (key, label) => GW.ui.toggle({ label, value: S[key], onChange: (val) => { S[key] = val; save(); } });
      const R = {};
      const ro = (k, l) => (R[k] = GW.ui.readout(l)).el;
      P.append(
        GW.ui.group('控制', transport.el, GW.h('div', { style: { fontSize: '12px', color: '#5b6576' } }, '慢放'), spSeg.el),
        GW.ui.group('参数', sl('th', '倾角 θ', 0, 60, 1, '°').el, sl('m', '质量 m', 0.5, 10, 0.1, 'kg').el, sl('mu', '动摩擦因数 μ（最大静摩擦取滑动摩擦）', 0, 1, 0.01, '').el,
          sl('v0', '初速度 v₀（沿斜面向上为正）', -4, 4, 0.1, 'm/s').el),
        GW.ui.group('拉力', useFT.el, fBox),
        GW.ui.group('读数（g = 9.8 m/s²）', ro('st', '状态'), ro('G', '重力 G = mg'), ro('N', '支持力 F_N'), ro('f', '摩擦力 f'), ro('net', '合力 F_合'), ro('a', '加速度 a'), ro('v', '速度 v'), ro('x', '位移 x'), ro('t', '时间 t')),
        GW.ui.group('显示', tg('decomp', '重力的正交分解').el, tg('showV', '速度矢量').el,
          GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: 1.5 } }, '各力都画在重心上，箭头长度按同一比例表示力的大小。')),
      );
      R.N.el.firstChild.innerHTML = '支持力 F<sub>N</sub>';
      R.net.el.firstChild.innerHTML = '合力 F<sub>合</sub>';

      kit.loop((dt) => {
        const { w: W, h: H } = kit.size();
        if (!W) return;
        if (kit.running && !ended) {
          const n = 10;
          for (let i = 0; i < n && !ended; i++) advance(dt * S.speed / n);
        }
        if (ended && kit.running) transport.setRunning(false);
        const fo = forces(v);
        kit.background();

        // 几何：底边左端 A，直角顶点 B 在右下
        const th = fo.th, c = Math.cos(th), sn = Math.sin(th);
        const k = Math.min((W - 140) / (LS * c + 0.6), (H - 150) / (LS * sn + 0.9)) * 0.95;
        const Ax = 60, Ay = H - 60;
        const Bx = Ax + LS * c * k, Cy = Ay - LS * sn * k;
        g2.fillStyle = '#eef1f5'; g2.beginPath(); g2.moveTo(Ax, Ay); g2.lineTo(Bx, Ay); g2.lineTo(Bx, Cy); g2.closePath(); g2.fill();
        g2.strokeStyle = C.ink; g2.lineWidth = 2.5; g2.stroke();
        g2.fillStyle = '#d9dee6'; g2.fillRect(20, Ay, W - 40, 10); hatch(g2, 20, Ay, W - 40, 10);
        g2.beginPath(); g2.moveTo(20, Ay); g2.lineTo(W - 20, Ay); g2.stroke();
        if (S.th > 0) {
          g2.lineWidth = 1.5; g2.beginPath(); g2.arc(Ax, Ay, 46, -th, 0); g2.stroke();
          rich(g2, 'θ', Ax + 58 * Math.cos(th / 2), Ay - 58 * Math.sin(th / 2), { align: 'center', size: 17 });
          g2.strokeRect(Bx - 12, Ay - 12, 12, 12);
        }
        // 物块
        const ux = c, uy = -sn, nx = -sn, ny = -c; // 沿斜面向上单位矢量 / 外法线（屏幕坐标）
        const bw = 70, bh = 46;
        const Px = Ax + s * k * ux, Py = Ay + s * k * uy;
        const Cx = Px + nx * bh / 2, Cy2 = Py + ny * bh / 2;
        g2.save(); g2.translate(Cx, Cy2); g2.rotate(-th);
        g2.fillStyle = '#ffe2b0'; g2.strokeStyle = C.ink; g2.lineWidth = 2.5;
        g2.fillRect(-bw / 2, -bh / 2, bw, bh); g2.strokeRect(-bw / 2, -bh / 2, bw, bh);
        g2.restore();
        g2.fillStyle = C.ink; g2.beginPath(); g2.arc(Cx, Cy2, 3.5, 0, 7); g2.fill();

        // 力（统一比例）
        const Fmax = Math.max(fo.G, Math.abs(fo.Fa), Math.abs(fo.f), 1e-6), K = 115 / Fmax;
        const arrow = (dx, dy, mag, col, name, offN, lw) => {
          if (mag * K < 2) return;
          const ox = Cx + nx * (offN || 0), oy = Cy2 + ny * (offN || 0);
          const ex = ox + dx * mag * K, ey = oy + dy * mag * K;
          GW.draw.arrow(g2, ox, oy, ex, ey, { color: col, width: lw || 3.5, head: 13 });
          return [ex, ey];
        };
        // 正交分解（虚线）
        if (S.decomp && S.th > 0) {
          const g1 = fo.G * sn, g2c = fo.G * c;
          const e1 = arrow(-ux, -uy, g1, 'rgba(27,36,51,0.6)', '', 0, 2.5);
          const e2 = arrow(-nx, -ny, g2c, 'rgba(27,36,51,0.6)', '', 0, 2.5);
          const Gx = Cx, Gy = Cy2 + fo.G * K;
          g2.save(); g2.strokeStyle = 'rgba(27,36,51,0.45)'; g2.lineWidth = 1.5; g2.setLineDash([5, 4]);
          g2.beginPath();
          if (e1) { g2.moveTo(e1[0], e1[1]); g2.lineTo(Gx, Gy); }
          if (e2) { g2.moveTo(e2[0], e2[1]); g2.lineTo(Gx, Gy); }
          g2.stroke(); g2.restore();
          if (e1) label(g2, 'mg sinθ', e1[0] - 10, e1[1] + 4, { align: 'right', size: 15, color: '#3a4456' });
          if (e2) label(g2, 'mg cosθ', e2[0] + 12, e2[1] + 10, { size: 15, color: '#3a4456' });
        }
        // 重力
        const eG = arrow(0, 1, fo.G, C.red, 'G');
        if (eG) rich(g2, 'G', eG[0] + 14, eG[1] - 6, { color: C.red, weight: 'bold', size: 18 });
        // 支持力
        const eN = arrow(nx, ny, fo.N, C.blue, 'F_N');
        if (eN) rich(g2, 'F_N', eN[0] - 8, eN[1] - 14, { color: C.blue, weight: 'bold', size: 18, align: 'right' });
        // 拉力
        let eF = null;
        if (S.useF && S.F > 0) {
          eF = arrow(ux * Math.sign(fo.Fa), uy * Math.sign(fo.Fa), Math.abs(fo.Fa), C.cyan, 'F');
          if (eF) rich(g2, 'F', eF[0] + 6, eF[1] - 16, { color: C.cyan, weight: 'bold', size: 18 });
        }
        // 摩擦力（与 F 同向时略错开）
        if (Math.abs(fo.f) > 1e-9) {
          const same = S.useF && fo.Fa * fo.f > 0;
          const ef = arrow(ux * Math.sign(fo.f), uy * Math.sign(fo.f), Math.abs(fo.f), '#d08a10', 'f', same ? -10 : 0);
          if (ef) rich(g2, fo.kind === 'static' ? 'f_静' : 'f', ef[0] + (fo.f > 0 ? 6 : -10), ef[1] + 18, { color: '#b87400', weight: 'bold', size: 18, align: fo.f > 0 ? 'left' : 'right' });
        }
        // 速度
        if (S.showV && Math.abs(v) > 0.01) {
          const L = GW.clamp(v * 22, -110, 110), ox = Cx - nx * (bh / 2 + 34), oy = Cy2 - ny * (bh / 2 + 34);
          void ox; void oy;
          const sx = Cx + nx * (bh / 2 + 16) + ux * Math.sign(v) * bw / 2, sy = Cy2 + ny * (bh / 2 + 16) + uy * Math.sign(v) * bw / 2;
          GW.draw.arrow(g2, sx, sy, sx + ux * L, sy + uy * L, { color: '#7a4fd6', width: 2.5, head: 10, dash: [6, 4] });
          rich(g2, 'v', sx + ux * L + 10, sy + uy * L - 8, { color: '#7a4fd6', weight: 'bold', size: 17 });
        }
        // 状态与说明
        const stTxt = Math.abs(v) < 1e-9 && fo.a === 0 ? (fo.kind === 'static' ? '静止（静摩擦力平衡）' : '静止') : (v > 1e-9 || (Math.abs(v) < 1e-9 && fo.a > 0)) ? '沿斜面向上运动' : '沿斜面向下运动';
        label(g2, 't = ' + t.toFixed(2) + ' s', 16, 20, { weight: 'bold', size: 17 });
        label(g2, stTxt + (ended ? '，' + ended : ''), 16, 46, { weight: 'bold', color: C.cyan });
        const fTxt = fo.kind === 'static' ? '静摩擦力 f = ' + Math.abs(fo.f).toFixed(2) + ' N（由平衡条件求得，≤ 最大静摩擦力 μF_N = ' + fo.fmax.toFixed(2) + ' N）'
          : fo.kind === 'kinetic' ? '滑动摩擦力 f = μF_N = ' + fo.fmax.toFixed(2) + ' N' : '无摩擦力';
        label(g2, fTxt, 16, 72, { color: '#5b6576' });
        // 图例
        const lg = [['G', C.red, '重力'], ['F_N', C.blue, '支持力'], ['f', '#d08a10', '摩擦力']].concat(S.useF ? [['F', C.cyan, '拉力']] : []);
        lg.forEach(([sym, col, nm], i) => {
          const lx = W - 120, ly = 22 + i * 24;
          g2.strokeStyle = col; g2.lineWidth = 3.5; g2.beginPath(); g2.moveTo(lx, ly); g2.lineTo(lx + 26, ly); g2.stroke();
          rich(g2, sym, lx + 34, ly, { color: col, weight: 'bold', size: 16 });
          label(g2, nm, lx + 62, ly, { color: '#5b6576' });
        });

        // 读数
        const net = fo.drive + fo.f;
        R.st.set(stTxt);
        R.G.set(fo.G.toFixed(2) + ' N'); R.N.set(fo.N.toFixed(2) + ' N');
        R.f.set(fo.kind === 'none' ? '0' : Math.abs(fo.f).toFixed(2) + ' N，' + (fo.kind === 'static' ? '静' : '滑动') + '，沿斜面' + (fo.f > 0 ? '向上' : '向下'));
        R.net.set(Math.abs(net) < 1e-9 ? '0' : Math.abs(net).toFixed(2) + ' N，沿斜面' + (net > 0 ? '向上' : '向下'));
        R.a.set(Math.abs(fo.a) < 1e-9 ? '0' : Math.abs(fo.a).toFixed(3) + ' m/s²，沿斜面' + (fo.a > 0 ? '向上' : '向下'));
        R.v.set(v.toFixed(3) + ' m/s'); R.x.set((s - S0).toFixed(3) + ' m（向上为正）'); R.t.set(t.toFixed(2) + ' s');
      });
      reset();
      return { destroy() { kit.destroy(); } };
    },
  });
})();
