/* ============================================================================
 *  扩展模型库 · 模型模块（唐波的物理白板 · 全模型版）
 *  由 physboard-build 的 pm_*.js 逐文件原样并入；顺序 = 上游 patch1.js 的 mods 顺序。
 *  依赖：physshapes.js（TB/PB/GH）、phys-pm.js（既有 62 个模型 + K 基础）、
 *        phys-pm-common.js（K 公共绘制工具，含 drawMathBlock / drawMathLabel 等）。
 *  收尾：上游 cat=thermo 折成本工程的 cat=heat，并给所有 pm_ 图形套上纯净图游标。
 * ============================================================================ */
/* ===== 上游 pm_mech.js ===== */
/* ===================== 扩展 · 力学模型 ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI;
var D2R = PI / 180;

function boundedVector(c, b, x, y, dx, dy, color, lw, fs, tokens, side) {
  if (Math.hypot(dx, dy) < 0.5) return;
  var tipX = x + dx, tipY = y + dy;
  K.arrow(c, x, y, tipX, tipY, color, lw, fs * 0.58);
  var labelW = Math.min(b.w * 0.22, fs * (tokens.length > 1 ? 4 : 1.8));
  var labelX = K.clamp(tipX + side * (labelW * 0.36 + 2), b.x1 + labelW / 2, b.x2 - labelW / 2);
  var labelY = K.clamp(tipY + (Math.abs(dx) > Math.abs(dy) ? -fs * 0.64 : 0), b.y1 + fs / 2, b.y2 - fs / 2);
  K.drawMathLabel(c, tokens, labelX, labelY, { c: color, s: fs, al: 'center', middle: true,
    essential: true, maxWidth: labelW, maxHeight: fs });
}
function forceOrigin(c, x, y, lw, color) {
  K.dot(c, x, y, Math.max(1.8, lw * 0.8), color);
}

/* ---------- 斜面受力 ---------- */
K.sel('qIncShow', '显示', ['受力分析', '重力分解', '仅斜面'], 0);
K.reg({
  key: 'pm_incline', cat: 'mech', label: '斜面受力', params: ['qAng', 'qIncShow'],
  icon: '<path d="M3 20h18V7z"/><rect x="9" y="10.5" width="5" height="4" transform="rotate(-31 11.5 12.5)"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 40 || b.h < 30) return;
    var th = K.v(o, 'qAng') * D2R, mode = K.v(o, 'qIncShow'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055, 7, 24);
    var pad = fs * 1.3, W = b.w - 2 * pad, Hh = b.h - 2 * pad;
    var base = Math.min(W, Hh / Math.tan(th)), hgt = base * Math.tan(th);
    var Ax = b.x1 + pad + (W - base) / 2, Ay = b.y2 - pad, Bx = Ax + base, Cy = Ay - hgt;
    K.hatch(c, Ax - pad * 0.6, Ay, Bx + pad * 0.6, Ay, col, lw, 9, 1);
    K.poly(c, [[Ax, Ay], [Bx, Ay], [Bx, Cy]], col, lw, null, true, K.alpha(col, 0.07));
    K.angArc(c, Ax, Ay, Math.min(base * 0.2, fs * 2.6), 0, -th, col, lw * 0.8, 'θ', fs);
    if (mode === 2) return;
    var Lsl = Math.hypot(base, hgt), s = Math.min(Lsl * 0.18, S * 0.23, 90);
    var dx = Math.cos(th), dy = -Math.sin(th), nx = -Math.sin(th), ny = -Math.cos(th);
    var Px = Ax + base * 0.5, Py = Ay - hgt * 0.5, cx = Px + nx * s * 0.45, cy = Py + ny * s * 0.45;
    K.block(c, cx, cy, s * 1.2, s * 0.9, -th, col, lw);
    var Lg = Math.max(0, Math.min(S * 0.3, 260, b.y2 - cy - fs, cy - b.y1 - fs)), fw = lw;
    boundedVector(c, b, cx, cy, 0, Lg, C.F, fw, fs, [{ symbol: 'G' }], -1);
    if (mode === 0) {
      boundedVector(c, b, cx, cy, nx * Lg * Math.cos(th), ny * Lg * Math.cos(th), C.F, fw, fs, [{ symbol: 'N' }], -1);
      boundedVector(c, b, cx, cy, dx * Lg * Math.sin(th), dy * Lg * Math.sin(th), C.F, fw, fs, [{ symbol: 'f' }], 1);
    } else {
      var g1x = -dx * Lg * Math.sin(th), g1y = -dy * Lg * Math.sin(th);
      var g2x = -nx * Lg * Math.cos(th), g2y = -ny * Lg * Math.cos(th);
      K.poly(c, [[cx + g1x, cy + g1y], [cx, cy + Lg], [cx + g2x, cy + g2y]],
        C.a, lw * 0.65, [4, 3]);
      boundedVector(c, b, cx, cy, g1x, g1y, C.a, fw, fs * 0.9,
        [{ symbol: 'G' }, ' sin ', { symbol: 'θ' }], -1);
      boundedVector(c, b, cx, cy, g2x, g2y, C.a, fw, fs * 0.9,
        [{ symbol: 'G' }, ' cos ', { symbol: 'θ' }], 1);
      if (Lg * th > fs * 4) K.angArc(c, cx, cy, Lg * 0.36, PI / 2 - th, PI / 2, C.a, lw * 0.65, 'θ', fs * 0.85);
    }
    forceOrigin(c, cx, cy, lw, col);
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
    var D = Math.min(b.h * 0.42, (b.w - 3 * pad) / Math.max(0.35, t1 + t2));
    var Kx = b.x1 + b.w / 2 - D * (t2 - t1) / 2, Ky = ceilY + D;
    var Lx = Kx - D * t1, Rx = Kx + D * t2;
    K.hatch(c, Math.max(b.x1 + 2, Lx - pad * 1.2), ceilY,
      Math.min(b.x2 - 2, Rx + pad * 1.2), ceilY, col, lw, Math.min(9, fs), -1);
    K.line(c, Lx, ceilY, Kx, Ky, col, lw); K.line(c, Rx, ceilY, Kx, Ky, col, lw);
    var bs = K.clamp(S * 0.15, 12, 80), by = Ky + Math.min(D * 0.45, b.y2 - Ky - bs - 3);
    K.line(c, Kx, Ky, Kx, by, col, lw);
    K.block(c, Kx, by + bs / 2, bs, bs, 0, col, lw, 'm', fs);
    forceOrigin(c, Kx, Ky, lw, col);
    K.txt(c, 'O', Kx - fs * 0.9, Ky + fs * 0.2, { c: col, s: fs, i: true });
    K.line(c, Kx, Ky, Kx, Ky - D * 0.62, col, 1, [4, 4]);
    var ar = D * 0.3;
    if (a1 > 0.01) K.angArc(c, Kx, Ky, ar, -PI / 2 - a1, -PI / 2, col, 1, 'α', fs * 0.9);
    if (a2 > 0.01) K.angArc(c, Kx, Ky, ar * 0.8, -PI / 2, -PI / 2 + a2, col, 1, 'β', fs * 0.9);
    if (mode === 2) return;
    var sn = Math.sin(a1 + a2), T1, T2;
    if (sn < 1e-3) { T1 = T2 = 0.5; } else { T1 = Math.sin(a2) / sn; T2 = Math.sin(a1) / sn; }
    var cos1 = Math.cos(a1), cos2 = Math.cos(a2);
    var Lg = Math.min(S * 0.24, 220, Math.max(0, by - Ky - fs * 0.27),
      D * 0.82 / Math.max(1, T1 * cos1, T2 * cos2)), fw = lw;
    var e1x = -Math.sin(a1) * Lg * T1, e1y = -cos1 * Lg * T1;
    var e2x = Math.sin(a2) * Lg * T2, e2y = -cos2 * Lg * T2;
    if (mode === 1) {
      K.poly(c, [[Kx + e1x, Ky + e1y], [Kx, Ky - Lg], [Kx + e2x, Ky + e2y]],
        C.a, lw * 0.65, [4, 3]);
      boundedVector(c, b, Kx, Ky, 0, -Lg, C.a, fw, fs, [{ symbol: 'F', sub: '合' }], 1);
    }
    boundedVector(c, b, Kx, Ky, e1x, e1y, C.F, fw, fs, [{ symbol: 'T', sub: 1 }], -1);
    boundedVector(c, b, Kx, Ky, e2x, e2y, C.F, fw, fs, [{ symbol: 'T', sub: 2 }], 1);
    boundedVector(c, b, Kx, Ky, 0, Lg, C.F, fw, fs, [{ symbol: 'T', sub: 3 }], -1);
    forceOrigin(c, Kx, Ky, lw, col);
    K.drawMathLabel(c, [{ symbol: 'T', sub: 3 }, ' = ', { symbol: 'G' }, '，',
      { symbol: 'T', sub: 1 }, ' = ' + T1.toFixed(2), { symbol: 'G' }, '，',
      { symbol: 'T', sub: 2 }, ' = ' + T2.toFixed(2), { symbol: 'G' },
      sn < 1e-3 ? '（假定两竖绳均分）' : ''], b.x1 + 4, b.y2 - fs * 1.02,
      { c: col, s: fs * 0.85, maxWidth: b.w - 8, maxHeight: fs });
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
  key: 'pm_scale', cat: 'mech', label: '弹簧测力计', params: ['qReading', 'qLabMode'],
  icon: '<circle cx="12" cy="3.5" r="1.5"/><rect x="8.5" y="5" width="7" height="13" rx="1.5"/><path d="M12 7v6"/><path d="M12 18v2a1.5 1.5 0 1 1-2 1.3"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.h < 60) return;
    var col = o.color, lw = K.lw(o), F = K.clamp(K.v(o, 'qReading'), 0, 5);
    var legacy = o.qLabMode == null, mode = K.v(o, 'qLabMode'), footer = !legacy && mode !== 1;
    var bw = Math.min(b.w * 0.5, b.h * 0.2), cx = b.x1 + b.w / 2, top = b.y1 + b.h * 0.1;
    var bh = b.h * (footer ? 0.56 : 0.68);
    var fs = K.clamp(bw * 0.2, 9, 18);
    K.circ(c, cx, b.y1 + b.h * 0.05, b.h * 0.04, col, lw);
    K.box(c, cx - bw / 2, top, bw, bh, col, lw, K.alpha(col, 0.1), bw * 0.18);
    var s0 = top + bh * 0.12, s1 = top + bh * 0.88, slotW = bw * 0.16;
    K.box(c, cx - slotW / 2, s0 - 4, slotW, s1 - s0 + 8, col, 1, K.alpha(col, 0.06), 2);
    for (var k = 0; k <= 25; k++) {
      var y = s0 + (s1 - s0) * k / 25, L = k % 5 === 0 ? bw * 0.2 : bw * 0.1;
      K.line(c, cx - slotW / 2 - L, y, cx - slotW / 2, y, col, 1);
      if (k % 5 === 0) K.txt(c, String(k / 5), cx - slotW / 2 - bw * 0.3, y, { c: col, s: fs, al: 'right', ui: true, essential: true });
    }
    K.txt(c, 'N', cx + bw * 0.3, s0 - 2, { c: col, s: fs, ui: true, essential: true });
    var py = s0 + (s1 - s0) * F / 5;
    K.spring(c, cx, top + 3, cx, py - 3, 7, slotW * 0.35, K.alpha(col, 0.8), 1);
    K.poly(c, [[cx - slotW / 2 - 2, py], [cx + slotW, py - 4], [cx + slotW, py + 4]], null, 0, null, true, C.F);
    var hy = top + bh + b.h * 0.05 + (py - s0) * 0.15;
    K.line(c, cx, py, cx, hy, col, lw);
    c.save(); c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
    c.arc(cx - b.h * 0.025, hy, b.h * 0.025, 0, PI * 0.9); c.stroke(); c.restore();
    if (legacy) K.drawMathLabel(c, [{ symbol: 'F' }, ' = ', K.formatQuantity(F, 'N', 1)],
      cx + bw * 0.6, top + bh * 0.5, {
        c: C.F, s: fs * 1.1, middle: true, maxWidth: b.x2 - cx - bw * 0.6, maxHeight: bh * 0.18
      });
    if (footer) {
      var rows = mode === 0 ? [['每格 ', K.formatQuantity(0.2, 'N', 1), ' · 半格估读']]
        : [[{ symbol: 'F' }, ' = ', K.formatQuantity(F, 'N', 1)],
          [Math.round(F * 5) / 5 === F ? '指针对准刻线时，保留半格估读位。'
            : '只读最近刻线 → ' + K.formatQuantity(Math.round(F * 5) / 5, 'N', 1)]];
      K.drawMathBlock(c, rows, cx, b.y1 + b.h * 0.83, {
        c: col, s: fs, al: 'center', maxWidth: b.w * 0.9, maxHeight: b.h * 0.16
      });
    }
  }
});

/* ---------- 转弯（倾斜路面） ---------- */
K.reg({
  key: 'pm_bank', cat: 'mech', label: '转弯·倾斜路面', params: ['qAng'],
  icon: '<path d="M3 19l18-7v8H3z"/><rect x="9" y="10" width="6" height="4" transform="rotate(-21 12 12)"/><path d="M8 6H3"/><path d="M5 4L3 6l2 2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var th = Math.min(K.v(o, 'qAng'), 45) * D2R, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05, 8, 24);
    var Px = b.x1 + b.w * 0.55, Py = b.y1 + b.h * 0.63;
    var Ls = Math.min(b.w * 0.42, b.h * 0.26 / Math.sin(th));
    var dx = Math.cos(th), dy = -Math.sin(th), nx = -Math.sin(th), ny = -Math.cos(th);
    var ax = Px - dx * Ls, ay = Py - dy * Ls, bx2 = Px + dx * Ls * 0.8, by2 = Py + dy * Ls * 0.8;
    K.poly(c, [[ax, ay], [bx2, by2], [bx2, b.y2], [ax, b.y2]], null, 0, null, true, K.alpha(col, 0.07));
    K.hatch(c, ax, ay, bx2, by2, col, lw, 10, 1);
    K.line(c, ax, ay, ax + Ls * 0.45, ay, col, 1, [4, 4]);
    K.angArc(c, ax, ay, Ls * 0.3, 0, -th, col, 1, 'θ', fs);
    var cw = K.clamp(S * 0.28, 14, 200);
    K.car(c, Px, Py, cw, col, lw, -th);
    var cmx = Px + nx * cw * 0.3, cmy = Py + ny * cw * 0.3, Lg = Math.min(S * 0.26, 200);
    var N = Lg / Math.cos(th), net = -Lg * Math.tan(th);
    K.poly(c, [[cmx, cmy + Lg], [cmx + net, cmy], [cmx + nx * N, cmy + ny * N]],
      C.a, lw * 0.65, [4, 3]);
    boundedVector(c, b, cmx, cmy, 0, Lg, C.F, lw, fs, [{ symbol: 'G' }], 1);
    boundedVector(c, b, cmx, cmy, nx * N, ny * N, C.F, lw, fs, [{ symbol: 'N' }], -1);
    boundedVector(c, b, cmx, cmy, net, 0, C.a, lw, fs, [{ symbol: 'F', sub: '合' }], -1);
    forceOrigin(c, cmx, cmy, lw, col);
    K.drawMathLabel(c, [{ symbol: 'G' }, ' tan ', { symbol: 'θ' }, ' = ',
      { symbol: 'm' }, { symbol: 'v', sup: 2 }, '/', { symbol: 'r' }, '（无侧向摩擦）'],
      b.x2 - 4, b.y1 + 3, { c: col, s: fs, al: 'right', maxWidth: b.w - 8, maxHeight: fs });
  }
});

/* ---------- 拱形桥 / 凹形桥 ---------- */
K.sel('qBridge', '桥型', ['凸形桥（失重）', '凹形桥（超重）'], 0);
K.reg({
  key: 'pm_bridge', cat: 'mech', label: '拱形桥·凹形桥', params: ['qBridge'],
  icon: '<path d="M2 18Q12 6 22 18"/><rect x="9.5" y="7.5" width="5" height="3" rx="1"/><path d="M12 13v5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var cv = K.v(o, 'qBridge') === 0, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05, 8, 24);
    var cx = b.x1 + b.w / 2, R = b.w * 0.75;
    var phi = Math.min(Math.asin(b.w * 0.46 / R), Math.acos(Math.max(0, 1 - b.h * 0.22 / R)));
    var yK = cv ? b.y1 + b.h * 0.42 : b.y1 + b.h * 0.68, Oy = cv ? yK + R : yK - R;
    c.save(); c.strokeStyle = col; c.lineWidth = lw * 1.3; c.beginPath();
    if (cv) c.arc(cx, Oy, R, -PI / 2 - phi, -PI / 2 + phi); else c.arc(cx, Oy, R, PI / 2 - phi, PI / 2 + phi);
    c.stroke(); c.restore();
    var cw = K.clamp(S * 0.26, 14, 180);
    K.car(c, cx, yK, cw, col, lw, 0);
    var cmy = yK - cw * 0.3, Lg = Math.min(S * 0.22, 170), ratio = 0.4;
    var ry = cv ? Math.min(b.y2 - fs * 1.9, yK + R) : Math.max(b.y1 + fs, Oy);
    K.line(c, cx, yK + (cv ? 4 : -cw * 0.75), cx, ry, col, lw * 0.65, [5, 4]);
    K.drawMathLabel(c, [{ symbol: 'R' }], cx - fs * 0.9, (yK + ry) / 2 + (cv ? fs : -fs * 1.5),
      { c: col, s: fs, al: 'center', middle: true, essential: true, maxWidth: fs, maxHeight: fs });
    var weight = { symbol: 'G' }, normal = { symbol: 'N' }, a = { symbol: 'a', sub: 'n' };
    boundedVector(c, b, cx, cmy, 0, Lg, C.F, lw, fs, [weight], -1);
    boundedVector(c, b, cx, cmy, 0, -Lg * (cv ? 1 - ratio : 1 + ratio), C.F, lw, fs, [normal], 1);
    boundedVector(c, b, cx + cw * 0.68, cmy, 0, (cv ? 1 : -1) * Lg * ratio, C.a, lw, fs, [a], 1);
    forceOrigin(c, cx, cmy, lw, col);
    K.drawMathLabel(c, [cv ? weight : normal, ' − ', cv ? normal : weight, ' = ',
      { symbol: 'm' }, { symbol: 'v', sup: 2 }, '/', { symbol: 'R' },
      cv ? '（桥顶且保持接触）' : '（桥底）'], b.x1 + 4, b.y2 - fs * 1.12,
      { c: col, s: fs * 0.86, maxWidth: b.w - 8, maxHeight: fs });
  }
});

/* ---------- 阿特伍德机（动画） ---------- */
K.P('qM1', { label: '左侧质量m₁', min: 0.5, max: 5, step: 0.1, def: 2, unit: 'kg' });
K.P('qM2', { label: '右侧质量m₂', min: 0.5, max: 5, step: 0.1, def: 1, unit: 'kg' });
K.atwoodState = function (m1, m2, g) {
  return { acceleration: (m1 - m2) * g / (m1 + m2), tension: 2 * m1 * m2 * g / (m1 + m2) };
};
K.reg({
  key: 'pm_atwood', cat: 'mech', label: '阿特伍德机', animatable: true, params: ['qM1', 'qM2'],
  icon: '<path d="M4 3h16"/><path d="M12 3v3"/><circle cx="12" cy="8" r="2.5"/><path d="M9.5 8v8M14.5 8v5"/><rect x="7.5" y="16" width="4" height="5"/><rect x="12.5" y="13" width="4" height="4"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 50 || b.h < 80) return;
    var m1 = K.v(o, 'qM1'), m2 = K.v(o, 'qM2'), g = 10, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055);
    var st = K.atwoodState(m1, m2, g), a = st.acceleration, T = st.tension;
    var cx = b.x1 + b.w / 2, top = b.y1 + fs * 0.6, Rp = K.clamp(S * 0.1, 10, 60), py = top + b.h * 0.16;
    K.hatch(c, cx - Rp * 2.5, top, cx + Rp * 2.5, top, col, lw, 8, -1);
    K.line(c, cx, top, cx, py, col, lw);
    var Lmax = b.h * 0.16, t = K.t(o), s = 0;
    if (Math.abs(a) > 1e-6) {
      var tc = Math.sqrt(2 * 1 / Math.abs(a)), tt = K.mod(t, tc + 0.8);
      s = Math.sign(a) * Lmax * Math.min(1, (tt / tc) * (tt / tc));
    }
    var ang = s / Rp;
    K.circ(c, cx, py, Rp, col, lw, K.alpha(col, 0.1));
    for (var k = 0; k < 3; k++) { var aa = ang + k * PI / 3; K.line(c, cx - Math.cos(aa) * Rp * 0.85, py - Math.sin(aa) * Rp * 0.85, cx + Math.cos(aa) * Rp * 0.85, py + Math.sin(aa) * Rp * 0.85, K.alpha(col, 0.5), 1); }
    K.dot(c, cx, py, 2.5, col);
    var h1 = K.clamp(S * 0.09 * Math.sqrt(m1), 12, b.h * 0.2), h2 = K.clamp(S * 0.09 * Math.sqrt(m2), 12, b.h * 0.2);
    var base = b.y1 + b.h * 0.42, y1 = base + s, y2 = base - s, bw = Rp * 1.5;
    K.line(c, cx - Rp, py, cx - Rp, y1, col, lw); K.line(c, cx + Rp, py, cx + Rp, y2, col, lw);
    K.block(c, cx - Rp, y1 + h1 / 2, bw, h1, 0, col, lw, 'm_1', fs * 0.9);
    K.block(c, cx + Rp, y2 + h2 / 2, bw, h2, 0, col, lw, 'm_2', fs * 0.9);
    var La = K.clamp(Math.abs(a) / g * S * 0.3, 0, S * 0.14);
    if (La > 3) {
      K.vec(c, cx - Rp - bw * 0.9, y1 + h1 / 2, 0, Math.sign(a) * La, C.a, lw, 'a', fs);
      K.vec(c, cx + Rp + bw * 0.9, y2 + h2 / 2, 0, -Math.sign(a) * La, C.a, lw, 'a', fs);
    }
    var mLeft = { symbol: 'm', sub: 1 }, mRight = { symbol: 'm', sub: 2 };
    var sum = [mLeft, ' + ', mRight];
    var aNumerator = ['(', mLeft, ' − ', mRight, ')', { symbol: 'g' }];
    var tNumerator = ['2', mLeft, mRight, { symbol: 'g' }];
    var ratio = function (numerator) {
      return b.h >= 165 ? [{ frac: [numerator, sum] }] : numerator.concat(['/(', ...sum, ')']);
    };
    K.drawMathBlock(c, [
      [{ symbol: 'a' }, ' = ', ...ratio(aNumerator),
        ' = ' + K.formatQuantity(a, 'm·s⁻²', 2)],
      [{ symbol: 'T' }, ' = ', ...ratio(tNumerator),
        ' = ' + K.formatQuantity(T, 'N', 2)],
      '左侧向下为正 · 轻绳轻滑轮'
    ], b.x1 + 4, b.y2 - b.h * 0.22, { c: col, s: fs * 0.83, maxWidth: b.w - 8, maxHeight: b.h * 0.21 });
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
    var A = K.mini(c, gx, gy, gw, gh, { xmin: 0, xmax: t1 * 2.2, ymin: 0, ymax: 1.12, xl: 't/s',
      yl: [{ symbol: 'v' }, '/', { symbol: 'v', sub: 0 }], col: col, fs: fs * 0.75, lw: 1 });
    var fu = function (x) { return (x < t1 ? v0 - aU * x : v) / v0; }, fb = function (x) { return (x < t1 ? aB * x : v) / v0; };
    c.save(); c.beginPath(); c.moveTo(A.X(0), A.Y(1));
    for (var i = 0; i <= 30; i++) c.lineTo(A.X(t1 * i / 30), A.Y(fu(t1 * i / 30)));
    for (var j = 30; j >= 0; j--) c.lineTo(A.X(t1 * j / 30), A.Y(fb(t1 * j / 30)));
    c.fillStyle = K.alpha(C.a, 0.22); c.fill(); c.restore();
    K.plot(c, A, fu, 0, t1 * 2.2, C.a, 1.6); K.plot(c, A, fb, 0, t1 * 2.2, col, 1.6);
    K.txt(c, '1', A.ox - 3, A.Y(1), { essential: true, c: col, s: fs * 0.7, al: 'right' });
    K.txt(c, 'Δx ∝ 阴影面积', A.X(t1 * 0.35), A.Y(0.55), { c: C.a, s: fs * 0.75, maxWidth: gw * 0.54 });
    if (ph > 0) { var tc = K.clamp(t - t0, 0, t1 * 2.2); K.line(c, A.X(tc), A.Y0, A.X(tc), A.oy, K.alpha(col, 0.6), 1, [3, 3]); }
    K.lines(c, ['v共 = mv₀/(M+m) = v₀/' + (1 + Mr).toFixed(1), 'Q = fΔx = ½mv₀² − ½(M+m)v共²'],
      b.x1 + 4, b.y1 + 4, col, fs * 0.8);
  }
});

/* ---------- 水平传送带（动画） ---------- */
K.P('qBeltV', { label: '传送带速度', min: 0.5, max: 6, step: 0.1, def: 2, unit: 'm/s' });
// 水平带匀速向右，物块由静止释放，仅受带面摩擦。
K.conveyorState = function (beltSpeed, mu, time) {
  var a = 10 * mu, matchTime = a > 0 ? beltSpeed / a : Infinity;
  var slipTime = Math.min(time, matchTime);
  var sliding = time < matchTime;
  var speed = a * slipTime;
  var slip = (beltSpeed - speed / 2) * slipTime;
  return {
    matchTime: matchTime, speed: speed, slip: slip,
    displacement: speed * slipTime / 2 + beltSpeed * (time - slipTime),
    acceleration: sliding ? a : 0,
    heatPerMass: a * slip
  };
};
K.reg({
  key: 'pm_conveyor', cat: 'mech', label: '传送带·物块', animatable: true, params: ['qBeltV', 'qMu'],
  icon: '<circle cx="5" cy="15" r="3"/><circle cx="19" cy="15" r="3"/><path d="M5 12h14M5 18h14"/><rect x="7" y="7" width="5" height="5"/>',
  draw: function (c, o, GH) {
    var frame = GH.box(o); if (frame.w < 100 || frame.h < 60) return;
    var heading = frame.h * 0.36;
    var b = Object.assign({}, frame, { y1: frame.y1 + heading, h: frame.h - heading });
    var v = K.v(o, 'qBeltV'), mu = K.v(o, 'qMu'), g = 10, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055);
    var Rr = K.clamp(b.h * 0.08, 8, 40), xa = b.x1 + Rr + 4, xb = b.x2 - Rr - 4, yc = b.y1 + b.h * 0.62;
    var yt = yc - Rr, L = xb - xa, Lm = 8, pxm = L / Lm;
    var bw = Math.min(L * 0.35, K.clamp(b.h * 0.17, 14, 90));
    var a = mu * g, t1 = a > 0 ? v / a : Infinity, x0 = xa + bw * 0.6, Smax = (xb - x0 - bw * 0.6) / pxm;
    var s1 = a > 0 ? v * v / (2 * a) : Infinity, tEnd;
    if (a <= 0) tEnd = 3; else if (s1 >= Smax) tEnd = Math.sqrt(2 * Smax / a); else tEnd = t1 + (Smax - s1) / v;
    var t = K.mod(K.t(o), tEnd + 0.8), tc = Math.min(t, tEnd);
    var st = K.conveyorState(v, mu, tc), vb = st.speed;
    var tb = tc;
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
    var xbp = x0 + st.displacement * pxm;
    if (st.slip > 0) K.line(c, xbp, yt - 1.5, Math.min(xb, xbp + st.slip * pxm), yt - 1.5, K.alpha(C.F, 0.75), 3);
    K.block(c, xbp, yt - bw * 0.42, bw, bw * 0.84, 0, col, lw, 'm', fs * 0.9);
    if (vb > 0.02) K.vec(c, xbp, yt - bw * 1.05, K.clamp(vb / 6 * L * 0.25, 4, L * 0.3), 0, C.v, lw, 'v', fs);
    if (st.acceleration > 0) K.vec(c, xbp + bw * 0.5, yt - 4, bw * 0.6, 0, C.F, lw, 'f_k', fs * 0.9);
    var phase = a === 0 ? '无摩擦，物块静止' : st.acceleration === 0 ? '已共速，摩擦力为零'
      : t1 > tEnd ? '滑动，带端前未达到共速' : '滑动，摩擦力向右';
    var info = [phase, '相对滑动 ' + K.formatQuantity(st.slip, 'm', 2),
      '单位质量生热 ' + K.formatQuantity(st.heatPerMass, 'J·kg⁻¹', 2)];
    K.drawMathBlock(c, info, frame.x1 + 4, frame.y1 + 2,
      { c: col, s: K.fs(K.S(frame), 0.042, 7, 18), maxWidth: frame.w - 8, maxHeight: heading - 4 });
  }
});

/* ---------- 斜面滑块（动画） ---------- */
K.P('qMuS', { label: '最大静摩擦因数 μₛ', min: 0, max: 1, step: 0.02, def: 0.3, defaultFrom: 'qMu' });
K.slopeFromRest = function (angle, muStatic, muKinetic) {
  var g = 10, normal = g * Math.cos(angle), drive = g * Math.sin(angle);
  var sliding = Math.tan(angle) > muStatic + 1e-12;
  var friction = sliding ? muKinetic * normal : drive;
  return { sliding: sliding, normal: normal, friction: friction, acceleration: sliding ? drive - friction : 0 };
};
K.reg({
  key: 'pm_slide', cat: 'mech', label: '斜面滑块', animatable: true, params: ['qAng', 'qMuS', 'qMu'],
  icon: '<path d="M3 20h18V7z"/><rect x="12" y="8" width="5" height="4" transform="rotate(-31 14.5 10)"/><path d="M10 15l-3 2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 40) return;
    var th = K.clamp(Number(K.v(o, 'qAng')) || 30, 5, 75) * D2R;
    var muK = K.clamp(Number(K.v(o, 'qMu')) || 0, 0, 1);
    var muS = K.clamp(Number(o.qMuS ?? muK) || 0, 0, 1);
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.04, 7, 20);
    if (muK > muS) {
      K.txt(c, '请使 μₖ ≤ μₛ', b.x1 + 4, b.y1 + 4, { c: col, s: fs, al: 'left', bl: 'top', essential: true });
      return;
    }
    var state = K.slopeFromRest(th, muS, muK);
    var pad = Math.min(fs * 1.3, S * 0.095), forceSpace = S * 0.16, W = b.w - 2 * pad;
    var noteSpace = Math.min(fs * 2.5, b.h * 0.27);
    var Hh = b.h - 2 * pad - noteSpace - forceSpace;
    var base = Math.min(W, Hh / Math.tan(th)), hgt = base * Math.tan(th);
    var Ax = b.x1 + pad + (W - base) / 2, Ay = b.y2 - pad - forceSpace, Bx = Ax + base, Cy = Ay - hgt;
    K.hatch(c, Ax - pad * 0.6, Ay, Bx + pad * 0.6, Ay, col, lw, 9, 1);
    K.poly(c, [[Ax, Ay], [Bx, Ay], [Bx, Cy]], col, lw, null, true, K.alpha(col, 0.07));
    K.angArc(c, Ax, Ay, Math.min(base * 0.18, fs * 2.4), 0, -th, col, lw * 0.8, 'θ', fs);
    var a = state.acceleration, Lm = 4, Ls = Math.hypot(base, hgt), pxm = Ls / Lm;
    var dx = Math.cos(th), dy = -Math.sin(th), nx = -Math.sin(th), ny = -Math.cos(th);
    var bsz = Math.min(Ls * 0.13, 70), u0 = 0.9 - bsz * 0.6 / Ls;
    var sMax = Lm * (u0 - bsz * 0.6 / Ls), tEnd = state.sliding ? Math.sqrt(2 * sMax / a) : 0;
    var t = Math.min(K.mod(K.t(o), tEnd + 0.8), tEnd), sm = 0.5 * a * t * t, vv = a * t;
    var Px = Ax + base * u0 - dx * sm * pxm, Py = Ay - hgt * u0 - dy * sm * pxm;
    var cx = Px + nx * bsz * 0.42, cy = Py + ny * bsz * 0.42;
    K.block(c, cx, cy, bsz * 1.2, bsz * 0.84, -th, col, lw);
    var Lg = Math.min(forceSpace, 160), fw = lw, labelSize = fs * 0.9;
    boundedVector(c, b, cx, cy, 0, Lg, C.F, fw, labelSize, [{ symbol: 'G' }], 1);
    boundedVector(c, b, cx, cy, nx * Lg * Math.cos(th), ny * Lg * Math.cos(th), C.F, fw, labelSize,
      [{ symbol: 'N' }], -1);
    var fr = state.friction / 10;
    boundedVector(c, b, cx, cy, dx * Lg * fr, dy * Lg * fr, C.F, fw, labelSize,
      [{ symbol: 'f', sub: state.sliding ? 'k' : 's' }], 1);
    forceOrigin(c, cx, cy, lw, col);
    if (vv > 0.05) {
      var Lv = Math.min(S * 0.15, Ls * 0.18, pad) * vv / (a * tEnd);
      var offset = Math.min(Lg + fs * 1.15, (cy - b.y1 - fs * 1.1) / -ny);
      boundedVector(c, b, cx + dx * bsz * 0.6 + nx * offset, cy + dy * bsz * 0.6 + ny * offset,
        -dx * Lv, -dy * Lv, C.v, fw, labelSize, [{ symbol: 'v' }], -1);
    }
    var info = state.sliding ? ['下滑  a = ' + K.formatQuantity(a, 'm·s⁻²', 2), 'v = ' + K.formatQuantity(vv, 'm·s⁻¹', 2)] :
      ['静止  μₛ ≥ tan θ', 'fₛ = mg sin θ'];
    info.push('沿斜面向下为正');
    K.lines(c, info, b.x1 + 4, b.y1 + 4, col, fs * 0.85, 'left', b.w - 8);
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
    var R1 = K.clamp(S * 0.035 * Math.cbrt(m1), 5, 30), R2 = K.clamp(S * 0.035 * Math.cbrt(m2), 5, 30);
    var maxOrbit = S * 0.5 - Math.max(R1, R2) - fs * 1.65;
    var L = Math.min(S * 0.6, maxOrbit * (m1 + m2) / Math.max(m1, m2));
    var cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2, r1 = L * m2 / (m1 + m2), r2 = L - r1;
    var T = 5 * Math.sqrt(3 / (m1 + m2)), ph = K.t(o) / T * PI * 2;
    K.circ(c, cx, cy, r1, K.alpha(C.a, 0.5), 1, null, [5, 4]);
    K.circ(c, cx, cy, r2, K.alpha(C.gas, 0.5), 1, null, [5, 4]);
    var x1 = cx + r1 * Math.cos(ph), y1 = cy - r1 * Math.sin(ph), x2 = cx - r2 * Math.cos(ph), y2 = cy + r2 * Math.sin(ph);
    K.line(c, x1, y1, x2, y2, K.alpha(col, 0.5), 1, [4, 4]);
    K.dot(c, cx, cy, 2.5, col); K.txt(c, 'O', cx + fs * 0.6, cy + fs * 0.7, { c: col, s: fs * 0.85, i: true });
    K.circ(c, x1, y1, R1, C.a, 1.5, K.alpha(C.a, 0.75)); K.circ(c, x2, y2, R2, C.gas, 1.5, K.alpha(C.gas, 0.75));
    K.txt(c, 'm₁', x1, y1 - R1 - fs * 0.7, { c: C.a, s: fs * 0.9 }); K.txt(c, 'm₂', x2, y2 - R2 - fs * 0.7, { c: C.gas, s: fs * 0.9 });
    var ux = (x2 - x1) / L, uy = (y2 - y1) / L, Lf = S * 0.1, kv = S * 0.22 / L;
    K.vec(c, x1, y1, ux * Lf, uy * Lf, C.F, lw, 'F', fs * 0.85); K.vec(c, x2, y2, -ux * Lf, -uy * Lf, C.F, lw, 'F', fs * 0.85);
    K.vec(c, x1, y1, -Math.sin(ph) * r1 * kv, -Math.cos(ph) * r1 * kv, C.v, lw, 'v_1', fs * 0.85);
    K.vec(c, x2, y2, Math.sin(ph) * r2 * kv, Math.cos(ph) * r2 * kv, C.v, lw, 'v_2', fs * 0.85);
    K.lines(c, ['ω₁ = ω₂', 'r₁ : r₂ = m₂ : m₁ = ' + (r1 / r2).toFixed(2), 'Gm₁m₂/L² = m₁ω²r₁ = m₂ω²r₂'], b.x1 + 4, b.y1 + 4, col, fs * 0.8);
  }
});

})();

/* ===== 上游 pm_wave.js ===== */
/* ===================== 扩展 · 振动与波 ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI, TAU = PI * 2;

/* ---------- 机械波的形成与传播（动画） ---------- */
K.sel('qWDir', '传播方向', ['向右（+x）', '向左（−x）'], 0);
K.P('qWN', { label: '波长个数', min: 1, max: 4, step: 0.5, def: 2 });
K.tog('qWGhost', '显示Δt后波形', true);
K.travelWaveState = function (distance, time, amplitude, wavelength, period) {
  if (distance > wavelength / period * time) return { y: 0, vy: 0, reached: false };
  var omega = TAU / period, phase = omega * time - TAU * distance / wavelength;
  return { y: amplitude * Math.sin(phase), vy: amplitude * omega * Math.cos(phase), reached: true };
};
K.reg({
  key: 'pm_wave_travel', cat: 'wave', label: '波的传播·质点振动', animatable: true, params: ['qWDir', 'qWN', 'qWGhost'],
  icon: '<path d="M2 12q2.5-6 5 0t5 0 5 0 5 0"/><circle cx="7" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><path d="M18 5h4M20 3l2 2-2 2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 50) return;
    var dir = K.v(o, 'qWDir') === 0 ? 1 : -1, nl = K.v(o, 'qWN'), ghost = K.v(o, 'qWGhost');
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.06);
    var x0 = b.x1 + fs, x1 = b.x2 - fs, y0 = b.y1 + b.h * 0.55, A = b.h * 0.26, Lw = (x1 - x0) / nl;
    var T = 2, v = Lw / T, w = TAU / T, t = K.t(o);
    var src = dir > 0 ? x0 : x1, front = v * t;
    var stateAt = function (x, tt) { return K.travelWaveState(Math.abs(x - src), tt, A, Lw, T); };
    var y = function (x, tt) { return stateAt(x, tt).y; };
    K.arrow(c, x0 - 4, y0, x1 + fs * 0.6, y0, K.alpha(col, 0.5), 1, 7);
    K.txt(c, 'x', x1 + fs * 0.4, y0 + fs * 0.8, { essential: true, c: col, s: fs * 0.85, i: true });
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
    K.txt(c, 'P', Px + fs * 0.65, Py - fs * 0.75, { c: C.F, s: fs, i: true, essential: true });
    var particle = stateAt(Px, t);
    if (particle.reached) {
      var L = particle.vy / w * 0.7;
      if (Math.abs(L) > 3) {
        K.arrow(c, Px, Py, Px, Py - L, C.v, lw, fs * 0.65);
        K.drawMathLabel(c, [{ symbol: 'v', sub: 'y', variableSub: true, vector: true }],
          Px - fs * .5, Py - L - fs * .6, { c: C.v, s: fs * .8, al: 'right', maxWidth: fs * 2.2,
            maxHeight: fs, essential: true });
      }
    }
    K.ray(c, (x0 + x1) / 2 - dir * Lw * 0.25, b.y1 + fs * .85, (x0 + x1) / 2 + dir * Lw * .25, b.y1 + fs * .85, C.a, lw);
    K.txt(c, '波的传播方向', (x0 + x1) / 2, b.y1 + fs * 1.6, { c: C.a, s: fs * .7, maxWidth: b.w * .4, essential: true });
    K.txt(c, '波源 S', src, Math.min(b.y2 - fs * 1.05, y0 + A + fs * .7),
      { c: col, s: fs * .75, ui: true, al: dir > 0 ? 'left' : 'right', maxWidth: b.w * .34, essential: true });
    if (front > Lw * 1.05 && b.h >= fs * 7.5) {
      var xs = src + dir * Lw * 0.25, ly = y0 - A - fs * 0.6;
      K.arrow(c, xs + dir * Lw / 2, ly, xs, ly, col, 1, 6); K.arrow(c, xs + dir * Lw / 2, ly, xs + dir * Lw, ly, col, 1, 6);
      K.txt(c, 'λ', xs + dir * Lw / 2, ly - fs * .65, { c: col, s: fs, i: true, essential: true });
    }
    K.txt(c, ghost && front > (x1 - x0) * 0.25 ? '比例示意 · 虚线为 T/8 后的波形' : '比例示意 · 理想横波',
      b.x2 - 4, b.y2 - 2, { essential: true, c: col, s: fs * 0.72, al: 'right', bl: 'bottom', maxWidth: b.w - 8 });
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
    K.line(c, px, py, cx, py, K.alpha(C.a, .7), 1, [1, 3]);
    K.dot(c, cx, py, Math.max(3.5, lw * 1.5), C.a);
    K.circ(c, px, py, Math.max(4, lw * 1.8), col, 1.5, C.F);
    var vL = R * 0.45; K.vec(c, px, py, -Math.sin(th) * vL, -Math.cos(th) * vL, C.v, lw, null, fs);
    var A = K.axes(c, gx, b.y1, gw, b.h, { xmin: 0, xmax: Tw, ymin: -1.15, ymax: 1.15, xl: 't/s',
      yl: [{ symbol: 'x' }, '/', { symbol: 'A' }], O: false, col: col, fs: fs * 0.85, lw: 1.2,
      pad: { l: 4, r: fs * 1.5, t: b.h / 2 - R * 1.15, b: b.h / 2 - R * 1.15 } });
    var tw = K.mod(t, Tw), t0 = t - tw;
    K.plot(c, A, function (x) { return Math.sin(w * (t0 + x) + phi0); }, 0, tw, col, lw, null, 200);
    K.plot(c, A, function (x) { return Math.sin(w * (t0 + x) + phi0); }, tw, Tw, K.alpha(col, 0.18), 1, [4, 4], 120);
    var gxp = A.X(tw); K.line(c, cx, py, gxp, py, K.alpha(C.a, .5), 1, [1, 3]); K.dot(c, gxp, py, Math.max(3.5, lw * 1.4), C.a);
    K.txt(c, '虚线为参考圆及预示曲线', b.x2 - 4, b.y2 - 2,
      { essential: true, c: col, s: fs * 0.72, al: 'right', bl: 'bottom', maxWidth: gw });
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
    var x0 = b.x1 + 6, x1 = b.x2 - 6, W = x1 - x0, y0 = b.y1 + b.h * .57, A = b.h * .20, sg = W * 0.05;
    var Tc = 6, t = K.mod(K.t(o), Tc), v = W * 0.8 / (Tc - 1), u = Math.min(t, Tc - 1);
    var c1 = x0 + W * 0.1 + v * u, c2 = x1 - W * 0.1 - v * u, s2 = opp ? -1 : 1;
    var g1 = function (x) { return A * Math.exp(-Math.pow((x - c1) / sg, 2)); };
    var g2 = function (x) { return s2 * A * Math.exp(-Math.pow((x - c2) / sg, 2)); };
    K.line(c, x0, y0, x1, y0, K.alpha(col, 0.35), 1);
    var p1 = [], p2 = [], ps = [];
    for (var x = x0; x <= x1; x += 2) { p1.push([x, y0 - g1(x)]); p2.push([x, y0 - g2(x)]); ps.push([x, y0 - g1(x) - g2(x)]); }
    K.poly(c, p1, K.alpha(C.a, .85), 1); K.poly(c, p2, K.alpha(C.gas, .85), 1);
    K.poly(c, ps, col, lw);
    K.ray(c, c1 - sg, b.y1 + fs, c1 + sg, b.y1 + fs, C.a, 1);
    K.ray(c, c2 + sg, b.y1 + fs, c2 - sg, b.y1 + fs, C.gas, 1);
    K.txt(c, '细线为分波 · 粗线为合位移', b.x2 - 4, b.y2 - 3,
      { c: col, s: fs * .7, al: 'right', bl: 'bottom', maxWidth: b.w * .54, essential: true });
    K.txt(c, Math.abs(c1 - c2) < 1e-8 ? (opp ? '重合时完全相消' : '重合时振幅为 2A') : '位移逐点相加', b.x1 + 4, b.y2 - fs * 0.6,
      { c: col, s: fs * .75, al: 'left', maxWidth: b.w * .4, ui: true });
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

/* ===== 上游 pm_optics.js ===== */
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
K.snellAngle = function (n1, n2, incidence) {
  const sine = n1 * Math.sin(incidence) / n2;
  return Math.abs(sine) > 1 + 1e-12 ? null : Math.asin(K.clamp(sine, -1, 1));
};
K.opticsLab = {};
K.opticsLab.refraction = function (n1, n2, incidence) {
  const critical = n1 > n2 ? Math.asin(n2 / n1) : null;
  const angle = critical !== null && Math.abs(incidence - critical) <= 1e-12
    ? PI / 2 : K.snellAngle(n1, n2, incidence);
  // Screen y increases downward. Both reported angles are measured from the normal.
  const sx = Math.sin(incidence), sy = Math.cos(incidence);
  return {
    critical, angle, tir: angle === null, reflection: incidence, matched: Math.abs(n1 - n2) < 1e-12,
    incoming: [sx, sy], reflected: [sx, -sy],
    transmitted: angle === null ? null : [Math.sin(angle), Math.cos(angle)]
  };
};
K.tog('qRefractAnswers', '显示折射角和临界条件', true);
K.tog('qRefractCritical', '将入射角调到临界角', false);
K.opticsLab.refractionFor = function (o) {
  const n1 = K.v(o, 'qN1'), n2 = K.v(o, 'qN2');
  const useCritical = n1 > n2 && K.v(o, 'qRefractCritical');
  const incidence = useCritical ? Math.asin(n2 / n1) : K.v(o, 'qInc') * D2R;
  return { n1, n2, incidence, ...K.opticsLab.refraction(n1, n2, incidence) };
};

const Q = (value, unit = '', digits = 2) => K.formatQuantity(value, unit, digits);
const S = (symbol, sub) => ({ symbol, sub });
const frac = (numerator, denominator) => ({ frac: [numerator, denominator] });
const aux = [5, 4], guide = [1, 3];

function opticLabel(c, tokens, x, y, fs, col, maxWidth, al = 'left') {
  K.drawMathLabel(c, tokens, x, y, { c: col, s: fs, maxWidth, maxHeight: fs * 1.12, al, essential: true });
}

function opticNotes(c, o, lines, b, h, fs) {
  if (!h || !K.showDetails(o)) return;
  K.drawMathBlock(c, lines, b.x1 + 4, b.y2 - h + fs * .15, {
    c: o.color, s: fs * .86, maxWidth: b.w - 8, maxHeight: h - fs * .25
  });
}

K.reg({
  key: 'pm_refract', cat: 'optics', label: '折射·全反射', params: ['qN1', 'qN2', 'qInc', 'qRefractCritical', 'qRefractAnswers'],
  showParam(o, key) {
    const hasCritical = K.v(o, 'qN1') > K.v(o, 'qN2');
    if (key === 'qInc') return !hasCritical || !K.v(o, 'qRefractCritical');
    return key !== 'qRefractCritical' || hasCritical;
  },
  icon: '<path d="M2 12h20"/><path d="M12 3v18" stroke-dasharray="2 2"/><path d="M5 4l7 8 3.5 8"/><path d="M12 12l7-8" opacity=".5"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    if (b.w < 60 || b.h < 60) return;
    const m = K.opticsLab.refractionFor(o), { n1, n2, incidence: i } = m;
    const col = o.color, lw = K.lw(o);
    const fs = K.fs(K.S(b), .047, 9, 19), fine = Math.max(.75, lw / 2);
    const details = K.showDetails(o) && b.h > 105;
    const h = details ? Math.min(b.h * .28, fs * 4.3) : 0;
    const base = b.y2 - h, x = (b.x1 + b.x2) / 2, y = (b.y1 + base) / 2;
    const L = Math.min((base - b.y1) * .4, b.w * .42);
    const top = b.y1 + 4, bottom = base - 4;
    const labelWidth = b.w * .39;
    K.line(c, b.x1 + 4, y, b.x2 - 4, y, col, lw * (5 / 3));
    K.line(c, x, top, x, bottom, K.alpha(col, .82), fine, aux);
    opticLabel(c, [S('n', '1'), ' = ', Q(n1)], b.x1 + 4, top, fs, col, labelWidth);
    opticLabel(c, [S('n', '2'), ' = ', Q(n2)], b.x1 + 4, y + fs * .55, fs, col, labelWidth);
    const [ix, iy] = m.incoming;
    K.ray(c, x - ix * L, y - iy * L, x, y, C.light, lw);
    const [rx, ry] = m.reflected;
    if (!m.matched && i > 1e-8) {
      K.ray(c, x, y, x + rx * L, y + ry * L, m.tir ? C.light : K.alpha(C.light, .65), lw);
    } else if (!m.matched) {
      // The reflected ray returns along the incident segment, so its arrow is placed separately.
      const reverse = -ry;
      K.head(c, x, y - reverse * L * .72, 0, -1, Math.min(8, L * .27), C.light);
    }
    if (m.transmitted) {
      const [tx, ty] = m.transmitted;
      // The grazing critical ray shares the interface. A small linewidth contrast keeps its
      // direction arrow visible without displacing its true geometric location.
      K.ray(c, x, y, x + tx * L, y + ty * L, C.light, lw);
    }
    const angle = (start, end, symbol, r) => {
      if (Math.abs(start - end) < .07 || L < 28) return;
      K.angArc(c, x, y, r, start, end, col, fine);
      const middle = (start + end) / 2, offset = r + fs * .75;
      opticLabel(c, [S(symbol)], x + Math.cos(middle) * offset, y + Math.sin(middle) * offset - fs * .45,
        fs * .9, col, fs * 1.6, 'center');
    };
    angle(-PI / 2 - i, -PI / 2, 'i', L * .26);
    if (m.angle !== null) angle(PI / 2 - m.angle, PI / 2, 'r', L * .29);
    K.dot(c, x, y, Math.max(1.6, lw), col);
    if (details) {
      const answers = K.v(o, 'qRefractAnswers');
      const outcome = m.tir ? '全反射' : m.angle === PI / 2 ? '折射光沿界面' : '折射';
      const lines = answers ? [
        [S('n', '1'), ' sin ', S('i'), ' = ', S('n', '2'), ' sin ', S('r'), '    从法线量角'],
        [outcome, '    ', S('i'), ' = ', Q(i / D2R, '°', 1),
          ...(m.angle === null ? [] : ['    ', S('r'), ' = ', Q(m.angle / D2R, '°', 1)])],
        m.critical === null ? '仅从高折射率介质射向低折射率介质时有临界角'
          : [S('θ', 'c'), ' = arcsin(', S('n', '2'), '/', S('n', '1'), ') = ', Q(m.critical / D2R, '°', 1)]
      ] : ['从法线量角，比较折射角与入射角', '逐步调节入射角，找出折射光沿界面的位置'];
      opticNotes(c, o, lines, b, h, fs);
    }
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
    K.poly(c, V, col, lw, null, true);
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
        K.ray(c, p[0], p[1], q[0], q[1], cl, lw);
        var no = nOut(faces[bf]), nd = K.refract(d, [-no[0], -no[1]], n);
        if (nd) {
          var Lx = b.w;
          K.ray(c, q[0], q[1], q[0] + nd[0] * Lx, q[1] + nd[1] * Lx, cl, lw);
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
K.P('qU', { label: '物距 u/|f|', min: 0.2, max: 4, step: 0.05, def: 2.5 });
K.tog('qLensLab', '开启光具座测量', false);
K.P('qLensF', { label: '焦距大小', min: 5, max: 45, step: .5, def: 15, unit: 'cm' });
K.P('qLensObject', { label: '物距', min: 3, max: 160, step: .5, def: 30, unit: 'cm' });
K.P('qLensHeight', { label: '物高', min: .5, max: 8, step: .5, def: 3, unit: 'cm' });
K.P('qLensScreen', { label: '屏距', min: 5, max: 180, step: .5, def: 45, unit: 'cm' });
K.tog('qLensSweep', '从 5 cm 向设定屏距扫描', false);
K.tog('qLensAnswers', '显示像距和放大率', false);

K.opticsLab.lens = function ({ f, u, height, screen = null }) {
  // A real object has u>0, a converging lens f>0, and a real image v>0.
  const separation = u - f;
  const focus = Math.abs(separation) <= 1e-12 * Math.max(u, Math.abs(f));
  const v = focus ? Infinity : f * u / separation;
  const magnification = focus ? null : -v / u;
  const image = focus ? null : { x: v, y: height * magnification };
  const classify = focus ? 'parallel' : v > 0 ? 'real' : 'virtual';
  const rays = [height, 0];
  if (!focus) {
    const third = -height * f / separation;
    if (Math.abs(third) <= height * 1.65 && Math.abs(third) > height * .06 && Math.abs(third - height) > height * .06) {
      rays.push(third);
    }
  }
  const light = rays.map(h => {
    const incoming = (h - height) / u, slope = incoming - h / f;
    return { h, incoming, slope, y: x => h + slope * x };
  });
  const screenHits = screen === null ? [] : light.map(ray => ray.y(screen));
  return {
    f, u, height, screen, v, magnification, image, classify, rays: light, screenHits,
    blur: screen === null ? null : Math.max(...screenHits) - Math.min(...screenHits),
    focused: screen !== null && classify === 'real' && Math.abs(v - screen) <= .05
  };
};

const lenSpeed = 25;
const lensSweep = o => K.v(o, 'qLensLab') === true && K.v(o, 'qLensSweep') === true;
const lensInputs = o => {
  const lab = K.v(o, 'qLensLab') === true;
  const absF = lab ? K.v(o, 'qLensF') : 15;
  const u = lab ? K.v(o, 'qLensObject') : K.v(o, 'qU') * absF;
  const target = K.v(o, 'qLensScreen');
  const screen = !lab ? null : lensSweep(o) ? K.clamp(5 + K.t(o) * lenSpeed, 5, target) : target;
  return { f: K.v(o, 'qLens') === 0 ? absF : -absF, u, height: lab ? K.v(o, 'qLensHeight') : 3, screen };
};
K.opticsLab.lensFor = o => K.opticsLab.lens(lensInputs(o));

function paintLens(c, x, y, radius, width, converging, col, lw) {
  c.save(); c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
  if (converging) {
    c.moveTo(x, y - radius);
    c.quadraticCurveTo(x + width, y, x, y + radius);
    c.quadraticCurveTo(x - width, y, x, y - radius);
  } else {
    c.moveTo(x - width * .58, y - radius);
    c.lineTo(x + width * .58, y - radius);
    c.quadraticCurveTo(x, y, x + width * .58, y + radius);
    c.lineTo(x - width * .58, y + radius);
    c.quadraticCurveTo(x, y, x - width * .58, y - radius);
  }
  c.stroke(); c.restore();
}

function drawLens(c, o, GH) {
  const b = GH.box(o);
  if (b.w < 82 || b.h < 60) return;
  const m = K.opticsLab.lensFor(o), col = o.color, lw = K.lw(o);
  const fs = K.fs(K.S(b), .046, 9, 18), fine = Math.max(.75, lw / 2);
  const details = K.showDetails(o) && b.h > 105;
  const h = details ? Math.min(b.h * .26, fs * 4.5) : 0;
  const top = b.y1 + 4, end = b.y2 - h;
  const F = Math.abs(m.f);
  const x0 = -Math.max(2.3 * F, m.u * 1.13, m.image?.x < 0 ? Math.min(-m.image.x * 1.12, 4.2 * F) : 0);
  const x1 = Math.max(2.3 * F, (m.screen === null ? 0 : Math.max(m.screen, lensSweep(o) ? K.v(o, 'qLensScreen') : 0)) * 1.12,
    m.image?.x > 0 ? Math.min(m.image.x * 1.12, 4.2 * F) : 0);
  const topSpace = fs * 1.2, innerH = end - top - topSpace;
  const X = x => b.x1 + 6 + (x - x0) * (b.w - 12) / (x1 - x0);
  const axisY = top + topSpace + innerH * .46;
  const heightLimit = Math.max(m.height * 1.65, Math.min(Math.abs(m.image?.y ?? 0) * 1.12, m.height * 2.3));
  const Y = y => axisY - y * (innerH * .31 / heightLimit);
  const xAtCrop = (origin, y, slope, target, topY, bottomY) => {
    if (!slope) return target;
    const dy = Y(y + slope * (target - origin));
    if (dy >= topY && dy <= bottomY) return target;
    const boundary = dy < topY ? topY : bottomY;
    return origin + (target - origin) * (boundary - Y(y)) / (dy - Y(y));
  };
  const lab = m.screen !== null, answer = !lab || K.v(o, 'qLensAnswers');
  const caption = lab ? '光具座 · 纵向放大示意' : '薄透镜 · 纵向放大示意';
  opticLabel(c, [caption], b.x1 + 4, top, fs, col, b.w * .7);
  const left = X(x0), right = X(x1), cx = X(0), bench = end - 4;
  K.line(c, left, axisY, right, axisY, K.alpha(col, .8), fine);
  if (lab) {
    K.line(c, left, bench, right, bench, col, lw * (5 / 3));
    [X(-m.u), cx, X(m.screen)].forEach(x => K.line(c, x, bench, x, bench - fs * .45, col, fine));
  }
  const rayTop = top + topSpace + 1, rayBottom = Math.min(bench - fs * .55, axisY + innerH * .39);
  const rayEnd = lab ? m.screen : m.classify === 'real' ? Math.min(m.v, x1) : x1;
  for (const ray of m.rays) {
    K.ray(c, X(-m.u), Y(m.height), cx, Y(ray.h), C.light, lw);
    const endX = xAtCrop(0, ray.h, ray.slope, rayEnd, rayTop, rayBottom);
    K.ray(c, cx, Y(ray.h), X(endX), Y(ray.y(endX)), C.light, lw);
    const back = m.classify === 'virtual' && (!lab || answer);
    const blocked = lab && answer && m.classify === 'real' && m.v > m.screen + .05;
    if (back || blocked) {
      const from = back ? 0 : endX, target = K.clamp(m.v, x0, x1);
      const dest = xAtCrop(from, ray.y(from), ray.slope, target, rayTop, rayBottom);
      K.line(c, X(from), Y(ray.y(from)), X(dest), Y(ray.y(dest)), C.light, fine, aux);
    }
  }
  paintLens(c, cx, axisY, axisY - Y(m.height * 1.62), Math.max(3, Math.min(b.w * .027, 18)), m.f > 0, col, lw);
  K.arrow(c, X(-m.u), axisY, X(-m.u), Y(m.height), col, lw);
  for (const [factor, tokens] of [[-2, ['2', S('F')]], [-1, [S('F')]], [0, [S('O')]], [1, [S('F'), '′']], [2, ['2', S('F'), '′']]]) {
    const x = X(factor * F), spacing = Math.abs(X(F) - cx);
    K.line(c, x, axisY - 2.5, x, axisY + 2.5, col, fine);
    if (spacing >= Math.max(9, fs * 1.05) || factor === 0) {
      const besideScreen = lab && Math.abs(x - X(m.screen)) < fs * .65;
      const side = besideScreen ? -fs * .56 : 0;
      const besideImage = m.image && answer && m.image.y < 0 && Math.abs(x - X(m.v)) < fs * .82;
      const markY = besideImage ? axisY - fs * 1.05 : axisY + fs * .72;
      opticLabel(c, tokens, x + side, markY, fs, col,
        Math.max(9, spacing * .82), besideScreen ? 'right' : 'center');
    }
  }
  if (lab) {
    const x = X(m.screen), scr = Math.max(fs, axisY - Y(m.height * 1.4));
    // At the screen illuminate the interval spanned by the traced ray intersections.
    K.line(c, x, axisY - scr, x, axisY + scr, col, lw * (5 / 3));
    const hi = K.clamp(Y(Math.max(...m.screenHits)), axisY - scr, axisY + scr);
    const lo = K.clamp(Y(Math.min(...m.screenHits)), axisY - scr, axisY + scr);
    if (lo - hi > 1.5) K.line(c, x, hi, x, lo, C.light, lw);
    else if (lo > axisY - scr && hi < axisY + scr) K.dot(c, x, (lo + hi) / 2, lw * 1.7, C.light);
    opticLabel(c, ['光屏'], x, axisY - scr - fs * 1.25, fs, col, fs * 2.55, 'center');
  }
  if (m.image && answer && m.v >= x0 && m.v <= x1 && Y(m.image.y) > rayTop && Y(m.image.y) < rayBottom) {
    const solid = m.classify === 'real' && (!lab || m.v <= m.screen + .05);
    K.arrow(c, X(m.v), axisY, X(m.v), Y(m.image.y), C.g2, lw, null, solid ? null : aux);
  }
  if (details) {
    const status = m.classify === 'parallel' ? '出射光平行' : m.classify === 'virtual' ? '正立虚像，不能投屏'
      : lab && m.focused ? '倒立实像，光屏清晰' : '倒立实像';
    const lines = [
      [S('u'), ' = ', Q(m.u, 'cm'), '    ', S('f'), ' = ', Q(m.f, 'cm'),
        ...(lab ? ['    屏距 ', Q(m.screen, 'cm', 1)] : [])],
      answer ? [frac(['1'], [S('f')]), ' = ', frac(['1'], [S('u')]), ' + ', frac(['1'], [S('v')]),
        '    ', S('m'), ' = −', frac([S('v')], [S('u')]), '    实物、实像距离取正']
        : ['移动光屏，观察光线汇聚及屏上光斑'],
      answer ? [status, ...(m.image ? ['    ', S('v'), ' = ', Q(m.v, 'cm'), '    ', S('m'), ' = ', Q(m.magnification)] : [])]
        : ['测量清晰位置并计算像距与放大率']
    ];
    opticNotes(c, o, lines, b, h, fs);
  }
}

K.reg({
  key: 'pm_lens', cat: 'optics', label: '透镜成像', animatable: true, params:
    ['qLens', 'qU', 'qLensLab', 'qLensF', 'qLensObject', 'qLensHeight', 'qLensScreen', 'qLensSweep', 'qLensAnswers'],
  canAnimate: lensSweep,
  showParam(o, key) {
    if (key === 'qLens' || key === 'qLensLab') return true;
    return key === 'qU' ? K.v(o, 'qLensLab') !== true : K.v(o, 'qLensLab') === true;
  },
  animationTimeline(o) {
    const target = K.v(o, 'qLensScreen'), duration = (target - 5) / lenSpeed;
    const m = K.opticsLab.lensFor(o);
    const events = m.classify === 'real' && m.v > 5 && m.v <= target
      ? [{ t: (m.v - 5) / lenSpeed, label: '光屏清晰成像' }] : [];
    return { duration, events };
  },
  icon: '<path d="M1 12h22"/><path d="M12 3q3 9 0 18q-3-9 0-18z"/><path d="M5 12V6"/><path d="M3.5 7.5L5 6l1.5 1.5"/><path d="M18 12v4" stroke-dasharray="1.5 1.5"/>',
  draw: drawLens
});

/* ---------- 光导纤维 ---------- */
K.reg({
  key: 'pm_fiber', cat: 'optics', label: '光导纤维', params: ['qInc'],
  icon: '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M2 10h20M2 14h20" opacity=".5"/><path d="M1 9l4 3 4-2 4 4 4-4 4 3"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 100 || b.h < 50) return;
    var i = Math.min(K.v(o, 'qInc'), 85) * D2R, n1 = 1.5, n2 = 1.4, col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.06), Lc = C.light;
    var xa = b.x1 + b.w * 0.18, xb = b.x2 - 4, yc = b.y1 + b.h * 0.52, hc = b.h * 0.15, hcl = b.h * 0.25;
    K.box(c, xa, yc - hcl, xb - xa, hcl * 2, K.alpha(col, 0.5), 1);
    K.box(c, xa, yc - hc, xb - xa, hc * 2, col, lw);
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
      if (nx > xb) { var u = (xb - x) / (nx - x); K.ray(c, x, y, xb, y + (yt - y) * u, K.alpha(Lc, amp), lw); break; }
      K.ray(c, x, y, nx, yt, K.alpha(Lc, amp), lw);
      if (!ok) {
        var tr = Math.asin(Math.min(1, n1 * Math.sin(inc) / n2)), out = dy > 0 ? 1 : -1;
        K.ray(c, nx, yt, nx + (hcl - hc) * Math.tan(tr), yt + out * (hcl - hc), K.alpha(C.F, amp * 0.9), lw);
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
    K.box(c, b.x1 + b.w * 0.06, yt, b.w * 0.88, T, col, lw);
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
    c.strokeStyle = col; c.lineWidth = lw; c.stroke(); c.restore();
    K.line(c, Ox, b.y1 + 4, Ox, Oy + R, col, 1, [5, 4]);
    var state = K.opticsLab.refraction(n, 1, i), Cc = state.critical, tir = state.tir, si = Math.sin(i), ci = Math.cos(i);
    clipBox(c, b);
    K.ray(c, Ox - si * R * 1.5, Oy + ci * R * 1.5, Ox - si * R, Oy + ci * R, Lc, lw, null, true);
    K.ray(c, Ox - si * R, Oy + ci * R, Ox, Oy, Lc, lw);
    var ra = tir ? 1 : 0.35;
    K.ray(c, Ox, Oy, Ox + si * R, Oy + ci * R, K.alpha(Lc, ra), tir ? lw : 1.2);
    K.line(c, Ox + si * R, Oy + ci * R, Ox + si * R * 1.5, Oy + ci * R * 1.5, K.alpha(Lc, ra), tir ? lw : 1.2);
    if (!tir) {
      var r = state.angle;
      K.ray(c, Ox, Oy, Ox + Math.sin(r) * R * 1.2, Oy - Math.cos(r) * R * 1.2, Lc, lw);
      if (r > 0.02) K.angArc(c, Ox, Oy, R * 0.3, -PI / 2, -PI / 2 + r, col, 1, 'r', fs);
    }
    c.restore();
    if (i > 0.02) K.angArc(c, Ox, Oy, R * 0.26, PI / 2, PI / 2 + i, col, 1, 'i', fs);
    K.txt(c, 'O', Ox - fs * 0.8, Oy - fs * 0.6, { c: col, s: fs, i: true });
    K.txt(c, '光沿半径射向圆心，在弧面不偏折', b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.75, al: 'left', ui: true });
    K.txt(c, (tir ? '全反射：' : '折射：') + 'i = ' + deg(i) + '，C = arcsin(1/n) = ' + (Cc === null ? '无' : deg(Cc)), b.x1 + 4, b.y1 + fs * 0.7,
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

/* ===== 上游 pm_thermo.js ===== */
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

K.thermalMolecules = function (count) { return mols(count, 1234 + count); };

/* ---------- 气体分子热运动（动画） ---------- */
K.P('qTemp', { label: '温度T', min: 50, max: 1200, step: 10, def: 300, unit: 'K' });
K.P('qNum', { label: '分子数', min: 10, max: 300, step: 10, def: 80 });
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
K.gasProcess = function (pr, s) {
  if (pr === 0) { var V = 1 + 0.3 * s; return { V: V, p: 1 / V, T: 1 }; }
  if (pr === 1) { var V1 = 1 + 0.3 * s; return { V: V1, p: 1, T: V1 }; }
  if (pr === 2) { var T2 = 1 + 0.3 * s; return { V: 1, p: T2, T: T2 }; }
  var V3 = 1 + 0.3 * s; return { V: V3, p: Math.pow(V3, -1.4), T: Math.pow(V3, -0.4) };
};
// p₀V₀ 为能量单位，定量关系取定量理想气体、准静态过程。
K.gasWorkBy = function (process, from, to) {
  if (process === 0) return Math.log(to / from);
  if (process === 1) return to - from;
  if (process === 2) return 0;
  return (Math.pow(from, -0.4) - Math.pow(to, -0.4)) / 0.4;
};
K.drawPiston = function (c, xL, yb, cw, Hc, hg, rodTop, col, lw, insulated, fill) {
  var xR = xL + cw, pt = Hc * 0.07, py = yb - hg - pt;
  K.box(c, xL + 1, yb - hg, cw - 2, hg, null, 0, fill);
  K.poly(c, [[xL, yb - Hc], [xL, yb], [xR, yb], [xR, yb - Hc]], col, lw * 1.2);
  if (insulated) {
    K.hatch(c, xL - 2, yb - Hc, xL - 2, yb, col, 1, 7, 1);
    K.hatch(c, xR + 2, yb, xR + 2, yb - Hc, col, 1, 7, 1);
    K.hatch(c, xL, yb + 2, xR, yb + 2, col, 1, 7, 1);
  }
  K.box(c, xL + 1, py, cw - 2, pt, col, lw, K.alpha(col, 0.35), 2);
  K.line(c, xL + cw / 2, py, xL + cw / 2, rodTop, col, lw * 1.4);
  return py;
};
K.reg({
  key: 'pm_cylinder', cat: 'thermo', label: '气缸·状态变化', animatable: true, params: ['qProc'],
  icon: '<path d="M4 4v16h9V4"/><rect x="4" y="9" width="9" height="2.5"/><path d="M8.5 9V2"/><path d="M15 19V8M15 19h7"/><path d="M16 10q2 6 6 7"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 120 || b.h < 80) return;
    var pr = K.v(o, 'qProc'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05), t = K.t(o), P = 4;
    var st = K.gasProcess(pr, Math.sin(TAU * t / P)), ds = Math.cos(TAU * t / P);
    var phiAt = function (tt) { var n = 48, h = tt / n, sum = 0; for (var i = 0; i <= n; i++) { var w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2); sum += w * Math.sqrt(K.gasProcess(pr, Math.sin(TAU * i * h / P)).T); } return sum * h / 3; };
    var Phi = Math.floor(t / P) * phiAt(P) + phiAt(K.mod(t, P));
    var cw = b.w * 0.26, xL = b.x1 + b.w * 0.06, xR = xL + cw, yb = b.y2 - fs * 2.6, Hc = b.h * 0.7, H0 = Hc * 0.55, hg = H0 * st.V;
    var wall = pr === 3 ? 6 : 2;
    var py = K.drawPiston(c, xL, yb, cw, Hc, hg, yb - Hc - b.h * 0.08,
      col, lw, pr === 3, K.alpha(C.gas, 0.08 + 0.12 * (st.T - 0.7)));
    var M = K.memo(o, 'cyl', function () { return mols(46, 4242); }), r = K.clamp(S * 0.011, 2, 5), k = S * 0.12;
    for (var i = 0; i < M.length; i++) {
      var m = M[i];
      K.dot(c, xL + wall + r + (cw - 2 * wall - 2 * r) * K.tri(m.x + m.vx * k * Phi / cw), yb - r - (hg - 2 * r) * K.tri(m.y + m.vy * k * Phi / H0), r, spd(m.s * Math.sqrt(st.T) / 3.4));
    }
    if (pr === 2) { K.box(c, xL - 6, py - 6, 10, 6, col, 1, C.F); K.box(c, xR - 4, py - 6, 10, 6, col, 1, C.F); K.txt(c, '卡销固定', xR + 12, py - 3, { c: C.F, s: fs * 0.75, al: 'left', ui: true }); }
    var heat = pr === 3 ? 0 : ds;
    if (pr !== 3 && Math.abs(heat) > 0.08) {
      var hc = heat > 0 ? '#f97316' : '#38bdf8', fy = yb + 4;
      for (var q = 0; q < 4; q++) { var fx = xL + cw * (0.2 + q * 0.2), fh = fs * 1.3 * Math.abs(heat);
        var tip = heat > 0 ? fy : fy + fh, base = heat > 0 ? fy + fh : fy;
        K.poly(c, [[fx - fs * 0.35, base], [fx, tip], [fx + fs * 0.35, base]], null, 0, null, true, K.alpha(hc, 0.75)); }
      K.txt(c, heat > 0 ? '吸热' : '放热', xL + cw / 2, yb + fs * 2.1, { c: hc, s: fs * 0.85, ui: true });
    }
    var gx = b.x1 + b.w * 0.44, gw = b.w * 0.54, gh = b.h * 0.72;
    var A = K.mini(c, gx, b.y1 + 2, gw, gh, { xmin: 0, xmax: 1.45, ymin: 0, ymax: 1.85,
      xl: [{ symbol: 'V' }, '/', { symbol: 'V', sub: 0 }], yl: [{ symbol: 'p' }, '/', { symbol: 'p', sub: 0 }],
      col: col, fs: fs * 0.85, lw: 1 });
    if (pr === 3) K.plot(c, A, function (v) { return 1 / v; }, 0.6, 1.4, K.alpha(col, 0.4), 1, [4, 4]);
    if (pr === 2) K.line(c, A.X(1), A.Y(0.7), A.X(1), A.Y(1.3), C.a, 2);
    else K.plot(c, A, function (v) { return K.gasProcess(pr, (v - 1) / 0.3).p; }, 0.7, 1.3, C.a, 2);
    K.dot(c, A.X(st.V), A.Y(st.p), Math.max(3.5, lw * 1.5), C.F);
    K.guide(c, A, st.V, st.p, K.alpha(col, 0.5), 1);
    if (pr === 3) K.txt(c, '虚线为等温线', A.X1, A.Y0 + fs * 0.4,
      { essential: true, c: col, s: fs * 0.7, al: 'right', ui: true, maxWidth: A.X1 - A.X0 });
    var law = ['等温 ΔU = 0', '等压 W = pΔV', '等容 W = 0', '可逆绝热 Q = 0，γ = 1.4'][pr];
    K.lines(c, ['ΔU = Q − W（对外做功为正）',
      law + '，W/(p₀V₀) = ' + K.formatQuantity(K.gasWorkBy(pr, 1, st.V), '', 2),
      '定量理想气体 · 分子运动为示意'], gx, b.y1 + gh + 3, col, Math.min(fs * 0.82, b.h * 0.056), 'left', gw - 3);
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
    K.lab(c, fr ? 'W_入' : 'W_出', (cx + R + b.x2) / 2, cy - fs * 0.9, { c: C.a, s: fs });
    K.lines(c, fr ? ['Q₁ = Q₂ + W入', '热量不能自发地', '从低温传到高温'] : ['Q₁ = W出 + Q₂', 'η = W出/Q₁ < 1', '第二类永动机不可能'], b.x2 - b.w * 0.28, b.y1 + bh + fs, col, fs * 0.8, 'left', b.w * 0.28 - 2);
  }
});
})();

/* ===== 上游 pm_em1.js ===== */
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
      K.txt(c, right ? 'S' : 'N', cx - hw / 2, cy, {  essential: true,c: '#fff', s: fs * 1.3, b: true, ui: true });
      K.txt(c, right ? 'N' : 'S', cx + hw / 2, cy, {  essential: true,c: '#fff', s: fs * 1.3, b: true, ui: true });
    } else {
      var r = Math.max(5, sc * 0.045);
      F.W.forEach(function (w) { K.wireSym(c, X(w[0]), Y(w[1]), r, w[2] > 0, col, 1.2); });
      if (mode === 0) {
        K.box(c, X(-F.l / 2) - r, Y(F.a) - r * 1.4, F.l * sc + 2 * r, 2 * F.a * sc + r * 2.8, K.alpha(col, 0.35), 1, null, 4);
        K.txt(c, right ? 'S' : 'N', X(-F.l / 2) - r * 3.2, cy - fs * 1.2, {  essential: true,c: col, s: fs * 1.2, b: true, ui: true });
        K.txt(c, right ? 'N' : 'S', X(F.l / 2) + r * 3.2, cy - fs * 1.2, {  essential: true,c: col, s: fs * 1.2, b: true, ui: true });
      }
    }
    K.txt(c, mode === 2 ? '磁体外部 N → S，内部 S → N，磁感线闭合' : '⊙ 电流向外  ⊗ 电流向里   内部磁场近似匀强', b.x1 + 4, b.y2 - fs * 0.6,
      { c: col, s: fs * 0.78, al: 'left', ui: true });
  }
});

/* ---------- 电场线与等势面（库仑场叠加 + 行进方格法等值线） ---------- */
K.sel('qEqMode', '电荷分布', ['正点电荷', '等量异种电荷', '等量同种电荷', '点电荷与金属板', '负点电荷'], 1);
K.tog('qEqLines', '显示电场线', true);
K.tog('qEqProbe', '加入试探电荷', false);
K.P('qEqX', { label: '试探电荷横坐标', unit: 'm', min: -1.8, max: 1.8, step: .05, def: .4 });
K.P('qEqY', { label: '试探电荷纵坐标', unit: 'm', min: -1.1, max: 1.1, step: .05, def: .6 });
K.P('qEqQ', { label: '试探电荷量', unit: 'nC', min: -2, max: 2, step: .1, def: 1 });
var EQ = function (mode) {
  var Q = mode === 4 ? [[0, 0, -1]] : mode === 0 ? [[0, 0, 1]] : mode === 1 ? [[-0.8, 0, 1], [0.8, 0, -1]] : mode === 2 ? [[-0.8, 0, 1], [0.8, 0, 1]] : [[0, 0.35, 1], [0, -1.55, -1]];
  var lev = mode === 4 ? [-2.4, -1.5, -1, -.7, -.5] : mode === 0 ? [0.5, 0.7, 1, 1.5, 2.4] : mode === 1 ? [-1.6, -0.9, -0.5, -0.22, 0, 0.22, 0.5, 0.9, 1.6] : mode === 2 ? [0.85, 1.05, 1.3, 1.7, 2.4, 3.4] : [0.15, 0.3, 0.5, 0.8, 1.3, 2.2];
  return { Q: Q, lev: lev, plate: mode === 3 ? -0.6 : null,
    phi: function (x, y) { var s = 0; for (var i = 0; i < Q.length; i++) s += Q[i][2] / Math.max(1e-3, Math.hypot(x - Q[i][0], y - Q[i][1])); return s; },
    E: function (x, y) { var ex = 0, ey = 0; for (var i = 0; i < Q.length; i++) { var dx = x - Q[i][0], dy = y - Q[i][1], r = Math.max(1e-3, Math.hypot(dx, dy)), k = Q[i][2] / (r * r * r); ex += k * dx; ey += k * dy; } return [ex, ey]; } };
};
K.electricSourceProbe = function (distribution, x, y, q) {
  var F = EQ(distribution), z = 8.9875517923;
  if (F.plate !== null) y = Math.max(F.plate + .06, y);
  if (F.Q.some(function (source) { return Math.hypot(x - source[0], y - source[1]) < .08; })) return null;
  var E = F.E(x, y).map(function (value) { return z * value; });
  return { x: x, y: y, E: E, phi: z * F.phi(x, y),
    force: E.map(function (value) { return q * value * 1e-9; }) };
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
  key: 'pm_equipotential', cat: 'em', label: '电场线·等势面', params: ['qEqMode', 'qEqLines', 'qEqProbe', 'qEqX', 'qEqY', 'qEqQ'],
  showParam: function (o, key) { return !['qEqX', 'qEqY', 'qEqQ'].includes(key) || !!K.v(o, 'qEqProbe'); },
  icon: '<circle cx="7" cy="12" r="2"/><circle cx="17" cy="12" r="2"/><path d="M9 12h6M8.5 10.5Q12 6 15.5 10.5"/><path d="M12 3v18" stroke-dasharray="2 2"/><ellipse cx="7" cy="12" rx="4.5" ry="5" stroke-dasharray="2 2"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 80 || b.h < 60) return;
    var mode = K.v(o, 'qEqMode'), showE = K.v(o, 'qEqLines'), col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.05), F = EQ(mode);
    var showProbe = !!K.v(o, 'qEqProbe');
    var fieldTop = b.y1 + (showProbe && K.showDetails(o) ? fs * 1.4 : 0);
    var fieldBottom = b.y2 - fs * 1.3;
    var Xd = 2.1, Yd = 1.35, sc = Math.min(b.w / (2 * Xd), (fieldBottom - fieldTop) / (2 * Yd));
    var cx = b.x1 + b.w / 2, cy = (fieldTop + fieldBottom) / 2;
    var X = function (x) { return cx + x * sc; }, Y = function (y) { return cy - y * sc; };
    var yLo = F.plate != null ? F.plate : -Yd;
    var data = K.memo(o, 'eq' + mode, function () {
      var cs = contours(F.phi, -Xd, Xd, yLo, Yd, 150, Math.round(150 * (Yd - yLo) / (2 * Xd)), F.lev), fl = [];
      F.Q.forEach(function (q) {
        if ((q[2] < 0 && mode !== 4) || (F.plate != null && q[1] < F.plate)) return;
        var n = 14;
        for (var k = 0; k < n; k++) { var a = (k + 0.5) / n * TAU;
          var direction = mode === 4 ? function (x, y) { return F.E(x, y).map(function (v) { return -v; }); } : F.E;
          var line = K.trace(direction, q[0] + 0.07 * Math.cos(a), q[1] + 0.07 * Math.sin(a), 0.012, 1600, function (x, y) {
            if (Math.abs(x) > Xd * 1.3 || y > Yd * 1.3 || y < yLo - (F.plate != null ? 0 : Yd * 0.3)) return true;
            for (var m = 0; m < F.Q.length; m++) if (F.Q[m][2] < 0 && Math.hypot(x - F.Q[m][0], y - F.Q[m][1]) < 0.06) return true;
            return false; });
          fl.push(mode === 4 ? line.reverse() : line);
        }
      });
      return { cs: cs, fl: fl };
    });
    c.save(); c.beginPath(); c.rect(b.x1, fieldTop, b.w, fieldBottom - fieldTop); c.clip();
    data.cs.forEach(function (p) { K.poly(c, p.map(function (q) { return [X(q[0]), Y(q[1])]; }), K.alpha(C.a, 0.85), 1.2, [5, 4]); });
    if (showE) data.fl.forEach(function (p) { var sp = p.map(function (q) { return [X(q[0]), Y(q[1])]; }); K.poly(c, sp, K.alpha(col, 0.8), 1.2); K.polyArrows(c, sp, Math.max(55, sc * 0.6), col, Math.max(6, lw * 2.6)); });
    c.restore();
    if (F.plate != null) {
      K.hatch(c, b.x1 + 4, Y(F.plate), b.x2 - 4, Y(F.plate), col, lw * 1.6, 9, 1);
      for (var i = -3; i <= 3; i++) K.txt(c, '−', X(i * 0.22), Y(F.plate) - fs * 0.5, {  essential: true,c: C.neg, s: fs, b: true });
    }
    F.Q.forEach(function (q) { if (F.plate != null && q[1] < F.plate) return; var r = Math.max(7, sc * 0.08);
      K.circ(c, X(q[0]), Y(q[1]), r, q[2] > 0 ? C.pos : C.neg, 1.5, q[2] > 0 ? K.alpha(C.pos, 0.85) : K.alpha(C.neg, 0.85));
      K.txt(c, q[2] > 0 ? '+' : '−', X(q[0]), Y(q[1]), {  essential: true,c: '#fff', s: r * 1.5, b: true, ui: true }); });
    K.txt(c, showProbe ? '实线为场线 · 虚线为等势线 · 探针箭长示意' : '实线为场线 · 虚线为等势线', b.x1 + 4, b.y2 - fs * .6,
      { c: col, s: fs * .72, al: 'left', maxWidth: b.w - 8, essential: true });
    if (!showProbe) return;
    var probe = K.electricSourceProbe(mode, K.v(o, 'qEqX'), K.v(o, 'qEqY'), K.v(o, 'qEqQ'));
    if (!probe) {
      K.drawMathLabel(c, '试探点太接近源电荷', b.x1 + 4, b.y1 + 3,
        { c: col, s: fs, maxWidth: b.w - 8, maxHeight: fs });
      return;
    }
    var px = X(probe.x), py = Y(probe.y);
    K.dot(c, px, py, 3.2, C.F);
    var mag = Math.hypot.apply(null, probe.E);
    var part = Math.sign(K.v(o, 'qEqQ'));
    if (mag > 1e-10) {
      var scale = Math.min(sc * .27, b.h * .18);
      var dx = scale * probe.E[0] / mag, dy = -scale * probe.E[1] / mag;
      // Shift the local field marker so it remains distinguishable from the force at the probe.
      var ox = -dy * .22, oy = dx * .22;
      var vector = function (x0, y0, dx2, dy2, ink, name) {
        var x1 = x0 + dx2, y1 = y0 + dy2;
        K.arrow(c, x0, y0, x1, y1, ink, lw);
        K.drawMathLabel(c, [{ symbol: name }], K.clamp(x1 + 3, b.x1 + 3, b.x2 - fs),
          K.clamp(y1 - .75 * fs, fieldTop, fieldBottom - fs), { c: ink, s: fs * .82,
            essential: true, maxWidth: fs, maxHeight: fs });
      };
      vector(px + ox, py + oy, dx, dy, C.E, 'E');
      if (part) vector(px, py, part * dx, part * dy, C.F, 'F');
    }
    K.drawMathLabel(c, [{ symbol: 'φ' }, ' = ', ...K.formatQuantity(probe.phi, 'V', 2),
      '    |', { symbol: 'E' }, '| = ', ...K.formatQuantity(mag, 'V·m⁻¹', 2), '    源电荷量大小 1 nC'],
      b.x1 + 4, b.y1 + 3, { c: col, s: fs * .86, maxWidth: b.w - 8, maxHeight: fs });
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
      K.txt(c, topSign, x, y0 + fs * 0.75, {  essential: true,c: tc, s: fs * 1.1, b: true, ui: true });
      K.txt(c, botSign, x, y1 - fs * 0.75, {  essential: true,c: bc, s: fs * 1.1, b: true, ui: true });
    }
    var my = (y0 + y1) / 2, pcx = x0 + (x1 - x0) * 0.55, r = Math.max(6, fs * 0.6), vc = e ? -1 : 1;
    K.circ(c, pcx, my, r, e ? C.neg : C.pos, 1.3, K.alpha(e ? C.neg : C.pos, 0.85));
    K.txt(c, e ? '−' : '+', pcx, my, {  essential: true,c: '#fff', s: r * 1.4, b: true, ui: true });
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
K.P('qU1', { label: '输入电压有效值 U₁', min: 1, max: 380, step: 1, def: 220, unit: 'V' });
K.drawTransformerCore = function (c, b, col, lw, n1, n2) {
  var cx = b.x1 + b.w / 2, cy = b.y1 + b.h * 0.46, cw = b.w * 0.34, ch = b.h * 0.62, th = Math.min(cw, ch) * 0.2;
  c.save(); c.fillStyle = K.alpha(col, 0.22); c.strokeStyle = col; c.lineWidth = lw;
  c.beginPath(); c.rect(cx - cw / 2, cy - ch / 2, cw, ch); c.rect(cx - cw / 2 + th, cy - ch / 2 + th, cw - 2 * th, ch - 2 * th); c.fill('evenodd'); c.stroke(); c.restore();
  var coil = function (xc, n, side) {
    var k = Math.round(K.clamp(n / 90, 3, 16)), y0 = cy - ch * 0.32, y1 = cy + ch * 0.32, w2 = th * 0.8;
    var outer = xc + side * w2, inner = xc - side * w2, dy = (y1 - y0) / k;
    for (var i = 0; i < k; i++) {
      var y = y0 + i * dy;
      K.line(c, outer, y, inner, y + dy * .45, C.I, 1.6);
      K.line(c, inner, y + dy * .45, outer, y + dy, K.alpha(C.I, .36), 1);
    }
    var xt = xc + side * (th * 0.8 + b.w * 0.1);
    K.line(c, outer, y0, xt, y0, C.I, 1.4); K.line(c, outer, y1, xt, y1, C.I, 1.4);
    return { x: xt, top: y0, bottom: y1, center: xc, labelY: cy + ch / 2 };
  };
  return [coil(cx - cw / 2 + th / 2, n1, -1), coil(cx + cw / 2 - th / 2, n2, 1)];
};
K.reg({
  key: 'pm_transformer', cat: 'em', label: '理想变压器', params: ['qN1t', 'qN2t', 'qU1'],
  icon: '<rect x="6" y="4" width="12" height="16" rx="1"/><rect x="9" y="7" width="6" height="10"/><path d="M4 8h3M4 10h3M4 12h3M4 14h3M17 9h3M17 11h3M17 13h3"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 100 || b.h < 70) return;
    var n1 = K.v(o, 'qN1t'), n2 = K.v(o, 'qN2t'), U1 = K.v(o, 'qU1'), col = o.color, lw = K.lw(o), fs = K.fs(K.S(b), 0.055);
    if (![n1, n2, U1].every(Number.isFinite) || n1 <= 0 || n2 <= 0 || U1 < 0) {
      K.drawMathLabel(c, ['变压器参数无效'], b.x1 + 3, b.y1 + fs,
        { c: C.F, s: fs, maxWidth: b.w - 6, maxHeight: fs, essential: true });
      return;
    }
    var U2 = U1 * n2 / n1;
    var leads = K.drawTransformerCore(c, b, col, lw, n1, n2);
    leads.forEach(function (lead, i) {
      var side = 2 * i - 1;
      K.dot(c, lead.x, lead.top, 3, col); K.dot(c, lead.x, lead.bottom, 3, col);
      K.txt(c, i ? 'n₂ = ' + n2 : 'n₁ = ' + n1, lead.center, lead.labelY + fs * 0.9, { c: col, s: fs * 0.85, i: true });
      var U = i ? 'U₂=' + (U2 < 10 ? U2.toFixed(2) : U2.toFixed(1)) + 'V' : 'U₁=' + U1 + 'V';
      K.txt(c, U, lead.x + side * fs * 0.4, (lead.top + lead.bottom) / 2,
        { c: col, s: fs, i: true, al: side < 0 ? 'right' : 'left' });
    });
    K.txt(c, (n2 > n1 ? '升压' : n2 < n1 ? '降压' : '等压') + '变压器：U₁/U₂ = n₁/n₂，I₁/I₂ = n₂/n₁，P₁ = P₂', b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.8, al: 'left', ui: true });
  }
});
})();

/* ===== 上游 pm_magnetic_path.js ===== */
/* 圆周运动与边界求交。x 向右，y 向下，正 B 指向纸内。 */
(function () {
'use strict';
var K = window.__PM, TAU = 2 * Math.PI;

// 以弧长寻址。弦位移在大半径下避免直接相减两个圆心坐标。
K.magneticArc = function (x, y, ux, uy, radius, turn) {
  return {
    cx: x - turn * radius * uy, cy: y + turn * radius * ux,
    at: function (distance) {
      var a = turn * distance / radius, co = Math.cos(a), si = Math.sin(a);
      var along = radius * turn * si, across = radius * turn * 2 * Math.sin(a / 2) ** 2;
      return { x: x + ux * along - uy * across, y: y + uy * along + ux * across,
        ux: ux * co - uy * si, uy: uy * co + ux * si };
    },
    distanceTo: function (px, py) {
      var dx = px - x, dy = py - y;
      var sin = turn * (dx * ux + dy * uy) / radius;
      var cos = 1 - turn * (-dx * uy + dy * ux) / radius;
      var angle = Math.atan2(sin, cos) * turn;
      return (angle < 0 ? angle + TAU : angle) * radius;
    }
  };
};

K.magneticPath = function (x, y, vx, vy, radius, turn, region) {
  if (!turn || !Number.isFinite(radius)) {
    return { angle: 0, arcLength: 0, at: function (distance) {
      return { x: x + vx * distance, y: y + vy * distance, ux: vx, uy: vy, inField: false };
    } };
  }
  var arc = K.magneticArc(x, y, vx, vy, radius, turn);
  var cx = arc.cx, cy = arc.cy;
  var start = Math.atan2(y - cy, x - cx), candidates = [];
  var epsilon = 1e-9;
  function add(angle) {
    var travel = K.mod(turn * (angle - start), TAU);
    if (travel < epsilon || travel > TAU - epsilon) return;
    candidates.push(travel);
  }
  function vertical(boundary) {
    var cosine = (boundary - cx) / radius;
    if (Math.abs(cosine) > 1) return;
    var phi = Math.acos(cosine);
    add(phi); add(-phi);
  }
  if (region.type === 'circle') {
    var dx = region.cx - cx, dy = region.cy - cy, d = Math.hypot(dx, dy);
    if (d > epsilon) {
      var cosine = (d * d + radius * radius - region.radius * region.radius) / (2 * d * radius);
      if (Math.abs(cosine) <= 1) {
        var toward = Math.atan2(dy, dx), offset = Math.acos(cosine);
        add(toward + offset); add(toward - offset);
      }
    }
  } else {
    vertical(region.left);
    if (Number.isFinite(region.right)) vertical(region.right);
  }
  function point(angle) {
    return arc.at(angle * radius);
  }
  function inside(p) {
    if (region.type === 'circle') return Math.hypot(p.x - region.cx, p.y - region.cy) <= region.radius + epsilon;
    return p.x >= region.left - epsilon && p.x <= region.right + epsilon;
  }
  candidates.sort(function (a, b) { return a - b; });
  var angle = TAU;
  for (var i = 0; i < candidates.length; i++) {
    var next = candidates[i + 1] || TAU;
    if (next - candidates[i] > epsilon && !inside(point((candidates[i] + next) / 2))) {
      angle = candidates[i];
      break;
    }
  }
  var arcLength = angle * radius, exit = point(angle);
  return {
    cx: cx, cy: cy, angle: angle, arcLength: arcLength,
    at: function (distance) {
      if (distance < 0) return { x: x + vx * distance, y: y + vy * distance, ux: vx, uy: vy, inField: false };
      if (distance < arcLength || angle === TAU) {
        var p = point(distance / radius);
        p.inField = true;
        return p;
      }
      var remainder = distance - arcLength;
      return { x: exit.x + exit.ux * remainder, y: exit.y + exit.uy * remainder,
        ux: exit.ux, uy: exit.uy, inField: false };
    }
  };
};
})();

/* ===== 上游 pm_em2.js ===== */
/* ===================== 扩展 · 电磁（动画模型） ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI, TAU = PI * 2, D2R = PI / 180;
/* 屏幕坐标系（x 右、y 下、z 垂直纸面向里）：F = q v × B，B = (0,0,Bz) → F ∝ q·Bz·(vy, −vx) */
K.lorentzDir = function (q, Bz, vx, vy) { var fx = q * Bz * vy, fy = -q * Bz * vx, L = Math.hypot(fx, fy) || 1; return [fx / L, fy / L]; };

/* ---------- 带电粒子在有界磁场中的运动（动画） ---------- */
K.sel('qRegion', '磁场边界', ['条形边界', '圆形磁场', '单直线边界'], 0);
K.P('qEntry', { label: '入射方向（与法线夹角）', min: -75, max: 75, step: 1, def: 0, unit: '°' });
K.P('qRad', { label: '轨道半径/磁场尺寸', min: 0.2, max: 3, step: 0.05, def: 0.8 });
K.sel('qBoundB', '磁场开关', ['有磁场', '零磁场'], 0);
K.reg({
  key: 'pm_bound_field', cat: 'em', label: '有界磁场中的偏转', animatable: true, params: ['qRegion', 'qEntry', 'qRad', 'qQ', 'qBdir', 'qBoundB'],
  icon: '<rect x="9" y="2" width="8" height="20" opacity=".5"/><path d="M11 6l2 2M13 6l-2 2M14 15l2 2M16 15l-2 2"/><path d="M1 14h8a8 8 0 0 1 7-8l6-3"/>',
  draw: function (c, o, GH) {
    var frame = GH.box(o); if (frame.w < 100 || frame.h < 70) return;
    var heading = frame.h * 0.29;
    var b = Object.assign({}, frame, { y1: frame.y1 + heading, h: frame.h - heading });
    var reg = K.v(o, 'qRegion'), th = K.v(o, 'qEntry') * D2R, kR = K.v(o, 'qRad'), q = K.v(o, 'qQ') === 0 ? 1 : -1, Bz = K.v(o, 'qBdir') === 0 ? 1 : -1;
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05), cy = b.y1 + b.h * 0.52;
    var xa, xb, Cx, Rc, R, E;
    if (reg === 0) {
      xa = b.x1 + b.w * 0.38; xb = xa + Math.min(b.w * 0.26, b.h * 0.27);
      R = kR * (xb - xa);
      E = [xa, cy];
    }
    else if (reg === 1) { Rc = Math.min(b.h * 0.4, b.w * 0.28); Cx = b.x1 + b.w * 0.55; R = kR * Rc; E = [Cx - Rc, cy]; }
    else { xa = b.x1 + b.w * 0.42; R = kR * b.h * 0.25; E = [xa, cy]; }
    var enabled = K.v(o, 'qBoundB') === 0, turn = enabled ? -q * Bz : 0;
    var key = [reg, th, kR, turn, b.x1, b.y1, b.w, b.h].join(',');
    var fitted = K.memo(o, key, function () {
      var vx = Math.cos(th), vy = -Math.sin(th);
      var region = reg === 1 ? { type: 'circle', cx: Cx, cy: cy, radius: Rc }
        : { type: 'vertical', left: xa, right: reg === 0 ? xb : Infinity };
      var path = K.magneticPath(E[0], E[1], vx, vy, R, turn, region);
      if (!enabled || reg === 1) return { path: path, radius: R, right: xb };
      // 以入射点为基准等比缩放，保留轨道半径与场宽之比。
      var dx = 0, dy = 0;
      for (var i = 0; i <= 64; i++) {
        var p = path.at(path.arcLength * i / 64);
        dx = Math.max(dx, p.x - E[0]); dy = Math.max(dy, Math.abs(p.y - E[1]));
      }
      var scale = Math.min(1, (b.x2 - E[0] - 6) / (dx || 1), b.h * 0.43 / (dy || 1));
      var right = reg === 0 ? xa + (xb - xa) * scale : Infinity;
      return { path: K.magneticPath(E[0], E[1], vx, vy, R * scale, turn,
        { type: 'vertical', left: xa, right: right }), radius: R * scale, right: right };
    });
    var P = fitted.path;
    R = fitted.radius; xb = fitted.right;
    c.save(); c.beginPath(); c.rect(b.x1, b.y1, b.w, b.h); c.clip();
    var into = Bz > 0, step = Math.max(24, S / 9);
    if (enabled && reg === 0) { K.box(c, xa, b.y1, xb - xa, b.h, null, 0, K.alpha(C.B, 0.08)); K.bmarks(c, xa, b.y1, xb - xa, b.h, into, step, K.alpha(C.B, 0.7), 1.2);
      K.line(c, xa, b.y1, xa, b.y2, col, 1, [6, 4]); K.line(c, xb, b.y1, xb, b.y2, col, 1, [6, 4]); }
    else if (enabled && reg === 1) { c.save(); c.beginPath(); c.arc(Cx, cy, Rc, 0, TAU); c.clip(); K.box(c, Cx - Rc, cy - Rc, 2 * Rc, 2 * Rc, null, 0, K.alpha(C.B, 0.08));
      K.bmarks(c, Cx - Rc, cy - Rc, 2 * Rc, 2 * Rc, into, step, K.alpha(C.B, 0.7), 1.2); c.restore(); K.circ(c, Cx, cy, Rc, col, 1, null, [6, 4]); K.dot(c, Cx, cy, 2.5, col); }
    else if (enabled) { K.box(c, xa, b.y1, b.x2 - xa, b.h, null, 0, K.alpha(C.B, 0.08)); K.bmarks(c, xa, b.y1, b.x2 - xa, b.h, into, step, K.alpha(C.B, 0.7), 1.2); K.line(c, xa, b.y1, xa, b.y2, col, 1.4); }
    var vpx = S * 0.5, pre = Math.min((E[0] - b.x1 - 4) / Math.cos(th), b.w * 0.4);
    var end = P.arcLength + (P.angle < TAU ? S * 0.65 : 0);
    var s = Math.min(end, K.mod(K.t(o), (pre + end) / vpx + 0.6) * vpx - pre);
    var start = P.at(-pre), exit = P.at(P.arcLength), tail = P.at(end);
    K.line(c, start.x, start.y, E[0], E[1], K.alpha(col, 0.55), 1);
    if (P.angle < TAU) K.line(c, exit.x, exit.y, tail.x, tail.y, K.alpha(col, 0.55), 1);
    if (enabled) {
      var a0 = Math.atan2(E[1] - P.cy, E[0] - P.cx);
      c.beginPath(); c.arc(P.cx, P.cy, R, a0, a0 + turn * P.angle, turn < 0); c.strokeStyle = C.a; c.lineWidth = lw; c.stroke();
    }
    var p = P.at(s), r = Math.max(5, lw * 2);
    if (p.inField) {
      var f = K.lorentzDir(q, Bz, p.ux, p.uy), ox = P.cx, oy = P.cy;
      K.line(c, ox, oy, p.x, p.y, K.alpha(col, 0.55), 1, [4, 3]); K.line(c, ox, oy, E[0], E[1], K.alpha(col, 0.55), 1, [4, 3]);
      K.dot(c, ox, oy, 2.5, col); K.txt(c, "O'", ox + fs * 0.6, oy - fs * 0.6, { c: col, s: fs * 0.85, i: true });
      K.vec(c, p.x, p.y, f[0] * S * 0.12, f[1] * S * 0.12, C.F, lw, 'F', fs * 0.85);
    }
    K.vec(c, p.x, p.y, p.ux * S * 0.12, p.uy * S * 0.12, C.v, lw, 'v', fs * 0.85);
    K.circ(c, p.x, p.y, r, q > 0 ? C.pos : C.neg, 1, q > 0 ? C.pos : C.neg);
    K.txt(c, q > 0 ? '+' : '−', p.x, p.y, {  essential: true,c: '#fff', s: r * 1.5, b: true, ui: true });
    c.restore();
    var ang = P.angle / D2R;
    var denominator = ['|', { symbol: 'q' }, '|', { symbol: 'B' }];
    var info = enabled ? [[{ symbol: 'r' }, ' = ', { frac: [[{ symbol: 'mv' }], denominator] }, '    ',
      { symbol: 'T' }, ' = ', { frac: [['2π', { symbol: 'm' }], denominator] }],
      '比例示意 · 非相对论 · 速度垂直磁场',
      '场内转角 ' + K.formatQuantity(ang, '°', 1)]
      : [[{ symbol: 'B' }, ' = 0，匀速直线运动'], '比例示意'];
    K.drawMathBlock(c, info, frame.x1 + 4, frame.y1 + 2, {
      c: col, s: K.fs(K.S(frame), 0.044, 8, 20), maxWidth: frame.w - 8, maxHeight: heading - 4
    });
  }
});

/* ---------- 质谱仪（动画） ---------- */
K.P('qMr2', { label: '同位素质量比', min: 1.05, max: 1.6, step: 0.01, def: 1.2 });
K.massSpectrumIon = function (massRatio, radius, time, gap, drift) {
  var root = Math.sqrt(massRatio), r = radius * root, ta = time * root;
  var v = 2 * gap / ta, td = drift / v, tc = PI * r / v;
  return { r: r, ta: ta, v: v, td: td, T: ta + td + tc };
};
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
      K.txt(c, k ? '−' : '+', xs + b.w * 0.12, y, {  essential: true,c: k ? C.neg : C.pos, s: fs * 1.1, b: true, ui: true }); });
    K.txt(c, 'U', xs - b.w * 0.12, (yp1 + yp2) / 2, { c: col, s: fs, i: true });
    K.txt(c, 'S', xs - fs * 0.9, yp1 - fs * 0.5, { c: col, s: fs * 0.85, i: true });
    var iso = [1, mr].map(function (m, i) {
      var ion = K.massSpectrumIon(m, r1, 0.7, g, d);
      ion.cl = i ? C.g2 : C.a;
      return ion;
    });
    var tmax = iso[1].T;
    var separation = 2 * (iso[1].r - iso[0].r);
    var separateHits = separation >= Math.max(5, fs * 1.05);
    var t = K.mod(K.t(o), tmax + 1.2);
    iso.forEach(function (I, k) {
      c.save(); c.strokeStyle = K.alpha(I.cl, 0.3); c.lineWidth = 1; c.setLineDash([4, 4]); c.beginPath(); c.arc(xs + I.r, yf, I.r, PI, 0, true); c.stroke(); c.restore();
      var x, y, tt = Math.min(t, I.T), landed = t >= I.T;
      if (tt < I.ta) { x = xs; y = yp1 + 0.5 * (2 * g / (I.ta * I.ta)) * tt * tt; }
      else if (tt < I.ta + I.td) { x = xs; y = yp2 + I.v * (tt - I.ta); }
      else { var ph = I.v * (tt - I.ta - I.td) / I.r; x = xs + I.r - I.r * Math.cos(ph); y = yf + I.r * Math.sin(ph);
        c.save(); c.strokeStyle = I.cl; c.lineWidth = lw; c.beginPath(); c.arc(xs + I.r, yf, I.r, PI, PI - ph, true); c.stroke(); c.restore(); }
      K.dot(c, x, y, Math.max(3.5, lw * 1.4), I.cl);
      if (landed && separateHits) {
        K.dot(c, xs + 2 * I.r, yf, Math.min(5, separation * 0.35), I.cl);
        K.lab(c, 'x_' + (k + 1), xs + 2 * I.r, yf - fs * 0.8, { c: I.cl, s: fs * 0.85 });
      }
    });
    if (!separateHits && t >= tmax) K.txt(c, '落点间距小于显示分辨率', b.x2 - 3, b.y2 - 3,
      { c: col, s: fs * 0.8, al: 'right', bl: 'bottom', maxWidth: b.w - 6 });
    K.lines(c, ['静止起步，同种正电荷，非相对论', 'qU = ½mv²，qvB = mv²/r', 'x = 2r ∝ √m · 比例示意'],
      b.x1 + b.w * 0.38, b.y1 + 3, col, Math.min(fs * 0.8, b.h * 0.069), 'left', b.w * 0.6);
  }
});

/* ---------- 回旋加速器（动画） ---------- */
K.cyclotronArc = function (index, phase, entryY, firstRadius) {
  var radius = firstRadius * Math.sqrt(index + 1), sign = index % 2 ? -1 : 1;
  var angle = PI * (0.5 - phase);
  return { x: sign * radius * Math.cos(angle), y: entryY + sign * radius * (Math.sin(angle) - 1), sign: sign };
};
K.reg({
  key: 'pm_cyclotron', cat: 'em', label: '回旋加速器', animatable: true,
  icon: '<path d="M11 3a9 9 0 0 0 0 18z"/><path d="M13 3a9 9 0 0 1 0 18z"/><path d="M12 12a2 2 0 0 1 2-2 3 3 0 0 1-4 3.5 4.5 4.5 0 0 1 7-4"/>',
  draw: function (c, o, GH) {
    var frame = GH.box(o); if (frame.w < 90 || frame.h < 90) return;
    var header = frame.h * 0.23;
    var b = Object.assign({}, frame, { y1: frame.y1 + header, h: frame.h - header });
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var cx = b.x1 + b.w * 0.45, cy = b.y1 + b.h / 2, RD = Math.min(b.w * 0.36, b.h * 0.43), gp = RD * 0.07;
    [-1, 1].forEach(function (sd) {
      c.save(); c.beginPath(); c.arc(cx + sd * gp / 2, cy, RD, sd < 0 ? PI / 2 : -PI / 2, sd < 0 ? PI * 1.5 : PI / 2); c.closePath();
      c.fillStyle = K.alpha(col, 0.07); c.fill(); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); c.clip();
      K.bmarks(c, cx - RD, cy - RD, RD * 2, RD * 2, true, Math.max(24, RD / 3.5), K.alpha(C.B, 0.45), 1); c.restore();
    });
    K.txt(c, 'D₁', cx - RD * 0.75, cy + RD * 0.8, { c: col, s: fs, i: true }); K.txt(c, 'D₂', cx + RD * 0.75, cy + RD * 0.8, { c: col, s: fs, i: true });
    var N = 9, r0 = RD * 0.88 / Math.sqrt(N), Th = 0.45, entries = [cy + RD * 0.17];
    for (var n = 0; n < N - 1; n++) entries.push(K.cyclotronArc(n, 1, entries[n], r0).y);
    // 示意引出极在最后一圈的外缘，出射方向与轨迹相切。
    var extractAt = (N - 0.5) * Th, tTot = extractAt + 0.32, t = K.mod(K.t(o), tTot + 0.6);
    var outlet = K.cyclotronArc(N - 1, 0.5, entries[N - 1], r0);
    var pos = function (tt) {
      if (tt >= extractAt) return [cx + outlet.x, outlet.y - (tt - extractAt) * PI * outlet.x / Th, 0];
      var n = Math.min(N - 1, Math.floor(tt / Th));
      var p = K.cyclotronArc(n, (tt - n * Th) / Th, entries[n], r0);
      return [cx + p.x, p.y, p.sign];
    };
    var tc = Math.min(t, tTot), pts = [];
    for (var tt = 0; tt <= tc; tt += Th / 24) { var q = pos(tt); pts.push([q[0], q[1]]); }
    var P = pos(tc); pts.push([P[0], P[1]]);
    c.save(); c.beginPath(); c.rect(b.x1, b.y1, b.w, b.h); c.clip();
    K.poly(c, pts, C.a, lw * 0.9);
    K.circ(c, P[0], P[1], Math.max(4, lw * 1.8), C.pos, 1, C.pos);
    c.restore();
    var fieldLength = Math.max(gp * 0.4, 4);
    if (P[2]) K.arrow(c, cx - P[2] * fieldLength, cy - RD * 0.55, cx + P[2] * fieldLength, cy - RD * 0.55, C.E, 1.6, 6);
    if (P[2]) K.txt(c, 'E', cx, cy - RD * 0.55 - fs * 0.8, { c: C.E, s: fs * 0.85, i: true });
    var sx = b.x2 - b.w * 0.08;
    K.circ(c, sx, cy, fs * 0.9, col, 1.2); K.txt(c, '~', sx, cy, {  essential: true,c: col, s: fs * 1.2, ui: true });
    K.line(c, sx, cy - fs * 0.9, sx, cy - RD * 1.02, col, 1); K.line(c, sx, cy - RD * 1.02, cx, cy - RD * 1.02, col, 1);
    K.line(c, sx, cy + fs * 0.9, sx, cy + RD * 1.02, col, 1); K.line(c, sx, cy + RD * 1.02, cx, cy + RD * 1.02, col, 1);
    K.drawMathBlock(c, [
      [{ symbol: 'T', sub: '电' }, ' = ', { symbol: 'T', sub: '磁' }, ' = ',
        { frac: [['2π', { symbol: 'm' }], ['|', { symbol: 'q' }, '|', { symbol: 'B' }]] }, '    ',
        { symbol: 'E', sub: 'k,max' }, ' = ', { frac: [[{ symbol: 'q', sup: 2 }, { symbol: 'B', sup: 2 },
          { symbol: 'R', sup: 2 }], ['2', { symbol: 'm' }]] }],
      '正离子 · 非相对论 · 窄缝示意'
    ], frame.x1 + 4, frame.y1 + 2, { c: col, s: fs * 0.9, maxWidth: frame.w - 8, maxHeight: header - 4 });
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
    K.txt(c, U >= 0 ? '+' : '−', xL - fs * 0.7, cy - d / 2 - 2, {  essential: true,c: col, s: fs * 1.1, b: true, ui: true });
    K.txt(c, U >= 0 ? '−' : '+', xL - fs * 0.7, cy + d / 2 + 3, {  essential: true,c: col, s: fs * 1.1, b: true, ui: true });
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
// 右为正，逆时针绕行及纸面向外的法向为正。忽略摩擦、自感。
K.railState = function (mass, resistance, fieldInto, length, initialSpeed, force, t) {
  var coupling = fieldInto * length;
  var damping = coupling * coupling / resistance, rate = damping / mass;
  var response = rate === 0 ? t : -Math.expm1(-rate * t) / rate;
  var speed = initialSpeed * Math.exp(-rate * t) + force / mass * response;
  var travelResponse = Math.abs(rate * t) < 1e-4
    ? t * t * (0.5 - rate * t / 6 + (rate * t) * (rate * t) / 24)
    : (t - response) / rate;
  var emf = coupling * speed, current = emf / resistance, magneticForce = -coupling * current;
  return {
    travel: initialSpeed * response + force / mass * travelResponse,
    speed: speed, emf: emf, current: current, magneticForce: magneticForce,
    joulePower: emf * current, kineticPower: (force + magneticForce) * speed
  };
};
K.reg({
  key: 'pm_rails', cat: 'em', label: '导体棒切割', animatable: true, params: ['qRailMode', 'qBdir'],
  icon: '<path d="M2 6h20M2 18h20"/><rect x="2.5" y="9" width="3" height="6"/><path d="M15 4v16"/><path d="M16 12h5M19.5 10.5L21 12l-1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 120 || b.h < 70) return;
    var md = K.v(o, 'qRailMode'), Bz = K.v(o, 'qBdir') === 0 ? 1 : -1, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var yt = b.y1 + b.h * 0.3, yb = b.y1 + b.h * 0.78, xl = b.x1 + b.w * 0.07, xr = b.x2 - b.w * 0.03, x0 = xl + b.w * 0.16, Lr = xr - x0 - 10;
    var tau = 1.1, vr = md === 0 ? Lr / 4 : md === 1 ? Lr * 0.85 / tau : Lr / 4.2;
    var T = md === 0 ? 4 : md === 1 ? 5 : 5.3;
    var stateAt = function (q) { return K.railState(tau, 1, Bz, 1, md === 2 ? 0 : vr, md === 1 ? 0 : vr, q); };
    var tc = Math.min(K.mod(K.t(o), T + 0.8), T), state = stateAt(tc), x = x0 + state.travel;
    K.box(c, xl + b.w * 0.05, yt - b.h * 0.08, xr - xl - b.w * 0.05, yb - yt + b.h * 0.16, null, 0, K.alpha(C.B, 0.07));
    K.bmarks(c, xl + b.w * 0.05, yt - b.h * 0.08, xr - xl - b.w * 0.05, yb - yt + b.h * 0.16, Bz > 0, Math.max(26, S / 7), K.alpha(C.B, 0.55), 1.1);
    K.line(c, xl, yt, xr, yt, col, lw * 1.2); K.line(c, xl, yb, xr, yb, col, lw * 1.2);
    K.line(c, xl, yt, xl, yb, col, lw);
    var rh = (yb - yt) * 0.36; K.box(c, xl - 6, (yt + yb) / 2 - rh / 2, 12, rh, col, lw, K.alpha(col, 0.2), 2);
    K.txt(c, 'R', xl - fs * 0.9, (yt + yb) / 2, { c: col, s: fs, i: true });
    K.line(c, x, yt - b.h * 0.07, x, yb + b.h * 0.07, C.a, lw * 2.2);
    var In = Math.abs(state.current / vr), up = state.current > 0, hs = 6 + 6 * Math.min(1, In);
    if (In > 0.03) {
      var dU = up ? -1 : 1;
      K.head(c, x + 0.01, (yt + yb) / 2 + dU * hs, 0, dU, hs, C.I);
      K.head(c, (xl + x) / 2 - dU * hs, yt, dU, 0, hs, C.I);
      K.head(c, xl, (yt + yb) / 2 + rh / 2 + hs + 4 - (up ? 0 : rh + 2 * hs + 8), 0, -dU, hs, C.I);
      K.head(c, (xl + x) / 2 + dU * hs, yb, -dU, 0, hs, C.I);
      K.txt(c, 'I', x + fs * 0.7, (yt + yb) / 2 - fs * 1.2, { c: C.I, s: fs, i: true });
      K.vec(c, x - 4, (yt + yb) / 2 + fs * 1.2, -S * 0.18 * In, 0, C.F, lw, 'F_安', fs * 0.85);
    }
    if (md !== 1) K.vec(c, x + 4, (yt + yb) / 2 + fs * 1.2, S * 0.18, 0, C.F, lw, 'F_外', fs * 0.85);
    if (state.speed > 0) K.vec(c, x, yt - b.h * 0.12, S * 0.16 * state.speed / vr, 0, C.v, lw, 'v', fs * 0.85);
    var gw = b.w * 0.26, gh = b.h * 0.24, A = K.mini(c, b.x2 - gw - 2, b.y1 + 2, gw, gh,
      { xmin: 0, xmax: T, ymin: 0, ymax: 1.15, xl: 't/s', yl: [{ symbol: 'v' }, '/', { symbol: 'v', sub: '参' }],
        col: col, fs: fs * 0.7, lw: 1, O: false });
    K.plot(c, A, function (q) { return stateAt(q).speed / vr; }, 0, T, C.v, 1.6); K.dot(c, A.X(tc), A.Y(state.speed / vr), 3, C.F);
    var info = [['|ℰ| = ', { symbol: 'BL' }, '|', { symbol: 'v' }, '|，', { symbol: 'I' }, ' = ℰ/(',
      { symbol: 'R' }, ' + ', { symbol: 'r' }, ')'],
      [{ symbol: 'P', sub: '外' }, ' = d', { symbol: 'E', sub: 'k' }, '/d', { symbol: 't' }, ' + ',
        { symbol: 'I', sup: 2 }, '(', { symbol: 'R' }, ' + ', { symbol: 'r' }, ')'],
      '逆时针为正 · 忽略摩擦与自感'];
    K.drawMathBlock(c, info, b.x1 + 4, b.y1 + 2, {
      c: col, s: fs * 0.82, maxWidth: b.w - gw - 9, maxHeight: b.h * 0.18
    });
  }
});

/* ---------- 线框穿过有界磁场（动画 + Φ-t、I-t 图） ---------- */
K.P('qFieldW', { label: '磁场宽度/线框边长', min: 0.5, max: 3, step: 0.1, def: 1.6 });
K.loopFieldState = function (front, side, left, right, fieldInto) {
  var rear = front - side;
  var overlap = Math.max(0, Math.min(front, right) - Math.max(rear, left));
  var frontInside = front >= left && front < right, rearInside = rear >= left && rear < right;
  return { flux: -fieldInto * overlap / side, current: fieldInto * (Number(frontInside) - Number(rearInside)) };
};
K.reg({
  key: 'pm_loop_field', cat: 'em', label: '线框穿过磁场', animatable: true, params: ['qFieldW', 'qBdir'],
  icon: '<rect x="10" y="2" width="8" height="10" opacity=".55"/><rect x="5" y="4" width="7" height="6"/><path d="M2 20h20M2 15v7"/><path d="M5 20v-3h6v3"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 140 || b.h < 110) return;
    var kd = K.v(o, 'qFieldW'), Bz = K.v(o, 'qBdir') === 0 ? 1 : -1, col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.045);
    var Lp = Math.min(b.h * 0.25, b.w * 0.12), yc = b.y1 + b.h * 0.2, xa = b.x1 + Lp * 1.45, d = Math.min(kd * Lp, b.x2 - 1.4 * Lp - xa), xb = xa + d;
    var xf0 = xa - 0.25 * Lp, Dist = xb + 1.25 * Lp - xf0, v = b.w * 0.16, T = Dist / v, t = K.mod(K.t(o), T + 0.8), tc = Math.min(t, T), xf = xf0 + v * tc;
    var stateAt = function (f) { return K.loopFieldState(f, Lp, xa, xb, Bz); };
    K.box(c, xa, yc - Lp * 0.85, d, Lp * 1.7, col, 1, K.alpha(C.B, 0.08));
    K.bmarks(c, xa, yc - Lp * 0.85, d, Lp * 1.7, Bz > 0, Math.max(20, Lp / 2.6), K.alpha(C.B, 0.6), 1);
    K.box(c, xf - Lp, yc - Lp / 2, Lp, Lp, C.a, lw * 1.2, K.alpha(C.a, 0.08));
    var I = stateAt(xf).current, hs = 7;
    if (I !== 0) {
      var s = I;
      K.head(c, xf - Lp / 2 - s * hs, yc - Lp / 2, -s, 0, hs, C.I); K.head(c, xf - Lp / 2 + s * hs, yc + Lp / 2, s, 0, hs, C.I);
      K.head(c, xf, yc - s * hs, 0, -s, hs, C.I); K.head(c, xf - Lp, yc + s * hs, 0, s, hs, C.I);
      K.txt(c, s > 0 ? '逆时针' : '顺时针', xf - Lp / 2, yc, { c: C.I, s: fs * 0.85, ui: true });
      K.vec(c, xf - Lp / 2, yc + Lp / 2 + fs * 1.1, -Lp * 0.6, 0, C.F, lw, 'F_安', fs * 0.8);
    }
    K.vec(c, xf + 4, yc - Lp / 2 - fs * 0.4, Lp * 0.5, 0, C.v, lw, 'v', fs * 0.8);
    var gy = yc + Lp * 0.85 + fs * 1.5, gh = (b.y2 - gy) / 2 - 4;
    var A1 = K.mini(c, b.x1 + 2, gy, b.w - 4, gh,
      { xmin: 0, xmax: T, ymin: -1.2, ymax: 1.2, xl: 't/s', yl: [{ symbol: 'Φ' }, '/(', { symbol: 'Bℓ', sup: 2 }, ')'],
        col: col, fs: fs * 0.85, lw: 1, O: false });
    K.plot(c, A1, function (q) { return stateAt(xf0 + v * q).flux; }, 0, T, C.B, 1.8, null, 400);
    var A2 = K.mini(c, b.x1 + 2, gy + gh + 6, b.w - 4, gh,
      { xmin: 0, xmax: T, ymin: -1.4, ymax: 1.4, xl: 't/s', yl: [{ symbol: 'I' }, '/(', { symbol: 'Bℓv' }, '/', { symbol: 'R' }, ')'],
        col: col, fs: fs * 0.85, lw: 1, O: false });
    K.plot(c, A2, function (q) { return stateAt(xf0 + v * q).current; }, 0, T, C.I, 1.8, null, 600);
    K.drawMathLabel(c, ['ℰ = −dΦ/d', { symbol: 't' }, ' · 逆时针为正'],
      A2.X1, A2.Y0, { c: col, s: fs * 0.75, al: 'right', maxWidth: (A2.X1 - A2.X0) * 0.6 });
    [A1, A2].forEach(function (A) { K.line(c, A.X(tc), A.Y0, A.X(tc), A.Y1, K.alpha(C.F, 0.8), 1.2); });
  }
});

/* ---------- 交流发电机（动画 + e-t、Φ-t 图） ---------- */
K.rotatingFlux = function (linkagePeak, omega, angle) {
  const exactZero = x => Math.abs(x) < 1e-13 ? 0 : x;
  const flux = linkagePeak * exactZero(Math.cos(angle));
  const emf = linkagePeak * omega * exactZero(Math.sin(angle));
  return { flux, emf, fluxRate: -emf };
};
K.drawGeneratorCoil = function (c, b, col, lw, fs, al, field, current, normal) {
  var cy = b.y1 + b.h * 0.5, mh = b.h * 0.56, nx1 = b.x1 + b.w * 0.04, mw = b.w * 0.12, sx1 = b.x1 + b.w * 0.88;
  K.box(c, nx1, cy - mh / 2, mw, mh, col, 1, field < 0 ? C.s : C.n, 3); K.txt(c, field < 0 ? 'S' : 'N', nx1 + mw / 2, cy, {  essential: true,c: '#fff', s: fs * 1.2, b: true, ui: true });
  K.box(c, sx1, cy - mh / 2, mw, mh, col, 1, field < 0 ? C.n : C.s, 3); K.txt(c, field < 0 ? 'N' : 'S', sx1 + mw / 2, cy, {  essential: true,c: '#fff', s: fs * 1.2, b: true, ui: true });
  if (field) for (var k = 0; k < 5; k++) { var y = cy - mh * 0.4 + mh * 0.8 * k / 4; K.arrow(c, field > 0 ? nx1 + mw + 4 : sx1 - 4, y, field > 0 ? sx1 - 4 : nx1 + mw + 4, y, K.alpha(C.B, 0.48), 1, 7, [6, 5]); }
  var cx = (nx1 + mw + sx1) / 2, a = (sx1 - nx1 - mw) * 0.36, hh = mh * 0.36;
  var P = function (sd, top) { var x = sd * -a * Math.sin(al), z = sd * a * Math.cos(al); return [cx + x + 0.35 * z, (top ? cy - hh : cy + hh) - 0.22 * z, z]; };
  var A1 = P(1, true), B1 = P(1, false), A2 = P(-1, true), B2 = P(-1, false);
  K.line(c, cx, cy - hh - b.h * 0.12, cx, cy + hh + b.h * 0.14, K.alpha(col, 0.5), 1, [4, 4]);
  K.poly(c, [A1, B1, B2, A2], null, 0, null, true, K.alpha(C.a, 0.08 + 0.12 * Math.abs(Math.sin(al))));
  var sideCol = function (z) { return z >= 0 ? C.a : K.alpha(C.a, 0.5); };
  K.line(c, A1[0], A1[1], B1[0], B1[1], sideCol(A1[2]), lw * 1.5); K.line(c, A2[0], A2[1], B2[0], B2[1], sideCol(A2[2]), lw * 1.5);
  K.line(c, A1[0], A1[1], A2[0], A2[1], C.a, lw); K.line(c, B1[0], B1[1], B2[0], B2[1], C.a, lw);
  K.txt(c, 'a', A1[0] + fs * 0.6, A1[1] - fs * 0.3, { c: col, s: fs * 0.8, i: true }); K.txt(c, 'd', A2[0] - fs * 0.6, A2[1] - fs * 0.3, { c: col, s: fs * 0.8, i: true });
  var up1 = current < 0;
  if (current !== 0) {
    var hs = Math.min(10, b.w * .05, b.h * .08);
    K.head(c, (A1[0] + B1[0]) / 2, (A1[1] + B1[1]) / 2 + (up1 ? -hs : hs) * 0.5, 0, up1 ? -1 : 1, hs, C.I);
    K.head(c, (A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2 + (up1 ? hs : -hs) * 0.5, 0, up1 ? 1 : -1, hs, C.I);
  }
  if (normal) {
    var nx = a * (Math.cos(al) + 0.35 * Math.sin(al)), ny = -a * 0.22 * Math.sin(al);
    K.arrow(c, cx, cy, cx + nx, cy + ny, C.v, 1.3, Math.min(8, b.w * .05), [4, 3]);
    K.drawMathLabel(c, [{ symbol: 'n', vector: true }], cx + nx, cy + ny - fs * 1.3,
      { c: C.v, s: fs * .8, al: 'center', maxWidth: fs * 1.5, maxHeight: fs, essential: true });
  } else if (Math.abs(Math.sin(al)) < 0.1) {
    K.txt(c, '中性面', cx, cy - hh - b.h * 0.16, { c: C.F, s: fs * 0.9, ui: true });
  }
};
K.reg({
  key: 'pm_generator', cat: 'em', label: '交流发电机', animatable: true,
  icon: '<rect x="1" y="6" width="4" height="12"/><rect x="11" y="6" width="4" height="12"/><path d="M6.5 8l3 0 0 8-3 0z"/><path d="M8 4v16" stroke-dasharray="1.5 1.5"/><path d="M16 12q1.5-6 3 0t3 0"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 160 || b.h < 80) return;
    var col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.055), Tp = 4, t = K.t(o), al = TAU * t / Tp;
    var e = K.rotatingFlux(1, 1, al).emf;
    K.drawGeneratorCoil(c, { ...b, w: b.w * 0.5 }, col, lw, fs, al, 1, Math.abs(e) > 0.08 ? e : 0, false);
    var gx = b.x1 + b.w * 0.54, A = K.axes(c, gx, b.y1 + b.h * 0.30, b.w * 0.45, b.h * 0.66,
      { xmin: 0, xmax: 2 * Tp, ymin: -1.25, ymax: 1.25, xl: 't/s', yl: '归一化', col: col, fs: fs * 0.75, lw: 1.2 });
    K.plot(c, A, function (q) { return K.rotatingFlux(1, 1, TAU * q / Tp).flux; }, 0, 2 * Tp, K.alpha(C.B, 0.8), 1.3);
    K.plot(c, A, function (q) { return K.rotatingFlux(1, 1, TAU * q / Tp).emf; }, 0, 2 * Tp, C.a, lw);
    var tt = K.mod(t, 2 * Tp); K.line(c, A.X(tt), A.Y0, A.X(tt), A.Y1, K.alpha(C.F, 0.7), 1); K.dot(c, A.X(tt), A.Y(e), 3.5, C.F);
    var legend = { s: fs * 0.72, maxWidth: b.w * 0.42, maxHeight: b.h * 0.085 };
    K.drawMathLabel(c, [{ symbol: 'ℰ' }, '/', { symbol: 'ℰ', sub: 'm' }],
      gx, b.y1 + 2, Object.assign({ c: C.a, essential: true }, legend));
    K.drawMathLabel(c, [{ symbol: 'Φ' }, '/', { symbol: 'Φ', sub: 'm' }, '（单匝）'],
      gx, b.y1 + 2 + b.h * 0.09, Object.assign({ c: C.B, essential: true }, legend));
    K.drawMathLabel(c, [{ symbol: 'ℰ', sub: 'm' }, ' = ', { symbol: 'nBSω' }],
      gx, b.y1 + 2 + b.h * 0.18, Object.assign({ c: col }, legend));
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
    K.txt(c, sm > 0 ? 'S' : 'N', p - Lm * 0.75, cy, {  essential: true,c: '#fff', s: fs, b: true, ui: true }); K.txt(c, sm > 0 ? 'N' : 'S', p - Lm * 0.25, cy, {  essential: true,c: '#fff', s: fs, b: true, ui: true });
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
    if (Math.abs(In) > 0.06) K.txt(c, In > 0 ? 'N' : 'S', xc0 - fs * 0.9, cy - rc - fs * 0.3, {  essential: true,c: In > 0 ? C.n : C.s, s: fs * 1.1, b: true, ui: true });
    var grow = Math.abs(phi(t + 0.01)) > Math.abs(phi(t));
    var st = Math.abs(In) < 0.06 ? '磁通量几乎不变：感应电流很小' : (grow ? '靠近：Φ增大，感应电流的磁场与原磁场反向（来拒）' : '远离：Φ减小，感应电流的磁场与原磁场同向（去留）');
    K.txt(c, st + ' · 定性示意', b.x1 + 4, b.y1 + fs * 0.7,
      { c: col, s: fs * 0.8, al: 'left', ui: true, maxWidth: b.w - 8 });
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
      K.txt(c, q > 0 ? '+' : '−', xx, cyy - gp / 2 - fs * 0.55, {  essential: true,c: q > 0 ? C.pos : C.neg, s: fs * 0.8, b: true, ui: true });
      K.txt(c, q > 0 ? '−' : '+', xx, cyy + gp / 2 + fs * 0.55, {  essential: true,c: q > 0 ? C.neg : C.pos, s: fs * 0.8, b: true, ui: true }); }
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
    K.txt(c, '电场能', bx + bw / 2, by + fs * 1.3, { essential: true, c: col, s: fs * 0.7, maxWidth: bw });
    K.txt(c, '磁场能', bx + bw * 2, by + fs * 1.3, { essential: true, c: col, s: fs * 0.7, maxWidth: bw });
    var A = K.axes(c, b.x1 + b.w * 0.54, b.y1 + b.h * 0.22, b.w * 0.45, b.h * 0.66,
      { xmin: 0, xmax: 2 * Tp, ymin: -1.25, ymax: 1.25, xl: 't/s', yl: '归一化', col: col, fs: fs * 0.85, lw: 1.2 });
    K.plot(c, A, function (x) { return Math.cos(TAU * x / Tp); }, 0, 2 * Tp, C.E, lw);
    K.plot(c, A, function (x) { return -Math.sin(TAU * x / Tp); }, 0, 2 * Tp, C.I, 1.4);
    var tt = K.mod(t, 2 * Tp); K.line(c, A.X(tt), A.Y0, A.X(tt), A.Y1, K.alpha(C.F, 0.7), 1);
    var legend = { s: fs * 0.72, maxWidth: b.w * 0.21, maxHeight: b.h * 0.1 };
    K.drawMathLabel(c, [{ symbol: 'q' }, '/', { symbol: 'q', sub: 'm' }],
      b.x1 + b.w * 0.55, b.y1 + 2, Object.assign({ c: C.E, essential: true }, legend));
    K.drawMathLabel(c, [{ symbol: 'i' }, '/', { symbol: 'i', sub: 'm' }],
      b.x1 + b.w * 0.78, b.y1 + 2, Object.assign({ c: C.I, essential: true }, legend));
    K.drawMathLabel(c, [{ symbol: 'T' }, ' = 2π√(', { symbol: 'LC' }, ')'],
      b.x1 + b.w * 0.55, b.y1 + 3 + b.h * 0.1, Object.assign({ c: col }, legend));
  }
});
})();

/* ===== 上游 pm_modern.js ===== */
/* ===================== 扩展 · 原子与原子核 ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI, TAU = PI * 2;
var H = 6.62607015e-34, E_CHARGE = 1.602176634e-19, LIGHT_SPEED = 299792458;

/* ---------- 光电效应（动画） ---------- */
K.P('qNu', { label: '入射光频率 / (10¹⁴ Hz)', min: 3, max: 15, step: 0.1, def: 8 });
K.sel('qMetal', '阴极金属', ['钠 W₀ = 2.29 eV', '钾 W₀ = 2.25 eV', '钙 W₀ = 3.20 eV', '钨 W₀ = 4.54 eV'], 0);
K.P('qUak', { label: '电压U_AK', min: -4, max: 4, step: 0.1, def: 1, unit: 'V' });
var W0s = [2.29, 2.25, 3.2, 4.54];
K.photoelectricExcess = function (frequency, workFunction) { return (H * frequency - E_CHARGE * workFunction) / E_CHARGE; };
K.photoelectricThreshold = function (workFunction) { return E_CHARGE * workFunction / H; };
K.photoelectricState = function (frequency, workFunction, voltage) {
  return K.photoelectricLab({ frequency, workFunction, voltage, flux: 1 });
};
// SI internally. An effective, uniform distribution of stopping potentials is
// used for the retarding branch; the accelerating branch models collection geometry.
K.photoelectricLab = function ({ frequency, workFunction, voltage, power, flux, efficiency = .12 }) {
  const bound = (v, min, max, fallback) => Number.isFinite(v) ? K.clamp(v, min, max) : fallback;
  frequency = bound(frequency, 1e12, 1e17, 8e14);
  workFunction = bound(workFunction, 0, 20, 2.29);
  voltage = bound(voltage, -1000, 1000, 0);
  efficiency = bound(efficiency, 0, 1, .12);
  const energyJ = H * frequency, workJ = E_CHARGE * workFunction;
  const excess = energyJ - workJ;
  const threshold = Math.abs(excess) <= 8 * Number.EPSILON * Math.max(energyJ, workJ);
  const kineticJ = threshold ? 0 : Math.max(0, excess), kinetic = kineticJ / E_CHARGE;
  const photons = flux === undefined ? bound(power, 0, 1, 0) / energyJ : bound(flux, 0, 1e19, 0);
  const emissionRate = kineticJ > 0 ? photons * efficiency : 0;
  const saturation = E_CHARGE * emissionRate;
  const fraction = u => !Number.isFinite(u) || kinetic === 0 ? 0 : u < 0
    ? .45 * K.clamp((kinetic + u) / kinetic, 0, 1) : .45 + .55 * K.clamp(u, 0, 1);
  const currentAt = u => saturation * fraction(u);
  return { frequency, voltage, energy: energyJ / E_CHARGE, energyJ, workJ, threshold, kineticJ, kinetic,
    aboveThreshold: kineticJ > 0, canEmit: threshold || excess > 0, emissionRate, photons, saturation,
    cutoff: workJ / H, stoppingVoltage: kinetic, signedStop: kinetic > 0 ? -kinetic : null,
    currentFraction: fraction(voltage), current: currentAt(voltage), currentAt, wavelength: LIGHT_SPEED / frequency * 1e9 };
};
K.photoelectricConstants = Object.freeze({ H, E_CHARGE, LIGHT_SPEED });
K.photoelectricMaterials = Object.freeze(W0s);
K.reg({
  key: 'pm_photoelectric', cat: 'modern', label: '光电效应', animatable: true, params: ['qNu', 'qMetal', 'qUak'],
  icon: '<ellipse cx="12" cy="12" rx="8" ry="6"/><path d="M8 8.5v7"/><path d="M16 11v2"/><path d="M2 3l4 4M5 2l3 3"/><circle cx="11" cy="11" r=".8"/><circle cx="13" cy="13" r=".8"/>',
  draw: function (c, o, GH) {
    var frame = GH.box(o); if (frame.w < 140 || frame.h < 90) return;
    var header = frame.h * 0.30;
    var b = Object.assign({}, frame, { y1: frame.y1 + header, h: frame.h - header });
    var nu = K.v(o, 'qNu'), W = W0s[K.v(o, 'qMetal')], U = K.v(o, 'qUak'), col = o.color, lw = K.lw(o), S = K.S(b), fs = K.fs(S, 0.05);
    var state = K.photoelectricState(nu * 1e14, W, U);
    var Ek = state.kinetic, lam = state.wavelength, lc = K.wl(lam, 0.9);
    var cx = b.x1 + b.w * 0.42, cy = b.y1 + b.h * 0.42, rx = b.w * 0.3, ry = b.h * 0.3, xK = cx - rx * 0.55, xA = cx + rx * 0.55;
    c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.fillStyle = K.alpha(C.glass, 0.06); c.fill(); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); c.restore();
    c.save(); c.strokeStyle = col; c.lineWidth = lw * 2; c.beginPath(); c.arc(xK + ry * 0.9, cy, ry * 0.9, PI * 0.78, PI * 1.22); c.stroke(); c.restore();
    K.line(c, xA, cy - ry * 0.35, xA, cy + ry * 0.35, col, lw * 1.5);
    K.txt(c, 'K', xK - fs * 0.2, cy + ry * 0.55, { c: col, s: fs, i: true }); K.txt(c, 'A', xA + fs * 0.7, cy + ry * 0.4, { c: col, s: fs, i: true });
    for (var k = 0; k < 3; k++) { var yy = cy - ry * 0.25 + k * ry * 0.25; K.wavy(c, b.x1 + 4, yy - ry * 0.9 + k * 4, xK - 2, yy, lc, 1.5, 3, 9, true); }
    K.txt(c, (lam < 380 ? '紫外光  ' : lam > 780 ? '红外光  ' : '') + 'λ = ' + K.formatQuantity(lam, 'nm', 0), b.x1 + 4, b.y1 + fs * 0.7, { c: col, s: fs * 0.85, al: 'left' });
    var yb = b.y2 - b.h * 0.12, xb1 = cx - b.w * 0.08, xb2 = cx + b.w * 0.08;
    K.line(c, xK - ry * 0.2, cy, xK - ry * 0.2, yb, col, 1);
    K.line(c, xK - ry * 0.2, yb, xb1, yb, col, 1);
    var leftPlate = U < 0 ? 0.9 : 0.5, rightPlate = U > 0 ? 0.9 : 0.5;
    K.line(c, xb1, yb - fs * leftPlate, xb1, yb + fs * leftPlate, col, lw * 1.6);
    K.line(c, xb2, yb - fs * rightPlate, xb2, yb + fs * rightPlate, col, lw * 1.6);
    K.drawMathLabel(c, [{ symbol: 'U', sub: 'AK' }, ' = ' + K.formatQuantity(U, 'V', 1)],
      (xb1 + xb2) / 2, yb - fs * 1.85, { c: col, s: fs * 0.81, al: 'center', maxWidth: b.w * 0.36, maxHeight: fs * 0.9 });
    var mx = xA + rx * 0.55, mr = Math.min(b.h * 0.1, b.w * 0.05);
    var frac = state.currentFraction;
    K.circ(c, mx, cy, mr, col, lw, K.alpha(col, 0.08)); K.txt(c, 'μA', mx, cy + mr * 0.45, { c: col, s: mr * 0.5, ui: true });
    var na = -PI * 0.85 + PI * 0.7 * frac; K.line(c, mx, cy + mr * 0.2, mx + Math.cos(na) * mr * 0.85, cy + mr * 0.2 + Math.sin(na) * mr * 0.85, C.F, 1.5);
    K.line(c, xA, cy, mx - mr, cy, col, 1);
    K.line(c, mx, cy + mr, mx, yb, col, 1);
    K.line(c, xb2, yb, mx, yb, col, 1);
    if (Ek > 0) {
      var t = K.t(o), dT = 0.09, d = xA - xK - ry * 0.15;
      for (var n = Math.max(0, Math.floor((t - 3) / dT)); n * dT <= t; n++) {
        var r1 = K.rng(n * 7919 + 13), e0 = Ek * (0.12 + 0.88 * r1()), v = Math.sqrt(2 * e0), y0 = cy + (r1() - 0.5) * ry * 0.9;
        var tau = (t - n * dT) * 1.6, xx = v * tau + 0.5 * U * tau * tau;
        if (U >= -e0) {
          var arrival = 2 / (v + Math.sqrt(Math.max(0, 2 * (e0 + U))));
          if (tau >= arrival) continue;
        }
        if (xx < 0 || xx > 1 || tau > 6) continue;
        K.dot(c, xK + ry * 0.05 + xx * d, y0 + (cy - y0) * xx * 0.4, Math.max(2.2, lw * 0.9), C.neg);
      }
    }
    var info = Ek > 0 ? [[{ symbol: 'ν' }, ' = '].concat(K.scientificQuantity(nu * 1e14, 'Hz', 3)),
      [{ symbol: 'E', sub: 'k,max' }, ' = ', { symbol: 'hν' }, ' − ', { symbol: 'W', sub: '0' }, ' = ' + K.formatQuantity(Ek, 'eV', 2)],
      ['遏止电压 ', { symbol: 'U', sub: 'c' }, ' = ' + K.formatQuantity(state.stoppingVoltage, 'V', 2)]]
      : state.threshold ? [[{ symbol: 'hν' }, ' = ', { symbol: 'W', sub: '0' }], '阈值处最大初动能为 0 eV']
      : [[{ symbol: 'hν' }, ' < ', { symbol: 'W', sub: '0' }, ' = ' + K.formatQuantity(W, 'eV', 2)], '频率低于阈值，无光电子'];
    info.push('表针、电子轨迹为定性示意');
    K.drawMathBlock(c, info, frame.x1 + 4, frame.y1 + 2, {
      c: col, s: K.fs(K.S(frame), 0.043, 8, 20), maxWidth: frame.w - 8, maxHeight: header - 4
    });
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
K.decayFraction = function (time, halfLife) { return Math.pow(0.5, time / halfLife); };
K.P('qDecN', { label: '原子核边长数', min: 6, max: 24, step: 1, def: 14 });
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
      K.txt(c, '+', b.x1 + 18, top + fs, {  essential: true,c: C.pos, s: fs * 1.2, b: true, ui: true }); K.txt(c, '−', b.x2 - 18, top + fs, {  essential: true,c: C.neg, s: fs * 1.2, b: true, ui: true }); }
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
K.hydrogenTransition = function (initial, final) {
  var levels = 1 / (initial * initial) - 1 / (final * final);
  return { deltaEV: 13.6 * levels, wavelengthNM: levels === 0 ? 0 : 1e9 / (1.097e7 * Math.abs(levels)) };
};
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
    var transition = K.hydrogenTransition(ni, nf), lam = transition.wavelengthNM, pc = lam ? K.wl(lam, 1) : col;
    var tau = K.mod(K.t(o), 4), em = transition.deltaEV < 0, r, th;
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
    var lx = b.x1 + b.w * 0.70, lw2 = b.w * 0.12, yT = b.y1 + fs * 1.7, yB = b.y2 - fs;
    // 展开高能级以容纳全部标注，数值仍按氢原子能级给出。
    var Y = function (n) { return yB - (yB - yT) * (n - 1) / 5; };
    for (var m = 1; m <= 6; m++) { var yy = Y(m); K.line(c, lx, yy, lx + lw2, yy, K.alpha(col, m === ni || m === nf ? 0.95 : 0.45), m === ni || m === nf ? 1.6 : 1);
      K.txt(c, K.formatQuantity(-13.6 / (m * m), '', 2), lx + lw2 + 3, yy, { c: col, s: fs * 0.68, al: 'left', maxWidth: b.x2 - lx - lw2 - 5 }); }
    if (ni !== nf) K.arrow(c, lx + lw2 * 0.5, Y(ni), lx + lw2 * 0.5, Y(nf), pc, 2, 8);
    K.txt(c, 'E/eV', lx + lw2 + 3, yT - fs * 0.9, {  essential: true,c: col, s: fs * 0.7, al: 'left' });
    var ser = Math.min(ni, nf) === 1 ? '莱曼系' : Math.min(ni, nf) === 2 ? '巴耳末系' : '红外';
    var info = ni === nf ? ['初末态相同，无跃迁'] : [(em ? '发射' : '吸收') + '光子  ' +
      K.formatQuantity(Math.abs(transition.deltaEV), 'eV', 2), K.formatQuantity(lam, 'nm', 0) + '（' + ser + '）'];
    info.push('轨道与能级间距为示意');
    K.lines(c, info, b.x1 + 4, b.y1 + 3, col, fs * 0.75, 'left', b.w * 0.68 - 4);
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
    K.txt(c, '定性示意 · 有效中子增殖因子大于 1 时，链式反应增强', b.x1 + 4, b.y2 - fs * 0.6, { c: col, s: fs * 0.78, al: 'left', ui: true, maxWidth: b.w - 8 });
  }
});
})();

/* ===== 上游 pm_graph.js ===== */
/* ===================== 扩展 · 物理图像（一轮复习常用） ===================== */
(function () {
'use strict';
var K = window.__PM, C = K.C, PI = Math.PI;
var ax = function (c, b, o) { o.fs = o.fs || K.fs(K.S(b), 0.055); o.lw = 1.4; return K.axes(c, b.x1, b.y1, b.w, b.h, o); };
function markScale(c, b, text, col, fs) {
  K.txt(c, text, b.x1 + Math.min(fs * 3.2, b.w * 0.3), b.y2 - 2, {
    essential: true, c: col, s: fs * 0.72, al: 'left', bl: 'bottom', ui: true, maxWidth: b.w * 0.36
  });
}
var GI = '<path d="M4 3v17h17"/>';

/* ---------- 运动图像 ---------- */
K.sel('qMot', '图像', ['v-t 匀加速', 'v-t 匀减速', 'x-t 匀速（甲乙）', 'x-t 匀加速', 'v-t 追及相遇', 'v-t 竖直上抛'], 0);
K.tog('qArea', '标注面积/斜率', true);
K.motionExample = function (mode) {
  if (mode === 1) return { speed: function (t) { return Math.max(0, 1 - 0.3 * t); }, end: 4, stop: 1 / 0.3, scale: 1 };
  if (mode === 5) return { speed: function (t) { return 20 - 10 * t; }, end: 4, apex: 2, scale: 20 };
  return { speed: function (t) { return 0.3 + 0.18 * t; }, end: 4, scale: 1 };
};
K.reg({
  key: 'pm_g_motion', cat: 'graph', label: '运动图像', params: ['qMot', 'qArea'],
  icon: GI + '<path d="M4 15l15-9"/><path d="M4 15h11V9" stroke-dasharray="1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var m = K.v(o, 'qMot'), sh = K.v(o, 'qArea'), col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055), Ac = K.alpha(C.a, 0.2);
    if (m === 0 || m === 1 || m === 5) {
      var motion = K.motionExample(m), f = motion.speed, scale = motion.scale;
      var A = ax(c, b, { xmin: 0, xmax: 4.4, ymin: m === 5 ? -24 : 0, ymax: m === 5 ? 25 : 1.15, xl: 't/s', yl: 'v/(m·s⁻¹)', unitAxes: true, col: col });
      if (sh) {
        K.fillUnder(c, A, f, 0, motion.apex || motion.stop || motion.end, Ac);
        if (motion.apex) K.fillUnder(c, A, f, motion.apex, motion.end, K.alpha(C.B, 0.2));
      }
      K.plot(c, A, f, 0, motion.stop || motion.end, C.a, lw);
      if (motion.stop) K.plot(c, A, f, motion.stop, motion.end, C.a, lw);
      K.txt(c, 'v₀', A.ox - 4, A.Y(f(0)), { c: col, s: fs, al: 'right', i: true });
      if (m === 0) { K.guide(c, A, 3, f(3), K.alpha(col, 0.5), 1); K.txt(c, '3', A.X(3), A.oy + fs * 0.9, { c: col, s: fs }); K.txt(c, f(3).toFixed(2), A.ox - 4, A.Y(f(3)), { c: col, s: fs * 0.85, al: 'right' });
        if (sh) { K.txt(c, '面积 = 位移 x', A.X(1.5), A.Y(0.28), { c: C.a, s: fs * 0.85, ui: true }); K.txt(c, '斜率 = a', A.X(3.4), A.Y(f(3.4)) - fs, { c: col, s: fs * 0.85, ui: true }); } }
      if (m === 1 && sh) K.txt(c, 'Δx = v₀²/(2|a|)', A.X(1.1), A.Y(0.3), { c: C.a, s: fs * 0.85, i: true });
      if (m === 5) { K.txt(c, '上升 ＋', A.X(0.9), A.Y(scale * 0.22), { c: C.a, s: fs * 0.85, ui: true }); K.txt(c, '下降 −', A.X(3.1), A.Y(-scale * 0.22), { c: C.B, s: fs * 0.85, ui: true });
        K.txt(c, '向上为正 · 正负面积抵消', A.X1, A.Y0 + fs * 0.3, { c: col, s: fs * 0.8, al: 'right', ui: true }); }
    } else if (m === 2 || m === 3) {
      var B = ax(c, b, { xmin: 0, xmax: 4.4, ymin: 0, ymax: 1.15, xl: 't/s', yl: 'x/m', unitAxes: true, col: col });
      if (m === 2) { K.plot(c, B, function (t) { return 0.25 * t; }, 0, 4.2, C.a, lw); K.plot(c, B, function (t) { return 0.4 + 0.12 * t; }, 0, 4.2, C.B, lw);
        K.txt(c, '甲', B.X(4), B.Y(1) - fs, { c: C.a, s: fs }); K.txt(c, '乙', B.X(4), B.Y(0.88) + fs, { c: C.B, s: fs });
        var tm = 0.4 / 0.13; K.guide(c, B, tm, 0.25 * tm, K.alpha(col, 0.5), 1); K.txt(c, '相遇', B.X(tm), B.Y(0.25 * tm) - fs, { c: col, s: fs * 0.85, ui: true });
        if (sh) K.txt(c, '斜率 = 速度', B.X(1.2), B.Y(0.75), { c: col, s: fs * 0.85, ui: true }); }
      else { var g = function (t) { return 0.055 * t * t; }; K.plot(c, B, g, 0, 4.4, C.a, lw);
        if (sh) { K.plot(c, B, function (t) { return g(3) + 0.33 * (t - 3); }, 1.6, 4.3, K.alpha(C.F, 0.9), 1.2, [5, 4]); K.dot(c, B.X(3), B.Y(g(3)), 3.5, C.F);
          K.txt(c, '切线斜率 = 瞬时速度', B.X(1.6), B.Y(0.5), { c: C.F, s: fs * 0.85, ui: true }); } }
    } else {
      var D = ax(c, b, { xmin: 0, xmax: 4.4, ymin: 0, ymax: 1.25, xl: 't/s', yl: 'v/(m·s⁻¹)', unitAxes: true, col: col }), v1 = 0.6, a = 0.3, tm2 = v1 / a;
      if (sh) { c.save(); c.beginPath(); c.moveTo(D.X(0), D.Y(v1)); c.lineTo(D.X(tm2), D.Y(v1)); c.lineTo(D.X(0), D.Y(0)); c.closePath(); c.fillStyle = Ac; c.fill(); c.restore(); }
      K.plot(c, D, function () { return v1; }, 0, 4.2, C.B, lw); K.plot(c, D, function (t) { return a * t; }, 0, 4.1, C.a, lw);
      K.guide(c, D, tm2, v1, K.alpha(col, 0.5), 1); K.txt(c, 't₀', D.X(tm2), D.oy + fs * 0.9, { c: col, s: fs, i: true });
      K.txt(c, '甲（匀速）', D.X(3.4), D.Y(v1) - fs, { c: C.B, s: fs * 0.85, ui: true }); K.txt(c, '乙（匀加速）', D.X(3.6), D.Y(a * 3.6) + fs * 0.2, { c: C.a, s: fs * 0.85, al: 'left', ui: true });
      K.txt(c, '同地同时出发：首次追上前，共速时相距最远',
        D.X1, D.Y0 + fs * 0.3, { c: col, s: fs * 0.8, al: 'right', ui: true, maxWidth: b.w - fs * 4 });
    }
  }
});

/* ---------- 气体图像 ---------- */
K.gasCycle = {
  pressure: function (v) { return 3 / v; },
  workBy: function () { return 3 * Math.log(3) - 2; }
};
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
    else if (m === 1) { var B = ax(c, b, { xmin: 0, xmax: 4, ymin: 0, ymax: 4, xl: ['1/', { symbol: 'V' }], yl: 'p', col: col });
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
      K.plot(c, E, K.gasCycle.pressure, 1, 3, c1, lw);
      K.line(c, E.X(3), E.Y(1), E.X(1), E.Y(1), c1, lw); K.line(c, E.X(1), E.Y(1), E.X(1), E.Y(3), c1, lw);
      var dX = E.sx, dY = 0.75 * E.sy, tangent = Math.hypot(dX, dY);
      K.head(c, E.X(2), E.Y(1.5), dX / tangent, dY / tangent, 9, c1);
      K.head(c, E.X(2), E.Y(1), -1, 0, 9, c1); K.head(c, E.X(1), E.Y(2), 0, -1, 9, c1);
      [[[1, 3], 'A'], [[3, 1], 'B'], [[1, 1], 'C']].forEach(function (q) { K.dot(c, E.X(q[0][0]), E.Y(q[0][1]), 3.5, C.F); K.txt(c, q[1], E.X(q[0][0]) + fs * 0.7, E.Y(q[0][1]) - fs * 0.6, { c: col, s: fs, i: true }); });
      K.lines(c, ['顺时针循环：对外净功为正', 'ΔU = 0，Q = W = ' + K.formatQuantity(K.gasCycle.workBy(), '', 2) + '（相对单位）'],
        E.X(1.9), b.y1 + 2, col, fs * 0.75, 'left', b.x2 - E.X(1.9) - 3); }
    markScale(c, b, '相对坐标', col, fs);
  }
});

/* ---------- 分子力 / 分子势能（伦纳德-琼斯势） ---------- */
K.sel('qMolG', '图像', ['分子力 F-r', '分子势能 Ep-r'], 0);
K.molecularState = function (r) {
  var inverseSixth = Math.pow(r, -6);
  return { potential: 4 * inverseSixth * (inverseSixth - 1),
    repulsion: 48 * inverseSixth * inverseSixth / r, attraction: -24 * inverseSixth / r };
};
K.reg({
  key: 'pm_g_molecular', cat: 'graph', label: '分子力·分子势能', params: ['qMolG'],
  icon: GI + '<path d="M6 3q1 14 4 13t10-3"/><path d="M4 13h17" stroke-dasharray="1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var ep = K.v(o, 'qMolG') === 1, col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055), r0 = Math.pow(2, 1 / 6);
    var A = ax(c, b, { xmin: 0, xmax: 3, ymin: ep ? -1.4 : -1.6, ymax: ep ? 2.2 : 2.6, xl: 'r', yl: ep ? 'E_p' : 'F', col: col });
    if (!ep) {
      var Fr = function (r) { return K.molecularState(r).repulsion; }, Fa = function (r) { return K.molecularState(r).attraction; };
      K.plot(c, A, Fr, 0.85, 3, K.alpha(C.F, 0.8), 1.2, [5, 4]); K.plot(c, A, Fa, 0.85, 3, K.alpha(C.B, 0.8), 1.2, [5, 4]);
      K.plot(c, A, function (r) { return Fr(r) + Fa(r); }, 0.85, 3, C.a, lw);
      K.txt(c, '斥力', A.X(1.05), A.Y(2.2), { c: C.F, s: fs * 0.85, al: 'left', ui: true }); K.txt(c, '引力', A.X(1.05), A.Y(-1.35), { c: C.B, s: fs * 0.85, al: 'left', ui: true });
      K.txt(c, '合力', A.X(2.2), A.Y(-0.25), { c: C.a, s: fs * 0.85, ui: true });
    } else {
      K.plot(c, A, function (r) { return K.molecularState(r).potential; }, 0.88, 3, C.a, lw);
      K.guide(c, A, r0, -1, K.alpha(col, 0.5), 1); K.txt(c, 'Ep 最小', A.X(r0) + fs * 0.5, A.Y(-1) + fs * 0.9, { c: C.a, s: fs * 0.85, al: 'left', ui: true });
    }
    K.dot(c, A.X(r0), A.oy, 3.5, C.F); K.txt(c, 'r₀', A.X(r0), A.oy + fs * 0.9, { c: col, s: fs, i: true });
    markScale(c, b, '相对刻度', col, fs);
    K.txt(c, ep ? 'r₀ 处势能最低' : 'r < r₀ 排斥，r > r₀ 吸引',
      A.X1, A.Y0, { c: col, s: fs * 0.78, al: 'right', ui: true, maxWidth: A.X1 - A.X0 });
  }
});

/* ---------- U-I / I-U 图像 ---------- */
K.circuitOperatingPoint = function (emf, internal, load) {
  var current = emf / (internal + load);
  return { current: current, voltage: load * current, outputPower: load * current * current };
};
K.sel('qUIG', '图像', ['电源 U-I 与电阻工作点', '小灯泡 I-U（非线性）', '两个电源 U-I 比较'], 0);
K.reg({
  key: 'pm_g_ui', cat: 'graph', label: '伏安特性图像', params: ['qUIG'],
  icon: GI + '<path d="M4 6l16 10"/><path d="M4 20l12-10"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var m = K.v(o, 'qUIG'), col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055);
    if (m === 0) { var A = ax(c, b, { xmin: 0, xmax: 3.5, ymin: 0, ymax: 3.6, xl: 'I/A', yl: 'U/V', unitAxes: true, col: col });
      var emf = 3, r = 1, R = 2, st = K.circuitOperatingPoint(emf, r, R);
      K.plot(c, A, function (i) { return emf - i * r; }, 0, emf / r, C.a, lw); K.plot(c, A, function (i) { return R * i; }, 0, 1.7, C.B, lw);
      K.guide(c, A, st.current, st.voltage, K.alpha(col, 0.5), 1); K.dot(c, A.X(st.current), A.Y(st.voltage), 4, C.F); K.txt(c, '工作点', A.X(st.current) + fs * 0.5, A.Y(st.voltage) - fs * 0.6, { c: C.F, s: fs * 0.85, al: 'left', ui: true });
      K.txt(c, 'ℰ', A.ox - 4, A.Y(emf), { c: col, s: fs, al: 'right' }); K.txt(c, 'I短 = ℰ/r', A.X(emf / r), A.oy + fs * 0.9, { c: col, s: fs * 0.85 });
      K.txt(c, '电源', A.X(2.4), A.Y(0.6) - fs * 0.6, { c: C.a, s: fs * 0.85, al: 'left', ui: true }); K.txt(c, '电阻 R', A.X(1.6), A.Y(3.2), { c: C.B, s: fs * 0.85, al: 'left', ui: true });
      K.txt(c, '斜率绝对值 = r，阴影矩形面积 = 输出功率', A.X1, A.Y0, { c: col, s: fs * 0.75, al: 'right', ui: true });
      K.box(c, A.ox, A.Y(st.voltage), A.X(st.current) - A.ox, A.oy - A.Y(st.voltage), null, 0, K.alpha(C.a, 0.15)); }
    else if (m === 1) { var B = ax(c, b, { xmin: 0, xmax: 4, ymin: 0, ymax: 1.6, xl: 'U/V', yl: 'I/A', col: col });
      K.plot(c, B, function (u) { return 0.62 * Math.pow(u, 0.6); }, 0, 4, C.a, lw); K.plot(c, B, function (u) { return 0.33 * u; }, 0, 4, C.B, lw);
      K.txt(c, '小灯泡', B.X(3.3), B.Y(0.62 * Math.pow(3.3, 0.6)) - fs, { c: C.a, s: fs * 0.85, ui: true }); K.txt(c, '定值电阻', B.X(3.2), B.Y(1.06) + fs, { c: C.B, s: fs * 0.85, ui: true });
      K.txt(c, '曲线上点与原点连线斜率 = 1/R，温度升高 R 增大', B.X1, B.Y0, { c: col, s: fs * 0.75, al: 'right', ui: true }); }
    else { var D = ax(c, b, { xmin: 0, xmax: 5.2, ymin: 0, ymax: 3.6, xl: 'I/A', yl: 'U/V', col: col });
      K.plot(c, D, function (i) { return 3 - i; }, 0, 3, C.a, lw); K.plot(c, D, function (i) { return 2.4 - 0.5 * i; }, 0, 4.8, C.F, lw);
      K.txt(c, '1', D.X(0.4), D.Y(2.6) - fs * 0.6, { c: C.a, s: fs }); K.txt(c, '2', D.X(4.2), D.Y(0.3) - fs * 0.6, { c: C.F, s: fs });
      K.txt(c, 'ℰ₁ > ℰ₂，r₁ > r₂', D.X1, D.Y0, { c: col, s: fs * 0.8, al: 'right', ui: true }); }
  }
});

/* ---------- 光电效应 Ek-ν / Uc-ν ---------- */
K.sel('qEkG', '图像', ['Ek-ν 图像', 'Uc-ν 图像'], 0);
K.reg({
  key: 'pm_g_ekv', cat: 'graph', label: '光电效应图像', params: ['qEkG'],
  icon: GI + '<path d="M8 20l12-12"/><path d="M12 20l8-8" opacity=".5"/><path d="M4 23l4-3" stroke-dasharray="1.5 1.5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var uc = K.v(o, 'qEkG') === 1, col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055);
    var A = ax(c, b, { xmin: 0, xmax: 16, ymin: -5, ymax: 6.2, xl: 'ν/(10¹⁴ Hz)',
      yl: uc ? 'U_c/V' : 'E_k/eV', unitAxes: true, col: col });
    [[2.29, C.a, '钠'], [3.2, C.F, '钙']].forEach(function (q) {
      var nc = K.photoelectricThreshold(q[0]) / 1e14, f = function (v) { return K.photoelectricExcess(v * 1e14, q[0]); };
      K.plot(c, A, f, 0, nc, K.alpha(q[1], 0.7), 1.2, [5, 4]); K.plot(c, A, f, nc, 16, q[1], lw);
      K.dot(c, A.X(nc), A.oy, 3.5, q[1]); K.lab(c, 'ν_c', A.X(nc), A.oy + fs * 0.9, { c: q[1], s: fs * 0.85 });
      K.txt(c, q[2], A.X(14.5), A.Y(f(14.5)) - fs * 0.9, { c: q[1], s: fs * 0.85, ui: true });
      K.txt(c, uc ? '−W₀/e' : '−W₀', A.ox + 4, A.Y(-q[0]), { c: q[1], s: fs * 0.8, al: 'left', i: true });
    });
    K.txt(c, '虚线为外推 · 横截距为截止频率', b.x2 - 3, b.y1 + 3,
      { c: col, s: fs * 0.75, al: 'right', bl: 'top', maxWidth: b.w * 0.55 });
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
    var A = ax(c, b, { xmin: 0, xmax: 6, ymin: 0, ymax: 1.12, xl: 'λ/μm',
      yl: [{ symbol: 'I' }, '/', { symbol: 'I', sub: '峰' }], col: col });
    for (var w = 380; w < 780; w += 8) K.box(c, A.X(w / 1000), A.oy - 6, A.X((w + 8) / 1000) - A.X(w / 1000) + 0.5, 6, null, 0, K.wl(w + 4, 0.9));
    var pk = [];
    Ts.forEach(function (T, k) { K.plot(c, A, function (l) { return Pl(l, T) / mx; }, 0.2, 6, cl[k], lw); var lp = 2898 / T; pk.push([A.X(lp), A.Y(Pl(lp, T) / mx)]);
      K.txt(c, T + ' K', A.X(lp) + fs * 0.3, A.Y(Pl(lp, T) / mx) - fs * 0.7, { c: cl[k], s: fs * 0.8, al: 'left', ui: true }); });
    K.poly(c, pk, K.alpha(col, 0.6), 1, [4, 4]);
    K.txt(c, '以 2000 K 峰值归一化', A.X1, A.Y1 - fs * 0.65,
      { essential: true, c: col, s: fs * 0.72, al: 'right', maxWidth: (A.X1 - A.X0) * 0.66 });
    for (var x = 1; x <= 5; x++) K.txt(c, String(x), A.X(x), A.oy + fs * 0.9, {  essential: true,c: col, s: fs * 0.72, ui: true });
    K.txt(c, '温度升高：各波长辐射强度都增大，极大值向短波方向移动', A.X1, A.Y0, { c: col, s: fs * 0.75, al: 'right', ui: true });
  }
});

/* ---------- 共振曲线 ---------- */
K.reg({
  key: 'pm_g_resonance', cat: 'graph', label: '共振曲线',
  icon: GI + '<path d="M4 17q6-1 7-12 1 11 9 13"/><path d="M4 17q6-2 7-6 1 5 9 7" opacity=".5"/>',
  draw: function (c, o, GH) {
    var b = GH.box(o); if (b.w < 60 || b.h < 50) return;
    var col = o.color, lw = K.lw(o) * 1.2, fs = K.fs(K.S(b), 0.055);
    var A = ax(c, b, { xmin: 0, xmax: 2.2, ymin: 0, ymax: 12,
      xl: [{ symbol: 'f', sub: '驱' }, '/', { symbol: 'f', sub: '固' }], yl: 'A', col: col });
    markScale(c, b, '振幅为相对值', col, fs);
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
    markScale(c, b, '定性示意', col, fs);
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
    markScale(c, b, '相对刻度', col, fs);
    var f = isE ? function (x) { return (x + 1) / Math.pow(Math.abs(x + 1), 3) + s * (x - 1) / Math.pow(Math.abs(x - 1), 3); }
                : function (x) { return 1 / Math.abs(x + 1) + s / Math.abs(x - 1); };
    [[-3, -1.04], [-0.96, 0.96], [1.04, 3]].forEach(function (r) { K.plot(c, A, f, r[0], r[1], C.a, lw, null, 300); });
    [[-1, 1], [1, s]].forEach(function (q) { var X = A.X(q[0]); K.line(c, X, A.Y0, X, A.Y1, K.alpha(col, 0.3), 1, [3, 4]);
      K.circ(c, X, A.oy, Math.max(6, fs * 0.55), q[1] > 0 ? C.pos : C.neg, 1, q[1] > 0 ? C.pos : C.neg); K.txt(c, q[1] > 0 ? '+' : '−', X, A.oy, {  essential: true,c: '#fff', s: fs * 0.9, b: true, ui: true }); });
    var tip = ['中点 φ = 0，从正电荷到负电荷 φ 降低', '中点 φ 最低（连线上），中垂线上中点 φ 最高', '中点场强最小但不为零，方向不变', '中点 E = 0，两侧方向相反'][m];
    K.txt(c, tip, b.x1 + 4, A.Y1 + fs * 0.6, { c: col, s: fs * 0.75, al: 'left', ui: true, maxWidth: b.w - 8 });
    K.txt(c, isE ? '取 +x 方向为正' : '取无穷远电势为零', A.X0 + 4, A.Y0, { c: col, s: fs * 0.72, al: 'left', ui: true });
  }
});
})();

/* ===== 上游 pm_lab_instruments.js ===== */
/* 实验量具：本体、放大刻度和答案由同一读数状态派生。 */
(function () {
'use strict';
const K = window.__PM;
const C = K.C;
const MM = 'mm';
const METER_DIVISIONS = 30;

K.sel('qLabMode', '教学模式', ['教师演示', '学生练习', '显示答案'], 0);
K.sel('qLabVernierN', '游标规格', ['10 分度', '20 分度', '50 分度'], 0);
K.P('qLabCaliperGap', { label: '卡尺开口', min: 0, max: 30, step: 0.02, def: 12.36, unit: MM });
K.P('qLabCaliperZero', { label: '卡尺零差', min: -0.2, max: 0.2, step: 0.02, def: 0, unit: MM });
K.P('qLabMicrometerGap', { label: '测微器开口', min: 0, max: 25, step: 0.001, def: 5.724, unit: MM });
K.P('qLabMicrometerZero', { label: '测微器零差', min: -0.05, max: 0.05, step: 0.001, def: 0, unit: MM });
K.tog('qLabClose', '闭合校零', false);
K.sel('qLabMeterFace', '电表外观', ['电路符号', '直流读数表盘'], 0);
K.P('qLabMeterPointer', { label: '指针位置', min: 0, max: 100, step: 0.1, def: 61.7, unit: '%' });

// 量具取到可读精度；误差量化与运动量化分别完成，闭合时读数即零差。
K.labVernierState = function (divisions, gap, zeroError) {
  const actual = Math.round(K.clamp(gap, 0, 30) * divisions);
  const zero = Math.sign(zeroError) * Math.round(Math.abs(zeroError) * divisions);
  const indicated = actual + zero;
  const whole = Math.floor(indicated / divisions);
  const matched = indicated - whole * divisions;
  return { divisions, step: 1 / divisions, digits: divisions === 10 ? 1 : 2,
    gap: actual / divisions, zero: zero / divisions, raw: indicated / divisions,
    whole, matched, pitch: 1 - 1 / divisions, alignedMain: whole + matched };
};

K.labMicrometerState = function (gap, zeroError) {
  const actual = Math.round(K.clamp(gap, 0, 25) * 1000);
  const zero = Math.round(zeroError * 1000);
  const indicated = actual + zero;
  const halfSteps = Math.floor(indicated / 500);
  const drum = (indicated - halfSteps * 500) / 10;
  return { gap: actual / 1000, zero: zero / 1000, raw: indicated / 1000,
    sleeve: halfSteps / 2, drum, rotation: drum * K.TAU / 50 };
};

const ranges = {
  A: [{ max: 0.6, estimate: 0.01, digits: 2, rule: '半格估读' },
    { max: 3, estimate: 0.01, digits: 2, rule: '估读至十分之一格' }],
  V: [{ max: 3, estimate: 0.01, digits: 2, rule: '估读至十分之一格' },
    { max: 15, estimate: 0.1, digits: 1, rule: '估读至五分之一格' }]
};

K.labMeterState = function (unit, range, pointer) {
  const selected = ranges[unit][range] || ranges[unit][0];
  const other = ranges[unit][range === 1 ? 0 : 1];
  const fraction = K.clamp(pointer, 0, 100) / 100;
  const round = (value, step) => Math.round(value / step + 1e-9) * step;
  return { ...selected, unit, fraction, step: selected.max / METER_DIVISIONS,
    reading: round(fraction * selected.max, selected.estimate),
    wrongRange: round(fraction * other.max, other.estimate), wrongDigits: other.digits };
};

function instrumentGap(o, key) {
  if (K.v(o, 'qLabClose')) return 0;
  const t = K.mod(K.t(o), 6);
  // 闭合处停留以便读零差；移动段用余弦平滑起停。
  const moving = K.clamp((t - 0.12) / 2.88, 0, 1) - K.clamp((t - 4) / 2, 0, 1);
  return K.v(o, key) * (1 + Math.cos(Math.PI * moving)) / 2;
}

function layout(box) {
  const width = Math.min(box.w, 2.05 * box.h);
  const height = Math.min(box.h, 0.95 * box.w);
  return { x: box.x1 + (box.w - width) / 2, y: box.y1 + (box.h - height) / 2,
    w: width, h: height, fs: Math.min(18, width / 28, height / 17) };
}

function label(c, value, x, y, color, size, width, align = 'center') {
  K.txt(c, value, x, y, { c: color, s: size, ui: true, maxWidth: width, al: align, essential: true });
}

function title(c, text, b, color) {
  label(c, text, b.x + b.w * 0.05, b.y + b.h * 0.06, color, b.fs * 1.12, b.w * 0.9, 'left');
}

function inset(c, text, b, color, lw) {
  const region = { x: b.x + b.w * 0.05, y: b.y + b.h * 0.46, w: b.w * 0.9, h: b.h * 0.31 };
  K.box(c, region.x, region.y, region.w, region.h, K.alpha(color, 0.45), lw,
    K.alpha(color, 0.045), b.fs * 0.34);
  label(c, text, region.x + region.w * 0.035, region.y + region.h * 0.14, color, b.fs * 0.79,
    region.w * 0.93, 'left');
  return region;
}

function feedback(c, b, color, rows) {
  K.drawMathBlock(c, rows, b.x + b.w * 0.05, b.y + b.h * 0.80, {
    c: color, s: b.fs, maxWidth: b.w * 0.9, maxHeight: b.h * 0.18
  });
}

function quantity(value, digits, unit = MM) { return K.formatQuantity(value, unit, digits); }

function correction(state, digits) {
  const raw = { symbol: 'L', sub: '示' }, zero = { symbol: 'e', sub: '0' };
  return [{ symbol: 'L' }, ' = ', raw, ' − ', zero, ' = ', quantity(state.raw, digits, ''),
    ' − (', quantity(state.zero, digits, ''), ') = ', quantity(state.gap, digits)];
}

function vernierBody(c, b, state, col, lw) {
  const x = b.x + b.w * 0.12, y = b.y + b.h * 0.27;
  const height = b.h * 0.064, scale = b.w * 0.0092;
  const rawZero = x + state.raw * scale, jaw = x + state.gap * scale;
  const movingWidth = (state.divisions * state.pitch + 2) * scale;
  const fill = K.alpha(col, 0.1);
  K.box(c, x - scale * 2, y, b.w * 0.77, height, col, lw, fill, lw);
  for (let i = 0; i <= 80; i++) {
    K.line(c, x + i * scale, y + height, x + i * scale, y + height * (i % 5 === 0 ? 0.42 : 0.72), col, lw * 0.52);
  }
  K.poly(c, [[x, y + height], [x, y + height * 2.42], [x - scale * 1.4, y + height * 2.20],
    [x - scale * 1.8, y + height], [x - scale * 1.8, y - height * 0.8], [x, y - height * 1.65],
    [x, y]], col, lw, null, true, fill);
  K.box(c, Math.min(jaw, rawZero) - scale * 0.6, y + height, movingWidth + Math.abs(rawZero - jaw),
    height * 0.8, col, lw, fill, lw);
  K.poly(c, [[jaw, y + height * 1.8], [jaw + scale * 1.8, y + height * 1.8],
    [jaw + scale * 1.4, y + height * 2.20], [jaw, y + height * 2.42]], col, lw, null, true, fill);
  K.poly(c, [[jaw, y], [jaw, y - height * 1.65], [jaw + scale * 1.8, y - height * 0.8],
    [jaw + scale * 1.8, y]], col, lw, null, true, fill);
  for (let i = 0; i <= state.divisions; i++) {
    const tx = rawZero + i * state.pitch * scale;
    K.line(c, tx, y + height, tx, y + height * (i % 5 === 0 ? 1.43 : 1.25), col, lw * 0.52);
  }
  if (state.gap > 0) K.box(c, x, y + height * 1.81, jaw - x, height * 0.49,
    null, 0, K.alpha(C.gas, 0.28), 0);
}

function vernierInset(c, b, state, guided, col, lw) {
  const d = inset(c, '放大刻度 · 主尺 / mm · 游标 / 格', b, col, lw * 0.75);
  const start = state.whole - 2, end = state.whole + state.divisions + 1;
  const dx = d.w * 0.92 / (end - start), x = value => d.x + d.w * 0.04 + (value - start) * dx;
  const mainY = d.y + d.h * 0.49, slideY = d.y + d.h * 0.54;
  const labelEvery = state.divisions === 10 ? 2 : 5;
  K.line(c, x(start), mainY, x(end), mainY, col, lw);
  K.line(c, x(state.raw), slideY, x(state.raw + state.divisions * state.pitch), slideY, col, lw);
  if (guided) K.line(c, x(state.alignedMain), mainY - d.h * 0.18, x(state.alignedMain),
    slideY + d.h * 0.20, C.gas, lw, [2, 2]);
  for (let i = Math.max(0, start); i <= end; i++) {
    const major = i % labelEvery === 0, selected = guided && i === state.alignedMain;
    const color = selected ? C.gas : col;
    K.line(c, x(i), mainY, x(i), mainY - d.h * (major || selected ? 0.145 : 0.085), color, selected ? lw : lw * 0.8);
    if (major) label(c, String(i), x(i), d.y + d.h * 0.29, color, b.fs * 0.81, dx * (labelEvery - 0.2));
  }
  for (let i = 0; i <= state.divisions; i++) {
    const tx = x(state.raw + state.pitch * i);
    const major = i % labelEvery === 0, selected = guided && i === state.matched;
    const color = selected ? C.gas : col;
    K.line(c, tx, slideY, tx, slideY + d.h * (major || selected ? 0.18 : 0.10), color, selected ? lw : lw * 0.8);
    if (major) label(c, String(i), tx, d.y + d.h * 0.83, color, b.fs * 0.81, dx * state.pitch * (labelEvery - 0.2));
  }
}

K.reg({
  key: 'pm_vernier', cat: 'mech', label: '游标卡尺·放大刻度', animatable: true,
  params: ['qLabMode', 'qLabVernierN', 'qLabCaliperGap', 'qLabCaliperZero', 'qLabClose'],
  icon: '<path d="M3 5v13l3 2v-7h15v-3H6V3L3 5zM10 10v9l3-2v-4m3-3v2m3-2v2"/>',
  draw(c, o, GH) {
    const b = layout(GH.box(o));
    if (b.w < 80 || b.h < 52) return;
    const divisions = [10, 20, 50][K.v(o, 'qLabVernierN')] || 10;
    const state = K.labVernierState(divisions, instrumentGap(o, 'qLabCaliperGap'), K.v(o, 'qLabCaliperZero'));
    const mode = K.v(o, 'qLabMode'), col = o.color, lw = Math.min(K.lw(o), b.fs * 0.16);
    vernierBody(c, b, state, col, lw);
    vernierInset(c, b, state, K.showDetails(o) && mode !== 1, col, lw);
    if (!K.showDetails(o)) return;
    title(c, '游标卡尺 · ' + divisions + ' 分度 · 本体示意', b, col);
    if (mode === 0) feedback(c, b, col, [
      ['分度值 ', quantity(state.step, state.digits), ' · 主尺看游标零线左侧 · 游标找重合线'],
      [K.v(o, 'qLabClose') ? '两量爪闭合，以主尺零线为基准判断零差的正负。' : '闭合校零后，用示值减去有符号的零差。']
    ]);
    if (mode === 2) feedback(c, b, col, [
      [{ symbol: 'L', sub: '示' }, ' = ',
        ...(state.raw < 0 ? ['−(', String(state.divisions), ' − ', String(state.matched), ') × ']
          : [quantity(state.whole, 0, ''), ' + ', String(state.matched), ' × ']),
        quantity(state.step, state.digits, ''), ' = ', quantity(state.raw, state.digits),
        state.raw < 0 ? '（游标零线偏左）' : ''],
      correction(state, state.digits)
    ]);
  }
});

function micrometerBody(c, b, state, col, lw) {
  const x = b.x + b.w * 0.14, y = b.y + b.h * 0.25, h = b.h * 0.066;
  const travel = state.gap * b.w * 0.0052;
  const sleeveX = x + b.w * 0.33, drumX = sleeveX + b.w * 0.06 + travel;
  const drumW = b.w * 0.22, jaw = x + b.w * 0.12;
  const fill = K.alpha(col, 0.11);
  c.save();
  c.beginPath();
  c.moveTo(jaw - h * 0.26, y + h * 0.32);
  c.lineTo(x + h * 0.3, y + h * 0.32);
  c.bezierCurveTo(x - h * 2.3, y + h * 0.32, x - h * 2.3, y + h * 2.75, x + h * 0.5, y + h * 2.75);
  c.lineTo(sleeveX - h, y + h * 2.75);
  c.quadraticCurveTo(sleeveX, y + h * 2.75, sleeveX, y + h * 0.32);
  c.strokeStyle = col;
  c.lineWidth = h * 0.48;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke();
  c.restore();
  K.box(c, jaw - h * 0.43, y + h * 0.07, h * 0.43, h * 0.52, col, lw, fill);
  K.box(c, jaw + travel, y + h * 0.10, sleeveX - jaw - travel + h * 0.2, h * 0.46, col, lw, fill);
  if (travel > 0) K.box(c, jaw, y + h * 0.1, travel, h * 0.46, null, 0, K.alpha(C.gas, 0.28));
  K.box(c, sleeveX, y - h * 0.23, drumX - sleeveX, h * 1.12, col, lw, fill);
  K.line(c, sleeveX, y + h * 0.33, drumX, y + h * 0.33, col, lw * 0.8);
  K.poly(c, [[drumX, y - h * 0.23], [drumX + h * 0.7, y - h * 0.62], [drumX + drumW, y - h * 0.62],
    [drumX + drumW, y + h * 1.28], [drumX + h * 0.7, y + h * 1.28], [drumX, y + h * 0.89]], col, lw, null, true, fill);
  for (let i = 0; i < 50; i++) {
    const angle = state.rotation - K.TAU * i / 50;
    if (Math.cos(angle) <= 0) continue;
    const z = Math.sin(angle), tickY = y + h * (0.33 + z * 0.52);
    const tickX = drumX + h * 0.70 * Math.abs(z);
    K.line(c, tickX, tickY, tickX + h * (i % 5 === 0 ? 0.66 : 0.35), tickY, col, lw * 0.60);
    if (i % 5 === 0) {
      const knurlY = y + h * (0.33 + z * 0.87);
      K.line(c, drumX + h * 1.48, knurlY, drumX + drumW - h * 0.2, knurlY, K.alpha(col, 0.44), lw * 0.65);
    }
  }
  K.box(c, drumX + drumW, y - h * 0.26, b.w * 0.036, h * 1.18, col, lw, fill, lw);
}

function micrometerInset(c, b, state, guided, col, lw) {
  const d = inset(c, '放大刻度 · 固定套筒 / mm · 微分筒刻线展开', b, col, lw * 0.75);
  const reference = d.y + d.h * 0.62, edge = d.x + d.w * 0.62;
  const left = d.x + d.w * 0.06, right = d.x + d.w * 0.94;
  const span = d.w * 0.13, drumPitch = d.h * 0.051;
  K.box(c, edge, d.y + d.h * 0.29, right - edge, d.h * 0.66, col, lw, K.alpha(col, 0.07));
  K.line(c, left, reference, edge, reference, guided ? C.gas : col, lw);
  if (guided) K.line(c, edge, reference, right, reference, C.gas, lw * 0.85, [2, 3]);
  for (let i = 0; i <= 4; i++) {
    const mark = state.sleeve - i * 0.5;
    if (mark < 0) break;
    const x = edge - (state.raw - mark) * span - lw * 0.6;
    const whole = mark % 1 === 0, color = guided && i === 0 ? C.gas : col;
    K.line(c, x, reference, x, reference + d.h * (whole ? -0.15 : 0.15), color, lw);
    if (whole || (guided && i === 0)) label(c, quantity(mark, whole ? 0 : 1, ''),
      x - (i === 0 ? b.fs * 0.22 : 0), reference + d.h * (whole ? -0.225 : 0.237), color, b.fs * 0.78, span * 0.6);
  }
  for (let i = Math.ceil(state.drum - 6); i <= state.drum + 6; i++) {
    const y = reference + (state.drum - i) * drumPitch, major = i % 5 === 0;
    K.line(c, edge, y, edge + (right - edge) * (major ? 0.59 : 0.32), y, col, lw * (major ? 1 : 0.75));
    if (major) label(c, String(K.mod(i, 50)), right - (right - edge) * 0.16, y, col,
      Math.min(b.fs * 0.81, 4.1 * drumPitch), (right - edge) * 0.27);
  }
}

K.reg({
  key: 'pm_micrometer', cat: 'mech', label: '螺旋测微器·放大刻度', animatable: true,
  params: ['qLabMode', 'qLabMicrometerGap', 'qLabMicrometerZero', 'qLabClose'],
  icon: '<path d="M8 9H6a4 4 0 0 0 0 8h5a3 3 0 0 0 3-3V9m-4 1h5m0-3h6v6h-6zm3 0v6"/>',
  draw(c, o, GH) {
    const b = layout(GH.box(o));
    if (b.w < 80 || b.h < 52) return;
    const state = K.labMicrometerState(instrumentGap(o, 'qLabMicrometerGap'), K.v(o, 'qLabMicrometerZero'));
    const mode = K.v(o, 'qLabMode'), col = o.color, lw = Math.min(K.lw(o), b.fs * 0.16);
    micrometerBody(c, b, state, col, lw);
    micrometerInset(c, b, state, K.showDetails(o) && mode !== 1, col, lw);
    if (!K.showDetails(o)) return;
    title(c, '螺旋测微器 · 本体示意', b, col);
    if (mode === 0) feedback(c, b, col, [
      ['螺距 ', quantity(0.5, 1), ' · 套筒先看半毫米线 · 微分筒每格 ', quantity(0.01, 2)],
      ['沿基准线估读至 ', quantity(0.001, 3), ' · 闭合时看零线相对位置']
    ]);
    if (mode === 2) feedback(c, b, col, [
      [{ symbol: 'L', sub: '示' }, ' = ', state.raw < 0 ? '(' + quantity(state.drum, 1, '') + ' − 50) × 0.01'
        : quantity(state.sleeve, 1, '') + ' + ' + quantity(state.drum, 1, '') + ' × 0.01',
      ' = ', quantity(state.raw, 3)],
      correction(state, 3),
      state.sleeve % 1 === 0.5 ? ['漏读半毫米线会得到 ', quantity(state.raw - 0.5, 3)]
        : [state.raw < 0 ? '微分筒零线越过基准线。' : '微分筒估读至 ' + quantity(0.001, 3)]
    ]);
  }
});

function meterFace(unit, rangeKey, c, o, GH) {
  const b = layout(GH.box(o));
  if (b.w < 65 || b.h < 52) return;
  const state = K.labMeterState(unit, K.v(o, rangeKey), K.v(o, 'qLabMeterPointer'));
  const mode = K.v(o, 'qLabMode'), col = o.color, lw = Math.min(K.lw(o), b.fs * 0.16);
  const active = unit === 'A' ? C.I : C.E;
  const cx = b.x + b.w * 0.5, cy = b.y + b.h * 0.67;
  const r = Math.min(b.w * 0.41, b.h * 0.49);
  const angle = fraction => Math.PI * (-0.82 + 0.64 * fraction);
  const point = (a, radius) => [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
  const designation = unit === 'A' ? '直流电流表' : '直流电压表';
  K.box(c, b.x + b.w * 0.05, b.y + b.h * 0.13, b.w * 0.9, b.h * 0.63,
    col, lw, K.alpha(col, 0.06), b.fs * 0.7);
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, angle(0), angle(1));
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.stroke();
  c.restore();
  for (let i = 0; i <= METER_DIVISIONS; i++) {
    const a = angle(i / METER_DIVISIONS), major = i % 5 === 0;
    const outside = point(a, r), inside = point(a, r * (major ? 0.86 : 0.92));
    K.line(c, ...outside, ...inside, col, major ? lw : lw * 0.71);
    if (major) {
      const tick = i * state.step, p = point(a, r * 0.75);
      const text = quantity(tick, Math.abs(tick - Math.round(tick)) > 1e-9 ? 1 : 0, '');
      label(c, text, p[0], p[1], col, Math.min(b.fs, r * 0.13), r * 0.20);
    }
  }
  const needle = point(angle(state.fraction), r * 0.995);
  K.line(c, cx, cy, ...needle, active, lw * 1.22);
  K.dot(c, cx, cy, lw * 1.65, col);
  label(c, unit, cx, cy + b.h * 0.05, col, b.fs * 1.1, r * 0.2);
  label(c, '−', b.x + b.w * 0.19, cy, col, b.fs, r * 0.2);
  label(c, '+', b.x + b.w * 0.81, cy, col, b.fs, r * 0.2);
  if (!K.showDetails(o)) return;
  title(c, designation + ' · 0–' + quantity(state.max, state.max < 1 ? 1 : 0, unit), b, col);
  const guidance = ['每格 ', quantity(state.step, 2 - Number(state.step >= 0.1), unit),
    ' · ', state.rule, '至 ', quantity(state.estimate, state.digits, unit)];
  if (mode === 0) feedback(c, b, col, [guidance, ['先确认量程，再让视线正对指针。']]);
  if (mode === 2) feedback(c, b, col, [
    guidance,
    [{ symbol: unit === 'A' ? 'I' : 'U' }, ' = ', quantity(state.reading, state.digits, unit),
      state.fraction > 0 ? '    同一指针位置误套另一量程 → ' + quantity(state.wrongRange, state.wrongDigits, unit)
        : '    末位估读数字写 0']
  ]);
}

for (const [key, unit, label, options] of [
  ['ammeter', 'A', '电流表量程', ['0–0.6 A', '0–3 A']],
  ['voltmeter', 'V', '电压表量程', ['0–3 V', '0–15 V']]
]) {
  const rangeKey = unit === 'A' ? 'qLabAmmeterRange' : 'qLabVoltmeterRange';
  K.sel(rangeKey, label, options, 0);
  const meter = K.TB.shapes[key];
  const symbol = meter.draw;
  const hasFace = o => K.v(o, 'qLabMeterFace') === 1;
  meter.params = [...(meter.params || []), 'qLabMeterFace', rangeKey, 'qLabMeterPointer', 'qLabMode'];
  meter.paperColor = hasFace;
  meter.draw = function (c, o, GH) {
    if (hasFace(o)) meterFace(unit, rangeKey, c, o, GH);
    else symbol.call(this, c, o, GH);
  };
}
})();

/* ===== 上游 pm_lab_mechanics.js ===== */
/* ===================== 力学实验 ===================== */
(function () {
'use strict';
const K = window.__PM;
const C = K.C;
const speedUnit = 'm·s⁻¹';
const accelUnit = 'm·s⁻²';

const motion = K.sampleConstantAcceleration = function (initial, acceleration, time) {
  return {
    x: (initial + acceleration * time / 2) * time,
    v: initial + acceleration * time
  };
};

function number(o, key) {
  const definition = K.TB.paramDefs[key];
  const value = K.v(o, key);
  return K.clamp(Number.isFinite(value) ? value : definition.def, definition.min, definition.max);
}

function panel(c, b, o) {
  const pad = K.clamp(K.S(b) * 0.024, 4, 11);
  const lw = K.lw(o, 0.45);
  const col = o.color;
  K.box(c, b.x1 + lw / 2, b.y1 + lw / 2, b.w - lw, b.h - lw,
    K.alpha(col, 0.25), lw, K.alpha(col, 0.035), pad);
  return {
    x: b.x1 + pad, y: b.y1 + pad, w: b.w - 2 * pad, h: b.h - 2 * pad,
    col, lw, fs: K.clamp(K.S(b) * 0.049, 8, 18), pad
  };
}

function math(c, tokens, x, y, w, h, color, fs, align, essential = false) {
  return K.drawMathLabel(c, tokens, x, y, { c: color, s: fs, maxWidth: w, maxHeight: h, al: align, essential });
}

function note(c, line, x, y, w, h, color, fs, align) {
  K.txt(c, line, x, y + h / 2, { c: color, s: Math.min(fs, h * 0.89), al: align || 'left', ui: true, maxWidth: w });
}

function quantity(symbol, value, unit, digits) {
  return [typeof symbol === 'string' ? { symbol } : symbol, ' = ' + K.formatQuantity(value, unit, digits)];
}

function ratio(numerator, denominator, compact) {
  return compact ? ['(', ...numerator, ')/(', ...denominator, ')'] : [{ frac: [numerator, denominator] }];
}

function plotAxes(c, p, x, y, w, h, xmax, ymax, xl, yl, ndigits, xdigits) {
  const fs = Math.min(p.fs * 0.83, h * 0.22);
  const A = K.axes(c, x, y, w, h, {
    xmin: 0, xmax, ymin: 0, ymax, xl, yl, unitAxes: true, O: false, col: p.col, fs, lw: 1,
    pad: { l: fs * 2.65, r: fs * 3.9, t: fs * 1.5, b: fs * 1.43 }
  });
  math(c, ['0'], A.X0 - fs * 0.45, A.Y1 + fs * 0.2, fs * 1.4, fs, p.col, fs, 'right', true);
  math(c, [K.formatQuantity(ymax, '', ndigits)], A.X0 - fs * 0.45, A.Y0 - fs * 0.25,
    fs * 2.15, fs, p.col, fs, 'right', true);
  math(c, [K.formatQuantity(xmax, '', xdigits)], A.X1, A.Y1 + fs * 0.15, fs * 2.8, fs,
    p.col, fs, 'center', true);
  K.line(c, A.X0 - 2, A.Y0, A.X0 + 2, A.Y0, p.col, 1);
  K.line(c, A.X1, A.Y1 - 2, A.X1, A.Y1 + 2, p.col, 1);
  return A;
}

/* ---------- 打点计时器 ---------- */
K.P('tapeDots', { label: '点数', min: 3, max: 20, step: 1, def: 7 });
K.P('tapeAccel', { label: '加速度', min: -3, max: 3, step: 0.1, def: 1.5 });
K.P('qTapeLabPeriod', { label: '打点周期', min: 10, max: 40, step: 1, def: 20, unit: 'ms' });
K.P('qTapeLabStride', { label: '取点间隔（打点周期数）', min: 1, max: 5, step: 1, def: 5 });
K.P('qTapeLabV0', { label: '初速度', min: 0, max: 3, step: 0.05, def: 0.35, unit: speedUnit });
K.P('qTapeLabPoint', { label: '计算所用的中间计数点', min: 1, max: 18, step: 1, def: 2 });
K.sel('qTapeLabMode', '显示', ['打点动画', '完成的纸带'], 0);
K.sel('qTapeLabGraph', '联动图像', ['速度–时间', '位移–时间', '仅纸带和读数'], 0);
K.tog('qTapeLabAnswers', '显示计算过程', true);
const tapeMotionFormula = [
  { symbol: 'x' }, ' = ', { symbol: 'v', sub: 0 }, { symbol: 't' }, ' + ',
  { frac: [['1'], ['2']] }, { symbol: 'a' }, { symbol: 't', sup: 2 }
];
const twiceStep = ['2', { symbol: 'T' }];
const centeredDisplacement = [
  { symbol: 'x', sub: [{ symbol: 'i' }, ' + 1'] }, ' − ',
  { symbol: 'x', sub: [{ symbol: 'i' }, ' − 1'] }
];

K.tickerLab = function (initial, acceleration, period, stride, count) {
  const step = period * stride;
  const requestedEnd = step * (count - 1);
  const at = t => motion(initial, acceleration, t);
  const stop = acceleration < 0 ? initial / -acceleration : Infinity;
  // 停车后结束取样。无运动时只有初始点。
  const end = initial === 0 && acceleration === 0 ? 0 : Math.min(requestedEnd, stop);
  const marks = [];
  const points = [];
  const gaps = [];
  for (let index = 0; index <= Math.floor(end / period + 1e-9); index++) {
    const t = index * period;
    const mark = { t, x: at(t).x };
    marks.push(mark);
    if (index % stride !== 0) continue;
    if (points.length) gaps.push(mark.x - points[points.length - 1].x);
    points.push(mark);
  }
  function estimate(index) {
    const before = points[index - 1];
    const center = points[index];
    const after = points[index + 1];
    if (!before || !center || !after) return null;
    return {
      t: center.t,
      v: (after.x - before.x) / (2 * step),
      a: (gaps[index] - gaps[index - 1]) / (step * step)
    };
  }
  return { step, end, stop, at, marks, points, gaps, estimate };
};

function drawTickerApparatus(c, p, x, y, w, h, state, finalX, marks, time) {
  const track = y + h * 0.78;
  const device = x + w * 0.115;
  const carWidth = Math.min(w * 0.13, h * 0.92, 56);
  const carStart = x + w * 0.25;
  const scale = (x + w - carWidth * 0.85 - carStart) / Math.max(finalX, 1e-9);
  const cart = carStart + state.x * scale;
  const tapeY = track - carWidth * 0.27;
  K.line(c, x, track, x + w, track, K.alpha(p.col, 0.6), p.lw);
  const tapeHeight = Math.max(4, h * 0.12);
  K.box(c, x + 1, tapeY - tapeHeight / 2, cart - x - 1, tapeHeight,
    K.alpha(p.col, 0.7), 1, K.alpha(C.a, 0.14), 1);
  marks.forEach(mark => K.dot(c, device + (state.x - mark.x) * scale, tapeY, 0.65, p.col));
  const bodyW = Math.min(w * 0.13, h * 1.2);
  const bodyH = Math.min(h * 0.48, bodyW * 0.55);
  K.box(c, device - bodyW / 2, tapeY - tapeHeight / 2 - bodyH, bodyW, bodyH,
    p.col, p.lw, K.alpha(p.col, 0.18), 2);
  K.line(c, device, tapeY - tapeHeight * 0.85, device, tapeY, C.a, p.lw);
  const lastMark = marks[marks.length - 1];
  if (lastMark && time - lastMark.t < 0.008) K.dot(c, device, tapeY, 2.2, C.a);
  K.car(c, cart, track, carWidth, p.col, p.lw, 0);
  if (state.v > 0.001) {
    const start = cart + carWidth * 0.6;
    const available = x + w - start;
    const length = Math.min(available, h * Math.min(0.65, 0.22 + state.v * 0.14));
    if (length > 4) K.arrow(c, start, tapeY, start + length, tapeY, C.v, p.lw, Math.min(8, length * 0.42));
  }
  if (w >= 230 && h >= 40) note(c, '打点计时器', device + bodyW * 0.55, y, w * 0.29, h * 0.24, p.col, p.fs * 0.81);
}

function drawTape(c, p, x, y, w, h, points, marks, selected, finalX, dotColor) {
  const strip = Math.max(5, h * 0.34);
  const left = x + p.fs * 0.57;
  const right = x + w - p.fs * 0.57;
  const scale = (right - left) / Math.max(finalX, 1e-9);
  const dotY = y + strip / 2;
  const labelY = y + strip + h * 0.06;
  const labelHeight = Math.min(h - strip, p.fs * 1.08);
  K.box(c, x, y, w, strip, K.alpha(p.col, 0.5), 1, K.alpha(C.a, 0.11), 2);
  for (const mark of marks) K.dot(c, left + mark.x * scale, dotY, Math.min(1.15, strip * 0.13), dotColor);
  let previousLabel = -Infinity;
  const selectedX = left + (points[selected]?.x || 0) * scale;
  const labelSpace = p.fs * 1.55;
  for (let i = 0; i < points.length; i++) {
    const markX = left + points[i].x * scale;
    const focus = i === selected;
    K.circ(c, markX, dotY, Math.min(focus ? 3.6 : 2.25, strip * 0.36), focus ? C.a : C.v, focus ? 1.5 : 1);
    if (!focus && (markX - previousLabel < labelSpace || selected >= 0 && Math.abs(markX - selectedX) < labelSpace)) continue;
    math(c, [String(i)], markX, labelY, labelSpace, labelHeight, focus ? C.a : p.col, p.fs * 0.83, 'center');
    previousLabel = markX;
  }
}

function drawTapeReadings(c, p, x, y, w, h, model, available, selected, show, layout, complete) {
  const fs = p.fs * 0.9;
  const row = Math.min(fs * 1.25, h * (layout === 'stacked' ? 0.34 : 0.29));
  let nextY = y;
  function line(tokens, color, height) {
    math(c, tokens, x, nextY, w, height, color, fs);
    nextY += height + 1;
  }
  if (!available) {
    const status = model.end === 0 ? '无运动，只记录初始点' : complete ? '仅有一个计数点' : '等待相邻计数点';
    line(status, p.col, row);
    return;
  }
  const compactGaps = layout === 'stacked' || layout === 'split' && (w < 175 || h < 65);
  if (!compactGaps) {
    const items = Math.floor(w / (fs * 10.1));
    const columns = Math.max(1, items);
    const rows = show ? Math.max(1, Math.floor(h * 0.4 / row)) : Math.max(1, Math.floor(h / row));
    const limit = columns * rows;
    const first = Math.max(0, Math.min(available - limit, selected - Math.floor(limit / 2)));
    const last = Math.min(available, first + limit);
    for (let i = first; i < last; i++) {
      const slot = i - first;
      const gap = quantity({ symbol: 's', sub: i + 1 }, model.gaps[i] * 100, 'cm', 2);
      math(c, gap, x + slot % columns * w / columns, y + Math.floor(slot / columns) * row, w / columns - 2,
        row, i === selected || i + 1 === selected ? C.a : p.col, fs);
    }
    nextY += Math.ceil((last - first) / columns) * row + 1;
  } else {
    const first = Math.max(0, selected - 1);
    const tokens = quantity({ symbol: 's', sub: first + 1 }, model.gaps[first] * 100, 'cm', 2);
    if (selected >= 1 && selected < available) {
      tokens.push('   ', ...quantity({ symbol: 's', sub: selected + 1 }, model.gaps[selected] * 100, 'cm', 2));
    }
    line(tokens, p.col, row);
  }
  if (!show) return;
  if (selected < 1 || selected >= available) {
    line('需三个相邻计数点', p.col, row);
    return;
  }
  const estimate = model.estimate(selected);
  const left = { symbol: 's', sub: selected };
  const right = { symbol: 's', sub: selected + 1 };
  const remaining = h - (nextY - y);
  const compact = remaining < fs * 4.2;
  const formulaH = Math.min((compact ? fs * 1.35 : fs * 2.05), (remaining - 1) / 2);
  const vFormula = [{ symbol: 'v', sub: selected }, ' = ', ...ratio([left, ' + ', right], twiceStep, compact),
    ' = ' + K.formatQuantity(estimate.v, speedUnit, 3)];
  const aFormula = [{ symbol: 'a' }, ' = ', ...ratio([right, ' − ', left], [{ symbol: 'T', sup: 2 }], compact),
    ' = ' + K.formatQuantity(estimate.a, accelUnit, 2)];
  if (formulaH < 5.6 && w >= 137) {
    const half = (w - 4) / 2;
    math(c, quantity({ symbol: 'v', sub: selected }, estimate.v, speedUnit, 3), x, nextY, half, remaining, C.v, fs);
    math(c, quantity('a', estimate.a, accelUnit, 2), x + half + 4, nextY, half, remaining, C.a, fs);
    return;
  }
  line(vFormula, C.v, formulaH);
  line(aFormula, C.a, formulaH);
  const theorySpace = y + h - nextY;
  if (theorySpace >= fs * 1.55) {
    const showDisplacement = w >= fs * 18;
    const theory = tapeMotionFormula.slice();
    if (showDisplacement) theory.push('     ', { symbol: 'v', sub: 'i', variableSub: true }, ' ≈ ', ...ratio(centeredDisplacement, twiceStep, false));
    line(theory, p.col, Math.min(fs * 2.12, theorySpace));
  }
}

function drawTapeGraph(c, p, x, y, w, h, model, elapsed, graphMode, selected, markCount) {
  const speedGraph = graphMode === 0;
  const value = t => speedGraph ? Math.max(0, model.at(t).v) : model.at(t).x;
  const xmax = Math.max(0.01, model.end);
  const extremum = Math.max(value(0), value(model.end));
  const ymax = Math.max(0.01, Math.ceil(extremum * 10 - 1e-10) / 10);
  const A = plotAxes(c, p, x, y, w, h, xmax, ymax, 't/s', speedGraph ? 'v/(' + speedUnit + ')' : 'x/m', 1 + (ymax < 0.1), 2);
  const color = speedGraph ? C.v : C.B;
  if (elapsed < model.end) K.plot(c, A, value, elapsed, model.end, K.alpha(color, 0.6), 1.3, [4, 4], 30);
  if (elapsed > 0) K.plot(c, A, value, 0, elapsed, color, 1.7, null, 35);
  K.guide(c, A, elapsed, value(elapsed), K.alpha(color, 0.48), 1);
  for (let i = 0; i < markCount; i++) {
    const point = model.points[i];
    K.dot(c, A.X(point.t), A.Y(value(point.t)), i === selected ? 2.8 : 1.35, i === selected ? C.a : color);
  }
  K.circ(c, A.X(elapsed), A.Y(value(elapsed)), 3.0, color, 1.2);
  if (w >= 120 && elapsed < model.end) note(c, '虚线为预测', x + w - 2, y, w * 0.45, p.fs * 0.85, p.col, p.fs * 0.73, 'right');
}

K.reg({
  key: 'pm_ticker_lab', cat: 'mech', label: '打点计时器实验', animatable: true,
  canAnimate: o => K.v(o, 'qTapeLabMode') !== 1,
  params: ['qTapeLabMode', 'tapeDots', 'tapeAccel', 'qTapeLabPeriod', 'qTapeLabStride', 'qTapeLabV0', 'qTapeLabPoint', 'qTapeLabGraph', 'qTapeLabAnswers'],
  icon: '<rect x="2" y="6" width="7" height="6" rx="1"/><path d="M5.5 12v3M2 15h20M2 19h20"/><path d="M4 17h.1m3 0h.1m4 0h.1m5 0h.1m5 0h.1" stroke-width="1.8" stroke-linecap="round"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    if (b.w < 125 || b.h < 100) return;
    const p = panel(c, b, o);
    const period = number(o, 'qTapeLabPeriod') / 1000;
    const stride = Math.round(number(o, 'qTapeLabStride'));
    const initial = number(o, 'qTapeLabV0');
    const acceleration = number(o, 'tapeAccel');
    const model = K.tickerLab(initial, acceleration, period, stride, Math.round(number(o, 'tapeDots')));
    const elapsed = K.v(o, 'qTapeLabMode') === 1 ? model.end
      : Math.min(model.end, K.mod(Math.max(0, K.t(o)), 5 * model.end + 1.7) / 5);
    const state = model.at(elapsed);
    const finalX = model.at(model.end).x;
    const marks = model.marks.filter(mark => mark.t <= elapsed + 1e-10);
    const points = model.points.filter(point => point.t <= elapsed + 1e-10);
    const desired = Math.round(number(o, 'qTapeLabPoint'));
    const selected = points.length > 2 ? Math.min(desired, points.length - 2) : -1;
    const graphMode = K.v(o, 'qTapeLabGraph');
    const hasGraph = graphMode !== 2;
    const details = K.showDetails(o);
    const show = K.v(o, 'qTapeLabAnswers');
    const titleH = p.fs * 1.12;
    const top = p.y + titleH + 3;
    const aspectWide = p.w >= 285;
    const apparatusH = p.h * (aspectWide ? 0.28 : 0.20);
    const tapeY = top + apparatusH + 1;
    const tapeH = p.h * 0.15;
    const bottom = tapeY + tapeH + 3;
    const remaining = p.y + p.h - bottom;
    const header = [...quantity('τ', period * 1000, 'ms', 0), '    ', { symbol: 'T' }, ' = ', String(stride), { symbol: 'τ' },
      ' = ' + K.formatQuantity(model.step, 's', 3)];
    const titleWidth = Math.min(p.fs * 8.1, p.w * 0.29);
    const conditions = model.stop <= model.end ? '向右为正 · 停车后停止取点' : '向右为正 · 等间隔打点';
    note(c, '打点计时器实验', p.x, p.y, titleWidth, titleH, p.col, p.fs);
    const headerX = p.x + titleWidth + 3;
    const conditionsW = aspectWide ? Math.min(p.w * 0.34, p.fs * 12.4) : 0;
    math(c, header, headerX, p.y, p.w - titleWidth - conditionsW - 5, titleH, p.col, p.fs);
    if (aspectWide) note(c, conditions, p.x + p.w, p.y, conditionsW, titleH, p.col, p.fs * 0.79, 'right');
    drawTickerApparatus(c, p, p.x, top, p.w, apparatusH, state, finalX, marks, elapsed);
    drawTape(c, p, p.x, tapeY, p.w, tapeH, points, marks, selected, finalX, o.dotColor || p.col);
    if (!details) {
      if (hasGraph) drawTapeGraph(c, p, p.x, bottom, p.w, remaining, model, elapsed, graphMode, selected, points.length);
      return;
    }
    const readingLayout = !hasGraph ? 'full' : aspectWide ? 'split' : 'stacked';
    const readingH = readingLayout === 'stacked' ? remaining * 0.47 : remaining;
    const readingW = hasGraph && aspectWide ? p.w * 0.47 : p.w;
    drawTapeReadings(c, p, p.x, bottom, readingW, readingH, model, points.length - 1, selected, show, readingLayout, elapsed >= model.end);
    if (hasGraph && aspectWide) drawTapeGraph(c, p, p.x + p.w * 0.51, bottom, p.w * 0.49, remaining, model, elapsed, graphMode, selected, points.length);
    if (hasGraph && !aspectWide) drawTapeGraph(c, p, p.x, bottom + readingH + 1, p.w, remaining - readingH - 1, model, elapsed, graphMode, selected, points.length);
  }
});

/* ---------- 光电门 ---------- */
K.sel('qGateLabMode', '显示', ['双门装置', '单门测速动画', '单门测速定格'], 0);
K.P('qGateLabWidth', { label: '遮光片宽度', min: 1, max: 8, step: 0.5, def: 3, unit: 'cm' });
K.P('qGateLabInterval', { label: '遮光时间', min: 5, max: 40, step: 1, def: 24, unit: 'ms' });
K.P('qGateLabA', { label: '遮光区间加速度', min: -5, max: 5, step: 0.5, def: 3, unit: accelUnit });
K.tog('qGateLabAnswers', '显示速度计算', true);

K.photogateLab = function (width, interval, acceleration) {
  const average = width / interval;
  const entrySpeed = average - acceleration * interval / 2;
  const exitSpeed = average + acceleration * interval / 2;
  const centerSpeed = Math.hypot(average, acceleration * interval / 2);
  function at(t) {
    const during = t >= 0 && t < interval;
    if (t < 0) return { x: entrySpeed * t, v: entrySpeed, during, shadeTime: 0 };
    if (t >= interval) return { x: width + exitSpeed * (t - interval), v: exitSpeed, during, shadeTime: interval };
    return { ...motion(entrySpeed, acceleration, t), during, shadeTime: t };
  }
  return { average, entrySpeed, exitSpeed, centerSpeed, at };
};

function drawGateApparatus(c, p, x, y, w, h, width, state, after) {
  const cartHeight = h * 0.26;
  const flagH = h * 0.26;
  const rail = y + h * 0.83;
  const shadeY = rail - cartHeight - flagH;
  const beamY = shadeY + flagH * 0.55;
  const maxWidth = K.TB.paramDefs.qGateLabWidth.max / 100;
  const scale = w / (maxWidth * 4.2);
  const gate = x + w * 0.47;
  const front = gate + state.x * scale;
  const flagW = width * scale;
  const cartW = Math.max(w * 0.09, flagW * 1.58);
  const cartX = front - flagW / 2;
  const supportW = Math.min(w * 0.023, h * 0.16);
  const footW = Math.max(supportW * 2.2, Math.min(flagW * 0.42, h * 0.45));
  const gateTop = shadeY - h * 0.05;
  const light = state.during ? C.F : C.v;
  K.box(c, x, rail, w, Math.max(3, h * 0.07), p.col, p.lw, K.alpha(p.col, 0.12), 1);
  K.box(c, gate - supportW / 2, gateTop, supportW, rail - gateTop, p.col, p.lw, K.alpha(p.col, 0.12), 1);
  K.box(c, gate - footW / 2, gateTop, footW, h * 0.14, p.col, p.lw, K.alpha(p.col, 0.14), 2);
  K.box(c, cartX - cartW / 2, rail - cartHeight, cartW, cartHeight, p.col, p.lw, K.alpha(C.gas, 0.19), 2);
  K.box(c, front - flagW, shadeY, flagW, flagH, C.a, p.lw, K.alpha(C.a, 0.31), 1);
  K.circ(c, gate, beamY, Math.min(3.7, h * 0.1), light, 1.5, state.during ? null : light);
  if (state.during) K.line(c, gate - 2, beamY + 2, gate + 2, beamY - 2, light, 1.2);
  const status = state.during ? '遮光 · 计时' : after ? '通光 · 计时完成' : '通光 · 等待遮光';
  const statusX = gate < x + w * 0.54 ? x + w : x;
  note(c, status, statusX, y, w * 0.45, h * 0.14, light, p.fs * 0.86, statusX === x ? 'left' : 'right');
  const measureY = shadeY - h * 0.07;
  K.line(c, front - flagW, measureY, front, measureY, C.a, 1);
  K.line(c, front - flagW, measureY - 2, front - flagW, measureY + 2, C.a, 1);
  K.line(c, front, measureY - 2, front, measureY + 2, C.a, 1);
  math(c, [{ symbol: 'd' }], cartX, measureY - h * 0.17, flagW, h * 0.15, C.a, p.fs * 0.88, 'center');
}

function drawGate(c, o, GH) {
  const b = GH.box(o);
  if (b.w < 125 || b.h < 85) return;
  const p = panel(c, b, o);
  const width = number(o, 'qGateLabWidth') / 100;
  const interval = number(o, 'qGateLabInterval') / 1000;
  const model = K.photogateLab(width, interval, number(o, 'qGateLabA'));
  const elapsed = K.mod(Math.max(0, K.t(o)), 4.2);
  const crossing = (K.v(o, 'qGateLabMode') === 2 ? 1.48 : K.clamp(elapsed / 1.2 - 0.6, -0.6, 1.7)) * interval;
  const state = model.at(crossing);
  const show = K.v(o, 'qGateLabAnswers');
  const titleH = p.fs * 1.18;
  const apparatus = p.h * (show ? 0.38 : 0.49);
  const top = p.y + titleH + 2;
  const titleWidth = Math.min(p.fs * 6.4, p.w * 0.31);
  note(c, '光电门测速', p.x, p.y, titleWidth, titleH, p.col, p.fs);
  math(c, [...quantity('d', width * 100, 'cm', 1), '   ', ...quantity({ symbol: 'Δt', sub: '设定' }, interval * 1000, 'ms', 0)],
    p.x + titleWidth + 3, p.y, p.w - titleWidth - 3, titleH, p.col, p.fs);
  drawGateApparatus(c, p, p.x, top, p.w, apparatus, width, state, crossing >= interval);
  const readingY = top + apparatus + 2;
  const row = Math.min(titleH, (p.y + p.h - readingY) * 0.21);
  const clock = quantity({ symbol: 't', sub: '遮' }, state.shadeTime * 1000, 'ms', 1);
  math(c, clock, p.x, readingY, p.w * 0.48, row, C.a, p.fs * 0.9);
  if (p.w >= 210) note(c, '向右为正 · 导轨和遮光片示意', p.x + p.w, readingY, p.w * 0.54, row, p.col, p.fs * 0.78, 'right');
  if (!show) return;
  const y = readingY + row + 2;
  const formulaH = Math.min((p.y + p.h - y) * 0.51, p.fs * 2.13);
  const average = { symbol: 'v', sub: '平均' };
  const formula = [average, ' = ', ...ratio([{ symbol: 'd' }], [{ symbol: 'Δt' }], formulaH < p.fs * 1.65)];
  if (crossing >= interval) formula.push(' = ' + K.formatQuantity(model.average, speedUnit, 3));
  const compare = p.w >= 322;
  math(c, formula, p.x, y, p.w * (compare ? 0.58 : 1), formulaH, C.v, p.fs);
  if (compare && crossing >= interval) math(c, quantity({ symbol: 'v', sub: '过门中心' }, model.centerSpeed, speedUnit, 3),
    p.x + p.w, y + formulaH * 0.28, p.w * 0.38, formulaH * 0.7, p.col, p.fs * 0.88, 'right');
  const noteY = y + formulaH + 1;
  const lines = p.w >= 322 ? ['速度变化较小时，平均速度可近似光束处的瞬时速度'] : ['速度变化较小时', '平均速度可近似光束处的瞬时速度'];
  const lineH = Math.min(p.fs * 1.18, Math.max(3, (p.y + p.h - noteY) / lines.length));
  lines.forEach((line, index) => note(c, line, p.x, noteY + index * lineH, p.w, lineH, p.col, p.fs * 0.83));
}

const legacyGate = K.TB.shapes.pm_photogate;
if (legacyGate) {
  const legacyDraw = legacyGate.draw;
  Object.assign(legacyGate, {
    animatable: true,
    canAnimate: o => K.v(o, 'qGateLabMode') === 1,
    params: [...(legacyGate.params || []), 'qGateLabMode', 'qGateLabWidth', 'qGateLabInterval', 'qGateLabA', 'qGateLabAnswers'],
    draw(c, o, GH) {
      const mode = K.v(o, 'qGateLabMode');
      if (mode === 1 || mode === 2) drawGate(c, o, GH);
      else legacyDraw.call(this, c, o, GH);
    }
  });
}

/* ---------- 落体机械能 ---------- */
K.sel('qFallLabModel', '落体模型', ['理想自由落体', '恒定阻力近似'], 0);
K.sel('qFallLabMotion', '显示', ['下落动画', '停点定格'], 0);
K.P('qFallLabHeight', { label: '释放点离地高度', min: 1, max: 8, step: 0.5, def: 4, unit: 'm' });
K.P('qFallLabMass', { label: '重物质量', min: 0.2, max: 3, step: 0.1, def: 0.5, unit: 'kg' });
K.P('qFallLabResistance', { label: '阻力占重力比例', min: 0, max: 60, step: 5, def: 25, unit: '%' });
K.P('qFallLabPause', { label: '停点（已下落高度比例）', min: 0, max: 100, step: 5, def: 100, unit: '%' });
K.tog('qFallLabAnswers', '显示能量关系', true);

K.fallEnergyLab = function (height, mass, resistance, pauseFraction) {
  const gravity = 9.8;
  const weight = mass * gravity;
  const drag = weight * resistance;
  const acceleration = gravity * (1 - resistance);
  const initialEnergy = weight * height;
  const pauseX = height * pauseFraction;
  const pauseTime = Math.sqrt(2 * pauseX / acceleration);
  function atPosition(x) {
    const v = Math.sqrt(2 * acceleration * x);
    return { x, v, kinetic: mass * v * v / 2, potential: weight * (height - x), loss: drag * x };
  }
  function at(t) {
    const stopped = t >= pauseTime;
    const x = stopped ? pauseX : motion(0, acceleration, Math.max(0, t)).x;
    return { ...atPosition(x), stopped };
  }
  return { height, weight, drag, initialEnergy, pauseX, pauseTime, at, atPosition };
};

const energies = [
  { key: 'kinetic', sub: 'k', palette: 'v' },
  { key: 'potential', sub: 'p', palette: 'B' },
  { key: 'loss', sub: '耗', palette: 'a' }
];
const fallDefinitions = [
  { symbol: 'E', sub: 'k' }, ' = ', { frac: [['1'], ['2']] }, { symbol: 'm' }, { symbol: 'v', sup: 2 }, '   ',
  { symbol: 'E', sub: 'p' }, ' = ', { symbol: 'mgh' }
];

function drawWeight(c, p, x, y, w, h, model, state) {
  const scaleX = x + w * 0.18;
  const ballX = x + w * 0.45;
  const radius = Math.min(w * 0.085, h * 0.089, 14);
  const top = y + radius + 1;
  const ground = y + h - radius * 0.26 - 2;
  const end = ground - radius;
  const Y = distance => top + (end - top) * distance / model.height;
  const ballY = Y(state.x);
  const pauseY = Y(model.pauseX);
  K.arrow(c, scaleX, top, scaleX, ground, p.col, 1, Math.min(6, radius));
  for (let i = 0; i <= 4; i++) {
    const tick = Y(i * model.height / 4);
    K.line(c, scaleX - 3, tick, scaleX + 3, tick, p.col, 1);
  }
  math(c, [{ symbol: 'x' }, '/m'], scaleX - 4, y, w * 0.23, p.fs, p.col, p.fs * 0.85, 'right');
  K.line(c, scaleX + 4, pauseY, x + w * 0.62, pauseY, K.alpha(C.a, 0.7), p.lw * 0.65, [3, 3]);
  K.line(c, ballX, top, ballX, end, K.alpha(p.col, 0.25), 1, [3, 3]);
  if (state.x > 0) K.line(c, ballX, top, ballX, ballY, K.alpha(C.v, 0.55), 1.3);
  K.circ(c, ballX, ballY, radius, p.col, p.lw, K.alpha(C.B, 0.36));
  K.hatch(c, x + w * 0.10, ground, x + w, ground, p.col, p.lw, Math.min(7, Math.max(3, radius)), 1);
  // The free-body diagram uses one scale and origin even when the ball reaches the ground.
  const forceX = x + w * 0.72, forceY = y + h * 0.48;
  const arrow = Math.min(h * 0.27, w * 0.24);
  K.arrow(c, forceX, forceY, forceX, forceY + arrow, C.F, p.lw, Math.min(7, arrow * 0.46));
  const dragArrow = model.drag / model.weight * arrow;
  if (dragArrow >= 0.5) K.arrow(c, forceX, forceY, forceX, forceY - dragArrow, C.a, p.lw, Math.min(6, dragArrow * 0.43));
  K.dot(c, forceX, forceY, Math.max(1.5, p.lw * 0.8), p.col);
  const labelX = forceX + 3, labelWidth = x + w - labelX, labelHeight = Math.min(p.fs, h * .19);
  math(c, [{ symbol: 'G' }], labelX, forceY + arrow - labelHeight / 2, labelWidth, labelHeight,
    C.F, labelHeight, 'left', true);
  if (dragArrow >= 0.5) math(c, [{ symbol: 'F', sub: '阻' }], labelX, forceY - dragArrow - labelHeight / 2,
    labelWidth, labelHeight, C.a, labelHeight, 'left', true);
  if (w >= 110) {
    const labelY = K.clamp(pauseY - p.fs * 0.95, y, ground - p.fs);
    note(c, '停点', ballX - 4, labelY, w * 0.22, p.fs, C.a, p.fs * 0.8, 'right');
  }
}

function drawEnergyGraph(c, p, x, y, w, h, model, state) {
  const legend = Math.min(h * 0.3, p.fs * 1.24);
  const ymax = Math.ceil(model.initialEnergy);
  const A = plotAxes(c, p, x, y + legend, w, h - legend, model.height, ymax, 'x/m', 'E/J', 0, 1);
  for (let index = 0; index < energies.length; index++) {
    const { key, sub, palette } = energies[index];
    const value = distance => model.atPosition(distance)[key];
    const color = C[palette];
    K.plot(c, A, value, state.x, model.height, K.alpha(color, 0.65), 1.2, [4, 4], 20);
    if (state.x > 0) K.plot(c, A, value, 0, state.x, color, 1.6, null, 20);
    K.dot(c, A.X(state.x), A.Y(state[key]), 2, color);
    math(c, [{ symbol: 'E', sub }], x + w * (index + 0.5) / 3, y, w * 0.27, legend,
      color, p.fs * 0.85, 'center');
  }
  K.line(c, A.X(state.x), A.Y0, A.X(state.x), A.Y1, K.alpha(p.col, 0.48), 1, [3, 3]);
}

K.reg({
  key: 'pm_fall_energy', cat: 'mech', label: '落体机械能实验', animatable: true,
  canAnimate: o => K.v(o, 'qFallLabMotion') !== 1,
  params: ['qFallLabMotion', 'qFallLabModel', 'qFallLabHeight', 'qFallLabMass', 'qFallLabResistance', 'qFallLabPause', 'qFallLabAnswers'],
  icon: '<path d="M4 4v16h17M7 19h12m-11 2 2-2m2 2 2-2m2 2 2-2M16 6v7m-2-2 2 2 2-2"/><circle cx="10" cy="7" r="2.3"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    if (b.w < 125 || b.h < 100) return;
    const p = panel(c, b, o);
    const resistive = K.v(o, 'qFallLabModel') === 1;
    const resistance = resistive ? number(o, 'qFallLabResistance') / 100 : 0;
    const h = number(o, 'qFallLabHeight');
    const model = K.fallEnergyLab(h, number(o, 'qFallLabMass'), resistance, number(o, 'qFallLabPause') / 100);
    const state = model.at(K.v(o, 'qFallLabMotion') === 1 ? model.pauseTime : Math.max(0, K.t(o)) / 4);
    const show = K.v(o, 'qFallLabAnswers');
    const titleH = p.fs * 1.16;
    const title = resistive ? '↓ 为正 · 恒定向上阻力' : '↓ 为正 · 忽略空气阻力';
    const titleWidth = Math.min(p.fs * 8.1, p.w * 0.42);
    note(c, '落体机械能实验', p.x, p.y, titleWidth, titleH, p.col, p.fs);
    const conditionsW = state.stopped && p.w >= 245 ? p.w * 0.38 : p.w - titleWidth - 3;
    note(c, title, p.x + titleWidth + 3, p.y, conditionsW, titleH, p.col, p.fs * 0.87);
    if (state.stopped && p.w >= 245) note(c, '到达停点', p.x + p.w, p.y, p.w * 0.35, titleH, C.a, p.fs * 0.82, 'right');
    const top = p.y + titleH + 3;
    const mainH = p.h * (show ? 0.55 : 0.61);
    const apparatusW = p.w * 0.35;
    drawWeight(c, p, p.x + 2, top, apparatusW - 4, mainH - 2, model, state);
    drawEnergyGraph(c, p, p.x + apparatusW + 3, top, p.w - apparatusW - 3, mainH, model, state);
    const bottom = top + mainH + 3;
    const remaining = p.y + p.h - bottom;
    const withDefinitions = show && p.w >= 244 && remaining >= p.fs * 5.9;
    const row = Math.min(p.fs * 1.24, remaining / (show ? 3.4 : 2.45));
    math(c, [...quantity('x', state.x, 'm', 2), '   ', ...quantity('v', state.v, speedUnit, 2)],
      p.x, bottom, p.w, row, p.col, p.fs * 0.94);
    energies.forEach(({ key, sub, palette }, index) => {
      math(c, quantity({ symbol: 'E', sub }, state[key], 'J', 2), p.x + index * p.w / 3,
        bottom + row, p.w / 3 - 2, row, C[palette], p.fs * 0.93);
    });
    const finalY = bottom + row * 2 + 1;
    const definitionY = finalY + row + 1;
    const definitionH = p.fs * 1.58;
    const conditionY = withDefinitions ? definitionY + definitionH + 1 : finalY + (show ? row : 0);
    const conditionRow = Math.min(p.fs * 1.17, Math.max(0, p.y + p.h - conditionY));
    const conditions = p.w >= 248 ? '重物与地球 · 地面势能为零 · 虚线为预测' : '地面势能为零 · 虚线为预测';
    if (conditionRow > 3) note(c, conditions, p.x, conditionY, p.w, conditionRow, p.col, p.fs * 0.76);
    if (!show) return;
    const formula = [{ symbol: 'E', sub: 'k' }, ' + ', { symbol: 'E', sub: 'p' }];
    if (resistive) formula.push(' + ', { symbol: 'E', sub: '耗' });
    formula.push(' = ', { symbol: 'E', sub: 0 }, ' = ' + K.formatQuantity(model.initialEnergy, 'J', 2));
    if (withDefinitions) {
      math(c, formula, p.x, finalY, p.w, row, p.col, p.fs * 0.92);
      const definitions = fallDefinitions.slice();
      definitions.push('   ', { symbol: 'h' }, ' = ', { symbol: 'H' }, ' − ', { symbol: 'x' });
      if (resistive) definitions.push('   ', { symbol: 'E', sub: '耗' }, ' = ', { symbol: 'F', sub: '阻' }, { symbol: 'x' });
      math(c, definitions, p.x, definitionY, p.w, definitionH, p.col, p.fs * 0.88);
    } else if (p.w >= 244) {
      math(c, formula, p.x, finalY, p.w * 0.51, row, p.col, p.fs * 0.87);
      const compactDefinitions = [{ symbol: 'E', sub: 'k' }, ' = (1/2)', { symbol: 'm' }, { symbol: 'v', sup: 2 }, '   ',
        { symbol: 'E', sub: 'p' }, ' = ', { symbol: 'mgh' }];
      math(c, compactDefinitions, p.x + p.w * 0.54, finalY, p.w * 0.46, row, p.col, p.fs * 0.87);
    } else {
      math(c, formula, p.x, finalY, p.w, row, p.col, p.fs * 0.92);
    }
  }
});
})();

/* ===== 上游 pm_lab_electric.js ===== */
/* 电学实验：同一电路状态驱动读数、取点与拟合。 */
(function () {
'use strict';
const K = window.__PM;
const C = K.C;
const positions = [0, 0.2, 0.4, 0.6, 0.8, 1];
const specimens = [5, 12, 30, 75];
const sources = [[4.5, 1.5], [3, 0.5], [6, 2.5], [2, 3.5]];
const protection = 2;

K.sel('labElectricConnection', '电流表接法', ['外接', '内接'], 0);
K.sel('labElectricControl', '变阻器接法', ['限流', '分压'], 0);
K.sel('labElectricSpecimen', '待测电阻样品', ['甲', '乙', '丙', '丁', '自定义'], 1);
K.sel('labElectricCell', '待测电源样品', ['甲', '乙', '丙', '丁', '自定义'], 0);
K.sel('labElectricMeter', '电表模型', ['有限内阻', '理想'], 0);
K.sel('labElectricMotion', '取点方式', ['播放时逐点扫描', '手动选点'], 0);
K.tog('labElectricClosed', '闭合开关', true);
K.tog('labElectricTeacher', '教师模式 · 显示拟合与误差', false);
K.P('labElectricRA', { label: '电流表内阻', min: 0.1, max: 4, step: 0.1, def: 1.2, unit: 'Ω' });
K.P('labElectricRV', { label: '电压表内阻', min: 10, max: 200, step: 5, def: 30, unit: 'Ω' });
K.P('labElectricTrack', { label: '变阻器总阻值', min: 5, max: 60, step: 1, def: 25, unit: 'Ω' });
K.P('labElectricSample', { label: '起始测点／手动测点', min: 1, max: positions.length, step: 1, def: 3 });
K.P('labElectricRX', { label: '自定义电阻', min: 2, max: 90, step: 1, def: 18, unit: 'Ω' });
K.P('labElectricEMF', { label: '自定义电动势', min: 1, max: 9, step: 0.1, def: 5.5, unit: 'V' });
K.P('labElectricInternal', { label: '自定义电源内阻', min: 0.2, max: 6, step: 0.1, def: 2.2, unit: 'Ω' });

function bounded(o, key) {
  const definition = K.TB.paramDefs[key];
  const n = Number(K.v(o, key));
  return Number.isFinite(n) ? K.clamp(n, definition.min, definition.max) : definition.def;
}

function parallel(a, b) {
  if (a === 0 || b === 0) return 0;
  return 1 / (1 / a + 1 / b);
}

function meterResistances(ideal, ammeter, voltmeter) {
  return { ammeter: ideal ? 0 : ammeter, voltmeter: ideal ? Infinity : voltmeter };
}

function trackSegments(p, track) {
  return { leftResistance: p * track, rightResistance: (1 - p) * track };
}

function closedCircuitSource(emf, internal, load) {
  if (load === null || load === Infinity) return { sourceCurrent: 0, terminalVoltage: emf };
  if (load === 0 && internal === 0) return null;
  const sourceCurrent = emf / (internal + load);
  return { sourceCurrent, terminalVoltage: load * sourceCurrent };
}

// p 从固定端 a 到 b 递增。限流接 a、P；分压接 a、P、b。
function resistanceAt(p, config) {
  const { emf, internal, resistance, ammeter, voltmeter, track, inner, divider, closed } = config;
  const { leftResistance, rightResistance } = trackSegments(p, track);
  const voltageBranch = parallel(resistance + (inner ? ammeter : 0), voltmeter);
  const portResistance = voltageBranch + (inner ? 0 : ammeter);
  const effectiveLoad = divider ? parallel(rightResistance, portResistance) : portResistance;
  const { sourceCurrent, terminalVoltage } = closedCircuitSource(emf, internal, closed ? leftResistance + effectiveLoad : null);
  const portVoltage = sourceCurrent * effectiveLoad;
  const portCurrent = divider ? portVoltage / portResistance : sourceCurrent;
  const voltage = portCurrent * voltageBranch;
  const voltageCurrent = voltage / voltmeter;
  const resistanceCurrent = voltage / (resistance + (inner ? ammeter : 0));
  const current = inner ? resistanceCurrent : portCurrent;
  return {
    p, current, voltage, sourceCurrent, voltageCurrent, portCurrent, portVoltage,
    resistanceCurrent, leftCurrent: sourceCurrent, rightCurrent: divider ? sourceCurrent - portCurrent : 0,
    leftResistance, rightResistance, terminalVoltage
  };
}

// 外接时 V 跨源端而 A 仅在负载支路。内接时 A 读总电流，V 跨负载。
function sourceAt(p, config) {
  const { emf, internal, ammeter, voltmeter, track, inner, closed } = config;
  const { leftResistance } = trackSegments(p, track);
  const load = protection + leftResistance;
  const ammeterBranch = closed ? ammeter + load : Infinity;
  const loadParallel = parallel(load, voltmeter);
  const external = inner ? (closed ? ammeter + loadParallel : Infinity) : parallel(ammeterBranch, voltmeter);
  const { sourceCurrent, terminalVoltage } = closedCircuitSource(emf, internal, external);
  const voltage = inner ? sourceCurrent * loadParallel : terminalVoltage;
  const current = inner ? sourceCurrent : voltage / ammeterBranch;
  const loadCurrent = inner ? voltage / load : current;
  return {
    p, current, voltage, sourceCurrent, terminalVoltage, loadCurrent,
    voltageCurrent: voltage / voltmeter, leftResistance, load
  };
}

function fitLine(rows) {
  if (rows.length < 2 || rows.some(row => !Number.isFinite(row.current) || !Number.isFinite(row.voltage))) return null;
  const xs = rows.map(row => row.current);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (max - min <= Number.EPSILON * Math.max(Math.abs(min), Math.abs(max))) return null;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / rows.length;
  const meanY = rows.reduce((sum, row) => sum + row.voltage, 0) / rows.length;
  let covariance = 0;
  let variance = 0;
  for (const row of rows) {
    const dx = (row.current - meanX) / (max - min);
    covariance += dx * (row.voltage - meanY);
    variance += dx * dx;
  }
  const slope = covariance / variance / (max - min);
  const intercept = meanY - slope * meanX;
  return Number.isFinite(slope) && Number.isFinite(intercept) ? { slope, intercept, min, max } : null;
}

function canAnimate(o) {
  return K.v(o, 'labElectricMotion') !== 1 && Boolean(K.v(o, 'labElectricClosed'));
}

function frame(o, isSource) {
  const inner = K.v(o, 'labElectricConnection') === 1;
  const ideal = K.v(o, 'labElectricMeter') === 1;
  const divider = !isSource && K.v(o, 'labElectricControl') === 1;
  const teacher = Boolean(K.v(o, 'labElectricTeacher'));
  const closed = Boolean(K.v(o, 'labElectricClosed'));
  const track = bounded(o, 'labElectricTrack');
  const { ammeter, voltmeter } = meterResistances(ideal, bounded(o, 'labElectricRA'), bounded(o, 'labElectricRV'));
  const specimen = K.v(o, 'labElectricSpecimen');
  const cell = K.v(o, 'labElectricCell');
  const resistance = specimen === specimens.length ? bounded(o, 'labElectricRX') : (specimens[specimen] || specimens[1]);
  const chosenCell = cell === sources.length ? [bounded(o, 'labElectricEMF'), bounded(o, 'labElectricInternal')] :
    (sources[cell] || sources[0]);
  const [emf, internal] = isSource ? chosenCell : [6, 0.5];
  const config = { isSource, inner, ideal, divider, teacher, closed, track, ammeter, voltmeter, resistance, emf, internal };
  const start = Math.round(bounded(o, 'labElectricSample')) - 1;
  const t = K.t(o);
  const elapsed = canAnimate(o) && Number.isFinite(t) ? Math.floor(Math.max(0, t) / 1.2) : 0;
  const index = (start + elapsed) % positions.length;
  const solve = isSource ? sourceAt : resistanceAt;
  const rows = closed ? positions.map(p => solve(p, config)) : [];
  const point = rows[index] || solve(positions[index], config);
  return { config, index, rows, point, fit: fitLine(rows) };
}

K.electricLab = {
  resistanceAt, sourceAt, fitLine, frame, meterResistances, trackSegments, closedCircuitSource,
  drawing: { wire, symbol, meter, junction, rheostat, plotMaximum }
};

const math = (symbol, sub, variableSub) => ({ symbol, sub, variableSub });
const IA = math('I', 'A');
const IV = math('I', 'V');
const IS = math('I', '源');
const UV = math('U', 'V');
const US = math('U', '端');
const emf = math('ℰ');
const r = math('r');
const RA = math('R', 'A');
const RV = math('R', 'V');
const RX = math('R', 'x', true);
const fitR = math('R', '测');
const fitEmf = math('ℰ', '测');
const fitInternal = math('r', '测');
const fraction = (numerator, denominator) => ({ frac: [numerator, denominator] });
const quantity = K.formatQuantity;

function words(c, label, x, y, width, color, options = {}) {
  K.txt(c, label, x, y, { c: color, s: options.size || 16, b: options.bold, al: options.align || 'left',
    ui: true, maxWidth: width });
}

function label(c, tokens, x, y, width, height, color, options = {}) {
  return K.drawMathLabel(c, tokens, x, y, {
    c: color, s: options.size || 17, b: options.bold, al: options.align || 'left',
    middle: true, maxWidth: width, maxHeight: height, essential: options.essential
  });
}

function junction(c, x, y, color) {
  K.dot(c, x, y, 3.6, color);
}

function wire(c, points, color) {
  K.poly(c, points, color, 2.1);
}

function flow(c, current, x1, y1, x2, y2) {
  if (current > 1e-12) K.arrow(c, x1, y1, x2, y2, C.I, 2.5, 8);
}

// 复用白板原有电池、电阻、开关、电流表与电压表的形状。变阻器触点随 p 移动。
function symbol(c, GH, name, x, y, w, h, color, params = {}) {
  const shape = K.TB.shapes[name];
  if (!shape) return;
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 2.1;
  c.setLineDash([]);
  shape.draw(c, { x1: x - w / 2, y1: y - h / 2, x2: x + w / 2, y2: y + h / 2, color, ...params }, GH);
  c.restore();
}
K.electricLab.drawSymbol = symbol;

function meter(c, GH, name, x, y, left, right, color) {
  const radius = 15;
  wire(c, [[left, y], [x - radius, y]], color);
  symbol(c, GH, name, x, y, 2 * radius, 2 * radius, color);
  wire(c, [[x + radius, y], [right, y]], color);
}

function rheostat(c, left, right, y, p, divider, color) {
  const wiper = K.lerp(left, right, p);
  const bodyHeight = 15;
  K.box(c, left, y - bodyHeight / 2, right - left, bodyHeight, color, 2.1);
  wire(c, [[right, y], [right + 15, y]], color);
  if (!divider) K.circ(c, right + 18, y, 3, color, 1.7);
  label(c, [math('a')], left, y - 18, 17, 18, color, { align: 'center' });
  label(c, [math('b')], right, y - 18, 17, 18, color, { align: 'center' });
  K.arrow(c, wiper, y + 33, wiper, y + bodyHeight / 2, color, 2.1, 10);
  label(c, [math('P')], wiper + 12, y + 20, 19, 19, color);
  return wiper;
}

function supply(c, GH, state, color) {
  const { config, point } = state;
  const y = 43;
  if (config.isSource) wire(c, [[20, y], [120, y]], color);
  else {
    wire(c, [[20, y], [37, y]], color);
    symbol(c, GH, 'switch', 64, y, 54, 35, color, { switchOn: config.closed });
    wire(c, [[91, y], [120, y]], color);
    label(c, ['S'], 64, 15, 54, 19, color, { align: 'center' });
  }
  symbol(c, GH, 'battery', 151, y, 62, 49, color);
  label(c, ['＋ ', emf, ' −'], 151, 15, 66, 19, color, { align: 'center' });
  wire(c, [[182, y], [212, y]], color);
  symbol(c, GH, 'resistor', 242, y, 60, 14, color);
  label(c, [r], 242, 15, 49, 19, color, { align: 'center' });
  wire(c, [[272, y], [382, y]], color);
  flow(c, point.sourceCurrent, 347, y, 319, y);
}

function drawResistance(c, GH, state, color) {
  const { config, point } = state;
  supply(c, GH, state, color);
  wire(c, [[20, 43], [20, 103], [64, 103]], color);
  wire(c, [[382, 43], [382, 173], [361, 173]], color);
  const wiper = rheostat(c, 64, 174, 103, point.p, config.divider, color);
  if (config.divider) {
    wire(c, [[189, 103], [382, 103]], color);
    junction(c, 382, 103, color);
  }
  wire(c, [[wiper, 136], [wiper, 173]], color);
  meter(c, GH, 'ammeter', 226, 173, wiper, 278, color);
  symbol(c, GH, 'resistor', 316, 173, 76, 17, color);
  label(c, [RX], 316, 150, 76, 20, color, { align: 'center' });
  wire(c, [[354, 173], [361, 173]], color);
  const tap = config.inner ? 199 : 253;
  wire(c, [[tap, 173], [tap, 232]], color);
  wire(c, [[361, 173], [361, 232]], color);
  meter(c, GH, 'voltmeter', 304, 232, tap, 361, color);
  junction(c, tap, 173, color);
  junction(c, 361, 173, color);
  flow(c, point.sourceCurrent, 20, 62, 20, 87);
  flow(c, point.rightCurrent, 322, 103, 353, 103);
  flow(c, point.portCurrent, wiper, 143, wiper, 163);
  flow(c, point.resistanceCurrent, 259, 173, 280, 173);
  flow(c, point.voltageCurrent, tap, 188, tap, 211);
}

function drawSource(c, GH, state, color) {
  const { config, point } = state;
  supply(c, GH, state, color);
  wire(c, [[20, 43], [20, 127], [34, 127]], color);
  symbol(c, GH, 'switch', 57, 127, 46, 35, color, { switchOn: config.closed });
  label(c, ['S'], 57, 101, 46, 19, color, { align: 'center' });
  meter(c, GH, 'ammeter', 106, 127, 80, 151, color);
  symbol(c, GH, 'resistor', 180, 127, 58, 14, color);
  label(c, [quantity(protection, 'Ω', 0)], 180, 101, 65, 19, color, { align: 'center' });
  wire(c, [[209, 127], [237, 127]], color);
  const wiper = rheostat(c, 237, 337, 127, point.p, false, color);
  wire(c, [[wiper, 160], [wiper, 181], [382, 181]], color);
  wire(c, [[382, 43], [382, 232]], color);
  const tap = config.inner ? 137 : 20;
  wire(c, [[tap, 127], [tap, 232]], color);
  meter(c, GH, 'voltmeter', 245, 232, tap, 382, color);
  junction(c, tap, 127, color);
  junction(c, 382, 181, color);
  flow(c, point.sourceCurrent, 20, 66, 20, 92);
  flow(c, point.loadCurrent, 215, 127, 234, 127);
  flow(c, point.loadCurrent, 353, 181, 374, 181);
  flow(c, point.voltageCurrent, tap, 160, tap, 186);
}

function drawCircuit(c, GH, state, x, y, width, height, color) {
  const { config, point } = state;
  words(c, config.isSource ? '测电源电动势和内阻' : '伏安法测电阻', x + 14, y + 18, width * 0.48, color, { bold: true });
  const setting = config.isSource ? '限流' : (config.divider ? '分压' : '限流');
  words(c, (config.inner ? '内接' : '外接') + ' · ' + setting + ' · ' + (config.ideal ? '理想电表' : '有限内阻'),
    x + width - 14, y + 18, width * 0.65, color, { align: 'right', size: 15 });
  const scale = Math.min((width - 14) / 402, (height - 122) / 253);
  c.save();
  c.translate(x + (width - 402 * scale) / 2, y + 33 + (height - 122 - 253 * scale) / 2);
  c.scale(scale, scale);
  if (config.isSource) drawSource(c, GH, state, color);
  else drawResistance(c, GH, state, color);
  c.restore();
  const readY = y + height - 60;
  const middle = x + width / 2;
  const readout = [[IA, ' = ', quantity(point.current, 'A', 4)], [UV, ' = ', quantity(point.voltage, 'V', 4)]];
  K.line(c, x + 14, readY - 15, x + width - 14, readY - 15, K.alpha(color, 0.22), 1);
  label(c, readout[0], x + 14, readY, width * 0.45, 23, C.I, { size: 20, bold: true });
  label(c, readout[1], middle + 5, readY, width * 0.45, 23, C.B, { size: 20, bold: true });
  const apparatus = [math('P'), ' 沿 ', math('a'), ' → ', math('b'), ' · '];
  apparatus.push(...(config.divider ? ['三端接入'] : [math('b'), ' 端悬空']));
  label(c, apparatus, x + 14, readY + 26, width * 0.54, 17, color, { size: 15 });
  words(c, '箭头示电流方向', x + width - 14, readY + 26, width * 0.39, C.I, { align: 'right', size: 14 });
  const context = config.closed ? '导线与开关理想 · ' + (config.isSource ? '电池参数恒定' : '待测电阻恒温') :
    (config.isSource && !config.inner ? '开关断开 · 电压表仍跨电源端' : '开关断开 · 停止取点');
  words(c, context, x + 14, readY + 48, width - 28, color, { size: 14 });
}

function drawMeasurements(c, state, x, y, width, height, color) {
  const { config, rows, index } = state;
  words(c, '测量记录', x + 14, y + 18, width - 28, color, { bold: true });
  if (!rows.length) {
    words(c, '闭合开关后取点', x + 14, y + 53, width - 28, color);
    return;
  }
  const column = [0.13, 0.36, 0.61, 0.85].map(factor => x + width * factor);
  const rowHeight = Math.min(29, (height - 66) / 6);
  words(c, '测点', column[0], y + 49, width * 0.2, color, { align: 'center', size: 14 });
  [[math('p')], [IA, '/A'], [UV, '/V']].forEach((tokens, i) => {
    label(c, tokens, column[i + 1], y + 49, width * 0.22, 19, color, { align: 'center' });
  });
  K.line(c, x + 12, y + 62, x + width - 12, y + 62, K.alpha(color, 0.28), 1);
  rows.forEach((row, i) => {
    const yRow = y + 64 + (i + 0.5) * rowHeight;
    const selected = i === index;
    if (selected) K.box(c, x + 8, yRow - rowHeight / 2, width - 16, rowHeight, null, 0, K.alpha(C.I, 0.15));
    [String(i + 1), quantity(row.p * 100, '', 0) + '%', quantity(row.current, '', 4), quantity(row.voltage, '', 4)]
      .forEach((value, j) => label(c, [value], column[j], yRow, width * 0.23, rowHeight - 2, selected ? C.I : color,
        { align: 'center', bold: selected }));
  });
  if (config.teacher) words(c, '按未舍入读数拟合', x + 14, y + height - 12, width - 28, color, { size: 13 });
}

function plotMaximum(value) {
  const step = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / step;
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(tick => tick > scaled) || 15) * step;
}

function drawPlot(c, state, x, y, width, height, color) {
  const { config, point, rows, fit } = state;
  const fitVisible = config.teacher && fit;
  words(c, fitVisible ? '测点与拟合' : '伏安图', x + 14, y + 18, width - 28, color, { bold: true });
  const xmax = plotMaximum(Math.max(...rows.map(row => row.current), point.current, 0.01));
  const ymax = plotMaximum(Math.max(...rows.map(row => row.voltage), point.voltage, 0.2, fitVisible && config.isSource ? config.emf : 0));
  const A = K.axes(c, x + 4, y + 43, width - 10, height - 87, {
    xmin: 0, xmax, ymin: 0, ymax, xl: ' ', yl: ' ', col: color, fs: 17, O: false,
    pad: { l: 41, r: 36, t: 24, b: 27 }
  });
  label(c, [UV, '/V'], A.X0 + 7, A.Y0 - 15, 60, 18, color, { essential: true });
  label(c, [IA, '/A'], x + width - 12, A.oy + 29, 60, 18, color, { align: 'right', essential: true });
  const axisNumber = (value, maximum) => quantity(value, '', Math.max(1, 2 - Math.floor(Math.log10(maximum))));
  label(c, ['0'], A.ox - 5, A.oy + 12, 20, 18, color, { align: 'right', size: 13, essential: true });
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    const current = xmax * fraction;
    const voltage = ymax * fraction;
    const px = A.X(current);
    const py = A.Y(voltage);
    const grid = K.alpha(color, 0.22);
    K.line(c, px, A.Y1, px, A.Y0, grid, 0.8, [2, 5]);
    K.line(c, A.X0, py, A.X1, py, grid, 0.8, [2, 5]);
    K.line(c, px, A.oy - 3, px, A.oy + 3, color, 1);
    K.line(c, A.ox - 3, py, A.ox + 3, py, color, 1);
    label(c, [axisNumber(current, xmax)], px, A.oy + 13, 46, 17, color, { align: 'center', size: 13, essential: true });
    label(c, [axisNumber(voltage, ymax)], A.ox - 7, py, 35, 17, color, { align: 'right', size: 13, essential: true });
  }
  if (fitVisible) {
    if (config.isSource) {
      const end = Math.min(xmax, config.emf / config.internal);
      K.plot(c, A, current => config.emf - config.internal * current, 0, end, C.v, 1.8, [4, 4], 2);
      K.dot(c, A.ox, A.Y(config.emf), 3.3, C.v);
    }
    const fitted = current => fit.intercept + fit.slope * current;
    if (fit.min > 0) K.plot(c, A, fitted, 0, fit.min, C.I, 1.6, [5, 3], 2);
    K.plot(c, A, fitted, fit.min, fit.max, C.I, 1.9, null, 2);
    K.dot(c, A.ox, A.Y(Math.max(0, fit.intercept)), 3, C.I);
  }
  rows.forEach((row, i) => {
    if (i !== state.index) K.dot(c, A.X(row.current), A.Y(row.voltage), 3.3, C.B);
  });
  if (rows.length) {
    const px = A.X(point.current);
    const py = A.Y(point.voltage);
    K.circ(c, px, py, 8, C.I, 2);
    K.dot(c, px, py, 4, C.I);
    const onRight = px > A.X1 - 29;
    const numberY = py < A.Y0 + 15 ? py + 13 : py - 11;
    label(c, [String(state.index + 1)], px + (onRight ? -12 : 12), numberY, 20, 16, C.I,
      { align: onRight ? 'right' : 'left', bold: true });
  } else {
    words(c, '闭合开关后取点', (A.X0 + A.X1) / 2, (A.Y0 + A.Y1) / 2, A.X1 - A.X0 - 16, color,
      { align: 'center', size: 16 });
  }
  if (fitVisible) {
    const yKey = y + height - 21;
    K.line(c, x + 15, yKey, x + 31, yKey, C.I, 1.9);
    words(c, '读数拟合', x + 36, yKey, width * 0.25, C.I, { size: 14 });
    if (config.isSource) {
      const second = x + width * 0.32;
      K.line(c, second, yKey, second + 16, yKey, C.v, 1.9, [4, 4]);
      label(c, [US, '–', IS, ' 真值'], second + 21, yKey, width * 0.32, 18, C.v, { size: 15 });
    }
  }
}

function signed(value, unit, digits) {
  if (Math.abs(value) < 1e-12) return quantity(0, unit, digits);
  if (Math.abs(value) < 0.5 * 10 ** -digits) return (value > 0 ? '+' : '−') + '< ' + quantity(0.5 * 10 ** -digits, unit, digits + 1);
  return (value > 0 ? '+' : '') + quantity(value, unit, digits);
}

function teacherRows(state) {
  const { config, fit } = state;
  if (!fit) return [['至少需要两组电流不同的读数。']];
  if (!config.isSource) {
    const model = config.ideal ? [RX] : (config.inner ? [RX, ' + ', RA] : [fraction([RX, RV], [RX, ' + ', RV])]);
    const detail = config.ideal ? [IA, ' 读待测电阻电流；', UV, ' 等于待测电阻两端电压。'] : (config.inner ?
      [IA, ' 读待测支路电流；', UV, ' 包含电流表分压。'] : [IA, ' 含电压表分流；', UV, ' 跨待测电阻。']);
    return [
      [fitR, ' = ', fraction(['Δ', UV], ['Δ', IA]), ' = ', ...model, ' = ', quantity(fit.slope, 'Ω', 4)],
      [RX, ' = ', quantity(config.resistance, 'Ω', 4), '    测量值减真值  ', signed(fit.slope - config.resistance, 'Ω', 4),
        '（', signed((fit.slope / config.resistance - 1) * 100, '%', 2), '）'],
      detail
    ];
  }
  const theory = config.ideal ? [UV, ' = ', US, ' = ', emf, ' − ', r, IA] : (config.inner ?
    [UV, ' = ', US, ' − ', IA, RA, ' = ', emf, ' − (', r, ' + ', RA, ')', IA] :
    [UV, ' = ', emf, ' − ', r, '(', IA, ' + ', fraction([UV], [RV]), ') = ',
      fraction([emf, ' − ', r, IA], ['1 + ', r, '/', RV])]);
  return [
    theory,
    [fitEmf, '（截距）= ', quantity(fit.intercept, 'V', 4), '    斜率 = ', quantity(fit.slope, 'Ω', 4),
      '    ', fitInternal, '（斜率绝对值）= ', quantity(-fit.slope, 'Ω', 4)],
    [emf, ' = ', quantity(config.emf, 'V', 4), '    ', r, ' = ', quantity(config.internal, 'Ω', 4),
      '    测量值减真值  Δ', emf, ' = ', signed(fit.intercept - config.emf, 'V', 4),
      '，Δ', r, ' = ', signed(-fit.slope - config.internal, 'Ω', 4)],
    config.ideal ? [IA, ' = ', IS, '；', UV, ' = ', US, '。'] : (config.inner ?
      [IA, ' = ', IS, '    ', UV, ' 跨负载，扣去电流表分压。'] :
      [IA, ' 读负载支路；', IS, ' = ', IA, ' + ', IV, '    ', UV, ' 跨电源端。'])
  ];
}

function lesson(c, state, x, y, width, height, color) {
  const { config, point } = state;
  const teacher = config.teacher;
  const lessonTitle = teacher ? (config.isSource ? '电表读数与拟合参数' : '系统误差') :
    (config.isSource ? '用测点估计电动势和内阻' : '比较两种接法的电表读数');
  words(c, lessonTitle, x + 14, y + 17, width - 28, color, { bold: true });
  const lines = teacher ? teacherRows(state) : [[IA, ' 为电流表示数；', UV, ' 为电压表示数。']];
  if (teacher && config.divider && config.closed) {
    const left = [math('a'), math('P')];
    const right = [math('P'), math('b')];
    lines.push([math('R', left), ' = ', quantity(point.leftResistance, 'Ω', 1), '    ', math('R', right), ' = ',
      quantity(point.rightResistance, 'Ω', 1), '    ', math('I', left), ' = ', quantity(point.leftCurrent, 'A', 4),
      '    ', math('I', right), ' = ', quantity(point.rightCurrent, 'A', 4)]);
  }
  if (teacher && !config.ideal && height >= 140 && !config.divider) {
    lines.push([RA, ' = ', quantity(config.ammeter, 'Ω', 1), '    ', RV, ' = ', quantity(config.voltmeter, 'Ω', 0),
      '    ', IS, ' = ', quantity(point.sourceCurrent, 'A', 4), '    ', IV, ' = ', quantity(point.voltageCurrent, 'A', 4)]);
  }
  K.drawMathBlock(c, lines, x + 14, y + 32, { c: color, s: 18, maxWidth: width - 28, maxHeight: height - 41 });
}

function drawLab(c, o, GH, isSource) {
  const b = GH.box(o);
  if (b.w < 90 || b.h < 85) return;
  const state = frame(o, isSource);
  // 横图并排，接近方形或纵图时让电路占整行。
  const wide = b.w / b.h >= 1.55;
  const details = K.showDetails(o);
  const designW = wide ? (details ? 1120 : 820) : 680;
  const designH = details ? (wide ? (state.config.teacher ? 555 : 480) : (state.config.teacher ? 768 : 680))
    : (wide ? 389 : 601);
  const scale = Math.min(b.w / designW, b.h / designH);
  const color = o.color;
  c.save();
  c.translate(b.x1 + (b.w - designW * scale) / 2, b.y1 + (b.h - designH * scale) / 2);
  c.scale(scale, scale);
  const circuit = wide ? [0, 0, 414, 389] : [0, 0, 680, 327];
  const graph = wide ? [426, 0, 394, 389] : [0, 339, 369, 262];
  const table = wide ? [832, 0, 288, 389] : [381, 339, 299, 262];
  const lessonY = (wide ? 389 : 601) + 12;
  const panels = [circuit, graph];
  if (details) panels.push(table, [0, lessonY, designW, designH - lessonY]);
  for (const [x, y, width, height] of panels) {
    K.box(c, x + 1, y + 1, width - 2, height - 2, K.alpha(color, 0.38), 1.1, K.alpha(color, 0.027), 8);
  }
  drawCircuit(c, GH, state, ...circuit, color);
  drawPlot(c, state, ...graph, color);
  if (details) {
    drawMeasurements(c, state, ...table, color);
    lesson(c, state, 0, lessonY, designW, designH - lessonY, color);
  }
  c.restore();
}

const common = ['labElectricConnection', 'labElectricMeter', 'labElectricClosed', 'labElectricMotion', 'labElectricSample',
  'labElectricTeacher', 'labElectricTrack', 'labElectricRA', 'labElectricRV'];
K.reg({
  key: 'pm_lab_resistance', cat: 'em', label: '伏安法测电阻', animatable: true, canAnimate,
  icon: '<path d="M2 13h4m12 0h4M6 10h12v6H6zM3 13V5h18v8"/>',
  params: ['labElectricSpecimen', 'labElectricControl', ...common, 'labElectricRX'],
  draw(c, o, GH) { drawLab(c, o, GH, false); }
});
K.reg({
  key: 'pm_lab_emf', cat: 'em', label: '测电源电动势和内阻', animatable: true, canAnimate,
  icon: '<path d="M2 9h5m0-5v10m3-8v6m0-3h5m-1 6v7h8m-7-6 6 3"/>',
  params: ['labElectricCell', ...common, 'labElectricEMF', 'labElectricInternal'],
  draw(c, o, GH) { drawLab(c, o, GH, true); }
});
})();

/* ===== 上游 pm_dynamic_circuit.js ===== */
/* 节点、支路与直流电源；同一工作点驱动电路图、读数和功率曲线。 */
(function () {
'use strict';
const K = window.__PM;
const C = K.C;
const lab = K.electricLab;
const { wire, symbol, meter, junction, rheostat, plotMaximum } = lab.drawing;

K.sel('circuitTopology', '负载连接', ['串联', '并联', '混联'], 2);
K.sel('circuitAmmeter', '电流表位置', ['干路', 'R₁ 支路', 'R₂ 支路'], 0);
K.sel('circuitVoltmeter', '电压表位置', ['电源端口', '跨 R₁', '跨 R₂'], 1);
K.sel('circuitFaultTarget', '故障元件', ['R₁', 'R₂', '滑动变阻器'], 0);
K.sel('circuitFaultMode', '故障类型', ['正常', '断路', '短路'], 0);
K.tog('circuitClosed', '闭合开关', true);
K.tog('circuitSweep', '播放时扫描滑片', false);
K.tog('circuitShowEquivalent', '显示等效电路', true);
K.tog('circuitShowPower', '显示功率与效率曲线', true);
K.P('circuitWiper', { label: '滑片位置（从 a 到 b）', min: 0, max: 100, step: 1, def: 40, unit: '%' });
K.P('circuitEMF', { label: '电动势', min: 1, max: 24, step: 0.5, def: 9, unit: 'V' });
K.P('circuitInternal', { label: '电源内阻', min: 0, max: 12, step: 0.1, def: 2, unit: 'Ω' });
K.P('circuitR1', { label: '定值电阻 R₁', min: 0.2, max: 100, step: 0.2, def: 6, unit: 'Ω' });
K.P('circuitR2', { label: '定值电阻 R₂', min: 0.2, max: 100, step: 0.2, def: 12, unit: 'Ω' });

function bounded(o, key) {
  const { min, max, def } = K.TB.paramDefs[key];
  const value = Number(K.v(o, key));
  return Number.isFinite(value) ? K.clamp(value, min, max) : def;
}

function choice(o, key) {
  const { options, def } = K.TB.paramDefs[key];
  const value = K.v(o, key);
  return Number.isInteger(value) && value >= 0 && value < options.length ? value : Number(def);
}

function operatingPoint(emf, internal, load) {
  const source = lab.closedCircuitSource(emf, internal, load);
  if (!source) return null;
  const { sourceCurrent, terminalVoltage } = source;
  return {
    ...source, outputPower: terminalVoltage * sourceCurrent, internalPower: internal * sourceCurrent ** 2,
    sourcePower: emf * sourceCurrent, efficiency: emf > 0 && sourceCurrent > 0 ? terminalVoltage / emf : null
  };
}

function solveNetwork(emf, internal, edges) {
  // null 表示断路。0 Ω 支路先合并等势节点，实际零阻支路电流随后由节点电流守恒恢复。
  const nodes = [...new Set(['a', '0', ...edges.flatMap(edge => [edge.from, edge.to])])];
  const parents = new Map(nodes.map(node => [node, node]));
  const root = node => parents.get(node) === node ? node : root(parents.get(node));
  const zeroEdges = edges.filter(edge => edge.resistance === 0);
  for (const { from, to } of zeroEdges) parents.set(root(from), root(to));
  const ground = root('0');
  const live = root('a');
  const groups = [...new Set(nodes.map(root))];
  const graph = new Map(groups.map(node => [node, new Map()]));

  function join(from, to, conductance) {
    const total = (graph.get(from).get(to) || 0) + conductance;
    graph.get(from).set(to, total);
    graph.get(to).set(from, total);
  }

  for (const edge of edges) {
    const from = root(edge.from);
    const to = root(edge.to);
    if (edge.resistance > 0 && from !== to) join(from, to, 1 / edge.resistance);
  }

  function connectedTo(origin) {
    const visited = new Set([origin]);
    for (const node of visited) {
      for (const neighbor of graph.get(node).keys()) visited.add(neighbor);
    }
    return visited;
  }
  const grounded = connectedTo(ground);
  const energized = grounded.has(live) ? grounded : connectedTo(live);
  const reduction = [];
  let equivalent = null;
  if (live === ground) equivalent = 0;
  else if (grounded.has(live)) {
    // 逐节点作电导星形变换。只合并正电导，避免开路、强分流时相消。
    for (const node of grounded) {
      if (node === live || node === ground) continue;
      const neighbors = [...graph.get(node)];
      const total = neighbors.reduce((sum, [, g]) => sum + g, 0);
      const weights = neighbors.map(([other, g]) => [other, g / total]);
      reduction.push([node, weights]);
      for (let i = 0; i < neighbors.length; i++) {
        const [from, g] = neighbors[i];
        graph.get(from).delete(node);
        for (let j = i + 1; j < neighbors.length; j++) join(from, neighbors[j][0], g * weights[j][1]);
      }
    }
    equivalent = 1 / graph.get(live).get(ground);
  }
  const point = operatingPoint(emf, internal, equivalent);
  if (!point) return { status: 'ideal-short', equivalent, point: null, nodes: {}, branches: {} };

  // 浮置部分可有确定的元件压降，绝对电势仍以未知表示。
  const potentials = new Map();
  for (const node of grounded) potentials.set(node, 0);
  for (const node of energized) potentials.set(node, point.terminalVoltage);
  potentials.set(ground, 0);
  for (const [node, weights] of reduction.reverse()) {
    potentials.set(node, weights.reduce((sum, [other, weight]) => sum + potentials.get(other) * weight, 0));
  }
  const nodeVoltages = Object.fromEntries(nodes.map(node => [node, potentials.get(root(node)) ?? null]));
  const branches = {};
  const injected = Object.fromEntries(nodes.map(node => [node, 0]));
  injected.a = point.sourceCurrent;
  injected['0'] = -point.sourceCurrent;
  const floatingComponents = new Map();
  for (const node of groups) {
    if (potentials.has(node) || floatingComponents.has(node)) continue;
    for (const member of connectedTo(node)) floatingComponents.set(member, node);
  }
  for (const edge of edges) {
    const { id, from, to, resistance } = edge;
    const fromVoltage = nodeVoltages[from];
    const toVoltage = nodeVoltages[to];
    const fromComponent = floatingComponents.get(root(from));
    const sameFloating = fromComponent !== undefined && fromComponent === floatingComponents.get(root(to));
    const voltage = fromVoltage !== null && toVoltage !== null ? fromVoltage - toVoltage : (sameFloating ? 0 : null);
    const current = resistance === 0 ? null : (resistance === null || voltage === null ? 0 : voltage / resistance);
    branches[id] = { ...edge, voltage, current, power: resistance > 0 ? voltage * current : 0 };
    if (current !== null) {
      injected[from] -= current;
      injected[to] += current;
    }
  }
  for (const edge of zeroEdges) {
    const side = new Set([edge.from]);
    for (const node of side) {
      for (const other of zeroEdges) {
        if (other === edge) continue;
        if (other.from === node) side.add(other.to);
        if (other.to === node) side.add(other.from);
      }
    }
    // 理想导线构成环路时只能求总电流，环内支路分配由被忽略的微小电阻决定。
    if (!side.has(edge.to)) branches[edge.id].current = [...side].reduce((sum, node) => sum + injected[node], 0);
  }
  const status = equivalent === null ? 'open' : (equivalent === 0 ? 'short' : 'normal');
  return { status, equivalent, point, nodes: nodeVoltages, branches };
}

function network(config) {
  const { topology, aPosition, vPosition, faultMode, faultTarget, emf, internal, r1, r2, closed, p, track, ammeter, voltmeter } = config;
  const edges = [];
  const fault = faultMode ? ['R1', 'R2', 'Rp'][faultTarget] : null;
  function edge(id, from, to, resistance) {
    edges.push({ id, from, to, resistance: id === fault ? (faultMode === 1 ? null : 0) : resistance });
  }
  const series = topology === 0;
  const parallel = topology === 1;
  if (aPosition === 0) {
    edge('S', 'a', 's', closed ? 0 : null);
    edge('A', 's', 'b', ammeter);
  } else edge('S', 'a', 'b', closed ? 0 : null);
  edge('Rp', 'b', parallel ? '0' : 'p', lab.trackSegments(p, track).leftResistance);
  const feed = parallel ? 'b' : 'p';
  const r2Feed = series ? 'd' : feed;
  if (aPosition === 1) edge('A', feed, 'u', ammeter);
  if (aPosition === 2) edge('A', r2Feed, 'v', ammeter);
  edge('R1', aPosition === 1 ? 'u' : feed, series ? 'd' : '0', r1);
  edge('R2', aPosition === 2 ? 'v' : r2Feed, '0', r2);
  const measured = vPosition ? edges.find(edge => edge.id === ['R1', 'R2'][vPosition - 1]) : { from: 'a', to: '0' };
  edge('V', measured.from, measured.to, voltmeter === Infinity ? null : voltmeter);
  return { config, edges, fault, ...solveNetwork(emf, internal, edges) };
}

function frame(o) {
  const start = Math.round(bounded(o, 'circuitWiper')) / 100;
  const elapsed = K.t(o);
  const progress = K.v(o, 'circuitSweep') && Number.isFinite(elapsed) ? K.clamp(elapsed / 8, 0, 1) : 0;
  const p = progress <= 0.5 ? K.lerp(start, 1, 2 * progress) : 2 - 2 * progress;
  const meters = lab.meterResistances(K.v(o, 'labElectricMeter') === 1,
    bounded(o, 'labElectricRA'), bounded(o, 'labElectricRV'));
  return network({
    topology: choice(o, 'circuitTopology'), aPosition: choice(o, 'circuitAmmeter'), vPosition: choice(o, 'circuitVoltmeter'),
    faultTarget: choice(o, 'circuitFaultTarget'), faultMode: choice(o, 'circuitFaultMode'),
    emf: bounded(o, 'circuitEMF'), internal: Math.round(10 * bounded(o, 'circuitInternal')) / 10, r1: bounded(o, 'circuitR1'),
    r2: bounded(o, 'circuitR2'), track: bounded(o, 'labElectricTrack'), closed: Boolean(K.v(o, 'circuitClosed')),
    p, ...meters
  });
}

const M = (symbol, sub) => ({ symbol, sub });
const emfLabel = M('ℰ');
const resistanceLabel = { R1: M('R', '1'), R2: M('R', '2'), Rp: M('R', '滑') };
const outputLabel = M('P', '输出');
const equivalentLabel = M('R', '等');
const nodeToken = id => id === 'a' ? '＋' : id === '0' ? '0' : M(id === 'b' ? 'n' : id);
const measuredQuantity = (value, unit, digits = 3) => value === null ? '—' : K.formatQuantity(value, unit, digits);

function words(c, text, x, y, width, color, size = 16, options = {}) {
  K.txt(c, text, x, y, { c: color, s: size, al: 'left', ui: true, maxWidth: width, ...options });
}

function math(c, tokens, x, y, width, color, align = 'left', size = 17) {
  return K.drawMathLabel(c, tokens, x, y, {
    c: color, s: size, al: align, middle: true, maxWidth: width, maxHeight: size * 1.3
  });
}

function panel(c, x, y, width, height, color) {
  K.box(c, x + 1, y + 1, width - 2, height - 2, K.alpha(color, 0.35), 1.1, K.alpha(color, 0.025), 8);
}

function arrow(c, from, to, y, current, time) {
  if (current == null || Math.abs(current) < 1e-10 || to - from < 18) return;
  const phase = time > 0 ? (time * (0.35 + Math.min(0.3, 0.1 * Math.abs(current)))) % 1 : 0.5;
  const x = K.lerp(from + 8, to - 8, phase);
  const sign = Math.sign(current);
  K.arrow(c, x - 7 * sign, y, x + 7 * sign, y, C.I, 2.4, 7);
}

const trackSpan = { left: 244, right: 354 };
const trackY = topology => topology === 1 ? 175 : 126;

function layout(o, GH) {
  const b = GH.box(o);
  if (b.w < 90 || b.h < 90) return null;
  const showEq = Boolean(K.v(o, 'circuitShowEquivalent'));
  const showPower = Boolean(K.v(o, 'circuitShowPower'));
  const diagram = [0, 0, 544, 374];
  if (!K.showDetails(o)) {
    const scale = Math.min(b.w / diagram[2], b.h / diagram[3]);
    return { x: b.x1 + (b.w - diagram[2] * scale) / 2, y: b.y1 + (b.h - diagram[3] * scale) / 2, scale, diagram };
  }
  const wide = b.w / b.h >= 1.42;
  const readout = wide ? [556, 0, 444, 374] : [0, 386, 544, 307];
  const analysisY = readout[1] + readout[3] + 12;
  const showAnalysis = showEq || showPower;
  const width = wide ? 1000 : 544;
  const equivalent = showEq ? [0, analysisY, showPower && wide ? 423 : width, 214] : null;
  const power = showPower ? [showEq && wide ? 435 : 0, analysisY + (showEq && !wide ? 226 : 0),
    showEq && wide ? 565 : width, 214] : null;
  const height = showAnalysis ? (power || equivalent)[1] + (power || equivalent)[3] : analysisY - 12;
  const fullScale = Math.min(b.w / width, b.h / height);
  if (fullScale < 0.49) {
    const compactWidth = wide ? 762 : 544;
    const compactHeight = wide ? 351 : 442;
    const scale = Math.min(b.w / compactWidth, b.h / compactHeight);
    return { x: b.x1 + (b.w - compactWidth * scale) / 2, y: b.y1 + (b.h - compactHeight * scale) / 2,
      scale, diagram: [0, 0, 544, 351], readout: wide ? [552, 0, 210, 351] : [0, 358, 544, 84], compact: true };
  }
  const scale = fullScale;
  return { x: b.x1 + (b.w - width * scale) / 2, y: b.y1 + (b.h - height * scale) / 2,
    scale, diagram, readout, equivalent, power };
}

function handleLocation(o, GH, state = frame(o)) {
  const area = layout(o, GH);
  if (!area || state.fault === 'Rp') return null;
  return {
    x: area.x + area.scale * K.lerp(trackSpan.left, trackSpan.right, state.config.p),
    y: area.y + area.scale * (trackY(state.config.topology) + 33 + (area.compact ? -19 : 0))
  };
}

function dragHandle(o, pt, GH) {
  const area = layout(o, GH);
  const handle = handleLocation(o, GH);
  if (!area || !handle || Math.hypot(pt.x - handle.x, pt.y - handle.y) > Math.max(9, 12 * area.scale)) return null;
  return {
    key: 'circuitWiper', resetTime: true,
    valueAt(pos) {
      const x = (pos.x - area.x) / area.scale;
      return Math.round(100 * K.clamp((x - trackSpan.left) / (trackSpan.right - trackSpan.left), 0, 1));
    }
  };
}

function drawElement(c, GH, state, id, left, right, y, color, compact) {
  const fault = state.fault === id ? state.config.faultMode : 0;
  const x = (left + right) / 2;
  if (fault === 1) {
    wire(c, [[left, y], [x - 13, y]], color);
    wire(c, [[x + 13, y], [right, y]], color);
    for (const endpoint of [x - 9, x + 9]) K.circ(c, endpoint, y, 3.5, C.F, 2);
  } else if (fault === 2) wire(c, [[left, y], [right, y]], C.F);
  else symbol(c, GH, 'resistor', x, y, right - left, 15, color);
  const label = [resistanceLabel[id]];
  if (fault) label.push(fault === 1 ? ' 断路' : ' 短路');
  math(c, label, x, y - 17, right - left + 14, fault ? C.F : color, 'center', compact ? 23 : 17);
}

function drawDiagram(c, GH, state, color, time, compact) {
  const { config, branches, point } = state;
  const { topology, aPosition, vPosition, closed, p } = config;
  const series = topology === 0;
  const parallel = topology === 1;
  const left = 27;
  const right = 517;
  const feed = parallel ? 191 : 125;
  const shiftY = compact ? -19 : 0;
  const supplyY = 60 + shiftY;
  const mainY = 126 + shiftY;
  const upper = 242 + (compact ? -22 : 0);
  const lower = 320 + shiftY;
  const available = point ? point.sourceCurrent : null;
  if (!compact) {
    words(c, ['串联电路', '并联电路', '混联电路'][topology], 15, 20, 170, color, 18, { b: true });
    words(c, config.ammeter === 0 ? '理想电表' : '有限内阻电表', 526, 20, 190, color, 15, { al: 'right' });
  }
  wire(c, [[left, mainY], [left, supplyY], [224, supplyY]], color);
  symbol(c, GH, 'battery', 261, supplyY, 74, 53, color);
  wire(c, [[298, supplyY], [331, supplyY]], color);
  symbol(c, GH, 'resistor', 366, supplyY, 70, 15, color);
  wire(c, [[401, supplyY], [right, supplyY], [right, series ? upper : lower]], color);
  math(c, ['＋ ', emfLabel, ' −'], 261, supplyY - 21, 88, color, 'center', compact ? 21 : 17);
  math(c, [M('r')], 366, supplyY - 21, 53, color, 'center', compact ? 21 : 17);
  arrow(c, 409, 493, supplyY, available === null ? null : -available, time);
  if (!compact) {
    math(c, [nodeToken('a')], left + 6, supplyY - 12, 38, color);
    math(c, ['0'], right - 8, supplyY - 12, 32, color, 'right');
  }

  const switchLeft = 50;
  const switchRight = 104;
  wire(c, [[left, mainY], [switchLeft, mainY]], color);
  symbol(c, GH, 'switch', (switchLeft + switchRight) / 2, mainY, switchRight - switchLeft, 33, color, { switchOn: closed });
  math(c, [M('S')], (switchLeft + switchRight) / 2, mainY + 16, 48, color, 'center', compact ? 21 : 17);
  const trackIn = parallel ? feed : trackSpan.left;
  if (aPosition === 0) {
    meter(c, GH, 'ammeter', 146, mainY, switchRight, trackIn, color);
    if (!compact) math(c, [nodeToken('s')], 117, mainY + 14, 24, color, 'center', 14);
  } else wire(c, [[switchRight, mainY], [trackIn, mainY]], color);
  if (!parallel && !compact) math(c, [nodeToken('b')], 208, mainY - 14, 30, color, 'center', 14);

  const py = trackY(topology) + shiftY;
  if (parallel) wire(c, [[feed, mainY], [feed, lower]], color);
  const routeY = py + 33;
  const touch = K.lerp(trackSpan.left, trackSpan.right, p);
  if (parallel) wire(c, [[feed, py], [trackSpan.left, py]], color);
  if (state.fault === 'Rp') {
    drawElement(c, GH, state, 'Rp', trackSpan.left, trackSpan.right, py, color, compact);
    wire(c, [[trackSpan.right, py], [trackSpan.right + 10, py], [trackSpan.right + 10, routeY]], color);
  } else {
    rheostat(c, trackSpan.left, trackSpan.right, py, p, false, color);
    K.circ(c, touch, routeY, 6, C.B, 2, K.alpha(C.B, 0.2));
  }
  const routeStart = state.fault === 'Rp' ? trackSpan.right + 10 : touch;
  if (parallel) {
    wire(c, [[routeStart, routeY], [right, routeY]], color);
    junction(c, feed, py, color);
    junction(c, right, routeY, color);
    arrow(c, 387, 447, routeY, branches.Rp?.current, time);
  } else {
    wire(c, [[routeStart, routeY], [feed, routeY], [feed, series ? upper : lower]], color);
    arrow(c, feed + 14, routeStart - 15, routeY, branches.Rp?.current == null ? null : -branches.Rp.current, time);
  }
  if (!compact) math(c, [nodeToken(parallel ? 'b' : 'p')], feed - 9, parallel ? py : routeY, 30, color, 'right');

  function resistor(id, start, finish, y, placement, vTarget, RLeft, RRight) {
    if (aPosition === placement) {
      const ammeterX = start + (RLeft - start) / 2;
      meter(c, GH, 'ammeter', ammeterX, y, start, RLeft, color);
      if (!compact) math(c, [nodeToken(placement === 1 ? 'u' : 'v')], RLeft - 8, y - 15, 30, color, 'center', 14);
    } else wire(c, [[start, y], [RLeft, y]], color);
    drawElement(c, GH, state, id, RLeft, RRight, y, color, compact);
    wire(c, [[RRight, y], [finish, y]], color);
    arrow(c, RRight + 3, finish - 5, y, branches[id]?.current, time);
    if (vPosition !== vTarget) return;
    const meterY = series ? y + 53 : y + (id === 'R2' ? 30 : 34);
    wire(c, [[RLeft, y], [RLeft, meterY]], color);
    wire(c, [[RRight, y], [RRight, meterY]], color);
    meter(c, GH, 'voltmeter', (RLeft + RRight) / 2, meterY, RLeft, RRight, color);
    junction(c, RLeft, y, color);
    junction(c, RRight, y, color);
  }

  if (series) {
    resistor('R1', feed, 322, upper, 1, 1, 201, 285);
    resistor('R2', 322, right, upper, 2, 2, 392, 476);
    if (!compact) math(c, [M('d')], 322, upper - 15, 40, color, 'center');
  } else {
    resistor('R1', feed, right, upper, 1, 1, 260, 370);
    resistor('R2', feed, right, lower, 2, 2, 260, 370);
    junction(c, feed, upper, color);
    junction(c, right, upper, color);
  }
  if (vPosition === 0) {
    const y = 92 + shiftY;
    meter(c, GH, 'voltmeter', 400, y, left, right, color);
    junction(c, left, y, color);
    junction(c, right, y, color);
    arrow(c, 423, 498, y, branches.V?.current, time);
  }
  if (!compact) {
    words(c, state.fault === 'Rp' ? '变阻器故障' : '拖动蓝色滑片', 14, 353, 175, color, 14);
    words(c, '箭头示常规电流方向', 531, 353, 175, C.I, 14, { al: 'right' });
  }
}

function condition(state) {
  switch (state.status) {
    case 'ideal-short': return '理想电源端口短接，工作点无解';
    case 'short': return '端口短路 · 电流由电源内阻限制';
    case 'open': return '端口开路 · 无电流';
    default:
      if (Object.values(state.branches).some(branch => branch.current === null)) return '零阻回路的支路电流无法唯一确定';
      if (!state.config.closed) return '开关断开 · 电压表仍接通端口';
      return '以电源负端为零电势 · 稳恒直流';
  }
}

function drawReadout(c, state, width, height, color) {
  const { point, branches, nodes } = state;
  words(c, '电表与元件读数', 15, 19, width * 0.53, color, 18, { b: true });
  words(c, condition(state), 15, 43, width - 30, state.status === 'normal' ? color : C.F, 15);
  if (!point) {
    words(c, '提高电源内阻或解除短接，可恢复有限读数。', 15, 83, width - 30, color);
    return;
  }
  const readX = width / 2 + 7;
  math(c, [M('I', '源'), ' = ', measuredQuantity(point.sourceCurrent, 'A')], 15, 69, width * 0.45, C.I);
  math(c, [M('U', '端'), ' = ', measuredQuantity(point.terminalVoltage, 'V')], readX, 69, width * 0.45, C.B);
  math(c, [M('I', 'A'), ' = ', measuredQuantity(branches.A.current, 'A')], 15, 94, width * 0.45, C.I);
  math(c, [M('U', 'V'), ' = ', measuredQuantity(branches.V.voltage, 'V')], readX, 94, width * 0.45, C.B);
  const compact = height < 340;
  const rowHeight = compact ? 18 : 23;
  const cols = [0.2, 0.51, 0.81].map(ratio => ratio * width);
  K.line(c, 14, 109, width - 14, 109, K.alpha(color, 0.37), 1);
  for (const [i, text] of ['元件', '电流 / A', '压降 / V'].entries()) {
    words(c, text, cols[i], 122, width * 0.24, color, 15, { al: 'center' });
  }
  for (const [i, id] of ['S', 'A', 'Rp', 'R1', 'R2', 'V'].entries()) {
    const branch = branches[id];
    const y = 122 + (i + 1) * rowHeight;
    math(c, [resistanceLabel[id] || (id === 'S' ? M('S') : id)], cols[0], y, width * 0.23, state.fault === id ? C.F : color, 'center', 15);
    math(c, [measuredQuantity(branch.current, '')], cols[1], y, width * 0.24, C.I, 'center', 15);
    math(c, [measuredQuantity(branch.voltage, '')], cols[2], y, width * 0.24, C.B, 'center', 15);
  }
  const bottom = 135 + rowHeight * 6;
  K.line(c, 14, bottom, width - 14, bottom, K.alpha(color, 0.37), 1);
  const entries = Object.entries(nodes).filter(([id]) => id !== '0');
  entries.push(['0', 0]);
  const columns = compact ? 4 : 3;
  entries.forEach(([id, value], i) => {
    const x = 15 + (i % columns) * (width - 26) / columns;
    const y = bottom + 16 + Math.floor(i / columns) * (compact ? 18 : 21);
    math(c, [M('φ', [nodeToken(id)]), ' = ', measuredQuantity(value, 'V', 2)], x, y,
      (width - 29) / columns - 4, color, 'left', 14);
  });
  words(c, '— 表示数值未定义', 15, height - 11, width - 30, color, 12);
}

function drawCompactReadout(c, state, width, height, color) {
  const { point, branches } = state;
  const wide = height > 100;
  if (wide) words(c, '电表读数', 15, 29, width - 30, color, 26, { b: true });
  if (!point) {
    words(c, '理想电源短路', 15, wide ? 100 : 23, width - 30, C.F, 26, { b: true });
    words(c, '工作点无解', 15, wide ? 138 : 61, width - 30, color, 24);
    return;
  }
  const lines = [
    [M('I', 'A'), measuredQuantity(branches.A.current, 'A', 2), C.I],
    [M('U', 'V'), measuredQuantity(branches.V.voltage, 'V', 2), C.B],
    [M('I', '源'), measuredQuantity(point.sourceCurrent, 'A', 2), C.I],
    [M('U', '端'), measuredQuantity(point.terminalVoltage, 'V', 2), C.B]
  ];
  lines.forEach(([label, value, tone], i) => {
    const x = wide ? 15 : 16 + (i % 2) * width / 2;
    const y = wide ? 77 + 48 * i : 24 + 36 * Math.floor(i / 2);
    math(c, [label, ' = ', value], x, y, (wide ? width : width / 2) - 30, tone, 'left', 27);
  });
  if (wide && state.status !== 'normal') {
    words(c, state.status === 'open' ? '端口开路' : '端口短路', 15, height - 27, width - 30, C.F, 24);
  }
}

function drawEquivalent(c, GH, state, width, height, color) {
  words(c, '等效电路与功率收支', 15, 19, width - 30, color, 18, { b: true });
  const { point, equivalent, config } = state;
  const xMid = width / 2;
  const x1 = xMid - 103;
  const x2 = xMid + 103;
  const top = 49;
  const bottom = 86;
  wire(c, [[x1, top], [xMid - 55, top]], color);
  symbol(c, GH, 'battery', xMid - 29, top, 52, 39, color);
  math(c, [emfLabel], xMid - 29, top - 13, 35, color, 'center', 14);
  wire(c, [[xMid - 3, top], [xMid + 17, top]], color);
  symbol(c, GH, 'resistor', xMid + 48, top, 62, 13, color);
  math(c, [M('r')], xMid + 48, top - 13, 35, color, 'center', 14);
  wire(c, [[xMid + 79, top], [x2, top], [x2, bottom], [xMid + 32, bottom]], color);
  wire(c, [[xMid - 32, bottom], [x1, bottom], [x1, top]], color);
  if (equivalent === null) {
    wire(c, [[xMid - 32, bottom], [xMid - 9, bottom]], color);
    wire(c, [[xMid + 9, bottom], [xMid + 32, bottom]], color);
  } else if (equivalent === 0) wire(c, [[xMid - 32, bottom], [xMid + 32, bottom]], C.F);
  else symbol(c, GH, 'resistor', xMid, bottom, 64, 13, color);
  const load = equivalent === null ? ['开路'] : [equivalentLabel, ' = ', measuredQuantity(equivalent, 'Ω')];
  math(c, load, xMid, 106, width - 32, color, 'center', 16);
  if (!point) {
    words(c, '零内阻与零等效负载同时出现', 15, 143, width - 30, C.F);
    return;
  }
  const current = M('I', '源');
  const voltage = M('U', '端');
  K.drawMathBlock(c, [
    [emfLabel, ' = ', measuredQuantity(config.emf, 'V', 1), '      ', M('r'), ' = ', measuredQuantity(config.internal, 'Ω', 1),
      '      ', voltage, ' = ', emfLabel, ' − ', current, M('r')],
    [outputLabel, ' = ', voltage, current, ' = ', measuredQuantity(point.outputPower, 'W'), '     ', M('P', '内耗'), ' = ',
      { ...current, sup: 2 }, M('r'), ' = ', measuredQuantity(point.internalPower, 'W')],
    [M('P', '总'), ' = ', emfLabel, current, ' = ', measuredQuantity(point.sourcePower, 'W'), '     ', M('η'), ' = ',
      { frac: [[outputLabel], [emfLabel, current]] }, ' = ', measuredQuantity(point.efficiency === null ? null : point.efficiency * 100, '%', 1)]
  ], 15, 124, { c: color, s: 16, maxWidth: width - 30, maxHeight: height - 130 });
}

function drawPower(c, state, width, height, color) {
  const { config, point, equivalent } = state;
  words(c, '外电路等效电阻改变时的电源特性', 15, 19, width - 30, color, 17, { b: true });
  const { emf, internal } = config;
  const xmax = plotMaximum(Math.max(1, 5 * internal, equivalent || 0));
  const rmin = internal > 0 ? 0 : Math.min(equivalent || xmax, xmax / 24);
  const maxPower = operatingPoint(emf, internal, internal || rmin).outputPower;
  const powerMax = plotMaximum(maxPower);
  const bounds = width / 2 - 9;
  const plotHeight = height - 88;
  function plot(x, ymax, yTokens, project, tone) {
    const axes = K.axes(c, x, 53, bounds, plotHeight,
      { xmin: 0, xmax, ymin: 0, ymax, xl: ' ', yl: ' ', O: false, col: color, pad: { l: 43, r: 30, t: 11, b: 22 } });
    math(c, yTokens, x + 9, 42, bounds - 20, tone, 'left', 15);
    math(c, [equivalentLabel, '/Ω'], x + bounds - 7, axes.oy + 29, 67, color, 'right', 14);
    math(c, ['0'], axes.ox - 5, axes.oy + 13, 30, color, 'right', 13);
    math(c, [K.formatQuantity(xmax, '', xmax < 10 ? 1 : 0)], axes.X1, axes.oy + 13, 43, color, 'center', 13);
    math(c, [K.formatQuantity(ymax, '', ymax < 10 ? 1 : 0)], axes.ox - 7, axes.Y0, 38, color, 'right', 13);
    const curve = load => project(operatingPoint(emf, internal, load));
    const samples = internal > 0 ? [0, internal, Math.min(10 * internal, xmax), xmax] : [rmin, xmax];
    for (let i = 1; i < samples.length; i++) {
      if (samples[i - 1] < samples[i]) K.plot(c, axes, curve, samples[i - 1], samples[i], tone, 2.3, null, 48);
    }
    if (point && equivalent !== null) {
      const y = project(point);
      K.guide(c, axes, equivalent, y, K.alpha(color, 0.65), 1);
      K.dot(c, axes.X(equivalent), axes.Y(y), 4.2, tone);
    }
  }
  plot(3, powerMax, [outputLabel, '/W'], row => row.outputPower, C.I);
  plot(bounds + 8, 100, [M('η'), '/%'], row => row.efficiency * 100, C.v);
  const current = point && equivalent !== null ? '实心点为当前工作点' : '当前工作点未落在有限负载曲线上';
  words(c, current, 15, height - 31, width - 30, color, 14);
  const note = internal > 0 ? [outputLabel, ' 在 ', equivalentLabel, ' = ', M('r'), ' 时最大'] :
    [M('r'), ' = 0 时仅绘制有限正负载的区间'];
  math(c, note, 15, height - 12, width - 30, color, 'left', 14);
}

function draw(c, o, GH) {
  const area = layout(o, GH);
  if (!area) return;
  const state = frame(o);
  const color = o.color;
  const elapsed = K.t(o);
  const time = K.v(o, 'circuitSweep') && Number.isFinite(elapsed) ? K.clamp(elapsed, 0, 8) : 0;
  c.save();
  c.translate(area.x, area.y);
  c.scale(area.scale, area.scale);
  const sections = [
    [area.diagram, () => drawDiagram(c, GH, state, color, time, area.compact)],
    [area.readout, (w, h) => (area.compact ? drawCompactReadout : drawReadout)(c, state, w, h, color)],
    [area.equivalent, (w, h) => drawEquivalent(c, GH, state, w, h, color)],
    [area.power, (w, h) => drawPower(c, state, w, h, color)]
  ];
  for (const [rect, render] of sections) {
    if (!rect) continue;
    const [x, y, width, height] = rect;
    panel(c, x, y, width, height, color);
    c.save();
    c.translate(x, y);
    render(width, height);
    c.restore();
  }
  c.restore();
}

K.dynamicCircuit = { solveNetwork, network, frame, operatingPoint, wiperHandle: handleLocation };
K.reg({
  key: 'pm_dynamic_circuit', cat: 'em', label: '闭合电路与故障分析',
  icon: '<path d="M3 4h6m0-3v6m3-5v4m0-2h9v16H3V4m0 9h4m9 0h5M7 10h9v6H7z"/>',
  params: [
    'circuitTopology', 'circuitWiper', 'circuitSweep', 'circuitClosed', 'circuitFaultMode', 'circuitFaultTarget',
    'circuitAmmeter', 'circuitVoltmeter', 'circuitEMF', 'circuitInternal', 'circuitR1', 'circuitR2',
    'labElectricTrack', 'labElectricMeter', 'labElectricRA', 'labElectricRV', 'circuitShowEquivalent', 'circuitShowPower'
  ],
  animatable: true,
  canAnimate(o) { return Boolean(K.v(o, 'circuitSweep')); },
  animationTimeline() { return { duration: 8, events: [], pauseAtEvents: false }; },
  dragHandle,
  draw
});
})();

/* ===== 上游 pm_multistage.js ===== */
/* ===================== 多阶段直线运动 ===================== */
(function () {
'use strict';
const K = window.__PM;
const C = K.C;
const speedUnit = 'm·s⁻¹';
const accelUnit = 'm·s⁻²';
const timeEpsilon = 1e-8;
const zeroEpsilon = 1e-9;

function sample({ x, v, a }, t) {
  const delta = K.sampleConstantAcceleration(v, a, t);
  return { x: x + delta.x, v: delta.v, a };
}

function distance(v, a, t) {
  const endV = v + a * t;
  if ((v < 0 && endV > 0) || (v > 0 && endV < 0)) {
    const stop = -v / a;
    return (Math.abs(v) * stop + Math.abs(endV) * (t - stop)) / 2;
  }
  return (Math.abs(v) + Math.abs(endV)) * t / 2;
}

function roots(x, v, a) {
  if (a === 0) return v === 0 ? [] : [-x / v].filter(Number.isFinite);
  // 缩放系数，避免判别式上溢。先求绝对值较大的根，另一根由韦达定理得到。
  const scale = Math.max(Math.abs(x), Math.abs(v), Math.abs(a));
  const quadratic = a / scale / 2;
  const linear = v / scale;
  const constant = x / scale;
  const square = linear * linear;
  const product = 4 * quadratic * constant;
  const discriminant = square - product;
  const roundoff = 8 * Number.EPSILON * (square + Math.abs(product));
  if (discriminant < -roundoff) return [];
  if (Math.abs(discriminant) <= roundoff) return [-linear / (2 * quadratic)].filter(Number.isFinite);
  const q = -(linear + (linear < 0 ? -1 : 1) * Math.sqrt(discriminant)) / 2;
  return [q / quadratic, constant / q].filter(Number.isFinite).sort((first, second) => first - second);
}

(K.physics ||= {}).linearMotion = { sample, distance, roots, timeEpsilon };

function orderedTimes(times) {
  const ordered = [];
  for (const t of times.slice().sort((a, b) => a - b)) {
    if (ordered.length === 0 || t - ordered.at(-1) > timeEpsilon) ordered.push(t);
  }
  return ordered;
}

function segmentTime(local, start, end) {
  const length = end - start;
  if (!Number.isFinite(local)) return null;
  if (local < -timeEpsilon || local > length + timeEpsilon) return null;
  return K.clamp(start + local, start, end);
}

function trajectory(initial, duration, allowReverse) {
  const segments = [];
  const events = [];
  let time = 0;
  let state = { x: initial.x, v: initial.v, a: 0, s: 0, label: '' };
  let direction = Math.sign(initial.v);

  function append(end, a, label) {
    const dt = end - time;
    const start = { ...state, a, label };
    if (dt > 0) segments.push({ ...start, start: time, end });
    state = { ...sample(start, dt), s: state.s + distance(start.v, a, dt), label };
    time = end;
  }

  for (const { end: stageEnd, a, label } of initial.stages) {
    const end = K.clamp(stageEnd, time, duration);
    if (end <= time) continue;
    if (!direction) direction = Math.sign(a);
    const stageLabel = label || (a === 0 ? (state.v === 0 ? '静止' : '匀速')
      : state.v * a < 0 ? '匀减速' : '匀变速');
    if (!allowReverse && state.v === 0 && a * direction < 0) {
      append(end, 0, '停车');
      continue;
    }
    if (time > 0) events.push({ t: time, label: '进入' + stageLabel });
    const stop = a !== 0 && state.v * a < 0 ? -state.v / a : null;
    if (!allowReverse && stop !== null && stop <= end - time) {
      const stopAt = time + stop;
      append(stopAt, a, stageLabel);
      state.v = 0;
      append(end, 0, '停车');
      events.push({ t: stopAt, label: '停车' });
    } else {
      append(end, a, stageLabel);
    }
  }
  if (time < duration) append(duration, 0, state.v === 0 ? '静止' : '匀速');

  function at(elapsed) {
    const t = K.clamp(elapsed, 0, duration);
    const segment = segments.find(part => t < part.end);
    if (!segment) return { ...state, dx: state.x - initial.x };
    const dt = t - segment.start;
    const current = sample(segment, dt);
    return { ...current, s: segment.s + distance(segment.v, segment.a, dt), dx: current.x - initial.x, label: segment.label };
  }

  // 各段内速度为零的时刻也用于位置值域。速度在分段交界连续。
  const extrema = [0, duration, ...segments.map(part => part.start)];
  for (const { start, end, v, a } of segments) {
    if (a === 0 || v === 0) continue;
    const t = segmentTime(-v / a, start, end);
    if (t !== null) extrema.push(t);
  }
  if (allowReverse) {
    const times = orderedTimes(extrema);
    let previousDirection = 0;
    for (let i = 0; i < times.length - 1; i++) {
      const t = times[i];
      const nextDirection = Math.sign(at((times[i + 1] + t) / 2).v);
      if (previousDirection * nextDirection < 0) events.push({ t, label: '反向' });
      if (nextDirection) previousDirection = nextDirection;
    }
  }
  return { at, events, segments, extrema: orderedTimes(extrema) };
}

function mergeIntervals(intervals) {
  const merged = [];
  for (const [start, end] of intervals) {
    const previous = merged.at(-1);
    if (previous && start - previous[1] <= timeEpsilon) previous[1] = end;
    else merged.push([start, end]);
  }
  return merged;
}

function sameValue(a, b) {
  return Math.abs(a - b) <= 16 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

function solveMotion(initialA, initialB, duration, allowReverse = false) {
  const a = trajectory(initialA, duration, allowReverse);
  const b = trajectory(initialB, duration, allowReverse);
  function at(t) {
    const A = a.at(t);
    const B = b.at(t);
    const relativeX = B.x - A.x;
    return { A, B, relativeX, gap: Math.abs(relativeX), relativeV: B.v - A.v };
  }

  const boundaries = [...new Set([0, duration, ...a.segments.map(part => part.start), ...b.segments.map(part => part.start)])]
    .sort((first, second) => first - second);
  const meetings = [];
  const equalSpeeds = [];
  const samePositions = [];
  const sameVelocities = [];
  for (let i = 1; i < boundaries.length; i++) {
    const start = boundaries[i - 1];
    const end = boundaries[i];
    const { A, B, relativeX, relativeV } = at(start);
    const relativeA = B.a - A.a;
    if (sameValue(A.v, B.v) && relativeA === 0) {
      sameVelocities.push([start, end]);
      if (sameValue(A.x, B.x)) samePositions.push([start, end]);
    } else {
      if (relativeA !== 0) {
        const t = segmentTime(-relativeV / relativeA, start, end);
        if (t !== null) equalSpeeds.push(t);
      }
      for (const root of roots(relativeX, relativeV, relativeA)) {
        const t = segmentTime(root, start, end);
        if (t !== null) meetings.push(t);
      }
    }
  }

  function occurrences(times, intervals) {
    const spans = mergeIntervals(intervals);
    const points = orderedTimes(times).filter(t => !spans.some(([start, end]) => t >= start - timeEpsilon && t <= end + timeEpsilon));
    return { points, spans };
  }

  const meeting = occurrences(meetings, samePositions);
  const equalSpeed = occurrences(equalSpeeds, sameVelocities);
  const candidates = orderedTimes([...boundaries, ...meetings, ...equalSpeeds]);
  const gaps = candidates.map(t => ({ t, gap: at(t).gap }));
  const min = Math.min(...gaps.map(({ gap }) => gap));
  const max = Math.max(...gaps.map(({ gap }) => gap));
  const smallest = gaps.filter(({ gap }) => Math.abs(gap - min) <= zeroEpsilon);
  const largest = gaps.filter(({ gap }) => Math.abs(gap - max) <= zeroEpsilon);
  const local = gaps.flatMap(({ t, gap }, i) => {
    if (i === 0 || i === gaps.length - 1) return [];
    const left = at((t + gaps[i - 1].t) / 2).gap;
    const right = at((t + gaps[i + 1].t) / 2).gap;
    if (gap < Math.min(left, right) - zeroEpsilon) return [{ t, gap, label: '间距极小' }];
    if (gap > Math.max(left, right) + zeroEpsilon) return [{ t, gap, label: '间距极大' }];
    return [];
  });

  const entries = [];
  function add(t, label) {
    const entry = entries.find(event => Math.abs(event.t - t) <= timeEpsilon);
    if (!entry) entries.push({ t, labels: [label] });
    else if (!entry.labels.includes(label)) entry.labels.push(label);
  }
  for (const [group, label] of [[meeting, '相遇'], [equalSpeed, '共速']]) {
    for (const t of group.points) add(t, label);
    for (const [start, end] of group.spans) {
      add(start, '持续' + label);
      if (end < duration) add(end, '结束' + label);
    }
  }
  for (const { t, gap, label } of local) {
    if (gap > min + zeroEpsilon && gap < max - zeroEpsilon) add(t, label);
  }
  if (max - min > zeroEpsilon) {
    for (const { t } of smallest) add(t, '最小间距');
    for (const { t } of largest) add(t, '最大间距');
  }
  for (const [body, name] of [[a, '甲'], [b, '乙']]) {
    for (const { t, label } of body.events) add(t, name + label);
  }
  const events = entries.sort((first, second) => first.t - second.t)
    .map(({ t, labels }) => ({ t, label: labels.join(' · ') }));

  return { a, b, at, duration, boundaries, candidates, meeting, equalSpeed, local, smallest, largest, events };
}

K.physics.solveMotion = solveMotion;

const sceneNames = ['匀速追匀加速', '匀速追匀减速', '反应与制动', '允许反向', '自定义'];
const presets = [
  { duration: 10, A: [0, 10, []], B: [16, 0, [{ end: 10, a: 2, label: '匀加速' }]] },
  { duration: 12, A: [0, 9, []], B: [10, 12, [{ end: 12, a: -2, label: '制动' }]] },
  { duration: 8, A: [0, 12, [{ end: 1.5, a: 0, label: '反应' }, { end: 8, a: -4, label: '制动' }]], B: [55, 0, []] },
  { duration: 8, A: [0, 6, [{ end: 8, a: -2, label: '恒加速度' }]], B: [4, 0, []] }
];

K.sel('qMotionScene', '运动情景', sceneNames, 0);
K.tog('qMotionPause', '关键时刻自动暂停', true);
K.tog('qMotionGuides', '辅助线与速度图面积', true);
K.tog('qMotionAnswers', '事件、间距极值与公式', true);
K.sel('qMotionGraph', '第三幅图像', ['间距–时间', '加速度–时间'], 0);
K.P('qMotionEnd', { label: '观察终点', min: 1, max: 18, step: 0.1, def: 10, unit: 's' });
K.tog('qMotionReverse', '允许物体反向', false);
for (const [body, label] of [['A', '甲'], ['B', '乙']]) {
  const key = 'qMotion' + body;
  K.P(key + 'X', { label: label + ' · 初位置', min: -60, max: 100, step: 0.5, def: body === 'A' ? 0 : 16, unit: 'm' });
  K.P(key + 'V', { label: label + ' · 初速度', min: -30, max: 30, step: 0.5, def: body === 'A' ? 10 : 0, unit: speedUnit });
  K.P(key + 'Acc1', { label: label + ' · 第一段加速度', min: -10, max: 10, step: 0.1, def: body === 'A' ? 0 : 2, unit: accelUnit });
  K.P(key + 'T1', { label: label + ' · 第一段结束时刻', min: 0, max: 18, step: 0.1, def: 3, unit: 's' });
  K.P(key + 'T2', { label: label + ' · 匀速段结束时刻', min: 0, max: 18, step: 0.1, def: 6, unit: 's' });
  K.P(key + 'Acc3', { label: label + ' · 第三段加速度', min: -10, max: 10, step: 0.1, def: body === 'A' ? 0 : -2, unit: accelUnit });
}

const displayParams = ['qMotionScene', 'qMotionPause', 'qMotionGuides', 'qMotionAnswers', 'qMotionGraph'];
const customParams = ['qMotionEnd', 'qMotionReverse', ...['A', 'B'].flatMap(body =>
  ['X', 'V', 'Acc1', 'T1', 'T2', 'Acc3'].map(suffix => 'qMotion' + body + suffix))];

function number(o, key) {
  const def = K.TB.paramDefs[key];
  const value = K.v(o, key);
  return K.clamp(Number.isFinite(value) ? value : def.def, def.min, def.max);
}

function sceneIndex(o) {
  const scene = K.v(o, 'qMotionScene');
  return Number.isInteger(scene) && scene >= 0 && scene < sceneNames.length ? scene : 0;
}

function customTrajectory(o, body, duration) {
  const key = 'qMotion' + body;
  const first = Math.min(number(o, key + 'T1'), duration);
  const second = K.clamp(number(o, key + 'T2'), first, duration);
  return {
    x: number(o, key + 'X'), v: number(o, key + 'V'),
    stages: [{ end: first, a: number(o, key + 'Acc1') }, { end: second, a: 0 },
      { end: duration, a: number(o, key + 'Acc3') }]
  };
}

function motionScene(o) {
  const scene = sceneIndex(o);
  const key = 'motion|' + (scene === 4 ? [scene, ...customParams.map(param => K.v(o, param))].join('|') : scene);
  return K.memo(o, key, () => {
    if (scene === 4) {
      const duration = number(o, 'qMotionEnd');
      return solveMotion(customTrajectory(o, 'A', duration), customTrajectory(o, 'B', duration), duration, !!K.v(o, 'qMotionReverse'));
    }
    const { duration, A, B } = presets[scene];
    const toTrajectory = ([x, v, stages]) => ({ x, v, stages });
    return solveMotion(toTrajectory(A), toTrajectory(B), duration, scene === 3);
  });
}

K.physics.motionScene = motionScene;

const graphAxes = { x: 'x/m', v: 'v/(m·s⁻¹)', a: 'a/(m·s⁻²)', gap: 'd/m' };

function math(c, tokens, x, y, w, h, color, fs, align, essential = false) {
  return K.drawMathLabel(c, tokens, x, y, { c: color, s: fs, maxWidth: w, maxHeight: h, al: align, essential });
}

function note(c, line, x, y, w, h, color, fs) {
  K.txt(c, line, x, y + h / 2, { c: color, s: Math.min(h * 0.86, fs), al: 'left', ui: true, maxWidth: w });
}

function value(symbol, amount, unit, digits = 1) {
  return [{ symbol }, ' = ' + K.formatQuantity(amount, unit, digits)];
}

function bounds(values) {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  if (max === min) return [0, 1];
  const ideal = Math.max(1e-4, (max - min) / 4);
  const power = 10 ** Math.floor(Math.log10(ideal));
  const step = ([1, 2, 5, 10].find(factor => factor * power >= ideal) || 10) * power;
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

function tickText(n) {
  const absolute = Math.abs(n);
  if (absolute && absolute < 0.1) return K.scientificQuantity(n, '', 2);
  return [K.formatQuantity(n, '', Number.isInteger(n) ? 0 : 1)];
}

function drawTracks(c, p, y, h, model, state) {
  const { x, w, fs, col } = p;
  const [lo, hi] = bounds([ ...model.a.extrema.map(t => model.a.at(t).x), ...model.b.extrema.map(t => model.b.at(t).x) ]);
  const offset = Math.min(w * 0.125, fs * 4.3);
  const first = x + offset;
  const last = x + w - offset;
  const atX = position => first + (position - lo) * (last - first) / (hi - lo);
  const speed = Math.max(1, ...[model.a, model.b].flatMap(path => path.extrema.map(t => Math.abs(path.at(t).v))));
  const accel = Math.max(1, ...[model.a, model.b].flatMap(path => path.segments.map(seg => Math.abs(seg.a))));
  const bodySize = Math.min(fs * 1.5, h * 0.26);
  const vectorWidth = offset - bodySize / 2 - 3;
  const origin = atX(0);
  const axisY = y + h * 0.75;
  const trackTop = y + h * 0.15;
  const trackBottom = y + h * 0.52;
  for (const [body, name, color, track] of [[state.A, '甲', C.I, trackTop], [state.B, '乙', C.B, trackBottom]]) {
    const bodyX = atX(body.x);
    K.line(c, first, track, last, track, K.alpha(col, 0.29), 1);
    if (p.guides) K.line(c, bodyX, track, bodyX, axisY, K.alpha(color, 0.62), 1, [3, 3]);
    K.box(c, bodyX - bodySize / 2, track - bodySize / 2, bodySize, bodySize, color, 1,
      K.alpha(color, 0.2), bodySize / 4);
    K.txt(c, name, bodyX, track, { c: color, s: Math.min(bodySize * 0.84, fs), ui: true, essential: true });
    for (const [magnitude, scale, lineY, ink] of [[body.v, speed, track - bodySize * 0.22, C.v],
      [body.a, accel, track + bodySize * 0.22, C.a]]) {
      const length = vectorWidth * magnitude / scale;
      if (Math.abs(length) < 3) continue;
      const start = bodyX + Math.sign(length) * (bodySize / 2 + 2);
      K.arrow(c, start, lineY, start + length, lineY, ink, 1.2, Math.min(Math.abs(length) * 0.55, fs * 0.58));
    }
  }
  K.arrow(c, first - fs * 0.4, axisY, last + fs * 0.7, axisY, col, 1, fs * 0.5);
  const markerPositions = lo === 0 ? [[0, origin], [hi, last]] : [[lo, first], [0, origin], [hi, last]];
  const tickHeight = h * 0.24;
  for (const [n, at] of markerPositions) {
    if (n !== 0 && Math.abs(at - origin) < fs * 2) continue;
    K.line(c, at, axisY - 2, at, axisY + 2, col, 1);
    math(c, tickText(n), at, axisY + 2, fs * 3.25, tickHeight - 1, col, fs * 0.71, 'center', true);
  }
  math(c, [{ symbol: 'x' }, '/m'], x + w - 2, axisY - tickHeight * 0.55,
    offset, tickHeight, col, fs * 0.86, 'right', true);
}

function drawGraph(c, p, rect, mode, model, state, elapsed) {
  const { x, y, w, h } = rect;
  const fs = Math.min(p.fs * 0.84, w * 0.15, h * 0.22);
  const trackValues = ['x', 'v'].includes(mode) ? [model.a, model.b].flatMap(path => path.extrema.map(t => path.at(t)[mode]))
    : mode === 'a' ? [model.a, model.b].flatMap(path => path.segments.map(part => part.a))
      : model.largest.map(({ gap }) => gap);
  const [lo, hi] = bounds(trackValues);
  const loSigned = lo < 0;
  const left = fs * (loSigned ? 2.6 : 2.25);
  const right = fs * 1.94;
  const X = K.axes(c, x, y, w, h, {
    xmin: 0, xmax: model.duration, ymin: lo, ymax: hi, xl: 't/s', yl: graphAxes[mode],
    unitAxes: true, O: false, col: p.col, fs, lw: 1, pad: { l: left, r: right, t: fs * 1.7, b: fs * 1.68 }
  });

  const tick = (n, row) => {
    K.line(c, X.X0 - 2, row, X.X0 + 2, row, p.col, 1);
    math(c, tickText(n), X.X0 - 3, row - fs * 0.42, left - 3, fs * 0.94, p.col, fs * 0.75, 'right', true);
  };
  tick(lo, X.Y(lo));
  tick(hi, X.Y(hi));
  if (lo < 0 && hi > 0 && X.oy - X.Y0 > fs * 1.4 && X.Y1 - X.oy > fs * 1.4) tick(0, X.oy);
  if (X.oy < X.Y1 - 1) K.line(c, X.X0, X.Y1, X.X1, X.Y1, K.alpha(p.col, 0.22), 1, [2, 3]);
  K.line(c, X.X1, X.Y1 - 2, X.X1, X.Y1 + 2, p.col, 1);
  math(c, tickText(model.duration), X.X1 - fs * 0.35, X.Y1 + fs * 0.39, right * 1.6, fs * 0.95, p.col, fs * 0.75, 'center', true);

  if (p.guides) {
    if (p.answers) for (const { t } of model.events) {
      if (t > 0 && t < model.duration) K.line(c, X.X(t), X.Y0, X.X(t), X.Y1, K.alpha(p.col, 0.16), 1, [2, 3]);
    }
    if (mode === 'v' && elapsed > 0) K.fillUnder(c, X, t => model.a.at(t).v, 0, elapsed, K.alpha(C.I, 0.18));
    K.line(c, X.X(elapsed), X.Y0, X.X(elapsed), X.Y1, K.alpha(p.col, 0.5), 1, [3, 3]);
  }

  const inkA = C.I;
  const inkB = C.B;
  const lw = Math.min(p.lw, fs * 0.2);
  const mark = (t, n, ink, radius, hollow = false) => {
    if (hollow) K.circ(c, X.X(t), X.Y(n), radius, ink, 1, p.fill);
    else K.dot(c, X.X(t), X.Y(n), radius, ink);
  };
  if (mode === 'gap') {
    for (let i = 0; i < model.candidates.length - 1; i++) {
      K.plot(c, X, t => model.at(t).gap, model.candidates[i], model.candidates[i + 1], C.E, lw, null, 24);
    }
    if (p.answers) for (const { t, gap } of [...model.smallest, ...model.largest, ...model.local]) {
      mark(t, gap, C.E, fs * 0.22, true);
    }
    mark(elapsed, state.gap, C.E, fs * 0.3);
  } else {
    for (const [path, current, ink] of [[model.a, state.A, inkA], [model.b, state.B, inkB]]) {
      if (mode === 'a') {
        let previous;
        for (const part of path.segments) {
          K.line(c, X.X(part.start), X.Y(part.a), X.X(part.end), X.Y(part.a), ink, lw);
          if (previous && previous.a !== part.a) {
            mark(part.start, previous.a, ink, fs * 0.2, true);
            mark(part.start, part.a, ink, fs * 0.22);
          }
          previous = part;
        }
        const finalA = path.at(model.duration).a;
        if (previous && previous.a !== finalA) {
          mark(model.duration, previous.a, ink, fs * 0.2, true);
          mark(model.duration, finalA, ink, fs * 0.22);
        }
      } else for (const part of path.segments) {
        K.plot(c, X, t => path.at(t)[mode], part.start, part.end, ink, lw, null, mode === 'v' ? 1 : 28);
      }
      const glyphColor = mode === 'v' ? C.v : mode === 'a' ? C.a : ink;
      mark(elapsed, current[mode], glyphColor, fs * 0.3, ink === inkB);
    }
    if (p.answers && mode !== 'a') {
      const relevant = mode === 'x' ? model.meeting : model.equalSpeed;
      for (const t of relevant.points) mark(t, model.a.at(t)[mode], p.col, fs * 0.25, true);
    }
  }
}

function shownTimes(result) {
  if (!result.points.length && !result.spans.length) return '无';
  const show = t => K.formatQuantity(t, '', 2);
  const parts = [...result.points.map(t => [t, show(t)]), ...result.spans.map(([start, end]) => [start, show(start) + '–' + show(end)])];
  return parts.sort((a, b) => a[0] - b[0]).map(part => part[1]).join('、') + '\u202fs';
}

function drawAnalysis(c, p, y, h, model, elapsed, small) {
  const { x, w, fs, col } = p;
  const compact = w < 285;
  const current = model.events.find(event => Math.abs(event.t - elapsed) <= timeEpsilon);
  const event = current || model.events.find(event => event.t > elapsed);
  const eventInfo = event ? (current ? '关键帧 ' : '下一关键帧 ') + K.formatQuantity(event.t, 's', 2) + ' · ' + event.label : '观察结束';
  if (small) {
    note(c, eventInfo, x, y, w, h, col, fs);
    return;
  }
  const row = h / 3;
  const half = compact ? ['½'] : [{ frac: [['1'], ['2']] }];
  const dt = { symbol: 'Δt' };
  const formulas = [{ symbol: 'v' }, ' = ', { symbol: 'v', sub: 0 }, ' + ', { symbol: 'a' }, dt,
    '   ', { symbol: 'Δx' }, ' = ', { symbol: 'v', sub: 0 }, dt, ' + ', ...half, { symbol: 'a' }, { ...dt, sup: 2 }];
  const spanInfo = '全程间距 ' + K.formatQuantity(model.smallest[0].gap, '', 1) + '–' + K.formatQuantity(model.largest[0].gap, 'm', 1);
  const groupW = compact ? w * 0.48 : w * 0.5;
  note(c, '相遇 ' + shownTimes(model.meeting), x, y, groupW - 4, row, col, fs);
  note(c, '共速 ' + shownTimes(model.equalSpeed), x + groupW, y, w - groupW, row, col, fs);
  note(c, spanInfo, x, y + row, groupW - 4, row, col, fs);
  note(c, eventInfo, x + groupW, y + row, w - groupW, row, col, fs);
  const ruleWidth = compact ? w : w * 0.48;
  math(c, formulas, x, y + row * 2, ruleWidth, row, col, fs);
  if (!compact) note(c, '段内计时 · 速度图有符号面积为位移，绝对面积为路程',
    x + ruleWidth + 4, y + row * 2, w - ruleWidth - 4, row, col, fs * 0.87);
}

K.reg({
  key: 'pm_multistage', cat: 'graph', label: '多阶段运动·追及相遇', animatable: true,
  params: [...displayParams, ...customParams],
  showParam(o, key) { return displayParams.includes(key) || sceneIndex(o) === 4; },
  animationTimeline(o) {
    const { duration, events } = motionScene(o);
    return { duration, events, pauseAtEvents: !!K.v(o, 'qMotionPause') };
  },
  icon: '<path d="M3 3v17h18M5 17L19 5M5 13c6 0 10-2 14-9"/><circle cx="12" cy="11" r="1.5"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    if (b.w < 145 || b.h < 100) return;
    const col = o.color || '#e6edf7';
    const pad = K.clamp(K.S(b) * 0.027, 4, 12);
    const lw = K.lw(o, 0.51);
    const details = K.showDetails(o);
    const p = {
      x: b.x1 + pad, y: b.y1 + pad, w: b.w - pad * 2, h: b.h - pad * 2,
      col, lw, fs: K.clamp(K.S(b) * 0.051, 8, 17), fill: C.B === '#2256a5' ? '#f7f3ea' : '#1a2230',
      guides: !!K.v(o, 'qMotionGuides'), answers: details && !!K.v(o, 'qMotionAnswers')
    };
    K.box(c, b.x1 + lw / 2, b.y1 + lw / 2, b.w - lw, b.h - lw, K.alpha(col, 0.32), lw, K.alpha(col, 0.035), pad);
    const model = motionScene(o);
    const elapsed = K.clamp(K.t(o), 0, model.duration);
    const state = model.at(elapsed);
    const small = p.h < 145;
    const row = p.fs * 1.18;
    const headingW = p.w * 0.48;
    const scene = sceneIndex(o);
    note(c, sceneNames[scene] + ' · 向右为正', p.x, p.y, headingW - 3, row, col, p.w < 200 ? p.fs * 0.85 : p.fs);
    const heading = [...value('t', elapsed, 's', 2), '    ', ...value('d', state.gap, 'm')];
    math(c, heading, p.x + p.w, p.y, p.w - headingW, row, col, p.fs, 'right');
    const trackY = p.y + (details ? row + 2 : 0);
    const trackH = Math.min(p.h * (small ? 0.22 : 0.24), p.fs * 6);
    drawTracks(c, p, trackY, trackH, model, state);
    if (!small) {
      const values = [[C.v, { symbol: 'v', vector: true }], [C.a, { symbol: 'a', vector: true }]];
      for (const [i, [ink, token]] of values.entries()) {
        math(c, [token], p.x + p.w - p.fs * 0.75 - i * p.fs * 1.12, trackY - 1, p.fs * 0.98, p.fs * 1.45, ink, p.fs * 0.75, 'center');
      }
    }

    const readY = trackY + trackH + 2;
    const separate = p.w >= 460 || small;
    const infoW = separate ? p.w * 0.5 : p.w;
    const infoH = separate ? row : row * 2;
    for (const [index, body, name, ink] of [[0, state.A, '甲', C.I], [1, state.B, '乙', C.B]]) {
      const tiny = small && p.w < 210;
      const tokens = [name + ' ', ...value('x', body.x, 'm', tiny ? 0 : 1)];
      if (!tiny) tokens.push('   ', ...value('v', body.v, speedUnit));
      if (!small || p.w >= 460) tokens.push('   ', ...value('a', body.a, accelUnit), '   ', ...value('Δx', body.dx, 'm'), '   ', ...value('s', body.s, 'm'));
      math(c, tokens, p.x + (separate ? index * infoW : 0), readY + (separate ? 0 : index * row),
        infoW - 3, row, ink, p.fs);
    }

    const footerH = p.answers ? row * (small ? 1 : 3) : 0;
    const graphY = readY + (details ? infoH + 2 : 0);
    const graphH = p.y + p.h - graphY - footerH - 2;
    const third = K.v(o, 'qMotionGraph') === 1 ? 'a' : 'gap';
    const cols = p.w >= 365 || p.h < 195 ? 3 : 2;
    const h = cols === 3 ? graphH : graphH / 2;
    const graphW = p.w / cols;
    for (const [i, mode] of ['x', 'v', third].entries()) {
      const full = i === 2 && cols === 2;
      const rect = { x: p.x + (full ? 0 : i * graphW), y: graphY + (full ? h : 0), w: full ? p.w : graphW, h };
      drawGraph(c, p, rect, mode, model, state, elapsed);
    }
    if (p.answers) drawAnalysis(c, p, p.y + p.h - footerH, footerH, model, elapsed, small);
  }
});
})();

/* ===== 上游 pm_contact_motion.js ===== */
/* ===================== 板块与传送带 ===================== */
(function () {
'use strict';
const K = window.__PM;
const C = K.C;
const { sample, distance, roots, timeEpsilon } = K.physics.linearMotion;
const g = 10;
const horizon = 8;
const speedUnit = 'm·s⁻¹';
const accelUnit = 'm·s⁻²';

function simultaneous(first, second) {
  return Number.isFinite(first) && Number.isFinite(second) &&
    Math.abs(first - second) <= 32 * Number.EPSILON * Math.max(first, second);
}

// 质点从接触面的内部或边缘出发。切触以后仍在接触面内时继续计算。
function edgeTime(x, v, a, length) {
  let time = Infinity;
  let edge = null;
  for (const [position, outward] of [[0, -1], [length, 1]]) {
    if (x === position && (outward * v > 0 || v === 0 && outward * a > 0)) {
      return { time: 0, edge: position };
    }
    for (const root of roots(x - position, v, a)) {
      const speedAtEdge = v + a * root;
      const roundoff = 16 * Number.EPSILON * (Math.abs(v) + Math.abs(a * root));
      if (root > 0 && root < time && outward * speedAtEdge > roundoff) {
        time = root;
        edge = position;
      }
    }
  }
  return { time, edge };
}

function contactMotion(options, belt) {
  const { m, M, muS, muK, length, v0, angle, vB, force, secondForce, switchTime, start } = options;
  const slope = belt ? g * Math.sin(angle) : 0;
  const normal = m * (belt ? g * Math.cos(angle) : g);
  const limiting = muS * normal;
  const kinetic = muK * normal;
  const initialX = start * length;
  const initialEnergy = (m * v0 ** 2 + (belt ? 0 : M * vB ** 2)) / 2;
  const segments = [];
  const events = [];
  let t = 0;
  let terminalEdge = null;
  let state = {
    A: { x: initialX, v: v0 }, B: { x: 0, v: vB },
    relativeX: initialX, relativeDistance: 0, heat: 0, workA: 0, externalWork: 0
  };

  function addEvent(time, kind, label) {
    const previous = events.find(event => Math.abs(event.t - time) <= timeEpsilon);
    if (previous) {
      previous.kinds.push(kind);
      previous.label += ' · ' + label;
    } else {
      events.push({ t: time, kinds: [kind], label });
    }
  }

  function evolve(segment, dt) {
    const A = sample(segment.state.A, dt);
    const B = sample(segment.state.B, dt);
    const dxA = A.x - segment.state.A.x;
    const dxB = B.x - segment.state.B.x;
    const relV = segment.state.A.v - segment.state.B.v;
    const relA = A.a - B.a;
    const slideDistance = distance(relV, relA, dt);
    const relativeX = segment.state.relativeX + (relV + relA * dt / 2) * dt;
    return {
      A, B, relativeX, relativeDistance: segment.state.relativeDistance + slideDistance,
      heat: segment.state.heat + kinetic * slideDistance,
      workA: segment.state.workA + segment.friction * dxA,
      externalWork: segment.state.externalWork + (belt ? segment.friction : segment.force) * dxB
    };
  }

  // 每一段恒力解析积分。共速后重新求静摩擦，推力切换也重新判定接触状态。
  while (t < horizon) {
    const applied = belt ? 0 : t < switchTime ? force : secondForce;
    const required = belt ? m * slope : m * applied / (m + M);
    const relativeV = state.A.v - state.B.v;
    const tolerance = 16 * Number.EPSILON * Math.max(Math.abs(required), limiting);
    const sticking = relativeV === 0 && Math.abs(required) <= limiting + tolerance;
    const slipDirection = sticking ? 0 : Math.sign(relativeV || -required);
    const friction = sticking ? required : -kinetic * slipDirection;
    const aA = belt ? (sticking ? 0 : friction / m - slope) :
      sticking ? applied / (m + M) : friction / m;
    const aB = belt ? 0 : sticking ? aA : (applied - friction) / M;
    const previous = segments.at(-1);
    if (previous && !sticking && previous.slipDirection !== slipDirection) {
      addEvent(t, previous.sticking ? 'slip-start' : 'reverse-slip', previous.sticking ? '再次相对滑动' : '相对滑动反向');
    }
    if (previous && sticking && !previous.sticking) addEvent(t, 'stick', '保持相对静止');

    state.A.a = aA;
    state.B.a = aB;
    const relA = aA - aB;
    const match = relativeV * relA < 0 ? -relativeV / relA : Infinity;
    const change = !belt && t < switchTime && force !== secondForce ? switchTime - t : Infinity;
    const exit = belt ? edgeTime(state.A.x, state.A.v, aA, length) :
      edgeTime(state.relativeX, relativeV, relA, length);
    const dt = Math.min(horizon - t, match, change, exit.time);
    const hitEdge = simultaneous(dt, exit.time);
    const equalSpeed = simultaneous(dt, match);
    const forceChanges = simultaneous(dt, change);
    const end = forceChanges ? switchTime : t + dt;
    const segment = {
      start: t, end, state, force: applied, required, friction, sticking, slipDirection
    };
    segments.push(segment);
    for (const [body, id, acceleration] of [[state.A, '物块', aA], [state.B, '木板', aB]]) {
      const stop = body.v * acceleration < 0 ? -body.v / acceleration : Infinity;
      if (stop < dt) addEvent(t + stop, 'stop', id + '速度为零');
      else if (simultaneous(stop, dt)) addEvent(end, 'stop', id + '速度为零');
    }
    state = evolve(segment, dt);
    t = end;
    if (equalSpeed) {
      // 解析交点只存在舍入误差。板块以总动量确定相同速度。
      const common = belt ? state.B.v : (m * state.A.v + M * state.B.v) / (m + M);
      state.A.v = common;
      state.B.v = common;
      addEvent(t, 'match', '共速');
    }
    if (forceChanges) addEvent(t, 'force-change', '外力切换');
    if (hitEdge) {
      terminalEdge = exit.edge;
      if (belt) state.A.x = terminalEdge;
      else {
        state.relativeX = terminalEdge;
        state.A.x = state.B.x + terminalEdge;
      }
      addEvent(t, 'edge', terminalEdge === 0 ? (belt ? '到达低端' : '到达左板端') :
        (belt ? '到达高端' : '到达右板端'));
      break;
    }
    if (dt <= 0) break;
  }
  const end = t;
  const finalState = state;
  const lastSegment = segments.at(-1);
  events.sort((first, second) => first.t - second.t);

  function at(time) {
    const t = K.clamp(Number.isNaN(time) ? 0 : time, 0, end);
    const segment = t === end ? lastSegment : segments.find(entry => t < entry.end);
    const value = t === end ? finalState : evolve(segment, t - segment.start);
    const relativeDisplacement = value.relativeX - initialX;
    const energy = (m * value.A.v ** 2 + (belt ? 0 : M * value.B.v ** 2)) / 2 +
      m * slope * (value.A.x - initialX);
    return {
      ...value, t, relativeDisplacement, relativeVelocity: value.A.v - value.B.v,
      friction: segment.friction, sticking: segment.sticking, required: segment.required,
      slipDirection: segment.slipDirection, force: segment.force, deltaEnergy: energy - initialEnergy,
      endedAtEdge: terminalEdge !== null && t === end, surfacePosition: belt ? value.A.x : value.relativeX
    };
  }

  return { at, end, events, segments, normal, limiting, kinetic, ...options, belt };
}

K.physics.boardFriction = options => contactMotion({
  m: 1, M: 2, muS: 0.3, muK: 0.2, length: 5, v0: 2.5, vB: 0, angle: 0,
  force: 2, secondForce: 12, switchTime: 1.6, start: 0.25, ...options
}, false);

K.physics.beltFriction = options => contactMotion({
  m: 1, M: 0, muS: 0.3, muK: 0.2, length: 8, v0: 0, vB: 2, angle: 0,
  force: 0, secondForce: 0, switchTime: horizon, start: 0.15, ...options
}, true);

K.sel('qContactMode', '板块演示', ['静态板书', '动力学动画'], 0);
K.sel('qContactGraph', '联动图像', ['速度–时间', '相对位移、滑动路程'], 0);
K.tog('qContactForces', '显示受力图', true);
K.tog('qContactPause', '关键时刻自动暂停', true);
K.tog('qContactUseStep', '中途切换木板拉力', true);
K.P('qContactM', { label: '上方物块质量', min: 0.2, max: 8, step: 0.1, def: 1, unit: 'kg' });
K.P('qContactBoardM', { label: '下方木板质量', min: 0.2, max: 8, step: 0.1, def: 2, unit: 'kg' });
K.P('qContactV0', { label: '物块初速度（有符号）', min: -8, max: 8, step: 0.1, def: 0, unit: speedUnit });
K.P('qContactBoardV0', { label: '板上物块初速度（有符号）', min: -8, max: 8, step: 0.1, def: 2.5, unit: speedUnit });
K.P('qContactBoardVB0', { label: '木板初速度（有符号）', min: -8, max: 8, step: 0.1, def: 0, unit: speedUnit });
K.P('qContactForce', { label: '施于木板的拉力（有符号）', min: -50, max: 50, step: 0.1, def: 2, unit: 'N' });
K.P('qContactForce2', { label: '切换后的拉力（有符号）', min: -50, max: 50, step: 0.1, def: 12, unit: 'N' });
K.P('qContactStepTime', { label: '拉力切换时刻', min: 0, max: horizon, step: 0.05, def: 1.6, unit: 's' });
K.P('qContactBoardLength', { label: '木板长度', min: 0.5, max: 12, step: 0.1, def: 5, unit: 'm' });
K.P('qContactBeltLength', { label: '上表面长度', min: 0.5, max: 12, step: 0.1, def: 8, unit: 'm' });
K.P('qContactAngle', { label: '传送带倾角', min: 0, max: 60, step: 1, def: 0, unit: '°' });
Object.assign(K.TB.paramDefs.qBeltV, { label: '带速（负值向左）', min: -6, unit: speedUnit });

function number(o, key) {
  const definition = K.TB.paramDefs[key];
  const value = K.v(o, key);
  return K.clamp(Number.isFinite(value) ? value : definition.def, definition.min, definition.max);
}

function modelFor(o, belt) {
  const requestedMu = number(o, 'qMu');
  const muS = o.qMuS == null && belt ? requestedMu : number(o, 'qMuS');
  const inputs = { m: number(o, 'qContactM'), muS, muK: Math.min(muS, requestedMu), requestedMu };
  if (belt) {
    return K.physics.beltFriction({
      ...inputs, angle: number(o, 'qContactAngle') * Math.PI / 180, length: number(o, 'qContactBeltLength'),
      v0: number(o, 'qContactV0'), vB: number(o, 'qBeltV')
    });
  }
  const force = number(o, 'qContactForce');
  const useStep = K.v(o, 'qContactUseStep');
  return K.physics.boardFriction({
    ...inputs, M: number(o, 'qContactBoardM'), length: number(o, 'qContactBoardLength'),
    v0: number(o, 'qContactBoardV0'), vB: number(o, 'qContactBoardVB0'), start: number(o, 'plateShift'), force,
    secondForce: useStep ? number(o, 'qContactForce2') : force,
    switchTime: useStep ? number(o, 'qContactStepTime') : horizon
  });
}

function math(c, tokens, x, y, w, h, color, size, al, essential = false) {
  K.drawMathLabel(c, tokens, x, y, { c: color, s: size, al, maxWidth: w, maxHeight: h, essential });
}

function quantity(symbol, sub, value, unit, digits = 2) {
  return [{ symbol, sub }, ' = ' + K.formatQuantity(value, unit, digits)];
}

function trackBoard(c, p, model, state) {
  const { x, y, w, h, col, lw } = p;
  const boardStops = model.segments.flatMap(segment => {
    const body = segment.state.B;
    const end = segment.end - segment.start;
    const turn = body.a && -body.v / body.a;
    return [body.x, sample(body, end).x, sample(body, K.clamp(turn, 0, end)).x];
  });
  const left = Math.min(...boardStops);
  const right = Math.max(...boardStops) + model.length;
  const follow = right - left > 4 * model.length;
  const visibleLeft = follow ? state.B.x - model.length * 0.4 : left;
  const visibleWidth = follow ? model.length * 1.8 : right - left;
  const margin = Math.min(w * 0.11, h * 0.56);
  const scale = (w - 2 * margin) / visibleWidth;
  const boardX = x + margin + (state.B.x - visibleLeft) * scale;
  const bodyX = boardX + state.surfacePosition * scale;
  const bh = Math.min(h * 0.16, 26);
  const bX = Math.min(w * 0.11, h * 0.69, 48);
  const bH = Math.min(h * 0.34, bX * 0.85);
  const ground = y + h * 0.78;
  const pitch = Math.max(6, h * 0.24);
  const groundColor = K.alpha(col, 0.55);
  K.line(c, x, ground, x + w, ground, groundColor, lw);
  for (let at = x + K.mod(-visibleLeft * scale, pitch); at < x + w; at += pitch) {
    K.line(c, at, ground, Math.max(x, at - pitch * 0.4), ground + h * 0.15, groundColor, lw * 0.65);
  }
  K.box(c, boardX, ground - bh, model.length * scale, bh, col, lw, K.alpha(C.a, 0.17), bh * 0.14);
  K.block(c, bodyX, ground - bh - bH / 2, bX, bH, 0, col, lw);
  const mark = Math.min(2.8, bh * 0.25);
  K.dot(c, bodyX, ground - bh, mark, state.endedAtEdge ? C.F : C.v);
  math(c, [{ symbol: 'm' }], bodyX, ground - bh - bH * 0.83, bX * 0.85, bH * 0.66, col, p.fs, 'center');
  if (model.length * scale > p.fs * 1.7 && bh >= 7) {
    math(c, [{ symbol: 'M' }], boardX + model.length * scale / 2, ground - bh * 0.95,
      model.length * scale * 0.7, bh * 0.88, col, p.fs * 0.77, 'center');
  }
  drawTrackArrow(c, p, bodyX, ground - bh - bH - h * 0.11, state.A.v, state.B.v);
  if (follow && p.w > 190) {
    math(c, '木板随动视角', x + w - 1, y, w * 0.34, h * 0.19, col, p.fs * 0.73, 'right');
  }
}

function drawTrackArrow(c, p, x, y, speed, otherSpeed, angle = 0) {
  const reference = Math.max(1, Math.abs(speed), Math.abs(otherSpeed));
  const direction = Math.sign(speed);
  const dx = direction * Math.cos(angle);
  const dy = -direction * Math.sin(angle);
  const horizontal = dx > 0 ? p.x + p.w - x : x - p.x;
  const vertical = dy > 0 ? p.y + p.h - y - 1 : y - p.y - 1;
  const length = Math.max(0, Math.min(Math.min(p.h * 0.34, p.w * 0.28) * Math.abs(speed) / reference,
    horizontal / Math.max(0.01, Math.abs(dx)), dy === 0 ? Infinity : vertical / Math.abs(dy)));
  K.arrow(c, x, y, x + length * dx, y + length * dy, C.v, p.lw, Math.min(7, p.h * 0.19));
}

function trackBelt(c, p, model, state) {
  const { x, y, w, h, col, lw } = p;
  const { angle, length } = model;
  const dx = Math.cos(angle);
  const dy = -Math.sin(angle);
  const radius = Math.min(w * 0.04, h * 0.105);
  const blockH = radius * 1.75;
  const gap = radius * 0.8;
  const span = Math.min((w - 5 * radius) / dx, (h - 6 * radius) / Math.max(0.01, -dy));
  const scale = span / length;
  const startX = x + (w - span * dx) / 2;
  const startY = y + (h - span * dy) / 2;
  const sx = state.surfacePosition * scale;
  const bodyY = -blockH / 2;
  c.save();
  c.translate(startX, startY);
  c.rotate(-angle);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(span, 0);
  c.arc(span, radius, radius, -Math.PI / 2, Math.PI / 2);
  c.lineTo(0, 2 * radius);
  c.arc(0, radius, radius, Math.PI / 2, Math.PI * 1.5);
  c.closePath();
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.stroke();
  const pitch = Math.max(6, radius * 2.2);
  const offset = state.B.x * scale;
  for (const [side, beltY] of [[1, radius * 0.3], [-1, radius * 1.7]]) {
    for (let i = K.mod(side * offset, pitch); i < span; i += pitch) {
      K.line(c, i, beltY, Math.min(span, i + pitch * 0.42), beltY, K.alpha(col, 0.67), lw * 0.7);
    }
  }
  const turn = offset / radius;
  for (const wheelX of [0, span]) {
    K.circ(c, wheelX, radius, radius * 0.85, K.alpha(col, 0.65), lw * 0.7);
    K.line(c, wheelX - Math.cos(turn) * radius * 0.7, radius - Math.sin(turn) * radius * 0.7,
      wheelX + Math.cos(turn) * radius * 0.7, radius + Math.sin(turn) * radius * 0.7, col, lw * 0.6);
  }
  K.block(c, sx, bodyY, blockH * 1.23, blockH, 0, col, lw);
  K.dot(c, sx, 0, Math.min(2.8, radius * 0.33), state.endedAtEdge ? C.F : C.v);
  if (state.B.v !== 0) {
    const direction = Math.sign(state.B.v);
    const mid = span * 0.5;
    const arrow = Math.min(span * 0.2, radius * 3.2);
    K.arrow(c, mid - direction * arrow, radius, mid + direction * arrow, radius, C.v, lw, Math.min(7, radius));
  }
  c.restore();
  const above = -blockH - gap;
  drawTrackArrow(c, p, startX + sx * dx - above * dy, startY + sx * dy + above * dx, state.A.v, state.B.v, angle);
}

function forceVector(c, p, cx, cy, dx, dy, tokens, side) {
  const size = Math.hypot(dx, dy);
  if (size < 0.5) return;
  const tipX = cx + dx;
  const tipY = cy + dy;
  K.arrow(c, cx, cy, tipX, tipY, C.F, p.lw, Math.min(6, p.h * 0.17));
  const labelH = Math.min(Math.max(7.6, p.h * 0.24), p.fs * 0.98);
  const labelW = Math.min(p.w * 0.33, p.fs * 1.65);
  const vertical = Math.abs(dx) < Math.abs(dy);
  const labelX = K.clamp(tipX + (vertical ? side * labelW * 0.63 : 0),
    p.x + labelW / 2, p.x + p.w - labelW / 2);
  const labelY = K.clamp(tipY + (vertical ? -labelH / 2 : side < 0 ? -labelH * 1.16 : labelH * 0.18),
    p.y, p.y + p.h - labelH);
  math(c, tokens, labelX, labelY, labelW, labelH, C.F, p.fs * 0.88, 'center');
}

function forceDiagram(c, p, model, state) {
  const { x, y, w, h, fs, col, lw } = p;
  if (h < 26 || w < 46) return;
  const forceScale = Math.min(w * (model.belt ? 0.31 : 0.19), h * 0.28) /
    Math.max(model.normal, (model.belt ? model.m : model.M + model.m) * g,
      ...model.segments.map(segment => Math.max(Math.abs(segment.force), Math.abs(segment.friction))));
  const sub = state.sticking ? 's' : 'k';
  const f = { symbol: 'f', sub };
  const cy = y + h * 0.46;
  const cx = x + w * (model.belt ? 0.49 : 0.25);
  const tangent = state.friction * forceScale;
  const normal = model.normal * forceScale;
  const dx = Math.cos(model.angle);
  const dy = -Math.sin(model.angle);
  const wide = h >= 46;
  const pull = state.force * forceScale;
  const makePlot = (columnX, bodyX, label, angle, draw) => {
    const width = model.belt ? w : w / 2;
    const region = { x: columnX, y, w: width, h: h * 0.8, fs, lw };
    const block = Math.min(11, h * 0.17);
    K.block(c, bodyX, cy, block, block, angle, col, lw);
    const forces = draw();
    // Shorter collinear arrows are drawn last so their heads stay visible.
    forces.sort((a, b) => Math.hypot(b[0], b[1]) - Math.hypot(a[0], a[1]));
    for (const [dx, dy, label, side] of forces) forceVector(c, region, bodyX, cy, dx, dy, label, side);
    K.dot(c, bodyX, cy, Math.max(1.3, lw * 0.72), col);
    math(c, [{ symbol: label }], bodyX, y + h * 0.8, width * 0.68, h * 0.2, col, fs * 0.85, 'center');
  };
  makePlot(x, cx, 'm', -model.angle, () => [
    [tangent * dx, tangent * dy, [f], 1],
    ...(wide ? [[normal * dy, -normal * dx, [{ symbol: 'N' }], -1],
      [0, model.m * g * forceScale, [{ symbol: 'G' }], 1]] : [])
  ]);
  if (model.belt) return;
  const boardX = x + w * 0.75;
  makePlot(x + w / 2, boardX, 'M', 0, () => [
    [-tangent, 0, [{ symbol: 'f', sub, sup: '′' }], 1],
    [pull, 0, [{ symbol: 'F' }], -1],
    ...(wide ? [[0, -(model.M + model.m) * g * forceScale, [{ symbol: 'N', sub: '地' }], 1],
      [0, model.M * g * forceScale, [{ symbol: 'G' }], -1],
      [0, normal, [{ symbol: 'N', sup: '′' }], 1]] : [])
  ]);
}

function contactGraph(c, p, model, state, relative) {
  const { x, y, w, h, fs, col } = p;
  const cmp = model.belt ? '带' : '板';
  const data = relative ? [
    { id: [{ symbol: 'Δx', sub: '相对' }], value: s => s.relativeDisplacement, color: C.v },
    { id: [{ symbol: 's', sub: '滑' }], value: s => s.relativeDistance, color: C.a }
  ] : [
    { id: [{ symbol: 'v', sub: '块' }], value: s => s.A.v, color: C.v },
    { id: [{ symbol: 'v', sub: cmp }], value: s => s.B.v, color: C.B }
  ];
  const graphSize = Math.min(fs * 0.9, h * 0.235);
  const xmax = Math.max(0.05, model.end);
  const timeValues = [...new Set([0, ...model.segments.map(segment => segment.end)])];
  const values = data.flatMap(series => timeValues.map(time => series.value(model.at(time))));
  let ymin = Math.min(0, ...values);
  let ymax = Math.max(0, ...values);
  const padding = Math.max(0.3, (ymax - ymin) * 0.12);
  ymin -= padding;
  ymax += padding;
  const left = x + graphSize * 2.8;
  const axis = K.axes(c, x, y, w, h, {
    xmin: 0, xmax, ymin, ymax, xl: 't/s', yl: relative ? 'x/m' : 'v/(' + speedUnit + ')',
    unitAxes: true, O: false, col, lw: 1, fs: graphSize,
    pad: { l: left - x, r: graphSize * 2.8, t: graphSize * 1.28, b: graphSize * 1.14 }
  });
  const plotMax = Math.max(...values);
  const plotMin = Math.min(...values);
  const ticks = h >= 54 ? [...new Set([0, plotMin, plotMax])] : [0];
  for (const v of ticks) {
    const py = axis.Y(v);
    if (v !== 0 && Math.abs(py - axis.Y(0)) < graphSize * 1.18) continue;
    math(c, [K.formatQuantity(v, '', v === 0 ? 0 : 1)], left - 4, py - graphSize * 0.5,
      left - x - 4, graphSize, col, graphSize, 'right', true);
    if (v !== 0) K.line(c, left - 2, py, left + 2, py, col, 1);
  }
  for (const event of model.events) {
    if (event.t <= 0) continue;
    const px = axis.X(event.t);
    K.line(c, px, axis.Y0, px, axis.Y1, K.alpha(col, 0.23), 1, [2, 3]);
  }
  const px = axis.X(state.t);
  K.line(c, px, axis.Y0, px, axis.Y1, K.alpha(col, 0.72), 1, [3, 3]);
  for (const [i, series] of data.entries()) {
    for (const segment of model.segments) {
      if (segment.start === segment.end) continue;
      K.plot(c, axis, time => series.value(model.at(time)), segment.start, segment.end, series.color, 1.55,
        null, relative ? 14 : 1);
    }
    K.circ(c, px, axis.Y(series.value(state)), Math.min(h * 0.07, i ? 3.8 : 2.3), series.color, i ? 1.15 : 0,
      i ? null : series.color);
    const legendWidth = graphSize * (relative ? 4.8 : 3.3);
    math(c, series.id, x + w - 2 - i * legendWidth, y + 1,
      legendWidth - 1, graphSize * 1.28, series.color, graphSize, 'right', true);
  }
  if (h >= 54) {
    math(c, [K.formatQuantity(model.end, '', 2)], axis.X(model.end), y + h - graphSize,
      graphSize * 3.4, graphSize, col, graphSize, 'center', true);
  }
}

function drawReadings(c, p, model, state) {
  const { x, y, w, h, fs, col } = p;
  const cmp = model.belt ? '带' : '板';
  const f = state.sticking ? 's' : 'k';
  const compact = w < 260 || h < 64;
  const columns = w > 620 && h < 130 ? 4 : w > 350 ? 3 : 2;
  const items = [
    [quantity('v', '块', state.A.v, speedUnit), C.v],
    [quantity('v', cmp, state.B.v, speedUnit), C.B],
    [quantity('a', '块', state.A.a, accelUnit), C.a],
    [quantity('a', cmp, state.B.a, accelUnit), C.a],
    [quantity('f', f, state.friction, 'N'), C.F],
    [quantity('Q', null, state.heat, 'J'), C.a],
    [quantity('v', '相对', state.relativeVelocity, speedUnit), C.v],
    [quantity('Δx', '相对', state.relativeDisplacement, 'm'), col],
    [quantity('s', '滑', state.relativeDistance, 'm'), col],
    [quantity('ΔE', model.belt ? '块' : '系统', state.deltaEnergy, 'J'), col],
    ...(model.belt ? [[quantity('W', '摩擦→块', state.workA, 'J'), col]] : []),
    [quantity('W', model.belt ? '驱动' : '外力', state.externalWork, 'J'), col]
  ];
  const visible = compact ? items.slice(0, h >= 50 ? 8 : 6) : items;
  const rowH = h / Math.ceil(visible.length / columns);
  const colW = w / columns;
  visible.forEach(([tokens, color], index) => {
    math(c, tokens, x + index % columns * colW, y + Math.floor(index / columns) * rowH,
      colW - 4, rowH * 0.91, color, fs);
  });
}

function contactDraw(c, o, GH, model) {
  const b = GH.box(o);
  if (b.w < 100 || b.h < 80) return;
  const col = o.color;
  const fs = K.fs(K.S(b), 0.049, 8, 17);
  const lw = Math.min(K.lw(o, 0.44), fs * 0.19);
  const pad = Math.max(4, fs * 0.52);
  const { belt } = model;
  const details = K.showDetails(o);
  const state = model.at(K.t(o));
  const match = model.events.find(item => item.kinds.includes('match'));
  const nearEvent = model.events.find(item => Math.abs(state.t - item.t) <= timeEpsilon);
  const tick = [{ symbol: 't' }, ' = ' + K.formatQuantity(state.t, 's', 3)];
  const x = b.x1 + pad;
  const y = b.y1 + pad;
  const w = b.w - 2 * pad;
  const h = b.h - 2 * pad;
  const dense = b.h < 180 || b.w < 245;
  const row = dense ? Math.min(fs * 1.12, h * 0.095) : fs * 1.23;
  const capped = model.requestedMu > model.muK;
  const phase = state.endedAtEdge ? '达边缘，演示止于脱离瞬间' :
    nearEvent ? nearEvent.label : state.sticking ? '保持相对静止' : '相对滑动';
  const positive = belt && model.angle > 0 ? '沿斜面向上为正' : '向右为正';
  const assumptions = belt ? '匀速带 · 质点' : '光滑地面 · 滑块视为质点';
  const settings = [...quantity('μ', 's', model.muS, ''), '   ', ...quantity('μ', 'k', model.muK, '')];
  K.box(c, b.x1 + lw / 2, b.y1 + lw / 2, b.w - lw, b.h - lw,
    K.alpha(col, 0.25), lw, K.alpha(col, 0.035), pad);
  math(c, phase, x, y, w * 0.66, row, state.endedAtEdge ? C.F : col, fs);
  math(c, tick, x + w, y, w * 0.34 - 2, row, col, fs, 'right');
  math(c, positive + ' · ' + assumptions, x, y + row, w * (dense ? 1 : 0.66), row, col, fs * 0.85);
  if (!dense) math(c, settings, x + w, y + row, w * 0.34 - 2, row, col, fs * 0.89, 'right');
  let contentY = y + (details ? row * 2 : 0);
  if (details && capped) {
    math(c, [...settings, '（', { symbol: 'μ', sub: 'k' }, ' 按上限取值）'],
      x, contentY, w, row, C.a, fs * 0.86);
    contentY += row;
  }
  const bottom = y + h;
  const free = bottom - contentY;
  const gap = Math.max(2, fs * 0.32);
  const showForces = K.v(o, 'qContactForces');
  const wide = b.w > 570 && b.h > 180;
  const apparatusH = free * (wide ? 0.49 : dense ? 0.29 : 0.35);
  const readsH = free * (wide ? 0.32 : dense ? 0.31 : 0.27);
  const diagramW = showForces ? w * (belt ? 0.715 : 0.58) : w;
  const track = { x, y: contentY, w: diagramW - gap, h: apparatusH, col, fs, lw };
  if (belt) trackBelt(c, track, model, state);
  else trackBoard(c, track, model, state);
  if (showForces) {
    forceDiagram(c, { ...track, x: x + diagramW + gap, w: w - diagramW - gap }, model, state);
    if (!dense) math(c, '同类力箭长成比例', x + w, contentY, (w - diagramW) * 0.9, row, col, fs * 0.77, 'right');
  }
  const readY = contentY + apparatusH + gap;
  const relative = K.v(o, 'qContactGraph') === 1;
  if (!details) {
    contactGraph(c, { x, y: readY, w, h: bottom - readY, col, fs }, model, state, relative);
    return;
  }
  if (wide) {
    const lowerW = w * 0.53;
    contactGraph(c, { x: x + lowerW + gap, y: readY, w: w - lowerW - gap, h: bottom - readY, col, fs },
      model, state, relative);
    drawReadings(c, { x, y: readY, w: lowerW - gap, h: readsH, col, fs }, model, state);
    const theoryY = readY + readsH + gap;
    const theoryH = (bottom - theoryY) / 2;
    const system = belt ? '块' : '系统';
    const external = belt ? '驱动' : '外力';
    const slide = [{ symbol: 'Q' }, ' = ', { symbol: 'μ', sub: 'k' }, { symbol: 'N' }, { symbol: 's', sub: '滑' },
      '    ', { symbol: 'W', sub: external }, ' = ', { symbol: 'ΔE', sub: system }, ' + ', { symbol: 'Q' }];
    math(c, slide, x, theoryY, lowerW - gap, theoryH, col, fs);
    const limit = ['共速时  |', { symbol: 'f', sub: '需' }, '| ≤ ', { symbol: 'μ', sub: 's' }, { symbol: 'N' },
      ' 才能保持相对静止'];
    math(c, limit, x, theoryY + theoryH, lowerW - gap, theoryH, col, fs);
  } else {
    drawReadings(c, { x, y: readY, w, h: readsH, col, fs }, model, state);
    const graphY = readY + readsH + gap;
    contactGraph(c, { x, y: graphY, w, h: bottom - graphY, col, fs }, model, state, relative);
  }
  if (match && !dense) {
    math(c, quantity('t', '共速', match.t, 's', 3), x + diagramW - gap, contentY + apparatusH - row,
      diagramW * 0.58, row, col, fs * 0.86, 'right');
  }
}

const commonParams = ['qContactM', 'qMu', 'qMuS', 'qContactGraph', 'qContactForces', 'qContactPause'];
function animateTimeline(o, belt) {
  const model = modelFor(o, belt);
  return { duration: model.end, events: model.events, pauseAtEvents: K.v(o, 'qContactPause') };
}

const boardShape = K.TB.shapes.blockOnBoard;
if (boardShape) {
  const legacyDraw = boardShape.draw;
  const animating = o => K.v(o, 'qContactMode') === 1;
  Object.assign(boardShape, {
    params: ['qContactMode', 'plateShift', 'qContactBoardLength', 'qContactBoardM', 'qContactBoardV0', 'qContactBoardVB0',
      'qContactForce', 'qContactUseStep', 'qContactForce2', 'qContactStepTime', ...commonParams],
    animatable: true,
    canAnimate: animating,
    paperColor: animating,
    showParam(o, key) {
      if (key === 'qContactMode' || key === 'plateShift') return true;
      if (key === 'qContactForce2' || key === 'qContactStepTime') return animating(o) && !!K.v(o, 'qContactUseStep');
      return animating(o);
    },
    animationTimeline: o => animateTimeline(o, false),
    draw(c, o, GH) {
      if (animating(o)) contactDraw(c, o, GH, modelFor(o, false));
      else legacyDraw(c, o, GH);
    }
  });
}

Object.assign(K.TB.shapes.pm_conveyor, {
  params: ['qBeltV', 'qContactAngle', 'qContactV0', 'qContactBeltLength', ...commonParams],
  animationTimeline: o => animateTimeline(o, true),
  draw(c, o, GH) { contactDraw(c, o, GH, modelFor(o, true)); }
});
}());

/* ===== 上游 pm_magnetic_multiparticle.js ===== */
/* G3 磁场实验台：世界坐标以 m 为单位，x 向右，y 向下，B 向纸内为正。 */
(function () {
'use strict';
const K = window.__PM;
const tau = K.TAU;
const epsilon = 1e-8;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const advance = (p, u, s) => ({ x: p.x + s * u.x, y: p.y + s * u.y });
const finitePoint = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);

// 线也可为无界边界。求交只接受边界允许的参数区间。
function line(a, b, bounded = true) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length <= epsilon) return null;
  return { a, u: advance({ x: 0, y: 0 }, sub(b, a), 1 / length), length: bounded ? length : Infinity };
}

function roots(a, b, c) {
  const d = b * b - a * c;
  const tolerance = (b * b + Math.abs(a * c)) * Number.EPSILON * 16;
  if (d < -tolerance) return [];
  if (Math.abs(d) <= tolerance) return [-b / a];
  const q = -b - Math.sign(b || 1) * Math.sqrt(d);
  return [q / a, c / q];
}

function circleLine(center, radius, edge) {
  const offset = sub(edge.a, center);
  const distance = cross(edge.u, offset);
  const square = (radius + Math.abs(distance)) * (radius - Math.abs(distance));
  if (square < 0) return [];
  const projection = -dot(offset, edge.u);
  const delta = Math.sqrt(square);
  return [projection - delta, projection + delta];
}

function rayHits(p, u, boundary) {
  if (boundary.center) {
    const offset = sub(p, boundary.center);
    return roots(1, dot(offset, u), dot(offset, offset) - boundary.radius ** 2);
  }
  const { a, u: tangent, length } = boundary;
  const offset = sub(a, p), denominator = cross(u, tangent);
  if (Math.abs(denominator) <= Number.EPSILON * 8) {
    if (Math.abs(cross(offset, u)) > epsilon || !Number.isFinite(length)) return [];
    return [dot(offset, u), dot(advance(offset, tangent, length), u)];
  }
  const coordinate = cross(offset, u) / denominator;
  if (Number.isFinite(length) && (coordinate < -epsilon || coordinate > length + epsilon)) return [];
  return [cross(offset, tangent) / denominator];
}

function arcHits(arc, p, u, radius, turn, boundary) {
  const normal = { x: -turn * u.y, y: turn * u.x };
  if (boundary.center) {
    // 两圆方程相减，先在场域圆上计算公共弦，再换算成向前弧长。
    const d = sub(boundary.center, p);
    const n = sub(d, advance({ x: 0, y: 0 }, normal, radius));
    const len = Math.hypot(n.x, n.y);
    if (len <= epsilon) return [];
    const un = { x: n.x / len, y: n.y / len };
    const signed = (-(boundary.radius ** 2) - dot(d, d) + 2 * radius * dot(normal, d)) / (2 * len);
    const edge = { a: advance(boundary.center, un, signed), u: { x: -un.y, y: un.x } };
    return circleLine(boundary.center, boundary.radius, edge).map(s => {
      const hit = advance(edge.a, edge.u, s);
      return arc.distanceTo(hit.x, hit.y);
    });
  }
  // 局部坐标隐式圆方程 |d|²/(2r) = n·d，避免大半径抵消。
  const { a, u: tangent, length } = boundary;
  const offset = sub(a, p), curvature = 0.5 / radius;
  return roots(curvature, curvature * dot(offset, tangent) - 0.5 * dot(normal, tangent),
    curvature * dot(offset, offset) - dot(normal, offset))
    .filter(s => !Number.isFinite(length) || (s >= -epsilon && s <= length + epsilon))
    .map(s => {
      const hit = advance(a, tangent, s);
      return arc.distanceTo(hit.x, hit.y);
    });
}

function polygon(points) {
  const edges = points.map((p, i) => line(p, points[(i + 1) % points.length])).filter(Boolean);
  return {
    points, edges,
    inside(p) {
      let inside = false;
      for (const { a, u, length } of edges) {
        const b = advance(a, u, length), offset = sub(p, a);
        const projection = dot(offset, u);
        if (Math.abs(cross(offset, u)) <= epsilon && projection >= -epsilon && projection <= length + epsilon) return false;
        if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + (b.x - a.x) * (p.y - a.y) / (b.y - a.y)) inside = !inside;
      }
      return inside;
    }
  };
}

function circle(center, radius) {
  return { circle: { center, radius }, edges: [{ center, radius }],
    inside: p => Math.hypot(p.x - center.x, p.y - center.y) < radius - epsilon };
}

// 旋转后的边界直线用同一套射线、圆弧求交处理。
function strip(center, width, angle) {
  const n = { x: Math.cos(angle), y: Math.sin(angle) };
  const t = { x: -n.y, y: n.x };
  const sides = Number.isFinite(width) ? [-width / 2, width / 2] : [0];
  return {
    edges: sides.map(s => {
      const a = advance(center, n, s);
      return line(a, advance(a, t, 1), false);
    }),
    inside(p) {
      const distance = dot(sub(p, center), n);
      return distance > sides[0] + epsilon && (sides.length === 1 || distance < sides[1] - epsilon);
    }
  };
}

function intersections(edges, solve, end, period = Infinity) {
  return edges.flatMap(solve).filter(s => Number.isFinite(s) && s > epsilon && s < period - epsilon && s <= end + epsilon)
    .sort((a, b) => a - b).filter((s, i, all) => !i || s - all[i - 1] > epsilon);
}

function trajectory(source, angle, speed, omega, region, screens, duration) {
  if (!finitePoint(source) || ![angle, speed, omega, duration].every(Number.isFinite) || speed <= 0 || duration < 0) {
    throw new RangeError('Invalid magnetic initial conditions');
  }
  const radius = omega ? Math.abs(speed / omega) : Infinity;
  const turn = Math.sign(omega);
  const end = speed * duration;
  let p = source, u = { x: Math.cos(angle), y: -Math.sin(angle) }, distance = 0;
  let inField = false;
  if (omega) {
    const straight = s => ({ ...advance(p, u, s), ux: u.x, uy: u.y });
    const next = intersections(region.edges, edge => rayHits(p, u, edge), end)[0] ?? end;
    inField = region.inside(p) || (next > epsilon && region.inside(straight(next / 2)));
  }
  const segments = [], crossings = [];
  let impact = null, limited = false;
  // 观察窗口内异常频繁的边界事件在已求得的最后事件终止。
  while (distance < end - epsilon) {
    if (segments.length === 128) { limited = true; break; }
    const origin = p, heading = u;
    const circular = inField && Number.isFinite(radius);
    const arc = circular ? K.magneticArc(p.x, p.y, u.x, u.y, radius, turn) : null;
    const sample = arc ? arc.at : s => ({ ...advance(origin, heading, s), ux: heading.x, uy: heading.y });
    const solve = edge => arc ? arcHits(arc, origin, heading, radius, turn, edge) : rayHits(origin, heading, edge);
    const remaining = end - distance;
    const period = arc ? tau * radius : Infinity;
    const marks = omega ? intersections(region.edges, solve, period, period) : [];
    // 切触两侧的区域相同，顶点重复交点已去重。
    let boundary = Infinity;
    for (let i = 0; i < marks.length; i++) {
      const at = marks[i];
      if (at > remaining) break;
      const right = marks[i + 1] ?? (arc ? period : at + 1);
      if (right - at > epsilon && region.inside(sample((at + right) / 2)) !== inField) {
        boundary = at;
        break;
      }
    }
    let length = Math.min(remaining, boundary);
    let screenIndex = -1;
    screens.forEach((screen, i) => {
      const relative = sub(origin, screen.a), along = dot(relative, screen.u);
      const onScreen = Math.abs(cross(relative, screen.u)) <= epsilon && along >= -epsilon && along <= screen.length + epsilon;
      const hit = onScreen ? 0 : solve(screen).filter(s => Number.isFinite(s) && s >= -epsilon && s <= length + epsilon)
        .sort((a, b) => a - b)[0];
      if (hit !== undefined && (screenIndex < 0 || hit < length - epsilon)) {
        length = Math.min(length, Math.max(0, hit));
        screenIndex = i;
      }
    });
    segments.push({ start: distance, end: distance + length, sample, arc, inField: circular });
    p = sample(length);
    u = { x: p.ux, y: p.uy };
    distance += length;
    if (screenIndex >= 0) {
      impact = { ...p, t: distance / speed, index: screenIndex,
        angle: Math.acos(Math.min(1, Math.abs(cross(u, screens[screenIndex].u)))) * 180 / Math.PI };
      break;
    }
    if (boundary > remaining) break;
    inField = !inField;
    crossings.push({ ...p, t: distance / speed, entering: inField });
  }
  return {
    radius, speed, omega, segments, impact, crossings, limited, end: distance / speed,
    at(t) {
      const s = K.clamp(Number.isFinite(t) ? t * speed : 0, 0, distance);
      const segment = segments.find(seg => s < seg.end - epsilon) ?? segments.at(-1);
      const state = segment ? segment.sample(s - segment.start) : { ...source, ux: u.x, uy: u.y };
      const inField = !!segment?.inField && !(t >= distance / speed && (impact || limited));
      return { ...state, inField, speed, vx: speed * state.ux, vy: speed * state.uy,
        fx: inField ? -omega * speed * state.uy : 0, fy: inField ? omega * speed * state.ux : 0 };
    }
  };
}

K.magneticGeometry = { line, polygon, circle, strip, trajectory };
})();

/* ===== 上游 pm_magnetic_lab.js ===== */
/* G3 磁场实验台的参数、覆盖估计和画布。 */
(function () {
'use strict';
const K = window.__PM, C = K.C, G = K.magneticGeometry;
const deg = Math.PI / 180;
const fieldTypes = ['矩形', '条形', '半平面', '圆形', '多边形', '自定义闭合边界'];
const defaultBoundary = '3,2; 8,1; 10,4; 8,7; 4,6';
const defaultScreens = '9.6,1 → 9.6,7; 2,7.5 → 8,7.5';
const world = { w: 12, h: 8 };
const number = (key, label, min, max, step, def, unit = '') => K.P(key, { label, min, max, step, def, unit });
const range = (o, key) => {
  const { min, max, def } = K.TB.paramDefs[key];
  const value = K.v(o, key);
  return Number.isFinite(value) ? K.clamp(value, min, max) : def;
};
const pairs = value => [...String(value).slice(0, 800).matchAll(/(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)/g)]
  .map(([, x, y]) => ({ x: +x, y: +y })).filter(p => Math.abs(p.x) <= 100 && Math.abs(p.y) <= 100);
const snap = (value, density) => Math.round(value * density) / density;
const exact = value => +value.toFixed(4);
const coord = ({ x, y }) => exact(x) + ',' + exact(y);

K.sel('mfRegion', '磁场边界', fieldTypes, 0);
K.sel('mfMode', '发射方式', ['旋转圆 · 角度范围', '放缩圆 · 速率范围', '单粒子'], 0);
K.sel('mfEdit', '图内绘制', ['拖动现有编辑点', '逐点绘制闭合边界', '逐点添加挡板'], 0);
number('mfCount', '粒子数', 2, 20, 1, 9);
number('mfAngle', '中心发射角（上偏为正）', -180, 180, 1, 0, '°');
number('mfSpread', '发射角总范围', 0, 180, 1, 70, '°');
number('mfSpeed', '初始速率 / 范围下限', 0.2, 12, 0.1, 4, 'm·s⁻¹');
number('mfMaxSpeed', '初始速率上限', 0.2, 12, 0.1, 7, 'm·s⁻¹');
number('mfMass', '质量', 0.2, 3, 0.1, 1, 'kg');
number('mfCharge', '电荷（带符号）', -3, 3, 0.1, 1, 'C');
number('mfB', '磁场 B（向纸内为正）', -4, 4, 0.1, 1.8, 'T');
number('mfTime', '观察时长', 0.5, 10, 0.1, 3, 's');
number('mfX', '发射点 x（向右）', 0, 12, 0.01, 1.5, 'm');
number('mfY', '发射点 y（向下）', 0, 8, 0.01, 4, 'm');
number('mfCX', '场域中心或边界 x', 0, 12, 0.01, 5.8, 'm');
number('mfCY', '场域中心或边界 y', 0, 8, 0.01, 4, 'm');
number('mfWidth', '场宽 / 直径', 0.4, 14, 0.01, 4.5, 'm');
number('mfHeight', '场高', 0.4, 14, 0.01, 5, 'm');
number('mfRotate', '场域顺时针转角', -180, 180, 1, 0, '°');
number('mfDensity', '每米网格分格数', 1, 5, 1, 2);
number('mfFocus', '高亮粒子（0 为关闭）', 0, 20, 1, 0);
K.P('mfHidden', { label: '隐藏粒子编号（逗号分隔）', type: 'modelText', def: '' });
K.P('mfBoundary', { label: '闭合顶点 x,y（分号分隔，最多 24 点）', type: 'modelText', def: defaultBoundary });
K.P('mfScreensText', { label: '挡板端点 x,y → x,y（分号分隔，最多 4 块）', type: 'modelText', def: defaultScreens });
for (const [key, label, def] of [
  ['mfGrid', '显示网格', false], ['mfSnap', '拖动吸附网格', true], ['mfLock', '锁定图内编辑点', false],
  ['mfScreens', '吸收型荧光屏', false], ['mfTrace', '轨迹留痕', true], ['mfFull', '完整轨迹预览', false],
  ['mfCircle', '完整参考圆', false], ['mfCenter', '圆心', false], ['mfRadius', '半径辅助线', false],
  ['mfVelocity', '速度矢量', true], ['mfForce', '洛伦兹力', false], ['mfCross', '出入场点', true],
  ['mfArea', '轨迹族覆盖面积', false], ['mfPause', '在关键帧自动暂停', false]
]) K.tog(key, label, def);

function fieldFor(o) {
  const type = +K.v(o, 'mfRegion');
  const center = { x: range(o, 'mfCX'), y: range(o, 'mfCY') };
  const w = range(o, 'mfWidth'), h = range(o, 'mfHeight'), a = range(o, 'mfRotate') * deg;
  const worldPoint = (x, y) => ({
    x: center.x + x * Math.cos(a) - y * Math.sin(a), y: center.y + x * Math.sin(a) + y * Math.cos(a)
  });
  if (type === 1 || type === 2) return G.strip(center, type === 1 ? w : Infinity, a);
  if (type === 3) return G.circle(center, w / 2);
  if (type === 5) {
    const vertices = pairs(K.v(o, 'mfBoundary')).slice(0, 24);
    return G.polygon(vertices.length >= 3 ? vertices : pairs(defaultBoundary));
  }
  const points = type === 4
    ? [[-0.5, -0.25], [-0.12, -0.5], [0.5, -0.29], [0.37, 0.5], [-0.4, 0.38]]
    : [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  return G.polygon(points.map(([x, y]) => worldPoint(w * x, h * y)));
}

function screenPoints(o) {
  return pairs(o.mfScreensText ?? defaultScreens).slice(0, 8);
}

function buildFamily(o) {
  const region = fieldFor(o), source = { x: range(o, 'mfX'), y: range(o, 'mfY') };
  const endpoints = K.v(o, 'mfScreens') ? screenPoints(o) : [];
  const screens = [];
  for (let i = 0; i + 1 < endpoints.length; i += 2) {
    const screen = G.line(endpoints[i], endpoints[i + 1]);
    if (screen) screens.push(screen);
  }
  const mass = range(o, 'mfMass'), charge = range(o, 'mfCharge'), field = range(o, 'mfB');
  const omega = -charge * field / mass, duration = range(o, 'mfTime');
  const mode = +K.v(o, 'mfMode'), count = mode === 2 ? 1 : Math.round(range(o, 'mfCount'));
  const heading = range(o, 'mfAngle') * deg, span = mode === 0 ? range(o, 'mfSpread') * deg : 0;
  const speed = range(o, 'mfSpeed'), lastSpeed = mode === 1 ? Math.max(speed, range(o, 'mfMaxSpeed')) : speed;
  const launch = f => G.trajectory(source, heading + span * (f - 0.5), K.lerp(speed, lastSpeed, f),
    omega, region, screens, duration);
  const particles = Array.from({ length: count }, (_, i) => launch(count === 1 ? 0.5 : i / (count - 1)));
  const events = particles.flatMap((path, i) => [
    ...path.crossings.map(p => ({ t: p.t, label: '粒子 ' + (i + 1) + (p.entering ? ' 入场' : ' 出场') })),
    ...(path.impact ? [{ t: path.impact.t, label: '粒子 ' + (i + 1) + ' 命中挡板' }] : [])
  ]).sort((a, b) => a.t - b.t).filter((e, i, all) => !i || e.t - all[i - 1].t > 1e-7);
  return { region, source, screens, launch, particles, events, duration, mass, charge, omega, field,
    nondegenerate: span > 0 || lastSpeed > speed };
}

// (发射参数, 时间) 映射到观察窗。将相邻样线间的小四边形分成三角形，
// 在网格单元中心求并集。遮挡与出界由轨迹事件及网格窗口共同限制。
function coverage(family, time, count, steps, density) {
  const width = world.w * density, height = world.h * density;
  const mask = new Uint8Array(width * height);
  if (!family.nondegenerate || time <= 0) return { width, height, density, mask, area: 0 };
  function triangle(a, b, c) {
    const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(area) < 1e-12) return;
    const ymin = Math.max(0, Math.ceil(density * Math.min(a.y, b.y, c.y) - 0.5));
    const ymax = Math.min(height - 1, Math.floor(density * Math.max(a.y, b.y, c.y) - 0.5));
    for (let y = ymin; y <= ymax; y++) {
      const row = (y + 0.5) / density;
      const xs = [];
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        if ((p.y <= row && q.y > row) || (q.y <= row && p.y > row)) {
          xs.push(p.x + (q.x - p.x) * (row - p.y) / (q.y - p.y));
        }
      }
      if (xs.length !== 2) continue;
      const lo = Math.max(0, Math.ceil(density * Math.min(...xs) - 0.5));
      const hi = Math.min(width - 1, Math.floor(density * Math.max(...xs) - 0.5));
      if (hi >= lo) mask.fill(1, y * width + lo, y * width + hi + 1);
    }
  }
  function launch(parameter) {
    const path = family.launch(parameter);
    return { parameter, path, screen: path.impact?.t <= time ? path.impact.index : -1 };
  }
  function samples(beam) {
    return beam.samples ??= Array.from({ length: steps + 1 }, (_, j) => beam.path.at(time * j / steps));
  }
  function sweep(a, b, depth) {
    if (a.screen !== b.screen) {
      // 细分已探测到的挡板落点跳变。最后的小区间留空，避免虚构跨屏轨迹。
      if (depth === 0) return;
      const middle = launch((a.parameter + b.parameter) / 2);
      sweep(a, middle, depth - 1);
      sweep(middle, b, depth - 1);
      return;
    }
    const left = samples(a), right = samples(b);
    for (let j = 1; j <= steps; j++) {
      triangle(left[j - 1], left[j], right[j]);
      triangle(left[j - 1], right[j], right[j - 1]);
    }
  }
  let previous = launch(0);
  for (let i = 1; i <= count; i++) {
    const current = launch(i / count);
    sweep(previous, current, 6);
    previous = current;
  }
  return { width, height, density, mask, area: mask.reduce((sum, filled) => sum + filled, 0) / density ** 2 };
}

const geometryKeys = ['mfRegion', 'mfMode', 'mfCount', 'mfAngle', 'mfSpread', 'mfSpeed', 'mfMaxSpeed',
  'mfMass', 'mfCharge', 'mfB', 'mfTime', 'mfX', 'mfY', 'mfCX', 'mfCY', 'mfWidth', 'mfHeight', 'mfRotate',
  'mfBoundary', 'mfScreens', 'mfScreensText'];
const familyFor = o => K.memo(o, JSON.stringify(geometryKeys.map(key => K.v(o, key))), () => buildFamily(o));
const visualKeys = ['mfEdit', 'mfGrid', 'mfDensity', 'mfSnap', 'mfLock', 'mfTrace', 'mfFull', 'mfCircle', 'mfCenter',
  'mfRadius', 'mfVelocity', 'mfForce', 'mfCross', 'mfArea', 'mfFocus', 'mfHidden', 'mfPause'];
const math = (c, tokens, x, y, w, h, color, s, essential = false) =>
  K.drawMathLabel(c, tokens, x, y, { c: color, maxWidth: w, maxHeight: h, s, essential });
const variable = (symbol, sub) => ({ symbol, sub });
const value = (symbol, amount, unit, digits = 2) => [variable(symbol), ' = ' + K.formatQuantity(amount, unit, digits)];

function layout(o, GH) {
  const b = GH.box(o);
  if (b.w < 105 || b.h < 85) return null;
  const details = K.showDetails(o);
  const font = K.fs(K.S(b), 0.045, 9, 17);
  const footer = details ? Math.min(b.h * 0.32, font * 4.8) : font * 1.18;
  const scale = Math.min((b.w - 10) / world.w, (b.h - 10 - footer) / world.h);
  const left = b.x1 + (b.w - world.w * scale) / 2;
  const top = b.y1 + (b.h - footer - world.h * scale) / 2;
  const x = v => left + v * scale, y = v => top + v * scale;
  return { b, left, top, right: x(world.w), bottom: y(world.h), scale, x, y, font, footer, details };
}

// 多边形画布路径沿用和物理判定相同的奇偶填充规则。
function fieldShape(c, region, view) {
  const { x, y, scale } = view;
  c.beginPath();
  if (region.circle) {
    const { center, radius } = region.circle;
    c.arc(x(center.x), y(center.y), radius * scale, 0, K.TAU);
    return;
  }
  let points = region.points;
  if (!points) {
    points = [{ x: 0, y: 0 }, { x: world.w, y: 0 }, { x: world.w, y: world.h }, { x: 0, y: world.h }];
    for (const [i, { a, u }] of region.edges.entries()) {
      const signed = p => (i ? -1 : 1) * (u.x * (p.y - a.y) - u.y * (p.x - a.x));
      points = points.flatMap((p, i) => {
        const q = points[(i + 1) % points.length], pDist = signed(p), qDist = signed(q);
        const values = pDist <= 0 ? [p] : [];
        if ((pDist < 0 && qDist > 0) || (pDist > 0 && qDist < 0)) {
          const f = pDist / (pDist - qDist);
          values.push({ x: K.lerp(p.x, q.x, f), y: K.lerp(p.y, q.y, f) });
        }
        return values;
      });
    }
  }
  points.forEach((p, i) => i ? c.lineTo(x(p.x), y(p.y)) : c.moveTo(x(p.x), y(p.y)));
  if (points.length) c.closePath();
}

function drawBackground(c, o, family, view, color) {
  const { left, top, right, bottom, x, y } = view;
  if (K.v(o, 'mfGrid')) {
    const step = 1 / range(o, 'mfDensity');
    c.beginPath();
    for (let i = step; i < world.w - 1e-9; i += step) { c.moveTo(x(i), top); c.lineTo(x(i), bottom); }
    for (let i = step; i < world.h - 1e-9; i += step) { c.moveTo(left, y(i)); c.lineTo(right, y(i)); }
    c.strokeStyle = K.alpha(color, 0.18); c.lineWidth = 0.7; c.stroke();
  }
  if (!family.field) return;
  c.save();
  fieldShape(c, family.region, view);
  c.fillStyle = K.alpha(C.B, 0.09); c.fill('evenodd');
  c.strokeStyle = C.B; c.lineWidth = 1.25; c.stroke();
  c.clip('evenodd');
  K.bmarks(c, left, top, right - left, bottom - top, family.field > 0,
    Math.max(17, view.scale * 0.52), K.alpha(C.B, 0.65), 1);
  c.restore();
}

const areaCache = new WeakMap();
function drawArea(c, family, view, time) {
  // 展示面积以固定模拟时刻更新。播放帧率不参与误差或面积计算。
  const tick = time === family.duration ? time : Math.floor(time * 4) / 4;
  let cache = areaCache.get(family);
  if (cache?.tick !== tick) {
    const steps = Math.max(52, Math.ceil(Math.abs(family.omega) * tick / 0.24));
    const coarse = coverage(family, tick, 18, steps, 8);
    const fine = coverage(family, tick, 36, steps * 2, 16);
    cache = { tick, fine, delta: Math.abs(fine.area - coarse.area) };
    areaCache.set(family, cache);
  }
  const { fine } = cache, { density, width, height, mask } = fine, cell = view.scale / density;
  c.beginPath();
  for (let y = 0; y < height; y++) for (let x = 0; x < width;) {
    if (!mask[y * width + x]) { x++; continue; }
    const start = x++;
    while (x < width && mask[y * width + x]) x++;
    c.rect(view.x(start / density), view.y(y / density), (x - start) * cell, cell);
  }
  c.fillStyle = K.alpha(C.gas, 0.22); c.fill();
  return cache;
}
function hiddenParticles(o) {
  return new Set(String(K.v(o, 'mfHidden') || '').split(/[,，\s]+/).map(Number).filter(n => n > 0));
}

function drawPaths(c, o, family, view, time) {
  const { x, y, scale } = view;
  const focus = range(o, 'mfFocus') - 1, hidden = hiddenParticles(o);
  const trace = K.v(o, 'mfTrace'), full = K.v(o, 'mfFull');
  const showCircle = K.v(o, 'mfCircle'), showCenter = K.v(o, 'mfCenter'), showRadius = K.v(o, 'mfRadius');
  const dotRadius = K.clamp(scale * 0.07, 2, 4.5);
  const velocity = K.v(o, 'mfVelocity'), force = K.v(o, 'mfForce'), showCrossing = K.v(o, 'mfCross');
  const area = K.v(o, 'mfArea');
  const maxSpeed = Math.max(...family.particles.map(path => path.speed));
  const velocityScale = Math.min(38, scale * 0.8) / maxSpeed;
  const forceScale = family.omega ? Math.min(28, scale * 0.6) / (family.mass * Math.abs(family.omega) * maxSpeed) : 0;
  family.particles.forEach((path, i) => {
    if (hidden.has(i + 1)) return;
    const selected = i === focus, edge = area && (i === 0 || i === family.particles.length - 1);
    const weight = selected || edge ? 2.3 : 1.3;
    const tone = selected ? C.F : edge ? C.gas : C.a;
    const distance = path.speed * time;
    if (trace || full) for (const seg of path.segments) {
      const traveled = K.clamp(distance - seg.start, 0, seg.end - seg.start);
      const total = seg.end - seg.start;
      function stroke(start, end, ref) {
        if (end <= start) return;
        const angle = seg.arc ? Math.min(K.TAU, (end - start) / path.radius) : 0;
        const points = [];
        const pieces = Math.max(1, Math.ceil(angle / 0.065));
        for (let k = 0; k <= pieces; k++) {
          const p = seg.sample(start + (angle ? angle * path.radius : end - start) * k / pieces);
          points.push([x(p.x), y(p.y)]);
        }
        K.poly(c, points, ref ? K.alpha(tone, 0.52) : tone, ref ? weight * 0.65 : weight, ref ? [5, 4] : null);
      }
      if (trace) stroke(0, traveled, false);
      if (full) stroke(trace ? traveled : 0, total, true);
    }
    const state = path.at(time);
    if (showCircle || showCenter || showRadius) {
      const arcs = new Set(path.segments.map(s => s.arc).filter(Boolean));
      for (const arc of arcs) {
        const cx = x(arc.cx), cy = y(arc.cy);
        if (showCircle && path.radius * scale < 100000) {
          K.circ(c, cx, cy, path.radius * scale, K.alpha(tone, 0.62), 0.9, null, [3, 5]);
        }
        if (showCenter) K.dot(c, cx, cy, 2, tone);
      }
      const current = path.segments.find(s => distance >= s.start && distance < s.end);
      if (showRadius && current?.arc) K.line(c, x(state.x), y(state.y), x(current.arc.cx), y(current.arc.cy), tone, 1, [3, 4]);
    }
    if (showCrossing) for (const p of path.crossings) {
      if (p.t <= time || full) K.circ(c, x(p.x), y(p.y), 2.7, p.entering ? C.B : C.a, 1.3);
    }
    const px = x(state.x), py = y(state.y);
    const absorbed = path.impact && time >= path.impact.t;
    if (absorbed) {
      K.circ(c, px, py, dotRadius + 3, C.F, 1.2);
    } else {
      if (velocity) {
        const len = state.speed * velocityScale;
        K.arrow(c, px, py, px + state.ux * len, py + state.uy * len, C.v, 1.3, 6);
      }
      if (force && state.inField && forceScale) {
        K.arrow(c, px, py, px + forceScale * state.fx, py + forceScale * state.fy, C.F, 1.3, 6);
      }
    }
    K.dot(c, px, py, selected ? dotRadius * 1.36 : dotRadius, C.F);
    if (selected) K.circ(c, px, py, dotRadius + 4, o.color, 1.1);
  });
}

function draw(o, c, GH) {
  const view = layout(o, GH);
  if (!view) return;
  const { left, top, right, bottom, x, y, font, footer, details } = view;
  const family = familyFor(o), time = K.clamp(K.t(o), 0, family.duration), color = o.color;
  const area = K.v(o, 'mfArea') && +K.v(o, 'mfMode') !== 2;
  c.save();
  c.beginPath(); c.rect(left, top, right - left, bottom - top); c.clip();
  drawBackground(c, o, family, view, color);
  const estimate = area ? drawArea(c, family, view, time) : null;
  family.screens.forEach(screen => {
    const end = { x: screen.a.x + screen.length * screen.u.x, y: screen.a.y + screen.length * screen.u.y };
    K.line(c, x(screen.a.x), y(screen.a.y), x(end.x), y(end.y), color, 2.4);
    if (K.v(o, 'mfGrid') && !K.v(o, 'mfLock')) {
      K.dot(c, x(screen.a.x), y(screen.a.y), 3, C.B);
      K.dot(c, x(end.x), y(end.y), 3, C.B);
    }
  });
  if (K.v(o, 'mfGrid') && !K.v(o, 'mfLock')) {
    for (const p of family.region.points || []) K.dot(c, x(p.x), y(p.y), 2.6, C.B);
  }
  const editing = +K.v(o, 'mfEdit');
  if (editing === 1) {
    const vertices = pairs(o.mfBoundary ?? defaultBoundary).slice(0, 24);
    for (const p of vertices) K.dot(c, x(p.x), y(p.y), 3.2, C.B);
  }
  if (editing === 2) {
    const points = screenPoints(o);
    if (points.length % 2) {
      const p = points.at(-1);
      K.dot(c, x(p.x), y(p.y), 3.2, C.B);
    }
  }
  drawPaths(c, o, family, view, time);
  K.circ(c, x(family.source.x), y(family.source.y), 4.5, C.F, 1.4);
  c.restore();
  K.box(c, left, top, right - left, bottom - top, K.alpha(color, 0.45), 1);
  const rightAngle = right - left > 285;
  const tidy = [];
  if (estimate) tidy.push('覆盖近似');
  if (K.v(o, 'mfCircle') || K.v(o, 'mfFull') || K.v(o, 'mfRadius')) tidy.push('虚线为参考');
  if (family.particles.some(p => p.limited)) tidy.push('部分轨迹达事件上限');
  if (editing === 1) tidy.push('点选顶点，自动闭合');
  if (editing === 2) tidy.push('依次点选挡板两端');
  const line = ['观察窗 12 × 8 m', ...tidy].join(' · ');
  math(c, [line], left, bottom + 3, right - left, font, color, font * 0.87, true);
  if (!details) return;
  const row = (footer - font - 2) / 3, width = right - left;
  const subject = family.particles[Math.max(0, Math.min(family.particles.length - 1, range(o, 'mfFocus') - 1))];
  const state = subject.at(time);
  const formula = family.omega
    ? [{ symbol: 'r' }, ' = ', { frac: [[{ symbol: 'mv' }], ['|', { symbol: 'q' }, '|', { symbol: 'B' }]] },
      '   ', ...value('r', subject.radius, 'm'), '   ', ...value('ω', Math.abs(family.omega), 'rad·s⁻¹'),
      '   ', ...value('T', K.TAU / Math.abs(family.omega), 's')]
    : ['零磁力 · 匀速直线'];
  const tRow = [...value('t', time, 's'), '   ', ...value('v', state.speed, 'm·s⁻¹'), '   ',
    ...value('q', family.charge, 'C'), '   ', ...value('B', family.field, 'T')];
  const hits = family.particles.filter(p => p.impact?.t <= time);
  const rangeY = hits.length ? hits.map(p => p.impact.y) : [];
  const hitsLabel = hits.length
    ? '命中 ' + hits.length + ' 粒' + (rightAngle ? ' · 落点 y ' + K.formatQuantity(Math.min(...rangeY), '', 2) +
      '–' + K.formatQuantity(Math.max(...rangeY), 'm', 2) : '') +
      (subject.impact?.t <= time ? ' · 对法线 ' + K.formatQuantity(subject.impact.angle, '°', 1) : '')
    : '命中 0 粒';
  const foot = estimate ? ['覆盖 ≈ ' + K.formatQuantity(estimate.fine.area, 'm²', 2) +
    ' · 两档差 ' + K.formatQuantity(estimate.delta, 'm²', 2) + ' · 采到 ' + K.formatQuantity(estimate.tick, 's', 2) +
    (K.v(o, 'mfScreens') ? ' · ' + hitsLabel : '')] : [K.v(o, 'mfScreens') ? hitsLabel : '非相对论 · 速度垂直磁场'];
  math(c, formula, left, bottom + font + 4, width, row, color, font);
  math(c, tRow, left, bottom + font + 4 + row, width, row, color, font);
  math(c, foot, left, bottom + font + 4 + row * 2, width, row, color, font);
}

const definition = {
  key: 'pm_magnetic_lab', cat: 'em', label: '多粒子磁场实验台', animatable: true,
  icon: '<path d="M10 2h12v20H10zM13 5l3 3m0-3-3 3m5 3 3 3m0-3-3 3M2 16h5c6 0 10-4 10-8"/>',
  params: [...geometryKeys, ...visualKeys],
  showParam(o, key) {
    const mode = +K.v(o, 'mfMode'), type = +K.v(o, 'mfRegion');
    if (key === 'mfBoundary') return type === 5;
    if (['mfCX', 'mfCY', 'mfWidth', 'mfHeight', 'mfRotate'].includes(key)) {
      if (type === 5) return false;
      if (key === 'mfHeight') return type === 0 || type === 4;
      if (key === 'mfWidth') return type !== 2;
      if (key === 'mfRotate') return type !== 3;
    }
    if (key === 'mfScreensText') return !!K.v(o, 'mfScreens');
    if (key === 'mfSpread') return mode === 0;
    if (key === 'mfMaxSpeed') return mode === 1;
    if (['mfCount', 'mfFocus', 'mfHidden', 'mfArea'].includes(key)) return mode !== 2;
    return true;
  },
  animationTimeline(o) {
    const { duration, events } = familyFor(o);
    return { duration, events, pauseAtEvents: !!K.v(o, 'mfPause') };
  },
  draw(c, o, GH) { draw(o, c, GH); },
  dragHandle(o, pt, GH) {
    const view = layout(o, GH);
    if (!view || K.v(o, 'mfLock')) return null;
    const type = +K.v(o, 'mfRegion');
    const marked = p => Math.hypot(pt.x - view.x(p.x), pt.y - view.y(p.y)) <= 10;
    const quantize = v => K.v(o, 'mfSnap') ? exact(snap(v, range(o, 'mfDensity'))) : exact(v);
    const fromCanvas = p => ({ x: K.clamp(quantize((p.x - view.left) / view.scale), 0, world.w),
      y: K.clamp(quantize((p.y - view.top) / view.scale), 0, world.h) });
    const editing = +K.v(o, 'mfEdit');
    if (editing && pt.x >= view.left && pt.x <= view.right && pt.y >= view.top && pt.y <= view.bottom) {
      const key = editing === 1 ? 'mfBoundary' : 'mfScreensText';
      const display = editing === 1 ? 'mfRegion' : 'mfScreens';
      return { keys: [key, display], resetTime: true, click: true, valuesAt(target) {
        const raw = o[key] ?? K.TB.paramDefs[key].def;
        const points = pairs(raw);
        const limit = editing === 1 ? 24 : 8;
        const next = points.length >= limit ? String(raw) : [...points.map(coord), coord(fromCanvas(target))].join('; ');
        return { [key]: next, [display]: editing === 1 ? '5' : true };
      } };
    }
    function pointHandle(p, keys) {
      return marked(p) ? { keys, resetTime: true, valuesAt(target) {
        const value = fromCanvas(target);
        return { [keys[0]]: value.x, [keys[1]]: value.y };
      } } : null;
    }
    function pathHandle(points, key) {
      const index = points.findIndex(marked);
      if (index < 0) return null;
      return { key, resetTime: true, valueAt(target) {
        return points.map((p, i) => coord(i === index ? fromCanvas(target) : p)).join('; ');
      } };
    }
    const source = { x: range(o, 'mfX'), y: range(o, 'mfY') };
    return pointHandle(source, ['mfX', 'mfY']) ||
      (K.v(o, 'mfScreens') && pathHandle(screenPoints(o), 'mfScreensText')) ||
      (type === 5 ? pathHandle(fieldFor(o).points, 'mfBoundary')
        : pointHandle({ x: range(o, 'mfCX'), y: range(o, 'mfCY') }, ['mfCX', 'mfCY']));
  }
};
K.reg(definition);
K.magneticLab = { buildFamily, familyFor, coverage, snap, layout };
})();

/* ===== 上游 pm_dual_rod_induction.js ===== */
/* 双棒感应：左棒为 1、右棒为 2，向右和纸外为正，回路逆时针为正。 */
(function () {
'use strict';
const K = window.__PM, C = K.C;
const speed = 'm·s⁻¹';
const inputs = {
  m1: ['左棒质量', .2, 8, .1, 1, 'kg'], m2: ['右棒质量', .2, 8, .1, 2, 'kg'],
  v1: ['左棒初速度（向右为正）', -8, 8, .1, 3, speed], v2: ['右棒初速度（向右为正）', -8, 8, .1, 0, speed],
  length: ['导轨间距', .2, 2, .1, 1, 'm'], B: ['磁场 B（向外为正）', -3, 3, .1, 1.5, 'T'],
  R1: ['左棒电阻', 0, 6, .05, .4, 'Ω'], R2: ['右棒电阻', 0, 6, .05, .6, 'Ω'],
  load: ['外接串联负载', 0, 20, .05, 1, 'Ω'], total: ['指定全回路电阻', .05, 30, .05, 2, 'Ω'],
  F1: ['左棒外力（向右为正）', -12, 12, .1, 0, 'N'], F2: ['右棒外力（向右为正）', -12, 12, .1, 0, 'N'],
  drag: ['导轨黏滞阻力系数 γ（F = −mγv）', 0, 3, .05, 0, 's⁻¹'],
  gap: ['两棒初始间距', .5, 14, .1, 6, 'm'], duration: ['观察时长', .5, 12, .1, 6, 's']
};
const param = name => 'rod_' + name;
for (const [name, [label, min, max, step, def, unit]] of Object.entries(inputs)) {
  K.P(param(name), { label, min, max, step, def, unit });
}
K.tog('rodDirectR', '直接指定全回路电阻', false);
K.tog('rodEquivalent', '显示等效回路和支路热量', true);
K.tog('rodPause', '关键时刻自动暂停', false);
K.P('animSpeed', { label: '动画播放速度', min: .25, max: 2, step: .25, def: 1, unit: '×' });

function motion(v, a, lambda) {
  function at(t) {
    const z = lambda * t, e = Math.exp(-z);
    const phi = lambda ? -Math.expm1(-z) / lambda : t;
    const psi = Math.abs(z) < 1e-3 ? t * t * (.5 - z / 6 + z * z / 24 - z ** 3 / 120 + z ** 4 / 720)
      : (t - phi) / lambda;
    return { v: v * e + a * phi, x: v * phi + a * psi, a: (a - lambda * v) * e };
  }
  return { at, v, a, lambda };
}

const nodes = [0.0950125098376374, .281603550779259, .458016777657227, .617876244402644,
  .755404408355003, .865631202387832, .944575023073233, .989400934991650];
const weights = [.189450610455069, .182603415044924, .169156519395003, .149595988816577,
  .124628971255534, .095158511682493, .062253523938648, .027152459411754];
function squaredIntegral(mode, t) {
  const { v, a, lambda } = mode;
  if (!lambda) return t * (v * v + t * (a * v + t * a * a / 3));
  if (lambda * t < .5) {
    const h = t / 2;
    return nodes.reduce((sum, x, i) => sum + weights[i] *
      (mode.at(h * (1 + x)).v ** 2 + mode.at(h * (1 - x)).v ** 2), 0) * h;
  }
  const terminal = a / lambda, decay = v - terminal;
  return Math.max(0, terminal ** 2 * t + 2 * terminal * decay * -Math.expm1(-lambda * t) / lambda +
    decay ** 2 * -Math.expm1(-2 * lambda * t) / (2 * lambda));
}

function zeros(fn, boundaries) {
  const found = [];
  for (let i = 1; i < boundaries.length; i++) {
    let lo = boundaries[i - 1], hi = boundaries[i];
    const initial = fn(lo), final = fn(hi);
    if (initial === 0) found.push(lo);
    if (initial * final >= 0) continue;
    for (let j = 0; j < 55; j++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(fn(mid)) === Math.sign(initial)) lo = mid;
      else hi = mid;
    }
    found.push((lo + hi) / 2);
  }
  if (fn(boundaries.at(-1)) === 0) found.push(boundaries.at(-1));
  return found;
}

function solve(input = {}) {
  const p = Object.fromEntries(Object.entries(inputs).map(([name, [, min, max, , def]]) =>
    [name, K.clamp(Number.isFinite(input[name]) ? input[name] : def, min, max)]));
  const { m1, m2, v1, v2, B, length, R1, R2, F1, F2, drag, gap, duration } = p;
  const M = m1 + m2, reduced = m1 * m2 / M;
  const R = Math.max(.05, input.direct ? Math.max(p.total, R1 + R2) : R1 + R2 + p.load);
  const load = Math.max(0, R - R1 - R2);
  const BL = B * length, D = BL ** 2 / R, decay = D / reduced;
  const mean = motion((m1 * v1 + m2 * v2) / M, (F1 + F2) / M, drag);
  const difference = motion(v1 - v2, F1 / m1 - F2 / m2, drag + decay);
  const x10 = (20 - gap) / 2, x20 = x10 + gap;
  const left = m2 / M, right = -m1 / M;
  const kinetic0 = (m1 * v1 ** 2 + m2 * v2 ** 2) / 2;
  const forceA = mean.a - drag * mean.v;
  const forceD = difference.a - difference.lambda * difference.v;
  const position = (t, ratio, initial) => initial + mean.at(t).x + ratio * difference.at(t).x;
  const velocity = (t, ratio) => mean.at(t).v + ratio * difference.at(t).v;
  function extrema(ratio) {
    if (!decay || !forceA || !forceD) return [];
    const exp = -ratio * forceD / forceA;
    const turn = Math.log(exp) / decay;
    return turn > 0 && turn < duration ? [turn] : [];
  }
  const timesL = zeros(t => velocity(t, left), [0, ...extrema(left), duration]);
  const timesR = zeros(t => velocity(t, right), [0, ...extrema(right), duration]);
  const co = v1 === v2 && difference.a === 0 ? [] : zeros(t => difference.at(t).v, [0, duration]);
  const within = times => times.filter(t => t > 1e-10 && t < duration - 1e-10);
  const bounds = [
    [t => position(t, left, x10), timesL, '左棒到达导轨端点'],
    [t => 20 - position(t, left, x10), timesL, '左棒到达导轨端点'],
    [t => position(t, right, x20), timesR, '右棒到达导轨端点'],
    [t => 20 - position(t, right, x20), timesR, '右棒到达导轨端点'],
    [t => gap - difference.at(t).x, co, '两棒接触 · 观察终止']
  ];
  let end = duration, stop = '观察终点';
  for (const [fn, critical, label] of bounds) {
    const times = [0, ...within(critical), duration];
    const hit = [...zeros(fn, times), ...times.slice(1).filter(t => Math.abs(fn(t)) < 1e-9)]
      .filter(t => t > 0).sort((a, b) => a - b)[0];
    if (hit !== undefined && hit <= end) { end = hit; stop = label; }
  }
  const commonEvents = within(co).filter(t => t < end).map(t => ({ t, label: '瞬时共速' }));
  if (decay && v1 !== v2 && difference.a === 0) {
    const t = Math.log(100) / (drag + decay);
    if (t < end) commonEvents.push({ t, label: '相对速度降至初值 1%' });
  }
  function at(time) {
    const t = K.clamp(Number.isFinite(time) ? time : 0, 0, end);
    const A = mean.at(t), d = difference.at(t);
    const dx1 = A.x + left * d.x, dx2 = A.x + right * d.x;
    const u1 = A.v + left * d.v, u2 = A.v + right * d.v;
    const flux = BL * Math.max(0, gap - d.x), emf = BL * d.v, current = emf / R;
    const ampere1 = -BL * current, ampere2 = -ampere1;
    const kinetic = (m1 * u1 ** 2 + m2 * u2 ** 2) / 2;
    const integratedDifference = squaredIntegral(difference, t);
    const heat = D * integratedDifference;
    const railHeat = drag ? drag * (M * squaredIntegral(mean, t) + reduced * integratedDifference) : 0;
    const work = F1 * dx1 + F2 * dx2;
    return { t, x1: x10 + dx1, x2: x20 + dx2, v1: u1, v2: u2, a1: (F1 + ampere1) / m1 - drag * u1,
      a2: (F2 + ampere2) / m2 - drag * u2, flux, emf, current, ampere1, ampere2,
      kinetic, heat, railHeat, work, momentum: M * A.v, residual: kinetic - kinetic0 + heat + railHeat - work };
  }
  return { at, end, stop, events: [...commonEvents, { t: end, label: stop }].sort((a, b) => a.t - b.t),
    R, load, R1, R2, B, length, kinetic0, drag, F1, F2 };
}

K.physics = K.physics || {};
K.physics.dualRodInduction = solve;
function modelFor(o) {
  const p = Object.fromEntries(Object.keys(inputs).map(name => [name, K.v(o, param(name))]));
  p.direct = !!K.v(o, 'rodDirectR');
  return K.memo(o, JSON.stringify(p), () => {
    const model = solve(p);
    model.samples = Array.from({ length: 121 }, (_, i) => model.at(model.end * i / 120));
    model.maxSpeed = Math.max(.01, ...model.samples.flatMap(frame => [Math.abs(frame.v1), Math.abs(frame.v2)]));
    model.maxForce = Math.max(.01, ...model.samples.map(frame => Math.abs(frame.ampere1)));
    return model;
  });
}
const token = (symbol, sub) => ({ symbol, sub });
const qty = (symbol, sub, value, unit) => [token(symbol, sub), ' = ' + K.formatQuantity(value, unit, 2)];
function plot(c, model, state, opts) {
  const { x, y, w, h, fs, color, unit, fields } = opts;
  const vals = model.samples.flatMap(s => fields.map(([name]) => s[name]));
  const ymin = Math.min(0, ...vals), ymax = Math.max(0, ...vals);
  const columns = Math.min(fields.length, Math.max(1, Math.floor(w / (fs * 3.4))));
  const legendRows = Math.ceil(fields.length / columns);
  const legendHeight = Math.min(h * .26, fs * 1.1 * legendRows);
  const textHeight = legendHeight / legendRows;
  const A = K.axes(c, x, y + legendHeight, w, h - legendHeight, { xmin: 0, xmax: model.end || 1, ymin, ymax: ymax || (ymin ? 0 : 1),
    xl: 't/s', yl: unit, unitAxes: true, O: false, fs, col: color, lw: 1 });
  fields.forEach(([name, label, tone], i) => {
    K.poly(c, model.samples.map(s => [A.X(s.t), A.Y(s[name])]), tone, 1.45);
    K.dot(c, A.X(state.t), A.Y(state[name]), 2.6, tone);
    K.txt(c, label, x + w * ((i % columns + .5) / columns), y + textHeight * (Math.floor(i / columns) + .5),
      { c: tone, s: Math.min(fs * .84, textHeight * .87), essential: true, maxWidth: w * .84 / columns });
  });
}

function draw(c, o, GH) {
  const b = GH.box(o);
  if (b.w < 135 || b.h < 105) return;
  const m = modelFor(o), s = m.at(K.t(o)), color = o.color, details = K.showDetails(o);
  const fs = K.fs(K.S(b), .048, 8, 16), x = b.x1 + fs * .6, y = b.y1 + fs * .6;
  const w = b.w - fs * 1.2, h = b.h - fs * 1.2;
  const showCircuit = details && K.v(o, 'rodEquivalent') && b.w >= 400;
  const apparatus = h * (details ? .39 : .49);
  const left = x + w * .055, right = x + w * (showCircuit ? .71 : .945);
  const top = y + apparatus * .30, bottom = y + apparatus * .75;
  const X = position => K.lerp(left, right, position / 20);
  if (m.B) K.bmarks(c, left, top, right - left, bottom - top, m.B < 0, Math.max(17, fs * 2.2), K.alpha(C.B, .44), 1);
  for (const yy of [top, bottom]) K.line(c, left, yy, right, yy, color, 1.65);
  const p1 = X(s.x1), p2 = X(s.x2), middle = (top + bottom) / 2;
  const speedScale = w * .05 / m.maxSpeed, forceScale = w * .05 / m.maxForce;
  const ink = [C.v, C.B];
  for (const [i, px, v, force] of [[0, p1, s.v1, s.ampere1], [1, p2, s.v2, s.ampere2]]) {
    K.line(c, px, top - fs * .32, px, bottom + fs * .32, ink[i], 3);
    K.txt(c, String(i + 1), px, bottom + fs, { c: ink[i], s: fs, essential: true });
    if (Math.abs(v) > 1e-4) K.arrow(c, px, top - fs * .8, px + speedScale * v, top - fs * .8, C.v, 1.4, 6);
    if (Math.abs(force) > 1e-4) K.arrow(c, px, middle, px + forceScale * force, middle, C.F, 1.4, 6);
  }
  if (Math.abs(s.current) > 1e-8) {
    const signed = Math.sign(s.current), size = Math.min(fs, (p2 - p1) * .32);
    const mid = (p2 + p1) / 2;
    if (size > 1) for (const [yy, dir] of [[top, -signed], [bottom, signed]]) {
      K.arrow(c, mid - dir * size, yy, mid + dir * size, yy, C.I, 1.6, 6);
    }
  }
  if (showCircuit) {
    const xL = x + w * .78, xR = x + w * .99, yT = top, yB = bottom;
    const position = [xL, xL + (xR - xL) / 3, xL + (xR - xL) * 2 / 3, xR];
    const mid = (xL + xR) / 2;
    K.poly(c, [[xL, yT], [xL, yB], [mid - fs * .31, yB]], color, 1.2);
    K.poly(c, [[mid + fs * .31, yB], [xR, yB], [xR, yT]], color, 1.2);
    position.slice(0, -1).forEach((px, i) => {
      const dx = position[i + 1] - px, boxWidth = dx * .54, offset = (dx - boxWidth) / 2;
      K.line(c, px, yT, px + offset, yT, color, 1.2);
      K.box(c, px + offset, yT - fs * .2, boxWidth, fs * .4, color, 1.2);
      K.line(c, px + offset + boxWidth, yT, px + dx, yT, color, 1.2);
      K.drawMathLabel(c, [token('R', [1, 2, '负载'][i])], px + dx / 2, yT - fs,
        { c: color, s: fs * .7, maxWidth: dx, maxHeight: fs * .7, al: 'center' });
    });
    K.drawMathLabel(c, qty('ℰ', null, s.emf, 'V'), xL, yB + fs * .2,
      { c: C.I, s: fs * .7, maxWidth: xR - xL, maxHeight: fs * .7 });
    const sign = Math.sign(s.emf) || 1;
    K.line(c, mid + sign * fs * .31, yB - fs * .27, mid + sign * fs * .31, yB + fs * .27, color, 1.2);
    K.line(c, mid - sign * fs * .31, yB - fs * .17, mid - sign * fs * .31, yB + fs * .17, color, 1.2);
  }
  const plotY = y + apparatus + 1, floor = y + h - (details ? fs * 4.6 : fs);
  const plotH = floor - plotY, pw = w / 3, gf = Math.min(fs, pw / 10, plotH * .21);
  const definitions = [
    ['v/(m·s⁻¹)', [['v1', '左棒', C.v], ['v2', '右棒', C.B]]],
    ['I/A', [['current', '电流', C.I]]],
    ['E/J', [['kinetic', '动能', C.v], ['heat', '焦耳热', C.I], ['work', '外功', C.B], ['railHeat', '阻力热', C.a]]]
  ];
  definitions.forEach(([unit, fields], i) => plot(c, m, s, { x: x + pw * i, y: plotY, w: pw - 2, h: plotH, fs: gf, color, unit, fields }));
  K.txt(c, s.t >= m.end ? m.stop : '右为正 · 垂直匀强场 · 导轨 20 m', x, y + h - fs * .42,
    { c: color, s: fs * .78, al: 'left', essential: true, maxWidth: w });
  if (!details) return;
  K.drawMathBlock(c, [
    [...qty('t', null, s.t, 's'), '   ', ...qty('Φ', null, s.flux, 'Wb'), '   ', ...qty('ℰ', null, s.emf, 'V'),
      '   ', ...qty('I', null, s.current, 'A')],
    [token('ℰ'), ' = ', token('Bℓ'), '(', token('v', 1), ' − ', token('v', 2), ')   ',
      token('ΔE', 'k'), ' + ', token('Q', '电'), ' + ', token('Q', '阻'), ' = ', token('W', '外')],
    K.v(o, 'rodEquivalent')
      ? [...qty('R', '回路', m.R, 'Ω'), '（串联 ', ...qty('R', 1, m.R1, 'Ω'), ' + ', ...qty('R', 2, m.R2, 'Ω'),
        ' + ', ...qty('R', '负载', m.load, 'Ω'), '）']
      : [...qty('F', '安1', s.ampere1, 'N'), '   ', ...qty('F', '安2', s.ampere2, 'N')],
    ...(K.v(o, 'rodEquivalent') ? [[...qty('Q', 1, s.heat * m.R1 / m.R, 'J'),
      '   ', ...qty('Q', 2, s.heat * m.R2 / m.R, 'J'), '   ', ...qty('Q', '负载', s.heat * m.load / m.R, 'J')]] : [])
  ], x, floor + 2, { c: color, s: fs * .9, maxWidth: w, maxHeight: fs * 3.3 });
}
K.reg({
  key: 'pm_dual_rod_induction', cat: 'em', label: '双导体棒·电磁感应', animatable: true,
  icon: '<path d="M2 6h20M2 18h20M8 4v16m8-16v16M10 9l3 3m0-3-3 3"/>',
  params: [...Object.keys(inputs).map(param), 'rodDirectR', 'rodEquivalent', 'rodPause', 'animSpeed'],
  showParam(o, key) {
    if (key === 'rod_total') return !!K.v(o, 'rodDirectR');
    if (key === 'rod_load') return !K.v(o, 'rodDirectR');
    return true;
  },
  animationTimeline(o) {
    const { end, events } = modelFor(o);
    return { duration: end, events, pauseAtEvents: !!K.v(o, 'rodPause') };
  },
  draw
});
})();

/* ===== 上游 pm_momentum_energy.js ===== */
/* ===================== 动量守恒与能量转化 ===================== */
(function () {
'use strict';
const K = window.__PM;
const C = K.C;
const speedUnit = 'm·s⁻¹';
const momentumUnit = 'kg·m·s⁻¹';
const gravity = 10;
const springRest = 4;
const startGap = 1.2;
const timeEpsilon = 1e-8;

const scenes = [
  { label: '弹性碰撞', restitution: 1 },
  { label: '非弹性碰撞', restitution: null },
  { label: '完全非弹性碰撞', restitution: 0 },
  { label: '子弹嵌入木块', restitution: 0, bullet: true },
  { label: '两物块连接弹簧', spring: 'attached' },
  { label: '碰撞后在粗糙地面滑动', restitution: null, rough: true },
  { label: '弹簧缓冲与机械能守恒', spring: 'contact' }
];

K.sel('qMomentumScene', '演示情景', scenes.map(scene => scene.label));
K.P('qMomentumM1', { label: '物体 1 的质量', min: 0.05, max: 6, step: 0.05, def: 1, unit: 'kg' });
K.P('qMomentumM2', { label: '物体 2 的质量', min: 0.05, max: 6, step: 0.05, def: 2, unit: 'kg' });
K.P('qMomentumV1', { label: '物体 1 初速度（右为正）', min: -8, max: 8, step: 0.1, def: 3, unit: speedUnit });
K.P('qMomentumV2', { label: '物体 2 初速度（右为正）', min: -8, max: 8, step: 0.1, def: -1, unit: speedUnit });
K.P('qMomentumE', { label: '恢复系数', min: 0, max: 1, step: 0.05, def: 0.5 });
K.P('qMomentumK', { label: '弹簧劲度系数', min: 4, max: 80, step: 1, def: 16, unit: 'N·m⁻¹' });
K.P('qMomentumCompression', { label: '初始弹簧压缩量', min: 0, max: 1.5, step: 0.05, def: 0.5, unit: 'm' });
K.P('qMomentumMu', { label: '碰后地面动摩擦因数', min: 0, max: 1, step: 0.01, def: 0.2 });
K.P('qMomentumDuration', { label: '观察时长', min: 0.5, max: 8, step: 0.1, def: 3, unit: 's' });
K.P('animSpeed', { label: '动画播放速度', min: 0.25, max: 2, step: 0.25, def: 1, unit: '×' });
K.sel('qMomentumGraph', '联动图像', ['速度–时间', '位移–时间']);
K.tog('qMomentumPause', '关键时刻自动暂停', true);

const inputParams = {
  m1: 'qMomentumM1', m2: 'qMomentumM2', v1: 'qMomentumV1', v2: 'qMomentumV2',
  restitution: 'qMomentumE', k: 'qMomentumK', compression: 'qMomentumCompression',
  friction: 'qMomentumMu', duration: 'qMomentumDuration'
};

function scenario(value) {
  return Number.isInteger(value) && scenes[value] ? value : 0;
}

// 右为正。x₁、x₂ 是两物体相向的端面位置，子弹取弹尖位置。
// 碰撞和理想弹簧阶段无水平外力。粗糙地面自碰撞后开始作用。
function solve(input = {}) {
  const scene = scenes[scenario(Number(input.scene))];
  const values = {};
  for (const [name, key] of Object.entries(inputParams)) {
    const { min, max, def } = K.TB.paramDefs[key];
    const raw = input[name];
    values[name] = K.clamp(Number.isFinite(raw) ? raw : def, min, max);
  }
  const { m1, m2, v1, v2, k, compression, friction, duration } = values;
  const { spring, bullet, rough } = scene;
  const e = scene.restitution ?? values.restitution;
  const mass = m1 + m2;
  const reduced = m1 * m2 / mass;
  const omega = spring ? Math.sqrt(k / reduced) : 0;
  const aSlide = rough ? gravity * friction : 0;
  const closing = v1 - v2;
  const vCentre = (m1 * v1 + m2 * v2) / mass;
  const x2Initial = spring === 'attached' ? springRest - compression : startGap + (spring ? springRest : 0);
  const encounter = spring !== 'attached' && closing > 0 ? startGap / closing : Infinity;
  const contactX = v1 * encounter;
  let end = duration;
  let geometricLimit = false;
  let release = Infinity;
  let maxCompression = Infinity;
  let maxExtension = Infinity;
  let springStart = 0;
  let amplitude = 0;
  let phase = 0;

  function stopAtLimit(t) {
    if (t <= duration) {
      end = t;
      geometricLimit = true;
    }
  }

  if (spring === 'attached') {
    amplitude = Math.hypot(compression, closing / omega);
    if (amplitude > 0) {
      // q = A cos(ωt + φ), where q is signed extension and q′ is v₂ − v₁.
      phase = Math.atan2(closing / omega, -compression);
      maxCompression = K.mod(Math.PI - phase, K.TAU) / omega;
      maxExtension = K.mod(-phase, K.TAU) / omega;
      if (amplitude >= springRest) {
        const angle = Math.acos(-springRest / amplitude);
        stopAtLimit(K.mod(angle - phase, K.TAU) / omega);
      }
    }
  } else if (spring && encounter <= duration) {
    springStart = encounter;
    amplitude = closing / omega;
    phase = Math.PI / 2;
    maxCompression = encounter + Math.PI / (2 * omega);
    release = encounter + Math.PI / omega;
    if (amplitude >= springRest) stopAtLimit(encounter + Math.asin(springRest / amplitude) / omega);
  }

  function describe(t, x1, x2, u1, u2, extension, impactEnergy, slip1, slip2, stage) {
    const E1 = m1 * u1 * u1 / 2;
    const E2 = m2 * u2 * u2 / 2;
    const p1 = m1 * u1;
    const p2 = m2 * u2;
    const springEnergy = k * extension * extension / 2;
    const heat = aSlide * (m1 * slip1 + m2 * slip2);
    return { t, x1, x2, v1: u1, v2: u2, p1, p2, momentum: p1 + p2, E1, E2, extension,
      springEnergy, impactEnergy, slip1, slip2, heat, mechanical: E1 + E2 + springEnergy,
      total: E1 + E2 + springEnergy + impactEnergy + heat, stage };
  }

  function free(t) {
    return describe(t, v1 * t, x2Initial + v2 * t, v1, v2, 0, 0, 0, 0,
      closing > 0 ? '接近' : '未发生接触');
  }

  function springState(t) {
    const local = t - springStart;
    const angle = omega * local + phase;
    let extension = amplitude * Math.cos(angle);
    let relative = -amplitude * omega * Math.sin(angle);
    if (t === maxCompression) { extension = -amplitude; relative = 0; }
    if (t === maxExtension) { extension = amplitude; relative = 0; }
    if (spring === 'contact' && t === encounter) { extension = 0; relative = -closing; }
    if (t === release) { extension = 0; relative = closing; }
    if (geometricLimit && t === end) extension = -springRest;
    const gap = springRest + extension;
    const centre = m2 * x2Initial / mass + vCentre * t;
    const stage = geometricLimit && t === end ? '达到弹簧几何限位' :
      relative < 0 ? '弹簧压缩方向' : relative > 0 ? '弹簧伸长方向' : '共速';
    return describe(t, centre - m2 / mass * gap, centre + m1 / mass * gap,
      vCentre - m2 / mass * relative, vCentre + m1 / mass * relative, extension, 0, 0, 0, stage);
  }

  const collision = !spring && encounter <= end ? { t: encounter } : null;
  let stop1 = Infinity;
  let stop2 = Infinity;
  if (collision) {
    const [out1, out2] = K.collisionVelocities(m1, m2, v1, v2, e);
    collision.stuck = e === 0;
    collision.loss = (1 - e) * (1 + e) * reduced * closing * closing / 2;
    collision.before = describe(encounter, contactX, contactX, v1, v2, 0, 0, 0, 0, '碰前');
    collision.after = describe(encounter, contactX, contactX, out1, collision.stuck ? out1 : out2,
      0, collision.loss, 0, 0, '碰后');
    if (aSlide > 0) {
      stop1 = Math.abs(collision.after.v1) / aSlide;
      stop2 = Math.abs(collision.after.v2) / aSlide;
    }
  }

  function slide(v, stop, elapsed) {
    const advance = K.sampleConstantAcceleration(v, -Math.sign(v) * aSlide, Math.min(stop, elapsed));
    if (elapsed >= stop) advance.v = 0;
    return advance;
  }

  const released = spring && release <= end ? springState(release) : null;
  function at(time) {
    const t = K.clamp(Number.isFinite(time) ? time : 0, 0, end);
    if (spring === 'attached') return springState(t);
    if (t < encounter) return free(t);
    if (spring) {
      if (t <= release) return springState(t);
      const elapsed = t - release;
      return describe(t, released.x1 + released.v1 * elapsed, released.x2 + released.v2 * elapsed,
        released.v1, released.v2, 0, 0, 0, 0, '脱离后匀速');
    }
    const elapsed = t - encounter;
    const after = collision.after;
    const A = slide(after.v1, stop1, elapsed);
    const B = slide(after.v2, stop2, elapsed);
    const stage = aSlide > 0 ? elapsed >= Math.max(stop1, stop2) ? '已停止' : '碰后滑动' :
      collision.stuck ? bullet ? '嵌入后共速' : '粘连共速' : '碰后分离';
    return describe(t, contactX + A.x, contactX + B.x, A.v, B.v, 0, collision.loss,
      Math.abs(A.x), Math.abs(B.x), stage);
  }

  const events = [];
  function add(t, kind, label) {
    if (!Number.isFinite(t) || t < 0 || t > end) return;
    const previous = events.find(event => Math.abs(event.t - t) <= timeEpsilon);
    if (previous) {
      previous.kinds.push(kind);
      previous.label += ' · ' + label;
    } else events.push({ t, kinds: [kind], label });
  }
  if (encounter <= end) {
    add(encounter - Math.min(0.15, encounter / 2), 'before', spring ? '接触前' : '碰撞前');
    add(encounter, 'contact', spring ? '弹簧接触' : collision.stuck ? '碰撞瞬间 · 共速' : '碰撞瞬间');
    if (collision && encounter < end) add(encounter + Math.min(0.15, (end - encounter) / 2), 'after', '碰撞后');
  }
  add(maxCompression, 'compression', '最大压缩 · 共速');
  add(maxExtension, 'extension', '最大伸长 · 共速');
  add(release, 'release', '离开弹簧');
  if (stop1 > 0) add(encounter + stop1, 'stop1', '物体 1 停止');
  if (stop2 > 0 && !(collision?.stuck && stop2 === stop1)) add(encounter + stop2, 'stop2', '物体 2 停止');
  add(end, 'end', geometricLimit ? '弹簧几何限位' : '观察终点');
  events.sort((a, b) => a.t - b.t);
  return { at, end, duration, events, collision, spring, bullet, rough, e, aSlide, k, omega, mass,
    springStart, release, encounter, maxCompression, maxExtension, geometricLimit, x2Initial, m1, m2 };
}

function geometry(model) {
  const impacts = model.collision ? [model.collision.t] : [];
  const times = [...new Set([0, model.end, ...impacts,
    ...model.events.filter(event => event.kinds.some(kind => ['contact', 'compression', 'extension', 'release',
      'stop1', 'stop2'].includes(kind))).map(event => event.t)])].sort((a, b) => a - b);
  const curves = [];
  for (let i = 1; i < times.length; i++) {
    const start = times[i - 1];
    const end = times[i];
    const inSpring = model.spring === 'attached' || model.spring === 'contact' &&
      start >= model.springStart && end <= model.release && start >= model.encounter;
    const samples = inSpring ? Math.max(1, Math.ceil((end - start) * model.omega * 20 / K.TAU)) :
      model.rough && start >= model.encounter ? 12 : 1;
    const points = Array.from({ length: samples + 1 }, (_, j) => {
      if (j === samples && model.collision?.t === end) return model.collision.before;
      const t = j === samples ? end : start + (end - start) * j / samples;
      return model.at(t);
    });
    curves.push(points);
  }
  const states = [model.at(0), model.at(model.end), ...curves.flat()];
  function scale(a, b, initialB = 0) {
    const min = Math.min(0, ...states.flatMap(s => [s[a], s[b] - initialB]));
    const max = Math.max(0, ...states.flatMap(s => [s[a], s[b] - initialB]));
    return { min, max, magnitude: Math.max(Math.abs(min), max) };
  }
  return { curves, position: scale('x1', 'x2'), displacement: scale('x1', 'x2', model.x2Initial),
    velocity: scale('v1', 'v2'), momentum: scale('p1', 'p2'), energy: states[0].total };
}

function modelFor(o) {
  const input = { scene: scenario(K.v(o, 'qMomentumScene')) };
  for (const [name, key] of Object.entries(inputParams)) input[name] = K.v(o, key);
  return K.memo(o, 'momentum|' + Object.values(input).join('|'), () => {
    const model = solve(input);
    model.geometry = geometry(model);
    return model;
  });
}

(K.physics ||= {}).momentumEnergy = solve;
K.physics.momentumEnergyModel = modelFor;

function math(c, tokens, x, y, w, h, color, size, align = 'left', essential = true) {
  return K.drawMathLabel(c, tokens, x, y, { c: color, s: size, maxWidth: w, maxHeight: h, al: align, essential });
}

function quantity(value, unit = '') {
  return value !== 0 && (Math.abs(value) < 0.01 || Math.abs(value) >= 1e4) ? K.scientificQuantity(value, unit, 2) :
    [K.formatQuantity(value, unit, Number.isInteger(value) ? 0 : 2)];
}

function symbol(name, sub, vector = false) {
  return { symbol: name, sub, vector };
}

function track(c, rect, model, state) {
  const { x, y, w, h, color, fs, lw } = rect;
  const { position, velocity } = model.geometry;
  const margin = Math.min(w * 0.23, Math.max(fs * 3.4, w * 0.13));
  const xAt = value => x + margin + (value - position.min) * (w - margin * 2) / Math.max(0.1, position.max - position.min);
  const A = xAt(state.x1);
  const B = xAt(state.x2);
  const velocityWidth = margin * 0.73;
  const bodyWidth = Math.min(fs * 2.8, h * 0.47, margin * 0.66);
  const bodyHeight = Math.min(fs * 2.4, h * 0.35);
  const rail = y + h * 0.77;
  const bodyY = rail - bodyHeight / 2;
  const labelHeight = Math.min(fs, h * 0.19);
  K.hatch(c, x + 1, rail, x + w - 1, rail, K.alpha(color, 0.75), lw,
    model.rough && state.t >= model.encounter ? 4 : Math.max(8, bodyHeight * 0.63), 1);
  K.arrow(c, x + w - margin * 0.76, rail + labelHeight * 0.89, x + w - margin * 0.29, rail + labelHeight * 0.89,
    color, 1, fs * 0.46);
  math(c, ['+', symbol('x')], x + w - 1, rail + labelHeight * 0.45, margin * 0.3,
    labelHeight, color, fs, 'right');
  if (model.spring) {
    const attached = model.spring === 'attached' || state.t >= model.encounter && state.t <= model.release;
    const coilStart = attached ? A : xAt(state.x2 - springRest);
    if (B - coilStart < 3) K.line(c, coilStart, bodyY, B, bodyY, C.a, lw);
    else K.spring(c, coilStart, bodyY, B, bodyY, Math.max(3, Math.min(12, Math.floor((B - coilStart) / 5))),
      bodyHeight * 0.23, C.a, lw);
  }
  const stuck = model.collision?.stuck && state.t >= model.collision.t;
  if (model.bullet) {
    K.box(c, B, rail - bodyHeight, bodyWidth * 1.35, bodyHeight, C.B, lw, K.alpha(C.B, 0.18), 2);
    const tip = stuck ? B + bodyWidth * 0.6 : A;
    const head = Math.min(bodyWidth * 0.5, h * 0.2);
    K.poly(c, [[tip - head, bodyY - head * 0.3], [tip - head * 0.32, bodyY - head * 0.3], [tip, bodyY],
      [tip - head * 0.32, bodyY + head * 0.3], [tip - head, bodyY + head * 0.3]], C.I, lw, null, true, K.alpha(C.I, 0.35));
    math(c, ['2'], B + bodyWidth, bodyY - labelHeight / 2, bodyWidth * 0.66, labelHeight, C.B, fs, 'center');
  } else {
    for (const [i, edge, ink] of [[1, A - bodyWidth, C.I], [2, B, C.B]]) {
      K.box(c, edge, rail - bodyHeight, bodyWidth, bodyHeight, ink, lw, K.alpha(ink, 0.18), 2);
      math(c, [String(i)], edge + bodyWidth / 2, bodyY - labelHeight / 2, bodyWidth, labelHeight, ink, fs, 'center');
    }
  }
  const origins = [model.bullet && stuck ? B + bodyWidth * 0.6 : A - (model.bullet ? bodyWidth * 0.25 : bodyWidth / 2),
    B + bodyWidth * (model.bullet ? 0.68 : 0.5)];
  for (const [i, v, ink] of [[0, state.v1, C.I], [1, state.v2, C.B]]) {
    const yArrow = y + h * (i === 0 ? 0.11 : 0.31);
    const origin = origins[i];
    const length = velocityWidth * v / (velocity.magnitude || 1);
    if (Math.abs(length) > 0.6) K.arrow(c, origin, yArrow, origin + length, yArrow, ink, lw, fs * 0.54);
    else K.dot(c, origin, yArrow, Math.min(fs * 0.12, 2), ink);
    const textX = origin - (length < -0.6 ? -1 : 1) * fs * 0.22;
    math(c, [symbol('v', i + 1, true)], textX, yArrow - labelHeight / 2, margin * 0.47,
      labelHeight, ink, fs * 0.95, length < -0.6 ? 'left' : 'right');
  }
  if (w > 200 && y + h - rail > labelHeight * 2.05) {
    math(c, '位置与箭长按比例 · 物体大小为示意', x + 2, rail + labelHeight * 1.09,
      w - margin, labelHeight * 0.95, color, fs * 0.7);
  }
}

function rangeWithPadding({ min, max }) {
  const pad = (max - min || 1) * 0.13;
  return { min: min - pad, max: max + pad };
}

function timeGraph(c, rect, model, state, displacement) {
  const { x, y, w, h, color } = rect;
  const fs = Math.min(rect.fs * 0.8, h * 0.22, w * 0.09);
  const scale = displacement ? model.geometry.displacement : model.geometry.velocity;
  const { min, max } = rangeWithPadding(scale);
  const axes = K.axes(c, x, y, w, h, {
    xmin: 0, xmax: model.end, ymin: min, ymax: max, xl: 't/s', yl: displacement ? 'Δx/m' : 'v/(' + speedUnit + ')',
    unitAxes: true, O: false, col: color, lw: 1, fs,
    pad: { l: fs * 2.9, r: fs * 2.3, t: fs * 1.2, b: fs * 1.5 }
  });
  const px = axes.X(state.t);
  K.line(c, px, axes.Y0, px, axes.Y1, K.alpha(color, 0.51), 1, [3, 3]);
  for (const tick of new Set([scale.min, 0, scale.max])) {
    const tickY = axes.Y(tick);
    if (tick !== 0 && Math.abs(tickY - axes.oy) < fs) continue;
    math(c, quantity(tick), axes.X0 - 3, tickY - fs * 0.46,
      axes.X0 - x - 4, fs, color, fs, 'right');
    K.line(c, axes.X0 - 2, tickY, axes.X0 + 2, tickY, color, 1);
  }
  math(c, quantity(model.end), axes.X1, axes.oy + fs * 0.45, fs * 2.1, fs, color, fs, 'center');
  K.line(c, axes.X1, axes.oy - 2, axes.X1, axes.oy + 2, color, 1);
  for (const [i, ink] of [[1, C.I], [2, C.B]]) {
    const initial = displacement && i === 2 ? model.x2Initial : 0;
    const key = (displacement ? 'x' : 'v') + i;
    for (const points of model.geometry.curves) K.poly(c, points.map(s => [axes.X(s.t), axes.Y(s[key] - initial)]), ink, 1.4);
    if (!displacement && model.collision && model.collision.before[key] !== model.collision.after[key]) {
      const before = model.collision.before;
      const after = model.collision.after;
      const impactX = axes.X(before.t);
      K.circ(c, impactX, axes.Y(before[key]), fs * 0.22, ink, 1);
      K.dot(c, impactX, axes.Y(after[key]), fs * 0.19, ink);
    }
    if (i === 1) K.dot(c, px, axes.Y(state[key] - initial), fs * 0.25, ink);
    else K.circ(c, px, axes.Y(state[key] - initial), fs * 0.33, ink, 1.2);
    math(c, [symbol(displacement ? 'Δx' : 'v', i)], x + w - (i - 1) * fs * 2.6, y,
      fs * 2.5, fs, ink, fs, 'right');
  }
}

function energyChart(c, rect, model, state, details) {
  const { x, y, w, h, color } = rect;
  const fs = Math.min(rect.fs * 0.8, h * 0.22, w * 0.082);
  const items = [
    ['E', 'k,1', state.E1, C.I], ['E', 'k,2', state.E2, C.B],
    ...(model.spring ? [['E', 'p', state.springEnergy, C.a]] : []),
    ...(!model.spring && model.e < 1 ? [['ΔU', '碰', state.impactEnergy, C.E]] : []),
    ...(model.rough ? [['Q', '滑', state.heat, C.F]] : [])
  ];
  const base = y + h - fs * 1.25;
  const maximum = model.geometry.energy;
  const height = h - fs * (details ? 3.35 : 2.78);
  const top = base - height;
  const left = x + fs * 2.8;
  const barW = (w - fs * 3.1) / (items.length + 1);
  const label = [{ symbol: 'E' }, '/J'];
  K.arrow(c, left, base + 1, left, y + fs * 0.2, color, 1, fs * 0.49);
  K.line(c, left, base, x + w - 2, base, color, 1);
  K.line(c, left, top, x + w - 2, top, K.alpha(color, 0.35), 1, [3, 3]);
  math(c, label, left + fs * 0.55, y, w * 0.32, fs, color, fs);
  math(c, quantity(maximum || 1), left - 3, top - fs * 0.48, fs * 2.66, fs, color, fs, 'right');
  math(c, ['0'], left - 3, base - fs * 0.48, fs * 2.6, fs, color, fs, 'right');
  const first = left + barW / 2;
  const totalX = first + items.length * barW;
  items.forEach(([name, sub, value, ink], i) => {
    const cx = first + i * barW;
    const barH = height * value / (maximum || 1);
    if (barH > 0) K.box(c, cx - barW * 0.28, base - barH, barW * 0.56, barH, null, 0, K.alpha(ink, 0.78));
    math(c, [symbol(name, sub)], cx, base + fs * 0.24, barW * 0.96, fs, ink, fs, 'center');
    if (details) math(c, quantity(value), cx, base - barH - fs * 1.05, barW * 0.94, fs, ink, fs, 'center', false);
  });
  let stack = 0;
  for (const [, , value, ink] of items) {
    const barH = height * value / (maximum || 1);
    if (barH > 0) K.box(c, totalX - barW * 0.28, base - stack - barH, barW * 0.56, barH, null, 0, K.alpha(ink, 0.78));
    stack += barH;
  }
  math(c, [symbol('E', '总')], totalX, base + fs * 0.24, barW * 0.96, fs, color, fs, 'center');
  if (details) math(c, quantity(state.total), totalX, base - stack - fs * 1.05, barW * 0.94, fs, color, fs, 'center', false);
}

function momentumChart(c, rect, model, state) {
  const { x, y, w, h, color } = rect;
  const rows = model.collision ? [['碰前', model.collision.before], ['碰后', model.collision.after], ['当前', state]] : [['当前', state]];
  const rowH = h / (rows.length + 1);
  const fs = Math.min(rect.fs * 0.9, rowH * 0.96, w * 0.06);
  const heading = [[symbol('p', 1, true)], [symbol('p', 2, true)], [symbol('p', '总', true)]];
  const available = w - fs * 3;
  const windowWidth = available / 3;
  const relativeMax = Math.max(model.geometry.momentum.magnitude, Math.abs(model.at(0).momentum), 1e-12);
  heading.forEach((tokens, i) => {
    const column = x + fs * 3 + (i + 0.5) * windowWidth;
    math(c, tokens, column, y, windowWidth * 0.49, rowH, i === 0 ? C.I : i === 1 ? C.B : color, fs, 'center');
  });
  rows.forEach(([label, s], j) => {
    const rowY = y + rowH * (j + 1);
    math(c, label, x, rowY + rowH * 0.09, fs * 2.8, rowH * 0.85, color, fs);
    [s.p1, s.p2, s.momentum].forEach((p, i) => {
      const ink = i === 0 ? C.I : i === 1 ? C.B : color;
      const centre = x + fs * 3 + (i + 0.5) * windowWidth;
      const arrowY = rowY + rowH * 0.25;
      const delta = windowWidth * 0.43 * p / relativeMax;
      K.line(c, centre, arrowY - rowH * 0.2, centre, arrowY + rowH * 0.17, K.alpha(color, 0.38), 1, [2, 2]);
      if (Math.abs(delta) > 0.6) K.arrow(c, centre, arrowY, centre + delta, arrowY, ink, 1.15, fs * 0.42);
      else K.dot(c, centre, arrowY, Math.min(1.4, fs * 0.14), ink);
      math(c, quantity(p), centre, rowY + rowH * 0.43, windowWidth * 0.94,
        rowH * 0.57, ink, fs * 0.88, 'center');
    });
  });
  math(c, ['kg·m·s⁻¹'], x, y, fs * 2.9, rowH, color, fs * 0.77);
}

function notes(c, rect, model, state) {
  const { x, y, w, h, fs, color } = rect;
  const info = model.spring ? '光滑水平面 · 两物块与理想弹簧' : model.rough ?
    '瞬时碰撞外冲量忽略 · 接地后计摩擦热' : '光滑水平面 · 瞬时碰撞外冲量忽略';
  const momentum = [symbol('p', '总', true), ' = ', symbol('p', 1, true), ' + ', symbol('p', 2, true)];
  const balance = [symbol('E', '总'), ' = ', symbol('E', 'k,1'), ' + ', symbol('E', 'k,2')];
  if (model.spring) balance.push(' + ', symbol('E', 'p'), '，', symbol('E', 'p'), ' = ',
    { frac: [['1'], ['2']] }, symbol('k'), { symbol: 'x', sub: '形变', sup: 2 });
  if (!model.spring && model.e < 1) balance.push(' + ', symbol('ΔU', '碰'));
  if (model.rough) balance.push(' + ', symbol('Q', '滑'));
  const rows = [info, momentum, balance];
  if (model.rough) rows.push(['摩擦热计入物体与地面　', symbol('Q', '滑'), ' = ', symbol('μ', 'k'), symbol('g'),
    '(', symbol('m', 1), symbol('s', 1), ' + ', symbol('m', 2), symbol('s', 2), ')']);
  else if (model.collision) rows.push([symbol('e'), ' = ',
    { frac: [[symbol('v', 2), '′ − ', symbol('v', 1), '′'], [symbol('v', 1), ' − ', symbol('v', 2)]] },
    ' = ', ...quantity(model.e)]);
  if (model.geometricLimit && state.t === model.end) rows.push('两相向端面相接，观察到此为止');
  K.drawMathBlock(c, rows, x, y, { c: color, s: fs, maxWidth: w, maxHeight: h });
}

function draw(c, o, GH) {
  const b = GH.box(o);
  if (b.w < 120 || b.h < 100) return;
  const model = modelFor(o);
  const state = model.at(K.t(o));
  const details = K.showDetails(o);
  const fs = K.fs(K.S(b), 0.052, 9, 19);
  const lw = K.lw(o, 0.44);
  const color = o.color || '#e6edf7';
  const pad = Math.max(4, fs * 0.53);
  const gap = Math.max(3, fs * 0.45);
  const wide = b.w >= 335;
  const x = b.x1 + pad;
  const w = b.w - pad * 2;
  const h = b.h - pad * 2;
  const header = details ? fs * 1.15 + gap : 0;
  let y = b.y1 + pad;
  const event = model.events.find(item => Math.abs(item.t - state.t) <= timeEpsilon);
  K.box(c, b.x1 + lw / 2, b.y1 + lw / 2, b.w - lw, b.h - lw,
    K.alpha(color, 0.24), lw, K.alpha(color, 0.035), pad);
  if (details) {
    math(c, event?.label ?? state.stage, x, y, w * 0.67, header - gap, color, fs, 'left', false);
    math(c, [symbol('t'), ' = ', ...quantity(state.t, 's')], x + w, y, w * 0.33, header - gap, color, fs, 'right', false);
  } else if (model.geometricLimit && state.t === model.end) {
    math(c, '弹簧几何限位', x + w / 2, y, w * 0.7, fs, C.a, fs * 0.82, 'center');
  }
  y += header;
  const free = h - header;
  const trackH = free * (wide ? 0.37 : 0.30);
  track(c, { x, y, w, h: trackH, color, fs, lw }, model, state);
  y += trackH + gap;
  const remain = free - trackH - gap;
  const displacement = K.v(o, 'qMomentumGraph') === 1;
  if (wide) {
    const plotH = details ? remain * 0.55 : remain;
    const plotW = w * 0.54;
    timeGraph(c, { x, y, w: plotW - gap, h: plotH, color, fs }, model, state, displacement);
    energyChart(c, { x: x + plotW + gap, y, w: w - plotW - gap, h: plotH, color, fs }, model, state, details);
    if (details) {
      const lowerY = y + plotH + gap;
      const lowerH = remain - plotH - gap;
      momentumChart(c, { x, y: lowerY, w: plotW - gap, h: lowerH, color, fs }, model, state);
      notes(c, { x: x + plotW + gap, y: lowerY, w: w - plotW - gap, h: lowerH, color, fs: fs * 0.86 }, model, state);
    }
  } else {
    const plotH = remain * (details ? 0.62 : 1);
    timeGraph(c, { x, y, w: w * 0.55 - gap, h: plotH, color, fs }, model, state, displacement);
    energyChart(c, { x: x + w * 0.55 + gap, y, w: w * 0.45 - gap, h: plotH, color, fs }, model, state, details);
    if (details) momentumChart(c, { x, y: y + plotH + gap, w, h: remain - plotH - gap, color, fs }, model, state);
  }
}

K.reg({
  key: 'pm_momentum_energy', cat: 'mech', label: '动量与能量转化', animatable: true,
  params: ['qMomentumScene', ...Object.values(inputParams), 'qMomentumGraph', 'qMomentumPause', 'animSpeed'],
  icon: '<path d="M2 18h20M4 7h5m-2-2 2 2-2 2m13-2h-5m2-2-2 2 2 2"/><rect x="3" y="11" width="6" height="7"/><rect x="15" y="11" width="6" height="7"/>',
  showParam(o, key) {
    const scene = scenes[scenario(K.v(o, 'qMomentumScene'))];
    if (key === 'qMomentumE') return scene.restitution === null;
    if (key === 'qMomentumK') return !!scene.spring;
    if (key === 'qMomentumCompression') return scene.spring === 'attached';
    if (key === 'qMomentumMu') return !!scene.rough;
    return true;
  },
  animationTimeline(o) {
    const model = modelFor(o);
    return { duration: model.end, events: model.events, pauseAtEvents: !!K.v(o, 'qMomentumPause') };
  },
  draw
});
})();

/* ===== 上游 pm_g4_common.js ===== */
/* Shared presentation for the G4-A motion and graph models. */
(function () {
'use strict';
const K = window.__PM;
K.physics ||= {};
const symbol = (symbol, sub) => ({ symbol, sub, variableSub: sub === 'x' || sub === 'y' });
const quantity = (value, unit) => K.formatQuantity(value, unit, 2);

function number(o, key) {
  const def = K.TB.paramDefs[key];
  const value = +K.v(o, key);
  return Number.isFinite(value) ? K.clamp(value, def.min, def.max) : def.def;
}

function parameters(prefix, specs) {
  for (const [key, label, unit, min, max, step, def] of specs) {
    K.P(prefix + key, { label, unit, min, max, step, def });
  }
  return specs.map(([key]) => prefix + key);
}


function memo(make, keys) {
  let lastKey, lastModel;
  return o => {
    const key = JSON.stringify(keys.map(key => K.v(o, key)));
    if (key !== lastKey) {
      lastModel = make(o);
      lastKey = key;
    }
    return lastModel;
  };
}

function layout(o, GH, noteLines = 4.4) {
  const b = GH.box(o);
  if (b.w < 110 || b.h < 90) return null;
  const fs = K.fs(K.S(b), 0.044, 8, 17);
  const pad = fs * 0.65;
  const wide = b.w >= 1.35 * b.h;
  const noteH = K.showDetails(o) ? Math.min(b.h * 0.25, fs * noteLines) : 0;
  const w = b.w - 2 * pad;
  const h = b.h - 2 * pad - noteH;
  const shared = { fs, lw: K.lw(o, 0.44), color: o.color || '#e6edf7' };
  const mainW = wide ? w * 0.51 : w;
  const mainH = wide ? h : h * 0.49;
  const x = b.x1 + pad, y = b.y1 + pad;
  return {
    scene: { ...shared, x, y, w: mainW, h: mainH },
    plots: { ...shared, x: x + (wide ? mainW + pad : 0), y: y + (wide ? 0 : mainH + pad),
      w: wide ? w - mainW - pad : w, h: wide ? h : h - mainH - pad },
    notes: { ...shared, x, y: y + h + pad * 0.2, w, h: Math.max(0, noteH - pad * 0.2) }
  };
}

function label(c, b, tokens, x, y, color = b.color, align = 'left', width = b.w * 0.35) {
  K.drawMathLabel(c, tokens, x, y, { c: color, s: b.fs, al: align, essential: true,
    maxWidth: Math.max(1, width), maxHeight: b.fs * 1.25 });
}

function notes(c, b, lines) {
  if (b.h) K.drawMathBlock(c, lines, b.x, b.y, { c: b.color, s: b.fs,
    maxWidth: b.w, maxHeight: b.h });
}

function map(b, points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const s = Math.min(b.w * 0.73 / Math.max(0.1, x1 - x0), b.h * 0.65 / Math.max(0.1, y1 - y0));
  const X = x => b.x + b.w / 2 + (x - (x0 + x1) / 2) * s;
  const Y = y => b.y + b.h / 2 - (y - (y0 + y1) / 2) * s;
  return { X, Y, s, xy: p => [X(p.x), Y(p.y)] };
}

function graph(c, b, spec) {
  const { series, xLabel, yLabel, end, area, aids, xLabelAtTop, xmin = 0 } = spec;
  const xmax = end > 0 ? end : 1;
  const values = [0];
  for (const line of series) {
    for (let i = 0; i <= 96; i++) values.push(line.value(K.lerp(line.start || 0, line.end, i / 96)));
    for (const point of line.events || []) values.push(line.value(point));
  }
  const bottom = Math.min(...values), top = Math.max(...values);
  const span = Math.max(top - bottom, 0.01);
  const fs = Math.min(b.fs, b.h * 0.17, b.w * 0.09);
  const A = K.axes(c, b.x, b.y, b.w, b.h, {
    xmin, xmax, ymin: bottom < 0 ? bottom - span * .09 : 0, ymax: top + span * .12,
    xl: xLabelAtTop ? [] : xLabel, yl: yLabel, xLabelAbove: true, O: false, col: b.color, lw: 1, fs,
    pad: { l: fs * (b.w > 155 ? 3.35 : 1.5), r: fs * 1.35, t: fs * 1.4, b: fs * 1.25 }
  });
  if (xLabelAtTop) label(c, { ...b, fs }, xLabel, b.x + b.w - 2, b.y + 2, b.color, 'right', b.w * .32);
  for (const line of series) {
    const value = line.value, t = line.current;
    const start = line.start || 0;
    const breaks = (line.events || []).filter(x => x > start && x < line.end).sort((a, b) => a - b);
    const cuts = [start, ...breaks, line.end];
    for (let i = 1; i < cuts.length; i++) {
      const a = cuts[i - 1], z = cuts[i];
      if (area && t > a) {
        const edge = Math.min(t, z);
        const ink = value((a + edge) / 2) < 0 ? K.C.B : line.ink;
        K.fillUnder(c, A, value, a, edge, K.alpha(ink, .2));
      }
      K.plot(c, A, value, a, z, line.ink, b.lw, null, 48);
    }
    if (aids) {
      if (line.active !== false) {
        const y = value(t);
        K.guide(c, A, t, y, K.alpha(line.ink, .6), 0.8);
        if (line.slope) {
          const k = line.slope(t);
          const dx = Math.min((A.o.xmax - A.o.xmin) * .075, (A.o.ymax - A.o.ymin) * .11 / (Math.abs(k) || 1));
          const a = Math.max(start, t - dx), z = Math.min(line.end, t + dx);
          K.plot(c, A, x => y + k * (x - t), a, z, b.color, 1, [3, 3], 1);
        }
      }
      for (const x of line.events || []) {
        K.circ(c, A.X(x), A.Y(value(x)), 2.1, line.ink, 1);
      }
    }
    if (line.active !== false) K.dot(c, A.X(t), A.Y(value(t)), Math.max(2.1, fs * .25), line.ink);
  }
  if (b.w > 155 && b.h > 70) {
    const number = value => [Number(value.toPrecision(3)).toString()];
    if (end > 0) {
      K.line(c, A.X1, A.oy - 2, A.X1, A.oy + 2, b.color, 1);
      label(c, { ...b, fs }, number(end), A.X1, A.oy + 3, b.color, 'right', fs * 4);
    }
    for (const value of new Set([bottom, 0, top])) {
      const py = A.Y(value);
      if (value !== 0 && Math.abs(py - A.oy) < fs * 1.35) continue;
      K.line(c, A.ox - 2, py, A.ox + 2, py, b.color, 1);
      label(c, { ...b, fs }, number(value), A.ox - 4, py - fs / 2, b.color, 'right', fs * 3.1);
    }
  }
}

function graphs(c, b, specs) {
  const gap = b.fs * .32;
  const cols = specs.length === 1 ? 1 : 2;
  const rows = Math.ceil(specs.length / cols);
  const w = (b.w - gap * (cols - 1)) / cols;
  const h = (b.h - gap * (rows - 1)) / rows;
  for (const [i, spec] of specs.entries()) {
    graph(c, { ...b, x: b.x + (i % cols) * (w + gap), y: b.y + Math.floor(i / cols) * (h + gap), w, h }, spec);
  }
}

// Simpson integration of a smooth positive time density and inverse linear interpolation.
function timeMap(density, n = 512) {
  const times = [0];
  for (let i = 0; i < n; i++) {
    const a = i / n, z = (i + 1) / n;
    times.push(times[i] + (density(a) + 4 * density((a + z) / 2) + density(z)) / (6 * n));
  }
  const end = times[n];
  return { end, at(t) {
    if (t <= 0) return 0;
    if (t >= end) return 1;
    let low = 0, high = n;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (times[mid] <= t) low = mid;
      else high = mid;
    }
    return (low + (t - times[low]) / (times[high] - times[low])) / n;
  } };
}

K.reviewMotion = { symbol, quantity, parameters, number, memo, layout, label, notes, map, graphs, timeMap };
})();

/* ===== 上游 pm_g4_projectile.js ===== */
/* Projectile motion with ground, incline, a smooth approach arc and two launches. */
(function () {
'use strict';
const K = window.__PM, M = K.reviewMotion, C = K.C;
const motion = K.sampleConstantAcceleration;
const rad = deg => deg * Math.PI / 180;
const eps = 1e-9;

function flightTime(clearance, normalSpeed, g) {
  if (clearance <= eps) return Math.max(0, 2 * normalSpeed / g);
  const root = Math.sqrt(normalSpeed ** 2 + 2 * g * clearance);
  return normalSpeed >= 0 ? (normalSpeed + root) / g : 2 * clearance / (root - normalSpeed);
}

function solve({ scene = 0, speed = 12, angle = 35, height = 3, g = 9.8,
  slope = -20, position = 0, radius = 4, exit = 38, offset = 7, speed2 = 9, angle2 = 65 } = {}) {
  const incline = scene === 2 || scene === 3;
  const grade = incline ? Math.tan(rad(slope)) : 0;
  const ground = x => grade * (x - position);
  const guided = scene === 4;
  const theta = guided ? rad(exit) : scene === 0 || scene === 3 ? 0 : rad(angle);
  const h = scene === 2 ? 0 : height;
  const arcPoint = q => ({ x: position + radius * Math.sin(q), y: h + radius * (1 - Math.cos(q)) });
  const arcSpeed = q => Math.sqrt(speed ** 2 + 2 * g * radius * (Math.cos(q) - Math.cos(theta)));
  const clock = guided ? M.timeMap(u => radius * theta / arcSpeed(theta * u)) : null;
  const release = clock?.end || 0;
  const launch = guided ? arcPoint(theta) : { x: position, y: ground(position) + h };
  const makeFlight = (start, v, direction, delay, throughArc) => {
    const vx = v * Math.cos(direction), vy = v * Math.sin(direction);
    const span = flightTime(start.y - ground(start.x), vy - grade * vx, g);
    const end = delay + span;
    const apex = delay + K.clamp(vy / g, 0, span);
    const at = raw => {
      const t = K.clamp(raw, 0, end);
      if (throughArc && t < delay) {
        const q = theta * clock.at(t), v = arcSpeed(q);
        const centripetal = v ** 2 / radius;
        return { t, ...arcPoint(q), vx: v * Math.cos(q), vy: v * Math.sin(q),
          ax: -centripetal * Math.sin(q) - g * Math.sin(q) * Math.cos(q),
          ay: centripetal * Math.cos(q) - g * Math.sin(q) ** 2 };
      }
      const x = motion(vx, 0, t - delay), y = motion(vy, -g, t - delay);
      return { t, x: start.x + x.x, y: start.y + y.x, vx: x.v, vy: y.v, ax: 0, ay: -g };
    };
    return { at, end, apex, start, vx, vy };
  };
  const primary = makeFlight(launch, speed, theta, release, guided);
  const flights = [primary];
  if (scene === 5) flights.push(makeFlight({ x: position + offset, y: height }, speed2, rad(angle2), 0, false));
  const end = Math.max(...flights.map(p => p.end));
  const events = release ? [{ t: release, label: '圆弧出口' }] : [];
  for (const [i, p] of flights.entries()) {
    if (p.apex > release + eps && p.apex < p.end - eps) events.push({ t: p.apex, label: i ? 'B 最高点' : '最高点' });
    events.push({ t: p.end, label: i ? 'B 落点' : '落点' });
  }
  if (flights.length === 2) {
    const [a, b] = flights;
    const t = offset / (a.vx - b.vx);
    if (t > 0 && t <= Math.min(a.end, b.end) && Math.abs(a.at(t).y - b.at(t).y) <= eps) {
      events.push({ t, label: '两质点相遇' });
    }
  }
  events.sort((a, b) => a.t - b.t);
  const arc = guided ? Array.from({ length: 49 }, (_, i) => arcPoint(theta * i / 48)) : [];
  return { flights, ground, arc, launch, release, events, end, g, incline, radius };
}
K.physics.projectileComposite = solve;

const prefix = 'qProjectile';
const keys = M.parameters(prefix, [
  ['speed', '初速度（圆弧场景为出口速率）', 'm/s', 1, 28, .5, 12],
  ['angle', '抛射角', '°', -45, 85, 1, 35],
  ['height', '起始高度', 'm', 0, 20, .25, 3],
  ['g', '重力加速度', 'm/s²', 1, 20, .1, 9.8],
  ['slope', '斜面倾角（右升为正）', '°', -60, 60, 1, -20],
  ['position', '起始横坐标', 'm', -10, 10, .5, 0],
  ['radius', '圆弧半径', 'm', 1, 12, .25, 4],
  ['exit', '圆弧出口角', '°', 5, 85, 1, 38],
  ['offset', 'B 相对 A 的起始横坐标', 'm', -20, 20, .5, 7],
  ['speed2', 'B 初速度', 'm/s', 1, 28, .5, 9],
  ['angle2', 'B 抛射角', '°', -45, 85, 1, 65]
]);
K.sel('qProjectileScene', '情景', ['平抛', '斜抛', '在斜面上抛出', '平抛落向斜面', '圆弧出口接抛体', '双抛体比较'], 0);
K.tog('qProjectileAids', '速度分解、位移投影与坐标导线', true);
const modelFor = M.memo(o => solve(Object.fromEntries([
  ['scene', K.v(o, 'qProjectileScene')], ...keys.map(key => [key.slice(prefix.length), M.number(o, key)])
])), [...keys, 'qProjectileScene']);

function draw(c, o, GH) {
  const b = M.layout(o, GH);
  if (!b) return;
  const model = modelFor(o), { flights, ground, arc, release, end, g, radius } = model;
  const aids = !!K.v(o, 'qProjectileAids');
  const t = K.clamp(K.t(o), 0, end), p = b.scene;
  const inks = [p.color, C.g2];
  const samples = flights.map(f => Array.from({ length: 97 }, (_, i) => f.at(release + (f.end - release) * i / 96)));
  const points = [...arc, ...samples.flat(), ...flights.map(f => f.at(f.apex))];
  const lo = Math.min(...points.map(s => s.x), 0), hi = Math.max(...points.map(s => s.x), 0);
  const ext = Math.max(0.4, (hi - lo) * .06);
  const x0 = lo - ext, x1 = hi + ext;
  const header = Math.min(p.fs * 1.8, p.h * .21);
  const layout = { ...p, y: p.y + header, h: p.h - header };
  const A = M.map(layout, [...points, { x: x0, y: ground(x0) }, { x: x1, y: ground(x1) }]);
  const maximumSpeed = Math.max(...flights.flatMap(f => [f.at(0), f.at(f.end)].map(s => Math.hypot(s.vx, s.vy))));
  const maxAcceleration = arc.length ? g + maximumSpeed ** 2 / radius : g;
  const span = Math.min(layout.w, layout.h);
  const vscale = span * .115 / maximumSpeed, ascale = span * .10 / maxAcceleration;
  K.hatch(c, A.X(x0), A.Y(ground(x0)), A.X(x1), A.Y(ground(x1)), p.color, p.lw, p.fs * .75, 1);
  if (arc.length) K.poly(c, arc.map(A.xy), p.color, p.lw * 1.7);
  M.label(c, p, ['右为 +', M.symbol('x'), '，上为 +', M.symbol('y'), ' · 虚线为后续轨迹'],
    p.x, p.y, p.color, 'left', p.w * .92);
  for (const [i, f] of flights.entries()) {
    const ink = inks[i], state = f.at(t), first = f.at(0), [x, y] = A.xy(state);
    const flightPath = samples[i];
    const traveled = t >= release ? flightPath.filter(s => s.t < t).concat(state) : [];
    const future = t < release ? flightPath : [state, ...flightPath.filter(s => s.t > t)];
    if (future.length > 1) K.poly(c, future.map(A.xy), K.alpha(ink, .58), p.lw, [5, 4]);
    if (traveled.length > 1) K.poly(c, traveled.map(A.xy), ink, p.lw * 1.15);
    for (const [key, mark] of [['apex', 'H'], ['end', 'B']]) {
      if (key === 'apex' && f.apex <= release + eps) continue;
      const [px, py] = A.xy(f.at(f[key]));
      if (aids) {
        const apex = key === 'apex';
        const tag = [{ symbol: mark, sub: flights.length > 1 ? i + 1 : null }];
        M.label(c, p, tag, px + (apex ? -4 : 4), py - p.fs * (apex ? 1.25 : 1),
          ink, apex ? 'right' : 'left', p.fs * 1.6);
      }
      K.circ(c, px, py, 2.5, ink, 1);
    }
    if (aids) {
      K.poly(c, [A.xy(first), [x, A.Y(first.y)], [x, y]], K.alpha(ink, .55), .85, [3, 3]);
    }
    K.dot(c, x, y, Math.max(2.5, p.fs * .27), ink);
    if (flights.length > 1) M.label(c, p, [M.symbol(i ? 'B' : 'A')], x - 3, y, ink, 'right');
    // A landed marker remains at its point of impact. Its tangent is shown at the impact frame.
    if (t > f.end + eps) continue;
    const dx = state.vx * vscale, dy = -state.vy * vscale;
    if (aids && Math.min(Math.abs(dx), Math.abs(dy)) >= 2.5) {
      K.poly(c, [[x + dx, y], [x + dx, y + dy], [x, y + dy]], C.v, p.lw * .65, [3, 3]);
      K.arrow(c, x, y, x + dx, y, C.v, p.lw, p.fs * .45);
      K.arrow(c, x, y, x, y + dy, C.v, p.lw, p.fs * .45);
    }
    K.arrow(c, x, y, x + dx, y + dy, C.v, p.lw, 7);
    K.arrow(c, x, y, x + state.ax * ascale, y - state.ay * ascale, C.a, p.lw, 7);
    if (aids) {
      M.label(c, p, [{ ...M.symbol('v'), vector: true }], x + dx + 2, y + dy - p.fs, C.v);
      M.label(c, p, [{ ...M.symbol('a'), vector: true }], x + state.ax * ascale + 2, y - state.ay * ascale, C.a);
    }
  }
  const plots = [['x', 'x/m', C.B], ['y', 'y/m', C.a], ['vx', 'v_x/(m·s⁻¹)', C.v], ['vy', 'v_y/(m·s⁻¹)', C.F]];
  M.graphs(c, b.plots, plots.map(([key, yLabel, ink]) => ({
    xLabel: 't/s', yLabel, end, aids, series: flights.map((f, i) => ({
      ink: i ? C.g2 : ink, value: x => f.at(x)[key], end: f.end, current: Math.min(t, f.end),
      events: [release, f.apex, f.end].filter((x, j, all) => x > 0 && all.indexOf(x) === j)
    }))
  })));
  const state = flights[0].at(t), initial = flights[0].at(0);
  const event = model.events.find(e => Math.abs(t - e.t) <= eps);
  const flightClock = M.symbol(arc.length ? 'τ' : 't');
  M.notes(c, b.notes, [
    [M.symbol('x'), ' = ', M.symbol('x', '0'), ' + ', M.symbol('v', 'x'), flightClock, '，',
      M.symbol('y'), ' = ', M.symbol('y', '0'), ' + ', { symbol: 'v', sub: ['0', M.symbol('y')] },
      flightClock, ' − ', { frac: [['1'], ['2']] }, M.symbol('g'), { ...flightClock, sup: 2 }],
    [flights.length > 1 ? 'A  ' : '', M.symbol('t'), ' = ', ...M.quantity(state.t, 's'), '    Δ', M.symbol('x'), ' = ',
      ...M.quantity(state.x - initial.x, 'm'), '    Δ', M.symbol('y'), ' = ', ...M.quantity(state.y - initial.y, 'm')],
    arc.length ? [flightClock, ' 从圆弧出口计时 · 出口时刻 ', ...M.quantity(release, 's'), ' · 忽略空气阻力']
      : (event?.label || '抛体段忽略空气阻力')
  ]);
}

K.reg({
  key: 'pm_projectile_composite', cat: 'mech', label: '抛体运动·斜面与圆弧', animatable: true,
  params: ['qProjectileScene', ...keys, 'qProjectileAids', 'animSpeed'],
  icon: '<path d="M2 20h20M3 17Q11 0 21 18M5 13l5-5"/>',
  showParam(o, key) {
    const scene = K.v(o, 'qProjectileScene');
    const name = key.slice(prefix.length);
    if (name === 'height') return scene !== 2;
    if (name === 'angle') return scene === 1 || scene === 2 || scene === 5;
    if (name === 'slope') return scene === 2 || scene === 3;
    if (name === 'radius' || name === 'exit') return scene === 4;
    if (['offset', 'speed2', 'angle2'].includes(name)) return scene === 5;
    return true;
  },
  animationTimeline(o) {
    const { end, events } = modelFor(o);
    return { duration: end, events };
  },
  draw
});
})();

/* ===== 上游 pm_g4_circular.js ===== */
/* Vertical circles and local bridge arcs, with unilateral contact events. */
(function () {
'use strict';
const K = window.__PM, M = K.reviewMotion, C = K.C;
const pi = Math.PI, rad = a => a * pi / 180;
const eps = 1e-10;

function angles(cosine, a, z) {
  if (cosine < -1 - eps || cosine > 1 + eps) return [];
  const angle = Math.acos(K.clamp(cosine, -1, 1));
  return [...new Set([-angle, angle].flatMap(q => [-2 * pi, 0, 2 * pi, 4 * pi]
    .map(turn => q + turn)))].filter(q => q >= a - eps && q <= z + eps).sort((a, b) => a - b);
}

function solve({ mode = 0, mass = 1, r = 2, speed = 10, start = 0, g = 9.8,
  useEnergy = false, energy = 50 } = {}) {
  const bridge = mode >= 3, crest = mode === 3, rope = mode === 0;
  const gr = g * r;
  const v0 = useEnergy ? Math.sqrt(2 * energy / mass) : speed;
  const startAngle = bridge ? Math.min(start, 30) : start;
  const crestReturns = crest && v0 === 0 && startAngle > 0;
  const fallsBack = !bridge && v0 === 0 && startAngle > 0;
  const sign = (crest && !crestReturns) || fallsBack ? -1 : 1;
  const q0 = crestReturns ? pi + rad(startAngle)
    : bridge ? (crest ? pi : 0) - rad(startAngle) : rad(v0 === 0 ? -startAngle : startAngle);
  const qLimit = bridge ? (crest ? pi : 0) + pi / 4 : q0 + 2 * pi;
  const cos0 = Math.cos(q0);
  const xy = q => ({ x: sign * r * Math.sin(q), y: -r * Math.cos(q) });
  const v2 = q => v0 ** 2 - 4 * gr * Math.sin((q + q0) / 2) * Math.sin((q - q0) / 2);
  const normal = q => (v2(q) / r + g * Math.cos(q)) * mass;
  const total = .5 * mass * v0 ** 2 + mass * g * xy(q0).y;
  const reactionTolerance = 16 * Number.EPSILON * mass * (v0 ** 2 / r + g);
  const invalidStart = rope ? normal(q0) < -reactionTolerance : crest && normal(q0) > reactionTolerance;
  const contactRoots = angles((2 * gr * cos0 - v0 ** 2) / (3 * gr), q0, qLimit);
  let stop = qLimit, kind = '轨道段结束';
  if (invalidStart) {
    stop = q0;
    kind = '初态即脱离';
  } else if (rope || crest) {
    const detach = contactRoots.find(q => q < qLimit - eps
      && (rope ? Math.sin(q) > eps : Math.sin(q) < -eps));
    if (detach !== undefined) {
      stop = Math.max(q0, detach);
      kind = '脱离约束';
    } else if (crest && Math.abs(normal(q0)) <= eps * mass * g && Math.abs(q0 - pi) <= eps) {
      stop = q0;
      kind = '桥顶临界脱离';
    }
  }
  const equilibrium = v0 === 0 && Math.abs(Math.sin(q0)) <= eps;
  const turnCos = cos0 - v0 ** 2 / (2 * gr);
  const turning = angles(turnCos, q0, stop).find(q => q > q0 + eps && Math.sin(q) >= -eps);
  const asymptotic = turning !== undefined && Math.abs(turnCos + 1) <= 1e-13;
  if (turning !== undefined) {
    stop = asymptotic ? turning - 1e-5 : turning;
    kind = asymptotic ? '接近最高点（临界渐近）' : '瞬时静止并返回';
  }
  const detached = !equilibrium && ['初态即脱离', '脱离约束', '桥顶临界脱离'].includes(kind);
  const reverses = kind === '瞬时静止并返回';
  const span = stop - q0;
  function clock(a, z, n) {
    const gap = z - a;
    return M.timeMap(u => {
      const q = a + gap * Math.sin(pi * u / 2) ** 2;
      const sq = v2(q);
      if ((u === 0 && a === q0 && v0 === 0) || (u === 1 && z === stop && reverses)) {
        return r * pi * Math.sqrt(gap / Math.abs(2 * gr * Math.sin(q)));
      }
      return r * gap * pi * Math.sin(pi * u) / (2 * Math.sqrt(Math.max(1e-24, sq)));
    }, n);
  }
  const keyAngles = [...new Set([...angles(1, q0, stop), ...angles(-1, q0, stop),
    ...contactRoots])].filter(q => q > q0 + eps && q < stop - eps).sort((a, b) => a - b);
  const legs = [];
  let elapsed = 0;
  if (span > eps && !equilibrium) {
    const stops = [q0, ...keyAngles, stop];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1], z = stops[i];
      const time = clock(a, z, asymptotic && i === stops.length - 1 ? 4096 : 384);
      legs.push({ a, z, begin: elapsed, end: elapsed + time.end, time });
      elapsed += time.end;
    }
  }
  const events = legs.slice(0, -1).map(leg => {
    const q = leg.z, nearZero = Math.abs(normal(q)) < eps * mass * g;
    const top = Math.cos(q) < -1 + eps, bottom = Math.cos(q) > 1 - eps;
    return { t: leg.end, label: nearZero ? (top ? '最高点 · 约束力为零' : '约束力换向')
      : top ? '最高点' : bottom ? '最低点' : '临界位置' };
  });
  if (!equilibrium) events.push({ t: elapsed, label: kind });

  function onTrack(q, direction) {
    const v = Math.sqrt(Math.max(0, v2(q))) * direction;
    let N = normal(q);
    if (rope) N = Math.max(0, N);
    if (crest) N = Math.min(0, N);
    return { q, ...xy(q), vx: sign * v * Math.cos(q), vy: v * Math.sin(q),
      nx: -sign * Math.sin(q), ny: Math.cos(q), v: Math.abs(v), N, an: v ** 2 / r, free: false };
  }
  const launch = onTrack(stop, 1);
  let flightWindow = Math.sqrt(2 * r / g);
  let recontacts = false;
  if (detached) {
    // The tangential launch cancels the linear term of the squared radial distance.
    const delta = g * launch.y - launch.vx ** 2;
    if (delta >= 0) {
      const root = Math.sqrt(delta);
      const radial = v2(stop) - g * launch.y;
      // Use the rationalized smaller root for an uphill launch from the arch.
      const t = rope ? 2 * (launch.vy + root) / g
        : launch.vy > 0 ? 2 * radial / (g * (launch.vy + root)) : 0;
      if (t > 0 && t <= flightWindow) {
        const pointX = launch.x + launch.vx * t;
        const pointY = launch.y + launch.vy * t - g * t ** 2 / 2;
        const q = Math.atan2(sign * pointX, -pointY) + 2 * pi;
        const onBridge = [q, q - 2 * pi].some(a => a >= pi * .75 && a <= qLimit);
        if (rope || onBridge) {
          flightWindow = t;
          recontacts = true;
          events.push({ t: elapsed + t, label: rope ? '绳再次拉直 · 停于碰前' : '重新接触桥面 · 停于碰前' });
        }
      }
    }
  }
  const end = equilibrium ? 1 : detached ? elapsed + flightWindow : reverses ? 2 * elapsed : elapsed;
  function at(raw) {
    const t = K.clamp(raw, 0, end);
    let s;
    if (detached && t >= elapsed) {
      const dt = t - elapsed;
      const dx = K.sampleConstantAcceleration(launch.vx, 0, dt);
      const dy = K.sampleConstantAcceleration(launch.vy, -g, dt);
      s = { ...launch, x: launch.x + dx.x, y: launch.y + dy.x,
        vx: dx.v, vy: dy.v, v: Math.hypot(dx.v, dy.v), N: 0, an: 0, free: true };
    } else if (equilibrium) {
      s = onTrack(q0, 1);
    } else {
      const returnLeg = reverses && t > elapsed;
      const time = returnLeg ? 2 * elapsed - t : t;
      const leg = legs.find(part => time <= part.end) || legs.at(-1);
      const u = leg.time.at(time - leg.begin);
      const q = leg.a + (leg.z - leg.a) * Math.sin(pi * u / 2) ** 2;
      s = onTrack(q, returnLeg ? -1 : 1);
    }
    return { ...s, t, recontact: recontacts && t === end, kinetic: .5 * mass * s.v ** 2,
      potential: mass * g * s.y, mechanical: .5 * mass * s.v ** 2 + mass * g * s.y };
  }
  return { at, end, events, r, mass, g, mode, xy, total, detached, elapsed, q0, stop, qLimit,
    topCritical: Math.sqrt(gr), bottomCritical: Math.sqrt(5 * gr) };
}
K.physics.circularCritical = solve;

const prefix = 'qCircular';
const keys = M.parameters(prefix, [
  ['mass', '质量', 'kg', .1, 10, .1, 1],
  ['r', '半径', 'm', .5, 12, .25, 2],
  ['speed', '起始速率', 'm/s', 0, 30, .1, 10],
  ['start', '起始偏角（桥段最多 30°）', '°', 0, 160, 1, 0],
  ['g', '重力加速度', 'm/s²', 1, 20, .1, 9.8],
  ['energy', '初始动能', 'J', 0, 800, 1, 50]
]);
K.sel('qCircularMode', '约束', ['轻绳', '轻杆', '光滑圆管', '拱桥', '凹桥'], 0);
K.tog('qCircularEnergy', '用初始动能确定速率', false);
K.tog('qCircularPause', '在临界帧暂停', true);
const modelFor = M.memo(o => solve(Object.fromEntries([
  ['mode', K.v(o, 'qCircularMode')], ['useEnergy', K.v(o, 'qCircularEnergy')],
  ...keys.map(key => [key.slice(prefix.length), M.number(o, key)])
])), [...keys, 'qCircularMode', 'qCircularEnergy']);

function draw(c, o, GH) {
  const b = M.layout(o, GH);
  if (!b) return;
  const m = modelFor(o), p = b.scene, s = m.at(K.t(o));
  const bridge = m.mode >= 3, rail = bridge || m.mode === 2;
  const bend = bridge ? (m.mode === 3 ? pi : 0) : pi;
  const reach = bridge ? pi / 4 : pi;
  const track = Array.from({ length: 97 }, (_, i) => m.xy(bend - reach + 2 * reach * i / 96));
  const free = m.detached ? Array.from({ length: 49 }, (_, i) => m.at(m.elapsed + (m.end - m.elapsed) * i / 48)) : [];
  const centre = { x: 0, y: 0 }, A = M.map(p, [...track, ...free, ...(bridge ? [] : [centre])]);
  K.poly(c, track.map(A.xy), rail ? p.color : K.alpha(p.color, .5), rail ? p.lw * 1.25 : .9, rail ? null : [5, 4]);
  if (m.mode === 2) K.poly(c, track.map(pt => A.xy({ x: pt.x * 1.05, y: pt.y * 1.05 })), p.color, p.lw * .8);
  if (free.length) {
    const traveled = free.filter(pt => pt.t < s.t);
    if (s.free) traveled.push(s);
    if (traveled.length > 1) K.poly(c, traveled.map(A.xy), p.color, p.lw);
    const future = free.filter(pt => pt.t > s.t);
    if (s.free) future.unshift(s);
    if (future.length > 1) K.poly(c, future.map(A.xy), K.alpha(p.color, .6), p.lw, [4, 4]);
  }
  const [x, y] = A.xy(s);
  if (!bridge) {
    const [cx, cy] = A.xy(centre);
    K.dot(c, cx, cy, 2.5, p.color);
    if (!s.free) K.line(c, cx, cy, x, y, p.color, m.mode === 1 ? p.lw * 1.8 : p.lw, m.mode === 2 ? [3, 3] : null);
  }
  const span = Math.min(p.w, p.h);
  const weight = m.mass * m.g;
  const criticalY = [m.q0, m.stop, ...angles(1, m.q0, m.stop), ...angles(-1, m.q0, m.stop)].map(q => m.xy(q).y);
  const maxTrackSpeed2 = Math.max(0, 2 * (m.total / m.mass - m.g * Math.min(...criticalY)));
  const maxForce = m.detached && m.elapsed === 0 ? weight
    : Math.max(weight, ...criticalY.map(y => Math.abs((2 * m.total - 3 * weight * y) / m.r)));
  const forceScale = span * .125 / maxForce;
  const speedScale = span * .125 / Math.max(1, Math.sqrt(maxTrackSpeed2), m.at(m.end).v);
  const arrow = (baseX, baseY, dx, dy, ink, tag, side, verticalOffset) => {
    if (Math.hypot(dx, dy) < .5) return;
    const fx = baseX + dx, fy = baseY - dy;
    K.arrow(c, baseX, baseY, fx, fy, ink, p.lw, p.fs * .46);
    const textX = K.clamp(fx + side * p.fs * .42, p.x + p.fs * 1.7, p.x + p.w - p.fs * 1.7);
    const textY = K.clamp(fy + p.fs * verticalOffset, p.y + p.fs * 1.3, p.y + p.h - p.fs * 1.25);
    M.label(c, p, tag, textX, textY, ink, side < 0 ? 'right' : 'left', p.fs * 1.6);
  };
  arrow(x, y, s.vx * speedScale, s.vy * speedScale, C.v, [M.symbol('v')], 1, -1.15);
  // Draw the shorter of two collinear forces last so both arrowheads stay visible.
  const forces = [[0, -weight, [M.symbol('G')], -1, .25],
    [s.nx * s.N, s.ny * s.N, [M.symbol(m.mode < 2 ? 'T' : 'N')], 1, .1]];
  forces.sort((a, b) => Math.hypot(b[0], b[1]) - Math.hypot(a[0], a[1]));
  for (const [fx, fy, tag, side, offset] of forces) arrow(x, y, fx * forceScale, fy * forceScale, C.F, tag, side, offset);
  if (!s.free && maxTrackSpeed2 > eps) {
    const offset = p.fs * .32;
    const baseX = x - s.ny * offset, baseY = y - s.nx * offset;
    const normalLength = span * .09 * s.an * m.r / maxTrackSpeed2;
    arrow(baseX, baseY, s.nx * normalLength, s.ny * normalLength, C.a, [M.symbol('a', 'n')], -1, -1.1);
  }
  K.dot(c, x, y, Math.max(2.4, p.fs * .25), p.color);
  M.label(c, p, s.recontact ? m.events.at(-1).label : s.free ? '脱离后仅受重力 · 虚线为后续轨迹'
    : rail ? '同类箭长成比例' : '虚线为参考圆或后续轨迹', p.x, p.y, p.color, 'left', p.w * .95);
  const series = (ink, value) => ({ ink, value, end: m.end, current: s.t, events: m.events.map(e => e.t) });
  M.graphs(c, b.plots, [
    { yLabel: m.mode < 2 ? 'T/N' : 'N/N', series: [series(C.F, t => m.at(t).N)] },
    { yLabel: 'E/J', series: [series(C.a, t => m.at(t).mechanical)] }
  ].map(spec => ({ ...spec, xLabel: 't/s', end: m.end, aids: true })));
  const critical = m.mode === 0 ? [
    '绳始终张紧并绕行时，最高点临界速率 ', ...M.quantity(m.topCritical, 'm·s⁻¹'),
    '，最低点临界速率 ', ...M.quantity(m.bottomCritical, 'm·s⁻¹')
  ] : m.mode === 3 ? ['桥顶临界速率 ', ...M.quantity(m.topCritical, 'm·s⁻¹')]
    : bridge ? '桥底支持力为重力与所需向心合力之和' : '双向约束：最高点恰达能量阈值时渐近静止';
  M.notes(c, b.notes, [
    [M.symbol('a', 'n'), ' = ', { frac: [[{ symbol: 'v', sup: 2 }], [M.symbol('r')]] },
      '（圆轨道段） · 径向向心为正 · 势能零点取圆心高度'],
    [M.symbol('t'), ' = ', ...M.quantity(s.t, 's'), '    ', M.symbol('E'), ' = ', ...M.quantity(s.mechanical, 'J'),
      '    ', M.symbol(m.mode < 2 ? 'T' : 'N'), ' = ', ...M.quantity(s.N, 'N')],
    critical
  ]);
}

K.reg({
  key: 'pm_circular_critical', cat: 'mech', label: '圆周临界·绳杆管与桥', animatable: true,
  params: ['qCircularMode', ...keys, 'qCircularEnergy', 'qCircularPause', 'animSpeed'],
  icon: '<circle cx="12" cy="12" r="8"/><path d="M12 12V4m0 0h9m-3-3 3 3-3 3"/>',
  showParam(o, key) {
    if (key === 'qCircularspeed') return !K.v(o, 'qCircularEnergy');
    if (key === 'qCircularenergy') return !!K.v(o, 'qCircularEnergy');
    return true;
  },
  animationTimeline(o) {
    const { end, events } = modelFor(o);
    return { duration: end, events, pauseAtEvents: !!K.v(o, 'qCircularPause') };
  },
  draw
});
})();

/* ===== 上游 pm_g4_work.js ===== */
/* Work and power from the same piecewise-affine one-dimensional force law. */
(function () {
'use strict';
const K = window.__PM, M = K.reviewMotion, C = K.C;
const pi = Math.PI, eps = 1e-10;

function affineMotion(v0, f0, k, mass) {
  const a = f0 / mass;
  if (!k) {
    return {
      timeAt: x => 2 * x / (v0 + Math.sqrt(Math.max(0, v0 ** 2 + 2 * a * x))),
      positionAt: t => K.sampleConstantAcceleration(v0, a, t).x,
      speedSquared: x => v0 ** 2 + 2 * a * x,
      gap: v0 ** 2
    };
  }
  const omega = Math.sqrt(Math.abs(k) / mass), shift = f0 / k;
  const gap = v0 ** 2 - f0 ** 2 / (k * mass);
  const speedSquared = x => k > 0 && Math.abs(x + shift) < Math.abs(shift) * .25
    ? gap + (omega * (x + shift)) ** 2
    : v0 ** 2 + x * (2 * f0 + k * x) / mass;
  if (k < 0) {
    const phase = x => Math.asin(K.clamp(omega * (x + shift) / Math.sqrt(gap), -1, 1));
    const initial = phase(0);
    return { gap, speedSquared, timeAt: x => (phase(x) - initial) / omega,
      positionAt: t => v0 / omega * Math.sin(omega * t) - 2 * shift * Math.sin(omega * t / 2) ** 2 };
  }
  const sign = Math.sign(shift);
  const phase = gap > 0
    ? x => Math.asinh(omega * (x + shift) / Math.sqrt(gap))
    : gap < 0
      ? x => sign * Math.acosh(Math.max(1, omega * Math.abs(x + shift) / Math.sqrt(-gap)))
      : x => sign * Math.log(Math.abs(x + shift));
  const initial = phase(0);
  const grow = shift < 0 ? gap / (2 * omega * (v0 - omega * shift)) : (shift + v0 / omega) / 2;
  const decay = shift > 0 ? -gap / (2 * omega * (v0 + omega * shift)) : (shift - v0 / omega) / 2;
  return { gap, speedSquared, timeAt: x => (phase(x) - initial) / omega,
    positionAt: t => grow * Math.expm1(omega * t) + decay * Math.expm1(-omega * t) };
}
function solve({ scene = 0, mass = 1, speed = 5, length = 8, drive = 4, gradient = -1,
  spring = 5, angle = 20, mu = .22, g = 9.8 } = {}) {
  const slope = scene === 3 ? angle * pi / 180 : 0;
  const friction = scene === 4 || scene === 5 ? mu * mass * g : 0;
  const height = x => x * Math.sin(slope);
  const potential = x => scene === 2 ? .5 * spring * x ** 2 : mass * g * height(x);
  const stages = [
    [{ length, drive, gradient: 0 }],
    [{ length, drive, gradient }],
    [{ length, drive: 0, gradient: 0, spring }],
    [{ length, drive: 0, gradient: 0 }],
    [{ length, drive, gradient: 0 }],
    [{ length: length / 2, drive, gradient }, { length: length / 2, drive: 0, gradient: 0 }]
  ][scene];
  const initialEnergy = .5 * mass * speed ** 2;
  let startX = 0, startTime = 0, appliedWork = 0, incoming = speed;
  let stopped = false, asymptotic = false;
  const parts = [], events = [];
  for (const stage of stages) {
    const length = stage.length;
    const f0 = stage.drive - friction - mass * g * Math.sin(slope) - (stage.spring || 0) * startX;
    const k = stage.gradient - (stage.spring || 0);
    const force = s => f0 + k * s;
    const motion = affineMotion(incoming, f0, k, mass);
    const v2 = motion.speedSquared;
    const minimum = k > 0 ? K.clamp(-f0 / k, 0, length) : length;
    let travel = length;
    const tangent = k > 0 && minimum > 0 && Math.abs(force(minimum)) <= eps
      && Math.abs(motion.gap) <= 8 * Number.EPSILON * incoming ** 2;
    if (v2(minimum) <= 0 || tangent) {
      stopped = true;
      if (tangent) {
        asymptotic = true;
        travel = minimum * (1 - 1e-5);
      } else {
        let a = 0, z = minimum;
        for (let i = 0; i < 52; i++) {
          const m = (a + z) / 2;
          if (v2(m) > 0) a = m;
          else z = m;
        }
        travel = z;
      }
    }
    const initial = { x: startX, t: startTime, work: appliedWork, speed: incoming };
    const duration = motion.timeAt(travel);
    const elapsedAt = motion.timeAt;
    const stopHere = stopped && !asymptotic;
    function state(s, t) {
      const x = initial.x + s;
      const v = stopHere && s >= travel ? 0 : Math.sqrt(Math.max(0, v2(s)));
      const F = force(s), E = .5 * mass * v ** 2, U = potential(x), heat = friction * x;
      return { t, x, v, F, E, U, heat, P: F * v, W: E - initialEnergy,
        appliedWork: initial.work + s * (stage.drive + .5 * stage.gradient * s) };
    }
    const pointAtX = x => {
      const s = K.clamp(x - initial.x, 0, travel);
      return state(s, initial.t + elapsedAt(s));
    };
    const pointAtT = t => {
      const elapsed = t - initial.t;
      const s = t >= initial.t + duration ? travel : K.clamp(motion.positionAt(elapsed), 0, travel);
      return state(s, t);
    };
    const forceZero = k ? -f0 / k : -1;
    const powerExtrema = k ? (f0 ** 2 - k * mass * initial.speed ** 2) / 2 : -1;
    const powerCuts = powerExtrema >= 0 ? [Math.sqrt(powerExtrema), -Math.sqrt(powerExtrema)]
      .map(f => (f - f0) / k).filter(x => x > 0 && x < travel) : [];
    const xCuts = [forceZero].filter(x => x > 0 && x < travel);
    if (xCuts.length) events.push({ t: startTime + elapsedAt(forceZero), label: '合力和瞬时功率为零' });
    startTime += duration;
    startX += travel;
    appliedWork = pointAtX(startX).appliedWork;
    incoming = pointAtX(startX).v;
    parts.push({ startX: initial.x, startT: initial.t, endX: startX, endT: startTime, pointAtX, pointAtT,
      xCuts: xCuts.map(x => initial.x + x),
      tCuts: [...xCuts, ...powerCuts].map(x => initial.t + elapsedAt(x)) });
    if (stopped) break;
    if (stage !== stages.at(-1)) events.push({ t: startTime, label: '换段 · 合力突变' });
  }
  events.push({ t: startTime, label: asymptotic ? '接近临界静止位置' : stopped ? '首次停止' : '到达轨道端点' });
  const partFor = t => parts.find(part => t < part.endT) || parts.at(-1);
  const at = t => {
    const time = K.clamp(t, 0, startTime);
    return partFor(time).pointAtT(time);
  };
  const limits = parts.flatMap(part => [part.startX, ...part.xCuts, part.endX].map(part.pointAtX));
  return { end: startTime, endX: startX, parts, events, at, partFor, initialEnergy, slope, height, length, scene, friction,
    maxSpeed: Math.max(speed, ...limits.map(s => s.v)), maxForce: Math.max(0, ...limits.map(s => Math.abs(s.F))) };
}
K.physics.workEnergyGraphs = solve;

const prefix = 'qWork';
const keys = M.parameters(prefix, [
  ['mass', '质量', 'kg', .2, 10, .1, 1],
  ['speed', '初速度（向前）', 'm/s', .5, 20, .25, 5],
  ['length', '观察轨道长', 'm', 1, 20, .5, 8],
  ['drive', '起始外力分量', 'N', -30, 30, .5, 4],
  ['gradient', '外力变化率', 'N/m', -12, 12, .25, -1],
  ['spring', '弹簧劲度系数', 'N/m', .5, 30, .5, 5],
  ['angle', '上坡倾角', '°', 0, 60, 1, 20],
  ['mu', '动摩擦因数', '', 0, .8, .01, .22],
  ['g', '重力加速度', 'm/s²', 1, 20, .1, 9.8]
]);
K.sel('qWorkScene', '情景', ['恒力', '线性变力', '弹簧', '上坡重力势能', '粗糙面', '有外力 → 仅摩擦'], 0);
K.tog('qWorkAids', '面积、关键点和坐标投影', true);
K.tog('qWorkAnswer', '显示关系式和计算结果（需开启讲解）', true);
const modelFor = M.memo(o => solve(Object.fromEntries([
  ['scene', K.v(o, 'qWorkScene')], ...keys.map(key => [key.slice(prefix.length), M.number(o, key)])
])), [...keys, 'qWorkScene']);

function draw(c, o, GH) {
  const b = M.layout(o, GH);
  if (!b) return;
  const m = modelFor(o), s = m.at(K.t(o)), p = b.scene;
  const aids = !!K.v(o, 'qWorkAids');
  const point = x => ({ x: x * Math.cos(m.slope), y: m.height(x) });
  const start = point(0), end = point(m.length), A = M.map(p, [start, end]);
  const [sx, sy] = A.xy(start), [ex, ey] = A.xy(end);
  if (m.friction) K.hatch(c, sx, sy, ex, ey, p.color, p.lw, p.fs * .68, 1);
  else K.line(c, sx, sy, ex, ey, p.color, p.lw);
  const [x, y] = A.xy(point(s.x));
  const r = Math.min(p.w, p.h) * .038;
  const cx = x - r * Math.sin(m.slope), cy = y - r * Math.cos(m.slope);
  if (m.scene === 2) {
    K.hatch(c, sx - r * 3.2, sy - r * 3, sx - r * 3.2, sy, p.color, p.lw, r * .65, 1);
    K.spring(c, sx - r * 3.2, cy, cx - r * 1.25, cy, 8, r * .48, p.color, p.lw);
  }
  K.block(c, cx, cy, r * 2.5, r * 2, -m.slope, p.color, p.lw);
  K.dot(c, sx, sy, 2, p.color);
  const [tx, ty] = A.xy(point(m.endX));
  if (m.endX < m.length - eps) K.circ(c, tx, ty, 2.4, p.color, 1);
  const arrow = (val, max, offset, ink, tag) => {
    if (Math.abs(val) <= eps || max <= eps) return;
    const length = val / max * Math.min(p.w, p.h) * .125;
    const dx = length * Math.cos(m.slope), dy = length * Math.sin(m.slope);
    const ax = cx - offset * Math.sin(m.slope), ay = cy - offset * Math.cos(m.slope);
    K.arrow(c, ax, ay, ax + dx, ay - dy, ink, p.lw, p.fs * .46);
    const xText = K.clamp(ax + dx + Math.sign(val) * 3, p.x + p.fs * 2, p.x + p.w - p.fs * 2);
    M.label(c, p, tag, xText, Math.max(p.y + p.fs * 1.3, ay - dy - p.fs), ink,
      val > 0 ? 'left' : 'right', p.fs * 1.9);
  };
  arrow(s.v, m.maxSpeed, r * 2.4, C.v, [M.symbol('v')]);
  arrow(s.F, m.maxForce, 0, C.F, [M.symbol('F', '合')]);
  if (Math.abs(s.F) > eps) K.dot(c, cx, cy, Math.max(1.5, p.lw * .8), p.color);
  K.arrow(c, sx, sy + p.fs, sx + (ex - sx) * .25, sy + p.fs + (ey - sy) * .25, p.color, 1, 5);
  M.label(c, p, [M.symbol('x'), '/m'], sx, sy + 2 * p.fs, p.color);
  M.label(c, p, '沿轨道向前为正 · 同类箭长成比例', p.x, p.y, p.color, 'left', p.w * .85);

  const active = m.partFor(s.t);
  const plots = [
    ['F', 'F_x/N', C.F, false, true],
    ['E', 'E_k/J', C.v, false, false],
    ['U', 'E_p/J', C.a, false, false],
    ['P', 'P/W', C.I, true, true]
  ];
  M.graphs(c, b.plots, plots.map(([key, yLabel, ink, time, area]) => ({
    xLabel: time ? 't/s' : 'x/m', yLabel, end: time ? m.end : m.endX, aids, area: aids && area,
    series: m.parts.map(part => {
      const [start, end, at, current, events] = time
        ? [part.startT, part.endT, part.pointAtT, s.t, part.tCuts]
        : [part.startX, part.endX, part.pointAtX, s.x, part.xCuts];
      return { start, end, value: x => at(x)[key], events, ink,
        slope: key === 'E' ? x => at(x).F : null, current: K.clamp(current, start, end), active: part === active };
    })
  })));
  const answer = K.v(o, 'qWorkAnswer');
  M.notes(c, b.notes, [
    answer ? ['Δ', M.symbol('E', 'k'), ' = ', M.symbol('W', 'net'), ' = ∫', M.symbol('F', 'x'), ' d', M.symbol('x'),
      ' = ∫', M.symbol('P'), ' d', M.symbol('t'), '，', M.symbol('P'), ' = ', M.symbol('F', 'x'), M.symbol('v'), '，斜率 d', M.symbol('E', 'k'), '/d', M.symbol('x'), ' = ', M.symbol('F', 'x')]
      : '比较两块有符号面积，并判断动能曲线斜率与合力方向的关系。',
    [M.symbol('x'), ' = ', ...M.quantity(s.x, 'm'), '    ', M.symbol('v'), ' = ', ...M.quantity(s.v, 'm·s⁻¹'),
      '    ', M.symbol('F', 'x'), ' = ', ...M.quantity(s.F, 'N'), '    ', M.symbol('P'), ' = ', ...M.quantity(s.P, 'W')],
    answer ? [M.symbol('W', 'net'), ' = ', ...M.quantity(s.W, 'J'), '    ', M.symbol('E', 'k'), ' = ', ...M.quantity(s.E, 'J'),
      '    ', M.symbol('E', 'p'), ' = ', ...M.quantity(s.U, 'J'), '    ', M.symbol('Q'), ' = ', ...M.quantity(s.heat, 'J')]
      : '讨论机械能变化、外力做功与摩擦生热。'
  ]);
}

K.reg({
  key: 'pm_work_energy_graphs', cat: 'graph', label: '功与能量·四图联动', animatable: true,
  params: ['qWorkScene', ...keys, 'qWorkAids', 'qWorkAnswer', 'animSpeed'],
  icon: '<path d="M3 3v17h18M3 14l7-5 5 2 6-7M3 17h18"/>',
  showParam(o, key) {
    const scene = K.v(o, 'qWorkScene');
    if (key === 'qWorkdrive') return scene === 0 || scene === 1 || scene >= 4;
    if (key === 'qWorkgradient') return scene === 1 || scene === 5;
    if (key === 'qWorkspring') return scene === 2;
    if (key === 'qWorkangle') return scene === 3;
    if (key === 'qWorkmu') return scene >= 4;
    if (key === 'qWorkg') return scene === 3 || scene >= 4;
    return true;
  },
  animationTimeline(o) {
    const { end, events } = modelFor(o);
    return { duration: end, events };
  },
  draw
});
})();

/* ===== 上游 pm_g4b_wave.js ===== */
/* Quantitative wave modes for the existing travel, superposition and interference diagrams. */
(function () {
'use strict';
const K = window.__PM, M = K.reviewMotion, C = K.C;
const { PI, TAU } = K;
const radians = value => value * PI / 180;
const byDirection = value => value === 1 ? -1 : 1;

function harmonic({ speed = 2, period = 2, frequency = .5, wavelength = 4,
  control = 0, amplitude = .5, phase = 0, direction = 1 } = {}) {
  if (control === 1) period = 1 / frequency;
  if (control === 2) period = wavelength / speed;
  if (control === 3) speed = wavelength / period;
  const omega = TAU / period, k = omega / speed;
  function at(x, t) {
    const angle = omega * t - direction * k * x + phase;
    return { y: amplitude * Math.sin(angle), vy: amplitude * omega * Math.cos(angle), phase: angle };
  }
  return { speed, wavelength: speed * period, frequency: 1 / period, period, amplitude, omega, k, direction, phase, at };
}

function superpose(first, second) {
  const a = harmonic(first);
  const b = harmonic({ ...second, speed: a.speed });
  function at(x, t) {
    const p = a.at(x, t), q = b.at(x, t);
    return { p, q, y: p.y + q.y, vy: p.vy + q.vy };
  }
  return { a, b, amplitude: a.amplitude + b.amplitude, at };
}

function standing(options = {}) {
  const { amplitude = .5, period = 2, speed = 2 } = options;
  const wave = superpose({ amplitude, period, speed, phase: PI }, { amplitude, period, direction: -1 });
  const envelope = x => wave.amplitude * Math.abs(Math.sin(wave.a.k * x));
  return { ...wave, envelope, nodeSpacing: wave.a.wavelength / 2 };
}

function interference({ s1 = { x: 3, y: 4 }, s2 = { x: 9, y: 4 },
  wavelength = 2, period = 2, amplitude = .7, amplitude2 = .7, phase2 = 0 } = {}) {
  const k = TAU / wavelength, omega = TAU / period;
  function probe(x, y) {
    const r1 = Math.hypot(x - s1.x, y - s1.y), r2 = Math.hypot(x - s2.x, y - s2.y);
    const path = r2 - r1, phase = phase2 - k * path;
    const a = amplitude + amplitude2 * Math.cos(phase), b = amplitude2 * Math.sin(phase);
    function at(t) {
      const p = omega * t - k * r1;
      return a * Math.sin(p) + b * Math.cos(p);
    }
    return { r1, r2, path, phase, amplitude: Math.hypot(a, b), at };
  }
  function wavefrontStart(t, source) {
    return K.mod((omega * t + (source === 2 ? phase2 : 0) - PI / 2) / k, wavelength);
  }
  return { probe, wavefrontStart, wavelength, period, amplitude, amplitude2, phase2, s1, s2 };
}

K.physics.waveInterference = { harmonic, superpose, standing, interference, locusGeometry };

const prefix = 'qWave';
M.parameters(prefix, [
  ['Amplitude', '波源 1 振幅', 'm', 0, 1.5, .01, .5],
  ['Amplitude2', '波源 2 振幅', 'm', 0, 1.5, .01, .5],
  ['Speed', '波速', 'm/s', .5, 6, .05, 2],
  ['Period', '周期', 's', .25, 5, .05, 2],
  ['Frequency', '波源 1 频率', 'Hz', .2, 4, .05, .5],
  ['Frequency2', '波源 2 频率', 'Hz', .2, 4, .05, .75],
  ['Length', '波源 1 波长', 'm', .5, 8, .05, 4],
  ['Length2', '波源 2 波长', 'm', .5, 8, .05, 3],
  ['Phase', '波源 1 初相位', '°', -180, 180, 1, 0],
  ['Phase2', '波源 2 初相位 / 相对相位差', '°', -180, 180, 1, 0],
  ['Probe', '观察点横坐标（视窗比例）', '%', 5, 95, 1, 38],
  ['WaterWidth', '观察区域宽度', 'm', 4, 20, .25, 12],
  ['S1X', '波源 1 横坐标（视窗比例）', '%', 5, 95, 1, 27],
  ['S1Y', '波源 1 纵坐标（视窗比例）', '%', 5, 95, 1, 50],
  ['S2X', '波源 2 横坐标（视窗比例）', '%', 5, 95, 1, 73],
  ['S2Y', '波源 2 纵坐标（视窗比例）', '%', 5, 95, 1, 50],
  ['WaterX', '观察点横坐标（视窗比例）', '%', 5, 95, 1, 58],
  ['WaterY', '观察点纵坐标（视窗比例）', '%', 5, 95, 1, 76]
]);
K.sel('qWaveControl', '行波调参方式', ['固定波速，调周期', '固定波速，调频率',
  '固定波速，调波长', '固定周期，调波长'], 0);
K.sel('qWavePairControl', '同一介质中的控制量', ['共同波速与各自频率', '共同波速与各自波长'], 0);
K.sel('qWaveDir2', '波源 2 传播方向', ['向右（+x）', '向左（−x）'], 1);
K.sel('qWaveWaterLayer', '二维场显示', ['合位移', '合振幅'], 0);
K.tog('qWaveTravel', '定量行波与质点图像', false);
K.tog('qWaveWater', '相干波场动画与测量', false);
K.tog('qWaveAnswer', '显示计算结果（需开启讲解）', true);
K.tog('qWaveWaterLoci', '显示相长及相消条件线', true);

const key = name => prefix + name;
const names = list => list.map(key);
const read = (o, name) => M.number(o, key(name));
const symbol = M.symbol;
const phaseToken = sub => symbol('φ', sub);
const velocityToken = () => ({ symbol: 'v', sub: 'y', variableSub: true, vector: true });
const readWave = (o, control, second = false) => {
  const ext = second ? '2' : '';
  return {
    control, amplitude: read(o, 'Amplitude' + ext),
    period: read(o, 'Period'), frequency: read(o, 'Frequency' + ext),
    wavelength: read(o, 'Length' + ext), speed: read(o, 'Speed'),
    phase: radians(read(o, 'Phase' + ext)),
    direction: byDirection(K.v(o, second ? 'qWaveDir2' : 'qWDir'))
  };
};

function travelModel(o) {
  const wave = harmonic(readWave(o, K.v(o, 'qWaveControl')));
  const extent = wave.wavelength * Number(K.v(o, 'qWN'));
  return { a: wave, extent, probeX: extent * read(o, 'Probe') / 100, end: wave.period * 2,
    amplitude: wave.amplitude, at: wave.at };
}

function pairModel(o) {
  const control = K.v(o, 'qWavePairControl') === 1 ? 2 : 1;
  const wave = superpose(readWave(o, control), readWave(o, control, true));
  const extent = Math.max(wave.a.wavelength, wave.b.wavelength) * 2;
  return { ...wave, extent, probeX: extent * read(o, 'Probe') / 100,
    end: Math.max(wave.a.period, wave.b.period) * 2 };
}

function standingModel(o) {
  const wave = standing({ amplitude: read(o, 'Amplitude'), period: read(o, 'StandPeriod'), speed: read(o, 'Speed') });
  const nodes = Math.round(Number(K.v(o, 'qSWN')));
  const extent = wave.nodeSpacing * nodes;
  return { ...wave, nodes, extent, probeX: extent * read(o, 'Probe') / 100, end: wave.a.period * 2 };
}

function waterModel(o) {
  const w = read(o, 'WaterWidth'), h = w * .66;
  const point = (x, y) => ({ x: w * read(o, x) / 100, y: h * read(o, y) / 100 });
  const model = interference({
    s1: point('S1X', 'S1Y'), s2: point('S2X', 'S2Y'), wavelength: read(o, 'Length'),
    period: read(o, 'Period'), amplitude: read(o, 'Amplitude'), amplitude2: read(o, 'Amplitude2'),
    phase2: radians(read(o, 'Phase2'))
  });
  const p = point('WaterX', 'WaterY');
  return { ...model, p, w, h, end: model.period * 2, state: model.probe(p.x, p.y) };
}

function panelLabel(c, p, content, x, y, width, ink = p.color, align = 'left') {
  K.drawMathLabel(c, content, x, y, {
    s: p.fs, c: ink, al: align, maxWidth: width, maxHeight: p.fs * 1.12, essential: true
  });
}

function graphAxes(c, p, extent, amplitude, axis, extra = 0) {
  const fs = p.fs, scale = Math.max(.001, amplitude) * 1.18;
  return K.axes(c, p.x, p.y + fs * 1.45, p.w, p.h - fs * 1.45, {
    xmin: 0, xmax: extent, ymin: -scale, ymax: scale,
    xl: axis, yl: 'y/m', xLabelAbove: true, O: false, col: p.color, lw: 1, fs,
    pad: { l: fs * 1.7, r: fs * 2.4, t: fs * (1.1 + extra), b: fs * (1.1 + extra * .5) }
  });
}

const dotted = [1, 3];
const auxiliary = [5, 4];

function guides(c, A, x, y, ink) {
  K.line(c, A.X(x), A.Y(y), A.X(x), A.oy, K.alpha(ink, .6), 1, dotted);
  K.line(c, A.X(x), A.Y(y), A.ox, A.Y(y), K.alpha(ink, .6), 1, dotted);
}

function tick(c, p, A, x, value = x) {
  const X = A.X(x);
  K.line(c, X, A.oy - 2, X, A.oy + 2, p.color, 1);
  panelLabel(c, p, K.formatQuantity(value, '', 2), X, A.oy + 4, p.fs * 4.5, p.color, 'right');
}

function verticalTick(c, p, A, y, value = y) {
  const Y = A.Y(y);
  K.line(c, A.ox - 2, Y, A.ox + 2, Y, p.color, 1);
  panelLabel(c, p, K.formatQuantity(value, '', 2), A.ox - 4, Y - p.fs / 2, Math.max(2, A.ox - p.x - 4), p.color, 'right');
}

function timeGraph(c, p, model, t, value, comparison, caption, color = C.F) {
  panelLabel(c, p, caption, p.x + 2, p.y, p.w - 3);
  const A = graphAxes(c, p, model.end, model.amplitude, 't/s');
  const n = Math.ceil(Math.min(768, Math.max(120, model.end / (model.minPeriod || model.end) * 32)));
  if (comparison) {
    if (t > 0) K.plot(c, A, comparison, 0, t, C.v, 1, null, n);
    if (t < model.end) K.plot(c, A, comparison, t, model.end, K.alpha(C.v, .55), 1, auxiliary, n);
    K.circ(c, A.X(t), A.Y(comparison(t)), 2.7, C.v, 1);
  }
  if (t > 0) K.plot(c, A, value, 0, t, p.color, p.lw, null, n);
  if (t < model.end) K.plot(c, A, value, t, model.end, K.alpha(p.color, .55), 1, auxiliary, n);
  guides(c, A, t, value(t), color);
  K.dot(c, A.X(t), A.Y(value(t)), 3, color);
  if (p.h > 90 && p.w > 155) {
    tick(c, p, A, model.end);
    if (model.amplitude > .001) verticalTick(c, p, A, model.amplitude);
  }
}

function dimension(c, p, x, y, x2, y2, content, vertical = false) {
  const length = Math.hypot(x2 - x, y2 - y);
  if (length < 8) return;
  K.arrow(c, (x + x2) / 2, (y + y2) / 2, x, y, p.color, 1, 4);
  K.arrow(c, (x + x2) / 2, (y + y2) / 2, x2, y2, p.color, 1, 4);
  panelLabel(c, p, [symbol(content)], (x + x2) / 2 + (vertical ? 4 : 0),
    (y + y2) / 2 - (vertical ? p.fs * .5 : p.fs + 3), p.fs * 2, p.color, vertical ? 'left' : 'center');
}

function crestMeasures(c, p, A, wave, t, extent) {
  if (wave.amplitude <= 1e-9) return;
  const crest = K.mod((wave.omega * t + wave.phase - PI / 2) / (wave.direction * wave.k), wave.wavelength);
  const finiteCrest = crest + wave.wavelength <= extent;
  const a = finiteCrest ? crest : 0, b = a + wave.wavelength;
  const guideY = A.Y0 - p.fs * .35;
  for (const x of [a, b]) {
    K.line(c, A.X(x), A.Y(wave.at(x, t).y), A.X(x), guideY, p.color, 1, dotted);
  }
  dimension(c, p, A.X(a), guideY, A.X(b), guideY, 'λ');
  const amplitudeX = A.X1 + p.fs * .37;
  K.line(c, A.X(crest), A.Y(wave.amplitude), amplitudeX, A.Y(wave.amplitude), p.color, 1, dotted);
  dimension(c, p, amplitudeX, A.Y(wave.amplitude), amplitudeX, A.oy, 'A', true);
  if (crest <= extent) K.circ(c, A.X(crest), A.Y(wave.amplitude), 3, p.color, 1);
  const trough = K.mod(crest + wave.wavelength / 2, wave.wavelength);
  if (trough <= extent) K.circ(c, A.X(trough), A.Y(-wave.amplitude), 3, p.color, 1);
}

function drawDirection(c, p, A, wave, fraction, ink, sub) {
  const span = A.X1 - A.X0;
  const y = A.Y1 + p.fs * .35, x = A.X0 + span * fraction, length = span * .12;
  K.ray(c, x - wave.direction * length / 2, y, x + wave.direction * length / 2, y, ink, 1);
  panelLabel(c, p, [symbol('v', sub)], x + length / 2 + 3, y - p.fs / 2, p.fs * 2.25, ink);
}

function draw1D(c, o, GH, model, type) {
  const b = M.layout(o, GH);
  if (!b) return;
  const t = K.clamp(K.t(o), 0, model.end), p = b.scene;
  const travel = type === 'travel', stand = type === 'standing';
  const showParts = !travel && (!stand || !!K.v(o, 'qSWShow'));
  const anti = stand ? model.nodeSpacing * (Math.floor(model.probeX / model.nodeSpacing) + .5) : null;
  const showGhost = travel && K.v(o, 'qWGhost');
  const wide = p.w > 230 && p.h > 120;
  const waveText = stand ? (showParts ? '驻波 · 分波与包络' : '驻波 · 包络')
    : travel ? (showGhost ? '瞬时波形 · 虚线为后续波形' : '瞬时波形') : '分波与合成波';
  panelLabel(c, p, waveText, p.x + 2, p.y, p.w - 4);
  const A = graphAxes(c, p, model.extent, model.amplitude, 'x/m', wide && travel ? 1.2 : .28);
  const steps = Math.ceil(Math.min(640, Math.max(120,
    30 * model.extent / Math.min(model.a.wavelength, model.b?.wavelength ?? model.a.wavelength))));
  if (showParts) {
    K.plot(c, A, x => model.a.at(x, t).y, 0, model.extent, C.a, 1, null, steps);
    K.plot(c, A, x => model.b.at(x, t).y, 0, model.extent, C.gas, 1, null, steps);
  }
  if (stand) {
    K.plot(c, A, model.envelope, 0, model.extent, K.alpha(p.color, .55), 1, auxiliary, steps);
    K.plot(c, A, x => -model.envelope(x), 0, model.extent, K.alpha(p.color, .55), 1, auxiliary, steps);
  }
  if (showGhost) {
    K.plot(c, A, x => model.at(x, t + model.a.period / 8).y,
      0, model.extent, K.alpha(C.a, .7), 1, auxiliary, steps);
  }
  K.plot(c, A, x => model.at(x, t).y, 0, model.extent, p.color, p.lw, null, steps);
  if (stand) {
    for (let i = 0; i <= model.nodes; i++) {
      const x = model.nodeSpacing * i;
      K.dot(c, A.X(x), A.oy, 2.7, C.F);
      if (i < model.nodes) {
        const antinode = x + model.nodeSpacing / 2;
        K.circ(c, A.X(antinode), A.Y(model.at(antinode, t).y), 2.6, C.v, 1);
      }
    }
    if (wide) {
      const node = model.nodeSpacing * Math.round(model.probeX / model.nodeSpacing);
      panelLabel(c, p, [symbol('N')], A.X(node), A.oy + p.fs * .38, p.fs * 1.4, C.F, 'center');
      const Bx = A.X(anti), By = A.Y(model.at(anti, t).y);
      K.line(c, Bx, By, Bx, A.Y1 + p.fs * .25, K.alpha(C.v, .7), 1, dotted);
      panelLabel(c, p, [symbol('B')], Bx, A.Y1 + p.fs * .25, p.fs * 1.4, C.v, 'center');
    }
  } else if (wide) {
    drawDirection(c, p, A, model.a, travel ? .5 : .32, C.a, travel ? undefined : 1);
    if (showParts) drawDirection(c, p, A, model.b, .68, C.gas, 2);
  }
  if (wide && travel) crestMeasures(c, p, A, model.a, t, model.extent);
  if (wide) tick(c, p, A, model.extent);
  const particle = model.at(model.probeX, t), x = A.X(model.probeX), y = A.Y(particle.y);
  guides(c, A, model.probeX, particle.y, C.F);
  K.dot(c, x, y, 3, C.F);
  panelLabel(c, p, [symbol('P')], x + 4, y + (particle.vy > 0 ? 3 : -p.fs - 3), p.fs * 1.6, C.F);
  const maxVy = model.a.amplitude * model.a.omega + (model.b ? model.b.amplitude * model.b.omega : 0);
  if (maxVy > 1e-12) {
    const dy = -particle.vy / maxVy * (A.Y1 - A.Y0) * .18;
    if (Math.abs(dy) >= 1) {
      K.arrow(c, x, y, x, y + dy, C.v, p.lw, 6);
      if (wide) panelLabel(c, p, [velocityToken()], x + 4,
        K.clamp(y + dy - p.fs * .5, p.y + p.fs * 1.55, p.y + p.h - p.fs * 1.25), p.fs * 2, C.v);
    }
  }
  const sub = stand ? [symbol('P'), ' 与相邻波腹 ', symbol('B'), ' 的振动图']
    : [symbol('P'), ' 振动图 · 虚线为后续'];
  timeGraph(c, b.plots, { ...model, minPeriod: Math.min(model.a.period, model.b?.period ?? model.a.period) }, t,
    u => model.at(model.probeX, u).y, anti === null ? null : u => model.at(anti, u).y, sub);
  const wave = model.a, Q = M.quantity;
  const regions = travel ? [[symbol('v'), ' = ', symbol('f'), symbol('λ'), ' = ',
    { frac: [[symbol('λ')], [symbol('T')]] }]]
    : stand ? [[symbol('N'), ' 为波节，', symbol('B'), ' 为相邻波腹，', '节点距 ',
      { frac: [[symbol('λ')], ['2']] }, '，节到腹 ',
      { frac: [[symbol('λ')], ['4']] }]]
      : [[symbol('y'), ' = ', symbol('y', 1), ' + ', symbol('y', 2), '，两列波在同一线性、无色散、无损介质中独立传播']];
  const showAnswer = K.v(o, 'qWaveAnswer');
  const metrics = [symbol('λ'), ' = ', ...Q(wave.wavelength, 'm'), '，',
    symbol('T'), ' = ', ...Q(wave.period, 's'), '，', symbol('f'), ' = ', ...Q(wave.frequency, 'Hz'),
    '，', symbol('v'), ' = ', ...Q(wave.speed, 'm·s⁻¹')];
  const readings = [symbol('x', 'P'), ' = ', ...Q(model.probeX, 'm'), '，', symbol('y', 'P'), ' = ',
    ...Q(particle.y, 'm'), '，', symbol('v', 'y'), ' = ', ...Q(particle.vy, 'm·s⁻¹')];
  if (travel) readings.push('，', phaseToken('P'), ' = ', ...Q(K.mod(particle.phase + PI, TAU) - PI, 'rad'));
  if (model.b && !stand) {
    M.notes(c, b.notes, [...regions, showAnswer
      ? [symbol('λ', 1), ' = ', ...Q(wave.wavelength, 'm'), '，', symbol('λ', 2), ' = ', ...Q(model.b.wavelength, 'm'),
        '，', symbol('f', 1), ' = ', ...Q(wave.frequency, 'Hz'), '，', symbol('f', 2), ' = ', ...Q(model.b.frequency, 'Hz')]
      : '从两列分波分别量出波长和频率。', showAnswer ? readings : '判断质点 P 的瞬时振动方向。']);
    return;
  }
  M.notes(c, b.notes, [...regions, showAnswer ? metrics : '用波形和振动图测量波长、周期并求波速。',
    showAnswer ? readings : '判断质点 P 的瞬时振动方向。']);
}

function locusGeometry(s1, s2, delta, reach) {
  const dx = s2.x - s1.x, dy = s2.y - s1.y, d = Math.hypot(dx, dy);
  if (d < 1e-9 || Math.abs(delta) > d + 1e-9) return [];
  const mx = (s1.x + s2.x) / 2, my = (s1.y + s2.y) / 2, ux = dx / d, uy = dy / d;
  const point = (x, y) => ({ x: mx + ux * x - uy * y, y: my + uy * x + ux * y });
  if (Math.abs(delta) < 1e-9) return [point(0, -reach), point(0, reach)];
  const a = Math.abs(delta) / 2, b = Math.sqrt(Math.max(0, (d / 2 - a) * (d / 2 + a)));
  const sign = -Math.sign(delta);
  if (b < 1e-9) return [point(sign * a, 0), point(sign * reach, 0)];
  const far = Math.asinh(reach / Math.max(a, b));
  return Array.from({ length: 65 }, (_, i) => {
    const u = far * (i / 32 - 1);
    return point(sign * a * Math.cosh(u), b * Math.sinh(u));
  });
}

function waterScreen(p, m) {
  const head = p.fs * 1.55, foot = p.h > 78 && p.w > 160 ? p.fs * 1.45 : 3;
  const height = p.h - head - foot;
  const scale = Math.min((p.w - p.fs * 1.65) / m.w, height / m.h);
  const w = m.w * scale, h = m.h * scale;
  const left = p.x + (p.w - w) / 2, top = p.y + head + (height - h) / 2;
  return { left, top, w, h, scale, X: x => left + scale * x, Y: y => top + h - scale * y };
}

function drawWaterField(c, p, m, s, t, o, mode) {
  const legacy = mode === 'legacy', amplitudeOnly = mode === 'amplitude';
  const inks = [C.a, C.gas], scale = s.scale;
  if (scale <= 0) return;
  c.save(); c.beginPath(); c.rect(s.left, s.top, s.w, s.h); c.clip();
  if (!legacy && m.amplitude + m.amplitude2 > 0) {
    // Each cell samples the same resultant as the observation point. Coordinates use equal scales.
    const nx = Math.min(128, Math.max(44, Math.ceil(m.w / m.wavelength * 6)));
    const ny = Math.ceil(nx * .66), gain = m.amplitude + m.amplitude2;
    const levels = 18, cells = Array.from({ length: levels * 2 + 1 }, () => []);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const value = m.probe((i + .5) * m.w / nx, (j + .5) * m.h / ny);
      const norm = (amplitudeOnly ? value.amplitude : value.at(t)) / gain;
      const step = Math.round(K.clamp(norm, -1, 1) * levels);
      if (step) cells[step + levels].push(j * nx + i);
    }
    for (const [bin, indices] of cells.entries()) {
      if (!indices.length) continue;
      const signed = bin - levels;
      c.fillStyle = K.alpha(amplitudeOnly ? C.B : signed > 0 ? C.a : C.gas, Math.abs(signed) * .47 / levels);
      c.beginPath();
      for (const i of indices) {
        c.rect(s.left + (i % nx) * s.w / nx, s.top + (ny - Math.floor(i / nx) - 1) * s.h / ny,
          s.w / nx + .025, s.h / ny + .025);
      }
      c.fill();
    }
  }
  const reach = Math.hypot(m.w, m.h) * 1.3;
  for (const [i, from] of [m.s1, m.s2].entries()) {
    const amplitude = i ? m.amplitude2 : m.amplitude;
    if (amplitude === 0) continue;
    const color = legacy ? p.color : inks[i];
    const start = m.wavefrontStart(t, i + 1);
    for (let r = start; r < reach; r += m.wavelength) {
      if (r * scale > 1) K.circ(c, s.X(from.x), s.Y(from.y), r * scale, K.alpha(color, legacy ? .7 : .69), 1);
    }
    if (legacy) {
      for (let r = K.mod(start + m.wavelength / 2, m.wavelength); r < reach; r += m.wavelength) {
        if (r * scale > 1) K.circ(c, s.X(from.x), s.Y(from.y), r * scale, K.alpha(color, .27), 1);
      }
    }
  }
  const showLoci = legacy ? Number(K.v(o, 'showNodes')) >= .5 : !!K.v(o, 'qWaveWaterLoci');
  if (showLoci && m.amplitude > 0 && m.amplitude2 > 0) {
    const d = Math.hypot(m.s2.x - m.s1.x, m.s2.y - m.s1.y), phi = m.phase2 / TAU;
    for (const shift of [0, .5]) {
      const from = Math.ceil(phi + shift - d / m.wavelength - 1e-9);
      const to = Math.floor(phi + shift + d / m.wavelength + 1e-9);
      for (let i = from; i <= to; i++) {
        const points = locusGeometry(m.s1, m.s2, (phi + shift - i) * m.wavelength, reach);
        K.poly(c, points.map(q => [s.X(q.x), s.Y(q.y)]), p.color, 1, shift ? dotted : auxiliary);
      }
    }
  }
  if (m.p) {
    for (const from of [m.s1, m.s2]) {
      K.line(c, s.X(from.x), s.Y(from.y), s.X(m.p.x), s.Y(m.p.y), K.alpha(p.color, .7), 1, dotted);
    }
  }
  c.restore();
  K.box(c, s.left, s.top, s.w, s.h, p.color, 1);
  const sources = [
    [m.s1, [symbol('S', 1)], legacy ? p.color : inks[0]],
    [m.s2, [symbol('S', 2)], legacy ? p.color : inks[1]]
  ];
  if (m.p) sources.push([m.p, [symbol('P')], C.F]);
  for (const [i, [point, name, ink]] of sources.entries()) {
    const x = s.X(point.x), y = s.Y(point.y);
    K.dot(c, x, y, i === 2 ? 3.5 : 3, ink);
    const right = point.x < m.w * .69;
    const row = y + (i === 1 ? p.fs * .24 : -p.fs * 1.15);
    panelLabel(c, p, name, x + (right ? 4 : -4),
      K.clamp(row, s.top + 2, s.top + s.h - p.fs - 1), p.fs * 1.6, ink, right ? 'left' : 'right');
  }
  panelLabel(c, p, legacy ? '水波俯视 · 深线为波峰，浅线为波谷'
    : amplitudeOnly ? '波场合振幅 · 圆线为波峰' : '合位移 · 暖色 +，冷色 − · 实线波峰', p.x + 2, p.y, p.w - 4);
  if (showLoci && p.h > 78 && p.w > 160) {
    panelLabel(c, p, '虚线为相长条件 · 点线为相消条件或投影',
      s.left + s.w / 2, s.top + s.h + 3, p.w - 4, p.color, 'center');
  }
}

function drawWater(c, o, GH, model) {
  const b = M.layout(o, GH);
  if (!b) return;
  const p = b.scene, t = K.clamp(K.t(o), 0, model.end), probe = model.state;
  drawWaterField(c, p, model, waterScreen(p, model), t, o,
    K.v(o, 'qWaveWaterLayer') === 1 ? 'amplitude' : 'displacement');
  const Q = M.quantity;
  timeGraph(c, b.plots, { end: model.end, amplitude: model.amplitude + model.amplitude2 }, t, probe.at, null,
    [symbol('P'), ' 振动图 · 虚线为后续']);
  M.notes(c, b.notes, [
    ['Δ', phaseToken(), ' = ', phaseToken(2), ' − ', phaseToken(1), ' − ', symbol('k'), '(', symbol('r', 2), ' − ', symbol('r', 1), ')'],
    K.v(o, 'qWaveAnswer') ? [symbol('r', 2), ' − ', symbol('r', 1), ' = ', ...Q(probe.path, 'm'), '，Δ',
      phaseToken(), ' = ', ...Q(probe.phase, 'rad'), '，合振幅 ', ...Q(probe.amplitude, 'm')]
      : '测量波程差，结合波源初相位判定加强或减弱。',
    '同频、振幅不随距离衰减；振幅不等时相消条件处仍可能振动。'
  ]);
}

function drawLegacyWater(c, o, GH) {
  const b = GH.box(o);
  if (b.w < 55 || b.h < 45) return;
  const p = { x: b.x1, y: b.y1, w: b.w, h: b.h, fs: K.fs(K.S(b), .04, 8, 14),
    color: o.color || '#e6edf7' };
  const w = b.w, h = b.h;
  const d = Math.min(w, h) * K.clamp(Number(K.v(o, 'srcSep')), 5, 80) / 100;
  const count = K.clamp(Math.round(Number(K.v(o, 'rippleCount'))), 2, 25);
  const wavelength = Math.hypot(w, h) * 1.4 / count;
  const model = { w, h, ...interference({ wavelength, period: 2, phase2: Number(K.v(o, 'phaseInv')) >= .5 ? PI : 0,
    s1: { x: (w - d) / 2, y: h / 2 }, s2: { x: (w + d) / 2, y: h / 2 } }) };
  drawWaterField(c, p, model, waterScreen(p, model), 1.5, o, 'legacy');
}

function waterHandle(o, pointer, GH) {
  if (!K.v(o, 'qWaveWater')) return null;
  const b = M.layout(o, GH);
  if (!b) return null;
  const m = waterModel(o), s = waterScreen(b.scene, m);
  if (s.scale <= 0) return null;
  const markers = [[m.p, 'Water'], [m.s1, 'S1'], [m.s2, 'S2']];
  const hit = markers.find(([point]) =>
    Math.hypot(pointer.x - s.X(point.x), pointer.y - s.Y(point.y)) < Math.min(13, b.scene.fs));
  if (!hit) return null;
  const [x, y] = names([hit[1] + 'X', hit[1] + 'Y']);
  const percent = value => Math.round(K.clamp(value * 100, 5, 95));
  return { keys: [x, y], valuesAt(pt) {
    return { [x]: percent((pt.x - s.left) / s.w), [y]: percent(1 - (pt.y - s.top) / s.h) };
  } };
}

function timeline(model, kind) {
  if (kind === 'travel') {
    const w = model.a;
    const phaseAtZero = w.at(model.probeX, 0).phase;
    const kinds = ['质点过平衡位置', '质点到达波峰', '质点过平衡位置', '质点到达波谷'];
    const events = kinds.flatMap((label, i) => {
      const start = K.mod(i * PI / 2 - phaseAtZero, TAU) / w.omega;
      return [start, start + w.period].filter(t => t > 1e-8 && t < model.end).map(t => ({ t, label }));
    }).sort((x, y) => x.t - y.t);
    return { duration: model.end, events };
  }
  const period = model.period || model.a.period;
  const standing = kind === 'standing';
  const labels = standing ? ['全弦通过平衡位置', '波腹达到反向最大位移', '全弦通过平衡位置', '波腹回到同向最大位移']
    : ['四分之一周期', '半周期', '四分之三周期', '完整周期'];
  const events = Array.from({ length: 7 }, (_, i) => ({ t: period * (i + 1) / 4,
    label: (kind === 'pair' ? '波 1 · ' : '') + labels[i % 4] }))
    .filter(event => event.t < model.end);
  return { duration: model.end, events };
}

const travel = K.TB.shapes.pm_wave_travel, pair = K.TB.shapes.pm_pulse_meet;
const stationary = K.TB.shapes.pm_standing_anim, water = K.TB.shapes.waterInterf;
const travelParams = names(['Amplitude', 'Control', 'Speed', 'Period', 'Frequency', 'Length', 'Phase', 'Probe', 'Answer']);
const pairParams = names(['Amplitude', 'Amplitude2', 'PairControl', 'Speed', 'Frequency', 'Frequency2', 'Length',
  'Length2', 'Phase', 'Phase2', 'Dir2', 'Probe', 'Answer']);
const activeTravel = o => !!K.v(o, 'qWaveTravel');
const activePair = o => K.v(o, 'qPulseMode') === 2;
const activeWater = o => !!K.v(o, 'qWaveWater');

if (travel) {
  const draw = travel.draw;
  Object.assign(travel, {
    params: ['qWaveTravel', ...travel.params, ...travelParams, 'animSpeed'],
    showParam(o, param) {
      if (!travelParams.includes(param)) return true;
      if (!activeTravel(o)) return false;
      const mode = K.v(o, 'qWaveControl');
      switch (param) {
        case 'qWaveSpeed': return mode !== 3;
        case 'qWavePeriod': return mode === 0 || mode === 3;
        case 'qWaveFrequency': return mode === 1;
        case 'qWaveLength': return mode === 2 || mode === 3;
        default: return true;
      }
    },
    draw(c, o, GH) {
      if (activeTravel(o)) draw1D(c, o, GH, travelModel(o), 'travel');
      else draw(c, o, GH);
    },
    animationTimeline(o) { return activeTravel(o) ? timeline(travelModel(o), 'travel') : null; }
  });
}

if (pair) {
  const draw = pair.draw;
  K.TB.paramDefs.qPulseMode.options.push({ value: '2', label: '双简谐波' });
  Object.assign(pair, {
    params: [...pair.params, 'qWDir', ...pairParams, 'animSpeed'],
    showParam(o, param) {
      if (param === 'qPulseMode' || param === 'animSpeed') return true;
      if (!activePair(o)) return false;
      switch (param) {
        case 'qWaveFrequency':
        case 'qWaveFrequency2': return K.v(o, 'qWavePairControl') === 0;
        case 'qWaveLength':
        case 'qWaveLength2': return K.v(o, 'qWavePairControl') === 1;
        default: return true;
      }
    },
    draw(c, o, GH) {
      if (activePair(o)) draw1D(c, o, GH, pairModel(o), 'pair');
      else draw(c, o, GH);
    },
    animationTimeline(o) { return activePair(o) ? timeline(pairModel(o), 'pair') : null; }
  });
}

if (stationary) {
  K.P('qWaveStandPeriod', { ...K.TB.paramDefs.qWavePeriod, def: 2.5 });
  Object.assign(stationary, {
    params: [...stationary.params, ...names(['Amplitude', 'Speed', 'StandPeriod', 'Probe', 'Answer']), 'animSpeed'],
    draw(c, o, GH) { draw1D(c, o, GH, standingModel(o), 'standing'); },
    animationTimeline(o) { return timeline(standingModel(o), 'standing'); }
  });
}

if (water) {
  const legacy = [...water.params];
  Object.assign(water, {
    params: ['qWaveWater', ...legacy, ...names(['Amplitude', 'Amplitude2', 'Length', 'Period', 'Phase2',
      'WaterWidth', 'S1X', 'S1Y', 'S2X', 'S2Y', 'WaterX', 'WaterY', 'WaterLayer', 'WaterLoci', 'Answer']), 'animSpeed'],
    animatable: true,
    modelDetails: true,
    canAnimate: activeWater,
    showParam(o, param) {
      return param === 'qWaveWater' || (activeWater(o) ? !legacy.includes(param) : legacy.includes(param));
    },
    draw(c, o, GH) {
      if (activeWater(o)) drawWater(c, o, GH, waterModel(o));
      else drawLegacyWater(c, o, GH);
    },
    animationTimeline(o) { return activeWater(o) ? timeline(waterModel(o), 'water') : null; },
    dragHandle: waterHandle
  });
}
})();

/* ===== 上游 pm_g4b_optics.js ===== */
/* G4-B Young's two-slit measurement, extending the historical fringe object. */
(function () {
'use strict';

const K = window.__PM;
const M = K.reviewMotion;
const C = K.C;
const { symbol } = M;
const quantity = (value, unit = '', places = 2) => K.formatQuantity(value, unit, places);
const major = 8;
const resolution = .01; // mm

function slitModel({ wavelength, gap, distance, balance = 1, cursor = 0, first = -2, last = 3, windowWidth = 12 }) {
  // Work in millimetres. Screen x is positive towards S2's side, and δ=r1-r2.
  const lambda = wavelength * 1e-6;
  const D = distance * 1e3;
  const pathDifference = x => 2 * x * gap /
    (Math.hypot(D, x + gap / 2) + Math.hypot(D, x - gap / 2));
  const mark = order => {
    const delta = order * lambda;
    if (Math.abs(delta) >= gap) return null;
    return delta * Math.hypot(.5, D / Math.sqrt(gap * gap - delta * delta));
  };
  const relative = Math.sqrt(balance);
  const peak = (1 + relative) ** 2;
  const intensity = x => K.clamp((1 + balance + 2 * relative *
    Math.cos(K.TAU * pathDifference(x) / lambda)) / peak, 0, 1);
  const round = x => Math.round(x / resolution) * resolution;
  const xA = mark(first), xB = mark(last);
  // Keep a physical window while it is useful. Expand to retain the selected fringes
  // and cap the number of rendered cycles so the intensity profile remains readable.
  const span = Math.max(Math.abs(xA) * 1.12, Math.abs(xB) * 1.12,
    Math.min(windowWidth, mark(major + 4.45)));
  const position = cursor * span / 100;
  const intervals = Math.abs(last - first);
  const readingA = round(xA), readingB = round(xB);
  const separation = Math.abs(readingA - readingB);
  const fringe = intervals ? separation / intervals : null;
  const estimate = intervals ? Math.abs(pathDifference(readingB) - pathDifference(readingA)) * 1e6 / intervals : null;
  const paraxial = Math.max(Math.abs(xA), Math.abs(xB), Math.abs(position)) / D <= .08 && gap / D <= .01;
  return {
    D, gap, lambda, span, position, xA, xB, first, last, intervals,
    reading: round(position), readingA, readingB, separation, fringe, estimate,
    approximation: paraxial && fringe !== null ? fringe * gap / D * 1e6 : null,
    centralSpacing: lambda * D / gap, paraxial, pathDifference, mark, intensity
  };
}
K.opticsLab.slit = slitModel;

const shape = K.TB.shapes.doubleSlit;
if (!shape) return;

K.tog('qSlitLab', '开启双缝实验测量', false);
K.tog('qSlitAids', '显示读数导线', true);
K.tog('qSlitAnswers', '显示间距关系和波长反算', false);
const params = M.parameters('qSlit', [
  ['Lambda', '波长', 'nm', 380, 750, 5, 550],
  ['Gap', '双缝间距', 'mm', .035, 1.5, .005, .25],
  ['Distance', '双缝到屏距离', 'm', .2, 3, .05, 1],
  ['Balance', '缝 2 与缝 1 的强度比', '', .05, 2, .05, 1],
  ['Window', '标尺视窗半宽（自动留出所选条纹）', 'mm', .5, 600, .5, 12],
  ['Read', '游标（屏幕横向范围）', '%', -100, 100, .25, 0],
  ['First', '起始明纹级次 A', '', -major, major, 1, -2],
  ['Last', '终止明纹级次 B', '', -major, major, 1, 3]
]);
const mval = M.number;
const enabled = o => K.v(o, 'qSlitLab') === true;
const labState = o => slitModel({
  wavelength: mval(o, 'qSlitLambda'), gap: mval(o, 'qSlitGap'), distance: mval(o, 'qSlitDistance'),
  balance: mval(o, 'qSlitBalance'), cursor: mval(o, 'qSlitRead'), windowWidth: mval(o, 'qSlitWindow'),
  first: Math.round(mval(o, 'qSlitFirst')), last: Math.round(mval(o, 'qSlitLast'))
});
K.opticsLab.slitFor = labState;
const legacyDraw = shape.draw;
shape.params = [...shape.params, 'qSlitLab', ...params, 'qSlitAids', 'qSlitAnswers'];
shape.showParam = function (o, key) {
  if (key === 'qSlitLab') return true;
  return enabled(o) !== (key === 'hue7' || key === 'density');
};

function apparatus(c, b, m, aids) {
  const { color, lw } = b, fs = Math.min(b.fs, b.h / 6.2);
  const fine = Math.max(.75, lw / 2), heavy = lw * (5 / 3);
  const compact = b.w < 205 || b.h < 115;
  const lo = b.y + fs * (compact ? 2.1 : 2.85), hi = b.y + b.h - fs * 2.1;
  const axis = (lo + hi) / 2;
  const H = hi - lo;
  const Sx = b.x + b.w * .08, Ax = b.x + b.w * .24;
  const Bx = b.x + b.w * .46, screen = b.x + b.w * .84;
  const slit = H * .15 * K.clamp(Math.sqrt(m.gap / .25), .48, 1.55);
  const h = Math.min(slit * .65, Math.max(1, fs * .18));
  const Y = x => axis - x / m.span * H / 2;
  const detector = Y(m.position);
  M.label(c, { ...b, fs }, [compact ? '装置示意' : '双缝实验装置 · 比例示意'], b.x, b.y, color, 'left', b.w);
  K.line(c, Sx, axis, screen, axis, K.alpha(color, .55), fine, [1, 3]);
  const bands = Math.ceil(Math.max(140, H * .65));
  const pitch = H / bands;
  for (let j = 0; j < bands; j++) {
    const x = m.span * (1 - 2 * (j + .5) / bands);
    c.fillStyle = K.alpha(C.light, .045 + .92 * m.intensity(x));
    c.fillRect(screen, lo + j * pitch, b.w * .043, pitch + .35);
  }
  K.line(c, Ax, lo, Ax, axis - h, color, heavy);
  K.line(c, Ax, axis + h, Ax, hi, color, heavy);
  for (const [a, z] of [[lo, axis - slit - h], [axis - slit + h, axis + slit - h], [axis + slit + h, hi]]) {
    K.line(c, Bx, a, Bx, z, color, heavy);
  }
  K.line(c, screen, lo, screen, hi, color, lw);
  K.ray(c, Sx, axis, Ax, axis, C.light, lw);
  for (const sign of [-1, 1]) {
    const y = axis + sign * slit;
    K.ray(c, Ax, axis, Bx, y, C.light, lw);
    K.ray(c, Bx, y, screen, detector, C.light, lw);
  }
  K.dot(c, Sx, axis, Math.max(1.5, lw * 1.5), C.light);
  K.dot(c, screen, detector, Math.max(2, lw), C.g2);
  const mark = (tokens, x, y, width) => M.label(c, b, tokens, x, y, color, 'center', width);
  mark([symbol('S')], Sx, axis + fs * .75, fs);
  if (!compact) {
    mark(['单缝'], Ax, lo - fs * 1.3, fs * 2.2);
    mark(['双缝'], Bx, lo - fs * 1.3, fs * 2.2);
    mark(['光屏'], screen, lo - fs * 1.3, fs * 2.2);
    const dimensionY = hi + fs * .65;
    K.line(c, Bx, hi + 2, Bx, dimensionY + 4, color, fine);
    K.line(c, screen, hi + 2, screen, dimensionY + 4, color, fine);
    const center = (Bx + screen) / 2;
    K.arrow(c, center - fs * .72, dimensionY, Bx, dimensionY, color, fine, 5);
    K.arrow(c, center + fs * .72, dimensionY, screen, dimensionY, color, fine, 5);
    mark([symbol('D')], center, dimensionY - fs * .47, fs * 1.2);
  }
  const rulerX = screen + b.w * .08;
  K.line(c, rulerX, lo, rulerX, hi, color, fine);
  // Ticks are fixed physical intervals on the screen, in millimetres.
  const raw = m.span / 5, magnitude = 10 ** Math.floor(Math.log10(raw));
  const tick = [1, 2, 5, 10].find(value => value * magnitude >= raw) * magnitude;
  const maxTick = Math.floor(m.span / tick);
  for (let k = -maxTick; k <= maxTick; k++) {
    const y = Y(k * tick);
    K.line(c, rulerX, y, rulerX + (k === 0 ? 6 : 3.5), y, color, fine);
  }
  if (aids) {
    K.line(c, screen, detector, rulerX + 4, detector, C.g2, fine, [1, 3]);
    for (const [x, label] of [[m.xA, 'A'], [m.xB, 'B']]) {
      if (label === 'B' && x === m.xA) continue;
      const y = Y(x);
      K.line(c, screen - 5, y, screen + b.w * .06, y, color, fine);
      if (!compact) M.label(c, b, [symbol(label)], screen + b.w * .048, y - fs * .9, color, 'left', fs);
    }
  }
}

function graphAxes(b, m) {
  const fs = Math.min(b.fs, b.h * .13, b.w * .11);
  const left = fs * 1.25, right = fs * 1.55, top = fs * 1.75, bottom = fs * 2.2;
  return {
    xmin: -m.span, xmax: m.span, ymin: 0, ymax: 1.09,
    xl: [symbol('x'), '/mm'], yl: [symbol('I'), '/', symbol('I', 'max')], O: false,
    pad: { l: left, r: right, t: top, b: bottom }, fs,
    horizontalPad: { left, right },
    col: b.color, lw: Math.max(.75, b.lw / 2),
  };
}

function profile(c, b, m, aids) {
  const { color, lw } = b;
  const spec = graphAxes(b, m), { fs } = spec;
  const A = K.axes(c, b.x, b.y, b.w, b.h, spec);
  const value = m.intensity(m.position), x = A.X(m.position), y = A.Y(value);
  K.plot(c, A, m.intensity, -m.span, m.span, C.light, lw, null, 360);
  if (aids) {
    K.guide(c, A, m.position, value, C.g2, spec.lw);
    const markLo = Math.min(m.first, m.last), markHi = Math.max(m.first, m.last);
    for (let i = markLo; i <= markHi; i++) {
      const px = A.X(m.mark(i)), py = A.Y(1);
      const edge = i === m.first || i === m.last;
      K.circ(c, px, py, edge ? 3 : 1.7, edge ? C.g2 : color, spec.lw);
    }
    if (m.intervals && b.w > 205) {
      const p = A.X(m.xA), q = A.X(m.xB);
      const aY = Math.abs(p - A.ox) < fs * 4 ? fs * .8 : 0;
      const bY = Math.abs(q - p) < fs * 1.5 ? fs * .8 - aY : Math.abs(q - A.ox) < fs * 4 ? fs * .8 : 0;
      M.label(c, { ...b, fs }, [symbol('A')], p, b.y + aY, C.g2, 'center', fs * 1.3);
      M.label(c, { ...b, fs }, [symbol('B')], q, b.y + bY, C.g2, 'center', fs * 1.3);
    }
  }
  K.dot(c, x, y, Math.max(2, lw * 1.2), C.g2);
  if (b.w > 145) {
    const max = m.span * .9;
    const magnitude = 10 ** Math.floor(Math.log10(max));
    const endpointTick = Math.floor(max / magnitude) * magnitude;
    for (const val of [-endpointTick, 0, endpointTick]) {
      const px = A.X(val);
      K.line(c, px, A.Y1 - 2, px, A.Y1 + 3, color, spec.lw);
      M.label(c, { ...b, fs }, [quantity(val, '', Math.abs(val) > 20 ? 1 : 2)],
        px, A.Y1 + fs * 1.16, color, 'center', fs * 3.6);
    }
    K.line(c, A.ox - 3, A.Y(1), A.ox + 3, A.Y(1), color, spec.lw);
    M.label(c, { ...b, fs }, ['1'], A.ox - 5, A.Y(1) - fs * .5, color, 'right', fs * 1.2);
  }
}

shape.draw = function (c, o, GH) {
  if (!enabled(o)) return legacyDraw(c, o, GH);
  const panels = M.layout(o, GH);
  if (!panels) return;
  const m = labState(o), aids = K.v(o, 'qSlitAids');
  apparatus(c, panels.scene, m, aids);
  profile(c, panels.plots, m, aids);
  const common = [
    [symbol('x'), ' = ', quantity(m.reading, 'mm'), '    ', symbol('I'), '/', symbol('I', 'max'), ' = ', quantity(m.intensity(m.position)),
      '    ', symbol('d'), ' = ', quantity(m.gap, 'mm', 3), '    ', symbol('D'), ' = ', quantity(m.D / 1e3, 'm')],
    [symbol('x', 'A'), ' = ', quantity(m.readingA, 'mm'), '    ', symbol('x', 'B'), ' = ', quantity(m.readingB, 'mm'),
      '    跨 ', String(m.intervals), ' 个间隔，读数精度 0.01 mm']
  ];
  if (K.v(o, 'qSlitAnswers') && m.intervals) {
    common.push([
      '平均条纹间距 ', quantity(m.fringe, 'mm'), '    ', symbol('λ'), '（光程差反算） = ', quantity(m.estimate, 'nm', 1),
      ...(m.paraxial ? ['    近轴 ', symbol('λ'), ' ≈ ', quantity(m.approximation, 'nm', 1)] : [])
    ]);
    common.push(m.paraxial
      ? ['近轴、远场 ', 'Δ', symbol('x'), ' ≈ ', { frac: [[symbol('λ'), symbol('D')], [symbol('d')]] }, '，视为两条窄缝']
      : '测点超出近轴范围，采用两条窄缝到屏的几何光程差');
  } else {
    common.push(m.intervals ? '记录明纹中心，用总跨距除以间隔数' : '请选择不同级次的两条明纹');
  }
  if (panels.notes.w < 300) {
    // Compact cards keep experimental readouts at useful sizes. The enlarged card
    // reserves space for the whole derivation and its validity condition.
    const summary = [[symbol('x'), ' = ', quantity(m.reading, 'mm'), '    跨 ', String(m.intervals), ' 个间隔']];
    if (K.v(o, 'qSlitAnswers') && m.intervals) {
      summary.push([symbol('λ'), ' = ', quantity(m.estimate, 'nm', 1), '（光程差反算）']);
    }
    M.notes(c, panels.notes, summary);
  } else M.notes(c, panels.notes, common);
};

shape.dragHandle = function (o, pt, GH) {
  if (!enabled(o)) return null;
  const b = M.layout(o, GH)?.plots;
  if (!b) return null;
  const m = labState(o);
  const spec = graphAxes(b, m), { left, right } = spec.horizontalPad;
  const x1 = b.x + left, x2 = b.x + b.w - right;
  if (pt.x < x1 - 3 || pt.x > x2 + 3 || pt.y < b.y || pt.y > b.y + b.h) return null;
  return {
    key: 'qSlitRead',
    valueAt(point) {
      return Math.round(K.clamp((point.x - x1) / (x2 - x1) * 200 - 100, -100, 100) * 4) / 4;
    }
  };
};
})();

/* ===== 上游 pm_g4b_electrostatics.js ===== */
/* Quantitative parallel plates and uniform-field particle motion. */
(function () {
'use strict';
const K = window.__PM, M = K.reviewMotion, C = K.C;
const e0 = 8.8541878128e-12;
const reference = { d: .04, area: .12, er: 1 };
const s = M.symbol;
const quantity = K.formatQuantity;
const sci = (value, unit) => K.scientificQuantity(value, unit, 3);

function capacitor({ d, area, er, voltage, charge, isolated = false }) {
  const capacitance = e0 * er * area / d;
  const U = isolated ? charge / capacitance : voltage;
  const Q = capacitance * U;
  // y is upward from the midplane. U is V(top) - V(bottom).
  const E = -U / d;
  const energy = .5 * Q * U;
  const phi = y => -E * K.clamp(y, -d / 2, d / 2);
  return { capacitance, U, Q, E, energy, phi };
}

function change(config, from = reference) {
  const before = capacitor({ ...config, ...from });
  const after = capacitor(config);
  const delta = after.energy - before.energy;
  const sourceWork = config.isolated ? 0 : config.voltage * (after.Q - before.Q);
  return { ...after, delta, sourceWork, externalWork: delta - sourceWork };
}

function positiveRoots(a, b, c) {
  if (!a) return b ? [-c / b].filter(t => t > 0) : [];
  const disc = b * b - 4 * a * c;
  if (disc < -16 * Number.EPSILON * (b * b + Math.abs(4 * a * c))) return [];
  const q = -.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(Math.max(0, disc)));
  return (q ? [q / a, c / q] : [-b / (2 * a)]).filter(t => t > 0);
}

function particle({ d, length, x0, y0, speed, angle, field, charge, mass }) {
  const theta = angle * Math.PI / 180;
  const vx = Math.abs(Math.cos(theta)) < 1e-12 ? 0 : speed * Math.cos(theta);
  const vy0 = Math.abs(Math.sin(theta)) < 1e-12 ? 0 : speed * Math.sin(theta);
  const force = charge * field, ay = force / mass;
  const edge = vx === 0 ? Infinity : ((vx > 0 ? length : 0) - x0) / vx;
  const plate = Math.min(Infinity, ...positiveRoots(ay * .5, vy0, y0 - d / 2),
    ...positiveRoots(ay * .5, vy0, y0 + d / 2));
  const contact = Number.isFinite(plate) && plate <= edge + 1e-10 * Math.max(1, edge);
  const boundary = contact ? plate : edge;
  const movingPastEdge = Number.isFinite(boundary) && !contact;
  const transition = Number.isFinite(boundary) ? boundary : 5;
  const inside = t => {
    const vertical = K.sampleConstantAcceleration(vy0, ay, t);
    return { x: x0 + vx * t, y: y0 + vertical.x, vx, vy: vertical.v, ay, force };
  };
  const last = inside(transition);
  const end = transition + (movingPastEdge ? .65 * length / Math.hypot(vx, last.vy) : 0);
  function at(time) {
    const t = K.clamp(time, 0, end);
    if (movingPastEdge && t >= transition) {
      const dt = t - transition;
      return { t, x: last.x + vx * dt, y: last.y + last.vy * dt, vx, vy: last.vy,
        ay: 0, force: 0, stage: 'fieldFree' };
    }
    return { t, ...inside(t), stage: contact && t >= transition ? 'plate' : 'field' };
  }
  return { at, end, transition, contact, leaves: movingPastEdge, last };
}

Object.assign(K.physics, { plateCapacitor: capacitor, capacitorChange: change, electricParticle: particle });

const capKeys = M.parameters('qCap', [
  ['Area', '极板面积', 'm²', .02, .4, .01, .12],
  ['Gap', '板间距', 'cm', .5, 8, .1, 4],
  ['Er', '相对介电常数', '', 1, 12, .1, 1],
  ['Voltage', '上板减下板的电压', 'V', -300, 300, 5, 120],
  ['Charge', '上板自由电荷', 'nC', -15, 15, .1, 3.2]
]);
K.sel('qCapMode', '约束条件', ['连接恒压源', '充电后断开'], 0);
K.sel('qCapPlot', '数据图', ['电容与场强随板距', '电势与电荷–电压', '储能与功随板距'], 0);
K.tog('qCapSweep', '由参考几何缓慢变到设定值', false);
K.tog('qCapAnswers', '显示计算关系与结果（在讲解中）', true);
const capDuration = 4;
const num = M.number;

function capConfig(o) {
  return {
    d: num(o, 'qCapGap') / 100, area: num(o, 'qCapArea'), er: num(o, 'qCapEr'),
    voltage: num(o, 'qCapVoltage'), charge: num(o, 'qCapCharge') * 1e-9,
    isolated: K.v(o, 'qCapMode') === 1
  };
}

function capAt(o) {
  const config = capConfig(o);
  if (!K.v(o, 'qCapSweep')) return config;
  const u = K.clamp(K.t(o) / capDuration, 0, 1);
  return { ...config, d: K.lerp(reference.d, config.d, u), area: K.lerp(reference.area, config.area, u),
    er: K.lerp(reference.er, config.er, u) };
}

function shade(c, x, y, w, h, ink) {
  K.box(c, x, y, w, h, null, 0, K.alpha(ink, .07));
}

function plateSigns(c, b, left, right, upper, lower, topSign) {
  for (const [row, sign] of [[upper, topSign], [lower, -topSign]]) {
    if (!sign) continue;
    for (let i = 1; i < 6; i++) {
      const x = K.lerp(left, right, i / 6);
      M.label(c, b, sign > 0 ? '+' : '−', x, row + (row === upper ? -1.2 * b.fs : .23 * b.fs),
        sign > 0 ? C.pos : C.neg, 'center', b.fs);
    }
  }
}

function fieldLines(c, b, left, right, top, bottom, field) {
  if (!field) return;
  const ink = K.alpha(C.E, .72);
  const a = K.lerp(top, bottom, field < 0 ? .12 : .88);
  const z = K.lerp(top, bottom, field < 0 ? .88 : .12);
  for (let i = 1; i < 6; i++) {
    const x = K.lerp(left, right, i / 6);
    if (Math.abs(z - a) >= 14) K.ray(c, x, a, x, z, ink, b.lw * .64);
    else K.arrow(c, x, a, x, z, ink, b.lw * .64, 4);
  }
  M.label(c, b, [s('E')], K.lerp(left, right, .72), (a + z) / 2, C.E);
}

function drawCap(c, o, GH) {
  const b = M.layout(o, GH);
  if (!b) return;
  const p = b.scene, a = capAt(o), v = change(a);
  const h = p.h * (.18 + .3 * a.d / .08);
  const w = Math.min(p.w * (.43 + .25 * Math.sqrt(a.area / .4)), p.w * .68 - p.fs * 1.8);
  const x = p.x + p.w * .32, end = x + w, mid = p.y + p.h * .56;
  const top = mid - h / 2, bottom = mid + h / 2;
  const thick = Math.max(1.5, p.lw * 1.7);
  const lead = p.x + p.w * .12, joint = x + w * .51;
  const switchX = lead + (joint - lead) * .5;
  const offset = Math.min(p.fs * 1.35, (p.y + p.h - bottom) * .5);
  const upperWire = top - offset, lowerWire = bottom + offset;
  const switchGap = Math.min((joint - lead) * .14, p.fs);
  if (a.er > 1) shade(c, x, top, w, h, C.E);
  K.line(c, x, top, end, top, p.color, thick);
  K.line(c, x, bottom, end, bottom, p.color, thick);
  fieldLines(c, p, x, end, top, bottom, v.E);
  for (const rel of [.28, .72]) {
    const y = K.lerp(top, bottom, rel);
    K.line(c, x + 2, y, end - 2, y, K.alpha(C.a, .55), .7, [4, 4]);
  }
  plateSigns(c, p, x, end, top, bottom, Math.sign(v.U));
  K.poly(c, [[joint, top], [joint, upperWire], [switchX + switchGap, upperWire]], p.color, p.lw);
  K.poly(c, [[switchX - switchGap, upperWire], [lead, upperWire], [lead, mid - 4]], p.color, p.lw);
  K.line(c, switchX - switchGap, upperWire, switchX + switchGap,
    upperWire - (a.isolated ? Math.min(p.fs * .8, p.h * .1) : 0), p.color, p.lw);
  for (const dx of [-switchGap, switchGap]) K.dot(c, switchX + dx, upperWire, 1.9, p.color);
  K.poly(c, [[lead, mid + 4], [lead, lowerWire], [joint, lowerWire], [joint, bottom]], p.color, p.lw);
  const bar = Math.min(p.fs * .63, p.w * .065);
  for (const [y, size] of [[mid - 4, a.voltage < 0 ? .55 : 1], [mid + 4, a.voltage < 0 ? 1 : .55]]) {
    K.line(c, lead - size * bar, y, lead + size * bar, y, p.color, p.lw);
  }
  M.label(c, p, a.isolated ? '断开 · 电荷量固定' : '闭合 · 电压固定', p.x, p.y, p.color, 'left', p.w);
  if (p.h >= 66) {
    const dim = end + p.fs * .37, head = p.fs * .35;
    K.arrow(c, dim, mid, dim, top, p.color, .7, head);
    K.arrow(c, dim, mid, dim, bottom, p.color, .7, head);
    M.label(c, p, [s('d')], dim + 3, mid - p.fs / 2, p.color, 'left', p.fs);
    M.label(c, p, '虚线为等势线', p.x, p.y + p.h - p.fs, C.a, 'left', p.w * .52);
  }
  const basicSeries = (ink, value, current, end, start = 0) => ({ ink, value, current, end, start });
  const dSpec = (ink, value, yLabel) => ({
    xLabel: 'd/cm', yLabel, end: 8, aids: true,
    series: [basicSeries(ink, gap => value(change({ ...a, d: gap / 100 })), a.d * 100, 8, .5)]
  });
  const plot = K.v(o, 'qCapPlot');
  if (plot === 1) {
    const width = a.d * 100;
    const limit = Math.max(1, Math.abs(v.U) * 1.25);
    M.graphs(c, b.plots, [
      { xLabel: 'y/cm', yLabel: 'φ/V', end: width, aids: false,
        series: [basicSeries(C.a, y => v.phi(y / 100 - a.d / 2) + v.U / 2, width / 2, width)] },
      { xLabel: 'U/V', yLabel: 'Q/nC', xmin: -limit, end: limit, aids: false,
        series: [basicSeries(C.E, u => v.capacitance * u * 1e9, v.U, limit, -limit)] }
    ]);
  } else if (plot === 2) {
    M.graphs(c, b.plots, [
      dSpec(C.a, q => q.energy * 1e6, 'E_c/μJ'),
      dSpec(C.I, q => q.externalWork * 1e6, 'W_外/μJ')
    ]);
  } else {
    M.graphs(c, b.plots, [dSpec(C.B, q => q.capacitance * 1e12, 'C/pF'), dSpec(C.E, q => q.E, 'E_y/(V·m⁻¹)')]);
  }
  const answer = K.v(o, 'qCapAnswers');
  M.notes(c, b.notes, [
    answer ? [s('C'), ' = ', { frac: [[s('ε', 0), s('ε', 'r'), s('A')], [s('d')]] }, '，', s('Q'), ' = ', s('C'), s('U'),
      '，', s('E', 'y'), ' = −', { frac: [[s('U')], [s('d')]] }, '，', s('E', 'c'), ' = ', { frac: [['1'], ['2']] }, s('C'), { symbol: 'U', sup: 2 }]
      : '改变板距、面积或均匀填充的介质，判断储能和场强如何变化。',
    answer ? [s('C'), ' = ', ...sci(v.capacitance, 'F'), '    ', s('U'), ' = ', ...quantity(v.U, 'V', 2), '    ',
      s('Q'), ' = ', ...sci(v.Q, 'C'), '    ', s('E', 'y'), ' = ', ...sci(v.E, 'V·m⁻¹')]
      : '比较固定电压和固定自由电荷时的电荷、电压与场强。',
    answer ? ['Δ', s('E', 'c'), ' = ', ...sci(v.delta, 'J'), '    ', s('W', '源'), ' = ', ...sci(v.sourceWork, 'J'),
      '    ', s('W', '外'), ' = ', ...sci(v.externalWork, 'J')]
      : '从参考几何出发，列出电源做功与外功的能量收支。',
    plot === 1 ? '电势图以下板为零点，纵坐标向上 · 均匀填充，忽略边缘'
      : '扫板距时保持面积和介质不变 · 均匀填充 · 忽略边缘 · 准静态'
  ]);
}

K.reg({
  key: 'pm_capacitor_lab', cat: 'em', label: '平行板电容器·恒压与恒荷', animatable: true,
  params: ['qCapMode', ...capKeys, 'qCapPlot', 'qCapSweep', 'qCapAnswers', 'animSpeed'],
  icon: '<path d="M4 7h16M4 17h16M12 2v5m0 10v5M8 9v6m4-6v6m4-6v6"/>',
  canAnimate: o => !!K.v(o, 'qCapSweep'),
  showParam(o, key) {
    if (key === 'qCapVoltage') return K.v(o, 'qCapMode') === 0;
    if (key === 'qCapCharge') return K.v(o, 'qCapMode') === 1;
    return key !== 'animSpeed' || !!K.v(o, 'qCapSweep');
  },
  animationTimeline: () => ({ duration: capDuration, events: [{ t: capDuration, label: '到达设定几何' }] }),
  draw: drawCap
});

const particleKeys = M.parameters('qField', [
  ['Gap', '极板间距', 'm', .08, 1.2, .01, .36],
  ['Length', '极板有效长度', 'm', .2, 2, .05, .65],
  ['E', '竖直场强（向上为正）', 'V/m', -400, 400, 2, -80],
  ['Charge', '粒子电荷量', 'nC', -10, 10, .1, 2],
  ['Mass', '粒子质量', 'μg', .1, 30, .1, 5],
  ['Speed', '初速度', 'm/s', 0, 25, .2, 7],
  ['Angle', '发射角（从向右起逆时针）', '°', -180, 180, 1, 0],
  ['X0', '起点横坐标（板长百分比）', '%', 1, 99, 1, 5],
  ['Y0', '起点高度（以中面为零）', '%', -45, 45, 1, 0]
]);
K.tog('qFieldQuant', '定量匀强电场模式', false);
K.tog('qFieldAnswers', '显示计算关系与结果（在讲解中）', true);
const fieldFor = M.memo(o => {
  const d = num(o, 'qFieldGap'), length = num(o, 'qFieldLength');
  const config = { d, length, field: num(o, 'qFieldE'), charge: num(o, 'qFieldCharge') * 1e-9,
    mass: num(o, 'qFieldMass') * 1e-9, speed: num(o, 'qFieldSpeed'), angle: num(o, 'qFieldAngle'),
    x0: length * num(o, 'qFieldX0') / 100, y0: d * num(o, 'qFieldY0') / 100 };
  return { ...config, ...particle(config) };
}, particleKeys);

function drawParticle(c, o, GH) {
  const b = M.layout(o, GH);
  if (!b) return;
  const m = fieldFor(o), p = b.scene, now = m.at(K.t(o));
  const top = m.d / 2, bottom = -top;
  const trajectory = Array.from({ length: 81 }, (_, i) => m.at(m.transition * i / 80));
  if (m.leaves) trajectory.push(m.at(m.end));
  const A = M.map(p, [{ x: 0, y: bottom }, { x: m.length, y: top }, ...trajectory]);
  const left = A.X(0), right = A.X(m.length), upper = A.Y(top), lower = A.Y(bottom);
  const thick = p.lw * 1.63;
  fieldLines(c, p, left, right, upper, lower, m.field);
  K.line(c, left, upper, right, upper, p.color, thick);
  K.line(c, left, lower, right, lower, p.color, thick);
  K.line(c, left, upper, left, lower, K.alpha(p.color, .55), .7, [4, 4]);
  K.line(c, right, upper, right, lower, K.alpha(p.color, .55), .7, [4, 4]);
  plateSigns(c, p, left, right, upper, lower, -Math.sign(m.field));
  const done = [...trajectory.filter(q => q.t < now.t), now];
  const ahead = [now, ...trajectory.filter(q => q.t > now.t)];
  K.poly(c, ahead.map(A.xy), K.alpha(C.a, .55), p.lw * .65, [4, 4]);
  K.poly(c, done.map(A.xy), C.a, p.lw);
  const [x, y] = A.xy(now), r = Math.max(2.2, p.fs * .26);
  K.dot(c, x, y, r, m.charge > 0 ? C.pos : m.charge < 0 ? C.neg : p.color);
  const speedScale = Math.min(p.w, p.h) * .15 / Math.max(1, m.speed, Math.hypot(m.last.vx, m.last.vy));
  const vector = (dx, dy, ink, tag) => {
    if (Math.hypot(dx, dy) < 2) return;
    K.arrow(c, x, y, x + dx, y + dy, ink, p.lw);
    const tx = K.clamp(x + dx + 3, p.x, p.x + p.w - p.fs);
    const ty = K.clamp(y + dy - p.fs, p.y + p.fs, p.y + p.h - p.fs);
    M.label(c, p, [s(tag)], tx, ty, ink, 'left', p.fs);
  };
  vector(now.vx * speedScale, -now.vy * speedScale, C.v, 'v');
  vector(0, now.force ? -Math.sign(now.force) * Math.min(p.h, p.w) * .12 : 0, C.F, 'F');
  if (m.contact) K.circ(c, A.X(m.last.x), A.Y(m.last.y), r + 2, C.F, 1);
  M.label(c, p, '虚线为边界或后续轨迹 · 力箭长示意', p.x, p.y, p.color, 'left', p.w);
  const series = (key, ink) => ({ ink, value: t => m.at(t)[key], current: now.t, end: m.end,
    events: [m.transition] });
  M.graphs(c, b.plots, [
    { xLabel: 't/s', yLabel: 'y/m', end: m.end, aids: true, series: [series('y', C.a)] },
    { xLabel: 't/s', yLabel: 'v_y/(m·s⁻¹)', end: m.end, aids: true, series: [series('vy', C.v)] }
  ]);
  const answer = K.v(o, 'qFieldAnswers');
  M.notes(c, b.notes, [
    answer ? [s('F', 'y'), ' = ', s('q'), s('E', 'y'), '，', s('a', 'y'), ' = ', { frac: [[s('q'), s('E', 'y')], [s('m')]] },
      '    ', s('a', 'y'), ' = ', ...sci(now.ay, 'm·s⁻²')]
      : '比较正电荷、中性粒子和负电荷的偏转方向。',
    answer ? [s('t'), ' = ', ...quantity(now.t, 's', 3), '    ', s('x'), ' = ', ...quantity(now.x, 'm', 3), '    ',
      s('y'), ' = ', ...quantity(now.y, 'm', 3), '    ', s('v', 'y'), ' = ', ...quantity(now.vy, 'm·s⁻¹', 2)]
      : '用出场位置和出场速度判断场外轨迹。',
    now.stage === 'plate' ? '碰到极板 · 观察结束' : now.stage === 'fieldFree' ? '场外沿出场速度做匀速直线运动' : '板间匀强场 · 忽略重力与边缘效应'
  ]);
}

const deflector = K.TB.shapes.pm_deflect;
if (deflector) {
  const legacy = deflector.draw;
  const sourceParams = deflector.params.slice();
  deflector.params.push('qFieldQuant', ...particleKeys, 'qFieldAnswers', 'animSpeed');
  deflector.showParam = (o, key) => key === 'qFieldQuant'
    || (!!K.v(o, 'qFieldQuant') ? !sourceParams.includes(key) : sourceParams.includes(key));
  deflector.animationTimeline = o => {
    if (!K.v(o, 'qFieldQuant')) return null;
    const m = fieldFor(o);
    return { duration: m.end, events: m.contact ? [{ t: m.transition, label: '碰到极板' }]
      : m.leaves ? [{ t: m.transition, label: '飞出电场' }, { t: m.end, label: '场外观察结束' }] : [] };
  };
  deflector.draw = (c, o, GH) => K.v(o, 'qFieldQuant') ? drawParticle(c, o, GH) : legacy(c, o, GH);
}
})();

/* ===== 上游 pm_g4c_thermo.js ===== */
/* Quasistatic ideal-gas models. Q enters the gas, W leaves the gas. */
(function () {
'use strict';
const K = window.__PM;
const R = 8.31446261815324;
const names = ['等温', '等压', '等容', '可逆绝热'];
const legTime = 2;

function positive(...values) {
  if (values.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Ideal-gas inputs must be positive and finite');
  }
}

function initial({ n, p, V, T, solve = 'p' }) {
  positive(n);
  if (solve === 'p') p = n * R * T / V;
  else if (solve === 'V') V = n * R * T / p;
  else if (solve === 'T') T = p * V / (n * R);
  else throw new RangeError('Unknown dependent gas variable');
  positive(p, V, T);
  return { p, V, T };
}

function leg({ start, n, dof, kind, ratio }) {
  const { p, V, T } = start;
  positive(p, V, T, n, dof, ratio);
  if (!names[kind]) throw new RangeError('Unknown gas process');
  if (Math.abs(p * V / (n * R * T) - 1) > 1e-10) throw new RangeError('Inconsistent ideal-gas state');
  const Cv = dof * R / 2, gamma = 1 + 2 / dof;
  const pressure = v => p * (v / V) ** (kind === 0 ? -1 : kind === 3 ? -gamma : 0);
  function at(progress) {
    const r = 1 + (ratio - 1) * K.clamp(progress, 0, 1);
    const volume = kind === 2 ? V : V * r;
    const temp = [T, T * r, T * r, T * r ** (1 - gamma)][kind];
    const U = n * Cv * (temp - T);
    const W = [n * R * T * Math.log(r), p * V * (r - 1), 0, -U][kind];
    const Q = kind === 3 ? 0 : U + W;
    return { V: volume, p: kind === 2 ? p * r : pressure(volume), T: temp, U, W, Q };
  }
  const end = at(1);
  return { start, end, kind, at, pressure };
}

function experiment({ start, n, dof, kind = 0, ratio, cycle = 0, reverse = false, cool }) {
  let legs = [];
  function add(kind, ratio) {
    legs.push(leg({ start: legs.at(-1)?.end ?? start, n, dof, kind, ratio }));
  }
  if (!cycle) add(kind, ratio);
  else {
    if (!(ratio > 1)) throw new RangeError('A cycle needs an expansion ratio greater than one');
    add(0, ratio);
    if (cycle === 1) {
      add(1, 1 / ratio);
      add(2, ratio);
    } else {
      if (cycle !== 2 || !(cool > 0 && cool < 1)) throw new RangeError('Invalid Carnot reservoirs');
      const adiabaticRatio = cool ** (-dof / 2);
      add(3, adiabaticRatio);
      add(0, 1 / ratio);
      add(3, 1 / adiabaticRatio);
    }
    if (reverse) {
      legs = legs.reverse().map(({ start, end, kind }) =>
        leg({ start: end, n, dof, kind, ratio: kind === 2 ? start.T / end.T : start.V / end.V }));
    }
  }
  const prefix = [{ U: 0, Q: 0, W: 0, Qin: 0, Qout: 0 }];
  for (const { end } of legs) {
    const { U, Q, W, Qin, Qout } = prefix.at(-1);
    prefix.push({ U: U + end.U, Q: Q + end.Q, W: W + end.W,
      Qin: Qin + Math.max(0, end.Q), Qout: Qout - Math.min(0, end.Q) });
  }
  const duration = legs.length * legTime, total = prefix.at(-1);
  function at(time) {
    const progress = K.clamp(time / legTime, 0, legs.length);
    const index = Math.min(Math.floor(progress), legs.length - 1);
    const s = legs[index].at(progress - index), before = prefix[index];
    return { ...s, index, localQ: s.Q, localW: s.W, U: before.U + s.U, W: before.W + s.W, Q: before.Q + s.Q };
  }
  return { legs, total, duration, at, efficiency: cycle && !reverse ? total.W / total.Qin : null,
    carnot: cycle === 2 && !reverse ? 1 - cool : null };
}

K.thermoReview = { initial, leg, experiment, legTime };
})();

(function () {
'use strict';
const K = window.__PM, C = K.C, M = K.reviewMotion;
const { initial, experiment, legTime } = K.thermoReview;
const S = M.symbol;
const names = ['等温', '等压', '等容', '可逆绝热'];
const mode = 'qThQuant';
K.tog(mode, '定量热学与图像联动', false);
K.sel('qThSolve', '由状态方程求', ['初压', '初体积', '初温'], 0);
K.sel('qThGas', '定热容气体', ['双原子气体（5 自由度）', '单原子气体（3 自由度）'], 0);
K.sel('qThCycle', '路径', ['单段过程', '三段循环', '可逆卡诺循环'], 0);
K.sel('qThPlot', '辅助图', ['温度随演示时间', 'p–T', 'V–T', '累计热功及内能'], 0);
K.tog('qThReverse', '逆时针循环', false);
K.tog('qThArea', '标出做功面积', false);
K.tog('qThAnswer', '显示答案和能量读数', false);
K.tog('qThStatic', '静态终态教学图', false);
const numeric = M.parameters('qTh', [
  ['N', '物质的量 n', 'mol', .1, 3, .05, 1],
  ['P', '初压 p₁', 'Pa', 40000, 300000, 1000, 100000],
  ['V', '初体积 V₁', 'm³', .005, .1, .001, .025],
  ['T', '初温 T₁', 'K', 150, 750, 5, 300],
  ['Ratio', '末态体积比（等容时为温度比）', '', .35, 3, .01, 1.5],
  ['Expand', '等温膨胀体积比', '', 1.15, 3, .01, 2],
  ['Cool', '冷源与热源温度比', '', .65, .95, .01, .75]
]);
const enabled = o => K.v(o, mode) === true;
const cycleFor = o => o.type === 'pm_engine' ? ([1, 2][K.v(o, 'qThEngineCycle')] ?? 1)
  : [0, 1, 2][K.v(o, 'qThCycle')] ?? 0;
K.sel('qThEngineCycle', '循环', ['三段循环', '可逆卡诺循环'], 1);
const modelFor = M.memo(o => {
  const number = suffix => M.number(o, 'qTh' + suffix);
  const n = number('N'), cycle = cycleFor(o), reverse = o.type === 'pm_engine'
    ? K.v(o, 'qEngine') === 1 : K.v(o, 'qThReverse') === true;
  const start = initial({ n, p: number('P'), V: number('V'), T: number('T'),
    solve: ['p', 'V', 'T'][K.v(o, 'qThSolve')] ?? 'p' });
  const dof = K.v(o, 'qThGas') === 1 ? 3 : 5;
  const m = experiment({ start, n, dof, cycle, reverse, kind: [0, 1, 2, 3][K.v(o, 'qProc')] ?? 0,
    ratio: number(cycle ? 'Expand' : 'Ratio'), cool: number('Cool') });
  return { ...m, n, dof, cycle, reverse };
}, ['type', 'qEngine', 'qThEngineCycle', 'qThCycle', 'qThReverse', 'qThGas', 'qThSolve', 'qProc', ...numeric]);
K.thermoReview.modelFor = modelFor;
const timeFor = (o, m) => K.v(o, 'qThStatic') ? m.duration : K.clamp(K.t(o), 0, m.duration);
const fmt = (value, unit) => value !== 0 && (Math.abs(value) < .001 || Math.abs(value) >= 10000)
  ? K.scientificQuantity(value, unit, 3) : [K.formatQuantity(value, unit, unit === 'm³' || Math.abs(value) < .1 ? 4 : 2)];
const reading = (symbol, value, unit) => [symbol, ' = ', ...fmt(value, unit)];
const stat = (c, b, tokens, u, v, ink = b.color) =>
  M.label(c, b, tokens, b.x + b.w * u, b.y + b.h * v, ink, 'center', b.w * .92);

function piston(c, b, m, s, answers) {
  const leg = m.legs[s.index], h = b.h * .62, bottom = b.y + b.h * .79;
  const w = b.w * .40, x = b.x + b.w * .24, center = x + w / 2;
  const high = Math.max(...m.legs.flatMap(({ start, end }) => [start.V, end.V]));
  const py = K.drawPiston(c, x, bottom, w, h, h * .80 * s.V / high, b.y + b.h * .11,
    b.color, b.lw, leg.kind === 3, K.alpha(C.gas, .14));
  if (leg.kind === 2) {
    K.box(c, x - 3, py - 2, 6, 4, b.color, 1, C.a);
    K.box(c, x + w - 3, py - 2, 6, 4, b.color, 1, C.a);
  }
  const W = leg.end.W, Q = leg.end.Q, head = Math.min(9, b.h * .09);
  if (answers && W) {
    const xx = x + w + b.w * .1, y = K.clamp(py, b.y + b.h * .18, bottom - b.h * .19);
    K.arrow(c, xx, y + Math.sign(W) * b.h * .10, xx, y - Math.sign(W) * b.h * .10, C.a, b.lw, head);
    M.label(c, b, [S('W')], xx + 5, y - b.fs * .5, C.a, 'left', b.w * .10);
  }
  if (answers && Q) {
    const y1 = bottom, y2 = b.y + b.h * .98;
    K.arrow(c, center, Q > 0 ? y2 : y1, center, Q > 0 ? y1 : y2, Q > 0 ? C.F : C.B, b.lw, head);
    M.label(c, b, [S('Q')], center + 6, (y1 + y2 - b.fs) / 2, Q > 0 ? C.F : C.B, 'left', b.w * .13);
  }
  stat(c, b, names[leg.kind] + (m.cycle ? ' · 第 ' + (s.index + 1) + ' 段' : ''), .5, .01);
}

function engine(c, b, m) {
  const cx = b.x + b.w * .37, hot = b.y + b.h * .21, cold = b.y + b.h * .80, y = (hot + cold) / 2;
  const radius = Math.min(b.w, b.h) * .12, bw = b.w * .60, bh = b.h * .13;
  K.box(c, cx - bw / 2, hot - bh / 2, bw, bh, C.F, b.lw, K.alpha(C.F, .13));
  K.box(c, cx - bw / 2, cold - bh / 2, bw, bh, C.B, b.lw, K.alpha(C.B, .13));
  K.circ(c, cx, y, radius, b.color, b.lw);
  const high = [hot + bh / 2, y - radius], low = [y + radius, cold - bh / 2];
  const heat = (span, ink) => K.arrow(c, cx, span[m.reverse ? 1 : 0], cx, span[m.reverse ? 0 : 1], ink, b.lw, 7);
  heat(high, C.F); heat(low, C.B);
  const a = cx + radius, z = b.x + b.w * .84;
  K.arrow(c, m.reverse ? z : a, y, m.reverse ? a : z, y, C.a, b.lw, 7);
  stat(c, b, [S('W', '净')], .77, .37, C.a);
  stat(c, b, m.cycle === 2 ? '高温热源' : (m.reverse ? '放热侧' : '吸热侧'), .37, .21 - b.fs / b.h / 2, C.F);
  stat(c, b, m.cycle === 2 ? '低温热源' : (m.reverse ? '吸热侧' : '放热侧'), .37, .80 - b.fs / b.h / 2, C.B);
  stat(c, b, m.reverse ? '逆循环' : '热机', .37, .505 - b.fs / b.h / 2);
}

function stateGraph(c, b, m, s, time, xKey, yKey, area, heatColor) {
  const units = { p: 'Pa', V: 'm³', T: 'K' };
  const axesLabel = key => [S(key), '/' + units[key]];
  const vertices = m.legs.flatMap(({ start, end }) => [start, end]);
  const max = key => Math.max(...vertices.map(st => st[key]));
  const fs = Math.min(b.fs, b.h * .16, b.w * .09);
  const A = K.axes(c, b.x, b.y, b.w, b.h, {
    xmin: 0, xmax: max(xKey) * 1.13, ymin: 0, ymax: max(yKey) * 1.14,
    xl: axesLabel(xKey), yl: axesLabel(yKey), O: false, col: b.color, fs, lw: 1,
    pad: { l: fs * 3.2, r: fs, t: fs * 1.6, b: fs * 1.55 }
  });
  const point = st => [A.X(st[xKey]), A.Y(st[yKey])];
  const path = (leg, end = 1) => Array.from({ length: 41 }, (_, i) => point(leg.at(i * end / 40)));
  const completed = time === m.duration;
  if (area && completed && m.cycle) {
    K.poly(c, m.legs.flatMap(leg => path(leg)), null, 0, null, true, K.alpha(m.reverse ? C.B : C.a, .24));
  }
  const labels = [];
  for (const [i, leg] of m.legs.entries()) {
    const u = K.clamp(time / legTime - i, 0, 1), W = leg.end.W, Q = leg.end.Q;
    if (area && u > 0 && W && !(completed && m.cycle)) {
      K.fillUnder(c, A, leg.pressure, leg.start.V, leg.at(u).V, K.alpha(W > 0 ? C.a : C.B, .2));
    }
    const ink = !heatColor || !Q ? b.color : Q > 0 ? C.F : C.B;
    K.poly(c, path(leg), K.alpha(ink, .55), 1, [4, 3]);
    if (u > 0) K.poly(c, path(leg, u), ink, b.lw);
    const [ax, ay] = point(leg.at(.48)), [zx, zy] = point(leg.at(.52));
    const d = Math.hypot(zx - ax, zy - ay);
    if (d > .15) K.head(c, zx, zy, (zx - ax) / d, (zy - ay) / d, Math.min(8, fs * .75), ink);
    const [x, y] = point(leg.start);
    K.circ(c, x, y, 2.4, ink, 1);
    if (m.cycle && b.w > 160 && b.h > 115 && labels.every(([a, z]) => Math.hypot(a - x, z - y) > fs * 2)) {
      const tagX = x - fs * .4, tagY = Math.max(b.y + 1, y - fs * 1.05);
      M.label(c, { ...b, fs: fs * .9 }, [{ symbol: 'ABCD'[i], upright: true }],
        tagX, tagY, b.color, 'right', fs);
      labels.push([x, y]);
    }
  }
  const [x, y] = point(s), [zx, zy] = point(vertices.at(-1));
  K.circ(c, zx, zy, 2.4, b.color, 1);
  K.guide(c, A, s[xKey], s[yKey], K.alpha(b.color, .4), 1);
  K.dot(c, x, y, Math.max(2.5, fs * .24), C.v);
  if (b.w > 135 && b.h > 82) {
    const tickBox = { ...b, fs: fs * .85 };
    for (let i = 1; i <= 2; i++) {
      const vx = max(xKey) * i / 2, vy = max(yKey) * i / 2;
      const tx = A.X(vx), ty = A.Y(vy);
      K.line(c, tx, A.oy - 2, tx, A.oy + 2, b.color, 1);
      K.line(c, A.ox - 2, ty, A.ox + 2, ty, b.color, 1);
      M.label(c, tickBox, fmt(vx, ''), tx, A.oy + 4, b.color, 'center', b.w * .23);
      M.label(c, tickBox, fmt(vy, ''), A.ox - 4, ty - fs / 2, b.color, 'right', fs * 2.9);
    }
  }
}

function draw(c, o, GH) {
  const b = M.layout(o, GH);
  if (!b) return;
  const m = modelFor(o), time = timeFor(o, m), s = m.at(time);
  const answers = K.showDetails(o) && K.v(o, 'qThAnswer');
  const isEngine = o.type === 'pm_engine', isGraph = o.type === 'pm_g_gas';
  const p = b.plots, h = p.h * .49;
  const area = K.v(o, 'qThArea') && answers;
  if (isGraph) stateGraph(c, b.scene, m, s, time, 'V', 'p', area, answers);
  else {
    if (isEngine) engine(c, b.scene, m);
    else piston(c, b.scene, m, s, answers);
    stateGraph(c, isEngine ? p : { ...p, h }, m, s, time, 'V', 'p', area, answers);
  }
  if (!isEngine) {
    const secondary = isGraph ? p : { ...p, y: p.y + p.h - h, h };
    const option = K.v(o, 'qThPlot');
    if (option === 1 || option === 2) stateGraph(c, secondary, m, s, time, 'T', option === 1 ? 'p' : 'V', false, answers);
    else {
      const energy = option === 3 && answers;
      const series = energy ? [['Q', C.F], ['W', C.a], ['U', C.B]] : [['T', C.F]];
      M.graphs(c, secondary, [{
        xLabel: ['演示 ', S('t'), '/s'], xLabelAtTop: true,
        yLabel: energy ? [S('Q'), ', ', S('W'), ', ', S('ΔU'), '/J'] : [S('T'), '/K'],
        end: m.duration, aids: true,
        series: series.map(([key, ink]) => ({ ink, current: time, end: m.duration,
          events: m.legs.slice(0, -1).map((_, i) => legTime * (i + 1)), value: t => m.at(t)[key] }))
      }]);
      if (energy) for (const [i, [key, ink]] of series.entries()) {
        M.label(c, secondary, [S(key === 'U' ? 'ΔU' : key)], secondary.x + secondary.w * (.57 + i * .13),
          secondary.y + secondary.fs * 1.25, ink, 'center', secondary.w * .12);
      }
    }
  }
  const gas = m.dof === 3 ? '单原子 · 3 自由度' : '双原子 · 5 自由度';
  const order = m.cycle ? (m.reverse ? '逆时针' : '顺时针') : names[m.legs[0].kind];
  const rules = [
    [S('ΔU'), ' = ', S('Q'), ' − ', S('W'), '，气体吸热、对外做功为正'],
    [S('pV'), ' = ', S('nRT'), '，', S('ΔU'), ' = ', S('n'), S('C', 'V'), S('ΔT'), '（', gas, '，定热容）']
  ];
  const law = [
    [S('W'), ' = ', S('nRT'), ' ln(', { frac: [[S('V', 2)], [S('V', 1)]] }, ')，', S('ΔU'), ' = 0'],
    [S('W'), ' = ', S('pΔV')],
    [S('W'), ' = 0，', S('ΔU'), ' = ', S('Q')],
    [{ symbol: 'pV', sup: 'γ', variableSup: true }, ' = 常量，', S('γ'), ' = ', { frac: [[S('C', 'P')], [S('C', 'V')]] }, '，', S('Q'), ' = 0']
  ][m.legs[s.index].kind];
  const join = (...parts) => parts.flatMap((tokens, i) => i ? ['　', ...tokens] : tokens);
  const state = join(reading(S('p'), s.p, 'Pa'), reading(S('V'), s.V, 'm³'), reading(S('T'), s.T, 'K'));
  const values = m.cycle && (isEngine || time === m.duration)
    ? [join(reading(S('Q', '入'), m.total.Qin, 'J'), reading(S('Q', '出'), m.total.Qout, 'J'), reading(S('W', '净'), m.total.W, 'J')),
      ['循环 ', S('ΔU'), ' = 0，', S('Q', '净'), ' = ', S('W', '净')],
      ...(m.efficiency === null ? [] :
        [[S('η'), ' = ', { frac: [[S('W', '净')], [S('Q', '入')]] },
          ' = ', K.formatQuantity(100 * m.efficiency, '%', 1),
          ...(m.carnot === null ? [] : ['，可逆卡诺循环 ', S('η'), ' = 1 − ', { frac: [[S('T', '冷')], [S('T', '热')]] }])]])]
    : [join(reading(S('Q'), s.Q, 'J'), reading(S('W'), s.W, 'J'), reading(S('ΔU'), s.U, 'J')), law];
  const context = [...rules[0], ' · 准静态 · ', order];
  const practice = isEngine ? '根据循环方向和有符号面积，判断净功方向并分析热量收支。'
    : '观察过程路径，根据图像判断热量、对外做功和内能变化的符号。';
  if (!answers) M.notes(c, b.notes, ['理想气体 · 准静态过程 · ' + gas + '，定热容', practice]);
  else if (b.notes.w >= 520) {
    const w = (b.notes.w - b.notes.fs) / 2;
    M.notes(c, { ...b.notes, w }, [context, rules[1], state]);
    M.notes(c, { ...b.notes, w, x: b.notes.x + w + b.notes.fs }, values);
  } else M.notes(c, b.notes, [context, rules[1], state, ...values]);
}

for (const key of ['pm_cylinder', 'pm_g_gas', 'pm_engine']) {
  const def = K.TB.shapes[key], legacy = def.draw, legacyParams = def.params;
  const engine = key === 'pm_engine';
  def.params = [...new Set([...legacyParams, mode, engine ? 'qThEngineCycle' : 'qThCycle',
    ...(engine ? [] : ['qProc', 'qThReverse', 'qThPlot']), 'qThGas', 'qThSolve', ...numeric,
    'qThArea', 'qThAnswer', 'qThStatic', 'animSpeed'])];
  def.canAnimate = o => enabled(o) ? !K.v(o, 'qThStatic') : key === 'pm_cylinder';
  def.animatable = true;
  def.showParam = (o, name) => {
    if (name === mode) return true;
    if (!enabled(o)) return legacyParams.includes(name) || (name === 'animSpeed' && key === 'pm_cylinder');
    const cycle = cycleFor(o);
    if (name === 'qGas') return false;
    if (name === 'qProc' || name === 'qThRatio') return !cycle;
    if (name === 'qThReverse' || name === 'qThExpand') return !!cycle;
    if (name === 'qThCool') return cycle === 2;
    if (name === ['qThP', 'qThV', 'qThT'][K.v(o, 'qThSolve')]) return false;
    return name !== 'animSpeed' || def.canAnimate(o);
  };
  def.animationTimeline = o => {
    if (!enabled(o)) return null;
    const m = modelFor(o);
    return { duration: m.duration, timeLabel: t => '演示时间 ' + K.formatQuantity(t, 's', 2),
      events: m.legs.map((_, i) => ({ t: legTime * (i + 1),
      label: i + 1 < m.legs.length ? names[m.legs[i + 1].kind] + '起点' : m.cycle ? '循环闭合' : '末态' })) };
  };
  def.draw = (c, o, GH) => (enabled(o) ? draw : legacy)(c, o, GH);
}
})();

/* ===== 上游 pm_g4c_ac.js ===== */
/* Sinusoidal steady state with resistive loads. Inputs and meters use RMS. */
(function () {
'use strict';
const K = window.__PM, TAU = K.TAU, ROOT2 = Math.SQRT2;

function generator({ turns, field, area, omega, phase, resistance }) {
  if (!Number.isInteger(turns) || turns <= 0 || ![field, area, omega, phase].every(Number.isFinite) ||
      area <= 0 || omega <= 0 || (resistance !== null && (!Number.isFinite(resistance) || resistance <= 0))) {
    throw new RangeError('Invalid generator input');
  }
  const linkage = turns * field * area, period = TAU / omega;
  const peak = Math.abs(linkage * omega), voltage = peak / ROOT2;
  const current = resistance === null ? 0 : voltage / resistance;
  function at(t) {
    const angle = omega * t + phase;
    const s = K.rotatingFlux(linkage, omega, angle);
    const i = resistance === null ? 0 : s.emf / resistance;
    return { ...s, t, angle, i, power: s.emf * i };
  }
  return { at, omega, period, frequency: 1 / period, fluxPeak: Math.abs(linkage), peak, voltage, current, power: voltage * current };
}

function transformer({ turns1, turns2, voltage, frequency, branches, copper1 = 0, copper2 = 0 }) {
  if (![turns1, turns2].every(turn => Number.isInteger(turn) && turn > 0) ||
      ![voltage, frequency, copper1, copper2].every(Number.isFinite) || voltage < 0 || frequency <= 0 ||
      copper1 < 0 || copper2 < 0 || !branches.every(R => R === null || (Number.isFinite(R) && R >= 0))) {
    return { status: 'invalid' };
  }
  const ratio = turns2 / turns1, period = 1 / frequency;
  const shortCount = branches.filter(R => R === 0).length;
  const conductance = branches.reduce((sum, R) => sum + (R > 0 ? 1 / R : 0), 0);
  const load = shortCount ? 0 : conductance ? 1 / conductance : null;
  const referredCopper = ratio ** 2 * copper1 + copper2;
  const source = K.electricLab.closedCircuitSource(voltage * ratio, referredCopper, load);
  if (!source) return { status: 'ideal-short' };
  const i2 = source.sourceCurrent, i1 = ratio * i2, u2 = source.terminalVoltage;
  const input = voltage * i1, output = u2 * i2, loss = i1 ** 2 * copper1 + i2 ** 2 * copper2;
  const currents = branches.map(R => R === null ? 0 : R > 0 ? u2 / R : shortCount === 1 ? i2 : null);
  function at(t) {
    const sin = Math.sin(TAU * t * frequency), factor = Math.abs(sin) < 1e-13 ? 0 : ROOT2 * sin;
    return { t, u1: voltage * factor, u2: u2 * factor, i1: i1 * factor, i2: i2 * factor,
      currents: currents.map(i => i === null ? null : i * factor) };
  }
  return { at, period, frequency, ratio, load, currents, u1: voltage, u2, i1, i2, input, output, loss,
    efficiency: input > 0 ? output / input : null, ideal: referredCopper === 0,
    status: load === null ? 'open' : shortCount ? 'limited-short' : 'loaded' };
}

K.acReview = { generator, transformer };
})();

(function () {
'use strict';
const K = window.__PM, C = K.C, M = K.reviewMotion, S = M.symbol;
const { generator, transformer } = K.acReview;
const duration = 4;
const gMode = 'qAcGenerator', tMode = 'qAcTransformer';
K.tog(gMode, '定量发电机与波形', false);
K.tog(tMode, '负载与波形联动', false);
K.tog('qAcReverse', '反转磁场方向', false);
K.tog('qAcLoad', '接通纯电阻负载', true);
K.tog('qAcBranch1', '接通负载支路一', true);
K.tog('qAcBranch2', '接通负载支路二', false);
K.tog('qAcLoss', '计入绕组铜损', false);
K.tog('qAcAnswer', '显示答案和电表读数', false);
K.tog('qAcStatic', '静态教学图', false);
K.P('qAcFrame', { label: '静态帧所处周期比例', min: 0, max: 1, step: .01, def: .25 });
K.sel('qAcGenPlot', '发电机辅助图', ['电流波形', '瞬时负载功率'], 0);
K.sel('qAcTransPlot', '变压器辅助图', ['原副边电流波形', '负载阻值与功率趋势'], 0);
const gNumbers = M.parameters('qAc', [
  ['Turns', '线圈匝数 N', '', 1, 500, 1, 100],
  ['Field', '磁感应强度 B', 'T', 0, 1.5, .01, .4],
  ['Surface', '线圈面积 S', 'm²', .001, .1, .001, .01],
  ['Omega', '角速度 ω', 'rad/s', .5, 126, .1, 62.8],
  ['Phase', '线圈法线初相位', '°', -180, 180, 1, 0],
  ['GeneratorR', '发电机负载电阻', 'Ω', .5, 200, .5, 10]
]);
const tNumbers = M.parameters('qAc', [
  ['Frequency', '输入频率', 'Hz', 5, 100, 1, 50],
  ['R1', '负载电阻 R₁', 'Ω', 0, 200, .5, 12],
  ['R2', '负载电阻 R₂', 'Ω', 0, 200, .5, 24],
  ['Copper1', '原绕组电阻', 'Ω', 0, 40, .1, 2],
  ['Copper2', '副绕组电阻', 'Ω', 0, 10, .1, .5]
]);
const number = M.number;
const hasPositive = (o, key) => Number.isFinite(+K.v(o, key)) && +K.v(o, key) > 0;
const gFor = M.memo(o => {
  if (!['qAcTurns', 'qAcSurface', 'qAcOmega'].every(key => hasPositive(o, key))) return { status: 'invalid' };
  const field = number(o, 'qAcField') * (K.v(o, 'qAcReverse') ? -1 : 1);
  const resistance = K.v(o, 'qAcLoad') ? number(o, 'qAcGeneratorR') : null;
  if (resistance !== null && !hasPositive(o, 'qAcGeneratorR')) return { status: 'ideal-short' };
  const model = generator({ turns: Math.round(number(o, 'qAcTurns')), field, area: number(o, 'qAcSurface'),
    omega: number(o, 'qAcOmega'), phase: number(o, 'qAcPhase') * Math.PI / 180, resistance });
  return { ...model, field, resistance, phase: number(o, 'qAcPhase') };
}, [...gNumbers, 'qAcReverse', 'qAcLoad']);
const tFor = M.memo(o => {
  if (!['qN1t', 'qN2t', 'qAcFrequency'].every(key => hasPositive(o, key))) return { model: { status: 'invalid' } };
  const copper = K.v(o, 'qAcLoss');
  const config = { turns1: Math.round(number(o, 'qN1t')), turns2: Math.round(number(o, 'qN2t')),
    voltage: number(o, 'qU1'), frequency: number(o, 'qAcFrequency'),
    branches: [K.v(o, 'qAcBranch1') ? number(o, 'qAcR1') : null, K.v(o, 'qAcBranch2') ? number(o, 'qAcR2') : null],
    copper1: copper ? number(o, 'qAcCopper1') : 0, copper2: copper ? number(o, 'qAcCopper2') : 0 };
  return { config, model: transformer(config) };
}, ['qN1t', 'qN2t', 'qU1', ...tNumbers, 'qAcBranch1', 'qAcBranch2', 'qAcLoss']);
K.acReview.generatorFor = gFor;
K.acReview.transformerFor = tFor;

const fmt = (v, unit) => v !== 0 && (Math.abs(v) < .01 || Math.abs(v) >= 10000)
  ? K.scientificQuantity(v, unit, 3) : [K.formatQuantity(v, unit, 2)];
const value = (tag, v, unit) => [tag, ' = ', ...fmt(v, unit)];
const row = (...groups) => groups.flatMap((tokens, i) => i ? ['　', ...tokens] : tokens);
const frac = (a, b) => ({ frac: [a, b] });
const rms = (name, i) => S(name, i ? i + ', 有效' : '有效');
const period = S('T');

function readingColumns(c, b, left, right) {
  if (b.w < 510) M.notes(c, b, [...left, ...right]);
  else {
    const w = (b.w - b.fs) / 2;
    M.notes(c, { ...b, w }, left);
    M.notes(c, { ...b, x: b.x + w + b.fs, w }, right);
  }
}

function waveform(c, b, m, time, names, unit, peaks) {
  const end = 2 * m.period;
  const fs = Math.min(b.fs, b.h * .18, b.w * .08);
  const peak = Math.max(...peaks, 1e-12);
  const positive = names[0][0] === 'power';
  const A = K.axes(c, b.x, b.y, b.w, b.h, { xmin: 0, xmax: end, ymin: positive ? 0 : -peak * 1.17,
    ymax: peak * 1.15, xl: [], yl: [], O: false, fs, col: b.color, lw: 1,
    pad: { l: fs * 3, r: fs * 1.3, t: fs * 2, b: fs * 1.1 } });
  const lab = (tokens, x, y, ink = b.color, align = 'left', w = b.w * .55) =>
    M.label(c, { ...b, fs }, tokens, x, y, ink, align, w);
  for (const [i, [, tag, ink]] of names.entries()) {
    lab([tag, '/' + unit], A.X0 + fs * .4 + i * fs * 4.8, b.y + 2, ink, 'left', fs * 4.4);
  }
  lab([S('t'), '/s'], b.x + b.w - 2, b.y + 2, b.color, 'right', fs * 2.2);
  if (b.w > 125 && b.h > 65) {
    for (const tick of peaks.every(p => p === 0) ? [0] : positive ? [0, peak] : [-peak, 0, peak]) {
      const py = A.Y(tick);
      K.line(c, A.ox - 2, py, A.ox + 2, py, b.color, 1);
      lab(tick === 0 ? ['0'] : fmt(tick, ''), A.X0 - 4, py - fs * .43, b.color, 'right', fs * 2.8);
    }
    for (const t of [m.period, end]) {
      K.line(c, A.X(t), A.oy - 2, A.X(t), A.oy + 2, b.color, 1);
      lab([K.formatQuantity(t, '', t < .1 ? 3 : 2)], A.X(t), A.Y1 + 2, b.color, 'right', fs * 4);
    }
  }
  const x = A.X(time), state = m.at(time);
  K.line(c, x, A.Y0, x, A.Y1, K.alpha(b.color, .65), 1, [2, 3]);
  for (const [i, [key, , ink]] of names.entries()) {
    K.plot(c, A, t => m.at(t)[key], 0, end, ink, i ? 1 : b.lw, null, 144);
    K.circ(c, x, A.Y(state[key]), i ? 2.2 : 3.5, ink, 1.5);
  }
}

function stack(b, count) {
  const gap = Math.min(8, b.h * .04), h = (b.h - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({ ...b, y: b.y + i * (h + gap), h }));
}

function readGenerator(c, b, m, s, answers) {
  if (!answers) {
    M.notes(c, b, ['匀强磁场 · 匀速转动 · 理想滑环 · 电阻负载',
      '对照两条波形的零点和峰值。比较转速变化前后的周期与峰值。']);
    return;
  }
  readingColumns(c, b, [
    [S('Φ'), ' = ', S('NBS'), ' cos(', S('ωt'), ' + ', S('φ', 0), ')（总磁通链，', S('B'), ' 向右为正）'],
    [S('ℰ'), ' = −', frac(['d', S('Φ')], ['d', S('t')]), ' = ', S('NBSω'), ' sin(', S('ωt'), ' + ', S('φ', 0), ')'],
    row(value(S('Φ'), s.flux, 'Wb'), value(S('dΦ/dt'), s.fluxRate, 'Wb/s')),
    row(value(S('ℰ'), s.emf, 'V'), value(S('i'), s.i, 'A'), value(S('P', '瞬时'), s.power, 'W'))
  ], [
    row(value(S('f'), m.frequency, 'Hz'), value(period, m.period, 's'), value(S('φ', 0), m.phase, '°')),
    row(value(S('U', '峰'), m.peak, 'V'), value(S('I', '峰'), m.current * Math.SQRT2, 'A'), [S('U', '平均'), ' = 0 V']),
    row(value(rms('U'), m.voltage, 'V'), value(rms('I'), m.current, 'A'), value(S('P', '平均'), m.power, 'W')),
    [S('U', '有效'), ' = ', frac([S('U', '峰')], ['√2']), '（纯正弦）　', S('P', '平均'), ' = ', rms('U'), rms('I'), '（纯电阻）']
  ]);
}

function invalid(c, b, status) {
  const text = status === 'ideal-short' ? '理想电路短路 · 无有限工作点' : '参数无效 · 请检查匝数、频率和其他输入';
  M.label(c, b.scene, text, b.scene.x + b.scene.w / 2, b.scene.y + b.scene.h * .48,
    C.F, 'center', b.scene.w * .96);
}

const physicalTime = (o, m) => m.period * (K.v(o, 'qAcStatic') ? number(o, 'qAcFrame') : 2 * K.clamp(K.t(o) / duration, 0, 1));
function drawGenerator(c, o, GH) {
  const b = M.layout(o, GH);
  if (!b) return;
  const m = gFor(o);
  if (!m.at) return invalid(c, b, m.status);
  const t = physicalTime(o, m), s = m.at(t), scene = b.scene;
  K.drawGeneratorCoil(c, { x1: scene.x, y1: scene.y, w: scene.w, h: scene.h }, scene.color,
    scene.lw, Math.min(scene.fs, scene.w * .07), s.angle, m.field, s.i, true);
  M.label(c, scene, m.field ? [S('B'), ' · ', m.field > 0 ? '向右' : '向左'] : [S('B'), ' = 0 T'],
    scene.x + scene.w * .52, scene.y + scene.h * .10, C.B, 'center', scene.w * .7);
  const span = K.mod(s.angle, K.TAU);
  const phase = Math.abs(Math.sin(span)) < 1e-12 ? '中性面' : Math.abs(Math.cos(span)) < 1e-12 ? '线圈法线垂直于场向' : '';
  M.label(c, scene, [m.resistance === null ? '开路' : '纯电阻负载', ...(phase && m.field ? [' · ', phase] : [])],
    scene.x + scene.w * .52, scene.y + scene.h * .87, scene.color, 'center', scene.w * .9);
  const [flux, emf, third] = stack(b.plots, 3);
  const power = K.v(o, 'qAcGenPlot') === 1;
  waveform(c, flux, m, t, [['flux', S('Φ'), C.B]], 'Wb', [m.fluxPeak]);
  waveform(c, emf, m, t, [['emf', S('ℰ'), C.a]], 'V', [m.peak]);
  waveform(c, third, m, t, power ? [['power', S('P', '瞬时'), C.F]] : [['i', S('i'), C.I]],
    power ? 'W' : 'A', [power ? 2 * m.power : Math.SQRT2 * m.current]);
  readGenerator(c, b.notes, m, s, K.showDetails(o) && K.v(o, 'qAcAnswer'));
}

function drawCircuit(c, b, config, s, GH) {
  const scale = Math.min(b.w / 560, b.h / 310);
  c.save();
  c.translate(b.x + (b.w - 560 * scale) / 2, b.y + (b.h - 310 * scale) / 2);
  c.scale(scale, scale);
  const color = b.color, law = { ...b, fs: 15, w: 560 };
  const symbol = (name, x, y, w, h) => K.electricLab.drawSymbol(c, GH, name, x, y, w, h, color);
  const label = (tokens, x, y, ink = color, w = 100) => M.label(c, law, tokens, x, y, ink, 'center', w);
  const wire = (...points) => K.poly(c, points, color, 1.8);
  const dot = (x, y) => K.dot(c, x, y, 2.8, color);
  const arrow = (x, y, sign, down = false) => {
    if (sign) K.head(c, x, y, down ? 0 : Math.sign(sign), down ? Math.sign(sign) : 0, 8, C.I);
  };
  const [primary, secondary] = K.drawTransformerCore(c, { x1: 95, y1: 38, w: 370, h: 249 },
    color, 1.6, config.turns1, config.turns2);
  const y = primary.top, z = primary.bottom, mid = (y + z) / 2, radius = 13;
  const voltmeter = x => {
    wire([x, y], [x, mid - radius]); wire([x, mid + radius], [x, z]);
    symbol('voltmeter', x, mid, 2 * radius, 2 * radius);
    dot(x, y); dot(x, z);
  };
  const ammeter = (x, left, right) => {
    wire([left, y], [x - radius, y]); wire([x + radius, y], [right, y]);
    symbol('ammeter', x, y, 2 * radius, 2 * radius);
  };
  const source = 28, v1 = 70, a1 = 117, a2 = 418, v2 = 462, r1 = 505, r2 = 546;
  ammeter(a1, source, primary.x); ammeter(a2, secondary.x, r2);
  wire([primary.x, z], [source, z], [source, mid + radius]);
  wire([source, y], [source, mid - radius]);
  wire([secondary.x, z], [r2, z]);
  K.circ(c, source, mid, radius, color, 1.7);
  K.poly(c, Array.from({ length: 21 }, (_, i) => [source - 8 + .8 * i, mid - 4 * Math.sin(K.TAU * i / 20)]), color, 1.4);
  voltmeter(v1); voltmeter(v2);
  dot(primary.x, y); dot(secondary.x, y);
  for (const [i, x] of [r1, r2].entries()) {
    const R = config.branches[i], switchTop = y + 13, switchBottom = y + 39;
    wire([x, y], [x, switchTop]); wire([x, switchBottom], [x, mid + 5]);
    wire([x, mid + 41], [x, z]);
    dot(x, switchTop); dot(x, switchBottom);
    wire([x, switchBottom], [R === null ? x - 10 : x, R === null ? switchTop + 6 : switchTop]);
    c.save(); c.translate(x, mid + 23); c.rotate(Math.PI / 2);
    symbol('resistor', 0, 0, 36, 14);
    c.restore();
    label([S('R', i + 1)], x, z + 9, color, 31);
    if (i === 0) { dot(x, y); dot(x, z); }
    arrow(x, z - 5, s?.currents[i], true);
  }
  arrow(a1 + 34, y, s?.i1); arrow(a2 + 29, y, s?.i2);
  label([S('N', 1), ' = ' + config.turns1], primary.center, primary.labelY + 9);
  label([S('N', 2), ' = ' + config.turns2], secondary.center, secondary.labelY + 9);
  label('原边', 100, y - 40); label('副边', 465, y - 40);
  label('上端为电压正参考 · 箭头示瞬时电流方向', 280, 278, color, 480);
  c.restore();
}

function loadGraph(c, b, config, m) {
  const sweep = config.branches[0] === null && config.branches[1] !== null ? 1 : 0;
  const resistance = config.branches[sweep];
  if (resistance === null) {
    M.label(c, b, '接通负载可比较阻值与功率', b.x + b.w / 2, b.y + b.h / 2, b.color, 'center', b.w * .9);
    return;
  }
  const at = R => transformer({ ...config, branches: config.branches.map((value, i) => i === sweep ? R : value) });
  const halfOhm = .5, max = 200, current = K.clamp(resistance, halfOhm, max);
  // A short on the other branch can leave every trial without a finite operating point.
  if (!at(current).at) {
    M.label(c, b, '理想短路 · 功率曲线无有限工作点', b.x + b.w / 2, b.y + b.h / 2, C.F, 'center', b.w * .94);
    return;
  }
  M.graphs(c, b, [{ xmin: 0, end: max, xLabel: [S('R', sweep + 1), '/Ω'], xLabelAtTop: true,
    yLabel: ['平均 ', S('P'), '/W'], aids: resistance >= halfOhm,
    series: [['input', C.I], ['output', C.v]].map(([key, ink]) => ({
      start: halfOhm, end: max, current, active: resistance >= halfOhm && !!m.at, ink,
      value: R => at(R)[key]
    })) }]);
  M.label(c, b, [S('P', '入')], b.x + b.w * .65, b.y + b.fs * 1.25, C.I, 'center', b.w * .19);
  M.label(c, b, [S('P', '出')], b.x + b.w * .86, b.y + b.fs * 1.25, C.v, 'center', b.w * .19);
}

function drawTransformer(c, o, GH) {
  const b = M.layout(o, GH);
  if (!b) return;
  const { config, model: m } = tFor(o);
  if (!config) return invalid(c, b, m.status);
  const t = m.at ? physicalTime(o, m) : 0, s = m.at?.(t);
  drawCircuit(c, b.scene, config, s, GH);
  if (!s) return invalid(c, { scene: b.plots }, m.status);
  const showTrend = K.v(o, 'qAcTransPlot') === 1;
  const [voltage, current, trend] = stack(b.plots, showTrend ? 3 : 2);
  waveform(c, voltage, m, t, [['u1', S('u', 1), C.B], ['u2', S('u', 2), C.a]],
    'V', [m.u1 * Math.SQRT2, m.u2 * Math.SQRT2]);
  waveform(c, current, m, t, [['i1', S('i', 1), C.I], ['i2', S('i', 2), C.v]],
    'A', [m.i1 * Math.SQRT2, m.i2 * Math.SQRT2]);
  if (trend) loadGraph(c, trend, config, m);
  const mode = m.ideal ? '理想、无励磁电流 · 纯电阻负载' : '串联绕组电阻 · 忽略励磁、漏磁与铁损';
  const status = { open: '开路', loaded: '负载接通', 'limited-short': '短路 · 电流由绕组电阻限制' }[m.status];
  if (!K.showDetails(o) || !K.v(o, 'qAcAnswer')) {
    M.notes(c, b.notes, [mode + ' · ' + status, '固定输入电压和匝数比，改变负载，比较两边电流和输出功率。']);
    return;
  }
  const law = m.ideal
    ? [rms('U', 2), ' = ', rms('U', 1), frac([S('N', 2)], [S('N', 1)]), '，', rms('I', 1), ' = ', rms('I', 2),
      frac([S('N', 2)], [S('N', 1)]), '，', S('P', '入'), ' = ', S('P', '出')]
    : [S('P', '入'), ' = ', S('P', '出'), ' + ', S('P', '铜'), '，', S('P', '铜'), ' = ',
      { symbol: 'I', sub: '1, 有效', sup: 2 }, S('r', 1), ' + ', { symbol: 'I', sub: '2, 有效', sup: 2 }, S('r', 2)];
  readingColumns(c, b.notes, [
    [mode + ' · ' + status], law,
    row(value(rms('U', 1), m.u1, 'V'), value(rms('U', 2), m.u2, 'V'), value(S('f'), m.frequency, 'Hz')),
    row(value(rms('I', 1), m.i1, 'A'), value(rms('I', 2), m.i2, 'A'),
      m.load === null ? ['副边开路'] : value(S('R', '等效'), m.load, 'Ω'))
  ], [
    row(value(S('u', 1), s.u1, 'V'), value(S('u', 2), s.u2, 'V')),
    row(value(S('i', 1), s.i1, 'A'), value(S('i', 2), s.i2, 'A')),
    row(value(S('P', '入'), m.input, 'W'), value(S('P', '出'), m.output, 'W'), value(S('P', '铜'), m.loss, 'W')),
    m.efficiency === null ? ['效率未定义（输入有功功率为零）'] : ['平均功率 · ', ...value(S('η'), m.efficiency * 100, '%')]
  ]);
}

function timeline(m, phase, isGenerator) {
  if (!m.at) return null;
  const events = [];
  for (let i = -4; i <= 12; i++) {
    const t = (i * Math.PI / 2 - phase) * duration / (2 * K.TAU);
    if (t <= 1e-8 || t > duration + 1e-8) continue;
    const label = isGenerator
      ? m.field ? (i % 2 ? '磁通链过零' : '电动势过零') : (i % 2 ? '法线垂直于参考轴' : '法线平行于参考轴')
      : i % 2 ? '电压达峰' : '电压过零';
    events.push({ t: Math.min(t, duration), label });
  }
  return { duration, events, stepLabel: '前进 0.10 s（演示）',
    timeLabel: t => '物理时间 ' + K.formatQuantity(t * 2 * m.period / duration, 's', 4) };
}

for (const [key, mode, read, draw] of [
  ['pm_generator', gMode, gFor, drawGenerator], ['pm_transformer', tMode, o => tFor(o).model, drawTransformer]
]) {
  const def = K.TB.shapes[key], legacy = def.draw, oldParams = def.params || [];
  const isGenerator = key === 'pm_generator', enabled = o => K.v(o, mode) === true;
  const extras = isGenerator ? [...gNumbers, 'qAcReverse', 'qAcLoad', 'qAcGenPlot']
    : [...tNumbers, 'qAcBranch1', 'qAcBranch2', 'qAcLoss', 'qAcTransPlot'];
  def.params = [...oldParams, mode, ...extras, 'qAcAnswer', 'qAcStatic', 'qAcFrame', 'animSpeed'];
  def.animatable = true;
  def.canAnimate = o => enabled(o) ? !K.v(o, 'qAcStatic') && !!read(o).at : isGenerator;
  def.showParam = (o, name) => {
    if (name === mode) return true;
    if (!enabled(o)) return oldParams.includes(name);
    if (name === 'qAcGeneratorR') return !!K.v(o, 'qAcLoad');
    if (name === 'qAcCopper1' || name === 'qAcCopper2') return !!K.v(o, 'qAcLoss');
    if (name === 'qAcFrame') return !!K.v(o, 'qAcStatic');
    return name !== 'animSpeed' || def.canAnimate(o);
  };
  def.animationTimeline = o => {
    if (!enabled(o)) return null;
    return timeline(read(o), isGenerator ? number(o, 'qAcPhase') * Math.PI / 180 : 0, isGenerator);
  };
  def.draw = (c, o, GH) => (enabled(o) ? draw : legacy)(c, o, GH);
}
})();

/* ===== 上游 pm_g4d_photo.js ===== */
/* P1-09: one optical state for the tube, meter readings and characteristics. */
(function () {
'use strict';
const K = window.__PM, C = K.C, R = K.reviewMotion;
const { H, E_CHARGE: e, LIGHT_SPEED: c0 } = K.photoelectricConstants;
const nmTHz = c0 / 1e5;
const symbol = (name, sub) => ({ symbol: name, sub });
const q = K.formatQuantity;
K.P('qPeLambda', { label: '入射波长 / nm', min: nmTHz / 15, max: nmTHz / 3, step: 'any', def: nmTHz / 8 });
K.P('qPeW', { label: '自定义逸出功 / eV', min: .5, max: 6, step: .01, def: 2.29 });
K.sel('qPeLight', '入射光控制', ['固定功率', '固定光子通量'], 0);
K.P('qPePower', { label: '入射光功率 / μW', min: 0, max: 100, step: 1, def: 24 });
K.P('qPeFlux', { label: '入射光子通量 / (10¹³ s⁻¹)', min: 0, max: 20, step: .1, def: 4 });
K.P('qPeEta', { label: '饱和收集时量子效率 / %', min: 0, max: 100, step: 1, def: 12 });
K.sel('qPeFamily', '光电流曲线', ['当前光照', '比较光强（频率固定）', '比较频率（保留入射控制）'], 0);
K.tog('qPeAnswer', '显示计算结果', true);
K.tog('qPePause', '在关键时刻自动暂停', false);
K.TB.paramDefs.qMetal.options.push({ value: '4', label: '自定义材料' });
K.TB.paramDefs.qUak.min = -6;
const params = ['qNu', 'qPeLambda', 'qMetal', 'qPeW', 'qPeLight', 'qPePower', 'qPeFlux', 'qPeEta', 'qUak'];
function linkParams(o, key) {
  if (key === undefined || key === 'qNu' || key === 'qPeLambda') {
    const f = key === 'qPeLambda' ? nmTHz / R.number(o, key) : R.number(o, 'qNu');
    return { qNu: f, qPeLambda: nmTHz / f };
  }
}
function show(o, p) {
  if (p === 'qPeW') return K.v(o, 'qMetal') === 4;
  if (p === 'qPePower') return K.v(o, 'qPeLight') !== 1;
  if (p === 'qPeFlux') return K.v(o, 'qPeLight') === 1;
  if (p === 'qPeAnswer') return K.showDetails(o);
  return true;
}
function input(o) {
  const wavelengthOnly = o.qNu == null && o.qPeLambda != null && Number.isFinite(+o.qPeLambda);
  return { frequency: (wavelengthOnly ? nmTHz / R.number(o, 'qPeLambda') : R.number(o, 'qNu')) * 1e14,
    workFunction: K.v(o, 'qMetal') === 4 ? R.number(o, 'qPeW') : K.photoelectricMaterials[K.v(o, 'qMetal')] ?? 2.29,
    voltage: R.number(o, 'qUak'), efficiency: R.number(o, 'qPeEta') / 100,
    ...(K.v(o, 'qPeLight') === 1 ? { flux: R.number(o, 'qPeFlux') * 1e13 } : { power: R.number(o, 'qPePower') * 1e-6 }) };
}
const read = o => K.photoelectricLab(input(o));
function family(o, mode) {
  const p = input(o), factor = (v, s) => v === undefined ? undefined : v * s;
  return (mode === 1 ? [0.5, 1, 1.5].map(s => ({
    ...p, flux: factor(p.flux, s), power: factor(p.power, s)
  })) : mode === 2 ? [.75, 1, 1.25].map(s => ({
    ...p, frequency: p.frequency * s
  })) : [p]).map(K.photoelectricLab);
}

function chart(c, b, o, mode) {
  const states = family(o, mode), s = states[mode ? 1 : 0];
  const inks = mode ? [C.B, C.F, C.v] : [C.F];
  const dashes = mode ? [[6, 3], null, [2, 3]] : [null];
  const fs = Math.min(b.fs, b.h * .13, b.w * .075);
  const maxI = Math.max(.1, ...states.map(m => m.saturation * 1e6));
  const xmin = Math.min(-6, ...states.map(m => -(m.stoppingVoltage + .4)));
  const head = fs * (mode ? 2.55 : 1.45);
  const A = K.axes(c, b.x, b.y + head, b.w, b.h - head, {
    xmin, xmax: 4, ymin: 0, ymax: maxI * 1.22, O: false, col: b.color, lw: 1, fs, xLabelAbove: true,
    xl: [symbol('U', 'AK'), ' / V'], yl: [symbol('I'), ' / μA'],
    pad: { l: fs * .6, r: fs * 1.4, t: fs * 1.55, b: fs * 1.45 }
  });
  const label = (t, x, y, ink = b.color, w = b.w) =>
    K.drawMathLabel(c, t, x, y, { c: ink, s: fs, al: 'center', maxWidth: w, maxHeight: fs * 1.12, essential: true });
  label(mode === 1 ? '收集近似 · 同频率' : mode === 2 ? '收集近似 · ' + (K.v(o, 'qPeLight') === 1 ? '同光子通量' : '同光功率') : '光电流 · 收集近似',
    b.x + b.w / 2, b.y);
  states.forEach((m, i) => {
    const value = u => m.currentAt(u) * 1e6;
    const cuts = m.saturation > 0 ? [m.signedStop, 0, 1, 4] : [xmin, 4];
    for (let j = 1; j < cuts.length; j++) K.plot(c, A, value, cuts[j - 1], cuts[j], inks[i],
      i === (mode ? 1 : 0) ? b.lw * 1.4 : b.lw, dashes[i], 2);
    if (m.aboveThreshold && m.saturation > 0) K.circ(c, A.X(m.signedStop), A.oy, 2, inks[i], 1);
    if (mode) {
      const key = mode === 1 ? ['0.5×', '1×', '1.5×'][i] : q(m.frequency / 1e14, '', 1);
      const x = b.x + b.w * (.17 + .25 * i), y = b.y + fs * 1.24;
      K.line(c, x - b.w * .095, y + fs * .49, x - b.w * .054, y + fs * .49, inks[i], b.lw, dashes[i]);
      label(key + (m.aboveThreshold ? '' : '（无发射）'), x + b.w * .035, y, inks[i], b.w * .16);
    }
  });
  const ticks = b.w >= 190 ? [-6, -4, -2, 0, 2, 4] : [-6, 0, 4];
  for (const u of ticks) {
    K.line(c, A.X(u), A.oy - 2, A.X(u), A.oy + 2, b.color, 1);
    label(String(u), A.X(u), A.oy + fs * .32, b.color, fs * 2);
  }
  if (mode === 2) label('×10¹⁴ Hz', b.x + b.w * .88, b.y + fs * 1.24, b.color, b.w * .23);
  const top = s.saturation * 1e6 || maxI;
  const dotX = A.X(s.voltage), dotY = A.Y(s.current * 1e6);
  if (K.showDetails(o) && K.v(o, 'qPeAnswer')) {
    const py = A.Y(top);
    K.line(c, A.ox - 2, py, A.ox + 2, py, b.color, 1);
    label(String(Number(top.toPrecision(3))), A.ox - fs * 2, py - fs * .48, b.color, fs * 3.7);
    K.guide(c, A, s.voltage, s.current * 1e6, b.color, .8);
  }
  K.dot(c, dotX, dotY, Math.max(2, fs * .23), C.F);
}

function tube(c, b, s, time, readings) {
  const X = u => b.x + u * b.w, Y = v => b.y + v * b.h;
  const fs = Math.min(b.fs, b.h * .105, b.w * .065), col = b.color, lw = b.lw;
  const line = (x, y, z, w, color = col) => K.line(c, X(x), Y(y), X(z), Y(w), color, lw);
  const label = (text, x, y, cap = .85, ink = col) => K.drawMathLabel(c, text, X(x), Y(y),
    { c: ink, al: 'center', s: fs, maxHeight: fs * 1.2, maxWidth: b.w * cap, essential: true });
  const r = Math.min(b.w * .055, b.h * .073);
  c.save(); c.beginPath(); c.ellipse(X(.5), Y(.29), b.w * .35, b.h * .16, 0, 0, K.TAU);
  c.strokeStyle = col; c.lineWidth = lw; c.stroke(); c.restore();
  const l = .31, a = .69, y = .32, branch = .56, meter = .72, bottom = .85;
  line(l, .23, l, .41); line(a, .25, a, .39);
  line(.08, y, l, y); line(a, y, .92, y);
  line(.08, y, .08, bottom);
  K.line(c, X(.92), Y(y), X(.92), Y(meter) - r, col, lw);
  K.line(c, X(.92), Y(meter) + r, X(.92), Y(bottom), col, lw);
  K.circ(c, X(.92), Y(meter), r, col, lw);
  label('A', .92, meter - (fs * .55) / b.h, .10);
  for (const v of [branch, bottom]) {
    K.line(c, X(.08), Y(v), X(.5) - r, Y(v), col, lw);
    K.line(c, X(.5) + r, Y(v), X(.92), Y(v), col, lw);
  }
  for (const x of [.08, .92]) K.dot(c, X(x), Y(branch), Math.max(1.5, lw), col);
  K.circ(c, X(.5), Y(branch), r, col, lw);
  label('V', .5, branch - (fs * .55) / b.h, .10);
  // Adjustable ideal bipolar DC source; signs indicate the actual polarity.
  K.box(c, X(.5) - r, Y(bottom) - r * .52, r * 2, r * 1.04, col, lw);
  const mark = s.voltage > 0 ? '− +' : s.voltage < 0 ? '+ −' : '0';
  label(mark, .5, bottom - fs * .48 / b.h, .11);
  label('可调直流源', .5, .92);
  label('阴极 K', .27, .46, .30); label('阳极 A', .74, .46, .30);
  label([s.photons ? '单色光 ' : '光源关闭 ', symbol('λ'), ' = ' + q(s.wavelength, 'nm', 0)], .5, .02);
  if (s.photons) for (const offset of [-.025, .025])
    K.ray(c, X(.10), Y(.14 + offset), X(l), Y(.28 + offset), C.light, lw);
  // Deterministic representative tracks. Flight time is deliberately slowed;
  // transmitted and reflected populations use the same collection fraction.
  if (s.emissionRate > 0) {
    label('电子慢放示意', .5, .38, .25, C.B);
    const count = Math.max(1, Math.min(16, Math.ceil(16 * Math.sqrt(s.emissionRate / 2e14))));
    for (let i = 0; i < count; i++) {
      const emitted = i * 1.25 / count;
      if (time < emitted) continue;
      const t = ((time - emitted) % 1.25) / 1.25;
      const sample = ((i * .618034 + .19) % 1);
      const passes = sample < s.currentFraction;
      const u = passes ? t : (s.voltage < 0 ? Math.min(1, s.kinetic / -s.voltage) : .72) *
        (.35 + .58 * sample) * 4 * t * (1 - t);
      K.dot(c, X(l + (a - l) * u), Y(y + .095 * (sample - .5)), Math.max(1.6, lw), C.B);
    }
  }
  if (readings) {
    label(q(s.current * 1e6, 'μA', 2), .74, .68, .23, C.F);
    label(q(s.voltage, 'V', 2), .5, .66, .25);
  }
}

function draw(c, o, GH) {
  const frame = R.layout(o, GH);
  if (!frame) return;
  const s = read(o), answers = K.showDetails(o) && !!K.v(o, 'qPeAnswer');
  tube(c, frame.scene, s, K.clamp(K.t(o), 0, 5), answers);
  chart(c, frame.plots, o, K.v(o, 'qPeFamily'));
  const notes = answers ? [
    [symbol('U', 'AK'), ' = ', symbol('φ', 'A'), ' − ', symbol('φ', 'K'), '；电子电荷 −', symbol('e'),
      '；电子运动为慢放示意'],
    [symbol('E'), ' = ', symbol('hf'), ' = ', { frac: [[symbol('hc')], [symbol('λ')]] }, ' = ' + q(s.energy, 'eV', 3),
      '；', symbol('W', '0'), ' = ' + q(s.workJ / e, 'eV', 2), '；', symbol('f', '0'), ' = ' + q(s.cutoff / 1e14, '×10¹⁴ Hz', 2)],
    s.aboveThreshold ? [symbol('K', 'max'), ' = ', symbol('hf'), ' − ', symbol('W', '0'), ' = ' + q(s.kinetic, 'eV', 3),
      '；', symbol('U', 'stop'), ' = ' + q(s.stoppingVoltage, 'V', 3),
      '；带符号遏止电压 ' + q(s.signedStop, 'V', 3)]
      : s.threshold ? '恰达阈值：最大初动能为零，教学模型的可收集产额取零' : '低于截止频率：没有单光子发射',
    [symbol('I', 'sat'), ' = ', symbol('eηΦ'), ' = ' + q(s.saturation * 1e6, 'μA', 2),
      '；', symbol('Φ'), ' = ' + q(s.photons / 1e13, '×10¹³ s⁻¹', 2)]
  ] : ['阳极相对阴极为电压正向；电子运动为慢放示意'];
  if (answers && frame.notes.w >= 620) {
    const n = frame.notes, w = n.w * .49;
    R.notes(c, { ...n, w }, notes.slice(0, 2));
    R.notes(c, { ...n, w, x: n.x + n.w * .51 }, notes.slice(2));
  } else R.notes(c, frame.notes, notes);
}

const photo = K.TB.shapes.pm_photoelectric;
Object.assign(photo, { params: [...params, 'qPeFamily', 'qPeAnswer', 'qPePause'],
  linkParams, showParam: show, draw,
  animationTimeline: o => ({ duration: 5, pauseAtEvents: !!K.v(o, 'qPePause'),
    events: [{ t: .625, label: '半程对照' }, { t: 1.25, label: '一轮示意结束' }, { t: 5, label: '记录电表读数' }] })
});

const graph = K.TB.shapes.pm_g_ekv, original = graph.draw;
const plotDef = K.TB.paramDefs.qEkG;
plotDef.options.push({ value: '2', label: 'I–U · 同频率' }, { value: '3', label: 'I–U · 比较频率' });
Object.assign(graph, { params: ['qEkG', ...params, 'qPeAnswer'], linkParams,
  showParam: (o, p) => p === 'qEkG' || (K.v(o, 'qEkG') >= 2 && show(o, p)),
  draw(c, o, GH) {
    const b = GH.box(o);
    if (b.w < 90 || b.h < 70) return;
    const plot = +K.v(o, 'qEkG');
    const fs = K.fs(K.S(b), .048, 7, 17);
    if (plot >= 2) return chart(c, { x: b.x1 + 3, y: b.y1 + 3, w: b.w - 6, h: b.h - 6, fs, color: o.color, lw: K.lw(o) }, o, plot - 1);
    if (!K.showDetails(o)) return original(c, o, GH);
    const footer = Math.min(fs * 2.2, b.h * .22);
    original(c, o, { box: () => ({ ...b, y2: b.y2 - footer, h: b.h - footer }) });
    K.drawMathBlock(c, [
      plot === 1 ? ['斜率 = ', { frac: [[symbol('h')], [symbol('e')]] }, '（V·s）']
        : ['若纵轴以 J 计，斜率 = ', symbol('h'), '；以 eV 计，先将斜率换算为 J·s'],
      ['横截距 ', symbol('f', '0'), '；', symbol('W', '0'), ' = ', symbol('hf', '0')]
    ], b.x1 + 4, b.y2 - footer, { c: o.color, s: fs, maxWidth: b.w - 8, maxHeight: footer - 1 });
  }
});
K.photoReview = { input, read, family, linkParams };
})();

/* ===== 上游 pm_g4d_resonance.js ===== */
/* P1-10: ideal horizontal spring, linear drag and prescribed harmonic drive. */
(function () {
'use strict';
const K = window.__PM, C = K.C, R = K.reviewMotion;
const { TAU } = K;
const symbol = (name, sub, sup) => ({ symbol: name, sub, sup });
const q = K.formatQuantity;
const responseDash = [6, 4];

function response(m, k, b, F, f) {
  const w = TAU * f;
  const elastic = k - m * w * w;
  if (b === 0 && Math.abs(elastic) <= 8 * Number.EPSILON * k)
    return { amplitude: F ? Infinity : 0, phase: null, velocity: F ? Infinity : 0,
      power: F ? null : 0, singular: !!F };
  const amplitude = F / Math.hypot(elastic, b * w);
  const velocity = w * amplitude;
  return { amplitude, phase: F ? Math.atan2(b * w, elastic) : null, velocity,
    power: .5 * b * velocity ** 2, singular: false };
}

function oscillator({ mode = 3, m, k, b = 0, F = 0, f = 0, x0 = 0, v0 = 0, duration = 12,
  tune = false, maxStep = Infinity }) {
  if (![m, k, b, F, f, x0, v0, duration].every(Number.isFinite) ||
      m <= 0 || k <= 0 || b < 0 || F < 0 || f < 0 || duration <= 0 || !(maxStep > 0))
    throw new RangeError('振动参数超出物理范围');
  if (mode === 1) b = 0;
  if (mode < 3) F = 0;
  const omega0 = Math.sqrt(k / m), f0 = omega0 / TAU, decay = b / (2 * m);
  const discriminant = omega0 ** 2 - decay ** 2;
  const critical = Math.abs(discriminant) <= 8 * Number.EPSILON * omega0 ** 2;
  const omegaD = !critical && discriminant > 0 ? Math.sqrt(discriminant) : null;
  const damping = critical ? 'critical' : omegaD === null ? 'overdamped' : b ? 'underdamped' : 'undamped';
  if (tune && mode === 3) f = f0;
  const sweep = mode === 4, start = sweep ? .35 * f0 : f, end = sweep ? 1.65 * f0 : f;
  const rate = (end - start) / duration;
  const frequency = t => start + rate * t;
  const force = t => F * Math.cos(TAU * t * (start + .5 * rate * t));
  const theory = frequency => response(m, k, b, F, frequency);
  const shapePeak = Math.sqrt(Math.max(0, omega0 ** 2 - 2 * decay ** 2)) / TAU;
  const peak = { displacement: F ? shapePeak : null, velocity: F && b ? f0 : null,
    power: F && b ? f0 : null, halfPowerWidth: F && b ? b / (TAU * m) : null };
  const energy = (x, v) => .5 * (k * x * x + m * v * v);
  const initialEnergy = energy(x0, v0);
  const springRate = k / m, dragRate = b / m;
  const count = Math.ceil(duration / Math.min(maxStep, TAU / (192 * Math.max(omega0, TAU * end)), .1 * m / b));
  const step = duration / count;

  // Fixed mesh independent of playback, with separate RK4 quadratures of b·v² and F·v.
  function advance([x, v, heat, work], t, h) {
    const f1 = force(t), f2 = force(t + h / 2), f4 = force(t + h);
    const a1 = f1 / m - springRate * x - dragRate * v;
    const v2 = v + h / 2 * a1;
    const a2 = f2 / m - springRate * (x + h * v / 2) - dragRate * v2;
    const v3 = v + h / 2 * a2;
    const a3 = f2 / m - springRate * (x + h * v2 / 2) - dragRate * v3;
    const v4 = v + h * a3;
    const a4 = f4 / m - springRate * (x + h * v3) - dragRate * v4;
    return [
      x + h / 6 * (v + 2 * v2 + 2 * v3 + v4),
      v + h / 6 * (a1 + 2 * (a2 + a3) + a4),
      heat + h * b / 6 * (v * v + 2 * (v2 * v2 + v3 * v3) + v4 * v4),
      work + h / 6 * (f1 * v + 2 * f2 * (v2 + v3) + f4 * v4)
    ];
  }

  let states, maxX;
  const measurements = [];
  function integrate() {
    if (states) return;
    states = [[x0, v0, 0, 0]];
    maxX = Math.abs(x0);
    let previous = null;
    for (let i = 1; i <= count; i++) {
      const t = (i - 1) * step, left = states[i - 1], right = advance(left, t, step);
      states.push(right);
      maxX = Math.max(maxX, Math.abs(right[0]));
      if (!sweep || !F || left[1] === 0 || left[1] * right[1] > 0) continue;
      const h = step * left[1] / (left[1] - right[1]);
      const reversal = { time: t + h, x: advance(left, t, h)[0], direction: Math.sign(left[1]) };
      if (previous && previous.direction !== reversal.direction) {
        const time = (previous.time + reversal.time) / 2;
        measurements.push({ time, availableAt: reversal.time, frequency: frequency(time),
          amplitude: Math.abs(previous.x - reversal.x) / 2 });
      }
      previous = reversal;
    }
  }

  function at(time) {
    integrate();
    const t = K.clamp(Number.isFinite(time) ? time : 0, 0, duration);
    const i = Math.min(count, Math.floor(t / step));
    const h = t - i * step, [x, v, heat, work] = h > 0 ? advance(states[i], i * step, h) : states[i];
    const kinetic = .5 * m * v * v, elastic = .5 * k * x * x;
    const drive = force(t), mechanical = kinetic + elastic;
    const f = frequency(t), steady = mode === 3 && b > 0 && F > 0 ? theory(f) : null;
    const steadyX = steady ? steady.amplitude * Math.cos(TAU * f * t - steady.phase) : null;
    return { t, x, v, f, force: drive, drag: -b * v, kinetic, elastic, mechanical, heat, work,
      drivePower: drive * v, dissipationPower: b * v * v, steadyX, residual: mechanical - initialEnergy - work + heat };
  }

  return { params: { mode, m, k, b, F, f, x0, v0 }, duration, omega0, f0, omegaD, damping,
    decay, peak, sweep, start, end, step, theory, frequency, force, at,
    get measurements() { integrate(); return measurements; },
    get maxX() { integrate(); return maxX; } };
}

K.sel('qFrMode', '振动实验', ['经典共振曲线', '无阻尼自由振动', '有阻尼自由振动', '受迫振动', '自动扫频'], 0);
const physical = R.parameters('qFr', [
  ['m', '质量 m', 'kg', .25, 5, .05, 1],
  ['k', '劲度系数 k', 'N/m', 2, 100, .25, 16],
  ['b', '阻尼系数 b', 'N·s/m', 0, 20, .05, 1.8],
  ['F', '驱动力幅值 F₀', 'N', 0, 20, .1, 3],
  ['f', '驱动力频率 f', 'Hz', 0, 10, .01, .65],
  ['x', '初始位移 x₀', 'm', -2, 2, .01, .24],
  ['v', '初始速度 v₀', 'm/s', -4, 4, .05, 0],
  ['Sweep', '扫频时长', 's', 4, 60, .25, 12]
]);
K.sel('qFrPlot', '频率响应纵轴', ['位移振幅', '相位滞后', '周期平均功率'], 0);
K.tog('qFrCompare', '对照较小和较大的阻尼', false);
K.tog('qFrTune', '驱动频率锁定固有频率', false);
K.tog('qFrPause', '在关键时刻自动暂停', false);
const modeFor = o => [1, 2, 3, 4].includes(K.v(o, 'qFrMode')) ? K.v(o, 'qFrMode') : 0;
const cache = new WeakMap();
function read(o) {
  const signature = [modeFor(o), ...physical.map(p => R.number(o, p)), !!K.v(o, 'qFrTune')];
  const key = signature.join(',');
  let cached = cache.get(o);
  if (cached?.key !== key) {
    const [mode, m, k, b, F, f, x0, v0, duration, tune] = signature;
    cached = { key, model: oscillator({ mode, m, k, b, F, f, x0, v0, tune, duration: mode === 4 ? duration : 12 }) };
    cache.set(o, cached);
  }
  return cached.model;
}

function text(c, b, tokens, x, y, options = {}) {
  const { color = b.color, align = 'left', width = b.w } = options;
  K.drawMathLabel(c, tokens, x, y, { c: color, al: align, s: b.fs,
    maxWidth: Math.max(1, width), maxHeight: b.fs * 1.1, essential: true });
}

function drawingBox(b, x, y, w, h) {
  return { ...b, x: b.x + x * b.w, y: b.y + y * b.h, w: w * b.w, h: h * b.h };
}

function assembly(c, b, model, s) {
  const X = u => b.x + b.w * u, Y = v => b.y + b.h * v;
  const fs = Math.min(b.fs, b.h * .14), col = b.color, lw = b.lw;
  const width = Math.min(b.w * .15, b.h * .45), height = b.h * .24, equilibrium = X(.54);
  const displacementScale = Math.max(.01, model.maxX);
  const center = equilibrium + b.w * .20 * s.x / displacementScale;
  const left = center - width / 2, top = Y(.64) - height;
  K.hatch(c, X(.08), Y(.2), X(.08), Y(.64), col, lw, Math.max(5, fs * .75));
  K.hatch(c, X(.08), Y(.64), X(.95), Y(.64), col, lw, Math.max(5, fs * .75));
  K.line(c, equilibrium, Y(.15), equilibrium, Y(.38), col, lw * .65, [3, 4]);
  K.line(c, equilibrium, Y(.70), equilibrium, Y(.81), col, lw * .65, [3, 4]);
  const springY = model.params.b ? top + height * .28 : top + height * .5;
  K.spring(c, X(.08), springY, left, springY, 8, Math.min(height * .17, b.w * .027), col, lw);
  if (model.params.b) {
    const y = top + height * .76, r = height * .12, cylinder = X(.16), piston = X(.21) + (center - equilibrium) * .16;
    K.line(c, X(.08), y, cylinder, y, col, lw);
    K.poly(c, [[X(.27), y - r], [cylinder, y - r], [cylinder, y + r], [X(.27), y + r]], col, lw);
    K.line(c, piston, y - r, piston, y + r, col, lw);
    K.line(c, piston, y, left, y, col, lw);
  }
  K.box(c, left, top, width, height, col, lw, K.alpha(col, .17));
  text(c, { ...b, fs: Math.min(fs, height * .32) }, [symbol('m')], center, top + height * .62,
    { align: 'center', width: width * .8 });
  if (model.params.F) {
    const length = b.w * .21 * (s.force / model.params.F);
    const y = top + height * .39, tip = center + length;
    if (Math.abs(length) >= 1) K.arrow(c, center, y, tip, y, C.F, lw);
    K.dot(c, center, y, Math.max(1, lw * .75), C.F);
    text(c, { ...b, fs }, [symbol('F'), '(', symbol('t'), ')'], (center + tip) / 2, top - fs * 1.2,
      { color: C.F, align: 'center', width: b.w * .24 });
    text(c, { ...b, fs: fs * .76 }, ['力箭长 ∝ |', symbol('F'), '|'], X(.95), Y(.06),
      { color: C.F, align: 'right', width: b.w * .29 });
  }
  K.arrow(c, X(.22), Y(.82), X(.95), Y(.82), col, lw * .7, Math.min(7, fs * .65));
  for (const i of [-1, 0, 1]) {
    const x = equilibrium + b.w * .20 * i;
    K.line(c, x, Y(.79), x, Y(.85), col, lw * .7);
    text(c, { ...b, fs }, tick(i * displacementScale), x, Y(.86), { align: 'center', width: b.w * .19 });
  }
  text(c, { ...b, fs }, [symbol('x'), ' / m'], X(.95), Y(.86), { align: 'right' });
}

const tick = v => String(Number(v.toPrecision(3))).replace(/^-/, '−');
function axes(c, b, { xmax, ymin, ymax, split = [], yTitle, xTitle, title, color = b.color }) {
  const fs = Math.min(b.fs, b.h * .135, b.w * .071);
  b = { ...b, fs };
  const A = K.axes(c, b.x, b.y + fs * 1.1, b.w, b.h - fs * 1.1, {
    xmin: 0, xmax, ymin, ymax, O: false, col: b.color, lw: b.lw * .66, fs,
    xl: [], yl: yTitle, pad: { l: fs * 2.8, r: fs * .9, t: fs * 1.45, b: fs * 1.45 }
  });
  text(c, b, title, A.X0, b.y, { width: b.w * .79 - (A.X0 - b.x), color });
  text(c, b, xTitle, b.x + b.w, b.y, { width: b.w * .18, align: 'right' });
  for (const v of [0, ...split, xmax]) {
    const x = A.X(v);
    if (v > 0 && v < xmax && (x - A.X0 < fs * 2.4 || A.X1 - x < fs * 2.4)) continue;
    K.line(c, x, A.oy - 2, x, A.oy + 2, b.color, b.lw * .55);
    if (ymin < 0 && x > A.X0) K.line(c, x, A.oy + 2, x, A.Y1, K.alpha(b.color, .23), b.lw * .55, [1, 3]);
    text(c, b, tick(v), x, A.Y1 + 3, { align: 'center', width: fs * 2 });
  }
  for (const v of ymin < 0 ? [ymin, 0, ymax] : [ymax]) {
    const y = A.Y(v);
    K.line(c, A.X0 - 2, y, A.X0 + 2, y, b.color, b.lw * .55);
    text(c, b, tick(v), A.X0 - 3, y - fs * .54, { align: 'right', width: fs * 2.4 });
  }
  return A;
}

function wave(c, b, model, s, drive) {
  const { duration, f0, end } = model;
  const amp = Math.max(.02, drive ? model.params.F : model.maxX) * 1.12;
  const color = drive ? C.F : C.B;
  const A = axes(c, b, { xmax: duration, ymin: -amp, ymax: amp, split: [duration / 2],
    xTitle: [symbol('t'), ' / s'], yTitle: [symbol(drive ? 'F' : 'x'), drive ? ' / N' : ' / m'],
    title: drive ? '驱动力 · 虚线预演' : '位移 · 虚线预演', color });
  const value = drive ? model.force : t => model.at(t).x;
  const samples = Math.max(128, Math.ceil(32 * duration * Math.max(f0, end)));
  const t = s.t, current = value(t);
  K.plot(c, A, value, 0, duration, K.alpha(color, .48), b.lw * .75, responseDash, samples);
  if (t > 0) K.plot(c, A, value, 0, t, color, b.lw, null, Math.max(2, Math.ceil(samples * t / duration)));
  K.line(c, A.X(t), A.Y0, A.X(t), A.Y1, K.alpha(b.color, .54), b.lw * .62, [1.2, 3]);
  K.dot(c, A.X(t), A.Y(current), Math.max(1.5, b.lw * 1.15), color);
}

function frequencyGraph(c, b, model, s, plot, compare) {
  const { m, k, b: damping, F } = model.params;
  const legacy = model.params.mode === 0, normalized = legacy, fscale = normalized ? model.f0 : 1;
  const xmax = legacy ? 2.2 : Math.max(2.05 * model.f0, s.f);
  const spec = [
    { units: [symbol('A'), ' / m'], key: 'amplitude', name: '位移幅值', peak: model.peak.displacement },
    { units: [symbol('δ'), ' / °'], key: 'phase', name: '相位滞后', peak: null },
    { units: [symbol('P'), ' / W'], key: 'power', name: '一周期平均功率', peak: model.peak.power }
  ][plot];
  const dampings = legacy ? [.11, .28, .70].map(r => r * Math.sqrt(k * m))
    : compare ? [damping || 0, damping ? damping / 2 : .15 * Math.sqrt(k * m),
      damping ? damping * 2 : .55 * Math.sqrt(k * m)] : [damping];
  const colors = legacy ? [C.F, C.a, C.B] : [C.a, C.v, C.E];
  const scans = dampings.map((drag, i) => ({
    drag, color: colors[i],
    peak: Math.sqrt(Math.max(0, model.omega0 ** 2 - drag ** 2 / (2 * m * m))) / TAU,
    response: hz => response(m, k, drag, legacy ? k : F, hz),
    value(hz) {
      const v = this.response(hz)[spec.key];
      return v === null ? NaN : plot === 1 ? v * 360 / TAU : v;
    }
  }));
  const measured = model.sweep && plot === 0 ? model.measurements : [];
  const singular = !legacy && F > 0 && damping === 0;
  const ymax = plot === 1 ? 180 : Math.max(.01, ...scans.map(line => {
    const peak = plot === 2 ? model.f0 : line.peak;
    const v = line.value(peak);
    return Number.isFinite(v) ? v : plot === 0 ? line.value(.9 * model.f0) : 0;
  }), ...measured.map(v => v.amplitude)) * 1.12;
  const fs = Math.min(b.fs, b.h * .12, b.w * .064);
  const measurementLegend = model.sweep && plot === 0;
  const legendRows = Number(compare || legacy) + Number(measurementLegend || singular);
  const legendH = fs * (legendRows * 1.25 + .2);
  const chart = { ...b, h: b.h - legendH };
  const A = axes(c, chart, { xmax: xmax / fscale, ymin: 0, ymax, split: [model.f0 / fscale],
    xTitle: legacy ? [symbol('f'), ' / ', symbol('f', '0')] : [symbol('f'), ' / Hz'],
    yTitle: legacy ? [symbol('A'), ' / (', symbol('F', '0'), '/', symbol('k'), ')'] : spec.units,
    title: (singular ? '定频理论 · ' : '稳态理论 · ') + spec.name, color: colors[0] });
  const X = hz => A.X(hz / fscale);
  if (legacy) text(c, { ...b, fs }, '阻尼', b.x + b.w * .10, b.y + b.h - fs, { width: b.w * .15 });
  if (compare || legacy) {
    const names = legacy ? ['小', '中', '大'] : ['当前阻尼', damping ? '较小阻尼' : '低阻尼', '较大阻尼'];
    names.forEach((name, i) => text(c, { ...b, fs }, name, b.x + b.w * (.37 + i * .235), b.y + b.h - fs * (legendRows > 1 ? 2.25 : 1),
      { color: colors[i], align: 'center', width: b.w * .215 }));
  }
  if (measurementLegend) {
    text(c, { ...b, fs }, '实点 · 扫频半峰峰值', b.x + fs, b.y + b.h - fs, { color: C.B, width: b.w * .53 });
  }
  if (singular) text(c, { ...b, fs }, [symbol('f', '0'), ' 处无稳态'], b.x + b.w, b.y + b.h - fs,
    { width: b.w * (measurementLegend ? .43 : .7), align: 'right' });

  const hy = hz => hz / fscale, r = model.f0;
  for (const [index, line] of scans.entries()) {
    const localScale = Math.max(r * 1e-5, line.drag / (TAU * m));
    const cuts = [0, line.peak, r - localScale, r, r + localScale, xmax]
      .filter(v => v >= 0 && v <= xmax).sort((a, z) => a - z);
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] === cuts[i - 1]) continue;
      K.plot(c, A, x => line.value(x * fscale), hy(cuts[i - 1]), hy(cuts[i]), line.color, b.lw,
        [responseDash, [2, 3], [8, 3, 2, 3]][index], 56);
    }
    const peak = plot === 0 ? line.peak : spec.peak;
    if (F > 0 || legacy) {
      const height = peak === null ? NaN : line.value(peak);
      if (Number.isFinite(height))
        K.circ(c, X(peak), A.Y(height), Math.max(1.5, b.lw * 1.35), line.color, b.lw);
    }
  }
  if (singular) K.line(c, X(r), A.Y0, X(r), A.Y1, b.color, b.lw * .65, [2, 3]);
  if (!legacy) {
    K.line(c, X(s.f), A.Y0, X(s.f), A.Y1, K.alpha(b.color, .76), b.lw * .65, [1.2, 3]);
    const current = scans[0].value(s.f);
    if (Number.isFinite(current) && current <= ymax)
      K.circ(c, X(s.f), A.Y(current), Math.max(1.5, b.lw), scans[0].color, b.lw);
    for (const point of measured) {
      if (point.availableAt > s.t) break;
      K.dot(c, X(point.frequency), A.Y(point.amplitude), Math.max(1.5, b.lw), C.B);
    }
  }
}

function quantities(model, s) {
  const freq = value => q(value, 'Hz', 3);
  const angular = value => q(value, 'rad/s', 3);
  const { mode, F, b } = model.params;
  const rhs = mode >= 3
    ? [symbol('F', '0'), ' cos ', ...(model.sweep ? [symbol('φ'), '(', symbol('t'), ')'] : [symbol('ωt')])] : ['0'];
  const eq = [symbol('m'), symbol('x', undefined, '″'), ' + ', symbol('b'), symbol('x', undefined, '′'), ' + ',
    symbol('kx'), ' = ', ...rhs];
  const frequencies = [symbol('ω', '0'), ' = √(', symbol('k'), '/', symbol('m'), ') = ' + angular(model.omega0),
    '　', symbol('f', '0'), ' = ' + freq(model.f0)];
  const free = model.omegaD !== null
    ? [symbol('ω', 'd'), ' = ' + angular(model.omegaD), b ? '（欠阻尼）' : '（无阻尼）']
    : model.damping === 'critical' ? ['临界阻尼 · 自由响应无周期'] : ['过阻尼 · 自由响应无周期'];
  const energy = [
    [symbol('E', 'k'), ' = ' + q(s.kinetic, 'J', 3), '　', symbol('E', 'p'), ' = ' + q(s.elastic, 'J', 3),
      '　', symbol('E', '机械'), ' = ' + q(s.mechanical, 'J', 3)],
    [symbol('Q', '耗散'), ' = ' + q(s.heat, 'J', 3), '　', symbol('W', '驱'), ' = ' + q(s.work, 'J', 3)],
    ['Δ', symbol('E', '机械'), ' = ', symbol('W', '驱'), ' − ', symbol('Q', '耗散'),
      '　', symbol('P', '驱'), ' = ' + q(s.drivePower, 'W', 3), '　', symbol('P', '耗散'), ' = ' + q(s.dissipationPower, 'W', 3)]
  ];
  const current = [symbol('t'), ' = ' + q(s.t, 's', 2), '　', symbol('x'), ' = ' + q(s.x, 'm', 3),
    '　', symbol('v'), ' = ' + q(s.v, 'm/s', 3)];
  if (mode <= 2) return [[eq, frequencies, free], [current, ...energy]];
  const p = model.theory(s.f);
  const drive = [symbol('f'), ' = ' + freq(s.f), '　', symbol('ω'), ' = ' + angular(TAU * s.f)];
  const fixed = p.singular ? [model.sweep ? '该频率无有限定频稳态 · 扫频位移仍是瞬态' : '无阻尼定频共振 · 振幅随时间增长']
    : F === 0 ? ['驱动力幅值为零 · 位移取决于自由响应']
    : [model.sweep ? '该频率的定频理论　' : '定频理论　', symbol('A'), ' = ' + q(p.amplitude, 'm', 3),
      ...(s.f ? ['　', symbol('δ'), ' = ' + q(p.phase * 360 / TAU, '°', 1)] : ['　恒力响应']),
      ...(b && s.f ? ['　', symbol('P', '周期平均'), ' = ' + q(p.power, 'W', 3)] : [])];
  const peaks = F === 0 ? free : [symbol('f', '位移峰'), ' = ' + freq(model.peak.displacement),
    ...(b ? ['　', symbol('f', '速度峰'), ' = ', symbol('f', '功率峰'), ' = ', symbol('f', '0')] : [])];
  const detail = model.sweep ? ['扫频点取相邻极值的半峰峰值 · 横坐标为两极值之间的中点频率']
    : s.steadyX !== null ? [symbol('x', '稳态'), ' = ' + q(s.steadyX, 'm', 3),
      '　', symbol('x', '瞬态'), ' = ' + q(s.x - s.steadyX, 'm', 3)] : free;
  return [[eq, frequencies, free, drive, fixed, peaks], [current, ...energy, detail]];
}

function noteBlocks(c, b, groups) {
  const split = b.w >= 520;
  const all = groups.flat();
  const fs = Math.min(b.fs, b.h / ((split ? Math.max(...groups.map(g => g.length)) : all.length) * 1.4));
  if (split) {
    R.notes(c, { ...drawingBox(b, 0, 0, .495, 1), fs }, groups[0]);
    R.notes(c, { ...drawingBox(b, .515, 0, .485, 1), fs }, groups[1]);
  } else {
    R.notes(c, { ...b, fs }, all);
  }
}

function draw(c, o, GH) {
  const box = GH.box(o), mode = modeFor(o);
  if (box.w < 60 || box.h < 50) return;
  const model = read(o), detail = K.showDetails(o);
  const fs = K.fs(K.S(box), .052, 8, 20);
  const base = { x: box.x1 + 3, y: box.y1 + 3, w: box.w - 6, h: box.h - 6, fs,
    color: o.color || '#e6edf7', lw: K.lw(o, .48) };
  const plot = [0, 1, 2].includes(K.v(o, 'qFrPlot')) ? K.v(o, 'qFrPlot') : 0;
  if (!mode) {
    const chart = detail ? drawingBox(base, 0, 0, 1, .83) : base;
    frequencyGraph(c, chart, model, { f: 0 }, 0, false);
    if (detail) R.notes(c, drawingBox(base, .05, .85, .9, .15), [
      [symbol('f', '位移峰'), ' < ', symbol('f', '0'), '（接近无阻尼时两者趋近）'],
      [symbol('A'), ' = ', { frac: [[symbol('F', '0')], ['√[(', symbol('k'), ' − ', symbol('m'), symbol('ω', undefined, 2),
        ')² + (', symbol('bω'), ')²]']] }]
    ]);
    return;
  }
  const s = model.at(K.t(o)), driven = mode >= 3;
  const noteFraction = detail ? Math.min(base.w >= 520 ? .32 : driven ? .43 : .34, fs * (base.w >= 520 ? 9 : 12) / base.h) : 0;
  const frame = drawingBox(base, 0, 0, 1, 1 - noteFraction);
  const wide = frame.w >= 1.36 * frame.h || (frame.w >= 350 && detail);
  if (wide) {
    assembly(c, drawingBox(frame, 0, 0, .42, driven ? .51 : 1), model, s);
    wave(c, drawingBox(frame, .435, 0, .565, driven ? .48 : 1), model, s, false);
    if (driven) {
      wave(c, drawingBox(frame, .435, .52, .565, .48), model, s, true);
      frequencyGraph(c, drawingBox(frame, 0, .52, .42, .48), model, s, plot, !!K.v(o, 'qFrCompare'));
    }
  } else {
    assembly(c, drawingBox(frame, 0, 0, 1, driven ? .26 : .48), model, s);
    wave(c, drawingBox(frame, 0, driven ? .27 : .49, 1, driven ? .21 : .51), model, s, false);
    if (driven) {
      wave(c, drawingBox(frame, 0, .49, 1, .21), model, s, true);
      frequencyGraph(c, drawingBox(frame, 0, .71, 1, .29), model, s, plot, !!K.v(o, 'qFrCompare'));
    }
  }
  if (detail) noteBlocks(c, drawingBox(base, .02, 1 - noteFraction + .01, .96, noteFraction - .015), quantities(model, s));
}

function animationTimeline(o) {
  if (!modeFor(o)) return null;
  const model = read(o), { mode, b, F, f } = model.params;
  const { duration, f0, decay, peak, omegaD, start, end } = model;
  const events = [];
  if (model.sweep) {
    const addCrossing = (frequency, label) => {
      if (frequency > start && frequency < end)
        events.push({ t: duration * (frequency - start) / (end - start), label });
    };
    if (peak.displacement !== f0) addCrossing(peak.displacement, '通过理论位移峰频率');
    addCrossing(f0, '通过固有频率');
  } else {
    const period = F > 0 && f > 0 ? 1 / f : omegaD ? TAU / omegaD : 0;
    if (period > 0 && period < duration) events.push({ t: period, label: F > 0 && f ? '一驱动周期' : '一自由周期' });
    if (b > 0 && omegaD && 3 / decay < duration)
      events.push({ t: 3 / decay, label: '自由响应包络约为初值的 5%' });
  }
  events.push({ t: duration, label: model.sweep ? '扫频结束' : '记录结束' });
  events.sort((a, z) => a.t - z.t);
  return { duration, events, pauseAtEvents: !!K.v(o, 'qFrPause'),
    timeLabel: t => '时间 ' + q(t, 's', 2) + (model.sweep ? ' · 扫频 ' + q(model.frequency(t), 'Hz', 3) : '') };
}

Object.assign(K.TB.shapes.pm_g_resonance, {
  params: ['qFrMode', ...physical, 'qFrTune', 'qFrPlot', 'qFrCompare', 'qFrPause'],
  animatable: true,
  canAnimate: o => modeFor(o) > 0,
  showParam(o, p) {
    const mode = modeFor(o);
    if (p === 'qFrMode') return true;
    if (!mode) return false;
    if (p === 'qFrb') return mode > 1;
    if (p === 'qFrf') return mode === 3 && !K.v(o, 'qFrTune');
    if (p === 'qFrTune') return mode === 3;
    if (p === 'qFrSweep') return mode === 4;
    if (['qFrF', 'qFrPlot', 'qFrCompare'].includes(p)) return mode >= 3;
    return true;
  },
  draw, animationTimeline
});

K.physics.forcedResonance = { oscillator, response };
K.forcedResonance = { read };
})();

/* ===== 上游 pm_g5_orbit.js ===== */
/* Satellite geometry and observations share one solution of Kepler's equation. */
(function () {
'use strict';
const K = window.__PM;
const { PI, TAU, C } = K;
const D = K.reviewMotion;
const key = 'pm_hohmann';
const params = D.parameters('qOrb', [
  ['Mu', '标准引力参数 μ', '×10¹⁴ m³·s⁻²', .01, 100, 'any', 3.986004418],
  ['R', '中心天体半径 R', 'km', 100, 30000, 1, 6371],
  ['R1', '初始圆轨道半径／端点 P', 'km', 500, 100000, 1, 7000],
  ['R2', '目标圆轨道半径／端点 Q', 'km', 500, 100000, 1, 17500],
  ['Mass', '卫星质量', 'kg', 1, 20000, 1, 1000]
]);
K.P('qRho', { label: '外轨/内轨半径比', min: 1.5, max: 4, step: .1, def: 2.5 });
K.sel('qOrbMode', '运行情景', ['霍曼转移', '两条圆轨道比较', '完整椭圆']);
K.sel('qOrbPlot', '同步图像', ['机械能—时刻', '速率—地心距离', '周期—半长轴']);
K.tog('qOrbAnswer', '隐藏变轨答案和图像读数');
K.tog('qOrbPause', '在脉冲或拱点暂停');

function legacyTarget(o) {
  return K.clamp(D.number(o, 'qOrbR1') * D.number(o, 'qRho'), 500, 100000);
}
K.TB.paramDefs.qOrbR2.defaultFor = legacyTarget;
const period = (mu, a) => TAU * Math.sqrt(a ** 3 / mu);
const speed = (mu, r, a) => Math.sqrt(mu * (2 / r - 1 / a));

function read(o) {
  const mu = D.number(o, 'qOrbMu') * 1e14;
  const R = D.number(o, 'qOrbR') * 1000;
  const r1 = Math.max(R + 1000, D.number(o, 'qOrbR1') * 1000);
  const requestedR2 = o.qOrbR2 == null ? legacyTarget(o) : D.number(o, 'qOrbR2');
  const r2 = Math.max(R + 1000, requestedR2 * 1000);
  const mass = D.number(o, 'qOrbMass');
  const mode = [1, 2].includes(+o.qOrbMode) ? +o.qOrbMode : 0;
  const a = (r1 + r2) / 2;
  // Signed eccentricity starts both raise and lower transfers on the right.
  const signedE = (r2 - r1) / (r1 + r2);
  const e = Math.abs(signedE);
  const b = Math.sqrt(r1 * r2);
  const period1 = period(mu, r1), period2 = period(mu, r2), periodTransfer = period(mu, a);
  const secondsPerFrameUnit = period1 / 3;
  const t1 = 3, t2 = t1 + periodTransfer / (2 * secondsPerFrameUnit);
  const duration = mode === 0 ? t2 + period2 / secondsPerFrameUnit :
    (mode === 1 ? Math.max(period1, period2) : periodTransfer) / secondsPerFrameUnit;
  const dv1 = speed(mu, r1, a) - speed(mu, r1, r1);
  const dv2 = speed(mu, r2, r2) - speed(mu, r2, a);

  function position(axis, eccentricity, M, stage, seconds) {
    let E = M;
    if (eccentricity && M !== 0 && M !== PI && M !== TAU) {
      // Monotone bracket avoids Newton overshoots on very eccentric orbits.
      let low = 0, high = TAU;
      for (let i = 0; i < 48; i++) {
        E = (low + high) / 2;
        if (E - eccentricity * Math.sin(E) < M) low = E;
        else high = E;
      }
    }
    const sin = M === 0 || M === PI || M === TAU ? 0 : Math.sin(E);
    const cos = Math.cos(E);
    const minor = axis * Math.sqrt(1 - eccentricity ** 2);
    const radial = 1 - eccentricity * cos;
    const omega = Math.sqrt(mu / axis ** 3) / radial;
    const x = axis * (cos - eccentricity), y = minor * sin;
    const vx = -axis * sin * omega, vy = minor * cos * omega;
    const r = axis * radial, v = Math.hypot(vx, vy);
    const epsilon = -mu / (2 * axis);
    return { x, y, vx, vy, r, v, epsilon, h: x * vy - y * vx, energy: mass * epsilon, axis, stage, seconds };
  }

  function at(time, side = 'after') {
    const t = K.clamp(Number.isFinite(time) ? time : 0, 0, duration);
    const seconds = t * secondsPerFrameUnit;
    if (mode === 2) return position(a, signedE, TAU * seconds / periodTransfer, 1, seconds);
    if (mode === 1) return position(r1, 0, TAU * seconds / period1, 0, seconds);
    if (t < t1 || (t === t1 && side === 'before')) return position(r1, 0, TAU * t / t1, 0, seconds);
    if (t < t2 || (t === t2 && side === 'before')) {
      return position(a, signedE, PI * (t - t1) / (t2 - t1), 1, seconds);
    }
    return position(r2, 0, PI + TAU * (t - t2) * secondsPerFrameUnit / period2, 2, seconds);
  }

  return { mu, R, r1, r2, mass, a, e, b, signedE, period1, period2, periodTransfer, dv1, dv2, t1, t2,
    duration, mode, secondsPerFrameUnit, at,
    secondCircle(t) { return position(r2, 0, TAU * t * secondsPerFrameUnit / period2, 2, t * secondsPerFrameUnit); }
  };
}

const cached = D.memo(read, [...params, 'qOrbMode']);
const model = o => o.qOrbR2 == null ? cached({ ...o, qOrbR2: legacyTarget(o) }) : cached(o);
const symbol = D.symbol;
const sq = (value, unit) => K.scientificQuantity(value, unit, 3);
const quantity = (value, unit, digits = 2) => K.formatQuantity(value, unit, digits);
function timeline(o) {
  const m = model(o);
  const burns = m.r1 !== m.r2;
  const events = m.mode === 0 && burns ? [{ t: m.t1, label: 'P · 第一次脉冲' }, { t: m.t2, label: 'Q · 第二次脉冲' }] :
    m.mode === 2 && burns ? [{ t: m.duration / 2, label: m.r2 > m.r1 ? '远地点' : '近地点' }] : [];
  return { duration: m.duration, events, pauseAtEvents: o.qOrbPause === true,
    timeLabel: t => '轨道时刻 ' + quantity(t * m.secondsPerFrameUnit / 60, 'min') };
}

function scene(c, box, m, p, t, answers) {
  const { x, y, w, h, fs, lw, color } = box;
  const cx = x + w / 2, cy = y + h / 2;
  const scale = Math.min(w, h) * .34 / Math.max(m.r1, m.r2);
  const X = value => cx + value * scale, Y = value => cy - value * scale;
  const arc = (axis, minor, offset, start, end, ink, dash) => {
    c.save();
    c.strokeStyle = ink; c.lineWidth = dash ? 1 : lw;
    c.setLineDash(dash || []);
    c.beginPath();
    c.ellipse(X(offset), cy, axis * scale, minor * scale, 0, -start, -end, true);
    c.stroke(); c.restore();
  };
  const orbit = (axis, minor, offset, start, end, ink) => {
    arc(axis, minor, offset, 0, TAU, K.alpha(ink, .55), [5, 4]);
    if (end > start) arc(axis, minor, offset, start, end, ink);
  };
  const mAnomaly = Math.atan2(p.y / m.b, (p.x + m.a * m.signedE) / m.a);
  const phase = mAnomaly < 0 ? mAnomaly + TAU : mAnomaly;
  if (m.mode === 2) orbit(m.a, m.b, -m.a * m.signedE, 0, t === m.duration ? TAU : phase, color);
  if (m.mode === 0 && m.r1 === m.r2) {
    orbit(m.r1, m.r1, 0, 0, TAU * Math.min(t / m.t1, 1), color);
  } else if (m.mode === 0) {
    orbit(m.r1, m.r1, 0, 0, TAU * Math.min(t / m.t1, 1), color);
    orbit(m.r2, m.r2, 0, PI, PI + TAU * Math.max(0, t - m.t2) * m.secondsPerFrameUnit / m.period2, C.B);
    orbit(m.a, m.b, -m.a * m.signedE, 0, p.stage === 2 ? PI : p.stage === 1 ? phase : 0, C.I);
  }
  const vmax = speed(m.mu, Math.min(m.r1, m.r2), m.a);
  const arrow = Math.min(w, h) * .12 / vmax;
  if (m.mode === 1) {
    orbit(m.r1, m.r1, 0, 0, Math.min(TAU, TAU * p.seconds / m.period1), color);
    const q = m.secondCircle(t);
    if (m.r1 !== m.r2) {
      orbit(m.r2, m.r2, 0, 0, Math.min(TAU, TAU * p.seconds / m.period2), C.B);
      K.dot(c, X(q.x), Y(q.y), fs * .23, C.B);
      K.vec(c, X(q.x), Y(q.y), q.vx * arrow, -q.vy * arrow, C.v, lw, 'v_2', fs * .75);
    }
  }
  K.circ(c, cx, cy, m.R * scale, C.gas, 1, K.alpha(C.gas, .24));
  K.line(c, cx, cy, X(p.x), Y(p.y), K.alpha(color, .65), 1, [2, 3]);
  K.dot(c, X(p.x), Y(p.y), Math.min(fs * .24, h * .07), color);
  K.vec(c, X(p.x), Y(p.y), p.vx * arrow, -p.vy * arrow, C.v, lw, m.mode === 1 ? 'v_1' : 'v', fs * .75);
  if (m.mode !== 1 && m.r1 !== m.r2) {
    const delta = m.mode === 0 ? (t === m.t1 ? m.dv1 : t === m.t2 ? m.dv2 : 0) : 0;
    if (answers && delta) {
      const sign = t === m.t1 ? -1 : 1;
      K.vec(c, X(p.x), Y(p.y), 0, sign * Math.sign(delta) * fs * 1.55, C.F, lw);
    }
    for (const [px, name, label] of [[m.r1, 'P', m.signedE > 0 ? '近' : '远'],
      [-m.r2, 'Q', m.signedE > 0 ? '远' : '近']]) {
      K.circ(c, X(px), cy, Math.min(3, fs * .19), color, 1);
      K.txt(c, name + ' · ' + label, X(px) + (px > 0 ? 4 : -4), cy + fs * .85,
        { c: color, s: fs * .8, al: px > 0 ? 'left' : 'right', essential: true, maxWidth: w * .15 });
    }
  }
  const legend = m.mode === 1 ? '圆轨道对比 · 速度箭长同一比例' : '实线已运行 · 虚线参考';
  D.label(c, box, [legend], x + w / 2, y, color, 'center', w);
}

function graph(m, p, chart, answers) {
  const km = 1000, minutes = 60;
  const a = Math.min(m.r1, m.r2) / km, b = Math.max(m.r1, m.r2) / km;
  const start = .82 * a, end = 1.12 * b;
  if (chart === 1 || chart === 2) {
    const value = chart === 1 ? r => speed(m.mu, r * km, r * km) / km : a => period(m.mu, a * km) / minutes;
    const current = (chart === 1 ? p.r : p.axis) / km;
    const additional = chart === 1 && m.mode !== 1 && b > a ? [{
      start: a, end: b, current, active: p.stage === 1,
      value: r => speed(m.mu, r * km, m.a) / km, ink: C.I, events: [a, b]
    }] : [];
    const series = [{ start, end, current, active: chart === 2 || p.stage !== 1, value, ink: C.B,
      events: chart === 2 ? [a, m.a / km, b] : [a, b] }, ...additional];
    if (m.mode === 1 && b > a) series[0].events.push(m.r2 / km);
    return { xmin: start, end, xLabel: chart === 1 ? 'r/km' : 'a/km', yLabel: chart === 1 ? 'v/(km·s⁻¹)' : 'T/min',
      series, aids: answers };
  }
  const toMinutes = m.secondsPerFrameUnit / minutes;
  const cuts = m.mode === 0 ? [0, m.t1, m.t2, m.duration] : [0, m.duration];
  const series = cuts.slice(1).map((end, i) => {
    const start = cuts[i], active = p.stage === (m.mode === 2 ? 1 : i);
    return { start: start * toMinutes, end: end * toMinutes, current: p.seconds / minutes,
      active, value: () => m.at(start).energy / 1e9, ink: [C.B, C.I, C.v][i],
      events: i === 0 && m.mode !== 0 ? [] : [start * toMinutes, end * toMinutes] };
  });
  if (m.mode === 1 && m.r1 !== m.r2) {
    series.push({ start: 0, end: m.duration * toMinutes, current: p.seconds / minutes,
      value: () => m.secondCircle(0).energy / 1e9, ink: C.I });
  }
  return { end: m.duration * toMinutes, xLabel: 't/min', yLabel: 'E/GJ', xLabelAtTop: true, series, aids: answers };
}

K.orbitReview = { read, period, speed };
K.reg({
  key, cat: 'mech', label: '卫星变轨', animatable: true,
  params: ['qOrbMode', ...params, 'qOrbPlot', 'qOrbAnswer', 'qOrbPause', 'qRho'],
  icon: '<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="2 2"/><ellipse cx="9.8" cy="12" rx="7.3" ry="6.2"/>',
  animationTimeline: timeline,
  showParam: (o, p) => p !== 'qRho' && (p !== 'qOrbPause' || +o.qOrbMode !== 1),
  draw(c, o, GH) {
    const boxes = D.layout(o, GH);
    if (!boxes) return;
    const m = model(o);
    const t = K.clamp(K.t(o), 0, m.duration);
    const p = m.at(t);
    const answers = K.showDetails(o) && o.qOrbAnswer !== true;
    const chart = +K.v(o, 'qOrbPlot');
    scene(c, boxes.scene, m, p, t, answers);
    D.graphs(c, boxes.plots, [graph(m, p, chart, answers)]);
    const formula = [symbol('v'), '² = ', symbol('μ'),
      '(', { frac: [['2'], [symbol('r')]] }, ' − ', { frac: [['1'], [symbol('a')]] }, ')    ',
      symbol('ε'), ' = −', { frac: [[symbol('μ')], ['2', symbol('a')]] }];
    if (!answers) {
      D.notes(c, boxes.notes, [m.mode === 0 ? ['共面圆轨道 · 两次瞬时切向脉冲 · 脉冲间仅中心引力'] :
        ['中心引力 · 卫星质量远小于中心天体质量'], ['比较不同地心距离处的速率、周期或机械能。']]);
      return;
    }
    const stats = [symbol('r'), ' = ' + quantity(p.r / 1000, 'km', 0) + '   ', symbol('h'), ' = ' +
      quantity((p.r - m.R) / 1000, 'km', 0) + '   ', symbol('v'), ' = ' + quantity(p.v / 1000, 'km·s⁻¹') + '   ',
      symbol('E'), ' = ', ...sq(p.energy, 'J')];
    const values = m.mode === 0 ? ['切向为正   Δ', symbol('v', 1), ' = ' + quantity(m.dv1, 'm·s⁻¹', 1) + '    Δ',
      symbol('v', 2), ' = ' + quantity(m.dv2, 'm·s⁻¹', 1) + '    脉冲间能量与角动量守恒'] :
      [symbol('T'), ' = 2π√(', symbol('a'), '³/', symbol('μ'), ')    ', symbol('T'), ' = ' +
        quantity(period(m.mu, p.axis) / 60, 'min', 1)];
    D.notes(c, boxes.notes, [formula, stats, values]);
  }
});
})();

/* ===== 上游 pm_g5_nuclear.js ===== */
/* Neutral atomic masses and nuclear observables for the modern-physics review. */
(function () {
'use strict';
const K = window.__PM;
const D = K.reviewMotion;
const { C, TB } = K;
const uKg = 1.66053906892e-27;
const c0 = 299792458;
const mevJ = 1.602176634e-13;
const uMeV = uKg * c0 ** 2 / mevJ;
const electronU = .000548579909044;

const atoms = Object.fromEntries([
  ['H', 1, 1, 1.007825031898],
  ['D', 2, 1, 2.014101777844],
  ['T', 3, 1, 3.016049281320],
  ['He', 4, 2, 4.002603254130],
  ['C', 12, 6, 12],
  ['C14', 14, 6, 14.003241988620],
  ['N14', 14, 7, 14.003074004251],
  ['O', 16, 8, 15.994914619257],
  ['Ne', 22, 10, 21.991385113],
  ['Na', 22, 11, 21.994437547],
  ['Fe', 56, 26, 55.934935537],
  ['Ni', 62, 28, 61.928344753],
  ['Kr', 89, 36, 88.917835449],
  ['Ba', 144, 56, 143.922954821],
  ['Pb', 208, 82, 207.976652005],
  ['Th', 234, 90, 234.043599801],
  ['U235', 235, 92, 235.043928117],
  ['U238', 238, 92, 238.050786936]
].map(([id, A, Z, mass]) => [id, { A, Z, mass, lepton: 0, atom: true, symbol: id.replace(/\d+$/, '').replace(/^[DT]$/, 'H') }]));
const neutron = { A: 1, Z: 0, mass: 1.00866491590, lepton: 0, symbol: 'n' };
const electron = { A: 0, Z: -1, mass: electronU, lepton: 1, symbol: 'e', charge: '−' };
const positron = { ...electron, Z: 1, lepton: -1, charge: '+' };
const neutrino = { A: 0, Z: 0, mass: 0, lepton: 1, symbol: 'ν', sub: 'e' };
const antineutrino = { ...neutrino, lepton: -1, symbol: 'ν̄' };
const reactions = [
  { name: 'α 衰变', left: [atoms.U238], right: [atoms.Th, atoms.He] },
  { name: 'β⁻ 衰变', left: [atoms.C14], right: [atoms.N14, electron, antineutrino] },
  { name: 'β⁺ 衰变', left: [atoms.Na], right: [{ ...atoms.Ne, excited: true }, positron, neutrino], excitation: 1.27453 },
  { name: '中子诱发裂变', left: [atoms.U235, neutron], right: [atoms.Ba, atoms.Kr, { ...neutron, count: 3 }] },
  { name: '氘氚聚变', left: [atoms.D, atoms.T], right: [atoms.He, neutron] }
];
function sum(side, value) {
  return side.reduce((total, p) => total + value(p) * (p.count ?? 1), 0);
}
function balance(left, right) {
  return Object.fromEntries(['A', 'Z', 'lepton'].map(field => [field,
    sum(left, p => p[field]) - sum(right, p => p[field])]));
}
function analyze(reaction) {
  const { left, right, excitation = 0 } = reaction;
  const balanceDelta = balance(left, right);
  // Neutral atomic mass convention: remove the unmatched electron inventory
  // from the mass difference, then include explicitly emitted e±.
  const atomZ = p => p.atom ? p.Z : 0;
  const neutralMassDifference = sum(left, p => p.mass) - sum(right, p => p.mass);
  const correction = (sum(right, atomZ) - sum(left, atomZ)) * electronU;
  const defect = neutralMassDifference + correction;
  return { balanceDelta, valid: Object.values(balanceDelta).every(d => d === 0),
    defect, kg: defect * uKg, Q: defect * uMeV - excitation,
    joules: (defect * uMeV - excitation) * mevJ, correction };
}
function binding(atom) {
  const defect = atom.Z * atoms.H.mass + (atom.A - atom.Z) * neutron.mass - atom.mass;
  return { defect, binding: defect * uMeV, perNucleon: defect * uMeV / atom.A };
}
const reference = reactions.map(analyze);

const reactionKey = 'pm_fission';
const chain = TB.shapes[reactionKey].draw;
K.sel('qNucReaction', '核反应', ['链式反应示意', ...reactions.map(r => r.name)]);
K.tog('qNucQuiz', '练习配平首个生成核素');
const quizParams = D.parameters('qNuc', [
  ['TrialA', '作答质量数 A', '', 1, 250, 1, 4],
  ['TrialZ', '作答质子数 Z', '', 0, 110, 1, 2]
]);
K.tog('qNucReveal', '显示配平答案');
K.tog('qNucStop', '在反应时刻暂停');
const mode = o => Number.isInteger(+o.qNucReaction) ? K.clamp(+o.qNucReaction, 0, 5) : 0;
const measure = (c, box, text, x, y, align, width, color) =>
  D.label(c, box, text, x, y, color ?? box.color, align, width);
function isotope(p, hide) {
  // The math renderer supports regular subscripts and superscripts. A zero-width
  // carrier puts the number pair on the left of the upright nuclide symbol.
  if (p.A) return [...(p.count ? [String(p.count), ' '] : []),
    { symbol: '', sub: hide ? '?' : p.Z, sup: hide ? '?' : p.A, upright: true },
    { symbol: hide ? '?' : p.symbol, upright: true, sup: !hide && p.excited ? '∗' : undefined }];
  return [{ symbol: p.symbol, sub: p.sub, sup: p.charge }];
}

function equation(particles, hideFirst) {
  return particles.flatMap((p, i) => [...(i ? [' + '] : []), ...isotope(p, i === 0 && hideFirst)]);
}

function particle(c, box, p, x, y, radius, hole) {
  if (!p.atom) {
    if (p.Z) K.dot(c, x, y, radius * .21, C.F);
    else K.circ(c, x, y, radius * .21, p.A ? C.B : C.gas, 1);
    return;
  }
  K.circ(c, x, y, radius, box.color, box.lw, K.alpha(C.B, .08));
  if (hole) {
    measure(c, box, ['?'], x, y - box.fs / 2, 'center', radius * 1.6);
    return;
  }
  const count = Math.min(p.A, 16), protons = Math.min(count, Math.round(count * p.Z / p.A));
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    const r = radius * .72 * Math.sqrt(i / count);
    const filled = Math.floor((i + 1) * protons / count) !== Math.floor(i * protons / count);
    K.circ(c, x + r * Math.cos(angle), y + r * Math.sin(angle), radius * .22 / Math.sqrt(count / 4),
      filled ? C.F : C.B, 1, filled ? C.F : null);
  }
}

function drawReaction(c, o, GH) {
  const index = mode(o);
  if (!index) return chain(c, o, GH);
  const b = GH.box(o);
  if (b.w < 100 || b.h < 90) return;
  const reaction = reactions[index - 1], result = reference[index - 1];
  const details = K.showDetails(o);
  const hole = o.qNucQuiz === true && o.qNucReveal !== true;
  const fs = K.fs(K.S(b), .045, 8, 18), pad = fs * .55;
  const notesH = details ? Math.min(b.h * .33, fs * 5.8) : 0;
  const box = { color: o.color, fs, lw: K.lw(o), x: b.x1 + pad, y: b.y1 + pad, w: b.w - 2 * pad, h: b.h - 2 * pad - notesH };
  const { x, y, w, h, color } = box;
  measure(c, box, [...equation(reaction.left), '   →   ', ...equation(reaction.right, hole)], x + w / 2, y, 'center', w * .99);
  const t = K.clamp(K.t(o), 0, 3);
  const cy = y + h * .51, cx = x + w * .5, radius = Math.min(h * .19, w * .08);
  const move = Math.min(1, Math.max(0, t - 1) / 1.5);
  const terms = t < 1 ? reaction.left : reaction.right;
  const halfSpan = (terms.length - 1) / 2;
  const spacing = Math.min(w * .29 * (.46 + move), (w / 2 - radius - fs * .3) / Math.max(1, halfSpan));
  for (const [i, p] of terms.entries()) {
    const s = i - halfSpan;
    const pt = t < 1 ? [cx + s * w * .44 * (1 - t * .68), cy] :
      [cx + s * spacing, cy + ((i % 2) * 2 - 1) * h * .07 * move];
    const reach = p.atom ? radius : radius * .14;
    const dx = pt[0] - cx, dy = pt[1] - cy;
    const distance = Math.hypot(dx, dy);
    if (t > 1 && distance > reach + 4) {
      const u = (distance - reach - 2) / distance;
      K.arrow(c, cx, cy, cx + dx * u, cy + dy * u, K.alpha(color, .55), 1);
    }
    const hide = t >= 1 && hole && i === 0;
    particle(c, box, p, ...pt, p.atom ? radius : radius * .64, hide);
    measure(c, box, isotope(p, hide), pt[0], pt[1] + reach + fs * .25, 'center', w * .23);
    if (details && p.atom && !hide && h > fs * 4.8) {
      measure(c, box, [p.Z + ' p · ' + (p.A - p.Z) + ' n'], pt[0], pt[1] + radius + fs * 1.5, 'center', w * .23);
    }
  }
  measure(c, box, ['反应过程与核子图标为示意'], cx, y + h - fs * 1.1, 'center', w);
  if (!details) return;
  const lines = [[reaction.name + ' · 各项质量数、电荷与电子轻子数守恒']];
  if (o.qNucQuiz === true) {
    const trial = { ...reaction.right[0], A: Math.round(D.number(o, 'qNucTrialA')), Z: Math.round(D.number(o, 'qNucTrialZ')) };
    const delta = balance(reaction.left, [trial, ...reaction.right.slice(1)]);
    lines.push(['作答 A = ' + trial.A + '，Z = ' + trial.Z + '   ' +
      (delta.A || delta.Z ? '尚有守恒量未配平' : '质量数与电荷已配平')]);
  }
  if (!hole) {
    lines.push([{ symbol: 'Q' }, ' = Δ', { symbol: 'm' }, { symbol: 'c', sup: 2 },
      reaction.excitation ? ' − ' + K.formatQuantity(reaction.excitation, 'MeV', 6) : '',
      ' = ' + K.formatQuantity(result.Q, 'MeV', 3) + ' = ', ...K.scientificQuantity(result.joules, 'J', 3)]);
    lines.push(['Δ', { symbol: 'm' }, ' = ' + K.formatQuantity(result.defect, 'u', 6) + ' = ',
      ...K.scientificQuantity(result.kg, 'kg', 3), '   中性原子质量，含电子数修正']);
  }
  lines.push([reaction.excitation ? '激发态子核随后退激，β⁺ 能量与中微子及反冲共享。' :
    '孤立系统总能量和总动量守恒，释放能在产物间分配。']);
  D.notes(c, { ...box, y: y + h + pad * .18, h: notesH - pad * .18 }, lines);
}

Object.assign(TB.shapes[reactionKey], {
  params: ['qNucReaction', 'qNucQuiz', ...quizParams, 'qNucReveal', 'qNucStop'],
  showParam(o, p) {
    return p === 'qNucReaction' || (mode(o) > 0 && (p === 'qNucQuiz' || p === 'qNucStop' || o.qNucQuiz === true));
  },
  animationTimeline: o => mode(o) ? { duration: 3, events: [{ t: 1, label: '生成产物' }],
    pauseAtEvents: o.qNucStop === true, timeLabel: t => '示意进程 ' + Math.round(t * 100 / 3) + '%' } : null,
  draw: drawReaction
});

const bindingIds = ['H', 'D', 'T', 'He', 'C', 'O', 'Fe', 'Ni', 'Kr', 'Ba', 'Pb', 'U235', 'U238'];
const samples = bindingIds.map(id => ({ atom: atoms[id], ...binding(atoms[id]) }));
K.sel('qNucBinding', '核素读数', bindingIds.map(id => atoms[id].A + atoms[id].symbol), 6);
K.sel('qNucBindingView', '比较区域', ['全部核素', '轻核', '铁镍与重核']);
K.reg({
  key: 'pm_g_binding', cat: 'graph', label: '比结合能曲线',
  icon: '<path d="M3 3v18h18"/>' + '<path d="M5 18l1-8 1 2 3-5q4-2 10 0"/>',
  params: ['qNucBinding', 'qNucBindingView'],
  draw(c, o, GH) {
    const b = GH.box(o);
    if (b.w < 100 || b.h < 85) return;
    const detail = K.showDetails(o), fs = K.fs(K.S(b), .046, 8, 17);
    const h = b.h - (detail ? Math.min(b.h * .24, fs * 3.6) : 0);
    const choice = Math.floor(K.clamp(+K.v(o, 'qNucBinding') || 0, 0, samples.length - 1));
    const selected = samples[choice];
    const view = +K.v(o, 'qNucBindingView');
    const xmin = view === 2 ? 40 : 0, xmax = view === 1 ? 20 : 250;
    const active = samples.filter(p => p.atom.A >= xmin && p.atom.A <= xmax);
    const A = K.axes(c, b.x1, b.y1, b.w, h, { xmin, xmax, ymin: 0, ymax: 9.7, xl: 'A',
      yl: ['(', { symbol: 'E', sub: 'b' }, '/', { symbol: 'A' }, ')/MeV'], col: o.color, fs, O: false, xLabelAbove: true });
    K.poly(c, active.map(p => [A.X(p.atom.A), A.Y(p.perNucleon)]), K.alpha(o.color, .6), 1, [4, 4]);
    for (const p of active) {
      const x = A.X(p.atom.A), y = A.Y(p.perNucleon);
      K.dot(c, x, y, p === selected ? 4 : 2.5, p === selected ? C.F : C.B);
    }
    const box = { fs, color: o.color, w: b.w };
    measure(c, box, ['实测质量换算 · 虚线引导'], b.x2 - 4, b.y1 + 2, 'right', b.w * .48);
    for (const n of [xmin, (xmin + xmax) / 2, xmax]) {
      const px = A.X(n);
      K.line(c, px, A.oy - 2, px, A.oy + 2, o.color, 1);
      measure(c, box, [String(n)], px, A.oy + fs * .42, 'center', fs * 3);
    }
    for (const value of [3, 6, 9]) {
      K.line(c, A.ox - 2, A.Y(value), A.ox + 2, A.Y(value), o.color, 1);
      measure(c, box, [String(value)], A.ox - 4, A.Y(value) - fs * .55, 'right', fs);
    }
    for (const id of view === 1 ? ['D', 'He', 'C', 'O'] : view === 2 ? ['Fe', 'Ni', 'Kr', 'Ba', 'Pb', 'U238'] : ['He', 'Ni', 'Ba', 'U238']) {
      const p = samples.find(sample => sample.atom === atoms[id]);
      const offset = id === 'Ni' || id === 'Pb' || id === 'He' ? fs * 1.45 : -fs * 1.45;
      measure(c, box, isotope(p.atom), Math.max(b.x1 + fs * 2.25, A.X(p.atom.A)), A.Y(p.perNucleon) + offset, 'center', fs * 4);
    }
    if (view === 0 && b.w >= 225 && h >= 120) {
      for (const [start, end, ink, name] of [[17, 55, C.v, '轻核聚变'], [235, 155, C.I, '重核裂变']]) {
        K.arrow(c, A.X(start), A.Y(4.2), A.X(end), A.Y(4.2), ink, 1.3);
        measure(c, box, [name], A.X((start + end) / 2), A.Y(4.2) - fs * 1.35, 'center', b.w * .27, ink);
      }
    }
    if (!detail) return;
    D.notes(c, { ...box, x: b.x1 + 5, y: b.y1 + h, w: b.w - 10, h: b.h - h }, [
      [...isotope(selected.atom), '   Δ', { symbol: 'm' }, ' = ' + K.formatQuantity(selected.defect, 'u', 5),
        '   ', { symbol: 'E', sub: 'b' }, ' = ' + K.formatQuantity(selected.binding, 'MeV', 2),
        '   ', { symbol: 'E', sub: 'b' }, '/', { symbol: 'A' }, ' = ' + K.formatQuantity(selected.perNucleon, 'MeV', 3)],
      ['比结合能按单个核子平均；计算反应放能需比较反应前后总结合能。']
    ]);
  }
});

const decayParams = D.parameters('qNuc', [
  ['Count', '初始核数', '', 1, 576, 1, 196],
  ['Seed', '随机样本种子', '', 1, 999, 1, 17]
]);
const legacyCount = o => Math.round(D.number(o, 'qDecN')) ** 2;
TB.paramDefs.qNucCount.defaultFor = legacyCount;
const decayCount = o => o.qNucCount == null ? legacyCount(o) : Math.round(D.number(o, 'qNucCount'));
function decay(N0, halfLife, t) {
  if (!Number.isInteger(N0) || N0 < 0 || !Number.isFinite(halfLife) || halfLife <= 0 || Number.isNaN(t)) {
    throw new RangeError('Invalid decay parameters');
  }
  const lambda = Math.LN2 / halfLife;
  const fraction = K.decayFraction(Math.max(0, t), halfLife);
  const remaining = N0 * fraction;
  return { lambda, fraction, remaining, decayed: N0 - remaining, activity: lambda * remaining };
}
K.tog('qNucSample', '显示单次随机样本', true);
K.reg({
  key: 'pm_decay', cat: 'modern', label: '放射性衰变·半衰期', animatable: true, 
  icon: '<circle cx="5" cy="5" r="1.6"/><circle cx="10" cy="5" r="1.6"/><circle cx="5" cy="10" r="1.6" opacity=".35"/><circle cx="10" cy="10" r="1.6"/><path d="M13 3v18h9"/><path d="M13 4q3 11 9 15"/>',
  params: ['qHalf', ...decayParams, 'qNucSample', 'qDecN'],
  showParam(o, p) { return p !== 'qDecN' && (p !== 'qNucSeed' || o.qNucSample !== false); },
  animationTimeline(o) {
    const halfLife = D.number(o, 'qHalf');
    return { duration: 5 * halfLife, events: [1, 2, 3, 4, 5].map(i => ({ t: i * halfLife, label: i + ' 个半衰期' })) };
  },
  draw(c, o, GH) {
    const boxes = D.layout(o, GH);
    if (!boxes) return;
    const N0 = decayCount(o), halfLife = D.number(o, 'qHalf'), seed = Math.round(D.number(o, 'qNucSeed'));
    const t = K.clamp(K.t(o), 0, 5 * halfLife);
    const current = decay(N0, halfLife, t), sampling = o.qNucSample !== false;
    const { x, y, w, h, fs, color } = boxes.scene;
    const n = Math.ceil(Math.sqrt(N0)), cell = Math.min(w, h - fs * 2) * .8 / n;
    const startX = x + (w - n * cell) / 2, startY = y + (h - n * cell) * .55;
    const sample = sampling ? K.memo(o, 'g5-decay:' + N0 + ':' + halfLife + ':' + seed, () => {
      const rng = K.rng(seed);
      const lifetimes = Array.from({ length: N0 }, () => -Math.log1p(-rng()) * halfLife / Math.LN2);
      return { lifetimes, sorted: lifetimes.toSorted((a, b) => a - b) };
    }) : null;
    measure(c, boxes.scene, [sampling ? '单次随机样本' : '统计期望 · 图块表示剩余比例'], x + w / 2, y, 'center', w);
    if (sample) {
      for (const [i, lifetime] of sample.lifetimes.entries()) {
        const px = startX + (i % n + .5) * cell, py = startY + (Math.floor(i / n) + .5) * cell;
        if (lifetime > t) K.dot(c, px, py, cell * .32, C.I);
        else K.circ(c, px, py, cell * .29, K.alpha(color, .3), .8);
      }
    } else {
      const side = n * cell;
      K.box(c, startX, startY, side, side, color, 1);
      c.fillStyle = K.alpha(C.I, .48);
      c.fillRect(startX, startY + side * (1 - current.fraction), side, side * current.fraction);
    }
    const plot = boxes.plots;
    const A = K.axes(c, plot.x, plot.y, plot.w, plot.h, { xmin: 0, xmax: 5 * halfLife, ymin: 0, ymax: 1.1,
      xl: 't/s', yl: [{ symbol: 'N' }, '/', { symbol: 'N', sub: 0 }], col: color, fs, O: false, xLabelAbove: true });
    K.plot(c, A, time => K.decayFraction(time, halfLife), 0, 5 * halfLife, C.B, 1.5, sample ? [5, 4] : null, 64);
    let alive = N0;
    if (sample) {
      const points = [[A.X(0), A.Y(1)]];
      for (const time of sample.sorted) {
        if (time > t) break;
        points.push([A.X(time), A.Y(alive / N0)], [A.X(time), A.Y((--alive) / N0)]);
      }
      points.push([A.X(t), A.Y(alive / N0)]);
      K.poly(c, points, C.I, 1.5);
    }
    K.guide(c, A, t, current.fraction, K.alpha(C.B, .55), 1);
    K.dot(c, A.X(t), A.Y(current.fraction), 3, C.B);
    measure(c, plot, [sample ? '虚线期望 · 实线样本' : '剩余比例期望'], plot.x + plot.w - 2, plot.y + 2, 'right', plot.w * .58);
    for (const value of [0, .5, 1]) {
      measure(c, plot, [String(value)], A.ox - 4, A.Y(value) - fs * .5, 'right', fs * 2);
    }
    for (const multiplier of [1, 2, 3, 4, 5]) {
      const px = A.X(multiplier * halfLife);
      K.line(c, px, A.oy - 2, px, A.oy + 2, color, 1);
      measure(c, plot, [String(+(multiplier * halfLife).toFixed(2))], px, A.oy + fs * .28, 'center', plot.w * .1);
    }
    D.notes(c, boxes.notes, [
      [{ symbol: 'N' }, ' = ', { symbol: 'N', sub: 0 },
        { symbol: '2', upright: true, sup: ['−', { symbol: 't' }, '/', { symbol: 'T', sub: '1/2' }] },
        '    ', { symbol: 'λ' }, ' = ln 2/', { symbol: 'T', sub: '1/2' }, '    ', { symbol: 'A' }, ' = ', { symbol: 'λ' }, { symbol: 'N' }],
      ['剩余期望 ' + current.remaining.toFixed(2) + '   已衰变期望 ' + current.decayed.toFixed(2) +
        '   活度 ' + K.formatQuantity(current.activity, 'Bq', 2) + (sample ? '   样本剩余 ' + alive : '')],
      ['单核衰变时刻随机；曲线描述同种大量原子核的统计期望。']
    ]);
  }
});

K.nuclearReview = { atoms, neutron, electron, positron, neutrino, antineutrino, reactions, balance, analyze, binding,
  decay, decayCount, uKg, mevJ, uMeV };
})();

/* ===== 上游 pm_g5_molecular.js ===== */
/* A 3-D Maxwell distribution and a seeded projection with elastic wall reflection. */
(function () {
'use strict';
const K = window.__PM;
const D = K.reviewMotion;
const { C } = K;
const kB = 1.380649e-23, uKg = 1.66053906892e-27, avogadro = 6.02214076e23;
const positionParams = D.parameters('qMol', [
  ['Mass', '单个分子质量', 'u', 2, 146, .1, 32],
  ['Size', '立方容器边长', 'nm', 3, 40, .1, 10]
]);
const distributionParams = D.parameters('qMol', [
  ['T2', '对照温度', 'K', 50, 1200, 10, 600],
  ['Mass2', '对照分子质量', 'u', 2, 146, .1, 4],
  ['Low', '区间端点一', 'm·s⁻¹', 0, 8000, 10, 250],
  ['High', '区间端点二', 'm·s⁻¹', 0, 8000, 10, 650]
]);
K.sel('qMolCompare', '分布对照', ['同种气体 · 改变温度', '同温度 · 改变分子质量', '只显示主曲线']);
K.tog('qMolArea', '显示速率区间概率', true);
K.tog('qMolAnswer', '隐藏特征速率和答案');
K.tog('qMolVector', '显示投影速度矢量');
K.tog('qMolTrace', '显示样本轨迹');
const densityUnit = 4 / Math.sqrt(Math.PI);
const unitDensity = u => densityUnit * u * u * Math.exp(-u * u);

function distribution(T, mass) {
  if (!Number.isFinite(T) || !Number.isFinite(mass) || T <= 0 || mass <= 0) {
    throw new RangeError('Temperature and molecule mass must be positive and finite');
  }
  const variance = kB * T / mass;
  const mode = Math.sqrt(2 * variance);
  if (!(mode > 0) || !Number.isFinite(mode)) throw new RangeError('Thermal speed is out of range');
  const mean = Math.sqrt(8 * variance / Math.PI);
  const meanSquare = 3 * variance;
  const rms = Math.sqrt(meanSquare);

  function density(v) {
    const x = v / mode;
    return x >= 0 && x < 27 ? unitDensity(x) / mode : 0;
  }

  function probability(lo, hi) {
    if (Number.isNaN(lo) || Number.isNaN(hi)) return 0;
    // Integrate in units of the most probable speed to use one stable step
    // size for heavy, cold molecules and light, hot molecules alike.
    const a = K.clamp(Math.min(lo, hi) / mode, 0, 12);
    const b = K.clamp(Math.max(lo, hi) / mode, 0, 12);
    if (b <= a) return 0;
    const n = 2 * Math.max(4, Math.ceil(64 * (b - a)));
    const step = (b - a) / n;
    let sum = unitDensity(a) + unitDensity(b);
    for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * unitDensity(a + i * step);
    return K.clamp(sum * step / 3, 0, 1);
  }
  return { density, probability, mode, mean, rms, meanSquare, meanEnergy: 1.5 * kB * T };
}

function read(o) {
  const T = D.number(o, 'qTemp');
  const mass = D.number(o, 'qMolMass') * uKg;
  const sizeNm = D.number(o, 'qMolSize');
  const count = Math.round(D.number(o, 'qNum'));
  const volume = (sizeNm * 1e-9) ** 3, amount = count / avogadro, numberDensity = count / volume;
  const law = distribution(T, mass);
  const pressure = numberDensity * mass * law.meanSquare / 3;
  return { T, mass, sizeNm, count, volume, amount, numberDensity, pressure, law };
}

function reflect(origin, velocity, time, size) {
  const p = K.mod(origin + velocity * time, 2 * size);
  if (p === 0) return { position: 0, velocity: Math.abs(velocity) };
  if (p === size) return { position: size, velocity: -Math.abs(velocity) };
  return p < size ? { position: p, velocity } : { position: 2 * size - p, velocity: -velocity };
}

const plotParams = ['qTemp', 'qMolMass', 'qNum', 'qMolSize', 'qMolCompare', ...distributionParams];
function readPlot(o, withSamples = false) {
  const signature = 'g5-molecules:' + withSamples + ':' + JSON.stringify(plotParams.map(key => K.v(o, key)));
  return K.memo(o, signature, () => makePlot(o, withSamples));
}
function makePlot(o, withSamples) {
  const m = read(o);
  const comparison = +K.v(o, 'qMolCompare');
  const mass2 = (comparison === 1 ? D.number(o, 'qMolMass2') : m.mass / uKg) * uKg;
  const T2 = comparison === 0 ? D.number(o, 'qMolT2') : m.T;
  const other = comparison < 2 ? distribution(T2, mass2) : null;
  const ends = [D.number(o, 'qMolLow'), D.number(o, 'qMolHigh')];
  const low = Math.min(...ends), high = Math.max(...ends);
  const samples = withSamples ? K.thermalMolecules(m.count) : null;
  return { ...m, other, T2, mass2, low, high, samples, intervalProbability: m.law.probability(low, high) };
}
const quantity = (value, unit, digits = 1) => K.formatQuantity(value, unit, digits);
const scientific = (value, unit) => K.scientificQuantity(value, unit, 3);
const label = D.label;
const fAxis = [{ symbol: 'f' }, '(', { symbol: 'v' }, ')/(s·m⁻¹)'];
const commonParams = ['qTemp', positionParams[0], 'qMolCompare', ...distributionParams, 'qMolArea', 'qMolAnswer'];
function showParam(o, p) {
  const comparison = +K.v(o, 'qMolCompare');
  if (p === 'qMolT2') return comparison === 0;
  if (p === 'qMolMass2') return comparison === 1;
  if (p === 'qMolLow' || p === 'qMolHigh') return o.qMolArea !== false;
  return true;
}

function tick(x, step) { return Math.round(x / step) * step; }
function plot(c, box, m, o, currentSpeed) {
  const { x, y, w, h, color } = box;
  const fs = Math.min(box.fs, h * .11, w * .075);
  const labels = { ...box, fs };
  const area = o.qMolArea !== false && m.high > m.low;
  const answers = K.showDetails(o) && o.qMolAnswer !== true;
  const xmaxRaw = Math.max(m.law.mode, m.other?.mode ?? 0) * 3.2;
  const xStep = xmaxRaw >= 3000 ? 500 : xmaxRaw >= 1000 ? 200 : 100;
  const xmax = Math.ceil(Math.max(xmaxRaw, area ? m.high * 1.03 : 0) / xStep) * xStep;
  const maxDensity = Math.max(m.law.density(m.law.mode), m.other?.density(m.other.mode) ?? 0);
  const A = K.axes(c, x, y, w, h, { xmin: 0, xmax, ymin: 0, ymax: maxDensity * 1.22, xl: 'v/(m·s⁻¹)',
    yl: fAxis, col: color, fs, O: false, xLabelAbove: true,
    pad: { l: fs * 3.2, r: fs * 1.7, t: fs * 2.5, b: fs * 1.9 } });
  const supportEnd = law => Math.min(xmax, 8 * law.mode);
  const shadeEnd = Math.min(m.high, supportEnd(m.law));
  if (area && shadeEnd > m.low) K.fillUnder(c, A, m.law.density, m.low, shadeEnd, K.alpha(C.gas, .24));
  function curve(law, ink, width, dash) {
    const end = supportEnd(law);
    K.plot(c, A, law.density, 0, end, ink, width, dash, 128);
    if (end < xmax) K.line(c, A.X(end), A.oy, A.X1, A.oy, ink, width, dash);
  }
  curve(m.law, C.B, 1.65);
  if (m.other) curve(m.other, C.I, 1.4, [5, 4]);
  const axisValues = w > 260 ? [0, tick(xmax / 3, xStep), tick(2 * xmax / 3, xStep), xmax] : [0, xmax];
  for (const value of axisValues) {
    const px = A.X(value);
    K.line(c, px, A.oy - 2, px, A.oy + 2, color, 1);
    label(c, labels, [String(value)], px, A.oy + fs * .36, color, value ? 'center' : 'right', fs * 4);
  }
  for (const value of [maxDensity * .5, maxDensity]) {
    K.line(c, A.ox - 2, A.Y(value), A.ox + 2, A.Y(value), color, 1);
    label(c, labels, [value.toPrecision(2)], A.ox - 4, A.Y(value) - fs * .5, color, 'right', fs * 3);
  }
  const legend = quantity(m.T, 'K', 0) + ' · ' + quantity(m.mass / uKg, 'u');
  label(c, labels, [legend], x + w - 3, y + 3, C.B, 'right', w * .45);
  if (m.other) {
    const legend2 = quantity(m.T2, 'K', 0) + ' · ' + quantity(m.mass2 / uKg, 'u') + '（虚线）';
    label(c, labels, [legend2], x + w - 3, y + 3 + fs * 1.35, C.I, 'right', w * .45);
  }
  if (answers) {
    const marks = [
      [m.law.mode, [{ symbol: 'v', sub: 'p' }], C.F],
      [m.law.mean, [{ symbol: 'v', sub: 'mean' }], C.v],
      [m.law.rms, [{ symbol: 'v', sub: 'rms' }], C.E]
    ];
    const markLabelX = Math.min(x + w - fs * 3.4, A.X(m.law.rms) + fs * 1.6);
    const markLabelY = Math.max(y + fs * 2.7, A.Y(m.law.density(m.law.mode)) - fs * 1.5);
    for (const [i, [v, tokens, ink]] of marks.entries()) {
      const px = A.X(v), py = A.Y(m.law.density(v));
      const ly = markLabelY + i * fs * 1.25;
      K.line(c, px, py, px, A.oy, ink, .9, [2, 3]);
      K.dot(c, px, py, 2.8, ink);
      K.line(c, px, py, markLabelX - 2, ly + fs * .42, ink, .8, [2, 3]);
      label(c, labels, tokens, markLabelX, ly, ink, 'left', fs * 3);
    }
    if (m.other) K.circ(c, A.X(m.other.mode), A.Y(m.other.density(m.other.mode)), 3, C.I, 1);
  }
  if (Number.isFinite(currentSpeed) && currentSpeed <= xmax) {
    K.circ(c, A.X(currentSpeed), A.Y(m.law.density(currentSpeed)), 4, C.gas, 1.5);
  }
}
function distributionNotes(c, box, m, o, extra = []) {
  if (o.qMolAnswer === true) {
    D.notes(c, box, [['热平衡理想气体 · 纵轴为速率概率密度'], ['比较峰位、峰高和区间面积。'], ...extra]);
    return;
  }
  const speeds = [
    [{ symbol: 'v', sub: 'p' }, ' = ' + quantity(m.law.mode, 'm·s⁻¹')],
    [{ symbol: 'v', sub: 'mean' }, ' = ' + quantity(m.law.mean, 'm·s⁻¹')],
    [{ symbol: 'v', sub: 'rms' }, ' = ' + quantity(m.law.rms, 'm·s⁻¹')]
  ];
  const result = o.qMolArea !== false ? ['区间 ' + quantity(m.low, 'm·s⁻¹', 0) + ' 至 ' +
    quantity(m.high, 'm·s⁻¹', 0) + '   概率 ' + K.formatQuantity(100 * m.intervalProbability, '%', 2)] :
    ['曲线总面积为 1；纵轴为速率概率密度。'];
  const compare = m.other ? [['对照曲线三种速率依次为 ' +
    [m.other.mode, m.other.mean, m.other.rms].map(v => quantity(v, 'm·s⁻¹')).join('、')]] : [];
  D.notes(c, box, [[...speeds[0], '    ', ...speeds[1], '    ', ...speeds[2]], ...compare, result, ...extra]);
}

K.reg({
  key: 'pm_g_maxwell', cat: 'graph', label: '分子速率分布', params: commonParams, showParam,
  icon: '<path d="M4 3v17h17M4 20q4-16 7-12t10 11"/><path d="M4 20q3-12 6-9t11 8" opacity=".5"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    if (b.w < 105 || b.h < 80) return;
    const m = readPlot(o), fs = K.fs(K.S(b), .049, 8, 18), color = o.color;
    const notes = K.showDetails(o) ? Math.min(b.h * .22, fs * 3.5) : 0;
    const box = { x: b.x1 + 5, y: b.y1 + 3, w: b.w - 10, h: b.h - notes - 5, fs, color };
    plot(c, box, m, o);
    if (notes) distributionNotes(c, { ...box, y: box.y + box.h, h: notes }, m, o);
  }
});

const boardToPhysicalTime = 1e-11;

function cloud(c, box, o, m) {
  const { x, y, w, h, fs, color } = box;
  const side = Math.min(w * .9, h - 2.9 * fs);
  const sideX = x + (w - side) / 2, sideY = y + 1.45 * fs + (h - 2.9 * fs - side) / 2;
  const scale = side / m.sizeNm;
  K.box(c, sideX, sideY, side, side, color, box.lw, K.alpha(C.gas, .045));
  label(c, box, ['三维速度采样 · 平面投影'], x + w / 2, y, color, 'center', w);
  label(c, box, [quantity(m.sizeNm, 'nm') + ' · 弹性壁反射'], x + w / 2, sideY + side + fs * .22, color, 'center', w);
  const samples = m.samples;
  const t = K.clamp(K.t(o), 0, 12);
  const nmPerSecond = Math.sqrt(kB * m.T / m.mass) * boardToPhysicalTime * 1e9;
  const pos = (molecule, at) => {
    const px = reflect(molecule.x * m.sizeNm, molecule.vx * nmPerSecond, at, m.sizeNm);
    const py = reflect(molecule.y * m.sizeNm, molecule.vy * nmPerSecond, at, m.sizeNm);
    return { x: sideX + px.position * scale, y: sideY + py.position * scale, vx: px.velocity, vy: py.velocity };
  };
  const traced = Math.min(samples.length, 3), vectors = Math.min(samples.length, 12);
  const dotSize = K.clamp(side / (3 * Math.sqrt(m.count)), 1.15, 4.1);
  const arrow = side * .05 / (500 * boardToPhysicalTime * 1e9);
  c.save(); c.beginPath(); c.rect(sideX, sideY, side, side); c.clip();
  if (o.qMolTrace === true) {
    for (const molecule of samples.slice(0, traced)) {
      const points = [];
      const start = Math.max(0, t - .65);
      const cuts = [start, t];
      // Sample exact wall impacts so the trail preserves the reflection corner.
      for (const [origin, velocity] of [[molecule.x, molecule.vx], [molecule.y, molecule.vy]]) {
        const rate = velocity * nmPerSecond / m.sizeNm;
        if (!rate) continue;
        const a = origin + start * rate, b = origin + t * rate;
        for (let k = Math.ceil(Math.min(a, b)); k <= Math.floor(Math.max(a, b)); k++) cuts.push((k - origin) / rate);
      }
      for (const at of cuts.sort((a, b) => a - b)) {
        const p = pos(molecule, at);
        points.push([p.x, p.y]);
      }
      K.poly(c, points, K.alpha(C.v, .7), 1.25);
    }
  }
  for (const [i, molecule] of samples.entries()) {
    const p = pos(molecule, t);
    K.dot(c, p.x, p.y, i === 0 ? dotSize * 1.38 : dotSize, i === 0 ? C.gas : C.B);
    if (o.qMolVector === true && i < vectors) {
      K.vec(c, p.x, p.y, p.vx * arrow, p.vy * arrow, C.v, 1);
    }
  }
  c.restore();
  return samples[0].s * nmPerSecond / (boardToPhysicalTime * 1e9);
}

K.reg({
  key: 'pm_gas', cat: 'thermo', label: '气体分子热运动', animatable: true,
  icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.4"/><circle cx="15" cy="10" r="1.4"/><circle cx="10" cy="16" r="1.4"/><path d="M15 10l3-2M10 16l-3 2"/>',
  params: [...commonParams, 'qNum', positionParams[1], 'qMolVector', 'qMolTrace'], showParam,
  animationTimeline() {
    return { duration: 12, events: [3, 6, 9].map(t => ({ t, label: '速度样本' })),
      timeLabel: t => '模型时刻 ' + quantity(t * boardToPhysicalTime * 1e12, 'ps', 0) };
  },
  draw(c, o, GH) {
    const b = D.layout(o, GH, 6.8);
    if (!b) return;
    const m = readPlot(o, true), speed = cloud(c, b.scene, o, m);
    plot(c, b.plots, m, o, speed);
    const micro = [
      ['⟨', { symbol: 'E', sub: 'k' }, '⟩ = 3', { symbol: 'k', sub: 'B' }, { symbol: 'T' }, '/2 = ',
        ...scientific(m.law.meanEnergy, 'J'), '    ', { symbol: 'n', sub: 'd' }, ' = ', ...scientific(m.numberDensity, 'm⁻³')],
      [{ symbol: 'p' }, ' = ', { symbol: 'n', sub: 'd' }, { symbol: 'm' }, '⟨', { symbol: 'v', sup: 2 }, '⟩/3 = ',
        ...scientific(m.pressure, 'Pa'), '    ', { symbol: 'n' }, ' = ', ...scientific(m.amount, 'mol')]
    ];
    distributionNotes(c, b.notes, m, o, o.qMolAnswer === true ? [['样本仅考虑弹性壁反射。']] : micro);
  }
});
K.molecularReview = { distribution, reflect, read, kB, uKg, avogadro };
})();

/* ===== 上游 pm_g5_knowledge.js ===== */
/* The review index enriches live registrations with teaching metadata. */
(function () {
'use strict';
const K = window.__PM;
const fields = ['concepts', 'problems', 'charts', 'experiments', 'related'];
const levels = ['L1', 'L2', 'L3'];
const media = ['static', 'animation'];
const statuses = ['verified', 'draft', 'unlinked'];
const safeText = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[‐‑‒–—−]/g, '-');
const unique = values => [...new Set(values)];
const paths = [
  { id: 'dynamics', name: '牛顿运动定律', steps: [
    ['合力与分力', 'anim_force_compose'], ['斜面受力', 'pm_incline'], ['板块模型', 'blockOnBoard'],
    ['速度—时间图', 'pm_g_motion'], ['纸带实验', 'pm_ticker_lab']
  ] },
  { id: 'energy', name: '功能关系', steps: [
    ['做功与功率', 'pm_work_energy_graphs'], ['摩擦与生热', 'pm_conveyor'], ['弹簧储能', 'twoBlocksSpring'],
    ['守恒与损失', 'pm_momentum_energy'], ['落体机械能实验', 'pm_fall_energy']
  ] },
  { id: 'fields', name: '场中带电粒子', steps: [
    ['匀强电场', 'efUniform'], ['电场偏转', 'pm_deflect'], ['磁场偏转', 'pm_bound_field'],
    ['轨迹临界实验台', 'pm_magnetic_lab'], ['质谱仪', 'pm_mass_spec']
  ] },
  { id: 'circuits', name: '电学实验', steps: [
    ['闭合电路', 'pm_dynamic_circuit'], ['电表读数', 'ammeter'], ['伏安法', 'pm_lab_resistance'],
    ['伏安图像', 'pm_g_ui'], ['测电动势和内阻', 'pm_lab_emf']
  ] },
  { id: 'waves', name: '振动与波', steps: [
    ['简谐运动', 'pm_shm_circle'], ['机械波', 'pm_wave_travel'], ['驻波图像', 'pm_standing_anim'],
    ['水波干涉', 'waterInterf'], ['双缝干涉实验', 'doubleSlit']
  ] },
  { id: 'orbit', name: '天体运动与变轨', steps: [
    ['开普勒定律', 'anim_kepler2'], ['圆轨道比较', 'anim_satellites'], ['卫星变轨', 'pm_hohmann']
  ] },
  { id: 'thermal', name: '气体的微观与宏观', steps: [
    ['分子热运动', 'pm_gas'], ['速率概率图像', 'pm_g_maxwell'], ['理想气体状态', 'pm_cylinder'], ['热力学循环', 'pm_engine']
  ] }
];

function createKnowledgeIndex(TB, groups) {
  const metadata = new Map(), schemaErrors = [];
  for (const group of groups) {
    const { keys, ...data } = group;
    if (!keys?.length) schemaErrors.push('Empty metadata group');
    if (!levels.includes(data.level)) schemaErrors.push('Invalid difficulty: ' + keys);
    if (!statuses.slice(0, 2).includes(data.review ?? 'verified')) schemaErrors.push('Invalid review status: ' + keys);
    if (!data.concepts?.length || !data.conditions) schemaErrors.push('Missing concept or conditions: ' + keys);
    for (const key of keys ?? []) {
      if (metadata.has(key)) schemaErrors.push('Duplicate metadata ID: ' + key);
      metadata.set(key, data);
    }
  }
  function visible(key) {
    return Object.hasOwn(TB.shapes, key) && !TB.shapes[key].hidden && key !== '__freehand';
  }
  function get(key) {
    if (!visible(key)) return null;
    const def = TB.shapes[key], data = metadata.get(key) ?? {};
    const module = data.module || def.cat;
    const modules = TB.categories ?? [];
    const moduleName = modules.find(row => row.id === module)?.label ?? module;
    const staticAllowed = !def.animatable || !!def.canAnimate;
    const formats = [staticAllowed && 'static', def.animatable && 'animation'].filter(Boolean);
    const out = { key, label: def.label || key, category: def.cat, module, moduleName,
      model: data.model || def.label || key, level: data.level || '', formats,
      note: data.note || '', conditions: data.conditions || '',
      hasChart: !!data.charts?.includes(key), hasExperiment: !!data.experiments?.includes(key),
      review: metadata.has(key) ? data.review ?? 'verified' : 'unlinked' };
    for (const field of fields) {
      const values = data[field] || [];
      out[field] = field === 'concepts' || field === 'problems' ? [...values] : values.filter(k => k !== key && visible(k));
    }
    return out;
  }
  function rows() {
    return Object.keys(TB.shapes).map(get).filter(Boolean);
  }
  function search(query = {}) {
    const words = safeText(query.text).trim().split(/\s+/).filter(Boolean);
    return rows().filter(row => {
      if (query.module && query.module !== row.module) return false;
      if (query.concept && !row.concepts.includes(query.concept)) return false;
      if (query.problem && !row.problems.includes(query.problem)) return false;
      if (query.level && query.level !== row.level) return false;
      if (query.medium && !row.formats.includes(query.medium)) return false;
      if (query.experiment && !row.experiments.includes(query.experiment) && !(row.hasExperiment && row.key === query.experiment)) return false;
      if (!words.length) return true;
      const linkNames = [...row.charts, ...row.experiments, ...row.related].map(key => TB.shapes[key].label);
      const haystack = safeText([row.key, row.label, row.moduleName, row.model, row.note, row.conditions,
        ...row.concepts, ...row.problems, ...linkNames].join(' '));
      return words.every(word => haystack.includes(word));
    });
  }
  function validate() {
    const errors = [...schemaErrors];
    const moduleIds = (TB.categories ?? []).map(row => row.id);
    for (const [key, data] of metadata) {
      if (!visible(key)) errors.push('Missing registration: ' + key);
      if (!moduleIds.includes(data.module)) errors.push('Missing module: ' + data.module + ' (' + key + ')');
      for (const field of fields) {
        const values = data[field] ?? [];
        if (values.length !== unique(values).length) errors.push('Duplicate ' + field + ': ' + key);
        if (field === 'concepts' || field === 'problems') continue;
        for (const target of values) if (!visible(target)) errors.push(key + ' → ' + target);
      }
    }
    for (const p of paths) for (const [, key] of p.steps) {
      if (!visible(key)) errors.push('Missing path registration: ' + p.id + ' → ' + key);
    }
    return errors;
  }
  function coverage() {
    const entries = rows();
    const byReview = Object.fromEntries(statuses.map(status => [status, entries.filter(r => r.review === status).map(r => r.key)]));
    const layers = {
      concepts: entries.filter(r => r.concepts.length).length,
      models: entries.length,
      problems: entries.filter(r => r.problems.length).length,
      charts: entries.filter(r => r.charts.length || r.hasChart).length,
      experiments: entries.filter(r => r.experiments.length || r.hasExperiment).length
    };
    return { total: entries.length, byReview, layers };
  }
  return { get, rows, search, coverage, validate, paths, levels, media };
}
K.createKnowledgeIndex = createKnowledgeIndex;
})();


/* ---------- 收尾：分类归一 + 纯净图游标 ---------- */
(function () {
  var TB = window.TangBoBoard, K = window.__PM;
  if (!TB || !K) return;
  for (var k in TB.shapes) { var d = TB.shapes[k]; if (d && d.cat === 'thermo') d.cat = 'heat'; }
  /* 上游 pm_order.js 的分类顺序只取 basic/mech/thermo/wave/optics/em/modern/graph/anim 前 9 个。
     本工程的分类清单由 physshapes.js 的 P.catOrder 定，TB.categories 同屏显示 —— 这里把扩展库新挂上的
     分类按上游相对顺序插进去，不动已有的 orbit/emlab/sketch。 */
  var want = ['mech', 'heat', 'wave', 'orbit', 'optics', 'em', 'emlab', 'modern', 'graph', 'sketch'];
  var rank = function (id) { var i = want.indexOf(id); return i < 0 ? 50 : i; };
  TB.categories.sort(function (a, b) { return rank(a.id) - rank(b.id); });
  /* 上游参数定义里有 min/max 没写、只有 hint 的（如三档开关），paramList 会把它们兜成 0~1 的滑条；
     分段参数的 min/max/step 由 paramList 依 hint 重算，这里不用管。 */
  if (K.wrapClean) K.wrapClean();
})();
