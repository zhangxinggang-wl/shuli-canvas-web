/* 手写转公式 —— core/inkformula.js
 *
 * 课堂场景：老师在板书上推了一个式子，想把它变成可编辑、可搜索、能缩放的公式对象。
 * 全离线环境里没有可靠的数学 OCR，所以这里走的是「手写 + 一次确认」的路子：
 *
 *   1. 切分  把笔迹按空间距离聚成一个个「符号块」，再按行排成从左到右的序列
 *   2. 识别  每个块算一组形状特征，和模板库比对，给出若干候选
 *            模板库 = 系统字体渲染出的字形（内置） + 用户确认过的笔迹（会一直学）
 *   3. 纠错  每个块点一下就能从候选里换，也有完整符号板兜底
 *   4. 组装  自动判断上下标、分数线，拼成 LaTeX，实时预览，确认后插入画布
 *
 * 这里不做「猜一个答案就交差」：任何一块识别不出来，都会在结果里标成 ? 让你点一下，
 * 绝不静默写错。用户每次纠正都会变成新模板，同一个人的字会越用越准。
 *
 * 对外 API：
 *   GW.inkrecog.infer(strokes, opts)   纯函数：[[x,y,x,y,…], …] → {tokens, tex, lines}
 *   GW.inkrecog.candidates(vec, n)     拿某个特征向量的候选
 *   GW.inkrecog.learn(ch, strokes)     把这一笔迹当成 ch 的模板收下
 *   GW.inkrecog.resetLearning()        清空学习到的模板
 *   GW.formulaPad()                    打开手写公式板
 */
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW) return;
  const h = GW.h;

  const N = 32;          // 特征栅格
  const THIN = false;     // 是否先细化成 1 像素中心线再提特征（见 thin()）
  const M = 16;          // 占据图的边长（M*M 个格子）。这一维直接决定「同样的
                         // 骨架、不同的形状」能不能分开：8 太粗（圆和 e / m 的
                         // 分数咬在一起），16 才让 0 / o / e 各归各位。
  const CELL = N / M;
  const KEY = 'gewu.inkTemplates';   // 用户学到的模板
  const FKEY = 2;                    // 模板格式版本：M 或特征口径一变就得 +1，
                                     // 否则旧存档里长度不符的 mask 会被当成有效模板

  // 内置字符集（1.0.20 扩充）：按 EduEditer「学术符号」工具栏的九大类整理，
  // 再加上常用数学关系符与几何/微积分记号。模板由系统字体渲染，字库缺哪个字形就自动跳过。
  const SYM_GROUPS = [
    ['基本数学', '+-−×÷·=≠≈≡≢<>≤≥≪≫±∓∝∞∶√∛∜∑∏∐∫∬∭∮∂∇∆'],
    ['括号与分隔', '()[]{}|‖⌈⌉⌊⌋⟨⟩'],
    ['基本几何', '∠∟⊥∥△▲▽▼○●◎◇◆□■◯⊙⊿⌒≅≃∼≌'],
    ['逻辑符号', '¬∧∨⊕⊗⊻∀∃∄⊤⊢⊣⊨⊩'],
    ['省略号', '…⋯⋮⋱'],
    ['集合符号', '∈∉∋∌⊂⊃⊄⊅⊆⊇⊈⊉∪∩∅∁ℕℤℚℝℂ'],
    ['箭头符号', '→←↑↓↔↕⇐⇒⇑⇓⇔⇕↗↘↖↙↦↪↩⟵⟶⟷⟹⟸⟺'],
    ['希腊小写', 'αβγδεζηθικλμνξοπρστυφχψω'],
    ['希腊大写', 'ΓΔΘΛΞΠΣΦΨΩ'],
    ['高等代数', '⊗⊙⊕⊞⊟⊠⊡⋆⋄∘∙∎⋈⋉⋊⨁⨂⨀≀≍≜∔∸∥‖⟨⟩⊤⊥'],
    ['其他符号', '°′″‴‰§¶†‡•※★☆☉♀♂ℓℏ≔≕≐≑≒∴∵'],
  ];
  const CHARS = (function () {
    let s = '0123456789' + '+-=/().,<>[]{}|!?' +
      'xyzabckmntvsuTweoOlLpfghijqrd' + 'ABCDEFGHIJKLMNPQRSUVWXYZ';
    for (const g of SYM_GROUPS) for (const c of g[1]) if (s.indexOf(c) < 0) s += c;
    return s;
  })();
  // 字体越多，同一字符的模板越多，写法差异的宽容度越高；缺字体/缺字形都安全跳过
  const FONTS = ['SimSun', 'SimHei', 'KaiTi', 'Cambria Math', 'FangSong', 'Microsoft YaHei', 'Segoe UI Symbol'];

  // 符号板：分组给按钮，结构类直接插骨架
  const PALETTE = [
    ['数字运算', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ',', '+', '-', '\\times', '\\div', '=', '\\ne', '<', '>', '\\le', '\\ge', '\\pm', '\\infty', '(', ')', '[', ']', '\\{', '\\}']],
    ['字母', ['x', 'y', 'z', 'a', 'b', 'c', 'k', 'm', 'n', 't', 'v', 's', 'u', 'T', 'w', '\\alpha', '\\beta', '\\gamma', '\\theta', '\\lambda', '\\mu', '\\omega', '\\pi', '\\Delta', '\\varphi']],
    ['结构', ['\\frac{}{}', '\\sqrt{}', '^{}', '_{}', '\\sqrt[3]{}', '\\left(\\right)', '\\left[\\right]', '\\vec{}', '\\bar{}', '\\hat{}', '\\dot{}', '\\overrightarrow{}', '\\begin{cases}\\end{cases}', '\\begin{aligned}\\end{aligned}']],
    ['高级', ['\\int_{}^{}', '\\iint', '\\oint', '\\sum_{}^{}', '\\prod_{}^{}', '\\lim_{}', '\\to', '\\Rightarrow', '\\Leftrightarrow', '\\cdot', '\\cdots', '\\Delta', '\\partial', '\\nabla', '\\sin', '\\cos', '\\tan', '\\log', '\\ln', '\\exp', '\\infty', '\\approx', '\\propto', '\\angle', '\\perp', '\\parallel', '\\triangle']],
    // 1.0.20：按 EduEditer 的九大类补的符号板（点了直接插 LaTeX，不依赖识别）
    ['希腊', ['\\alpha', '\\beta', '\\gamma', '\\delta', '\\varepsilon', '\\zeta', '\\eta', '\\theta', '\\lambda', '\\mu', '\\pi', '\\rho', '\\sigma', '\\tau', '\\varphi', '\\omega', '\\Gamma', '\\Delta', '\\Theta', '\\Lambda', '\\Xi', '\\Pi', '\\Sigma', '\\Phi', '\\Psi', '\\Omega']],
    ['集合逻辑', ['\\in', '\\notin', '\\subset', '\\subseteq', '\\supset', '\\supseteq', '\\cup', '\\cap', '\\varnothing', '\\complement', '\\forall', '\\exists', '\\neg', '\\wedge', '\\vee', '\\oplus', '\\therefore', '\\because', '\\mathbb{N}', '\\mathbb{Z}', '\\mathbb{Q}', '\\mathbb{R}', '\\mathbb{C}']],
    ['箭头', ['\\to', '\\leftarrow', '\\uparrow', '\\downarrow', '\\leftrightarrow', '\\nearrow', '\\searrow', '\\Rightarrow', '\\Leftarrow', '\\Leftrightarrow', '\\mapsto', '\\longrightarrow', '\\Longleftrightarrow']],
    ['几何', ['\\angle', '\\perp', '\\parallel', '\\triangle', '\\bigcirc', '\\square', '\\cong', '\\sim', '\\because', '\\therefore', '^{\\circ}', '\\prime']],
    ['微积分', ['\\int', '\\iint', '\\iiint', '\\oint', '\\sum', '\\prod', '\\partial', '\\nabla', '\\infty', '\\lim_{}', '\\log', '\\ln', '\\sin', '\\cos', '\\tan']],
    // 1.0.20：高等代数常用结构（矩阵/行列式/秩/内积）—— 识别不了矩阵，但一键能插
    ['高等代数', ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}', '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}',
      '\\begin{pmatrix} x_1 \\\\ x_2 \\\\ \\vdots \\\\ x_n \\end{pmatrix}', 'A^{T}', 'A^{-1}', '\\det A', '\\operatorname{rank} A', '\\dim V', '\\ker T', '\\operatorname{Im} T',
      '\\langle u, v \\rangle', '\\|x\\|', 'A \\otimes B', 'A \\oplus B', 'A \\odot B', 'v \\perp w', '\\{v_1, \\ldots, v_n\\}']],
  ];

  // ============================================================
  // 特征
  // ============================================================
  const bits = new Uint8Array(N * N);

  function boxOf(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < pts.length; i += 2) {
      if (pts[i] < x0) x0 = pts[i];
      if (pts[i] > x1) x1 = pts[i];
      if (pts[i + 1] < y0) y0 = pts[i + 1];
      if (pts[i + 1] > y1) y1 = pts[i + 1];
    }
    return { x: x0, y: y0, w: Math.max(x1 - x0, 0.01), h: Math.max(y1 - y0, 0.01) };
  }

  // 把一组折线按「等比缩放 + 居中」画进 N×N 栅格（笔宽固定 1 格，抵消手写粗细差异）
  function raster(strokes) {
    bits.fill(0);
    const all = [];
    for (const s of strokes) for (let i = 0; i < s.length; i += 2) all.push(s[i], s[i + 1]);
    const b = boxOf(all);
    const k = (N - 6) / Math.max(b.w, b.h);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const plot = (x, y) => {
      const ix = Math.round(x), iy = Math.round(y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const px = ix + dx, py = iy + dy;
        if (px >= 0 && px < N && py >= 0 && py < N) bits[py * N + px] = 1;
      }
    };
    for (const s of strokes) {
      let px = NaN, py = NaN;
      for (let i = 0; i < s.length; i += 2) {
        const x = (s[i] - cx) * k + N / 2, y = (s[i + 1] - cy) * k + N / 2;
        if (i === 0) { plot(x, y); px = x; py = y; continue; }
        const d = Math.hypot(x - px, y - py), n = Math.max(1, Math.ceil(d / 0.4));
        for (let j = 1; j <= n; j++) plot(px + (x - px) * j / n, py + (y - py) * j / n);
        px = x; py = y;
      }
    }
    return b;
  }

  // 字体字形：直接对二值掩膜等比采样进 N×N
  function rasterMask(w, hgt, mask) {
    bits.fill(0);
    const k = (N - 6) / Math.max(w, hgt);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const sx = Math.round((x - N / 2) / k + w / 2), sy = Math.round((y - N / 2) / k + hgt / 2);
        if (sx >= 0 && sx < w && sy >= 0 && sy < hgt && mask[sy * w + sx]) {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const px = x + dx, py = y + dy;
            if (px >= 0 && px < N && py >= 0 && py < N) bits[py * N + px] = 1;
          }
        }
      }
    }
  }

  function components() {
    const seen = new Uint8Array(N * N);
    let comps = 0;
    const stack = [];
    for (let i = 0; i < N * N; i++) {
      if (!bits[i] || seen[i]) continue;
      comps++; stack.length = 0; stack.push(i); seen[i] = 1;
      while (stack.length) {
        const p = stack.pop(), px = p % N, py = (p - px) / N;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const q = ny * N + nx;
          if (bits[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
    }
    // 洞：从边框对空白做 4 连通泛洪，没淹到的空白就是洞
    const blank = new Uint8Array(N * N);
    const st2 = [];
    for (let x = 0; x < N; x++) { st2.push(x, (N - 1) * N + x); }
    for (let y = 0; y < N; y++) { st2.push(y * N, y * N + N - 1); }
    while (st2.length) {
      const p = st2.pop(), px = p % N, py = (p - px) / N;
      if (p < 0 || p >= N * N || bits[p] || blank[p]) continue;
      blank[p] = 1;
      if (px > 0) st2.push(p - 1);
      if (px < N - 1) st2.push(p + 1);
      if (py > 0) st2.push(p - N);
      if (py < N - 1) st2.push(p + N);
    }
    let holes = 0, seen2 = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) {
      if (bits[i] || blank[i] || seen2[i]) continue;
      holes++; const s = [i]; seen2[i] = 1;
      while (s.length) {
        const p = s.pop(), px = p % N, py = (p - px) / N;
        for (const q of [p - 1, p + 1, p - N, p + N]) {
          if (q < 0 || q >= N * N) continue;
          const qx = q % N;
          if (Math.abs(qx - px) > 1) continue;
          if (!bits[q] && !blank[q] && !seen2[q]) { seen2[q] = 1; s.push(q); }
        }
      }
    }
    return { comps, holes };
  }

  function featurize() {
    const { comps, holes } = components();
    const mask = new Float32Array(M * M);
    const px = new Float32Array(M), py = new Float32Array(M);
    const d1 = new Float32Array(M), d2 = new Float32Array(M);
    let ink = 0, x0 = N, y0 = N, x1 = -1, y1 = -1;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!bits[y * N + x]) continue;
        ink++;
        mask[(y / CELL | 0) * M + (x / CELL | 0)] += 1 / (CELL * CELL);
        px[x / CELL | 0]++; py[y / CELL | 0]++;
        const a = (x + y) / 2 / (N - 1), b = (x - y + N - 1) / 2 / (N - 1);
        d1[Math.min(M - 1, a * M | 0)]++; d2[Math.min(M - 1, b * M | 0)]++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const norm = (v) => { let s = 0; for (const t of v) s += t; if (s > 0) for (let i = 0; i < v.length; i++) v[i] /= s; return v; };
    norm(px); norm(py); norm(d1); norm(d2);
    const w = Math.max(1, x1 - x0 + 1), hgt = Math.max(1, y1 - y0 + 1);
    const aspect = Math.min(Math.max(w / hgt, 0.06), 8) / 8;
    const fill = ink / (w * hgt);
    return {
      mask, px, py, d1, d2,
      topo: [Math.min(aspect * 4, 1), Math.min(fill, 1), Math.min(comps / 4, 1), Math.min(holes / 2, 1)],
      ink, w, hgt, comps, holes, fill,
    };
  }

  function cos(a, b) {
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? d / Math.sqrt(na * nb) : 0;
  }
  function l1(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; }

  // 相似度各项权重。集中放在这里，一是便于用 scripts/sweep-recog.js 做消融
  // 实验（导出为 GW.inkrecog.weights），二是让「哪一项在起作用」一目了然。
  // 说明：dd（墨量密度）在手写粗笔迹 vs 字体字形之间是系统性偏差 —— 手画的圈
  // fill 只有 0.33，字体 0 有 0.65，于是「谁更胖」会压过「形状像不像」。所以它
  // 的权重直接设为 0（实测把它加回来反而掉分，见 scripts/sweep-weights.js 的
  // A/B 两组：dd=0 时 top8 命中 12/16，dd=0.03 只剩 11/16）。保留这一项是为了
  // 以后换成「笔画粗细归一化之后」的墨量特征，而不是现在这种原始密度。
  const W = { m: 0.42, p: 0.08, d: 0.06, asp: 0.28, hh: 0.10, cc: 0.06, dd: 0 };

  function similarity(a, b) {
    const m = cos(a.mask, b.mask);
    const p = 1 - (l1(a.px, b.px) + l1(a.py, b.py)) / 4;
    const d = 1 - (l1(a.d1, b.d1) + l1(a.d2, b.d2)) / 4;
    // 长宽比必须单独算、单独给权重：早先把它塞进 topo 再取平均，一个圆圈和
    // 一个瘦长的 0 只差 0.15，除以 4 之后几乎不影响排序，于是「圆」会被认成
    // α / a / m 这些圆头字母。这里改成按「比值取对数」的高斯核比较：
    // 形状一样得 1 分，差 1.5 倍得 0.54，差 2 倍得 0.14 —— 手写体的自然变形
    // 不会受罚，而「正圆」和「瘦长的零」这种本质差别能拉开。
    const ar = Math.min(a.w / a.hgt, a.hgt / a.w), br = Math.min(b.w / b.hgt, b.hgt / b.w);
    const lg = Math.log(ar / br);
    const asp = Math.exp(-(lg * lg) / (2 * 0.35 * 0.35));
    // 洞的数量是「0 / o / 8」这类字符的硬指纹，比像素相似度更可靠
    const hh = a.holes === b.holes ? 1 : (a.holes && b.holes ? 0.7 : 0.2);
    const cc = a.comps === b.comps ? 1 : (Math.abs(a.comps - b.comps) === 1 ? 0.6 : 0.15);
    const dd = 1 - Math.min(1, Math.abs((a.fill || 0) - (b.fill || 0)) / 0.32);
    return W.m * m + W.p * p + W.d * d + W.asp * asp + W.hh * hh + W.cc * cc + W.dd * dd;
  }

  // 把各项拆开，方便校准权重时看清「差在哪一项」
  function scoreParts(a, b) {
    const m = cos(a.mask, b.mask);
    const p = 1 - (l1(a.px, b.px) + l1(a.py, b.py)) / 4;
    const d = 1 - (l1(a.d1, b.d1) + l1(a.d2, b.d2)) / 4;
    const ar = Math.min(a.w / a.hgt, a.hgt / a.w), br = Math.min(b.w / b.hgt, b.hgt / b.w);
    const lg = Math.log(ar / br);
    const asp = Math.exp(-(lg * lg) / (2 * 0.35 * 0.35));
    const hh = a.holes === b.holes ? 1 : (a.holes && b.holes ? 0.7 : 0.2);
    const cc = a.comps === b.comps ? 1 : (Math.abs(a.comps - b.comps) === 1 ? 0.6 : 0.15);
    const dd = 1 - Math.min(1, Math.abs((a.fill || 0) - (b.fill || 0)) / 0.32);
    return {
      total: 0.34 * m + 0.10 * p + 0.06 * d + 0.30 * asp + 0.08 * hh + 0.06 * cc + 0.06 * dd,
      m: +m.toFixed(3), p: +p.toFixed(3), d: +d.toFixed(3), asp: +asp.toFixed(3),
      hh: +hh.toFixed(2), cc: +cc.toFixed(2), dd: +dd.toFixed(3),
      ar: +(a.w / a.hgt).toFixed(3), br: +(b.w / b.hgt).toFixed(3),
      aHoles: a.holes, bHoles: b.holes, aComps: a.comps, bComps: b.comps,
      aFill: +(a.fill || 0).toFixed(3), bFill: +(b.fill || 0).toFixed(3),
    };
  }

  // ============================================================
  // 模板库
  // ============================================================
  let fontTpl = null;      // [{ch, feat, src}]
  let userTpl = null;      // 用户确认过的

  function loadUser() {
    if (userTpl) return userTpl;
    userTpl = [];
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && raw.v === FKEY && Array.isArray(raw.t)) {
        for (const t of raw.t) {
          if (!t.ch || !Array.isArray(t.m)) continue;
          userTpl.push({ ch: t.ch, src: 'user', feat: { mask: Float32Array.from(t.m), px: Float32Array.from(t.px || new Array(M).fill(0)), py: Float32Array.from(t.py || new Array(M).fill(0)), d1: Float32Array.from(t.d1 || new Array(M).fill(0)), d2: Float32Array.from(t.d2 || new Array(M).fill(0)), topo: t.tp || [0, 0, 0, 0] } });
        }
      }
    } catch (e) { console.warn('手写模板读取失败', e); }
    return userTpl;
  }

  function saveUser() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        v: FKEY,
        t: userTpl.map((x) => ({ ch: x.ch, m: Array.from(x.feat.mask), px: Array.from(x.feat.px), py: Array.from(x.feat.py), d1: Array.from(x.feat.d1), d2: Array.from(x.feat.d2), tp: x.feat.topo })),
      }));
    } catch (e) { console.warn('手写模板保存失败', e); }
  }

  // 易混字符：用户把「首选 A」改成了 B，就记 A→B 一笔。
  // 模板只能记住「B 长什么样」，记不住「模型老把 B 看成 A」；这张表补的就是后者。
  const CKEY = 'gewu.inkConfuse';
  let confuse = null;

  function loadConfuse() {
    if (confuse) return confuse;
    confuse = {};
    try {
      const raw = JSON.parse(localStorage.getItem(CKEY) || 'null');
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const k of Object.keys(raw)) {
          const m = raw[k];
          if (!m || typeof m !== 'object') continue;
          for (const c of Object.keys(m)) {
            const n = Number(m[c]) || 0;
            if (n > 0) (confuse[k] = confuse[k] || {})[c] = Math.min(9, n);
          }
        }
      }
    } catch (e) { console.warn('易混表读取失败', e); }
    return confuse;
  }

  function saveConfuse() {
    try { localStorage.setItem(CKEY, JSON.stringify(confuse || {})); }
    catch (e) { console.warn('易混表保存失败', e); }
  }

  function learnConfuse(wrong, right) {
    if (!wrong || !right || wrong === right) return;
    const m = loadConfuse();
    (m[wrong] = m[wrong] || {})[right] = Math.min(9, (m[wrong][right] || 0) + 1);
    saveConfuse();
  }

  // 加分：这次的首选是 wrong，而以前用户在这个 wrong 下选过 right → 给 right 加一点
  function confuseBonus(wrong, ch) {
    const m = loadConfuse()[wrong];
    const n = m && m[ch];
    return n ? Math.min(0.20, 0.06 * n) : 0;
  }

  function resetConfuse() { confuse = {}; saveConfuse(); }

  // 用系统字体渲染字形，生成内置模板（懒加载，一次约几十毫秒）
  function buildFontTemplates() {
    if (fontTpl) return fontTpl;
    fontTpl = [];
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    for (const ch of CHARS) {
      for (const font of FONTS) {
        try {
          ctx.clearRect(0, 0, 96, 96);
          ctx.font = '700 72px "' + font + '", serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#000';
          ctx.fillText(ch, 48, 52);
          const im = ctx.getImageData(0, 0, 96, 96).data;
          let x0 = 96, y0 = 96, x1 = -1, y1 = -1;
          const bm = new Uint8Array(96 * 96);
          for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
            if (im[(y * 96 + x) * 4 + 3] > 60) { bm[y * 96 + x] = 1; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
          if (x1 < x0) continue;   // 这个字体没有这个字形
          const w = x1 - x0 + 1, hgt = y1 - y0 + 1;
          const crop = new Uint8Array(w * hgt);
          for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) crop[y * w + x] = bm[(y + y0) * 96 + (x + x0)];
          rasterMask(w, hgt, crop);
          fontTpl.push({ ch, src: 'font:' + font, feat: featurize() });
        } catch (e) { /* 字体缺失就跳过 */ }
      }
    }
    return fontTpl;
  }

  function candidatesFor(feat, n) {
    const tpl = loadUser().concat(buildFontTemplates());
    const best = new Map();
    for (const t of tpl) {
      const s = similarity(feat, t.feat);
      const prev = best.get(t.ch);
      if (!prev || s > prev.s) best.set(t.ch, { ch: t.ch, s, src: t.src });
    }
    return [...best.values()].sort((a, b) => b.s - a.s).slice(0, n || 6);
  }

  function learn(ch, strokes) {
    if (!ch) return;
    const f = (raster(strokes), featurize());
    loadUser().push({ ch, src: 'user', feat: f });
    // 每个字最多留 12 个个人模板，免得越攒越慢
    const mine = userTpl.filter((t) => t.ch === ch);
    if (mine.length > 12) {
      const drop = new Set(mine.slice(0, mine.length - 12));
      userTpl = userTpl.filter((t) => !drop.has(t));
    }
    saveUser();
  }

  function resetLearning() { userTpl = []; saveUser(); }

  // ============================================================
  // 切分：笔迹 → 符号块 → 行
  // ============================================================
  function strokeBox(s) { return boxOf(s); }

  function cluster(strokes) {
    const boxes = strokes.map(strokeBox);
    // 全局尺度参考：各笔画长边的中位数。所有阈值都相对它，才能一视同仁地
    // 处理「写得很小的一行式子」和「写满整块板的一个符号」。
    const sizes = boxes.map((b) => Math.max(b.w, b.h)).sort((a, b) => a - b);
    const REF = Math.max(sizes[sizes.length >> 1] || 1, 1e-6);
    const flat = (b) => b.w > 2.6 * b.h;   // 长横（分数线 / 等号 / 减号 / 点）

    const parent = strokes.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
    for (let i = 0; i < strokes.length; i++) {
      for (let j = i + 1; j < strokes.length; j++) {
        const A = boxes[i], B = boxes[j];
        const hg = Math.max(0, Math.max(A.x, B.x) - Math.min(A.x + A.w, B.x + B.w));
        const vg = Math.max(0, Math.max(A.y, B.y) - Math.min(A.y + A.h, B.y + B.h));
        const ox = Math.max(0, Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x));
        const uw = Math.min(A.w, B.w) || 1e-6;
        const sameFlat = flat(A) === flat(B);
        // (1) 两笔挨在一起 → 同一个字的笔画。横竖相接的 T / L / + / 4 也走这条，
        // 所以这里不能用「必须同为长横或同为竖笔」来卡：那样写 T 会被切成
        // 「−」和「1」两块，永远认不出 T。判据改成「垂直间隙小于两笔中较矮那
        // 一笔的 15%」—— 真正相接的两笔间隙为 0，而分式的分子与分数线之间
        // 总有缝，不会误并。
        const touching = hg < 0.15 * uw && vg < 0.15 * Math.min(A.h, B.h);
        // (2) 上下叠在一起、外形风格一致 → 同一个字（= 的两横、i / ? 的点）。
        // 阈值以「两笔中更宽那一笔的宽度」为尺度，而不是以字高或 REF 为尺度：
        // 分式的分子和分母也常常水平对齐、只隔开半个字高，用高度当尺度就会把
        // 它们并成一块，分数线就永远折不出 rac 了。横线的宽度天然远大于它与
        // 同伴的间距，用宽度做尺度能自然区分这两种情形。
        const wref = Math.max(A.w, B.w);
        const stacked = sameFlat && ox > 0.6 * wref && vg < 0.35 * wref;
        if (touching || stacked) uni(i, j);
      }
    }
    const groups = new Map();
    strokes.forEach((s, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(s);
    });
    return [...groups.values()].map((ss) => {
      const all = [];
      for (const s of ss) for (let i = 0; i < s.length; i += 2) all.push(s[i], s[i + 1]);
      return { strokes: ss, box: boxOf(all) };
    });
  }

  // 按 y 分组成行：两块的垂直重叠超过较小者高度的一半就算同一行
  // 同一行的归并规则：只在「垂直间隙很小」或「垂直接近且水平相邻」时才并成一行。
  // 于是右上角的小符号（上标）会跟底数留在同一行、分式的分子分母会跟分数线留在
  // 同一行，而真正换了一行的内容又不会糊到一起。用并查集是为了让「分子—分数线—
  // 分母」这种链式关系传递下去。
  function toLines(tokens) {
    const n = tokens.length;
    if (!n) return [];
    const hs = tokens.map((t) => t.box.h).sort((a, b) => a - b);
    const REF = Math.max(hs[hs.length >> 1] || 1, 1e-6);
    const parent = tokens.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const A = tokens[i].box, B = tokens[j].box;
        const vg = Math.max(0, Math.max(A.y, B.y) - Math.min(A.y + A.h, B.y + B.h));
        const hg = Math.max(0, Math.max(A.x, B.x) - Math.min(A.x + A.w, B.x + B.w));
        if (vg < 0.15 * REF || (vg < 0.55 * REF && hg < 0.5 * REF)) uni(i, j);
      }
    }
    const map = new Map();
    tokens.forEach((t, i) => {
      const r = find(i);
      if (!map.has(r)) map.set(r, []);
      map.get(r).push(t);
    });
    const lines = [];
    for (const t of map.values()) {
      t.sort((a, b) => a.box.x - b.box.x);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const o of t) { x0 = Math.min(x0, o.box.x); y0 = Math.min(y0, o.box.y); x1 = Math.max(x1, o.box.x + o.box.w); y1 = Math.max(y1, o.box.y + o.box.h); }
      lines.push({ t, x0, x1, y0, y1 });
    }
    return lines.sort((a, b) => a.y0 - b.y0);
  }

  // 分数线要在分行之前认出来：一条横线，往上往下都紧贴着东西，才是分式；
  // 减号 / 等号只有左右有东西，所以不会被误判。
  function foldFractions(tokens) {
    let out = tokens.slice();
    for (let guard = 0; guard < 8; guard++) {
      const hs = out.map((t) => t.box.h).sort((a, b) => a - b);
      const REF = Math.max(hs[hs.length >> 1] || 1, 1e-6);
      let hit = null;
      for (const t of out) {
        if (!t.strokes || t.strokes.length > 1) continue;
        const b = t.box;
        if (!(b.w > 1.2 * b.h + 2)) continue;          // 必须是一条扁横线
        if (b.w < 0.55 * REF) continue;                // 太短的小横不是分数线
        const by = b.y + b.h / 2, bx0 = b.x, bx1 = b.x + b.w;
        const inside = (o) => { const c = o.box.x + o.box.w / 2; return c >= bx0 - b.w * 0.12 && c <= bx1 + b.w * 0.12; };
        const num = out.filter((o) => o !== t && inside(o) && o.box.y + o.box.h <= by + 1e-6);
        const den = out.filter((o) => o !== t && inside(o) && o.box.y >= by - 1e-6);
        if (!num.length || !den.length) continue;
        const nTop = Math.min(...num.map((o) => o.box.y));
        const dBot = Math.max(...den.map((o) => o.box.y + o.box.h));
        if (by - Math.max(...num.map((o) => o.box.y + o.box.h)) > 0.75 * REF) continue;
        if (Math.min(...den.map((o) => o.box.y)) - by > 0.75 * REF) continue;
        if (dBot - nTop > 3.0 * REF) continue;
        hit = { t, num, den };
        break;
      }
      if (!hit) break;
      const all = [hit.t].concat(hit.num, hit.den);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const o of all) { x0 = Math.min(x0, o.box.x); y0 = Math.min(y0, o.box.y); x1 = Math.max(x1, o.box.x + o.box.w); y1 = Math.max(y1, o.box.y + o.box.h); }
      const node = { frac: [hit.num, hit.den], box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, ch: null, strokes: [], cands: [], conf: 1 };
      out = out.filter((o) => all.indexOf(o) < 0);
      out.push(node);
    }
    return out;
  }

  // ============================================================
  // 组装 LaTeX
  // ============================================================
  const SPECIAL_TEX = {
    '×': '\\times', '÷': '\\div', '·': '\\cdot', '−': '-',
    '≤': '\\le', '≥': '\\ge', '≠': '\\ne', '≈': '\\approx', '≡': '\\equiv', '∼': '\\sim', '∝': '\\propto',
    '±': '\\pm', '∓': '\\mp',
    '→': '\\to', '←': '\\leftarrow', '↑': '\\uparrow', '↓': '\\downarrow', '↔': '\\leftrightarrow',
    '⇒': '\\Rightarrow', '⇔': '\\Leftrightarrow',
    '∞': '\\infty', '√': '\\sqrt{}', '∫': '\\int', '∬': '\\iint', '∮': '\\oint',
    '∑': '\\sum', '∏': '\\prod',
    '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '⊃': '\\supset', '⊆': '\\subseteq', '⊇': '\\supseteq',
    '∪': '\\cup', '∩': '\\cap', '∅': '\\varnothing',
    '∀': '\\forall', '∃': '\\exists', '¬': '\\neg', '∧': '\\wedge', '∨': '\\vee',
    '∠': '\\angle', '⊥': '\\perp', '∥': '\\parallel', '△': '\\triangle', '○': '\\bigcirc',
    '°': '^{\\circ}', '′': "'", '″': "''", '∂': '\\partial', '∇': '\\nabla',
    '∴': '\\therefore', '∵': '\\because',
    'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\epsilon', 'ζ': '\\zeta',
    'η': '\\eta', 'θ': '\\theta', 'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
    'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau',
    'φ': '\\phi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
    'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi', 'Π': '\\Pi',
    'Σ': '\\Sigma', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega',
    '{': '\\{', '}': '\\}',
    // 1.0.20：随字符集扩充补的映射（没列到的符号直接输出原字符，KaTeX 多数能认）
    '≢': '\\not\\equiv', '≅': '\\cong', '≃': '\\simeq', '≌': '\\cong', '≪': '\\ll', '≫': '\\gg',
    '∋': '\\ni', '∌': '\\not\\ni', '⊄': '\\not\\subset', '⊅': '\\not\\supset',
    '⊈': '\\nsubseteq', '⊉': '\\nsupseteq', '∁': '\\complement',
    '⇐': '\\Leftarrow', '⇑': '\\Uparrow', '⇓': '\\Downarrow', '⇕': '\\Updownarrow', '↕': '\\updownarrow',
    '↗': '\\nearrow', '↘': '\\searrow', '↖': '\\nwarrow', '↙': '\\swarrow',
    '↦': '\\mapsto', '↪': '\\hookrightarrow', '↩': '\\hookleftarrow',
    '⟵': '\\longleftarrow', '⟶': '\\longrightarrow', '⟷': '\\longleftrightarrow',
    '⟹': '\\Longrightarrow', '⟸': '\\Longleftarrow', '⟺': '\\Longleftrightarrow',
    '⊕': '\\oplus', '⊗': '\\otimes', '⊻': '\\veebar',
    '⊢': '\\vdash', '⊣': '\\dashv', '⊨': '\\models', '⊤': '\\top',
    '…': '\\ldots', '⋯': '\\cdots', '⋮': '\\vdots', '⋱': '\\ddots',
    '⟨': '\\langle', '⟩': '\\rangle', '⌈': '\\lceil', '⌉': '\\rceil', '⌊': '\\lfloor', '⌋': '\\rfloor', '‖': '\\Vert',
    'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℝ': '\\mathbb{R}', 'ℂ': '\\mathbb{C}',
    'ℓ': '\\ell', 'ℏ': '\\hbar', '§': '\\S', '¶': '\\P', '★': '\\star',
    '∭': '\\iiint', '∛': '\\sqrt[3]{}', '∜': '\\sqrt[4]{}', '∆': '\\Delta',
    // 高等代数（1.0.20）
    '⊙': '\\odot', '⊞': '\\boxplus', '⊟': '\\boxminus',
    '⊠': '\\boxtimes', '⊡': '\\boxdot', '⋆': '\\star', '⋄': '\\diamond', '∘': '\\circ',
    '∙': '\\bullet', '∎': '\\blacksquare', '⋈': '\\bowtie', '⋉': '\\ltimes', '⋊': '\\rtimes',
    '⨁': '\\bigoplus', '⨂': '\\bigotimes', '⨀': '\\bigodot', '≀': '\\wr',
    '≍': '\\asymp', '≜': '\\triangleq', '∐': '\\coprod', '∔': '\\dotplus', '∸': '\\dotminus',
  };
  function texOf(ch) { return SPECIAL_TEX[ch] || ch; }

  function tokenTex(t) {
    if (t.frac) return '\\frac{' + rowTex(t.frac[0]) + '}{' + rowTex(t.frac[1]) + '}';
    return texOf(t.ch || '?');
  }

  // 一条又长又扁、又比同行一般字符更宽的横线 —— 那是分数线，不是减号
  function isBar(t) {
    const b = t.box;
    if (t.strokes.length > 1) return false;
    return b.w > 0.9 * (t.hMed || b.h) && b.h < 0.3 * b.w;
  }

  function seqTex(list) { return list.map(tokenTex).join(''); }

  // 一排 token → LaTeX（处理分数线 / 上下标）
  function rowTex(tokens) {
    if (!tokens.length) return '';
    const hs = tokens.map((t) => t.box.h).sort((a, b) => a - b);
    const hMax = hs[hs.length - 1];
    const hMed = hs[hs.length >> 1];
    for (const t of tokens) { t.hMax = hMax; t.hMed = hMed; }
    // 基线只用「正常大小」的符号算：上下标会把中位数带偏
    const main = tokens.filter((t) => t.box.h >= 0.68 * hMax);
    const cyOf = (t) => t.box.y + t.box.h / 2;
    const med = (arr) => arr.slice().sort((a, b) => a - b)[arr.length >> 1];
    const mainCy = med(main.map(cyOf));

    // 上下标：相对行中心偏移明显、个头又小的，挂到左边那个符号上。
    // （分数线已经在 foldFractions 里折成分式节点了，这里只会遇到普通符号。）
    const atoms = [];
    for (const t of tokens) {
      const cy = t.box.y + t.box.h / 2;
      const small = t.box.h < 0.92 * hMax;
      const up = small && cy < mainCy - 0.30 * hMed;
      const dn = small && cy > mainCy + 0.26 * hMed;
      const prev = atoms[atoms.length - 1];
      if (prev && up) { prev.sup.push(t); continue; }
      if (prev && dn) { prev.sub.push(t); continue; }
      atoms.push({ base: t, sup: [], sub: [] });
    }
    return atoms.map(atomTex).join('');
  }

  function atomTex(a) {
    let s = tokenTex(a.base);
    if (a.sup.length) s += '^{' + seqTex(a.sup) + '}';
    if (a.sub.length) s += '_{' + seqTex(a.sub) + '}';
    return s;
  }

  // ============================================================
  // 主入口：笔迹 → { tokens, tex }
  // ============================================================
  // 候选重排：0 / O、1 / l / I、× / x 这类「字形分不开、位置分得开」的字符，
  // 靠左右邻居的类别（数字 / 字母 / 运算符）把候选顺序扶正。
  const CAT = (ch) => {
    if (!ch || ch === '?') return 'x';
    if (/[0-9]/.test(ch)) return 'd';
    if (/[a-zA-Z]/.test(ch)) return 'a';
    if (/[\u0370-\u03ff]/.test(ch)) return 'g';
    if (/[=+\-\u00d7\u00f7<>]/.test(ch)) return 'o';
    return 'p';
  };
  function contextBonus(ch, left, right) {
    const c = CAT(ch), L = left ? CAT(left) : '', R = right ? CAT(right) : '';
    let b = 0;
    if (c === 'd' && (L === 'd' || R === 'd')) b += 0.05;
    if (c === 'a' && (L === 'd' || R === 'd')) b -= 0.02;
    if (ch === 'O' && (L === 'd' || R === 'd')) b -= 0.08;
    if (ch === '0' && (L === 'a' && R === 'a')) b -= 0.06;
    if (ch === 'l' && (L === 'd' || R === 'd')) b -= 0.10;
    if (ch === '1' && (L === 'a' || R === 'a')) b -= 0.05;
    if (ch === 'I' && (L === 'a' || R === 'a')) b -= 0.06;
    if (c === 'o' && (L === 'd' || R === 'd' || L === 'a' || R === 'a')) b += 0.04;
    return b;
  }
  function rerank(tokens, keep) {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!t.cands || !t.cands.length) continue;
      const L = tokens[i - 1] && tokens[i - 1].ch, R = tokens[i + 1] && tokens[i + 1].ch;
      const top = t.ch;   // 重排前的首选：易混表拿它当「键」
      t.cands = t.cands
        .map((c) => ({ ch: c.ch, s: c.s, src: c.src, adj: c.s + contextBonus(c.ch, L, R) + confuseBonus(top, c.ch) }))
        .sort((a, b) => b.adj - a.adj);
      if (keep) t.cands = t.cands.slice(0, keep);
      t.ch = t.cands[0].ch;
      t.conf = t.cands[0].s;
    }
    return tokens;
  }

  // 分格写：一格一个符号，直接跳过 cluster 的粘连判断（写公式最常错的一步）
  function inferGrid(strokes, cols, width, opts) {
    const cw = width / cols;
    const cells = [];
    for (let i = 0; i < cols; i++) cells.push([]);
    for (const s of strokes) {
      const b = boxOf(s);
      const c = Math.max(0, Math.min(cols - 1, Math.floor((b.x + b.w / 2) / cw)));
      cells[c].push(s);
    }
    const tokens = [];
    for (const cell of cells) {
      if (!cell.length) continue;
      for (const g of cluster(cell).sort((a, b) => a.box.x - b.box.x)) {
        raster(g.strokes);
        const feat = featurize();
        const cands = candidatesFor(feat, 10);
        tokens.push({ strokes: g.strokes, box: g.box, feat, cands, ch: cands.length ? cands[0].ch : '?', conf: cands.length ? cands[0].s : 0, hMax: g.box.h });
      }
    }
    rerank(tokens, opts.cands || 6);
    return { tokens, lines: [{ t: tokens }], tex: tokens.length ? rowTex(tokens) : '' };
  }

  function infer(strokes, opts) {
    opts = opts || {};
    const list = (strokes || []).filter((s) => s && s.length >= 2);
    if (!list.length) return { tokens: [], tex: '', lines: [] };
    if (opts.grid > 0) return inferGrid(list, opts.grid, opts.gridW || 620, opts);
    const groups = cluster(list);
    const tokens = groups.map((g) => {
      raster(g.strokes);
      const feat = featurize();
      const box = g.box;
      const cands = candidatesFor(feat, opts.cands || 6);
      return { strokes: g.strokes, box, feat, cands, ch: cands.length ? cands[0].ch : '?', conf: cands.length ? cands[0].s : 0, hMax: box.h };
    });
    const lines = toLines(foldFractions(tokens));
    for (const L of lines) rerank(L.t.filter((t) => t.cands && t.cands.length), opts.cands || 6);
    for (const L of lines) {
      const hm = Math.max(...L.t.map((t) => t.box.h));
      for (const t of L.t) t.hMax = hm;
    }
    const tex = lines.length > 1
      ? '\\begin{aligned}' + lines.map((L) => rowTex(L.t)).join(' \\\\ ') + '\\end{aligned}'
      : rowTex(lines[0].t);
    return { tokens, lines, tex };
  }

  // ============================================================
  // 手写公式板
  // ============================================================
  let pad = null;

  function formulaPad(opts) {
    opts = opts || {};
    const PW = 620, PH = 300;
    const dprPad = Math.min(2, window.devicePixelRatio || 1);
    const cv = h('canvas', { class: 'if-cv' });
    cv.width = Math.round(PW * dprPad); cv.height = Math.round(PH * dprPad);
    cv.style.width = PW + 'px'; cv.style.height = PH + 'px';
    const ctx = cv.getContext('2d');

    let strokes = [];      // [[x,y,…], …] 画板逻辑坐标
    // 1.6.8（R7）：可以从画布选区的笔迹起手（GW.inkToFormula 传进来），不用从头写。
    if (opts.strokes && opts.strokes.length) strokes = opts.strokes.map((s) => s.slice());
    let cur = null;
    let result = { tokens: [], lines: [], tex: '' };
    let chips = [];
    let timer = 0;
    let grid = 0;          // 0=自由写；4/6/8=分格写，一格一个符号

    const draw = () => {
      ctx.setTransform(dprPad, 0, 0, dprPad, 0, 0);
      ctx.clearRect(0, 0, PW, PH);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, PH);
      ctx.strokeStyle = 'rgba(40,60,90,.10)'; ctx.lineWidth = 1;
      for (let x = 40; x < PW; x += 40) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, PH); ctx.stroke(); }
      for (let y = 40; y < PH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(PW, y + .5); ctx.stroke(); }
      if (grid > 0) {
        ctx.save();
        ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(228,87,46,.55)'; ctx.lineWidth = 1.4;
        for (let i = 1; i < grid; i++) {
          const x = (PW * i) / grid;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, PH); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(228,87,46,.35)';
      for (const ln of result.lines || []) {
        const b = ln.t.reduce((a, t) => ({ x0: Math.min(a.x0, t.box.x), x1: Math.max(a.x1, t.box.x + t.box.w), y0: Math.min(a.y0, t.box.y), y1: Math.max(a.y1, t.box.y + t.box.h) }), { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
        ctx.strokeRect(b.x0 - 3, b.y0 - 3, b.x1 - b.x0 + 6, b.y1 - b.y0 + 6);
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = '#1b2433'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const s of strokes) {
        ctx.beginPath();
        ctx.moveTo(s[0], s[1]);
        for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i], s[i + 1]);
        if (s.length === 2) ctx.lineTo(s[0] + 0.6, s[1] + 0.6);
        ctx.stroke();
      }
      // 每个符号块的编号，方便和右侧 chips 对上
      ctx.font = '600 11px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#e4572e'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      result.tokens.forEach((t, i) => ctx.fillText(String(i + 1), t.box.x + t.box.w / 2, t.box.y - 3));
    };

    const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    cv.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || e.button === 2) return;
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      cur = local(e);
      strokes.push(cur);
      draw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const [x, y] = local(e);
      const n = cur.length;
      if (Math.hypot(x - cur[n - 2], y - cur[n - 1]) < 1.2) return;
      cur.push(x, y);
      draw();
    });
    const finish = () => {
      if (!cur) return;
      if (cur.length < 4) strokes.pop();
      cur = null;
      draw();
      clearTimeout(timer);
      timer = setTimeout(recognize, 420);
    };
    cv.addEventListener('pointerup', finish);
    cv.addEventListener('pointercancel', finish);

    // ---- 右侧：识别结果 chips + 预览 ----
    const chipRow = h('div', { class: 'if-chips' });
    const prev = h('div', { class: 'if-prev' });
    const texIn = h('input', { class: 'if-tex', spellcheck: 'false', placeholder: 'LaTeX（可直接改）' });
    texIn.addEventListener('input', () => renderPrev());
    texIn.addEventListener('keydown', (e) => e.stopPropagation());

    const renderPrev = () => {
      try { window.katex.render(texIn.value || '\\text{公式预览}', prev, { displayMode: true, throwOnError: false }); }
      catch (e) { prev.textContent = e.message; }
    };
    texIn.value = '';

    function paintChips() {
      chipRow.textContent = '';
      if (!result.tokens.length) {
        chipRow.append(h('span', { class: 'if-hint' }, '在上面用笔写一个式子，松手会自动识别'));
        return;
      }
      result.tokens.forEach((t, i) => {
        const b = h('button', { class: 'if-chip' + (t.conf < 0.62 ? ' low' : ''), title: '第 ' + (i + 1) + ' 个符号：点开换一个（快捷键 ' + (i + 1) + '）' },
          h('small', null, String(i + 1)),
          h('span', null, t.ch === '?' ? '?' : t.ch));
        b.addEventListener('click', () => openCands(i, b));
        chipRow.append(b);
      });
      chipRow.append(h('button', { class: 'if-chip if-undo', title: '撤销最后一笔', onclick: () => { strokes.pop(); recognize(); } }, '⌫'));
    }

    function openCands(i, anchor) {
      const t = result.tokens[i];
      const pop = h('div', { class: 'if-pops' },
        h('div', { class: 'if-pop-h' }, '第 ' + (i + 1) + ' 块 · 候选'),
        h('div', { class: 'if-pop-row' }, t.cands.map((c) => h('button', { class: 'if-cand' + (c.ch === t.ch ? ' on' : ''), title: Math.round(c.s * 100) + '%', onclick: () => { setTok(i, c.ch); pop.remove(); } },
          h('b', null, c.ch), h('small', null, Math.round(c.s * 100))))),
        h('div', { class: 'if-pop-h' }, '或者从符号板里挑'),
        h('div', { class: 'if-pop-row if-pop-all' },
          [].concat(PALETTE[0][1], PALETTE[1][1], ['\\times', '\\div', '\\pi', '\\theta', '\\alpha', '\\beta', '\\Delta', '\\infty', '\\le', '\\ge', '\\cdot', '\\to'])
            .map((s) => h('button', { class: 'if-cand', title: s, onclick: () => { setTok(i, s); pop.remove(); } },
              s.replace(/\\[a-zA-Z]+/g, (m) => m.slice(1)).replace(/[{}]/g, '') || s))));
      anchor.parentNode.insertBefore(pop, anchor.nextSibling);
      const away = (ev) => { if (!pop.contains(ev.target) && ev.target !== anchor) { pop.remove(); document.removeEventListener('pointerdown', away, true); } };
      setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
    }

    function setTok(i, ch) {
      const t = result.tokens[i];
      // 用户纠正 = 一条新模板；以后遇到同一个人的写法会越来越准
      if (ch && /^[\u0000-\u024f\u0370-\u03ff]$/.test(ch)) learn(ch, t.strokes);
      // 易混字符学习：这次把它当成了 t.ch 但实际是 ch，记一笔，
      // 下次同一个「错的首选」出现时给 ch 加分（模板学不动的那部分靠这个补）
      if (ch && t.ch && ch !== t.ch) learnConfuse(t.ch, ch);
      t.ch = ch; t.conf = 1;
      rebuild();
    }

    function rebuild() {
      // 用当前 ch 重算 LaTeX（重新走一遍组装，但不再重新识别）
      const lines = result.lines || [];
      result.tex = !lines.length ? ''
        : lines.length > 1
          ? '\\begin{aligned}' + lines.map((L) => rowTex(L.t)).join(' \\\\ ') + '\\end{aligned}'
          : rowTex(lines[0].t);
      texIn.value = result.tex;
      renderPrev();
      paintChips();
      draw();
    }

    function recognize() {
      result = infer(strokes, { cands: 6, grid, gridW: PW });
      // chips 的顺序要和画板上的编号一致
      const flat = [];
      for (const L of result.lines) for (const t of L.t) flat.push(t);
      result.tokens = flat;
      rebuild();
    }

    // ---- 符号板 ----
    const pal = h('div', { class: 'if-pal' });
    const palBody = h('div', { class: 'if-pal-body' });
    const ins = (s) => {
      const a = texIn.selectionStart == null ? texIn.value.length : texIn.selectionStart;
      const b = texIn.selectionEnd == null ? a : texIn.selectionEnd;
      texIn.value = texIn.value.slice(0, a) + s + texIn.value.slice(b);
      texIn.focus();
      texIn.selectionStart = texIn.selectionEnd = a + s.length;
      renderPrev();
    };
    const renderPal = (gi) => {
      palBody.textContent = '';
      for (const s of PALETTE[gi][1]) {
        const label = s.replace(/\\[a-zA-Z]+/g, (m) => m.slice(1)).replace(/[{}]/g, '');
        const b = h('button', { title: s, onclick: () => ins(s) });
        try { window.katex.render(s.replace(/\{\}/g, '\\square'), b, { throwOnError: false }); } catch (e) { b.textContent = label; }
        palBody.append(b);
      }
    };
    const palTabs = GW.ui.segmented({ options: PALETTE.map((g) => g[0]), value: PALETTE[0][0], onChange: (v) => renderPal(PALETTE.findIndex((g) => g[0] === v)) });
    pal.append(palTabs.el, palBody);
    renderPal(0);

    // ---- 底部按钮 ----
    const insertTo = (mode) => {
      const tex = texIn.value.trim();
      if (!tex) { GW.toast('还没有可以插入的公式'); return; }
      if (mode === 'copy') { try { navigator.clipboard.writeText(tex); GW.toast('LaTeX 已复制'); } catch (e) { GW.toast('复制失败，请手动选中'); } return; }
      // 从公式编辑器打开时，只把 LaTeX 交回去，不自己建对象
      if (opts.onPick) { opts.onPick(tex); close(); return; }
      const tmp = h('div', { style: { position: 'absolute', visibility: 'hidden', fontSize: '48px' } });
      document.body.append(tmp);
      try { window.katex.render(tex, tmp, { displayMode: true, throwOnError: false }); } catch (e) { /* 渲染失败就用兜底尺寸 */ }
      const w = tmp.scrollWidth + 20, hh = tmp.scrollHeight + 10;
      tmp.remove();
      GW.objects.create('formula', { tex, color: GW.tool.pen.color }, { w: w / GW.camera.s, h: hh / GW.camera.s, exact: true });
      GW.toast('公式已插入画布');
      close();
    };

    const tplLab = h('span', { class: 'if-hint' }, '');
    const tplInfo = () => { tplLab.textContent = '个人模板 ' + loadUser().length + ' 条（改一次候选就学一条）'; };
    const gridBtn = h('button', { class: 'gw-btn', title: '一格一个符号：切分不会错，写式子最稳' }, '分格写：关');
    gridBtn.addEventListener('click', () => {
      grid = grid ? 0 : 6;
      gridBtn.textContent = '分格写：' + (grid || '关');
      draw();
      if (strokes.length) recognize();
    });
    const foot = h('div', { class: 'if-foot' },
      tplLab,
      gridBtn,
      h('button', { class: 'gw-btn', title: '清空跟这个人学到的模板和易混记录，回到只用系统字体模板', onclick: () => { resetLearning(); resetConfuse(); tplInfo(); GW.toast('已清空个人模板'); } }, '清空模板'),
      h('button', { class: 'gw-btn', onclick: () => { strokes = []; result = { tokens: [], lines: [], tex: '' }; texIn.value = ''; renderPrev(); paintChips(); draw(); } }, '重写'),
      h('button', { class: 'gw-btn', onclick: () => { strokes.pop(); recognize(); } }, '退一笔'),
      h('button', { class: 'gw-btn', onclick: () => insertTo('copy') }, '复制 LaTeX'),
      h('button', { class: 'gw-btn primary', onclick: () => insertTo('insert') }, opts.onPick ? '用这个公式' : '插入画布'));

    const body = h('div', { class: 'ifp' },
      h('div', { class: 'if-top' },
        h('div', { class: 'if-left' }, h('div', { class: 'if-lab' }, '手写区'), cv),
        h('div', { class: 'if-right' }, h('div', { class: 'if-lab' }, '识别结果（点一下就换）'), chipRow, h('div', { class: 'if-lab' }, '预览'), prev, texIn)),
      h('div', { class: 'if-lab' }, '符号板'),
      pal,
      foot);

    // 数字键 1..9 快速改第 n 块
    const key = (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const n = +e.key;
      if (n >= 1 && n <= 9 && result.tokens[n - 1]) { e.preventDefault(); openCands(n - 1, chipRow.children[n - 1]); }
    };
    document.addEventListener('keydown', key, true);

    draw(); paintChips(); renderPrev(); tplInfo();
    if (strokes.length) { try { recognize(); } catch (e) { /* 认不出就停在空白提示 */ } }
    pad = GW.dialog({
      title: '手写公式 · 逐符号写板（离线、可点改）', width: 980, body, noFooter: true,
      onClose() { document.removeEventListener('keydown', key, true); clearTimeout(timer); pad = null; },
    });
    setTimeout(() => cv.focus(), 30);
    return pad;
  }

  function close() { if (pad) pad.close(); }

  // 入口选择器：逐符号写板（离线）还是在线整页识别（要 Key）
  // 1.0.13 修：以前 d.close() 之后直接 setTimeout(fn, 60)，如果 fn 里抛异常（比如 GW.ocr
  // 没加载完、或写板 DOM 建失败），按钮看起来就是「点了没反应」——现在不但兜住异常弹提示，
  // 还把「上次选的是哪个」记下来，下次点「手写公式」直接开那个（少一次点击）。
  GW.formulaPadPick = function () {
    const PK = 'gewu.padLast';
    const open = (which) => {
      try { localStorage.setItem(PK, which); } catch (_) {}
      if (which === 'online') {
        if (!GW.ocr || typeof GW.ocr.openPad !== 'function') {
          GW.toast('在线识别模块没载入（formula-ocr.js），请重启应用再试');
          return;
        }
        try { GW.ocr.openPad(); } catch (e) { GW.toast('打不开在线写板：' + (e && e.message ? e.message : e)); }
      } else {
        try { GW.formulaPad(); } catch (e) { GW.toast('打不开逐符号写板：' + (e && e.message ? e.message : e)); }
      }
    };
    let last = '';
    try { last = localStorage.getItem(PK) || ''; } catch (_) {}
    // 已经选过就直接开，不再问一遍
    if (last && (last === 'online' || last === 'offline')) { open(last); return null; }
    const mk = (title, sub, fn) => h('button', {
      class: 'gw-btn', style: { display: 'block', width: '100%', textAlign: 'left', marginBottom: '8px', padding: '10px 14px' },
      onclick: () => { d.close(); setTimeout(fn, 60); },
    }, h('b', null, title), h('div', { class: 'if-hint', style: { marginTop: '2px' } }, sub));
    const d = GW.dialog({
      title: '手写公式', width: 540, noFooter: true,
      body: h('div', null,
        mk('逐符号写板（离线 · 免 Key）', '小块写板，写完自动切符号，每个符号点一下就能改；改对的那一笔会记成本机模板，越用越准。不联网，简单式子最合适。', () => open('offline')),
        mk('在线识别（要 Key · 更准）', '整块笔迹发到 DeepSeek / SimpleTex，直接回 LaTeX。手写潦草、公式复杂时更靠得住，需要先填 Key 且要联网。', () => open('online')),
        h('div', { class: 'if-hint', style: { marginTop: '2px' } }, '选过一次之后，下次点「手写公式」会直接进那个写板；想换回来，点写板标题栏右上角的「换一种」。')),
    });
    return d;
  };

  GW.formulaPad = formulaPad;
  GW.inkrecog = {
    infer, candidates: candidatesFor, learn, resetLearning, rerank,
    feature: (strokes) => (raster(strokes), featurize()),
    gridN: N,
    gridM: M,
    weights: W,   // 可写：调权重做消融实验（见 scripts/sweep-recog.js）
    // 调试：把某个形状对若干字符的分数拆项，用来判断权重该往哪调
    scoreParts: (strokes, chs) => {
      const f = (raster(strokes), featurize());
      return buildFontTemplates().filter((x) => (chs || []).indexOf(x.ch) >= 0)
        .map((x) => Object.assign({ ch: x.ch, src: x.src }, scoreParts(f, x.feat)));
    },
    // 调试：看某个字符各字体的模板特征，用来校准 similarity 的权重
    dumpTemplates: (chs) => {
      const t = buildFontTemplates();
      const out = {};
      for (const ch of chs || []) {
        out[ch] = t.filter((x) => x.ch === ch).map((x) => ({
          src: x.src, w: x.feat.w, h: x.feat.hgt, comps: x.feat.comps, holes: x.feat.holes,
          fill: +(x.feat.ink / Math.max(1, x.feat.w * x.feat.hgt)).toFixed(3),
        }));
      }
      return out;
    },
    get learnedCount() { return loadUser().length; },
    learnConfuse, confuseBonus, resetConfuse,
    get confuseCount() { const m = loadConfuse(); return Object.keys(m).reduce((n, k) => n + Object.keys(m[k]).length, 0); },
    CHARS, PALETTE,
  };
})();
