/* 图形面板「所见即所得」缩略图（2.0.9）
 * ============================================================================
 * 背景：图形面板以前每个格子画的是图形定义里的 `icon` —— 一段 24×24 的手绘 SVG 线稿。
 * 图少时够用，现在物理页光「电磁」就有 23 张，只看线稿和名字根本分不清「洛伦兹力」和
 * 「有界磁场偏转」，也看不出插进画布之后有没有刻度、箭头、标注。
 *
 * 做法：不另画一套图标，直接走**真实渲染管线** —— 造一个和插入时同参数的临时对象，
 * 丢进一个一次性页面，交给 GW.renderThumb（board.js:2479）按画布底色铺底、自动取内容
 * 包围盒、等比铺满，最后 toDataURL。因此缩略图里的几何、线宽、标注、填充、虚线、
 * 底色全部是「插进去之后的样子」，包括以后新增的图形也不需要再画图标。
 *
 * 与既有 `thumbSrc`（app.js:2321，数学图形专用）的关系：
 *   · thumbSrc 走的是「只要轮廓的绿色简笔画」，那是为了和 SVG 图标观感统一；
 *   · 本模块走的是「本色渲染」，数学页仍用 thumbSrc（不改），物理/模板/化生页用本模块。
 * ==========================================================================*/
'use strict';
(function () {
  const GW = window.GW || (window.GW = {});
  if (GW.shapeThumbs) return;

  /* 缩略图的世界尺寸与画布尺寸。
     世界框不能太小：physshapes 里有 61 个图形带 `if (b.w < N || b.h < N) return;` 的最小
     尺寸守卫，阈值最大到 160 —— 框比它小就直接不画，缩略图会是一张空白底。240×180 覆盖
     了全部守卫阈值，同时比例接近 4:3（与抽屉里点卡片插入的 400×300 同比例）。 */
  const BOX_W = 240, BOX_H = 180;
  /* 画布 3 倍超采样：52×39 的 CSS 位置出 156×117 的位图，Retina / 高分屏下不糊。 */
  const OUT_W = 156, OUT_H = 117;
  /* 描边补偿。按真实线宽 3 直接缩到 0.585 倍，屏幕上只剩 1.7 个设备像素 ≈ 0.6 CSS px，
     比原来的 SVG 图标（1.8）还细，等于白做。这里把世界线宽抬到 6，渲染后约 1.2 CSS px，
     观感接近旧图标；几何、比例、标注位置一律不动 —— 只动这一根笔的粗细。 */
  const STROKE = 6;
  /* 动画图形的定格时刻。t=0 时抛体还在起点、轨迹是空的，缩略图会像「没画出来」；
     0.6s 是上游 P.draw 里 ANIM_T 的取值，同样是为了让第一眼看到的是「有内容的一帧」。 */
  const ANIM_T = 0.6;

  const CACHE = new Map();
  const MISS = new Set();

  function pageBg() {
    try {
      const p = GW.page && GW.page();
      if (p && p.bg && p.bg.color) return p.bg.color;
    } catch (e) { /* 还没建文档 */ }
    return '#ffffff';
  }
  function penOf(bg) {
    try {
      const t = GW.bgTheme && GW.bgTheme(bg);
      if (t && t.pen) return t.pen;
    } catch (e) { /* 忽略 */ }
    return '#1b2433';
  }

  /* 解析 key 属于哪套库。顺序即优先级，与面板里的呈现顺序一致：
     physShapes（物理/化学/生物/基础标注）→ stencils（学科模板）。 */
  function resolve(key) {
    if (!key) return null;
    const PS = GW.physShapes;
    if (PS && PS.shapes && PS.shapes[key] && PS.shapes[key].draw) return { kind: 'pb', key: key };
    const list = GW.stencils && GW.stencils.list;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === key && typeof list[i].make === 'function') return { kind: 'stk', key: key, def: list[i] };
      }
    }
    return null;
  }

  /* 造临时对象：参数口径与真实插入保持一致（P.make 是「抽屉里点卡片」用的同一个工厂），
     唯一的两处刻意偏离写在 STROKE / ANIM_T 的注释里。 */
  function build(r, bg) {
    const color = penOf(bg);
    if (r.kind === 'pb') {
      const PS = GW.physShapes;
      const opt = { color: color, width: STROKE };
      const it = PS.make(r.key, 0, 0, BOX_W, BOX_H, opt);
      if (!it) return null;
      it.width = STROKE; it.size = STROKE;
      const d = PS.shapes[r.key];
      if (d && d.animatable) { it.animT = ANIM_T; it.animPlaying = false; }
      return it;
    }
    // 学科模板：make() 产出 { type:'multi', parts/segs, width, fill }，这里补上对象头字段。
    const o = r.def.make(0, 0, BOX_W, BOX_H) || {};
    const it = Object.assign({}, o);
    it.id = (GW.uid && GW.uid()) || ('th' + Math.random().toString(36).slice(2, 8));
    it.kind = 'shape';
    it.type = it.type || 'multi';
    it.color = color;
    it.width = STROKE;
    return it;
  }

  /** 取某个图形的缩略图 dataURL；不认识或渲染失败返回空串（调用方回落 SVG 图标）。 */
  GW.shapeThumbs = {
    src: function (key) {
      if (!key || MISS.has(key)) return '';
      const bg = pageBg();
      const ck = key + '|' + bg;
      const hit = CACHE.get(ck);
      if (hit !== undefined) return hit;
      let src = '';
      try {
        const r = resolve(key);
        if (r) {
          const it = build(r, bg);
          if (it && GW.renderThumb) {
            // renderThumb 会按 page.bg 铺底、取 contentBounds 等比铺满（留 5% 气口），
            // 所以缩略图自带画布底色 —— 老师看到的就是「贴到这张画布上的效果」。
            const page = { bg: { color: bg }, ink: [it], objs: [], geo: [] };
            const cv = GW.renderThumb(page, OUT_W, OUT_H);
            src = cv.toDataURL('image/png');
          }
        }
      } catch (e) {
        src = '';
      }
      if (!src) MISS.add(key);
      CACHE.set(ck, src);
      return src;
    },
    /** 换底色 / 换主题后调用（缓存键已含底色，通常不需要）。 */
    invalidate: function () { CACHE.clear(); MISS.clear(); },
    /** 探针用：已缓存 / 未命中统计。 */
    stats: function () {
      let ok = 0, empty = 0;
      CACHE.forEach(function (v) { if (v) ok++; else empty++; });
      return { cached: CACHE.size, ok: ok, empty: empty, missing: MISS.size };
    },
  };
  // 探针钩子：scripts/probe-shape-thumbs.js 用它逐个核验「有没有内容、有没有被裁」。
  GW._shapeThumb = GW.shapeThumbs.src;
})();
