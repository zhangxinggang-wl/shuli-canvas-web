/* 数理无限画布 · 1.1.14 透明批注层（index.html?overlay=1）
   ------------------------------------------------------------------
   主进程开一个「全屏 + 透明 + 置顶」的无边框窗口加载同一个 index.html，加上 ?overlay=1。
   所以画布的所有功能（书写、荧光笔、激光、橡皮、图形、学科模板、尺规、仿真、对象、撤销、
   网格、四角 UI、底部工具栏、悬浮球）在这里**全都原样可用**，以后新加的功能也自动继承 ——
   不需要为批注层再维护一份界面。

   本文件只负责「这一层怎么用」这四件事：
     1) 身份：GW.overlayMode = true，让 board.js 不画纸、storage.js 不接管文档、app.js 不弹欢迎页；
     2) 顶部一条控制胶囊：笔 / 橡皮 / 撤销 / 清屏 / 格线 / 界面 / 鼠标模式 / 发送到画布 / 保存 / 退出；
     3) 鼠标模式（窗口穿透）的界面状态同步 —— 真正的 setIgnoreMouseEvents 在主进程，
        系统级快捷键 Ctrl+Alt+D 也在主进程注册（穿透时窗口收不到焦点，只能靠全局键回来）；
     4) 退出/保留：把四层画布合成一张透明 PNG，或存到「图片\数理无限画布批注\」，或直接插回画布。
   它刻意**不**接管文档：没有自动保存、不改 .gewu、不写 localStorage 的板书键。
*/
(function () {
  'use strict';
  const GW = window.GW;
  const IS_OVERLAY = /[?&]overlay=1(?:&|$)/.test(location.search);
  // 这个标记必须在 board.js / storage.js / app.js 之前就位（本文件在 index.html 里排在它们前面）
  GW.overlayMode = IS_OVERLAY;

  const h = (...a) => GW.h(...a);
  const W = () => window.gewu && window.gewu.overlay;
  let bar = null;
  let passOn = false;

  // ---------- 合成快照：四层画布叠成一张透明 PNG ----------
  // 四层（bg / ink / ann / live）共用同一套相机变换，但位图比视口大一圈（预渲染区），
  // 所以只抠「视口那一块」叠，否则存下来的批注四周会多出一圈。
  function snapshot() {
    const els = ['bg-canvas', 'ink-canvas', 'ann-canvas', 'live-canvas']
      .map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return null;
    const ink = document.getElementById('ink-canvas') || els[0];
    const g = (GW.canvasGeom && GW.canvasGeom()) || null;
    const w = Math.max(1, Math.round((g && g.w) || ink.clientWidth || innerWidth));
    const hh = Math.max(1, Math.round((g && g.h) || ink.clientHeight || innerHeight));
    const k = Math.min(2, Math.max(1, (ink.width || w) / (g ? (g.bw || w) : w)));
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * k);
    cv.height = Math.round(hh * k);
    const c = cv.getContext('2d');
    for (const el of els) {
      if (el.style.display === 'none') continue;
      try {
        if (!(GW.blitViewport && GW.blitViewport(c, el, 0, 0, cv.width, cv.height))) c.drawImage(el, 0, 0, cv.width, cv.height);
      } catch (e) { /* 单层失败不影响其它层 */ }
    }
    return cv.toDataURL('image/png');
  }

  // 发到画布时要垫一层「和墨色反差最大」的底。
  // 为什么需要：批注层存下来的 PNG 是透明的（底色就是桌面），里面通常只有一笔深色板书。
  // 直接插进深色板书页面（defaultBg 常见是 flint）里，深色墨迹压在深色底上等于没写，
  // 老师看到的就是「一张空白透明的图」。所以发到画布前先按墨色亮度选白底/深底压成不透明。
  async function flattenForBoard(dataURL) {
    const im = new Image();
    im.src = dataURL;
    try { await im.decode(); } catch (e) { return dataURL; }
    const w = im.width, h = im.height;
    if (!w || !h) return dataURL;
    // 缩到 96×54 采样：够看出墨色深浅，又不用碰整张图几百万像素
    const probe = document.createElement('canvas');
    probe.width = 96; probe.height = 54;
    const pc = probe.getContext('2d');
    pc.drawImage(im, 0, 0, 96, 54);
    const d = pc.getImageData(0, 0, 96, 54).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      if (a < 0.1) continue;
      sum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * a;
      n += a;
    }
    const luma = n > 0 ? sum / n : 0;   // 0~255
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    c.fillStyle = luma > 153 ? '#12161d' : '#ffffff';   // 亮墨（白/荧光）垫深底，暗墨垫白底
    c.fillRect(0, 0, w, h);
    c.drawImage(im, 0, 0);
    return cv.toDataURL('image/png');
  }

  // 发到画布 / 存图时用的「带桌面」合成：先请主进程把批注层与切换键藏一下抓一张当前屏幕，
  // 再把批注叠上去 —— 老师拿到的就是「桌面上写了字」的样子，而不是一张孤零零的透明图。
  async function shotWithDesktop(inkURL) {
    let base = null;
    try { base = W() && W().desktopShot ? await W().desktopShot() : null; } catch (e) { base = null; }
    if (!base) return flattenForBoard(inkURL);   // 拿不到屏幕（非桌面版/权限问题）就退回垫底色
    const load = (u) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; });
    let b, k;
    try { b = await load(base); k = await load(inkURL); } catch (e) { return flattenForBoard(inkURL); }
    if (!b.width || !b.height) return flattenForBoard(inkURL);
    const cv = document.createElement('canvas');
    cv.width = b.width; cv.height = b.height;
    const c = cv.getContext('2d');
    c.drawImage(b, 0, 0);
    // 批注层内部是 CSS 像素，桌面截图是设备像素：按桌面尺寸等比铺满，笔迹才落在原位置
    c.drawImage(k, 0, 0, b.width, b.height);
    return cv.toDataURL('image/png');
  }

  // 页面里的东西分两处存：笔迹与图形在 ink[]，卡片/图片/仿真在 objs[]（见 board.js newPage）
  function itemCount() {
    try {
      const p = GW.page();
      if (!p) return 0;
      return (p.ink ? p.ink.length : 0) + (p.objs ? p.objs.length : 0);
    } catch (e) { return 0; }
  }

  // ---------- 鼠标模式（窗口穿透） ----------
  function setPass(on) {
    passOn = !!on;
    if (W()) W().pass(passOn);
    paintPass();
  }
  function paintPass() {
    // 穿透态下整层都点不动，胶囊留在屏幕上只会「看着像能点」——所以直接收起来，
    // 让屏幕上只剩主进程那个永不穿透的切换键（overlay-chip.html）。这是 1.1.14 教室反馈的核心。
    document.body.classList.toggle('overlay-pass', passOn);
    if (!bar) return;
    const b = bar.querySelector('[data-act="pass"]');
    if (!b) return;
    b.setAttribute('aria-pressed', passOn ? 'true' : 'false');
    b.querySelector('.ab-tx').textContent = passOn ? '回批注' : '切桌面';
    const dot = bar.querySelector('.ab-dot');
    if (dot) dot.classList.toggle('off', passOn);
  }

  // ---------- 格线：无 / 方格 / 点阵 / 横线 ----------
  const PATT = [
    ['none', '格线:关'],
    ['grid', '方格'],
    ['dots', '点阵'],
    ['lines', '横线'],
  ];
  function curPat() {
    const bg = GW.page() && GW.page().bg;
    const i = PATT.findIndex((p) => p[0] === (bg && bg.pattern));
    return i < 0 ? 9 : i;
  }
  function cyclePat() {
    const bg = GW.page().bg;
    const i = Math.max(0, curPat());
    const next = PATT[(i + 1) % PATT.length];
    bg.pattern = next[0];
    if (next[0] !== 'none') bg.color = bg.color || 'none';
    GW.requestRender();
    paintPat();
    GW.toast('格线：' + (next[0] === 'none' ? '关' : next[1]), 1200);
  }
  function paintPat() {
    if (!bar) return;
    const b = bar.querySelector('[data-act="grid"]');
    if (!b) return;
    const i = curPat();
    b.setAttribute('aria-pressed', i > 0 && i < 9 ? 'true' : 'false');
    b.querySelector('.ab-tx').textContent = i > 0 && i < 9 ? PATT[i][1] : '格线';
  }

  // ---------- 退出 ----------
  const closeWin = () => { if (W()) (W().confirmClose ? W().confirmClose() : W().close()); };

  function finish(kind) {
    const png = snapshot();
    if (!png) { closeWin(); return; }
    if (kind === 'save') {
      // 存图也要带着桌面：老师存下来的应该是「截图」，不是一张只有笔迹的透明图
      shotWithDesktop(png).then((shot) => W().save(shot)).then((r) => {
        if (r && r.ok) {
          GW.toast('已保存：' + r.path, 2600);
          setTimeout(closeWin, 1500);
        } else {
          GW.toast('保存失败：' + ((r && r.error) || '未知原因'), 3000);
        }
      }).catch(closeWin);
      return;
    }
    if (kind === 'canvas') {
      // 先垫桌面再发：老师要的是「桌面上写了字」那一屏，插到画布里还能当证据讲
      shotWithDesktop(png).then((fl) => W().toCanvas(fl)).then(closeWin).catch(closeWin);
      return;
    }
    closeWin();
  }

  function askExit() {
    const btn = (cls, label, fn) => h('button', { class: 'gw-btn ' + (cls || ''), onclick: () => { dlg.close(); fn(); } }, label);
    const body = h('div', null,
      h('p', { style: { fontSize: '14.5px', lineHeight: '1.7', margin: '0 0 6px' } },
        '这一层批注是临时的，不写进板书文件。退出前要留着吗？'),
      h('p', { style: { fontSize: '12.5px', lineHeight: '1.65', color: 'var(--ink-2)', margin: '0 0 14px' } },
        '「发到画布」会把批注当一张透明图片插到画布当前页，接着讲；「存成图片」放到「图片\\数理无限画布批注\\」；「不保留」直接关掉。'),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } },
        btn('', '不保留，直接退出', () => finish('close')),
        btn('', '存成图片', () => finish('save')),
        btn('primary', '发到画布并退出', () => finish('canvas'))));
    const dlg = GW.dialog({ title: '退出桌面批注', body, width: 520, noFooter: true });
  }

  function exit(force) {
    if (!IS_OVERLAY) return;
    if (passOn) { setPass(false); return; }
    if (force === true || itemCount() === 0) { finish('close'); return; }
    askExit();
  }

  // ---------- 顶部控制胶囊 ----------
  function buildBar() {
    const B = (act, icon, label, fn, cls) => h('button', {
      class: 'ab-btn ' + (cls || ''), 'data-act': act, type: 'button',
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); fn(); },
    }, icon ? h('span', { class: 'ab-ic', html: GW.icon ? GW.icon(icon) : '' }) : null, h('span', { class: 'ab-tx' }, label));
    bar = h('div', { id: 'anno-bar' },
      h('span', { class: 'ab-dot' }),
      B('pen', 'pen', '笔', () => { GW.tool.set('pen'); paintTool(); }),
      B('eraser', 'eraser', '橡皮', () => { GW.tool.set('eraser'); paintTool(); }),
      B('undo', 'undo', '撤销', () => GW.undo()),
      B('clear', 'trash', '清屏', () => { if (itemCount() === 0) return GW.toast('已经是空的'); GW.clearInk(false); }),
      h('span', { class: 'ab-sep' }),
      B('grid', 'bg', '格线', cyclePat),
      // force=true：这是用户亲手点的，必须生效（批注态默认锁着常显，不 force 的话 on 恒为 true、
      // 按钮点了没反应）。详见 app.js setChrome 的注释。
      B('chrome', 'menu', '界面', () => { GW.setChrome(document.body.classList.contains('chrome-off'), true); }),
      h('span', { class: 'ab-sep' }),
      B('pass', 'hand', '切桌面', () => setPass(!passOn), 'switch'),
      B('canvas', 'export', '发到画布', () => { if (itemCount() === 0) return GW.toast('这一层还没有批注'); finish('canvas'); }),
      B('save', 'save', '存图', () => { if (itemCount() === 0) return GW.toast('这一层还没有批注'); finish('save'); }),
      h('span', { class: 'ab-sep' }),
      B('exit', 'close', '退出', () => exit(), 'danger'));
    document.body.append(bar);
    paintPat();
    paintPass();
    paintTool();
  }

  function paintTool() {
    if (!bar) return;
    const cur = (GW.tool && GW.tool.current) || 'pen';
    for (const name of ['pen', 'eraser']) {
      const b = bar.querySelector('[data-act="' + name + '"]');
      if (b) b.setAttribute('aria-pressed', cur === name ? 'true' : 'false');
    }
  }

  // ---------- 安装 ----------
  function install() {
    if (!IS_OVERLAY) return;
    // html 上也要挂：根元素自己带 background:#fff，Chromium 会照它把整个窗口刷白
    document.documentElement.classList.add('overlay-mode');
    document.body.classList.add('overlay-mode');
    buildBar();
    // 批注层一进来就把四角 + 工具栏展开：老师第一次进来要能看见「画布的所有功能都在」
    // （普通窗口默认收起是给鼠标用户让画面，这里用的是另一套心理预期）
    GW.setChrome(true);
    // 工具按钮跟着工具走（切了橡皮、点了图形工具，顶栏高亮要跟上）
    GW.bus.on('tool', paintTool);
    addEventListener('keydown', (e) => {
      // F9 / Ctrl+Alt+D 由主进程的全局快捷键接走；这里只做窗口有焦点时的兜底（防止全局注册被别的软件抢走）
      if (e.key === 'F9') { e.preventDefault(); setPass(!passOn); return; }
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); setPass(!passOn); return; }
      if (e.key === 'Escape') {
        if (document.querySelector('.dlg-wrap')) return;
        e.preventDefault(); exit();
      }
    }, true);
    if (W()) {
      // 主进程切了鼠标模式（全局快捷键 / 球面板）→ 界面同步
      window.gewu.on('overlay-pass', (v) => { passOn = !!v; paintPass(); });
      // 切换键的长按菜单（发到画布 / 存图）走这条通道，跟胶囊上的按钮完全同一条出口
      window.gewu.on('overlay-finish', (kind) => {
        if (kind !== 'canvas' && kind !== 'save') return;
        if (itemCount() === 0) { GW.toast('这一层还没有批注'); return; }
        finish(kind);
      });
      // Alt+F4 / 任务栏关闭：主进程的 close 事件会先拦下来问一句，再回这里确认
      window.gewu.on('overlay-ask-close', () => {
        if (itemCount() === 0) { closeWin(); return; }
        askExit();
      });
    }
    // 批注层里「桌面批注」入口是退出用的（app.js 的 desktopMode 会转发到这里）
  }

  GW.overlay = {
    install,
    exit,
    snapshot,
    flatten: flattenForBoard,   // 探针用：把透明快照垫成不透明
    shot: shotWithDesktop,      // 探针用：桌面截图 + 批注的合成（发到画布/存图走的就是它）
    setPass,
    // 主窗口调用：开批注层（在 Electron 里走主进程开新窗口，普通网页里只提示）
    open() {
      // 判断放在调用时（不是加载时）：探针会临时把 GW.isElectron 打开来测这条通道
      if (!GW.isElectron || !W()) return GW.toast('桌面批注仅在桌面版中可用');
      GW.storage.autosave(true);
      W().open();
    },
    get pass() { return passOn; },
  };
})();
