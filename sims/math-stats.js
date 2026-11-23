/* 数理无限画布 · 初中数学 · 数据的整理与分析
 * 条形 / 扇形 / 折线统计图与频数直方图；改一个数据，平均数、中位数、众数、方差一起变
 * 方差用 1/n（人教版八下 20.2 的口径）；所有取值出现次数都相同时众数读作「无」
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#5b6576';
  const VIOLET = '#8e5cd9';
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const TAU = Math.PI * 2;

  const MAXN = 40;               // 数据个数上限
  const VMAX = 100;              // 每个数据的上限
  const DEF = [2, 3, 3, 5, 7];   // 默认一组数据（也是「重新开始」后的样子）
  const CHARTS = ['dot', 'bar', 'pie', 'line', 'hist'];
  const CH_LABEL = { dot: '点图', bar: '条形统计图', pie: '扇形统计图', line: '折线统计图', hist: '频数直方图' };

  // 保留 d 位小数，去掉末尾的 0；负号统一写成 −（照 math-prob.js:11 的写法，本文件另写一份）
  const dec = (v, d = 2) => { if (!isFinite(v)) return '—'; let s = v.toFixed(d).replace(/\.?0+$/, ''); return s.replace('-', '−'); };
  const fmtInt = (v) => { const s = String(Math.round(v)); return s.replace('-', '−'); };
  // 标签压在图线上时用白色光晕
  const halo = (t, x, y, color, font, al, bl) => {
    c2.save(); c2.font = font; c2.textAlign = al || 'left'; c2.textBaseline = bl || 'middle';
    c2.lineWidth = 4; c2.strokeStyle = 'rgba(255,255,255,0.9)'; c2.lineJoin = 'round';
    c2.strokeText(t, x, y); c2.fillStyle = color; c2.fillText(t, x, y); c2.restore();
  };
  let c2 = null;   // 由 create 里的 kit 赋值给 GW 无关的闭包变量（halo 用）

  // ---------- 纯函数：一组数据的统计量（1/n 口径的方差） ----------
  function stats(arr) {
    const n = arr.length;
    if (!n) return { n: 0, mean: NaN, median: NaN, modes: [], range: NaN, variance: NaN };
    let sum = 0, lo = Infinity, hi = -Infinity;
    const cnt = {};
    for (let i = 0; i < n; i++) { const v = arr[i]; sum += v; if (v < lo) lo = v; if (v > hi) hi = v; cnt[v] = (cnt[v] || 0) + 1; }
    const mean = sum / n;
    const asc = arr.slice().sort((a, b) => a - b);
    const median = n % 2 ? asc[(n - 1) / 2] : (asc[n / 2 - 1] + asc[n / 2]) / 2;
    // 众数：出现次数最多的取值；**所有值出现次数都一样多**（含每个值都只出现一次）时返回空
    const keys = Object.keys(cnt).map(Number).sort((a, b) => a - b);
    let best = 0;
    keys.forEach((k) => { if (cnt[k] > best) best = cnt[k]; });
    const modes = best <= 1 ? [] : keys.filter((k) => cnt[k] === best);
    let s2 = 0;
    for (let i = 0; i < n; i++) { const dv = arr[i] - mean; s2 += dv * dv; }
    return { n, mean, median, modes, range: hi - lo, variance: s2 / n };
  }
  const modeText = (m) => (m.modes.length ? m.modes.map(fmtInt).join('、') : '无');

  // ---------- state 清洗：任何垃圾值都回落到默认值 ----------
  function cleanList(v) {
    const src = Array.isArray(v) ? v : [];
    const out = [];
    for (let i = 0; i < src.length && out.length < MAXN; i++) {
      const x = Number(src[i]);
      if (!isFinite(x)) continue;
      out.push(Math.round(Math.max(0, Math.min(VMAX, x))));
    }
    return out;
  }
  function preset2() {   // 「示例：甲乙射击」的两组预置数据
    return {
      data: [7, 8, 8, 9, 10, 8, 7, 9, 8, 6],
      data2: [10, 6, 9, 7, 8, 9, 7, 8, 10, 6],
    };
  }

  GW.registerSim({
    id: 'math-stats', name: '数据的分析', category: 'math', group: '初中 · 统计与概率',
    desc: '条形、扇形、折线统计图与频数直方图；平均数、中位数、众数、方差',
    // 只给搜索用，卡片上不显示
    keywords: '统计 统计图 条形统计图 扇形统计图 折线统计图 直方图 频数 平均数 中位数 众数 方差 极差 七年级 八年级 初中',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><rect x="5" y="12" width="3" height="7" rx="1"/><rect x="10.5" y="7" width="3" height="12" rx="1"/><rect x="16" y="4" width="3" height="15" rx="1"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const st = ctx.state;
      if (!CHARTS.includes(st.chart)) st.chart = 'dot';
      st.data = cleanList(st.data);
      st.data2 = cleanList(st.data2);
      if (!st.data.length) { st.data = DEF.slice(); if (st.data2.length) st.data2 = []; }
      const binOK = isFinite(+st.bin);
      st.bin = Math.round(GW.clamp(binOK ? +st.bin : 5, 1, 20));
      if (st.showMean == null) st.showMean = true;
      if (st.showMedian == null) st.showMedian = true;
      st.showMean = !!st.showMean; st.showMedian = !!st.showMedian;
      st.note = String(st.note == null ? '' : st.note);

      const kit = GW.simKit.layout(ctx.root, { panelWidth: 260 });
      c2 = kit.ctx2d;
      let W = 0, H = 0, dirty = true;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      const save = () => ctx.save();

      // ---------- 绘制助手 ----------
      function line(x1, y1, x2, y2, color, w, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = w || 2; if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke(); c2.restore();
      }
      function text(t, x, y, color, font, al, bl) { c2.font = font || '15px ' + FONT; c2.fillStyle = color || INK; c2.textAlign = al || 'left'; c2.textBaseline = bl || 'middle'; c2.fillText(t, x, y); }

      // ---------- 各类统计图 ----------
      // r: {x,y,w,h} 绘图区；arr 数据；pi 1 表示第一组、2 表示第二组（决定颜色）
      function drawDot(r, arr, m, pi) {
        const col = pi === 1 ? RED : BLUE;
        const base = r.y + r.h - 34, top = r.y + 26;
        let lo = Math.min.apply(null, arr), hi = Math.max.apply(null, arr);
        if (hi === lo) { lo -= 1; hi += 1; } else { const pad = Math.max(1, (hi - lo) * 0.12); lo -= pad; hi += pad; }
        const X = (v) => r.x + 34 + (v - lo) / (hi - lo) * (r.w - 58);
        const step = Math.max(1, Math.ceil((hi - lo) / 10));
        for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
          line(X(v), top, X(v), base, 'rgba(27,36,51,0.07)', 1);
          text(fmtInt(v), X(v), base + 14, GRAY, '13px ' + MATH, 'center');
        }
        line(r.x + 20, base, r.x + r.w - 14, base, INK, 2);
        const stack = {};
        const r0 = Math.max(5, Math.min(11, (r.w - 70) / Math.max(1, hi - lo) * 0.55));
        arr.forEach((v) => {
          const k = stack[v] = (stack[v] || 0);
          stack[v] = k + 1;
          const y = base - 12 - k * (r0 * 2.15);
          c2.beginPath(); c2.arc(X(v), y, r0, 0, TAU);
          c2.fillStyle = pi === 1 ? 'rgba(228,87,46,0.82)' : 'rgba(51,102,255,0.82)'; c2.fill();
          c2.lineWidth = 1.6; c2.strokeStyle = col; c2.stroke();
        });
        guideLines(r, X, m, base, top, col);
        text(pi === 1 ? '点图：相同的数据往上叠' : '第二组点图', r.x + 20, r.y + 8, GRAY, '14px ' + FONT, 'left', 'top');
      }

      function drawBar(r, arr, m, pi) {
        const col = pi === 1 ? RED : BLUE;
        const base = r.y + r.h - 34, top = r.y + 40;
        const cnt = {}; arr.forEach((v) => { cnt[v] = (cnt[v] || 0) + 1; });
        const keys = Object.keys(cnt).map(Number).sort((a, b) => a - b);
        const maxC = Math.max.apply(null, keys.map((k) => cnt[k]));
        const base0 = r.y + r.h - 34, avail = Math.max(30, base0 - top);
        const bw = (r.w - 60) / keys.length;
        for (let c = 1; c <= maxC; c++) {
          const y = base0 - c / maxC * avail;
          line(r.x + 20, y, r.x + r.w - 14, y, 'rgba(27,36,51,0.07)', 1);
          text(String(c), r.x + 14, y, GRAY, '13px ' + MATH, 'right');
        }
        text('频数', r.x + 14, top - 16, GRAY, '13px ' + FONT, 'right');
        line(r.x + 20, base0, r.x + r.w - 14, base0, INK, 2);
        line(r.x + 20, top - 14, r.x + 20, base0, INK, 2);
        keys.forEach((k, i) => {
          const h = cnt[k] / maxC * avail, x = r.x + 30 + i * bw + bw * 0.16, w = bw * 0.68;
          c2.fillStyle = pi === 1 ? 'rgba(228,87,46,0.72)' : 'rgba(51,102,255,0.72)';
          c2.fillRect(x, base0 - h, w, h);
          text(String(cnt[k]), x + w / 2, base0 - h - 10, col, 'bold 13px ' + MATH, 'center');
          text(fmtInt(k), x + w / 2, base0 + 14, INK, '14px ' + MATH, 'center');
        });
        text(pi === 1 ? '条形统计图：横轴是数据取值，纵轴是频数' : '第二组条形图', r.x + 20, r.y + 10, GRAY, '14px ' + FONT, 'left', 'top');
      }

      function drawPie(r, arr, m, pi) {
        const cnt = {}; arr.forEach((v) => { cnt[v] = (cnt[v] || 0) + 1; });
        const keys = Object.keys(cnt).map(Number).sort((a, b) => a - b);
        const PAL = ['#3366ff', '#e4572e', '#0f9d8a', '#f2a541', '#8e5cd9', '#e2559a', '#ff7a00', '#5b6576'];
        const cx = r.x + r.w / 2 - 46, cy = r.y + r.h / 2 + 4;
        const rad = Math.max(34, Math.min(r.w * 0.27, r.h * 0.36));
        let a0 = -Math.PI / 2;
        keys.forEach((k, i) => {
          const frac = cnt[k] / arr.length, a1 = a0 + frac * TAU;
          c2.beginPath(); c2.moveTo(cx, cy); c2.arc(cx, cy, rad, a0, a1); c2.closePath();
          c2.fillStyle = PAL[i % PAL.length]; c2.fill();
          c2.lineWidth = 1.5; c2.strokeStyle = '#fff'; c2.stroke();
          if (frac > 0.06) {
            const mid = (a0 + a1) / 2, tx = cx + Math.cos(mid) * rad * 0.62, ty = cy + Math.sin(mid) * rad * 0.62;
            halo(dec(frac * 100, 1) + '%', tx, ty, '#fff', 'bold 14px ' + FONT, 'center');
          }
          a0 = a1;
        });
        // 图例：取值 → 频数 / 占比
        const lx = cx + rad + 26;
        keys.forEach((k, i) => {
          const y = cy - (keys.length - 1) * 13 + i * 26;
          c2.fillStyle = PAL[i % PAL.length]; c2.fillRect(lx, y - 8, 16, 16);
          text(fmtInt(k) + '：' + cnt[k] + ' 个，占 ' + dec(cnt[k] / arr.length * 100, 1) + '%', lx + 24, y, INK, '14px ' + FONT);
        });
        text(pi === 1 ? '扇形统计图：各取值的占比（共 ' + arr.length + ' 个数据）' : '第二组扇形图', r.x + 20, r.y + 10, GRAY, '14px ' + FONT, 'left', 'top');
      }

      function drawLineChart(r, arr, m, pi) {
        const col = pi === 1 ? RED : BLUE;
        const base = r.y + r.h - 34, top = r.y + 26;
        let lo = Math.min.apply(null, arr), hi = Math.max.apply(null, arr);
        if (hi === lo) { lo -= 1; hi += 1; } else { const pad = Math.max(1, (hi - lo) * 0.12); lo -= pad; hi += pad; }
        const X = (i) => r.x + 34 + (arr.length <= 1 ? 0.5 : i / (arr.length - 1)) * (r.w - 58);
        const Y = (v) => base - (v - lo) / (hi - lo) * (base - top);
        const step = Math.max(1, Math.ceil((hi - lo) / 8));
        for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
          line(r.x + 20, Y(v), r.x + r.w - 14, Y(v), 'rgba(27,36,51,0.07)', 1);
          text(fmtInt(v), r.x + 14, Y(v), GRAY, '13px ' + MATH, 'right');
        }
        line(r.x + 20, base, r.x + r.w - 14, base, INK, 2);
        line(r.x + 20, top, r.x + 20, base, INK, 2);
        c2.save(); c2.beginPath(); c2.lineWidth = 2.6; c2.lineJoin = 'round'; c2.strokeStyle = col;
        arr.forEach((v, i) => (i ? c2.lineTo(X(i), Y(v)) : c2.moveTo(X(i), Y(v))));
        c2.stroke(); c2.restore();
        arr.forEach((v, i) => {
          c2.beginPath(); c2.arc(X(i), Y(v), Math.max(3.5, Math.min(7, 320 / Math.max(8, arr.length))), 0, TAU);
          c2.fillStyle = col; c2.fill();
          if (arr.length <= 14) text(fmtInt(v), X(i), base + 14, INK, '13px ' + MATH, 'center');
        });
        text('横轴是数据的输入顺序，纵轴是数值', r.x + 24, r.y + 8, GRAY, '14px ' + FONT, 'left', 'top');
      }

      function drawHist(r, arr, m, pi) {
        const col = pi === 1 ? RED : BLUE;
        const base = r.y + r.h - 34, top = r.y + 40;
        const binN = Math.max(1, Math.ceil((VMAX + 1) / st.bin));
        const cnt = new Array(binN).fill(0);
        arr.forEach((v) => { const k = Math.min(binN - 1, Math.floor(v / st.bin)); cnt[k]++; });
        const maxC = Math.max.apply(null, cnt.concat([1]));
        const hx0 = r.x + 32, hx1 = r.x + r.w - 16, hbw = (hx1 - hx0) / binN;
        const avail = Math.max(30, base - top);
        const stepY = Math.max(1, Math.ceil(maxC / 8));
        for (let c = 0; c <= maxC; c += stepY) {
          const y = base - c / maxC * avail;
          line(r.x + 24, y, r.x + r.w - 14, y, 'rgba(27,36,51,0.07)', 1);
          text(String(c), r.x + 18, y, GRAY, '13px ' + MATH, 'right');
        }
        text('频数', r.x + 18, top - 18, GRAY, '13px ' + FONT, 'right');
        const bw = hbw;
        line(r.x + 24, base, r.x + r.w - 14, base, INK, 2);
        line(r.x + 24, top - 16, r.x + 24, base, INK, 2);
        cnt.forEach((c, i) => {
          const x = hx0 + i * bw;
          if (c) {
            const h = c / maxC * avail;
            c2.fillStyle = pi === 1 ? 'rgba(228,87,46,0.7)' : 'rgba(51,102,255,0.7)';
            c2.fillRect(x + 1.5, base - h, Math.max(1, bw - 3), h);
            if (bw > 13) text(String(c), x + bw / 2, base - h - 10, col, 'bold 13px ' + MATH, 'center');
          }
        });
        // 横轴刻度按组距走：0、bin、2bin…
        const tstep = Math.max(1, Math.ceil(binN / 12));
        for (let i = 0; i <= binN; i += tstep) {
          const x = hx0 + i * bw;
          line(x, base, x, base + 4, INK, 1.5);
          text(String(i * st.bin), x, base + 14, GRAY, '12px ' + MATH, 'center');
        }
        // 平均数 / 中位数落在哪一组
        if (st.showMean && isFinite(m.mean)) {
          const x = hx0 + Math.min(1, m.mean / (binN * st.bin)) * (hx1 - hx0);
          line(x, top - 24, x, base, RED, 2.4, [8, 6]);
          halo('x̄ = ' + dec(m.mean), x, top - 32, RED, 'bold 14px ' + MATH, 'center');
        }
        if (st.showMedian && isFinite(m.median)) {
          const x = hx0 + Math.min(1, m.median / (binN * st.bin)) * (hx1 - hx0);
          line(x, top - 24, x, base, CYAN, 2.4, [8, 6]);
          halo('中位数 = ' + dec(m.median), x, top - 52, CYAN, 'bold 14px ' + MATH, 'center');
        }
        text('频数直方图：组距 ' + st.bin + '，共 ' + binN + ' 组' + (binN * st.bin > VMAX + 1 ? '（末组含 100）' : ''), r.x + 24, r.y + 10, GRAY, '14px ' + FONT, 'left', 'top');
      }

      // 平均数（RED 竖虚线）与中位数（CYAN 竖虚线）
      function guideLines(r, X, m, base, top, col) {
        if (st.showMean && isFinite(m.mean)) {
          const x = X(m.mean);
          line(x, top - 6, x, base, RED, 2.4, [8, 6]);
          halo('x̄ = ' + dec(m.mean), x, top - 16, RED, 'bold 14px ' + MATH, 'center');
        }
        if (st.showMedian && isFinite(m.median)) {
          const x = X(m.median);
          line(x, top - 6, x, base, CYAN, 2.4, [8, 6]);
          halo('中位数 = ' + dec(m.median), x, top - 34, CYAN, 'bold 14px ' + MATH, 'center');
        }
      }

      function drawChart(r, arr, m, pi, kind) {
        if (kind === 'dot') drawDot(r, arr, m, pi);
        else if (kind === 'bar') drawBar(r, arr, m, pi);
        else if (kind === 'pie') drawPie(r, arr, m, pi);
        else if (kind === 'line') drawLineChart(r, arr, m, pi);
        else drawHist(r, arr, m, pi);
      }

      // 第二组不为空时，第一组也改用柱/饼/折线（点图并排既挤又不直观）
      function kindFor(pi) {
        if (pi === 2 && st.chart === 'dot') return 'bar';
        return st.chart;
      }

      function drawEmpty() {
        text('支持 1~' + MAXN + ' 个数据，每个值在 0~100 之间', W / 2, H / 2 - 12, GRAY, '16px ' + FONT, 'center');
        text('在右边的「数据（空格或逗号分隔）」里输入，或用「随机一组」「示例：甲乙射击」', W / 2, H / 2 + 16, GRAY, '15px ' + FONT, 'center');
        text('数据（' + st.data.length + '/' + MAXN + '）', 14, 18, GRAY, '14px ' + FONT);
      }

      function draw() {
        kit.background();
        const arr = st.data;
        if (!arr.length) { drawEmpty(); return; }
        const two = st.data2.length > 0;
        const m1 = stats(arr), m2 = two ? stats(st.data2) : null;
        const marginB = two && m2 ? 30 : 0;
        const area = { x: 14, y: 8, w: W - 28, h: H - 16 - marginB };
        if (two && m2) {
          const half = (area.h - 10) / 2;
          drawPanelCard({ x: area.x, y: area.y, w: area.w, h: half }, arr, m1, 1);
          drawPanelCard({ x: area.x, y: area.y + half + 10, w: area.w, h: half }, st.data2, m2, 2);
          text('第一组：x̄ = ' + dec(m1.mean) + '，s² = ' + dec(m1.variance) + '　|　第二组：x̄ = ' + dec(m2.mean) + '，s² = ' + dec(m2.variance)
            + '　→' + (m1.variance > m2.variance ? '第一组波动更大' : m1.variance < m2.variance ? '第二组波动更大' : '两组波动一样大'), 16, H - 14, INK, '15px ' + FONT);
        } else {
          drawPanelCard(area, arr, m1, 1);
        }
      }

      // 一张统计图卡片（浅底 + 标题 + 图 + 图注）
      function drawPanelCard(box, arr, m, pi) {
        c2.save();
        c2.beginPath(); c2.moveTo(box.x + 12, box.y);
        c2.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, 12);
        c2.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, 12);
        c2.arcTo(box.x, box.y + box.h, box.x, box.y, 12);
        c2.arcTo(box.x, box.y, box.x + box.w, box.y, 12);
        c2.closePath();
        c2.fillStyle = '#f7f9fc'; c2.fill();
        c2.lineWidth = 1; c2.strokeStyle = '#e3e7ee'; c2.stroke();
        c2.restore();
        const inner = { x: box.x + 12, y: box.y + 34, w: box.w - 24, h: box.h - 46 };
        drawChart(inner, arr, m, pi, kindFor(pi));
        text((pi === 1 ? '第一组' : '第二组') + '：' + arr.length + ' 个数据，平均数 ' + dec(m.mean)
          + '，中位数 ' + dec(m.median) + '，众数 ' + modeText(m) + '，极差 ' + fmtInt(m.range) + '，方差 s² = ' + dec(m.variance),
          box.x + 16, box.y + box.h - 9, GRAY, '14px ' + FONT);
        if (pi === 1) text(CH_LABEL[st.chart], box.x + box.w - 16, box.y + 18, INK, 'bold 15px ' + FONT, 'right');
      }

      // ---------- 面板 ----------
      const panel = kit.panel;
      const t1 = GW.ui.text({ label: '数据（空格或逗号分隔）', value: st.data.join(' '), placeholder: '例如 2 3 3 5 7', onChange: (v) => { applyText(v, 1); } });
      const t2 = GW.ui.text({ label: '第二组（可空）', value: st.data2.join(' '), placeholder: '留空则只画一组', onChange: (v) => { applyText(v, 2); } });
      function parseList(s) {
        const toks = String(s).split(/[\s,，、]+/).filter((x) => x !== '');
        const out = [];
        let dropped = 0;
        for (let i = 0; i < toks.length; i++) {
          const x = Number(toks[i]);
          if (!isFinite(x)) { dropped++; continue; }
          if (out.length >= MAXN) { dropped++; continue; }
          out.push(Math.round(Math.max(0, Math.min(VMAX, x))));
        }
        return { list: out, dropped };
      }
      function applyText(s, which) {
        const r = parseList(s);
        if (which === 1) { st.data = r.list; if (!st.data.length) { st.data = DEF.slice(); st.data2 = []; t1.set(st.data.join(' ')); t2.set(''); } }
        else st.data2 = r.list;
        st.note = r.dropped ? '已忽略 ' + r.dropped + ' 个（非数字、或超过 ' + MAXN + ' 个）' : '';
        noteEl.textContent = st.note;
        dirty = true; save();
      }
      const chartSeg = GW.ui.segmented({
        options: [{ value: 'dot', label: '点图' }, { value: 'bar', label: '条形' }, { value: 'pie', label: '扇形' }, { value: 'line', label: '折线' }, { value: 'hist', label: '直方图' }],
        value: st.chart, onChange: (v) => { st.chart = v; build(); save(); },
      });
      const binSl = GW.ui.slider({ label: '组距', min: 1, max: 20, step: 1, value: st.bin, onInput: (v) => { st.bin = Math.round(v); dirty = true; save(); } });
      const binGroup = GW.ui.group('', binSl.el);
      const meanTg = GW.ui.toggle({ label: '显示平均数（红色虚线）', value: st.showMean, onChange: (v) => { st.showMean = v; dirty = true; save(); } });
      const medianTg = GW.ui.toggle({ label: '显示中位数（青色虚线）', value: st.showMedian, onChange: (v) => { st.showMedian = v; dirty = true; save(); } });
      const noteEl = GW.h('div', { style: { fontSize: '12px', color: GRAY, lineHeight: '1.5' } }, st.note);

      panel.append(GW.ui.group('数据', t1.el, t2.el, noteEl));
      panel.append(GW.ui.group('统计图', chartSeg.el, binGroup, meanTg.el, medianTg.el));
      const btnRandom = GW.ui.button({ label: '随机一组', onClick: () => setLists(rndList(5 + Math.floor(Math.random() * 6)), []) });
      const btnSample = GW.ui.button({ label: '示例：甲乙射击', primary: true, onClick: () => { const p = preset2(); setLists(p.data, p.data2); } });
      panel.append(GW.ui.group('操作', GW.h('div', { class: 'gw-row' }, btnRandom.el, btnSample.el)));
      function setLists(a, b) {
        st.data = a.slice(); st.data2 = b.slice(); st.note = '';
        t1.set(st.data.join(' ')); t2.set(st.data2.slice().join(' ')); noteEl.textContent = '';
        dirty = true; save();
      }
      function rndList(k) {
        const out = [];
        for (let i = 0; i < k; i++) out.push(Math.floor(Math.random() * 11));   // 0~10 的小整数，出重复值的机会大
        return out;
      }

      const rds = ['个数', '平均数', '中位数', '众数', '极差', '方差'].map((lb) => GW.ui.readout(lb));
      // 第二组的两个读数：保留对象引用直接 .set()，不去翻 DOM（GW.ui.group 的 children 里还有标题节点）
      const rd2Mean = GW.ui.readout('第二组 平均数'), rd2Var = GW.ui.readout('第二组 方差');
      const rd2 = GW.ui.group('第二组', rd2Mean.el, rd2Var.el);
      panel.append(GW.ui.group('统计量', rds[0].el, rds[1].el, rds[2].el, rds[3].el, rds[4].el, rds[5].el, rd2));

      function build() {
        chartSeg.set(st.chart);
        binGroup.style.display = st.chart === 'hist' ? '' : 'none';
        dirty = true;
      }
      function updateStats() {
        const m = stats(st.data);
        rds[0].set(m.n ? String(m.n) + ' 个' : '0 个');
        rds[1].set(m.n ? dec(m.mean) : '—');
        rds[2].set(m.n ? dec(m.median) : '—');
        rds[3].set(m.n ? modeText(m) : '—');
        rds[4].set(m.n ? fmtInt(m.range) : '—');
        rds[5].set(m.n ? dec(m.variance) : '—');
        const has2 = st.data2.length > 0, m2 = has2 ? stats(st.data2) : null;
        rd2.style.display = has2 ? '' : 'none';
        if (has2) { rd2Mean.set(dec(m2.mean)); rd2Var.set(dec(m2.variance)); }
      }

      build(); updateStats();
      kit.loop(() => {
        if (!dirty || !W) return;
        dirty = false;
        draw();
        updateStats();
      });
      return { destroy() { kit.destroy(); } };
    },
  });
})();
