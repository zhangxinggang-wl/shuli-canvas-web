/* 数理无限画布 · 笔迹风格内核（2.0.4）
 *
 * 解决的问题：2.0.2 以前「笔种」只有三档笔感（钢笔 / 铅笔 / 马克笔），而且是在 input.js 里
 * 用三个三元表达式改系数实现的 —— 三档之间只是压感斜率不同，写出来都是同一种「一头粗一头细」
 * 的线。老师在红外一体机上写字时，这套笔锋反而成了累赘：报点本身有 0.5~2px 量化抖动，
 * 再叠一层速度笔锋，笔画边缘就是锯齿；而在 iPad / 电磁屏上又嫌笔锋太单一，写不出毛笔的提按、
 * 粉笔的干涩、马克笔的平头。
 *
 * 所以这里把「一支笔怎么算宽度、怎么收笔、怎么上纹理」收敛成一张纯数据的表：
 *   · 宽度：压感映射 [pLo, pHi]、速度映射 [vK, vLo, vMax]，两者互斥（有真压感走压感，没有走速度）；
 *   · 起收笔：入锋长度 / 起笔宽度比例 / 出锋长度 / 收笔宽度 / 收笔锋型；
 *   · 渲染：端帽（圆 / 平）、颗粒强度、基础不透明度、倾斜加成。
 * 全部是**纯函数 + 常量**，不碰 DOM、不碰 GW.settings 之外的宿主状态，所以 Node 里能直接单测
 * （scripts/check-ink-style.js），也能被 input.js（算宽度）和 board.js（画纹理）同时复用。
 *
 * 2.0.4 兼容性铁律（用户 2026-11-13 拍板，见 TASK-2.0.4 §8）：
 *   · **老存档逐像素等价**：`renderOf()` 对没有 `pen` 字段的老笔迹走冻结的 `LEGACY_GEL_203`
 *     常量快照，这张表从此不随任何新默认值变化；新笔迹一律写 `pen` 字段走 2.0.4 表。
 *   · **新增设置键缺省 = 2.0.3 行为**：`penTipCfg` 为空 / 缺键时，`tipConfig()` 逐位回落默认，
 *     `pressureCurve` 的默认档（2）= 原来的线性 `pressureW`，稳定度 0 = 原来的一次 1-2-1 整形。
 *   · `penInk` 为空仍回落 gel。
 *
 * 2.0.4 压感曲线（用户拍板口径 A · 自研，非第三方二进制搬运）：
 *   WASM 黑盒测量链路实测 NO-GO（详见 docs/notes/2.0.4-01-pressure-curve-gonogo.md），
 *   故 `pressureCurve` 只用**可读源码里的算法机制**自研：
 *     EasiNote C# 的 `Pow(num, 0.4)` / `WidthBeautifier` 一阶阻尼、WASM 符号里的
 *     `smoothstep` / `pressureDamping` / `ToolThicknessBounds`、GoodNotes 前端 5 档线性查表。
 *   产出是项目自研的纯函数与系数表，**未经 WASM 实测拟合**，不冒充任何厂商曲线。
 *   合规边界：只借机制与参数命名，不搬二进制片段、不复制反编译源码。
 *
 * 平台适配：每支笔都带 platform 偏好（红外 / 电磁 / 通用），pen.js 判定出设备后
 * 可以据此给出「这台机器上默认用哪支笔」的建议 —— 但**绝不自动改用户选的笔**，
 * 只在诊断面板里给一句提示（老师的笔不能被程序悄悄换掉）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.GW = root.GW || {}; root.GW.inkStyle = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 笔种表 ----------
  // 字段说明（全部可缺省，缺省值见 DEFAULTS）：
  //   wScale   基础笔宽倍数（乘在工具选定的 width 上；毛笔天生比钢笔粗）
  //   pLo/pHi  压感映射：pressure=0 → wScale*pLo，pressure=1 → wScale*pHi
  //   pressK   压感灵敏度（用户「压感灵敏度」这一档再乘一次）
  //   vK/vLo/vMax  速度映射：m = clamp(vMax - v*vK*(0.55+0.45*gain), vLo, vMax)
  //   slope    相邻采样点宽度变化上限（0.18 = 每点最多 ±18%，防一笔之内忽粗忽细）
  //   entry    入锋长度（相对笔宽的屏幕像素倍数）  entryFrom 起笔时宽度比例
  //   exitLen  出锋长度倍数（相对笔宽）            exitW     收笔宽度比例
  //   tip      收笔锋型 sharp 出锋 / round 藏锋 / flat 方切（settings.penTipAuto 时才用）
  //   cap      端帽 round 圆 / butt 平（马克笔、粉笔的平头）
  //   grain    颗粒强度 0~1（铅笔 / 粉笔），0 = 纯实心轮廓
  //   alpha    基础不透明度（粉笔、铅笔本身就是「压不实」的）
  //   tilt     倾斜加成（笔杆越平越宽；0 = 不认倾斜）
  //   plat     这台机器上更适合的笔：any | infrared | emr（只用于诊断建议）
  const DEFAULTS = {
    wScale: 1, pLo: 0.26, pHi: 1.76, pressK: 1,
    vK: 0.3, vLo: 0.55, vMax: 1.25, slope: 0.18,
    entry: 2.0, entryFrom: 0.34, exitLen: 3.2, exitW: 0.12,
    tip: 'sharp', cap: 'round', grain: 0, alpha: 1, tilt: 0.6, plat: 'any',
  };

  const STYLES = {
    // 中性笔：2.0.2 的默认手感，逐位不变
    gel: {
      id: 'gel', label: '中性笔', short: '中性', group: '常用',
      hint: '默认笔。压感/速度出粗细，起笔渐入、收笔出锋。',
    },
    // 圆珠笔：几乎没有粗细变化，写字最快、最省眼；红外屏上最不容易看出报点抖动
    ball: {
      id: 'ball', label: '圆珠笔', short: '圆珠', group: '常用',
      hint: '粗细基本不变，边缘干净。红外一体机上最稳，适合大量板书。',
      pLo: 0.72, pHi: 1.28, vK: 0.2, vLo: 0.8, vMax: 1.12, slope: 0.1,
      entry: 1.2, entryFrom: 0.7, exitLen: 1.4, exitW: 0.55, tilt: 0,
      plat: 'infrared',
    },
    // 硬笔：完全直通，零加工。屏幕报点脏、笔迹发毛时用它 —— 画什么就是什么
    plain: {
      id: 'plain', label: '硬笔（直通）', short: '硬笔', group: '常用',
      hint: '不滤波、不出锋、不加粗：屏幕报什么就画什么。抖动明显的白板上最干净。',
      pLo: 1, pHi: 1, vK: 0, vLo: 1, vMax: 1, slope: 1,
      entry: 0, entryFrom: 1, exitLen: 0, exitW: 1, tip: 'flat', tilt: 0,
      plat: 'infrared',
    },
    // 钢笔：压感范围最大、出锋最长，撇捺有明显的尖
    fountain: {
      id: 'fountain', label: '钢笔', short: '钢笔', group: '书写',
      hint: '压感范围大、收笔出锋长。电磁笔/iPad 上写汉字最好看。',
      pLo: 0.18, pHi: 2.0, pressK: 1.15, vK: 0.38, vLo: 0.46,
      slope: 0.2, entry: 2.4, entryFrom: 0.26, exitLen: 3.8, exitW: 0.1,
      tilt: 0.5, plat: 'emr',
    },
    // 毛笔：入锋重、提按大、出锋最长
    brush: {
      id: 'brush', label: '毛笔', short: '毛笔', group: '书写',
      hint: '一落笔就粗，提笔变细，收笔拖出锋尖。写大字、写课题。',
      wScale: 1.55, pLo: 0.12, pHi: 2.2, pressK: 1.2,
      vK: 0.86, vLo: 0.16, vMax: 1.3, slope: 0.26,
      entry: 2.9, entryFrom: 0.2, exitLen: 5.2, exitW: 0.08, tilt: 1,
      plat: 'emr',
    },
    // 铅笔：细、淡、有颗粒
    pencil: {
      id: 'pencil', label: '铅笔', short: '铅笔', group: '纹理',
      hint: '细而淡，带纸面颗粒。打草稿、画辅助线不抢主板书。',
      pLo: 0.3, pHi: 1.45, vK: 0.52, vLo: 0.42, slope: 0.16,
      entry: 1.6, entryFrom: 0.5, exitLen: 2.2, exitW: 0.3,
      grain: 0.45, alpha: 0.92, tilt: 0.8,
    },
    // 马克笔：平头、宽、颜色实
    marker: {
      id: 'marker', label: '马克笔', short: '马克', group: '纹理',
      hint: '平头宽笔，粗细变化很小。圈重点、写标题。',
      wScale: 1.25, pLo: 0.82, pHi: 1.3, vK: 0.12, vLo: 0.86, vMax: 1.16,
      slope: 0.08, entry: 0.8, entryFrom: 0.92, exitLen: 1.2, exitW: 0.9,
      cap: 'butt', alpha: 0.96, tilt: 0,
    },
    // 粉笔：干涩、边缘毛、压不实（教室黑板场景）
    chalk: {
      id: 'chalk', label: '粉笔', short: '粉笔', group: '纹理',
      hint: '干涩有颗粒、边缘毛糙，像在绿板/黑板上写。',
      wScale: 1.35, pLo: 0.72, pHi: 1.35, vK: 0.3, vLo: 0.7,
      slope: 0.2, entry: 1.2, entryFrom: 0.6, exitLen: 2.0, exitW: 0.42,
      cap: 'butt', grain: 0.8, alpha: 0.9, tilt: 0,
    },
  };

  // 默认笔：老存档、老调用点一律落到这里（= 2.0.2 的行为）
  const DEFAULT_ID = 'gel';
  const ORDER = ['gel', 'ball', 'plain', 'fountain', 'brush', 'pencil', 'marker', 'chalk'];

  function of(id) {
    const base = STYLES[id] || STYLES[DEFAULT_ID];
    return Object.assign({}, DEFAULTS, base);
  }
  function list() {
    return ORDER.map((k) => Object.assign({}, DEFAULTS, STYLES[k]));
  }
  function has(id) { return !!(id && STYLES[id]); }

  // ---------- 2.0.4：老存档的冻结快照 ----------
  // 这是 2.0.3 里 `of('gel')` 的完整结果，逐字段抄死后 Object.freeze。
  // 从此不管 DEFAULTS / STYLES / 新预设怎么调，没有 pen 字段的老笔迹永远按这张表画。
  // scripts/check-ink-style.js 的「老档回放」断言会把每个字段钉死。
  const LEGACY_GEL_203 = Object.freeze({
    wScale: 1, pLo: 0.26, pHi: 1.76, pressK: 1,
    vK: 0.3, vLo: 0.55, vMax: 1.25, slope: 0.18,
    entry: 2.0, entryFrom: 0.34, exitLen: 3.2, exitW: 0.12,
    tip: 'sharp', cap: 'round', grain: 0, alpha: 1, tilt: 0.6, plat: 'any',
    id: 'gel', label: '中性笔', short: '中性', group: '常用',
    hint: '默认笔。压感/速度出粗细，起笔渐入、收笔出锋。',
  });

  // ---------- 宽度映射（纯函数） ----------
  // 压感：pEff 已经把「设备报的 pressure」按灵敏度拉开，这里只做区间映射。
  function pressureW(st, pEff) {
    const s = st || DEFAULTS;
    const p = Math.max(0, Math.min(1, pEff));
    return s.pLo + p * (s.pHi - s.pLo);
  }
  // 2.0.4 自研压感响应面（口径 A，非 WASM 实测拟合）：
  //   S(x) = (1 - smooth) * x^gamma + smooth * smoothstep(x)
  //   w     = pLo + (pHi - pLo) * S(clamp(pEff, 0, 1))
  // 函数族来自可读证据：EasiNote C# `Pow(num, 0.4)`、WASM 符号 smoothstep /
  // pressureDamping / ToolThicknessBounds / minimumStrokeThicknessInPixels。
  // **档 2 是恒等映射**（gamma=1, smooth=0）⇒ 缺省逐位等价 2.0.3 的 pressureW。
  // 单调不减 / 无内部拐点 / p=0 取最小厚度 / p=1 取最大厚度，由 check-ink-style 逐档断言。
  const CURVE_STOPS = Object.freeze([
    { gamma: 1.60, smooth: 0.00 },   // 0 细：低压段更细
    { gamma: 1.25, smooth: 0.10 },   // 1
    { gamma: 1.00, smooth: 0.00 },   // 2 线性 ≡ 2.0.3（默认）
    { gamma: 0.70, smooth: 0.16 },   // 3
    { gamma: 0.40, smooth: 0.28 },   // 4 饱满：EasiNote Pow(.,0.4) 的量级
  ]);
  function pressureCurve(st, pEff, cfg) {
    const s = st || DEFAULTS;
    const c = cfg && cfg.penPressCurve != null
      ? Math.max(0, Math.min(4, Math.round(cfg.penPressCurve))) : 2;
    const p = Math.max(0, Math.min(1, pEff));
    const k = CURVE_STOPS[c];
    let shaped = p;
    if (k.gamma !== 1 || k.smooth !== 0) {
      const ss = p * p * (3 - 2 * p);
      shaped = (1 - k.smooth) * Math.pow(p, k.gamma) + k.smooth * ss;
    }
    return s.pLo + shaped * (s.pHi - s.pLo);
  }
  // 速度：v 是屏幕像素/毫秒（已做 EMA）。gain = 用户压感灵敏度（无压感设备上同样放大速度影响）。
  function speedW(st, v, gain) {
    const s = st || DEFAULTS;
    const g = gain == null ? 1 : gain;
    const m = s.vMax - v * s.vK * (0.55 + 0.45 * g);
    return Math.max(s.vLo, Math.min(s.vMax, m));
  }
  // 倾斜：t 是 hypot(tiltX,tiltY)/90（0 笔直，1 放平）
  function tiltK(st, t) {
    const s = st || DEFAULTS;
    return 1 + (s.tilt || 0) * Math.max(0, Math.min(1, t || 0));
  }
  // 入锋：走过 entryPx 屏幕像素后到满宽；d = 已走过的屏幕像素
  function entryK(st, d, entryPx) {
    const s = st || DEFAULTS;
    const from = s.entryFrom == null ? 0.34 : s.entryFrom;
    if (from >= 1 || !(entryPx > 0)) return 1;
    return d >= entryPx ? 1 : from + (1 - from) * (d / entryPx);
  }

  // ---------- 2.0.4：六维笔锋参数 ----------
  // 原则：只作用于 widthAt / 收笔整形算出的 ws 与端帽 cap，不改点列、不新增渲染分支
  // ⇒ 存档 / 协同 / 导出 / 缩略图 / 桌面层同源。缺省逐位等价 2.0.3。
  // tipFloor = 该笔种「锋尖锐度」可调下限，exitW 永远以 sty.exitW 为锚、禁止全局 .12 覆盖。
  // bypass   = plain 整支直通，六维全部 no-op。
  const TIP_PRESETS = Object.freeze({
    gel:      { tipFloor: 0.12 },
    fountain: { tipFloor: 0.10 },
    brush:    { tipFloor: 0.08 },
    ball:     { tipFloor: 0.30 },
    marker:   { tipFloor: 0.55 },
    chalk:    { tipFloor: 0.30 },
    pencil:   { tipFloor: 0.18 },
    plain:    { tipFloor: 1, bypass: true },
  });
  const TIP_KEYS = Object.freeze([
    'penTipSharp', 'penTipFlat', 'penTip', 'penExit', 'penPressCurve', 'penStabilize',
  ]);
  // UI 直接按这张表生成 6 个控件；改档位只改这里，app.js 不用跟着改。
  const TIP_DIMS = Object.freeze([
    { key: 'penTipSharp', label: '笔尖锐度', min: 0, max: 1, step: 0.25, stops: 5,
      hint: '钝 → 尖。按笔种有自己的下限，圆珠/马克/粉笔/铅笔不会被调成尖尾。' },
    { key: 'penTipFlat', label: '笔尖扁平度', min: 0, max: 1, step: 1 / 3, stops: 4,
      hint: '平 / 33 / 66 / 圆。圆帽笔改椭圆，平头笔改端边斜切角。' },
    { key: 'penTip', label: '收笔锋型', options: [
      { v: 'sharp', t: '出锋' }, { v: 'round', t: '藏锋' }, { v: 'flat', t: '方切' },
      { v: 'back', t: '回锋（顿）' }, { v: 'flatEnd', t: '平收' },
    ], hint: '平头笔的「出锋」解释为端边斜切，不是尖尾。' },
    { key: 'penExit', label: '锋长', min: 0.3, max: 2, step: 0.1, stops: 10,
      hint: '出锋影响的长度倍率，10 档。' },
    { key: 'penPressCurve', label: '压感曲线', min: 0, max: 4, step: 1, stops: 5,
      hint: '自研曲线族 5 档；中间档 = 线性（2.0.3 原行为）。' },
    { key: 'penStabilize', label: '画笔稳定性', min: 0, max: 1, step: 0.25, stops: 5,
      hint: '0 / 25 / 50 / 75 / 100，叠加 1-2-1 宽度滤波，压住报点抖动。' },
  ]);
  const TIP_OPTIONS = Object.freeze(['sharp', 'round', 'flat', 'back', 'flatEnd']);

  function tipDefaults(penId) {
    const id = has(penId) ? penId : DEFAULT_ID;
    const st = of(id);
    const pre = TIP_PRESETS[id] || {};
    return {
      penTipSharp: 0, penTipFlat: 0, penTip: st.tip,
      penExit: 1.1, penPressCurve: 2, penStabilize: 0,
      tipFloor: pre.tipFloor == null ? 0.12 : pre.tipFloor,
      bypass: !!pre.bypass,
    };
  }
  // userCfg 是 GW.settings.penTipCfg（按笔种分组的对象）。缺键 / 脏值一律回落默认并钳制，
  // 这样老设置、被截断的设置、恶意注入都不会把某一支笔写出界。
  function tipConfig(penId, userCfg) {
    const d = tipDefaults(penId);
    const id = has(penId) ? penId : DEFAULT_ID;
    const u = (userCfg && typeof userCfg === 'object') ? userCfg[id] : null;
    if (!u || typeof u !== 'object') return d;
    const out = Object.assign({}, d);
    const num = (v, lo, hi, fb) => {
      const x = +v;
      return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : fb;
    };
    if (u.penTipSharp != null) out.penTipSharp = num(u.penTipSharp, 0, 1, d.penTipSharp);
    if (u.penTipFlat != null) out.penTipFlat = num(u.penTipFlat, 0, 1, d.penTipFlat);
    if (u.penExit != null) out.penExit = num(u.penExit, 0.3, 2, d.penExit);
    if (u.penPressCurve != null) out.penPressCurve = Math.round(num(u.penPressCurve, 0, 4, d.penPressCurve));
    if (u.penStabilize != null) out.penStabilize = num(u.penStabilize, 0, 1, d.penStabilize);
    if (typeof u.penTip === 'string' && TIP_OPTIONS.indexOf(u.penTip) >= 0) out.penTip = u.penTip;
    return out;
  }
  // 稳定度 → 1-2-1 整形的遍数与中心权重。默认 0 ⇒ passes=1, center=2，正是 2.0.3 的 (a+2b+c)/4。
  function stabWeights(stab) {
    const v = Math.max(0, Math.min(1, +stab || 0));
    return { passes: 1 + Math.round(v * 2), center: 2 + 2 * v };
  }

  // ---------- 渲染侧 ----------
  // 老笔迹没有 pen 字段 ⇒ 按冻结的 2.0.3 快照画（保证 2.0.2 及以前的板书逐像素一样）。
  // 新笔迹带 pen ⇒ 走 2.0.4 表。renderOf 一律返回副本，调用方改字段不会污染常量表。
  function renderOf(it) {
    if (!it || !it.pen) return Object.assign({}, LEGACY_GEL_203);
    return of(it.pen);
  }
  // 颗粒相位：按笔迹 id 派生，保证每帧、每次重绘、导出、缩略图看到的颗粒位置都一样
  function hash(str) {
    let h = 2166136261;
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seed(it) { return hash(it && it.id ? it.id : 'gw'); }
  // 是否「有颗粒」的笔：有颗粒就不能走增量墨迹快路径 —— 那条路径只画新增的一段实心墨，
  // 颗粒是「整条轮廓内打孔」，只补末段会让一笔的前后质感不一样（前面实心、尾巴带颗粒）。
  function grainy(id) { const s = STYLES[id]; return !!(s && s.grain > 0); }

  // ---------- 2.0.7（C4）：第二组标定 —— 笔尖几何语义 ----------
  // 来源（只借**参数语义**，不搬代码/阈值）：
  //   ① EasiNote 的 ArtWritingModes：笔尖有「倾角」与「扁平度」两个可调维度，
  //      倾角决定提按的陡缓（立起写线条更挺），扁平度决定侧锋的横向宽度。
  //   ② Notability 的 nibAngle / nibFlatness：同一支笔在不同握姿下笔锋宽窄不同。
  // 这里把它们映射到本项目已有的两个量（tiltK 的 tilt、笔宽映射的 slope），只用于**建议档**：
  //   - 绝不改 DEFAULTS / STYLES 里的任何默认值（2.0.4 的默认档必须逐位等价，⑨ 组守着）。
  //   - 建议档只在诊断面板展示 / fixture 校验，用户点了才写入设置。
  const NIB = {
    // pen: [nibAngle(度), nibFlatness(0..1), 说明]
    gel: [58, 0.30, '中性笔：圆珠，倾角中性、扁平度低'],
    ball: [50, 0.18, '圆珠笔：更圆的珠，扁平度最低'],
    plain: [52, 0.22, '硬笔：均匀线，参数只作参考'],
    fountain: [62, 0.42, '钢笔：明尖，倾角偏立、侧锋略扁'],
    brush: [34, 0.72, '毛笔：软毫铺锋，倾角最斜、扁平度最高'],
    pencil: [46, 0.55, '铅笔：石墨磨钝，扁平度中等'],
    marker: [40, 0.85, '马克笔：斜切头，最扁'],
    chalk: [36, 0.66, '粉笔：棱角磨圆，介于毛笔与铅笔之间'],
  };
  // 倾角 → slope（提按陡缓）：20°→0.55，80°→1.75，线性；扁平度 → tilt（侧锋宽度）：0→0.55，1→1.9
  function nibSuggest(id) {
    const n = NIB[id];
    if (!n) return null;
    const [ang, flat, why] = n;
    const slope = 0.55 + (Math.max(20, Math.min(80, ang)) - 20) / 60 * 1.2;
    const tilt = 0.55 + Math.max(0, Math.min(1, flat)) * 1.35;
    return { id, nibAngle: ang, nibFlatness: flat, slope: +slope.toFixed(3), tilt: +tilt.toFixed(3), why };
  }

  // ---------- 平台建议（只用于诊断面板的一句话，不自动换笔） ----------
  function suggest(device) {
    if (device === 'infrared') return { id: 'ball', why: '红外屏报点有量化抖动：圆珠笔/硬笔最稳，毛笔的细锋会被抖成锯齿' };
    if (device === 'emr') return { id: 'fountain', why: '电磁笔有真压感：钢笔/毛笔的提按才用得出来' };
    if (device === 'mouse') return { id: 'gel', why: '鼠标没有压感，中性笔按速度出锋最自然' };
    return { id: DEFAULT_ID, why: '还没识别出屏幕类型，先用默认的中性笔' };
  }

  // ---------- 当前笔（浏览器侧读设置；Node 侧没有设置就返回默认） ----------
  function current() {
    try {
      const S = (typeof window !== 'undefined' && window.GW && window.GW.settings) || null;
      if (!S) return of(DEFAULT_ID);
      if (has(S.penInk)) return of(S.penInk);
      // 老设置迁移：2.0.2 的 brush 三档 → 新笔种（只在没有 penStyle 时生效）
      const map = { pen: 'gel', pencil: 'pencil', marker: 'marker' };
      if (S.brush && map[S.brush]) return of(map[S.brush]);
    } catch (_) {}
    return of(DEFAULT_ID);
  }
  function id() { return current().id; }

  return {
    STYLES, ORDER, DEFAULTS, DEFAULT_ID,
    of, list, has, current, id, suggest,
    NIB, nibSuggest,
    pressureW, pressureCurve, speedW, tiltK, entryK,
    renderOf, seed, hash, grainy,
    LEGACY_GEL_203, CURVE_STOPS, TIP_DIMS, TIP_KEYS, TIP_PRESETS, TIP_OPTIONS,
    tipDefaults, tipConfig, stabWeights,
  };
});
