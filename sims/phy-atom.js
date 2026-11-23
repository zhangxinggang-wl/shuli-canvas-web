/* 数理无限画布 · 高中物理 · 玻尔模型与氢原子能级跃迁（选择性必修三）
 * Eₙ = E₁/n²，E₁ = −13.6 eV；跃迁辐射（或吸收）光子 hν = |Em − En|，λ = hc/ΔE（hc = 1239.84 eV·nm）。
 * 两种用法：① 单次跃迁（选起止能级）；② 一群氢原子处于第 n 能级，向低能级跃迁最多发出 C(n,2) 种谱线。
 * 能级图纵轴按能量线性画（与教材一致，所以高能级挤在一起是真实比例）。
 */
(function () {
  'use strict';
  const INK = '#1b2433', SUB = '#5b6576', GRID = '#e3e7ee', RED = '#e02020', BLUE = '#3366ff', CYAN = '#0f9d8a', GOLD = '#f2a541';
  const E1 = -13.6, HC = 1239.84, NMAX = 6;
  const M = {
    E: (n) => E1 / (n * n),
    lam: (a, b) => HC / Math.abs(E1 / (a * a) - E1 / (b * b)),   // nm
    lines: (n) => n * (n - 1) / 2,
    series: (low) => (low === 1 ? '莱曼系（紫外）' : low === 2 ? '巴耳末系（含可见光）' : low === 3 ? '帕邢系（红外）' : low === 4 ? '布拉开系（红外）' : '红外'),
  };
  GW.simModels = GW.simModels || {};
  GW.simModels['phy-atom'] = M;
  function lamColor(nm) {
    if (nm < 380) return '#8e5cd9';
    if (nm > 760) return '#9a3b3b';
    const t = [[440, '#6a3cff'], [490, '#3366ff'], [510, '#18a0c8'], [580, '#2fb344'], [645, '#e0a020'], [760, '#e02020']];
    for (const [k, col] of t) if (nm <= k) return col;
    return '#e02020';
  }

  GW.registerSim({
    id: 'phy-atom', name: '氢原子能级跃迁', category: 'physics', group: '原子与量子',
    keywords: '玻尔 能级 跃迁 氢原子 光谱 巴耳末 莱曼 帕邢 电离 光子 一群原子 C(n,2)',
    desc: '玻尔氢原子能级图：选起止能级看辐射 / 吸收光子的能量与波长，或让一群原子从第 n 能级向下跃迁，数出 C(n,2) 条谱线',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 20h18M3 12h18M3 8h18M3 6h18"/><path d="M14 6v13" /><path d="M12 17l2 3 2-3"/></svg>',
    width: 1040, height: 660,
    create(ctx) {
      const S = ctx.state;
      S.mode = S.mode || 'one'; S.ni = S.ni || 3; S.nf = S.nf || 2; S.ng = S.ng || 4;
      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 740, H = 660, ph = 0;
      function txt(s, x, y, font, col, al, bl) { c.font = font || '13px sans-serif'; c.fillStyle = col || INK; c.textAlign = al || 'left'; c.textBaseline = bl || 'alphabetic'; c.fillText(s, x, y); }
      const trans = () => {
        if (S.mode === 'one') return S.ni === S.nf ? [] : [[S.ni, S.nf]];
        const out = []; for (let a = S.ng; a >= 2; a--) for (let b = a - 1; b >= 1; b--) out.push([a, b]); return out;
      };
      function drawLevels(x0, y0, w, h) {
        const Y = (E) => y0 + 18 + (E - 0) / E1 * (h - 40);
        const xl = x0 + 70, xr = x0 + w - 90;
        c.save();
        for (let n = 1; n <= NMAX; n++) {
          const y = Y(M.E(n));
          const hot = (S.mode === 'one' && (n === S.ni || n === S.nf)) || (S.mode === 'group' && n <= S.ng);
          c.strokeStyle = hot ? INK : '#9aa3b2'; c.lineWidth = hot ? 2.2 : 1.3;
          c.beginPath(); c.moveTo(xl, y); c.lineTo(xr, y); c.stroke();
          if (n <= 4 || n === NMAX) { txt(String(n), xl - 14, y, 'italic 15px serif', INK, 'right', 'middle'); txt(M.E(n).toFixed(2).replace('-', '−'), xr + 8, y, '13px "Times New Roman", serif', SUB, 'left', 'middle'); }
        }
        c.setLineDash([5, 4]); c.strokeStyle = '#9aa3b2'; c.beginPath(); c.moveTo(xl, Y(0)); c.lineTo(xr, Y(0)); c.stroke(); c.setLineDash([]);
        txt('∞', xl - 14, Y(0), 'italic 15px serif', INK, 'right', 'middle'); txt('0', xr + 8, Y(0), '13px serif', SUB, 'left', 'middle');
        txt('n', xl - 14, y0 - 2, 'italic 16px serif', INK, 'right'); txt('E/eV', xr + 8, y0 - 2, 'italic 14px serif', INK);
        // 跃迁箭头
        const list = trans();
        list.forEach(([a, b], i) => {
          const x = xl + 30 + (i + 0.5) * (xr - xl - 60) / Math.max(1, list.length);
          const ya = Y(M.E(a)), yb = Y(M.E(b)), nm = M.lam(a, b), col = lamColor(nm), down = b < a;
          c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(x, ya); c.lineTo(x, yb); c.stroke();
          const dir = yb > ya ? 1 : -1;
          c.beginPath(); c.moveTo(x, yb); c.lineTo(x - 5, yb - dir * 10); c.lineTo(x + 5, yb - dir * 10); c.fill();
          if (S.mode === 'one') {
            // 光子波包
            const px = x + (down ? 30 + ph * 140 : 170 - ph * 140), py = (ya + yb) / 2;
            c.beginPath(); for (let k = 0; k <= 60; k++) { const u = k / 60, xx = px + u * 60, yy = py + Math.sin(u * Math.PI * 8) * 7 * Math.sin(u * Math.PI); k ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke();
            txt(down ? '辐射光子 hν' : '吸收光子 hν', x + 28, py - 18, 'bold 13px sans-serif', col);
          }
        });
        c.restore();
        return Y;
      }
      // 右侧：波长刻度（对数），可见光区上彩
      function drawSpectrum(x0, y0, w, h) {
        const lo = Math.log(80), hi = Math.log(2000);
        const Y = (nm) => y0 + 20 + (Math.log(nm) - lo) / (hi - lo) * (h - 50);
        const bx = x0 + 18, bw = 28;
        for (let nm = 380; nm < 760; nm += 4) { c.fillStyle = lamColor(nm); c.globalAlpha = 0.35; c.fillRect(bx, Y(nm), bw, Y(nm + 4) - Y(nm) + 0.5); }
        c.globalAlpha = 1; c.strokeStyle = INK; c.lineWidth = 1.2; c.strokeRect(bx, Y(80), bw, Y(2000) - Y(80));
        [100, 200, 400, 700, 1000, 2000].forEach((nm) => { c.beginPath(); c.moveTo(bx - 4, Y(nm)); c.lineTo(bx, Y(nm)); c.stroke(); txt(String(nm), bx - 6, Y(nm), '11px "Times New Roman", serif', SUB, 'right', 'middle'); });
        txt('λ/nm', bx + bw / 2, y0 + 6, 'italic 13px serif', INK, 'center');
        txt('紫外', bx + bw + 6, Y(200), '12px sans-serif', SUB, 'left', 'middle');
        txt('可见光', bx + bw + 6, Y(520), '12px sans-serif', SUB, 'left', 'middle');
        txt('红外', bx + bw + 6, Y(1400), '12px sans-serif', SUB, 'left', 'middle');
        const list = trans().slice().sort((p, q) => M.lam(p[0], p[1]) - M.lam(q[0], q[1]));
        let lastY = -99;
        list.forEach(([a, b]) => {
          const nm = M.lam(a, b), y = Y(nm), col = lamColor(nm);
          c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(bx, y); c.lineTo(bx + bw, y); c.stroke();
          const ly = Math.max(y, lastY + 16); lastY = ly;
          c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.moveTo(bx + bw, y); c.lineTo(bx + bw + 56, ly); c.stroke();
          txt(a + '→' + b + '  ' + nm.toFixed(1), bx + bw + 60, ly, '12px "Times New Roman", serif', col, 'left', 'middle');
        });
      }

      // ---------- 面板 ----------
      const seg = GW.ui.segmented({ options: [{ value: 'one', label: '单次跃迁' }, { value: 'group', label: '一群原子' }], value: S.mode, onChange: (v) => { S.mode = v; sync(); } });
      const opts = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: 'n = ' + n + '（' + M.E(n).toFixed(2) + ' eV）' }));
      const si = GW.ui.select({ label: '起始能级', options: opts, value: String(S.ni), onChange: (v) => { S.ni = +v; ph = 0; sync(); } });
      const sf = GW.ui.select({ label: '终止能级', options: opts, value: String(S.nf), onChange: (v) => { S.nf = +v; ph = 0; sync(); } });
      const sg = GW.ui.slider({ label: '原子所处能级 n', min: 2, max: 6, step: 1, value: S.ng, onInput: (v) => { S.ng = v; sync(); } });
      const ro = [0, 1, 2, 3].map(() => GW.ui.readout(''));
      const g1 = GW.ui.group('选择能级', si.el, sf.el), g2 = GW.ui.group('一群氢原子', sg.el);
      const note = GW.h('div', { style: { fontSize: '12px', color: SUB, lineHeight: '1.65' } });
      kit.panel.append(GW.ui.group('用法', seg.el), g1, g2, GW.ui.group('读数', ...ro.map((r) => r.el), note));
      const setRO = (i, l, v) => { ro[i].el.firstChild.innerHTML = GW.mathLabel(l); ro[i].set(v); ro[i].el.style.display = l ? '' : 'none'; };
      function sync() {
        g1.style.display = S.mode === 'one' ? '' : 'none'; g2.style.display = S.mode === 'group' ? '' : 'none';
        if (S.mode === 'one') {
          if (S.ni === S.nf) { setRO(0, '光子能量 hν', '—（同一能级）'); setRO(1, '', ''); setRO(2, '', ''); setRO(3, '', ''); }
          else {
            const dE = Math.abs(M.E(S.ni) - M.E(S.nf)), nm = M.lam(S.ni, S.nf);
            setRO(0, (S.nf < S.ni ? '辐射' : '吸收') + '光子能量 hν', dE.toFixed(2) + ' eV');
            setRO(1, '波长 λ = hc/ΔE', nm.toFixed(1) + ' nm'); setRO(2, '频率 ν', (3e8 / (nm * 1e-9) / 1e14).toFixed(2) + '×10¹⁴ Hz');
            setRO(3, '谱线系', M.series(Math.min(S.ni, S.nf)));
          }
          note.innerHTML = '跃迁时光子能量必须<b>恰好</b>等于两能级差 hν = Em − En；从 n 能级电离至少需要 ' + (-M.E(S.ni)).toFixed(2) + ' eV。';
        } else {
          setRO(0, '最多谱线条数 C(n,2)', M.lines(S.ng) + ' 条'); setRO(1, '最长波长', M.lam(S.ng, S.ng - 1).toFixed(1) + ' nm');
          setRO(2, '最短波长', M.lam(S.ng, 1).toFixed(1) + ' nm'); setRO(3, '', '');
          note.innerHTML = '一<b>群</b>氢原子处在 n = ' + S.ng + ' 能级，向低能级跃迁最多发出 C(' + S.ng + ',2) = ' + M.lines(S.ng) + ' 种频率的光；一<b>个</b>氢原子最多只能发出 ' + (S.ng - 1) + ' 种。';
        }
        ctx.save && ctx.save();
      }
      sync();
      kit.onResize((w, h) => { W = w; H = h; });
      kit.loop((dt) => {
        ph = (ph + dt * 0.45) % 1;
        kit.background();
        const lw = Math.max(380, W * 0.64);
        drawLevels(10, 40, lw, H - 60);
        if (W - lw > 160) drawSpectrum(lw + 10, 30, W - lw - 20, H - 50);
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
