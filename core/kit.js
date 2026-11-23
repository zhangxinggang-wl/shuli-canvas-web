/* 数理无限画布 · 基础工具库
 * 全局命名空间 GW；经典 <script> 加载（不使用 ES 模块，兼容 Chromium 108 / Electron 22）
 */
(function () {
  'use strict';
  const GW = (window.GW = window.GW || {});

  // ---------- 事件总线 ----------
  const listeners = {};
  GW.bus = {
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return () => GW.bus.off(ev, fn); },
    off(ev, fn) { const a = listeners[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    emit(ev, data) { (listeners[ev] || []).slice().forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); },
  };

  // ---------- 文档身份 ----------
  // 1.5.4 复审 #7：异步 AI 任务（识别/规整/排版/学习）拿到结果时，老师可能已经打开
  // 另一份板书或新建了文档。任何"等回来再落地"的地方都要在提交前对比这个计数器，
  // 否则旧结果会插进新文档（还会连带改 dirty 和撤销栈）。
  let docTok = 0;
  GW.docTok = () => docTok;
  GW.bumpDocTok = () => { docTok += 1; return docTok; };

  // 某些触摸驱动 / 合成事件下 setPointerCapture 会抛异常，统一容错
  if (window.Element && !Element.prototype.__gwSafeCapture) {
    const raw = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function (id) { try { raw.call(this, id); } catch (_) {} };
    Element.prototype.__gwSafeCapture = true;
  }

  GW.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  GW.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 版本号只有这一处。打包脚本 / 关于对话框 / 启动自检都读它，避免三处手写对不上。
  GW.APP_VERSION = '2.2.9';

  // ---------- 渲染层异常留痕（1.6.5） ----------
  // 主进程的 console-message 只有一行文字（「[页面] xxx @app.js:1234」），没有调用栈；
  // 白屏时老师能看见的只有「它坏了」，所以这里把 error.stack 一并送进主进程日志。
  // 浏览器里没有 Electron 时（探针跑在 Edge）退回 console.error，并留在 GW.__errlog 供断言。
  GW.__errlog = [];
  window.addEventListener('error', (e) => {
    // 资源加载失败（<img>/<script> 的 error）不冒泡到 window，这里只会收到脚本异常。
    const err = e && e.error;
    if (!err && !(e && e.message)) return;
    reportRendererError((err && err.message) || (e && e.message) || 'unknown', err && err.stack, e && e.filename, e && e.lineno, e && e.colno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    if (r == null) return;
    reportRendererError((r && (r.message || r)) || 'unhandled rejection', r && r.stack, '', 0, 0);
  });
  function reportRendererError(msg, stack, src, line, col) {
    const rec = {
      msg: String(msg == null ? '' : msg).slice(0, 500),
      stack: String(stack || '').slice(0, 4000),
      src: src || '', line: line || 0, col: col || 0, t: Date.now(),
    };
    try { GW.__errlog.push(rec); if (GW.__errlog.length > 20) GW.__errlog.shift(); } catch (_) {}
    try {
      if (window.gewu && typeof window.gewu.rendererError === 'function') window.gewu.rendererError(rec);
      else console.error('[页面异常] ' + rec.msg + (rec.stack ? ' | ' + rec.stack : ''));
    } catch (_) {}
  }
  GW.reportRendererError = reportRendererError;


  GW.isElectron = !!(window.gewu && window.gewu.isElectron);

  // 1.1.14：透明批注层 = 同一个 index.html 加 ?overlay=1（全屏透明置顶窗口）。
  // 必须在任何模块跑起来之前就定下来：board.js 要跳过底色、storage.js 要跳过自动保存、
  // app.js 要跳过欢迎页与免费声明，全都按这个标记分支，别再各自读 location。
  GW.overlayMode = /[?&]overlay=1(?:&|$)/.test(location.search || '');

  // ---------- DOM 小工具 ----------
  GW.h = function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      // 自定义属性（--c 之类）不能走 Object.assign(el.style, …)：CSSStyleDeclaration 上没有这些
      // 同名属性，赋值会被静默丢掉（小组计分板 +1 按钮的 var(--c) 因此取不到色，白字白底看不见）。
      else if (k === 'style' && typeof v === 'object') {
        for (const s in v) {
          if (v[s] == null) continue;
          if (s.slice(0, 2) === '--') el.style.setProperty(s, String(v[s]));
          else el.style[s] = v[s];
        }
      }
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  };

  GW.toast = function (msg, ms = 2200) {
    let box = document.getElementById('gw-toasts');
    if (!box) { box = GW.h('div', { id: 'gw-toasts' }); document.body.append(box); }
    const t = GW.h('div', { class: 'gw-toast' }, msg);
    box.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  };

  // ---------- 参数控件（供仿真/面板使用） ----------
  // 所有控件返回 { el, get(), set(v) }
  const fmt = (v, step) => {
    const d = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9));
    return Number(v).toFixed(d);
  };
  // 参数标签的「轻量 LaTeX」：变量斜体、下标下沉、其余正体。
  // 用 <em class="mv"> 而不是 <i>，因为 .gw-toggle i 是开关滑块，不能混。
  const MATH_SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '−' };
  GW.mathLabel = function mathLabel(s) {
    if (s == null) return '';
    let t = String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    t = t.replace(/[₀-₉₊₋]/g, (c) => '\u0001' + MATH_SUB[c]);
    t = t.replace(/(^|[^A-Za-zΑ-ω])([A-Za-zΑ-ω])(?![A-Za-zΑ-ω])/g, '$1<em class="mv">$2</em>');
    t = t.replace(/\u0001([0-9+−])/g, '<sub>$1</sub>');
    return t;
  };
  GW.ui = {
    slider({ label, min = 0, max = 1, step = 0.01, value = 0, unit = '', onInput, fmtText }) {
      const val = GW.h('span', { class: 'gw-sl-val' });
      const inp = GW.h('input', { type: 'range', min, max, step, value });
      // fmtText：步长不是 10 的整数次幂时（如 1/4 倍速），按 fmt() 的小数位会把 0.25 显示成 0.3，
      // 和真实写入值对不上。需要精确显示时传一个格式化函数。
      const show = () => (val.innerHTML = '<b>' + (fmtText ? fmtText(+inp.value) : fmt(inp.value, step)) + '</b>' + (unit ? ' <span class="unit">' + unit + '</span>' : ''));
      inp.addEventListener('input', () => { show(); onInput && onInput(+inp.value); });
      show();
      const el = GW.h('label', { class: 'gw-slider' }, GW.h('div', { class: 'gw-sl-top' }, GW.h('span', { html: GW.mathLabel(label) }), val), inp);
      return { el, get: () => +inp.value, set(v) { inp.value = v; show(); } };
    },
    button({ label, onClick, primary = false, title }) {
      const el = GW.h('button', { class: 'gw-btn' + (primary ? ' primary' : ''), title, onclick: (e) => onClick && onClick(e) }, label);
      return { el, get: () => null, set(t) { el.textContent = t; } };
    },
    toggle({ label, value = false, onChange }) {
      const inp = GW.h('input', { type: 'checkbox' });
      inp.checked = !!value;
      inp.addEventListener('change', () => onChange && onChange(inp.checked));
      const el = GW.h('label', { class: 'gw-toggle' }, inp, GW.h('i'), GW.h('span', { html: GW.mathLabel(label) }));
      return { el, get: () => inp.checked, set(v) { inp.checked = !!v; } };
    },
    select({ label, options, value, onChange }) {
      // options: [{value,label}] 或 ['a','b']
      const sel = GW.h('select', null, options.map((o) => {
        const ov = typeof o === 'object' ? o.value : o, ol = typeof o === 'object' ? o.label : o;
        const opt = GW.h('option', { value: ov }, ol);
        if (String(ov) === String(value)) opt.selected = true;
        return opt;
      }));
      sel.addEventListener('change', () => onChange && onChange(sel.value));
      const el = GW.h('label', { class: 'gw-select' }, label ? GW.h('span', { html: GW.mathLabel(label) }) : null, sel);
      return { el, get: () => sel.value, set(v) { sel.value = v; } };
    },
    segmented({ options, value, onChange }) {
      const el = GW.h('div', { class: 'gw-seg' });
      let cur = value;
      const btns = options.map((o) => {
        const ov = typeof o === 'object' ? o.value : o, ol = typeof o === 'object' ? o.label : o;
        const b = GW.h('button', { class: ov === cur ? 'on' : '', onclick: () => { api.set(ov); onChange && onChange(ov); } }, ol);
        b.dataset.v = ov;
        el.append(b);
        return b;
      });
      const api = { el, get: () => cur, set(v) { cur = v; btns.forEach((b) => b.classList.toggle('on', b.dataset.v == String(v))); } };
      return api;
    },
    text({ label, value = '', placeholder = '', onChange }) {
      const inp = GW.h('input', { type: 'text', value, placeholder });
      inp.addEventListener('change', () => onChange && onChange(inp.value));
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      const el = GW.h('label', { class: 'gw-textin' }, label ? GW.h('span', null, label) : null, inp);
      return { el, get: () => inp.value, set(v) { inp.value = v; }, input: inp };
    },
    readout(label) {
      const v = GW.h('b');
      const el = GW.h('div', { class: 'gw-readout' }, GW.h('span', { html: GW.mathLabel(label) }), v);
      return { el, get: () => v.textContent, set(t) { v.innerHTML = t; } };
    },
    group(title, ...children) {
      return GW.h('div', { class: 'gw-group' }, title ? GW.h('div', { class: 'gw-group-t', html: GW.mathLabel(title) }) : null, ...children);
    },
  };

  // ---------- 仿真注册表 ----------
  GW.sims = {};
  GW.registerSim = function (def) {
    if (!def.id || !def.create) throw new Error('registerSim 需要 id 与 create');
    def.width = def.width || 960;
    def.height = def.height || 600;
    GW.sims[def.id] = def;
  };

  const SIM_BG_STYLES = [
    ['solid', '纯色'], ['grid', '方格'], ['dots', '点阵'], ['gradient', '渐变'],
  ];
  GW.simBackground = {
    styles: SIM_BG_STYLES,
    normalize(bg) {
      if (!bg || typeof bg.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(bg.color)) return null;
      return { color: bg.color, style: SIM_BG_STYLES.some(([id]) => id === bg.style) ? bg.style : 'solid' };
    },
    light(bg) {
      const n = parseInt(bg.color.slice(1), 16);
      return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) > 145000;
    },
    apply(el, bg, priority = '') {
      const line = bg && (this.light(bg) ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.18)');
      let image = bg ? 'none' : '';
      if (bg?.style === 'grid') image = `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`;
      if (bg?.style === 'dots') image = `radial-gradient(circle at 12px 12px, ${line} 1.2px, transparent 1.4px)`;
      if (bg?.style === 'gradient') image = 'linear-gradient(135deg, transparent, rgba(0,0,0,.24))';
      el.style.setProperty('background-color', bg?.color || '', priority);
      el.style.setProperty('background-image', image, priority);
      el.style.setProperty('background-size', bg && (bg.style === 'grid' || bg.style === 'dots') ? '24px 24px' : '', priority);
    },
    paint(ctx, w, h, raw) {
      const bg = this.normalize(raw);
      if (!bg) return false;
      ctx.save();
      ctx.fillStyle = bg.color; ctx.fillRect(0, 0, w, h);
      const line = this.light(bg) ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.18)';
      if (bg.style === 'grid') {
        ctx.fillStyle = line;
        for (let x = 0; x < w; x += 24) ctx.fillRect(x, 0, 1, h);
        for (let y = 0; y < h; y += 24) ctx.fillRect(0, y, w, 1);
      } else if (bg.style === 'dots') {
        ctx.fillStyle = line; ctx.beginPath();
        for (let y = 12; y < h; y += 24) for (let x = 12; x < w; x += 24) {
          ctx.moveTo(x + 1.2, y); ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        }
        ctx.fill();
      } else if (bg.style === 'gradient') {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, 'transparent'); g.addColorStop(1, 'rgba(0,0,0,.24)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
      return true;
    },
  };

  // ---------- 仿真脚手架 ----------
  // GW.simKit.layout(root, {panel:true}) → { stage, panel, canvas, ctx2d, size(), toLocal(e), onResize(fn), loop(fn), destroy() }
  // 画布自动处理高清（devicePixelRatio × 画布缩放），坐标统一使用 CSS 像素。
  GW.view = GW.view || { scale: 1 };
  GW.simKit = {
    layout(root, opts = {}) {
      root.classList.add('gw-sim');
      // 仿真参数只存在它自己的闭包里，对象一旦重挂载（切换页/撤销重做到那页/网页版重新挂载）
      // 就全回默认值。objects.js 在 create 之前把 o.data.state 挂到 root 上，下面据此做持久化。
      const st = root.__gwState || null, saveSt = root.__gwSave || null;
      // 1.7.7：一次性 rAF 队列必须在使用点（下方 if (st) 内）之前声明。
      // 原来放在函数末尾，const 的暂时性死区会让挂载带状态的仿真/插入对象直接抛 ReferenceError。
      const extraRaf = [];
      const stage = GW.h('div', { class: 'gw-sim-stage' });
      const canvas = GW.h('canvas');
      stage.append(canvas);
      const panel = opts.panel === false ? null : GW.h('div', { class: 'gw-sim-panel' });
      if (panel && opts.panelWidth) panel.style.width = opts.panelWidth + 'px';
      root.append(stage);
      if (panel) root.append(panel);
      // 参数面板收起 / 展开：数学仿真嵌在画布对象里时，面板会吃掉三分之一宽度，
      // 讲课时要能一键让图占满。按钮固定在右上角，收起后同一位置还在，不会「收起来就找不回」。
      if (panel) {
        const tg = GW.h('button', { class: 'gw-sim-toggle', type: 'button' });
        const sync = () => {
          const hid = root.classList.contains('panel-hidden');
          tg.textContent = hid ? '☰ 参数' : '▾ 收起';
          tg.title = hid ? '展开参数面板' : '收起参数面板（让图形占满）';
        };
        tg.addEventListener('click', () => {
          root.classList.toggle('panel-hidden');
          if (st) { st.__panelHidden = root.classList.contains('panel-hidden'); saveSt && saveSt(); }
          sync();
          requestAnimationFrame(fit);
        });
        if (st && st.__panelHidden) root.classList.add('panel-hidden');
        sync();
        root.append(tg);
        // 参数持久化：把面板里控件的值按「结构序号」记进 o.data.state，重挂载后写回并派发 input，
        // 仿真自己的 onInput 会重算 —— 收起面板、拖动、调过的参数在切页/撤销/存盘重开后都还在。
        if (st) {
          const KEY = '__panel';
          const ctrls = () => Array.from(panel.querySelectorAll('input, select, button[data-v]'));
          const keyOf = (el, i) => el.tagName === 'BUTTON'
            ? 'b' + i + ':' + (el.dataset.v || '')
            : el.tagName + ':' + (el.getAttribute('type') || '') + ':' + i;
          const snap = () => {
            const m = {};
            ctrls().forEach((el, i) => {
              m[keyOf(el, i)] = el.tagName === 'BUTTON' ? (el.classList.contains('on') ? 1 : 0)
                : el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
            });
            st[KEY] = m; saveSt && saveSt();
          };
          // 快照必须等仿真自己的事件处理器跑完再读：分段按钮的选中态是它在 click 里改的，
          // 在捕获阶段读 classList 会记下「点之前」的旧值，恢复时就会点回上一个模式
          // （probe-math-junior 第 ⑦ 组就是被这个坑到的：正反变换重建后变回默认模式）。
          let pend = 0;
          const soon = () => { if (pend) return; pend = requestAnimationFrame(() => { pend = 0; snap(); }); extraRaf.push(pend); };
          panel.addEventListener('input', soon, true);
          panel.addEventListener('change', soon, true);
          panel.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('button[data-v]')) soon(); }, true);
          // rAF 而不是微任务：仿真是在 layout() 返回之后才把控件塞进 panel 的
          extraRaf.push(requestAnimationFrame(() => {
            const m = st[KEY]; if (!m) return;
            ctrls().forEach((el, i) => {
              const key = keyOf(el, i); if (!(key in m)) return;
              const v = m[key];
              if (el.tagName === 'BUTTON') { if (!!v !== el.classList.contains('on')) el.click(); }
              else if (el.type === 'checkbox') { if (el.checked !== !!v) { el.checked = !!v; el.dispatchEvent(new Event('change', { bubbles: true })); } }
              else if (el.value !== String(v)) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }
            });
          }));
        }
      }
      const ctx = canvas.getContext('2d');
      let W = 0, H = 0, ratio = 1, rafId = 0, running = true, alive = true;
      // 1.7.6：主循环之外的一次性 rAF（fit / 面板快照）也要能随 destroy 一起取消
      // （extraRaf 已在 layout() 开头声明，1.7.7 TDZ 修复，此处不再重复）
      const resizeFns = [];
      let simBackground = null;
      const setBackground = (raw) => {
        const bg = GW.simBackground.normalize(raw);
        if (bg?.color === simBackground?.color && bg?.style === simBackground?.style) return;
        simBackground = bg;
        GW.simBackground.apply(stage, bg);
        canvas.dataset.gwSimTone = bg && GW.simBackground.light(bg) ? 'light' : '';
        if (root.__gwNativeSim) canvas.style.filter = canvas.dataset.gwSimTone ? 'none' : '';
        if (W && H) resizeFns.forEach((f) => f(W, H));
      };
      root.__gwSetBackground = setBackground;
      setBackground(root.__gwSimBackground);
      function fit() {
        const r = stage.getBoundingClientRect();
        const cw = stage.clientWidth, ch = stage.clientHeight;
        if (!cw || !ch) return;
        // 屏幕上的真实缩放 = 屏幕像素宽 / CSS 宽
        const screenScale = r.width / cw || 1;
        const nat = (window.devicePixelRatio || 1) * Math.max(0.5, screenScale);
        // 弱机 / 软件渲染时限一下像素总量：一个仿真少画一半像素，多个仿真同开才不会互相拖垮
        const cap = GW.perf ? Math.max(1, GW.perf.simDpr * Math.max(0.5, screenScale)) : nat;
        const nr = Math.min(4, nat, cap);
        if (cw === W && ch === H && Math.abs(nr - ratio) < 0.15) return;
        W = cw; H = ch; ratio = nr;
        canvas.width = Math.round(W * ratio);
        canvas.height = Math.round(H * ratio);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        resizeFns.forEach((f) => f(W, H));
      }
      const ro = new ResizeObserver(fit);
      ro.observe(stage);
      const offView = GW.bus.on('view', () => fit());
      extraRaf.push(requestAnimationFrame(fit));

      // 仿真是否还在画面上：画布滚出视野后停掉动画循环。
      // 一页上开着好几个仿真时，这一步能省掉绝大部分无效的计算（弱机上尤其明显）。
      function onScreen() {
        if (!canvas.isConnected) return false;
        const r = canvas.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > -200 && r.top < innerHeight + 200 && r.right > -200 && r.left < innerWidth + 200;
      }

      const api = {
        stage, panel, canvas, ctx2d: ctx,
        background() {
          if (simBackground) ctx.clearRect(0, 0, W, H);
          else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
        },
        size: () => ({ w: W, h: H }),
        // 指针事件 → 画布 CSS 坐标（自动抵消外层缩放）
        toLocal(e) {
          const r = canvas.getBoundingClientRect();
          return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
        },
        onResize(fn) { resizeFns.push(fn); if (W) fn(W, H); },
        // 动画循环：fn(dt秒, t总时间)；仿真不可见时自动降频
        loop(fn) {
          let last = performance.now(), t = 0;
          const tick = (now) => {
            if (!alive) return;
            let dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (!onScreen()) { rafId = requestAnimationFrame(tick); return; }   // 不在画面上：只留一个空转的定时器
            if (running) t += dt; else dt = 0;
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            fn(dt, t);
            rafId = requestAnimationFrame(tick);
          };
          rafId = requestAnimationFrame(tick);
        },
        get running() { return running; },
        set running(v) { running = v; },
        destroy() {
          alive = false; cancelAnimationFrame(rafId);
          extraRaf.forEach((id) => cancelAnimationFrame(id)); extraRaf.length = 0;
          ro.disconnect(); offView();
          delete root.__gwSetBackground;
        },
        // 拖拽助手：hitFn(p) 返回被拖对象或 null；moveFn(obj,p,e)；upFn(obj)
        drag(hitFn, moveFn, upFn) {
          let target = null, pid = null;
          canvas.addEventListener('pointerdown', (e) => {
            const p = api.toLocal(e);
            const t = hitFn(p, e);
            if (t == null) return;
            target = t; pid = e.pointerId;
            canvas.setPointerCapture(pid);
            e.preventDefault(); e.stopPropagation();
            moveFn(target, p, e, true);
          });
          canvas.addEventListener('pointermove', (e) => {
            if (target == null) {
              canvas.style.cursor = hitFn(api.toLocal(e), e, true) != null ? 'grab' : '';
              return;
            }
            if (e.pointerId !== pid) return;
            moveFn(target, api.toLocal(e), e, false);
          });
          const up = (e) => { if (target != null && e.pointerId === pid) { upFn && upFn(target); target = null; } };
          canvas.addEventListener('pointerup', up);
          canvas.addEventListener('pointercancel', up);
        },
      };
      return api;
    },

    // 标准“播放/暂停/重置”控件组
    transport(kit, onReset) {
      const play = GW.ui.button({ label: '⏸ 暂停', onClick: () => { kit.running = !kit.running; play.set(kit.running ? '⏸ 暂停' : '▶ 播放'); } });
      const reset = GW.ui.button({ label: '↺ 重置', onClick: () => onReset && onReset() });
      const el = GW.h('div', { class: 'gw-row' }, play.el, reset.el);
      return { el, play, reset, setRunning(v) { kit.running = v; play.set(v ? '⏸ 暂停' : '▶ 播放'); } };
    },
  };

  // ---------- 绘图助手 ----------
  GW.draw = {
    arrow(ctx, x1, y1, x2, y2, { color = '#e4572e', width = 2.5, head = 10, dash = null, label = null, font = '15px sans-serif' } = {}) {
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
      if (L < 0.5) return;
      const ux = dx / L, uy = dy / L, hh = Math.min(head, L * 0.6);
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux * hh * 0.8, y2 - uy * hh * 0.8); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - ux * hh - uy * hh * 0.45, y2 - uy * hh + ux * hh * 0.45);
      ctx.lineTo(x2 - ux * hh + uy * hh * 0.45, y2 - uy * hh - ux * hh * 0.45);
      ctx.closePath(); ctx.fill();
      if (label) { ctx.font = font; ctx.textBaseline = 'middle'; ctx.fillText(label, x2 + uy * 14 + ux * 8, y2 - ux * 14 + uy * 8); }
      ctx.restore();
    },
    // 坐标轴：返回 {toX, toY, fromX, fromY}；opts: {x0,y0 屏幕原点, sx, sy 每单位像素, xLabel, yLabel, grid}
    axes(ctx, area, o) {
      const { x, y, w, h } = area;
      const sx = o.sx, sy = o.sy, ox = o.ox, oy = o.oy; // ox,oy: 原点屏幕坐标
      const toX = (v) => ox + v * sx, toY = (v) => oy - v * sy;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      const col = o.color || '#555', gcol = o.gridColor || 'rgba(0,0,0,0.07)';
      const step = (s) => { const raw = 70 / s, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 2 ? 1 : m < 5 ? 2 : 5) * p; };
      const stx = o.stepX || step(sx), sty = o.stepY || step(sy);
      ctx.font = '12px sans-serif'; ctx.fillStyle = col; ctx.lineWidth = 1;
      const xs = Math.ceil((x - ox) / sx / stx) * stx, xe = (x + w - ox) / sx;
      for (let v = xs; v <= xe; v += stx) {
        const px = toX(v);
        if (o.grid !== false) { ctx.strokeStyle = gcol; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke(); }
        if (Math.abs(v) > stx / 2) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(+v.toFixed(6), px, GW.clamp(oy + 4, y + 2, y + h - 16)); }
      }
      const ys = Math.ceil((oy - (y + h)) / sy / sty) * sty, ye = (oy - y) / sy;
      for (let v = ys; v <= ye; v += sty) {
        const py = toY(v);
        if (o.grid !== false) { ctx.strokeStyle = gcol; ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke(); }
        if (Math.abs(v) > sty / 2) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(+v.toFixed(6), GW.clamp(ox - 5, x + 24, x + w - 4), py); }
      }
      ctx.restore();
      ctx.save();
      if (oy >= y && oy <= y + h) GW.draw.arrow(ctx, x, oy, x + w - 2, oy, { color: col, width: 1.5, head: 9 });
      if (ox >= x && ox <= x + w) GW.draw.arrow(ctx, ox, y + h, ox, y + 2, { color: col, width: 1.5, head: 9 });
      ctx.fillStyle = col; ctx.font = 'italic 15px "Times New Roman", serif';
      if (o.xLabel) { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(o.xLabel, x + w - 6, oy - 6); }
      if (o.yLabel) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(o.yLabel, ox + 8, y + 4); }
      if (ox >= x && oy <= y + h) { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('O', ox - 4, oy + 3); }
      ctx.restore();
      return { toX, toY, fromX: (px) => (px - ox) / sx, fromY: (py) => (oy - py) / sy };
    },
  };

  // ---------- 安全的数学表达式编译 ----------
  // 支持：+ - * / ^ ()、sin cos tan asin acos atan sqrt abs ln log exp floor ceil sign pi e、隐式乘法(2x, 3sin(x), (x+1)(x-1))
  GW.compileExpr = function (src, vars = ['x']) {
    let s = String(src).trim().replace(/\s+/g, '').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi').replace(/（/g, '(').replace(/）/g, ')');
    if (/^y=/.test(s)) s = s.slice(2);
    const fnNames = ['asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'ln', 'log', 'exp', 'floor', 'ceil', 'sign', 'cot', 'sec', 'csc', 'lg'];
    const consts = ['pi', 'e'];
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; toks.push({ t: 'num', v: s.slice(i, j) }); i = j; continue; }
      if (/[a-zA-Z_]/.test(c)) {
        let matched = null;
        for (const f of fnNames) if (s.startsWith(f, i) && s[i + f.length] === '(') { matched = f; break; }
        if (matched) { toks.push({ t: 'fn', v: matched }); i += matched.length; continue; }
        let found = null;
        for (const v of vars.concat(consts).sort((a, b) => b.length - a.length)) if (s.startsWith(v, i)) { found = v; break; }
        if (!found) throw new Error('无法识别：' + s.slice(i));
        toks.push({ t: vars.includes(found) ? 'var' : 'const', v: found }); i += found.length; continue;
      }
      if ('+-*/^(),'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
      throw new Error('非法字符：' + c);
    }
    // 插入隐式乘号
    const out = [];
    for (let k = 0; k < toks.length; k++) {
      const a = out[out.length - 1], b = toks[k];
      const aEnd = a && (a.t === 'num' || a.t === 'var' || a.t === 'const' || (a.t === 'op' && a.v === ')'));
      const bStart = b.t === 'num' || b.t === 'var' || b.t === 'const' || b.t === 'fn' || (b.t === 'op' && b.v === '(');
      if (aEnd && bStart) out.push({ t: 'op', v: '*' });
      out.push(b);
    }
    const map = { asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan', sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh', sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan', sqrt: 'Math.sqrt', abs: 'Math.abs', ln: 'Math.log', log: 'Math.log10', lg: 'Math.log10', exp: 'Math.exp', floor: 'Math.floor', ceil: 'Math.ceil', sign: 'Math.sign', cot: '1/Math.tan', sec: '1/Math.cos', csc: '1/Math.sin' };
    // 递归下降：expr→term(±term)*；term→unary(*/unary)*；unary→-unary|power；power→primary(^unary)?
    let p = 0;
    const peek = () => out[p], isOp = (v) => out[p] && out[p].t === 'op' && out[p].v === v;
    const expect = (v) => { if (!isOp(v)) throw new Error('缺少 ' + v); p++; };
    function expr() { let r = term(); while (isOp('+') || isOp('-')) { const o = out[p++].v; r = '(' + r + o + term() + ')'; } return r; }
    function term() { let r = unary(); while (isOp('*') || isOp('/')) { const o = out[p++].v; r = '(' + r + o + unary() + ')'; } return r; }
    function unary() { if (isOp('-')) { p++; return '(-' + unary() + ')'; } if (isOp('+')) { p++; return unary(); } return power(); }
    function power() { const b = primary(); if (isOp('^')) { p++; return 'Math.pow(' + b + ',' + unary() + ')'; } return b; }
    function primary() {
      const t = peek();
      if (!t) throw new Error('表达式不完整');
      p++;
      if (t.t === 'num') return '(' + t.v + ')';
      if (t.t === 'var') return t.v;
      if (t.t === 'const') return t.v === 'pi' ? 'Math.PI' : 'Math.E';
      if (t.t === 'fn') { expect('('); const a = expr(); expect(')'); return '(' + map[t.v] + '(' + a + '))'; }
      if (t.t === 'op' && t.v === '(') { const a = expr(); expect(')'); return a; }
      throw new Error('意外的符号 ' + t.v);
    }
    const js = expr();
    if (p < out.length) throw new Error('多余的符号 ' + out[p].v);
    // eslint-disable-next-line no-new-func
    const f = new Function(...vars, '"use strict";return ' + js + ';');
    f(...vars.map(() => 0.123)); // 试运行以尽早暴露语法错误
    return f;
  };
})();




// 1.3.1：移动端视口变量。
// iOS Safari 的 innerHeight 含地址栏/工具栏区域，`position: fixed` 的工具条会落到
// 可视区下方（老师看到的就是「工具栏整条不见」），笔迹画布也会比可视区高出一截，
// 于是笔尖与墨迹整体错位。这里把 visualViewport 的高度/偏移写进 CSS 变量，
// app.css 的 #stage 与各工具条都按它定位；桌面端（没有 visualViewport 或高度一致）不受影响。
(function () {
  const root = document.documentElement, vv = window.visualViewport;
  const ua = navigator.userAgent || '';
  // 1.1.14：只有 iOS Safari 需要 visualViewport。安卓（含小米平板 WebView）在沉浸式全屏下
  // visualViewport.height 有时不含底部手势条/导航栏那一条，按它设 #stage 高度就会在屏幕最下方
  // 留一条 20~40px 的白边（反馈 4）。安卓/桌面一律用 window.innerHeight（布局视口），
  // 并向上取整 —— 小数的视口高度四舍五入会少 0.3~0.7px，正好是一条亮线。
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let lastH = -1, lastT = -1, lastB = -1;
  function apply() {
    let h, t;
    if (isIOS) {
      h = Math.round(vv ? vv.height : window.innerHeight);
      t = Math.round(vv ? vv.offsetTop : 0);
    } else {
      h = Math.ceil(window.innerHeight);
      t = 0;
    }
    // 1.1.10：视觉视口「底部空档」。iOS Safari / 安卓浏览器把自己的工具栏画在版面视口底部，
    // position:fixed 的 bottom:14px 会落在那条工具栏后面 —— 平板网页端反馈「下方工具栏看不见」
    // 就是这一条。把空档写成 --vb，app.css 的 --safe-b 会把它叠加到四条栏的 bottom 上。
    // 上限 120px：软键盘弹出时 vv.height 会掉到一半，不封顶的话四条栏会被顶到屏幕中间。
    // 非 iOS 的 innerHeight 已经是可见布局视口，空档恒为 0（1.1.14）。
    const b = isIOS ? Math.min(120, Math.max(0, Math.round(window.innerHeight - (h + t)))) : 0;
    if (h === lastH && t === lastT && b === lastB) return;
    lastH = h; lastT = t; lastB = b;
    root.style.setProperty('--vh', h + 'px');
    root.style.setProperty('--vt', t + 'px');
    root.style.setProperty('--vb', b + 'px');
    root.style.setProperty('--safe-t', t + 'px');
    if (GW.refreshViewport) GW.refreshViewport();
    // 1.1.10：底部空档变了，四条栏的 bottom 要重算（applyCorners 写的是 px / calc 表达式）
    if (GW.relayoutBars) GW.relayoutBars();
    // 1.4.3：窗口/屏幕尺寸变了就按规则重判三条栏 —— 手机横屏（短边 360）与电脑是两种界面，
    // CDP 模拟、旋转屏、平板分屏都会在启动之后才把视口改掉。
    if (GW.autoChrome) GW.autoChrome();
  }
  GW.viewportVars = apply;
  apply();
  if (vv) {
    vv.addEventListener('resize', () => requestAnimationFrame(apply));
    vv.addEventListener('scroll', () => requestAnimationFrame(apply));
  }
  window.addEventListener('orientationchange', () => setTimeout(apply, 350));
  window.addEventListener('resize', () => requestAnimationFrame(apply));
})();



