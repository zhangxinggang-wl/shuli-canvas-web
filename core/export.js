/* 数理无限画布 · 矢量导出（SVG / PDF）
 *
 * 设计要点（为什么这样写）：
 *  1) 与屏幕渲染同源。笔迹与图形不另写一套绘制代码，而是把 board.js 的
 *     GW.drawItem 原样跑一遍，只把 ctx 换成「记录器」，并把 window.Path2D
 *     换成「路径记录器」。导出结果 = 屏幕上看到的东西；以后给画布加新图元
 *     （新笔型、新箭头、新坐标系）也不用改这里。
 *  2) 背景底纹、手写笔迹、几何图形 → 真矢量（SVG path / PDF 内容流）。
 *  3) 文本框、公式、便签 → 按输出倍率重绘为可移植图像；
 *     PDF 按 1.5~4 倍像素渲染成位图，带透明软掩膜（SMask）贴上去。
 *  4) 图片 / PDF 页 / 仿真 / 视频 → 直接从元素上取像素光栅化后嵌入。
 *  5) 网页 / GeoGebra / SWF / 文件卡片这类「活」内容没法静态化，
 *     画一个带标题的虚线占位框 —— 印在纸上也知道这里原本是什么。
 *  6) PDF 自带生成器（不依赖任何库），内容流用 CompressionStream('deflate')
 *     生成 FlateDecode 流。坐标轴上的 'x' 'y' 'O' 等 ASCII 文字用标准字体
 *     Helvetica 画成真文字；含中文的才退化成小位图。
 */
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW) return;
  const h = GW.h;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const XHTMLNS = 'http://www.w3.org/1999/xhtml';
  const XLINK = 'http://www.w3.org/1999/xlink';

  // ============================================================
  // 0. 小工具
  // ============================================================
  const num = (v) => {
    const r = Math.round((v || 0) * 100) / 100;
    return (Object.is(r, -0) ? 0 : r).toString();
  };
  const q2 = (a) => {                       // 透明度量化到 1%，PDF 的 ExtGState 才能复用
    const v = (a == null || isNaN(a)) ? 1 : a;
    return Math.max(0, Math.min(1, Math.round(v * 100) / 100));
  };
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], red: [255, 0, 0, 1], transparent: [0, 0, 0, 0] };
  function parseColor(c) {
    if (c && typeof c === 'object' && c.r != null) return { r: c.r | 0, g: c.g | 0, b: c.b | 0, a: c.a == null ? 1 : c.a };
    if (typeof c !== 'string') return { r: 0, g: 0, b: 0, a: 1 };
    let s = c.trim().toLowerCase();
    if (s.charAt(0) === '#') {
      let hex = s.slice(1);
      if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
      if (/^[0-9a-f]{6}(?:[0-9a-f]{2})?$/.test(hex)) {
        const v = parseInt(hex.slice(0, 6), 16);
        return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, a: hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1 };
      }
    }
    const m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) {
      const p = m[1].split(',').map((t) => parseFloat(t));
      return { r: p[0] | 0, g: p[1] | 0, b: p[2] | 0, a: p.length > 3 ? p[3] : 1 };
    }
    if (NAMED[s]) return { r: NAMED[s][0], g: NAMED[s][1], b: NAMED[s][2], a: NAMED[s][3] };
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  // ---------- WP4：图案填充（SVG <pattern> / PDF 降级）----------
  // board.js 的 fillOf() 在 pattern 模式下交给记录器一个带 __fillSpec 的 tile；
  // P.createPattern 把它包装成 {__pattern, spec, id}。这里据此生成 SVG <pattern>，
  // 并把 spec 的主色/alpha 回填到 st.col/st.a —— PDF 内容流不支持 tile，
  // 于是自动降级成「图案主色的半透明纯色」，不黑、不透明、不静默丢弃。
  function specColorRgb(s) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String((s && s.color) || ''));
    if (m) { const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
    return [51, 102, 255];
  }
  function patternKey(s) {
    const raw = [s.kind, s.color, s.alpha, s.density, s.lineWidth, s.size].join('_');
    let h = 5381;
    for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function patternSvgDef(id, s) {
    const N = Math.max(4, Math.round(s.size || Math.max(2, Math.min(64, Number(s.density) || 8))));
    const rgb = specColorRgb(s);
    const col = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
    const sw = Math.max(0.4, Number(s.lineWidth) || 1);
    const a = s.alpha == null ? 1 : s.alpha;
    const ln = (x1, y1, x2, y2) => '<line x1="' + num(x1) + '" y1="' + num(y1) +
      '" x2="' + num(x2) + '" y2="' + num(y2) + '" stroke="' + col +
      '" stroke-width="' + num(sw) + '" stroke-opacity="' + num(a) + '"/>';
    let inner;
    if (s.kind === 'h') inner = ln(0, N / 2, N, N / 2);
    else if (s.kind === 'v') inner = ln(N / 2, 0, N / 2, N);
    else if (s.kind === 'cross') inner = ln(0, N / 2, N, N / 2) + ln(N / 2, 0, N / 2, N);
    else if (s.kind === 'dots') inner = '<circle cx="' + num(N / 2) + '" cy="' + num(N / 2) +
      '" r="' + num(Math.max(0.6, sw)) + '" fill="' + col + '" fill-opacity="' + num(a) + '"/>';
    else inner = ln(0, N, N, 0);   // hatch
    return '<pattern id="' + id + '" width="' + num(N) + '" height="' + num(N) +
      '" patternUnits="userSpaceOnUse">' + inner + '</pattern>';
  }
  function parseFont(s) {
    const o = { style: 'normal', weight: 'normal', size: 16, family: 'sans-serif' };
    const f = String(s || '');
    const m = /(\d+(?:\.\d+)?)px\s+(.+)$/.exec(f);
    if (m) { o.size = parseFloat(m[1]); o.family = m[2].trim(); }
    if (/\bitalic\b|\boblique\b/.test(f)) o.style = 'italic';
    if (/\bbold\b/.test(f)) o.weight = 'bold';
    return o;
  }
  let _measure = null;
  function measure(font, text) {
    try {
      if (!_measure) _measure = document.createElement('canvas').getContext('2d');
      _measure.font = font;
      return _measure.measureText(text);
    } catch (e) { return { width: String(text).length * 8 }; }
  }
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const rectOf = (o) => ({ x: o.x, y: o.y, w: o.w, h: o.h });

  // ---------- 仿射矩阵（1.6.0 G1） ----------
  // 记录器原来把 translate/scale/rotate 全写成空实现，而画布上的图形库恰恰靠 ctx 变换定位：
  // mathshapes 的 applyFrame（旋转）、board.js 的 flipDraw（镜像）。于是导出物里旋转和镜像直接丢了。
  // 现在记录器持有真矩阵，坐标在「落笔那一刻」就映射成最终值 —— SVG/PDF 两条链路都不用各写一遍。
  const M_ID = [1, 0, 0, 1, 0, 0];
  function mMul(m, n) {                     // 先 m 再 n（与 canvas 的后乘语义一致）
    return [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  }
  const isIdent = (m) => m === M_ID || (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0);
  const isAxisAligned = (m) => m[1] === 0 && m[2] === 0;
  const mapPt = (m, x, y) => (isIdent(m) ? [x, y] : [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  // 路径命令整段映射：仿射变换保持贝塞尔控制点关系，所以逐控制点映射就是精确的像
  function mapD(d, m) {
    if (isIdent(m)) return d.slice();
    const out = [];
    for (let i = 0; i < d.length;) {
      const t = d[i++];
      out.push(t);
      if (t === 'Z') continue;
      const n = t === 'C' ? 3 : (t === 'Q' ? 2 : 1);
      for (let j = 0; j < n; j++) {
        const x = d[i], y = d[i + 1];
        i += 2;
        out.push(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
      }
    }
    return out;
  }

  // 1×1 透明 PNG：位图取不到像素时的兜底，保证 /ImN Do 引用不悬空
  const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  // ============================================================
  // 1. 路径记录器（顶替 Path2D）
  // ============================================================
  // board.js 的 outlinePath / smoothPath / polyPath 都是 new Path2D()
  // 再 moveTo/lineTo/quadraticCurveTo/arc/closePath，这里原样接住。
  function Rec() { this.d = []; this._open = false; }
  Rec.prototype.moveTo = function (x, y) { this.d.push('M', x, y); this._open = true; };
  Rec.prototype.lineTo = function (x, y) { this.d.push('L', x, y); this._open = true; };
  Rec.prototype.quadraticCurveTo = function (cx, cy, x, y) { this.d.push('Q', cx, cy, x, y); this._open = true; };
  Rec.prototype.bezierCurveTo = function (a, b, c, d, e, f) { this.d.push('C', a, b, c, d, e, f); this._open = true; };
  Rec.prototype.closePath = function () { this.d.push('Z'); this._open = false; };
  Rec.prototype.rect = function (x, y, w, hh) {
    this.d.push('M', x, y, 'L', x + w, y, 'L', x + w, y + hh, 'L', x, y + hh, 'Z'); this._open = false;
  };
  Rec.prototype.arc = function (cx, cy, r, a0, a1, ccw) {
    if (!(r > 0)) return;
    // canvas 的 arc 会从当前点连一条直线到弧起点；没有当前点时，起点就是子路径的起点。
    // 少了这条 M，导出的 d 会以 C 开头，SVG 渲染器直接丢掉整条路径（圆、粒子点、圆弧都会消失）。
    if (this._open) this.d.push('L', cx + r * Math.cos(a0), cy + r * Math.sin(a0));
    else this.d.push('M', cx + r * Math.cos(a0), cy + r * Math.sin(a0));
    let dd = a1 - a0;
    if (ccw) { while (dd > 0) dd -= Math.PI * 2; } else { while (dd < 0) dd += Math.PI * 2; }
    if (Math.abs(dd) < 1e-9) dd = ccw ? -Math.PI * 2 : Math.PI * 2;
    const n = Math.max(1, Math.ceil(Math.abs(dd) / (Math.PI / 2)));
    const step = dd / n, kk = (4 / 3) * Math.tan(step / 4);
    let a = a0;
    for (let i = 0; i < n; i++) {
      const b = a + step;
      const x1 = cx + r * Math.cos(a), y1 = cy + r * Math.sin(a);
      const x2 = cx + r * Math.cos(b), y2 = cy + r * Math.sin(b);
      this.d.push('C',
        x1 - kk * r * Math.sin(a), y1 + kk * r * Math.cos(a),
        x2 + kk * r * Math.sin(b), y2 - kk * r * Math.cos(b), x2, y2);
      a = b;
    }
    this._open = true;
  };
  Rec.prototype.ellipse = function (cx, cy, rx, ry, rot, a0, a1, ccw) {
    // 带旋转的椭圆也要留下（物理图形库里有倾斜的轨道、斜放的线圈截面）
    const co = Math.cos(rot || 0), si = Math.sin(rot || 0);
    const f = (t) => {
      const px = rx * Math.cos(t), py = ry * Math.sin(t);
      return [cx + px * co - py * si, cy + px * si + py * co];
    };
    const p0 = f(a0);
    if (this._open) this.d.push('L', p0[0], p0[1]);
    else this.d.push('M', p0[0], p0[1]);
    let dd = a1 - a0;
    if (ccw) { while (dd > 0) dd -= Math.PI * 2; } else { while (dd < 0) dd += Math.PI * 2; }
    const n = Math.max(1, Math.ceil(Math.abs(dd) / (Math.PI / 2)));
    const step = dd / n, kk = (4 / 3) * Math.tan(step / 4);
    let a = a0;
    for (let i = 0; i < n; i++) {
      const b = a + step;
      const m1 = f(a), p1 = f(b);
      // 切向量也要一起旋转
      const t1x = -rx * Math.sin(a) * kk, t1y = ry * Math.cos(a) * kk;
      const t2x = -rx * Math.sin(b) * kk, t2y = ry * Math.cos(b) * kk;
      this.d.push('C',
        m1[0] + t1x * co - t1y * si, m1[1] + t1x * si + t1y * co,
        p1[0] - t2x * co + t2y * si, p1[1] - t2x * si - t2y * co, p1[0], p1[1]);
      a = b;
    }
    this._open = true;
  };
  Rec.prototype.roundRect = function (x, y, w, hh, r) {
    // 物理图形库大量用圆角矩形画器件外壳；导出器原来没有这个方法，一调就 TypeError
    const rr = Math.min(typeof r === 'number' ? r : (r && r[0]) || 0, Math.abs(w) / 2, Math.abs(hh) / 2);
    if (!(rr > 0)) return this.rect(x, y, w, hh);
    const k = 0.5523 * rr;
    this.d.push('M', x + rr, y);
    this.d.push('L', x + w - rr, y);
    this.d.push('C', x + w - rr + k, y, x + w, y + rr - k, x + w, y + rr);
    this.d.push('L', x + w, y + hh - rr);
    this.d.push('C', x + w, y + hh - rr + k, x + w - rr + k, y + hh, x + w - rr, y + hh);
    this.d.push('L', x + rr, y + hh);
    this.d.push('C', x + rr - k, y + hh, x, y + hh - rr + k, x, y + hh - rr);
    this.d.push('L', x, y + rr);
    this.d.push('C', x, y + rr - k, x + rr - k, y, x + rr, y);
    this.d.push('Z');
    this._open = false;
  };

  // ============================================================
  // 2. 绘图上下文记录器（顶替 CanvasRenderingContext2D）
  // ============================================================
  const DEF = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1,
    lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, font: '10px sans-serif',
    textAlign: 'start', textBaseline: 'alphabetic', lineDash: [],
  };
  function Ctx() {
    this.ops = []; this.d = []; this.st = Object.assign({}, DEF); this.stack = [];
    this._open = false; this.m = M_ID;
  }
  const P = Ctx.prototype;
  // save/restore 额外记一对 q/Q：坐标已经烘进 ops 了，但裁剪（clip）要结构边界才知道作用到哪结束
  P.save = function () {
    this.stack.push({ st: Object.assign({}, this.st, { lineDash: this.st.lineDash.slice() }), m: this.m });
    this.ops.push({ k: 'q' });
  };
  P.restore = function () {
    if (!this.stack.length) return;
    const f = this.stack.pop();
    this.st = f.st; this.m = f.m;
    this.ops.push({ k: 'Q' });
  };
  P.beginPath = function () { this.d = []; this._open = false; };
  P.moveTo = function (x, y) { const p = mapPt(this.m, x, y); this.d.push('M', p[0], p[1]); this._open = true; };
  P.lineTo = function (x, y) { const p = mapPt(this.m, x, y); this.d.push('L', p[0], p[1]); this._open = true; };
  P.quadraticCurveTo = function (cx, cy, x, y) {
    const a = mapPt(this.m, cx, cy), b = mapPt(this.m, x, y);
    this.d.push('Q', a[0], a[1], b[0], b[1]); this._open = true;
  };
  P.bezierCurveTo = function (a1, b1, c1, d1, e, f) {
    const a = mapPt(this.m, a1, b1), b = mapPt(this.m, c1, d1), c = mapPt(this.m, e, f);
    this.d.push('C', a[0], a[1], b[0], b[1], c[0], c[1]); this._open = true;
  };
  P.closePath = function () { this.d.push('Z'); this._open = false; };
  // arc / ellipse / rect / roundRect：先在局部坐标里展开成路径，再整段映射
  function viaRec(ctx, fn) {
    const r = new Rec();
    r._open = ctx._open;
    fn(r);
    const d = mapD(r.d, ctx.m);
    for (let i = 0; i < d.length; i++) ctx.d.push(d[i]);
    ctx._open = r._open;
  }
  P.rect = function (x, y, w, hh) { viaRec(this, (r) => r.rect(x, y, w, hh)); };
  // 注意箭头形参不能叫 r：会遮蔽半径 r，导致 r.arc(cx, cy, Rec对象) 被 Rec 的 `!(r>0)` 直接丢掉
  P.arc = function (cx, cy, r, a0, a1, ccw) { viaRec(this, (rr) => rr.arc(cx, cy, r, a0, a1, ccw)); };
  P.ellipse = function (cx, cy, rx, ry, rot, a0, a1, ccw) { viaRec(this, (rr) => rr.ellipse(cx, cy, rx, ry, rot, a0, a1, ccw)); };
  P.arcTo = function (x1, y1, x2, y2) { this.lineTo(x1, y1); this.lineTo(x2, y2); };
  P.roundRect = function (x, y, w, hh, r) { viaRec(this, (rr) => rr.roundRect(x, y, w, hh, r)); };
  // 物理图形库里有一处 drawImage（贴图），导出器没有像素 —— 记个空操作，不要抛
  P.drawImage = function () { this.needsRaster = true; };
  P.setLineDash = function (a) { this.st.lineDash = (a || []).slice(); };
  P.getLineDash = function () { return this.st.lineDash.slice(); };
  P.clearRect = function () {};
  // G2：裁剪不再丢弃。记录当前路径（已按 CTM 映射），SVG 出 <clipPath>、PDF 出 W n
  P.clip = function (path) {
    // this.d 在落笔时就已经按 CTM 映射过了，这里不能再映一次（会变成矩阵平方）；
    // 只有显式传进来的本地路径（Rec）才需要映。
    const d = (path && path.d) ? mapD(path.d, this.m) : this.d.slice();
    if (d.length) this.ops.push({ k: 'clip', d: d });
  };
  // G1：变换后乘（canvas 语义）。坐标在落笔那一刻就映射掉，SVG/PDF 两条链路都不必各自理解变换
  P.setTransform = function (a, b, c, d, e, f) {
    this.m = (a && a.length === 6) ? a.slice() : [a, b, c, d, e, f];
  };
  P.resetTransform = function () { this.m = M_ID; };
  P.transform = function (a, b, c, d, e, f) { this.m = mMul(this.m, [a, b, c, d, e, f]); };
  P.translate = function (x, y) { if (x || y) this.m = mMul(this.m, [1, 0, 0, 1, x || 0, y || 0]); };
  P.scale = function (x, y) {
    if (y == null) y = x;
    if (x === 1 && y === 1) return;
    this.m = mMul(this.m, [x, 0, 0, y, 0, 0]);
  };
  P.rotate = function (r) {
    if (!r) return;
    const c = Math.cos(r), s = Math.sin(r);
    this.m = mMul(this.m, [c, s, -s, c, 0, 0]);
  };
  P.createLinearGradient = function () { this.needsRaster = true; return { addColorStop() {} }; };
  P.createRadialGradient = P.createLinearGradient;
  // WP4：不再返回 null。board.js 传来的 tile 带 __fillSpec，包装成记录器能识别的
  // 图案对象（含稳定 id）；SVG 据此出 <pattern> defs，PDF 据此降级为半透明主色。
  P.createPattern = function (img) {
    const spec = (img && img.__fillSpec) || null;
    const id = 'fp_' + (spec ? patternKey(spec) : 'plain');
    return { __pattern: true, spec: spec, id: id };
  };
  P.measureText = function (t) { return measure(this.st.font, t); };
  P.fillRect = function (x, y, w, hh) {
    const m = this.m;
    if (isAxisAligned(m)) {                 // 轴对齐（含镜像/缩放）仍走矩形，别退化成路径
      const a = mapPt(m, x, y), b = mapPt(m, x + w, y + hh);
      this.ops.push({
        k: 'r', x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]),
        w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]), st: snap(this.st, 'fill', m),
      });
      return;
    }
    const p = [mapPt(m, x, y), mapPt(m, x + w, y), mapPt(m, x + w, y + hh), mapPt(m, x, y + hh)];
    const d = ['M', p[0][0], p[0][1], 'L', p[1][0], p[1][1], 'L', p[2][0], p[2][1], 'L', p[3][0], p[3][1], 'Z'];
    this.ops.push({ k: 'p', d: d, mode: 'f', st: snap(this.st, 'fill', m) });
  };
  P.strokeRect = function (x, y, w, hh) {
    const m = this.m;
    const p = [mapPt(m, x, y), mapPt(m, x + w, y), mapPt(m, x + w, y + hh), mapPt(m, x, y + hh)];
    const d = ['M', p[0][0], p[0][1], 'L', p[1][0], p[1][1], 'L', p[2][0], p[2][1], 'L', p[3][0], p[3][1], 'Z'];
    this.ops.push({ k: 'p', d: d, mode: 's', st: snap(this.st, 'stroke', m) });
  };
  P.fillText = function (text, x, y) {
    if (text == null || text === '') return;
    const p = mapPt(this.m, x, y);
    const st = snap(this.st, 'fill', this.m);
    // 字形本身不能被镜像翻过来（画布上 flipDraw 用 Proxy 反抵消的正是这件事），
    // 所以这里只取「旋转角 + 缩放」，负行列式（镜像）不参与 orientation
    const rot = Math.atan2(this.m[1], this.m[0]);
    if (rot) st.rot = rot;
    const f = mscale(this.m);
    if (f !== 1) st.sc = f;
    this.ops.push({ k: 't', text: String(text), x: p[0], y: p[1], st: st });
  };
  P.strokeText = P.fillText;
  P.stroke = function (path) {
    const d = (path && path.d) ? mapD(path.d, this.m) : this.d.slice();
    if (!d || !d.length) return;
    this.ops.push({ k: 'p', d: d, mode: 's', st: snap(this.st, 'stroke', this.m) });
  };
  P.fill = function (path) {
    const d = (path && path.d) ? mapD(path.d, this.m) : this.d.slice();
    if (!d || !d.length) return;
    this.ops.push({ k: 'p', d: d, mode: 'f', st: snap(this.st, 'fill', this.m) });
  };

  ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'lineCap', 'lineJoin', 'miterLimit',
    'font', 'textAlign', 'textBaseline', 'lineDashOffset', 'shadowBlur', 'shadowColor',
    'globalCompositeOperation', 'filter'].forEach((name) => {
    Object.defineProperty(P, name, {
      get() { return this.st[name]; },
      set(v) { this.st[name] = v; },
      enumerable: true,
    });
  });

  // 线宽/字号按矩阵的面积比例缩放（等面积不变 1；镜像 det<0 取绝对值 → 仍为 1）
  function mscale(m) {
    if (!m || isIdent(m)) return 1;
    const f = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    return f || 1;
  }
  function snap(st, which, m) {
    const fs = which === 'fill' ? st.fillStyle : st.strokeStyle;
    const pat = (fs && fs.__pattern) ? fs : null;
    const ga = st.globalAlpha == null ? 1 : st.globalAlpha;
    let c, a;
    if (pat && pat.spec) {
      const rgb = specColorRgb(pat.spec);
      c = { r: rgb[0], g: rgb[1], b: rgb[2], a: 1 };        // 主色：SVG 兜底 / PDF 降级
      a = q2((pat.spec.alpha == null ? 1 : pat.spec.alpha) * ga);
    } else if (pat) {
      c = { r: 128, g: 128, b: 128, a: 1 };
      a = q2(0.2 * ga);
    } else {
      c = parseColor(fs);
      a = q2(c.a * ga);
    }
    const r = {
      col: c, a: a,
      lw: (st.lineWidth == null ? 1 : st.lineWidth) * (m ? mscale(m) : 1),
      cap: st.lineCap, join: st.lineJoin, dash: st.lineDash,
      font: st.font, align: st.textAlign, base: st.textBaseline,
    };
    if (pat) r.pattern = { spec: pat.spec, id: pat.id };      // SVG 出 url(#id)、自检据此断言
    return r;
  }

  // ---------- 路径数据 ----------
  function pathD(d) {
    let s = '';
    for (let i = 0; i < d.length;) {
      const c = d[i++];
      if (c === 'Z') { s += 'Z'; continue; }
      if (c === 'M' || c === 'L') s += (s ? ' ' : '') + c + num(d[i++]) + ' ' + num(d[i++]);
      else if (c === 'Q') s += ' Q' + num(d[i++]) + ' ' + num(d[i++]) + ' ' + num(d[i++]) + ' ' + num(d[i++]);
      else if (c === 'C') s += ' C' + num(d[i++]) + ' ' + num(d[i++]) + ' ' + num(d[i++]) + ' ' + num(d[i++]) + ' ' + num(d[i++]) + ' ' + num(d[i++]);
    }
    return s;
  }
  // 世界坐标 → PDF 用户空间（Y 轴翻过来），顺便把二次贝塞尔升成三次
  function pathPdf(d, T) {
    const out = [];
    let cx = 0, cy = 0, sx = 0, sy = 0;
    for (let i = 0; i < d.length;) {
      const c = d[i++];
      if (c === 'M') {
        const p = T(d[i++], d[i++]);
        out.push(num(p[0]) + ' ' + num(p[1]) + ' m'); cx = sx = p[0]; cy = sy = p[1];
      } else if (c === 'L') {
        const p = T(d[i++], d[i++]);
        out.push(num(p[0]) + ' ' + num(p[1]) + ' l'); cx = p[0]; cy = p[1];
      } else if (c === 'Q') {
        const qq = T(d[i++], d[i++]), p = T(d[i++], d[i++]);
        const c1x = cx + (2 / 3) * (qq[0] - cx), c1y = cy + (2 / 3) * (qq[1] - cy);
        const c2x = p[0] + (2 / 3) * (qq[0] - p[0]), c2y = p[1] + (2 / 3) * (qq[1] - p[1]);
        out.push([c1x, c1y, c2x, c2y, p[0], p[1]].map(num).join(' ') + ' c');
        cx = p[0]; cy = p[1];
      } else if (c === 'C') {
        const a = T(d[i++], d[i++]), b = T(d[i++], d[i++]), p = T(d[i++], d[i++]);
        out.push([a[0], a[1], b[0], b[1], p[0], p[1]].map(num).join(' ') + ' c');
        cx = p[0]; cy = p[1];
      } else if (c === 'Z') { out.push('h'); cx = sx; cy = sy; }
    }
    return out.join('\n');
  }
  function circleD(x, y, r) {
    const kk = r * 0.5522847498;
    return ['M', x - r, y, 'C', x - r, y - kk, x - kk, y - r, x, y - r,
      'C', x + kk, y - r, x + r, y - kk, x + r, y,
      'C', x + r, y + kk, x + kk, y + r, x, y + r,
      'C', x - kk, y + r, x - r, y + kk, x - r, y];
  }
  const rectPath = (x, y, w, hh) => ['M', x, y, 'L', x + w, y, 'L', x + w, y + hh, 'L', x, y + hh, 'Z'];

  // ============================================================
  // 3. 背景底纹（与 board.js drawBg 同参数，但锚定世界原点）
  // ============================================================
  // 屏幕上的 drawBg 按「屏幕像素」画网格，但它的相位恰好抵消了平移，
  // 等价于「网格锚定世界原点、格距 g 世界单位」。导出直接用世界坐标网格
  // 即可，画出来和屏幕上一模一样。换挡（×5 / ÷5）在屏幕上按 view.s 判定，
  // 导出时按输出比例判定 —— 这样印在纸上的格距才是舒服的。
  function bgGear(k, pat) {
    let g = pat === 'lines' ? 48 : 40;
    let sg = g * k, guard = 0;
    while (sg < 15 && guard++ < 40) { g *= 5; sg *= 5; }
    guard = 0;
    while (sg > 90 && guard++ < 40) { g /= 5; sg /= 5; }
    return g;
  }
  function vectorBackground(rect, style) {
    const ops = [];
    const make = (kind, coords) => {
      const stops = [];
      return { kind, coords, stops, addColorStop(at, color) { stops.push({ at, color: parseColor(color) }); } };
    };
    const ctx = {
      createLinearGradient: (...c) => make('linear', c),
      createRadialGradient: (...c) => make('radial', c),
      createPattern: () => null,
      fillRect() { ops.push({ k: 'bgGradient', rect, gradient: this.fillStyle }); },
    };
    GW.paintBgStyle(ctx, rect.w, rect.h, style);
    return ops;
  }

  function bgOps(rect, p, rasterK, mode, tileArea) {
    const bg = p.bg || { color: 'white', pattern: 'none' };
    const th = (GW.bgTheme ? GW.bgTheme(bg.color) : (GW.BG && GW.BG[bg.color])) || { fill: '#ffffff', line: 'rgba(40,60,90,0.10)', line2: 'rgba(40,60,90,0.22)', pen: '#1b2433' };
    let ops;
    const hasMaterial = ['grain', 'glow', 'grad'].includes(bg.material) && GW.paintBgMaterial;
    if (mode === 'svg' && th.style && GW.paintBgStyle && !hasMaterial) {
      ops = vectorBackground(rect, th.style);
    } else if ((th.style && GW.paintBgStyle) || hasMaterial) {
      const cv = snapshotCanvas(rect.w, rect.h, rasterK);
      const cw = cv.width, ch = cv.height;
      const c2 = cv.getContext('2d');
      const area = tileArea || rect;
      c2.scale(cw / rect.w, ch / rect.h);
      c2.translate(area.x - rect.x, area.y - rect.y);
      if (th.style && GW.paintBgStyle) GW.paintBgStyle(c2, area.w, area.h, th.style);
      else { c2.fillStyle = th.fill; c2.fillRect(0, 0, area.w, area.h); }
      if (hasMaterial) GW.paintBgMaterial(c2, area.w, area.h, bg, th);
      ops = [{ k: 'img', x: rect.x, y: rect.y, w: rect.w, h: rect.h, cv }];
    } else {
      ops = [{ k: 'r', x: rect.x, y: rect.y, w: rect.w, h: rect.h, st: { col: parseColor(th.fill), a: 1 } }];
    }
    const pat = bg.pattern;
    if (!pat || pat === 'none') return ops;
    const savedZoom = p === GW.page() ? GW.camera?.s : p.view?.s;
    const zoom = Number.isFinite(savedZoom) && savedZoom > 0 ? savedZoom : 1;
    const g = bgGear(zoom, pat);
    const px = 1 / zoom;
    const X1 = rect.x + rect.w, Y1 = rect.y + rect.h;
    const grid = (period, color, lw, alpha, dash) => {
      const d = [];
      for (let x = Math.floor(rect.x / period) * period; x <= X1; x += period) d.push('M', x, rect.y, 'L', x, Y1);
      for (let y = Math.floor(rect.y / period) * period; y <= Y1; y += period) d.push('M', rect.x, y, 'L', X1, y);
      if (d.length) ops.push({ k: 'p', d, mode: 's', st: { col: parseColor(color), a: q2(alpha == null ? 1 : alpha), lw, cap: 'butt', join: 'miter', dash: dash || [] } });
    };
    if (pat === 'grid') {
      grid(g, th.line, px, 1);
    } else if (pat === 'coord') {
      grid(g, th.line, px, 1);
      grid(g * 5, th.line2, px, 1);
      const ad = [];
      if (rect.y <= 0 && Y1 >= 0) ad.push('M', rect.x, 0, 'L', X1, 0);
      if (rect.x <= 0 && X1 >= 0) ad.push('M', 0, rect.y, 'L', 0, Y1);
      if (ad.length) ops.push({ k: 'p', d: ad, mode: 's', st: { col: parseColor(th.pen), a: q2(0.55), lw: 1.5 * px, dash: [] } });
    } else if (pat === 'dots') {
      const r = Math.max(1, Math.min(2.2, (g * zoom) / 22)) / zoom;
      const col = parseColor(th.line2);
      if ((rect.w / g + 2) * (rect.h / g + 2) > 12000) {
        const cv = snapshotCanvas(rect.w, rect.h, rasterK), out = cv.getContext('2d');
        const tile = snapshotCanvas(g, g, Math.max(rasterK, 24 / g)), ctx = tile.getContext('2d');
        ctx.scale(tile.width / g, tile.height / g);
        ctx.fillStyle = th.line2;
        for (const x of [0, g]) for (const y of [0, g]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); }
        const pattern = out.createPattern(tile, 'repeat');
        pattern.setTransform(new DOMMatrix().scale(g / tile.width, g / tile.height));
        out.scale(cv.width / rect.w, cv.height / rect.h);
        out.translate(-rect.x, -rect.y);
        out.fillStyle = pattern; out.fillRect(rect.x, rect.y, rect.w, rect.h);
        ops.push({ k: 'img', x: rect.x, y: rect.y, w: rect.w, h: rect.h, cv });
      } else {
        for (let x = Math.ceil(rect.x / g) * g; x <= X1; x += g) {
          for (let y = Math.ceil(rect.y / g) * g; y <= Y1; y += g) ops.push({ k: 'c', x, y, r, st: { col, a: 1, lw: 0 } });
        }
      }
    } else if (pat === 'lines') {
      const d = [];
      for (let y = Math.floor(rect.y / g) * g; y <= Y1; y += g) d.push('M', rect.x, y, 'L', X1, y);
      if (d.length) ops.push({ k: 'p', d, mode: 's', st: { col: parseColor(th.line2), a: 1, lw: px, dash: [] } });
    } else if (pat === 'tian') {
      grid(g * 2, th.line2, px, 1);
      grid(g * 2, th.line, px, 1, [4 * px, 4 * px]);
    }
    return ops;
  }

  // ============================================================
  // 4. 画布对象 → 位图 / foreignObject
  // ============================================================
  const TYPE_NAME = {
    image: '图片', pdfpage: 'PDF 页面', video: '视频', audio: '音频', web: '网页课件',
    swf: 'Flash 动画', ggb: 'GeoGebra', sim: '仿真', file: '文件', text: '文本', formula: '公式',
    node: 'AI 节点', book: '册子',
  };
  const INLINE_PROPS = [
    'display', 'position', 'left', 'top', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'padding', 'border', 'border-radius', 'background-color', 'color',
    'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height', 'letter-spacing',
    'text-align', 'text-indent', 'text-transform', 'text-decoration', 'white-space', 'word-break', 'overflow',
    'box-shadow', 'vertical-align', 'transform', 'transform-origin', 'opacity', 'flex', 'flex-direction',
    'align-items', 'justify-content', 'gap', 'list-style', 'visibility',
  ];
  function styleTree(src, dst) {
    const cs = getComputedStyle(src);
    let s = dst.getAttribute('style') || '';
    for (const p of INLINE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v && v !== 'none') s += p + ':' + v + ';';
    }
    dst.setAttribute('style', s);
    const a = src.children, b = dst.children;
    for (let i = 0; i < a.length && i < b.length; i++) styleTree(a[i], b[i]);
  }
  // 把一棵 DOM 子树连同计算样式序列化成 XHTML（foreignObject 用）
  function inlineClone(src) {
    if (!src || !src.isConnected) return null;
    const w = Math.max(1, src.offsetWidth), hh = Math.max(1, src.offsetHeight);
    const holder = h('div', { style: { position: 'fixed', left: '-30000px', top: '0px', width: w + 'px', height: hh + 'px', overflow: 'hidden' } });
    const c = src.cloneNode(true);
    c.style.position = 'absolute'; c.style.left = '0px'; c.style.top = '0px';
    c.style.right = 'auto'; c.style.bottom = 'auto';
    c.style.width = w + 'px'; c.style.height = hh + 'px';
    holder.append(c);
    document.body.append(holder);
    try {
      styleTree(src, c);
      c.setAttribute('xmlns', XHTMLNS);
      return new XMLSerializer().serializeToString(c);
    } catch (e) {
      console.warn('导出：内联样式失败', e);
      return null;
    } finally { holder.remove(); }
  }
  function loadImg(src) {
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  }
  let capturePending = null;
  function captureView() {
    if (capturePending) return capturePending;
    const capture = GW.isElectron ? window.gewu?.capturePage : window.gewuNative?.capturePage;
    if (typeof capture !== 'function') return Promise.resolve(null);
    capturePending = (async () => {
      const body = document.body, alreadyCapturing = body.classList.contains('capturing');
      body.classList.add('capturing');
      try {
        await new Promise((resolve) => setTimeout(resolve, 80));
        const url = await capture();
        const img = url && await loadImg(url);
        if (!img?.naturalWidth || !img.naturalHeight) return null;
        const stage = GW.stageEl()?.getBoundingClientRect();
        const sx = img.naturalWidth / innerWidth, sy = img.naturalHeight / innerHeight;
        const x = Math.max(0, Math.round((stage?.left || 0) * sx)), y = Math.max(0, Math.round((stage?.top || 0) * sy));
        const w = Math.min(img.naturalWidth - x, Math.round((stage?.width || innerWidth) * sx));
        const hh = Math.min(img.naturalHeight - y, Math.round((stage?.height || innerHeight) * sy));
        if (!(w > 0 && hh > 0)) return null;
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = hh;
        cv.getContext('2d').drawImage(img, x, y, w, hh, 0, 0, w, hh);
        return cv;
      } catch (e) {
        console.warn('无法截取当前画面', e);
        return null;
      } finally {
        if (!alreadyCapturing) body.classList.remove('capturing');
      }
    })().finally(() => { capturePending = null; });
    return capturePending;
  }
  function foreignImage(xml, w, hh) {
    const svg = '<svg xmlns="' + SVGNS + '" width="' + w + '" height="' + hh + '" viewBox="0 0 ' + w + ' ' + hh + '">' +
      '<foreignObject x="0" y="0" width="' + w + '" height="' + hh + '">' + xml + '</foreignObject></svg>';
    return loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }
  function snapshotScale(w, hh, wanted) {
    return Math.min(wanted, 4096 / Math.max(w, hh), Math.sqrt(8_000_000 / (w * hh)));
  }
  function snapshotCanvas(w, hh, scale) {
    scale = snapshotScale(w, hh, scale);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * scale));
    cv.height = Math.max(1, Math.round(hh * scale));
    return cv;
  }
  function imageOp(o, cv, fit) {
    if (!cv || !cv.width || !cv.height) return null;
    const s = Math.min(o.w / cv.width, o.h / cv.height);
    const w = fit ? cv.width * s : o.w, hh = fit ? cv.height * s : o.h;
    return { k: 'img', x: o.x + (o.w - w) / 2, y: o.y + (o.h - hh) / 2, w, h: hh, cv };
  }
  async function sourceSnapshot(o, scale) {
    const d = o.data || {};
    if (o.type === 'slides' && GW.pptx && GW.pptx.snapshot) {
      return imageOp(o, await GW.pptx.snapshot(o, snapshotScale(o.w, o.h, scale)), true);
    }
    if (o.type === 'book' || o.type === 'pdfpage') {
      const pdf = await GW.loadPdf(d.asset);
      const page = await pdf.getPage(d.page || 1);
      const base = page.getViewport({ scale: 1 });
      const target = snapshotScale(base.width, base.height, Math.min(o.w / base.width, o.h / base.height) * scale);
      const viewport = page.getViewport({ scale: target });
      const cv = snapshotCanvas(viewport.width, viewport.height, 1);
      await page.render({ canvasContext: cv.getContext('2d'), viewport }).promise;
      return imageOp(o, cv, true);
    }
    if (o.type === 'image') {
      const src = d.asset ? GW.assets.url(d.asset) : d.src;
      const im = src && await loadImg(src);
      if (!im || !im.naturalWidth || !im.naturalHeight) return null;
      const cv = snapshotCanvas(im.naturalWidth, im.naturalHeight, Math.min(1, Math.max(o.w * scale / im.naturalWidth, o.h * scale / im.naturalHeight)));
      const ctx = cv.getContext('2d');
      ctx.drawImage(im, 0, 0, cv.width, cv.height);
      ctx.getImageData(0, 0, 1, 1);
      return imageOp(o, cv, false);    // 图片工具的主动拉伸与画布保持一致
    }
    return null;
  }
  async function objectXml(o) {
    const mounted = o._body || GW.objects.el(o);
    if (mounted) return inlineClone(mounted);
    const frame = h('div', { class: 'obj chrome-bare type-' + o.type, style: {
      position: 'fixed', left: '-30000px', top: '0px', width: o.w + 'px', height: o.h + 'px',
    } });
    const body = h('div', { class: 'obj-body' });
    frame.append(body);
    document.body.append(frame);
    try {
      GW.kinds[o.type].create({ ...o, _autoEdit: false }, body, frame);
      if (o.type === 'formula') {
        if (document.fonts) await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return inlineClone(body);
    } finally { frame.remove(); }
  }
  // 把一个画布对象光栅化：优先直接取它内部 canvas/img/video 的像素，
  // 取不到就把 DOM 子树塞进 foreignObject 再画出来；再失败返回 null（画占位框）。
  async function rasterObject(o, scale, xml) {
    const cv = snapshotCanvas(o.w, o.h, scale);
    const c = cv.getContext('2d');
    c.setTransform(cv.width / o.w, 0, 0, cv.height / o.h, 0, 0);
    const el = GW.objects.el(o);
    const body = o._body || el;
    if (body && !xml) {
      const frame = body.querySelector('iframe');
      let host = body, shot = null;
      if (frame) {
        try {
          host = frame.contentDocument?.body;
          const url = frame.contentWindow.__anim?.capture?.();
          if (/^data:image\/(?:png|jpeg|webp);/i.test(url || '')) shot = await loadImg(url);
        } catch (_) { host = null; }
      }
      const inner = shot || (host && (o.type === 'video' ? host.querySelector('video') :
        host.querySelector('.gw-sim-stage > canvas, canvas:not(.obj-ann), video, img')));
      if (inner) {
        try {
          const sw = inner.videoWidth || inner.naturalWidth || inner.width || 0;
          const sh = inner.videoHeight || inner.naturalHeight || inner.height || 0;
          if (sw > 0 && sh > 0) {
            const origin = body.getBoundingClientRect(), hostBox = frame?.getBoundingClientRect() || origin;
            const bounds = shot ? null : inner.getBoundingClientRect();
            const toX = o.w / (origin.width || o.w), toY = o.h / (origin.height || o.h);
            const frameX = frame ? hostBox.width / (frame.clientWidth || hostBox.width || 1) : 1;
            const frameY = frame ? hostBox.height / (frame.clientHeight || hostBox.height || 1) : 1;
            const x = ((hostBox.left - origin.left) + (frame && bounds ? bounds.left * frameX : (bounds ? bounds.left - origin.left : 0))) * toX;
            const y = ((hostBox.top - origin.top) + (frame && bounds ? bounds.top * frameY : (bounds ? bounds.top - origin.top : 0))) * toY;
            const w = (bounds ? bounds.width * frameX : hostBox.width) * toX || o.w;
            const hh = (bounds ? bounds.height * frameY : hostBox.height) * toY || o.h;
            const style = shot ? null : inner.ownerDocument.defaultView.getComputedStyle(inner);
            const painted = GW.simBackground?.paint(c, o.w, o.h, o.data?.simBackground);
            if (!painted) {
              c.fillStyle = getComputedStyle(body).backgroundColor;
              c.fillRect(0, 0, o.w, o.h);
            }
            c.save();
            c.beginPath(); c.rect(x, y, w, hh); c.clip();
            if (style?.filter && style.filter !== 'none') c.filter = style.filter;
            const fit = style?.objectFit;
            if (fit === 'contain' || fit === 'cover' || fit === 'scale-down') {
              const ratio = fit === 'cover' ? Math.max(w / sw, hh / sh) : Math.min(w / sw, hh / sh, fit === 'scale-down' ? 1 : Infinity);
              c.drawImage(inner, x + (w - sw * ratio) / 2, y + (hh - sh * ratio) / 2, sw * ratio, sh * ratio);
            } else c.drawImage(inner, x, y, w, hh);
            c.restore();
            const ann = body.querySelector('canvas.obj-ann');
            if (ann?.width) c.drawImage(ann, x, y, w, hh);
            c.getImageData(0, 0, 1, 1);      // 触碰一次，确认没被跨域污染
            return cv;
          }
        } catch (e) { return null; }
      }
    }
    if (!xml && ['video', 'sim', 'web', 'ggb', 'swf', 'slides'].includes(o.type)) return null;
    if (body || xml) {
      xml = xml || inlineClone(body);
      if (xml) {
        const im = await foreignImage(xml, o.w, o.h);
        if (im) {
          try {
            c.drawImage(im, 0, 0, o.w, o.h);
            c.getImageData(0, 0, 1, 1);
            return cv;
          } catch (e) { /* 污染：放弃 */ }
        }
      }
    }
    return null;
  }
  function placeholderOps(o) {
    const kind = GW.kinds[o.type] || {};
    const label = (kind.title && kind.title(o)) || TYPE_NAME[o.type] || o.type;
    const name = '［' + (TYPE_NAME[o.type] || o.type) + '］' + (label && label !== o.type ? ' ' + label : '');
    const fs = Math.max(9, Math.min(o.h * 0.16, (o.w * 0.92) / Math.max(4, name.length * 0.62)));
    return [
      { k: 'p', d: rectPath(o.x, o.y, o.w, o.h), mode: 's', st: { col: parseColor('#c3cbd6'), a: 1, lw: 1, dash: [6, 5], cap: 'butt', join: 'miter' } },
      { k: 't', text: name, x: o.x + o.w / 2, y: o.y + o.h / 2, st: { col: parseColor('#7b8697'), a: 1, font: fs + 'px sans-serif', align: 'center', base: 'middle' } },
    ];
  }

  // ============================================================
  // 5. 收集图元
  // ============================================================

  // ---------- 镜像（1.3.4）：把一整段记录下来的 op 绕某条中线翻过去 ----------
  // 记录器的 translate/scale 是空实现（P.translate/P.scale 都没有矩阵），所以 drawItem 里的
  // flipDraw 在导出这边等于没翻。这里在「记录完一个对象之后」直接按坐标翻，
  // 文字只挪位置不翻字形 —— 导出的 SVG/PDF 与屏幕上看到的一致。
  function flipD(d, axis, c) {
    const idx = axis === 'y' ? 1 : 0;
    for (let i = 0; i < d.length;) {
      const t = d[i++];
      if (t === 'Z') continue;
      const n = t === 'C' ? 3 : (t === 'Q' ? 2 : 1);
      for (let j = 0; j < n; j++) { d[i + idx] = 2 * c - d[i + idx]; i += 2; }
    }
  }
  function mirrorOps(ops, from, axis, c) {
    for (let i = from; i < ops.length; i++) {
      const o = ops[i];
      if (o.k === 'p') flipD(o.d, axis, c);
      else if (o.k === 'r') { if (axis === 'y') o.y = 2 * c - (o.y + o.h); else o.x = 2 * c - (o.x + o.w); }
      else if (o.k === 't' || o.k === 'c') { if (axis === 'y') o.y = 2 * c - o.y; else o.x = 2 * c - o.x; }
      else if (o.k === 'img' || o.k === 'fo') { if (axis === 'y') o.y = 2 * c - (o.y + o.h); else o.x = 2 * c - (o.x + o.w); }
    }
  }

  function rasterInk(it, rect, scale) {
    const b = GW.bbox(it);
    const x = Math.max(rect.x, b.x - 4), y = Math.max(rect.y, b.y - 4);
    const w = Math.min(rect.x + rect.w, b.x + b.w + 4) - x;
    const hh = Math.min(rect.y + rect.h, b.y + b.h + 4) - y;
    if (!(w > 0 && hh > 0)) return null;
    const cv = snapshotCanvas(w, hh, scale), c = cv.getContext('2d');
    c.setTransform(cv.width / w, 0, 0, cv.height / hh, -x * cv.width / w, -y * cv.height / hh);
    GW.invalidate(it);
    GW.drawItem(c, it);
    c.getImageData(0, 0, 1, 1);
    return { k: 'img', x, y, w, h: hh, cv };
  }

  async function collect(rect, opts) {
    const p = opts.page || GW.page();
    const mode = opts.mode || 'svg';
    const k = opts.k || 1;
    const rasterK = (opts.dpi || 300) * k / (mode === 'pdf' ? 72 : 96);
    if (opts.nativeView && opts.bg !== false && !opts.selIds && p === GW.page() && !opts.tilePaper) {
      const cv = await captureView();
      if (cv) return [{ k: 'img', ...rect, cv }];
    }
    let ops = [];
    if (opts.bg) ops = ops.concat(bgOps(rect, p, rasterK, mode, opts.tileArea));

    // ---- 5.1 笔迹与图形：复用 GW.drawItem ----
    const selSet = opts.selIds ? new Set(opts.selIds) : null;
    const items = p.ink.filter((it) => (!selSet || selSet.has(it.id)) && overlap(GW.bbox(it), rect));
    const ctx = new Ctx();
    const RealPath2D = window.Path2D;
    const livePage = GW.doc.cur;
    const pageIndex = GW.doc.pages.indexOf(p);
    window.Path2D = Rec;
    // 动画中的物理图形平时画在实时层、墨迹层跳过它们；导出要的是一个静止帧，
    // 这里把动画顶住（setFrozen），让 GW.drawItem 照常把它们记进导出物。
    if (GW.physShapes && GW.physShapes.setFrozen) GW.physShapes.setFrozen(true);
    if (GW.lorentz && GW.lorentz.setFrozen) GW.lorentz.setFrozen(true);
    try {
      if (pageIndex >= 0) GW.doc.cur = pageIndex; // 现有绘图函数通过 GW.page() 读取自动反差，且这里没有 await
      for (const it of items) {
        delete it._path; delete it._paths;
        const n0 = ctx.ops.length;
        ctx.needsRaster = false;
        GW.drawItem(ctx, it);
        if (ctx.needsRaster) {
          window.Path2D = RealPath2D;
          try {
            const op = rasterInk(it, rect, rasterK * (opts.rasterQ || 1));
            if (op) ctx.ops.splice(n0, ctx.ops.length - n0, op);
          } catch (error) {
            if (opts.report) opts.report.push({ id: it.id, type: '图形', name: it.name, reason: '无法读取原生图形画面，保留可用的矢量内容。' });
            console.warn('导出图形原生样式失败', error);
          } finally { window.Path2D = Rec; }
        }
        // 镜像不再事后翻坐标：drawItem → flipDraw 用的是 ctx.translate/scale，
        // 记录器现在持有真矩阵，坐标在落笔时就已经翻好了（G1）。再调一遍 mirrorOps 会翻两次。
      }
    } finally {
      GW.doc.cur = livePage;
      if (GW.physShapes && GW.physShapes.setFrozen) GW.physShapes.setFrozen(false);
      if (GW.lorentz && GW.lorentz.setFrozen) GW.lorentz.setFrozen(false);
      window.Path2D = RealPath2D;
      for (const it of items) GW.invalidate(it);   // 清掉记录器留下的 _path，别污染屏幕渲染
    }
    ops = ops.concat(ctx.ops);

    // ---- 5.2 画布对象（叠在笔迹之上，按 z 排序）----
    const objs = p.objs.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const o of objs) {
      if (selSet && !selSet.has(o.id)) continue;
      if (!overlap(rectOf(o), rect)) continue;
      let done = false;
      const scale = rasterK * (opts.rasterQ || 1);
      try {
        const op = await sourceSnapshot(o, scale);
        if (op) {
          ops.push(op); done = true;
          if (opts.report && opts.dpi >= 300 && o.type === 'image') {
            const inches = mode === 'pdf' ? 72 : 96;
            const actual = Math.floor(Math.min(op.cv.width / op.w, op.cv.height / op.h) * inches / k);
            if (actual < opts.dpi * 0.9) opts.report.push({ id: o.id, type: o.type, name: o.data?.name, reason: '原图有效约 ' + actual + ' DPI' });
          }
        }
      } catch (err) { console.warn('导出对象失败：', o.type, o.id, err); }
      // 1.7.6：适配器提供的真实静态导出（优先于栅格/占位）。失败时记录可判断原因，
      // 下面照旧走 placeholderOps 占位框，旧 obj/web 路径不受影响。
      if (!done && GW.physicsModels && !GW.physicsModels.disabled &&
          typeof GW.physicsModels.adapter === 'function' && typeof GW.physicsModels.has === 'function') {
        const tid = GW.physicsModels.templateIdOf(o);
        const ad = tid && GW.physicsModels.adapter(tid);
        if (ad && typeof ad.exportStatic === 'function' && GW.physicsModels.has(tid, 'exportStatic')) {
          try {
            const r = await ad.exportStatic(o, { k, rect, mode });
            if (r && r.ok !== false && r.kind === 'vector' && r.op) {
              if (mode === 'svg') { ops.push(r.op); done = true; }
              else {
                const cv = snapshotCanvas(o.w, o.h, scale);
                const xml = `<svg xmlns="${SVGNS}" width="${cv.width}" height="${cv.height}" viewBox="${esc(r.op.viewBox || '0 0 800 500')}">${r.op.xml}</svg>`;
                const img = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml));
                if (img) { cv.getContext('2d').drawImage(img, 0, 0); ops.push(imageOp(o, cv, false)); done = true; }
              }
            }
            else if (r && GW.physicsWebBridge) GW.physicsWebBridge.reportFailure(o.id, r.reason || '未返回矢量图元');
          } catch (err) {
            if (GW.physicsWebBridge) GW.physicsWebBridge.reportFailure(o.id, (err && err.message) || String(err));
          }
        }
      }
      if (!done && (o.type === 'text' || o.type === 'formula')) {
        const xml = await objectXml(o);
        const cv = xml && await rasterObject(o, scale, xml);
        if (cv) { ops.push({ k: 'img', x: o.x, y: o.y, w: o.w, h: o.h, cv }); done = true; }
      } else if (!done) {
        const cv = await rasterObject(o, rasterScale(o, k, opts.raster, opts.rasterQ));
        if (cv) { ops.push({ k: 'img', x: o.x, y: o.y, w: o.w, h: o.h, cv }); done = true; }
      }
      if (!done) {
        if (opts.report) opts.report.push({ id: o.id, type: o.type, name: o.data?.name || o.data?.title,
          reason: '无法读取这项的画面，已标注位置。隔离的网页课件可在支持屏幕捕获的应用中用「当前画面」导出。' });
        ops = ops.concat(placeholderOps(o));
      }
    }
    return ops;
  }
  function rasterScale(o, k, factor, q) {
    const want = Math.max(k * (factor || 2.2), 1.4);
    const cap = 2600 / Math.max(1, o.w, o.h);
    // q = 导出质量档位的光栅倍率（乘在已定好的分辨率之后，否则 4× 封顶会把档位吃掉）
    return Math.max(0.5, Math.min(want, 4, cap) * (q || 1));
  }

  // ============================================================
  // 6. 输出 SVG
  // ============================================================
  function svgStyle(st, mode) {
    // WP4：图案填充 → fill 指向 <pattern> defs（真矢量）。alpha 已画进 tile 线条，
    // 这里不再叠加 fill-opacity，避免双重透明。
    if (mode !== 's' && st.pattern && st.pattern.spec) {
      return ' fill="url(#' + st.pattern.id + ')" stroke="none"';
    }
    const col = 'rgb(' + (st.col.r | 0) + ',' + (st.col.g | 0) + ',' + (st.col.b | 0) + ')';
    const a = st.a == null ? 1 : st.a;
    if (mode === 's') {
      let s = ' fill="none" stroke="' + col + '" stroke-width="' + num(st.lw == null ? 1 : st.lw) + '"';
      if (a < 1) s += ' stroke-opacity="' + num(a) + '"';
      if (st.cap && st.cap !== 'butt') s += ' stroke-linecap="' + st.cap + '"';
      if (st.join && st.join !== 'miter') s += ' stroke-linejoin="' + st.join + '"';
      if (st.dash && st.dash.length && st.dash.some((v) => v > 0)) s += ' stroke-dasharray="' + st.dash.map(num).join(' ') + '"';
      return s;
    }
    let s = ' fill="' + col + '" stroke="none"';
    if (a < 1) s += ' fill-opacity="' + num(a) + '"';
    return s;
  }
  function svgOp(op, uriOf) {
    if (op.k === 'r') {
      const c = 'rgb(' + (op.st.col.r | 0) + ',' + (op.st.col.g | 0) + ',' + (op.st.col.b | 0) + ')';
      const a = op.st.a == null ? 1 : op.st.a;
      const ctl = '<rect x="' + num(op.x) + '" y="' + num(op.y) + '" width="' + num(op.w) + '" height="' + num(op.h) + '"';
      const st2 = { col: op.st.col, a, lw: op.lw, cap: 'butt', join: 'miter', dash: op.dash, pattern: op.st.pattern };
      return ctl + svgStyle(st2, op.mode === 's' ? 's' : 'f') + '/>';
    }
    if (op.k === 'c') {
      const c = 'rgb(' + (op.st.col.r | 0) + ',' + (op.st.col.g | 0) + ',' + (op.st.col.b | 0) + ')';
      const a = op.st.a == null ? 1 : op.st.a;
      return '<circle cx="' + num(op.x) + '" cy="' + num(op.y) + '" r="' + num(op.r) + '" fill="' + c + '"' +
        (a < 1 ? ' fill-opacity="' + num(a) + '"' : '') + '/>';
    }
    if (op.k === 'p') return '<path d="' + pathD(op.d) + '"' + svgStyle(op.st, op.mode) + '/>';
    if (op.k === 't') {
      const fo = parseFont(op.st.font);
      const anchor = op.st.align === 'center' ? ' text-anchor="middle"'
        : (op.st.align === 'right' || op.st.align === 'end' ? ' text-anchor="end"' : '');
      let base = '';
      if (op.st.base === 'middle') base = ' dominant-baseline="central"';
      else if (op.st.base === 'top' || op.st.base === 'hanging') base = ' dominant-baseline="text-before-edge"';
      else if (op.st.base === 'bottom' || op.st.base === 'ideographic') base = ' dominant-baseline="text-after-edge"';
      const c = 'rgb(' + (op.st.col.r | 0) + ',' + (op.st.col.g | 0) + ',' + (op.st.col.b | 0) + ')';
      const a = op.st.a == null ? 1 : op.st.a;
      // 旋转文字：绕自己的锚点转（G1）。SVG 的 rotate(deg cx cy) 语义正好对齐 canvas 的 rotate()
      const rot = op.st.rot
        ? ' transform="rotate(' + num(op.st.rot * 180 / Math.PI) + ' ' + num(op.x) + ' ' + num(op.y) + ')"'
        : '';
      const fs = fo.size * (op.st.sc || 1);
      return '<text x="' + num(op.x) + '" y="' + num(op.y) + '" font-family="' + esc(fo.family) + '" font-size="' + num(fs) + '"' +
        (fo.style !== 'normal' ? ' font-style="' + fo.style + '"' : '') + (fo.weight !== 'normal' ? ' font-weight="' + fo.weight + '"' : '') +
        ' fill="' + c + '"' + (a < 1 ? ' fill-opacity="' + num(a) + '"' : '') + anchor + base + rot + '>' + esc(op.text) + '</text>';
    }
    if (op.k === 'img') {
      return '<image x="' + num(op.x) + '" y="' + num(op.y) + '" width="' + num(op.w) + '" height="' + num(op.h) +
        '" preserveAspectRatio="none" xlink:href="' + uriOf(op.cv) + '"/>';
    }
    // 1.7.6：适配器交回的净化页内 SVG —— 嵌套 <svg> 保留线/节点/标签/变换，是真矢量而非位图
    if (op.k === 'svg') {
      return '<svg x="' + num(op.x) + '" y="' + num(op.y) + '" width="' + num(op.w) + '" height="' + num(op.h) +
        '" viewBox="' + esc(op.viewBox || '0 0 800 500') + '" overflow="hidden">' + op.xml + '</svg>';
    }
    return '';
  }
  // ============================================================
  // 6.5 导出物水印（防倒卖）
  // ============================================================
  // 为什么有它：倒卖者卖的就是「导出出来的讲义 + 他自己截的图」。让作者与群号落在
  // 导出物上，他的商品就自带来源标注 —— 要洗掉只能改代码，比换一张二维码图麻烦得多。
  // 文案来自签名过的 src/content/identity.json（GW.ident），改文案会被验签抓出来。
  // 字号按 k 反算成「输出像素恒为 11px」，所以任何纸张、任何缩放下大小都一致。
  function wmText() {
    if (GW.watermarkText) return GW.watermarkText();
    return (GW.ident && GW.ident('watermark', '')) || '唐波 · 数理无限画布（免费）· QQ群 979985385';
  }
  function wmOn() {
    return !!(GW.settings && GW.settings.exportWatermark === true);
  }
  // 导出质量档位（1.7.0 · T02）：'best'|'medium'|'lowest' → 光栅倍率 1 / .75 / .5。
  // 只乘在「位图」上 —— PDF 里嵌入的对象位图与中文字位图；矢量（笔迹/图形/SVG）一律不动。
  // 未设置 / 非法值 → 1，与加档位之前逐字节一致。
  const QUALITY_K = { best: 1, medium: 0.75, lowest: 0.5 };
  function qualityK() {
    const v = GW.settings && GW.settings.exportQuality;
    return QUALITY_K[v] || 1;
  }
  function wmOp(rect, k) {
    if (!wmOn()) return null;
    const kk = Math.max(0.05, k || 1);
    const size = Math.round((11 / kk) * 100) / 100;
    const pad = 6 / kk;
    return {
      k: 't', wm: true, text: wmText(), x: rect.x + rect.w - pad, y: rect.y + rect.h - pad,
      st: {
        font: '400 ' + size + 'px sans-serif',
        col: { r: 118, g: 118, b: 118, a: 0.85 }, a: 0.85,
        align: 'right', base: 'alphabetic',
      },
    };
  }

  function safeDataURL(cv) {
    try { return cv.toDataURL('image/png'); } catch (e) { console.warn('导出：位图被跨域污染，已跳过', e); return BLANK_PNG; }
  }
  async function toSVG(rect, opts) {
    opts = opts || {};
    rect = needRect(rect, opts);
    if (!rect) throw new Error('没有可导出的内容');
    const k = opts.k || (opts.physical ? 1 : fitK(rect, 2400));
    const ops = await collect(rect, Object.assign({}, opts, { k, mode: 'svg' }));
    const wm = wmOp(rect, k);
    if (wm) ops.push(wm);                              // 右下角来源水印（见 6.5）
    const W = rect.w * k, H = rect.h * k;
    const body = [];
    const defs = [];
    const stack = [];
    let cpN = 0;
    // WP4：把记录器里出现的图案填充收集成 <pattern> defs（按 id 去重）。
    // 只要 P.createPattern 不再返回 null，pattern 图形就必然带着 st.pattern 走到这里。
    const patSeen = Object.create(null);
    for (const op of ops) {
      const pp = op && op.st && op.st.pattern;
      if (pp && pp.spec && !patSeen[pp.id]) { patSeen[pp.id] = 1; defs.push(patternSvgDef(pp.id, pp.spec)); }
    }
    // q/Q 变成 <g> 组，clip 变成嵌套的 <g clip-path>：裁剪作用到与之配对的 restore 为止（G2）。
    // clipPathUnits="userSpaceOnUse" 的坐标系取「引用它的元素」的坐标系，所以即使 <defs> 写在
    // 那个 translate+scale 的 <g> 外面，路径坐标仍是世界坐标，不用再乘 k。
    for (const op of ops) {
      if (op.k === 'bgGradient') {
        const { rect: box, gradient: { kind, coords, stops } } = op;
        const id = 'bggrad' + defs.length, tag = kind + 'Gradient';
        const attrs = kind === 'linear' ? `x1="${num(box.x + coords[0])}" y1="${num(box.y + coords[1])}" x2="${num(box.x + coords[2])}" y2="${num(box.y + coords[3])}"` :
          `cx="${num(box.x + coords[3])}" cy="${num(box.y + coords[4])}" r="${num(coords[5])}"`;
        const colors = stops.map(({ at, color: c }) => `<stop offset="${num(at)}" stop-color="rgb(${c.r},${c.g},${c.b})" stop-opacity="${c.a}"/>`);
        defs.push(`<${tag} id="${id}" gradientUnits="userSpaceOnUse" ${attrs}>${colors.join('')}</${tag}>`);
        body.push(`<rect x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" fill="url(#${id})"/>`);
        continue;
      }
      if (op.k === 'q') { body.push('<g>'); stack.push({ clips: 0 }); continue; }
      if (op.k === 'Q') { const f = stack.pop(); if (f) { for (let i = 0; i < f.clips; i++) body.push('</g>'); body.push('</g>'); } continue; }
      if (op.k === 'clip') {
        const id = 'cp' + (++cpN);
        defs.push('<clipPath id="' + id + '" clipPathUnits="userSpaceOnUse"><path d="' + pathD(op.d) + '"/></clipPath>');
        body.push('<g clip-path="url(#' + id + ')">');
        if (!stack.length) stack.push({ clips: 0 });     // 没有 save 的裸 clip：收到流末尾
        stack[stack.length - 1].clips++;
        continue;
      }
      body.push(svgOp(op, safeDataURL));
    }
    while (stack.length) { const f = stack.pop(); for (let i = 0; i < f.clips; i++) body.push('</g>'); body.push('</g>'); }
    const width = opts.physical ? num(rect.w * 25.4 / 96) + 'mm' : num(W);
    const height = opts.physical ? num(rect.h * 25.4 / 96) + 'mm' : num(H);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="' + SVGNS + '" xmlns:xlink="' + XLINK + '" width="' + width + '" height="' + height +
      '" viewBox="0 0 ' + num(W) + ' ' + num(H) + '">\n' +
      '<title>' + esc(opts.title || '数理无限画布') + '</title>\n' +
      '<desc>' + esc((GW.BUILD ? GW.BUILD.stamp : '数理无限画布') + ' 导出') + '</desc>\n' +
      (defs.length ? '<defs>\n' + defs.join('\n') + '\n</defs>\n' : '') +
      '<g transform="translate(' + num(-rect.x * k) + ',' + num(-rect.y * k) + ') scale(' + num(k) + ')">\n' +
      body.join('\n') + '\n</g>\n</svg>\n';
  }
  function fitK(rect, maxPx) {
    return GW.clamp(Math.min(maxPx / Math.max(1, rect.w), maxPx / Math.max(1, rect.h)), 0.05, 8);
  }

  // ============================================================
  // 7. 输出 PDF（自带生成器）
  // ============================================================
  async function deflate(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    try {
      const cs = new CompressionStream('deflate');
      const pr = new Response(cs.readable).arrayBuffer();
      const w = cs.writable.getWriter();
      await w.write(bytes);
      await w.close();
      return new Uint8Array(await pr);
    } catch (e) { console.warn('导出：压缩失败，改用未压缩流', e); return null; }
  }
  function binStr(u8) { let s = ''; const CH = 0x4000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(u8.length, i + CH))); return s; }
  function bytesToB64(u8) { return btoa(binStr(u8)); }
  const rgbPdf = (c) => num(c.r / 255) + ' ' + num(c.g / 255) + ' ' + num(c.b / 255);

  // ---- 位图解码：大图丢 Worker，小图主线程直接拆（1.6.9）----
  // 返回 { rgb, al, hasA } 或 null（失败时调用方用空白图兜底）。
  let imgWorker = null, imgSeq = 0;
  const imgJobs = new Map();
  function imgWorkerGet() {
    if (imgWorker) return imgWorker;
    try {
      imgWorker = new Worker('core/imgworker.js');
      imgWorker.onmessage = (e) => {
        const d = e.data, r = imgJobs.get(d.id);
        if (!r) return;
        imgJobs.delete(d.id);
        r(d);
      };
      imgWorker.onerror = () => { imgWorker = null; };
    } catch (e) { imgWorker = null; }
    return imgWorker;
  }
  // 超过这个像素数才值得起一个 Worker（小图（图标、公式）主线程几十微秒就拆完了）
  const IMG_WORKER_MIN = 120 * 120;
  function decodeInWorker(cv) {
    return new Promise((resolve) => {
      const wk = imgWorkerGet();
      if (!wk || !window.createImageBitmap) return resolve(null);
      const id = ++imgSeq;
      imgJobs.set(id, (d) => {
        if (!d || !d.ok) return resolve(null);
        resolve({ rgb: new Uint8Array(d.rgb), al: new Uint8Array(d.al), hasA: !!d.hasA, w: d.w, h: d.h });
      });
      setTimeout(() => { if (imgJobs.has(id)) { imgJobs.delete(id); resolve(null); } }, 5000);
      createImageBitmap(cv).then((bmp) => {
        try { wk.postMessage({ id, bmp, w: cv.width, h: cv.height }, [bmp]); }
        catch (e) {
          // 老引擎不支持 transfer ImageBitmap：退回主线程，别把导出卡死
          if (imgJobs.has(id)) { imgJobs.delete(id); resolve(null); }
        }
      }, () => { if (imgJobs.has(id)) { imgJobs.delete(id); resolve(null); } });
    });
  }
  async function decodeImg(im) {
    const cv = document.createElement('canvas');
    cv.width = im.width; cv.height = im.height;
    const cx = cv.getContext('2d');
    cx.drawImage(im, 0, 0);
    const w = cv.width, h = cv.height;
    if (w * h >= IMG_WORKER_MIN) {
      const r = await decodeInWorker(cv);
      if (r) return { data: { rgb: r.rgb, al: r.al, hasA: r.hasA }, w: r.w, h: r.h };
    }
    const dd = cx.getImageData(0, 0, w, h).data;
    const n = w * h;
    const rgb = new Uint8Array(n * 3), al = new Uint8Array(n);
    let hasA = false;
    for (let j = 0, t = 0; j < n; j++, t += 3) {
      const q = j * 4;
      rgb[t] = dd[q]; rgb[t + 1] = dd[q + 1]; rgb[t + 2] = dd[q + 2];
      al[j] = dd[q + 3];
      if (dd[q + 3] !== 255) hasA = true;
    }
    return { data: { rgb, al, hasA }, w, h };
  }

  const PRINT_PAPERS = { a3: [297, 420], a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4] };
  const PAPER_MARGIN = 26;
  function pdfPaper(rect, opts) {
    if (!opts.paper || opts.paper === 'free') {
      const k = opts.k || 0.75, PW = rect.w * k, PH = rect.h * k;
      if (PW > 14400 || PH > 14400) throw new Error('实际尺寸超过 PDF 单页上限，请使用纸张拼贴');
      return { PW, PH, k, ox: 0, oy: 0 };
    }
    const size = PRINT_PAPERS[opts.paper] || PRINT_PAPERS.a4;
    const landscape = opts.paper === 'a4l' || (opts.paper !== 'a4p' && rect.w >= rect.h);
    const PW = size[landscape ? 1 : 0] * 72 / 25.4, PH = size[landscape ? 0 : 1] * 72 / 25.4;
    if (opts.tile) return { PW, PH, k: 0.75, ox: PAPER_MARGIN, oy: PAPER_MARGIN };
    const k = Math.min((PW - 2 * PAPER_MARGIN) / rect.w, (PH - 2 * PAPER_MARGIN) / rect.h);
    return { PW, PH, k, ox: (PW - rect.w * k) / 2, oy: (PH - rect.h * k) / 2 };
  }

  function printTiles(rect, opts) {
    const p = pdfPaper(rect, opts), w = (p.PW - 2 * p.ox) / p.k, hh = (p.PH - 2 * p.oy) / p.k;
    const overlap = 10 * 96 / 25.4, dx = w - overlap, dy = hh - overlap;
    const cols = Math.max(1, Math.ceil((rect.w - overlap) / dx));
    const rows = Math.max(1, Math.ceil((rect.h - overlap) / dy));
    if (cols * rows > 64) throw new Error('实际尺寸需要超过 64 张纸，请缩小选区或选择更大的纸张');
    return { paper: p, rects: Array.from({ length: cols * rows }, (_, i) => ({
      x: rect.x + (i % cols) * dx, y: rect.y + Math.floor(i / cols) * dy, w, h: hh,
    })) };
  }

  async function toPDF(rect, opts) {
    opts = opts || {};
    rect = needRect(rect, opts);
    if (!rect) throw new Error('没有可导出的内容');
    if (opts.tile && opts.paper && opts.paper !== 'free') {
      const { paper, rects } = printTiles(rect, opts);
      return toPDFMulti(rects, { ...opts, page: opts.page || GW.page(), tilePaper: paper, tileArea: rect });
    }
    const { PW, PH, k, ox, oy } = pdfPaper(rect, opts);
    const T = (x, y) => [ox + (x - rect.x) * k, PH - oy - (y - rect.y) * k];

    const qk = opts.dpi ? 1 : qualityK();
    const ops = await collect(rect, Object.assign({}, opts, { k, mode: 'pdf', rasterQ: qk }));
    const wm = wmOp(rect, k);
    if (wm) ops.push(wm);                              // 右下角来源水印（见 6.5）

    // ---- 7.1 收集位图 / 透明度 / 字体 ----
    const images = [];                       // canvas 列表，下标即 /ImN
    for (const op of ops) if (op.k === 'img') { op._ix = images.length; images.push(op.cv); }
    const alphas = new Set();
    let needFont = false, needItalic = false;
    for (const op of ops) {
      if (op.st) alphas.add(q2(op.st.a));
      if (op.k === 't' && isLatin1(op.text)) needFont = true;
      // 排版（1.6.0）：斜体文字要单独一个 Helvetica-Oblique 字体对象
      if (op.k === 't' && isLatin1(op.text) && /\bitalic\b|\boblique\b/.test(String(op.st.font || ''))) needItalic = true;
    }
    const alphaList = Array.from(alphas).sort((a, b) => a - b);

    // ---- 7.2 对象编号 ----
    const CAT = 1, PAGES = 2, PAGE = 3, CONTENT = 4;
    let next = 5;
    const gsNo = {};
    for (const a of alphaList) gsNo[a] = next++;
    const FONT = needFont ? next++ : 0;
    const FONT2 = needItalic ? next++ : 0;

    // ---- 7.3 内容流 ----
    const CL = [];
    let qOpen = 0;
    const gs = (a) => '/GS' + (gsNo[q2(a)] || gsNo[1] || Object.values(gsNo)[0]) + ' gs';
    for (const op of ops) {
      if (op.k === 'q') { CL.push('q'); qOpen++; continue; }
      if (op.k === 'Q') { if (qOpen > 0) { CL.push('Q'); qOpen--; } continue; }
      if (op.k === 'clip') { CL.push(pathPdf(op.d, T), 'W', 'n'); continue; }   // G2：裁剪语义
      if (op.k === 'r') {
        const p0 = T(op.x, op.y + op.h);
        if (op.mode === 's') {
          CL.push('q', gs(op.st.a), rgbPdf(op.st.col) + ' RG', num((op.lw || 1) * k) + ' w', '[] 0 d',
            pathPdf(rectPath(op.x, op.y, op.w, op.h), T), 'S', 'Q');
        } else {
          CL.push('q', gs(op.st.a), rgbPdf(op.st.col) + ' rg',
            num(op.w * k) + ' ' + num(op.h * k) + ' ' + num(p0[0]) + ' ' + num(p0[1]) + ' re f', 'Q');
        }
      } else if (op.k === 'p') {
        const stroke = op.mode === 's';
        CL.push('q', gs(op.st.a), rgbPdf(op.st.col) + (stroke ? ' RG' : ' rg'));
        if (stroke) {
          CL.push(num((op.st.lw || 1) * k) + ' w',
            ({ butt: '0', round: '1', square: '2' }[op.st.cap] || '0') + ' J',
            ({ miter: '0', round: '1', bevel: '2' }[op.st.join] || '0') + ' j');
          const dsh = (op.st.dash || []).filter((v, i2) => i2 < 2).map((v) => num(v * k));
          CL.push('[' + (dsh.some((v) => parseFloat(v) > 0) ? dsh.join(' ') : '') + '] 0 d');
        }
        CL.push(pathPdf(op.d, T), stroke ? 'S' : 'f', 'Q');
      } else if (op.k === 'c') {
        CL.push('q', gs(op.st.a), rgbPdf(op.st.col) + ' rg', pathPdf(circleD(op.x, op.y, op.r), T), 'f', 'Q');
      } else if (op.k === 't') {
        const p0 = T(op.x, op.y);
        const fo = parseFont(op.st.font);
        const size = fo.size * k;
        let dx = 0;
        if (op.st.align === 'center' || op.st.align === 'right' || op.st.align === 'end') {
          const wpx = measure(op.st.font, op.text).width * k;
          dx = op.st.align === 'center' ? -wpx / 2 : -wpx;
        }
        let dy = 0;
        if (op.st.base === 'middle') dy = size * 0.35;
        else if (op.st.base === 'top' || op.st.base === 'hanging') dy = -size * 0.8;
        // G1：旋转文字。PDF 的 y 轴向上，所以世界角 rot 在 PDF 里是 -rot（sin 取反），
        // Tm 的线性部分换成旋转矩阵，基线偏移 (dx,dy) 跟着一起转。
        const rot = op.st.rot || 0;
        const ca = Math.cos(rot), sa = -Math.sin(rot);
        if (FONT && isLatin1(op.text)) {
          const fsel = (fo.style === 'italic' && FONT2) ? '/F2' : '/F1';
          if (rot) {
            const ex = p0[0] + dx * ca - dy * sa, ey = p0[1] + dx * sa + dy * ca;
            CL.push('q', gs(op.st.a), rgbPdf(op.st.col) + ' rg',
              'BT ' + fsel + ' ' + num(size) + ' Tf ' + [ca, sa, -sa, ca, ex, ey].map(num).join(' ') + ' Tm (' +
              op.text.replace(/([\\()])/g, '\\$1') + ') Tj ET', 'Q');
          } else {
            CL.push('q', gs(op.st.a), rgbPdf(op.st.col) + ' rg',
              'BT ' + fsel + ' ' + num(size) + ' Tf 1 0 0 1 ' + num(p0[0] + dx) + ' ' + num(p0[1] + dy) + ' Tm (' +
              op.text.replace(/([\\()])/g, '\\$1') + ') Tj ET', 'Q');
          }
        } else {
          const im = await textImage(op.text, op.st, fo, op.wm ? 1 : qk);   // 水印永远满像素（缩放之后打）
          if (im) {
            const idx = images.length;
            images.push(im);
            const bx = p0[0] + dx, by = p0[1] + dy - fo.size * 0.24 * k;      // 位图底边
            let cm;
            if (rot) {                        // 位图跟着字一起转（绕锚点 p0）
              const ux = bx - p0[0], uy = by - p0[1];
              cm = [imW(im) * ca, imW(im) * sa, -imH(im) * sa, imH(im) * ca,
                p0[0] + ux * ca - uy * sa, p0[1] + ux * sa + uy * ca].map(num).join(' ');
            } else {
              cm = num(imW(im)) + ' 0 0 ' + num(imH(im)) + ' ' + num(bx) + ' ' + num(by);
            }
            CL.push('q', cm + ' cm /Im' + (idx + 1) + ' Do', 'Q');
          }
        }
      } else if (op.k === 'img') {
        const p0 = T(op.x, op.y + op.h);
        CL.push('q', num(op.w * k) + ' 0 0 ' + num(op.h * k) + ' ' + num(p0[0]) + ' ' + num(p0[1]) + ' cm /Im' + (op._ix + 1) + ' Do', 'Q');
      }
    }
    while (qOpen-- > 0) CL.push('Q');          // 记录器里漏掉的 restore 不能把内容流带成未闭合的 q
    const contentRaw = new TextEncoder().encode(CL.join('\n'));
    const contentZ = await deflate(contentRaw);

    // ---- 7.4 位图编码（在内容流之后才知道最终张数，所以统一在这里编号）----
    const imgMeta = [];
    for (let i = 0; i < images.length; i++) {
      let data = null, w = 1, hh = 1;
      try {
        const r = await decodeImg(images[i]);
        data = r.data; w = r.w; hh = r.h;
      } catch (e) { console.warn('导出：位图编码失败（跨域？），用空白图代替', e); }
      imgMeta.push({ data, w, hh });
    }
    // 编号：先给内容流里已经用掉的 /ImN 分配，再给文本位图补上 SMask
    const imgNo = [];
    let cursor = next;
    for (let i = 0; i < imgMeta.length; i++) {
      const sm = imgMeta[i].data && imgMeta[i].data.hasA;
      imgNo.push({ no: cursor++, sm: sm ? cursor++ : 0 });
    }

    // ---- 7.5 组装对象 ----
    const objs = [];
    const put = (s) => (objs.push(s), objs.length);
    put('<< /Type /Catalog /Pages ' + PAGES + ' 0 R >>');
    put('<< /Type /Pages /Kids [' + PAGE + ' 0 R] /Count 1 >>');
    const xo = imgNo.map((v, i) => '/Im' + (i + 1) + ' ' + v.no + ' 0 R');
    const resources = '<< /XObject << ' + xo.join(' ') + ' >> /ExtGState << ' +
      alphaList.map((a) => '/GS' + gsNo[a] + ' ' + gsNo[a] + ' 0 R').join(' ') + ' >>' +
      (FONT ? ' /Font << /F1 ' + FONT + ' 0 R' + (FONT2 ? ' /F2 ' + FONT2 + ' 0 R' : '') + ' >>' : '') + ' >>';
    put('<< /Type /Page /Parent ' + PAGES + ' 0 R /MediaBox [0 0 ' + num(PW) + ' ' + num(PH) + '] ' +
      '/Resources ' + resources + ' /Contents ' + CONTENT + ' 0 R >>');
    put('<< /Length ' + (contentZ ? contentZ.length : contentRaw.length) + (contentZ ? ' /Filter /FlateDecode' : '') +
      ' >>\nstream\n' + binStr(contentZ || contentRaw) + '\nendstream');
    for (const a of alphaList) put('<< /Type /ExtGState /ca ' + a + ' /CA ' + a + ' >>');
    if (FONT) put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    if (FONT2) put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
    for (let i = 0; i < imgMeta.length; i++) {
      const meta = imgMeta[i], no = imgNo[i];
      if (!meta.data) {
        // 空白 1×1 透明图兜底
        const z = await deflate(new Uint8Array([0, 0, 0]));
        const za = await deflate(new Uint8Array([0]));
        put('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8' +
          (z ? ' /Filter /FlateDecode' : '') + ' /SMask ' + no.sm + ' 0 R /Length ' + (z ? z.length : 3) +
          ' >>\nstream\n' + binStr(z || new Uint8Array([0, 0, 0])) + '\nendstream');
        put('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8' +
          (za ? ' /Filter /FlateDecode' : '') + ' /Length ' + (za ? za.length : 1) + ' >>\nstream\n' + binStr(za || new Uint8Array([0])) + '\nendstream');
        continue;
      }
      const z = await deflate(meta.data.rgb);
      put('<< /Type /XObject /Subtype /Image /Width ' + meta.w + ' /Height ' + meta.hh +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8' + (z ? ' /Filter /FlateDecode' : '') +
        (no.sm ? ' /SMask ' + no.sm + ' 0 R' : '') + ' /Length ' + (z ? z.length : meta.data.rgb.length) +
        ' >>\nstream\n' + binStr(z || meta.data.rgb) + '\nendstream');
      if (no.sm) {
        const za = await deflate(meta.data.al);
        put('<< /Type /XObject /Subtype /Image /Width ' + meta.w + ' /Height ' + meta.hh +
          ' /ColorSpace /DeviceGray /BitsPerComponent 8' + (za ? ' /Filter /FlateDecode' : '') +
          ' /Length ' + (za ? za.length : meta.data.al.length) + ' >>\nstream\n' + binStr(za || meta.data.al) + '\nendstream');
      }
    }
    return bytesToB64(pdfBytes(objs));
  }
  function isLatin1(s) { return /^[\x20-\x7e\xa0-\xff]*$/.test(String(s)); }
  function pdfBytes(objs) {
    let out = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
    const offs = [];
    for (let i = 0; i < objs.length; i++) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
    // 末尾多挂一个信息字典，把构建指纹写进导出物（便于识别是哪一版导出的）。
    // 值只留 ASCII：PDF 的字面字符串放不下中文；xref 偏移是边写边记的，加一个对象不影响前面。
    const infoN = objs.length + 1;
    offs.push(out.length);
    out += infoN + ' 0 obj\n<< /Producer (' + asciiTag() + ') /Creator (gewu-board) >>\nendobj\n';
    const xref = out.length;
    out += 'xref\n0 ' + (objs.length + 2) + '\n0000000000 65535 f \n';
    for (const o of offs) out += ('0000000000' + o).slice(-10) + ' 00000 n \n';
    out += 'trailer\n<< /Size ' + (objs.length + 2) + ' /Root 1 0 R /Info ' + infoN + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    const u8 = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 255;
    return u8;
  }
  function asciiTag() {
    const id = (GW.BUILD && GW.BUILD.id) || 'gewu-board';
    return ('gewu-board ' + id).replace(/[^\x20-\x7e]/g, '').replace(/[\\()]/g, '');
  }
  // 画布上含中文的文字（比如用户自己改的坐标轴标签）渲染成小位图
  // q = 导出质量档位的位图倍率：只改像素密度，不改「画出来多大」——
  // 落位一律用 _gw 里的原始尺寸，所以 medium/lowest 只是糊一点、版式不动。
  async function textImage(text, st, fo, q) {
    try {
      q = Math.max(0.25, Math.min(1, q || 1));
      const m = measure(st.font, text);
      const w = Math.max(2, Math.ceil(m.width) + 4), hh = Math.ceil(fo.size * 1.45);
      const cv = document.createElement('canvas');
      cv.width = Math.max(2, Math.round(w * q)); cv.height = Math.max(2, Math.round(hh * q));
      cv._gw = { w: w, h: hh };
      const c = cv.getContext('2d');
      c.setTransform(q, 0, 0, q, 0, 0);
      c.font = st.font;
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillStyle = 'rgb(' + (st.col.r | 0) + ',' + (st.col.g | 0) + ',' + (st.col.b | 0) + ')';
      c.fillText(text, 2, Math.round(fo.size * 1.05));
      return cv;
    } catch (e) { return null; }
  }
  // 位图对象的「落位尺寸」：缩放只动像素，不动版式（见 textImage 的 _gw）
  function imW(im) { return (im._gw && im._gw.w) || im.width; }
  function imH(im) { return (im._gw && im._gw.h) || im.height; }

  // ============================================================
  // 8. 取范围 / 落盘 / 对话框
  // ============================================================
  function padRect(b, pad) { return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }; }
  function pickRect(range) {
    if (range === 'sel' && GW.selection && GW.selection.items.length) {
      const b = GW.selection.bounds();
      if (b) return padRect(b, Math.max(b.w, b.h) * 0.03 + 6);
    }
    if (range === 'view') return GW.viewRect();
    // 1.6.8（R8）：纸张页「导出整页」= 导出那张纸。
    // 2.0.8：判据改成**页面自己的纸框**（GW.pageBox()），不再看全局 settings.layout ——
    // 2.0.7 起「有限」是页级属性（page.paged 落盘），全局 layout 可能还是 infinite，
    // 老写法会让一张标准的整页模板页导出成「内容包围盒」，纸边与页边距全丢。
    const box = GW.pageBox && GW.pageBox();
    if (box) return { x: box.x, y: box.y, w: box.w, h: box.h };
    const b = GW.contentBounds(GW.page());
    if (!b) return null;
    return padRect(b, Math.max(b.w, b.h) * 0.03 + 12);
  }
  // 直接给一组 id 时（比如 `GW.exporter.svg(null, {selIds})` 这种调用），自己算外接框
  function rectFromIds(ids) {
    const set = new Set(ids);
    const p = GW.page();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const it of p.ink) {
      if (!set.has(it.id)) continue;
      const b = GW.bbox(it);
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    for (const o of p.objs) {
      if (!set.has(o.id)) continue;
      x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + o.h);
    }
    if (x1 < x0 || y1 < y0) return null;
    return padRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 12);
  }
  // 没给矩形时自己挑一个：有 selIds 就按这些对象算，否则按 range
  function needRect(rect, opts) {
    if (rect) return rect;
    if (opts.selIds && opts.selIds.length) return rectFromIds(opts.selIds);
    return pickRect(opts.range || 'page');
  }
  function baseName(p) {
    const s = String(p || '').replace(/\\/g, '/');
    const f = s.slice(s.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
    return f || '板书';
  }
  async function save(name, data, enc) {
    const ext = name.slice(name.lastIndexOf('.') + 1);
    // 能力探测（与 622 行 captureView 同一口径）：桌面桥、安卓外壳、网页版都实现了
    // saveDialog + writeFile 这一对 —— 桌面弹系统另存为、安卓写系统下载目录、网页触发下载，
    // 三端走的都是同一条路径，所以这里不再判 GW.isElectron。
    const g = window.gewu;
    const canSave = !!(g && typeof g.saveDialog === 'function' && typeof g.writeFile === 'function');
    if (canSave) {
      const native = !!window.gewuNative;
      const p = await g.saveDialog({
        title: '导出为 ' + ext.toUpperCase(),
        defaultPath: name,
        filters: [{ name: ext.toUpperCase() + ' 文件', extensions: [ext] }],
      });
      if (!p) return false;
      const saved = await g.writeFile(p, data, enc);
      if (saved === false) throw new Error('文件未写入下载目录');
      GW.toast((native ? '已保存到下载目录：' : '已导出：') + String(p).replace(/^.*[\\/]/, ''), 3200);
      return true;
    }
    const type = ext === 'svg' ? 'image/svg+xml' : 'application/pdf';
    const buf = enc === 'base64' ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) : data;
    const a = h('a', { href: URL.createObjectURL(new Blob([buf], { type })), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return true;
  }

  async function print(rect, opts) {
    const report = [];
    opts = { bg: true, paper: 'a4', ...opts, report };
    const portrait = opts.paper === 'a4p' || (opts.paper !== 'a4l' && rect.h > rect.w);
    if (window.gewuNative) {
      const pdf = await toPDF(rect, opts);
      if (!(typeof window.gewuNative.printPdf === 'function' && await window.gewuNative.printPdf(pdf, !portrait))) {
        await save('板书.pdf', pdf, 'base64');
      }
      showReport(report);
      return;
    }
    const width = portrait ? 210 : 297, height = portrait ? 297 : 210;
    const svg = await toSVG(rect, opts);
    const frame = h('iframe', { title: '打印预览', sandbox: 'allow-same-origin allow-modals', style: { position: 'fixed', width: '1px', height: '1px', left: '-10000px', border: '0' } });
    document.body.append(frame);
    try {
      const doc = frame.contentDocument;
      const style = doc.createElement('style');
      style.textContent = '@page{size:' + width + 'mm ' + height + 'mm;margin:0}' +
        'body{margin:0;width:' + width + 'mm;height:' + height + 'mm;display:grid;place-items:center;print-color-adjust:exact;-webkit-print-color-adjust:exact}' +
        'svg{display:block;max-width:' + (width - 18.35) + 'mm;max-height:' + (height - 18.35) + 'mm}';
      doc.head.append(style);
      const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (parsed.querySelector('parsererror')) throw new Error('打印预览无法读取 SVG');
      const art = doc.importNode(parsed.documentElement, true);
      const size = Math.min((width - 18.35) / rect.w, (height - 18.35) / rect.h);
      art.setAttribute('width', rect.w * size + 'mm');
      art.setAttribute('height', rect.h * size + 'mm');
      doc.body.append(art);
      if (doc.fonts) await doc.fonts.ready;
      frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
      frame.contentWindow.print();
      showReport(report);
    } catch (err) {
      frame.remove();
      throw err;
    }
  }

  let busy = false;
  function showReport(report) {
    if (!report.length) return;
    const items = [...new Map(report.map((it) => [it.id + ':' + it.reason, it])).values()];
    GW.dialog({ title: '导出完成 · 画面说明', ok: '完成', cancel: null, width: 520,
      body: h('ul', { class: 'pptx-report' }, items.map((it) => h('li', null, (it.name || it.type) + ' · ' + it.reason))) });
  }
  async function run(fmt, range, withBg, paper, dpi, tile) {
    if (busy) return;
    // 1.6.9：分页版式的「逐页」导出 —— 一个文件里 N 张 A4，空页跳过
    if (range === 'pages' && fmt === 'pdf') return runPages(withBg, paper, dpi);
    const rect = pickRect(range);
    if (!rect || rect.w < 1 || rect.h < 1) { GW.toast('这一页还是空的，没有可导出的内容'); return; }
    busy = true;
    if (GW.progress) GW.progress('正在生成 ' + fmt.toUpperCase() + '…');
    try {
      const stem = baseName(GW.doc.path) + '-第' + (GW.doc.cur + 1) + '页';
      const selIds = (range === 'sel' && GW.selection) ? GW.selection.items.map((i) => i.id) : null;
      const report = [];
      const nativeView = range === 'view' && withBg && !tile;
      if (fmt === 'svg') {
        const svg = await toSVG(rect, { bg: withBg, selIds, report, dpi, physical: true, nativeView });
        if (!await save(stem + '.svg', svg, 'utf8')) return;
      } else {
        const b64 = await toPDF(rect, { bg: withBg, paper, selIds, report, dpi, tile, nativeView });
        if (!await save(stem + '.pdf', b64, 'base64')) return;
      }
      showReport(report);
    } catch (e) {
      console.error('导出失败', e);
      GW.toast('导出失败：' + (e && e.message ? e.message : e), 4000);
    } finally {
      busy = false;
      if (GW.progress) GW.progress(null);
    }
  }

  // 逐页导出：算出每一页的矩形，交给多页 PDF 生成器；文件名不再带「第 N 页」
  async function runPages(withBg, paper, dpi) {
    const rects = pageRects();
    const n = rects.filter(Boolean).length;
    if (!n) { GW.toast('这几页都是空的，没有可导出的内容'); return; }
    busy = true;
    if (GW.progress) GW.progress('正在生成 ' + n + ' 页 PDF…');
    try {
      const report = [];
      const b64 = await toPDFMulti(rects, { bg: withBg, paper, report, dpi });
      const stem = baseName(GW.doc.path) + '-' + n + '页';
      if (await save(stem + '.pdf', b64, 'base64')) showReport(report);
    } catch (e) {
      console.error('导出失败', e);
      GW.toast('导出失败：' + (e && e.message ? e.message : e), 4000);
    } finally {
      busy = false;
      if (GW.progress) GW.progress(null);
    }
  }

  function rowEl(title, desc, ctl) {
    return h('div', { class: 'set-row' },
      h('div', null, h('b', null, title), desc ? h('span', null, desc) : null), ctl);
  }
  function open() {
    const hasSel = !!(GW.selection && GW.selection.items.length);
    let fmt = 'pdf', range = hasSel ? 'sel' : 'view';
    const bgT = GW.ui.toggle({ label: '包含背景与底纹', value: true });
    const choices = (label, options) => h('select', { class: 'inp', 'aria-label': label }, options.map(([value, name]) => h('option', { value }, name)));
    const paperChoice = choices('PDF 纸张', [['a4', 'A4 自动'], ['a4l', 'A4 横向'], ['a4p', 'A4 纵向'], ['a3', 'A3 自动'], ['a5', 'A5 自动'], ['letter', 'Letter 自动'], ['free', '按内容实际大小']]);
    const dpiChoice = choices('重绘分辨率', [['', '沿用导出质量设置'], [150, '150 DPI'], [300, '300 DPI'], [600, '600 DPI']]);
    const tile = GW.ui.toggle({ label: '按实际大小拼贴', value: false });
    const paged = (GW.doc.pages || []).length > 1;
    const rangeSeg = GW.ui.segmented({
      options: [{ value: 'view', label: '当前画面' }, { value: 'page', label: '整页内容' }]
        .concat(paged ? [{ value: 'pages', label: '逐页（全部 ' + GW.doc.pages.length + ' 页）' }] : [])
        .concat(hasSel ? [{ value: 'sel', label: '所选内容' }] : []),
      value: range,
      onChange: (v) => { range = v; syncOptions(); },
    });
    const paperRow = rowEl('PDF 纸张', '默认适配纸张，选实际大小可保留画布比例。', paperChoice);
    const tileRow = rowEl('跨页拼贴', '按 1:1 拆到多张纸，保留 10 mm 重叠与裁切标记。', tile.el);
    function syncOptions() {
      paperRow.hidden = fmt !== 'pdf';
      tileRow.hidden = fmt !== 'pdf' || range === 'pages' || paperChoice.value === 'free';
      const pagesButton = rangeSeg.el.querySelector('[data-v="pages"]');
      if (pagesButton) pagesButton.hidden = fmt !== 'pdf';
      if (fmt !== 'pdf' && range === 'pages') { range = 'page'; rangeSeg.set(range); }
    }
    paperChoice.addEventListener('change', syncOptions);
    const fmtSeg = GW.ui.segmented({
      options: [{ value: 'pdf', label: 'PDF' }, { value: 'svg', label: 'SVG' }],
      value: fmt,
      onChange: (v) => { fmt = v; syncOptions(); },
    });
    const body = h('div', { class: 'exp-body' },
      rowEl('导出格式', 'PDF 适合打印与分发，SVG 适合插入文档。', fmtSeg.el),
      rowEl('导出范围', '当前画面保留屏幕可见区域，整页内容覆盖本页所有笔迹与对象。', rangeSeg.el),
      rowEl('背景', '关掉就只剩笔迹和图形，方便叠到别的文档里', bgT.el),
      paperRow,
      tileRow,
      rowEl('重绘分辨率', '控制可重绘对象，原图清晰度受原始像素限制。', dpiChoice),
      h('div', { class: 'exp-tip' },
        '· 在支持屏幕捕获的应用中，选择「当前画面」并保留背景，会按屏幕显示导出网页、仿真、视频与 PPT 的当前帧。\n' +
        '· 其他范围保留可重绘内容的矢量清晰度，无法读取的项目会标注位置。'));
    GW.dialog({
      title: '导出 PDF / SVG', body, ok: '导出…', width: 620,
      onOk: () => { run(fmt, range, bgT.get(), paperChoice.value, +dpiChoice.value, !tileRow.hidden && tile.get()); },
    });
  }

  // =============== 8. 分页版式：逐页导出成一个多页 PDF（1.6.9） ===============
  // 1.6.8 的分页版式只做到「画布上显示一张纸」；导出仍然只导当前页一个矩形，
  // 页边距也只是画在画布上。这里补完：一篇板书 N 页 → 一个 N 页的 A4 PDF，
  // 每页的边距按「页边距」设置内缩（内容不会被裁到纸外），空页自动跳过。
  // 实现上每页都临时把 doc.cur 挪过去调一次 collect()，最后立刻还原 —— 复用单页
  // 导出那条已经被探针覆盖的收集链路，而不是另写一套。「逐页」与「当前页」的区别
  // 只在于矩形从哪来、以及对象编号里塞了几张 Page。
  function inkRect(p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of p.ink || []) {
      const b = GW.bbox(it);
      if (!b || !(b.w >= 0) || !(b.h >= 0)) continue;
      if (b.x === -1 && b.y === -1) continue;      // 退化框（形状没算出来）不算内容
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    for (const o of p.objs || []) {
      x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y);
      x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + o.h);
    }
    if (x1 < x0 || y1 < y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // 一页的导出矩形：内容外接框 + 页边距（没有边距就留 24 世界单位的白边）
  function rectForPage(p) {
    const b = inkRect(p);
    if (!b) return null;
    const m = (p && p.margin) || null;
    const pad = m ? null : 24;
    return {
      x: b.x - (m ? (m.l || 0) : pad),
      y: b.y - (m ? (m.t || 0) : pad),
      w: b.w + (m ? (m.l || 0) + (m.r || 0) : pad * 2),
      h: b.h + (m ? (m.t || 0) + (m.b || 0) : pad * 2),
    };
  }
  // 所有非空页的矩形（按下标对齐，空页为 null）
  function pageRects() {
    const out = [];
    for (const p of GW.doc.pages || []) out.push(rectForPage(p));
    return out;
  }

  // 多页 PDF：每页一份独立内容流，共用 alphas / 字体 / 位图对象
  async function toPDFMulti(rects, opts) {
    opts = opts || {};
    const qk = opts.dpi ? 1 : qualityK();
    const list = [];
    const sourcePages = GW.doc.pages.slice();
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      if (!rect || rect.w < 1 || rect.h < 1) { list.push(null); continue; }
      const { PW, PH, k, ox, oy } = opts.tilePaper || pdfPaper(rect, opts);
      const T = (x, y) => [ox + (x - rect.x) * k, PH - oy - (y - rect.y) * k];
      const ops = await collect(rect, Object.assign({}, opts, { page: opts.page || sourcePages[i], k, mode: 'pdf', rasterQ: qk }));
      const wm = wmOp(rect, k);
      if (wm) ops.push(wm);
      list.push({ rect, PW, PH, k, T, ops, ox, oy, CL: [] });
    }

    const pages = list.filter(Boolean);
    if (!pages.length) throw new Error('没有可导出的内容');

    // 编号：1 Catalog、2 Pages、之后每页一对 Page/Contents，再是 ExtGState / Font / Image
    const images = [], alphas = new Set();
    let needFont = false, needItalic = false;
    for (const pg of pages) {
      for (const op of pg.ops) {
        if (op.k === 'img') { op._ix = -1; }
        if (op.st) alphas.add(q2(op.st.a));
        if (op.k === 't' && isLatin1(op.text)) needFont = true;
        if (op.k === 't' && isLatin1(op.text) && /\bitalic\b|\boblique\b/.test(String(op.st.font || ''))) needItalic = true;
      }
    }
    const alphaList = Array.from(alphas).sort((a, b) => a - b);

    let next = 3 + pages.length * 2;
    const gsNo = {};
    for (const a of alphaList) gsNo[a] = next++;
    const FONT = needFont ? next++ : 0;
    const FONT2 = needItalic ? next++ : 0;

    // 每页的内容流（位图对象在全部页面都收完之后才统一编号，所以要两遍）
    for (const pg of pages) {
      const CL = pg.CL;
      if (opts.tilePaper) CL.push('q', num(pg.ox) + ' ' + num(pg.oy) + ' ' + num(pg.PW - 2 * pg.ox) + ' ' + num(pg.PH - 2 * pg.oy) + ' re W n');
      const T = pg.T, k = pg.k, rect = pg.rect;
      let qOpen = 0;
      const gs = (a) => '/GS' + (gsNo[q2(a)] || gsNo[1] || Object.values(gsNo)[0]) + ' gs';
      for (const op of pg.ops) {
        if (op.k === 'q') { CL.push('q'); qOpen++; continue; }
        if (op.k === 'Q') { if (qOpen > 0) { CL.push('Q'); qOpen--; } continue; }
        if (op.k === 'clip') { CL.push(pathPdf(op.d, T), 'W', 'n'); continue; }
        if (op.k === 'r') {
          const p0 = T(op.x, op.y + op.h);
          if (op.mode === 's') {
            CL.push('q', gs(op.st.a), rgbPdf(op.st.col) + ' RG', num((op.lw || 1) * k) + ' w', '[] 0 d',
              pathPdf(rectPath(op.x, op.y, op.w, op.h), T), 'S', 'Q');
          } else {
            CL.push('q', gs(op.st.a), rgbPdf(op.st.col) + ' rg',
              num(op.w * k) + ' ' + num(op.h * k) + ' ' + num(p0[0]) + ' ' + num(p0[1]) + ' re f', 'Q');
          }
        } else if (op.k === 'p') {
          const stroke = op.mode === 's';
          CL.push('q', gs(op.st.a), rgbPdf(op.st.col) + (stroke ? ' RG' : ' rg'));
          if (stroke) {
            CL.push(num((op.st.lw || 1) * k) + ' w',
              ({ butt: '0', round: '1', square: '2' }[op.st.cap] || '0') + ' J',
              ({ miter: '0', round: '1', bevel: '2' }[op.st.join] || '0') + ' j');
            const dsh = (op.st.dash || []).filter((v, i2) => i2 < 2).map((v) => num(v * k));
            CL.push('[' + (dsh.some((v) => parseFloat(v) > 0) ? dsh.join(' ') : '') + '] 0 d');
          }
          CL.push(pathPdf(op.d, T), stroke ? 'S' : 'f', 'Q');
        } else if (op.k === 'c') {
          CL.push('q', gs(op.st.a), rgbPdf(op.st.col) + ' rg', pathPdf(circleD(op.x, op.y, op.r), T), 'f', 'Q');
        } else if (op.k === 't') {
          const p0 = T(op.x, op.y);
          const fo = parseFont(op.st.font);
          const size = fo.size * k;
          let dx = 0;
          if (op.st.align === 'center' || op.st.align === 'right' || op.st.align === 'end') {
            const wpx = measure(op.st.font, op.text).width * k;
            dx = op.st.align === 'center' ? -wpx / 2 : -wpx;
          }
          let dy = 0;
          if (op.st.base === 'middle') dy = size * 0.35;
          else if (op.st.base === 'top' || op.st.base === 'hanging') dy = -size * 0.8;
          const rot = op.st.rot || 0;
          const ca = Math.cos(rot), sa = -Math.sin(rot);
          if (FONT && isLatin1(op.text)) {
            const fsel = (fo.style === 'italic' && FONT2) ? '/F2' : '/F1';
            if (rot) {
              const ex = p0[0] + dx * ca - dy * sa, ey = p0[1] + dx * sa + dy * ca;
              CL.push('q', gs(op.st.a), rgbPdf(op.st.col) + ' rg',
                'BT ' + fsel + ' ' + num(size) + ' Tf ' + [ca, sa, -sa, ca, ex, ey].map(num).join(' ') + ' Tm (' +
                op.text.replace(/([\\()])/g, '\\$1') + ') Tj ET', 'Q');
            } else {
              CL.push('q', gs(op.st.a), rgbPdf(op.st.col) + ' rg',
                'BT ' + fsel + ' ' + num(size) + ' Tf 1 0 0 1 ' + num(p0[0] + dx) + ' ' + num(p0[1] + dy) + ' Tm (' +
                op.text.replace(/([\\()])/g, '\\$1') + ') Tj ET', 'Q');
            }
          } else {
            const im = await textImage(op.text, op.st, fo, op.wm ? 1 : qk);   // 水印永远满像素
            if (im) {
              if (op._ix < 0) op._ix = images.length;
              const idx = images.length;
              images.push(im);
              const bx = p0[0] + dx, by = p0[1] + dy - fo.size * 0.24 * k;
              let cm;
              if (rot) {
                const ux = bx - p0[0], uy = by - p0[1];
                cm = [imW(im) * ca, imW(im) * sa, -imH(im) * sa, imH(im) * ca,
                  p0[0] + ux * ca - uy * sa, p0[1] + ux * sa + uy * ca].map(num).join(' ');
              } else {
                cm = num(imW(im)) + ' 0 0 ' + num(imH(im)) + ' ' + num(bx) + ' ' + num(by);
              }
              CL.push('q', cm + ' cm /Im' + (idx + 1) + ' Do', 'Q');
            }
          }
        } else if (op.k === 'img') {
          if (op._ix < 0) { op._ix = images.length; images.push(op.cv); }
          const p0 = T(op.x, op.y + op.h);
          CL.push('q', num(op.w * k) + ' 0 0 ' + num(op.h * k) + ' ' + num(p0[0]) + ' ' + num(p0[1]) + ' cm /Im' + (op._ix + 1) + ' Do', 'Q');
        }
      }
      while (qOpen-- > 0) CL.push('Q');
      if (opts.tilePaper) {
        CL.push('Q', 'q 0 G 0.5 w');
        for (const x of [pg.ox, pg.PW - pg.ox]) for (const y of [pg.oy, pg.PH - pg.oy]) {
          const sx = x < pg.PW / 2 ? -1 : 1, sy = y < pg.PH / 2 ? -1 : 1;
          CL.push(num(x + sx * 2) + ' ' + num(y) + ' m ' + num(x + sx * 9) + ' ' + num(y) + ' l S',
            num(x) + ' ' + num(y + sy * 2) + ' m ' + num(x) + ' ' + num(y + sy * 9) + ' l S');
        }
        CL.push('Q');
      }
    }

    // 位图编码 + 编号
    const imgMeta = [];
    for (let i = 0; i < images.length; i++) {
      let data = null, w = 1, hh = 1;
      try {
        const r = await decodeImg(images[i]);
        data = r.data; w = r.w; hh = r.h;
      } catch (e) { console.warn('导出：位图编码失败（跨域？），用空白图代替', e); }
      imgMeta.push({ data, w, hh });
    }
    const imgNo = [];
    let cursor = next;
    for (let i = 0; i < imgMeta.length; i++) {
      const sm = imgMeta[i].data && imgMeta[i].data.hasA;
      imgNo.push({ no: cursor++, sm: sm ? cursor++ : 0 });
    }

    const objs = [];
    const put = (s) => (objs.push(s), objs.length);
    const kids = pages.map((_, i) => (3 + i * 2) + ' 0 R');
    put('<< /Type /Catalog /Pages 2 0 R >>');
    put('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>');
    const xo = imgNo.map((v, i) => '/Im' + (i + 1) + ' ' + v.no + ' 0 R');
    const resources = '<< /XObject << ' + xo.join(' ') + ' >> /ExtGState << ' +
      alphaList.map((a) => '/GS' + gsNo[a] + ' ' + gsNo[a] + ' 0 R').join(' ') + ' >>' +
      (FONT ? ' /Font << /F1 ' + FONT + ' 0 R' + (FONT2 ? ' /F2 ' + FONT2 + ' 0 R' : '') + ' >>' : '') + ' >>';
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      const contentZ = await deflate(new TextEncoder().encode(pg.CL.join('\n')));
      put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(pg.PW) + ' ' + num(pg.PH) + '] ' +
        '/Resources ' + resources + ' /Contents ' + (4 + i * 2) + ' 0 R >>');
      put('<< /Length ' + (contentZ ? contentZ.length : 1) + (contentZ ? ' /Filter /FlateDecode' : '') +
        ' >>\nstream\n' + binStr(contentZ || new Uint8Array([10])) + '\nendstream');
    }
    for (const a of alphaList) put('<< /Type /ExtGState /ca ' + a + ' /CA ' + a + ' >>');
    if (FONT) put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    if (FONT2) put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
    for (let i = 0; i < imgMeta.length; i++) {
      const meta = imgMeta[i], no = imgNo[i];
      if (!meta.data) {
        const z = await deflate(new Uint8Array([0, 0, 0]));
        const za = await deflate(new Uint8Array([0]));
        put('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8' +
          (z ? ' /Filter /FlateDecode' : '') + ' /SMask ' + no.sm + ' 0 R /Length ' + (z ? z.length : 3) +
          ' >>\nstream\n' + binStr(z || new Uint8Array([0, 0, 0])) + '\nendstream');
        put('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8' +
          (za ? ' /Filter /FlateDecode' : '') + ' /Length ' + (za ? za.length : 1) + ' >>\nstream\n' + binStr(za || new Uint8Array([0])) + '\nendstream');
        continue;
      }
      const z = await deflate(meta.data.rgb);
      put('<< /Type /XObject /Subtype /Image /Width ' + meta.w + ' /Height ' + meta.hh +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8' + (z ? ' /Filter /FlateDecode' : '') +
        (no.sm ? ' /SMask ' + no.sm + ' 0 R' : '') + ' /Length ' + (z ? z.length : meta.data.rgb.length) +
        ' >>\nstream\n' + binStr(z || meta.data.rgb) + '\nendstream');
      if (no.sm) {
        const za = await deflate(meta.data.al);
        put('<< /Type /XObject /Subtype /Image /Width ' + meta.w + ' /Height ' + meta.hh +
          ' /ColorSpace /DeviceGray /BitsPerComponent 8' + (za ? ' /Filter /FlateDecode' : '') +
          ' /Length ' + (za ? za.length : meta.data.al.length) + ' >>\nstream\n' + binStr(za || meta.data.al) + '\nendstream');
      }
    }
    return bytesToB64(pdfBytes(objs));
  }

  GW.exporter = { open, svg: toSVG, pdf: toPDF, pdfMulti: toPDFMulti, print, collect, run, pickRect, fitK, pageRects, captureView };
  GW.exportSVG = () => open();
  GW.exportPDF = () => open();
})();

