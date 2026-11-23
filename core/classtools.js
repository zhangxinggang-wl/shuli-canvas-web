/* 数理无限画布 · 课堂工具：计时器、随机点名、聚光灯、幕布、放大镜、计算器、区域截图、计分板、常量表 */
(function () {
  'use strict';
  const GW = window.GW, h = GW.h;
  // 1.1.15：课堂效果（聚光灯 / 幕布）也要双端一致 —— 老师在电脑上遮住答案，
  // 平板那边必须同步遮住，否则学生一眼就看到答案。只发「归一化后的状态」，
  // 各端按自己的窗口尺寸重画，横竖屏都不变形。
  function netCls(m) { if (GW.netLive) GW.netLive('cls', Object.assign({ k: 'cls' }, m)); }

  // ---------- 通用浮动面板（屏幕坐标，可拖动，右下角可缩放） ----------
  let zTop = 500;
  // 面板大小记在本机：同一个工具第二次打开还是上次的大小。
  // 键跟其它设置一样带 gewu. 前缀（storage.js 的迁移只认这个前缀）。
  function floatSizes() {
    const k = 'gewu.float.size';
    let m = null;
    try { m = JSON.parse(localStorage.getItem(k) || '{}'); } catch (_) { m = null; }
    return m && typeof m === 'object' ? { k: k, m: m } : { k: k, m: {} };
  }
  function saveFloatSize(title, w, hh) {
    const s = floatSizes();
    s.m[title] = { w: Math.round(w), h: Math.round(hh) };
    try { localStorage.setItem(s.k, JSON.stringify(s.m)); } catch (_) {}
  }
  GW.float = function (title, content, opts = {}) {
    const close = h('button', { class: 'fl-x', html: GW.icon('close') });
    const head = h('div', { class: 'fl-head' }, h('span', null, title), close);
    const grip = h('div', { class: 'fl-grip', title: '拖动改变大小' });
    const bodyEl = h('div', { class: 'fl-body' }, content);
    const box = h('div', { class: 'float-panel ' + (opts.cls || '') }, head, bodyEl, grip);
    box.style.zIndex = ++zTop;
    document.getElementById('float-layer').append(box);
    // 视口自适应：Windows 缩放 100% / 125% / 150% 改的就是 CSS 宽高，
    // 所以默认宽度按视口比例算、再夹到 260..760，别写死 400 ——
    // 1920@150% 时 CSS 宽只有 1280，固定 400 会占到近三分之一屏。
    const vw = innerWidth, vh = innerHeight;
    const pref = opts.w || 380;
    const saved = floatSizes().m[title];
    const maxW = Math.max(260, vw - 16), maxH = Math.max(150, vh - 16);
    let w = GW.clamp(saved && saved.w ? saved.w : Math.min(pref, vw * 0.52), 260, Math.min(760, maxW));
    let hh = saved && saved.h ? GW.clamp(saved.h, 150, maxH) : 0;
    const setW = (v) => { w = v; box.style.width = Math.round(w) + 'px'; box.style.setProperty('--cw', Math.round(w) + 'px'); };
    const setH = (v) => { hh = v; box.style.height = v ? Math.round(v) + 'px' : ''; };
    setW(w);
    if (hh) setH(hh);
    box.style.left = GW.clamp(opts.x != null ? opts.x : (vw - w) / 2, 8, Math.max(8, vw - w - 8)) + 'px';
    box.style.top = GW.clamp(opts.y != null ? opts.y : Math.max(24, vh * 0.14), 8, Math.max(8, vh - 120)) + 'px';
    // 右下角缩放：跟对象卡片的 .obj-resize 同一个手感
    grip.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.stopPropagation(); e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY, w0 = box.offsetWidth, h0 = box.offsetHeight;
      document.body.classList.add('dragging-obj');
      const mv = (ev) => {
        setW(GW.clamp(w0 + (ev.clientX - sx), 260, maxW));
        setH(GW.clamp(h0 + (ev.clientY - sy), 150, maxH));
      };
      const up = () => {
        grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
        document.body.classList.remove('dragging-obj');
        saveFloatSize(title, w, hh || box.offsetHeight);
      };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      head.setPointerCapture(e.pointerId);
      const sx = e.clientX - box.offsetLeft, sy = e.clientY - box.offsetTop;
      const mv = (ev) => { box.style.left = GW.clamp(ev.clientX - sx, -box.offsetWidth + 80, innerWidth - 80) + 'px'; box.style.top = GW.clamp(ev.clientY - sy, 0, innerHeight - 50) + 'px'; };
      const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); };
      head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
    });
    box.addEventListener('pointerdown', () => (box.style.zIndex = ++zTop));
    box.addEventListener('keydown', (e) => e.stopPropagation());
    const api = { box, close() { box.remove(); opts.onClose && opts.onClose(); } };
    close.onclick = api.close;
    return api;
  };

  // ---------- 声音 ----------
  let actx = null;
  function beep(freq = 880, dur = 0.18, times = 1, gap = 0.12) {
    try {
      actx = actx || new AudioContext();
      for (let i = 0; i < times; i++) {
        const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + i * (dur + gap);
        o.frequency.value = freq; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
      }
    } catch (_) {}
  }
  GW.beep = beep;

  const fmtT = (ms, tenths) => {
    const neg = ms < 0; ms = Math.abs(ms);
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), d = Math.floor((ms % 1000) / 100);
    return (neg ? '-' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + (tenths ? '.' + d : '');
  };

  const T = (GW.classTools = {});

  // ---------- 计时器 ----------
  T.timer = function () {
    let mode = 'down', total = 5 * 60000, left = total, running = false, raf = 0, elapsed = 0, laps = [];
    // 1.6.5：走时改成「墙钟锚点」。改前靠 rAF 回调里累加 dt —— 窗口最小化 / 被 PPT 全屏遮挡时
    // Chromium 暂停 rAF，倒计时就冻在原地（切回来还是 4:59，实际已过 10 分钟），LAN 推给平板的也是冻住的值。
    // 现在只记「开始那一刻的时间戳 + 那一刻的剩余量」，剩下多少永远现算；rAF 只负责重绘与提示音。
    let anchorAt = 0, anchorLeft = 0, anchorElapsed = 0;
    // 1.6.5：计时期间请主进程别让系统挂起进程（引用计数在 main/awake.js）。没有 Electron 时静默跳过。
    let awakeOn = false;
    function awake(on) {
      const v = !!on;
      if (v === awakeOn) return;
      awakeOn = v;
      try { if (window.gewu && window.gewu.keepAwake) window.gewu.keepAwake(v); } catch (_) {}
    }
    // 1.6.5：倒计时到点由主进程负责提醒。窗口最小化 / 被 PPT 盖住时 rAF 会被停，
    // 页面里的响铃不可靠；主进程的定时器照跑，到点弹右下角置顶小卡。
    function remindSet(at, text) {
      try {
        if (window.gewu && window.gewu.remind) window.gewu.remind.set({ id: 'timer', at: at, title: '计时结束', body: text });
      } catch (_) { /* 网页版没有这个桥 */ }
    }
    function remindClear() {
      try { if (window.gewu && window.gewu.remind) window.gewu.remind.clear('timer'); } catch (_) { /* noop */ }
    }
    const disp = h('div', { class: 'tm-disp' });
    const bar = h('div', { class: 'tm-bar' }, h('i'));
    const lapsEl = h('div', { class: 'tm-laps' });
    const seg = GW.ui.segmented({ options: [{ value: 'down', label: '倒计时' }, { value: 'up', label: '秒表' }], value: mode, onChange: (v) => { mode = v; reset(); } });
    const presets = h('div', { class: 'tm-presets' }, [0.5, 1, 2, 3, 5, 10, 15, 20].map((m) => h('button', { class: 'gw-btn', onclick: () => { total = m * 60000; reset(); } }, m < 1 ? '30秒' : m + '分')));
    const adj = h('div', { class: 'tm-presets' }, [['-1分', -60000], ['-10秒', -10000], ['+10秒', 10000], ['+1分', 60000]].map(([l, v]) => h('button', { class: 'gw-btn', onclick: () => { total = Math.max(5000, total + v); if (!running) left = total; else { left += v; reanchor(); } draw(); } }, l)));
    const start = GW.ui.button({ label: '开始', primary: true, onClick: () => (running ? pause() : go()) });
    const lapBtn = GW.ui.button({ label: '计次', onClick: () => { if (mode === 'up' && running) { laps.unshift(elapsed); draw(); } } });
    const resetBtn = GW.ui.button({ label: '重置', onClick: () => reset() });
    const big = GW.ui.button({ label: '⛶ 全屏', onClick: () => panel.box.classList.toggle('tm-full') });
    function draw() {
      const v = mode === 'down' ? left : elapsed;
      disp.textContent = fmtT(mode === 'down' ? Math.max(0, v) + (v > 0 ? 999 : 0) : v, mode === 'up');
      bar.style.display = mode === 'down' ? '' : 'none';
      bar.firstChild.style.width = (mode === 'down' ? GW.clamp(left / total, 0, 1) * 100 : 0) + '%';
      disp.classList.toggle('warn', mode === 'down' && left <= 10000 && left > 0);
      disp.classList.toggle('done', mode === 'down' && left <= 0);
      presets.style.display = adj.style.display = mode === 'down' ? '' : 'none';
      lapBtn.el.style.display = mode === 'up' ? '' : 'none';
      lapsEl.innerHTML = laps.map((l, i) => `<div><span>第 ${laps.length - i} 次</span><b>${fmtT(l, true)}</b></div>`).join('');
    }
    let warned = new Set();
    function tick() {
      const now = Date.now();
      if (mode === 'down') {
        left = anchorLeft - (now - anchorAt);
        const sec = Math.ceil(left / 1000);
        if (sec <= 3 && sec > 0 && !warned.has(sec)) { warned.add(sec); beep(660, 0.12); }
        if (left <= 0) { left = 0; running = false; start.set('开始'); awake(false); remindClear(); beep(988, 0.35, 3, 0.15); draw(); return; }
      } else elapsed = anchorElapsed + (now - anchorAt);
      draw();
      raf = requestAnimationFrame(tick);
    }
    function reanchor() {
      anchorAt = Date.now(); anchorLeft = left; anchorElapsed = elapsed;
      // 每次起跑 / 加减时间都重新交给主进程，免得算的是旧时刻
      if (running && mode === 'down') remindSet(anchorAt + Math.max(0, anchorLeft), '倒计时 ' + fmtT(total) + ' 到了');
    }
    function go() { if (mode === 'down' && left <= 0) left = total; running = true; reanchor(); start.set('暂停'); awake(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); }
    function pause() {
      if (running) { const now = Date.now(); left = anchorLeft - (now - anchorAt); if (mode === 'up') elapsed = anchorElapsed + (now - anchorAt); }
      running = false; cancelAnimationFrame(raf); start.set('继续'); awake(false); remindClear();
    }
    function reset() { running = false; cancelAnimationFrame(raf); left = total; elapsed = 0; laps = []; warned = new Set(); anchorAt = 0; anchorLeft = left; anchorElapsed = 0; start.set('开始'); awake(false); remindClear(); draw(); }
    // 1.1.15：计时器也要双端一致 —— 老师在电脑上按开始，平板那边同样看到倒计时
    let syncTimer = 0;
    function pushTimer() {
      const v = mode === 'down' ? Math.max(0, left) : elapsed;
      netCls({ t: 'timer', on: true, mode, left: Math.round(v), total: Math.round(total), running: !!running, laps: laps.slice(0, 3) });
    }
    syncTimer = setInterval(pushTimer, 500);
    pushTimer();
    const panel = GW.float('计时器', h('div', { class: 'tm' }, seg.el, disp, bar, presets, adj, h('div', { class: 'gw-row' }, start.el, lapBtn.el, resetBtn.el, big.el), lapsEl), { w: 420, onClose: () => { clearInterval(syncTimer); netCls({ t: 'timer', on: false }); cancelAnimationFrame(raf); awake(false); remindClear(); } });
    draw();
  };

  // ---------- 随机点名 ----------
  // 1.3.8：名单按班级隔离。settings.rollClasses = [{id, name, names}]，settings.rollClass = 当前 id。
  // 老存档只有 settings.names，首次打开时自动迁进「我的班级」，不做破坏性变更。
  T.rollcall = function () {
    const S = GW.settings;
    const split = (t) => String(t || '').split(/[\n,，、\s]+/).filter(Boolean);
    function ensureClasses() {
      let list = Array.isArray(S.rollClasses) ? S.rollClasses.filter((c) => c && c.id && c.name) : [];
      if (!list.length) {
        list = [{ id: 'c1', name: '我的班级', names: S.names || '' }];
        S.rollClasses = list;
      }
      if (!list.some((c) => c.id === S.rollClass)) S.rollClass = list[0].id;
      return list;
    }
    let classes = ensureClasses();
    const cur = () => classes.find((c) => c.id === S.rollClass) || classes[0];
    let names = split(cur().names);
    let picked = [], rolling = false;
    // 当前班级与老字段保持一致：别的地方（设置页文案、旧探针）仍读 settings.names
    const mirror = () => { S.names = cur().names; S.rollClasses = classes; GW.saveSettings(); };

    const disp = h('div', { class: 'rc-disp' }, names.length ? `共 ${names.length} 人` : '请先编辑名单');
    const hist = h('div', { class: 'rc-hist' });
    const noRepeat = GW.ui.toggle({ label: '不重复抽取', value: true });
    const count = GW.ui.select({ label: '', options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: '一次抽 ' + n + ' 人' })), value: 1 });
    const numMode = GW.ui.toggle({ label: '按学号抽取（不用名单）', value: !names.length });
    const range = GW.ui.text({ label: '学号范围', value: '1-50' });
    const go = GW.ui.button({ label: '🎲 开始点名', primary: true, onClick: roll });
    const edit = GW.ui.button({ label: '编辑名单', onClick: editNames });

    // ---- 班级条 ----
    const clsSel = h('select', { class: 'rc-sel' });
    clsSel.addEventListener('change', () => { S.rollClass = clsSel.value; switchTo(); });
    function fillCls() {
      clsSel.innerHTML = '';
      for (const c of classes) {
        const o = h('option', { value: c.id }, `${c.name}（${split(c.names).length} 人）`);
        if (c.id === S.rollClass) o.selected = true;
        clsSel.append(o);
      }
    }
    function switchTo() {
      names = split(cur().names);
      picked = []; rolling = false;
      hist.textContent = '';
      disp.classList.remove('rolling');
      disp.textContent = names.length ? `共 ${names.length} 人` : '请先编辑名单';
      numMode.set(!names.length);
      fillCls();
      mirror();
    }
    function newClass() {
      const inp = h('input', { type: 'text', class: 'rc-name', value: '新班级' });
      const ta = h('textarea', { class: 'rc-ta', placeholder: '每行一个名字，直接从 Excel 复制一列粘贴进来；也可以先留空，稍后再导入' });
      GW.dialog({ title: '新建班级', body: h('div', { class: 'rc-new' }, h('label', { class: 'muted' }, '班级名称（例如 高一(3)班）'), inp, ta), ok: '创建', onOk() {
        const nm = (inp.value || '').trim() || '未命名班级';
        const id = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 99).toString(36);
        classes.push({ id, name: nm, names: ta.value || '' });
        S.rollClass = id;
        mirrors();
      } });
    }
    function renameClass() {
      const c = cur();
      const inp = h('input', { type: 'text', class: 'rc-name', value: c.name });
      GW.dialog({ title: '班级改名', body: h('div', { class: 'rc-new' }, h('label', { class: 'muted' }, '班级名称'), inp), ok: '保存', onOk() {
        c.name = (inp.value || '').trim() || c.name;
        mirror(); fillCls();
      } });
    }
    function delClass() {
      if (classes.length <= 1) return GW.toast('至少保留一个班级');
      const c = cur();
      GW.dialog({ title: '删除班级', body: h('p', { class: 'muted' }, `确定删除「${c.name}」？它的名单会一起删掉，撤销不了。`), ok: '删除', onOk() {
        classes = classes.filter((x) => x.id !== c.id);
        S.rollClass = classes[0].id;
        mirrors();
      } });
    }
    // 建/删/改名之后：先落盘，再刷新下拉与当前名单
    function mirrors() { S.rollClasses = classes; mirror(); switchTo(); }
    const clsBar = h('div', { class: 'rc-cls' }, h('span', { class: 'rc-cls-t' }, '班级'), clsSel,
      GW.ui.button({ label: '＋ 新建', onClick: newClass }).el,
      GW.ui.button({ label: '改名', onClick: renameClass }).el,
      GW.ui.button({ label: '删除', onClick: delClass }).el);
    fillCls();

    function pool() {
      let all = names;
      if (numMode.get()) { const m = /(\d+)\s*[-~—到]\s*(\d+)/.exec(range.get()) || [0, 1, 50]; all = []; for (let i = +m[1]; i <= +m[2]; i++) all.push(i + ' 号'); }
      const p = noRepeat.get() ? all.filter((n) => !picked.includes(n)) : all;
      return { all, p };
    }
    function roll() {
      if (rolling) return;
      let { all, p } = pool();
      if (!all.length) return GW.toast('名单为空');
      if (!p.length) { picked = []; p = all; GW.toast('已全部抽完，重新开始'); }
      const n = Math.min(+count.get(), p.length);
      rolling = true;
      let k = 0;
      const steps = 22;
      const spin = () => {
        const sh = p.slice().sort(() => Math.random() - 0.5).slice(0, n);
        disp.innerHTML = sh.map((x) => `<span>${x}</span>`).join('');
        disp.classList.add('rolling');
        if (k++ < steps) { beep(400 + k * 25, 0.03); setTimeout(spin, 40 + k * k * 0.6); }
        else {
          disp.classList.remove('rolling');
          // 用加密安全的随机数做最终选择
          const res = [], q = p.slice();
          for (let i = 0; i < n; i++) { const r = crypto.getRandomValues(new Uint32Array(1))[0] % q.length; res.push(q.splice(r, 1)[0]); }
          disp.innerHTML = res.map((x) => `<span class="win">${x}</span>`).join('');
          picked.push(...res);
          hist.innerHTML = `已抽（${cur().name}）：` + picked.join('、');
          beep(1046, 0.25, 2, 0.06);
          rolling = false;
        }
      };
      spin();
    }
    function editNames() {
      const c = cur();
      const ta = h('textarea', { class: 'rc-ta', placeholder: '每行一个名字，或用逗号/空格分隔' });
      ta.value = c.names || '';
      GW.dialog({ title: `编辑名单 · ${c.name}`, body: h('div', null, ta, h('p', { class: 'muted' }, '每个班级一份名单，只改当前班级的。名单保存在本机，可直接从 Excel 复制一列粘贴进来。')), ok: '保存', onOk() {
        c.names = ta.value;
        names = split(c.names); picked = [];
        hist.textContent = '';
        numMode.set(!names.length);
        disp.textContent = names.length ? `共 ${names.length} 人` : '请先编辑名单';
        mirror(); fillCls();
      } });
    }
    GW.float('随机点名', h('div', { class: 'rc' }, clsBar, disp, h('div', { class: 'gw-row' }, go.el, edit.el), h('div', { class: 'rc-opts' }, noRepeat.el, count.el, numMode.el, range.el), hist), { w: 460 });
  };

  // ---------- 聚光灯 ----------
  T.spotlight = function () {
    if (document.getElementById('spotlight')) return;
    const cv = h('canvas', { id: 'spotlight' });
    const ctl = h('div', { class: 'spot-ctl' },
      h('button', { onclick: () => { shape = shape === 'circle' ? 'rect' : 'circle'; draw(); } }, '◯/▭'),
      h('button', { onclick: () => { r *= 1.2; draw(); } }, '＋'),
      h('button', { onclick: () => { r /= 1.2; draw(); } }, '－'),
      h('button', { class: 'x', onclick: () => { cv.remove(); ctl.remove(); netCls({ t: 'spot', on: false }); } }, '关闭'));
    document.body.append(cv, ctl);
    let cx = innerWidth / 2, cy = innerHeight / 2, r = Math.min(innerWidth, innerHeight) * 0.18, shape = 'circle';
    const dpr = GW.perf ? Math.min(GW.perf.dpr, devicePixelRatio) : devicePixelRatio;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    const x = cv.getContext('2d');
    function draw() {
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, innerWidth, innerHeight);
      x.fillStyle = 'rgba(0,0,0,0.86)'; x.fillRect(0, 0, innerWidth, innerHeight);
      x.globalCompositeOperation = 'destination-out';
      x.beginPath();
      if (shape === 'circle') x.arc(cx, cy, r, 0, 7); else x.roundRect ? x.roundRect(cx - r * 1.6, cy - r * 0.8, r * 3.2, r * 1.6, 12) : x.rect(cx - r * 1.6, cy - r * 0.8, r * 3.2, r * 1.6);
      x.fill();
      x.globalCompositeOperation = 'source-over';
      x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 2; x.stroke();
      sync();
    }
    function sync() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight), M = Math.max(1, Math.min(W, H));
      netCls({ t: 'spot', on: true, cx: cx / W, cy: cy / H, r: r / M, shape });
    }
    draw();
    const ptrs = new Map();
    let d0 = 0, r0 = r;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; d0 = Math.hypot(a.x - b.x, a.y - b.y); r0 = r; } });
    cv.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 1) { cx += dx; cy += dy; }
      else { const [a, b] = [...ptrs.values()]; r = GW.clamp(r0 * Math.hypot(a.x - b.x, a.y - b.y) / d0, 30, innerWidth); }
      draw();
    });
    const up = (e) => ptrs.delete(e.pointerId);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { r = GW.clamp(r * Math.exp(-e.deltaY * 0.001), 30, innerWidth); draw(); });
  };

  // ---------- 板中板（原「幕布」，2026-11 v1） ----------
  // 为什么拆四层：老实现是一整块红竖纹 div —— 换不了纸、没法「背景变淡而墨迹不变」、也没法在
  // 「笔落在板上」和「笔落到下面的画布」之间切换。四层各管一件事，互不牵连：
  //   .ct-bg   背景层：纸样/材质/底纹都画在它自己的 canvas 上。「背景不透明度」只改**这一层**的
  //            opacity，所以 0% 时墨迹仍然实心 —— 这是「只作用于背景层」的实现方式。
  //   .ct-ink  墨迹层：板中板自己的笔迹，独立 undo/clear 栈（**不进**主画布的 GW.commit 历史，
  //            主画布的撤销栈里一条都不会多）。
  //   .ct-hit  命中层：书写态接笔；操作底板态 pointer-events:none ⇒ 事件穿透到底下的 #ink-canvas。
  //   .ct-ui   控制层：把手 / 关闭 / 工具条 / 设置面板。穿透态也留 pointer-events:auto 的白名单，
  //            否则一切到穿透就再也拉不动、关不掉了。
  // 「拉开幕布」只改 #curtain 的高度；纸与墨迹画在**视口大小**的 canvas 上，多出来的部分被
  // .ct-clip 裁掉 ⇒ 是裁切（clip），不是把内容压扁（scale）。
  // 选项表来源：src/core/app.js:3145-3149（BG_COLORS）、app.js:3153（BG_MATERIALS）、
  // app.js:3167（BG_PATTERNS）。那三张表在 app.js 里是模块内 const、没有导出，这里按同名同值
  // 复制一份；app.js 改颜色/材质/底纹时这里要跟着改（不改会两边菜单长得不一样）。
  const BOARD_COLORS = [
    ['white', '白板', '#ffffff'], ['paper', '米黄', '#fbf8f1'], ['green', '黑板绿', '#1f3b30'], ['black', '纯黑', '#000000'], ['blue', '深蓝', '#13284a'],
    ['sand', '柔沙', '#f3ede2'], ['mint', '护眼绿', '#e8efe6'], ['mist', '雾蓝', '#e9eef5'], ['dusk', '柔暗', '#23272e'], ['flint', '磨砂灰', '#2b3036'],
    ['slate', '雾霭灰', '#383d44'], ['clay', '羊皮纸', '#f0e6d6'],
  ];
  const BOARD_MATERIALS = [['plain', '无'], ['grain', '磨砂'], ['glow', '柔光'], ['grad', '渐变']];
  const BOARD_PATTERNS = [['none', '无'], ['grid', '方格'], ['coord', '坐标纸'], ['dots', '点阵'], ['lines', '横线'], ['tian', '田字格']];
  // 渐变纸直接用 board.js 的导出（board.js:1324  GW.BG_STYLES = BG_STYLES），不另抄一份配色
  const BOARD_BG_DEF = { style: 'curtain', color: 'green', material: 'plain', pattern: 'none', alpha: 1 };
  const BOARD_INK_MAX = 80;    // 同步给对端最多 80 条笔迹：字段有上限，别让一条 cls 消息涨到几十 KB
  const BOARD_PTS_MAX = 120;   // 每条笔迹最多 120 个点，超了按步长抽样（首尾必留）
  let B = null;                // 本机当前这块板中板（同一时刻只有一块，跟老实现一致）
  let BOARD_SQ = 0;            // 出站消息的单调序号（跨多次开关也不回退：迟到消息全靠它挡）
  // 只读状态快照：探针与其它模块按它判断「现在有没有板中板、什么模式、多大」
  function boardState() {
    if (!B) return { open: false };
    // strokes 仍是条数（老调用方按数字用）；笔迹本体走 strokesList（探针/调试只读）
    return { open: true, mode: B.mode, height: B.height, y: B.height / Math.max(1, innerHeight),
      cfg: Object.assign({}, B.cfg), strokes: B.strokes.length, strokesList: B.strokes.slice(),
      pageId: B.pageId };
  }
  GW.curtainState = boardState;
  const BOARD_MEMO = new Map();// pageId → { cfg, strokes, height, mode }：同页关掉再开能恢复
  const RT = { el: null, seq: null, on: false, strokes: [], bg: null };

  // 配置规范化：所有来源（本机面板 / 联机消息）都先过这一道，坏值一律回落默认
  function boardNormBg(raw) {
    const o = { style: 'curtain', color: 'green', material: 'plain', pattern: 'none', alpha: 1 };
    if (!raw) return o;
    const styles = (GW.BG_STYLES || []).map((s) => s.id);
    if (raw.style === 'paper') o.style = 'paper';
    else if (typeof raw.style === 'string' && styles.indexOf(raw.style) >= 0) o.style = raw.style;
    if (typeof raw.color === 'string' && (/^#[0-9a-f]{6}$/i.test(raw.color) || BOARD_COLORS.some((c) => c[0] === raw.color))) o.color = raw.color;
    if (BOARD_MATERIALS.some((m) => m[0] === raw.material)) o.material = raw.material;
    if (BOARD_PATTERNS.some((p) => p[0] === raw.pattern)) o.pattern = raw.pattern;
    o.alpha = GW.clamp(raw.alpha == null ? 1 : +raw.alpha, 0, 1);
    if (!isFinite(o.alpha)) o.alpha = 1;
    return o;
  }
  // 主题色（底纹线色 / 材质明暗判据）：渐变纸与纯色都问 board.js 要，别自己按亮度猜
  function boardThemeOf(cfg) {
    if (cfg.style === 'curtain') return { fill: '#7a1f1f', line: 'rgba(255,255,255,0.10)', line2: 'rgba(255,255,255,0.22)', pen: '#ffffff' };
    const id = cfg.style === 'paper' ? cfg.color : cfg.style;
    return (GW.bgTheme && GW.bgTheme(id)) || { fill: '#1f3b30', line: 'rgba(255,255,255,0.10)', line2: 'rgba(255,255,255,0.24)', pen: '#ffffff' };
  }
  // 底纹：算法与 board.js:1575-1612 的 paintPat 同源（那边在 drawBg 闭包里、没有导出）。
  // 差别只有一处：板中板是屏幕空间、缩放恒为 1，所以格距不进 view.s 换挡 —— 但保留下面的
  // while 循环（sg 恒在 40/48，不会触发），两个地方的换挡边界以后要一起改。
  function boardPaintPattern(ctx, W, H, pat, th) {
    if (!pat || pat === 'none') return;
    let g = pat === 'lines' ? 48 : 40;
    let sg = g;
    while (sg < 15) { g *= 5; sg *= 5; }
    while (sg > 90) { g /= 5; sg /= 5; }
    const C = { line: th.line, line2: th.line2, pen: th.pen, w: 1 };
    const ox = 0, oy = 0;                       // 板中板的原点就是视口左上角，不做世界坐标偏移
    ctx.lineWidth = C.w;
    if (pat === 'grid' || pat === 'coord') {
      ctx.strokeStyle = C.line; ctx.beginPath();
      for (let x = ox; x < W; x += sg) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
      for (let y = oy; y < H; y += sg) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
      ctx.stroke();
      if (pat === 'coord') {
        const big = sg * 5, bx = 0, by = 0;
        ctx.strokeStyle = C.line2; ctx.lineWidth = C.w * 1.5; ctx.beginPath();
        for (let x = bx; x < W; x += big) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
        for (let y = by; y < H; y += big) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
        ctx.stroke();
        ctx.strokeStyle = C.pen; ctx.globalAlpha = 0.55; ctx.lineWidth = C.w * 1.5; ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.moveTo(0, 0); ctx.lineTo(0, H); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else if (pat === 'dots') {
      ctx.fillStyle = C.line2;
      const r = Math.max(1, Math.min(2.2, sg / 22));
      for (let x = ox; x < W; x += sg) for (let y = oy; y < H; y += sg) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    } else if (pat === 'lines') {
      ctx.strokeStyle = C.line2; ctx.beginPath();
      for (let y = oy; y < H; y += sg) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
      ctx.stroke();
    } else if (pat === 'tian') {
      const cell = sg * 2;
      ctx.strokeStyle = C.line2; ctx.beginPath();
      for (let x = 0; x < W; x += cell) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0; y < H; y += cell) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = C.line; ctx.beginPath();
      for (let x = sg; x < W + cell; x += cell) { ctx.moveTo(x - cell, 0); ctx.lineTo(x - cell, H); ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = sg; y < H + cell; y += cell) { ctx.moveTo(0, y - cell); ctx.lineTo(W, y - cell); ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // 背景一次画满：底（红幕 / 纯色 / 渐变纸）+ 材质 + 底纹。整块重画，不做增量
  // 有效 DPR：板中板是「屏幕空间」的一层，必须与窗口物理像素 1:1。
  // 不能用 GW.perf.dpr —— 那是档位上限（mid/lite 恒为 1），2 倍屏上整层会被拉糊，
  // 也正是旧版「只画左上 1/4」这个 bug 一直没被看见的原因。
  // 也不能只用 GW.perf.naturalDpr —— 那个值在 perf.js 加载时只取一次，
  // 拖到另一块缩放不同的显示器 / 改系统缩放 / 横竖屏翻转时都不会更新。
  // 所以这里每次重算都先问 window.devicePixelRatio（活值），naturalDpr 只当兜底。
  function boardDpr() {
    const live = window.devicePixelRatio || (GW.perf && GW.perf.naturalDpr) || 1;
    return Math.max(0.5, Math.min(4, +live || 1));
  }
  // 两个绘制入口的统一口径（教师端与 remoteCurtain 学生端共用）：
  // 先在**单位矩阵**下按整个缓冲区清屏（用 CSS 坐标清屏清不掉 2 倍屏右下 3/4），
  // 再用 width/cssWidth、height/cssHeight 把坐标系换成 CSS 像素，之后一律按 CSS 坐标画。
  function boardPrep(ctx, W, H) {
    const cv = ctx.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(cv.width / Math.max(1, W), 0, 0, cv.height / Math.max(1, H), 0, 0);
  }
  function boardPaintBg(ctx, W, H, cfg) {
    const th = boardThemeOf(cfg);
    boardPrep(ctx, W, H);
    if (cfg.style === 'curtain') {
      // 与 app.css:1142 的 repeating-linear-gradient(90deg,#7a1f1f 0 40px,#8f2626 40px 80px) 逐段同值
      ctx.fillStyle = '#8f2626'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#7a1f1f';
      for (let x = 0; x < W; x += 80) ctx.fillRect(x, 0, 40, H);
    } else if (cfg.style !== 'paper' && th.style) {
      if (GW.paintBgStyle) GW.paintBgStyle(ctx, W, H, th.style); else { ctx.fillStyle = th.fill; ctx.fillRect(0, 0, W, H); }
    } else {
      ctx.fillStyle = th.fill; ctx.fillRect(0, 0, W, H);
    }
    if (GW.paintBgMaterial) GW.paintBgMaterial(ctx, W, H, { material: cfg.material }, th);
    boardPaintPattern(ctx, W, H, cfg.pattern, th);
  }
  // ---------- 板中板的笔宽律（与 input.js:2347-2390 的 widthAt 逐项一致） ----------
  // 板中板是「屏幕空间」的一层（k 恒 1、不跟相机缩放），所以 input.js 里乘 GW.camera.s 的地方
  // 这里一律不乘。除此之外压感平滑 / 速度 EMA / 斜率钳制 / 入锋的算式逐项照抄，
  // 这样同一支笔在板中板、放映批注层、普通画布上写出来的粗细走势是同一个东西。
  const boardTs = (e) => {
    const t = e && e.timeStamp;
    return (typeof t === 'number' && isFinite(t) && t > 0) ? t : performance.now();
  };
  function boardStyleOf(s) {
    const IS = GW.inkStyle;
    if (!IS || (s && s.hl)) return null;
    return IS.of((s && s.pen) || 'gel');          // 老笔迹没有 pen ⇒ 按 gel 画（同 renderOf 回落）
  }
  function boardTipOf(sty) {
    const IS = GW.inkStyle;
    if (!IS || !sty) return { cap: 'round', tipFlat: 0, alpha: 1, grain: 0 };
    const tc = IS.tipConfig(sty.id, (GW.settings || {}).penTipCfg);
    return { cap: sty.cap || 'round', tipFlat: (+tc.penTipFlat || 0), alpha: sty.alpha || 1, grain: +sty.grain || 0 };
  }
  function boardPenState(e, isHl, cfg) {
    const IS = GW.inkStyle || null;
    const styleId = isHl ? null : ((GW.settings || {}).penInk
      || (cfg && cfg.mode === 'brush' ? 'brush'
        : (GW.settings || {}).brush === 'pencil' ? 'pencil'
          : (GW.settings || {}).brush === 'marker' ? 'marker' : 'gel'));
    const sty = (IS && styleId) ? IS.of(styleId) : null;
    const tc = IS ? IS.tipConfig(sty && sty.id, (GW.settings || {}).penTipCfg) : null;
    const baseW = isHl ? Math.max(1, +(cfg && cfg.width) || 22) : Math.max(1, +(cfg && cfg.width) || 2);
    const W = baseW * (sty ? sty.wScale : 1);
    const st = {
      sty: sty, tc: tc, W: W, baseW: baseW, isHl: !!isHl,
      entryPx: Math.max(3.5, W * (sty ? sty.entry : 2.0)),
      travelledPx: 0, vSmooth: 0, pSmooth: 0, pSeen: false, pressSeen: false, mPrev: 0, lastT: 0,
    };
    st.reset = (ev) => {
      st.pressSeen = !isHl && !!ev && ev.pointerType === 'pen' && ev.pressure > 0 && ev.pressure !== 0.5;
      st.travelledPx = 0; st.vSmooth = 0; st.pSmooth = 0; st.pSeen = false; st.mPrev = 0;
      st.lastT = boardTs(ev);
    };
    st.widthAt = (ev, dPx, dt) => {
      const ms = Math.max(1, dt);
      const pRaw = ev.pressure;
      let m;
      if (!st.pressSeen && ev.pointerType === 'pen' && pRaw > 0 && pRaw !== 0.5) st.pressSeen = true;
      const pGain = GW.clamp((+((GW.settings || {}).penPress)) || 1, 0.4, 3);
      if (st.pressSeen && pRaw > 0) {
        if (!st.pSeen) { st.pSmooth = pRaw; st.pSeen = true; }
        else st.pSmooth += (pRaw - st.pSmooth) * (1 - Math.exp(-ms / 18));
        const pEff = GW.clamp(0.5 + (st.pSmooth - 0.5) * pGain * (sty ? (sty.pressK || 1) : 1), 0.02, 1);
        m = (sty && IS) ? IS.pressureCurve(sty, pEff, tc) : (0.26 + pEff * 1.5);
      } else {
        const v = Math.min(6, dPx / ms);
        st.vSmooth += (v - st.vSmooth) * (1 - Math.exp(-ms / 39));
        m = (sty && IS) ? IS.speedW(sty, st.vSmooth, pGain)
          : GW.clamp(1.25 - st.vSmooth * 0.30 * (0.55 + 0.45 * pGain), 0.55, 1.25);
      }
      const sl = sty ? sty.slope : 0.18;
      if (st.mPrev > 0) m = GW.clamp(m, st.mPrev * (1 - sl), st.mPrev * (1 + sl));
      st.mPrev = m;
      const g = (sty && IS) ? IS.entryK(sty, st.travelledPx, st.entryPx)
        : (st.travelledPx >= st.entryPx ? 1 : 0.34 + 0.66 * (st.travelledPx / st.entryPx));
      return st.W * m * g;
    };
    return st;
  }
  // 收笔整形：与 input.js:2576-2641 同构（点列 1-2-1、宽度 1-2-1、顿笔兜底、出锋）
  function boardShapeEnd(s, pen) {
    const ws = s && s.ws, pts = s && s.pts;
    if (!ws || !pts || ws.length !== pts.length / 2) return;
    const IS = GW.inkStyle || null;
    const n = pts.length / 2;
    const smooth1 = (arr) => {
      if (arr.length < 5) return arr;
      const out = arr.slice();
      for (let i = 1; i < arr.length - 1; i++) {
        out[i * 2] = (arr[(i - 1) * 2] + 2 * arr[i * 2] + arr[(i + 1) * 2]) / 4;
        out[i * 2 + 1] = (arr[(i - 1) * 2 + 1] + 2 * arr[i * 2 + 1] + arr[(i + 1) * 2 + 1]) / 4;
      }
      return out;
    };
    if (n > 12) {
      s.pts = smooth1(pts);
      if (ws.length > 3) {
        const sw = IS ? IS.stabWeights(pen && pen.tc ? pen.tc.penStabilize : 0) : { passes: 1, center: 2 };
        for (let pass = 0; pass < sw.passes; pass++) {
          const w2 = ws.slice();
          for (let i = 1; i < ws.length - 1; i++) w2[i] = (ws[i - 1] + sw.center * ws[i] + ws[i + 1]) / (sw.center + 2);
          for (let i = 0; i < w2.length; i++) ws[i] = w2[i];
        }
      }
    }
    const P = s.pts, sty = pen && pen.sty, tc = pen && pen.tc;
    const W = pen ? pen.W : s.width, baseW = pen ? pen.baseW : s.width;
    if ((pen ? pen.travelledPx : 99) < 3) {
      const dotW = Math.min(W, (baseW || 3) * (GW.__tapCapK || 2));
      for (let i = 0; i < ws.length; i++) ws[i] = dotW;
      return;
    }
    const exitK = (sty && sty.exitLen === 0) ? 0
      : Math.max(10, W * (sty ? sty.exitLen : 3.2) * GW.clamp((+((GW.settings || {}).penExit)) || 1, 0.3, 2));
    const autoTip = !!(sty && sty.id !== 'gel' && (GW.settings || {}).penTipAuto !== false);
    const cfgPen = ((GW.settings || {}).penTipCfg || {})[sty ? sty.id : 'gel'];
    const tip = (cfgPen && cfgPen.penTip) ? cfgPen.penTip
      : (autoTip ? sty.tip : ((GW.settings && GW.settings.penTip) || 'sharp'));
    const floor = tc ? tc.tipFloor : 0.12;
    const bW = autoTip ? (sty ? sty.exitW : 0.12)
      : (tip === 'round' ? 0.58 : tip === 'flat' ? 0.86 : 0.12);
    const sharp = cfgPen ? (+cfgPen.penTipSharp || 0) : 0;
    const tipW = Math.max(floor, Math.min(1, bW - sharp * (bW - floor)));
    let acc = 0;
    for (let i = ws.length - 1; i > 0; i--) {
      const k = exitK > 0 ? Math.min(1, acc / exitK) : 1;
      let t = tip === 'sharp' ? Math.pow(k, 0.72) : k;
      if (tip === 'back') t = 0.25 + 0.75 * Math.pow(k, 0.72);
      else if (tip === 'flatEnd') t = Math.min(1, 0.15 + 1.35 * k);
      const target = W * (tipW + (1 - tipW) * t);
      ws[i] = cfgPen ? Math.min(ws[i], Math.max(target, ws[i] * (1 - 0.5 * (1 - t))))
        : Math.min(ws[i], target);
      acc += Math.hypot(P[i * 2] - P[i * 2 - 2], P[i * 2 + 1] - P[i * 2 - 1]);
      if (acc > exitK) break;
    }
  }
  // 一笔：与主画布同一套几何 —— 有宽度数组（ws）就走 board.js 的 curveOutline 填充轮廓
  // （放多大都不出折线边、有压感宽窄变化），没有 ws 的老笔迹 / 学生端同步过来的笔迹
  // 仍走中点二次贝塞尔描边（等宽）。荧光笔按 0.38 半透明，颗粒笔在轮廓内打孔。
  function boardDrawStroke(ctx, s) {
    const pts = s && s.pts, n = pts ? pts.length / 2 : 0;
    if (!n) return;
    const sty = boardStyleOf(s), tip = boardTipOf(sty);
    const W = Math.max(0.5, +s.width || 2);
    const ws = (s.ws && s.ws.length === n) ? s.ws : null;
    ctx.save();
    ctx.globalAlpha = (s.hl ? 0.38 : 1) * (sty ? tip.alpha : 1);
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = W;
    if (n === 1) { ctx.beginPath(); ctx.arc(pts[0], pts[1], Math.max(0.6, W / 2), 0, 7); ctx.fill(); ctx.restore(); return; }
    if (n === 2) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]); ctx.stroke(); ctx.restore(); return; }
    const paths = GW.paths;
    let path = null;
    if (ws && paths && typeof paths.curveOutline === 'function') {
      try { path = paths.curveOutline(pts, ws, 1, W, tip.cap, tip.tipFlat); } catch (_) { path = null; }
    }
    if (path) {
      ctx.fill(path);
      // 颗粒笔：轮廓内打孔（口径同 board.js:1086-1103）。学生端拿到的是无 pen 字段的笔迹 ⇒ gr=0。
      if (tip.grain > 0 && typeof paths.grainPath === 'function') {
        let gp = null;
        try { gp = paths.grainPath(s, W, tip.grain); } catch (_) { gp = null; }
        if (gp) {
          ctx.save();
          ctx.clip(path);
          ctx.globalCompositeOperation = 'destination-out';
          if (ctx.globalCompositeOperation === 'destination-out') {
            ctx.globalAlpha = Math.min(0.85, 0.42 + 0.45 * tip.grain);
            ctx.fill(gp);
          }
          ctx.restore();
        }
      }
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n - 1; i++) {
      const mx = (pts[2 * i] + pts[2 * i + 2]) / 2, my = (pts[2 * i + 1] + pts[2 * i + 3]) / 2;
      ctx.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], mx, my);
    }
    ctx.quadraticCurveTo(pts[2 * n - 4], pts[2 * n - 3], pts[2 * n - 2], pts[2 * n - 1]);
    ctx.stroke();
    ctx.restore();
  }
  function boardDrawInk(ctx, W, H, strokes, live, ring) {
    boardPrep(ctx, W, H);
    for (let i = 0; i < strokes.length; i++) boardDrawStroke(ctx, strokes[i]);
    if (live && live.pts.length) boardDrawStroke(ctx, live);
    // 橡皮的落点圈：只在按住拖动期间画，抬手后整层重画会把圈擦掉（不落进笔迹）
    if (ring) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, 7); ctx.stroke(); ctx.restore(); }
  }
  // 帧合并：拖把手 / 拖滑块 / 落笔都会高频触发，统一在下一帧刷一次
  function boardSched(what) {
    if (!B) return;
    B.need[what] = true;
    if (!B.raf) B.raf = requestAnimationFrame(boardFlush);
  }
  function boardBgKey() { return [B.W, B.H, B.dpr, B.cfg.style, B.cfg.color, B.cfg.material, B.cfg.pattern].join('|'); }
  function boardFlush() {
    if (!B) return;
    B.raf = 0;
    if (B.need.height) {
      B.need.height = false;
      B.el.style.height = Math.round(B.height) + 'px';
      // 满高 / 接近满高时把手挂在幕布下沿会跑到视口外（bottom:-26px），
      // 交给 CSS 把它抬到底栏之上；这个类只影响把手位置，不改任何几何。
      B.el.classList.toggle('ct-full', B.height >= B.H - 12);
    }
    if (B.need.bg) {
      B.need.bg = false;
      const key = boardBgKey();
      // 背景缓存：尺寸 / DPR / 配置任何一项变了才重画（红竖纹全屏刷一遍也要几百条 fillRect）
      if (B.bgKey !== key) { B.bgKey = key; boardPaintBg(B.ctxBg, B.W, B.H, B.cfg); }
      B.bgEl.style.opacity = String(B.cfg.alpha);
    }
    if (B.need.ink) { B.need.ink = false; boardDrawInk(B.ctxInk, B.W, B.H, B.strokes, B.live, B.ring); }
  }
  function boardResize() {
    if (!B) return;
    const dpr = boardDpr();
    B.dpr = dpr; B.W = Math.max(1, innerWidth); B.H = Math.max(1, innerHeight);
    for (const cv of [B.bgEl, B.inkEl]) {
      const w = Math.round(B.W * dpr), hh = Math.round(B.H * dpr);
      if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
      cv.style.width = B.W + 'px'; cv.style.height = B.H + 'px';
    }
    // 变换由 boardPrep 在每次重画时按「缓冲区 / CSS 尺寸」现算，这里不再预设 dpr 矩阵
    B.bgKey = '';                     // 尺寸/DPR 变了，背景缓存作废
    B.height = GW.clamp(B.height, 60, B.H);
    B.need.bg = B.need.ink = B.need.height = true;
    boardFlush();
  }
  function boardSetHeight(px, fromUser) {
    if (!B) return;
    B.height = GW.clamp(px, 60, Math.max(60, innerHeight));
    boardSched('height');
    if (fromUser) boardSend(false);   // 高度同步沿用老字段 on/y，老端照样能显示红幕布
  }
  function boardSetMode(m) {
    if (!B) return;
    B.mode = m === 'through' ? 'through' : 'write';
    B.el.classList.toggle('ct-write', B.mode === 'write');
    B.el.classList.toggle('ct-through', B.mode === 'through');
    if (B.modeSeg) B.modeSeg.set(B.mode);
    if (B.hint) B.hint.textContent = B.mode === 'write' ? '笔落在板中板' : '操作底板（事件穿透）';
    B.need.ink = true; boardFlush();
    boardSend(false);
  }
  function boardSetBg(patch) {
    if (!B) return;
    B.cfg = boardNormBg(Object.assign({}, B.cfg, patch || {}));
    // 不透明度是纯合成属性，立刻写到样式上。拖滑块时每一帧都要跟手，
    // 而且「背景层 0% 但墨迹 100%」这种状态必须当场就能被测到，不能等下一帧。
    B.bgEl.style.opacity = String(B.cfg.alpha);
    boardSched('bg');
    if (B.syncCtl) B.syncCtl();
    boardSend(false);
  }
  function boardUndo() {
    if (!B || !B.undo.length) return;
    const op = B.undo.pop();
    if (op.t === 'add') { if (B.strokes.length && B.strokes[B.strokes.length - 1] === op.s) B.strokes.pop(); else { const i = B.strokes.indexOf(op.s); if (i >= 0) B.strokes.splice(i, 1); } }
    else if (op.t === 'erase') { for (let i = op.items.length - 1; i >= 0; i--) B.strokes.splice(op.items[i].i, 0, op.items[i].s); }
    else if (op.t === 'clear') { B.strokes = op.items.slice(); }
    B.need.ink = true; boardFlush(); B.dirty = true; boardSend(false); boardSendInkSoon();
  }
  function boardClear() {
    if (!B) return;
    if (!B.strokes.length) { GW.toast && GW.toast('板中板上还没有笔迹', 1400); return; }
    B.undo.push({ t: 'clear', items: B.strokes.slice() });
    B.strokes = [];
    B.need.ink = true; boardFlush(); B.dirty = true; boardSend(false); boardSendInkSoon();
  }
  // 还原幕布样式：只回背景配置与不透明度，**不动笔迹**（清笔迹有单独的「清空」）
  function boardReset() {
    if (!B) return;
    B.cfg = boardNormBg(BOARD_BG_DEF);
    B.bgEl.style.opacity = String(B.cfg.alpha);   // 还原也要把合成不透明度写回去
    boardSched('bg');
    if (B.syncCtl) B.syncCtl();
    boardSend(false);
    GW.toast && GW.toast('已还原幕布样式', 1400);
  }
  function boardInkSnapshot() {
    const out = [];
    const list = B.strokes.slice(-BOARD_INK_MAX);
    for (const s of list) {
      const n = s.pts.length / 2;
      let p = s.pts;
      if (n > BOARD_PTS_MAX) {
        const step = Math.ceil(n / BOARD_PTS_MAX), cp = [];
        for (let i = 0; i < n - 1; i += step) { cp.push(Math.round(p[2 * i]), Math.round(p[2 * i + 1])); }
        cp.push(Math.round(p[2 * n - 2]), Math.round(p[2 * n - 1]));
        p = cp;
      } else { p = p.map((v) => Math.round(v)); }
      // 2.2.9：笔种与宽度数组一起带过去（**增量字段**，老端不认就忽略，仍按等宽画）。
      // 没有 ws 的笔迹（荧光笔 / 老数据）不带这两个键，消息体积与以前一致。
      const o = { c: String(s.color).slice(0, 32), w: Math.round(s.width * 10) / 10, h: s.hl ? 1 : 0, p: p };
      if (s.pen) o.k = String(s.pen).slice(0, 16);
      if (s.ws && s.ws.length === n) {
        const stepW = Math.max(1, Math.ceil(n / Math.max(1, p.length / 2)));
        const ws = [];
        for (let i = 0; i < p.length / 2; i++) ws.push(Math.round((s.ws[Math.min(n - 1, i * stepW)] || s.width) * 10) / 10);
        o.ws = ws;
      }
      out.push(o);
    }
    return out;
  }
  // 出站消息：**冗余携带**老端认识的 {t:'curtain',on,y}（旧版本对端照样能显示红幕布），
  // 新版字段全部挂在 v:2 下面，老端不认识就忽略。sq 是单调序号，用来挡住迟到消息。
  function boardMsg(full) {
    if (!B) return null;
    const m = {
      t: 'curtain', on: true, y: +GW.clamp(B.height / Math.max(1, innerHeight), 0, 1).toFixed(4),
      v: 2, sq: ++BOARD_SQ, mode: B.mode, pageId: B.pageId,
      bg: { s: B.cfg.style, c: B.cfg.color, m: B.cfg.material, p: B.cfg.pattern, a: Math.round(B.cfg.alpha * 100) / 100 },
    };
    if (full) m.ink = boardInkSnapshot();
    return m;
  }
  function boardSend(full) {
    if (!B) return;
    const m = boardMsg(full);
    if (m) { netCls(m); B.lastAt = Date.now(); if (full) B.dirty = false; }
  }
  // 笔迹同步：不逐点发（250Hz 的手写笔会把通道灌满），也不等下一次心跳（学生最多要干等 2s）。
  // 折中 —— 改完笔迹后 350ms 补一条**带整份快照**的消息；连续落笔会被这 350ms 合并成一条。
  // 上限自然由「一次只发一份快照」+ boardInkSnapshot 的条数/点数裁剪共同保证。
  function boardSendInkSoon() {
    if (!B || B.inkTimer) return;
    B.inkTimer = setTimeout(() => {
      if (!B) return;
      B.inkTimer = 0;
      if (B.dirty) boardSend(true);
    }, 350);
  }
  function boardClose(reason) {
    if (!B) return;
    const b = B;
    B = null;
    // 正在拖把手时被关掉（按钮 / 换页 / 拉到底）：把这次拖动的监听与 capture 一起收掉
    if (b.dragCleanup) { try { b.dragCleanup(); } catch (_) {} b.dragCleanup = null; }
    b.memo = { cfg: b.cfg, strokes: b.strokes.slice(), height: b.height, mode: b.mode };
    if (b.pageId) BOARD_MEMO.set(b.pageId, b.memo);
    try { if (b.timer) clearInterval(b.timer); } catch (_) {}
    try { if (b.inkTimer) clearTimeout(b.inkTimer); } catch (_) {}
    if (b.raf) { try { cancelAnimationFrame(b.raf); } catch (_) {} b.raf = 0; }
    window.removeEventListener('resize', boardResize);
    window.removeEventListener('blur', boardBlur);
    window.removeEventListener('offline', boardOffline);
    if (b.onTool) GW.bus.off('tool', b.onTool);
    b.el.remove();
    // 关闭也要带上序号：比它更早的在途消息不许把这一层复活
    const seq = ++BOARD_SQ;
    netCls({ t: 'curtain', on: false, v: 2, sq: seq, pageId: b.pageId });
    if (reason === 'page') { /* 换页时连远端那一块也一起清掉，见下面 GW.bus.on('page') */ }
  }
  function boardBlur() { if (B && B.live) { B.live = null; B.need.ink = true; boardFlush(); } }
  function boardOffline() { if (B && B.live) { B.live = null; B.need.ink = true; boardFlush(); } }

  // 设置面板：只影响**当前这块**板中板（不动 page.bg，也不广播页面背景命令）
  function boardPanel() {
    if (!B) return;
    if (B.panel) { B.panel.classList.toggle('on'); return; }
    const box = h('div', { class: 'ct-panel' });
    // 控件一律**只改状态**：刷新统一走 boardSetBg/boardReset 里那一次 B.syncCtl()。
    // （旧版每个 onclick 后面又补一次 paintSel()，一次点击刷两遍，且还原/程序化改背景时不刷。）
    const sw = h('div', { class: 'ct-sw' }, h('button', {
      class: 'ct-def', title: '默认红竖纹幕布',
      onclick: () => boardSetBg({ style: 'curtain', color: 'green' }),
    }, '默认幕布'));
    for (const [id, label, hex] of BOARD_COLORS) {
      sw.append(h('button', {
        class: 'ct-dot', title: label, 'data-k': 'c:' + id, 'data-hex': hex,
        style: { background: hex },
        onclick: () => boardSetBg({ style: 'paper', color: id }),
      }));
    }
    // 自定义颜色：与 app.js:3189 的底色选择同一套写法（input[type=color].bg-pick），
    // 但只写板中板这一层的 cfg.color，不动 page.bg，也不广播页面背景。
    const pick = h('input', {
      type: 'color', class: 'bg-pick', title: '自定义幕布底色（点方块选颜色）',
      value: /^#[0-9a-f]{6}$/i.test(String(B.cfg.color || '')) ? B.cfg.color : (GW.settings && GW.settings.customBg) || '#7aa2c8',
    });
    pick.addEventListener('input', () => {
      const c = String(pick.value || '');
      if (!/^#[0-9a-f]{6}$/i.test(c)) return;
      boardSetBg({ style: 'paper', color: c });
    });
    sw.append(h('label', { class: 'ct-picklab', title: '自定义幕布底色' }, pick));
    const styles = h('div', { class: 'ct-styles' }, (GW.BG_STYLES || []).map((st) => h('button', {
      class: 'ct-sty', title: st.name, 'data-k': 's:' + st.id,
      style: { background: boardStyleCss(st) },
      onclick: () => boardSetBg({ style: st.id }),
    })));
    const mat = GW.ui.segmented({
      options: BOARD_MATERIALS.map(([v, l]) => ({ value: v, label: l })), value: B.cfg.material,
      onChange: (v) => boardSetBg({ material: v }),
    });
    const pat = GW.ui.segmented({
      options: BOARD_PATTERNS.map(([v, l]) => ({ value: v, label: l })), value: B.cfg.pattern,
      onChange: (v) => boardSetBg({ pattern: v }),
    });
    const alpha = GW.ui.slider({
      label: '背景不透明度', min: 0, max: 100, step: 1, value: Math.round(B.cfg.alpha * 100), unit: '%',
      onInput: (v) => boardSetBg({ alpha: v / 100 }),
    });
    const paintSel = () => {
      box.querySelectorAll('.ct-dot').forEach((n) => n.classList.toggle('on', n.dataset.k === 'c:' + B.cfg.color && B.cfg.style === 'paper'));
      box.querySelectorAll('.ct-sty').forEach((n) => n.classList.toggle('on', n.dataset.k === 's:' + B.cfg.style));
      box.querySelector('.ct-def').classList.toggle('on', B.cfg.style === 'curtain');
      mat.set(B.cfg.material); pat.set(B.cfg.pattern);
      // 滑块也要回到当前值：还原、程序化 setBg、对端同步之后它不能停在旧数字上
      alpha.set(Math.round(B.cfg.alpha * 100));
      const pc = /^#[0-9a-f]{6}$/i.test(String(B.cfg.color || '')) ? B.cfg.color : null;
      if (pc) pick.value = pc;
      pick.classList.toggle('on', !!pc && B.cfg.style === 'paper');
    };
    box.append(
      h('div', { class: 'ct-p-t' }, '背景纸样'),
      sw,
      styles,
      h('div', { class: 'ct-p-t' }, '材质'),
      mat.el,
      h('div', { class: 'ct-p-t' }, '底纹'),
      pat.el,
      alpha.el,
      h('div', { class: 'ct-p-t' }, '提示'),
      h('div', { class: 'ct-p-tip' }, '背景不透明度只作用于背景层，墨迹不受影响；0% 时板是透明的但仍可书写。')
    );
    B.el.querySelector('.ct-ui').append(box);
    B.panel = box; B.syncCtl = paintSel;
    paintSel();
    box.classList.add('on');
  }
  // 渐变纸缩略图：与 app.js:3162 的 styleCss 同一套拼法（画布上也是同一份数据画出来的）
  function boardStyleCss(st) {
    const base = (st.stops || []).map((s) => s[1] + ' ' + Math.round(s[0] * 100) + '%').join(', ');
    const blobs = (st.blobs || []).map((b) => 'radial-gradient(circle at ' + Math.round(b[0] * 100) + '% ' + Math.round(b[1] * 100) + '%, ' + b[3] + ', transparent 62%)').join(', ');
    return (blobs ? blobs + ', ' : '') + 'linear-gradient(' + (st.ang || 160) + 'deg, ' + base + ')';
  }

  // 对外入口（设置面板 / 探针 / 以后浮球菜单都能用）：只转发，不自己存状态
  GW.boardPanel = {
    open: () => T.curtain(),
    close: () => boardClose('user'),
    state: boardState,
    setBg: (patch) => boardSetBg(patch),
    setMode: (m) => boardSetMode(m),
    setHeight: (px) => boardSetHeight(px, false),
    undo: () => boardUndo(),
    clear: () => boardClear(),
    reset: () => boardReset(),
    inkCount: () => (B ? B.strokes.length : 0),
    // 只读：出站笔迹快照（探针核对「对端能不能拿到 ws / 笔种」用，不参与同步流程）
    __snapshot: () => (B ? boardInkSnapshot() : []),
  };

  T.curtain = function () {
    if (document.getElementById('curtain')) return boardState();
    const page = GW.page ? GW.page() : null;
    const pageId = (page && page.id) || '';
    // 同页关掉再开：把上一次的内存状态接回来（只在会话内，不落盘、不进 .gewu）
    const memo = BOARD_MEMO.get(pageId) || null;
    const bgEl = h('canvas', { class: 'ct-bg' });
    const inkEl = h('canvas', { class: 'ct-ink' });
    const clip = h('div', { class: 'ct-clip' }, bgEl, inkEl);
    const hit = h('div', { class: 'ct-hit' });
    const handle = h('div', { class: 'ct-handle' }, h('i'), h('span', null, '拖动拉开幕布'));
    const close = h('button', { class: 'ct-x', html: GW.icon('close'), title: '关闭板中板（本页可在会话内恢复）' });
    const modeSeg = GW.ui.segmented({
      options: [{ value: 'write', label: '在板中板书写' }, { value: 'through', label: '操作底板' }],
      value: (memo && memo.mode) || 'write',
      onChange: (v) => boardSetMode(v),
    });
    modeSeg.el.classList.add('ct-mode');
    const hint = h('span', { class: 'ct-hint' }, '笔落在板中板');
    const bar = h('div', { class: 'ct-bar' },
      h('span', { class: 'ct-title' }, '板中板'),
      hint,
      modeSeg.el,
      h('button', { class: 'ct-btn', title: '背景 / 纸张 / 底纹 / 不透明度', html: GW.icon('bg') + '<i>背景</i>', onclick: () => boardPanel() }),
      h('button', { class: 'ct-btn', title: '撤销板中板上的一笔', html: GW.icon('undo') + '<i>撤销</i>', onclick: () => boardUndo() }),
      h('button', { class: 'ct-btn', title: '清空板中板笔迹', html: GW.icon('trash') + '<i>清空</i>', onclick: () => boardClear() }),
      h('button', { class: 'ct-btn', title: '还原幕布样式', html: GW.icon('refresh') + '<i>还原</i>', onclick: () => boardReset() })
    );
    const ui = h('div', { class: 'ct-ui' }, bar, handle, close);
    const cur = h('div', { id: 'curtain', class: 'ct-v2 ct-write' }, clip, hit, ui);
    document.body.append(cur);

    const dpr = boardDpr();
    B = {
      el: cur, clip: clip, bgEl: bgEl, inkEl: inkEl, hit: hit, ui: ui,
      ctxBg: bgEl.getContext('2d'), ctxInk: inkEl.getContext('2d'),
      cfg: boardNormBg(memo && memo.cfg), strokes: (memo && memo.strokes ? memo.strokes.slice() : []),
      undo: [], live: null, ring: null, mode: (memo && memo.mode) || 'write',
      height: (memo && memo.height) || innerHeight, pageId: pageId,
      dpr: dpr, W: 0, H: 0, bgKey: '', raf: 0, need: { bg: true, ink: true, height: true },
      ptr: null, timer: 0, inkTimer: 0, dirty: true, panel: null, syncCtl: null, modeSeg: modeSeg, hint: hint, onTool: null,
      dragCleanup: null,
    };
    boardResize();
    cur.classList.toggle('ct-write', B.mode === 'write');
    cur.classList.toggle('ct-through', B.mode === 'through');
    boardSetMode(B.mode);

    // ---- 书写 / 擦除（只落在板中板墨迹层上，不进主画布历史） ----
    // 指针坐标 = 客户端坐标 - **绘制层自己的视口原点**。背景/墨迹 canvas 贴在 .ct-clip 里，
    // 与根节点不一定同原点（根节点还有 box-shadow、把手伸出幕布下沿），
    // 直接拿 #curtain 的矩形去减，右/下角会差几像素。
    const localXY = (e) => {
      const r = bgEl.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    // 板中板书写：与画布/批注层同一套笔宽律 —— 采样时逐点算 ws（压感/速度/入锋/斜率钳制），
    // 抬手走 boardShapeEnd 做 1-2-1 整形与出锋。以前这里是等宽描边，所以同一支笔在板中板上
    // 写出来的粗细是死的（用户反馈「板中板书写和画布不一样」）。
    let pen = null, lastX = 0, lastY = 0;
    // ---------- 笔尖预测线（与 input.js:2402-2451 / pptx.js 同一套口径） ----------
    // 画布那条线画在 #pen-pred（#stage 里、z-index 8）上——板中板是 z-index 37 的一层，
    // 压在上面，所以这里挂自己的元素、放进 .ct-ui（层级在 .ct-ink 之上）。
    const predEl = h('div', { class: 'ct-pred' });
    B.ctPred = predEl;
    ui.append(predEl);
    const hidePred = () => { if (predEl.style.display !== 'none') predEl.style.display = 'none'; };
    const drawPred = (bx, by) => {
      if (!pen || !B.live || !B.live.pts) { hidePred(); return; }
      const P = B.live.pts, n = P.length / 2;
      if (n < 2) { hidePred(); return; }
      // 起点取**已经画到**的地方：末端点（curveOutline 要等下一个点才画得出最后一段）
      const ax = P[2 * (n - 1)], ay = P[2 * (n - 1) + 1];
      const dx = bx - ax, dy = by - ay, L0 = Math.hypot(dx, dy);
      if (!(L0 > 0.5)) { hidePred(); return; }
      const wNow = (B.live.ws && B.live.ws.length) ? B.live.ws[B.live.ws.length - 1] : B.live.width;
      const hh = Math.max(1, wNow);
      const ux = dx / L0, uy = dy / L0, ov = 2;
      predEl.style.display = 'block';
      predEl.style.width = (L0 + ov).toFixed(1) + 'px';
      predEl.style.height = hh.toFixed(1) + 'px';
      predEl.style.background = (GW.inkFix && B.live.color) ? GW.inkFix(B.live.color) : (B.live.color || '#fff');
      predEl.style.transform = 'translate3d(' + (ax - ux * ov).toFixed(1) + 'px,'
        + (ay - uy * ov - hh / 2).toFixed(1) + 'px,0) rotate(' + Math.atan2(dy, dx).toFixed(4) + 'rad)';
    };
    const beginStroke = (e) => {
      const t = GW.tool.current;
      const p = localXY(e);
      if (t === 'eraser') { eraseAt(p.x, p.y); return; }
      const isHl = t === 'hl';
      const cfg = isHl ? GW.tool.hl : GW.tool.pen;
      pen = boardPenState(e, isHl, cfg);
      pen.reset(e);
      const s = { pts: [p.x, p.y], color: cfg.color, width: isHl ? cfg.width : Math.max(1, cfg.width), hl: isHl };
      if (!isHl) { s.pen = (pen.sty && pen.sty.id) || 'gel'; s.ws = [pen.widthAt(e, 0, 1)]; }
      lastX = p.x; lastY = p.y;
      B.live = s;
      hidePred();
      const prof = (GW.pen && GW.pen.profile) ? GW.pen.profile() : null;
      B.predOn = !isHl && !!prof && prof.predict > 0;
      B.need.ink = true; boardSched('ink');
    };
    const extendStroke = (e) => {
      const p = localXY(e);
      if (GW.tool.current === 'eraser') { eraseAt(p.x, p.y); return; }
      if (!B.live) return;
      const q = B.live.pts, n = q.length / 2;
      const lx = q[2 * n - 2], ly = q[2 * n - 1];
      if (Math.abs(p.x - lx) + Math.abs(p.y - ly) < 1.1) return;   // 同像素重复点不存，省内存也省同步体积
      const d = Math.hypot(p.x - lastX, p.y - lastY);
      const now = boardTs(e);
      if (pen) pen.travelledPx += d;
      q.push(p.x, p.y);
      if (pen && B.live.ws) B.live.ws.push(pen.widthAt(e, d, now - pen.lastT));
      lastX = p.x; lastY = p.y;
      if (pen) pen.lastT = now;
      // 笔尖预测：只在设备真支持时开（prof.predict：只有红外屏是 8，其余 0 ⇒ 零开销）。
      if (B.predOn) {
        let pe = null;
        if ((GW.settings || {}).inkPredict !== false && e.getPredictedEvents) pe = e.getPredictedEvents();
        if (pe && pe.length) {
          const q = pe[pe.length - 1];
          const r = bgEl.getBoundingClientRect();
          drawPred(q.clientX - r.left, q.clientY - r.top);
        } else hidePred();
      }
      B.need.ink = true; boardSched('ink');
    };
    const endStroke = () => {
      if (B.live) {
        if (B.live.pts.length >= 2) {
          const s = B.live;
          if (s.ws) {
            while (s.ws.length < s.pts.length / 2) s.ws.push(s.ws[s.ws.length - 1] || s.width);
            s.ws.length = s.pts.length / 2;
            if (pen) boardShapeEnd(s, pen);
          }
          B.strokes.push(s);
          B.undo.push({ t: 'add', s: s });
          B.dirty = true;
        }
        B.live = null; pen = null; B.predOn = false; hidePred(); B.need.ink = true; boardSched('ink');
        boardSend(false);       // 收笔先发一条轻的（高度/模式），笔迹等 350ms 合并后再发
        boardSendInkSoon();
      }
      B.ring = null; B.need.ink = true; boardSched('ink');
    };
    const eraseAt = (x, y) => {
      if (!B) return;
      const r = Math.max(8, (GW.tool.eraser.size || 36) / 2);
      const removed = [];
      for (let i = B.strokes.length - 1; i >= 0; i--) {
        const s = B.strokes[i], q = s.pts;
        for (let k = 0; k < q.length; k += 2) {
          if (Math.hypot(q[k] - x, q[k + 1] - y) <= r + s.width / 2) { removed.push({ i: i, s: s }); B.strokes.splice(i, 1); break; }
        }
      }
      if (removed.length) {
        removed.sort((a, b) => a.i - b.i);
        B.undo.push({ t: 'erase', items: removed });
        B.dirty = true;
      }
      B.ring = { x: x, y: y, r: r }; B.need.ink = true; boardSched('ink');
      if (removed.length) { boardSend(false); boardSendInkSoon(); }
    };
    const writeTool = () => { const t = GW.tool.current; return t === 'pen' || t === 'hl' || t === 'eraser'; };
    // 书写态只接管笔 / 荧光笔 / 橡皮这三种。选了图形、文字、选区时把命中层让开，
    // 事件继续落到下面的 #ink-canvas —— 板中板不该「因为盖在顶上就把整个画布锁死」。
    const syncHit = () => { if (B) B.hit.classList.toggle('ct-pass', !writeTool()); };
    const onTool = () => syncHit();
    B.onTool = onTool;
    GW.bus.on('tool', onTool);
    syncHit();
    hit.addEventListener('pointerdown', (e) => {
      if (!B || B.mode !== 'write' || e.button > 0) return;
      if (!writeTool()) return;                 // 图形/文字/选区不属于板中板：不接管，也就不会误吃到底板手势
      e.preventDefault();
      try { hit.setPointerCapture(e.pointerId); } catch (err) { /* 指针已失效就算了，下面照样能画 */ }
      B.ptr = e.pointerId;
      beginStroke(e);
    });
    hit.addEventListener('pointermove', (e) => {
      if (!B || B.ptr !== e.pointerId) return;
      extendStroke(e);
    });
    const stopWrite = (e) => {
      if (!B || (B.ptr != null && e && e.pointerId !== B.ptr)) return;
      B.ptr = null;
      endStroke();
    };
    hit.addEventListener('pointerup', stopWrite);
    hit.addEventListener('pointercancel', stopWrite);
    hit.addEventListener('lostpointercapture', stopWrite);

    // ---- 关闭 / 把手 ----
    close.onclick = () => boardClose('user');
    handle.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.stopPropagation(); e.preventDefault();
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* 同上 */ }
      const sy = e.clientY, h0 = B.height, id = e.pointerId;
      const mv = (ev) => {
        if (!B || ev.pointerId !== id) return;
        boardSetHeight(h0 + (ev.clientY - sy), true);
      };
      // 一次拖动只持有三个监听 + 一个 capture。抬手 / 指针被取消 / 捕获丢失 /
      // 窗口失焦 / 换页 / 关闭，六条路径都收敛到同一个 up()，绝不残留。
      const up = () => {
        handle.removeEventListener('pointermove', mv);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        handle.removeEventListener('lostpointercapture', up);
        window.removeEventListener('blur', up, true);
        if (B && B.dragCleanup === up) B.dragCleanup = null;
        try { handle.releasePointerCapture(id); } catch (err) { /* 已经释放过 */ }
        if (B && B.height < 80) boardClose('drag');  // 与老行为一致：拉到顶就等于收起
      };
      if (B) B.dragCleanup = up;
      handle.addEventListener('pointermove', mv);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
      handle.addEventListener('lostpointercapture', up);
      window.addEventListener('blur', up, true);
    });

    // ---- 生命周期：窗口变化 / 失焦 / 断线都要释放 capture 与监听 ----
    window.addEventListener('resize', boardResize);
    window.addEventListener('blur', boardBlur);
    window.addEventListener('offline', boardOffline);
    // 心跳：重连后对端（学生）可能整块状态都没了，光靠「状态变了才发」拿不回来。
    // 每 2s 补一条（只带背景与高度），每第 3 条带一次完整笔迹 —— 字段与频率都有上限。
    let beat = 0;
    B.timer = setInterval(() => {
      if (!B) return;
      beat++;
      boardSend(B.dirty || beat % 3 === 0);
    }, 2000);
    boardSend(true);
    return boardState();
  };


  // ---------- 放大镜 ----------
  T.magnifier = function () {
    if (document.getElementById('magnifier')) return;
    const size = 320, zoom = 2.2;
    // 放大镜是「拖动时逐帧重画」的工具，像素比跟随渲染档位，弱机上更跟手
    const mdpr = GW.perf ? Math.min(GW.perf.dpr, devicePixelRatio) : devicePixelRatio;
    const cv = h('canvas', { width: size * mdpr, height: size * mdpr });
    const lens = h('div', { id: 'magnifier' }, cv, h('button', { class: 'mg-x', html: GW.icon('close'), onclick: () => { lens.remove(); alive = false; } }));
    document.body.append(lens);
    let lx = innerWidth / 2 - size / 2, ly = innerHeight / 2 - size / 2, alive = true, shot = null, busy = false;
    const place = () => { lens.style.left = lx + 'px'; lens.style.top = ly + 'px'; };
    place();
    const ctx = cv.getContext('2d');
    async function grab() {
      if (busy || !alive) return;
      busy = true;
      // 先按能力取整屏（桌面 / 安卓外壳 / 支持 getDisplayMedia 的浏览器），拿不到就退回画布合成。
      // 放大镜只要看画布，不是「区域截图」那种必须整屏的功能，所以这里降级不需要打扰用户。
      lens.style.visibility = 'hidden';
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      let url = await grabScreen({});
      if (!url) url = await grabDisplayOnce();
      lens.style.visibility = '';
      if (url) {
        try { const img = new Image(); img.src = url; await img.decode(); shot = img; }
        catch (e) { shot = null; }
      }
      if (!shot) shot = composeViewport();
      busy = false;
      render();
    }
    function render() {
      if (!shot) return;
      const k = shot.width / innerWidth, cx = lx + size / 2, cy = ly + size / 2, src = size / zoom;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(shot, (cx - src / 2) * k, (cy - src / 2) * k, src * k, src * k, 0, 0, cv.width, cv.height);
    }
    grab();
    lens.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      lens.setPointerCapture(e.pointerId);
      const sx = e.clientX - lx, sy = e.clientY - ly;
      const mv = (ev) => { lx = ev.clientX - sx; ly = ev.clientY - sy; place(); render(); };
      const up = () => { lens.removeEventListener('pointermove', mv); lens.removeEventListener('pointerup', up); grab(); };
      lens.addEventListener('pointermove', mv); lens.addEventListener('pointerup', up);
    });
  };

  // ---------- 取屏：三端能力探测（桌面 / 安卓外壳 / 浏览器等价） ----------
  // 判「函数在不在」比判 GW.isElectron 准：网页版的 window.gewu 是一堆空实现，
  // capturePage / captureScreen 的名字都在但恒返回 null，所以**必须拿返回值判**，不能只看 typeof。
  // 安卓外壳（mobile/shim.js）只挂 window.gewuNative，它目前没有 capturePage —— 这里探测它，
  // 将来内核补上了就自动走通，不用再改这里。
  async function grabScreen(opts) {
    const w = window.gewu, n = window.gewuNative;
    if (w && typeof w.captureScreen === 'function') {
      try { const u = await w.captureScreen({ hideMain: !!(opts && opts.desktop) }); if (u) return u; } catch (e) { /* 下一路 */ }
    }
    if (w && typeof w.capturePage === 'function') {
      try { const u = await w.capturePage(); if (u) return u; } catch (e) { /* 下一路 */ }
    }
    if (n && typeof n.capturePage === 'function') {
      try { const u = await n.capturePage(); if (u) return u; } catch (e) { /* 下一路 */ }
    }
    return null;
  }

  // 浏览器等价物之一：整屏/窗口捕获。安卓 WebView 与多数嵌入式浏览器没有它，拿不到就返回 null。
  async function grabDisplayOnce() {
    const md = navigator.mediaDevices;
    if (!md || typeof md.getDisplayMedia !== 'function') return null;
    let stream = null;
    try {
      stream = await md.getDisplayMedia({ video: true, audio: false });
      const v = document.createElement('video');
      v.muted = true; v.srcObject = stream;
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout')), 3000);
        v.onloadedmetadata = () => { clearTimeout(t); res(); };
        v.onerror = () => { clearTimeout(t); rej(new Error('video')); };
        if (v.play) v.play().catch(() => {});
      });
      // 有的实现 loadedmetadata 时首帧还没解码出来，等一小会儿再抽帧，否则得到纯黑图
      await new Promise((r) => setTimeout(r, 120));
      const cw = v.videoWidth, ch = v.videoHeight;
      if (!cw || !ch) return null;
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      c.getContext('2d').drawImage(v, 0, 0, cw, ch);
      return c.toDataURL('image/png');
    } catch (e) {
      return null;
    } finally {
      if (stream) { try { stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* noop */ } }
    }
  }

  // 浏览器等价物之二：视口合成。只拿画布（放大镜本来就只用来看画布；区域截图在拿不到整屏时也是能用的降级）。
  function composeViewport() {
    const bg = document.getElementById('bg-canvas'), ink = document.getElementById('ink-canvas');
    if (!bg && !ink) return null;
    const k = window.devicePixelRatio || 1;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(innerWidth * k)); c.height = Math.max(1, Math.round(innerHeight * k));
    const x = c.getContext('2d');
    for (const id of ['bg-canvas', 'ink-canvas']) {
      const cv = document.getElementById(id);
      if (!cv) continue;
      // 画布位图比视口大一圈（预渲染区），只抠视口那一块，否则导出图会多出边角
      if (!(GW.blitViewport && GW.blitViewport(x, cv, 0, 0, c.width, c.height))) x.drawImage(cv, 0, 0);
    }
    return c;
  }

  // ---------- 科学计算器 ----------
  T.calculator = function () {
    let deg = true, ans = 0;
    const expr = h('input', { class: 'calc-in', placeholder: '例如 sqrt(2)*sin(30)+ln(e)' });
    const out = h('div', { class: 'calc-out' }, '0');
    const histEl = h('div', { class: 'calc-hist' });
    const mode = GW.ui.segmented({ options: [{ value: 'deg', label: '角度 DEG' }, { value: 'rad', label: '弧度 RAD' }], value: 'deg', onChange: (v) => { deg = v === 'deg'; calc(true); } });
    function calc(quiet) {
      let s = expr.value.trim();
      if (!s) { out.textContent = '0'; return; }
      try {
        s = s.replace(/ans/gi, '(' + ans + ')').replace(/(\d+(?:\.\d+)?)!/g, (m, n) => '(' + fact(+n) + ')').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
        const f = GW.compileExpr(s, []);
        // 角度制：求值期间临时替换三角函数（同步执行，结束后立即还原）
        const M = Math, keep = { sin: M.sin, cos: M.cos, tan: M.tan, asin: M.asin, acos: M.acos, atan: M.atan };
        let v;
        if (deg) {
          const D = Math.PI / 180;
          // 让 sin30°、cos60°、tan45° 这类特殊角得到精确值
          const fix = (x) => (Math.abs(x - Math.round(x)) < 1e-12 ? Math.round(x) : x);
          M.sin = (x) => fix(keep.sin(x * D)); M.cos = (x) => fix(keep.cos(x * D)); M.tan = (x) => (((x % 180) + 180) % 180 === 90 ? NaN : fix(keep.tan(x * D)));
          M.asin = (x) => keep.asin(x) / D; M.acos = (x) => keep.acos(x) / D; M.atan = (x) => keep.atan(x) / D;
        }
        try { v = f(); } finally { Object.assign(M, keep); }
        const r = Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(12);
        out.textContent = '= ' + r;
        if (!quiet) { ans = r; histEl.prepend(h('div', { onclick: () => { expr.value = s; calc(true); } }, h('span', null, expr.value), h('b', null, String(r)))); }
      } catch (e) { out.textContent = quiet ? '…' : '表达式有误'; }
    }
    const fact = (n) => { if (n > 170 || n < 0 || n % 1) return NaN; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
    expr.addEventListener('input', () => calc(true));
    expr.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') calc(false); });
    const keys = ['sin(', 'cos(', 'tan(', 'π', '(', ')', 'asin(', 'acos(', 'atan(', 'e', '^', '√(', 'ln(', 'lg(', 'x²', '!', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', 'ans', '+', 'C', '⌫', '='];
    const pad = h('div', { class: 'calc-pad' }, keys.map((k) => h('button', { class: /^[0-9.]$/.test(k) ? 'num' : k === '=' ? 'eq' : '', onclick: () => {
      if (k === 'C') expr.value = '';
      else if (k === '⌫') expr.value = expr.value.slice(0, -1);
      else if (k === '=') return calc(false);
      else expr.value += { 'π': 'pi', '√(': 'sqrt(', 'x²': '^2', '÷': '/', '×': '*', '−': '-' }[k] || k;
      calc(true);
    } }, k)));
    GW.float('科学计算器', h('div', { class: 'calc' }, mode.el, expr, out, pad, histEl), { w: 400, cls: 'calc-wrap' });
    setTimeout(() => expr.focus(), 50);
  };

  // ---------- 区域截图（屏幕任意区域 → 插入当前页） ----------
  T.screenshot = async function (opts = {}) {
    // 三路能力探测：桌面（captureScreen/capturePage）→ 安卓外壳（gewuNative.capturePage）→
    // 浏览器等价（getDisplayMedia）。都拿不到才降级成「只截画布」，并把降级说明写在选框提示条上 ——
    // 以前这里对非 Electron 直接 toast「浏览器版暂不支持截屏」然后没了，安卓端等于功能被吞掉。
    let img = null, degraded = false;
    const url = await grabScreen({ desktop: !!opts.desktop });
    if (url) {
      try { img = new Image(); img.src = url; await img.decode(); }
      catch (e) { img = null; }
    }
    if (!img) {
      const u2 = await grabDisplayOnce();
      if (u2) {
        try { img = new Image(); img.src = u2; await img.decode(); }
        catch (e) { img = null; }
      }
    }
    if (!img) { img = composeViewport(); degraded = !!img; }
    if (!img) {
      GW.dialog({
        title: '这台设备不支持区域截图',
        body: h('p', { class: 'muted' }, '当前环境既没有系统级截屏接口，浏览器也不允许捕获屏幕（' +
          '安卓 WebView、以及没有授权屏幕共享的浏览器都属于这种情况）。' +
          '可以改用课堂工具里的「把选中内容存成图片」，它离屏重画选区，效果和截图一样，且不依赖系统权限。'),
        ok: '知道了',
      });
      return;
    }
    const ov = h('div', { id: 'snap-ov' });
    const cv = h('canvas');
    const tip = h('div', { class: 'snap-tip' }, degraded
      ? '本机不能捕获整屏，只能截画布：拖动框选要保存的区域 · 双击截取整屏 · Esc 取消'
      : '拖动框选区域 · 双击截取全屏 · Esc 取消');
    ov.append(cv, tip);
    document.body.append(ov);
    const dpr = devicePixelRatio;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    const x = cv.getContext('2d');
    let r = null;
    const draw = () => {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.drawImage(img, 0, 0, cv.width, cv.height);
      x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, 0, cv.width, cv.height);
      if (r) {
        const a = norm(r);
        x.drawImage(img, (a.x * img.width) / innerWidth, (a.y * img.height) / innerHeight, (a.w * img.width) / innerWidth, (a.h * img.height) / innerHeight, a.x * dpr, a.y * dpr, a.w * dpr, a.h * dpr);
        x.strokeStyle = '#2fd3b9'; x.lineWidth = 2 * dpr; x.strokeRect(a.x * dpr, a.y * dpr, a.w * dpr, a.h * dpr);
      }
    };
    const norm = (q) => ({ x: Math.min(q.x0, q.x1), y: Math.min(q.y0, q.y1), w: Math.abs(q.x1 - q.x0), h: Math.abs(q.y1 - q.y0) });
    draw();
    const finish = (a) => {
      ov.remove(); removeEventListener('keydown', esc, true);
      if (!a) return;
      const c = document.createElement('canvas');
      const kx = img.width / innerWidth, ky = img.height / innerHeight;
      c.width = Math.round(a.w * kx); c.height = Math.round(a.h * ky);
      c.getContext('2d').drawImage(img, a.x * kx, a.y * ky, a.w * kx, a.h * ky, 0, 0, c.width, c.height);
      // 来源水印：截图会被贴进课件、发到群里，也会被拿去当「商品图」，所以落在右下角（见 core/build.js）
      if (GW.watermarkCanvas) GW.watermarkCanvas(c);
      const shot = c.toDataURL('image/png');
      const it = GW.importer.insertDataURL(shot, '截图');
      // 1.3.0（R7）：截图同时进「复用架」（方案里「原件复用 / 截图件，两个都可以」）。
      // 存 dataUrl：换页、换文件、重启都还能贴回来；配额满时 shelf 自己会降级。
      if (GW.shelf) { try { GW.shelf.add([], { kind: 'image', dataUrl: shot, title: '截图' }); } catch (e) { /* 存不下不影响插入 */ } }
      return it;
    };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(null); } };
    addEventListener('keydown', esc, true);
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); r = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }; });
    cv.addEventListener('pointermove', (e) => { if (r && e.buttons) { r.x1 = e.clientX; r.y1 = e.clientY; draw(); } });
    cv.addEventListener('pointerup', () => { if (r) { const a = norm(r); if (a.w > 10 && a.h > 10) finish(a); } });
    cv.addEventListener('dblclick', () => finish({ x: 0, y: 0, w: innerWidth, h: innerHeight }));
  };

  // ---------- 把选中的内容存成图片（1.7.1 T06） ----------
  // 不截屏：屏幕上有工具栏、选区虚线框与鼠标红点，视口外的部分也截不到。
  // 做法是离屏重画一遍，用的是与主画布**同一个** GW.drawItem —— 线宽、字号、模板分段、
  // 坐标轴这些细节跟屏幕上完全一致；自己拿 pts 再画一遍必然会走样。
  GW.captureSelection = function () {
    const items = ((GW.selection && GW.selection.items) || []).slice();
    if (!items.length) { GW.toast('先选中要存成图片的内容', 2200); return null; }
    let b = GW.selection.bounds();
    if (!b || !(b.w > 0) || !(b.h > 0)) { GW.toast('选中的内容没有可截图的尺寸', 2400); return null; }
    const cs = GW.camera.s || 1;
    // 对象卡片的标题栏挂在盒子正上方（displayBounds 里的 up = 46/s），不补进来会被裁掉半行标题
    if (items.some((it) => it.kind === 'obj')) b = { x: b.x, y: b.y - 46 / cs, w: b.w, h: b.h + 46 / cs };
    const pad = 8 / cs;                                   // 外扩 8 屏幕像素
    const x = b.x - pad, y = b.y - pad, w = b.w + pad * 2, h = b.h + pad * 2;
    const k = Math.min(3, Math.max(1, cs));               // 输出清晰度跟当前缩放，最多 3 倍
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    const oldS = GW.camera.s;
    try {
      // drawItem 读模块级 view.s 做「屏幕上不足 1px 别细成灰线」的兜底；离屏这一遍按 1:1 世界单位画，
      // 不临时归一的话当前缩放 0.5× 时字与线宽会比屏幕上小一半（放大时反之更粗）。
      GW.camera.s = 1;
      g.setTransform(k, 0, 0, k, -x * k, -y * k);
      for (const it of items) { if (it.kind === 'obj') drawCard(g, it); else GW.drawItem(g, it); }
    } finally {
      GW.camera.s = oldS;                                 // 相机是全局对象，必须原地还原
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    // 落到视口右下：宽度不超过视口 1/3，留 24px 边
    const vr = GW.viewRect();
    const tw = Math.max(24, Math.min(cv.width / k, vr.w * 0.34));
    const th = tw * (cv.height / cv.width);
    const m = 24 / cs;
    const at = { x: vr.x + vr.w - tw - m, y: vr.y + vr.h - th - m, w: tw };
    const b64 = cv.toDataURL('image/png').split(',')[1];
    const it = GW.importer && GW.importer.insertImageB64
      ? GW.importer.insertImageB64(b64, 'image/png', '选中内容', at)
      : null;
    GW.toast('已把选中的内容存成图片（插在视口右下）', 2600);
    return it;
  };

  // 对象是 DOM 卡片，drawItem 不认识它们。离屏这一遍按「白底卡片 + 已加载的缩略图 / 标题」画个近似，
  // 免得选区里有卡片时截图里出现一个空洞。
  function drawCard(g, o) {
    g.save();
    g.fillStyle = '#fff'; g.strokeStyle = 'rgba(15,23,42,.18)'; g.lineWidth = 1;
    g.beginPath(); g.rect(o.x, o.y, o.w, o.h); g.fill(); g.stroke();
    const thumb = o._thumb;
    if (thumb && thumb.naturalWidth) {
      try { g.drawImage(thumb, o.x, o.y, o.w, o.h); } catch (e) { /* 没加载完就留白底 */ }
    } else {
      const t = o._title ? String(o._title.textContent || '') : String((o.data && (o.data.name || o.data.title)) || '');
      if (t) {
        const fs = Math.max(10, Math.min(30, o.h * 0.22));
        g.fillStyle = '#1b2433'; g.font = '600 ' + fs + 'px "Microsoft YaHei", sans-serif';
        g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText(t, o.x + 8, o.y + 8, Math.max(10, o.w - 16));
      }
    }
    g.restore();
  }

  // ---------- 小组计分板 ----------
  T.scoreboard = function () {
    const COLORS = ['#e4572e', '#3366ff', '#0f9d8a', '#f2a541', '#8e5cd9', '#e2559a'];
    let groups = [1, 2, 3, 4].map((i) => ({ name: '第' + '一二三四五六'[i - 1] + '组', score: 0 }));
    const wrap = h('div', { class: 'sb' });
    function draw() {
      wrap.innerHTML = '';
      const max = Math.max(1, ...groups.map((g) => g.score));
      groups.forEach((g, i) => {
        const name = h('input', { value: g.name, class: 'sb-name', onchange: (e) => (g.name = e.target.value), onkeydown: (e) => e.stopPropagation() });
        wrap.append(h('div', { class: 'sb-col', style: { '--c': COLORS[i % COLORS.length] } },
          h('div', { class: 'sb-score' }, g.score),
          h('div', { class: 'sb-bar' }, h('i', { style: { height: (g.score / max) * 100 + '%' } })),
          name,
          h('div', { class: 'sb-btns' }, h('button', { onclick: () => { g.score = Math.max(0, g.score - 1); draw(); } }, '−1'), h('button', { class: 'up', onclick: () => { g.score++; beep(880, 0.08); draw(); } }, '+1'))));
      });
    }
    draw();
    const ctl = h('div', { class: 'gw-row' },
      GW.ui.button({ label: '+ 小组', onClick: () => { if (groups.length < 6) { groups.push({ name: '第' + '一二三四五六'[groups.length] + '组', score: 0 }); draw(); } } }).el,
      GW.ui.button({ label: '− 小组', onClick: () => { if (groups.length > 2) { groups.pop(); draw(); } } }).el,
      GW.ui.button({ label: '清零', onClick: () => { groups.forEach((g) => (g.score = 0)); draw(); } }).el);
    GW.float('小组计分', h('div', null, wrap, ctl), { w: 560 });
  };

  // ---------- 物理常量与公式速查（点击插入画布） ----------
  const CONSTS = [
    ['万有引力常量', 'G=6.67\\times10^{-11}\\ \\mathrm{N\\cdot m^2/kg^2}'],
    ['重力加速度', 'g=9.8\\ \\mathrm{m/s^2}'],
    ['静电力常量', 'k=9.0\\times10^{9}\\ \\mathrm{N\\cdot m^2/C^2}'],
    ['元电荷', 'e=1.60\\times10^{-19}\\ \\mathrm{C}'],
    ['电子质量', 'm_e=9.1\\times10^{-31}\\ \\mathrm{kg}'],
    ['质子质量', 'm_p=1.67\\times10^{-27}\\ \\mathrm{kg}'],
    ['真空光速', 'c=3.0\\times10^{8}\\ \\mathrm{m/s}'],
    ['普朗克常量', 'h=6.63\\times10^{-34}\\ \\mathrm{J\\cdot s}'],
    ['阿伏加德罗常数', 'N_A=6.02\\times10^{23}\\ \\mathrm{mol^{-1}}'],
    ['电子伏特', '1\\ \\mathrm{eV}=1.60\\times10^{-19}\\ \\mathrm{J}'],
    ['原子质量单位', '1\\ \\mathrm{u}=1.66\\times10^{-27}\\ \\mathrm{kg}\\approx931.5\\ \\mathrm{MeV}/c^2'],
    ['地球半径', 'R=6.4\\times10^{6}\\ \\mathrm{m}'],
    ['地球质量', 'M=6.0\\times10^{24}\\ \\mathrm{kg}'],
    ['第一宇宙速度', 'v_1=7.9\\ \\mathrm{km/s}'],
    ['第二宇宙速度', 'v_2=11.2\\ \\mathrm{km/s}'],
    ['第三宇宙速度', 'v_3=16.7\\ \\mathrm{km/s}'],
    ['玻尔兹曼常量', 'k_B=1.38\\times10^{-23}\\ \\mathrm{J/K}'],
    ['摩尔气体常量', 'R=8.31\\ \\mathrm{J/(mol\\cdot K)}'],
    ['氢原子基态能量', 'E_1=-13.6\\ \\mathrm{eV}'],
    ['真空介电常量', '\\varepsilon_0=8.85\\times10^{-12}\\ \\mathrm{F/m}'],
  ];
  // ---------- 远端课堂效果（1.1.15）：只画、不响应指针 ----------
  function remoteSpot(m) {
    let cv = document.getElementById('spot-remote');
    if (!m.on) { if (cv) cv.remove(); return; }
    const dpr = GW.perf ? Math.min(GW.perf.dpr, window.devicePixelRatio || 1) : (window.devicePixelRatio || 1);
    if (!cv) { cv = h('canvas', { id: 'spot-remote' }); document.body.append(cv); }
    if (cv.width !== Math.round(innerWidth * dpr) || cv.height !== Math.round(innerHeight * dpr)) { cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); }
    const x = cv.getContext('2d');
    const M = Math.min(innerWidth, innerHeight);
    const cx = GW.clamp(m.cx == null ? 0.5 : m.cx, 0, 1) * innerWidth;
    const cy = GW.clamp(m.cy == null ? 0.5 : m.cy, 0, 1) * innerHeight;
    const r = Math.max(20, (m.r == null ? 0.18 : m.r) * M);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, innerWidth, innerHeight);
    x.fillStyle = 'rgba(0,0,0,0.86)';
    x.fillRect(0, 0, innerWidth, innerHeight);
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    if (m.shape === 'rect') { if (x.roundRect) x.roundRect(cx - r * 1.6, cy - r * 0.8, r * 3.2, r * 1.6, 12); else x.rect(cx - r * 1.6, cy - r * 0.8, r * 3.2, r * 1.6); }
    else x.arc(cx, cy, r, 0, 7);
    x.fill();
    x.globalCompositeOperation = 'source-over';
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 2; x.stroke();
  }
  function remoteTimer(m) {
    let box = document.getElementById('timer-remote');
    if (!m.on) { if (box) box.remove(); return; }
    if (!box) { box = h('div', { id: 'timer-remote', class: 'tr-chip' }); document.body.append(box); }
    const v = Math.max(0, m.left || 0);
    const txt = m.mode === 'up' ? fmtT(v, true) : fmtT(v + (v > 0 ? 999 : 0), false);
    box.textContent = (m.mode === 'up' ? '⏱ ' : '⏳ ') + txt + (m.running ? '' : ' · 暂停');
    box.classList.toggle('warn', m.mode === 'down' && v <= 10000 && v > 0);
    box.classList.toggle('done', m.mode === 'down' && v <= 0);
  }
  // 学生端：只读。老老师端发来的消息只有 {t:'curtain',on,y} ⇒ 走红竖纹原样显示（与 1.1.15 一致）；
  // 新版老师端会带 v:2（背景/不透明度/模式）与 ink（笔迹快照），这里增量升级成同一套四层外观。
  // 迟到消息判据用 sq（发送端单调递增）：收到的序号比本端记住的旧就整条丢掉 ——
  // 否则一条还在路上的旧 on:true 会把已经关掉的层复活。
  function remoteCurtain(m) {
    // 页不匹配直接丢：换页时 RT.seq 会被清空，光靠 sq 挡不住「上一页的 on:true 在路上」，
    // 那条消息会在新的一页上凭空开出一块旧幕布。
    const pg = GW.page ? GW.page() : null;
    if (m.pageId && pg && m.pageId !== pg.id) return;
    let cur = document.getElementById('curtain-remote');
    const sq = m.sq == null ? null : +m.sq;
    if (sq != null && RT.seq != null && sq < RT.seq) return;   // 迟到：丢掉，绝不复活
    if (sq != null) RT.seq = sq;
    if (!m.on) {
      if (cur) cur.remove();
      RT.el = null; RT.on = false; RT.strokes = []; RT.bg = null;
      return;
    }
    if (!cur) {
      RT.el = null;
      cur = h('div', { id: 'curtain-remote' });
      document.body.append(cur);
    }
    RT.on = true;
    cur.style.height = Math.round(GW.clamp(m.y == null ? 1 : m.y, 0, 1) * innerHeight) + 'px';
    // 老端（v<2）：保持 1.1.15 的样子，一个字都不用改。若之前是 v2 画出来的，
    // 把子 canvas 清掉，让 CSS 里的红竖纹重新露出来（否则会盖着一块旧的纸）。
    if (m.v !== 2) {
      if (RT.el) { cur.textContent = ''; cur.classList.remove('ct-remote-v2'); RT.el = null; RT.strokes = []; }
      return;
    }
    if (!RT.el) {
      // v2：远端那块用 canvas 画背景 + 笔迹。z-index/pointer-events 仍由 #curtain-remote 的 CSS 管
      cur.textContent = '';
      cur.classList.add('ct-remote-v2');
      const bgc = h('canvas', { class: 'ct-r-bg' });
      const inkc = h('canvas', { class: 'ct-r-ink' });
      cur.append(bgc, inkc);
      RT.el = { bg: bgc, ink: inkc, ctxBg: bgc.getContext('2d'), ctxInk: inkc.getContext('2d'), key: '' };
    }
    // 与学生端同一口径：位图 = CSS 尺寸 × 有效 DPR，变换由 boardPrep 每帧现算
    const dpr = boardDpr();
    const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
    for (const cv of [RT.el.bg, RT.el.ink]) {
      const w = Math.round(W * dpr), hh = Math.round(H * dpr);
      if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
    }
    const cfg = boardNormBg(m.bg ? { style: m.bg.s, color: m.bg.c, material: m.bg.m, pattern: m.bg.p, alpha: m.bg.a } : null);
    RT.bg = cfg;
    const key = [W, H, dpr, cfg.style, cfg.color, cfg.material, cfg.pattern].join('|');
    if (RT.el.key !== key) { RT.el.key = key; boardPaintBg(RT.el.ctxBg, W, H, cfg); }
    if (RT.el.bg) RT.el.bg.style.opacity = String(cfg.alpha);
    // 笔迹：整份快照覆盖（只读端不做增量，避免「少画一条」这种慢性不一致）
    if (m.ink && m.ink.length !== undefined) {
      RT.strokes = m.ink.slice(0, BOARD_INK_MAX).map((s) => {
        const pts = Array.isArray(s.p) ? s.p.slice(0, BOARD_PTS_MAX * 2) : [];
        const o = {
          color: String(s.c || '#1b2433').slice(0, 32), width: GW.clamp(+(s.w || 2), 0.5, 80),
          hl: !!s.h, pts: pts,
        };
        if (s.k) o.pen = String(s.k).slice(0, 16);          // 笔种：决定宽度律/端帽/颗粒
        if (Array.isArray(s.ws) && s.ws.length === pts.length / 2) o.ws = s.ws.map((v) => GW.clamp(+v || 2, 0.2, 200));
        return o;
      });
    }
    boardDrawInk(RT.el.ctxInk, W, H, RT.strokes, null, null);
  }
  // 远端那块也要跟着窗口改尺寸：不重算的话横竖屏一转，纸与笔迹就被 CSS 拉伸（不是等比缩放）
  window.addEventListener('resize', () => {
    if (!RT.on || !RT.el) return;
    RT.el.key = '';
    const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
    const dpr = boardDpr();
    for (const cv of [RT.el.bg, RT.el.ink]) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    const cfg = RT.bg || boardNormBg(null);
    boardPaintBg(RT.el.ctxBg, W, H, cfg);
    boardDrawInk(RT.el.ctxInk, W, H, RT.strokes, null, null);
  });
  T.remote = function (m) {
    if (!m || !m.t) return;
    if (m.t === 'spot') return remoteSpot(m);
    if (m.t === 'curtain') return remoteCurtain(m);
    if (m.t === 'timer') return remoteTimer(m);
  };
  GW.remoteClass = T.remote;
  // 换页 / 关闭协同：把远端效果清掉，别在两端的下一页上留一块黑影。
  // 板中板还多一件事：它是**绑定当前激活页**的，换页必须把本机那块也收掉（状态留在 BOARD_MEMO 里，
  // 换回来再点一次就能接着写）。否则会出现「人已经在第 5 页，屏幕上还盖着第 3 页的板」。
  GW.bus.on('page', () => {
    const a = document.getElementById('spot-remote'), b = document.getElementById('curtain-remote');
    if (a) a.remove();
    if (b) b.remove();
    RT.el = null; RT.on = false; RT.strokes = []; RT.bg = null; RT.seq = null;
    if (B) boardClose('page');
  });

  T.constants = function () {
    const list = h('div', { class: 'const-list' }, CONSTS.map(([n, tex]) => {
      const f = h('div', { class: 'cl-tex' });
      try { window.katex.render(tex, f, { throwOnError: false }); } catch (_) { f.textContent = tex; }
      return h('button', { class: 'cl-item', title: '点击插入到画布', onclick: () => {
        const tmp = h('div', { style: { position: 'absolute', visibility: 'hidden', fontSize: '40px' } });
        document.body.append(tmp); window.katex.render(tex, tmp, { displayMode: true, throwOnError: false });
        const w = tmp.scrollWidth + 20, hh = tmp.scrollHeight + 10; tmp.remove();
        GW.objects.create('formula', { tex, color: GW.isDarkBg() ? '#ffffff' : '#1b2433' }, { w: w / GW.camera.s, h: hh / GW.camera.s, exact: true, offset: Math.random() * 40 / GW.camera.s });
      } }, h('span', null, n), f);
    }));
    GW.float('物理常量（点击插入）', list, { w: 520, x: innerWidth - 560, y: 70, cls: 'tall' });
  };
})();
