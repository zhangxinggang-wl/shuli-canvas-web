/* ============================================================================
 *  扩展模型库 · 公共绘制工具（唐波的物理白板 · 全模型版）
 *  所有新增模型都通过 TangBoBoard.register 注册，与原图形库同一套接口。
 * ============================================================================ */
(function () {
'use strict';
var TB = window.TangBoBoard;
var K = window.__PM = window.__PM || {};
K.TB = TB;
var PI = Math.PI, TAU = PI * 2;
K.PI = PI; K.TAU = TAU;
/* 上游是「先到先得」，本工程则有先后两套库：phys-pm.js（旧 62 个模型）先注册过一次，
   这里改为「后到覆盖」—— 新库的参数定义是更新版（例如电荷分布多一个「负点电荷」档），
   若沿用先到先得，新模型会拿到旧选项表，档位对不上。 */
K.P = function (key, def) { TB.paramDefs[key] = def; };
K.sel = function (key, label, opts, def) {
  K.P(key, { label: label, type: 'select', def: String(def || 0),
    options: opts.map(function (s, i) { return { value: String(i), label: s }; }) });
};
K.tog = function (key, label, def) { K.P(key, { label: label, type: 'toggle', def: !!def }); };
K.reg = function (d) {
  d.geom = d.geom || 'rect';
  if (d.fill === undefined) d.fill = false;
  TB.register(d);
};
K.showDetails = function (o) { return o.pmText === true; };
/* 「现在画的是哪个对象」——纯净图开关 it.pmText 的唯一依据。
   不能读全局 GH.cur：量尺走 P.bbox 直接调 d.draw，不经过 P.draw。所以由 draw 外层包裹记录。 */
K.__cur = null;
K.detailsOn = function () { var o = K.__cur; return !!o && o.pmText === true; };
/* 给所有 pm_ 图形的 draw 包一层。phys-pm.js 尾部已包过一层（管它自己的 K.txt），
   这里另用 __pmTxt 标记再包，两层都留：外层设 K.__cur，内层算旧图形的文字闸门。 */
K.wrapClean = function () {
  for (var k in TB.shapes) {
    var d = TB.shapes[k];
    if (!d || typeof d.draw !== 'function' || k.indexOf('pm_') !== 0 || d.__pmTxt) continue;
    d.draw = (function (f) {
      return function (c, o, GH) {
        var prev = K.__cur; K.__cur = o;
        try { return f.call(this, c, o, GH); } finally { K.__cur = prev; }
      };
    })(d.draw);
    d.__pmTxt = true;
  }
};
var textbookContexts = new WeakMap();
var paperBackground = false;
K.drawModel = function (def, c, o, GH) { return def.draw(c, o, GH); };
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
var darkPalette = Object.assign({}, K.C);
var paperPalette = {
  F: '#b91c1c', v: '#137333', a: '#995508', B: '#2256a5', E: '#783eb0',
  I: '#a9470b', light: '#995508', gas: '#126f97', g2: '#a22669'
};
K.setPaperPalette = function (paper) {
  paperBackground = !!paper;
  Object.assign(K.C, darkPalette, paper ? paperPalette : null);
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
K.FONT_MATH = 'system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
K.FONT_UI = 'system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
K.formatQuantity = function (value, unit, digits) {
  var fixed = value.toFixed(digits);
  return (Number(fixed) === 0 ? Math.abs(value).toFixed(digits) : fixed.replace(/^-/, '−')) +
    (unit && unit !== '°' ? '\u202f' : '') + unit;
};
K.scientificQuantity = function (value, unit, significantDigits) {
  if (value === 0) return [K.formatQuantity(0, unit, significantDigits - 1)];
  var parts = value.toExponential(significantDigits - 1).split('e');
  return [parts[0].replace(/^-/, '−') + ' × ', {
    symbol: '10', upright: true, sup: String(Number(parts[1])).replace(/^-/, '−')
  }, unit ? '\u202f' + unit : ''];
};

// 缓存字形度量，动态读数和图框变化产生的词条总数有界。
var mathMetrics = new WeakMap();
var mathMetricLimit = 512;
function clearMathMetrics() { mathMetrics = new WeakMap(); }
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener('loadingdone', clearMathMetrics);
  document.fonts.addEventListener('loadingerror', clearMathMetrics);
}
function mathMeasurer(c) {
  var style = [c.direction, c.lang, c.canvas?.dir, c.fontKerning, c.fontStretch,
    c.fontVariantCaps, c.letterSpacing, c.wordSpacing, c.textRendering].join('\u0000');
  var cached = mathMetrics.get(c);
  if (cached?.style !== style) {
    cached = { style: style, entries: new Map() };
    mathMetrics.set(c, cached);
  }
  return function (font, text) {
    var key = font + '\u0000' + text;
    var m = cached.entries.get(key);
    if (!m) {
      c.font = font;
      m = c.measureText(text);
      if (cached.entries.size === mathMetricLimit) cached.entries.delete(cached.entries.keys().next().value);
      cached.entries.set(key, m);
    }
    return m;
  };
}

// 布局和绘制共用字形度量。所有坐标都以基线为参考。
function mathBox(c, tokens, size, bold, measure) {
  var box = { width: 0, top: -size * 0.68, bottom: size * 0.16, items: [] };
  function place(child, x, y) {
    box.top = Math.min(box.top, y + child.top);
    box.bottom = Math.max(box.bottom, y + child.bottom);
    box.items.push(function () { child.paint(x, y); });
  }
  function textBox(text, s, italic) {
    var font = (italic ? 'italic ' : '') + (bold ? '600 ' : '') + s + 'px ' + K.FONT_MATH;
    var m = measure(font, text), left = Math.max(0, m.actualBoundingBoxLeft || 0);
    return {
      width: left + Math.max(m.width, m.actualBoundingBoxRight || 0),
      top: -(m.actualBoundingBoxAscent ?? s * 0.75),
      bottom: m.actualBoundingBoxDescent ?? s * 0.2,
      paint: function (x, y) { c.font = font; c.fillText(text, x + left, y); }
    };
  }
  function rule(x, y, width, arrow) {
    var weight = size * 0.055, rise = arrow ? Math.min(width / 3, size * 0.15) : 0;
    box.top = Math.min(box.top, y - rise - weight / 2);
    box.bottom = Math.max(box.bottom, y + rise + weight / 2);
    box.items.push(function () {
      c.beginPath();
      c.moveTo(x + weight / 2, y); c.lineTo(x + width - weight / 2, y);
      if (arrow) {
        c.lineTo(x + width - weight / 2 - rise, y - rise);
        c.moveTo(x + width - weight / 2, y); c.lineTo(x + width - weight / 2 - rise, y + rise);
      }
      c.lineWidth = weight; c.stroke();
    });
  }
  tokens.forEach(function (token) {
    var x = box.width;
    if (typeof token === 'string') {
      var literal = textBox(token, size, false);
      place(literal, x, 0); box.width += literal.width;
      return;
    }
    if (token.frac) {
      var num = mathBox(c, token.frac[0], size * 0.82, bold, measure);
      var den = mathBox(c, token.frac[1], size * 0.82, bold, measure);
      var width = Math.max(num.width, den.width) + size * 0.28, bar = -size * 0.24;
      place(num, x + (width - num.width) / 2, bar - size * 0.12 - num.bottom);
      place(den, x + (width - den.width) / 2, bar + size * 0.12 - den.top);
      rule(x, bar, width, false);
      box.width += width;
      return;
    }
    var main = textBox(token.symbol, size, !token.upright), scripts = 0;
    place(main, x, 0);
    if (token.vector) rule(x, main.top - size * 0.19, main.width, true);
    ['sub', 'sup'].forEach(function (position) {
      if (token[position] == null) return;
      var italic = position === 'sub' ? token.variableSub : token.variableSup;
      var script = Array.isArray(token[position]) ? mathBox(c, token[position], size * 0.68, bold, measure)
        : textBox(String(token[position]), size * 0.68, !!italic);
      place(script, x + main.width, size * (position === 'sub' ? 0.28 : -0.51));
      scripts = Math.max(scripts, script.width);
    });
    box.width += main.width + scripts;
  });
  box.paint = function (x, y) {
    c.save(); c.translate(x, y);
    box.items.forEach(function (paint) { paint(); });
    c.restore();
  };
  return box;
}

K.drawMathBlock = function (c, lines, x, y, o) {
  var size = o.s || 13, width = 0, height = 0, gap = size * 0.29;
  var measure = mathMeasurer(c);
  c.save();
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = c.strokeStyle = o.c || '#e6edf7';
  c.setLineDash([]);
  var rows = lines.map(function (line) {
    var row = mathBox(c, Array.isArray(line) ? line : [line], size, o.b, measure);
    width = Math.max(width, row.width);
    height += row.bottom - row.top;
    return row;
  });
  height += Math.max(0, rows.length - 1) * gap;
  var scale = Math.min(1, o.maxWidth > 0 && width ? o.maxWidth / width : 1,
    o.maxHeight > 0 && height ? o.maxHeight / height : 1);
  var align = o.al === 'right' ? 1 : o.al === 'center' ? 0.5 : 0;
  var left = x - width * scale * align, top = y - (o.middle ? height * scale / 2 : 0);
  c.translate(left, top); c.scale(scale, scale);
  var paint = o.essential || K.detailsOn();
  var dy = 0;
  var bounds = rows.map(function (row) {
    var dx = (width - row.width) * align, rowHeight = row.bottom - row.top;
    if (paint) row.paint(dx, dy - row.top);
    var result = { x: left + dx * scale, y: top + dy * scale, w: row.width * scale, h: rowHeight * scale };
    dy += rowHeight + gap;
    return result;
  });
  c.restore();
  return { x: left, y: top, w: width * scale, h: height * scale, size: size * scale, rows: bounds };
};
K.drawMathLabel = function (c, tokens, x, y, o) {
  return K.drawMathBlock(c, [tokens], x, y, o || {});
};
K.txt = function (c, s, x, y, o) {
  o = o || {};
  if (!o.essential && !K.detailsOn()) return;
  c.save();
  c.fillStyle = o.c || '#e6edf7';
  var sz = o.s || 13;
  c.font = (o.i ? 'italic ' : '') + (o.b ? '600 ' : '') + sz + 'px ' + (o.ui ? K.FONT_UI : K.FONT_MATH);
  c.textAlign = o.al || 'center';
  c.textBaseline = o.bl || 'middle';
  if (o.rot) { c.translate(x, y); c.rotate(o.rot); x = 0; y = 0; }
  if (o.maxWidth > 0) c.fillText(s, x, y, o.maxWidth);
  else c.fillText(s, x, y);
  c.restore();
};
K.lines = function (c, arr, x, y, col, sz, al, maxWidth) {
  if (arr.some(Array.isArray)) return K.drawMathBlock(c, arr, x, y, { c: col, s: sz, al: al, maxWidth: maxWidth });
  for (var i = 0; i < arr.length; i++) {
    K.txt(c, arr[i], x, y + i * sz * 1.35, { c: col, s: sz, al: al || 'left', bl: 'top', ui: true, maxWidth: maxWidth });
  }
};
/* Phydraw figh/fig/figb proportions, scaled by the selected model stroke. */
function modelStroke(c, width) {
  var base = textbookContexts.get(c);
  if (base === undefined || !Number.isFinite(width) || width <= 0) return width;
  if (width < base * 0.76) return Math.max(1, base * 0.5);
  return width >= base * 1.34 ? base * 5 / 3 : base;
}
K.line = function (c, x1, y1, x2, y2, col, w, dash) {
  c.save(); c.strokeStyle = col; c.lineWidth = modelStroke(c, w); c.setLineDash(dash || []);
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore();
};
K.poly = function (c, pts, col, w, dash, close, fill) {
  if (!pts.length) return;
  c.save();
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  if (close) c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (col) {
    c.strokeStyle = col; c.lineWidth = modelStroke(c, w); c.setLineDash(dash || []); c.stroke();
  }
  c.restore();
};
K.head = function (c, x, y, ux, uy, hs, col) {
  c.save(); c.fillStyle = col; c.setLineDash([]); c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x - ux * hs - uy * hs * 0.35, y - uy * hs + ux * hs * 0.35);
  c.lineTo(x - ux * hs + uy * hs * 0.35, y - uy * hs - ux * hs * 0.35);
  c.closePath(); c.fill(); c.restore();
};
K.arrow = function (c, x1, y1, x2, y2, col, w, hs, dash) {
  var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  hs = Math.min(hs || Math.max(6, w * 3.4), L * 0.65);
  var ux = dx / L, uy = dy / L;
  K.line(c, x1, y1, x2 - ux * hs * 0.9, y2 - uy * hs * 0.9, col, Math.min(w, hs * 0.7), dash);
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
  if (col) { c.strokeStyle = col; c.lineWidth = modelStroke(c, w || 1); c.setLineDash(dash || []); c.stroke(); }
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
  if (col) { c.strokeStyle = col; c.lineWidth = modelStroke(c, lw); c.setLineDash([]); c.stroke(); }
  c.restore();
};
K.block = function (c, cx, cy, w, h, ang, col, lw, label, fs) {
  c.save(); c.translate(cx, cy); c.rotate(ang || 0);
  K.box(c, -w / 2, -h / 2, w, h, col, lw, K.alpha(col, 0.18));
  c.restore();
  if (label) K.lab(c, label, cx, cy, { c: col, s: fs || 13, i: true, essential: true,
    maxWidth: w * 0.8, maxHeight: h * 0.8 });
};
K.hatch = function (c, x1, y1, x2, y2, col, w, gap, side) {
  var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 1) return;
  var ux = dx / L, uy = dy / L, sd = side || 1, nx = -uy * sd, ny = ux * sd;
  gap = gap || 10; var t = Math.min(gap * 0.68, L * 0.22);
  c.save(); c.setLineDash([]); c.strokeStyle = col; c.lineWidth = modelStroke(c, w);
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.lineWidth = modelStroke(c, Math.max(0.5, w * 0.45)); c.beginPath();
  for (var s = gap * 0.6; s < L; s += gap) {
    var px = x1 + ux * s, py = y1 + uy * s;
    c.moveTo(px, py); c.lineTo(px + nx * t - ux * t, py + ny * t - uy * t);
  }
  c.stroke(); c.restore();
};
K.spring = function (c, x1, y1, x2, y2, n, amp, col, w) {
  var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 2) return;
  var ux = dx / L, uy = dy / L, nx = -uy, ny = ux, e = Math.min(L * 0.1, 10);
  c.save(); c.strokeStyle = col; c.lineWidth = modelStroke(c, w); c.setLineDash([]); c.beginPath();
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
  c.save(); c.setLineDash([]); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = modelStroke(c, lw);
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
  c.save(); c.strokeStyle = col; c.lineWidth = modelStroke(c, w); c.setLineDash([]);
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
  c.save(); c.strokeStyle = col; c.lineWidth = modelStroke(c, w); c.setLineDash([]); c.beginPath();
  for (var s = 0; s <= L - hl; s += 1.5) {
    var e = Math.sin(s / wl * TAU) * amp * Math.min(1, s / 6, (L - hl - s) / 6 + 0.2);
    var px = x1 + ux * s + nx * e, py = y1 + uy * s + ny * e;
    s ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.stroke(); c.restore();
  if (head) K.arrow(c, x2 - ux * hl * 1.2, y2 - uy * hl * 1.2, x2, y2, col, w, hl);
};
function axisTokens(label) {
  if (Array.isArray(label)) return label;
  var quantity = label.match(/^([A-Za-zΑ-ωℰ])(?:_([^/]+))?(\/.*)?$/);
  if (!quantity) return [label];
  var tokens = [{ symbol: quantity[1], sub: quantity[2], variableSub: /^[xyzt]$/.test(quantity[2]) }];
  if (quantity[3]) tokens.push(quantity[3]);
  return tokens;
}
K.axes = function (c, bx, by, bw, bh, o) {
  var pd = o.pad || {}, fs = o.fs || 13;
  var L = pd.l != null ? pd.l : fs * 2.2, R = pd.r != null ? pd.r : fs * 1.6;
  var T = pd.t != null ? pd.t : fs * 1.6, Bm = pd.b != null ? pd.b : fs * 1.8;
  // Small insets keep a usable plotting region even when their default margins exceed the available space.
  var horizontal = Math.min(1, bw * 0.68 / (L + R)), vertical = Math.min(1, bh * 0.68 / (T + Bm));
  L *= horizontal; R *= horizontal; T *= vertical; Bm *= vertical;
  var X0 = bx + L, X1 = bx + bw - R, Y0 = by + T, Y1 = by + bh - Bm;
  var sx = (X1 - X0) / (o.xmax - o.xmin), sy = (Y1 - Y0) / (o.ymax - o.ymin);
  var A = {
    X: function (v) { return X0 + (v - o.xmin) * sx; },
    Y: function (v) { return Y1 - (v - o.ymin) * sy; },
    X0: X0, X1: X1, Y0: Y0, Y1: Y1, sx: sx, sy: sy, o: o, fs: fs
  };
  var ox = A.X(K.clamp(0, o.xmin, o.xmax)), oy = A.Y(K.clamp(0, o.ymin, o.ymax));
  A.ox = ox; A.oy = oy;
  var col = o.col, w = o.lw || 1.4, hs = Math.min(Math.max(6, fs * 0.6), bw * 0.14, bh * 0.16);
  K.arrow(c, X0 - (o.xmin < 0 ? 0 : Math.min(4, L)), oy, X1 + R * 0.7, oy, col, w, hs);
  K.arrow(c, ox, Y1 + (o.ymin < 0 ? 0 : Math.min(4, Bm)), ox, Y0 - T * 0.7, col, w, hs);
  var labelHeight = Math.min(fs, bh * 0.25);
  var yLabelX = Math.min(ox + fs * 0.4, bx + bw * 0.65);
  var xLabelY = o.xLabelAbove ? Math.max(by, oy - labelHeight - 2) : Math.min(oy + fs * 0.35, by + bh - labelHeight);
  K.drawMathLabel(c, axisTokens(o.xl || 'x'), bx + bw - 2, xLabelY,
    { c: col, s: fs, al: 'right', maxWidth: bw * 0.35, maxHeight: labelHeight, essential: true });
  K.drawMathLabel(c, axisTokens(o.yl || 'y'), yLabelX, by + 2,
    { c: col, s: fs, maxWidth: bx + bw - yLabelX - 2, maxHeight: labelHeight, essential: true });
  if (o.O !== false) K.txt(c, 'O', ox - fs * 0.55, oy + fs * 0.7, { c: col, s: fs, i: true, essential: true });
  return A;
};
K.plot = function (c, A, f, a, b, col, w, dash, n) {
  n = n || 240;
  c.save();
  c.beginPath(); c.rect(A.X0 - 2, A.Y0 - 4, A.X1 - A.X0 + 6, A.Y1 - A.Y0 + 8); c.clip();
  c.strokeStyle = col; c.lineWidth = modelStroke(c, w); c.lineJoin = 'round'; c.setLineDash(dash || []);
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
  K.line(c, A.X(x), A.Y(y), A.X(x), A.oy, col, w, [1.2, 3]);
  K.line(c, A.X(x), A.Y(y), A.ox, A.Y(y), col, w, [1.2, 3]);
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
K.collisionVelocities = function (m1, m2, v1, v2, restitution) {
  var impulse = (1 + restitution) * (v1 - v2) / (1 / m1 + 1 / m2);
  return [v1 - impulse / m1, v2 + impulse / m2];
};
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
  K.box(c, x, y, w, h, K.alpha(o.col, 0.22), 1, K.alpha(o.col, 0.04));
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
    return K.drawMathLabel(c, [{ symbol: s.slice(0, k), sub: s.slice(k + 1), upright: o.i === false,
      variableSub: o.variableSub }], x, y, Object.assign({ al: 'center', middle: true }, o));
  };
  var vec0 = K.vec;
  K.vec = function (c, x, y, dx, dy, col, w, label, fs, dash) {
    vec0(c, x, y, dx, dy, col, w, null, fs, dash);
    var L = Math.hypot(dx, dy);
    if (label && L >= 1) K.lab(c, label, x + dx + dx / L * fs * 0.95, y + dy + dy / L * fs * 0.95, { c: col, s: fs, i: true });
  };
})();
