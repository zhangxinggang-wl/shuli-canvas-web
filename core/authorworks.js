/* 数理无限画布 · 作者个人作品合集（1.1.17）
 *
 * 内容全部固化在 core/works-data.js（由 scripts/build-works-data.js 从 docs/作者作品源文件/ 生成），
 * 磁盘上没有任何可单独复制的课件文件 —— 这就是「不能直接导出」的实现方式：
 *   · 资源库里只有卡片，没有「打开文件夹 / 导出」按钮；
 *   · 打开走近全屏浮层，正文在 blob URL 里跑，右下角固定作者个人水印；
 *   · 插入画布时对象只记 work id（data.work），保存 .gewu 也不把作品正文带出去。
 *
 * 添加新作品：只往 core/works-data.js 末尾追加一条（或往 docs/作者作品源文件/ 加源文件 +
 * 清单末尾追加一条后重跑生成脚本），不改动任何已有代码；作品正文一律原样使用，
 * 唯一允许的增补是浮层上的个人水印。
 *
 * 1.1.17 收尾：3D 作品的 three.js 由生成器抽进 core/works-engine.js（GW.AUTHOR_ENGINES）只存一份，
 * 正文里留占位符，这里 url() 时填回去；引擎缺失时给出提示而不是白屏。
 */
(function () {
  'use strict';
  const GW = window.GW;

  const urlCache = Object.create(null);
  const all = () => GW.AUTHOR_WORKS || [];
  const get = (id) => all().find((w) => w.id === id) || null;

  // 引擎占位符（与 scripts/build-works-data.js 里的 MARK_A / MARK_B 必须一致）。
  // 3D 作品的正文出厂时内联过整份 three.js，生成器把它抽进 works-engine.js 只存一份，
  // 正文里留下这个标记；这里打开时填回去 —— 引擎不进启动解析，也不重复占体积。
  const MARK_A = '/*__GW_ENGINE:';
  const MARK_B = '__*/';
  const engineText = (key) => {
    const e = (GW.AUTHOR_ENGINES || {})[key];
    return typeof e === 'string' ? e : '';
  };
  // 占位符换真引擎：用 split/join 而不是 replace，免得引擎源码里的 $& $1 被当成替换模式
  function bodyOf(w) {
    const html = String(w.html || '');
    if (!w.engine) return html;
    const src = engineText(w.engine);
    if (!src) return '';
    return html.split(MARK_A + w.engine + MARK_B).join(src);
  }
  const missing = (w) => (w.engine && !engineText(w.engine)) ? ('这件作品的引擎没装进来：' + w.engine) : '';

  // blob: 由画板页自己创建 ⇒ 与画板同源，作品里的脚本照常跑；地址只在本进程有效，所以不落盘
  function url(id) {
    if (urlCache[id]) return urlCache[id];
    const w = get(id);
    if (!w) return '';
    if (typeof URL === 'undefined' || !URL.createObjectURL) return '';
    const html = bodyOf(w);
    if (!html) return '';
    urlCache[id] = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    return urlCache[id];
  }

  GW.authorWorks = {
    list: () => all().slice(),
    get: get,
    url: url,
    // 近全屏打开（与学科库的整页课件同一个浮层，水印更大更醒目）
    open(id) {
      const w = get(id);
      if (!w) return GW.toast('这件作品不在合集里：' + id);
      if (missing(w)) return GW.toast(missing(w));
      if (!GW.htmlFull) return GW.toast('浮层还没就绪');
      return GW.htmlFull(url(id), w.title, { work: id });
    },
    // 插入画布：只记 id，正文运行时还原（.gewu 里不会出现作品源码）
    insert(id) {
      const w = get(id);
      if (!w) return GW.toast('这件作品不在合集里：' + id);
      if (missing(w)) return GW.toast(missing(w));
      return GW.objects.create('web', { work: id, title: w.title, preset: 'anim' }, {});
    },
  };
})();
