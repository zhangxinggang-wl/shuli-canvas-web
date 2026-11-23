/* 便携白板 PM 模型库（62 个模型 + K 绘图工具集）—— 原样迁入，绘制代码一行未改
 * ============================================================================
 * 来源：唐波的物理白板（全模型版）.html  L10865–L13580（2,716 行）
 * 迁移只做两件事：
 *   1) 整块照搬。上游这一段本身就是一串并列的 IIFE（每节自己 var K = window.__PM），
 *      不需要再包一层，也不会往 window 上泄漏 PI / TAU 这类局部量。
 *   2) 尾部把上游的 `thermo` 归并成本工程的 `heat`（catOrder 里没有 thermo）。
 *
 * 依赖盘点（迁移前实测，不是估计）：
 *   · `GH` 只作为各 draw 函数的第 3 个形参出现，由 P.draw 传入（physshapes.js:10120）；
 *   · `TB` = window.TangBoBoard，physshapes.js:53 建立，K.reg → TB.register 同签名；
 *   · 动画时间走 K.t(o) = +o.animT || 0，与 P.draw 注入的 it.animT 天然对齐。
 * ==========================================================================*/
(function () {
'use strict';
var TB = window.TangBoBoard;
if (!TB || !TB.shapes) return;      // 物理图形库没先加载就整体放弃，不留半截注册表
(function () {
'use strict';
var TB = window.TangBoBoard;
var K = window.__PM = {};
K.TB = TB;
var PI = Math.PI, TAU = PI * 2;
K.PI = PI; K.TAU = TAU;
K.P = function (key, def) { if (!TB.paramDefs[key]) TB.paramDefs[key] = def; };
K.sel = function (key, label, opts, def) {
  K.P(key, { label: label, type: 'select', def: String(def || 0),
    options: opts.map(function (s, i) { return { value: String(i), label: s }; }) });
};
K.tog = function (key, label, def) { K.P(key, { label: label, type: 'toggle', def: !!def }); };
K.reg = function (d) { d.geom = d.geom || 'rect'; if (d.fill === undefined) d.fill = false; TB.register(d); };
K.v = function (o, k) {
  var v = o[k];
  if (v === undefined || v === null || v === '') {
    var pd = TB.paramDefs[k];
    v = pd ? (pd.def !== undefined ? pd.def : pd.min) : 0;
  }
  if (typeof v === 'string' && v !== '' && !isNaN(+v)) v = +v;
  return v;
};
K.t = function (o) { return +o.animT || 0; };
K.clamp = function (x, a, b) { return x < a ? a : (x > b ? b : x); };
K.lerp = function (a, b, u) { return a + (b - a) * u; };
K.lw = function (o, m) { return K.clamp((o.size || 3) * (m || 0.55), 1.1, 5); };
K.fs = function (S, k, lo, hi) { return K.clamp(S * (k || 0.05), lo || 11, hi || 24); };
K.S = function (b) { return Math.min(b.w, b.h); };
K.C = {
  F: '#ef4444', v: '#22c55e', a: '#f59e0b', B: '#4f8cff', E: '#a855f7',
  I: '#f97316', pos: '#ef4444', neg: '#3b82f6', light: '#f59e0b', gas: '#38bdf8',
  hg: '#9ca3af', glass: '#7dd3fc', n: '#ef4444', s: '#3b82f6', g2: '#ec4899'
};
K.alpha = function (color, a) {
  var h = String(color || '#e6edf7');
  if (h[0] === '#') {
    h = h.slice(1);
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h.slice(0, 6), 16);
    if (isNaN(n)) return 'rgba(128,128,128,' + a + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  var m = h.match(/rgba?\(([^)]+)\)/);
  if (m) { var p = m[1].split(','); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; }
  return h;
};
K.FONT_MATH = '"Times New Roman","Cambria Math",Georgia,"PingFang SC","Microsoft YaHei",serif';
K.FONT_UI = 'system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
K.txt = function (c, s, x, y, o) {
  o = o || {};
  c.save();
  c.fillStyle = o.c || '#e6edf7';
  var sz = o.s || 13;
  c.font = (o.i ? 'italic ' : '') + (o.b ? '600 ' : '') + sz + 'px ' + (o.ui ? K.FONT_UI : K.FONT_MATH);
  c.textAlign = o.al || 'center';
  c.textBaseline = o.bl || 'middle';
  if (o.rot) { c.translate(x, y); c.rotate(o.rot); x = 0; y = 0; }
  c.fillText(s, x, y);
  c.restore();
};
K.lines = function (c, arr, x, y, col, sz, al) {
  for (var i = 0; i < arr.length; i++)
    K.txt(c, arr[i], x, y + i * sz * 1.35, { c: col, s: sz, al: al || 'left', bl: 'top', ui: true });
};
K.line = function (c, x1, y1, x2, y2, col, w, dash) {
  c.save(); c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []);
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore();
};
K.poly = function (c, pts, col, w, dash, close, fill) {
  if (!pts.length) return;
  c.save(); c.strokeStyle = col || 'transparent'; c.lineWidth = w; c.setLineDash(dash || []);
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  if (close) c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (col) c.stroke();
  c.restore();
};
K.head = function (c, x, y, ux, uy, hs, col) {
  c.save(); c.fillStyle = col; c.setLineDash([]); c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x - ux * hs - uy * hs * 0.42, y - uy * hs + ux * hs * 0.42);
  c.lineTo(x - ux * hs * 0.68, y - uy * hs * 0.68);
  c.lineTo(x - ux * hs + uy * hs * 0.42, y - uy * hs - ux * hs * 0.42);
  c.closePath(); c.fill(); c.restore();
};
K.arrow = function (c, x1, y1, x2, y2, col, w, hs, dash) {
  var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  hs = Math.min(hs || Math.max(7, w * 3.4), L * 0.7);
  var ux = dx / L, uy = dy / L;
  K.line(c, x1, y1, x2 - ux * hs * 0.7, y2 - uy * hs * 0.7, col, w, dash);
  K.head(c, x2, y2, ux, uy, hs, col);
};
K.vec = function (c, x, y, dx, dy, col, w, label, fs, dash) {
  K.arrow(c, x, y, x + dx, y + dy, col, w, null, dash);
  if (label) {
    var L = Math.hypot(dx, dy) || 1;
    K.txt(c, label, x + dx + dx / L * fs * 0.95, y + dy + dy / L * fs * 0.95, { c: col, s: fs, i: true });
  }
};
K.ray = function (c, x1, y1, x2, y2, col, w, dash, noHead) {
  K.line(c, x1, y1, x2, y2, col, w, dash);
  if (noHead) return;
  var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 14) return;
  K.head(c, x1 + dx * 0.56, y1 + dy * 0.56, dx / L, dy / L, Math.max(8, w * 3.6), col);
};
K.circ = function (c, x, y, r, col, w, fill, dash) {
  c.save(); c.beginPath(); c.arc(x, y, Math.max(0.5, r), 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (col) { c.strokeStyle = col; c.lineWidth = w || 1; c.setLineDash(dash || []); c.stroke(); }
  c.restore();
};
K.dot = function (c, x, y, r, col) { K.circ(c, x, y, r, null, 0, col); };
K.rr = function (c, x, y, w, h, r) {
  if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
  r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
};
K.box = function (c, x, y, w, h, col, lw, fill, r) {
  c.save(); K.rr(c, x, y, w, h, r || 0);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (col) { c.strokeStyle = col; c.lineWidth = lw; c.setLineDash([]); c.stroke(); }
  c.restore();
};
K.block = function (c, cx, cy, w, h, ang, col, lw, label, fs) {
  c.save(); c.translate(cx, cy); c.rotate(ang || 0);
  K.box(c, -w / 2, -h / 2, w, h, col, lw, K.alpha(col, 0.18), Math.min(w, h) * 0.08);
  c.restore();
  if (label) K.txt(c, label, cx, cy, { c: col, s: fs || 13, i: true });
};
K.hatch = function (c, x1, y1, x2, y2, col, w, gap, side) {
  var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 1) return;
  var ux = dx / L, uy = dy / L, sd = side || 1, nx = -uy * sd, ny = ux * sd;
  gap = gap || 10; var t = gap * 0.85;
  c.save(); c.setLineDash([]); c.strokeStyle = col; c.lineWidth = w;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.lineWidth = Math.max(0.8, w * 0.55); c.beginPath();
  for (var s = gap * 0.6; s < L; s += gap) {
    var px = x1 + ux * s, py = y1 + uy * s;
    c.moveTo(px, py); c.lineTo(px + nx * t - ux * t * 0.75, py + ny * t - uy * t * 0.75);
  }
  c.stroke(); c.restore();
};
K.spring = function (c, x1, y1, x2, y2, n, amp, col, w) {
  var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 2) return;
  var ux = dx / L, uy = dy / L, nx = -uy, ny = ux, e = Math.min(L * 0.1, 10);
  c.save(); c.strokeStyle = col; c.lineWidth = w; c.setLineDash([]); c.beginPath();
  c.moveTo(x1, y1); c.lineTo(x1 + ux * e, y1 + uy * e);
  var m = n * 2, seg = (L - 2 * e) / m;
  for (var i = 0; i < m; i++) {
    var s = e + seg * (i + 0.5), sg = (i % 2 ? -1 : 1) * amp;
    c.lineTo(x1 + ux * s + nx * sg, y1 + uy * s + ny * sg);
  }
  c.lineTo(x2 - ux * e, y2 - uy * e); c.lineTo(x2, y2); c.stroke(); c.restore();
};
/* 磁场符号：into=true 画 ×（垂直纸面向里），否则画 ·（向外） */
K.bmarks = function (c, x, y, w, h, into, step, col, lw) {
  var nx = Math.max(1, Math.round(w / step)), ny = Math.max(1, Math.round(h / step));
  var sx = w / nx, sy = h / ny, r = Math.min(sx, sy) * 0.15;
  c.save(); c.setLineDash([]); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw;
  c.beginPath();
  for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
    var cx = x + (i + 0.5) * sx, cy = y + (j + 0.5) * sy;
    if (into) { c.moveTo(cx - r, cy - r); c.lineTo(cx + r, cy + r); c.moveTo(cx + r, cy - r); c.lineTo(cx - r, cy + r); }
    else { c.moveTo(cx + r * 0.45, cy); c.arc(cx, cy, r * 0.45, 0, TAU); }
  }
  if (into) c.stroke(); else c.fill();
  c.restore();
};
K.wireSym = function (c, x, y, r, out, col, lw) {
  K.circ(c, x, y, r, col, lw, K.alpha(col, 0.08));
  if (out) K.dot(c, x, y, r * 0.3, col);
  else { var q = r * 0.55; K.line(c, x - q, y - q, x + q, y + q, col, lw); K.line(c, x + q, y - q, x - q, y + q, col, lw); }
};
K.angArc = function (c, x, y, r, a0, a1, col, w, label, fs, lr) {
  c.save(); c.strokeStyle = col; c.lineWidth = w; c.setLineDash([]);
  c.beginPath(); c.arc(x, y, r, a0, a1, a1 < a0); c.stroke(); c.restore();
  if (label) {
    var am = (a0 + a1) / 2, rr = r + (lr || fs * 0.9);
    K.txt(c, label, x + Math.cos(am) * rr, y + Math.sin(am) * rr, { c: col, s: fs, i: true });
  }
};
K.wavy = function (c, x1, y1, x2, y2, col, w, amp, wl, head) {
  var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 2) return;
  var ux = dx / L, uy = dy / L, nx = -uy, ny = ux, hl = head ? Math.min(10, L * 0.3) : 0;
  c.save(); c.strokeStyle = col; c.lineWidth = w; c.setLineDash([]); c.beginPath();
  for (var s = 0; s <= L - hl; s += 1.5) {
    var e = Math.sin(s / wl * TAU) * amp * Math.min(1, s / 6, (L - hl - s) / 6 + 0.2);
    var px = x1 + ux * s + nx * e, py = y1 + uy * s + ny * e;
    s ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.stroke(); c.restore();
  if (head) K.arrow(c, x2 - ux * hl * 1.2, y2 - uy * hl * 1.2, x2, y2, col, w, hl);
};
K.axes = function (c, bx, by, bw, bh, o) {
  var pd = o.pad || {}, fs = o.fs || 13;
  var L = pd.l != null ? pd.l : fs * 2.2, R = pd.r != null ? pd.r : fs * 1.6;
  var T = pd.t != null ? pd.t : fs * 1.6, Bm = pd.b != null ? pd.b : fs * 1.8;
  var X0 = bx + L, X1 = bx + bw - R, Y0 = by + T, Y1 = by + bh - Bm;
  var sx = (X1 - X0) / (o.xmax - o.xmin), sy = (Y1 - Y0) / (o.ymax - o.ymin);
  var A = {
    X: function (v) { return X0 + (v - o.xmin) * sx; },
    Y: function (v) { return Y1 - (v - o.ymin) * sy; },
    X0: X0, X1: X1, Y0: Y0, Y1: Y1, sx: sx, sy: sy, o: o, fs: fs
  };
  var ox = A.X(K.clamp(0, o.xmin, o.xmax)), oy = A.Y(K.clamp(0, o.ymin, o.ymax));
  A.ox = ox; A.oy = oy;
  var col = o.col, w = o.lw || 1.4, hs = Math.max(7, fs * 0.6);
  K.arrow(c, X0 - (o.xmin < 0 ? 0 : 4), oy, X1 + R * 0.7, oy, col, w, hs);
  K.arrow(c, ox, Y1 + (o.ymin < 0 ? 0 : 4), ox, Y0 - T * 0.7, col, w, hs);
  K.txt(c, o.xl || 'x', X1 + R * 0.45, oy + fs * 1.0, { c: col, s: fs, i: true });
  K.txt(c, o.yl || 'y', ox - fs * 0.4, Y0 - T * 0.55, { c: col, s: fs, i: true, al: 'right' });
  if (o.O !== false) K.txt(c, 'O', ox - fs * 0.55, oy + fs * 0.7, { c: col, s: fs, i: true });
  return A;
};
K.plot = function (c, A, f, a, b, col, w, dash, n) {
  n = n || 240;
  c.save();
  c.beginPath(); c.rect(A.X0 - 2, A.Y0 - 4, A.X1 - A.X0 + 6, A.Y1 - A.Y0 + 8); c.clip();
  c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []);
  c.beginPath();
  var pen = false, span = A.o.ymax - A.o.ymin, ymin = A.o.ymin - span, ymax = A.o.ymax + span;
  for (var i = 0; i <= n; i++) {
    var x = a + (b - a) * i / n, y = f(x);
    if (!isFinite(y) || y < ymin || y > ymax) { pen = false; continue; }
    var px = A.X(x), py = A.Y(y);
    pen ? c.lineTo(px, py) : c.moveTo(px, py); pen = true;
  }
  c.stroke(); c.restore();
};
K.fillUnder = function (c, A, f, a, b, fillCol, base) {
  base = base || 0;
  c.save(); c.beginPath(); c.moveTo(A.X(a), A.Y(base));
  for (var i = 0; i <= 120; i++) { var x = a + (b - a) * i / 120; c.lineTo(A.X(x), A.Y(f(x))); }
  c.lineTo(A.X(b), A.Y(base)); c.closePath(); c.fillStyle = fillCol; c.fill(); c.restore();
};
K.guide = function (c, A, x, y, col, w) {
  K.line(c, A.X(x), A.Y(y), A.X(x), A.oy, col, w, [4, 4]);
  K.line(c, A.X(x), A.Y(y), A.ox, A.Y(y), col, w, [4, 4]);
};
K.rng = function (seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0; var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
K.gauss = function (r) { var u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
K.tri = function (u) { u = u % 2; if (u < 0) u += 2; return u > 1 ? 2 - u : u; };
K.mod = function (a, n) { return ((a % n) + n) % n; };
K.wl = function (nm, a) {
  var r = 0, g = 0, b = 0;
  if (nm < 380) { r = 0.55; g = 0.2; b = 0.9; }
  else if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else if (nm <= 780) { r = 1; }
  else { r = 0.75; g = 0.1; b = 0.1; }
  var f = (nm >= 380 && nm < 420) ? 0.45 + 0.55 * (nm - 380) / 40 : 1;
  var m = function (x) { return Math.round(255 * Math.pow(Math.max(0, x * f), 0.8)); };
  return 'rgba(' + Math.max(m(r), 40) + ',' + m(g) + ',' + m(b) + ',' + (a == null ? 1 : a) + ')';
};
var _cache = new WeakMap();
K.memo = function (o, key, fn) {
  var e = _cache.get(o);
  if (e && e.k === key) return e.v;
  var v = fn(); _cache.set(o, { k: key, v: v }); return v;
};
/* 流线追踪（RK2，等步长）：field(x,y) → [fx,fy] */
K.trace = function (field, x, y, step, maxN, stop, dir) {
  var pts = [[x, y]], sx = x, sy = y; dir = dir || 1;
  for (var i = 0; i < maxN; i++) {
    var f1 = field(x, y), m1 = Math.hypot(f1[0], f1[1]);
    if (!(m1 > 1e-14)) break;
    var mx = x + dir * f1[0] / m1 * step * 0.5, my = y + dir * f1[1] / m1 * step * 0.5;
    var f2 = field(mx, my), m2 = Math.hypot(f2[0], f2[1]);
    if (!(m2 > 1e-14)) break;
    x += dir * f2[0] / m2 * step; y += dir * f2[1] / m2 * step;
    pts.push([x, y]);
    if (stop && stop(x, y, i)) break;
    if (i > 40 && Math.hypot(x - sx, y - sy) < step * 0.9) { pts.push([sx, sy]); pts.closed = true; break; }
  }
  return pts;
};
K.polyArrows = function (c, pts, every, col, hs, offset) {
  var acc = -(offset == null ? every * 0.5 : offset);
  for (var i = 1; i < pts.length; i++) {
    var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], L = Math.hypot(dx, dy);
    acc += L;
    if (acc >= every && L > 1e-6) { acc = 0; K.head(c, pts[i][0], pts[i][1], dx / L, dy / L, hs, col); }
  }
};
K.mkPath = function (pts) {
  var cum = [0];
  for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts: pts, cum: cum, len: cum[cum.length - 1] };
};
K.along = function (path, s) {
  var cum = path.cum, P = path.pts, n = P.length;
  if (n < 2) return { x: P[0][0], y: P[0][1], i: 0, ux: 1, uy: 0, end: true };
  s = K.clamp(s, 0, path.len);
  var lo = 0, hi = n - 1;
  while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] < s) lo = mid; else hi = mid; }
  var a = P[lo], b = P[hi], seg = (cum[hi] - cum[lo]) || 1e-9, u = K.clamp((s - cum[lo]) / seg, 0, 1);
  var L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, i: lo,
           ux: (b[0] - a[0]) / L, uy: (b[1] - a[1]) / L, end: s >= path.len };
};
K.polyUpTo = function (c, path, s, col, w, dash) {
  var p = K.along(path, s), pts = path.pts.slice(0, p.i + 1); pts.push([p.x, p.y]);
  K.poly(c, pts, col, w, dash);
  return p;
};
K.mini = function (c, x, y, w, h, o) {
  K.box(c, x, y, w, h, K.alpha(o.col, 0.22), 1, K.alpha(o.col, 0.04), 6);
  return K.axes(c, x, y, w, h, o);
};
/* 透明背景读数面板 */
K.panel = function (c, x, y, w, h, col) { K.box(c, x, y, w, h, K.alpha(col, 0.2), 1, K.alpha(col, 0.05), 8); };
/* 线段与线段交点 */
K.segHit = function (p, d, a, b) {
  var ex = b[0] - a[0], ey = b[1] - a[1], den = d[0] * ey - d[1] * ex;
  if (Math.abs(den) < 1e-12) return null;
  var qx = a[0] - p[0], qy = a[1] - p[1];
  var t = (qx * ey - qy * ex) / den, u = (qx * d[1] - qy * d[0]) / den;
  if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9) return t;
  return null;
};
/* 矢量折射：d 入射单位向量，n 指向入射侧的单位法线，eta = n1/n2 */
K.refract = function (d, n, eta) {
  var ci = -(n[0] * d[0] + n[1] * d[1]), k = 1 - eta * eta * (1 - ci * ci);
  if (k < 0) return null;
  var a = eta * ci - Math.sqrt(k);
  return [eta * d[0] + a * n[0], eta * d[1] + a * n[1]];
};
K.reflect = function (d, n) { var dn = d[0] * n[0] + d[1] * n[1]; return [d[0] - 2 * dn * n[0], d[1] - 2 * dn * n[1]]; };
/* 简单小车 / 人 */
K.car = function (c, cx, by, w, col, lw, ang) {
  c.save(); c.translate(cx, by); c.rotate(ang || 0);
  var h = w * 0.36, r = w * 0.13;
  K.box(c, -w / 2, -h - r, w, h, col, lw, K.alpha(col, 0.16), h * 0.25);
  K.box(c, -w * 0.25, -h - r - h * 0.55, w * 0.46, h * 0.6, col, lw, K.alpha(col, 0.08), h * 0.2);
  K.circ(c, -w * 0.3, -r, r, col, lw, K.alpha(col, 0.3));
  K.circ(c, w * 0.3, -r, r, col, lw, K.alpha(col, 0.3));
  c.restore();
};
K.person = function (c, x, footY, h, col, lw, ph) {
  var hr = h * 0.11, ny = footY - h + hr * 2, hip = footY - h * 0.45, sw = Math.sin(ph || 0) * h * 0.12;
  K.circ(c, x, footY - h + hr, hr, col, lw);
  K.line(c, x, ny, x, hip, col, lw);
  K.line(c, x, ny + h * 0.08, x - h * 0.16 - sw * 0.5, hip - h * 0.02, col, lw);
  K.line(c, x, ny + h * 0.08, x + h * 0.16 + sw * 0.5, hip - h * 0.02, col, lw);
  K.line(c, x, hip, x - h * 0.12 - sw, footY, col, lw);
  K.line(c, x, hip, x + h * 0.12 + sw, footY, col, lw);
};
K.cat = function (id, label) {
  if (!TB.categories.some(function (c) { return c.id === id; })) TB.category(id, label);
};
K.cat('thermo', '热学');
K.cat('graph', '物理图像');
/* 共用参数 */
K.P('qAng', { label: '倾角θ', min: 5, max: 75, step: 1, def: 30, unit: '°' });
K.P('qInc', { label: '入射角', min: 0, max: 85, step: 1, def: 40, unit: '°' });
K.P('qMu',  { label: '动摩擦因数μ', min: 0, max: 1, step: 0.02, def: 0.2 });
K.P('qN',   { label: '折射率n', min: 1.1, max: 2.5, step: 0.01, def: 1.5 });
K.sel('qBdir', '磁场方向', ['垂直纸面向里 ×', '垂直纸面向外 ·'], 0);
K.sel('qQ', '电性', ['正电荷', '负电荷'], 0);
})();
/* 带下标标签：'F_N' → F 加下标 N；'v_0' 等 */
(function () {
  var K = window.__PM;
  K.lab = function (c, s, x, y, o) {
    o = o || {};
    var k = s.indexOf('_');
    if (k < 0) { K.txt(c, s, x, y, o); return; }
    var main = s.slice(0, k), sub = s.slice(k + 1), sz = o.s || 13, ss = sz * 0.68;
    c.save();
    var f1 = (o.i !== false ? 'italic ' : '') + (o.b ? '600 ' : '') + sz + 'px ' + K.FONT_MATH;
    var f2 = (o.b ? '600 ' : '') + ss + 'px ' + K.FONT_MATH;
    c.font = f1; var w1 = c.measureText(main).width;
    c.font = f2; var w2 = c.measureText(sub).width;
    var al = o.al || 'center', x0 = al === 'left' ? x : (al === 'right' ? x - w1 - w2 : x - (w1 + w2) / 2);
    c.fillStyle = o.c || '#e6edf7'; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.font = f1; c.fillText(main, x0, y);
    c.font = f2; c.fillText(sub, x0 + w1 + 1, y + sz * 0.3);
    c.restore();
  };
  var vec0 = K.vec;
  K.vec = function (c, x, y, dx, dy, col, w, label, fs, dash) {
    vec0(c, x, y, dx, dy, col, w, null, fs, dash);
    if (label) {
      var L = Math.hypot(dx, dy) || 1;
      K.lab(c, label, x + dx + dx / L * fs * 0.95, y + dy + dy / L * fs * 0.95, { c: col, s: fs });
    }
  };
})();

/* ===================== 扩展 · 力学模型 ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI;
var D2R = PI / 180;

/* ---------- 斜面受力 ---------- */
K.sel('qIncShow', '显示', ['受力分析', '重力分解', '仅斜面'], 0);
K.reg({
  key: 'pm_incline', cat: 'mech', label: '斜面受力', params: ['qAng', 'qIncShow'],
  icon: '<path d="M3 20h18V7z"/><rect x="9" y="10.5" width="5" height="4" transform="rotate(-31 11.5 12.5)"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 40 || b.h < 30) return;
    var th = K.v(o, 'qAng') * D2R, mode = K.v(o, 'qIncShow'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055);
    var pad = fs * 1.3, W = b.w - 2 * pad, Hh = b.h - 2 * pad;
    var base = Math.min(W, Hh / Math.tan(th)), hgt = base * Math.tan(th);
    var Ax = b.x1 + pad + (W - base) / 2, Ay = b.y2 - pad, Bx = Ax + base, Cy = Ay - hgt;
    K.hatch(c, Ax - pad * 0.6, Ay, Bx + pad * 0.6, Ay, col, lw, 9, 1);
    K.poly(c, [[Ax, Ay], [Bx, Ay], [Bx, Cy]], col, lw, null, true, K.alpha(col, 0.07));
    K.angArc(c, Ax, Ay, Math.min(base * 0.2, fs * 2.6), 0, -th, col, lw * 0.8, 'θ', fs);
    if (mode === 2) return;
    var Lsl = Math.hypot(base, hgt), s = K.clamp(Lsl * 0.18, 16, 90);
    var dx = Math.cos(th), dy = -Math.sin(th), nx = -Math.sin(th), ny = -Math.cos(th);
    var Px = Ax + base * 0.5, Py = Ay - hgt * 0.5, cx = Px + nx * s * 0.45, cy = Py + ny * s * 0.45;
    K.block(c, cx, cy, s * 1.2, s * 0.9, -th, col, lw);
    var Lg = K.clamp(S * 0.3, 30, 260), fw = lw * 1.1;
    K.vec(c, cx, cy, 0, Lg, C.F, fw, 'G', fs);
    if (mode === 0) {
      K.vec(c, cx, cy, nx * Lg * Math.cos(th), ny * Lg * Math.cos(th), C.F, fw, 'F_N', fs);
      K.vec(c, cx, cy, dx * Lg * Math.sin(th), dy * Lg * Math.sin(th), C.F, fw, 'f', fs);
    } else {
      var g1x = -dx * Lg * Math.sin(th), g1y = -dy * Lg * Math.sin(th);
      var g2x = -nx * Lg * Math.cos(th), g2y = -ny * Lg * Math.cos(th);
      K.vec(c, cx, cy, g1x, g1y, C.a, fw, null, fs, [6, 4]);
      K.vec(c, cx, cy, g2x, g2y, C.a, fw, null, fs, [6, 4]);
      K.line(c, cx + g1x, cy + g1y, cx, cy + Lg, C.a, 1, [3, 3]);
      K.line(c, cx + g2x, cy + g2y, cx, cy + Lg, C.a, 1, [3, 3]);
      K.txt(c, 'G sinθ', cx + g1x * 1.15 - fs * 1.6, cy + g1y * 1.15, { c: C.a, s: fs * 0.9, i: true });
      K.txt(c, 'G cosθ', cx + g2x * 1.1 + fs * 2.2, cy + g2y * 1.1, { c: C.a, s: fs * 0.9, i: true });
      K.angArc(c, cx, cy, Lg * 0.32, PI / 2 - th, PI / 2, C.a, 1, 'θ', fs * 0.85);
    }
  }
});

/* ---------- 两绳悬挂（三力平衡 · 拉密定理） ---------- */
K.P('qA1', { label: '左绳与竖直夹角', min: 0, max: 80, step: 1, def: 30, unit: '°' });
K.P('qA2', { label: '右绳与竖直夹角', min: 0, max: 80, step: 1, def: 60, unit: '°' });
K.sel('qHangShow', '显示', ['受力', '力的合成', '仅装置'], 0);
K.reg({
  key: 'pm_hang', cat: 'mech', label: '两绳悬挂', params: ['qA1', 'qA2', 'qHangShow'],
  icon: '<path d="M3 4h18"/><path d="M6 4l6 8 7-8"/><path d="M12 12v4"/><rect x="9" y="16" width="6" height="5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 50 || b.h < 50) return;
    var a1 = K.v(o, 'qA1') * D2R, a2 = K.v(o, 'qA2') * D2R, mode = K.v(o, 'qHangShow');
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05), pad = fs;
    var ceilY = b.y1 + pad, t1 = Math.tan(a1), t2 = Math.tan(a2);
    var D = Math.min(b.h * 0.42, (b.w - 2 * pad) / Math.max(0.35, t1 + t2));
    var Kx = b.x1 + b.w / 2 - D * (t2 - t1) / 2, Ky = ceilY + D;
    var Lx = Kx - D * t1, Rx = Kx + D * t2;
    K.hatch(c, Math.min(Lx, Kx) - pad * 1.5, ceilY, Math.max(Rx, Kx) + pad * 1.5, ceilY, col, lw, 9, -1);
    K.line(c, Lx, ceilY, Kx, Ky, col, lw); K.line(c, Rx, ceilY, Kx, Ky, col, lw);
    var bs = K.clamp(S * 0.15, 16, 80), by = Ky + Math.min(D * 0.45, b.y2 - Ky - bs - 4);
    K.line(c, Kx, Ky, Kx, by, col, lw);
    K.block(c, Kx, by + bs / 2, bs, bs, 0, col, lw, 'm', fs);
    K.dot(c, Kx, Ky, lw * 1.6, col);
    K.txt(c, 'O', Kx - fs * 0.9, Ky + fs * 0.2, { c: col, s: fs, i: true });
    K.line(c, Kx, Ky, Kx, Ky - D * 0.62, col, 1, [4, 4]);
    var ar = D * 0.3;
    if (a1 > 0.01) K.angArc(c, Kx, Ky, ar, -PI / 2 - a1, -PI / 2, col, 1, 'α', fs * 0.9);
    if (a2 > 0.01) K.angArc(c, Kx, Ky, ar * 0.8, -PI / 2, -PI / 2 + a2, col, 1, 'β', fs * 0.9);
    if (mode === 2) return;
    var sn = Math.sin(a1 + a2), T1, T2;
    if (sn < 1e-3) { T1 = T2 = 0.5; } else { T1 = Math.sin(a2) / sn; T2 = Math.sin(a1) / sn; }
    var Lg = K.clamp(Math.min(S * 0.28, D * 0.85), 24, 220), fw = lw * 1.1;
    var u1x = Lx - Kx, u1y = ceilY - Ky, m1 = Math.hypot(u1x, u1y); u1x /= m1; u1y /= m1;
    var u2x = Rx - Kx, u2y = ceilY - Ky, m2 = Math.hypot(u2x, u2y); u2x /= m2; u2y /= m2;
    var e1x = u1x * Lg * T1, e1y = u1y * Lg * T1, e2x = u2x * Lg * T2, e2y = u2y * Lg * T2;
    K.vec(c, Kx, Ky, e1x, e1y, C.F, fw, 'T_1', fs);
    K.vec(c, Kx, Ky, e2x, e2y, C.F, fw, 'T_2', fs);
    K.vec(c, Kx + fs * 0.6, Ky, 0, Lg, C.F, fw, 'G', fs);
    if (mode === 1) {
      K.line(c, Kx + e1x, Ky + e1y, Kx + e1x + e2x, Ky + e1y + e2y, C.a, 1, [4, 4]);
      K.line(c, Kx + e2x, Ky + e2y, Kx + e1x + e2x, Ky + e1y + e2y, C.a, 1, [4, 4]);
      K.vec(c, Kx, Ky, e1x + e2x, e1y + e2y, C.a, fw, 'F_合', fs, [6, 4]);
    }
    K.txt(c, 'T₁ = ' + T1.toFixed(2) + 'G    T₂ = ' + T2.toFixed(2) + 'G', b.x1 + 4, b.y2 - fs * 0.6,
      { c: col, s: fs * 0.85, al: 'left', ui: true });
  }
});

/* ---------- 光电门测速 / 测加速度 ---------- */
K.reg({
  key: 'pm_photogate', cat: 'mech', label: '光电门实验',
  icon: '<path d="M2 16h17"/><rect x="4" y="12" width="5" height="4"/><path d="M6 12V9"/><path d="M12 16V9h3v7"/><circle cx="20" cy="15" r="2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 40) return;
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(b.h, 0.09, 10, 20);
    var ty = b.y1 + b.h * 0.6, tx1 = b.x1 + b.w * 0.03, tx2 = b.x2 - b.w * 0.1, th = Math.max(5, b.h * 0.05);
    K.box(c, tx1, ty, tx2 - tx1, th, col, lw, K.alpha(col, 0.15), 2);
    for (var i = 0; i < 18; i++) K.dot(c, tx1 + (i + 0.5) * (tx2 - tx1) / 18, ty + th / 2, 1, K.alpha(col, 0.5));
    K.line(c, tx1 + b.w * 0.08, ty + th, tx1 + b.w * 0.08, b.y2 - 2, col, lw);
    K.line(c, tx2 - b.w * 0.08, ty + th, tx2 - b.w * 0.08, b.y2 - 2, col, lw);
    K.txt(c, '气垫导轨', tx1 + b.w * 0.22, ty + th + fs * 1.1, { c: col, s: fs * 0.85, ui: true });
    var gw = b.w * 0.12, gh = b.h * 0.13, gx = tx1 + b.w * 0.1, gy = ty - gh;
    K.box(c, gx, gy, gw, gh, col, lw, K.alpha(col, 0.16), 3);
    var sw = Math.max(3, gw * 0.08), sh = b.h * 0.14;
    K.box(c, gx + gw * 0.5 - sw / 2, gy - sh, sw, sh, C.a, 1, K.alpha(C.a, 0.6));
    K.txt(c, 'd', gx + gw * 0.5 + sw + fs * 0.4, gy - sh * 0.6, { c: C.a, s: fs, i: true });
    var gates = [0.45, 0.72], beamY = gy - sh * 0.55;
    gates.forEach(function (u, k) {
      var x = tx1 + (tx2 - tx1) * u, pw = Math.max(6, b.w * 0.022), top = gy - sh - b.h * 0.12;
      K.box(c, x - pw / 2, top, pw, ty - top, col, lw, K.alpha(col, 0.1), 2);
      K.box(c, x - pw * 1.6, top - pw * 0.8, pw * 3.2, pw * 1.6, col, lw, K.alpha(col, 0.25), 3);
      K.dot(c, x, beamY, Math.max(2.5, pw * 0.3), '#ef4444');
      K.txt(c, '光电门' + (k + 1), x, top - pw * 1.8, { c: col, s: fs * 0.8, ui: true });
      K.txt(c, 'Δt' + (k ? '₂' : '₁'), x + pw * 1.4 + fs * 0.6, beamY, { c: col, s: fs * 0.9, i: true, al: 'left' });
    });
    var xg1 = tx1 + (tx2 - tx1) * gates[0], xg2 = tx1 + (tx2 - tx1) * gates[1], dyL = ty + th + fs * 2.3;
    K.arrow(c, (xg1 + xg2) / 2, dyL, xg1, dyL, col, 1, 7); K.arrow(c, (xg1 + xg2) / 2, dyL, xg2, dyL, col, 1, 7);
    K.txt(c, 'L', (xg1 + xg2) / 2, dyL - fs * 0.6, { c: col, s: fs, i: true });
    var pr = Math.max(5, b.h * 0.05), px = tx2 + pr * 0.6, py = ty - pr * 0.2;
    K.line(c, tx2, ty + th / 2, px, py, col, lw);
    K.circ(c, px, py, pr, col, lw); K.dot(c, px, py, 1.6, col);
    K.line(c, gx + gw, gy + gh * 0.45, px, py - pr, col, 1);
    var hy = Math.min(b.y2 - b.h * 0.12, py + b.h * 0.22);
    K.line(c, px + pr, py, px + pr, hy, col, 1);
    K.box(c, px + pr - b.w * 0.02, hy, b.w * 0.04, b.h * 0.1, col, lw, K.alpha(col, 0.3), 2);
    K.txt(c, 'v₁ = d/Δt₁    v₂ = d/Δt₂    a = (v₂² − v₁²)/(2L)', b.x1 + 4, b.y1 + fs * 0.7,
      { c: col, s: fs * 0.9, al: 'left', i: true });
  }
});

/* ---------- 弹簧测力计 ---------- */
K.P('qReading', { label: '示数', min: 0, max: 5, step: 0.1, def: 2.6, unit: 'N' });
K.reg({
  key: 'pm_scale', cat: 'mech', label: '弹簧测力计', params: ['qReading'],
  icon: '<circle cx="12" cy="3.5" r="1.5"/><rect x="8.5" y="5" width="7" height="13" rx="1.5"/><path d="M12 7v6"/><path d="M12 18v2a1.5 1.5 0 1 1-2 1.3"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.h < 60) return;
    var col = o.color, lw = K.lw(o), F = K.clamp(K.v(o, 'qReading'), 0, 5);
    var bw = Math.min(b.w * 0.5, b.h * 0.2), cx = b.x1 + b.w / 2, top = b.y1 + b.h * 0.1, bh = b.h * 0.68;
    var fs = K.clamp(bw * 0.2, 9, 18);
    K.circ(c, cx, b.y1 + b.h * 0.05, b.h * 0.04, col, lw);
    K.box(c, cx - bw / 2, top, bw, bh, col, lw, K.alpha(col, 0.1), bw * 0.18);
    var s0 = top + bh * 0.12, s1 = top + bh * 0.88, slotW = bw * 0.16;
    K.box(c, cx - slotW / 2, s0 - 4, slotW, s1 - s0 + 8, col, 1, K.alpha(col, 0.06), 2);
    for (var k = 0; k <= 25; k++) {
      var y = s0 + (s1 - s0) * k / 25, L = k % 5 === 0 ? bw * 0.2 : bw * 0.1;
      K.line(c, cx - slotW / 2 - L, y, cx - slotW / 2, y, col, 1);
      if (k % 5 === 0) K.txt(c, String(k / 5), cx - slotW / 2 - bw * 0.3, y, { c: col, s: fs, al: 'right', ui: true });
    }
    K.txt(c, 'N', cx + bw * 0.3, s0 - 2, { c: col, s: fs, ui: true });
    var py = s0 + (s1 - s0) * F / 5;
    K.spring(c, cx, top + 3, cx, py - 3, 7, slotW * 0.35, K.alpha(col, 0.8), 1);
    K.poly(c, [[cx - slotW / 2 - 2, py], [cx + slotW, py - 4], [cx + slotW, py + 4]], null, 0, null, true, C.F);
    var hy = top + bh + b.h * 0.05 + (py - s0) * 0.15;
    K.line(c, cx, py, cx, hy, col, lw);
    c.save(); c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
    c.arc(cx - b.h * 0.025, hy, b.h * 0.025, 0, PI * 0.9); c.stroke(); c.restore();
    K.txt(c, 'F = ' + F.toFixed(1) + ' N', cx + bw * 0.6, top + bh * 0.5, { c: C.F, s: fs * 1.1, al: 'left', i: true });
  }
});

/* ---------- 转弯（倾斜路面） ---------- */
K.reg({
  key: 'pm_bank', cat: 'mech', label: '转弯·倾斜路面', params: ['qAng'],
  icon: '<path d="M3 19l18-7v8H3z"/><rect x="9" y="10" width="6" height="4" transform="rotate(-21 12 12)"/><path d="M8 6H3"/><path d="M5 4L3 6l2 2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var th = Math.min(K.v(o, 'qAng'), 45) * D2R, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var Px = b.x1 + b.w * 0.55, Py = b.y1 + b.h * 0.7, Ls = b.w * 0.42;
    var dx = Math.cos(th), dy = -Math.sin(th), nx = -Math.sin(th), ny = -Math.cos(th);
    var ax = Px - dx * Ls, ay = Py - dy * Ls, bx2 = Px + dx * Ls * 0.8, by2 = Py + dy * Ls * 0.8;
    K.poly(c, [[ax, ay], [bx2, by2], [bx2, b.y2], [ax, b.y2]], null, 0, null, true, K.alpha(col, 0.07));
    K.hatch(c, ax, ay, bx2, by2, col, lw, 10, 1);
    K.line(c, ax, ay, ax + Ls * 0.45, ay, col, 1, [4, 4]);
    K.angArc(c, ax, ay, Ls * 0.3, 0, -th, col, 1, 'θ', fs);
    var cw = K.clamp(S * 0.28, 30, 200);
    K.car(c, Px, Py, cw, col, lw, -th);
    var cmx = Px + nx * cw * 0.3, cmy = Py + ny * cw * 0.3, Lg = K.clamp(S * 0.26, 26, 200), fw = lw * 1.1;
    var N = Math.min(Lg / Math.cos(th), Lg * 2.4);
    K.vec(c, cmx, cmy, 0, Lg, C.F, fw, 'mg', fs);
    K.vec(c, cmx, cmy, nx * N, ny * N, C.F, fw, 'F_N', fs);
    K.vec(c, cmx, cmy, -Lg * Math.tan(th), 0, C.a, fw, 'F_合', fs, [6, 4]);
    K.line(c, cmx, cmy + Lg, cmx - Lg * Math.tan(th), cmy, C.a, 1, [3, 3]);
    K.line(c, cmx + nx * N, cmy + ny * N, cmx - Lg * Math.tan(th), cmy, C.a, 1, [3, 3]);
    K.arrow(c, b.x1 + b.w * 0.2, b.y1 + fs, b.x1 + 4, b.y1 + fs, col, 1.2, 8);
    K.txt(c, '指向圆心', b.x1 + b.w * 0.22, b.y1 + fs, { c: col, s: fs * 0.85, al: 'left', ui: true });
    K.txt(c, 'mg tanθ = m v²/r', b.x2 - 4, b.y1 + fs, { c: col, s: fs, al: 'right', i: true });
  }
});

/* ---------- 拱形桥 / 凹形桥 ---------- */
K.sel('qBridge', '桥型', ['凸形桥（失重）', '凹形桥（超重）'], 0);
K.reg({
  key: 'pm_bridge', cat: 'mech', label: '拱形桥·凹形桥', params: ['qBridge'],
  icon: '<path d="M2 18Q12 6 22 18"/><rect x="9.5" y="7.5" width="5" height="3" rx="1"/><path d="M12 13v5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var cv = K.v(o, 'qBridge') === 0, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var cx = b.x1 + b.w / 2, R = b.w * 0.75, phi = Math.asin(Math.min(0.98, b.w * 0.46 / R));
    var yK = cv ? b.y1 + b.h * 0.42 : b.y1 + b.h * 0.68, Oy = cv ? yK + R : yK - R;
    c.save(); c.strokeStyle = col; c.lineWidth = lw * 1.3; c.beginPath();
    if (cv) c.arc(cx, Oy, R, -PI / 2 - phi, -PI / 2 + phi); else c.arc(cx, Oy, R, PI / 2 - phi, PI / 2 + phi);
    c.stroke(); c.restore();
    var cw = K.clamp(S * 0.26, 30, 180);
    K.car(c, cx, yK, cw, col, lw, 0);
    var cmy = yK - cw * 0.3, Lg = K.clamp(S * 0.22, 24, 170), fw = lw * 1.1;
    K.vec(c, cx - cw * 0.08, cmy, 0, Lg, C.F, fw, 'mg', fs);
    K.vec(c, cx + cw * 0.08, cmy, 0, -Lg * (cv ? 0.6 : 1.45), C.F, fw, 'F_N', fs);
    K.vec(c, cx + cw * 0.62, cmy, 0, (cv ? 1 : -1) * Lg * 0.5, C.v, fw, 'a', fs);
    var ry = cv ? Math.min(b.y2, yK + R) : Math.max(b.y1, Oy);
    K.line(c, cx, yK + (cv ? 4 : -cw * 0.75), cx, ry, col, 1, [5, 4]);
    K.txt(c, 'R', cx - fs * 0.9, (yK + ry) / 2 + (cv ? fs : -fs * 1.5), { c: col, s: fs, i: true });
    K.txt(c, cv ? 'mg − Fɴ = m v²/R （失重）' : 'Fɴ − mg = m v²/R （超重）', b.x1 + 4, b.y2 - fs * 0.7,
      { c: col, s: fs * 0.9, al: 'left', ui: true });
  }
});

/* ---------- 阿特伍德机（动画） ---------- */
K.P('qM1', { label: '左侧质量m₁', min: 0.5, max: 5, step: 0.1, def: 2, unit: 'kg' });
K.P('qM2', { label: '右侧质量m₂', min: 0.5, max: 5, step: 0.1, def: 1, unit: 'kg' });
K.reg({
  key: 'pm_atwood', cat: 'mech', label: '阿特伍德机', animatable: true, params: ['qM1', 'qM2'],
  icon: '<path d="M4 3h16"/><path d="M12 3v3"/><circle cx="12" cy="8" r="2.5"/><path d="M9.5 8v8M14.5 8v5"/><rect x="7.5" y="16" width="4" height="5"/><rect x="12.5" y="13" width="4" height="4"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 50 || b.h < 80) return;
    var m1 = K.v(o, 'qM1'), m2 = K.v(o, 'qM2'), g = 10, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055);
    var a = (m1 - m2) * g / (m1 + m2), T = 2 * m1 * m2 * g / (m1 + m2);
    var cx = b.x1 + b.w / 2, top = b.y1 + fs * 0.6, Rp = K.clamp(S * 0.1, 10, 60), py = top + b.h * 0.16;
    K.hatch(c, cx - Rp * 2.5, top, cx + Rp * 2.5, top, col, lw, 8, -1);
    K.line(c, cx, top, cx, py, col, lw);
    var Lmax = b.h * 0.13, t = K.t(o), s = 0;
    if (Math.abs(a) > 1e-6) {
      var tc = Math.sqrt(2 * 1 / Math.abs(a)), tt = K.mod(t, tc + 0.8);
      s = Math.sign(a) * Lmax * Math.min(1, (tt / tc) * (tt / tc));
    }
    var ang = s / Rp;
    K.circ(c, cx, py, Rp, col, lw, K.alpha(col, 0.1));
    for (var k = 0; k < 3; k++) { var aa = ang + k * PI / 3; K.line(c, cx - Math.cos(aa) * Rp * 0.85, py - Math.sin(aa) * Rp * 0.85, cx + Math.cos(aa) * Rp * 0.85, py + Math.sin(aa) * Rp * 0.85, K.alpha(col, 0.5), 1); }
    K.dot(c, cx, py, 2.5, col);
    var h1 = K.clamp(S * 0.09 * Math.sqrt(m1), 12, b.h * 0.2), h2 = K.clamp(S * 0.09 * Math.sqrt(m2), 12, b.h * 0.2);
    var base = b.y1 + b.h * 0.47, y1 = base + s, y2 = base - s, bw = Rp * 1.5;
    K.line(c, cx - Rp, py, cx - Rp, y1, col, lw); K.line(c, cx + Rp, py, cx + Rp, y2, col, lw);
    K.block(c, cx - Rp, y1 + h1 / 2, bw, h1, 0, col, lw, 'm₁', fs * 0.9);
    K.block(c, cx + Rp, y2 + h2 / 2, bw, h2, 0, col, lw, 'm₂', fs * 0.9);
    var La = K.clamp(Math.abs(a) / g * S * 0.3, 0, S * 0.14);
    if (La > 3) {
      K.vec(c, cx - Rp - bw * 0.9, y1 + h1 / 2, 0, Math.sign(a) * La, C.v, lw, 'a', fs);
      K.vec(c, cx + Rp + bw * 0.9, y2 + h2 / 2, 0, -Math.sign(a) * La, C.v, lw, 'a', fs);
    }
    K.lines(c, ['a = (m₁−m₂)g/(m₁+m₂) = ' + Math.abs(a).toFixed(2) + ' m/s²',
                'T = 2m₁m₂g/(m₁+m₂) = ' + T.toFixed(2) + ' N'], b.x1 + 4, b.y2 - fs * 2.8, col, fs * 0.8);
  }
});

/* ---------- 人船模型（动画） ---------- */
K.P('qMr', { label: '质量比M/m', min: 0.5, max: 10, step: 0.1, def: 3 });
K.reg({
  key: 'pm_boat', cat: 'mech', label: '人船模型', animatable: true, params: ['qMr'],
  icon: '<path d="M3 15h18l-3 4H6z"/><circle cx="9" cy="6" r="1.5"/><path d="M9 7.5V12M9 12l-2 3M9 12l2 3"/><path d="M2 21q2-1.5 4 0t4 0 4 0 4 0 4 0"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 60) return;
    var Mr = K.v(o, 'qMr'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055);
    var yw = b.y1 + b.h * 0.68, Lb = b.w * 0.5, hh = b.h * 0.12, deck = yw - hh * 0.45;
    var t = K.mod(K.t(o), 8), u;
    if (t < 3) u = t / 3; else if (t < 4) u = 1; else if (t < 7) u = 1 - (t - 4) / 3; else u = 0;
    u = u * u * (3 - 2 * u);
    var r0 = -Lb * 0.42, rel = r0 + Lb * 0.84 * u, dRel = rel - r0;
    var xb0 = b.x1 + b.w / 2, xb = xb0 - dRel / (1 + Mr), xp = xb + rel, xp0 = xb0 + r0;
    c.save(); c.strokeStyle = K.alpha(C.gas, 0.7); c.lineWidth = 1.2; c.beginPath();
    for (var x = b.x1; x <= b.x2; x += 2) { var yy = yw + Math.sin(x * 0.08) * 2; x === b.x1 ? c.moveTo(x, yy) : c.lineTo(x, yy); }
    c.stroke(); c.restore();
    var hull = function (x, cl, fill, dash) {
      K.poly(c, [[x - Lb / 2, deck], [x + Lb / 2, deck], [x + Lb * 0.4, deck + hh], [x - Lb * 0.4, deck + hh]], cl, lw, dash, true, fill);
    };
    if (dRel > 1) { hull(xb0, K.alpha(col, 0.35), null, [5, 4]); K.person(c, xp0, deck, b.h * 0.32, K.alpha(col, 0.3), lw); }
    hull(xb, col, K.alpha(col, 0.14));
    K.person(c, xp, deck, b.h * 0.32, col, lw, rel * 0.12);
    if (dRel > 4) {
      var ay = deck + hh + fs * 1.1;
      K.arrow(c, xb0, ay, xb, ay, C.v, lw, 8); K.txt(c, 'x船', (xb0 + xb) / 2, ay + fs * 0.9, { c: C.v, s: fs * 0.9, ui: true });
      var ty = deck - b.h * 0.38;
      K.arrow(c, xp0, ty, xp, ty, C.a, lw, 8); K.txt(c, 'x人', (xp0 + xp) / 2, ty - fs * 0.8, { c: C.a, s: fs * 0.9, ui: true });
    }
    K.lines(c, ['m·x人 = M·x船', 'x人 + x船 = L', 'x船 = mL/(M+m)'], b.x1 + 4, b.y1 + 4, col, fs * 0.8);
  }
});

/* ---------- 子弹打木块（动画 + v-t 图） ---------- */
K.reg({
  key: 'pm_bullet', cat: 'mech', label: '子弹打木块', animatable: true, params: ['qMr'],
  icon: '<path d="M2 18h20"/><rect x="12" y="10" width="7" height="8"/><path d="M4 14h5l1.5 0"/><path d="M9 13l1.5 1-1.5 1"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 100 || b.h < 70) return;
    var Mr = K.v(o, 'qMr'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var yg = b.y1 + b.h * 0.8, Lk = b.w * 0.15, Hk = b.h * 0.2, X0 = b.x1 + b.w * 0.32;
    var bl = Lk * 0.28, bh = Math.max(4, Hk * 0.12), xs = b.x1 + 6 + bl;
    var v0 = b.w * 0.6, D = Lk * 0.62, t0 = (X0 - xs) / v0, t1 = 2 * D / v0, v = v0 / (1 + Mr);
    var aB = v / t1, aU = (v0 - v) / t1, xEnd = b.x2 - 6 - Lk - X0;
    var tEnd = t0 + t1 + Math.max(0, xEnd - 0.5 * aB * t1 * t1) / Math.max(v, 1);
    var t = K.mod(K.t(o), tEnd + 1), tip, xB, vb, vu, ph;
    if (t < t0) { tip = xs + v0 * t; xB = 0; vu = v0; vb = 0; ph = 0; }
    else if (t < t0 + t1) { var q = t - t0; xB = 0.5 * aB * q * q; tip = X0 + v0 * q - 0.5 * aU * q * q; vu = v0 - aU * q; vb = aB * q; ph = 1; }
    else { var q2 = Math.min(t, tEnd) - t0 - t1; xB = 0.5 * aB * t1 * t1 + v * q2; tip = X0 + xB + D; vu = vb = v; ph = 2; }
    K.hatch(c, b.x1, yg, b.x2, yg, col, lw, 10, 1);
    K.txt(c, '光滑水平面', b.x1 + 4, yg + fs * 1.2, { c: col, s: fs * 0.8, al: 'left', ui: true });
    if (ph > 0) K.box(c, X0, yg - Hk, Lk, Hk, K.alpha(col, 0.3), 1, null, 2);
    K.box(c, X0 + xB, yg - Hk, Lk, Hk, col, lw, K.alpha('#b45309', 0.35), 3);
    K.txt(c, 'M', X0 + xB + Lk * 0.7, yg - Hk * 0.72, { c: col, s: fs, i: true });
    var by = yg - Hk * 0.5;
    K.box(c, tip - bl, by - bh / 2, bl, bh, C.a, 1, C.a, bh / 2);
    K.txt(c, 'm', tip - bl * 0.5, by - bh - fs * 0.5, { c: C.a, s: fs * 0.9, i: true });
    if (ph === 1) {
      K.vec(c, tip - bl * 0.5, by + bh * 2.2, -Lk * 0.35, 0, C.F, lw, 'f', fs * 0.85);
      K.vec(c, X0 + xB + Lk * 0.5, yg - Hk - fs * 0.4, Lk * 0.35, 0, C.F, lw, 'f', fs * 0.85);
    }
    if (ph > 0) {
      var my = yg + fs * 2.2;
      K.arrow(c, X0, my, X0 + xB, my, C.v, 1.2, 7); K.txt(c, 'x₂', X0 + xB / 2, my + fs * 0.8, { c: C.v, s: fs * 0.8, ui: true });
    }
    var gw = b.w * 0.34, gh = b.h * 0.42, gx = b.x2 - gw - 2, gy = b.y1 + 2, T = t0 + t1 * 2.2;
    var A = K.mini(c, gx, gy, gw, gh, { xmin: 0, xmax: t1 * 2.2, ymin: 0, ymax: v0 * 1.12, xl: 't', yl: 'v', col: col, fs: fs * 0.75, lw: 1 });
    var fu = function (x) { return x < t1 ? v0 - aU * x : v; }, fb = function (x) { return x < t1 ? aB * x : v; };
    c.save(); c.beginPath(); c.moveTo(A.X(0), A.Y(v0));
    for (var i = 0; i <= 30; i++) c.lineTo(A.X(t1 * i / 30), A.Y(fu(t1 * i / 30)));
    for (var j = 30; j >= 0; j--) c.lineTo(A.X(t1 * j / 30), A.Y(fb(t1 * j / 30)));
    c.fillStyle = K.alpha(C.a, 0.22); c.fill(); c.restore();
    K.plot(c, A, fu, 0, t1 * 2.2, C.a, 1.6); K.plot(c, A, fb, 0, t1 * 2.2, col, 1.6);
    K.txt(c, 'v₀', A.ox - 3, A.Y(v0), { c: col, s: fs * 0.7, al: 'right' });
    K.txt(c, 'Δx', A.X(t1 * 0.35), A.Y(v0 * 0.55), { c: C.a, s: fs * 0.75, i: true });
    if (ph > 0) { var tc = K.clamp(t - t0, 0, t1 * 2.2); K.line(c, A.X(tc), A.Y0, A.X(tc), A.oy, K.alpha(col, 0.6), 1, [3, 3]); }
    K.lines(c, ['v共 = mv₀/(M+m) = v₀/' + (1 + Mr).toFixed(1), 'Q = fΔx = ½mv₀² − ½(M+m)v共²'],
      b.x1 + 4, b.y1 + 4, col, fs * 0.8);
  }
});

/* ---------- 水平传送带（动画） ---------- */
K.P('qBeltV', { label: '传送带速度', min: 0.5, max: 6, step: 0.1, def: 2, unit: 'm/s' });
K.reg({
  key: 'pm_conveyor', cat: 'mech', label: '传送带·物块', animatable: true, params: ['qBeltV', 'qMu'],
  icon: '<circle cx="5" cy="15" r="3"/><circle cx="19" cy="15" r="3"/><path d="M5 12h14M5 18h14"/><rect x="7" y="7" width="5" height="5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 100 || b.h < 60) return;
    var v = K.v(o, 'qBeltV'), mu = K.v(o, 'qMu'), g = 10, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055);
    var Rr = K.clamp(b.h * 0.08, 8, 40), xa = b.x1 + Rr + 4, xb = b.x2 - Rr - 4, yc = b.y1 + b.h * 0.62;
    var yt = yc - Rr, L = xb - xa, Lm = 8, pxm = L / Lm, bw = K.clamp(b.h * 0.17, 14, 90);
    var a = mu * g, t1 = a > 0 ? v / a : Infinity, x0 = xa + bw * 0.6, Smax = (xb - x0 - bw * 0.6) / pxm;
    var s1 = a > 0 ? v * v / (2 * a) : Infinity, tEnd;
    if (a <= 0) tEnd = 3; else if (s1 >= Smax) tEnd = Math.sqrt(2 * Smax / a); else tEnd = t1 + (Smax - s1) / v;
    var t = K.mod(K.t(o), tEnd + 0.8), tc = Math.min(t, tEnd), s, vb;
    if (a <= 0) { s = 0; vb = 0; }
    else if (tc < t1) { s = 0.5 * a * tc * tc; vb = a * tc; }
    else { s = s1 + v * (tc - t1); vb = v; }
    var sliding = a > 0 && tc < t1 && vb < v - 1e-6, dS = a > 0 ? (sliding ? v * tc - s : v * t1 - s1) : v * tc;
    var tb = K.t(o);
    c.save(); c.strokeStyle = col; c.lineWidth = lw;
    c.beginPath(); c.moveTo(xa, yt); c.lineTo(xb, yt); c.arc(xb, yc, Rr, -PI / 2, PI / 2); c.lineTo(xa, yc + Rr); c.arc(xa, yc, Rr, PI / 2, PI * 1.5); c.stroke(); c.restore();
    var gap = 22, off = K.mod(v * tb * pxm, gap);
    for (var x = xa + off; x < xb; x += gap) { K.line(c, x, yt + 2, Math.min(x + 8, xb), yt + 2, K.alpha(col, 0.45), 1.5); }
    for (var x2 = xb - off; x2 > xa; x2 -= gap) { K.line(c, x2, yc + Rr - 2, Math.max(x2 - 8, xa), yc + Rr - 2, K.alpha(col, 0.45), 1.5); }
    [xa, xb].forEach(function (xr) {
      K.circ(c, xr, yc, Rr * 0.82, col, 1, K.alpha(col, 0.08));
      var an = v * tb * pxm / Rr;
      for (var k = 0; k < 3; k++) { var q = an + k * PI * 2 / 3; K.line(c, xr, yc, xr + Math.cos(q) * Rr * 0.75, yc + Math.sin(q) * Rr * 0.75, K.alpha(col, 0.6), 1); }
      K.dot(c, xr, yc, 2.5, col);
    });
    var xbp = x0 + s * pxm;
    if (dS > 0 && a > 0) K.line(c, xbp, yt - 1.5, Math.min(xb, xbp + dS * pxm), yt - 1.5, K.alpha(C.F, 0.75), 3);
    K.block(c, xbp, yt - bw * 0.42, bw, bw * 0.84, 0, col, lw, 'm', fs * 0.9);
    if (vb > 0.02) K.vec(c, xbp, yt - bw * 1.05, K.clamp(vb / 6 * L * 0.25, 4, L * 0.3), 0, C.v, lw, 'v', fs);
    if (sliding) K.vec(c, xbp + bw * 0.5, yt - 4, bw * 0.6, 0, C.F, lw, 'f', fs * 0.9);
    var info = a > 0 ? ['a = μg = ' + a.toFixed(1) + ' m/s²', 't₁ = v/a = ' + (s1 >= Smax ? '—' : t1.toFixed(2) + ' s'),
      '相对滑动 Δx = ' + (Math.min(dS, 99)).toFixed(2) + ' m', sliding ? '加速：受滑动摩擦力' : (s1 >= Smax ? '一直加速' : '共速：不受摩擦力')] : ['μ = 0：物块保持静止'];
    K.lines(c, info, b.x1 + 4, b.y1 + 4, col, fs * 0.78);
    K.txt(c, 'v带 = ' + v.toFixed(1) + ' m/s', b.x2 - 4, b.y1 + fs * 0.7, { c: col, s: fs * 0.8, al: 'right', ui: true });
  }
});

/* ---------- 斜面滑块（动画） ---------- */
K.reg({
  key: 'pm_slide', cat: 'mech', label: '斜面滑块', animatable: true, params: ['qAng', 'qMu'],
  icon: '<path d="M3 20h18V7z"/><rect x="12" y="8" width="5" height="4" transform="rotate(-31 14.5 10)"/><path d="M10 15l-3 2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 40) return;
    var th = K.v(o, 'qAng') * D2R, mu = K.v(o, 'qMu'), g = 10, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var pad = fs * 1.3, W = b.w - 2 * pad, Hh = b.h - 2 * pad - fs * 2.5;
    var base = Math.min(W, Hh / Math.tan(th)), hgt = base * Math.tan(th);
    var Ax = b.x1 + pad + (W - base) / 2, Ay = b.y2 - pad, Bx = Ax + base, Cy = Ay - hgt;
    K.hatch(c, Ax - pad * 0.6, Ay, Bx + pad * 0.6, Ay, col, lw, 9, 1);
    K.poly(c, [[Ax, Ay], [Bx, Ay], [Bx, Cy]], col, lw, null, true, K.alpha(col, 0.07));
    K.angArc(c, Ax, Ay, Math.min(base * 0.18, fs * 2.4), 0, -th, col, lw * 0.8, 'θ', fs);
    var a = g * (Math.sin(th) - mu * Math.cos(th)), Lm = 4, Ls = Math.hypot(base, hgt), pxm = Ls / Lm;
    var sMax = Lm * 0.78, tEnd = a > 0 ? Math.sqrt(2 * sMax / a) : 2.5, t = Math.min(K.mod(K.t(o), tEnd + 0.8), tEnd);
    var sm = a > 0 ? 0.5 * a * t * t : 0, vv = a > 0 ? a * t : 0;
    var dx = Math.cos(th), dy = -Math.sin(th), nx = -Math.sin(th), ny = -Math.cos(th);
    var bsz = K.clamp(Ls * 0.13, 14, 70), u0 = 0.9 - bsz * 0.6 / Ls;
    var Px = Ax + base * u0 - dx * sm * pxm, Py = Ay - hgt * u0 - dy * sm * pxm;
    var cx = Px + nx * bsz * 0.42, cy = Py + ny * bsz * 0.42;
    K.block(c, cx, cy, bsz * 1.2, bsz * 0.84, -th, col, lw);
    var Lg = K.clamp(S * 0.22, 24, 160), fw = lw;
    K.vec(c, cx, cy, 0, Lg, C.F, fw, 'G', fs * 0.9);
    K.vec(c, cx, cy, nx * Lg * Math.cos(th), ny * Lg * Math.cos(th), C.F, fw, 'F_N', fs * 0.9);
    var fr = a > 0 ? mu * Math.cos(th) : Math.sin(th);
    if (fr > 0.01) K.vec(c, cx, cy, dx * Lg * fr, dy * Lg * fr, C.F, fw, 'f', fs * 0.9);
    if (vv > 0.05) K.vec(c, cx - nx * bsz * 0.9, cy - ny * bsz * 0.9, -dx * K.clamp(vv * pxm * 0.25, 4, Ls * 0.35), -dy * K.clamp(vv * pxm * 0.25, 4, Ls * 0.35), C.v, fw, 'v', fs * 0.9);
    var info = a > 0 ? ['a = g(sinθ − μcosθ) = ' + a.toFixed(2) + ' m/s²', 'v = ' + vv.toFixed(2) + ' m/s'] :
      ['μ ≥ tanθ = ' + Math.tan(th).toFixed(2) + '：物块静止', 'f静 = mg sinθ'];
    K.lines(c, info, b.x1 + 4, b.y1 + 4, col, fs * 0.85);
  }
});

/* ---------- 双星系统（动画） ---------- */
K.P('qMs1', { label: '质量m₁', min: 0.5, max: 5, step: 0.1, def: 2 });
K.P('qMs2', { label: '质量m₂', min: 0.5, max: 5, step: 0.1, def: 1 });
K.reg({
  key: 'pm_binary', cat: 'mech', label: '双星系统', animatable: true, params: ['qMs1', 'qMs2'],
  icon: '<circle cx="8" cy="12" r="3"/><circle cx="18" cy="12" r="2"/><circle cx="12" cy="12" r="6" stroke-dasharray="2 2"/><path d="M11 12h2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 60) return;
    var m1 = K.v(o, 'qMs1'), m2 = K.v(o, 'qMs2'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2, L = S * 0.6, r1 = L * m2 / (m1 + m2), r2 = L - r1;
    var T = 5 * Math.sqrt(3 / (m1 + m2)), ph = K.t(o) / T * PI * 2;
    K.circ(c, cx, cy, r1, K.alpha(C.a, 0.5), 1, null, [5, 4]);
    K.circ(c, cx, cy, r2, K.alpha(C.gas, 0.5), 1, null, [5, 4]);
    var x1 = cx + r1 * Math.cos(ph), y1 = cy - r1 * Math.sin(ph), x2 = cx - r2 * Math.cos(ph), y2 = cy + r2 * Math.sin(ph);
    K.line(c, x1, y1, x2, y2, K.alpha(col, 0.5), 1, [4, 4]);
    K.dot(c, cx, cy, 2.5, col); K.txt(c, 'O', cx + fs * 0.6, cy + fs * 0.7, { c: col, s: fs * 0.85, i: true });
    var R1 = K.clamp(S * 0.035 * Math.cbrt(m1), 5, 30), R2 = K.clamp(S * 0.035 * Math.cbrt(m2), 5, 30);
    K.circ(c, x1, y1, R1, C.a, 1.5, K.alpha(C.a, 0.75)); K.circ(c, x2, y2, R2, C.gas, 1.5, K.alpha(C.gas, 0.75));
    K.txt(c, 'm₁', x1, y1 - R1 - fs * 0.7, { c: C.a, s: fs * 0.9 }); K.txt(c, 'm₂', x2, y2 - R2 - fs * 0.7, { c: C.gas, s: fs * 0.9 });
    var ux = (x2 - x1) / L, uy = (y2 - y1) / L, Lf = S * 0.1, kv = S * 0.22 / L;
    K.vec(c, x1, y1, ux * Lf, uy * Lf, C.F, lw, 'F', fs * 0.85); K.vec(c, x2, y2, -ux * Lf, -uy * Lf, C.F, lw, 'F', fs * 0.85);
    K.vec(c, x1, y1, -Math.sin(ph) * r1 * kv, -Math.cos(ph) * r1 * kv, C.v, lw, 'v_1', fs * 0.85);
    K.vec(c, x2, y2, Math.sin(ph) * r2 * kv, Math.cos(ph) * r2 * kv, C.v, lw, 'v_2', fs * 0.85);
    K.lines(c, ['ω₁ = ω₂', 'r₁ : r₂ = m₂ : m₁ = ' + (r1 / r2).toFixed(2), 'Gm₁m₂/L² = m₁ω²r₁ = m₂ω²r₂'], b.x1 + 4, b.y1 + 4, col, fs * 0.8);
  }
});

/* ---------- 卫星变轨（霍曼转移，动画） ---------- */
K.P('qRho', { label: '外轨/内轨半径比', min: 1.5, max: 4, step: 0.1, def: 2.5 });
K.reg({
  key: 'pm_hohmann', cat: 'mech', label: '卫星变轨', animatable: true, params: ['qRho'],
  icon: '<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="2 2"/><ellipse cx="9.8" cy="12" rx="7.3" ry="6.2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 80) return;
    var rho = K.v(o, 'qRho'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.045);
    var cx = b.x1 + b.w * 0.58, cy = b.y1 + b.h / 2, R2 = Math.min(b.h * 0.44, b.w * 0.38), R1 = R2 / rho;
    var a = (1 + rho) / 2, e = (rho - 1) / (rho + 1), ap = a * R1, cp = e * ap, bp = ap * Math.sqrt(1 - e * e);
    var k = 2.5 / (2 * PI), d1 = 2 * PI * k, d2 = PI * Math.pow(a, 1.5) * k, d3 = 2 * PI * Math.pow(rho, 1.5) * k;
    var t = K.mod(K.t(o), d1 + d2 + d3 + 0.5), ph, r, phi, sa;
    var pos = function (tt) {
      if (tt < d1) return { ph: 1, r: 1, phi: 2 * PI * tt / d1, sa: 1 };
      if (tt < d1 + d2) {
        var M = PI * (tt - d1) / d2, E = M;
        for (var i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        var nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
        return { ph: 2, r: a * (1 - e * Math.cos(E)), phi: nu, sa: a };
      }
      var q = Math.min(tt - d1 - d2, d3);
      return { ph: 3, r: rho, phi: PI + 2 * PI * q / d3, sa: rho };
    };
    var P0 = pos(t), P1 = pos(t + 0.01);
    var X = function (p) { return cx + p.r * R1 * Math.cos(p.phi); }, Y = function (p) { return cy - p.r * R1 * Math.sin(p.phi); };
    var act = function (n) { return P0.ph === n ? col : K.alpha(col, 0.35); };
    K.circ(c, cx, cy, R1, act(1), P0.ph === 1 ? 1.6 : 1, null, P0.ph === 1 ? [] : [5, 4]);
    c.save(); c.strokeStyle = act(2); c.lineWidth = P0.ph === 2 ? 1.6 : 1; c.setLineDash(P0.ph === 2 ? [] : [5, 4]);
    c.beginPath(); c.ellipse(cx - cp, cy, ap, bp, 0, 0, PI * 2); c.stroke(); c.restore();
    K.circ(c, cx, cy, R2, act(3), P0.ph === 3 ? 1.6 : 1, null, P0.ph === 3 ? [] : [5, 4]);
    var pr = K.clamp(R1 * 0.35, 6, 40);
    c.save(); var gr = c.createRadialGradient(cx - pr * 0.3, cy - pr * 0.3, pr * 0.1, cx, cy, pr);
    gr.addColorStop(0, '#93c5fd'); gr.addColorStop(1, '#1d4ed8'); c.fillStyle = gr;
    c.beginPath(); c.arc(cx, cy, pr, 0, PI * 2); c.fill(); c.restore();
    K.txt(c, 'P', cx + R1 + fs * 0.7, cy + fs * 0.8, { c: col, s: fs, i: true });
    K.txt(c, 'Q', cx - R2 - fs * 0.7, cy + fs * 0.8, { c: col, s: fs, i: true });
    K.txt(c, 'Ⅰ', cx - R1 * 0.62, cy + R1 * 0.62, { c: col, s: fs * 0.9 });
    K.txt(c, 'Ⅱ', cx - cp, cy + bp + fs * 0.8, { c: col, s: fs });
    K.txt(c, 'Ⅲ', cx + R2 * 0.75, cy - R2 * 0.75, { c: col, s: fs });
    var sx = X(P0), sy = Y(P0), vx = X(P1) - sx, vy = Y(P1) - sy, vl = Math.hypot(vx, vy) || 1;
    var vmag = Math.sqrt(2 / P0.r - 1 / P0.sa), Lv = S * 0.13 * vmag;
    K.vec(c, sx, sy, vx / vl * Lv, vy / vl * Lv, C.v, lw, 'v', fs * 0.9);
    K.circ(c, sx, sy, K.clamp(S * 0.018, 3.5, 10), col, 1.2, C.a);
    if (P0.ph === 2 && t - d1 < 0.5) K.txt(c, '点火加速', cx + R1 + fs * 2, cy - fs * 1.4, { c: C.F, s: fs, al: 'left', ui: true });
    if (P0.ph === 3 && t - d1 - d2 < 0.5) K.txt(c, '再次加速', cx - R2 - fs * 0.5, cy - fs * 1.4, { c: C.F, s: fs, al: 'right', ui: true });
    var vP = Math.sqrt(2 / 1 - 1 / a), vQ = Math.sqrt(2 / rho - 1 / a), v3 = Math.sqrt(1 / rho);
    K.lines(c, ['以 v₁ 为单位：', 'vP(Ⅱ) = ' + vP.toFixed(2), 'v(Ⅰ) = 1.00', 'v(Ⅲ) = ' + v3.toFixed(2), 'vQ(Ⅱ) = ' + vQ.toFixed(2),
      'aP(Ⅰ) = aP(Ⅱ)', 'TⅠ < TⅡ < TⅢ'], b.x1 + 4, b.y1 + 4, col, fs * 0.82);
  }
});
})();

/* ===================== 扩展 · 振动与波 ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI, TAU = PI * 2;

/* ---------- 机械波的形成与传播（动画） ---------- */
K.sel('qWDir', '传播方向', ['向右（+x）', '向左（−x）'], 0);
K.P('qWN', { label: '波长个数', min: 1, max: 4, step: 0.5, def: 2 });
K.tog('qWGhost', '显示Δt后波形', true);
K.reg({
  key: 'pm_wave_travel', cat: 'wave', label: '波的传播·质点振动', animatable: true, params: ['qWDir', 'qWN', 'qWGhost'],
  icon: '<path d="M2 12q2.5-6 5 0t5 0 5 0 5 0"/><circle cx="7" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><path d="M18 5h4M20 3l2 2-2 2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 50) return;
    var dir = K.v(o, 'qWDir') === 0 ? 1 : -1, nl = K.v(o, 'qWN'), ghost = K.v(o, 'qWGhost');
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.06);
    var x0 = b.x1 + fs, x1 = b.x2 - fs, y0 = b.y1 + b.h * 0.55, A = b.h * 0.26, Lw = (x1 - x0) / nl;
    var T = 2, v = Lw / T, w = TAU / T, k = TAU / Lw, t = K.t(o);
    var src = dir > 0 ? x0 : x1, front = v * t;
    var y = function (x, tt) { var d = Math.abs(x - src); return d > v * tt ? 0 : A * Math.sin(w * tt - k * d); };
    K.arrow(c, x0 - 4, y0, x1 + fs * 0.6, y0, K.alpha(col, 0.5), 1, 7);
    K.txt(c, 'x', x1 + fs * 0.4, y0 + fs * 0.8, { c: col, s: fs * 0.85, i: true });
    if (ghost && front > (x1 - x0) * 0.25) {
      var pts2 = []; for (var gx = x0; gx <= x1; gx += 3) pts2.push([gx, y0 - y(gx, t + T / 8)]);
      K.poly(c, pts2, K.alpha(C.a, 0.7), 1.2, [6, 5]);
    }
    var pts = []; for (var xx = x0; xx <= x1; xx += 2) pts.push([xx, y0 - y(xx, t)]);
    K.poly(c, pts, col, lw);
    var N = Math.round(nl * 12);
    for (var i = 0; i <= N; i++) {
      var px = x0 + (x1 - x0) * i / N; K.dot(c, px, y0 - y(px, t), Math.max(2, lw * 0.9), K.alpha(col, 0.85));
    }
    var pi = Math.round(N * (dir > 0 ? 0.62 : 0.38)), Px = x0 + (x1 - x0) * pi / N, Py = y0 - y(Px, t);
    K.circ(c, Px, Py, Math.max(4, lw * 1.8), C.F, 1.5, C.F);
    K.txt(c, 'P', Px + fs * 0.6, Py - fs * 0.7, { c: C.F, s: fs, i: true });
    var dP = Math.abs(Px - src);
    if (dP <= front) {
      var vy = A * w * Math.cos(w * t - k * dP), L = vy / (A * w) * A * 0.7;
      if (Math.abs(L) > 3) K.vec(c, Px, Py, 0, -L, C.v, lw, 'v', fs * 0.9);
    }
    K.vec(c, (x0 + x1) / 2 - dir * Lw * 0.25, b.y1 + fs * 0.9, dir * Lw * 0.5, 0, C.a, lw, null, fs);
    K.txt(c, '波的传播方向', (x0 + x1) / 2, b.y1 + fs * 2.1, { c: C.a, s: fs * 0.75, ui: true });
    K.txt(c, '波源 S', src, y0 + A + fs * 1.1, { c: col, s: fs * 0.8, ui: true });
    if (front > Lw * 1.05) {
      var xs = src + dir * Lw * 0.25, ly = y0 - A - fs * 0.6;
      K.arrow(c, xs + dir * Lw / 2, ly, xs, ly, col, 1, 6); K.arrow(c, xs + dir * Lw / 2, ly, xs + dir * Lw, ly, col, 1, 6);
      K.txt(c, 'λ', xs + dir * Lw / 2, ly - fs * 0.6, { c: col, s: fs, i: true });
    }
    if (ghost) K.txt(c, '虚线：Δt = T/8 后', b.x2 - 4, b.y2 - fs * 0.5, { c: C.a, s: fs * 0.72, al: 'right', ui: true });
  }
});

/* ---------- 简谐运动与参考圆（动画） ---------- */
K.P('qPhi0', { label: '初相位φ₀', min: 0, max: 360, step: 15, def: 0, unit: '°' });
K.reg({
  key: 'pm_shm_circle', cat: 'wave', label: '简谐运动·参考圆', animatable: true, params: ['qPhi0'],
  icon: '<circle cx="6" cy="12" r="4.5"/><path d="M6 12l3.2-3.2"/><path d="M11 12h11"/><path d="M11 8.8q2.5-6 5 3.2t5 3"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 100 || b.h < 60) return;
    var col = o.color, lw = K.lw(o), fs = K.fs(b.h, 0.065), phi0 = K.v(o, 'qPhi0') * PI / 180;
    var R = Math.min(b.h * 0.36, b.w * 0.17), cx = b.x1 + R + fs, cy = b.y1 + b.h / 2;
    var gx = cx + R + fs * 2.2, gw = b.x2 - fs - gx, T = 3, Tw = 2 * T, t = K.t(o), w = TAU / T;
    var th = w * t + phi0, px = cx + R * Math.cos(th), py = cy - R * Math.sin(th);
    K.circ(c, cx, cy, R, K.alpha(col, 0.6), 1.2, null, [5, 4]);
    K.line(c, cx - R - 4, cy, cx + R + 4, cy, K.alpha(col, 0.35), 1);
    K.line(c, cx, cy - R - 4, cx, cy + R + 4, K.alpha(col, 0.35), 1);
    K.line(c, cx, cy, px, py, col, lw);
    K.angArc(c, cx, cy, R * 0.25, 0, -K.mod(th, TAU), K.alpha(col, 0.7), 1);
    K.line(c, px, py, cx, py, K.alpha(C.a, 0.7), 1, [3, 3]);
    K.dot(c, cx, py, Math.max(3.5, lw * 1.5), C.a);
    K.circ(c, px, py, Math.max(4, lw * 1.8), col, 1.5, C.F);
    var vL = R * 0.45; K.vec(c, px, py, -Math.sin(th) * vL, -Math.cos(th) * vL, C.v, lw, null, fs);
    var A = K.axes(c, gx, b.y1, gw, b.h, { xmin: 0, xmax: Tw, ymin: -1.15, ymax: 1.15, xl: 't', yl: 'x', col: col, fs: fs * 0.85, lw: 1.2, pad: { l: 4, r: fs * 1.5, t: b.h / 2 - R * 1.15, b: b.h / 2 - R * 1.15 } });
    var tw = K.mod(t, Tw), t0 = t - tw;
    K.plot(c, A, function (x) { return Math.sin(w * (t0 + x) + phi0); }, 0, tw, col, lw, null, 200);
    K.plot(c, A, function (x) { return Math.sin(w * (t0 + x) + phi0); }, tw, Tw, K.alpha(col, 0.18), 1, [4, 4], 120);
    var gxp = A.X(tw); K.line(c, cx, py, gxp, py, K.alpha(C.a, 0.5), 1, [3, 4]); K.dot(c, gxp, py, Math.max(3.5, lw * 1.4), C.a);
    K.txt(c, 'T', A.X(T), A.oy + fs * 0.9, { c: col, s: fs * 0.8, i: true });
    K.txt(c, 'x = A sin(ωt + φ₀)', b.x2 - 4, b.y1 + fs * 0.7, { c: col, s: fs * 0.85, al: 'right', i: true });
  }
});

/* ---------- 两列脉冲相遇（叠加原理，动画） ---------- */
K.sel('qPulseMode', '两列波', ['波峰与波峰', '波峰与波谷'], 0);
K.reg({
  key: 'pm_pulse_meet', cat: 'wave', label: '波的叠加·脉冲相遇', animatable: true, params: ['qPulseMode'],
  icon: '<path d="M2 15h20"/><path d="M3 15q2-8 4 0"/><path d="M17 15q2-8 4 0"/><path d="M5 7h3M8 7l-1.5-1.5M8 7l-1.5 1.5"/><path d="M19 7h-3M16 7l1.5-1.5M16 7l1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 50) return;
    var opp = K.v(o, 'qPulseMode') === 1, col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.06);
    var x0 = b.x1 + 6, x1 = b.x2 - 6, W = x1 - x0, y0 = b.y1 + b.h * 0.6, A = b.h * 0.3, sg = W * 0.05;
    var Tc = 6, t = K.mod(K.t(o), Tc), v = W * 0.8 / (Tc - 1), u = Math.min(t, Tc - 1);
    var c1 = x0 + W * 0.1 + v * u, c2 = x1 - W * 0.1 - v * u, s2 = opp ? -1 : 1;
    var g1 = function (x) { return A * Math.exp(-Math.pow((x - c1) / sg, 2)); };
    var g2 = function (x) { return s2 * A * Math.exp(-Math.pow((x - c2) / sg, 2)); };
    K.line(c, x0, y0, x1, y0, K.alpha(col, 0.35), 1);
    var p1 = [], p2 = [], ps = [];
    for (var x = x0; x <= x1; x += 2) { p1.push([x, y0 - g1(x)]); p2.push([x, y0 - g2(x)]); ps.push([x, y0 - g1(x) - g2(x)]); }
    K.poly(c, p1, K.alpha(C.a, 0.85), 1.3, [5, 4]); K.poly(c, p2, K.alpha(C.gas, 0.85), 1.3, [5, 4]);
    K.poly(c, ps, col, lw);
    K.vec(c, c1 - sg, b.y1 + fs, sg * 2, 0, C.a, 1.5, 'v', fs * 0.85);
    K.vec(c, c2 + sg, b.y1 + fs * (opp ? 1 : 2.2), -sg * 2, 0, C.gas, 1.5, 'v', fs * 0.85);
    K.txt(c, Math.abs(c1 - c2) < sg * 0.5 ? (opp ? '相消：位移 = A − A = 0' : '相长：位移 = 2A') : '实线为合位移', b.x1 + 4, b.y2 - fs * 0.6,
      { c: col, s: fs * 0.8, al: 'left', ui: true });
  }
});

/* ---------- 驻波的形成（动画） ---------- */
K.P('qSWN', { label: '半波长个数', min: 1, max: 8, step: 1, def: 4 });
K.tog('qSWShow', '显示两列分波', true);
K.reg({
  key: 'pm_standing_anim', cat: 'wave', label: '驻波的形成', animatable: true, params: ['qSWN', 'qSWShow'],
  icon: '<path d="M2 12q2.5-7 5 0t5 0 5 0 5 0"/><path d="M2 12q2.5 7 5 0t5 0 5 0 5 0" stroke-dasharray="2 2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 50) return;
    var n = K.v(o, 'qSWN'), show = K.v(o, 'qSWShow'), col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.06);
    var x0 = b.x1 + 6, x1 = b.x2 - 6, W = x1 - x0, y0 = b.y1 + b.h / 2, A = b.h * 0.2;
    var k = n * PI / W, w = TAU / 2.5, t = K.t(o);
    K.line(c, x0, y0, x1, y0, K.alpha(col, 0.3), 1);
    var p1 = [], p2 = [], ps = [];
    for (var x = x0; x <= x1; x += 2) {
      var d = x - x0, a1 = A * Math.sin(k * d - w * t), a2 = A * Math.sin(k * d + w * t);
      p1.push([x, y0 - a1]); p2.push([x, y0 - a2]); ps.push([x, y0 - a1 - a2]);
    }
    if (show) { K.poly(c, p1, K.alpha(C.a, 0.7), 1.1, [5, 4]); K.poly(c, p2, K.alpha(C.gas, 0.7), 1.1, [5, 4]); }
    var env1 = [], env2 = [];
    for (var x2 = x0; x2 <= x1; x2 += 3) { var e = 2 * A * Math.abs(Math.sin(k * (x2 - x0))); env1.push([x2, y0 - e]); env2.push([x2, y0 + e]); }
    K.poly(c, env1, K.alpha(col, 0.18), 1); K.poly(c, env2, K.alpha(col, 0.18), 1);
    K.poly(c, ps, col, lw);
    for (var j = 0; j <= n; j++) {
      var xn = x0 + j * PI / k; K.dot(c, xn, y0, Math.max(3, lw * 1.3), C.F);
      K.txt(c, 'N', xn, y0 + fs * 1.1, { c: C.F, s: fs * 0.8 });
      if (j < n) K.txt(c, 'A', xn + PI / k / 2, y0 + 2 * A + fs * 0.9, { c: C.v, s: fs * 0.8 });
    }
    K.txt(c, 'N：波节（始终不动）   A：波腹（振幅 2A）   相邻波节间距 λ/2', b.x1 + 4, b.y1 + fs * 0.7,
      { c: col, s: fs * 0.75, al: 'left', ui: true });
  }
});
})();

/* ===================== 扩展 · 几何光学 / 物理光学 ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI, D2R = PI / 180;
var deg = function (r) { return (r / D2R).toFixed(1) + '°'; };
var clipBox = function (c, b) { c.save(); c.beginPath(); c.rect(b.x1, b.y1, b.w, b.h); c.clip(); };

/* ---------- 光的反射 / 平面镜成像 ---------- */
K.sel('qRefMode', '模式', ['反射定律', '平面镜成像'], 0);
K.reg({
  key: 'pm_reflect', cat: 'optics', label: '光的反射·平面镜', params: ['qRefMode', 'qInc'],
  icon: '<path d="M2 18h20"/><path d="M4 20l2-2M8 20l2-2M12 20l2-2M16 20l2-2"/><path d="M4 6l8 12 8-12"/><path d="M12 18V5" stroke-dasharray="2 2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var mode = K.v(o, 'qRefMode'), i = K.v(o, 'qInc') * D2R, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055), Lc = C.light;
    if (mode === 0) {
      var ym = b.y1 + b.h * 0.78, Ox = b.x1 + b.w / 2, L = Math.min(b.h * 0.7, b.w * 0.46 / Math.max(0.3, Math.sin(i)));
      L = Math.min(L, b.h * 0.72);
      K.hatch(c, b.x1 + 6, ym, b.x2 - 6, ym, col, lw * 1.2, 9, 1);
      K.line(c, Ox, ym, Ox, ym - L * 1.02, col, 1, [5, 4]);
      K.ray(c, Ox - L * Math.sin(i), ym - L * Math.cos(i), Ox, ym, Lc, lw);
      K.ray(c, Ox, ym, Ox + L * Math.sin(i), ym - L * Math.cos(i), Lc, lw);
      if (i > 0.02) {
        K.angArc(c, Ox, ym, L * 0.28, -PI / 2 - i, -PI / 2, col, 1, 'i', fs);
        K.angArc(c, Ox, ym, L * 0.22, -PI / 2, -PI / 2 + i, col, 1, "i'", fs);
      }
      K.txt(c, 'O', Ox, ym + fs * 1.2, { c: col, s: fs, i: true });
      K.txt(c, '法线', Ox + fs * 0.4, ym - L * 1.02, { c: col, s: fs * 0.8, al: 'left', ui: true });
      K.txt(c, '反射角 = 入射角 = ' + deg(i), b.x1 + 4, b.y1 + fs * 0.7, { c: col, s: fs * 0.85, al: 'left', ui: true });
    } else {
      var ym2 = b.y1 + b.h * 0.5, Sx = b.x1 + b.w * 0.25, hS = b.h * 0.36, Sy = ym2 - hS, Iy = ym2 + hS;
      K.hatch(c, b.x1 + 6, ym2, b.x2 - 6, ym2, col, lw * 1.2, 9, 1);
      K.dot(c, Sx, Sy, Math.max(3.5, lw * 1.5), Lc); K.txt(c, 'S', Sx - fs * 0.8, Sy, { c: col, s: fs, i: true });
      K.circ(c, Sx, Iy, Math.max(3.5, lw * 1.5), K.alpha(col, 0.8), 1.2, null, [2, 2]); K.txt(c, "S'", Sx - fs * 0.9, Iy, { c: col, s: fs, i: true });
      K.line(c, Sx, Sy, Sx, Iy, K.alpha(col, 0.4), 1, [3, 4]);
      [0.14, 0.32].forEach(function (u) {
        var Mx = Sx + b.w * u, dx = Mx - Sx, dy = ym2 - Sy, L2 = Math.hypot(dx, dy), ux = dx / L2, uy = dy / L2;
        K.ray(c, Sx, Sy, Mx, ym2, Lc, lw);
        var ex = Mx + ux * L2 * 1.1, ey = ym2 - uy * L2 * 1.1;
        K.ray(c, Mx, ym2, ex, ey, Lc, lw);
        K.line(c, Mx, ym2, Sx, Iy, K.alpha(Lc, 0.75), 1.2, [5, 4]);
      });
      K.txt(c, '像与物关于镜面对称（虚像）', b.x2 - 4, b.y1 + fs * 0.7, { c: col, s: fs * 0.85, al: 'right', ui: true });
    }
  }
});

/* ---------- 光的折射与全反射 ---------- */
K.P('qN1', { label: '上方介质n₁', min: 1, max: 2.5, step: 0.01, def: 1 });
K.P('qN2', { label: '下方介质n₂', min: 1, max: 2.5, step: 0.01, def: 1.5 });
K.reg({
  key: 'pm_refract', cat: 'optics', label: '折射·全反射', params: ['qN1', 'qN2', 'qInc'],
  icon: '<path d="M2 12h20"/><path d="M12 3v18" stroke-dasharray="2 2"/><path d="M5 4l7 8 3.5 8"/><path d="M12 12l7-8" opacity=".5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 60) return;
    var n1 = K.v(o, 'qN1'), n2 = K.v(o, 'qN2'), i = K.v(o, 'qInc') * D2R, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05), Lc = C.light;
    var Ox = b.x1 + b.w / 2, Oy = b.y1 + b.h / 2, L = Math.min(b.h * 0.46, b.w * 0.46);
    K.box(c, b.x1, n2 >= n1 ? Oy : b.y1, b.w, b.h / 2, null, 0, K.alpha(C.glass, 0.12 + 0.08 * Math.abs(n2 - n1)));
    K.line(c, b.x1, Oy, b.x2, Oy, col, lw);
    K.line(c, Ox, b.y1 + 4, Ox, b.y2 - 4, col, 1, [5, 4]);
    K.txt(c, 'n₁ = ' + n1.toFixed(2), b.x1 + 4, b.y1 + fs * 0.8, { c: col, s: fs, al: 'left', i: true });
    K.txt(c, 'n₂ = ' + n2.toFixed(2), b.x1 + 4, b.y2 - fs * 0.8, { c: col, s: fs, al: 'left', i: true });
    var sr = n1 * Math.sin(i) / n2, tir = sr > 1;
    K.ray(c, Ox - L * Math.sin(i), Oy - L * Math.cos(i), Ox, Oy, Lc, lw);
    K.ray(c, Ox, Oy, Ox + L * Math.sin(i), Oy - L * Math.cos(i), tir ? Lc : K.alpha(Lc, 0.35), tir ? lw : 1.2);
    if (i > 0.02) K.angArc(c, Ox, Oy, L * 0.26, -PI / 2 - i, -PI / 2, col, 1, 'i', fs);
    if (!tir) {
      var r = Math.asin(sr);
      K.ray(c, Ox, Oy, Ox + L * Math.sin(r), Oy + L * Math.cos(r), Lc, lw);
      if (r > 0.02) K.angArc(c, Ox, Oy, L * 0.3, PI / 2, PI / 2 - r, col, 1, 'r', fs);
      K.txt(c, 'n₁ sin i = n₂ sin r    r = ' + deg(r), b.x2 - 4, b.y2 - fs * 0.8, { c: col, s: fs * 0.85, al: 'right', i: true });
    } else {
      K.txt(c, '发生全反射', b.x2 - 4, b.y2 - fs * 0.8, { c: C.F, s: fs, al: 'right', ui: true });
    }
    if (n1 > n2) K.txt(c, '临界角 C = arcsin(n₂/n₁) = ' + deg(Math.asin(n2 / n1)), b.x2 - 4, b.y1 + fs * 0.8, { c: col, s: fs * 0.85, al: 'right', ui: true });
  }
});

/* ---------- 三棱镜色散（柯西色散公式 + 矢量折射追迹） ---------- */
K.P('qDisp', { label: '色散强度', min: 1, max: 12, step: 1, def: 6 });
K.P('qPrismI', { label: '入射角', min: 20, max: 80, step: 1, def: 50, unit: '°' });
var SPEC = [[700, '红'], [620, '橙'], [585, '黄'], [550, '绿'], [500, '青'], [460, '蓝'], [415, '紫']];
K.reg({
  key: 'pm_prism', cat: 'optics', label: '三棱镜色散', params: ['qPrismI', 'qDisp'],
  icon: '<path d="M12 4l7 14H5z"/><path d="M1 13l7.5-2"/><path d="M15.5 10.5l7-2M15.8 12l6.7.5M16 13.5l6 3"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 60) return;
    var ii = K.v(o, 'qPrismI') * D2R, disp = K.v(o, 'qDisp'), col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.05);
    var s = Math.min(b.w * 0.42, b.h * 0.9 / 0.866), H = s * 0.866, cx = b.x1 + b.w * 0.42, cy = b.y1 + b.h * 0.5 + H / 6;
    var V = [[cx, cy - H * 2 / 3], [cx - s / 2, cy + H / 3], [cx + s / 2, cy + H / 3]];
    K.poly(c, V, col, lw, null, true, K.alpha(C.glass, 0.16));
    var faces = [[V[1], V[0]], [V[0], V[2]], [V[2], V[1]]];
    var nOut = function (f) {
      var ex = f[1][0] - f[0][0], ey = f[1][1] - f[0][1], L = Math.hypot(ex, ey), nx = ey / L, ny = -ex / L;
      var mx = (f[0][0] + f[1][0]) / 2 - cx, my = (f[0][1] + f[1][1]) / 2 - cy;
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; } return [nx, ny];
    };
    var n0 = nOut(faces[0]), E = [V[1][0] + (V[0][0] - V[1][0]) * 0.52, V[1][1] + (V[0][1] - V[1][1]) * 0.52];
    var dx0 = -n0[0], dy0 = -n0[1], ca = Math.cos(-ii), sa = Math.sin(-ii);
    var din = [dx0 * ca - dy0 * sa, dx0 * sa + dy0 * ca], L0 = b.w * 0.4;
    clipBox(c, b);
    K.ray(c, E[0] - din[0] * L0, E[1] - din[1] * L0, E[0], E[1], col, lw * 1.2);
    K.line(c, E[0] - n0[0] * s * 0.25, E[1] - n0[1] * s * 0.25, E[0] + n0[0] * s * 0.25, E[1] + n0[1] * s * 0.25, K.alpha(col, 0.5), 1, [4, 4]);
    SPEC.forEach(function (sp, k) {
      var lm = sp[0] / 1000, n = 1.52 + 0.0042 * disp * (1 / (lm * lm) - 1 / 0.3025), cl = K.wl(sp[0], 0.9);
      var d = K.refract(din, n0, 1 / n); if (!d) return;
      var p = E, cur = 0, segs = 0;
      while (segs++ < 5) {
        var best = null, bf = -1;
        for (var f = 0; f < 3; f++) { if (f === cur) continue; var tt = K.segHit(p, d, faces[f][0], faces[f][1]); if (tt != null && (best == null || tt < best)) { best = tt; bf = f; } }
        if (best == null) break;
        var q = [p[0] + d[0] * best, p[1] + d[1] * best];
        K.line(c, p[0], p[1], q[0], q[1], cl, 1.3);
        var no = nOut(faces[bf]), nd = K.refract(d, [-no[0], -no[1]], n);
        if (nd) {
          var Lx = b.w;
          K.line(c, q[0], q[1], q[0] + nd[0] * Lx, q[1] + nd[1] * Lx, cl, 2);
          if (k === 0 || k === 6) K.txt(c, sp[1], q[0] + nd[0] * b.w * 0.32, q[1] + nd[1] * b.w * 0.32 + (k ? fs * 0.7 : -fs * 0.7), { c: cl, s: fs, ui: true });
          break;
        }
        d = K.reflect(d, no); p = q; cur = bf;
      }
    });
    c.restore();
    K.txt(c, 'n(λ) = A + B/λ²：紫光折射率最大，偏折最大', b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.8, al: 'left', ui: true });
  }
});

/* ---------- 透镜成像（三条特殊光线 + 高斯公式） ---------- */
K.sel('qLens', '透镜', ['凸透镜', '凹透镜'], 0);
K.P('qU', { label: '物距 u/f', min: 0.2, max: 4, step: 0.05, def: 2.5 });
K.reg({
  key: 'pm_lens', cat: 'optics', label: '透镜成像', params: ['qLens', 'qU'],
  icon: '<path d="M1 12h22"/><path d="M12 3q3 9 0 18q-3-9 0-18z"/><path d="M5 12V6"/><path d="M3.5 7.5L5 6l1.5 1.5"/><path d="M18 12v4" stroke-dasharray="1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 120 || b.h < 60) return;
    var cvx = K.v(o, 'qLens') === 0, u = K.v(o, 'qU'), col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.05), Lc = C.light;
    var f = b.w * 0.115 * (cvx ? 1 : -1), F = Math.abs(f), cx = b.x1 + b.w * 0.52, ay = b.y1 + b.h * 0.56;
    var hO = b.h * 0.2, uPx = u * F, xo = cx - uPx, ya = ay - hO, lh = b.h * 0.4;
    K.line(c, b.x1 + 2, ay, b.x2 - 2, ay, K.alpha(col, 0.6), 1);
    c.save(); c.beginPath();
    if (cvx) { c.moveTo(cx, ay - lh); c.quadraticCurveTo(cx + F * 0.22, ay, cx, ay + lh); c.quadraticCurveTo(cx - F * 0.22, ay, cx, ay - lh); }
    else { var e = F * 0.12; c.moveTo(cx - e, ay - lh); c.lineTo(cx + e, ay - lh); c.quadraticCurveTo(cx + e * 0.1, ay, cx + e, ay + lh); c.lineTo(cx - e, ay + lh); c.quadraticCurveTo(cx - e * 0.1, ay, cx - e, ay - lh); }
    c.fillStyle = K.alpha(C.glass, 0.2); c.fill(); c.strokeStyle = col; c.lineWidth = lw * 0.8; c.stroke(); c.restore();
    [[-1, 'F'], [1, "F'"], [-2, '2F'], [2, "2F'"]].forEach(function (p) {
      var x = cx + p[0] * F; if (x < b.x1 || x > b.x2) return;
      K.dot(c, x, ay, 3, col); K.txt(c, p[1], x, ay + fs * 1.1, { c: col, s: fs * 0.85, i: true });
    });
    K.txt(c, 'O', cx + fs * 0.6, ay + fs * 1.1, { c: col, s: fs * 0.85, i: true });
    K.arrow(c, xo, ay, xo, ya, col, lw * 1.2, 10);
    var degen = cvx && Math.abs(u - 1) < 0.02, v = degen ? Infinity : 1 / (1 / f - 1 / uPx), m = -v / uPx;
    var virt = v < 0, xi = cx + v, yi = ay - hO * m;
    clipBox(c, b);
    var far = b.w * 2, out = [];
    var go = function (px, py, dx, dy) {
      var L = Math.hypot(dx, dy); dx /= L; dy /= L;
      K.ray(c, px, py, px + dx * far, py + dy * far, Lc, lw * 0.9, null, true);
      K.head(c, px + dx * F * 0.9, py + dy * F * 0.9, dx, dy, Math.max(8, lw * 3), Lc);
      out.push([px, py]);
    };
    K.ray(c, xo, ya, cx, ya, Lc, lw * 0.9);
    if (cvx) go(cx, ya, F, ay - ya); else { go(cx, ya, F, ya - ay); K.line(c, cx, ya, cx - F, ay, K.alpha(Lc, 0.7), 1.1, [5, 4]); }
    go(xo, ya, cx - xo, ay - ya);
    var xF = cvx ? cx - F : cx + F;
    if (Math.abs(xF - xo) > 1e-3) {
      var y3 = ya + (cx - xo) * (ay - ya) / (xF - xo);
      if (Math.abs(y3 - ay) < lh * 1.6) {
        K.ray(c, xo, ya, cx, y3, Lc, lw * 0.9);
        go(cx, y3, 1, 0);
        if (!cvx) K.line(c, cx, y3, xF, ay, K.alpha(Lc, 0.7), 1.1, [5, 4]);
        if (cvx && u < 1) K.line(c, xF, ay, xo, ya, K.alpha(Lc, 0.7), 1.1, [5, 4]);
      }
    }
    if (!degen && isFinite(v)) {
      if (virt) out.forEach(function (p) { K.line(c, p[0], p[1], xi, yi, K.alpha(Lc, 0.75), 1.1, [5, 4]); });
      if (Math.abs(yi - ay) > 2) {
        c.save(); c.setLineDash(virt ? [5, 4] : []);
        K.arrow(c, xi, ay, xi, yi, virt ? K.alpha(C.g2, 0.9) : C.g2, lw * 1.2, 10, virt ? [5, 4] : null); c.restore();
      }
    }
    c.restore();
    var desc;
    if (degen) desc = 'u = f：不成像（折射光平行）';
    else if (!cvx) desc = '正立、缩小的虚像';
    else if (u < 1) desc = '正立、放大的虚像（放大镜）';
    else if (Math.abs(u - 2) < 0.03) desc = '倒立、等大的实像';
    else desc = u > 2 ? '倒立、缩小的实像（照相机）' : '倒立、放大的实像（投影仪）';
    K.txt(c, desc, b.x1 + 4, b.y1 + fs * 0.7, { c: C.g2, s: fs * 0.95, al: 'left', ui: true });
    var info = '1/u + 1/v = 1/f    u = ' + u.toFixed(2) + (cvx ? 'f' : '|f|') + (isFinite(v) ? '    v = ' + (v / F).toFixed(2) + (cvx ? 'f' : '|f|') + '    放大率 ' + Math.abs(m).toFixed(2) : '');
    K.txt(c, info, b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.8, al: 'left', i: true });
  }
});

/* ---------- 光导纤维 ---------- */
K.reg({
  key: 'pm_fiber', cat: 'optics', label: '光导纤维', params: ['qInc'],
  icon: '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M2 10h20M2 14h20" opacity=".5"/><path d="M1 9l4 3 4-2 4 4 4-4 4 3"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 100 || b.h < 50) return;
    var i = Math.min(K.v(o, 'qInc'), 85) * D2R, n1 = 1.5, n2 = 1.4, col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.06), Lc = C.light;
    var xa = b.x1 + b.w * 0.18, xb = b.x2 - 4, yc = b.y1 + b.h * 0.52, hc = b.h * 0.15, hcl = b.h * 0.25;
    K.box(c, xa, yc - hcl, xb - xa, hcl * 2, K.alpha(col, 0.5), 1, K.alpha(C.glass, 0.08), 4);
    K.box(c, xa, yc - hc, xb - xa, hc * 2, col, lw * 0.8, K.alpha(C.glass, 0.18), 2);
    K.line(c, xa - b.w * 0.1, yc, xa + b.w * 0.06, yc, col, 1, [4, 4]);
    var L0 = b.w * 0.15, sx = xa - L0 * Math.cos(i), sy = yc - L0 * Math.sin(i);
    K.ray(c, sx, sy, xa, yc, Lc, lw);
    if (i > 0.03) K.angArc(c, xa, yc, L0 * 0.45, PI, PI + i, col, 1, 'i', fs * 0.85);
    var r = Math.asin(Math.sin(i) / n1), Cc = Math.asin(n2 / n1), inc = PI / 2 - r, ok = inc >= Cc;
    var x = xa, y = yc, dy = 1, amp = 1, guard = 0;
    c.save(); c.beginPath(); c.rect(xa, yc - hcl, xb - xa, hcl * 2); c.clip();
    while (x < xb && guard++ < 80) {
      var yt = dy > 0 ? yc + hc : yc - hc, dxs = Math.abs(yt - y) / Math.max(1e-6, Math.tan(r)), nx = x + dxs;
      if (r < 1e-3) { nx = xb; yt = y; }
      if (nx > xb) { var u = (xb - x) / (nx - x); K.line(c, x, y, xb, y + (yt - y) * u, K.alpha(Lc, amp), lw * 0.9); break; }
      K.line(c, x, y, nx, yt, K.alpha(Lc, amp), lw * 0.9);
      if (!ok) {
        var tr = Math.asin(Math.min(1, n1 * Math.sin(inc) / n2)), out = dy > 0 ? 1 : -1;
        K.line(c, nx, yt, nx + (hcl - hc) * Math.tan(tr), yt + out * (hcl - hc), K.alpha(C.F, amp * 0.9), 1.2);
        amp *= 0.55; if (amp < 0.08) break;
      }
      x = nx; y = yt; dy = -dy;
    }
    c.restore();
    var acc = Math.asin(Math.sqrt(n1 * n1 - n2 * n2)) / D2R;
    K.txt(c, '纤芯 n₁ = 1.5', xa + 6, yc - hc - (hcl - hc) / 2, { c: col, s: fs * 0.75, al: 'left', ui: true });
    K.txt(c, '包层 n₂ = 1.4', xa + 6, yc + hcl + fs * 0.8, { c: col, s: fs * 0.75, al: 'left', ui: true });
    K.txt(c, ok ? '在纤芯与包层界面发生全反射' : '入射角过大：界面处部分光折射漏出', b.x1 + 4, b.y1 + fs * 0.7,
      { c: ok ? col : C.F, s: fs * 0.85, al: 'left', ui: true });
    K.txt(c, 'n₁ > n₂ ，端面入射角 i ≤ ' + acc.toFixed(1) + '° 时全反射传播', b.x2 - 4, b.y2 - fs * 0.5, { c: col, s: fs * 0.75, al: 'right', ui: true });
  }
});

/* ---------- 平行玻璃砖（侧移） ---------- */
K.reg({
  key: 'pm_slab', cat: 'optics', label: '平行玻璃砖', params: ['qInc', 'qN'],
  icon: '<rect x="3" y="8" width="18" height="7"/><path d="M4 2l5 6 2 7 5 6"/><path d="M9 8l4.5 6" stroke-dasharray="1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 70) return;
    var i = Math.min(K.v(o, 'qInc'), 80) * D2R, n = K.v(o, 'qN'), col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.05), Lc = C.light;
    var yt = b.y1 + b.h * 0.34, yb = b.y1 + b.h * 0.68, Ex = b.x1 + b.w * 0.36, Ey = yt, T = yb - yt;
    K.box(c, b.x1 + b.w * 0.06, yt, b.w * 0.88, T, col, lw, K.alpha(C.glass, 0.16));
    var r = Math.asin(Math.sin(i) / n), Xx = Ex + T * Math.tan(r), L1 = (yt - b.y1 - 4) / Math.cos(i);
    clipBox(c, b);
    K.ray(c, Ex - L1 * Math.sin(i), Ey - L1 * Math.cos(i), Ex, Ey, Lc, lw);
    K.ray(c, Ex, Ey, Xx, yb, Lc, lw);
    var L2 = (b.y2 - yb - 4) / Math.cos(i);
    K.ray(c, Xx, yb, Xx + L2 * Math.sin(i), yb + L2 * Math.cos(i), Lc, lw);
    K.line(c, Ex, Ey, Ex + (T + L2 * Math.cos(i)) * Math.tan(i), b.y2, K.alpha(Lc, 0.55), 1.1, [5, 4]);
    K.line(c, Ex, yt - b.h * 0.2, Ex, yb, col, 1, [4, 4]); K.line(c, Xx, yt, Xx, yb + b.h * 0.2, col, 1, [4, 4]);
    if (i > 0.03) { K.angArc(c, Ex, Ey, b.h * 0.1, -PI / 2 - i, -PI / 2, col, 1, 'i', fs * 0.9); K.angArc(c, Ex, Ey, b.h * 0.12, PI / 2, PI / 2 - r, col, 1, 'r', fs * 0.9); }
    var d = T * Math.sin(i - r) / Math.cos(r);
    if (d > 4) {
      var px = Xx + L2 * 0.45 * Math.sin(i), py = yb + L2 * 0.45 * Math.cos(i), nx = Math.cos(i), ny = -Math.sin(i);
      K.arrow(c, px + nx * d * 0.5, py + ny * d * 0.5, px, py, C.a, 1, 6); K.arrow(c, px + nx * d * 0.5, py + ny * d * 0.5, px + nx * d, py + ny * d, C.a, 1, 6);
      K.txt(c, 'd', px + nx * d * 0.5 + fs * 0.6, py + ny * d * 0.5 + fs * 0.6, { c: C.a, s: fs, i: true });
    }
    c.restore();
    K.txt(c, '出射光与入射光平行，侧移 d = ' + (T > 0 ? (d / T).toFixed(2) : 0) + '·厚度', b.x1 + 4, b.y1 + fs * 0.7, { c: col, s: fs * 0.85, al: 'left', ui: true });
  }
});

/* ---------- 半圆形玻璃砖（临界角 / 全反射） ---------- */
K.reg({
  key: 'pm_semiglass', cat: 'optics', label: '半圆玻璃砖', params: ['qInc', 'qN'],
  icon: '<path d="M3 8h18a9 9 0 0 1-18 0z"/><path d="M6 17l6-9 5-6"/><path d="M12 8v-6" stroke-dasharray="1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 70 || b.h < 60) return;
    var i = Math.min(K.v(o, 'qInc'), 89) * D2R, n = K.v(o, 'qN'), col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.05), Lc = C.light;
    var R = Math.min(b.w * 0.36, b.h * 0.56), Ox = b.x1 + b.w / 2, Oy = b.y1 + b.h * 0.36;
    c.save(); c.beginPath(); c.moveTo(Ox - R, Oy); c.lineTo(Ox + R, Oy); c.arc(Ox, Oy, R, 0, PI); c.closePath();
    c.fillStyle = K.alpha(C.glass, 0.16); c.fill(); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); c.restore();
    K.line(c, Ox, b.y1 + 4, Ox, Oy + R, col, 1, [5, 4]);
    var Cc = Math.asin(1 / n), tir = i >= Cc, si = Math.sin(i), ci = Math.cos(i);
    clipBox(c, b);
    K.ray(c, Ox - si * R * 1.5, Oy + ci * R * 1.5, Ox - si * R, Oy + ci * R, Lc, lw, null, true);
    K.ray(c, Ox - si * R, Oy + ci * R, Ox, Oy, Lc, lw);
    var ra = tir ? 1 : 0.35;
    K.ray(c, Ox, Oy, Ox + si * R, Oy + ci * R, K.alpha(Lc, ra), tir ? lw : 1.2);
    K.line(c, Ox + si * R, Oy + ci * R, Ox + si * R * 1.5, Oy + ci * R * 1.5, K.alpha(Lc, ra), tir ? lw : 1.2);
    if (!tir) {
      var r = Math.asin(n * si);
      K.ray(c, Ox, Oy, Ox + Math.sin(r) * R * 1.2, Oy - Math.cos(r) * R * 1.2, Lc, lw);
      if (r > 0.02) K.angArc(c, Ox, Oy, R * 0.3, -PI / 2, -PI / 2 + r, col, 1, 'r', fs);
    }
    c.restore();
    if (i > 0.02) K.angArc(c, Ox, Oy, R * 0.26, PI / 2, PI / 2 + i, col, 1, 'i', fs);
    K.txt(c, 'O', Ox - fs * 0.8, Oy - fs * 0.6, { c: col, s: fs, i: true });
    K.txt(c, '光沿半径射向圆心，在弧面不偏折', b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.75, al: 'left', ui: true });
    K.txt(c, (tir ? '全反射：' : '折射：') + 'i = ' + deg(i) + '，C = arcsin(1/n) = ' + deg(Cc), b.x1 + 4, b.y1 + fs * 0.7,
      { c: tir ? C.F : col, s: fs * 0.85, al: 'left', ui: true });
  }
});

/* ---------- 光的偏振（马吕斯定律，动画） ---------- */
K.P('qPolTh', { label: '检偏器初始角', min: 0, max: 180, step: 1, def: 0, unit: '°' });
K.reg({
  key: 'pm_polarizer', cat: 'optics', label: '光的偏振', animatable: true, params: ['qPolTh'],
  icon: '<path d="M1 12h22"/><ellipse cx="8" cy="12" rx="1.6" ry="7"/><ellipse cx="16" cy="12" rx="1.6" ry="7"/><path d="M8 6v12"/><path d="M14.8 7.5l2.4 9"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 120 || b.h < 60) return;
    var col = o.color, lw = K.lw(o), fs = K.fs(b.h, 0.07), Lc = C.light;
    var th = (K.v(o, 'qPolTh') + 40 * K.t(o)) * D2R, I = Math.pow(Math.cos(th), 2);
    var cy = b.y1 + b.h * 0.5, xs = b.x1 + b.w * 0.06, xP = b.x1 + b.w * 0.34, xQ = b.x1 + b.w * 0.62, xe = b.x1 + b.w * 0.9;
    var ry = b.h * 0.3, rx = Math.max(5, b.w * 0.022), bh = b.h * 0.08;
    K.box(c, xs, cy - bh / 2, xQ - xs, bh, null, 0, K.alpha(Lc, 0.28));
    K.box(c, xQ, cy - bh / 2, xe - xQ, bh, null, 0, K.alpha(Lc, 0.05 + 0.4 * I));
    K.dot(c, xs, cy, Math.max(5, b.h * 0.04), Lc);
    var sym = function (x, ang, len, al) {
      var dx = Math.sin(ang) * len * 0.45, dy = -Math.cos(ang) * len;
      K.arrow(c, x, cy, x + dx, cy + dy, al, 1.3, 6); K.arrow(c, x, cy, x - dx, cy - dy, al, 1.3, 6);
    };
    for (var k = 0; k < 2; k++) { var x = xs + (xP - xs) * (0.38 + k * 0.32); for (var a = 0; a < 4; a++) sym(x, a * PI / 4, ry * 0.45, K.alpha(Lc, 0.9)); }
    sym((xP + xQ) / 2, 0, ry * 0.6, Lc);
    if (I > 0.01) sym((xQ + xe) / 2, th, ry * 0.6 * Math.abs(Math.cos(th)), Lc);
    var disk = function (x, ang, lab) {
      c.save(); c.beginPath(); c.ellipse(x, cy, rx, ry, 0, 0, PI * 2); c.fillStyle = K.alpha(col, 0.08); c.fill();
      c.strokeStyle = col; c.lineWidth = lw * 0.8; c.stroke(); c.restore();
      K.line(c, x - rx * Math.sin(ang), cy + ry * Math.cos(ang), x + rx * Math.sin(ang), cy - ry * Math.cos(ang), C.F, 2);
      K.txt(c, lab, x, cy + ry + fs * 0.9, { c: col, s: fs * 0.85, ui: true });
    };
    disk(xP, 0, '起偏器 P'); disk(xQ, th, '检偏器 Q');
    K.box(c, xe, cy - ry * 0.8, b.w * 0.05, ry * 1.6, col, lw * 0.8, K.alpha(Lc, 0.08 + 0.75 * I), 3);
    K.txt(c, '自然光', (xs + xP) / 2, cy - ry - fs * 0.3, { c: col, s: fs * 0.8, ui: true });
    K.txt(c, '线偏振光', (xP + xQ) / 2, cy - ry - fs * 0.3, { c: col, s: fs * 0.8, ui: true });
    var thd = K.mod(th / D2R, 180);
    K.txt(c, 'I = I₀cos²θ    θ = ' + thd.toFixed(0) + '°    I/I₀ = ' + I.toFixed(2), b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.85, al: 'left', i: true });
  }
});
})();

/* ===================== 扩展 · 热学 ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI, TAU = PI * 2;
/* 速率着色：慢蓝 → 快红 */
var spd = function (v) { var h = 220 - 220 * K.clamp(v, 0, 1); return 'hsl(' + h.toFixed(0) + ',85%,58%)'; };
/* 预生成分子：位置、三维麦克斯韦速度在平面上的投影 */
var mols = function (n, seed) {
  var r = K.rng(seed), a = [];
  for (var i = 0; i < n; i++) {
    var vx = K.gauss(r), vy = K.gauss(r), vz = K.gauss(r);
    a.push({ x: r(), y: r(), vx: vx, vy: vy, s: Math.sqrt(vx * vx + vy * vy + vz * vz) });
  }
  return a;
};

/* ---------- 气体分子热运动（动画） ---------- */
K.P('qTemp', { label: '温度T', min: 50, max: 1200, step: 10, def: 300, unit: 'K' });
K.P('qNum', { label: '分子数', min: 10, max: 300, step: 10, def: 80 });
K.reg({
  key: 'pm_gas', cat: 'thermo', label: '气体分子热运动', animatable: true, params: ['qTemp', 'qNum'],
  icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.4"/><circle cx="15" cy="10" r="1.4"/><circle cx="10" cy="16" r="1.4"/><path d="M15 10l3-2M10 16l-3 2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 40 || b.h < 40) return;
    var T = K.v(o, 'qTemp'), N = K.v(o, 'qNum'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var pad = 3, x0 = b.x1 + pad, y0 = b.y1 + pad, W = b.w - 2 * pad, H = b.h - 2 * pad - fs * 1.6;
    K.box(c, x0, y0, W, H, col, lw * 1.2, K.alpha(col, 0.04), 4);
    var M = K.memo(o, 'gas' + N, function () { return mols(N, 1234 + N); });
    var r = K.clamp(S * 0.012, 2, 6), k = Math.sqrt(T / 300) * S * 0.12, t = K.t(o);
    for (var i = 0; i < M.length; i++) {
      var m = M[i], px = x0 + r + (W - 2 * r) * K.tri(m.x + m.vx * k * t / (W - 2 * r)), py = y0 + r + (H - 2 * r) * K.tri(m.y + m.vy * k * t / (H - 2 * r));
      K.dot(c, px, py, r, spd(m.s / 3.2));
    }
    K.txt(c, 'T = ' + T + ' K    温度越高，分子平均动能越大（颜色：蓝慢 → 红快）', b.x1 + 2, b.y2 - fs * 0.6,
      { c: col, s: fs * 0.8, al: 'left', ui: true });
  }
});

/* ---------- 布朗运动（动画） ---------- */
K.P('qBrownN', { label: '微粒数', min: 1, max: 5, step: 1, def: 3 });
K.reg({
  key: 'pm_brown', cat: 'thermo', label: '布朗运动', animatable: true, params: ['qBrownN', 'qTemp'],
  icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M6 15l3-6 3 4 2-7 2 9 3-3"/><circle cx="19" cy="12" r="1.6"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 50 || b.h < 50) return;
    var n = K.v(o, 'qBrownN'), T = K.v(o, 'qTemp'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var x0 = b.x1 + 3, y0 = b.y1 + 3, W = b.w - 6, H = b.h - 6 - fs * 1.6, t = K.t(o), dt = 0.5, NS = 240;
    K.box(c, x0, y0, W, H, col, lw, K.alpha(C.gas, 0.06), 4);
    var bg = K.memo(o, 'bgm', function () { return mols(70, 99); });
    for (var j = 0; j < bg.length; j++) {
      var m = bg[j], q = S * 0.5 * t;
      K.dot(c, x0 + W * K.tri(m.x + m.vx * q / W), y0 + H * K.tri(m.y + m.vy * q / H), 1.2, K.alpha(col, 0.25));
    }
    var tr = K.memo(o, 'br' + n, function () {
      var r = K.rng(777), all = [];
      for (var p = 0; p < n; p++) { var x = 0.2 + 0.6 * r(), y = 0.2 + 0.6 * r(), s = [[x, y]];
        for (var k = 0; k < NS; k++) { x = K.tri(x + K.gauss(r) * 0.035); y = K.tri(y + K.gauss(r) * 0.035); s.push([x, y]); }
        all.push(s); }
      return all;
    });
    var amp = Math.sqrt(T / 300), steps = K.mod(t / dt, NS), ks = Math.floor(steps), f = steps - ks;
    var cols = ['#f59e0b', '#ef4444', '#22c55e', '#a855f7', '#38bdf8'];
    tr.forEach(function (s, p) {
      var map = function (q) { return [x0 + 10 + (W - 20) * K.tri(0.5 + (q[0] - 0.5) * amp), y0 + 10 + (H - 20) * K.tri(0.5 + (q[1] - 0.5) * amp)]; };
      var pts = []; for (var k = 0; k <= ks; k++) pts.push(map(s[k]));
      var a = map(s[ks]), bb = map(s[Math.min(NS, ks + 1)]), cur = [a[0] + (bb[0] - a[0]) * f, a[1] + (bb[1] - a[1]) * f];
      K.poly(c, pts, K.alpha(cols[p], 0.75), 1.2);
      for (var k2 = 0; k2 <= ks; k2++) K.dot(c, pts[k2][0], pts[k2][1], 1.8, cols[p]);
      K.circ(c, cur[0], cur[1], K.clamp(S * 0.022, 4, 10), cols[p], 1.2, K.alpha(cols[p], 0.5));
    });
    K.txt(c, '每隔相同时间记录微粒位置并连线（连线不是运动轨迹）', b.x1 + 2, b.y2 - fs * 0.6, { c: col, s: fs * 0.78, al: 'left', ui: true });
  }
});

/* ---------- 气缸活塞 · 气体状态变化（动画 + p-V 图） ---------- */
K.sel('qProc', '过程', ['等温过程', '等压过程', '等容过程', '绝热过程'], 0);
var procState = function (pr, s) {
  if (pr === 0) { var V = 1 + 0.3 * s; return { V: V, p: 1 / V, T: 1 }; }
  if (pr === 1) { var V1 = 1 + 0.3 * s; return { V: V1, p: 1, T: V1 }; }
  if (pr === 2) { var T2 = 1 + 0.3 * s; return { V: 1, p: T2, T: T2 }; }
  var V3 = 1 + 0.3 * s; return { V: V3, p: Math.pow(V3, -1.4), T: Math.pow(V3, -0.4) };
};
K.reg({
  key: 'pm_cylinder', cat: 'thermo', label: '气缸·状态变化', animatable: true, params: ['qProc'],
  icon: '<path d="M4 4v16h9V4"/><rect x="4" y="9" width="9" height="2.5"/><path d="M8.5 9V2"/><path d="M15 19V8M15 19h7"/><path d="M16 10q2 6 6 7"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 120 || b.h < 80) return;
    var pr = K.v(o, 'qProc'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05), t = K.t(o), P = 4;
    var st = procState(pr, Math.sin(TAU * t / P)), ds = Math.cos(TAU * t / P);
    var phiAt = function (tt) { var n = 48, h = tt / n, sum = 0; for (var i = 0; i <= n; i++) { var w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2); sum += w * Math.sqrt(procState(pr, Math.sin(TAU * i * h / P)).T); } return sum * h / 3; };
    var Phi = Math.floor(t / P) * phiAt(P) + phiAt(K.mod(t, P));
    var cw = b.w * 0.26, xL = b.x1 + b.w * 0.06, xR = xL + cw, yb = b.y2 - fs * 2.6, Hc = b.h * 0.7, H0 = Hc * 0.55, hg = H0 * st.V;
    var wall = pr === 3 ? 6 : 2;
    c.save(); c.strokeStyle = col; c.lineWidth = lw * 1.2; c.beginPath();
    c.moveTo(xL, yb - Hc); c.lineTo(xL, yb); c.lineTo(xR, yb); c.lineTo(xR, yb - Hc); c.stroke(); c.restore();
    if (pr === 3) { K.hatch(c, xL - 2, yb - Hc, xL - 2, yb, col, 1, 7, 1); K.hatch(c, xR + 2, yb, xR + 2, yb - Hc, col, 1, 7, 1); K.hatch(c, xL, yb + 2, xR, yb + 2, col, 1, 7, 1); }
    K.box(c, xL + 1, yb - hg, cw - 2, hg, null, 0, K.alpha(C.gas, 0.08 + 0.12 * (st.T - 0.7)));
    var M = K.memo(o, 'cyl', function () { return mols(46, 4242); }), r = K.clamp(S * 0.011, 2, 5), k = S * 0.12;
    for (var i = 0; i < M.length; i++) {
      var m = M[i];
      K.dot(c, xL + wall + r + (cw - 2 * wall - 2 * r) * K.tri(m.x + m.vx * k * Phi / cw), yb - r - (hg - 2 * r) * K.tri(m.y + m.vy * k * Phi / H0), r, spd(m.s * Math.sqrt(st.T) / 3.4));
    }
    var pt = Hc * 0.07, py = yb - hg - pt;
    K.box(c, xL + 1, py, cw - 2, pt, col, lw, K.alpha(col, 0.35), 2);
    K.line(c, xL + cw / 2, py, xL + cw / 2, yb - Hc - b.h * 0.08, col, lw * 1.4);
    if (pr === 2) { K.box(c, xL - 6, py - 6, 10, 6, col, 1, C.F); K.box(c, xR - 4, py - 6, 10, 6, col, 1, C.F); K.txt(c, '卡销固定', xR + 12, py - 3, { c: C.F, s: fs * 0.75, al: 'left', ui: true }); }
    var heat = pr === 1 || pr === 2 ? ds : (pr === 0 ? ds : 0);
    if (pr !== 3 && Math.abs(heat) > 0.08) {
      var hc = heat > 0 ? '#f97316' : '#38bdf8', fy = yb + 4;
      for (var q = 0; q < 4; q++) { var fx = xL + cw * (0.2 + q * 0.2), fh = fs * 1.3 * Math.abs(heat);
        K.poly(c, [[fx - fs * 0.35, fy + fh], [fx, fy], [fx + fs * 0.35, fy + fh]], null, 0, null, true, K.alpha(hc, 0.75)); }
      K.txt(c, heat > 0 ? '吸热' : '放热', xL + cw / 2, yb + fs * 2.1, { c: hc, s: fs * 0.85, ui: true });
    }
    var gx = b.x1 + b.w * 0.44, gw = b.w * 0.54, gh = b.h * 0.72;
    var A = K.mini(c, gx, b.y1 + 2, gw, gh, { xmin: 0, xmax: 1.45, ymin: 0, ymax: 1.85, xl: 'V', yl: 'p', col: col, fs: fs * 0.85, lw: 1 });
    if (pr === 3) K.plot(c, A, function (v) { return 1 / v; }, 0.6, 1.4, K.alpha(col, 0.4), 1, [4, 4]);
    if (pr === 2) K.line(c, A.X(1), A.Y(0.7), A.X(1), A.Y(1.3), C.a, 2);
    else K.plot(c, A, function (v) { return procState(pr, (v - 1) / 0.3).p; }, 0.7, 1.3, C.a, 2);
    K.dot(c, A.X(st.V), A.Y(st.p), Math.max(3.5, lw * 1.5), C.F);
    K.guide(c, A, st.V, st.p, K.alpha(col, 0.5), 1);
    if (pr === 3) K.txt(c, '虚线：等温线', A.X1, A.Y0 + fs * 0.4, { c: col, s: fs * 0.7, al: 'right', ui: true });
    var law = ['ΔU = 0，Q = −W', 'W = −pΔV，Q = ΔU − W', 'W = 0，ΔU = Q', 'Q = 0，ΔU = W'][pr];
    K.lines(c, ['p = ' + st.p.toFixed(2) + 'p₀   V = ' + st.V.toFixed(2) + 'V₀   T = ' + st.T.toFixed(2) + 'T₀', law + '    pV/T = 常量'],
      gx, b.y1 + gh + fs * 0.5, col, fs * 0.82);
  }
});

/* ---------- 玻璃管 / U形管封闭气体 ---------- */
K.sel('qTube', '装置', ['开口向上', '开口向下', '水平放置', 'U形管'], 0);
K.P('qHg', { label: '水银柱 h', min: 2, max: 40, step: 1, def: 15, unit: 'cmHg' });
K.reg({
  key: 'pm_tube', cat: 'thermo', label: '液柱封闭气体', params: ['qTube', 'qHg'],
  icon: '<path d="M9 2v17a3 3 0 0 0 6 0V2"/><rect x="9.5" y="6" width="5" height="6" fill="currentColor" opacity=".45"/><circle cx="12" cy="16" r=".8"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 50 || b.h < 70) return;
    var md = K.v(o, 'qTube'), h = K.v(o, 'qHg'), col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.06), p0 = 76;
    var hgF = 'rgba(176,190,205,.85)', gasF = K.alpha(C.gas, 0.18), pc = b.h * 0.011, hp = h * pc;
    var tube = function (x1, y1, x2, y2, closedEnd) {
      var vert = Math.abs(x2 - x1) < Math.abs(y2 - y1), w = vert ? x2 - x1 : y2 - y1;
      c.save(); c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
      if (vert) { c.moveTo(x1, y1); c.lineTo(x1, y2); c.moveTo(x2, y1); c.lineTo(x2, y2);
        if (closedEnd === 'b') { c.moveTo(x1, y2); c.arc((x1 + x2) / 2, y2, w / 2, PI, 0, true); }
        if (closedEnd === 't') { c.moveTo(x1, y1); c.arc((x1 + x2) / 2, y1, w / 2, PI, 0, false); } }
      else { c.moveTo(x1, y1); c.lineTo(x2, y1); c.moveTo(x1, y2); c.lineTo(x2, y2);
        if (closedEnd === 'l') { c.moveTo(x1, y1); c.arc(x1, (y1 + y2) / 2, w / 2, -PI / 2, PI / 2, true); } }
      c.stroke(); c.restore();
    };
    var gasDots = function (x, y, w, hh) { var r = K.rng(5); for (var i = 0; i < 14; i++) K.dot(c, x + w * (0.15 + 0.7 * r()), y + hh * (0.1 + 0.8 * r()), 1.4, K.alpha(col, 0.6)); };
    var dim = function (x, ya, yb, lab) { K.arrow(c, x, (ya + yb) / 2, x, ya, C.a, 1, 6); K.arrow(c, x, (ya + yb) / 2, x, yb, C.a, 1, 6); K.txt(c, lab, x + fs * 0.6, (ya + yb) / 2, { c: C.a, s: fs, i: true, al: 'left' }); };
    var tw = K.clamp(b.w * 0.1, 12, 40), cx = b.x1 + b.w * 0.35, Lg = b.h * 0.24, pf;
    if (md === 0 || md === 1) {
      var top = b.y1 + fs, bot = b.y2 - tw;
      tube(cx - tw / 2, top, cx + tw / 2, bot, md === 0 ? 'b' : 't');
      if (md === 0) { K.box(c, cx - tw / 2, bot - Lg, tw, Lg, null, 0, gasF); gasDots(cx - tw / 2, bot - Lg, tw, Lg);
        K.box(c, cx - tw / 2, bot - Lg - hp, tw, hp, null, 0, hgF); dim(cx + tw, bot - Lg - hp, bot - Lg, 'h'); pf = 'p = p₀ + h = ' + (p0 + h) + ' cmHg'; }
      else { var gt = top + tw * 0.2; K.box(c, cx - tw / 2, gt, tw, Lg, null, 0, gasF); gasDots(cx - tw / 2, gt, tw, Lg);
        K.box(c, cx - tw / 2, gt + Lg, tw, hp, null, 0, hgF); dim(cx + tw, gt + Lg, gt + Lg + hp, 'h'); pf = 'p = p₀ − h = ' + (p0 - h) + ' cmHg'; }
    } else if (md === 2) {
      var y = b.y1 + b.h * 0.45, xl = b.x1 + tw, xr = b.x2 - fs, gl = b.w * 0.3;
      tube(xl, y - tw / 2, xr, y + tw / 2, 'l');
      K.box(c, xl, y - tw / 2, gl, tw, null, 0, gasF); gasDots(xl, y - tw / 2, gl, tw);
      K.box(c, xl + gl, y - tw / 2, Math.min(hp * 1.5, xr - xl - gl - 4), tw, null, 0, hgF);
      pf = 'p = p₀ = ' + p0 + ' cmHg（水平：液柱不产生附加压强）';
    } else {
      var xa = b.x1 + b.w * 0.25, xb2 = b.x1 + b.w * 0.25 + Math.min(b.w * 0.37, b.h * 0.34), bt = b.y2 - fs * 2.2 - ((xb2 - xa) / 2 + tw / 2), tp = b.y1 + fs;
      c.save(); c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
      c.moveTo(xa - tw / 2, tp); c.lineTo(xa - tw / 2, bt); c.arc((xa + xb2) / 2, bt, (xb2 - xa) / 2 + tw / 2, PI, 0, true); c.lineTo(xb2 + tw / 2, tp);
      c.moveTo(xa + tw / 2, tp); c.lineTo(xa + tw / 2, bt); c.arc((xa + xb2) / 2, bt, (xb2 - xa) / 2 - tw / 2, PI, 0, true); c.lineTo(xb2 - tw / 2, tp);
      c.moveTo(xa - tw / 2, tp); c.arc(xa, tp, tw / 2, PI, 0, false); c.stroke(); c.restore();
      var yl = tp + Lg + tw * 0.4, yr = yl - hp;
      K.box(c, xa - tw / 2, tp, tw, yl - tp, null, 0, gasF); gasDots(xa - tw / 2, tp, tw, yl - tp);
      c.save(); c.fillStyle = hgF; c.beginPath(); c.moveTo(xa - tw / 2, yl); c.lineTo(xa - tw / 2, bt); c.arc((xa + xb2) / 2, bt, (xb2 - xa) / 2 + tw / 2, PI, 0, true);
      c.lineTo(xb2 + tw / 2, yr); c.lineTo(xb2 - tw / 2, yr); c.lineTo(xb2 - tw / 2, bt); c.arc((xa + xb2) / 2, bt, (xb2 - xa) / 2 - tw / 2, 0, PI, false); c.lineTo(xa + tw / 2, yl); c.closePath(); c.fill(); c.restore();
      K.line(c, xa + tw / 2, yl, xb2 + tw * 1.2, yl, K.alpha(col, 0.6), 1, [4, 4]);
      dim(xb2 + tw * 1.1, yr, yl, 'h'); pf = 'p = p₀ + h = ' + (p0 + h) + ' cmHg';
    }
    K.txt(c, pf, b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.85, al: 'left', ui: true });
    K.txt(c, 'p₀ = 76 cmHg', b.x2 - 4, b.y1 + fs * 0.7, { c: col, s: fs * 0.8, al: 'right', ui: true });
  }
});

/* ---------- 油膜法估测分子直径 ---------- */
K.P('qOilSeed', { label: '油膜形状', min: 1, max: 20, step: 1, def: 3 });
K.reg({
  key: 'pm_oilfilm', cat: 'thermo', label: '油膜法测分子直径', params: ['qOilSeed'],
  icon: '<rect x="2" y="2" width="20" height="20" rx="1"/><path d="M2 8h20M2 14h20M8 2v20M14 2v20" opacity=".4"/><path d="M7 9q3-4 8-1t1 7-8 1-1-7z"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 60) return;
    var col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.05), seed = K.v(o, 'qOilSeed');
    var Hh = b.h - fs * 2, S = Math.min(b.w, Hh), n = 16, g = S / n, x0 = b.x1 + (b.w - S) / 2, y0 = b.y1;
    K.box(c, x0, y0, S, S, col, lw, K.alpha(C.gas, 0.08));
    for (var i = 1; i < n; i++) { K.line(c, x0 + i * g, y0, x0 + i * g, y0 + S, K.alpha(col, 0.22), 1); K.line(c, x0, y0 + i * g, x0 + S, y0 + i * g, K.alpha(col, 0.22), 1); }
    var co = K.memo(o, 'oil' + seed, function () { var r = K.rng(seed * 97 + 3), a = []; for (var k = 2; k <= 6; k++) a.push([k, (r() - 0.5) * 0.36 / k * 2, r() * TAU]); return a; });
    var cx = x0 + S / 2, cy = y0 + S / 2, R0 = S * 0.3;
    var rad = function (th) { var v = 1; co.forEach(function (q) { v += q[1] * Math.cos(q[0] * th + q[2]); }); return R0 * v; };
    c.save(); c.beginPath();
    for (var j = 0; j <= 180; j++) { var th = j / 180 * TAU, rr = rad(th), px = cx + rr * Math.cos(th), py = cy + rr * Math.sin(th); j ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.closePath(); c.fillStyle = 'rgba(245,158,11,.28)'; c.fill(); c.strokeStyle = C.a; c.lineWidth = lw; c.stroke(); c.restore();
    var cnt = 0;
    for (var ix = 0; ix < n; ix++) for (var iy = 0; iy < n; iy++) {
      var mx = x0 + (ix + 0.5) * g - cx, my = y0 + (iy + 0.5) * g - cy;
      if (Math.hypot(mx, my) < rad(Math.atan2(my, mx))) { cnt++; K.dot(c, mx + cx, my + cy, 1.6, K.alpha(C.F, 0.8)); }
    }
    K.txt(c, '数格：不足半格舍去、多于半格算一格 → N = ' + cnt + ' 格；d = V/S', b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.8, al: 'left', ui: true });
  }
});

/* ---------- 热机 / 制冷机能量流 ---------- */
K.sel('qEngine', '类型', ['热机', '制冷机（热泵）'], 0);
K.reg({
  key: 'pm_engine', cat: 'thermo', label: '热机·制冷机', params: ['qEngine'],
  icon: '<rect x="5" y="2" width="14" height="4" rx="1"/><rect x="5" y="18" width="14" height="4" rx="1"/><circle cx="12" cy="12" r="3"/><path d="M12 6v3M12 15v3M15 12h6"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 80) return;
    var fr = K.v(o, 'qEngine') === 1, col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.055);
    var cx = b.x1 + b.w * 0.42, bw = b.w * 0.6, bh = b.h * 0.16;
    K.box(c, cx - bw / 2, b.y1 + 2, bw, bh, '#ef4444', lw, 'rgba(239,68,68,.15)', 6);
    K.box(c, cx - bw / 2, b.y2 - bh - 2, bw, bh, '#3b82f6', lw, 'rgba(59,130,246,.15)', 6);
    K.txt(c, '高温热源 T₁', cx, b.y1 + 2 + bh / 2, { c: col, s: fs, ui: true });
    K.txt(c, '低温热源 T₂', cx, b.y2 - 2 - bh / 2, { c: col, s: fs, ui: true });
    var R = Math.min(b.h * 0.16, b.w * 0.14), cy = b.y1 + b.h / 2;
    K.circ(c, cx, cy, R, col, lw, K.alpha(col, 0.1)); K.txt(c, fr ? '制冷机' : '热机', cx, cy, { c: col, s: fs * 0.9, ui: true });
    var y1 = b.y1 + bh + 4, y2 = cy - R, y3 = cy + R, y4 = b.y2 - bh - 4, w = lw * 2.2;
    if (!fr) { K.arrow(c, cx, y1, cx, y2, C.F, w); K.arrow(c, cx, y3, cx, y4, C.B, w); K.arrow(c, cx + R, cy, b.x2 - fs * 2, cy, C.a, w); }
    else { K.arrow(c, cx, y2, cx, y1, C.F, w); K.arrow(c, cx, y4, cx, y3, C.B, w); K.arrow(c, b.x2 - fs * 2, cy, cx + R, cy, C.a, w); }
    K.txt(c, 'Q₁', cx + fs * 1.2, (y1 + y2) / 2, { c: C.F, s: fs, i: true }); K.txt(c, 'Q₂', cx + fs * 1.2, (y3 + y4) / 2, { c: C.B, s: fs, i: true });
    K.txt(c, 'W', (cx + R + b.x2) / 2, cy - fs * 0.9, { c: C.a, s: fs, i: true });
    K.lines(c, fr ? ['Q₁ = Q₂ + W', '热量不能自发地', '从低温传到高温'] : ['Q₁ = W + Q₂', 'η = W/Q₁ < 1', '第二类永动机不可能'], b.x2 - b.w * 0.28, b.y1 + bh + fs, col, fs * 0.8);
  }
});
})();

/* ===================== 扩展 · 电磁（场的计算模型） ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI, TAU = PI * 2;

/* ---------- 通电直导线的磁场（安培定则） ---------- */
K.sel('qWireView', '视图', ['截面图', '立体图'], 0);
K.sel('qWireI', '电流方向', ['向外 ⊙ / 向上', '向里 ⊗ / 向下'], 0);
K.reg({
  key: 'pm_wire_field', cat: 'em', label: '直导线的磁场', params: ['qWireView', 'qWireI'],
  icon: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="9.5"/><path d="M10 2.6l-2 0 1.4-1.4"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 50 || b.h < 50) return;
    var v3 = K.v(o, 'qWireView') === 1, out = K.v(o, 'qWireI') === 0, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2, Bc = C.B, hs = Math.max(7, lw * 3);
    if (!v3) {
      var r0 = S * 0.045;
      for (var r = r0 * 2.3, k = 0; r < S * 0.49; r *= 1.45, k++) {
        K.circ(c, cx, cy, r, K.alpha(Bc, 0.85), 1.3);
        for (var q = 0; q < 4; q++) { var a = -PI / 2 + q * PI / 2 + k * 0.4, sg = out ? 1 : -1;
          K.head(c, cx + r * Math.cos(a), cy + r * Math.sin(a), sg * Math.sin(a), -sg * Math.cos(a), hs, Bc); }
      }
      K.wireSym(c, cx, cy, r0, out, col, lw);
      K.txt(c, out ? '电流垂直纸面向外：磁感线逆时针' : '电流垂直纸面向里：磁感线顺时针', b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.8, al: 'left', ui: true });
    } else {
      var pw = b.w * 0.42, ph = b.h * 0.18;
      K.poly(c, [[cx - pw + ph, cy - ph], [cx + pw + ph, cy - ph], [cx + pw - ph, cy + ph], [cx - pw - ph, cy + ph]], K.alpha(col, 0.5), 1, null, true, K.alpha(col, 0.05));
      for (var j = 1; j <= 3; j++) {
        var rx = pw * 0.27 * j, ry = rx * 0.32;
        c.save(); c.strokeStyle = K.alpha(Bc, 0.85); c.lineWidth = 1.3; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.stroke(); c.restore();
        [PI / 2, -PI / 2].forEach(function (a) { var sg = out ? 1 : -1, tx = sg * rx * Math.sin(a), ty = -sg * ry * Math.cos(a), L = Math.hypot(tx, ty);
          K.head(c, cx + rx * Math.cos(a), cy + ry * Math.sin(a), tx / L, ty / L, hs, Bc); });
      }
      K.line(c, cx, b.y1 + 4, cx, b.y2 - 4, col, lw * 1.6);
      var ya = cy - b.h * 0.2, yb = cy - b.h * 0.42, ox = cx + lw * 2 + 6;
      K.arrow(c, ox, out ? ya : yb, ox, out ? yb : ya, C.I, lw * 1.2, 10);
      K.txt(c, 'I', ox + fs * 0.7, (ya + yb) / 2, { c: C.I, s: fs, i: true });
      K.txt(c, '右手握住导线，拇指指向电流，四指弯曲方向即磁感线方向', b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.75, al: 'left', ui: true });
    }
  }
});

/* ---------- 螺线管 / 环形电流 / 条形磁铁 的磁感线（毕奥-萨伐尔叠加，数值追踪） ---------- */
K.sel('qSolMode', '对象', ['通电螺线管（纵截面）', '环形电流（截面）', '条形磁铁'], 0);
K.sel('qSolDir', '电流/磁极', ['方向一', '方向二（反向）'], 0);
var solField = function (mode, s) {
  var n = mode === 1 ? 1 : 14, l = mode === 1 ? 0 : 1.6, a = mode === 1 ? 0.42 : 0.3, W = [];
  for (var i = 0; i < n; i++) { var x = n === 1 ? 0 : -l / 2 + l * (i + 0.5) / n; W.push([x, a, s], [x, -a, -s]); }
  return { W: W, l: l, a: a, f: function (x, y) {
    var bx = 0, by = 0;
    for (var k = 0; k < W.length; k++) { var dx = x - W[k][0], dy = y - W[k][1], r2 = dx * dx + dy * dy + 1e-5; bx += -W[k][2] * dy / r2; by += W[k][2] * dx / r2; }
    return [bx, by]; } };
};
K.reg({
  key: 'pm_solenoid', cat: 'em', label: '螺线管·磁铁磁感线', params: ['qSolMode', 'qSolDir'],
  icon: '<rect x="6" y="9" width="12" height="6" rx="1"/><path d="M2 12h4M18 12h4"/><path d="M6 9Q12 0 18 9M6 15q6 9 12 0"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 60) return;
    var mode = K.v(o, 'qSolMode'), s = K.v(o, 'qSolDir') === 0 ? 1 : -1, col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.05);
    var Xd = 1.75, Yd = 1.15, sc = Math.min(b.w / (2 * Xd), b.h / (2 * Yd)), cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    var F = solField(mode, s), X = function (x) { return cx + x * sc; }, Y = function (y) { return cy - y * sc; };
    var lines = K.memo(o, 'sol' + mode + s, function () {
      var out = [], m = mode === 1 ? 7 : 7, stop = function (x, y) {
        if (Math.abs(x) > Xd * 1.25 || Math.abs(y) > Yd * 1.25) return true;
        for (var k = 0; k < F.W.length; k++) if (Math.hypot(x - F.W[k][0], y - F.W[k][1]) < 0.035) return true;
        return false; };
      for (var j = 0; j < m; j++) {
        var y0 = -F.a * 0.86 + 1.72 * F.a * (j + 0.5) / m, p = K.trace(F.f, 0, y0, 0.012, 2600, stop, 1);
        if (!p.closed) { var q = K.trace(F.f, 0, y0, 0.012, 2600, stop, -1); p = q.reverse().concat(p.slice(1)); }
        out.push(p);
      }
      return out;
    });
    c.save(); c.beginPath(); c.rect(b.x1, b.y1, b.w, b.h); c.clip();
    lines.forEach(function (p) {
      var sp = p.map(function (q) { return [X(q[0]), Y(q[1])]; });
      K.poly(c, sp, K.alpha(C.B, 0.85), 1.3);
      K.polyArrows(c, sp, Math.max(60, sc * 0.7), C.B, Math.max(7, lw * 2.8));
    });
    c.restore();
    var Bx = F.f(0, 0)[0], right = Bx > 0;
    if (mode === 2) {
      var hw = F.l / 2 * sc, hh = F.a * sc * 1.05;
      K.box(c, cx - hw, cy - hh, hw, hh * 2, col, lw, right ? 'rgba(59,130,246,.75)' : 'rgba(239,68,68,.75)', 3);
      K.box(c, cx, cy - hh, hw, hh * 2, col, lw, right ? 'rgba(239,68,68,.75)' : 'rgba(59,130,246,.75)', 3);
      K.txt(c, right ? 'S' : 'N', cx - hw / 2, cy, { c: '#fff', s: fs * 1.3, b: true, ui: true });
      K.txt(c, right ? 'N' : 'S', cx + hw / 2, cy, { c: '#fff', s: fs * 1.3, b: true, ui: true });
    } else {
      var r = Math.max(5, sc * 0.045);
      F.W.forEach(function (w) { K.wireSym(c, X(w[0]), Y(w[1]), r, w[2] > 0, col, 1.2); });
      if (mode === 0) {
        K.box(c, X(-F.l / 2) - r, Y(F.a) - r * 1.4, F.l * sc + 2 * r, 2 * F.a * sc + r * 2.8, K.alpha(col, 0.35), 1, null, 4);
        K.txt(c, right ? 'S' : 'N', X(-F.l / 2) - r * 3.2, cy - fs * 1.2, { c: col, s: fs * 1.2, b: true, ui: true });
        K.txt(c, right ? 'N' : 'S', X(F.l / 2) + r * 3.2, cy - fs * 1.2, { c: col, s: fs * 1.2, b: true, ui: true });
      }
    }
    K.txt(c, mode === 2 ? '磁体外部 N → S，内部 S → N，磁感线闭合' : '⊙ 电流向外  ⊗ 电流向里   内部磁场近似匀强', b.x1 + 4, b.y2 - fs * 0.6,
      { c: col, s: fs * 0.78, al: 'left', ui: true });
  }
});

/* ---------- 电场线与等势面（库仑场叠加 + 行进方格法等值线） ---------- */
K.sel('qEqMode', '电荷分布', ['正点电荷', '等量异种电荷', '等量同种电荷', '点电荷与金属板'], 1);
K.tog('qEqLines', '显示电场线', true);
var EQ = function (mode) {
  var Q = mode === 0 ? [[0, 0, 1]] : mode === 1 ? [[-0.8, 0, 1], [0.8, 0, -1]] : mode === 2 ? [[-0.8, 0, 1], [0.8, 0, 1]] : [[0, 0.35, 1], [0, -1.55, -1]];
  var lev = mode === 0 ? [0.5, 0.7, 1, 1.5, 2.4] : mode === 1 ? [-1.6, -0.9, -0.5, -0.22, 0, 0.22, 0.5, 0.9, 1.6] : mode === 2 ? [0.85, 1.05, 1.3, 1.7, 2.4, 3.4] : [0.15, 0.3, 0.5, 0.8, 1.3, 2.2];
  return { Q: Q, lev: lev, plate: mode === 3 ? -0.6 : null,
    phi: function (x, y) { var s = 0; for (var i = 0; i < Q.length; i++) s += Q[i][2] / Math.max(1e-3, Math.hypot(x - Q[i][0], y - Q[i][1])); return s; },
    E: function (x, y) { var ex = 0, ey = 0; for (var i = 0; i < Q.length; i++) { var dx = x - Q[i][0], dy = y - Q[i][1], r = Math.max(1e-3, Math.hypot(dx, dy)), k = Q[i][2] / (r * r * r); ex += k * dx; ey += k * dy; } return [ex, ey]; } };
};
var contours = function (fn, x0, x1, y0, y1, nx, ny, levels) {
  var G = [], dx = (x1 - x0) / nx, dy = (y1 - y0) / ny, res = [];
  for (var j = 0; j <= ny; j++) { G.push([]); for (var i = 0; i <= nx; i++) G[j].push(fn(x0 + i * dx, y0 + j * dy)); }
  levels.forEach(function (L) {
    var segs = [], ends = {};
    var pt = function (i, j, h) {
      var a = G[j][i], b2 = h ? G[j][i + 1] : G[j + 1][i], u = (L - a) / (b2 - a);
      return { id: (h ? 'h' : 'v') + i + '_' + j, p: h ? [x0 + (i + u) * dx, y0 + j * dy] : [x0 + i * dx, y0 + (j + u) * dy] };
    };
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
      var v = [G[j][i], G[j][i + 1], G[j + 1][i + 1], G[j + 1][i]];
      if (v.some(function (q) { return !isFinite(q) || Math.abs(q) > 50; })) continue;
      var e = [];
      if ((v[0] > L) !== (v[1] > L)) e.push(pt(i, j, true));
      if ((v[1] > L) !== (v[2] > L)) e.push(pt(i + 1, j, false));
      if ((v[3] > L) !== (v[2] > L)) e.push(pt(i, j + 1, true));
      if ((v[0] > L) !== (v[3] > L)) e.push(pt(i, j, false));
      for (var k = 0; k + 1 < e.length; k += 2) { var sI = segs.length; segs.push([e[k], e[k + 1]]); (ends[e[k].id] = ends[e[k].id] || []).push(sI); (ends[e[k + 1].id] = ends[e[k + 1].id] || []).push(sI); }
    }
    var used = new Array(segs.length);
    for (var s0 = 0; s0 < segs.length; s0++) {
      if (used[s0]) continue; used[s0] = true;
      var chain = [segs[s0][0], segs[s0][1]];
      for (var dir = 0; dir < 2; dir++) {
        var guard = 0;
        while (guard++ < 5000) {
          var tail = chain[chain.length - 1], nx2 = (ends[tail.id] || []).filter(function (q) { return !used[q]; });
          if (!nx2.length) break; used[nx2[0]] = true;
          var sg = segs[nx2[0]]; chain.push(sg[0].id === tail.id ? sg[1] : sg[0]);
        }
        chain.reverse();
      }
      res.push(chain.map(function (q) { return q.p; }));
    }
  });
  return res;
};
K.reg({
  key: 'pm_equipotential', cat: 'em', label: '电场线·等势面', params: ['qEqMode', 'qEqLines'],
  icon: '<circle cx="7" cy="12" r="2"/><circle cx="17" cy="12" r="2"/><path d="M9 12h6M8.5 10.5Q12 6 15.5 10.5"/><path d="M12 3v18" stroke-dasharray="2 2"/><ellipse cx="7" cy="12" rx="4.5" ry="5" stroke-dasharray="2 2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 60) return;
    var mode = K.v(o, 'qEqMode'), showE = K.v(o, 'qEqLines'), col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.05), F = EQ(mode);
    var Xd = 2.1, Yd = 1.35, sc = Math.min(b.w / (2 * Xd), b.h / (2 * Yd)), cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    var X = function (x) { return cx + x * sc; }, Y = function (y) { return cy - y * sc; };
    var yLo = F.plate != null ? F.plate : -Yd;
    var data = K.memo(o, 'eq' + mode, function () {
      var cs = contours(F.phi, -Xd, Xd, yLo, Yd, 150, Math.round(150 * (Yd - yLo) / (2 * Xd)), F.lev), fl = [];
      F.Q.forEach(function (q) {
        if (q[2] < 0 || (F.plate != null && q[1] < F.plate)) return;
        var n = 14;
        for (var k = 0; k < n; k++) { var a = (k + 0.5) / n * TAU;
          fl.push(K.trace(F.E, q[0] + 0.07 * Math.cos(a), q[1] + 0.07 * Math.sin(a), 0.012, 1600, function (x, y) {
            if (Math.abs(x) > Xd * 1.3 || y > Yd * 1.3 || y < yLo - (F.plate != null ? 0 : Yd * 0.3)) return true;
            for (var m = 0; m < F.Q.length; m++) if (F.Q[m][2] < 0 && Math.hypot(x - F.Q[m][0], y - F.Q[m][1]) < 0.06) return true;
            return false; })); }
      });
      return { cs: cs, fl: fl };
    });
    c.save(); c.beginPath(); c.rect(b.x1, b.y1, b.w, b.h); c.clip();
    data.cs.forEach(function (p) { K.poly(c, p.map(function (q) { return [X(q[0]), Y(q[1])]; }), K.alpha(C.a, 0.85), 1.2, [5, 4]); });
    if (showE) data.fl.forEach(function (p) { var sp = p.map(function (q) { return [X(q[0]), Y(q[1])]; }); K.poly(c, sp, K.alpha(col, 0.8), 1.2); K.polyArrows(c, sp, Math.max(55, sc * 0.6), col, Math.max(6, lw * 2.6)); });
    c.restore();
    if (F.plate != null) {
      K.hatch(c, b.x1 + 4, Y(F.plate), b.x2 - 4, Y(F.plate), col, lw * 1.6, 9, 1);
      for (var i = -3; i <= 3; i++) K.txt(c, '−', X(i * 0.22), Y(F.plate) - fs * 0.5, { c: C.neg, s: fs, b: true });
    }
    F.Q.forEach(function (q) { if (F.plate != null && q[1] < F.plate) return; var r = Math.max(7, sc * 0.08);
      K.circ(c, X(q[0]), Y(q[1]), r, q[2] > 0 ? C.pos : C.neg, 1.5, q[2] > 0 ? K.alpha(C.pos, 0.85) : K.alpha(C.neg, 0.85));
      K.txt(c, q[2] > 0 ? '+' : '−', X(q[0]), Y(q[1]), { c: '#fff', s: r * 1.5, b: true, ui: true }); });
    K.txt(c, '实线：电场线    虚线：等势面（相邻等势面电势差相等）', b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.78, al: 'left', ui: true });
  }
});

/* ---------- 霍尔效应 ---------- */
K.sel('qCarrier', '载流子', ['自由电子（金属）', '正电荷（空穴）'], 0);
K.reg({
  key: 'pm_hall', cat: 'em', label: '霍尔效应', params: ['qCarrier'],
  icon: '<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M5 5h3M10 5h3M15 5h3" stroke-dasharray="1 2"/><path d="M1 12h3M20 12h3"/><path d="M12 9v6M10.5 13.5L12 15l1.5-1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 100 || b.h < 70) return;
    var e = K.v(o, 'qCarrier') === 0, col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.055);
    var x0 = b.x1 + b.w * 0.12, x1 = b.x2 - b.w * 0.12, y0 = b.y1 + b.h * 0.25, y1 = b.y2 - b.h * 0.22;
    K.box(c, x0, y0, x1 - x0, y1 - y0, col, lw, K.alpha(col, 0.06), 3);
    K.bmarks(c, x0, y0, x1 - x0, y1 - y0, true, Math.max(26, (y1 - y0) / 3.2), K.alpha(C.B, 0.55), 1.2);
    K.arrow(c, b.x1 + 2, (y0 + y1) / 2, x0, (y0 + y1) / 2, C.I, lw * 1.2); K.arrow(c, x1, (y0 + y1) / 2, b.x2 - 2, (y0 + y1) / 2, C.I, lw * 1.2);
    K.txt(c, 'I', b.x1 + b.w * 0.05, (y0 + y1) / 2 - fs * 0.9, { c: C.I, s: fs, i: true });
    var topSign = e ? '−' : '+', botSign = e ? '+' : '−', tc = e ? C.neg : C.pos, bc = e ? C.pos : C.neg;
    for (var i = 0; i < 7; i++) {
      var x = x0 + (x1 - x0) * (i + 0.5) / 7;
      K.txt(c, topSign, x, y0 + fs * 0.75, { c: tc, s: fs * 1.1, b: true, ui: true });
      K.txt(c, botSign, x, y1 - fs * 0.75, { c: bc, s: fs * 1.1, b: true, ui: true });
    }
    var my = (y0 + y1) / 2, pcx = x0 + (x1 - x0) * 0.55, r = Math.max(6, fs * 0.6), vc = e ? -1 : 1;
    K.circ(c, pcx, my, r, e ? C.neg : C.pos, 1.3, K.alpha(e ? C.neg : C.pos, 0.85));
    K.txt(c, e ? '−' : '+', pcx, my, { c: '#fff', s: r * 1.4, b: true, ui: true });
    K.vec(c, pcx, my, vc * (x1 - x0) * 0.18, 0, C.v, lw, 'v', fs * 0.9);
    K.vec(c, pcx, my, 0, -(y1 - y0) * 0.26, C.F, lw, 'F_洛', fs * 0.9);
    K.txt(c, 'B', x1 - fs * 0.8, y0 - fs * 0.6, { c: C.B, s: fs, i: true });
    K.txt(c, '上表面 ' + (e ? '低' : '高') + '电势    霍尔电压 U = IB/(nqd)', b.x1 + 4, b.y1 + fs * 0.7, { c: col, s: fs * 0.85, al: 'left', ui: true });
    K.txt(c, '磁场垂直纸面向里，电流向右；载流子受洛伦兹力向上偏转', b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.75, al: 'left', ui: true });
  }
});

/* ---------- 理想变压器 ---------- */
K.P('qN1t', { label: '原线圈匝数n₁', min: 50, max: 2000, step: 10, def: 1100 });
K.P('qN2t', { label: '副线圈匝数n₂', min: 10, max: 2000, step: 10, def: 60 });
K.P('qU1', { label: '输入电压U₁', min: 1, max: 380, step: 1, def: 220, unit: 'V' });
K.reg({
  key: 'pm_transformer', cat: 'em', label: '理想变压器', params: ['qN1t', 'qN2t', 'qU1'],
  icon: '<rect x="6" y="4" width="12" height="16" rx="1"/><rect x="9" y="7" width="6" height="10"/><path d="M4 8h3M4 10h3M4 12h3M4 14h3M17 9h3M17 11h3M17 13h3"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 100 || b.h < 70) return;
    var n1 = K.v(o, 'qN1t'), n2 = K.v(o, 'qN2t'), U1 = K.v(o, 'qU1'), U2 = U1 * n2 / n1, col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.055);
    var cx = b.x1 + b.w / 2, cy = b.y1 + b.h * 0.46, cw = b.w * 0.34, ch = b.h * 0.62, th = Math.min(cw, ch) * 0.2;
    c.save(); c.fillStyle = K.alpha(col, 0.22); c.strokeStyle = col; c.lineWidth = lw;
    c.beginPath(); c.rect(cx - cw / 2, cy - ch / 2, cw, ch); c.rect(cx - cw / 2 + th, cy - ch / 2 + th, cw - 2 * th, ch - 2 * th); c.fill('evenodd'); c.stroke(); c.restore();
    var coil = function (xc, n, side, lab, U) {
      var k = Math.round(K.clamp(n / 90, 3, 16)), y0 = cy - ch * 0.32, y1 = cy + ch * 0.32, w2 = th * 0.8;
      for (var i = 0; i < k; i++) { var y = y0 + (y1 - y0) * (i + 0.5) / k;
        K.line(c, xc - w2, y + (y1 - y0) / k * 0.2, xc + w2, y - (y1 - y0) / k * 0.2, C.I, 1.6); }
      var xt = xc + side * (th * 0.8 + b.w * 0.1);
      K.line(c, xc + side * w2, y0, xt, y0, C.I, 1.4); K.line(c, xc + side * w2, y1, xt, y1, C.I, 1.4);
      K.dot(c, xt, y0, 3, col); K.dot(c, xt, y1, 3, col);
      K.txt(c, lab + ' = ' + n, xc, cy + ch / 2 + fs * 0.9, { c: col, s: fs * 0.85, i: true });
      K.txt(c, U, xt + side * fs * 0.4, cy, { c: col, s: fs, i: true, al: side < 0 ? 'right' : 'left' });
    };
    coil(cx - cw / 2 + th / 2, n1, -1, 'n₁', 'U₁=' + U1 + 'V');
    coil(cx + cw / 2 - th / 2, n2, 1, 'n₂', 'U₂=' + (U2 < 10 ? U2.toFixed(2) : U2.toFixed(1)) + 'V');
    K.txt(c, (n2 > n1 ? '升压' : n2 < n1 ? '降压' : '等压') + '变压器：U₁/U₂ = n₁/n₂，I₁/I₂ = n₂/n₁，P₁ = P₂', b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.8, al: 'left', ui: true });
  }
});
})();

/* ===================== 扩展 · 电磁（动画模型） ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI, TAU = PI * 2, D2R = PI / 180;
/* 屏幕坐标系（x 右、y 下、z 垂直纸面向里）：F = q v × B，B = (0,0,Bz) → F ∝ q·Bz·(vy, −vx) */
var lorentzDir = function (q, Bz, vx, vy) { var fx = q * Bz * vy, fy = -q * Bz * vx, L = Math.hypot(fx, fy) || 1; return [fx / L, fy / L]; };

/* ---------- 带电粒子在有界磁场中的运动（动画） ---------- */
K.sel('qRegion', '磁场边界', ['条形边界', '圆形磁场', '单直线边界'], 0);
K.P('qEntry', { label: '入射方向（与法线夹角）', min: -75, max: 75, step: 1, def: 0, unit: '°' });
K.P('qRad', { label: '轨道半径/磁场尺寸', min: 0.2, max: 3, step: 0.05, def: 0.8 });
K.reg({
  key: 'pm_bound_field', cat: 'em', label: '有界磁场中的偏转', animatable: true, params: ['qRegion', 'qEntry', 'qRad', 'qQ', 'qBdir'],
  icon: '<rect x="9" y="2" width="8" height="20" opacity=".5"/><path d="M11 6l2 2M13 6l-2 2M14 15l2 2M16 15l-2 2"/><path d="M1 14h8a8 8 0 0 1 7-8l6-3"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 100 || b.h < 70) return;
    var reg = K.v(o, 'qRegion'), th = K.v(o, 'qEntry') * D2R, kR = K.v(o, 'qRad'), q = K.v(o, 'qQ') === 0 ? 1 : -1, Bz = K.v(o, 'qBdir') === 0 ? 1 : -1;
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05), cy = b.y1 + b.h * 0.52;
    var xa, xb, Cx, Rc, R, E;
    if (reg === 0) { xa = b.x1 + b.w * 0.38; xb = xa + b.w * 0.26; R = kR * (xb - xa); E = [xa, cy]; }
    else if (reg === 1) { Rc = Math.min(b.h * 0.4, b.w * 0.28); Cx = b.x1 + b.w * 0.55; R = kR * Rc; E = [Cx - Rc, cy]; }
    else { xa = b.x1 + b.w * 0.42; R = kR * b.h * 0.25; E = [xa, cy]; }
    var inside = function (x, y) {
      if (reg === 0) return x >= xa - 1e-6 && x <= xb + 1e-6;
      if (reg === 1) return Math.hypot(x - Cx, y - cy) <= Rc + 1e-6;
      return x >= xa - 1e-6;
    };
    var key = [reg, th, kR, q, Bz, b.x1, b.y1, b.w, b.h].join(',');
    var P = K.memo(o, key, function () {
      var vx = Math.cos(th), vy = -Math.sin(th), pts = [], Lpre = Math.min((E[0] - b.x1 - 4) / Math.max(0.25, Math.cos(th)), b.w * 0.4);
      pts.push([E[0] - vx * Lpre, E[1] - vy * Lpre], [E[0], E[1]]);
      var x = E[0] + vx * 0.5, y = E[1] + vy * 0.5, dth = 0.004, ds = R * dth, al = -q * Bz * dth, turned = 0, ca = Math.cos(al / 2), sa = Math.sin(al / 2), inPts = [pts.length - 1];
      while (inside(x, y) && turned < TAU) {
        var nx = vx * ca - vy * sa, ny = vx * sa + vy * ca; vx = nx; vy = ny;
        x += vx * ds; y += vy * ds;
        nx = vx * ca - vy * sa; ny = vx * sa + vy * ca; vx = nx; vy = ny;
        pts.push([x, y]); turned += dth;
        if (x < b.x1 - b.w || x > b.x2 + b.w || y < b.y1 - b.h || y > b.y2 + b.h) break;
      }
      var iEnd = pts.length - 1, ex = x, ey = y;
      if (turned < TAU - 1e-3) pts.push([x + vx * b.w * 1.5, y + vy * b.w * 1.5]);
      return { path: K.mkPath(pts), iEnd: iEnd, turned: turned, ex: ex, ey: ey };
    });
    c.save(); c.beginPath(); c.rect(b.x1, b.y1, b.w, b.h); c.clip();
    var into = Bz > 0, step = Math.max(24, S / 9);
    if (reg === 0) { K.box(c, xa, b.y1, xb - xa, b.h, null, 0, K.alpha(C.B, 0.08)); K.bmarks(c, xa, b.y1, xb - xa, b.h, into, step, K.alpha(C.B, 0.7), 1.2);
      K.line(c, xa, b.y1, xa, b.y2, col, 1, [6, 4]); K.line(c, xb, b.y1, xb, b.y2, col, 1, [6, 4]); }
    else if (reg === 1) { c.save(); c.beginPath(); c.arc(Cx, cy, Rc, 0, TAU); c.clip(); K.box(c, Cx - Rc, cy - Rc, 2 * Rc, 2 * Rc, null, 0, K.alpha(C.B, 0.08));
      K.bmarks(c, Cx - Rc, cy - Rc, 2 * Rc, 2 * Rc, into, step, K.alpha(C.B, 0.7), 1.2); c.restore(); K.circ(c, Cx, cy, Rc, col, 1, null, [6, 4]); K.dot(c, Cx, cy, 2.5, col); }
    else { K.box(c, xa, b.y1, b.x2 - xa, b.h, null, 0, K.alpha(C.B, 0.08)); K.bmarks(c, xa, b.y1, b.x2 - xa, b.h, into, step, K.alpha(C.B, 0.7), 1.2); K.line(c, xa, b.y1, xa, b.y2, col, 1.4); }
    var path = P.path, vpx = S * 0.5, T = path.len / vpx, s = K.mod(K.t(o), T + 0.6) * vpx;
    K.poly(c, path.pts, K.alpha(col, 0.25), 1, [4, 4]);
    var p = K.polyUpTo(c, path, s, C.a, lw);
    var inF = p.i >= 1 && p.i < P.iEnd, r = Math.max(5, lw * 2);
    if (inF) {
      var f = lorentzDir(q, Bz, p.ux, p.uy), ox = p.x + f[0] * R, oy = p.y + f[1] * R;
      K.line(c, ox, oy, p.x, p.y, K.alpha(col, 0.55), 1, [4, 3]); K.line(c, ox, oy, E[0], E[1], K.alpha(col, 0.55), 1, [4, 3]);
      K.dot(c, ox, oy, 2.5, col); K.txt(c, "O'", ox + fs * 0.6, oy - fs * 0.6, { c: col, s: fs * 0.85, i: true });
      K.vec(c, p.x, p.y, f[0] * S * 0.12, f[1] * S * 0.12, C.F, lw, 'F', fs * 0.85);
    }
    K.vec(c, p.x, p.y, p.ux * S * 0.12, p.uy * S * 0.12, C.v, lw, 'v', fs * 0.85);
    K.circ(c, p.x, p.y, r, q > 0 ? C.pos : C.neg, 1, q > 0 ? C.pos : C.neg);
    K.txt(c, q > 0 ? '+' : '−', p.x, p.y, { c: '#fff', s: r * 1.5, b: true, ui: true });
    c.restore();
    var ang = P.turned / D2R;
    K.lines(c, ['r = mv/(qB)    T = 2πm/(qB)', '偏转角 = 圆心角 = ' + ang.toFixed(1) + '°', 't = (' + ang.toFixed(0) + '°/360°)·T'], b.x1 + 4, b.y1 + 4, col, fs * 0.8);
  }
});

/* ---------- 质谱仪（动画） ---------- */
K.P('qMr2', { label: '同位素质量比', min: 1.05, max: 1.6, step: 0.01, def: 1.2 });
K.reg({
  key: 'pm_mass_spec', cat: 'em', label: '质谱仪', animatable: true, params: ['qMr2'],
  icon: '<path d="M3 3h8M3 7h8" /><path d="M7 3v5a6 6 0 0 0 12 0" /><path d="M7 8a4.5 4.5 0 0 0 9 0"/><path d="M2 8h20"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 100 || b.h < 90) return;
    var mr = K.v(o, 'qMr2'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var xs = b.x1 + b.w * 0.14, yp1 = b.y1 + b.h * 0.08, yp2 = yp1 + b.h * 0.16, yf = yp2 + b.h * 0.08;
    var r1 = Math.min(b.w * 0.19, (b.y2 - yf - 6) / Math.sqrt(1.6)), g = yp2 - yp1, d = yf - yp2;
    K.box(c, b.x1, yf, b.w, b.y2 - yf, null, 0, K.alpha(C.B, 0.07));
    K.bmarks(c, b.x1, yf, b.w, b.y2 - yf, true, Math.max(26, S / 8), K.alpha(C.B, 0.6), 1.2);
    K.line(c, b.x1 + 2, yf, b.x2 - 2, yf, col, lw * 1.4);
    K.txt(c, '照相底片', b.x2 - 4, yf - fs * 0.6, { c: col, s: fs * 0.8, al: 'right', ui: true });
    [yp1, yp2].forEach(function (y, k) { K.line(c, xs - b.w * 0.1, y, xs - 4, y, col, lw); K.line(c, xs + 4, y, xs + b.w * 0.1, y, col, lw);
      K.txt(c, k ? '−' : '+', xs + b.w * 0.12, y, { c: k ? C.neg : C.pos, s: fs * 1.1, b: true, ui: true }); });
    K.txt(c, 'U', xs - b.w * 0.12, (yp1 + yp2) / 2, { c: col, s: fs, i: true });
    K.txt(c, 'S', xs - fs * 0.9, yp1 - fs * 0.5, { c: col, s: fs * 0.85, i: true });
    var ta = 0.7, iso = [{ m: 1, cl: C.a }, { m: mr, cl: C.g2 }], tmax = 0;
    iso.forEach(function (I) { I.r = r1 * Math.sqrt(I.m); I.ta = ta * Math.sqrt(I.m); I.v = 2 * g / I.ta; I.td = d / I.v; I.tc = PI * I.r / I.v; I.T = I.ta + I.td + I.tc; tmax = Math.max(tmax, I.T); });
    var t = K.mod(K.t(o), tmax + 1.2);
    iso.forEach(function (I, k) {
      c.save(); c.strokeStyle = K.alpha(I.cl, 0.3); c.lineWidth = 1; c.setLineDash([4, 4]); c.beginPath(); c.arc(xs + I.r, yf, I.r, PI, 0, true); c.stroke(); c.restore();
      var x, y, tt = Math.min(t, I.T), landed = t >= I.T;
      if (tt < I.ta) { x = xs; y = yp1 + 0.5 * (2 * g / (I.ta * I.ta)) * tt * tt; }
      else if (tt < I.ta + I.td) { x = xs; y = yp2 + I.v * (tt - I.ta); }
      else { var ph = I.v * (tt - I.ta - I.td) / I.r; x = xs + I.r - I.r * Math.cos(ph); y = yf + I.r * Math.sin(ph);
        c.save(); c.strokeStyle = I.cl; c.lineWidth = lw; c.beginPath(); c.arc(xs + I.r, yf, I.r, PI, PI - ph, true); c.stroke(); c.restore(); }
      K.dot(c, x + (k ? 1.5 : -1.5), y, Math.max(3.5, lw * 1.4), I.cl);
      if (landed) { K.dot(c, xs + 2 * I.r, yf, 5, I.cl); K.txt(c, 'x' + (k ? '₂' : '₁'), xs + 2 * I.r, yf - fs * 0.8, { c: I.cl, s: fs * 0.85, i: true }); }
    });
    K.lines(c, ['qU = ½mv²    qvB = mv²/r', 'x = 2r = (2/B)√(2mU/q) ∝ √m'], b.x1 + b.w * 0.4, b.y1 + 4, col, fs * 0.8);
  }
});

/* ---------- 回旋加速器（动画） ---------- */
K.reg({
  key: 'pm_cyclotron', cat: 'em', label: '回旋加速器', animatable: true,
  icon: '<path d="M11 3a9 9 0 0 0 0 18z"/><path d="M13 3a9 9 0 0 1 0 18z"/><path d="M12 12a2 2 0 0 1 2-2 3 3 0 0 1-4 3.5 4.5 4.5 0 0 1 7-4"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 90 || b.h < 90) return;
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var cx = b.x1 + b.w * 0.45, cy = b.y1 + b.h / 2, RD = Math.min(b.w * 0.36, b.h * 0.43), gp = RD * 0.07;
    [-1, 1].forEach(function (sd) {
      c.save(); c.beginPath(); c.arc(cx + sd * gp / 2, cy, RD, sd < 0 ? PI / 2 : -PI / 2, sd < 0 ? PI * 1.5 : PI / 2); c.closePath();
      c.fillStyle = K.alpha(col, 0.07); c.fill(); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); c.clip();
      K.bmarks(c, cx - RD, cy - RD, RD * 2, RD * 2, true, Math.max(24, RD / 3.5), K.alpha(C.B, 0.45), 1); c.restore();
    });
    K.txt(c, 'D₁', cx - RD * 0.75, cy + RD * 0.8, { c: col, s: fs, i: true }); K.txt(c, 'D₂', cx + RD * 0.75, cy + RD * 0.8, { c: col, s: fs, i: true });
    var N = 9, r0 = RD * 0.84 / Math.sqrt(N), Th = 0.45, H = [], y = cy;
    for (var n = 0; n < N; n++) { var r = r0 * Math.sqrt(n + 1), right = n % 2 === 0; H.push({ r: r, right: right, ys: y, cyy: right ? y - r : y + r, a0: right ? PI / 2 : -PI / 2 }); y = right ? y - 2 * r : y + 2 * r; }
    var tTot = (N - 1) * Th + Th / 2 + 0.9, t = K.mod(K.t(o), tTot + 0.6);
    var pos = function (tt) {
      var n = Math.min(N - 1, Math.floor(tt / Th)), u = (tt - n * Th) / Th, h = H[n];
      if (n === N - 1 && u > 0.5) { var vv = PI * h.r / Th, ex = cx + h.r, ey = h.cyy, dt = tt - n * Th - Th / 2; return [ex, ey - vv * dt, 0, -1, n]; }
      var a = h.a0 - PI * u; return [cx + h.r * Math.cos(a), h.cyy + h.r * Math.sin(a), Math.sin(a), -Math.cos(a), n];
    };
    var tc = Math.min(t, tTot), pts = [];
    for (var tt = 0; tt <= tc; tt += Th / 24) { var q = pos(tt); pts.push([q[0], q[1]]); }
    var P = pos(tc); pts.push([P[0], P[1]]);
    c.save(); c.beginPath(); c.rect(b.x1, b.y1, b.w, b.h); c.clip();
    K.poly(c, pts, C.a, lw * 0.9);
    K.circ(c, P[0], P[1], Math.max(4, lw * 1.8), C.pos, 1, C.pos);
    c.restore();
    var nextLeft = P[4] % 2 === 0;
    K.arrow(c, cx + (nextLeft ? gp * 0.4 : -gp * 0.4), cy - RD * 0.55, cx + (nextLeft ? -gp * 0.4 : gp * 0.4), cy - RD * 0.55, C.E, 1.6, 6);
    K.txt(c, 'E', cx, cy - RD * 0.55 - fs * 0.8, { c: C.E, s: fs * 0.85, i: true });
    var sx = b.x2 - b.w * 0.08;
    K.circ(c, sx, cy, fs * 0.9, col, 1.2); K.txt(c, '~', sx, cy, { c: col, s: fs * 1.2, ui: true });
    K.line(c, sx, cy - fs * 0.9, sx, cy - RD * 1.02, col, 1); K.line(c, sx, cy - RD * 1.02, cx, cy - RD * 1.02, col, 1);
    K.line(c, sx, cy + fs * 0.9, sx, cy + RD * 1.02, col, 1); K.line(c, sx, cy + RD * 1.02, cx, cy + RD * 1.02, col, 1);
    K.lines(c, ['T电 = T磁 = 2πm/(qB)', 'Ek max = q²B²R²/(2m)', '与加速电压 U 无关'], b.x1 + 4, b.y1 + 4, col, fs * 0.78);
  }
});

/* ---------- 带电粒子在电场中的偏转（示波管，动画） ---------- */
K.P('qUd', { label: '偏转电压（相对）', min: -1.4, max: 1.4, step: 0.05, def: 0.7 });
K.reg({
  key: 'pm_deflect', cat: 'em', label: '电场中的偏转', animatable: true, params: ['qUd', 'qQ'],
  icon: '<path d="M6 7h9M6 17h9"/><path d="M1 12h5q6 0 9 2.5l7 4"/><path d="M22 4v16"/><path d="M15 14.5L10.5 12" stroke-dasharray="1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 120 || b.h < 60) return;
    var U = K.v(o, 'qUd'), q = K.v(o, 'qQ') === 0 ? 1 : -1, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055);
    var xL = b.x1 + b.w * 0.2, L = b.w * 0.38, xR = xL + L, cy = b.y1 + b.h * 0.5, d = b.h * 0.34, xS = b.x2 - b.w * 0.06, x0 = b.x1 + 6;
    var Ye = U * q * 0.9 * d / 2, hit = Math.abs(Ye) > d / 2, xh = hit ? xL + L * Math.sqrt((d / 2) / Math.abs(Ye)) : xR;
    var sl = 2 * Ye / L, yS = Ye + sl * (xS - xR);
    var yAt = function (x) { if (x <= xL) return 0; if (x <= xR) return Ye * Math.pow((x - xL) / L, 2); return Ye + sl * (x - xR); };
    var xEnd = hit ? xh : xS, v0 = b.w * 0.42, T = (xEnd - x0) / v0, t = K.mod(K.t(o), T + 0.8), x = Math.min(xEnd, x0 + v0 * t);
    K.box(c, xL, cy - d / 2 - 5, L, 5, col, 1, U >= 0 ? K.alpha(C.pos, 0.6) : K.alpha(C.neg, 0.6));
    K.box(c, xL, cy + d / 2, L, 5, col, 1, U >= 0 ? K.alpha(C.neg, 0.6) : K.alpha(C.pos, 0.6));
    K.txt(c, U >= 0 ? '+' : '−', xL - fs * 0.7, cy - d / 2 - 2, { c: col, s: fs * 1.1, b: true, ui: true });
    K.txt(c, U >= 0 ? '−' : '+', xL - fs * 0.7, cy + d / 2 + 3, { c: col, s: fs * 1.1, b: true, ui: true });
    for (var k = 1; k < 6; k++) { var ex = xL + L * k / 6; if (Math.abs(U) > 0.02) K.arrow(c, ex, U > 0 ? cy - d / 2 + 4 : cy + d / 2 - 4, ex, U > 0 ? cy + d / 2 - 6 : cy - d / 2 + 6, K.alpha(C.E, 0.35), 1, 6); }
    K.line(c, xS, b.y1 + 4, xS, b.y2 - 4, col, lw * 1.5); K.txt(c, '荧光屏', xS - 4, b.y1 + fs * 0.6, { c: col, s: fs * 0.75, al: 'right', ui: true });
    K.line(c, b.x1 + 2, cy, xS, cy, K.alpha(col, 0.3), 1, [3, 4]);
    var pts = []; for (var xx = x0; xx <= xEnd; xx += 2) pts.push([xx, cy + yAt(xx)]);
    K.poly(c, pts, K.alpha(col, 0.25), 1, [4, 4]);
    var tr = []; for (var x2 = x0; x2 <= x; x2 += 2) tr.push([x2, cy + yAt(x2)]); tr.push([x, cy + yAt(x)]);
    K.poly(c, tr, C.a, lw);
    if (!hit && x > xR) K.line(c, xR, cy + Ye, xL + L / 2, cy, K.alpha(C.a, 0.7), 1, [5, 4]);
    if (!hit && Math.abs(Ye) > 1) K.dot(c, xL + L / 2, cy, 3, C.a);
    var py = cy + yAt(x), r = Math.max(4.5, lw * 1.8);
    K.circ(c, x, py, r, q > 0 ? C.pos : C.neg, 1, q > 0 ? C.pos : C.neg);
    if (!hit && x >= xS - 1) K.dot(c, xS, cy + yS, 6, C.a);
    K.txt(c, 'v₀', x0 + fs, cy - fs * 0.8, { c: C.v, s: fs * 0.85, i: true });
    K.txt(c, 'L', xL + L / 2, cy + d / 2 + fs * 1.3, { c: col, s: fs * 0.9, i: true });
    K.txt(c, 'd', xR + fs * 0.6, cy - d / 4, { c: col, s: fs * 0.9, i: true });
    K.lines(c, hit ? ['偏转量过大：粒子打在极板上'] : ['y = qUL²/(2mdv₀²)    tanθ = qUL/(mdv₀²)', '出射速度反向延长线过板间中点'], b.x1 + 4, b.y2 - fs * 2.6, hit ? C.F : col, fs * 0.8);
  }
});

/* ---------- 导体棒切割磁感线（动画 + v-t 图） ---------- */
K.sel('qRailMode', '运动情况', ['匀速（外力 F = F安）', '给初速度 v₀ 后滑行', '恒力 F 拉动'], 0);
K.reg({
  key: 'pm_rails', cat: 'em', label: '导体棒切割', animatable: true, params: ['qRailMode', 'qBdir'],
  icon: '<path d="M2 6h20M2 18h20"/><rect x="2.5" y="9" width="3" height="6"/><path d="M15 4v16"/><path d="M16 12h5M19.5 10.5L21 12l-1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 120 || b.h < 70) return;
    var md = K.v(o, 'qRailMode'), Bz = K.v(o, 'qBdir') === 0 ? 1 : -1, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var yt = b.y1 + b.h * 0.3, yb = b.y1 + b.h * 0.78, xl = b.x1 + b.w * 0.07, xr = b.x2 - b.w * 0.03, x0 = xl + b.w * 0.16, Lr = xr - x0 - 10;
    var t = K.t(o), x, v, vr, T, tau = 1.1, fv;
    if (md === 0) { vr = Lr / 4; T = 4; fv = function (q) { return vr; }; }
    else if (md === 1) { vr = Lr * 0.85 / tau; T = 5; fv = function (q) { return vr * Math.exp(-q / tau); }; }
    else { vr = Lr / 4.2; T = 0; fv = function (q) { return vr * (1 - Math.exp(-q / tau)); }; }
    var xf = function (q) { return md === 0 ? x0 + vr * q : md === 1 ? x0 + vr * tau * (1 - Math.exp(-q / tau)) : x0 + vr * (q - tau * (1 - Math.exp(-q / tau))); };
    if (md === 2) { T = 0.1; while (xf(T) < x0 + Lr && T < 20) T += 0.05; }
    var tc = Math.min(K.mod(t, T + 0.8), T); x = xf(tc); v = fv(tc);
    K.box(c, xl + b.w * 0.05, yt - b.h * 0.08, xr - xl - b.w * 0.05, yb - yt + b.h * 0.16, null, 0, K.alpha(C.B, 0.07));
    K.bmarks(c, xl + b.w * 0.05, yt - b.h * 0.08, xr - xl - b.w * 0.05, yb - yt + b.h * 0.16, Bz > 0, Math.max(26, S / 7), K.alpha(C.B, 0.55), 1.1);
    K.line(c, xl, yt, xr, yt, col, lw * 1.2); K.line(c, xl, yb, xr, yb, col, lw * 1.2);
    K.line(c, xl, yt, xl, yb, col, lw);
    var rh = (yb - yt) * 0.36; K.box(c, xl - 6, (yt + yb) / 2 - rh / 2, 12, rh, col, lw, K.alpha(col, 0.2), 2);
    K.txt(c, 'R', xl - fs * 0.9, (yt + yb) / 2, { c: col, s: fs, i: true });
    K.line(c, x, yt - b.h * 0.07, x, yb + b.h * 0.07, C.a, lw * 2.2);
    var In = v / vr, up = Bz > 0, hs = 6 + 6 * Math.min(1, In);
    if (In > 0.03) {
      var dU = up ? -1 : 1;
      K.head(c, x + 0.01, (yt + yb) / 2 + dU * hs, 0, dU, hs, C.I);
      K.head(c, (xl + x) / 2 - dU * hs, yt, dU, 0, hs, C.I);
      K.head(c, xl, (yt + yb) / 2 + rh / 2 + hs + 4 - (up ? 0 : rh + 2 * hs + 8), 0, -dU, hs, C.I);
      K.head(c, (xl + x) / 2 + dU * hs, yb, -dU, 0, hs, C.I);
      K.txt(c, 'I', x + fs * 0.7, (yt + yb) / 2 - fs * 1.2, { c: C.I, s: fs, i: true });
      K.vec(c, x - 4, (yt + yb) / 2 + fs * 1.2, -S * 0.18 * In, 0, C.F, lw, 'F_安', fs * 0.85);
    }
    if (md !== 1) K.vec(c, x + 4, (yt + yb) / 2 + fs * 1.2, S * 0.18 * (md === 0 ? 1 : 1.05), 0, C.v, lw, 'F', fs * 0.85);
    K.vec(c, x, yt - b.h * 0.12, K.clamp(S * 0.16 * v / vr, 0, S * 0.25), 0, C.a, lw, 'v', fs * 0.85);
    var gw = b.w * 0.26, gh = b.h * 0.24, A = K.mini(c, b.x2 - gw - 2, b.y1 + 2, gw, gh, { xmin: 0, xmax: T, ymin: 0, ymax: 1.15, xl: 't', yl: 'v', col: col, fs: fs * 0.7, lw: 1, O: false });
    K.plot(c, A, function (q) { return fv(q) / vr; }, 0, T, C.a, 1.6); K.dot(c, A.X(tc), A.Y(v / vr), 3, C.F);
    var info = ['E = BLv    I = BLv/(R+r)', 'F安 = B²L²v/(R+r)', ['F 与 F安 平衡，匀速', '加速度减小的减速运动', '加速度减小的加速，最终匀速 vm'][md]];
    K.lines(c, info, b.x1 + 4, b.y1 + 2, col, fs * 0.75);
  }
});

/* ---------- 线框穿过有界磁场（动画 + Φ-t、I-t 图） ---------- */
K.P('qFieldW', { label: '磁场宽度/线框边长', min: 0.5, max: 3, step: 0.1, def: 1.6 });
K.reg({
  key: 'pm_loop_field', cat: 'em', label: '线框穿过磁场', animatable: true, params: ['qFieldW', 'qBdir'],
  icon: '<rect x="10" y="2" width="8" height="10" opacity=".55"/><rect x="5" y="4" width="7" height="6"/><path d="M2 20h20M2 15v7"/><path d="M5 20v-3h6v3"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 140 || b.h < 110) return;
    var kd = K.v(o, 'qFieldW'), Bz = K.v(o, 'qBdir') === 0 ? 1 : -1, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.045);
    var Lp = Math.min(b.h * 0.25, b.w * 0.12), yc = b.y1 + b.h * 0.2, xa = b.x1 + Lp * 1.45, d = Math.min(kd * Lp, b.x2 - 1.4 * Lp - xa), xb = xa + d;
    var xf0 = xa - 0.25 * Lp, Dist = xb + 1.25 * Lp - xf0, v = b.w * 0.16, T = Dist / v, t = K.mod(K.t(o), T + 0.8), tc = Math.min(t, T), xf = xf0 + v * tc;
    var ov = function (f) { return Math.max(0, Math.min(f, xb) - Math.max(f - Lp, xa)) / Lp; };
    var Ic = function (f) { var a = (f > xa && f < xb) ? 1 : 0, r = (f - Lp > xa && f - Lp < xb) ? 1 : 0; return (a - r) * Bz; };
    K.box(c, xa, yc - Lp * 0.85, d, Lp * 1.7, col, 1, K.alpha(C.B, 0.08));
    K.bmarks(c, xa, yc - Lp * 0.85, d, Lp * 1.7, Bz > 0, Math.max(20, Lp / 2.6), K.alpha(C.B, 0.6), 1);
    K.box(c, xf - Lp, yc - Lp / 2, Lp, Lp, C.a, lw * 1.2, K.alpha(C.a, 0.08));
    var I = Ic(xf), hs = 7;
    if (I !== 0) {
      var s = I;
      K.head(c, xf - Lp / 2 - s * hs, yc - Lp / 2, -s, 0, hs, C.I); K.head(c, xf - Lp / 2 + s * hs, yc + Lp / 2, s, 0, hs, C.I);
      K.head(c, xf, yc - s * hs, 0, -s, hs, C.I); K.head(c, xf - Lp, yc + s * hs, 0, s, hs, C.I);
      K.txt(c, s > 0 ? '逆时针' : '顺时针', xf - Lp / 2, yc, { c: C.I, s: fs * 0.85, ui: true });
      K.vec(c, xf - Lp / 2, yc + Lp / 2 + fs * 1.1, -Lp * 0.6, 0, C.F, lw, 'F_安', fs * 0.8);
    }
    K.vec(c, xf + 4, yc - Lp / 2 - fs * 0.4, Lp * 0.5, 0, C.v, lw, 'v', fs * 0.8);
    var gy = yc + Lp * 0.85 + fs * 1.5, gh = (b.y2 - gy) / 2 - 4;
    var A1 = K.mini(c, b.x1 + 2, gy, b.w - 4, gh, { xmin: 0, xmax: T, ymin: -0.2, ymax: 1.2, xl: 't', yl: 'Φ', col: col, fs: fs * 0.85, lw: 1, O: false });
    K.plot(c, A1, function (q) { return ov(xf0 + v * q); }, 0, T, C.B, 1.8, null, 400);
    var A2 = K.mini(c, b.x1 + 2, gy + gh + 6, b.w - 4, gh, { xmin: 0, xmax: T, ymin: -1.4, ymax: 1.4, xl: 't', yl: 'I', col: col, fs: fs * 0.85, lw: 1, O: false });
    K.plot(c, A2, function (q) { return Ic(xf0 + v * q); }, 0, T, C.I, 1.8, null, 600);
    K.txt(c, '逆时针为正', A2.X1, A2.Y0 + fs * 0.2, { c: col, s: fs * 0.75, al: 'right', ui: true });
    [A1, A2].forEach(function (A) { K.line(c, A.X(tc), A.Y0, A.X(tc), A.Y1, K.alpha(C.F, 0.8), 1.2); });
  }
});

/* ---------- 交流发电机（动画 + e-t、Φ-t 图） ---------- */
K.reg({
  key: 'pm_generator', cat: 'em', label: '交流发电机', animatable: true,
  icon: '<rect x="1" y="6" width="4" height="12"/><rect x="11" y="6" width="4" height="12"/><path d="M6.5 8l3 0 0 8-3 0z"/><path d="M8 4v16" stroke-dasharray="1.5 1.5"/><path d="M16 12q1.5-6 3 0t3 0"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 160 || b.h < 80) return;
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055), Tp = 4, t = K.t(o), al = TAU * t / Tp;
    var cy = b.y1 + b.h * 0.5, mh = b.h * 0.56, nx1 = b.x1 + b.w * 0.02, mw = b.w * 0.06, sx1 = b.x1 + b.w * 0.44;
    K.box(c, nx1, cy - mh / 2, mw, mh, col, 1, 'rgba(239,68,68,.8)', 3); K.txt(c, 'N', nx1 + mw / 2, cy, { c: '#fff', s: fs * 1.2, b: true, ui: true });
    K.box(c, sx1, cy - mh / 2, mw, mh, col, 1, 'rgba(59,130,246,.8)', 3); K.txt(c, 'S', sx1 + mw / 2, cy, { c: '#fff', s: fs * 1.2, b: true, ui: true });
    for (var k = 0; k < 5; k++) { var y = cy - mh * 0.4 + mh * 0.8 * k / 4; K.arrow(c, nx1 + mw + 4, y, sx1 - 4, y, K.alpha(C.B, 0.35), 1, 7, [6, 5]); }
    var cx = (nx1 + mw + sx1) / 2, a = (sx1 - nx1 - mw) * 0.36, hh = mh * 0.36;
    var P = function (sd, top) { var x = sd * -a * Math.sin(al), z = sd * a * Math.cos(al); return [cx + x + 0.35 * z, (top ? cy - hh : cy + hh) - 0.22 * z, z]; };
    var A1 = P(1, true), B1 = P(1, false), A2 = P(-1, true), B2 = P(-1, false);
    K.line(c, cx, cy - hh - b.h * 0.12, cx, cy + hh + b.h * 0.14, K.alpha(col, 0.5), 1, [4, 4]);
    K.poly(c, [A1, B1, B2, A2], null, 0, null, true, K.alpha(C.a, 0.08 + 0.12 * Math.abs(Math.sin(al))));
    var sideCol = function (z) { return z >= 0 ? C.a : K.alpha(C.a, 0.5); };
    K.line(c, A1[0], A1[1], B1[0], B1[1], sideCol(A1[2]), lw * 1.5); K.line(c, A2[0], A2[1], B2[0], B2[1], sideCol(A2[2]), lw * 1.5);
    K.line(c, A1[0], A1[1], A2[0], A2[1], C.a, lw); K.line(c, B1[0], B1[1], B2[0], B2[1], C.a, lw);
    K.txt(c, 'a', A1[0] + fs * 0.6, A1[1] - fs * 0.3, { c: col, s: fs * 0.8, i: true }); K.txt(c, 'd', A2[0] - fs * 0.6, A2[1] - fs * 0.3, { c: col, s: fs * 0.8, i: true });
    var e = Math.sin(al), up1 = -e > 0;
    if (Math.abs(e) > 0.08) {
      var hs = 5 + 5 * Math.abs(e);
      K.head(c, (A1[0] + B1[0]) / 2, (A1[1] + B1[1]) / 2 + (up1 ? -hs : hs) * 0.5, 0, up1 ? -1 : 1, hs, C.I);
      K.head(c, (A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2 + (up1 ? hs : -hs) * 0.5, 0, up1 ? 1 : -1, hs, C.I);
    }
    if (Math.abs(e) < 0.1) K.txt(c, '中性面', cx, cy - hh - b.h * 0.16, { c: C.F, s: fs * 0.9, ui: true });
    var gx = b.x1 + b.w * 0.54, A = K.axes(c, gx, b.y1 + b.h * 0.08, b.w * 0.45, b.h * 0.8, { xmin: 0, xmax: 2 * Tp, ymin: -1.25, ymax: 1.25, xl: 't', yl: 'e', col: col, fs: fs * 0.85, lw: 1.2 });
    K.plot(c, A, function (q) { return Math.cos(TAU * q / Tp); }, 0, 2 * Tp, K.alpha(C.B, 0.8), 1.3, [5, 4]);
    K.plot(c, A, function (q) { return Math.sin(TAU * q / Tp); }, 0, 2 * Tp, C.a, lw);
    var tt = K.mod(t, 2 * Tp); K.line(c, A.X(tt), A.Y0, A.X(tt), A.Y1, K.alpha(C.F, 0.7), 1); K.dot(c, A.X(tt), A.Y(Math.sin(TAU * tt / Tp)), 3.5, C.F);
    K.lines(c, ['实线 e = Em sin ωt', '虚线 Φ = Φm cos ωt', 'Em = nBSω'], A.X1 - b.w * 0.16, b.y1 + 2, col, fs * 0.72);
  }
});

/* ---------- 楞次定律：磁铁插入/拔出线圈（动画） ---------- */
K.sel('qMagPole', '磁铁', ['N 极朝向线圈', 'S 极朝向线圈'], 0);
K.reg({
  key: 'pm_lenz', cat: 'em', label: '楞次定律', animatable: true, params: ['qMagPole'],
  icon: '<rect x="1" y="9" width="8" height="5"/><path d="M12 7v10M14.5 7v10M17 7v10M19.5 7v10" /><path d="M12 7h7.5M12 17h7.5" opacity=".4"/><circle cx="16" cy="21" r="2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 140 || b.h < 80) return;
    var sm = K.v(o, 'qMagPole') === 0 ? 1 : -1, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055), t = K.t(o), w = TAU / 4;
    var cy = b.y1 + b.h * 0.42, xc0 = b.x1 + b.w * 0.5, Lc = b.w * 0.32, rc = b.h * 0.22, ccx = xc0 + Lc / 2, a0 = Lc * 0.6;
    var Lm = b.w * 0.3, hm = b.h * 0.14, pFar = xc0 - b.w * 0.16, pIn = xc0 + Lc * 0.35;
    var pAt = function (q) { return pFar + (pIn - pFar) * (1 - Math.cos(w * q)) / 2; };
    var phi = function (q) { var d = ccx - pAt(q); return sm * Math.pow(1 + (d / a0) * (d / a0), -1.5); };
    var p = pAt(t), dphi = (phi(t + 0.01) - phi(t - 0.01)) / 0.02, In = K.clamp(dphi * 1.6, -1, 1);
    var k = 8, rx = rc * 0.28;
    for (var i = 0; i < k; i++) { var x = xc0 + Lc * (i + 0.5) / k;
      c.save(); c.strokeStyle = K.alpha(col, 0.3); c.lineWidth = 1.2; c.beginPath(); c.ellipse(x, cy, rx, rc, 0, PI / 2, PI * 1.5); c.stroke(); c.restore(); }
    c.save(); c.beginPath(); c.rect(b.x1, b.y1, b.w, b.h); c.clip();
    K.box(c, p - Lm, cy - hm / 2, Lm / 2, hm, col, 1, sm > 0 ? 'rgba(59,130,246,.85)' : 'rgba(239,68,68,.85)', 2);
    K.box(c, p - Lm / 2, cy - hm / 2, Lm / 2, hm, col, 1, sm > 0 ? 'rgba(239,68,68,.85)' : 'rgba(59,130,246,.85)', 2);
    K.txt(c, sm > 0 ? 'S' : 'N', p - Lm * 0.75, cy, { c: '#fff', s: fs, b: true, ui: true }); K.txt(c, sm > 0 ? 'N' : 'S', p - Lm * 0.25, cy, { c: '#fff', s: fs, b: true, ui: true });
    c.restore();
    for (var j = 0; j < k; j++) { var x2 = xc0 + Lc * (j + 0.5) / k;
      c.save(); c.strokeStyle = C.a; c.lineWidth = lw; c.beginPath(); c.ellipse(x2, cy, rx, rc, 0, -PI / 2, PI / 2); c.stroke(); c.restore();
      if (Math.abs(In) > 0.06) K.head(c, x2 + rx, cy + (In > 0 ? -1 : 1) * 4, 0, In > 0 ? -1 : 1, 5 + 4 * Math.abs(In), C.I); }
    var vm = Math.sin(w * t);
    K.vec(c, p - Lm / 2, cy - hm / 2 - fs * 0.9, K.clamp(vm * S * 0.18, -S * 0.2, S * 0.2), 0, C.v, lw, null, fs);
    var gx = ccx, gy = b.y2 - b.h * 0.16, gr = Math.min(b.h * 0.12, b.w * 0.06), xa = xc0 + Lc * 0.5 / k, xz = xc0 + Lc * (k - 0.5) / k;
    K.line(c, xa, cy + rc, xa, gy, col, 1); K.line(c, xa, gy, gx - gr, gy, col, 1);
    K.line(c, xz, cy + rc, xz, gy, col, 1); K.line(c, xz, gy, gx + gr, gy, col, 1);
    K.circ(c, gx, gy, gr, col, lw, K.alpha(col, 0.08)); var na = -PI / 2 + In * 0.9;
    K.line(c, gx, gy + gr * 0.5, gx + Math.cos(na) * gr * 0.9, gy + gr * 0.5 + Math.sin(na) * gr * 1.2, C.F, 1.6);
    K.txt(c, 'G', gx + gr + fs * 0.6, gy, { c: col, s: fs * 0.85, i: true });
    if (Math.abs(In) > 0.06) K.txt(c, In > 0 ? 'N' : 'S', xc0 - fs * 0.9, cy - rc - fs * 0.3, { c: In > 0 ? C.n : C.s, s: fs * 1.1, b: true, ui: true });
    var grow = Math.abs(phi(t + 0.01)) > Math.abs(phi(t));
    var st = Math.abs(In) < 0.06 ? '磁通量几乎不变：感应电流很小' : (grow ? '靠近：Φ增大，感应电流的磁场与原磁场反向（来拒）' : '远离：Φ减小，感应电流的磁场与原磁场同向（去留）');
    K.txt(c, st, b.x1 + 4, b.y1 + fs * 0.7, { c: col, s: fs * 0.8, al: 'left', ui: true });
  }
});

/* ---------- LC 振荡电路（动画） ---------- */
K.reg({
  key: 'pm_lc', cat: 'em', label: 'LC 振荡电路', animatable: true,
  icon: '<path d="M3 4h18v16H3z" opacity=".35"/><path d="M1 10h4M1 13h4"/><path d="M19 7q3 1.5 0 3t0 3 0 3"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 140 || b.h < 80) return;
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055), Tp = 4, t = K.t(o), wt = TAU * t / Tp, q = Math.cos(wt), i = -Math.sin(wt);
    var x0 = b.x1 + b.w * 0.08, x1 = b.x1 + b.w * 0.44, y0 = b.y1 + b.h * 0.14, y1 = b.y2 - b.h * 0.24, cyy = (y0 + y1) / 2, gp = b.h * 0.08, pw = b.w * 0.09;
    K.line(c, x0, y0, x1, y0, col, lw); K.line(c, x0, y1, x1, y1, col, lw);
    K.line(c, x0, y0, x0, cyy - gp / 2, col, lw); K.line(c, x0, cyy + gp / 2, x0, y1, col, lw);
    K.line(c, x0 - pw / 2, cyy - gp / 2, x0 + pw / 2, cyy - gp / 2, col, lw * 1.6); K.line(c, x0 - pw / 2, cyy + gp / 2, x0 + pw / 2, cyy + gp / 2, col, lw * 1.6);
    var nq = Math.round(Math.abs(q) * 4);
    for (var k = 0; k < nq; k++) { var xx = x0 - pw / 2 + pw * (k + 0.5) / 4;
      K.txt(c, q > 0 ? '+' : '−', xx, cyy - gp / 2 - fs * 0.55, { c: q > 0 ? C.pos : C.neg, s: fs * 0.8, b: true, ui: true });
      K.txt(c, q > 0 ? '−' : '+', xx, cyy + gp / 2 + fs * 0.55, { c: q > 0 ? C.neg : C.pos, s: fs * 0.8, b: true, ui: true }); }
    if (Math.abs(q) > 0.1) for (var e = 0; e < 3; e++) { var ex = x0 - pw * 0.3 + pw * 0.3 * e;
      K.arrow(c, ex, q > 0 ? cyy - gp / 2 + 2 : cyy + gp / 2 - 2, ex, q > 0 ? cyy + gp / 2 - 2 : cyy - gp / 2 + 2, K.alpha(C.E, Math.abs(q)), 1.2, 5); }
    var ci = (y1 - y0) * 0.5, cs = cyy - ci / 2, n = 6;
    K.line(c, x1, y0, x1, cs, col, lw); K.line(c, x1, cs + ci, x1, y1, col, lw);
    c.save(); c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
    for (var j = 0; j < n; j++) { var yy = cs + ci * (j + 0.5) / n; c.moveTo(x1, yy - ci / n / 2); c.arc(x1, yy, ci / n / 2, -PI / 2, PI / 2, false); }
    c.stroke(); c.restore();
    if (Math.abs(i) > 0.1) { K.box(c, x1 - pw * 0.25, cs, pw * 0.5, ci, null, 0, K.alpha(C.B, 0.35 * Math.abs(i))); K.txt(c, 'B', x1 - pw * 0.55, cyy, { c: C.B, s: fs, i: true }); }
    if (Math.abs(i) > 0.06) { var hs = 6 + 5 * Math.abs(i), dl = i > 0 ? -1 : 1;
      K.head(c, (x0 + x1) / 2 + dl * hs * 0.5, y0, dl, 0, hs, C.I); K.head(c, (x0 + x1) / 2 - dl * hs * 0.5, y1, -dl, 0, hs, C.I);
      K.txt(c, 'i', (x0 + x1) / 2, y0 - fs * 0.7, { c: C.I, s: fs, i: true }); }
    K.txt(c, 'C', x0 - pw * 0.85, cyy, { c: col, s: fs, i: true }); K.txt(c, 'L', x1 + fs * 1.2, cyy, { c: col, s: fs, i: true });
    var bw = b.w * 0.12, bx = x0, by = b.y2 - fs * 2.4;
    K.box(c, bx, by, bw, fs * 0.6, K.alpha(col, 0.4), 1); K.box(c, bx, by, bw * q * q, fs * 0.6, null, 0, C.E);
    K.box(c, bx + bw * 1.5, by, bw, fs * 0.6, K.alpha(col, 0.4), 1); K.box(c, bx + bw * 1.5, by, bw * i * i, fs * 0.6, null, 0, C.B);
    K.txt(c, '电场能', bx + bw / 2, by + fs * 1.3, { c: col, s: fs * 0.7, ui: true }); K.txt(c, '磁场能', bx + bw * 2, by + fs * 1.3, { c: col, s: fs * 0.7, ui: true });
    var A = K.axes(c, b.x1 + b.w * 0.54, b.y1 + b.h * 0.08, b.w * 0.45, b.h * 0.8, { xmin: 0, xmax: 2 * Tp, ymin: -1.25, ymax: 1.25, xl: 't', yl: 'q,i', col: col, fs: fs * 0.85, lw: 1.2 });
    K.plot(c, A, function (x) { return Math.cos(TAU * x / Tp); }, 0, 2 * Tp, C.E, lw);
    K.plot(c, A, function (x) { return -Math.sin(TAU * x / Tp); }, 0, 2 * Tp, C.I, 1.4, [5, 4]);
    var tt = K.mod(t, 2 * Tp); K.line(c, A.X(tt), A.Y0, A.X(tt), A.Y1, K.alpha(C.F, 0.7), 1);
    K.lines(c, ['实线 q，虚线 i', 'T = 2π√(LC)'], A.X1 - b.w * 0.12, b.y1 + 2, col, fs * 0.72);
  }
});
})();

/* ===================== 扩展 · 原子与原子核 ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI, TAU = PI * 2;
var H_EV = 4.1357e-15;

/* ---------- 光电效应（动画） ---------- */
K.P('qNu', { label: '入射光频率', min: 3, max: 15, step: 0.1, def: 8, unit: '×10¹⁴Hz' });
K.sel('qMetal', '阴极金属', ['钠 W₀=2.29eV', '钾 W₀=2.25eV', '钙 W₀=3.20eV', '钨 W₀=4.54eV'], 0);
K.P('qUak', { label: '电压U_AK', min: -4, max: 4, step: 0.1, def: 1, unit: 'V' });
var W0s = [2.29, 2.25, 3.2, 4.54];
K.reg({
  key: 'pm_photoelectric', cat: 'modern', label: '光电效应', animatable: true, params: ['qNu', 'qMetal', 'qUak'],
  icon: '<ellipse cx="12" cy="12" rx="8" ry="6"/><path d="M8 8.5v7"/><path d="M16 11v2"/><path d="M2 3l4 4M5 2l3 3"/><circle cx="11" cy="11" r=".8"/><circle cx="13" cy="13" r=".8"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 140 || b.h < 90) return;
    var nu = K.v(o, 'qNu'), W = W0s[K.v(o, 'qMetal')], U = K.v(o, 'qUak'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var E = H_EV * nu * 1e14, Ek = E - W, lam = 3e8 / (nu * 1e14) * 1e9, lc = K.wl(lam, 0.9);
    var cx = b.x1 + b.w * 0.42, cy = b.y1 + b.h * 0.42, rx = b.w * 0.3, ry = b.h * 0.3, xK = cx - rx * 0.55, xA = cx + rx * 0.55;
    c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.fillStyle = K.alpha(C.glass, 0.06); c.fill(); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); c.restore();
    c.save(); c.strokeStyle = col; c.lineWidth = lw * 2; c.beginPath(); c.arc(xK + ry * 0.9, cy, ry * 0.9, PI * 0.78, PI * 1.22); c.stroke(); c.restore();
    var kx = xK + ry * 0.9 - ry * 0.9 * Math.cos(PI * 0.0);
    K.line(c, xA, cy - ry * 0.35, xA, cy + ry * 0.35, col, lw * 1.5);
    K.txt(c, 'K', xK - fs * 0.2, cy + ry * 0.55, { c: col, s: fs, i: true }); K.txt(c, 'A', xA + fs * 0.7, cy + ry * 0.4, { c: col, s: fs, i: true });
    for (var k = 0; k < 3; k++) { var yy = cy - ry * 0.25 + k * ry * 0.25; K.wavy(c, b.x1 + 4, yy - ry * 0.9 + k * 4, xK - 2, yy, lc, 1.5, 3, 9, true); }
    K.txt(c, lam < 380 ? '紫外光 λ=' + lam.toFixed(0) + 'nm' : (lam > 780 ? '红外光' : 'λ = ' + lam.toFixed(0) + ' nm'), b.x1 + 4, b.y1 + fs * 0.7, { c: lc, s: fs * 0.85, al: 'left', ui: true });
    var yb = b.y2 - b.h * 0.12, xb1 = cx - b.w * 0.08, xb2 = cx + b.w * 0.08;
    K.line(c, xK - ry * 0.2, cy, xK - ry * 0.2, yb, col, 1); K.line(c, xA, cy + ry * 0.35, xA, yb, col, 1);
    K.line(c, xK - ry * 0.2, yb, xb1, yb, col, 1); K.line(c, xb2, yb, xA, yb, col, 1);
    var hiLeft = U < 0;
    K.line(c, xb1, yb - fs * 0.9, xb1, yb + fs * 0.9, col, hiLeft ? lw * 1.6 : lw * 3); K.line(c, xb1 + 7, yb - fs * 0.5, xb1 + 7, yb + fs * 0.5, col, hiLeft ? lw * 3 : lw * 1.6);
    K.txt(c, 'U = ' + U.toFixed(1) + ' V' + (U < 0 ? '（反向）' : '（正向）'), (xb1 + xb2) / 2 + fs * 2, yb - fs * 1.1, { c: col, s: fs * 0.85, ui: true });
    var mx = xA + rx * 0.55, mr = Math.min(b.h * 0.1, b.w * 0.05);
    var frac = Ek <= 0 ? 0 : (U >= 0 ? 1 - 0.55 * Math.exp(-3 * U) : K.clamp((Ek + U) / Ek, 0, 1));
    K.circ(c, mx, cy, mr, col, lw, K.alpha(col, 0.08)); K.txt(c, 'μA', mx, cy + mr * 0.45, { c: col, s: mr * 0.5, ui: true });
    var na = -PI * 0.85 + PI * 0.7 * frac; K.line(c, mx, cy + mr * 0.2, mx + Math.cos(na) * mr * 0.85, cy + mr * 0.2 + Math.sin(na) * mr * 0.85, C.F, 1.5);
    K.line(c, xA, cy - ry * 0.35, xA, cy - ry - 6, col, 1); K.line(c, xA, cy - ry - 6, mx, cy - ry - 6, col, 1); K.line(c, mx, cy - ry - 6, mx, cy - mr, col, 1);
    if (Ek > 0) {
      var r = K.rng(31), t = K.t(o), dT = 0.09, d = xA - xK - ry * 0.15, tl = 1.6;
      for (var n = Math.max(0, Math.floor((t - 3) / dT)); n * dT <= t; n++) {
        var r1 = K.rng(n * 7919 + 13), e0 = Ek * (0.12 + 0.88 * r1()), v = Math.sqrt(2 * e0), y0 = cy + (r1() - 0.5) * ry * 0.9;
        var tau = (t - n * dT) * 1.6, xx = v * tau + 0.5 * U * tau * tau;
        if (xx < 0 || xx > 1 || tau > 6) continue;
        K.dot(c, xK + ry * 0.05 + xx * d, y0 + (cy - y0) * xx * 0.4, Math.max(2.2, lw * 0.9), C.neg);
      }
    }
    var info = Ek > 0 ? ['hν = ' + E.toFixed(2) + ' eV', 'Ek max = hν − W₀ = ' + Ek.toFixed(2) + ' eV', '遏止电压 Uc = ' + Ek.toFixed(2) + ' V']
                      : ['hν = ' + E.toFixed(2) + ' eV < W₀ = ' + W.toFixed(2) + ' eV', 'ν < νc：不发生光电效应', '（与光强无关）'];
    K.lines(c, info, b.x2 - 4, b.y2 - fs * 3.6, Ek > 0 ? col : C.F, fs * 0.8, 'right');
  }
});

/* ---------- α 粒子散射（库仑斥力数值积分，动画） ---------- */
K.P('qAlphaN', { label: 'α粒子数', min: 5, max: 31, step: 2, def: 17 });
K.P('qAlphaD', { label: '最近距离（正碰）', min: 0.02, max: 0.25, step: 0.01, def: 0.07 });
K.reg({
  key: 'pm_rutherford', cat: 'modern', label: 'α粒子散射', animatable: true, params: ['qAlphaN', 'qAlphaD'],
  icon: '<circle cx="14" cy="12" r="2"/><path d="M1 6h22M1 9h11q4 0 6-7M1 12h9q2 0 0 0M1 15h11q4 0 6 7M1 18h22"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 100 || b.h < 70) return;
    var N = K.v(o, 'qAlphaN'), d0 = K.v(o, 'qAlphaD'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var cx = b.x1 + b.w * 0.55, cy = b.y1 + b.h / 2, sc = S;
    var key = N + ',' + d0 + ',' + b.w + ',' + b.h;
    var P = K.memo(o, key, function () {
      var out = [], D = d0 * sc, k = D / 2, Bm = b.h * 0.45;
      for (var i = 0; i < N; i++) {
        var bb = N === 1 ? 0 : -Bm + 2 * Bm * i / (N - 1), x = -(cx - b.x1 + 4), y = bb + (Math.abs(bb) < 1e-6 ? 0.0 : 0), vx = 1, vy = 0, pts = [[x, y]], ts = [0], tt = 0;
        for (var s = 0; s < 6000; s++) {
          var r = Math.hypot(x, y), dt = K.clamp(r / 40, 0.05, 2);
          var ax = k * x / (r * r * r), ay = k * y / (r * r * r);
          vx += ax * dt * 0.5; vy += ay * dt * 0.5; x += vx * dt; y += vy * dt;
          r = Math.hypot(x, y); ax = k * x / (r * r * r); ay = k * y / (r * r * r); vx += ax * dt * 0.5; vy += ay * dt * 0.5;
          tt += dt; if (s % 3 === 0) { pts.push([x, y]); ts.push(tt); }
          if (x > b.w || x < -b.w * 1.2 || Math.abs(y) > b.h) break;
        }
        out.push({ pts: pts, ts: ts, defl: Math.atan2(vy, vx) });
      }
      return out;
    });
    c.save(); c.beginPath(); c.rect(b.x1, b.y1, b.w, b.h); c.clip();
    var vpx = S * 0.45, T = (b.w * 1.25) / vpx, tsim = K.mod(K.t(o), T + 0.6) * vpx;
    P.forEach(function (a) {
      var pts = [], i = 0;
      while (i < a.ts.length && a.ts[i] <= tsim) { pts.push([cx + a.pts[i][0], cy + a.pts[i][1]]); i++; }
      if (pts.length > 1) {
        var big = Math.abs(a.defl) > PI / 2;
        K.poly(c, pts, big ? C.F : K.alpha(C.a, 0.8), big ? 1.6 : 1.1);
        var last = pts[pts.length - 1]; K.dot(c, last[0], last[1], Math.max(2.5, lw), big ? C.F : C.a);
      }
    });
    c.restore();
    K.circ(c, cx, cy, Math.max(4, S * 0.022), null, 0, '#fbbf24'); K.circ(c, cx, cy, S * 0.3, K.alpha(col, 0.15), 1, null, [3, 5]);
    K.txt(c, '金原子核', cx, cy + S * 0.05 + fs * 0.4, { c: col, s: fs * 0.8, ui: true });
    K.lines(c, ['绝大多数 α 粒子几乎不偏转', '少数发生大角度偏转（红色）', '极少数偏转超过 90°'], b.x1 + 4, b.y1 + 4, col, fs * 0.8);
  }
});

/* ---------- 放射性衰变 · 半衰期（动画 + N-t 图） ---------- */
K.P('qHalf', { label: '半衰期', min: 0.5, max: 6, step: 0.1, def: 2, unit: 's' });
K.P('qDecN', { label: '原子核边长数', min: 6, max: 24, step: 1, def: 14 });
K.reg({
  key: 'pm_decay', cat: 'modern', label: '放射性衰变·半衰期', animatable: true, params: ['qHalf', 'qDecN'],
  icon: '<circle cx="5" cy="5" r="1.6"/><circle cx="10" cy="5" r="1.6"/><circle cx="5" cy="10" r="1.6" opacity=".35"/><circle cx="10" cy="10" r="1.6"/><path d="M13 3v18h9"/><path d="M13 4q3 11 9 15"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 120 || b.h < 70) return;
    var Th = K.v(o, 'qHalf'), n = K.v(o, 'qDecN'), col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.05), tau = Th / Math.LN2, N0 = n * n;
    var LD = K.memo(o, 'dec' + n + ',' + Th, function () { var r = K.rng(2024 + n), a = []; for (var i = 0; i < N0; i++) a.push(-tau * Math.log(Math.max(1e-9, r()))); return { a: a, s: a.slice().sort(function (x, y) { return x - y; }) }; }), life = LD.a;
    var t = K.mod(K.t(o), Th * 5 + 1), gs = Math.min(b.w * 0.42, b.h - fs * 2), cell = gs / n, gx = b.x1 + 4, gy = b.y1 + (b.h - gs) / 2;
    var alive = 0;
    for (var i = 0; i < N0; i++) {
      var x = gx + (i % n + 0.5) * cell, y = gy + (Math.floor(i / n) + 0.5) * cell, dead = life[i] <= t;
      if (!dead) alive++;
      K.dot(c, x, y, cell * 0.36, dead ? K.alpha(col, 0.18) : '#f59e0b');
      if (dead && t - life[i] < 0.35) { var u = (t - life[i]) / 0.35, an = i * 2.4; K.dot(c, x + Math.cos(an) * cell * 2 * u, y + Math.sin(an) * cell * 2 * u, cell * 0.15, C.F); }
    }
    var ax = gx + gs + b.w * 0.06, A = K.axes(c, ax, b.y1, b.x2 - ax, b.h, { xmin: 0, xmax: 5 * Th, ymin: 0, ymax: 1.1, xl: 't', yl: 'N', col: col, fs: fs * 0.85, lw: 1.2 });
    K.plot(c, A, function (x) { return Math.pow(0.5, x / Th); }, 0, 5 * Th, K.alpha(col, 0.6), 1.2, [5, 4]);
    var pts = [], st = Math.max(0.02, Th / 40);
    var srt = LD.s, lo = 0; for (var q = 0; q <= t; q += st) { while (lo < N0 && srt[lo] <= q) lo++; pts.push([A.X(q), A.Y((N0 - lo) / N0)]); }
    pts.push([A.X(t), A.Y(alive / N0)]);
    K.poly(c, pts, C.a, lw);
    [1, 2, 3].forEach(function (m) { K.guide(c, A, m * Th, Math.pow(0.5, m), K.alpha(col, 0.45), 1); K.txt(c, m + 'T', A.X(m * Th), A.oy + fs * 0.9, { c: col, s: fs * 0.75, i: true }); });
    K.txt(c, 'N₀', A.ox - 4, A.Y(1), { c: col, s: fs * 0.8, al: 'right' });
    K.lines(c, ['N = N₀(1/2)^(t/T)', '剩余 ' + alive + '/' + N0, '半衰期对大量原子核才有统计意义'], A.X1 - b.w * 0.32, b.y1 + 4, col, fs * 0.75);
  }
});

/* ---------- α、β、γ 射线在磁场 / 电场中的偏转 ---------- */
K.sel('qRayField', '场', ['匀强磁场（垂直纸面向里）', '匀强电场（左正右负）'], 0);
K.reg({
  key: 'pm_rays', cat: 'modern', label: 'α β γ 射线偏转', params: ['qRayField'],
  icon: '<rect x="8" y="18" width="8" height="4"/><path d="M12 18V3"/><path d="M12 18q-1-8-5-14"/><path d="M12 18q3-5 9-6"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 80) return;
    var E = K.v(o, 'qRayField') === 1, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055);
    var cx = b.x1 + b.w / 2, lb = b.h * 0.16, ys = b.y2 - lb, top = b.y1 + fs * 1.6;
    K.box(c, cx - b.w * 0.1, ys, b.w * 0.2, lb - 2, col, lw, K.alpha(col, 0.35), 2);
    K.box(c, cx - 3, ys, 6, lb * 0.7, null, 0, 'rgba(0,0,0,.55)'); K.dot(c, cx, ys + lb * 0.7, 3.5, C.F);
    K.txt(c, '铅盒', cx + b.w * 0.14, ys + lb * 0.5, { c: col, s: fs * 0.8, al: 'left', ui: true });
    if (!E) K.bmarks(c, b.x1 + 4, top, b.w - 8, ys - top - 6, true, Math.max(26, S / 7), K.alpha(C.B, 0.5), 1.1);
    else { K.box(c, b.x1 + 4, top, 6, ys - top - 6, col, 1, K.alpha(C.pos, 0.7)); K.box(c, b.x2 - 10, top, 6, ys - top - 6, col, 1, K.alpha(C.neg, 0.7));
      K.txt(c, '+', b.x1 + 18, top + fs, { c: C.pos, s: fs * 1.2, b: true, ui: true }); K.txt(c, '−', b.x2 - 18, top + fs, { c: C.neg, s: fs * 1.2, b: true, ui: true }); }
    var H = ys - top, ptsA = [], ptsB = [];
    for (var i = 0; i <= 80; i++) {
      var y = ys - H * i / 80, h = ys - y;
      if (!E) { var Ra = H * 2.2, Rb = H * 0.55;
        if (h <= Ra) ptsA.push([cx - (Ra - Math.sqrt(Ra * Ra - h * h)), y]);
        if (h <= Rb) ptsB.push([cx + (Rb - Math.sqrt(Rb * Rb - h * h)), y]); }
      else { ptsA.push([cx + 0.22 * b.w * (h / H) * (h / H), y]); ptsB.push([cx - 0.42 * b.w * (h / H) * (h / H), y]); }
    }
    K.poly(c, ptsA, C.F, lw * 1.2); K.poly(c, ptsB, C.B, lw * 1.2); K.line(c, cx, ys, cx, top, C.a, lw * 1.2);
    var la = ptsA[ptsA.length - 1], lbb = ptsB[ptsB.length - 1];
    K.txt(c, 'α', la[0] + (E ? fs * 0.6 : -fs * 0.6), la[1] - fs * 0.5, { c: C.F, s: fs * 1.1, i: true });
    K.txt(c, 'β', lbb[0] + (E ? -fs * 0.6 : fs * 0.6), lbb[1] - fs * 0.5, { c: C.B, s: fs * 1.1, i: true });
    K.txt(c, 'γ', cx + fs * 0.6, top - fs * 0.3, { c: C.a, s: fs * 1.1, i: true });
    K.txt(c, 'α：氦核（带正电）  β：电子（带负电）  γ：光子（不带电）', b.x1 + 4, b.y1 + fs * 0.5, { c: col, s: fs * 0.72, al: 'left', ui: true });
  }
});

/* ---------- 玻尔模型：能级跃迁（动画） ---------- */
K.P('qNi', { label: '初态n', min: 1, max: 6, step: 1, def: 3 });
K.P('qNf', { label: '末态n', min: 1, max: 6, step: 1, def: 2 });
K.reg({
  key: 'pm_bohr', cat: 'modern', label: '玻尔模型·跃迁', animatable: true, params: ['qNi', 'qNf'],
  icon: '<circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="12" r="4"/><circle cx="9" cy="12" r="8"/><path d="M14 9l3-1.5 2 1 2-1"/><circle cx="17" cy="12" r="1" />',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 120 || b.h < 80) return;
    var ni = K.v(o, 'qNi'), nf = K.v(o, 'qNf'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var N = Math.max(ni, nf, 3), R = Math.min(b.h * 0.44, b.w * 0.32), cx = b.x1 + b.w * 0.36, cy = b.y1 + b.h / 2;
    var rn = function (n) { return R * n * n / (N * N); }, wn = function (n) { return Math.min(10, 1.3 * Math.pow(N / n, 3)); };
    for (var n = 1; n <= N; n++) { K.circ(c, cx, cy, rn(n), K.alpha(col, 0.4), 1, null, [4, 4]); K.txt(c, 'n=' + n, cx + rn(n) * 0.707 + 4, cy - rn(n) * 0.707 - 4, { c: col, s: fs * 0.7, al: 'left', ui: true }); }
    K.circ(c, cx, cy, Math.max(4, S * 0.02), null, 0, C.F);
    var lam = ni === nf ? 0 : 1e9 / (1.097e7 * Math.abs(1 / (nf * nf) - 1 / (ni * ni))), pc = lam ? K.wl(lam, 1) : col;
    var tau = K.mod(K.t(o), 4), em = ni > nf, r, th;
    if (ni === nf || tau < 1.6) { r = rn(ni); th = wn(ni) * tau; }
    else if (tau < 2) { var u = (tau - 1.6) / 0.4, us = u * u * (3 - 2 * u); r = rn(ni) + (rn(nf) - rn(ni)) * us; th = wn(ni) * 1.6 + (wn(ni) + wn(nf)) / 2 * (tau - 1.6); }
    else { r = rn(nf); th = wn(ni) * 1.6 + (wn(ni) + wn(nf)) * 0.2 + wn(nf) * (tau - 2); }
    var ex = cx + r * Math.cos(th), ey = cy - r * Math.sin(th);
    K.circ(c, ex, ey, Math.max(3.5, lw * 1.4), C.neg, 1, C.neg);
    if (ni !== nf) {
      var th1 = wn(ni) * 1.6 + (wn(ni) + wn(nf)) * 0.2, px0 = cx + rn(nf) * Math.cos(th1), py0 = cy - rn(nf) * Math.sin(th1);
      if (em && tau >= 2) { var u2 = (tau - 2) / 2, ux = Math.cos(th1), uy = -Math.sin(th1), L = R * 1.4 * u2;
        K.wavy(c, px0 + ux * L * 0.4, py0 + uy * L * 0.4, px0 + ux * (L + R * 0.25), py0 + uy * (L + R * 0.25), pc, 2, 4, 8, true); }
      if (!em && tau < 1.6) { var tx = cx + rn(ni) * Math.cos(wn(ni) * 1.6), ty = cy - rn(ni) * Math.sin(wn(ni) * 1.6), u3 = tau / 1.6, sx = b.x1 + 4, sy = ty;
        var hx = sx + (tx - sx) * u3, hy = sy + (ty - sy) * u3; K.wavy(c, Math.max(sx, hx - R * 0.35), hy, hx, hy, pc, 2, 4, 8, true); }
    }
    var lx = b.x1 + b.w * 0.72, lw2 = b.w * 0.24, yT = b.y1 + fs * 1.5, yB = b.y2 - fs * 1.2;
    var Y = function (n) { return yT + (yB - yT) * (1 - 1 / (n * n)) * -1 + (yB - yT); };
    for (var m = 1; m <= 6; m++) { var yy = yB - (yB - yT) * (1 - 1 / (m * m)); K.line(c, lx, yy, lx + lw2, yy, K.alpha(col, m === ni || m === nf ? 0.95 : 0.45), m === ni || m === nf ? 1.6 : 1);
      K.txt(c, (-13.6 / (m * m)).toFixed(2), lx + lw2 + 3, yy, { c: col, s: fs * 0.65, al: 'left', ui: true }); }
    if (ni !== nf) { var ya = yB - (yB - yT) * (1 - 1 / (ni * ni)), yb2 = yB - (yB - yT) * (1 - 1 / (nf * nf)); K.arrow(c, lx + lw2 * 0.5, ya, lx + lw2 * 0.5, yb2, pc, 2, 8); }
    K.txt(c, 'E/eV', lx + lw2 + 3, yT - fs * 0.8, { c: col, s: fs * 0.65, al: 'left', ui: true });
    var dE = Math.abs(13.6 / (nf * nf) - 13.6 / (ni * ni)), ser = Math.min(ni, nf) === 1 ? '莱曼系·紫外' : Math.min(ni, nf) === 2 ? '巴耳末系' : '帕邢系等·红外';
    K.lines(c, ni === nf ? ['初态 = 末态：无跃迁'] : [(em ? '辐射' : '吸收') + '光子 hν = |Em − En| = ' + dE.toFixed(2) + ' eV', 'λ = ' + lam.toFixed(0) + ' nm（' + ser + '）', 'rn = n²r₁   En = E₁/n²'],
      b.x1 + 4, b.y1 + 4, col, fs * 0.78);
  }
});

/* ---------- 重核裂变 · 链式反应（动画） ---------- */
K.reg({
  key: 'pm_fission', cat: 'modern', label: '链式反应', animatable: true,
  icon: '<circle cx="5" cy="12" r="2.5"/><circle cx="13" cy="6" r="2"/><circle cx="13" cy="12" r="2"/><circle cx="13" cy="18" r="2"/><path d="M7.5 12h3M7 10.5l4-3M7 13.5l4 3"/><path d="M15 6h4M15 12h4M15 18h4" stroke-dasharray="1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 140 || b.h < 90) return;
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05), t = K.mod(K.t(o), 5.2), Tg = 1.1;
    var ru = K.clamp(b.h * 0.045, 5, 20), cy = b.y1 + b.h * 0.46, X = [b.x1 + b.w * 0.16, b.x1 + b.w * 0.42, b.x1 + b.w * 0.68];
    var nodes = [{ g: 0, x: X[0], y: cy, p: null }], sp = [b.h * 0.3, b.h * 0.1];
    for (var g = 1; g <= 2; g++) nodes.filter(function (n) { return n.g === g - 1; }).forEach(function (par) {
      for (var k = -1; k <= 1; k++) nodes.push({ g: g, x: X[g], y: par.y + k * sp[g - 1], p: par }); });
    var neu = function (x1, y1, x2, y2, u) { if (u <= 0 || u > 1) return; var x = x1 + (x2 - x1) * u, y = y1 + (y2 - y1) * u;
      K.line(c, x1 + (x2 - x1) * Math.max(0, u - 0.25), y1 + (y2 - y1) * Math.max(0, u - 0.25), x, y, K.alpha(col, 0.35), 1); K.dot(c, x, y, ru * 0.32, '#d1d5db'); };
    neu(b.x1 + 4, cy, X[0] - ru, cy, t / 0.6);
    nodes.forEach(function (n) {
      var ts = 0.6 + n.g * Tg;
      if (t < ts) { K.circ(c, n.x, n.y, ru, '#b45309', 1, 'rgba(245,158,11,.85)'); if (n.g === 0) K.txt(c, '²³⁵U', n.x, n.y - ru - fs * 0.6, { c: col, s: fs * 0.8 }); return; }
      var u = Math.min(1, (t - ts) / 0.9), d = ru * (n.g ? 1.15 : 2.2) * u, fr = n.g ? 0.8 : 1, al = 1 - Math.max(0, (t - ts - 1.4) / 1.5);
      if (al > 0) { K.circ(c, n.x - d * 0.5, n.y - d, ru * 0.72 * fr, null, 0, K.alpha('#38bdf8', 0.85 * al)); K.circ(c, n.x - d * 0.5, n.y + d, ru * 0.62 * fr, null, 0, K.alpha('#22c55e', 0.85 * al)); }
      if (n.g === 0 && t - ts < 1.2) { K.txt(c, 'Ba', n.x - d * 0.5 - ru * 1.6, n.y - d, { c: '#38bdf8', s: fs * 0.75 }); K.txt(c, 'Kr', n.x - d * 0.5 - ru * 1.6, n.y + d, { c: '#22c55e', s: fs * 0.75 }); }
      var kids = nodes.filter(function (m) { return m.p === n; }), un = (t - ts) / (Tg - 0.1);
      if (kids.length) kids.forEach(function (kd) { neu(n.x + ru, n.y, kd.x - ru, kd.y, un); });
      else for (var k = -1; k <= 1; k++) neu(n.x + ru, n.y, b.x2 - 4, n.y + k * b.h * 0.035, un * 0.8);
      if (al > 0.5) { K.circ(c, n.x, n.y, ru * 1.6 * u, K.alpha('#fde047', (1 - u) * 0.9), 2); }
    });
    K.txt(c, '²³⁵₉₂U + ¹₀n → ¹⁴⁴₅₆Ba + ⁸⁹₃₆Kr + 3¹₀n', b.x1 + 4, b.y2 - fs * 1.9, { c: col, s: fs, al: 'left' });
    K.txt(c, '中子数逐代倍增 → 链式反应（铀块体积需大于临界体积）', b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.78, al: 'left', ui: true });
  }
});
})();

/* ===================== 扩展 · 物理图像（一轮复习常用） ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI;
var ax = function (c, b, o) { o.fs = o.fs || K.fs(K.S(b), 0.055); o.lw = 1.4; return K.axes(c, b.x1, b.y1, b.w, b.h, o); };
var GI = '<path d="M4 3v17h17"/>';

/* ---------- 运动图像 ---------- */
K.sel('qMot', '图像', ['v-t 匀加速', 'v-t 匀减速', 'x-t 匀速（甲乙）', 'x-t 匀加速', 'v-t 追及相遇', 'v-t 竖直上抛'], 0);
K.tog('qArea', '标注面积/斜率', true);
K.reg({
  key: 'pm_g_motion', cat: 'graph', label: '运动图像', params: ['qMot', 'qArea'],
  icon: GI + '<path d="M4 15l15-9"/><path d="M4 15h11V9" stroke-dasharray="1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var m = K.v(o, 'qMot'), sh = K.v(o, 'qArea'), col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055), Ac = K.alpha(C.a, 0.2);
    if (m === 0 || m === 1 || m === 5) {
      var A = ax(c, b, { xmin: 0, xmax: 4.4, ymin: m === 5 ? -1.2 : 0, ymax: m === 5 ? 1.25 : 1.15, xl: 't', yl: 'v', col: col });
      var f = m === 0 ? function (t) { return 0.3 + 0.18 * t; } : m === 1 ? function (t) { return Math.max(0, 1 - 0.3 * t); } : function (t) { return 1 - 0.5 * t; };
      var te = m === 1 ? 1 / 0.3 : 4;
      if (sh) { K.fillUnder(c, A, f, 0, m === 5 ? 2 : te, Ac); if (m === 5) K.fillUnder(c, A, f, 2, 4, K.alpha(C.B, 0.2)); }
      K.plot(c, A, f, 0, m === 1 ? te : 4, C.a, lw);
      K.txt(c, 'v₀', A.ox - 4, A.Y(f(0)), { c: col, s: fs, al: 'right', i: true });
      if (m === 0) { K.guide(c, A, 3, f(3), K.alpha(col, 0.5), 1); K.txt(c, 't', A.X(3), A.oy + fs * 0.9, { c: col, s: fs, i: true }); K.txt(c, 'v', A.ox - 4, A.Y(f(3)), { c: col, s: fs, al: 'right', i: true });
        if (sh) { K.txt(c, '面积 = 位移 x', A.X(1.5), A.Y(0.28), { c: C.a, s: fs * 0.85, ui: true }); K.txt(c, '斜率 = a', A.X(3.4), A.Y(f(3.4)) - fs, { c: col, s: fs * 0.85, ui: true }); } }
      if (m === 1 && sh) K.txt(c, 'x = v₀²/(2a)', A.X(1.1), A.Y(0.3), { c: C.a, s: fs * 0.85, i: true });
      if (m === 5) { K.txt(c, '上升', A.X(0.9), A.Y(0.22), { c: C.a, s: fs * 0.85, ui: true }); K.txt(c, '下降', A.X(3.1), A.Y(-0.22), { c: C.B, s: fs * 0.85, ui: true });
        K.txt(c, '斜率 = −g，两块面积相等 → 回到抛出点', A.X1, A.Y0 + fs * 0.3, { c: col, s: fs * 0.8, al: 'right', ui: true }); }
    } else if (m === 2 || m === 3) {
      var B = ax(c, b, { xmin: 0, xmax: 4.4, ymin: 0, ymax: 1.15, xl: 't', yl: 'x', col: col });
      if (m === 2) { K.plot(c, B, function (t) { return 0.25 * t; }, 0, 4.2, C.a, lw); K.plot(c, B, function (t) { return 0.4 + 0.12 * t; }, 0, 4.2, C.B, lw);
        K.txt(c, '甲', B.X(4), B.Y(1) - fs, { c: C.a, s: fs }); K.txt(c, '乙', B.X(4), B.Y(0.88) + fs, { c: C.B, s: fs });
        var tm = 0.4 / 0.13; K.guide(c, B, tm, 0.25 * tm, K.alpha(col, 0.5), 1); K.txt(c, '相遇', B.X(tm), B.Y(0.25 * tm) - fs, { c: col, s: fs * 0.85, ui: true });
        if (sh) K.txt(c, '斜率 = 速度', B.X(1.2), B.Y(0.75), { c: col, s: fs * 0.85, ui: true }); }
      else { var g = function (t) { return 0.055 * t * t; }; K.plot(c, B, g, 0, 4.4, C.a, lw);
        if (sh) { K.plot(c, B, function (t) { return g(3) + 0.33 * (t - 3); }, 1.6, 4.3, K.alpha(C.F, 0.9), 1.2, [5, 4]); K.dot(c, B.X(3), B.Y(g(3)), 3.5, C.F);
          K.txt(c, '切线斜率 = 瞬时速度', B.X(1.6), B.Y(0.5), { c: C.F, s: fs * 0.85, ui: true }); } }
    } else {
      var D = ax(c, b, { xmin: 0, xmax: 4.4, ymin: 0, ymax: 1.25, xl: 't', yl: 'v', col: col }), v1 = 0.6, a = 0.3, tm2 = v1 / a;
      if (sh) { c.save(); c.beginPath(); c.moveTo(D.X(0), D.Y(v1)); c.lineTo(D.X(tm2), D.Y(v1)); c.lineTo(D.X(0), D.Y(0)); c.closePath(); c.fillStyle = Ac; c.fill(); c.restore(); }
      K.plot(c, D, function () { return v1; }, 0, 4.2, C.B, lw); K.plot(c, D, function (t) { return a * t; }, 0, 4.1, C.a, lw);
      K.guide(c, D, tm2, v1, K.alpha(col, 0.5), 1); K.txt(c, 't₀', D.X(tm2), D.oy + fs * 0.9, { c: col, s: fs, i: true });
      K.txt(c, '甲（匀速）', D.X(3.4), D.Y(v1) - fs, { c: C.B, s: fs * 0.85, ui: true }); K.txt(c, '乙（匀加速）', D.X(3.6), D.Y(a * 3.6) + fs * 0.2, { c: C.a, s: fs * 0.85, al: 'left', ui: true });
      K.txt(c, '共速时两者距离最大（三角形面积）', D.X1, D.Y0 + fs * 0.3, { c: col, s: fs * 0.8, al: 'right', ui: true });
    }
  }
});

/* ---------- 气体图像 ---------- */
K.sel('qGas', '图像', ['p-V 等温线', 'p-1/V 等温线', 'p-T 等容线', 'V-T 等压线', 'p-V 循环过程'], 0);
K.reg({
  key: 'pm_g_gas', cat: 'graph', label: '气体状态图像', params: ['qGas'],
  icon: GI + '<path d="M6 5q2 10 14 12"/><path d="M8 4q3 8 13 9" opacity=".5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var m = K.v(o, 'qGas'), col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055), c1 = C.a, c2 = C.F;
    if (m === 0) { var A = ax(c, b, { xmin: 0, xmax: 4, ymin: 0, ymax: 4, xl: 'V', yl: 'p', col: col });
      K.plot(c, A, function (v) { return 1 / v; }, 0.25, 4, c1, lw); K.plot(c, A, function (v) { return 2 / v; }, 0.5, 4, c2, lw);
      K.txt(c, 'T₁', A.X(3.6), A.Y(1 / 3.6) - fs * 0.8, { c: c1, s: fs, i: true }); K.txt(c, 'T₂', A.X(3.6), A.Y(2 / 3.6) - fs * 0.8, { c: c2, s: fs, i: true });
      K.txt(c, 'T₂ > T₁（离原点越远温度越高）', A.X1, A.Y0, { c: col, s: fs * 0.8, al: 'right', ui: true }); }
    else if (m === 1) { var B = ax(c, b, { xmin: 0, xmax: 4, ymin: 0, ymax: 4, xl: '1/V', yl: 'p', col: col });
      K.plot(c, B, function (x) { return 0.6 * x; }, 0, 4, c1, lw); K.plot(c, B, function (x) { return 0.95 * x; }, 0, 4, c2, lw);
      K.txt(c, 'T₁', B.X(3.8), B.Y(2.28) + fs, { c: c1, s: fs, i: true }); K.txt(c, 'T₂', B.X(3.6), B.Y(3.42) - fs, { c: c2, s: fs, i: true });
      K.txt(c, '过原点直线，斜率越大温度越高', B.X1, B.Y0, { c: col, s: fs * 0.8, al: 'right', ui: true }); }
    else if (m === 2 || m === 3) { var D = ax(c, b, { xmin: -1.2, xmax: 4, ymin: 0, ymax: 4, xl: 'T', yl: m === 2 ? 'p' : 'V', col: col });
      [[0.75, c1], [0.45, c2]].forEach(function (q, k) {
        K.plot(c, D, function (T) { return q[0] * T; }, 0, 0.8, K.alpha(q[1], 0.7), 1.2, [4, 4]); K.plot(c, D, function (T) { return q[0] * T; }, 0.8, 4, q[1], lw);
        K.txt(c, (m === 2 ? 'V' : 'p') + (k ? '₂' : '₁'), D.X(4) - fs, D.Y(q[0] * 4) - fs * 0.4, { c: q[1], s: fs, i: true }); });
      K.txt(c, m === 2 ? '等容线：V₁ < V₂（斜率越大体积越小）' : '等压线：p₁ < p₂（斜率越大压强越小）', D.X1, D.Y0, { c: col, s: fs * 0.8, al: 'right', ui: true });
      K.txt(c, 'T 为热力学温度，延长线过 0 K', D.X0 + 4, D.Y0 + fs * 1.3, { c: col, s: fs * 0.72, al: 'left', ui: true }); }
    else { var E = ax(c, b, { xmin: 0, xmax: 4, ymin: 0, ymax: 4, xl: 'V', yl: 'p', col: col });
      K.plot(c, E, function (v) { return 3 / v; }, 1, 3, c1, lw);
      K.line(c, E.X(3), E.Y(1), E.X(1), E.Y(1), c1, lw); K.line(c, E.X(1), E.Y(1), E.X(1), E.Y(3), c1, lw);
      K.head(c, E.X(2), E.Y(1.5), 0.86, 0.5, 9, c1); K.head(c, E.X(2), E.Y(1), -1, 0, 9, c1); K.head(c, E.X(1), E.Y(2), 0, -1, 9, c1);
      [[[1, 3], 'A'], [[3, 1], 'B'], [[1, 1], 'C']].forEach(function (q) { K.dot(c, E.X(q[0][0]), E.Y(q[0][1]), 3.5, C.F); K.txt(c, q[1], E.X(q[0][0]) + fs * 0.7, E.Y(q[0][1]) - fs * 0.6, { c: col, s: fs, i: true }); });
      K.lines(c, ['A→B 等温膨胀：吸热，对外做功', 'B→C 等压压缩：放热', 'C→A 等容升温：吸热', '闭合曲线面积 = 循环净功'], E.X(1.9), E.Y0, col, fs * 0.75); }
  }
});

/* ---------- 分子力 / 分子势能（伦纳德-琼斯势） ---------- */
K.sel('qMolG', '图像', ['分子力 F-r', '分子势能 Ep-r'], 0);
K.reg({
  key: 'pm_g_molecular', cat: 'graph', label: '分子力·分子势能', params: ['qMolG'],
  icon: GI + '<path d="M6 3q1 14 4 13t10-3"/><path d="M4 13h17" stroke-dasharray="1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var ep = K.v(o, 'qMolG') === 1, col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055), r0 = Math.pow(2, 1 / 6);
    var A = ax(c, b, { xmin: 0, xmax: 3, ymin: ep ? -1.4 : -1.6, ymax: ep ? 2.2 : 2.6, xl: 'r', yl: ep ? 'Ep' : 'F', col: col });
    if (!ep) {
      var Fr = function (r) { return 16 * Math.pow(r, -13); }, Fa = function (r) { return -8 * Math.pow(r, -7); };
      K.plot(c, A, Fr, 0.85, 3, K.alpha(C.F, 0.8), 1.2, [5, 4]); K.plot(c, A, Fa, 0.85, 3, K.alpha(C.B, 0.8), 1.2, [5, 4]);
      K.plot(c, A, function (r) { return Fr(r) + Fa(r); }, 0.85, 3, C.a, lw);
      K.txt(c, '斥力', A.X(1.05), A.Y(2.2), { c: C.F, s: fs * 0.85, al: 'left', ui: true }); K.txt(c, '引力', A.X(1.05), A.Y(-1.35), { c: C.B, s: fs * 0.85, al: 'left', ui: true });
      K.txt(c, '合力', A.X(2.2), A.Y(-0.25), { c: C.a, s: fs * 0.85, ui: true });
    } else {
      K.plot(c, A, function (r) { return 4 * (Math.pow(r, -12) - Math.pow(r, -6)); }, 0.88, 3, C.a, lw);
      K.guide(c, A, r0, -1, K.alpha(col, 0.5), 1); K.txt(c, 'Ep 最小', A.X(r0) + fs * 0.5, A.Y(-1) + fs * 0.9, { c: C.a, s: fs * 0.85, al: 'left', ui: true });
    }
    K.dot(c, A.X(r0), A.oy, 3.5, C.F); K.txt(c, 'r₀', A.X(r0), A.oy + fs * 0.9, { c: col, s: fs, i: true });
    K.txt(c, ep ? 'r = r₀ 时分子势能最小（取无穷远为零）' : 'r < r₀ 表现为斥力，r > r₀ 表现为引力', A.X1, A.Y0, { c: col, s: fs * 0.78, al: 'right', ui: true });
  }
});

/* ---------- 气体分子速率分布（麦克斯韦分布，O₂） ---------- */
K.reg({
  key: 'pm_g_maxwell', cat: 'graph', label: '分子速率分布', 
  icon: GI + '<path d="M4 20q4-16 7-12t10 11"/><path d="M4 20q3-12 6-9t11 8" opacity=".5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.05), m = 32 * 1.6605e-27, kB = 1.380649e-23;
    var A = ax(c, b, { xmin: 0, xmax: 1300, ymin: 0, ymax: 26, xl: 'v', yl: 'f(v)', col: col });
    [[273, C.B, '0 ℃'], [373, C.F, '100 ℃']].forEach(function (q) {
      var T = q[0], f = function (v) { return 4 * PI * Math.pow(m / (2 * PI * kB * T), 1.5) * v * v * Math.exp(-m * v * v / (2 * kB * T)) * 1e4; };
      K.plot(c, A, f, 0, 1300, q[1], lw); var vp = Math.sqrt(2 * kB * T / m);
      K.guide(c, A, vp, f(vp), K.alpha(q[1], 0.5), 1); K.txt(c, q[2], A.X(vp) + fs * 0.4, A.Y(f(vp)) - fs * 0.7, { c: q[1], s: fs * 0.85, al: 'left', ui: true });
    });
    for (var v = 200; v <= 1200; v += 200) K.txt(c, String(v), A.X(v), A.oy + fs * 0.9, { c: col, s: fs * 0.7, ui: true });
    K.txt(c, '“中间多、两头少”；温度升高峰值右移变矮，曲线下面积均为 1', A.X1, A.Y0, { c: col, s: fs * 0.75, al: 'right', ui: true });
  }
});

/* ---------- U-I / I-U 图像 ---------- */
K.sel('qUIG', '图像', ['电源 U-I 与电阻工作点', '小灯泡 I-U（非线性）', '两个电源 U-I 比较'], 0);
K.reg({
  key: 'pm_g_ui', cat: 'graph', label: '伏安特性图像', params: ['qUIG'],
  icon: GI + '<path d="M4 6l16 10"/><path d="M4 20l12-10"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var m = K.v(o, 'qUIG'), col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055);
    if (m === 0) { var A = ax(c, b, { xmin: 0, xmax: 3.5, ymin: 0, ymax: 3.6, xl: 'I', yl: 'U', col: col });
      K.plot(c, A, function (i) { return 3 - i; }, 0, 3, C.a, lw); K.plot(c, A, function (i) { return 2 * i; }, 0, 1.7, C.B, lw);
      K.guide(c, A, 1, 2, K.alpha(col, 0.5), 1); K.dot(c, A.X(1), A.Y(2), 4, C.F); K.txt(c, '工作点', A.X(1) + fs * 0.5, A.Y(2) - fs * 0.6, { c: C.F, s: fs * 0.85, al: 'left', ui: true });
      K.txt(c, 'E', A.ox - 4, A.Y(3), { c: col, s: fs, al: 'right', i: true }); K.txt(c, 'I短 = E/r', A.X(3), A.oy + fs * 0.9, { c: col, s: fs * 0.85, i: true });
      K.txt(c, '电源', A.X(2.4), A.Y(0.6) - fs * 0.6, { c: C.a, s: fs * 0.85, al: 'left', ui: true }); K.txt(c, '电阻 R', A.X(1.6), A.Y(3.2), { c: C.B, s: fs * 0.85, al: 'left', ui: true });
      K.txt(c, '斜率绝对值 = r，阴影矩形面积 = 输出功率', A.X1, A.Y0, { c: col, s: fs * 0.75, al: 'right', ui: true });
      K.box(c, A.ox, A.Y(2), A.X(1) - A.ox, A.oy - A.Y(2), null, 0, K.alpha(C.a, 0.15)); }
    else if (m === 1) { var B = ax(c, b, { xmin: 0, xmax: 4, ymin: 0, ymax: 1.6, xl: 'U', yl: 'I', col: col });
      K.plot(c, B, function (u) { return 0.62 * Math.pow(u, 0.6); }, 0, 4, C.a, lw); K.plot(c, B, function (u) { return 0.33 * u; }, 0, 4, C.B, lw, [6, 4]);
      K.txt(c, '小灯泡', B.X(3.3), B.Y(0.62 * Math.pow(3.3, 0.6)) - fs, { c: C.a, s: fs * 0.85, ui: true }); K.txt(c, '定值电阻', B.X(3.2), B.Y(1.06) + fs, { c: C.B, s: fs * 0.85, ui: true });
      K.txt(c, '曲线上点与原点连线斜率 = 1/R，温度升高 R 增大', B.X1, B.Y0, { c: col, s: fs * 0.75, al: 'right', ui: true }); }
    else { var D = ax(c, b, { xmin: 0, xmax: 5.2, ymin: 0, ymax: 3.6, xl: 'I', yl: 'U', col: col });
      K.plot(c, D, function (i) { return 3 - i; }, 0, 3, C.a, lw); K.plot(c, D, function (i) { return 2.4 - 0.5 * i; }, 0, 4.8, C.F, lw);
      K.txt(c, '1', D.X(0.4), D.Y(2.6) - fs * 0.6, { c: C.a, s: fs }); K.txt(c, '2', D.X(4.2), D.Y(0.3) - fs * 0.6, { c: C.F, s: fs });
      K.txt(c, 'E₁ > E₂ ，r₁ > r₂', D.X1, D.Y0, { c: col, s: fs * 0.8, al: 'right', ui: true }); }
  }
});

/* ---------- 光电效应 Ek-ν / Uc-ν ---------- */
K.sel('qEkG', '图像', ['Ek-ν 图像', 'Uc-ν 图像'], 0);
K.reg({
  key: 'pm_g_ekv', cat: 'graph', label: '光电效应图像', params: ['qEkG'],
  icon: GI + '<path d="M8 20l12-12"/><path d="M12 20l8-8" opacity=".5"/><path d="M4 23l4-3" stroke-dasharray="1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var uc = K.v(o, 'qEkG') === 1, col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055), h = 0.41357;
    var A = ax(c, b, { xmin: 0, xmax: 16, ymin: -5, ymax: 6.2, xl: 'ν', yl: uc ? 'Uc' : 'Ek', col: col });
    [[2.29, C.a, '钠'], [3.2, C.F, '钙']].forEach(function (q) {
      var nc = q[0] / h, f = function (v) { return h * v - q[0]; };
      K.plot(c, A, f, 0, nc, K.alpha(q[1], 0.7), 1.2, [5, 4]); K.plot(c, A, f, nc, 16, q[1], lw);
      K.dot(c, A.X(nc), A.oy, 3.5, q[1]); K.txt(c, 'νc', A.X(nc), A.oy + fs * 0.9, { c: q[1], s: fs * 0.85, i: true });
      K.txt(c, q[2], A.X(14.5), A.Y(f(14.5)) - fs * 0.9, { c: q[1], s: fs * 0.85, ui: true });
      K.txt(c, uc ? '−W₀/e' : '−W₀', A.ox + 4, A.Y(-q[0]), { c: q[1], s: fs * 0.8, al: 'left', i: true });
    });
    K.txt(c, uc ? '斜率 = h/e（与金属无关）' : '斜率 = h（与金属无关），横截距 = 截止频率', A.X1, A.Y0, { c: col, s: fs * 0.78, al: 'right', ui: true });
  }
});

/* ---------- 黑体辐射（普朗克公式） ---------- */
K.reg({
  key: 'pm_g_blackbody', cat: 'graph', label: '黑体辐射规律',
  icon: GI + '<path d="M5 20q3-15 5-12t11 9"/><path d="M5 20q4-9 7-7t9 6" opacity=".5"/><path d="M6 6l6 6" stroke-dasharray="1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var col = o.color, lw = K.lw(o) * 1.1, fs = K.fs(K.S(b), 0.05), Ts = [1300, 1500, 1700, 2000], cl = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];
    var Pl = function (l, T) { return Math.pow(l, -5) / (Math.exp(14388 / (l * T)) - 1); }, mx = Pl(2898 / 2000, 2000);
    var A = ax(c, b, { xmin: 0, xmax: 6, ymin: 0, ymax: 1.12, xl: 'λ/μm', yl: 'I', col: col });
    for (var w = 380; w < 780; w += 8) K.box(c, A.X(w / 1000), A.oy - 6, A.X((w + 8) / 1000) - A.X(w / 1000) + 0.5, 6, null, 0, K.wl(w + 4, 0.9));
    var pk = [];
    Ts.forEach(function (T, k) { K.plot(c, A, function (l) { return Pl(l, T) / mx; }, 0.2, 6, cl[k], lw); var lp = 2898 / T; pk.push([A.X(lp), A.Y(Pl(lp, T) / mx)]);
      K.txt(c, T + ' K', A.X(lp) + fs * 0.3, A.Y(Pl(lp, T) / mx) - fs * 0.7, { c: cl[k], s: fs * 0.8, al: 'left', ui: true }); });
    K.poly(c, pk, K.alpha(col, 0.6), 1, [4, 4]);
    for (var x = 1; x <= 5; x++) K.txt(c, String(x), A.X(x), A.oy + fs * 0.9, { c: col, s: fs * 0.72, ui: true });
    K.txt(c, '温度升高：各波长辐射强度都增大，极大值向短波方向移动', A.X1, A.Y0, { c: col, s: fs * 0.75, al: 'right', ui: true });
  }
});

/* ---------- 比结合能曲线（半经验质量公式 + 轻核实测值） ---------- */
K.reg({
  key: 'pm_g_binding', cat: 'graph', label: '比结合能曲线',
  icon: GI + '<path d="M5 18l1-8 1 2 3-5q4-2 10 0"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 60) return;
    var col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.05);
    var A = ax(c, b, { xmin: 0, xmax: 250, ymin: 0, ymax: 9.6, xl: 'A', yl: 'E/A (MeV)', col: col });
    var semf = function (a) { var z = a / (2 + 0.0155 * Math.pow(a, 2 / 3)); return (15.75 * a - 17.8 * Math.pow(a, 2 / 3) - 0.711 * z * z / Math.pow(a, 1 / 3) - 23.7 * (a - 2 * z) * (a - 2 * z) / a) / a; };
    var data = [[2, 1.11, '²H'], [3, 2.83, '³H'], [4, 7.07, '⁴He'], [6, 5.33, '⁶Li'], [7, 5.61, ''], [9, 6.46, ''], [11, 6.93, ''], [12, 7.68, '¹²C'], [14, 7.48, ''], [16, 7.98, '¹⁶O']];
    var pts = data.map(function (d) { return [A.X(d[0]), A.Y(d[1])]; });
    for (var a = 18; a <= 245; a += 2) pts.push([A.X(a), A.Y(semf(a))]);
    K.poly(c, pts, C.a, lw);
    data.forEach(function (d) { K.dot(c, A.X(d[0]), A.Y(d[1]), 2.8, C.F); if (d[2]) K.txt(c, d[2], A.X(d[0]) + fs * 0.4, A.Y(d[1]) - fs * 0.5, { c: col, s: fs * 0.72, al: 'left' }); });
    K.dot(c, A.X(56), A.Y(8.79), 4, C.F); K.txt(c, '⁵⁶Fe 最稳定', A.X(56), A.Y(8.79) - fs * 0.9, { c: C.F, s: fs * 0.8 });
    K.dot(c, A.X(235), A.Y(7.59), 3.5, C.F); K.txt(c, '²³⁵U', A.X(235), A.Y(7.59) - fs * 0.8, { c: col, s: fs * 0.75 });
    K.arrow(c, A.X(30), A.Y(4.2), A.X(52), A.Y(4.2), C.v, 1.4); K.txt(c, '轻核聚变放能', A.X(41), A.Y(4.2) - fs * 0.8, { c: C.v, s: fs * 0.78, ui: true });
    K.arrow(c, A.X(230), A.Y(4.2), A.X(160), A.Y(4.2), C.v, 1.4); K.txt(c, '重核裂变放能', A.X(195), A.Y(4.2) - fs * 0.8, { c: C.v, s: fs * 0.78, ui: true });
    for (var x = 50; x <= 200; x += 50) K.txt(c, String(x), A.X(x), A.oy + fs * 0.9, { c: col, s: fs * 0.7, ui: true });
  }
});

/* ---------- 共振曲线 ---------- */
K.reg({
  key: 'pm_g_resonance', cat: 'graph', label: '共振曲线',
  icon: GI + '<path d="M4 17q6-1 7-12 1 11 9 13"/><path d="M4 17q6-2 7-6 1 5 9 7" opacity=".5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055);
    var A = ax(c, b, { xmin: 0, xmax: 2.2, ymin: 0, ymax: 12, xl: 'f驱', yl: 'A', col: col });
    [[0.055, C.F, '阻尼小'], [0.14, C.a, ''], [0.35, C.B, '阻尼大']].forEach(function (q) {
      var f = function (x) { return 1 / Math.sqrt(Math.pow(1 - x * x, 2) + Math.pow(2 * q[0] * x, 2)); };
      K.plot(c, A, f, 0, 2.2, q[1], lw, null, 400); if (q[2]) K.txt(c, q[2], A.X(1.12), A.Y(f(1)) - fs * 0.2, { c: q[1], s: fs * 0.8, al: 'left', ui: true });
    });
    K.line(c, A.X(1), A.Y0, A.X(1), A.oy, K.alpha(col, 0.5), 1, [4, 4]); K.txt(c, 'f固', A.X(1), A.oy + fs * 0.9, { c: col, s: fs, i: true });
    K.txt(c, 'f驱 = f固 时振幅最大（共振）', A.X1, A.Y0, { c: col, s: fs * 0.8, al: 'right', ui: true });
  }
});

/* ---------- 熔化 / 凝固图像 ---------- */
K.sel('qMelt', '图像', ['晶体熔化', '非晶体熔化', '晶体凝固'], 0);
K.reg({
  key: 'pm_g_melt', cat: 'graph', label: '熔化·凝固图像', params: ['qMelt'],
  icon: GI + '<path d="M4 18l5-7h6l5-7"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var m = K.v(o, 'qMelt'), col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055);
    var A = ax(c, b, { xmin: 0, xmax: 10, ymin: 0, ymax: 10, xl: 't', yl: 'T', col: col });
    var P = m === 0 ? [[0, 2], [3, 5.5], [7, 5.5], [9.5, 9]] : m === 2 ? [[0, 9], [3, 5.5], [7, 5.5], [9.5, 2]] : null;
    if (P) {
      K.poly(c, P.map(function (q) { return [A.X(q[0]), A.Y(q[1])]; }), C.a, lw);
      K.line(c, A.ox, A.Y(5.5), A.X(3), A.Y(5.5), K.alpha(col, 0.5), 1, [4, 4]); K.txt(c, m ? '凝固点' : '熔点', A.ox - 4, A.Y(5.5), { c: col, s: fs * 0.8, al: 'right', ui: true });
      K.txt(c, m ? '固液共存，放热温度不变' : '固液共存，吸热温度不变', A.X(5), A.Y(5.5) - fs, { c: C.a, s: fs * 0.8, ui: true });
      K.txt(c, m ? '液态' : '固态', A.X(1.2), A.Y(m ? 8.3 : 2.9) - fs * 0.6, { c: col, s: fs * 0.8, ui: true });
      K.txt(c, m ? '固态' : '液态', A.X(8.6), A.Y(m ? 3.2 : 7.9) - fs * 0.4, { c: col, s: fs * 0.8, al: 'left', ui: true });
    } else {
      K.plot(c, A, function (t) { return 2 + 7 * (1 - Math.exp(-t / 4.5)) + 0.08 * t; }, 0, 9.5, C.a, lw);
      K.txt(c, '非晶体没有确定的熔点', A.X1, A.Y0, { c: col, s: fs * 0.8, al: 'right', ui: true });
    }
  }
});

/* ---------- φ-x / E-x 图像（两点电荷连线上） ---------- */
K.sel('qPhiX', '图像', ['等量异种 φ-x', '等量同种 φ-x', '等量异种 E-x', '等量同种 E-x'], 0);
K.reg({
  key: 'pm_g_phix', cat: 'graph', label: 'φ-x·E-x 图像', params: ['qPhiX'],
  icon: '<path d="M2 12h20M12 3v18"/><path d="M3 4q4 0 5 6t8 4 5 6"/><circle cx="7" cy="12" r="1"/><circle cx="17" cy="12" r="1"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 60) return;
    var m = K.v(o, 'qPhiX'), col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055), s = (m === 0 || m === 2) ? -1 : 1, isE = m >= 2;
    var yr = isE ? 6 : (s < 0 ? 5 : 7), A = ax(c, b, { xmin: -3, xmax: 3, ymin: s > 0 && !isE ? -0.6 : -yr, ymax: yr, xl: 'x', yl: isE ? 'E' : 'φ', col: col, pad: { b: fs * 3 } });
    var f = isE ? function (x) { return (x + 1) / Math.pow(Math.abs(x + 1), 3) + s * (x - 1) / Math.pow(Math.abs(x - 1), 3); }
                : function (x) { return 1 / Math.abs(x + 1) + s / Math.abs(x - 1); };
    [[-3, -1.04], [-0.96, 0.96], [1.04, 3]].forEach(function (r) { K.plot(c, A, f, r[0], r[1], C.a, lw, null, 300); });
    [[-1, 1], [1, s]].forEach(function (q) { var X = A.X(q[0]); K.line(c, X, A.Y0, X, A.Y1, K.alpha(col, 0.3), 1, [3, 4]);
      K.circ(c, X, A.oy, Math.max(6, fs * 0.55), q[1] > 0 ? C.pos : C.neg, 1, q[1] > 0 ? C.pos : C.neg); K.txt(c, q[1] > 0 ? '+' : '−', X, A.oy, { c: '#fff', s: fs * 0.9, b: true, ui: true }); });
    var tip = ['中点 φ = 0，从正电荷到负电荷 φ 降低', '中点 φ 最低（连线上），中垂线上中点 φ 最高', '中点场强最小但不为零，方向不变', '中点 E = 0，两侧方向相反'][m];
    K.txt(c, tip, b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.75, al: 'left', ui: true });
    K.txt(c, isE ? '取 +x 方向为正' : '取无穷远电势为零', A.X0 + 4, A.Y0, { c: col, s: fs * 0.72, al: 'left', ui: true });
  }
});
})();

/* ---------- 分类归并：上游 thermo → 本工程 heat ---------- */
for (var _k in TB.shapes) {
  var _d = TB.shapes[_k];
  if (_d && _d.cat === 'thermo') _d.cat = 'heat';
}

/* ============================================================================
 * 2.0.9：纯净图 —— 周围文字与公式默认不画，由对象上的 pmText 开关控制
 * ----------------------------------------------------------------------------
 * PM 库全部文字与公式都走 K.txt（62 个模型里 190 余处），所以只在这一处设闸：
 * 默认（pmText 不是 true）一律不画，老师点「显示文字/公式」才画。
 * 作用域靠包裹各模型的 draw 取得 —— 不能靠全局标志，否则实时层同时画多个动画图形时
 * 会串台（A 的开关决定 B 的文字）。
 * ==========================================================================*/
var K = window.__PM;            // 本文件的 K 是各节 IIFE 里的局部量，收尾块自己取一次
if (!K) return;
var K = window.__PM;            // 本文件的 K 是各节 IIFE 里的局部量，收尾块自己取一次
if (!K) return;
var CUR_PM = null;
var _txtRaw = K.txt;
K.txt = function (c, s, x, y, o) {
  if (!CUR_PM || CUR_PM.pmText !== true) return;
  return _txtRaw(c, s, x, y, o);
};
(function () {
  function wrap(d) {
    if (!d || typeof d.draw !== 'function' || d.__pmClean) return;
    var f = d.draw;
    d.draw = function (c, o, GH) {
      var prev = CUR_PM; CUR_PM = o;
      try { return f.call(this, c, o, GH); } finally { CUR_PM = prev; }
    };
    d.__pmClean = true;
  }
  for (var k in TB.shapes) if (k.indexOf('pm_') === 0) wrap(TB.shapes[k]);
})();

/* ---------- 字体统一：与现有图形库同一套字符样式 ----------
 * PM 上游用的是 Times/Cambria（衬线），而本工程 130 个原有图形的标注一律是
 * system-ui / sans-serif + 600 字重。同一张画布上两种字形并排非常显眼，
 * 这里把 PM 的公式字体并到工程既有的一套；斜体（变量）仍由 o.i 单独控制。 */
K.FONT_MATH = 'system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
})();
