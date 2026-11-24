/* 数理无限画布 · 手写笔与触摸输入适配层
 *
 * 教室里真正影响「好不好写」的，不是画布本身，而是**屏幕的触摸原理**。
 * 这两类屏在教学一体机上最常见，行为差别极大：
 *
 *   红外屏（希沃 / 鸿合等一体机的触摸框）
 *     · 笔和手指在系统里都是 touch，**分不开**；没有真压感（pressure 恒为 0.5）
 *     · 没有笔尾橡皮、没有倾斜、没有悬停
 *     · 采样率低、坐标有 0.5~2px 的量化抖动 ——「写小字发毛、起笔带钩」多半是它
 *     · 接触面积（width/height）能报告，手掌明显大于指尖
 *
 *   电磁屏（Wacom EMR / 主动式电容笔）
 *     · pointerType === 'pen'，**笔手可分**；有真压感（0~1 连续变化）
 *     · 有笔尾橡皮（buttons & 32）、有倾斜（tiltX/tiltY）、能悬停
 *     · 采样率高、几乎无抖动 —— 要的是「少加工、别拖后腿」
 *
 * 所以本模块只做三件事：
 *   1. 现场**测**：一边写一边统计事件类型 / 压感范围 / 接触面积 / 采样率 / 静止抖动，
 *      据此自动判定是红外屏还是电磁屏（也可在设置里手动锁定）；
 *   2. 按判定结果给出一套**适配参数**（滤波强度、落笔防抖、手势窗口、手掌阈值）；
 *   3. 提供 One Euro 自适应滤波器与预测器给 input.js 使用，并附一个**实时诊断面板**，
 *      现场排查「为什么这台机器写起来发涩」时可以直接看数。
 *
 * 设计原则：全部可降级。任何时候 GW.pen 不可用，input.js 都应当照常书写。
 */
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW) return;
  const now = () => performance.now();

  // ---------- One Euro 滤波器（Casiez 2012） ----------
  // 核心思想：截止频率随速度自适应 —— 慢速（描点、写小字）时强平滑，把抖动吃掉；
  // 快速（连笔、画长线）时几乎不滤波，不引入滞后。
  // 这正好对上红外屏的两个极端需求，比固定低通或滑动平均好得多（后者一律带来拖影）。
  function oneEuro(fcmin, beta, dcutoff) {
    let xPrevRaw = null, xPrevFilt = null, dxPrevFilt = 0, tPrev = 0;
    const alpha = (cut, dt) => { const tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / dt); };
    return {
      get ready() { return xPrevFilt !== null; },
      get value() { return xPrevFilt; },
      get speed() { return Math.abs(dxPrevFilt); },       // px/s
      reset() { xPrevRaw = null; xPrevFilt = null; dxPrevFilt = 0; tPrev = 0; },
      add(x, t) {
        if (xPrevFilt === null) { xPrevRaw = x; xPrevFilt = x; dxPrevFilt = 0; tPrev = t; return x; }
        let dt = (t - tPrev) / 1000;
        if (!(dt > 0.0005)) dt = 1 / 120;                  // 同一毫秒的重复采样 / 时间戳缺失
        if (dt > 0.3) { xPrevRaw = x; xPrevFilt = x; dxPrevFilt = 0; tPrev = t; return x; } // 停顿太久，重新起
        tPrev = t;
        const dx = (x - xPrevRaw) / dt;
        const aD = alpha(dcutoff, dt);
        dxPrevFilt = aD * dx + (1 - aD) * dxPrevFilt;
        const cut = fcmin + beta * Math.abs(dxPrevFilt);
        const a = alpha(cut, dt);
        xPrevFilt = a * x + (1 - a) * xPrevFilt;
        xPrevRaw = x;
        return xPrevFilt;
      },
      // 向前外推 leadMs 毫秒（用于跟手预测）；限幅避免甩出去
      ahead(leadMs, maxPx) {
        if (xPrevFilt === null) return null;
        const d = (dxPrevFilt * leadMs) / 1000;
        return xPrevFilt + Math.max(-maxPx, Math.min(maxPx, d));
      },
    };
  }

  // ---------- 设备画像 ----------
  const MANUAL_KEY = 'penDevice';       // 'auto' | 'infrared' | 'emr' | 'mouse'
  const info = {
    samples: 0,
    types: { touch: 0, pen: 0, mouse: 0 },
    lastType: '',
    penPressure: false,     // 见到过非 0.5 / 非 0 的压感 → 电磁笔
    penTilt: false,
    penEraser: false,
    penHover: false,
    pMin: 1, pMax: 0,       // 压感范围
    cMin: 1e9, cMax: 0, cSum: 0, cN: 0,   // 接触面积（width/height 较大者）
    rate: 0,                // 采样率（点/秒）
    jitter: 0,              // 静止抖动（屏幕像素，越小越干净）
    coalesced: 0,           // 合并事件带来的额外采样比例
    lastSeen: 0,
    started: 0,
  };
  // 静止抖动估计：只在「几乎不动」的样本上统计到均值点的距离，
  // 这样量出来的是纯粹的手抖/坐标量化噪声，和书写轨迹本身无关。
  let jit = { x: 0, y: 0, n: 0, sum: 0, px: 0, py: 0, pt: 0 };
  let rateWin = [];
  let lastRaw = { t: 0, n: 0 };

  let manual = 'auto';
  let locked = null;         // 一旦判定就锁定，避免同一次书写中途反复改变手感
  let manualSynced = false;  // pen.js 早于 storage.js 加载，设置要等到它可用后再读一次

  function syncManual() {
    if (manualSynced) return;
    if (!GW.settings) return;
    manualSynced = true;
    const v = GW.settings[MANUAL_KEY];
    if (v) manual = v;
  }

  function observe(e, extra) {
    syncManual();
    const t = e.pointerType || 'mouse';
    if (!info.started) info.started = now();
    info.samples++;
    info.lastType = t;
    info.lastSeen = now();
    info.types[t] = (info.types[t] || 0) + 1;
    // 采样率：最近 1 秒内的样本数（合并事件带来的采样一并计入）
    const nowT = now();
    const n = Math.max(1, extra || 1);
    for (let i = 0; i < n; i++) rateWin.push(nowT);
    if (n > 1) info.coalesced = info.coalesced * 0.9 + (n - 1) * 0.1;
    while (rateWin.length && nowT - rateWin[0] > 1000) rateWin.shift();
    info.rate = info.rate * 0.7 + rateWin.length * 0.3;

    if (t === 'pen') {
      penSeen = now();
      const p = e.pressure;
      if (p > 0 && p !== 0.5) info.penPressure = true;
      if (p > 0) { info.pMin = Math.min(info.pMin, p); info.pMax = Math.max(info.pMax, p); }
      if ((e.tiltX | 0) !== 0 || (e.tiltY | 0) !== 0) info.penTilt = true;
      if (e.buttons & 32) info.penEraser = true;
      if (e.pointerType === 'pen' && e.buttons === 0) info.penHover = true;
    }
    const c = Math.max(e.width || 0, e.height || 0);
    if (c > 0) { info.cN++; info.cSum += c; info.cMin = Math.min(info.cMin, c); info.cMax = Math.max(info.cMax, c); }

    // 静止抖动：相邻样本位移极小 → 认为手指/笔停在屏幕上，把坐标散度计进来
    const dt = nowT - jit.pt;
    if (jit.n > 0 && dt > 0 && dt < 120) {
      const d = Math.hypot(e.clientX - jit.px, e.clientY - jit.py);
      if (d < 1.2) {                         // 1.2 屏幕像素以内才算「停在屏上」——
                                             // 阈值放大到 3px 会把「慢慢写」也算成静止，量出来的是写字而不是抖动
        jit.x += e.clientX; jit.y += e.clientY; jit.n++;
        const mx = jit.x / jit.n, my = jit.y / jit.n;
        // 增量式方差（Welford 的简化版：直接重算平均绝对偏差，样本量小，代价可忽略）
        jit.prev = jit.prev || [];
        jit.prev.push(e.clientX, e.clientY);
        if (jit.prev.length > 64) jit.prev.splice(0, 2);
        let s = 0;
        for (let i = 0; i < jit.prev.length; i += 2) s += Math.hypot(jit.prev[i] - mx, jit.prev[i + 1] - my);
        jit.sum = s / (jit.prev.length / 2);
      } else { jit = { x: 0, y: 0, n: 0, sum: jit.sum, prev: [] }; }
    }
    jit.px = e.clientX; jit.py = e.clientY; jit.pt = nowT;
    if (jit.n > 6) info.jitter = jit.sum;
    infer();
  }

  // 设备判定：先看有没有真笔，再看触摸屏的「脏」程度
  function infer() {
    if (locked) return;
    if (info.samples < 12) return;
    if (info.types.pen >= 4 && (info.penPressure || info.penTilt || info.penEraser)) {
      locked = 'emr';
      GW.bus.emit('pen-device', device());
      return;
    }
    if (!info.types.touch) { locked = 'mouse'; GW.bus.emit('pen-device', device()); return; }
    if (info.samples >= 40) {
      // 纯触摸一律按红外屏处理（电磁屏一定会有 pen 事件）；抖动/接触面积只用于展示与调参
      locked = 'infrared';
      GW.bus.emit('pen-device', device());
    }
  }

  function device() {
    syncManual();
    if (manual && manual !== 'auto') return manual;
    if (locked) return locked;
    if (info.types.pen) return info.penPressure ? 'emr' : 'unknown';
    if (info.types.touch) return 'infrared';
    if (info.types.mouse) return 'mouse';
    return 'unknown';
  }

  // ---------- 适配参数 ----------
  // 每一档都对应「这台机器上的人怎么写字」，不是抽象的性能等级。
  // 注意 fcmin / beta 只是「用户手动打开抖动抑制」时才生效的备用参数 ——
  // 默认直通（strength 0），见下面 strength() 的说明。
  const PRESETS = {
    emr: { fcmin: 2.6, beta: 0.022, dcutoff: 1.0, gestureMs: 170, palm: 0.85, palmPx: 40, predict: 0, taper: 1 },
    // 红外屏：触摸框报点有量化台阶（0.5~2px），但**绝不能靠低通压**，只能靠空间域门限 + 曲线拟合。
    // predict 8ms 是补触摸框固有的那一帧传输延迟（希沃白板5 的"跟手"很大一部分来自这个）。
    // beta 从 0.009 提到 0.055：它是「抖动抑制」档位唯一能决定「写字时到底滞不滞后」的参数，
    // 0.009 太小 —— 1000px/s 时截止频率才 10.9Hz，一开阻尼就明显拖手。0.055 让截止频率在
    // 200px/s 时就有 12.9Hz、1000px/s 时到 57Hz，延迟压到 3px 以内，而静止时仍是 fcmin=1.2Hz 的强平滑。
    infrared: { fcmin: 1.2, beta: 0.055, dcutoff: 1.0, gestureMs: 180, palm: 0.8, palmPx: 34, predict: 8, taper: 1 },
    mouse: { fcmin: 8, beta: 0.05, dcutoff: 1.0, gestureMs: 160, palm: 0.8, palmPx: 46, predict: 0, taper: 1 },
    unknown: { fcmin: 2.0, beta: 0.014, dcutoff: 1.0, gestureMs: 220, palm: 0.8, palmPx: 40, predict: 0, taper: 1 },
  };
  // 抖动抑制强度：0 关 / 1 轻 / 2 中 / 3 强。
  // One Euro 的截止频率是 fc = fcmin + beta·|v|：fcmin 管「几乎不动时有多平滑」，beta 管「一动起来多快放开低通」。
  // **关键在 beta** —— 只有 beta·|v| 在写字速度下压过 fcmin，滤波才真的只作用于静止段。
  //   fk 乘在 fcmin 上（越小 = 静止时越平滑），bk 乘在 beta 上（越大 = 越快放开）。
  // 老版本只调 fcmin、beta 一直保持预设的最小值，于是 1 档在 1000px/s 下截止频率只有 10.9Hz、
  // 等效滞后 14.6ms（≈15px）——老师一开就是「延迟高、笔尖不跟自己手」。这正是当年把默认值
  // 定成「一律直通」的原因。现在 1 档在 1000px/s 下截止 57Hz、滞后约 2.8ms（≈2.8px），肉眼看不出来，
  // 而静止抖动照样压掉约七成（1.16px → 0.37px，见 scripts/pen-filter-lag.js 的验算）。
  // 默认值仍然保持 0（直通、零滞后），是否要阻尼由老师自己挑。
  // 1.7.0：一套滤波同时服务三种笔时只能折中（圆珠笔嫌抖、毛笔嫌僵），所以按笔种分表。
  // 下面每一行的编号是「这条 0~5 平滑度标尺上的第几级」，0 = 直通；三种笔各占一段 ——
  // 同一档滑杆下，毛笔永远落在比圆珠笔更重的那一级，钢笔居中：
  //   ball     1 / 2 / 3   跟手优先：写字时的滞后最小（**沿用 1.6.6 的现行值，一个数都没动**，
  //                        所以不传 kind 的旧调用点行为逐位不变；1000px/s 滞后 ≈2.8px）
  //   fountain 2 / 3 / 4   居中：比圆珠笔再压一点静止抖动，滞后仍留在 10px 以内
  //   brush    3 / 4 / 5   平滑优先：fk/bk 都压到最小，静止最稳、行笔最顺，代价是写字时更滞
  // 表里的数就是 fcmin/beta 的系数，真值 = 设备预设 × 系数。
  const STRENGTH = {
    ball: {
      0: { on: false },
      1: { on: true, fk: 1.6, bk: 1.0 },
      2: { on: true, fk: 1.0, bk: 1.4 },
      3: { on: true, fk: 0.78, bk: 1.8 },
    },
    fountain: {
      0: { on: false },
      2: { on: true, fk: 1.28, bk: 0.72 },
      3: { on: true, fk: 0.82, bk: 1.02 },
      4: { on: true, fk: 0.64, bk: 1.30 },
    },
    brush: {
      0: { on: false },
      3: { on: true, fk: 1.00, bk: 0.46 },
      4: { on: true, fk: 0.62, bk: 0.68 },
      5: { on: true, fk: 0.48, bk: 0.92 },
    },
  };
  // 滑杆档位（0 关 / 1 轻 / 2 中 / 3 强）→ 该笔种的有效级别。索引即滑杆值。
  const TIER = { ball: [0, 1, 2, 3], fountain: [0, 2, 3, 4], brush: [0, 3, 4, 5] };

  // 默认一律「直通」，一个点都不平滑（三种笔相同）。
  // 这是 FH86EC 现场教训换来的默认值：时间域低通哪怕只有 fcmin=1.2，在 300px/s 下
  // 也有约 20~30ms 的相位滞后，观感就是「延迟高、笔尖不跟自己手」。
  // 而红外屏报点的毛刺本质是**空间**噪声 —— 用采样门限 + 中点贝塞尔（board.js 的
  // smoothPath）就能修得很好，两者都不引入时间滞后。
  // 真想额外加阻尼的老师，可以自己在「设置 → 笔迹抖动抑制」里选 1/2/3 档。
  // 返回「该笔种的有效级别」：不传 kind ⇒ 圆珠笔 ⇒ 与 1.7.0 之前逐位一致（返回滑杆原值）。
  function strength(kind) {
    const s = GW.settings ? GW.settings.penSmooth : null;
    if (kind == null) return s != null ? s | 0 : 0;   // 旧签名：逐位不变，也不做钳位
    const map = TIER[kind] || TIER.ball;              // 不认识的笔种按圆珠笔算
    const lvl = s != null ? s | 0 : 0;
    // 越界的滑杆值（老存档里理论上不会出现）沿用改前的兜底：落到该笔种的 1 档
    return map[lvl] != null ? map[lvl] : map[1];
  }

  function profile(kind) {
    const d = device();
    const base = PRESETS[d] || PRESETS.unknown;
    const k = TIER[kind] ? kind : 'ball';
    // 圆珠笔的映射是恒等，所以不传 kind 时与改前取到的是同一行
    const st = STRENGTH[k][strength(k)] || STRENGTH[k][TIER[k][1]] || STRENGTH.ball[1];
    const p = Object.assign({}, base);
    if (!st.on) { p.fcmin = 1e6; p.beta = 0; }        // 截止频率极高 = 直通
    else { p.fcmin = base.fcmin * st.fk; p.beta = base.beta * st.bk; }
    // 预测：-1/未设 = 用本设备档的默认值（红外屏 1 帧），>=0 = 用户显式指定（0 就是关）
    const pp = GW.settings ? GW.settings.penPredict : -1;
    if (pp != null && pp >= 0) p.predict = pp | 0;
    // 笔锋开关
    if (GW.settings && GW.settings.penTaper != null) p.taper = GW.settings.penTaper | 0;
    return p;
  }

  // 自适应手掌阈值：红外屏的手指书写和手掌按压只有接触面积之差，
  // 固定 46px 在很多机器上要么误擦手写、要么擦不掉手掌。
  // 取「最近触摸样本接触面积下四分位」的 2.2 倍；**下界锁死在用户设定值**，只会往上放宽 ——
  // 一旦允许它低于设定值，就会出现「手指稍微按重一点就写不出字」这种最招人恨的故障。
  // 宁可偶尔擦不掉手掌（重新按一下即可），也绝不能把正常手写当成手掌擦掉。
  // 取样口径：被判成手掌的触摸**也计入**样本 —— 否则手指面积天生 ≥ palmSize 的电容屏
  // 一个样本都攒不到，阈值永远停在 base，那台设备一辈子学不会。
  // 正因为手掌样本也进来了，参考值取**下四分位**而不是中位数：老师一边写一边用手掌擦时
  // 手掌样本可能接近一半，中位数会翻到手掌那一侧把阈值带跑，手掌擦除反倒失效。
  // 上限也不再钳到 base*1.8：手指本来就比 82.8 大的机器会被钳死，抬不动就等于没修。
  // 2.1.1：但「完全不设上限」在 65~86 吋红外一体机上会走向另一个极端 —— 大屏手指接触面积
  // 本就偏大，ref*2.2 能被顶到 150~220，而手掌常报 120~200，于是手掌反而够不着阈值，
  // 表现为「1.7 一抹就擦、2.0 怎么抹都擦不动」。补一道宽松上限 base*3.2（默认 147px）：
  // 远高于当年的 1.8 倍，手指天生 100px 的机器仍能抬上去不误判；只有样本被异常带跑时才生效。
  let contactWin = [];
  function palmThreshold() {
    const base = (GW.settings && GW.settings.palmSize) || 46;
    if (!contactWin.length) return base;
    const a = contactWin.slice().sort((x, y) => x - y);
    const ref = a[a.length >> 2];          // 下四分位：手掌样本不超过 3/4 时仍落在手指上
    // 2.1.2（B）：只改**上限**，2.2 倍这个下界一个数都不动 —— 它守的是「手指按重一点就写不出字」，
    // 那是比「擦不掉手掌」更招人恨的故障，不能拿它去换。
    // 旧上限 base*3.2 = 147（默认 palmSize 46）在 65~86 吋红外一体机上会把手掌挡在门外：
    // 那些屏手指报 60~80、手掌报 120~200（差约 2 倍），阈值被顶到 132~147 就正好落在手掌那一侧
    // （探针实测：20 笔接触面积 60 的样本之后阈值 132，120×140 的手掌擦不掉任何笔迹）。
    // 新上限 base*2.4(=110) 且**不低于 ref*1.4**：ref ≤ 52 的机器算出来与改前逐位相同（101/110），
    // 只会把「样本把阈值顶上去了」的那一段压回来；ref*1.4 的地板保证接触面积按重 1.4 倍以内仍然落墨。
    return Math.min(Math.max(ref * 2.2, base), Math.max(base * 2.4, ref * 1.4));
  }
  function noteContact(size) {
    if (!(size > 0)) return;
    contactWin.push(size);
    if (contactWin.length > 40) contactWin.shift();
  }

  // ---------- 给 input.js 用的滤波器组 ----------
  function newFilter(seedX, seedY, t, direct) {
    const p = profile();
    if (direct) { p.fcmin = 1e6; p.beta = 0; }
    const fx = oneEuro(p.fcmin, p.beta, p.dcutoff), fy = oneEuro(p.fcmin, p.beta, p.dcutoff);
    const api = {
      profile: p,
      fx, fy,
      add(sx, sy, ts) { return { x: fx.add(sx, ts), y: fy.add(sy, ts) }; },
      reset() { fx.reset(); fy.reset(); },
      get speed() { return Math.hypot(fx.speed, fy.speed); },     // px/s
      // 向前外推的预测点（屏幕坐标）
      ahead(leadMs) {
        if (!p.predict) return null;
        const mx = Math.max(6, GW.camera.s * 30);
        const px = fx.ahead(leadMs, mx), py = fy.ahead(leadMs, mx);
        return px == null ? null : { x: px, y: py };
      },
    };
    if (seedX != null) { fx.add(seedX, t); fy.add(seedY, t); }
    return api;
  }

  function boardWidth() {
    let older = 0, previous = 0, latest = 0, samples = 0, interval = 1000 / 60;
    return (dx, dy, dt, ending, gain) => {
      if (dt >= 9) interval = dt;
      const speed = Math.hypot(dx, dy) / (dt >= 9 ? dt : interval);
      const angle = ending ? Math.atan2(dy, dx) * 180 / Math.PI : 0;
      const rising = angle > -155 && angle < -35;
      const smooth = samples === 0 ? speed * 0.85
        : samples === 1 ? latest * 0.15 + speed * 0.85
        : older * 0.05 + previous * 0.05 + latest * 0.1 + speed * 0.8;
      older = previous; previous = latest; latest = smooth; samples++;
      return Math.max(rising ? 0.02 : 0.05, Math.exp(-(rising ? 3.8 * speed : 1.8 * smooth) * gain));
    };
  }

  // ---------- 标签 ----------
  const NAMES = { emr: '电磁屏 / 主动式手写笔', infrared: '红外屏（触摸框）', mouse: '鼠标 / 触控板', unknown: '尚未识别' };
  const SHORT = { emr: '电磁屏', infrared: '红外屏', mouse: '鼠标', unknown: '识别中' };

  // ---------- 诊断面板 ----------
  function openDiag() {
    const rows = {};
    const mk = (k, label) => {
      const v = GW.h('b', { class: 'pen-d-val' }, '—');
      rows[k] = v;
      return GW.h('div', { class: 'pen-d-row' }, GW.h('span', null, label), v);
    };
    const devSel = GW.ui.segmented({
      options: [{ value: 'auto', label: '自动识别' }, { value: 'infrared', label: '红外屏' }, { value: 'emr', label: '电磁屏' }, { value: 'mouse', label: '鼠标' }],
      value: manual, onChange: (v) => setManual(v),
    });
    const body = GW.h('div', { class: 'pen-diag' },
      GW.h('p', { class: 'muted', style: { margin: '0 0 4px' } }, '在这台机器上随便写几笔，下面的数字会实时更新。若设备识别不对，可直接手动指定。'),
      devSel.el,
      GW.h('div', { class: 'pen-d-grid' },
        mk('dev', '识别结果'), mk('type', '输入类型'), mk('rate', '采样率'), mk('jit', '静止抖动'),
        mk('pressure', '压感范围'), mk('contact', '接触面积'), mk('tilt', '倾斜 / 橡皮 / 悬停'), mk('base', '当前适配')));

    const tick = () => {
      const d = device(), p = profile();
      rows.dev.textContent = NAMES[d] + (locked && manual === 'auto' ? '（已自动判定）' : '');
      rows.type.textContent = Object.keys(info.types).filter((k) => info.types[k]).map((k) => k + '×' + info.types[k]).join('  ') || '—';
      rows.rate.textContent = info.rate ? Math.round(info.rate) + ' 点/秒' + (info.coalesced > 0.3 ? '（含合并采样）' : '') : '—';
      rows.jit.textContent = info.jitter ? info.jitter.toFixed(2) + ' px' + (info.jitter > 0.8 ? '　偏大，建议开启抖动抑制' : '　很干净') : '—';
      rows.pressure.textContent = info.pMax > 0 ? `${info.pMin.toFixed(2)} ~ ${info.pMax.toFixed(2)}` + (info.penPressure ? '（真压感）' : '（恒定 0.5，无压感）') : '无';
      rows.contact.textContent = info.cN ? `${info.cMin | 0} ~ ${info.cMax | 0}` : '未上报';
      rows.tilt.textContent = [info.penTilt ? '倾斜✓' : '倾斜✗', info.penEraser ? '笔尾橡皮✓' : '笔尾橡皮✗', info.penHover ? '悬停✓' : '悬停✗'].join('　');
      rows.base.textContent = `抖动抑制 ${['关', '轻', '中', '强'][strength()] || '中'} · 落笔防抖 ${p.startGuard ? '开' : '关'} · 手势窗口 ${p.gestureMs}ms · 手掌阈值 ${Math.round(palmThreshold())}px`;
    };
    tick();
    const timer = setInterval(tick, 250);
    const dlg = GW.dialog({
      title: '手写笔 / 触摸屏诊断', width: 620, ok: '完成', cancel: null,
      body: GW.h('div', null, body, GW.h('p', { class: 'muted', style: { marginTop: '10px' } },
        '怎么看：红外屏一般「静止抖动 > 0.8px、压感恒定 0.5、无倾斜/橡皮/悬停」；电磁屏则有真压感、能悬停、抖动接近 0。',
        GW.h('br'), '若这台机器实际是红外屏却写成电磁屏，会导致手写被当成手掌擦掉 —— 手动指定一下即可。')),
    });
    const stop = setInterval(() => { if (!body.isConnected) { clearInterval(timer); clearInterval(stop); } }, 400);
    return dlg;
  }

  function setManual(v) {
    manual = v || 'auto';
    manualSynced = true;
    locked = null;
    try { GW.settings[MANUAL_KEY] = manual; GW.saveSettings && GW.saveSettings(); } catch (_) {}
    GW.bus.emit('pen-device', device());
    GW.toast('输入设备已设为：' + (NAMES[device()] || '自动识别'));
  }
  function reset() {
    info.samples = 0; info.types = { touch: 0, pen: 0, mouse: 0 };
    info.penPressure = info.penTilt = info.penEraser = info.penHover = false;
    info.pMin = 1; info.pMax = 0; info.cMin = 1e9; info.cMax = 0; info.cSum = 0; info.cN = 0;
    info.rate = 0; info.jitter = 0; info.coalesced = 0;
    jit = { x: 0, y: 0, n: 0, sum: 0, prev: [] };
    contactWin = []; rateWin = []; locked = null;
    GW.bus.emit('pen-device', device());
  }

  let penSeen = 0;
  let penHeld = 0;   // 正在屏上的笔指针数（按下 +1、抬起 −1）
  let penLostTip = 0; // 笔掉线自愈提示的节流时间戳（2.3.0）

  // 1.7.1：书写预设。
  // 老师反馈「参数太多，很难调到一个比较完美的状态」—— 十几项笔迹参数彼此耦合（关掉笔锋要同时
  // 调平滑，改笔宽要同时压感灵敏度…），单独拖动其中任何一个都调不出「好看的一笔」。
  // 这里把它收敛成 4 个整档：一次写进同一组参数，随时可再单项微调（微调后预设名仍保留，
  // 只作为「起点」）。全部是既有设置项，不新增渲染分支，导出/协同/缩略图看到的仍是同一种笔迹。
  const PEN_PRESETS = {
    default: { label: '默认', penWidth: 3, penSmooth: 0, penTaper: 1, penExit: 1, penTip: 'sharp', penPress: 1, snapResid: 0.09, smartSnap: 'auto' },
    smooth: { label: '顺滑', penWidth: 3, penSmooth: 2, penTaper: 1, penExit: 1.1, penTip: 'round', penPress: 0.9, snapResid: 0.09, smartSnap: 'auto' },
    precise: { label: '精细', penWidth: 2.2, penSmooth: 1, penTaper: 0, penExit: 1, penTip: 'sharp', penPress: 1.2, snapResid: 0.06, smartSnap: 'auto' },
    board: { label: '板书', penWidth: 6, penSmooth: 1, penTaper: 1, penExit: 1.2, penTip: 'sharp', penPress: 1.1, snapResid: 0.12, smartSnap: 'auto' },
  };
  function applyPenPreset(id) {
    const key = PEN_PRESETS[id] ? id : 'default';
    const p = PEN_PRESETS[key];
    if (!GW.settings) return p;
    const S = GW.settings;
    for (const k of ['penWidth', 'penSmooth', 'penTaper', 'penExit', 'penTip', 'penPress', 'snapResid', 'smartSnap']) {
      if (p[k] != null) S[k] = p[k];
    }
    S.penPreset = key;
    if (GW.saveSettings) GW.saveSettings();
    if (GW.requestRender) GW.requestRender();
    return p;
  }

  // ---------- 2.0.8（I4）：设备压感标定 ----------
  // 各家电磁屏报的 pressure 区间差很多（0.05–0.85 / 0.2–0.6 / 0–1 都有），而宽度链假设满量程：
  // 没标定时轻压就很粗、重压提前饱和，提按层次被压平。这里写三笔采 200+ 个样本，
  // 取 p10/p90 当实际量程存进 settings.penCalib，宽度链再按它归一化。
  // 铁律：只在 inkCalib 打开时读；只给区间，**绝不自动改用户选的笔种/斜率**。
  function calibKey() {
    const p = (typeof profile === 'function' ? profile() : null) || {};
    return 'v1:' + (p.model || p.id || device() || 'unknown');
  }
  function calib() {
    const all = GW.settings && GW.settings.penCalib;
    if (!all || !GW.settings.inkCalib) return null;
    const c = all[calibKey()];
    return c && c.hi > c.lo + 0.02 ? c : null;
  }
  function calibrate(samples) {
    const st = GW.inkKernel && GW.inkKernel.calibStats ? GW.inkKernel.calibStats(samples) : null;
    if (!st) return { ok: false, why: 'ink-kernel 未加载', n: 0 };
    if (!st.ok) return st;
    const rec = { lo: st.lo, hi: st.hi, gamma: 0.4, n: st.n, at: Date.now() };
    const key = calibKey();
    GW.settings.penCalib = Object.assign({}, GW.settings.penCalib || {}, { [key]: rec });
    if (GW.saveSettings) GW.saveSettings();
    if (GW.bus && GW.bus.emit) GW.bus.emit('penCalib', { key, rec });
    return Object.assign({ ok: true, key }, rec);
  }
  function clearCalib() {
    if (!GW.settings) return false;
    GW.settings.penCalib = null;
    if (GW.saveSettings) GW.saveSettings();
    return true;
  }

  GW.pen = {
    info, device, profile, newFilter, boardWidth, observe, noteContact, palmThreshold,
    calibrate, calib, clearCalib, calibKey,
    strength, setManual, reset, openDiag, oneEuro,
    presets: PEN_PRESETS, applyPreset: applyPenPreset,
    get manual() { syncManual(); return manual; },
    get short() { return SHORT[device()] || '识别中'; },
    name: (d) => NAMES[d || device()] || '',
    // 当前是否应当「以笔为准」：只有真电磁笔才值得屏蔽触摸书写
    // （红外屏的「笔」在系统里就是一根手指，屏蔽了就没法写了）
    // 笔最近 2.5s 内落过屏 ⇒ 手指让位（1.3.4）。原来还要求 device()==='emr'，但 iPad 的
    // Apple Pencil 在首次落笔前 types.pen 还是空的，会被判成 infrared，于是「笔优先」在最需要
    // 的那两秒里恰好不生效。红外屏收不到 pen 事件，penSeen 永远是 0，不受影响。
    penPriority() {
      syncManual();
      if (manual === 'infrared') return false;
      const mode = (GW.settings && GW.settings.penFirst) || 'auto';
      if (mode === 'off') return false;             // 老师明确关掉：手指永远照常书写
      if (mode === 'on') return true;               // 老设备不给 pen 事件时的兜底：触摸一律平移
      // 2.3.0：笔还按在屏上 ⇒ 手指让位。但笔没电 / 蓝牙掉连时，笔尖的 pointerup 不会上报，
      // penHeld 会一直卡在 >0，手指就被永久锁死（只能拖画布、写不了字，要刷新页面才恢复）。
      // 加自愈：笔按着却连续 3s 收不到任何 pen 事件 ⇒ 判定为掉线，清掉计数；penSeen 保留不动，
      // 下面那条 6s 窗口仍然生效，所以就算误判也不会让手掌/手指立刻画出墨来。
      if (penHeld > 0) {
        const idle = penSeen > 0 ? now() - penSeen : 1e9;
        if (idle > 6000) { penHeld = 0; penSeen = 0; }  // 彻底解锁，与下面的 6s 窗口同阈值，不新增误判面
        else return true;
      }
      return penSeen > 0 && now() - penSeen < 6000; // 否则笔最近 6s 内动过就算（原来 2.5s 太短：
                                                    // 老师写完停一下再用手拖，2.5s 早过了，手指就变成画线）
    },
    notePenHeld(v) { penHeld = Math.max(0, penHeld + (v ? 1 : -1)); },
    // 手势擦除的门槛（1.3.6）：笔不在屏上，且离开 1.5s 以上。
    // 写字时手掌本来就托在屏上，只有「笔真的放下了」才允许巴掌/三指去擦。
    penEraseOk() { return penHeld === 0 && (penSeen === 0 || now() - penSeen > 1500); },
    // 2.1.1：四指召唤用更宽的门槛（默认 400ms）—— 擦除是"要确保笔真的放下了"，
    // 召唤只是"别在落墨瞬间误触发"，没必要等 1.5s（老师放下笔就要叫工具盘，等不起）。
    penAway(ms) { return penHeld === 0 && (penSeen === 0 || now() - penSeen > (ms || 400)); },
    notePenDown(e) { if (e.pointerType === 'pen') penSeen = now(); },
    // 探针用：把「笔最近来过」清掉。真机上不调它 —— 2.5s 后自己就过期了。
    clearPenPriority() { penSeen = 0; penHeld = 0; },
  };
})();
