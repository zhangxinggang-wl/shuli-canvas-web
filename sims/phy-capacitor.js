/* 数理无限画布 · 高中物理 · 平行板电容器的动态分析（必修三 · 静电场）
 * C = εr·S/(4πkd) = εr·ε₀·S/d；两类问题：
 *   ① 始终与电源相连：U 不变，Q = CU 随 C 变；
 *   ② 充电后断开：Q 不变，U = Q/C；E = Q/(εr·ε₀·S) 与 d 无关（经典结论）。
 * 「设为初态」后，面板用 ↑ ↓ — 列出 C、Q、U、E 相对初态的变化 —— 正是课堂上的动态分析表。
 * 边缘效应忽略（板间视为匀强电场），在界面注明。
 */
(function () {
  'use strict';
  const INK = '#1b2433', SUB = '#5b6576', RED = '#e02020', BLUE = '#3366ff', CYAN = '#0f9d8a', GOLD = '#f2a541';
  const EPS0 = 8.854e-12;
  const M = {
    C: (er, S, d) => er * EPS0 * S / d,          // F（S: m², d: m）
    E: (U, d) => U / d,                           // V/m
    EfromQ: (Q, er, S) => Q / (er * EPS0 * S),    // V/m
  };
  GW.simModels = GW.simModels || {};
  GW.simModels['phy-capacitor'] = M;

  GW.registerSim({
    id: 'phy-capacitor', name: '平行板电容器', category: 'physics', group: '静电场',
    keywords: '电容器 电容 动态分析 介电常数 极板间距 正对面积 静电计 充电后断开 与电源相连',
    desc: '平行板电容器动态分析：保持连接（U 不变）/ 充电后断开（Q 不变），改 d、S、εr，C、Q、U、E 变化一目了然',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8h16M4 16h16"/><path d="M12 2v6M12 16v6"/><path d="M8 11v2M12 11v2M16 11v2"/></svg>',
    width: 1040, height: 640,
    create(ctx) {
      const S = ctx.state;
      S.mode = S.mode || 'U'; S.d = S.d || 4; S.A = S.A || 200; S.er = S.er || 1; S.U0 = S.U0 || 60;
      const kit = GW.simKit.layout(ctx.root);
      const c = kit.ctx2d;
      let W = 740, H = 640, dirty = true;
      let Qlock = S.Qlock || null;                  // 断开瞬间的电荷量（C）
      let ref = S.ref || null;
      const cur = () => {
        const C = M.C(S.er, S.A * 1e-4, S.d * 1e-3);
        let Q, U;
        if (S.mode === 'U') { U = S.U0; Q = C * U; } else { Q = Qlock; U = Q / C; }
        return { C, Q, U, E: U / (S.d * 1e-3) };
      };
      function txt(t, x, y, font, col, al, bl) { c.font = font || '13px sans-serif'; c.fillStyle = col || INK; c.textAlign = al || 'left'; c.textBaseline = bl || 'alphabetic'; c.fillText(t, x, y); }
      function draw() {
        kit.background();
        const v = cur();
        const cx = W * 0.42, cy = H * 0.46;
        const len = 150 + (S.A - 50) / 350 * 260;             // 板长 ∝ 正对面积（侧视示意）
        const gap = 26 + S.d * 22;                              // 板距 ∝ d
        const yT = cy - gap / 2, yB = cy + gap / 2, xL = cx - len / 2, xR = cx + len / 2;
        // 电介质
        if (S.er > 1.001) { c.fillStyle = 'rgba(242,165,65,' + (0.12 + (S.er - 1) * 0.05) + ')'; c.fillRect(xL, yT + 5, len, gap - 10); txt('εr = ' + S.er.toFixed(1), xR - 8, yB - 12, 'italic 14px serif', '#b06a12', 'right'); }
        // 电场线：条数 ∝ E（以 E = 15 kV/m 为 1 条/30px 的参照）
        const n = Math.max(2, Math.min(40, Math.round(v.E / 15000 * len / 30)));
        c.strokeStyle = BLUE; c.fillStyle = BLUE; c.lineWidth = 1.4;
        for (let i = 0; i < n; i++) {
          const x = xL + (i + 0.5) * len / n;
          c.beginPath(); c.moveTo(x, yT + 6); c.lineTo(x, yB - 6); c.stroke();
          const ym = cy + 4; c.beginPath(); c.moveTo(x, ym + 4); c.lineTo(x - 3.5, ym - 4); c.lineTo(x + 3.5, ym - 4); c.fill();
        }
        // 极板 + 电荷（个数 ∝ Q，参照 2 nC）
        c.fillStyle = INK; c.fillRect(xL, yT - 6, len, 6); c.fillRect(xL, yB, len, 6);
        const nq = Math.max(1, Math.min(30, Math.round(v.Q / 2e-9 * 8)));
        for (let i = 0; i < nq; i++) {
          const x = xL + (i + 0.5) * len / nq;
          txt('+', x, yT - 12, 'bold 15px sans-serif', RED, 'center', 'middle');
          txt('−', x, yB + 18, 'bold 15px sans-serif', BLUE, 'center', 'middle');
        }
        txt('+Q', xL - 12, yT - 2, 'italic 16px serif', RED, 'right', 'middle');
        txt('−Q', xL - 12, yB + 4, 'italic 16px serif', BLUE, 'right', 'middle');
        // 板距标注
        c.strokeStyle = SUB; c.lineWidth = 1; c.beginPath(); c.moveTo(xR + 16, yT); c.lineTo(xR + 16, yB); c.moveTo(xR + 11, yT); c.lineTo(xR + 21, yT); c.moveTo(xR + 11, yB); c.lineTo(xR + 21, yB); c.stroke();
        txt('d', xR + 24, cy, 'italic 16px serif', INK, 'left', 'middle');
        return { cx, yT, yB, xL, xR, v };
      }
      function drawCircuit(g) {
        const top = 54, bot = H - 50, lx = 56;
        c.save(); c.strokeStyle = INK; c.lineWidth = 2;
        // 上极板 → 开关 → 电源正极；下极板 → 电源负极
        c.beginPath(); c.moveTo(g.cx, g.yT - 6); c.lineTo(g.cx, top); c.lineTo(lx + 120, top);
        c.moveTo(lx + 70, top); c.lineTo(lx, top); c.lineTo(lx, H / 2 - 16);
        c.moveTo(lx, H / 2 + 16); c.lineTo(lx, bot); c.lineTo(g.cx, bot); c.lineTo(g.cx, g.yB + 6); c.stroke();
        // 开关 S
        c.fillStyle = INK; c.beginPath(); c.arc(lx + 70, top, 3.5, 0, Math.PI * 2); c.arc(lx + 120, top, 3.5, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(lx + 70, top);
        if (S.mode === 'U') c.lineTo(lx + 120, top); else c.lineTo(lx + 114, top - 26);
        c.stroke();
        // 电源（长线正极在上）
        c.lineWidth = 2.4; c.beginPath(); c.moveTo(lx - 18, H / 2 - 16); c.lineTo(lx + 18, H / 2 - 16); c.stroke();
        c.lineWidth = 5; c.beginPath(); c.moveTo(lx - 9, H / 2 + 16); c.lineTo(lx + 9, H / 2 + 16); c.stroke();
        c.restore();
        txt('S', lx + 95, top - 16, 'italic 16px serif', INK, 'center');
        txt('U₀', lx - 24, H / 2 + 4, 'italic 16px serif', INK, 'right', 'middle');
        txt(S.mode === 'U' ? '开关闭合：U 保持不变' : '开关断开：Q 保持不变', lx + 140, top - 12, 'bold 14px sans-serif', S.mode === 'U' ? CYAN : RED);
        // 静电计：金属杆接上极板，外壳接下极板（接地），指针张角 ∝ U
        const ex = Math.min(W - 70, g.xR + 110), ey = H / 2 + 10;
        c.save(); c.strokeStyle = INK; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(g.cx + 1, top); c.lineTo(ex, top); c.lineTo(ex, ey - 46); c.stroke();
        c.beginPath(); c.arc(ex, ey, 46, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
        c.beginPath(); c.moveTo(ex - 44, ey + 10); c.lineTo(ex - 44, ey + 40); c.lineTo(ex + 44, ey + 40); c.lineTo(ex + 44, ey + 10); c.stroke();
        c.beginPath(); c.moveTo(ex, ey + 40); c.lineTo(ex, bot); c.lineTo(g.cx, bot); c.stroke();
        c.lineWidth = 3; c.beginPath(); c.moveTo(ex, ey - 46); c.lineTo(ex, ey + 18); c.stroke();
        const ang = Math.min(1.3, g.v.U / 150 * 1.2);
        c.strokeStyle = RED; c.lineWidth = 2.6; c.beginPath(); c.moveTo(ex, ey - 10); c.lineTo(ex + Math.sin(ang) * 40, ey - 10 + Math.cos(ang) * 40); c.stroke();
        c.restore();
        txt('静电计（张角反映 U）', ex, ey + 58, '12px sans-serif', SUB, 'center');
        txt('板间视为匀强电场，忽略边缘效应；场线疏密 ∝ E，电荷符号个数 ∝ Q', 20, H - 16, '12px sans-serif', SUB);
      }

      // ---------- 面板 ----------
      const seg = GW.ui.segmented({ options: [{ value: 'U', label: '与电源相连' }, { value: 'Q', label: '充电后断开' }], value: S.mode,
        onChange: (v) => { if (v === 'Q' && S.mode !== 'Q') Qlock = cur().Q; S.mode = v; if (v === 'U') Qlock = null; ref = cur(); sync(); } });
      const sd = GW.ui.slider({ label: '板间距离 d', min: 1, max: 10, step: 0.1, value: S.d, unit: 'mm', onInput: (v) => { S.d = v; sync(); } });
      const sA = GW.ui.slider({ label: '正对面积 S', min: 50, max: 400, step: 5, value: S.A, unit: 'cm²', onInput: (v) => { S.A = v; sync(); } });
      const se = GW.ui.slider({ label: '相对介电常数 εr', min: 1, max: 6, step: 0.1, value: S.er, onInput: (v) => { S.er = v; sync(); } });
      const sU = GW.ui.slider({ label: '电源电压 U₀', min: 10, max: 120, step: 1, value: S.U0, unit: 'V', onInput: (v) => { S.U0 = v; sync(); } });
      const bRef = GW.ui.button({ label: '设为初态', primary: true, onClick: () => { ref = cur(); sync(); } });
      const roC = GW.ui.readout('电容 C'), roQ = GW.ui.readout('电荷量 Q'), roU = GW.ui.readout('电压 U'), roE = GW.ui.readout('场强 E');
      const tbl = GW.h('div', { style: { fontSize: '13px', lineHeight: '1.9' } });
      kit.panel.append(
        GW.ui.group('情境', seg.el),
        GW.ui.group('改变条件', sd.el, sA.el, se.el, sU.el),
        GW.ui.group('读数（C = εrS/4πkd）', roC.el, roQ.el, roU.el, roE.el),
        GW.ui.group('相对初态的变化', bRef.el, tbl)
      );
      const arrow = (a, b) => { const r = b / a; return Math.abs(r - 1) < 1e-6 ? '<b style="color:' + SUB + '">不变</b>' : r > 1 ? '<b style="color:' + RED + '">↑ 变大</b>' : '<b style="color:' + BLUE + '">↓ 变小</b>'; };
      function sync() {
        if (S.mode === 'Q' && Qlock == null) Qlock = cur().Q;
        sU.el.style.display = S.mode === 'U' ? '' : 'none';
        const v = cur();
        if (!ref) ref = v;
        roC.set((v.C * 1e12).toFixed(2) + ' pF'); roQ.set((v.Q * 1e9).toFixed(3) + ' nC');
        roU.set(v.U.toFixed(2) + ' V'); roE.set((v.E / 1000).toFixed(2) + ' kV/m');
        tbl.innerHTML = '<i>C</i>：' + arrow(ref.C, v.C) + '　<i>Q</i>：' + arrow(ref.Q, v.Q) + '<br><i>U</i>：' + arrow(ref.U, v.U) + '　<i>E</i>：' + arrow(ref.E, v.E)
          + '<div style="color:' + SUB + ';font-size:12px;line-height:1.6;margin-top:4px">' + (S.mode === 'U' ? 'U 不变：C 变大 ⇒ Q = CU 变大；E = U/d 只看 d。' : 'Q 不变：U = Q/C；E = 4πkQ/(εrS) 与 d 无关 —— 只拉开极板，E 不变。') + '</div>';
        S.Qlock = Qlock; S.ref = ref;
        dirty = true; ctx.save && ctx.save();
      }
      sync();
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      kit.running = false;
      kit.loop(() => { if (!dirty) return; dirty = false; const g = draw(); drawCircuit(g); });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
