/* 数理无限画布 · 性能与渲染档位
 *
 * 教室旧一体机的现实：2GB 内存、无独显（或很差的独显）、有时显卡驱动被 Chromium 判为
 * 黑名单而退回软件渲染。渲染策略必须自适应，而不是一味堆质量：
 *   · 硬件加速可用 → 高档：按屏幕像素比精修，动画与激光辉光全开；
 *   · 显卡被屏蔽 / 软件渲染 → 兼容档：像素总量砍掉一大半，辉光等昂贵效果关掉，
 *     缩放平移仍以合成层兜底，尽量做到「行笔跟手、拖动不掉帧」；
 *   · 极端情况下还可选择「流畅优先」，进一步降到 1 倍分辨率。
 * 老师也可以在设置里手动指定档位（auto / high / lite）。
 */
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW) return;

  const MAX_DPR = 4;         // 粗暴上限，避免异常显示器把画布撑爆
  // maxPixels：背景 / 墨迹 / 实时三块画布**每块的像素总量上限**。
  // 只在「确认有 GPU 加速」时才敢用（见 inkDprFor 的注释）：
  // 有 GPU 时把画布缩小是一次廉价的硬件 blit，省下的光栅面积是净赚；
  // 没有 GPU（或被驱动黑名单退回软件渲染）时，缩小画布等于让合成器每帧做一次
  // 全屏 CPU 重采样 —— 本机实测：只把比值从 1 改成 0.73，拖动/书写就从 59fps
  // 掉到 23~30fps，且与砍掉多少像素无关（0.85 与 0.5 一样慢），因为输出面积始终是满屏。
  const CFG = {
    high: { dprCap: 2, maxPixels: 8.4e6, simDprCap: 2, coalesce: true, glow: true, fullCleanMs: 140, hideWorldOnPan: false, minPoint: 0.7 },
    mid: { dprCap: 1, maxPixels: 6.0e6, simDprCap: 1.25, coalesce: true, glow: true, fullCleanMs: 200, hideWorldOnPan: true, minPoint: 0.9 },
    lite: { dprCap: 1, maxPixels: 4.2e6, simDprCap: 1, coalesce: true, glow: false, fullCleanMs: 320, hideWorldOnPan: true, minPoint: 1.2 },
  };

  const perf = (GW.perf = {
    naturalDpr: Math.min(MAX_DPR, window.devicePixelRatio || 1),
    mode: 'auto',          // 用户在设置里选的档位
    tier: 'mid',           // 实际生效档位
    gpu: null,             // 主进程上报的加速状态
    caps: CFG.mid,
    get dpr() { return perf.caps.dprCap; },
    // 兼容档位下，画布上的 DOM 对象（iframe / 视频 / 仿真）拖动期间不参与合成
    get hideWorldOnPan() { return perf.caps.hideWorldOnPan; },
    // 单帧最多处理多少个合并指针事件（弱机上合并点太多会拖慢主线程）
    get coalesce() { return perf.caps.coalesce; },
    get glow() { return perf.caps.glow; },
    // 笔迹抽稀阈值（世界单位 / 屏幕像素）
    get minPoint() { return perf.caps.minPoint; },
    // 停手后精修一帧的延迟
    get fullCleanMs() { return perf.caps.fullCleanMs; },
    // 仿真画布像素比上限
    get simDpr() { return Math.min(perf.caps.simDprCap, perf.naturalDpr); },
  });

  function pickTier() {
    if (perf.mode === 'high') return 'high';
    if (perf.mode === 'lite') return 'lite';
    const g = perf.gpu;
    if (!g || g.accelerated == null) return 'mid';   // 还没探测到：先守中档
    if (g.accelerated) return g.software ? 'mid' : 'high';
    return 'lite';
  }

  // 应用档位；返回是否真的发生了变化（调用方据此重建画布 / 重排版）
  perf.apply = function (opts) {
    if (opts && opts.mode) perf.mode = opts.mode;
    const tier = pickTier();
    const changed = tier !== perf.tier;
    perf.tier = tier;
    perf.caps = CFG[tier] || CFG.mid;
    document.body.classList.toggle('perf-lite', tier === 'lite');
    document.body.classList.toggle('perf-high', tier === 'high');
    // 供鼠标滚轮等场景使用：屏幕上 1px 对应多少世界单位（把缩放算进去）
    perf.lastChanged = changed;
    return changed;
  };

  perf.label = () => ({ auto: '自动', high: '强制高质量', lite: '流畅优先' }[perf.mode] || '自动');
  perf.tierLabel = () => ({ high: '高质量（硬件加速）', mid: '均衡', lite: '流畅优先（兼容）' }[perf.tier] || perf.tier);

  // 主进程上报显卡状态后调用；返回是否需要在新的档位下重建渲染层
  perf.setGpu = function (g) {
    perf.gpu = g || null;
    return perf.apply();
  };

  // 画布 2D 上下文：统一带上有利于合成 / 低延迟的参数。
  // 刻意不用 desynchronized:true —— 它会把画布内容从合成器的 CSS 变换里摘出去，
  // 而本项目「拖动只改 CSS 变换、不重画」的快速通道依赖合成器统一变换，两者会打架。
  perf.ctx2d = function (canvas, opts) {
    const o = opts || {};
    const attrs = { alpha: o.alpha !== false, willReadFrequently: !!o.read, preserveDrawingBuffer: false };
    try { return canvas.getContext('2d', attrs) || canvas.getContext('2d'); } catch (e) { return canvas.getContext('2d'); }
  };

  // 缩放时墨迹画布的像素比：按当前视觉缩放动态调整，避免放大后糊、平时又太贵
  perf.inkDpr = function (viewScale) {
    const s = viewScale || 1;
    // 只在缩放超过 ~1.15 倍（或缩小到 0.87 倍）时才真的换档，避免缩放过程中反复重建画布
    const bands = s < 0.6 ? 0.55 : s < 0.85 ? 0.7 : s < 1.15 ? 1 : s < 1.8 ? 1.2 : s < 3 ? 1.45 : 1.75;
    return perf.clamp(perf.naturalDpr * bands, 0.5, MAX_DPR);
  };

  perf.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 软件渲染下的硬上限（每块画布像素数）。它不是「省光栅面积」的预算，而是防爆阀：
  // 4K 面板 + Windows 200% 缩放时 devicePixelRatio=2，三块画布会各要 31Mpx
  // （约 125MB/块，共 375MB）—— 教室里那些 2GB 内存的一体机直接就没法用了。
  // 阈值刻意定得很高：4K@dpr1（7.9Mpx）和 1080p@dpr2（8.3Mpx）都进不来，
  // 即正常机器永远不会因为这条被降采样（降采样在软件渲染下是全屏重采样，见下）。
  const SOFT_MAX_PIXELS = 1.6e7;

  // 档位切换的最终像素比：兼顾「档位上限」「缩放清晰度」与「每块画布的总像素预算」。
  //
  // 这里有一条**实测得出**的硬规则：画布 backing store 与 CSS 尺寸不一致时，
  // 合成器每帧都要把整块画布重采样一次。有 GPU 时那是一次廉价的硬件 blit，
  // 所以「缩小画布省光栅面积」是净赚；但在软件渲染下它是纯 CPU 的全屏滤波，
  // 代价与**输出**面积成正比，跟砍掉多少像素毫无关系 —— 实测把比值从 1 改成
  // 0.73 后，拖动/书写从 59fps 掉到 23~30fps，而 0.85 与 0.5 一样慢。
  // 因此：没确认到 GPU 加速时不做「为了省面积」的降采样，只守 SOFT_MAX_PIXELS 防爆阀。
  perf.canResample = () => !!(perf.gpu && perf.gpu.accelerated === true && !perf.gpu.software);
  perf.inkDprFor = function (viewScale, w, h) {
    const nat = perf.clamp(perf.naturalDpr, 0.35, MAX_DPR);
    if (!perf.canResample()) {
      if (!w || !h) return nat;
      const byCeil = Math.sqrt(SOFT_MAX_PIXELS / (w * h));
      // 1.7.1：放大书写要清晰。平板/安卓基本都落在软件渲染这条线上，原来这里**完全不看缩放**，
      // 放大到 2× 之后笔迹就是把 1:1 的位图拉大 —— 用户看到的「糊在一起」。
      // 只往上加、不往下减（降采样在软件渲染下是全屏 CPU 滤波，实测 59fps→23fps），
      // 倍数封在 2× 且仍然受 SOFT_MAX_PIXELS 防爆阀约束：4K 面板上这条线不生效，与原行为一致。
      const zoomBoost = perf.clamp(viewScale || 1, 1, 2);
      const raw = Math.min(nat * zoomBoost, perf.clamp(byCeil, 0.35, MAX_DPR));
      // 2.0.10：设备像素比是 1.25/1.5 这类分数时，**不能**再往整数上取整。
      // 以前 nat 恒为 1 或 2（主进程把 dpr 钉死成 1 造成的巧合），取整只在「放大后的倍率」上发生；
      // 现在 DPR 跟系统走，125%/150% 的机器上 nat 就是 1.25/1.5 —— 取整到 2 等于让三张满屏画布
      // 多画 78%/33% 的像素，而取整到 1 又变成「位图 ≠ 屏幕」的每帧全屏重采样（实测掉到 23fps）。
      // 只有上调出来的倍率才需要抹平（那是人为倍率，不是设备像素比）。
      if (raw <= nat + 1e-6) return nat;
      // 1.7.2：像素比必须是整数（或至少 0.5 的整数倍），否则位图与 CSS 尺寸的比值
      // 是个小数（例：1400×900 的平板放大到 3× 时 byCeil 算出来 3.56），浏览器把
      // 位图重采样到非整数倍率上，边缘就发虚 —— 这正是「缩小/放大都糊」的另一半原因。
      return raw >= 1 ? Math.round(raw) : Math.round(raw * 2) / 2;
    }
    const byCap = Math.min(perf.caps.dprCap, perf.inkDpr(viewScale));
    const budget = perf.caps.maxPixels;
    if (!budget || !w || !h) return byCap;
    const byBudget = Math.sqrt(budget / (w * h));
    return perf.clamp(Math.min(byCap, byBudget), 0.35, MAX_DPR);
  };

  // ---------- 帧调度：多处请求绘制时只跑一次回调 ----------
  const pending = [];
  let rafId = 0;
  function drain() {
    rafId = 0;
    const list = pending.slice();
    pending.length = 0;
    for (const fn of list) { try { fn(); } catch (e) { console.error(e); } }
  }
  perf.frame = function (fn) {
    // 同一个回调一帧内只排一次 —— 这句不去重，下面这条链会让「每帧执行次数」只增不减：
    //   board.js 的 frame() 末尾 `if (needLive) requestFrame()` 会再排一次自己；
    //   requestLive() 每收到一个指针事件也排一次；
    //   而 drain() 只取一次快照，排进来的回调各自又会再排一次。
    // 于是**过去每一次 requestLive() 都永久地给每帧多加一次 frame()**。
    // 实测：激光笔写一笔，frame() 每帧跑 285 次、2 个 pointermove 就让 pending 每帧净增 2。
    // 受影响的是所有常驻实时层的工具（激光笔、荧光笔、橡皮光圈、图形预览、选区）。
    if (pending.indexOf(fn) >= 0) return;
    pending.push(fn);
    if (!rafId) rafId = requestAnimationFrame(drain);
  };

  // ---------- 触摸 / 指针事件监听：once 参数在 Chromium 108 上可能把 passive 顶掉，统一容错 ----------
  perf.on = function (target, type, fn, opts) {
    try { target.addEventListener(type, fn, opts); }
    catch (e) { target.addEventListener(type, fn, typeof opts === 'object' ? opts.capture : opts); }
  };

  perf.apply();
})();
