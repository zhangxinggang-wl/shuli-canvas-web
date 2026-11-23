/* 物理交互演示 · 公共运行时
 * 用法（每个演示页只写一小段配置）：
 *   Sim.boot({ key:'anim_projectile2', title:'类抛体运动', params:['animV0',...], period:'animPeriod' })
 * 物理与绘制直接复用 ../core/physshapes.js 里上游 lib.js 的 draw —— 一行没重写，
 * 因此和画布里的图形功能完全一致；这里只补上「逐帧时间」「参数滑块」「播放/暂停/重置」。
 *
 * 2026-10 交互升级：
 *   · 纯白轮廓：深色主题把画布默认墨色（#1b2433）映射为纯白，所有未显式设色的描边都变白；
 *   · 播放速度：0.25× / 0.5× / 1× / 2×，默认取 cfg.speed（默认 1）；
 *   · 画布可拖动平移、滚轮缩放、双击复位（所有仿真页通用）；
 *   · 暂停时不再逐帧重绘，拖动参数/缩放时按需重绘。
 */
(function () {
  'use strict';
  const STUB = (window.GW = window.GW || {});
  STUB.live = STUB.live || {};
  STUB.physShapes = STUB.physShapes || {};

  // 页面级指针钩子：Sim.on('pointerdown', (p, o) => true 表示接住这次拖动)
  const handlers = { pointerdown: [], pointermove: [], pointerup: [] };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fmt = (v, step) => {
    const s = step >= 1 ? 0 : Math.min(3, Math.max(1, Math.ceil(-Math.log10(step))));
    return Number(v).toFixed(s);
  };
  // 轻量 LaTeX 标签：单字母变量斜体、Unicode 下标转 <sub>、单位正体。
  const MSUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '−' };
  const mathLabel = (s) => {
    if (s == null) return '';
    let t = String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    t = t.replace(/[₀-₉₊₋]/g, (c) => '\u0001' + MSUB[c]);
    t = t.replace(/(^|[^A-Za-zΑ-ω])([A-Za-zΑ-ω])(?![A-Za-zΑ-ω])/g, '$1<em class="mv">$2</em>');
    return t.replace(/\u0001([0-9+−])/g, '<sub>$1</sub>');
  };

  /* ---------- 深色主题：只反转中性色，彩色一律保留 ---------- */
  const MAP = {
    '#ffffff': '#0d1526', '#fff': '#0d1526', '#fbfdff': '#0d1526',
    '#fbfcfd': '#111c2e', '#fafbfd': '#111c2e', '#f7f8fa': '#0d1728',
    '#f5f7fa': '#101a2b', '#eef1f5': '#1e2c42', '#e9edf2': '#16233c',
    '#e3e7ee': '#2a3a52', '#d9dee6': '#33445f', '#cfd6e0': '#33445f',
    '#c9d0db': '#33445f', '#c4cbd6': '#54657d',
    '#9aa3b2': '#93a6c0', '#8a94a6': '#8fa3bd', '#5b6576': '#a7b8ce',
    '#3a4456': '#c9d6e8', '#1b2433': '#ffffff',
    '#000000': '#ffffff', '#000': '#ffffff',
  };
  function flip(r, g, b, a, forFill) {
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    if ((mx - mn) > 40) return null;
    if (mn >= 170) {
      if (forFill) { r = Math.round(44 + (255 - r) * 0.46); g = Math.round(58 + (255 - g) * 0.46); b = Math.round(88 + (255 - b) * 0.46); }
      else { r = Math.round(26 + (255 - r) * 0.30); g = Math.round(36 + (255 - g) * 0.30); b = Math.round(58 + (255 - b) * 0.30); }
    } else if (mx <= 96) {
      // 近黑墨色 → 接近纯白（保留一点层次，避免所有灰阶糊成一片）
      r = Math.round(255 - (96 - r) * 0.10); g = Math.round(255 - (96 - g) * 0.10); b = Math.round(255 - (96 - b) * 0.10);
    } else return null;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (a == null ? 1 : a) + ')';
  }
  function mapColor(s, forFill) {
    if (typeof s !== 'string') return s;
    const k = s.trim().toLowerCase();
    if (MAP[k]) return MAP[k];
    let m = /^#([0-9a-f]{6})$/.exec(k);
    if (m) {
      const out = flip(parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), null, forFill);
      return out || s;
    }
    m = /^#([0-9a-f]{3})$/.exec(k);
    if (m) {
      const out = flip(parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16), null, forFill);
      return out || s;
    }
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(k);
    if (m) {
      const out = flip(Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), m[4] == null ? 1 : +m[4], forFill);
      if (out) return out;
    }
    return s;
  }

  /* ---------- 字体：中文楷体、数学变量 KaTeX，整体放大一档（随画布自适应） ---------- */
  const KAI = '"KaiTi","STKaiti","KaiTi_GB2312","楷体",serif';
  const TEX = '"KaTeX_Math","KaTeX_Main","Times New Roman",serif';
  const TEX_BOLD = '"KaTeX_Main","KaTeX_Math","Times New Roman",serif';
  const FSCALE = 1.4;
  let FS = 1;          // 由画布尺寸决定的附加倍率，见 refreshFontScale()
  function refreshFontScale(W, H) {
    FS = clamp(Math.min(W, H) / 820, 0.9, 1.6);
  }
  function mapFont(s) {
    if (typeof s !== 'string' || !s) return s;
    // 取「数字 + px」这一处（前面可能还有 600 / bold / italic 等权重前缀），
    // 不能把权重 600 当成字号——那样会得到 600px 的巨型文字。
    const m = /(\d+(?:\.\d+)?)px/.exec(s);
    if (!m) return s;
    const num = parseFloat(m[1]);
    const prefix = s.slice(0, m.index);
    const head = (isFinite(num) ? Math.round(num * FSCALE * FS) : num) + 'px';
    const rest = s.slice(m.index + 2).toLowerCase();
    const isSerif = /serif/.test(rest) && !/sans-serif/.test(rest);
    if (!isSerif) return prefix + head + ' ' + KAI;
    const bold = /bold|[6-9]00/.test(s.toLowerCase());
    return prefix + head + ' ' + (bold ? TEX_BOLD : TEX);
  }

  // 画布上不再出现「实时物理量」的数值读数（用户要求：参数只在右侧面板）。
  // 特殊标记 \u200b 开头的文本是教学标注（如速度三角的边长），必须显示。
  const READOUT = /(?:=|≈)\s*-?[\d.]|\d+(?:\.\d+)?\s*(?:s|m|N|V|A|J|W|kg|g|cm|mm|Hz|rad|°|%|N\/C|m\/s)\b|×\s*[\d.]+/;
  let patched = false;
  let THEME_OFF = false;   // 画背景色时临时关掉映射，否则深底会被反成浅色
  let LIGHT_STAGE = false;
  function patchCanvas() {
    if (patched || !window.CanvasRenderingContext2D) return;
    patched = true;
    const P = CanvasRenderingContext2D.prototype;
    const wrapColor = (prop) => {
      const d = Object.getOwnPropertyDescriptor(P, prop);
      if (!d || !d.set) return;
      Object.defineProperty(P, prop, {
        configurable: true,
        get() { return d.get.call(this); },
        set(v) { d.set.call(this, THEME_OFF || LIGHT_STAGE ? v : mapColor(v, prop === 'fillStyle')); },
      });
    };
    wrapColor('fillStyle');
    wrapColor('strokeStyle');
    wrapColor('shadowColor');
    const fd = Object.getOwnPropertyDescriptor(P, 'font');
    if (fd && fd.set) {
      Object.defineProperty(P, 'font', {
        configurable: true,
        get() { return fd.get.call(this); },
        set(v) { fd.set.call(this, mapFont(v)); },
      });
    }
    // 线段加粗：投影到大屏上，1px 的辅助线基本看不见。这里统一乘一个倍率，
    // 图形各自的 o.width（2.4）不用改，所有仿真一起变粗；读取时再除回去，
    // 保证 `ctx.lineWidth *= 2` 这类写法不会被重复放大。
    const LW = 1.3;
    const lwd = Object.getOwnPropertyDescriptor(P, 'lineWidth');
    if (lwd && lwd.set) {
      Object.defineProperty(P, 'lineWidth', {
        configurable: true,
        get() { return lwd.get.call(this) / LW; },
        set(v) { lwd.set.call(this, Math.max(0.6, (+v || 0) * LW)); },
      });
    }
    const ft = P.fillText, st = P.strokeText;
    const allow = (t) => typeof t === 'string' && t.charCodeAt(0) === 0x200b;
    const strip = (t) => (allow(t) ? t.slice(1) : t);
    // 画布上的单变量/公式行用数学斜体（中文标题、数字刻度不动）。
    const isMathText = (t) => /^[A-Za-zΑ-ω][₀-₉]?(?:\s*[=≈∝]|\s*\/|$)/.test(t);
    P.fillText = function (t, x, y, mw) {
      const s = strip(t);
      if (typeof s === 'string' && isMathText(s) && !/italic/i.test(this.font)) {
        const old = this.font;
        this.font = 'italic ' + old;
        const r = ft.call(this, s, x, y, mw);
        this.font = old;
        return r;
      }
      return ft.call(this, s, x, y, mw);
    };
    P.strokeText = function (t, x, y, mw) {
      return st.call(this, strip(t), x, y, mw);
    };
  }

  function boot(cfg) {
    patchCanvas();
    const PB = window.TangBoBoard;
    const def = PB && PB.shapes && PB.shapes[cfg.key];
    const cv = document.getElementById('cv');
    const ctx = cv.getContext('2d');
    const panel = document.getElementById('panel');
    const hudEl = document.getElementById('hud');
    if (!def) { hudEl.textContent = '图形库没有加载成功：' + cfg.key; return; }

    const S = {
      t: cfg.t0 || 0,
      playing: true,
      dragging: false,
      rate: cfg.speed != null ? cfg.speed : 1,
    };
    // 视图（屏幕像素）：拖动空白处平移，滚轮缩放，双击复位
    const view = { x: 0, y: 0, z: 1 };
    let dirty = true;
    let panning = false, panStart = null;
    const o = {
      x1: 0, y1: 0, x2: 100, y2: 100,
      color: cfg.color || '#1b2433',
      width: 2.4, size: 2.4,
      dash: false, hasBorder: true,
      fillColor: cfg.color || '#1b2433', fillAlpha: 0.18,
    };

    // GH：与画布适配层同一套语义（box / tint / head / deg / bbox / alpha）
    const tint = (hex, a) => {
      if (!hex) return 'rgba(255,255,255,' + a + ')';
      let h = String(hex).replace('#', '');
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      const n = parseInt(h, 16);
      if (isNaN(n)) return 'rgba(255,255,255,' + a + ')';
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    };
    const boxOf = (q) => {
      const x1 = Math.min(q.x1, q.x2), y1 = Math.min(q.y1, q.y2);
      const x2 = Math.max(q.x1, q.x2), y2 = Math.max(q.y1, q.y2);
      return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
    };
    const head = (c, x1, y1, x2, y2, size) => {
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const hl = Math.max(12, (size || 8) * 4), sp = 0.42;
      c.beginPath();
      c.moveTo(x2, y2); c.lineTo(x2 - hl * Math.cos(ang - sp), y2 - hl * Math.sin(ang - sp));
      c.moveTo(x2, y2); c.lineTo(x2 - hl * Math.cos(ang + sp), y2 - hl * Math.sin(ang + sp));
      c.stroke();
    };
    const GH = {
      box: boxOf, bbox: boxOf, head,
      alpha: tint,
      tint: (color, a) => tint(color == null ? o.color : color, a),
      deg: (d) => (d * Math.PI) / 180,
      cur: o,
    };

    // ---------- 参数 ----------
    const params = [];
    for (const p of cfg.params || []) {
      const id = typeof p === 'string' ? p : p.id;
      const pd = (PB.paramDefs && PB.paramDefs[id]) || {};
      const inline = typeof p === 'string' ? {} : p;
      params.push({
        id,
        label: inline.label || pd.label || id,
        min: inline.min != null ? inline.min : (pd.min != null ? pd.min : 0),
        max: inline.max != null ? inline.max : (pd.max != null ? pd.max : 1),
        step: inline.step != null ? inline.step : (pd.step != null ? pd.step : 0.01),
        def: inline.def != null ? inline.def : (pd.def != null ? pd.def : 0),
        unit: inline.unit != null ? inline.unit : (pd.unit || ''),
      });
    }
    const ctl = document.getElementById('ctl');
    const setters = {};
    for (const p of params) {
      o[p.id] = p.def;
      const wrap = document.createElement('div');
      wrap.className = 'ctl';
      const row = document.createElement('div');
      row.className = 'row';
      const lb = document.createElement('span');
      lb.innerHTML = mathLabel(p.label);
      const val = document.createElement('b');
      const sync = () => { val.innerHTML = fmt(o[p.id], p.step) + (p.unit ? ' <span class="unit">' + p.unit + '</span>' : ''); };
      sync();
      row.appendChild(lb); row.appendChild(val);
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = p.min; inp.max = p.max; inp.step = p.step; inp.value = o[p.id];
      inp.addEventListener('input', () => {
        o[p.id] = parseFloat(inp.value);
        sync();
        if (cfg.onParam) cfg.onParam(o, p.id);
        if (cfg.rebuildOnChange !== false) reset(false);
        dirty = true;
      });
      wrap.appendChild(row); wrap.appendChild(inp);
      ctl.appendChild(wrap);
      setters[p.id] = { inp, sync };
    }

    // ---------- 标题 / 说明 ----------
    const h1 = document.createElement('h1');
    h1.textContent = cfg.title || def.label || cfg.key;
    panel.insertBefore(h1, panel.firstChild);
    if (cfg.sub) {
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = cfg.sub;
      panel.insertBefore(sub, h1.nextSibling);
    }

    // ---------- 播放 / 重置 ----------
    const btnWrap = document.createElement('div');
    btnWrap.className = 'btns';
    const bPlay = document.createElement('button');
    bPlay.className = 'primary';
    const bReset = document.createElement('button');
    bReset.textContent = '重置';
    btnWrap.appendChild(bPlay); btnWrap.appendChild(bReset);
    panel.insertBefore(btnWrap, document.getElementById('note'));

    const syncPlay = () => { bPlay.textContent = S.playing ? '暂停' : '播放'; };
    syncPlay();
    if (cfg.static) bPlay.style.display = 'none';
    bPlay.addEventListener('click', () => { S.playing = !S.playing; syncPlay(); dirty = true; });
    bReset.addEventListener('click', () => reset(true));

    // ---------- 播放速度（0.25× / 0.5× / 1× / 2×） ----------
    const rateWrap = document.createElement('div');
    rateWrap.className = 'rate';
    const rateLab = document.createElement('div');
    rateLab.className = 'rate-lab';
    rateLab.textContent = '播放速度';
    const seg = document.createElement('div');
    seg.className = 'seg';
    const rates = [0.25, 0.5, 1, 2];
    const rateBtns = {};
    rates.forEach((r) => {
      const b = document.createElement('button');
      b.textContent = r + '×';
      b.addEventListener('click', () => {
        S.rate = r;
        for (const k of rates) rateBtns[k].classList.toggle('on', k === r);
        dirty = true;
      });
      rateBtns[r] = b;
      seg.appendChild(b);
    });
    rateBtns[S.rate] && rateBtns[S.rate].classList.add('on');
    rateWrap.appendChild(rateLab); rateWrap.appendChild(seg);
    panel.insertBefore(rateWrap, document.getElementById('note'));

    // ---------- 画布操作提示 / 面板折叠 ----------
    const tips = document.createElement('div');
    tips.id = 'tips';
    tips.textContent = '拖动空白处平移　滚轮缩放　双击复位视角';
    document.getElementById('stage').appendChild(tips);
    // 4 秒后自动淡出，避免长期压住画布右下角的读数/图例
    setTimeout(function () { tips.classList.add('fade'); }, 4000);
    const collapse = document.createElement('button');
    collapse.id = 'panel-toggle';
    collapse.title = '收起 / 展开右侧参数面板';
    collapse.textContent = '▾ 收起';
    collapse.addEventListener('click', () => {
      const on = document.body.classList.toggle('panel-hidden');
      collapse.textContent = on ? '☰ 参数' : '▾ 收起';
      collapse.title = on ? '展开右侧参数面板' : '收起右侧参数面板';
      dirty = true;
    });
    document.getElementById('stage').appendChild(collapse);

    function clearState() {
      for (const k of Object.keys(o)) if (k[0] === '_') delete o[k];
      for (const name of ['__ssbStates', '__sprCartStates', '__pdStates', '__sb5States', '__satStates', '__projStates']) {
        if (window[name] && typeof window[name].clear === 'function') window[name].clear();
      }
    }
    function reset(keepPlaying) {
      S.t = 0;
      clearState();
      if (cfg.onReset) cfg.onReset(o);
      if (!keepPlaying) { /* 拖参数时保持播放状态不变 */ }
      dirty = true;
    }
    function resetView() {
      view.x = 0; view.y = 0; view.z = 1;
      dirty = true;
    }

    // 说明区（公式与文字里的 $...$ 一律用 KaTeX 排版）
    function texInline(s) {
      if (!window.katex) return null;
      try {
        return s.replace(/\$([^$]+)\$/g, function (m, t) {
          try { return katex.renderToString(t, { throwOnError: false, strict: false }); }
          catch (_) { return m; }
        });
      } catch (_) { return null; }
    }
    const note = document.getElementById('note');
    if (cfg.note) {
      const k = document.createElement('div');
      k.className = 'k';
      const h = texInline(cfg.note);
      if (h && h !== cfg.note) k.innerHTML = h; else k.textContent = cfg.note;
      note.appendChild(k);
    }
    if (cfg.formula) {
      const fx = document.createElement('span');
      fx.className = 'fx';
      let done = false;
      if (window.katex) {
        try { katex.render(cfg.formula, fx, { displayMode: true, throwOnError: false, strict: false }); done = true; }
        catch (_) { done = false; }
      }
      if (!done) fx.textContent = cfg.formula;
      note.appendChild(fx);
    }

    // ---------- 画布尺寸 ----------
    let W = 0, H = 0, dpr = 1;
    function resize() {
      const r = cv.parentElement.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(200, Math.round(r.width));
      H = Math.max(160, Math.round(r.height));
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      refreshFontScale(W, H);
      dirty = true;
    }
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentElement);
    else window.addEventListener('resize', resize);

    // ---------- 指针：先给页面钩子，没人接就平移画布 ----------
    {
      const pos = (e) => {
        const r = cv.getBoundingClientRect();
        return {
          x: ((e.clientX - r.left) * (W / r.width) - view.x) / view.z,
          y: ((e.clientY - r.top) * (H / r.height) - view.y) / view.z,
        };
      };
      const fire = (name, p) => {
        let taken = false;
        for (const fn of handlers[name] || []) if (fn(p, o, GH) === true) taken = true;
        return taken;
      };
      cv.addEventListener('pointerdown', (e) => {
        const p = pos(e);
        if (fire('pointerdown', p)) {
          S.dragging = true;
          try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件没有捕获 */ }
          e.preventDefault();
          return;
        }
        panning = true;
        panStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        cv.classList.add('grabbing');
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
      });
      cv.addEventListener('pointermove', (e) => {
        if (S.dragging) { fire('pointermove', pos(e)); return; }
        if (!panning) return;
        view.x = panStart.vx + (e.clientX - panStart.x);
        view.y = panStart.vy + (e.clientY - panStart.y);
        dirty = true;
      });
      const up = (e) => {
        if (S.dragging) { S.dragging = false; fire('pointerup', pos(e)); }
        if (panning) { panning = false; cv.classList.remove('grabbing'); }
      };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        const mx = (e.clientX - r.left) * (W / r.width);
        const my = (e.clientY - r.top) * (H / r.height);
        const k = Math.exp(-e.deltaY * 0.0015);
        const z2 = clamp(view.z * k, 0.35, 6);
        view.x = mx - (mx - view.x) * (z2 / view.z);
        view.y = my - (my - view.y) * (z2 / view.z);
        view.z = z2;
        dirty = true;
      }, { passive: false });
      cv.addEventListener('dblclick', resetView);
    }

    // ---------- 主循环 ----------
    const periodOf = () => {
      if (typeof cfg.period === 'number') return cfg.period;
      if (typeof cfg.period === 'string') return Math.max(0.2, +o[cfg.period] || 2.5);
      return 0;
    };
    let last = 0;
    function frame(ts) {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
      last = ts;
      if (S.playing && !S.dragging) {
        S.t += dt * S.rate;
        const T = periodOf();
        if (T > 0 && !cfg.integrate) S.t = S.t % T;
        if (cfg.loop > 0 && S.t > cfg.loop) { S.t = S.t % cfg.loop; clearState(); }
        dirty = true;
      }
      if (dirty) {
        dirty = false;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        THEME_OFF = true;
        ctx.fillStyle = '#000000';
        THEME_OFF = false;
        if (window.__gwSimBackground) ctx.clearRect(0, 0, W, H);
        else ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        // 默认墨色 = 纯白轮廓（形状内部若显式设色会覆盖它）
        ctx.strokeStyle = '#1b2433';
        ctx.fillStyle = '#1b2433';
        ctx.translate(view.x, view.y);
        ctx.scale(view.z, view.z);
        o.x1 = 22; o.y1 = 22; o.x2 = W - 22; o.y2 = H - 22;
        if (cfg.prepare) cfg.prepare(o, W, H);
        try {
          PB.animState.t = S.t;
          def.draw(ctx, o, GH);
        } catch (err) {
          hudEl.textContent = '绘制出错：' + err.message;
          S.playing = false;
          syncPlay();
        }
        ctx.restore();
      }
      hudEl.style.display = 'none';
      requestAnimationFrame(frame);
    }
    PB.animState.t = S.t;
    requestAnimationFrame(frame);

    window.__sim = {
      S, o, def, view, resetView,
      setBackground(bg, light) { window.__gwSimBackground = bg; LIGHT_STAGE = light; dirty = true; },
      set: (id, v) => { o[id] = v; const s = setters[id]; if (s) { s.inp.value = v; s.sync(); } dirty = true; },
      reset, params, static: !!cfg.static,
    };
    active = window.__sim;
  }

  let active = null;
  window.Sim = {
    boot,
    on: (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); },
    // 页面自己的拖拽钩子改参数时用：改完立刻重画（斜面/合力这些 static 页也要实时跟手）。
    set: (id, v) => { if (active) active.set(id, v); },
    reset: (keepPlaying) => { if (active) active.reset(keepPlaying); },
  };
})();
