/* 数理无限画布 · 画布核心：文档模型、视图变换、墨迹渲染、撤销重做 */
(function () {
  'use strict';
  const GW = window.GW;

  // ---------- 文档 ----------
  // 新页面的底色沿用「上次调好的那套」（settings.defaultBg，由背景面板实时写入）：
  // 老师把整堂课调成米黄纸 + 纸纹，翻到下一页不该突然变回黑底。
  function newPage(name) {
    const d = (GW.settings && GW.settings.defaultBg) || null;
    const bg = d && d.color ? Object.assign({ pattern: 'none', material: 'grad' }, d) : { color: 'green', material: 'grad', pattern: 'none' };
    // paged=false：2.0.7（R5）——「有限页面」从全局设置变成**页面自己的属性**。
    // 老存档没有这个字段，读盘时 !!(p.paged) 兜底成 false（板书页仍是无限画布）。
    return { id: GW.uid(), name: name || '', bg: bg, ink: [], objs: [], geo: [], view: { tx: 0, ty: 0, s: 1 }, paged: false };
  }
  const doc = { version: 1, pages: [newPage()], cur: 0, assets: {}, path: null, dirty: false };
  GW.doc = doc;
  GW.newPage = newPage;
  GW.page = () => doc.pages[doc.cur];

  // 1.7.0（T09）：课堂「全部揭开」—— 把本页所有胶带从画面上撤掉（只是不画，数据一个字节都不动），
  // 再点一次就全部盖回去。整页一次切换，不是逐条点（NoteApp 的 clearPageTapes 也是按页操作）。
  // 刻意不进撤销栈：这是「看/不看」的视图开关，不是改板书；刷新与重开都回到「盖着」。
  GW.tapeOpen = false;
  GW.tapeCount = function (p) {
    p = p || GW.page();
    return (p.ink || []).filter((it) => it.tape).length + (p.objs || []).filter((it) => it.tape).length;
  };
  GW.tapeToggle = function (on) {
    const want = on == null ? !GW.tapeOpen : !!on;
    const n = GW.tapeCount();
    if (!n) { GW.toast('这一页还没有胶带', 1600); return false; }
    GW.tapeOpen = want;
    GW.requestRender();
    GW.toast(want ? ('已揭开本页 ' + n + ' 条胶带（再点一次盖回）') : ('已盖回 ' + n + ' 条胶带'), 2000);
    return want;
  };

  // ---------- 视图 ----------
  const view = { tx: 0, ty: 0, s: 1 };
  GW.view = Object.assign(GW.view || {}, { get scale() { return view.s; } });
  GW.camera = view;
  const MIN_S = 0.05, MAX_S = 20;

  // ---------- 1.3.0（R5）画布模式 ----------
  // 'free'    ：现在的行为（平移无界、缩放 0.05~20）
  // 'axis100' ：单轴无限平移 + 缩放固定 100%（老师反馈 5：「拖动只能走单轴，缩放锁 100%」）
  // 'inf2d'   ：二维无限平移 + 缩放固定 100%（1.7.5：老师要的「无限平移 + 100% 缩放锁定」——
  //             除了缩放锁死，拖动可以往四周走，不再限制单轴）
  // 判据集中在这两个函数里，各入口只调它们，避免再出现「第二份 0.05/20」这种抄两遍的上限。
  // 2.0.8：纸张页（整页模板 / 套纸）不吃缩放锁。
  //   ① 页面要能缩到整页可见，锁着 100% 只看到纸的一角，写字等于在放大镜下写；
  //   ② 判据是「这一页有没有纸框」，不是全局 layout ⇒ 离开纸张页时老师的「锁 100%」原样回来。
  //   2.0.7 的做法是 enterPaged 里直接把 settings.canvasMode 改成 free 并存盘，
  //   等于进一次模板页就把所有其它页的手势偏好永久改掉，且再也恢复不了 —— 这条已删除。
  GW.zoomLock = () => {
    if (GW.pageBox && GW.pageBox()) return false;
    const m = (GW.settings && GW.settings.canvasMode) || 'free';
    return m === 'axis100' || m === 'inf2d';
  };
  GW.axisLock = () => ((GW.settings && GW.settings.canvasMode) || 'free') === 'axis100';

  // ---------- 2.0.7（R7 / A6）：页面坐标系 ----------
  // 页面内容（墨迹/纸张/纸框/DOM 对象）都活在**页面坐标**里；世界坐标 = 页面坐标绕纸框中心
  // 旋转 page.rot（0/90/180/270）后的结果。rot=0 时是恒等变换 —— 老存档、老探针逐像素不变。
  // 以前三条渲染路径各写一遍 `setTransform(dpr*s, …)`，漏乘 dpr 就是 1.7.5-03 那个 bug；
  // 现在统一走 pageMatrix()，任何新路径都不许再手写矩阵（R7 的根因就是「手写了三份」）。
  function pageRot() {
    const p = GW.page();
    const d = p ? +p.rot : 0;
    if (d === 90 || d === -270) return 90;
    if (d === 180 || d === -180) return 180;
    if (d === 270 || d === -90) return 270;
    return 0;
  }
  function pagePivot() {
    const p = GW.page();
    const b = p && p.box;
    return b && b.w > 0 ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: 0, y: 0 };
  }
  // 把 ctx 切到「页面坐标 → 设备像素」：dpr、相机、预渲染偏移、页面旋转一次算清。
  // ox/oy = 预渲染圈偏移（底纹层传 px/py，其余层传 PADX/PADY）。
  function pageMatrix(ctx, ox, oy) {
    const px = ox || 0, py = oy || 0;
    ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s,
      dpr * (view.tx + px), dpr * (view.ty + py));
    const a = pageRot();
    if (a) {
      const c = pagePivot();
      ctx.translate(c.x, c.y);
      ctx.rotate(a * Math.PI / 180);
      ctx.translate(-c.x, -c.y);
    }
  }
  GW.pageMatrix = pageMatrix;
  GW.pageRot = pageRot;
  GW.pagePivot = pagePivot;
  // 2.0.7（R7）：pageMatrix 的纯函数版本 —— 给定 dpr/缩放/位移，返回页面坐标对应的**设备像素**。
  // 渲染路径与这里必须永远是同一套算式（探针 probe-dpr-paper 逐 dpr × 缩放比对 ≤1px）。
  GW.pageMapPt = function (x, y, dprV, sV, txV, tyV, oxV, oyV) {
    const a = pageRot();
    let px = x, py = y;
    if (a) {
      const c = pagePivot(), r = a * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
      const dx = px - c.x, dy = py - c.y;
      px = c.x + dx * cs - dy * sn; py = c.y + dx * sn + dy * cs;
    }
    return { x: dprV * (px * sV + txV + (oxV || 0)), y: dprV * (py * sV + tyV + (oyV || 0)) };
  };

  GW.toWorld = (sx, sy) => {
    let x = (sx - view.tx) / view.s, y = (sy - view.ty) / view.s;
    const a = pageRot();
    if (a) {                       // 逆旋转：屏幕 → 世界 → 页面坐标
      const c = pagePivot(), r = -a * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
      const dx = x - c.x, dy = y - c.y;
      x = c.x + dx * cs - dy * sn; y = c.y + dx * sn + dy * cs;
    }
    return { x, y };
  };
  GW.toScreen = (wx, wy) => {
    let x = wx, y = wy;
    const a = pageRot();
    if (a) {
      const c = pagePivot(), r = a * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
      const dx = x - c.x, dy = y - c.y;
      x = c.x + dx * cs - dy * sn; y = c.y + dx * sn + dy * cs;
    }
    return { x: x * view.s + view.tx, y: y * view.s + view.ty };
  };
  GW.setView = function (tx, ty, s) {
    // 锁 100% 的模式下这里是最后一道闸：就算某条入口漏了早退，也绝不可能把 view.s 改成别的值。
    if (GW.zoomLock()) s = 1;
    view.s = GW.clamp(s, MIN_S, MAX_S); view.tx = tx; view.ty = ty;
    const p = GW.page(); p.view = { tx: view.tx, ty: view.ty, s: view.s };
    GW.bus.emit('view', view);
    GW.viewChanged();   // 能走合成快速通道就不重画画布（见「渲染循环」一节）
  };
  GW.zoomAt = function (sx, sy, factor) {
    if (GW.zoomLock()) {
      // 滚轮一次会连发十几次，提示要做节流，否则 toast 把屏幕刷满
      const now = performance.now();
      if (!GW.__zoomLockTip || now - GW.__zoomLockTip > 2000) { GW.__zoomLockTip = now; GW.toast('该模式下缩放固定 100%'); }
      return;
    }
    const ns = GW.clamp(view.s * factor, MIN_S, MAX_S), f = ns / view.s;
    GW.setView(sx - (sx - view.tx) * f, sy - (sy - view.ty) * f, ns);
  };
  // 单轴模式下 axis 由手势在第一次明显位移时定好并整段沿用（见 input.js 的 axisPan）；
  // 不传 axis 时按「这一次谁大」判，滚轮平移用这条。
  GW.panBy = (dx, dy, axis) => {
    if (GW.axisLock()) {
      if (axis === 'x') dy = 0;
      else if (axis === 'y') dx = 0;
      else if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0;
    }
    GW.setView(view.tx + dx, view.ty + dy, view.s);
  };
  // 视口尺寸以 #stage 的 CSS 尺寸为准：iOS Safari 的 innerHeight 含工具栏区域，
  // #stage 又被定位到 visualViewport 上（见 app.css 的 --vt/--vh），两者不一致时
  // 若用 innerHeight 算视口，笔迹就会和笔尖整体错位。
  GW.stageEl = () => document.getElementById('stage');
  GW.viewSize = () => {
    const st = GW.stageEl();
    const w = st ? st.clientWidth : innerWidth, h = st ? st.clientHeight : innerHeight;
    return { w: w || innerWidth, h: h || innerHeight };
  };
  // 2.0.7（A6）：视口矩形改成「四角反算再取外接框」。页面旋转 90/270 时对角两点的反算结果
  // 会是一个负宽矩形，旧的 (b-a) 写法直接把可视区判成空，整页笔迹都消失。
  GW.viewRect = () => {
    const v = GW.viewSize();
    const p = [GW.toWorld(0, 0), GW.toWorld(v.w, 0), GW.toWorld(0, v.h), GW.toWorld(v.w, v.h)];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of p) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  GW.viewCenter = () => { const v = GW.viewSize(); return GW.toWorld(v.w / 2, v.h / 2); };
  // 屏幕坐标（clientX/clientY）→ 画布原点坐标系；#stage 不在 (0,0) 时（iOS 安全区/工具栏）必须减掉
  GW.pt = (sx, sy) => {
    const st = GW.stageEl();
    if (!st) return { x: sx, y: sy };
    const r = st.getBoundingClientRect();
    return { x: sx - (r.left || 0), y: sy - (r.top || 0) };
  };

  let anim = 0;
  GW.animateView = function (tx, ty, s, ms = 380) {
    cancelAnimationFrame(anim);
    const a = { tx: view.tx, ty: view.ty, s: view.s }, t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), k = ease(t);
      // 在对数空间插值缩放，避免“先缩小再放大”的观感
      const ls = Math.exp(Math.log(a.s) + (Math.log(s) - Math.log(a.s)) * k);
      GW.setView(a.tx + (tx - a.tx) * k, a.ty + (ty - a.ty) * k, ls);
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  // 停掉正在跑的镜头动画（项目空间进出时要立刻落位，不能让旧动画继续覆盖相机）
  GW.stopView = function () { cancelAnimationFrame(anim); anim = 0; };
  // 让世界矩形 r 填满屏幕（留边）
  GW.fitRect = function (r, pad = 40, animate = true) {
    const vp = GW.viewSize(), W = vp.w, H = vp.h;
    // 锁定 100% 时只把中心挪到屏幕中间，缩放不动（进项目空间要靠它对准页）
    const s = GW.zoomLock() ? 1 : GW.clamp(Math.min((W - pad * 2) / r.w, (H - pad * 2) / r.h), MIN_S, MAX_S);
    const tx = W / 2 - (r.x + r.w / 2) * s, ty = H / 2 - (r.y + r.h / 2) * s;
    animate ? GW.animateView(tx, ty, s) : GW.setView(tx, ty, s);
  };
  GW.fitContent = function () {
    const b = contentBounds(GW.page());
    if (!b) return GW.animateView(0, 0, 1);
    GW.fitRect(b, 60);
  };
  function contentBounds(p) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const it of p.ink) { const b = bbox(it); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); }
    for (const o of p.objs) { x1 = Math.min(x1, o.x); y1 = Math.min(y1, o.y); x2 = Math.max(x2, o.x + o.w); y2 = Math.max(y2, o.y + o.h); }
    return x1 === Infinity ? null : { x: x1, y: y1, w: Math.max(10, x2 - x1), h: Math.max(10, y2 - y1) };
  }
  GW.contentBounds = contentBounds;

  // ---------- 墨迹几何 ----------
  // stroke: {id, kind:'stroke', pts:[x,y,...], ws?:[w...], color, width, hl?:bool, alpha?}
  // shape : {id, kind:'shape', type:'poly'|'arrow'|'axes', pts, closed?, smooth?, double?, color, width, dash?, fill?}
  function bbox(it) {
    if (it._bb) return it._bb;
    // 物理图形库（type:'pb'）的几何只有 x1..y2 四个数，但地面斜线、箭头羽、刻度、标注都会
    // 画到框外，所以包围盒由库自己「空跑一遍 draw」量出来（见 physshapes.js 的 Meas）。
    if (it.type === 'pb' && GW.physShapes && GW.physShapes.bbox) return (it._bb = GW.physShapes.bbox(it));
    // 数学可调参图形（type:'ms'）：框 + 旋转 + 参数，包围盒由库按旋转后的 AABB 算。
    if (it.type === 'ms' && GW.mathShapes && GW.mathShapes.bbox) return (it._bb = GW.mathShapes.bbox(it));
    // 贴纸（type:'stk'）：几何就是 x1..y2 + rot，包围盒按旋转后的 AABB 算（stickers.js）
    if (it.type === 'stk' && GW.stickers && GW.stickers.bbox) return (it._bb = GW.stickers.bbox(it));
    // 贴纸（type:'stk'）：几何就是 x1..y2 + rot，包围盒按旋转后的 AABB 算（stickers.js）
    if (it.type === 'stk' && GW.stickers && GW.stickers.bbox) return (it._bb = GW.stickers.bbox(it));
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const scan = (p) => {
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] < x1) x1 = p[i];
        if (p[i] > x2) x2 = p[i];
        if (p[i + 1] < y1) y1 = p[i + 1];
        if (p[i + 1] > y2) y2 = p[i + 1];
      }
    };
    if (it.pts) scan(it.pts);
    // 学科模板是多段图形（只有 segs，没有 pts）。这里不认的话 st.up 里 objects.add 一碰就抛
    // 「Cannot read properties of undefined (reading 'length')」（见 scripts/probe-stencils.js 走界面那一段）。
    if (it.segs) for (let s = 0; s < it.segs.length; s++) if (it.segs[s]) scan(it.segs[s]);
    if (x1 === Infinity) { x1 = 0; y1 = 0; x2 = 0; y2 = 0; }
    // 变宽笔迹（笔锋）按最宽处外扩，否则局部重画会在笔画最粗的地方留下残影
    let wMax = it.width || 2;
    if (it.ws) for (let i = 0; i < it.ws.length; i++) if (it.ws[i] > wMax) wMax = it.ws[i];
    // 箭头的两个羽翼会画到端点之外（arrowHead 里 hw = (8+w*3.2)*0.42），所以按羽翼宽度外扩；
    // 以前一律 (w*3+6)，2px 线宽时四面各多出 12px、框比图形大 40%（实测）。
    const m = wMax / 2 + (it.type === 'arrow' || it.type === 'axes' ? (8 + (it.width || 2) * 3.2) * 0.42 : 0);
    x1 -= m; y1 -= m; x2 += m; y2 += m;
    // 学科模板的板上标注（物理量、元素符号、海拔…）也要算进包围盒，否则它们的墨落在盒外，
    // 橡皮局部重画只擦盒内 → 字会留下残影。
    if (it.texts) for (let i = 0; i < it.texts.length; i++) {
      // 字段名跟 drawItem / stencils.js 的 T() 对齐：字号是 t.s，文字是 t.t（不是 size/str）
      const t = it.texts[i], sz = t.s || 12, str = String(t.t == null ? '' : t.t);
      let w = 0;
      for (let c = 0; c < str.length; c++) w += str.charCodeAt(c) > 0x2e80 ? 1.0 : 0.62;
      const hw = (sz * w) / 2, hh = sz * 0.68;
      if (t.x - hw < x1) x1 = t.x - hw;
      if (t.x + hw > x2) x2 = t.x + hw;
      if (t.y - hh < y1) y1 = t.y - hh;
      if (t.y + hh > y2) y2 = t.y + hh;
    }
    // 坐标轴的轴名 x/y 与原点 O 是 drawItem 里直接 fillText 画的（字号随线宽 10+width*4），
    // 不算进来就会露在包围盒外：① 选中虚线框框不住（实测 numline 露 4.5px）；② 拖动/橡皮的
    // 局部重画只擦盒内，这几个字会留下残影。字位与 drawItem 的 fillText 参数逐一对齐。
    if (it.type === 'axes' && it.pts && it.pts.length >= 6) {
      const p = it.pts, fs = 10 + (it.width || 2) * 4;
      const glyph = (tx, ty, align, str) => {
        const len = String(str == null ? '' : str).length;
        if (!len) return;                       // 空字符串（数轴的 labels:['','']）什么都没画
        const gw = fs * 0.62 * len, gh = fs * 0.78;
        const gx = align === 'right' ? tx - gw : tx;
        if (gx < x1) x1 = gx;
        if (gx + gw > x2) x2 = gx + gw;
        if (ty < y1) y1 = ty;
        if (ty + gh > y2) y2 = ty + gh;
      };
      glyph(p[2] - fs * 0.4, p[3] + fs * 0.45, 'left', it.labels ? it.labels[0] : 'x');
      glyph(p[4] + fs * 0.5, p[5] - fs * 0.2, 'left', it.labels ? it.labels[1] : 'y');
      glyph(p[0] - fs * 0.25, p[1] + fs * 0.2, 'right', 'O');
    }
    // 圆规落下的圆弧：圆心 O、虚线半径、圆心角是从圆规工具「烧」进墨迹的标注（it.ann），
    // 不再是工具的装饰层 —— 所以拖动圆规时它不会跟着跑。这里把整圆范围算进包围盒：
    // 30° 小弧的 pts 包围盒里根本没有圆心，不补就会让标注落在盒外、拖动留残影。
    if (it.ann) {
      const a = it.ann, r = a.r;
      const pad = Math.max(6, Math.min(18, r * 0.16));
      const put = (px, py) => {
        if (px - pad < x1) x1 = px - pad;
        if (px + pad > x2) x2 = px + pad;
        if (py - pad < y1) y1 = py - pad;
        if (py + pad > y2) y2 = py + pad;
      };
      // 只框画出来的那段弧（a0..a1）+ 圆心。以前按整个圆算：90° 的小弧也会得到
      // 直径 2r+105 的方框（实测框 305×305、墨迹只有 123×112，浪费 578%）。
      if (a.full) { put(a.cx - r, a.cy - r); put(a.cx + r, a.cy + r); }
      else {
        const n = 24;
        for (let i = 0; i <= n; i++) {
          const t = a.a0 + (a.a1 - a.a0) * (i / n);
          put(a.cx + Math.cos(t) * r, a.cy + Math.sin(t) * r);
        }
      }
      // 圆心 O、半径、圆心角三个标注都画在圆心附近，圆心本身必须留出
      put(a.cx, a.cy);
    }
    return (it._bb = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  }
  GW.bbox = bbox;
  // 只改颜色 / 线宽时不必丢掉路径缓存（Path2D 与颜色无关），避免整屏重画时反复重建路径
  GW.invalidateStyle = (it) => { delete it._bb; };
  // 2.0.3：颗粒缓存 _gp 也要一起清 —— 换笔 / 改粗细 / 改点是「重算什么样子」，不是「换个位置」。
  GW.invalidate = (it) => { delete it._bb; delete it._path; delete it._paths; delete it._mrb; delete it._dashPath; delete it._gp; delete it._gpW; };

  // ---------- 旋转中心（1.5.1：磁场里的圆，旋转中心不一定是圆心） ----------
  // 条目可以带一对世界坐标 pv:{x,y} 与开关 pvOn。pvOn 关掉时一律退回「它自己的中心」——
  // pb/ms 用用户框中心，其它墨迹用 bbox 中心，与 1.5.0 之前的行为逐像素一致。
  // 之所以把中心做成世界坐标而不是框比例：老师把圆转到别处以后，中心不能跟着框漂。
  GW.basePivotOf = function (it) {
    if (!it) return null;
    if (it.type === 'pb' || it.type === 'ms') return { x: (it.x1 + it.x2) / 2, y: (it.y1 + it.y2) / 2 };
    if (it.kind === 'obj') return { x: it.x + it.w / 2, y: it.y + it.h / 2 };
    const b = GW.bbox(it);
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
  };
  // 只认「开关打开且坐标有效」的自定义中心，其余情况交给调用方用各自的几何中心
  GW.pivotOf = function (it) {
    if (it && it.pvOn && it.pv && isFinite(it.pv.x) && isFinite(it.pv.y)) return { x: it.pv.x, y: it.pv.y };
    return null;
  };
  GW.pivotAny = function (it) { return GW.pivotOf(it) || GW.basePivotOf(it); };

  // ---------- 最小包围矩形（虚线框用） ----------
  // 虚线框要「刚好框住、不留白」。轴对齐包围盒（bbox）对转 45° 的三角形、斜着的手写笔迹会大出四五成；
  // 而「把旋转前的框整体转过去」对细长斜线反而更大（转 45° 面积翻倍）。所以用凸包 + 旋转卡壳
  // 求真正的最小面积矩形，缓存进 _mrb（GW.invalidate 清）。ms / pb 有自己的 x1/y1/x2/y2 框，不走这里。
  function hull2(ps) {
    const p = ps.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    const up = [];
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  GW.minBox = function (it) {
    if (it._mrb) return it._mrb;
    if (it.type === 'ms' || it.type === 'pb') return null;
    // 坐标轴（轴名 x/y/O 是 fillText 直接画的字形）和圆规弧（圆心/半径/角度标注在弧外）不走这里：
    // 它们的墨迹范围没法只用 pts 表达，硬算最小矩形会让标注露在框外（实测数轴露 12.5px）。
    if (it.type === 'axes' || it.ann) return null;
    const ps = [];
    const add = (x, y) => ps.push([x, y]);
    if (it.pts) for (let i = 0; i + 1 < it.pts.length; i += 2) add(it.pts[i], it.pts[i + 1]);
    if (it.segs) for (const s of it.segs) if (s) for (let i = 0; i + 1 < s.length; i += 2) add(s[i], s[i + 1]);
    if (it.texts) for (const t of it.texts) {
      const sz = t.s || 12, str = String(t.t || '');
      let w = 0;
      for (let c = 0; c < str.length; c++) w += str.charCodeAt(c) > 0x2e80 ? 1.0 : 0.62;
      w = (sz * w) / 2;
      const hh = sz * 0.68;
      add(t.x - w, t.y - hh); add(t.x + w, t.y - hh); add(t.x + w, t.y + hh); add(t.x - w, t.y + hh);
    }
    if (!ps.length) return null;
    const hp = hull2(ps);
    const cand = [];
    let minA = Infinity;
    for (let i = 0; i < hp.length; i++) {
      const a = hp[i], b = hp[(i + 1) % hp.length];
      const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
      const ux = ex / L, uy = ey / L, vx = -uy, vy = ux;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const q of hp) {
        const u = q[0] * ux + q[1] * uy, v = q[0] * vx + q[1] * vy;
        if (u < u0) u0 = u; if (u > u1) u1 = u;
        if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      const w = u1 - u0, h = v1 - v0, area = w * h;
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      cand.push({ area, w, h, cx: cu * ux + cv * vx, cy: cu * uy + cv * vy, rot: Math.atan2(uy, ux) });
      if (area < minA) minA = area;
    }
    // 面积差在 6% 以内的候选里，挑「角度最接近图形自身旋转角 _rot」的那个：
    // 三角形这类图形的多个最小矩形几乎等面积（都贴着某条边），纯取最小会让虚线框在两个
    // 等价角度之间跳来跳去（旋转 45° 后框看起来「没跟着转」）。偏 6% 换稳定。
    const ref0 = it._rot || it.rot || 0;
    let best = null, bestD = Infinity;
    for (const c of cand) {
      if (c.area > minA * 1.06) continue;
      let d = c.rot - ref0;
      while (d > Math.PI / 2) d -= Math.PI;
      while (d < -Math.PI / 2) d += Math.PI;
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = c; }
    }
    if (!best) best = cand[0];
    let lw = it.width || 2;
    if (it.ws) for (const v of it.ws) if (v > lw) lw = v;
    if (it.type === 'arrow' || it.type === 'axes') lw = lw * 3 + 6;
    const pad = lw / 2 + 1;
    best.w += pad * 2; best.h += pad * 2;
    return (it._mrb = best);
  };

  // 变宽笔迹的轮廓多边形
  function outlinePath(pts, ws) {
    const n = pts.length / 2, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const x = pts[2 * i], y = pts[2 * i + 1];
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let dx = pts[2 * b] - pts[2 * a], dy = pts[2 * b + 1] - pts[2 * a + 1];
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const w = ws[i] / 2;
      L.push(x - dy * w, y + dx * w); R.push(x + dy * w, y - dx * w);
    }
    const P = new Path2D();
    P.moveTo(L[0], L[1]);
    for (let i = 2; i < L.length; i += 2) P.lineTo(L[i], L[i + 1]);
    // 终点圆帽
    const ex = pts[2 * n - 2], ey = pts[2 * n - 1];
    P.arc(ex, ey, ws[n - 1] / 2, Math.atan2(L[L.length - 1] - ey, L[L.length - 2] - ex), Math.atan2(R[R.length - 1] - ey, R[R.length - 2] - ex), true);
    for (let i = R.length - 2; i >= 0; i -= 2) P.lineTo(R[i], R[i + 1]);
    P.arc(pts[0], pts[1], ws[0] / 2, Math.atan2(R[1] - pts[1], R[0] - pts[0]), Math.atan2(L[1] - pts[1], L[0] - pts[0]), true);
    P.closePath();
    return P;
  }
  function smoothPath(pts, closed) {
    const P = new Path2D(), n = pts.length / 2;
    if (n === 1) { P.moveTo(pts[0], pts[1]); P.lineTo(pts[0] + 0.01, pts[1]); return P; }
    if (n === 2) { P.moveTo(pts[0], pts[1]); P.lineTo(pts[2], pts[3]); return P; }
    P.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n - 1; i++) {
      const mx = (pts[2 * i] + pts[2 * i + 2]) / 2, my = (pts[2 * i + 1] + pts[2 * i + 3]) / 2;
      P.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], mx, my);
    }
    P.lineTo(pts[2 * n - 2], pts[2 * n - 1]);
    if (closed) P.closePath();
    return P;
  }
  function polyPath(pts, closed) {
    const P = new Path2D();
    P.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) P.lineTo(pts[i], pts[i + 1]);
    if (closed) P.closePath();
    return P;
  }
  // 1.3.1：变宽笔迹轮廓 = 去重 → 张力样条（Catmull-Rom）重采样 → 沿法线偏移。
  // 为什么不是「在相邻两点间插一段贝塞尔」：采样点本身还带着手抖和压力台阶，
  // 只在两点之间补曲线，放大后仍然是「一段直边 + 一个折角」。这里先把中心线按
  // **当前缩放的屏幕像素密度**重采样（屏幕上约 1.5px 一个点），再生成轮廓，
  // 所以放多大都不会出现直线段；缩小时点数自动变少，重绘也更快。
  // ws 可以为 null：手指 / 鼠标 / 不产生压感的屏（1.4.2）当时宽度恒为 W。
  // 以前这类笔迹直接走 smoothPath（描边），放大后就是一条条折线；现在也在曲线轮廓里。
  function dedupeSamples(pts, ws, minGap, W) {
    const n = pts.length / 2, out = [];
    let lx = pts[0], ly = pts[1];
    out.push({ x: lx, y: ly, w: ws ? ws[0] : W });
    for (let i = 1; i < n; i++) {
      const x = pts[2 * i], y = pts[2 * i + 1];
      if (i < n - 1 && Math.hypot(x - lx, y - ly) < minGap) continue;
      out.push({ x, y, w: ws ? ws[i] : W });
      lx = x; ly = y;
    }
    return out;
  }
  // 2.0.8（I3）：k = 张力系数（默认 0.5 = 原来的 Catmull-Rom，逐位等价）。
  // k 小 → 切线变短 → 折角处过冲收敛（"贴服"）；k 大 → 过冲更明显（"糖化"）。
  // 只在 GW.settings.inkHobby 打开时按段给非 0.5 的 k，其余路径行为不变。
  const crSpline = (a, b, c, d, t, k) => {
    const T = k == null ? 0.5 : k;
    const t2 = t * t, t3 = t2 * t;
    const m1 = (c - a) * T, m2 = (d - b) * T;
    return (2 * t3 - 3 * t2 + 1) * b + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * c + (t3 - t2) * m2;
  };
  function resampleSpline(S, step, tensionAt) {
    const n = S.length;
    if (n < 2) return S.slice();
    const out = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = S[Math.max(0, i - 1)], p1 = S[i], p2 = S[i + 1], p3 = S[Math.min(n - 1, i + 2)];
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const k = Math.max(1, Math.min(32, Math.ceil(len / Math.max(step, 0.02))));
      // 2.0.8（I3）：逐段张力。默认 undefined → crSpline 内部回落 0.5（老行为）。
      const tn = tensionAt ? tensionAt(i) : undefined;
      for (let j = 0; j < k; j++) {
        const t = j / k;
        out.push({
          x: crSpline(p0.x, p1.x, p2.x, p3.x, t, tn),
          y: crSpline(p0.y, p1.y, p2.y, p3.y, t, tn),
          w: p1.w + (p2.w - p1.w) * t,
        });
      }
    }
    out.push({ x: S[n - 1].x, y: S[n - 1].y, w: S[n - 1].w });
    return out;
  }
  // 宽度做一次 [1,2,1] 平滑：压力采样是台阶状的，线性插值会在变宽处留下「台阶边」
  function smoothWidths(S, scale) {
    const n = S.length;
    if (n < 3) return S;
    const w = S.map((p) => p.w), o = w.slice();
    for (let i = 1; i < n - 1; i++) o[i] = (w[i - 1] + w[i] * 2 + w[i + 1]) / 4;
    // 1.7.4：这个下限原来是**世界单位**的 0.5 —— 1× 下等于 0.5 屏幕像素，没问题；
    // 但放大到 20× 时，一笔普通钢笔的宽度只有 0.15 世界单位，全被抬到 0.5 ⇒ 整条笔迹
    // 变成等宽的粗管子，压感/笔锋一起消失（用户：2000% 下「粗细笔锋压感全失效」）。
    // 改成按屏幕像素给下限：0.5 屏幕像素，缩放到多少倍都是同一条线该有的样子。
    const floor = 0.5 / Math.max(0.15, scale || 1);
    for (let i = 0; i < n; i++) S[i].w = Math.max(floor, o[i]);
    return S;
  }
  // 中心线采样（曲线轮廓与探针共用）：去重 → 按屏幕密度重采样 → 宽度平滑
  function splineSamples(pts, ws, scale, W) {
    const n = pts.length / 2;
    const s = Math.max(0.15, scale || 1);
    // 1.7.3：屏幕密度 1.5px/点 → 1.2px/点，上限 700 → 900 点。
    // 放大到 3× 时一顿 200px 的笔画原本只有 ~130 个采样点，转到 90° 的钩子只有 6~8 个点，
    // 放大看就是「几段直线拼起来的一角」。密一点，转折的圆度直接由采样密度决定。
    // 代价只在「重建轮廓」这一次（缩放跨过 8% 才重建）；实测 241 点的一笔 outline 0.7ms。
    let step = 1.2 / s;
    let S = dedupeSamples(pts, ws, Math.max(step * 0.35, 0.04), W || 2);
    // 总点数封顶 900：一笔写满一屏时也不让「重画一次」变成几万段
    if (S.length > 900) step *= S.length / 900;
    // 2.0.8（I3）：张力自适应。相邻两段长度差越大（急转折/长直线接短弧），切线收得越短，
    // 压住 Catmull-Rom 在折角处的过冲。等长段（r≈0）k 仍是 0.5，与原来完全一致。
    let tensionAt = null;
    if ((GW.settings || {}).inkHobby) {
      tensionAt = (i) => {
        const a = S[Math.max(0, i - 1)], b = S[i], c = S[Math.min(S.length - 1, i + 1)];
        const l1 = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
        const l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1e-6;
        const r = Math.abs(l1 - l2) / (l1 + l2);
        return 0.5 * (1 - 0.3 * r);
      };
    }
    return smoothWidths(resampleSpline(S, step, tensionAt), s);
  }
  // cap：'round' 圆头（默认，与 2.0.2 一致）| 'butt' 平头（马克笔 / 粉笔：落笔就是一条平边）
  function curveOutline(pts, ws, scale, W, cap, tipFlat) {
    const n = pts.length / 2;
    if (n < 3) return outlinePath(pts, ws || new Array(n).fill(W || 2));
    const S = splineSamples(pts, ws, scale, W || 2);
    const m = S.length, P = new Path2D();
    // 1.7.3：放大后「写完字糊成一团」的根因是**法线抖动**。
    // 轮廓是「沿法线偏移中心线」得到的；采样点一抖（压感台阶、手抖、缩放后点距变近），
    // 相邻法线就会互相打架，偏移多边形自交，nonzero 填充把交叠处整块糊实 —— 表现为
    // 笔迹突然变粗、字粘在一起。这里两道保险（都只作用于「稠密重采样」这一种情形）：
    //   ① 中心线过一遍 [1,2,1]（端点不动），抹掉高频抖动；
    //   ② 法线用 i±2 的长弦算，且点距 < 0.6 倍半宽时限幅 ±28°/步，杜绝发夹弯翻折。
    const xs = new Float64Array(m), ys = new Float64Array(m);
    for (let i = 0; i < m; i++) { xs[i] = S[i].x; ys[i] = S[i].y; }
    {
      const px = xs.slice(), py = ys.slice();
      for (let i = 1; i < m - 1; i++) {
        xs[i] = (px[i - 1] + 2 * px[i] + px[i + 1]) / 4;
        ys[i] = (py[i - 1] + 2 * py[i] + py[i + 1]) / 4;
      }
    }
    const nx = new Float64Array(m), ny = new Float64Array(m);
    const LIM = 0.5;                        // 单步最多转 28°
    let pang = null;
    for (let i = 0; i < m; i++) {
      const a = Math.max(0, i - 2), b = Math.min(m - 1, i + 2);
      let dx = xs[b] - xs[a], dy = ys[b] - ys[a];
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      let ang = Math.atan2(dy, dx);
      // 只有「点距远小于笔宽」时才限幅：那是重采样后 1.5px 一个点、法线容易抖的情形。
      // 真·折角（4 段圆弧那种大跨度采样）必须原样保留，否则探针的反向对照失效，
      // 现实中也会把老师特意画出的尖角（箭头尖、坐标轴交汇）抹圆。
      const stepLen = i ? Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) : Infinity;
      // 2.0.4 D：阈值原来含当前点半宽 S[i].w，宽度一变 jitter 布尔就翻转，
      // 法线角限幅时开时关 ⇒ 轮廓锯齿。改用基础笔宽 W（整笔常量），与宽度解耦。
      const jitter = stepLen < ((W || 2) / 2) * 0.6;
      if (pang !== null && jitter) {
        let da = ang - pang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (da > LIM) da = LIM; else if (da < -LIM) da = -LIM;
        ang = pang + da;
      }
      pang = ang;
      nx[i] = -Math.sin(ang); ny[i] = Math.cos(ang);
    }
    const hw = (i) => S[i].w / 2;
    const flat = cap === 'butt';
    P.moveTo(xs[0] + nx[0] * hw(0), ys[0] + ny[0] * hw(0));
    for (let i = 1; i < m; i++) P.lineTo(xs[i] + nx[i] * hw(i), ys[i] + ny[i] * hw(i));
    const e = m - 1;
    if (flat) {
      // 2.0.4：平头笔的「锋」= 端边斜切角（只改端边，不碰 P.arc，不新增渲染分支）。
      const skew = (tipFlat || 0) * hw(e) * 1.2;
      if (skew > 0) {
        let tx = xs[e] - xs[e - 1], ty = ys[e] - ys[e - 1];
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        P.lineTo(xs[e] + nx[e] * hw(e) - tx * skew, ys[e] + ny[e] * hw(e) - ty * skew);
        P.lineTo(xs[e] - nx[e] * hw(e) + tx * skew, ys[e] - ny[e] * hw(e) + ty * skew);
      }
      // 平头：末端直接用一条横边封口（不绕半圆），再从右侧走回来
      P.lineTo(xs[e] - nx[e] * hw(e), ys[e] - ny[e] * hw(e));
    } else if ((tipFlat || 0) > 0) {
      // 2.0.4：圆帽笔的扁平度 ⇒ 椭圆端帽（仅 cap==='round'；缺省 0 完全走原来的 P.arc）。
      P.ellipse(xs[e], ys[e], hw(e), hw(e) * (1 - 0.5 * tipFlat), 0,
        Math.atan2(ny[e], nx[e]), Math.atan2(-ny[e], -nx[e]), true);
    } else {
      // 末端圆帽：从左侧偏移点绕到右侧，走「前进方向」那一半圆（anticlockwise=true 才是往前盖）
      P.arc(xs[e], ys[e], hw(e), Math.atan2(ny[e], nx[e]), Math.atan2(-ny[e], -nx[e]), true);
    }
    for (let i = m - 1; i >= 0; i--) P.lineTo(xs[i] - nx[i] * hw(i), ys[i] - ny[i] * hw(i));
    if (!flat && (tipFlat || 0) > 0) {
      P.ellipse(xs[0], ys[0], hw(0), hw(0) * (1 - 0.5 * tipFlat), 0,
        Math.atan2(-ny[0], -nx[0]), Math.atan2(ny[0], nx[0]), true);
    } else if (!flat) P.arc(xs[0], ys[0], hw(0), Math.atan2(-ny[0], -nx[0]), Math.atan2(ny[0], nx[0]), true);
    P.closePath();
    return P;
  }
  // ---------- 2.0.3：颗粒（铅笔 / 粉笔） ----------
  // 做法：在笔迹轮廓内部「打孔」（destination-out），让底色从针孔里透出来 —— 这就是铅笔的
  // 纸面颗粒、粉笔的粗粝感。孔洞在世界坐标里按笔迹 id 派生（同一条笔迹每次重绘、导出、缩略图
  // 都是同一批孔），所以缩放不需要重建，只在笔宽变了（换了笔/换了粗细）时重建一次。
  // 为什么不用「叠几层低透明度描边」：那是把笔迹整体变淡，不是颗粒，放大后依然是一条均匀的带子。
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function grainPath(it, W, density) {
    const cnt = it.pts ? it.pts.length / 2 : 0;
    if (cnt < 2 || !(W > 0)) return null;
    if (it._gp && it._gpW === W) return it._gp;
    const IS = GW.inkStyle;
    const rnd = mulberry(IS ? IS.seed(it) : (it.id ? it.id.length * 2654435761 : 1));
    // 沿中心线累计弧长，按「长度 / 笔宽」决定孔洞数量（短笔几个孔，长笔最多 220 个）
    const P = it.pts, seg = [];
    let total = 0;
    for (let i = 1; i < cnt; i++) {
      const d = Math.hypot(P[2 * i] - P[2 * i - 2], P[2 * i + 1] - P[2 * i - 1]);
      seg.push(d); total += d;
    }
    if (!(total > 0)) return null;
    const n = Math.max(6, Math.min(220, Math.round((total / Math.max(W, 0.2)) * 1.1 * (0.6 + density))));
    const G = new Path2D();
    for (let k = 0; k < n; k++) {
      // 按弧长均匀取点 + 轻微扰动，避免孔洞排成等距的一串
      const target = ((k + rnd() * 0.9) / n) * total;
      let acc = 0, i = 0;
      while (i < seg.length - 1 && acc + seg[i] < target) { acc += seg[i]; i++; }
      const t = seg[i] > 0 ? Math.min(1, (target - acc) / seg[i]) : 0;
      const x1 = P[2 * i], y1 = P[2 * i + 1], x2 = P[2 * i + 2], y2 = P[2 * i + 3];
      const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
      // 法向偏移在 ±0.42W 以内：孔洞落在笔迹内部，边缘仍是实心，轮廓不会被打碎
      const off = (rnd() - 0.5) * W * 0.84;
      const r = W * (0.045 + rnd() * 0.13 * (0.5 + density));
      G.moveTo(x - dy / L * off + r, y + dx / L * off);
      G.arc(x - dy / L * off, y + dx / L * off, r, 0, Math.PI * 2);
    }
    it._gp = G;
    it._gpW = W;
    return G;
  }
  GW.paths = { outlinePath, curveOutline, smoothPath, polyPath, splineSamples, grainPath };

  // ---------- 2.0.3：笔迹轮廓的**预算化重建** ----------
  // 缩放/拖动画布之所以卡，不是因为「画得多」，而是因为「一帧里把所有跨过 8% 缩放的笔迹
  // 全部重采样了一遍」。curveOutline 每条 0.4~0.8ms（900 点上限），一屏 200~400 条笔迹
  // 就是 100~300ms —— 掉帧就掉在这里。
  // 现在把「重采样密度」这件事推迟到空闲帧做：先用上一条轮廓照常画（几何一致，只是采样密度
  // 是上一档的，肉眼不可见），然后每帧最多花 4ms 补建，补完再整幅重画一帧。
  // 判据与优先级：宽度档变了（kMin，粗细明显不对）必须立刻建；漂移 >60%（形状会看出来）
  // 也立刻建；其余排队。导出/探针走 exact 时不排队，保证导出物是当前缩放的完整精度。
  let pathQ = [];
  let pathQMark = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  function buildStrokePath(it, sNow, kMin, W, inkSt) {
    const tapered = !!(it.ws && it.ws.length * 2 === it.pts.length);
    // 1.7.3：只要有 3 个点以上，一律走样条轮廓。以前「有 ws 但长度对不上」
    // （部分老文件、以及个别工具在收笔时补了最后一个点却没补宽度）会掉进 outlinePath，
    // 那是把原始点用直线连起来再偏移 —— 放大到 3× 就是一段段折线，也就是用户说的
    // 「放大后笔迹不顺滑、转折不圆润」。outlinePath 现在只留给 2 点的顿笔。
    const useSpline = it.pts.length >= 6;
    const capMode = inkSt ? inkSt.cap : 'round';
    // 2.0.4：扁平度按笔种取（缺省 0 ⇒ 圆帽 / 平头几何逐位不变）。
    const tipCfg = GW.settings && GW.settings.penTipCfg && inkSt ? GW.settings.penTipCfg[inkSt.id] : null;
    const tipFlat = tipCfg ? (+tipCfg.penTipFlat || 0) : 0;
    it._path = useSpline
      ? curveOutline(it.pts, tapered ? it.ws.map((v) => v * kMin) : null, sNow, W * kMin, capMode, tipFlat)
      : outlinePath(it.pts, (tapered ? it.ws : new Array(it.pts.length / 2).fill(W)).map((v) => v * kMin));
    it._pathS = sNow;
    it._pathK = kMin;
    it._curved = useSpline ? 1 : 0;
    it._pathDefer = 0;
  }
  function queuePath(it) {
    if (!pathQMark) return false;
    if (pathQ.length > 300) return false;       // 极端场景（一次扔进来上千条）立刻建，别把内存排爆
    if (pathQMark.has(it)) return true;
    pathQMark.add(it);
    pathQ.push(it);
    return true;
  }
  // 每帧只花 ms 毫秒补建；返回「还有没有剩」
  function pumpPathQueue(ms) {
    if (!pathQ.length) return false;
    const t0 = performance.now();
    while (pathQ.length) {
      const it = pathQ.shift();
      if (pathQMark) pathQMark.delete(it);
      if (!it || !it.pts || !it._path) continue;
      const inkSt = GW.inkStyle && !it.hl ? GW.inkStyle.renderOf(it) : null;
      buildStrokePath(it, view.s || 1, inkMinK(it), it.width || 2, inkSt);
      if (performance.now() - t0 > (ms || 4)) break;
    }
    return pathQ.length > 0;
  }
  GW.pathQueueSize = () => pathQ.length;
  GW.pumpPathQueue = pumpPathQueue;

  function arrowHead(ctx, x1, y1, x2, y2, w, color) {
    const L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 1) return;
    const ux = (x2 - x1) / L, uy = (y2 - y1) / L, h = Math.min(L * 0.5, 8 + w * 3.2), hw = h * 0.42;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2 + ux * w * 0.6, y2 + uy * w * 0.6);
    ctx.lineTo(x2 - ux * h - uy * hw, y2 - uy * h + ux * hw);
    ctx.lineTo(x2 - ux * h * 0.7, y2 - uy * h * 0.7);
    ctx.lineTo(x2 - ux * h + uy * hw, y2 - uy * h - ux * hw);
    ctx.closePath(); ctx.fill();
  }

  // 圆规圆弧的标注层：圆心（实心点 + 十字 + O）、虚线半径、圆心角。
  // 圆弧要「起点、终点分别与圆心用虚线连起来」，整圆则不画半径虚线、不标圆心角；不再标半径读数，
  // 半径大小由圆规工具自己的读数显示，画布上只留几何关系，板书更干净。
  function drawAnn(ctx, it) {
    const a = it.ann; if (!a) return;
    const s = GW.camera.s || 1, r = Math.max(1, a.r);
    const fs = Math.max(10, Math.min(22, r * 0.22)) / s;
    const lw = Math.max(1.2, (it.width || 2) * 0.75) / s;
    const full = !!a.full;
    const a0 = a.a0, a1 = full ? a.a0 + Math.PI * 2 : a.a1;
    const am = full ? a0 : a0 + (a1 - a0) / 2;
    const cx = a.cx, cy = a.cy, ux = Math.cos(am), uy = Math.sin(am);
    ctx.save();
    ctx.strokeStyle = it.color; ctx.fillStyle = it.color;
    ctx.lineWidth = lw; ctx.lineCap = 'round';
    // 圆心：小实心点 + 十字
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(lw * 1.4, fs * 0.10), 0, Math.PI * 2); ctx.fill();
    const arm = fs * 0.46;
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
    ctx.stroke();
    // 虚线半径：整圆不画辅助线；圆弧画起点、终点两条，明确「半径」是怎么量的。
    ctx.setLineDash([fs * 0.55, fs * 0.34]);
    ctx.beginPath();
    for (const ang of (full ? [] : [a0, a1])) {
      ctx.moveTo(cx, cy); ctx.lineTo(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '600 ' + fs + 'px "Segoe UI",system-ui,-apple-system,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // O 放在圆心左下，避开十字与半径线
    ctx.fillText('O', cx - fs * 0.66, cy + fs * 0.66);
    // 圆心角：整圆不标；扇形写在角平分线上、离圆心 2.3 个字高；小圆时收进半径内，别糊到弧外
    if (!full) {
      const deg = Math.abs(a1 - a0) * 180 / Math.PI;
      const off = Math.min(fs * 2.3, r * 0.55);
      ctx.fillText((deg >= 359.5 ? 360 : deg).toFixed(0) + '°', cx + ux * off, cy + uy * off);
    }
    ctx.restore();
  }

  // 1.3.2：磁场填充。×＝垂直纸面向里，·＝向外，是电磁学板书的通用画法。
  // 只作用于闭合多边形（矩形/圆/椭圆/三角形/直角三角形/平行四边形/梯形/正多边形）。
  // 刻意**不用 ctx.clip()**：导出走的是「记录器 ctx」，clip 在 SVG/PDF 里没有对应语义，
  // 符号会漏到框外；这里改成「符号中心到每条边的距离都要大于半个符号」，
  // 效果与裁剪等价，而且三端（画布 / SVG / PDF）行为一致。
  function magMarks(ctx, it) {
    const P = it.pts, n = P ? P.length : 0;
    if (n < 6 || !it.mf) return;
    const geom = GW.geom;
    if (!geom || !geom.pointInPoly || !geom.distSeg) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i += 2) {
      const x = P[i], y = P[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const side = Math.min(x1 - x0, y1 - y0);
    if (!(side > 16)) return;
    // 间距跟着图形大小走：小图形不至于挤成实心，大图形也不至于只画两个
    const sp = Math.max(18, Math.min(44, side / 4.2));
    const r = Math.min(6.5, sp * 0.22);
    const rows = Math.max(1, Math.floor((y1 - y0) / sp));
    const cols = Math.max(1, Math.floor((x1 - x0) / sp));
    const ox = (x0 + x1) / 2 - ((cols - 1) * sp) / 2;
    const oy = (y0 + y1) / 2 - ((rows - 1) * sp) / 2;
    const dots = new Path2D(), crosses = new Path2D();
    let nDot = 0, nCross = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const cx = ox + j * sp, cy = oy + i * sp;
        if (!geom.pointInPoly(cx, cy, P)) continue;
        // 离边太近的符号会压到轮廓线上（等价于内缩裁剪）
        let dmin = Infinity;
        for (let k = 0; k < n; k += 2) {
          const ax = P[k], ay = P[k + 1], bx = P[(k + 2) % n], by = P[(k + 3) % n];
          const d = geom.distSeg(cx, cy, ax, ay, bx, by);
          if (d < dmin) dmin = d;
        }
        if (dmin < r * 1.35) continue;
        if (it.mf === 'dot') { dots.moveTo(cx + r * 0.9, cy); dots.arc(cx, cy, r * 0.9, 0, Math.PI * 2); nDot++; }
        else { crosses.moveTo(cx - r, cy - r); crosses.lineTo(cx + r, cy + r); crosses.moveTo(cx + r, cy - r); crosses.lineTo(cx - r, cy + r); nCross++; }
      }
    }
    // 线宽随图形粗细走，但有上下限：太细看不清，太粗会把 12° 的小格子糊成一片
    const sw = Math.max(1.1, Math.min(2.4, (it.width || 2) * 0.6));
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = it.color; ctx.fillStyle = it.color;
    if (nCross) { ctx.lineWidth = sw; ctx.lineCap = 'round'; ctx.stroke(crosses); }
    if (nDot) ctx.fill(dots);
    ctx.restore();
  }

  // 1.3.3（R1）：左右镜像的通用画法 —— 把整块交给库之前先横向翻一次。
  // 物理图形库/数学图形库的几百张图都是「只认框、按自己的语义画」，没有统一的 pts 可翻；
  // 唯一能一行不改库就翻过来的办法是在 ctx 上做 transform。
  // 但库里有 80 多处 fillText：直接把转换交给它，字就是镜像字（"m" 反着写），所以用一个
  // Proxy 顶住 ctx，遇到 fillText/strokeText 就先在局部把横翻再抵消掉 —— 位置跟着翻、字形不翻。
  // 1.3.3：把一块「没有点集」的图形（物理图形库 pb / 数学图形 ms）整体翻转后再画。
  //   axis='x'：绕竖中线横翻（从右往左拖）  axis='y'：绕横中线竖翻（从下往上拖）
  // 里层的 Proxy 只干一件事：遇到 fillText/strokeText 就先把翻转抵消掉，字不跟着反（否则出镜像字/倒字）。
  // 除此以外所有调用直通，所以库里的 draw 不用改一行。
  function flipDraw(ctx, c, fn, axis, cy2) {
    const ax = axis === 'xy' ? 'xy' : (axis === 'y' ? 'y' : 'x');
    ctx.save();
    const cxx = ax === 'y' ? 0 : c;                       // x 轴中线
    const cyy = ax === 'x' ? 0 : (ax === 'xy' ? (cy2 == null ? c : cy2) : c);   // y 轴中线
    ctx.translate(2 * cxx, 2 * cyy);
    ctx.scale(ax === 'y' ? 1 : -1, ax === 'x' ? 1 : -1);
    const proxy = new Proxy(ctx, {
      get(t, p) {
        const v = t[p];
        if (typeof v !== 'function') return v;
        if (p === 'fillText' || p === 'strokeText') {
          return function (txt, x, y, ...rest) {
            t.save();
            t.translate(x, y);
            if (ax === 'y') t.scale(1, -1); else if (ax === 'x') t.scale(-1, 1); else t.scale(-1, -1);
            v.call(t, txt, 0, 0, ...rest);
            t.restore();
          };
        }
        return v.bind(t);
      },
      set(t, p, val) { t[p] = val; return true; },
    });
    fn(proxy);
    ctx.restore();
  }
  GW.flipDraw = flipDraw;   // 探针入口（scripts/probe-mirror.js 用它验证「库图形也能翻」）

  // 竖翻（从下往上拖）：几何一个点都不动，只在绘制时整体上下镜一次。
  // 好处是刻度、轴箭头、模板里的分段、以后新加的图形**全都自动支持**，不用在生成处逐个补；
  // 因为镜子就是图形自己的包围盒中线，画出来的东西仍然落在同一个包围盒里（命中/框选/导出都对得上）。
  // ---------- WP4：图案填充（离屏 tile + 缓存）----------
  // fillOf() 现在可返回纯色字符串或 CanvasPattern。tile 边长 = density（世界单位），
  // 用 color/alpha/lineWidth 画一张可 repeat 的小图；CanvasPattern 直接交给 ctx.fillStyle。
  // 缓存 key 含全部影响外观的参数（kind/color/alpha/density/lineWidth），避免串色。
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (m) { const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
    return [51, 102, 255];
  }
  function fillSpecOf(it) {
    return {
      kind: it.fillPattern || 'hatch',
      color: it.fillColor || '#3366ff',
      alpha: it.fillAlpha != null ? it.fillAlpha : 0.2,
      density: it.fillDensity != null ? it.fillDensity : 8,
      lineWidth: it.fillLineWidth != null ? it.fillLineWidth : 1,
    };
  }
  function tileKey(s) {
    return [s.kind, s.color, s.alpha, s.density, s.lineWidth].join('|');
  }
  function drawTile(g, s, N) {
    const rgb = hexToRgb(s.color);
    const col = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + s.alpha + ')';
    g.clearRect(0, 0, N, N);
    g.strokeStyle = col; g.fillStyle = col;
    g.lineWidth = Math.max(0.4, Number(s.lineWidth) || 1);
    g.lineCap = 'butt';
    const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    if (s.kind === 'h') line(0, N / 2, N, N / 2);
    else if (s.kind === 'v') line(N / 2, 0, N / 2, N);
    else if (s.kind === 'cross') { line(0, N / 2, N, N / 2); line(N / 2, 0, N / 2, N); }
    else if (s.kind === 'dots') { g.beginPath(); g.arc(N / 2, N / 2, Math.max(0.6, g.lineWidth), 0, Math.PI * 2); g.fill(); }
    else line(0, N, N, 0);   // hatch（默认斜线）
  }
  const _fillTiles = Object.create(null);
  function fillTile(s) {
    const key = tileKey(s);
    if (_fillTiles[key]) return _fillTiles[key];
    const N = Math.max(4, Math.round(Math.max(2, Math.min(64, Number(s.density) || 8))));
    let cv = null;
    try {
      if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        cv = document.createElement('canvas');
        cv.width = N; cv.height = N;
        const g = cv.getContext && cv.getContext('2d');
        if (g) drawTile(g, s, N);
      }
    } catch (e) { cv = null; }
    if (!cv) cv = { width: N, height: N, __stub: true };   // 无 DOM：占位对象仍带 spec
    cv.__fillSpec = Object.assign({ size: N }, s);          // export.js 的 createPattern 读它
    _fillTiles[key] = cv;
    return cv;
  }
  GW.fillTile = fillTile;              // 探针 / 自检入口
  GW.__fillTileCache = _fillTiles;     // 自检读缓存
  function makeFillPattern(s, ctx) {
    const tile = fillTile(s);
    if (ctx && typeof ctx.createPattern === 'function') {
      const pat = ctx.createPattern(tile, 'repeat');
      if (pat) return pat;
    }
    // 无 ctx / createPattern 返回 null 时降级为半透明纯色，绝不返回 null 造成静默丢弃
    const rgb = hexToRgb(s.color);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + s.alpha + ')';
  }
  function solidOf(it) {
    const c = it.fillColor || it.fill || '#3366ff';
    const a = it.fillAlpha != null ? it.fillAlpha : 0.2;
    return GW.hexA ? GW.hexA(c, a) : (it.fill || c);
  }
  // 1.6.8（R1）：图形的填充色与描边色分离。旧对象只有 it.fill（已经是带 alpha 的
  // rgba 字符串），新对象额外带 it.fillColor + it.fillAlpha。这里统一解析：
  // 有 fillColor 就用它重算，没有就退回旧字段 —— 旧档一个字节都不用迁移。
  // WP4：新对象带可选 fillMode（'none'|'solid'|'pattern'）。fillOf 按字段是否存在分支：
  //   · tape / fill===null / fill===false：一律不填充（线性图形、胶带、老布尔关）；
  //   · 'none'：不填充；'solid'：纯色字符串；'pattern'：CanvasPattern（离屏 tile）；
  //   · 字段缺失（老文档）：完全沿用旧逻辑，返回值与改动前逐字一致。
  function fillOf(it, ctx) {
    if (!it) return null;
    if (it.tape) return it.fill || null;
    if (it.fill === null || it.fill === false) return null;
    const mode = it.fillMode;
    if (mode === 'none') return null;
    if (mode === 'pattern') return makeFillPattern(fillSpecOf(it), ctx);
    if (mode === 'solid') return solidOf(it);
    if (!it.fill) return null;
    if (!it.fillColor) return it.fill;
    return (GW.hexA ? GW.hexA(it.fillColor, it.fillAlpha != null ? it.fillAlpha : 0.18) : it.fill);
  }
  GW.fillOf = fillOf;
  // 放映 PPT 时插入的图形（pb / ms / stk / lor 与化学/生物形状）用的是对象自带的死色（o.color），
  // 深色幻灯片上黑线黑字完全看不清。这里只在这批分支外面**临时**把 fillStyle / strokeStyle 的
  // 写入入口换成本地访问器，写颜色时过一次 GW.inkFix —— 对象自身的 color 一个字节都不改（可逆），
  // 画布常态（没有 inkPaper 覆盖）直接走原路，零开销。inkFix 幂等：已经换算过的近白/近墨色
  // 对比度本来就够，再算一次原样返回。
  let inkCtxDesc = null;
  function runInkCtx(ctx, fn) {
    const fix = GW.inkFix;
    if (!paperOverride || !fix) return fn(ctx);
    if (!inkCtxDesc) {
      const P = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
      inkCtxDesc = P ? { f: Object.getOwnPropertyDescriptor(P, 'fillStyle'), s: Object.getOwnPropertyDescriptor(P, 'strokeStyle') } : { f: null, s: null };
    }
    const df = inkCtxDesc.f, ds = inkCtxDesc.s;
    if (!df || !ds || !df.set || !ds.set) return fn(ctx);
    Object.defineProperty(ctx, 'fillStyle', {
      configurable: true, enumerable: false,
      get() { return df.get.call(ctx); },
      set(v) { if (typeof v === 'string') { const n = fix(v); if (n) v = n; } df.set.call(ctx, v); },
    });
    Object.defineProperty(ctx, 'strokeStyle', {
      configurable: true, enumerable: false,
      get() { return ds.get.call(ctx); },
      set(v) { if (typeof v === 'string') { const n = fix(v); if (n) v = n; } ds.set.call(ctx, v); },
    });
    try { return fn(ctx); } finally { delete ctx.fillStyle; delete ctx.strokeStyle; }
  }
  function drawItem(ctx, it, opts, _noFlipY) {
    const withAnn = !opts || opts.ann !== false;
    // 1.7.0（T09）：课堂「全部揭开」—— 本页的胶带暂时从画面上撤掉（数据一个字节都不改，只是不画）。
    // 1.7.0（T15）：教师批注可一键隐藏（投影给学生看时），同样只影响绘制、不影响数据。
    if (it.tape && GW.tapeOpen) return;
    if (it.type === 'comment' && it.data && it.data.teacher && GW.settings && GW.settings.teacherAnnot === false) return;
    // 物理图形库（type:'pb'）：整张图由 physshapes.js 里的上游 draw 画（世界坐标），
    // 线宽/虚线/颜色也在那一层设，这里只把 ctx 交出去、拿回来。
    // 正在动画的物理图形画在实时层（physshapes.js 的 animDraw），墨迹层这一帧跳过它们，
    // 否则静止的旧帧会和动画帧叠成两个重影。导出时 physshapes 会 setFrozen(true)，这里照常画。
    if (it.type === 'pb' && GW.physShapes) {
      if (GW.physShapes.skipInk && GW.physShapes.skipInk(it)) return;
      if (it.flipX || it.flipY) return flipDraw(ctx, (it.x1 + it.x2) / 2, (c) => runInkCtx(c, (c2) => GW.physShapes.draw(c2, it)),
        it.flipX && it.flipY ? 'xy' : (it.flipX ? 'x' : 'y'), (it.y1 + it.y2) / 2);
      runInkCtx(ctx, (c2) => GW.physShapes.draw(c2, it));
      return;
    }
    if (it.flipY && !_noFlipY) {
      // 镜子必须用**拖拽框的中线**（生成时记在 flipYc 上），不能用包围盒中线：
      // 一条数轴的包围盒高度是 0，绕自己的中线翻等于没翻（踩过）。
      const cy = typeof it.flipYc === 'number' ? it.flipYc : (bbox(it).y + bbox(it).h / 2);
      return flipDraw(ctx, cy, (c) => drawItem(c, it, opts, true), 'y');
    }
    // 1.3.2：有界磁场里的带电粒子（type:'lor'）。播放中由实时层画，墨迹层跳过（同 pb 的处理），
    // 导出时 lorentz.setFrozen(true) 会把它解冻，于是静态帧照常进导出物。
    if (it.type === 'lor' && GW.lorentz) {
      if (GW.lorentz.skipInk && GW.lorentz.skipInk(it)) return;
      runInkCtx(ctx, (c2) => GW.lorentz.draw(c2, it, opts));
      return;
    }
    // 数学可调参图形（type:'ms'）：和 pb 一样交出 ctx，几何全在库里按框现算。
    if (it.type === 'ms' && GW.mathShapes) {
      // 1.6.0（G8）：竖翻在上面 593 行已经整体做过一次了，这里必须认 _noFlipY，否则同一个 ms 图形
      // 会被翻两次（一次绕 flipYc、一次绕框中线），两次正好抵掉 —— 表现为「数学图形库竖翻没反应」。
      if ((it.flipX || it.flipY) && !_noFlipY) return flipDraw(ctx, (it.x1 + it.x2) / 2, (c) => runInkCtx(c, (c2) => GW.mathShapes.draw(c2, it)),
        it.flipX && it.flipY ? 'xy' : (it.flipX ? 'x' : 'y'), (it.y1 + it.y2) / 2);
      runInkCtx(ctx, (c2) => GW.mathShapes.draw(c2, it));
      return;
    }
    // 贴纸库（2.0.7 B4）：纯 canvas 自绘的 geo 图形（type:'stk'），几何/缩放/旋转都在 stickers.js
    if (it.type === 'stk' && GW.stickers) {
      runInkCtx(ctx, (c2) => GW.stickers.draw(c2, it));
      return;
    }
    ctx.save();
    // 留痕副本 / 半透明图形：形状类只有一条 overall 透明度通道（笔迹另有自己的 alpha）。
    if (it.opacity != null && it.opacity < 1) ctx.globalAlpha = Math.max(0, it.opacity);
    // 1.5.3：显示层「自动反差墨色」。深底上用白笔写满一屏，换到白底 / 投影后整屏看不见 ——
    // 这里只换算**画出来的颜色**，it.color 原样不动（.gewu 里还是老师选的那个色，随时可逆）。
    // 荧光笔与带 alpha 的图形不参与：半透明叠加本来就会随底色变，换算了反而更难看。
    const inkC = GW.inkFix && !it.hl && !(it.alpha && it.alpha < 1) ? GW.inkFix(it.color) : it.color;
    if (it.kind === 'stroke') {
      // 2.0.3：笔种（中性笔/圆珠笔/硬笔/钢笔/毛笔/铅笔/马克笔/粉笔）。老笔迹没有 pen 字段，
      // renderOf 一律回落默认笔 ⇒ 与 2.0.2 逐像素一致。荧光笔不吃笔种（它有自己的叠色规则）。
      const inkSt = GW.inkStyle && !it.hl ? GW.inkStyle.renderOf(it) : null;
      ctx.globalAlpha = (it.hl ? 0.38 : it.alpha || 1) * (inkSt ? inkSt.alpha : 1);
      const W = it.width || 2;
      // 1.7.3：缩得很小的时候别把笔迹压成一条灰线。屏幕上不足 1.2px 的笔画按 1.2px 画
      // （最多放粗到 2.2 倍）—— 1.7.2 只放到 0.96px，缩到 0.2× 时整屏笔迹都是同样的浅灰，
      // 老师看到的就是「字全糊了」。0.9→1.0 的阈值也放宽一点，正好卡在「不到 1px」上。
      // 与增量书写共用 inkMinK()：不然抬手那一瞬间宽度会跳（写了半天是细灰线，一松手变粗）。
      const kMin = inkMinK(it);
      // 1.5.0：虚线 / 点线笔迹。下面的轮廓是**填充**出来的（curveOutline + ctx.fill），
      // 而填充不认 setLineDash —— 所以非实线笔迹必须改走中心线描边，否则虚线根本画不出来。
      // 代价：虚线笔迹没有压感笔锋（宽度恒定），这正是「用虚线画辅助线」想要的观感。
      if (it.dashStyle && it.dashStyle !== 'solid') {
        if (!it._dashPath) it._dashPath = smoothPath(it.pts, false);
        ctx.strokeStyle = inkC; ctx.lineWidth = W;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.setLineDash(it.dashStyle === 'dotted' ? [W * 0.05, W * 1.6] : [W * 2.6, W * 2.2]);
        ctx.stroke(it._dashPath);
        ctx.setLineDash([]);
      } else if (it.pts.length <= 4 && (it.pts.length < 4 || Math.hypot(it.pts[2] - it.pts[0], it.pts[3] - it.pts[1]) * (view.s || 1) < 1.5)) {
        // 1.7.1：「点一下」＝一个直径为笔宽的圆。以前走 outlinePath 的两端圆帽，
        // 两个帽在同一个点上叠出来是 2 倍直径（3px 笔点出 6px 的墨团，放大 3 倍就是 18px），
        // 正是用户说的「写字中途点一下出现一个很大的圆点」。笔画本身不受影响。
        // 只有两端几乎重合才算「点」：两点的直线（橡皮擦出的横线、一段胶带）仍走下面的轮廓填充。
        it._curved = 0;
        const w0 = Math.min(W, it.ws && it.ws[0] ? it.ws[0] : W) * kMin;
        ctx.fillStyle = inkC;
        ctx.beginPath();
        ctx.arc(it.pts[0], it.pts[1], w0 / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 1.3.0：曲线轮廓（放多大都不出折线边）。n<3 的顿笔仍走老的直线轮廓。
        // 1.3.1：轮廓按当前缩放重采样，缩放跨过 1.3 倍就重建一次（写的时候不重建，
        // 只在渲染静止状态那几次重建，代价可忽略）。
        // 1.4.2：没有 ws 的笔迹（手指 / 鼠标 / 无压感屏，平板网页端全是这一类）也走曲线轮廓，
        // 以前它们走 smoothPath 描边，放大后是一段段折线 —— 这是平板端「笔迹都是折线」的根因。
        const sNow = view.s || 1, sOld = it._pathS || 0;
        // 1.7.3：重建阈值 12%→8%。缩小时轮廓是按「当时的屏幕密度」重采样的，
        // 差 10% 不重建，笔迹就沿用更疏的点，缩小后转折会看出棱角。
        const kChanged = it._pathK !== kMin;
        const drift = sOld ? Math.abs(sNow - sOld) / sOld : 9;
        const rebuild = !it._path || kChanged || drift > 0.08;
        if (rebuild) {
          // 2.0.3：**缩放不再一帧重建全屏**。
          // 以前每一帧 renderAll 都会把所有跨过 8% 的笔迹重采样一遍（每条约 0.7ms），
          // 一屏两百条笔迹就是 140ms —— 老师滚一格滚轮，画面就顿一下，这正是「缩放/拖动画布卡」。
          // 现在分两种情形：
          //   · 宽度档变了（kMin）或漂移 >60% 或首次绘制 ⇒ 必须立刻建（不然粗细/形状是错的）；
          //   · 其余（只是重采样密度旧了一点，几何完全一致）⇒ 先用旧轮廓照常画，排队到空闲帧再建。
          // 旧轮廓画的仍然是同一条曲线，只是采样密度是上一档的 —— 肉眼看不出来，
          // 建完再重画一帧就补齐了。
          if (it._path && !kChanged && drift <= 0.6 && !(opts && opts.exact) && queuePath(it)) {
            it._pathDefer = 1;
          } else {
            buildStrokePath(it, sNow, kMin, W, inkSt);
          }
        }
        // 1.7.1：两条分支的 _path 都是「有宽度的轮廓多边形」——outlinePath 已经按 ws 生成
        // 两侧边 + 两端圆帽。以前非曲线分支还 stroke 一遍，等于在轮廓外面再糊半个线宽：
        // 3px 的笔点一下量出来 6px（放大 3 倍就是 18px 的墨团），正是用户说的
        // 「写字中途点一下出现一个很大的圆点」。轮廓只该 fill，不该 stroke。
        ctx.fillStyle = inkC; ctx.fill(it._path);
        // 2.0.3：颗粒笔（铅笔 / 粉笔）。在轮廓内部打孔，让底色透出来 —— 一次 clip + 一次 fill，
        // 孔洞 Path2D 按笔宽缓存在对象上，缩放不重建，所以拖动/缩放时的额外开销可以忽略。
        if (inkSt && inkSt.grain > 0) {
          const gp = grainPath(it, W * kMin, inkSt.grain);
          if (gp) {
            ctx.save();
            ctx.clip(it._path);
            ctx.globalCompositeOperation = 'destination-out';
            // 导出用的记录器 ctx 不支持合成模式（它把 globalCompositeOperation 当空实现）。
            // 读回来不是 destination-out 就说明不是真画布 —— 那就直接跳过：
            // 导出物里宁可没有颗粒，也不能在笔迹上多糊一层点。
            if (ctx.globalCompositeOperation === 'destination-out') {
              ctx.globalAlpha = Math.min(0.85, 0.42 + 0.45 * inkSt.grain);
              ctx.fill(gp);
            }
            ctx.restore();
          }
        }
      }
    } else if (it.kind === 'shape') {
      // 老 .gewu 里可能没有 width：画的时候必须与 bbox 用同一个兜底值（it.width || 2）。
      // 否则 `ctx.lineWidth = undefined` 是非法赋值会被忽略，实际沿用上一笔的线宽（可能 14），
      // 画出来比包围盒粗 → 虚线框框不住，拖动时局部重画只擦盒内也会留残影。
      const w = it.width || 2;
      // 1.7.3：缩小时同理，图形描边也别细成一条灰线（屏幕不足 1.2px 按 1.2px，最多 2.2 倍）。
      // 与笔迹共用同一套判据，否则同一屏上「笔迹 1.2px、图形 0.96px」看着像两种墨。
      const sZ = view.s || 1;
      const wDraw = (sZ < 1.0 && w * sZ < 1.15) ? w * Math.min(8, 1.15 / Math.max(1e-4, w * sZ)) : w;
      ctx.strokeStyle = inkC; ctx.lineWidth = wDraw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 线型：识别出来的图形带 it.dashStyle（虚线 / 点线），旧对象只有布尔 it.dash。
      if (it.dashStyle && it.dashStyle !== 'solid') ctx.setLineDash(it.dashStyle === 'dotted' ? [w * 0.05, w * 1.6] : [w * 2.6, w * 2.2]);
      else if (it.dash) ctx.setLineDash([w * 3, w * 2.5]);
      const p = it.pts;
      if (it.type === 'poly') {
        if (!it._path) it._path = it.smooth ? smoothPath(p, it.closed) : polyPath(p, it.closed);
        const fcPoly = fillOf(it, ctx);
        if (fcPoly) { ctx.fillStyle = fcPoly; ctx.fill(it._path); }
        ctx.stroke(it._path);
        // 1.7.4（R9）：折线连接线的末端箭头（几何在 input.js 的 buildShape case 'elbow'）
        if (it.elbow && p.length >= 4) {
          ctx.setLineDash([]);
          arrowHead(ctx, p[p.length - 4], p[p.length - 3], p[p.length - 2], p[p.length - 1], w, inkC);
        }
        if (it.mf) magMarks(ctx, it);
        if (it.ann && withAnn) drawAnn(ctx, it);
      } else if (it.type === 'arrow') {
        const L = Math.hypot(p[2] - p[0], p[3] - p[1]) || 1, ux = (p[2] - p[0]) / L, uy = (p[3] - p[1]) / L, cut = Math.min(L * 0.4, 6 + w * 2.4);
        ctx.beginPath();
        ctx.moveTo(p[0] + (it.double ? ux * cut : 0), p[1] + (it.double ? uy * cut : 0));
        ctx.lineTo(p[2] - ux * cut, p[3] - uy * cut); ctx.stroke();
        ctx.setLineDash([]);
        arrowHead(ctx, p[0], p[1], p[2], p[3], w, inkC);
        if (it.double) arrowHead(ctx, p[2], p[3], p[0], p[1], w, inkC);
      } else if (it.type === 'axes') {
        // pts: O, X端, Y端 [, X负端, Y负端]
        const [ox, oy, xx, xy, yx, yy] = p;
        const nx = p.length > 6 ? p[6] : ox, ny = p.length > 6 ? p[7] : oy, mx = p.length > 8 ? p[8] : ox, my = p.length > 8 ? p[9] : oy;
        ctx.setLineDash([]);
        // 轴线与刻度缓存成 Path2D：坐标轴是常驻内容，不该每帧重建上百条线段
        if (!it._path) {
          const P = new Path2D();
          P.moveTo(nx, ny); P.lineTo(xx, xy); P.moveTo(mx, my); P.lineTo(yx, yy);
          // 基础图形的坐标轴只要轴线与箭头：刻度线一律不画（老师反馈「坐标轴不要刻度」）。
          it._path = P;
        }
        ctx.stroke(it._path);
        arrowHead(ctx, nx, ny, xx, xy, w, inkC);
        arrowHead(ctx, mx, my, yx, yy, w, inkC);
        const fs = 10 + w * 4;
        ctx.fillStyle = inkC; ctx.font = `italic ${fs}px "Times New Roman", serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(it.labels ? it.labels[0] : 'x', xx - fs * 0.4, xy + fs * 0.45);
        ctx.fillText(it.labels ? it.labels[1] : 'y', yx + fs * 0.5, yy - fs * 0.2);
        ctx.textAlign = 'right'; ctx.fillText('O', ox - fs * 0.25, oy + fs * 0.2);
      } else if (it.type === 'multi') {
        // 复合线（学科模板库，见 core/stencils.js）：segs 是若干条互不相连的折线，各自 moveTo 起头。
        // 圆弧类一律由生成端稠密化成折线 —— 渲染端只认折线，少一层状态，整块还能缓存成一个 Path2D。
        // ★ 这里必须自己设 strokeStyle / lineWidth：不设就沿用「上一笔」留下的画布状态（先画过 14 宽的
        //   笔，模板线条就整体变粗、颜色也跟着上一次走），同一张板书里两个模板的线宽能差一倍。
        // ★ parts 是 1.0.9 之后加的分段上色：[{ c: 颜色, w: 线宽, f: 填充, s: [折线, …] }, …]。
        //   力/速度这类矢量画红、辅助线画灰、器件与文字用墨色；没有 parts 的老模板与老 .gewu 照旧单色。
        const w0 = it.width || 2;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (it.parts) {
          if (!it._paths) {
            it._paths = it.parts.map((p) => {
              const P = new Path2D();
              for (const g of p.s || []) {
                if (!g || g.length < 4) continue;
                P.moveTo(g[0], g[1]);
                for (let i = 2; i < g.length; i += 2) P.lineTo(g[i], g[i + 1]);
              }
              return P;
            });
          }
          for (let k = 0; k < it.parts.length; k++) {
            const p = it.parts[k], P = it._paths[k];
            if (!P) continue;
            if (p.f) { ctx.fillStyle = p.f; ctx.fill(P); }
            if (p.ns) continue;            // 纯底纹段：只填色不描边（bg() 铺的浅色块）
            ctx.strokeStyle = p.c || inkC;
            ctx.lineWidth = p.w || w0;
            ctx.stroke(P);
          }
        } else {
          if (!it._path) {
            const P = new Path2D();
            for (const g of it.segs || []) {
              if (!g || g.length < 4) continue;
              P.moveTo(g[0], g[1]);
              for (let i = 2; i < g.length; i += 2) P.lineTo(g[i], g[i + 1]);
            }
            it._path = P;
          }
          const fcPb = fillOf(it, ctx);
          if (fcPb) { ctx.fillStyle = fcPb; ctx.fill(it._path); }
          ctx.strokeStyle = inkC; ctx.lineWidth = w0;
          ctx.stroke(it._path);
        }
      }
      // 模板里的字母标注（电流表的 A、磁铁的 N/S 等）。用居中基线，坐标就是字心。
      if (it.texts) {
        ctx.setLineDash([]);
        ctx.fillStyle = inkC;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const t of it.texts) {
          ctx.font = (t.bold === false ? '' : 'bold ') + t.s + 'px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
          ctx.fillText(t.t, t.x, t.y);
        }
      }
    }
    ctx.restore();
  }
  GW.drawItem = drawItem;

  // ---------- 背景 ----------
  const BG = {
    white: { fill: '#ffffff', line: 'rgba(40,60,90,0.10)', line2: 'rgba(40,60,90,0.22)', pen: '#1b2433' },
    paper: { fill: '#fbf8f1', line: 'rgba(120,90,40,0.12)', line2: 'rgba(120,90,40,0.25)', pen: '#1b2433' },
    green: { fill: '#1f3b30', line: 'rgba(255,255,255,0.08)', line2: 'rgba(255,255,255,0.18)', pen: '#ffffff' },
    // 「黑板」= 纯黑：#000 比原来的 #16191f 对比度更高，方格线也提亮到投影后仍看得见
    black: { fill: '#000000', line: 'rgba(255,255,255,0.16)', line2: 'rgba(255,255,255,0.30)', pen: '#ffffff' },
    blue: { fill: '#13284a', line: 'rgba(255,255,255,0.08)', line2: 'rgba(255,255,255,0.18)', pen: '#ffffff' },
    // 1.1.8：护眼系（对比度降下来）。纯黑/纯白投影一整节课太刺眼，这五个是「柔和」档：
    // 格线与墨色都按各自的亮度配好，自动换笔色（isDarkBg）照旧认 pen。
    sand: { fill: '#f3ede2', line: 'rgba(120,95,55,0.10)', line2: 'rgba(120,95,55,0.20)', pen: '#2a2620' },
    mint: { fill: '#e8efe6', line: 'rgba(50,90,60,0.09)', line2: 'rgba(50,90,60,0.18)', pen: '#1d2a20' },
    mist: { fill: '#e9eef5', line: 'rgba(45,70,100,0.09)', line2: 'rgba(45,70,100,0.18)', pen: '#1b2433' },
    // pen 必须是纯 #ffffff：GW.isDarkBg() 就是拿它判深浅（自动换白笔 / 图形反相都靠这个），
    // 写成 #f2f5fa 这类「接近白」会让深色主题被当成浅色。
    dusk: { fill: '#23272e', line: 'rgba(255,255,255,0.09)', line2: 'rgba(255,255,255,0.17)', pen: '#ffffff' },
    flint: { fill: '#2b3036', line: 'rgba(255,255,255,0.08)', line2: 'rgba(255,255,255,0.15)', pen: '#ffffff' },
    slate: { fill: '#383d44', line: 'rgba(255,255,255,0.07)', line2: 'rgba(255,255,255,0.14)', pen: '#ffffff' },
    clay: { fill: '#f0e6d6', line: 'rgba(120,90,50,0.11)', line2: 'rgba(120,90,50,0.21)', pen: '#2a2620' },
  };
  GW.BG = BG;

  // ---------- 1.6.2：画布风格（渐变纸）----------
  // 需求来自「唐波的物理白板」设置里的 10 种画布背景；这里保留它的配色脉络，
  // 每种再补一个同族变体（共 20 个），并按画布 API 重画：多层线性 + 径向柔光，
  // 全部在**屏幕空间**一次画满，不铺图、不拼接，所以不会有接缝。
  // stops: [[位置, 颜色]...]；blobs: [中心x, 中心y, 半径(相对长边), 颜色]
  const BG_STYLES = [
    { id: 's-tech', name: '科技深空', light: false, fill: '#0a1428', ang: 160,
      stops: [[0, '#060c18'], [0.45, '#0a1428'], [1, '#0b1020']],
      blobs: [[0.15, -0.10, 0.62, 'rgba(56,189,248,0.22)'], [0.90, 1.10, 0.60, 'rgba(129,140,248,0.20)']] },
    { id: 's-tech2', name: '深空靛蓝', light: false, fill: '#0b1230', ang: 150,
      stops: [[0, '#070a20'], [0.5, '#0c1234'], [1, '#080b1c']],
      blobs: [[0.18, -0.08, 0.60, 'rgba(99,102,241,0.24)'], [0.88, 1.08, 0.58, 'rgba(34,211,238,0.18)']] },

    { id: 's-nebula', name: '星云紫', light: false, fill: '#16102a', ang: 160,
      stops: [[0, '#120a24'], [0.5, '#1a1032'], [1, '#0d0820']],
      blobs: [[0.20, -0.10, 0.60, 'rgba(192,132,252,0.26)'], [0.90, 1.10, 0.58, 'rgba(56,189,248,0.18)']] },
    { id: 's-nebula2', name: '星云玫红', light: false, fill: '#241026', ang: 150,
      stops: [[0, '#1d0a1f'], [0.5, '#2a1030'], [1, '#15081c']],
      blobs: [[0.16, -0.10, 0.58, 'rgba(244,114,182,0.24)'], [0.92, 1.08, 0.56, 'rgba(168,85,247,0.20)']] },

    { id: 's-aurora', name: '极光青', light: false, fill: '#082a33', ang: 160,
      stops: [[0, '#041a20'], [0.5, '#062a33'], [1, '#04202a']],
      blobs: [[0.20, -0.10, 0.60, 'rgba(52,211,153,0.20)'], [0.90, 1.10, 0.58, 'rgba(56,189,248,0.22)']] },
    { id: 's-aurora2', name: '极光翠', light: false, fill: '#0a2c22', ang: 150,
      stops: [[0, '#041d16'], [0.5, '#0a2f24'], [1, '#051f18']],
      blobs: [[0.18, -0.10, 0.58, 'rgba(163,230,53,0.20)'], [0.92, 1.08, 0.56, 'rgba(45,212,191,0.22)']] },

    { id: 's-ocean', name: '深海蓝', light: false, fill: '#0c1e3a', ang: 160,
      stops: [[0, '#061428'], [0.5, '#0a1e3a'], [1, '#051228']],
      blobs: [[0.18, -0.10, 0.60, 'rgba(56,189,248,0.18)'], [0.90, 1.10, 0.58, 'rgba(30,80,180,0.26)']] },
    { id: 's-ocean2', name: '深海墨', light: false, fill: '#0a1a24', ang: 150,
      stops: [[0, '#050f18'], [0.5, '#0a1c28'], [1, '#04101a']],
      blobs: [[0.16, -0.10, 0.58, 'rgba(125,211,252,0.16)'], [0.92, 1.08, 0.56, 'rgba(14,116,144,0.26)']] },

    { id: 's-sunset', name: '暮光橙', light: false, fill: '#331410', ang: 160,
      stops: [[0, '#2a0e0a'], [0.5, '#3d1810'], [1, '#20080a']],
      blobs: [[0.15, -0.10, 0.60, 'rgba(251,146,60,0.24)'], [0.90, 1.10, 0.58, 'rgba(244,63,94,0.20)']] },
    { id: 's-sunset2', name: '暮光玫', light: false, fill: '#30101c', ang: 150,
      stops: [[0, '#280a14'], [0.5, '#38101f'], [1, '#1c060c']],
      blobs: [[0.18, -0.10, 0.58, 'rgba(251,113,133,0.24)'], [0.92, 1.08, 0.56, 'rgba(251,191,36,0.18)']] },

    { id: 's-forest', name: '松林绿', light: false, fill: '#0f2418', ang: 160,
      stops: [[0, '#0a1f14'], [0.5, '#13301f'], [1, '#071a10']],
      blobs: [[0.20, -0.10, 0.60, 'rgba(52,211,153,0.16)'], [0.90, 1.10, 0.58, 'rgba(34,197,94,0.18)']] },
    { id: 's-forest2', name: '松林青', light: false, fill: '#10281e', ang: 150,
      stops: [[0, '#0a1d15'], [0.5, '#132e24'], [1, '#08190f']],
      blobs: [[0.16, -0.10, 0.58, 'rgba(45,212,191,0.16)'], [0.92, 1.08, 0.56, 'rgba(74,222,128,0.18)']] },

    { id: 's-eye', name: '护眼绿', light: true, fill: '#cfe7d4', ang: 160,
      stops: [[0, '#d4ecd6'], [0.5, '#c7e6cd'], [1, '#bfe0c6']], blobs: [] },
    { id: 's-eye2', name: '护眼米', light: true, fill: '#e3ecd8', ang: 150,
      stops: [[0, '#eaf2df'], [0.5, '#e0ebd5'], [1, '#d6e3c9']],
      blobs: [[0.15, -0.10, 0.55, 'rgba(255,255,255,0.35)']] },

    { id: 's-paper', name: '纸感米白', light: true, fill: '#f7f3e8', ang: 160,
      stops: [[0, '#fdfbf4'], [0.5, '#f7f3e8'], [1, '#f1ead9']], blobs: [] },
    { id: 's-paper2', name: '纸感暖黄', light: true, fill: '#f8eeda', ang: 150,
      stops: [[0, '#fdf6e6'], [0.5, '#f8eeda'], [1, '#efe2c8']],
      blobs: [[0.85, 1.05, 0.55, 'rgba(255,214,150,0.22)']] },

    { id: 's-mist', name: '雾霾灰', light: true, fill: '#e8edf2', ang: 160,
      stops: [[0, '#eef1f5'], [0.5, '#e3e8ee'], [1, '#dae0e7']],
      blobs: [[0.15, -0.10, 0.58, 'rgba(148,163,184,0.25)'], [0.90, 1.10, 0.56, 'rgba(100,116,139,0.20)']] },
    { id: 's-mist2', name: '雾霾蓝', light: true, fill: '#e6edf6', ang: 150,
      stops: [[0, '#eef4fb'], [0.5, '#e2eaf4'], [1, '#d5dfec']],
      blobs: [[0.18, -0.10, 0.56, 'rgba(191,219,254,0.45)'], [0.92, 1.08, 0.54, 'rgba(147,197,253,0.30)']] },

    { id: 's-white', name: '纯白', light: true, fill: '#ffffff', ang: 160,
      stops: [[0, '#ffffff'], [1, '#f7fafd']], blobs: [] },
    { id: 's-white2', name: '珍珠白', light: true, fill: '#fbfcff', ang: 150,
      stops: [[0, '#ffffff'], [0.55, '#fafbff'], [1, '#f2f5fb']],
      blobs: [[0.18, -0.10, 0.55, 'rgba(226,232,240,0.55)']] },
  ];
  for (const st of BG_STYLES) {
    BG[st.id] = {
      fill: st.fill, pen: st.light ? '#1b2433' : '#ffffff',
      line: st.light ? 'rgba(40,60,90,0.10)' : 'rgba(255,255,255,0.10)',
      line2: st.light ? 'rgba(40,60,90,0.22)' : 'rgba(255,255,255,0.24)',
      style: st,
    };
  }
  GW.BG_STYLES = BG_STYLES;
  // 1.1.3：底色不再只认 5 个预设 id —— 用户在调色盘里选的自定义色（#rrggbb）也算一种主题，
  // 底纹线 / 自动换笔色都跟着亮度走。BG 里没有的 id 一律回落到白板。
  const lumOf = (hex) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 1;
    let s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  GW.bgTheme = (c) => {
    if (BG[c]) return BG[c];
    if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) {
      const dark = lumOf(c) < 0.42;
      return {
        fill: c,
        line: dark ? 'rgba(255,255,255,0.10)' : 'rgba(40,60,90,0.10)',
        line2: dark ? 'rgba(255,255,255,0.24)' : 'rgba(40,60,90,0.22)',
        pen: dark ? '#ffffff' : '#1b2433',
      };
    }
    return BG.white;
  };
  GW.isDarkBg = () => GW.bgTheme(GW.page().bg.color).pen === '#ffffff';

  // ---------- 1.5.3：自动反差墨色（显示层，不改数据）----------
  // 要解决的实况：黑板上用白笔讲了一整屏，切到白底做投影 / 导印，那一屏字直接看不见。
  // 判据用 WCAG 对比度 < 2.6:1（≈「基本认不出」），换算成当前底色的主墨色（BG[x].pen）。
  // 只碰「和底色几乎一样」的墨：红 / 蓝 / 绿这些有彩色在深浅底上都够对比，不会被改。
  // 结果按「底色 + 原色」缓存：写字的增量路径每段都要查一次，不能每次都解析颜色。
  const srgb = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const relLum = (c) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || ''));
    if (!m) return null;
    let s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return 0.2126 * srgb(parseInt(s.slice(0, 2), 16)) + 0.7152 * srgb(parseInt(s.slice(2, 4), 16)) + 0.0722 * srgb(parseInt(s.slice(4, 6), 16));
  };
  const inkFixCache = new Map();
  // 「已经换算过的颜色」按纸色分组记，避免换纸（进/出放映）后把上一张纸的产物当成已换算。
  const inkFixedBy = new Map();
  const hexParts = (c) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || ''));
    if (!m) return null;
    let s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const mixHex = (a, b, t) => {
    const A = hexParts(a), B = hexParts(b);
    if (!A || !B) return a;
    const h = (v) => { const s = Math.round(v).toString(16); return s.length < 2 ? '0' + s : s; };
    return '#' + h(A[0] + (B[0] - A[0]) * t) + h(A[1] + (B[1] - A[1]) * t) + h(A[2] + (B[2] - A[2]) * t);
  };
  // 2026-11（放映智能反差）：inkFix 的「纸色」平时取板书页的背景色，可放映 PPT 时
  // 真正压在墨迹底下的是**幻灯片这一页的背景**。不给覆盖入口的话，深色幻灯片上插入的
  // 图形/文字仍然是深墨（判据还认为"纸是白的"），整片看不清。
  // 覆盖值由 pptx 的 paintSlide 每页写入、closeSlide 清空；这里只留一个最薄的开关。
  let paperOverride = null;
  GW.setInkPaper = (c) => {
    const v = (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) ? c.toLowerCase() : null;
    if (v === paperOverride) return false;
    paperOverride = v;
    inkFixCache.clear();
    inkFixedBy.clear();
    // DOM 类对象（文本 / 公式）的颜色是在挂载时算一次的，纸色一变必须让它们重新算
    // 一次冲突色 —— 否则放映到深色幻灯片上，这些字还是黑字。
    if (GW.bus && GW.bus.emit) { try { GW.bus.emit('inkpaper', v); } catch (e) { /* 订阅方出错不影响配色 */ } }
    return true;
  };
  // 当前真正的「纸色」：放映期是幻灯片这一页的背景（paperOverride），平时是板书页背景。
  // 插入的实心图形（仪表盘、电阻体等）填底色时要跟它一致，否则深色幻灯片上会贴一块白片。
  GW.inkPaper = () => paperOverride || ((GW.page && GW.page()) ? GW.page().bg.color : null);
  GW.inkFix = (c) => {
    const S = GW.settings;
    if (S && S.autoContrastInk === false) return c;
    const page = GW.page && GW.page();
    const theme = GW.bgTheme(paperOverride || (page ? page.bg.color : null)) || BG.white;
    // 1.6.1：缓存改成「纸色 → 颜色」两级。以前每次都要拼一遍 fill|color 字符串，
    // 大板书整屏重画时每条笔迹每帧一次，纯属白烧 CPU（切颜色时也更容易掉帧）。
    let byColor = inkFixCache.get(theme.fill);
    if (!byColor) { if (inkFixCache.size > 48) inkFixCache.clear(); byColor = new Map(); inkFixCache.set(theme.fill, byColor); }
    const hit = byColor.get(c);
    if (hit) return hit;
    // 幂等：换算出来的颜色再进一次（图形库自己已经过 inkOf，外面又套了 runInkCtx）必须原样返回，
    // 否则「混一部分」会被叠算两次，物理图形比板书明显更暗。
    const fixed = inkFixedBy.get(theme.fill);
    if (fixed && fixed.has(c)) return c;
    const L1 = relLum(c), L2 = relLum(theme.fill);
    let out = c;
    if (L1 != null && L2 != null) {
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const pen = theme.pen || '#1b2433';
      // 1.6.1：以前「对比度 < 2.6 就整条换成纸色对应的墨色」。墨绿黑板上红色
      // （#e02020 对 #1f3b30 只有 2.42）会被整条换成白色 ⇒ 老师看到「换了红笔还在画白线」。
      // 现在只有几乎看不见（<1.5）才替换，其余只往墨色方向混一部分：颜色认得出来、又看得清。
      if (ratio < 1.5) out = pen;
      else if (ratio < 2.8) out = mixHex(c, pen, ((2.8 - ratio) / 1.3) * 0.7);
    }
    if (byColor.size > 240) byColor.clear();
    byColor.set(c, out);
    if (out !== c) {
      let fs = inkFixedBy.get(theme.fill);
      if (!fs) { if (inkFixedBy.size > 8) inkFixedBy.clear(); fs = new Set(); inkFixedBy.set(theme.fill, fs); }
      if (fs.size > 1024) fs.clear();
      fs.add(out);
    }
    return out;
  };

  // ---------- 背景材质（1.1.8）----------
  // 为什么不用图片：包要离线、4K 一体机上贴图会糊，而且每种底色都得有对应亮度的一张。
  // 这里按需生成 96×96 的平铺小图（暗/亮两套），画进模式缓存，切底纹/缩放都不重生成。
  // 1.6.2：dithering。8bit 画布的双色渐变一定有台阶，深色底上最明显（柔光一圈一圈、渐变一行一行）。
  // 铺一层 ±1 LSB 的噪点把台阶打碎：这是标准 dithering，不是"加颗粒效果"，正常距离看不出来。
  let ditherCv = null;
  function ditherTile() {
    if (ditherCv) return ditherCv;
    const N = 128, cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    let seed = 20261105;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < N * N; i++) {
      const o = i * 4, white = rnd() < 0.5;
      d[o] = d[o + 1] = d[o + 2] = white ? 255 : 0;
      d[o + 3] = white ? 10 : 7;
    }
    g.putImageData(img, 0, 0);
    ditherCv = cv;
    return cv;
  }
  function applyDither(ctx, w, h) {
    if (GW.__noDither) return;                 // 只给探针做反向对照用
    const pat = ctx.createPattern(ditherTile(), 'repeat');
    if (!pat) return;
    ctx.save();
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  // 渐变风格：底 = 一层线性（CSS 角度），上面叠几团径向柔光；全部屏幕空间一次画满，没有平铺接缝
  function paintBgStyle(ctx, w, h, st) {
    const rad = ((st.ang == null ? 160 : st.ang) * Math.PI) / 180;
    const ux = Math.sin(rad), uy = -Math.cos(rad);
    const cx = w / 2, cy = h / 2;
    const half = (Math.abs(ux) * w + Math.abs(uy) * h) / 2 || 1;
    const lg = ctx.createLinearGradient(cx - ux * half, cy - uy * half, cx + ux * half, cy + uy * half);
    for (const st1 of st.stops) lg.addColorStop(st1[0], st1[1]);
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);
    for (const b of (st.blobs || [])) {
      const bx = b[0] * w, by = b[1] * h, r = Math.max(w, h) * b[2];
      const col = String(b[3]);
      const zero = col.replace(/,\s*[\d.]+\)\s*$/, ',0)');
      const rg = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, zero);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
    applyDither(ctx, w, h);
  }

  const matCache = Object.create(null);
  function matTile(kind, dark) {
    const key = kind + (dark ? 'D' : 'L');
    if (matCache[key]) return matCache[key];
    const N = 96, cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const g = cv.getContext('2d');
    let seed = kind === 'grain' ? 1103 : kind === 'fiber' ? 2207 : 3301;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    if (kind === 'grain') {
      // 磨砂：细颗粒，暗底用浅颗粒、亮底用深颗粒，透明度很低，只为「不刺眼」
      for (let i = 0; i < 2600; i++) {
        const a = 0.02 + rnd() * 0.05;
        g.fillStyle = dark ? 'rgba(255,255,255,' + a + ')' : 'rgba(40,45,55,' + (a * 0.9) + ')';
        g.fillRect(rnd() * N | 0, rnd() * N | 0, 1, 1);
      }
    }
    matCache[key] = cv;
    return cv;
  }
  function paintMaterial(ctx, W, H, bg, th) {
    const m = bg.material;
    // 1.6.2：材质只保留 无/磨砂/柔光/渐变（纸纹、亚麻、云雾、粉笔灰看着脏，已删）。
    // 老板书里存着旧 id 时按「无」处理，不报错。
    if (!m || m === 'plain' || ['grain', 'glow', 'grad'].indexOf(m) < 0) return;
    const dark = th.pen === '#ffffff';
    if (m === 'glow') {
      // 柔光：中心 6% 提亮、四角轻微压暗 —— 把整屏的眩光收掉，白底尤其明显
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.12, W / 2, H / 2, Math.max(W, H) * 0.78);
      if (dark) { g.addColorStop(0, 'rgba(255,255,255,0.045)'); g.addColorStop(1, 'rgba(0,0,0,0.16)'); }
      else { g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(60,60,60,0.07)'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      applyDither(ctx, W, H);
      return;
    }
    if (m === 'grad') {
      // 上下渐变：顶部略提亮、底部略压暗，长时间看不刺眼（暗底反过来最上面稍亮）
      const lg = ctx.createLinearGradient(0, 0, 0, H);
      if (dark) { lg.addColorStop(0, 'rgba(255,255,255,0.055)'); lg.addColorStop(1, 'rgba(0,0,0,0.18)'); }
      else { lg.addColorStop(0, 'rgba(255,255,255,0.30)'); lg.addColorStop(1, 'rgba(70,70,70,0.06)'); }
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
      applyDither(ctx, W, H);
      return;
    }
    const tile = matTile(m, dark);
    const pat = ctx.createPattern(tile, 'repeat');
    if (!pat) return;
    ctx.save();
    ctx.globalAlpha = m === 'chalk' ? 0.9 : 1;
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 导出器要复用同一套渐变纸/材质（不然导出的 SVG/PDF 里渐变底会变成一块纯色）
  GW.paintBgStyle = paintBgStyle;
  GW.paintBgMaterial = paintMaterial;

  function drawBg(ctx, w, h, px, py) {
    const bg = GW.page().bg, th = GW.bgTheme(bg.color);
    // 位图坐标里的视图原点（含预渲染圈的偏移）
    const vx = view.tx + px, vy = view.ty + py;
    // 1.1.14 透明批注层：底色与材质一律不画（窗口本身是全屏透明的，画了就把桌面挡住），
    // 只画网格/横线/点阵/田字格 —— 老师要的正是「桌面上叠一层可选择的格线」。
    if (!GW.overlayMode) {
      if (th.style) paintBgStyle(ctx, w, h, th.style);
      else { ctx.fillStyle = th.fill; ctx.fillRect(0, 0, w, h); }
      paintMaterial(ctx, w, h, bg, th);
    } else {
      // 上一帧的底色必须擦掉：这一层只在参数变化时重画，不擦会把「开机时那层白纸」留在底下，
      // 桌面就透不过来了（探针 probe-overlay 反向对照量到过整屏 240000 个不透明像素）。
      ctx.clearRect(0, 0, w, h);
    }
    // 1.7.0（T14）：整页纸张版式（康奈尔 / 月计划 / 六线谱 / 点阵）。它和平铺底纹 pattern 是两套：
    // pattern 按屏幕换挡平铺（上面那段），纸张按**页面世界矩形**一次画完，所以必须在 pattern 的
    // 早退（pattern==='none' 也会 return）之前画。没有页面矩形就静默跳过 —— 无限画布上没有「整张纸」。
    // noClear：底色与平铺纹已经画好，这里只叠线，不许把底色抠穿（否则全屏透明层会透出桌面）。
    const pg0 = GW.page();
    // 2.0.7（R5）：纸张画不画，判据从「全局 layout」改成 pageBox（页面自己的有限标记）——
    // 换机 / 网页端 / 手动切回无限画布后，模板页仍然是模板页，纸样不会凭空消失。
    const paperBox = pg0 && pg0.paper ? pagedBox(pg0) : null;
    if (pg0 && pg0.paper && paperBox && GW.paperDraw) {
      // 1.7.5：纸张（横线纸/康奈尔/六线谱…）必须**贴在纸框里**画。
      // 2.0.7（R7）：矩阵统一走 pageMatrix()（含 dpr 与页面旋转），不再各写一套。
      ctx.save();
      pageMatrix(ctx, px, py);
      ctx.beginPath();
      ctx.rect(paperBox.x, paperBox.y, paperBox.w, paperBox.h);
      ctx.clip();
      try {
        GW.paperDraw(ctx, pg0.paper, { l: paperBox.x, t: paperBox.y, w: paperBox.w, h: paperBox.h },
          { noClear: true, cfg: pg0.paperCfg || null });
      } catch (e) { /* 纸张画坏不许影响主画布 */ }
      ctx.restore();
    }
    const pat = bg.pattern;
    // 1.7.5：分页版式下底纹只画在纸里 —— 不裁的话格线会随画布平移缩放铺满全屏、跑出 A4 区域。
    const pbox = pagedBox();
    const pdx = pbox ? vx + pbox.x * view.s : 0;
    const pdy = pbox ? vy + pbox.y * view.s : 0;
    const pdw = pbox ? pbox.w * view.s : 0;
    const pdh = pbox ? pbox.h * view.s : 0;
    if (pbox) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(pdx, pdy, pdw, pdh);
      ctx.clip();
    }
    if (pat === 'none') { if (pbox) ctx.restore(); return; }
    // 世界坐标中的格距；缩放时自动换挡，保持屏幕上 15~75px
    let g = pat === 'lines' ? 48 : 40;
    let sg = g * view.s;
    while (sg < 15) { g *= 5; sg *= 5; }
    while (sg > 90) { g /= 5; sg /= 5; }
    const ox = ((vx % sg) + sg) % sg, oy = ((vy % sg) + sg) % sg;
    // 1.1.14 透明批注层：格线要压在**任意**桌面上都看得见，所以同一组线描两遍 ——
    // 先浅色宽光晕、再深色细线。白底 PPT 上看到深色线，黑底视频/深色软件上看到光晕，
    // 老师不用为了格线去换背景色。普通窗口仍按主题色描一遍（与改前完全一致）。
    const paintPat = (C) => {
      ctx.lineWidth = C.w;
      if (pat === 'grid' || pat === 'coord') {
        ctx.strokeStyle = C.line; ctx.beginPath();
        for (let x = ox; x < w; x += sg) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
        for (let y = oy; y < h; y += sg) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
        ctx.stroke();
        if (pat === 'coord') {
          // 每 5 格一条粗线 + 原点坐标轴
          const big = sg * 5, bx = ((vx % big) + big) % big, by = ((vy % big) + big) % big;
          ctx.strokeStyle = C.line2; ctx.lineWidth = C.w * 1.5; ctx.beginPath();
          for (let x = bx; x < w; x += big) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
          for (let y = by; y < h; y += big) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
          ctx.stroke();
          ctx.strokeStyle = C.pen; ctx.globalAlpha = 0.55; ctx.lineWidth = C.w * 1.5; ctx.beginPath();
          ctx.moveTo(0, vy); ctx.lineTo(w, vy); ctx.moveTo(vx, 0); ctx.lineTo(vx, h); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else if (pat === 'dots') {
        ctx.fillStyle = C.line2;
        const r = Math.max(1, Math.min(2.2, sg / 22)) + (C.w > 1 ? 1.2 : 0);
        for (let x = ox; x < w; x += sg) for (let y = oy; y < h; y += sg) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
      } else if (pat === 'lines') {
        ctx.strokeStyle = C.line2; ctx.beginPath();
        for (let y = oy; y < h; y += sg) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
        ctx.stroke();
      } else if (pat === 'tian') {
        // 田字格（写字教学），每格 2×2 虚线分割
        const cell = sg * 2, cx = ((vx % cell) + cell) % cell, cy = ((vy % cell) + cell) % cell;
        ctx.strokeStyle = C.line2; ctx.beginPath();
        for (let x = cx; x < w; x += cell) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = cy; y < h; y += cell) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();
        ctx.setLineDash([4, 4]); ctx.strokeStyle = C.line; ctx.beginPath();
        for (let x = cx + sg; x < w + cell; x += cell) { ctx.moveTo(x - cell, 0); ctx.lineTo(x - cell, h); ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = cy + sg; y < h + cell; y += cell) { ctx.moveTo(0, y - cell); ctx.lineTo(w, y - cell); ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke(); ctx.setLineDash([]);
      }
    };
    if (GW.overlayMode) {
      paintPat({ line: 'rgba(255,255,255,0.85)', line2: 'rgba(255,255,255,0.9)', pen: 'rgba(255,255,255,0.95)', w: 3.2 });
      paintPat({ line: 'rgba(35,55,85,0.5)', line2: 'rgba(35,55,85,0.55)', pen: 'rgba(35,55,85,0.6)', w: 1 });
    } else {
      paintPat({ line: th.line, line2: th.line2, pen: th.pen, w: 1 });
    }
    if (pbox) ctx.restore();
    // 纸外压一层淡淡的「桌面灰」：A4 边界一眼能看出来，格线也不会再铺到纸外。
    if (pbox && !GW.overlayMode) {
      ctx.save();
      ctx.fillStyle = 'rgba(96,110,128,0.10)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.rect(pdx, pdy, pdw, pdh);
      ctx.fill('evenodd');
      ctx.restore();
    }
  }

  // ---------- 渲染循环 ----------
  // 教室红外大屏（4K / 集显，甚至软件渲染）上的性能要点：
  //  · 平移 / 缩放先走「合成快速通道」：只改 CSS 变换，完全不重画画布，停手后再精修一帧；
  //  · 墨迹层像素比由性能档位与视觉缩放共同决定（GW.perf.inkDpr），兼容档直接砍掉一半以上像素；
  //  · 背景只在颜色 / 底纹 / 缩放 / 尺寸变化时重画一次，其余时候不碰背景画布；
  //  · 进行中的钢笔笔迹直接增量画到墨迹层（每帧只画新增的一小段），实时层不再整屏清除；
  //  · 橡皮、选区拖动等局部改动只重画受影响的矩形（GW.renderPartial），成本与改动范围成正比；
  //  · 实时层只在真有实时内容（激光、荧光笔、套索…）时才清，且只清上一帧占用的范围；
  //  · 兼容档下拖动期间把 DOM 对象层（iframe / 视频 / 仿真）移出合成，停手 200ms 后再画回来。
  let bgCv, inkCv, annCv, liveCv, bgCtx, inkCtx, annCtx, liveCtx, dpr = 0, W = 0, H = 0, needRender = true;
  // 预渲染圈：四层位图都比视口大 PADX/PADY（CSS 像素），位图左上角也相应往左上挪同样多，
  // 于是「位图坐标 = 世界*view.s + view.tx + PAD」恒成立。拖动 / 缩放走合成快速通道时，
  // 这一圈就是缓冲 —— 缓冲滑出之前屏幕上一直是画好的内容，不会露出没画过的边沿。
  let PADX = 0, PADY = 0, WD = 0, HD = 0;
  const liveDrawers = new Set(); // 实时层绘制函数（荧光笔、激光笔、套索、选区高亮等）
  // 1.3.0（R4a）：持久型实时绘制者（远端 ghost 笔迹）—— 自己管像素、只画新增段，
  // 没有普通 mark 时不被自动整层清除（否则增量就白做了）。
  const livePersist = new Set();
  // 1.3.0（R4a）：远端 ghost 笔迹自己管像素（只画新增段），需要主动清掉自己占过的区域时
  // 由它把世界矩形登记到这里；下一帧与普通 mark 一起并进清除范围（但那块不重画）。
  const liveClearReq = [];
  GW.liveClearRect = (x1, y1, x2, y2) => { liveClearReq.push([x1, y1, x2, y2]); requestLive(); };
  GW.live = {
    add(fn) { liveDrawers.add(fn); requestLive(); return () => { liveDrawers.delete(fn); requestLive(); }; },
    persist(fn) { livePersist.add(fn); requestLive(); return () => { livePersist.delete(fn); requestLive(); }; },
  };
  let needLive = false, scheduled = false;
  let partial = null;            // 待局部重画的世界坐标矩形
  let liveDirty = null;          // 实时层上一帧占用的矩形（设备像素）
  let liveFull = true;           // 下一次需要整屏清实时层
  let fastPending = false;       // 视图已变但画布还没重画（只做了合成变换）
  let cleanTimer = 0;
  let bgKey = '';                // 背景画布当前内容对应的关键参数
  let annActive = false;         // 标注层上当前是否真有东西（没有就跳过整屏清除，拖动时省一次全屏 clear）
  const renderView = { tx: NaN, ty: NaN, s: NaN };  // 画布内容对应的视图

  function requestRender() { needRender = true; partial = null; schedule(); }
  function requestLive() { needLive = true; requestFrame(); }
  GW.requestRender = requestRender;
  GW.requestLive = requestLive;
  function schedule() { if (!scheduled) { scheduled = true; requestFrame(); } }
  // 统一走性能层的帧调度：一处 requestAnimationFrame，避免多处排队把一帧拆成好几帧
  function requestFrame() { GW.perf ? GW.perf.frame(frame) : (!scheduled && (scheduled = true, requestAnimationFrame(frame))); }

  // 局部重画：只清除并与矩形相交的笔迹（橡皮、选区拖动用）
  function renderPartial(x1, y1, x2, y2) {
    if (!inkCtx) return;
    // 2.0.7（A6）：局部重画的矩形是设备像素，按未旋转的相机算；旋转页整幅重画更省心也更准。
    if (pageRot()) { needRender = true; schedule(); return; }
    partial = partial
      ? { x1: Math.min(partial.x1, x1), y1: Math.min(partial.y1, y1), x2: Math.max(partial.x2, x2), y2: Math.max(partial.y2, y2) }
      : { x1, y1, x2, y2 };
    schedule();
  }
  GW.renderPartial = renderPartial;

  // ---------- 视图快速通道 ----------
  function setGeoTransform() {
    const g = document.getElementById('geo-layer');
    if (g) g.style.transform = `translate(${view.tx}px,${view.ty}px) scale(${view.s})`;
  }
  const viewSynced = () => Number.isFinite(renderView.s) && renderView.tx === view.tx && renderView.ty === view.ty && renderView.s === view.s;
  // 快速通道的 CSS 变换。位图比视口大 PAD，且元素本身以 (-PAD,-PAD) 摆放：
  //   屏幕 = -PAD + k*位图坐标 + t，  位图坐标 = 世界*renderS + renderTx + PAD
  // 两式联立要让它等于 世界*viewS + viewTx，解出 t = viewTx - k*renderTx + PAD*(1-k)。
  // 纯平移（k=1）时 PAD 那项自动消失，与改前完全一致。
  function fastGeom(v, r) {
    const vv = v || view, rr = r || renderView;
    const k = vv.s / rr.s;
    return { k, tx: vv.tx - k * rr.tx + PADX * (1 - k), ty: vv.ty - k * rr.ty + PADY * (1 - k) };
  }
  // 当前视口是否仍然整块落在已画好的位图（还留 slack 像素余量）里面。
  // 滑动超出这一圈缓冲时就不能再只改 CSS 变换了，否则边沿会露白。
  function fastCovers(slack) {
    if (!Number.isFinite(renderView.s) || renderView.s <= 0 || !WD || !HD) return false;
    const g = fastGeom(), s = slack || 0;
    const b0x = (PADX - g.tx) / g.k, b1x = (W + PADX - g.tx) / g.k;
    const b0y = (PADY - g.ty) / g.k, b1y = (H + PADY - g.ty) / g.k;
    return b0x >= s && b0y >= s && b1x <= WD - s && b1y <= HD - s;
  }
  // 1.7.0（T04）：对象层（#world —— 所有 DOM 对象、文本框、便签都在里面）与画布四层共用同一套相机变换。
  // 顺带把「文本格式条」重新贴到编辑框上方：它是 body 下的固定定位元素，相机一平移/缩放它就留在原地飘走。
  // NoteApp 的文字浮层也是每次读引擎矩阵重摆（transform 直接由线性内存里的 6 元矩阵算出来），道理一样。
  function syncWorldDom() {
    // 2.0.7（A6）：页面旋转要带上 DOM 对象层 —— 只转画布不转对象，旋转后文字/表格会原地不动。
    // 绕纸框中心转（先平移到中心、旋转、再移回），与 pageMatrix 的写法逐项对应。
    const a = pageRot();
    const rot = a ? (() => { const c = pagePivot(); return ` translate(${c.x}px,${c.y}px) rotate(${a}deg) translate(${-c.x}px,${-c.y}px)`; })() : '';
    if (GW.worldEl) GW.worldEl.style.transform = `translate(${view.tx}px,${view.ty}px) scale(${view.s})${rot}`;
    if (GW.txtBarPlace) GW.txtBarPlace();
  }
  function applyFastView() {
    const g = fastGeom();
    const k = g.k, tx = g.tx, ty = g.ty;
    const t = `translate(${tx}px,${ty}px) scale(${k})`;
    bgCv.style.transform = t;
    inkCv.style.transform = t;
    annCv.style.transform = t;       // 标注层与墨迹层必须始终同一套变换，否则圆心/半径会跟圆分开
    liveCv.style.transform = t;      // 实时层也一起变换，四层始终对齐
    syncWorldDom();
    setGeoTransform();
    GW.bus.emit('rendered');
  }
  // setView 之后调用：能走快速通道就走，走不了就老老实实重画
  GW.viewChanged = function () {
    // 2.0.7（A6）：页面旋转时合成快速通道不成立 —— 位图里的旋转是绕纸框中心做的，
    // 而 CSS 只做「平移 + 缩放」，两者叠加会以画布原点为轴心二次旋转。旋转页直接整幅重画，
    // 代价只在 rot≠0 的页面上（老师上课绝大多数页不旋转）。
    if (pageRot()) { document.body.classList.remove('pan-quiet'); requestRender(); return; }
    // 正在起笔 / 落笔时不要隐藏对象层，否则笔一压上屏幕对象就闪一下
    if (!needRender && !partial && !GW.inking && Number.isFinite(renderView.s)) {
      // 预渲染的那一圈快滑出位图了：这一帧改走整幅重画，把视口重新摆回位图中间。
      // 否则持续拖远（超过一圈缓冲）屏幕边沿就会露出没画过的空白。
      if (!fastCovers(Math.min(PADX, PADY) * 0.15)) {
        document.body.classList.remove('pan-quiet');
        requestRender();
        return;
      }
      fastPending = true;
      schedule();
      // 拖动画布对象层（iframe / 视频 / 仿真）在弱机上很贵，停手之后再放回画面
      if (GW.perf && GW.perf.hideWorldOnPan && GW.worldEl && !document.body.classList.contains('pan-quiet')) {
        document.body.classList.add('pan-quiet');
      }
      clearTimeout(cleanTimer);
      cleanTimer = setTimeout(() => {
        cleanTimer = 0;
        document.body.classList.remove('pan-quiet');
        requestRender();
      }, (GW.perf && GW.perf.fullCleanMs) || 140);   // 停手后精修一帧
    } else {
      document.body.classList.remove('pan-quiet');
      requestRender();
    }
  };
  // 需要按当前视图做像素级操作之前（例如开始增量画一笔）先把快速通道落地
  GW.flushView = function () {
    if (!fastPending) return;
    clearTimeout(cleanTimer); cleanTimer = 0;
    document.body.classList.remove('pan-quiet');
    fastPending = false;
    renderAll();
  };
  GW.viewIsFast = () => fastPending;

  function clearDevFull() { liveCtx.setTransform(1, 0, 0, 1, 0, 0); liveCtx.clearRect(0, 0, liveCv.width, liveCv.height); }
  // 实时层是一整块**满屏**画布，留着就要每帧多合成一整屏。
  // 普通钢笔 / 毛笔书写根本不注册实时层绘制者（增量笔迹直接落在墨迹层），
  // 这时把它整块撤出合成：8K 软件渲染下实测 拖动 31→45fps、书写 30→59fps，
  // 最长帧 85ms→22ms。只在状态真正变化时才改样式，避免反复触发重排。
  let liveShown = false;           // 与 initBoard 里的初始 display:none 保持一致
  function setLiveShown(on) {
    if (!liveCv || liveShown === on) return;
    liveShown = on;
    liveCv.style.display = on ? '' : 'none';
  }
  // 1.3.0（R4a）：协同会话期间实时层**常驻**。
  // 以前每帧 setLiveShown(!!liveDirty)，远端每条 ghost 起落（收笔 / 400ms sweep / 7s 超时）
  // 都会切一次满屏合成层的 display —— 远端连写时就是一阵阵顿挫与撕裂（成本记在下面注释里）。
  // 改成「远端一有过程内容就粘住，直到断开」：整节课只在第一次远端落笔时切一次。
  let liveSticky = false;
  GW.setLiveSticky = (on) => {
    on = !!on;
    if (liveSticky === on) return;
    liveSticky = on;
    setLiveShown(on || !!liveDirty);
    if (on) requestLive();
  };
  function clearDevRect(r) {
    liveCtx.setTransform(1, 0, 0, 1, 0, 0);
    liveCtx.clearRect(r.x, r.y, r.w, r.h);
  }
  function liveRectOf(marks, lv) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const [a, b, c, d] of marks) { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); }
    if (x1 === Infinity) return null;
    const pad = 6;
    const dx = Math.floor((x1 * lv.s + lv.tx + PADX - pad) * dpr), dy = Math.floor((y1 * lv.s + lv.ty + PADY - pad) * dpr);
    const ex = Math.ceil((x2 * lv.s + lv.tx + PADX + pad) * dpr), ey = Math.ceil((y2 * lv.s + lv.ty + PADY + pad) * dpr);
    const cx = Math.max(0, dx), cy = Math.max(0, dy);
    return { x: cx, y: cy, w: Math.min(liveCv.width, ex) - cx, h: Math.min(liveCv.height, ey) - cy };
  }

  // 背景缓存：关键参数没变就一帧都不重画
  function paintBgIfNeeded() {
    const bg = GW.page().bg;
    // 桌面画布（page.desk）：背景换成实时桌面画面，其余图层与工具照旧
    const desk = GW.desk && GW.desk.active() ? GW.desk : null;
    // 预渲染圈里的格线要接着视口里的格线画 —— 相位按「含偏移的视图原点」算
    const gs = 40 * view.s;
    const ox = (((view.tx + PADX) % gs) + gs) % gs;
    const oy = (((view.ty + PADY) % gs) + gs) % gs;
    const key = desk
      ? `desk|${GW.desk.tick()}|${WD}x${HD}|${dpr}`
      // 2.0.7（R3）：换纸样必须当帧重绘 —— 旧键不含 page.paper，换纸后 key 不变，背景层直接早退，
      // 画面要等下一次平移/缩放才刷新。rot 同理（A6 旋转也是页面级属性）。
      : `${bg.color}|${bg.pattern}|${bg.material || 'plain'}|${WD}x${HD}|${dpr}|${view.s.toFixed(4)}|${ox.toFixed(2)},${oy.toFixed(2)}|${pageKey()}`
        + `|pp:${(GW.page() || {}).paper || ''}|pr:${pageRot()}|pc:${JSON.stringify((GW.page() || {}).paperCfg || null)}`;
    if (key === bgKey) return;
    bgKey = key;
    const stage = document.getElementById('stage');
    if (desk) {
      // 桌面画面是**屏幕空间**的：只铺视口那一块，预渲染圈留底色（否则桌面会被裁歪）
      if (stage) stage.style.background = '#0b0f14';
      bgCtx.setTransform(1, 0, 0, 1, 0, 0);
      bgCtx.fillStyle = '#0b0f14'; bgCtx.fillRect(0, 0, bgCv.width, bgCv.height);
      bgCtx.setTransform(dpr, 0, 0, dpr, dpr * PADX, dpr * PADY);
      GW.desk.paintBg(bgCtx, W, H);
      return;
    }
    // 平移时露出的边沿也是同色；透明批注层例外 —— 这里的「边沿」就是桌面本身
    if (stage) stage.style.background = GW.overlayMode ? 'transparent' : GW.bgTheme(bg.color).fill;
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBg(bgCtx, WD, HD, PADX, PADY);
  }
  // 只重画背景层（桌面画布每帧走这里，不动墨迹层，避免整屏重画拖慢书写）
  GW.repaintBg = function () { bgKey = ''; paintBgIfNeeded(); };

  // 渲染用的世界矩形：视口再往外各扩一圈预渲染区（PAD），圈里的笔迹也一起画上
  function renderRect() {
    const vr = GW.viewRect();
    if (!PADX && !PADY) return vr;
    const sx = PADX / view.s, sy = PADY / view.s;
    return { x: vr.x - sx, y: vr.y - sy, w: vr.w + sx * 2, h: vr.h + sy * 2 };
  }

  function renderAll() {
    const _pt0 = GW.settings && GW.settings.debugPerf ? performance.now() : 0;
    paintBgIfNeeded();
    // 三层必须一起复位：合成期三层共用同一个 CSS 变换（applyFastView），整幅重画时
    // 内容是按当前 view 直接落在设备像素上的，少复位哪一层，那一层就会被变换叠第二次
    //（实时层漏复位 = 只有选区高亮/套索/激光/荧光笔/橡皮光圈这些实时绘制的位置跑偏）。
    bgCv.style.transform = '';
    inkCv.style.transform = '';
    annCv.style.transform = '';
    liveCv.style.transform = '';
    inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    inkCtx.clearRect(0, 0, inkCv.width, inkCv.height);
    renderInk(renderRect(), null);
    renderAnn();
    renderView.tx = view.tx; renderView.ty = view.ty; renderView.s = view.s;
    syncWorldDom();
    setGeoTransform();
    liveFull = true;
    GW.bus.emit('rendered');
    if (liveDrawers.size || livePersist.size) needLive = true;
    if (_pt0) markPerf('renderAll', _pt0);
  }
  // 把与 rect 相交的笔迹画到墨迹层（rect 为空 = 整屏全画）
  function renderInk(vr, rect) {
    const hidden = GW.hiddenIds;
    pageMatrix(inkCtx, PADX, PADY);
    // 2.0.8：墨迹层不再按纸框裁剪、也不再「中心在纸外就整条跳过」。
    // 纸框现在只管纸张/底纹/纸框本身的画笔范围（见 drawBg），写在哪就画在哪 ——
    // 与无限画布完全同一条渲染路径（少一次 clip 也顺带省掉每次整幅重画的裁剪开销）。
    for (const it of GW.page().ink) {
      if (hidden && hidden.has(it.id)) continue;
      if (GW.space && GW.space.hideInkItem && GW.space.hideInkItem(it)) continue;
      const b = bbox(it);
      if (rect) { if (b.x > rect.x2 || b.y > rect.y2 || b.x + b.w < rect.x1 || b.y + b.h < rect.y1) continue; }
      else if (b.x > vr.x + vr.w || b.y > vr.y + vr.h || b.x + b.w < vr.x || b.y + b.h < vr.y) continue;
      drawItem(inkCtx, it, { ann: false });
    }
  }
  // ---------------- 1.6.8（R8/R9）：分页版式与页边距 ----------------
  // A4 @96dpi。纸框只存在 page.box 里（可选字段），旧档没有就当无限画布。
  const A4W = 794, A4H = 1123;
  // A3（1.7.6 修复）：纸框按「传入的目标页」算，不再隐含取当前页。
  // 不传时等价于旧行为（当前页），export.js / pageKey() 等旧调用方无需改动。
  // 2.0.7（R5）：判据从「全局 layout」改成「页面自己的 paged 标记 OR 全局 paged」。
  // 全局 layout 存在 localStorage（storage.js:51），不随 .gewu 走：换机/网页端/手动切回
  // 无限画布后，模板页会退化成无限白页 —— 纸样与纸框都不画了（2.0.8 起纸框只管显示/导出，
  // 不再有「纸外禁写/裁笔」这层语义，见下面的 2.0.8 段）。
  // 老存档没有 paged 字段（读盘兜底 false），但「有 paper 或有 box」的页按模板页迁移成 true。
  function pagedBox(page) {
    const p = page || GW.page();
    const b = p && p.box;
    if (!b || !(b.w > 0)) return null;
    if (p.paged) return b;
    if (GW.settings && GW.settings.layout === 'paged') return b;
    return null;
  }
  GW.pageBox = pagedBox;
  // 背景缓存键要用它：切版式/换页框时纸框变了，底纹必须重画
  function pageKey() {
    const b = pagedBox();
    return b ? 'pg:' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ',' + b.w.toFixed(1) + ',' + b.h.toFixed(1) : 'inf';
  }
  // ---------------- 2.0.8：纸框只画纸，不再当书写边界 ----------------
  // 1.7.5 起「有限页面」把 page.box 同时当成了**书写 / 插入 / 显示的边界**：
  //   纸外起笔 → 整笔作废（数据都不进模型，且没有任何提示）；
  //   跨纸边一笔 → Liang–Barsky 切成多条，撤销要按段撤、笔锋在切口断开；
  //   中心在纸外的对象 → visibility:hidden + clip-path，看不见也点不到。
  // 于是一支笔在同一块屏幕上有两种手感：无限画布上到处能写，整页模板页上写到纸边就断、
  // 写到纸外就"丢笔"。2.0.7 的 R1 已经为底纹开过一条口子（底纹族干脆不进 paged），
  // 但整页模板页仍在这层约束里 —— 这就是「两种模式书写体验差距巨大」的根。
  // 2.0.8 把这层约束整个拆掉：page.box 只决定「纸张 / 底纹 / 纸框画在哪、整页可见、逐页导出」，
  // 书写、插入、显示、命中、擦除一律与无限画布走同一条代码路径。
  // 三个旧 API 一律保留（addItemsOn / physics-batch / 探针都在调），语义退化成「放行」。
  GW.pageAllows = function () { return true; };
  // 给 DOM 对象层用的纸框：null = 不裁（objects.js 的 pageClip 据此清掉 clip-path）
  GW.pageClipFor = function () { return null; };
  GW.pageClipItems = function (it) { return it ? [it] : []; };
  GW.pageClipItem = function (it) { return it || null; };
  // 2.0.7（R6）：给「已有内容的页」套纸时，纸框取「A4 与内容包围盒的并集」再按 A4 比例外扩。
  // 旧写法固定 A4 居中，跨屏写过的笔迹有一半落在框外（2.0.7 时 renderInk 会跳过框外条目）。
  // 走 A 方案（只改纸框，不改渲染语义）：数据一条不动，框自己长大到装得下。
  GW.ensurePageBox = function (p) {
    p = p || GW.page();
    if (p.box && p.box.w > 0) return p.box;
    const c = contentBounds(p);
    let cx, cy, w = A4W, h = A4H;
    if (c) {
      cx = c.x + c.w / 2; cy = c.y + c.h / 2;
      const l = Math.min(cx - A4W / 2, c.x), r = Math.max(cx + A4W / 2, c.x + c.w);
      const t = Math.min(cy - A4H / 2, c.y), b = Math.max(cy + A4H / 2, c.y + c.h);
      const k = Math.max(1, (r - l) / A4W, (b - t) / A4H);   // 保持 A4 比例，只放大不缩小
      w = A4W * k; h = A4H * k;
      cx = (l + r) / 2; cy = (t + b) / 2;
      if (k > 1.001) p._legacyInk = true;                    // 供面板提示「已按内容扩展纸框」
    } else {
      const vp = GW.viewSize();
      cx = (vp.w / 2 - view.tx) / view.s; cy = (vp.h / 2 - view.ty) / view.s;
    }
    p.box = { x: cx - w / 2, y: cy - h / 2, w, h };
    return p.box;
  };
  // 1.7.5：把「有限页面」这套动作收成一个入口 —— 套整页模板 / 套纸张 / 套版式都走它。
  // fit=true 时顺手缩放到整页可见（GoodNotes 那样的手感）。
  GW.fitPage = function () {
    const b = GW.pageBox();
    if (!b) return;
    const vp = GW.viewSize();
    const s = Math.max(0.1, Math.min(4, Math.min(vp.w / b.w, vp.h / b.h) * 0.92));
    GW.setView(vp.w / 2 - (b.x + b.w / 2) * s, vp.h / 2 - (b.y + b.h / 2) * s, s);
  };
  GW.enterPaged = function (fit) {
    if (GW.settings) {
      GW.settings.layout = 'paged';
      const p = GW.page();
      GW.ensurePageBox(p);
      // 2.0.7（R5）：有限性是**这一页**的属性，跟着 .gewu 走，不跟着 localStorage 走。
      if (p) { p.paged = true; if (GW.markDirty) GW.markDirty(); }
      // 2.0.8：不再改写 settings.canvasMode。缩放锁由 GW.zoomLock() 自己看「这一页有没有纸框」
      // 自动放过（fitPage 要能缩到整页可见），离开纸张页后老师的 100% 锁原样回来。
      if (GW.saveSettings) GW.saveSettings();
    }
    if (GW.syncPagedObjects) GW.syncPagedObjects();
    if (fit) GW.fitPage();
    requestRender();
    if (GW.requestLive) GW.requestLive();
    return GW.pageBox();
  };
  GW.setLayout = function (mode) {
    const s = GW.settings;
    const p = GW.page();
    s.layout = mode === 'paged' ? 'paged' : 'infinite';
    // 2.0.8：开关必须是**双向**的。以前切回无限画布只改全局，页面自己的 paged 还留着，
    // pagedBox() 于是继续返回纸框 —— 菜单提示「已切回无限画布」，画面一动没动（纸还裁着）。
    // 现在：切分页 → 这一页补纸框并标 paged；切无限 → 清掉这一页的 paged（纸框数据保留，
    // 再切回来还是原来那张纸），纸外内容立刻恢复显示。
    if (p) {
      if (s.layout === 'paged') {
        GW.ensurePageBox(p);
        if (!p.paged) { p.paged = true; if (GW.markDirty) GW.markDirty(); }
      } else if (p.paged) {
        p.paged = false;
        if (GW.markDirty) GW.markDirty();   // 只有真的变了才标脏，反复切不刷「未保存」
      }
    }
    // DOM 对象与墨迹分属两套渲染，切换后各自要跟着刷新
    syncPagedObjects();
    requestRender(); requestLive();
    if (GW.saveSettings) GW.saveSettings();
    return s.layout;
  };
  // 纸张页的 DOM 对象：2.0.8 起不再按纸框隐藏/裁剪（与无限画布一致，纸外对象照常显示可点）。
  // 这个函数保留是因为「切版式 / 换页 / 套模板」三条路径都在调它 —— 现在只负责清掉旧版本
  // 留在元素上的 visibility / clip-path，保证老存档切换到本版后不会再被旧样式卡住。
  function syncPagedObjects() {
    const p = GW.page();
    if (!p || !p.objs || !GW.objects || !GW.objects.el) return;
    for (const o of p.objs) {
      const el = GW.objects.el(o);
      if (!el) continue;
      if (el.style.visibility) el.style.visibility = '';
      if (GW.objects.pageClip) GW.objects.pageClip(o, el);
    }
  }
  GW.syncPagedObjects = syncPagedObjects;
  // 纸框与页边距参考线画在标注层（每次整幅重画都会重来一遍，与底纹缓存无关）。
  function drawPageFrame() {
    const box = pagedBox();
    if (!box) return;
    const x = annCtx;
    pageMatrix(x, PADX, PADY);       // 2.0.7（R7）：与纸张/墨迹同一个矩阵
    x.save();
    x.strokeStyle = 'rgba(60,72,88,.55)';
    x.lineWidth = 1.2 / view.s;
    x.setLineDash([]);
    x.strokeRect(box.x, box.y, box.w, box.h);
    // R9：页边距 / 装订线
    const m = GW.page().margin;
    if (m && (m.l || m.r || m.t || m.b)) {
      x.strokeStyle = 'rgba(228,87,46,.55)';
      x.setLineDash([6 / view.s, 5 / view.s]);
      x.beginPath();
      if (m.l) { x.moveTo(box.x + m.l, box.y); x.lineTo(box.x + m.l, box.y + box.h); }
      if (m.r) { x.moveTo(box.x + box.w - m.r, box.y); x.lineTo(box.x + box.w - m.r, box.y + box.h); }
      if (m.t) { x.moveTo(box.x, box.y + m.t); x.lineTo(box.x + box.w, box.y + m.t); }
      if (m.b) { x.moveTo(box.x, box.y + box.h - m.b); x.lineTo(box.x + box.w, box.y + box.h - m.b); }
      x.stroke();
    }
    x.restore();
  }
  GW.drawPageFrame = drawPageFrame;
  // 圆弧标注单独一层：只画 ann，不画弧本身。局部重画（橡皮、拖动）时整层重来 —— 
  // 标注数量很少，比在墨迹层里做局部擦除安全（擦掉一半的「O」比多画一次更难看）。
  function renderAnn() {
    if (!annCtx) return;
    let has = false;
    for (const it of GW.page().ink) if (it.ann) { has = true; break; }
    if (pagedBox()) has = true;              // 1.6.8：纸框也要画在这里，所以算「有内容」
    if (!has && !annActive) return;          // 没有圆弧标注：连 clearRect 都不做
    annCtx.setTransform(1, 0, 0, 1, 0, 0);
    annCtx.clearRect(0, 0, annCv.width, annCv.height);
    annActive = has;
    if (!has) return;
    const hidden = GW.hiddenIds;
    const vr = renderRect();
    annCtx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * (view.tx + PADX), dpr * (view.ty + PADY));
    for (const it of GW.page().ink) {
      if (!it.ann) continue;
      if (hidden && hidden.has(it.id)) continue;
      if (GW.space && GW.space.hideInkItem && GW.space.hideInkItem(it)) continue;
      const b = bbox(it);
      if (b.x > vr.x + vr.w || b.y > vr.y + vr.h || b.x + b.w < vr.x || b.y + b.h < vr.y) continue;
      drawAnn(annCtx, it);
    }
    // 1.6.8（R8/R9）：纸框与页边距线（无限画布下 pagedBox() 为空，什么都不画）
    drawPageFrame();
  }
  function renderPartialNow(p) {
    if (fastPending || !viewSynced()) { renderAll(); return; }
    const pad = 2;
    const dx = Math.max(0, Math.floor(((p.x1 - pad) * view.s + view.tx + PADX) * dpr));
    const dy = Math.max(0, Math.floor(((p.y1 - pad) * view.s + view.ty + PADY) * dpr));
    const ex = Math.min(inkCv.width, Math.ceil(((p.x2 + pad) * view.s + view.tx + PADX) * dpr));
    const ey = Math.min(inkCv.height, Math.ceil(((p.y2 + pad) * view.s + view.ty + PADY) * dpr));
    if (ex - dx < 1 || ey - dy < 1) return;
    inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    inkCtx.clearRect(dx, dy, ex - dx, ey - dy);
    // 1.7.9：局部重画必须**连裁剪一起做**，否则脏区之外会被二次合成。
    // renderInk 的跳过判定是「包围盒完全不沾边才跳过」，沾边的条目是**整条**重画：
    // 一条横跨脏区的半透明填充图形（或荧光笔笔迹）会被整条补画到脏区之外，
    // 叠在已有像素上再合成一遍 —— 老师看到的就是「在图形上写字，填充越写越深」
    // （实测 fillAlpha .2：alpha 51 → 91 → 123 → …，每写一笔多合成一次），
    // 而不透明填充则会把脏区外那段笔迹整段盖住（「图形遮挡一部分笔迹」）。
    // 裁剪在单位矩阵下按设备像素开，之后 renderInk 换世界矩阵不影响它（clip 已固化）。
    inkCtx.save();
    inkCtx.beginPath();
    inkCtx.rect(dx, dy, ex - dx, ey - dy);
    inkCtx.clip();
    renderInk(null, { x1: p.x1 - pad, y1: p.y1 - pad, x2: p.x2 + pad, y2: p.y2 + pad });
    inkCtx.restore();
    renderAnn();
  }

  // ---------- 进行中的钢笔笔迹：增量画到墨迹层 ----------
  // 两条路都保证「收笔时不需要再修正、也不用整屏重画」：
  //  · 等宽（smoothPath）：逐段 stroke 中点二次贝塞尔，与最终 smoothPath 完全一致（只滞后一个点）。
  //  · 变宽 it.ws（笔锋）：逐段 fill 一个四边形，四边形两端的偏移取的是与 outlinePath
  //    **完全相同**的居中切线（i-1 → i+1 的弦），首尾各补一个圆帽 ——
  //    这些四边形的并集在几何上就等于最终那个轮廓多边形本身。
  const trail = { it: null, n: 0, dirty: null, clipped: false };
  // 1.7.3：缩小时的「最小屏幕线宽」系数。**增量书写与最终渲染必须用同一个**，
  // 否则写字过程中是细灰线、一抬手变成 1.2px 的粗线，就是用户说的「写完笔迹突然变大」。
  // 目标：屏幕上至少 1.2px 宽；最多放粗到 2.2 倍（远景别变成一团粗线）。
  function inkMinK(it) {
    const s = view.s || 1, W = (it && it.width) || 2;
    if (s >= 1.0) return 1;                       // 放大时不需要放大线宽
    // 1.7.4：缩小到 5% 时一条 3px 的笔在屏幕上只有 0.15px —— 画出来是一片淡灰，就是
    // 老师说的「5% 下模糊不清」。这里不是「最多 2.2 倍」，而是**按屏幕像素要够 1.15px**
    // 反算放大倍数（上限 8 倍）：缩放越小，线越要「撑」到看得见，但笔迹之间仍分得开。
    const need = 1.15 / Math.max(1e-4, W * s);
    return Math.min(8, Math.max(1, need));
  }
  GW.inkMinK = inkMinK;
  function trailHalf(it, i) {
    const W = it.ws;
    return (((W && W[i] != null ? W[i] : it.width) || 2) * inkMinK(it)) / 2;
  }
  const _oa = { lx: 0, ly: 0, rx: 0, ry: 0 }, _ob = { lx: 0, ly: 0, rx: 0, ry: 0 };
  function trailOffsets(it, i, o) {
    const P = it.pts, n = P.length / 2;
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = P[2 * b] - P[2 * a], dy = P[2 * b + 1] - P[2 * a + 1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = trailHalf(it, i), x = P[2 * i], y = P[2 * i + 1];
    o.lx = x - dy * w; o.ly = y + dx * w;
    o.rx = x + dy * w; o.ry = y - dx * w;
    return o;
  }
  // 1.3.1：进行中的笔迹改「圆头短段」而不是四边形。
  // 四边形两端的偏移方向取的是相邻两点的弦，笔尖一抖就出折角；圆头短段由
  // canvas 自己把两头倒圆，帧率一样、但放大看书写过程也不再是多边形。
  function trailSeg(it, i) {
    const P = it.pts, n = P.length / 2;
    const a = i - 1, c = i;
    const p0 = a > 0 ? a - 1 : a, p3 = c < n - 1 ? c + 1 : c;
    const x0 = P[2 * p0], y0 = P[2 * p0 + 1], x1 = P[2 * a], y1 = P[2 * a + 1];
    const x2 = P[2 * c], y2 = P[2 * c + 1], x3 = P[2 * p3], y3 = P[2 * p3 + 1];
      // 1.7.3：宽度下限改成「屏幕 0.6px」，以前是「世界 1.0 单位」。
      // 世界下限在放大后会把书写过程画得比抬手后的成品粗：s=6 时一笔 3px 的笔迹
      // 过程中是 6px、松手变 3px（实测比值 0.52），老师会觉得「一松手字就细了」。
      const wlive = Math.max(0.6 / (view.s || 1), (trailHalf(it, a) + trailHalf(it, c)));
    inkCtx.lineWidth = wlive;
    // 1.4.3：段内按 Catmull-Rom 再插两段。60Hz 的手写（平板网页端）两点间距常有十几个像素，
    // 直接连线在快写时就是一连串可见的折角；插两段后圆头短段自然连成弧，松手再按最终几何重画。
    // 1.7.1：段长按**屏幕像素**自适应 —— 平板快速甩笔时一帧能走出 40~60px，固定只插 2 段
    // 就是「每段一根直棍」，弯折处看着像碎片（用户报的第 6 条）。短段仍插 2 段，行为不变。
    const segPx = Math.hypot(x2 - x1, y2 - y1) * view.s;
    const parts = Math.max(2, Math.min(8, Math.ceil(segPx / 7)));
    const w0 = trailHalf(it, a), w1 = trailHalf(it, c);
    let px = x1, py = y1;
    for (let k = 1; k <= parts; k++) {
      const t = k / parts, t2 = t * t, t3 = t2 * t;
      const qx = 0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3);
      const qy = 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
      // 1.7.2：宽度沿段内插值。原来每段用两点宽度的平均值，压感笔写完放大看是
      // 一节一节的「竹节」，也是「放大后线条不干净」的一部分。
      inkCtx.lineWidth = Math.max(0.6 / (view.s || 1), (w0 + (w1 - w0) * t) * 2);
      inkCtx.beginPath();
      inkCtx.moveTo(px, py);
      inkCtx.lineTo(qx, qy);
      inkCtx.stroke();
      px = qx; py = qy;
    }
  }
  function trailUnion(x1, y1, x2, y2) {
    const d = trail.dirty;
    if (!d) trail.dirty = { x1, y1, x2, y2 };
    else { d.x1 = Math.min(d.x1, x1); d.y1 = Math.min(d.y1, y1); d.x2 = Math.max(d.x2, x2); d.y2 = Math.max(d.y2, y2); }
  }
  function trailMark(it, i) {
    const P = it.pts, w = Math.max(trailHalf(it, i - 1), trailHalf(it, i)) + 2;
    trailUnion(Math.min(P[2 * i - 2], P[2 * i]) - w, Math.min(P[2 * i - 1], P[2 * i + 1]) - w,
               Math.max(P[2 * i - 2], P[2 * i]) + w, Math.max(P[2 * i - 1], P[2 * i + 1]) + w);
  }
  function trailDot(it, i) {
    const P = it.pts, w = trailHalf(it, i) + 2;
    trailUnion(P[2 * i] - w, P[2 * i + 1] - w, P[2 * i] + w, P[2 * i + 1] + w);
  }
  function setTrailCtx() {
    pageMatrix(inkCtx, PADX, PADY);      // 2.0.7（R7）：增量书写也必须与整幅重画同一矩阵
    // 1.5.3：增量书写这条路不走 drawItem，反差换算要在这里单独接一次，否则「正在写」的
    // 那一笔是白墨、抬手后跳成墨色（inkFix 有缓存，每段一次 Map 查询，实测无感）。
    const tc = GW.inkFix ? GW.inkFix(trail.it.color) : trail.it.color;
    inkCtx.strokeStyle = tc;
    inkCtx.fillStyle = tc;
    inkCtx.lineWidth = trail.it.width;
    inkCtx.lineCap = 'round'; inkCtx.lineJoin = 'round';
  }
  // 1.7.5-03：正在写的那一笔是**直接增量画到墨迹层**的，渲染阶段的裁剪管不到它 ——
  // 当时为了让纸外那一段立刻消失，这里按「整笔」开了一次纸框 clip。
  // 2.0.8：纸框不再是书写边界（见 pageAllows/pageClipItems 的说明），这里不再裁剪，
  // 于是增量笔迹与无限画布逐像素同路 —— 也少了一次 save/clip/restore 的状态切换。
  // 两个出口函数保留（begin/end/cancel 都在调），恒为 no-op。
  function trailClipOn() { return false; }
  function trailClipOff() {
    if (!trail.clipped) return;
    trail.clipped = false;
    inkCtx.restore();
  }
  GW.inkTrail = {
    // 不透明的钢笔 / 毛笔（等宽或变宽）都能走增量；荧光笔是半透明叠加会加深，仍走实时层
    // 2.0.3：颗粒笔（铅笔/粉笔）走实时层 —— 增量路径只画实心段，颗粒会前后不一。
    // 2.0.4：marker 的 inkSt.alpha=0.96 原来不被 grainy() 命中 ⇒ 增量快路径丢 alpha。
    // 改按「笔种最终 alpha<1 或有颗粒」排除，缺省对其它笔逐位不变。
    ok(it) {
      const st = GW.inkStyle && !it.hl ? GW.inkStyle.renderOf(it) : null;
      return !!inkCtx && !it.hl && !it.alpha && !(st && (st.alpha < 1 || st.grain > 0));
    },
    begin(it) {
      if (!GW.inkTrail.ok(it)) return false;
      GW.flushView();
      trail.it = it; trail.n = 1; trail.dirty = null;
      trail.clipped = trailClipOn();     // 必须在 flushView 之后：它内部可能 renderAll（用单位矩阵清屏）
      if (it.ws) {                       // 起点圆帽（outlinePath 的起始圆帽分两次画，这里一次画完）
        setTrailCtx();
        inkCtx.beginPath();
        inkCtx.arc(it.pts[0], it.pts[1], trailHalf(it, 0), 0, Math.PI * 2);
        inkCtx.fill();
        trailDot(it, 0);
      }
      return true;
    },
    point(it, through = Infinity) {
      if (trail.it !== it || !inkCtx) return;
      const P = it.pts, n = P.length / 2, m = trail.n;
      if (it.ws) {
        const last = Math.min(n - 1, through);
        if (last < m) return;
        setTrailCtx();
        for (let i = m; i <= last; i++) { trailSeg(it, i); trailMark(it, i); }
        trail.n = last + 1;
        return;
      }
      if (n < 2 || n - 1 <= m - 1) return;
      setTrailCtx();
      inkCtx.beginPath();
      inkCtx.moveTo((P[2 * (m - 1)] + P[2 * m]) / 2, (P[2 * (m - 1) + 1] + P[2 * m + 1]) / 2);
      for (let i = m; i <= n - 2; i++) {
        inkCtx.quadraticCurveTo(P[2 * i], P[2 * i + 1], (P[2 * i] + P[2 * (i + 1)]) / 2, (P[2 * i + 1] + P[2 * (i + 1) + 1]) / 2);
        trailMark(it, i);
      }
      inkCtx.stroke();
      trail.n = Math.max(m, n - 1);
    },
    end(it) {
      if (trail.it !== it || !inkCtx) return;
      const P = it.pts, n = P.length / 2;
      if (it.ws) {
        if (n >= 2) {
          setTrailCtx();
          // 圆头短段自带端帽，最后一段在 point() 里就画完了，这里只补没画到的
          for (let i = Math.max(1, trail.n); i <= n - 1; i++) { trailSeg(it, i); trailMark(it, i); }
        }
        trail.it = null; trail.n = 0; trail.dirty = null;
        trailClipOff();
        return;
      }
      if (n >= 2) {
        setTrailCtx();
        inkCtx.beginPath();
        if (trail.n <= 1) inkCtx.moveTo(P[0], P[1]);
        else inkCtx.moveTo((P[2 * (trail.n - 1)] + P[2 * trail.n]) / 2, (P[2 * (trail.n - 1) + 1] + P[2 * trail.n + 1]) / 2);
        inkCtx.lineTo(P[2 * (n - 1)], P[2 * (n - 1) + 1]);
        inkCtx.stroke();
      }
      trailClipOff();
      trail.it = null; trail.n = 0; trail.dirty = null;   // 已写入模型，像素就是最终结果，不需要修正
    },
    // 取消这一笔（第二根手指落下等）：把已经画上去的部分局部擦掉
    cancel() {
      const d = trail.dirty;
      // 顺序要紧：必须先还原裁剪再局部重画 —— renderPartial 用单位矩阵 clearRect，
      // 还带着纸框 clip 的话纸外那半截残墨擦不掉。
      trailClipOff();
      trail.it = null; trail.n = 0; trail.dirty = null;
      if (d) renderPartial(d.x1, d.y1, d.x2, d.y2);
    },
    abort() { trailClipOff(); trail.it = null; trail.n = 0; trail.dirty = null; },
  };

  // 预渲染圈的大小：先按「短边的 32%」给，再按「四层位图总面积不超过视口的 1.9 倍」收住。
  // 解 (w+2p)(h+2p) = R*w*h 得 p = [-（w+h) + √((w+h)² + 4(R−1)wh)] / 4。
  // 4K 屏上这一条很关键：无脑给 0.32×2160 ≈ 690 会让四块画布多占约 240MB。
  function padFor(w, h) {
    if (!w || !h) return 0;
    // 4K 一体机上面积已经很大（8.3M 像素/层），这时把比例收到 1.45：
    // pad 仍有 ~280px 的缓冲，而四层内存只从 ~133MB 涨到 ~192MB。
    const R = w * h > 6e6 ? 1.45 : 1.9, sum = w + h;
    let p = (-sum + Math.sqrt(sum * sum + 4 * (R - 1) * w * h)) / 4;
    p = Math.min(p, Math.min(w, h) * 0.32);
    return Math.max(0, Math.round(p));
  }
  // 供「把视口那一块抠出来」的调用方用（区域截图 / 导出 PNG / 批注快照）
  GW.canvasGeom = () => ({ padX: PADX, padY: PADY, w: W, h: H, dpr, bw: WD, bh: HD });
  GW.blitViewport = function (ctx, cv, dx, dy, dw, dh) {
    if (!cv || !W || !WD || !HD) return false;
    const kx = cv.width / WD, ky = cv.height / HD;
    ctx.drawImage(cv, PADX * kx, PADY * ky, W * kx, H * ky, dx || 0, dy || 0, dw, dh);
    return true;
  };

  function resize() {
    // 墨迹层像素比跟着「档位 + 视觉缩放 + 每块画布的总像素预算」走：兼容档砍掉一大半像素，
    // 4K 一体机上这一步的差别是决定性的（详见 perf.js 的 maxPixels）
    const vp = GW.viewSize(); W = vp.w; H = vp.h;
    // 位图比视口大一圈（见 PADX/PADY 的说明），尺寸判据也用这一圈算出来的 WD/HD
    const pad = padFor(W, H);
    const nwd = W + pad * 2, nhd = H + pad * 2;
    const nd = GW.perf ? GW.perf.inkDprFor(view.s, W, H) : (window.devicePixelRatio || 1);
    const scaleChanged = nd !== dpr;
    if (scaleChanged) dpr = nd;
    // ★ 位图要跟着窗口尺寸一起重建。软件渲染下像素比恒等于 naturalDpr，
    //   窗口变了而像素比没变时若只改 style.width，整块画布会被 CSS 拉伸，
    //   画布上的墨迹就与 #geo-layer / 命中测试（都按 view 的 CSS 像素算）整体错位。
    const sizeChanged = scaleChanged || nwd !== WD || nhd !== HD;
    PADX = pad; PADY = pad; WD = nwd; HD = nhd;
    if (sizeChanged) for (const c of [bgCv, inkCv, annCv, liveCv]) { c.width = Math.round(WD * dpr); c.height = Math.round(HD * dpr); }
    for (const c of [bgCv, inkCv, annCv, liveCv]) {
      c.style.width = WD + 'px'; c.style.height = HD + 'px';
      // 位图左上角 = 视口左上角再往左上各推 PAD。绘制变换里 + PAD、CSS 变换里补 PAD*(1-k)，
      // 三处（这里、renderInk/renderAnn、applyFastView）必须一致，否则墨迹与命中测试错位。
      c.style.left = -pad + 'px'; c.style.top = -pad + 'px';
    }
    bgKey = '';
    if (sizeChanged) { renderView.s = NaN; liveFull = true; liveDirty = null; for (const c of [bgCv, inkCv, annCv, liveCv]) c.style.transform = ''; }
    requestRender(); requestLive();
  }

  // 缩放超过一档后按新像素比重建墨迹层（只会在停手时发生，不会打断手势）
  let dprTimer = 0;
  function scheduleDprCheck() {
    clearTimeout(dprTimer);
    dprTimer = setTimeout(dprCheckIdle, 300);
  }
  // 1.7.1：正在写的那一笔还只在位图上、没落进模型（trail.it 非空）。这时候重建位图
  // 会把整块画布清空，写到一半的笔迹当场消失半截（「放大提清晰度」之后软件渲染的
  // 像素比终于会随缩放变，这个窗口第一次变得容易撞上）。等这一笔落进模型再重建。
  function dprCheckIdle() {
    if (trail.it) { dprTimer = setTimeout(dprCheckIdle, 200); return; }
    dprTimer = 0;
    GW.refreshRenderScale();
  }

  function frame() {
    scheduled = false;
    if (!bgCtx) return;
    // 1.6.8（R12）：窗口不在前台就不画。rAF 在后台会被浏览器降到 ~1fps，
    // 但每一帧仍是真开销（整屏重画 + 写位图），切回来时由下面的 visibilitychange 补画。
    // 注意只拦「全量/局部」这条路径：live 层与快速通道都是手势进行中才会被置位，桌面批注不受影响。
    if (document.hidden) return;
    // 本帧是否真的走了「合成快速通道」：实时层要据此决定按哪个视图落笔
    let usedFast = false;
    // 2.0.3：空闲帧补建缩放时被推迟的笔迹轮廓（见 buildStrokePath / pumpPathQueue）。
    // 必须在下面三条主路径**之前**：这一帧没有整幅重画时才有余量。
    // 注意不能在这里直接 requestRender —— 那会把 needRender 置真，本帧末尾立刻整幅重画，
    // 等于白补。补完只置一个标记，等本帧收尾再排下一帧做整幅重画（那一帧 _pathS 已对齐，
    // drawItem 不会再排队，不会自激）。
    let pathDrained = false;
    if (!needRender && !partial && !fastPending && pathQ.length) {
      pathDrained = !pumpPathQueue(4);
      if (!pathDrained) requestFrame();
    }
    if (needRender) {
      needRender = false; partial = null; fastPending = false;
      clearTimeout(cleanTimer); cleanTimer = 0;
      document.body.classList.remove('pan-quiet');
      renderAll();
    } else if (partial) {
      const p = partial; partial = null;
      renderPartialNow(p);
    } else if (fastPending) {
      fastPending = false;
      usedFast = true;
      applyFastView();
    }
    if (needLive) {
      needLive = false;
      // 快速通道期间实时层与墨迹层共用同一套「旧视图 + CSS 变换」，画的时候要按旧视图落笔。
      // 注意这里必须用 usedFast 而不是 fastPending —— 后者在上面已经被清零，
      // 用它会永远取到 view，导致快速通道下的实时层内容与画布错位。
      const lv = usedFast ? renderView : view;
      // 判据是「上一帧有没有真的画出东西」，不是「有没有注册绘制者」——
      // input.js 的套索是**常驻注册**的（平时什么都不画），按注册者判就永远不会隐藏。
      if (!liveDrawers.size && !livePersist.size) {
        if (liveDirty) { clearDevRect(liveDirty); liveDirty = null; }
        liveFull = false;
        liveClearReq.length = 0;
      } else {
        // 不变式：隐藏 ⇒ 画布必然是空的（每次隐藏前都清过），所以隐藏期间不必每帧再整屏 clearRect
        let cleared = null;                         // 本帧清掉了哪块（设备像素）：持久型绘制者据此决定要不要整条重画
        if (liveShown) {
          if (liveFull) { clearDevFull(); cleared = 'full'; }
          else if (liveDirty) { clearDevRect(liveDirty); cleared = liveDirty; }
          // 持久型绘制者（ghost）还在画：没有普通 mark 就不清 —— 它们画过的像素要留着，
          // 这正是「每帧只画新增段」能成立的前提。
          else if (!livePersist.size) { clearDevFull(); cleared = 'full'; }
        }
        liveFull = false;
        const marks = [];
        const mark = (x1, y1, x2, y2) => marks.push([x1, y1, x2, y2]);
        // 1.3.0（R4a）：ghost 这类「自己管像素」的绘制者要知道本帧清了哪里、并且能把世界坐标
        // 换算成设备矩形（用当前 lv，而不是全局 view —— 快速通道期间两者不同）。
        const rectOf = (rs) => (rs && rs.length ? liveRectOf(rs, lv) : null);
        for (const fn of liveDrawers) {
          liveCtx.save();
          liveCtx.setTransform(dpr * lv.s, 0, 0, dpr * lv.s, dpr * (lv.tx + PADX), dpr * (lv.ty + PADY));
          // 1.7.5-03：荧光笔/激光/套索都画在这一层 —— 分页版式下同样只许出现在纸内。
          const lb = pagedBox();
          if (lb) { liveCtx.beginPath(); liveCtx.rect(lb.x, lb.y, lb.w, lb.h); liveCtx.clip(); }
          try { if (fn(liveCtx, { dpr, view, mark, cleared, rectOf, lv })) needLive = true; } catch (e) { console.error(e); }
          liveCtx.restore();
        }
        // 持久型绘制者：不 mark（mark = 下一帧请清掉我），自己管像素
        for (const fn of livePersist) {
          liveCtx.save();
          liveCtx.setTransform(dpr * lv.s, 0, 0, dpr * lv.s, dpr * (lv.tx + PADX), dpr * (lv.ty + PADY));
          const pb = pagedBox();
          if (pb) { liveCtx.beginPath(); liveCtx.rect(pb.x, pb.y, pb.w, pb.h); liveCtx.clip(); }
          try { if (fn(liveCtx, { dpr, view, mark: null, cleared, rectOf, lv })) needLive = true; } catch (e) { console.error(e); }
          liveCtx.restore();
        }
        // 约定：每个实时绘制函数只要画了东西，就必须用 mark(x1,y1,x2,y2) 报告它的世界坐标范围；
        // 什么都没画的函数不必报告。下一帧只清这些范围，不再整屏清。
        // liveClearReq 是「只清不画」的登记（远端 ghost 消失时擦掉它占过的整块）。
        if (liveClearReq.length) { for (const r of liveClearReq) marks.push(r); liveClearReq.length = 0; }
        liveDirty = marks.length ? liveRectOf(marks, lv) : null;
      }
      // 1.3.0（R4a）：会话期常驻 —— 远端有过程内容时不再随每条 ghost 起落切 display。
      setLiveShown(liveSticky || !!liveDirty);
      if (needLive) requestFrame();
    }
    // 2.0.3：补建队列刚排空 ⇒ 排一帧整幅重画，把「先用旧轮廓顶着」的那批笔迹换成当前缩放的精度。
    // 反过来，如果这一帧刚做过整幅重画（renderAll 里又排了一批），这里要主动续一帧去补建 ——
    // 否则队列会一直躺着，直到下一次交互才建（表现为「缩放停下后笔迹还是有点粗边」）。
    if (pathDrained) requestRender();
    else if (pathQ.length && !needRender && !partial && !fastPending) requestFrame();
  }

  GW.initBoard = function () {
    bgCv = document.getElementById('bg-canvas');
    inkCv = document.getElementById('ink-canvas');
    annCv = document.getElementById('ann-canvas');
    liveCv = document.getElementById('live-canvas');
    if (liveCv) { liveShown = false; liveCv.style.display = 'none'; }  // 启动时实时层是空的，先撤出合成
    GW.worldEl = document.getElementById('world');
    // 背景不透明：少一层全屏混合。
    // 1.1.14 透明批注层例外：那一层必须带 alpha —— alpha:false 的位图「空」是纯黑而不是透明，
    // 桌面一点都透不过来（probe-overlay 量到 ctxAlpha=false、整屏 240000 个不透明像素）。
    bgCtx = GW.perf.ctx2d(bgCv, { alpha: !!GW.overlayMode });
    inkCtx = GW.perf.ctx2d(inkCv);
    annCtx = GW.perf.ctx2d(annCv);
    liveCtx = GW.perf.ctx2d(liveCv);
    addEventListener('resize', resize);
    // 1.3.1：iOS 的 visualViewport 变化（地址栏收起/展开、键盘弹出）不一定会派发 resize，
    // kit.js 的视口变量模块发现尺寸变了会回调这里，笔迹层与相机一起重算。
    GW.refreshViewport = resize;
    // 缩放变化后（手势停下 300ms）重新评估墨迹层像素比：放大得足够多就提高分辨率，缩小则省下像素
    GW.bus.on('view', scheduleDprCheck);
    resize();
    schedule();
  };

  // 渲染档位变化（设置里手动切换，或探测到显卡状态变化）后重新决定墨迹层像素比。
  // 正在重画 / 正在走快速通道时不打断 —— 等停手后的精修时机再定（见 GW.viewChanged）。
  GW.refreshRenderScale = function () {
    if (!bgCtx || needRender || partial || fastPending) return;
    const nd = GW.perf ? GW.perf.inkDprFor(view.s, W, H) : (window.devicePixelRatio || 1);
    if (nd !== dpr) resize();
  };

  // 把当前页渲染成缩略图（墨迹 + 对象占位）
  GW.renderThumb = function (page, tw, th) {
    const c = document.createElement('canvas'); c.width = tw; c.height = th;
    const x = c.getContext('2d');
    const t = GW.bgTheme(page.bg.color);
    x.fillStyle = t.fill; x.fillRect(0, 0, tw, th);
    const b = contentBounds(page);
    if (!b) return c;
    const s = Math.min(tw / b.w, th / b.h) * 0.9;
    x.setTransform(s, 0, 0, s, tw / 2 - (b.x + b.w / 2) * s, th / 2 - (b.y + b.h / 2) * s);
    for (const o of page.objs) {
      x.fillStyle = o.thumbColor || 'rgba(15,157,138,0.15)'; x.fillRect(o.x, o.y, o.w, o.h);
      x.strokeStyle = 'rgba(15,157,138,0.6)'; x.lineWidth = 2 / s; x.strokeRect(o.x, o.y, o.w, o.h);
      if (o._thumb) try { x.drawImage(o._thumb, o.x, o.y, o.w, o.h); } catch (_) {}
    }
    for (const it of page.ink) drawItem(x, it);
    return c;
  };

  // 1.6.7（T18）：版本历史用的首页小缩略图（JPEG dataURL）。失败一律返回空串，
  // 不允许因为画不出缩略图而让备份失败 —— 备份本身比缩略图重要。
  GW.backupThumb = function () {
    try {
      const p = (GW.doc.pages && GW.doc.pages[0]) || null;
      if (!p) return '';
      return GW.renderThumb(p, 240, 150).toDataURL('image/jpeg', 0.62);
    } catch (e) { return ''; }
  };

  // ---------- 撤销 / 重做 ----------
  // op = { pageId, add:[item], remove:[item], update:[{before, after}] }
  const undoStack = [], redoStack = [];
  // 普通图形（非 ms）的旋转角与「旋转前的框」是虚线框定位要用的持久字段。它们以 _ 开头，
  // 但**不能**在存档/撤销时被剥掉：剥掉之后重开文件，旋转过的三角形会得到一个外接矩形框，
  // 比图形本身大一倍（老师反馈的「虚线框太大」之一）。所以这几个键单独放行。
  const KEEP_UNDERSCORE = { _rot: 1, _rw: 1, _rh: 1 };
  const strip = (it) => { const c = {}; for (const k in it) if (k[0] !== '_' || KEEP_UNDERSCORE[k]) c[k] = it[k]; return c; };
  GW.clone = (it) => JSON.parse(JSON.stringify(strip(it)));
  GW.strip = strip;

  function findPage(id) { return doc.pages.find((p) => p.id === id); }
  function applyOp(op, inverse) {
    const page = findPage(op.pageId);
    if (!page) return;
    const add = inverse ? op.remove : op.add, rem = inverse ? op.add : op.remove;
    for (const it of rem || []) removeRaw(page, it.id);
    // 复审 C11：clone 会剥掉 _index（strip 只放行白名单字段），撤销时得单独带过去，
    // 否则删中间一条再撤销会插到末尾（叠放顺序反转）
    for (const it of add || []) {
      const c = GW.clone(it);
      if (it && it._index != null) c._index = it._index;
      insertRaw(page, c);
    }
    for (const u of op.update || []) {
      const st = inverse ? u.before : u.after;
      replaceRaw(page, GW.clone(st));
    }
    for (const g of op.geo || []) {
      if (GW.geoApply) GW.geoApply(page, g.id, inverse ? g.before : g.after);
    }
    if (page !== GW.page()) GW.gotoPage(doc.pages.indexOf(page));
    markDirty();
    requestRender();
  }
  function insertRaw(page, it) {
    if (it.kind === 'obj') {
      const i = it.z != null ? page.objs.findIndex((o) => (o.z || 0) > it.z) : -1;
      if (i < 0) page.objs.push(it); else page.objs.splice(i, 0, it);
      if (page === GW.page()) GW.objects.mount(it);
    } else {
      // 1.4.2：同一个 id 只允许一份。远端 op 与本地提交如果撞了同一条笔迹（回声、重连重放），
      // 以前会 push 出第二条 —— 那条不在历史里，擦不掉也撤销不了。现在就地替换。
      const i = it.id ? page.ink.findIndex((x) => x.id === it.id) : -1;
      if (i >= 0) page.ink[i] = it;
      else if (it._index != null) page.ink.splice(it._index, 0, it);
      else page.ink.push(it);
      // 1.4.4（R4）：_index 只是「插回第几位」的临时提示，用完必须删 —— 以 _ 开头的字段
      // 只在 clone/strip 时被剥掉，内存里的对象会原样被序列化进 .gewu。
      if (it._index != null) delete it._index;
    }
  }
  function removeRaw(page, id) {
    let i = page.ink.findIndex((x) => x.id === id);
    if (i >= 0) {
      // 复审 C11：撤销要按原索引插回，否则叠放顺序反转（under 删掉再撤销会跑到 over 上面）
      try { if (page.ink[i]._index == null) page.ink[i]._index = i; } catch (e) { /* 只读对象就算了 */ }
      page.ink.splice(i, 1);
      return;
    }
    i = page.objs.findIndex((x) => x.id === id);
    if (i >= 0) { const [o] = page.objs.splice(i, 1); if (page === GW.page()) GW.objects.unmount(o); }
  }
  function replaceRaw(page, it) {
    if (it.kind === 'obj') {
      const i = page.objs.findIndex((x) => x.id === it.id);
      if (i < 0) return;
      const old = page.objs[i];
      // 保留运行时引用（DOM、仿真实例）
      for (const k in old) if (k[0] === '_') it[k] = old[k];
      page.objs[i] = it;
      if (page === GW.page()) GW.objects.update(it);
    } else {
      const i = page.ink.findIndex((x) => x.id === it.id);
      if (i >= 0) page.ink[i] = it;
    }
  }

  GW.commit = function (op, opts) {
    op.pageId = op.pageId || GW.page().id;
    if (!(op.add && op.add.length) && !(op.remove && op.remove.length) && !(op.update && op.update.length) && !(op.geo && op.geo.length)) return;
    // 记录时深拷贝，避免后续修改污染历史
    const rec = { pageId: op.pageId, add: (op.add || []).map(GW.clone), remove: (op.remove || []).map((it) => {
      const c = GW.clone(it);
      // _index 是「撤销时插回第几位」，strip 会剥掉它，这里单独补回去
      if (it && it._index != null) c._index = it._index;
      return c;
    }), update: (op.update || []).map((u) => ({ before: GW.clone(u.before), after: GW.clone(u.after) })) };
    // 1.5.2（R15）：尺规工具也进历史（geo 每条 = { id, before, after }，null 表示不存在）
    if (op.geo && op.geo.length) rec.geo = op.geo.map((g) => ({ id: g.id, before: g.before ? GW.clone(g.before) : null, after: g.after ? GW.clone(g.after) : null }));
    undoStack.push(rec);
    if (undoStack.length > 300) undoStack.shift();
    redoStack.length = 0;
    markDirty();
    GW.bus.emit('history');
    // 局域网协同：本机产生的操作往外广播（平板那侧不回推，见 applyRemote）
    // 1.1.15：silent —— 这一笔的增量已经在对端实时擦除里发过了（橡皮擦抬手时用），不再重复发整条。
    if (GW.syncEmit && !(opts && opts.silent)) GW.syncEmit(rec);
  };

  // ---------- 局域网协同：应用远端操作 ----------
  // 与 applyOp 的区别：不进历史、**不切页** —— 平板翻到第 3 页时不能把老师正在讲的第 1 页也切走；
  // 也不弹任何提示，远端来的操作和本机操作看起来必须一模一样。
  // ---------- 页面级状态（底色 / 底纹 / 页名）的同步 ----------
  // 这些不是「条目」，走不了 commit（commit 只认 add/remove/update）。
  // 单独一条 {pageId, page:{...}} 的 op，远端按同样字段就地覆盖，不进历史。
  GW.syncPage = function (patch, opts) {
    const p = GW.page();
    if (!p) return;
    if (patch.bg) p.bg = Object.assign({}, p.bg, patch.bg);
    if (patch.name != null) p.name = patch.name;
    markDirty();
    if (GW.syncEmit && !(opts && opts.silent)) GW.syncEmit({ pageId: p.id, page: { bg: p.bg, name: p.name } });
  };
  // 页面增删这类结构改动：整份快照重发最稳（客户端可能正在写字，不能只发差分）
  GW.syncDoc = function () {
    if (!GW.syncEmit) return;
    // 1.1.15 修：平板端没有「发快照」的通道（pushSnapshot 在客户端直接空转），
    // 以前平板新增/删除页面什么也没发出去 —— 电脑上永远看不到新页，这是「只同步一部分」的一处硬伤。
    // 宿主发快照，客户端向宿主「要」快照。
    const host = !!(GW.lansync && GW.lansync.isHost && GW.lansync.isHost());
    if (host && GW.lansync && GW.lansync.pushSnapshot) GW.lansync.pushSnapshot();
    else GW.syncEmit({ snapreq: 1 });
  };

  GW.applyRemote = function (op) {
    if (!op) return false;
    // 对端改了页面结构（新增/删除页），请它重发一份快照
    if (op.snapreq) { if (GW.lansync && GW.lansync.pushSnapshot) GW.lansync.pushSnapshot(); return true; }
    const page = findPage(op.pageId);
    if (!page) return false;
    if (op.page) {
      if (op.page.bg) page.bg = Object.assign({}, page.bg, op.page.bg);
      if (op.page.name != null) page.name = op.page.name;
      markDirty();
      if (page === GW.page()) { GW.bus.emit('bg'); requestRender(); }
    }
    if (op.clear) {
      // 1.1.16（R2）：清屏的权威同步是一条紧凑指令，不再把整页条目原文塞进一条 op。
      // applyRemote 从来只按 id 删（removeRaw(page, it.id)），几百 KB 的正文纯属白占客户端队列。
      const kill = op.clear === 'all' ? page.ink.concat(page.objs) : page.ink.slice();
      for (const it of kill) removeRaw(page, it.id);
      markDirty();
      if (page === GW.page()) {
        try { if (GW.selection && GW.selection.clear) GW.selection.clear(); } catch (e) { /* 没选中就算了 */ }
        requestRender();
      }
    }
    for (const it of op.remove || []) removeRaw(page, it.id);
    // 1.2.0 修（平板上「同一笔出现两条、其中一条擦不掉也撤销不了」）：所有条目都带 id，
    // 远端 op 里若带着本机已经有的 id，就不要再插一份 —— 重复 id 的第二份不在历史里，
    // 撤销/擦除只认得掉一份，另一份永远留在画布上。
    const have = new Set();
    for (const it of page.ink || []) have.add(it.id);
    for (const it of page.objs || []) have.add(it.id);
    for (const it of op.add || []) {
      if (!it || (it.id && have.has(it.id))) continue;
      if (it.id) have.add(it.id);
      const copy = GW.clone(it);
      // 1.4.4（R4）：擦除碎片必须插回原来的位置。GW.clone 会剥掉 _index（strip 只放行
      // _rot/_rw/_rh），所以在克隆之后手动补回；insertRaw 用完自己删，不会落进存档。
      if (it._index != null) copy._index = it._index;
      insertRaw(page, copy);
    }
    for (const u of op.update || []) replaceRaw(page, GW.clone(u.after));
    // 1.5.2（R15）：对端的尺规工具（增删/挪动/旋转/调半径）就地落进 page.geo 并同步 DOM
    for (const g of op.geo || []) {
      if (GW.geoApply) GW.geoApply(page, g.id, g.after);
    }
    markDirty();
    if (page === GW.page()) {
      // F27：远端替换的对象也是新实体（下面 replaceRaw 用 GW.clone 生成），
      // 选区按 id 重绑到当前页里的实体，避免后续改色/改样式写进脱离文档的那份。
      if (GW.selection && GW.selection.prune) GW.selection.prune();
      requestRender();
    }
    // 1.3.0（R4b）：远端 op 落定后也要发 history —— dock 的撤销/重做按钮是按住它同步 disabled 的，
    // 以前只有本地 commit 发，平板收到远端操作后按钮可能还挂着旧的 disabled，点了没反应。
    GW.bus.emit('history');
    GW.bus.emit('remote-op', op);
    return true;
  };
  // 撤销要广播「反过来的那条 op」，否则平板上看不到老师刚才那次撤销
  function inverseOp(op) {
    return {
      pageId: op.pageId,
      add: op.remove || [],
      remove: op.add || [],
      update: (op.update || []).map((u) => ({ before: u.after, after: u.before })),
      geo: (op.geo || []).map((g) => ({ id: g.id, before: g.after, after: g.before })),
    };
  }
  // 便捷：添加条目（同时修改文档 + 记录历史）
  // opts.painted = 内容已经画在墨迹层上（增量笔迹），不需要整屏重画
  // 复审 B10：异步结果要落回「发起时那一页」，不能跟着用户后来翻到的页面跑
  GW.addItemsOn = function (page, items, record = true, opts) {
    if (!page) return;
    // 1.7.6 统一模型批量（opts.atomic）：先在「不落任何状态」的前提下算出每条的裁剪结果，
    // 只要有一条会被裁掉或拆段（分页纸框外、笔迹被拆），整批直接失败：
    // 不 insertRaw、不 commit、不 requestRender —— 没有部分插入、没有残留历史。
    // 提交中若抛错，同样回滚已插入的条目。返回可验证的整批结果（ids/count/pageId）。
    // 旧调用方没有传 opts.atomic，走下面的原逻辑且仍返回 undefined，行为完全不变。
    if (opts && opts.atomic) {
      const src = items || [], keepAll = [], dropped = [];
      for (let i = 0; i < src.length; i++) {
        const it = src[i];
        // A3：预检与正式插入用同一条规则 —— 纸框取传入的目标页，不管此刻用户翻到了哪一页
        const keeps = it ? (GW.pageClipItems ? GW.pageClipItems(it, page) : [it]) : [];
        if (keeps.length !== 1 || keeps[0] !== it) {
          dropped.push({ index: i, id: it && it.id, reason: keeps.length ? '会被拆分或改写' : '落在分页纸框外' });
        } else keepAll.push(it);
      }
      if (dropped.length) return { ok: false, pageId: page.id, count: 0, ids: [], dropped };
      try {
        for (const it of keepAll) insertRaw(page, it);
        if (record && keepAll.length) GW.commit({ pageId: page.id, add: keepAll });
      } catch (e) {
        for (const it of keepAll) { try { removeRaw(page, it.id); } catch (_) { /* noop */ } }
        return { ok: false, pageId: page.id, count: 0, ids: [], error: '整批提交失败：' + e.message };
      }
      if (!(opts && opts.painted) && page === GW.page()) requestRender();
      return { ok: true, pageId: page.id, count: keepAll.length, ids: keepAll.map((it) => it.id) };
    }
    // 1.7.5：分页版式下纸外不许加东西 —— 笔迹按纸框裁出纸内段，整条在纸外就丢；
    // 其它对象（图形/文字/卡片）中心落在纸外就丢。按「目标页」的纸框裁，
    // 异步插入落回原目标页时不会因用户翻页而绕过校验（A3）。
    // 撤销/重做与远端操作走 applyOp，不受这里影响。
    const add = [];
    for (const it of items || []) {
      if (!it) continue;
      const keeps = GW.pageClipItems ? GW.pageClipItems(it, page) : [it];
      for (const keep of keeps) {
        if (!keep) continue;
        insertRaw(page, keep);
        add.push(keep);
      }
    }
    if (record && add.length) GW.commit({ pageId: page.id, add });
    if (!(opts && opts.painted) && page === GW.page()) requestRender();
  };
  GW.addItems = function (items, record = true, opts) {
    GW.addItemsOn(GW.page(), items, record, opts);
  };
  GW.removeItems = function (items, record = true, opts) {
    const page = GW.page();
    // 批量删除：先按「删除前」的位置快照索引，否则后面的条目会拿到已经前移的下标，
    // 撤销时顺序就反了（复审 C11）
    for (const it of items) {
      const idx = (page.ink || []).findIndex((x) => x.id === it.id);
      if (idx >= 0) { try { it._index = idx; } catch (e) { /* 只读对象就算了 */ } }
    }
    for (const it of items) removeRaw(page, it.id);
    if (record) GW.commit({ remove: items }, opts);
    requestRender();
  };
  // 1.3.0（R4b）：平板「撤销要多点几次才有响应」——上半段事件改 pointerdown 在 app.js，
  // 这里是栈这一侧的三条路径：
  //   ① 栈顶那条属于已经不在的页面（findPage 找不到）：原来先 pop 再 return，一次点击白丢一条；
  //   ② 栈顶那条不改画面（只动 view/bg/cur 的 op）：点一次画面不动，老师以为没响应又点；
  //   ③ ②③ 一起：最多连跳 5 条不可见的 op，跳完还不可见再算「没有可撤销的操作」。
  const OPAQUE_KEYS = { view: 1, bg: 1, cur: 1 };
  function visibleOp(op) {
    if (!op) return false;
    for (const k in op) if (k !== 'pageId' && !OPAQUE_KEYS[k]) return true;
    return false;
  }
  GW.undo = function () {
    let op = undoStack[undoStack.length - 1];
    if (!op) return GW.toast('没有可撤销的操作');
    // 不属于任何页面的条目：直接丢弃，不动画面（也不再 toast 一次就走）
    let orphan = 0;
    while (op && !findPage(op.pageId)) { undoStack.pop(); orphan++; op = undoStack[undoStack.length - 1]; }
    if (orphan) GW.bus.emit('history');
    if (!op) return GW.toast(orphan ? '那几步在别的页面上，已跳过' : '没有可撤销的操作');
    // 不改画面的条目连跳（view/bg/cur 之类），最多 5 条，避免一次点击毫无反应
    let skip = 0;
    while (op && !visibleOp(op) && skip < 5) { undoStack.pop(); redoStack.push(op); skip++; op = undoStack[undoStack.length - 1]; }
    if (skip) GW.bus.emit('history');
    if (!op) return GW.toast('没有可撤销的操作');
    undoStack.pop();
    applyOp(op, true); redoStack.push(op); GW.bus.emit('history');
    // 1.6.6：撤销可能把选区里的条目删掉了，先把已经不存在的摘出去（见 input.js 的 selection.prune）
    if (GW.selection && GW.selection.prune) GW.selection.prune();
    if (GW.syncEmit) GW.syncEmit(inverseOp(op));
  };
  GW.redo = function () {
    let op = redoStack[redoStack.length - 1];
    if (!op) return GW.toast('没有可重做的操作');
    let skip = 0;
    while (op && !visibleOp(op) && skip < 5) { redoStack.pop(); undoStack.push(op); skip++; op = redoStack[redoStack.length - 1]; }
    if (skip) GW.bus.emit('history');
    if (!op) return GW.toast('没有可重做的操作');
    redoStack.pop();
    applyOp(op, false); undoStack.push(op); GW.bus.emit('history');
    // F27：重做同样会用新实体替换页面里的对象，选区也要按 id 重绑，否则接着改色落到旧实体上
    if (GW.selection && GW.selection.prune) GW.selection.prune();
    if (GW.syncEmit) GW.syncEmit(op);
  };
  GW.canUndo = () => undoStack.length > 0;
  GW.canRedo = () => redoStack.length > 0;
  GW.clearHistory = () => { undoStack.length = 0; redoStack.length = 0; GW.bus.emit('history'); };
  // 探针用的只读/注入口（probe-undo-click）：栈长在闭包里，外面看不到；
  // 「页面已不在的孤儿 op」「只改 view 的 op」这两种坏条目现在也没有生产入口，
  // 只能靠探针自己注入才能验「连点几次才有反应」的两条路径。不影响应用行为。
  GW.__hist = {
    stats: () => ({ undo: undoStack.length, redo: redoStack.length }),
    push: (op) => { undoStack.push(op); GW.bus.emit('history'); },
  };

  function markDirty() {
    doc.dirty = true;
    // 1.6.8（R11）：文档修订号 —— 页面抽屉的缩略图缓存按它失效，打开/关闭抽屉不再重画。
    doc.rev = (doc.rev || 0) + 1;
    GW.bus.emit('dirty');
  }
  GW.markDirty = markDirty;

  // ---------- 页面 ----------
  GW.gotoPage = function (i) {
    i = GW.clamp(i, 0, doc.pages.length - 1);
    const old = GW.page();
    // 1.7.12：换页不再销毁重对象（网页课件 / 视频 / Flash），改停车后原样挂回。
    // 以前这里 unmountAll()，网页课件的 iframe 被导航到 about:blank 再重建，
    // 大课件第二次加载会把渲染进程转死 —— 老师看到的就是「翻到这一页就卡死」。
    if (GW.objects.parkAll) GW.objects.parkAll(); else GW.objects.unmountAll();
    doc.cur = i;
    const p = GW.page();
    for (const o of p.objs) GW.objects.mount(o);
    if (GW.applyTeacherAnnot) GW.applyTeacherAnnot(true);   // 1.7.0（T15）：换页后按开关重算可见性
    view.tx = p.view.tx; view.ty = p.view.ty; view.s = p.view.s;
    GW.bus.emit('page', { from: old, to: p });
    GW.bus.emit('view', view);
    requestRender();
  };
  GW.addPage = function (afterIndex) {
    // T05：浏览器配额已满时拦住「新建页」（返回 undefined，不 throw）
    if (GW.quotaGuard && GW.quotaGuard('新建页面')) return;
    const p = newPage();
    p.bg = Object.assign({}, GW.page().bg);
    const at = afterIndex == null ? doc.cur + 1 : afterIndex + 1;
    doc.pages.splice(at, 0, p);
    markDirty();
    GW.gotoPage(at);
    GW.syncDoc();
  };
  // 1.6.7（T09）：整页模板 = 页面底纹版式（借 Notability「整页纸」的思路，
  // 但底纹本来就在渲染里，所以只多一层「新建时选版式」的入口，不另造一套纸）。
  GW.PAGE_TPL = [
    { id: 'plain',   name: '空白页',   bg: { color: 'white', material: 'none', pattern: 'none' } },
    { id: 'lined',   name: '横线纸',   bg: { color: 'white', material: 'none', pattern: 'lines' } },
    { id: 'grid',    name: '方格纸',   bg: { color: 'white', material: 'none', pattern: 'grid' } },
    { id: 'coord',   name: '坐标纸',   bg: { color: 'white', material: 'none', pattern: 'coord' } },
    { id: 'dots',    name: '点阵纸',   bg: { color: 'white', material: 'none', pattern: 'dots' } },
    { id: 'dark',    name: '黑板页',   bg: { color: 'green', material: 'grad', pattern: 'none' } }
  ];
  GW.addPageWith = function (tplId, name, afterIndex) {
    if (GW.quotaGuard && GW.quotaGuard('新建页面')) return;
    const tpl = GW.PAGE_TPL.find((t) => t.id === tplId) || GW.PAGE_TPL[0];
    const p = newPage();
    p.bg = Object.assign({}, tpl.bg);
    if (name) p.name = name;
    const at = afterIndex == null ? doc.cur + 1 : afterIndex + 1;
    doc.pages.splice(at, 0, p);
    markDirty();
    GW.gotoPage(at);
    GW.syncDoc();
    return p;
  };
  // 把当前页换成某个版式（底纹是页面属性，不进撤销栈 —— 和「背景底纹」面板的行为一致）
  GW.applyPageTpl = function (tplId) {
    const tpl = GW.PAGE_TPL.find((t) => t.id === tplId);
    if (!tpl) return false;
    const p = GW.page();
    p.bg = Object.assign({}, tpl.bg);
    markDirty();
    GW.syncDoc();
    // 2.0.7（R3）：底纹是背景层的内容，换完必须显式重画背景（快速通道只做 CSS 拉伸）
    if (GW.repaintBg) GW.repaintBg();
    requestRender();
    return true;
  };
  // 1.6.9：内容型整页模板 —— 不是「换纸」，是「一页现成的板书」。
  // 借 Notability 22 个 .ntb 模板的做法（模板 = 带内容的成品页），但这边只做课堂最常用的三种：
  // 板书页眉、座位表、小组积分表。一律用文本对象 + 内联样式的表格实现，
  // 不新增对象种类、不动 .gewu 格式：落盘就是普通文本对象，老师可以直接改字。
  const TBL = 'border-collapse:collapse;width:100%;font-size:14px';
  const TD = 'border:1px solid rgba(60,72,88,.55);padding:7px 9px';
  const TH = TD + ';background:rgba(15,157,138,.12);font-weight:700';
  GW.CONTENT_TPL = [
    {
      id: 'header', name: '板书页眉', desc: '标题 + 日期/班级/科目',
      w: 794, h: 1123,
      objs: [
        { x: -300, y: -190, w: 600, h: 64, size: 34, html: '课题名称' },
        { x: -300, y: -116, w: 600, h: 34, size: 15, html: '班级：______　　科目：______　　日期：______' },
        { x: -300, y: -74, w: 600, h: 30, size: 15, html: '学习目标：1. 　　2. 　　3. ' },
      ],
    },
    {
      id: 'seating', name: '座位表', desc: '6 列 × 6 排，讲台在上', w: 794, h: 1123,
      objs: [
        { x: -260, y: -260, w: 520, h: 36, size: 16, html: '<b>讲　台</b>' },
        {
          x: -260, y: -216, w: 520, h: 460, size: 13,
          html: '<table style="' + TBL + '">' + Array.from({ length: 6 }, () =>
            '<tr>' + Array.from({ length: 6 }, () => '<td style="' + TD + ';height:64px">&nbsp;</td>').join('') + '</tr>').join('') + '</table>',
        },
      ],
    },
    {
      id: 'score', name: '小组积分表', desc: '5 组 × 5 项', w: 794, h: 1123,
      objs: [
        { x: -300, y: -200, w: 600, h: 40, size: 18, html: '<b>小组积分表</b>' },
        {
          x: -300, y: -152, w: 600, h: 300, size: 14,
          html: '<table style="' + TBL + '"><tr>' +
            ['小组', '发言', '板演', '合作', '总分'].map((h) => '<th style="' + TH + '">' + h + '</th>').join('') +
            '</tr>' + Array.from({ length: 5 }, (_, i) =>
              '<tr><td style="' + TD + '">第 ' + (i + 1) + ' 组</td>' +
              Array.from({ length: 4 }, () => '<td style="' + TD + ';height:42px">&nbsp;</td>').join('') + '</tr>').join('') +
            '</table>',
        },
      ],
    },
  ];
  // 新建一页并把模板内容摆到这一页的正中。每个对象各记一条历史（撤销会逐个撤掉，
  // 与「插入图形模板」的手感一致）；底纹是页面属性，照旧不进撤销栈。
  // 1.7.5：套整页模板后按 GoodNotes 的页面走 —— ①背景/纸张沿用当前页（模板只带内容）；
  // ②画布从无限切成有限：page.box = 模板原始尺寸（模板可自带 w/h，缺省 A4），
  // ③自动缩放到「整页可见」。以后新增模板只要写 w/h 就自动生效。
  // 2.0.7（R2）：内容模板对象默认**锁定位置**。以前不置 locked ⇒ .obj 接收指针事件，
  // 而这三块模板正好铺满主要书写区，input.js 的 stage pointerdown 命中 .obj 直接 return，
  // 老师在座位表上根本落不下笔，只能双击改字。locked 之后 layout() 自动加 pe-through：
  // 内容区穿透（可以写字），标题栏仍可点（双击标题栏解锁/拖动）。
  // data-tpl="1" 供 C1「模板锁定」开关批量切换。
  function tplObjs(tpl) {
    let objs = tpl.objs;
    if (typeof tpl.build === 'function') {
      // K 是**绑定到这一页尺寸**的实例（比例坐标 → 居中坐标），不是全局那个工厂
      try {
        const W = tpl.w || A4W, H = tpl.h || A4H;
        objs = tpl.build(GW.TPL_KIT && GW.TPL_KIT.of ? GW.TPL_KIT.of(W, H) : {});
      } catch (e) { console.error(e); objs = []; }
    }
    objs = (objs || []).slice(0, 12);        // 单模板对象数上限 12：页面 DOM 对象不能失控
    const zones = Array.isArray(tpl.zones) ? tpl.zones : [];
    for (const z of zones) {
      objs.push({ x: z.x, y: z.y, w: z.w, h: z.h, size: z.size || 16,
        html: z.ph ? '<span style="opacity:.55">' + z.ph + '</span>' : '', zone: 1 });
    }
    return objs;
  }
  GW.tplObjs = tplObjs;
  GW.addPageContent = function (tplId) {
    const tpl = GW.CONTENT_TPL.find((t) => t.id === tplId);
    if (!tpl || !GW.objects) return null;
    const src = GW.page();
    const p = GW.addPageWith('plain', tpl.name);
    // ① 背景不动：把当前页的底色与纸张版式原样搬过来
    if (src && src.bg) p.bg = Object.assign({}, src.bg);
    if (src && src.paper) p.paper = src.paper;
    if (src && src.paperCfg) p.paperCfg = Object.assign({}, src.paperCfg);
    // ② 有限画布：页面大小 = 模板原始尺寸（横版模板自带 h<w），页面中心放在世界原点
    const W = tpl.w || A4W, H = tpl.h || A4H;
    p.box = { x: -W / 2, y: -H / 2, w: W, h: H };
    const objs = tplObjs(tpl);
    for (const o of objs) {
      const it = GW.objects.create('text', { html: o.html, size: o.size || 16, tpl: 1 }, {
        x: o.x, y: o.y, w: o.w, h: o.h, exact: true, locked: true,
      });
      if (it) { it.tpl = 1; it.zone = o.zone || 0; }
    }
    // ③ 切成有限画布并缩放到整页可见
    if (GW.enterPaged) GW.enterPaged(true);
    else if (GW.requestRender) GW.requestRender();
    return p;
  };
  // T04：页面级回收站 —— 删除只是移进 doc.trash（上限 20，丢最旧），可恢复原位置。
  GW.deletePage = function (i) {
    i = GW.clamp(i, 0, doc.pages.length - 1);
    const p = doc.pages[i];
    if (!p) return;
    if (!Array.isArray(doc.trash)) doc.trash = [];
    // 只留一页时下面要就地清空，快照一份，别让回收站和活页共享同一对象。
    const only = doc.pages.length <= 1;
    const entry = only
      ? JSON.parse(JSON.stringify(Object.assign({}, p, {
        ink: p.ink.map(GW.strip), objs: p.objs.map(GW.strip),
        geo: (p.geo || []).map((g) => Object.assign({}, g)),
      })))
      : p;
    doc.trash.unshift({ page: entry, at: Date.now(), index: i });
    if (doc.trash.length > 20) doc.trash.length = 20;
    if (only) { GW.objects.unmountAll(); p.ink = []; p.objs = []; p.geo = []; markDirty(); GW.clearHistory(); GW.gotoPage(0); GW.syncDoc(); return; }
    doc.pages.splice(i, 1);
    if (doc.cur >= doc.pages.length) doc.cur = doc.pages.length - 1;
    markDirty();
    GW.clearHistory();
    GW.objects.unmountAll();
    GW.gotoPage(Math.min(i, doc.pages.length - 1));
    GW.syncDoc();
  };

  // ---------------- 1.6.8（R12）：渲染耗时埋点 + 回前台补画 ----------------
  // 只在 GW.settings.debugPerf 打开时记数（默认关，零开销）；探针打开它来量「一帧花在哪」。
  const perfBusy = {};
  function markPerf(name, t0) {
    const dt = performance.now() - t0;
    const a = perfBusy[name] || (perfBusy[name] = { n: 0, ms: 0 });
    a.n++; a.ms += dt;
  }
  GW.perfMark = markPerf;
  GW.perfPeek = function () {
    if (!GW.settings || !GW.settings.debugPerf) return {};
    const out = {};
    for (const k in perfBusy) {
      const a = perfBusy[k];
      out[k] = { n: a.n, ms: Math.round(a.ms * 10) / 10, avg: Math.round((a.ms / a.n) * 100) / 100 };
    }
    return out;
  };
  GW.perfReset = function () { for (const k in perfBusy) delete perfBusy[k]; };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { requestRender(); requestLive(); }
  });
})();


