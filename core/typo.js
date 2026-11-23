/* 数理无限画布 · 排版小工具（1.6.0）
 *
 * 老师要的是「书上那种印法」：物理量/数学变量斜体，单位、数字、函数名、化学式正体。
 * 本模块把一段混合文字切成若干 run（斜体/正体），逐个 measureText 定位置后再画。
 * 画布、SVG、PDF 三个出口共用同一套判定，所以屏幕上怎么写、导出就是怎么写。
 *
 * 判定规则（按教材习惯，不追求完整 TeX 语义）：
 *   · 单个拉丁字母          → 斜体（x、F、N、m、v …，这里的 N 是「法向力」）
 *   · 数字后面的单位短语    → 正体（3 N、5 m/s、0.5 Ω、2 kg·m/s²），所以力 N 与牛顿 N 靠位置区分
 *   · 两个及以上拉丁字母串  → 正体（kg、mol、Zn、Cu、sin、AB 线段名）
 *   · 希腊字母              → 斜体（θ、ω、φ），作单位时（Ω、μF）随单位短语转正体
 *   · e⁻ / e⁺               → 正体（电子是粒子符号，不是变量）
 *   · 数字、运算符、标点、CJK、上下标字符 → 正体
 *
 * 对外：GW.typo.runs(text) / GW.typo.draw(ctx, text, x, y, size, opt) / GW.typo.width(text, size, weight)
 */
(function () {
  if (!window.GW) return;
  const G = window.GW;
  if (G.typo) return;

  const FUNC = { sin: 1, cos: 1, tan: 1, cot: 1, log: 1, ln: 1, lg: 1, max: 1, min: 1, exp: 1, lim: 1, arcsin: 1, arccos: 1, arctan: 1 };
  const GREEK = /^[\u0391-\u03c9\u03d1\u03d5\u03f5]$/;
  const UNITISH = /^[A-Za-z]+$|^[\u0391-\u03c9]$|^[\u00b0\u2103%]$/;
  const SUBSUP = /^[\u2070-\u209f\u00b2\u00b3\u00b9\u00b0\u207b\u207a]$/;

  // 切词：数字 / 连续拉丁 / 单个希腊 / 上下标 / 空白 / 其它单字符
  const TOKEN = /(\d+(?:[.,]\d+)?)|([A-Za-z]+)|([\u0391-\u03c9])|([\u2070-\u209f\u00b2\u00b3\u00b9\u00b0])|(\s+)|([^\sA-Za-z0-9])/g;

  function tokens(s) {
    const out = [];
    let m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(s))) out.push(m[0]);
    return out;
  }
  const isSpace = (t) => /^\s+$/.test(t);
  const isNum = (t) => /^\d/.test(t);

  // 一段文字 → [{ t: 片段, it: 是否斜体 }]
  function runs(text) {
    const s = String(text == null ? '' : text);
    const toks = tokens(s);
    const n = toks.length;

    // 先标出「数字后面的单位短语」：3 N / 5 m/s / 0.5 Ω / 2 kg·m/s² 里的字母都算单位
    const unit = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      if (!isNum(toks[i])) continue;
      let j = i + 1;
      while (j < n) {
        let k = j;
        while (k < n && isSpace(toks[k])) k++;
        if (k >= n) break;
        const tk = toks[k];
        if (UNITISH.test(tk)) { unit[k] = true; j = k + 1; }
        else if (tk === '/' || tk === '·' || tk === '*' || tk === '\u00d7' || tk === '\u22c5') { j = k + 1; }
        else break;
      }
    }

    const out = [];
    for (let i = 0; i < n; i++) {
      const t = toks[i];
      let italic = false;
      if (/^[A-Za-z]+$/.test(t)) {
        // e⁻ / e⁺：电子符号正体
        let nx = i + 1;
        while (nx < n && isSpace(toks[nx])) nx++;
        const electron = t === 'e' && nx < n && SUBSUP.test(toks[nx]);
        if (t.length === 1) italic = !unit[i] && !electron && !FUNC[t];
        // ma / mg / mv：两个小写字母是「积」，按变量逐个斜体；单位（kg、mol）已由数字后的单位短语排除，
        // 函数名（sin、log）与化学式（Zn、Cu，含大写）保持正体。
        else italic = !unit[i] && !FUNC[t] && /^[a-z]{2,3}$/.test(t);
      } else if (GREEK.test(t)) {
        italic = !unit[i];
      }
      const last = out[out.length - 1];
      if (last && last.it === italic) last.t += t;
      else out.push({ t: t, it: italic });
    }
    return out;
  }

  const FAMILY = '"Microsoft YaHei", "Segoe UI", sans-serif';
  let meas = null;
  function fontOf(size, weight, italic) {
    return (italic ? 'italic ' : '') + (weight || 600) + ' ' + Number(size).toFixed(1) + 'px ' + FAMILY;
  }
  function measureCtx() {
    if (!meas) {
      try { meas = document.createElement('canvas').getContext('2d'); } catch (e) { meas = null; }
    }
    return meas;
  }
  function widthOf(text, size, weight) {
    const mc = measureCtx();
    if (!mc) return String(text).length * Number(size) * 0.55;
    let w = 0;
    const rs = runs(text);
    for (let i = 0; i < rs.length; i++) {
      mc.font = fontOf(size, weight, rs[i].it);
      w += mc.measureText(rs[i].t).width;
    }
    return w;
  }
  function widthOfRuns(rs, size, weight) {
    const mc = measureCtx();
    if (!mc) { let n = 0; for (let i = 0; i < rs.length; i++) n += rs[i].t.length; return n * Number(size) * 0.55; }
    let w = 0;
    for (let i = 0; i < rs.length; i++) {
      mc.font = fontOf(size, weight, rs[i].it);
      w += mc.measureText(rs[i].t).width;
    }
    return w;
  }
  function width(text, size, weight) {
    return widthOf(text, size, weight);
  }

  // 画一段混合排版文字。x 的语义由 opt.align 决定（与 canvas 的 textAlign 一致）
  function draw(ctx, text, x, y, size, opt) {
    const o = opt || {};
    const fs = size || 14;
    // roman:true 整段正体（几何图里的点名 A/B/C/O、化学式等一律罗马体）
    const rs = o.roman ? [{ t: String(text == null ? '' : text), it: false }] : runs(text);
    const total = widthOfRuns(rs, fs, o.weight);
    let cx = x;
    if (o.align === 'center') cx = x - total / 2;
    else if (o.align === 'right' || o.align === 'end') cx = x - total;
    if (o.color) ctx.fillStyle = o.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = o.baseline || 'middle';
    const mc = measureCtx();
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      ctx.font = fontOf(fs, o.weight, r.it);
      ctx.fillText(r.t, cx, y);
      if (!mc) { cx += r.t.length * fs * 0.55; continue; }
      mc.font = ctx.font;
      cx += mc.measureText(r.t).width;
    }
    return total;
  }

  G.typo = { runs: runs, width: width, draw: draw, font: fontOf };
})();
