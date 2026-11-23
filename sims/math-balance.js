/* 数理无限画布 · 初中数学 · 天平与一元一次方程
 * 用天平演示等式的性质：两边同减、同除，天平仍然平衡；只改一边就倾斜
 * 本文件是 7 个初中工具里唯一带持续动画的：倾角固定 ±8°，ease 过渡 320ms 内停稳，停稳后不再改像素
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#5b6576';
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const TAU = Math.PI * 2;

  const TILT_DEG = 8;    // 倾角固定取 ±8°（方案 R7 改法第 4 点）
  const TILT_MS = 320;   // ease 过渡时长；必须 < 400ms 停稳

  // 整数字段统一走这里：非数字 / 越界一律回落默认值（「重新开始」会把 state 置成 {}）
  const int = (v, lo, hi, def) => { const n = isFinite(+v) ? Math.round(+v) : def; return Math.max(lo, Math.min(hi, n)); };

  // 一边的式子：nX 个 x 盒子 + nW 个砝码
  function sideStr(nX, nW) {
    const p = [];
    if (nX > 0) p.push(nX === 1 ? 'x' : nX + 'x');
    if (nW > 0) p.push(String(nW));
    return p.length ? p.join(' + ') : '0';
  }

  GW.registerSim({
    id: 'math-balance', name: '天平与方程', category: 'math', group: '初中 · 数与代数',
    desc: '用天平演示等式的性质，一步步解一元一次方程',
    keywords: '方程 一元一次方程 等式的性质 天平 移项 合并同类项 系数化为1 解方程 七年级 初中',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15M7 21h10"/><path d="M3 9h18"/><path d="M6 9l-3 5h6z"/><path d="M18 9l-3 5h6z"/><circle cx="12" cy="4" r="1.3" fill="currentColor"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const st = ctx.state;

      // ---------- ① 字段校验（state 可能是 {} 或越界值） ----------
      st.reveal = !!st.reveal;
      st.head = typeof st.head === 'string' ? st.head : '';
      st.steps = Array.isArray(st.steps) ? st.steps.filter((s) => typeof s === 'string').slice(-40) : [];
      st.hist = Array.isArray(st.hist) ? st.hist.filter((v) => isFinite(+v)).map((v) => Math.round(+v)) : [];
      if (st.hist.length % 5) st.hist = [];          // 撤回快照固定 5 个数字一组
      if (st.hist.length > 40) st.hist = st.hist.slice(-40);
      // 「只在左边拿走 1 个砝码」的反例标记。为什么失衡要单独记：方案要求反例后「方程」读数
      // 仍是原式（探针 ⑦ 会拿同一份 state 同时复核「方程」与「天平」两个读数），所以只丢一边
      // 这件事不能写进 a/b/c/d，只能记在这个标记里，托盘与天平反映真实重量。
      st.off = (st.off === 1 || st.off === true) ? 1 : 0;

      function normalize() {
        st.x = int(st.x, 1, 9, 3);                   // 未知数的真实值（默认隐藏）
        st.a = int(st.a, 0, 6, 3);                   // 左边 x 盒子个数
        st.c = int(st.c, 0, 6, 1);                   // 右边 x 盒子个数
        if (st.a === st.c) st.c = st.a < 6 ? st.a + 1 : st.a - 1;
        st.b = int(st.b, 0, 12, 2);                  // 左边砝码个数
        st.off = st.off ? 1 : 0;
        if (st.off) st.d = int(st.d, 0, 30, (st.a - st.c) * st.x + st.b);
        else st.d = fixD();
      }
      // d = (a−c)·x + b 必须落在 [0,30]：先挪 b，还越界就把 a / c 收到合法倍数（保证 a≠c）
      function fixD() {
        let d = (st.a - st.c) * st.x + st.b;
        if (d > 30) {
          st.b = Math.max(0, Math.min(12, 30 - (st.a - st.c) * st.x));
          d = (st.a - st.c) * st.x + st.b;
          if (d > 30) {
            st.a = st.c + Math.min(st.a - st.c, Math.floor(30 / st.x));
            st.b = Math.max(0, Math.min(12, 30 - (st.a - st.c) * st.x));
            d = (st.a - st.c) * st.x + st.b;
          }
        } else if (d < 0) {
          st.b = Math.max(0, Math.min(12, -(st.a - st.c) * st.x));
          d = (st.a - st.c) * st.x + st.b;
          if (d < 0) {
            st.c = st.a + Math.min(st.c - st.a, Math.floor(12 / st.x));
            st.b = Math.min(12, (st.c - st.a) * st.x);
            d = (st.a - st.c) * st.x + st.b;
          }
        }
        return d;
      }

      // ---------- ② 纯函数：式子与天平状态（绘制和读数都调它，不各算各的） ----------
      const eqStr = () => sideStr(st.a, st.b) + ' = ' + sideStr(st.c, st.d);
      const leftW = () => st.a * st.x + st.b - st.off;        // 左边的真实重量
      const rightW = () => st.c * st.x + st.d;
      const balStr = () => { const L = leftW(), R = rightW(); return L > R ? '左边重' : (L < R ? '右边重' : '平衡'); };
      const balSign = () => Math.sign(leftW() - rightW());    // >0 左边重（左端下沉）
      const eqHead = () => st.head || eqStr();

      // ---------- ③ 脚手架 ----------
      const kit = GW.simKit.layout(ctx.root, { panelWidth: 260 });
      const c2 = kit.ctx2d;
      let W = 0, H = 0, dirty = true;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      const save = () => ctx.save();
      let tiltShown = 0, tiltFrom = 0, tiltTo = 0, tiltT = 1;  // tiltT>=1 表示已停稳

      // ---------- ④ 绘制助手 ----------
      function line(x1, y1, x2, y2, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; c2.lineCap = 'round'; if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke(); c2.restore();
      }
      function text(t, x, y, color, font, al, bl) { c2.font = font || '15px ' + FONT; c2.fillStyle = color || INK; c2.textAlign = al || 'left'; c2.textBaseline = bl || 'middle'; c2.fillText(t, x, y); }
      function rrect(x, y, w, h, r) { c2.beginPath(); c2.moveTo(x + r, y); c2.arcTo(x + w, y, x + w, y + h, r); c2.arcTo(x + w, y + h, x, y + h, r); c2.arcTo(x, y + h, x, y, r); c2.arcTo(x, y, x + w, y, r); c2.closePath(); }
      function drawXBox(cx, cy, s, label) {   // x 盒子：GOLD 方块，揭晓后标数值
        rrect(cx - s / 2, cy - s / 2, s, s, 5); c2.fillStyle = 'rgba(242,165,65,0.26)'; c2.fill(); c2.lineWidth = 2.4; c2.strokeStyle = GOLD; c2.stroke();
        text(label, cx, cy + 1, '#8a5a10', 'bold ' + Math.round(s * 0.62) + 'px ' + MATH, 'center');
      }
      function drawWeight(cx, cy, r) {        // 砝码：灰色圆片
        const g = c2.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.15, cx, cy, r);
        g.addColorStop(0, '#f0f3f8'); g.addColorStop(1, '#b9c1cf');
        c2.beginPath(); c2.arc(cx, cy, r, 0, TAU); c2.fillStyle = g; c2.fill(); c2.lineWidth = 1.6; c2.strokeStyle = '#7c8698'; c2.stroke();
      }
      // 一只托盘：ex,ey 是横梁端点，plateY 是盘面高度；盘上先摆 x 盒子再摆砝码
      function drawPan(ex, ey, plateY, nX, nW) {
        const hw = 95;
        line(ex, ey, ex - hw, plateY - 11, GRAY, 2);
        line(ex, ey, ex + hw, plateY - 11, GRAY, 2);
        line(ex - hw, plateY, ex + hw, plateY, INK, 5);
        line(ex - hw, plateY, ex - hw, plateY - 11, INK, 4);
        line(ex + hw, plateY, ex + hw, plateY - 11, INK, 4);
        const items = [];
        for (let i = 0; i < nX; i++) items.push(1);
        for (let i = 0; i < nW; i++) items.push(0);
        const per = 10, rows = Math.ceil(items.length / per);
        for (let r = 0; r < rows; r++) {
          const row = items.slice(r * per, (r + 1) * per);
          const y = plateY - 18 - (rows - 1 - r) * 25;   // 最后一行贴着盘面
          let wsum = 0; row.forEach((it) => { wsum += it ? 30 : 19; });
          let x = ex - wsum / 2;
          row.forEach((it) => {
            if (it) { drawXBox(x + 15, y, 26, st.reveal ? String(st.x) : 'x'); x += 30; }
            else { drawWeight(x + 9.5, y, 8.5); x += 19; }
          });
        }
      }
      // 步骤链：按「→」分段折行，避免长式子跑出画布
      function wrapChain(s, x, y, maxW, lh, font) {
        c2.font = font; const parts = s.split(' → '); let cur = '', yy = y;
        parts.forEach((p) => {
          const trial = cur ? cur + ' → ' + p : p;
          if (cur && c2.measureText(trial).width > maxW) { text(cur, x, yy, INK, font); yy += lh; cur = p; }
          else cur = trial;
        });
        if (cur) { text(cur, x, yy, INK, font); yy += lh; }
        return yy;
      }

      // ---------- ⑤ 画面 ----------
      function draw() {
        const pivotX = Math.round(W * 0.5);
        const beamY = Math.max(140, Math.min(200, H * 0.30));
        const half = Math.min(W * 0.36, 250);
        const rope = 150;                                  // 吊绳长
        const ang = tiltShown * Math.PI / 180;
        const bx = (s) => pivotX + s * half * Math.cos(ang);
        const by = (s) => beamY - s * half * Math.sin(ang); // s=−1 左端：倾角>0 时左端更低

        // 方程
        text(eqStr(), pivotX, 34, INK, 'bold 30px ' + MATH, 'center');
        if (st.off) text('✗ 只改了一边，天平不再平衡 —— 请先「撤回一步」', pivotX, 62, RED, 'bold 15px ' + FONT, 'center');

        // 支架与横梁
        c2.beginPath(); c2.moveTo(pivotX, beamY); c2.lineTo(pivotX - 34, beamY + 96); c2.lineTo(pivotX + 34, beamY + 96); c2.closePath();
        c2.fillStyle = '#dfe4ec'; c2.fill(); c2.lineWidth = 2; c2.strokeStyle = GRAY; c2.stroke();
        line(pivotX - 90, beamY + 96, pivotX + 90, beamY + 96, INK, 5);
        line(bx(-1), by(-1), bx(1), by(1), INK, 9);
        c2.beginPath(); c2.arc(pivotX, beamY, 7, 0, TAU); c2.fillStyle = INK; c2.fill();

        // 两只托盘（左边少掉 off 个砝码 —— 反例只丢一边）
        const pyL = by(-1) + rope, pyR = by(1) + rope;
        drawPan(bx(-1), by(-1), pyL, st.a, Math.max(0, st.b - st.off));
        drawPan(bx(1), by(1), pyR, st.c, st.d);
        text('左', bx(-1) - 118, pyL - 10, GRAY, 'bold 15px ' + FONT, 'center');
        text('右', bx(1) + 118, pyR - 10, GRAY, 'bold 15px ' + FONT, 'center');

        // 左下角：步骤记录
        const y0 = Math.min(Math.max(pyL, pyR) + 62, H - 116);
        text('步骤（每一步都两边同做）', 20, y0, GRAY, 'bold 14px ' + FONT);
        wrapChain([eqHead()].concat(st.steps).join(' → '), 20, y0 + 26, W - 40, 26, 'bold 17px ' + MATH);
        text('两边同做一件事，天平仍然平衡；只动一边就倾斜', 20, H - 18, GRAY, '14px ' + FONT);
      }

      // ---------- ⑥ 面板 ----------
      const panel = kit.panel;
      const slA = GW.ui.slider({ label: '左边 x 盒子 a', min: 0, max: 6, step: 1, value: st.a, onInput: (v) => { st.a = v; paramChange(); } });
      const slB = GW.ui.slider({ label: '左边砝码 b', min: 0, max: 12, step: 1, value: st.b, onInput: (v) => { st.b = v; paramChange(); } });
      const slC = GW.ui.slider({ label: '右边 x 盒子 c', min: 0, max: 6, step: 1, value: st.c, onInput: (v) => { st.c = v; paramChange(); } });
      const slX = GW.ui.slider({ label: 'x 的真实值', min: 1, max: 9, step: 1, value: st.x, onInput: (v) => { st.x = v; paramChange(); } });
      const tgReveal = GW.ui.toggle({ label: '揭晓 x', value: st.reveal, onChange: (v) => { st.reveal = !!v; updateReadouts(); dirty = true; save(); } });
      panel.append(GW.ui.group('参数', slA.el, slB.el, slC.el, slX.el, tgReveal.el));

      // 「可用的条件」全部写在这里，按钮的 disabled 与点击里的守卫共用
      const canTakeWeight = () => !st.off && st.b >= 1 && st.d >= 1;   // 两边都有砝码可拿
      const canTakeX = () => !st.off && st.a >= 1 && st.c >= 1;        // 两边都有 x 可拿
      const canTakeLeftOnly = () => !st.off && st.b >= 1;              // 反例：左边还有砝码
      const divN = () => (!st.off && st.c === 0 && st.b === 0 && st.a > 1 && st.d % st.a === 0) ? st.a : 0;  // 化成 nx = m
      const bTakeW = GW.ui.button({ label: '两边各拿走 1 个砝码', onClick: () => { if (!canTakeWeight()) return; push(); st.b -= 1; st.d -= 1; record(); after(); } });
      const bTakeX = GW.ui.button({ label: '两边各拿走 1 个 x', onClick: () => { if (!canTakeX()) return; push(); st.a -= 1; st.c -= 1; record(); after(); } });
      const bDiv = GW.ui.button({ label: '两边同除以 n', onClick: () => { const n = divN(); if (!n) return; push(); st.a = 1; st.d = Math.round(st.d / n); record(); after(); } });
      const bLeft = GW.ui.button({ label: '只在左边拿走 1 个砝码', onClick: () => { if (!canTakeLeftOnly()) return; push(); st.off = 1; st.steps.push('✗ 只改了一边'); after(); } });
      const bUndo = GW.ui.button({ label: '撤回一步', onClick: () => undo() });
      panel.append(GW.ui.group('操作',
        GW.h('div', { class: 'gw-row' }, bTakeW.el), GW.h('div', { class: 'gw-row' }, bTakeX.el),
        GW.h('div', { class: 'gw-row' }, bDiv.el), GW.h('div', { class: 'gw-row' }, bLeft.el),
        GW.h('div', { class: 'gw-row' }, bUndo.el)));

      const rdEq = GW.ui.readout('方程'), rdBal = GW.ui.readout('天平'), rdStep = GW.ui.readout('步数'), rdSol = GW.ui.readout('解');
      panel.append(GW.ui.group('读数', rdEq.el, rdBal.el, rdStep.el, rdSol.el));

      function updateReadouts() {
        rdEq.set(eqStr());
        rdBal.set(balStr());
        rdStep.set(String(st.steps.length));
        rdSol.set(st.reveal ? 'x = ' + st.x : '?');
      }
      function syncPanel() {
        slA.set(st.a); slB.set(st.b); slC.set(st.c); slX.set(st.x);
        tgReveal.set(st.reveal);
        bTakeW.el.disabled = !canTakeWeight();
        bTakeX.el.disabled = !canTakeX();
        bLeft.el.disabled = !canTakeLeftOnly();
        bUndo.el.disabled = st.hist.length < 5;
        const n = divN();
        bDiv.el.disabled = !n;
        bDiv.set(n ? '两边同除以 ' + n : '两边同除以 n');
      }
      // 执行一步前先记快照（撤回用）；第一次动手时把「原式」记进 head，画面上才能显示完整链条
      function push() {
        if (!st.steps.length) st.head = eqStr();
        st.hist.push(st.a, st.b, st.c, st.d, st.off);
        if (st.hist.length > 40) st.hist = st.hist.slice(-40);
      }
      function record() { st.steps.push(eqStr()); }
      function after() { syncPanel(); updateReadouts(); setTiltTarget(); dirty = true; save(); }
      function undo() {
        if (st.hist.length < 5) return;
        const q = st.hist.splice(-5, 5);
        st.a = q[0]; st.b = q[1]; st.c = q[2]; st.d = q[3]; st.off = q[4];
        st.steps.pop();
        if (!st.steps.length) st.head = '';
        after();
      }
      // 拖参数 = 换一道题：清空 steps 与快照，并按 d = (a−c)·x + b 重算
      function paramChange() {
        st.off = 0; st.steps = []; st.hist = []; st.head = '';
        normalize(); syncPanel(); updateReadouts(); setTiltTarget(); dirty = true; save();
      }
      // 倾角目标：只跟「左重 − 右重」的符号有关，取固定 ±8°
      function setTiltTarget() {
        const t = balSign() * TILT_DEG;
        if (t === tiltTo) return;
        tiltFrom = tiltShown; tiltTo = t; tiltT = 0; dirty = true;
      }

      normalize();
      syncPanel();
      updateReadouts();
      tiltShown = tiltFrom = tiltTo = balSign() * TILT_DEG;   // 首帧直接停在目标角度，不做入场动画
      tiltT = 1; dirty = true;

      kit.loop((dt) => {
        if (tiltT < 1) {                                      // ease 过渡：320ms 内走完
          tiltT = Math.min(1, tiltT + (dt || 0.016) / (TILT_MS / 1000));
          const e = 1 - Math.pow(1 - tiltT, 3);
          tiltShown = tiltFrom + (tiltTo - tiltFrom) * e;
          if (tiltT >= 1) tiltShown = tiltTo;                 // 停稳：角度精确落在 ±8°
          dirty = true;
        }
        if (!dirty || !W) return;
        dirty = false;
        kit.background();
        draw();
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
