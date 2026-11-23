/* 数理无限画布 · 高中物理 · 透镜成像
 * 薄透镜公式 1/u + 1/v = 1/f（实物 u>0；v>0 实像在异侧，v<0 虚像在同侧；凹透镜 f<0）。
 * 三条特殊光线均按薄透镜几何严格作图：
 *   ① 平行于主光轴的光线 → 折射后过（凸）/ 反向延长线过（凹）像方焦点 F′
 *   ② 过光心的光线 → 方向不变
 *   ③ 过（凸）/ 指向（凹）物方焦点的光线 → 折射后平行于主光轴
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#8a94a6';
  const RAY_COL = ['#e4572e', '#0f9d8a', '#3366ff'];

  GW.registerSim({
    id: 'phy-optics', name: '透镜成像', category: 'physics', group: '光学',
    desc: '凸透镜/凹透镜成像：三条特殊光线作图，实时显示像的位置、大小、正倒、虚实与放大率',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/><path d="M2 12h20"/><path d="M5 12V7M19 12v4"/></svg>',
    width: 1000, height: 620,
    create(ctx) {
      const S = ctx.state;
      if (!S.type) S.type = 'convex';
      if (!S.f) S.f = 100;          // 焦距（像素 = 毫米刻度，1 px = 1 mm）
      if (!S.u) S.u = 260;          // 物距
      if (!S.h) S.h = 70;           // 物高
      if (S.showTable == null) S.showTable = true;
      if (S.showRays == null) S.showRays = [true, true, true];
      const save = () => ctx.save();

      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 750, H = 620;
      kit.onResize((w, h) => { W = w; H = h; });
      // 透镜位于 (LX, AY)
      const LX = () => Math.round(W * 0.5), AY = () => Math.round(H * 0.4);
      const fs = () => (S.type === 'convex' ? S.f : -S.f); // 带符号焦距

      function image() {
        const f = fs(), u = S.u;
        if (Math.abs(u - f) < 0.5) return { inf: true };
        const v = (u * f) / (u - f);
        const m = -v / u; // 横向放大率（带符号：正为正立）
        return { v, m, hi: m * S.h, real: v > 0 };
      }

      // ---------- 绘制助手 ----------
      function line(x1, y1, x2, y2, col, w, dash) {
        c.save(); c.strokeStyle = col; c.lineWidth = w || 2; if (dash) c.setLineDash(dash);
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore();
      }
      // 带中段箭头的光线
      function ray(x1, y1, x2, y2, col) {
        line(x1, y1, x2, y2, col, 2.5);
        const mx = x1 + (x2 - x1) * 0.5, my = y1 + (y2 - y1) * 0.5;
        const L = Math.hypot(x2 - x1, y2 - y1); if (L < 30) return;
        const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
        c.save(); c.fillStyle = col; c.beginPath();
        c.moveTo(mx + ux * 7, my + uy * 7); c.lineTo(mx - ux * 6 - uy * 5, my - uy * 6 + ux * 5); c.lineTo(mx - ux * 6 + uy * 5, my - uy * 6 - ux * 5);
        c.closePath(); c.fill(); c.restore();
      }
      // 从 (x,y) 沿方向 (dx,dy) 延伸到画布边界
      function toEdge(x, y, dx, dy) {
        let t = Infinity;
        if (dx > 1e-9) t = Math.min(t, (W - x) / dx); else if (dx < -1e-9) t = Math.min(t, -x / dx);
        if (dy > 1e-9) t = Math.min(t, (H - y) / dy); else if (dy < -1e-9) t = Math.min(t, -y / dy);
        if (!isFinite(t)) t = 0;
        return [x + dx * t, y + dy * t];
      }
      function arrowObj(x, y0, h, col, dashed) {
        // 竖直箭头：底在主光轴 (x,y0)，高 h（向上为正）
        c.save(); c.strokeStyle = c.fillStyle = col; c.lineWidth = 4;
        if (dashed) c.setLineDash([6, 5]);
        const tip = y0 - h, s = Math.sign(h) || 1;
        c.beginPath(); c.moveTo(x, y0); c.lineTo(x, tip + s * 12); c.stroke();
        c.setLineDash([]);
        c.beginPath(); c.moveTo(x, tip); c.lineTo(x - 9, tip + s * 16); c.lineTo(x + 9, tip + s * 16); c.closePath();
        if (dashed) { c.lineWidth = 2.5; c.stroke(); } else c.fill();
        c.restore();
      }
      function label(t, x, y, col, align, font) {
        c.save(); c.font = font || '15px sans-serif'; c.fillStyle = col || INK; c.textAlign = align || 'center'; c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 4; c.lineJoin = 'round';
        c.strokeText(t, x, y); c.fillText(t, x, y); c.restore();
      }

      function drawLens() {
        const x = LX(), y = AY(), hh = Math.min(H * 0.29, 180);
        c.save();
        c.fillStyle = 'rgba(120,190,230,0.22)'; c.strokeStyle = '#4a90c2'; c.lineWidth = 2.5;
        c.beginPath();
        if (S.type === 'convex') {
          const b = 16;
          c.moveTo(x, y - hh); c.quadraticCurveTo(x + b * 2, y, x, y + hh); c.quadraticCurveTo(x - b * 2, y, x, y - hh);
        } else {
          const b = 16, e = 14;
          c.moveTo(x - e, y - hh); c.lineTo(x + e, y - hh); c.quadraticCurveTo(x + e - b * 2 + 6, y, x + e, y + hh);
          c.lineTo(x - e, y + hh); c.quadraticCurveTo(x - e + b * 2 - 6, y, x - e, y - hh);
        }
        c.closePath(); c.fill(); c.stroke();
        // 透镜符号线（双箭头）
        c.strokeStyle = '#2f6f9c'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x, y - hh); c.lineTo(x, y + hh); c.stroke();
        const head = (yy, d) => {
          c.beginPath();
          if (S.type === 'convex') { c.moveTo(x - 9, yy + d * 10); c.lineTo(x, yy); c.lineTo(x + 9, yy + d * 10); }
          else { c.moveTo(x - 9, yy - d * 10); c.lineTo(x, yy); c.lineTo(x + 9, yy - d * 10); }
          c.stroke();
        };
        head(y - hh, 1); head(y + hh, -1);
        c.restore();
        label(S.type === 'convex' ? '凸透镜' : '凹透镜', x, y - hh - 16, '#2f6f9c');
        label('O', x + 12, y + 14, INK, 'left', 'italic 16px "Times New Roman", serif');
      }

      function drawAxis() {
        const y = AY();
        line(0, y, W, y, 'rgba(27,36,51,0.6)', 1.5, [10, 4, 2, 4]);
        const x0 = LX(), f = S.f;
        const mk = (dx, t) => {
          const x = x0 + dx;
          if (x < 6 || x > W - 6) return;
          c.save(); c.fillStyle = INK; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); c.restore();
          label(t, x, y + 18, INK, 'center', 'italic 16px "Times New Roman", serif');
        };
        mk(-f, 'F'); mk(f, 'F'); mk(-2 * f, '2F'); mk(2 * f, '2F');
      }

      function drawRays() {
        const x0 = LX(), y = AY();
        const ox = x0 - S.u, oy = y - S.h; // 物体顶点
        const f = fs(), img = image();
        const RS = S.showRays;
        const ix = img.inf ? null : x0 + img.v, iy = img.inf ? null : y - img.hi;
        // —— 光线①：平行主光轴入射，在透镜上 (x0, oy) 折射，指向/背离 F′(x0+f, y)
        if (RS[0]) {
          const col = RAY_COL[0];
          ray(ox, oy, x0, oy, col);
          let dx = f, dy = y - oy; // 从折射点指向像方焦点 F′=(x0+f,y)
          if (f < 0) { dx = -f; dy = -(y - oy); } // 凹透镜：出射光线反向延长过物方一侧的 F′=(x0+f, y)
          const L = Math.hypot(dx, dy); dx /= L; dy /= L;
          const e = toEdge(x0, oy, dx, dy);
          ray(x0, oy, e[0], e[1], col);
          if (f < 0) line(x0, oy, x0 + f, y, col, 2, [6, 5]); // 反向延长线到 F
          if (!img.inf && !img.real) line(x0, oy, ix, iy, col, 2, [6, 5]);
        }
        // —— 光线②：过光心，方向不变
        if (RS[1]) {
          const col = RAY_COL[1];
          let dx = x0 - ox, dy = y - oy; const L = Math.hypot(dx, dy); dx /= L; dy /= L;
          ray(ox, oy, x0, y, col);
          const e = toEdge(x0, y, dx, dy);
          ray(x0, y, e[0], e[1], col);
          if (!img.inf && !img.real) line(x0, y, ix, iy, col, 2, [6, 5]);
        }
        // —— 光线③：凸透镜：过物方焦点 F(x0−f) 入射 → 平行射出；凹透镜：指向像方另一侧焦点 F(x0+|f|) 入射 → 平行射出
        if (RS[2]) {
          const col = RAY_COL[2];
          const fx = x0 - f; // 凸：物侧焦点 x0−f；凹（f<0）：另一侧焦点 x0+|f|
          // 直线 物顶点 → (fx, y) 与透镜平面 x = x0 的交点高度；u = f（凸）时该光线竖直，不射到透镜
          const dxl = fx - ox;
          if (Math.abs(dxl) > 0.5) {
            const t = (x0 - ox) / dxl;
            const hy = oy + (y - oy) * t; // 透镜处的高度（屏幕坐标）
            if (isFinite(hy) && Math.abs(hy - y) < H * 3) {
              const visibleHy = hy;
              ray(ox, oy, x0, visibleHy, col);
              if (f > 0 && S.u < S.f) line(fx, y, ox, oy, col, 2, [6, 5]); // u<f：光线“看起来”从 F 发出（物在 F 与透镜之间）
              if (f < 0) line(x0, visibleHy, fx, y, col, 2, [6, 5]); // 凹透镜：入射光线的延长线指向另一侧 F
              ray(x0, visibleHy, W, visibleHy, col);
              if (!img.inf && !img.real) line(x0, visibleHy, ix, iy, col, 2, [6, 5]);
            }
          }
        }
      }

      function drawObjImg() {
        const x0 = LX(), y = AY();
        arrowObj(x0 - S.u, y, S.h, GOLD, false);
        label('物 AB', x0 - S.u, y + 36, '#b9771a');
        const img = image();
        if (img.inf) { label('u = f：不成像（折射光线平行射出）', W / 2, 26, RED); return; }
        const ix = x0 + img.v;
        if (ix > -40 && ix < W + 40 && Math.abs(img.hi) < H * 1.5) {
          arrowObj(ix, y, img.hi, img.real ? RED : '#9b59b6', !img.real);
          label(img.real ? '实像 A′B′' : '虚像 A′B′', ix, img.hi > 0 ? y + 36 : y - 18, img.real ? RED : '#8e44ad');
        } else label('像在画面之外', ix < 0 ? 70 : W - 70, 26, RED);
        // 拖拽手柄
        c.save(); c.strokeStyle = CYAN; c.lineWidth = 2; c.fillStyle = 'rgba(15,157,138,0.12)';
        c.beginPath(); c.arc(x0 - S.u, y - S.h, 14, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.arc(x0 - S.u, y, 12, 0, Math.PI * 2); c.stroke();
        c.restore();
      }

      function zoneOf() {
        const u = S.u, f = S.f;
        if (S.type === 'concave') return 'concave';
        const e = 0.5;
        if (u > 2 * f + e) return 'gt2f';
        if (Math.abs(u - 2 * f) <= e) return 'eq2f';
        if (u > f + e) return 'f2f';
        if (Math.abs(u - f) <= e) return 'eqf';
        return 'ltf';
      }
      const TABLE = [
        ['gt2f', 'u > 2f', 'f < v < 2f', '倒立', '缩小', '实像', '照相机'],
        ['eq2f', 'u = 2f', 'v = 2f', '倒立', '等大', '实像', '测焦距'],
        ['f2f', 'f < u < 2f', 'v > 2f', '倒立', '放大', '实像', '投影仪'],
        ['eqf', 'u = f', '—', '不成像', '', '', '平行光源'],
        ['ltf', 'u < f', '同侧 |v| > u', '正立', '放大', '虚像', '放大镜'],
      ];
      function drawTable() {
        if (!S.showTable) return;
        const z = zoneOf();
        const cols = [86, 92, 44, 44, 44, 64];
        const rowH = 24, x = 10, yb = H - (S.type === 'convex' ? rowH * 6 : rowH * 2) - 10;
        const tw = cols.reduce((a, b) => a + b, 0);
        c.save();
        c.fillStyle = 'rgba(255,255,255,0.94)'; c.strokeStyle = '#d5dbe4'; c.lineWidth = 1;
        const rows = S.type === 'convex' ? TABLE : [['concave', '任意 u', '同侧 |v| < u', '正立', '缩小', '虚像', '近视镜']];
        const th = rowH * (rows.length + 1);
        c.fillRect(x, yb, tw, th); c.strokeRect(x, yb, tw, th);
        c.font = '14px sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'center';
        const heads = ['物距', '像距', '正倒', '大小', '虚实', '应用'];
        let cx = x;
        c.fillStyle = '#eef2f6'; c.fillRect(x, yb, tw, rowH);
        heads.forEach((t, i) => { c.fillStyle = '#5b6576'; c.fillText(t, cx + cols[i] / 2, yb + rowH / 2); cx += cols[i]; });
        rows.forEach((r, k) => {
          const ry = yb + rowH * (k + 1);
          if (r[0] === z) { c.fillStyle = 'rgba(242,165,65,0.28)'; c.fillRect(x, ry, tw, rowH); c.fillStyle = GOLD; c.fillRect(x, ry, 4, rowH); }
          let cx2 = x;
          for (let i = 1; i < r.length; i++) { c.fillStyle = r[0] === z ? INK : '#5b6576'; c.fillText(r[i], cx2 + cols[i - 1] / 2, ry + rowH / 2); cx2 += cols[i - 1]; }
          c.strokeStyle = '#e3e7ee'; c.beginPath(); c.moveTo(x, ry); c.lineTo(x + tw, ry); c.stroke();
        });
        c.restore();
      }

      function drawDims() {
        // 物距、像距标尺
        const x0 = LX(), y = AY(), img = image();
        const yy = y + 62;
        const dim = (xa, xb, t, col) => {
          if (Math.abs(xb - xa) < 4) return;
          c.save(); c.strokeStyle = col; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(xa, yy - 6); c.lineTo(xa, yy + 6); c.moveTo(xb, yy - 6); c.lineTo(xb, yy + 6); c.moveTo(xa, yy); c.lineTo(xb, yy); c.stroke(); c.restore();
          label(t, (xa + xb) / 2, yy - 12, col);
        };
        dim(x0 - S.u, x0, 'u = ' + S.u.toFixed(0), '#b9771a');
        if (!img.inf && Math.abs(img.v) < 3000) {
          const xb = GW.clamp(x0 + img.v, -10, W + 10);
          c.save(); c.translate(0, 28);
          dim(x0, xb, 'v = ' + img.v.toFixed(0) + (img.v < 0 ? '（虚像，与物同侧）' : ''), img.real ? RED : '#8e44ad');
          c.restore();
        }
      }

      // ---------- 交互 ----------
      kit.drag((p) => {
        const x0 = LX(), y = AY();
        if (Math.hypot(p.x - (x0 - S.u), p.y - (y - S.h)) < 22) return 'top';
        if (Math.hypot(p.x - (x0 - S.u), p.y - y) < 20 || (Math.abs(p.x - (x0 - S.u)) < 16 && (p.y - y) * (p.y - (y - S.h)) < 0)) return 'body';
        return null;
      }, (t, p) => {
        const x0 = LX(), y = AY();
        let u = x0 - p.x;
        u = GW.clamp(u, 10, x0 - 15);
        // 吸附到 f、2f
        for (const sn of [S.f, 2 * S.f]) if (Math.abs(u - sn) < 6) u = sn;
        S.u = Math.round(u);
        if (t === 'top') { let h = y - p.y; h = GW.clamp(h, 20, Math.min(160, AY() - 30)); S.h = Math.round(h); sH.set(S.h); }
        sU.set(S.u); updateRO();
      }, () => save());

      // ---------- 面板 ----------
      const typeSeg = GW.ui.segmented({ options: [{ value: 'convex', label: '凸透镜' }, { value: 'concave', label: '凹透镜' }], value: S.type, onChange(v) { S.type = v; updateRO(); save(); } });
      const sF = GW.ui.slider({ label: '焦距 f', min: 50, max: 160, step: 5, value: S.f, unit: 'mm', onInput(v) { S.f = v; updateRO(); save(); } });
      const sU = GW.ui.slider({ label: '物距 u', min: 10, max: 360, step: 1, value: S.u, unit: 'mm', onInput(v) { S.u = v; updateRO(); save(); } });
      const sH = GW.ui.slider({ label: '物高 h', min: 20, max: 160, step: 1, value: S.h, unit: 'mm', onInput(v) { S.h = v; updateRO(); save(); } });
      const snap = GW.h('div', { class: 'gw-row' },
        GW.ui.button({ label: 'u = 2f', onClick() { S.u = 2 * S.f; sU.set(S.u); updateRO(); save(); } }).el,
        GW.ui.button({ label: 'u = f', onClick() { S.u = S.f; sU.set(S.u); updateRO(); save(); } }).el);
      const rayT = ['① 平行主光轴', '② 过光心', '③ 过焦点'].map((t, i) => GW.ui.toggle({ label: t, value: S.showRays[i], onChange(v) { S.showRays[i] = v; save(); } }));
      rayT.forEach((r, i) => { r.el.style.color = RAY_COL[i]; });
      const tTab = GW.ui.toggle({ label: '成像规律表', value: S.showTable, onChange(v) { S.showTable = v; save(); } });
      const rV = GW.ui.readout('像距 v'), rM = GW.ui.readout('放大率 m = |v/u|'), rH = GW.ui.readout('像高 h′'), rN = GW.ui.readout('像的性质');
      const formula = GW.h('div', { style: { fontSize: '13px', color: '#5b6576' } });
      function updateRO() {
        const img = image();
        sU.el.querySelector('input').max = Math.max(200, LX() - 15);
        if (img.inf) { rV.set('∞'); rM.set('—'); rH.set('—'); rN.set('不成像'); }
        else {
          rV.set(img.v.toFixed(1) + ' mm');
          rM.set(Math.abs(img.m).toFixed(2));
          rH.set(Math.abs(img.hi).toFixed(1) + ' mm');
          const am = Math.abs(img.m);
          rN.set((img.m < 0 ? '倒立' : '正立') + '、' + (Math.abs(am - 1) < 0.01 ? '等大' : am > 1 ? '放大' : '缩小') + '的' + (img.real ? '<span style="color:#e4572e">实像</span>' : '<span style="color:#8e44ad">虚像</span>'));
        }
        const f = fs();
        formula.innerHTML = '1/u + 1/v = 1/f<br>1/' + S.u + ' + 1/' + (img.inf ? '∞' : img.v.toFixed(1)) + ' = 1/' + f + (S.type === 'concave' ? '（凹透镜 f 取负，虚像 v 取负）' : '（虚像 v 取负）');
      }
      kit.panel.append(
        GW.ui.group('透镜', typeSeg.el, sF.el),
        GW.ui.group('物体（可在画布上拖动）', sU.el, sH.el, snap),
        GW.ui.group('光线', ...rayT.map((r) => r.el), tTab.el),
        GW.ui.group('成像结果', rV.el, rM.el, rH.el, rN.el, formula),
      );
      updateRO();

      kit.loop(() => {
        kit.background();
        drawAxis();
        drawLens();
        drawRays();
        drawObjImg();
        drawDims();
        drawTable();
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
