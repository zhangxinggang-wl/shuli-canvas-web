/* 物理图形库 · 电磁学实验 · 多用电表内部电路图（可调参）
   ------------------------------------------------------------------
   原图：C:/Users/9800X3D/WorkBuddy/svg制作/多用电表内部电路图.svg（723×660）
   几何：同目录 circuit_geometry.json（由 scripts/gen-mminternal-data.py 逐标签校验后内联）
   数据文件：core/phys-em-internal-data.js —— 必须先于本文件加载。

   「原始样式零改动」的实现方式：不重写这张图，而是把 GEO 里的 SVG 标签逐条交给
   一个极小的 Canvas 绘制器照单画（fill/stroke/线宽/线端/虚线/字体全部读自标签属性）。
   只有 7 个「可动白名单」元素在 baseTags() 里被参数化替换，其余一笔不动：
     · wires[18]/[24] 滑片引线、wires[28] 闸刀 S
     · arrows[0]/[1] 表针（绕表头圆心旋转）、arrows[2]/[3] 两个滑片箭头
     · components[8]/[9] 表笔 A、B 的填充色
   默认参数（挡位 0、两滑片 0.5、T 0.5、表笔接入、外接无、读数关）下，
   除表笔填色外画面与原图逐像素一致 —— 由 scripts/check-multimeter-internal.js 断言。

   画布 723×800：原图占 0..660，660..800 是新增的「外接实验区」，
   只画新引出的导线/元件/读数卡，不碰底图任何一个坐标。

   物理模型与 phys-em.js:2898/2899/2994 的 tOfR / rOfT / needleT 同构（RMID=15），
   不直接引用那边的私有函数，改由单测锁死数值一致性，避免改动 3600 行的老文件。
   */
(function () {
  'use strict';
  if (!window.GW || !window.GW.physShapes || !window.GW.mmInternalData) return;
  const P = window.GW.physShapes;
  if (!P.emDefine) return;

  const DATA = window.GW.mmInternalData;
  const GEO = DATA.geo;
  const DW = 723, DH = 960;                       // 底图 660 + 外接实验区 300
  const D2R = Math.PI / 180, TAU = Math.PI * 2;
  const RED = '#c0392b', BLACK = '#000000';      // 与 phys-em.js:2893 的 RED 同色
  const RMID = 15;                                // Ω 中值电阻 = 欧姆表内阻
  /* 六档的量程与接法：1/2 电流（串联接入）、3/4 欧姆（断电测电阻）、5/6 电压（并联接入）。
     规格取教材常见值，让指针落在有区分度的区间：同一条 1.5V/5Ω+Rx 回路，
     电流挡 T≈0.75/0.075、电压挡 T≈0.375/0.075，切挡时指针明显跳。 */
  const RANGE_SPEC = [
    null,
    /* 触点 1 接分流支路中间抽头，分流电阻只有 R₁ → 分流最小、量程最大 = 500mA；
       触点 2 接表头右端，分流电阻是 R₁+R₂ → 分流更大、量程更小 = 100mA。 */
    { kind: 'A', fs: 0.5, label: '500 mA' },
    { kind: 'A', fs: 0.1, label: '100 mA' },
    { kind: 'R', mult: 1, label: '×1' },
    { kind: 'R', mult: 10, label: '×10' },
    { kind: 'V', fs: 3, label: '3 V' },
    { kind: 'V', fs: 15, label: '15 V' },
  ];
  const CIRCUIT = { E: 1.5, r: 5 };               // 待测电路：1.5 V 干电池 + 5 Ω 内阻
  const NEEDLE_C = [161, 54];                     // 表头圆心
  const NEEDLE_MAX = 40;                          // 表针最大偏角（°）
  const PIVOT = [463, 507];                       // 闸刀 S 的公共端（B 表笔接线柱）
  const CONTACTS = [[350, 472], [376, 427], [421, 406], [474, 401], [529, 427], [557, 472]];
  const KNIFE_IDX = 28;                           // wires[28] = M363,450 L456,502
  const PEN_A_IDX = 8, PEN_B_IDX = 9;             // components[8]/[9] = 两个表笔矩形
  const TIP_A = [23, 638], TIP_B = [463, 638];

  /* 两个调零变阻器：y0 是原图滑片位置，span 是可移动总行程。
     3 挡（E 支路）用 R₁，4 挡（E′ 支路）用 R₂；倍率 ×1 / ×10。 */
  const SLIDES = [
    { wire: 18, arrow: 2, y0: 217, span: 56, leadMark: 'V217' },
    { wire: 24, arrow: 3, y0: 300, span: 56, leadMark: 'V300' },
  ];

  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const fmt = (v) => String(Math.round(v * 10) / 10);
  const slideY = (k, s) => SLIDES[k].y0 + (s - 0.5) * SLIDES[k].span;

  /* ---------- 物理模型（纯函数，单测直接调用） ---------- */
  const tOfR = (r) => RMID / (RMID + r);                       // Ω 刻度 → 表针位置
  const rOfT = (t) => (t >= 1 ? 0 : (t <= 0 ? Infinity : RMID * (1 - t) / t));
  const zeroOf = (s) => 1 - clamp(Math.abs(s - 0.5) / 0.5, 0, 1);  // 滑片离中位越远，零调得越差
  const ohmInner = (zero) => RMID * (1 + (1 - zero) * 0.5);   // 调零变阻器接入多少，内阻跟着变
  /** 各挡的指针位置：三态与 phys-em.js:2994 同构，再按挡位类型接管。
      欧姆挡 T = R内/(R内 + Rx/倍率)；电流挡 T = I/量程；电压挡 T = U/量程。
      所以换挡、调 Rx、拖滑片、改表笔状态都会让指针动 —— 不是只有闸刀在转。 */
  function needleT(range, t, probe, zero, scene, rx, sw) {
    if (probe === 1) return 0;                                 // 悬空：回零（Ω 挡即 ∞）
    const spec = RANGE_SPEC[range] || null;
    if (!spec) return t;                                       // 未接通：老师手动给位置
    if (probe === 2) return spec.kind === 'R' ? 1 - (1 - zero) * 0.10 : 0;
    const inner = ohmInner(zero);
    const ohmT = (baseR) => clamp(inner / (inner + baseR), 0, 1);
    if (scene === 3) return spec.kind === 'R' ? ohmT(0) : 0;    // 短接导线 = Rx 0
    if (scene === 1) return spec.kind === 'R' ? ohmT(rx / spec.mult) : 0;  // 定值电阻只在电阻挡有回路
    if (scene === 4) return spec.kind === 'R' ? ohmT(1.2) : t;  // 二极管正接：约 1.2Ω 基础刻度
    if (scene === 5) return spec.kind === 'R' ? 0 : t;          // 二极管反接：截止，读数 ∞
    if (scene === 2) {                                          // 待测电路：按挡位算 I 或 U
      if (spec.kind === 'R') return ohmT(rx / spec.mult);       // 欧姆挡用内部电池，与外开关无关
      if (sw === 0) return 0;                                   // 外电路开关断开：回路无电流
      const I = CIRCUIT.E / (CIRCUIT.r + rx);
      if (spec.kind === 'A') return clamp(I / spec.fs, 0, 1);
      const U = CIRCUIT.E * rx / (CIRCUIT.r + rx);
      return clamp(U / spec.fs, 0, 1);
    }
    return t;                                                  // 未接外接元件：老师手动给位置
  }
  function stateOf(o) {
    const range = clamp(Math.round(num(o.emMiRange, 0)), 0, 6);
    const r1 = clamp(num(o.emMiR1, 0.5), 0, 1);
    const r2 = clamp(num(o.emMiR2, 0.5), 0, 1);
    const probe = clamp(Math.round(num(o.emMiProbe, 0)), 0, 2);
    const scene = clamp(Math.round(num(o.emMiScene, 0)), 0, 5);
    const rx = Math.max(0, num(o.emMiRx, 15));
    const show = num(o.emMiShow, 0) === 1;
    const sw = num(o.emMiSw, 0) === 1 ? 1 : 0;              // 外电路开关：默认断开（实验前安全状态）
    const pens = num(o.emMiPens, 0) === 1;                  // 红黑表笔：默认隐藏，需手动打开
    const tManual = clamp(num(o.emMiT, 0.5), 0, 1);
    const zero = zeroOf(range === 4 ? r2 : r1);
    const T = clamp(needleT(range, tManual, probe, zero, scene, rx, sw), 0, 1);
    return { range, r1, r2, probe, scene, rx, show, pens, sw, tManual, zero, T,
      spec: RANGE_SPEC[range] || null };
  }
  const thetaOf = (T) => (2 * T - 1) * NEEDLE_MAX * D2R;

  /* ---------- SVG 标签 → Canvas ---------- */
  function attrs(tag) {
    const out = {}, re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(tag))) out[m[1]] = m[2];
    return out;
  }
  function decodeEnt(s) {
    return String(s).replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  /* 这份图只用到 M/L/H/V/C/Z 绝对命令，自己走一遍比依赖 Path2D 更容易做命令级校验。 */
  function tracePath(c, d) {
    const tok = String(d).match(/[MLHVCZmlhvcz]|-?\d*\.?\d+/g) || [];
    let i = 0, cmd = '', x = 0, y = 0;
    const n = () => +tok[i++];
    c.beginPath();
    while (i < tok.length) {
      if (/^[A-Za-z]$/.test(tok[i])) { cmd = tok[i++].toUpperCase(); continue; }
      switch (cmd) {
        case 'M': x = n(); y = n(); c.moveTo(x, y); cmd = 'L'; break;
        case 'L': x = n(); y = n(); c.lineTo(x, y); break;
        case 'H': x = n(); c.lineTo(x, y); break;
        case 'V': y = n(); c.lineTo(x, y); break;
        case 'C': {
          const x1 = n(), y1 = n(), x2 = n(), y2 = n();
          x = n(); y = n(); c.bezierCurveTo(x1, y1, x2, y2, x, y); break;
        }
        case 'Z': c.closePath(); cmd = ''; break;
        default: i++; break;
      }
    }
  }
  function groupStyle(g) {
    const tag = g === 'bg' ? GEO.canvas.background
      : (g === 'dashed-frame' ? GEO.dashed_frame.join(' ') : GEO.group_styles[g]);
    const a = attrs(tag || '');
    return {
      fill: a.fill || 'none', stroke: a.stroke || 'none',
      lw: +(a['stroke-width'] || 1), cap: a['stroke-linecap'] || 'butt',
      join: a['stroke-linejoin'] || 'miter',
      dash: a['stroke-dasharray'] ? a['stroke-dasharray'].split(/[\s,]+/).map(Number) : [],
      font: a['font-family'] || '', italic: a['font-style'] === 'italic',
      size: +(a['font-size'] || 16),
    };
  }
  function applyStyle(c, gs) {
    if (gs.fill !== 'none') c.fillStyle = gs.fill;
    if (gs.stroke !== 'none') c.strokeStyle = gs.stroke;
    c.lineWidth = gs.lw; c.lineCap = gs.cap; c.lineJoin = gs.join;
    if (c.setLineDash) c.setLineDash(gs.dash);
  }
  function paintTag(c, tag, gs, fillOverride) {
    const m = /^<\s*(\w+)/.exec(tag);
    if (!m) return;
    const kind = m[1].toLowerCase(), a = attrs(tag);
    c.beginPath();
    if (kind === 'rect') c.rect(+a.x, +a.y, +a.width, +a.height);
    else if (kind === 'circle') c.arc(+a.cx, +a.cy, +a.r, 0, TAU);
    else if (kind === 'path') tracePath(c, a.d);
    else if (kind === 'text') {
      const tm = />([^<]*)<\/text>/.exec(tag);
      c.save();
      c.font = ((a['font-style'] === 'italic' || gs.italic) ? 'italic ' : '')
        + (a['font-size'] || gs.size) + 'px ' + (a['font-family'] || gs.font || 'serif');
      c.textBaseline = 'alphabetic';
      c.fillText(decodeEnt(tm ? tm[1] : ''), +a.x, +a.y);
      c.restore();
      return;
    } else return;
    if (fillOverride || gs.fill !== 'none') {
      if (fillOverride) { c.save(); c.fillStyle = fillOverride; c.fill(); c.restore(); }
      else c.fill();
    }
    if (gs.stroke !== 'none') c.stroke();
  }

  /* ---------- 可动白名单：只在这里改字符串，绘制器照单画 ---------- */
  function slideLeadTag(k, s) {
    const S = SLIDES[k], y = slideY(k, s), t = GEO.wires[S.wire];
    return y === S.y0 ? t : t.replace(S.leadMark, 'V' + fmt(y));
  }
  function slideArrowTag(k, s) {
    const S = SLIDES[k], y = slideY(k, s), t = GEO.arrows[S.arrow];
    if (y === S.y0) return t;
    const dy = y - S.y0;
    const a = /M([\d.]+),([\d.]+) L([\d.]+),([\d.]+) L([\d.]+),([\d.]+) Z/.exec(t);
    if (!a) return t;
    /* 和闸刀同一个坑：必须返回完整 <path> 标签，裸 d 会被 paintTag 整条丢掉，
       表现就是「欧姆挡一拖滑片，箭头就消失了」。 */
    const d = 'M' + a[1] + ',' + fmt(+a[2] + dy) + ' L' + a[3] + ',' + fmt(y)
      + ' L' + a[5] + ',' + fmt(+a[6] + dy) + ' Z';
    return '<path d="' + d + '"/>';
  }
  /** 闸刀绕公共端转到指定静触点：近端仍离公共端 8.6（与原图一致），尖端落在触点圆心。
      必须返回完整 <path> 标签 —— paintTag 按标签名分派，裸 d 字符串会被整条丢掉
      （1.7.12 的 bug：一换挡闸刀就消失）。 */
  function knifeTag(range) {
    const t = CONTACTS[range - 1];
    const dx = t[0] - PIVOT[0], dy = t[1] - PIVOT[1], L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L;
    return '<path d="M' + fmt(PIVOT[0] + 8.6 * ux) + ',' + fmt(PIVOT[1] + 8.6 * uy)
      + ' L' + fmt(t[0]) + ',' + fmt(t[1]) + '"/>';
  }

  /**
   * 本次绘制实际用到的标签序列。默认态下除 components[8]/[9] 的 fill 外，
   * 每一项 tag 都与 GEO 原样逐字相同 —— 单测据此判定「零改动」。
   */
  function baseTags(st) {
    const out = [];
    // 不画 GEO.canvas.background：原图那块白底只是为了导出 PNG 好看，
    // 其他物理图形都不铺底板（画布本身就是背景），这里保持一致 —— 整图透明。
    out.push({ group: 'dashed-frame', tag: GEO.dashed_frame.join(' '), fill: null });
    const groups = ['wires', 'components', 'cells', 'nodes', 'terminals', 'arrows', 'labels'];
    for (const g of groups) {
      for (let i = 0; i < GEO[g].length; i++) {
        let tag = GEO[g][i], fill = null;
        if (g === 'wires') {
          if (i === SLIDES[0].wire) tag = slideLeadTag(0, st.r1);
          else if (i === SLIDES[1].wire) tag = slideLeadTag(1, st.r2);
          else if (i === KNIFE_IDX && st.range > 0) tag = knifeTag(st.range);
        } else if (g === 'components') {
          if (st.pens && i === PEN_A_IDX) fill = RED;
          else if (st.pens && i === PEN_B_IDX) fill = BLACK;
        } else if (g === 'arrows') {
          if (i === 0 || i === 1) continue;                  // 表针挪到组末统一画
          if (i === SLIDES[0].arrow) tag = slideArrowTag(0, st.r1);
          else if (i === SLIDES[1].arrow) tag = slideArrowTag(1, st.r2);
        }
        out.push({ group: g, tag: tag, fill: fill });
      }
      if (g === 'arrows') {
        // 原图 critical_note：白色表头圆会盖住竖杆，指针必须画在圆之后、文字之前。
        out.push({ group: 'arrows', tag: GEO.arrows[0], fill: null, needle: true });
        out.push({ group: 'arrows', tag: GEO.arrows[1], fill: null, needle: true });
      }
    }
    return out;
  }

  function paint(c, st) {
    let cur = null, gs = null, needleOpen = false;
    for (const it of baseTags(st)) {
      if (it.group !== cur) {
        if (needleOpen) { c.restore(); needleOpen = false; }
        if (cur) c.restore();
        cur = it.group; c.save();
        gs = groupStyle(cur); applyStyle(c, gs);
      }
      if (it.needle && !needleOpen) {
        c.save();
        c.translate(NEEDLE_C[0], NEEDLE_C[1]);
        c.rotate(thetaOf(st.T));
        c.translate(-NEEDLE_C[0], -NEEDLE_C[1]);
        needleOpen = true;
      }
      paintTag(c, it.tag, gs, it.fill);
    }
    if (needleOpen) c.restore();
    if (cur) c.restore();
  }

  /* ---------- 外接实验区（660..960）：电路样式与 em_multimeter_hookup 完全一致 ----------
     参考 src/core/phys-em.js:3397-3433 的 drawCircuit：灯泡 = r34 圆 + 两条对角线；
     电池 = 短粗负极 + 长细正极，间距 18；开关 = 两个实心触点 + 常开斜刀；
     定值电阻 = 白底矩形 + R 与下标 x。这里把那张图的逻辑坐标整体缩放到本图下方，
     元件画法逐行照抄，只改比例 —— 所以两图电路样式一致。 */
  const CIRC = { CL: 800, CR: 1240, CT: 940, CB: 1210, BX: 1020, k: 0.8, ox: 30, oy: 700 };
  const mapPt = (x, y) => [CIRC.ox + (x - CIRC.CL) * CIRC.k, CIRC.oy + (y - CIRC.CT) * CIRC.k];
  const C_INK = '#15171a', C_FONT = '"Times New Roman",Georgia,serif';

  /* 参考图 L_ / C_ / R_ / T_ 的等价物 */
  function cL(c, x1, y1, x2, y2, w, col) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.lineWidth = w; c.strokeStyle = col; c.stroke();
  }
  function cC(c, x, y, r, w, stroke, fill) {
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke && w > 0) { c.lineWidth = w; c.strokeStyle = stroke; c.stroke(); }
  }
  function cRect(c, x, y, w, h, lw, stroke, fill) {
    c.beginPath(); c.rect(x, y, w, h);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
  }
  function cTxt(c, t, x, y, size, font, align, col) {
    c.save();
    c.font = size + 'px ' + font;
    c.textAlign = align || 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = col; c.fillText(t, x, y);
    c.restore();
  }

  /* 坐标沿用参考图的 CL/CR/CT/CB/BX，四个分支逐行照抄 */
  function circuit(c, kind, closed) {
    if (kind === 'R') {
      cL(c, 890, 1115, 960, 1115, 3, C_INK);
      cL(c, 1080, 1115, 1150, 1115, 3, C_INK);
      cRect(c, 960, 1093, 120, 44, 3, C_INK, '#ffffff');
      cTxt(c, 'R', 1014, 1068, 26, C_FONT, 'center', C_INK);
      cTxt(c, 'x', 1034, 1076, 16, C_FONT, 'center', C_INK);
      return;
    }
    if (kind === 'D' || kind === 'DR') {
      /* 符号画法照抄 phys-em.js:3421-3432，朝向按本图极性定：
         欧姆挡内部电池正极接黑笔、负极接红笔（黑+ 红−）。本图黑笔在右，
         所以「正接导通」必须让阳极朝右（黑笔接阳极）；反接镜像符号，表笔不挪。 */
      cL(c, 910, 1115, 980, 1115, 3, C_INK);
      cL(c, 1060, 1115, 1140, 1115, 3, C_INK);
      const dA = (kind === 'D') ? 1060 : 980, dB = (kind === 'D') ? 980 : 1060;
      c.beginPath();
      c.moveTo(dA, 1093); c.lineTo(dA, 1137); c.lineTo(dB, 1115);
      c.closePath(); c.fillStyle = C_INK; c.fill();    // 实心三角：填充与导线同色，深色主题随 emCtx 反相
      c.lineWidth = 3; c.strokeStyle = C_INK; c.stroke();
      cL(c, dB, 1093, dB, 1137, 3, C_INK);
      cTxt(c, 'D', 1020, 1074, 19, C_FONT, 'center', C_INK);
      return;
    }
    /* 电压挡并联在灯泡两端；电流挡在灯泡右侧留出缺口，让表笔串进去 */
    cL(c, CIRC.CL, CIRC.CT, CIRC.BX - 34, CIRC.CT, 3, C_INK);
    cL(c, CIRC.BX + 34, CIRC.CT, kind === 'V' ? CIRC.CR : 1100, CIRC.CT, 3, C_INK);
    if (kind === 'A') cL(c, 1190, CIRC.CT, CIRC.CR, CIRC.CT, 3, C_INK);
    cC(c, CIRC.BX, CIRC.CT, 34, 3, C_INK, '#ffffff');                 // 小灯泡
    cL(c, CIRC.BX - 24, CIRC.CT - 24, CIRC.BX + 24, CIRC.CT + 24, 2, C_INK);
    cL(c, CIRC.BX + 24, CIRC.CT - 24, CIRC.BX - 24, CIRC.CT + 24, 2, C_INK);
    cL(c, CIRC.CL, CIRC.CT, CIRC.CL, CIRC.CB, 3, C_INK);              // 左边缘
    cL(c, CIRC.CL, CIRC.CB, 944, CIRC.CB, 3, C_INK);
    /* 电池正极朝左：上边电流自左向右，缺口左端 1100 是上游 —— 红笔(左)接上游、
       黑笔(右)接下游，满足「红进黑出」；两根表笔线按左右顺序走，也不会交叉。 */
    cL(c, 944, CIRC.CB - 34, 944, CIRC.CB + 34, 2.6, C_INK);          // 电池正极（长细，左）
    cL(c, 962, CIRC.CB - 24, 962, CIRC.CB + 24, 4.6, C_INK);          // 电池负极（短粗，右）
    cL(c, 962, CIRC.CB, 1060, CIRC.CB, 3, C_INK);
    cC(c, 1060, CIRC.CB, 5, 0, C_INK, C_INK);
    cC(c, 1170, CIRC.CB, 5, 0, C_INK, C_INK);
    if (closed) cL(c, 1060, CIRC.CB, 1170, CIRC.CB, 3, C_INK);          // 开关合上：搭到右触点
    else cL(c, 1060, CIRC.CB, 1148, CIRC.CB - 46, 3, C_INK);            // 开关断开：斜刀（常开）
    cL(c, 1170, CIRC.CB, CIRC.CR, CIRC.CB, 3, C_INK);
    cL(c, CIRC.CR, CIRC.CB, CIRC.CR, CIRC.CT, 3, C_INK);
  }
  /* 表笔落点用 {red, black} 明确语义 —— 之前按数组下标猜，把红黑接反了。
     本图 A 笔=红在左、B 笔=黑在右；电池正极朝左，上边电流自左向右：
       · 电流挡串联缺口：红接上游 1100、黑接下游 1190（红进黑出）
       · 电压挡并联：红接高电位 880、黑接低电位 1130（红高黑低）
       · 欧姆挡：内部电池 黑+ 红−；定值电阻无极性，按左右顺序落点即可
       · 二极管：黑笔(+，右)接阳极才导通，故正接时阳极朝右 */
  function tipsFor(kind) {
    if (kind === 'V') return { red: [880, CIRC.CT], black: [1130, CIRC.CT] };
    if (kind === 'A') return { red: [1100, CIRC.CT], black: [1190, CIRC.CT] };
    if (kind === 'D' || kind === 'DR') return { red: [910, 1115], black: [1140, 1115] };
    return { red: [890, 1115], black: [1150, 1115] };
  }

  /* 表笔软线：从笔尖下折到 runY、横走、再落到电路端点（参考图 drawLead 的 S 形过渡） */
  function leadTo(c, from, to, col, runY) {
    const x0 = from[0], y0 = from[1], tx = to[0], ty = to[1];
    /* 顶边的电路端点比笔尖只低 34px：走线不能先下到 690 再抬回去，否则会绕出一个怪弧。 */
    const run = Math.max(y0 + 8, Math.min(runY, ty - 6));
    const dir = tx >= x0 ? 1 : -1;
    const off = Math.min(34, Math.abs(tx - x0) / 2);
    c.beginPath();
    c.moveTo(x0, y0);
    c.bezierCurveTo(x0, y0 + 20, x0, run, x0 + dir * off, run);
    c.lineTo(tx - dir * off, run);
    c.quadraticCurveTo(tx, run, tx, ty);
    c.lineWidth = 4.2; c.strokeStyle = col;
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (c.setLineDash) c.setLineDash([]);
    c.stroke();
  }

  /* 读数卡：按挡位给换算过程，并把极性写清楚（教学要点） */
  function readoutLines(st) {
    const spec = st.spec;
    if (!spec) return ['转换开关未接通', '请先把 S 旋到 1–6 挡', '', ''];
    if (st.scene === 4) return ['二极管正接 · 黑笔(+)接阳极', '欧姆挡：黑+ 红−（内置电池）',
      'R ≈ ' + fmt(1.2 * spec.mult) + ' Ω（导通）', '零 = ' + st.zero.toFixed(2)];
    if (st.scene === 5) return ['二极管反接 · 红笔(−)接阳极', '欧姆挡：黑+ 红−（内置电池）',
      'R = ∞（反向截止）', '零 = ' + st.zero.toFixed(2)];
    if (st.sw === 0 && st.scene === 2 && spec.kind !== 'R') {
      return ['外电路开关断开', '请先闭合开关', '回路无电流 / 无电压', 'T = ' + st.T.toFixed(3)];
    }
    if (spec.kind === 'R') {
      const inner = ohmInner(st.zero);
      const base = st.T >= 1 ? 0 : inner * (1 - st.T) / st.T;
      return ['欧姆挡 · 黑+ 红−', 'R = R内(1−T)/T，R内 ' + fmt(inner) + ' Ω',
        '读数 ' + (isFinite(base) ? (base * spec.mult).toFixed(2) : '∞') + ' Ω  ×' + spec.mult,
        'T = ' + st.T.toFixed(3)];
    }
    if (spec.kind === 'A') return ['电流挡串联 · 红进黑出', '量程 ' + spec.label,
      '读数 ' + (st.T * spec.fs * 1000).toFixed(1) + ' mA', 'T = ' + st.T.toFixed(3)];
    return ['电压挡并联 · 红高黑低', '量程 ' + spec.label,
      '读数 ' + (st.T * spec.fs).toFixed(2) + ' V', 'T = ' + st.T.toFixed(3)];
  }

  /* 电流/电压挡：水平段走笔尖高度（y=638），比电路顶边高 62px、比灯泡顶部高 35px，
     再竖直落到端点。这样红线不会横穿灯泡，也不贴着电路顶边走。 */
  function leadFlat(c, from, to, col) {
    const x0 = from[0], y0 = from[1], tx = to[0], ty = to[1];
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(tx, y0);
    c.lineTo(tx, ty);
    c.lineWidth = 4.2; c.strokeStyle = col;
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (c.setLineDash) c.setLineDash([]);
    c.stroke();
  }

  function drawExternal(c, st) {
    const shorted = st.probe === 2 || st.scene === 3;
    const isD = st.scene === 4 || st.scene === 5;
    const wantCircuit = st.scene === 1 || st.scene === 2 || isD;
    if (!shorted && !wantCircuit && !st.show) return;      // 默认态：实验区完全留白

    if (shorted) {
      /* 短接就是一根直线把两支表笔连起来 —— 不绕弯。 */
      c.beginPath();
      c.moveTo(TIP_A[0], TIP_A[1]); c.lineTo(TIP_A[0], 682);
      c.lineTo(TIP_B[0], 682); c.lineTo(TIP_B[0], TIP_B[1]);
      c.lineWidth = 3.2; c.strokeStyle = BLACK;
      c.lineCap = 'round'; c.lineJoin = 'round';
      if (c.setLineDash) c.setLineDash([]);
      c.stroke();
      cTxt(c, '短接 · 欧姆调零', 268, 736, 18, '"Microsoft YaHei",sans-serif', 'left', '#000000');
    } else if (wantCircuit) {
      /* 接法与挡位自动关联：电流挡串联（A）、电压挡并联（V）、欧姆挡断电测电阻（R），
         二极管正接/反接各一支。 */
      let kind;
      if (isD) kind = st.scene === 4 ? 'D' : 'DR';
      else if (st.scene === 1) kind = 'R';
      else kind = st.spec ? st.spec.kind : 'V';
      c.save();
      c.translate(CIRC.ox - CIRC.CL * CIRC.k, CIRC.oy - CIRC.CT * CIRC.k);
      c.scale(CIRC.k, CIRC.k);
      circuit(c, kind, st.sw === 1);
      c.restore();
      const tp = tipsFor(kind);
      const pr = mapPt(tp.red[0], tp.red[1]);        // A 笔 = 红
      const pb = mapPt(tp.black[0], tp.black[1]);    // B 笔 = 黑
      if (st.pens) {
        if (kind === 'V' || kind === 'A') {
          leadFlat(c, TIP_A, pr, RED);
          leadFlat(c, TIP_B, pb, BLACK);
        } else {
          leadTo(c, TIP_A, pr, RED, 690);
          leadTo(c, TIP_B, pb, BLACK, 690);
        }
      }
      if (st.scene === 1) {
        cTxt(c, 'Rx = ' + fmt(st.rx) + ' Ω', pr[0] - 8, pr[1] + 56, 20, C_FONT, 'left', '#000000');
      }
    }

    if (st.show) {
      const x = 430, y = 700, w = 282, h = 178;
      c.save();
      cRect(c, x, y, w, h, 2, '#000000', '#ffffff');
      c.fillStyle = '#000000'; c.textBaseline = 'alphabetic';
      const lines = readoutLines(st);
      c.font = '15px "Microsoft YaHei", sans-serif';
      lines.forEach((s, k) => c.fillText(s, x + 12, y + 32 + k * 30));
      c.restore();
    }
  }

  /* ---------- 注册 ---------- */
  P.emDefine({
    key: 'em_multimeter_internal',
    label: '多用电表内部电路（滑片·表针·挡位可调）',
    cat: 'emlab', dw: DW, dh: DH, animatable: false,
    params: [
      { key: 'emMiRange', label: '转换开关 S', min: 0, max: 6, step: 1, def: 0,
        hint: [{ label: '未接通', value: 0 }, { label: '1 · 500mA', value: 1 },
          { label: '2 · 100mA', value: 2 }, { label: '3 · Ω×1', value: 3 },
          { label: '4 · Ω×10', value: 4 }, { label: '5 · 3V', value: 5 },
          { label: '6 · 15V', value: 6 }] },
      { key: 'emMiR1', label: '滑片 R₁（E 支路）', min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: 'emMiR2', label: '滑片 R₂（E′ 支路）', min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: 'emMiT', label: '表针位置 T', min: 0, max: 1, step: 0.001, def: 0.5 },
      { key: 'emMiProbe', label: '表笔', min: 0, max: 2, step: 1, def: 0,
        hint: [{ label: '接入', value: 0 }, { label: '悬空', value: 1 }, { label: '短接', value: 2 }] },
      { key: 'emMiScene', label: '外接元件', min: 0, max: 5, step: 1, def: 0,
        hint: [{ label: '无', value: 0 }, { label: '定值电阻', value: 1 },
          { label: '待测电路', value: 2 }, { label: '短接导线', value: 3 },
          { label: '二极管 +', value: 4 }, { label: '二极管 −', value: 5 }] },
      { key: 'emMiRx', label: '待测电阻 Rx', min: 0, max: 1000, step: 1, def: 15, unit: 'Ω' },
      { key: 'emMiSw', label: '外电路开关', min: 0, max: 1, step: 1, def: 0,
        hint: [{ label: '断开', value: 0 }, { label: '闭合', value: 1 }] },
      { key: 'emMiPens', label: '红黑表笔', min: 0, max: 1, step: 1, def: 0,
        hint: [{ label: '隐藏', value: 0 }, { label: '显示', value: 1 }] },
      { key: 'emMiShow', label: '显示读数与方程', type: 'toggle', def: 0 },
    ],
    draw(c, o) {
      const st = stateOf(o);
      paint(c, st);
      drawExternal(c, st);
    },
  });

  /* ---------- 直接拖滑片：复用 input.js:3034 的 projHandles 契约 ---------- */
  function miToLogic(it, wx, wy) {
    const x1 = Math.min(it.x1, it.x2), y1 = Math.min(it.y1, it.y2);
    const w = Math.abs(it.x2 - it.x1), h = Math.abs(it.y2 - it.y1);
    const ls = Math.min(w / DW, h / DH);
    const ox = x1 + (w - DW * ls) / 2, oy = y1 + (h - DH * ls) / 2;
    const cx = (it.x1 + it.x2) / 2, cy = (it.y1 + it.y2) / 2, a = -(it.rot || 0);
    const dx = wx - cx, dy = wy - cy;
    const ux = cx + dx * Math.cos(a) - dy * Math.sin(a);
    const uy = cy + dx * Math.sin(a) + dy * Math.cos(a);
    return { lx: (ux - ox) / ls, ly: (uy - oy) / ls, ls: ls };
  }
  P.projHandles = P.projHandles || {};
  P.projHandles.em_multimeter_internal = {
    param: 'emMiR1',
    hit(it, wx, wy) {
      const q = miToLogic(it, wx, wy);
      if (!(q.ls > 0)) return false;
      const tol = Math.max(16, 14 / q.ls);
      const y1 = slideY(0, clamp(num(it.emMiR1, 0.5), 0, 1));
      const y2 = slideY(1, clamp(num(it.emMiR2, 0.5), 0, 1));
      return (Math.abs(q.lx - 403) <= tol && Math.abs(q.ly - y1) <= tol)
        || (Math.abs(q.lx - 502) <= tol && Math.abs(q.ly - y2) <= tol);
    },
    drag(it, wx, wy) {
      const q = miToLogic(it, wx, wy);
      if (!(q.ls > 0)) return false;
      const d1 = Math.abs(q.lx - 403), d2 = Math.abs(q.lx - 502);
      const k = d1 <= d2 ? 0 : 1;
      const s = clamp((q.ly - (SLIDES[k].y0 - SLIDES[k].span / 2)) / SLIDES[k].span, 0, 1);
      const key = k === 0 ? 'emMiR1' : 'emMiR2';
      const v = Math.round(s * 100) / 100;
      if (it[key] === v) return false;
      it[key] = v;
      this.param = key;                 // syncParam 同步对应的那一格
      return true;
    },
  };

  /* 自检探针：单测用同一份函数核对，不另造一套实现 */
  P.mmInternalModel = {
    tOfR, rOfT, needleT, zeroOf, stateOf, thetaOf, ohmInner, tipsFor, readoutLines,
    RANGE_SPEC, CIRCUIT, CIRC, RMID, RED, BLACK,
  };
  P.mmInternalTags = baseTags;
  P.mmInternalGeo = GEO;
  P.mmInternalSourceSVG = DATA.svg;
  P.mmInternalSha = DATA.sha;
})();
