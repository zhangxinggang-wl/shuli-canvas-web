/* 数理无限画布 · 高中物理 · 电阻箱读数（逐元素复刻 ggb「12.3 电阻箱」）
 * 四个旋钮（×1000 / ×100 / ×10 / ×1）：外圈绿环 r=1、内圈 r=0.5，内圈上 10 个红点，
 * 0–9 十个数字沿圆周自正下方起逆时针排列（每个数字各自旋转），正下方 ▲ 所指的数字即该挡位读数。
 * 「切换」选挡位、「加 / 减」改数字（改动后自动收起答案），读数 R = 1000n₁ + 100n₂ + 10n₃ + n₄。
 */
(function () {
  'use strict';
  const INK = '#1b2433', GREEN = '#159447', RED = '#e02020', BROWN = '#a85c34', AMBER = '#c9761c';
  const TAU = Math.PI * 2;
  // 旋钮：位置、倍率、挡位名（顺序＝原文 l4「千,百,十,个」＝ n1..n4）
  const DIALS = [
    { x: -1.5, y: 1.5, cap: '×1000', unit: '千' },
    { x: 1.5, y: 1.5, cap: '×100', unit: '百' },
    { x: -1.5, y: -1.5, cap: '×10', unit: '十' },
    { x: 1.5, y: -1.5, cap: '×1', unit: '个' },
  ];

  GW.registerSim({
    id: 'phy-resbox', name: '电阻箱读数', category: 'physics', group: '电磁学',
    desc: '四旋钮电阻箱：切换挡位后用「加 / 减」改变数字，读出 ▲ 所指数字，按 ×1000/×100/×10/×1 相加得总电阻',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="4.5"/><circle cx="16.5" cy="16.5" r="4.5"/><path d="M8 3.5v1.2M16.5 12v1.2"/><circle cx="8" cy="8" r="1"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const S = ctx.state;
      // 每次打开随机一个读数（原件固定 2,1,6,2 → 2162 Ω；改成随机后可以反复练读数）
      S.n = Array.isArray(S.n) && S.n.length === 4 ? S.n : [0, 1, 2, 3].map(() => Math.floor(Math.random() * 10));
      S.sel = S.sel == null ? 0 : S.sel;                                    // 原件 l4 默认选「千」
      S.show = S.show === true;                                             // 答案默认收起（原件复选框 a 默认 true）

      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 780, H = 640;
      let dirty = true;
      const view = { s: 70, X: (x) => x, Y: (y) => y };

      // ---------- 实物照片（原件 pic1，几何不同：左下方 4 单位宽）----------
      const photo = new Image();
      let photoOK = false;
      photo.onload = () => { photoOK = true; dirty = true; };
      photo.onerror = () => { photoOK = false; };
      photo.src = (location.pathname.indexOf('/simhtml/') >= 0 ? '../../' : '') + 'assets/resbox.jpg';

      function label(t, x, y, col, align, font) {
        c.save(); c.font = font || '15px sans-serif'; c.fillStyle = col || INK;
        c.textAlign = align || 'center'; c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 4; c.lineJoin = 'round';
        c.strokeText(t, x, y); c.fillText(t, x, y); c.restore();
      }
      const R = () => 1000 * S.n[0] + 100 * S.n[1] + 10 * S.n[2] + S.n[3];

      // ---------- 画一页 ----------
      function draw() {
        kit.background();
        // 世界坐标 → 屏幕：面板 x∈[-3,3] y∈[-3.8,2.8]，照片占 x∈[-6.15,-3.35]
        view.s = Math.min((W - 56) / 9.5, (H - 60) / 7.1);
        const s = view.s, ox = W / 2 + 1.575 * s, oy = H / 2 - 0.45 * s;
        view.X = (x) => ox + x * s;
        view.Y = (y) => oy - y * s;
        const X = view.X, Y = view.Y;

        // 底板（原件多边形 q1：(−3,−3.8)(−3,2.8)(3,2.8)(3,−3.8)，棕色边）
        c.save(); c.fillStyle = 'rgba(153,51,0,0.09)'; c.strokeStyle = BROWN; c.lineWidth = 2.2;
        c.beginPath(); c.rect(X(-3), Y(2.8), 6 * s, 6.6 * s); c.stroke(); c.restore();

        // 实物照（原件 pic1：贴在面板左侧，4 单位宽）
        if (photoOK) {
          const pw = 2.8 * s, ph = pw * photo.height / photo.width;
          c.save(); c.drawImage(photo, X(-3) - 0.35 * s - pw, Y(-0.5) - ph / 2, pw, ph); c.restore();
        }

        const fsDigit = Math.max(13, Math.round(0.38 * s));
        const fsCap = Math.max(12, Math.round(0.275 * s));
        DIALS.forEach((d, i) => {
          const cx = X(d.x), cy = Y(d.y), r1 = s, r2 = 0.5 * s;
          const on = i === S.sel;
          // 选中挡位的柔光底
          if (on) {
            c.save(); c.fillStyle = 'rgba(201,118,28,0.09)';
            c.beginPath(); c.arc(cx, cy, 1.12 * s, 0, TAU); c.fill(); c.restore();
          }
          // 双环
          c.save(); c.strokeStyle = GREEN; c.lineWidth = Math.max(1.8, 0.042 * s);
          c.beginPath(); c.arc(cx, cy, r1, 0, TAU); c.stroke();
          c.beginPath(); c.arc(cx, cy, r2, 0, TAU); c.stroke();
          // 内圈 10 个红点（自正下方起逆时针 36°）
          c.fillStyle = RED;
          for (let k = 0; k < 10; k++) {
            const b = k * TAU / 10;
            c.beginPath(); c.arc(cx + r2 * Math.sin(b), cy + r2 * Math.cos(b), Math.max(1.8, 0.026 * s), 0, TAU); c.fill();
          }
          // 中心轴
          c.fillStyle = GREEN;
          c.beginPath(); c.arc(cx, cy, Math.max(1.6, 0.026 * s), 0, TAU); c.fill();
          c.restore();
          // 0–9 数字：第 k 个在“自正下方逆时针 36k°”，字身随之转 -36k（字头朝圆心）
          const rd = 0.76 * s;
          c.save(); c.font = 'bold ' + fsDigit + 'px "Times New Roman", Georgia, serif';
          c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = INK;
          for (let k = 0; k < 10; k++) {
            const b = k * TAU / 10;
            c.save();
            c.translate(cx + rd * Math.sin(b), cy + rd * Math.cos(b));
            c.rotate(-b);
            c.fillText(String((S.n[i] + k) % 10), 0, 0);
            c.restore();
          }
          c.restore();
          // ▲ 指示 + 倍率
          const ty = Y(d.y - 1.30);
          c.save(); c.fillStyle = on ? AMBER : '#231f20';
          c.beginPath();
          c.moveTo(cx, ty - 0.10 * s); c.lineTo(cx - 0.085 * s, ty + 0.015 * s); c.lineTo(cx + 0.085 * s, ty + 0.015 * s);
          c.closePath(); c.fill(); c.restore();
          label(d.cap, cx, Y(d.y - 1.48), on ? AMBER : '#3a3f4a', 'center',
            (on ? 'bold ' : '') + fsCap + 'px "Times New Roman", Georgia, serif');
        });
      }

      // ---------- 面板 ----------
      const seg = GW.ui.segmented({
        options: DIALS.map((d) => ({ value: d.unit, label: d.unit })),
        value: DIALS[S.sel].unit,
        onChange: (v) => { S.sel = Math.max(0, DIALS.findIndex((d) => d.unit === v)); sync(); },
      });
      const step = (dir) => {
        S.n[S.sel] = (S.n[S.sel] + dir + 10) % 10;
        S.show = false;                       // 原件 javascript：ggb.setValue("a", 0)
        sync();
      };
      const bInc = GW.ui.button({ label: '加', primary: true, onClick: () => step(1) });
      const bDec = GW.ui.button({ label: '减', onClick: () => step(-1) });
      const tAns = GW.ui.toggle({ label: '答案', value: S.show, onChange: (v) => { S.show = v; sync(); } });
      const roR = GW.ui.readout('读数 R');
      const note = GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: '1.65', marginTop: '2px' } });
      const row = GW.h('div', { style: { display: 'flex', gap: '8px' } }, bInc.el, bDec.el);
      kit.panel.append(
        GW.ui.group('切换挡位（也可直接点表盘）', seg.el, row),
        GW.ui.group('答案', tAns.el),
        GW.ui.group('读数', roR.el, note)
      );

      function sync() {
        seg.set(DIALS[S.sel].unit);
        tAns.set(S.show);
        roR.set(S.show ? '<span style="color:' + RED + '">' + R() + ' Ω</span>' : '—');
        note.innerHTML = S.show
          ? 'R = ' + S.n[0] + '×1000 + ' + S.n[1] + '×100 + ' + S.n[2] + '×10 + ' + S.n[3] + '×1 = <b>' + R() + ' Ω</b>'
          : '读数＝每个旋钮正下方 ▲ 所指数字 × 该挡倍率，再把四个数相加。';
        dirty = true;
        ctx.save();
      }
      sync();

      // 点表盘切换当前挡位（画布坐标＝CSS 像素）
      const cv = kit.canvas;
      const pick = (e) => {
        const r = cv.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        for (let i = 0; i < 4; i++) {
          const d = DIALS[i];
          if (Math.hypot(px - view.X(d.x), py - view.Y(d.y)) < 1.2 * view.s) return i;
        }
        return -1;
      };
      cv.addEventListener('pointerdown', (e) => {
        const i = pick(e);
        if (i >= 0 && i !== S.sel) { S.sel = i; sync(); }
      });
      cv.addEventListener('pointermove', (e) => { cv.style.cursor = pick(e) >= 0 ? 'pointer' : ''; });

      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      kit.running = false;
      kit.loop(() => { if (dirty) { dirty = false; draw(); } });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
