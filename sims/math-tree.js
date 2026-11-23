/* 数理无限画布 · 初中数学 · 树状图与列表法
 * 不做试验，把所有等可能结果都列出来数：摸球（放回 / 不放回）、掷硬币、掷骰子
 * 与 math-prob.js 的区别：那边靠 Math.random() 做试验看频率，这边是纯列举（enumerate / count 都是纯函数）
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#5b6576';
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const TAU = Math.PI * 2;

  const dec = (v, d = 3) => { if (!isFinite(v)) return '—'; let s = v.toFixed(d).replace(/\.?0+$/, ''); return s.replace('-', '−'); };
  // gcd / fracStr 照 math-prob.js:13-14 另写一份（本文件不许依赖别的 sim 的闭包）
  function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
  const fracStr = (a, b) => { const g = gcd(a, b) || 1; return (a / g) + '/' + (b / g); };

  // ---------- 纯数据 ----------
  const EXPS = [
    { v: 'ball', label: '摸球' },
    { v: 'coin2', label: '掷两枚硬币' },
    { v: 'coin3', label: '掷三枚硬币' },
    { v: 'dice2', label: '掷两枚骰子' },
  ];
  const EVENTS = {
    ball: [['RR', '两次都摸到红球'], ['RW', '一红一白'], ['atLeastR', '至少一次红球']],
    coin2: [['allH', '全是正面'], ['oneH', '恰好一次正面'], ['atLeastH', '至少一次正面']],
    coin3: [['allH', '全是正面'], ['oneH', '恰好一次正面'], ['atLeastH', '至少一次正面']],
    dice2: [['sum7', '点数和为 7'], ['double', '两枚点数相同'], ['sumGE10', '点数和 ≥ 10']],
  };
  const VIEWS = [['tree', '树状图'], ['table', '列表法']];
  const H_CN = '正', T_CN = '反';

  // 摸球：每个球单独编号（红1、红2、白1…），人教版的讲法
  function ballList(red, white) {
    const arr = [];
    for (let i = 1; i <= red; i++) arr.push({ col: 'red', i });
    for (let i = 1; i <= white; i++) arr.push({ col: 'white', i });
    return arr;
  }
  const ballName = (b) => (b.col === 'red' ? '红' : '白') + b.i;
  const isRed = (b) => b.col === 'red';

  function leafCount(st) {
    if (st.exp === 'ball') {
      const k = st.red + st.white;
      return st.replace ? k * k : k * (k - 1);
    }
    if (st.exp === 'coin2') return 4;
    if (st.exp === 'coin3') return 8;
    return 36;
  }
  // 前两步够小才画得成行×列；三枚硬币的前两步只有 2×2 格，第三枚写在格子里
  const canTable = (st) => leafCount(st) <= 16;
  const useTable = (st) => canTable(st) && st.view === 'table';

  // ---------- 纯函数：列举全部等可能结果 / 数出事件的个数 ----------
  function enumerate(st) {
    const out = [];
    if (st.exp === 'ball') {
      const balls = ballList(st.red, st.white);
      balls.forEach((a) => balls.forEach((b) => {
        if (!st.replace && ballName(a) === ballName(b)) return;
        out.push({ ks: [a, b], label: ballName(a) + ' ' + ballName(b) });
      }));
    } else if (st.exp === 'coin3') {
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
        const ks = [x, y, z];
        out.push({ ks, label: ks.map((t) => (t ? H_CN : T_CN)).join(' ') });
      }
    } else if (st.exp === 'coin2') {
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
        const ks = [x, y];
        out.push({ ks, label: ks.map((t) => (t ? H_CN : T_CN)).join(' ') });
      }
    } else {
      for (let i = 1; i <= 6; i++) for (let j = 1; j <= 6; j++) out.push({ ks: [i, j], label: i + ',' + j });
    }
    return out;
  }
  function hitEvent(st, ks) {
    if (st.exp === 'ball') {
      if (st.event === 'RR') return isRed(ks[0]) && isRed(ks[1]);
      if (st.event === 'RW') return isRed(ks[0]) !== isRed(ks[1]);
      return isRed(ks[0]) || isRed(ks[1]);            // atLeastR
    }
    const H = ks.filter((v) => v === 1).length;
    if (st.event === 'allH') return H === ks.length;
    if (st.event === 'oneH') return H === 1;
    if (st.event === 'atLeastH') return H >= 1;
    const s = ks[0] + ks[1];
    if (st.event === 'sum7') return s === 7;
    if (st.event === 'double') return ks[0] === ks[1];
    return s >= 10;                                   // sumGE10
  }
  function count(st) {
    const all = enumerate(st);
    let m = 0;
    all.forEach((r) => { if (hitEvent(st, r.ks)) m++; });
    return { n: all.length, m };
  }

  GW.registerSim({
    id: 'math-tree', name: '树状图与列表法', category: 'math', group: '初中 · 统计与概率',
    desc: '列举所有等可能结果：摸球（放回/不放回）、掷硬币、掷骰子',
    keywords: '树状图 列表法 列举法 等可能 摸球 放回 不放回 概率初步 九年级 初中',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><circle cx="5" cy="13" r="2"/><circle cx="19" cy="13" r="2"/><circle cx="3" cy="21" r="2"/><circle cx="8" cy="21" r="2"/><circle cx="16" cy="21" r="2"/><circle cx="21" cy="21" r="2"/><path d="M12 6 5 11M12 6l7 5M5 15l-2 4M5 15l3 4M19 15l-3 4M19 15l2 4"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const st = ctx.state;
      // ---------- 开头逐个字段校验并给默认值（「重新开始」会把 state 置成 {}，老文档里也可能有越界值） ----------
      const exps = EXPS.map((e) => e.v);
      if (!exps.includes(st.exp)) st.exp = 'ball';
      st.red = GW.clamp(isFinite(+st.red) ? Math.round(+st.red) : 2, 0, 4);
      // 合计落在 2~6 之间；上界还要给红球留位置
      st.white = GW.clamp(isFinite(+st.white) ? Math.round(+st.white) : 1, Math.max(0, 2 - st.red), Math.min(4, 6 - st.red));
      st.replace = !!st.replace;
      if (!['tree', 'table'].includes(st.view)) st.view = 'tree';
      const evs = EVENTS[st.exp].map((e) => e[0]);
      if (!evs.includes(st.event)) st.event = evs[0];

      const kit = GW.simKit.layout(ctx.root, { panelWidth: 260 });
      const c2 = kit.ctx2d;
      let W = 0, H = 0, dirty = true;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      const save = () => ctx.save();

      // ---------- 绘制助手（照 math-prob.js:75-80） ----------
      function line(x1, y1, x2, y2, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke(); c2.restore();
      }
      function text(t, x, y, color, font, al, bl) { c2.font = font || '15px ' + FONT; c2.fillStyle = color || INK; c2.textAlign = al || 'left'; c2.textBaseline = bl || 'middle'; c2.fillText(t, x, y); }
      function halo(t, x, y, color, font, al, bl) { c2.font = font || '15px ' + FONT; c2.textAlign = al || 'left'; c2.textBaseline = bl || 'middle'; c2.lineWidth = 4; c2.lineJoin = 'round'; c2.strokeStyle = 'rgba(255,255,255,0.92)'; c2.strokeText(t, x, y); c2.fillStyle = color || INK; c2.fillText(t, x, y); }
      function rrect(x, y, w, h, r) { c2.beginPath(); c2.moveTo(x + r, y); c2.arcTo(x + w, y, x + w, y + h, r); c2.arcTo(x + w, y + h, x, y + h, r); c2.arcTo(x, y + h, x, y, r); c2.arcTo(x, y, x + w, y, r); c2.closePath(); }
      function ballDot(x, y, r, col) {
        c2.beginPath(); c2.arc(x, y, r, 0, TAU);
        const g = c2.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.12, x, y, r);
        if (col === 'red') { g.addColorStop(0, '#ffb3a0'); g.addColorStop(1, RED); c2.strokeStyle = '#a8381c'; }
        else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e8ebf0'); c2.strokeStyle = '#9aa4b2'; }
        c2.fillStyle = g; c2.fill(); c2.lineWidth = 1.5; c2.stroke();
      }

      // ---------- 树状图 ----------
      function drawTree() {
        const all = enumerate(st);
        const isBall = st.exp === 'ball';
        const cols = isBall ? st.red + st.white : (st.exp === 'coin3' ? 2 : (st.exp === 'coin2' ? 2 : 6));
        const unit = isBall ? ballList(st.red, st.white) : (st.exp === 'dice2' ? [1, 2, 3, 4, 5, 6] : [1, 2]);
        const rootLb = isBall ? '开始摸球' : '开始';
        const top = 54, bottom = H - 56;
        const avail = bottom - top;
        const levels = (st.exp === 'coin3') ? 3 : 2;
        const yTop = top + 18;
        const yBot = bottom - Math.max(26, avail * 0.07);
        const lvY = (lv) => (levels === 1 ? yBot : yTop + (yBot - yTop) * lv / (levels - 1));
        const xs = (col) => 40 + (W - 80) * (col + 0.5) / cols;
        const lh = Math.min(20, Math.max(13, (yBot - yTop) / (levels - 1) * 0.3));
        // 事件标记：把满足事件的叶子路径标红（先算，画线时才知道该用哪个颜色）
        all.forEach((r) => { r.hit = hitEvent(st, r.ks); });

        const drawNode = (x, y, node, col, hit) => {
          const lb = node ? ballName(node) : String(col);
          const r = Math.min(15, Math.max(11, (yBot - yTop) / (levels - 1) * 0.18));
          ballDot(x, y, r, isBall ? node.col : (col === 1 ? 'red' : 'white'));
          if (isBall && node) halo(lb, x, y + 0.5, '#fff', 'bold 12px ' + FONT, 'center');
          else halo(lb, x, y + 0.5, hit ? RED : INK, 'bold 13px ' + MATH, 'center');
        };

        // 第 1 层：根 → 各第一次摸球 / 各枚硬币第一面 / 各枚骰子第一点数
        const x0 = (W) / 2;
        c2.beginPath(); c2.arc(x0, yTop, Math.min(20, Math.max(13, (yBot - yTop) * 0.22)), 0, TAU);
        c2.fillStyle = '#f1f4f9'; c2.fill(); c2.lineWidth = 2; c2.strokeStyle = INK; c2.stroke();
        halo(rootLb, x0, yTop, INK, '13px ' + FONT, 'center');
        unit.forEach((u, i) => {
          const x1 = xs(i), y1 = lvY(1);
          line(x0, yTop + 20, x1, y1 - 14, 'rgba(27,36,51,0.28)', 1.6);
          drawNode(x1, y1, isBall ? u : null, i, false);
        });

        // 第 2 层 + 叶子
        const per = unit.length;
        all.forEach((r, k) => {
          const i = k % per, j = Math.floor(k / per);
          const x1 = xs(i), y1 = lvY(1);
          const x2 = 40 + (W - 80) * (k + 0.5) / all.length;
          const yL = lvY(levels - 1);
          line(x1, y1 + 14, x2, yL - 13, r.hit ? 'rgba(228,87,46,0.55)' : 'rgba(27,36,51,0.18)', r.hit ? 2.4 : 1.4);
          if (levels === 3) {
            // 三枚硬币：中间再画一层（第二枚的正/反）
            const y2 = lvY(2);
            const kk = x1 + (x2 - x1) * (1 / 3);
            c2.beginPath(); c2.arc(kk, y2, 9, 0, TAU); c2.fillStyle = '#fff'; c2.fill(); c2.lineWidth = 1.6; c2.strokeStyle = r.hit ? RED : '#9aa4b2'; c2.stroke();
            halo((r.ks[1] === 1 ? H_CN : T_CN), kk, y2 + 0.5, r.hit ? RED : GRAY, 'bold 11px ' + MATH, 'center');
          }
          const hit2 = r.hit;
          drawNode(x2, yL, isBall ? r.ks[1] : null, isBall ? r.ks[1].col : r.ks[levels - 1], hit2);
          halo(r.label, x2, yL + 16 + lh * 0.1, hit2 ? RED : INK, (hit2 ? 'bold ' : '') + Math.round(lh * 0.86) + 'px ' + FONT, 'center', 'top');
        });
        // 不变量：叶子的顺序必须与 enumerate 一致（x 位置按 k 排），否则红标会错位
        return all.length;
      }

      // ---------- 列表法（行×列；三枚硬币把第三枚写在格子里） ----------
      function drawTable() {
        const tri = st.exp === 'coin3';
        const isBall = st.exp === 'ball';
        const unit = isBall ? ballList(st.red, st.white) : (st.exp === 'dice2' ? [1, 2, 3, 4, 5, 6] : [1, 2]);
        const cnt = unit.length;
        const all = enumerate(st);
        const hit = all.map((r) => hitEvent(st, r.ks));
        const L = 112, T = 84, R = 24, B = 58;
        const bw = (W - L - R) / cnt, bh = (H - T - B) / cnt;
        if (bw < 8 || bh < 8) return all.length;
        text('第一次', L + (W - L - R) / 2, T - 58, GRAY, 'bold 14px ' + FONT, 'center');
        text('第二次 / 第三次', 20, T + (H - T - B) / 2 - 12, GRAY, 'bold 14px ' + FONT, 'center');
        for (let i = 0; i < cnt; i++) {
          if (isBall) {
            ballDot(L + (i + 0.5) * bw, T - 18, Math.min(13, bh * 0.3), unit[i].col);
            halo(ballName(unit[i]), L + (i + 0.5) * bw, T - 18, GRAY, 'bold 12px ' + FONT, 'center');
          } else {
            text(unit[i] + '点', L + (i + 0.5) * bw, T - 18, INK, 'bold 15px ' + MATH, 'center');
          }
        }
        for (let j = 0; j < cnt; j++) {
          if (isBall) {
            ballDot(L - 20, T + (j + 0.5) * bh, Math.min(13, bh * 0.3), unit[j].col);
            halo(ballName(unit[j]), L - 20, T + (j + 0.5) * bh, GRAY, 'bold 12px ' + FONT, 'center');
          } else {
            text(unit[j] + '点', L - 20, T + (j + 0.5) * bh, INK, 'bold 15px ' + MATH, 'center');
          }
        }
        for (let i = 0; i < cnt; i++) for (let j = 0; j < cnt; j++) {
          const k = i * cnt + j;                      // 与 enumerate 的顺序一致（先第一次、后第二次）
          const x = L + i * bw, y = T + j * bh;
          const on = k < hit.length && hit[k];
          c2.beginPath(); c2.rect(x, y, bw, bh);
          c2.fillStyle = on ? 'rgba(228,87,46,0.16)' : ((i + j) % 2 ? 'rgba(27,36,51,0.02)' : 'rgba(27,36,51,0.045)');
          c2.fill(); c2.lineWidth = 1; c2.strokeStyle = on ? 'rgba(228,87,46,0.5)' : '#cdd4de'; c2.stroke();
          if (bw < 40 || bh < 22) continue;
          if (tri) {
            // 格子里是「第三枚」两种可能的完整结果：(正/反 正/反 正/反)
            const g = [k * 2, k * 2 + 1];
            const cw0 = bw / 2;
            g.forEach((gi, u) => {
              const r = all[gi]; if (!r) return;
              const cx0 = x + cw0 * (u + 0.5);
              if (u) line(x + bw / 2, y + 5, x + bw / 2, y + bh - 5, '#e6e9ef', 1);
              text(r.label, cx0, y + bh / 2, (hit[gi] && on) ? '#a8300f' : INK, ((hit[gi] && on) ? 'bold ' : '') + Math.min(14, Math.round(bh * 0.3)) + 'px ' + FONT, 'center');
            });
          } else {
            const lb = all[k] ? all[k].label : '';
            if (on) text(lb, x + bw / 2, y + bh / 2, '#a8300f', 'bold 15px ' + FONT, 'center');
            else text(lb, x + bw / 2, y + bh / 2, INK, '14px ' + FONT, 'center');
          }
        }
        line(L, T, L + cnt * bw, T, INK, 2); line(L, T, L, T + cnt * bh, INK, 2);
        line(L, T + cnt * bh, L + cnt * bw, T + cnt * bh, INK, 2); line(L + cnt * bw, T, L + cnt * bw, T + cnt * bh, INK, 2);
        return all.length;
      }

      // ---------- 顶部说明 / 底部概率 ----------
      function headTitle() {
        if (st.exp === 'ball') {
          const k = st.red + st.white;
          return '摸球 · ' + (k ? '共 ' + k + ' 个球（红 ' + st.red + ' 个、白 ' + st.white + ' 个）' : '没有球') + ' · ' + (st.replace ? '放回' : '不放回') + '，摸两次';
        }
        if (st.exp === 'coin2') return '掷两枚硬币 · 每枚正、反两种，共 2 × 2';
        if (st.exp === 'coin3') return '掷三枚硬币 · 每枚正、反两种，共 2 × 2 × 2';
        return '掷两枚骰子 · 每枚 1~6 点，共 6 × 6';
      }
      function bottomLine(n, m) {
        const p = n ? m / n : 0;
        text('P(事件) = m / n = ' + (n ? fracStr(m, n) : '—') + (n ? ' ≈ ' + dec(p, 3) : ''), W / 2, H - 22, n ? CYAN : GRAY, 'bold 20px ' + MATH, 'center', 'middle');
      }

      // ---------- 面板 ----------
      const panel = kit.panel;
      const board = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
      panel.append(board);
      const rd1 = GW.ui.readout('所有结果 n'), rd2 = GW.ui.readout('事件包含 m'), rd3 = GW.ui.readout('概率');
      panel.append(GW.ui.group('读数', rd1.el, rd2.el, rd3.el));
      function setRd(r, label, v) { r.el.style.display = label ? '' : 'none'; r.el.firstChild.textContent = label; r.set(v); }
      function updateReadouts() {
        const q = count(st);
        setRd(rd1, '所有结果 n', String(q.n));
        setRd(rd2, '事件包含 m', String(q.m));
        setRd(rd3, '概率', st.event ? fracStr(q.m, q.n) : '—');
      }

      let evObj = null;
      function rebuild() {
        board.innerHTML = '';
        board.append(GW.ui.segmented({
          options: EXPS.map((e) => ({ value: e.v, label: e.label })), value: st.exp,
          onChange: (v) => { st.exp = v; st.event = EVENTS[v][0][0]; build(); save(); },
        }).el);
        const viewSeg = GW.ui.segmented({ options: VIEWS.map((e) => ({ value: e[0], label: e[1] })), value: useTable(st) ? 'table' : 'tree', onChange: (v) => { st.view = v; build(); save(); } });
        if (st.exp === 'ball') {
          board.append(GW.ui.slider({ label: '红球个数', min: 0, max: 4, step: 1, value: st.red, onInput: (v) => { st.red = GW.clamp(Math.round(v), 0, 4); st.white = GW.clamp(st.white, Math.max(0, 2 - st.red), Math.min(4, 6 - st.red)); rebuild(); save(); } }).el);
          board.append(GW.ui.slider({ label: '白球个数', min: 0, max: Math.min(4, 6 - st.red), step: 1, value: st.white, onInput: (v) => { st.white = GW.clamp(Math.round(v), Math.max(0, 2 - st.red), Math.min(4, 6 - st.red)); rebuild(); save(); } }).el);
          board.append(GW.ui.toggle({ label: '放回', value: st.replace, onChange: (v) => { st.replace = !!v; build(); save(); } }).el);
        }
        board.append(GW.ui.group('视图', viewSeg.el));
        evObj = GW.ui.select({
          label: '事件', options: EVENTS[st.exp].map((e) => ({ value: e[0], label: e[1] })), value: st.event,
          onChange: (v) => { st.event = v; rebuild(); dirty = true; save(); },
        });
        board.append(evObj.el);
        const hint = GW.h('div', { style: { fontSize: '12px', color: GRAY, lineHeight: '18px' } });
        if (!canTable(st)) hint.textContent = '结果太多，已改用列表法';
        else if (st.exp === 'coin3') hint.textContent = '三枚硬币列不成二维表：表里每格写第三枚的两种结果，树状图照旧';
        board.append(hint);
        updateReadouts();
      }
      function build() { rebuild(); dirty = true; }

      rebuild();
      kit.loop((dt) => {
        if (!dirty || !W || !H) return;
        dirty = false;
        kit.background();
        const q = count(st);
        text(headTitle(), 14, 22, INK, 'bold 15px ' + FONT);
        text('每个结果出现的可能性都相同，数一数一共有多少个、事件占多少个', 14, 42, GRAY, '13px ' + FONT);
        if (useTable(st)) drawTable(); else drawTree();
        bottomLine(q.n, q.m);
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
