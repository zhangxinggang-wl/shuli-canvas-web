/* 数理无限画布 · 高中数学 · 三角函数
 * 模式一：单位圆与 sin/cos/tan 图像同步；模式二：y = A sin(ωx + φ) + k 的图像变换
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541', GRAY = '#5b6576';
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const PI = Math.PI, TAU = 2 * PI;
  const TAN_COL = '#c98a12';

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
  // 以 π 为单位的分数形式（分母 ≤ 12），否则返回小数
  function piStr(v, allowDec = true) {
    const r = v / PI;
    for (const d of [1, 2, 3, 4, 6, 12]) {
      const n = Math.round(r * d);
      if (Math.abs(n / d - r) < 1e-6) {
        if (n === 0) return '0';
        const g = gcd(n, d), nn = n / g, dd = d / g;
        const sign = nn < 0 ? '−' : '', an = Math.abs(nn);
        return sign + (an === 1 ? '' : an) + 'π' + (dd === 1 ? '' : '/' + dd);
      }
    }
    return allowDec ? dec(v) : null;
  }
  function dec(v, d = 3) { if (!isFinite(v)) return '不存在'; let s = (Math.abs(v) < 5e-7 ? 0 : v).toFixed(d).replace(/\.?0+$/, ''); return s.replace('-', '−'); }
  // 特殊角精确值
  const EXACT = { 0: '0', 0.5: '1/2', [Math.SQRT1_2.toFixed(6)]: '√2/2', [(Math.sqrt(3) / 2).toFixed(6)]: '√3/2', 1: '1', [(Math.sqrt(3) / 3).toFixed(6)]: '√3/3', [Math.sqrt(3).toFixed(6)]: '√3' };
  function exact(v) {
    if (!isFinite(v) || Math.abs(v) > 1e6) return null;
    const a = Math.abs(v);
    for (const k in EXACT) if (Math.abs(a - +k) < 1e-6) return (v < -1e-9 ? '−' : '') + EXACT[k];
    return null;
  }

  GW.registerSim({
    id: 'math-trig', name: '三角函数', category: 'math', group: '函数',
    desc: '单位圆与正弦、余弦、正切图像同步；y = A sin(ωx + φ) + k 的图像变换',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="12" r="4.5"/><path d="M6.5 12l3.2-3.2M9.7 8.8H13"/><path d="M13 12c1.5-5 3-5 4.5 0s3 5 4.5 0"/></svg>',
    width: 1000, height: 600,
    create(ctx) {
      const st = ctx.state;
      if (st.mode !== 'wave') st.mode = 'circle';
      if (st.theta == null) st.theta = PI / 6;
      st.show = st.show || { sin: true, cos: false, tan: false };
      if (st.snap == null) st.snap = true;
      st.auto = !!st.auto;
      const w = (st.w = st.w || { A: 2, omega: 2, phi: PI / 3, k: 0 });
      if (st.step == null) st.step = 4;
      st.ref = st.ref !== false;

      const kit = GW.simKit.layout(ctx.root, { panelWidth: 270 });
      const c2 = kit.ctx2d;
      let W = 0, H = 0, dirty = true;
      kit.onResize((ww, hh) => { W = ww; H = hh; dirty = true; });
      let saveT = 0;
      const save = (later) => { clearTimeout(saveT); if (later) saveT = setTimeout(() => ctx.save(), 400); else ctx.save(); };

      // ---------- 通用绘图 ----------
      function line(x1, y1, x2, y2, color, wd, dash) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = wd || 2; c2.lineCap = 'round'; if (dash) c2.setLineDash(dash);
        c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke(); c2.restore();
      }
      function dot(x, y, r, fill, stroke) { c2.beginPath(); c2.arc(x, y, r, 0, TAU); c2.fillStyle = fill; c2.fill(); if (stroke) { c2.lineWidth = 2.5; c2.strokeStyle = stroke; c2.stroke(); } }
      function txt(t, x, y, color, font, al, bl) {
        c2.save(); c2.font = font || 'italic 18px ' + MATH; c2.textAlign = al || 'left'; c2.textBaseline = bl || 'middle';
        c2.lineWidth = 4; c2.strokeStyle = 'rgba(255,255,255,0.92)'; c2.lineJoin = 'round'; c2.strokeText(t, x, y);
        c2.fillStyle = color || INK; c2.fillText(t, x, y); c2.restore();
      }
      function curve(f, x0, x1, X, Y, color, wd, dash, yLim) {
        c2.save(); c2.strokeStyle = color; c2.lineWidth = wd; c2.lineJoin = 'round'; if (dash) c2.setLineDash(dash);
        c2.beginPath();
        const n = Math.max(2, Math.ceil(Math.abs(X(x1) - X(x0))));
        let pen = false, py = null;
        for (let i = 0; i <= n; i++) {
          const x = x0 + (x1 - x0) * i / n, y = f(x);
          const bad = !isFinite(y) || (yLim && Math.abs(y) > yLim);
          if (bad) { if (pen && yLim && isFinite(y)) c2.lineTo(X(x), Y(Math.sign(y) * yLim)); pen = false; py = null; continue; }
          if (py != null && yLim && Math.abs(y - py) > yLim) pen = false;
          if (!pen) {
            // 从边界进入
            c2.moveTo(X(x), Y(y)); pen = true;
          } else c2.lineTo(X(x), Y(y));
          py = y;
        }
        c2.stroke(); c2.restore();
      }

      // ======================= 模式一：单位圆 =======================
      let L = null; // 布局
      function layoutCircle() {
        const R = Math.max(60, Math.min(H * 0.28, W * 0.15));
        const cx = 30 + R + 20, cy = H / 2 + 10;
        const gx0 = cx + R + 70, gx1 = W - 30;
        const sx = (gx1 - gx0) / TAU;
        L = { R, cx, cy, gx0, gx1, sx, X: (t) => gx0 + t * sx, Y: (v) => cy - v * R, yLim: (H / 2 - 10) / R };
      }
      function drawCircleMode() {
        layoutCircle();
        const { R, cx, cy, gx0, gx1, X, Y, yLim } = L;
        const th = st.theta, c = Math.cos(th), s = Math.sin(th), t = Math.tan(th);
        const Px = cx + R * c, Py = cy - R * s;
        // ----- 右侧图像坐标 -----
        c2.lineWidth = 1; c2.strokeStyle = 'rgba(27,36,51,0.08)'; c2.beginPath();
        for (let k = 0; k <= 8; k++) { const x = X(k * PI / 4); c2.moveTo(x, 20); c2.lineTo(x, H - 20); }
        [-2, -1, 1, 2].forEach((v) => { if (Math.abs(v) <= yLim) { c2.moveTo(gx0, Y(v)); c2.lineTo(gx1, Y(v)); } });
        c2.stroke();
        GW.draw.arrow(c2, gx0 - 16, cy, gx1 + 18, cy, { color: INK, width: 2, head: 11 });
        GW.draw.arrow(c2, gx0, H - 12, gx0, 12, { color: INK, width: 2, head: 11 });
        txt('x', gx1 + 16, cy + 18, INK, 'italic 18px ' + MATH, 'right');
        txt('y', gx0 + 10, 16, INK, 'italic 18px ' + MATH);
        txt('O', gx0 - 5, cy + 14, INK, 'italic 17px ' + MATH, 'right');
        for (let k = 1; k <= 8; k++) {
          if (k % 2 && k !== 1 && k !== 3 && k !== 5 && k !== 7) continue;
          const x = X(k * PI / 4);
          line(x, cy, x, cy - 5, INK, 1.5);
          if (k % 2 === 0) txt(piStr(k * PI / 4), x, cy + 16, INK, 'italic 16px ' + MATH, 'center');
        }
        [-1, 1].forEach((v) => { line(gx0, Y(v), gx0 + 5, Y(v), INK, 1.5); txt(v < 0 ? '−1' : '1', gx0 - 6, Y(v), INK, '15px ' + MATH, 'right'); });
        // ----- 单位圆 -----
        line(cx - R - 22, cy, cx + R + 26, cy, INK, 2);
        GW.draw.arrow(c2, cx + R + 20, cy, cx + R + 30, cy, { color: INK, width: 2, head: 10 });
        GW.draw.arrow(c2, cx, cy + R + 22, cx, cy - R - 30, { color: INK, width: 2, head: 10 });
        txt('x', cx + R + 30, cy - 14, INK, 'italic 17px ' + MATH, 'right');
        txt('y', cx + 9, cy - R - 26, INK, 'italic 17px ' + MATH);
        c2.beginPath(); c2.arc(cx, cy, R, 0, TAU); c2.strokeStyle = INK; c2.lineWidth = 2.4; c2.stroke();
        txt('O', cx - 6, cy + 14, INK, 'italic 17px ' + MATH, 'right');
        txt('1', cx + R + 3, cy + 14, INK, '15px ' + MATH, 'left');
        // 曲线（已走过部分加粗）
        const fns = { sin: Math.sin, cos: Math.cos, tan: Math.tan };
        const cols = { sin: RED, cos: BLUE, tan: TAN_COL };
        ['cos', 'tan', 'sin'].forEach((k) => {
          if (!st.show[k]) return;
          curve(fns[k], 0, TAU, X, Y, cols[k], 2, [5, 5], yLim);
          curve(fns[k], 0, th, X, Y, cols[k], 3.2, null, yLim);
        });
        if (st.show.tan) {
          [PI / 2, 3 * PI / 2].forEach((a) => line(X(a), 16, X(a), H - 16, TAN_COL, 1.4, [3, 5]));
        }
        // 角
        c2.save(); c2.beginPath(); c2.moveTo(cx, cy); c2.arc(cx, cy, R * 0.22, 0, -th, true); c2.closePath();
        c2.fillStyle = 'rgba(15,157,138,0.15)'; c2.fill();
        c2.beginPath(); c2.arc(cx, cy, R * 0.22, 0, -th, true); c2.strokeStyle = CYAN; c2.lineWidth = 2; c2.stroke(); c2.restore();
        const mid = th / 2;
        txt('α', cx + R * 0.33 * Math.cos(mid), cy - R * 0.33 * Math.sin(mid), CYAN, 'italic 19px ' + MATH, 'center');
        // tan：切线 x=1 与终边（或反向延长线）交点 T
        if (st.show.tan && Math.abs(c) > 1e-3) {
          const Ax = cx + R;
          line(Ax, cy - yLim * R, Ax, cy + yLim * R, GRAY, 1.4, [6, 5]);
          const Ty = cy - t * R, TyC = Math.max(4, Math.min(H - 4, Ty));
          // 终边延长线
          const ext = Math.abs(Ty - TyC) < 1 ? null : true;
          line(cx, cy, Ax, TyC, TAN_COL, 1.6, [5, 4]);
          if (!ext) {
            line(Ax, cy, Ax, Ty, TAN_COL, 4);
            dot(Ax, Ty, 5, TAN_COL);
            txt('T', Ax + 8, Ty - 12, TAN_COL, 'italic bold 18px ' + MATH);
            const gy = Y(t);
            line(Ax, Ty, X(th), gy, TAN_COL, 1.4, [4, 5]);
            dot(X(th), gy, 6, TAN_COL, '#fff');
          }
          txt('A', Ax + 6, cy + 15, INK, 'italic 17px ' + MATH);
        }
        // 终边
        line(cx, cy, Px, Py, INK, 2.6);
        // cos：OM（x 轴上）
        if (st.show.cos) {
          line(cx, cy, Px, cy, BLUE, 4.5);
          const gy = Y(c);
          line(X(th), cy, X(th), gy, BLUE, 4.5);
          dot(X(th), gy, 6, BLUE, '#fff');
          // 把 OM 旋转到竖直：用虚线弧提示
          txt('M', Px + (c >= 0 ? 4 : -4), cy + (s >= 0 ? 15 : -15), INK, 'italic 17px ' + MATH, c >= 0 ? 'left' : 'right');
        }
        if (st.show.sin) {
          line(Px, cy, Px, Py, RED, 4.5);
          const gy = Y(s);
          line(Px, Py, X(th), gy, RED, 1.5, [5, 5]);
          line(X(th), cy, X(th), gy, RED, 4.5);
          dot(X(th), gy, 6, RED, '#fff');
        }
        // 线段到 x 轴的垂线投影（图像）
        line(X(th), 20, X(th), H - 20, 'rgba(27,36,51,0.25)', 1.2, [2, 5]);
        txt(piStr(th), X(th), H - 22, CYAN, 'italic 16px ' + MATH, 'center');
        dot(Px, Py, 9, CYAN, '#fff');
        dot(Px, Py, 17, 'rgba(15,157,138,0.14)');
        txt('P', Px + (c >= 0 ? 12 : -12), Py - 14, INK, 'italic bold 19px ' + MATH, c >= 0 ? 'left' : 'right');
        // 数值面板（画布左上）
        const deg = th * 180 / PI;
        const rows = [['α = ' + piStr(th) + '（' + dec(deg, 1) + '°）', CYAN]];
        const val = (name, v) => { const ex = exact(v); return name + ' α = ' + (ex && ex !== dec(v) ? ex + ' ≈ ' + dec(v) : dec(v)); };
        if (st.show.sin) rows.push([val('sin', s), RED]);
        if (st.show.cos) rows.push([val('cos', c), BLUE]);
        if (st.show.tan) rows.push([Math.abs(c) < 1e-9 ? 'tan α 不存在' : val('tan', t), TAN_COL]);
        c2.save(); c2.font = '17px ' + FONT;
        const bw = Math.max(...rows.map((r) => c2.measureText(r[0]).width)) + 24;
        c2.fillStyle = 'rgba(255,255,255,0.92)'; c2.strokeStyle = '#e3e7ee'; c2.lineWidth = 1;
        c2.beginPath(); c2.rect(12, 12, bw, rows.length * 26 + 12); c2.fill(); c2.stroke();
        rows.forEach((r, i) => { c2.fillStyle = r[1]; c2.textAlign = 'left'; c2.textBaseline = 'middle'; c2.fillText(r[0], 24, 31 + i * 26); });
        c2.restore();
        updateCircleReadouts();
      }

      // ======================= 模式二：图像变换 =======================
      const lerp = (a, b, t) => a + (b - a) * t;
      let stepAnim = st.step; // 动画中的连续步
      function paramsAt(sv) {
        // 0: sin x → 1: sin(x+φ) → 2: sin(ωx+φ) → 3: A sin(ωx+φ) → 4: +k
        const c = (i) => GW.clamp(sv - i, 0, 1);
        const phi = lerp(0, w.phi, c(0));
        const om = lerp(1, w.omega, c(1));
        const A = lerp(1, w.A, c(2));
        const k = lerp(0, w.k, c(3));
        return { A, om, phi, k };
      }
      function drawWaveMode() {
        const left = 50, right = W - 24, top = 70, bottom = H - 70;
        const xmin = -PI, xmax = xmin + Math.max(4 * PI, Math.ceil((2 * TAU / Math.min(1, w.omega) + 0.3) / PI) * PI);
        const ymax = Math.max(2.5, Math.abs(w.A) + Math.abs(w.k) + 0.6);
        const sx = (right - left) / (xmax - xmin), sy = (bottom - top) / 2 / ymax;
        const ox = left - xmin * sx, oy = (top + bottom) / 2;
        const X = (x) => ox + x * sx, Y = (y) => oy - y * sy;
        // 网格
        c2.lineWidth = 1; c2.strokeStyle = 'rgba(27,36,51,0.08)'; c2.beginPath();
        const tk = PI / 2 * sx >= 48 ? PI / 2 : PI * sx >= 48 ? PI : TAU;
        for (let k = -8; k * tk / 2 <= xmax; k++) { const x = X(k * tk / 2); if (x < left - 30) continue; c2.moveTo(x, 50); c2.lineTo(x, H - 50); }
        for (let v = -Math.floor(ymax); v <= ymax; v++) { c2.moveTo(left - 30, Y(v)); c2.lineTo(right, Y(v)); }
        c2.stroke();
        GW.draw.arrow(c2, left - 30, oy, right + 12, oy, { color: INK, width: 2, head: 11 });
        GW.draw.arrow(c2, ox, H - 40, ox, 46, { color: INK, width: 2, head: 11 });
        txt('x', right + 8, oy + 18, INK, 'italic 18px ' + MATH, 'right');
        txt('y', ox + 10, 52, INK, 'italic 18px ' + MATH);
        txt('O', ox - 5, oy + 14, INK, 'italic 17px ' + MATH, 'right');
        for (let k = Math.ceil(xmin / tk); k * tk <= xmax + 1e-9; k++) {
          if (!k) continue;
          const x = X(k * tk);
          line(x, oy, x, oy - 5, INK, 1.5);
          txt(piStr(k * tk), x, oy + 16, INK, 'italic 16px ' + MATH, 'center');
        }
        for (let v = -Math.floor(ymax); v <= ymax; v++) { if (!v) continue; line(ox, Y(v), ox + 5, Y(v), INK, 1.5); txt(String(v).replace('-', '−'), ox - 6, Y(v), INK, '15px ' + MATH, 'right'); }
        c2.save(); c2.beginPath(); c2.rect(left - 30, 40, right - left + 50, H - 80); c2.clip();
        // 参考 y = sin x
        if (st.ref) curve(Math.sin, xmin - 1, xmax + 1, X, Y, GRAY, 2, [7, 6]);
        const sv = stepAnim;
        // 上一步（淡）
        if (sv > 0.001 && st.step < 4) {
          const pp = paramsAt(Math.max(0, Math.ceil(sv) - 1));
          curve((x) => pp.A * Math.sin(pp.om * x + pp.phi) + pp.k, xmin - 1, xmax + 1, X, Y, 'rgba(51,102,255,0.3)', 2.4);
        }
        const p = paramsAt(sv);
        const f = (x) => p.A * Math.sin(p.om * x + p.phi) + p.k;
        // 中线
        if (Math.abs(p.k) > 1e-6) { line(left - 30, Y(p.k), right, Y(p.k), CYAN, 1.6, [8, 5]); txt('y = ' + dec(p.k, 2), right - 4, Y(p.k) - 12, CYAN, 'italic 16px ' + MATH, 'right'); }
        curve(f, xmin - 1, xmax + 1, X, Y, BLUE, 3.2);
        // 标注：一个周期（从“五点法”的第一个点 x0 = −φ/ω 开始）
        const T = TAU / Math.abs(p.om);
        let x0 = -p.phi / p.om;
        while (x0 < xmin + 0.2) x0 += T;
        while (x0 - T >= xmin + 0.2) x0 -= T;
        if (x0 + T <= xmax + 1e-6 || T > xmax - xmin) {
          const yb = Y(-Math.abs(p.A) + p.k) + 28;
          const xa = X(x0), xb = X(Math.min(x0 + T, xmax));
          GW.draw.arrow(c2, (xa + xb) / 2, yb, xa, yb, { color: RED, width: 2, head: 9 });
          GW.draw.arrow(c2, (xa + xb) / 2, yb, xb, yb, { color: RED, width: 2, head: 9 });
          line(xa, yb - 10, xa, yb + 10, RED, 1.6); line(xb, yb - 10, xb, yb + 10, RED, 1.6);
          txt('T = ' + (piStr(T, false) || dec(T, 2)), (xa + xb) / 2, yb + 18, RED, 'italic 17px ' + MATH, 'center');
          // 五点
          for (let i = 0; i <= 4; i++) {
            const x = x0 + i * T / 4;
            dot(X(x), Y(f(x)), 5, BLUE, '#fff');
          }
          // 振幅：在第一个最大值处
          const xm = x0 + (p.A >= 0 ? T / 4 : 3 * T / 4);
          const ym = Y(Math.abs(p.A) + p.k), yk = Y(p.k);
          line(X(xm), yk, X(xm), ym, GOLD, 3);
          line(X(xm) - 7, ym, X(xm) + 7, ym, GOLD, 2); line(X(xm) - 7, yk, X(xm) + 7, yk, GOLD, 2);
          txt('|A| = ' + dec(Math.abs(p.A), 2), X(xm) + 10, (ym + yk) / 2, '#b9741a', 'italic 17px ' + MATH);
        }
        // 相位起点
        const xs = -p.phi / p.om;
        if (Math.abs(p.phi) > 1e-6 && X(xs) > left - 20 && X(xs) < right) {
          line(X(xs), Y(p.k), X(0), Y(p.k), CYAN, 2.4);
          dot(X(xs), Y(p.k), 5, CYAN);
          txt((xs < 0 ? '左移 ' : '右移 ') + (piStr(Math.abs(xs), false) || dec(Math.abs(xs), 2)), (X(xs) + X(0)) / 2, Y(p.k) - 16, CYAN, '15px ' + FONT, 'center');
        }
        c2.restore();
        // 解析式
        const eq = formula(p);
        c2.save(); c2.font = 'italic 22px ' + MATH;
        const bw = c2.measureText(eq).width + 28;
        c2.fillStyle = 'rgba(255,255,255,0.95)'; c2.strokeStyle = '#e3e7ee'; c2.lineWidth = 1;
        c2.beginPath(); c2.rect(12, 8, bw, 38); c2.fill(); c2.stroke();
        c2.fillStyle = BLUE; c2.textBaseline = 'middle'; c2.fillText(eq, 26, 28);
        if (st.ref) { c2.font = 'italic 17px ' + MATH; c2.fillStyle = GRAY; c2.fillText('（虚线：y = sin x）', 26 + bw, 28); }
        c2.restore();
        // 步骤说明
        const steps = stepTexts();
        c2.save(); c2.font = '15px ' + FONT; c2.textBaseline = 'middle'; c2.textAlign = 'left';
        { const tw = c2.measureText(steps.join(' → ')).width; if (tw > W - 28) c2.font = Math.max(11, Math.floor(15 * (W - 28) / tw)) + 'px ' + FONT; }
        let x = 14; const y = H - 22;
        steps.forEach((s2, i) => {
          const on = i <= Math.round(st.step);
          c2.fillStyle = on ? (i === Math.round(st.step) ? BLUE : INK) : '#a7afbd';
          const t2 = (i ? ' → ' : '') + s2;
          c2.fillText(t2, x, y); x += c2.measureText(t2).width;
        });
        c2.restore();
        updateWaveReadouts(p);
      }
      function sgnNum(v, d = 2) { const s = piStr(Math.abs(v)); return (v < 0 ? ' − ' : ' + ') + s; }
      function coef(v) { const s = dec(v, 2); return s === '1' ? '' : s === '−1' ? '−' : s; }
      function formula(p) {
        let inner = coef(p.om) + 'x';
        if (Math.abs(p.phi) > 1e-6) inner += sgnNum(p.phi);
        let s = 'y = ' + coef(p.A) + 'sin(' + inner + ')';
        if (Math.abs(p.k) > 1e-6) s += (p.k < 0 ? ' − ' : ' + ') + dec(Math.abs(p.k), 2);
        return s;
      }
      function stepTexts() {
        const ph = w.phi, om = w.omega;
        return [
          'y = sin x',
          Math.abs(ph) < 1e-9 ? '不左右平移' : (ph > 0 ? '向左' : '向右') + '平移 ' + piStr(Math.abs(ph)),
          '横坐标变为原来的 ' + (dec(1 / om, 2)) + ' 倍',
          '纵坐标变为原来的 ' + dec(Math.abs(w.A), 2) + ' 倍' + (w.A < 0 ? '并作关于 x 轴的对称' : ''),
          Math.abs(w.k) < 1e-9 ? '不上下平移' : (w.k > 0 ? '向上' : '向下') + '平移 ' + dec(Math.abs(w.k), 2),
        ];
      }

      // ---------- 交互（单位圆拖动） ----------
      kit.drag(
        (p) => {
          if (st.mode !== 'circle' || !L) return null;
          const d = Math.hypot(p.x - L.cx, p.y - L.cy);
          if (Math.abs(d - L.R) < 26 || d < L.R) return 'P';
          // 在图像区点击：按横坐标设定角
          if (p.x >= L.gx0 && p.x <= L.gx1) return 'G';
          return null;
        },
        (obj, p) => {
          let th;
          if (obj === 'P') th = Math.atan2(-(p.y - L.cy), p.x - L.cx);
          else th = (p.x - L.gx0) / L.sx;
          th = ((th % TAU) + TAU) % TAU;
          if (st.snap) { const q = [PI / 6, PI / 4]; for (const u of q) { const n = Math.round(th / u); if (Math.abs(n * u - th) < 0.045) { th = (n * u) % TAU; break; } } }
          st.theta = th; if (st.auto) setAuto(false);
          dirty = true;
        },
        () => save()
      );

      // ---------- 面板 ----------
      const panel = kit.panel;
      const modeSeg = GW.ui.segmented({ options: [{ value: 'circle', label: '单位圆' }, { value: 'wave', label: 'A sin(ωx+φ)+k' }], value: st.mode, onChange: (v) => { st.mode = v; build(); save(); } });
      panel.append(GW.ui.group('模式', modeSeg.el));
      const box = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
      panel.append(box);
      let autoBtn = null, rd = {};
      function setAuto(v) { st.auto = v; if (autoBtn) autoBtn.set(v ? '⏸ 停止旋转' : '▶ 自动旋转'); }
      let waveSl = {};
      function build() {
        modeSeg.set(st.mode);
        box.innerHTML = ''; rd = {}; waveSl = {};
        if (st.mode === 'circle') {
          const tg = (label, key) => GW.ui.toggle({ label, value: st.show[key], onChange: (v) => { st.show[key] = v; dirty = true; save(); } }).el;
          autoBtn = GW.ui.button({ label: st.auto ? '⏸ 停止旋转' : '▶ 自动旋转', primary: true, onClick: () => setAuto(!st.auto) });
          const snap = GW.ui.toggle({ label: '吸附特殊角（π/6、π/4 的倍数）', value: st.snap, onChange: (v) => { st.snap = v; save(); } });
          const quick = GW.h('div', { class: 'gw-row' }, ['π/6', 'π/4', 'π/3', 'π/2', '2π/3', 'π', '7π/6', '3π/2'].map((s, i) => {
            const vals = [PI / 6, PI / 4, PI / 3, PI / 2, 2 * PI / 3, PI, 7 * PI / 6, 3 * PI / 2];
            const b = GW.h('button', { class: 'gw-btn', style: { padding: '4px 2px', minHeight: '34px', flex: '1 0 22%', fontFamily: MATH, fontStyle: 'italic', fontSize: '15px' }, onclick: () => { st.theta = vals[i]; setAuto(false); dirty = true; save(); } }, s);
            return b;
          }));
          box.append(GW.ui.group('显示', tg('正弦 sin α（红）', 'sin'), tg('余弦 cos α（蓝）', 'cos'), tg('正切 tan α（金）', 'tan')));
          box.append(GW.ui.group('角 α', autoBtn.el, snap.el, quick));
          rd.q = GW.ui.readout('所在象限'); rd.sg = GW.ui.readout('符号');
          box.append(GW.ui.group('读数', rd.q.el, rd.sg.el, GW.h('div', { style: { fontSize: '12px', color: GRAY, lineHeight: '1.6' } }, '拖动单位圆上的点 P 改变角 α；也可在右侧图像区左右拖动。')));
        } else {
          const sl = (key, label, min, max, step, fmtPi) => {
            const s = GW.ui.slider({ label, min, max, step, value: w[key], onInput: (v) => { w[key] = v; showPi(); st.step = 4; stepAnim = 4; dirty = true; save(true); } });
            const val = s.el.querySelector('.gw-sl-val');
            const showPi = () => { if (fmtPi) val.textContent = piStr(w[key]); };
            showPi();
            s.el.querySelector('span').style.cssText = 'font: italic 17px ' + MATH;
            waveSl[key] = s;
            return s.el;
          };
          box.append(GW.ui.group('参数',
            sl('A', 'A（振幅）', -3, 3, 0.1),
            sl('omega', 'ω（ω > 0）', 0.25, 4, 0.05),
            sl('phi', 'φ（初相）', -PI, PI, PI / 12, true),
            sl('k', 'k（上下平移）', -2, 2, 0.1),
            GW.ui.toggle({ label: '显示参考曲线 y = sin x', value: st.ref, onChange: (v) => { st.ref = v; dirty = true; save(); } }).el));
          const prev = GW.ui.button({ label: '◀ 上一步', onClick: () => { st.step = Math.max(0, Math.round(st.step) - 1); dirty = true; save(); } });
          const next = GW.ui.button({ label: '下一步 ▶', primary: true, onClick: () => { st.step = Math.min(4, Math.round(st.step) + 1); dirty = true; save(); } });
          const restart = GW.ui.button({ label: '↺ 从 y = sin x 开始', onClick: () => { st.step = 0; stepAnim = 0; dirty = true; save(); } });
          box.append(GW.ui.group('分步变换（先平移后伸缩）', GW.h('div', { class: 'gw-row' }, prev.el, next.el), restart.el));
          rd.T = GW.ui.readout('周期 T = 2π/ω'); rd.A = GW.ui.readout('振幅 |A|'); rd.f = GW.ui.readout('频率 f = 1/T'); rd.ph = GW.ui.readout('相位'); rd.phi = GW.ui.readout('初相 φ'); rd.rg = GW.ui.readout('值域');
          box.append(GW.ui.group('性质', rd.T.el, rd.A.el, rd.f.el, rd.ph.el, rd.phi.el, rd.rg.el));
        }
        dirty = true;
      }
      function updateCircleReadouts() {
        if (!rd.q) return;
        const th = st.theta, eps = 1e-9;
        const axisNames = ['x 轴正半轴', 'y 轴正半轴', 'x 轴负半轴', 'y 轴负半轴'];
        const n = th / (PI / 2);
        if (Math.abs(n - Math.round(n)) < 1e-9) rd.q.set('终边在' + axisNames[Math.round(n) % 4]);
        else rd.q.set('第' + '一二三四'[Math.floor(n)] + '象限');
        const sg = (v) => (Math.abs(v) < eps ? '0' : v > 0 ? '+' : '−');
        rd.sg.set('sin ' + sg(Math.sin(th)) + '，cos ' + sg(Math.cos(th)) + '，tan ' + (Math.abs(Math.cos(th)) < eps ? '无' : sg(Math.tan(th))));
      }
      function updateWaveReadouts(p) {
        if (!rd.T) return;
        const T = TAU / p.om;
        rd.T.set(piStr(T, false) || dec(T, 3));
        rd.A.set(dec(Math.abs(p.A), 2));
        rd.f.set(dec(1 / T, 3));
        rd.ph.set('<i style="font-family:' + MATH + '">' + coef(p.om) + 'x' + (Math.abs(p.phi) > 1e-6 ? sgnNum(p.phi) : '') + '</i>');
        rd.phi.set(piStr(p.phi));
        rd.rg.set('[' + dec(p.k - Math.abs(p.A), 2) + ', ' + dec(p.k + Math.abs(p.A), 2) + ']');
      }

      build();
      kit.loop((dt) => {
        if (st.mode === 'circle' && st.auto && dt) { st.theta = (st.theta + dt * 0.6) % TAU; dirty = true; }
        if (st.mode === 'wave' && Math.abs(stepAnim - st.step) > 1e-4 && dt) {
          const d = st.step - stepAnim, sp = dt * 1.2;
          stepAnim = Math.abs(d) <= sp ? st.step : stepAnim + Math.sign(d) * sp;
          dirty = true;
        }
        if (!dirty || !W) return;
        dirty = false;
        kit.background();
        if (st.mode === 'circle') drawCircleMode(); else drawWaveMode();
      });
      return { destroy() { clearTimeout(saveT); kit.destroy(); } };
    },
  });
})();
