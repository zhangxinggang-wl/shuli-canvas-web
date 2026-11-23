/* 自定义图形 · 纯函数层（浏览器 / Node / Worker 共用，不碰 GW 与 DOM）
   - 默认提示词（契约 A + 视觉规范 S + 需求模板 C）
   - 代码清洗、编译、静态校验
   - 试画校验：真画到 400×300 画布上量像素（参数敏感性 / 动图 / 线宽 / 构图）
   浏览器：GW.shapeSelfLint；Node：require 后可直接跑单测。
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.GW = root.GW || {}; root.GW.shapeSelfLint = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PROMPT_KEY = 'gewu.shapePrompt.v1';
  const MAX_CODE = 12000;
  const MAX_SHAPES = 80;
  const W = 400, H = 300;
  const FORBIDDEN = ['createLinearGradient', 'createRadialGradient', 'createPattern', 'shadowBlur', 'shadowColor',
    'globalCompositeOperation', 'drawImage', 'document.', 'window.', 'localStorage', 'fetch(', 'new Function', 'eval('];
  const ICON_TAGS = ['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g'];

  /* ---------- 默认提示词 ---------- */
  const CONTRACT = `【A 输出契约 —— 只输出代码，不写解释】
A1 只输出一个 js 代码块：先若干行 param(...)，再一到多个 shape({...})。
   不要 import / require / export，不要 HTML，不要解释性段落（可以写 // 注释）。
A2 shape 的字段（除 key / label / draw 外都可省略）：
   key        英文开头、字母数字、≤24 字符（本项目自动加前缀，不要自己加）
   label      中文名，面板卡片上显示
   icon       可选，24×24 的 SVG 子元素，只允许 <path> <circle> <rect> <line> <polyline> <polygon>；
              一般 2–4 条 <path d="..." />，按笔画式画（描边会自动取色）
   fill       可选，true = 默认给主体填充（多数图形不要）
   animatable 可选，true = 可按播放键的动画；draw 里读 o.animT（单位秒，一直累加，不归零）
   params     参数名数组，每个名字必须先用 param() 声明
   draw(c, o, U)  画图函数；只准用 c 和 U，不准读全局变量、不准 Date.now / Math.random
A3 param(name, {label, min, max, step, def, unit})：
   name 英文、全图唯一；label 中文；def 必须落在 min–max 内；
   unit 写 '°' 'N' 'm/s' 'cm'，开关类写 '0无1有'（min 0、max 1、step 1）。
A4 坐标：o 是一个对象（o.x1 / o.y1 / o.x2 / o.y2 方向任意），必须
   const b = U.bbox(o) 取 {x1,y1,x2,y2,w,h,cx,cy}，所有尺寸写成 b.w / b.h 的比例——
   这张图会被拖成任意大小的框，写死像素会变形。
A5 线宽和颜色由外层给：c.lineWidth 已经是 o.width，c.strokeStyle 已经是 o.color。
   不要改这两项；辅助细线可临时 c.lineWidth = o.width * 0.6，画完恢复。
   填充用 U.alpha(o.color, a) 当 fillStyle。
A6 U 助手（只能用这些 + 原生 canvas 路径；不要自己 setLineDash 后忘了恢复）：
   U.size                     当前线宽（数值）
   U.bbox(o)                  {x1,y1,x2,y2,w,h,cx,cy}
   U.line(x1,y1,x2,y2)        直线
   U.arrow(x1,y1,x2,y2,opt)   带箭头直线，opt.head 指定箭头长（默认 4×线宽）
   U.circle(cx,cy,r,opt)      圆；opt.fill 给 0–1 的透明度就顺带填充
   U.arc(cx,cy,r,a0,a1)       圆弧；角度用弧度，0 = 正右，正角度往下（屏幕坐标）
   U.poly([[x,y],...],close)  折线 / 多边形
   U.text(str,x,y,opt)        文字；opt {size:12–16, bold, align:'left'|'center'|'right', baseline, color}
   U.alpha(color,a)           把颜色变半透明
   U.lerp(a,b,t) / U.clamp(v,a,b)
   虚线：c.save(); c.setLineDash([6,4]); …画…; c.restore()
A7 必须真的画出东西：主体在 b 内留 8%–12% 边距，整体占框 60%–90%。`;

  const STYLE = `【S 视觉规范 —— 和内置 129 个图形一个模子】
S1 单色为主：线条不单独配色，统一跟随 o.color（中性墨色）；不要给每条线设不同颜色。
S2 强调色最多 2–3 处，且每个颜色都要有含义（重力、支持力、轨迹、场区）；不要铺底色、不要彩虹。
S3 填充只用 U.alpha(o.color, ≤0.25)，且只填小面积（物块、箭头三角、场区）；不填大背景。
S4 文字 12–16px，中文 + 单位（°、N、m/s），放在主体外侧 12–18px，不压线、不出框。
S5 箭头细长：长度 0.25–0.4×min(w,h)，箭头长 4–7×线宽，不要画巨大三角。
S6 虚线只用于：辅助线、法线、场区边界、轨迹提示。
S7 禁止：gradient / pattern / shadow / filter / globalCompositeOperation / drawImage / DOM / 网络。
S8 构图撑满 60%–90%，主体居中、四周留白均匀，不要缩在角落。
S9 从物体中心出发的力箭头，起点就是物体中心（物块中心 = 接触点 + 法向半边长），
   不要拿角点、接触点或几条线的交点当作用点。
S10 动画：包围盒按 t=0/0.25/0.5/0.75 采样后裁剪 ⇒ 运动要发生在首帧轮廓里；
   每帧画几百个点以内（轨迹用 20–60 个采样点），不要每帧 new 大量对象。`;

  /* 两套模板：静态调参图 / 动态调参图
     写法与内置图形一致：先定工作框 → 摆主体 → 标出随参数变化的量。用户只改最后的「需求 C」。 */
  const STATIC_PART = `【T 静态调参图 —— 参数一改，画面立刻变】
T1 适用：受力图、光路、电路、几何量角、坐标曲线、透镜成像、电场线。
T2 三步：① const b = U.bbox(o) 定工作框；② 摆主体（斜面/轨道/透镜/电路/坐标轴）；
   ③ 标出随参数变化的量（角度、长度、箭头、读数、交点）。
T3 参数 2–5 个，每个都必须改变几何（角度/长度/位置/比例/开关）；不要放只改文字的参数。
T4 常见套路：
   · 受力图：先画接触面（斜面/地面），物块贴面；各力都从物块中心出发，箭头长按力的大小比例，
     尖端外侧 10–16px 标 mg / N / f / F；角度弧用 U.poly 采样 16 段，读数放在弧外侧。
   · 光路：法线用虚线，入射线/折射线用实线，箭头画在光线中段或末端；角度从法线量。
   · 电路：矩形回路，元件（电阻/电源/表）画在边上，导线不许穿过元件符号。
   · 波形/坐标：横纵轴 + 刻度短线，曲线用 40–80 个采样点；轴标签在端点外侧。
   · 场区：圆或矩形用虚线，圆心/中心标 B 或 E；场区外的轨迹用实线。
T5 主体占框 60%–90%；标注不压线；同一张图里字号统一。
T6 别画装饰：不要边框、背景网格、水印、标题栏。

【完整示例（照这个结构写，比值可以改）】
param('deg',  {label:'倾角', min:10, max:60, step:1, def:30, unit:'°'});
param('fric', {label:'摩擦力', min:0, max:1, step:1, def:1, unit:'0无1有'});

shape({
  key: 'inclineForces',
  label: '斜面受力分解',
  icon: '<path d="M3 20h17"/><path d="M3 20l14-14v14"/>',
  params: ['deg', 'fric'],
  draw(c, o, U) {
    const b = U.bbox(o);
    const rad = o.deg * Math.PI / 180;
    const x0 = b.x1 + b.w * 0.10, y0 = b.y1 + b.h * 0.84;
    const x1 = b.x1 + b.w * 0.90, hh = (x1 - x0) * Math.tan(rad);
    U.line(x0, y0, x1, y0);
    U.line(x1, y0, x1, y0 - hh);
    U.line(x1, y0 - hh, x0, y0);

    const ux = Math.cos(rad), uy = -Math.sin(rad);
    const nx = -Math.sin(rad), ny = -Math.cos(rad);
    const sb = Math.min(b.w, b.h) * 0.17;
    const cxp = x0 + (x1 - x0) * 0.46, cyp = y0 - hh * 0.46;
    const cx = cxp + nx * sb * 0.55, cy = cyp + ny * sb * 0.55, h2 = sb / 2;
    U.poly([[cx - h2, cy - h2], [cx + h2, cy - h2], [cx + h2, cy + h2], [cx - h2, cy + h2]], true);

    const L = Math.min(b.w, b.h) * 0.30;
    U.arrow(cx, cy, cx, cy + L);
    U.arrow(cx, cy, cx + nx * L, cy + ny * L);
    if (o.fric >= 0.5) U.arrow(cx, cy, cx - ux * L * 0.8, cy - uy * L * 0.8);
    U.text('mg', cx + 6, cy + L - 2, {size:13, align:'left'});
    U.text('N', cx + nx * L - 16, cy + ny * L - 2, {size:13, align:'left'});
    if (o.fric >= 0.5) U.text('f', cx - ux * L * 0.8 - 16, cy - uy * L * 0.8 - 4, {size:13, align:'left'});

    const r = Math.min(b.w, b.h) * 0.12, pts = [];
    for (let i = 0; i <= 16; i++) { const a = -rad * i / 16; pts.push([x0 + r * Math.cos(a), y0 + r * Math.sin(a)]); }
    U.poly(pts, false);
    U.text(o.deg + '°', x0 + r * 1.45 * Math.cos(rad / 2), y0 - r * 1.45 * Math.sin(rad / 2) + 6, {size:13, align:'left'});
  },
});

【需求 C —— 只改这一段，其它照抄】
学科：物理
子类：力学
图形名：斜面受力分解
用途：讲斜面受力时，能拖动物体、调倾角看三个力怎么变
参数：倾角 10–60°（默认 30）；摩擦力 无/有（默认 有）
构图：斜面在左下方起坡、右侧竖直边封口；物块贴在斜面上；重力竖直向下、支持力垂直斜面、
      摩擦力沿斜面向上，三个箭头共点于物块中心；角度弧与读数在左下角。
标注：mg / N / f，13px；角度读数带 °。`;

  const DYNAMIC_PART = `【D 动态调参图 —— 按播放键走一遍的过程动画】
D1 适用：粒子汇聚/发散、摆动、波动传播、追及相遇、扫描、电流方向变化。
D2 shape 里写 animatable: true；draw 里自己取周期：
   const T = Math.max(0.4, o.<时间参数> || 2.4);
   const prog = ((o.animT || 0) % T) / T;   // 0→1 循环
   如果有“速度”参数，写成 prog = ((o.animT * o.speed) % T) / T。
D3 四步：① 先画静止舞台（场区/轨道/坐标，虚线）；② 画随 prog 变化的过程（轨迹/粒子/矢量）；
   ③ 画终点标记（汇聚点 O、平衡位置等），轨迹必须严格经过它；④ 标注（B、角度、T=…s）。
D4 参数 3–5 个：周期 T（1–6 s）、数量/幅度/位置等。注意：只改“快慢”的参数在单帧里可能
   看不出变化，校验会警告；最好再配一个真正改形状或数量的参数（或把速度直接乘进 prog）。
D5 首帧（prog=0）要能当静态图看：物体在起点，轨迹为空或只有一个点。
D6 每帧点数控制在几百以内（轨迹 20–60 个采样点），不要在 draw 里 new 大量对象。
D7 运动幅度要收在首帧轮廓附近（S10），否则会被包围盒裁掉。
D8 时间用 o.animT（秒），不要自带动画循环、不要 setTimeout。

【完整示例（磁聚焦，照这个结构写）】
param('T', {label:'汇聚时间', min:1, max:5, step:0.1, def:2.4, unit:'s'});
param('n', {label:'粒子数', min:1, max:5, step:1, def:3});

shape({
  key: 'magFocus',
  label: '磁聚焦（平行束）',
  animatable: true,
  icon: '<path d="M3 7h6"/><path d="M3 12h6"/><path d="M3 17h6"/><circle cx="15" cy="12" r="5" stroke-dasharray="2 2"/>',
  params: ['T', 'n'],
  draw(c, o, U) {
    const b = U.bbox(o);
    const T = Math.max(0.4, o.T || 2.4);
    const n = Math.max(1, Math.round(o.n || 3));
    const R = Math.min(b.w, b.h) * 0.30;
    const fx = b.x1 + b.w / 2, fy = b.y1 + b.h / 2 - b.h * 0.04;
    const oy = fy + R, prog = ((o.animT || 0) % T) / T;

    c.save(); c.setLineDash([6, 4]); U.circle(fx, fy, R); c.restore();
    U.text('B', fx + R * 0.45, fy - R * 0.5, {size:12});
    U.text('O', fx + 12, oy + 18, {size:12, align:'left'});

    for (let i = 0; i < n; i++) {
      const v = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      const dy = v * R * 0.55;
      const ex = fx - Math.sqrt(Math.max(0, R * R - dy * dy));
      const ey = fy + dy, cx0 = ex, cy0 = ey + R;
      U.arrow(ex - R * 0.5, ey, ex - 6, ey);
      const aEnd = -Math.PI / 2 + Math.PI * prog, pts = [];
      for (let k = 0; k <= 28; k++) {
        const a = -Math.PI / 2 + (aEnd + Math.PI / 2) * k / 28;
        pts.push([cx0 + R * Math.cos(a), cy0 + R * Math.sin(a)]);
      }
      U.poly(pts, false);
      if (prog > 0.02) U.circle(cx0, cy0 - R, 3, {fill: 0.9});
    }
  },
});

【需求 C —— 只改这一段，其它照抄】
学科：物理
子类：电磁
图形名：矩形磁场中的旋转圆
用途：讲带电粒子在磁场中的圆周运动，能看粒子从左侧中点射入后怎么偏转
参数：磁感应强度 0.2–2 T（默认 1）；速度 0.5–2（默认 1）；粒子数 1–5（默认 1）
构图：矩形场区用虚线，左侧边中点发射；轨迹是圆弧；出场点或圆心要有标记；
      首帧粒子在入射点、轨迹为空。
标注：B 在场区中心，13px；不要加别的文字。`;

  function promptDefault(mode) {
    const dyn = mode === 'dynamic';
    return CONTRACT + '\n\n' + STYLE + '\n\n' + (dyn ? DYNAMIC_PART : STATIC_PART);
  }
  // 图片参考（用户选/粘一张板书照片时追加在提示词末尾，优先级高于需求 C）
  const IMAGE_HINT = [
    '【图片参考 —— 优先级高于需求 C】',
    '1. 先照着图还原：图形构成、比例、位置关系、虚线/实线。',
    '2. 图上的文字照抄（mg / N / B / O 这类），不要自己改成别的字。',
    '3. 图上没有、但需求 C 里写了的参数与交互，再补进去；两者冲突时以图为准。',
    '4. 只画图里真有的东西，不要加背景、阴影、装饰。',
    '5. 图上小字看不清就不要猜，用通用标注。',
  ].join('\n');

  function promptKeyFor(mode) { return 'gewu.shapePrompt.' + (mode === 'dynamic' ? 'dynamic' : 'static'); }

  // 需求 C —— 用户在对话框里逐行填的那几行；buildPrompt() 会把提示词里这段模板整段换掉
  const DEMAND_LINES = [
    ['subject', '学科', '物理'],
    ['group', '子类', '力学'],
    ['name', '图形名', '斜面受力分解'],
    ['use', '用途', '讲斜面受力时，能调倾角看三个力怎么变'],
    ['params', '要调的参数', '倾角 10–60°（默认 30）；摩擦力 无/有（默认 有）'],
    ['layout', '构图', '斜面在左下起坡、右侧竖直封口；物块贴斜面；三个力箭头共点于物块中心'],
    ['labels', '标注', 'mg / N / f，13px；角度读数带 °'],
  ];
  function demandText(f) {
    f = f || {};
    const lines = ['【需求 C —— 只改这一段，其它照抄】'];
    DEMAND_LINES.forEach(function (row) {
      const v = f[row[0]];
      lines.push(row[1] + '：' + (v == null || v === '' ? row[2] : String(v)));
    });
    return lines.join('\n');
  }
  function buildPrompt(mode, f) {
    const base = promptDefault(mode);
    const i = base.indexOf('【需求 C');
    if (i < 0) return base + '\n\n' + demandText(f);
    return base.slice(0, i) + demandText(f) + '\n';
  }
  function promptCheck(text, mode) {
    const s = String(text || '');
    const need = [
      ['shape(', '契约里的 shape({...})'],
      ['draw(c, o, U)', 'draw 的签名'],
      ['U.bbox', 'U.bbox(o) 定工作框'],
      ['U.text', 'U.text 助手'],
      ['U.arrow', 'U.arrow 助手'],
      ['U.poly', 'U.poly 折线助手'],
      ['param(', 'param() 参数声明'],
    ];
    if (mode === 'dynamic') need.push(['o.animT', '动画读 o.animT']);
    const missing = need.filter((x) => s.indexOf(x[0]) < 0).map((x) => x[1]);
    return { ok: missing.length === 0, missing };
  }

  /* ---------- 编译环境（自包含：会被 toString 后放进 Worker） ---------- */
  function envFactory() {
    'use strict';
    const W = 400, H = 300;
    const FORBIDDEN = ['createLinearGradient', 'createRadialGradient', 'createPattern', 'shadowBlur', 'shadowColor',
      'globalCompositeOperation', 'drawImage', 'document.', 'window.', 'localStorage', 'eval('];
    const ICON_TAGS = ['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g'];
    // 审计 F04 ②：越界标识符。注意 —— 这是纵深防御，不是沙箱：拦住的是「明显够到全局/宿主」
    // 的写法，绕过的手法一定还有。真正的边界是「用户代码只在 Worker 里跑」（见 shapeself.js
    // 的 validate()：Worker 起不来就报错，绝不回落到主线程 new Function）。
    // 判据是「前面不是 . 也不是标识符字符」，所以 o.top / b.window 这类成员访问不误伤；
    // constructor 单独判 .constructor（正经 draw 里唯一的用法就是顺着它摸 Function 构造器）。
    const ESCAPE = ['globalThis', 'window', 'self', 'parent', 'top', 'frames', 'Function', 'eval',
      'importScripts', 'WebAssembly', 'XMLHttpRequest', 'fetch', 'Worker', 'SharedArrayBuffer',
      'Atomics', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator',
      'postMessage', 'onmessage', 'constructor', 'require', 'process'];

    function clean(src) {
      let s = String(src == null ? '' : src).replace(/^\uFEFF/, '');
      s = s.replace(/```[a-zA-Z]*\n?/g, '').replace(/^\s*```\s*$/gm, '');
      const i = s.search(/(?:^|\n)\s*(?:shape|param)\s*\(/);
      if (i > 0) s = s.slice(i);
      return s.trim();
    }

    // 审计 F04 ②：去注释后统一扫描越界标识符（lintDef 与 compile 共用同一套判据）
    function stripComments(s) {
      return String(s == null ? '' : s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    }
    function escapes(src) {
      const body = stripComments(src);
      const hits = [];
      ESCAPE.forEach((n) => {
        const re = n === 'constructor' ? /\.\s*constructor\b/ : new RegExp('(^|[^.\\w$])' + n + '\\b');
        if (re.test(body)) hits.push(n);
      });
      return hits;
    }

    function compile(src) {
      src = clean(src);
      const out = { defs: [], params: Object.create(null), errors: [] };
      const shape = (d) => { out.defs.push(d); return d; };
      const param = (k, d) => { out.params[k] = d || {}; return k; };
      // 审计 F04 ②：new Function 之前再过一遍越界标识符。主线程上这一关是最后一道 ——
      // 命中就直接返回，绝不把这段源码交给 new Function（旧实现没有任何前置检查）。
      const esc = escapes(src);
      if (esc.length) {
        esc.forEach((n) => out.errors.push({ code: 'E_ESCAPE', msg: '不能用 ' + n + '（会够到页面/宿主环境，S7 / 契约 A）' }));
        return out;
      }
      try {
        const fn = new Function('shape', 'param', '"use strict";\n' + src + '\n//# sourceURL=shapeself-user.js');
        fn(shape, param);
      } catch (e) {
        out.errors.push({ code: 'E_SYNTAX', msg: '代码运行出错：' + (e && e.message ? e.message : e) });
      }
      if (!out.defs.length && !out.errors.length) out.errors.push({ code: 'E_NODEF', msg: '没有找到 shape({...})，确认粘贴的是图形定义代码' });
      return out;
    }

    const rgb = (v) => {
      if (typeof v !== 'string') return null;
      let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
      if (m) {
        const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
      m = /^rgba?\(([^)]+)\)$/i.exec(v.trim());
      if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return p.length >= 3 ? [p[0], p[1], p[2]] : null; }
      return null;
    };
    const alpha = (col, a) => {
      const c = rgb(col) || [27, 36, 51];
      return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 0.2 : a) + ')';
    };

    function makeIt(d, params, over) {
      const it = { x1: 40, y1: 40, x2: 360, y2: 260, width: 3, color: '#1b2433', fill: !!d.fill, opacity: 1 };
      (d.params || []).forEach((k) => {
        const pd = params[k] || {};
        it[k] = pd.def != null ? pd.def : (pd.min != null ? pd.min : 0);
      });
      if (d.animatable) it.animT = 0;
      return Object.assign(it, over || {});
    }

    function makeU(c, o) {
      const size = Math.max(1, o.width || 3);
      const bb = () => {
        const x1 = Math.min(o.x1, o.x2), y1 = Math.min(o.y1, o.y2);
        const x2 = Math.max(o.x1, o.x2), y2 = Math.max(o.y1, o.y2);
        return { x1: x1, y1: y1, x2: x2, y2: y2, w: x2 - x1, h: y2 - y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
      };
      return {
        size: size,
        bbox: bb,
        line(x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); },
        arrow(x1, y1, x2, y2, opt) {
          const head = Math.max(10, (opt && opt.head) || size * 4);
          const ang = Math.atan2(y2 - y1, x2 - x1), sp = 0.42;
          c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
          c.beginPath(); c.moveTo(x2, y2);
          c.lineTo(x2 - head * Math.cos(ang - sp), y2 - head * Math.sin(ang - sp));
          c.moveTo(x2, y2);
          c.lineTo(x2 - head * Math.cos(ang + sp), y2 - head * Math.sin(ang + sp));
          c.stroke();
        },
        circle(cx, cy, r, opt) {
          c.beginPath(); c.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2);
          if (opt && opt.fill != null) { c.fillStyle = alpha(o.color, opt.fill); c.fill(); }
          c.stroke();
        },
        arc(cx, cy, r, a0, a1) { c.beginPath(); c.arc(cx, cy, Math.max(0.5, r), a0, a1); c.stroke(); },
        poly(pts, close) {
          if (!pts || !pts.length) return;
          c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
          if (close) c.closePath();
          c.stroke();
        },
        text(s, x, y, opt) {
          const o2 = opt || {};
          c.save();
          c.font = (o2.bold ? '600 ' : '') + (o2.size || 13) + 'px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
          c.fillStyle = o2.color || '#1b2433';
          c.textAlign = o2.align || 'center';
          c.textBaseline = o2.baseline || 'middle';
          c.fillText(String(s), x, y);
          c.restore();
        },
        alpha: alpha,
        lerp: (a, b, t) => a + (b - a) * t,
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
      };
    }

    function canvasFor() {
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(W, H);
      if (typeof document !== 'undefined') { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv; }
      return null;
    }

    function metrics(px) {
      let n = 0, x1 = W, y1 = H, x2 = -1, y2 = -1;
      const colors = new Set();
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (px[i + 3] <= 16) continue;
          n++;
          if (x < x1) x1 = x; if (x > x2) x2 = x;
          if (y < y1) y1 = y; if (y > y2) y2 = y;
          colors.add(((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4));
        }
      }
      return { n: n, x1: x1, y1: y1, x2: x2, y2: y2, colors: colors.size };
    }
    function diff(a, b) {
      let c = 0;
      for (let i = 0; i < a.length; i += 4) {
        const on = a[i + 3] > 16, on2 = b[i + 3] > 16;
        if (on !== on2) { c++; continue; }
        if (!on) continue;
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) c++;
      }
      return c;
    }
    function runsOf(px) {
      const runs = [];
      for (let y = 0; y < H; y += 3) {
        let run = 0;
        for (let x = 0; x < W; x++) {
          const on = px[(y * W + x) * 4 + 3] > 16;
          if (on) run++;
          else { if (run >= 1 && run <= 40) runs.push(run); run = 0; }
        }
        if (run >= 1 && run <= 40) runs.push(run);
      }
      runs.sort((a, b) => a - b);
      return runs.length ? runs[Math.floor(runs.length / 2)] : 0;
    }

    function lintDef(d, params, src) {
      const errors = [], warnings = [];
      const E = (code, msg) => errors.push({ code: code, msg: msg });
      if (!d || typeof d !== 'object') { E('E_DEF', '形状定义必须是对象'); return { errors: errors, warnings: warnings }; }
      if (!/^[A-Za-z][A-Za-z0-9]{0,23}$/.test(d.key || '')) E('E_KEY', 'key 要字母开头、字母数字、≤24 字符');
      if (!d.label) E('E_LABEL', '缺 label（面板上显示的中文名）');
      if (typeof d.draw !== 'function') E('E_DRAW', '缺 draw(c, o, U) 函数');
      const icon = String(d.icon || '');
      if (icon) {
        const tags = icon.match(/<\s*([a-zA-Z]+)/g) || [];
        tags.forEach((t) => {
          const name = t.replace(/[<\s]/g, '').toLowerCase();
          if (ICON_TAGS.indexOf(name) < 0) E('E_ICON', 'icon 只能放 ' + ICON_TAGS.join('/') + '，不能用 <' + name + '>');
        });
        if (/\son\w+\s*=|<script|href|url\(/i.test(icon)) E('E_ICON', 'icon 里有事件属性或外链');
      }
      (d.params || []).forEach((k) => {
        const pd = params[k];
        if (!pd) { E('E_PARAM', '参数没声明：' + k); return; }
        if (!pd.label) E('E_PARAM', '参数缺 label：' + k);
        // 1.6.0 G5：min/max/step/def 必须是有限数。旧实现只判 Number(min) < Number(max)，
        // 于是 max=Infinity 天然通过（-Infinity<Infinity 也成立）、step=-1 压根没判，
        // 坏值会一路传到参数控件。省略 min/max 的老定义仍按 0..1 兜底，不受影响。
        const has = (v) => v != null && v !== '';
        const min = has(pd.min) ? Number(pd.min) : 0;
        const max = has(pd.max) ? Number(pd.max) : 1;
        if (has(pd.min) && !isFinite(min)) E('E_PARAM', '参数 min 必须是有限数：' + k);
        if (has(pd.max) && !isFinite(max)) E('E_PARAM', '参数 max 必须是有限数：' + k);
        if (isFinite(min) && isFinite(max) && !(min < max)) E('E_PARAM', '参数 min 要小于 max：' + k);
        if (has(pd.step)) {
          const st = Number(pd.step);
          if (!isFinite(st) || !(st > 0)) E('E_PARAM', '参数 step 必须是有限正数：' + k);
        }
        if (has(pd.def)) {
          const def = Number(pd.def);
          if (!isFinite(def)) E('E_PARAM', '参数默认值必须是有限数：' + k);
          else if (isFinite(min) && isFinite(max) && (def < min || def > max)) E('E_PARAM', '参数默认值要落在 min–max 里：' + k);
        }
      });
      const body = stripComments(src);
      FORBIDDEN.forEach((t) => { if (body.indexOf(t) >= 0) E('E_FORBIDDEN', '不能用 ' + t + '（S7 / 契约 A）'); });
      escapes(src).forEach((n) => E('E_ESCAPE', '不能用 ' + n + '（会够到页面/宿主环境，S7 / 契约 A）'));
      if (!/^[A-Za-z]/.test(String(d.key || ''))) warnings.push({ code: 'W_KEY', msg: 'key 建议用英文' });
      return { errors: errors, warnings: warnings };
    }

    function renderDef(d, params, over, cv, ctx) {
      const it = makeIt(d, params, over);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, it.width);
      ctx.strokeStyle = it.color;
      const U = makeU(ctx, it);
      ctx.save();
      try { d.draw(ctx, it, U); } catch (e) { ctx.restore(); throw e; }
      ctx.restore();
      return { it: it, px: ctx.getImageData(0, 0, W, H).data };
    }

    function checkFile(cfg) {
      const src = clean(cfg && cfg.code);
      if (!src) return { ok: false, errors: [{ code: 'E_EMPTY', msg: '代码是空的' }], defs: [] };
      if (src.length > 12000) return { ok: false, errors: [{ code: 'E_LONG', msg: '代码超过 12000 字符' }], defs: [] };
      const c = compile(src);
      const out = { ok: true, errors: c.errors.slice(), defs: [] };
      if (!c.errors.length && !c.defs.length) out.errors.push({ code: 'E_NODEF', msg: '没有找到 shape({...})' });
      const cv = canvasFor();
      if (!cv) { out.errors.push({ code: 'E_NOCANVAS', msg: '当前环境不能试画' }); out.ok = false; return out; }
      const ctx = cv.getContext('2d');

      (c.defs || []).slice(0, 20).forEach((d) => {
        const one = { key: (d && d.key) || '?', label: (d && d.label) || '', errors: [], warnings: [], metrics: null };
        const l = lintDef(d, c.params, src);
        one.errors = l.errors; one.warnings = l.warnings;
        if (one.errors.length || !d || typeof d.draw !== 'function') { out.defs.push(one); return; }
        try {
          const base = renderDef(d, c.params, null, cv, ctx);
          const m = metrics(base.px);
          const bw = m.x2 - m.x1 + 1, bh = m.y2 - m.y1 + 1;
          const iw = Math.abs(base.it.x2 - base.it.x1), ih = Math.abs(base.it.y2 - base.it.y1);
          const ratio = [+(bw / iw).toFixed(2), +(bh / ih).toFixed(2)];
          const fill = m.n / Math.max(1, bw * bh);
          const runs = runsOf(base.px);
          const params = {};
          const pBase = d.animatable ? { animT: 0.5 } : {};
          (d.params || []).forEach((k) => {
            const pd = c.params[k];
            const a = renderDef(d, c.params, Object.assign({}, pBase, (function () { const x = {}; x[k] = Number(pd.min); return x; })()), cv, ctx);
            const b = renderDef(d, c.params, Object.assign({}, pBase, (function () { const x = {}; x[k] = Number(pd.max); return x; })()), cv, ctx);
            params[k] = +(diff(a.px, b.px) / Math.max(1, m.n) * 100).toFixed(1);
            if (!(params[k] > 0.2)) {
              // 动画图形：只改“快慢/时长”的参数在 t=0.5 这一帧可能完全一样，换个时刻再看
              let alt = 0;
              if (d.animatable) {
                const mk = (v, t) => { const x = { animT: t }; x[k] = v; return x; };
                const a2 = renderDef(d, c.params, mk(Number(pd.min), 1.3), cv, ctx);
                const b2 = renderDef(d, c.params, mk(Number(pd.max), 1.3), cv, ctx);
                alt = +(diff(a2.px, b2.px) / Math.max(1, m.n) * 100).toFixed(1);
              }
              if (alt > 0.2) params[k] = alt;
              else if (d.animatable) one.warnings.push({ code: 'W_PARAM', msg: '参数 ' + k + ' 只影响快慢/时长，任何一帧都看不出差别（建议乘进 prog）' });
              else one.errors.push({ code: 'E_PARAM', msg: '参数 ' + k + ' 拉到 min/max 画面没变化（draw 里没读它？）' });
            }
          });
          if (m.n < 120) one.errors.push({ code: 'E_EMPTY', msg: '几乎没画出东西（墨迹 ' + m.n + 'px）' });
          if (ratio[0] < 0.45 || ratio[1] < 0.45) one.errors.push({ code: 'E_TINY', msg: '只占框的 ' + ratio.join('×') + '，太小（S8 要求 60–90%）' });
          if (ratio[0] > 1.2 || ratio[1] > 1.2) one.errors.push({ code: 'E_OVERFLOW', msg: '画出界 ' + ratio.join('×') + '（S8）' });
          if (fill > 0.45) one.warnings.push({ code: 'W_HEAVY_FILL', msg: '填充占外接框 ' + (fill * 100).toFixed(0) + '%（S3）' });
          if (runs < 2 || runs > 8) one.warnings.push({ code: 'W_LINE', msg: '线宽扫出来 ' + runs + 'px（期望 2–7）' });
          let anim = null;
          if (d.animatable) {
            const a = renderDef(d, c.params, { animT: 0 }, cv, ctx);
            const b = renderDef(d, c.params, { animT: 0.7 }, cv, ctx);
            anim = +(diff(a.px, b.px) / Math.max(1, m.n) * 100).toFixed(1);
            if (!(anim > 1)) one.errors.push({ code: 'E_ANIM', msg: 'animatable 但 t=0 与 t=0.7 画面差 ' + anim + '%（draw 没读 o.animT？）' });
          }
          one.metrics = { ink: m.n, ratio: ratio, runs: runs, fill: +(fill * 100).toFixed(1), colors: m.colors, params: params, anim: anim };
        } catch (e) {
          one.errors.push({ code: 'E_RUNTIME', msg: 'draw 运行出错：' + (e && e.message ? e.message : e) });
        }
        out.defs.push(one);
      });
      out.ok = !out.errors.length && out.defs.every((x) => !x.errors.length);
      return out;
    }

    return { clean: clean, compile: compile, lintDef: lintDef, check: checkFile, escapes: escapes };
  }

  function workerSrc() {
    return 'var ENV=(' + envFactory.toString() + ')();\n' +
      'self.onmessage=function(e){var r;try{r=ENV.check(e.data);}catch(x){r={ok:false,errors:[{code:"E_FATAL",msg:String(x&&x.message||x)}],defs:[]};}self.postMessage(r);};\n';
  }

  return {
    PROMPT_KEY: PROMPT_KEY,
    MAX_CODE: MAX_CODE,
    MAX_SHAPES: MAX_SHAPES,
    promptDefault: promptDefault,
    promptKeyFor: promptKeyFor,
    demandText: demandText,
    IMAGE_HINT: IMAGE_HINT,
    buildPrompt: buildPrompt,
    DEMAND_LINES: DEMAND_LINES,
    promptCheck: promptCheck,
    clean: function (s) { return envFactory().clean(s); },
    compile: function (s) { return envFactory().compile(s); },
    lintDef: function (d, params, src) { return envFactory().lintDef(d, params, src); },
    // 审计 F04 ②：主线程编译前再跑一次越界检查（见 shapeself.js 的 findDef）
    escapes: function (s) { return envFactory().escapes(s); },
    envFactory: envFactory,
    workerSrc: workerSrc,
  };
});
