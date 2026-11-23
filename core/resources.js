/* 数理无限画布 · 资源库：PhET、GeoGebra、Desmos、Falstad 等知名教学资源（可离线缓存） */
(function () {
  'use strict';
  const GW = window.GW;

  // [id, 中文名, 分组, 是否有中文版]（1.0.9 补全：取自 PhET 官方公共元数据，共 131 个 HTML5 仿真；
  // 中文名优先用官方 zh_CN 标题，没有官方译名的用社区常用译名）
  const PHET = [
    // 力学
    ['collision-lab', '碰撞实验室', '力学', 1], ['energy-skate-park', '能量滑板公园', '力学', 1], ['forces-and-motion-basics', '力与运动基础', '力学', 1],
    ['friction', '摩擦力', '力学', 1], ['gravity-and-orbits', '引力与轨道', '力学', 1], ['balancing-act', '平衡探究实验', '力学', 1],
    ['buoyancy', '浮力', '力学', 0], ['buoyancy-basics', '浮力：基础', '力学', 0], ['density', '密度', '力学', 1],
    ['energy-skate-park-basics', '能量滑板竞技场: 基础', '力学', 1], ['gravity-force-lab', '万有引力实验室', '力学', 1], ['gravity-force-lab-basics', '引力实验室：基础', '力学', 1],
    ['hookes-law', '胡克定律', '力学', 1], ['keplers-laws', '开普勒定律', '力学', 1], ['masses-and-springs', '弹簧振子', '力学', 1],
    ['masses-and-springs-basics', '质量与弹簧：基础', '力学', 1], ['my-solar-system', '我的太阳系', '力学', 1], ['pendulum-lab', '单摆实验室', '力学', 1],
    ['projectile-motion', '抛体运动', '力学', 1], ['under-pressure', '压强', '力学', 1], ['vector-addition', '矢量加法', '力学', 1],
    // 振动与波
    ['sound-waves', '声波', '振动与波', 1],
    ['fourier-making-waves', '傅里叶：合成波', '振动与波', 0], ['wave-interference', '波的干涉', '振动与波', 1], ['wave-on-a-string', '绳上的波', '振动与波', 1],
    ['waves-intro', '波的入门', '振动与波', 1], ['normal-modes', '简正模式', '振动与波', 0],
    // 电磁学
    ['charges-and-fields', '电荷与电场', '电磁学', 1], ['faradays-law', '法拉第定律', '电磁学', 1], ['balloons-and-static-electricity', '气球与静电', '电磁学', 1],
    ['capacitor-lab-basics', '电容器实验室', '电磁学', 1], ['circuit-construction-kit-ac', '交流电路搭建', '电磁学', 1], ['circuit-construction-kit-ac-virtual-lab', '交流虚拟实验室', '电磁学', 1],
    ['circuit-construction-kit-dc', '直流电路搭建', '电磁学', 1], ['circuit-construction-kit-dc-virtual-lab', '电路组建实验:直流虚拟实验室', '电磁学', 1], ['coulombs-law', '库仑定律', '电磁学', 1],
    ['faradays-electromagnetic-lab', '法拉第电磁实验室', '电磁学', 1], ['generator', '发电机', '电磁学', 1], ['john-travoltage', '静电电压', '电磁学', 1],
    ['magnet-and-compass', '磁铁与指南针', '电磁学', 1], ['magnets-and-electromagnets', '磁铁与电磁铁', '电磁学', 1], ['ohms-law', '欧姆定律', '电磁学', 1],
    ['resistance-in-a-wire', '导线电阻', '电磁学', 1],
    // 光学
    ['bending-light', '光的折射', '光学', 1], ['color-vision', '色觉', '光学', 1], ['geometric-optics', '几何光学', '光学', 1],
    ['geometric-optics-basics', '几何光学基础', '光学', 1],
    // 热学与近代物理
    ['blackbody-spectrum', '黑体辐射', '热学与近代物理', 1], ['build-an-atom', '构建原子', '热学与近代物理', 1], ['energy-forms-and-changes', '能量的形式与转化', '热学与近代物理', 1],
    ['alpha-decay', 'α 衰变', '热学与近代物理', 0], ['atomic-interactions', '原子的相互作用', '热学与近代物理', 1], ['beta-decay', 'β 衰变', '热学与近代物理', 0],
    ['build-a-nucleus', '构建原子核', '热学与近代物理', 0], ['diffusion', '扩散', '热学与近代物理', 1], ['gas-properties', '气体性质', '热学与近代物理', 1],
    ['gases-intro', '气体基础', '热学与近代物理', 1], ['greenhouse-effect', '温室效应', '热学与近代物理', 1], ['isotopes-and-atomic-mass', '同位素和原子的质量', '热学与近代物理', 1],
    ['models-of-the-hydrogen-atom', '氢原子模型', '热学与近代物理', 1], ['molecules-and-light', '分子与光', '热学与近代物理', 1], ['quantum-measurement', '量子测量', '热学与近代物理', 0],
    ['quantum-coin-toss', '量子硬币', '热学与近代物理', 0], ['quantum-wave-interference', '量子波干涉（电子衍射）', '热学与近代物理', 0], ['rutherford-scattering', '卢瑟福散射', '热学与近代物理', 1],
    ['states-of-matter', '物质的状态', '热学与近代物理', 1], ['states-of-matter-basics', '物质状态：基础', '热学与近代物理', 1],
    // 数学
    ['arithmetic', '四则运算', '数学', 1], ['calculus-grapher', '微积分绘图', '数学', 0], ['curve-fitting', '曲线拟合', '数学', 1],
    ['area-builder', '区域建造者', '数学', 1], ['area-model-algebra', '面积模型代数', '数学', 1], ['area-model-decimals', '面积模型：小数', '数学', 1],
    ['area-model-introduction', '面积模型入门', '数学', 1], ['area-model-multiplication', '面积模型乘法', '数学', 1], ['build-a-fraction', '构建一个分数', '数学', 1],
    ['center-and-variability', '集中趋势与离散程度', '数学', 0], ['equality-explorer', '等式探索', '数学', 1], ['equality-explorer-basics', '等式探索:基础', '数学', 1],
    ['equality-explorer-two-variables', '等式探索:两个变量', '数学', 1], ['expression-exchange', '表达式变换', '数学', 1], ['fraction-matcher', '分数配对', '数学', 1],
    ['fractions-equality', '分数：等式', '数学', 1], ['fractions-intro', '分数：入门', '数学', 1], ['fractions-mixed-numbers', '分数：带分数', '数学', 1],
    ['function-builder', '函数构造器', '数学', 1], ['function-builder-basics', '函数构造器:基础', '数学', 1], ['graphing-lines', '直线的图像', '数学', 1],
    ['graphing-quadratics', '二次函数图像', '数学', 1], ['graphing-slope-intercept', '斜截式', '数学', 1], ['least-squares-regression', '最小二乘回归', '数学', 1],
    ['make-a-ten', '凑十', '数学', 1], ['mean-share-and-balance', '平均数：分享与均衡', '数学', 0], ['number-compare', '数的比较', '数学', 1],
    ['number-line-distance', '数轴：距离', '数学', 1], ['number-line-operations', '数轴：运算', '数学', 1], ['number-line-integers', '数轴：整数', '数学', 1],
    ['number-pairs', '数对', '数学', 0], ['number-play', '数字游戏', '数学', 1], ['plinko-probability', '高尔顿板概率', '数学', 1],
    ['projectile-data-lab', '抛体数据实验室', '数学', 0], ['projectile-sampling-distributions', '抛体运动的抽样分布', '数学', 0], ['proportion-playground', '比例游乐场', '数学', 1],
    ['quadrilateral', '四边形', '数学', 0], ['ratio-and-proportion', '比率和比例', '数学', 1], ['trig-tour', '三角函数之旅', '数学', 1],
    ['unit-rates', '单位价格', '数学', 1], ['vector-addition-equations', '向量加法方程', '数学', 1],
    // 化学
    ['balancing-chemical-equations', '配平化学方程式', '化学', 1], ['acid-base-solutions', '酸碱溶液', '化学', 1], ['beers-law-lab', '比尔定律实验', '化学', 1],
    ['build-a-molecule', '创造一个分子', '化学', 1], ['concentration', '浓度', '化学', 1], ['membrane-transport', '膜转运', '化学', 1],
    ['molarity', '摩尔浓度', '化学', 1], ['molecule-polarity', '分子极性', '化学', 1], ['molecule-shapes', '分子形状', '化学', 1],
    ['molecule-shapes-basics', '分子形状:基础', '化学', 1], ['ph-scale', 'pH 标度', '化学', 1], ['ph-scale-basics', 'pH 标度：基础', '化学', 1],
    ['reactants-products-and-leftovers', '反应物，生成物及未反应物', '化学', 1],
    // 生物
    ['gene-expression-essentials', '基因表达基础', '生物', 1], ['natural-selection', '自然选择（物竞天择）', '生物', 1], ['neuron', '神经元', '生物', 1],
  ];
  const phetUrl = (id, zh) => `https://phet.colorado.edu/sims/html/${id}/latest/${id}_${zh ? 'zh_CN' : 'en'}.html`;
  const phetThumb = (id) => `https://phet.colorado.edu/sims/html/${id}/latest/${id}-128.png`;

  const WEB_TOOLS = [
    { name: 'Desmos 图形计算器', url: 'https://www.desmos.com/calculator?lang=zh-CN', desc: '最好用的在线函数作图', group: '数学' },
    { name: 'Desmos 3D', url: 'https://www.desmos.com/3d?lang=zh-CN', desc: '三维曲面与立体图形', group: '数学' },
    { name: 'Desmos 几何', url: 'https://www.desmos.com/geometry?lang=zh-CN', desc: '尺规作图与几何证明', group: '数学' },
    { name: 'Desmos 科学计算器', url: 'https://www.desmos.com/scientific?lang=zh-CN', desc: '', group: '数学' },
    { name: 'Desmos 矩阵', url: 'https://www.desmos.com/matrix?lang=zh-CN', desc: '', group: '数学' },
    { name: 'Wolfram|Alpha', url: 'https://www.wolframalpha.com/', desc: '计算知识引擎：解方程、积分', group: '数学' },
    { name: 'Falstad 电路模拟', url: 'https://www.falstad.com/circuit/circuitjs.html', desc: '动态电流的电路仿真（含交流、电容、电感）', group: '物理' },
    { name: 'Falstad 波纹槽', url: 'https://www.falstad.com/ripple/', desc: '水波干涉、衍射、多普勒', group: '物理' },
    { name: 'Falstad 三维电场', url: 'https://www.falstad.com/vector3de/', desc: '三维静电场可视化', group: '物理' },
    { name: 'Falstad 电磁波', url: 'https://www.falstad.com/emwave2/', desc: '二维电磁波传播', group: '物理' },
    { name: 'Falstad 量子力学', url: 'https://www.falstad.com/qm1d/', desc: '一维势阱中的薛定谔方程', group: '物理' },
    { name: 'oPhysics 交互物理', url: 'https://ophysics.com/', desc: '大量物理交互演示（GeoGebra 制作）', group: '物理' },
    { name: 'The Physics Classroom', url: 'https://www.physicsclassroom.com/Physics-Interactives', desc: '物理交互动画', group: '物理' },
    { name: 'myPhysicsLab', url: 'https://www.myphysicslab.com/', desc: '刚体、碰撞、弹簧等力学仿真', group: '物理' },
    { name: 'Stellarium 星空', url: 'https://stellarium-web.org/', desc: '在线天文馆', group: '物理' },
    { name: 'PhET 中文官网', url: 'https://phet.colorado.edu/zh_CN/', desc: '浏览全部 PhET 仿真', group: '综合' },
    { name: 'GeoGebra 资源库', url: 'https://www.geogebra.org/materials', desc: '数百万个现成的课件，可搜索中文', group: '综合' },
    { name: '国家中小学智慧教育平台', url: 'https://basic.smartedu.cn/', desc: '教材、课程、实验视频', group: '综合' },
    { name: 'Excalidraw 手绘白板', url: 'https://excalidraw.com/', desc: '', group: '综合' },
  ];

  // ---------- 离线缓存（跨端） ----------
  // 三端各有各的落盘方式，一律按「函数在不在」探测，不判 GW.isElectron：
  //   ① 桌面：window.gewu.cacheUrl / cached（主进程下到 <userData>/offline/，返回磁盘路径，
  //      web 对象走 data.path → GW.fileURL 打开，.gewu 里存的是真文件路径）。
  //   ② 浏览器 / 安卓 https：Cache API。存的是「我们自己写进去的一份 HTML 文本」，
  //      键是同源伪造 URL（跨域页面拿不到可读响应体，直接 cache.addAll 会抛 CORS，
  //      所以先 fetch 取文本再 put）。打开时读回文本做 Blob URL，交给 web 对象显示。
  //   ③ 安卓 file:// / 受限 WebView：caches 本身会抛 SecurityError ⇒ 全部 try/catch，
  //      抛了就当没有这条缓存路径，回落到「直接联网」。缓存绝不能成为打开课件的拦路虎。
  const RES_CACHE = 'gewu-res-v1';
  const RES_KEY_BASE = 'https://gewu-res.invalid/v1/';
  const resKey = (url) => RES_KEY_BASE + encodeURIComponent(url);
  const resTexts = Object.create(null);   // 资源 URL → 缓存下来的 HTML 文本（本会话内）
  const resBlobs = Object.create(null);   // 资源 URL → Blob URL（本会话内，objects.js 会用）
  function hasCacheApi() {
    try { return typeof caches !== 'undefined' && !!caches && typeof caches.open === 'function'; } catch (_) { return false; }
  }
  function hasDesktopCache() {
    const g = window.gewu;
    return !!(g && typeof g.cacheUrl === 'function' && typeof g.cached === 'function');
  }
  // 从 Cache API 读回 HTML 文本；没缓存 / 读不出来 / 这设备压根没 Cache API 都返回 ''
  async function resRead(url) {
    if (resTexts[url]) return resTexts[url];
    if (!hasCacheApi()) return '';
    try {
      const c = await caches.open(RES_CACHE);
      // F19：读写键统一到 resKey(url)。旧版 2a 分支用 addAll([url]) 存的是**原 URL**，
      // 那些机器上升级后会读不到；所以读时两种键都试（先新键，再兼容旧键）。
      const hit = (await c.match(resKey(url))) || (await c.match(url));
      if (!hit) return '';
      const text = await hit.text();
      if (!text) return '';
      resTexts[url] = text;
      return text;
    } catch (_) { return ''; }
  }
  // 给 web 对象用的 Blob URL；没缓存返回 ''
  async function resBlobUrl(url) {
    if (resBlobs[url]) return resBlobs[url];
    const text = await resRead(url);
    if (!text) return '';
    try {
      const u = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' }));
      resBlobs[url] = u;
      return u;
    } catch (_) { return ''; }
  }
  // objects.js 的 webSource 会问这里「这个网址有没有本会话的离线副本」。
  // 只覆盖显示用的 src，data.url 仍是原网址 ⇒ .gewu 存档照旧可迁移、换端也对得上。
  GW.webSrcOverride = function (data) {
    const u = data && data.url;
    return (u && resBlobs[u]) || (u && resTexts[u] ? '' : '');
  };

  GW.resources = {
    PHET, WEB_TOOLS, phetUrl, phetThumb,
    // 打开 PhET：已离线缓存则从本机/本机缓存加载，否则在线加载
    async openPhet(id, zh, opts) {
      const name = PHET.find((p) => p[0] === id);
      const title = 'PhET · ' + (name ? name[1] : id);
      const url = phetUrl(id, zh);
      // ① 桌面：主进程下到 offline/ 的真文件
      if (hasDesktopCache()) {
        try {
          const p = await window.gewu.cached(`phet-${id}-${zh ? 'zh_CN' : 'en'}.html`);
          if (p) return GW.objects.create('web', { path: p, title: title + '（离线）' }, opts);
        } catch (_) { /* 桌面桥抽风就当没缓存，继续往下走 */ }
      }
      // ② 浏览器/安卓：Cache API 里有就用会话内的 Blob 副本（data.url 仍写原网址）
      if (await resBlobUrl(url)) return GW.objects.create('web', { url, title: title + '（离线）' }, opts);
      // ③ 没缓存 / 缓存读不出来 / 这设备没有 Cache API：直接联网
      return GW.objects.create('web', { url, title }, opts);
    },
    async cachePhet(id, zh) {
      const url = phetUrl(id, zh);
      const file = `phet-${id}-${zh ? 'zh_CN' : 'en'}.html`;
      // ① 桌面：主进程下载，带进度、落盘到 offline/
      if (hasDesktopCache()) {
        const off = (d) => { if (d && d.name === file) GW.progress(`正在下载 ${id}：${(d.got / 1048576).toFixed(1)} MB${d.total ? ' / ' + (d.total / 1048576).toFixed(1) + ' MB' : ''}`); };
        // F25：preload 的 on() 现在返回退订函数，这里必须收下并在 finally 调用 ——
        // 否则批量缓存 131 个 PhET 会累积 131 个 cache-progress 监听。
        const unsub = typeof window.gewu.on === 'function' ? window.gewu.on('cache-progress', off) : null;
        try { await window.gewu.cacheUrl(url, file); GW.toast('已缓存，可离线使用'); return true; }
        catch (e) { GW.toast('下载失败：' + ((e && e.message) || e)); return false; }
        finally { if (typeof unsub === 'function') unsub(); GW.progress(null); }
      }
      // ② 浏览器/安卓：Cache API（安卓 file:// 下 caches 会抛，见 hasCacheApi 的 try）
      if (!hasCacheApi()) { GW.toast('这台设备不能离线缓存，只能联网打开（手机浏览器请用 https 地址）', 4200); return false; }
      let c = null;
      try { c = await caches.open(RES_CACHE); } catch (e) { c = null; }
      if (!c) { GW.toast('这台设备不能离线缓存，只能联网打开', 4200); return false; }
      // 2a) 同源资源 / 带 CORS 的页面：取整份响应，但**按 resKey(url) 存**
      // F19：旧实现 c.addAll([url]) 把条目存在原 URL 下，而读取走 resKey(url)，
      // 于是「已缓存」提示成功后 isCached 仍为 false、openPhet 继续走网络。
      try {
        const res2 = await fetch(url, { cache: 'no-store' });
        if (!res2 || !res2.ok) throw new Error('HTTP ' + (res2 && res2.status));
        await c.put(resKey(url), res2);
        GW.toast('已缓存，可离线使用'); return true;
      } catch (_) { /* 跨域无 CORS，走 2b */ }
      // 2b) 跨域页面拿不到可读响应体时改「取文本再 put」，打开时用 Blob URL 还原
      GW.progress(`正在缓存 ${id}…`);
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
        const text = await res.text();
        if (!text) throw new Error('空内容');
        await c.put(resKey(url), new Response(text, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
        resTexts[url] = text;
        GW.toast('已缓存，可离线使用'); return true;
      } catch (e) {
        GW.toast('离线缓存失败（' + ((e && e.message) || e) + '），这台设备只能联网使用', 4200);
        return false;
      } finally { GW.progress(null); }
    },
    async isCached(id, zh) {
      if (hasDesktopCache()) {
        try { return !!(await window.gewu.cached(`phet-${id}-${zh ? 'zh_CN' : 'en'}.html`)); } catch (_) { /* 往下试 Cache API */ }
      }
      return !!(await resRead(phetUrl(id, zh)));
    },
    // 批量缓存（课前在有网的地方执行一次）
    async cacheAll(filter) {
      const list = PHET.filter((p) => !filter || p[2] === filter);
      let ok = 0;
      for (const [id, , , zh] of list) {
        if (await GW.resources.isCached(id, zh)) { ok++; continue; }
        if (await GW.resources.cachePhet(id, zh)) ok++;
      }
      GW.toast(`离线缓存完成：${ok}/${list.length}`);
    },
  };
})();
