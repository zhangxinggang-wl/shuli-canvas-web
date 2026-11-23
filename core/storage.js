/* 数理无限画布 · 存储：.gewu 文档、自动保存与恢复、设置 */
(function () {
  'use strict';
  const GW = window.GW;
  let editRevision = 0;
  GW.bus.on('dirty', () => { editRevision++; });
  // F09：打开请求令牌。并发/连续点两次「打开」时，只有最后一次的读盘结果允许替换文档。
  let openSeq = 0;

  // ---------- 跨端能力探测（3.x） ----------
  // 别再用 GW.isElectron 当门：安卓 WebView 里它恒为 false，可文件 / 备份能力其实有一部分
  // （shim 的 writeFile 会落系统下载目录）；纯网页的 shim 则是一堆「函数在、恒返回 null」的空桩，
  // 所以下面既要判函数存在，也要判返回值。
  const gwFn = (k) => !!(window.gewu && typeof window.gewu[k] === 'function');
  // 主进程事件通道（before-close / open-doc / insert-image …）只有桌面桥会推：shim 的 on()
  // 只映射协同那三个通道、其余永不触发。用桥自己的 isElectron 判，别用 GW.isElectron。
  const deskBridge = () => !!(window.gewu && window.gewu.isElectron === true);

  // ---------- 设置 ----------
  // 1.7.6（R4）：出厂默认改为「本机正在使用的设置」（老师 2026-11-09 要求）。
  // 照抄偏好类字段；四类不照抄：本机私有数据（recent / 绝对路径 / 班级名单 / 浮动球位置）、
  // 临时教室模式及其对 AI/资源库的关闭、界面定制 uiCustom/toolCustom（会把「隐藏 7 个工具」
  // 强加给新装机）、uiAlpha=0（全新安装会看不到任何界面）。
  // 五个一次性迁移标记置 true：否则 lookMigrated17 / canvasModeMigrated18 会在全新安装时
  // 把刚写进来的底色与画布模式覆盖回旧出厂值；老机器上这些标记本来已是 true，行为不变。
  const DEFAULTS = {
    // 2.0.8 笔迹实验开关（默认全关 = 2.0.7 行为，见 docs/plans/TASK-2.0.8-ink-evolution.md）
    // 为什么要开关而不是直接改：书写手感是本产品最不能赌的东西，任何一项都必须 A/B 通过再翻默认。
    inkPredict: false,   // I1b：预测墨迹改用浏览器 getPredictedEvents（第二来源）
    inkHobby: false,     // I3：张力自适应拟合（不等长段收敛切线，减少折角过冲）
    inkCalib: false,     // I4：按设备标定的压感区间
    inkOffthread: false, // I5：点列预处理下放 Worker
    penCalib: null,      // I4 标定结果：{ 'v1:设备指纹': {lo,hi,gamma,n,at} }，null = 从未标定
    multiWrite: true,        // 多指同时书写（三指擦除的前提，必须开）
    palmErase: true,
    // 1.3.6：手势擦除（希沃/鸿合那种「巴掌一抹就擦」）。'all' = 手掌 + 三指；
    // 'palm' = 只要手掌；'off' = 关。老存档没有这一项，按 palmErase 的布尔值兜底。
    // 2.1.1：出厂默认恢复为 'all'。1.7.6 把「本机正在使用的设置」整体照抄成 DEFAULTS，
    // 而那台本机是 iPad、老师为防误擦把手势擦除关成了 off —— 一台机器的私有偏好被推广成
    // 全体用户的出厂默认，于是手掌 / 手背 / 三指擦除在 2.0.x 新装机与一体机上全部失效。
    // 写字时手掌托屏不会边写边擦：笔在场由 penEraseOk() 拦住，手掌只忽略不擦（见 input.js）。
    gestErase: 'all',
    palmSize: 46,
    // 2.1.1：一次性纠偏标记。老机器的存档里存着被 1.7.6 固化、又被 FACTORY_209 写回的 off，
    // 只改 DEFAULTS 对它无效。这里升一次就置 true，之后老师自己怎么设都永久保留。
    gestEraseMigrated211: false,
    penScaleWithZoom: false, // 笔宽是否随缩放（false：屏幕上粗细恒定）
    officeAutoConvert: true,
    ggbPath: '',             // GeoGebra 离线包目录
    canvasDefault: null,
    ballPos: null,
    // 2.1.1：四指召唤工具盘（触摸设备上，四指同时轻点屏幕 ⇒ 球飞到笔尖旁并展开）。
    // 只在轻点时间窗内成立（首指→第 4 指 ≤200ms），且要求笔已离屏，避免把双指缩放/三指擦除抢走。
    ballSummon: true,
    // 2.1.1：鼠标指示点。auto = 只在鼠标指针上显示（触摸/笔不显示），always / off 见 pointer-dot.js
    ptrDot: 'auto',
    // 静默多久后淡出。3000 是对着球自身 3.5s 的 idle 节奏定的：先收光标、再暗球，避免两个节奏打架。
    ptrIdleMs: 3000,
    // 2.2.3（R5）：笔尖的静默淡出阈值。笔与鼠标分开 —— 数位板老师常在落笔前先定住看位置，
    // 4 秒与 input.js 里沿用两版的常量一致；0 = 永不淡出。
    ptrIdlePenMs: 4000,
    // 2.2.3（R4）：悬浮球打开时外环怎么铺。sector = 点哪一项才展开那一项的 3 格（**出厂默认**，
    // 2.2.9 起从 all 改回这一档：一开球就把当前工具的 22 格二级功能摊满外环，而老师开球的第一个
    // 动作通常是「找笔 / 换笔」，外环先铺满反而压掉了内环 10 个分组）；
    // all = 一打开就把当前工具的二级功能铺满外环（外环半径 158 → 214）；
    // hold = 轻点照旧扇形，长按球 0.55s 才全展开。
    ballOpen: 'sector',
    // 2.2.3（R3）：悬浮球 30 格的深度定制。null = 内置默认；数组 10 项、每项最多 3 个动作 id
    // （'ball:<项键>:<格号>' 指内置子格，'dock:<工具栏动作 id>' 指工具栏动作目录里的任意一项）。
    ballCustom: null,
    // 2.2.3（R7）：小图形停笔驻留才识别。面积门（12000px² / 80px 短边）不放宽，
    // 只在它拦下来时多问一句「抬笔前停够久了没有」；false = 逐位回到 2.2.2 的行为。
    smallShapeHold: true,
    smallShapeHoldMs: 1000,
    names: '',               // 随机点名名单（= 当前班级的 names，1.3.8 起由 rollClasses 派生，保留是为了老存档/老代码）
    rollClasses: null,       // 1.3.8：随机点名的班级名单 [{id, name, names}]；null 时由 names 迁移出一个「我的班级」
    rollClass: '',           // 1.3.8：当前选中的班级 id
    customRes: [],           // 自定义资源
    autosave: true,
    renderMode: 'high',      // 渲染档位：auto | high（强开高质量） | lite（流畅优先）
    penDevice: 'auto',       // 输入设备：auto | infrared | emr | mouse（见 core/pen.js）
    penSmooth: 0,            // 2.0.9：出厂改为 0（关）—— 本机实测手感，最跟手
    factory209: false,       // 2.0.9：画布出厂设置一次性重置标记（见 FACTORY_209）
    penTaper: 1,             // 笔锋（按行笔速度出粗细 + 起收笔出锋）：1 开 | 0 关
    // 1.6.6（T05）：倾斜笔锋。默认关 —— 鼠标与红外屏的 tilt 恒为 0，开了也没效果，
  // 但真电磁笔上它会改变手感（笔杆放平加粗），老用户不该被一次升级悄悄改掉手感。
  penTilt: false,
  penPress: 0.9,             // 压感灵敏度：0.4 迟钝（轻重差不多）… 3 灵敏（轻轻一碰就细），1 原行为
  // 1.6.8（R5/R6/R8/R10）
  brush: 'pen',            // 笔刷预设：pen 钢笔 | pencil 铅笔 | marker 马克笔（只改压感/速度系数）
  // 2.0.3：笔种（见 core/ink-style.js）。**空 = 没选过**，按老设置回落（penMode / brush），
  // 所以老存档升级后手感一个字节都不变；老师在笔面板里点过笔种之后才写进这里。
  penInk: '',
  // 2.0.4：按笔种独立存六维笔锋参数（见 core/ink-style.js 的 TIP_DIMS / tipConfig）。
  // 缺省就是空对象 —— 一支笔都没调过 ⇒ tipConfig() 逐位回落默认，与 2.0.3 逐位等价。
  penTipCfg: {},
  penTipAuto: true,        // 收笔锋型跟着笔种走（钢笔出锋 / 马克笔方收）；手动选过锋型就自动置 false
  highlighterSnap: true,   // 高亮笔在横线纸上吸附到行线
  textSnapLine: false,     // 文本块拖动后吸到底纹行线（默认关，和老手感一致）
  // 版式：infinite 无限画布 | paged 纸张页（纸张/底纹/纸框画在 page.box 里，整页可见、逐页导出）。
  // 2.0.8：paged 不再是「书写边界」—— 纸外照常书写/插入/显示（与无限画布同一套交互），
  // 这一项只决定纸与页框画不画、导出整页取哪一块。
  layout: 'infinite',
  // 1.7.4（R6/R8）：尺规单位与橡皮筛选。默认值让行为与 1.7.3 完全一致（全开、厘米）。
  geoUnit: 'cm',           // 尺规读数单位：cm | in
  // 橡皮只擦哪几类（GoodNotes 的 eraserEraseTapeSwitch 一组）。
  // shape 默认改为 true：图形识别开着时，老师画的一条直线/一个圆会立刻变成 shape，
  // 若橡皮默认只擦「手写墨迹」，用户看到的就是「我写的字擦不掉」（iPad 实机反馈的同款现象）。
  // obj 仍默认 false：卡片/图片/PDF 是整块对象，区域擦一滑就删整页，风险太大。
  eraserFilter: { ink: true, hl: false, shape: true, obj: false },
    eraser: { mode: 'area', size: 36 },
    penTip: 'round',         // 收笔锋型：sharp 出锋（渐细到尖）| round 藏锋（收圆）| flat 方切（顿收）
    penExit: 1.1,              // 出锋长度倍率：0.3 短收 … 2 长收（汉字的一撇/一捺）
    penPredict: -1,          // 笔尖跟手预测：-1 用设备档默认（红外屏 1 帧）| 0 关 | 8 一帧 | 16 两帧
    freeNoticeSeen: false,   // 首次启动的「完全免费」说明看过了没（见 core/app.js showFreeGate）
    exportWatermark: false,  // 导出物 / 截图右下角的来源水印（作者名 + 群号，见 core/build.js）
    // 1.7.0（T01/T02/T12/T15）：新一批开关。教室模式 = 一次关掉导出水印/AI/资源库并把导出降档，
    // 退出时按 classroomSnap 还原；其余各自独立，默认值都取「不改变老手感」的那一档。
    classroomMode: false,
    classroomSnap: null,     // 进教室模式前的快照 {exportWatermark, exportQuality, aiPanel, library}
    exportQuality: 'best',   // 导出档位：best(1) | medium(.75) | lowest(.5)，见 core/export.js
    pptxMode: 'native',
    aiPanel: true,           // AI 入口总闸（教室模式会关掉）
    library: true,           // 资源库入口总闸（教室模式会关掉）
    // 1.7.1（T04）：打开板书时回到上次离开的位置（页 + 平移缩放）。默认开 —— 老师场景续上更省事。
    resumeView: true,
    // 1.7.1（T10）：板书 → 班级 的轻量索引（路径 → 班级串）。只放设置里，不动资源库结构。
    boardClasses: {},
    cards: [],
    snapGrid: true,         // 拖动时吸附网格线（1.7.0 T12）
    snapObjects: true,      // 拖动时吸附到其它对象的边/中线（1.7.0 T12）
    drawHold: false,         // 画完停住变形状（1.7.0 T06，默认关：汉字闭合字形会被误改）
    circleLasso: false,      // 画圈即选中（1.7.0 T13，默认关：写 0 / 口 会误选）
    teacherAnnot: true,      // 教师批注可见（1.7.0 T15，关掉只隐藏显示、不改数据）
    minimap: false,          // 右下角小地图（1.7.0 T11，默认关：不与页码条抢右下角）
    // 1.5.3：自动反差墨色。墨色与当前底色对比度 < 2.6:1 时按底色主墨色画（典型：黑板上写的
    // 白笔切到白底后就看不见）。只在渲染层换算，笔迹数据不变，所以随时可逆、也不改 .gewu。
    autoContrastInk: true,
    // 2.2.8（CAST-05）：投屏接收端的抖动缓冲档位。
    // zero = 压到 0（延迟最低，但 Wi-Fi 一抖就花屏/冻结）；default = 交给浏览器自适配（默认档，稳）；
    // auto60 = 目标 60ms（折中：延迟可感知地低一点，又不至于一抖就死）。
    // 默认 default：2.2.5 起强制归零是"延迟优先"的一刀切，对家用路由器太激进。
    castBuffer: 'default',
    uiCustom: null,          // 界面自定义：工具栏按钮的显隐/顺序/位置与四角停靠（见 core/app.js 的 GW.uiCustom）
    customShapes: true,      // 1.3.11 自定义图形（core/shapeself.js）：总闸，关掉后不注册也不出「＋」入口
    // 1.3.0（R5）：画布模式。free = 无限平移 + 可缩放（老行为）；axis100 = 单轴无限平移 + 缩放锁 100%；
    // inf2d = 二维无限平移 + 缩放锁 100%（1.7.5 起真的锁 100%）。判据见 board.js 的 GW.zoomLock/GW.axisLock。
    // 1.7.5：出厂改成 inf2d（老师反馈「默认就该锁 100%，免得一不小心缩放跑了」）。
    canvasMode: 'free',
    canvasModeMigrated18: true,  // 老机器补一次（见下面 loadSettings 里的迁移）
    // 1.1.19：录课画质档 high | mid | small | tiny（体积 ≈ 码率 × 时长，档位表见 core/lessonrec.js）。
    // 默认 high 就是 1.1.18 的原来那组参数，老用户升级后录出来的文件与从前同类。
    recQuality: 'tiny',
    recMode: 'screen',
    toolCustom: null,        // 1.1.11 工具栏/菜单定制：{ hidden: { pen:[], shapeTabs:[], mathSubs:[], physSubs:[], insert:[], sims:[], geo:[], class:[], resTabs:[] }, extraColors: [] }（见 core/app.js 的 GW.toolCustom）
    dockStyle: 'pill',      // 1.1.3 工具栏按钮形状：round 圆形 | square 方形 | pill 胶囊
    dockColor: '#1b2433',    // 1.1.3 工具栏按钮颜色（选中态底色，见 GW.applyLook）
    customBg: '#11222e',            // 1.1.3 最近一次在调色盘里挑的自定义底色（下回打开还在这儿）
    // 1.1.7 图形透明度：参数面板里拖过的那一档会被记住，下回插入新图形直接用它，
    // 不用每张图重新调（范围 0~1，1 = 不透明）。老版本没有这一项，默认 1。
    shapeAlpha: 1,
    // 1.1.8：参数弹层的不透明度（0.4–1）。老师在滑杆面板挡住图形时调它，
    // 调过一档就记住，下次开面板还是这个透明度。
    panelAlpha: 0.55,
    // 1.1.8：界面（顶栏/工具栏/面板/浮球）的不透明度，0~1，1 = 全显。默认 1：新用户
    // 先看到熟悉的界面，觉得控件抢眼再自己去「设置 → 界面透明度」调低。
    uiAlpha: 1,   // 1.7.6：本机现存 0（界面全透明），故意不照抄，见顶部总注释
    // 1.1.10 工具栏外观（见 core/app.js 的 applyBarLook 与 app.css 末尾「工具栏外观」段）：
    barTint: '#ffffff',      // 三条工具栏的底纹色
    barAlpha: 1,          // 底纹不透明度（0 = 全透明）
    barFill: 'none',         // solid 实底 | glass 毛玻璃 | outline 描边 | none 无底纹（1.1.15 出厂：无底纹）
    barRadius: 34,           // 工具栏圆角（px，0–34）
    barPad: 2,               // 内边距（px，2–14）：越小越紧凑，越不挡板书
    btnTint: '#1b2433',      // 按钮底纹色（未选中态的底）
    btnAlpha: 0,             // 按钮底纹不透明度（0 = 透明，跟 1.1.9 一样）
    // 1.1.15：书写时自动淡出改成**默认关**。老师反馈「写着写着三条栏淡没了，想点一下得先抬手等它回来」，
    // 需要防遮挡的人自己到「设置 → 外观」打开。
    barFade: false,
  // 1.1.15：画笔颜色/线宽要记住 —— 透明批注层是**另一个窗口**，它按 localStorage 恢复。
  // 以前颜色只活在本窗口内存里，进桌面批注就跳回默认墨黑（反馈说的「颜色突变」）。
  penColor: '#ffffff',
  penWidth: 2,
  // 1.7.1：书写预设（default/smooth/precise/board）。只是「起点」—— 预设写入的仍是下面那些
  // 单独的笔迹参数，老师随时可以再单项微调，这里只记住最后选过哪一档。
  penPreset: 'smooth',
  penBoardFeel: true,
  // 1.5.0：笔迹线型（实线 / 虚线 / 点线）与智能笔的识别时机。
  // smartSnap：auto = 该规整就规整；hold = 收笔时停一下才规整（最像 Notability）；
  // off = 智能笔当普通钢笔用，一笔都不动。
  penStyle: 'solid',
  // 1.3.2：笔的模式（钢笔/毛笔/智能笔）必须持久化，否则重开应用/刷新网页就退回钢笔，
  // 表现就是「安卓端和平板协同网页端的智能笔模式没生效」（三端同源码，问题在设置没落盘）。
  penMode: 'pen',
  // 笔优先（1.3.4）：'auto' = 笔最近落过屏就把触摸改成平移画布（默认）；
  // 'on' = 一律如此（老设备把电磁笔报成 touch、或系统不给 pen 事件时用）；'off' = 关掉，手指永远照常书写。
  penFirst: 'auto',
  // 1.3.2：磁场填充默认档（'' 无 / 'cross' ×向里 / 'dot' ·向外）。改它之后新画的矩形/圆…会自动带上
  shapeMF: 'cross',
  smartSnap: 'auto',
  // 1.4.4（R3）：智能笔识别灵敏度 —— 残差上限占包围盒对角线的比例。0.09 是 1.4.0 实测的默认值，
  // 设置页「笔与智能笔 → 识别灵敏度」暴露成 55~140（千分比），只影响矩形/正方形/等边三角/圆/椭圆。
  snapResid: 0.09,
  hlColor: '#ffd23f',          // 书写/画图时工具栏自动淡出（防遮挡）
  hlWidth: 22,
    barFadeTo: 0.05,         // 淡到多少（0.05–0.6）
    barEdgePeek: true,       // 界面收起时，鼠标/笔贴到屏幕底边临时浮出三条栏
    barInset: 0,             // 底部额外内缩（px，0–64）：平板/网页端躲开浏览器工具栏
    chromePinned: true,     // 1.1.10 界面是否被用户「钉住」常显（钉住后贴边浮出不会自动收起）
    // 1.1.14 激光笔：颜色 / 粗细 / 两种消失方式（demo 演示圈画 | formula 临时板书），
    // hold 是临时板书停笔多少秒后开始淡出。弹层见 core/app.js 的 laserPop。
    laser: { color: '#ff2d55', width: 5, mode: 'formula', hold: 2 },
    // 1.1.14 参数弹层避让：true 时「调参数」弹层优先放到选中图形外侧，不压住图形。
    // 1.1.16：改成**默认开** —— 面板一弹就压住图形是老师最常抱怨的一件小事，
    // 默认避让后第一次弹就已经不挡图；想让面板紧贴按钮弹的人到设置里关掉即可。
    paramAside: true,
    // 1.1.16：这一项的默认值变过，老用户 localStorage 里存着 false，只改 DEFAULTS 对他无效 →
    // 升级后一次性覆盖成 true。只写一次标记，之后老师自己怎么设都永久保留。
    paramAsideMigrated16: true,
    recent: [],
    // 默认「纯黑方格」：教室里投影/大屏用黑底最护眼，白笔一落就看得清。
    // 老版本把 white/none 存进了 localStorage，升级后一次性迁到黑格（只迁这一种组合，
    // 老师自己选过的其他配色保持不动）。
    // 1.1.15：出厂底色改成「护眼磨砂黑板」——墨绿黑底(#2b3036) + 磨砂材质 + 无底纹。
    // 教室投影一整节课盯着纯黑/纯白都刺眼；磨砂颗粒把频闪压下去，网格关掉板书更干净。
    // 1.5.6：出厂外观再换一版 —— 黑板绿(#1f3b30) + 渐变 + 无底纹（见下面的 lookMigrated17）。
    // 2.0.9：出厂底色从 s-forest2 改为纯黑（把 2026-11-14 本机画布状态固化为出厂值，
    // 见下面的 FACTORY_209 与 factory209 一次性迁移）。
    defaultBg: { color: 'black', material: 'plain', pattern: 'none' },
    bgDefaultMigrated: true,
    // 1.1.15：外观出厂值的第二次迁移（磨砂黑板无底纹 / 工具栏无底纹 / 书写淡出默认关）。
    // 老用户的 localStorage 里存着旧外观，只改 DEFAULTS 对他无效，所以升级后一次性覆盖一遍。
    lookMigrated15: true,
    // 1.5.6：外观出厂值的第三次迁移（黑板绿 + 渐变 + 无底纹 / 界面不透明）。
    lookMigrated17: true,
  };

  /* ---------- 2.1.1（R6）：出厂默认 = 本机已安装应用的真实配置 ----------
     真值唯一来源 src/core/factory-defaults.js 的 GW.FACTORY_CONFIG：从本机运行时
     localStorage（leveldb）逐项采集的 103 项 + 新增交互键，不猜测、不补齐、不遗漏。
     其中 26 项属于「本机私有数据 / 临时状态 / 会破坏新装机的界面定制 / 一次性迁移标记」，
     按 1.7.6 既定规则保留上面的安全值（完整真实值仍在 GW.FACTORY_CONFIG 里，
     两个「恢复默认」按钮会逐项应用）。理由逐项写在 GW.FACTORY_SAFE_KEYS。
     Node 自检脚本不加载 factory-defaults.js，这里没有真源时保持原行为。 */
  (function applyFactoryConfig() {
    const P = GW.factoryPortableDefaults && GW.factoryPortableDefaults();
    if (!P) return;
    for (const k of Object.keys(P)) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
        DEFAULTS[k] = JSON.parse(JSON.stringify(P[k]));
      }
    }
  })();

  const KEY = 'gewu.settings';
  // 1.1.10：升级时「沿用用户的所有设置」。
  // 以前只做 Object.assign({}, DEFAULTS, JSON.parse(localStorage[...])) —— 三个漏洞：
  //   ① localStorage 被清掉（卸载时勾了「删除数据」、换机、网页端换浏览器）就全丢；
  //   ② JSON.parse 一处坏字符直接抛异常，整个应用起不来；
  //   ③ 老版本的某个字段类型变了（比如数组变对象），深合并时会把新默认值整体覆盖掉。
  // 现在：主进程在用户目录里多存一份 settings-backup.json（preload 的 settingsRead/settingsWrite），
  // 读的时候「默认值 ← 文件备份 ← localStorage」三层深合并，再按 DEFAULTS 的类型逐项校验；
  // 坏掉的字段回退到默认值，好字段一个都不丢。写得下就两份都写，写不下至少 localStorage 那份还在。
  function parseSettings(raw) {
    try { const o = JSON.parse(raw || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
  }
  function isPlain(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function deepMerge(base, over) {
    const out = { ...base };
    if (!isPlain(over)) return out;
    for (const k of Object.keys(over)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const v = over[k], b = out[k];
      out[k] = isPlain(v) ? deepMerge(isPlain(b) ? b : {}, v) : v;
    }
    return out;
  }
  // 2.0.4：penTipCfg 的专用 guard。别的项都是「按 DEFAULTS 的类型校验 + 夹数值范围」，
  // 这一项是「按笔种分组的二维表」，得单独洗：只收普通对象、最多 8 个笔种键、
  // 每支笔只收 TIP_KEYS 六个白名单键；数值按 TIP_DIMS 的 min/max 钳制、penTip 只收
  // TIP_OPTIONS 五个合法值；脏值 / 超限 / 整体 JSON 超 8KB 一律回落空对象（{} = 2.0.3 行为）。
  // 优先读 GW.inkStyle 的元数据（表改了这里不用跟着改）；Node 侧 / 老脚本没加载
  // ink-style.js 时用下面这份与 2.0.4 定稿一致的兜底表，保证本文件单独跑也不会漏校验。
  const FALLBACK_TIP_KEYS = ['penTipSharp', 'penTipFlat', 'penTip', 'penExit', 'penPressCurve', 'penStabilize'];
  const FALLBACK_TIP_OPTIONS = ['sharp', 'round', 'flat', 'back', 'flatEnd'];
  const FALLBACK_TIP_DIMS = [
    { key: 'penTipSharp', min: 0, max: 1 }, { key: 'penTipFlat', min: 0, max: 1 },
    { key: 'penExit', min: 0.3, max: 2 }, { key: 'penPressCurve', min: 0, max: 4 },
    { key: 'penStabilize', min: 0, max: 1 },
  ];
  const FALLBACK_PEN_IDS = ['gel', 'ball', 'plain', 'fountain', 'brush', 'pencil', 'marker', 'chalk'];
  function cleanPenTipCfg(v) {
    const IS = GW.inkStyle;
    const keys = (IS && IS.TIP_KEYS) || FALLBACK_TIP_KEYS;
    const opts = (IS && IS.TIP_OPTIONS) || FALLBACK_TIP_OPTIONS;
    const dims = (IS && IS.TIP_DIMS) || FALLBACK_TIP_DIMS;
    const ids = (IS && IS.list ? IS.list().map((s) => s.id) : FALLBACK_PEN_IDS);
    const dimBy = {};
    for (const d of dims) if (d && d.key) dimBy[d.key] = d;
    // 结构脏 / 超限：整体回落空对象。8KB 用字符数卡（UTF-8 下只会更保守）。
    if (!isPlain(v)) return {};
    const ks = Object.keys(v);
    if (ks.length > 8) return {};
    let raw;
    try { raw = JSON.stringify(v); } catch (_) { return {}; }
    if (typeof raw !== 'string' || raw.length > 8192) return {};
    const out = {};
    for (const id of ks) {
      // 不是合法笔种 / 该笔种不是普通对象 = 脏值 → 回落空对象
      if (ids.indexOf(id) < 0 || !isPlain(v[id])) return {};
      const u = v[id], clean = {};
      for (const k of Object.keys(u)) {
        if (keys.indexOf(k) < 0) continue;            // 只收六个白名单键，多余的直接丢
        const val = u[k];
        if (k === 'penTip') {
          if (typeof val !== 'string' || opts.indexOf(val) < 0) return {};  // 非法锋型 = 脏值
          clean[k] = val;
        } else {
          if (typeof val !== 'number' || !isFinite(val)) return {};          // 非数值 = 脏值
          const d = dimBy[k];
          clean[k] = d ? Math.max(d.min, Math.min(d.max, val)) : val;        // 按 min/max 钳制
        }
      }
      if (Object.keys(clean).length) out[id] = clean;
    }
    return out;
  }
  // 按 DEFAULTS 的类型校验：类型不对就用默认值（null 默认值的项接受任意对象或 null）。
  // 1.1.10：out 只收 DEFAULTS 里有的键 —— 老版本/手改留下的陌生键不再跟着一路带下去，
  // 否则「未知键」会永久驻留在 localStorage 里，还可能在下次升级时撞上同名的新设置项。
  function sanitize(s, base = DEFAULTS) {
    const src = isPlain(s) ? s : {};
    const out = {};
    const clone = (v) => (v === null ? null : JSON.parse(JSON.stringify(v)));
    for (const k of Object.keys(DEFAULTS)) {
      const d = DEFAULTS[k], fallback = base[k] === undefined ? d : base[k];
      // 别用 Object.hasOwn：iPad Safari 15.3 及更早、旧安卓 WebView 都没有这个 API。
      // 这一段在脚本顶层执行，一抛错后面所有 GW.* 定义（saveSettings / 文档序列化 /
      // 协同 hookSettings 依赖的设置对象）整段消失，表现就是「平板连上了却不同步」。
      if (!Object.prototype.hasOwnProperty.call(src, k)) { out[k] = clone(fallback); continue; }
      const v = src[k];
      // 2.0.4：penTipCfg 走专用 guard（二维表，不参与下面「按 DEFAULTS 类型」的通用合并）。
      // 缺键时照旧取 fallback，与其余项一致；有值时洗一遍，脏 / 超限自然回落 {}。
      if (k === 'penTipCfg') { out[k] = cleanPenTipCfg(v); continue; }
      if (k === 'penSmooth' && v === null) { out[k] = null; continue; }
      if (d === null) {
        out[k] = v === null ? null : isPlain(v) ? deepMerge(isPlain(fallback) ? fallback : {}, v)
          : Array.isArray(v) ? clone(v) : clone(fallback);
        continue;
      }
      if (Array.isArray(d)) { out[k] = clone(Array.isArray(v) ? v : fallback); continue; }
      if (typeof d === 'object') { out[k] = isPlain(v) ? deepMerge(fallback, v) : clone(fallback); continue; }
      out[k] = (typeof v === typeof d && !(typeof v === 'number' && !isFinite(v))) ? v : fallback;
    }
    // 数值项再夹一次范围：手改过 settings 文件也不会把界面调到不可用
    const clamp = (k, lo, hi) => { const v = out[k]; if (typeof v === 'number' && isFinite(v)) out[k] = Math.max(lo, Math.min(hi, v)); };
    clamp('uiAlpha', 0, 1); clamp('panelAlpha', 0.2, 1); clamp('shapeAlpha', 0, 1);
    clamp('barAlpha', 0, 1); clamp('btnAlpha', 0, 1); clamp('barRadius', 0, 34); clamp('barPad', 2, 14);
    clamp('barFadeTo', 0.05, 0.6); clamp('barInset', 0, 64);
    clamp('hlWidth', 1, 120);
    out.eraser.mode = out.eraser.mode === 'stroke' ? 'stroke' : 'area';
    out.eraser.size = Math.max(16, Math.min(120, Number(out.eraser.size) || DEFAULTS.eraser.size));
    for (const k of ['color', 'material', 'pattern']) {
      if (typeof out.defaultBg[k] !== 'string') out.defaultBg[k] = base.defaultBg?.[k] || DEFAULTS.defaultBg[k];
    }
    // 非法档位回落到「出厂档」，别写死 solid：出厂默认 1.1.15 起是 none，
    // 手改坏的设置不该把整条工具栏突然刷成实底（probe-bar-look ⑨ 验这条）。
    if (['solid', 'glass', 'outline', 'none'].indexOf(out.barFill) < 0) out.barFill = DEFAULTS.barFill;
    if (!/^#[0-9a-f]{6}$/i.test(String(out.barTint || ''))) out.barTint = DEFAULTS.barTint;
    if (!/^#[0-9a-f]{6}$/i.test(String(out.btnTint || ''))) out.btnTint = DEFAULTS.btnTint;
    // 激光笔（1.1.14）：对象项不会走上面的类型校验，这里逐字段夹一次
    if (!isPlain(out.laser)) out.laser = clone(DEFAULTS.laser);
    const L = out.laser;
    if (!/^#[0-9a-f]{6}$/i.test(String(L.color || ''))) L.color = DEFAULTS.laser.color;
    L.width = Math.max(1, Math.min(40, Number(L.width) || DEFAULTS.laser.width));
    L.mode = L.mode === 'formula' ? 'formula' : 'demo';
    L.hold = Math.max(1, Math.min(30, Number(L.hold) || DEFAULTS.laser.hold));
    return out;
  }
  function readLocal() {
    try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; }
  }
  let fileRaw = '';
  try { fileRaw = window.gewu?.settingsRead?.() || ''; } catch (_) { /* 使用浏览器副本 */ }
  // 顶层初始化必须绝对不抛：本文件在 src/index.html 里排在 kit/board/app 之前，
  // 一异常后面所有 GW.*（含协同 hookSettings 依赖的 GW.saveSettings）都不会定义，
  // 表现就是桌面端照常、平板网页端「连上了却不同步」。旧 WebKit 无 Object.hasOwn、
  // 坏掉的备份文件、被禁用的 localStorage，都在这里兜住。
  try {
    GW.settings = sanitize(parseSettings(readLocal()), sanitize(parseSettings(fileRaw)));
  } catch (e) {
    try { console.warn('[gewu] 设置读取失败，已退回出厂设置：', e); } catch (_) { /* 无 console 也要继续 */ }
    try { GW.settings = sanitize({}); } catch (e2) { GW.settings = JSON.parse(JSON.stringify(DEFAULTS)); }
  }
  let backupTimer = 0, pending = '', lastOwn = JSON.stringify(GW.settings), localOK = true;
  function writeBackup() {
    clearTimeout(backupTimer);
    if (!pending || !window.gewu?.settingsWrite) return;
    const data = pending;
    pending = '';
    try { Promise.resolve(window.gewu.settingsWrite(data)).catch(() => {}); } catch (_) { /* 浏览器副本仍在 */ }
  }
  GW.saveSettings = () => {
    let current;
    try { current = JSON.stringify(GW.settings); } catch (_) { return; }
    const latest = readLocal();
    let next = current;
    // 主画布和桌面批注各持有内存副本，保存时只覆盖本窗口确实改过的键。
    if (localOK && latest && latest !== lastOwn) {
      const old = parseSettings(lastOwn), fresh = parseSettings(current), shared = sanitize(parseSettings(latest), GW.settings);
      for (const k of Object.keys(fresh)) {
        if (JSON.stringify(fresh[k]) !== JSON.stringify(old[k])) shared[k] = fresh[k];
      }
      next = JSON.stringify(shared);
    }
    lastOwn = current;
    try { localStorage.setItem(KEY, next); localOK = true; } catch (_) { localOK = false; }
    if (!window.gewu?.settingsWrite) return;
    pending = next;
    clearTimeout(backupTimer);
    backupTimer = setTimeout(writeBackup, 400);
  };
  /* ---------- 2.0.9：把画布出厂设置固化并重置一次 ----------
     用户 2026-11-14 要求：把本机当时的画布状态定为「出厂设置」，且新老用户安装后
     都重置一次。做法只覆盖「画布」相关的几项，不碰笔迹开关、快捷键、课堂名单这类
     个人配置 —— 重置的是画布观感，不是老师的使用习惯。 */
  const FACTORY_209 = {
    defaultBg: { color: 'black', material: 'plain', pattern: 'none' },
    canvasMode: 'free',
    renderMode: 'high',
    autoContrastInk: true,
    penSmooth: 0,
    penTaper: 1,
    penTilt: false,
    shapeAlpha: 1,
  };
  try {
    if (!GW.settings.factory209) {
      Object.assign(GW.settings, JSON.parse(JSON.stringify(FACTORY_209)));
      GW.settings.factory209 = true;
      // 已有页面不强制改色（老师存的板书不能被悄悄换底），只改「新页面用什么底色」。
      if (GW.doc && GW.doc.pages && GW.doc.pages.length === 1 && !GW.doc.pages[0].ink.length) {
        GW.doc.pages[0].bg = JSON.parse(JSON.stringify(FACTORY_209.defaultBg));
      }
      lastOwn = JSON.stringify(GW.settings);
      try { GW.saveSettings(); } catch (_) { /* 保存失败下次再试 */ }
    }
  } catch (_) { /* 迁移失败不阻塞启动 */ }

  /* ---------- 2.1.1：修正 1.7.6 误把本机私有偏好固化成出厂默认 ----------
     1.7.6 照抄本机设置时把 iPad 上关掉的手势擦除（gestErase:off / palmErase:false）
     抄进了 DEFAULTS，2.0.9 的 FACTORY_209 又把这整份设置写回了存档。只改 DEFAULTS
     对老机器无效（localStorage 里那个现成的 off 优先），必须升一次。
     判据只看 gestErase==='off' 这一对「被错误固化的总闸」：用户选过 'palm'/'all'
     的一律不动。升完打标记 —— 之后老师主动关掉也永久保留，绝不会每次开机翻回来。
     注意不要在这里重置 lastOwn：saveSettings 靠「与 lastOwn 的差异」判断本窗口改过哪些键，
     重置了就会把纠偏结果当成「别的窗口改的」而不落盘。 */
  try {
    if (!GW.settings.gestEraseMigrated211) {
      if (GW.settings.gestErase === 'off') {
        GW.settings.gestErase = 'all';
        GW.settings.palmErase = true;
      }
      GW.settings.gestEraseMigrated211 = true;
      try { GW.saveSettings(); } catch (_) { /* 保存失败下次再试 */ }
    }
  } catch (_) { /* 迁移失败不阻塞启动 */ }

  window.addEventListener?.('pagehide', writeBackup);
  GW.settingsBackupPath = () => (window.gewu && window.gewu.settingsBackupPath ? window.gewu.settingsBackupPath() : '');
  // 1.1.10：把「出厂默认」也给界面用（设置面板里的「恢复默认外观」「恢复默认」按钮），
  // 只给一份拷贝，谁改都不会污染 DEFAULTS。
  GW.settingsDefaults = () => JSON.parse(JSON.stringify(DEFAULTS));
  // 也把三层合并的两个纯函数暴露出来：探针要验「旧版本的设置文件读进来一项都不丢」
  GW.parseSettings = parseSettings;
  GW.deepMergeSettings = deepMerge;
  GW.sanitizeSettings = sanitize;
  // ---------- 1.7.0（T01）：特性开关 ----------
  // 借 NoteApp 的形状（每个 flag 有名字、有默认值、有优先级来源），但它的每个 flag 还带 zod schema；
  // 我们只有 4 个布尔 + 1 个三档字符串，用白名单 + 类型校验就够，不引依赖。
  // 优先级：URL `?flags=`（启动时读一次，最高）> 设置面板（localStorage 持久化）> 出厂默认。
  //   ?flags=noai,nowm,nolibrary,lowest,medium,classroom
  // 反向对照（探针用）：只写 localStorage、不经过 set()，flags.get 读的就是 GW.settings —— 两者必须一致；
  // 而 query 在启动之后依然压过 set()，证明「query 最高」不是偶然。
  const FLAG_MAP = {
    inkPredict: 'inkPredict',
    inkHobby: 'inkHobby',
    inkCalib: 'inkCalib',
    inkOffthread: 'inkOffthread',
    watermark: 'exportWatermark',
    exportQuality: 'exportQuality',
    aiPanel: 'aiPanel',
    library: 'library',
  };
  const FLAG_ALIAS = {
    nowm: ['watermark', false], noai: ['aiPanel', false], nolibrary: ['library', false],
    lowest: ['exportQuality', 'lowest'], medium: ['exportQuality', 'medium'],
  };
  const qFlags = {};          // 只在 URL 里出现过的项才有键
  const flags = {
    keys: () => Object.keys(FLAG_MAP),
    // 读：query 覆盖 > settings
    get(k) {
      const name = FLAG_MAP[k] ? k : k;
      if (k in qFlags) return qFlags[k];
      return GW.settings[FLAG_MAP[name] || name];
    },
    source(k) { return (k in qFlags) ? 'query' : 'settings'; },
    // 写：只写 settings。**同时清掉该键的 query 覆盖层** —— 否则老师用 ?flags=nowm 开过一次网页，
    // 之后在设置里怎么点「导出物水印」都关不回来（探针 probe-flags 的反向对照就是这条）。
    set(k, v) {
      const key = FLAG_MAP[k] || k;
      if (!(key in GW.settings)) return false;
      if (k in qFlags) delete qFlags[k];
      GW.settings[key] = v;
      GW.saveSettings();
      GW.bus.emit('flags', { key: k, value: v });
      return true;
    },
    // 启动时调用一次：解析 `?flags=`，并把 classroom 一并落进设置
    applyQuery(search) {
      const q = String(search == null ? (window.location && window.location.search) : search).replace(/^\?/, '');
      let list = [];
      q.split('&').forEach((kv) => {
        const i = kv.indexOf('=');
        if (i < 0) return;
        if (decodeURIComponent(kv.slice(0, i)) !== 'flags') return;
        list = decodeURIComponent(kv.slice(i + 1)).split(',').map((s) => s.trim()).filter(Boolean);
      });
      list.forEach((tok) => {
        if (tok === 'classroom') { flags.classroom(true); return; }
        const a = FLAG_ALIAS[tok];
        if (!a) return;
        qFlags[a[0]] = a[1];
      });
      return { query: list, applied: Object.keys(qFlags) };
    },
    // 教室模式：一次把 4 项写成预设，退出时按快照逐项还原（不碰其余设置）
    classroom(on) {
      const S = GW.settings;
      if (on && !S.classroomMode) {
        S.classroomSnap = { exportWatermark: S.exportWatermark, exportQuality: S.exportQuality, aiPanel: S.aiPanel, library: S.library };
        S.exportWatermark = false;
        S.exportQuality = 'lowest';
        S.aiPanel = false;
        S.library = false;
        S.classroomMode = true;
      } else if (!on && S.classroomMode) {
        const sn = S.classroomSnap || {};
        S.exportWatermark = sn.exportWatermark === true;
        S.exportQuality = typeof sn.exportQuality === 'string' ? sn.exportQuality : 'best';
        S.aiPanel = sn.aiPanel !== false;
        S.library = sn.library !== false;
        S.classroomSnap = null;
        S.classroomMode = false;
      } else {
        return !!S.classroomMode;
      }
      GW.saveSettings();
      GW.bus.emit('flags', { classroom: S.classroomMode });
      return !!S.classroomMode;
    },
    snapshot() {
      const out = {};
      Object.keys(FLAG_MAP).forEach((k) => { out[k] = flags.get(k); });
      out.classroom = !!GW.settings.classroomMode;
      return out;
    },
  };
  GW.flags = flags;
  // 1.7.0（T01）：URL `?flags=` 只在启动时读一次（网页端给公开课/教室一个可直接分发的链接）。
  // 放在这里而不是 app.js：批注子窗口也会加载 storage.js，但没有 flags 参数，正则不命中就跳过。
  try { if (window.location && /[?&]flags=/.test(window.location.search)) flags.applyQuery(); } catch (e) { /* 无 location 时忽略 */ }
  // 把设置单独导出/导入（换机、教室公用机），文件就是一份 JSON
  GW.exportSettings = () => JSON.stringify({ app: 'gewu-board', kind: 'settings', version: GW.APP_VERSION || '', at: new Date().toISOString(), settings: GW.settings }, null, 2);
  GW.importSettings = (text) => {
    const o = parseSettings(text);
    const raw = isPlain(o.settings) ? o.settings : o;
    if (!isPlain(raw) || !Object.keys(raw).length) return false;
    GW.settings = sanitize(raw, GW.settings);
    GW.saveSettings();
    GW.applyToolSettings?.();
    return true;
  };

  // ---------- 序列化 ----------
  // app 字段与 .gewu 扩展名是文件格式标识，改名后保持原样，旧板书仍能直接打开
  function serialize() {
    const d = GW.doc;
    // 存档只带当前页面使用的资源；内存资源仍可能被撤销历史引用。
    const used = new Set();
    // T04：回收站里的页也要留住资源 —— 否则存盘后资源被 gc、恢复那一页时图片全空。
    const trashList = Array.isArray(d.trash) ? d.trash : [];
    const allPages = d.pages.concat(trashList.map((t) => t && t.page).filter(Boolean));
    for (const p of allPages) for (const o of (p.objs || [])) if (o.data && o.data.asset) used.add(o.data.asset);
    const packPage = (p) => {
      const o = { id: p.id, name: p.name, bg: p.bg, view: p.view, ink: (p.ink || []).map(GW.strip), objs: (p.objs || []).map(GW.strip), geo: (p.geo || []).map((g) => Object.assign({}, g)) };
      if (p.paper) o.paper = p.paper;
      if (p.box) o.box = { x: p.box.x, y: p.box.y, w: p.box.w, h: p.box.h };
      // 2.0.7（R5/A2/A6）：页级有限标记、纸张参数、页面旋转 —— 都是纯附加字段，
      // 旧版本读到未知字段直接忽略；不写就会「换台电脑模板页就变成无限白页」。
      // F17：分页标记必须**无条件**落盘（含 false）。旧写法只在 paged 为真时写，
      // 于是「paged=false 但留着纸框的页」存档里没有这个字段，重开时被 load 的
      // 「有 paper/box ⇒ 补成 true」老档迁移规则顶回分页，无限画布上冒出纸框。
      o.paged = !!p.paged;
      if (p.paperCfg && typeof p.paperCfg === 'object') o.paperCfg = p.paperCfg;
      if (p.rot) o.rot = p.rot;
      // F18：页边距 {l,r,t,b}（世界单位）以前根本不进存档，保存→重开就变 undefined，
      // 参考线与逐页导出留白一起丢。这里四边都写；非法值不写，由读盘侧补默认 0。
      const mg = p.margin;
      if (mg && typeof mg === 'object' && !Array.isArray(mg)) {
        const m2 = {};
        for (const k of ['l', 'r', 't', 'b']) {
          const v = +mg[k];
          if (Number.isFinite(v) && v >= 0 && v <= 4000) m2[k] = v;
        }
        if (Object.keys(m2).length) o.margin = m2;
      }
      return o;
    };
    // 1.1.15：课堂容器与回放（纯附加段，旧版本读到直接忽略；不写任何一行已有字段）
    const extra = (GW.classRoom && GW.classRoom.exportSeg) ? GW.classRoom.exportSeg() : null;
    return JSON.stringify(Object.assign({
      app: 'gewu-board', version: 1, savedAt: new Date().toISOString(), cur: d.cur,
      // 写它的那一版构建指纹（纯附加字段，旧版本读到会忽略，旧板书也没有它）
      build: (GW.BUILD && GW.BUILD.id) || '',
      // 1.7.1（T04）：上次离开时的视口（纯附加字段；旧版本忽略、旧文件没有它 ⇒ 载入落默认）。
      // cx/cy 就是相机 tx/ty（世界坐标），page 与 cur 同值（两处都写，旧版本只认 cur 也不受影响）。
      view: (() => {
        const c = GW.camera || {}, s = +c.s;
        return { cx: +c.tx || 0, cy: +c.ty || 0, s: s > 0 ? s : 1, page: d.cur || 0 };
      })(),
      // 1.7.1（T10）：课程/班级分组（可选字符串，空串也照写；旧版本读到未知字段直接忽略）
      class: typeof d.class === 'string' ? d.class : '',
      // 1.7.2（T07）：打开口令。纯附加字段，旧版本读到忽略（也就会跳过口令 —— 说明书里写清）。
      // 只存 salt 与 sha256(salt+口令)，**不加密正文**：这是门帘，不是加密。
      ...(d.guard && d.guard.hash ? { guard: { alg: 'sha256', salt: d.guard.salt, hash: d.guard.hash, hint: d.guard.hint || '' } } : {}),
      // 1.7.0（T14）：page.paper / page.box 必须进存档 —— 纸张库画的是「整张纸的版式」，
      // 少了这两个字段，重开板书纸就没了（旧版本读到未知字段直接忽略，不会炸）。
      pages: d.pages.map(packPage),
      // T04：页面回收站（纯附加字段：旧版本读到直接忽略；最多 20 条，与内存上限一致）
      trash: trashList.filter((t) => t && t.page && typeof t.page === 'object' && !Array.isArray(t.page)).slice(0, 20).map((t) => ({
        page: packPage(t.page),
        at: +t.at || 0,
        index: Number.isInteger(t.index) && t.index >= 0 ? t.index : 0,
      })),
      // 2.2.5：只有还被引用的资产才写盘；data 不是字符串的（按本机路径引用的 PPT 之类）直接跳过 ——
      // 它们本来就没进 assets，这里只是防止半截资产把整份文档写成坏文件。
      assets: Object.fromEntries(Object.entries(d.assets)
        .filter(([k, a]) => used.has(k) && a && typeof a.data === 'string')
        .map(([k, a]) => [k, { mime: a.mime, name: a.name, data: a.data }])),
    }, (extra && (extra.lesson || extra.replay || extra.quizResults)) ? extra : {}));
  }
  function load(json, path, options) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    if (!d || d.app !== 'gewu-board') throw new Error('不是数理无限画布文档');
    if (!Array.isArray(d.pages) || !d.pages.length) throw new Error('文档页面无效');
    // 先完整准备新文档，损坏的存档不能拆掉当前板书。
    const pages = d.pages.map((p) => {
      if (!p || typeof p !== 'object' || Array.isArray(p) ||
          ['ink', 'objs', 'geo'].some((k) => k in p && (!Array.isArray(p[k]) || p[k].some((it) => !it || typeof it !== 'object'))) ||
          ['bg', 'view'].some((k) => k in p && (!p[k] || typeof p[k] !== 'object' || Array.isArray(p[k])))) throw new Error('文档页面无效');
      const merged = Object.assign(GW.newPage(), p);
      // 2.0.7（R5）：三个新字段一律「缺省 = 老行为」，并且只认合法值。
      merged.paged = !!merged.paged;
      // 老存档迁移：有纸张版式或纸框的页，本来就是模板页（1.7.x 的全局 paged 没落盘），
      // 老文件里没有 paged 字段时按「有 paper/box」补成 true，否则重开纸样会消失。
      if (!('paged' in p) && (p.paper || (p.box && p.box.w > 0))) merged.paged = true;
      if (!merged.paperCfg || typeof merged.paperCfg !== 'object' || Array.isArray(merged.paperCfg)) delete merged.paperCfg;
      const rot = +merged.rot;
      merged.rot = rot === 90 || rot === 180 || rot === 270 ? rot : 0;
      // F18：页边距读盘校验。只有存档里真带了 margin 才规整（四边各补 0），
      // 没带的旧档保持 undefined —— export.js 的 rectForPage 靠「无 margin ⇒ 24 单位白边」
      // 兜底，给旧档硬塞全 0 反而会把导出留白抹成 0。坏值（NaN/负数/超 4000）逐项回 0。
      const mm = merged.margin;
      if (mm && typeof mm === 'object' && !Array.isArray(mm)) {
        const out = { l: 0, r: 0, t: 0, b: 0 };
        for (const k of ['l', 'r', 't', 'b']) {
          const v = +mm[k];
          if (Number.isFinite(v) && v >= 0 && v <= 4000) out[k] = v;
        }
        merged.margin = out;
      } else if ('margin' in merged) {
        delete merged.margin;
      }
      return merged;
    });
    // T04：页面回收站 —— 旧文件没有这个字段（当空）；坏条目静默跳过，不能拖垮整份文档。
    const trash = [];
    if (Array.isArray(d.trash)) {
      for (const t of d.trash.slice(0, 20)) {
        const tp = t && t.page;
        if (!tp || typeof tp !== 'object' || Array.isArray(tp)) continue;
        if (['ink', 'objs', 'geo'].some((k) => k in tp && (!Array.isArray(tp[k]) || tp[k].some((it) => !it || typeof it !== 'object')))) continue;
        if (['bg', 'view'].some((k) => k in tp && (!tp[k] || typeof tp[k] !== 'object' || Array.isArray(tp[k])))) continue;
        trash.push({ page: Object.assign(GW.newPage(), tp), at: +t.at || 0, index: Number.isInteger(t.index) && t.index >= 0 ? t.index : 0 });
      }
    }
    const assets = {};
    for (const [k, a] of Object.entries(d.assets || {})) {
      // 2.2.5：允许 a.data 为 null（按本机路径引用的资源，比如 >64 MB 的 PPT 只存 path）。
      // 这种条目没有字节可校验，用 key 占位即可；真正读盘在 pptx.modelOf 里做。
      // 只放行「明确带本机路径」的按路径资源（>64 MB 的 PPT 只存 path、不内联字节）；
      // 光有 data:null 而没有 path 的一律视为损坏存档。
      const byPath = a && a.data == null && typeof a.path === 'string' && !!a.path;
      if (!a || (typeof a.data !== 'string' && !byPath)) throw new Error('文档资源无效');
      const key = typeof a.data === 'string' ? (a.data.length + ':' + a.data.slice(0, 64) + a.data.slice(-64)) : 'file';
      // F07：本地重算的 key 必须最后写 —— 指纹只是索引，同一性由完整 data 决定；
      // 旧写法 Object.assign({ key }, a) 会让文件里自带的 key 覆盖重算值。
      assets[k] = Object.assign({}, a, { key });
    }
    if (!options?.replay) GW.classRoom?.importSeg(d);
    GW.objects.unmountAll();
    // 复审 C12：换文档前先让图片/PDF 缓存失效（同 assetId 不同字节不能串用）
    if (GW.assets && GW.assets.reset) GW.assets.reset();
    const doc = GW.doc;
    doc.pages = pages;
    doc.assets = assets;
    doc.cur = Number.isInteger(d.cur) ? Math.max(0, Math.min(d.cur, pages.length - 1)) : 0;
    doc.path = path || null;
    // 1.7.1（T10）：班级是文档级可选字段（旧板书没有 ⇒ 空串），随 .gewu 走；索引只是给资源库筛选用的缓存
    doc.class = typeof d.class === 'string' ? d.class : '';
    // 1.7.2（T07）：打开口令校验通过后把 guard 带进内存，下次保存才不会把它丢掉。
    doc.guard = (d.guard && typeof d.guard.hash === 'string' && d.guard.hash) ? {
      alg: 'sha256', salt: String(d.guard.salt || ''), hash: d.guard.hash, hint: String(d.guard.hint || ''),
    } : null;
    doc.trash = trash;
    if (GW.boardClasses) GW.boardClasses.set(doc.path, doc.class);
    // 1.5.3（P2）：课件包里的对象存的是包内相对引用（data.rel）。开包时把它化成真实路径，
    // 只允许在包根之下（拒绝绝对路径与 .. 逃逸）。包搬目录后照样能开。
    // 1.6.1：板书里引用的本机 html（比如桌面上的课件）重开时要能加载：登记它们所在目录。
    try {
      const dirs = [];
      for (const pg of (doc.pages || [])) for (const o of (pg.objs || [])) {
        const d = o && o.data;
        if (!d || !d.path || o.type !== 'web') continue;
        const dir = String(d.path).replace(/[\/][^\/]*$/, '');
        if (dir && dirs.indexOf(dir) < 0) dirs.push(dir);
      }
      if (window.gewu && window.gewu.allowReadDir) for (const dir of dirs.slice(0, 8)) window.gewu.allowReadDir(dir).catch(() => {});
    } catch (e) { /* 不影响打开文档 */ }
    if (GW.deps && GW.deps.adopt) { try { GW.deps.adopt(doc, path); } catch (e) { console.warn('课件包引用解析失败', e); } }
    doc.dirty = false;
    GW.clearHistory();
    if (GW.bumpDocTok) GW.bumpDocTok();   // 复审 #7：换文档 → 在途 AI 任务作废
    GW.gotoPage(doc.cur);
    // 1.7.1（T04）：回到上次的视口。顺序很重要 —— 先 gotoPage（它会把相机重置成该页的 p.view），
    // 再按文档级 view 覆盖；没有 view 字段 / 老师关了开关 ⇒ 什么都不做，保持上面的默认。
    // 自动备份环里的旧副本本来就没有这个字段，走的也是这一条分支，照样能打开。
    const rv = d.view;
    if (rv && typeof rv === 'object' && !Array.isArray(rv) && GW.settings.resumeView !== false) {
      const pi = Number.isInteger(rv.page) ? Math.max(0, Math.min(rv.page, pages.length - 1)) : doc.cur;
      if (pi !== doc.cur) { doc.cur = pi; GW.gotoPage(pi); }
      const s = +rv.s, cx = +rv.cx, cy = +rv.cy;
      if (isFinite(cx) && isFinite(cy) && isFinite(s) && s > 0) {
        GW.setView(cx, cy, s);
        if (GW.applyFastView) GW.applyFastView();
      }
    } else if (GW.settings.resumeView === false) {
      // 开关关掉：连 cur 也不信 —— 老师要的是「每次都从第 1 页左上角开始」，
      // 不然「关了开关却还停在上次那一页」看起来像没生效。
      if (doc.cur !== 0) { doc.cur = 0; GW.gotoPage(0); }
      GW.setView(0, 0, 1);
      if (GW.applyFastView) GW.applyFastView();
    }
    GW.bus.emit('doc-loaded');
  }
  GW.serialize = serialize;
  GW.loadDoc = load;

  // 1.7.2（T07）：打开口令 —— 只拦界面，**不加密正文**（用文本编辑器打开照样能读到板书）。
  // 存 salt 与 sha256(salt + 口令)；算法与 build.js 同源（WebCrypto，Chromium 108 可用）。
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  async function sha256Hex(s) {
    if (!(window.crypto && crypto.subtle && crypto.subtle.digest)) throw new Error('当前环境不支持口令（需要 crypto.subtle）');
    return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))));
  }
  function randSalt() {
    const a = new Uint8Array(12);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 256) | 0;
    return hex(a);
  }
  GW.docGuard = {
    has() { return !!(GW.doc && GW.doc.guard && GW.doc.guard.hash); },
    hint() { return (GW.doc && GW.doc.guard && GW.doc.guard.hint) || ''; },
    async verify(g, pw) {
      if (!g || !g.hash) return true;
      return (await sha256Hex(String(g.salt || '') + String(pw || ''))) === g.hash;
    },
    async set(pw, hint) {
      const p = String(pw || '');
      if (p.length < 4) throw new Error('口令至少 4 位');
      const salt = randSalt();
      GW.doc.guard = { alg: 'sha256', salt, hash: await sha256Hex(salt + p), hint: String(hint || '').slice(0, 60) };
      GW.doc.dirty = true;
      if (GW.markDirty) GW.markDirty(); else GW.doc.dirty = true;
      return GW.doc.guard;
    },
    clear() {
      if (!GW.doc) return false;
      GW.doc.guard = null;
      if (GW.markDirty) GW.markDirty(); else GW.doc.dirty = true;
      return true;
    },
  };
  // 打开前问口令：最多 3 次；取消 = 不打开。返回 true 表示放行。
  async function askGuard(g) {
    for (let i = 0; i < 3; i++) {
      const title = '这份板书设置了打开口令' + (g && g.hint ? '（提示：' + g.hint + '）' : '') + (i ? '，还剩 ' + (3 - i) + ' 次' : '');
      const ask = GW.passPrompt || GW.prompt;
      const pw = await ask(title, '输入口令');
      if (pw == null) return false;
      if (await GW.docGuard.verify(g, pw)) return true;
      GW.toast('口令不正确', 2200);
    }
    GW.toast('口令连续输错 3 次，已取消打开', 3200);
    return false;
  }
  GW.askGuard = askGuard;

  // 1.7.1（T10）：课程 / 班级分组。**不动资源库结构**（不建班级文件夹、不改 library-list 契约）：
  // 班只是「板书 → 班级串」的一张轻量索引（存在 gewu.settings.boardClasses），资源库「我的资源」
  // 按它筛。一个板书可以写多个班（逗号 / 顿号 / 空格分隔），同一文件因此能在两个班里都出现。
  GW.boardClasses = {
    tokens(cls) {
      return String(cls || '').split(/[,，、;；\/\s]+/).map((x) => x.trim()).filter(Boolean);
    },
    of(path) { return this.tokens((GW.settings.boardClasses || {})[path || '']); },
    set(path, cls) {
      if (!GW.doc) return;
      const v = String(cls || '').trim();
      // 未存盘的板书没有路径：班级先跟着 doc.class 走，存成文件后由 save 补写索引
      if (!path) return;
      const map = GW.settings.boardClasses || (GW.settings.boardClasses = {});
      if (v) map[path] = v; else delete map[path];
      GW.saveSettings();
    },
    dirOf(p) { return String(p || '').replace(/[\\\/][^\\\/]*$/, ''); },
    // 「当前板书目录」里出现过的班级值 —— 下拉的选项就取这里。
    // 没有路径（新板书还没存成文件）时退回全部索引，否则老师新建一节课什么也选不了。
    list() {
      const map = GW.settings.boardClasses || {};
      const dir = this.dirOf(GW.doc && GW.doc.path);
      const out = [];
      const push = (t) => { if (t && out.indexOf(t) < 0) out.push(t); };
      for (const p of Object.keys(map)) if (!dir || this.dirOf(p) === dir) this.tokens(map[p]).forEach(push);
      this.tokens(GW.doc && GW.doc.class).forEach(push);   // 当前这份还没落盘也要能看见自己的班
      return out.sort((a, b) => a.localeCompare(b, 'zh'));
    },
    // 当前目录下的板书清单（资源库「按班级查看」用）：[{ path, name, cls, tokens }]
    entries() {
      const map = GW.settings.boardClasses || {};
      const dir = this.dirOf(GW.doc && GW.doc.path);
      return Object.keys(map).filter((p) => !dir || this.dirOf(p) === dir).map((p) => ({
        path: p,
        name: String(p).split(/[\\\/]/).pop().replace(/\.gewu$/i, ''),
        cls: String(map[p] || ''),
        tokens: this.tokens(map[p]),
      }));
    },
  };

  const baseName = (p) => (p ? p.split(/[\\/]/).pop() : '');
  function addRecent(p) {
    const r = GW.settings.recent.filter((x) => x !== p);
    r.unshift(p);
    GW.settings.recent = r.slice(0, 12);
    GW.saveSettings();
  }

  // ---------- 1.5.3（P1）：保存状态与恢复副本环 ----------
  // 两种"保存"必须分开报：用户文件（.gewu 落到他选的路径）和恢复备份（写进应用自己的
  // <userData>/backups）。以前只有 doc.dirty 一个布尔，界面只能显示"未保存"，看不出
  // "已经自动备份过了、只是还没存成文件"，磁盘拒写时也只剩一句 toast。
  const SAVE = {
    file: { at: 0, err: '', busy: false },
    backup: { at: 0, err: '', busy: false, warn: '' },
  };
  let lastBackupAt = 0;      // 上次成功生成恢复副本的时间
  let lastBackupRev = -1;    // 上次备份对应的 editRevision（内容没变就不重复写）
  let bkSeq = 0;             // 同一秒内多次备份的文件名去重
  let browserQuota = false;  // 浏览器版配额不足（持久提醒）
  GW.saveState = () => ({
    file: Object.assign({}, SAVE.file),
    backup: Object.assign({}, SAVE.backup),
    dirty: !!(GW.doc && GW.doc.dirty),
    path: (GW.doc && GW.doc.path) || '',
    lastBackup: lastBackupAt,
    quota: browserQuota,
  });
  function saveState(part, patch) { Object.assign(SAVE[part], patch); GW.bus.emit('save-state'); }
  // 恢复副本环：最多 5 份 / 总量 200 MiB / 每 60 秒最多一份新副本，只有内容变了才写。
  // 淘汰顺序永远是"先成功写新副本、再删旧的"；单份超上限时只保留最新一份。
  const BK = { index: 'index.json', maxFiles: 5, maxBytes: 200 * 1024 * 1024, gap: 60000 };
  const bkStamp = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()); };
  const bkTitle = () => { const p = GW.doc.path; return p ? baseName(p).replace(/\.gewu$/i, '') : '未命名板书'; };
  const validItem = (x) => !!x && typeof x.f === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(x.f) && x.f !== BK.index;
  const byteLen = (s) => { try { return new TextEncoder().encode(String(s)).length; } catch (_) { return String(s).length; } };
  async function readIndex() {
    try {
      const o = JSON.parse(await window.gewu.backupRead(BK.index));
      // 1.5.4 复审 #2：旧版/异常索引里的 size 可能是 true、字符串或不合理数，
      // 列表里会显示成 1 B、总量限制也就形同虚设。这里先清成 0，真实大小稍后按磁盘补齐。
      return Array.isArray(o.items) ? o.items.filter(validItem).map((x) => Object.assign({}, x, { size: Number.isFinite(+x.size) && +x.size > 0 ? +x.size : 0 })) : [];
    }
    catch (e) { return []; }   // 索引坏了当没有：下面改用扫描到的副本文件重建列表
  }
  // 1.5.4 复审 #3：索引损坏/索引写失败时，副本文件仍是完整的。扫描目录里的
  // auto-YYYYMMDD-HHMMSS-N.gewu 就能列出来 —— 不能把「读不到索引」当成「没有备份」。
  const BK_FILE = /^auto-\d{8}-\d{6}-\d+\.gewu$/;
  async function scanCopies() {
    try {
      const list = await window.gewu.backupList();
      return (Array.isArray(list) ? list : []).filter((x) => BK_FILE.test(String(x.name || '')))
        .map((x) => ({
          f: x.name,
          at: new Date(x.mtime || Date.now()).toISOString(),
          title: '恢复副本 ' + String(x.name).replace(/^auto-/, '').replace(/\.gewu$/, ''),
          path: '', size: Number(x.size) > 0 ? Number(x.size) : 0, format: 1, scanned: true,
        }));
    } catch (e) { return []; }
  }
  async function writeIndex(items) {
    await window.gewu.backupWrite(BK.index, JSON.stringify({ v: 1, app: 'gewu-board', at: new Date().toISOString(), items }));
  }
  let bkBusy = false;
  async function backupElectron(force) {
    const now = Date.now();
    if (!force) {
      if (lastBackupAt && now - lastBackupAt < BK.gap) return true;   // 节流：不写也不算失败
      if (lastBackupRev === editRevision) return true;                // 内容没变
    }
    if (bkBusy) return false;   // 已有一次备份在写：不并发写副本
    bkBusy = true;
    const snapshot = serialize(), rev = editRevision;
    const pages = GW.doc.pages, title = bkTitle(), path = GW.doc.path || '';
    const name = 'auto-' + bkStamp() + '-' + (++bkSeq) + '.gewu';
    saveState('backup', { busy: true, err: '', warn: '' });
    try {
      const bytes = byteLen(snapshot);
      const wrote = Number(await window.gewu.backupWrite(name, snapshot));
      // 1.5.4 复审 #2：以真实落盘字节数为准（旧的 IPC 返回 true，Number(true)=1，
      // 单份超限告警和 200 MiB 总量限制都会失效）。IPC 没给数就按 UTF-8 字节数算。
      const size = Number.isFinite(wrote) && wrote > 0 ? wrote : bytes;
      let items = (await readIndex()).filter((x) => x.f !== name);
      // 索引与磁盘对账：索引写失败留下的孤儿副本要补进来，失效的 size 用磁盘值修复。
      // 刚写的那一份已经在磁盘上了：扫描结果必须先剔掉它，否则 items 里会出现两条同名副本，
      // 淘汰时按名字删掉「没被 kept 引用的那一条」，会把真正保留的文件一起删掉。
      const scan = (await scanCopies()).filter((x) => x.f !== name);
      const onDisk = new Map(scan.map((x) => [x.f, x]));
      const have = new Set(items.map((x) => x.f));
      for (const s of scan) if (!have.has(s.f)) items.push(s);
      for (const it of items) { const s = onDisk.get(it.f); if (s && (!it.size || it.size <= 0)) it.size = s.size; }
      // 1.6.7（T18）：每份副本附一张首页缩略图，版本历史里能直接看出来是哪一版。
      // 缩略图失败（画布还没就绪、跨域污染）只丢图不丢副本。
      let thumb = '';
      try { if (GW.backupThumb && GW.doc.pages === pages && editRevision === rev) thumb = GW.backupThumb(); } catch (e) { thumb = ''; }
      items.unshift({ f: name, at: new Date(now).toISOString(), title, path, size, format: 1, thumb });
      const kept = [];
      let total = 0;
      for (const it of items) {
        const single = it.size > BK.maxBytes;
        if (!kept.length) { kept.push(it); total += it.size; continue; }
        // 超上限的单份只保留它自己；其余按"新的优先、总量不超"保留
        if (!single && kept.length < BK.maxFiles && total + it.size <= BK.maxBytes) { kept.push(it); total += it.size; }
      }
      for (const it of items) if (kept.indexOf(it) < 0) { try { await window.gewu.backupRemove(it.f); } catch (e) { /* 已被删/占用 */ } }
      await writeIndex(kept);
      lastBackupAt = now; lastBackupRev = rev; bkBusy = false;
      saveState('backup', { busy: false, at: now, err: '', warn: kept.length === 1 && kept[0].size > BK.maxBytes ? '单份备份已超过 200 MB，只保留最新一份' : '' });
      return true;
    } catch (e) {
      bkBusy = false;
      const msg = String((e && e.message) || e);
      saveState('backup', { busy: false, err: msg });
      console.warn('自动备份失败', e);
      return false;
    }
  }
  async function browserBackupStore(mode, run) {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('gewu-board-backup', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('draft');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('draft', mode);
        let req;
        tx.oncomplete = () => resolve(req?.result);
        tx.onabort = () => reject(tx.error || new Error('备份事务已取消'));
        try { req = run(tx.objectStore('draft')); }
        catch (e) { tx.abort(); reject(e); }
      });
    } finally { db.close(); }
  }
  let browserBackupBusy = false;
  async function browserBackup(force) {
    if (!force && lastBackupRev === editRevision && lastBackupAt) return true;
    if (browserBackupBusy) return false;
    browserBackupBusy = true;
    try {
      const revision = editRevision, snapshot = serialize(), now = Date.now();
      const f = 'browser-' + now + '-' + (++bkSeq);
      const meta = { f, size: new Blob([snapshot]).size, at: now, title: bkTitle(), path: '', format: 1 };
      saveState('backup', { busy: true, err: '' });
      await browserBackupStore('readwrite', (store) => {
        store.put(meta, 'meta');
        store.put({ f, snapshot }, 'snapshot');
      });
      lastBackupAt = now; lastBackupRev = revision; browserQuota = false;
      saveState('backup', { busy: false, at: lastBackupAt, err: '', warn: '' });
      return true;
    } catch (e) {
      browserQuota = e?.name === 'QuotaExceededError';
      saveState('backup', { busy: false, err: browserQuota ? '浏览器存储空间不足，自动备份没有保存' : '浏览器自动备份失败：' + ((e && e.message) || e) });
      return false;
    } finally { browserBackupBusy = false; }
  }

  // 2.0.7：序列化/反序列化给探针、诊断包与「模板库导出」用（纯内存，不落盘、不弹窗）。
  // load 与文件打开走的是同一条路径，所以探针验的就是真实读盘逻辑。
  GW.serializeDoc = serialize;
  GW.loadDoc = load;
  GW.storage = {
    async save(saveAs) {
      if (GW.classRoom?.isPlaying()) return GW.toast('请先结束回放，再保存板书');
      const doc = GW.doc;
      const pages = doc.pages;
      let p = doc.path;
      if (!GW.isElectron) {
        // R4：安卓 / 网页也走「另存为」的能力探测，只是没有目录可选。
        // 已经有 doc.path 就沿用同名（安卓原生重名会自动编号，不会覆盖上一版），
        // 这样「再保存一次」不会每按一次就多出一个新文件，也不会一路堆到下载目录里。
        const name = p ? baseName(p) : '课堂板书-' + stamp() + '.gewu';
        const snapshot = serialize(), revision = editRevision;
        try {
          if (window.gewu?.writeFile) {
            const written = await window.gewu.writeFile(name, snapshot, 'utf8');
            if (!written) throw new Error('文件未写入');
            if (typeof written === 'string') {
              if (doc.pages === pages) {
                // 原来这里既不写 doc.path 也不进「最近打开」：安卓上每次保存都被当成新文件，
                // 关掉应用再想继续改，只能重新去下载目录里翻。
                doc.path = written;
                addRecent(written);
                if (editRevision === revision) doc.dirty = false;
              }
              saveState('file', { busy: false, at: Date.now(), err: '' });
              GW.bus.emit('saved');
              if (window.gewu.sessionMark) { try { window.gewu.sessionMark({ last: written }); } catch (_) {} }
              return GW.toast('已保存：' + baseName(written));
            }
          } else {
            const url = URL.createObjectURL(new Blob([snapshot], { type: 'application/json' }));
            GW.h('a', { href: url, download: name }).click();
            setTimeout(() => URL.revokeObjectURL(url), 8000);
          }
        } catch (e) {
          saveState('file', { busy: false, err: String((e && e.message) || e) });
          return GW.toast('保存失败：' + ((e && e.message) || e), 4000);
        }
        // 浏览器里点下载只是"发起"了：落不落盘、落哪儿由浏览器决定，所以不清 dirty、
        // 也不显示"已保存到文件"，只在状态里记「已发起下载」。
        saveState('file', { busy: false, at: Date.now(), err: '', note: '下载' });
        return GW.toast('已开始下载 .gewu（下载完成才算存到磁盘）', 3200);
      }
      if (!p || saveAs) {
        p = await window.gewu.saveDialog({ title: '保存板书', defaultPath: '课堂板书-' + stamp() + '.gewu', filters: [{ name: '数理无限画布文档', extensions: ['gewu'] }] });
        if (!p) return;
        if (doc.pages !== pages) return;
      }
      GW.progress('正在保存…');
      saveState('file', { busy: true, err: '' });
      try {
        const snapshot = serialize(), revision = editRevision;
        await window.gewu.writeFile(p, snapshot);
        // IPC 落盘期间仍可书写或换文档，只能清除这份快照对应的脏状态。
        if (doc.pages === pages) {
          doc.path = p;
          if (editRevision === revision) doc.dirty = false;
        }
        addRecent(p);
        // 1.7.1（T10）：落盘后把班级补进索引（新建的板书是存成文件那一刻才有路径的）
        if (GW.boardClasses && doc.class) GW.boardClasses.set(p, doc.class);
        saveState('file', { busy: false, at: Date.now(), err: '' });
        GW.bus.emit('saved');
        // 1.7.2（T09）：记住「上次打开的文件」，异常退出后提示条能给出「打开原文件」。
        if (window.gewu && window.gewu.sessionMark) { try { window.gewu.sessionMark({ last: p }); } catch (_) {} }
        GW.toast('已保存：' + baseName(p));
      } catch (e) {
        // 写失败：path / dirty 都不动（旧文件完好），状态里留错误详情给标题区的「详情」
        saveState('file', { busy: false, err: String((e && e.message) || e) });
        GW.toast('保存失败：' + ((e && e.message) || e), 4000);
      }
      finally { GW.progress(null); }
    },
    async open(src) {
      // F09：读盘（readFile / File.text）是异步的，等待期间画布照样能编辑。
      // 这里先领一个令牌，只有最后一次请求、且期间没有新编辑，才允许替换当前文档。
      const token = ++openSeq;
      if (GW.classRoom?.isPlaying()) GW.classRoom.stopPlay();
      // 1.4.2（复审 A1）：脏状态是**整份文档**的属性，不能看当前页有没有内容——
      // 第 1 页有笔迹、当前停在第 2 页空白页时，旧写法会直接覆盖掉未保存内容。
      if (GW.doc.dirty) {
        if (!(await GW.confirm('当前板书尚未保存，确定打开其他文档吗？（当前内容会先存入自动备份）'))) return;
        const backed = await GW.storage.autosave(true);
        if (!backed) { GW.toast('自动备份失败，已取消打开（当前内容没有被替换）', 4200); return; }
      }
      try {
        if (!src) {
          // 桌面拿真路径；安卓 / 网页的 shim 用 <input type=file> 实现 openFiles，返回的是
          // mem:// 句柄（下面的 readFile 认它）。两条都走「函数在不在」判断。
          if (gwFn('openFiles') && gwFn('readFile')) {
            const [p] = await window.gewu.openFiles({ multi: false, filters: [{ name: '数理无限画布文档', extensions: ['gewu'] }] });
            if (!p) return;
            src = p;
          } else {
            const inp = GW.h('input', { type: 'file', accept: '.gewu' });
            inp.onchange = () => inp.files[0] && GW.storage.open(inp.files[0]);
            return inp.click();
          }
        }
        // F09：以「开始读盘」这一刻的修订号为基线，替换前复核。
        const baseRev = editRevision;
        const commitOpen = (parsed, pth) => {
          if (token !== openSeq) { GW.toast('已有更新的一次打开请求，这次读取结果已忽略', 3200); return false; }
          if (editRevision !== baseRev) {
            GW.toast('打开期间板书有新改动，已取消替换（当前内容没有被覆盖）', 4600);
            return false;
          }
          load(parsed, pth);
          return true;
        };
        GW.progress('正在打开…');
        // 1.5.3（P2）：开任何本机文档前先把它所在目录登记成 _local 协议允许的根 ——
        // 课件包里的 assets/ 就是这样显示出来的（普通 .gewu 不受影响）。
        if (typeof src === 'string' && window.gewu && typeof window.gewu.pkgRoot === 'function') {
          try { await window.gewu.pkgRoot(src.replace(/[\\/][^\\/]*$/, '')); } catch (e) { /* 老主进程没有这个通道 */ }
        }
        if (typeof src === 'string') {
          const txt = await window.gewu.readFile(src, 'utf8');
          let parsed = null;
          try { parsed = JSON.parse(txt); } catch (e) { throw new Error('文件不是有效的板书（JSON 解析失败）'); }
          // 1.7.2（T07）：设了口令的板书必须先输对，才继续读内容（正文本身没加密）。
          if (parsed && parsed.guard && parsed.guard.hash) {
            if (!(await askGuard(parsed.guard))) { GW.progress(null); return; }
          }
          if (!commitOpen(parsed, src)) return;
          addRecent(src);
          // 1.7.2（T09）：异常退出后「打开原文件」用得到
          if (window.gewu.sessionMark) { try { window.gewu.sessionMark({ last: src }); } catch (_) {} }
        } else {
          const txt = await src.text();
          let parsed = null;
          try { parsed = JSON.parse(txt); } catch (e) { throw new Error('文件不是有效的板书（JSON 解析失败）'); }
          if (parsed && parsed.guard && parsed.guard.hash) {
            if (!(await askGuard(parsed.guard))) { GW.progress(null); return; }
          }
          if (!commitOpen(parsed, src.path || null)) return;
        }
        GW.toast('已打开：' + baseName(GW.doc.path || src.name || ''));
      } catch (e) { GW.toast('打开失败：' + e.message, 4000); }
      finally { GW.progress(null); }
    },
    newDoc() {
      GW.classRoom?.importSeg();
      GW.objects.unmountAll();
      if (GW.assets && GW.assets.reset) GW.assets.reset();
      const doc = GW.doc;
      doc.pages = [GW.newPage()];
      doc.pages[0].bg = Object.assign({}, GW.settings.defaultBg);
      doc.assets = {}; doc.cur = 0; doc.path = null; doc.dirty = false;
      doc.trash = []; doc.class = ''; doc.guard = null;
      if (GW.bumpDocTok) GW.bumpDocTok();
      GW.clearHistory();
      GW.gotoPage(0);
      GW.bus.emit('doc-loaded');
    },
    // F08：退出前的备份要复核「写盘期间有没有又编辑」。editRevision 是模块私有变量，
    // 这里只暴露只读快照，调用方不用自己维护第二份修订号。
    revision() { return editRevision; },
    // 自动备份：桌面写进 <userData>/backups 的恢复副本环（见上方 backupElectron），
    // 浏览器和 Android 写入 IndexedDB 恢复单槽。返回 true = 已安全落盘或无需落盘。
    async autosave(force) {
      if (GW.classRoom?.isPlaying()) return !force;
      // 1.1.14：透明批注层是**临时的一层**，绝不能把它的草稿写进备份 ——
      // 那会把老师真正的板书覆盖掉（恢复自动备份就只剩这一层桌面批注了）。
      if (GW.overlayMode) return true;
      if (!GW.settings.autosave && !force) return false;
      if (!GW.doc.dirty && !force) return true;
      const ok = await (gwFn('backupWrite') ? backupElectron(!!force) : browserBackup(!!force));
      if (ok) GW.bus.emit('autosaved');
      return ok;
    },
    // 恢复副本列表：{ items:[{f,at,title,path,size,format,missing?}], legacy:{...}|null, dir, err? }
    async backups() {
      const out = { items: [], legacy: null, dir: '' };
      // 桌面备份环靠 backupRead/backupList/backupWrite 三个主进程通道；缺任何一个就走 IndexedDB 单槽。
      const canBk = gwFn('backupRead') && gwFn('backupList') && gwFn('backupWrite');
      if (!canBk) {
        try {
          const meta = await browserBackupStore('readonly', (store) => store.get('meta'));
          if (meta) out.items.push(meta);
        } catch (e) { out.err = '读不到浏览器自动备份'; }
        try {
          const s = localStorage.getItem('gewu.autosave');
          if (s) out.legacy = { name: 'localStorage', size: s.length, at: 0, title: '浏览器自动备份', path: '', format: 1 };
        } catch (e) { out.err = '读不到浏览器存储'; }
        return out;
      }
      out.dir = 'backups';
      let items = [];
      try {
        items = await readIndex();
      } catch (e) { items = []; }
      // 索引丢了/坏了也要能列能恢复：以目录里的真实副本为准补齐。
      const scan = await scanCopies();
      const onDisk = new Map(scan.map((x) => [x.f, x]));
      if (!items.length && scan.length) { items = scan.slice(); out.rebuilt = true; }
      else if (scan.length) {
        const have = new Set(items.map((x) => x.f));
        const extra = scan.filter((x) => !have.has(x.f));
        if (extra.length) { items = items.concat(extra); out.rebuilt = true; }
      }
      for (const it of items) {
        const s = onDisk.get(it.f);
        if (s && s.size > 0) it.size = s.size;   // 索引里的假大小一律以磁盘为准
      }
      if (items.length) {
        for (const it of items) {
          try { const t = await window.gewu.backupRead(it.f); if (!t) throw new Error('空文件'); }
          catch (e) { it.missing = '副本文件已丢失'; }
        }
        out.items = items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      }
      if (!items.length) {
        // 目录也读不到才算真的没有：给出可区分的错误，不冒充「没有备份」。
        try { const list = await window.gewu.backupList(); if (!Array.isArray(list)) out.err = '备份目录读不到'; }
        catch (e) { out.err = '备份目录读不到：' + String((e && e.message) || e); }
      }
      // 旧版单槽 autosave.gewu 仍可读（老版本升级上来时它是唯一的恢复点）
      try {
        const p = await window.gewu.userPath('autosave.gewu');
        const i = await window.gewu.fileInfo(p);
        if (i && i.exists && i.size) out.legacy = { name: 'autosave.gewu', size: i.size, at: i.mtime || 0, title: '旧版单槽备份', path: '', format: 1 };
      } catch (e) { /* 没有旧槽 */ }
      return out;
    },
    // 1.6.7（T18）：删除一份恢复副本（版本历史里用）。只删这一份，别的不动；
    // 还没下一次自动备份时索引里先摘掉，避免列表里留一条读不到的幽灵。
    async dropBackup(name) {
      if (!gwFn('backupRemove')) {
        try {
          const meta = await browserBackupStore('readwrite', (store) => {
            const req = store.get('meta');
            req.onsuccess = () => { if (req.result?.f === name) store.clear(); };
            return req;
          });
          if (meta?.f !== name) return false;
          lastBackupRev = -1;
          return true;
        } catch (e) { return false; }
      }
      const f = String(name || '');
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(f) || f === BK.index || f === 'autosave.gewu') return false;
      try { await window.gewu.backupRemove(f); } catch (e) { /* 已被淘汰/占用 */ }
      try { await writeIndex((await readIndex()).filter((x) => x.f !== f)); } catch (e) { /* 索引坏了下次扫描会重建 */ }
      return true;
    },
    // 恢复某一份副本：先做未保存保护，再载入成"未保存到文件"的文档（不覆盖原 .gewu）
    async restoreBackup(name) {
      if (GW.classRoom?.isPlaying()) GW.classRoom.stopPlay();
      const pages = GW.doc.pages;
      try {
        let s = null;
        if (name === 'localStorage') s = localStorage.getItem('gewu.autosave');
        else if (!gwFn('backupRead')) {
          const entry = await browserBackupStore('readonly', (store) => store.get('snapshot'));
          if (entry?.f === name) s = entry.snapshot;
        }
        else if (name === 'autosave.gewu') s = await window.gewu.readFile(await window.gewu.userPath('autosave.gewu'), 'utf8');
        else s = await window.gewu.backupRead(name);
        if (!s) { GW.toast('这份备份已不可读', 4000); return false; }
        if (GW.doc.pages !== pages) return false;
        if (GW.doc.dirty) {
          if (!(await GW.confirm('当前板书尚未保存，恢复备份会替换它（当前内容会先存入新的恢复副本）。继续吗？'))) return false;
          if (GW.doc.pages !== pages) return false;
          const revision = editRevision;
          if (!(await GW.storage.autosave(true))) { GW.toast('自动备份失败，已取消恢复（当前内容没有被替换）', 4600); return false; }
          if (GW.doc.pages !== pages || editRevision !== revision) { GW.toast('板书有新改动，请重新恢复'); return false; }
        }
        load(s, null);
        GW.doc.dirty = true;
        saveState('backup', { at: Date.now(), err: '' });
        GW.bus.emit('dirty');
        return true;
      } catch (e) { GW.toast('恢复失败：' + ((e && e.message) || e), 4000); return false; }
    },
    // 旧入口：恢复最近一份可用备份（副本优先，旧单槽兜底）
    async restore() {
      try {
        const list = await GW.storage.backups();
        const first = (list.items || []).find((x) => !x.missing);
        if (first) return GW.storage.restoreBackup(first.f);
        if (list.legacy) return GW.storage.restoreBackup(list.legacy.name);
        return false;
      } catch (e) { console.warn('恢复失败', e); return false; }
    },
    // 导出当前画面为 PNG
    async exportView() {
      let url = null;
      // 主进程截图（capturePage）只有桌面有；shim 的同名桩恒返回 null ⇒ 拿不到就自己合成。
      if (gwFn('capturePage')) {
        // capturing 这个类名会让界面在截图那 80ms 里让位，必须无条件摘掉，否则截图失败后
        // 整个应用会停在「让位」状态（工具栏是空的）。原写法没有 try/finally，这里补上。
        document.body.classList.add('capturing');
        try {
          await new Promise((r) => setTimeout(r, 80));
          url = await window.gewu.capturePage();
        } catch (e) { url = null; }
        finally { document.body.classList.remove('capturing'); }
      }
      if (!url) {
        const c = document.createElement('canvas'); c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
        const x = c.getContext('2d');
        for (const id of ['bg-canvas', 'ink-canvas']) {
          const cv = document.getElementById(id);
          // 画布位图比视口大一圈（预渲染区），只抠视口那一块，否则导出图会多出边角
          if (!(GW.blitViewport && GW.blitViewport(x, cv, 0, 0, c.width, c.height))) x.drawImage(cv, 0, 0);
        }
        url = c.toDataURL('image/png');
      }
      if (!url) return;
      // 有「另存为 + 写文件」就走原生（桌面直接落盘、安卓经 shim 落系统下载目录），
      // 否则交给浏览器的下载（纯网页版）。shim 的 writeFile 返回 false 表示没写成功，要兜到下载。
      if (gwFn('saveDialog') && gwFn('writeFile')) {
        try {
          const p = await window.gewu.saveDialog({ title: '导出图片', defaultPath: '板书-' + stamp() + '.png', filters: [{ name: 'PNG 图片', extensions: ['png'] }] });
          if (!p) return;
          const wrote = await window.gewu.writeFile(p, url.split(',')[1], 'base64');
          if (wrote !== false) { GW.toast('已导出图片'); return; }
        } catch (e) { /* 落到下面的浏览器下载 */ }
      }
      GW.h('a', { href: url, download: '板书-' + stamp() + '.png' }).click();
    },
  };
  function stamp() { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`; }

  GW.initStorage = function () {
    // 1.1.14：透明批注层不参与持久化 —— 没有自动保存、不接管 open-doc / before-close。
    // 它的内容只在退出时由老师选「保留并退出」，走 overlay.js 的 PNG 回传。
    if (GW.overlayMode) return;
    // 自动保存：书写 / 拖动过程中先跳过（序列化整份文档会带来一次卡顿），停手后再存；
    // 但最多拖到 90 秒必存一次，保证意外关机时的损失有限。
    // 真正序列化时再让到浏览器空闲时间（requestIdleCallback），避免在大屏上出现半秒的顿帧。
    let lastSave = Date.now();
    const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 0));
    setInterval(() => {
      const busy = performance.now() - (GW.lastInput || 0) < 2500;
      if (busy && Date.now() - lastSave < 90000) return;
      lastSave = Date.now();
      idle(() => GW.storage.autosave());
    }, 20000);
    if (deskBridge()) {
      // 1.5.4 复审 #1：不在这里悄悄 autosave 后强关。交给共用的 exitGuard：
      // 成功才 close-now，失败让老师选「重试 / 另存为 / 强制退出」，绝不默认丢板书。
      window.gewu.on('before-close', () => {
        const go = () => window.gewu.win('close-now');
        if (GW.exitGuard) GW.exitGuard(go);
        else go();
      });
      window.gewu.on('close-timeout', () => { if (GW.closeTimeoutNotice) GW.closeTimeoutNotice(); });
      // 1.7.2（T09）：上次没正常退出 —— 提示条与「打开恢复副本 / 打开原文件」都在 app.js 里。
      window.gewu.on('session-dirty', (info) => { if (GW.showSessionBar) GW.showSessionBar(info || {}); });
      window.gewu.on('open-doc', (p) => GW.storage.open(p));
      // R5：双击 .ggb（安装包注册了文件关联）→ 作为 GeoGebra 卡片插到当前页预览
      window.gewu.on('open-ggb', (p) => {
        GW.importer.importOne(p).then(() => GW.toast('已打开 ' + String(p).split(/[\\/]/).pop())).catch((e) => GW.toast('GeoGebra 文件打不开：' + (e && e.message ? e.message : p), 4000));
      });
      window.gewu.on('insert-image', (url) => { GW.importer.insertDataURL(url, '桌面截图'); GW.toast('已把桌面截图插入当前页'); });
    } else document.addEventListener('visibilitychange', () => {
      if (document.hidden) GW.storage.autosave();
    });
  };
})();


