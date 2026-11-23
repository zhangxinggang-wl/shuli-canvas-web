/* 数理无限画布 · 高中数学 · 概率统计
 * 掷硬币、掷骰子（单个 / 两个点数和）、高尔顿板；频率随试验次数稳定于概率
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#5b6576';
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const TAU = Math.PI * 2;

  const dec = (v, d = 3) => { if (!isFinite(v)) return '—'; let s = v.toFixed(d).replace(/\.?0+$/, ''); return s.replace('-', '−'); };
  function binom(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
  function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
  const fracStr = (a, b) => { const g = gcd(a, b); return (a / g) + '/' + (b / g); };

  GW.registerSim({
    id: 'math-prob', name: '概率统计', category: 'math', group: '概率统计',
    desc: '掷硬币、掷骰子与高尔顿板：用频率估计概率，二项分布与正态分布',
    // 只给搜索用，卡片上不显示（初中叫「概率初步」，desc 里没有这个词）
    keywords: '概率初步 频率 掷硬币 掷骰子 初中',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="10" height="10" rx="2"/><circle cx="6.3" cy="6.3" r=".6" fill="currentColor"/><circle cx="9.7" cy="9.7" r=".6" fill="currentColor"/><path d="M3 21h18M6 21v-3M10 21v-6M14 21v-8M18 21v-4"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const st = ctx.state;
      if (!['coin', 'die', 'galton'].includes(st.mode)) st.mode = 'coin';
      if (st.dice !== 2) st.dice = 1;
      st.face = st.face || 6;   // 单骰追踪的点数
      st.sum = st.sum || 7;     // 双骰追踪的点数和
      st.rows = st.rows || 10;
      st.p = st.p || 0.5;
      if (st.normal == null) st.normal = true;
      if (st.binom == null) st.binom = true;
      st.speed = st.speed || 20;

      const kit = GW.simKit.layout(ctx.root, { panelWidth: 260 });
      const c2 = kit.ctx2d;
      let W = 0, H = 0, dirty = true;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      const save = () => ctx.save();

      // ---------- 试验数据 ----------
      let D; // 当前模式的数据
      function resetData() {
        auto = false; autoAcc = 0;
        if (st.mode === 'coin') D = { n: 0, counts: [0, 0], last: [], hist: [], stride: 1, roll: 0 };
        else if (st.mode === 'die') D = { n: 0, counts: st.dice === 1 ? [0, 0, 0, 0, 0, 0] : new Array(11).fill(0), last: [], hist: [], stride: 1, roll: 0 };
        else D = { n: 0, counts: new Array(st.rows + 1).fill(0), balls: [], queue: 0, landed: 0, sum: 0, sum2: 0 };
        if (autoBtn) autoBtn.set('▶ 自动');
        dirty = true;
      }
      function target() { // 追踪事件的理论概率与命中数
        if (st.mode === 'coin') return { p: 0.5, hits: D.counts[0], label: '“正面朝上”的频率', pStr: '1/2' };
        if (st.dice === 1) return { p: 1 / 6, hits: D.counts[st.face - 1], label: '“点数为 ' + st.face + '”的频率', pStr: '1/6' };
        const ways = 6 - Math.abs(st.sum - 7);
        return { p: ways / 36, hits: D.counts[st.sum - 2], label: '“点数和为 ' + st.sum + '”的频率', pStr: fracStr(ways, 36) };
      }
      function trial() {
        if (st.mode === 'coin') { const r = Math.random() < 0.5 ? 0 : 1; D.counts[r]++; D.last = [r]; }
        else if (st.dice === 1) { const r = 1 + Math.floor(Math.random() * 6); D.counts[r - 1]++; D.last = [r]; }
        else { const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6); D.counts[a + b - 2]++; D.last = [a, b]; }
        D.n++;
        if (D.n % D.stride === 0) {
          D.hist.push([D.n, target().hits / D.n]);
          if (D.hist.length > 2400) { D.hist = D.hist.filter((_, i) => i % 2 === 1); D.stride *= 2; }
        }
      }
      function run(k) {
        if (st.mode === 'galton') { D.queue += k; dirty = true; return; }
        for (let i = 0; i < k; i++) trial();
        if (k === 1) D.roll = 0.35;
        dirty = true;
      }

      // ---------- 绘制助手 ----------
      function line(x1, y1, x2, y2, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke(); c2.restore();
      }
      function text(t, x, y, color, font, al, bl) { c2.font = font || '15px ' + FONT; c2.fillStyle = color || INK; c2.textAlign = al || 'left'; c2.textBaseline = bl || 'middle'; c2.fillText(t, x, y); }
      function rrect(x, y, w, h, r) { c2.beginPath(); c2.moveTo(x + r, y); c2.arcTo(x + w, y, x + w, y + h, r); c2.arcTo(x + w, y + h, x, y + h, r); c2.arcTo(x, y + h, x, y, r); c2.arcTo(x, y, x + w, y, r); c2.closePath(); }
      function drawDie(x, y, s, v, rot) {
        c2.save(); c2.translate(x + s / 2, y + s / 2); c2.rotate(rot || 0);
        rrect(-s / 2, -s / 2, s, s, s * 0.16); c2.fillStyle = '#fff'; c2.fill(); c2.lineWidth = 3; c2.strokeStyle = INK; c2.stroke();
        const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[v];
        P.forEach(([i, j]) => { c2.beginPath(); c2.arc(i * s * 0.27, j * s * 0.27, s * (v === 1 ? 0.11 : 0.085), 0, TAU); c2.fillStyle = v === 1 ? RED : INK; c2.fill(); });
        c2.restore();
      }
      function drawCoin(x, y, r, v, squash) {
        c2.save(); c2.translate(x, y); c2.scale(1, squash == null ? 1 : Math.max(0.08, Math.abs(squash)));
        c2.beginPath(); c2.arc(0, 0, r, 0, TAU);
        const g = c2.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        g.addColorStop(0, '#ffe4a8'); g.addColorStop(1, GOLD);
        c2.fillStyle = g; c2.fill(); c2.lineWidth = 3; c2.strokeStyle = '#b9741a'; c2.stroke();
        c2.beginPath(); c2.arc(0, 0, r * 0.78, 0, TAU); c2.lineWidth = 1.5; c2.stroke();
        text(v === 0 ? '正' : '反', 0, 2, '#7a4a08', 'bold ' + Math.round(r * 0.8) + 'px ' + FONT, 'center');
        c2.restore();
      }

      // 柱状图：values 频率；theo 理论概率；labels
      function barChart(x, y, w, h, labels, freqs, theo, hi, title) {
        const n = labels.length, maxV = Math.max(0.0001, ...freqs, ...theo) * 1.18;
        const top = Math.ceil(maxV * 10) / 10;
        const Y = (v) => y + h - v / top * h;
        text(title, x, y - 22, INK, 'bold 15px ' + FONT);
        // 网格
        for (let v = 0; v <= top + 1e-9; v += top <= 0.3 ? 0.05 : 0.1) {
          line(x, Y(v), x + w, Y(v), 'rgba(27,36,51,0.08)', 1);
          text(dec(v, 2), x - 6, Y(v), GRAY, '13px ' + MATH, 'right');
        }
        line(x, y + h, x + w, y + h, INK, 2); line(x, y, x, y + h, INK, 2);
        const bw = w / n;
        labels.forEach((lb, i) => {
          const bx = x + i * bw + bw * 0.15, bwi = bw * 0.7;
          c2.fillStyle = i === hi ? 'rgba(228,87,46,0.85)' : 'rgba(51,102,255,0.75)';
          c2.fillRect(bx, Y(freqs[i]), bwi, y + h - Y(freqs[i]));
          line(bx - bw * 0.08, Y(theo[i]), bx + bwi + bw * 0.08, Y(theo[i]), CYAN, 3);
          text(lb, x + (i + 0.5) * bw, y + h + 14, INK, (n > 8 ? 14 : 16) + 'px ' + MATH, 'center');
        });
      }

      function lineChart(x, y, w, h, hist, p, label, pStr) {
        const N = Math.max(10, D.n);
        // 纵轴：0~1，或在 n 较大时放大到 p 附近
        let lo = 0, hi = 1;
        const X = (n) => x + (n / N) * w, Y = (v) => y + h - (v - lo) / (hi - lo) * h;
        text(label + ' 随试验次数 n 的变化', x, y - 20, INK, 'bold 15px ' + FONT);
        for (let v = 0; v <= 1.0001; v += 0.25) { line(x, Y(v), x + w, Y(v), 'rgba(27,36,51,0.08)', 1); text(dec(v, 2), x - 6, Y(v), GRAY, '13px ' + MATH, 'right'); }
        const step = (() => { const raw = N / 6, pw = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / pw; return (m < 2 ? 1 : m < 5 ? 2 : 5) * pw; })();
        for (let n = step; n <= N; n += step) { line(X(n), y + h, X(n), y + h + 4, INK, 1.5); text(String(n), X(n), y + h + 14, GRAY, '13px ' + MATH, 'center'); }
        line(x, y + h, x + w + 8, y + h, INK, 2); line(x, y - 4, x, y + h, INK, 2);
        text('n', x + w + 12, y + h, INK, 'italic 17px ' + MATH);
        line(x, Y(p), x + w, Y(p), CYAN, 2.4, [9, 6]);
        text('P = ' + pStr + ' ≈ ' + dec(p, 3), x + w - 4, Y(p) - 13, CYAN, 'bold 15px ' + FONT, 'right');
        if (hist.length) {
          c2.save(); c2.strokeStyle = RED; c2.lineWidth = 2.4; c2.lineJoin = 'round'; c2.beginPath();
          hist.forEach((q, i) => (i ? c2.lineTo(X(q[0]), Y(q[1])) : c2.moveTo(X(q[0]), Y(q[1]))));
          c2.stroke(); c2.restore();
          const last = hist[hist.length - 1];
          c2.beginPath(); c2.arc(X(last[0]), Y(last[1]), 5, 0, TAU); c2.fillStyle = RED; c2.fill();
        }
      }

      function drawCoinDie() {
        const tg = target();
        const visH = Math.max(170, H * 0.36);
        // 左上：本次结果
        const lw = Math.min(330, W * 0.4);
        rrect(14, 14, lw - 14, visH - 14, 12); c2.fillStyle = '#f7f9fc'; c2.fill(); c2.strokeStyle = '#e3e7ee'; c2.lineWidth = 1; c2.stroke();
        text(D.n ? '第 ' + D.n + ' 次试验结果' : '点击“投 1 次”开始', 28, 36, GRAY, '15px ' + FONT);
        const cy = 14 + (visH - 14) / 2 + 10;
        const rolling = D.roll > 0;
        if (st.mode === 'coin') {
          const v = D.last.length ? D.last[0] : 0;
          drawCoin(14 + (lw - 14) / 2, cy, Math.min(56, visH * 0.3), rolling ? (Math.sin(D.roll * 40) > 0 ? 0 : 1) : v, rolling ? Math.cos(D.roll * 40) : 1);
          if (D.last.length && !rolling) text(v === 0 ? '正面朝上' : '反面朝上', 14 + (lw - 14) / 2, cy + Math.min(56, visH * 0.3) + 20, INK, 'bold 16px ' + FONT, 'center');
        } else {
          const s = Math.min(84, visH * 0.44);
          const vals = D.last.length ? D.last : st.dice === 1 ? [6] : [3, 4];
          const tot = vals.length * s + (vals.length - 1) * 24, x0 = 14 + (lw - 14 - tot) / 2;
          vals.forEach((v, i) => drawDie(x0 + i * (s + 24), cy - s / 2 - 6, s, rolling ? 1 + Math.floor(Math.random() * 6) : v, rolling ? Math.sin(D.roll * 30) * 0.3 : 0));
          if (D.last.length && !rolling && st.dice === 2) text('点数和 = ' + (vals[0] + vals[1]), 14 + (lw - 14) / 2, cy + s / 2 + 14, INK, 'bold 16px ' + FONT, 'center');
        }
        // 右上：柱状图
        const bx = lw + 60, bwid = W - bx - 24, by = 44, bh = visH - 66;
        let labels, freqs, theo, hi;
        if (st.mode === 'coin') { labels = ['正面', '反面']; theo = [0.5, 0.5]; hi = 0; }
        else if (st.dice === 1) { labels = ['1', '2', '3', '4', '5', '6']; theo = new Array(6).fill(1 / 6); hi = st.face - 1; }
        else { labels = []; theo = []; for (let s = 2; s <= 12; s++) { labels.push(String(s)); theo.push((6 - Math.abs(s - 7)) / 36); } hi = st.sum - 2; }
        freqs = D.counts.map((c) => (D.n ? c / D.n : 0));
        if (st.mode === 'coin') { c2.save(); barChart(bx, by, bwid, bh, labels, freqs, theo, hi, '各结果的频率（柱）与概率（青线）'); c2.restore(); }
        else barChart(bx, by, bwid, bh, labels, freqs, theo, hi, '各结果的频率（柱）与概率（青线）');
        // 下：折线
        lineChart(64, visH + 58, W - 64 - 40, H - visH - 58 - 40, D.hist, tg.p, tg.label, tg.pStr);
        // 当前频率
        const f = D.n ? tg.hits / D.n : NaN;
        text('n = ' + D.n + '    频率 = ' + tg.hits + '/' + D.n + (D.n ? ' ≈ ' + dec(f, 4) : '') + '    |频率 − P| = ' + (D.n ? dec(Math.abs(f - tg.p), 4) : '—'), 64, H - 12, INK, '15px ' + FONT);
      }

      // ---------- 高尔顿板 ----------
      let G = null;
      function galtonLayout() {
        const n = st.rows;
        const top = 84, bottom = H - 40;
        const dx = Math.min((W - 60) / (n + 1), (H * 0.48) / n * 1.15);
        const dy = dx * 0.86;
        const cx = W / 2;
        const pegTop = top + 20, binTop = pegTop + n * dy + dy * 0.4;
        G = { n, dx, dy, cx, pegTop, binTop, bottom, binX: (k) => cx + (k - n / 2) * dx };
      }
      function ballPos(b) {
        const { dx, dy, cx, pegTop } = G;
        const r = Math.floor(b.t), fr = b.t - r;
        if (b.t < 0) return [cx, pegTop - dy * 0.9 + (b.t + 1) * dy * 0.9 - dy * 0.35];
        const R = (i) => b.path.slice(0, i).reduce((s, v) => s + v, 0);
        if (r >= G.n) { const k = R(G.n); return [G.binX(k), pegTop + (G.n - 0.35) * dy + (b.t - G.n) * dy * 1.2]; }
        const x0 = cx + (R(r) - r / 2) * dx, x1 = cx + (R(r + 1) - (r + 1) / 2) * dx;
        const e = fr < 0.5 ? 2 * fr * fr : 1 - Math.pow(-2 * fr + 2, 2) / 2;
        const bounce = Math.sin(fr * Math.PI) * dy * 0.28;
        return [x0 + (x1 - x0) * e, pegTop + (r - 0.35 + fr) * dy - bounce];
      }
      function stepGalton(dt) {
        if (!G) return;
        // 释放
        const inflight = D.balls.length;
        const rate = D.queue > 50 ? 40 : 14; // 每秒释放数
        D.relAcc = (D.relAcc || 0) + dt * rate;
        while (D.queue > 0 && D.relAcc >= 1 && D.balls.length < 160) {
          D.relAcc -= 1; D.queue--;
          const path = []; for (let i = 0; i < G.n; i++) path.push(Math.random() < st.p ? 1 : 0);
          D.balls.push({ t: -1, path });
        }
        if (D.queue === 0) D.relAcc = Math.min(D.relAcc, 1);
        const sp = D.queue > 200 ? 9 : 4.2 + Math.min(4, inflight / 30);
        D.balls.forEach((b) => (b.t += dt * sp));
        const endT = G.n + 0.9;
        D.balls = D.balls.filter((b) => {
          if (b.t < endT) return true;
          const k = b.path.reduce((s, v) => s + v, 0);
          D.counts[k]++; D.landed++; D.sum += k; D.sum2 += k * k;
          return false;
        });
        if (inflight || D.queue) dirty = true;
      }
      function drawGalton() {
        galtonLayout();
        const { n, dx, dy, cx, pegTop, binTop, bottom } = G;
        // 漏斗
        c2.save(); c2.strokeStyle = INK; c2.lineWidth = 2.4;
        c2.beginPath(); c2.moveTo(cx - dx * 1.6, pegTop - dy * 1.6); c2.lineTo(cx - dx * 0.35, pegTop - dy * 0.75); c2.moveTo(cx + dx * 1.6, pegTop - dy * 1.6); c2.lineTo(cx + dx * 0.35, pegTop - dy * 0.75); c2.stroke(); c2.restore();
        // 钉子
        const pr = Math.max(3, Math.min(6, dx * 0.1));
        for (let r = 0; r < n; r++) for (let i = 0; i <= r; i++) {
          c2.beginPath(); c2.arc(cx + (i - r / 2) * dx, pegTop + r * dy, pr, 0, TAU); c2.fillStyle = INK; c2.fill();
        }
        // 槽
        const N = D.landed;
        const binH = bottom - binTop;
        const pmf = []; for (let k = 0; k <= n; k++) pmf.push(binom(n, k) * Math.pow(st.p, k) * Math.pow(1 - st.p, n - k));
        const maxC = Math.max(1, ...D.counts, N * Math.max(...pmf) * 1.05);
        const sc = binH / maxC;
        for (let k = 0; k <= n + 1; k++) { const x = G.binX(k) - dx / 2; line(x, binTop, x, bottom, '#9aa4b2', 2); }
        line(G.binX(0) - dx / 2, bottom, G.binX(n) + dx / 2, bottom, INK, 2.4);
        for (let k = 0; k <= n; k++) {
          const h = D.counts[k] * sc, x = G.binX(k);
          const grd = c2.createLinearGradient(0, bottom - h, 0, bottom);
          grd.addColorStop(0, 'rgba(51,102,255,0.9)'); grd.addColorStop(1, 'rgba(51,102,255,0.55)');
          c2.fillStyle = grd; c2.fillRect(x - dx * 0.42, bottom - h, dx * 0.84, h);
          text(String(k), x, bottom + 14, INK, '15px ' + MATH, 'center');
        }
        // 理论二项分布
        if (st.binom && N > 0) {
          for (let k = 0; k <= n; k++) {
            const y = bottom - N * pmf[k] * sc, x = G.binX(k);
            line(x - dx * 0.42, y, x + dx * 0.42, y, CYAN, 3);
          }
        }
        // 正态曲线
        if (st.normal && N > 0) {
          const mu = n * st.p, sg = Math.sqrt(n * st.p * (1 - st.p));
          c2.save(); c2.strokeStyle = RED; c2.lineWidth = 3; c2.beginPath();
          for (let i = 0; i <= 300; i++) {
            const xv = -0.5 + (n + 1) * i / 300, pdf = Math.exp(-((xv - mu) ** 2) / (2 * sg * sg)) / (sg * Math.sqrt(TAU));
            const X = cx + (xv - n / 2) * dx, Y = bottom - N * pdf * sc;
            i ? c2.lineTo(X, Y) : c2.moveTo(X, Y);
          }
          c2.stroke(); c2.restore();
        }
        // 小球
        const br = Math.max(4, Math.min(8, dx * 0.16));
        D.balls.forEach((b) => {
          const [x, y] = ballPos(b);
          c2.beginPath(); c2.arc(x, y, br, 0, TAU); c2.fillStyle = GOLD; c2.fill(); c2.lineWidth = 1.5; c2.strokeStyle = '#b9741a'; c2.stroke();
        });
        // 说明
        text('每碰一颗钉子向右的概率为 p = ' + dec(st.p, 2) + '，落入第 k 格的概率', 14, 20, INK, '15px ' + FONT);
        text('P(X = k) = C', 14, 46, INK, 'italic 18px ' + MATH); { c2.font = 'italic 18px ' + MATH; const w0 = 14 + c2.measureText('P(X = k) = C').width; text(String(n), w0, 38, INK, 'italic 13px ' + MATH); text('k', w0, 53, INK, 'italic 13px ' + MATH); text('p', w0 + 16, 46, INK, 'italic 18px ' + MATH); text('k', w0 + 26, 39, INK, 'italic 13px ' + MATH); text('(1 − p)', w0 + 36, 46, INK, 'italic 18px ' + MATH); c2.font = 'italic 18px ' + MATH; const w1 = w0 + 36 + c2.measureText('(1 − p)').width + 2; text(n + '−k', w1, 39, INK, 'italic 13px ' + MATH); }
        const legend = [];
        if (st.binom) legend.push(['二项分布 B(' + n + ', ' + dec(st.p, 2) + ') 理论频数', CYAN]);
        if (st.normal) legend.push(['正态曲线 N(' + dec(n * st.p, 2) + ', ' + dec(n * st.p * (1 - st.p), 2) + ')', RED]);
        c2.font = '14px ' + FONT; const lgx = W - 14 - Math.max(0, ...legend.map((l) => c2.measureText(l[0]).width)) - 32;
        legend.forEach(([t, col], i) => { line(lgx, 22 + i * 24, lgx + 24, 22 + i * 24, col, 3); text(t, lgx + 30, 22 + i * 24, INK, '14px ' + FONT); });
        text('已落下 ' + N + ' 个' + (D.queue + D.balls.length ? '，待落 ' + (D.queue + D.balls.length) + ' 个' : ''), 14, 76, GRAY, '15px ' + FONT);
      }

      // ---------- 面板 ----------
      const panel = kit.panel;
      const modeSeg = GW.ui.segmented({ options: [{ value: 'coin', label: '掷硬币' }, { value: 'die', label: '掷骰子' }, { value: 'galton', label: '高尔顿板' }], value: st.mode, onChange: (v) => { st.mode = v; resetData(); build(); save(); } });
      panel.append(GW.ui.group('试验', modeSeg.el));
      const optBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      const optGroup = GW.ui.group('设置', optBox);
      panel.append(optGroup);
      let auto = false, autoAcc = 0;
      const b1 = GW.ui.button({ label: '投 1 次', onClick: () => run(1) });
      const b10 = GW.ui.button({ label: '10 次', onClick: () => run(10) });
      const b100 = GW.ui.button({ label: '100 次', onClick: () => run(100) });
      const b1000 = GW.ui.button({ label: '1000 次', onClick: () => run(1000) });
      const autoBtn = GW.ui.button({ label: '▶ 自动', primary: true, onClick: () => { auto = !auto; autoBtn.set(auto ? '⏸ 暂停' : '▶ 自动'); } });
      const resetBtn = GW.ui.button({ label: '↺ 清零', onClick: () => resetData() });
      const speedSl = GW.ui.slider({ label: '自动速度（次/秒）', min: 1, max: 200, step: 1, value: st.speed, onInput: (v) => { st.speed = v; save(); } });
      panel.append(GW.ui.group('操作', GW.h('div', { class: 'gw-row' }, b1.el, b10.el), GW.h('div', { class: 'gw-row' }, b100.el, b1000.el), GW.h('div', { class: 'gw-row' }, autoBtn.el, resetBtn.el), speedSl.el));
      const rd1 = GW.ui.readout(''), rd2 = GW.ui.readout(''), rd3 = GW.ui.readout(''), rd4 = GW.ui.readout('');
      const statGroup = GW.ui.group('统计', rd1.el, rd2.el, rd3.el, rd4.el);
      panel.append(statGroup);
      function setRd(r, label, v) { r.el.style.display = label ? '' : 'none'; r.el.firstChild.textContent = label; r.set(v); }

      function build() {
        modeSeg.set(st.mode);
        optBox.innerHTML = '';
        b1.set(st.mode === 'galton' ? '放 1 个' : '投 1 次');
        if (st.mode === 'coin') optGroup.style.display = 'none';
        else if (st.mode === 'die') {
          optGroup.style.display = '';
          optBox.append(GW.ui.segmented({ options: [{ value: '1', label: '一个骰子' }, { value: '2', label: '两个骰子（点数和）' }], value: String(st.dice), onChange: (v) => { st.dice = +v; resetData(); build(); save(); } }).el);
          if (st.dice === 1) optBox.append(GW.ui.select({ label: '追踪事件：点数为', options: [1, 2, 3, 4, 5, 6].map((v) => ({ value: v, label: String(v) })), value: st.face, onChange: (v) => { st.face = +v; recomputeHist(); save(); } }).el);
          else optBox.append(GW.ui.select({ label: '追踪事件：点数和为', options: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((v) => ({ value: v, label: v + '（P = ' + fracStr(6 - Math.abs(v - 7), 36) + '）' })), value: st.sum, onChange: (v) => { st.sum = +v; recomputeHist(); save(); } }).el);
        } else {
          optGroup.style.display = '';
          optBox.append(GW.ui.slider({ label: '钉子层数 n', min: 4, max: 16, step: 1, value: st.rows, onInput: (v) => { st.rows = v; resetData(); save(); } }).el);
          optBox.append(GW.ui.slider({ label: '向右概率 p', min: 0.1, max: 0.9, step: 0.05, value: st.p, onInput: (v) => { st.p = v; resetData(); save(); } }).el);
          optBox.append(GW.ui.toggle({ label: '显示二项分布理论值', value: st.binom, onChange: (v) => { st.binom = v; dirty = true; save(); } }).el);
          optBox.append(GW.ui.toggle({ label: '叠加正态曲线', value: st.normal, onChange: (v) => { st.normal = v; dirty = true; save(); } }).el);
        }
        dirty = true;
      }
      function recomputeHist() { // 切换追踪事件后，历史折线无法重建，清零更直观
        resetData();
      }
      function updateStats() {
        if (st.mode === 'galton') {
          const N = D.landed, n = st.rows, p = st.p;
          const m = N ? D.sum / N : NaN, v = N ? D.sum2 / N - m * m : NaN;
          setRd(rd1, '样本均值 x̄', dec(m, 3)); setRd(rd2, '理论均值 np', dec(n * p, 3));
          setRd(rd3, '样本方差 s²', dec(v, 3)); setRd(rd4, '理论方差 np(1−p)', dec(n * p * (1 - p), 3));
        } else {
          const tg = target();
          setRd(rd1, '试验次数 n', String(D.n)); setRd(rd2, '事件发生次数', String(tg.hits));
          setRd(rd3, '频率', D.n ? dec(tg.hits / D.n, 4) : '—'); setRd(rd4, '概率 P', tg.pStr + ' ≈ ' + dec(tg.p, 4));
        }
      }

      resetData(); build();
      kit.loop((dt) => {
        if (auto && dt) {
          if (st.mode === 'galton') { if (D.queue < 3) D.queue += Math.max(1, Math.round(st.speed * dt * 0.5)); }
          else { autoAcc += st.speed * dt; const k = Math.floor(autoAcc); autoAcc -= k; if (k) run(k); }
          dirty = true;
        }
        if (D.roll > 0 && dt) { D.roll = Math.max(0, D.roll - dt); dirty = true; }
        if (st.mode === 'galton' && dt) { if (G) stepGalton(dt); }
        if (!dirty || !W) return;
        dirty = false;
        kit.background();
        if (st.mode === 'galton') drawGalton(); else drawCoinDie();
        updateStats();
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
