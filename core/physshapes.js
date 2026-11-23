/* ============================================================================

})();

/* ============================================================================
 * 数理无限画布 · 物理图形库（移植自「唐波的物理白板 · 独立实现」的 lib.js）
 * ----------------------------------------------------------------------------
 * 上游是 129 个图形 / 10 个分类 / 144 个可调参数的纯 Canvas 2D 库，每个图形是
 * { key, cat, geom, label, icon, params[], draw(ctx, obj, GH) }。
 * 这里的移植原则：**注册表与每个 draw 一行都不重画**，只在外面套一层适配器 ——
 * 那套图是按课本插图的观感调出来的，重写一遍只会更差（1.0.10 自研的 97 个就是
 * 因为「看起来不像课本插图」被整体退回，见 docs/待续-学科图形/README.md）。
 *
 * 与上游不同的只有四处：
 *   ① 上游把「合力拖拽」演示挂到 window 的 pointerdown/move/up 上（capture 阶段还会
 *      stopPropagation），搬进来会把画布的指针事件吞掉 —— 移植时删掉了那 3 行
 *      addEventListener；拖拽手柄不再生效，参数照样用「参数」弹层的滑块调。
 *   ② 对象模型换成画布自己的 { kind:'shape', type:'pb', key, x1,y1,x2,y2, color,
 *      width, dash, fill, fillColor, fillAlpha, …参数 }，参数直接存在对象上，
 *      所以复制/粘贴、撤销、序列化、导出都不用额外处理。
 *   ③ 包围盒用一杆「只量坐标」的假 ctx 把 draw 空跑一遍得到（Meas）：上游的几何
 *      只有 x1..y2 四个数，但地面斜线、箭头羽、刻度、标注都会画到框外面。
 *   ④ 动画类图形不播动画：固定取 animT = 0.6s 那一帧（画布没有逐帧刷新的链路）。
 * ========================================================================== */
(function () {
  'use strict';
  const GW = window.GW;
  /* ---- 以下是上游 lib.js 原文（自包含 IIFE，注册表与每个图形的 draw 一行未改；只删了 3 行 window 指针监听） ---- */
/* ============================================================================
 *  物理图形库  lib.js   （唐波的物理白板 · 独立实现）
 *  ----------------------------------------------------------------------------
 *  纯前端 Canvas 2D，零外部依赖，离线双击即用。
 *  129 个物理图形 / 10 个分类 / 144 个可调参数；
 *  每个图形是独立注册项（元数据 + draw(ctx, obj, GH)），
 *  几何与物理模型依据中学物理的通用规律与公式实现。
 *
 *  对外接口（挂在 window.TangBoBoard 上）：
 *    TB.register(def)    注册一个图形
 *    TB.cat(id, name)    注册一个分类
 *    TB.paramDef(k, def) 注册一个可调参数
 *    TB.shapes / TB.categories / TB.paramDefs
 *
 *  绘制函数签名：draw(ctx, obj, GH)
 *    ctx : 2D 上下文
 *    obj : 对象实例（x1/y1/x2/y2/points/color/size/fill/dash/参数/animT…）
 *    GH   : 绘制辅助集 { tint, box, head, deg, cur }
 * ============================================================================ */

(function () {
'use strict';

/* ---------- 注册表 ---------- */
const TB = window.TangBoBoard = window.TangBoBoard || {
  shapes: {},
  paramDefs: {},
  categories: [],
  register(d) { this.shapes[d.key] = d; },
  category(id, label) { this.categories.push({ id, label }); },
  paramDef(key, def) { this.paramDefs[key] = def; }
};

const reg = (d) => TB.register(d);
const cat   = (id, label) => TB.category(id, label);
const paramDef = (key, def) => TB.paramDef(key, def);

/* ---------- 1.1.10 力学动画通用小工具 ---------- */
function AN_CL(v, a, b) { v = +v; if (!isFinite(v)) v = a; return v < a ? a : (v > b ? b : v); }
function AN_AGM(a, b) {
  for (let i = 0; i < 30; i++) {
    if (Math.abs(a - b) < 1e-12) break;
    const na = (a + b) / 2, nb = Math.sqrt(a * b);
    a = na; b = nb;
  }
  return a;
}
// Jacobi 椭圆函数 sn(u,k)：降序 Landen 变换（Numerical Recipes 同款），用来算大摆角单摆的精确解
function AN_SN(u, k) {
  if (!(k > 0)) return Math.sin(u);
  if (k >= 1) return Math.tanh(u);
  const aa = [1], bb = [Math.sqrt(1 - k * k)], cc = [k];
  let n = 0;
  while (Math.abs(cc[n]) > 1e-13 && n < 16) {
    aa.push((aa[n] + bb[n]) / 2);
    bb.push(Math.sqrt(aa[n] * bb[n]));
    cc.push((aa[n] - bb[n]) / 2);
    n++;
  }
  let phi = Math.pow(2, n) * aa[n] * u;
  for (let i = n; i > 0; i--) phi = (phi + Math.asin(AN_CL(cc[i] / aa[i] * Math.sin(phi), -1, 1))) / 2;
  return Math.sin(phi);
}
// 之字形弹簧：沿 a→b 直线画，amp 是横向半宽
function AN_SPRING(c, ax, ay, bx, by, coils, amp) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (!(len > 2)) { c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); return; }
  const ux = dx / len, uy = dy / len;
  const n = Math.max(3, Math.round(coils || 8)) * 2;
  const e = Math.min(len * 0.12, 10);
  c.beginPath();
  c.moveTo(ax, ay);
  c.lineTo(ax + ux * e, ay + uy * e);
  for (let i = 1; i < n; i++) {
    const d = e + (len - 2 * e) * i / n;
    const off = (i % 2 === 0 ? 1 : -1) * amp;
    c.lineTo(ax + ux * d - uy * off, ay + uy * d + ux * off);
  }
  c.lineTo(ax + ux * (len - e), ay + uy * (len - e));
  c.lineTo(bx, by);
  c.stroke();
}
// 读数（1~3 行小字）
function AN_READ(c, lines, x, y, size, color, align) {
  c.save();
  c.font = '600 ' + size.toFixed(1) + 'px system-ui,-apple-system,"Segoe UI",sans-serif';
  c.fillStyle = color;
  c.textAlign = align || 'right';
  c.textBaseline = 'top';
  const lh = size * 1.42;
  for (let i = 0; i < lines.length; i++) c.fillText(lines[i], x, y + i * lh);
  c.restore();
}
// 地面斜线阴影
function AN_GROUND(c, gx1, gx2, gy, size) {
  c.save();
  c.lineWidth = Math.max(1, (size || 3) * 0.85);
  c.beginPath(); c.moveTo(gx1, gy); c.lineTo(gx2, gy); c.stroke();
  c.lineWidth = Math.max(0.6, (size || 3) * 0.42);
  for (let x = gx1 + 4; x < gx2 - 2; x += 11) {
    c.beginPath(); c.moveTo(x, gy + 1); c.lineTo(x - 6, gy + 8); c.stroke();
  }
  c.restore();
}
// 斜线阴影（天花板/墙面，朝下或朝侧面）
function AN_HATCH(c, ax, ay, bx, by, nx, ny, size) {
  c.save();
  c.lineWidth = Math.max(1, (size || 3) * 0.85);
  c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
  c.lineWidth = Math.max(0.6, (size || 3) * 0.42);
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len, uy = (by - ay) / len;
  for (let d = 4; d < len - 2; d += 11) {
    const px = ax + ux * d, py = ay + uy * d;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px + nx * 7, py + ny * 7); c.stroke();
  }
  c.restore();
}

/* ==========================================================================
 * 1. 分类
 * ========================================================================== */
cat('basic',  '基础');
cat('mech',   '力学');
cat('wave',   '振动与波');
cat('optics', '光学');
cat('em',     '电磁');
cat('text',   '文字');
cat('sketch', '简笔画');
cat('anim',   '动画');


/* ==========================================================================
 * 2. 可调参数定义（同名参数只保留一份最终定义）
 *    注意：原文件中部分参数重复定义，此处保留最后一次生效的版本。
 * ========================================================================== */

/* ---- 基础几何 / 力学 ---- */
paramDef('a0',     { label: '起始角', min: -180, max: 180, step: 1, def: -90, unit: '°' });
paramDef('sweep',  { label: '张角',   min: 0,    max: 360, step: 1, def: 90,  unit: '°' });
paramDef('thick',  { label: '槽宽',   min: 2,    max: 80,  step: 1, def: 16 });
paramDef('coils',  { label: '圈数',   min: 2,    max: 30,  step: 1, def: 8 });
paramDef('paraP',  { label: '开口',   min: 1,    max: 5,   step: 0.1,  def: 2 });
paramDef('spiralT',{ label: '圈数',   min: 1,    max: 20,  step: 1,    def: 5 });
paramDef('cycR',   { label: '半径比', min: 0.2,  max: 1.5, step: 0.05, def: 1 });
paramDef('cycN',   { label: '拱数',   min: 1,    max: 8,   step: 1,    def: 3 });

/* ---- 网格 / 坐标系 ---- */
paramDef('step',   { label: '网格间距', min: 8, max: 200, step: 1, def: 40, unit: 'px' });

/* ---- 新增可调参数 ---- */
paramDef('amp',        { label: '振幅',   min: 0,    max: 1,    step: 0.05, def: 0.5 });
paramDef('tickGap',    { label: '刻度距', min: 4,    max: 40,   step: 1,    def: 10   });
paramDef('groundGap',  { label: '阴影距', min: 6,    max: 40,   step: 1,    def: 18   });
paramDef('chargeSign', { label: '电性',   min: 0,    max: 1,    step: 1,    def: 0    });
paramDef('axisTick',   { label: '刻度',   min: 0,    max: 1,    step: 1,    def: 1    });
paramDef('springAmp',  { label: '弹簧幅', min: 0.03, max: 0.25, step: 0.01, def: 0.09 });

paramDef('bowlPeriod', { label: '周期',     min: 0.3, max: 6,  step: 0.1, def: 1.6, unit: 's' });
paramDef('bowlAmp',    { label: '最大摆角', min: 0,   max: 90, step: 1,   def: 60,  unit: '°' });
paramDef('bowlBallR',  { label: '球半径',   min: 2,   max: 20, step: 0.5, def: 6 });

/* ---- 波动 ---- */
paramDef('cycles',   { label: '周期数', min: 0.5, max: 10,  step: 0.5,  def: 2 });
paramDef('phase',    { label: '相位',   min: 0,   max: 360, step: 5,    def: 0, unit: '°' });
paramDef('waveAxis', { label: '坐标轴', min: 0,   max: 1,   step: 1,    def: 1, unit: '0无1有' });

/* ---- 电磁 / 场 ---- */
paramDef('ringTheta0', { label: '初始摆角', min: 5,   max: 90,  step: 1,    def: 60,  unit: '°' });
paramDef('ringK',      { label: '质量比k',  min: 0.2, max: 8,   step: 0.1,  def: 2 });
paramDef('ringLen',    { label: '绳长比',   min: 0.3, max: 1.0, step: 0.05, def: 0.7 });
paramDef('ringPeriod', { label: '基准周期', min: 0.5, max: 4,   step: 0.1,  def: 1.5, unit: 's' });

/* ---- 光学 ---- */
paramDef('hue7',    { label: '颜色',     min: 0,   max: 6,  step: 1,    def: 0 });
paramDef('density', { label: '条纹密度', min: 3,   max: 30, step: 1,    def: 12 });
paramDef('distort', { label: '畸变强度', min: 0,   max: 100, step: 1,   def: 30, unit: '%' });

/* ==========================================================================
 * 3. 共用绘制片段
 * ========================================================================== */

/* 正多边形工厂 */
function polygonFactory(n) {
  return function (c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    const rx = b.w / 2, ry = b.h / 2;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n;
      const x = cx + rx * Math.cos(a);
      const y = cy + ry * Math.sin(a);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.22); c.fill(); }
    c.stroke();
  };
}

/* ==========================================================================
 * 4. 基础图形
 * ========================================================================== */

/* ---- 画笔（工具栏用，不出现在图形栏） ---- */
reg({
  key: 'pen', cat: 'basic', geom: 'path', label: '画笔', hidden: true,
  icon: '<path d="M16.6 3.4a2.1 2.1 0 0 1 3 3L8.2 17.8 4 19l1.2-4.2L16.6 3.4z"/>',
  draw(c, o) {
    if (o.points.length === 1) {
      const p = o.points[0];
      c.beginPath();
      c.arc(p.x, p.y, (o.size || 4) / 2, 0, Math.PI * 2);
      c.fillStyle = o.color;
      c.fill();
    } else {
      c.beginPath();
      o.points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
      c.stroke();
    }
  }
});

/* ---- 橡皮（工具栏用） ---- */
reg({
  key: 'eraser', cat: 'basic', geom: 'path', label: '橡皮', hidden: true,
  icon: '<path d="M8.5 20l-4.2-4.2a2 2 0 0 1 0-2.8l7.3-7.3a2 2 0 0 1 2.8 0l4.7 4.7a2 2 0 0 1 0 2.8L13.2 20H8.5z"/><path d="M20 20h-9"/>',
  draw(c, o) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    const w = Math.max(10, (o.size || 4) * 3);
    c.lineWidth = w;
    c.strokeStyle = 'rgba(0,0,0,1)';
    if (o.points.length === 1) {
      const p = o.points[0];
      c.beginPath();
      c.arc(p.x, p.y, w / 2, 0, Math.PI * 2);
      c.fillStyle = 'rgba(0,0,0,1)';
      c.fill();
    } else {
      c.beginPath();
      o.points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
      c.stroke();
    }
    c.restore();
  }
});

/* ---- 1. 实线段 ---- */
reg({
  key: 'line', cat: 'basic', geom: 'line', label: '实线段',
  icon: '<path d="M4 20L20 4"/>',
  draw(c, o) {
    c.save();
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(o.x1, o.y1);
    c.lineTo(o.x2, o.y2);
    c.stroke();
    c.restore();
  }
});

/* ---- 2. 虚线段 ---- */
reg({
  key: 'dashedLine', cat: 'basic', geom: 'line', label: '虚线段',
  icon: '<path d="M4 20L20 4" stroke-dasharray="3 3"/>',
  draw(c, o) {
    const lw = o.size || 4;
    c.save();
    c.setLineDash([lw * 2.6, lw * 2.2]);
    c.beginPath();
    c.moveTo(o.x1, o.y1);
    c.lineTo(o.x2, o.y2);
    c.stroke();
    c.restore();
  }
});

/* ---- 3. 箭头 ---- */
reg({
  key: 'arrow', cat: 'basic', geom: 'line', label: '箭头',
  icon: '<path d="M4 20L20 4"/><path d="M13 4h7v7"/>',
  draw(c, o, GH) {
    c.beginPath();
    c.moveTo(o.x1, o.y1);
    c.lineTo(o.x2, o.y2);
    c.stroke();
    GH.head(c, o.x1, o.y1, o.x2, o.y2, o.size || 4);
  }
});

/* ---- 4. 双箭头 ---- */
reg({
  key: 'dblArrow', cat: 'basic', geom: 'line', label: '双箭头',
  icon: '<path d="M4 12h16"/><path d="M7 9l-3 3 3 3"/><path d="M17 9l3 3-3 3"/>',
  draw(c, o, GH) {
    c.beginPath();
    c.moveTo(o.x1, o.y1);
    c.lineTo(o.x2, o.y2);
    c.stroke();
    GH.head(c, o.x1, o.y1, o.x2, o.y2, o.size || 4);
    GH.head(c, o.x2, o.y2, o.x1, o.y1, o.size || 4);
  }
});

/* ---- 5. 矩形 ---- */
reg({
  key: 'rect', cat: 'basic', geom: 'box', label: '矩形', fill: true,
  icon: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    c.beginPath();
    c.rect(b.x1, b.y1, b.w, b.h);
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.22); c.fill(); }
    c.stroke();
  }
});

/* ---- 圆角矩形 ---- */
reg({
  key: 'roundedRect', cat: 'basic', geom: 'box', label: '圆角矩形', fill: true,
  icon: '<rect x="4" y="6" width="16" height="12" rx="3"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const r = Math.min(b.w, b.h) * 0.18;
    c.beginPath();
    if (c.roundRect) {
      c.roundRect(b.x1, b.y1, b.w, b.h, r);
    } else {
      c.moveTo(b.x1 + r, b.y1);
      c.lineTo(b.x2 - r, b.y1);
      c.quadraticCurveTo(b.x2, b.y1, b.x2, b.y1 + r);
      c.lineTo(b.x2, b.y2 - r);
      c.quadraticCurveTo(b.x2, b.y2, b.x2 - r, b.y2);
      c.lineTo(b.x1 + r, b.y2);
      c.quadraticCurveTo(b.x1, b.y2, b.x1, b.y2 - r);
      c.lineTo(b.x1, b.y1 + r);
      c.quadraticCurveTo(b.x1, b.y1, b.x1 + r, b.y1);
      c.closePath();
    }
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.22); c.fill(); }
    c.stroke();
  }
});

/* ---- 6. 圆形 ---- */
reg({
  key: 'circle', cat: 'basic', geom: 'box', label: '圆形', fill: true,
  icon: '<circle cx="12" cy="12" r="8.5"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2;
    const cy = b.y1 + b.h / 2;
    const r = Math.min(b.w, b.h) / 2;
    c.beginPath();
    c.arc(cx, cy, Math.max(r, 0.1), 0, Math.PI * 2);
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.22); c.fill(); }
    c.stroke();
  }
});

/* ---- 6b. 椭圆 ---- */
reg({
  key: 'ellipse', cat: 'basic', geom: 'box', label: '椭圆', fill: true,
  icon: '<ellipse cx="12" cy="12" rx="8.5" ry="6"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    c.beginPath();
    c.ellipse(b.x1 + b.w / 2, b.y1 + b.h / 2,
              Math.max(b.w / 2, 0.1), Math.max(b.h / 2, 0.1), 0, 0, Math.PI * 2);
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.22); c.fill(); }
    c.stroke();
  }
});

/* ---- 7. 扇形 ---- */
reg({
  key: 'sector', cat: 'basic', geom: 'box', label: '扇形', fill: true,
  icon: '<path d="M6 18V7A11 11 0 0 1 17 18Z"/>',
  params: ['a0', 'sweep'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    const r = Math.min(b.w, b.h) / 2;
    const a0 = GH.deg(o.a0 ?? -90);
    const sw = GH.deg(o.sweep ?? 90);
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, Math.max(r, 1), a0, a0 + sw);
    c.closePath();
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.22); c.fill(); }
    c.stroke();
  }
});

reg({
  key: 'isoTriangle', cat: 'basic', geom: 'box', label: '等腰三角形', fill: true,
  icon: '<path d="M12 4l9 16H3z"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    c.beginPath();
    c.moveTo(b.x1 + b.w / 2, b.y1);
    c.lineTo(b.x1 + b.w, b.y1 + b.h);
    c.lineTo(b.x1, b.y1 + b.h);
    c.closePath();
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.22); c.fill(); }
    c.stroke();
  }
});

/* ---- 9. 直角三角形（方向随拖动自动判断） ---- */
reg({
  key: 'rightTriangle', cat: 'basic', geom: 'box', label: '直角三角形', fill: true,
  icon: '<path d="M4 4v16h16z"/>',
  draw(c, o, GH) {
    const b = GH.box(o);

    /* 根据原始起止点的水平位移判断倾角方向：
     *   o.x2 > o.x1（向右拖）→ 斜边朝右，直角在左下
     *   o.x2 < o.x1（向左拖）→ 斜边朝左，直角在右下
     *   水平位移过小（近乎竖直拖动）→ 默认斜边朝右 */
    const dx = (o.x2 ?? 0) - (o.x1 ?? 0);
    const flip = Math.abs(dx) > 1 ? (dx < 0 ? 1 : 0) : 0;

    c.beginPath();
    if (!flip) {
      c.moveTo(b.x1, b.y1);
      c.lineTo(b.x1, b.y2);
      c.lineTo(b.x2, b.y2);
    } else {
      c.moveTo(b.x2, b.y1);
      c.lineTo(b.x2, b.y2);
      c.lineTo(b.x1, b.y2);
    }
    c.closePath();
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.22); c.fill(); }
    c.stroke();
  }
});
/* ---- 10. 平行四边形 ---- */
paramDef('paraSkew', { label: '倾斜量', min: 0, max: 100, step: 1, def: 20, unit: '%' });
paramDef('paraDir',  { label: '倾斜方向', min: 0, max: 1, step: 1, def: 0, unit: '0左1右' });

reg({
  key: 'parallelogram', cat: 'basic', geom: 'box', label: '平行四边形', fill: true,
  icon: '<path d="M6 6h14l-4 12H2z"/>',
  params: ['paraSkew', 'paraDir'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const pct = Math.max(0, Math.min(100, o.paraSkew ?? 20));
    const offset = b.w * (pct / 100);
    const toRight = (o.paraDir ?? 0) < 0.5;

    c.beginPath();
    if (toRight) {
      c.moveTo(b.x1 + offset, b.y1);
      c.lineTo(b.x2, b.y1);
      c.lineTo(b.x2 - offset, b.y2);
      c.lineTo(b.x1, b.y2);
    } else {
      c.moveTo(b.x1, b.y1);
      c.lineTo(b.x2 - offset, b.y1);
      c.lineTo(b.x2, b.y2);
      c.lineTo(b.x1 + offset, b.y2);
    }
    c.closePath();
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.22); c.fill(); }
    c.stroke();
  }
});

/* ---- 11. 菱形 ---- */
reg({
  key: 'diamond', cat: 'basic', geom: 'box', label: '菱形', fill: true,
  icon: '<path d="M12 3l9 9-9 9-9-9z"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    c.beginPath();
    c.moveTo(cx, b.y1);
    c.lineTo(b.x2, cy);
    c.lineTo(cx, b.y2);
    c.lineTo(b.x1, cy);
    c.closePath();
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.22); c.fill(); }
    c.stroke();
  }
});

/* ---- 12. 梯形 ---- */
paramDef('trapTop',  { label: '上边宽度', min: 0, max: 100, step: 1, def: 70, unit: '%' });
paramDef('trapType', { label: '形状', min: 0, max: 2, step: 1, def: 1, unit: '——0左1等腰2右' });

reg({
  key: 'trapezoid', cat: 'basic', geom: 'box', label: '等腰梯形', fill: true,
  icon: '<path d="M6 6h12l3 12H3z"/>',
  params: ['trapTop', 'trapType'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const topW = b.w * (Math.max(0, Math.min(100, o.trapTop ?? 70)) / 100);
    const type = Math.round(o.trapType ?? 1);

    c.beginPath();
    if (type === 0) {
      c.moveTo(b.x1, b.y1);
      c.lineTo(b.x1 + topW, b.y1);
      c.lineTo(b.x2, b.y2);
      c.lineTo(b.x1, b.y2);
    } else if (type === 2) {
      c.moveTo(b.x2 - topW, b.y1);
      c.lineTo(b.x2, b.y1);
      c.lineTo(b.x2, b.y2);
      c.lineTo(b.x1, b.y2);
    } else {
      const inset = (b.w - topW) / 2;
      c.moveTo(b.x1 + inset, b.y1);
      c.lineTo(b.x2 - inset, b.y1);
      c.lineTo(b.x2, b.y2);
      c.lineTo(b.x1, b.y2);
    }
    c.closePath();
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.22); c.fill(); }
    c.stroke();
  }
});

/* ---- 13. 五边形 ---- */
reg({
  key: 'pentagon', cat: 'basic', geom: 'box', label: '五边形', fill: true,
  icon: '<path d="M12 3.5l8.5 6.2-3.2 10H6.7l-3.2-10z"/>',
  draw: polygonFactory(5)
});

/* ---- 14. 六边形 ---- */
reg({
  key: 'hexagon', cat: 'basic', geom: 'box', label: '六边形', fill: true,
  icon: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/>',
  draw: polygonFactory(6)
});

/* ---- 15. 半圆弧槽 ---- */
reg({
  key: 'halfArcSlot', cat: 'mech', geom: 'box', label: '半圆弧槽', fill: true,
  icon: '<path d="M3 5h3a6 6 0 0 0 12 0h3v14H3z"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const r  = Math.min(b.w / 2, b.h);
    const cx = b.x1 + b.w / 2;
    c.beginPath();
    c.moveTo(b.x1, b.y1);
    c.lineTo(cx - r, b.y1);
    c.arc(cx, b.y1, r, Math.PI, 0, true);
    c.lineTo(b.x2, b.y1);
    c.lineTo(b.x2, b.y2);
    c.lineTo(b.x1, b.y2);
    c.closePath();
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.15); c.fill(); }
    c.stroke();
  }
});

/* ---- 16. 四分之一圆弧槽 ---- */
reg({
  key: 'quarterArcSlot', cat: 'mech', geom: 'box', label: '四分之一圆弧槽', fill: true,
  icon: '<path d="M10 4h10v16H4V10a6 6 0 0 0 6-6z"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const r = Math.min(b.w, b.h);
    c.beginPath();
    c.moveTo(b.x1 + r, b.y1);
    c.lineTo(b.x2, b.y1);
    c.lineTo(b.x2, b.y2);
    c.lineTo(b.x1, b.y2);
    c.lineTo(b.x1, b.y1 + r);
    c.arc(b.x1, b.y1, r, Math.PI / 2, 0, true);
    c.closePath();
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.15); c.fill(); }
    c.stroke();
  }
});

/* ---- 17. 可调圆弧槽（增加退化兜底） ---- */
paramDef('arcSlotL', { label: '左圆心角', min: 0, max: 90, step: 1, def: 0,  unit: '°' });
paramDef('arcSlotR', { label: '右圆心角', min: 0, max: 90, step: 1, def: 60, unit: '°' });

reg({
  key: 'arcSlotVar', cat: 'mech', geom: 'box', label: '可调圆弧槽', fill: true,
  icon: '<path d="M3 20A19 19 0 0 0 19.45 10.5H21.45V20Z"/>',
  params: ['arcSlotL', 'arcSlotR'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const r = Math.min(b.w / 2, b.h);
    const cx = b.x1 + b.w / 2;
    const cy = b.y1;
    const aL = ((o.arcSlotL ?? 0)  * Math.PI) / 180;
    const aR = ((o.arcSlotR ?? 60) * Math.PI) / 180;
    const gap = Math.min(16, r * 0.5);

    const minX = cx;
    const minY = cy + r;

    /* 兜底：左右圆心角都接近 0 → 图形退化成一条水平线段，否则完全不可见 */
    if (aL < 0.005 && aR < 0.005) {
      c.beginPath();
      c.moveTo(b.x1, minY);
      c.lineTo(b.x2, minY);
      if (o.fill) { c.fillStyle = GH.tint(o.color, 0.15); c.fill(); }
      c.stroke();
      return;
    }

    c.beginPath();

    if (aR > 0.005) {
      const rightAngle = Math.PI / 2 - aR;
      const xR = cx + r * Math.cos(rightAngle);
      const yR = cy + r * Math.sin(rightAngle);

      c.moveTo(minX, minY);
      c.arc(cx, cy, r, Math.PI / 2, rightAngle, true);
      c.lineTo(xR + gap, yR);
      c.lineTo(xR + gap, cy + r);
      c.lineTo(minX, minY);
    }

    if (aL > 0.005) {
      const leftAngle = Math.PI / 2 + aL;
      const xL = cx + r * Math.cos(leftAngle);
      const yL = cy + r * Math.sin(leftAngle);

      c.moveTo(minX, minY);
      c.arc(cx, cy, r, Math.PI / 2, leftAngle, false);
      c.lineTo(xL - gap, yL);
      c.lineTo(xL - gap, cy + r);
      c.lineTo(minX, minY);
    }

    c.closePath();

    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.15); c.fill(); }
    c.stroke();
  }
});

/* ---- 18. 网格 ---- */
reg({
  key: 'grid', cat: 'basic', geom: 'box', label: '网格',
  icon: '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  params: ['step'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const step = Math.max(8, o.step ?? 40);
    c.save();
    c.lineWidth = Math.max(0.5, (o.size || 4) * 0.28);
    c.strokeStyle = GH.tint(o.color, 0.45);
    for (let x = b.x1; x <= b.x2 + 0.5; x += step) {
      c.beginPath(); c.moveTo(x, b.y1); c.lineTo(x, b.y2); c.stroke();
    }
    for (let y = b.y1; y <= b.y2 + 0.5; y += step) {
      c.beginPath(); c.moveTo(b.x1, y); c.lineTo(b.x2, y); c.stroke();
    }
    c.restore();
    c.strokeRect(b.x1, b.y1, b.w, b.h);
  }
});

/* ---- 直角坐标系 ---- */
paramDef('axisXDir',  { label: 'x 方向',     min: 0, max: 1,  step: 1, def: 0, unit: '0右1左' });
paramDef('axisYDir',  { label: 'y 方向',     min: 0, max: 1,  step: 1, def: 0, unit: '0上1下' });
paramDef('axisMajor', { label: '主网格',     min: 0, max: 20, step: 1, def: 0, unit: '格' });
paramDef('axisMinor', { label: '次网格等分', min: 0, max: 20, step: 1, def: 0, unit: '份' });

reg({
  key: 'axis', cat: 'mech', geom: 'box', label: '直角坐标系',
  icon: '<path d="M4 20V4M4 20h16"/><path d="M1 7l3-3 3 3"/><path d="M17 17l3 3-3 3"/>',
  params: ['axisXDir', 'axisYDir', 'axisMajor', 'axisMinor'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const xRight = (o.axisXDir ?? 0) < 0.5;
    const yUp    = (o.axisYDir ?? 0) < 0.5;

    const ox   = xRight ? b.x1 : b.x2;
    const oy   = yUp    ? b.y2 : b.y1;
    const xEnd = xRight ? b.x2 : b.x1;
    const yEnd = yUp    ? b.y1 : b.y2;

    const N = Math.max(0, Math.round(o.axisMajor ?? 0));
    const M = Math.max(0, Math.round(o.axisMinor ?? 0));

    const mainCells = N > 0 ? N : 1;
    const cw = b.w / mainCells;
    const ch = b.h / mainCells;

    if (N > 0) {
      c.save();
      c.lineWidth = Math.max(0.5, (o.size || 4) * 0.28);
      c.strokeStyle = GH.tint(o.color, 0.45);
      for (let i = 1; i < N; i++) {
        const x = b.x1 + i * cw;
        c.beginPath(); c.moveTo(x, b.y1); c.lineTo(x, b.y2); c.stroke();
        const y = b.y1 + i * ch;
        c.beginPath(); c.moveTo(b.x1, y); c.lineTo(b.x2, y); c.stroke();
      }
      c.restore();
    }

    if (M > 0) {
      c.save();
      c.setLineDash([3, 3]);
      c.lineWidth = Math.max(0.3, (o.size || 4) * 0.14);
      c.strokeStyle = GH.tint(o.color, 0.25);
      for (let i = 0; i < mainCells; i++) {
        for (let j = 1; j < M; j++) {
          const x = b.x1 + i * cw + (cw / M) * j;
          c.beginPath(); c.moveTo(x, b.y1); c.lineTo(x, b.y2); c.stroke();
          const y = b.y1 + i * ch + (ch / M) * j;
          c.beginPath(); c.moveTo(b.x1, y); c.lineTo(b.x2, y); c.stroke();
        }
      }
      c.restore();
    }

    c.beginPath();
    c.moveTo(ox, oy); c.lineTo(xEnd, oy);
    c.moveTo(ox, oy); c.lineTo(ox, yEnd);
    c.stroke();
    GH.head(c, ox, oy, xEnd, oy, o.size || 4);
    GH.head(c, ox, oy, ox, yEnd, o.size || 4);

    const step = 40;
    const tick = 5;
    c.save();
    c.lineWidth = Math.max(0.6, (o.size || 4) * 0.4);

    const tickYDir = yUp ? 1 : -1;
    for (let d = step; d < b.w - 4; d += step) {
      const x = xRight ? ox + d : ox - d;
      c.beginPath();
      c.moveTo(x, oy);
      c.lineTo(x, oy + tick * tickYDir);
      c.stroke();
    }

    const tickXDir = xRight ? 1 : -1;
    for (let d = step; d < b.h - 4; d += step) {
      const y = yUp ? oy - d : oy + d;
      c.beginPath();
      c.moveTo(ox, y);
      c.lineTo(ox + tick * tickXDir, y);
      c.stroke();
    }
    c.restore();
  }
});


/* ==========================================================================
 * 5. 力学
 * ========================================================================== */



/* ---- 滑轮 ---- */
reg({
  key: 'pulley', cat: 'mech', geom: 'box', label: '滑轮', fill: true,
  icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    const r = Math.min(b.w, b.h) / 2;
    c.beginPath();
    c.arc(cx, cy, Math.max(r, 1), 0, Math.PI * 2);
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.12); c.fill(); }
    c.stroke();
    c.beginPath();
    c.arc(cx, cy, Math.max(2, r * 0.12), 0, Math.PI * 2);
    c.fillStyle = o.color;
    c.fill();
  }
});

/* ---- 弹簧 ---- */
reg({
  key: 'spring', cat: 'mech', geom: 'line', label: '弹簧',
  icon: '<path d="M2 12h2.5l1.5-4 3 8 3-8 3 8 1.5-4H21"/>',
  params: ['coils', 'springAmp'],
  draw(c, o) {
    const x1 = o.x1, y1 = o.y1, x2 = o.x2, y2 = o.y2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); return; }
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const coils = Math.max(2, o.coils ?? 8);
    const ampFrac = Math.max(0.03, Math.min(0.25, o.springAmp ?? 0.09));
    const amp = Math.min(20, len * ampFrac);
    const endFrac = 0.08;
    const s0 = len * endFrac, s1 = len * (1 - endFrac);
    const segs = coils * 16;

    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x1 + ux * s0, y1 + uy * s0);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const s = s0 + (s1 - s0) * t;
      const off = Math.sin(t * coils * Math.PI * 2) * amp;
      c.lineTo(x1 + ux * s + nx * off, y1 + uy * s + ny * off);
    }
    c.lineTo(x2, y2);
    c.stroke();
  }
});

/* ---- 单摆 ---- */
/* ---- 单摆（大摆角精确解：θ = 2asin(k·sn(K−ωt,k))） ---- */

reg({
  key: 'pendulum', cat: 'mech', geom: 'line', label: '单摆',
  icon: '<path d="M12 3v13"/><circle cx="12" cy="18" r="3"/>',
  draw(c, o, GH) {
    c.beginPath();
    c.moveTo(o.x1, o.y1);
    c.lineTo(o.x2, o.y2);
    c.stroke();
    c.beginPath();
    c.arc(o.x1, o.y1, Math.max(3, (o.size || 4) * 1.2), 0, Math.PI * 2);
    c.fillStyle = o.color;
    c.fill();
    const r = Math.max(6, (o.size || 4) * 2.2);
    c.beginPath();
    c.arc(o.x2, o.y2, r, 0, Math.PI * 2);
    c.fillStyle = GH.tint(o.color, 0.55);
    c.fill();
    c.stroke();
  }
});

/* ---- 小车 ---- */
reg({
  key: 'cart', cat: 'mech', geom: 'box', label: '小车', fill: true,
  icon: '<rect x="4" y="9" width="16" height="8" rx="1"/><circle cx="8" cy="19" r="2"/><circle cx="16" cy="19" r="2"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const bodyH = b.h * 0.6;
    const bodyY = b.y1 + b.h - bodyH - b.h * 0.18;
    c.beginPath();
    c.rect(b.x1, bodyY, b.w, bodyH);
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.2); c.fill(); }
    c.stroke();
    const wr = b.h * 0.16;
    const wy = b.y1 + b.h - wr;
    c.beginPath(); c.arc(b.x1 + b.w * 0.25, wy, wr, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(b.x1 + b.w * 0.75, wy, wr, 0, Math.PI * 2); c.stroke();
  }
});

/* ---- 小球 ---- */
reg({
  key: 'ball', cat: 'mech', geom: 'box', label: '小球', fill: true,
  icon: '<circle cx="12" cy="12" r="8"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    const r = Math.min(b.w, b.h) / 2;
    c.beginPath();
    c.arc(cx, cy, Math.max(r, 1), 0, Math.PI * 2);
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.2); c.fill(); }
    c.stroke();
  }
});

/* ---- 地面 ---- */
paramDef('groundUp', { label: '锯齿方向', min: 0, max: 1, step: 1, def: 0, unit: '0下1上' });

reg({
  key: 'ground', cat: 'mech', geom: 'line', label: '地面',
  icon: '<path d="M3 15h18"/><path d="M5 15l-2 4M9 15l-2 4M13 15l-2 4M17 15l-2 4M21 15l-2 4"/>',
  params: ['groundGap', 'groundUp'],
  draw(c, o) {
    c.beginPath();
    c.moveTo(o.x1, o.y1);
    c.lineTo(o.x2, o.y2);
    c.stroke();

    const dx = o.x2 - o.x1, dy = o.y2 - o.y1;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;
    const ux = dx / len, uy = dy / len;
    let nx = -uy, ny = ux;
    const up = (o.groundUp ?? 0) >= 0.5;
    if (up ? ny > 0 : ny < 0) { nx = -nx; ny = -ny; }
    const tickLen = 10;
    const spacing = Math.max(6, o.groundGap ?? 18);

    c.save();
    c.lineWidth = Math.max(0.7, (o.size || 4) * 0.5);
    for (let s = 0; s <= len; s += spacing) {
      const px = o.x1 + ux * s;
      const py = o.y1 + uy * s;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(px + nx * tickLen - ux * tickLen * 0.5,
               py + ny * tickLen - uy * tickLen * 0.5);
      c.stroke();
    }
    c.restore();
  }
});

/* ---- 斜面（可调倾角 / 大小 / 线宽 / 颜色 / 线型 / 填充） ----
 * 对照作者给的「斜面-可调参.html」逐条映射：倾角、大小、线宽、颜色、线型、填充比例。
 * 原页只有「动摩擦因数 μ」用来把 θ 标签在 tanθ>μ 时染红 —— 按需求不带过来（不设 μ 参数、不染红）。
 * 几何全部落在用户框里：地面在框底上方留一条斜纹的高度，三角形的底边/顶点都由框反推，
 * 所以包围盒（量尺）自然贴着框，选中虚线框不会浮在图形外面。
 */
paramDef('inclineTheta', { label: '倾角', min: 5, max: 70, step: 1, def: 30, unit: '°' });
paramDef('inclineSize', { label: '大小', min: 0.4, max: 1, step: 0.01, def: 0.78 });

reg({
  key: 'incline', cat: 'mech', geom: 'box', label: '斜面', fill: true,
  icon: '<path d="M3 19h18L3 6z"/><path d="M15 19v-4h4"/>',
  params: ['inclineTheta', 'inclineSize'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const lw = Math.max(1, o.size || 3);
    const th = Math.max(0.03, Math.min(1.35, (o.inclineTheta ?? 30) * Math.PI / 180));
    const f = Math.max(0.15, Math.min(1, o.inclineSize ?? 0.78));
    const tick = Math.max(8, Math.min(18, lw * 3.4));      // 地面斜纹的长度：斜纹只往下走这么多，正好留在框里
    const gy = b.y2 - tick;
    let bs = Math.max(12, b.w * f);
    let hgt = bs * Math.tan(th);
    const hmax = Math.max(12, gy - b.y1);
    if (hgt > hmax) { hgt = hmax; bs = hgt / Math.tan(th); }
    const ax = b.x1 + (b.w - bs) / 2;                      // 左下锐角顶点
    const bx = ax + bs;                                    // 右下直角顶点
    const ty = gy - hgt;                                   // 上方顶点
    // 地面线
    c.beginPath(); c.moveTo(b.x1, gy); c.lineTo(b.x2, gy); c.stroke();
    // 地面斜纹（左下 45°，浅一档）
    c.save();
    c.strokeStyle = GH.alpha(o.color, 0.45);
    c.lineWidth = Math.max(1, lw * 0.5);
    const gap = Math.max(10, lw * 3.6);
    for (let x = b.x1 + gap; x <= b.x2 - gap + 0.01; x += gap) {
      c.beginPath(); c.moveTo(x, gy + 1); c.lineTo(x - tick, gy + 1 + tick); c.stroke();
    }
    c.restore();
    // 三角形本体：先填充再描边（填充比例由样式段的「填充」滑块给）
    c.beginPath(); c.moveTo(ax, gy); c.lineTo(bx, gy); c.lineTo(bx, ty); c.closePath();
    if (o.fill) { c.fillStyle = GH.tint(o.color, o.fillAlpha ?? 0.22); c.fill(); }
    c.stroke();
    // 直角标记
    const m = Math.max(6, Math.min(bs * 0.08, lw * 3.2));
    c.save();
    c.strokeStyle = GH.alpha(o.color, 0.7);
    c.lineWidth = Math.max(1, lw * 0.45);
    c.beginPath(); c.moveTo(bx - m, gy); c.lineTo(bx - m, gy - m); c.lineTo(bx, gy - m); c.stroke();
    c.restore();
    // θ 圆弧 + 度数标签
    const r = Math.max(8, Math.min(bs * 0.28, hgt * 0.6, b.w * 0.2));
    c.save();
    c.strokeStyle = GH.alpha(o.color, 0.85);
    c.lineWidth = Math.max(1.2, lw * 0.55);
    c.beginPath(); c.arc(ax, gy, r, 0, -th, true); c.stroke();
    c.restore();
    const deg = Math.round(o.inclineTheta ?? 30);
    const fz = Math.max(10, Math.min(20, Math.min(bs, hgt) * 0.09 + 7));
    const mid = -th / 2;
    const lx = ax + Math.cos(mid) * (r + fz * 1.1);
    const ly = Math.min(gy - fz, gy + Math.sin(mid) * (r + fz * 1.1));
    c.save();
    c.font = fz.toFixed(1) + 'px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = GH.alpha(o.color, 0.9);
    c.fillText('θ = ' + deg + '°', lx, ly);
    c.restore();
  }
});

/* ---- 传送带 ---- */
/* ---- 传送带（可调带速 / 摩擦因数 / 初速 / 质量） ---- */

reg({
  key: 'conveyor', cat: 'mech', geom: 'box', label: '传送带', fill: true,
  icon: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/>' +
        '<path d="M6 9h12M6 15h12"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cy = (b.y1 + b.y2) / 2;
    const R = Math.max(4, Math.min(b.h / 2, b.w / 4));
    const cx1 = b.x1 + R;
    const cx2 = b.x2 - R;

    c.beginPath();
    c.moveTo(cx1, cy - R);
    c.lineTo(cx2, cy - R);
    c.moveTo(cx1, cy + R);
    c.lineTo(cx2, cy + R);
    c.stroke();

    c.beginPath();
    c.moveTo(cx1 + R, cy);
    c.arc(cx1, cy, R, 0, Math.PI * 2);
    c.moveTo(cx2 + R, cy);
    c.arc(cx2, cy, R, 0, Math.PI * 2);
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.18); c.fill(); }
    c.stroke();
  }
});

/* ---- 铁轨截面 ---- */
reg({
  key: 'railCross', cat: 'mech', geom: 'box', label: '铁轨截面',
  icon: '<rect x="3" y="2" width="4" height="8"/>' +
        '<rect x="17" y="2" width="4" height="8"/>' +
        '<rect x="1" y="10" width="22" height="3"/>' +
        '<path d="M3 13h18l2 7H1z"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const { x1, y1, x2, y2, w, h } = b;

    const railTopY   = y1;
    const railBotY   = y1 + h * 0.40;
    const sleeperTop = y1 + h * 0.38;
    const sleeperBot = y1 + h * 0.58;
    const ballastTop = y1 + h * 0.52;
    const ballastBot = y2;

    const btInset = w * 0.10;
    const bbInset = w * 0.02;
    c.beginPath();
    c.moveTo(x1 + btInset, ballastTop);
    c.lineTo(x2 - btInset, ballastTop);
    c.lineTo(x2 - bbInset, ballastBot);
    c.lineTo(x1 + bbInset, ballastBot);
    c.closePath();
    c.fillStyle = 'rgba(161,136,127,0.35)';
    c.fill();
    c.stroke();

    c.save();
    c.fillStyle = 'rgba(120,100,95,0.45)';
    const ballastH = ballastBot - ballastTop;
    const dotCount = 36;
    for (let i = 0; i < dotCount; i++) {
      const s1 = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
      const s2 = Math.sin(i * 78.2330 + 1.2345) * 43758.5453;
      const rx = s1 - Math.floor(s1);
      const ry = s2 - Math.floor(s2);
      const yFrac = ry;
      const leftX  = x1 + btInset + (bbInset - btInset) * yFrac;
      const rightX = x2 - btInset - (bbInset - btInset) * yFrac;
      const px = leftX + rx * (rightX - leftX);
      const py = ballastTop + 4 + ry * (ballastH - 8);
      c.beginPath();
      c.arc(px, py, 1.3, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();

    const slInset = w * 0.06;
    c.beginPath();
    c.rect(x1 + slInset, sleeperTop, w - slInset * 2, sleeperBot - sleeperTop);
    c.fillStyle = 'rgba(141,110,99,0.75)';
    c.fill();
    c.stroke();

    const railW    = w * 0.09;
    const railPos  = [x1 + w * 0.28, x1 + w * 0.72];
    const railTotH = railBotY - railTopY;
    const headH = railTotH * 0.30;
    const webH  = railTotH * 0.40;
    const footH = railTotH * 0.30;
    const footW = railW * 1.15;

    railPos.forEach(rxc => {
      c.beginPath();
      c.rect(rxc - railW / 2, railTopY, railW, headH);
      c.fillStyle = '#9e9e9e';
      c.fill();
      c.stroke();

      const webW = railW * 0.35;
      c.beginPath();
      c.rect(rxc - webW / 2, railTopY + headH, webW, webH);
      c.fillStyle = '#bdbdbd';
      c.fill();
      c.stroke();

      c.beginPath();
      c.rect(rxc - footW / 2, railTopY + headH + webH, footW, footH);
      c.fillStyle = '#9e9e9e';
      c.fill();
      c.stroke();
    });
  }
});


/* ==========================================================================
 * 6. 波动
 * ========================================================================== */

/* 波形采样：t ∈ [0,1]，返回 [-1, 1] */
function waveValue(type, t, cycles, phase) {
  const arg = 2 * Math.PI * cycles * t + phase;
  switch (type) {
    case 'sine':
      return Math.sin(arg);

    case 'square':
      return Math.sin(arg) >= 0 ? 1 : -1;

    case 'tri': {
      let p = arg / (2 * Math.PI);
      p = p - Math.floor(p);
      if (p < 0.25) return 4 * p;
      if (p < 0.75) return 2 - 4 * p;
      return 4 * p - 4;
    }

    case 'saw': {
      let p = arg / (2 * Math.PI);
      p = p - Math.floor(p);
      return 2 * p - 1;
    }

    case 'half': {
      const s = Math.sin(arg);
      return s > 0 ? s : 0;
    }

    case 'full':
      return Math.abs(Math.sin(arg));

    case 'standing':
      return Math.sin(arg) * Math.abs(Math.sin(Math.PI * t));

    case 'damped': {
      const env = Math.exp(-3 * t);
      return Math.sin(arg) * env;
    }

    case 'am': {
      const carrier = Math.sin(arg);
      const env = 0.6 + 0.4 * Math.sin(2 * Math.PI * 2 * t);
      return carrier * env;
    }

    case 'beat': {
      const f1 = cycles - 0.5;
      const f2 = cycles + 0.5;
      return 0.5 * (Math.sin(2 * Math.PI * f1 * t + phase)
                  + Math.sin(2 * Math.PI * f2 * t + phase));
    }

    case 'pulse': {
      const center = 0.5;
      const w = 0.15;
      const g = Math.exp(-Math.pow(t - center, 2) / (2 * w * w));
      const carrier = Math.cos(2 * Math.PI * cycles * (t - center) + phase);
      return g * carrier;
    }

    default:
      return Math.sin(arg);
  }
}

function makeWaveDrawer(type) {
  return function (c, o, GH) {
    const b = GH.box(o);
    const cycles   = Math.max(0.5, o.cycles ?? 2);
    const ampFrac  = Math.max(0, Math.min(1, o.amp ?? 0.5));
    const phase    = ((o.phase ?? 0) * Math.PI) / 180;
    const showAxis = (o.waveAxis ?? 1) >= 0.5;

    const padX = b.w * 0.06;
    const padY = b.h * 0.10;
    const cy   = (b.y1 + b.y2) / 2;
    const amp  = (b.h / 2 - padY) * ampFrac;

    const axX   = b.x1 + padX;
    const left  = axX;
    const right = b.x2 - padX;

    if (showAxis) {
      const axTop   = b.y1 + padY * 0.4;
      const axRight = b.x2 - padX * 0.4;

      c.beginPath();
      c.moveTo(axX, b.y2 - padY * 0.4);
      c.lineTo(axX, axTop);
      c.stroke();
      GH.head(c, axX, b.y2 - padY * 0.4, axX, axTop, o.size || 4);

      c.beginPath();
      c.moveTo(axX, cy);
      c.lineTo(axRight, cy);
      c.stroke();
      GH.head(c, axX, cy, axRight, cy, o.size || 4);
    }

    const N = Math.max(160, Math.round(b.w * 1.4));
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = left + (right - left) * t;
      const s = waveValue(type, t, cycles, phase);
      const y = cy - amp * s;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  };
}

/* ===== 周期波 ===== */
reg({
  key: 'sine', cat: 'wave', geom: 'box', label: '正弦波', fill: false,
  icon: '<path d="M2 12q3-8 6 0t6 0t6 0"/>',
  params: ['cycles', 'amp', 'phase', 'waveAxis'],
  draw: makeWaveDrawer('sine')
});

reg({
  key: 'square', cat: 'wave', geom: 'box', label: '方波', fill: false,
  icon: '<path d="M3 16V8h6v8h6V8h6"/>',
  params: ['cycles', 'amp', 'phase', 'waveAxis'],
  draw: makeWaveDrawer('square')
});

reg({
  key: 'triWave', cat: 'wave', geom: 'box', label: '三角波', fill: false,
  icon: '<path d="M3 16l3-8 3 8 3-8 3 8 3-8 3 8"/>',
  params: ['cycles', 'amp', 'phase', 'waveAxis'],
  draw: makeWaveDrawer('tri')
});

reg({
  key: 'sawWave', cat: 'wave', geom: 'box', label: '锯齿波', fill: false,
  icon: '<path d="M2 16l6-8v8l6-8v8l6-8"/>',
  params: ['cycles', 'amp', 'phase', 'waveAxis'],
  draw: makeWaveDrawer('saw')
});

/* ===== 整流 ===== */
reg({
  key: 'halfRect', cat: 'wave', geom: 'box', label: '半波整流', fill: false,
  icon: '<path d="M2 16q3-8 6 0h2q3-8 6 0h2"/>',
  params: ['cycles', 'amp', 'phase', 'waveAxis'],
  draw: makeWaveDrawer('half')
});

reg({
  key: 'fullRect', cat: 'wave', geom: 'box', label: '全波整流', fill: false,
  icon: '<path d="M2 16q3-8 6 0q3-8 6 0q3-8 6 0"/>',
  params: ['cycles', 'amp', 'phase', 'waveAxis'],
  draw: makeWaveDrawer('full')
});

/* ===== 振动 ===== */
reg({
  key: 'standing', cat: 'wave', geom: 'box', label: '驻波', fill: false,
  icon: '<path d="M3 12q3-6 6 0t6 0t6 0"/>',
  params: ['cycles', 'amp', 'phase', 'waveAxis'],
  draw: makeWaveDrawer('standing')
});

reg({
  key: 'dampedWave', cat: 'wave', geom: 'box', label: '阻尼振荡', fill: false,
  icon: '<path d="M2 12q2-7 4 0q2 7 4 0q2-5 4 0q2 5 4 0q2-3 4 0"/>',
  params: ['cycles', 'amp', 'phase', 'waveAxis'],
  draw: makeWaveDrawer('damped')
});

/* ===== 调制 ===== */
reg({
  key: 'amWave', cat: 'wave', geom: 'box', label: '调幅波', fill: false,
  icon: '<path d="M2 12q2-5 4 0q2-9 5 0q2-9 5 0q2 9 5 0q2 5 4 0"/>',
  params: ['cycles', 'amp', 'phase', 'waveAxis'],
  draw: makeWaveDrawer('am')
});

reg({
  key: 'beatWave', cat: 'wave', geom: 'box', label: '拍', fill: false,
  icon: '<path d="M2 12q2-4 3 0q2 4 3 0q2-8 4 0q2 8 4 0q2-4 3 0"/>',
  params: ['cycles', 'amp', 'phase', 'waveAxis'],
  draw: makeWaveDrawer('beat')
});

/* ===== 脉冲 ===== */
reg({
  key: 'pulse', cat: 'wave', geom: 'box', label: '脉冲波', fill: false,
  icon: '<path d="M2 16q5-14 10 0h10"/>',
  params: ['cycles', 'amp', 'phase', 'waveAxis'],
  draw: makeWaveDrawer('pulse')
});


/* ==========================================================================
 * 7. 水波（含干涉、3D）
 * ========================================================================== */

function plotHyperbola(c, cx, cy, d, lambda, k, extend) {
  const a = Math.abs(k) * lambda / 2;
  if (a >= d) return;

  if (a < 1e-6) {
    c.beginPath();
    c.moveTo(cx, cy - extend);
    c.lineTo(cx, cy + extend);
    c.stroke();
    return;
  }

  const b = Math.sqrt(d * d - a * a);
  const sign = k >= 0 ? 1 : -1;
  const tMax = Math.asinh(extend / b);
  const N = 60;

  c.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = -tMax + (2 * tMax) * i / N;
    const px = sign * a * Math.cosh(t);
    const py = b * Math.sinh(t);
    if (i === 0) c.moveTo(cx + px, cy + py);
    else c.lineTo(cx + px, cy + py);
  }
  c.stroke();
}

paramDef('rippleCount', { label: '波纹数', min: 2, max: 12, step: 1, def: 6 });

reg({
  key: 'waterTop', cat: 'wave', geom: 'box', label: '水波（俯视）', fill: false,
  icon: '<circle cx="12" cy="12" r="2" fill="currentColor"/>' +
        '<circle cx="12" cy="12" r="5"/>' +
        '<circle cx="12" cy="12" r="8"/>' +
        '<circle cx="12" cy="12" r="11"/>',
  params: ['rippleCount'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2;
    const cy = b.y1 + b.h / 2;
    const maxR = Math.max(b.w, b.h) * 0.75;
    const count = Math.max(2, Math.round(o.rippleCount ?? 6));
    const gap = maxR / count;

    c.save();
    c.beginPath();
    c.rect(b.x1, b.y1, b.w, b.h);
    c.clip();
    c.lineWidth = Math.max(0.8, (o.size || 4) * 0.5);

    for (let i = 0; i < count; i++) {
      const r = gap * (i + 1);
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.setLineDash(i % 2 === 0 ? [] : [5, 5]);
      c.stroke();
    }
    c.setLineDash([]);
    c.restore();

    c.beginPath();
    c.arc(cx, cy, Math.max(2, (o.size || 4) * 0.8), 0, Math.PI * 2);
    c.fillStyle = o.color;
    c.fill();
  }
});

paramDef('srcSep',    { label: '波源间距', min: 5, max: 80, step: 1, def: 30, unit: '%' });
paramDef('phaseInv',  { label: '相位',     min: 0, max: 1,  step: 1, def: 0, unit: '0同1反' });
paramDef('showNodes', { label: '干涉线',   min: 0, max: 1,  step: 1, def: 1 });

reg({
  key: 'waterInterf', cat: 'wave', geom: 'box', label: '水波干涉（俯视）', fill: false,
  icon: '<circle cx="9" cy="12" r="1.5" fill="currentColor"/>' +
        '<circle cx="15" cy="12" r="1.5" fill="currentColor"/>' +
        '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>' +
        '<circle cx="9" cy="12" r="9"/><circle cx="15" cy="12" r="9"/>',
  params: ['rippleCount', 'srcSep', 'phaseInv', 'showNodes'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2;
    const cy = b.y1 + b.h / 2;
    const count = Math.max(2, Math.round(o.rippleCount ?? 6));
    const sepFrac = Math.max(0.05, Math.min(0.8, (o.srcSep ?? 30) / 100));
    const d = Math.min(b.w, b.h) * sepFrac / 2;
    const maxR = Math.hypot(b.w, b.h) * 0.7;
    const gap = maxR / count;
    const inv = (o.phaseInv ?? 0) >= 0.5;
    const showNodes = (o.showNodes ?? 1) >= 0.5;

    const s1 = { x: cx - d, y: cy };
    const s2 = { x: cx + d, y: cy };

    c.save();
    c.beginPath();
    c.rect(b.x1, b.y1, b.w, b.h);
    c.clip();

    c.lineWidth = Math.max(0.7, (o.size || 4) * 0.4);
    for (let i = 0; i < count; i++) {
      const r = gap * (i + 1);
      c.beginPath();
      c.arc(s1.x, s1.y, r, 0, Math.PI * 2);
      c.setLineDash(i % 2 === 0 ? [] : [5, 5]);
      c.stroke();
    }

    for (let i = 0; i < count; i++) {
      const r = gap * (i + 1);
      c.beginPath();
      c.arc(s2.x, s2.y, r, 0, Math.PI * 2);
      const isCrest = (i % 2 === 0) !== inv;
      c.setLineDash(isCrest ? [] : [5, 5]);
      c.stroke();
    }

    if (showNodes) {
      c.save();
      const extend = Math.max(b.w, b.h) * 0.8;
      const maxN = Math.min(15, Math.ceil(2 * d / gap));

      for (let n = -maxN; n <= maxN; n++) {
        const kC = inv ? n + 0.5 : n;
        c.strokeStyle = GH.tint(o.color, 0.55);
        c.lineWidth = Math.max(1, (o.size || 4) * 0.55);
        c.setLineDash([]);
        plotHyperbola(c, cx, cy, d, gap, kC, extend);

        const kD = inv ? n : n + 0.5;
        c.strokeStyle = GH.tint(o.color, 0.3);
        c.lineWidth = Math.max(0.6, (o.size || 4) * 0.3);
        c.setLineDash([4, 4]);
        plotHyperbola(c, cx, cy, d, gap, kD, extend);
      }
      c.restore();
    }

    c.setLineDash([]);
    c.restore();

    [s1, s2].forEach(s => {
      c.beginPath();
      c.arc(s.x, s.y, Math.max(2.5, (o.size || 4) * 1), 0, Math.PI * 2);
      c.fillStyle = o.color;
      c.fill();
    });
  }
});

paramDef('tilt', { label: '视角', min: 25, max: 85, step: 1, def: 60, unit: '°' });

reg({
  key: 'water3D', cat: 'wave', geom: 'box', label: '水波（3D）', fill: false,
  icon: '<ellipse cx="12" cy="13" rx="10" ry="6"/>' +
        '<ellipse cx="12" cy="13" rx="6" ry="3.5"/>' +
        '<ellipse cx="12" cy="13" rx="2" ry="1.2"/>',
  params: ['tilt', 'rippleCount'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2;
    const cy = b.y1 + b.h / 2;
    const tiltDeg = Math.max(25, Math.min(85, o.tilt ?? 60));
    const tilt = tiltDeg * Math.PI / 180;
    const count = Math.max(2, Math.round(o.rippleCount ?? 5));

    const scaleX = b.w / 2 * 0.92;
    const scaleY = b.h / 2 * 0.92;
    const scaleZ = Math.min(b.w, b.h) / 2 * 0.75;
    const sinT = Math.sin(tilt);
    const cosT = Math.cos(tilt);

    function project(x, y, z) {
      return {
        sx: cx + x * scaleX,
        sy: cy - y * scaleY * sinT - z * scaleZ * cosT
      };
    }

    function waveZ(x, y) {
      const r = Math.hypot(x, y);
      return Math.cos(Math.PI * count * r) * Math.exp(-r * 1.2);
    }

    const N = 72;
    const cells = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x0 = -1 + 2 * i / N;
        const x1 = -1 + 2 * (i + 1) / N;
        const y0 = -1 + 2 * j / N;
        const y1 = -1 + 2 * (j + 1) / N;
        const z00 = waveZ(x0, y0);
        const z10 = waveZ(x1, y0);
        const z11 = waveZ(x1, y1);
        const z01 = waveZ(x0, y1);
        cells.push({
          x0, x1, y0, y1, z00, z10, z11, z01,
          zAvg: (z00 + z10 + z11 + z01) / 4,
          yAvg: (y0 + y1) / 2
        });
      }
    }
    cells.sort((a, b) => b.yAvg - a.yAvg);

    c.save();
    c.lineJoin = 'round';
    for (const cell of cells) {
      const p00 = project(cell.x0, cell.y0, cell.z00);
      const p10 = project(cell.x1, cell.y0, cell.z10);
      const p11 = project(cell.x1, cell.y1, cell.z11);
      const p01 = project(cell.x0, cell.y1, cell.z01);

      c.beginPath();
      c.moveTo(p00.sx, p00.sy);
      c.lineTo(p10.sx, p10.sy);
      c.lineTo(p11.sx, p11.sy);
      c.lineTo(p01.sx, p01.sy);
      c.closePath();

      const h = Math.max(0, Math.min(1, (cell.zAvg + 1) / 2));
      const lum = 38 + 54 * h;
      const col = `hsl(210, 70%, ${lum}%)`;
      c.fillStyle = col;
      c.strokeStyle = col;
      c.lineWidth = 0.6;
      c.fill();
      c.stroke();
    }
    c.restore();
  }
});

reg({
  key: 'waterInterf3D', cat: 'wave', geom: 'box', label: '水波干涉（3D）', fill: false,
  icon: '<ellipse cx="9"  cy="13" rx="5" ry="3"/>' +
        '<ellipse cx="15" cy="13" rx="5" ry="3"/>' +
        '<ellipse cx="12" cy="13" rx="10" ry="6"/>',
  params: ['tilt', 'rippleCount', 'srcSep', 'phaseInv'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2;
    const cy = b.y1 + b.h / 2;
    const tiltDeg = Math.max(25, Math.min(85, o.tilt ?? 60));
    const tilt = tiltDeg * Math.PI / 180;
    const count = Math.max(2, Math.round(o.rippleCount ?? 5));
    const sepFrac = Math.max(0.05, Math.min(0.8, (o.srcSep ?? 30) / 100));
    const inv = (o.phaseInv ?? 0) >= 0.5;

    const scaleX = b.w / 2 * 0.92;
    const scaleY = b.h / 2 * 0.92;
    const scaleZ = Math.min(b.w, b.h) / 2 * 0.75;
    const sinT = Math.sin(tilt);
    const cosT = Math.cos(tilt);

    function project(x, y, z) {
      return {
        sx: cx + x * scaleX,
        sy: cy - y * scaleY * sinT - z * scaleZ * cosT
      };
    }

    const sx1 = -sepFrac / 2;
    const sx2 =  sepFrac / 2;
    const phase2 = inv ? Math.PI : 0;

    function waveZ(x, y) {
      const r1 = Math.hypot(x - sx1, y);
      const r2 = Math.hypot(x - sx2, y);
      const w1 = Math.cos(Math.PI * count * r1) * Math.exp(-r1 * 0.9);
      const w2 = Math.cos(Math.PI * count * r2 + phase2) * Math.exp(-r2 * 0.9);
      return (w1 + w2) / 2;
    }

    const N = 80;
    const cells = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x0 = -1 + 2 * i / N;
        const x1 = -1 + 2 * (i + 1) / N;
        const y0 = -1 + 2 * j / N;
        const y1 = -1 + 2 * (j + 1) / N;
        const z00 = waveZ(x0, y0);
        const z10 = waveZ(x1, y0);
        const z11 = waveZ(x1, y1);
        const z01 = waveZ(x0, y1);
        cells.push({
          x0, x1, y0, y1, z00, z10, z11, z01,
          zAvg: (z00 + z10 + z11 + z01) / 4,
          yAvg: (y0 + y1) / 2
        });
      }
    }
    cells.sort((a, b) => b.yAvg - a.yAvg);

    c.save();
    c.lineJoin = 'round';
    for (const cell of cells) {
      const p00 = project(cell.x0, cell.y0, cell.z00);
      const p10 = project(cell.x1, cell.y0, cell.z10);
      const p11 = project(cell.x1, cell.y1, cell.z11);
      const p01 = project(cell.x0, cell.y1, cell.z01);

      c.beginPath();
      c.moveTo(p00.sx, p00.sy);
      c.lineTo(p10.sx, p10.sy);
      c.lineTo(p11.sx, p11.sy);
      c.lineTo(p01.sx, p01.sy);
      c.closePath();

      const h = Math.max(0, Math.min(1, (cell.zAvg + 1) / 2));
      const lum = 38 + 54 * h;
      const col = `hsl(210, 70%, ${lum}%)`;
      c.fillStyle = col;
      c.strokeStyle = col;
      c.lineWidth = 0.6;
      c.fill();
      c.stroke();
    }
    c.restore();
  }
});


/* ==========================================================================
 * 8. 多普勒效应
 * ========================================================================== */

paramDef('dopRatio', { label: '波速/源速', min: 0.33, max: 8, step: 0.05, def: 2 });
paramDef('dopWaves', { label: '波前数',   min: 3,    max: 16, step: 1,   def: 8 });

reg({
  key: 'doppler', cat: 'wave', geom: 'box', label: '多普勒效应', fill: false,
  icon: '<circle cx="10" cy="12" r="3"/>' +
        '<circle cx="10" cy="12" r="6"/>' +
        '<circle cx="10" cy="12" r="9"/>' +
        '<circle cx="15" cy="12" r="1.8" fill="currentColor"/>' +
        '<path d="M12 12h5"/>',
  params: ['dopRatio', 'dopWaves'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const ratio = Math.max(0.33, Math.min(8, o.dopRatio ?? 2));
    const N = Math.max(3, Math.round(o.dopWaves ?? 8));
    const span = N - 1;

    const pad = Math.min(b.w, b.h) * 0.06;
    const Sx = (b.w - 2 * pad) / (span * (ratio + Math.max(ratio, 1)));
    const Sy = (b.h - 2 * pad) / (2 * ratio * span);
    const S = Math.min(Sx, Sy);

    const startX = b.x1 + pad + ratio * span * S;
    const cy = b.y1 + b.h / 2;

    c.save();
    c.lineWidth = Math.max(0.6, (o.size || 4) * 0.45);
    c.strokeStyle = GH.tint(o.color, 0.65);

    for (let i = 0; i < N; i++) {
      const px = startX + i * S;
      const r = ratio * (N - 1 - i) * S;
      if (r < 0.4) continue;
      c.beginPath();
      c.arc(px, cy, r, 0, Math.PI * 2);
      c.stroke();
    }

    c.save();
    c.strokeStyle = GH.tint(o.color, 0.35);
    c.setLineDash([4, 3]);
    c.beginPath();
    c.moveTo(startX, cy);
    c.lineTo(startX + span * S, cy);
    c.stroke();
    c.setLineDash([]);
    c.restore();

    c.beginPath();
    c.arc(startX + span * S, cy, Math.max(3, (o.size || 4) * 1.2), 0, Math.PI * 2);
    c.fillStyle = o.color;
    c.fill();

    c.restore();
  }
});


/* ==========================================================================
 * 9. 波的衍射
 * ========================================================================== */

paramDef('difWave', { label: '波长', min: 5,  max: 60, step: 1, def: 15, unit: 'px' });
paramDef('difSlit', { label: '缝宽', min: 2,  max: 80, step: 1, def: 80, unit: 'px' });

reg({
  key: 'diffract', cat: 'wave', geom: 'box', label: '波的衍射', fill: false,
  icon: '<path d="M4 4v16M8 4v16"/>' +
        '<path d="M12 4v6M12 14v6"/>' +
        '<path d="M14 8a6 6 0 0 1 0 8"/>' +
        '<path d="M14 5a9 9 0 0 1 0 14"/>',
  params: ['difWave', 'difSlit'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const wavelength = Math.max(4, o.difWave ?? 20);
    const slit = Math.max(2, o.difSlit ?? 12);

    const wallX  = b.x1 + b.w * 0.5;
    const cy     = b.y1 + b.h / 2;
    const slitT  = cy - slit / 2;
    const slitB  = cy + slit / 2;

    c.save();
    c.lineWidth = Math.max(0.6, (o.size || 4) * 0.42);
    c.strokeStyle = GH.tint(o.color, 0.6);

    for (let x = b.x1 + 4; x < wallX - 4; x += wavelength) {
      c.beginPath();
      c.moveTo(x, b.y1 + 4);
      c.lineTo(x, b.y2 - 4);
      c.stroke();
    }

    c.save();
    c.strokeStyle = o.color;
    c.lineWidth = Math.max(1.5, (o.size || 4) * 0.9);
    c.beginPath();
    c.moveTo(wallX, b.y1 + 4); c.lineTo(wallX, slitT);
    c.moveTo(wallX, slitB);    c.lineTo(wallX, b.y2 - 4);
    c.stroke();
    c.restore();

    const spread = Math.PI / 2 * Math.min(1, 2 * wavelength / slit);
    const maxR = Math.max(b.w, b.h);
    for (let i = 1; i * wavelength < maxR; i++) {
      c.beginPath();
      c.arc(wallX, cy, i * wavelength, -spread, spread);
      c.stroke();
    }

    c.restore();
  }
});


/* ==========================================================================
 * 10. 惠更斯原理（反射 / 折射）
 * ========================================================================== */

paramDef('huyType',  { label: '类型',   min: 0, max: 1,   step: 1,   def: 0,   unit: '0反射1折射' });
paramDef('huyAngle', { label: '入射角', min: 20, max: 75, step: 1,   def: 50,  unit: '°' });
paramDef('huyN',     { label: '折射率', min: 1.1, max: 3, step: 0.1, def: 1.5 });

reg({
  key: 'huygens', cat: 'wave', geom: 'box', label: '惠更斯原理', fill: false,
  icon: '<path d="M2 16h20"/>' +
        '<path d="M4 3l5 13"/>' +
        '<circle cx="9"  cy="16" r="4"/>' +
        '<circle cx="14" cy="16" r="2"/>' +
        '<path d="M6 16l10-7"/>',
  params: ['huyType', 'huyAngle', 'huyN'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const type = Math.round(o.huyType ?? 0);
    const thetaDeg = Math.max(20, Math.min(75, o.huyAngle ?? 50));
    const theta = thetaDeg * Math.PI / 180;
    const n = Math.max(1.1, o.huyN ?? 1.5);
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    const yI = b.y1 + b.h * 0.55;
    const cx = b.x1 + b.w / 2;

    const spacing = b.w * 0.14;
    const P = [
      { x: cx - spacing, y: yI },
      { x: cx,           y: yI },
      { x: cx + spacing, y: yI }
    ];

    const R = spacing * sinT;
    const arrowSize = Math.max(3, (o.size || 4) * 0.7);

    c.save();
    c.lineWidth = Math.max(0.7, (o.size || 4) * 0.45);
    c.strokeStyle = GH.tint(o.color, 0.55);

    c.beginPath();
    c.moveTo(b.x1, yI);
    c.lineTo(b.x2, yI);
    c.stroke();

    c.save();
    c.strokeStyle = GH.tint(o.color, 0.5);
    if (type === 0) {
      for (let i = 0; i < 3; i++) {
        const r = (2 - i) * R;
        if (r < 0.5) continue;
        c.beginPath();
        c.arc(P[i].x, P[i].y, r, Math.PI, Math.PI * 2);
        c.stroke();
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const r = (2 - i) * R / n;
        if (r < 0.5) continue;
        c.beginPath();
        c.arc(P[i].x, P[i].y, r, 0, Math.PI);
        c.stroke();
      }
    }
    c.restore();

    const tl = b.w * 0.60;
    c.save();
    c.strokeStyle = GH.tint(o.color, 0.85);
    c.lineWidth = Math.max(1, (o.size || 4) * 0.7);

    if (type === 0) {
      const dxF = -cosT, dyF = -sinT;
      c.beginPath();
      c.moveTo(P[2].x + tl * dxF, P[2].y + tl * dyF);
      c.lineTo(P[2].x - tl * 0.35 * dxF, P[2].y - tl * 0.35 * dyF);
      c.stroke();
    } else {
      const sinP = sinT / n;
      const cosP = Math.sqrt(Math.max(0, 1 - sinP * sinP));
      const dxF = -cosP, dyF = sinP;
      c.beginPath();
      c.moveTo(P[2].x + tl * dxF, P[2].y + tl * dyF);
      c.lineTo(P[2].x - tl * 0.35 * dxF, P[2].y - tl * 0.35 * dyF);
      c.stroke();
    }
    c.restore();

    const hUp = yI - b.y1;
    const maxL = hUp * 0.80 / cosT;
    const spanL = 2 * spacing * sinT;
    const L0 = Math.max(maxL * 0.15, maxL - spanL);
    const L = [L0, L0 + spacing * sinT, L0 + 2 * spacing * sinT];

    c.save();
    c.strokeStyle = o.color;
    c.lineWidth = Math.max(0.9, (o.size || 4) * 0.6);

    for (let i = 0; i < 3; i++) {
      const Qx = P[i].x - L[i] * sinT;
      const Qy = P[i].y - L[i] * cosT;
      c.beginPath();
      c.moveTo(Qx, Qy);
      c.lineTo(P[i].x, P[i].y);
      c.stroke();
      const mx = (Qx + P[i].x) / 2;
      const my = (Qy + P[i].y) / 2;
      GH.head(c, Qx, Qy, mx, my, arrowSize);
    }
    c.restore();

    c.save();
    c.strokeStyle = o.color;
    c.lineWidth = Math.max(0.9, (o.size || 4) * 0.6);

    if (type === 0) {
      const maxM = hUp * 0.55 / cosT;
      const M = [
        maxM,
        Math.max(maxM * 0.20, maxM - spacing * sinT),
        Math.max(maxM * 0.20, maxM - 2 * spacing * sinT)
      ];
      for (let i = 0; i < 3; i++) {
        const Tx = P[i].x + M[i] * sinT;
        const Ty = P[i].y - M[i] * cosT;
        c.beginPath();
        c.moveTo(P[i].x, P[i].y);
        c.lineTo(Tx, Ty);
        c.stroke();
        const mx = (P[i].x + Tx) / 2;
        const my = (P[i].y + Ty) / 2;
        GH.head(c, P[i].x, P[i].y, mx, my, arrowSize);
      }
    } else {
      const sinP = sinT / n;
      const cosP = Math.sqrt(Math.max(0, 1 - sinP * sinP));
      const hDn = b.y2 - yI;
      const maxN = hDn * 0.80 / cosP;
      const N = [
        maxN,
        Math.max(maxN * 0.20, maxN - spacing * sinP),
        Math.max(maxN * 0.20, maxN - 2 * spacing * sinP)
      ];
      for (let i = 0; i < 3; i++) {
        const Sx = P[i].x + N[i] * sinP;
        const Sy = P[i].y + N[i] * cosP;
        c.beginPath();
        c.moveTo(P[i].x, P[i].y);
        c.lineTo(Sx, Sy);
        c.stroke();
        const mx = (P[i].x + Sx) / 2;
        const my = (P[i].y + Sy) / 2;
        GH.head(c, P[i].x, P[i].y, mx, my, arrowSize);
      }
    }
    c.restore();

    P.forEach(p => {
      c.beginPath();
      c.arc(p.x, p.y, Math.max(1.5, (o.size || 4) * 0.6), 0, Math.PI * 2);
      c.fillStyle = o.color;
      c.fill();
    });

    c.restore();
  }
});


/* ==========================================================================
 * 11. 光学（干涉 / 衍射）
 * ========================================================================== */

const HUE7 = [
  '#e53935',  // 红
  '#fb8c00',  // 橙
  '#fdd835',  // 黄
  '#43a047',  // 绿
  '#00acc1',  // 青
  '#1e88e5',  // 蓝
  '#8e24aa'   // 紫
];

function hex2rgb(hex) {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function fillField(c, b, fn) {
  const w = Math.max(1, Math.ceil(b.w));
  const h = Math.max(1, Math.ceil(b.h));
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext('2d');
  const img = tctx.createImageData(w, h);
  const data = img.data;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const rgba = fn(px / w, py / h, w, h);
      data[i]     = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = rgba[3];
    }
  }
  tctx.putImageData(img, 0, 0);
  c.drawImage(tmp, Math.floor(b.x1), Math.floor(b.y1));
}

function strokeFrame(c, b) {
  c.save();
  c.strokeStyle = 'rgba(120,120,120,0.55)';
  c.lineWidth = 1;
  c.strokeRect(b.x1, b.y1, b.w, b.h);
  c.restore();
}

/* ---- 双缝干涉条纹 ---- */
reg({
  key: 'doubleSlit', cat: 'optics', geom: 'box', label: '双缝干涉',
  icon: '<path d="M3 4v16M8 4v16M16 4v16M21 4v16"/>' +
        '<path d="M3 8h5M8 8h8M16 8h5" stroke-opacity="0.35"/>' +
        '<path d="M3 12h5M8 12h8M16 12h5" stroke-opacity="0.7"/>' +
        '<path d="M3 16h5M8 16h8M16 16h5" stroke-opacity="0.35"/>',
  params: ['hue7', 'density'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const [r, g, bl] = hex2rgb(HUE7[Math.round(o.hue7 ?? 0) % 7]);
    const N = Math.max(2, Math.round(o.density ?? 12));
    fillField(c, b, (ux) => {
      const t = ux - 0.5;
      const u = t * N * 2;
      const I = Math.cos(Math.PI * u) ** 2;
      return [r, g, bl, Math.round(I * 255)];
    });
    strokeFrame(c, b);
  }
});

/* ---- 单缝衍射条纹 ---- */
paramDef('slitWidth', { label: '缝宽 a/λ', min: 0.5, max: 10, step: 0.1, def: 3 });
paramDef('slitLight', { label: '光源',    min: 0,   max: 7,  step: 1,   def: 0,
  hint: [{ label: '白', value: 0 }, { label: '红', value: 1 }, { label: '橙', value: 2 },
    { label: '黄', value: 3 }, { label: '绿', value: 4 }, { label: '青', value: 5 },
    { label: '蓝', value: 6 }, { label: '紫', value: 7 }] });

reg({
  key: 'singleSlit', cat: 'optics', geom: 'box', label: '单缝衍射',
  icon: '<path d="M3 4v16M21 4v16"/><path d="M10 4v16M14 4v16"/>' +
        '<path d="M3 12h7M14 12h7" stroke-opacity="0.9"/>',
  params: ['slitWidth', 'slitLight'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const aRatio = Math.max(0.5, Math.min(10, o.slitWidth ?? 3));
    const light  = Math.round(o.slitLight ?? 0);

    const WL_R = 1.30, WL_G = 1.00, WL_B = 0.80;
    const monoWL = [1.30, 1.15, 1.05, 1.00, 0.95, 0.88, 0.80];

    function sinc2(x) {
      if (Math.abs(x) < 1e-6) return 1;
      const s = Math.sin(x) / x;
      return s * s;
    }

    function intensity(u, wlr) {
      const beta = Math.PI * (aRatio / wlr) * u;
      return sinc2(beta);
    }

    if (light === 0) {
      fillField(c, b, (ux) => {
        const u = 2 * ux - 1;
        const IR = intensity(u, WL_R);
        const IG = intensity(u, WL_G);
        const IB = intensity(u, WL_B);
        return [
          Math.round(255 * IR),
          Math.round(255 * IG),
          Math.round(255 * IB),
          255
        ];
      });
    } else {
      const [r, g, bl] = hex2rgb(HUE7[(light - 1) % 7]);
      const wl = monoWL[light - 1];
      fillField(c, b, (ux) => {
        const u = 2 * ux - 1;
        const I = intensity(u, wl);
        return [
          Math.round(r * I),
          Math.round(g * I),
          Math.round(bl * I),
          255
        ];
      });
    }

    strokeFrame(c, b);
  }
});

/* ---- 牛顿环 ---- */
reg({
  key: 'newtonRing', cat: 'optics', geom: 'box', label: '牛顿环',
  icon: '<circle cx="12" cy="12" r="2"/>' +
        '<circle cx="12" cy="12" r="5"/>' +
        '<circle cx="12" cy="12" r="8"/>',
  params: ['hue7', 'density'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const [r, g, bl] = hex2rgb(HUE7[Math.round(o.hue7 ?? 0) % 7]);
    const N = Math.max(2, Math.round(o.density ?? 10));
    fillField(c, b, (ux, uy, w, h) => {
      const px = ux * w - w / 2;
      const py = uy * h - h / 2;
      const rmax = Math.min(w, h) / 2;
      const r2 = (px * px + py * py) / (rmax * rmax);
      if (r2 > 1) return [255, 255, 255, 0];
      const I = Math.sin(Math.PI * N * r2) ** 2;
      return [r, g, bl, Math.round(I * 255)];
    });
    strokeFrame(c, b);
  }
});

/* ---- 泊松亮斑 ---- */
paramDef('shadowR', { label: '阴影半径', min: 0.2, max: 0.75, step: 0.05, def: 0.5 });

reg({
  key: 'poissonSpot', cat: 'optics', geom: 'box', label: '泊松亮斑',
  icon: '<circle cx="12" cy="12" r="8" stroke-opacity="0.4"/>' +
        '<circle cx="12" cy="12" r="5" stroke-opacity="0.7"/>' +
        '<circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  params: ['hue7', 'density', 'shadowR'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const [r, g, bl] = hex2rgb(HUE7[Math.round(o.hue7 ?? 0) % 7]);
    const N = Math.max(3, Math.round(o.density ?? 8));
    const shadowR = Math.max(0.2, Math.min(0.75, o.shadowR ?? 0.5));

    fillField(c, b, (ux, uy, w, h) => {
      const px = ux * w - w / 2;
      const py = uy * h - h / 2;
      const rmax = Math.min(w, h) / 2;
      const viewR = Math.sqrt(px * px + py * py) / rmax;

      if (viewR > 1) return [255, 255, 255, 0];

      const rr = viewR / shadowR;

      const x = Math.PI * N * rr;
      const osc = Math.cos(x) ** 2;

      const spot = Math.exp(-((rr / 0.06) ** 2));

      const edgeEnv = Math.exp(-Math.pow((rr - 1) * 2.5, 2));

      let I;
      if (rr < 1) {
        const darkBg = 0.02;
        const edgeRings = edgeEnv * osc * 0.55;
        const innerRings = Math.exp(-rr * 4) * osc * 0.08;
        I = darkBg + spot + edgeRings + innerRings;
      } else {
        const base = 0.9;
        const approach = 1 - Math.exp(-(rr - 1) * 2.5);
        const boundaryRing = edgeEnv * (1 - osc) * 0.55 * (1 - approach);
        I = base - boundaryRing;
      }

      const fade = viewR > 0.92 ? Math.max(0, (1 - viewR) / 0.08) : 1;

      I = Math.max(0, Math.min(1, I));
      return [r, g, bl, Math.round(I * fade * 255)];
    });
    strokeFrame(c, b);
  }
});

/* ---- 检测玻璃平整度 ---- */
paramDef('distortX',   { label: '缺陷 X',   min: 0,   max: 1,  step: 0.02, def: 0.6 });
paramDef('distortY',   { label: '缺陷 Y',   min: 0,   max: 1,  step: 0.02, def: 0.5 });
paramDef('distortDir', { label: '凸起方向', min: 0,   max: 1,  step: 1,    def: 1,  unit: '0左1右' });

reg({
  key: 'glassFlatness', cat: 'optics', geom: 'box', label: '玻璃平整度',
  icon: '<path d="M3 4v16M21 4v16"/>' +
        '<path d="M6 6v12M9 6v12M12 6v10.5M15 6v13.5M18 6v12" ' +
        'stroke-opacity="0.85"/>',
  params: ['hue7', 'density', 'distort', 'distortX', 'distortY', 'distortDir'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const [r, g, bl] = hex2rgb(HUE7[Math.round(o.hue7 ?? 0) % 7]);
    const N = Math.max(3, Math.round(o.density ?? 12));
    const D = (o.distort ?? 30) / 100;
    const px = o.distortX ?? 0.6;
    const py = o.distortY ?? 0.5;
    const dirSign = (o.distortDir ?? 1) >= 0.5 ? 1 : -1;

    const aspect = b.w / b.h;
    const bumpAmp = D * 2.5;
    const sigma = 0.18;

    fillField(c, b, (ux, uy) => {
      let phase = ux * N;

      if (D > 0.001) {
        const dx = (ux - px) * aspect;
        const dy = (uy - py);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const bump = Math.exp(-((dist / sigma) ** 2));
        phase += dirSign * bump * bumpAmp;
      }

      const I = Math.cos(Math.PI * phase) ** 2;
      return [r, g, bl, Math.round(I * 255)];
    });

    strokeFrame(c, b);
  }
});


/* ==========================================================================
 * 12. 电磁（基础元件与场）
 * ========================================================================== */

/* ---- 条形磁铁 ---- */
paramDef('swapPole', { label: '换极', min: 0, max: 1, step: 1, def: 0 });

reg({
  key: 'magnet', cat: 'em', geom: 'box', label: '条形磁铁',
  icon: '<rect x="4" y="8" width="16" height="8" rx="1"/><path d="M12 8v8"/>',
  params: ['swapPole'],
  draw(c, o, GH) {
    const b = GH.box(o);
    // 1.7.12：磁感线已撤（1.7.10 的 RK4 数值流线在扁框里绕不回来、只剩扇形射线），
    // 本体恢复常规占比，不再为场线留白。
    const mx1 = b.x1 + b.w * 0.12, mx2 = b.x2 - b.w * 0.12;
    const my1 = b.y1 + b.h * 0.32, my2 = b.y2 - b.h * 0.32;
    const halfW = (mx2 - mx1) / 2, mh = my2 - my1;
    /* 1.3.0：原来 N/S 与红/蓝是写死的（永远红左蓝右、N 在左），往左拖也一样。
     * 现在极向由 swapPole 决定，P.DIRS 按拖动方向给它默认值。 */
    const swap = (o.swapPole ?? 0) >= 0.5;
    c.save();
    c.fillStyle = swap ? '#1e88e5' : '#e53935';
    c.fillRect(mx1, my1, halfW, mh);
    c.fillStyle = swap ? '#e53935' : '#1e88e5';
    c.fillRect(mx1 + halfW, my1, halfW, mh);

    c.strokeStyle = o.color;
    c.lineWidth = Math.max(1, (o.size || 4) * 0.4);
    c.strokeRect(mx1, my1, mx2 - mx1, mh);
    c.beginPath();
    c.moveTo(mx1 + halfW, my1);
    c.lineTo(mx1 + halfW, my2);
    c.stroke();

    c.fillStyle = '#fff';
    c.font = 'bold ' + Math.max(9, Math.min(mh * 0.5, halfW * 0.5)) + 'px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(swap ? 'S' : 'N', mx1 + halfW * 0.5, my1 + mh / 2);
    c.fillText(swap ? 'N' : 'S', mx1 + halfW * 1.5, my1 + mh / 2);
    c.restore();
  }
});

/* ---- 蹄形磁铁 ---- */

reg({
  key: 'horseshoe', cat: 'em', geom: 'box', label: '蹄形磁铁',
  icon: '<path d="M4 3v14h16V3h-4v10H8V3z"/>',
  params: ['swapPole'],
  draw(c, o, GH) {
    const b = GH.box(o);
    // 1.7.12：磁感线已撤，本体恢复到框内主要区域（原来上方留 42% 空白给流线）。
    const bx1 = b.x1 + b.w * 0.12, bx2 = b.x2 - b.w * 0.12;
    const by1 = b.y1 + b.h * 0.18, by2 = b.y2 - b.h * 0.06;
    const bw = bx2 - bx1, bh = by2 - by1;
    const armW  = Math.min(bw * 0.28, bh * 0.4);
    const baseH = Math.min(bh * 0.34, bw * 0.4);
    const cx    = (bx1 + bx2) / 2;
    const swap = (o.swapPole ?? 0) >= 0.5;

    const leftColor  = swap ? '#1e88e5' : '#e53935';
    const rightColor = swap ? '#e53935' : '#1e88e5';

    c.fillStyle = leftColor;
    c.fillRect(bx1, by1, armW, bh - baseH);
    c.fillRect(bx1, by2 - baseH, cx - bx1, baseH);

    c.fillStyle = rightColor;
    c.fillRect(bx2 - armW, by1, armW, bh - baseH);
    c.fillRect(cx, by2 - baseH, bx2 - cx, baseH);

    c.save();
    c.lineWidth   = Math.max(1, (o.size || 4) * 0.5);
    c.strokeStyle = o.color || '#1a1a1a';
    c.beginPath();
    c.moveTo(bx1, by1);
    c.lineTo(bx1 + armW, by1);
    c.lineTo(bx1 + armW, by2 - baseH);
    c.lineTo(bx2 - armW, by2 - baseH);
    c.lineTo(bx2 - armW, by1);
    c.lineTo(bx2, by1);
    c.lineTo(bx2, by2);
    c.lineTo(bx1, by2);
    c.closePath();
    c.stroke();
    c.restore();

    c.save();
    c.fillStyle = '#fff';
    const fs = Math.max(9, Math.min(bh * 0.16, armW * 0.65));
    c.font = 'bold ' + fs + 'px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(swap ? 'S' : 'N', bx1 + armW / 2, by1 + fs * 0.9);
    c.fillText(swap ? 'N' : 'S', bx2 - armW / 2, by1 + fs * 0.9);
    c.restore();
  }
});

/* ---- 点电荷（按拖动方向区分正负） ---- */
reg({
  key: 'charge', cat: 'em', geom: 'box', label: '点电荷',
  icon: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>',
  params: ['chargeSign'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    const r = Math.min(b.w, b.h) / 2;

    /* 1.3.0：原来按「x2 是否小于 x1」判电性，但 P.make 先把坐标归一化成
     * x1 ≤ x2，这条分支永远算出正电荷（往左拖也是红的）。
     * 现在只读 chargeSign，方向默认值由 P.DIRS 按拖动方向给。 */
    const neg = (o.chargeSign ?? 0) >= 0.5;

    c.beginPath();
    c.arc(cx, cy, Math.max(r, 1), 0, Math.PI * 2);
    c.fillStyle = neg ? 'rgba(30,136,229,0.18)' : 'rgba(229,57,53,0.18)';
    c.fill();
    c.stroke();

    c.beginPath();
    if (!neg) {
      /* 正电荷：+ 号 */
      c.moveTo(cx - r * 0.5, cy); c.lineTo(cx + r * 0.5, cy);
      c.moveTo(cx, cy - r * 0.5); c.lineTo(cx, cy + r * 0.5);
    } else {
      /* 负电荷：− 号 */
      c.moveTo(cx - r * 0.5, cy); c.lineTo(cx + r * 0.5, cy);
    }
    c.stroke();
  }
});

/* ---- 磁场方向 ---- */
paramDef('fieldInto', { label: '方向', min: 0, max: 1,  step: 1, def: 0 });
paramDef('fieldRows', { label: '行数', min: 2, max: 20, step: 1, def: 6 });
paramDef('fieldCols', { label: '列数', min: 2, max: 20, step: 1, def: 8 });

reg({
  key: 'magField', cat: 'em', geom: 'box', label: '磁场方向',
  icon: '<path d="M5 5l3 3M8 5l-3 3"/>' +
        '<path d="M16 5l3 3M19 5l-3 3"/>' +
        '<path d="M5 14l3 3M8 14l-3 3"/>' +
        '<circle cx="17.5" cy="15.5" r="1.2" fill="currentColor"/>',
  params: ['fieldInto', 'fieldRows', 'fieldCols'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const into = (o.fieldInto ?? 0) < 0.5;
    const rows = Math.max(2, Math.round(o.fieldRows ?? 6));
    const cols = Math.max(2, Math.round(o.fieldCols ?? 8));

    const cellW = b.w / cols;
    const cellH = b.h / rows;
    const unit  = Math.min(cellW, cellH);
    const arm   = unit * 0.26;
    const dotR  = unit * 0.13;

    c.save();
    c.lineCap = 'round';
    c.lineWidth = Math.max(1.2, (o.size || 4) * 0.5);
    c.strokeStyle = o.color;
    c.fillStyle   = o.color;

    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const cx = b.x1 + cellW * (col + 0.5);
        const cy = b.y1 + cellH * (r + 0.5);

        if (into) {
          c.beginPath();
          c.moveTo(cx - arm, cy - arm);
          c.lineTo(cx + arm, cy + arm);
          c.moveTo(cx + arm, cy - arm);
          c.lineTo(cx - arm, cy + arm);
          c.stroke();
        } else {
          c.beginPath();
          c.arc(cx, cy, dotR, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    c.restore();
  }
});

/* ---- 电池 ---- */
paramDef('batteryFlip', { label: '极性', min: 0, max: 1, step: 1, def: 0 });

reg({
  key: 'battery', cat: 'em', geom: 'box', label: '电池',
  icon: '<path d="M3 10v4M5 10v4M9 9v6M13 10v4M17 9v6M19 10v4"/>',
  params: ['batteryFlip'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const cy = b.y1 + b.h / 2;
    /* 长板 = 正极。1.3.0：原来长板固定画在左边，往右拖也还是「− 在长这边」；
     * 现在由 batteryFlip 决定长板在哪一侧（默认值由 P.DIRS 按拖动方向给）。 */
    const flip = (o.batteryFlip ?? 0) >= 0.5;
    const xp = b.x1 + b.w * (flip ? 0.65 : 0.35);   // 长板（正极）
    const xn = b.x1 + b.w * (flip ? 0.35 : 0.65);   // 短板（负极）
    const h1 = b.h * 0.55;
    const h2 = b.h * 0.35;
    c.beginPath();
    c.moveTo(b.x1, cy); c.lineTo(Math.min(xp, xn), cy);
    c.moveTo(Math.max(xp, xn), cy); c.lineTo(b.x2, cy);
    c.moveTo(xp, cy - h1 / 2); c.lineTo(xp, cy + h1 / 2);
    c.moveTo(xn, cy - h2 / 2); c.lineTo(xn, cy + h2 / 2);
    c.stroke();
  }
});

/* ---- 电阻（矩形符号） ---- */
reg({
  key: 'resistor', cat: 'em', geom: 'box', label: '电阻',
  icon: '<rect x="6.5" y="9" width="11" height="6" rx="0.6" fill="none"/>' +
        '<path d="M3 12h3.5M17.5 12H21"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cy = b.y1 + b.h / 2;

    /* 矩形宽度取包围盒宽度的 70%，居中放置；
     * 高度取包围盒高度，但限制在合理范围内，避免太扁或太胖。 */
    const rectW = b.w * 0.70;
    const rectH = Math.max(6, Math.min(b.h, rectW * 0.45));
    const rectX = b.x1 + (b.w - rectW) / 2;
    const rectY = cy - rectH / 2;

    /* 左右引线：从包围盒两端连到矩形左右边 */
    c.beginPath();
    c.moveTo(b.x1, cy);
    c.lineTo(rectX, cy);
    c.moveTo(rectX + rectW, cy);
    c.lineTo(b.x2, cy);
    c.stroke();

    /* 矩形本体：如果勾选了填充就填充 */
    c.beginPath();
    c.rect(rectX, rectY, rectW, rectH);
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.22); c.fill(); }
    c.stroke();
  }
});

/* ---- 电容 ---- */
reg({
  key: 'capacitor', cat: 'em', geom: 'box', label: '电容',
  icon: '<path d="M3 12h6M15 12h6M9 8v8M15 8v8"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cy = b.y1 + b.h / 2;
    const x1 = b.x1 + b.w * 0.35;
    const x2 = b.x1 + b.w * 0.65;
    c.beginPath();
    c.moveTo(b.x1, cy); c.lineTo(x1, cy);
    c.moveTo(x2, cy); c.lineTo(b.x2, cy);
    c.moveTo(x1, b.y1 + b.h * 0.15); c.lineTo(x1, b.y2 - b.h * 0.15);
    c.moveTo(x2, b.y1 + b.h * 0.15); c.lineTo(x2, b.y2 - b.h * 0.15);
    c.stroke();
  }
});

/* ---- 灯泡 ---- */
reg({
  key: 'bulb', cat: 'em', geom: 'box', label: '灯泡',
  icon: '<circle cx="12" cy="12" r="7"/><path d="M9 9l6 6M15 9l-6 6"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    const r = Math.min(b.w, b.h) / 2;
    c.beginPath();
    c.arc(cx, cy, Math.max(r, 1), 0, Math.PI * 2);
    if (o.fill) { c.fillStyle = GH.tint(o.color, 0.12); c.fill(); }
    c.stroke();
    const d = r * 0.68;
    c.beginPath();
    c.moveTo(cx - d, cy - d); c.lineTo(cx + d, cy + d);
    c.moveTo(cx + d, cy - d); c.lineTo(cx - d, cy + d);
    c.stroke();
  }
});

/* ---- 电池组 ---- */
reg({
  key: 'batteryGroup', cat: 'em', geom: 'box', label: '电池组',
  icon: '<path d="M3 10v4M6 8v8M10 10v4M13 8v8M17 10v4M21 8v8"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cy = (b.y1 + b.y2) / 2;
    const longH  = b.h * 0.75;
    const shortH = b.h * 0.42;
    const xStart = b.x1 + b.w * 0.08;
    const xEnd   = b.x2 - b.w * 0.08;

    c.beginPath();
    c.moveTo(b.x1, cy); c.lineTo(xStart, cy);
    c.moveTo(xEnd, cy); c.lineTo(b.x2, cy);
    c.stroke();

    const n = 4;
    for (let i = 0; i < n; i++) {
      const x = xStart + (xEnd - xStart) * (i + 0.5) / n;
      const h = (i % 2 === 0 ? longH : shortH);
      c.beginPath();
      c.moveTo(x, cy - h / 2);
      c.lineTo(x, cy + h / 2);
      c.stroke();
    }
  }
});

/* ---- 开关 ---- */
paramDef('switchOn', { label: '闭合', min: 0, max: 1, step: 1, def: 1 });

reg({
  key: 'switch', cat: 'em', geom: 'box', label: '开关',
  icon: '<path d="M3 12h3"/><path d="M18 12h3"/>' +
        '<circle cx="7.5" cy="12" r="1.3"/>' +
        '<circle cx="16.5" cy="12" r="1.3"/>' +
        '<path d="M7.5 12l9-3"/>',
  params: ['switchOn'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const cy = (b.y1 + b.y2) / 2;
    const x1 = b.x1 + b.w * 0.28;
    const x2 = b.x1 + b.w * 0.72;

    c.beginPath();
    c.moveTo(b.x1, cy); c.lineTo(x1, cy);
    c.moveTo(x2, cy); c.lineTo(b.x2, cy);
    c.stroke();

    c.beginPath(); c.arc(x1, cy, 2.5, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(x2, cy, 2.5, 0, Math.PI * 2); c.stroke();

    const on = (o.switchOn ?? 1) >= 0.5;
    c.beginPath();
    c.moveTo(x1, cy);
    if (on) c.lineTo(x2, cy);
    else    c.lineTo(x2, cy - b.h * 0.45);
    c.stroke();
  }
});

/* ---- 单刀双掷开关 ---- */
paramDef('spdtState', { label: '位置', min: 0, max: 1, step: 1, def: 0 });

reg({
  key: 'spdt', cat: 'em', geom: 'box', label: '单刀双掷',
  icon: '<path d="M3 12h3"/><circle cx="7" cy="12" r="1.2"/>' +
        '<path d="M7 12l9-4"/>' +
        '<circle cx="17" cy="8" r="1.2"/><circle cx="17" cy="16" r="1.2"/>' +
        '<path d="M17 8h4M17 16h4"/>',
  params: ['spdtState'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const cy = (b.y1 + b.y2) / 2;
    const cx = b.x1 + b.w * 0.28;
    const xa = b.x1 + b.w * 0.7;
    const ya = b.y1 + b.h * 0.22;
    const yb = b.y2 - b.h * 0.22;

    c.beginPath();
    c.moveTo(b.x1, cy); c.lineTo(cx, cy);
    c.moveTo(xa, ya); c.lineTo(b.x2, ya);
    c.moveTo(xa, yb); c.lineTo(b.x2, yb);
    c.stroke();

    c.beginPath(); c.arc(cx, cy, 2.5, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(xa, ya, 2.5, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(xa, yb, 2.5, 0, Math.PI * 2); c.stroke();

    const up = (o.spdtState ?? 0) < 0.5;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(xa, up ? ya : yb);
    c.stroke();
  }
});

/* ---- 电流表 ---- */
reg({
  key: 'ammeter', cat: 'em', geom: 'box', label: '电流表',
  icon: '<circle cx="12" cy="12" r="8"/><path d="M10 15l2-5 2 5"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    const r = Math.min(b.w, b.h) / 2;
    c.beginPath(); c.arc(cx, cy, Math.max(r, 1), 0, Math.PI * 2); c.stroke();
    c.save();
    c.fillStyle = o.color;
    c.font = 'bold ' + (r * 1.05) + 'px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('A', cx, cy + r * 0.05);
    c.restore();
  }
});

/* ---- 电压表 ---- */
reg({
  key: 'voltmeter', cat: 'em', geom: 'box', label: '电压表',
  icon: '<circle cx="12" cy="12" r="8"/><path d="M9 9l3 6 3-6"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    const r = Math.min(b.w, b.h) / 2;
    c.beginPath(); c.arc(cx, cy, Math.max(r, 1), 0, Math.PI * 2); c.stroke();
    c.save();
    c.fillStyle = o.color;
    c.font = 'bold ' + (r * 1.05) + 'px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('V', cx, cy + r * 0.05);
    c.restore();
  }
});

/* ---- 电动机 ---- */
reg({
  key: 'motor', cat: 'em', geom: 'box', label: '电动机',
  icon: '<circle cx="12" cy="12" r="8"/><path d="M9 16V8l3 4 3-4v8"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    const r = Math.min(b.w, b.h) / 2;
    c.beginPath(); c.arc(cx, cy, Math.max(r, 1), 0, Math.PI * 2); c.stroke();
    c.save();
    c.fillStyle = o.color;
    c.font = 'bold ' + (r * 1.0) + 'px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('M', cx, cy + r * 0.05);
    c.restore();
  }
});

/* ---- 滑动变阻器 ---- */
// 滑片位置参数：与静态实验电路图（elShape 的 <key>_slide）同一套「滑片位置 0~100%」语义，
// 默认 50 仍画在电阻体中点；参数面板 / 撤销 / 保存随内置图形现有机制自动生效。
paramDef('rheoSlide', { label: '滑片位置', min: 0, max: 100, step: 1, def: 50, unit: '%' });
reg({
  key: 'rheostat', cat: 'em', geom: 'box', label: '滑动变阻器',
  params: ['rheoSlide'],
  icon: '<rect x="4" y="11" width="16" height="4"/>' +
        '<path d="M12 11V6"/><path d="M9 6h6"/><path d="M3 13h1M20 13h1"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    // 2.0.9：颜色改为显式取自 o.color。以前整段不写 strokeStyle，完全靠 P.draw 预先设好；
    // 行为一样，但一旦有别的入口直接调 draw（导出、缩略图、AI 预览）就会用上"上一次残留的笔色"。
    // 注意：这里不引入任何新色值，出厂渲染与改动前逐像素一致。
    if (o.color) c.strokeStyle = o.color;
    const cy = (b.y1 + b.y2) / 2;
    const rectW = b.w * 0.7;
    const rectH = b.h * 0.38;
    const rectX = b.x1 + (b.w - rectW) / 2;
    const rectY = cy - rectH / 2;

    c.beginPath();
    c.moveTo(b.x1, cy); c.lineTo(rectX, cy);
    c.moveTo(rectX + rectW, cy); c.lineTo(b.x2, cy);
    c.stroke();

    c.strokeRect(rectX, rectY, rectW, rectH);

    const t = AN_CL(o.rheoSlide ?? 50, 0, 100) / 100;
    const sx = rectX + rectW * t;
    const topY = b.y1 + b.h * 0.08;
    c.beginPath();
    c.moveTo(sx, topY); c.lineTo(sx, rectY);
    c.stroke();
    const ah = rectH * 0.55;
    c.beginPath();
    c.moveTo(sx - ah * 0.8, rectY - ah);
    c.lineTo(sx, rectY);
    c.lineTo(sx + ah * 0.8, rectY - ah);
    c.stroke();

    c.beginPath();
    c.moveTo(sx - rectW * 0.12, topY);
    c.lineTo(sx + rectW * 0.12, topY);
    c.stroke();
  }
});


/* ==========================================================================
 * 13. 电场线专题
 * ========================================================================== */

const EFH = {
  fieldAt(x, y, charges) {
    let ex = 0, ey = 0;
    for (const ch of charges) {
      const dx = x - ch.x, dy = y - ch.y;
      const r2 = dx * dx + dy * dy;
      if (r2 < 1e-4) continue;
      const r3 = r2 * Math.sqrt(r2);
      ex += ch.q * dx / r3;
      ey += ch.q * dy / r3;
    }
    return { ex, ey };
  },
  trace(x, y, charges, box, dir) {
    const pts = [{ x, y }];
    const md   = Math.min(box.w, box.h);
    const step = md / 300;
    const pad  = md * 0.03;
    let endCharge = null;
    for (let i = 0; i < 5000; i++) {
      const { ex, ey } = this.fieldAt(x, y, charges);
      const m = Math.hypot(ex, ey);
      if (m < 1e-12) break;
      x += dir * step * ex / m;
      y += dir * step * ey / m;
      pts.push({ x, y });
      let near = false;
      for (const ch of charges) {
        if (Math.hypot(x - ch.x, y - ch.y) < step * 2) {
          near = true;
          endCharge = ch;
          break;
        }
      }
      if (near) break;
      if (x < box.x1 - pad || x > box.x2 + pad ||
          y < box.y1 - pad || y > box.y2 + pad) break;
    }
    return { pts, endCharge };
  }
};

function drawChargeMark(c, x, y, q, r, strokeColor) {
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = q > 0 ? 'rgba(229,57,53,0.92)' : 'rgba(30,136,229,0.92)';
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = strokeColor || '#1a1a1a';
  c.stroke();
  c.fillStyle = '#fff';
  c.font = 'bold ' + (r * 1.4) + 'px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(q > 0 ? '+' : '\u2212', x, y + r * 0.05);
  c.restore();
}

function drawFieldLines(c, box, charges, opts, strokeColor, size) {
  const o = Object.assign({ seedsPerCharge: 14 }, opts || {});
  const md = Math.min(box.w, box.h);
  const r0 = md * 0.055;
  const paths = [];
  const hasPos = charges.some(ch => ch.q > 0);
  const hasNeg = charges.some(ch => ch.q < 0);

  const seedMul = q => Math.max(0.5, Math.min(2.5, Math.abs(q)));

  for (const ch of charges) {
    if (hasPos && ch.q <= 0) continue;
    if (!hasPos && ch.q >= 0) continue;
    const dir = ch.q > 0 ? +1 : -1;
    const seedCount = Math.max(4, Math.round(o.seedsPerCharge * seedMul(ch.q)));
    for (let i = 0; i < seedCount; i++) {
      const ang = (i / seedCount) * Math.PI * 2;
      const sx = ch.x + r0 * Math.cos(ang);
      const sy = ch.y + r0 * Math.sin(ang);
      const res = EFH.trace(sx, sy, charges, box, dir);
      if (res.pts.length > 3) paths.push({ pts: res.pts, dir });
    }
  }

  if (hasPos && hasNeg) {
    for (const ch of charges) {
      if (ch.q >= 0) continue;
      const seedCount = Math.max(4, Math.round(o.seedsPerCharge * seedMul(ch.q)));
      for (let i = 0; i < seedCount; i++) {
        const ang = (i / seedCount) * Math.PI * 2;
        const sx = ch.x + r0 * Math.cos(ang);
        const sy = ch.y + r0 * Math.sin(ang);
        const res = EFH.trace(sx, sy, charges, box, -1);
        if (res.pts.length > 3 && !(res.endCharge && res.endCharge.q > 0)) {
          paths.push({ pts: res.pts.slice().reverse(), dir: +1 });
        }
      }
    }
  }

  c.save();
  c.lineWidth   = Math.max(1, (size || 4) * 0.4);
  c.strokeStyle = strokeColor;
  c.lineCap     = 'round';

  for (const { pts } of paths) {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.stroke();
  }

  const arrowLen = md * 0.022;
  const arrowWid = arrowLen * 0.5;
  c.fillStyle = strokeColor;
  for (const { pts, dir } of paths) {
    const mid = Math.max(2, Math.floor(pts.length * 0.5));
    const a = pts[mid - 1], b = pts[mid];
    let ax = b.x - a.x, ay = b.y - a.y;
    if (dir < 0) { ax = -ax; ay = -ay; }
    const m = Math.hypot(ax, ay);
    if (m < 1e-6) continue;
    ax /= m; ay /= m;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    c.beginPath();
    c.moveTo(mx + ax * arrowLen, my + ay * arrowLen);
    c.lineTo(mx - ax * arrowLen * 0.3 - ay * arrowWid,
             my - ay * arrowLen * 0.3 + ax * arrowWid);
    c.lineTo(mx - ax * arrowLen * 0.3 + ay * arrowWid,
             my - ay * arrowLen * 0.3 - ax * arrowWid);
    c.closePath();
    c.fill();
  }
  c.restore();
}

function chargeDotSize(md, q, charges) {
  const maxAbsQ = Math.max(...charges.map(ch => Math.abs(ch.q)));
  return md * 0.055 * Math.sqrt(Math.abs(q) / maxAbsQ);
}

reg({
  key: 'efPos', cat: 'em', geom: 'box', label: '正点电荷',
  icon: '<circle cx="12" cy="12" r="2" fill="#e53935"/>' +
        '<path d="M12 12L12 3M12 12L12 21M12 12L3 12M12 12L21 12" stroke-opacity="0.7"/>' +
        '<path d="M12 12L5 5M12 12L19 5M12 12L5 19M12 12L19 19" stroke-opacity="0.5"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    const chR = Math.min(b.w, b.h) * 0.035;
    drawFieldLines(c, b, [{ x: cx, y: cy, q: 1 }], { seedsPerCharge: 14 }, o.color, o.size);
    drawChargeMark(c, cx, cy, 1, chR, o.color);
  }
});

reg({
  key: 'efNeg', cat: 'em', geom: 'box', label: '负点电荷',
  icon: '<circle cx="12" cy="12" r="2" stroke="#1e88e5" fill="#1e88e5"/>' +
        '<path d="M12 3L12 7M12 17L12 21M3 12L7 12M17 12L21 12" stroke-opacity="0.7"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2;
    const chR = Math.min(b.w, b.h) * 0.035;
    drawFieldLines(c, b, [{ x: cx, y: cy, q: -1 }], { seedsPerCharge: 14 }, o.color, o.size);
    drawChargeMark(c, cx, cy, -1, chR, o.color);
  }
});

reg({
  key: 'efDipole', cat: 'em', geom: 'box', label: '等量异种电荷',
  icon: '<circle cx="5" cy="12" r="2" fill="#e53935"/>' +
        '<circle cx="19" cy="12" r="2" fill="#1e88e5"/>' +
        '<path d="M7 12L17 12" stroke-opacity="0.7"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const md = Math.min(b.w, b.h);
    const cy = b.y1 + b.h / 2;
    const dx = b.w * 0.18;
    const charges = [
      { x: b.x1 + b.w / 2 - dx, y: cy, q:  1 },
      { x: b.x1 + b.w / 2 + dx, y: cy, q: -1 }
    ];
    drawFieldLines(c, b, charges, { seedsPerCharge: 16 }, o.color, o.size);
    for (const ch of charges) drawChargeMark(c, ch.x, ch.y, ch.q, md * 0.038, o.color);
  }
});

reg({
  key: 'efSameSign', cat: 'em', geom: 'box', label: '等量同种电荷',
  icon: '<circle cx="5" cy="12" r="2" fill="#e53935"/>' +
        '<circle cx="19" cy="12" r="2" fill="#e53935"/>' +
        '<path d="M7 10Q12 6 17 10M7 14Q12 18 17 14" stroke-opacity="0.6"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const md = Math.min(b.w, b.h);
    const cy = b.y1 + b.h / 2;
    const dx = b.w * 0.18;
    const charges = [
      { x: b.x1 + b.w / 2 - dx, y: cy, q: 1 },
      { x: b.x1 + b.w / 2 + dx, y: cy, q: 1 }
    ];
    drawFieldLines(c, b, charges, { seedsPerCharge: 12 }, o.color, o.size);
    for (const ch of charges) drawChargeMark(c, ch.x, ch.y, ch.q, md * 0.038, o.color);
  }
});

paramDef('chargeRatio', { label: '电荷比', min: 1, max: 3, step: 0.1, def: 2 });

reg({
  key: 'efHeteroUneven', cat: 'em', geom: 'box', label: '非等量异种电荷',
  icon: '<circle cx="5" cy="12" r="3" fill="#e53935"/>' +
        '<circle cx="19" cy="12" r="1.7" fill="#1e88e5"/>' +
        '<path d="M8 12L17 12" stroke-opacity="0.7"/>',
  params: ['chargeRatio'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const md = Math.min(b.w, b.h);
    const cy = b.y1 + b.h / 2;
    const dx = b.w * 0.18;
    const ratio = Math.max(1, Math.min(3, o.chargeRatio ?? 2));
    const charges = [
      { x: b.x1 + b.w / 2 - dx, y: cy, q:  ratio },
      { x: b.x1 + b.w / 2 + dx, y: cy, q: -1 }
    ];
    drawFieldLines(c, b, charges, { seedsPerCharge: 14 }, o.color, o.size);
    for (const ch of charges) {
      drawChargeMark(c, ch.x, ch.y, ch.q, chargeDotSize(md, ch.q, charges), o.color);
    }
  }
});

reg({
  key: 'efHomoUneven', cat: 'em', geom: 'box', label: '非等量同种电荷',
  icon: '<circle cx="5" cy="12" r="3" fill="#e53935"/>' +
        '<circle cx="19" cy="12" r="1.7" fill="#e53935"/>',
  params: ['chargeRatio'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const md = Math.min(b.w, b.h);
    const cy = b.y1 + b.h / 2;
    const dx = b.w * 0.18;
    const ratio = Math.max(1, Math.min(3, o.chargeRatio ?? 2));
    const charges = [
      { x: b.x1 + b.w / 2 - dx, y: cy, q: ratio },
      { x: b.x1 + b.w / 2 + dx, y: cy, q: 1 }
    ];
    drawFieldLines(c, b, charges, { seedsPerCharge: 12 }, o.color, o.size);
    for (const ch of charges) {
      drawChargeMark(c, ch.x, ch.y, ch.q, chargeDotSize(md, ch.q, charges), o.color);
    }
  }
});

paramDef('uniRows', { label: '条数', min: 2, max: 20, step: 1, def: 7 });
paramDef('uniDir',  { label: '方向', min: 0,  max: 1,  step: 1, def: 0 });
/* 1.3.0：箭头指向。0 = 右/下（原来的写法），1 = 左/上。拖动方向给的默认值见 P.DIRS。 */
paramDef('uniSign', { label: '指向', min: 0,  max: 1,  step: 1, def: 0 });

reg({
  key: 'efUniform', cat: 'em', geom: 'box', label: '匀强电场',
  icon: '<path d="M3 6h18M3 12h18M3 18h18"/>' +
        '<path d="M19 4l3 2-3 2M19 10l3 2-3 2M19 16l3 2-3 2"/>',
  params: ['uniRows', 'uniDir', 'uniSign'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const rows = Math.max(2, Math.round(o.uniRows ?? 7));
    const dir  = (o.uniDir ?? 0) < 0.5 ? 'h' : 'v';
    const sg   = (o.uniSign ?? 0) >= 0.5 ? -1 : 1;
    const ah   = Math.min(b.w, b.h) * 0.025;

    c.save();
    c.lineWidth   = Math.max(1, (o.size || 4) * 0.4);
    c.strokeStyle = o.color;
    c.fillStyle   = o.color;

    if (dir === 'h') {
      const gap = b.h / rows;
      for (let i = 0; i < rows; i++) {
        const y = b.y1 + gap * (i + 0.5);
        c.beginPath(); c.moveTo(b.x1, y); c.lineTo(b.x2, y); c.stroke();
        const ax = b.x1 + b.w * (sg > 0 ? 0.75 : 0.25);
        c.beginPath();
        c.moveTo(ax + ah * sg, y);
        c.lineTo(ax - ah * 0.3 * sg, y - ah * 0.6);
        c.lineTo(ax - ah * 0.3 * sg, y + ah * 0.6);
        c.closePath(); c.fill();
      }
    } else {
      const gap = b.w / rows;
      for (let i = 0; i < rows; i++) {
        const x = b.x1 + gap * (i + 0.5);
        c.beginPath(); c.moveTo(x, b.y1); c.lineTo(x, b.y2); c.stroke();
        const ay = b.y1 + b.h * (sg > 0 ? 0.75 : 0.25);
        c.beginPath();
        c.moveTo(x, ay + ah * sg);
        c.lineTo(x - ah * 0.6, ay - ah * 0.3 * sg);
        c.lineTo(x + ah * 0.6, ay - ah * 0.3 * sg);
        c.closePath(); c.fill();
      }
    }
    c.restore();
  }
});




/* ==========================================================================
 * 15. 文字
 * ========================================================================== */
reg({
  key: 'text', cat: 'text', geom: 'text', label: '文字',
  icon: '<path d="M5 6.5v-2h14v2"/><path d="M12 4.5v15"/><path d="M9 19.5h6"/>',

  fonts: {
    system:   'system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif',
    hei:      '"Microsoft YaHei","PingFang SC","Heiti SC","SimHei",sans-serif',
    song:     '"SimSun","Songti SC","STSong",serif',
    kai:      '"KaiTi","STKaiti","Kaiti SC",serif',
    fangsong: '"FangSong","STFangsong",serif',
    mono:     'ui-monospace,Menlo,Consolas,"Courier New",monospace',
    serif:    'Georgia,"Times New Roman",Times,serif',
    hand:     '"Comic Sans MS","Segoe Print","Bradley Hand",cursive'
  },

  params: ['fontFamily', 'fontSize', 'bold', 'italic', 'underline', 'textAlign'],

  textDefaults: {
    fontFamily: 'system',
    fontSize:   24,
    bold:       false,
    italic:     false,
    underline:  false,
    textAlign:  'left'
  },

  draw(c, o) {
    const fonts = this.fonts || {};
    const fam = fonts[o.fontFamily] || fonts.system ||
                'system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    const fs = Math.max(6, o.fontSize || 24);
    const raw = (o.text == null) ? '' : String(o.text);
    const lines = raw.split('\n');
    const lh = fs * 1.3;
    const align = o.textAlign || 'left';

    c.save();
    c.setLineDash([]);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.font = (o.italic ? 'italic ' : '') +
             (o.bold ? '700 ' : '400 ') + fs + 'px ' + fam;
    c.textBaseline = 'top';
    c.textAlign = (align === 'center' || align === 'right') ? align : 'left';

    let maxW = 0;
    for (let i = 0; i < lines.length; i++) {
      const w = c.measureText(lines[i]).width;
      if (w > maxW) maxW = w;
    }
    const totalH = lines.length * lh;

    if (o.fill && o.fillColor) {
      const padX = fs * 0.2;
      const padY = fs * 0.1;
      const a = (o.fillAlpha != null ? o.fillAlpha : 0.6);
      c.save();
      c.globalAlpha = Math.max(0, Math.min(1, a));
      c.fillStyle = o.fillColor;
      const bx = o.x - padX, by = o.y - padY;
      const bw = maxW + padX * 2, bh = totalH + padY * 2;
      const rx = Math.min(8, fs * 0.15);
      if (c.roundRect) {
        c.beginPath();
        c.roundRect(bx, by, bw, bh, rx);
        c.fill();
      } else {
        c.fillRect(bx, by, bw, bh);
      }
      c.restore();
    }

    const col = o.color || '#e6edf7';
    c.fillStyle = col;
    c.strokeStyle = col;

    let ax = o.x;
    if (align === 'center') ax = o.x + maxW / 2;
    else if (align === 'right') ax = o.x + maxW;

    for (let i = 0; i < lines.length; i++) {
      const y = o.y + i * lh;
      c.fillText(lines[i], ax, y);
      if (o.underline && lines[i]) {
        const w = c.measureText(lines[i]).width;
        let sx = ax;
        if (align === 'center') sx = ax - w / 2;
        else if (align === 'right') sx = ax - w;
        const uy = y + fs * 1.14;
        c.lineWidth = Math.max(1, fs / 16);
        c.beginPath();
        c.moveTo(sx, uy);
        c.lineTo(sx + w, uy);
        c.stroke();
      }
    }
    c.restore();
  }
});


/* ==========================================================================
 * 16. 力学补充（弹簧振子 / 纸带 / 连接体 / 板块模型 / 两物块弹簧）
 * ========================================================================== */

/* ---- 水平弹簧振子 ---- */
/* ---- 水平弹簧振子（ω=√(k/m)，x = A·cos ωt） ---- */

reg({
  key: 'springOscillator', cat: 'mech', geom: 'box', label: '弹簧振子', animatable: true,
  icon: '<path d="M3 3v18"/>' +
        '<path d="M3 12h1l1-3 2 6 2-6 2 6 2-6 1 3h1"/>' +
        '<rect x="16" y="7" width="6" height="10"/>',
  params: ['coils'],
  draw(c, o, GH) {
    // 1.1.11：地面、斜纹、墙、物块与 1.1.9 静态图逐笔一致；动画只让物块沿地面往复、弹簧随之伸缩。
    const AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: ANIM_T };
    const ph = (AN.t == null ? ANIM_T : AN.t) - ANIM_T;
    const b = GH.box(o);
    const { x1, y1, x2, y2, w, h } = b;

    const groundY  = y1 + h * 0.85;
    const blockH   = h * 0.35;
    const blockW   = Math.min(blockH, w * 0.18);
    const blockX0  = x2 - blockW - w * 0.02;
    const blockY   = groundY - blockH;
    const springCY = blockY + blockH / 2;

    const wallW    = Math.max(5, w * 0.04);
    const wallTop  = springCY - h * 0.20;
    const wallBot  = groundY;

    const amp = Math.max(6, Math.min(w * 0.18, blockX0 - (x1 + wallW) - blockW * 1.1));
    const blockX = blockX0 - amp * (1 - Math.cos(2 * Math.PI * ph / 2.2));

    c.beginPath();
    c.moveTo(x1, groundY);
    c.lineTo(x2, groundY);
    c.stroke();

    c.save();
    c.lineWidth = Math.max(0.7, (o.size || 4) * 0.45);
    for (let sx = x1 + 4; sx <= x2 - 4; sx += 12) {
      c.beginPath();
      c.moveTo(sx, groundY);
      c.lineTo(sx - 6, groundY + 8);
      c.stroke();
    }
    c.restore();

    c.save();
    c.fillStyle = 'rgba(120,120,120,0.35)';
    c.fillRect(x1, wallTop, wallW, wallBot - wallTop);
    c.strokeRect(x1, wallTop, wallW, wallBot - wallTop);
    c.restore();

    const sx1   = x1 + wallW;
    const sx2   = blockX;
    const coils = Math.max(4, Math.round(o.coils == null ? 10 : o.coils));
    const len   = sx2 - sx1;
    const ampY  = Math.min(h * 0.07, len * 0.08);
    const endFrac = 0.10;
    const s0 = sx1 + len * endFrac;
    const s1 = sx2 - len * endFrac;
    const segs = coils * 20;

    c.beginPath();
    c.moveTo(sx1, springCY);
    c.lineTo(s0, springCY);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = s0 + (s1 - s0) * t;
      const y = springCY + Math.sin(t * coils * Math.PI * 2) * ampY;
      c.lineTo(x, y);
    }
    c.lineTo(sx2, springCY);
    c.stroke();

    c.save();
    c.fillStyle = 'rgba(100,150,200,0.35)';
    c.fillRect(blockX, blockY, blockW, blockH);
    c.strokeRect(blockX, blockY, blockW, blockH);
    c.restore();

    c.save();
    c.fillStyle = o.color || '#1a1a1a';
    const fs = Math.min(blockW, blockH) * 0.55;
    c.font = 'italic bold ' + fs + 'px system-ui,sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('m', blockX + blockW / 2, blockY + blockH / 2);
    c.restore();
  }
});

/* ---- 竖直弹簧振子 ---- */
/* ---- 竖直弹簧振子（平衡位置上下振动，y = −A·cos ωt） ---- */

reg({
  key: 'springOscV', cat: 'mech', geom: 'box', label: '竖直弹簧振子', animatable: true,
  icon: '<path d="M3 3h18"/>' +
        '<path d="M12 3v1l-3 1.5 6 3-6 3 6 3-6 3 3 1.5v1"/>' +
        '<rect x="7" y="17" width="10" height="5"/>',
  params: ['coils'],
  draw(c, o, GH) {
    // 1.1.11：天花板、斜纹、物块与 1.1.9 静态图逐笔一致；动画只让物块上下、弹簧随之伸缩。
    const AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: ANIM_T };
    const ph = (AN.t == null ? ANIM_T : AN.t) - ANIM_T;
    const b = GH.box(o);
    const { x1, y1, x2, y2, w, h } = b;

    const cx = (x1 + x2) / 2;

    const ceilH    = Math.max(4, h * 0.03);
    const blockW   = Math.min(w * 0.45, h * 0.22);
    const blockH   = blockW * 0.75;
    const blockBot0 = y2;
    const blockTop0 = blockBot0 - blockH;
    const blockL   = cx - blockW / 2;
    const blockR   = cx + blockW / 2;

    const springTop = y1 + ceilH;
    const amp = Math.max(6, Math.min(h * 0.26, blockTop0 - springTop - blockH * 0.9));
    const dy = -amp * (1 - Math.cos(2 * Math.PI * ph / 2.4));
    const blockTop = blockTop0 + dy;
    const springBot = blockTop;

    c.save();
    c.fillStyle = 'rgba(120,120,120,0.35)';
    c.fillRect(x1, y1, w, ceilH);
    c.strokeRect(x1, y1, w, ceilH);
    c.restore();

    c.save();
    c.lineWidth = Math.max(0.7, (o.size || 4) * 0.45);
    for (let sx = x1 + 6; sx <= x2 - 6; sx += 14) {
      c.beginPath();
      c.moveTo(sx, y1 + ceilH);
      c.lineTo(sx + 6, y1);
      c.stroke();
    }
    c.restore();

    const len   = springBot - springTop;
    const coils = Math.max(4, Math.round(o.coils == null ? 10 : o.coils));
    const ampX  = Math.min(w * 0.12, len * 0.07);
    const endFrac = 0.10;
    const s0 = springTop + len * endFrac;
    const s1 = springBot - len * endFrac;
    const segs = coils * 20;

    c.beginPath();
    c.moveTo(cx, springTop);
    c.lineTo(cx, s0);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = s0 + (s1 - s0) * t;
      const x = cx + Math.sin(t * coils * Math.PI * 2) * ampX;
      c.lineTo(x, y);
    }
    c.lineTo(cx, springBot);
    c.stroke();

    c.save();
    c.fillStyle = 'rgba(100,150,200,0.35)';
    c.fillRect(blockL, blockTop, blockW, blockH);
    c.strokeRect(blockL, blockTop, blockW, blockH);
    c.restore();

    c.save();
    c.fillStyle = o.color || '#1a1a1a';
    const fs = Math.min(blockW, blockH) * 0.62;
    c.font = 'italic bold ' + fs + 'px system-ui,sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('m', cx, blockTop + blockH / 2);
    c.restore();
  }
});

/* ---- 打点计时器纸带 ---- */
paramDef('tapeDots',  { label: '点数',   min: 3,  max: 20, step: 1,   def: 7   });
paramDef('tapeAccel', { label: '加速度', min: -3, max: 3,  step: 0.1, def: 1.5 });

reg({
  key: 'tickerTape', cat: 'mech', geom: 'box', label: '纸带',
  icon: '<rect x="2" y="9" width="20" height="6" rx="1"/>' +
        '<circle cx="5.5"  cy="12" r="0.8" fill="currentColor"/>' +
        '<circle cx="8.5"  cy="12" r="0.8" fill="currentColor"/>' +
        '<circle cx="12.5" cy="12" r="0.8" fill="currentColor"/>' +
        '<circle cx="18"   cy="12" r="0.8" fill="currentColor"/>',
  params: ['tapeDots', 'tapeAccel'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const { x1, y1, x2, y2, w, h } = b;
    const cy = (y1 + y2) / 2;

    c.save();
    // 2.0.9：纸带底色改为可覆盖（o.paperColor），默认仍是纯白 —— 纸带就是白纸条，
    // 换成墨色会让黑打点在浅底上彻底看不见，所以默认值不动。这里只把"写死"变成"有来源"。
    c.fillStyle = o.paperColor || '#ffffff';
    c.fillRect(x1, y1, w, h);
    c.strokeRect(x1, y1, w, h);
    c.restore();

    const n = Math.max(4, Math.round(o.tapeDots ?? 7));
    const a = Math.max(-3, Math.min(3, o.tapeAccel ?? 1.5));
    const t = a / 3;
    const dd = t * (0.9 / (n - 1));
    const d0 = 1 - ((n - 2) / 2) * dd;

    const positions = [0];
    let d = d0;
    for (let i = 1; i < n; i++) {
      positions.push(positions[i - 1] + d);
      d += dd;
    }
    const total = positions[n - 1];

    const margin = 0.06;
    const usable = 1 - 2 * margin;
    const dotR = Math.min(h * 0.16, (w / n) * 0.28);

    c.save();
    c.fillStyle = o.dotColor || '#000000';
    for (let i = 0; i < n; i++) {
      const px = x1 + w * (margin + usable * positions[i] / total);
      c.beginPath();
      c.arc(px, cy, Math.max(1, dotR), 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
});

/* ---- 两物块 + 弹簧（质心不动，ω = √(k(m1+m2)/(m1m2))） ---- */
paramDef('twoBlockCoils', { label: '圈数', min: 4, max: 30, step: 1, def: 10 });
paramDef('twoBlockComp',  { label: '压缩', min: -1, max: 1,  step: 0.1, def: 0 });

reg({
  key: 'twoBlocksSpring', cat: 'mech', geom: 'box', label: '两物块弹簧',
  icon: '<rect x="2" y="8" width="5" height="8"/>' +
        '<path d="M7 12h1l1-3 2 6 2-6 2 6 1-3h1"/>' +
        '<rect x="17" y="8" width="5" height="8"/>',
  params: ['twoBlockCoils', 'twoBlockComp'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const { x1, y1, x2, y2, w, h } = b;
    const cy = (y1 + y2) / 2;

    const blockH = h * 0.55;
    const blockW = Math.min(w * 0.20, blockH * 0.9);
    const blockTop = cy - blockH / 2;
    const blockBot = cy + blockH / 2;

    const comp   = Math.max(-1, Math.min(1, o.twoBlockComp ?? 0));
    const gapMax = w - 2 * blockW;
    const gap    = gapMax * (0.65 - 0.35 * comp);
    const midGap = Math.max(blockW * 0.5, gap);

    const totalW = 2 * blockW + midGap;
    const startX = (x1 + x2 - totalW) / 2;

    const leftL  = startX;
    const leftR  = leftL + blockW;
    const rightL = leftR + midGap;
    const rightR = rightL + blockW;

    c.save();
    c.fillStyle = 'rgba(100,150,200,0.35)';
    c.fillRect(leftL, blockTop, blockW, blockH);
    c.strokeRect(leftL, blockTop, blockW, blockH);
    c.restore();

    c.save();
    c.fillStyle = 'rgba(200,120,100,0.35)';
    c.fillRect(rightL, blockTop, blockW, blockH);
    c.strokeRect(rightL, blockTop, blockW, blockH);
    c.restore();

    const sx1 = leftR;
    const sx2 = rightL;
    const coils = Math.max(4, Math.round(o.twoBlockCoils ?? 10));
    const len = sx2 - sx1;
    const amp = Math.min(h * 0.10, len * 0.14);

    if (len > 4) {
      const endFrac = 0.10;
      const s0 = sx1 + len * endFrac;
      const s1 = sx2 - len * endFrac;
      const segs = coils * 20;

      c.beginPath();
      c.moveTo(sx1, cy);
      c.lineTo(s0, cy);
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const x = s0 + (s1 - s0) * t;
        const y = cy + Math.sin(t * coils * Math.PI * 2) * amp;
        c.lineTo(x, y);
      }
      c.lineTo(sx2, cy);
      c.stroke();
    } else {
      c.beginPath();
      c.moveTo(sx1, cy);
      c.lineTo(sx2, cy);
      c.stroke();
    }

    c.save();
    c.fillStyle = o.color || '#1a1a1a';
    const fs = Math.min(blockW, blockH) * 0.55;
    c.font = 'italic bold ' + fs + 'px system-ui,sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('m\u2081', leftL  + blockW / 2, cy);
    c.fillText('m\u2082', rightL + blockW / 2, cy);
    c.restore();
  }
});

/* ---- 板块模型（a₁=−μg，a₂=+μg·m/M，共速后一起匀速） ---- */
paramDef('plateShift', { label: '物块位置', min: 0, max: 0.9, step: 0.01, def: 0.2 });

reg({
  key: 'blockOnBoard', cat: 'mech', geom: 'box', label: '板块模型',
  icon: '<rect x="2"  y="11" width="20" height="4"/>' +
        '<rect x="4"  y="5"  width="7"  height="6"/>' +
        '<path d="M2 15h20"/>',
  params: ['plateShift'],
  draw(c, o, GH) {
    const b = GH.box(o);
    const { x1, y1, x2, y2, w, h } = b;

    const groundY  = y2;
    const boardH   = h * 0.14;
    const boardTop = groundY - boardH;
    const boardBot = groundY;

    const blockH   = h * 0.36;
    const blockW   = w * 0.22;
    const blockBot = boardTop;
    const blockTop = blockBot - blockH;

    const shift   = Math.max(0, Math.min(1, o.plateShift ?? 0.25));
    const padX    = w * 0.04;
    const usable  = w - blockW - padX * 2;
    const blockL  = x1 + padX + usable * shift;
    const blockR  = blockL + blockW;

    c.beginPath();
    c.moveTo(x1, groundY);
    c.lineTo(x2, groundY);
    c.stroke();

    c.save();
    c.lineWidth = Math.max(0.7, (o.size || 4) * 0.45);
    for (let sx = x1 + 4; sx <= x2 - 4; sx += 12) {
      c.beginPath();
      c.moveTo(sx, groundY);
      c.lineTo(sx - 6, groundY + 8);
      c.stroke();
    }
    c.restore();

    c.save();
    c.fillStyle = 'rgba(180,150,110,0.55)';
    c.fillRect(x1, boardTop, w, boardH);
    c.strokeRect(x1, boardTop, w, boardH);
    c.restore();

    c.save();
    c.fillStyle = 'rgba(100,150,200,0.45)';
    c.fillRect(blockL, blockTop, blockW, blockH);
    c.strokeRect(blockL, blockTop, blockW, blockH);
    c.restore();

    c.save();
    c.fillStyle = o.color || '#1a1a1a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    const fs1 = Math.min(blockW, blockH) * 0.55;
    c.font = 'italic bold ' + fs1 + 'px system-ui,sans-serif';
    c.fillText('m', blockL + blockW / 2, blockTop + blockH / 2);

    const fs2 = Math.min(boardH * 1.0, w * 0.06);
    c.font = 'italic bold ' + fs2 + 'px system-ui,sans-serif';
    const mRightZone = blockR + (x2 - blockR) / 2;
    const mLeftZone  = x1 + (blockL - x1) / 2;
    const labelX = (mRightZone - blockR > blockW * 0.6) ? mRightZone : mLeftZone;
    c.fillText('M', labelX, boardTop + boardH / 2);
    c.restore();
  }
});

/* ---- 连接体 ---- */
/* ---- 连接体（a=(m2g−μm1g)/(m1+m2)，绳张力 T=m1(a+μg)） ---- */

reg({
  key: 'connectorBlocks', cat: 'mech', geom: 'box', label: '连接体',
  icon: '<rect x="2" y="12" width="8" height="6"/>' +
        '<circle cx="14" cy="8" r="2"/>' +
        '<rect x="17" y="10" width="5" height="8"/>' +
        '<path d="M10 15h4M14 10l5 0M16 8h3"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const w = b.w, h = b.h;
    const tableY = b.y1 + h * 0.35;
    c.beginPath();
    c.moveTo(b.x1, tableY); c.lineTo(b.x2 - w * 0.20, tableY);
    c.stroke();
    const blkW = w * 0.22, blkH = h * 0.18;
    c.beginPath();
    c.rect(b.x1 + w * 0.05, tableY - blkH, blkW, blkH);
    c.stroke();

    const ropeY = tableY - blkH / 2;

    const pulR = h * 0.06;
    const pulX = b.x2 - w * 0.08;
    const pulY = ropeY + pulR;
    c.beginPath(); c.arc(pulX, pulY, pulR, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(pulX, pulY, pulR * 0.15, 0, Math.PI * 2);
    c.fillStyle = o.color; c.fill();

    c.beginPath();
    c.moveTo(b.x1 + w * 0.05 + blkW, ropeY);
    c.lineTo(pulX, ropeY);
    c.stroke();

    const hangX = pulX + pulR;
    const hangTop = b.y2 - h * 0.18;
    c.beginPath();
    c.moveTo(hangX, pulY);
    c.lineTo(hangX, hangTop);
    c.stroke();
    c.beginPath();
    c.rect(hangX - w * 0.09, hangTop, w * 0.18, h * 0.18);
    c.stroke();
  }
});


/* ==========================================================================
 * 17. 简笔画
 * ========================================================================== */

reg({
  key: 'skPerson', cat: 'sketch', geom: 'box', label: '人',
  icon: '<circle cx="12" cy="5" r="2.5"/>' +
        '<path d="M12 8v7M8 11l4-3 4 3M12 15l-3 6M12 15l3 6"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = (b.x1 + b.x2) / 2;
    const w = b.w, h = b.h;
    const headR  = Math.min(w * 0.16, h * 0.12);
    const headCY = b.y1 + headR + h * 0.02;

    /* ---- 头 ---- */
    c.beginPath();
    c.arc(cx, headCY, headR, 0, Math.PI * 2);
    c.stroke();

    /* ---- 脖子 ---- */
    c.beginPath();
    c.moveTo(cx, headCY + headR);
    c.lineTo(cx, headCY + headR + h * 0.02);
    c.stroke();

    /* ---- 身体（梯形躯干） ---- */
    const neckY  = headCY + headR + h * 0.02;
    const hipY   = b.y1 + h * 0.58;
    const shoulderW = w * 0.24;
    const hipW      = w * 0.18;
    c.beginPath();
    c.moveTo(cx - shoulderW, neckY);
    c.lineTo(cx + shoulderW, neckY);
    c.lineTo(cx + hipW,      hipY);
    c.lineTo(cx - hipW,      hipY);
    c.closePath();
    c.stroke();

    /* ---- 手臂（带一点自然弧度） ---- */
    const armY = neckY + h * 0.06;
    const armD = h * 0.20;
    c.beginPath();
    c.moveTo(cx - shoulderW, armY);
    c.quadraticCurveTo(cx - shoulderW - w * 0.06, armY + armD * 0.55,
                       cx - shoulderW - w * 0.02, armY + armD);
    c.stroke();
    c.beginPath();
    c.moveTo(cx + shoulderW, armY);
    c.quadraticCurveTo(cx + shoulderW + w * 0.06, armY + armD * 0.55,
                       cx + shoulderW + w * 0.02, armY + armD);
    c.stroke();

    /* ---- 腿（略微外八字） ---- */
    const legSpread = w * 0.05;
    c.beginPath();
    c.moveTo(cx - hipW * 0.55, hipY);
    c.lineTo(cx - legSpread - hipW * 0.3, b.y2 - h * 0.02);
    c.stroke();
    c.beginPath();
    c.moveTo(cx + hipW * 0.55, hipY);
    c.lineTo(cx + legSpread + hipW * 0.3, b.y2 - h * 0.02);
    c.stroke();

    /* ---- 脚（小横线） ---- */
    c.beginPath();
    c.moveTo(cx - legSpread - hipW * 0.55, b.y2 - h * 0.02);
    c.lineTo(cx - legSpread + hipW * 0.05, b.y2 - h * 0.02);
    c.moveTo(cx + legSpread - hipW * 0.05, b.y2 - h * 0.02);
    c.lineTo(cx + legSpread + hipW * 0.55, b.y2 - h * 0.02);
    c.stroke();
  }
});


reg({
  key: 'skDrone', cat: 'sketch', geom: 'box', label: '无人机',
  icon: '<rect x="6" y="11" width="12" height="3" rx="1"/>' +
        '<path d="M8 11V7M16 11V7M3 7h18"/>' +
        '<circle cx="6" cy="7" r="1.5"/><circle cx="18" cy="7" r="1.5"/>' +
        '<path d="M8 14v3M16 14v3"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const w = b.w, h = b.h;
    const cx = (b.x1 + b.x2) / 2;
    const cy = b.y1 + h * 0.55;

    const bodyW = w * 0.46;
    const bodyH = h * 0.16;
    const bodyL = cx - bodyW / 2;
    const bodyR = cx + bodyW / 2;
    const bodyT = cy - bodyH / 2;
    const bodyB = cy + bodyH / 2;

    const armLen = bodyW * 0.85;       // 到旋翼的水平距离
    const armTopY = cy - h * 0.24;     // 旋翼平面高度
    const armOuterL = cx - armLen / 2 - bodyW * 0.15;
    const armOuterR = cx + armLen / 2 + bodyW * 0.15;

    /* ---- 起落架（两个小支架） ---- */
    c.beginPath();
    c.moveTo(cx - bodyW * 0.28, bodyB);
    c.lineTo(cx - bodyW * 0.34, b.y2 - h * 0.02);
    c.lineTo(cx - bodyW * 0.42, b.y2 - h * 0.02);
    c.stroke();
    c.beginPath();
    c.moveTo(cx + bodyW * 0.28, bodyB);
    c.lineTo(cx + bodyW * 0.34, b.y2 - h * 0.02);
    c.lineTo(cx + bodyW * 0.42, b.y2 - h * 0.02);
    c.stroke();

    /* ---- 机臂（从机身斜向上延伸到旋翼） ---- */
    c.beginPath();
    c.moveTo(bodyL + bodyW * 0.15, bodyT);
    c.lineTo(armOuterL, armTopY);
    c.stroke();
    c.beginPath();
    c.moveTo(bodyR - bodyW * 0.15, bodyT);
    c.lineTo(armOuterR, armTopY);
    c.stroke();

    /* ---- 机身（圆角矩形 + 中间云台凸起） ---- */
    const rr = Math.min(bodyW, bodyH) * 0.28;
    c.beginPath();
    if (c.roundRect) c.roundRect(bodyL, bodyT, bodyW, bodyH, rr);
    else c.rect(bodyL, bodyT, bodyW, bodyH);
    c.stroke();

    /* 机身前脸（正视图能看到的小镜头） */
    c.beginPath();
    c.arc(cx + bodyW * 0.22, cy, bodyH * 0.22, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(cx + bodyW * 0.22, cy, bodyH * 0.08, 0, Math.PI * 2);
    c.fillStyle = o.color || '#1a1a1a';
    c.fill();

    /* ---- 左右两组旋翼（正视图：看到一条水平横杆 + 两侧小电机） ---- */
    const rotorBarLen = bodyW * 0.16;
    const rotorR = h * 0.045;

    /* 左旋翼 */
    c.beginPath();
    c.moveTo(armOuterL - rotorBarLen, armTopY);
    c.lineTo(armOuterL + rotorBarLen, armTopY);
    c.stroke();
    c.beginPath();
    c.arc(armOuterL, armTopY, rotorR, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(armOuterL, armTopY, rotorR * 0.25, 0, Math.PI * 2);
    c.fillStyle = o.color || '#1a1a1a';
    c.fill();

    /* 右旋翼 */
    c.beginPath();
    c.moveTo(armOuterR - rotorBarLen, armTopY);
    c.lineTo(armOuterR + rotorBarLen, armTopY);
    c.stroke();
    c.beginPath();
    c.arc(armOuterR, armTopY, rotorR, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(armOuterR, armTopY, rotorR * 0.25, 0, Math.PI * 2);
    c.fillStyle = o.color || '#1a1a1a';
    c.fill();
  }
});


reg({
  key: 'skRobotDog', cat: 'sketch', geom: 'box', label: '机器狗',
  icon: '<rect x="5" y="10" width="12" height="6" rx="1"/>' +
        '<path d="M17 9l3-2v6l-3-1"/>' +
        '<path d="M6 16v4M9 16v4M15 16v4M18 16v4"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const w = b.w, h = b.h;
    const cx = (b.x1 + b.x2) / 2;

    const bodyW = w * 0.58;
    const bodyH = h * 0.30;
    const bodyL = cx - bodyW / 2 - w * 0.06;
    const bodyR = bodyL + bodyW;
    const bodyT = b.y1 + h * 0.38;
    const bodyB = bodyT + bodyH;

    /* ---- 身体（带圆角） ---- */
    const rr = Math.min(bodyW, bodyH) * 0.18;
    c.beginPath();
    if (c.roundRect) c.roundRect(bodyL, bodyT, bodyW, bodyH, rr);
    else c.rect(bodyL, bodyT, bodyW, bodyH);
    c.stroke();

    /* ---- 头部 ---- */
    const headW = w * 0.24;
    const headH = h * 0.24;
    const headL = bodyR - w * 0.01;
    const headT = bodyT - h * 0.08;

    const rr2 = Math.min(headW, headH) * 0.20;
    c.beginPath();
    if (c.roundRect) c.roundRect(headL, headT, headW, headH, rr2);
    else c.rect(headL, headT, headW, headH);
    c.stroke();

    /* 耳朵 / 天线 */
    c.beginPath();
    c.moveTo(headL + headW * 0.30, headT);
    c.lineTo(headL + headW * 0.24, headT - h * 0.10);
    c.stroke();
    c.beginPath();
    c.arc(headL + headW * 0.24, headT - h * 0.10, Math.max(1.5, h * 0.015), 0, Math.PI * 2);
    c.fillStyle = o.color || '#1a1a1a';
    c.fill();

    /* 摄像头（眼睛） */
    c.beginPath();
    c.arc(headL + headW * 0.72, headT + headH * 0.40, headH * 0.12, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(headL + headW * 0.72, headT + headH * 0.40, headH * 0.05, 0, Math.PI * 2);
    c.fillStyle = o.color || '#1a1a1a';
    c.fill();

    /* ---- 四条腿（膝关节可见） ---- */
    const legTopY = bodyB;
    const kneeY   = bodyB + h * 0.18;
    const footY   = b.y2 - h * 0.02;

    const legXs = [
      bodyL + bodyW * 0.18,
      bodyL + bodyW * 0.40,
      bodyL + bodyW * 0.62,
      bodyL + bodyW * 0.86
    ];

    legXs.forEach((x, i) => {
      /* 大腿 */
      c.beginPath();
      c.moveTo(x, legTopY);
      c.lineTo(x + (i < 2 ? -w * 0.02 : w * 0.02), kneeY);
      c.stroke();
      /* 小腿 */
      c.beginPath();
      c.moveTo(x + (i < 2 ? -w * 0.02 : w * 0.02), kneeY);
      c.lineTo(x, footY);
      c.stroke();
      /* 脚掌小横线 */
      c.beginPath();
      c.moveTo(x - w * 0.025, footY);
      c.lineTo(x + w * 0.025, footY);
      c.stroke();
      /* 膝关节小圆点 */
      c.beginPath();
      c.arc(x + (i < 2 ? -w * 0.02 : w * 0.02), kneeY,
            Math.max(1.5, h * 0.015), 0, Math.PI * 2);
      c.stroke();
    });

    /* ---- 尾巴 ---- */
    c.beginPath();
    c.moveTo(bodyL, bodyT + bodyH * 0.4);
    c.quadraticCurveTo(bodyL - w * 0.06, bodyT + bodyH * 0.2,
                       bodyL - w * 0.05, bodyT - h * 0.04);
    c.stroke();
  }
});

reg({
  key: 'skTrain', cat: 'sketch', geom: 'box', label: '火车',
  icon: '<rect x="3" y="9" width="10" height="8"/>' +
        '<rect x="13" y="11" width="8" height="6"/>' +
        '<circle cx="6" cy="19" r="2"/>' +
        '<circle cx="17" cy="19" r="2"/>' +
        '<path d="M5 9V6h4v3"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const w = b.w, h = b.h;

    const bodyBot = b.y1 + h * 0.76;
    const bodyTop = b.y1 + h * 0.34;
    const wheelY  = bodyBot + h * 0.10;
    const wr      = h * 0.09;

    /* 轨道 */
    c.beginPath();
    c.moveTo(b.x1 - w * 0.02, wheelY + wr + h * 0.03);
    c.lineTo(b.x2 + w * 0.02, wheelY + wr + h * 0.03);
    c.stroke();

    /* ---- 车头 ---- */
    const lw = w * 0.55;
    const rr1 = Math.min(lw, bodyBot - bodyTop) * 0.10;
    c.beginPath();
    if (c.roundRect) c.roundRect(b.x1, bodyTop, lw, bodyBot - bodyTop, rr1);
    else c.rect(b.x1, bodyTop, lw, bodyBot - bodyTop);
    c.stroke();

    /* 烟囱 */
    c.beginPath();
    c.rect(b.x1 + w * 0.10, b.y1 + h * 0.16, w * 0.11, h * 0.20);
    c.stroke();
    c.beginPath();
    c.arc(b.x1 + w * 0.155, b.y1 + h * 0.14, w * 0.055, Math.PI, 0);
    c.stroke();
    /* 蒸汽（两个小圆圈） */
    c.beginPath();
    c.arc(b.x1 + w * 0.155, b.y1 + h * 0.06, w * 0.025, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(b.x1 + w * 0.20, b.y1 + h * 0.02, w * 0.020, 0, Math.PI * 2);
    c.stroke();

    /* 车头大灯 */
    c.beginPath();
    c.arc(b.x1 + w * 0.36, bodyTop + h * 0.10, h * 0.05, 0, Math.PI * 2);
    c.stroke();

    /* 驾驶室窗 */
    c.beginPath();
    c.rect(b.x1 + w * 0.42, bodyTop + h * 0.06, w * 0.09, h * 0.14);
    c.stroke();

    /* ---- 车厢 ---- */
    const cw = w * 0.40;
    const ct = bodyTop + h * 0.10;
    const cb = bodyBot;
    const rr2 = Math.min(cw, cb - ct) * 0.10;
    c.beginPath();
    if (c.roundRect) c.roundRect(b.x2 - cw, ct, cw, cb - ct, rr2);
    else c.rect(b.x2 - cw, ct, cw, cb - ct);
    c.stroke();

    /* 车厢窗（三个小方窗） */
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.rect(b.x2 - cw + w * 0.04 + i * (cw - w * 0.08) / 3,
             ct + h * 0.05,
             (cw - w * 0.08) / 3 - w * 0.02,
             h * 0.12);
      c.stroke();
    }

    /* ---- 车轮 ---- */
    [0.14, 0.34, 0.62, 0.82].forEach(f => {
      c.beginPath();
      c.arc(b.x1 + w * f, wheelY, wr, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(b.x1 + w * f, wheelY, wr * 0.30, 0, Math.PI * 2);
      c.fillStyle = o.color || '#1a1a1a';
      c.fill();
    });

    /* ---- 连接钩（车头与车厢之间） ---- */
    c.beginPath();
    c.moveTo(b.x1 + lw, wheelY - h * 0.02);
    c.lineTo(b.x2 - cw, wheelY - h * 0.02);
    c.stroke();
  }
});



reg({
  key: 'skHSR', cat: 'sketch', geom: 'box', label: '高铁',
  icon: '<path d="M3 15V9q0-2 3-3l3-1h9q3 0 3 3v7z"/>' +
        '<circle cx="7" cy="17" r="2"/>' +
        '<circle cx="17" cy="17" r="2"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const w = b.w, h = b.h;
    const bodyBot = b.y1 + h * 0.70;
    const bodyTop = b.y1 + h * 0.28;
    const wheelY  = bodyBot + h * 0.11;
    const wr      = h * 0.075;

    /* 轨道 */
    c.beginPath();
    c.moveTo(b.x1 - w * 0.02, wheelY + wr + h * 0.025);
    c.lineTo(b.x2 + w * 0.02, wheelY + wr + h * 0.025);
    c.stroke();

    /* ---- 车身（流线型：车头圆弧 + 车顶平直） ---- */
    c.beginPath();
    c.moveTo(b.x1, bodyBot);
    c.quadraticCurveTo(b.x1 - w * 0.02, bodyTop + h * 0.05,
                       b.x1 + w * 0.10, bodyTop);
    c.lineTo(b.x2 - w * 0.05, bodyTop);
    c.quadraticCurveTo(b.x2, bodyTop, b.x2, bodyTop + h * 0.06);
    c.lineTo(b.x2, bodyBot);
    c.closePath();
    c.stroke();

    /* ---- 侧窗（一条流线窗带） ---- */
    const winY = bodyTop + h * 0.10;
    const winH = h * 0.13;
    const rrW = Math.min(winH * 0.5, w * 0.01);

    for (let i = 0; i < 5; i++) {
      const wl = b.x1 + w * (0.13 + i * 0.17);
      const ww = w * 0.14;
      if (wl + ww > b.x2 - w * 0.04) break;

      c.beginPath();
      if (c.roundRect) {
        c.roundRect(wl, winY, ww, winH, rrW);
      } else {
        c.rect(wl, winY, ww, winH);
      }
      c.stroke();
    }

    /* 车头大灯 */
    c.beginPath();
    c.arc(b.x1 + w * 0.06, bodyBot - h * 0.08, h * 0.025, 0, Math.PI * 2);
    c.fillStyle = o.color || '#1a1a1a';
    c.fill();

    /* ---- 车轮 ---- */
    [0.20, 0.48, 0.76].forEach(f => {
      c.beginPath();
      c.arc(b.x1 + w * f, wheelY, wr, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(b.x1 + w * f, wheelY, wr * 0.32, 0, Math.PI * 2);
      c.fillStyle = o.color || '#1a1a1a';
      c.fill();
    });
  }
});



reg({
  key: 'skBike', cat: 'sketch', geom: 'box', label: '自行车',
  icon: '<circle cx="5" cy="17" r="3.5"/><circle cx="19" cy="17" r="3.5"/>' +
        '<path d="M5 17h5M5 17l3-8h8l3 8M10 17l6-8M10 17l-2-8"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const w = b.w, h = b.h;

    /* 车轮半径、车轮中心 */
    const r  = Math.min(h * 0.24, w * 0.17);
    const cy = b.y2 - r;
    const rx = b.x1 + r;      // 后轮花鼓
    const fx = b.x2 - r;      // 前轮花鼓

    /* 五通（脚踏中心）*/
    const bx = rx + (fx - rx) * 0.42;
    const by = cy + r * 0.10;

    /* 座管束（坐垫位置）*/
    const sx = bx - r * 0.80;
    const sy = b.y1 + h * 0.38;

    /* 头管顶部（车把下方）*/
    const hx = fx - w * 0.03;
    const hy = b.y1 + h * 0.40;

    /* ---- 车轮（双圈 + 花鼓 + 辐条）---- */
    [rx, fx].forEach(cx => {
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(cx, cy, r * 0.78, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(cx, cy, r * 0.10, 0, Math.PI * 2);
      c.fillStyle = o.color || '#1a1a1a'; c.fill(); c.stroke();

      c.save();
      c.lineWidth = Math.max(0.5, (o.size || 4) * 0.28);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * r * 0.10, cy + Math.sin(a) * r * 0.10);
        c.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
        c.stroke();
      }
      c.restore();
    });

    /* ---- 车架（菱形）---- */
    c.beginPath();
    c.moveTo(rx, cy); c.lineTo(bx, by);   // 后下叉
    c.moveTo(rx, cy); c.lineTo(sx, sy);   // 后上叉
    c.moveTo(bx, by); c.lineTo(sx, sy);   // 座管
    c.moveTo(bx, by); c.lineTo(hx, hy);   // 下管
    c.moveTo(sx, sy); c.lineTo(hx, hy);   // 上管
    c.moveTo(hx, hy); c.lineTo(fx, cy);   // 前叉
    c.stroke();

    /* ---- 坐垫 ---- */
    c.beginPath();
    c.moveTo(sx - r * 0.55, sy - r * 0.02);
    c.quadraticCurveTo(sx + r * 0.05, sy - r * 0.18,
                       sx + r * 0.32, sy - r * 0.04);
    c.stroke();
    c.beginPath();
    c.moveTo(sx, sy - r * 0.02); c.lineTo(sx, sy + r * 0.06);
    c.stroke();

    /* ---- 车把 ---- */
    c.beginPath();
    c.moveTo(hx, hy); c.lineTo(hx, hy - h * 0.07);
    c.stroke();
    c.beginPath();
    c.moveTo(hx - r * 0.34, hy - h * 0.07);
    c.lineTo(hx + r * 0.28, hy - h * 0.07);
    c.stroke();

    /* ---- 牙盘 + 曲柄 + 脚踏 ---- */
    c.beginPath(); c.arc(bx, by, r * 0.24, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(bx, by, r * 0.06, 0, Math.PI * 2); c.stroke();

    c.beginPath();
    c.moveTo(bx, by); c.lineTo(bx + r * 0.28, by - r * 0.46);
    c.stroke();
    c.beginPath();
    c.moveTo(bx + r * 0.16, by - r * 0.46);
    c.lineTo(bx + r * 0.42, by - r * 0.46);
    c.stroke();

    c.beginPath();
    c.moveTo(bx, by); c.lineTo(bx - r * 0.28, by + r * 0.46);
    c.stroke();
    c.beginPath();
    c.moveTo(bx - r * 0.42, by + r * 0.46);
    c.lineTo(bx - r * 0.16, by + r * 0.46);
    c.stroke();
  }
});

reg({
  key: 'skMoto', cat: 'sketch', geom: 'box', label: '摩托车',
  icon: '<circle cx="5" cy="17" r="3.5"/><circle cx="19" cy="17" r="3.5"/>' +
        '<path d="M5 17l5-6h5l4 6M15 11l-2-4h4M10 12l1 5"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const w = b.w, h = b.h;

    /* 车轮 */
    const rF = Math.min(h * 0.24, w * 0.17);   // 前轮半径
    const rR = rF * 0.92;                       // 后轮稍小
    const cy = b.y2 - rF;
    const fx = b.x2 - rF;
    const rx = b.x1 + rR;

    /* 转向头 */
    const stX = fx - w * 0.06;
    const stY = b.y1 + h * 0.26;

    /* 车把 */
    const hbY = b.y1 + h * 0.10;
    const hbX = stX - w * 0.02;

    /* 油箱 */
    const tkX1 = stX - w * 0.13;    // 油箱后缘
    const tkX2 = stX - w * 0.01;    // 油箱前缘
    const tkTopY = stY - h * 0.02;
    const tkBotY = stY + h * 0.12;

    /* 座椅 */
    const seX1 = b.x1 + w * 0.16;
    const seX2 = tkX1 + w * 0.01;
    const seY  = tkBotY - h * 0.01;

    /* 发动机 */
    const enX = rx + (fx - rx) * 0.50;
    const enY = cy - rF * 0.20;
    const enW = w * 0.16;
    const enH = h * 0.16;

    /* 后摇臂枢轴 */
    const pvX = enX + w * 0.02;
    const pvY = enY + enH * 0.55;

    /* ---- 车轮（双圈 + 轮毂 + 辐条）---- */
    [[rx, rR], [fx, rF]].forEach(([cx, r]) => {
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(cx, cy, r * 0.74, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
      c.fillStyle = o.color || '#1a1a1a'; c.fill(); c.stroke();

      c.save();
      c.lineWidth = Math.max(0.6, (o.size || 4) * 0.34);
      for (let i = 0; i < 5; i++) {
        const a = i * 2 * Math.PI / 5 - Math.PI / 2;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * r * 0.18, cy + Math.sin(a) * r * 0.18);
        c.lineTo(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74);
        c.stroke();
      }
      c.restore();
    });

    /* ---- 前叉 ---- */
    c.beginPath();
    c.moveTo(stX, stY); c.lineTo(fx, cy);
    c.stroke();

    /* ---- 后摇臂 ---- */
    c.beginPath();
    c.moveTo(pvX, pvY); c.lineTo(rx, cy);
    c.stroke();

    /* ---- 主车架（座椅 → 转向头 → 枢轴）---- */
    c.beginPath();
    c.moveTo(seX2, seY); c.lineTo(stX, stY);
    c.stroke();
    c.beginPath();
    c.moveTo(seX2, seY); c.lineTo(pvX, pvY);
    c.stroke();

    /* ---- 油箱（圆润倒梯形）---- */
    c.beginPath();
    c.moveTo(tkX1, tkBotY);
    c.quadraticCurveTo(tkX1 - w * 0.012, tkTopY,
                       tkX1 + w * 0.02,  tkTopY);
    c.lineTo(tkX2 - w * 0.01, tkTopY);
    c.quadraticCurveTo(tkX2, tkTopY, tkX2, tkBotY);
    c.closePath();
    c.stroke();

    /* ---- 座椅 ---- */
    c.beginPath();
    c.moveTo(seX1, seY);
    c.quadraticCurveTo(seX1 + w * 0.02, seY - h * 0.025,
                       seX2 + w * 0.01, seY);
    c.stroke();
    c.beginPath();
    c.moveTo(seX1, seY);
    c.quadraticCurveTo(seX1 + w * 0.03, seY + h * 0.045,
                       seX2, seY + h * 0.035);
    c.stroke();

    /* ---- 车把 ---- */
    c.beginPath();
    c.moveTo(stX, stY); c.lineTo(hbX, hbY);
    c.stroke();
    c.beginPath();
    c.moveTo(hbX - w * 0.05, hbY);
    c.lineTo(hbX + w * 0.04, hbY);
    c.stroke();
    /* 后视镜小柄 */
    c.beginPath();
    c.moveTo(hbX - w * 0.02, hbY - h * 0.005);
    c.lineTo(hbX - w * 0.03, hbY - h * 0.035);
    c.stroke();

    /* ---- 发动机（圆角矩形）---- */
    const rr2 = Math.min(enW, enH) * 0.18;
    c.beginPath();
    if (c.roundRect) {
      c.roundRect(enX - enW / 2, enY - enH / 2, enW, enH, rr2);
    } else {
      c.rect(enX - enW / 2, enY - enH / 2, enW, enH);
    }
    c.stroke();

    /* ---- 排气管（从前下方绕到后轮上）---- */
    c.beginPath();
    c.moveTo(enX - enW * 0.45, enY + enH * 0.30);
    c.quadraticCurveTo((enX + rx) / 2, cy + rF * 0.55,
                       rx + rR * 0.30,   cy + rR * 0.30);
    c.stroke();
  }
});


reg({
  key: 'skJ20', cat: 'sketch', geom: 'box', label: '歼-20',
  icon: '<path d="M2 13l18-3-5 3 4 4-3-1-3 2-1-3-8 2 3-3z"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const w = b.w, h = b.h;
    const cy = (b.y1 + b.y2) / 2;
    const noseX = b.x2;
    const tailX = b.x1;

    /* ---- 主机身 ---- */
    c.beginPath();
    c.moveTo(noseX, cy);                                        // 机头
    c.lineTo(b.x1 + w * 0.72, cy - h * 0.08);                   // 前段上沿
    c.lineTo(b.x1 + w * 0.62, cy - h * 0.12);                   // 座舱后
    c.lineTo(tailX, cy - h * 0.14);                             // 尾段上沿
    c.lineTo(tailX, cy + h * 0.14);                             // 尾段下沿
    c.lineTo(b.x1 + w * 0.62, cy + h * 0.12);
    c.lineTo(b.x1 + w * 0.72, cy + h * 0.08);
    c.closePath();
    c.stroke();

    /* ---- 座舱盖 ---- */
    c.beginPath();
    c.moveTo(b.x1 + w * 0.74, cy - h * 0.04);
    c.quadraticCurveTo(b.x1 + w * 0.68, cy - h * 0.20,
                       b.x1 + w * 0.58, cy - h * 0.12);
    c.stroke();

    /* ---- 主翼（大三角翼）---- */
    c.beginPath();
    c.moveTo(b.x1 + w * 0.60, cy - h * 0.06);
    c.lineTo(b.x1 + w * 0.18, cy - h * 0.48);
    c.lineTo(b.x1 + w * 0.30, cy - h * 0.06);
    c.closePath();
    c.stroke();

    c.beginPath();
    c.moveTo(b.x1 + w * 0.60, cy + h * 0.06);
    c.lineTo(b.x1 + w * 0.18, cy + h * 0.48);
    c.lineTo(b.x1 + w * 0.30, cy + h * 0.06);
    c.closePath();
    c.stroke();

    /* ---- 鸭翼（小前翼）---- */
    c.beginPath();
    c.moveTo(b.x1 + w * 0.78, cy - h * 0.04);
    c.lineTo(b.x1 + w * 0.66, cy - h * 0.18);
    c.lineTo(b.x1 + w * 0.72, cy - h * 0.04);
    c.closePath();
    c.stroke();

    c.beginPath();
    c.moveTo(b.x1 + w * 0.78, cy + h * 0.04);
    c.lineTo(b.x1 + w * 0.66, cy + h * 0.18);
    c.lineTo(b.x1 + w * 0.72, cy + h * 0.04);
    c.closePath();
    c.stroke();

    /* ---- 外倾双垂尾 ---- */
    c.beginPath();
    c.moveTo(b.x1 + w * 0.16, cy - h * 0.08);
    c.lineTo(b.x1 + w * 0.04, cy - h * 0.38);
    c.lineTo(b.x1 + w * 0.10, cy - h * 0.08);
    c.closePath();
    c.stroke();

    c.beginPath();
    c.moveTo(b.x1 + w * 0.16, cy + h * 0.08);
    c.lineTo(b.x1 + w * 0.04, cy + h * 0.38);
    c.lineTo(b.x1 + w * 0.10, cy + h * 0.08);
    c.closePath();
    c.stroke();

    /* ---- 发动机喷口 ---- */
    c.beginPath();
    c.ellipse(tailX + w * 0.01, cy, h * 0.05, h * 0.10, 0, 0, Math.PI * 2);
    c.stroke();
  }
});



reg({
  key: 'skCarrier', cat: 'sketch', geom: 'box', label: '航空母舰',
  icon: '<path d="M3 15h18v3H3z"/>' +
        '<path d="M6 15v-5h6v5"/>' +
        '<path d="M8 10V7h2v3"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const w = b.w, h = b.h;

    const deckY = b.y1 + h * 0.52;
    const deckH = h * 0.20;

    /* ---- 飞行甲板（前端上翘）---- */
    c.beginPath();
    c.moveTo(b.x1 - w * 0.01, deckY + deckH);
    c.lineTo(b.x1 + w * 0.08, deckY - h * 0.02);
    c.lineTo(b.x2, deckY - h * 0.02);
    c.lineTo(b.x2, deckY + deckH);
    c.closePath();
    c.stroke();

    /* ---- 甲板中线（斜角甲板虚线） ---- */
    c.save();
    c.setLineDash([5, 4]);
    c.lineWidth = Math.max(0.5, (o.size || 4) * 0.35);
    c.beginPath();
    c.moveTo(b.x1 + w * 0.08, deckY + deckH * 0.6);
    c.lineTo(b.x2 - w * 0.04, deckY + deckH * 0.4);
    c.stroke();
    c.restore();

    /* ---- 舰岛 ---- */
    const islX = b.x1 + w * 0.66;
    const islW = w * 0.12;
    const islH = h * 0.28;
    const rr = Math.min(islW, islH) * 0.15;
    c.beginPath();
    if (c.roundRect) c.roundRect(islX, deckY - islH, islW, islH, rr);
    else c.rect(islX, deckY - islH, islW, islH);
    c.stroke();

    /* 桅杆 */
    c.beginPath();
    c.moveTo(islX + islW * 0.5, deckY - islH);
    c.lineTo(islX + islW * 0.5, deckY - islH - h * 0.14);
    c.stroke();
    /* 雷达（横杆） */
    c.beginPath();
    c.moveTo(islX + islW * 0.2, deckY - islH - h * 0.10);
    c.lineTo(islX + islW * 0.8, deckY - islH - h * 0.10);
    c.stroke();

    /* ---- 舰载机（3 架简化三角形） ---- */
    [0.22, 0.40, 0.55].forEach((f, i) => {
      const px = b.x1 + w * f;
      const py = deckY + deckH * 0.5;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(px + w * 0.05, py);
      c.lineTo(px + w * 0.025, py - h * 0.05);
      c.closePath();
      c.stroke();
      /* 机翼 */
      c.beginPath();
      c.moveTo(px + w * 0.025, py - h * 0.02);
      c.lineTo(px - w * 0.01,  py - h * 0.02);
      c.moveTo(px + w * 0.025, py - h * 0.02);
      c.lineTo(px + w * 0.06,  py - h * 0.02);
      c.stroke();
    });

    /* ---- 舰体（船身）---- */
    c.beginPath();
    c.moveTo(b.x1, deckY + deckH);
    c.lineTo(b.x2, deckY + deckH);
    c.lineTo(b.x2 - w * 0.06, b.y2);
    c.lineTo(b.x1 + w * 0.08, b.y2);
    c.closePath();
    c.stroke();

    /* 船身吃水线 */
    c.beginPath();
    c.moveTo(b.x1 + w * 0.04, deckY + deckH + (b.y2 - deckY - deckH) * 0.55);
    c.lineTo(b.x2 - w * 0.03, deckY + deckH + (b.y2 - deckY - deckH) * 0.55);
    c.stroke();
  }
});



reg({
  key: 'skPistol', cat: 'sketch', geom: 'box', label: '手枪',
  icon: '<path d="M3 9h14l2 3h2v3h-4l-2-2h-4l-3 6H4l2-6H3z"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const w = b.w, h = b.h;

    const slideY = b.y1 + h * 0.22;
    const slideH = h * 0.20;
    const slideR = b.x1 + w * 0.94;

    /* ---- 套筒 ---- */
    const rr = slideH * 0.12;
    c.beginPath();
    if (c.roundRect) {
      c.roundRect(b.x1, slideY, slideR - b.x1, slideH, rr);
    } else {
      c.rect(b.x1, slideY, slideR - b.x1, slideH);
    }
    c.stroke();

    /* 套筒前端的准星座 */
    c.beginPath();
    c.moveTo(b.x1 + w * 0.04, slideY);
    c.lineTo(b.x1 + w * 0.05, slideY - h * 0.04);
    c.lineTo(b.x1 + w * 0.07, slideY - h * 0.04);
    c.lineTo(b.x1 + w * 0.08, slideY);
    c.stroke();

    /* 抛壳口 */
    c.beginPath();
    c.rect(b.x1 + w * 0.28, slideY + slideH * 0.22,
           w * 0.22, slideH * 0.44);
    c.stroke();

    /* ---- 枪管前端 ---- */
    c.beginPath();
    c.rect(slideR, slideY + slideH * 0.30,
           w * 0.04, slideH * 0.40);
    c.stroke();

    /* ---- 扳机护圈 ---- */
    c.beginPath();
    c.arc(b.x1 + w * 0.32, slideY + slideH + h * 0.075,
          h * 0.085, Math.PI * 0.10, Math.PI * 0.95);
    c.stroke();

    /* 扳机 */
    c.beginPath();
    c.moveTo(b.x1 + w * 0.30, slideY + slideH + h * 0.02);
    c.quadraticCurveTo(b.x1 + w * 0.32, slideY + slideH + h * 0.09,
                       b.x1 + w * 0.29, slideY + slideH + h * 0.13);
    c.stroke();

    /* ---- 握把 ---- */
    c.beginPath();
    c.moveTo(b.x1 + w * 0.10, slideY + slideH);
    c.lineTo(b.x1 + w * 0.30, slideY + slideH);
    c.lineTo(b.x1 + w * 0.22, b.y2);
    c.lineTo(b.x1 + w * 0.02, b.y2);
    c.closePath();
    c.stroke();

    /* 握把纹路（斜线） */
    c.save();
    c.lineWidth = Math.max(0.5, (o.size || 4) * 0.28);
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const x1 = b.x1 + w * 0.10 + (b.x1 + w * 0.22 - (b.x1 + w * 0.10)) * t;
      const x2 = b.x1 + w * 0.30 + (b.x1 + w * 0.02 - (b.x1 + w * 0.30)) * t;
      const y = slideY + slideH + (b.y2 - slideY - slideH) * t;
      c.beginPath();
      c.moveTo(x1 + w * 0.02, y);
      c.lineTo(x2 + w * 0.03, y);
      c.stroke();
    }
    c.restore();
  }
});



/* ---- 11. 苹果 ---- */
reg({
  key: 'skApple', cat: 'sketch', geom: 'box', label: '苹果',
  icon: '<path d="M12 6c-3-2-7 0-7 5s3 9 5 9 2-1 2-1 0 1 2 1 5-4 5-9-4-7-7-5z"/>' +
        '<path d="M12 6V3M12 3q2-1 4 0"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = (b.x1 + b.x2) / 2;
    const w = b.w, h = b.h;

    /* 果实（两个圆弧构成心形苹果轮廓） */
    const topY = b.y1 + h * 0.22;
    const botY = b.y2 - h * 0.05;
    const halfW = w * 0.40;

    c.beginPath();
    c.moveTo(cx, topY);
    c.bezierCurveTo(cx - halfW * 1.2, topY - h * 0.10,
                    cx - halfW * 1.1, botY,
                    cx, botY);
    c.bezierCurveTo(cx + halfW * 1.1, botY,
                    cx + halfW * 1.2, topY - h * 0.10,
                    cx, topY);
    c.closePath();
    c.stroke();

    /* 果柄 */
    c.beginPath();
    c.moveTo(cx, topY);
    c.lineTo(cx + w * 0.02, b.y1 + h * 0.05);
    c.stroke();

    /* 叶子 */
    const leafX = cx + w * 0.02;
    const leafY = b.y1 + h * 0.07;
    c.beginPath();
    c.moveTo(leafX, leafY);
    c.quadraticCurveTo(leafX + w * 0.14, leafY - h * 0.05,
                       leafX + w * 0.20, leafY + h * 0.02);
    c.quadraticCurveTo(leafX + w * 0.10, leafY + h * 0.06, leafX, leafY);
    c.closePath();
    c.stroke();
  }
});

/* ---- 12. 羽毛球 ---- */
reg({
  key: 'skShuttlecock', cat: 'sketch', geom: 'box', label: '羽毛球',
  icon: '<path d="M9 10l3 11 3-11z"/>' +
        '<path d="M9 10l-2-6h10l-2 6z"/>' +
        '<path d="M10 4l1.5 6M14 4l-1.5 6"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = (b.x1 + b.x2) / 2;
    const w = b.w, h = b.h;

    /* 球头（半圆，位于下方） */
    const headR = w * 0.14;
    const headCY = b.y2 - headR;
    c.beginPath();
    c.arc(cx, headCY, headR, 0, Math.PI * 2);
    c.stroke();

    /* 羽毛裙（梯形，向上张开） */
    const skirtTop = b.y1 + h * 0.05;
    const skirtBot = headCY - headR * 0.9;
    const topHalf   = w * 0.34;
    const botHalf   = w * 0.12;

    c.beginPath();
    c.moveTo(cx - botHalf, skirtBot);
    c.lineTo(cx - topHalf, skirtTop);
    c.lineTo(cx + topHalf, skirtTop);
    c.lineTo(cx + botHalf, skirtBot);
    c.closePath();
    c.stroke();

    /* 羽毛骨架线 */
    c.save();
    c.lineWidth = Math.max(0.5, (o.size || 4) * 0.3);
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const topX = cx - topHalf + (topHalf * 2) * t;
      const botX = cx - botHalf + (botHalf * 2) * t;
      c.beginPath();
      c.moveTo(botX, skirtBot);
      c.lineTo(topX, skirtTop);
      c.stroke();
    }
    c.restore();
  }
});

/* ---- 13. 篮球 ---- */
reg({
  key: 'skBasketball', cat: 'sketch', geom: 'box', label: '篮球',
  icon: '<circle cx="12" cy="12" r="9"/>' +
        '<path d="M3 12h18M12 3v18"/>' +
        '<path d="M5 5q7 7 14 0M5 19q7-7 14 0"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = (b.x1 + b.x2) / 2;
    const cy = (b.y1 + b.y2) / 2;
    const r = Math.min(b.w, b.h) / 2;

    /* 球体 */
    c.beginPath();
    c.arc(cx, cy, Math.max(r, 1), 0, Math.PI * 2);
    c.stroke();

    /* 中间竖线 */
    c.beginPath();
    c.moveTo(cx, cy - r); c.lineTo(cx, cy + r);
    /* 中间横线 */
    c.moveTo(cx - r, cy); c.lineTo(cx + r, cy);
    c.stroke();

    /* 两条弧线（左右侧） */
    c.beginPath();
    c.moveTo(cx, cy - r);
    c.bezierCurveTo(cx - r * 0.9, cy - r * 0.6,
                    cx - r * 0.9, cy + r * 0.6,
                    cx, cy + r);
    c.stroke();
    c.beginPath();
    c.moveTo(cx, cy - r);
    c.bezierCurveTo(cx + r * 0.9, cy - r * 0.6,
                    cx + r * 0.9, cy + r * 0.6,
                    cx, cy + r);
    c.stroke();
  }
});

/* ---- 14. 足球 ---- */
reg({
  key: 'skFootball', cat: 'sketch', geom: 'box', label: '足球',
  icon: '<circle cx="12" cy="12" r="9"/>' +
        '<path d="M12 7l3 2-1 4h-4l-1-4z"/>' +
        '<path d="M12 7V4M6 9L4 7M18 9l2-2M8 14l-3 2M16 14l3 2M12 17v3"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = (b.x1 + b.x2) / 2;
    const cy = (b.y1 + b.y2) / 2;
    const r = Math.min(b.w, b.h) / 2;

    c.beginPath();
    c.arc(cx, cy, Math.max(r, 1), 0, Math.PI * 2);
    c.stroke();

    /* 中央五边形 */
    const pentR = r * 0.30;
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      pts.push({ x: cx + pentR * Math.cos(a), y: cy + pentR * Math.sin(a) });
    }
    c.beginPath();
    pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
    c.closePath();
    c.stroke();

    /* 从五边形各顶点向球边发线 */
    c.save();
    c.lineWidth = Math.max(0.5, (o.size || 4) * 0.35);
    pts.forEach(p => {
      const dx = p.x - cx, dy = p.y - cy;
      const m = Math.hypot(dx, dy);
      const ex = cx + dx / m * r;
      const ey = cy + dy / m * r;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(ex, ey);
      c.stroke();
    });
    c.restore();
  }
});

/* ---- 15. 乒乓球（球拍 + 球） ---- */
reg({
  key: 'skPingpong', cat: 'sketch', geom: 'box', label: '乒乓球',
  icon: '<ellipse cx="10" cy="10" rx="6" ry="7"/>' +
        '<path d="M13 15l4 6"/>' +
        '<circle cx="19" cy="8" r="3"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const w = b.w, h = b.h;

    /* 球拍面（椭圆） */
    const padCX = b.x1 + w * 0.42;
    const padCY = b.y1 + h * 0.42;
    const padRX = w * 0.28;
    const padRY = h * 0.34;
    c.beginPath();
    c.ellipse(padCX, padCY, padRX, padRY, 0, 0, Math.PI * 2);
    c.stroke();

    /* 拍面内框 */
    c.save();
    c.lineWidth = Math.max(0.5, (o.size || 4) * 0.3);
    c.beginPath();
    c.ellipse(padCX, padCY, padRX * 0.85, padRY * 0.85, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();

    /* 拍柄 */
    const handleX1 = padCX + padRX * 0.55;
    const handleY1 = padCY + padRY * 0.85;
    const handleX2 = padCX + padRX * 1.6;
    const handleY2 = padCY + padRY * 1.7;
    c.save();
    c.lineWidth = Math.max(3, (o.size || 4) * 1.4);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(handleX1, handleY1);
    c.lineTo(handleX2, handleY2);
    c.stroke();
    c.restore();

    /* 乒乓球（右上角小圆） */
    const ballR = Math.min(w, h) * 0.09;
    c.beginPath();
    c.arc(b.x1 + w * 0.82, b.y1 + h * 0.26, ballR, 0, Math.PI * 2);
    c.stroke();
  }
});




reg({
  key: 'rainbow', cat: 'sketch', geom: 'box', label: '彩虹',
  icon: '<path d="M3 18a9 9 0 0 1 18 0"/>' +
        '<path d="M5 18a7 7 0 0 1 14 0" stroke-opacity="0.75"/>' +
        '<path d="M7 18a5 5 0 0 1 10 0" stroke-opacity="0.5"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = (b.x1 + b.x2) / 2;
    const baseY = b.y2 - h_rel(b) * 0.08;
    const Rmax = Math.min(b.w / 2, b.h * 0.92) * 0.92;
    const colors = ['#e53935','#fb8c00','#fdd835','#43a047','#00acc1','#1e88e5','#8e24aa'];
    const arcW = Rmax * 0.075;

    function h_rel(x) { return b.h; }

    c.save();
    c.lineWidth = arcW;
    c.lineCap = 'butt';
    for (let i = 0; i < 7; i++) {
      c.strokeStyle = colors[i];
      const r = Rmax - arcW * (i + 0.5);
      c.beginPath();
      c.arc(cx, baseY, r, Math.PI, Math.PI * 2);
      c.stroke();
    }
    c.restore();

    /* 左侧云朵 */
    const cloudY = baseY;
    const cloudR = Rmax * 0.16;
    const cloudX = cx - Rmax - cloudR * 0.55;
    c.beginPath();
    c.arc(cloudX,          cloudY - cloudR * 0.20, cloudR * 0.65, 0, Math.PI * 2);
    c.arc(cloudX + cloudR * 0.75, cloudY - cloudR * 0.55, cloudR * 0.85, 0, Math.PI * 2);
    c.arc(cloudX + cloudR * 1.60, cloudY - cloudR * 0.20, cloudR * 0.65, 0, Math.PI * 2);
    c.stroke();

    /* 右侧云朵 */
    const cloudX2 = cx + Rmax + cloudR * 0.55;
    c.beginPath();
    c.arc(cloudX2,          cloudY - cloudR * 0.20, cloudR * 0.65, 0, Math.PI * 2);
    c.arc(cloudX2 - cloudR * 0.75, cloudY - cloudR * 0.55, cloudR * 0.85, 0, Math.PI * 2);
    c.arc(cloudX2 - cloudR * 1.60, cloudY - cloudR * 0.20, cloudR * 0.65, 0, Math.PI * 2);
    c.stroke();
  }
});


reg({
  key: 'heart', cat: 'sketch', geom: 'box', label: '心形',
  icon: '<path d="M12 21C5 16 2 12 2 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 10 2.5C22 12 19 16 12 21z"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = (b.x1 + b.x2) / 2;
    const w = b.w, h = b.h;
    const topLobeY = b.y1 + h * 0.22;
    const botY = b.y2 - h * 0.02;
    const halfW = w * 0.46;

    c.beginPath();
    c.moveTo(cx, b.y1 + h * 0.40);
    c.bezierCurveTo(cx - halfW * 0.30, b.y1 + h * 0.06,
                    cx - halfW,        b.y1 + h * 0.20,
                    cx - halfW,        topLobeY + h * 0.20);
    c.bezierCurveTo(cx - halfW,        botY - h * 0.20,
                    cx - halfW * 0.35, botY - h * 0.06,
                    cx,                botY);
    c.bezierCurveTo(cx + halfW * 0.35, botY - h * 0.06,
                    cx + halfW,        botY - h * 0.20,
                    cx + halfW,        topLobeY + h * 0.20);
    c.bezierCurveTo(cx + halfW,        b.y1 + h * 0.20,
                    cx + halfW * 0.30, b.y1 + h * 0.06,
                    cx,                b.y1 + h * 0.40);
    c.closePath();
    c.stroke();

    /* 右上角高光 */
    c.save();
    c.lineWidth = Math.max(0.6, (o.size || 4) * 0.35);
    c.beginPath();
    c.moveTo(cx + halfW * 0.30, b.y1 + h * 0.20);
    c.quadraticCurveTo(cx + halfW * 0.45, b.y1 + h * 0.26,
                       cx + halfW * 0.40, b.y1 + h * 0.38);
    c.stroke();
    c.restore();
  }
});


reg({
  key: 'star5', cat: 'sketch', geom: 'box', label: '五角星',
  icon: '<path d="M12 2l2.9 6.5L22 9.3l-5 4.8 1.3 7L12 17.7 5.7 21l1.3-7-5-4.8 7.1-.8z"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const cx = (b.x1 + b.x2) / 2;
    const cy = (b.y1 + b.y2) / 2;
    const Rx = b.w / 2;
    const Ry = b.h / 2;

    /* 正五角星：外顶点半径 R，内凹点半径 r = R·sin(18°)/sin(54°) ≈ 0.382R */
    const rRatio = 0.382;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = (i % 2 === 0) ? 1 : rRatio;
      pts.push({ x: cx + Rx * rr * Math.cos(a),
                 y: cy + Ry * rr * Math.sin(a) });
    }
    c.beginPath();
    pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
    c.closePath();
    c.stroke();
  }
});



reg({
  key: 'spaceStation', cat: 'sketch', geom: 'box', label: '空间站',
  icon: '<rect x="9" y="4" width="6" height="16" rx="1"/>' +
        '<rect x="2" y="10" width="6" height="4" rx="0.5"/>' +
        '<rect x="16" y="10" width="6" height="4" rx="0.5"/>' +
        '<path d="M8 12h1M15 12h1"/>',
  draw(c, o, GH) {
    const b = GH.box(o);
    const w = b.w, h = b.h;
    const cx = (b.x1 + b.x2) / 2;
    const cy = (b.y1 + b.y2) / 2;

    /* ---- 核心舱 ---- */
    const coreW = w * 0.14;
    const coreH = h * 0.62;
    const rr = Math.min(coreW, coreH) * 0.22;
    c.beginPath();
    if (c.roundRect) c.roundRect(cx - coreW / 2, cy - coreH / 2, coreW, coreH, rr);
    else c.rect(cx - coreW / 2, cy - coreH / 2, coreW, coreH);
    c.stroke();

    /* 核心舱横向分隔 */
    c.save();
    c.lineWidth = Math.max(0.5, (o.size || 4) * 0.3);
    [0.25, 0.50, 0.75].forEach(f => {
      const y = cy - coreH / 2 + coreH * f;
      c.beginPath();
      c.moveTo(cx - coreW / 2, y);
      c.lineTo(cx + coreW / 2, y);
      c.stroke();
    });
    c.restore();

    /* ---- 太阳能板 ---- */
    const panelW = w * 0.32;
    const panelH = h * 0.16;

    [-1, 1].forEach(dir => {
      const px = dir < 0
        ? cx - coreW / 2 - panelW - w * 0.015
        : cx + coreW / 2 + w * 0.015;

      const rrP = Math.min(panelW, panelH) * 0.08;
      c.beginPath();
      if (c.roundRect) c.roundRect(px, cy - panelH / 2, panelW, panelH, rrP);
      else c.rect(px, cy - panelH / 2, panelW, panelH);
      c.stroke();

      /* 格纹 */
      c.save();
      c.lineWidth = Math.max(0.4, (o.size || 4) * 0.25);
      const cols = 5, rows = 2;
      for (let i = 1; i < cols; i++) {
        const gx = px + panelW * i / cols;
        c.beginPath();
        c.moveTo(gx, cy - panelH / 2);
        c.lineTo(gx, cy + panelH / 2);
        c.stroke();
      }
      for (let j = 1; j < rows; j++) {
        const gy = cy - panelH / 2 + panelH * j / rows;
        c.beginPath();
        c.moveTo(px, gy);
        c.lineTo(px + panelW, gy);
        c.stroke();
      }
      c.restore();

      /* 连接杆 */
      c.beginPath();
      const x1 = dir < 0 ? cx - coreW / 2 : cx + coreW / 2;
      const x2 = dir < 0 ? px + panelW : px;
      c.moveTo(x1, cy);
      c.lineTo(x2, cy);
      c.stroke();
    });

    /* ---- 上下对接口 ---- */
    c.beginPath();
    c.arc(cx, cy - coreH / 2 - h * 0.02, coreW * 0.42, Math.PI, 0, false);
    c.stroke();
    c.beginPath();
    c.arc(cx, cy + coreH / 2 + h * 0.02, coreW * 0.42, 0, Math.PI, false);
    c.stroke();
  }
});


/* ==========================================================================
 * 18. 动画图形：圆环-小球 / 半圆槽小球 / 弹簧连接体
 * ========================================================================== */
/* ---- 半圆槽小球（对应 anim_sliding_slot_ball） ---- */
paramDef('ssbTheta0', { label: '初始摆角', min: 1,    max: 90, step: 1,    def: 50,  unit: '°' });
paramDef('ssbK',      { label: '质量比 k', min: 0.05, max: 10, step: 0.05, def: 3 });
paramDef('ssbBallR',  { label: '球半径',   min: 2,    max: 20, step: 0.5,  def: 5 });
paramDef('ssbPeriod', { label: '周期',     min: 0.2,  max: 6,  step: 0.1,  def: 1.5, unit: 's' });
/* ---- 光滑圆环-小球 ---- */
reg({
  key: 'anim_ring_ball',
  cat: 'anim',
  geom: 'rect',
  label: '光滑圆环-小球',
  icon: '<line x1="2" y1="6" x2="22" y2="6"/>' +
        '<circle cx="9" cy="6" r="2"/>' +
        '<line x1="9" y1="6" x2="15" y2="16"/>' +
        '<circle cx="15" cy="16" r="2" fill="currentColor"/>',
  animatable: true,
  params: ['ringTheta0', 'ringK', 'ringLen', 'ringPeriod'],

  draw(c, o, U2) {
    const AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
    const b  = U2.bbox(o);

    const theta0 = ((o.ringTheta0 != null ? o.ringTheta0 : 60) * Math.PI) / 180;
    const k      = Math.max(0.05, o.ringK || 2);
    const Lratio = Math.max(0.2, Math.min(1.0, o.ringLen || 0.7));
    const T0     = Math.max(0.2, o.ringPeriod || 1.5);
    const omega0 = 2 * Math.PI / T0;

    if (!o._ringState ||
        o._ringTheta0Cache !== theta0 ||
        o._ringKCache      !== k) {
      o._ringState = { theta: theta0, omega: 0, lastT: AN.t, trail: [] };
      o._ringTheta0Cache = theta0;
      o._ringKCache      = k;
    }
    const S = o._ringState;

    let dTau = (AN.t - S.lastT) * omega0;
    if (!isFinite(dTau) || dTau < 0 || dTau > 0.5) {
      S.theta = theta0; S.omega = 0; dTau = 0;
      S.trail = [];
    }
    S.lastT = AN.t;

    if (dTau > 1e-7) {
      const nSub = Math.max(1, Math.ceil(dTau / 0.02));
      const h    = dTau / nSub;
      const kp1  = k + 1;
      const accel = (th, om) => {
        const s = Math.sin(th);
        return -s * (Math.cos(th) * om * om + kp1) / (k + s * s);
      };
      for (let i = 0; i < nSub; i++) {
        const th = S.theta, om = S.omega;
        const k1t = om,             k1o = accel(th, om);
        const k2t = om + h * 0.5 * k1o, k2o = accel(th + h * 0.5 * k1t, om + h * 0.5 * k1o);
        const k3t = om + h * 0.5 * k2o, k3o = accel(th + h * 0.5 * k2t, om + h * 0.5 * k2o);
        const k4t = om + h * k3o,       k4o = accel(th + h * k3t, om + h * k3o);
        S.theta += h / 6 * (k1t + 2 * k2t + 2 * k3t + k4t);
        S.omega += h / 6 * (k1o + 2 * k2o + 2 * k3o + k4o);
      }
    }

    const theta = S.theta;
    const sinT  = Math.sin(theta);
    const cosT  = Math.cos(theta);

    const rodY  = b.y1 + 10;
    const cx    = (b.x1 + b.x2) / 2;
    const Lpix  = Math.min(b.h - 20, b.w * 0.6) * Lratio;

    const xRing = cx - Lpix * sinT / (k + 1);
    const xBall = cx + Lpix * sinT * k / (k + 1);
    const yBall = rodY + Lpix * cosT;

    c.beginPath();
    c.moveTo(b.x1, rodY);
    c.lineTo(b.x2, rodY);
    c.stroke();

    c.save();
    c.setLineDash([3, 3]);
    c.lineWidth = Math.max(1, (o.size || 4) * 0.4);
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.3);
    c.beginPath();
    c.moveTo(xRing, rodY);
    c.lineTo(xRing, rodY + Lpix);
    c.stroke();
    c.restore();

    c.save();
    c.lineWidth = Math.max(1.2, (o.size || 4) * 0.55);
    c.beginPath();
    c.moveTo(xRing, rodY);
    c.lineTo(xBall, yBall);
    c.stroke();
    c.restore();

    if (!S.trail) S.trail = [];
    if (AN.playing) {
      const lastP = S.trail.length ? S.trail[S.trail.length - 1] : null;
      if (!lastP || Math.hypot(xBall - lastP.x, yBall - lastP.y) > 2) {
        S.trail.push({ x: xBall, y: yBall });
        if (S.trail.length > 1200) S.trail.shift();
      }
    }
    if (S.trail.length > 1) {
      c.save();
      c.setLineDash([5, 4]);
      c.strokeStyle = 'rgba(229,57,53,0.55)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(S.trail[0].x, S.trail[0].y);
      for (let i = 1; i < S.trail.length; i++) {
        c.lineTo(S.trail[i].x, S.trail[i].y);
      }
      c.stroke();
      c.restore();
    }

    const ringRad = Math.max(4, Math.min(8, Lpix * 0.06));
    c.save();
    c.lineWidth = Math.max(2, (o.size || 4) * 0.6);
    c.beginPath();
    c.arc(xRing, rodY, ringRad, 0, Math.PI * 2);
    c.fillStyle = '#fff';
    c.fill();
    c.stroke();
    c.restore();

    const ballR = Math.max(5, Math.min(Lpix * 0.08, b.w * 0.06));
    c.beginPath();
    c.arc(xBall, yBall, ballR, 0, Math.PI * 2);
    c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.6);
    c.fill();
    c.stroke();
    c.save();
    c.beginPath();
    c.arc(xBall - ballR * 0.3, yBall - ballR * 0.3, ballR * 0.28, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fill();
    c.restore();

    if (Math.abs(theta) > 0.05) {
      const arcR = Math.min(Lpix * 0.28, 34);
      c.save();
      c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.4);
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(xRing, rodY, arcR, Math.PI / 2, Math.PI / 2 - theta, theta > 0);
      c.stroke();
      c.restore();
    }

    c.save();
    c.fillStyle = 'rgba(229,57,53,0.8)';
    c.beginPath();
    c.arc(cx, rodY + 4, 3, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
});

/* ---- 半圆凹槽 + 小球 ---- */
reg({
  key: 'anim_sliding_slot_ball',
  cat: 'anim',
  geom: 'box',
  label: '半圆槽小球',
  icon: '<path d="M3 5h3a6 6 0 0 0 12 0h3v14H3z"/><circle cx="12" cy="9" r="2" fill="currentColor"/>',
  animatable: true,
  params: ['ssbTheta0', 'ssbK', 'ssbBallR', 'ssbPeriod'],

  draw(c, o, U2) {
    const AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
    const b  = U2.bbox(o);

    const theta0 = ((o.ssbTheta0 != null ? o.ssbTheta0 : 50) * Math.PI) / 180;
    const k      = Math.max(0.05, o.ssbK || 3);
    const ballR0 = Math.max(2, o.ssbBallR || 5);
    const T0     = Math.max(0.2, o.ssbPeriod || 1.5);
    const omega0 = (2 * Math.PI) / T0;

    if (!window.__ssbStates) window.__ssbStates = new WeakMap();
    let S = window.__ssbStates.get(o);
    if (!S || S.theta0 !== theta0 || S.k !== k) {
      S = { theta: theta0, omega: 0, lastT: AN.t, theta0, k, trail: [] };
      window.__ssbStates.set(o, S);
    }

    let dTau = (AN.t - S.lastT) * omega0;
    if (!isFinite(dTau) || dTau < 0 || dTau > 0.5) {
      S.theta = theta0; S.omega = 0; dTau = 0;
      S.trail = [];
    }
    S.lastT = AN.t;

    if (dTau > 1e-7) {
      const nSub = Math.max(1, Math.ceil(dTau / 0.02));
      const h    = dTau / nSub;
      const accel = (th, om) => {
        const s = Math.sin(th);
        return -s * (Math.cos(th) * om * om + k) / (k + s * s);
      };
      for (let i = 0; i < nSub; i++) {
        const th = S.theta, om = S.omega;
        const k1t = om,             k1o = accel(th, om);
        const k2t = om + h*0.5*k1o, k2o = accel(th + h*0.5*k1t, om + h*0.5*k1o);
        const k3t = om + h*0.5*k2o, k3o = accel(th + h*0.5*k2t, om + h*0.5*k2o);
        const k4t = om + h*k3o,     k4o = accel(th + h*k3t, om + h*k3o);
        S.theta += h/6 * (k1t + 2*k2t + 2*k3t + k4t);
        S.omega += h/6 * (k1o + 2*k2o + 2*k3o + k4o);
      }
    }

    const theta = S.theta;
    const sinT  = Math.sin(theta);
    const cosT  = Math.cos(theta);

    const bw  = b.w, bh = b.h;
    /* 1.7.5-03：恢复初版比例 0.42·宽（1.7.5 一度压到 0.30 去躲虚线框，槽小了、地面也没了，
       老师反馈「圆弧槽恢复至初版大小」指的就是这个）。高度仍是容器的 62%，两不像时才收。 */
    const r     = Math.min(bw * 0.42, bh * 0.62);
    const baseH = Math.max(3, r * 0.06);
    const ballR = Math.max(4, Math.min(r * 0.12, Math.max(ballR0, r * 0.05)));
    const rEff  = Math.max(r - ballR, r * 0.3);
    /* 1.7.5-03：留一圈内缩边距 —— 图形描边正好压在包围盒上时，选中虚线框（虚线 + 四角手柄）
       会盖住槽沿和地面线，老师看着像「被虚线框遮住了一段」。地面线画在内缩线以内，整幅图与
       虚线框之间始终空出 m，播放时也不会越出框。 */
    const m     = Math.max(3, Math.min(bw, bh) * 0.03);
    const x1i   = b.x1 + m, x2i = b.x2 - m;
    const botY  = b.y2 - m;                       // 地面线
    const topY  = botY - r - baseH;               // 槽口
    const cx    = (b.x1 + b.x2) / 2;

    const X0 = cx - rEff * Math.sin(theta0) / (k + 1);

    const X_slot = X0 - rEff * (sinT - Math.sin(theta0)) / (k + 1);
    /* 槽块（U 形 + 两侧槽壁）整体在长地面上反冲平移，所以夹取范围要按「槽块半宽」
       而不是「弧半径」算 —— 否则播放到极值那一帧槽壁会伸出地面两端。 */
    const wall  = Math.max(2, r * 0.05);
    const slotW = 2 * (r + wall);
    const halfSpan = Math.max(0, (x2i - x1i) / 2 - slotW / 2);
    const Xs = cx + Math.max(-halfSpan, Math.min(halfSpan, X_slot - cx));
    const X_ball = Xs + rEff * sinT;
    const Y_ball = topY + rEff * cosT;

    const slotLeft  = Xs - r;
    const slotRight = Xs + r;

    /* 1.7.5-03：先画一条横贯整框的长地面（老师要求「放在一个足够长的地面上」），
       槽块只是坐在地面上的一段 —— 以前底板和槽是同一条闭合路径，地面长度就等于槽宽，
       反冲时整块跟着平移，看起来像没有地面。 */
    c.beginPath();
    c.moveTo(x1i, botY);
    c.lineTo(x2i, botY);
    c.stroke();

    c.beginPath();
    c.moveTo(Xs - r - wall, topY);
    c.lineTo(Xs - r, topY);
    c.arc(Xs, topY, r, Math.PI, 0, true);
    c.lineTo(Xs + r + wall, topY);
    c.lineTo(Xs + r + wall, botY);
    c.lineTo(Xs - r - wall, botY);
    c.closePath();
    if (o.fill) {
      c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.15);
      c.fill();
    }
    c.stroke();

    /* 半径虚线（槽心 → 小球）与槽心竖直虚线：读摆角用，保留 */
    if (!o.ssbNoRadius) {
      c.save();
      c.setLineDash([4, 4]);
      c.globalAlpha = 0.5;
      c.beginPath();
      c.moveTo(Xs, topY);
      c.lineTo(Xs, topY + r);
      c.moveTo(Xs, topY);
      c.lineTo(X_ball, Y_ball);
      c.stroke();
      c.restore();
    }

    c.beginPath();
    c.arc(X_ball, Y_ball, ballR, 0, Math.PI * 2);
    c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.65);
    c.fill();
    c.stroke();

    c.save();
    c.beginPath();
    c.arc(X_ball - ballR * 0.3, Y_ball - ballR * 0.3, ballR * 0.28, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fill();
    c.restore();

    /* 1.7.5-03：红色虚线拖尾与圆心小红点都已去掉（前者正好压在弧面上，看着像槽被虚线盖住
       了一段；后者悬在槽口正中，跟板书内容没关系）。这里顺手撤掉拖尾的采样 ——
       只删绘制、留着 S.trail.push 是白算一份数组。 */
  }
});

/* ---- 弹簧连接体（实验室参考系） ---- */
paramDef('sprV0',     { label: '初速度v₀', min: 0.1, max: 1.5, step: 0.05, def: 0.4, unit: '×宽/s' });
paramDef('sprPeriod', { label: '周期T',     min: 0.4, max: 2.5, step: 0.1,  def: 1.2, unit: 's' });
paramDef('sprKR',     { label: '质量比B/A', min: 0.3, max: 4,   step: 0.1,  def: 1 });
paramDef('sprGap',    { label: '弹簧原长',  min: 0.10, max: 0.35, step: 0.01, def: 0.18, unit: '×宽' });
paramDef('sprSize',   { label: '物块大小',  min: 10,  max: 40,  step: 1,    def: 22 });

reg({
  key: 'anim_spring_cart',
  cat: 'anim',
  geom: 'box',
  label: '弹簧连接体',
  icon: '<rect x="2" y="9" width="4" height="6" fill="currentColor"/>' +
        '<rect x="18" y="9" width="4" height="6" fill="currentColor"/>' +
        '<path d="M6 12 L8 9 L10.5 15 L13 9 L15.5 15 L18 12" ' +
        'fill="none" stroke="currentColor" stroke-width="1.2"/>',
  animatable: true,
  params: ['sprV0', 'sprPeriod', 'sprKR', 'sprGap', 'sprSize'],

  draw(c, o, U2) {
    const AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
    const b  = U2.bbox(o);

    const v0   = Math.max(0.05, o.sprV0     ?? 0.4);
    const T    = Math.max(0.2,  o.sprPeriod ?? 1.2);
    const k    = Math.max(0.1,  o.sprKR     ?? 1);
    const gapR = Math.max(0.05, Math.min(0.5, o.sprGap ?? 0.18));
    const sizeBase = Math.max(10, Math.min(40, o.sprSize ?? 22));
    const blkH = Math.max(12, Math.min(b.h * 0.32, sizeBase * Math.max(1, Math.min(1.9, b.h / 380))));

    if (!window.__sprCartStates) window.__sprCartStates = new WeakMap();
    let S = window.__sprCartStates.get(o);
    const sig = v0 + '|' + T + '|' + k + '|' + gapR + '|' + b.w + '|' + blkH;
    if (!S || S.sig !== sig) {
      S = { tLocal: 0, lastT: AN.t, sig };
      window.__sprCartStates.set(o, S);
    }
    let dT = AN.t - S.lastT;
    if (!isFinite(dT) || dT < 0 || dT > 0.5) {
      S.tLocal = 0;
      dT = 0;
    }
    S.tLocal += dT;
    S.lastT = AN.t;

    const MA = 1, MB = k, M = MA + MB;
    const w  = b.w;
    const groundY = b.y2 - 2;
    const blkW = Math.max(10, blkH * 0.75);
    const L0   = gapR * w;
    const D0   = L0 + blkW;
    const v0_px  = v0 * w;
    const vcm_px = v0_px / M;
    const omega  = 2 * Math.PI / T;
    const A_rel  = v0_px / omega;

    const xA0  = b.x1 + 0.15 * w;
    const xcm0 = xA0 + (MB / M) * D0;

    // 整组小车到达右边界前回到起点：动画始终在画布内循环
    const xB0 = xcm0 + (MA / M) * D0;
    const tLoop = vcm_px > 1e-6 ? Math.max(0.6, (b.x2 - 14 - xB0) / vcm_px) : 1e9;
    const t = S.tLocal % tLoop;
    const r_rel = -A_rel * Math.sin(omega * t);
    const xcm   = xcm0 + vcm_px * t;
    const xA    = xcm - (MB / M) * (D0 + r_rel);
    const xB    = xcm + (MA / M) * (D0 + r_rel);

    const lineW = Math.max(1, (o.size || 4) * 0.55);

    c.save();
    c.lineWidth = lineW;
    c.beginPath();
    c.moveTo(b.x1, groundY);
    c.lineTo(b.x2, groundY);
    c.stroke();
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.32);
    c.lineWidth = Math.max(0.8, (o.size || 4) * 0.4);
    for (let x = b.x1 + 8; x < b.x2 - 4; x += 12) {
      c.beginPath();
      c.moveTo(x, groundY + 1);
      c.lineTo(x + 4, groundY + 5);
      c.stroke();
    }
    c.restore();

    const springY = groundY - blkH / 2;
    const spX1 = xA + blkW / 2;
    const spX2 = xB - blkW / 2;
    const spLen = spX2 - spX1;

    c.save();
    c.lineWidth = Math.max(1, (o.size || 4) * 0.55);
    if (spLen < 6) {
      c.beginPath();
      c.moveTo(spX1, springY);
      c.lineTo(spX2, springY);
      c.stroke();
    } else {
      const coils = Math.max(4, Math.min(12, Math.round(spLen / 11)));
      const amp   = Math.min(9, spLen / (coils * 2.5));
      const total = coils * 2;
      c.beginPath();
      c.moveTo(spX1, springY);
      for (let i = 1; i < total; i++) {
        const x = spX1 + spLen * (i / total);
        const dy = (i % 2 === 0 ? -amp : amp);
        c.lineTo(x, springY + dy);
      }
      c.lineTo(spX2, springY);
      c.stroke();
    }
    c.restore();

    const drawBlock = (cx, label) => {
      const bx = cx - blkW / 2;
      const by = groundY - blkH;
      c.save();
      c.beginPath();
      c.rect(bx, by, blkW, blkH);
      c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.20);
      c.fill();
      c.lineWidth = Math.max(1.2, (o.size || 4) * 0.7);
      c.stroke();
      if (blkW >= 12 && blkH >= 12) {
        c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.92);
        c.font = 'bold ' + Math.min(blkW, blkH) * 0.6 + 'px system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(label, cx, by + blkH / 2);
      }
      c.restore();
    };
    drawBlock(xA, 'A');
    drawBlock(xB, 'B');

    c.save();
    c.setLineDash([2, 4]);
    c.strokeStyle = 'rgba(229,57,53,0.5)';
    c.lineWidth = 1;
    const comTop = groundY - blkH - 14;
    c.beginPath();
    c.moveTo(xcm, comTop);
    c.lineTo(xcm, groundY);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(229,57,53,0.85)';
    c.beginPath();
    c.moveTo(xcm, comTop - 7);
    c.lineTo(xcm - 4, comTop);
    c.lineTo(xcm + 4, comTop);
    c.closePath();
    c.fill();
    c.restore();

    const vA_px = vcm_px + (MB / M) * A_rel * omega * Math.cos(omega * t);
    const vB_px = vcm_px - (MA / M) * A_rel * omega * Math.cos(omega * t);
    const drawArrow = (px, py, v) => {
      const len = v * 0.25;
      if (Math.abs(len) < 6) return;
      const dir = Math.sign(len);
      c.save();
      c.strokeStyle = '#43a047';
      c.fillStyle = '#43a047';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(px + len, py);
      c.stroke();
      c.beginPath();
      c.moveTo(px + len, py);
      c.lineTo(px + len - 6 * dir, py - 4);
      c.lineTo(px + len - 6 * dir, py + 4);
      c.closePath();
      c.fill();
      c.restore();
    };
    drawArrow(xA, groundY - blkH - 8, vA_px);
    drawArrow(xB, groundY - blkH - 8, vB_px);
  }
});


/* ==========================================================================
 * 19. 类抛体运动
 * ========================================================================== */
(function () {
  var PB2 = window.TangBoBoard;
  if (!PB2 || !PB2.shapes) return;

  var shape2 = function (d) {
    if (!d || !d.key) return;
    if (typeof PB2.register === 'function') PB2.register(d);
    else PB2.shapes[d.key] = d;
  };
  var cat2 = function (id, label) {
    if (!id) return;
    if (typeof PB2.category === 'function') PB2.category(id, label || id);
    else if (!PB2.categories.some(function (c) { return c.id === id; })) {
      PB2.categories.push({ id: id, label: label || id });
    }
  };

  if (!PB2.paramDefs) PB2.paramDefs = {};
  PB2.paramDefs.animPeriod = PB2.paramDefs.animPeriod ||
    { label: "周期",       min: 0.5,  max: 10,  step: 0.1, def: 2.5, unit: "s" };
  PB2.paramDefs.animV0 = PB2.paramDefs.animV0 ||
    { label: "初速度",     min: 1,    max: 100, step: 1,   def: 40 };
  PB2.paramDefs.animTheta0 = PB2.paramDefs.animTheta0 ||
    { label: "速度方向",   min: -180, max: 180, step: 1,   def: 60,  unit: "°" };
  PB2.paramDefs.animAccel = PB2.paramDefs.animAccel ||
    { label: "加速度",     min: 0,    max: 100, step: 1,   def: 20 };
  PB2.paramDefs.animThetaA = PB2.paramDefs.animThetaA ||
    { label: "加速度方向", min: -180, max: 180, step: 1,   def: -90, unit: "°" };

  shape2({
    key: "anim_projectile2",
    cat: "anim",
    geom: "rect",
    label: "类抛体运动",
    icon: '<path d="M3 19 Q 12 4 21 15"/><circle cx="3" cy="19" r="1.6" fill="currentColor"/>',
    animatable: true,
    params: ["animPeriod", "animV0", "animTheta0", "animAccel", "animThetaA"],

    draw: function (c, o, GH) {
      var AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
      var b = GH.box(o);
      var pad = 18;
      var innerW = b.w - pad * 2;
      var innerH = b.h - pad * 2;
      if (innerW < 12 || innerH < 12) return;

      var v0   = (o.animV0     != null ? o.animV0     : 40);
      var th0  = (o.animTheta0 != null ? o.animTheta0 : 60)  * Math.PI / 180;
      var aMag = (o.animAccel  != null ? o.animAccel  : 20);
      var thA  = (o.animThetaA != null ? o.animThetaA : -90) * Math.PI / 180;

      var vx0 = v0 * Math.cos(th0);
      var vy0 = v0 * Math.sin(th0);
      var ax  = aMag * Math.cos(thA);
      var ay  = aMag * Math.sin(thA);

      var startX, startY;

      // 整条轨迹的时间跨度：抛物线要一直画到落回抛出点高度（「另一半」），
      // 而不是只画 1 秒——旧代码 s 取 0..1 秒，v0=40 时只画到上升段就被截断。
      var Tperiod = Math.max(0.2, o.animPeriod || 2.5);
      var tFlight = Tperiod;
      if (ay < -1e-6 && vy0 > 0) tFlight = Math.max(0.6, 2 * vy0 / (-ay));
      else if (ay > 1e-6 && vy0 < 0) tFlight = Math.max(0.6, -2 * vy0 / ay);

      var N = 140;
      var pts = [];
      var maxPosX = 0, maxPosY = 0;
      var minX = 0, maxX = 0, minY = 0, maxY = 0;
      for (var i = 0; i <= N; i++) {
        var s = tFlight * i / N;
        var x = vx0 * s + 0.5 * ax * s * s;
        var y = vy0 * s + 0.5 * ay * s * s;
        pts.push({ x: x, y: y });
        if (x > maxX) maxX = x;
        if (x < minX) minX = x;
        if (y > maxY) maxY = y;
        if (y < minY) minY = y;
        if (x > maxPosX) maxPosX = x;
        if (y > maxPosY) maxPosY = y;
      }

      // 按整条轨迹（含起点以下的「另一半」）缩放，保证全轨迹都看得见
      var spanX = Math.max(1e-6, maxX - minX);
      var spanY = Math.max(1e-6, maxY - minY);
      var scale  = Math.min(innerW / spanX, innerH / spanY);
      if (!isFinite(scale) || scale <= 0) scale = 1;

      var toSX = function (px) { return b.x1 + pad + (px - minX) * scale; };
      var toSY = function (py) { return b.y2 - pad - (py - minY) * scale; };
      startX = toSX(0);
      startY = toSY(0);

      // 直角坐标轴（过抛出点）
      c.save();
      c.strokeStyle = o.color || "#1a1a1a";
      c.globalAlpha = 0.35;
      c.lineWidth = Math.max(1, (o.size || 4) * 0.35);
      var axL = b.x1 + 6, axR = b.x2 - 6, axT = b.y1 + 6, axB = b.y2 - 6;
      c.beginPath();
      c.moveTo(axL, startY);
      c.lineTo(axR, startY);
      c.moveTo(startX, axT);
      c.lineTo(startX, axB);
      c.stroke();
      c.globalAlpha = 0.85;
      c.beginPath();
      c.moveTo(axR, startY);
      c.lineTo(axR - 7, startY - 4);
      c.moveTo(axR, startY);
      c.lineTo(axR - 7, startY + 4);
      c.moveTo(startX, axB);
      c.lineTo(startX - 4, axB - 7);
      c.moveTo(startX, axB);
      c.lineTo(startX + 4, axB - 7);
      c.stroke();
      c.font = 'bold 12px system-ui, sans-serif';
      c.fillStyle = o.color || "#1a1a1a";
      c.textAlign = 'right';
      c.textBaseline = 'bottom';
      c.fillText('x', axR, startY - 4);
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillText('y', startX + 5, axB);
      c.restore();

      var baseColor = o.color || "#1a1a1a";
      var baseSize  = o.size  || 4;

      c.save();
      c.setLineDash([5, 4]);
      c.globalAlpha = 0.30;
      c.strokeStyle = baseColor;
      c.lineWidth = Math.max(1, baseSize * 0.7);
      c.beginPath();
      for (var k = 0; k <= N; k++) {
        var sx = toSX(pts[k].x), sy = toSY(pts[k].y);
        if (k === 0) c.moveTo(sx, sy); else c.lineTo(sx, sy);
      }
      c.stroke();
      c.restore();

      var T = Math.max(0.2, o.animPeriod || 2.5);
      var prog = ((AN.t || 0) % T) / T;
      if (prog < 0) prog += 1;
      var curIdx = Math.max(0, Math.min(N, Math.round(prog * N)));

      c.save();
      c.strokeStyle = baseColor;
      c.lineWidth = Math.max(1.4, baseSize * 0.8);
      c.beginPath();
      for (var m = 0; m <= curIdx; m++) {
        var mx = toSX(pts[m].x), my = toSY(pts[m].y);
        if (m === 0) c.moveTo(mx, my); else c.lineTo(mx, my);
      }
      c.stroke();
      c.restore();

      var ballR = Math.max(4, Math.min(innerW, innerH) * 0.045);

      c.save();
      c.globalAlpha = 0.40;
      c.fillStyle = baseColor;
      c.beginPath();
      c.arc(startX, startY, ballR * 0.55, 0, Math.PI * 2);
      c.fill();
      c.restore();

      var cur = pts[curIdx];
      var bx = toSX(cur.x), by = toSY(cur.y);
      c.save();
      c.globalAlpha = 0.72;
      c.fillStyle = baseColor;
      c.beginPath();
      c.arc(bx, by, ballR, 0, Math.PI * 2);
      c.fill();
      c.restore();
      c.beginPath();
      c.arc(bx, by, ballR, 0, Math.PI * 2);
      c.strokeStyle = baseColor;
      c.lineWidth = Math.max(1, baseSize * 0.6);
      c.stroke();

      var curT = prog * tFlight;
      var vxNow = vx0 + ax * curT;
      var vyNow = vy0 + ay * curT;
      var vMag = Math.sqrt(vxNow * vxNow + vyNow * vyNow);
      if (vMag > 1e-6) {
        var vLen = Math.min(innerW, innerH) * 0.22;
        var vex = bx + (vxNow / vMag) * vLen;
        var vey = by - (vyNow / vMag) * vLen;
        c.save();
        c.strokeStyle = "#43a047";
        c.lineWidth = Math.max(1.5, ballR * 0.42);
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(vex, vey);
        c.stroke();
        GH.head(c, bx, by, vex, vey, c.lineWidth);
        c.restore();
      }

      if (aMag > 1e-6) {
        var aLen = Math.min(innerW, innerH) * 0.18;
        var aex = bx + (ax / aMag) * aLen;
        var aey = by - (ay / aMag) * aLen;
        c.save();
        c.strokeStyle = "#f57c00";
        c.lineWidth = Math.max(1.4, ballR * 0.38);
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(aex, aey);
        c.stroke();
        GH.head(c, bx, by, aex, aey, c.lineWidth);
        c.restore();
      }
    }
  });
})();


/* ==========================================================================
 * 20. 一维碰撞
 * ========================================================================== */
(function () {
  var PB2 = window.TangBoBoard;
  if (!PB2 || !PB2.shapes) return;

  if (!PB2.paramDefs) PB2.paramDefs = {};
  if (!PB2.paramDefs.animM1)
    PB2.paramDefs.animM1 = { label:'m₁', min:0.1, max:10, step:0.1, def:1, unit:'kg' };
  if (!PB2.paramDefs.animM2)
    PB2.paramDefs.animM2 = { label:'m₂', min:0.1, max:10, step:0.1, def:1, unit:'kg' };
  if (!PB2.paramDefs.animV1)
    PB2.paramDefs.animV1 = { label:'v₁', min:-10, max:10, step:0.1, def:3, unit:'m/s' };
  if (!PB2.paramDefs.animV2)
    PB2.paramDefs.animV2 = { label:'v₂', min:-10, max:10, step:0.1, def:-2, unit:'m/s' };
  if (!PB2.paramDefs.animRestitution)
    PB2.paramDefs.animRestitution = { label:'恢复系数', min:0, max:1, step:0.05, def:1 };

  if (!PB2.categories.some(function (c) { return c.id === 'anim'; })) {
    PB2.categories.push({ id: 'anim', label: '动画' });
  }

  function withAlpha(color, a) {
    var h = String(color || '#1a1a1a').replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return 'rgba(0,0,0,' + a + ')';
    return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + a + ')';
  }

  function drawVelArrow(c, x, y, v, color) {
    if (Math.abs(v) < 0.05) return;
    var len = Math.min(50, Math.abs(v) * 8);
    var dir = v > 0 ? 1 : -1;
    var ex = x + dir * len;
    c.save();
    c.strokeStyle = withAlpha(color, 0.55);
    c.fillStyle = withAlpha(color, 0.55);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(ex - dir * 6, y);
    c.stroke();
    c.beginPath();
    c.moveTo(ex, y);
    c.lineTo(ex - dir * 6, y - 4);
    c.lineTo(ex - dir * 6, y + 4);
    c.closePath();
    c.fill();
    c.restore();
  }

  var def = {
    key: 'anim_collision1d',
    cat: 'anim',
    geom: 'rect',
    label: '一维碰撞',
    fill: false,
    icon: '<circle cx="7" cy="12" r="4"/><circle cx="17" cy="12" r="3"/>',
    animatable: true,
    params: ['animM1', 'animM2', 'animV1', 'animV2', 'animRestitution'],

    draw: function (c, o, GH) {
      var AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
      var b = GH.box(o);
      if (b.w < 60 || b.h < 40) return;

      var m1 = (o.animM1 != null ? o.animM1 : 1);
      var m2 = (o.animM2 != null ? o.animM2 : 1);
      var v1 = (o.animV1 != null ? o.animV1 : 3);
      var v2 = (o.animV2 != null ? o.animV2 : -2);
      var e  = (o.animRestitution != null ? o.animRestitution : 1);

      var W = 10;
      var scale = b.w / W;

      var r1 = 0.30 * Math.cbrt(m1);
      var r2 = 0.30 * Math.cbrt(m2);

      var x10 = r1;
      var x20 = W - r2;

      var tC = Infinity;
      if (v1 > v2 + 1e-9) {
        var gap = (x20 - x10) - (r1 + r2);
        if (gap > 1e-9) tC = gap / (v1 - v2);
      }

      var sM = m1 + m2;
      var v1p = ((m1 - e * m2) * v1 + (1 + e) * m2 * v2) / sM;
      var v2p = ((1 + e) * m1 * v1 + (m2 - e * m1) * v2) / sM;

      var T = isFinite(tC) ? (tC * 2 + 0.6) : 5;
      var t = AN.t % T;

      var x1, x2, V1, V2;
      if (t < tC) {
        x1 = x10 + v1 * t;
        x2 = x20 + v2 * t;
        V1 = v1; V2 = v2;
      } else {
        var xc1 = x10 + v1 * tC;
        var xc2 = x20 + v2 * tC;
        x1 = xc1 + v1p * (t - tC);
        x2 = xc2 + v2p * (t - tC);
        V1 = v1p; V2 = v2p;
      }

      var py   = (b.y1 + b.y2) / 2;
      var px1  = b.x1 + x1 * scale;
      var px2  = b.x1 + x2 * scale;
      var rpx1 = r1 * scale;
      var rpx2 = r2 * scale;

      var alpha1 = 0.9 / (1 + 0.2 * m1);
      var alpha2 = 0.9 / (1 + 0.2 * m2);

      var color = o.color || '#1a1a1a';

      c.save();
      c.beginPath();
      var floorY = py + Math.max(rpx1, rpx2) + 4;
      c.moveTo(b.x1, floorY);
      c.lineTo(b.x2, floorY);
      c.strokeStyle = withAlpha(color, 0.25);
      c.setLineDash([5, 4]);
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();

      c.save();
      c.beginPath();
      c.arc(px1, py, rpx1, 0, Math.PI * 2);
      c.fillStyle = withAlpha(color, alpha1);
      c.fill();
      c.strokeStyle = color;
      c.lineWidth = Math.max(1.4, (o.size || 4) * 0.55);
      c.stroke();
      c.restore();

      c.save();
      c.beginPath();
      c.arc(px2, py, rpx2, 0, Math.PI * 2);
      c.fillStyle = withAlpha(color, alpha2);
      c.fill();
      c.strokeStyle = color;
      c.lineWidth = Math.max(1.4, (o.size || 4) * 0.55);
      c.stroke();
      c.restore();

      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      // #ffffff 在深色仿真页里会被反色成深墨，正好压住浅色球体；白纸画布上则是白字压深球。
      c.fillStyle = '#ffffff';
      var fs1 = Math.max(8, Math.min(rpx1 * 0.55, 18));
      c.font = '600 ' + fs1 + 'px system-ui,"PingFang SC","Microsoft YaHei",sans-serif';
      c.fillText('m₁', px1, py);
      c.restore();

      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#ffffff';
      var fs2 = Math.max(8, Math.min(rpx2 * 0.55, 18));
      c.font = '600 ' + fs2 + 'px system-ui,"PingFang SC","Microsoft YaHei",sans-serif';
      c.fillText('m₂', px2, py);
      c.restore();

      drawVelArrow(c, px1, py - rpx1 - 14, V1, color);
      drawVelArrow(c, px2, py - rpx2 - 14, V2, color);
    }
  };

  if (typeof PB2.register === 'function') PB2.register(def);
  else PB2.shapes[def.key] = def;
})();


/* ==========================================================================
 * 21. 近代物理
 * ========================================================================== */
(function () {
  var PB2 = window.TangBoBoard;
  if (!PB2) return;

  var shape2 = function (d) {
    if (!d || !d.key) return;
    if (typeof PB2.register === 'function') PB2.register(d);
    else PB2.shapes[d.key] = d;
  };
  var cat2 = function (id, label) {
    if (typeof PB2.category === 'function') PB2.category(id, label);
    else if (!PB2.categories.some(function (c) { return c.id === id; })) {
      PB2.categories.push({ id: id, label: label });
    }
  };

  cat2('modern', '近代物理');

  function withAlpha(color, a) {
    var h = String(color || '#1a1a1a').replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return 'rgba(0,0,0,' + a + ')';
    return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + a + ')';
  }
  var FONT = 'system-ui,"PingFang SC","Microsoft YaHei",sans-serif';

  shape2({
    key: 'atom_structure', cat: 'modern', geom: 'rect', label: '原子结构',
    fill: true,
    icon: '<circle cx="12" cy="12" r="2" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="4" fill="none" stroke="currentColor"/><ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor"/>',
    draw: function (c, o, GH) {
      var b = GH.box(o);
      var cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
      var R = Math.min(b.w, b.h) * 0.42;

      var angles = [0, 60, 120];
      for (var i = 0; i < angles.length; i++) {
        c.save();
        c.translate(cx, cy);
        c.rotate(angles[i] * Math.PI / 180);
        c.beginPath();
        c.ellipse(0, 0, R, R * 0.38, 0, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }

      var eTs = [0.4, 1.9, 3.6];
      for (var i = 0; i < angles.length; i++) {
        var a = angles[i] * Math.PI / 180;
        var t = eTs[i];
        var ex = R * Math.cos(t);
        var ey = R * 0.38 * Math.sin(t);
        var px = cx + ex * Math.cos(a) - ey * Math.sin(a);
        var py = cy + ex * Math.sin(a) + ey * Math.cos(a);
        c.beginPath();
        c.arc(px, py, Math.max(2.5, R * 0.06), 0, Math.PI * 2);
        c.fillStyle = withAlpha(o.color, 0.7);
        c.fill();
        c.stroke();
      }

      c.beginPath();
      c.arc(cx, cy, R * 0.15, 0, Math.PI * 2);
      c.fillStyle = withAlpha(o.color, 0.5);
      c.fill();
      c.stroke();

      c.beginPath();
      c.arc(cx - R * 0.05, cy - R * 0.04, R * 0.05, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(cx + R * 0.05, cy + R * 0.04, R * 0.05, 0, Math.PI * 2);
      c.stroke();
    }
  });

  paramDef('nInit',     { label: '初始能级', min: 1, max: 5, step: 1, def: 3 });
  paramDef('nFinal',    { label: '最终能级', min: 1, max: 5, step: 1, def: 1 });
  paramDef('arrowHue',  { label: '箭头色',   min: 0, max: 6, step: 1, def: 0 });

  shape2({
    key: 'hydrogen_levels', cat: 'modern', geom: 'rect', label: '氢原子能级',
    fill: false,
    icon: '<line x1="3" y1="20" x2="21" y2="20" stroke="currentColor"/>' +
          '<line x1="3" y1="14" x2="21" y2="14" stroke="currentColor"/>' +
          '<line x1="3" y1="9"  x2="21" y2="9"  stroke="currentColor"/>' +
          '<line x1="3" y1="5"  x2="21" y2="5"  stroke="currentColor"/>',
    params: ['nInit', 'nFinal', 'arrowHue'],
    draw: function (c, o, GH) {
      var b = GH.box(o);
      var x1 = b.x1 + 12, x2 = b.x2 - 12;
      var yTop = b.y1 + 14, yBot = b.y2 - 14;
      var h = yBot - yTop;

      var levels = [
        { n: 1, frac: 0,      E: -13.60, text: 'n=1    -13.6 eV' },
        { n: 2, frac: 0.75,   E: -3.40,  text: 'n=2    -3.40 eV'  },
        { n: 3, frac: 0.889,  E: -1.51,  text: 'n=3    -1.51 eV'  },
        { n: 4, frac: 0.9375, E: -0.85,  text: 'n=4    -0.85 eV'  },
        { n: 5, frac: 1.0,    E: 0,      text: 'n=∞    0'         }
      ];

      var fs = Math.max(9, Math.min(12, h * 0.08));
      c.font = fs + 'px ' + FONT;
      c.textBaseline = 'bottom';
      c.textAlign = 'left';

      for (var i = 0; i < levels.length; i++) {
        var L = levels[i];
        L.y = yBot - L.frac * h;
        c.beginPath();
        c.moveTo(x1, L.y);
        c.lineTo(x2, L.y);
        c.stroke();
        c.fillStyle = o.color;
        c.fillText(L.text, x1 + 2, L.y - 2);
      }

      var nI = Math.max(1, Math.min(5, Math.round(o.nInit  ?? 3)));
      var nF = Math.max(1, Math.min(5, Math.round(o.nFinal ?? 1)));
      if (nI === nF) return;

      var from = levels[nI - 1];
      var to   = levels[nF - 1];

      var arrowColor = (typeof HUE7 !== 'undefined')
        ? HUE7[Math.round(o.arrowHue ?? 0) % 7]
        : '#e53935';

      var arrowX = x1 + (x2 - x1) * 0.72;
      var ah = 7;

      c.save();
      c.setLineDash([6, 4]);
      c.lineWidth = Math.max(1, (o.size || 4) * 0.45);
      c.strokeStyle = arrowColor;
      c.beginPath();
      c.moveTo(arrowX, from.y);
      c.lineTo(arrowX, to.y);
      c.stroke();
      c.restore();

      var uy = to.y > from.y ? 1 : -1;
      c.beginPath();
      c.moveTo(arrowX, to.y);
      c.lineTo(arrowX - 4, to.y - uy * ah);
      c.lineTo(arrowX + 4, to.y - uy * ah);
      c.closePath();
      c.fillStyle = arrowColor;
      c.fill();

      var dE = Math.abs(from.E - to.E);
      var absorb = to.E > from.E;
      var label = 'ΔE = ' + dE.toFixed(2) + ' eV  (' + (absorb ? '吸收' : '发射') + ')';

      var midY = (from.y + to.y) / 2;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillStyle = arrowColor;
      c.fillText(label, arrowX + 10, midY);
    }
  });

})();


/* ==========================================================================
 * 22. 圆锥摆
 * ========================================================================== */
(function () {
  var PB2 = window.TangBoBoard;
  if (!PB2) return;

  var shape2 = function (d) {
    if (!d || !d.key) return;
    if (typeof PB2.register === 'function') PB2.register(d);
    else PB2.shapes[d.key] = d;
  };
  var cat2 = function (id, label) {
    if (typeof PB2.category === 'function') PB2.category(id, label);
    else if (!PB2.categories.some(function (c) { return c.id === id; })) {
      PB2.categories.push({ id: id, label: label });
    }
  };

  function withAlpha(color, a) {
    var h = String(color || '#1a1a1a').replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return 'rgba(0,0,0,' + a + ')';
    return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + a + ')';
  }

  if (!PB2.paramDefs) PB2.paramDefs = {};
  if (!PB2.paramDefs.animGravity)
    PB2.paramDefs.animGravity = { label:'重力加速度', min:1, max:30, step:0.5, def:10, unit:'m/s²' };
  if (!PB2.paramDefs.conicalL)
    PB2.paramDefs.conicalL = { label:'摆长', min:0.2, max:2, step:0.05, def:1, unit:'m' };
  if (!PB2.paramDefs.conicalTheta)
    PB2.paramDefs.conicalTheta = { label:'摆角', min:5, max:80, step:1, def:30, unit:'°' };

  shape2({
    key: 'anim_conical_pendulum',
    cat: 'anim',
    geom: 'rect',
    label: '圆锥摆',
    fill: false,
    icon: '<line x1="12" y1="3" x2="6" y2="18"/><line x1="12" y1="3" x2="18" y2="18"/><ellipse cx="12" cy="18" rx="6" ry="2" fill="none" stroke="currentColor"/><circle cx="18" cy="18" r="1.6" fill="currentColor"/>',
    animatable: true,
    params: ['conicalL', 'conicalTheta', 'animGravity'],

    draw: function (c, o, GH) {
      var AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
      var b = GH.box(o);
      if (b.w < 40 || b.h < 40) return;

      var L  = (o.conicalL != null ? o.conicalL : 1);
      var th = (o.conicalTheta != null ? o.conicalTheta : 30) * Math.PI / 180;
      var g  = (o.animGravity != null ? o.animGravity : 10);

      var sinT = Math.sin(th), cosT = Math.cos(th);
      if (cosT < 0.05) cosT = 0.05;

      var padTop = 14, padBot = 34, padX = 14;
      var KY = 0.32;
      var availH = b.h - padTop - padBot - 8;
      var availW = b.w / 2 - padX;

      var LpxByH = availH / (cosT + (KY + 0.06) * sinT);
      var LpxByR = (sinT + 0.06) > 1e-6 ? availW / (sinT + 0.06) : Infinity;
      var Lpx = Math.min(LpxByH, LpxByR);
      if (Lpx < 30) return;

      var pivotX = (b.x1 + b.x2) / 2;
      var pivotY = b.y1 + padTop;

      var radiusPx = Lpx * sinT;
      var heightPx = Lpx * cosT;
      var ballPlaneY = pivotY + heightPx;

      var ellipseRY = radiusPx * KY;

      var omega = Math.sqrt(g / (L * cosT));
      var T = 2 * Math.PI / omega;

      var phi = 2 * Math.PI * (AN.t / T);

      c.save();
      c.setLineDash([4, 4]);
      c.strokeStyle = withAlpha(o.color, 0.30);
      c.lineWidth = Math.max(1, (o.size || 4) * 0.35);
      c.beginPath();
      c.moveTo(pivotX, pivotY);
      c.lineTo(pivotX, ballPlaneY);
      c.stroke();
      c.restore();

      c.save();
      c.setLineDash([5, 4]);
      c.strokeStyle = withAlpha(o.color, 0.40);
      c.lineWidth = Math.max(1, (o.size || 4) * 0.35);
      c.beginPath();
      c.ellipse(pivotX, ballPlaneY, radiusPx, ellipseRY, 0, Math.PI, 2 * Math.PI, false);
      c.stroke();
      c.restore();

      var arcR = Math.min(34, Lpx * 0.28);
      c.save();
      c.strokeStyle = withAlpha(o.color, 0.55);
      c.lineWidth = Math.max(1, (o.size || 4) * 0.35);
      c.beginPath();
      c.arc(pivotX, pivotY, arcR, Math.PI / 2, Math.PI / 2 - th, true);
      c.stroke();
      c.restore();

      c.save();
      c.fillStyle = o.color;
      c.font = Math.max(11, Math.min(14, Lpx * 0.08)) +
               'px system-ui,"PingFang SC","Microsoft YaHei",sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      var midAng = Math.PI / 2 - th / 2;
      c.fillText('θ',
        pivotX + Math.cos(midAng) * (arcR + 12),
        pivotY + Math.sin(midAng) * (arcR + 12));
      c.restore();

      c.save();
      c.beginPath();
      c.arc(pivotX, pivotY, Math.max(3, Lpx * 0.025), 0, Math.PI * 2);
      c.fillStyle = o.color;
      c.fill();
      c.restore();

      var bx = pivotX + radiusPx * Math.cos(phi);
      var by = ballPlaneY + ellipseRY * Math.sin(phi);
      var ballR = Math.max(5, Lpx * 0.055);

      var inFront = Math.sin(phi) >= 0;

      var drawStringAndBall = function () {
        c.save();
        c.beginPath();
        c.moveTo(pivotX, pivotY);
        c.lineTo(bx, by);
        c.strokeStyle = o.color;
        c.lineWidth = Math.max(1.2, (o.size || 4) * 0.5);
        c.stroke();
        c.restore();
        c.save();
        c.beginPath();
        c.arc(bx, by, ballR, 0, Math.PI * 2);
        c.fillStyle = withAlpha(o.color, 0.60);
        c.fill();
        c.strokeStyle = o.color;
        c.lineWidth = Math.max(1.4, (o.size || 4) * 0.55);
        c.stroke();
        c.restore();
      };

      if (!inFront) drawStringAndBall();

      c.save();
      c.strokeStyle = withAlpha(o.color, 0.75);
      c.lineWidth = Math.max(1, (o.size || 4) * 0.35);
      c.beginPath();
      c.ellipse(pivotX, ballPlaneY, radiusPx, ellipseRY, 0, 0, Math.PI, false);
      c.stroke();
      c.restore();

      if (inFront) drawStringAndBall();

      c.save();
      c.fillStyle = o.color;
      c.font = Math.max(10, Math.min(12, Lpx * 0.07)) +
               'px ui-monospace,Menlo,Consolas,monospace';
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillText(
        'ω = ' + omega.toFixed(2) + ' rad/s   T = ' + T.toFixed(2) + ' s',
        b.x1 + 6, b.y2 - 6
      );
      c.restore();
    }
  });
})();


/* ==========================================================================
 * 23. 弹簧振子动画（竖直 / 水平）
 * ========================================================================== */
paramDef('vsPeriod', { label: '周期',     min: 0.3, max: 4,  step: 0.1, def: 1.2, unit: 's' });
paramDef('vsAmp',    { label: '振幅',     min: 5,   max: 100, step: 1,  def: 40 });
paramDef('vsCoils',  { label: '弹簧圈数', min: 3,   max: 20,  step: 1,  def: 8 });
paramDef('vsBlock',  { label: '物块大小', min: 12,  max: 60,  step: 1,  def: 28 });

paramDef('hsPeriod', { label: '周期',     min: 0.3, max: 4,  step: 0.1, def: 1.2, unit: 's' });
paramDef('hsAmp',    { label: '振幅',     min: 5,   max: 100, step: 1,  def: 40 });
paramDef('hsCoils',  { label: '弹簧圈数', min: 3,   max: 20,  step: 1,  def: 8 });
paramDef('hsBlock',  { label: '物块大小', min: 12,  max: 60,  step: 1,  def: 28 });

/* ---- 竖直弹簧振子动画 ---- */
reg({
  key: 'anim_spring_vertical',
  cat: 'anim',
  geom: 'box',
  label: '竖直弹簧振子',
  icon: '<line x1="4" y1="3" x2="20" y2="3"/>' +
        '<path d="M12 3 L9 6 L15 9 L9 12 L15 15 L12 17" ' +
        'fill="none" stroke="currentColor" stroke-width="1.2"/>' +
        '<rect x="7" y="17" width="10" height="5" fill="currentColor"/>',
  animatable: true,
  params: ['vsPeriod', 'vsAmp', 'vsCoils', 'vsBlock'],

  draw(c, o, U2) {
    const AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
    const b  = U2.bbox(o);

    const T      = Math.max(0.2, o.vsPeriod || 1.2);
    const omega  = (2 * Math.PI) / T;
    const blockH = Math.max(14, Math.min(b.h * 0.35, (o.vsBlock || 28) * Math.max(1, Math.min(1.9, Math.min(b.w, b.h) / 420))));
    const blockW = blockH * 1.1;
    const coils  = Math.max(3, Math.min(20, Math.round(o.vsCoils || 8)));

    const cx       = (b.x1 + b.x2) / 2;
    const topY     = b.y1 + 8;
    const beamHalf = Math.min(b.w * 0.35, 60);

    const eqBlockTop = b.y1 + b.h / 2 - blockH / 2;

    const maxAmp = Math.max(5, b.h / 2 - blockH / 2 - 28);
    const amp    = Math.max(3, Math.min(o.vsAmp || 40, maxAmp));

    const yOff   = amp * Math.cos(omega * AN.t);
    const blockY = eqBlockTop + yOff;

    c.beginPath();
    c.moveTo(cx - beamHalf, topY);
    c.lineTo(cx + beamHalf, topY);
    c.stroke();

    c.save();
    c.lineWidth = Math.max(1, (o.size || 4) * 0.4);
    for (let x = cx - beamHalf + 3; x < cx + beamHalf - 2; x += 8) {
      c.beginPath();
      c.moveTo(x, topY);
      c.lineTo(x - 4, topY - 5);
      c.stroke();
    }
    c.restore();

    const springTopY = topY + 1;
    const springBotY = Math.max(springTopY + 4, blockY);
    const springAmp  = Math.min(12, blockW * 0.55);
    const total = coils * 2;
    c.beginPath();
    c.moveTo(cx, springTopY);
    if (springBotY - springTopY < 12) {
      c.lineTo(cx, springBotY);
    } else {
      for (let i = 1; i < total; i++) {
        const yy = springTopY + (springBotY - springTopY) * i / total;
        const xx = cx + (i % 2 === 0 ? -springAmp : springAmp);
        c.lineTo(xx, yy);
      }
      c.lineTo(cx, springBotY);
    }
    c.stroke();

    c.save();
    c.setLineDash([3, 4]);
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.3);
    c.lineWidth = 1;
    const eqY = eqBlockTop + blockH / 2;
    c.beginPath();
    c.moveTo(b.x1 + 6, eqY);
    c.lineTo(b.x2 - 6, eqY);
    c.stroke();
    c.restore();

    c.beginPath();
    c.rect(cx - blockW / 2, blockY, blockW, blockH);
    c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.22);
    c.fill();
    c.stroke();

    const v = -amp * omega * Math.sin(omega * AN.t);
    if (Math.abs(v) > 3) {
      const dir = Math.sign(v);
      const vlen = Math.min(50, Math.abs(v) * 0.15);
      const arrowX = cx + blockW / 2 + 8;
      const startY = blockY + blockH / 2;

      c.save();
      c.strokeStyle = '#43a047';
      c.fillStyle   = '#43a047';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(arrowX, startY);
      c.lineTo(arrowX, startY + vlen * dir);
      c.stroke();
      c.beginPath();
      c.moveTo(arrowX, startY + vlen * dir);
      c.lineTo(arrowX - 4, startY + vlen * dir - 6 * dir);
      c.lineTo(arrowX + 4, startY + vlen * dir - 6 * dir);
      c.closePath();
      c.fill();
      c.restore();
    }
  }
});

/* ---- 水平弹簧振子动画 ---- */
reg({
  key: 'anim_spring_horizontal',
  cat: 'anim',
  geom: 'box',
  label: '水平弹簧振子',
  icon: '<line x1="3" y1="4" x2="3" y2="20"/>' +
        '<path d="M3 12 L6 9 L9 15 L12 9 L15 15 L18 12" ' +
        'fill="none" stroke="currentColor" stroke-width="1.2"/>' +
        '<rect x="18" y="8" width="4" height="8" fill="currentColor"/>',
  animatable: true,
  params: ['hsPeriod', 'hsAmp', 'hsCoils', 'hsBlock'],

  draw(c, o, U2) {
    const AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
    const b  = U2.bbox(o);

    const T      = Math.max(0.2, o.hsPeriod || 1.2);
    const omega  = (2 * Math.PI) / T;
    const uiS    = Math.max(1, Math.min(2.4, Math.min(b.w, b.h) / 380));
    const blockH = Math.max(18, Math.min(b.h * 0.35, (o.hsBlock || 28) * uiS));
    const blockW = blockH;
    const coils  = Math.max(3, Math.min(20, Math.round(o.hsCoils || 8)));

    const groundY = b.y2 - 4;
    const wallX   = b.x1 + 6;
    const wallTop = b.y1 + 8;
    // 俯视示意图：把弹簧与物块放在画布垂直中线，避免整组贴在底边、上方大片空白
    const cy      = b.y1 + b.h * 0.5;

    const eqCenterX = b.x1 + b.w / 2;

    const maxAmp = Math.max(5, b.w / 2 - blockW / 2 - 28);
    const amp    = Math.max(6, Math.min((o.hsAmp || 40) * uiS, maxAmp));

    const xOff = amp * Math.cos(omega * AN.t);
    const blockCenterX = eqCenterX + xOff;

    c.beginPath();
    c.moveTo(wallX, wallTop);
    c.lineTo(wallX, groundY);
    c.stroke();

    c.save();
    c.lineWidth = Math.max(1, (o.size || 4) * 0.5);
    for (let y = wallTop + 3; y < groundY - 2; y += 8) {
      c.beginPath();
      c.moveTo(wallX, y);
      c.lineTo(wallX - 5, y + 4);
      c.stroke();
    }
    c.restore();

    c.save();
    c.setLineDash([3, 4]);
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.3);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(eqCenterX, b.y1 + 6);
    c.lineTo(eqCenterX, groundY - 2);
    c.stroke();
    c.restore();

    const springLeftX  = wallX + 2;
    const springRightX = blockCenterX - blockW / 2;
    const springAmp    = Math.min(22, blockH * 0.5);
    const springLen    = springRightX - springLeftX;
    const total = coils * 2;

    c.beginPath();
    c.moveTo(springLeftX, cy);
    if (springLen < 12) {
      c.lineTo(Math.max(springLeftX, springRightX), cy);
    } else {
      for (let i = 1; i < total; i++) {
        const xx = springLeftX + springLen * i / total;
        const yy = cy + (i % 2 === 0 ? -springAmp : springAmp);
        c.lineTo(xx, yy);
      }
      c.lineTo(springRightX, cy);
    }
    c.stroke();

    c.beginPath();
    c.rect(blockCenterX - blockW / 2, cy - blockH / 2, blockW, blockH);
    c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.22);
    c.fill();
    c.stroke();

    if (blockW >= 14 && blockH >= 14) {
      c.save();
      c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.9);
      c.font = 'bold ' + Math.min(blockW, blockH) * 0.55 + 'px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('m', blockCenterX, cy);
      c.restore();
    }

    const v = -amp * omega * Math.sin(omega * AN.t);
    if (Math.abs(v) > 3) {
      const dir = Math.sign(v);
      const vlen = Math.min(50, Math.abs(v) * 0.15);
      const arrowY = cy - blockH / 2 - 10;
      const startX = blockCenterX;

      c.save();
      c.strokeStyle = '#43a047';
      c.fillStyle   = '#43a047';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(startX, arrowY);
      c.lineTo(startX + vlen * dir, arrowY);
      c.stroke();
      c.beginPath();
      c.moveTo(startX + vlen * dir, arrowY);
      c.lineTo(startX + vlen * dir - 6 * dir, arrowY - 4);
      c.lineTo(startX + vlen * dir - 6 * dir, arrowY + 4);
      c.closePath();
      c.fill();
      c.restore();
    }
  }
});


/* ==========================================================================
 * 24. 带电粒子在正交电磁场中的运动（旋轮线）
 * ========================================================================== */
paramDef('cyc_v0',  { label: '初速度v₀',    min: 0.1, max: 1.5, step: 0.05, def: 0.5,  unit: '×宽/s' });
paramDef('cyc_ang', { label: '初速方向',    min: -180, max: 180, step: 5,  def: 0,    unit: '°' });
paramDef('cyc_vd',  { label: '漂移速度',    min: 0,   max: 1.5, step: 0.05, def: 0.2,  unit: '×宽/s' });
paramDef('cyc_T',   { label: '回旋周期',    min: 0.5, max: 5,   step: 0.1,  def: 3,    unit: 's' });
paramDef('cyc_B',   { label: '磁场0外1里',  min: 0,   max: 1,   step: 1,    def: 0 });
paramDef('cyc_sV',  { label: '显示速度',    min: 0,   max: 1,   step: 1,    def: 1 });
paramDef('cyc_sFL', { label: '显示F洛伦兹', min: 0,   max: 1,   step: 1,    def: 1 });
paramDef('cyc_sFE', { label: '显示F电场',   min: 0,   max: 1,   step: 1,    def: 0 });

function __cycArrow(c, x1, y1, x2, y2, color) {
  const dx = x2 - x1, dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  if (L < 4) return;
  const ux = dx / L, uy = dy / L;
  const hL = Math.min(11, L * 0.42);
  const hW = hL * 0.55;
  c.save();
  c.strokeStyle = color;
  c.fillStyle   = color;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2 - ux * hL * 0.6, y2 - uy * hL * 0.6);
  c.stroke();
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - ux * hL - uy * hW, y2 - uy * hL + ux * hW);
  c.lineTo(x2 - ux * hL + uy * hW, y2 - uy * hL - ux * hW);
  c.closePath();
  c.fill();
  c.restore();
}

reg({
  key: 'anim_cycloid',
  cat: 'anim',
  geom: 'box',
  label: '旋轮线运动',
  icon: '<path d="M2 16 Q 6 4 10 16 Q 14 4 18 16" fill="none" ' +
        'stroke="currentColor" stroke-width="1.4"/>',
  animatable: true,
  params: ['cyc_v0', 'cyc_ang', 'cyc_vd', 'cyc_T', 'cyc_B', 'cyc_sV', 'cyc_sFL', 'cyc_sFE'],

  draw(c, o, U2) {
    const AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
    const b  = U2.bbox(o);

    const W        = b.w;
    const v0_unit  = Math.max(0.02, o.cyc_v0  ?? 0.5);
    const ang0     = ((o.cyc_ang ?? 0) * Math.PI) / 180;
    const vd_unit  = Math.max(0,    o.cyc_vd  ?? 0.2);
    const T        = Math.max(0.3,  o.cyc_T   ?? 3);
    const Bdir     = Math.round(o.cyc_B || 0);
    const Bsign    = Bdir === 0 ? 1 : -1;
    const showV    = (o.cyc_sV  ?? 1) > 0.5;
    const showFL   = (o.cyc_sFL ?? 1) > 0.5;
    const showFE   = (o.cyc_sFE ?? 0) > 0.5;

    const v0     = v0_unit * W;
    const vd_mag = vd_unit * W;
    const omega  = Bsign * 2 * Math.PI / T;
    const vd_eff = vd_mag * Bsign;

    const ux0 = v0 * Math.cos(ang0) - vd_eff;
    const uy0 = v0 * Math.sin(ang0);

    let xFrac = 0.5;
    if (vd_eff >  0.02 * W) xFrac = 0.22;
    else if (vd_eff < -0.02 * W) xFrac = 0.78;
    const originX = b.x1 + b.w * xFrac;
    const originY = b.y1 + b.h * 0.5;

    const toCanvas = (xp, yp) => ({ x: originX + xp, y: originY - yp });

    const posAt = (tt) => {
      if (Math.abs(omega) < 1e-4) {
        return { x: (vd_eff + ux0) * tt, y: uy0 * tt };
      }
      const w = omega * tt;
      const s = Math.sin(w), co = Math.cos(w);
      return {
        x: vd_eff * tt + (1 / omega) * (ux0 * s - uy0 * (co - 1)),
        y:              (1 / omega) * (ux0 * (co - 1) + uy0 * s)
      };
    };
    const velAt = (tt) => {
      const w = omega * tt;
      const s = Math.sin(w), co = Math.cos(w);
      return {
        x: vd_eff + ux0 * co + uy0 * s,
        y:         -ux0 * s  + uy0 * co
      };
    };

    c.save();
    c.beginPath();
    c.rect(b.x1, b.y1, b.w, b.h);
    c.clip();

    c.save();
    c.setLineDash([3, 5]);
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.22);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(b.x1, originY);
    c.lineTo(b.x2, originY);
    c.stroke();
    c.restore();

    const tNow = AN.t;
    const tWin = Math.min(tNow, T * 2);

    if (tWin > 0.01) {
      const t0 = tNow - tWin;
      const N  = Math.max(30, Math.min(200, Math.round(tWin / T * 100)));
      c.save();
      c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.55);
      c.lineWidth = Math.max(1.2, (o.size || 4) * 0.5);
      c.beginPath();
      for (let i = 0; i <= N; i++) {
        const tt = t0 + tWin * i / N;
        const pp = posAt(tt);
        const cv = toCanvas(pp.x, pp.y);
        i === 0 ? c.moveTo(cv.x, cv.y) : c.lineTo(cv.x, cv.y);
      }
      c.stroke();
      c.restore();
    }

    c.save();
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.35);
    c.lineWidth = 1;
    c.beginPath();
    c.arc(originX, originY, 3, 0, Math.PI * 2);
    c.stroke();
    c.restore();

    const posP = posAt(tNow);
    const velP = velAt(tNow);
    const posC = toCanvas(posP.x, posP.y);
    const vMag = Math.hypot(velP.x, velP.y);

    const arrowScale = 55 / Math.max(v0, 1e-3);
    const arrowCap   = 90;

    if (showFE && Math.abs(vd_eff) > 0.5) {
      const base = Math.min(arrowCap, Math.abs(vd_eff) * arrowScale);
      if (base > 4) {
        __cycArrow(c, posC.x, posC.y, posC.x, posC.y - base, '#1e88e5');
      }
    }

    if (showFL && vMag > 0.5) {
      const fx =  omega * velP.y;
      const fy = -omega * velP.x;
      const fm = Math.hypot(fx, fy);
      if (fm > 1e-6) {
        const base = Math.min(arrowCap, vMag * arrowScale);
        const ux = fx / fm, uy = fy / fm;
        __cycArrow(c, posC.x, posC.y,
                   posC.x + ux * base, posC.y - uy * base, '#e53935');
      }
    }

    if (showV && vMag > 0.5) {
      const vLen = Math.min(arrowCap, vMag * arrowScale);
      const ux = velP.x / vMag, uy = velP.y / vMag;
      __cycArrow(c, posC.x, posC.y,
                 posC.x + ux * vLen, posC.y - uy * vLen, '#43a047');
    }

    const pR = Math.max(5, Math.min(9, W * 0.014));
    c.save();
    c.beginPath();
    c.arc(posC.x, posC.y, pR, 0, Math.PI * 2);
    c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.75);
    c.fill();
    c.lineWidth = Math.max(1.2, (o.size || 4) * 0.6);
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.95);
    c.stroke();
    c.beginPath();
    c.arc(posC.x - pR * 0.3, posC.y - pR * 0.3, pR * 0.3, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fill();
    c.restore();

    const indX = b.x2 - 22;
    const indY = b.y1 + 22;
    const indR = 10;
    c.save();
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.6);
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(indX, indY, indR, 0, Math.PI * 2);
    c.stroke();
    if (Bsign > 0) {
      c.beginPath();
      c.arc(indX, indY, 3, 0, Math.PI * 2);
      c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.75);
      c.fill();
    } else {
      const d = indR * 0.7;
      c.beginPath();
      c.moveTo(indX - d, indY - d); c.lineTo(indX + d, indY + d);
      c.moveTo(indX + d, indY - d); c.lineTo(indX - d, indY + d);
      c.stroke();
    }
    c.restore();

    c.save();
    c.font = '11px system-ui, sans-serif';
    c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.55);
    c.textAlign = 'right';
    c.textBaseline = 'top';
    c.fillText(Bsign > 0 ? 'B ⊙' : 'B ⊗', b.x2 - 6, b.y1 + 4);
    c.restore();

    c.restore();
  }
});


/* ==========================================================================
 * 25. 单摆（大角度周期修正）
 * ========================================================================== */
paramDef('pd_a0', { label: '释放角度', min: 0,   max: 90,  step: 1,    def: 60,  unit: '°' });
paramDef('pd_L',  { label: '摆长',     min: 0.2, max: 1.2, step: 0.05, def: 0.7, unit: 'm' });
paramDef('pd_g',  { label: '重力g',    min: 1,   max: 20,  step: 0.1,  def: 9.8, unit: 'm/s²' });
paramDef('pd_r',  { label: '球半径',   min: 2,   max: 15,  step: 0.5,  def: 6,   unit: 'px' });

function __pd_EllipticK(k) {
  if (k < 1e-8) return Math.PI / 2;
  let a = 1, b = Math.sqrt(1 - k * k);
  for (let i = 0; i < 20; i++) {
    const aN = (a + b) / 2;
    const bN = Math.sqrt(a * b);
    if (Math.abs(aN - bN) < 1e-12) { a = aN; break; }
    a = aN; b = bN;
  }
  return Math.PI / (2 * a);
}
function __pd_PeriodFactor(theta0) {
  const k = Math.sin(theta0 / 2);
  return (2 / Math.PI) * __pd_EllipticK(k);
}

reg({
  key: 'anim_simple_pendulum',
  cat: 'anim',
  geom: 'box',
  label: '单摆(修正)',
  icon: '<circle cx="12" cy="3.5" r="1.3" fill="currentColor"/>' +
        '<line x1="12" y1="3.5" x2="17.5" y2="17"/>' +
        '<circle cx="17.5" cy="17" r="2.3" fill="currentColor"/>',
  animatable: true,
  params: ['pd_a0', 'pd_L', 'pd_g', 'pd_r'],

  draw(c, o, U2) {
    const AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
    const b  = U2.bbox(o);

    const L     = Math.max(0.1, o.pd_L ?? 0.7);
    const g     = Math.max(0.5, o.pd_g ?? 9.8);
    const rBall = Math.max(5, (o.pd_r ?? 6) * Math.max(1, Math.min(2, b.h / 420)));
    const a0    = ((o.pd_a0 ?? 60) * Math.PI) / 180;

    const T0     = 2 * Math.PI * Math.sqrt(L / g);
    const kFac   = __pd_PeriodFactor(a0);
    const T_phys = T0 * kFac;

    if (!window.__pdStates) window.__pdStates = new WeakMap();
    let S = window.__pdStates.get(o);
    const sig = L + '|' + g + '|' + a0;
    if (!S || S.sig !== sig || AN.t < S.lastT) {
      S = { theta: a0, omega: 0, lastT: AN.t, sig };
      window.__pdStates.set(o, S);
    }

    let dt = AN.t - S.lastT;
    if (!isFinite(dt) || dt < 0 || dt > 0.5) dt = 0;

    if (dt > 1e-6) {
      const hMax = 0.001;
      const nSub = Math.min(80, Math.max(1, Math.ceil(dt / hMax)));
      const h    = dt / nSub;
      const acc  = th => -(g / L) * Math.sin(th);
      for (let i = 0; i < nSub; i++) {
        const th = S.theta, om = S.omega;
        const k1t = om,             k1o = acc(th);
        const k2t = om + h*0.5*k1o, k2o = acc(th + h*0.5*k1t);
        const k3t = om + h*0.5*k2o, k3o = acc(th + h*0.5*k2t);
        const k4t = om + h*k3o,     k4o = acc(th + h*k3t);
        S.theta += h/6 * (k1t + 2*k2t + 2*k3t + k4t);
        S.omega += h/6 * (k1o + 2*k2o + 2*k3o + k4o);
      }
    }
    S.lastT = AN.t;
    const theta = S.theta;

    const Lmax  = 1.2;
    const ratio = Math.sqrt(Math.max(0, Math.min(1, L / Lmax)));
    const maxV  = Math.min(b.h - 40, b.w * 0.45) - rBall;
    const Lpx   = Math.max(20, maxV * ratio);

    const pivotX = (b.x1 + b.x2) / 2;
    const pivotY = b.y1 + 24;

    const ballX = pivotX + Lpx * Math.sin(theta);
    const ballY = pivotY + Lpx * Math.cos(theta);

    c.save();
    c.lineWidth = Math.max(1, (o.size || 4) * 0.5);
    const beamHalf = Math.min(b.w * 0.25, Lpx * 0.5 + 12);
    c.beginPath();
    c.moveTo(pivotX - beamHalf, pivotY);
    c.lineTo(pivotX + beamHalf, pivotY);
    c.stroke();
    c.beginPath();
    c.moveTo(pivotX, pivotY);
    c.lineTo(pivotX, b.y1);
    c.stroke();
    for (let x = pivotX - beamHalf + 3; x < pivotX + beamHalf - 2; x += 9) {
      c.beginPath();
      c.moveTo(x, pivotY);
      c.lineTo(x - 4, pivotY + 5);
      c.stroke();
    }
    c.restore();

    c.save();
    c.setLineDash([3, 5]);
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.3);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(pivotX, pivotY);
    c.lineTo(pivotX, pivotY + Lpx + 5);
    c.stroke();
    c.restore();

    if (a0 > 0.02) {
      c.save();
      c.setLineDash([2, 5]);
      c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.2);
      c.lineWidth = 1;
      const xL = pivotX + Lpx * Math.sin(a0);
      const yL = pivotY + Lpx * Math.cos(a0);
      const xR = pivotX + Lpx * Math.sin(-a0);
      const yR = pivotY + Lpx * Math.cos(-a0);
      c.beginPath();
      c.moveTo(pivotX, pivotY); c.lineTo(xL, yL);
      c.moveTo(pivotX, pivotY); c.lineTo(xR, yR);
      c.stroke();
      c.restore();
    }

    if (Math.abs(theta) > 0.04) {
      const arcR = Math.min(Lpx * 0.35, 45);
      c.save();
      c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.5);
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(pivotX, pivotY, arcR, Math.PI / 2, Math.PI / 2 - theta, theta > 0);
      c.stroke();
      c.restore();
    }

    c.save();
    c.lineWidth = Math.max(1.2, (o.size || 4) * 0.55);
    c.beginPath();
    c.moveTo(pivotX, pivotY);
    c.lineTo(ballX, ballY);
    c.stroke();
    c.restore();

    c.save();
    c.beginPath();
    c.arc(pivotX, pivotY, 3.5, 0, Math.PI * 2);
    c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.6);
    c.fill();
    c.restore();

    c.beginPath();
    c.arc(ballX, ballY, rBall, 0, Math.PI * 2);
    c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.7);
    c.fill();
    c.stroke();
    c.save();
    c.beginPath();
    c.arc(ballX - rBall * 0.3, ballY - rBall * 0.3, rBall * 0.3, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fill();
    c.restore();

    if (Math.abs(theta) > 0.04) {
      c.save();
      c.font = 'bold 12px system-ui, sans-serif';
      c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.75);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const deg = (theta * 180 / Math.PI).toFixed(0);
      const labelR = Math.min(Lpx * 0.35, 45) + 16;
      const labelAng = Math.PI / 2 - theta / 2;
      const lx = pivotX + labelR * Math.cos(labelAng);
      const ly = pivotY + labelR * Math.sin(labelAng);
      c.fillText(deg + '°', lx, ly);
      c.restore();
    }

    const panelW = 118;
    const panelH = 54;
    const panelX = b.x2 - panelW - 6;
    const panelY = b.y2 - panelH - 6;

    c.save();
    c.fillStyle = 'rgba(255, 255, 255, 0.85)';
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.18);
    c.lineWidth = 1;
    const rr = 6;
    c.beginPath();
    c.moveTo(panelX + rr, panelY);
    c.lineTo(panelX + panelW - rr, panelY);
    c.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + rr);
    c.lineTo(panelX + panelW, panelY + panelH - rr);
    c.quadraticCurveTo(panelX + panelW, panelY + panelH,
                       panelX + panelW - rr, panelY + panelH);
    c.lineTo(panelX + rr, panelY + panelH);
    c.quadraticCurveTo(panelX, panelY + panelH, panelX, panelY + panelH - rr);
    c.lineTo(panelX, panelY + rr);
    c.quadraticCurveTo(panelX, panelY, panelX + rr, panelY);
    c.closePath();
    c.fill();
    c.stroke();

    c.font = '10px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    const colGray = U2.alpha(o.color || '#1a1a1a', 0.55);
    const colBlue = '#1e88e5';
    const colRed  = '#e53935';

    const lineX1 = panelX + 7;
    const lineY1 = panelY + 13;
    const lineY2 = panelY + 27;
    const lineY3 = panelY + 41;
    const valX   = panelX + panelW - 7;

    c.fillStyle = colGray;
    c.fillText('T₀ 理论', lineX1, lineY1);
    c.fillStyle = colBlue;
    c.textAlign = 'right';
    c.fillText('\u200b' + T0.toFixed(3) + ' s', valX, lineY1);

    c.fillStyle = colGray;
    c.textAlign = 'left';
    c.fillText('T 修正', lineX1, lineY2);
    c.fillStyle = colRed;
    c.textAlign = 'right';
    c.fillText('\u200b' + T_phys.toFixed(3) + ' s', valX, lineY2);

    c.fillStyle = colGray;
    c.textAlign = 'left';
    c.fillText('T/T₀', lineX1, lineY3);
    c.fillStyle = (kFac > 1.03) ? colRed : colGray;
    c.textAlign = 'right';
    c.fillText('\u200b' + '×' + kFac.toFixed(4), valX, lineY3);

    c.restore();

    if (kFac > 1.03) {
      c.save();
      c.font = '10px system-ui, sans-serif';
      c.fillStyle = 'rgba(229,57,53,0.8)';
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillText('大角度修正', b.x1 + 6, b.y1 + 4);
      c.fillStyle = 'rgba(229,57,53,0.55)';
      c.font = '9px ui-monospace, monospace';
      c.fillText('T = T₀·(2/π)·K(k)', b.x1 + 6, b.y1 + 17);
      c.restore();
    }
  }
});


/* ==========================================================================
 * 26. 圆弧轨道 + 小球（四种特殊初速度）
 * ========================================================================== */
paramDef('sb5R', { label: '轨道半径', min: 60,  max: 200, step: 5,    def: 120, unit: 'px' });
paramDef('sb5r', { label: '球半径',   min: 3,   max: 15,  step: 0.5,  def: 8,   unit: 'px' });
paramDef('sb5special', { label: '特殊值0-4', min: 0, max: 4, step: 1, def: 0 });
paramDef('sb5k', { label: '相对速度k', min: 0.5, max: 3,  step: 0.05, def: 1.5 });
paramDef('sb5g', { label: '重力g',    min: 1,   max: 20,  step: 0.1,  def: 9.8, unit: 'm/s²' });

var __sb5_SpecialList = [
  null,
  { name: '刚好到圆心等高处',   formula: 'v₀ = √(2gR)',       alpha: 2 },
  { name: '脱轨后抛到最低点',   formula: 'v₀ = √(7gR/2)',     alpha: 3.5 },
  { name: '脱轨后抛出后过圆心', formula: 'v₀ = √((2+√3)gR)', alpha: 2 + Math.sqrt(3) },
  { name: '刚好到最高点',       formula: 'v₀ = √(5gR)',       alpha: 5 }
];

function __sb5_step(S, h, P) {
  const { g_px, R_eff, cx, cy, groundY, r_ball, b, v0_px, v0_2 } = P;
  const groundCenterY = groundY - r_ball;

  if (S.phase === 'approach') {
    S.x += S.vx * h;
    if (S.x >= cx) {
      S.x = cx; S.y = groundCenterY;
      S.phase = 'onTrack'; S.theta = 0;
      S.omega = v0_px / R_eff;
    }
    return;
  }

  if (S.phase === 'onTrack') {
    const acc = th => -(g_px / R_eff) * Math.sin(th);
    const k1t = S.omega, k1o = acc(S.theta);
    const k2t = S.omega + h * 0.5 * k1o, k2o = acc(S.theta + h * 0.5 * k1t);
    const k3t = S.omega + h * 0.5 * k2o, k3o = acc(S.theta + h * 0.5 * k2t);
    const k4t = S.omega + h * k3o,       k4o = acc(S.theta + h * k3t);
    S.theta += h / 6 * (k1t + 2 * k2t + 2 * k3t + k4t);
    S.omega += h / 6 * (k1o + 2 * k2o + 2 * k3o + k4o);

    if (S.theta <= 0 && S.omega < 0) {
      S.theta = 0; S.x = cx; S.y = groundCenterY;
      S.vx = -v0_px; S.vy = 0;
      S.phase = 'onGround';
      return;
    }

    if (S.theta >= Math.PI) {
      const vT2 = v0_2 - 4 * g_px * R_eff;
      S.theta = Math.PI; S.x = cx; S.y = cy - R_eff;
      if (vT2 > 0) {
        S.vx = -Math.sqrt(vT2); S.vy = 0;
        S.phase = 'projectile';
      } else {
        S.vx = 0; S.vy = 0;
        S.phase = 'onGround';
      }
      return;
    }

    const cosT = Math.cos(S.theta), sinT = Math.sin(S.theta);
    const v2 = v0_2 - 2 * g_px * R_eff * (1 - cosT);
    const N  = v2 / R_eff + g_px * cosT;
    // 速度接近零时不判脱轨：那是小球滑到最高点、要沿着圆弧原路滑回的时刻。
    // 若在此处脱轨，vD≈0 会让小球竖直落下、贴着圆弧外侧走，看起来就是「穿模」。
    // 门限取相对值（0.45·√(gR)），保证真正的脱轨题（v₀=√(7gR/2) 等）仍然脱轨。
    const spd = Math.abs(S.omega) * R_eff;
    const vRef = Math.sqrt(g_px * R_eff);
    if (N < 0 && sinT > 0.01 && spd > 0.45 * vRef) {
      let cosD = 2 / 3 - v0_2 / (3 * g_px * R_eff);
      cosD = Math.max(-1, Math.min(1, cosD));
      const thetaD = Math.acos(cosD);
      S.theta = thetaD;
      S.x = cx + R_eff * Math.sin(thetaD);
      S.y = cy + R_eff * Math.cos(thetaD);
      const vD2 = Math.max(0, v0_2 - 2 * g_px * R_eff * (1 - Math.cos(thetaD)));
      const vD  = Math.sqrt(vD2);
      S.vx =  vD * Math.cos(thetaD);
      S.vy = -vD * Math.sin(thetaD);
      S.phase = 'projectile';
    }
    return;
  }

  if (S.phase === 'projectile') {
    S.x += S.vx * h;
    S.y += S.vy * h;
    S.vy += g_px * h;
    if (S.y >= groundCenterY) {
      S.y = groundCenterY; S.vy = 0;
      S.phase = 'onGround';
    }
    return;
  }

  if (S.phase === 'onGround') {
    S.x += S.vx * h;
    if (S.x < b.x1 - 150 || S.x > b.x2 + 150) {
      S.phase = 'approach';
      S.x = Math.max(b.x1 + 12, cx - R_eff * 2 - 50);
      S.y = groundCenterY; S.vx = v0_px; S.vy = 0;
      S.theta = 0; S.omega = 0;
      S.trail = [];
    }
  }
}

reg({
  key: 'anim_slot_ball5',
  cat: 'anim',
  geom: 'box',
  label: '圆弧轨道(特殊速度)',
  icon: '<path d="M3 18 Q 12 4 21 18" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
        '<circle cx="8" cy="16" r="1.8" fill="currentColor"/>',
  animatable: true,
  params: ['sb5R', 'sb5r', 'sb5special', 'sb5k', 'sb5g'],

  draw(c, o, U2) {
    const AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
    const b  = U2.bbox(o);

    const R_user = o.sb5R ?? 120;
    const r_user = o.sb5r ?? 8;
    const k_free = o.sb5k ?? 1.5;
    const g_m    = o.sb5g ?? 9.8;
    const sIdx   = Math.round(o.sb5special ?? 0);
    const special = __sb5_SpecialList[sIdx] || null;

    const maxR = Math.min(b.w * 0.40, b.h * 0.72);
    const R    = Math.min(maxR, (R_user / 200) * maxR);
    const r_ball = Math.min(R * 0.20, (r_user / 15) * maxR * 0.06);
    const R_eff  = Math.max(1, R - r_ball);

    const alpha = special ? special.alpha : k_free * k_free;

    const g_px = g_m * 16;
    const v0_2  = alpha * g_px * R_eff;
    const v0_px = Math.sqrt(v0_2);
    const v_ref = Math.sqrt(g_px * R_eff);

    const cx = (b.x1 + b.x2) / 2;
    const groundY = b.y2 - 3;
    const cy = groundY - R;
    const groundCenterY = groundY - r_ball;

    if (!window.__sb5States) window.__sb5States = new WeakMap();
    let S = window.__sb5States.get(o);
    const sig = R + '|' + r_ball + '|' + alpha + '|' + g_px + '|' + b.x1 + '|' + b.x2 + '|' + groundY;

    const startX = Math.max(b.x1 + 12, cx - R_eff * 2 - 50);
    const resetState = () => {
      S = {
        sig, phase: 'approach', theta: 0, omega: 0,
        x: startX, y: groundCenterY, vx: v0_px, vy: 0,
        lastT: AN.t, trail: [],
      };
      window.__sb5States.set(o, S);
    };
    if (!S || S.sig !== sig) resetState();

    let dt = AN.t - S.lastT;
    if (!isFinite(dt) || dt < 0 || dt > 0.5) { resetState(); dt = 0; }
    S.lastT = AN.t;

    if (dt > 0) {
      const maxStep = 0.002;
      const nSub = Math.min(200, Math.max(1, Math.ceil(dt / maxStep)));
      const h = dt / nSub;
      const P = { g_px, R_eff, cx, cy, groundY, r_ball, b, v0_px, v0_2 };
      for (let i = 0; i < nSub; i++) __sb5_step(S, h, P);
    }

    let ballX, ballY;
    if (S.phase === 'onTrack') {
      ballX = cx + R_eff * Math.sin(S.theta);
      ballY = cy + R_eff * Math.cos(S.theta);
    } else {
      ballX = S.x; ballY = S.y;
    }

    if (S.phase === 'onTrack' || S.phase === 'projectile') {
      if (!S.trail) S.trail = [];
      const last = S.trail.length ? S.trail[S.trail.length - 1] : null;
      if (!last || Math.hypot(ballX - last.x, ballY - last.y) > 2.5) {
        S.trail.push({ x: ballX, y: ballY });
        if (S.trail.length > 1000) S.trail.shift();
      }
    }

    const lineW = Math.max(1, (o.size || 4) * 0.55);

    c.save();
    c.lineWidth = lineW;
    c.beginPath(); c.moveTo(b.x1, groundY); c.lineTo(b.x2, groundY); c.stroke();
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.32);
    c.lineWidth = Math.max(0.8, (o.size || 4) * 0.4);
    for (let x = b.x1 + 8; x < b.x2 - 4; x += 12) {
      c.beginPath();
      c.moveTo(x, groundY + 1); c.lineTo(x + 4, groundY + 5); c.stroke();
    }
    c.restore();

    c.save();
    c.lineWidth = lineW * 1.6;
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.85);
    c.beginPath();
    c.arc(cx, cy, R, Math.PI / 2, -Math.PI / 2, true);
    c.stroke();
    c.restore();

    c.save();
    c.setLineDash([3, 5]);
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.25);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, groundY); c.stroke();
    c.restore();

    if (S.trail && S.trail.length > 1) {
      c.save();
      c.setLineDash([5, 4]);
      c.strokeStyle = 'rgba(229,57,53,0.55)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(S.trail[0].x, S.trail[0].y);
      for (let i = 1; i < S.trail.length; i++) c.lineTo(S.trail[i].x, S.trail[i].y);
      c.stroke();
      c.restore();
    }

    c.beginPath();
    c.arc(ballX, ballY, r_ball, 0, Math.PI * 2);
    c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.72);
    c.fill();
    c.lineWidth = Math.max(1.2, (o.size || 4) * 0.6);
    c.stroke();
    c.save();
    c.beginPath();
    c.arc(ballX - r_ball * 0.3, ballY - r_ball * 0.3, r_ball * 0.3, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.fill();
    c.restore();

    let vspeed = 0, vdx = 0, vdy = 0;
    if (S.phase === 'onTrack') {
      vspeed = Math.sqrt(Math.max(0, v0_2 - 2 * g_px * R_eff * (1 - Math.cos(S.theta))));
      const sgn = Math.sign(S.omega) || 1;
      vdx =  sgn * Math.cos(S.theta);
      vdy = -sgn * Math.sin(S.theta);
    } else {
      vspeed = Math.hypot(S.vx, S.vy);
      if (vspeed > 1e-6) { vdx = S.vx / vspeed; vdy = S.vy / vspeed; }
    }
    if (vspeed > 5) {
      const arrLen = Math.min(70, vspeed * 0.22);
      const ex = ballX + vdx * arrLen, ey = ballY + vdy * arrLen;
      c.save();
      c.strokeStyle = '#43a047'; c.fillStyle = '#43a047';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(ballX, ballY); c.lineTo(ex, ey); c.stroke();
      const hL = Math.min(12, arrLen * 0.35), hW = hL * 0.6;
      c.beginPath();
      c.moveTo(ex, ey);
      c.lineTo(ex - vdx * hL - vdy * hW, ey - vdy * hL + vdx * hW);
      c.lineTo(ex - vdx * hL + vdy * hW, ey - vdy * hL - vdx * hW);
      c.closePath(); c.fill();
      c.restore();
    }

    let sitLabel, sitColor, angleLabel, angleColor;
    if (alpha >= 5) {
      sitLabel = '顶部平抛'; sitColor = '#e53935';
      angleLabel = '脱离角 360°(2π)'; angleColor = '#e53935';
    } else if (alpha < 2) {
      sitLabel = '返回'; sitColor = '#7a8598';
      const cosMax = Math.max(-1, Math.min(1, 1 - alpha / 2));
      const maxDeg = Math.acos(cosMax) * 180 / Math.PI;
      angleLabel = '最大角 ' + maxDeg.toFixed(1) + '°'; angleColor = '#7a8598';
    } else {
      sitLabel = '脱离'; sitColor = '#f57c00';
      const cosD = Math.max(-1, Math.min(1, 2 / 3 - alpha / 3));
      const detachDeg = Math.acos(cosD) * 180 / Math.PI;
      angleLabel = '脱离角 ' + detachDeg.toFixed(1) + '°'; angleColor = '#f57c00';
    }

    c.save();
    c.font = 'bold 11px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'bottom';
    c.fillStyle = sitColor;
    c.fillText(sitLabel + '  α = ' + alpha.toFixed(2), b.x1 + 8, b.y2 - 22);
    c.fillStyle = angleColor;
    c.fillText(angleLabel, b.x1 + 8, b.y2 - 6);
    c.restore();

    const vNorm = vspeed / v_ref;
    const panelW = 130, panelH = 26;
    const panelX = b.x2 - panelW - 6, panelY = b.y2 - panelH - 6;

    c.save();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.strokeStyle = U2.alpha(o.color || '#1a1a1a', 0.18);
    c.lineWidth = 1;
    const rr = 5;
    c.beginPath();
    c.moveTo(panelX + rr, panelY);
    c.lineTo(panelX + panelW - rr, panelY);
    c.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + rr);
    c.lineTo(panelX + panelW, panelY + panelH - rr);
    c.quadraticCurveTo(panelX + panelW, panelY + panelH, panelX + panelW - rr, panelY + panelH);
    c.lineTo(panelX + rr, panelY + panelH);
    c.quadraticCurveTo(panelX, panelY + panelH, panelX, panelY + panelH - rr);
    c.lineTo(panelX, panelY + rr);
    c.quadraticCurveTo(panelX, panelY, panelX + rr, panelY);
    c.closePath();
    c.fill(); c.stroke();

    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = U2.alpha(o.color || '#1a1a1a', 0.6);
    c.fillText('当前 |v| =', panelX + 7, panelY + panelH / 2);

    c.font = 'bold 11.5px ui-monospace, Menlo, monospace';
    c.fillStyle = '#43a047';
    c.textAlign = 'right';
    c.fillText(vNorm.toFixed(3) + '·√(gR)', panelX + panelW - 7, panelY + panelH / 2);
    c.restore();

    if (special) {
      const sW = 168, sH = 40;
      const sX = b.x1 + 6, sY = b.y1 + 6;

      c.save();
      c.fillStyle = 'rgba(227,240,255,0.92)';
      c.strokeStyle = '#b8dcfb';
      c.lineWidth = 1;
      const rr2 = 6;
      c.beginPath();
      c.moveTo(sX + rr2, sY);
      c.lineTo(sX + sW - rr2, sY);
      c.quadraticCurveTo(sX + sW, sY, sX + sW, sY + rr2);
      c.lineTo(sX + sW, sY + sH - rr2);
      c.quadraticCurveTo(sX + sW, sY + sH, sX + sW - rr2, sY + sH);
      c.lineTo(sX + rr2, sY + sH);
      c.quadraticCurveTo(sX, sY + sH, sX, sY + sH - rr2);
      c.lineTo(sX, sY + rr2);
      c.quadraticCurveTo(sX, sY, sX + rr2, sY);
      c.closePath();
      c.fill(); c.stroke();

      c.font = 'bold 10.5px system-ui, sans-serif';
      c.fillStyle = '#1e88e5';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(special.name, sX + 8, sY + 12);

      c.font = 'bold 12px ui-monospace, Menlo, monospace';
      c.fillStyle = '#0d47a1';
      c.fillText(special.formula, sX + 8, sY + 28);
      c.restore();
    }
  }
});


/* ==========================================================================
 * 27. 开普勒第二定律
 * ========================================================================== */
(function () {
  var PB2 = window.TangBoBoard;
  if (!PB2) return;

  var shape2 = function (d) {
    if (!d || !d.key) return;
    if (typeof PB2.register === 'function') PB2.register(d);
    else PB2.shapes[d.key] = d;
  };

  function withAlpha(color, a) {
    var h = String(color || '#1a1a1a').replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return 'rgba(0,0,0,' + a + ')';
    return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + a + ')';
  }

  if (!PB2.paramDefs) PB2.paramDefs = {};
  if (!PB2.paramDefs.kepE)
    PB2.paramDefs.kepE = { label: '偏心率', min: 0, max: 0.75, step: 0.01, def: 0.55 };
  if (!PB2.paramDefs.kepSeg)
    PB2.paramDefs.kepSeg = { label: '分段数', min: 6, max: 24, step: 2, def: 12 };
  if (!PB2.paramDefs.kepPeriod)
    PB2.paramDefs.kepPeriod = { label: '周期', min: 1, max: 10, step: 0.5, def: 4, unit: 's' };

  shape2({
    key: 'anim_kepler2',
    cat: 'anim',
    geom: 'rect',
    label: '开普勒第二定律',
    icon: '<ellipse cx="12" cy="12" rx="9" ry="6" fill="none" stroke="currentColor"/>' +
          '<circle cx="18.5" cy="12" r="1.5" fill="currentColor"/>',
    animatable: true,
    params: ['kepE', 'kepSeg', 'kepPeriod'],

    draw: function (c, o, GH) {
      var AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
      var b = GH.box(o);
      if (b.w < 80 || b.h < 80) return;

      var e = Math.max(0, Math.min(0.75, o.kepE != null ? o.kepE : 0.55));
      var N = Math.max(6, Math.round(o.kepSeg || 12));
      var T = Math.max(0.5, o.kepPeriod || 4);

      var tLocal = AN.t % T;
      if (!isFinite(tLocal) || tLocal < 0) tLocal = 0;

      var a = 1;
      var bSemi = Math.sqrt(1 - e * e);
      var cOff = e;

      var margin = 26;
      var availW = b.w - 2 * margin;
      var availH = b.h - 2 * margin - 26;
      var scale = Math.min(availW / (2 * a), availH / (2 * bSemi));
      if (scale < 25) return;

      var cx = b.x1 + b.w / 2;
      var cy = b.y1 + (b.h - 26) / 2 + 6;
      var sunX = cx + cOff * scale;
      var sunY = cy;

      function solveE(M) {
        M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        var E = M + e * Math.sin(M);
        for (var i = 0; i < 12; i++) {
          var f = E - e * Math.sin(E) - M;
          var fp = 1 - e * Math.cos(E);
          var dE = f / fp;
          E -= dE;
          if (Math.abs(dE) < 1e-10) break;
        }
        return E;
      }
      function posAt(t) {
        var M = 2 * Math.PI * (t / T);
        var E = solveE(M);
        return {
          x: cx + a * Math.cos(E) * scale,
          y: cy - bSemi * Math.sin(E) * scale
        };
      }

      function fillSector(t1, t2, fillColor) {
        if (t2 - t1 < 1e-5) return;
        c.beginPath();
        c.moveTo(sunX, sunY);
        var steps = Math.max(4, Math.round(28 * (t2 - t1) / (T / N)));
        for (var i = 0; i <= steps; i++) {
          var t = t1 + (t2 - t1) * i / steps;
          var p = posAt(t);
          c.lineTo(p.x, p.y);
        }
        c.closePath();
        c.fillStyle = fillColor;
        c.fill();
      }

      function strokeEllipse() {
        c.beginPath();
        var steps = 120;
        for (var i = 0; i <= steps; i++) {
          var E = i / steps * 2 * Math.PI;
          var px = cx + a * Math.cos(E) * scale;
          var py = cy - bSemi * Math.sin(E) * scale;
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
        c.stroke();
      }

      var dt = T / N;
      var kDone = Math.floor(tLocal / dt);
      if (kDone > N) kDone = N;

      var colA = 'rgba(30, 136, 229, 0.32)';
      var colB = 'rgba(245, 124, 0, 0.32)';

      for (var k = 0; k < kDone; k++) {
        var t1 = k * dt;
        var t2 = (k + 1) * dt;
        fillSector(t1, t2, (k % 2 === 0) ? colA : colB);
      }

      if (kDone < N) {
        var t1c = kDone * dt;
        var t2c = tLocal;
        if (t2c > t1c + 1e-5) {
          fillSector(t1c, t2c, (kDone % 2 === 0) ? colA : colB);
        }
      }

      c.save();
      c.strokeStyle = withAlpha(o.color, 0.75);
      c.lineWidth = Math.max(1.4, (o.size || 4) * 0.55);
      strokeEllipse();
      c.restore();

      c.save();
      c.setLineDash([3, 4]);
      c.strokeStyle = withAlpha(o.color, 0.22);
      c.lineWidth = 1;
      for (var k = Math.max(1, kDone + 1); k <= N; k++) {
        var p = posAt(k * dt);
        c.beginPath();
        c.moveTo(sunX, sunY);
        c.lineTo(p.x, p.y);
        c.stroke();
      }
      c.restore();

      c.save();
      c.strokeStyle = withAlpha(o.color, 0.35);
      c.lineWidth = 1;
      for (var k = 1; k <= kDone; k++) {
        var p = posAt(k * dt);
        c.beginPath();
        c.moveTo(sunX, sunY);
        c.lineTo(p.x, p.y);
        c.stroke();
      }
      c.restore();

      var curP = posAt(tLocal);
      c.save();
      c.strokeStyle = 'rgba(229, 57, 53, 0.9)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(sunX, sunY);
      c.lineTo(curP.x, curP.y);
      c.stroke();
      c.restore();

      var sunR = Math.max(5, scale * 0.075);
      c.save();
      var grd = c.createRadialGradient(sunX, sunY, sunR * 0.5,
                                        sunX, sunY, sunR * 3.5);
      grd.addColorStop(0, 'rgba(255, 179, 0, 0.55)');
      grd.addColorStop(1, 'rgba(255, 179, 0, 0)');
      c.fillStyle = grd;
      c.beginPath();
      c.arc(sunX, sunY, sunR * 3.5, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      c.fillStyle = '#ffb300';
      c.fill();
      c.strokeStyle = '#e65100';
      c.lineWidth = 1.2;
      c.stroke();
      c.restore();

      var planetR = Math.max(4, scale * 0.055);
      c.save();
      c.beginPath();
      c.arc(curP.x, curP.y, planetR, 0, Math.PI * 2);
      c.fillStyle = withAlpha(o.color || '#1a1a1a', 0.85);
      c.fill();
      c.strokeStyle = withAlpha(o.color || '#1a1a1a', 0.95);
      c.lineWidth = 1.4;
      c.stroke();
      c.restore();

      c.save();
      c.font = 'bold 11px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
      c.fillStyle = withAlpha(o.color, 0.80);
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillText('开普勒第二定律：相等时间扫过相等面积', b.x1 + 8, b.y1 + 6);
      c.font = '10px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
      c.fillStyle = withAlpha(o.color, 0.50);
      c.fillText('把周期 T 等分为 ' + N + ' 段，每段内扫过的面积相等',
                 b.x1 + 8, b.y1 + 22);
      c.restore();

      c.save();
      c.font = '11px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = withAlpha(o.color, 0.60);
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      var progress = tLocal / T;
      c.fillText(
        'e = ' + e.toFixed(2) + '   N = ' + N + '   ' +
        '进度 ' + (progress * 100).toFixed(0) + '%',
        b.x1 + b.w / 2, b.y2 - 6
      );
      c.restore();
    }
  });
})();


/* ==========================================================================
 * 28. 四类卫星（含可调卫星）
 * ========================================================================== */
paramDef('satAlt',   { label: '可调轨道半径', min: 1.2, max: 8, step: 0.1, def: 3.5, unit: 'Rₑ' });
paramDef('satSpeed', { label: '动画倍速',     min: 0.25, max: 5, step: 0.25, def: 1, unit: '×' });

reg({
  key: 'anim_satellites',
  cat: 'anim',
  geom: 'box',
  label: '四类卫星',
  icon: '<circle cx="12" cy="12" r="3.5" fill="currentColor"/>' +
        '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" ' +
        'stroke-width="0.9" stroke-dasharray="2 2"/>' +
        '<circle cx="12" cy="4" r="1.4" fill="currentColor"/>' +
        '<circle cx="20" cy="12" r="1.4" fill="currentColor"/>',
  animatable: true,
  params: ['satAlt', 'satSpeed'],

  draw(c, o, U2) {
    const AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
    const b  = U2.bbox(o);
    if (b.w < 100 || b.h < 100) return;

    const speed = Math.max(0.1, o.satSpeed ?? 1);

    const cx = (b.x1 + b.x2) / 2;
    const cy = (b.y1 + b.y2) / 2;
    const margin = Math.max(18, Math.min(b.w, b.h) * 0.05);
    const maxR = Math.min(b.w, b.h) / 2 - margin;

    const Rg_factor = 6.617;
    const Rearth = maxR / Rg_factor;

    const rGround = 1.00;
    const rLEO    = 1.05;
    const rGEO    = Rg_factor;
    const rUser   = Math.max(1.2, Math.min(8, o.satAlt ?? 3.5));

    const T_EARTH = 60;
    const omegaE  = 2 * Math.PI / T_EARTH;
    const omegaAt = r => omegaE * Math.pow(rGEO / r, 1.5);

    const omegaGround = omegaE;
    const omegaLEO    = omegaAt(rLEO);
    const omegaGEO    = omegaAt(rGEO);
    const omegaUser   = omegaAt(rUser);

    const tScaled = AN.t * speed;

    const thetaGround = omegaGround * tScaled;
    const thetaLEO    = omegaLEO    * tScaled;
    const thetaGEO    = omegaGEO    * tScaled;
    const thetaUser   = omegaUser   * tScaled;

    const posAt = (r, th) => ({
      x: cx + r * Math.cos(th),
      y: cy - r * Math.sin(th)
    });

    const pGround = posAt(Rearth * rGround, thetaGround);
    const pLEO    = posAt(Rearth * rLEO,    thetaLEO);
    const pGEO    = posAt(Rearth * rGEO,    thetaGEO);
    const pUser   = posAt(Rearth * rUser,   thetaUser);

    if (!window.__satStates) window.__satStates = new WeakMap();
    let S = window.__satStates.get(o);
    const sig = Rearth.toFixed(2) + '|' + rUser.toFixed(2);
    if (!S || S.sig !== sig) {
      S = { sig, lastT: AN.t,
            trails: { ground: [], leo: [], geo: [], user: [] } };
      window.__satStates.set(o, S);
    }
    if (AN.t < S.lastT - 0.1) {
      S.trails = { ground: [], leo: [], geo: [], user: [] };
    }
    S.lastT = AN.t;

    const MAX_TRAIL = Math.max(20, Math.round(72 / speed));
    if (AN.playing) {
      const push = (key, p) => {
        const arr = S.trails[key];
        arr.push({ x: p.x, y: p.y });
        if (arr.length > MAX_TRAIL) arr.shift();
      };
      push('ground', pGround);
      push('leo',    pLEO);
      push('geo',    pGEO);
      push('user',   pUser);
    }

    const drawOrbit = (r, color) => {
      c.save();
      c.setLineDash([4, 5]);
      c.strokeStyle = color;
      c.lineWidth = 1;
      c.beginPath();
      c.arc(cx, cy, Rearth * r, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    };
    drawOrbit(rLEO,  'rgba(27, 36, 51, 0.30)');
    drawOrbit(rUser, 'rgba(27, 36, 51, 0.40)');
    drawOrbit(rGEO,  'rgba(27, 36, 51, 0.52)');

    const drawTrail = (key, rgbaPrefix) => {
      const arr = S.trails[key];
      if (arr.length < 2) return;
      c.save();
      c.lineCap  = 'round';
      c.lineJoin = 'round';
      c.lineWidth = 2.2;
      const n = arr.length;
      for (let i = 1; i < n; i++) {
        const a = i / n;
        const alpha = Math.max(0, (a - 0.15) / 0.85);
        c.strokeStyle = rgbaPrefix + (alpha * 0.85).toFixed(3) + ')';
        c.beginPath();
        c.moveTo(arr[i - 1].x, arr[i - 1].y);
        c.lineTo(arr[i].x,     arr[i].y);
        c.stroke();
      }
      c.restore();
    };
    drawTrail('user',   'rgba(224, 64, 251, ');
    drawTrail('geo',    'rgba(255, 152, 0, ');
    drawTrail('leo',    'rgba(0, 229, 255, ');
    drawTrail('ground', 'rgba(255, 213, 79, ');

    const earthGrad = c.createRadialGradient(
      cx - Rearth * 0.3, cy - Rearth * 0.3, Rearth * 0.1,
      cx, cy, Rearth
    );
    earthGrad.addColorStop(0,   '#4fc3f7');
    earthGrad.addColorStop(0.55, '#1e88e5');
    earthGrad.addColorStop(1,   '#0d47a1');

    c.save();
    c.beginPath();
    c.arc(cx, cy, Rearth, 0, Math.PI * 2);
    c.fillStyle = earthGrad;
    c.fill();
    c.strokeStyle = 'rgba(13, 71, 161, 0.9)';
    c.lineWidth = 1.2;
    c.stroke();
    c.restore();

    c.save();
    c.beginPath();
    c.arc(cx, cy, Rearth, 0, Math.PI * 2);
    c.clip();
    const earthRot = omegaE * tScaled;
    c.strokeStyle = 'rgba(255, 255, 255, 0.20)';
    c.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const ang = earthRot + i * Math.PI / 3;
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(ang) * Rearth,
               cy - Math.sin(ang) * Rearth);
      c.stroke();
    }
    c.fillStyle = 'rgba(76, 175, 80, 0.32)';
    for (let i = 0; i < 5; i++) {
      const ang = earthRot + i * (2 * Math.PI / 5) + 0.4;
      const rr  = Rearth * (0.30 + 0.28 * ((i * 7) % 5) / 5);
      c.beginPath();
      c.arc(cx + Math.cos(ang) * rr,
            cy - Math.sin(ang) * rr,
            Rearth * 0.13, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();

    c.save();
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.beginPath();
    c.arc(cx, cy, 1.6, 0, Math.PI * 2);
    c.fill();
    c.restore();

    const drawSat = (p, r, color) => {
      c.save();
      const grd = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
      grd.addColorStop(0, color.replace('rgb(', 'rgba(').replace(')', ', 0.55)'));
      grd.addColorStop(1, color.replace('rgb(', 'rgba(').replace(')', ', 0)'));
      c.fillStyle = grd;
      c.beginPath();
      c.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
      c.fill();
      c.restore();

      c.save();
      c.beginPath();
      c.arc(p.x, p.y, r, 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.2;
      c.stroke();
      c.restore();
    };
    drawSat(pGround, Math.max(5.0, Rearth * 0.11), 'rgb(255, 213, 79)');
    drawSat(pLEO,    Math.max(5.5, Rearth * 0.12), 'rgb(0, 229, 255)');
    drawSat(pGEO,    Math.max(6.0, Rearth * 0.13), 'rgb(255, 152, 0)');
    drawSat(pUser,   Math.max(6.5, Rearth * 0.14), 'rgb(224, 64, 251)');

    const T_user_anim = 60 * Math.pow(rUser / rGEO, 1.5);
    const T_user_min  = T_user_anim * 24;
    let periodStr;
    if (T_user_min < 120) {
      periodStr = 'T ≈ ' + T_user_min.toFixed(0) + ' min';
    } else {
      periodStr = 'T ≈ ' + (T_user_min / 60).toFixed(1) + ' h';
    }

    const legendItems = [
      { color: 'rgb(255, 213, 79)', text: '赤道未发射（随地球自转）' },
      { color: 'rgb(0, 229, 255)',  text: '近地卫星  T ≈ 90 min' },
      { color: 'rgb(224, 64, 251)', text: '可调卫星  r = ' + rUser.toFixed(2) +
                                          ' Rₑ  ' + periodStr },
      { color: 'rgb(255, 152, 0)',  text: '同步卫星  T = 24 h' }
    ];

    c.save();
    c.font = '11px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';

    const legendPadX = 8;
    const legendPadY = 6;
    const lineH = 16;
    let maxTextW = 0;
    for (const it of legendItems) {
      const w = c.measureText(it.text).width;
      if (w > maxTextW) maxTextW = w;
    }
    const legendW = legendPadX * 2 + 12 + maxTextW + 4;
    const legendH = legendPadY * 2 + lineH * legendItems.length;
    const legendX = b.x1 + 8;
    const legendY = b.y1 + 8;

    const rr = 6;
    c.beginPath();
    c.moveTo(legendX + rr, legendY);
    c.lineTo(legendX + legendW - rr, legendY);
    c.quadraticCurveTo(legendX + legendW, legendY,
                       legendX + legendW, legendY + rr);
    c.lineTo(legendX + legendW, legendY + legendH - rr);
    c.quadraticCurveTo(legendX + legendW, legendY + legendH,
                       legendX + legendW - rr, legendY + legendH);
    c.lineTo(legendX + rr, legendY + legendH);
    c.quadraticCurveTo(legendX, legendY + legendH,
                       legendX, legendY + legendH - rr);
    c.lineTo(legendX, legendY + rr);
    c.quadraticCurveTo(legendX, legendY,
                       legendX + rr, legendY);
    c.closePath();
    c.fillStyle = 'rgba(255, 255, 255, 0.82)';
    c.fill();
    c.strokeStyle = 'rgba(0, 0, 0, 0.06)';
    c.lineWidth = 1;
    c.stroke();

    let ly = legendY + legendPadY + lineH / 2;
    for (const it of legendItems) {
      c.beginPath();
      c.arc(legendX + legendPadX + 5, ly, 4, 0, Math.PI * 2);
      c.fillStyle = it.color;
      c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 1;
      c.stroke();

      c.fillStyle = 'rgba(0, 0, 0, 0.72)';
      c.fillText(it.text, legendX + legendPadX + 15, ly);
      ly += lineH;
    }
    c.restore();
  }
});


/* ==========================================================================
 * 29. 合力与分力（可拖拽）
 * ========================================================================== */
(function () {
  var PB2 = window.TangBoBoard;
  if (!PB2) return;

  var shape2 = function (d) {
    if (!d || !d.key) return;
    if (typeof PB2.register === 'function') PB2.register(d);
    else PB2.shapes[d.key] = d;
  };

  function withAlpha(color, a) {
    var h = String(color || '#1a1a1a').replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return 'rgba(0,0,0,' + a + ')';
    return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + a + ')';
  }

  function drawArrow(c, x1, y1, x2, y2, color, width, headSize) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.hypot(dx, dy);
    if (len < 1) return;
    var ux = dx / len, uy = dy / len;
    var hL = Math.min(headSize, len * 0.55);
    var hW = hL * 0.55;
    c.save();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2 - ux * hL * 0.85, y2 - uy * hL * 0.85);
    c.stroke();
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - ux * hL - uy * hW, y2 - uy * hL + ux * hW);
    c.lineTo(x2 - ux * hL + uy * hW, y2 - uy * hL - ux * hW);
    c.closePath();
    c.fill();
    c.restore();
  }

  if (!PB2.paramDefs) PB2.paramDefs = {};
  if (!PB2.paramDefs.fcF1)
    PB2.paramDefs.fcF1 = { label: 'F₁ 大小', min: 0.2, max: 2, step: 0.05, def: 1 };
  if (!PB2.paramDefs.fcA1)
    PB2.paramDefs.fcA1 = { label: 'F₁ 角度', min: -180, max: 180, step: 1, def: 45, unit: '°' };
  if (!PB2.paramDefs.fcF2)
    PB2.paramDefs.fcF2 = { label: 'F₂ 大小', min: 0.2, max: 2, step: 0.05, def: 1 };
  if (!PB2.paramDefs.fcA2)
    PB2.paramDefs.fcA2 = { label: 'F₂ 角度', min: -180, max: 180, step: 1, def: -30, unit: '°' };
  if (!PB2.paramDefs.fcM1)
    PB2.paramDefs.fcM1 = { label: 'F₁ 拖拽模式', min: 0, max: 2, step: 1, def: 0 };
  if (!PB2.paramDefs.fcM2)
    PB2.paramDefs.fcM2 = { label: 'F₂ 拖拽模式', min: 0, max: 2, step: 1, def: 0 };

  var fcInstances = [];

  function registerInstance(o) {
    var i = fcInstances.indexOf(o);
    if (i < 0) {
      fcInstances.push(o);
      if (fcInstances.length > 30) fcInstances.shift();
    } else if (i !== fcInstances.length - 1) {
      fcInstances.splice(i, 1);
      fcInstances.push(o);
    }
  }

  var dragging = null;

  function getStageCoords(e) {
    var stage = document.getElementById('stage');
    if (!stage) {
      return { x: e.clientX, y: e.clientY };
    }
    var r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /* 拖拽时优先使用轻量重绘接口；无则退回 resize 事件（兼容旧版 HTML） */
  function triggerRedraw() {
    if (typeof window.__pbRedraw === 'function') {
      window.__pbRedraw();
    } else {
      window.dispatchEvent(new Event('resize'));
    }
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    if (!fcInstances.length) return;
    var p = getStageCoords(e);

    for (var i = fcInstances.length - 1; i >= 0; i--) {
      var o = fcInstances[i];
      if (!o._fcHandles) continue;
      var h = o._fcHandles;
      var r = 24;
      if (Math.hypot(p.x - h.P1.x, p.y - h.P1.y) < r) {
        dragging = { obj: o, which: 1 };
        e.stopPropagation(); e.preventDefault(); return;
      }
      if (Math.hypot(p.x - h.P2.x, p.y - h.P2.y) < r) {
        dragging = { obj: o, which: 2 };
        e.stopPropagation(); e.preventDefault(); return;
      }
    }
  }

  function onPointerMove(e) {
    if (!dragging) return;
    var p = getStageCoords(e);

    var o = dragging.obj;
    var h = o._fcHandles;
    if (!h) { dragging = null; return; }
    var scale = o._fcScale || 100;

    var dx = p.x - h.O.x;
    var dy = h.O.y - p.y;

    var mode = dragging.which === 1 ? (o.fcM1 || 0) : (o.fcM2 || 0);
    var fkey = dragging.which === 1 ? 'fcF1' : 'fcF2';
    var akey = dragging.which === 1 ? 'fcA1' : 'fcA2';
    var curAngle = (o[akey] || 0) * Math.PI / 180;

    var newF, newA;

    if (mode === 1) {
      newF = o[fkey];
      newA = Math.atan2(dy, dx);
    } else if (mode === 2) {
      var cosA = Math.cos(curAngle), sinA = Math.sin(curAngle);
      var proj = dx * cosA + dy * sinA;
      newF = Math.max(0.2, Math.min(2, proj / scale));
      newA = curAngle;
    } else {
      newF = Math.hypot(dx, dy) / scale;
      newF = Math.max(0.2, Math.min(2, newF));
      newA = Math.atan2(dy, dx);
    }

    o[fkey] = Math.round(newF * 100) / 100;
    o[akey] = Math.round(newA * 180 / Math.PI);

    triggerRedraw();

    e.stopPropagation(); e.preventDefault();
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = null;
    e.stopPropagation(); e.preventDefault();
  }


  shape2({
    key: 'anim_force_compose',
    cat: 'anim',
    geom: 'box',
    label: '合力与分力',
    icon: '<path d="M3 19 L11 5 M11 5 L21 13" stroke="currentColor" stroke-width="1.6" ' +
          'fill="none" stroke-linecap="round"/>' +
          '<path d="M3 19 L21 13" stroke="currentColor" stroke-width="1.6" ' +
          'fill="none" stroke-dasharray="2 2"/>',
    animatable: true,
    params: ['fcF1', 'fcA1', 'fcF2', 'fcA2', 'fcM1', 'fcM2'],

    draw: function (c, o, GH) {
      var b = GH.box(o);
      if (b.w < 60 || b.h < 60) return;

      if (o.fcF1 == null) o.fcF1 = 1;
      if (o.fcA1 == null) o.fcA1 = 45;
      if (o.fcF2 == null) o.fcF2 = 1;
      if (o.fcA2 == null) o.fcA2 = -30;
      if (o.fcM1 == null) o.fcM1 = 0;
      if (o.fcM2 == null) o.fcM2 = 0;

      var scale = Math.min(b.w, b.h) * 0.32;
      o._fcScale = scale;

      var O = {
        x: b.x1 + b.w * 0.28,
        y: b.y1 + b.h * 0.72
      };

      var a1 = o.fcA1 * Math.PI / 180;
      var a2 = o.fcA2 * Math.PI / 180;

      var P1 = {
        x: O.x + o.fcF1 * scale * Math.cos(a1),
        y: O.y - o.fcF1 * scale * Math.sin(a1)
      };
      var P2 = {
        x: O.x + o.fcF2 * scale * Math.cos(a2),
        y: O.y - o.fcF2 * scale * Math.sin(a2)
      };
      var PR = {
        x: P1.x + P2.x - O.x,
        y: P1.y + P2.y - O.y
      };

      o._fcHandles = { O: O, P1: P1, P2: P2, PR: PR };
      registerInstance(o);

      var colF1 = '#1e88e5';
      var colF2 = '#e53935';
      var colR  = '#43a047';

      c.save();
      c.setLineDash([5, 4]);
      c.strokeStyle = withAlpha(o.color || '#1a1a1a', 0.35);
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(P1.x, P1.y); c.lineTo(PR.x, PR.y);
      c.moveTo(P2.x, P2.y); c.lineTo(PR.x, PR.y);
      c.stroke();
      c.restore();

      drawArrow(c, O.x, O.y, P1.x, P1.y, colF1, 3, 12);
      drawArrow(c, O.x, O.y, P2.x, P2.y, colF2, 3, 12);
      drawArrow(c, O.x, O.y, PR.x, PR.y, colR, 3.5, 14);

      c.save();
      c.beginPath();
      c.arc(O.x, O.y, 4, 0, Math.PI * 2);
      c.fillStyle = withAlpha(o.color || '#1a1a1a', 0.85);
      c.fill();
      c.restore();

      function drawHandle(p, color) {
        c.save();
        c.beginPath();
        c.arc(p.x, p.y, 9, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255, 255, 255, 0.9)';
        c.fill();
        c.strokeStyle = color;
        c.lineWidth = 2;
        c.stroke();
        c.beginPath();
        c.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        c.fillStyle = color;
        c.fill();
        c.restore();
      }
      drawHandle(P1, colF1);
      drawHandle(P2, colF2);

      c.save();
      c.textAlign = 'left';
      c.textBaseline = 'middle';

      c.font = 'italic bold 13px "Cambria Math", "Times New Roman", serif';
      c.fillStyle = colF1;
      c.fillText('F₁ = ' + o.fcF1.toFixed(2), P1.x + 14, P1.y - 8);
      c.font = 'italic 11px "Cambria Math", "Times New Roman", serif';
      c.fillStyle = '#8fa3bd';
      c.fillText('θ₁ = ' + Math.round(o.fcA1) + '°', P1.x + 14, P1.y + 6);

      c.font = 'italic bold 13px "Cambria Math", "Times New Roman", serif';
      c.fillStyle = colF2;
      c.fillText('F₂ = ' + o.fcF2.toFixed(2), P2.x + 14, P2.y - 8);
      c.font = 'italic 11px "Cambria Math", "Times New Roman", serif';
      c.fillStyle = '#8fa3bd';
      c.fillText('θ₂ = ' + Math.round(o.fcA2) + '°', P2.x + 14, P2.y + 6);

      var Fx = o.fcF1 * Math.cos(a1) + o.fcF2 * Math.cos(a2);
      var Fy = o.fcF1 * Math.sin(a1) + o.fcF2 * Math.sin(a2);
      var Fmag = Math.hypot(Fx, Fy);
      var Fang = Math.atan2(Fy, Fx) * 180 / Math.PI;
      c.font = 'italic bold 13px "Cambria Math", "Times New Roman", serif';
      c.fillStyle = colR;
      c.fillText('F = ' + Fmag.toFixed(2), PR.x + 14, PR.y - 8);
      c.font = 'italic 11px "Cambria Math", "Times New Roman", serif';
      c.fillStyle = '#8fa3bd';
      c.fillText('θ = ' + Fang.toFixed(1) + '°', PR.x + 14, PR.y + 6);
      c.restore();

      var modeName = function (m) {
        if (m === 1) return '固定大小';
        if (m === 2) return '固定方向';
        return '自由';
      };

      c.save();
      c.font = '11px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
      c.textAlign = 'right';
      c.textBaseline = 'top';

      var lx = b.x2 - 8;
      var ly = b.y1 + 8;
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillText('拖拽模式', lx, ly);
      c.fillStyle = colF1;
      c.fillText('F₁：' + modeName(o.fcM1), lx, ly + 16);
      c.fillStyle = colF2;
      c.fillText('F₂：' + modeName(o.fcM2), lx, ly + 32);
      c.restore();

      c.save();
      c.font = '10px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
      c.fillStyle = 'rgba(0,0,0,0.38)';
      c.textAlign = 'left';
      c.textBaseline = 'bottom';
      c.fillText('拖动箭头端点改变分力 → 观察合力随之改变',
                 b.x1 + 8, b.y2 - 6);
      c.restore();
    }
  });
})();


/* ==========================================================================
 * 30. 斜面弹簧振子
 * ========================================================================== */
(function () {
  var PB2 = window.TangBoBoard;
  if (!PB2) return;

  var shape2 = function (d) {
    if (!d || !d.key) return;
    if (typeof PB2.register === 'function') PB2.register(d);
    else PB2.shapes[d.key] = d;
  };

  function withAlpha(color, a) {
    var h = String(color || '#1a1a1a').replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return 'rgba(0,0,0,' + a + ')';
    return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + a + ')';
  }

  if (!PB2.paramDefs) PB2.paramDefs = {};
  if (!PB2.paramDefs.spAngle)
    PB2.paramDefs.spAngle  = { label: '倾角',     min: 0,   max: 90, step: 1,    def: 30,  unit: '°' };
  if (!PB2.paramDefs.spPeriod)
    PB2.paramDefs.spPeriod = { label: '周期',     min: 0.3, max: 3,  step: 0.1,  def: 1.2, unit: 's' };
  if (!PB2.paramDefs.spAmp)
    PB2.paramDefs.spAmp    = { label: '振幅',     min: 0.05, max: 0.4, step: 0.01, def: 0.15 };
  if (!PB2.paramDefs.spBoard)
    PB2.paramDefs.spBoard  = { label: '挡板0底1顶', min: 0, max: 1, step: 1,     def: 0 };
  if (!PB2.paramDefs.spBlock)
    PB2.paramDefs.spBlock  = { label: '物块大小', min: 10,  max: 40, step: 1,    def: 22 };

  shape2({
    key: 'anim_slope_spring',
    cat: 'anim',
    geom: 'box',
    label: '斜面弹簧振子',
    icon:
      '<path d="M4 20 L20 20 L20 8 Z" fill="none" stroke="currentColor" ' +
      'stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M4 20 L1 16" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M2.5 18 L4.28 17.79 L4.74 15.57 L6.96 16.03 L7.42 13.81 L9.2 13.6" ' +
      'fill="none" stroke="currentColor" stroke-width="0.9" ' +
      'stroke-linecap="round" stroke-linejoin="round"/>' +
      '<rect x="-2" y="-2" width="4" height="4" fill="currentColor" ' +
      'transform="translate(10.8,12.4) rotate(-36.87)"/>',
    animatable: true,
    params: ['spAngle', 'spPeriod', 'spAmp', 'spBoard', 'spBlock'],

    draw: function (c, o, GH) {
      var AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
      var b  = GH.box(o);
      if (b.w < 80 || b.h < 80) return;

      var angleDeg = Math.max(0, Math.min(90, o.spAngle != null ? o.spAngle : 30));
      var angleShow = Math.max(0.01, Math.min(89.99, angleDeg)) * Math.PI / 180;
      var T          = Math.max(0.2, o.spPeriod != null ? o.spPeriod : 1.2);
      var ampR       = Math.max(0.03, Math.min(0.4, o.spAmp != null ? o.spAmp : 0.15));
      var boardAtTop = (o.spBoard || 0) > 0.5;
      var blockSize  = Math.max(10, Math.min(40, o.spBlock != null ? o.spBlock : 22));
      var cosA = Math.cos(angleShow);
      var sinA = Math.sin(angleShow);

      var padX  = Math.min(24, b.w * 0.06);
      var padY  = Math.min(20, b.h * 0.05);
      var infoH = 32;

      var maxW = b.w - 2 * padX;
      var maxH = b.h - 2 * padY - infoH;

      var cosSafe = Math.max(0.001, Math.abs(Math.cos(angleShow)));
      var sinSafe = Math.max(0.001, Math.abs(Math.sin(angleShow)));
      var L_byW = maxW / cosSafe;
      var L_byH = maxH / sinSafe;
      var L = Math.min(L_byW, L_byH);
      blockSize = Math.max(14, Math.min(46, Math.max(blockSize, L * 0.075)));

      var Ax = b.x1 + padX;
      var Ay = b.y2 - padY - infoH;
      var Bx = Ax + L * Math.cos(angleShow);
      var By = Ay;
      var Cx = Bx;
      var Cy = By - L * Math.sin(angleShow);

      var ux =  Math.cos(angleShow);
      var uy = -Math.sin(angleShow);
      var nx = -Math.sin(angleShow);
      var ny = -Math.cos(angleShow);

      var posAtS = function (s) {
        return { x: Ax + s * ux, y: Ay + s * uy };
      };

      var sBoard = boardAtTop ? L : 0;
      var pBoard = posAtS(sBoard);

      var sEq = L / 2;
      var maxAmpPx = Math.max(15, L / 2 - blockSize * 1.4 - 18);
      var A_px = Math.min(ampR * L, maxAmpPx);

      var omega = 2 * Math.PI / T;
      var phase = omega * AN.t;
      var sign  = boardAtTop ? -1 : 1;
      var sBlock = sEq + sign * A_px * Math.cos(phase);
      var pBlock = posAtS(sBlock);

      var bw = blockSize * 1.15;
      var bh = blockSize;
      var boardLen   = Math.max(blockSize * 1.15, 20);
      var boardThick = Math.max(3.5, (o.size || 4) * 0.9);

      var bcx = pBlock.x + nx * (blockSize / 2);
      var bcy = pBlock.y + ny * (blockSize / 2);

      var pBoardCenter = {
        x: pBoard.x + nx * (boardLen / 2),
        y: pBoard.y + ny * (boardLen / 2)
      };

      var pBlockEdge;
      if (boardAtTop) {
        pBlockEdge = {
          x: bcx + (bw / 2) * ux,
          y: bcy + (bw / 2) * uy
        };
      } else {
        pBlockEdge = {
          x: bcx - (bw / 2) * ux,
          y: bcy - (bw / 2) * uy
        };
      }

      var pEq = posAtS(sEq);
      var eqOut = {
        x: pEq.x + nx * (blockSize * 1.6),
        y: pEq.y + ny * (blockSize * 1.6)
      };

      var strokeCol = (o.hasBorder === false) ? 'rgba(0,0,0,0)' : (o.color || '#1a1a1a');
      var fa        = (o.fillAlpha != null ? o.fillAlpha : 0.6);
      var hasFill   = (o.fill !== false && !!o.fillColor);

      var slopeFill = hasFill
                      ? withAlpha(o.fillColor, Math.max(0.04, fa * 0.30))
                      : 'rgba(0,0,0,0)';

      var blockFill   = hasFill
                        ? withAlpha(o.fillColor, Math.min(1, fa * 0.85 + 0.15))
                        : (strokeCol === 'rgba(0,0,0,0)' ? '#1a1a1a' : strokeCol);
      var blockStroke = strokeCol;

      c.save();
      c.lineWidth = Math.max(1.2, (o.size || 4) * 0.6);
      c.strokeStyle = strokeCol;
      c.fillStyle   = slopeFill;
      c.beginPath();
      c.moveTo(Ax, Ay);
      c.lineTo(Bx, By);
      c.lineTo(Cx, Cy);
      c.closePath();
      if (hasFill) c.fill();
      c.stroke();
      c.restore();

      if (Bx - Ax > 20) {
        c.save();
        c.strokeStyle = withAlpha(o.color || '#1a1a1a', 0.32);
        c.lineWidth = Math.max(0.8, (o.size || 4) * 0.4);
        for (var gx = Ax - 4; gx < Bx + 10; gx += 12) {
          c.beginPath();
          c.moveTo(gx, Ay + 1);
          c.lineTo(gx + 4, Ay + 5);
          c.stroke();
        }
        c.restore();
      }

      if (angleDeg > 1) {
        var arcR = Math.min(42, L * 0.22);
        c.save();
        c.strokeStyle = withAlpha(o.color || '#1a1a1a', 0.55);
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(Ax, Ay, arcR, -angleShow, 0, false);
        c.stroke();

        c.fillStyle = withAlpha(o.color || '#1a1a1a', 0.75);
        c.font = 'bold 12px system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        var labelAng = -angleShow / 2;
        c.fillText('θ=' + Math.round(angleDeg) + '°',
                   Ax + Math.cos(labelAng) * (arcR + 22),
                   Ay + Math.sin(labelAng) * (arcR + 22));
        c.restore();
      }

      c.save();
      c.setLineDash([4, 4]);
      c.strokeStyle = withAlpha(o.color || '#1a1a1a', 0.35);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(pEq.x, pEq.y);
      c.lineTo(eqOut.x, eqOut.y);
      c.stroke();
      c.restore();

      c.save();
      c.strokeStyle = withAlpha(o.color || '#1a1a1a', 0.55);
      c.lineWidth = 1.4;
      var eqMark = blockSize * 0.35;
      c.beginPath();
      c.moveTo(eqOut.x - eqMark, eqOut.y);
      c.lineTo(eqOut.x + eqMark, eqOut.y);
      c.moveTo(eqOut.x, eqOut.y - eqMark);
      c.lineTo(eqOut.x, eqOut.y + eqMark);
      c.stroke();
      c.restore();

      var pA1 = posAtS(sEq - A_px);
      var pA2 = posAtS(sEq + A_px);
      c.save();
      c.setLineDash([2, 4]);
      c.strokeStyle = withAlpha(o.color || '#1a1a1a', 0.2);
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(pA1.x, pA1.y);
      c.lineTo(pA1.x + nx * (blockSize * 1.3), pA1.y + ny * (blockSize * 1.3));
      c.moveTo(pA2.x, pA2.y);
      c.lineTo(pA2.x + nx * (blockSize * 1.3), pA2.y + ny * (blockSize * 1.3));
      c.stroke();
      c.restore();

      var springStart = pBoardCenter;
      var springEnd   = pBlockEdge;
      var sdx = springEnd.x - springStart.x;
      var sdy = springEnd.y - springStart.y;
      var sLen = Math.hypot(sdx, sdy);

      if (sLen > 10) {
        var coils = 10;
        var total = coils * 2;
        var coilAmp = blockSize * 0.45;

        var sudx = sdx / sLen;
        var sudy = sdy / sLen;
        var spdx = -sudy;
        var spdy =  sudx;

        c.save();
        c.lineWidth = Math.max(1.2, (o.size || 4) * 0.55);
        c.strokeStyle = withAlpha(o.color || '#1a1a1a', 0.9);
        c.lineCap  = 'round';
        c.lineJoin = 'round';
        c.beginPath();
        c.moveTo(springStart.x, springStart.y);
        for (var i = 1; i < total; i++) {
          var tt = i / total;
          var sx = springStart.x + sdx * tt;
          var sy = springStart.y + sdy * tt;
          var sg = (i % 2 === 0) ? -1 : 1;
          c.lineTo(sx + spdx * coilAmp * sg, sy + spdy * coilAmp * sg);
        }
        c.lineTo(springEnd.x, springEnd.y);
        c.stroke();
        c.restore();
      }

      c.save();
      c.strokeStyle = withAlpha(o.color || '#1a1a1a', 0.95);
      c.lineWidth = boardThick;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(pBoard.x + nx * 2, pBoard.y + ny * 2);
      c.lineTo(pBoard.x + nx * boardLen, pBoard.y + ny * boardLen);
      c.stroke();

      var outerX = pBoard.x + nx * boardLen;
      var outerY = pBoard.y + ny * boardLen;
      c.lineWidth = Math.max(1.4, boardThick * 0.45);
      c.strokeStyle = withAlpha(o.color || '#1a1a1a', 0.55);
      c.beginPath();
      c.moveTo(outerX + ux * boardThick * 2.2, outerY + uy * boardThick * 2.2);
      c.lineTo(outerX - ux * boardThick * 2.2, outerY - uy * boardThick * 2.2);
      c.stroke();
      c.restore();

      c.save();
      c.translate(bcx, bcy);
      c.rotate(-angleShow);

      c.fillStyle   = blockFill;
      c.strokeStyle = blockStroke;
      c.lineWidth = Math.max(1.4, (o.size || 4) * 0.7);

      c.beginPath();
      c.rect(-bw / 2, -bh / 2, bw, bh);
      c.fill();
      c.stroke();

      if (blockSize >= 16) {
        c.fillStyle = hasFill
                      ? withAlpha(o.color || '#1a1a1a', 0.9)
                      : '#ffffff';
        c.font = 'bold ' + Math.min(bw, bh) * 0.55 + 'px system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('m', 0, 0);
      }
      c.restore();

      var v = -sign * A_px * omega * Math.sin(phase);
      if (Math.abs(v) > 4) {
        var vdir = Math.sign(v);
        var vlen = Math.min(52, Math.abs(v) * 0.18);

        var arrowStart = {
          x: bcx + nx * (blockSize * 0.62),
          y: bcy + ny * (blockSize * 0.62)
        };
        var arrowEnd = {
          x: arrowStart.x + ux * vlen * vdir,
          y: arrowStart.y + uy * vlen * vdir
        };

        c.save();
        c.strokeStyle = '#43a047';
        c.fillStyle   = '#43a047';
        c.lineWidth = 2.2;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(arrowStart.x, arrowStart.y);
        c.lineTo(arrowEnd.x, arrowEnd.y);
        c.stroke();

        var adx = arrowEnd.x - arrowStart.x;
        var ady = arrowEnd.y - arrowStart.y;
        var alen = Math.hypot(adx, ady);
        if (alen > 1) {
          var aux = adx / alen;
          var auy = ady / alen;
          var ahL = 9;
          c.beginPath();
          c.moveTo(arrowEnd.x, arrowEnd.y);
          c.lineTo(arrowEnd.x - aux * ahL - auy * ahL * 0.5,
                   arrowEnd.y - auy * ahL + aux * ahL * 0.5);
          c.lineTo(arrowEnd.x - aux * ahL + auy * ahL * 0.5,
                   arrowEnd.y - auy * ahL - aux * ahL * 0.5);
          c.closePath();
          c.fill();
        }
        c.restore();
      }

      c.save();
      c.font = '11px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = withAlpha(o.color || '#1a1a1a', 0.55);
      c.textAlign = 'left';
      c.textBaseline = 'bottom';
      c.fillText(
        'θ=' + Math.round(angleDeg) + '°  ' +
        'T=' + T.toFixed(1) + 's  ' +
        'A=' + (A_px / L).toFixed(2) + 'L  ' +
        '挡板=' + (boardAtTop ? '顶端' : '底端'),
        b.x1 + 8, b.y2 - 6
      );
      c.restore();
    }
  });
})();


/* ==========================================================================
 * 31. 平抛运动分解
 * ========================================================================== */
(function () {
  var PB2 = window.TangBoBoard;
  if (!PB2) return;

  var shape2 = function (d) {
    if (!d || !d.key) return;
    if (typeof PB2.register === 'function') PB2.register(d);
    else PB2.shapes[d.key] = d;
  };

  function withAlpha(color, a) {
    var h = String(color || '#1a1a1a').replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return 'rgba(0,0,0,' + a + ')';
    return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + a + ')';
  }

  if (!PB2.paramDefs) PB2.paramDefs = {};
  if (!PB2.paramDefs.projV0)
    PB2.paramDefs.projV0 = { label: '初速度 v₀', min: 0.5, max: 2.5, step: 0.1, def: 1.5 };
  if (!PB2.paramDefs.projT)
    PB2.paramDefs.projT = { label: '下落时间', min: 0.8, max: 3, step: 0.1, def: 1.6, unit: 's' };
  if (!PB2.paramDefs.projFlash)
    PB2.paramDefs.projFlash = { label: '频闪次数', min: 4, max: 20, step: 1, def: 10 };

  shape2({
    key: 'anim_projectile_decomp',
    cat: 'anim',
    geom: 'box',
    label: '平抛运动分解',
    icon: '<path d="M2 4 Q 12 20 22 20" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
          '<circle cx="2" cy="4" r="1.2" fill="currentColor"/>' +
          '<circle cx="22" cy="20" r="1.2" fill="currentColor"/>' +
          '<circle cx="22" cy="4" r="1.2" fill="currentColor"/>',
    animatable: true,
    params: ['projV0', 'projT', 'projFlash'],

    draw: function (c, o, U2) {
      var AN = (window.TangBoBoard && window.TangBoBoard.animState) || { t: 0 };
      var b = U2.bbox(o);
      if (b.w < 100 || b.h < 100) return;

      var v0 = Math.max(0.5, Math.min(2.5, o.projV0 != null ? o.projV0 : 1.5));
      var T  = Math.max(0.5, Math.min(4, o.projT != null ? o.projT : 1.6));
      var N  = Math.max(4, Math.min(20, Math.round(o.projFlash != null ? o.projFlash : 10)));

      if (!window.__projStates) window.__projStates = new WeakMap();
      var S = window.__projStates.get(o);
      var sig = v0 + '|' + T + '|' + b.w.toFixed(0) + '|' + b.h.toFixed(0);
      if (!S || S.sig !== sig) {
        S = { sig: sig, t0: AN.t };
        window.__projStates.set(o, S);
      }
      var t = (AN.t - S.t0) % T;
      if (!isFinite(t) || t < 0) t = 0;

      var padL = 55, padR = 45, padT = 50, padB = 78;
      var W_avail = b.w - padL - padR;
      var H_avail = b.h - padT - padB;
      if (W_avail < 60 || H_avail < 60) return;

      var scale = Math.min(W_avail / Math.max(0.8, v0), H_avail);

      var W_traj = v0 * scale;
      var H_traj = scale;

      var x0 = b.x1 + padL;
      var y0 = b.y1 + padT;
      var xEnd = x0 + W_traj;
      var yEnd = y0 + H_traj;

      var v0_px = W_traj / T;
      var g_px  = 2 * H_traj / (T * T);

      var xMain = x0 + v0_px * t;
      var yMain = y0 + 0.5 * g_px * t * t;

      var xShadow = xMain;
      var yShadow = yEnd;
      var xVert   = xEnd;
      var yVert   = yMain;

      var colMain  = '#e53935';
      var colHoriz = '#1e88e5';
      var colVert  = '#43a047';

      c.save();
      c.setLineDash([5, 4]);
      c.strokeStyle = withAlpha(o.color || '#1a1a1a', 0.45);
      c.lineWidth = 1.3;
      c.beginPath();
      c.moveTo(x0 - 14, yEnd);
      c.lineTo(xEnd + 14, yEnd);
      c.moveTo(xEnd, y0 - 14);
      c.lineTo(xEnd, yEnd + 14);
      c.stroke();
      c.restore();

      c.save();
      c.setLineDash([5, 4]);
      c.strokeStyle = withAlpha(colMain, 0.22);
      c.lineWidth = 1.6;
      c.beginPath();
      var Nfull = 60;
      for (var i = 0; i <= Nfull; i++) {
        var tf = T * i / Nfull;
        var xf = x0 + v0_px * tf;
        var yf = y0 + 0.5 * g_px * tf * tf;
        if (i === 0) c.moveTo(xf, yf);
        else c.lineTo(xf, yf);
      }
      c.stroke();
      c.restore();

      c.save();
      c.strokeStyle = colMain;
      c.lineWidth = 2.4;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      var Ns = Math.max(12, Math.round(90 * t / T));
      for (var j = 0; j <= Ns; j++) {
        var ts = t * j / Ns;
        var xs = x0 + v0_px * ts;
        var ys = y0 + 0.5 * g_px * ts * ts;
        if (j === 0) c.moveTo(xs, ys);
        else c.lineTo(xs, ys);
      }
      c.stroke();
      c.restore();

      c.save();
      c.strokeStyle = withAlpha(colHoriz, 0.75);
      c.lineWidth = 3;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0, yEnd);
      c.lineTo(xMain, yEnd);
      c.stroke();
      c.restore();

      c.save();
      c.strokeStyle = withAlpha(colVert, 0.75);
      c.lineWidth = 3;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(xEnd, y0);
      c.lineTo(xEnd, yMain);
      c.stroke();
      c.restore();

      c.save();
      c.setLineDash([4, 4]);
      c.lineWidth = 1.2;
      c.strokeStyle = withAlpha(colHoriz, 0.55);
      c.beginPath();
      c.moveTo(xMain, yMain);
      c.lineTo(xMain, yEnd);
      c.stroke();
      c.strokeStyle = withAlpha(colVert, 0.55);
      c.beginPath();
      c.moveTo(xMain, yMain);
      c.lineTo(xEnd, yMain);
      c.stroke();
      c.restore();

      var dtFlash = T / N;
      var flashDone = Math.floor(t / dtFlash + 1e-6);
      if (flashDone > N) flashDone = N;

      var flashR = Math.max(3.2, Math.min(5.5, scale * 0.012));

      for (var fk = 1; fk <= flashDone; fk++) {
        var tk = fk * dtFlash;
        var fx = x0 + v0_px * tk;
        var fy = y0 + 0.5 * g_px * tk * tk;

        c.save();
        c.beginPath();
        c.arc(fx, fy, flashR, 0, Math.PI * 2);
        c.fillStyle = colMain;
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.2;
        c.stroke();
        c.restore();

        c.save();
        c.beginPath();
        c.arc(fx, yEnd, flashR, 0, Math.PI * 2);
        c.fillStyle = colHoriz;
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.2;
        c.stroke();
        c.restore();

        c.save();
        c.beginPath();
        c.arc(xEnd, fy, flashR, 0, Math.PI * 2);
        c.fillStyle = colVert;
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.2;
        c.stroke();
        c.restore();
      }

      // ===== 坐标轴（原点 O 在抛出点：x 向右、y 向下） =====
      var axisCol = withAlpha(o.color || '#1a1a1a', 0.55);
      c.save();
      c.strokeStyle = axisCol;
      c.fillStyle = axisCol;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x0 - 20, y0); c.lineTo(b.x2 - 8, y0);
      c.moveTo(x0, y0 - 16); c.lineTo(x0, b.y2 - 8);
      c.stroke();
      c.beginPath();
      c.moveTo(b.x2 - 8, y0); c.lineTo(b.x2 - 17, y0 - 4.5);
      c.lineTo(b.x2 - 17, y0 + 4.5); c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(x0, b.y2 - 8); c.lineTo(x0 - 4.5, b.y2 - 17);
      c.lineTo(x0 + 4.5, b.y2 - 17); c.closePath(); c.fill();
      c.font = 'bold 15px system-ui, sans-serif';
      c.textAlign = 'right'; c.textBaseline = 'bottom';
      c.fillText('x', b.x2 - 12, y0 - 7);
      c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillText('y', x0 + 8, b.y2 - 22);
      c.textAlign = 'right'; c.textBaseline = 'top';
      c.font = 'bold 13px system-ui, sans-serif';
      c.fillText('O', x0 - 7, y0 + 5);
      c.restore();

      // ===== 位移三角形 O-A-P =====
      var dispCol = '#8e24aa';
      c.save();
      c.setLineDash([5, 4]);
      c.strokeStyle = withAlpha(dispCol, 0.5);
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(xMain, y0);
      c.lineTo(xMain, yMain);
      c.stroke();
      c.setLineDash([]);
      c.strokeStyle = withAlpha(dispCol, 0.95);
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(xMain, yMain);
      c.stroke();

      var alphaDisp = Math.atan2(yMain - y0, Math.max(1, xMain - x0));
      var arcD = Math.min(46, Math.max(26, (xMain - x0) * 0.28));
      c.strokeStyle = withAlpha(dispCol, 0.8);
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(x0, y0, arcD, 0, alphaDisp, false);
      c.stroke();
      c.font = 'bold 13px system-ui, sans-serif';
      c.fillStyle = withAlpha(dispCol, 0.95);
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText('\u200bα = ' + (alphaDisp * 180 / Math.PI).toFixed(0) + '°',
                 x0 + (arcD + 10) * Math.cos(alphaDisp * 0.5),
                 y0 + (arcD + 10) * Math.sin(alphaDisp * 0.5));
      c.fillStyle = withAlpha(dispCol, 0.9);
      c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.fillText('位移 s', (x0 + xMain) / 2 - 16, (y0 + yMain) / 2 + 2);
      c.restore();

      // ===== 合速度的反向延长线：必过水平位移中点 =====
      var vvx = v0_px, vvy = g_px * t;
      if (vvy > 1e-6 && t > 0.05) {
        var kM = (y0 - yMain) / vvy;
        var xM = xMain + kM * vvx;
        c.save();
        c.setLineDash([6, 5]);
        c.strokeStyle = withAlpha(colMain, 0.65);
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(xMain, yMain);
        c.lineTo(xM, y0);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = withAlpha(colMain, 0.95);
        c.beginPath();
        c.arc(xM, y0, 4, 0, Math.PI * 2);
        c.fill();
        c.font = 'bold 12.5px system-ui, sans-serif';
        c.fillStyle = withAlpha(o.color || '#1a1a1a', 0.8);
        c.textAlign = 'center'; c.textBaseline = 'bottom';
        c.fillText('速度反向延长线', (xM + xMain) / 2 + 18, (y0 + yMain) / 2 - 8);
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.font = '11.5px system-ui, sans-serif';
        c.fillStyle = withAlpha(o.color || '#1a1a1a', 0.6);
        c.fillText('过水平位移中点', xM + 8, y0 + 8);
        c.restore();
      }

      c.save();
      c.beginPath();
      c.arc(x0, y0, 3.5, 0, Math.PI * 2);
      c.fillStyle = withAlpha(o.color || '#1a1a1a', 0.75);
      c.fill();
      c.restore();

      var ballR = 6.5;
      var drawBall = function (px, py, color) {
        c.save();
        var grd = c.createRadialGradient(px, py, 0, px, py, ballR * 2.8);
        grd.addColorStop(0, withAlpha(color, 0.45));
        grd.addColorStop(1, withAlpha(color, 0));
        c.fillStyle = grd;
        c.beginPath();
        c.arc(px, py, ballR * 2.8, 0, Math.PI * 2);
        c.fill();

        c.beginPath();
        c.arc(px, py, ballR, 0, Math.PI * 2);
        c.fillStyle = color;
        c.fill();
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1.5;
        c.stroke();

        c.beginPath();
        c.arc(px - ballR * 0.32, py - ballR * 0.32, ballR * 0.32, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.fill();
        c.restore();
      };

      drawBall(xMain,   yMain,   colMain);
      drawBall(xShadow, yShadow, colHoriz);
      drawBall(xVert,   yVert,   colVert);

      var vx = v0_px;
      var vy = g_px * t;
      var vmag = Math.hypot(vx, vy);
      var vScale = Math.min(0.18, Math.min(b.w, b.h) * 0.20 / Math.max(1, vmag));

      var tipX = xMain + vx * vScale;
      var tipY = yMain + vy * vScale;

      // 速度三角形：v = vx + vy（首尾相接），合速度另画
      c.save();
      c.lineCap = 'round';
      c.lineWidth = 2.2;

      c.strokeStyle = withAlpha(colHoriz, 0.95);
      c.fillStyle   = withAlpha(colHoriz, 0.95);
      c.beginPath();
      c.moveTo(xMain, yMain);
      c.lineTo(tipX, yMain);
      c.stroke();

      c.strokeStyle = withAlpha(colVert, 0.95);
      c.fillStyle   = withAlpha(colVert, 0.95);
      c.beginPath();
      c.moveTo(tipX, yMain);
      c.lineTo(tipX, tipY);
      c.stroke();

      c.strokeStyle = withAlpha(colMain, 0.95);
      c.fillStyle   = withAlpha(colMain, 0.95);
      c.beginPath();
      c.moveTo(xMain, yMain);
      c.lineTo(tipX, tipY);
      c.stroke();

      var adx = tipX - xMain, ady = tipY - yMain;
      var alen = Math.hypot(adx, ady);
      if (alen > 4) {
        var aux = adx / alen, auy = ady / alen;
        var ahl = 9;
        c.beginPath();
        c.moveTo(tipX, tipY);
        c.lineTo(tipX - aux * ahl - auy * ahl * 0.5,
                 tipY - auy * ahl + aux * ahl * 0.5);
        c.lineTo(tipX - aux * ahl + auy * ahl * 0.5,
                 tipY - auy * ahl - aux * ahl * 0.5);
        c.closePath();
        c.fill();
      }

      // 偏转角 θ（合速度与水平方向的夹角）
      if (vy > 1e-3) {
        var th = Math.atan2(vy, vx);
        var arcV = 30;
        c.strokeStyle = withAlpha(colMain, 0.85);
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(xMain, yMain, arcV, 0, th, false);
        c.stroke();

        c.font = 'bold 13px system-ui, sans-serif';
        c.fillStyle = withAlpha(colMain, 0.95);
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText('\u200bθ = ' + (th * 180 / Math.PI).toFixed(0) + '°',
                   xMain + (arcV + 10) * Math.cos(th * 0.5),
                   yMain + (arcV + 10) * Math.sin(th * 0.5));
      }

      c.font = '12.5px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      c.fillStyle = withAlpha(colHoriz, 0.95);
      c.fillText('vx', (xMain + tipX) / 2, yMain - 6);
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillStyle = withAlpha(colVert, 0.95);
      c.fillText('vy', tipX + 7, (yMain + tipY) / 2);
      c.textAlign = 'left';
      c.textBaseline = 'bottom';
      c.fillStyle = withAlpha(colMain, 0.95);
      c.fillText('v', tipX + 6, tipY - 4);
      c.restore();

      c.save();
      c.font = 'bold 12px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
      c.fillStyle = withAlpha(o.color || '#1a1a1a', 0.85);
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillText('平抛运动分解', b.x1 + 10, b.y1 + 8);
      c.restore();

      c.save();
      c.font = '10.5px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
      c.textAlign = 'left';
      c.textBaseline = 'middle';

      var legendX = Math.max(b.x1 + 14, b.x2 - 196);
      var legendY = b.y2 - 104;
      var legendLineH = 16;

      var items = [
        { color: colMain,  text: '合运动（平抛）' },
        { color: colHoriz, text: '水平：匀速直线' },
        { color: colVert,  text: '竖直：自由落体' }
      ];

      for (var k = 0; k < items.length; k++) {
        var itemY = legendY + k * legendLineH;
        c.beginPath();
        c.arc(legendX + 4, itemY, 4, 0, Math.PI * 2);
        c.fillStyle = items[k].color;
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 1;
        c.stroke();
        c.fillStyle = withAlpha(o.color || '#1a1a1a', 0.82);
        c.fillText(items[k].text, legendX + 14, itemY);
      }
      c.restore();

      c.save();
      c.font = '11px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = withAlpha(o.color || '#1a1a1a', 0.55);
      c.textAlign = 'right';
      c.textBaseline = 'bottom';
      c.fillText(
        'v₀ = ' + v0.toFixed(1) +
        '   频闪 = ' + N + '次/周期' +
        '   t = ' + t.toFixed(2) + ' / ' + T.toFixed(1) + ' s',
        b.x2 - 8, b.y2 - 6
      );
      c.restore();
    }
  });
})();

/* ==========================================================================
 * 32. 立体图（斜二测投影 · 遮挡的棱用虚线）
 * ========================================================================== */
(function () {
  var PB3 = window.TangBoBoard;
  if (!PB3 || !PB3.shapes) return;

  var shape3 = function (d) {
    if (!d || !d.key) return;
    if (typeof PB3.register === 'function') PB3.register(d);
    else PB3.shapes[d.key] = d;
  };

  /* ---- 分类 ---- */
  PB3.categories = PB3.categories || [];
  var hasSolid = false;
  for (var ci = 0; ci < PB3.categories.length; ci++) {
    if (PB3.categories[ci].id === 'solid') { hasSolid = true; break; }
  }
  if (!hasSolid) {
    if (typeof PB3.category === 'function') PB3.category('solid', '立体图');
    else PB3.categories.push({ id: 'solid', label: '立体图' });
  }

  /* ---- 参数 ---- */
  var pd = PB3.paramDefs = PB3.paramDefs || {};
  if (!pd.sdFlat)  pd.sdFlat  = { label: '椭圆扁平',   min: 0.12, max: 0.50, step: 0.02, def: 0.28 };
  if (!pd.sdDepth) pd.sdDepth = { label: '深度比例',   min: 0.10, max: 0.60, step: 0.02, def: 0.33 };
  if (!pd.sdCube)  pd.sdCube  = { label: '近方形时吸附正方体', type: 'toggle', def: true };
  if (!pd.sdTaper) pd.sdTaper = { label: '顶面半径比', min: 0.15, max: 0.90, step: 0.05, def: 0.50 };

  /* ---- 小工具 ---- */
  function clamp(v, lo, hi, dflt) {
    var n = (v == null || isNaN(v)) ? dflt : Number(v);
    return Math.max(lo, Math.min(hi, n));
  }
  function withA(color, a) {
    var h = String(color == null ? '#1a1a1a' : color).replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return 'rgba(0,0,0,' + a + ')';
    return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + a + ')';
  }
  function lineTo2(c, p, q) {
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.lineTo(q.x, q.y);
    c.stroke();
  }
  function pathPoly(c, pts) {
    c.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i === 0) c.moveTo(pts[i].x, pts[i].y);
      else c.lineTo(pts[i].x, pts[i].y);
    }
    c.closePath();
  }
  function fillPoly(c, pts, color, a) {
    pathPoly(c, pts);
    c.fillStyle = withA(color, a);
    c.fill();
  }
  function dashOn(c, lw) {
    c.setLineDash([Math.max(3, lw * 2.1), Math.max(3, lw * 1.7)]);
  }
  function dashOff(c) { c.setLineDash([]); }

  function beginSolid(c, o) {
    var lw = Math.max(1, o.size || 4);
    c.save();
    c.lineWidth = lw;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.setLineDash([]);
    c.strokeStyle = (o.hasBorder === false) ? 'rgba(0,0,0,0)' : (o.color || '#1a1a1a');
    return lw;
  }
  function endSolid(c) { c.restore(); }

  /* 立体长方体：8 个顶点 */
  function boxParts(b, ratio) {
    var m = Math.min(b.w, b.h);
    var d = Math.min(m * ratio, b.w * 0.55, b.h * 0.55);
    var bw = Math.max(2, b.w - d), bh = Math.max(2, b.h - d);
    var X = b.x1, Y = b.y2;
    return {
      d: d, bw: bw, bh: bh,
      FL : { x: X,          y: Y          },
      FR : { x: X + bw,     y: Y          },
      BR : { x: X + bw + d, y: Y - d      },
      BL : { x: X + d,      y: Y - d      },
      FTL: { x: X,          y: Y - bh     },
      FTR: { x: X + bw,     y: Y - bh     },
      BTR: { x: X + bw + d, y: Y - bh - d },
      BTL: { x: X + d,      y: Y - bh - d }
    };
  }

  /* ====================== 1. 圆柱体 ====================== */
  shape3({
    key: 'solidCylinder', cat: 'solid', geom: 'box', label: '圆柱体', fill: true,
    icon: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.6"/>' +
          '<path d="M4.5 5.5v13M19.5 5.5v13"/>' +
          '<path d="M4.5 18.5a7.5 2.6 0 0 0 15 0"/>' +
          '<path d="M4.5 18.5a7.5 2.6 0 0 1 15 0" stroke-dasharray="2 2"/>',
    params: ['sdFlat'],
    draw: function (c, o, GH) {
      var b = GH.box(o);
      var lw = beginSolid(c, o);
      var col = c.strokeStyle;
      var fa = clamp(o.fillAlpha, 0, 1, 0.6);
      var flat = clamp(o.sdFlat, 0.12, 0.50, 0.28);

      var rx = Math.max(3, b.w / 2);
      var ry = Math.max(2, Math.min(rx * flat, b.h * 0.30));
      var cx = b.x1 + b.w / 2;
      var yT = b.y1 + ry;
      var yB = b.y2 - ry;
      if (yB - yT < 2) { endSolid(c); return; }

      if (o.fill && o.fillColor) {
        c.save();
        c.fillStyle = withA(o.fillColor, fa * 0.72);
        c.beginPath();
        c.moveTo(cx - rx, yT);
        c.lineTo(cx - rx, yB);
        c.ellipse(cx, yB, rx, ry, 0, Math.PI, 0, true);
        c.lineTo(cx + rx, yT);
        c.closePath();
        c.fill();
        c.beginPath();
        c.ellipse(cx, yT, rx, ry, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }

      if (col !== 'rgba(0,0,0,0)') {
        dashOn(c, lw);
        c.beginPath();
        c.ellipse(cx, yB, rx, ry, 0, 0, Math.PI, true);
        c.stroke();
        dashOff(c);

        c.beginPath();
        c.ellipse(cx, yB, rx, ry, 0, Math.PI, 0, true);
        c.stroke();

        lineTo2(c, { x: cx - rx, y: yT }, { x: cx - rx, y: yB });
        lineTo2(c, { x: cx + rx, y: yT }, { x: cx + rx, y: yB });

        c.beginPath();
        c.ellipse(cx, yT, rx, ry, 0, 0, Math.PI * 2);
        c.stroke();
      }
      endSolid(c);
    }
  });

  /* ====================== 2. 长方体（正方体自动吸附） ====================== */
  shape3({
    key: 'solidBox', cat: 'solid', geom: 'box', label: '长方体', fill: true,
    icon: '<path d="M3 8h11v11H3z"/>' +
          '<path d="M3 8l5-4h11l-5 4"/>' +
          '<path d="M14 8l5-4v11l-5 4"/>' +
          '<path d="M3 19l5-4" stroke-dasharray="2 2"/>',
    params: ['sdDepth', 'sdCube'],
    draw: function (c, o, GH) {
      /* 正方体吸附：包围盒接近正方形时按正方体画。注意只改这一笔用的局部框，
         绝不回写 o.x2 / o.y2 —— 画一次就把用户画的对象改一次，撤销栈与包围盒都会跟着乱。 */
      var b = null;
      if (o.sdCube) {
        var w0 = Math.abs(o.x2 - o.x1);
        var h0 = Math.abs(o.y2 - o.y1);
        var mn = Math.min(w0, h0);
        if (mn > 2 && Math.abs(w0 - h0) < mn * 0.22) {
          var side = (w0 + h0) / 2;
          b = GH.box({ x1: o.x1, y1: o.y1,
            x2: o.x1 + (o.x2 >= o.x1 ? side : -side),
            y2: o.y1 + (o.y2 >= o.y1 ? side : -side) });
        }
      }
      if (!b) b = GH.box(o);
      var lw = beginSolid(c, o);
      var col = c.strokeStyle;
      var fa = clamp(o.fillAlpha, 0, 1, 0.6);
      var ratio = clamp(o.sdDepth, 0.10, 0.60, 0.33);
      var P = boxParts(b, ratio);

      if (o.fill && o.fillColor) {
        fillPoly(c, [P.FL, P.FR, P.FTR, P.FTL], o.fillColor, fa);
        fillPoly(c, [P.FTL, P.FTR, P.BTR, P.BTL], o.fillColor, fa * 0.76);
        fillPoly(c, [P.FR, P.BR, P.BTR, P.FTR], o.fillColor, fa * 0.52);
      }

      if (col !== 'rgba(0,0,0,0)') {
        dashOn(c, lw);
        lineTo2(c, P.BL, P.BR);
        lineTo2(c, P.BL, P.BTL);
        lineTo2(c, P.BL, P.FL);
        dashOff(c);

        pathPoly(c, [P.FL, P.FR, P.FTR, P.FTL]); c.stroke();
        pathPoly(c, [P.FTL, P.FTR, P.BTR, P.BTL]); c.stroke();
        lineTo2(c, P.FR, P.BR);
        lineTo2(c, P.BR, P.BTR);
        lineTo2(c, P.FTR, P.BTR);
      }
      endSolid(c);
    }
  });

  /* ====================== 3. 球体 ====================== */
  shape3({
    key: 'solidSphere', cat: 'solid', geom: 'box', label: '球体', fill: true,
    icon: '<circle cx="12" cy="12" r="8.5"/>' +
          '<ellipse cx="12" cy="12" rx="8.5" ry="3.2"/>' +
          '<path d="M3.5 12a8.5 3.2 0 0 0 17 0" stroke-dasharray="2 2"/>',
    params: ['sdFlat'],
    draw: function (c, o, GH) {
      var b = GH.box(o);
      var lw = beginSolid(c, o);
      var col = c.strokeStyle;
      var fa = clamp(o.fillAlpha, 0, 1, 0.6);
      var flat = clamp(o.sdFlat, 0.12, 0.50, 0.28);

      var R = Math.max(4, Math.min(b.w, b.h) / 2);
      var cx = (b.x1 + b.x2) / 2;
      var cy = (b.y1 + b.y2) / 2;
      var ry = Math.max(2, R * flat);

      if (o.fill && o.fillColor) {
        c.beginPath();
        c.arc(cx, cy, R, 0, Math.PI * 2);
        c.fillStyle = withA(o.fillColor, fa * 0.72);
        c.fill();
      }

      if (col !== 'rgba(0,0,0,0)') {
        dashOn(c, lw);
        c.beginPath();
        c.ellipse(cx, cy, R, ry, 0, 0, Math.PI, true);
        c.stroke();
        dashOff(c);

        c.beginPath();
        c.ellipse(cx, cy, R, ry, 0, Math.PI, 0, true);
        c.stroke();

        c.beginPath();
        c.arc(cx, cy, R, 0, Math.PI * 2);
        c.stroke();
      }
      endSolid(c);
    }
  });

  /* ====================== 4. 圆锥 ====================== */
  shape3({
    key: 'solidCone', cat: 'solid', geom: 'box', label: '圆锥', fill: true,
    icon: '<path d="M12 3.5L4 18.5h16z"/>' +
          '<path d="M4 18.5a8 2.6 0 0 0 16 0"/>' +
          '<path d="M4 18.5a8 2.6 0 0 1 16 0" stroke-dasharray="2 2"/>',
    params: ['sdFlat'],
    draw: function (c, o, GH) {
      var b = GH.box(o);
      var lw = beginSolid(c, o);
      var col = c.strokeStyle;
      var fa = clamp(o.fillAlpha, 0, 1, 0.6);
      var flat = clamp(o.sdFlat, 0.12, 0.50, 0.28);

      var rx = Math.max(3, b.w / 2);
      var ry = Math.max(2, Math.min(rx * flat, b.h * 0.32));
      var cx = b.x1 + b.w / 2;
      var yB = b.y2 - ry;
      var ay = b.y1;
      if (yB - ay < 3) { endSolid(c); return; }

      if (o.fill && o.fillColor) {
        c.beginPath();
        c.moveTo(cx, ay);
        c.lineTo(cx - rx, yB);
        c.ellipse(cx, yB, rx, ry, 0, Math.PI, 0, true);
        c.closePath();
        c.fillStyle = withA(o.fillColor, fa * 0.70);
        c.fill();
      }

      if (col !== 'rgba(0,0,0,0)') {
        dashOn(c, lw);
        c.beginPath();
        c.ellipse(cx, yB, rx, ry, 0, 0, Math.PI, true);
        c.stroke();
        dashOff(c);

        c.beginPath();
        c.ellipse(cx, yB, rx, ry, 0, Math.PI, 0, true);
        c.stroke();

        lineTo2(c, { x: cx, y: ay }, { x: cx - rx, y: yB });
        lineTo2(c, { x: cx, y: ay }, { x: cx + rx, y: yB });
      }
      endSolid(c);
    }
  });

  /* ====================== 5. 三棱柱 ====================== */
  shape3({
    key: 'solidPrism3', cat: 'solid', geom: 'box', label: '三棱柱', fill: true,
    icon: '<path d="M12 3L3 8l9 5 9-5z"/>' +
          '<path d="M3 8v9l9 5 9-5V8"/>' +
          '<path d="M12 13v9"/>',
    draw: function (c, o, GH) {
      var b = GH.box(o);
      var lw = beginSolid(c, o);
      var col = c.strokeStyle;
      var fa = clamp(o.fillAlpha, 0, 1, 0.6);

      var cx = b.x1 + b.w / 2;
      var a = Math.max(5, b.w / 2);
      var th = a * 0.52;
      var GH = b.h - th;
      if (GH < 5) { endSolid(c); return; }
      var yB = b.y2;

      var A1 = { x: cx,     y: yB      };
      var A2 = { x: cx - a, y: yB - th };
      var A3 = { x: cx + a, y: yB - th };
      var B1 = { x: A1.x, y: A1.y - GH };
      var B2 = { x: A2.x, y: A2.y - GH };
      var B3 = { x: A3.x, y: A3.y - GH };

      if (o.fill && o.fillColor) {
        fillPoly(c, [A1, A2, B2, B1], o.fillColor, fa * 0.85);
        fillPoly(c, [A1, A3, B3, B1], o.fillColor, fa * 0.58);
        fillPoly(c, [B1, B2, B3],      o.fillColor, fa);
      }

      if (col !== 'rgba(0,0,0,0)') {
        dashOn(c, lw);
        lineTo2(c, A2, A3);
        dashOff(c);

        pathPoly(c, [B1, B2, B3]); c.stroke();
        lineTo2(c, A1, A2);
        lineTo2(c, A1, A3);
        lineTo2(c, A1, B1);
        lineTo2(c, A2, B2);
        lineTo2(c, A3, B3);
      }
      endSolid(c);
    }
  });

    /* ====================== 6. 半圆柱 ====================== */
  shape3({
    key: 'solidHalfCyl', cat: 'solid', geom: 'box', label: '半圆柱', fill: true,
    icon: '<path d="M3 17a9 9 0 0 1 18 0z"/>' +
          '<path d="M7 13a9 9 0 0 1 10 0"/>' +
          '<path d="M3 17l4-4M21 17l-4-4"/>',
    params: ['sdDepth'],
    draw: function (c, o, GH) {
      var b = GH.box(o);
      var lw = beginSolid(c, o);
      var col = c.strokeStyle;
      var fa = clamp(o.fillAlpha, 0, 1, 0.6);
      var ratio = clamp(o.sdDepth, 0.10, 0.60, 0.30);

      var m = Math.min(b.w, b.h);
      var d = m * ratio;
      var r = Math.min((b.w - d) / 2, b.h - d);
      if (r < 4) { endSolid(c); return; }

      var cx = b.x1 + r;
      var yB = b.y2;

      var A1 = { x: cx - r,      y: yB     };  // 前面半圆 · 左端
      var A2 = { x: cx + r,      y: yB     };  // 前面半圆 · 右端
      var B1 = { x: A1.x + d,    y: yB - d };  // 后面半圆 · 左端
      var B2 = { x: A2.x + d,    y: yB - d };  // 后面半圆 · 右端
      var cF = { x: cx,          y: yB     };  // 前面半圆 · 圆心
      var cB = { x: cx + d,      y: yB - d };  // 后面半圆 · 圆心

      /* 两条半圆弧的公切线切点：
       *   平移方向 (d, -d) 与半径方向垂直 → 切点角度 = 5π/4（左上方）
       *   这是半圆弧上唯一的公切点（45° 那个切点在半圆之外） */
      var TS = Math.PI * 1.25;
      var cts = Math.cos(TS), sts = Math.sin(TS);
      var P1 = { x: cF.x + r * cts, y: cF.y + r * sts };
      var P2 = { x: cB.x + r * cts, y: cB.y + r * sts };

      if (o.fill && o.fillColor) {
        c.save();
        c.fillStyle = withA(o.fillColor, fa * 0.72);
        c.beginPath();
        c.moveTo(A1.x, A1.y);
        c.ellipse(cF.x, cF.y, r, r, 0, Math.PI, Math.PI * 2, false);
        c.lineTo(B2.x, B2.y);
        c.ellipse(cB.x, cB.y, r, r, 0, 0, Math.PI, true);
        c.closePath();
        c.fill();
        c.restore();
      }

      if (col !== 'rgba(0,0,0,0)') {
        /* ---- 被遮挡部分：虚线 ---- */
        dashOn(c, lw);
        /* 后面底边 */
        lineTo2(c, B1, B2);
        /* 后面半圆弧 · 左半段（B1 → P2，被前面实体挡住） */
        c.beginPath();
        c.ellipse(cB.x, cB.y, r, r, 0, Math.PI, TS, false);
        c.stroke();
        dashOff(c);

        /* ---- 可见部分：实线 ---- */
        /* 后面半圆弧 · 右半段（P2 → B2，露在外面） */
        c.beginPath();
        c.ellipse(cB.x, cB.y, r, r, 0, TS, Math.PI * 2, false);
        c.stroke();

        /* 前面半圆弧（完整可见） */
        c.beginPath();
        c.ellipse(cF.x, cF.y, r, r, 0, Math.PI, Math.PI * 2, false);
        c.stroke();

        /* 前面底边 */
        lineTo2(c, A1, A2);

        /* 左右两条棱 */
        /* 左棱 A1-B1：与后弧一起被遮挡 → 虚线 */
        dashOn(c, lw);
        lineTo2(c, A1, B1);
        dashOff(c);

        /* 右棱 A2-B2：可见 → 实线 */
        lineTo2(c, A2, B2);

        /* 前后半圆弧的公切线 */
        lineTo2(c, P1, P2);
      }
      endSolid(c);
    }
  });


  /* ====================== 7. 斜面体（直角三棱柱） ====================== */
  shape3({
    key: 'solidWedge', cat: 'solid', geom: 'box', label: '斜面体', fill: true,
    icon: '<path d="M3 20V8l16 12z"/>' +
          '<path d="M7 16V4l16 12"/>' +
          '<path d="M3 8l4-4M19 20l4-4"/>',
    params: ['sdDepth'],
    draw: function (c, o, GH) {
      var b = GH.box(o);
      var lw = beginSolid(c, o);
      var col = c.strokeStyle;
      var fa = clamp(o.fillAlpha, 0, 1, 0.6);
      var ratio = clamp(o.sdDepth, 0.10, 0.60, 0.33);

      var m = Math.min(b.w, b.h);
      var d = Math.min(m * ratio, b.w * 0.45, b.h * 0.45);
      var bw = b.w - d, bh = b.h - d;
      var X = b.x1, Y = b.y2;

      var A  = { x: X,         y: Y        };
      var B  = { x: X + bw,    y: Y        };
      var C  = { x: X,         y: Y - bh   };
      var A2 = { x: A.x + d,   y: A.y - d  };
      var B2 = { x: B.x + d,   y: B.y - d  };
      var C2 = { x: C.x + d,   y: C.y - d  };

      if (o.fill && o.fillColor) {
        fillPoly(c, [A, C, C2, A2], o.fillColor, fa * 0.85);
        fillPoly(c, [B, C, C2, B2], o.fillColor, fa * 0.62);
        fillPoly(c, [A, B, C],      o.fillColor, fa);
      }

      if (col !== 'rgba(0,0,0,0)') {
        dashOn(c, lw);
        lineTo2(c, A2, B2);
        dashOff(c);

        pathPoly(c, [A, B, C]); c.stroke();
        lineTo2(c, A, A2);
        lineTo2(c, C, C2);
        lineTo2(c, A2, C2);
        lineTo2(c, B, B2);
        lineTo2(c, B2, C2);
      }
      endSolid(c);
    }
  });

  /* ====================== 8. 平行板电容器 ====================== */
  shape3({
    key: 'solidCapacitor', cat: 'em', geom: 'box', label: '平行板电容器', fill: true,
    icon: '<path d="M3 8h13l5-4H8z"/>' +
          '<path d="M3 17h13l5-4H8z"/>' +
          '<path d="M3 8v9M16 8v9M21 4v9"/>',
    params: ['sdDepth'],
    draw: function (c, o, GH) {
      var b = GH.box(o);
      var lw = beginSolid(c, o);
      var col = c.strokeStyle;
      var fa = clamp(o.fillAlpha, 0, 1, 0.6);
      var ratio = clamp(o.sdDepth, 0.10, 0.60, 0.30);

      var m = Math.min(b.w, b.h);
      var d = Math.min(m * ratio, b.h * 0.70, b.w * 0.50);
      var L = b.w - d;
      var gap = b.h - d;
      if (L < 6 || gap < 2) { endSolid(c); return; }

      var X = b.x1;
      var Yt = b.y1 + d;
      var Yb = Yt + gap;

      var U1 = { x: X,           y: Yt     };
      var U2 = { x: X + L,       y: Yt     };
      var U3 = { x: X + L + d,   y: Yt - d };
      var U4 = { x: X + d,       y: Yt - d };
      var D1 = { x: X,           y: Yb     };
      var D2 = { x: X + L,       y: Yb     };
      var D3 = { x: X + L + d,   y: Yb - d };
      var D4 = { x: X + d,       y: Yb - d };

      if (o.fill && o.fillColor) {
        fillPoly(c, [D1, D2, D3, D4], o.fillColor, fa * 0.45);
        fillPoly(c, [U1, U2, U3, U4], o.fillColor, fa);
      }

      if (col !== 'rgba(0,0,0,0)') {
        var partial = gap < d;
        dashOn(c, lw);
        lineTo2(c, D4, D3);
        if (partial) {
          lineTo2(c, D4, { x: D1.x + gap, y: Yt });
          lineTo2(c, D3, { x: D2.x + gap, y: Yt });
        }
        dashOff(c);

        lineTo2(c, D1, D2);
        lineTo2(c, D1, partial ? { x: D1.x + gap, y: Yt } : D4);
        lineTo2(c, D2, partial ? { x: D2.x + gap, y: Yt } : D3);

        pathPoly(c, [U1, U2, U3, U4]); c.stroke();
      }
      endSolid(c);
    }
  });

  /* ====================== 9. 圆台 ====================== */
  shape3({
    key: 'solidFrustum', cat: 'solid', geom: 'box', label: '圆台', fill: true,
    icon: '<ellipse cx="12" cy="5" rx="5" ry="2"/>' +
          '<ellipse cx="12" cy="19" rx="9" ry="3"/>' +
          '<path d="M7 5l-4 14M17 5l4 14"/>',
    params: ['sdFlat', 'sdTaper'],
    draw: function (c, o, GH) {
      var b = GH.box(o);
      var lw = beginSolid(c, o);
      var col = c.strokeStyle;
      var fa = clamp(o.fillAlpha, 0, 1, 0.6);
      var flat  = clamp(o.sdFlat,  0.12, 0.50, 0.28);
      var taper = clamp(o.sdTaper, 0.15, 0.90, 0.50);

      var rx1 = Math.max(3, b.w / 2);
      var ry1 = Math.max(2, Math.min(rx1 * flat, b.h * 0.26));
      var cx  = b.x1 + b.w / 2;
      var yB  = b.y2 - ry1;
      var rx2 = rx1 * taper;
      var ry2 = Math.max(1.5, ry1 * taper);
      var yT  = b.y1 + ry2;
      if (yB - yT < 3) { endSolid(c); return; }

      if (o.fill && o.fillColor) {
        c.save();
        c.fillStyle = withA(o.fillColor, fa * 0.72);
        c.beginPath();
        c.moveTo(cx - rx1, yB);
        c.lineTo(cx - rx2, yT);
        c.ellipse(cx, yT, rx2, ry2, 0, Math.PI, 0, true);
        c.lineTo(cx + rx1, yB);
        c.ellipse(cx, yB, rx1, ry1, 0, 0, Math.PI, true);
        c.closePath();
        c.fill();
        c.beginPath();
        c.ellipse(cx, yT, rx2, ry2, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }

      if (col !== 'rgba(0,0,0,0)') {
        dashOn(c, lw);
        c.beginPath();
        c.ellipse(cx, yB, rx1, ry1, 0, 0, Math.PI, true);
        c.stroke();
        dashOff(c);

        c.beginPath();
        c.ellipse(cx, yB, rx1, ry1, 0, Math.PI, 0, true);
        c.stroke();

        lineTo2(c, { x: cx - rx1, y: yB }, { x: cx - rx2, y: yT });
        lineTo2(c, { x: cx + rx1, y: yB }, { x: cx + rx2, y: yT });

        c.beginPath();
        c.ellipse(cx, yT, rx2, ry2, 0, 0, Math.PI * 2);
        c.stroke();
      }
      endSolid(c);
    }
  });

})();



})();
  /* ==========================================================================
   * 适配层：把上游注册表接到数理无限画布的对象模型上
   * ========================================================================== */
  const PB = window.TangBoBoard;
  const P = (GW.physShapes = {});
  const SH = (P.shapes = (PB.shapes = PB.shapes || {}));
  const DEFS = (P.paramDefs = (PB.paramDefs = PB.paramDefs || {}));

  // 动画类图形：上游靠 animState.t 每帧推进，这里给一个固定时刻。
  // 取 0.6s 是因为抛体/振动那几个在 t=0 时球还在起点、轨迹是空的，插进来像没画出来。
  const ANIM_T = 0.6;
  PB.animState = { t: ANIM_T, playing: false, speed: 1 };

  // ---------- 上游的 GH 辅助集（draw(ctx, obj, GH) 的第三个参数） ----------
  function boxOf(o) {
    const x1 = Math.min(o.x1, o.x2), y1 = Math.min(o.y1, o.y2);
    const x2 = Math.max(o.x1, o.x2), y2 = Math.max(o.y1, o.y2);
    return { x1: x1, y1: y1, x2: x2, y2: y2, w: x2 - x1, h: y2 - y1 };
  }
  function tintColor(hex, a) {
    if (!hex) return 'rgba(0,0,0,' + a + ')';
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h, 16);
    if (isNaN(n)) return 'rgba(0,0,0,' + a + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function arrowTip(c, x1, y1, x2, y2, size) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const hl = Math.max(12, (size || 8) * 4), sp = 0.42;
    c.beginPath();
    c.moveTo(x2, y2); c.lineTo(x2 - hl * Math.cos(ang - sp), y2 - hl * Math.sin(ang - sp));
    c.moveTo(x2, y2); c.lineTo(x2 - hl * Math.cos(ang + sp), y2 - hl * Math.sin(ang + sp));
    c.stroke();
  }
  const GH = {
    // 上游的 tint：跟着当前对象走 —— 选了填充色就用填充色、透明度用 fillAlpha
    tint(color, a) {
      const cur = GH.cur;
      let base = color, al = a;
      if (cur) {
        if (typeof cur.fillAlpha === 'number') al = cur.fillAlpha;
        if (cur.fillColor && (color === cur.color || color == null)) base = cur.fillColor;
      }
      return tintColor(base, al);
    },
    box: boxOf,
    // 动画类那 10 个图形的 draw 第三个形参叫 U2（历史命名），内部读 U2.bbox(o) —— 同一个对象
    bbox: boxOf,
    alpha: (c, a) => tintColor(c, a),
    head: arrowTip,
    deg: (d) => (d * Math.PI) / 180,
    cur: null,
  };

  // ---------- 分类 ----------
  // 物理仿真排在最前面（就是原来的「动画」，1.0.9 起并进物理图形面板，作为第一组）
  // 1.1.9：不再有「物理仿真」这一页 —— 从仿真搬过来的图形问题太多，除「圆周与天体」保留 6 个外
  // 全部撤销。注册表里的 anim_* 仍然留着（老板书里插过的照旧显示、照旧能调参数），只是不进面板。
  // 1.6.0：新增「热学」（活塞 pV 等），插在力学后面 —— 菜单顺序按这里的顺序出
  // 2.0.9：新增「近代物理」「物理图像」两页 —— 并入便携白板 PM 模型库时带来的分类，
  // 上游本来就分 modern / graph，这里沿用同名 cat，只把中文名定为「物理图像」
  // （与数学页的「函数图像」区分）。
  P.catOrder = ['mech', 'heat', 'wave', 'orbit', 'optics', 'em', 'emlab', 'modern', 'graph', 'sketch'];
  P.catLabel = {
    mech: '力学', heat: '热学', wave: '振动与波', orbit: '圆周与天体', optics: '光学', em: '电磁', emlab: '电磁学实验',
    sketch: '简笔画', solid: '立体几何', anim: '物理仿真', graph: '物理图像',
    // 下面三个是内部/隐藏分类，但搜索与模板面板会读 catLabel，补上中文免得露出原始 key
    modern: '近代物理', basic: '基础图形', text: '文字',
  };
  // 不想在面板里看到的图形把 key 加进来（只影响清单，老板书里的照旧显示、照旧能调参数）
  // 「基础」原来有 21 个，其中矩形/圆/三角形/箭头/网格这些跟上面「图形」网格、下面学科模板
  // 完全重复（同样的框、同样的样子），留着只是让人多点一次。这里只留三个圆弧槽和直角坐标系，
  // 扇形挪到「数学模板」里（见 stencils.js 的 pbKey）。老 .gewu 里的这些对象照旧画、照旧能选。
  P.hide = [
    'line', 'dashedLine', 'arrow', 'dblArrow', 'rect', 'roundedRect', 'circle', 'ellipse',
    'sector', 'isoTriangle', 'rightTriangle', 'parallelogram', 'diamond', 'trapezoid',
    'pentagon', 'hexagon', 'grid',
    // 立体几何挪到「学科模板 · 数学」（见 stencils.js 里的 pbKey），物理图形面板不再重复出现。
    // 平行板电容器是例外：它属于物理电磁，放在「物理 · 电磁」里（2026-10 从数学模板挪回）。
    'solidCylinder', 'solidBox', 'solidSphere', 'solidCone', 'solidPrism3',
    'solidHalfCyl', 'solidWedge', 'solidFrustum',
    // 1.1.10：「天体运动」按要求从「圆周与天体」里撤掉。图形本身不删 —— 老板书里插过
    // 的照旧显示、照旧能调参数、照旧能播放，只是不再出现在插入面板里。
    'anim_orbit_motion',
  ];
  P.list = function (cat) {
    const out = [];
    for (const k in SH) {
      const d = SH[k];
      if (!d || !d.draw || d.hidden) continue;
      if (d.cat === 'text') continue;                       // 文字有自己的工具
      if (d.geom === 'path') continue;                      // 画笔 / 橡皮（上游 hidden）
      if (P.hide.indexOf(k) >= 0) continue;
      if (cat) {
        const same = d.cat === cat;
        const borrowed = d.cat === 'anim' && (P.animTopic[k] || d.topic) === cat;   // 动画图形借到主题分页里
        if (!same && !borrowed) continue;
      }
      out.push(d);
    }
    // 1.0.9 新加的三个交互仿真排在最前面（sort 在现代 V8 里稳定，其余保持注册顺序）
    out.sort((a, b) => (/^sim_/.test(a.key) ? 0 : 1) - (/^sim_/.test(b.key) ? 0 : 1));
    // 电磁学实验这批（phys-em.js 注册）不按注册顺序也不按字母：教学上先量具、再表、再电路、最后动画，
    // 注册顺序是文件名字母序（卡尺 10/20/50 反而排在电流表后面），所以给每张图一个 ord。
    if (cat === 'emlab') out.sort((a, b) => (a.ord || 0) - (b.ord || 0));
    // 借过来的动画图形排在静态图形后面：静态先讲原理，动画再演示过程。
    if (cat === 'mech' || cat === 'wave' || cat === 'orbit') {
      out.sort((a, b) => (a.cat === 'anim' ? 1 : 0) - (b.cat === 'anim' ? 1 : 0));
    }
    return out;                                             // 注册顺序即上游编排的顺序
  };
  // 1.1.7：动画图形（上游 cat='anim'）按主题并入「力学 / 振动与波 / 圆周与天体」三个子面板 ——
  // 老师要的是「调参图形」里直接能拿到这些动画，而不是先去物理仿真抽屉里翻。
  // 仿真抽屉与「物理仿真」分页照旧，不动。
  // 1.1.9：只保留「圆周与天体」的 6 个（5 个上游动画 + 新写的天体运动），
  // 其余原来借到力学/振动与波分页里的仿真图形一律撤销（老师反馈那些问题多）。
  P.animTopic = {
    anim_ring_ball: 'mech', anim_sliding_slot_ball: 'mech', anim_slot_ball5: 'orbit',
    anim_kepler2: 'orbit', anim_satellites: 'orbit',
  };
  P.cats = function () { return P.catOrder.filter((c) => P.list(c).length > 0); };
  P.get = function (key) { return SH[key] || null; };
  P.isPb = function (it) { return !!(it && it.kind === 'shape' && it.type === 'pb'); };

  // ---------- 外部注册：电磁学可调参图形库（src/core/phys-em.js） ----------
  // 那批图是照着作者给的独立演示页做的：设计尺寸固定（dw×dh），配色、字号、比例都按原页面
  // 调好。这里把设计画布等比缩放、居中塞进用户框，图形自己只按设计坐标画 —— 原页面的比例
  // 与字号一个像素都不用改；缩放/旋转/导出照旧走 P.draw，包围盒照旧由 Meas 量。
  // 与上游 reg() 的差别：注册在适配层之外的文件里（phys-em.js），所以参数定义也一起收。
  /* ── 1.1.7：图形不垫底，墨色跟着画布走 ──────────────────────────────────────
     这批「电磁学实验」图是从单页 HTML 搬来的，墨色写死成 #15171a（白底黑线）。
     1.1.6 的折中是给每张图垫一张白纸 —— 老师反馈那样会盖住下面的板书，而且虚线框跟
     白纸边对齐、不跟图形轮廓对齐。1.1.7 改成：
       · 不铺纸、不铺底板，画布本身就是背景（选中虚线框因此只框住墨迹）；
       · 墨色按页面明暗自动换档：浅色页面用墨色、深色页面用浅墨（强调色只提亮不改色相，
         红蓝刻度/指针仍然认得出），这套映射包在 ctx 代理里，模块源码一个色值都不用改。
     对后来新增的图同理 —— 只要走 emDefine/emReg 就自动具备。 */
  function lumOf(r, g, b) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
  function parseHex(v) {
    if (typeof v !== 'string') return null;
    let h = v.trim();
    if (h.charAt(0) !== '#') return null;
    h = h.slice(1);
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(r, g, b) {
    const f = (x) => { const t = Math.max(0, Math.min(255, Math.round(x))).toString(16); return t.length < 2 ? '0' + t : t; };
    return '#' + f(r) + f(g) + f(b);
  }
  // 反相：把「给深底画的图」放到浅底上、或反过来。色相不动，只换明度。
  // 反相换墨。toLight=true 表示「目标页是深色，墨要变浅」；false 表示「目标页是浅色，墨要压深」。
  // 早期版本只认「往白里提」，结果浅色页面上「深色表盘设计」里的浅蓝刻度（#8fa3c0）被原样留着，
  // 米黄纸背景上几乎看不见 —— 所以两个方向都要走。
  P.emTint = function (hex, invert, toLight) {
    const px = parseHex(hex);
    if (!px) return hex;
    const r = px[0], g = px[1], b = px[2];
    if (!invert) return hex;
    const l = lumOf(r, g, b);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0;
    if (sat < 0.22) return l < 0.5 ? '#e9eff9' : '#15171a';           // 中性色：深↔浅互换
    if (!toLight) {
      // 浅底：亮色压到 0.45 以下，色相不变
      if (l <= 0.45) return toHex(r, g, b);
      const f = Math.min(1, (l - 0.45) / Math.max(0.2, l));
      return toHex(r - r * f, g - g * f, b - b * f);
    }
    if (l >= 0.62) return toHex(r, g, b);                              // 本来就亮：原样
    const f = Math.min(1, (0.62 - l) / Math.max(0.18, 1 - l));         // 有颜色：往白里提
    return toHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
  };
  // 填充和描边分开换：底板/贴片那种「深色面 + 浅色字」的组合，如果面也跟着提亮就变成
  // 白底白字（1.1.7 第一版就是这样，电压表的 V/A 圈成了实心白饼）。所以：
  //   · 描边照常换色（线条要看得见）；
  //   · 填充里的「中性深色」当成「面板面」处理 —— 深色页给它半透明浅底、浅色页给半透明墨底，
  //     既不盖住画布，也不再把上面的字吃掉。有彩色的填充仍然只提亮、不动色相。
  // 只拦颜色属性：模块里 `c.fillStyle = INK` 这一句不用改，代理负责换算。
  function emCtx(c, invert, toLight) {
    const cache = new Map();
    return new Proxy(c, {
      get(t, k) {
        const v = t[k];
        if (typeof v === 'function') {
          let f = cache.get(k);
          if (!f) { f = v.bind(t); cache.set(k, f); }
          return f;
        }
        return v;
      },
      set(t, k, v) {
        if (k === 'fillStyle' || k === 'strokeStyle' || k === 'shadowColor') {
          if (typeof v === 'string') v = P.emTint(v, invert, toLight);
        }
        t[k] = v;
        return true;
      },
    });
  }

  P.emDefine = function (d) {
    if (!d || !d.key || !d.draw) return;
    const ps = d.params || [];
    for (const p of ps) {
      DEFS[p.key] = {
        label: p.label || p.key, min: p.min, max: p.max, step: p.step, def: p.def,
        unit: p.unit || '', type: p.type || 'range',
        // paramList() 本来就支持多段枚举 hint，但 emDefine 以前把它丢了，导致挡位类参数
        // 只能做二态。补上透传后，normalizeSpecs 也会自动把 hint 转成 validateParams 的 enum 白名单。
        hint: p.hint || null,
      };
    }
    const inner = d.draw, dw = d.dw || 800, dh = d.dh || 600;
    SH[d.key] = {
      key: d.key, cat: d.cat || 'emlab', geom: 'box', label: d.label || d.key,
      fill: false, animatable: !!d.animatable, params: ps.map((p) => p.key), dw: dw, dh: dh,
      em: true, ord: d.ord || 0, base: d.base || 'light', topic: d.topic || '',
      // 1.7.12：图形可自带「插入时初始化」（电阻箱读数每次插入随机一个读数）
      onInsert: typeof d.onInsert === 'function' ? d.onInsert : null,
      draw(c, o, G) {
        const b = G.box(o);
        const s = Math.min(b.w / dw, b.h / dh);
        if (!(s > 0)) return;
        const ox = b.x1 + (b.w - dw * s) / 2, oy = b.y1 + (b.h - dh * s) / 2;
        const dark = !!(GW.isDarkBg && GW.isDarkBg());
        // 模块的配色是照着某一种底色写死的（表盘/磁聚焦给深底画、卡尺/电路给白底画）。
        // 只有当「页面底色」和它原本的底色不一样时才反相，否则原样照画 ——
        // 这样表盘的深色圆盘 + 浅色字的对比关系永远成立，不会出现白底白字。
        const base = (SH[d.key] && SH[d.key].base) || d.base || 'light';
        const invert = dark !== (base === 'dark');
        c.save();
        c.translate(ox, oy); c.scale(s, s);
        // 裁到设计画布：动画里小球/滑块飞出画框时，如果不管，画框外那几笔会留在实时层上
        // 擦不掉（虚线框只清自己的范围），看起来就像「画布被划了一道」。裁掉之后虚线框
        // 就是真正的边界，框外永远干净。
        c.beginPath(); c.rect(0, 0, dw, dh); c.clip();
        const r = { w: dw, h: dh, s: s, k: Math.max(0.35, (o.width || 3) / 3), dark: dark, invert: invert };
        r.col = (hex) => P.emTint(hex, invert);
        // 底板（表盘的深色仪表盘面）在 1.1.7 不再画：画布就是背景。
        // 模块若仍写了 plate，也只在显式 d.plateKeep = true 时才画（留给以后可能的「贴纸」风格）。
        try {
          if (d.plateKeep && d.plate) d.plate(c, o, r);
          inner(emCtx(c, invert, dark), o, r);
        } finally { c.restore(); }
      },
    };
  };

  // ---------- 参数 ----------
  P.paramList = function (key) {
    const d = SH[key];
    if (!d || !d.params) return [];
    const out = [];
    for (const k of d.params) {
      const pd = DEFS[k];
      if (!pd) continue;
      // 0/1 型参数上游写成 unit:'0无1有'，面板画成分段按钮
      const o = { key: k, label: pd.label || k, min: pd.min, max: pd.max, step: pd.step, def: pd.def, unit: pd.unit || '', type: pd.type || 'range' };
      // 2.0.9：PM 扩展模型库（phys-pm-ext.js）里的参数有「默认值取自另一个参数」的写法
      // （同参数的几种写法共享同一个默认值）。这里只把来源抄下来，真正求值在 P.make 里做 ——
      // paramList 只拿到单个参数定义，拿不到整张参数表。
      if (pd.defaultFrom) o.defaultFrom = pd.defaultFrom;
      if (typeof pd.defaultFor === 'function') o.defaultFor = pd.defaultFor;
      const m = /^0([^]*?)1([^]*)$/.exec(o.unit);
      if (m) { o.hint = [{ label: m[1] || '无', value: 0 }, { label: m[2] || '有', value: 1 }]; o.unit = ''; }
      // 三态及以上的分段（如欧姆表的测量/短接/断开）：参数定义里直接给 hint 数组
      if (pd.hint && pd.hint.length) { o.hint = pd.hint; o.unit = ''; }
      // type:'toggle' 的参数（如正方体吸附）上游没给 min/max，面板上画成「关 / 开」两段
      if (o.type === 'toggle' && !o.hint) { o.hint = [{ label: '关', value: 0 }, { label: '开', value: 1 }]; o.unit = ''; }
      // 2.0.9：type:'select' 的参数（PM 库用 K.sel 声明，自带 options）以前没有 hint，
      // 面板一律画成滑动条 —— 明明是 2~3 个互斥档位，拖起来还对不上档。这里把 options
      // 转成 hint，交给面板既有的「≤6 项分段按钮 / >6 项下拉」规则处理。
      if (!o.hint && o.type === 'select' && pd.options && pd.options.length) {
        o.hint = pd.options.map((x) => ({ label: x.label, value: x.value }));
        o.unit = '';
      }
      if (o.hint) {
        o.min = o.hint[0].value; o.max = o.hint[o.hint.length - 1].value; o.step = 1;
        // 默认值必须落在某个分段上，否则分段控件会一条都不选中；还要转成数字（上游有 def:true）
        if (o.def == null || !o.hint.some((h) => +h.value === +o.def)) o.def = o.hint[0].value;
        o.def = +o.def;
      }
      // 2.0.9：type:'modelText' 是扩展模型库里的自由文本参数（挡板端点、隐藏粒子编号这类
      // 「一次填一串坐标」的设置）。给兜成 0~1 的滑条既拖不出坐标、还会把默认值改掉，这里原样放行。
      if (o.type === 'modelText') { o.text = String(pd.def == null ? '' : pd.def); out.push(o); continue; }
      if (!(o.min < o.max)) { o.min = 0; o.max = 1; o.step = o.step || 0.01; }
      out.push(o);
    }
    return out;
  };
  P.defaults = function (key) {
    const out = {};
    for (const p of P.paramList(key)) out[p.key] = p.def;
    return out;
  };

  // ---------- 1.3.0：拖动方向 → 图形变体 ----------
  // 原来 P.make 第一件事就是把四个坐标归一化成 x1≤x2、y1≤y2，方向信息当场就没了，于是
  // 「往左拖点电荷」永远得到正电荷、「往右拖磁铁」N 永远在左。这里在归一化**之前**用原始
  // 起止点判方向，写进 it.dir，再按 DIRS 表给那几个「有指向」的图形改默认参数。
  const DIR_MIN_PX = 12;                     // 小于这个位移（屏幕像素）算点按，与面板插入同向
  function dirOf(x0, y0, x1, y1) {
    const s = (GW.camera && GW.camera.s) || 1;
    const dx = x1 - x0, dy = y1 - y0;
    const ax = Math.abs(dx) * s, ay = Math.abs(dy) * s;
    if (Math.max(ax, ay) < DIR_MIN_PX) return 'r';
    return ax >= ay ? (dx >= 0 ? 'r' : 'l') : (dy >= 0 ? 'd' : 'u');
  }
  P.dirOf = dirOf;
  // 表里没有的 key 只多存一个 dir 字段、绘制完全不变。
  P.DIRS = {
    charge:    { r: { chargeSign: 0 }, l: { chargeSign: 1 }, d: { chargeSign: 0 }, u: { chargeSign: 0 } },
    magField:  { r: { fieldInto: 0 },  l: { fieldInto: 1 },  d: { fieldInto: 0 },  u: { fieldInto: 0 } },
    efUniform: { r: { uniDir: 0, uniSign: 0 }, l: { uniDir: 0, uniSign: 1 },
                 d: { uniDir: 1, uniSign: 0 }, u: { uniDir: 1, uniSign: 1 } },
    magnet:    { r: { swapPole: 1 }, l: { swapPole: 0 }, d: { swapPole: 1 }, u: { swapPole: 0 } },
    horseshoe: { r: { swapPole: 0 }, l: { swapPole: 1 }, d: { swapPole: 0 }, u: { swapPole: 1 } },
    battery:   { r: { batteryFlip: 0 }, l: { batteryFlip: 1 }, d: { batteryFlip: 0 }, u: { batteryFlip: 0 } },
  };

  // ---------- 创建 / 绘制 / 包围盒 ----------
  P.make = function (key, x0, y0, x1, y1, opt) {
    const d = SH[key];
    if (!d) return null;
    const o = opt || {};
    const dir = o.dir || dirOf(x0, y0, x1, y1);
    const it = {
      id: GW.uid(), kind: 'shape', type: 'pb', key: key,
      dir: dir,
      x1: Math.min(x0, x1), y1: Math.min(y0, y1),
      x2: Math.max(x0, x1), y2: Math.max(y0, y1),
      color: o.color || '#1b2433',
      width: Math.max(2, o.width || 3),
      dash: !!o.dash,
      fill: !!o.fill,
      fillColor: o.fillColor || o.color || '#1b2433',
      fillAlpha: o.fillAlpha != null ? o.fillAlpha : 0.2,
      hasBorder: true,
      // 透明度：0~1。默认取「上次在参数面板里调过的那个值」（GW.settings.shapeAlpha），
      // 这样老师把某个图调淡之后，下一个插进来的图也是同样的淡，不用每张都重调。
      opacity: o.opacity != null ? o.opacity : ((GW.settings && GW.settings.shapeAlpha != null) ? GW.settings.shapeAlpha : 1),
    };
    it.size = it.width;
    const remember = o.params || {};
    const plist = P.paramList(key);
    for (const p of plist) it[p.key] = remember[p.key] != null ? remember[p.key] : p.def;
    // 第二遍才算「默认值跟着另一个参数走」（defaultFrom / defaultFor）。必须两遍：
    // 参数表里被依赖的那个可能排在后面（斜面的 μₛ 就排在 μ 前面），一遍算会读到还没赋值的字段。
    for (const p of plist) {
      if (remember[p.key] != null) continue;
      if (p.defaultFrom && it[p.defaultFrom] != null) it[p.key] = it[p.defaultFrom];
      else if (typeof p.defaultFor === 'function') {
        try { const f = p.defaultFor(it); if (f != null) it[p.key] = f; } catch (e2) {}
      }
    }
    // 1.1.8：动画图形**插进来就停在起点**，要老师按「播放」才动（以前是插进来就跑，
    // 想讲「初态」时得先按暂停，手忙脚乱）。旧板书里存的 animPlaying 仍然照原样生效。
    // 2.0.9：这一步挪到参数铺好之后 —— 扩展模型库里有一批图「按参数决定能不能动」
    // （板块模型的 qContactMode、动态电路的扫描开关），canAnimate 为假时它本来就是一张静态图，
    // 不该挂上 animT（探针 probe-mech-anim 断言这类图「没有动画状态」）。
    if (d.animatable && (typeof d.canAnimate !== 'function' || (function () { try { return !!d.canAnimate(it); } catch (e) { return true; } })())) {
      // 1.1.11：力学七图默认 0.25× 且插进来就是静止帧（与旧静态图同一姿态）；其余动画类保持原样。
      const slow = d.key === 'pendulum' || d.key === 'conveyor' || d.key === 'springOscillator' ||
        d.key === 'springOscV' || d.key === 'twoBlocksSpring' || d.key === 'blockOnBoard' || d.key === 'connectorBlocks';
      it.animT = slow ? ANIM_T : 0;
      it.animPlaying = false;
      // 1.7.12：图形可自带默认速度（电磁振荡 0.05×，讲课时电荷才走得清楚）
      it.animSpeed = typeof d.animSpeed === 'number' ? d.animSpeed : (slow ? 0.25 : 1);
    }
    // 方向变体只改「这次没显式给」的参数：面板插入时 remember 里带的就是老师刚调的值，不能被覆盖。
    const adj = (P.DIRS[key] || {})[dir];
    if (adj) for (const k in adj) if (remember[k] == null) it[k] = adj[k];
    // 1.7.12：图形自带插入初始化（参数已铺好后调用，可覆盖随机项）
    if (typeof d.onInsert === 'function') d.onInsert(it);
    return it;
  };

  // 抽屉里点卡片直接插一个：屏幕上看恒为 400×300（除上缩放），插完自动选中，工具条上就有「参数」。
  P.insert = function (key, opt) {
    const c = GW.viewCenter();
    const k = 1 / GW.camera.s;
    let w = 400 * k, h = 300 * k;
    // 电磁学那批是「按原页面的设计画布」画的：插入时就按设计画布的长宽比给框，
    // 否则 900×330 的卡尺塞进 400×300 会缩成一条、上下各留一大块空白。
    // 长边取 520（而不是默认的 400）：卡尺主尺的字号在设计画布里只有 16px，
    // 按 400 缩放后掉到 7px，投影上看不清；520 下约 9px，再放大一点就能读。
    const d = SH[key];
    if (d && d.dw > 0 && d.dh > 0) {
      const ar = d.dh / d.dw;
      // 1.1.7：从仿真搬来的那批图信息密度高（小图 + 读数 + 图例），520 宽塞不下，
      // 设计宽 ≥860 的给 640 起步；其余仍是 520。老师仍可拖手柄再放大。
      const base = (d.dw >= 860 ? 640 : 520);
      if (ar <= 1) { w = base * k; h = base * ar * k; } else { h = base * k; w = (base / ar) * k; }
    }
    const it = P.make(key, c.x - w / 2, c.y - h / 2, c.x + w / 2, c.y + h / 2,
      Object.assign({ color: (GW.tool.pen && GW.tool.pen.color) || '#1b2433', width: Math.max(2, (GW.tool.pen && GW.tool.pen.width) || 3) }, opt || {}));
    if (!it) return null;
    GW.addItems([it]);
    GW.selection.set([it]);
    GW.selection.render();
    GW.requestRender();
    if (GW.requestLive) GW.requestLive();   // 全暂停状态下插入的新图形也要能立刻动起来
    return it;
  };

  // 画布给 ctx 的是世界坐标（board.drawItem 里已经 setTransform 过），上游的几何也全是
  // 绝对世界坐标，所以这里只负责把上游要的 o / GH 补齐。
  // ---------- 用户改色 ----------
  // 库里的图形几乎都自带配色（上游 129 个 draw 一律直接写 c.strokeStyle = '#15171a'），
  // 所以选中后在底栏调色板改 it.color 只对极少数「听话」的图形有效 —— 老师看到的
  // 就是「很多图形的轮廓线条改颜色不生效」。
  // 这里给 ctx 套一层代理：**只换中性墨色**（RGB 三通道差 ≤ 56，也就是黑/深灰/浅灰/蓝灰），
  // 红蓝绿这些强调色原样保留（表盘的橙色指针、卡尺的红重合线、蓝零线都不该被一起染掉）。
  const rgbOf = (v) => {
    if (typeof v !== 'string') return null;
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
    if (m) {
      const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(v.trim());
    if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return p.length >= 3 ? [p[0], p[1], p[2]] : null; }
    return null;
  };
  const isInk = (v) => {
    const c = rgbOf(v);
    if (!c) return false;
    return Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) <= 56;
  };
  /* ==========================================================================
   * 数值场线（1.7.10）：等效磁荷 / 电流环 → RK4 流线
   * --------------------------------------------------------------------------
   * 为什么不用椭圆：椭圆只是几何装饰，既不经过极面、相邻两条之间代表的磁通也不相等，
   * 靠近磁极与远离磁极的疏密关系全错。这里按场方程算：条形/蹄形用二维等效磁荷
   *     B(r) = Σ qᵢ (r-rᵢ)/|r-rᵢ|³
   * 螺线管用真电流环的 Biot–Savart 数值积分；起点按二维磁通函数
   *     ψ(r) = Σ qᵢ·atan2(y-yᵢ, x-xᵢ)/(2π)
   * 等值间隔取 —— ψ 的等值线本身就是二维场线，等 ψ 间隔 ⇒ 每条线代表相同的磁通。
   * 只在纸面这个截面里算（教学图都是截面图），足够且快。
   * ========================================================================== */
  function flMonopoles(poles) {
    return function (x, y) {
      let bx = 0, by = 0;
      for (let i = 0; i < poles.length; i++) {
        const p = poles[i], dx = x - p.x, dy = y - p.y;
        const r2 = dx * dx + dy * dy;
        if (r2 < 1e-9) continue;
        const k = p.q / (r2 * Math.sqrt(r2));
        bx += k * dx; by += k * dy;
      }
      return [bx, by];
    };
  }
  function flFlux(poles) {
    return function (x, y) {
      let s = 0;
      for (let i = 0; i < poles.length; i++) {
        const p = poles[i];
        s += p.q * Math.atan2(y - p.y, x - p.x);
      }
      return s / (2 * Math.PI);
    };
  }
  /* 二维流函数差：ψ(x,y) - ψ(x0,y0)，先沿 y=y0 水平积 B_y，再沿 x 竖直积 -B_x。
     在无电流区域 ∇×B=0，路径无关；等值线就是纸面里的场线。
     注意不能拿 atan2 那套（那是二维 1/r 场的通量），而 B 用的是三维 1/r² 的磁荷场 ——
     两者不配套时，选出来的「等磁通起点」会落在渐近线上，线会一路跑到画布外面去。 */
  function flFluxAt(B, x0, y0, x, y, n) {
    const N = n || 20;
    let s = 0, i;
    const dx = (x - x0) / N;
    for (i = 0; i < N; i++) s += B(x0 + dx * (i + 0.5), y0)[1] * dx;
    const dy = (y - y0) / N;
    for (i = 0; i < N; i++) s -= B(x, y0 + dy * (i + 0.5))[0] * dy;
    return s;
  }
  // 电流环（轴沿 y）：环心 (x,y)、半径 r。三维 Biot–Savart 在 z=0 平面的分量积分。
  function flLoops(loops) {
    return function (x, y) {
      let bx = 0, by = 0;
      for (let li = 0; li < loops.length; li++) {
        const lp = loops[li], a = lp.r, N = lp.n || 48, I = lp.i == null ? 1 : lp.i;
        if (!(a > 0)) continue;
        const dphi = (Math.PI * 2) / N;
        for (let s = 0; s < N; s++) {
          const phi = (s + 0.5) * dphi, cs = Math.cos(phi), sn = Math.sin(phi);
          const rx = x - lp.x - a * cs, ry = y - lp.y, rz = -a * sn;
          const r2 = rx * rx + ry * ry + rz * rz;
          if (r2 < 1e-9) continue;
          const inv = I * dphi / (r2 * Math.sqrt(r2));
          bx += (-a * cs * ry) * inv;                 // (dl × r) 的 x 分量
          by += (a * cs * rx - a * a * sn * sn) * inv; // 的 y 分量
        }
      }
      return [bx, by];
    };
  }
  // RK4 追踪一条流线（按单位切向走固定弧长，步数可预期）
  function flTrace(opt) {
    const B = opt.B, step = opt.step || 1, maxSteps = opt.maxSteps || 600;
    const bd = opt.bounds || null, dir = opt.dir || 1;
    let x = opt.from[0], y = opt.from[1];
    const pts = [[x, y]];
    const u = (xx, yy) => {
      const b = B(xx, yy), m = Math.sqrt(b[0] * b[0] + b[1] * b[1]);
      if (!(m > 1e-14)) return [0, 0];
      return [(b[0] / m) * dir, (b[1] / m) * dir];
    };
    for (let i = 0; i < maxSteps; i++) {
      const k1 = u(x, y);
      if (!k1[0] && !k1[1]) break;
      const k2 = u(x + k1[0] * step / 2, y + k1[1] * step / 2);
      const k3 = u(x + k2[0] * step / 2, y + k2[1] * step / 2);
      const k4 = u(x + k3[0] * step, y + k3[1] * step);
      x += (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) * step / 6;
      y += (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) * step / 6;
      pts.push([x, y]);
      if (bd && (x < bd.x1 || x > bd.x2 || y < bd.y1 || y > bd.y2)) { pts.pop(); pts.out = true; break; }
      if (opt.closed && i > 10 && Math.hypot(x - pts[0][0], y - pts[0][1]) < step * 1.3) {
        pts.push([pts[0][0], pts[0][1]]); pts.closed = true; break;
      }
      if (opt.stop && opt.stop(x, y, i)) { pts.hit = true; break; }
    }
    return pts;
  }
  // 在某个探测面上按「等 ψ 间隔」取 k 个起点（等磁通 ⇒ 线距才符合物理）
  // along='y'：探测面是竖直线 x=fixed，起点沿 y 取；along='x'：水平面 y=fixed，起点沿 x 取。
  function flStarts(B, along, fixed, a0, a1, k, frac, ref, ns) {
    const useX = along === 'x';
    const r0 = ref || (useX ? [(a0 + a1) / 2, fixed] : [fixed, (a0 + a1) / 2]);
    const NS = ns || 64, vals = [];
    for (let i = 0; i <= NS; i++) {
      const t = a0 + (a1 - a0) * (i / NS);
      const x = useX ? t : fixed, y = useX ? fixed : t;
      vals.push([t, flFluxAt(B, r0[0], r0[1], x, y, 18)]);
    }
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < vals.length; i++) { lo = Math.min(lo, vals[i][1]); hi = Math.max(hi, vals[i][1]); }
    const f0 = frac == null ? 0.10 : frac, out = [];
    for (let j = 0; j < k; j++) {
      const t = k === 1 ? 0.5 : f0 + (1 - 2 * f0) * (j / (k - 1));
      const target = lo + (hi - lo) * t;
      let bi = 0, bd = Infinity;
      for (let i = 0; i < vals.length; i++) {
        const d = Math.abs(vals[i][1] - target);
        if (d < bd) { bd = d; bi = i; }
      }
      out.push(useX ? [vals[bi][0], fixed] : [fixed, vals[bi][0]]);
    }
    return out;
  }
  // 在折线上按弧长取点（画箭头用）
  function flAt(pts, t) {
    if (!pts || pts.length < 2) return null;
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let want = total * t;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (want <= d) {
        const r = d > 0 ? want / d : 0;
        return {
          x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * r,
          y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * r,
          a: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]),
        };
      }
      want -= d;
    }
    const n = pts.length;
    return { x: pts[n - 1][0], y: pts[n - 1][1], a: Math.atan2(pts[n - 1][1] - pts[n - 2][1], pts[n - 1][0] - pts[n - 2][0]) };
  }
  P.fieldLines = { monopoles: flMonopoles, fluxFn: flFlux, loops: flLoops, trace: flTrace, starts: flStarts, at: flAt };

  P.inkCtx = function (ctx, color) {
    return new Proxy(ctx, {
      set(t, k, v) {
        // 只换「线条」，不动填充：很多图形用深色填充画指针/表盘底、用白色填充画高光，
        // 连填充一起换会把它们染成一坨。
        if (k === 'strokeStyle' && isInk(v)) v = color;
        t[k] = v; return true;
      },
      get(t, k) {
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  };

  P.draw = function (ctx, it) {
    const d = SH[it.key];
    if (!d || !d.draw) return;
    it.size = Math.max(1, it.width || 3);          // 上游一律读 o.size 当线宽
    if (it.hasBorder == null) it.hasBorder = true;
    if (it.fillColor == null) it.fillColor = it.color || '#1b2433';
    if (it.fillAlpha == null) it.fillAlpha = 0.2;
    ctx.save();
    // 透明度：图形整体按需调淡，别把下面已经写好的板书盖住。
    // 放在 save() 之后、图形自己的 globalAlpha 之前 —— 图形内部若显式设了 alpha，会以它为准，
    // 但它 save/restore 回来时仍然回到这里的基值。
    if (it.opacity != null && it.opacity < 1) ctx.globalAlpha = Math.max(0, it.opacity);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = it.size;
    // 线型三档（实线 / 虚线 / 点划线）：样式段写 it.dashStyle，旧对象只有 it.dash 也能照旧显示。
    // 虚线/点划线的段长都按线宽算（跟原来一样），放大图形时疏密比例不变。
    const ds = it.dashStyle || (it.dash ? 'dashed' : 'solid');
    ctx.setLineDash(ds === 'solid' ? []
      : ds === 'center' ? [it.size * 6, it.size * 2.6, it.size * 1, it.size * 2.6]
        : [it.size * 2.6, it.size * 2.2]);
    ctx.strokeStyle = it.color || '#1b2433';
    // 旋转：绕用户框的中心转一圈。库里 101 个图形的几何全是绝对世界坐标、且都从 (x1,y1)-(x2,y2)
    // 这个框算出来，所以只要在入口转一次 ctx，每个 draw 函数都不用改 —— 这也是「以后新增的图形
    // 自动支持旋转」的原因（新图形只要走 P.draw 就带旋转）。
    if (it.rot) {
      // 旋转中心：老师指定过就绕它转（磁场里的圆绕圆心外的一点转很常见），否则绕用户框中心。
      const p = (GW.pivotOf && GW.pivotOf(it)) || { x: (it.x1 + it.x2) / 2, y: (it.y1 + it.y2) / 2 };
      ctx.translate(p.x, p.y); ctx.rotate(it.rot); ctx.translate(-p.x, -p.y);
    }
    // 1.1.8：动画图形一律裁到自己的包围盒（= 选中时那条虚线框）。上游有几个图形在
    // 「运动到画框外」时仍然往画布上画（抛体飞出去、滑块冲出斜面），而实时层只清
    // 虚线框那几块矩形 —— 框外那几笔擦不掉，看起来就是「运动出框后在画布上留痕」。
    // 裁掉之后：框外永远干净，物体走到框边就自然被切掉。
    if (d.animatable) {
      const bb = P.bbox(it);
      if (bb && bb.w > 0 && bb.h > 0) {
        ctx.beginPath(); ctx.rect(bb.x, bb.y, bb.w, bb.h); ctx.clip();
      }
    }
    const prevCur = GH.cur, prevT = PB.animState.t;
    GH.cur = it;
    PB.animState.t = it.animT != null ? it.animT : ANIM_T;
    PB.animState.playing = !!it.animPlaying;
    // 用户在底栏调色板挑了颜色 ⇒ 把图形里的中性墨色统一换成它（图形自己写死的
    // '#15171a' 之类会覆盖掉外层的 strokeStyle，这就是「轮廓线条改色不生效」的根因）。
    // 强调色（红重合线、蓝零线、橙色指针）三通道差大，不会被换掉。
    // 例外：「深色卡片 + 深色画布」的图形（表盘、磁聚焦、斜面两件）本来就是浅墨画在深底上，
    // 换成老师挑的任意色可能直接看不见 —— 这几种保持原配色。
    const emd = SH[it.key];
    const skipInk = !!(emd && emd.em && emd.base === 'dark' && GW.isDarkBg());
    const c2 = (!skipInk && it.color && it.color !== '#1b2433') ? P.inkCtx(ctx, it.color) : ctx;
    try {
      d.draw(c2, it, GH);
    } finally {
      GH.cur = prevCur;
      PB.animState.t = prevT;
      ctx.restore();
    }
  };

  // 量包围盒用的假 ctx：只记坐标，不碰像素。带 2×3 矩阵（上游有 2 处 translate+rotate），
  // 圆/椭圆沿绘制方向采样 32 段（上游大量用半圆画立体图，取 4 个极值点会漏）。
  const TAU = Math.PI * 2;
  let _mctx = null;
  function measureWidth(font, text) {
    try {
      if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
      _mctx.font = font || '10px sans-serif';
      return _mctx.measureText(text).width;
    } catch (e) { return String(text).length * 6; }
  }
  function Meas() {
    this.m = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.x1 = Infinity; this.y1 = Infinity; this.x2 = -Infinity; this.y2 = -Infinity;
    this.strokeStyle = '#000'; this.fillStyle = '#000'; this.lineWidth = 1;
    this.globalAlpha = 1; this.lineCap = 'butt'; this.lineJoin = 'miter'; this.miterLimit = 10;
    this.font = '10px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic';
    this.shadowBlur = 0; this.shadowColor = '#000'; this.filter = 'none';
    this.lineDashOffset = 0; this.globalCompositeOperation = 'source-over';
    // 裁剪盒（clip 的路径包围盒求交）与当前路径的包围盒；maxLW 记「这次空跑里用过的最粗线宽」
    this.maxLW = 1; this._clip = null; this._pb = null; this._cur = null; this._sub = null;
  }
  const M = Meas.prototype;
  // 线宽可能是 draw 里自己拍的（彩虹弧 arcW≈13.8、条纹阴影等），不是 it.width；
  // 包围盒的外扩容差要按真正用过的最大线宽算，否则粗笔画会露到虚线框外。
  Object.defineProperty(M, 'lineWidth', {
    configurable: true,
    get() { return this._lw === undefined ? 1 : this._lw; },
    set(v) {
      const n = +v;
      this._lw = isFinite(n) && n >= 0 ? n : 1;
      if (!(this.maxLW >= this._lw)) this.maxLW = this._lw;
    },
  });
  M._tx = function (x, y) {
    const m = this.m;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  };
  M._pt = function (x, y) {
    const p = this._tx(x, y);
    this._emit({ x1: p[0], y1: p[1], x2: p[0], y2: p[1] });
  };
  // 路径顶点：只进当前路径的框，等 stroke/fill 时才计入总框（裁剪路径本身不该被算进去）
  M._pv = function (x, y) {
    const p = this._tx(x, y);
    if (!this._pb) this._pb = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
    const b = this._pb;
    if (isFinite(p[0]) && isFinite(p[1])) {
      if (p[0] < b.x1) b.x1 = p[0];
      if (p[0] > b.x2) b.x2 = p[0];
      if (p[1] < b.y1) b.y1 = p[1];
      if (p[1] > b.y2) b.y2 = p[1];
    }
    return p;
  };
  // 真正落笔的框：先与裁剪盒求交，被 clip 裁掉的部分不算墨迹
  M._emit = function (b) {
    if (!b || !isFinite(b.x1) || !isFinite(b.y1)) return;
    let x1 = b.x1, y1 = b.y1, x2 = b.x2, y2 = b.y2;
    const c = this._clip;
    if (c) {
      if (!isFinite(c.x1) || x2 < c.x1 || x1 > c.x2 || y2 < c.y1 || y1 > c.y2) return;
      if (x1 < c.x1) x1 = c.x1;
      if (x2 > c.x2) x2 = c.x2;
      if (y1 < c.y1) y1 = c.y1;
      if (y2 > c.y2) y2 = c.y2;
    }
    if (x1 < this.x1) this.x1 = x1;
    if (x2 > this.x2) this.x2 = x2;
    if (y1 < this.y1) this.y1 = y1;
    if (y2 > this.y2) this.y2 = y2;
  };
  M._mul = function (n) {
    const m = this.m;
    this.m = [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  };
  M.save = function () {
    this.stack.push({
      m: this.m.slice(), font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline,
      fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha,
      clip: this._clip,
    });
  };
  M.restore = function () {
    const s = this.stack.pop();
    if (!s) return;
    this.m = s.m; this.font = s.font; this.textAlign = s.textAlign; this.textBaseline = s.textBaseline;
    this.fillStyle = s.fillStyle; this.strokeStyle = s.strokeStyle; this.lineWidth = s.lineWidth; this.globalAlpha = s.globalAlpha;
    this._clip = s.clip;
  };
  M.setTransform = function (a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; };
  M.resetTransform = function () { this.m = [1, 0, 0, 1, 0, 0]; };
  M.translate = function (x, y) { this._mul([1, 0, 0, 1, x, y]); };
  M.scale = function (x, y) { this._mul([x, 0, 0, y, 0, 0]); };
  M.rotate = function (a) { const c = Math.cos(a), s = Math.sin(a); this._mul([c, s, -s, c, 0, 0]); };
  M.transform = function (a, b, c, d, e, f) { this._mul([a, b, c, d, e, f]); };
  M.beginPath = function () { this._pb = null; this._cur = null; this._sub = null; };
  M.closePath = function () {
    if (!this._sub) return;
    this._pv(this._sub[0], this._sub[1]);
    this._cur = [this._sub[0], this._sub[1]];
  };
  M.moveTo = function (x, y) { this._pv(x, y); this._cur = [x, y]; this._sub = [x, y]; };
  M.lineTo = function (x, y) { this._pv(x, y); this._cur = [x, y]; };
  // 控制点不等于曲线上的点：按 12 段采样，包围盒才贴住真实墨迹（贝塞尔的控制点常鼓出曲线一大截）
  M.quadraticCurveTo = function (cx, cy, x, y) {
    const p0 = this._cur || [cx, cy];
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      this._pv(u * u * p0[0] + 2 * u * t * cx + t * t * x, u * u * p0[1] + 2 * u * t * cy + t * t * y);
    }
    this._cur = [x, y];
  };
  M.bezierCurveTo = function (ax, ay, bx, by, ex, ey) {
    const p0 = this._cur || [ax, ay];
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
      this._pv(b0 * p0[0] + b1 * ax + b2 * bx + b3 * ex, b0 * p0[1] + b1 * ay + b2 * by + b3 * ey);
    }
    this._cur = [ex, ey];
  };
  M.rect = function (x, y, w, h) {
    this._pv(x, y); this._pv(x + w, y); this._pv(x + w, y + h); this._pv(x, y + h);
    this._cur = [x, y]; this._sub = [x, y];
  };
  M.arc = function (cx, cy, r, a0, a1, ccw) {
    if (!(r >= 0)) return;
    let span = a1 - a0;
    if (ccw) { if (span > 0) span -= TAU * Math.ceil(span / TAU); }
    else if (span < 0) span += TAU * Math.ceil(-span / TAU);
    if (Math.abs(span) >= TAU - 1e-6) span = span < 0 ? -TAU : TAU;
    const n = Math.max(8, Math.min(48, Math.ceil(Math.abs(span) / (Math.PI / 16))));
    for (let i = 0; i <= n; i++) { const a = a0 + (span * i) / n; this._pv(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    this._cur = [cx + r * Math.cos(a0 + span), cy + r * Math.sin(a0 + span)];
  };
  M.ellipse = function (cx, cy, rx, ry, rot, a0, a1, ccw) {
    const co = Math.cos(rot || 0), si = Math.sin(rot || 0);
    let span = a1 - a0;
    if (ccw) { if (span > 0) span -= TAU * Math.ceil(span / TAU); }
    else if (span < 0) span += TAU * Math.ceil(-span / TAU);
    if (Math.abs(span) >= TAU - 1e-6) span = span < 0 ? -TAU : TAU;
    // 满圆/大弧不能只取 (±R,±R) 两个角：local 坐标里的角点经过 rotate() 会被放大到 √2 倍，
    // 这就是「原子结构」框比图形大 55px 的来源。按弧长采样 32 段。
    const n = Math.max(16, Math.min(64, Math.ceil(Math.abs(span) / (Math.PI / 16))));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (span * i) / n;
      const px = rx * Math.cos(a), py = ry * Math.sin(a);
      this._pv(cx + px * co - py * si, cy + px * si + py * co);
    }
    const ea = a0 + span, epx = rx * Math.cos(ea), epy = ry * Math.sin(ea);
    this._cur = [cx + epx * co - epy * si, cy + epx * si + epy * co];
  };
  M.arcTo = function (x1, y1, x2, y2) { this._pv(x1, y1); this._pv(x2, y2); this._cur = [x2, y2]; };
  M.roundRect = function (x, y, w, h, r) {
    const rr = Math.min(typeof r === 'number' ? r : (r && r[0]) || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    this._pv(x + rr, y); this._pv(x + w - rr, y); this._pv(x + w, y + rr);
    this._pv(x + w, y + h - rr); this._pv(x + w - rr, y + h); this._pv(x + rr, y + h);
    this._pv(x, y + h - rr); this._pv(x, y + rr);
    this._cur = [x, y + rr];
  };
  // 裁剪：把 clip 路径的包围盒与已有裁剪盒求交；随后 stroke/fill 出来的框都夹在里面
  M.clip = function () {
    const pb = this._pb;
    if (!pb || !isFinite(pb.x1) || !isFinite(pb.y1)) return;
    const c = this._clip;
    this._clip = c
      ? { x1: Math.max(c.x1, pb.x1), y1: Math.max(c.y1, pb.y1), x2: Math.min(c.x2, pb.x2), y2: Math.min(c.y2, pb.y2) }
      : { x1: pb.x1, y1: pb.y1, x2: pb.x2, y2: pb.y2 };
  };
  M.fill = function () { this._emit(this._pb); };
  M.stroke = function () { this._emit(this._pb); };
  M.fillRect = function (x, y, w, h) { this.beginPath(); this.rect(x, y, w, h); this._emit(this._pb); };
  M.strokeRect = M.fillRect;
  M.clearRect = function () {};
  M.setLineDash = function () {}; M.getLineDash = function () { return []; };
  M.createLinearGradient = function () { return { addColorStop() {} }; };
  M.createRadialGradient = function () { return { addColorStop() {} }; };
  M.createPattern = function () { return null; };
  M.drawImage = function () {};
  M.measureText = function (t) { return { width: measureWidth(this.font, t) }; };
  M.fillText = function (t, x, y) {
    const str = t == null ? '' : String(t);
    if (!str) return;
    const size = (parseFloat((this.font || '10px').match(/([\d.]+)px/)?.[1]) || 10);
    const w = this.measureText(str).width;
    const al = this.textAlign;
    const dx = al === 'center' ? w / 2 : (al === 'right' || al === 'end' ? w : 0);
    const base = this.textBaseline;
    const top = base === 'top' ? 0 : base === 'middle' ? -size * 0.5 : base === 'bottom' ? -size : -size * 0.8;
    this._pt(x - dx, y + top);
    this._pt(x - dx + w, y + top + size);
  };
  M.strokeText = M.fillText;

  // 量尺沙箱：动画里的「积分型」图形（滚球 / 单摆 / 弹簧小车…）把 lastT 记在对象上（`o._ringState`）
  // 或 window 上的 WeakMap 里（`__ssbStates` 等 6 张表），每次 draw 用 `dTau = (AN.t - S.lastT)` 推进。
  // 而量包围盒要真跑一遍 draw —— 这一遍会把本帧的 dt 吃掉、lastT 推到当前时刻，
  // 紧接着给实时层的那次真绘制算出 dTau≈0，于是永远停在起始姿态（实测 6 个动画图形里 3 个不动）。
  // 所以量的时候把状态摘掉、WeakMap 换成空的：上游会以「当前时刻」新建一份初始状态（dTau=0），
  // 量完再把原状态原样挂回去，真绘制的状态一点都不受影响。
  const STATE_MAPS = ['__ssbStates', '__sprCartStates', '__pdStates', '__sb5States', '__satStates', '__projStates'];
  function withDetachedState(it, fn) {
    const saved = [];
    for (const k of Object.keys(it)) {
      if (k.charAt(0) === '_') { saved.push([k, it[k]]); delete it[k]; }
    }
    const maps = [];
    for (const name of STATE_MAPS) {
      const wm = window[name];
      if (wm && typeof wm.get === 'function') { maps.push([name, wm]); window[name] = new WeakMap(); }
    }
    try {
      return fn();
    } finally {
      for (const [name, wm] of maps) window[name] = wm;
      for (const [k, v] of saved) it[k] = v;
    }
  }

  /* 1.1.7：电磁学这批图的墨迹框直接数像素（离线画一次，按 key+参数+线宽缓存）。
     为什么不用 Meas：这批图里有 clip 矩形、透明填充、渐变垫片这类「看不见的几何」，
     量尺会把它们当成墨迹，虚线框于是比图形大一圈（电压表实测四边各多 50~85px）。
     数像素得到的是**真轮廓**，正好满足「虚线框严格贴着图形边界」。
     代价：每个参数组合离屏画一次（900×613 约 5ms），只在选中/改参数时发生，结果进 MBOX 缓存。 */
  const EMB = new Map();
  function emInkBox(d, it) {
    const ks = d.params || [];
    // 量尺必须在**实例尺寸**下跑。设计坐标是 dw×dh，真实绘制时按 ls=min(bw/dw, bh/dh) 等比缩放
    // 并居中；线宽、字号、端帽在缩放后与设计空间并不等价 —— 实测「电压表改装」836→418 时右侧
    // 接线柱比设计空间量测值多出 10px（虚线框框不住），而 1:1 时又把看不见的几何量成 800 宽
    // （框比墨迹大 130px）。把 proto 直接摆到 0..bw × 0..bh 上画，量到的就是屏幕上那份几何。
    const bw = Math.max(1, Math.abs(it.x2 - it.x1)), bh = Math.max(1, Math.abs(it.y2 - it.y1));
    let sig = d.key + '|' + (it.width || 3) + '|' + Math.round(bw) + 'x' + Math.round(bh) + '|';
    for (let i = 0; i < ks.length; i++) sig += it[ks[i]] + ',';
    // 动画图形：粒子会甩出静态轮廓，取四个时刻的并集，别让虚线框随着播放抖。
    if (d.animatable) sig += 'anim';
    let rel = EMB.get(sig);
    if (rel) return rel;
    // 超大实例按比例降采样量（4096 上限），再按 k 换算回实例坐标；k=1 时与逐像素等价。
    const k = Math.min(1, 4096 / Math.max(bw, bh));
    const M = 24, W = Math.ceil(bw * k) + M * 2, H = Math.ceil(bh * k) + M * 2;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    // 直接调 d.draw、传一个假的 G（不能走 P.draw —— 那是按用户框算的）。
    const box = { x: 0, y: 0, x1: 0, y1: 0, x2: bw, y2: bh, w: bw, h: bh, cx: bw / 2, cy: bh / 2 };
    const G = { box: () => box, bbox: () => box, cur: it, t: 0 };
    const proto = Object.create(it);
    proto.x1 = 0; proto.y1 = 0; proto.x2 = bw; proto.y2 = bh; proto.rot = 0;
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    const scan = () => {
      const im = ctx.getImageData(0, 0, W, H).data;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (im[(y * W + x) * 4 + 3] > 8) {
            if (x < x1) x1 = x; if (x > x2) x2 = x;
            if (y < y1) y1 = y; if (y > y2) y2 = y;
          }
        }
      }
    };
    const prevT = it.animT;
    try {
      const times = d.animatable ? [0, 0.25, 0.5, 0.75] : [0];
      for (const tt of times) {
        if (d.animatable) it.animT = tt * (ANIM_T || 0.6);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.save(); ctx.translate(M, M); if (k !== 1) ctx.scale(k, k);
        withDetachedState(it, () => { try { d.draw(ctx, proto, G); } catch (e) { /* 量不到就退回用户框 */ } });
        ctx.restore();
      }
      scan();
    } finally { it.animT = prevT; }
    if (x1 > x2) { EMB.set(sig, null); return null; }
    // 像素坐标 → 实例坐标（扣掉 M 与降采样系数 k）；+0.5 把抗锯齿的半像素补上
    rel = { dx: (x1 - M) / k - 0.5, dy: (y1 - M) / k - 0.5, dw: (x2 - x1 + 1) / k, dh: (y2 - y1 + 1) / k };
    if (EMB.size > 200) EMB.clear();
    EMB.set(sig, rel);
    return rel;
  }

  function measureBox(it) {
    const d = SH[it.key];
    const lw = Math.max(1, it.width || 3);
    // 自带整幅底板的图形（phys-em 里那批「纸/仪表盘」）：墨迹实测正好是设计画布的 0..dw × 0..dh，
    // 铺满用户框、一像素都不越界（em 探针 11 个逐个数过）。这种图不能用「最大线宽的一半」往外扩：
    // 它们是在 scale(s) 里画的，线宽是设计单位，扩出来的虚线框会比白纸底板大 5~7px。
    if (d && d.fillsFrame) {
      const x1 = Math.min(it.x1, it.x2), y1 = Math.min(it.y1, it.y2);
      const x2 = Math.max(it.x1, it.x2), y2 = Math.max(it.y1, it.y2);
      if (x2 - x1 > 0 && y2 - y1 > 0) return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    // 1.1.7：电磁学图形按真实墨迹量（见 emInkBox 的注释）
    if (d && d.em) {
      const ib = emInkBox(d, it);
      if (ib) {
        // emInkBox 现在按**实例尺寸**量（见其注释），返回值已经是实例坐标，直接落位即可。
        const mx = Math.min(it.x1, it.x2), my = Math.min(it.y1, it.y2);
        return { x: mx + ib.dx, y: my + ib.dy, w: ib.dw, h: ib.dh };
      }
    }
    const m = new Meas();
    m.strokeStyle = it.color || '#1b2433';
    m.lineWidth = lw;
    if (d && d.draw) {
      // 量尺自己出错时退回用户框：绝不让整块画布因为没有包围盒而白屏
      const keepT = it.animT;
      const times = (d.animatable || P.isAnim(it)) ? [0, 0.25, 0.5, 0.75] : [0];
      try {
        for (const tt of times) {
          if (times.length > 1) it.animT = tt * (ANIM_T || 0.6);
          withDetachedState(it, () => {
            try { d.draw(m, it, GH); } catch (e) { /* ignore */ }
          });
        }
      } finally { it.animT = keepT; }
    }
    let x1 = m.x1, y1 = m.y1, x2 = m.x2, y2 = m.y2;
    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) {
      x1 = Math.min(it.x1, it.x2); y1 = Math.min(it.y1, it.y2);
      x2 = Math.max(it.x1, it.x2); y2 = Math.max(it.y1, it.y2);
    }
    // 1.1.7 把 +2 收到 +1「让虚线框贴得更紧」；实测 232 个 pb 图形里有 3 个文字贴边的
    // （活塞—pV 过程图、活塞—p1/V 图）会露出 3px —— 差的这一像素正是字形抗锯齿的边，
    // 虚线框压在字上肉眼可见「框不住」。恢复 +2：代价是小图形框大 1px，收益是文字不被切。
    // 图形可以自己声明「量尺量不全」的外扩（设计坐标里量不到的部分，例如文字用到的字体
    // 在离屏量尺与主画布上度量不一致）。目前只有「电压表改装」用到：418 宽时右侧接线柱
    // 比量测值多出 9.6px，虚线框框不住。
    const pad = Math.max(lw, m.maxLW) / 2 + 2 + (d && +d.padBBox > 0 ? +d.padBBox * Math.min(1, Math.abs(it.x2 - it.x1) / (d.dw || 1)) : 0);
    return { x: x1 - pad, y: y1 - pad, w: (x2 - x1) + pad * 2, h: (y2 - y1) + pad * 2 };
  }
  P.measure = measureBox;
  // 量尺结果按「图形 + 尺寸 + 参数」缓存：拖动 / 缩放时尺寸不变，外接框只是平移，
  // 不必每帧再拿假 ctx 空跑一遍 draw（复杂图形空跑一次要 3~17ms，拖动时就是卡顿的来源）。
  const rotBox = (b, cx, cy, rot) => {
    if (!rot) return b;
    const c = Math.cos(rot), s = Math.sin(rot);
    const q = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let i = 0; i < 4; i++) {
      const dx = q[i][0] - cx, dy = q[i][1] - cy;
      const rx = cx + dx * c - dy * s, ry = cy + dx * s + dy * c;
      if (rx < x1) x1 = rx; if (rx > x2) x2 = rx;
      if (ry < y1) y1 = ry; if (ry > y2) y2 = ry;
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };
  const MBOX = new Map();
  const PARAM_KEYS = new Map();   // key → 参数名清单（缓存签名用，避免每帧重建数组）
  P.bbox = function (it) {
    const w = Math.abs(it.x2 - it.x1), h = Math.abs(it.y2 - it.y1);
    const cx = (it.x1 + it.x2) / 2, cy = (it.y1 + it.y2) / 2, rot = it.rot || 0;
    // 旋转中心打开时，外接框也必须绕同一个点转（不然虚线框贴在原地、图形转走了）
    const pv = GW.pivotOf && GW.pivotOf(it);
    const rx = pv ? pv.x : cx, ry = pv ? pv.y : cy;
    // 动画图形每帧都在动，量出来的外接框随时会变；直接用「用户框 + 6px」，
    // 省掉每帧那次空跑 —— 动画每帧的成本因此只剩一次真绘制。
    // 1.1.7：动画图形也照量（量的时候取 t=0/.25/.5/.75 四个时刻的并集，缓存在 MBOX 里，
    // 所以虚线框不会每帧抖）。这样「虚线框贴着图形轮廓」对动画图形、对以后新增的图形一样成立。
    // 量不出来（路径型/草图那种画不成有限墨迹的）再退回「用户框 + 6」。
    if (P.isAnim(it) && !(SH[it.key] && (SH[it.key].em || SH[it.key].geom === 'path'))) { /* 继续往下量 */ }
    // 缓存签名必须带上**所有参数与精确线宽**：倾角一变，画出来的高度就变（斜面、单摆、透镜…），
    // 旧签名只认 key/框/线宽整数，于是改了参数还拿上一份包围盒 —— 选中虚线框会和图形边缘错开。
    // 参数是平铺在对象上的（it.theta…），原来读的 it.params 永远不存在，等于参数完全不参与签名。
    let ks = PARAM_KEYS.get(it.key);
    if (!ks) { ks = ((SH[it.key] && SH[it.key].params) || []).slice(); PARAM_KEYS.set(it.key, ks); }
    let ps = '';
    for (let i = 0; i < ks.length; i++) ps += '|' + it[ks[i]];
    const sig = it.key + '|' + w.toFixed(2) + '|' + h.toFixed(2) + '|' + it.width + '|' + (it.dashStyle || '') + ps;
    let rel = it.__mSig === sig ? it.__mRel : MBOX.get(sig);
    if (!rel) {
      const b = measureBox(it);
      rel = { x: b.x - it.x1, y: b.y - it.y1, w: b.w, h: b.h };
      if (MBOX.size > 400) MBOX.clear();
      MBOX.set(sig, rel);
    }
    it.__mSig = sig; it.__mRel = rel;
    return rotBox({ x: it.x1 + rel.x, y: it.y1 + rel.y, w: rel.w, h: rel.h }, rx, ry, rot);
  };

  // 参数面板用：改一个参数就重算包围盒并重画（参数一变，画出来的范围常常变）
  P.setParam = function (it, key, v) {
    if (!it) return;
    it[key] = v;
    GW.invalidate(it);
    GW.requestRender();
  };

  // 自检用：把每个图形都真画一遍，返回画不出来的 key（探针里断言为空）
  P.selfCheck = function () {
    let cv = null;
    try { cv = document.createElement('canvas'); cv.width = 300; cv.height = 200; } catch (e) { return { ok: false, errors: [], reason: 'no-canvas' }; }
    const ctx = cv.getContext('2d');
    const errors = [];
    for (const k in SH) {
      const d = SH[k];
      if (!d || !d.draw || d.hidden || d.cat === 'text' || d.geom === 'path') continue;
      const it = P.make(k, 0, 0, 240, 160);
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, 300, 200);
        P.draw(ctx, it);
        const b = P.bbox(it);
        if (!(b.w > 0 && b.h > 0)) errors.push({ key: k, why: 'empty-bbox' });
      } catch (e) {
        errors.push({ key: k, why: String(e && e.message || e) });
      }
    }
    return { ok: errors.length === 0, errors: errors };
  };

  // ---------- 动画（上游 16 个 anim 图形的秒数从这里来） ----------
  // 上游每个 anim 图形都读 window.TangBoBoard.animState.t（秒）；单摆 / 滚环 / 弹簧振子那类
  // 还拿 t 跟自己的 lastT 做积分（dT > 0.5 视为切回前台、丢掉这一帧）。所以只要让 t 单调增长、
  // 每帧把图形重画一遍，动画就成立 —— 这里不改上游一个字符。
  //
  // 为什么画在**实时层**而不是墨迹层：墨迹层是「一帧画完就静止」的静态位图，每帧重画整块会把
  // 书写/拖动/缩放全都拖慢。实时层本来就是一帧一清一画的（荧光笔、选区高亮都在这一层），
  // 而且 board.js 只清「上一帧报告过的矩形」（liveRectOf / liveDirty）。于是：
  //   没有动画图形 → 这个绘制函数立刻 return false，连一帧都不会多排；
  //   有动画图形 → 只画视口里那几个，用 info.mark 报范围，实时层只清这几块。
  // 节流：画一帧的耗时超过 10ms 就隔帧画、超过 16ms 每三帧画一次（空转帧只把上一帧的矩形
  // 报回去，实时层不会因为「这一帧没画」被 setLiveShown 藏掉）。
  //
  // 与墨迹层不打架：动画图形在墨迹层里被跳过（P.skipInk），否则静止的旧帧会和动画帧叠成两个重影；
  // 导出时用 P.setFrozen(true) 顶一下，墨迹层照旧把它们画进导出物。
  // 动画按**对象**控制（与上游原版一致）：每个图形有自己的 animT（秒）/ animPlaying / animSpeed，
  // 全局按钮只是「全部播放 / 全部暂停 / 全部归零」的批量操作。A.playing 保留为总闸，
  // 外部（旧探针）仍可用 PS.setPlaying(false) 一次停住所有动画。
  const A = P.anim = { playing: true, frozen: 0, last: 0, tick: 0, cost: 0, items: [], dirty: true, needRepaint: false };
  // 2.0.9：扩展模型库的图形有的「按参数决定能不能动」（例如扫描电压关掉就是一张静态图），
  // 它们的 def 上带 canAnimate(o)。这里把它当成 animatable 的第二道条件。
  P.isAnim = (it) => {
    const d = it && it.type === 'pb' ? SH[it.key] : null;
    if (!d || !d.animatable) return false;
    if (typeof d.canAnimate !== 'function') return true;
    try { return !!d.canAnimate(it); } catch (e) { return true; }
  };
  // 2.0.9：扩展模型库的图形可自带整段时间轴（def.animationTimeline(o) → {duration, events, pauseAtEvents}）。
  // 上游宿主用它做两件事：播到头就停住、再按播放从头来；以及播到关键时刻自动暂停。
  // 本工程没有时间轴面板（那属于上游宿主 UI，未迁移），但这两条语义要保留 ——
  // 否则动画里的 Math.min(t, T) 会永久冻在末帧，按播放也回不到开头。
  function animTimelineOf(d, it) {
    if (!d || typeof d.animationTimeline !== 'function') return null;
    try {
      const tl = d.animationTimeline(it);
      return tl && isFinite(tl.duration) && tl.duration >= 0 ? tl : null;
    } catch (e) { return null; }
  }
  P.animTimelineOf = animTimelineOf;
  P.ensureAnim = function (it) {
    if (typeof it.animT !== 'number') it.animT = ANIM_T;      // 静止帧取 0.6s：抛体的轨迹才看得见
    if (typeof it.animSpeed !== 'number') {
      const slow = it.key === 'pendulum' || it.key === 'conveyor' || it.key === 'springOscillator' ||
        it.key === 'springOscV' || it.key === 'twoBlocksSpring' || it.key === 'blockOnBoard' || it.key === 'connectorBlocks';
      const dfn = SH[it.key];
      it.animSpeed = (dfn && typeof dfn.animSpeed === 'number') ? dfn.animSpeed : (slow ? 0.25 : 1);
    }
    if (typeof it.animPlaying !== 'boolean') it.animPlaying = false;  // 1.1.8：缺字段的老板书也先停住
    return it;
  };
  P.skipInk = (it) => !!(it && it.__animLive && it.animPlaying && !A.frozen);

  function animItems() {
    A.dirty = false;
    const page = GW.page(), list = [];
    const ink = (page && page.ink) || [];
    for (const it of ink) {
      if (it.__animLive) delete it.__animLive;
      if (P.isAnim(it)) { P.ensureAnim(it); it.__animLive = true; list.push(it); }
    }
    A.items = list;
    if (list.length) A.needRepaint = true;   // 让墨迹层重画一次，把静止的旧帧擦掉（跳过这些图形）
    return list;
  }
  const animDirty = () => { A.dirty = true; };
  const animRepaint = () => {
    animDirty();
    if (GW.requestRender) GW.requestRender();
    if (GW.requestLive) GW.requestLive();
  };
  if (GW.bus && GW.bus.on) {
    GW.bus.on('history', animDirty);
    // 1.1.8：换页 / 打开板书也不自动播 —— 停在当前 animT（不是归零），老师按播放才走。
    // 本页以外的页面本来就画不到，所以只处理当前页那几个。
    GW.bus.on('page', function () {
      const list = animItems();
      for (const it of list) it.animPlaying = false;
      animRepaint();
    });
  }

  // 视口剔除（世界坐标）。注意 GW.camera 里是 tx/ty（不是 x/y）：
  // toWorld 的公式就是 (sx - tx) / s，所以视口左上角的世界坐标是 (-tx/s, -ty/s)。
  function animInView(b) {
    const c = GW.camera;
    const x1 = -c.tx / c.s, y1 = -c.ty / c.s;
    const x2 = x1 + innerWidth / c.s, y2 = y1 + innerHeight / c.s;
    return b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1;
  }

  let animMarks = [];
  function animDraw(ctx, info) {
    if (A.frozen || document.hidden) return false;
    const list = A.dirty ? animItems() : A.items;
    if (!list.length) return false;
    if (A.needRepaint) { A.needRepaint = false; GW.requestRender(); }
    const now = performance.now();
    if (!A.last) A.last = now;
    let dt = (now - A.last) / 1000;
    A.last = now;
    if (!(dt >= 0) || dt > 0.25) dt = 1 / 60;
    // 每个对象推进自己的时间轴：暂停的那个不动，其余照常走；速度按 animSpeed 缩放。
    let moving = 0;
    for (const it of list) {
      if (!it.animPlaying) continue;
      const prevT = it.animT || 0;
      let nextT = prevT + dt * (it.animSpeed || 1);
      // 1.7.12：图形可自带节拍夹停（电磁振荡「每 N 周期自动暂停」）；其余图形不受影响。
      const d = SH[it.key];
      if (d && typeof d.animGate === 'function') nextT = d.animGate(it, prevT, nextT);
      const tl = animTimelineOf(d, it);
      if (tl) {
        const ev = tl.pauseAtEvents
          ? (tl.events || []).find((e) => e.t > prevT + 1e-8 && e.t <= tl.duration) : null;
        const stop = ev ? ev.t : tl.duration;
        if (nextT >= stop) { nextT = stop; it.animPlaying = false; }
      }
      it.animT = nextT;
      if (!it.animPlaying) A.needRepaint = true;   // 夹停当帧交回墨迹层重画静止帧
      moving++;
    }
    A.playing = moving > 0;               // A.playing 只是「现在有没有东西在动」的镜像
    if (!moving) return false;            // 全暂停 ⇒ 交回墨迹层画静止帧

    A.tick++;
    // 注意：这里不要做「隔帧不画」。实时层每帧会先清掉上一帧的脏矩形，
    // 跳过绘制的那一帧会被清成空白，动画反而一闪一闪；省成本要靠上面的包围盒缓存。
    const t0 = performance.now();
    animMarks = [];
    let drew = 0;
    for (const it of list) {
      const b = P.bbox(it);
      if (!animInView(b)) continue;
      ctx.save();
      try { P.draw(ctx, it); } finally { ctx.restore(); }
      const m = [b.x - 2, b.y - 2, b.x + b.w + 4, b.y + b.h + 4];
      animMarks.push(m); info.mark(m[0], m[1], m[2], m[3]);
      drew++;
    }
    const cost = performance.now() - t0;
    A.cost = A.cost * 0.88 + cost * 0.12;
    return drew > 0;
  }
  P.animDraw = animDraw;
  if (GW.live && GW.live.add) GW.live.add(animDraw);

  // 时间/播放状态一变就重排一帧：暂停时墨迹层要画出静止帧（skipInk 变假），继续时实时层要接管。
  function afterAnimChange() {
    A.last = 0; A.tick = 0; A.cost = 0; A.dirty = true; A.playing = P.anyPlaying();
    GW.requestRender();
    GW.requestLive();
    if (GW.selection && GW.selection.render) GW.selection.render();
  }
  // 直接扫当前页：抽屉按钮、工具条按钮在还没开始画动画时也要拿到正确状态（A.items 是懒建的）
  P.anyPlaying = function () {
    const ink = (GW.page() && GW.page().ink) || [];
    for (const it of ink) if (P.isAnim(it) && it.animPlaying) return true;
    return false;
  };
  P.itemPlaying = (it) => !!(it && it.animPlaying);
  // 全部播放 / 全部暂停 / 全部归零（对应原版底栏的三个按钮与空格、R）
  P.playAll = function () { A.playing = true; for (const it of animItems()) it.animPlaying = true; afterAnimChange(); };
  P.pauseAll = function () { A.playing = false; for (const it of animItems()) it.animPlaying = false; afterAnimChange(); };
  P.toggleAll = function () { if (P.anyPlaying()) P.pauseAll(); else P.playAll(); };
  // 1.1.11：七图的静止帧是 ANIM_T（0.6s），不是 0 —— 它们在 t=0 时本来就在运动中途。
  // 重置必须回到「插进来时的那个姿态」，否则老师按重置反而看到图形跳一下。
  const SLOW_ANIM = { springOscillator: 1, springOscV: 1 };
  P.animHome = (it) => (it && SLOW_ANIM[it.key]) ? ANIM_T : 0;
  P.resetAll = function () { for (const it of animItems()) it.animT = P.animHome(it); afterAnimChange(); if (GW.toast) GW.toast('动画时间已归零'); };
  // 单个图形：工具条上的「播放 / 暂停」「重置」
  P.toggleItem = function (it) {
    if (!it) return;
    P.ensureAnim(it);
    // 播到末帧再按播放：从头来（上游 rewindModelAtEnd 的语义）
    if (!it.animPlaying) {
      const tl = animTimelineOf(SH[it.key], it);
      if (tl && (!isFinite(it.animT) || it.animT >= tl.duration)) it.animT = 0;
    }
    it.animPlaying = !it.animPlaying;
    A.last = 0;
    afterAnimChange();
  };
  P.resetItem = function (it) { if (!it) return; P.ensureAnim(it); it.animT = P.animHome(it); afterAnimChange(); };
  // 兼容旧接口：PS.setPlaying(false) 一次停住所有动画
  P.setPlaying = function (v) { if (v) P.playAll(); else P.pauseAll(); };
  P.setFrozen = function (on) { A.frozen = on ? (A.frozen | 0) + 1 : Math.max(0, A.frozen - 1); };
})();


