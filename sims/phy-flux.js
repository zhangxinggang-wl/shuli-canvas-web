/* 数理无限画布 · 高中物理 · 磁通量
 * 严格按 GeoGebra「13.2 磁通量.ggb」复刻，元素 / 参数 / 开关一一对应，只做视觉美化：
 *
 * 滑块（原课件三个）：
 *   角度 alpha   0°~180°   线框绕 y 轴倾斜的角度
 *   磁场 count   1~10      磁感线的疏密（每维 count+1 根）
 *   右边界 xright −5~5     磁感线阵列向右铺到哪（x 方向格数按它算）
 * 复选框（原课件三个，默认全部不勾）：
 *   仅穿过 e          只保留穿过投影矩形的磁感线
 *   有效面积 f        显示 B′、C′、投影矩形 q2、点线 B→B′/C→C′、青色平面 p
 *   磁通量正负 chkSide  线框 +法线侧薄片蓝（lstSide1）、−法线侧红（lstSide2）
 *
 * 几何（原式）：
 *   A=(3;0;π+α)+(0,−3,0)=(−3cosα,−3,−3sinα)   B=(3cosα,−3,3sinα)
 *   C=(3cosα,3,3sinα)                          D=(−3cosα,3,−3sinα)
 *   B′=(x_B,y_B,z_A)、C′=(x_C,y_C,z_D)：投影矩形落在 z=z_A 的水平面上（不是 z=0）
 *   转轴 l1 = 两段 (0,∓3,0)→(0,∓5,0)；磁感线 z 从 +5 竖直向下到 −5
 * 视图：原 3D 视图 zAngle=−76°、xAngle=27°；画布上可拖动转视角（GeoGebra 3D 本身的交互）。
 */
(function () {
  'use strict';
  const GREEN = '#159447', MAG = '#d63f92', INK = '#1b2433';
  const RED = '#d93b2b', BLUE = '#2b5fd9';

  GW.registerSim({
    id: 'phy-flux', name: '磁通量', category: 'physics', group: '电磁学',
    desc: '按 GeoGebra「13.2 磁通量」原样复刻：角度 / 磁场 / 右边界三滑块与「仅穿过 / 有效面积 / 磁通量正负」三开关，看线框倾斜后的有效面积',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15.5 9.5 6l11 3.5L14 19z"/><path d="M7 3v4"/><path d="M7 5.2 5.6 3.8"/><path d="M7 5.2 8.4 3.8"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      S.f = Object.assign({ alpha: 0, count: 3, xright: 5, only: false, proj: false, side: false }, S.f || {});
      const P = S.f;
      const save = () => ctx.save();

      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 750, H = 620;
      kit.onResize((w, h) => { W = w; H = h; });

      // 原课件 3D 视图角度（zAngle = −76°，xAngle = 27°）；拖动可转视角
      let yaw = -76 * Math.PI / 180, el = 27 * Math.PI / 180, dirA = 1;
      const cam = { cx: 0, cy: 0, s: 1 };
      function proj(x, y, z) {
        const ca = Math.cos(yaw), sa = Math.sin(yaw);
        const x1 = x * ca + y * sa, y1 = -x * sa + y * ca;
        const ce = Math.cos(el), se = Math.sin(el);
        return [cam.cx + x1 * cam.s, cam.cy - (y1 * se + z * ce) * cam.s, y1 * ce - z * se];
      }

      function label(t, x, y, col, align, font) {
        c.save(); c.font = font || '15px sans-serif'; c.fillStyle = col || INK;
        c.textAlign = align || 'center'; c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 4; c.lineJoin = 'round';
        c.strokeText(t, x, y); c.fillText(t, x, y); c.restore();
      }
      function poly(pts, close) {
        c.beginPath();
        pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])));
        if (close !== false) c.closePath();
      }

      // ---------- 几何（与原式一致，半边长固定 3） ----------
      function geo() {
        const ar = P.alpha * Math.PI / 180, ca = Math.cos(ar), sa = Math.sin(ar);
        const a = 3, zA = -a * sa;
        return {
          ar, ca, sa, a, zA,
          A: [-a * ca, -a, zA], B: [a * ca, -a, a * sa],
          C: [a * ca, a, a * sa], D: [-a * ca, a, zA],
          Bp: [a * ca, -a, zA], Cp: [a * ca, a, zA],
          n: [-sa, 0, ca],
        };
      }

      // 磁感线阵：x 方向格数按「右边界」算，y 方向恒为 count+1 根（原 Sequence 内层上限就是 count）
      function grid() {
        const cnt = Math.max(1, Math.round(P.count));
        const nx = Math.floor((P.xright + 5) / 10 * cnt);
        const xs = [], ys = [];
        for (let i = 0; i <= nx; i++) xs.push(-5 + i / cnt * 10);
        for (let j = 0; j <= cnt; j++) ys.push(-5 + j / cnt * 10);
        return { xs, ys };
      }

      // ---------- 绘制 ----------
      function drawFieldLine(x, y) {
        const q = proj(x, y, 5), r = proj(x, y, -5);       // 原：Vector[(x,y,5),(x,y,-5)]，朝下
        c.save();
        c.strokeStyle = GREEN;
        c.lineWidth = 1.5;
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(r[0], r[1]); c.stroke();
        const ux = r[0] - q[0], uy = r[1] - q[1], L = Math.hypot(ux, uy) || 1;
        const hx = ux / L, hy = uy / L, sz = 6.5;
        c.fillStyle = GREEN;
        c.beginPath();
        c.moveTo(r[0], r[1]);
        c.lineTo(r[0] - hx * sz - hy * sz * 0.45, r[1] - hy * sz + hx * sz * 0.45);
        c.lineTo(r[0] - hx * sz + hy * sz * 0.45, r[1] - hy * sz - hx * sz * 0.45);
        c.closePath(); c.fill();
        c.restore();
      }

      function drawField(g, far) {
        const { xs, ys } = grid();
        const xa = Math.min(g.A[0], g.Bp[0]), xb = Math.max(g.A[0], g.Bp[0]);
        const ya = Math.min(g.A[1], g.D[1]), yb = Math.max(g.A[1], g.D[1]);
        // 穿过投影矩形（原式用 A、B′ 的 x 极值与 A、D 的 y 极值，含边界）
        const inside = (x, y) => x >= xa - 1e-9 && x <= xb + 1e-9 && y >= ya - 1e-9 && y <= yb + 1e-9;
        xs.forEach((x) => ys.forEach((y) => {
          const isFar = proj(x, y, 0)[2] >= 0;     // depth 大 = 远；分两批画，形成遮挡
          if (isFar !== far) return;
          if (P.only && !inside(x, y)) return;
          drawFieldLine(x, y);
        }));
      }

      // 有效面积：平面 p（青）+ 投影矩形 q2（洋红）+ 点线垂线
      function drawProj(g) {
        const pad = 1.2;
        const halfW = g.a * Math.abs(g.ca);
        const plane = [
          proj(-halfW - pad, -g.a - pad, g.zA), proj(halfW + pad, -g.a - pad, g.zA),
          proj(halfW + pad, g.a + pad, g.zA), proj(-halfW - pad, g.a + pad, g.zA),
        ];
        c.save();
        poly(plane); c.fillStyle = 'rgba(99,219,219,0.08)'; c.fill();
        c.strokeStyle = 'rgba(63,181,181,0.28)'; c.lineWidth = 1; c.stroke();
        // q2 = [A, B′, C′, D]，与线框共边 A、D
        const Q = [g.A, g.Bp, g.Cp, g.D].map((q) => proj(q[0], q[1], q[2]));
        poly(Q); c.fillStyle = 'rgba(214,63,146,0.14)'; c.fill();
        c.strokeStyle = MAG; c.lineWidth = 2.4; c.stroke();
        // B→B′、C→C′（原 l2：绿色点线）
        c.strokeStyle = GREEN; c.lineWidth = 1.6; c.setLineDash([2, 4]);
        [[g.B, g.Bp], [g.C, g.Cp]].forEach(([u, v]) => {
          const p1 = proj(u[0], u[1], u[2]), p2 = proj(v[0], v[1], v[2]);
          c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke();
        });
        c.restore();
      }

      // 线框 q1：绿色粗边；勾「磁通量正负」按朝向给 +n 侧蓝、−n 侧红（原 lstSide1 / lstSide2）
      function drawFrame(g) {
        const Q = [g.A, g.B, g.C, g.D].map((q) => proj(q[0], q[1], q[2]));
        c.save();
        if (P.side) {
          const o1 = proj(g.n[0] * 0.05, 0, g.n[2] * 0.05)[2];
          const o2 = proj(-g.n[0] * 0.05, 0, -g.n[2] * 0.05)[2];
          c.fillStyle = o1 > o2 ? 'rgba(217,59,43,0.45)' : 'rgba(43,95,217,0.45)';   // 看到的是近侧那一面
        }
        poly(Q); if (P.side) c.fill();
        c.shadowColor = 'rgba(18,129,60,0.35)'; c.shadowBlur = 6;
        c.strokeStyle = GREEN; c.lineWidth = 5.5; c.lineJoin = 'round'; c.stroke();
        c.shadowBlur = 0;
        c.restore();
      }

      // 转轴 l1：(0,∓3,0)→(0,∓5,0)，露在线框外
      function drawAxis() {
        c.save();
        c.strokeStyle = INK; c.lineWidth = 4; c.lineCap = 'round'; c.globalAlpha = 0.7;
        [[-5, -3], [3, 5]].forEach(([y0, y1]) => {
          const p1 = proj(0, y0, 0), p2 = proj(0, y1, 0);
          c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke();
        });
        c.restore();
      }

      // α 角弧：A 点处从水平方向转到线框边方向（视觉标注，不参与计算）
      function drawAngle(g) {
        if (g.ar < 0.06) return;
        const A = g.A, r = 1.15, pts = [];
        for (let k = 0; k <= 20; k++) {
          const t = g.ar * k / 20;
          pts.push(proj(A[0] + r * Math.cos(t), A[1], A[2] + r * Math.sin(t)));
        }
        c.save(); c.strokeStyle = RED; c.lineWidth = 1.6; c.globalAlpha = 0.9;
        poly(pts, false); c.stroke();
        c.setLineDash([4, 4]); c.globalAlpha = 0.45;
        const ap = proj(A[0], A[1], A[2]), h = proj(A[0] + r * 1.1, A[1], A[2]);
        c.beginPath(); c.moveTo(ap[0], ap[1]); c.lineTo(h[0], h[1]); c.stroke();
        c.restore();
        const m = pts[10];
        label('α', m[0] + 14, m[1] - 10, RED, 'center', 'italic bold 16px "Times New Roman", serif');
      }

      function drawLabels(g) {
        const put = (t, q3, col, dx, dy) => {
          const q = proj(q3[0], q3[1], q3[2]);
          let ox = dx || 0, oy = dy || 0;
          if (!dx && !dy) {                       // 不给偏移时沿「中心→顶点」外推
            const ux = q[0] - cam.cx, uy = q[1] - cam.cy, L = Math.hypot(ux, uy) || 1;
            ox = ux / L * 21; oy = uy / L * 21;
          }
          label(t, q[0] + ox, q[1] + oy, col, 'center', 'italic bold 19px "Times New Roman", serif');
        };
        put('A', g.A, RED);
        put('B', g.B, BLUE);
        put('C', g.C, BLUE);
        put('D', g.D, RED);
        if (P.proj) {
          put('B′', g.Bp, MAG, 20, 14);
          put('C′', g.Cp, MAG, 20, -12);
        }
      }

      function drawScene() {
        const g = geo();
        drawField(g, true);           // 远侧磁感线先画
        if (P.proj) drawProj(g);
        drawFrame(g);
        drawAxis();
        drawAngle(g);
        drawField(g, false);          // 近侧磁感线后画（压在线框之上，形成"穿过"的层次）
        drawLabels(g);
      }

      // ---------- 面板：三个滑块 + 三个复选框（与原课件一致） ----------
      const sAlpha = GW.ui.slider({ label: '角度', min: 0, max: 180, step: 1, value: P.alpha, unit: '°', onInput(v) { P.alpha = v; save(); } });
      const sCount = GW.ui.slider({ label: '磁场', min: 1, max: 10, step: 1, value: P.count, onInput(v) { P.count = v; save(); } });
      const sRight = GW.ui.slider({ label: '右边界', min: -5, max: 5, step: 1, value: P.xright, onInput(v) { P.xright = v; save(); } });
      const tOnly = GW.ui.toggle({ label: '仅穿过', value: P.only, onChange(v) { P.only = v; save(); } });
      const tProj = GW.ui.toggle({ label: '有效面积', value: P.proj, onChange(v) { P.proj = v; save(); } });
      const tSide = GW.ui.toggle({ label: '磁通量正负', value: P.side, onChange(v) { P.side = v; save(); } });
      const transport = GW.simKit.transport(kit, () => { P.alpha = 0; dirA = 1; sAlpha.set(0); save(); });
      kit.running = false; transport.setRunning(false);   // 原课件打开时动画是停的（playing=false）

      const note = GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: '1.6' } });
      note.textContent = '线框绕水平轴转过 α：有效面积 S⊥ = S·cos α，磁通量 Φ = B·S·cos α。勾「仅穿过」只看穿过线框的磁感线；勾「有效面积」显示投影矩形；勾「磁通量正负」用蓝/红两面标出磁感线从哪一面穿过。';
      kit.panel.append(
        GW.ui.group('参数', sAlpha.el, sCount.el, sRight.el),
        GW.ui.group('显示', tOnly.el, tProj.el, tSide.el),
        GW.ui.group('播放', transport.el),
        GW.ui.group('说明', note),
      );

      // 拖动转视角（GeoGebra 3D 视图本身的交互）
      kit.drag((pt) => ({ x0: pt.x, y0: pt.y, yaw0: yaw, el0: el }), (t, pt) => {
        // 跟手：往右拖场景向右转；往下拖物体向下翻（俯仰角变大）
        yaw = t.yaw0 - (pt.x - t.x0) * 0.007;
        el = GW.clamp(t.el0 + (pt.y - t.y0) * 0.005, 0.06, 1.25);
      }, () => {});

      kit.loop((dt) => {
        kit.background();
        if (dt > 0 && kit.running) {
          let a = P.alpha + dirA * 12 * dt;      // 原滑块动画：约每秒 12°
          if (a > 180) { a = 360 - a; dirA = -1; } else if (a < 0) { a = -a; dirA = 1; }
          P.alpha = a;
          sAlpha.set(Math.round(a));
        }
        cam.cx = W * 0.5; cam.cy = H * 0.50; cam.s = Math.min(W * 0.062, H * 0.062);
        drawScene();
      });

      return {
        destroy() { kit.destroy(); },
        _advance(t) {
          for (let k = 0; k < t / 0.02; k++) {
            let a = P.alpha + dirA * 12 * 0.02;
            if (a > 180) { a = 360 - a; dirA = -1; } else if (a < 0) { a = -a; dirA = 1; }
            P.alpha = a;
          }
        },
      };
    },
  });
})();
