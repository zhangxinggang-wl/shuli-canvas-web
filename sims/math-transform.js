/* 数理无限画布 · 初中数学 · 坐标系中的图形变换
 * 平移、轴对称、旋转、位似：原图 ABC 与像 A′B′C′ 同屏对照，对应点坐标与坐标规律实时读出
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#5b6576';
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const TAU = Math.PI * 2;
  const R = 10;                                     // 坐标系范围 ±10
  const P0 = [[1, 1], [4, 1], [1, 3]];              // 原图默认三个顶点
  const MINUS = '−';                                // 读数里的负号统一写成 −（U+2212）
  const NAME = ['A', 'B', 'C'], NAME2 = ['A′', 'B′', 'C′'];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, def, a, b) => clamp(isFinite(+v) ? +v : def, a, b);
  const iv = (v, def) => clamp(Math.round(isFinite(+v) ? +v : def), -9, 9);
  const round4 = (v) => Math.round(v * 1e4) / 1e4;
  const fmt = (v) => { const r = Math.round(v * 100) / 100; return String(r === 0 ? 0 : r).replace('-', MINUS); };
  const pt = (p) => '(' + fmt(p[0]) + ', ' + fmt(p[1]) + ')';   // 坐标读数：(x, y)，逗号后一个半角空格

  // 三个顶点：非数组 / 越界 / 非数字都退回默认值（垃圾 state 下也不能出 NaN）
  function normP(P) {
    const src = Array.isArray(P) ? P : [];
    return P0.map((d, i) => { const q = Array.isArray(src[i]) ? src[i] : d; return [iv(q[0], d[0]), iv(q[1], d[1])]; });
  }

  GW.registerSim({
    id: 'math-transform', name: '图形的变换', category: 'math', group: '初中 · 图形与几何',
    desc: '坐标系中的平移、轴对称、旋转与位似，对应点坐标实时对照',
    keywords: '平移 轴对称 对称轴 旋转 中心对称 位似 相似 平面直角坐标系 坐标 初中',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 17V9l7 8V9"/><path d="M15 6h6M18 3v6"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const st = ctx.state;

      // ---------- 状态：逐个字段校验并给默认值 ----------
      if (!['translate', 'reflect', 'rotate', 'dilate'].includes(st.mode)) st.mode = 'translate';
      st.P = normP(st.P);
      st.dx = iv(st.dx, 3);
      st.dy = iv(st.dy, 2);
      if (!['x', 'y', 'yx', 'x=m'].includes(st.axis)) st.axis = 'y';
      st.m = iv(st.m, 2);
      st.cx = iv(st.cx, 0);
      st.cy = iv(st.cy, 0);
      st.deg = [90, 180, 270].includes(+st.deg) ? +st.deg : 90;
      if (!['ccw', 'cw'].includes(st.dir)) st.dir = 'ccw';
      st.k = Math.round(num(st.k, 2, -3, 3) * 2) / 2;
      if (!st.k) st.k = 2;                            // 位似比不能为 0
      st.links = st.links == null ? true : !!st.links;

      const kit = GW.simKit.layout(ctx.root, { panelWidth: 260 });
      const c2 = kit.ctx2d;
      const save = () => ctx.save();
      let W = 0, H = 0, dirty = true;
      let unit = 20, OX = 0, OY = 0;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });

      function geom() {   // 单位长度：正方格，留出刻度与标题的边距
        const pad = 60;
        unit = Math.max(6, Math.min((W - pad) / (2 * R), (H - pad) / (2 * R)));
        OX = W / 2; OY = H / 2;
      }
      const X = (v) => OX + v * unit, Y = (v) => OY - v * unit;

      // ---------- 计算：闭包内的纯函数，画面和读数都调它 ----------
      function rotRad(o) { const a = o.deg * Math.PI / 180; return o.dir === 'ccw' ? a : -a; }
      function transformPoint(p, o) {
        const x = p[0], y = p[1];
        if (o.mode === 'translate') return [x + o.dx, y + o.dy];
        if (o.mode === 'reflect') {
          if (o.axis === 'x') return [x, -y];
          if (o.axis === 'y') return [-x, y];
          if (o.axis === 'yx') return [y, x];
          return [2 * o.m - x, y];                    // 关于直线 x = m 对称
        }
        if (o.mode === 'rotate') {                    // 绕 (cx, cy) 转 deg，逆时针为正
          const a = rotRad(o), c = Math.cos(a), s = Math.sin(a), ux = x - o.cx, uy = y - o.cy;
          return [round4(o.cx + ux * c - uy * s), round4(o.cy + ux * s + uy * c)];
        }
        return [round4(o.cx + (x - o.cx) * o.k), round4(o.cy + (y - o.cy) * o.k)];   // 位似
      }
      const params = () => ({ mode: st.mode, dx: st.dx, dy: st.dy, axis: st.axis, m: st.m, cx: st.cx, cy: st.cy, deg: st.deg, dir: st.dir, k: st.k });
      const image = () => { const o = params(); return st.P.map((p) => transformPoint(p, o)); };

      // 坐标规律：把「像的坐标怎么由 (x, y) 算出来」写成人话
      function rule() {
        const cxy = (st.cx || st.cy) ? '（中心 (' + fmt(st.cx) + ', ' + fmt(st.cy) + ')）' : '';
        if (st.mode === 'translate') {
          const ax = st.dx === 0 ? 'x' : 'x ' + (st.dx > 0 ? '+ ' : MINUS + ' ') + Math.abs(st.dx);
          const ay = st.dy === 0 ? 'y' : 'y ' + (st.dy > 0 ? '+ ' : MINUS + ' ') + Math.abs(st.dy);
          return '(x, y) → (' + ax + ', ' + ay + ')';
        }
        if (st.mode === 'reflect') {
          if (st.axis === 'x') return '(x, y) → (x, ' + MINUS + 'y)';
          if (st.axis === 'y') return '(x, y) → (' + MINUS + 'x, y)';
          if (st.axis === 'yx') return '(x, y) → (y, x)';
          return '(x, y) → (2m ' + MINUS + ' x, y)';
        }
        if (st.mode === 'rotate') {
          if (st.deg === 180) return '(x, y) → (' + MINUS + 'x, ' + MINUS + 'y)' + cxy;
          const same = (st.deg === 90) === (st.dir === 'ccw');   // 逆时针 90° 与顺时针 270° 同向
          return '(x, y) → ' + (same ? '(' + MINUS + 'y, x)' : '(y, ' + MINUS + 'x)') + cxy;
        }
        const ks = st.k === 1 ? '' : st.k === -1 ? MINUS : fmt(st.k);
        return '(x, y) → (' + ks + 'x, ' + ks + 'y)' + cxy;
      }

      // ---------- 绘制助手 ----------
      function line(x1, y1, x2, y2, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke(); c2.restore();
      }
      function text(t, x, y, color, font, al, bl) { c2.font = font || '15px ' + FONT; c2.fillStyle = color || INK; c2.textAlign = al || 'left'; c2.textBaseline = bl || 'middle'; c2.fillText(t, x, y); }
      function halo(t, x, y, color, font, al, bl) {   // 压在网格上的标签先描白边
        c2.save(); c2.font = font || 'bold 15px ' + MATH; c2.textAlign = al || 'center'; c2.textBaseline = bl || 'middle';
        c2.lineWidth = 4; c2.lineJoin = 'round'; c2.strokeStyle = 'rgba(255,255,255,0.92)'; c2.strokeText(t, x, y);
        c2.fillStyle = color; c2.fillText(t, x, y); c2.restore();
      }
      function poly(pts, color, fill) {
        c2.beginPath();
        pts.forEach((p, i) => { const px = X(p[0]), py = Y(p[1]); if (i) c2.lineTo(px, py); else c2.moveTo(px, py); });
        c2.closePath();
        if (fill) { c2.fillStyle = fill; c2.fill(); }
        c2.strokeStyle = color; c2.lineWidth = 2.6; c2.lineJoin = 'round'; c2.stroke();
      }
      function dot(p, color, r) { c2.beginPath(); c2.arc(X(p[0]), Y(p[1]), r || 4.5, 0, TAU); c2.fillStyle = color; c2.fill(); }

      function render() {
        geom();
        kit.background();
        const box = { x: X(-R), y: Y(R), w: 2 * R * unit, h: 2 * R * unit };
        // 网格
        c2.save(); c2.strokeStyle = 'rgba(27,36,51,0.10)'; c2.lineWidth = 1; c2.beginPath();
        for (let v = -R; v <= R; v++) {
          c2.moveTo(X(v), Y(-R)); c2.lineTo(X(v), Y(R));
          c2.moveTo(X(-R), Y(v)); c2.lineTo(X(R), Y(v));
        }
        c2.stroke(); c2.restore();
        // 坐标轴与刻度
        GW.draw.arrow(c2, box.x, Y(0), box.x + box.w + 10, Y(0), { color: INK, width: 1.6, head: 10 });
        GW.draw.arrow(c2, X(0), box.y + box.h + 6, X(0), box.y - 10, { color: INK, width: 1.6, head: 10 });
        c2.save(); c2.font = '13px ' + MATH; c2.fillStyle = GRAY;
        c2.textAlign = 'center'; c2.textBaseline = 'top';
        for (let v = -R + 2; v <= R - 2; v += 2) if (v) c2.fillText(fmt(v), X(v), Y(0) + 4);
        c2.textAlign = 'right'; c2.textBaseline = 'middle';
        for (let v = -R + 2; v <= R - 2; v += 2) if (v) c2.fillText(fmt(v), X(0) - 5, Y(v));
        c2.font = 'italic 16px ' + MATH; c2.fillStyle = INK;
        c2.textAlign = 'right'; c2.textBaseline = 'bottom'; c2.fillText('x', box.x + box.w + 6, Y(0) - 6);
        c2.textAlign = 'left'; c2.textBaseline = 'top'; c2.fillText('y', X(0) + 8, box.y - 6);
        c2.textAlign = 'right'; c2.textBaseline = 'top'; c2.fillText('O', X(0) - 4, Y(0) + 3);
        c2.restore();

        const img = image();
        c2.save(); c2.beginPath(); c2.rect(box.x, box.y, box.w, box.h); c2.clip();

        // ---- 各模式的辅助图 ----
        if (st.mode === 'reflect') {
          const AX = { x: 'x 轴', y: 'y 轴', yx: '直线 y = x', 'x=m': '直线 x = ' + fmt(st.m) }[st.axis];
          let a, b;
          if (st.axis === 'x') { a = [-R, 0]; b = [R, 0]; }
          else if (st.axis === 'y') { a = [0, -R]; b = [0, R]; }
          else if (st.axis === 'yx') { a = [-R, -R]; b = [R, R]; }
          else { a = [st.m, -R]; b = [st.m, R]; }
          line(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), GOLD, 2.4, [10, 6]);
          halo(AX, X(b[0]), Y(b[1]) - 12, '#b9741a', 'bold 14px ' + FONT, 'center', 'bottom');
        } else if (st.mode === 'rotate') {
          const p0 = st.P[0], cxp = X(st.cx), cyp = Y(st.cy);
          const rr = Math.hypot(X(p0[0]) - cxp, Y(p0[1]) - cyp);
          const a0 = Math.atan2(p0[1] - st.cy, p0[0] - st.cx), th = rotRad(params());
          const steps = Math.max(10, Math.round(Math.abs(th) / (Math.PI / 36)));
          c2.save(); c2.strokeStyle = GOLD; c2.lineWidth = 2.4; c2.setLineDash([6, 5]); c2.beginPath();
          for (let i = 0; i <= steps; i++) {
            const a = a0 + th * i / steps, px = cxp + rr * Math.cos(a), py = cyp - rr * Math.sin(a);
            if (i) c2.lineTo(px, py); else c2.moveTo(px, py);
          }
          c2.stroke(); c2.restore();
          const am = a0 + th / 2;
          halo(fmt(st.deg) + '° ' + (st.dir === 'ccw' ? '逆时针' : '顺时针'), cxp + (rr + 18) * Math.cos(am), cyp - (rr + 18) * Math.sin(am), '#b9741a', 'bold 14px ' + FONT);
          dot([st.cx, st.cy], GOLD, 5);
        } else if (st.mode === 'dilate') {
          const sgn = st.k >= 0 ? 2.2 : -2.2;
          st.P.forEach((q) => line(X(st.cx), Y(st.cy), X(st.cx + (q[0] - st.cx) * sgn), Y(st.cy + (q[1] - st.cy) * sgn), 'rgba(242,165,65,0.9)', 1.6, [7, 5]));
          dot([st.cx, st.cy], GOLD, 5);
        }

        // ---- 对应点连线 ----
        if (st.links) st.P.forEach((q, i) => line(X(q[0]), Y(q[1]), X(img[i][0]), Y(img[i][1]), 'rgba(91,101,118,0.7)', 1.6, [6, 5]));

        // ---- 像（红）与原图（蓝）----
        poly(img, RED, 'rgba(228,87,46,0.13)');
        poly(st.P, BLUE, 'rgba(51,102,255,0.13)');
        const gx = (st.P[0][0] + st.P[1][0] + st.P[2][0]) / 3, gy = (st.P[0][1] + st.P[1][1] + st.P[2][1]) / 3;
        const igx = (img[0][0] + img[1][0] + img[2][0]) / 3, igy = (img[0][1] + img[1][1] + img[2][1]) / 3;
        st.P.forEach((q, i) => {
          dot(q, BLUE); dot(img[i], RED);
          const L = Math.hypot(q[0] - gx, q[1] - gy) || 1;
          halo(NAME[i], X(q[0]) + (q[0] - gx) / L * 17, Y(q[1]) - (q[1] - gy) / L * 17, BLUE);
          const L2 = Math.hypot(img[i][0] - igx, img[i][1] - igy) || 1;
          const same = Math.hypot(img[i][0] - q[0], img[i][1] - q[1]) < 0.3;   // 恒等变换时把像的标签挪开
          halo(NAME2[i],
            X(img[i][0]) + (img[i][0] - igx) / L2 * 17 + (same ? 14 : 0),
            Y(img[i][1]) - (img[i][1] - igy) / L2 * 17 + (same ? 18 : 0), RED);
        });
        c2.restore();

        const MN = { translate: '平移', reflect: '轴对称', rotate: '旋转', dilate: '位似' };
        text(MN[st.mode] + '：原图 ABC（蓝）→ 像 A′B′C′（红）', 14, 16, GRAY, '15px ' + FONT);
      }

      // ---------- 面板 ----------
      const panel = kit.panel;
      const modeSeg = GW.ui.segmented({
        options: [{ value: 'translate', label: '平移' }, { value: 'reflect', label: '轴对称' }, { value: 'rotate', label: '旋转' }, { value: 'dilate', label: '位似' }],
        value: st.mode,
        onChange: (v) => { st.mode = v; build(); save(); dirty = true; },
      });
      panel.append(GW.ui.group('变换', modeSeg.el));
      const optBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      panel.append(GW.ui.group('参数', optBox));
      const linksTg = GW.ui.toggle({ label: '连接对应点', value: st.links, onChange: (v) => { st.links = v; save(); dirty = true; } });
      panel.append(GW.ui.group('显示', linksTg.el));

      const rd = NAME.concat(NAME2).concat(['规律']).map((t) => GW.ui.readout(t));
      panel.append(GW.ui.group('读数', ...rd.map((r) => r.el)));

      // 按模式重建参数区：平移是两个 slider，轴对称是 select（+ m），旋转是中心坐标、角度、方向，位似是中心与 k
      function build() {
        modeSeg.set(st.mode);
        optBox.innerHTML = '';
        if (st.mode === 'translate') {
          optBox.append(GW.ui.slider({ label: '水平平移 dx', min: -9, max: 9, step: 1, value: st.dx, onInput: (v) => { st.dx = v; save(); dirty = true; } }).el);
          optBox.append(GW.ui.slider({ label: '竖直平移 dy', min: -9, max: 9, step: 1, value: st.dy, onInput: (v) => { st.dy = v; save(); dirty = true; } }).el);
        } else if (st.mode === 'reflect') {
          optBox.append(GW.ui.select({
            label: '对称轴',
            options: [{ value: 'x', label: 'x 轴' }, { value: 'y', label: 'y 轴' }, { value: 'yx', label: '直线 y = x' }, { value: 'x=m', label: '直线 x = m' }],
            value: st.axis,
            onChange: (v) => { st.axis = v; build(); save(); dirty = true; },
          }).el);
          if (st.axis === 'x=m') optBox.append(GW.ui.slider({ label: 'm（直线 x = m）', min: -9, max: 9, step: 1, value: st.m, onInput: (v) => { st.m = v; save(); dirty = true; } }).el);
        } else if (st.mode === 'rotate') {
          optBox.append(GW.ui.slider({ label: '旋转中心 x', min: -9, max: 9, step: 1, value: st.cx, onInput: (v) => { st.cx = v; save(); dirty = true; } }).el);
          optBox.append(GW.ui.slider({ label: '旋转中心 y', min: -9, max: 9, step: 1, value: st.cy, onInput: (v) => { st.cy = v; save(); dirty = true; } }).el);
          optBox.append(GW.ui.segmented({ options: [{ value: 90, label: '90°' }, { value: 180, label: '180°' }, { value: 270, label: '270°' }], value: st.deg, onChange: (v) => { st.deg = +v; save(); dirty = true; } }).el);
          optBox.append(GW.ui.segmented({ options: [{ value: 'ccw', label: '逆时针' }, { value: 'cw', label: '顺时针' }], value: st.dir, onChange: (v) => { st.dir = v; save(); dirty = true; } }).el);
        } else {
          const kSl = GW.ui.slider({
            label: '位似比 k', min: -3, max: 3, step: 0.5, value: st.k,
            onInput: (v) => { if (v === 0) { st.k = st.k < 0 ? -0.5 : 0.5; kSl.set(st.k); } else st.k = v; save(); dirty = true; },
          });
          optBox.append(kSl.el);
          optBox.append(GW.ui.slider({ label: '位似中心 x', min: -9, max: 9, step: 1, value: st.cx, onInput: (v) => { st.cx = v; save(); dirty = true; } }).el);
          optBox.append(GW.ui.slider({ label: '位似中心 y', min: -9, max: 9, step: 1, value: st.cy, onInput: (v) => { st.cy = v; save(); dirty = true; } }).el);
        }
        dirty = true;
      }

      function updateReadouts() {
        const img = image();
        for (let i = 0; i < 3; i++) { rd[i].set(pt(st.P[i])); rd[i + 3].set(pt(img[i])); }
        rd[6].set(rule());
      }

      // ---------- 拖动原图顶点：吸附到整数格点 ----------
      kit.drag(
        (p) => {
          geom();
          const wx = (p.x - OX) / unit, wy = (OY - p.y) / unit;
          let best = -1, bd = 0.6;
          st.P.forEach((q, i) => { const d = Math.hypot(q[0] - wx, q[1] - wy); if (d < bd) { bd = d; best = i; } });
          return best < 0 ? null : best;
        },
        (i, p) => {
          geom();
          st.P[i] = [clamp(Math.round((p.x - OX) / unit), -9, 9), clamp(Math.round((OY - p.y) / unit), -9, 9)];
          dirty = true;
        },
        () => save(),
      );

      build();
      kit.loop(() => {
        if (!dirty || !W) return;
        dirty = false;
        render();
        updateReadouts();
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
