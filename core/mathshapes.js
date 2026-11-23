/* 数学可调参图形（初高中）
 * ------------------------------------------------------------------
 * 和 physshapes.js 的 type:'pb' 同一套路：对象是 kind:'shape' + type:'ms'，
 * 几何只由 (x1,y1)-(x2,y2) 这个框 + rot + 若干参数决定；draw 时现算，
 * 所以缩放/平移/旋转/改参数都不需要重采样点列。
 *
 * 对外接口（GW.mathShapes）：
 *   cats() / catLabel / list(cat) / get(key) / label(key)
 *   paramList(key) / defaults(key)
 *   make(key,x0,y0,x1,y1,opt) / insert(key,opt)
 *   draw(ctx,it) / bbox(it) / setParam(it,key,v)
 *
 * 约束：
 *   - 不新增运行期依赖；只用 Chromium 108 已有的 Canvas2D API。
 *   - 参数名不得与对象自带字段（width/color/dash/fill/rot/key…）重名。
 *   - bbox 必须把字号、圆心标注、虚线半径都包进去，否则拖动会留残影。
 */
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW) return;
  const PI = Math.PI, TAU = PI * 2;
  const P = {};
  GW.mathShapes = P;

  const DEFS = Object.create(null);
  const ORDER = [];
  const CATS = [['geo', '平面几何'], ['func', '函数图像']];
  const catLabel = {};
  CATS.forEach((c) => { catLabel[c[0]] = c[1]; });

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const rad = (d) => (d * PI) / 180;
  const rgba = (hex, a) => (GW.hexA ? GW.hexA(hex, a) : hex);

  // ---------- 框与旋转 ----------
  function geom(it) {
    let x1 = num(it.x1, 0), y1 = num(it.y1, 0), x2 = num(it.x2, x1 + 100), y2 = num(it.y2, y1 + 80);
    if (x2 < x1) { const t = x1; x1 = x2; x2 = t; }
    if (y2 < y1) { const t = y1; y1 = y2; y2 = t; }
    let w = x2 - x1, h = y2 - y1;
    if (w < 8) { w = 8; x2 = x1 + w; }
    if (h < 8) { h = 8; y2 = y1 + h; }
    return { x: x1, y: y1, w: w, h: h, x2: x2, y2: y2, cx: x1 + w / 2, cy: y1 + h / 2 };
  }
  // 旋转中心：pvOn 打开时绕老师指定的世界坐标点转（磁场里圆心不一定就是旋转中心），
  // 否则仍绕框心转（1.5.0 的老行为）。P.bbox 必须用同一个点，否则虚线框会跟图形分家。
  function rotCenter(it, g) {
    const p = GW.pivotOf && GW.pivotOf(it);
    return p || { x: g.cx, y: g.cy };
  }
  function applyFrame(ctx, it, g) {
    const p = rotCenter(it, g);
    ctx.translate(p.x, p.y);
    if (it.rot) ctx.rotate(it.rot);
    ctx.translate(-p.x, -p.y);
    return g;
  }

  const DEF_SIZE = [520, 380];

  // ---------- 样式 ----------
  function lineWidth(it, mul) {
    return Math.max(1, num(it.width, 3) * (mul == null ? 1 : mul));
  }
  function setStyle(ctx, it, mul, forceDash) {
    const w = lineWidth(it, mul);
    ctx.lineWidth = w;
    ctx.strokeStyle = it.color || '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 数学图形不带投影：外来的 shadowBlur 会让韦恩图这类图形四周多出一圈灰影
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.setLineDash(forceDash || it.dash ? [w * 3.1, w * 2.4] : []);
  }
  function fillStyle(ctx, it) {
    ctx.fillStyle = rgba(it.fillColor || it.color || '#ffffff', num(it.fillAlpha, 0.18));
  }
  function begin(ctx, pts, closed) {
    ctx.beginPath();
    if (!pts || pts.length < 2) return;
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    if (closed) ctx.closePath();
  }
  function paint(ctx, it, g, pts, closed, opts) {
    const o = opts || {};
    begin(ctx, pts, closed);
    if (closed && it.fill) { fillStyle(ctx, it); ctx.fill(); }
    setStyle(ctx, it, o.mul, o.dash);
    ctx.stroke();
  }
  function dot(ctx, it, x, y, r) {
    if (it._thumb) return;   // 缩略图不画顶点小圆点，30px 下只会显得脏
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, r == null ? lineWidth(it) * 1.7 : r), 0, TAU);
    ctx.fillStyle = it.color || '#ffffff';
    ctx.fill();
  }
  function txt(ctx, it, g, str, x, y, size, align, baseline) {
    if (it._thumb) return;   // 缩略图只画轮廓，不画 A/B/C、r、角度等标注，保持简笔画
    const fs = size || Math.max(12, Math.min(26, Math.min(g.w, g.h) * 0.06));
    ctx.fillStyle = it.color || '#ffffff';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = baseline || 'middle';
    // 1.6.0 排版：变量斜体、数字与单位正体（x₀、A、r、θ …），SVG/PDF 导出保持同一套字形
    // 几何图里的点名（A/B/C/O）用罗马体，变量（x/y/r/θ）用斜体
    const roman = /^[A-Z]$/.test(String(str));
    if (GW.typo) GW.typo.draw(ctx, str, x, y, fs, { align: align || 'center', baseline: baseline || 'middle', weight: 600, color: it.color || '#ffffff', roman: roman });
    else ctx.fillText(str, x, y);
  }
  function circlePts(cx, cy, rx, ry, a0, sweep) {
    const n = Math.max(24, Math.min(128, Math.round(Math.abs(sweep || TAU) * 24) + 12));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (a0 || 0) + ((sweep || TAU) * i) / n;
      pts.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
    }
    return pts;
  }
  function rightAngle(ctx, it, x, y, ux, uy, vx, vy, size) {
    const s = size || Math.max(10, lineWidth(it) * 4);
    ctx.beginPath();
    ctx.moveTo(x + ux * s, y + uy * s);
    ctx.lineTo(x + ux * s + vx * s, y + uy * s + vy * s);
    ctx.lineTo(x + vx * s, y + vy * s);
    setStyle(ctx, it, 0.8);
    ctx.stroke();
  }
  // 三角板式的直角小方块：两条边分别沿 u、v 方向
  function angleMark(ctx, it, cx, cy, r, a0, a1, text) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    setStyle(ctx, it, 0.8);
    ctx.stroke();
    if (text) {
      const am = (a0 + a1) / 2;
      txt(ctx, it, { w: r * 8, h: r * 8 }, text, cx + Math.cos(am) * r * 1.35, cy + Math.sin(am) * r * 1.35, r * 0.42);
    }
  }

  // ---------- 函数图像 ----------
  function pickStep(u) {
    let step = 1;
    while (step * u < 22) step *= 2;
    if (step * u > 110) step /= 2;
    if (step < 0.5) step = 0.5;
    return step;
  }
  // 刻度位数必须跟着步长走（1.6.0 G3）：step=1.5 时 1.5 被 toFixed(0) 变成「2」。
  // pickStep 只会给 0.5·2^k，但 o.step 允许老师传 0.25 这种，所以按 step 自己的小数位算。
  function tickDigits(step) {
    const s0 = Math.abs(Number(step));
    if (!isFinite(s0) || s0 <= 0) return 0;
    let s = s0, d = 0;
    while (d < 6 && Math.abs(s - Math.round(s)) > 1e-9) { s *= 10; d++; }
    return d;
  }
  function fmtTick(v, step) {
    const d = tickDigits(step);
    const s = v.toFixed(d);
    if (Number(s) === 0) return '0';                    // 负零 / -1e-12 这类浮点噪声
    return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  }
  /* f 为空时只画网格与坐标轴（坐标系模板用）。
     o.after(ctx, map) 可以在曲线之后补画焦点/准线等装饰。 */
  function plotFn(ctx, it, g, f, o) {
    o = o || {};
    const u = g.w / 20;                 // 1 个单位 = 多少世界像素（20 个单位铺满宽度）
    const step = num(o.step, pickStep(u));
    const xr = 10;
    const yr = g.h / 2 / u;
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.x, g.y, g.w, g.h);
    ctx.clip();

    const showAxes = o.axes !== false;
    if (showAxes) {
      // 网格：缩略图太小，网格和数字会糊成一片，只留坐标轴。
      if (!it._thumb) {
      ctx.setLineDash([]);
      ctx.lineWidth = Math.max(1, lineWidth(it) * 0.3);
      ctx.strokeStyle = rgba(it.color || '#ffffff', 0.14);
      ctx.beginPath();
      for (let x = -Math.ceil(xr / step) * step; x <= xr + 1e-9; x += step) {
        const px = g.cx + x * u;
        if (px <= g.x + 0.5 || px >= g.x + g.w - 0.5) continue;
        ctx.moveTo(px, g.y); ctx.lineTo(px, g.y + g.h);
      }
      const yr = g.h / 2 / u;
      for (let y = -Math.ceil(yr / step) * step; y <= yr + 1e-9; y += step) {
        const py = g.cy - y * u;
        if (py <= g.y + 0.5 || py >= g.y + g.h - 0.5) continue;
        ctx.moveTo(g.x, py); ctx.lineTo(g.x + g.w, py);
      }
      ctx.stroke();
      }

      // 坐标轴
      const ax = g.cx, ay = g.cy;
      ctx.lineWidth = Math.max(1.4, lineWidth(it) * 0.6);
      ctx.strokeStyle = rgba(it.color || '#ffffff', 0.9);
      ctx.beginPath();
      ctx.moveTo(g.x + 1, ay); ctx.lineTo(g.x + g.w - 1, ay);
      ctx.moveTo(ax, g.y + g.h - 1); ctx.lineTo(ax, g.y + 1);
      ctx.stroke();
      // 箭头
      const ah = Math.max(5, lineWidth(it) * 2.4);
      ctx.fillStyle = rgba(it.color || '#ffffff', 0.9);
      ctx.beginPath();
      ctx.moveTo(g.x + g.w - 1, ay); ctx.lineTo(g.x + g.w - 1 - ah, ay - ah * 0.6); ctx.lineTo(g.x + g.w - 1 - ah, ay + ah * 0.6); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ax, g.y + 1); ctx.lineTo(ax - ah * 0.6, g.y + 1 + ah); ctx.lineTo(ax + ah * 0.6, g.y + 1 + ah); ctx.closePath(); ctx.fill();

      // 刻度与数字：缩略图里省掉，只保留坐标轴轮廓
      if (!it._thumb) {
      const fs = Math.max(10, Math.min(20, Math.min(g.w, g.h) * 0.042));
      ctx.font = '500 ' + fs.toFixed(1) + 'px "Microsoft YaHei", "Segoe UI", sans-serif';
      // 1.6.0 排版：轴上的 x / y 是变量要斜体，刻度数字与 O 正体（typo 会临时改 textAlign，用完还原）
      const tput = function (str, px, py) {
        if (!GW.typo) { ctx.fillText(str, px, py); return; }
        const al = ctx.textAlign, bl = ctx.textBaseline;
        GW.typo.draw(ctx, str, px, py, fs, { align: al, baseline: bl, weight: 500, roman: /^[A-Z]$/.test(String(str)) });
        ctx.textAlign = al; ctx.textBaseline = bl;
      };
      ctx.fillStyle = rgba(it.color || '#ffffff', 0.85);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const tick = Math.max(3, lineWidth(it) * 1.2);
      ctx.strokeStyle = rgba(it.color || '#ffffff', 0.7);
      ctx.lineWidth = Math.max(1, lineWidth(it) * 0.4);
      ctx.beginPath();
      const labStep = step * (step * u < 34 ? 2 : 1);
      for (let x = -Math.ceil(xr / step) * step; x <= xr + 1e-9; x += step) {
        const px = g.cx + x * u;
        if (px < g.x + 8 || px > g.x + g.w - 8) continue;
        ctx.moveTo(px, ay - tick); ctx.lineTo(px, ay + tick);
        if (Math.abs(x / labStep - Math.round(x / labStep)) < 1e-6 && Math.abs(x) > 1e-9) {
          tput(fmtTick(x, step), px, ay + tick + 2);
        }
      }
      for (let y = -Math.ceil(yr / step) * step; y <= yr + 1e-9; y += step) {
        const py = g.cy - y * u;
        if (py < g.y + 8 || py > g.y + g.h - 8) continue;
        ctx.moveTo(ax - tick, py); ctx.lineTo(ax + tick, py);
        if (Math.abs(y / labStep - Math.round(y / labStep)) < 1e-6 && Math.abs(y) > 1e-9) {
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          tput(fmtTick(y, step), ax - tick - 3, py);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
        }
      }
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      tput('O', ax + tick + 3, ay + tick + 2);
      tput('x', g.x + g.w - fs * 1.4, ay - fs * 1.5);
      tput('y', ax + fs * 0.5, g.y + 2);
      }
    }

    // 曲线
    if (f) {
      const N = Math.max(160, Math.min(760, Math.round(g.w)));
      const sx = (gx) => g.x + ((gx + xr) / (xr * 2)) * g.w;
      let yMid = g.cy, yMul = u;
      // 缩略图不再单独做纵向归一化（旧实现按 6%~94% 分位把曲线压进框内）。
      // 现在点缩略图走「先量真实墨迹、再等比放大」的图标管线（app.js 的 thumbSrc），
      // 纵向归一化会让实际画到的位置与 MS.localBox 量出的位置对不上 —— 实测指数函数
      // 的墨迹因此只剩 2×3 像素（框在左上、曲线画在右下），图标一片空白。
      // 内容框本身已经按曲线真正画到的部分收缩，所以这里用数据坐标系即可。
      const sy = (gy) => yMid - gy * yMul;
      ctx.beginPath();
      let pen = false, prev = 0;
      for (let i = 0; i <= N; i++) {
        const gx = -xr + (2 * xr * i) / N;
        let gy;
        try { gy = f(gx, it); } catch (e) { gy = NaN; }
        if (!isFinite(gy) || Math.abs(gy) > 1e7) { pen = false; continue; }
        const px = sx(gx), py = sy(gy);
        if (pen && Math.abs(py - prev) > g.h * 1.25) pen = false;
        if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
        prev = py;
      }
      setStyle(ctx, it, 1);
      ctx.stroke();
    }

    if (o.after) o.after(ctx, { sx: (gx) => g.x + ((gx + xr) / (xr * 2)) * g.w, sy: (gy) => g.cy - gy * u, u: u });
    ctx.restore();
  }
  // 函数图像只画一条可调参数的曲线：不铺网格、不画坐标轴与刻度，
  // 老师拖四角缩放、拖旋转柄旋转时看到的始终是这条线本身，不会被坐标轴框住。
  function graph(key, label, formula, params, f, opts) {
    D(key, 'func', label, params, (ctx, it, g) => plotFn(ctx, it, g, f, Object.assign({ axes: false }, opts || {})));
    // 把 f 挂到定义上：MS.localBox 要靠它按「曲线真正画到哪」算内容框（以前只能拿到整框）。
    DEFS[key].f = f;
  }

  // ---------- 定义注册 ----------
  function D(key, cat, label, params, draw, opts) {
    DEFS[key] = { key: key, cat: cat, label: label, params: params || [], draw: draw, opts: opts || {} };
    ORDER.push(key);
  }
  function q(key, label, min, max, step, def, unit, hint) {
    return { key: key, label: label, min: min, max: max, step: step, def: def, unit: unit || '', hint: hint };
  }

  // ================= 平面几何 =================
  D('tri', 'geo', '一般三角形', [
    q('apex', '顶点位置', 0, 1, 0.01, 0.5), q('height', '高占比', 0.3, 1, 0.01, 0.85),
  ], (ctx, it, g) => {
    const L = g.x, R = g.x + g.w, B = g.y + g.h, T = g.y;
    const ax = L + g.w * it.apex, ay = B - g.h * it.height;
    paint(ctx, it, g, [L, B, R, B, ax, ay], true);
    const s = Math.max(12, Math.min(24, g.w * 0.045));
    txt(ctx, it, g, 'A', ax, ay - s * 1.2, s);
    txt(ctx, it, g, 'B', L - s * 0.6, B + s * 0.4, s);
    txt(ctx, it, g, 'C', R + s * 0.8, B + s * 0.4, s);
    if (T < ay - 2) {
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, B);
      setStyle(ctx, it, 0.55, [6, 5]); ctx.stroke();
    }
  }, { labels: true });

  D('rtri', 'geo', '直角三角形', [
    q('leg', '高占比', 0.2, 1, 0.01, 0.6),
  ], (ctx, it, g) => {
    const L = g.x, R = g.x + g.w, B = g.y + g.h;
    const hh = g.h * it.leg;
    paint(ctx, it, g, [L, B, L, B - hh, R, B], true);
    rightAngle(ctx, it, L, B, 0, -1, 1, 0, Math.min(24, g.h * 0.09));
    const s = Math.max(12, Math.min(24, g.w * 0.045));
    txt(ctx, it, g, 'A', L - s * 0.6, B - hh - s * 0.7, s);
    txt(ctx, it, g, 'B', L - s * 0.6, B + s * 0.4, s);
    txt(ctx, it, g, 'C', R + s * 0.8, B + s * 0.4, s);
  });

  D('iso-tri', 'geo', '等腰三角形', [
    q('height', '高占比', 0.3, 1, 0.01, 0.85),
  ], (ctx, it, g) => {
    const L = g.x, R = g.x + g.w, B = g.y + g.h, ax = g.cx, ay = B - g.h * it.height;
    paint(ctx, it, g, [L, B, R, B, ax, ay], true);
  });

  D('equi-tri', 'geo', '等边三角形', [], (ctx, it, g) => {
    const B = g.y + g.h, side = Math.min(g.w, g.h / 0.866);
    const cx = g.cx, hh = side * 0.866;
    paint(ctx, it, g, [cx - side / 2, B, cx + side / 2, B, cx, B - hh], true);
  });

  D('para', 'geo', '平行四边形', [
    q('height', '高占比', 0.3, 1, 0.01, 0.82), q('slant', '倾斜', -1, 1, 0.01, 0.5),
  ], (ctx, it, g) => {
    const L = g.x, R = g.x + g.w, B = g.y + g.h, T = B - g.h * it.height;
    const k = clamp(g.w * it.slant * 0.28, -g.w * 0.42, g.w * 0.42);
    paint(ctx, it, g, [L + k, T, R, T, R - k, B, L, B], true);
  });

  D('rect', 'geo', '矩形', [], (ctx, it, g) => {
    paint(ctx, it, g, [g.x, g.y, g.x + g.w, g.y, g.x + g.w, g.y + g.h, g.x, g.y + g.h], true);
  });

  D('square', 'geo', '正方形', [], (ctx, it, g) => {
    const s = Math.min(g.w, g.h), x = g.cx - s / 2, y = g.cy - s / 2;
    paint(ctx, it, g, [x, y, x + s, y, x + s, y + s, x, y + s], true);
  });

  D('rhombus', 'geo', '菱形', [q('ratio', '竖向占比', 0.2, 1, 0.01, 0.7)], (ctx, it, g) => {
    const safe = clamp(it.ratio, 0.2, 1);
    paint(ctx, it, g, [g.cx, g.cy - (g.h * safe) / 2, g.x + g.w, g.cy, g.cx, g.cy + (g.h * safe) / 2, g.x, g.cy], true);
  });

  D('trap', 'geo', '梯形', [
    q('top', '上底占比', 0.1, 0.9, 0.01, 0.55), q('shift', '上底偏移', -1, 1, 0.01, 0.35),
  ], (ctx, it, g) => {
    const L = g.x, R = g.x + g.w, B = g.y + g.h, T = g.y;
    const tw = g.w * clamp(it.top, 0.1, 0.9);
    const cx = g.cx + g.w * it.shift * 0.3;
    paint(ctx, it, g, [cx - tw / 2, T, cx + tw / 2, T, R, B, L, B], true);
  });

  D('iso-trap', 'geo', '等腰梯形', [q('top', '上底占比', 0.1, 0.9, 0.01, 0.55)], (ctx, it, g) => {
    const L = g.x, R = g.x + g.w, B = g.y + g.h, T = g.y, tw = g.w * clamp(it.top, 0.1, 0.9);
    paint(ctx, it, g, [g.cx - tw / 2, T, g.cx + tw / 2, T, R, B, L, B], true);
  });

  D('kite', 'geo', '筝形', [q('ratio', '顶点高度', 0.15, 0.85, 0.01, 0.3)], (ctx, it, g) => {
    const y = g.y + g.h * clamp(it.ratio, 0.15, 0.85);
    paint(ctx, it, g, [g.cx, y, g.x + g.w, g.cy, g.cx, g.y + g.h, g.x, g.cy], true);
  });

  D('ngon', 'geo', '正多边形', [
    q('n', '边数', 3, 12, 1, 6), q('angle', '旋转角', 0, 360, 5, 0, '°'), q('round', '外接圆占比', 0.6, 1, 0.01, 0.95),
  ], (ctx, it, g) => {
    const n = Math.round(clamp(it.n, 3, 12));
    const r = (Math.min(g.w, g.h) / 2) * clamp(it.round, 0.6, 1);
    const a0 = -PI / 2 + rad(it.angle);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (TAU * i) / n;
      pts.push(g.cx + r * Math.cos(a), g.cy + r * Math.sin(a));
    }
    paint(ctx, it, g, pts, true);
  });

  D('circle', 'geo', '圆（圆心与半径）', [], (ctx, it, g) => {
    const r = Math.min(g.w, g.h) * 0.46;
    paint(ctx, it, g, circlePts(g.cx, g.cy, r, r, 0, TAU), true);
    ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.cx + r, g.cy);
    setStyle(ctx, it, 0.6, [5, 4]); ctx.stroke();
    dot(ctx, it, g.cx, g.cy);
    const fs = Math.max(11, Math.min(20, r * 0.16));
    txt(ctx, it, g, 'O', g.cx - fs * 0.8, g.cy + fs * 0.9, fs);
    txt(ctx, it, g, 'r', g.cx + r * 0.52, g.cy - fs * 0.7, fs);
  });

  D('ellipse', 'geo', '椭圆', [], (ctx, it, g) => {
    paint(ctx, it, g, circlePts(g.cx, g.cy, g.w * 0.46, g.h * 0.46, 0, TAU), true);
    dot(ctx, it, g.cx, g.cy);
    txt(ctx, it, g, 'O', g.cx - 10, g.cy + 12);
  });

  D('sector', 'geo', '扇形', [
    q('start', '起始角', 0, 360, 5, 0, '°'), q('sweep', '圆心角', 10, 360, 5, 90, '°'),
  ], (ctx, it, g) => {
    const r = Math.min(g.w, g.h) * 0.44, a0 = rad(it.start), sw = rad(clamp(it.sweep, 10, 360));
    const pts = [g.cx, g.cy].concat(circlePts(g.cx, g.cy, r, r, a0, sw));
    if (it.fill) { begin(ctx, pts, true); fillStyle(ctx, it); ctx.fill(); }
    paint(ctx, it, g, pts, true);
    dot(ctx, it, g.cx, g.cy);
    const fs = Math.max(11, Math.min(20, r * 0.18));
    txt(ctx, it, g, 'O', g.cx - fs * 0.9, g.cy + fs * 0.9, fs);
    const am = a0 + sw / 2;
    txt(ctx, it, g, Math.round(it.sweep) + '°', g.cx + Math.cos(am) * r * 0.6, g.cy + Math.sin(am) * r * 0.6, fs * 0.95);
  });

  D('arc', 'geo', '圆弧（半径标注）', [
    q('start', '起始角', 0, 360, 5, 200, '°'), q('sweep', '圆心角', 20, 360, 5, 140, '°'),
  ], (ctx, it, g) => {
    const r = Math.min(g.w, g.h) * 0.44, a0 = rad(it.start), sw = rad(clamp(it.sweep, 20, 360));
    paint(ctx, it, g, circlePts(g.cx, g.cy, r, r, a0, sw), false);
    ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.cx + Math.cos(a0) * r, g.cy + Math.sin(a0) * r);
    ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.cx + Math.cos(a0 + sw) * r, g.cy + Math.sin(a0 + sw) * r);
    setStyle(ctx, it, 0.55, [5, 4]); ctx.stroke();
    dot(ctx, it, g.cx, g.cy);
    txt(ctx, it, g, 'O', g.cx - 10, g.cy + 12);
    txt(ctx, it, g, 'r', g.cx + Math.cos(a0 + sw / 2) * r * 0.55, g.cy + Math.sin(a0 + sw / 2) * r * 0.55);
  });

  D('chord', 'geo', '弦与弓形', [q('pos', '弦的位置', -0.8, 0.8, 0.01, 0.25)], (ctx, it, g) => {
    const r = Math.min(g.w, g.h) * 0.44;
    paint(ctx, it, g, circlePts(g.cx, g.cy, r, r, 0, TAU), true);
    const y = g.cy - clamp(it.pos, -0.8, 0.8) * r;
    const dx = Math.sqrt(Math.max(0, r * r - (y - g.cy) * (y - g.cy)));
    ctx.beginPath(); ctx.moveTo(g.cx - dx, y); ctx.lineTo(g.cx + dx, y);
    setStyle(ctx, it, 1.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.cx - dx, y);
    ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.cx + dx, y);
    setStyle(ctx, it, 0.55, [5, 4]); ctx.stroke();
    dot(ctx, it, g.cx, g.cy);
    txt(ctx, it, g, 'O', g.cx - 10, g.cy + 12);
  });

  D('ring', 'geo', '圆环', [q('inner', '内径占比', 0.1, 0.9, 0.01, 0.55)], (ctx, it, g) => {
    const r1 = Math.min(g.w, g.h) * 0.46, r2 = r1 * clamp(it.inner, 0.1, 0.9);
    const outer = circlePts(g.cx, g.cy, r1, r1, 0, TAU);
    const inner = circlePts(g.cx, g.cy, r2, r2, 0, TAU);
    const pts = outer.concat(inner);
    if (it.fill) { begin(ctx, pts, true); fillStyle(ctx, it); ctx.fill('evenodd'); }
    paint(ctx, it, g, outer, true);
    paint(ctx, it, g, inner, true);
  });

  D('angle', 'geo', '角（标角度）', [q('deg', '角度', 10, 350, 1, 60, '°')], (ctx, it, g) => {
    const vx = g.x + g.w * 0.12, vy = g.y + g.h * 0.86;
    const len = Math.min(g.w * 0.82, g.h * 0.78);
    const a = -rad(clamp(it.deg, 10, 350));
    ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + len, vy);
    ctx.moveTo(vx, vy); ctx.lineTo(vx + Math.cos(a) * len, vy + Math.sin(a) * len);
    setStyle(ctx, it, 1); ctx.stroke();
    const r = Math.min(len * 0.3, Math.abs(a) * len * 0.5);
    angleMark(ctx, it, vx, vy, Math.max(18, r), a, 0, Math.round(it.deg) + '°');
    dot(ctx, it, vx, vy);
  });

  D('parallel', 'geo', '平行线（截线）', [q('angle', '截线倾斜', 20, 80, 1, 55, '°')], (ctx, it, g) => {
    const L = g.x, R = g.x + g.w, T = g.y, B = g.y + g.h;
    const y1 = T + g.h * 0.32, y2 = T + g.h * 0.7;
    ctx.beginPath(); ctx.moveTo(L, y1); ctx.lineTo(R, y1); ctx.moveTo(L, y2); ctx.lineTo(R, y2);
    setStyle(ctx, it, 1); ctx.stroke();
    const maxDy = g.h * 0.9;
    const dx = Math.min(g.w * 0.4, maxDy / Math.abs(Math.tan(rad(it.angle))));
    const dy = dx * Math.tan(rad(it.angle));
    const x0 = g.cx - dx, x1 = g.cx + dx;
    ctx.beginPath(); ctx.moveTo(x0, g.cy + dy); ctx.lineTo(x1, g.cy - dy);
    setStyle(ctx, it, 1); ctx.stroke();
    txt(ctx, it, g, Math.round(it.angle) + '°', x0 + 12, y1 + 18, Math.max(11, g.h * 0.045));
  });

  D('perp-bisector', 'geo', '垂直平分线', [], (ctx, it, g) => {
    const y = g.cy + g.h * 0.18, x1 = g.x + g.w * 0.12, x2 = g.x + g.w * 0.88;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); setStyle(ctx, it, 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(g.cx, g.y + 2); ctx.lineTo(g.cx, g.y + g.h - 2);
    setStyle(ctx, it, 0.85, [7, 5]); ctx.stroke();
    dot(ctx, it, x1, y, 3); dot(ctx, it, x2, y, 3);
    rightAngle(ctx, it, g.cx, y, -1, 0, 0, -1, Math.min(20, g.h * 0.07));
    // 等长刻度
    const t = Math.min(12, (x2 - x1) * 0.08);
    ctx.beginPath(); ctx.moveTo(x1 + t, y - t); ctx.lineTo(x1 + t, y + t);
    ctx.moveTo(x2 - t, y - t); ctx.lineTo(x2 - t, y + t);
    setStyle(ctx, it, 0.7); ctx.stroke();
  });

  D('median', 'geo', '三角形中线', [], (ctx, it, g) => {
    const L = g.x, R = g.x + g.w, B = g.y + g.h, ax = g.cx, ay = g.y + g.h * 0.12;
    paint(ctx, it, g, [L, B, R, B, ax, ay], true);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(g.cx, B);
    setStyle(ctx, it, 1.05); ctx.stroke();
    dot(ctx, it, g.cx, B, 3.5);
    txt(ctx, it, g, 'D', g.cx + 12, B + 14, Math.max(11, g.h * 0.045));
  });

  D('altitude', 'geo', '三角形高线', [q('apex', '顶点位置', 0.15, 0.85, 0.01, 0.35)], (ctx, it, g) => {
    const L = g.x, R = g.x + g.w, B = g.y + g.h;
    const ax = L + g.w * clamp(it.apex, 0.15, 0.85), ay = g.y + g.h * 0.12;
    paint(ctx, it, g, [L, B, R, B, ax, ay], true);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, B);
    setStyle(ctx, it, 1, [7, 5]); ctx.stroke();
    rightAngle(ctx, it, ax, B, 1, 0, 0, -1, Math.min(20, g.h * 0.07));
  });

  D('angle-bisector', 'geo', '角平分线', [q('deg', '角度', 20, 160, 1, 70, '°')], (ctx, it, g) => {
    const vx = g.x + g.w * 0.12, vy = g.y + g.h * 0.86;
    const len = Math.min(g.w * 0.82, g.h * 0.78);
    const a = -rad(clamp(it.deg, 20, 160));
    ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + len, vy);
    ctx.moveTo(vx, vy); ctx.lineTo(vx + Math.cos(a) * len, vy + Math.sin(a) * len);
    setStyle(ctx, it, 1); ctx.stroke();
    const ab = a / 2;
    ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + Math.cos(ab) * len * 0.92, vy + Math.sin(ab) * len * 0.92);
    setStyle(ctx, it, 0.9, [8, 5]); ctx.stroke();
    angleMark(ctx, it, vx, vy, Math.min(len * 0.28, 40), a / 2, 0, '');
    angleMark(ctx, it, vx, vy, Math.min(len * 0.34, 48), a, a / 2, '');
    dot(ctx, it, vx, vy);
  });

  D('inscribed', 'geo', '圆周角', [q('arc', '所对弧', 40, 300, 1, 140, '°')], (ctx, it, g) => {
    const r = Math.min(g.w, g.h) * 0.42, cx = g.cx, cy = g.cy;
    const arc = rad(clamp(it.arc, 40, 300));
    const aA = -PI / 2 - arc / 2, aB = -PI / 2 + arc / 2, aP = PI / 2;
    paint(ctx, it, g, circlePts(cx, cy, r, r, 0, TAU), true);
    const A = [cx + Math.cos(aA) * r, cy + Math.sin(aA) * r];
    const B = [cx + Math.cos(aB) * r, cy + Math.sin(aB) * r];
    const Pp = [cx + Math.cos(aP) * r, cy + Math.sin(aP) * r];
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(Pp[0], Pp[1]); ctx.lineTo(B[0], B[1]);
    setStyle(ctx, it, 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
    setStyle(ctx, it, 0.7, [6, 4]); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r, aA, aB);
    setStyle(ctx, it, 1.25); ctx.stroke();
    dot(ctx, it, cx, cy, 3);
    const fs = Math.max(11, Math.min(18, r * 0.16));
    txt(ctx, it, g, 'A', A[0] - 12, A[1], fs);
    txt(ctx, it, g, 'B', B[0] + 12, B[1], fs);
    txt(ctx, it, g, 'P', Pp[0], Pp[1] + fs * 1.2, fs);
    txt(ctx, it, g, Math.round(it.arc / 2) + '°', cx, cy + fs * 0.2, fs * 1.1);
  });

  D('tangent', 'geo', '圆的切线', [], (ctx, it, g) => {
    const r = Math.min(g.w, g.h) * 0.4, cx = g.cx, cy = g.cy - g.h * 0.08;
    paint(ctx, it, g, circlePts(cx, cy, r, r, 0, TAU), true);
    const ty = cy + r;
    ctx.beginPath(); ctx.moveTo(g.x + 4, ty); ctx.lineTo(g.x + g.w - 4, ty);
    setStyle(ctx, it, 1.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, ty);
    setStyle(ctx, it, 0.75, [6, 4]); ctx.stroke();
    dot(ctx, it, cx, cy); dot(ctx, it, cx, ty, 3.5);
    rightAngle(ctx, it, cx, ty, 1, 0, 0, -1, Math.min(20, r * 0.28));
    const fs = Math.max(11, Math.min(18, r * 0.18));
    txt(ctx, it, g, 'O', cx - 12, cy + 2, fs);
    txt(ctx, it, g, 'T', cx + 12, ty + 12, fs);
  });

  D('similar', 'geo', '相似三角形', [q('ratio', '相似比', 0.2, 0.9, 0.01, 0.5)], (ctx, it, g) => {
    const L = g.x, R = g.x + g.w, B = g.y + g.h, T = g.y;
    const k = clamp(it.ratio, 0.2, 0.9);
    paint(ctx, it, g, [L, B, R, B, g.cx, T], true);
    const s = g.w * k;
    paint(ctx, it, g, [g.cx - s / 2, B, g.cx + s / 2, B, g.cx, B - g.h * k], true);
  });

  D('coord', 'geo', '平面直角坐标系', [q('step', '刻度间隔', 0.5, 2, 0.5, 1)], (ctx, it, g) => {
    plotFn(ctx, it, g, null, { step: it.step });
  });

  D('numline', 'geo', '数轴', [q('step', '刻度间隔', 0.5, 2, 0.5, 1)], (ctx, it, g) => {
    const u = g.w / 20, step = clamp(it.step, 0.5, 2), cy = g.cy;
    ctx.beginPath(); ctx.moveTo(g.x + 2, cy); ctx.lineTo(g.x + g.w - 2, cy);
    setStyle(ctx, it, 1.2); ctx.stroke();
    const ah = Math.max(6, lineWidth(it) * 2.5);
    ctx.beginPath(); ctx.moveTo(g.x + g.w - 2, cy); ctx.lineTo(g.x + g.w - 2 - ah, cy - ah * 0.6); ctx.lineTo(g.x + g.w - 2 - ah, cy + ah * 0.6); ctx.closePath();
    ctx.fillStyle = it.color || '#ffffff'; ctx.fill();
    if (!it._thumb) {
      const fs = Math.max(11, Math.min(20, g.h * 0.06));
      ctx.font = '500 ' + fs.toFixed(1) + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let x = -Math.ceil(10 / step) * step; x <= 10 + 1e-9; x += step) {
        const px = g.cx + x * u;
        if (px < g.x + 6 || px > g.x + g.w - 6) continue;
        ctx.beginPath(); ctx.moveTo(px, cy - 5); ctx.lineTo(px, cy + 5);
        ctx.lineWidth = Math.max(1, lineWidth(it) * 0.45); ctx.stroke();
        if (Math.abs(x) > 1e-9) ctx.fillText(String(Math.round(x * 10) / 10), px, cy + 9);
      }
      txt(ctx, it, g, '0', g.cx, cy + 9 + fs, fs, 'center', 'top');
    }
    dot(ctx, it, g.cx, cy, 3);
  });

  // ================= 函数图像 =================
  graph('linear', '一次函数', 'y = kx + b', [q('k', '斜率 k', -5, 5, 0.1, 1), q('b', '截距 b', -8, 8, 0.1, 0)], (x, it) => it.k * x + it.b);
  graph('quadratic', '二次函数', 'y = ax² + bx + c', [q('a', '二次项 a', -3, 3, 0.1, 1), q('b', '一次项 b', -6, 6, 0.1, 0), q('c', '常数 c', -8, 8, 0.1, 0)], (x, it) => it.a * x * x + it.b * x + it.c);

  graph('quad-vertex', '二次函数（顶点式）', 'y = a(x−h)² + k', [q('a', '开口 a', -3, 3, 0.1, 0.6), q('h', '顶点横坐标 h', -6, 6, 0.1, 1), q('k', '顶点纵坐标 k', -8, 8, 0.1, 0)], (x, it) => it.a * (x - it.h) * (x - it.h) + it.k);

  graph('cubic', '三次函数', 'y = ax³ + bx', [q('a', '三次项 a', -1, 1, 0.05, 0.25), q('b', '一次项 b', -3, 3, 0.1, -1)], (x, it) => it.a * x * x * x + it.b * x);
  graph('inverse', '反比例函数', 'y = k / x', [q('k', '比例系数 k', -10, 10, 0.1, 4)], (x, it) => it.k / x);
  graph('exp', '指数函数', 'y = aˣ', [q('a', '底数 a', 0.2, 4, 0.1, 2)], (x, it) => (it.a > 0 && it.a !== 1 ? Math.pow(it.a, x) : NaN));
  graph('log', '对数函数', 'y = logₐ x', [q('a', '底数 a', 0.2, 4, 0.1, 2)], (x, it) => (x > 0 && it.a > 0 && it.a !== 1 ? Math.log(x) / Math.log(it.a) : NaN));
  graph('sine', '正弦函数', 'y = A sin(ωx + φ) + k', [
    q('A', '振幅 A', 0.2, 4, 0.1, 1.5), q('w', '角频率 ω', 0.2, 4, 0.1, 1), q('phi', '初相 φ', -180, 180, 5, 0, '°'), q('k', '上下平移 k', -4, 4, 0.1, 0),
  ], (x, it) => it.A * Math.sin(it.w * x + rad(it.phi)) + it.k);
  graph('cosine', '余弦函数', 'y = A cos(ωx + φ) + k', [
    q('A', '振幅 A', 0.2, 4, 0.1, 1.5), q('w', '角频率 ω', 0.2, 4, 0.1, 1), q('phi', '初相 φ', -180, 180, 5, 0, '°'), q('k', '上下平移 k', -4, 4, 0.1, 0),
  ], (x, it) => it.A * Math.cos(it.w * x + rad(it.phi)) + it.k);
  graph('tan-fn', '正切函数', 'y = A tan(ωx)', [q('A', '系数 A', 0.2, 3, 0.1, 1), q('w', '角频率 ω', 0.2, 3, 0.1, 0.6)], (x, it) => it.A * Math.tan(it.w * x));
  graph('abs', '绝对值函数', 'y = a|x − h| + k', [q('a', '开口 a', -3, 3, 0.1, 1), q('h', '顶点横坐标 h', -6, 6, 0.1, 0), q('k', '顶点纵坐标 k', -8, 8, 0.1, 0)], (x, it) => it.a * Math.abs(x - it.h) + it.k);
  graph('sqrt', '根号函数', 'y = a√(x − h) + k', [q('a', '系数 a', -3, 3, 0.1, 1), q('h', '起点横坐标 h', -8, 8, 0.1, 0), q('k', '上下平移 k', -6, 6, 0.1, 0)], (x, it) => (x >= it.h ? it.a * Math.sqrt(x - it.h) + it.k : NaN));
  graph('power', '幂函数', 'y = a xᵖ', [q('a', '系数 a', -2, 2, 0.1, 1), q('p', '指数 p', -3, 4, 0.1, 2.5)], (x, it) => it.a * Math.pow(x, it.p));
  graph('rational', '分式函数', 'y = (ax + b) / (cx + d)', [
    q('a', '分子 a', -4, 4, 0.1, 1), q('b', '分子 b', -6, 6, 0.1, 1), q('c', '分母 c', -4, 4, 0.1, 1), q('d', '分母 d', -6, 6, 0.1, -2),
  ], (x, it) => (it.a * x + it.b) / (it.c * x + it.d));
  graph('parabola-focus', '抛物线', 'y = x² / (4p)', [q('p', '焦准距 p', 0.5, 4, 0.1, 1)], (x, it) => (x * x) / (4 * it.p));

  // 分段函数（1.6.0 M1）：两段线性，分界点 x₀ 与两段斜率可调，右段还能整体跳变。
  // 参数只有数值 —— 图形参数契约不支持表达式串，所以首版做「固定骨架 + 数值参数」，
  // 不做任意表达式输入。讲分段函数最关键的是端点开闭，用实心/空心圆点画出来。
  D('piecewise', 'func', '分段函数（分界点·端点开闭）', [
    q('x0', '分界点 x₀', -4, 4, 0.1, 0),
    q('k1', '左段斜率 k₁', -3, 3, 0.1, 1),
    q('k2', '右段斜率 k₂', -3, 3, 0.1, -1),
    q('jump', '右段跳变 Δ', -3, 3, 0.1, 0),
    q('open', '端点归属（1 左段 / 0 右段）', 0, 1, 1, 1),
  ], (ctx, it, g) => {
    const x0 = num(it.x0, 0), k1 = num(it.k1, 1), k2 = num(it.k2, -1), jm = num(it.jump, 0);
    const pickL = num(it.open, 1) >= 0.5;          // 左段是否取到 x₀（另一段那个端点就是空心）
    const yl = k1 * x0, yr = yl + jm;
    const yOf = (x) => (x < x0 ? k1 * x : k2 * (x - x0) + yr);
    plotFn(ctx, it, g, null, {
      after: function (c, A) {
        // 每段用自己的表达式采样：以前共用 yOf(x)，x=x0 那一步会取到右段的值，
        // 于是左段最后一点被抬到右段高度、连出一条斜线（复审问题 5）。
        const seg = function (xa, xb, fn) {
          c.beginPath();
          for (let i = 0; i <= 240; i++) {
            const x = xa + (xb - xa) * i / 240;
            const px = A.sx(x), py = A.sy(fn(x));
            if (i) c.lineTo(px, py); else c.moveTo(px, py);
          }
          setStyle(c, it, 1);
          c.stroke();
        };
        seg(-10, x0, (x) => k1 * x);
        seg(x0, 10, (x) => k2 * (x - x0) + yr);
        const r = Math.max(3.2, Math.min(6.5, A.u * 0.16));
        const ring = function (px, py, solid) {
          c.beginPath();
          c.arc(px, py, r, 0, Math.PI * 2);
          if (solid) {
            setStyle(c, it, 1);
            c.fillStyle = c.strokeStyle;
            c.fill();
          } else {
            setStyle(c, it, 0.85);
            c.stroke();
          }
        };
        // 两段在 x₀ 处重合（jump=0）时只画「取到的那一点」，否则空心圈会套在实心点外面
        if (Math.abs(yr - yl) < 1e-9) ring(A.sx(x0), A.sy(yl), true);
        else { ring(A.sx(x0), A.sy(yl), pickL); ring(A.sx(x0), A.sy(yr), !pickL); }
        // 1.6.0：图上不再标 x₀ —— 实心/空心两点已经指出分界点在哪，字留给老师自己写
        // 有跳变时画一段竖直虚线：两段在 x₀ 处接不上，这一点必须看得见
        if (Math.abs(jm) > 1e-9) {
          c.beginPath();
          c.moveTo(A.sx(x0) + 2.5, A.sy(yl));
          c.lineTo(A.sx(x0) + 2.5, A.sy(yr));
          setStyle(c, it, 0.4);      // setStyle 会把线型重置成实线，虚线必须画在它之后
          c.setLineDash([5, 4]);
          c.stroke();
          c.setLineDash([]);
        }
      },
    });
  });
  DEFS.piecewise.f = function (x, it) {
    const x0 = num(it.x0, 0), k1 = num(it.k1, 1), k2 = num(it.k2, -1), jm = num(it.jump, 0);
    const yl = k1 * x0;
    return x < x0 ? k1 * x : k2 * (x - x0) + yl + jm;
  };

  // 二元一次不等式可行域（1.6.0 M2）：两条一般约束 a·x + b·y ≤ c（s=1）或 ≥（s=0），外加可选的 x≥0、y≥0。
  // 做法是「矩形被半平面逐条裁剪」（Sutherland–Hodgman），不是按取样涂色 —— 所以边界一定是直线、
  // 顶点是精确交点，竖线（b=0）、水平线、平行/重合、空集都能自然处理；区域无界时靠画布矩形截断。
  // 图上不写约束式（老师自己写）：阴影 + 边界线 + 交点实心点就是全部标注。
  D('region', 'func', '二元一次不等式可行域', [
    q('a1', '①a', -3, 3, 0.1, 1), q('b1', '①b', -3, 3, 0.1, 1), q('c1', '①c', -8, 8, 0.1, 4),
    q('s1', '①方向（1 ≤ / 0 ≥）', 0, 1, 1, 1),
    q('a2', '②a', -3, 3, 0.1, 1), q('b2', '②b', -3, 3, 0.1, -1), q('c2', '②c', -8, 8, 0.1, 2),
    q('s2', '②方向（1 ≤ / 0 ≥）', 0, 1, 1, 1),
    q('nonneg', '含 x≥0、y≥0', 0, 1, 1, 1),
  ], (ctx, it, g) => {
    plotFn(ctx, it, g, null, {
      after: function (c, A) {
        const yr = (g.cy - g.y) / A.u, xr = 10;
        // 半平面统一写成 L(x,y) = p.x + q.y ≤ r
        const half = [];
        let poly = [[-xr, -yr], [xr, -yr], [xr, yr], [-xr, yr]];
        const push = function (a, b, cc, sign) {
          // a=b=0 是退化约束：0 ≤ cc 恒真则不起作用，cc<0 则整个区域为空
          if (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12) {
            const v = sign >= 0.5 ? cc : -cc;
            if (v < 0) { poly = []; }
            return;
          }
          if (sign >= 0.5) half.push([a, b, cc]);
          else half.push([-a, -b, -cc]);
        };
        push(num(it.a1, 1), num(it.b1, 1), num(it.c1, 4), num(it.s1, 1));
        push(num(it.a2, 1), num(it.b2, -1), num(it.c2, 2), num(it.s2, 1));
        if (num(it.nonneg, 1) >= 0.5) { half.push([-1, 0, 0]); half.push([0, -1, 0]); }
        // 画布矩形（数学单位）作为初始多边形
        const eps = 1e-9;
        for (let k = 0; k < half.length && poly.length; k++) {
          const a = half[k][0], b = half[k][1], cc = half[k][2];
          const out = [];
          for (let i = 0; i < poly.length; i++) {
            const p = poly[i], q2 = poly[(i + 1) % poly.length];
            const fp = a * p[0] + b * p[1] - cc, fq = a * q2[0] + b * q2[1] - cc;
            const inp = fp <= eps, inq = fq <= eps;
            if (inp) out.push(p);
            if (inp !== inq) {
              const t = fp / (fp - fq);
              out.push([p[0] + (q2[0] - p[0]) * t, p[1] + (q2[1] - p[1]) * t]);
            }
          }
          poly = out;
        }
        if (poly.length < 3) return;                 // 空集：什么都不画（画错不如不画）
        const path = function () {
          c.beginPath();
          for (let i = 0; i < poly.length; i++) {
            const px = A.sx(poly[i][0]), py = A.sy(poly[i][1]);
            if (i) c.lineTo(px, py); else c.moveTo(px, py);
          }
          c.closePath();
        };
        // 阴影：浅灰填充（黑白打印能分辨），边界再描一遍实线
        path();
        c.fillStyle = rgba(it.color || '#ffffff', 0.16);
        c.fill();
        setStyle(c, it, 0.7);
        c.stroke();
        // 约束边界线整条画出来（虚线），让老师看清是哪两条直线交出来的区域
        // 两条约束线都画（**含竖直线 b=0** —— 以前把 b=0 过滤掉，x≤2 这种边界线上就没了）
        const lines = [];
        const addLine = function (a, b, cc) { if (Math.abs(a) > 1e-12 || Math.abs(b) > 1e-12) lines.push([a, b, cc]); };
        addLine(num(it.a1, 1), num(it.b1, 1), num(it.c1, 4));
        addLine(num(it.a2, 1), num(it.b2, -1), num(it.c2, 2));
        for (let i = 0; i < lines.length; i++) {
          const a = lines[i][0], b = lines[i][1], cc = lines[i][2];
          c.beginPath();
          // 直接取直线在画布矩形内的两个交点（竖直/水平/斜线都走同一段代码）
          const pts = [];
          if (Math.abs(b) > 1e-9) { for (const X of [-xr, xr]) { const Y = (cc - a * X) / b; if (Y >= -yr - 1e-6 && Y <= yr + 1e-6) pts.push([X, Y]); } }
          if (Math.abs(a) > 1e-9) { for (const Y of [-yr, yr]) { const X = (cc - b * Y) / a; if (X >= -xr - 1e-6 && X <= xr + 1e-6) pts.push([X, Y]); } }
          if (pts.length < 2) continue;
          c.moveTo(A.sx(pts[0][0]), A.sy(pts[0][1]));
          c.lineTo(A.sx(pts[1][0]), A.sy(pts[1][1]));
          setStyle(c, it, 0.45);
          c.setLineDash([6, 4]);
          c.stroke();
          c.setLineDash([]);
        }
        // 顶点：落在这两条边界线任两条上的多边形顶点才画点（无界区域被画布截出的假顶点不画）
        const onLine = function (p, a, b, cc) { return Math.abs(a * p[0] + b * p[1] - cc) < 1e-6; };
        const edges = lines.slice();
        if (num(it.nonneg, 1) >= 0.5) { edges.push([1, 0, 0]); edges.push([0, 1, 0]); }
        const r = Math.max(2.4, Math.min(4.6, A.u * 0.11));
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i];
          let cnt = 0;
          for (let k = 0; k < edges.length; k++) if (onLine(p, edges[k][0], edges[k][1], edges[k][2])) cnt++;
          if (cnt < 2) continue;
          c.beginPath();
          c.arc(A.sx(p[0]), A.sy(p[1]), r, 0, Math.PI * 2);
          setStyle(c, it, 1);
          c.fillStyle = c.strokeStyle;
          c.fill();
        }
      },
    });
  });

  // ---------- 对外接口 ----------
  P.cats = () => CATS.map((c) => ({ key: c[0], label: c[1], n: P.list(c[0]).length }));
  P.catLabel = catLabel;
  P.list = function (cat) {
    if (!cat) return ORDER.map((k) => DEFS[k]);
    return ORDER.filter((k) => DEFS[k].cat === cat).map((k) => DEFS[k]);
  };
  P.get = (key) => DEFS[key] || null;
  P.label = (key) => (DEFS[key] ? DEFS[key].label : '');
  P.paramList = (key) => (DEFS[key] ? DEFS[key].params : []);
  P.defaults = function (key) {
    const o = {};
    const d = DEFS[key];
    if (d) for (let i = 0; i < d.params.length; i++) o[d.params[i].key] = d.params[i].def;
    return o;
  };
  P.isMs = (it) => !!(it && it.type === 'ms' && DEFS[it.key]);

  P.make = function (key, x0, y0, x1, y1, opt) {
    const d = DEFS[key];
    if (!d) return null;
    const o = opt || {};
    const it = {
      id: GW.uid(), kind: 'shape', type: 'ms', key: key,
      x1: Math.min(x0, x1), y1: Math.min(y0, y1),
      x2: Math.max(x0, x1), y2: Math.max(y0, y1),
      rot: 0,
      color: o.color || (GW.tool.pen && GW.tool.pen.color) || '#ffffff',
      width: Math.max(2.6, o.width || (GW.tool.pen && GW.tool.pen.width) || 3),
      dash: !!o.dash,
      fill: !!o.fill,
      fillColor: o.fillColor || o.color || (GW.tool.pen && GW.tool.pen.color) || '#ffffff',
      fillAlpha: o.fillAlpha != null ? o.fillAlpha : 0.18,
      // 1.1.7 透明度（与物理图形共用同一个记忆项 GW.settings.shapeAlpha）
      opacity: o.opacity != null ? o.opacity : ((GW.settings && GW.settings.shapeAlpha != null) ? GW.settings.shapeAlpha : 1),
    };
    if (it.x2 - it.x1 < 40) it.x2 = it.x1 + 40;
    if (it.y2 - it.y1 < 40) it.y2 = it.y1 + 40;
    const remember = o.params || {};
    const defs = P.paramList(key);
    for (let i = 0; i < defs.length; i++) {
      const p = defs[i];
      it[p.key] = remember[p.key] != null ? remember[p.key] : p.def;
    }
    return it;
  };

  // 面板里点一下就直接插到视口中心：屏幕尺寸恒定（1600×900 下约 520×380），插完自动选中。
  P.insert = function (key, opt) {
    const d = DEFS[key];
    if (!d) return null;
    const c = GW.viewCenter();
    const k = 1 / (GW.camera && GW.camera.s ? GW.camera.s : 1);
    const w = DEF_SIZE[0] * k, h = DEF_SIZE[1] * k;
    const it = P.make(key, c.x - w / 2, c.y - h / 2, c.x + w / 2, c.y + h / 2,
      Object.assign({ color: (GW.tool.pen && GW.tool.pen.color) || '#ffffff', width: Math.max(2.6, (GW.tool.pen && GW.tool.pen.width) || 3) }, opt || {}));
    if (!it) return null;
    if (GW.tool) GW.tool.set('select');
    GW.addItems([it]);
    if (GW.selection) { GW.selection.set([it]); GW.selection.render(); }
    GW.requestRender();
    return it;
  };

  P.draw = function (ctx, it) {
    const d = DEFS[it.key];
    if (!d || !d.draw) return;
    const g = geom(it);
    P._cur = it;
    ctx.save();
    if (it.opacity != null && it.opacity < 1) ctx.globalAlpha = Math.max(0, it.opacity);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    applyFrame(ctx, it, g);
    try { d.draw(ctx, it, g); } finally { ctx.restore(); }
  };

  // 内容框（未旋转的局部坐标）：函数图像只框「曲线真正画到的那一块」，
  // 而不是整个 20 单位宽、以 0 为纵向中心的画布框 —— 指数/对数/根号/抛物线这类曲线
  // 只落在 1~2 个象限，老实现里虚线框因此有近一半是空的，拖手柄也不好按。
  // 做法与 _thumb 的纵向归一化同源：按曲线自己的采样点求真实像素范围，再并上描边与标签的余量。
  P.localBox = function (it) {
    const g = geom(it);
    const d = DEFS[it.key];
    if (!d || !d.f) {
      const pad = Math.max(4, Math.min(g.w, g.h) * 0.03);
      return { x: g.x - pad, y: g.y - pad, w: g.w + pad * 2, h: g.h + pad * 2 };
    }
    const u = g.w / 20;               // 与 plotFn 一致：20 个单位铺满宽度，纵向同比例（y=0 在框心）
    const xr = 10;
    const N = Math.max(160, Math.min(760, Math.round(g.w)));
    let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
    for (let i = 0; i <= N; i++) {
      const gx = -xr + (2 * xr * i) / N;
      let gy;
      try { gy = d.f(gx, it); } catch (e) { gy = NaN; }
      if (!isFinite(gy) || Math.abs(gy) > 1e7) continue;
      const px = g.cx + gx * u, py = g.cy - gy * u;
      // 曲线被 plotFn 的 clip 裁在框内：框外的那一截根本没显示，不该算进内容框
      if (px < g.x - 1 || px > g.x + g.w + 1 || py < g.y - 1 || py > g.y + g.h + 1) continue;
      if (px < ax) ax = px; if (px > bx) bx = px;
      if (py < ay) ay = py; if (py > by) by = py;
    }
    if (!(bx >= ax) || !(by >= ay)) {
      const pad = Math.max(4, Math.min(g.w, g.h) * 0.03);
      return { x: g.x - pad, y: g.y - pad, w: g.w + pad * 2, h: g.h + pad * 2 };
    }
    // 一个字身/一个描边的余量：线宽 2~10px 时框别切到笔画本身
    const m = Math.max(3, (it.width || 2) * 0.9);
    return { x: ax - m, y: ay - m, w: Math.max(2, bx - ax) + m * 2, h: Math.max(2, by - ay) + m * 2 };
  };

  P.bbox = function (it) {
    if (it._bb) return it._bb;
    const g = geom(it);
    const lb = P.localBox(it);
    let x1 = lb.x, y1 = lb.y, x2 = lb.x + lb.w, y2 = lb.y + lb.h;
    if (it.rot) {
      const c = Math.cos(it.rot), s = Math.sin(it.rot);
      const pc = rotCenter(it, g), cx = pc.x, cy = pc.y;
      let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
      const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
      for (let i = 0; i < 4; i++) {
        const px = corners[i][0] - cx, py = corners[i][1] - cy;
        const rx = cx + px * c - py * s, ry = cy + px * s + py * c;
        if (rx < ax) ax = rx; if (rx > bx) bx = rx;
        if (ry < ay) ay = ry; if (ry > by) by = ry;
      }
      x1 = ax; y1 = ay; x2 = bx; y2 = by;
    }
    it._bb = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    return it._bb;
  };

  P.setParam = function (it, key, v) {
    if (!it) return;
    const defs = P.paramList(it.key);
    let ok = false;
    for (let i = 0; i < defs.length; i++) if (defs[i].key === key) ok = true;
    if (!ok) return;
    const n = +v;
    if (!isFinite(n)) return;
    it[key] = n;
    if (GW.invalidate) GW.invalidate(it);
  };

  // ================= 1.6.0 第2批：三角形四心 / 韦恩图 =================
  // M3：一个三角形 + 一个「心」。辅助线是按心的定义现算的（中线/垂直平分线/角平分线/高），
  // 不是预先摆好的示意线；外接圆/内切圆只在对应的心上画得出来。
  D('triangleCenter', 'geo', '三角形的心', [
    q('center', '心（0重心1外心2内心3垂心）', 0, 3, 1, 0),
    q('apex', '顶点位置', 0, 1, 0.01, 0.42),
    q('lines', '辅助线', 0, 1, 1, 1),
    q('circ', '圆', 0, 1, 1, 1),
  ], (ctx, it, g) => {
    const L = g.x, R = g.x + g.w, B = g.y + g.h;
    const ax = L + g.w * Math.max(0.05, Math.min(0.95, it.apex)), ay = B - g.h * 0.82;
    const A = { x: ax, y: ay }, Bv = { x: L, y: B }, C = { x: R, y: B };
    paint(ctx, it, g, [A.x, A.y, Bv.x, Bv.y, C.x, C.y], true);

    const mid = (p1, p2) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
    const len = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const a = len(Bv, C), b = len(A, C), c = len(A, Bv);      // 边长（对顶点 A/B/C）
    const area2 = Math.abs((Bv.x - A.x) * (C.y - A.y) - (C.x - A.x) * (Bv.y - A.y)); // 2S
    const S = area2 / 2, per = a + b + c;
    const mode = Math.round(it.center);
    let O;                                                    // 选中的心
    if (mode === 0) O = { x: (A.x + Bv.x + C.x) / 3, y: (A.y + Bv.y + C.y) / 3 };
    else if (mode === 1) {
      // 外心：两边的垂直平分线交点
      // 垂直平分线的方向 = 边方向转 90°，不是边方向本身（第一版弄错，外接圆画不出来）
      const m1 = mid(A, Bv), m2 = mid(A, C);
      const e1 = { x: Bv.x - A.x, y: Bv.y - A.y }, e2 = { x: C.x - A.x, y: C.y - A.y };
      const d1 = { x: -e1.y, y: e1.x }, d2 = { x: -e2.y, y: e2.x };
      const det = d1.x * d2.y - d1.y * d2.x;
      const t = det ? ((m2.x - m1.x) * d2.y - (m2.y - m1.y) * d2.x) / det : 0;
      O = { x: m1.x + d1.x * t, y: m1.y + d1.y * t };
    } else if (mode === 2) {
      O = { x: (a * A.x + b * Bv.x + c * C.x) / per, y: (a * A.y + b * Bv.y + c * C.y) / per };
    } else {
      // 垂心：用欧拉关系 H = A+B+C-2O（O 是外心）
      const m1 = mid(A, Bv), m2 = mid(A, C);
      const e1 = { x: Bv.x - A.x, y: Bv.y - A.y }, e2 = { x: C.x - A.x, y: C.y - A.y };
      const d1 = { x: -e1.y, y: e1.x }, d2 = { x: -e2.y, y: e2.x };
      const det = d1.x * d2.y - d1.y * d2.x;
      const t = det ? ((m2.x - m1.x) * d2.y - (m2.y - m1.y) * d2.x) / det : 0;
      const Oc = { x: m1.x + d1.x * t, y: m1.y + d1.y * t };
      O = { x: A.x + Bv.x + C.x - 2 * Oc.x, y: A.y + Bv.y + C.y - 2 * Oc.y };
    }

    if (it.lines >= 0.5) {
      const dash = [ctx.lineWidth * 2.6, ctx.lineWidth * 2.2];
      setStyle(ctx, it, 0.5, dash);
      if (mode === 0 || mode === 2) {
        // 中线 / 角平分线都是从顶点连到对边的中点（内心也画中线方向会误导，改成连到切点近似）
        const targets = mode === 0
          ? [mid(Bv, C), mid(A, C), mid(A, Bv)]
          : (() => {
            // 角平分线与对边的交点，按边长比例分点
            const onBC = { x: (b * Bv.x + c * C.x) / (b + c), y: (b * Bv.y + c * C.y) / (b + c) };
            const onAC = { x: (a * A.x + c * C.x) / (a + c), y: (a * A.y + c * C.y) / (a + c) };
            const onAB = { x: (a * A.x + b * Bv.x) / (a + b), y: (a * A.y + b * Bv.y) / (a + b) };
            return [onBC, onAC, onAB];
          })();
        [A, Bv, C].forEach((v, i) => {
          ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(targets[i].x, targets[i].y); ctx.stroke();
        });
      } else {
        // 垂心画高、外心画垂直平分线
        if (mode === 3) {
          [A, Bv, C].forEach((v, i) => {
            const p1 = [Bv, A, A][i], p2 = [C, C, Bv][i];
            const px = p1.x + (p2.x - p1.x) * ((v.x - p1.x) * (p2.x - p1.x) + (v.y - p1.y) * (p2.y - p1.y)) / (Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) || 1);
            const py = p1.y + (p2.y - p1.y) * ((v.x - p1.x) * (p2.x - p1.x) + (v.y - p1.y) * (p2.y - p1.y)) / (Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) || 1);
            ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(px, py); ctx.stroke();
          });
        } else {
          [[A, Bv], [A, C], [Bv, C]].forEach((pair) => {
            const m = mid(pair[0], pair[1]);
            const dx = pair[1].x - pair[0].x, dy = pair[1].y - pair[0].y;
            const k = 1 / (Math.hypot(dx, dy) || 1);
            ctx.beginPath();
            ctx.moveTo(m.x - dy * k * g.w * 0.12, m.y + dx * k * g.w * 0.12);
            ctx.lineTo(m.x + dy * k * g.w * 0.12, m.y - dx * k * g.w * 0.12);
            ctx.stroke();
          });
        }
      }
      setStyle(ctx, it, 1);
    }

    if (it.circ >= 0.5) {
      let cr = 0;
      if (mode === 1) cr = len(O, A);
      else if (mode === 2) cr = S / (per / 2);
      if (cr > 0.5) {
        setStyle(ctx, it, 0.55, [ctx.lineWidth * 2.4, ctx.lineWidth * 2.0]);
        ctx.beginPath(); ctx.arc(O.x, O.y, cr, 0, Math.PI * 2); ctx.stroke();
        setStyle(ctx, it, 1);
      }
    }
    // 心用一个实心小点 + 空心圈，缩到很小也看得见
    const r = Math.max(2.6, Math.min(g.w, g.h) * 0.012);
    ctx.beginPath(); ctx.arc(O.x, O.y, r, 0, Math.PI * 2);
    ctx.fillStyle = it.color || '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(O.x, O.y, r * 2.2, 0, Math.PI * 2);
    setStyle(ctx, it, 0.8); ctx.stroke();
  }, { labels: true });

  // M4：两个集合的韦恩图。只画圈与阴影，A/B 两个字母默认不写（老师要写「A∩B」自己补）。
  D('venn', 'func', '韦恩图', [
    q('mode', '阴影（0交集1并集2A独有3B独有4外部）', 0, 4, 1, 0),
    q('gap', '重叠程度', 0, 1, 0.01, 0.45),
    q('lab', '字母', 0, 1, 1, 0),
  ], (ctx, it, g) => {
    const cy = g.cy, rr = Math.min(g.w * 0.30, g.h * 0.42);
    const d = rr * (1.75 - it.gap * 0.95);        // 圆心距：gap=0 几乎不重叠，gap=1 大幅重叠
    const x1 = g.cx - d / 2, x2 = g.cx + d / 2;
    const mode = Math.round(it.mode);
    const paintCircle = (x, fillAlpha) => {
      ctx.beginPath(); ctx.arc(x, cy, rr, 0, Math.PI * 2);
      if (fillAlpha) {
        ctx.save();
        ctx.fillStyle = GW.hexA ? GW.hexA(it.color || '#ffffff', fillAlpha) : 'rgba(255,255,255,0.16)';
        ctx.fill();
        ctx.restore();
      }
      ctx.stroke();        // 圈必须描出来，否则只剩阴影、看不出是两个集合
    };
    const shade = (which) => {
      ctx.save();
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      ctx.fillStyle = GW.hexA ? GW.hexA(it.color || '#ffffff', 0.18) : 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      if (which === 'inter') {
        // 交集直接按「透镜」边界画，不用 clip（导出里 clip 组容易把后续描边一起吞掉）
        const half = Math.abs(x2 - x1) / 2;
        if (half >= rr) return;                       // 两圆不重叠：交集为空
        const th = Math.acos(Math.max(-1, Math.min(1, half / rr)));
        ctx.beginPath();
        ctx.arc(x1, cy, rr, -th, th);
        // 注意：这里必须走「短弧」（经过 π 的那段），加 true 会绕远端一周变成月牙
        ctx.arc(x2, cy, rr, Math.PI - th, Math.PI + th, false);
        ctx.closePath();
        ctx.fill();
      } else if (which === 'union') {
        ctx.arc(x1, cy, rr, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x2, cy, rr, 0, Math.PI * 2); ctx.fill();
      } else if (which === 'onlyA' || which === 'onlyB') {
        // A\B / B\A：**按真实边界拼**，不能靠 evenodd —— 奇偶规则与路径顺序无关，
        // 两种模式都会把左右独占区一起涂上（复审问题 3）。
        const half2 = Math.abs(x2 - x1) / 2;
        if (half2 >= rr) {
          // 两圆不相交：独占区就是整个圆
          ctx.arc(which === 'onlyA' ? x1 : x2, cy, rr, 0, Math.PI * 2); ctx.fill();
        } else {
          const th2 = Math.acos(Math.max(-1, Math.min(1, half2 / rr)));
          if (which === 'onlyA') {
            // A 的大弧（远离 B 的一侧）+ B 落在 A 内的那段小弧
            ctx.arc(x1, cy, rr, th2, Math.PI * 2 - th2, false);
            ctx.arc(x2, cy, rr, Math.PI + th2, Math.PI - th2, true);
          } else {
            ctx.arc(x2, cy, rr, Math.PI + th2, Math.PI * 3 - th2, false);
            ctx.arc(x1, cy, rr, th2, -th2, true);
          }
          ctx.closePath();
          ctx.fill();
        }
      } else {
        // 外部：整块矩形挖掉两个圆
        ctx.rect(g.x, g.y, g.w, g.h);
        ctx.arc(x1, cy, rr, 0, Math.PI * 2);
        ctx.arc(x2, cy, rr, 0, Math.PI * 2);
        ctx.fill('evenodd');
      }
      ctx.restore();
    };
    if (mode === 0) shade('inter');
    else if (mode === 1) shade('union');
    else if (mode === 2) shade('onlyA');
    else if (mode === 3) shade('onlyB');
    else shade('out');

    setStyle(ctx, it, 1);
    paintCircle(x1); paintCircle(x2);
    if (it.lab >= 0.5) {
      const s = Math.max(12, Math.min(22, Math.min(g.w, g.h) * 0.07));
      txt(ctx, it, g, 'A', x1 - rr * 0.55, cy - rr * 0.55, s);
      txt(ctx, it, g, 'B', x2 + rr * 0.55, cy - rr * 0.55, s);
    }
  }, { labels: true });


  // M5：复平面上的乘法 = 模相乘、辐角相加。z₁、z₂ 两条向量，乘积向量由 z₂ 旋转 arg z₁ 并缩放 |z₁| 得到。
  D('complexMul', 'func', '复平面乘法', [
    q('r1', '|z₁|', 0.2, 2, 0.05, 1.2), q('a1', 'arg z₁', 0, 360, 1, 40),
    q('r2', '|z₂|', 0.2, 2, 0.05, 1.1), q('a2', 'arg z₂', 0, 360, 1, 25),
  ], (ctx, it, g) => {
    const R = Math.min(g.w, g.h) * 0.42;
    const cx = g.cx, cy = g.cy;
    const X = (v) => cx + v * R, Y = (v) => cy - v * R;
    // 坐标轴
    setStyle(ctx, it, 0.8);
    ctx.beginPath(); ctx.moveTo(X(-1.15), Y(0)); ctx.lineTo(X(1.15), Y(0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(0), Y(-1.15)); ctx.lineTo(X(0), Y(1.15)); ctx.stroke();
    // 单位圆
    setStyle(ctx, it, 0.35, [ctx.lineWidth * 2.4, ctx.lineWidth * 2.2]);
    ctx.beginPath(); ctx.arc(X(0), Y(0), R, 0, Math.PI * 2); ctx.stroke();
    // 向量：z1、z2、乘积
    const r1 = Math.max(0.1, it.r1), r2 = Math.max(0.1, it.r2);
    const a1 = (it.a1 * Math.PI) / 180, a2 = (it.a2 * Math.PI) / 180;
    const rp = r1 * r2, ap = a1 + a2;
    const vec = (r, a, mul, dash) => {
      setStyle(ctx, it, mul, dash);
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(r * Math.cos(a)), Y(r * Math.sin(a))); ctx.stroke();
      // 箭头
      const ex = X(r * Math.cos(a)), ey = Y(r * Math.sin(a));
      const hx = Math.cos(a) * -1, hy = Math.sin(a);
      const s = Math.max(4, Math.min(10, g.w * 0.014));
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + (hx * 0.86 - hy * 0.5) * s, ey + (hy * 0.86 + hx * 0.5) * s);
      ctx.lineTo(ex + (hx * 0.86 + hy * 0.5) * s, ey + (hy * 0.86 - hx * 0.5) * s);
      ctx.closePath();
      ctx.fillStyle = it.color || '#ffffff';
      ctx.fill();
    };
    vec(r1, a1, 1);
    vec(r2, a2, 0.7, [ctx.lineWidth * 2.6, ctx.lineWidth * 2.2]);
    vec(rp, ap, 0.45, [ctx.lineWidth * 1.8, ctx.lineWidth * 2.0]);
    setStyle(ctx, it, 1);
  }, { labels: true });

  P.selfCheck = function () {
    const bad = [];
    const keys = ORDER.slice();
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const it = P.make(key, 0, 0, 400, 300, { params: P.defaults(key) });
      if (!it) { bad.push(key + ':make'); continue; }
      const ctx = document.createElement('canvas').getContext('2d');
      try { P.draw(ctx, it); } catch (e) { bad.push(key + ':draw:' + e.message); }
      const b = P.bbox(it);
      if (!b || !isFinite(b.w) || b.w <= 0 || !isFinite(b.h) || b.h <= 0) bad.push(key + ':bbox');
    }
    return { ok: bad.length === 0, count: keys.length, bad: bad };
  };
})();
