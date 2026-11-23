/* 数理无限画布 · 高中数学 · 函数图像
 * 多函数绘制、参数滑块、平移缩放、描点追踪 + 切线、导函数、间断点处理
 */
(function () {
  'use strict';
  const INK = '#1b2433', CYAN = '#0f9d8a', RED = '#e4572e', BLUE = '#3366ff', GOLD = '#f2a541';
  const COLORS = [BLUE, RED, CYAN, GOLD, '#8e44ad', INK];
  const NAMES = ['f', 'g', 'h', 'p', 'q', 'r'];
  const FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MATH = '"Times New Roman", "Cambria Math", serif';
  const MAXF = 6;
  // 可作参数的字母（x 为自变量，e 为自然常数）
  const PARAMS = 'abcdhkmnpqrstuvwABCDKMNPQRSTW'.split('').concat(['omega', 'phi']);
  const PNAME = (p) => (p === 'omega' ? 'ω' : p === 'phi' ? 'φ' : p);
  const FN = ['asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'ln', 'log', 'exp', 'floor', 'ceil', 'sign', 'cot', 'sec', 'csc', 'lg'];

  const PRESETS = [
    { label: '一次函数 y=kx+b', expr: 'kx+b', p: { k: 1, b: 1 } },
    { label: '二次函数 y=ax²+bx+c', expr: 'ax^2+bx+c', p: { a: 1, b: -2, c: -3 } },
    { label: '反比例函数 y=k/x', expr: 'k/x', p: { k: 2 } },
    { label: '指数函数 y=aˣ', expr: 'a^x', p: { a: 2 } },
    { label: '对数函数 y=logₐx', expr: 'log_a(x)', p: { a: 2 } },
    { label: '幂函数 y=xᵃ', expr: 'x^a', p: { a: 3 } },
    { label: '幂函数 y=x^(1/3)', expr: 'x^(1/3)', p: {} },
    { label: 'y=Asin(ωx+φ)', expr: 'Asin(ωx+φ)', p: { A: 2, omega: 1, phi: 0 } },
    { label: '正切函数 y=tan x', expr: 'tanx', p: {} },
    { label: '绝对值 y=|x−a|', expr: '|x-a|', p: { a: 1 } },
    { label: '对勾函数 y=x+1/x', expr: 'x+1/x', p: {} },
  ];

  // 负底数的分数指数：分母为奇数时按实数方根处理（如 x^(1/3)）
  function rpow(b, e) {
    if (b >= 0 || Number.isInteger(e)) return Math.pow(b, e);
    for (let q = 3; q <= 99; q += 2) {
      const p = Math.round(e * q);
      if (Math.abs(p / q - e) < 1e-9) { const r = Math.pow(-b, e); return p % 2 === 0 ? r : -r; }
    }
    return NaN;
  }

  function matchParen(s, i) {
    let d = 0;
    for (let k = i; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')') { d--; if (d === 0) return k; } }
    throw new Error('括号不匹配');
  }

  // 预处理：|x|、logₐx、sinx 简写、asin→a·sin、ω φ
  function prep(src) {
    let s = String(src).replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').replace(/[×·]/g, '*').replace(/÷/g, '/')
      .replace(/π/g, 'pi').replace(/−/g, '-').replace(/，/g, ',');
    s = s.replace(/^(y|[fghpqr]\(x\))=/, '');
    if (!s) throw new Error('请输入表达式');
    // 绝对值竖线
    let o = '', depth = 0;
    for (const c of s) {
      if (c === '|') {
        const prev = o[o.length - 1];
        const closing = depth > 0 && prev && !'+-*/^(,'.includes(prev);
        if (closing) { o += ')'; depth--; } else { o += 'abs('; depth++; }
      } else o += c;
    }
    if (depth) throw new Error('绝对值符号 | 不成对');
    s = o;
    s = s.replace(/arc(sin|cos|tan)/g, '§$1').replace(/a(sin|cos|tan)(?!h)/g, 'a*$1').replace(/§/g, 'a');
    // log_a(x) / log_2x → ln(x)/ln(a)
    let i;
    while ((i = s.indexOf('log_')) >= 0) {
      let j = i + 4, base, arg;
      if (s[j] === '(') { const k = matchParen(s, j); base = s.slice(j, k + 1); j = k + 1; }
      else if (/[0-9.]/.test(s[j])) { let k = j; while (k < s.length && /[0-9.]/.test(s[k])) k++; base = s.slice(j, k); j = k; }
      else if (s.startsWith('pi', j)) { base = 'pi'; j += 2; }
      else if (/[a-zA-Zωφ]/.test(s[j] || '')) { base = s[j]; j++; }
      else throw new Error('log_ 后应为底数');
      if (s[j] === '(') { const k = matchParen(s, j); arg = s.slice(j, k + 1); j = k + 1; }
      else { const m = /^[0-9.]*(pi|[a-zA-Zωφ])?/.exec(s.slice(j)); arg = m[0]; if (!arg) throw new Error('log 缺少真数'); j += arg.length; }
      s = s.slice(0, i) + '(ln(' + arg + ')/ln(' + base + '))' + s.slice(j);
    }
    // sinx、sin2x、lnx 等简写
    s = s.replace(/(sqrt|sin|cos|tan|ln|lg|log|exp)(?![(h])(\d*\.?\d*(?:pi|[a-zA-Zωφ])?)/g, (m, f, a) => (a ? f + '(' + a + ')' : m));
    s = s.replace(/ω/g, 'omega').replace(/φ/g, 'phi');
    return s;
  }

  function findParams(s) {
    const ps = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/[a-zA-Z_]/.test(c)) {
        const f = FN.find((n) => s.startsWith(n, i) && s[i + n.length] === '(');
        if (f) { i += f.length; continue; }
        if (s.startsWith('omega', i)) { if (!ps.includes('omega')) ps.push('omega'); i += 5; continue; }
        if (s.startsWith('phi', i)) { if (!ps.includes('phi')) ps.push('phi'); i += 3; continue; }
        if (s.startsWith('pi', i)) { i += 2; continue; }
        if (c === 'x' || c === 'e') { i++; continue; }
        if (PARAMS.includes(c)) { if (!ps.includes(c)) ps.push(c); i++; continue; }
        throw new Error('不支持的字母：' + c);
      }
      i++;
    }
    return ps;
  }

  // 编译：返回 {fn(x, pvals[]), params}
  function compile(src) {
    const s = prep(src);
    const params = findParams(s);
    const vars = ['x'].concat(params);
    const f0 = GW.compileExpr(s, vars);
    const t = f0.toString();
    const body = t.slice(t.indexOf('{') + 1, t.lastIndexOf('}')).replace(/Math\.pow\(/g, '__P(');
    // eslint-disable-next-line no-new-func
    const f = new Function('__P', ...vars, body);
    return { f, params };
  }

  function fmtNum(v, d = 3) {
    if (!isFinite(v)) return '—';
    if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0;
    let s = v.toFixed(d).replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s.replace('-', '−');
  }
  function tickLabel(v) { let s = String(parseFloat(v.toPrecision(10))); return s.replace('-', '−'); }
  function niceStep(pxPerUnit, target) {
    const raw = target / pxPerUnit, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function pretty(e) {
    const sup = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    return String(e).replace(/\s+/g, '').replace(/\*/g, '·')
      .replace(/log_(\d+)/g, (m, d) => 'log' + d.split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[c]).join('')).replace(/log_a/g, 'logₐ').replace(/\^(\d+)(?![.\d])/g, (m, d) => d.split('').map((c) => sup[c]).join(''))
      .replace(/\^x\b/g, 'ˣ').replace(/sqrt/g, '√').replace(/pi/g, 'π').replace(/-/g, '−').replace(/omega/g, 'ω').replace(/phi/g, 'φ');
  }

  GW.registerSim({
    id: 'math-function', name: '函数图像', category: 'math', group: '函数',
    desc: '多函数图像、参数滑块、描点追踪与切线、导函数',
    // 只给搜索用，卡片上不显示。初中教材里这些叫法一个都不在 name/desc/group 里，
    // 老师在「数学工具」抽屉里搜「一次函数」「二次函数」「反比例」时会全部落空。
    keywords: '一次函数 正比例函数 二次函数 抛物线 反比例函数 指数函数 对数函数 幂函数 初中',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18M12 3v18"/><path d="M4 19c4 0 5-14 8-14s4 8 8 8"/></svg>',
    width: 1000, height: 640,
    create(ctx) {
      const st = ctx.state;
      if (!Array.isArray(st.funcs)) st.funcs = [{ expr: 'ax^2+bx+c', color: BLUE, visible: true }];
      if (!st.params) st.params = { a: { v: 1, min: -10, max: 10 }, b: { v: -2, min: -10, max: 10 }, c: { v: -3, min: -10, max: 10 } };
      if (!st.view) st.view = { cx: 0, cy: 0, s: 50 };
      if (st.showDeriv == null) st.showDeriv = false;
      if (st.showGrid == null) st.showGrid = true;
      const view = st.view;

      const kit = GW.simKit.layout(ctx.root, { panelWidth: 290 });
      const c2 = kit.ctx2d, canvas = kit.canvas;
      let W = 0, H = 0, dirty = true;
      kit.onResize((w, h) => { W = w; H = h; dirty = true; });
      const toX = (x) => W / 2 + (x - view.cx) * view.s;
      const toY = (y) => H / 2 - (y - view.cy) * view.s;
      const fromX = (px) => view.cx + (px - W / 2) / view.s;
      const fromY = (py) => view.cy - (py - H / 2) / view.s;
      const clampY = (py) => Math.max(-1e4, Math.min(1e4, py));

      let saveT = 0;
      const save = (later) => { clearTimeout(saveT); if (later) saveT = setTimeout(() => ctx.save(), 400); else ctx.save(); };

      // ---------- 函数模型 ----------
      const F = []; // 运行时：{def, comp, err}
      function compileAll() {
        F.length = 0;
        st.funcs.forEach((d) => {
          let comp = null, err = '';
          try { comp = compile(d.expr); } catch (e) { err = e.message || String(e); }
          F.push({ def: d, comp, err });
        });
        // 保证用到的参数都有值
        usedParams().forEach((p) => { if (!st.params[p]) st.params[p] = { v: 1, min: -10, max: 10 }; });
      }
      function usedParams() {
        const set = [];
        F.forEach((o) => o.comp && o.comp.params.forEach((p) => { if (!set.includes(p)) set.push(p); }));
        return set.sort((a, b) => PARAMS.indexOf(a) - PARAMS.indexOf(b));
      }
      // 为某函数建立求值器
      function evaluator(o) {
        const ps = o.comp.params, f = o.comp.f;
        const args = [rpow, 0].concat(ps.map((p) => st.params[p].v));
        return (x) => { args[1] = x; const y = f.apply(null, args); return typeof y === 'number' ? y : NaN; };
      }
      function deriv(fx) {
        return (x) => {
          const h = 1e-3 * Math.max(1, Math.abs(x));
          const a = fx(x - 2 * h), b = fx(x - h), c = fx(x + h), d = fx(x + 2 * h);
          return (a - 8 * b + 8 * c - d) / (12 * h);
        };
      }

      // ---------- 曲线绘制（处理间断点与定义域端点） ----------
      function plot(fx, color, dash, width) {
        const step = 1 / view.s; // 每像素采样一次
        const x0 = fromX(-2), n = Math.ceil((W + 4) * 1);
        c2.save();
        c2.strokeStyle = color; c2.lineWidth = width || 2.6; c2.lineJoin = 'round'; c2.lineCap = 'round';
        if (dash) c2.setLineDash(dash);
        c2.beginPath();
        let px = 0, py = NaN, pOk = false, pen = false;
        const M = (x, y) => { c2.moveTo(toX(x), clampY(toY(y))); pen = true; };
        const L = (x, y) => { c2.lineTo(toX(x), clampY(toY(y))); };
        for (let i = 0; i <= n; i++) {
          const x = x0 + i * step, y = fx(x), ok = isFinite(y);
          if (ok) {
            if (i > 0 && !pOk) {
              // 定义域左端：二分找边界
              let a = px, b = x;
              for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (isFinite(fx(m))) b = m; else a = m; }
              M(b, fx(b)); L(x, y);
            } else if (i === 0) M(x, y);
            else if (Math.abs(y - py) * view.s > 18) {
              // 可能的跳跃/渐近线：二分检测
              let a = px, ya = py, b = x, yb = y, jump = false;
              for (let k = 0; k < 44; k++) {
                const m = (a + b) / 2, ym = fx(m);
                if (!isFinite(ym)) { jump = true; break; }
                if (Math.abs(ym - ya) > Math.abs(yb - ym)) { b = m; yb = ym; } else { a = m; ya = ym; }
                if (b - a < 1e-14 * Math.max(1, Math.abs(a))) break;
              }
              if (!jump) jump = Math.abs(yb - ya) * view.s > 1;
              if (jump) { L(a, ya); M(b, yb); L(x, y); } else L(x, y);
            } else L(x, y);
          } else if (pOk) {
            // 定义域右端
            let a = px, b = x;
            for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (isFinite(fx(m))) a = m; else b = m; }
            L(a, fx(a));
          }
          px = x; py = y; pOk = ok;
        }
        if (pen) c2.stroke();
        c2.restore();
      }

      function drawAxes() {
        const s = view.s, major = niceStep(s, 80), minor = major / (String(major / Math.pow(10, Math.floor(Math.log10(major)))) === '2' ? 4 : 5);
        const ox = toX(0), oy = toY(0);
        c2.lineWidth = 1;
        if (st.showGrid) {
          const lines = (stp, col) => {
            c2.strokeStyle = col; c2.beginPath();
            for (let v = Math.ceil(fromX(0) / stp) * stp; v <= fromX(W); v += stp) { const x = Math.round(toX(v)) + 0.5; c2.moveTo(x, 0); c2.lineTo(x, H); }
            for (let v = Math.ceil(fromY(H) / stp) * stp; v <= fromY(0); v += stp) { const y = Math.round(toY(v)) + 0.5; c2.moveTo(0, y); c2.lineTo(W, y); }
            c2.stroke();
          };
          lines(minor, 'rgba(27,36,51,0.05)');
          lines(major, 'rgba(27,36,51,0.13)');
        }
        // 坐标轴
        const ax = GW.clamp(ox, 0, W), ay = GW.clamp(oy, 0, H);
        if (oy >= 0 && oy <= H) GW.draw.arrow(c2, 0, oy, W - 3, oy, { color: INK, width: 2, head: 12 });
        if (ox >= 0 && ox <= W) GW.draw.arrow(c2, ox, H, ox, 3, { color: INK, width: 2, head: 12 });
        c2.fillStyle = INK; c2.strokeStyle = INK; c2.lineWidth = 2;
        c2.font = '15px ' + MATH;
        const lyX = GW.clamp(oy + 6, 4, H - 22), lxY = GW.clamp(ox - 7, 34, W - 6);
        c2.textAlign = 'center'; c2.textBaseline = 'top';
        for (let v = Math.ceil(fromX(0) / major) * major; v <= fromX(W); v += major) {
          if (Math.abs(v) < major / 2) continue;
          const x = toX(v);
          if (x > W - 30) continue;
          if (oy >= 0 && oy <= H) { c2.beginPath(); c2.moveTo(x, oy); c2.lineTo(x, oy - 5); c2.stroke(); }
          halo(tickLabel(v), x, lyX);
        }
        c2.textAlign = 'right'; c2.textBaseline = 'middle';
        for (let v = Math.ceil(fromY(H) / major) * major; v <= fromY(0); v += major) {
          if (Math.abs(v) < major / 2) continue;
          const y = toY(v);
          if (y < 30) continue;
          if (ox >= 0 && ox <= W) { c2.beginPath(); c2.moveTo(ox, y); c2.lineTo(ox + 5, y); c2.stroke(); }
          halo(tickLabel(v), lxY, y);
        }
        c2.font = 'italic 18px ' + MATH;
        if (oy >= 0 && oy <= H) { c2.textAlign = 'right'; c2.textBaseline = 'top'; halo('x', W - 8, oy + 8); }
        if (ox >= 0 && ox <= W) { c2.textAlign = 'left'; c2.textBaseline = 'top'; halo('y', ox + 10, 4); }
        if (ox >= 0 && ox <= W && oy >= 0 && oy <= H) { c2.font = 'italic 16px ' + MATH; c2.textAlign = 'right'; c2.textBaseline = 'top'; halo('O', ox - 5, oy + 5); }
        void ax; void ay;
      }
      function halo(t, x, y) {
        c2.save(); c2.lineWidth = 4; c2.strokeStyle = 'rgba(255,255,255,0.9)'; c2.lineJoin = 'round';
        c2.strokeText(t, x, y); c2.restore(); c2.fillText(t, x, y);
      }

      // ---------- 追踪 ----------
      let trace = null; // {fi, x}
      function traceInfo() {
        if (!trace) return null;
        const o = F[trace.fi];
        if (!o || !o.comp || !o.def.visible) return null;
        const fx = evaluator(o), y = fx(trace.x);
        const h = 1e-6 * Math.max(1, Math.abs(trace.x));
        const dl = (fx(trace.x) - fx(trace.x - h)) / h, dr = (fx(trace.x + h) - fx(trace.x)) / h;
        let k = deriv(fx)(trace.x);
        const nd = !isFinite(dl) || !isFinite(dr) || Math.abs(dl - dr) > 1e-3 * Math.max(1, Math.abs(dl), Math.abs(dr));
        if (nd) k = NaN;
        return { o, fx, x: trace.x, y, k };
      }

      function render() {
        c2.clearRect(0, 0, W, H);
        kit.background();
        drawAxes();
        F.forEach((o) => {
          if (!o.comp || !o.def.visible) return;
          const fx = evaluator(o);
          if (st.showDeriv) plot(deriv(fx), o.def.color, [10, 7], 2.2);
          plot(fx, o.def.color, null, 2.8);
        });
        const ti = traceInfo();
        if (ti && isFinite(ti.y)) {
          const X = toX(ti.x), Y = toY(ti.y), col = ti.o.def.color;
          // 切线
          if (isFinite(ti.k)) {
            const xa = fromX(0), xb = fromX(W);
            c2.save(); c2.strokeStyle = INK; c2.globalAlpha = 0.75; c2.lineWidth = 2;
            c2.beginPath(); c2.moveTo(0, clampY(toY(ti.y + ti.k * (xa - ti.x)))); c2.lineTo(W, clampY(toY(ti.y + ti.k * (xb - ti.x)))); c2.stroke();
            c2.restore();
          }
          // 投影虚线
          c2.save(); c2.setLineDash([5, 5]); c2.strokeStyle = col; c2.lineWidth = 1.6;
          c2.beginPath(); c2.moveTo(X, Y); c2.lineTo(X, toY(0)); c2.moveTo(X, Y); c2.lineTo(toX(0), Y); c2.stroke(); c2.restore();
          c2.beginPath(); c2.arc(X, Y, 8, 0, Math.PI * 2); c2.fillStyle = col; c2.fill(); c2.lineWidth = 3; c2.strokeStyle = '#fff'; c2.stroke();
          // 标签
          const lines = ['(' + fmtNum(ti.x) + ', ' + fmtNum(ti.y) + ')', isFinite(ti.k) ? '切线斜率 k = ' + fmtNum(ti.k) : '该点不可导'];
          c2.font = '16px ' + FONT;
          const tw = Math.max(...lines.map((t) => c2.measureText(t).width)) + 20;
          let bx = X + 16, by = Y - 62;
          if (bx + tw > W - 6) bx = X - 16 - tw;
          if (by < 6) by = Y + 16;
          c2.fillStyle = 'rgba(255,255,255,0.93)'; c2.strokeStyle = col; c2.lineWidth = 2;
          roundRect(bx, by, tw, 50, 8); c2.fill(); c2.stroke();
          c2.fillStyle = INK; c2.textAlign = 'left'; c2.textBaseline = 'middle';
          c2.fillText(lines[0], bx + 10, by + 15); c2.fillText(lines[1], bx + 10, by + 36);
        }
        drawLegend();
      }
      function roundRect(x, y, w, h, r) {
        c2.beginPath(); c2.moveTo(x + r, y); c2.arcTo(x + w, y, x + w, y + h, r); c2.arcTo(x + w, y + h, x, y + h, r);
        c2.arcTo(x, y + h, x, y, r); c2.arcTo(x, y, x + w, y, r); c2.closePath();
      }
      function drawLegend() {
        const items = [];
        F.forEach((o, i) => {
          if (!o.comp || !o.def.visible) return;
          items.push({ t: NAMES[i] + '(x) = ' + pretty(o.def.expr.replace(/^\s*(y|[fghpqr]\(x\))\s*=/, '')), c: o.def.color, d: false });
          if (st.showDeriv) items.push({ t: NAMES[i] + '′(x)', c: o.def.color, d: true });
        });
        if (!items.length) return;
        c2.font = 'italic 17px ' + MATH;
        const w = Math.min(W - 24, Math.max(...items.map((it) => c2.measureText(it.t).width)) + 58), h = items.length * 26 + 12;
        c2.fillStyle = 'rgba(255,255,255,0.9)'; c2.strokeStyle = '#e3e7ee'; c2.lineWidth = 1;
        roundRect(12, 12, w, h, 8); c2.fill(); c2.stroke();
        items.forEach((it, i) => {
          const y = 18 + i * 26 + 13;
          c2.strokeStyle = it.c; c2.lineWidth = 3; c2.setLineDash(it.d ? [7, 5] : []);
          c2.beginPath(); c2.moveTo(22, y); c2.lineTo(50, y); c2.stroke(); c2.setLineDash([]);
          c2.fillStyle = INK; c2.textAlign = 'left'; c2.textBaseline = 'middle'; c2.fillText(it.t, 58, y);
        });
      }

      // ---------- 指针交互：平移 / 双指缩放 / 追踪 ----------
      const ptrs = new Map();
      let mode = null, panS = null, pinch = null, moved = false;
      function hitCurve(p) {
        let best = null;
        F.forEach((o, i) => {
          if (!o.comp || !o.def.visible) return;
          const fx = evaluator(o);
          for (let dx = -16; dx <= 16; dx += 1) {
            const x = fromX(p.x + dx), y = fx(x);
            if (!isFinite(y)) continue;
            const d = Math.hypot(dx, toY(y) - p.y);
            if (d < 14 && (!best || d < best.d)) best = { d, fi: i, x };
          }
        });
        return best;
      }
      function startPan(p) { mode = 'pan'; panS = { x: p.x, y: p.y, cx: view.cx, cy: view.cy }; }
      canvas.addEventListener('pointerdown', (e) => {
        const p = kit.toLocal(e);
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        ptrs.set(e.pointerId, p);
        e.preventDefault(); e.stopPropagation();
        if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()];
          const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          pinch = { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), s: view.s, wx: fromX(m.x), wy: fromY(m.y) };
          mode = 'pinch'; return;
        }
        if (ptrs.size > 2) return;
        moved = false;
        const ti = traceInfo();
        if (ti && isFinite(ti.y) && Math.hypot(toX(ti.x) - p.x, toY(ti.y) - p.y) < 22) { mode = 'trace'; return; }
        const hit = hitCurve(p);
        if (hit) { trace = { fi: hit.fi, x: hit.x }; mode = 'trace'; dirty = true; updateTraceReadout(); return; }
        startPan(p);
      });
      canvas.addEventListener('pointermove', (e) => {
        const p = kit.toLocal(e);
        if (!ptrs.has(e.pointerId)) {
          canvas.style.cursor = hitCurve(p) ? 'pointer' : 'grab';
          return;
        }
        ptrs.set(e.pointerId, p);
        if (mode === 'pinch' && ptrs.size >= 2) {
          const [a, b] = [...ptrs.values()];
          const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
          view.s = GW.clamp(pinch.s * d / pinch.d, 2, 20000);
          view.cx = pinch.wx - (m.x - W / 2) / view.s;
          view.cy = pinch.wy + (m.y - H / 2) / view.s;
          dirty = true;
        } else if (mode === 'pan') {
          if (Math.hypot(p.x - panS.x, p.y - panS.y) > 4) moved = true;
          view.cx = panS.cx - (p.x - panS.x) / view.s;
          view.cy = panS.cy + (p.y - panS.y) / view.s;
          canvas.style.cursor = 'grabbing';
          dirty = true;
        } else if (mode === 'trace') {
          trace.x = fromX(p.x);
          dirty = true; updateTraceReadout();
        }
      });
      const up = (e) => {
        if (!ptrs.has(e.pointerId)) return;
        ptrs.delete(e.pointerId);
        if (mode === 'pan' && !moved && ptrs.size === 0 && trace) { trace = null; dirty = true; updateTraceReadout(); }
        if (mode === 'pinch' && ptrs.size === 1) { startPan([...ptrs.values()][0]); moved = true; }
        else if (ptrs.size === 0) { mode = null; canvas.style.cursor = ''; }
        save(true);
      };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault(); e.stopPropagation();
        const p = kit.toLocal(e), wx = fromX(p.x), wy = fromY(p.y);
        view.s = GW.clamp(view.s * Math.exp(-e.deltaY * 0.0015), 2, 20000);
        view.cx = wx - (p.x - W / 2) / view.s;
        view.cy = wy + (p.y - H / 2) / view.s;
        dirty = true; save(true);
      }, { passive: false });

      // ---------- 面板 ----------
      const panel = kit.panel;
      const listBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      const addBtn = GW.ui.button({ label: '＋ 添加函数', onClick: () => addFunc('') });
      const presetSel = GW.ui.select({
        label: '预设函数（添加到列表）',
        options: [{ value: '', label: '— 选择预设 —' }].concat(PRESETS.map((p, i) => ({ value: String(i), label: p.label }))),
        value: '',
        onChange: (v) => {
          if (v === '') return;
          const pr = PRESETS[+v];
          Object.keys(pr.p).forEach((k) => { st.params[k] = Object.assign({ min: -10, max: 10 }, st.params[k], { v: pr.p[k] }); });
          addFunc(pr.expr, true);
          presetSel.set('');
        },
      });
      const help = GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: '1.6' } },
        '示例：x^2-2x、sinx、2^x、lnx、log_2(x)、|x-1|、sqrt(x)、x^(1/3)。字母 a、b、k、ω、φ 等自动成为参数。');
      panel.append(GW.ui.group('函数', listBox, GW.h('div', { class: 'gw-row' }, addBtn.el), presetSel.el, help));

      const paramBox = GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
      const paramGroup = GW.ui.group('参数', paramBox);
      panel.append(paramGroup);

      const traceRead = GW.ui.readout('追踪点');
      const slopeRead = GW.ui.readout('切线斜率');
      const tDeriv = GW.ui.toggle({ label: '显示导函数（虚线）', value: st.showDeriv, onChange: (v) => { st.showDeriv = v; dirty = true; save(); } });
      const tGrid = GW.ui.toggle({ label: '显示网格', value: st.showGrid, onChange: (v) => { st.showGrid = v; dirty = true; save(); } });
      const resetBtn = GW.ui.button({ label: '⌖ 复位视图', onClick: () => { view.cx = 0; view.cy = 0; view.s = 50; dirty = true; save(); } });
      const tip = GW.h('div', { style: { fontSize: '12px', color: '#5b6576', lineHeight: '1.6' } }, '点击曲线可描点追踪并显示切线；拖动空白处平移，滚轮或双指缩放；点击空白处取消追踪。');
      panel.append(GW.ui.group('显示与追踪', tDeriv.el, tGrid.el, traceRead.el, slopeRead.el, resetBtn.el, tip));

      function updateTraceReadout() {
        const ti = traceInfo();
        if (!ti) { traceRead.set('—'); slopeRead.set('—'); return; }
        traceRead.set('<span style="color:' + ti.o.def.color + '">' + NAMES[trace.fi] + '</span>(' + fmtNum(ti.x) + ') = ' + fmtNum(ti.y));
        slopeRead.set(isFinite(ti.k) ? NAMES[trace.fi] + '′(' + fmtNum(ti.x) + ') = ' + fmtNum(ti.k) : '不可导');
      }

      function nextColor() {
        const used = st.funcs.map((f) => f.color);
        return COLORS.find((c) => !used.includes(c)) || COLORS[st.funcs.length % COLORS.length];
      }
      function addFunc(expr, fromPreset) {
        if (st.funcs.length >= MAXF) {
          if (!fromPreset) { GW.toast('最多 6 条函数'); return; }
          st.funcs[st.funcs.length - 1].expr = expr;
        } else st.funcs.push({ expr, color: nextColor(), visible: true });
        compileAll(); buildList(); buildParams(); dirty = true; save();
        if (!expr) { const ins = listBox.querySelectorAll('input'); ins[ins.length - 1] && ins[ins.length - 1].focus(); }
      }
      function buildList() {
        listBox.innerHTML = '';
        st.funcs.forEach((d, i) => {
          const o = F[i];
          const sw = GW.h('button', {
            title: '显示 / 隐藏',
            style: { width: '26px', height: '26px', borderRadius: '50%', border: '3px solid ' + d.color, background: d.visible ? d.color : '#fff', flex: 'none', cursor: 'pointer', padding: '0' },
            onclick: () => { d.visible = !d.visible; buildList(); dirty = true; updateTraceReadout(); save(); },
          });
          const name = GW.h('span', { style: { font: 'italic 16px ' + MATH, flex: 'none', color: INK } }, NAMES[i] + '(x)=');
          const inp = GW.h('input', { type: 'text', value: d.expr, placeholder: '如 x^2-1', spellcheck: 'false',
            style: { flex: '1', minWidth: '0', font: '16px ' + MATH, padding: '6px 7px', border: '1px solid ' + (o && o.err && d.expr ? RED : '#e3e7ee'), borderRadius: '8px', height: '34px', boxSizing: 'border-box' } });
          const err = GW.h('div', { style: { color: RED, fontSize: '12px', display: o && o.err && d.expr ? 'block' : 'none', paddingLeft: '34px' } }, o && o.err ? o.err : '');
          inp.addEventListener('keydown', (e) => e.stopPropagation());
          inp.addEventListener('pointerdown', (e) => e.stopPropagation());
          inp.addEventListener('input', () => {
            d.expr = inp.value;
            const before = usedParams().join();
            compileAll();
            const oo = F[i];
            err.textContent = oo.err; err.style.display = oo.err && d.expr ? 'block' : 'none';
            inp.style.borderColor = oo.err && d.expr ? RED : '#e3e7ee';
            if (usedParams().join() !== before) buildParams();
            dirty = true; updateTraceReadout(); save(true);
          });
          const del = GW.h('button', {
            title: '删除', class: 'gw-btn danger',
            style: { flex: 'none', minHeight: '34px', width: '34px', padding: '0', fontSize: '18px', lineHeight: '1' },
            onclick: () => {
              st.funcs.splice(i, 1);
              if (trace) { if (trace.fi === i) trace = null; else if (trace.fi > i) trace.fi--; }
              compileAll(); buildList(); buildParams(); updateTraceReadout(); dirty = true; save();
            },
          }, '×');
          listBox.append(GW.h('div', null, GW.h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, sw, name, inp, del), err));
        });
        addBtn.el.disabled = st.funcs.length >= MAXF;
        addBtn.el.style.opacity = st.funcs.length >= MAXF ? '0.5' : '1';
      }
      const sliders = {};
      function buildParams() {
        paramBox.innerHTML = '';
        for (const k in sliders) delete sliders[k];
        const ps = usedParams();
        paramGroup.style.display = ps.length ? '' : 'none';
        ps.forEach((p) => {
          const P = st.params[p];
          const sl = GW.ui.slider({ label: PNAME(p), min: P.min, max: P.max, step: 0.1, value: P.v, onInput: (v) => { P.v = v; dirty = true; updateTraceReadout(); save(true); } });
          sl.el.querySelector('span').style.cssText = 'font: italic 17px ' + MATH;
          const range = sl.el.querySelector('input');
          const numIn = (val, key) => {
            const n = GW.h('input', { type: 'number', value: val, step: '1', style: { width: '58px', font: '13px ' + FONT, padding: '3px 4px', border: '1px solid #e3e7ee', borderRadius: '6px', height: '28px', boxSizing: 'border-box' } });
            n.addEventListener('keydown', (e) => e.stopPropagation());
            n.addEventListener('change', () => {
              const v = parseFloat(n.value);
              if (!isFinite(v)) { n.value = P[key]; return; }
              P[key] = v;
              if (P.min >= P.max) { if (key === 'min') P.max = P.min + 1; else P.min = P.max - 1; }
              range.min = P.min; range.max = P.max;
              P.v = GW.clamp(P.v, P.min, P.max); sl.set(P.v);
              dirty = true; save();
            });
            return n;
          };
          const play = GW.h('button', { class: 'gw-btn', title: '自动变化', style: { minHeight: '28px', padding: '2px 10px', flex: 'none' } }, P.anim ? '⏸' : '▶');
          play.onclick = () => { P.anim = !P.anim; play.textContent = P.anim ? '⏸' : '▶'; P.dir = P.dir || 1; save(); };
          const row = GW.h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', color: '#5b6576' } }, '范围', numIn(P.min, 'min'), '~', numIn(P.max, 'max'), GW.h('span', { style: { flex: '1' } }), play);
          sliders[p] = sl;
          paramBox.append(GW.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, sl.el, row));
        });
      }

      compileAll(); buildList(); buildParams(); updateTraceReadout();

      kit.loop((dt) => {
        let anim = false;
        usedParams().forEach((p) => {
          const P = st.params[p];
          if (!P.anim || !dt) return;
          anim = true;
          P.dir = P.dir || 1;
          P.v += P.dir * (P.max - P.min) / 8 * dt;
          if (P.v > P.max) { P.v = P.max; P.dir = -1; }
          if (P.v < P.min) { P.v = P.min; P.dir = 1; }
          P.v = Math.round(P.v * 1000) / 1000;
          sliders[p] && sliders[p].set(P.v);
        });
        if (anim) { dirty = true; updateTraceReadout(); }
        if (!dirty || !W) return;
        dirty = false;
        render();
      });

      return { destroy() { clearTimeout(saveT); kit.destroy(); } };
    },
  });
})();
