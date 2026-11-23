/* 数理无限画布 · 高中物理 · 放射性衰变与半衰期（选择性必修三）
 * 每个原子核在 dt 内衰变的概率 p = 1 − e^(−λdt)，λ = ln2 / T½（蒙特卡罗）；理论曲线 N = N₀(1/2)^(t/T½)。
 * 核数少时实际曲线明显偏离理论 —— 「半衰期是大量原子核的统计规律，对少数原子核不适用」。
 * 时间单位用「T½ 的倍数」，与具体核素无关。
 */
(function () {
  'use strict';
  const INK = '#1b2433', SUB = '#5b6576', GRID = '#e3e7ee', RED = '#e02020', CYAN = '#0f9d8a', GOLD = '#f2a541';
  const M = { N: (t, N0, T) => N0 * Math.pow(0.5, t / T), lambda: (T) => Math.LN2 / T, p: (dt, T) => 1 - Math.exp(-Math.LN2 / T * dt) };
  GW.simModels = GW.simModels || {};
  GW.simModels['phy-decay'] = M;
  const SIZES = [4, 16, 100, 400, 1600];
  GW.registerSim({
    id: 'phy-decay', name: '放射性衰变与半衰期', category: 'physics', group: '原子与量子',
    keywords: '半衰期 衰变 放射性 原子核 统计规律 蒙特卡罗 α β 核物理',
    desc: '随机衰变的原子核：N–t 实际曲线与理论 N₀(1/2)^(t/T½) 对照，核数从 4 调到 1600，看统计规律何时成立',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M4 5c4 0 5 7 8 9s6 3 9 3"/><circle cx="17" cy="6" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>',
    width: 1020, height: 620,
    create(ctx) {
      const S = ctx.state;
      S.N0 = S.N0 || 400; S.speed = S.speed || 1;
      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 720, H = 620, t = 0, play = false, nuc = [], hist = [], flash = [];
      const T = 1;                                        // 以 T½ 为时间单位
      function reset() { nuc = new Array(S.N0).fill(1); t = 0; hist = [[0, S.N0]]; flash = []; }
      reset();
      const alive = () => nuc.reduce((a, b) => a + b, 0);
      function txt(s, x, y, font, col, al, bl) { c.font = font || '13px sans-serif'; c.fillStyle = col || INK; c.textAlign = al || 'left'; c.textBaseline = bl || 'alphabetic'; c.fillText(s, x, y); }
      function step(dt) {
        const p = M.p(dt, T);
        for (let i = 0; i < nuc.length; i++) if (nuc[i] && Math.random() < p) { nuc[i] = 0; flash.push({ i, a: 1 }); }
        t += dt; hist.push([t, alive()]);
        if (t >= 6) { play = false; bPlay.set('开始'); }
      }
      function drawGrid(x0, y0, w, h) {
        const n = nuc.length, cols = Math.ceil(Math.sqrt(n * w / h)), rows = Math.ceil(n / cols);
        const cell = Math.min(w / cols, h / rows), r = Math.max(1.5, cell * 0.36);
        for (let i = 0; i < n; i++) {
          const x = x0 + (i % cols + 0.5) * cell, y = y0 + (Math.floor(i / cols) + 0.5) * cell;
          c.fillStyle = nuc[i] ? GOLD : '#d9dee6';
          c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
        }
        flash = flash.filter((f) => (f.a -= 0.04) > 0);
        flash.forEach((f) => { const x = x0 + (f.i % cols + 0.5) * cell, y = y0 + (Math.floor(f.i / cols) + 0.5) * cell; c.strokeStyle = 'rgba(224,32,32,' + f.a + ')'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + (1 - f.a) * 10, 0, Math.PI * 2); c.stroke(); });
        txt('● 未衰变', x0, y0 + h + 22, '13px sans-serif', '#c9761c'); txt('● 已衰变', x0 + 90, y0 + h + 22, '13px sans-serif', '#8a94a6');
      }
      function drawGraph(L, T0, R, B) {
        const X = (tt) => L + tt / 6 * (R - L), Y = (v) => B - v / S.N0 * (B - T0);
        c.save(); c.strokeStyle = GRID; c.lineWidth = 1; c.font = '13px "Times New Roman", sans-serif'; c.fillStyle = SUB;
        for (let k = 1; k <= 6; k++) { c.beginPath(); c.moveTo(X(k), T0); c.lineTo(X(k), B); c.stroke(); c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(k + 'T½', X(k), B + 5); }
        [0.5, 0.25, 0.125].forEach((f) => { c.setLineDash([4, 4]); c.beginPath(); c.moveTo(L, Y(f * S.N0)); c.lineTo(R, Y(f * S.N0)); c.stroke(); c.setLineDash([]); c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(f === 0.5 ? 'N₀/2' : f === 0.25 ? 'N₀/4' : 'N₀/8', L - 6, Y(f * S.N0)); });
        c.textAlign = 'right'; c.fillText('N₀', L - 6, Y(S.N0));
        c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.moveTo(L, B); c.lineTo(R + 8, B); c.moveTo(L, B); c.lineTo(L, T0 - 10); c.stroke();
        c.strokeStyle = CYAN; c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath();
        for (let i = 0; i <= 200; i++) { const tt = 6 * i / 200; i ? c.lineTo(X(tt), Y(M.N(tt, S.N0, T))) : c.moveTo(X(tt), Y(M.N(tt, S.N0, T))); }
        c.stroke(); c.setLineDash([]);
        c.strokeStyle = RED; c.lineWidth = 2.2; c.beginPath();
        hist.forEach(([tt, v], i) => (i ? c.lineTo(X(tt), Y(v)) : c.moveTo(X(tt), Y(v)))); c.stroke();
        c.restore();
        txt('N', L + 8, T0 + 4, 'italic 16px serif'); txt('t', R - 4, B - 8, 'italic 16px serif');
        txt('红：本次随机结果　青虚线：N = N₀(1/2)^(t/T½)', L + 4, B + 40, '12px sans-serif', SUB);
      }
      const segN = GW.ui.segmented({ options: SIZES.map((n) => ({ value: String(n), label: String(n) })), value: String(S.N0), onChange: (v) => { S.N0 = +v; reset(); play = false; bPlay.set('开始'); sync(); } });
      const bPlay = GW.ui.button({ label: '开始', primary: true, onClick: () => { if (t >= 6) reset(); play = !play; bPlay.set(play ? '暂停' : '继续'); } });
      const bReset = GW.ui.button({ label: '重来', onClick: () => { reset(); play = false; bPlay.set('开始'); sync(); } });
      const sS = GW.ui.slider({ label: '播放速度', min: 0.25, max: 2, step: 0.25, value: S.speed, unit: 'T½/s', onInput: (v) => { S.speed = v; sync(); } });
      const ro1 = GW.ui.readout('经过时间'), ro2 = GW.ui.readout('剩余核数 N'), ro3 = GW.ui.readout('理论值 N₀(1/2)^(t/T½)');
      const note = GW.h('div', { style: { fontSize: '12px', color: SUB, lineHeight: '1.65' }, html: '半衰期是<b>大量</b>原子核衰变的统计规律。核数只有 4 个时，多点几次「重来」，每次结果都不一样；1600 个时几乎与理论曲线重合。<br>半衰期由原子核内部决定，与温度、压强、化学状态无关。' });
      kit.panel.append(GW.ui.group('原子核个数 N₀', segN.el), GW.ui.group('播放', GW.h('div', { style: { display: 'flex', gap: '8px' } }, bPlay.el, bReset.el), sS.el), GW.ui.group('读数', ro1.el, ro2.el, ro3.el, note));
      function sync() { ro1.set((t / T).toFixed(2) + ' T½'); ro2.set(String(alive())); ro3.set(M.N(t, S.N0, T).toFixed(1)); ctx.save && ctx.save(); }
      sync();
      kit.onResize((w, h) => { W = w; H = h; });
      kit.loop((dt) => {
        if (play) { step(dt * S.speed); sync(); }
        kit.background();
        const gw = Math.min(W * 0.42, 330);
        drawGrid(20, 30, gw, Math.min(gw, H - 120));
        drawGraph(gw + 90, 40, W - 30, H - 70);
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
