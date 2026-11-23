/* 物理仿真页 · 公共外壳
 *
 * 目标：把 src/sims/phy-*.js 里已有的仿真原样跑进一个独立 HTML 页。
 * 仿真本身一行不改 —— 它们只依赖 GW.registerSim / GW.simKit / GW.ui（都在 core/kit.js），
 * 所以这里做两件事：
 *   1) 把画布上的「浅色主题」颜色映射成深色主题（同一个颜色常量两边都要能看）；
 *   2) 把画布上的字体统一成楷体 + LaTeX 字形（KaTeX_Math / KaTeX_Main）。
 * 然后再调 def.create({ root, state, save })，与画布内 GW.defineKind('sim') 的调用完全一致。
 */
(function () {
  'use strict';

  /* ---------- 深色主题：浅色 → 深色 的颜色映射表 ---------- */
  // 只映射「中性色」（纸白 / 墨黑 / 各种灰），彩色一律不动 —— 用户要求「该用不同颜色的要用不同颜色区分」。
  const MAP = {
    '#ffffff': '#000000',
    '#fff': '#000000',
    '#fbfcfd': '#050505',
    '#fafbfd': '#050505',
    '#f7f8fa': '#060606',
    '#f5f7fa': '#080808',
    '#eef1f5': '#1e2c42',
    '#e9edf2': '#16233c',
    '#e3e7ee': '#2a3a52',
    '#d9dee6': '#33445f',
    '#cfd6e0': '#33445f',
    '#c9d0db': '#33445f',
    '#c4cbd6': '#54657d',
    '#9aa3b2': '#93a6c0',
    '#8a94a6': '#8fa3bd',
    '#5b6576': '#a7b8ce',
    '#3a4456': '#b9c7da',
    '#1b2433': '#e6edf7',
    '#000000': '#eaf2ff',
    '#000': '#eaf2ff',
  };

  // 颜色反转：只动「接近纸白 / 接近墨黑」的中性色，彩色原样保留（用色区分是硬要求）
  function flip(r, g, b, a) {
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    const neutral = (mx - mn) <= 40;        // 只处理中性色，彩色（红/蓝/青/金/紫）一律不动
    if (!neutral) return null;
    if (mn >= 170) {                        // 纸白 → 深色面板（保留一点点原来的色调）
      r = Math.round(26 + (255 - r) * 0.30);
      g = Math.round(36 + (255 - g) * 0.30);
      b = Math.round(58 + (255 - b) * 0.30);
    } else if (mx <= 96) {                  // 墨黑 / 深灰 → 浅色（保留色调）
      r = Math.round(255 - (96 - r) * 0.34);
      g = Math.round(255 - (96 - g) * 0.34);
      b = Math.round(255 - (96 - b) * 0.34);
    } else return null;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (a == null ? 1 : a) + ')';
  }

  function mapColor(s) {
    if (typeof s !== 'string') return s;
    const k = s.trim().toLowerCase();
    if (MAP[k]) return MAP[k];
    let m = /^#([0-9a-f]{3})$/.exec(k);
    if (m) {
      const h = m[1];
      const out = flip(parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16));
      if (out) return out;
      return s;
    }
    m = /^#([0-9a-f]{6})$/.exec(k);
    if (m) {
      const h = m[1];
      const out = flip(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
      if (out) return out;
      return s;
    }
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(k);
    if (m) {
      const out = flip(Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), m[4] == null ? 1 : +m[4]);
      if (out) return out;
    }
    return s;
  }

  /* ---------- 字体：楷体 + LaTeX ---------- */
  const KAI = '"KaiTi","STKaiti","KaiTi_GB2312","楷体",serif';
  const TEX = '"KaTeX_Math","KaTeX_Main","Times New Roman",serif';
  const TEX_BOLD = '"KaTeX_Main","KaTeX_Math","Times New Roman",serif';

  // 保留 shorthand 里 px 之前的样式/字重，族名整段替换
  function mapFont(s) {
    if (typeof s !== 'string' || !s) return s;
    const i = s.indexOf('px');
    if (i < 0) return s;
    const num = parseFloat(s.slice(0, i));
    const head = (isFinite(num) ? Math.round(num * 1.2) : s.slice(0, i)) + 'px';
    const rest = s.slice(i + 2).toLowerCase();
    const isSerif = /serif/.test(rest) && !/sans-serif/.test(rest);
    if (!isSerif) return head + ' ' + KAI;            // 中文标签、读数
    const bold = /bold|[6-9]00/.test(head.toLowerCase());
    return head + ' ' + (bold ? TEX_BOLD : TEX);       // 数学变量（斜体）/ 矢量（加粗）
  }

  // 左侧画布不再出现「实时物理量」的数值读数（参数都在右侧面板）
  const READOUT = /(?:=|≈)\s*-?[\d.]|\d+(?:\.\d+)?\s*(?:s|m|N|V|A|J|W|kg|g|cm|mm|Hz|rad|°|%)\b|×\s*[\d.]+/;
  let patched = false;
  function patchCanvas() {
    if (patched) return;
    patched = true;
    const proto = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    if (!proto) return;
    ['fillStyle', 'strokeStyle', 'shadowColor'].forEach((prop) => {
      const d = Object.getOwnPropertyDescriptor(proto, prop);
      if (!d || !d.set) return;
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: d.enumerable,
        get: d.get,
        set(v) { d.set.call(this, this.canvas?.dataset.gwSimTone === 'light' ? v : mapColor(v)); },
      });
    });
    const fd = Object.getOwnPropertyDescriptor(proto, 'font');
    if (fd && fd.set) {
      Object.defineProperty(proto, 'font', {
        configurable: true,
        enumerable: fd.enumerable,
        get: fd.get,
        set(v) { fd.set.call(this, mapFont(v)); },
      });
    }
    // 数值读数（t = …、f = …、0.75 A …）不上画布，参数统一显示在右侧读数栏
    const ft = proto.fillText, st = proto.strokeText;
    const drop = function (t, x, align) {
      if (typeof t !== 'string' || !READOUT.test(t)) return false;
      // 只清「含中文的实时说明行」与「t = … 计时行」；仪表气泡里的读数保留
      // 纯数值 + 单位的小段也删（仿真的状态行是分段绘制的：中文段 / 数值段分开 fillText）
      const NUMSEG = /^[\s=≈×+\-/]*[\d.]+\s*(?:s|m|N|V|A|J|W|kg|g|cm|mm|px|Hz|rad|°|%|N\/C|m\/s)\b/;
      return (/[\u4e00-\u9fa5]/.test(t) && READOUT.test(t)) || /^\s*t\s*=/.test(t) || (NUMSEG.test(t) && align !== 'center');
    };
    // 白字画在彩色气泡上时，映射会把纯白变成纯黑底 —— 这里把它当「浅色墨」画
    const unwhite = function (ctx) { if (ctx.fillStyle === '#000000') ctx.fillStyle = '#dfeaff'; };
    const isMathText = (t) => /^[A-Za-zΑ-ω][₀-₉]?(?:\s*[=≈∝]|\s*\/|$)/.test(t);
    proto.fillText = function (t, x, y, mw) {
      if (drop(t, x, this.textAlign)) return;
      unwhite(this);
      if (typeof t === 'string' && isMathText(t) && !/italic/i.test(this.font)) {
        const old = this.font;
        this.font = 'italic ' + old;
        const r = ft.call(this, t, x, y, mw);
        this.font = old;
        return r;
      }
      return ft.call(this, t, x, y, mw);
    };
    proto.strokeText = function (t, x, y, mw) { if (drop(t, x, this.textAlign)) return; return st.call(this, t, x, y, mw); };
  }

  /* ---------- 面板文字：变量走 KaTeX 斜体，中文保持楷体 ---------- */
  // 只处理「独立的单个拉丁/希腊字母（可带下标）」，前后不能挨着别的字母数字，
  // 所以 sin / max / kg / m³ 这类词与单位不会被拆成公式；单位斜杠两侧也跳过。
  const TEX_RE = /(?<![A-Za-z0-9_.\\/])([A-Za-z\u03b1-\u03c9\u0391-\u03a9])([\u2080-\u2089\u208a\u208b])?(?![A-Za-z0-9_])/g;
  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function typesetPanel(root) {
    if (!window.katex) return;
    const panel = root.querySelector('.gw-sim-panel');
    if (!panel) return;
    const nodes = [];
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.nodeValue || !/[A-Za-z\u03b1-\u03c9\u0391-\u03a9]/.test(n.nodeValue)) continue;
      const pe = n.parentElement;
      if (pe && (pe.closest('.katex') || pe.closest('script') || pe.closest('style') || pe.closest('.gw-sl-val'))) continue;
      nodes.push(n);
    }
    for (const n of nodes) {
      const t = n.nodeValue;
      let out = '';
      let last = 0;
      let hit = false;
      TEX_RE.lastIndex = 0;
      let m;
      while ((m = TEX_RE.exec(t))) {
        const prev = t[m.index - 1] || '';
        const next = t[m.index + m[0].length] || '';
        if (prev === '/' || next === '/' || next === '\u00b7') continue;
        const src = m[1] + (m[2] ? '_{' + m[2] + '}' : '');
        try {
          const html = window.katex.renderToString(src, { throwOnError: false });
          out += escHtml(t.slice(last, m.index)) + html;
          last = m.index + m[0].length;
          hit = true;
        } catch (e) { /* 单个字符排不出来就原样留着 */ }
      }
      if (!hit) continue;
      out += escHtml(t.slice(last));
      const span = document.createElement('span');
      span.innerHTML = out;
      n.parentNode.replaceChild(span, n);
    }
  }

  /* ---------- 启动 ---------- */
  // 页内异常直接写到标题栏，别让它静默死在 rAF 里（排查与用户报障都靠它）
  window.addEventListener('error', (e) => {
    const bar = document.getElementById('bar');
    if (bar) bar.innerHTML = '<b style="color:#ff8b6b">运行出错：' + (e.message || e.error) + '</b>';
  });

  const SimShell = {
    boot(id) {
      const def = window.GW && GW.sims && GW.sims[id];
      const host = document.getElementById('host');
      if (!def || !host) {
        if (host) host.textContent = '找不到仿真：' + id;
        return null;
      }
      patchCanvas();
      document.title = def.name + ' · 物理仿真';
      const root = GW.h('div', { class: 'sim-root', style: { flex: '1 1 auto', display: 'flex', minWidth: '0' } });
      host.append(root);
      const inst = def.create({ root, state: {}, save() {} }) || {};
      // 面板里的变量（v₀ / F / θ …）换成 KaTeX 斜体；sims 有可能延后追加控件，补排一次
      try { typesetPanel(root); } catch (e) {}
      setTimeout(() => { try { typesetPanel(root); } catch (e) {} }, 600);
      window.__simshell = { id, def, inst, root };
      return inst;
    },
  };

  window.SimShell = SimShell;
})();
