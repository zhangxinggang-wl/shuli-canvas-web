/* 数理无限画布 · 笔迹机制层（ink-kernel）
 *
 * 定位：反编译内核 WASMInkCanvasApp.wasm 里有 376 个导出，符号表能读到的机制名有
 *   OneEuroFilter / PointsToOutlineV2 / HobbySpline / partialErasers / pressureDamping /
 *   RealTimePenRenderer / PalmRejectionV2 / CycleFinder。
 * 这些名字是**可观察行为的线索**，不是可搬运的代码。本模块按「机制 + 参数语义」自研实现，
 * 与 2.0.4 压感曲线同一条合规路线（见 docs/notes/2.0.4-01-pressure-curve-gonogo.md）：
 * 只借机制与命名，不搬二进制、不复制反编译代码。
 *
 * 为什么要有这一层（而不是继续散在 input.js 里）：
 *   同一个「把报点变成一笔」的流程，现在由 input.js（取点）、ink-style.js（算宽度）、
 *   board.js（画）三处分担，各自都有平滑/插值的半套实现。想要「换一种平滑」就得改三处，
 *   想要「关掉插值」也没有开关。这里把四个可替换环节收成一个契约：
 *
 *     smoother  报点 → 报点（去抖）        oneEuro / none
 *     spline    稀疏点 → 密点（曲线拟合）  catmull / hobby / linear
 *     pressure  压感 → 宽度系数            curve(gamma) / linear
 *     eraser    笔画 → 擦除后的若干段      partialErase
 *
 * 宿主（input.js / board.js）不必改，只有显式调用 GW.inkKernel.* 的地方才受影响；
 * inkDriver 里给出的是「可选接法」，默认不接管任何现有绘制路径 —— 老师手里的笔感
 * 不能在没验证前被程序悄悄换掉（与 2.0.4 的同一条铁律）。
 *
 * 全部纯函数，Node 里可直接单测（scripts/check-ink-kernel.js）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const GW = (root.GW = root.GW || {});
  GW.inkKernel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ---------- 1. OneEuroFilter ----------
  // 出处：Casiez 2012 的一欧元滤波，内核符号表里就叫这个名。
  // 它解决的问题正好是红外一体机的痛点：静止时手抖（低频抖动要强滤波），
  // 快速划线时又不能糊（速度越大截止频率越高）。单档低通做不到两全。
  function oneEuro(opts) {
    const o = Object.assign({ minCutoff: 1.0, beta: 0.007, dCutoff: 1.0, freq: 120 }, opts || {});
    let xPrev = null, dxPrev = 0, tPrev = null;

    const alpha = (cutoff, dt) => {
      const tau = 1 / (2 * Math.PI * cutoff);
      return 1 / (1 + tau / dt);
    };

    return {
      reset() { xPrev = null; dxPrev = 0; tPrev = null; },
      filter(x, t) {
        const dt = tPrev == null ? 1 / o.freq : Math.max(1e-4, (t - tPrev) / 1000);
        tPrev = t;
        if (xPrev == null) { xPrev = x; return x; }
        const dx = (x - xPrev) / dt;
        const ad = alpha(o.dCutoff, dt);
        dxPrev = ad * dx + (1 - ad) * dxPrev;
        const cutoff = o.minCutoff + o.beta * Math.abs(dxPrev);
        const a = alpha(cutoff, dt);
        xPrev = a * x + (1 - a) * xPrev;
        return xPrev;
      },
    };
  }

  // 二维数组形态：points = [[x, y, t, p], ...] → 同结构（只换 x/y，保留 t/p）
  function smooth(points, opts) {
    if (!Array.isArray(points) || points.length < 3) return points ? points.slice() : [];
    const fx = oneEuro(opts), fy = oneEuro(opts);
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const t = p[2] != null ? p[2] : i * 8; // 没有时间戳就按 125Hz 估
      out.push([fx.filter(p[0], t), fy.filter(p[1], t), p[2], p[3]]);
    }
    return out;
  }

  // ---------- 2. 曲线拟合 ----------
  // 内核侧叫 HobbySpline（MetaPost 的 Hobby 算法，按张力控制曲率）；
  // 这里给两种实现，因为两者取舍不同：
  //   · catmull：过点、C1 连续、算得快，但张力固定 —— 大角度折线会有轻微过冲；
  //   · hobby：同样过点，但按相邻段长度自适应张力，折线更「服帖」（手写汉字转折更像笔）。
  // 默认 catmull，因为 input.js 现有的渲染节奏是按它调的。
  function catmull(points, opts) {
    const o = Object.assign({ step: 8, tension: 0.5 }, opts || {});
    if (!points || points.length < 2) return (points || []).slice();
    const pts = points;
    const out = [];
    const tension = o.tension;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const n = Math.max(1, Math.min(32, Math.round(d / o.step)));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const t2 = t * t, t3 = t2 * t;
        const m1x = tension * (p2[0] - p0[0]), m1y = tension * (p2[1] - p0[1]);
        const m2x = tension * (p3[0] - p1[0]), m2y = tension * (p3[1] - p1[1]);
        const h1 = 2 * t3 - 3 * t2 + 1, h2 = -2 * t3 + 3 * t2, h3 = t3 - 2 * t2 + t, h4 = t3 - t2;
        out.push([h1 * p1[0] + h2 * p2[0] + h3 * m1x + h4 * m2x, h1 * p1[1] + h2 * p2[1] + h3 * m1y + h4 * m2y, p1[2], p1[3]]);
      }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }

  // Hobby 风格：按段长比调整出切线（简化版，只做张力自适应，不做完整 Hobby 求解）
  function hobby(points, opts) {
    const o = Object.assign({ step: 8 }, opts || {});
    if (!points || points.length < 3) return catmull(points, o);
    const adjusted = points.slice();
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], b = points[i], c = points[i + 1];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
      // 段长差异越大，越要「贴住」原点（张力上调），避免长段拖出过冲
      const k = Math.min(0.9, 0.5 * (1 + Math.abs(l1 - l2) / (l1 + l2)));
      adjusted[i] = [b[0], b[1], b[2], b[3], k];
    }
    // 用逐点张力跑 catmull：把 k 混进 tension
    const avg = adjusted.reduce((s, p) => s + (p[4] == null ? 0.5 : p[4]), 0) / adjusted.length;
    return catmull(points, Object.assign({}, o, { tension: avg }));
  }

  // ---------- 3. 压感 / 速度 → 宽度 ----------
  // 内核符号：pressureDamping（一阶阻尼）、ToolThicknessBounds（粗细界）。
  // 与 ink-style.js 的关系：**不重复实现笔种表**，这里只做「曲线形状」这一件事，
  // 宽度上下限、入锋出锋仍由 ink-style 决定（它才是单一真相）。
  function pressureCurve(opts) {
    const o = Object.assign({ gamma: 0.4, lo: 0, hi: 1, damp: 0.35 }, opts || {});
    let last = null;
    return {
      reset() { last = null; },
      // p: 0..1 原始压感 → 0..1 宽度系数
      map(p) {
        const v = Math.max(o.lo, Math.min(o.hi, p == null ? 0.5 : p));
        const shaped = Math.pow(v, o.gamma);           // 低端抬起，轻压也有墨
        if (last == null) { last = shaped; return shaped; }
        last = last + (shaped - last) * (1 - o.damp);   // 一阶阻尼：抑制报点级抖动
        return last;
      },
      // 无真压感时的速度映射：慢写粗、快写细，vLo..vMax 之外截断
      velocity(v, vLo, vMax, k) {
        const lo = vLo == null ? 40 : vLo;
        const hi = vMax == null ? 1200 : vMax;
        const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
        return 1 - (k == null ? 0.65 : k) * t;
      },
    };
  }

  // ---------- 4. 局部擦除 ----------
  // 内核符号 partialErasers：橡皮不是整笔删，而是把一笔切成若干段。
  // 返回 [{from, to}] 段索引，调用方可据此拆成多笔（board.js 侧决定怎么落地）。
  function partialErase(points, eraser, radius) {
    if (!points || !points.length || !eraser) return [[0, points.length - 1]];
    const r2 = (radius || 12) * (radius || 12);
    let min = Infinity, max = -1;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i][0] - eraser[0], dy = points[i][1] - eraser[1];
      if (dx * dx + dy * dy <= r2) { if (i < min) min = i; if (i > max) max = i; }
    }
    if (max < 0) return [[0, points.length - 1]];         // 没碰到：整笔保留
    const segs = [];
    if (min > 0) segs.push([0, min - 1]);
    if (max < points.length - 1) segs.push([max + 1, points.length - 1]);
    return segs;                                          // 空数组 = 整笔被擦掉
  }

  // ---------- 4b. 压感量程标定（I4 的纯算法部分）----------
  // 为什么放在内核层而不是 pen.js：这里是纯函数，Node 里能直接测；
  // pen.js 只负责"采样 + 存取设置"这类 IO。纯/不纯分开，是这两个模块能被单测的前提。
  // 口径：掐掉两端 10%（起笔收笔的压感台阶不是真实书写力度），量程过窄判为无真压感设备。
  function calibStats(samples) {
    const arr = (samples || []).map(Number).filter((v) => v > 0 && v <= 1).sort((a, b) => a - b);
    if (arr.length < 50) return { ok: false, why: '样本不足（需 ≥50 个有效压感点）', n: arr.length };
    const at = (q) => arr[Math.min(arr.length - 1, Math.floor(q * (arr.length - 1)))];
    const lo = at(0.1), hi = at(0.9);
    if (hi - lo < 0.08) return { ok: false, why: '压感量程过窄（' + (hi - lo).toFixed(3) + '），疑似无真压感设备', n: arr.length, lo, hi };
    return { ok: true, lo: +lo.toFixed(4), hi: +hi.toFixed(4), n: arr.length };
  }

  // ---------- 5. 契约注册 ----------
  // 宿主可以整段替换某一环（例如以后接入真实内核时，把 spline 换成内核输出）。
  // 注册表故意不做校验：这是给本机调试/未来扩展留的口子，不是插件系统。
  const registry = {
    smoother: { oneEuro: smooth, none: (p) => (p || []).slice() },
    spline: { catmull, hobby, linear: (p) => (p || []).slice() },
    pressure: { curve: pressureCurve },
    eraser: { partial: partialErase },
  };

  function pick(kind, name) {
    const group = registry[kind];
    if (!group) throw new Error('inkKernel: 未知环节 ' + kind);
    const fn = group[name];
    if (!fn) throw new Error('inkKernel: 未知实现 ' + kind + '/' + name + '（可选：' + Object.keys(group).join('/') + '）');
    return fn;
  }

  function register(kind, name, fn) {
    if (!registry[kind]) registry[kind] = {};
    registry[kind][name] = fn;
    return fn;
  }

  // ---------- 6. 可选驱动 ----------
  // 把四环串成一条流水线。注意：**不自动接管** input.js 的取点路径；
  // 只有调用方显式用 inkDriver 处理点列时才生效（见文件头的铁律）。
  function inkDriver(cfg) {
    const c = Object.assign({ smoother: 'oneEuro', spline: 'catmull', pressure: 'curve' }, cfg || {});
    const sm = pick('smoother', c.smoother);
    const sp = pick('spline', c.spline);
    const pc = pick('pressure', c.pressure)(c.pressureOpts || {});
    return {
      // points: [[x,y,t,p], …] → 处理后的点列（已平滑 + 已插值）
      run(points, opts) {
        if (!points || !points.length) return [];
        const s = sm(points, c.smoothOpts || {});
        return sp(s, Object.assign({}, c.splineOpts || {}, opts || {}));
      },
      // 只要宽度系数，不要点列
      width(p) { return pc.map(p); },
      reset() { pc.reset(); },
      cfg: c,
    };
  }

  return {
    oneEuro, smooth, catmull, hobby, pressureCurve, partialErase, calibStats,
    register, inkDriver, registry,
    // 版本串跟着内核契约走，不跟 APP_VERSION 混（后者是产品版本）
    CONTRACT: '1.0.0',
  };
});
