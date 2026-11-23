/* 数理无限画布 · 初中数学 · 数轴与有理数
 * 拖点读数；相反数关于原点对称、绝对值就是到原点的距离、有理数加减看成在数轴上「跳」
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#5b6576';
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const TAU = Math.PI * 2;

  // 负号统一写 −（U+2212，和 math-prob.js 的 dec() 一致）；整数不拖小数点
  const dec = (v, d = 2) => {
    if (!isFinite(v)) return '—';
    const r = Math.abs(v) < 1e-9 ? 0 : v;
    const s = Math.abs(r % 1) < 1e-9 ? String(Math.round(r)) : r.toFixed(d).replace(/\.?0+$/, '');
    return s.replace('-', '−');
  };

  GW.registerSim({
    id: 'math-numline', name: '数轴与有理数', category: 'math', group: '初中 · 数与代数',
    desc: '拖动点读数；相反数、绝对值、有理数加减在数轴上演示',
    keywords: '数轴 有理数 相反数 绝对值 正数 负数 加法 减法 比较大小 七年级 初中',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h17M20 12l-3-2.4M20 12l-3 2.4M6 12v-3M9 12v-3M12 12v-4M15 12v-3M18 12v-3"/><circle cx="8" cy="12" r="2" fill="currentColor" stroke="none"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const st = ctx.state;

      // ---------- 状态：逐个字段校验并给默认值（「重新开始」会把 state 置成 {}） ----------
      const num = (v, def, lo, hi) => GW.clamp(isFinite(+v) ? +v : def, lo, hi);
      if (!['point', 'add'].includes(st.mode)) st.mode = 'point';
      st.a = num(st.a, -3, -20, 20);
      st.b = num(st.b, 5, -20, 20);
      if (!['+', '-'].includes(st.op)) st.op = '+';
      st.range = +st.range === 20 ? 20 : 10;
      if (st.showOpp == null) st.showOpp = true; else st.showOpp = !!st.showOpp;
      if (st.showAbs == null) st.showAbs = true; else st.showAbs = !!st.showAbs;
      // 老文件 / 越界值：a、b 必须落在当前范围里，否则点画到数轴外面去了
      st.a = GW.clamp(st.a, -st.range, st.range);
      st.b = GW.clamp(st.b, -st.range, st.range);

      const kit = GW.simKit.layout(ctx.root, { panelWidth: 260 });
      const c2 = kit.ctx2d;
      let W = 0, H = 0, dirty = true;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      const save = () => ctx.save();

      // ---------- 数学：闭包内的纯函数，画面和读数都调它，不各算各的 ----------
      const fmt = (v) => dec(v, 2);
      const R = () => st.range;
      const clampV = (v) => GW.clamp(Math.round(v * 2) / 2, -R(), R());   // 吸附到 0.5 的倍数
      const oppOf = (a) => (Math.abs(a) < 1e-9 ? 0 : -a);                 // −0 归一成 0
      const expr = (a, b, op) => fmt(a) + (op === '-' ? ' − ' : ' + ') + fmt(Math.abs(b));
      const result = (a, b, op) => clampV(op === '-' ? a - b : a + b);
      // 比较读数：讲「加正数往右、加负数往左」时先看 a 与 b 的大小关系
      const cmpText = () => (st.a < st.b ? 'a < b' : st.a > st.b ? 'a > b' : 'a = b');

      // ---------- 绘制助手 ----------
      function line(x1, y1, x2, y2, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke(); c2.restore();
      }
      function text(t, x, y, color, font, al, bl) { c2.font = font || '15px ' + FONT; c2.fillStyle = color || INK; c2.textAlign = al || 'left'; c2.textBaseline = bl || 'middle'; c2.fillText(t, x, y); }
      // 压在数轴上的标签用白色描边光晕（照 phy-incline.js 的 halo 写法）
      function halo(t, x, y, color, font, al, bl) {
        c2.save(); c2.font = font || 'bold 16px ' + MATH; c2.textAlign = al || 'center'; c2.textBaseline = bl || 'middle';
        c2.lineWidth = 4; c2.lineJoin = 'round'; c2.strokeStyle = 'rgba(255,255,255,0.94)';
        c2.strokeText(t, x, y); c2.fillStyle = color || INK; c2.fillText(t, x, y); c2.restore();
      }
      function dot(x, y, r, color) {
        c2.beginPath(); c2.arc(x, y, r, 0, TAU); c2.fillStyle = color; c2.fill();
        c2.lineWidth = 2; c2.strokeStyle = '#fff'; c2.stroke();
      }
      function rrect(x, y, w, h, r) { c2.beginPath(); c2.moveTo(x + r, y); c2.arcTo(x + w, y, x + w, y + h, r); c2.arcTo(x + w, y + h, x, y + h, r); c2.arcTo(x, y + h, x, y, r); c2.arcTo(x, y, x + w, y, r); c2.closePath(); }
      // 数轴上的坐标映射（画面和拖动共用同一份）
      function geom() {
        const nx = R(), m = 52;
        const x0 = m, x1 = Math.max(m + 40, W - m), y = H * 0.56;
        const sx = (x1 - x0) / (2 * nx);
        return { nx, m, x0, x1, y, sx, X: (v) => x0 + (v + nx) * sx, V: (px) => clampV((px - x0) / sx - nx) };
      }
      // 二次贝塞尔弧线（相反数对称弧 / 加减法的「跳」）
      function quad(p0, p1, p2, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.moveTo(p0[0], p0[1]); c2.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); c2.stroke(); c2.restore();
      }

      // ---------- 数轴 ----------
      function drawAxis() {
        const { nx, x0, x1, y, sx } = geom();
        // 正方向箭头
        GW.draw.arrow(c2, x0 - 30, y, x1 + 4, y, { color: INK, width: 2.2, head: 11 });
        line(x0 - 30, y, x1 + 4, y, INK, 2.2);
        // 单位刻度（range=20 时隔 2 个单位标一次数字，免得挤成一团）
        const labelEvery = nx >= 20 ? 2 : 1;
        for (let v = -nx; v <= nx + 1e-9; v += 1) {
          const px = Math.round((x0 + (v + nx) * sx) * 10) / 10;
          const big = Math.abs(v) < 1e-9 || Math.abs(v % 5) < 1e-9;
          line(px, y - (big ? 9 : 5), px, y + (big ? 9 : 5), v === 0 ? INK : GRAY, big ? 2 : 1.2);
          const whole = Math.abs(v - Math.round(v)) < 1e-9 && Math.round(v) % labelEvery === 0;
          if (whole || v === 0) halo(v === 0 ? 'O' : fmt(v), px, y + 26, v === 0 ? INK : GRAY, (v === 0 ? 'bold 16px ' : '15px ') + MATH, 'center', 'middle');
        }
        halo('正方向', x1 - 6, y - 26, GRAY, '13px ' + FONT, 'right', 'middle');
      }

      // ---------- point 模式：A、相反数 A′、绝对值距离 ----------
      function drawPoint() {
        const { y, X } = geom();
        const a = st.a, zero = X(0), ax = X(a);
        // 相反数：关于原点对称 + 对称弧
        if (st.showOpp) {
          const ox = X(oppOf(a));
          line(ox, y - 34, ox, y + 14, 'rgba(228,87,46,0.45)', 1.4, [5, 4]);
          const mid = (ax + ox) / 2, hgt = Math.max(20, Math.min(64, Math.abs(ax - ox) * 0.18));
          quad([ax, y - 12], [mid, y - 12 - hgt], [ox, y - 12], RED, 1.8, [7, 5]);
          dot(ox, y, 7, 'rgba(228,87,46,0.5)');
          halo('A′ = ' + fmt(oppOf(a)), ox, y - 44, RED, 'bold 16px ' + MATH, 'center', 'middle');
          text('相反数：关于原点对称', mid, y - 12 - hgt - 16, RED, '14px ' + FONT, 'center', 'middle');
        }
        // 绝对值：A 到 0 的距离括线（GOLD）
        if (st.showAbs) {
          const yb = y + 46, xa = Math.min(ax, zero), xb = Math.max(ax, zero);
          line(xa, yb, xb, yb, GOLD, 3);
          line(xa, yb - 7, xa, yb + 7, GOLD, 3);
          line(xb, yb - 7, xb, yb + 7, GOLD, 3);
          line(zero, y + 10, zero, yb + 8, 'rgba(242,165,65,0.6)', 1.2, [4, 4]);
          line(ax, y + 12, ax, yb - 6, 'rgba(242,165,65,0.6)', 1.2, [4, 4]);
          halo('|a| = ' + fmt(Math.abs(a)), (xa + xb) / 2, yb + 22, '#b9741a', 'bold 16px ' + MATH, 'center', 'middle');
        }
        // 点 A
        dot(ax, y, 9, BLUE);
        halo('A = ' + fmt(a), ax, y - 44, BLUE, 'bold 17px ' + MATH, 'center', 'middle');
        text('数轴上的点 A：拖我（吸附到 0.5 的倍数）', 16, 22, GRAY, '14px ' + FONT, 'left', 'middle');
        text('相反数：关于原点对称', 16, 46, st.showOpp ? RED : 'rgba(91,101,118,0.45)', '14px ' + FONT, 'left', 'middle');
        text('绝对值：A 到原点的距离', 16, 68, st.showAbs ? '#b9741a' : 'rgba(91,101,118,0.45)', '14px ' + FONT, 'left', 'middle');
      }

      // ---------- add 模式：从 0 到 a 的箭头，再从 a「跳」b 个单位 ----------
      function drawAdd() {
        const { y, sx, X } = geom();
        const a = st.a, b = st.b, op = st.op;
        const r = result(a, b, op);
        const x0 = X(0), xa = X(a), xr = X(r);
        // 点 A（被加数）
        dot(xa, y, 8, BLUE);
        halo('A = ' + fmt(a), xa, y - 42, BLUE, 'bold 16px ' + MATH, 'center', 'middle');
        // 0 → a：水平箭头（BLUE）
        if (Math.abs(a) > 1e-9) {
          GW.draw.arrow(c2, x0, y - 0.5, xa, y - 0.5, { color: BLUE, width: 3, head: 10 });
          text('从 0 到 a', (x0 + xa) / 2, y - 20, BLUE, '13px ' + FONT, 'center', 'middle');
        }
        // a → a+b：弧形跳跃箭头（RED；op='-' 时朝反方向）
        const step = op === '-' ? -b : b;
        const land = X(clampV(a + step));
        if (Math.abs(step) > 1e-9) {
          const hgt = GW.clamp(Math.abs(land - xa) * 0.22, 30, 96);
          const cxp = (xa + land) / 2;
          const N = 40, pts = [];
          for (let i = 0; i <= N; i++) {
            const t = i / N, u = 1 - t;
            pts.push([u * u * xa + 2 * u * t * cxp + t * t * land, u * u * (y - 10) + 2 * u * t * (y - 10 - hgt) + t * t * (y - 10)]);
          }
          c2.save(); c2.strokeStyle = RED; c2.lineWidth = 3; c2.lineCap = 'round'; c2.beginPath();
          pts.forEach((p, i) => (i ? c2.lineTo(p[0], p[1]) : c2.moveTo(p[0], p[1])));
          c2.stroke(); c2.restore();
          const tail = pts[pts.length - 1], prev = pts[pts.length - 3];
          GW.draw.arrow(c2, prev[0], prev[1], tail[0] + (land > xa ? 3 : -3), tail[1], { color: RED, width: 3, head: 12 });
          halo('跳 ' + fmt(Math.abs(step)) + ' 格', cxp, y - 10 - hgt - 16, RED, 'bold 15px ' + FONT, 'center', 'middle');
          if (op === '-' && Math.abs(b) > 1e-9) text('减 b = 加 (−b) = 加 ' + fmt(oppOf(b)), cxp, y - 10 - hgt - 40, RED, '14px ' + FONT, 'center', 'middle');
        }
        // 终点高亮
        dot(xr, y, 10, GOLD);
        halo('结果 = ' + fmt(r), xr, y + (st.showAbs ? 96 : 44), '#b9741a', 'bold 17px ' + MATH, 'center', 'middle');
        text(expr(a, b, op) + ' = ' + fmt(r), 16, 22, INK, 'bold 17px ' + MATH, 'left', 'middle');
        text(op === '-' ? '减法：从 a 出发朝左跳' : '加法：从 a 出发朝右跳', 16, 48, RED, '14px ' + FONT, 'left', 'middle');
      }

      // ---------- 面板 ----------
      const panel = kit.panel;
      const modeSeg = GW.ui.segmented({
        options: [{ value: 'point', label: '认识数轴' }, { value: 'add', label: '加减运算' }],
        value: st.mode,
        onChange: (v) => { st.mode = v; build(); save(); },
      });
      panel.append(GW.ui.group('模式', modeSeg.el));

      const boxA = GW.ui.slider({ label: 'a', min: -20, max: 20, step: 0.5, value: st.a, onInput: (v) => { st.a = clampV(v); aSl.set(st.a); bSl.set(st.b); dirty = true; save(); } });
      const aSl = boxA;
      const boxB = GW.ui.slider({ label: 'b', min: -20, max: 20, step: 0.5, value: st.b, onInput: (v) => { st.b = clampV(v); bSl.set(st.b); dirty = true; save(); } });
      const bSl = boxB;
      const holdBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      const holdGroup = GW.ui.group('参数', GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, boxA.el), holdBox);
      panel.append(holdGroup);

      const opSeg = GW.ui.segmented({
        options: [{ value: '+', label: '＋ 加' }, { value: '-', label: '− 减' }],
        value: st.op,
        onChange: (v) => { st.op = v; dirty = true; save(); },
      });
      const rngSeg = GW.ui.segmented({
        options: [{ value: '10', label: '±10' }, { value: '20', label: '±20' }],
        value: String(st.range),
        onChange: (v) => { st.range = +v === 20 ? 20 : 10; st.a = clampV(st.a); st.b = clampV(st.b); aSl.set(st.a); bSl.set(st.b); dirty = true; save(); },
      });
      const tOpp = GW.ui.toggle({ label: '显示相反数 A′', value: st.showOpp, onChange: (v) => { st.showOpp = v; dirty = true; save(); } });
      const tAbs = GW.ui.toggle({ label: '显示绝对值 |a|', value: st.showAbs, onChange: (v) => { st.showAbs = v; dirty = true; save(); } });
      // 上面校验时可能把 a、b 夹回过 ±range，滑块要跟上
      aSl.set(st.a); bSl.set(st.b);
      panel.append(GW.ui.group('显示', rngSeg.el, tOpp.el, tAbs.el));

      const dA = GW.ui.readout('a'), dOpp = GW.ui.readout('相反数 −a'), dAbs = GW.ui.readout('绝对值 |a|');
      const dExpr = GW.ui.readout('运算'), dRes = GW.ui.readout('结果'), dCmp = GW.ui.readout('比较');
      panel.append(GW.ui.group('读数', dA.el, dOpp.el, dAbs.el, dExpr.el, dRes.el, dCmp.el));

      function build() {
        modeSeg.set(st.mode);
        holdBox.innerHTML = '';
        bSl.el.style.display = st.mode === 'add' ? '' : 'none';
        if (st.mode === 'add') holdBox.append(opSeg.el);
        dirty = true;
      }
      function updateReadouts() {
        dA.set(fmt(st.a));
        dOpp.set(fmt(oppOf(st.a)));
        dAbs.set(fmt(Math.abs(st.a)));
        if (st.mode === 'add') {
          const r = result(st.a, st.b, st.op);
          dExpr.set(expr(st.a, st.b, st.op) + ' = ' + fmt(r));
          dRes.set(fmt(r));
          dCmp.set(cmpText());
        } else {
          dExpr.set('—');
          dRes.set('—');
          dCmp.set(cmpText());
        }
      }

      // ---------- 拖点 A（命中半径内才接管，松手回弹到 0.5 的倍数） ----------
      kit.drag(
        (p) => {
          if (st.mode !== 'point') return null;
          const g = geom();
          return Math.hypot(p.x - g.X(st.a), p.y - g.y) <= 28 ? 'A' : null;
        },
        (obj, p, e, first) => {
          if (obj !== 'A') return;
          const g = geom();
          const v = GW.clamp(Math.round(g.V(p.x) * 2) / 2, -R(), R());
          if (v === st.a) return;
          st.a = v; aSl.set(st.a); dirty = true;
          if (!first) save();
        },
        () => { dirty = true; save(); }
      );

      build();
      kit.loop(() => {
        if (!dirty || !W || !H) return;
        dirty = false;
        kit.background();
        drawAxis();
        if (st.mode === 'add') drawAdd(); else drawPoint();
        updateReadouts();
      });

      return { destroy() { kit.destroy(); } };
    },
  });
})();
