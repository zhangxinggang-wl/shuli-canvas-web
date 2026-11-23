/* 数理无限画布 · 主界面：工具栏、悬浮球、弹出面板、抽屉、对话框、启动流程 */

(function () {

  const GW = window.GW, h = GW.h, I = GW.icon;

  const SIM_FILES = [
    'math-function', 'math-solid', 'math-conic', 'math-trig', 'math-prob', 'math-vector',
    // 初中数学（批 4 · PLAN-math-junior R2~R8）：数与代数 / 图形与几何 / 统计与概率
    'math-numline', 'math-transform', 'math-circle', 'math-congruent',
    'math-stats', 'math-balance', 'math-tree',
    'phy-motion', 'phy-projectile', 'phy-incline', 'phy-collision', 'phy-orbit', 'phy-oscillator', 'phy-wave',
    'phy-efield', 'phy-particle', 'phy-circuit', 'phy-induction', 'phy-flux', 'phy-optics', 'phy-refraction', 'phy-resbox',
    // 2.0：补齐选择性必修二/三与必修二的空白（热学、原子与量子、交变电流、电容器、干涉衍射；导数、数列、复数）
    'phy-gas', 'phy-interference', 'phy-photoelectric', 'phy-capacitor', 'phy-acgen', 'phy-atom', 'phy-decay',
    'math-derivative', 'math-sequence', 'math-complex',
  ];
  // 反馈 3.2「画笔颜色没有快捷的红色选项」：原有 11 色里最接近红的 #e4572e 是橙红、
  // #e2559a 是粉，没有正红。补一个 #e02020 成 12 色 —— 面板是 6 列网格，12 色正好两行，
  // 「自定义颜色」那个彩虹格仍在最后单独一行（与荧光笔面板一致，不新增布局变化）。
  const COLORS = ['#1b2433', '#ffffff', '#e02020', '#e4572e', '#3366ff', '#0f9d8a', '#f2a541', '#8e5cd9', '#e2559a', '#ff7a00', '#8b5a2b', '#8a94a6'];
  const WIDTHS = [2, 3, 5, 8, 13];
  // 2.2.3（R1）：值类动作要用「人话」标出色名 —— 下拉里 12 个「笔色 · 颜色 N」没人分得清，
  // 而色板上的第 N 个与这里的顺序是同一份 COLORS，所以名字跟着顺序走，改色只需要改这一行。
  const COLOR_NAMES = ['黑色', '白色', '正红', '橙红', '蓝', '青绿', '橙黄', '紫', '粉', '亮橙', '棕', '灰蓝'];
  const colorName = (c) => { const i = COLORS.indexOf(c); return i >= 0 && COLOR_NAMES[i] ? COLOR_NAMES[i] : c; };
  // 2.2.3（R5）：静默隐藏的五档。0 = 永不（不挂计时器），其余按秒。
  // 老存档里可能是 2500 / 8000 这类自定值 —— 四舍五入到最近一档，绝不让控件显示成空。
  const IDLE_TIERS = [0, 1000, 2000, 3000, 5000];
  const IDLE_TIERS_PEN = [0, 1000, 2000, 3000, 4000, 5000];   // 笔的默认值就是 4000，必须有一档正好对上
  const idleTier = (v, dflt, tiers) => {
    const n = +v; if (!isFinite(n) || n < 0) return dflt;
    if (n === 0) return 0;
    const ts = tiers || IDLE_TIERS;
    let best = ts[1], bd = Infinity;
    for (const t of ts) { const d = Math.abs(t - n); if (d < bd) { bd = d; best = t; } }
    return best;
  };
  const HL_COLORS = ['#ffd23f', '#7ee081', '#5ecbff', '#ff8fab', '#ffa94d', '#c9a7ff'];
  // 激光笔色板（1.1.14）：演示用的高亮色，默认正红；白/黄在黑板上最扎眼，蓝紫在浅色画面上更清楚。
  const LASER_COLORS = ['#ff2d55', '#ff9f0a', '#ffd60a', '#32d74b', '#64d2ff', '#0a84ff', '#bf5af2', '#ffffff'];

  // =============== 通用：对话框 / 确认 / 弹出层 / 抽屉 ===============
  /* 1.5.6（P1）：对话框焦点管理
     - 打开时记住触发元素，焦点移进弹窗；关闭后触发元素还在就还给它
     - Tab / Shift+Tab 只在最上层弹窗里循环；没有可聚焦控件时停在弹窗容器上
     - 多层弹窗用 dlgStack 记账：只有栈顶那一份响应 Escape，一次只关一层
     确认/取消/点遮罩关闭与业务回调（onOk / onClose）的原有约定都不变。 */
  const dlgStack = [];
  let dlgSeq = 0;
  const dlgFocusables = (root) => [].slice.call(root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((el) => el.getClientRects().length > 0);
  const dlgFocus = (el) => { if (!el) return; try { el.focus(); } catch (e) { /* 元素已移除 */ } };

  GW.dialog = function ({ title, body, ok = '确定', cancel = '取消', onOk, width = 520, noFooter, onClose }) {
    const wrap = h('div', { class: 'dlg-wrap' });
    const prevFocus = document.activeElement;
    const titleId = 'gw-dlg-t' + (++dlgSeq);
    const entry = { dlg: null, close: null };
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      const wasTop = dlgStack[dlgStack.length - 1] === entry;
      const at = dlgStack.indexOf(entry);
      if (at >= 0) dlgStack.splice(at, 1);
      wrap.remove(); removeEventListener('keydown', key, true);
      if (wasTop) {
        const back = prevFocus && prevFocus !== document.body && document.contains(prevFocus) ? prevFocus : null;
        const nextTop = dlgStack[dlgStack.length - 1];
        if (back) dlgFocus(back);
        else if (nextTop) dlgFocus(nextTop.dlg);
      }
      try { onClose && onClose(); } catch (e) { console.error(e); }
    };
    const okBtn = h('button', { class: 'gw-btn primary', onclick: () => { if (onOk && onOk() === false) return; close(); } }, ok);
    const dlg = h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', tabindex: '-1', style: { width: width + 'px' } },
      h('div', { class: 'dlg-h', id: title ? titleId : null }, title), h('div', { class: 'dlg-b' }, body),
      noFooter ? null : h('div', { class: 'dlg-f' }, cancel ? h('button', { class: 'gw-btn', onclick: close }, cancel) : null, okBtn));
    if (title) dlg.setAttribute('aria-labelledby', titleId);
    else dlg.setAttribute('aria-label', '对话框');
    const key = (e) => {
      if (dlgStack[dlgStack.length - 1] !== entry) return;   // 只有最上层弹窗响应按键
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = dlgFocusables(dlg);
      if (!f.length) { e.preventDefault(); dlgFocus(dlg); return; }   // 无控件弹窗：焦点不外逃
      const act = document.activeElement;
      const idx = f.indexOf(act);
      if (e.shiftKey) {
        if (idx <= 0) { e.preventDefault(); dlgFocus(f[f.length - 1]); }
      } else if (idx === -1 || idx === f.length - 1) {
        e.preventDefault(); dlgFocus(f[0]);
      }
    };
    dlgStack.push(entry); entry.dlg = dlg; entry.close = close;
    wrap.append(dlg);
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
    addEventListener('keydown', key, true);
    document.body.append(wrap);
    dlgFocus(dlg);
    return { close };
  };
  GW.confirm = (msg, ok = '确定') => new Promise((res) => {
    let done = false;
    const d = GW.dialog({ title: '提示', body: h('p', { style: { fontSize: '15px', lineHeight: 1.6 } }, msg), ok, width: 420, onOk: () => { done = true; res(true); } });
    const obs = new MutationObserver(() => { if (!document.body.contains(document.querySelector('.dlg-wrap'))) { obs.disconnect(); if (!done) res(false); } });
    obs.observe(document.body, { childList: true });
  });
  GW.prompt = (title, value = '', placeholder = '') => new Promise((res) => {
    const inp = h('input', { class: 'gw-btn', style: { width: '100%', textAlign: 'left', cursor: 'text' }, value, placeholder });
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { d.close(); res(inp.value); } });
    const d = GW.dialog({ title, body: inp, onOk: () => res(inp.value), width: 520 });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });

  // 1.7.2（T07）：口令输入框。与 GW.prompt 的区别是「取消」会 resolve(null) —— 打开口令的
  // 「不输 = 不打开」靠这条；GW.prompt 取消时 promise 会一直挂着（历史行为，别处别改）。
  GW.passPrompt = (title, placeholder = '口令') => new Promise((res) => {
    let done = false;
    const inp = h('input', { class: 'gw-btn', type: 'password', style: { width: '100%', textAlign: 'left', cursor: 'text' }, placeholder });
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { done = true; d.close(); res(inp.value); } });
    const d = GW.dialog({ title, body: inp, onOk: () => { done = true; res(inp.value); }, onClose: () => { if (!done) res(null); }, width: 520 });
    setTimeout(() => { inp.focus(); }, 30);
  });

  // =============== 1.1.15：整页课件浮层（作者作品合集 / 学科库成品页） ===============
  // 成品网页打开就要能直接投影：近全屏、不留画布边缘；右下角固定一枚「物理唐波」水印
  // （个人标识，印在浮层上而不是改 html —— 需求要求 html 原样；1.1.17 起字号放大）。
  // 想放到板书上一起用，浮层左上角有「插入画布」：作者作品只记 work id（hw.work），
  // 其它来源照旧走原来的网页对象。
  GW.htmlFull = function (path, name, opts) {
    const work = (opts && opts.work) || '';
    const old = document.querySelector('.gw-htmlfull');
    if (old) { if (old._close) old._close(); else old.remove(); }
    const url = /^(https?|app|file|local|blob):/i.test(String(path)) ? path : GW.fileURL(path);
    const closeBtn = h('button', { class: 'gw-hf-btn', title: '关闭（Esc）' }, '✕ 关闭');
    const insBtn = h('button', { class: 'gw-hf-btn', title: '作为网页对象插入画布' }, '⤓ 插入画布');
    const sandbox = GW.webFrameSandbox ? GW.webFrameSandbox(url, work) : 'allow-scripts allow-pointer-lock allow-forms';
    const frame = h('iframe', { class: 'gw-hf-frame', src: url, title: name || '网页课件', sandbox: sandbox || null, allow: 'autoplay; fullscreen; pointer-lock; encrypted-media' });
    const bar = h('div', { class: 'gw-hf-bar' }, h('div', { class: 'gw-hf-title' }, name || ''), h('div', { class: 'gw-hf-act' }, insBtn, closeBtn));
    const wrap = h('div', { class: 'gw-htmlfull' }, bar, frame, h('div', { class: 'gw-hf-wm' }, '物理唐波'));
    const shut = () => { wrap.remove(); removeEventListener('keydown', key, true); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); shut(); } };
    wrap._close = shut;
    closeBtn.onclick = shut;
    insBtn.onclick = () => {
      shut();
      try {
        if (work && GW.authorWorks) GW.authorWorks.insert(work);
        else GW.importer.importOne(path);
      } catch (e) { GW.toast('插入失败：' + ((e && e.message) || e)); }
    };
    addEventListener('keydown', key, true);
    document.body.append(wrap);
    return { close: shut };
  };

  let curPop = null;
  // 2.0.4：九宫格二级弹层「笔锋调节」的独立容器 / 事件清理句柄。
  // 故意放在 curPop 之外 —— 它不占 curPop，也不会走 pop()（pop() 开头就 closePop()），
  // 所以从笔面板里再开一层不会把父级 penPop 关掉。提前声明，下面的通用
  // pointerdown 处理器要在它上面判「点在二级弹层内」，避免 TDZ。
  let penTipSub = null, penTipClose = null;
  // onClose 让弹出层自己收尾（例如「正多边形参数」要先把还没提交的那一步落进撤销栈）。
  // 先把 curPop 置空再回调，避免 onClose 里再调 closePop() 时自己转圈。
  function closePop() {
    const c = curPop;
    if (!c) return;
    curPop = null;
    // 父级 penPop 因任何原因收起时，二级弹层不能变成没人管的孤儿，顺手一起收。
    if (typeof closePenTipSub === 'function') closePenTipSub();
    const bl = document.getElementById('ball');
    if (bl && !curDrawer) bl.classList.remove('pop-hide');
    c.el.remove();
    c.anchor && c.anchor.classList.remove('popped');
    if (c.onClose) { try { c.onClose(); } catch (e) { console.error(e); } }
  }
  GW.closePop = closePop;
  GW.pop = pop;   // 1.6.7（T15）：评论钉等对象要复用同一套浮层（点外面自动关）
  // 1.6.6（T07）：右键菜单。input.js 的 contextmenu 只负责「命中才接管、只认右键」，
  // 菜单本体复用 pop()：自动避让屏幕边缘、点外面自动关、Esc 自动关，不用再写一套。
  // anchor 是一个 1px 的定点元素 —— pop 的定位是按 anchor 的矩形算的。
  GW.menuAt = function (x, y, items) {
    const anchor = h('div', { class: 'ctx-anchor', style: { left: x + 'px', top: y + 'px' } });
    document.body.append(anchor);
    const box = h('div', { class: 'ctx-menu' });
    for (const it of items) {
      if (!it) continue;
      if (it.sep) { box.append(h('div', { class: 'ctx-sep' })); continue; }
      const b = h('button', { class: 'ctx-i' + (it.danger ? ' danger' : ''), disabled: it.disabled || null },
        h('span', { class: 'ctx-l' }, it.label), it.key ? h('span', { class: 'ctx-k' }, it.key) : null);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        closePop();
        try { it.fn && it.fn(); } catch (err) { console.error(err); }
      });
      box.append(b);
    }
    pop(anchor, box, { cls: 'ctx-pop', onClose: () => anchor.remove() });
    return box;
  };
  // 弹层的内容是异步/按需填的（例如图形面板切换分页、搜索结果多少会变），
  // pop() 那一刻量到的高度不一定等于最终高度。内容变了以后重新夹一次，
  // 免得弹层底下那一截跑出视口（老师看不全，也点不到「完成」）。
  function repositionPop() {
    const c = curPop;
    if (!c) return;
    placePop(c.el, c.anchor, c.opts || {});
  }
  GW.repositionPop = repositionPop;
  // 选中图形的屏幕包围盒（世界坐标 → 屏幕）；参数弹层「避让图形」用它。
  function itemScreenBox(it) {
    if (!it) return null;
    const b = it.kind === 'obj' ? { x: it.x, y: it.y, w: it.w, h: it.h } : GW.bbox(it);
    if (!b || !(b.w > 0) || !(b.h > 0)) return null;
    const a = GW.toScreen(b.x, b.y), c = GW.toScreen(b.x + b.w, b.y + b.h);
    const x = Math.min(a.x, c.x), y = Math.min(a.y, c.y);
    return { x, y, w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) };
  }
  GW.itemScreenBox = itemScreenBox;
  // 参数弹层避让时要把**旋转中心手柄**一起避开：老师得在图形上把那个点拖到想要的位置，
  // 面板压在上面就点不到（反馈原文：「挡住了旋转的位置，不好选择」）。
  function avoidBox(it) {
    const b = itemScreenBox(it);
    if (!b) return null;
    const p = it && it.pvOn ? GW.pivotOf(it) : null;
    if (!p) return b;
    const s = GW.toScreen(p.x, p.y), R = 30;   // 手柄 38px，外留一圈手指余量
    const x1 = Math.min(b.x, s.x - R), y1 = Math.min(b.y, s.y - R);
    const x2 = Math.max(b.x + b.w, s.x + R), y2 = Math.max(b.y + b.h, s.y + R);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  GW.avoidBox = avoidBox;
  GW.placePop = placePop;   // 探针用：scripts/probe-param-aside.js 直接验避让几何
  // 弹层定位（1.1.14 抽出）：opts.avoid 给了图形屏幕框时，先把候选位置排在
  // 图形右/左/下/上四个外侧，选第一个完整落在视口里的；四个都放不下就选与图形
  // 重叠面积最小的那个再夹进视口 —— 至少不会整块压在图上。
  function placePop(el, anchor, opts) {
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
    const vw = innerWidth, vh = innerHeight, M = 8, G = 12;
    let A = null;
    try { A = typeof opts.avoid === 'function' ? opts.avoid() : opts.avoid; } catch (e) { A = null; }
    if (A && A.w > 0 && A.h > 0) {
      const cands = [
        { x: A.x + A.w + G, y: A.y + A.h / 2 - hh / 2, side: 'right' },
        { x: A.x - w - G, y: A.y + A.h / 2 - hh / 2, side: 'left' },
        { x: A.x + A.w / 2 - w / 2, y: A.y + A.h + G, side: 'bottom' },
        { x: A.x + A.w / 2 - w / 2, y: A.y - hh - G, side: 'top' },
      ];
      for (const c of cands) {
        if (c.x >= M && c.y >= M && c.x + w <= vw - M && c.y + hh <= vh - M) {
          el.style.left = c.x + 'px'; el.style.top = c.y + 'px';
          el.dataset.side = c.side;
          return;
        }
      }
      let best = null, area = Infinity;
      for (const c of cands) {
        const x = GW.clamp(c.x, M, Math.max(M, vw - w - M));
        const y = GW.clamp(c.y, M, Math.max(M, vh - hh - M));
        const ox = Math.max(0, Math.min(x + w, A.x + A.w) - Math.max(x, A.x));
        const oy = Math.max(0, Math.min(y + hh, A.y + A.h) - Math.max(y, A.y));
        if (ox * oy < area) { area = ox * oy; best = { x, y }; }
      }
      if (best) { el.style.left = best.x + 'px'; el.style.top = best.y + 'px'; el.dataset.side = 'near'; return; }
    }
    let x, y;
    const place = opts.place || 'top';
    if (place === 'top') { x = r.left + r.width / 2 - w / 2; y = r.top - hh - 12; }
    else if (place === 'bottom') { x = r.left; y = r.bottom + 10; }
    else if (place === 'side') { x = r.right + 14; y = r.top + r.height / 2 - hh / 2; if (x + w > innerWidth - 8) x = r.left - w - 14; }
    el.style.left = GW.clamp(x, 8, innerWidth - w - 8) + 'px';
    el.style.top = GW.clamp(y, 8, innerHeight - hh - 8) + 'px';
    el.dataset.side = place;
  }
  // P0（2.2.9 回归）：抽屉/弹层打开时球必须**整体**让出。只加 pop-hide 不够 ——
  // 展开态下 CSS 的 `#ball.open .ring-hit { pointer-events: auto }` 让透明热区继续可命中，
  // 而球 z-index 90 又高于抽屉 70，真鼠标点到的是 ring-hit：抽屉不关、卡片插不进对象。
  // 所以隐藏的同时把扇环收掉（retract 只撤环，不动外壳/设置）。
  function hideBallForOverlay() {
    const bl = document.getElementById('ball');
    if (bl) bl.classList.add('pop-hide');
    if (GW.ball && GW.ball.retract) { try { GW.ball.retract(); } catch (e) { console.error(e); } }
  }
  function pop(anchor, content, opts = {}) {
    closePop();
    // 1.3.10：弹出面板期间把悬浮球收起来 —— 架子满 12 件时面板会一直顶到球的位置，挡住缩略图
    hideBallForOverlay();
    const el = h('div', { class: 'pop ' + (opts.cls || '') }, content);
    document.body.append(el);
    placePop(el, anchor, opts);
    curPop = { el, anchor, opts, onClose: opts.onClose };
    anchor.classList && anchor.classList.add('popped');
    return el;
  }
  document.addEventListener('pointerdown', (e) => {
    if (!curPop) return;
    if (curPop.el.contains(e.target)) return;
    if (curPop.anchor && curPop.anchor.contains && curPop.anchor.contains(e.target)) return;
    // 2.0.4：点在二级弹层里时，别让「点外部关闭」这条把父级 penPop 顺手关了。
    // 二级弹层是 body 下的独立节点，不在 curPop.el 里，没这句就会误判成「点在浮层外」。
    if (penTipSub && penTipSub.contains(e.target)) return;
    // 点在「这个图形自己的把手」上（滑动变阻器的滑片）时不关面板：老师要一边拖一边看数值
    const o = curPop.item;
    const HD = o && o.type === 'pb' && GW.physShapes && GW.physShapes.projHandles && GW.physShapes.projHandles[o.key];
    if (HD) {
      const q = GW.pt(e.clientX, e.clientY), w = GW.toWorld(q.x, q.y);
      if (HD.hit(o, w.x, w.y)) return;
    }
    closePop();
  }, true);
  GW.bus.on('escape', () => { closePop(); closeDrawer(); });

  let curDrawer = null;
  function closeDrawer() {
    if (curDrawer) {
      curDrawer.remove(); curDrawer = null;
      const s = document.getElementById('scrim'); if (s) s.remove();
      const bl = document.getElementById('ball');
      if (bl && !document.querySelector('.pop')) bl.classList.remove('pop-hide');
    }
  }
  function drawer(title, headExtra, body, opts = {}) {
    closeDrawer(); closePop();
    const scrim = h('div', { id: 'scrim', onpointerdown: closeDrawer });
    const el = h('div', { class: 'drawer' + (opts.left ? ' left' : ''), style: opts.width ? { width: opts.width } : null },
      h('div', { class: 'dr-head' }, h('h3', null, title), headExtra, h('button', { class: 'tb-btn x', html: I('close'), onclick: closeDrawer })), body);
    document.body.append(scrim, el);
    curDrawer = el;
    // 抽屉打开时收起悬浮球（连扇环一起）：球是 fixed 层级，会压在抽屉最右一列卡片上；
    // 展开态下透明 ring-hit 也会抢走卡片点击（P0）。
    hideBallForOverlay();
    // 抽屉内按键不再往画布冒泡（防空格/方向键触发画布命令），但 **Esc 必须让出去** ——
    // 收起抽屉的 Escape 要能被 pptx.js 的 Esc 分层与全局 escape 链看到，不能被吞掉。
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) return;
      e.stopPropagation();
    });
    return el;
  }

  // 1.1.15 右上角 ✕：不再一点就退。老师上课误触一次，整节课的板书虽然会自动备份，
  // 但重新打开、找回进度本身就是事故 —— 先给「退出程序 / 最小化到任务栏」两个明确选择。
  // 1.5.4 复审 #1：退出保护只走这一条路径 —— 窗口 ✕、菜单退出、主进程的 before-close
  // 全部调用 exitGuard()。旧流程里主进程 2.5 秒后无条件强关，备份失败时点「继续使用」
  // 也拦不住；现在主进程只在收到 close-now 时才关窗口。
  let quitting = false;
  function exitChoice(err) {
    return new Promise((resolve) => {
      let d = null, done = false;
      const pick = (v) => { if (done) return; done = true; try { d.close(); } catch (_) { /* 已关 */ } resolve(v); };
      const btn = (label, cls, v) => h('button', { class: 'gw-btn' + (cls ? ' ' + cls : ''), onclick: () => pick(v) }, label);
      d = GW.dialog({
        title: '备份没有写成功',
        width: 470,
        noFooter: true,
        body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
          h('p', { style: { margin: 0, fontSize: '14px', lineHeight: 1.7 } },
            '自动备份没有写成功：' + err + '。现在退出会丢失未保存的板书。'),
          h('p', { style: { margin: 0, fontSize: '12px', color: '#8a94a3', lineHeight: 1.6 } },
            '可以重试一次、另存为文件，或确认丢失后强制退出。'),
          h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' } },
            btn('取消退出', '', 'stay'),
            btn('另存为文件…', '', 'saveas'),
            btn('强制退出', 'danger', 'force'),
            btn('重试保存', 'primary', 'retry'))),
        onClose: () => pick('stay'),
      });
    });
  }
  async function exitGuard(onExit) {
    if (quitting) return false;
    if (!(GW.doc && GW.doc.dirty)) { onExit(); return true; }
    quitting = true;
    let ok = false, err = '';
    // F08：备份是异步写盘，等待期间画布仍可编辑。先记下发起的修订号，写完复核；
    // 旧写法只认「备份函数返回 true」就关窗口，最后一笔没进快照也就静默丢了。
    let rev = GW.storage.revision ? GW.storage.revision() : -1;
    try { ok = await GW.storage.autosave(true); } catch (e) { err = String((e && e.message) || e); }
    if (!ok) err = err || ((GW.saveState && GW.saveState().backup.err) || '磁盘写入失败');
    if (ok && GW.storage.revision) {
      // 期间又编辑过：重存一次；这一次仍在变就拦下退出，交给下面的 exitChoice 让老师选。
      if (GW.storage.revision() !== rev) {
        rev = GW.storage.revision();
        try { ok = await GW.storage.autosave(true); } catch (e) { ok = false; err = String((e && e.message) || e); }
        if (ok && GW.storage.revision() !== rev) { ok = false; err = '备份期间仍有新改动，为避免丢失已阻止本次退出'; }
      }
    }
    if (ok) { quitting = false; onExit(); return true; }
    const choice = await exitChoice(err);
    quitting = false;
    if (choice === 'retry') return exitGuard(onExit);
    if (choice === 'saveas') {
      try { await GW.storage.save(true); } catch (e) { /* 下面按 dirty 判断 */ }
      if (!(GW.doc && GW.doc.dirty)) { onExit(); return true; }
      GW.toast('还没有保存成功，先不退出', 3000);
      return false;
    }
    if (choice === 'force') { onExit(); return true; }
    GW.toast('已取消退出，板书还在', 2600);
    return false;
  }
  GW.exitGuard = exitGuard;
  // 备份迟迟写不完时主进程只提醒、不替老师关窗口。
  GW.closeTimeoutNotice = function () {
    GW.dialog({
      title: '还在保存备份',
      width: 430, noFooter: true,
      body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('p', { style: { margin: 0, fontSize: '14px', lineHeight: 1.7 } }, '备份还在写，暂时不能关窗口。可以继续等它写完，或者取消这次退出。'),
        h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
          h('button', { class: 'gw-btn', onclick: () => { try { window.gewu.win('close-cancel'); } catch (_) { /* 网页版没有 */ } GW.toast('已取消退出', 2200); } }, '取消退出'),
          h('button', { class: 'gw-btn primary', onclick: () => { try { window.gewu.win('close-cancel'); } catch (_) {} GW.toast('会继续等备份写完，写完后请再关一次', 3200); } }, '继续等待'))),
    });
  };
  function askQuit(onExit) {
    const canMin = !!GW.isElectron;
    let d = null;
    const btn = (label, cls, fn) => h('button', { class: 'gw-btn' + (cls ? ' ' + cls : ''), onclick: () => { d.close(); fn(); } }, label);
    d = GW.dialog({
      title: '退出程序',
      width: 460,
      noFooter: true,
      body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        h('p', { style: { margin: 0, fontSize: '15px', lineHeight: 1.65 } },
          canMin ? '要退出「数理无限画布」吗？下课还要接着讲的话，可以最小化到任务栏，板书不会丢。'
            : '要退出吗？当前板书会自动保存，下次打开还能接着讲。'),
        h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' } },
          btn('继续使用', '', () => {}),
          canMin ? btn('最小化到任务栏', 'primary', () => { try { window.gewu.win('min'); } catch (e) { /* 无视 */ } }) : null,
          // 1.5.4 复审 #1：与窗口 ✕ 共用 exitGuard（等待真实结果、失败可重试/另存为/强制退出）。
          btn('退出程序', canMin ? 'danger' : 'primary', () => { exitGuard(onExit); }))),
    });
  }
  GW.askQuit = askQuit;

  // =============== 顶部 ===============
  // 1.5.3（P1）：标题旁的保存状态。三种必须分开（以前只有一个 dirty 红点，分不清）：
  //   已保存到文件 / 已备份但没存文件 / 备份失败。点它看详情与恢复副本列表。
  function saveChipEl() {
    const chip = h('button', { id: 'save-chip', class: 'tb-btn chip', title: '' }, '');
    chip.onclick = () => saveDetailDlg();
    return chip;
  }
  function paintSaveChip(chip) {
    if (!chip || !GW.saveState) return;
    const st = GW.saveState();
    const dirty = st.dirty;
    let cls = 'tb-btn chip', txt = '', tip = '';
    const t = (ms) => { if (!ms) return ''; const d = new Date(ms); const z = (n) => String(n).padStart(2, '0'); return z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()); };
    if (dirty) {
      if (st.backup.err) { cls += ' err'; txt = '备份失败'; tip = '自动备份失败：' + st.backup.err + '（点这里看详情）'; }
      else if (st.backup.at) { cls += ' warn'; txt = '已备份 · 未存文件'; tip = '已生成恢复副本（' + t(st.backup.at) + '），但还没保存成 .gewu 文件'; }
      else { cls += ' warn'; txt = '未保存'; tip = '有改动还没保存，也没生成恢复副本'; }
    } else {
      if (st.file.at) { cls += ' ok'; txt = '已保存'; tip = '已保存到文件（' + t(st.file.at) + '）'; }
      else { txt = '未命名'; tip = '新建的板书，还没有保存到文件'; }
    }
    chip.className = cls;
    chip.textContent = txt;
    chip.title = tip + (st.quota ? '\n浏览器存储空间不足，请尽快导出 .gewu 文件' : '');
  }
  function saveDetailDlg() {
    const st = GW.saveState ? GW.saveState() : {};
    const t = (ms) => { if (!ms) return '（还没有）'; const d = new Date(ms); return d.toLocaleString('zh-CN', { hour12: false }); };
    const b = st.backup || {}, f = st.file || {};
    const line = (k, v, bad) => h('div', { class: 'sv-line' + (bad ? ' bad' : '') }, h('b', null, k), h('span', null, v));
    const dlg = GW.dialog({
      title: '保存与备份状态',
      width: 560,
      noFooter: true,
      body: h('div', { class: 'save-detail' },
        line('当前文档', (st.path ? st.path : '未命名板书') + (st.dirty ? '（有未保存改动）' : '（无改动）')),
        line('保存到文件', t(f.at) + (f.busy ? ' · 正在写盘…' : '') + (f.note === '下载' ? ' · 浏览器下载（由浏览器决定落盘位置）' : ''), !!f.err),
        f.err ? line('保存错误', f.err, true) : null,
        line('恢复副本', t(b.at) + (b.busy ? ' · 正在生成…' : '') + (b.warn ? ' · ' + b.warn : ''), !!b.err),
        b.err ? line('备份错误', b.err, true) : null,
        st.quota ? line('浏览器容量', '存储空间不足：自动备份没有保存，请导出 .gewu（本地存储有上限）', true) : null,
        h('div', { class: 'sv-foot' },
          h('button', { class: 'gw-btn', onclick: () => { dlg.close(); GW.storage.autosave(true).then((ok) => GW.toast(ok ? '已生成新的恢复副本' : '备份仍然失败，请检查磁盘空间', 3000)); } }, '立即备份一次'),
          h('button', { class: 'gw-btn primary', onclick: () => { dlg.close(); GW.showBackups(); } }, '查看恢复副本…')))});
  }
  GW.saveDetailDlg = saveDetailDlg;
  // 1.5.3（P1）：恢复副本列表。每份显示时间 / 原文件 / 大小 / 是否完好，单份恢复；
  // 恢复出来的入口是"未保存到文件"的文档（path=null、dirty=true），不会覆盖原 .gewu。
  GW.showBackups = function showBackups() {
    const box = h('div', { class: 'bk-list' }, h('div', { class: 'bk-empty' }, '正在读取恢复副本…'));
    const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : (n || 0) + ' B');
    const fmtAt = (iso) => { if (!iso) return '时间未知'; const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleString('zh-CN', { hour12: false }); };
    const body = h('div', null,
      h('p', { class: 'bk-hint' }, '版本历史：自动备份最多保留 5 份、总量 200 MB，内容没变不会重复生成。缩略图是每份副本的第一页。恢复出来的是「未保存到文件」的板书，不会覆盖你原来的 .gewu。'),
      box);
    const dlg = GW.dialog({ title: '版本历史', width: 680, noFooter: true, body });
    const row = (it, tag) => {
      const meta = [tag, fmtAt(it.at), it.path ? it.path : '未命名板书', fmtSize(it.size)].filter(Boolean).join(' · ');
      const btn = h('button', { class: 'gw-btn primary' }, '恢复');
      btn.onclick = async () => {
        if (it.missing) { GW.toast(it.missing, 3000); return; }
        btn.disabled = true;
        const ok = await GW.storage.restoreBackup(it.f || it.name);
        btn.disabled = false;
        if (ok) { dlg.close(); GW.toast('已恢复这份备份（记得另存为文件）', 3200); }
      };
      // 1.6.7（T18）：能删单份、能看首页缩略图 —— 版本历史不能只有「恢复」一条路。
      const del = h('button', { class: 'gw-btn' }, '删除');
      del.onclick = async () => {
        if (!(await GW.confirm('删除这份恢复副本？删除后只剩其它几份，无法再找回这一版。'))) return;
        if (!it.f || it.f === 'autosave.gewu' || it.name === 'localStorage') { GW.toast('这一份是旧版单槽备份，不能单独删除', 2600); return; }
        del.disabled = true;
        const ok = await GW.storage.dropBackup(it.f);
        del.disabled = false;
        if (ok) { dlg.close(); showBackups(); GW.toast('已删除这份恢复副本', 2200); }
        else GW.toast('删除失败（文件可能已被占用）', 3000);
      };
      const thumb = h('div', { class: 'bk-shot' + (it.thumb ? '' : ' empty') });
      if (it.thumb) { const img = h('img', { alt: '' }); img.src = it.thumb; thumb.append(img); }
      return h('div', { class: 'bk-row' + (it.missing ? ' missing' : '') }, thumb,
        h('div', { class: 'bk-main' }, h('b', null, it.title || '未命名板书'),
          h('span', { class: 'bk-meta' }, meta + (it.missing ? ' · ' + it.missing : ''))),
        h('div', { class: 'bk-acts' }, btn, del));
    };
    GW.storage.backups().then((r) => {
      box.textContent = '';
      const rows = [];
      if (r.legacy) rows.push(row(r.legacy, r.legacy.name === 'localStorage' ? '浏览器' : '旧版单槽'));
      (r.items || []).forEach((it) => rows.push(row(it, '自动备份')));
      if (!rows.length) box.append(h('div', { class: 'bk-empty' }, '还没有自动备份。'));
      else rows.forEach((x) => box.append(x));
      if (r.err) box.append(h('div', { class: 'bk-empty bad' }, r.err));
      const foot = h('div', { class: 'bk-foot' },
        h('button', { class: 'gw-btn', onclick: async () => { const ok = await GW.storage.autosave(true); GW.toast(ok ? '已生成新的恢复副本' : '备份失败，请检查磁盘空间', 3000); if (ok) { dlg.close(); showBackups(); } } }, '立即备份一次'),
        h('button', { class: 'gw-btn', onclick: () => dlg.close() }, '关闭'));
      body.append(foot);
    }).catch((e) => { box.textContent = '读取恢复副本失败：' + ((e && e.message) || e); });
  };
  // ---------- 跨端能力探测（桌面 / 安卓 WebView / 网页同一套界面） ----------
  // 桌面专有的桥（退出、全屏、本机文件对话框、自动备份探测）在这里统一分派：
  // 有桌面桥走桌面桥 → 没有就安卓 gewuNative → 再没有就用浏览器等价实现 → 连等价实现都没有就 toast 说明，
  // 而不是把整个入口藏掉（网页版 / 手机版看不见入口是本次要修的问题）。
  const gwBridge = () => window.gewu || null;
  // 注意：网页桥（mobile/shim.js）里 win() 是空实现 async () => {}，光看 typeof 会得到一个点不动的死按钮，
  // 所以「能不能控制窗口」必须同时要求 isElectron。
  const canWin = () => { const g = gwBridge(); return !!(g && g.isElectron && typeof g.win === 'function'); };
  // 桌面能力（含 probe 里只把 GW.isElectron 置真的场景）：窗口控制、本机目录、GPU 状态都以此为门
  const canDesk = () => !!(GW.isElectron || (gwBridge() && gwBridge().isElectron));
  // 退出：桌面关窗口 → 安卓 native.exit() → 网页提示关标签页
  function exitApp() {
    try {
      if (canWin()) { window.gewu.win('close'); return; }
      const nat = window.gewuNative;
      if (nat && typeof nat.exit === 'function') { nat.exit(); return; }
    } catch (e) { /* 落到下面的提示 */ }
    GW.toast('网页版请直接关闭这个标签页');
  }
  // 自动备份是否存在：桌面查用户目录里的 autosave.gewu，网页 / 手机查 localStorage 单槽
  async function hasAutoBackup() {
    try {
      const g = gwBridge();
      if (g && g.isElectron && typeof g.fileInfo === 'function' && typeof g.userPath === 'function') {
        const info = await g.fileInfo(await g.userPath('autosave.gewu'));
        return !!(info && info.exists);
      }
    } catch (e) { /* 读不到就当没有 */ }
    try { return !!localStorage.getItem('gewu.autosave'); } catch (e) { return false; }
  }
  // 网页 / 手机没有「选本机路径」的对话框时的浏览器等价实现：临时 <input type="file" multiple>
  function pickLocalFiles(accept) {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', multiple: true, style: { display: 'none' } });
      if (accept) inp.setAttribute('accept', accept);
      let done = false;
      inp.addEventListener('change', () => {
        if (done) return;
        done = true;
        const fs = [].slice.call(inp.files || []);
        inp.remove();
        resolve(fs);
      });
      document.body.append(inp);
      inp.click();
    });
  }
  // 网页 / 手机收藏的「本机文件」只有本会话有效：blob URL → File，卡片点了拿 File 去 importOne
  const RES_FILES = new Map();
  // 1.6.7（T14）：演示模式（全屏单页翻页）+ 提词窗。
  // 画面仍然是同一块画布（不另开渲染路径），只是：全屏、隐藏界面、缩放铺满当前页、方向键翻页；
  // 右侧另开一个只读小窗显示「第几页 / 本页备注 / 已用时长」。
  const PRES = { on: false, t0: 0, key: null, fs: false, chrome: false };
  function presNotes(p) {
    const strip = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').trim();
    const lines = (p.objs || []).filter((o) => o.type === 'text' && o.data).map((o) => strip(o.data.html)).filter(Boolean);
    const cm = (p.objs || []).filter((o) => o.type === 'comment' && o.data && o.data.text).map((o) => '· ' + o.data.text);
    return lines.slice(0, 4).join('\n').concat(cm.length ? (lines.length ? '\n\n' : '') + cm.slice(0, 3).join('\n') : '').slice(0, 1200);
  }
  function presPush() {
    if (!PRES.on) return;
    const p = GW.page(), i = GW.doc.cur, n = GW.doc.pages.length;
    let thumb = '';
    try { thumb = GW.renderThumb(p, 360, 225).toDataURL('image/jpeg', 0.62); } catch (e) { thumb = ''; }
    const st = { i: i + 1, n: n, title: p.name || ('第 ' + (i + 1) + ' 页'), notes: presNotes(p), thumb: thumb, elapsed: Date.now() - PRES.t0 };
    try { if (window.gewu && window.gewu.presenter) window.gewu.presenter.state(st); } catch (e) { /* 网页版没有提词窗 */ }
  }
  function presGo(d) {
    const t = Math.max(0, Math.min(GW.doc.pages.length - 1, GW.doc.cur + d));
    if (t === GW.doc.cur) return;
    GW.gotoPage(t); GW.fitContent(); presPush();
  }
  GW.present = {
    isOn: () => PRES.on,
    start() {
      if (PRES.on) { presGo(1); return; }
      PRES.on = true; PRES.t0 = Date.now(); PRES.chrome = GW.chromeOn();
      setChrome(false);
      if (GW.selection && GW.selection.clear) GW.selection.clear();
      GW.bus.emit('escape');
      if (GW.tool && GW.tool.set) GW.tool.set('hand');
      try {
        if (canWin()) { window.gewu.win('full-on'); PRES.fs = true; }
        else if (document.documentElement.requestFullscreen) {
          // 网页 / 手机：没有窗口控制桥，用标准 Fullscreen API（.then 里再置标记，被拦下就保持 false）
          const pr = document.documentElement.requestFullscreen();
          if (pr && pr.then) pr.then(() => { PRES.fs = 'doc'; }, () => { PRES.fs = false; });
        }
        if (window.gewu && window.gewu.presenter) window.gewu.presenter.open();
      } catch (e) { /* 网页版：只做全屏单页 */ }
      PRES.key = (e) => {
        if (!PRES.on) return;
        const t = e.target;
        if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
        const k = String(e.key || '');
        if (k === 'Escape') { e.preventDefault(); GW.present.exit(); }
        else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Spacebar') { e.preventDefault(); presGo(1); }
        else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); presGo(-1); }
        else if (k === 'Home') { e.preventDefault(); if (GW.doc.cur !== 0) { GW.gotoPage(0); GW.fitContent(); presPush(); } }
        else if (k === 'End') { e.preventDefault(); const last = GW.doc.pages.length - 1; if (GW.doc.cur !== last) { GW.gotoPage(last); GW.fitContent(); presPush(); } }
      };
      document.addEventListener('keydown', PRES.key, true);
      GW.fitContent(); presPush();
      GW.toast('演示模式：← → 翻页，Esc 退出', 2800);
    },
    exit() {
      if (!PRES.on) return;
      PRES.on = false;
      if (PRES.key) { document.removeEventListener('keydown', PRES.key, true); PRES.key = null; }
      try {
        if (window.gewu && window.gewu.presenter) window.gewu.presenter.close();
        if (PRES.fs === 'doc') {
          if (document.exitFullscreen && document.fullscreenElement) {
            const ex = document.exitFullscreen();
            if (ex && ex.catch) ex.catch(() => {});
          }
        } else if (PRES.fs && canWin()) window.gewu.win('full-off');
      } catch (e) { /* 同上 */ }
      PRES.fs = false;
      setChrome(PRES.chrome); GW.fitContent();
      GW.toast('已退出演示模式', 1800);
    },
    toggle() { if (PRES.on) this.exit(); else this.start(); },
    next() { presGo(1); },
    prev() { presGo(-1); },
  };
  // 提词窗上的按钮 → 主窗口
  if (window.gewu && window.gewu.on) {
    window.gewu.on('presenter-cmd', (cmd) => {
      if (!PRES.on) return;
      if (cmd === 'next') presGo(1);
      else if (cmd === 'prev') presGo(-1);
      else if (cmd === 'exit') GW.present.exit();
    });
  }
  // 1.6.7（R7）：主进程在下载目录里发现比当前版本新的安装包 → 顶栏一条可点的提示。
  // 只提示、不自动安装：老师点一下才打开那个安装包。
  GW.updateUi = function (st) {
    let barEl = document.getElementById('upd-bar');
    if (!st || !st.found) { if (barEl) barEl.remove(); return; }
    if (!barEl) {
      barEl = h('div', { id: 'upd-bar', class: 'upd-bar' },
        h('span', { class: 'upd-txt' }, '发现新版本 ' + st.version),
        h('button', { class: 'gw-btn primary', onclick: () => { if (window.gewu && window.gewu.updateOpen) window.gewu.updateOpen(st.path); } }, '打开安装包'),
        h('button', { class: 'tb-btn', html: I('close'), title: '知道了', onclick: () => barEl.remove() }));
      const top = document.getElementById('topbar') || document.body;
      top.append(barEl);
    } else {
      const t = barEl.querySelector('.upd-txt');
      if (t) t.textContent = '发现新版本 ' + st.version;
    }
  };
  if (window.gewu && window.gewu.on) {
    window.gewu.on('update-state', (st) => GW.updateUi(st));
    // 启动 10 秒后问一次（和主进程那边的静默检查错开，避免两边同时扫目录）
    setTimeout(() => {
      if (window.gewu.updateCheck) window.gewu.updateCheck().then((r) => GW.updateUi(r)).catch(() => {});
    }, 10000);
  }
  // 1.6.7（T15）：评论钉。插入一枚小徽标，单击写一条评论，可标记已解决。
  // 全部落在对象数据里 ⇒ 跟着 .gewu 走、可撤销、可导出、不联网。
  GW.addComment = function addComment(x, y) {
    const n = GW.doc.pages.reduce((m, p) => m + (p.objs || []).filter((o) => o.type === 'comment').length, 0) + 1;
    const vc = GW.viewCenter();
    const px = (x == null ? vc.x : x) - 15, py = (y == null ? vc.y : y) - 15;
    const o = GW.objects.create('comment', { num: n, text: '', resolved: false, at: Date.now() },
      { x: px, y: py, exact: true, w: 30, h: 30 });
    if (GW.applyTeacherAnnot) GW.applyTeacherAnnot(true);   // 1.7.0（T15）：新建的批注也要按开关决定藏不藏
    setTimeout(() => GW.commentEditor(o), 80);
    return o;
  };
  GW.commentEditor = function commentEditor(o) {
    if (!o || !GW.pop) return;
    const el = GW.objects.el(o);
    const ta = h('textarea', { class: 'cm-ta', rows: 4, placeholder: '写一条评论（课上提醒自己，或给同事留话）' });
    ta.value = (o.data && o.data.text) || '';
    // 1.7.0（T15）：评论线程 —— 一条评论下可以追加多条回复，记录「谁 / 什么时候 / 说了什么」。
    // 线程只进 data.thread（数组），旧版本读到未知字段会忽略，`.gewu` 结构不变。
    const thread = () => (o.data && Array.isArray(o.data.thread) ? o.data.thread : []);
    const threadBox = h('div', { class: 'cm-thread' });
    const paintThread = () => {
      threadBox.innerHTML = '';
      const list = thread();
      if (!list.length) { threadBox.append(h('div', { class: 'cm-empty' }, '还没有回复。讨论要点可以一条条追加在这里。')); return; }
      for (const m of list) {
        const t = new Date(m.at || Date.now());
        const hh = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
        threadBox.append(h('div', { class: 'cm-reply' },
          h('div', { class: 'cm-meta' }, (m.by || '我') + ' · ' + hh),
          h('div', { class: 'cm-text' }, m.text || '')));
      }
    };
    paintThread();
    const replyIn = h('input', { class: 'gw-in', placeholder: '追加一条回复，回车发送' });
    const addReply = () => {
      const v = replyIn.value.trim();
      if (!v) return;
      const list = thread().slice();
      list.push({ by: (GW.settings.userName || '我'), at: Date.now(), text: v });
      GW.objects.setData(o, { thread: list });
      replyIn.value = '';
      paintThread();
      GW.toast('已追加回复', 1200);
    };
    replyIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addReply(); } });
    const save = () => { GW.objects.setData(o, { text: ta.value.trim() }); GW.closePop(); GW.toast('评论已保存', 1500); };
    const flip = () => { GW.objects.setData(o, { text: ta.value.trim(), resolved: !(o.data && o.data.resolved) }); GW.closePop(); };
    const del = () => { GW.closePop(); GW.objects.remove(o); };
    // 教师批注：勾上就带 teacher:1，顶栏「教师批注可见」开关能一键把这类批注藏起来（数据不动）。
    const tcb = h('input', { type: 'checkbox', class: 'gw-cb' });
    tcb.checked = !(o.data && o.data.teacher === false);
    tcb.addEventListener('change', () => { GW.objects.setData(o, { teacher: tcb.checked ? 1 : false }); if (GW.applyTeacherAnnot) GW.applyTeacherAnnot(true); GW.requestRender(); });
    const box = h('div', { class: 'cm-pop' },
      h('div', { class: 'cm-head' }, '评论 #' + ((o.data && o.data.num) || '') + ((o.data && o.data.resolved) ? ' · 已解决' : '')),
      ta,
      h('div', { class: 'cm-threadwrap' }, h('div', { class: 'cm-sublabel' }, '回复（' + thread().length + '）'), threadBox, replyIn),
      h('label', { class: 'cm-tchk', title: '教师批注可以用顶栏的开关一键隐藏（投影给学生看时）' }, tcb, '教师批注（可一键隐藏）'),
      h('div', { class: 'cm-foot' },
        h('button', { class: 'gw-btn', onclick: del }, '删除'),
        h('button', { class: 'gw-btn', onclick: flip }, (o.data && o.data.resolved) ? '重新打开' : '标记已解决'),
        h('button', { class: 'gw-btn primary', onclick: save }, '保存')));
    GW.pop(el || document.body, box, { cls: 'cm-wrap' });
    setTimeout(() => { ta.focus(); ta.select(); }, 30);
  };
  // 1.6.7（T16）：大纲 / 目录。侧栏一条树：每页一行，页内文本块按顺序列出（取第一行做标题）。
  // 点一行就跳到那一页、把那段框到屏幕中间并选中它。不新增存储、不联网。
  GW.showOutline = function showOutline() {
    const body = h('div', { class: 'ol-wrap' });
    const strip = (html) => String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const draw = () => {
      body.innerHTML = '';
      let n = 0;
      GW.doc.pages.forEach((p, i) => {
        const pname = p.name || ('第 ' + (i + 1) + ' 页');
        body.append(h('div', { class: 'ol-page' + (i === GW.doc.cur ? ' on' : '') },
          h('button', { class: 'ol-pname', onclick: () => { GW.gotoPage(i); GW.fitContent(); closeDrawer(); } },
            (i + 1) + ' · ' + pname),
          h('span', { class: 'ol-count' }, (p.ink.length + p.objs.length) + ' 个对象')));
        const texts = (p.objs || []).filter((o) => o.type === 'text' && o.data);
        texts.forEach((o) => {
          const line = strip(o.data.html).slice(0, 60);
          n++;
          body.append(h('button', {
            class: 'ol-item',
            onclick: () => {
              GW.gotoPage(i);
              GW.selection.set([o]);
              const b = GW.bbox(o);
              if (b) GW.fitRect(b, 120);
              closeDrawer();
            }
          }, line || '（空白文本）'));
        });
      });
      if (!n) body.append(h('div', { class: 'ol-empty' }, '这一份板书里还没有文本块。用「文本」工具写几个小标题，大纲就会自动出来。'));
    };
    const wrap = h('div', null,
      h('p', { class: 'bk-hint' }, '大纲按页顺序列出所有文本块（每块取第一行）。点一行跳到那一页，并把那一段框到屏幕中间。'),
      body);
    drawer('大纲 / 目录', null, wrap, { width: 'min(420px, 92vw)' });
    draw();
  };

  // 1.6.7（T19）：记忆卡 + 盒子阶梯复习。数据在 GW.cards（src/core/cards.js），这里只做界面。
  GW.showCards = function () {
    const body = h('div', { class: 'dr-body' });
    const draw = () => {
      body.innerHTML = '';
      const st = GW.cards.stats();
      const all = GW.cards.list();
      const when = (t) => {
        const d = t - Date.now();
        if (d <= 0) return '现在';
        if (d < 3600e3) return Math.round(d / 60e3) + ' 分钟后';
        if (d < 864e5) return Math.round(d / 3600e3) + ' 小时后';
        return Math.round(d / 864e5) + ' 天后';
      };
      body.append(h('div', { class: 'cd-stat' },
        '共 ' + st.total + ' 张 · 待复习 ' + st.due + ' 张 · 新卡 ' + st.fresh + ' 张 · 已滚满 ' + st.learned + ' 张'));

      const acts = h('div', { class: 'cd-acts' },
        h('button', { class: 'gw-btn primary', disabled: !st.due, onclick: () => review() }, '开始复习' + (st.due ? '（' + st.due + '）' : '')),
        h('button', { class: 'gw-btn', onclick: () => addCard() }, '+ 新卡'),
        h('button', { class: 'gw-btn', title: '把选中的文本块做成一张卡：第一块当正面，其余当背面', onclick: () => fromSel() }, '从选中文本出卡'));
      body.append(acts);

      if (!all.length) {
        body.append(h('p', { class: 'bk-hint' }, '还没有卡片。点「+ 新卡」手写一张，或者先选中画布上的几段文本再点「从选中文本出卡」。'));
        return;
      }
      const rows = h('div', { class: 'cd-list' });
      for (const c of all.slice().sort((a, b) => (a.due || 0) - (b.due || 0))) {
        rows.append(h('div', { class: 'cd-row' },
          h('div', { class: 'cd-box', title: '第 ' + ((c.box || 0) + 1) + ' 盒 / 共 ' + (GW.cards.MAX_BOX + 1) + ' 盒' }, String((c.box || 0) + 1)),
          h('div', { class: 'cd-txt' },
            h('b', null, c.front),
            h('span', null, c.back || '（背面为空）')),
          h('div', { class: 'cd-due' + ((c.due || 0) <= Date.now() ? ' on' : '') }, when(c.due || 0)),
          h('button', { class: 'tb-btn', title: '删除这张卡', html: I('trash'), onclick: async () => {
            if (await GW.confirm('删除这张卡？\n\n' + c.front)) { GW.cards.remove(c.id); draw(); }
          } })));
      }
      body.append(rows);
    };

    const addCard = (front, back) => {
      const f = h('textarea', { class: 'gw-in cd-ta', placeholder: '正面（题目 / 提示）' });
      const b = h('textarea', { class: 'gw-in cd-ta', placeholder: '背面（答案）' });
      if (front) f.value = front;
      if (back) b.value = back;
      GW.dialog({
        title: '新建记忆卡', ok: '加入', width: 460,
        body: h('div', null,
          h('label', { class: 'cd-lbl' }, '正面'), f,
          h('label', { class: 'cd-lbl' }, '背面'), b),
        onOk: () => {
          if (!GW.cards.add(f.value, b.value)) { GW.toast('正面不能为空'); return false; }
          draw();
          GW.toast('已加入记忆卡');
          return true;
        }
      });
    };

    const fromSel = () => {
      const items = (GW.selection && GW.selection.items) || [];
      const texts = items.filter((it) => it && it.type === 'text' && it.data && it.data.html);
      if (texts.length < 1) { GW.toast('先选一段文本（按住 Alt 可多选）'); return; }
      const plain = (o) => {
        const d = document.createElement('div');
        d.innerHTML = o.data.html;
        return (d.textContent || '').replace(/\s+/g, ' ').trim();
      };
      const front = plain(texts[0]).slice(0, 240);
      const back = texts.slice(1).map(plain).join(' ⏎ ').slice(0, 600);
      addCard(front, back);
    };

    const review = () => {
      const queue = GW.cards.due();
      if (!queue.length) { GW.toast('今天没有到期的卡'); return; }
      let i = 0, shown = false;
      body.innerHTML = '';
      const stage = h('div', { class: 'cd-stage' });
      const bar = h('div', { class: 'cd-rev-acts' });
      body.append(h('div', { class: 'cd-prog' }, ''), stage, bar);
      const prog = body.querySelector('.cd-prog');
      const nextCard = () => {
        if (i >= queue.length) {
          stage.innerHTML = '';
          stage.append(h('p', { class: 'bk-hint' }, '这一轮复习完了（' + queue.length + ' 张）。'));
          bar.innerHTML = '';
          bar.append(h('button', { class: 'gw-btn primary', onclick: () => { GW.showCards(); } }, '回到列表'));
          return;
        }
        const c = queue[i];
        shown = false;
        prog.textContent = '第 ' + (i + 1) + ' / ' + queue.length + ' 张 · 第 ' + ((c.box || 0) + 1) + ' 盒';
        stage.innerHTML = '';
        stage.append(h('div', { class: 'cd-face' }, c.front),
          h('div', { class: 'cd-back' }, c.back || '（背面为空）'));
        stage.querySelector('.cd-back').style.display = 'none';
        bar.innerHTML = '';
        bar.append(h('button', { class: 'gw-btn primary', onclick: () => {
          if (!shown) {
            shown = true;
            stage.querySelector('.cd-back').style.display = '';
            bar.innerHTML = '';
            for (const [g, label, cls] of [['again', '忘了', 'cd-g0'], ['hard', '有点难', 'cd-g1'], ['good', '记住了', 'cd-g2'], ['easy', '太简单', 'cd-g3']]) {
              bar.append(h('button', { class: 'gw-btn ' + cls, onclick: () => { GW.cards.grade(c.id, g); i++; nextCard(); } }, label));
            }
            return;
          }
        } }, '看背面'));
      };
      nextCard();
    };

    draw();
    drawer('记忆卡', null, body, { width: 'min(520px, 94vw)' });
  };

  // 1.6.7（T10）：录音时间轴播放器。录课时每一笔都记了相对毫秒数（lessonrec.js 的 GW.recMark），
  // 存在视频旁边的 .tl.json 里。这里做两件事：①时间条上按笔迹密度打点，点一下跳到那一刻；
  // ②「点画布上的笔迹跳到那一刻」—— Notability 的「点词跳转」在画布上的等价物。
  GW.showRecPlayer = async function (prefer) {
    const body = h('div', { class: 'dr-body' });
    const host = window.gewu;
    if (!(host && host.recFile && host.recFile.list)) {
      drawer('录音时间轴', null, h('div', { class: 'dr-body' }, h('p', { class: 'bk-hint' }, '时间轴回放需要桌面版：网页版没有本地录课目录。')), { width: 'min(560px, 94vw)' });
      return;
    }
    let list = [];
    try {
      const r = await host.recFile.list();
      list = (r && r.items) || [];
    } catch (e) { list = []; }
    if (!list.length) {
      drawer('录音时间轴', null, h('div', { class: 'dr-body' }, h('p', { class: 'bk-hint' }, '「录制」文件夹里还没有录课视频。先用「课堂 → 录课」录一段。')), { width: 'min(560px, 94vw)' });
      return;
    }
    const cur = list.find((x) => prefer && x.path === prefer) || list[0];
    const video = h('video', { class: 'rp-video', controls: '', preload: 'metadata', src: GW.fileURL(cur.path) });
    const bar = h('div', { class: 'rp-bar', title: '点一下跳到那一刻' });
    const fill = h('div', { class: 'rp-bar-fill' });
    const head = h('div', { class: 'rp-head' }, '');
    bar.append(fill);
    const listBox = h('div', { class: 'rp-list' });
    const seekBtn = h('button', { class: 'gw-btn', title: '打开后点画布上的任意一笔，视频跳到那一笔落笔的时刻' }, '点画布跳转：关');

    let tl = null, marks = [];
    const loadTl = async () => {
      marks = [];
      bar.querySelectorAll('.rp-dot').forEach((d) => d.remove());
      if (!cur.tlPath) { head.textContent = '这段录课没有时间轴（1.6.7 之前录的，或媒体栈不支持）'; return; }
      try {
        const txt = await host.readFile(cur.tlPath, 'utf8');
        tl = JSON.parse(txt);
        marks = (tl.marks || []).slice().sort((a, b) => a.t - b.t);
      } catch (e) { tl = null; marks = []; }
      head.textContent = marks.length
        ? ('共 ' + marks.length + ' 笔 · 时长 ' + fmtMS((tl && tl.ms) || 0) + ' · 时段 ' + (tl && tl.startedAt ? new Date(tl.startedAt).toLocaleString() : '未知'))
        : '时间轴是空的（这段录课期间没有落笔）';
      const total = (tl && tl.ms) || 1;
      for (const m of marks) {
        const d = h('span', { class: 'rp-dot', style: { left: (Math.min(1, m.t / total) * 100).toFixed(3) + '%' } });
        d.onclick = (e) => { e.stopPropagation(); seek(m.t); };
        bar.append(d);
      }
      listBox.innerHTML = '';
      for (const m of marks.slice(0, 400)) {
        listBox.append(h('button', { class: 'rp-row', onclick: () => seek(m.t) },
          h('span', { class: 'rp-t' }, fmtMS(m.t)),
          h('span', { class: 'rp-id' }, '第 ' + ((m.p || 0) + 1) + ' 页 · ' + String(m.id).slice(0, 10))));
      }
    };
    const fmtMS = (ms) => {
      const s = Math.max(0, Math.round((ms || 0) / 1000));
      return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    };
    const seek = (ms) => {
      try { video.currentTime = Math.max(0, ms / 1000); } catch (e) { /* 元数据还没到 */ }
      try { video.play(); } catch (e) { /* 没有手势 */ }
    };
    const tickProg = () => {
      const d = video.duration || 0;
      fill.style.width = (d ? Math.min(100, (video.currentTime / d) * 100) : 0).toFixed(2) + '%';
    };
    video.addEventListener('timeupdate', tickProg);
    bar.onclick = (e) => {
      const r = bar.getBoundingClientRect();
      const k = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
      const d = (tl && tl.ms) || (video.duration ? video.duration * 1000 : 0);
      if (d) seek(k * d);
    };

    // 点画布跳转：用一个可撤销的捕获监听器，抽屉关掉就摘掉
    let seeking = false;
    const onStage = (e) => {
      if (!document.body.contains(bar)) {   // 抽屉已经关了：自己摘掉，别留一个常驻捕获监听器
        document.removeEventListener('pointerdown', onStage, true);
        return;
      }
      if (!seeking || !GW.hitTop) return;
      if (!(e.target && e.target.closest && (e.target.closest('#stage') || e.target.closest('#capture')))) return;
      const r = document.getElementById('ink-canvas').getBoundingClientRect();
      const w = GW.toWorld(e.clientX - r.left, e.clientY - r.top);
      const hit = GW.hitTop(w);
      if (!hit) { GW.toast('这里没有笔迹'); return; }
      const m = marks.find((x) => x.id === hit.id);
      if (!m) { GW.toast('这一笔不在本次录课里'); return; }
      e.preventDefault();
      e.stopPropagation();
      seek(m.t);
      GW.toast('跳到 ' + fmtMS(m.t));
    };
    seekBtn.onclick = () => {
      seeking = !seeking;
      seekBtn.textContent = '点画布跳转：' + (seeking ? '开' : '关');
      seekBtn.classList.toggle('primary', seeking);
      if (seeking) document.addEventListener('pointerdown', onStage, true);
      else document.removeEventListener('pointerdown', onStage, true);
    };

    const sel = h('select', { class: 'gw-in', style: { maxWidth: '100%' } });
    for (const f of list) {
      sel.append(h('option', { value: f.path, selected: f.path === cur.path ? '' : null },
        f.name + ' · ' + Math.round(f.bytes / 1048576) + 'MB' + (f.tl ? ' · 有时间轴' : '')));
    }
    sel.onchange = () => {
      const f = list.find((x) => x.path === sel.value);
      if (!f) return;
      cur = f;
      video.src = GW.fileURL(f.path);
      loadTl();
    };

    body.append(head, sel, video, bar, h('div', { class: 'rp-tools' }, seekBtn), listBox,
      h('p', { class: 'bk-hint' }, '时间轴只记「第几笔、什么时候落下」，笔迹本身仍在板书里：先把对应的 .gewu 打开，再到这里回放，边听边看当时的书写顺序。'));
    const dr = drawer('录音时间轴', null, body, { width: 'min(620px, 96vw)' });
    dr.addEventListener('remove', () => document.removeEventListener('pointerdown', onStage, true));
    await loadTl();
  };

  // ===== T05：浏览器存储配额守卫 =====
  // browserQuota 由 storage.js 的 browserBackup() 置真（写 localStorage 抛 QuotaExceededError
  // 或文档超过 4MB）。这里只负责两件事：顶栏红条 + 写操作拦截。红条挂 body（见 app.css 注释）。
  function syncQuotaBar() {
    const st = GW.saveState ? GW.saveState() : null;
    const on = !!(st && st.quota);
    let bar = document.getElementById('quota-warn');
    if (on) {
      document.body.classList.add('quota-on');
      if (!bar) {
        bar = h('div', {
          id: 'quota-warn', role: 'alert', title: '点这里先导出 .gewu，再清理浏览器存储',
          onclick: () => { if (GW.storage && GW.storage.save) GW.storage.save(); },
        }, '⚠ 浏览器存储空间不足：先导出 .gewu 再继续（新建页 / 导入 / 插图已暂停）');
        document.body.append(bar);
      }
    } else if (bar) {
      bar.remove();
      document.body.classList.remove('quota-on');
    }
  }
  GW.syncQuotaBar = syncQuotaBar;
  // 返回 true = 已拦截（调用方直接 return），false = 放行。**不 throw** ——
  // 落在 pointerup / 拖放回调里，抛出去会中断整条事件链，连删除都做不了。
  GW.quotaGuard = function (what) {
    const st = GW.saveState ? GW.saveState() : null;
    if (!st || !st.quota) return false;
    GW.dialog({
      title: '先导出 .gewu 再继续', width: 470,
      ok: '导出 .gewu', cancel: '知道了',
      body: h('div', { style: { lineHeight: '1.7' } },
        '浏览器本地存储空间不足，' + (what || '这个操作') + '会失败。',
        h('br'),
        '先把当前板书导出成 .gewu（导出和删除仍然可用），再清理浏览器存储 / 换到桌面版继续。'),
      onOk: () => { if (GW.storage && GW.storage.save) GW.storage.save(); },
    });
    return true;
  };

  function buildTop() {
    const name = h('span', { id: 'doc-name' });
    const menuBtn = h('button', { class: 'tb-btn menu-btn', title: '菜单', html: I('menu') });
    menuBtn.onclick = () => showMainMenu(menuBtn);
    // 1.6.0：顶栏围绕「当前文档」排：菜单 → 文件名 → 保存状态 → 保存；品牌缩到最后，
    // 只保留识别度，不再抢文件名的主位。顺序在 DOM 里定，CSS 不靠 order 兜。
    const top = h('div', { id: 'topbar' },
      menuBtn,
      name,
      saveChipEl(),
      h('button', { class: 'tb-btn save-btn', title: '保存 (Ctrl+S)', html: I('save'), onclick: () => GW.storage.save() }),
      h('button', { class: 'tb-btn lesson-btn', title: '一节课', 'aria-label': '一节课', onclick: () => GW.classRoom.lesson() },
        h('span', { html: I('book') }), h('span', { class: 'lesson-btn-label' }, '一节课')),
      h('div', { class: 'brand', html: GW.LOGO }));
    top.querySelector('.brand').append(h('b', null, '数理无限画布'));
    document.body.append(top);
    const chip = top.querySelector('#save-chip');
    const upd = () => {
      const p = GW.doc.path;
      name.textContent = p ? p.split(/[\\/]/).pop().replace(/\.gewu$/, '') : '未命名板书';
      name.classList.toggle('dirty', GW.doc.dirty);
      paintSaveChip(chip);
    };
    ['dirty', 'saved', 'doc-loaded', 'save-state', 'autosaved'].forEach((ev) => GW.bus.on(ev, upd));
    upd();
    if (GW.isElectron) {
      const full = h('button', { class: 'tb-btn', title: '全屏 (F11)', html: I('focus'), onclick: () => window.gewu.win('full') });
      document.body.append(h('div', { id: 'winctl' },
        h('button', { class: 'tb-btn', title: '桌面画布', html: I('desktop'), onclick: () => desktopMode() }),
        h('button', { class: 'tb-btn', title: '最小化', html: I('minimize'), onclick: () => window.gewu.win('min') }),
        full,
        h('button', { class: 'tb-btn x', title: '退出', html: I('close'), onclick: () => askQuit(() => window.gewu.win('close')) })));
    } else {
      // 1.1.2：安卓 / 网页端右上角原本什么都没有 —— 手机横屏后菜单只剩左下角那颗球，
      // 想开设置找不到入口。这里只放两颗：设置（齿轮）与退出（✕），和桌面同款位置。
      // 1.1.2 用户反馈：菜单/全屏冗余（菜单球里已有、全屏安卓自己会管），改成齿轮 + ✕。
      // 关掉三条栏（chrome-off）时这一组也一起收起，行为和桌面一致。
      const doExit = () => {
        const nat = window.gewuNative;
        if (nat && typeof nat.exit === 'function') { nat.exit(); return; }
        // 浏览器里打开的网页版：先试 window.close()（只对脚本打开的窗口有效），
        // 不行就退回「返回上一页」，再不行提示用户自己关标签页。
        try { window.close(); } catch (e) { /* ignore */ }
        setTimeout(() => {
          if (!document.hidden) {
            try { history.length > 1 ? history.back() : GW.toast('直接关掉这个标签页就可以退出'); }
            catch (e) { GW.toast('直接关掉这个标签页就可以退出'); }
          }
        }, 120);
      };
      document.body.append(h('div', { id: 'winctl' },
        h('button', { class: 'tb-btn', title: '设置', html: I('settings'), onclick: () => showSettings() }),
        h('button', { class: 'tb-btn x', title: '退出', html: I('close'), onclick: () => askQuit(doExit) })));
    }
  }
  function desktopMode() {
    // 1.1.14：重做桌面批注。
    //   · 主用法改成「透明批注层」：主进程开一个全屏透明置顶窗口加载 index.html?overlay=1，
    //     画布的全部功能（书写、图形、模板、尺规、仿真、对象、撤销、网格、四角 UI、底栏、悬浮球）都在里面。
    //   · 整屏「采集画面模式」按反馈删掉（画面每秒刷新一次、和本机桌面打架）；
    //     但**单个应用窗口**的采集还有用，保留在「窗口画布」里。
    if (!GW.isElectron) return GW.toast('桌面批注仅在桌面版中可用');
    // 已经在透明批注层里：这个入口改成「退出」
    if (GW.overlayMode) { if (GW.overlay) GW.overlay.exit(); return; }
    const enterOverlay = () => { if (GW.overlay && GW.overlay.open) GW.overlay.open(); else window.gewu.desktopMode(); };
    const dlg = GW.dialog({
      title: '桌面批注',
      width: 540,
      noFooter: true,
      body: h('div', { class: 'dm-pick' },
        h('p', { class: 'dm-tip' }, '两种用法，选一个：'),
        h('button', {
          class: 'dm-opt', type: 'button',
          onclick: () => { dlg.close(); enterOverlay(); },
        },
        h('b', null, '透明批注层（推荐）'),
        h('span', null, '在系统最上层铺一层「完全透明」的画布：笔、荧光笔、橡皮、图形、学科模板、尺规、仿真、对象、撤销、网格全都能用，可以直接标在 PPT、网页、任何软件上。Ctrl+Alt+D 切「鼠标模式」即可正常操作下面的软件，再按一次回来。')),
        h('button', {
          class: 'dm-opt', type: 'button',
          onclick: () => { dlg.close(); if (GW.desk) GW.desk.toggle(); },
        },
        h('b', null, '窗口画布（采集单个应用窗口）'),
        h('span', null, '把某一个应用窗口的画面铺在画布上当背景：书写、图形、公式、框选、撤销、导出都能用；画面约每秒刷新 8 次，只支持单个应用窗口。'))),
    });
  }
  GW.desktopMode = desktopMode;

  function showMainMenu(anchor) {
    const mi = (icon, label, fn, kbd) => h('button', { class: 'mi', onclick: () => { closePop(); fn(); } }, h('span', { html: I(icon) }), label, kbd ? h('kbd', null, kbd) : null);
    const grp = (label) => h('div', { class: 'mi-g' }, label);
    const recent = (GW.settings.recent || []).slice(0, 6);
    const el = h('div', { class: 'menu-list main-menu-list' },
      grp('板书文件'),
      // 1.5.3（P1）：备份失败就不许清空 —— 旧写法不检查 autosave 的返回值，
      // 磁盘拒写时会把老师正在讲的板书直接换掉，还提示"可以从备份恢复"。
      mi('plus', '新建板书', async () => {
        if (GW.classRoom?.isPlaying()) GW.classRoom.stopPlay();
        if (GW.doc.dirty) {
          if (!(await GW.confirm('新建会清空当前画布，未保存的内容会先存入自动备份。继续吗？'))) return;
          const ok = await GW.storage.autosave(true);
          if (!ok) {
            const err = (GW.saveState && GW.saveState().backup.err) || '磁盘写入失败';
            GW.toast('自动备份失败（' + err + '），已取消新建，当前板书还在', 4600);
            return;
          }
        }
        GW.storage.newDoc();
      }),
      mi('folder', '打开…', () => GW.storage.open(), 'Ctrl+O'),
      mi('save', '保存', () => GW.storage.save(), 'Ctrl+S'),
      mi('copy', '另存为…', () => GW.storage.save(true), 'Ctrl+Shift+S'),
      mi('refresh', '恢复自动备份…', () => GW.showBackups()),
      recent.length ? h('details', { class: 'menu-recent' }, h('summary', null, '最近打开'),
        recent.map((p) => mi('pages', p.split(/[\\/]/).pop(), () => GW.storage.open(p)))) : null,
      h('div', { class: 'mi-sep' }),
      grp('课堂'),
      mi('book', '一节课…', () => GW.classRoom.lesson()),
      mi('pages', '插入 PPT 课件…', () => GW.importer.pick('pptx')),
      mi('folder', '课件资源与携带包…', () => GW.deps.dialog()),
      mi('maximize', '全屏演示与提词…', () => GW.present.start(), 'Ctrl+Alt+P'),
      mi('play', '录音时间轴…', () => GW.showRecPlayer()),
      mi('pages', '平板协同（局域网）…', () => GW.lansync.open()),
      // 2.2.0：电脑接收手机画面（临时视图层，不进板书、不进导出、不进协同）
      // 2.2.1：安卓 App 也能从这里发起投屏（手机当发送端，见 core/castphone.js）—— 所以不再按 isElectron 隐藏，
      //        由 GW.openCast 自己分派：电脑开接收面板，手机开发送面板，都没有就 toast 说明原因。
      mi('desktop', '手机投屏（屏幕 / 摄像头）…', () => GW.openCast()),
      GW.isElectron ? mi('pages', '导入课程表（.ics）…', () => GW.importCalendar()) : null,
      h('div', { class: 'mi-sep' }),
      grp('导出与打印'),
      mi('export', '导出当前画面为图片', () => GW.storage.exportView()),
      mi('export', '导出 PDF / SVG…', () => GW.exporter.open()),
      mi('export', '打印当前画面…', () => GW.printView()),
      h('div', { class: 'mi-sep' }),
      grp('页面与内容'),
      mi('search', '搜索内容…', () => GW.search.open(), 'Ctrl+F'),
      mi('pages', '整页模板…', () => GW.newPageDialog()),
      mi('pages', '大纲 / 目录…', () => GW.showOutline(), 'Ctrl+Alt+O'),
      mi('pages', '记忆卡 / 复习…', () => GW.showCards(), 'Ctrl+Alt+K'),
      mi('bg', '背景与底纹…', () => bgPop(anchor)),
      // 1.6.8（R8/R9）：分页版式与页边距
      // 2.0.8：勾选状态按「这一页现在有没有纸框」算（2.0.7 起有限性是页级属性），
      // 文案也跟着改 —— 纸外不再是隐藏区，纸框只管纸张/页框画到哪、整页导出取哪一块。
      mi('pages', (GW.pageBox && GW.pageBox() ? '✓ ' : '') + '分页版式（纸张 + 页框）', () => {
        const to = GW.pageBox && GW.pageBox() ? 'infinite' : 'paged';
        GW.setLayout(to);
        GW.toast(to === 'paged' ? '已切到分页版式：纸张与页框，纸外照常书写' : '已切回无限画布', 2600);
      }),
      mi('pages', '页边距与装订线…', () => GW.pageMarginDialog()),
      h('div', { class: 'mi-sep' }),
      grp('设置与帮助'),
      mi('settings', '自定义工具栏…', () => openSettingsPage('dock')),
      mi('settings', '设置', showSettings, 'Ctrl+,'),
      mi('star', '关于数理无限画布', showAbout),
      mi('power', '退出', exitApp));
    pop(anchor, el, { place: 'bottom' });
  }
  // 1.6.6（T03）：打印。走「先出矢量 PDF，再交系统默认阅读器」这条路：
  // webContents.print() 打的是整个窗口（顶栏、Dock、悬浮球都进纸），而画布本来就有矢量 PDF 导出。
  // 老师在阅读器里按 Ctrl+P，纸张上只有板书本身。
  GW.printView = async () => {
    const rect = GW.exporter.pickRect('view');
    if (!rect || rect.w < 1 || rect.h < 1) { GW.toast('这一页还是空的，没有可打印的内容'); return; }
    const g0 = gwBridge();
    const printPdf = g0 && g0.isElectron && typeof g0.printPdf === 'function' ? g0.printPdf : null;
    if (!printPdf) {
      // 网页 / 安卓没有桌面那条「先出 PDF 再交系统阅读器」的路，交给 exporter.print 自带的两条等价实现：
      // 安卓走 gewuNative.printPdf（失败退回存 PDF），网页开一个 iframe 调 frame.contentWindow.print()。
      if (GW.exporter.print) return GW.exporter.print(rect, { bg: true, paper: 'a4', nativeView: true });
      return GW.exportPDF();
    }
    if (GW.progress) GW.progress('正在生成可打印的 PDF…');
    try {
      const b64 = await GW.exporter.pdf(rect, { bg: true, paper: 'a4', nativeView: true });
      const r = await printPdf(b64);
      if (!r || !r.ok) GW.toast('打印失败：' + ((r && r.error) || '未知原因'), 4200);
      else GW.toast('已用系统默认阅读器打开，按 Ctrl+P 打印', 3600);
    } catch (e) {
      GW.toast('打印失败：' + (e && e.message ? e.message : e), 4200);
    } finally {
      if (GW.progress) GW.progress(null);
    }
  };

  // 1.6.6（T04）：导入课程表（.ics）。文件只取文本，解析与排提醒都在主进程（见 main/calendar.js）：
  // 渲染层碰不到调度器，导入后立刻就能看到「未来 3 天排上几节」。
  GW.importCalendar = () => {
    if (!GW.isElectron || !window.gewu.calendar) { GW.toast('课程表导入只在桌面版可用'); return; }
    const inp = h('input', { type: 'file', accept: '.ics,text/calendar', style: { display: 'none' } });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      try {
        const text = await f.text();
        const r = await window.gewu.calendar.importICS(text);
        if (!r || !r.ok) { GW.toast('导入失败：' + ((r && r.error) || '没有读到日程'), 4200); return; }
        GW.toast('已导入 ' + r.events + ' 条日程；未来 3 天排上 ' + (r.scheduled || 0) + ' 个上课提醒', 4600);
      } catch (e) {
        GW.toast('导入失败：' + (e && e.message ? e.message : e), 4200);
      }
    });
    document.body.append(inp);
    inp.click();
  };

  // =============== 底部工具栏 ===============
  // 每个按钮只在 dockMeta 里登记一次（图标 / 文案 / 点击 / 分组），按钮本体由 layoutDock()
  // 按 settings.uiCustom 的顺序与显隐重建 —— 这样「界面自定义」只要改配置，别的代码不用动。
  const dockBtns = {};
  const dockMeta = {};
  const DOCK_ORDER = ['hand', 'select', 'pen', 'hl', 'eraser', 'shape', 'text', 'laser',
    'insert', 'math', 'physics', 'geo', 'class', 'res', 'shelf', 'undo', 'redo'];
  const DOCK_GROUP = {
    hand: 'tool', select: 'tool', pen: 'tool', hl: 'tool', eraser: 'tool', shape: 'tool', text: 'tool', laser: 'tool',
    insert: 'insert', math: 'insert', physics: 'insert', geo: 'insert', class: 'insert', res: 'insert',
    shelf: 'edit', undo: 'edit', redo: 'edit',
  };
  // 四角控件：id / 设置里显示的名字 / 默认停靠的角
  const CORNER_KEYS = [
    ['topbar', '顶栏（菜单、文件名）', 'tl'],
    ['winctl', '窗口按钮（最小化 / 全屏 / 关闭）', 'tr'],
    ['zoombar', '缩放条', 'bl'],
    ['pagebar', '页码条', 'br'],
  ];
  const CORNER_NAME = { tl: '左上', tr: '右上', bl: '左下', br: '右下' };
  const DOCK_POS_NAME = { bottom: '底部居中', top: '顶部', left: '左侧竖排', right: '右侧竖排' };
  // 1.4.4（R3）：工具栏改成「固定 N 个槽」，每槽可放动作目录里的任意一项。
  // N 取 DOCK_ORDER 的长度（17）而不是方案写的 16 —— redo 是后来加的，
  // scripts/probe-ui-custom.js 硬断言默认 17 个按钮 / 17 行，槽位数必须跟着它走。
  const SLOT_N = DOCK_ORDER.length;
  // 动作目录：系统按钮（17）+ 基础图形（16）+ 学科模板（全部）+ 笔的四个参数。
  // 每项 { id, label, group, icon, kind }；kind='sys' 的复用 dockMeta 里的图标与点击，
  // 其余由 runDockAction() 分派（shape:<模板id> 就是「选图形工具」的等价操作）。
  function dockActions() {
    const out = [];
    for (const id of DOCK_ORDER) {
      const d = dockMeta[id];
      if (d) out.push({ id: id, label: d.label, group: DOCK_GROUP[id] || 'tool', icon: d.icon, kind: 'sys' });
    }
    if (GW.SHAPES) {
      for (const s of GW.SHAPES) {
        const id = s[0];
        if (id === 'curve') continue;        // 曲线拟合要真实笔迹，做不了按钮
        out.push({ id: 'shape:' + id, label: s[1], group: '基础图形', icon: 'shapes', kind: 'shape' });
      }
    }
    if (GW.stencils && GW.stencils.list) {
      for (const s of GW.stencils.list) {
        out.push({
          id: 'shape:' + s.id, label: s.label, icon: 'math', kind: 'shape',
          group: (s.group && s.group !== '通用') ? s.group + '模板' : '通用模板',
        });
      }
    }
    for (const [k, label] of [['color', '笔的颜色'], ['width', '笔的粗细'], ['dash', '笔的线型'], ['mode', '笔的模式']]) {
      out.push({ id: 'pen:' + k, label: label, group: '笔与智能笔', icon: 'pen', kind: 'pen' });
    }
    // 2.2.3（R1）：值类动作 —— 点一下就把笔设成某个具体值（不再只是「打开面板，还得再点一次」）。
    // 四个族各占一个 optgroup，排在上面那四个「打开面板」之后、学科模板之前看不看得见无所谓，
    // 关键是 id 前缀互不为前缀（penColor: / penWidth: / penDash: / penInk: 与旧的 pen: 不撞）。
    for (const c of COLORS) {
      out.push({ id: 'penColor:' + c, label: '笔色 · ' + colorName(c), group: '笔色（点一下就设定）', icon: 'pen', kind: 'penColor', sw: c });
    }
    for (const w of WIDTHS) {
      out.push({ id: 'penWidth:' + w, label: '粗细 · ' + w + ' px', group: '粗细（点一下就设定）', icon: 'pen', kind: 'penWidth', w: w });
    }
    for (const [k, label, da] of [['solid', '实线', ''], ['dashed', '虚线', '5 4'], ['dotted', '点线', '1 3']]) {
      out.push({ id: 'penDash:' + k, label: '线型 · ' + label, group: '线型（点一下就设定）', icon: 'pen', kind: 'penDash', da: da, styleKey: k });
    }
    if (GW.inkStyle && GW.inkStyle.list) {
      for (const st of GW.inkStyle.list()) {
        out.push({ id: 'penInk:' + st.id, label: '笔种 · ' + st.label, group: '笔种（点一下就设定）', icon: 'pen', kind: 'penInk', inkId: st.id });
      }
    }
    return out;
  }
  let dockActCache = null;
  function dockAction(id) {
    if (!dockActCache) {
      dockActCache = {};
      for (const a of dockActions()) dockActCache[a.id] = a;
    }
    return dockActCache[id] || null;
  }
  // dockMeta 由 buildDock() 填，动作目录要等它填完 —— 缓存因此在第一次取用时才建。
  function dropDockActCache() { dockActCache = null; }
  const actionBtns = {};
  function actionBtn(id) {
    if (actionBtns[id]) return actionBtns[id];
    const a = dockAction(id);
    if (!a) return null;
    const b = h('button', { class: 'dk', title: a.label, 'data-id': id, 'data-act': id },
      h('span', { html: I(a.icon) }), h('span', null, a.label));
    b.addEventListener('click', () => runDockAction(id, b));
    actionBtns[id] = b;
    return b;
  }
  function runDockAction(id, b) {
    if (id.indexOf('shape:') === 0) {
      // 跟图形面板里点一下等价：记住要画哪个图形，回到画布拖框。
      const k = id.slice(6);
      GW.tool.shape.type = k;
      GW.tool.shape.pbKey = '';
      GW.tool.shape.msKey = '';
      GW.tool.set('shape');
      closePop();
      return;
    }
    // 2.2.3（R1）：值类动作必须排在 `pen:` 分支**之前** —— 否则 'penColor:#e02020' 也会命中
    // indexOf('pen:')===0？不会（第 4 个字符是 C 不是 :），但 'pen:' 与这四个族只差一个字符，
    // 顺序摆错一次就再也查不出来。四种前缀互不为前缀，且都在这里显式判全串。
    if (id.indexOf('penColor:') === 0) { if (GW.setPenColor) GW.setPenColor(id.slice(9)); closePop(); return; }
    if (id.indexOf('penWidth:') === 0) { const w = Number(id.slice(9)); if (GW.setPenWidthPick) GW.setPenWidthPick(isFinite(w) && w > 0 ? w : 3); closePop(); return; }
    if (id.indexOf('penDash:') === 0) { if (GW.setPenStyle) GW.setPenStyle(id.slice(8)); closePop(); return; }
    if (id.indexOf('penInk:') === 0) { if (GW.setPenInk) GW.setPenInk(id.slice(7)); closePop(); return; }
    if (id.indexOf('pen:') === 0) { GW.tool.set('pen'); if (penPop) penPop(b, id.slice(4)); return; }
    const d = dockMeta[id];
    if (d) d.onClick(b);
  }

  // 快捷键提示：撤销/重做一直能用键盘（input.js 的 keydown：Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y），
  // 但界面上从没写过，老师以为没有这个功能。tooltip 里补一行，跟「文件」菜单里写 Ctrl+S 一致。
  const KEY_HINT = { undo: 'Ctrl+Z', redo: 'Ctrl+Y' };
  const hintOf = (id) => (KEY_HINT[id] ? '（' + KEY_HINT[id] + '）' : '');
  function dk(id, icon, label, onClick, more) {
    dockMeta[id] = { id: id, icon: icon, label: label, onClick: onClick, more: !!more, group: DOCK_GROUP[id] || 'tool' };
  }
  function toolBtn(id, icon, label, popFn) {
    dk(id, icon, label, (b) => {
      if (GW.tool.current === id && popFn) { if (curPop && curPop.anchor === b) closePop(); else popFn(b); }
      else { GW.tool.set(id); closePop(); }
    }, !!popFn);
  }
  function makeDockBtn(id) {
    const d = dockMeta[id];
    // 撤销/重做在 tooltip 里带上键盘快捷键（其余按钮 hintOf 返回空串，title 与从前一模一样）
    const b = h('button', { class: 'dk' + (d.more ? ' has-more' : ''), title: d.label + hintOf(id), 'data-id': id },
      h('span', { html: I(d.icon) }), h('span', null, d.label));
    // 1.3.0（R4b）：撤销/重做改用 pointerdown。`click` 要求 pointerdown/up 落在**同一个元素**上，
    // 平板上 48px 的 .dk 用手指点、轻微一滑，pointerup 就落到邻居或画布上，click 根本不派发
    // —— 这就是老师说的「撤销按键要多点几次才有响应」。其余按钮仍用 click，免得误触切工具。
    if (id === 'undo' || id === 'redo') {
      b.addEventListener('pointerdown', (e) => {
        if (b.disabled) return;
        e.preventDefault();                       // 吃掉后续的 click 合成，不会双触发
        d.onClick(b);
      });
      b.addEventListener('click', (e) => {        // 键盘 Enter / 辅助技术仍然能点
        if (e.detail === 0 && !b.disabled) d.onClick(b);
      });
    } else {
      b.addEventListener('click', () => d.onClick(b));
    }
    dockBtns[id] = b;
    return b;
  }

  // ---------- 界面自定义：工具栏按钮的显隐 / 顺序 / 整条位置，四角控件各自停靠的角 ----------
  function uiCfg() {
    const d = GW.settings.uiCustom || {};
    const ok = {};
    for (const a of dockActions()) ok[a.id] = 1;
    // 1.4.4（R3）：slots 是真源。老配置里只有 order/hidden ⇒ 按 order 在**内存里**补出 slots，
    // **不写盘**；只有老师真改了某一槽才 saveUiCfg() 落盘。这样 `uiCustom === null` 仍是
    // 「默认态」（scripts/probe-ui-custom.js 依赖这个语义）。
    let slots = (Array.isArray(d.slots) ? d.slots : []).filter((id) => ok[id]);
    if (slots.length !== SLOT_N) {
      const base = (Array.isArray(d.order) ? d.order : []).filter((id) => ok[id]);
      for (const id of DOCK_ORDER) if (base.indexOf(id) < 0) base.push(id);
      slots = base.slice(0, SLOT_N);
      while (slots.length < SLOT_N) slots.push(DOCK_ORDER[slots.length] || DOCK_ORDER[0]);
    }
    return {
      dockPos: ['bottom', 'top', 'left', 'right'].indexOf(d.dockPos) >= 0 ? d.dockPos : 'bottom',
      slots: slots,
      // order 与 slots 同步（老接口 GW.uiCustom.move / items 仍按它工作）
      order: slots.slice(),
      hidden: (Array.isArray(d.hidden) ? d.hidden : []).filter((id) => ok[id]),
      corners: Object.assign({}, d.corners || {}),
      cornersOff: (Array.isArray(d.cornersOff) ? d.cornersOff : []).slice(),
    };
  }
  function saveUiCfg(c) {
    // order 与 slots 同值：1.3.x 及更早只认 order（老探针 scripts/probe-ui-custom.js 也读它），
    // 1.4.4 起 slots 是真源。两份都写，老版本读得懂、新版本以 slots 为准。
    GW.settings.uiCustom = {
      slots: c.slots.slice(), order: c.slots.slice(), hidden: c.hidden.slice(), dockPos: c.dockPos,
      corners: c.corners, cornersOff: c.cornersOff.slice(),
    };
    GW.saveSettings(); layoutDock();
  }
  // 底栏的基准尺寸只从 CSS 自定义属性读（app.css 顶部的 :root），JS 里不再写死边距/高度。
  // 1.0.11 之前是两处硬编码（#dock 走 CSS 的 14/72，两条侧栏走这里的 18/52），
  // 差 (72-52)/2 - (18-14) 就是用户看到的那点错位。
  let barMetrics = null;
  function barM() {
    if (barMetrics) return barMetrics;
    const cs = getComputedStyle(document.documentElement);
    const px = (n, d) => { const v = parseFloat(cs.getPropertyValue(n)); return isFinite(v) ? v : d; };
    barMetrics = {
      edge: px('--bar-edge', 14), top: px('--bar-top', 12), bottom: px('--bar-bottom', 14),
      hDock: px('--bar-h', 72), hSmall: px('--bar-h-sm', 52),
    };
    return barMetrics;
  }
  // 底部三条栏必须落在同一行：按实测宽度算等比收缩系数 k，写进 --k（三条一起缩，中线一起对齐）。
  // 旧做法按视口宽一刀切（w < 1600 就把两条侧栏抬到 96px），而 Windows 缩放改的正是 CSS 宽：
  // 1920 屏在 125% / 150% 下 CSS 宽是 1536 / 1280，都会命中，侧栏因此比工具栏高 82px。
  // 需要的宽度 = 半屏要装下「边距 + 侧栏 + 间隙 + 半条工具栏」，与实际按钮数有关，所以运行期量。
  // 只有 CSS 宽 < 1000（手机、竖屏平板）才继续用旧的上下错开，否则按钮会缩到点不准。
  // 1.4.3：手机横屏也要「三条栏同一行」（安卓端反馈三条栏上下错开很难看）。
  // 只有竖屏手机（<560）才上下错开；横屏时 k 一路压到 0.42 —— 按钮虽小，但位置与桌面端一致。
  const ROW_MIN_W = 560, K_MIN = 0.42, BAR_GAP = 8;
  function fitRow(dockPos) {
    const dockEl = document.getElementById('dock');
    const vw = window.innerWidth || 1280;
    // 2.2.5（安卓端「按钮太大、放不下」）：粗指针 + 窄屏改成「铺满屏宽 + 44px 触摸下限 + 换行」。
    // 旧行为把 k 钉在 0.92 再限宽横向滚动 —— 390px 竖屏只能同时看到 7~8 个按钮，老师判定为
    // 「按钮太大放不下」。换行后 17 个按钮在 390px 屏排 8+8+1 三行（8×44+7×1=359 ≤ 382），一次可见全部。
    // ≥900（平板横屏 / 桌面）条件不成立，仍走原来的等比收缩，行为不变。
    const row = dockPos === 'bottom' || dockPos === 'top';
    const vh = window.innerHeight || 800;
    const coarse0 = !!(GW.isTouchUI && GW.isTouchUI());
    // 换行档只给「手机」：竖屏（宽 < 600）或横屏（高 ≤ 560 且宽 < 900）。平板与桌面不换行，
    // 它们本来就有等比收缩，换行反而会把两条侧栏顶到画布中间。
    const compact = !!(row && coarse0 && (vw < 600 || (vh <= 560 && vw < 900)));
    // compact 时一定要连带 stacked：两条侧栏要按 dock 的实测高度抬到它上方，
    // 否则 17 个按钮铺满整行后正好压在缩放条/页码条上（横屏实测重叠 11522px²）。
    const stacked = !!row && (vw < ROW_MIN_W || compact);
    document.body.classList.toggle('dock-compact', compact);
    const b = barM();
    let k = 1, dx = 0;
    const zb = document.getElementById('zoombar'), pg = document.getElementById('pagebar');
    // 两条侧栏宽度本来就不一样（缩放条 248 / 页码条 210），所以「左右留白相等」不能靠视口居中：
    // 必须让工具栏中心落在「左侧栏右边缘」与「右侧栏左边缘」的正中间 —— 差半宽 (zw-pw)/2 再乘 k。
    const zw = (zb && zb.offsetWidth) || 248, pw = (pg && pg.offsetWidth) || 210;
    if (row && !compact && !stacked && dockEl) {
      // k 由「三条自然宽 + 两个边距 + 两个最小间隙」一起摊：vw = 2*edge + k*(dw+zw+pw) + 2*gap
      k = Math.max(K_MIN, Math.min(1, (vw - 2 * b.edge - 2 * BAR_GAP) / (zw + pw + (dockEl.offsetWidth || 1056))));
      dx = (zw - pw) * k / 2;
      dockEl.style.maxWidth = 'none';                 // k 已保证视觉不越界，不需要横向滚动
      // 1.1.10（平板网页端）：粗指针设备上按钮再缩就点不准了 —— 触屏的 .dk 基础是 48px，
      // 掉到 44px 以下（k<0.92）老师就会「按半天没反应」。这时候不再整体缩小，而是把 k 钉在
      // 0.92，让底部工具栏自己限宽 + 横向滚动（CSS 里本来就有 overflow-x:auto）。
      // 缩放条/页码条仍按 k=0.92 与工具栏中线对齐，两条侧栏不被工具栏盖住。
      // 注意：限宽必须**每次都写**。只在 k<0.92 时写会来回抖 —— 限宽生效后下一轮算出的 k
      // 正好是 0.92（不再进入这个分支），maxWidth 被上面那句 'none' 复位成不限宽，工具栏
      // 又撑回自然宽 832px、盖住左右两条侧栏（1.1.10 第一版就踩了这个坑，实测重叠 4396px²）。
      const coarse = !!(GW.isTouchUI && GW.isTouchUI());
      if (coarse) {
        // 2.2.3（跨端比例对齐）：这里的 0.92 原来是按「触屏 .dk 基础 48px」写死的（48×0.92≈44.16）。
        // 现在工具栏按钮在平板上与桌面同尺寸（60×58），48 与 60 混写会让同一个 --k 得到两种
        // 按钮大小 —— 地表按 44px 触摸下限反算：kTap = 44 / 实测按钮宽。横屏手机那档 CSS 仍给
        // 48px，于是 kTap≈0.917，与旧行为一致；平板档（≥1280）60px 得 kTap≈0.733，于是 --k 能一路
        // 落到桌面同款比例（1280 宽实测 k=0.790、工具栏占屏宽 67.3%，桌面同宽是 68.5%）。
        const dkEl = dockEl.querySelector('.dk');
        const dkCss = (dkEl && dkEl.offsetWidth) || 60;
        const kTap = Math.min(1, 44 / dkCss);
        if (k < kTap) k = kTap;
        dx = (zw - pw) * k / 2;
        const room = Math.max(240, Math.floor((vw - 2 * b.edge - 2 * BAR_GAP) / k - zw - pw));
        dockEl.style.maxWidth = room + 'px';
      }
    } else if (compact && dockEl) {
      // 换行档：必须写成一个**足够的 px**。#dock 是 fixed + translateX(-50%) 的收缩宽元素，
      // 把 maxWidth 置成 'none' 时它按 shrink-to-fit 缩到 min-content（实测只剩 195px），
      // 17 个按钮被挤成 5 行、工具栏高 228px。给足 (vw - 8) 后 390px 屏排 8+8+1 三行。
      dockEl.style.maxWidth = Math.max(200, vw - 8) + 'px';
    } else if (dockEl) dockEl.style.maxWidth = '';    // 手机档恢复「限宽 + 横向滚动」
    // 1.1.10：两条侧栏的缩放系数拆成独立的 --ks —— 单行布局时它就是 k（三条一起缩）；
    // 手机竖屏（stacked）时保持 1：390px 宽下 264+222=486 > 390，缩放条与页码条会直接压
    // 在一起（实测重叠 6272px²），但把按钮缩到按不准更糟 —— 改成把页码条用 --side-lift
    // 抬到缩放条上一行，两条都保住 44px。
    const ks = (row && !stacked) ? k : 1;
    const fits = (zw + pw) + 2 * b.edge + BAR_GAP <= vw;
    const lift = (stacked && !fits) ? Math.round(b.hSmall + BAR_GAP) : 0;
    document.documentElement.style.setProperty('--side-lift', lift + 'px');
    document.documentElement.style.setProperty('--ks', String(ks));
    document.documentElement.style.setProperty('--k', String(k));
    document.documentElement.style.setProperty('--dx', (row && !stacked ? dx : 0) + 'px');
    return { k: k, ks: ks, row: row, stacked: stacked };
  }
  // 四角的基准位置：三条栏的边距/高度一律取 barM()；两条侧栏的底边随 k 抬到「与工具栏中线重合」
  // 注意 bottom 返回的是 CSS 表达式（不是 px 数字）：它引用 --k，所以 k 一变就自动跟着变，
  // 不需要再跑一遍 applyCorners（CSS 里 #zoombar/#pagebar 的 bottom 用的是同一个表达式）。
  function cornerBase(id, key, r) {
    const b = barM();
    const tiny = (window.innerWidth || 1280) < 500;
    const edge = tiny ? 8 : b.edge;
    const north = key === 'tl' || key === 'tr', east = key === 'tr' || key === 'br';
    // 中线对齐：侧栏视觉高 hSmall*k、工具栏视觉高 hDock*k，两者底边差 (hDock-hSmall)*k/2
    // 1.1.10：末尾统一加 --safe-b（= 用户设的「底部额外内缩」+ 网页端视觉视口底部空档 + 系统手势条），
    // 平板/手机网页端下方按钮条被浏览器工具栏盖住，就是靠这一项把它们整体抬起来。
    // 1.1.10：手机竖屏（stacked）里两条侧栏按 --side-lift 把后一条抬到上一行，互不压住。
    const liftExpr = (id === 'pagebar') ? ' + var(--side-lift, 0px)' : '';
    // 中线对齐用**工具栏实测高度**，不用 CSS 里的 --bar-h（72 是出厂值）：1.1.10 给工具栏加了
    // 可调内边距，用户把 padding 调到 8 时真实高度是 76，再按 72 算中线就会差 1.8px
    // （probe-bar-align 就是这么红的）。offsetHeight 不受 transform 影响，正好是要的那一档。
    const dockEl = document.getElementById('dock');
    const dh = (dockEl && dockEl.offsetHeight) || b.hDock;
    // 2.2.0：窄屏堆叠时基准统一收到 96px（原来 <500 宽用 156px，是给工具参数条让位 ——
    // 参数条顶在工具栏上方约 116~160px 这一带）。现在窄屏下参数条改为隐藏（app.css 末尾
    // 的 max-width:560px 块），不再有那一行，156 的让位就变成纯浪费，画布白丢 60px。
    // 2.2.5：堆叠档不再写死 96px。工具栏在手机档会换行成 2~3 行（body.dock-compact），高度随
    // 按钮数变（56~150px），写死 96 会被抬高的工具栏整个盖住两条侧栏。改用实测高度 dh + 一条间隙。
    const bottom = (r.stacked ? ('var(--bar-bottom) + ' + (dh + BAR_GAP) + 'px' + liftExpr)
      : 'var(--bar-bottom) + (' + dh + 'px - var(--bar-h-sm)) * var(--k) / 2') + ' + var(--safe-b, 0px)';
    // 1.1.10：顶部同样要躲 —— 键盘弹出 / 网页端在 Safari 里滚动时，fixed 的顶栏会被
    // 视觉视口推到屏幕外（四个角落的工具栏「看不见」的另一半原因）。用 CSS 表达式而不是数字，
    // 这样 vv.offsetTop 变（软键盘、地址栏收起）不用再跑一遍 applyCorners。
    const topExpr = 'var(--bar-top) + var(--safe-t, 0px)';
    if (id === 'zoombar' || id === 'pagebar') {
      return north ? (east ? { right: edge, top: topExpr } : { left: edge, top: topExpr })
                   : (east ? { right: edge, bottom: bottom } : { left: edge, bottom: bottom });
    }
    return north ? (east ? { right: b.edge, top: topExpr } : { left: b.edge, top: topExpr })
                 : (east ? { right: b.edge, bottom: b.bottom } : { left: b.edge, bottom: b.bottom });
  }
  function applyCorners(cfg) {
    const r = fitRow(cfg.dockPos);
    const used = {};
    for (const [id, , def] of CORNER_KEYS) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (cfg.cornersOff.indexOf(id) >= 0) { el.style.display = 'none'; continue; }
      el.style.display = '';
      // 只允许「四角」之一：用户选的角决定 left/right 与 top/bottom 的基准
      const key = CORNER_NAME[cfg.corners[id]] ? cfg.corners[id] : def;
      const base = cornerBase(id, key, r);
      const n = used[key] || 0; used[key] = n + 1;
      // 同一个角上有两个控件时依次错开；按「缩放后的视觉高度」算，否则 k<1 时会叠在一起
      const shift = n * (((el.offsetHeight || 44) * r.k) + BAR_GAP);
      el.style.left = 'auto'; el.style.right = 'auto'; el.style.top = 'auto'; el.style.bottom = 'auto';
      // 缩放原点钉在「贴边的那一角」：k<1 时左边距/底边距不会跟着缩，视觉上仍贴边 14px
      el.style.transformOrigin = (base.left == null ? 'right' : 'left') + ' ' + (base.top == null ? 'bottom' : 'top');
      if (base.left != null) el.style.left = base.left + 'px'; else el.style.right = base.right + 'px';
      // top/bottom 允许是 CSS 表达式字符串（1.1.10 起 top 要带 --safe-t，bottom 要带 --safe-b）
      if (base.top != null) {
        if (typeof base.top === 'number') el.style.top = (base.top + shift) + 'px';
        else el.style.top = 'calc(' + base.top + (shift ? ' + ' + shift + 'px' : '') + ')';
      }
      else if (typeof base.bottom === 'number') el.style.bottom = (base.bottom + shift) + 'px';
      else el.style.bottom = 'calc(' + base.bottom + (shift ? ' + ' + shift + 'px' : '') + ')';
    }
    // 2.0.5：三个角落的撤销·重做条沿用同一套角基准与 shift；排在已有控件之后，
    // 同角有 topbar / winctl / zoombar 时自动错开一行，不需要写死 left/top。
    for (const [id, key] of [['undo-tl', 'tl'], ['undo-tr', 'tr'], ['undo-bl', 'bl']]) {
      const el = document.getElementById(id);
      if (!el) continue;
      const base = cornerBase(id, key, r);
      const n = used[key] || 0; used[key] = n + 1;
      // 左下角的缩放条底边带 --k 中线补偿（比通用基准高约 10px），再补 12px 免得压住它
      const shift = n * (((el.offsetHeight || 44) * r.k) + BAR_GAP) + (base.top == null ? 12 : 0);
      el.style.left = 'auto'; el.style.right = 'auto'; el.style.top = 'auto'; el.style.bottom = 'auto';
      el.style.transformOrigin = (base.left == null ? 'right' : 'left') + ' ' + (base.top == null ? 'bottom' : 'top');
      if (base.left != null) el.style.left = base.left + 'px'; else el.style.right = base.right + 'px';
      if (base.top != null) {
        if (typeof base.top === 'number') el.style.top = (base.top + shift) + 'px';
        else el.style.top = 'calc(' + base.top + (shift ? ' + ' + shift + 'px' : '') + ')';
      }
      else if (typeof base.bottom === 'number') el.style.bottom = (base.bottom + shift) + 'px';
      else el.style.bottom = 'calc(' + base.bottom + (shift ? ' + ' + shift + 'px' : '') + ')';
    }
    updGear();
  }
  function layoutDock() {
    const dock = document.getElementById('dock');
    if (!dock) return;
    const cfg = uiCfg();
    const nodes = [];
    let lastGroup = null;
    for (let i = 0; i < cfg.slots.length; i++) {
      const aid = cfg.slots[i];
      const act = dockAction(aid);
      if (!act) continue;
      const b = act.kind === 'sys' ? (dockBtns[aid] || makeDockBtn(aid)) : actionBtn(aid);
      if (!b) continue;
      b.dataset.act = aid;                       // 探针按动作 id 认按钮（scripts/probe-settings-nav.js）
      const on = cfg.hidden.indexOf(aid) < 0;
      b.style.display = on ? '' : 'none';
      if (on && lastGroup && lastGroup !== act.group) nodes.push(h('div', { class: 'dk-sep' }));
      nodes.push(b);
      if (on) lastGroup = act.group;
    }
    dock.replaceChildren(...nodes);
    document.body.dataset.dock = cfg.dockPos;
    applyCorners(cfg);
    applyFlags();                 // 1.7.0（T01）：布局重排后重新压一遍闸门（资源库按钮可能在教室模式下要临时藏掉）
    return cfg;
  }
  // 给探针与设置面板用的对外接口（改完立刻生效并落盘）
  GW.uiCustom = {
    cfg: uiCfg,
    posName: DOCK_POS_NAME,
    corners: CORNER_KEYS.map((c) => ({ id: c[0], label: c[1], def: c[2] })),
    // 动作目录（设置页第 ③ 页的 select 数据源）
    actions: dockActions,
    action: dockAction,
    items() {
      return uiCfg().slots.map((id) => {
        const a = dockAction(id) || { label: id, group: 'tool' };
        return { id: id, label: a.label, group: a.group, on: uiCfg().hidden.indexOf(id) < 0 };
      });
    },
    // 改某一槽放什么：settings.uiCustom.slots[i] = 动作 id（落盘）
    setSlot(i, aid) {
      if (i < 0 || i >= SLOT_N || !dockAction(aid)) return false;
      const c = uiCfg();
      c.slots[i] = aid;
      saveUiCfg(c);
      return true;
    },
    setDockPos(p) { if (!DOCK_POS_NAME[p]) return; const c = uiCfg(); c.dockPos = p; saveUiCfg(c); },
    setItemOn(id, on) {
      const c = uiCfg();
      c.hidden = on ? c.hidden.filter((x) => x !== id) : c.hidden.concat(c.hidden.indexOf(id) < 0 ? [id] : []);
      saveUiCfg(c);
    },
    move(id, dir) {
      const c = uiCfg(), i = c.slots.indexOf(id);
      if (i < 0) return;
      const j = dir < 0 ? i - 1 : i + 1;
      if (j < 0 || j >= c.slots.length) return;
      c.slots[i] = c.slots[j]; c.slots[j] = id;
      saveUiCfg(c);
    },
    setCorner(id, key) { if (!CORNER_NAME[key]) return; const c = uiCfg(); c.corners[id] = key; saveUiCfg(c); },
    setCornerOn(id, on) {
      const c = uiCfg();
      c.cornersOff = on ? c.cornersOff.filter((x) => x !== id) : c.cornersOff.concat(c.cornersOff.indexOf(id) < 0 ? [id] : []);
      saveUiCfg(c);
      if (id === 'topbar' && !on) GW.toast('顶栏已隐藏：左上角齿轮或 Ctrl+, 可重新打开设置', 3200);
    },
    reset() { GW.settings.uiCustom = null; GW.saveSettings(); layoutDock(); },
  };

  // 1.7.0（T01）：教室模式 / 闸门落地。只做临时显隐，**不写进 uiCustom**（那是老师自己的按钮定制，
  // 教室模式是临时的，不能把老师的界面改掉）。
  function applyFlags() {
    const b = dockBtns.res;
    if (!b) return;
    const off = !!(GW.flags && GW.flags.get('library') === false);
    // 只在「闸门关了」时压一把，并做标记；闸门开了只还原**自己压过的**那个标记 ——
    // 否则会把老师在「界面自定义」里勾掉的资源库按钮又显示出来（probe-ui-custom 抓到的）。
    if (off) { b.style.display = 'none'; b.dataset.flagHidden = '1'; }
    else if (b.dataset.flagHidden) { b.style.display = ''; delete b.dataset.flagHidden; }
  }
  if (GW.bus) GW.bus.on('flags', () => applyFlags());

  function buildDock() {
    const penDot = h('i', { class: 'dk-dot' });
    toolBtn('hand', 'hand', '交互');
    toolBtn('select', 'select', '选择');
    toolBtn('pen', 'pen', '笔', penPop);
    toolBtn('hl', 'highlighter', '荧光笔', hlPop);
    toolBtn('eraser', 'eraser', '橡皮', eraserPop);
    toolBtn('shape', 'shapes', '图形', shapePop);
    toolBtn('text', 'text', '文本', textPop);
    toolBtn('laser', 'laser', '激光笔', laserPop);
    dk('insert', 'insert', '插入', insertPop, true);
    dk('math', 'math', '数学', () => simDrawer('math'), true);
    dk('physics', 'physics', '物理', () => simDrawer('physics'), true);
    dk('geo', 'ruler', '尺规', geoPop, true);
    dk('class', 'classroom', '课堂', classPop, true);
    dk('res', 'resources', '资源库', () => {
      // 1.7.0（T01）：教室模式把资源库关掉（按钮同时临时隐藏，见 applyFlags）
      if (GW.flags && GW.flags.get('library') === false) { GW.toast('资源库已关闭（教室模式）'); return; }
      resDrawer();
    });
    dk('shelf', 'shelf', '复用', shelfPop, true);
    dk('undo', 'undo', '撤销', () => GW.undo());
    dk('redo', 'redo', '重做', () => GW.redo());
    for (const id of DOCK_ORDER) makeDockBtn(id);
    dockBtns.pen.append(penDot);
    document.body.append(h('div', { id: 'dock' }, ...DOCK_ORDER.map((id) => dockBtns[id])));
    // 2.0.5：左上 / 右上 / 左下三个角落各一对撤销·重做。不进 CORNER_KEYS（设置面板的四角
    // 控件仍是原来四个，probe-ui-custom 的断言不动），但位置复用 applyCorners 的角基准与 shift。
    const cornerUndo = [], cornerRedo = [];
    for (const [barId, key] of [['undo-tl', 'tl'], ['undo-tr', 'tr'], ['undo-bl', 'bl']]) {
      const u = h('button', { class: 'tb-btn', type: 'button', title: '撤销（Ctrl+Z）', 'aria-label': '撤销', html: I('undo') });
      const r = h('button', { class: 'tb-btn', type: 'button', title: '重做（Ctrl+Y）', 'aria-label': '重做', html: I('redo') });
      const bind = (b, fn) => {
        // 与工具栏里那两个按钮同样的 pointerdown 处理：平板上轻微滑动也会丢 click
        b.addEventListener('pointerdown', (e) => { if (b.disabled) return; e.preventDefault(); fn(); });
        b.addEventListener('click', (e) => { if (e.detail === 0 && !b.disabled) fn(); });
      };
      bind(u, () => GW.undo()); bind(r, () => GW.redo());
      cornerUndo.push(u); cornerRedo.push(r);
      document.body.append(h('div', { id: barId, class: 'undo-corner', 'data-corner': key }, u, r));
    }
    layoutDock();
    const sync = () => {
      for (const id of ['hand', 'select', 'pen', 'hl', 'eraser', 'shape', 'text', 'laser']) dockBtns[id].classList.toggle('on', GW.tool.current === id);
      penDot.style.background = GW.tool.pen.color;
      dockBtns.undo.disabled = !GW.canUndo();
      dockBtns.redo.disabled = !GW.canRedo();
      cornerUndo.forEach((b) => { b.disabled = !GW.canUndo(); });
      cornerRedo.forEach((b) => { b.disabled = !GW.canRedo(); });
    };
    GW.bus.on('tool', sync); GW.bus.on('history', sync); GW.bus.on('pen', sync);
    GW.bus.on('pen', refreshPenPreviews);        // 2.0.5：颜色/粗细变化即时重画笔迹预览
    sync();
    // 窗口变窄时四角要让开底部工具栏，位置是 inline 的，所以要跟着重算
    let rzT = 0;
    window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => applyCorners(uiCfg()), 120); });
    buildParamBar();
  }

  // 1.6.0：工具参数条。选中笔 / 荧光笔时贴着工具栏显示**真实当前值**（颜色、粗细、线型），
  // 点任意一项打开原来那个参数面板（penPop / hlPop）—— 只多一个入口，不复制第二套参数逻辑。
  function buildParamBar() {
    const bar = h('div', { id: 'param-bar', class: 'hidden', 'aria-label': '当前工具参数' });
    const dot = h('i', { class: 'pb-dot' });
    const colorBtn = h('button', { class: 'pb-btn pb-color', type: 'button', title: '当前颜色（点开调色）', 'aria-label': '当前颜色，点开调色' }, dot);
    const line = h('i', { class: 'pb-line' });
    const widthTxt = h('span', { class: 'pb-txt' });
    const widthBtn = h('button', { class: 'pb-btn pb-width', type: 'button', title: '当前粗细（点开调整）', 'aria-label': '当前粗细，点开调整' }, line, widthTxt);
    const styleBtn = h('button', { class: 'pb-btn pb-style', type: 'button', title: '线型（实线 / 虚线 / 点线）', 'aria-label': '线型，点开切换' });
    const moreBtn = h('button', { class: 'pb-btn pb-more', type: 'button', title: '更多参数', 'aria-label': '更多参数' }, h('span', { html: I('settings') }));
    bar.append(colorBtn, widthBtn, styleBtn, moreBtn);
    document.body.append(bar);
    const STYLE_NAME = { solid: '实线', dashed: '虚线', dotted: '点线' };
    // 位置按工具栏的**实测**矩形算：工具栏会被 --k 缩放、也可能被「界面自定义」放到左右两侧。
    const place = () => {
      if (bar.classList.contains('hidden')) return;
      const dock = document.getElementById('dock');
      if (!dock) return;
      const r = dock.getBoundingClientRect();
      const bw = bar.offsetWidth || 240, bh = bar.offsetHeight || 36;
      const pos = document.body.dataset.dock || 'bottom';
      // 贴着当前工具按钮，而不是悬在整条工具栏正中：看起来才是「这个笔的参数」
      const act = dock.querySelector('.dk.on');
      const ar = act && act.getBoundingClientRect();
      const cx = ar && ar.width ? ar.left + ar.width / 2 : r.left + r.width / 2;
      let left, top;
      if (pos === 'top') { top = r.bottom + 6; left = cx - bw / 2; }
      else if (pos === 'left' || pos === 'right') {
        top = r.top + r.height / 2 - bh / 2;
        left = pos === 'left' ? r.right + 8 : r.left - bw - 8;
      } else { top = r.top - bh - 6; left = cx - bw / 2; }
      const maxL = Math.max(8, window.innerWidth - bw - 8);
      bar.style.left = Math.max(8, Math.min(maxL, Math.round(left))) + 'px';
      bar.style.top = Math.max(8, Math.min(window.innerHeight - bh - 8, Math.round(top))) + 'px';
    };
    // 工具栏的缩放/重排是异步落地的：隔几帧再对一次位置，避免贴着上一个工具的按钮
    const settle = (n) => { place(); if (n > 0) setTimeout(() => settle(n - 1), 60); };
    // 界面显隐（chrome-off）会平移整条工具栏，动画结束时再对一次
    const dockEl = document.getElementById('dock');
    if (dockEl && !dockEl._pbTr) { dockEl._pbTr = 1; dockEl.addEventListener('transitionend', () => setTimeout(place, 0)); }
    // 1.6.1：只有「切换工具 / 改粗细 / 改线型」才需要重排这个浮动条（它要贴在工具栏旁边）；
    // 换颜色只改圆点与线的颜色，不会让条子的宽高变化。以前每次点颜色都排 18 次 × 60ms，
    // 一体机上表现为「点颜色之后一两秒内书写发涩、拖动浮条卡顿」。
    let lastKey = '';
    const refresh = () => {
      const t = GW.tool.current;
      const on = t === 'pen' || t === 'hl';
      bar.classList.toggle('hidden', !on);
      if (!on) { lastKey = ''; return; }
      const P = t === 'pen' ? GW.tool.pen : GW.tool.hl;
      dot.style.background = P.color;
      const px = Math.round(P.width || 2);
      line.style.height = Math.max(1, Math.min(10, Math.round(px / 2))) + 'px';
      line.style.background = P.color;
      widthTxt.textContent = px + 'px';
      styleBtn.textContent = t === 'pen' ? (STYLE_NAME[P.style] || '实线') : '荧光笔';
      const key = t + '|' + px + '|' + (t === 'pen' ? (P.style || '') : '');
      if (key === lastKey) return;
      lastKey = key;
      requestAnimationFrame(() => settle(18));
    };
    // 1.7.6（R3）：颜色 / 粗细 / 线型 三个按钮各管各的 —— 只显示自己那一块，面板贴着被点的按钮。
    // pb-more 与「更多参数」仍是完整面板（sec 为空）。
    const secOf = (b) => b === colorBtn ? 'color' : b === widthBtn ? 'width' : b === styleBtn ? 'dash' : '';
    const open = (e) => {
      const t = GW.tool.current;
      const b = (e && e.currentTarget) || moreBtn;
      if (t === 'pen') penPop(b, secOf(b));
      else if (t === 'hl') hlPop(b);
    };
    [colorBtn, widthBtn, styleBtn, moreBtn].forEach((b) => b.addEventListener('click', open));
    GW.bus.on('tool', refresh);
    GW.bus.on('pen', refresh);
    window.addEventListener('resize', () => { clearTimeout(bar._t); bar._t = setTimeout(refresh, 150); });
    refresh();
  }

  // ---------- 笔设置 ----------
  // 1.6.9：色板取色的三个毛病（都是「看着没生效」）一次修掉：
  //   ① 原来靠比较内联 `style.background` 的字符串来挪选中环，`rgb(…)` 与 `#hex` 不一致时空环不动；
  //   ② 自定义颜色选完环还停在上一个色块上，看着像没选中；
  //   ③ 与当前底色太接近的颜色（白纸上的白、黑底上的深灰）写出来本来就看不清，
  //      却和别的颜色长得一模一样 —— 现在这类色块带一圈「偏淡」标记，点了还会提示一句。
  // 颜色一律先归一成 #rrggbb 再比，`on` 环与自定义块都按归一值判定。
  function swatches(list, cur, onPick, custom = true) {
    const el = h('div', { class: 'swatches' });
    const norm = (c) => {
      const rgb = hexRGB(c);
      if (!rgb) return String(c == null ? '' : c).toLowerCase();
      return '#' + rgb.map((v) => ('0' + v.toString(16)).slice(-2)).join('');
    };
    const bg = canvasRGB();
    const known = list.map(norm);
    const btns = [];
    let lab = null;
    const mark = (c) => {
      const n = norm(c);
      btns.forEach((b) => b.classList.toggle('on', b.dataset.c === n));
      if (lab) {
        const isCustom = known.indexOf(n) < 0;
        lab.classList.toggle('on', isCustom);
        lab.classList.toggle('has', isCustom);
        lab.style.background = isCustom ? n : '';
      }
    };
    list.forEach((c) => {
      const n = norm(c);
      const rgb = hexRGB(n);
      const dim = rgb ? uiContrast(rgb, bg) < 1.6 : false;
      const b = h('button', {
        class: 'sw' + (n === norm(cur) ? ' on' : '') + (dim ? ' dim' : ''),
        title: dim ? '这个颜色在现在的底色上偏淡，写出来可能看不见' : '',
        style: { background: c },
        onclick: () => {
          onPick(n); mark(n);
          if (dim) GW.toast('这个颜色在现在的底色上偏淡，写出来可能看不清');
        },
      });
      b.dataset.c = n;
      btns.push(b); el.append(b);
    });
    if (custom) {
      const inp = h('input', { type: 'color', value: norm(cur) || '#000000' });
      inp.oninput = () => { const n = norm(inp.value); onPick(n); mark(n); };
      const isCustom = known.indexOf(norm(cur)) < 0;
      lab = h('label', { class: 'sw custom' + (isCustom ? ' on has' : ''), title: '自定义颜色' }, inp);
      if (isCustom) lab.style.background = norm(cur);
      el.append(lab);
      // 1.7.4（R7）：画布取色器。Chromium 108 有 EyeDropper 就直接用系统吸管；
      // 没有（网页端部分环境）就退化为「点一下画布，取那个位置的墨迹颜色」。
      el.append(h('button', {
        class: 'sw-eye', title: '从画布取色（吸管）',
        onclick: () => {
          const toHex = (r, g, b) => '#' + [r, g, b].map((v) => ('0' + Math.round(v).toString(16)).slice(-2)).join('');
          const done = (n) => { if (!n) return; onPick(n); mark(n); GW.toast('已取色 ' + n); };
          if (window.EyeDropper && !GW.__noEyeDropper) {
            try { new window.EyeDropper().open().then((r) => done(norm(r.sRGBHex))).catch(() => {}); return; } catch (e) { /* 落到下面的兜底 */ }
          }
          GW.toast('点一下画布上要取的颜色');
          // 监听必须挂在 document 的捕获阶段：#capture 是 #stage 的**兄弟**节点，
          // 只挂 #stage 的话真实点击落在 #capture 上根本收不到（1.6.6 的右键菜单踩过同一个坑）。
          const on = (e) => {
            document.removeEventListener('pointerdown', on, true);
            const t = e.target;
            if (!(t && t.closest && (t.closest('#stage') || t.closest('#capture')))) return;
            e.preventDefault(); e.stopPropagation();
            const w = GW.toWorld(e.clientX, e.clientY);
            const it = GW.hitTop ? GW.hitTop(w) : null;
            if (it && it.color) { done(norm(it.color)); return; }
            const bgc = canvasRGB();
            done(toHex(bgc[0], bgc[1], bgc[2]));
          };
          setTimeout(() => document.addEventListener('pointerdown', on, true), 0);
        },
      }));
    }
    return el;
  }
  // 1.7.4（R7）：给探针留一个口子，能离线构造一排色块并验证吸管按钮的行为。
  GW.__swatches = swatches;
  function widths(list, cur, color, onPick) {
    const el = h('div', { class: 'widths' });
    list.forEach((w) => el.append(h('button', { class: 'wd' + (w === cur ? ' on' : ''), onclick: (e) => { onPick(w); el.querySelectorAll('.wd').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, h('i', { style: { width: Math.min(28, w + 2) + 'px', height: Math.min(28, w + 2) + 'px', background: color === '#ffffff' ? '#ccc' : color } }))));
    return el;
  }
  // 2.0.3：笔种选择器。每格一条真预览 —— 用渲染同一套宽度函数（压感映射 / 速度映射 /
  // 入锋 / 出锋）算出逐点线宽，再画成一小段「横 + 弯 + 撇」，老师看一眼就知道这笔写出来什么样。
  function penPreview(cv, st, color, width, dpr) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const IS = GW.inkStyle;
    if (!IS) return;
    const n = 34, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // 形状：先一段接近水平的长笔画（看行笔粗细），末尾往下压成「撇」（看出锋）
      const x = 5 + t * (W - 10);
      const y = H * 0.46 + Math.sin(t * Math.PI * 1.15) * H * 0.2 + Math.pow(Math.max(0, t - 0.62) / 0.38, 1.5) * H * 0.3;
      pts.push([x, y]);
    }
    const base = (1.0 + (width || 3) * 0.34) * st.wScale;
    // 速度：用相邻点位移 / 8ms 近似，中段最快（与真书写一致）
    const speedAt = (i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
      return Math.min(4, d / 8);
    };
    const entryPx = Math.max(4, base * st.entry);
    let travelled = 0;
    const ws = pts.map((p, i) => {
      if (i) travelled += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      return base * IS.speedW(st, speedAt(i), 1) * IS.entryK(st, travelled, entryPx);
    });
    // 收笔出锋
    if (st.exitLen > 0 && st.exitW < 1) {
      let acc = 0;
      const exitPx = Math.max(2, base * st.exitLen * 0.5);
      for (let i = n; i > 0; i--) {
        const k = Math.min(1, acc / exitPx);
        const t = st.tip === 'sharp' ? Math.pow(k, 0.72) : k;
        ws[i] = Math.min(ws[i], base * (st.exitW + (1 - st.exitW) * t));
        acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (acc > exitPx) break;
      }
    }
    ctx.strokeStyle = color || '#1b2433';
    ctx.lineCap = st.cap === 'butt' ? 'butt' : 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = st.alpha;
    for (let i = 1; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
      ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.lineWidth = Math.max(0.5, (ws[i - 1] + ws[i]) / 2);
      ctx.stroke();
    }
    // 颗粒：与小画布上真正的打孔一致（铅笔几颗、粉笔更密）
    if (st.grain > 0) {
      const rnd = (s) => { let a = (s * 2654435761) >>> 0; return () => { a = (a * 1103515245 + 12345) >>> 0; return a / 4294967296; }; };
      const R = rnd(IS.hash(st.id) + 7);
      const cnt = Math.round(30 + 60 * st.grain);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 0.55;
      for (let k = 0; k < cnt; k++) {
        const i = Math.min(n, Math.max(1, Math.round(R() * n)));
        const off = (R() - 0.5) * ws[i] * 0.9;
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1] + off, Math.max(0.35, ws[i] * 0.11 * (0.4 + R())), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }
  // ---------- 2.0.4：九宫格二级弹层「笔锋调节」 ----------
  // 仿 #ball-sub（subPanel）：独立 #pen-tip-sub.pop，自建定位 + 点外部/Esc 关闭，
  // 不占 curPop、不调 GW.pop()（开头先 closePop() 会关父级 penPop），
  // 也不用 GW.dialog/drawer（全屏遮罩会挡画布）。父级 penPop 始终留着。
  function closePenTipSub() {
    if (penTipClose) { penTipClose(); penTipClose = null; }
    if (penTipSub) { penTipSub.remove(); penTipSub = null; }
  }
  // 预览代理：penPreview 认的是笔种表字段，六维参数是另一套配置。这里把有效配置
  // 浅拷贝进 st 再改字段重画 —— 默认档逐项恒等（≡ 2.0.3），且绝不污染 IS.of() 常量表。
  function tipPreviewSt(penId, cfg) {
    const st = Object.assign({}, GW.inkStyle.of(penId));
    if (cfg.bypass) return st;                                   // plain 整支直通，六维 no-op
    const floor = cfg.tipFloor == null ? st.exitW : cfg.tipFloor;
    st.tip = cfg.penTip || st.tip;                                            // 收笔锋型
    st.exitW = st.exitW + (floor - st.exitW) * (cfg.penTipSharp || 0);        // 锋尖锐度 → 收笔宽度
    st.exitLen = st.exitLen * ((cfg.penExit || 1.1) / 1.1);                   // 锋长（默认 1.1 = 原样）
    if ((cfg.penTipFlat || 0) >= 0.5 && st.cap !== 'butt') st.cap = 'butt';    // 扁平度 → 端帽
    st.entryFrom = st.entryFrom + (1 - st.entryFrom) * (cfg.penTipFlat || 0) * 0.35;
    // 压感曲线档 2 = 线性 ≡ 2.0.3；稳定度越高宽度起伏越小。预览里用速度响应系数做可视代理。
    const curveK = 0.7 + 0.15 * (cfg.penPressCurve == null ? 2 : cfg.penPressCurve);
    st.vK = st.vK * curveK * (1 - 0.35 * (cfg.penStabilize || 0));
    return st;
  }
  function openPenTipSub(anchorEl, penId) {
    const IS = GW.inkStyle;
    if (!IS) return;
    closePenTipSub();
    const P = GW.tool.pen;
    const pens = IS.list();
    const ids = pens.map((s) => s.id);
    let active = ids.indexOf(penId) >= 0 ? penId : ids[0];

    // 读值一律走 IS.tipConfig(penId, GW.settings.penTipCfg)：缺键 / 脏值自动回落默认并钳制。
    const cfgAll = () => {
      if (!GW.settings.penTipCfg || typeof GW.settings.penTipCfg !== 'object') GW.settings.penTipCfg = {};
      return GW.settings.penTipCfg;
    };
    const cfgOf = (id) => IS.tipConfig(id, GW.settings.penTipCfg);

    const previewCv = h('canvas', { width: 200, height: 72, 'data-ink': active, 'data-tip': '1', style: { display: 'block', width: '200px', height: '72px', borderRadius: '8px', background: 'transparent' } });
    const drawPreview = (override) => {
      previewCv.setAttribute('data-ink', active);   // 二级弹层里换笔种时，全局刷新要认得当前笔
      const cfg = Object.assign({}, cfgOf(active), override || {});
      penPreview(previewCv, tipPreviewSt(active, cfg), P.color, P.width);
    };
    const commit = (key, value) => {
      const all = cfgAll();
      if (!all[active] || typeof all[active] !== 'object') all[active] = {};
      all[active][key] = value;
      GW.saveSettings();
      drawPreview();                 // 提交后按 IS.tipConfig 重画（钳制后的规范值）
    };

    const closeBtn = h('button', { class: 'gw-btn', title: '关闭（Esc）', style: { padding: '2px 8px', minHeight: '24px', fontSize: '12px' }, onclick: () => closePenTipSub() }, '✕');
    const head = h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
      h('h4', { style: { margin: 0 } }, '笔锋调节'), closeBtn);
    const legend = h('p', { class: 'muted', style: { margin: '4px 0 8px', fontSize: '11.5px', lineHeight: '1.5' } },
      '按笔种独立保存 · 笔尖 / 压力灵敏度 / 画笔稳定性 / 笔尖粗细度');
    const tabSeg = GW.ui.segmented({
      options: pens.map((s) => ({ value: s.id, label: s.short })),
      value: active,
      onChange: (id) => { active = id; render(); },
    });
    tabSeg.el.style.flexWrap = 'wrap';
    tabSeg.el.style.marginBottom = '8px';
    const body = h('div');
    const sub = h('div', { id: 'pen-tip-sub', class: 'pop', style: { width: '360px', zIndex: '62' } },
      head, legend, tabSeg.el, body);

    function render() {
      body.replaceChildren();
      const cfg = cfgOf(active), st = IS.of(active);
      const controls = h('div', { style: { flex: '1 1 210px', minWidth: '200px' } });
      for (const dim of IS.TIP_DIMS) {
        const row = h('div', { style: { marginBottom: '8px' }, title: dim.hint || '' });
        if (dim.options) {
          // 收笔锋型：segmented，点一下即提交
          const seg = GW.ui.segmented({
            options: dim.options.map((o) => ({ value: o.v, label: o.t })),
            value: cfg[dim.key], onChange: (v) => commit(dim.key, v),
          });
          row.append(h('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '3px' } }, dim.label), seg.el);
        } else {
          // 其余五维：slider，拖动实时预览（不落盘），松手 change 再 onCommit 提交。
          // GW.ui.slider 本身没有 onCommit，这里在它的 range 上补一个 change 监听。
          const sl = GW.ui.slider({
            label: dim.label, min: dim.min, max: dim.max, step: dim.step,
            value: cfg[dim.key], onInput: (v) => drawPreview({ [dim.key]: v }),
          });
          const range = sl.el.querySelector('input[type="range"]');
          if (range) range.addEventListener('change', () => commit(dim.key, +range.value));
          row.append(sl.el);
        }
        controls.append(row);
      }
      const reset = h('button', {
        class: 'gw-btn', style: { marginTop: '2px', fontSize: '12px' },
        title: '重设粗细度：删除该笔种的自定义参数，回到出厂笔锋',
        onclick: () => {
          const all = cfgAll();
          if (Object.prototype.hasOwnProperty.call(all, active)) delete all[active];
          GW.saveSettings();
          render();
          GW.toast('已恢复「' + st.label + '」默认笔锋', 1600);
        },
      }, '恢复该笔种默认');
      controls.append(reset);
      const right = h('div', { style: { flex: '0 0 auto' } }, previewCv);
      body.append(h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' } }, controls, right));
      // 底部一句按笔种语义说明
      const note = st.id === 'plain' ? '此笔为直通，不参与调节。'
        : st.cap === 'butt' ? '出锋 = 端边斜切（平头笔的锋作用在端边，不是尖尾）。' + (st.hint || '')
        : (st.hint || '');
      body.append(h('p', { class: 'muted', style: { margin: '8px 0 0', fontSize: '11.5px', lineHeight: '1.5' } }, note));
      drawPreview();
    }

    document.body.append(sub);
    penTipSub = sub;
    // 自建定位：优先放在父级 penPop 右侧，放不下翻到左侧，用 GW.clamp 夹进视口。
    const base = (curPop && curPop.el) || anchorEl;
    const r = base.getBoundingClientRect();
    const w = sub.offsetWidth, hh = sub.offsetHeight;
    let x = r.right + 12;
    if (x + w > innerWidth - 8) x = r.left - w - 12;
    sub.style.left = GW.clamp(x, 8, Math.max(8, innerWidth - w - 8)) + 'px';
    sub.style.top = GW.clamp(r.top - 12, 8, Math.max(8, innerHeight - hh - 8)) + 'px';
    // 点外部 / Esc 关闭。Esc 用 capture + stopPropagation，只关这一层：
    // 别让 input.js 的全局 keydown 再 emit('escape') → closePop() 把父级 penPop 一起收掉。
    const onDown = (e) => {
      if (sub.contains(e.target)) return;
      if (anchorEl && anchorEl.contains && anchorEl.contains(e.target)) return;
      closePenTipSub();
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation(); closePenTipSub();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    penTipClose = () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
    render();
  }

  function penStyleGrid(P) {
    const IS = GW.inkStyle;
    const el = h('div', { class: 'pen-styles' });
    if (!IS) return el;
    const cur = (GW.settings.penInk || IS.current().id || 'gel');
    IS.list().forEach((st) => {
      const cv = h('canvas', { width: 132, height: 48, 'data-ink': st.id });
      penPreview(cv, st, P.color, P.width);
      // 2.0.4：每格右上角的小齿轮。它是 button.pen-style 的子节点，所以必须
      // stopPropagation —— 否则点齿轮会冒泡到 button 的 onclick，把笔也选了。
      // 下面的单击选笔处理保持原样，一个字都没动。
      const gear = h('button', {
        class: 'pen-tip-gear', 'data-ink': st.id,
        title: '笔锋调节（' + st.label + '）', 'aria-label': '笔锋调节（' + st.label + '）',
        html: I('settings', 13),
        style: {
          position: 'absolute', top: '2px', right: '2px', zIndex: '1',
          width: '20px', height: '20px', padding: '0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--line)', borderRadius: '6px',
          background: 'var(--menu-tile, #fff)', color: 'var(--ink-2)', cursor: 'pointer',
        },
        onclick: (e) => { e.stopPropagation(); openPenTipSub(gear, st.id); },
      });
      const btn = h('button', {
        class: 'pen-style' + (st.id === cur ? ' on' : ''),
        title: st.hint + '（' + st.label + '）',
        style: { position: 'relative' },
        onclick: (e) => {
          // 写设置 + 同步老字段（penMode / brush）：老版本读回去时仍是同一支笔
          GW.settings.penInk = st.id;
          GW.settings.brush = st.id === 'pencil' ? 'pencil' : st.id === 'marker' ? 'marker' : 'pen';
          GW.tool.pen.mode = st.id === 'brush' ? 'brush' : 'pen';
          GW.settings.penMode = GW.tool.pen.mode;
          GW.saveSettings();
          el.querySelectorAll('.pen-style').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
          GW.bus.emit('pen');
          GW.toast('笔种：' + st.label + '　' + st.hint, 2600);
        },
      }, cv, h('span', null, st.label), gear);
      el.append(btn);
    });
    return el;
  }
  // 2.0.5：笔迹预览原本是「打开面板那一刻的颜色快照」——改颜色/粗细只发 'pen'，
  // 没有任何一处会重画这些 canvas。这里统一遍历当前存在的预览 canvas 重画一遍；
  // 面板是临时 DOM，遍历即可，不会随开关面板累积监听器。
  function refreshPenPreviews() {
    const IS = GW.inkStyle;
    if (!IS) return;
    const P = GW.tool.pen;
    document.querySelectorAll('canvas[data-ink]').forEach((cv) => {
      const id = cv.getAttribute('data-ink');
      const st = cv.getAttribute('data-tip')
        ? tipPreviewSt(id, IS.tipConfig(id, GW.settings.penTipCfg))
        : IS.of(id);
      penPreview(cv, st, P.color, P.width);
    });
  }
  function penPop(anchor, sec) {
    const P = GW.tool.pen;
    if (!P.style) P.style = GW.settings.penStyle || 'solid';
    // 1.3.5：智能笔并入「笔」——不再需要来回切。2.0.3 起「钢笔 / 毛笔」这两个按钮由笔种九宫格取代
    // （原来是 mode 两档 + brush 三档，组合起来 6 种却只改三个系数）；P.mode 仍随笔种同步，
    // 老存档与协同协议里的 penMode 字段照旧可用。
    // 2.0.3：笔种九宫格（核心/墨风格见 core/ink-style.js）。每一格画一条真笔迹预览 ——
    // 预览用的就是渲染那套宽度函数（压感映射 + 速度映射），不是画个图标糊弄。
    const styleGrid = penStyleGrid(P);
    // 1.5.0：线型。选中了笔迹时，改线型同时作用到选区 —— 「圈住一段手写 → 点虚线」
    // 和 GoodNotes / Notability 是同一个动作。
    const styleSeg = GW.ui.segmented({
      options: [{ value: 'solid', label: '实线' }, { value: 'dashed', label: '虚线' }, { value: 'dotted', label: '点线' }],
      value: P.style,
      onChange: (v) => { P.style = v; GW.settings.penStyle = v; GW.saveSettings(); GW.bus.emit('pen'); if (GW.selection.items.length) GW.restyleSelection(v); },
    });
    // 1.6.8（R6）：笔刷预设 —— 2.0.3 起并入「笔种」，这里只留一个快捷档（顺滑/精细/板书）
    const presetSeg = GW.ui.segmented({
      options: [{ value: 'default', label: '默认' }, { value: 'smooth', label: '顺滑' }, { value: 'precise', label: '精细' }, { value: 'board', label: '板书' }],
      value: GW.settings.penPreset || 'default',
      onChange: (v) => {
        if (GW.pen && GW.pen.applyPreset) GW.pen.applyPreset(v);
        GW.bus.emit('pen');
        GW.toast('书写预设：' + ({ default: '默认', smooth: '顺滑', precise: '精细', board: '板书' }[v] || v), 1600);
      },
    });
    // 1.7.6（R3）：按 sec 只构造对应那一块；sec 为空或未知 = 五块全量（主笔按钮 / pb-more /
    // 老调用零改动）。每块包一层带 data-sec 的容器，面板宽度也按单块收窄。
    const secs = ['color', 'width', 'dash', 'mode', 'brush'];
    const all = !sec || secs.indexOf(sec) < 0;
    const want = (k) => all || sec === k;
    const blocks = [];
    if (want('color')) blocks.push(h('div', { 'data-sec': 'color' },
      h('h4', null, '颜色'), swatches(smartPenColors(), P.color, (c) => { P.color = c; GW.bus.emit('pen'); if (GW.selection.items.length) GW.recolorSelection(c); })));
    if (want('width')) blocks.push(h('div', { 'data-sec': 'width' },
      h('h4', null, '粗细'), widths(WIDTHS, P.width, P.color, (w) => { P.width = w; GW.bus.emit('pen'); })));
    if (want('dash')) blocks.push(h('div', { 'data-sec': 'dash' }, h('h4', null, '线型'), styleSeg.el));
    // 笔种整块替换了原来的「笔型（钢笔/毛笔）+ 笔感（钢笔/铅笔/马克笔）」两个分段控件：
    // 那两块加起来只影响三个系数，却要老师自己试出组合；现在一支笔一格，选完就写完。
    if (want('mode') || want('brush')) blocks.push(h('div', { 'data-sec': 'brush' }, h('h4', null, '笔种'), styleGrid));
    if (all) blocks.push(h('div', null, h('h4', null, '书写预设'), presetSeg.el));
    if (all) blocks.push(h('label', { class: 'gw-row', style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '13px' } },
      h('input', {
        type: 'checkbox', checked: GW.settings.highlighterSnap !== false,
        onchange: (e) => { GW.settings.highlighterSnap = !!e.target.checked; GW.saveSettings(); },
      }),
      h('span', null, '高亮笔吸附横线纸的行线')));
    const el = h('div', { style: { width: all ? '310px' : '260px' } }, ...blocks);
    pop(anchor, el);
  }
  function hlPop(anchor) {
    const P = GW.tool.hl;
    pop(anchor, h('div', { style: { width: '310px' } },
      h('h4', null, '颜色'), swatches(HL_COLORS, P.color, (c) => { P.color = c; GW.bus.emit('pen'); }),
      h('h4', null, '粗细'), widths([12, 18, 24, 34], P.width, P.color, (w) => { P.width = w; GW.bus.emit('pen'); })));
  }
  // 激光笔（1.1.14）：颜色 / 粗细 / 两种消失方式，和笔、荧光笔共用同一套控件。
  //   demo    —— 演示圈画，抬手后约 1 秒逐段消失（和以前的手感一致）
  //   formula —— 临时板书，停笔 hold 秒后整段慢慢淡出；期间继续写就重新计时
  // 改动立刻写回 GW.settings.laser，下回打开应用还是这一套。
  function laserPop(anchor) {
    const L = GW.tool.laser;
    const save = () => {
      GW.settings.laser = { color: L.color, width: L.width, mode: L.mode, hold: L.hold };
      GW.saveSettings();
      GW.bus.emit('laser');
    };
    const holdBox = h('div');
    const hint = h('p', { class: 'muted', style: { margin: '6px 0 0' } });
    const syncHint = () => {
      hint.textContent = L.mode === 'demo'
        ? '抬手后约 1 秒逐段消失，适合临时圈画重点。'
        : '停笔一段时间后整段慢慢消失，适合写临时的公式和推导。';
    };
    const mode = GW.ui.segmented({
      options: [{ value: 'demo', label: '演示圈画' }, { value: 'formula', label: '临时板书' }],
      value: L.mode,
      onChange: (v) => {
        L.mode = v === 'formula' ? 'formula' : 'demo';
        holdBox.style.display = L.mode === 'formula' ? '' : 'none';
        syncHint();
        save();
        GW.toast(L.mode === 'formula'
          ? '临时板书：停笔 ' + L.hold + ' 秒后整段慢慢淡出，期间继续写会重新计时'
          : '演示圈画：抬手后约 1 秒逐段消失');
        GW.requestLive();
      },
    });
    const hold = GW.ui.segmented({
      options: [2, 4, 8].map((s) => ({ value: s, label: s + ' 秒' })),
      value: L.hold,
      onChange: (v) => { L.hold = +v; save(); GW.requestLive(); },
    });
    holdBox.style.display = L.mode === 'formula' ? '' : 'none';
    syncHint();
    holdBox.append(h('h4', null, '停笔后停留'), hold.el, h('p', { class: 'muted', style: { margin: '6px 0 0' } }, '停笔超过这个时间，整段板书才慢慢淡出；期间继续写会重新计时。'));
    pop(anchor, h('div', { style: { width: '310px' } },
      h('h4', null, '颜色'), swatches(LASER_COLORS, L.color, (c) => { L.color = c; save(); }),
      h('h4', null, '粗细'), widths([3, 5, 8, 12], L.width, L.color, (w) => { L.width = w; save(); }),
      h('h4', null, '消失方式'), mode.el, hint,
      holdBox));
  }
  // =============== 1.5.3：滑动清屏 ===============
  // 清屏是这个软件里唯一「点一下就没了」的操作。快捷白板把它做成「滑到头才生效」的横条，
  // 思路对。这里沿用并补三点：① 没滑到头松手会回弹，可以接着滑，不用关掉重来；
  // ② Esc / 点遮罩 / 取消 / 焦点移出都能退；③ 生效后直接告诉老师怎么撤销（清空本身进撤销栈）。
  // opts: { title, hint, danger, action }。action 缺省 = GW.clearInk(false)。
  let slideEls = null;
  GW.slideClear = function (opts) {
    opts = opts || {};
    if (slideEls) return false;
    const danger = !!opts.danger;
    const K = 54;                                  // 必须与 app.css 里 .sc-knob 的边长一致
    const act = typeof opts.action === 'function' ? opts.action : () => GW.clearInk(false);
    const knob = h('button', { type: 'button', class: 'sc-knob', 'aria-label': '拖动到最右端执行清屏' }, '»');
    const fill = h('i', { class: 'sc-fill' });
    const hint = h('span', { class: 'sc-hint' }, '');
    const track = h('div', { class: 'sc-track' }, fill, hint, knob);
    const cancel = h('button', { type: 'button', class: 'gw-btn' }, '取消');
    const wrap = h('div', { class: 'slide-clear' + (danger ? ' danger' : '') },
      h('div', { class: 'sc-head' },
        h('b', null, opts.title || '清空本页笔迹'),
        h('span', null, opts.hint || '防误触：按住右边的圆点滑到最右端，松手才执行；没滑到头会弹回去。')),
      track, cancel);
    const mask = h('div', { class: 'sc-mask' });
    let pct = 0, dragging = false, done = false, moved = 0, lastX = 0;
    const idleText = danger ? '滑到最右松手：整页清空' : '滑到最右松手才清屏';
    const paint = () => {
      const span = Math.max(1, track.clientWidth - K);
      const x = pct * span;
      knob.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
      fill.style.width = (K / 2 + x).toFixed(1) + 'px';
      track.classList.toggle('armed', pct > 0.02);
      hint.textContent = pct >= 0.985 ? '松手即清屏（可 Ctrl+Z 撤销）' : idleText;
    };
    const close = () => {
      if (!slideEls) return;
      slideEls = null;
      removeEventListener('keydown', onKey, true);
      removeEventListener('pointermove', onMove, true);
      removeEventListener('pointerup', onUp, true);
      removeEventListener('pointercancel', onUp, true);
      mask.remove(); wrap.remove();
    };
    const finish = () => {
      if (done) return;
      done = true;
      close();
      try { act(); } catch (e) { console.error(e); GW.toast('清屏失败：' + ((e && e.message) || e), 3000); return; }
      GW.toast(danger ? '已清空本页（Ctrl+Z 撤销）' : '已清空本页笔迹（Ctrl+Z 撤销）', 2600);
    };
    const pctAt = (clientX) => {
      const r = track.getBoundingClientRect();
      const span = Math.max(1, r.width - K);
      return Math.min(1, Math.max(0, (clientX - r.left - K / 2) / span));
    };
    const onMove = (e) => {
      if (!dragging) return;
      moved += Math.abs(e.clientX - lastX);
      lastX = e.clientX;
      pct = pctAt(e.clientX);
      paint();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      knob.classList.remove('grab');
      // 只「点」一下轨道右端也会让 pct=1，所以还要求真的拖过一段（≥24px）才算数 —— 防误触不能只靠位置。
      if (pct >= 0.985 && moved >= 24) return finish();
      // 没滑到头：回弹。不关闭浮条 —— 老师可以接着滑，不必从头再来。
      pct = 0;
      wrap.classList.add('spring');
      paint();
      setTimeout(() => wrap.classList.remove('spring'), 320);
    };
    const startDrag = (e) => {
      if (done || (e.button != null && e.button > 0)) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      knob.classList.add('grab');
      wrap.classList.remove('spring');
      pct = pctAt(e.clientX);
      paint();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); return close(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); pct = Math.min(1, pct + 0.12); paint(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); pct = Math.max(0, pct - 0.12); paint(); }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation();
        // 键盘没法「按住拖」：先滑到 60% 以上，再按一次回车/空格才执行（两次确认，不绕过防误触）
        if (pct >= 0.6) finish(); else { pct = 1; paint(); }
      }
    };
    knob.addEventListener('pointerdown', startDrag);
    track.addEventListener('pointerdown', startDrag);
    cancel.onclick = close;
    mask.onclick = close;
    addEventListener('keydown', onKey, true);
    addEventListener('pointermove', onMove, true);
    addEventListener('pointerup', onUp, true);
    addEventListener('pointercancel', onUp, true);
    document.body.append(mask, wrap);
    slideEls = { close };
    paint();
    setTimeout(() => { try { knob.focus({ preventScroll: true }); } catch (e) { knob.focus(); } }, 30);
    return true;
  };
  GW.closeSlideClear = () => { if (slideEls) slideEls.close(); };

  function eraserPop(anchor) {
    const E = GW.tool.eraser;
    const save = () => { GW.settings.eraser = { ...E }; GW.saveSettings(); };
    const mode = GW.ui.segmented({ options: [{ value: 'area', label: '局部擦除' }, { value: 'stroke', label: '整笔擦除' }], value: E.mode, onChange: (v) => { E.mode = v; save(); } });
    const size = GW.ui.slider({ label: '橡皮大小', min: 16, max: 120, step: 2, value: E.size, unit: 'px', onInput: (v) => { E.size = v; save(); } });
    pop(anchor, h('div', { style: { width: '300px', display: 'flex', flexDirection: 'column', gap: '12px' } },
      mode.el, size.el,
      h('button', { class: 'gw-btn danger', onclick: () => { closePop(); GW.slideClear(); } }, '清除本页所有笔迹'),
      h('button', { class: 'gw-btn danger', onclick: () => { closePop(); GW.slideClear({ danger: true, title: '清空本页全部内容', hint: '笔迹和所有对象（图形、文本、图片）都会被清掉；滑到最右端松手才执行，可 Ctrl+Z 撤销。', action: () => GW.clearInk(true) }); } }, '清空本页全部内容'),
      h('p', { class: 'muted', style: { margin: 0 } }, '提示：手掌或手背大面积按在屏幕上可直接擦除。')));
  }
  const SHAPE_ICONS = {
    line: '<path d="M4 20 20 4"/>', arrow: '<path d="M4 20 20 4M11 4h9v9"/>', darrow: '<path d="M4 20 20 4M11 4h9v9M13 20H4v-9"/>', dash: '<path d="M4 20 20 4" stroke-dasharray="3 3"/>',
    rect: '<rect x="3" y="6" width="18" height="12" rx="1"/>', circle: '<circle cx="12" cy="12" r="9"/>', ellipse: '<ellipse cx="12" cy="12" rx="10" ry="6"/>', triangle: '<path d="M12 3 21 20H3Z"/>',
    rtri: '<path d="M4 4v16h16Z"/>', para: '<path d="M7 5h14l-4 14H3Z"/>', trap: '<path d="M7 5h10l4 14H3Z"/>', hexagon: '<path d="M7 3h10l5 9-5 9H7l-5-9Z"/>',
    axes: '<path d="M2 12h20M12 22V2M19 9l3 3-3 3M9 5l3-3 3 3"/>', numline: '<path d="M2 12h20M19 9l3 3-3 3M6 10v4M10 10v4M14 10v4"/>', axes3d: '<path d="M9 15V2M9 15h13M9 15l-7 7M6 5l3-3 3 3M19 12l3 3-3 3"/>', curve: '<path d="M3 18c4 0 4-12 9-12s5 12 9 12"/>',
  };
  // 数学图形缩略图缓存：跨面板复用（面板每次打开都重画 44 张 canvas 在低端机上会顿一下）。
  const MS_THUMBS = {};
  // 每个数学图形用自己真实的画法渲染一张小缩略图（不是所有格子都用一个 △/ƒ）。
  // 生成一次就缓存成 dataURL；面板反复打开、搜索、最近使用都直接复用，不重复画。
  // 放在 shapePop 外面：探针（scripts/probe-shape-tx.js）不开面板也能逐张量。
  // 量一张 canvas 上真实墨迹的范围（缩略图要按它等比适配；只按 bbox 会留一大圈白）
  function inkBox(ctx, W, H) {
    try {
      const d = ctx.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    } catch (e) { return null; }
  }
  // 数学图的按钮图标：和「数学模板」的 SVG 图标同一个规格 —— 26×26 的线稿、同一种青色。
  // 以前是 120×72 的彩色位图缩在一个 16px 高的长条里，跟旁边的模板按钮明显不是一套东西。
  function thumbSrc(key, cssSize) {
    const N = cssSize || 26;
    // 缩略图也要跟着画布底色走（反馈 3）：深底上换成更亮的青，浅底仍是教材青。
    // 键里带上明暗，切底色时自动换一套缓存，不用手动清。
    const dark = !!(GW.isDarkBg && GW.isDarkBg());
    const ck = key + '@' + N + (dark ? 'd' : 'l');
    if (MS_THUMBS[ck]) return MS_THUMBS[ck];
    const MS = GW.mathShapes;
    let src = '';
    if (!MS) return '';
    try {
      const cv = document.createElement('canvas');
      cv.width = N * 2; cv.height = N * 2;   // 逻辑 N×N、物理 2 倍，图标在任何屏幕上都清楚
      const ctx = cv.getContext('2d');
      // 线宽按图标尺寸定：26px 下 1.7 ≈ 和 .gb svg 里 stroke-width=2 的观感一致（MS 的 width 是世界单位）
      const w0 = N < 20 ? 1.3 : 1.7;
      const it = MS.make(key, 4, 4, 52, 28, { color: dark ? '#3fd0b6' : '#0f9d8a', width: w0, params: MS.defaults(key) });
      // 缩略图走「绿色简笔画」：只留轮廓，不填色、不画字母标注，和基础/物理图形的图标观感一致。
      if (it) {
        it.fill = false; it._thumb = true;
        // 先在一张临时画布上把整个图形硬塞进去，量出**真实墨迹**范围，再按墨迹等比放大贴回来。
        // 只按 MS.bbox 适配不够：bbox 里带 pad 和标注留白（三角、函数图像尤其明显），量出来只占
        // 半幅就「太小」；以前更糟 —— 直接沿用插入坐标 (4,4)-(52,28)，而 MS.make 会把小于 40 的
        // 高钳到 40，实际画框 48×40 比逻辑画布 60×36 还高，底部一截被 toDataURL 吃掉。
        const tcv = document.createElement('canvas');
        tcv.width = cv.width; tcv.height = cv.height;
        const tctx = tcv.getContext('2d');
        const bb0 = MS.bbox(it);
        const s0 = Math.min(tcv.width / (bb0.w + 8), tcv.height / (bb0.h + 8));
        tctx.setTransform(s0, 0, 0, s0,
          (tcv.width - bb0.w * s0) / 2 - bb0.x * s0, (tcv.height - bb0.h * s0) / 2 - bb0.y * s0);
        MS.draw(tctx, it);
        const ib = inkBox(tctx, tcv.width, tcv.height);
        if (ib) {
          const pad = N < 20 ? 2 : 3;        // 图标四周留一点气口，和 SVG 图标 24 单位里 1 单位的边距对齐
          const s = Math.min(cv.width / (ib.w + pad), cv.height / (ib.h + pad));
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(tcv, ib.x, ib.y, ib.w, ib.h,
            (cv.width - ib.w * s) / 2, (cv.height - ib.h * s) / 2, ib.w * s, ib.h * s);
        }
        src = cv.toDataURL('image/png');
      }
    } catch (e) { src = ''; }
    MS_THUMBS[ck] = src;
    return src;
  }
  // 探针钩子：scripts/probe-shape-tx.js 逐张量「缩略图有没有被裁、是否等比铺满」。
  GW._msThumb = thumbSrc;
  function shapePop(anchor) {
    const S = GW.tool.shape;
    const MS = GW.mathShapes;
    const COLS = 'repeat(auto-fill, minmax(86px, 1fr))';
    // 分页即分类：基础/数学/物理/化学/生物/地理。以后加学科只要往 TABS 里加一项、
    // 再在 render 里给它一段取数；不再用分组标题、折叠或下拉。
    const TABS = [
      { key: 'basic', label: '基础' },
      { key: 'math', label: '数学' },
      { key: 'phys', label: '物理' },
      { key: 'chem', label: '化学', group: '化学' },
      { key: 'bio', label: '生物', group: '生物' },
      { key: 'geo', label: '地理', group: '地理' },
      // 以后加学科：这里加一行 { key, label, group }，下面 render 会自动走 renderStencil(group)。
    ];
    // 学科模板按组取：通用并入基础，其余各回各科。
    const stList = (g) => (GW.stencils ? GW.stencils.list.filter((s) => s.group === g) : []);
    // 数学页同时有可调参图形和数学模板；同名（扇形/角…）只保留可调参的那一个。
    const stMath = () => {
      const names = new Set(MS ? MS.list().map((d) => d.label) : []);
      return stList('数学').filter((s) => !names.has(s.label));
    };
    // 基础页不再重复数学页已有的矩形/圆/三角形等；数学页反过来过滤这 10 个。
    const MS_DUP = { rect: 'rect', circle: 'circle', ellipse: 'ellipse', triangle: 'tri', rtri: 'rtri', para: 'para', trap: 'trap', hexagon: 'ngon', axes: 'coord', numline: 'numline' };
    const basicDup = new Set(Object.keys(MS_DUP).map((k) => MS_DUP[k]));

    // 数学/物理项目多，进页后再分一层「子面板」：只在页内切换，不改变上面的 6 个学科分页。
    // 子面板是按钮不是下拉，点一下即达；两个页面的选择各自记住。
    const mathSubs = () => {
      const geo = MS ? MS.list('geo').filter((d) => !basicDup.has(d.key)) : [];
      const func = MS ? MS.list('func') : [];
      return [
        { key: 'geo', label: '平面几何', items: geo },
        { key: 'func', label: '函数图像', items: func },
        { key: 'tpl', label: '数学模板', items: stMath() },
      ].filter((x) => tcOn('mathSubs', x.key));
    };
    // 物理简笔画（sketch）不出面板；1.1.7 起「物理仿真」分页要出来（16 个动画图形在这里，
    // 同一批动画也借进了力学/振动与波/圆周与天体的分页里 —— 见 physshapes.js 的 P.animTopic）。
    // 1.1.15 曾经把「电流表内接/外接（局部电路）」两个静态图形藏在面板外、换成物理仿真里的网页；
    // 按作者要求改回来：网页演示撤掉，两张图形重新出现在「电磁学实验」里（旧 .gewu 照旧画得出来）。
    const physSubs = () => {
      const PS = GW.physShapes;
      if (!PS) return [];
      return PS.cats()
        .filter((c) => c !== 'sketch' && tcOn('physSubs', c))
        .map((c) => ({ key: c, label: PS.catLabel[c] || c, items: PS.list(c) }));
    };
    // 化学/生物页：可调参图形按分类排在前面，该学科的静态模板单独一节放最后。
    // 物理页走 physSubs（P.cats() 只认 P.catOrder），化生的分类 id 不在 catOrder 里，两边互不串。
    const subjectSubs = (subj, group, tplLabel, settingKey) => {
      const PS = GW.physShapes;
      if (!PS || !PS.subjectCats) return [];
      const out = PS.subjectCats(subj)
        .filter((c) => tcOn(settingKey, c))
        .map((c) => ({
          key: c, label: PS.catLabel[c] || c,
          items: PS.list(c).map((d) => ({ id: d.key, label: d.label || d.key, icon: d.icon, pbKey: d.key, thumb: true })),
        }));
      const tpl = stList(group);
      if (tpl.length) {
        out.push({ key: 'tpl', label: tplLabel, items: tpl.map((s) => ({ id: s.id, label: s.label, icon: s.icon, pbKey: s.pbKey, thumb: true })) });
      }
      return out;
    };

    // 基础图形 / 物理图形 / 学科模板：点一下选工具，再在画布上拖框（和以前一致）。
    // 2.0.9：第 5 个参数 thumb=true 时，格子里放「所见即所得」缩略图 —— 由 core/shape-thumbs.js
    // 走真实渲染管线（renderThumb → drawItem）生成，就是插进画布的样式（含底色、标注、填充）。
    // 取不到缩略图（原生几何 / 自定义图形 / 渲染异常）一律回落手绘 SVG 图标，格子不会空。
    const mkBtn = (id, label, icon, pbKey, thumb) => {
      let t = '';
      if (thumb && GW.shapeThumbs) {
        try { t = GW.shapeThumbs.src(pbKey || id); } catch (e) { t = ''; }
      }
      return h('button', {
        class: 'gb' + ((pbKey ? (S.type === 'pb' && S.pbKey === pbKey) : S.type === id) ? ' on' : ''),
        onclick: () => { if (pbKey) { S.type = 'pb'; S.pbKey = pbKey; } else S.type = id; GW.tool.set('shape'); closePop(); },
      }, t
        ? h('span', { class: 'gb-thumbwrap', html: `<img class="gb-thumb" src="${t}" alt="" draggable="false">` })
        : h('span', { html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon || SHAPE_ICONS.line}</svg>` }), label);
    };

    // 数学页的按钮文字只占一行；长名称用短名，避免第二行压到缩略图。
    const MS_SHORT = {
      '一次函数': '一次', '二次函数': '二次', '二次函数（顶点式）': '顶点式', '三次函数': '三次',
      '反比例函数': '反比例', '指数函数': '指数', '对数函数': '对数',
      '正弦函数': '正弦', '余弦函数': '余弦', '正切函数': '正切',
      '绝对值函数': '绝对值', '根号函数': '根号', '幂函数': '幂', '分式函数': '分式',
      '圆弧（半径标注）': '圆弧', '角（标角度）': '角', '平行线（截线）': '平行线',
    };
    // 平面几何 / 函数图像：按钮结构与「数学模板」完全一致（同一个 .gb、同一个 26px 图标位、
    // 同一行标签），只是图标是现画的线稿位图而不是 SVG —— 这样三组子面板的观感统一。
    const mkMs = (d) => h('button', {
      class: 'gb ms' + (S.type === 'ms' && S.msKey === d.key ? ' on' : ''), title: d.label + '（选中后在画板上拖框插入，再点「参数」调）', 'data-ms': d.key,
      onclick: () => {
        if (!MS) return;
        // 不在按钮上直接生成：只记住要画哪个图形，回到画板拖框决定位置与大小。
        S.type = 'ms'; S.msKey = d.key; S.msParams = MS.defaults(d.key);
        GW.tool.set('shape'); closePop();
      },
    }, h('span', { class: 'ms-ico' }, thumbSrc(d.key) ? h('img', { class: 'ms-thumb', src: thumbSrc(d.key), alt: '' }) : h('span', { class: 'ms-sym' }, d.cat === 'func' ? 'ƒ' : '△')), h('span', { class: 'gb-name' }, MS_SHORT[d.label] || d.label));

    const grid = (nodes) => h('div', { class: 'grid-btns', style: { gridTemplateColumns: COLS } }, ...nodes);

    const search = h('input', {
      class: 'shape-search', type: 'search',
      placeholder: '搜索：三角形、一次函数、平抛、细胞、电路…',
    });

    const tabRow = h('div', { class: 'shape-tabs' });
    const subRow = h('div', { class: 'shape-subtabs' });
    const content = h('div', { class: 'shape-content' });
    // 上次停在哪一页就记住，少点一次
    let tab = TABS.some((t) => t.key === S.lastTab) ? S.lastTab : 'basic';
    let mathCat = S.lastMathCat || 'geo', physCat = S.lastPhysCat || 'mech';
    let chemCat = S.lastChemCat || null, bioCat = S.lastBioCat || null;
    const subGet = () => (tab === 'math' ? mathCat : tab === 'phys' ? physCat : tab === 'chem' ? chemCat : bioCat);
    const subSet = (k) => {
      if (tab === 'math') { mathCat = k; S.lastMathCat = k; }
      else if (tab === 'phys') { physCat = k; S.lastPhysCat = k; }
      else if (tab === 'chem') { chemCat = k; S.lastChemCat = k; }
      else { bioCat = k; S.lastBioCat = k; }
    };

    function renderBasic() {
      const nodes = [];
      for (const [id, label] of GW.SHAPES) {
        if (id === 'curve') continue;
        nodes.push(mkBtn(id, label, SHAPE_ICONS[id]));
      }
      // 1.6.0：基础页追加「标注」类参数图形（尺寸线/几何关系标记），它们不进物理子分类
      if (GW.physShapes && GW.physShapes.subjectCats) {
        for (const cat of GW.physShapes.subjectCats('base')) {
          for (const d of GW.physShapes.list(cat)) nodes.push(mkBtn(d.key, d.label, d.icon, d.key, true));
        }
      }
      // 通用模板（方格纸/表格/田字格…）并入基础，不再单列一组。
      for (const s of stList('通用')) nodes.push(mkBtn(s.id, s.label, s.icon, s.pbKey, true));
      content.append(
        grid(nodes),
        h('p', { class: 'muted', style: { margin: '10px 0 0' } }, '选中工具后在画布上拖一个框；颜色与粗细跟随画笔。磁场填充（× 向里 / · 向外）不放在这一页：画完选中图形，点工具条「参数」在里面单独选 —— 那是每个图形自己的属性；选好方向后，同一个面板里的「磁场里的电荷」可以往边界上放正 / 负电荷。'));
    }

    function renderMath() {
      if (!MS) { content.append(h('p', { class: 'muted' }, '数学图形库未加载')); return; }
      const subs = mathSubs();
      if (!subs.length) { content.append(h('p', { class: 'muted' }, '数学子分类都被收起来了（左上角菜单 → 自定义工具栏 可恢复）')); return; }
      if (!subs.some((s) => s.key === mathCat)) mathCat = subs[0].key;
      const cur = subs.find((s) => s.key === mathCat);
      const nodes = cur.items.map((d) => (mathCat === 'tpl' ? mkBtn(d.id, d.label, d.icon, d.pbKey, true) : mkMs(d)));
      content.append(grid(nodes));
      // 自定义图形（core/shapeself.js）：数学按「平面几何 / 函数图像」分组，画在本子页末尾
      const cs = (!GW.settings || GW.settings.customShapes !== false) && GW.shapeSelf
        ? GW.shapeSelf.list('math').filter((it) => it.group === mathCat) : [];
      if (cs.length) {
        content.append(h('div', { class: 'muted', style: { margin: '12px 0 6px' } }, '我的图形（自定义）'));
        content.append(grid(cs.map((it) => mkBtn(it.key, it.label, it.icon, it.key))));
      }
      if (mathCat === 'tpl') {
        content.append(h('p', { class: 'muted', style: { margin: '10px 0 0', lineHeight: 1.6 } },
          '模板拖框插入；颜色与粗细跟随画笔。'));
      } else {
        content.append(h('p', { class: 'muted', style: { margin: '10px 0 0', lineHeight: 1.6 } },
          '点图形后在画板拖框插入；选中可调参数。'));
      }
    }

    function renderPhys() {
      const PS = GW.physShapes;
      if (!PS || !PS.cats().length) { content.append(h('p', { class: 'muted' }, '物理图形库未加载')); return; }
      const subs = physSubs();
      if (!subs.length) { content.append(h('p', { class: 'muted' }, '物理图形库未加载')); return; }
      if (!subs.some((s) => s.key === physCat)) physCat = subs[0].key;
      const cur = subs.find((s) => s.key === physCat);
      content.append(grid(cur.items.map((d) => mkBtn(d.key, d.label || d.key, d.icon, d.key, d.thumb !== false))));
    }

    const renderStencil = (group) => {
      const items = stList(group);
      if (!items.length) { content.append(h('p', { class: 'muted' }, '这个学科还没有图形')); return; }
      content.append(grid(items.map((s) => mkBtn(s.id, s.label, s.icon, s.pbKey, s.thumb !== false))));
    };

    function renderSearch(q) {
      const nodes = [];
      const seen = new Set();
      const addBtn = (id, label, icon, pbKey, thumb) => {
        if (!label || seen.has(label)) return;
        seen.add(label);
        nodes.push(mkBtn(id, label, icon, pbKey, thumb));
      };
      const kw = q.toLowerCase();
      const has = (s) => String(s || '').toLowerCase().indexOf(kw) >= 0;
      for (const [id, label] of GW.SHAPES) if (id !== 'curve' && (has(id) || has(label))) addBtn(id, label, SHAPE_ICONS[id]);
      for (const s of stList('通用')) if (has(s.label)) addBtn(s.id, s.label, s.icon, s.pbKey, true);
      if (MS) for (const d of MS.list()) {
        if ((has(d.key) || has(d.label) || has(MS.catLabel[d.cat])) && !seen.has(d.label)) {
          seen.add(d.label);
          nodes.push(mkMs(d));
        }
      }
      for (const s of stMath()) if (has(s.label)) addBtn(s.id, s.label, s.icon, s.pbKey, true);
      if (GW.physShapes) {
        for (const c of GW.physShapes.cats()) {
          if (c === 'anim' || c === 'sketch' || !tcOn('physSubs', c)) continue;
          for (const d of GW.physShapes.list(c)) if (has(d.label) || has(d.key)) addBtn(d.key, d.label || d.key, d.icon, d.key, true);
        }
      }
      if (GW.physShapes && GW.physShapes.subjectCats) {
        for (const subj of ['chem', 'bio', 'base']) {
          for (const c of GW.physShapes.subjectCats(subj)) {
            for (const d of GW.physShapes.list(c)) if (has(d.label) || has(d.key)) addBtn(d.key, d.label || d.key, d.icon, d.key, true);
          }
        }
      }
      for (const g of ['化学', '生物', '地理']) {
        for (const s of stList(g)) if (has(s.label)) addBtn(s.id, s.label, s.icon, s.pbKey, true);
      }
      // 自定义图形（core/shapeself.js）：物理的那批已经在上面按子类列过了，这里补其余学科
      if (GW.shapeSelf) {
        for (const it of GW.shapeSelf.list()) {
          if (has(it.label) || has(it.key)) { seen.add(it.label); nodes.push(mkBtn(it.key, it.label, it.icon, it.key)); }
        }
      }
      if (!nodes.length) content.append(h('p', { class: 'muted' }, '没有找到「' + q + '」'));
      else content.append(grid(nodes.slice(0, 60)));
    }

    const scrollBox = h('div', { class: 'shape-scroll' }, content);

    // 面板高度会随分页变化；每次重排都重新贴到触发按钮上方，别让底边压住 Dock。
    let placePop = () => { if (GW.repositionPop) GW.repositionPop(); };
    function render() {
      const visTabs = TABS.filter((t) => tcOn('shapeTabs', t.key));
      if (!visTabs.some((t) => t.key === tab)) tab = visTabs.length ? visTabs[0].key : 'basic';
      tabRow.replaceChildren(...visTabs.map((t) => h('button', {
        class: 'shape-tab' + (tab === t.key ? ' on' : ''),
        onclick: () => { tab = t.key; S.lastTab = t.key; search.value = ''; scrollBox.scrollTop = 0; render(); },
      }, t.label)));
      // 六个学科页全被老师收起时给个出口，别让面板变成空白（也没有「恢复」的入口就找不到了）
      if (!visTabs.length) {
        subRow.style.display = 'none'; subRow.replaceChildren();
        content.replaceChildren(h('p', { class: 'muted' },
          '图形分类已全部收起 —— 在 ☰ 菜单 →「自定义工具栏…」里可以随时勾回来。'));
        return;
      }
      const q = search.value.trim();
      const subs = q ? null
        : tab === 'math' ? mathSubs()
        : tab === 'phys' ? physSubs()
        : tab === 'chem' ? subjectSubs('chem', '化学', '化学模板', 'chemSubs')
        : tab === 'bio' ? subjectSubs('bio', '生物', '生物模板', 'bioSubs')
        : null;
      if (subs && subs.length) {
        // 化学/生物页默认停在「学科模板」：老师原来的入口一个都没挪位置，新加的参数图在隔壁子页
        if (!subs.some((s) => s.key === subGet())) {
          const tpl = (tab === 'chem' || tab === 'bio') ? subs.find((x) => x.key === 'tpl') : null;
          subSet(tpl ? tpl.key : subs[0].key);
        }
        const curKey = subGet();
        subRow.style.display = '';
        subRow.replaceChildren(...subs.map((s) => {
          const on = curKey === s.key;
          return h('button', {
            class: 'shape-subtab' + (on ? ' on' : ''),
            onclick: () => { subSet(s.key); scrollBox.scrollTop = 0; render(); },
          }, s.label, h('span', { class: 'n' }, String(s.items.length)));
        }));
      } else { subRow.style.display = 'none'; subRow.replaceChildren(); }
      content.replaceChildren();
      if (q) renderSearch(q);
      else if (tab === 'math') renderMath();
      else if (tab === 'phys') renderPhys();
      else if (subs && subs.length) {
        const cur = subs.find((s) => s.key === subGet()) || subs[0];
        if (!cur.items.length) content.append(h('p', { class: 'muted' }, '这个分类还没有图形'));
        else content.append(grid(cur.items.map((it) => mkBtn(it.id, it.label, it.icon, it.pbKey))));
      }
      else {
        const t = TABS.find((x) => x.key === tab);
        if (t && t.group) renderStencil(t.group);
        else renderBasic();
      }
      // 自定义图形（core/shapeself.js）：物理按子类进了各子面板（注册时 cat=group）、数学按分组进了各子页，
      // 只剩化学/生物/地理在页尾补一段（1.3.12 起物理页不再重复列一遍）。
      if (!q && (tab === 'chem' || tab === 'bio' || tab === 'geo') && GW.shapeSelf && GW.settings.customShapes !== false) {
        const items = GW.shapeSelf.list(tab);
        if (items.length) {
          content.append(h('div', { class: 'muted', style: { margin: '12px 0 6px' } }, '我的图形（自定义）'));
          content.append(grid(items.map((it) => mkBtn(it.key, it.label, it.icon, it.key))));
        }
      }
      placePop();
    }
    search.addEventListener('input', render);

    // 长方形面板：分页即分类，顶部一排按钮，下面一次铺开该分类的全部图形。
    const body = h('div', { class: 'shape-panel', style: { width: '1040px' } },
      h('div', { class: 'shape-head' },
        h('h4', { class: 'shape-title' }, '图形', h('span', { class: 'muted' }, '颜色与粗细跟随画笔')),
        tabRow, search),
      subRow,
      scrollBox,
      h('p', { class: 'muted shape-tip' }, '选图形 → 在画板拖框；选中后可调「参数」。'));
    // 先把首页内容填好再 pop()：pop() 靠 offsetHeight 决定向上还是向下夹，
    // 空壳子只有一百多像素高，会先被放到屏幕外按钮的正上方，填完内容就冲出视口了。
    render();
    const el = pop(anchor, body, { cls: 'shape-pop' });
    placePop = () => {
      // 宽度与底部 Dock 左右对齐并在屏幕居中；Dock 收起时退回居中 1040。
      const off = document.body.classList.contains('chrome-off');
      const d = off ? null : document.getElementById('dock');
      const dr = d ? d.getBoundingClientRect() : null;
      const cs = getComputedStyle(el);
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
      const maxW = innerWidth - 24 - pad;
      // .pop 自己带 padding/border：body 宽度要扣掉它们，外框才会和 Dock 左右齐平。
      const w = Math.min(dr && dr.width > 240 ? dr.width - pad : 1040, maxW);
      body.style.width = w + 'px';
      const outer = w + pad;
      const want = dr ? dr.left + dr.width / 2 - outer / 2 : (innerWidth - outer) / 2;
      el.style.left = GW.clamp(want, 8, innerWidth - outer - 8) + 'px';
      body.style.maxHeight = Math.max(300, Math.min(620, innerHeight - 120)) + 'px';
      const hh = el.offsetHeight;
      const baseTop = dr ? dr.top : anchor.getBoundingClientRect().top;
      el.style.top = Math.max(8, Math.min(baseTop - hh - 10, innerHeight - hh - 8)) + 'px';
    };
    placePop();
  }
  function textPop(anchor) {
    const T = GW.tool.text;
    const sizes = GW.ui.segmented({ options: [20, 28, 36, 48, 64, 96].map((s) => ({ value: s, label: String(s) })), value: T.size, onChange: (v) => (T.size = +v) });
    const note = GW.ui.toggle({ label: '便签样式（黄底）', value: T.note, onChange: (v) => (T.note = v) });
    pop(anchor, h('div', { style: { width: '340px', display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('h4', { style: { margin: 0 } }, '字号'), sizes.el, note.el,
      h('button', { class: 'gw-btn', onclick: () => { closePop(); GW.formulaEditor(); } }, '∑ 插入数学 / 物理公式'),
      h('p', { class: 'muted', style: { margin: 0 } }, '在画布上点击即可输入文字；双击已有文字可再次编辑。')));
  }

  // ---------- 插入 ----------
  // 1.1.11：插入项改成「id → 按钮」的清单，「自定义工具栏」按 id 隐藏（默认全开）。
  const INSERT_ITEMS = [
    ['all', 'folder', '任意文件', '自动识别', () => GW.importer.pick('all')],
    ['pdf', 'pdf', 'PDF 文档', '可直接书写', () => GW.importer.pick('pdf')],
    ['image', 'image', '图片 / GIF', '动图可播放', () => GW.importer.pick('image')],
    ['video', 'video', '视频 / 音频', '可慢放、截帧', () => GW.importer.pick('video')],
    ['swf', 'swf', 'Flash 动画', 'SWF 课件', () => GW.importer.pick('swf')],
    ['ggbfile', 'ggb', 'GeoGebra 文件', '.ggb', () => GW.importer.pick('ggb')],
    ['office', 'pages', 'PPT / Word', '导入课件或文档', () => GW.importer.pick('office')],
    ['html', 'globe', '网页课件', '本地 .html', () => GW.importer.pick('html')],
    // R5：第 6 项是「这台设备能不能用」。没有它，安卓上照样摆着「程序 / 快捷方式」，
    // 点下去必然只会弹一句「浏览器版无法导入此类文件」—— 看得见却点不通，比藏起来更糟。
    ['app', 'desktop', '程序 / 快捷方式', 'exe 一键启动', () => GW.importer.pick('app'), () => !!GW.isElectron],
    ['link', 'link', '网址', 'PhET、Desmos…', async () => { const u = await GW.prompt('输入网址', 'https://'); if (u && u !== 'https://') GW.importer.insertWeb(/^\w+:/.test(u) ? u : 'https://' + u); }],
    ['formula', 'formula', '公式', 'LaTeX', () => GW.formulaEditor()],
    ['comment', 'note', '评论钉', '钉在页面任意位置', () => GW.addComment()],
    ['ai', 'star', 'AI 助手', '统一对话 / AI 工具 / 画布操作', () => {
      // 1.7.0（T01）：教室模式关掉 AI 入口（数据不动，退出教室模式立刻回来）
      if (GW.flags && GW.flags.get('aiPanel') === false) { GW.toast('AI 面板已关闭（教室模式）'); return; }
      if (GW.aiChat) GW.aiChat.open(); else GW.ai.open();
    }],
    ['note', 'note', '便签', '', () => { const vc = GW.viewCenter(), sz = 32 / GW.camera.s; GW.objects.create('text', { html: '', size: sz, note: '#fff4b8' }, { x: vc.x - sz * 5, y: vc.y - sz * 2, w: sz * 10, h: sz * 4, exact: true, record: false, autoEdit: true }); }],
    ['camera', 'camera', '截图', () => (GW.isElectron ? '屏幕任意区域' : '截取当前画布'), () => GW.classTools.screenshot()],
    ['ggb', 'ggb', 'GeoGebra', '新建画板', () => ggbPick()],
    ['page', 'plus', '新页面', '', () => GW.addPage()],
    ['space', 'maximize', '项目空间', '单页查看 + 翻页（Esc 退出）', () => GW.space.toggle()],
    ['index', 'pages', '页面索引', '多页文件按页码跳', () => { if (!GW.space.isOn()) GW.space.toggle(); setTimeout(() => GW.space.openIndex(), 60); }],
  ];
  function insertPop(anchor) {
    // 用户自定义隐藏（tcOn）与本机能力（第 6 项）两个条件都要过
    const avail = INSERT_ITEMS.filter((x) => tcOn('insert', x[0]) && (!x[5] || x[5]()));
    const grid = h('div', { class: 'grid-btns', style: { gridTemplateColumns: 'repeat(4, 104px)' } },
      avail.map(([id, icon, label, subText, fn]) => {
        const sub = typeof subText === 'function' ? subText() : subText;
        return h('button', { class: 'gb', 'data-tc-id': id, onclick: () => { closePop(); fn(); } }, h('span', { html: I(icon) }), label, sub ? h('small', null, sub) : null);
      }));
    const shown = avail.length;
    // 2.0：最上面一条「万能插入」—— 141 个图形 + 仿真 + 本课件内容，一个框里打字就能找到
    const quick = GW.palette ? h('button', { class: 'pal-entry', onclick: () => { closePop(); GW.palette.open(); } },
      h('span', { class: 'pal-entry-i', html: I('search') }), h('span', null, '搜图形、仿真、板书内容…'), h('kbd', null, 'Ctrl K')) : null;
    pop(anchor, h('div', null, quick, h('h4', null, '插入到画布（也可以直接把文件拖进来或 Ctrl+V 粘贴）'), grid,
      shown ? null : tcEmptyTip()));
  }
  // ---------- 复用架（1.3.0 R7）：跨页 / 跨文件 / 重启都在的取样架 ----------
  // 老师上课反复用同一张图：以前复制只存在内存里，换页就没了。架子的实现在 core/shelf.js，
  // 这里只铺 UI —— 12 格（超了丢最旧），点一格贴到视口中心，可清空。
  function shelfPop(anchor) {
    const SH = GW.shelf;
    if (!SH) return;
    const list = SH.list();
    const CATS = SH.CATS || { shape: '图形', ink: '笔迹', phys: '物理图', math: '数学图', shot: '截图', obj: '对象', mix: '组合' };
    const ago = (t) => {
      const d = Date.now() - (t || 0);
      if (d < 60e3) return '刚刚';
      if (d < 3600e3) return Math.round(d / 60e3) + ' 分钟前';
      if (d < 86400e3) return Math.round(d / 3600e3) + ' 小时前';
      if (d < 2 * 86400e3) return '昨天';
      const dt = new Date(t || 0);
      return (dt.getMonth() + 1) + '月' + dt.getDate() + '日';
    };
    // 分类计数：老存档没有 cat，catOf 会现算（不迁移也能用）
    const catOfRec = (rec) => (SH.catOf ? SH.catOf(rec) : 'mix');
    const counts = {};
    for (const rec of list) { const c = catOfRec(rec); counts[c] = (counts[c] || 0) + 1; }
    let cur = 'all';
    const body = h('div', { class: 'shelf-wrap' });
    const tabs = h('div', { class: 'shelf-tabs' });
    const grid = h('div', { class: 'shelf-grid' });

    function card(rec, i) {
      const c = catOfRec(rec);
      const th = SH.thumb ? SH.thumb(rec, 156, 96) : '';
      const tail = rec.kind === 'items' && (rec.items || []).length > 1 ? '（' + rec.items.length + ' 件）' : '';
      return h('div', {
        class: 'shelf-card', 'data-shelf-i': i, title: (rec.title || '取样') + tail + ' · 点击贴到画面中间',
        onclick: (ev) => {
          const cl = ev.target && ev.target.classList;
          // 星标按钮里的 svg 会变成事件目标，所以要往上找一层（closest）
          if (cl && (cl.contains('shelf-del') || cl.contains('shelf-fav')
            || (ev.target.closest && ev.target.closest('.shelf-fav')))) return;
          closePop();
          if (!SH.pasteAt(i)) GW.toast('这一件已经不在架上了');
        },
      },
        h('div', { class: 'shelf-shot' },
          th ? h('img', { src: th, alt: rec.title || '取样', draggable: 'false' })
             : h('span', { class: 'shelf-noimg', html: I('shapes') })),
        h('div', { class: 'shelf-cap' },
          h('b', null, (rec.title || '取样').slice(0, 12) + tail),
          h('span', null, CATS[c] + ' · ' + ago(rec.at))),
        // 2.2.3（R6）：架子上那件一键转存进长期收藏（不再淘汰、能导出素材包）。
        // 复用架只有 12 件、超出丢最旧，而老师真正想长留的往往就是架子上这几件。
        h('button', {
          class: 'shelf-fav', title: '存进长期收藏（不参与 12 件淘汰）', onclick: async (ev) => {
            ev.stopPropagation();
            if (!SH.favAddRec) { GW.toast('这个版本不支持'); return; }
            const r = await SH.favAddRec(SH.get(i));
            if (r.ok) { GW.toast('已存进长期收藏'); paintFav(); } else GW.toast(r.error || '收藏失败');
          },
        }, h('span', { html: I('star') })),
        h('button', {
          class: 'shelf-del', title: '从架子上移除', onclick: (ev) => {
            ev.stopPropagation();
            SH.remove(i); draw(); GW.toast('已从复用架移除');
          },
        }, '×'));
    }

    function draw() {
      const now = SH.list();
      const n = {};
      for (const rec of now) { const c = catOfRec(rec); n[c] = (n[c] || 0) + 1; }
      tabs.replaceChildren(...[['all', '全部', now.length]].concat(
        Object.keys(n).sort((a, b) => n[b] - n[a]).map((k) => [k, CATS[k] || k, n[k]]))
        .map(([k, label, cnt]) => h('button', {
          class: 'shelf-tab' + (cur === k ? ' on' : ''), 'data-cat': k,
          onclick: () => { cur = k; draw(); },
        }, label + ' ' + cnt)));
      const shown = now.map((rec, i) => [rec, i]).filter(([rec]) => cur === 'all' || catOfRec(rec) === cur);
      grid.replaceChildren(...(shown.length
        ? shown.map(([rec, i]) => card(rec, i))
        : [h('p', { class: 'muted', style: { gridColumn: '1 / -1', margin: '2px' } },
            now.length ? '这一类里还没有东西。' : '还是空的：框选一点东西按 Ctrl+C（复制）就会进来，「课堂 → 截图」也会自动进来')]));
      body.dataset.empty = now.length ? '0' : '1';
    }

    // ---- 长期收藏（P5）：不参与上面 12 件的淘汰，自己一套列表/搜索/导入导出 ----
    const favListEl = h('div', { class: 'fav-list' });
    const favSearch = h('input', { class: 'fav-search', placeholder: '搜索收藏：标题 / 分类', oninput: () => paintFav() });
    const favHint = h('p', { class: 'muted fav-hint' }, '');
    async function paintFav() {
      const q = (favSearch.value || '').trim().toLowerCase();
      let metas = [];
      try { metas = await SH.favList(); } catch (e) { metas = []; }
      const shown = metas.filter((m) => !q
        || String(m.title || '').toLowerCase().indexOf(q) >= 0
        || String(CATS[m.cat] || m.cat || '').toLowerCase().indexOf(q) >= 0);
      favListEl.replaceChildren(...(shown.length ? shown.map((m) => h('div', { class: 'fav-row', 'data-fav': m.id },
        h('span', { class: 'fav-thumb' }, m.thumb ? h('img', { src: m.thumb, alt: m.title || '收藏' }) : h('span', { class: 'shelf-noimg', html: I('shapes') })),
        h('span', { class: 'fav-main' },
          h('b', null, String(m.title || '收藏').slice(0, 16)),
          h('span', null, (CATS[m.cat] || m.cat || '素材') + ' · ' + (m.n || 1) + ' 件'
            + (m.miss ? ' · 缺失 ' + m.miss : '') + ' · ' + ago(m.at))),
        // 2.2.3（R6）：收藏 → 复用架。贴回是贴到画布，放回复用架是进「12 件」那排快捷位，
        // 两者互补：常贴的走收藏，当次要反复用的先放回架子上。
        h('button', {
          class: 'gw-btn fav-toshelf', title: '放回复用架（占用 12 件里的一个位置）', onclick: async (ev) => {
            ev.stopPropagation();
            if (!SH.favToShelf) { GW.toast('这个版本不支持'); return; }
            const r = await SH.favToShelf(m.id);
            if (r.ok) { draw(); GW.toast('已放回复用架'); } else GW.toast(r.error || '放不回去');
          },
        }, '上架'),
        h('button', {
          class: 'gw-btn fav-paste', onclick: async (ev) => {
            ev.stopPropagation();
            const r = await SH.favPaste(m.id);
            if (r.ok) GW.toast(r.missing ? '已贴回（有 ' + r.missing + ' 项外部依赖缺失）' : '已贴回画面中间');
            else GW.toast(r.error || '贴不回来');
          },
        }, '贴回'),
        h('button', {
          class: 'gw-btn fav-del', title: '只删这条收藏（不动其它数据）', onclick: async (ev) => {
            ev.stopPropagation();
            const r = await SH.favRemove(m.id);
            if (r.ok) { GW.toast('已删除这条收藏'); paintFav(); } else GW.toast(r.error || '删除失败');
          },
        }, '删除')))
        : [h('p', { class: 'muted', style: { margin: '2px' } },
            metas.length ? '没有匹配的收藏。' : '还没有长期收藏：先框选画面上的内容，再点「收藏当前选区」。')]));
      favHint.textContent = '共 ' + metas.length + ' 条（最多 ' + (SH.FAV_MAX || 60) + ' 条，超出丢最旧）· 桌面存用户数据目录，换文件/重启都在；缩略图坏了不影响内容';
    }
    const favTools = h('div', { class: 'fav-tools' },
      h('button', {
        class: 'gw-btn', onclick: async () => {
          const its = ((GW.selection && GW.selection.items) || []).map(GW.clone);
          if (!its.length) { GW.toast('先框选要收藏的内容'); return; }
          const r = await SH.favAdd(its, {});
          if (r.ok) {
            GW.toast('已收藏' + (r.missing ? '（' + r.missing + ' 项外部依赖搬不走，已标记缺失）' : ''));
            paintFav();
          } else GW.toast(r.error || '收藏失败');
        },
      }, '收藏当前选区'),
      h('button', {
        class: 'gw-btn', onclick: async () => {
          const r = await SH.favExport();
          if (r.ok) GW.toast('已导出 ' + r.count + ' 条收藏');
          else if (!r.cancelled) GW.toast(r.error || '导出失败');
          else GW.toast('已取消导出');
        },
      }, '导出素材包…'),
      h('button', {
        class: 'gw-btn', onclick: async () => {
          if (!window.gewu || !window.gewu.openFiles) { GW.toast('浏览器/安卓版：把素材包里的收藏逐条贴回来'); return; }
          const ps = await window.gewu.openFiles({ title: '导入素材包', filters: [{ name: '素材包', extensions: ['json'] }], multi: false });
          if (!ps || !ps.length) return;
          let text = '';
          try { text = await window.gewu.readFile(ps[0]); } catch (e) { GW.toast('读不了这个文件'); return; }
          const r = await SH.favImport(text);
          if (r.ok) {
            GW.toast('已导入 ' + r.added + ' 条' + (r.skipped ? '（跳过已存在 ' + r.skipped + ' 条）' : '') + (r.failed ? '，失败 ' + r.failed + ' 条' : ''));
            paintFav();
          } else GW.toast(r.error || '导入失败');
        },
      }, '导入素材包…'));
    const favWrap = h('div', { class: 'fav-wrap' },
      h('h4', null, '长期收藏 · 换文件、重启都在'),
      favTools, favSearch, favHint, favListEl);
    paintFav();

    body.append(
      h('h4', null, '复用架 · 跨页、跨文件、重启都在（最多 ' + (SH.MAX || 12) + ' 件，最新的在最前）'),
      tabs, grid,
      h('div', { class: 'shelf-acts' },
        h('button', { class: 'gw-btn', onclick: () => { closePop(); SH.pasteAt(0); } }, '贴最近一件（Ctrl+Shift+V）'),
        h('button', { class: 'gw-btn', onclick: () => { SH.clear(); closePop(); GW.toast('复用架已清空'); } }, '清空复用架')),
      favWrap);
    draw();
    pop(anchor, body);
  }
  function ggbPick() {
    const grid = h('div', { class: 'grid-btns', style: { gridTemplateColumns: 'repeat(4, 1fr)' } },
      Object.entries(GW.GGB_APPS).map(([k, v]) => h('button', { class: 'gb', onclick: () => { d.close(); GW.importer.insertGgb(k); } }, h('span', { html: I('ggb') }), v)));
    const mat = GW.ui.text({ label: '或输入 GeoGebra 资源 ID（geogebra.org/m/ 后面的字符）', placeholder: '例如 hm8uxfvp' });
    const d = GW.dialog({ title: '新建 GeoGebra', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, grid, mat.el), ok: '打开资源', onOk: () => { const id = mat.get().trim().replace(/^.*\/m\//, ''); if (id) GW.importer.insertGgb('classic', { materialId: id, name: id }); }, width: 620 });
  }

  // ---------- 尺规 ----------
  function geoPop(anchor) {
    const it = (id, icon, label, fn) => (tcOn('geo', id) ? h('button', { class: 'gb', 'data-tc-id': id, onclick: () => { closePop(); fn(); } }, h('span', { html: I(icon) }), label) : null);
    const shown = ['ruler', 'tri45', 'tri60', 'protractor', 'compass', 'clear'].filter((k) => tcOn('geo', k)).length;
    pop(anchor, h('div', null, h('h4', null, '尺规作图（插入后直接就是书写状态，用笔沿边缘画线会自动吸附）'),
      h('div', { class: 'grid-btns', style: { gridTemplateColumns: 'repeat(3, 100px)' } },
        it('ruler', 'ruler', '直尺', () => GW.geo.add('ruler')),
        it('tri45', 'triangle', '三角板 45°', () => GW.geo.add('tri45')),
        it('tri60', 'triangle', '三角板 30°/60°', () => GW.geo.add('tri60')),
        it('protractor', 'protractor', '量角器', () => GW.geo.add('protractor')),
        it('compass', 'compass', '圆规', () => GW.geo.add('compass')),
        it('clear', 'close', '全部收起', () => GW.geo.clear())),
      shown ? null : tcEmptyTip()));
  }

  // ---------- 课堂工具 ----------
  function classPop(anchor) {
    const T = GW.classTools;
    const it = (id, icon, label, fn) => (tcOn('class', id) ? h('button', { class: 'gb', 'data-tc-id': id, onclick: () => { closePop(); fn(); } }, h('span', { html: I(icon) }), label) : null);
    // 1.6.0：按「课堂上要做什么」分组，不再 16 个入口等权罗列。
    // 只重排入口：每个入口的显隐仍由 tcOn('class', id) 决定，隐藏过的工具不会重新冒出来。
    const GROUPS = [
      ['备课与授课', [
        ['clesson', 'book', '一节课', () => GW.classRoom.lesson()],
      ]],
      ['组织课堂', [
        ['timer', 'timer', '计时器', T.timer], ['rollcall', 'users', '随机点名', T.rollcall],
        ['scoreboard', 'star', '小组计分', T.scoreboard], ['cquiz', 'star', '答题器', () => GW.classRoom.quiz()],
      ]],
      ['演示辅助', [
        ['spotlight', 'spotlight', '聚光灯', T.spotlight], ['curtain', 'curtain', '板中板', T.curtain],
        ['magnifier', 'magnifier', '放大镜', T.magnifier],
        // 1.7.0（T09）：胶带整页揭开/盖回（只切视图，不动数据、不进撤销栈）
        ['ctape', 'note', '胶带揭开/盖回', () => { if (GW.tapeToggle) GW.tapeToggle(); }],
      ]],
      ['记录课堂', [
        ['crec', 'video', '录课', () => GW.lessonRec.panel()], ['croom', 'play', '课堂回放', () => GW.classRoom.panel()],
      ]],
      ['实用工具', [
        ['calc', 'calc', '计算器', T.calculator], ['constants', 'formula', '物理常量', T.constants],
        ['camera', 'camera', '截图', () => T.screenshot()],
      ]],
      ['画布与页面', [
        ['bg', 'bg', '背景', () => bgPop(anchor)], ['pages', 'pages', '页面管理', pagesDrawer],
        ['desktop', 'desktop', GW.overlayMode ? '退出批注' : '桌面画布', desktopMode],
      ]],
    ];
    const anyOn = GROUPS.some((g) => g[1].some((x) => tcOn('class', x[0])));
    pop(anchor, h('div', { class: 'cp-pop' }, h('h4', null, '课堂工具'),
      GROUPS.map(([title, items]) => {
        const cells = items.map((x) => it(x[0], x[1], x[2], x[3])).filter(Boolean);
        return cells.length ? h('div', { class: 'cp-grp' }, h('div', { class: 'cp-grp-t' }, title), h('div', { class: 'grid-btns cp-grid' }, ...cells)) : null;
      }),
      anyOn ? null : tcEmptyTip()));
  }

  // ---------- 背景 ----------
  // 1.1.8：护眼系底色。纯白 #ffffff 与纯黑 #000000 的对比度对投影/一体机太刺眼，
  // 所以补了 5 个「柔和」档（柔沙/护眼绿/雾蓝/柔暗/磨砂灰），原有 5 个一个没动。
  const BG_COLORS = [
    ['white', '白板', '#ffffff'], ['paper', '米黄', '#fbf8f1'], ['green', '黑板绿', '#1f3b30'], ['black', '纯黑', '#000000'], ['blue', '深蓝', '#13284a'],
    ['sand', '柔沙', '#f3ede2'], ['mint', '护眼绿', '#e8efe6'], ['mist', '雾蓝', '#e9eef5'], ['dusk', '柔暗', '#23272e'], ['flint', '磨砂灰', '#2b3036'],
    ['slate', '雾霭灰', '#383d44'], ['clay', '羊皮纸', '#f0e6d6'],
  ];
  // 材质：底色之上铺的一层极淡纹理（board.js 的 paintMaterial 生成，不占包体、不糊）
  // 1.6.2：材质只留四种 —— 无 / 磨砂 / 柔光 / 渐变。纸纹、亚麻、云雾、粉笔灰在大屏上
  // 看着脏、还容易和渐变纸的风格打架，按老师反馈删掉（旧板书里存的旧值按「无」处理）。
  const BG_MATERIALS = [['plain', '无'], ['grain', '磨砂'], ['glow', '柔光'], ['grad', '渐变']];
  const MAT_OK = BG_MATERIALS.map((x) => x[0]);
  // 一键组合：老师不用自己配「颜色 + 材质」
  const BG_PRESETS = [
    ['柔和白', 'white', 'glow'], ['纸感米白', 's-paper', 'plain'], ['护眼绿', 's-eye', 'plain'],
    ['磨砂黑板', 'flint', 'grain'], ['科技深空', 's-tech', 'plain'], ['墨绿黑板', 'green', 'grad'],
    ['雾霾灰', 's-mist', 'plain'], ['纸感暖黄', 's-paper2', 'grain'], ['星云紫', 's-nebula', 'plain'],
  ];
  // 渐变纸风格的缩略预览：用同一份数据拼成 CSS，画布和按钮长得一样
  const styleCss = (st) => {
    const base = (st.stops || []).map((st1) => st1[1] + ' ' + Math.round(st1[0] * 100) + '%').join(', ');
    const blobs = (st.blobs || []).map((b) => 'radial-gradient(circle at ' + Math.round(b[0] * 100) + '% ' + Math.round(b[1] * 100) + '%, ' + b[3] + ', transparent 62%)').join(', ');
    return (blobs ? blobs + ', ' : '') + 'linear-gradient(' + (st.ang || 160) + 'deg, ' + base + ')';
  };
  const BG_PATTERNS = [['none', '无'], ['grid', '方格'], ['coord', '坐标纸'], ['dots', '点阵'], ['lines', '横线'], ['tian', '田字格']];
  function bgPop(anchor) {
    const page = GW.page();
    const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ''));
    const col = h('div', { class: 'bg-swatches' }, BG_COLORS.map(([id, label, c]) => h('button', { class: 'bgs' + (page.bg.color === id ? ' on' : ''), title: label, style: { background: c }, onclick: (e) => { setBg({ color: id }); col.querySelectorAll('.bgs').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } })));
    // 1.6.2：画布风格（渐变纸）—— 20 个（源自「唐波的物理白板」的 10 种 + 同族变体）。
    // 选中即「底色 = 这套渐变 + 材质 = 无」，底纹（方格/横线）仍可另叠。
    const bgStyles = GW.BG_STYLES || [];
    const stylesRow = h('div', { class: 'bg-styles' }, bgStyles.map((st) => h('button', {
      class: 'bg-style' + (page.bg.color === st.id ? ' on' : ''), title: st.name,
      style: { background: styleCss(st) },
      onclick: () => {
        setBg({ color: st.id, material: 'plain' });
        stylesRow.querySelectorAll('.bg-style').forEach((b) => b.classList.remove('on'));
        col.querySelectorAll('.bgs').forEach((b) => b.classList.remove('on'));
        quickWrap.querySelectorAll('.bgs-q').forEach((b) => b.classList.remove('on'));
        mat.set('plain');
        GW.toast('已切换到「' + st.name + '」');
      },
    }, h('span', { class: 'bg-style-n', style: { color: st.light ? '#1b2433' : '#ffffff' } }, st.name))));
    // 1.1.3：调色盘 —— 5 个预设之外，谁都可以自己调一个底色。
    // 选过的自定义色记在 settings.customBg，下次开机打开调色盘还在这儿（一键回到上次那个色）。
    const pick = h('input', {
      type: 'color', class: 'bg-pick', value: isHex(page.bg.color) ? page.bg.color : (GW.settings.customBg || '#7aa2c8'),
      title: '自定义底色（点方块选颜色）',
      oninput: (e) => applyCustom(e.target.value),
    });
    const quick = ['#f4efe4', '#e8eef5', '#dfe9e2', '#f3e3e3', '#2a2f38', '#20303f'].map((c) => h('button', {
      class: 'bgs bgs-q' + (page.bg.color === c ? ' on' : ''), title: c, style: { background: c },
      onclick: (e) => { applyCustom(c); quickWrap.querySelectorAll('.bgs-q').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); },
    }));
    const quickWrap = h('div', { class: 'bg-quick' }, quick);
    function applyCustom(c) {
      if (!isHex(c)) return;
      GW.settings.customBg = c; GW.saveSettings();
      setBg({ color: c });
      col.querySelectorAll('.bgs').forEach((b) => b.classList.remove('on'));
      quickWrap.querySelectorAll('.bgs-q').forEach((b) => b.classList.toggle('on', b.style.background === c || rgbEq(b, c)));
      pick.value = c;
    }
    function rgbEq(el, hex) {
      // 颜色输入框与 style.background 的字符串形式不同（rgb(...) / #...），比一次渲染后的值
      const tmp = document.createElement('div');
      tmp.style.background = hex; document.body.append(tmp);
      const want = getComputedStyle(tmp).backgroundColor; tmp.remove();
      return getComputedStyle(el).backgroundColor === want;
    }
    const pat = GW.ui.segmented({ options: BG_PATTERNS.map(([v, l]) => ({ value: v, label: l })), value: page.bg.pattern, onChange: (v) => setBg({ pattern: v }) });
    const curMat = MAT_OK.indexOf(page.bg.material) >= 0 ? page.bg.material : 'plain';
    const mat = GW.ui.segmented({ options: BG_MATERIALS.map(([v, l]) => ({ value: v, label: l })), value: curMat, onChange: (v) => setBg({ material: v }) });
    const presetRow = h('div', { class: 'bg-presets' }, BG_PRESETS.map(([label, c, m]) => h('button', {
      class: 'bg-preset' + (page.bg.color === c && (page.bg.material || 'plain') === m ? ' on' : ''),
      onclick: (e) => {
        setBg({ color: c, material: m });
        presetRow.querySelectorAll('.bg-preset').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
        col.querySelectorAll('.bgs').forEach((b) => b.classList.toggle('on', b.style.background === c));
        mat.set(m);
        GW.toast('已切换到「' + label + '」');
      },
    }, label)));
    const all = GW.ui.button({ label: '应用到所有页面', onClick: () => { GW.doc.pages.forEach((p) => (p.bg = Object.assign({}, page.bg))); GW.settings.defaultBg = Object.assign({}, page.bg); GW.saveSettings(); if (GW.lansync) GW.lansync.pushSnapshot(); GW.toast('已应用到全部页面'); } });
    pop(anchor, h('div', { style: { width: '412px' } },
      h('h4', null, '画布风格（渐变纸）'),
      stylesRow,
      h('h4', { style: { marginTop: '10px' } }, '底色（纯色）'),
      col,
      h('h4', { style: { marginTop: '10px' } }, '自定义颜色（调色盘）'),
      h('div', { class: 'bg-custom' }, h('label', { class: 'bg-picklab' }, pick, h('span', null, isHex(page.bg.color) ? '当前：' + page.bg.color : '点这里选任意颜色')), quickWrap),
      h('h4', { style: { marginTop: '10px' } }, '护眼组合（一键配好颜色 + 材质）'),
      presetRow,
      h('h4', { style: { marginTop: '10px' } }, '材质'),
      mat.el,
      h('h4', { style: { marginTop: '10px' } }, '底纹'),
      pat.el,
      h('div', { style: { marginTop: '12px' } }, all.el)));
  }
  function setBg(patch) {
    const p = GW.page();
    Object.assign(p.bg, patch);
    // 1.1.9：底色/材质/底纹也是「用户的设置」——改一次就记进设置，新建页、新建板书、
    // 重启之后都沿用（以前只有点「应用到所有页面」或设置面板里挑默认色才会记住，
    // 老师挑了米黄纸，新建一页又回到黑底，看起来就是「设置没保存」）。
    GW.settings.defaultBg = Object.assign({}, p.bg);
    GW.saveSettings();
    GW.markDirty();
    syncDark();
    GW.requestRender();
    // 1.3.0：底色/底纹也要同步到平板（以前只改本机，平板上不动）
    if (GW.syncPage) GW.syncPage({ bg: p.bg });
  }
  function syncDark() {
    const dark = GW.isDarkBg();
    document.body.classList.toggle('dark-bg', dark);
    // 1.1.14：把 html/body 的底色也刷成当前页底色。小米平板等安卓 WebView 在沉浸式下
    // 偶尔仍会在 WebView 与屏幕底边之间留 1~2px，body 原来是浅灰 #f7f8fa，看起来就是
    // 一条白色亮线；现在这条缝的颜色跟黑板/白板一致，看不出来。
    try {
      const fill = (GW.bgTheme(GW.page().bg.color) || {}).fill || '#ffffff';
      document.documentElement.style.background = fill;
      document.body.style.background = fill;
    } catch (e) { console.error(e); }
    // 1.1.11：菜单/工具栏的底纹与文字随画布底色重算（applyUiTheme 里会带着 applyBarLook）
    try { applyUiTheme(); } catch (e) { console.error(e); }
  }
  // 对端换了底色/底纹：本机的深色适配（body.dark-bg、笔色）要跟着重算
  GW.bus.on('bg', syncDark);
  // 1.1.14：换页也要刷一次 body 底色（每页底色可能不同）
  GW.bus.on('page', syncDark);

  // =============== 缩放条与页码 ===============
  // 顶栏可以在「界面自定义」里整个关掉，关掉后菜单就没了 —— 但设置必须永远回得去。
  // 这个齿轮只在顶栏被隐藏时出现（左上角，不占课堂画面），Ctrl+, 是键盘兜底。
  function topbarHidden() {
    const t = document.getElementById('topbar');
    return !t || t.style.display === 'none';
  }
  function updGear() {
    const g = document.getElementById('gear-float');
    if (g) g.style.display = topbarHidden() ? 'grid' : 'none';
  }
  function buildBars() {
    const gear = h('button', { id: 'gear-float', title: '设置（Ctrl+,）', html: I('settings'), onclick: () => showSettings() });
    document.body.append(gear);
    updGear();
    const zv = h('button', { id: 'zoom-val', title: '点击还原 100%' });
    zv.onclick = () => { const c = GW.viewCenter(); const s = 1; GW.animateView(innerWidth / 2 - c.x * s, innerHeight / 2 - c.y * s, s); };
    const bgBtn = h('button', { class: 'tb-btn', title: '背景', html: I('bg') });
    bgBtn.onclick = () => bgPop(bgBtn);
    document.body.append(h('div', { id: 'zoombar' },
      h('button', { class: 'tb-btn', title: '缩小', html: I('minimize'), onclick: () => GW.zoomAt(innerWidth / 2, innerHeight / 2, 0.8) }),
      zv,
      h('button', { class: 'tb-btn', title: '放大', html: I('plus'), onclick: () => GW.zoomAt(innerWidth / 2, innerHeight / 2, 1.25) }),
      h('button', { class: 'tb-btn', title: '显示全部内容 (Ctrl+0)', html: I('fit'), onclick: () => GW.fitContent() }),
      bgBtn));
    GW.bus.on('view', (v) => (zv.textContent = Math.round(v.s * 100) + '%'));
    zv.textContent = '100%';

    const pv = h('button', { id: 'page-val', title: '页面管理', onclick: pagesDrawer });
    document.body.append(h('div', { id: 'pagebar' },
      h('button', { class: 'tb-btn', title: '上一页', html: I('chevronL'), onclick: () => GW.gotoPage(GW.doc.cur - 1) }),
      pv,
      h('button', { class: 'tb-btn', title: '下一页', html: I('chevronR'), onclick: () => GW.gotoPage(GW.doc.cur + 1) }),
      h('button', { class: 'tb-btn', title: '新建页面', html: I('plus'), onclick: () => GW.addPage() })));
    const upd = () => { pv.textContent = GW.doc.cur + 1 + ' / ' + GW.doc.pages.length; syncDark(); };
    GW.bus.on('page', upd); GW.bus.on('doc-loaded', upd); GW.bus.on('dirty', upd);
    upd();
    // 两条侧栏是在 buildDock() 之后才建出来的，所以启动时那次 applyCorners 里根本找不到它们
    // （1.0.11 之前靠 CSS 媒体查询兜底，缩放的让位因此成了「静态 96px」）。这里补一次，
    // 让 fitRow()/_k 与保存过的四角设置一起生效。
    layoutDock();
  }

  // =============== 页面抽屉 ===============
  // 1.6.8（R9）：页边距 / 装订线。存在 page.margin = {l,r,t,b}（世界单位），
  // 只在分页版式下画出来；导出 PDF 时作为裁剪提示（不改导出几何）。
  GW.pageMarginDialog = function () {
    const p = GW.page();
    const m = Object.assign({ l: 0, r: 0, t: 0, b: 0 }, p.margin || {});
    const box = { l: null, r: null, t: null, b: null };
    const row = (k, label) => {
      const inp = h('input', { class: 'gw-in', type: 'number', min: 0, max: 400, step: 1, value: Math.round(m[k]), style: { width: '90px' } });
      box[k] = inp;
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' } },
        h('span', { style: { width: '64px' } }, label), inp, h('span', { class: 'muted' }, '单位'));
    };
    const body = h('div', { style: { width: '300px' } },
      row('l', '左'), row('r', '右'), row('t', '上'), row('b', '下'),
      h('p', { class: 'muted', style: { marginTop: '8px', lineHeight: 1.6 } },
        '边距只在「分页版式」下显示为橙色虚线；切到无限画布就看不到，但数值会记住。'));
    GW.dialog({
      title: '页边距与装订线', body, ok: '保存',
      onOk: () => {
        // F18：与 storage.js 读写盘的上限保持一致（0..4000 世界单位），
        // 输入框 max=400 只是提示，手打 999999 会把参考线推到画布外。
        const clampM = (v) => { const n = +v; return Number.isFinite(n) ? Math.min(4000, Math.max(0, n)) : 0; };
        p.margin = { l: clampM(box.l.value), r: clampM(box.r.value), t: clampM(box.t.value), b: clampM(box.b.value) };
        GW.markDirty();
        if (GW.settings.layout !== 'paged') GW.setLayout('paged');
        GW.requestRender();
        GW.toast('页边距已保存（已切到分页版式才能看到）');
        return true;
      },
    });
  };

  // 1.6.8（R11）：页面缩略图缓存。以前每次开抽屉都把所有页整幅重画一遍（40 页的板书
  // 打开就是几十次全页渲染）。现在按「文档修订号」缓存 dataURL，没改过文档就直接用。
  const THUMB_CACHE = new Map();      // pageId + '#' + rev  -> dataURL
  GW.__thumbCalls = 0;                // 探针口子：真正进 GW.renderThumb 的次数
  function thumbURL(p, w, h) {
    const key = p.id + '#' + (GW.doc.rev || 0);
    const hit = THUMB_CACHE.get(key);
    if (hit) return hit;
    GW.__thumbCalls++;
    const cv = GW.renderThumb(p, w, h);
    let url = '';
    try { url = cv.toDataURL('image/jpeg', 0.62); } catch (e) { url = ''; }
    if (THUMB_CACHE.size > 120) THUMB_CACHE.clear();
    THUMB_CACHE.set(key, url);
    return url;
  }
  GW.thumbURL = thumbURL;

  // ================= 1.7.2（T01）：跨文档页面剪贴板 =================
  // localStorage['gewu.pageclip'] 只放一页（JSON，含该页用到的内嵌资源）。粘贴时必须重发页 id 与
  // 每个对象的 id，否则两页共享对象；外部素材（assets/... 路径）整页拒绝，避免粘过去一堆空图。
  const PAGE_CLIP = 'gewu.pageclip';
  const PAGE_CLIP_MAX = 8 * 1024 * 1024;
  const CLIP_BAD_ASSET = '含外部素材，请先导出图片';
  function utf8Len(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
  function clipScan(p) {
    const ids = new Set();
    for (const o of p.objs || []) {
      const d = (o && o.data) || {};
      if (d.asset) {
        const a = GW.doc.assets && GW.doc.assets[d.asset];
        if (!a || typeof a.data !== 'string') return { err: CLIP_BAD_ASSET };
        ids.add(d.asset);
      }
      const src = d.src;
      if (typeof src === 'string' && src && src.slice(0, 5) !== 'data:') return { err: CLIP_BAD_ASSET };
    }
    return { ids };
  }
  function clipRead() {
    try {
      const s = localStorage.getItem(PAGE_CLIP);
      if (!s) return null;
      const c = JSON.parse(s);
      if (!c || c.v !== 1 || !c.page || typeof c.page !== 'object' || Array.isArray(c.page)) return null;
      if (!Array.isArray(c.page.ink) || !Array.isArray(c.page.objs)) return null;
      return c;
    } catch (e) { return null; }
  }
  function clipCopy(i) {
    const p = GW.doc.pages[i];
    if (!p) return { ok: false, reason: 'no-page' };
    const scan = clipScan(p);
    if (scan.err) { GW.toast(scan.err, 3200); return { ok: false, reason: 'asset' }; }
    const assets = {};
    for (const id of scan.ids) { const a = GW.doc.assets[id]; assets[id] = { mime: a.mime || '', name: a.name || '', data: a.data }; }
    const page = JSON.parse(JSON.stringify({
      id: p.id, name: p.name || '', bg: p.bg, view: p.view, paper: p.paper || null, box: p.box || null,
      ink: (p.ink || []).map(GW.strip), objs: (p.objs || []).map(GW.strip), geo: (p.geo || []).map((g) => Object.assign({}, g)),
    }));
    const json = JSON.stringify({ v: 1, app: 'gewu-board', at: Date.now(), page, assets });
    const bytes = utf8Len(json);
    if (bytes > PAGE_CLIP_MAX) { GW.toast('这一页太大（约 ' + (bytes / 1048576).toFixed(1) + ' MB，上限 8 MB），没有复制', 3800); return { ok: false, reason: 'too-big', bytes }; }
    try { localStorage.setItem(PAGE_CLIP, json); } catch (e) { GW.toast('页面剪贴板写入失败：' + e.message, 3600); return { ok: false, reason: 'quota' }; }
    GW.toast('已复制第 ' + (i + 1) + ' 页到页面剪贴板');
    return { ok: true, bytes };
  }
  function clipPaste(mode) {
    const c = clipRead();
    if (!c) { GW.toast('页面剪贴板是空的'); return { ok: false, reason: 'empty' }; }
    const map = {};
    for (const [oldId, a] of Object.entries(c.assets || {})) {
      if (!a || typeof a.data !== 'string') { GW.toast('页面剪贴板里的素材已损坏', 3200); return { ok: false, reason: 'asset' }; }
      map[oldId] = GW.assets.put(a.data, a.mime || 'application/octet-stream', a.name || '');
    }
    const p = JSON.parse(JSON.stringify(c.page));
    p.id = GW.uid();
    p.ink = Array.isArray(p.ink) ? p.ink : [];
    p.objs = Array.isArray(p.objs) ? p.objs : [];
    p.geo = Array.isArray(p.geo) ? p.geo : [];
    p.ink.forEach((x) => { x.id = GW.uid(); });
    for (const x of p.objs) {
      x.id = GW.uid();
      if (x.data && x.data.asset) {
        if (!map[x.data.asset]) { GW.toast('页面剪贴板里的素材已损坏', 3200); return { ok: false, reason: 'asset' }; }
        x.data.asset = map[x.data.asset];
      }
    }
    if (!p.bg || typeof p.bg !== 'object') p.bg = Object.assign({}, GW.page().bg);
    if (!p.view || typeof p.view !== 'object') p.view = { tx: 0, ty: 0, s: 1 };
    if (!p.paper) delete p.paper;
    if (!p.box) delete p.box;
    const at = mode === 'before' ? GW.doc.cur : mode === 'after' ? GW.doc.cur + 1 : GW.doc.pages.length;
    GW.doc.pages.splice(at, 0, p);
    GW.markDirty();
    GW.gotoPage(at);
    GW.syncDoc();
    GW.bus.emit('page', {});
    GW.toast('已粘贴到第 ' + (at + 1) + ' 页');
    return { ok: true, at };
  }
  GW.pageClip = { KEY: PAGE_CLIP, MAX: PAGE_CLIP_MAX, read: clipRead, copy: clipCopy, paste: clipPaste };

  // ================= 1.7.2（T02）：对象 → 内部页链接 =================
  // data.link 兼容两种形状：字符串 = 外部 URL（1.7.1 T08，GW.objLink 负责，这里只读兼容）；
  // { kind:'page', id:<页 id> } = 内部页链接。**存页 id 不存序号** —— 插页/删页后序号会漂。
  function pageLinkOf(o) {
    const l = o && o.data && o.data.link;
    return l && typeof l === 'object' && l.kind === 'page' && l.id ? l : null;
  }
  function pageLinkJump(link) {
    const idx = GW.doc.pages.findIndex((p) => p.id === link.id);
    if (idx < 0) { GW.toast('目标页已删除', 2600); return false; }
    GW.gotoPage(idx);
    return true;
  }
  GW.linkToPage = function (o) {
    if (!o || o.kind !== 'obj') return null;
    const pages = GW.doc.pages || [];
    const cur = pageLinkOf(o) ? pageLinkOf(o).id : '';
    const rows = pages.map((p, i) => {
      const nm = String(p.name || '').trim();
      const label = '第 ' + (i + 1) + ' 页' + (nm ? ' · ' + nm : '');
      return h('button', {
        class: 'gw-btn' + (p.id === cur ? ' primary' : ''),
        style: { display: 'block', width: '100%', textAlign: 'left', margin: '4px 0' },
        onclick: () => {
          GW.objects.setData(o, { link: { kind: 'page', id: p.id } });
          d.close();
          GW.toast('已链接到「' + label + '」：双击对象即可跳转', 2800);
        },
      }, (p.id === cur ? '✓ ' : '') + label);
    });
    const body = h('div', null,
      h('p', { class: 'muted', style: { margin: '0 0 8px', lineHeight: 1.6 } }, '链接跟着页 id 走：后面插页、删页都不会跳错。双击对象跳转。'),
      h('div', { style: { maxHeight: '50vh', overflow: 'auto' } }, rows),
      cur ? h('button', { class: 'gw-btn danger', style: { marginTop: '8px' }, onclick: () => { GW.objects.setData(o, { link: '' }); d.close(); } }, '取消链接') : null);
    const d = GW.dialog({ title: '链接到页面…', body, noFooter: true, width: 420 });
    return d;
  };
  GW.pageLink = {
    of: pageLinkOf,
    jump: pageLinkJump,
    set(o, id) { const pg = (GW.doc.pages || []).find((p) => p.id === id); if (!pg) return false; GW.objects.setData(o, { link: { kind: 'page', id: pg.id } }); return true; },
    clear(o) { if (!pageLinkOf(o)) return false; GW.objects.setData(o, { link: '' }); return true; },
  };
  // ================= 1.7.2（T09）：异常退出后的恢复提示条 =================
  // 非模态：就在页面顶部挂一条，不挡书写。主进程只告诉我们「上次没正常退出 / 最新副本是哪份 /
  // 距崩溃多少分钟 / 上次打开的文件」，开哪份副本、开原文件都在这里点。
  GW.showSessionBar = function (info) {
    info = info || {};
    const old = document.getElementById('gw-session-bar');
    if (old) old.remove();
    // 恢复副本名本身就说明能力：主进程只有真写过 autosave.gewu 才会把 backup 发过来（网页版走 localStorage 单槽也是同一个字段）
    const hasBak = !!info.backup;
    const minutes = Math.max(0, Math.round(+info.minutes || 0));
    const txt = hasBak
      ? '上次未正常退出，已从恢复副本打开（第 ' + minutes + ' 分钟的版本）'
      : '上次未正常退出（断电 / 被强制关闭 / 崩溃），但没找到可用的恢复副本。';
    const bar = h('div', { id: 'gw-session-bar', class: 'gw-session-bar' },
      h('span', { class: 'gw-sb-txt' }, txt),
      hasBak ? h('button', { class: 'gw-btn primary', onclick: () => { bar.remove(); GW.storage.restoreBackup(info.backup); } }, '打开恢复副本') : null,
      info.last ? h('button', { class: 'gw-btn', onclick: () => { bar.remove(); GW.storage.open(info.last); } }, '打开原文件') : null,
      h('button', { class: 'gw-btn', onclick: () => bar.remove() }, '忽略'));
    document.body.append(bar);
    // 文案说「已从恢复副本打开」就必须真的打开：启动时当前文档还是干净的，直接恢复最新副本。
    if (hasBak) {
      try {
        const pr = GW.storage.restoreBackup(info.backup);
        if (pr && pr.catch) pr.catch(() => {});
      } catch (e) { /* 副本读不到就保持空白文档，提示条还能点「打开原文件」 */ }
    }
    return bar;
  };
  // 双击对象 = 打开内部页链接。只接管 {kind:'page'}，字符串 URL 仍归 GW.objLink（1.7.1 的
  // 「不要用双击打开外链」结论保留）；带按钮/缩放手柄的地方不接管，免得点错。
  document.addEventListener('dblclick', (e) => {
    const t = e.target;
    if (!t || !t.closest || t.closest('.obj-btn, .obj-resize, .obj-grip')) return;
    const el = t.closest('.obj[data-id]');
    if (!el) return;
    const o = ((GW.page() || {}).objs || []).find((x) => x.id === el.getAttribute('data-id'));
    const link = pageLinkOf(o);
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    pageLinkJump(link);
  }, true);
  // 标题栏的链图标仍走 GW.objLink.open —— 包一层，内部页链接别被「只认 http(s)」拒掉。
  (function pageAwareObjLink() {
    const L = GW.objLink;
    if (!L || L.__pageAware) return;
    const orig = L.open;
    L.open = function (o) {
      const link = pageLinkOf(o);
      if (link) return pageLinkJump(link);
      return orig.call(this, o);
    };
    L.__pageAware = true;
  })();

  function pagesDrawer() {
    const list = h('div', { class: 'thumbs' });
    // T03：抽屉顶部的页名过滤框。过滤必须放在 render() 里 —— 这个函数是 innerHTML='' 全量重绘，
    // 把已生成的节点藏起来会在下一次重绘时全部复活。
    const filterIn = h('input', { class: 'gw-in', type: 'text', placeholder: '按页名过滤…（清空显示全部）', style: { width: '100%', marginBottom: '8px' } });
    filterIn.addEventListener('input', () => render());
    // T03：有页名显示页名；没页名显示本页第一条文本 / 公式的前 12 字；再没有才回落到页码。
    // 只读不改 —— 绝不自动给页改名（老师的页名是有意义的，自动填会把空页名占掉）。
    const pageLabel = (p, i) => {
      const nm = String(p.name || '').trim();
      if (nm) return nm;
      for (const o of p.objs || []) {
        const d = (o && o.data) || {};
        let s = '';
        if (o.type === 'text') s = String(d.html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        else if (o.type === 'formula') s = String(d.tex || '').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}$^_]/g, ' ').replace(/\s+/g, ' ').trim();
        if (s) return s.length > 12 ? s.slice(0, 12) + '…' : s;
      }
      return String(i + 1);
    };
    const trashBox = h('div', { class: 'dr-trash' });
    // T04：恢复 = 插回原位置（存的是删之前的序号）；彻底删除才真的从 trash 里移除。
    const restoreTrash = (t) => {
      const pg = t && t.page;
      if (!pg || typeof pg !== 'object') return;
      if (!Array.isArray(GW.doc.trash)) GW.doc.trash = [];
      if (!Array.isArray(pg.ink)) pg.ink = [];
      if (!Array.isArray(pg.objs)) pg.objs = [];
      if (!Array.isArray(pg.geo)) pg.geo = [];
      if (!pg.view || typeof pg.view !== 'object') pg.view = { tx: 0, ty: 0, s: 1 };
      if (!pg.bg || typeof pg.bg !== 'object') pg.bg = Object.assign({}, GW.page().bg);
      // 页 id 是 T02 内部链接的锚点，能保留就保留（只有撞 id 才重发）。
      if (!pg.id || GW.doc.pages.some((x) => x.id === pg.id)) pg.id = GW.uid();
      const at = Math.max(0, Math.min(Number.isInteger(t.index) ? t.index : 0, GW.doc.pages.length));
      GW.doc.pages.splice(at, 0, pg);
      const k = GW.doc.trash.indexOf(t);
      if (k >= 0) GW.doc.trash.splice(k, 1);
      GW.markDirty();
      GW.gotoPage(at);
      GW.syncDoc();
      GW.bus.emit('page', {});
      render();
    };
    const purgeTrash = (t) => {
      const k = Array.isArray(GW.doc.trash) ? GW.doc.trash.indexOf(t) : -1;
      if (k >= 0) GW.doc.trash.splice(k, 1);
      GW.markDirty();
      render();
    };
    const render = () => {
      list.innerHTML = '';
      const q = String(filterIn.value || '').trim().toLowerCase();
      let shown = 0;
      GW.doc.pages.forEach((p, i) => {
        const label = pageLabel(p, i);
        if (q && label.toLowerCase().indexOf(q) < 0) return;
        shown++;
        const url = thumbURL(p, 400, 240);
        // 仍然是 <canvas> 元素（宽度/高度照旧 400×240），只是内容来自缓存：命中就直接贴图，
        // 不命中才真画一次。保留 canvas 是为了不破坏既有探针与 CSS。
        const cv = h('canvas', { width: 400, height: 240 });
        if (url) {
          const img = new Image();
          img.onload = () => { try { cv.getContext('2d').drawImage(img, 0, 0, 400, 240); } catch (e) {} };
          img.src = url;
        }
        const act = (icon, tip, fn) => h('button', { title: tip, html: I(icon), onclick: (e) => { e.stopPropagation(); fn(); render(); } });
        list.append(h('div', { class: 'thumb' + (i === GW.doc.cur ? ' on' : ''), onclick: () => { GW.gotoPage(i); render(); } }, cv, h('span', { class: 'tn' }, label),
          // T01：剪贴板按钮故意放在 .ta 之外 —— probe-pages 断言 .ta 里恰好 3 个按钮。
          h('div', { class: 'ta-x' },
            h('button', { title: '复制到剪贴板', html: I('copy'), onclick: (e) => { e.stopPropagation(); if (clipCopy(i).ok) render(); } })),
          h('div', { class: 'ta' },
            act('chevronL', '上移', () => { if (i > 0) { const a = GW.doc.pages; [a[i - 1], a[i]] = [a[i], a[i - 1]]; if (GW.doc.cur === i) GW.doc.cur--; else if (GW.doc.cur === i - 1) GW.doc.cur++; GW.markDirty(); GW.bus.emit('page', {}); } }),
            act('copy', '复制此页', () => { const c = JSON.parse(JSON.stringify(Object.assign({}, p, { ink: p.ink.map(GW.strip), objs: p.objs.map(GW.strip) }))); c.id = GW.uid(); c.ink.forEach((x) => (x.id = GW.uid())); c.objs.forEach((x) => (x.id = GW.uid())); GW.doc.pages.splice(i + 1, 0, c); GW.markDirty(); GW.bus.emit('page', {}); }),
            act('trash', '删除此页', async () => { if (await GW.confirm('删除第 ' + (i + 1) + ' 页？可在抽屉底部「最近删除」里恢复。')) { GW.deletePage(i); render(); } }))));
      });
      if (q && !shown) list.append(h('div', { style: { padding: '10px 4px', opacity: 0.65 } }, '没有页名匹配「' + filterIn.value.trim() + '」'));
      // T04：最近删除（最多 20 条，超了丢最旧）—— 底部一块，和页面列表一起重绘。
      trashBox.innerHTML = '';
      const tr = Array.isArray(GW.doc.trash) ? GW.doc.trash : [];
      if (tr.length) {
        trashBox.append(h('div', { class: 'dr-group' }, '最近删除（' + tr.length + '）'));
        for (const t of tr) {
          const pg = t && t.page;
          if (!pg) continue;
          const when = t.at ? new Date(t.at) : null;
          const hm = when ? ((when.getMonth() + 1) + '-' + when.getDate() + ' ' + String(when.getHours()).padStart(2, '0') + ':' + String(when.getMinutes()).padStart(2, '0')) : '';
          const idx = Number.isInteger(t.index) ? t.index : 0;
          trashBox.append(h('div', { class: 'trash-row' },
            h('div', { class: 'trash-info' }, h('b', null, '原第 ' + (idx + 1) + ' 页'), h('span', { class: 'muted' }, hm)),
            h('button', { class: 'gw-btn', onclick: (e) => { e.stopPropagation(); restoreTrash(t); } }, '恢复'),
            h('button', { class: 'gw-btn danger', onclick: async (e) => { e.stopPropagation(); if (await GW.confirm('彻底删除「原第 ' + (idx + 1) + ' 页」？删除后不可恢复。', '彻底删除')) purgeTrash(t); } }, '彻底删除')));
        }
      }
    };
    render();
    // 2.0.7：页面级工具收在这一屏（标签 / 旋转 / 模板锁定 / 贴纸库 / 诊断包）——
    // 老师找不到的功能等于没做，所以入口放在最常用的「页面管理」里，而不是藏在设置深处。
    const toolBtn = (label, tip, fn) => h('button', { class: 'gw-btn', style: { marginRight: '6px', marginBottom: '6px' }, title: tip, onclick: fn }, label);
    const tools = h('div', { class: 'dr-group', style: { marginTop: '10px' } }, '页面工具');
    const toolRow = h('div', { style: { display: 'flex', flexWrap: 'wrap' } },
      toolBtn('📌 钉为标签', '保留这一页的视口，最多 3 个标签', () => { GW.tabs && GW.tabs.pin(); GW.toast('已钉住当前页（共 ' + (GW.tabs ? GW.tabs.list().length : 0) + ' 个标签）', 1800); }),
      toolBtn('⟳ 旋转 90°', '整页旋转（0/90/180/270），笔迹与纸框一起转', () => { if (GW.rotatePage) GW.rotatePage(); render(); }),
      toolBtn('🔒 模板锁定', '一键切换本页模板对象的锁定（解锁后可整块拖动）', () => { if (GW.tplLock) GW.tplLock(!GW.tplLocked()); }),
      toolBtn('⭐ 贴纸库', '30 个自绘贴纸：箭头/序号/星标/时钟…', () => {
        if (GW.drawer && GW.stickers) drawer('贴纸库', null, h('div', { class: 'dr-body' }, GW.stickers.panel()), { width: 'min(420px, 92vw)' });
      }),
      toolBtn('🩺 诊断包', '导出 zip：版本 + 日志 + 最近操作（发给客服排查用）', () => {
        if (!GW.diagBundle) return;
        const r = GW.diagBundle();
        GW.toast(r.saved ? '诊断包已导出：' + r.name : '诊断包生成失败，见日志', 2600);
      }));
    const body = h('div', { class: 'dr-body' }, filterIn, list, trashBox, tools, toolRow);
    // T01：粘贴 = 三个位置（当前页之前 / 之后 / 末尾），剪贴板为空时直接提示。
    const openPasteMenu = (el) => {
      if (!clipRead()) { GW.toast('页面剪贴板是空的'); return; }
      const r = el.getBoundingClientRect();
      GW.menuAt(r.left, r.bottom + 4, [
        { label: '粘贴到当前页之前', fn: () => { clipPaste('before'); render(); } },
        { label: '粘贴到当前页之后', fn: () => { clipPaste('after'); render(); } },
        { label: '粘贴到末尾', fn: () => { clipPaste('last'); render(); } },
      ]);
    };
    drawer('页面（' + GW.doc.pages.length + '）', h('div', { style: { marginLeft: '12px', display: 'flex', gap: '6px' } },
      h('button', { class: 'gw-btn primary', onclick: () => { GW.addPage(GW.doc.pages.length - 1); render(); } }, '+ 新页面'),
      h('button', { class: 'gw-btn', title: '从整页模板新建（横线 / 方格 / 坐标纸…）', onclick: () => GW.newPageDialog() }, '套模板…'),
      h('button', { class: 'gw-btn', title: '粘贴页面剪贴板', onclick: (e) => openPasteMenu(e.currentTarget) }, '粘贴页面')),
      body, { width: 'min(380px, 90vw)' });
  }

  // 1.6.7（T09）：整页模板 —— 选一种纸新建页面，或把当前页换成这种纸
  // 2.0.7：面板本体搬到 core/tpl-ui.js（分类/搜索/懒缩略图/纸张参数），这里只负责开抽屉。
  //   tpl-ui.js 在 app.js 之后加载，但本函数只在用户点「套模板…」时才被调用，那时它一定已经就绪。
  GW.newPageDialog = function () {
    if (!GW.tplPanel) { GW.toast('模板面板没有加载（tpl-ui.js 缺失）', 2600); return; }
    drawer('整页模板', null, GW.tplPanel(), { width: 'min(560px, 94vw)' });
  };

  // 物理仿真 · 交互演示目录（全部是 src/simhtml/ 下的独立网页，用「网页」对象插入画布）
  // 分类按高中物理的章节走；13 个内置仿真是 src/simhtml/sims/ 下的独立网页，19 个动画演示在 src/simhtml/。
  const SIM_DEMOS = [
    ['力学与运动', [
      ['simhtml/sims/phy-motion.html', '匀变速直线运动', '初速度 / 加速度 / 时间'],
      ['simhtml/sims/phy-projectile.html', '抛体运动', '初速度 / 角度 / 重力'],
      ['simhtml/sims/phy-collision.html', '碰撞与动量守恒', '质量 / 初速度 / 恢复系数'],
      ['simhtml/sims/phy-orbit.html', '天体运动', '轨道半径 / 速度 / 引力'],
      ['simhtml/incline.html', '斜面滑块', '倾角 / 摩擦 / 质量 / 起始位置'],
      ['simhtml/inclinefly.html', '斜面体 · 上滑飞出', '倾角 / 摩擦 / 初速度 / 起飞后水平减速'],
      ['simhtml/forcecompose.html', '合力与分力', '拖动分力箭头，合力实时变化'],
      ['simhtml/proj.html', '类抛体运动', '初速度 / 方向 / 加速度'],
      ['simhtml/projdecomp.html', '平抛运动分解', '水平匀速 + 竖直自由落体'],
      ['simhtml/cycloid.html', '旋轮线运动', '滚动圆上一点的轨迹'],
      ['simhtml/collision.html', '一维碰撞', '质量 / 初速度 / 恢复系数'],
      ['simhtml/springcart.html', '弹簧连接体', '两车相对质心振动'],
      ['simhtml/bump-demo.html', '两球碰撞 · 形变演示', '弹塑性形变 / 动量 / 能量'],
    ]],

    ['振动与波', [
      ['simhtml/sims/phy-oscillator.html', '简谐运动', '振幅 / 周期 / 相位'],
      ['simhtml/sims/phy-wave.html', '机械波', '波长 / 周期 / 振幅'],
      ['simhtml/pendulum.html', '单摆', '摆长 / 摆角 / 重力加速度'],
      ['simhtml/conical.html', '圆锥摆', '摆长 / 摆角 / 重力加速度'],
      ['simhtml/springv.html', '竖直弹簧振子', '周期 / 振幅 / 圈数'],
      ['simhtml/springh.html', '水平弹簧振子', '周期 / 振幅 / 圈数'],
      ['simhtml/slopespring.html', '斜面弹簧振子', '倾角 / 周期 / 振幅'],
    ]],

    ['光学', [
      ['simhtml/sims/phy-optics.html', '透镜成像', '焦距 / 物距 / 物高'],
      ['simhtml/sims/phy-refraction.html', '光的折射与全反射', '两种介质 / 入射角 / 色散'],
      ['simhtml/sims/phy-interference.html', '光的干涉与衍射', '双缝 / 单缝 / 波长 / 白光'],
    ]],

    ['电磁学', [
      ['simhtml/sims/phy-efield.html', '电场线与等势面', '电荷量 / 位置 / 试探电荷'],
      ['simhtml/sims/phy-capacitor.html', '平行板电容器', '与电源相连 / 充电后断开 / 动态分析'],
      ['simhtml/sims/phy-circuit.html', '闭合电路', '电动势 / 内阻 / 滑动变阻器'],
      ['simhtml/sims/phy-resbox.html', '电阻箱读数', '四个旋钮 / 倍率 / 读数练习'],
      ['simhtml/sims/phy-induction.html', '电磁感应', '磁感应强度 / 导轨 / 拉力'],
      ['simhtml/sims/phy-flux.html', '磁通量（立体）', '线框倾角 / 磁感应强度 / 线框面积'],
      ['simhtml/sims/phy-acgen.html', '交变电流与变压器', '中性面 / 峰值有效值 / 匝数比'],
      ['simhtml/sims/phy-particle.html', '带电粒子在场中的运动', '磁场 / 电场 / 初速度'],
      ['simhtml/efield.html', '加速与偏转 · 荧光屏', '加速电压 / 偏转电压 / 极板尺寸'],
      ['simhtml/acfield.html', '交变电场中的运动', '电压幅值 / 频率 / 入射速度'],
      // 按作者要求：测Rx 的「电流表外接/内接」两件网页撤掉，改回图形面板里的静态局部电路图
      //（对应 src/core/phys-em.js 的 em_ammeter_in / em_ammeter_out）；万用表进了图形与仿真两边。
      ['simhtml/multimeter.html', '万用表表盘 · 可调参', '指针位置 / 张角 / 刻度字号 / 线宽'],
      ['simhtml/circuit-simplify.html', '电路化简', '可拖拽的动态电路图'],
    ]],

    ['圆周与天体', [
      ['simhtml/ringball.html', '光滑圆环 · 小球', '初始摆角 / 质量比 / 绳长比'],
      ['simhtml/slotball.html', '半圆槽 · 小球', '初始角度 / 槽深 / 球半径'],
      ['simhtml/trackball.html', '圆弧轨道 · 特殊速度', '半径 / 初速度 / 临界速度'],
      ['simhtml/kepler.html', '开普勒第二定律', '偏心率 / 分段数 / 周期'],
      ['simhtml/satellites.html', '四类卫星', '高度 / 速度 / 轨道对比'],
    ]],

    ['热学', [
      ['simhtml/sims/phy-gas.html', '理想气体状态方程', '等温 / 等压 / 等容 · p–V p–T V–T'],
    ]],

    ['原子与量子', [
      ['simhtml/sims/phy-photoelectric.html', '光电效应', '频率 / 光强 / 遏止电压 / 逸出功'],
      ['simhtml/sims/phy-atom.html', '氢原子能级跃迁', '玻尔能级 / 谱线系 / 一群原子'],
      ['simhtml/sims/phy-decay.html', '放射性衰变与半衰期', '统计规律 / N–t 曲线'],
    ]],
  ];
  GW.simDemos = SIM_DEMOS;
  // 2.0：物理仿真卡片用仿真自己的图标（原来 44 张卡全是同一个地球图标，一眼分不出谁是谁）
  function demoIcon(url) {
    const id = (/sims\/([\w-]+)\.html$/.exec(url) || [])[1];
    const d = id && GW.sims && GW.sims[id];
    return d && d.icon ? d.icon : I('globe');
  }   // 2.0：给万能插入（core/palette.js）共用同一份目录
  // =============== 仿真库 ===============
  function simDrawer(cat) {
    const search = h('input', { placeholder: '搜索：函数、抛体、透镜、电场…' });
    const body = h('div', { class: 'dr-body' });
    // R9：物理抽屉还要能一并搜到老师本机的学科库课件。listLibrary 是 IPC，只在打开抽屉时取一次，
    // 绝不每次按键都问一遍主进程；取回来时如果老师已经在搜了，就重画一次把结果补上。
    let libCache = null;
    const tabs = GW.ui.segmented({ options: [{ value: 'math', label: '数学' }, { value: 'physics', label: '物理' }], value: cat, onChange: (v) => { cat = v; render(); } });
    const render = () => {
      body.innerHTML = '';
      const q = search.value.trim();
      // keywords 是给搜索用的隐藏字段（卡片上不显示）：初中那些说法（一次函数、二次函数、
      // 反比例函数、概率初步…）在 name/desc/group 里一个都没有，只靠它们搜必然搜不到。
      const sims = cat === 'math' ? Object.values(GW.sims).filter((s) => s.category === cat && tcOn('sims', s.id) && (!q || (s.name + s.desc + s.group + (s.keywords || '')).includes(q))) : [];
      const groups = {};
      sims.forEach((s) => (groups[s.group || '其他'] = groups[s.group || '其他'] || []).push(s));
      for (const g in groups) {
        body.append(h('div', { class: 'dr-group' }, g));
        body.append(h('div', { class: 'cards' }, groups[g].map((s) => h('button', { class: 'card ' + (cat === 'physics' ? 'phy' : ''), onclick: () => { closeDrawer(); GW.tool.set('hand'); GW.importer.insertSim(s.id); } },
          h('div', { class: 'ci', html: s.icon || I(cat === 'math' ? 'math' : 'physics') }), h('b', null, s.name), h('span', null, s.desc || '')))));
      }
      // 物理仿真：13 个内置仿真 + 19 个动画演示，全部是 src/simhtml/ 下的独立网页，
      // 用「网页」对象（iframe）插进画布 —— 拖动标题栏移动、右下角缩放，页内控件与独立打开时一样。
      // 物理与绘制直接复用 core/physshapes.js 与 sims/phy-*.js（一行没重写），页面只补主题、字体、滑块与播放控制。
      if (cat === 'physics') {
        const hit = (t) => !q || (t[1] + ' ' + t[2]).includes(q);
        const groups = SIM_DEMOS.map(([g, arr]) => [g, arr.filter((t) => tcOn('sims', t[0])).filter(hit)]).filter(([, arr]) => arr.length);
        if (groups.length) {
          body.append(h('div', { class: 'dr-group' }, '物理仿真（交互演示 · 点一下插进画布）'));
          for (const [g, arr] of groups) {
            body.append(h('div', { class: 'dr-sub' }, g));
            body.append(h('div', { class: 'cards' }, arr.map((t) => h('button', {
              class: 'card web', 'data-simhtml': t[0], title: t[1] + '：' + t[2],
              onclick: () => { closeDrawer(); GW.tool.set('hand'); GW.importer.insertWeb(t[0], t[1]); },
            }, h('div', { class: 'ci', html: demoIcon(t[0]) }), h('b', null, t[1]), h('span', null, t[2])))));
          }
        }
      }
      // 外部资源快捷入口
      const ext = cat === 'math'
        ? [['GeoGebra 图形计算器', '函数、方程、导数', () => GW.importer.insertGgb('graphing')], ['GeoGebra 几何', '尺规作图、动点', () => GW.importer.insertGgb('geometry')], ['GeoGebra 3D', '空间几何体、曲面', () => GW.importer.insertGgb('3d')], ['GeoGebra 概率', '分布与统计', () => GW.importer.insertGgb('probability')], ['Desmos 图形计算器', '在线函数作图', () => GW.importer.insertWeb('https://www.desmos.com/calculator?lang=zh-CN', 'Desmos')], ['Desmos 3D', '三维作图', () => GW.importer.insertWeb('https://www.desmos.com/3d?lang=zh-CN', 'Desmos 3D')]]
          // 初中内容的另一半在 PhET 里（二次函数图像 / 直线的图像 / 斜截式 / 数轴：整数 / 面积模型代数…）。
          // 这些条目本来就存在，只是从来没进过数学抽屉 —— 复用 resources.js 的目录，不新增条目。
          .concat(GW.resources.PHET.filter((p) => p[2] === '数学').map(([id, n, g, zh]) => ['PhET · ' + n, g, () => GW.resources.openPhet(id, zh)]))
        // 物理：没搜索词时只摆前 12 条（抽屉默认别太长），一旦开始搜就放全部 ——
        // 否则搜「法拉第」会被 slice 截掉，老师的观感就是「搜不到」。
        : GW.resources.PHET.filter((p) => ['数学', '化学', '生物', '地球与空间'].indexOf(p[2]) < 0).filter((p, i) => q || i < 12).map(([id, n, g, zh]) => ['PhET · ' + n, g, () => GW.resources.openPhet(id, zh)]);
      const extF = ext.filter(([n, d]) => !q || (n + d).includes(q));
      if (extF.length) {
        body.append(h('div', { class: 'dr-group' }, cat === 'math' ? 'GeoGebra / Desmos / PhET（需联网或离线包）' : 'PhET 精选（更多见「资源库」）', h('button', { class: 'gw-btn', onclick: () => resDrawer(cat === 'math' ? 'web' : 'phet') }, '查看全部')));
        body.append(h('div', { class: 'cards' }, extF.map(([n, d, fn]) => h('button', { class: 'card web', onclick: () => { closeDrawer(); GW.tool.set('hand'); fn(); } }, h('div', { class: 'ci', html: I(n.startsWith('PhET') ? 'physics' : n.startsWith('Geo') ? 'ggb' : 'math') }), h('b', null, n), h('span', null, d)))));
      }
      // R9：搜物理时把「在线工具」和「学科库」也一起搜出来，并按来源分开放。
      // 分开列是为了让老师一眼看出哪几张卡需要联网（在线工具）、哪几张是自己机器上的文件。
      if (cat === 'physics' && q) {
        const webF = GW.resources.WEB_TOOLS.filter((t) => t.group === '物理' && (t.name + t.desc).includes(q));
        if (webF.length) {
          body.append(h('div', { class: 'dr-group' }, '在线工具（需联网）'));
          body.append(h('div', { class: 'cards' }, webF.map((t) => h('button', { class: 'card web', onclick: () => { closeDrawer(); GW.tool.set('hand'); GW.importer.insertWeb(t.url, t.name); } }, h('div', { class: 'ci', html: I('globe') }), h('b', null, t.name), h('span', null, t.desc)))));
        }
        const libF = (libCache || []).filter((f) => f.name.includes(q));
        if (libF.length) {
          body.append(h('div', { class: 'dr-group' }, '学科库（本机）'));
          body.append(h('div', { class: 'cards' }, libF.map((f) => h('button', { class: 'card web', onclick: () => { closeDrawer(); GW.tool.set('hand'); GW.importer.importOne(f.path); } }, h('div', { class: 'ci', html: I(f.ext === 'ggb' ? 'ggb' : 'globe') }), h('b', null, f.name), h('span', null, f.group || '未分组')))));
        }
      }
      if (!body.children.length) body.append(h('p', { class: 'muted' }, '没有找到匹配的工具'));
    };
    search.addEventListener('input', render);
    const el = drawer(cat === 'math' ? '数学工具' : '物理仿真', tabs.el, h('div', { style: { display: 'contents' } }, h('div', { class: 'dr-search' }, h('span', { html: I('search') }), search), body));
    tabs.el.addEventListener('click', () => { el.querySelector('h3').textContent = cat === 'math' ? '数学工具' : '物理仿真'; });
    render();
    // R9：打开抽屉时预取一次学科库（走 IPC，只有桌面版有）。取回来时若老师已经在搜，重画一次补上结果。
    // 能力探测而不是 GW.isElectron：只要桥上有 listLibrary 就试一次（探测阶段两者都置真，行为不变）；
    // 只调一次 —— probe-sim-search 断言学科库 IPC 次数只能是 1。
    const wLib = gwBridge();
    if (wLib && typeof wLib.listLibrary === 'function') wLib.listLibrary('物理').then((f) => { libCache = Array.isArray(f) ? f : []; if (search.value.trim()) render(); }).catch(() => { libCache = []; });
    setTimeout(() => search.focus({ preventScroll: true }), 50);
  }

  // =============== 资源库 ===============
  function resDrawer(tab = 'phet') {
    const R = GW.resources;
    const body = h('div', { class: 'dr-body' });
    const search = h('input', { placeholder: '搜索资源' });
    // 学科库是磁盘目录，只在打开抽屉和点「刷新」时读一次 —— 否则每敲一个字都要走一次 IPC
    let libCache = null;
    let libMeta = {};          // R6：path → { chapter, tags, title }，与列表分开要，不动扫描器
    let libChapter = '';       // 按章筛选的当前值（'' = 全部）
    let mineClass = '';        // 1.7.1（T10）：资源库「我的资源」的按班级筛选（'' = 全部）
    // 1.1.17：「作者作品」排在最前 —— 作者固化的成品合集，与后四个分页并列
    // 1.7.2（T05）：「★ 收藏」放第一页 —— 本机学科库的相对路径数组，失效路径静默跳过。
    const resOpts = [{ value: 'fav', label: '★ 收藏' }, { value: 'author', label: '作者作品' }, { value: 'phet', label: 'PhET 仿真' }, { value: 'web', label: '在线工具' }, { value: 'lib', label: '学科库' }, { value: 'mine', label: '我的资源' }].filter((o) => tcOn('resTabs', o.value));
    if (!resOpts.some((o) => o.value === tab)) tab = resOpts.length ? resOpts[0].value : 'phet';
    const tabs = GW.ui.segmented({ options: resOpts, value: tab, onChange: (v) => { tab = v; render(); } });
    const open = (fn) => { closeDrawer(); GW.tool.set('hand'); fn(); };
    // ---------- 1.7.2（T05）：收藏 ----------
    // localStorage['gewu.favorites'] = 相对「物理」库根的路径数组（如「力学/圆周运动.html」），
    // 最新收藏在最前。只记本机、不写磁盘 —— 换机后路径失效的条目静默跳过，不渲染空卡片。
    const FAV_KEY = 'gewu.favorites';
    const readFav = () => {
      try {
        const a = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
        return Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x) : [];
      } catch (e) { return []; }
    };
    const writeFav = (a) => {
      try { localStorage.setItem(FAV_KEY, JSON.stringify(a)); return true; }
      catch (e) { GW.toast('收藏保存失败：' + e.message, 3000); return false; }
    };
    const favRel = (f) => {
      const g = String(f.group || '').replace(/\\/g, '/').replace(/\/+$/, '');
      return g ? g + '/' + f.name : f.name;
    };
    const isFav = (f) => readFav().indexOf(favRel(f)) >= 0;
    const toggleFav = (f) => {
      const a = readFav();
      const i = a.indexOf(favRel(f));
      if (i >= 0) a.splice(i, 1); else a.unshift(favRel(f));
      writeFav(a);
    };
    const chOfLib = (f) => (libMeta[f.path] && libMeta[f.path].chapter) || '';
    const starOf = (f) => h('span', {
      class: 'card-star' + (isFav(f) ? ' on' : ''),
      title: isFav(f) ? '取消收藏' : '收藏到「★ 收藏」',
      html: I('star'),
      onclick: (e) => { e.stopPropagation(); toggleFav(f); render(); },
    });
    const libCardOf = (f) => h('button', { class: 'card web', onclick: () => open(() => GW.importer.importOne(f.path)) },
      h('div', { class: 'ci', html: I(f.ext === 'ggb' ? 'ggb' : 'globe') }), h('b', null, f.name),
      chOfLib(f) ? h('i', { class: 'lib-ch', title: chOfLib(f) }, chOfLib(f).replace(/^.+?\//, '')) : null,
      h('span', null, f.ext.toUpperCase()),
      h('span', { class: 'badge off' }, f.ext === 'ggb' ? (GW.settings.ggbPath ? '自定义离线包' : '内置离线包') : '本机'),
      starOf(f));
    const ensureLib = async () => {
      if (libCache !== null) return;
      libCache = await window.gewu.listLibrary('物理');
      libMeta = {};
      if (window.gewu.libraryMeta && libCache.length) {
        try { libMeta = (await window.gewu.libraryMeta(libCache.map((f) => f.path))) || {}; } catch (_) { libMeta = {}; }
      }
    };
    // ---------- 1.7.2（T03）：文件夹配色 / 图标 ----------
    // localStorage['gewu.folders'] = {"<相对路径>": {color, icon}}。**不动磁盘结构、不改主进程**；
    // 只影响本机显示。8 个预设色 + 6 个内置图标，没有取色器；删掉这个 key 就回落默认。
    const FOLDER_KEY = 'gewu.folders';
    const FOLDER_COLORS = [
      ['青绿', '#0f9d8a'], ['蓝', '#3366ff'], ['橙红', '#e4572e'], ['琥珀', '#f2a541'],
      ['紫', '#7a5af8'], ['品红', '#d63384'], ['绿', '#2f9e44'], ['灰蓝', '#6b7a90'],
    ];
    const FOLDER_ICONS = ['folder', 'resources', 'shelf', 'note', 'physics', 'math'];
    const folderAll = () => {
      try {
        const o = JSON.parse(localStorage.getItem(FOLDER_KEY) || '{}');
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
      } catch (e) { return {}; }
    };
    const folderPref = (name) => {
      const v = folderAll()[name];
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    };
    const folderSet = (name, patch) => {
      const all = folderAll();
      const cur = folderPref(name);
      const next = Object.assign({}, cur, patch);
      if (!next.color && !next.icon) delete all[name]; else all[name] = next;
      try { localStorage.setItem(FOLDER_KEY, JSON.stringify(all)); return true; }
      catch (e) { GW.toast('文件夹配色保存失败：' + e.message, 3000); return false; }
    };
    const folderDialog = (name) => {
      const pref = folderPref(name);
      const cols = h('div', { class: 'fg-row' }, FOLDER_COLORS.map(([label, hex]) =>
        h('button', { class: 'fg-swatch' + (pref.color === hex ? ' on' : ''), title: label, 'data-color': hex, style: { background: hex }, onclick: () => { folderSet(name, { color: hex }); d.close(); render(); } })));
      const icons = h('div', { class: 'fg-row' }, FOLDER_ICONS.map((ic) =>
        h('button', { class: 'fg-ic' + (pref.icon === ic ? ' on' : ''), title: ic, 'data-icon': ic, html: I(ic), onclick: () => { folderSet(name, { icon: ic }); d.close(); render(); } })));
      const body = h('div', null,
        h('p', { class: 'muted', style: { margin: '0 0 6px' } }, '文件夹：' + name + '（只影响本机显示，不动磁盘上的文件夹名）'),
        h('div', { class: 'dr-group' }, '颜色'), cols,
        h('div', { class: 'dr-group' }, '图标'), icons,
        h('button', { class: 'gw-btn', style: { marginTop: '10px' }, onclick: () => { const all = folderAll(); delete all[name]; try { localStorage.setItem(FOLDER_KEY, JSON.stringify(all)); } catch (e) {} d.close(); render(); } }, '恢复默认'));
      const d = GW.dialog({ title: '文件夹配色与图标', body, noFooter: true, width: 440 });
    };
    // 组头里只放 SVG 与空按钮 —— probe-library 断言 .dr-group 的 textContent 就是组名。
    const folderHead = (name) => {
      const pref = folderPref(name);
      const ic = FOLDER_ICONS.indexOf(pref.icon) >= 0 ? pref.icon : 'folder';
      const color = typeof pref.color === 'string' && /^#[0-9a-f]{6}$/i.test(pref.color) ? pref.color : '';
      const badge = h('span', { class: 'dr-gicon', html: I(ic) });
      if (color) badge.style.color = color;
      return h('div', { class: 'dr-group' }, badge, name,
        h('button', { class: 'dr-gpal', title: '文件夹配色', html: I('palette'), onclick: (e) => { e.stopPropagation(); folderDialog(name); } }));
    };
    async function render() {
      body.innerHTML = '';
      const q = search.value.trim();
      if (tab === 'fav') {
        // R8：原来一刀切 GW.isElectron —— 手机 / 网页上整页只剩一句「仅在桌面版中可用」，
        // 既没有解释为什么，也没告诉老师下一步能做什么。收藏本来就是「学科库课件的书签」，
        // 所以判据是「库是不是空的」：库为空且不是桌面，才给引导；否则照常渲染。
        await ensureLib();
        const map = new Map((libCache || []).map((f) => [favRel(f), f]));
        const pick = readFav().map((rel) => map.get(rel)).filter(Boolean);   // 失效路径静默跳过
        if (!pick.length && !GW.isElectron && !(libCache || []).length) {
          body.append(h('p', { class: 'muted' }, '这台设备没有本机学科库，所以收藏夹是空的。要继续改上次的板书：主菜单 →「最近打开」；想把课件带走：打开后「保存」，文件在系统的「下载」里。'));
        } else {
          body.append(h('div', { class: 'dr-group' }, '★ 收藏 · 共 ' + pick.length + ' 个（只在本机，换机后失效的路径自动跳过）'));
          if (!pick.length) body.append(h('p', { class: 'muted' }, '还没有收藏。在「学科库」里点卡片右上角的星星就能收藏到这里。'));
          else body.append(h('div', { class: 'cards' }, pick.map((f) => libCardOf(f))));
        }
      } else if (tab === 'phet') {
        const head = h('div', { class: 'dr-group' }, '来自科罗拉多大学 PhET 互动仿真（免费开源，大多有中文版）');
        // 跨端：桌面走主进程缓存目录，网页/手机走 Cache API（没有 Cache API 时 resources.cacheAll 自己 toast 说明原因）
        head.append(h('button', { class: 'gw-btn', onclick: () => R.cacheAll().then(render) }, '⇩ 全部离线缓存'));
        body.append(head);
        const groups = {};
        R.PHET.filter((p) => !q || (p[0] + p[1] + p[2]).includes(q)).forEach((p) => (groups[p[2]] = groups[p[2]] || []).push(p));
        for (const g in groups) {
          body.append(h('div', { class: 'dr-group' }, g));
          const cards = h('div', { class: 'cards' });
          body.append(cards);
          for (const [id, name, , zh] of groups[g]) {
            const img = h('img', { src: R.phetThumb(id), loading: 'lazy', onerror: (e) => { e.target.replaceWith(h('span', { html: I('physics') })); } });
            const badge = h('span', { class: 'badge off' }, zh ? '中文' : 'English');
            const dl = h('button', { class: 'dl', title: '离线缓存', html: I('download'), onclick: async (e) => { e.stopPropagation(); if (await R.cachePhet(id, zh)) { badge.textContent = '已离线'; badge.classList.remove('off'); } } });
            cards.append(h('button', { class: 'card web', onclick: () => open(() => R.openPhet(id, zh)) }, h('div', { class: 'ci' }, img), h('b', null, name), h('span', null, id), badge, dl));
            R.isCached(id, zh).then((c) => { if (c) { badge.textContent = '已离线'; badge.classList.remove('off'); if (dl) dl.remove(); } });
          }
        }
      } else if (tab === 'web') {
        const groups = {};
        R.WEB_TOOLS.filter((t) => !q || (t.name + t.desc).includes(q)).forEach((t) => (groups[t.group] = groups[t.group] || []).push(t));
        body.append(h('div', { class: 'dr-group' }, 'GeoGebra'));
        body.append(h('div', { class: 'cards' }, Object.entries(GW.GGB_APPS).map(([k, v]) => h('button', { class: 'card', onclick: () => open(() => GW.importer.insertGgb(k)) }, h('div', { class: 'ci', html: I('ggb') }), h('b', null, 'GeoGebra ' + v), h('span', null, GW.settings.ggbPath ? '自定义离线包' : '内置离线包'))), ));
        for (const g in groups) {
          body.append(h('div', { class: 'dr-group' }, g));
          body.append(h('div', { class: 'cards' }, groups[g].map((t) => h('button', { class: 'card web', onclick: () => open(() => GW.importer.insertWeb(t.url, t.name)) }, h('div', { class: 'ci', html: I('globe') }), h('b', null, t.name), h('span', null, t.desc)))));
        }
      } else if (tab === 'author') {
        // 1.1.17：作者个人作品合集 —— 正文全部固化在 core/works-data.js 里，磁盘上没有可复制的课件文件。
        // 这里只给卡片和「打开」：既没有「打开文件夹」，也没有任何导出入口，这就是「不能直接导出」的实现。
        const all = GW.authorWorks ? GW.authorWorks.list() : [];
        const works = all.filter((w) => !q || (w.title + w.group + (w.desc || '')).includes(q));
        body.append(h('div', { class: 'dr-group' }, '作者个人作品合集 · 共 ' + all.length + ' 件（内置在程序代码里，不以文件形式落地）'));
        if (!works.length) {
          body.append(h('p', { class: 'muted' }, q ? '没有找到匹配的作品' : '合集还是空的。'));
        } else {
          const wgroups = {};
          works.forEach((w) => { const g = w.group || '作品'; (wgroups[g] = wgroups[g] || []).push(w); });
          for (const g in wgroups) {
            body.append(h('div', { class: 'dr-group' }, g));
            body.append(h('div', { class: 'cards' }, wgroups[g].map((w) => h('button', { class: 'card web work', title: '近全屏打开（浮层）', onclick: () => open(() => GW.authorWorks.open(w.id)) },
              h('div', { class: 'ci', html: I('globe') }), h('b', null, w.title),
              w.desc ? h('i', { class: 'lib-ch', title: w.desc }, w.desc) : null,
              // 卡片角落的作者个人水印（1.1.17 加大；作品正文一律原样，不做任何改动）
              h('i', { class: 'work-wm' }, '物理唐波'),
              h('span', { class: 'badge' }, '内置')))));
          }
        }
      } else if (tab === 'lib') {
        // 学科库 = 本机文件夹里的课件，要桌面版的用户目录；不收网址，和「我的资源」「在线工具」互不重叠。
        // 网页 / 手机没有用户目录，但分页仍然保留，只给一行说明（整页消失才是这次的缺口）。
        const wlib = gwBridge();
        const canLib = canDesk() && !!(wlib && typeof wlib.listLibrary === 'function');
        if (!canLib) {
          body.append(h('p', { class: 'muted' }, '学科库读取本机文件夹，需要桌面版（网页版 / 手机版没有用户目录）。'));
        } else {
          // 1.1.17：学科库只作为老师自己资源的整合空间 —— 作者的作品已迁进「作者作品」分页，
          // 这里不再对任何分组做整页浮层特判，一律按普通本机课件插成网页卡片。
          if (libCache === null) await ensureLib();
          const chOf = (f) => (libMeta[f.path] && libMeta[f.path].chapter) || '';
          const tagsOf = (f) => ((libMeta[f.path] && libMeta[f.path].tags) || []).join(' ');
          const hay = (f) => f.name + ' ' + chOf(f) + ' ' + tagsOf(f);   // 搜索也认章节与标签
          const files = libCache.filter((f) => (!q || hay(f).includes(q)) && (!libChapter || chOf(f) === libChapter));
          // 章节筛选项：只列真实出现过的章；排序按教材顺序（必修二 在 必修三 之前、第6章 在 第11章 之前），
          // 不是按字符串 —— 「必修三」的码位比「必修二」小，直接 sort() 会把第三册排到第二册前面。
          const VOL = { 一: 1, 二: 2, 三: 3, 四: 4 };
          const chRank = (c) => {
            const vol = VOL[(/必修([一二三四])/.exec(c) || [])[1]] || 99;
            const chap = +((/第(\d+)章/.exec(c) || [])[1] || 999);
            const last = c.split('/').pop() || '';
            const sec = +((/^(\d+(?:\.\d+)?)/.exec(last) || [])[1] || 0);
            return [vol, chap, sec];
          };
          const chapters = Array.from(new Set(libCache.map(chOf).filter(Boolean))).sort((a, b) => {
            const ka = chRank(a), kb = chRank(b);
            return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || a.localeCompare(b);
          });
          const sel = h('select', { class: 'lib-sel', title: '按章筛选' },
            h('option', { value: '' }, '全部章节'),
            chapters.map((c) => h('option', { value: c, selected: c === libChapter }, c.replace(/^.+?\//, ''))));
          sel.addEventListener('change', () => { libChapter = sel.value; render(); });
          const bar = h('div', { class: 'dr-group' }, '学科库（物理）' + (libCache.length ? ' · 共 ' + libCache.length + ' 个' : '') +
            (chapters.length ? ' · ' + chapters.length + ' 章' : ''),
            sel,
            h('button', { class: 'gw-btn', title: '导入 .gwanim 单文件动画', onclick: async () => { const p = await GW.gwanimImport(); if (p) { libCache = null; libMeta = {}; render(); } } }, '导入 .gwanim'),
            // L2：老师在群里收到的「动画 HTML」先过一遍沙箱预览，合格才入库；不合格也能当网页贴到画布上
            h('button', {
              class: 'gw-btn',
              title: '导入单文件动画 HTML（先在沙箱里预览，再决定插入画布或一键入库）',
              onclick: () => GW.animPick({ onDone: () => { libCache = null; libMeta = {}; render(); } }),
            }, '导入动画 HTML'),
            h('button', { class: 'gw-btn', onclick: () => window.gewu.openLibraryDir('物理') }, '打开文件夹'),
            h('button', { class: 'gw-btn', onclick: () => { libCache = null; libMeta = {}; libChapter = ''; render(); } }, '刷新'));
          body.append(bar);
          if (!files.length) {
            body.append(h('p', { class: 'muted' }, q || libChapter ? '没有找到匹配的工具' + (libChapter ? '（当前只看「' + libChapter + '」这一章，换「全部章节」试试）' : '')
              : '把 .html / .ggb 课件放进这个文件夹（可以建「力学」「力学\\圆周运动」这样最多两级的文件夹分组），然后点「刷新」。'));
          } else {
            const groups = {};
            files.forEach((f) => { const g = f.group || '未分组'; (groups[g] = groups[g] || []).push(f); });
            for (const g in groups) {
              body.append(folderHead(g));
              body.append(h('div', { class: 'cards' }, groups[g].map(libCardOf)));
            }
          }
        }
      } else {
        const mine = GW.settings.customRes || [];
        // 1.7.1（T10）：课程 / 班级分组。**不改库结构**：班只是「板书 → 班级串」的一个索引
        // （GW.boardClasses，存在设置里），这里只多一个下拉与一个当前板书的班级输入。
        const classes = GW.boardClasses ? GW.boardClasses.list() : [];
        const clsSel = h('select', { class: 'lib-sel', title: '按班级筛选' },
          h('option', { value: '' }, '全部班级'),
          classes.map((c) => h('option', { value: c, selected: c === mineClass }, c)));
        clsSel.addEventListener('change', () => { mineClass = clsSel.value; render(); });
        const clsInp = h('input', { placeholder: '如 高一(1)班，多个班用逗号隔开', value: String((GW.doc && GW.doc.class) || ''), style: { minWidth: '190px' } });
        const clsBtn = h('button', { class: 'gw-btn' }, '设为当前板书的班级');
        clsBtn.addEventListener('click', () => {
          GW.doc.class = clsInp.value.trim();
          if (GW.boardClasses) GW.boardClasses.set(GW.doc.path, GW.doc.class);
          if (GW.markDirty) GW.markDirty();
          GW.toast(GW.doc.class ? '当前板书已归到：' + GW.doc.class : '已清空当前板书的班级', 2600);
          render();
        });
        body.append(h('div', { class: 'dr-group' }, '班级：把这份板书归到一个班（可写多个班，逗号隔开）。班级存在 .gewu 里，不动资源库的文件夹结构', clsInp, clsBtn, clsSel));
        // 只列「当前板书目录」里索引到的板书 —— 不扫描磁盘、不改 library-list 契约。
        const boards = (GW.boardClasses ? GW.boardClasses.entries() : [])
          .filter((b) => !mineClass || (b.tokens || []).indexOf(mineClass) >= 0);   // class 为空 ⇒ 不进任何班级筛选
        if (boards.length) {
          body.append(h('div', { class: 'dr-group' }, '按班级查看板书（当前目录）' + (mineClass ? ' · ' + mineClass : '') + ' · 共 ' + boards.length + ' 份'));
          body.append(h('div', { class: 'cards' }, boards.map((b) => h('button', { class: 'card web', title: b.path, onclick: () => open(() => GW.storage.open(b.path)) },
            h('div', { class: 'ci', html: I('pages') }), h('b', null, b.name), h('span', null, b.cls || '未分班')))));
        } else if (mineClass) {
          body.append(h('p', { class: 'muted' }, '这个班里还没有板书（板书要保存成本机文件后才会进这个列表）。'));
        }
        body.append(h('div', { class: 'dr-group' }, '常用的网址、本机课件、程序都可以收藏在这里，一键插入',
          h('button', { class: 'gw-btn', onclick: async () => { const u = await GW.prompt('收藏网址', 'https://'); if (!u || u === 'https://') return; const n = await GW.prompt('名称', u.replace(/^https?:\/\//, '').split('/')[0]); mine.push({ name: n || u, url: /^\w+:/.test(u) ? u : 'https://' + u }); GW.settings.customRes = mine; GW.saveSettings(); render(); } }, '+ 网址'),
          // 跨端：桌面用本机路径对话框；网页 / 手机回落到 <input type="file">，用 blob URL 当 path（只在本次会话有效）
          h('button', { class: 'gw-btn', onclick: async () => {
            const g1 = gwBridge();
            if (canDesk() && g1 && typeof g1.openFiles === 'function') {
              const ps = (await g1.openFiles({ title: '选择课件或程序' })) || [];
              ps.forEach((p) => mine.push({ name: p.split(/[\\/]/).pop(), path: p }));
            } else {
              const fs = await pickLocalFiles();
              fs.forEach((f) => {
                const u = URL.createObjectURL(f);
                RES_FILES.set(u, f);
                mine.push({ name: f.name, path: u, temp: true });
              });
            }
            GW.settings.customRes = mine; GW.saveSettings(); render();
          } }, '+ 本机文件')));
        if (!mine.length) body.append(h('p', { class: 'muted' }, '还没有收藏。'));
        body.append(h('div', { class: 'cards' }, mine.filter((m) => !q || m.name.includes(q)).map((m, i) => h('button', { class: 'card web', onclick: () => open(() => {
            // 网页 / 手机加进来的本机文件只有 File 对象，Blob URL 在刷新后就失效了 —— 明说，别静默失败
            const f = RES_FILES.get(m.path);
            if (f) return GW.importer.importOne(f);
            if (/^blob:/.test(String(m.path || ''))) { GW.toast('这份本机文件只在本次打开期间有效，请重新点「+ 本机文件」添加', 3800); return; }
            return m.path ? GW.importer.importOne(m.path) : GW.importer.insertWeb(m.url, m.name);
          }) },
          h('div', { class: 'ci', html: I(m.path ? 'folder' : 'link') }), h('b', null, m.name), h('span', null, m.temp ? '本机文件（本次有效）' : (m.path || m.url)),
          h('button', { class: 'dl', title: '移除', html: I('trash'), onclick: (e) => { e.stopPropagation(); mine.splice(i, 1); GW.saveSettings(); render(); } })))));
      }
      // 搜索没结果时给一个清除入口（各分页自己的空态文案保留，这里只补按钮）
      if (q && !body.querySelector('.card, .gb')) body.append(h('button', { class: 'gw-btn dr-clear', onclick: () => { search.value = ''; render(); } }, '清除搜索'));
    }
    search.addEventListener('input', render);
    drawer('资源库', tabs.el, h('div', { style: { display: 'contents' } }, h('div', { class: 'dr-search' }, h('span', { html: I('search') }), search), body));
    render();
  }

  // =============== 选区控件 ===============
  // WP5：选区上下文的单一数据源。单选 / 多选 / 混合类型一律从这里取 items，不再各写一套。
  const selectedItems = () => GW.selection.items || [];
  const isMulti = () => selectedItems().length > 1;

  /* PURE-BEGIN selBarVisibility */
  // 选区工具条所有按钮的唯一显隐决策（纯函数：只吃数据快照，不碰 DOM / GW，可被 vm 单独提取实跑）。
  // sel = { items, pvIts, pageTraces, singleParam, singleAnim, pivotOn }
  function selBarVisibility(sel) {
    const items = sel.items || [];
    const n = items.length, multi = n > 1;
    const hasShape = items.some((it) => it && it.kind === 'shape');
    const hasInk = items.some((it) => it && it.kind !== 'obj' && !it.type);
    const allInk = n > 0 && items.every((it) => it && (it.kind === 'stroke' || it.kind === 'shape'));
    const hasGid = items.some((it) => it && it.gid);
    const pvN = (sel.pvIts || []).length;
    // 单选专属目标：多选一律关闭（配合 offSel 关弹层），杜绝「面板在、入口没了」。
    const paramBtn = !multi && !!sel.singleParam;
    const animBtn = !multi && !!sel.singleAnim;
    // 旋转中心开关 / 手柄：单选、多选一视同仁（放开 pvCan 的 ===1 限制）。
    const pivotBtn = pvN > 0;
    const pivotDot = pvN > 0 && !!sel.pivotOn;
    return {
      grpBtn: n >= 2,
      ungrpBtn: hasGid,
      alignRow: n >= 2,
      batchBtns: hasShape,
      alignBtns: n >= 2,
      distBtns: n >= 3,
      fxGrp: hasInk,
      txtBtn: allInk,
      paramBtn, animBtn, pivotBtn, pivotDot,
      traceBtn: pvN > 0,
      traceClear: (sel.pageTraces || []).length > 0,
    };
  }
  /* PURE-END selBarVisibility */
  GW.selBarVisibility = selBarVisibility;

  // 正多边形参数（桌面原型 shape.js 的同一套：边数 / 外接圆半径 / 旋转角）。
  // 参数不落在对象上 —— input.js 的 GW.ngon 每次从顶点反推，所以移动、缩放、旋转之后照样能调。
  function ngonTarget() {
    const items = GW.selection.items;
    if (items.length !== 1) return null;
    return GW.ngon.fit(items[0]) ? items[0] : null;
  }
  // 虚线 / 半透明填充是「每个图形自己的属性」，不是画笔的全局开关：
  // 基础页不再放总开关，插入后选中图形，在「参数」里单独改。
  function styleCtl(it, touch) {
    const apply = () => {
      GW.invalidate(it);
      GW.requestRender();
      GW.selection.render();
      touch();
    };
    // 1.3.3：磁场里的带电粒子（type:'lor'）—— 静态圆弧，参数面板与普通图形同一套。
    // 不再是动画：改一个参数，圆弧与初速度箭头立刻重画，落盘/撤销/导出全按普通图形走。
    if (it.type === 'lor') {
      const L = GW.lorentz;
      const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
      const redraw = () => { L.sync(it); apply(); };
      const sg = GW.ui.segmented({
        options: [{ value: '1', label: '+ 正电荷' }, { value: '-1', label: '− 负电荷' }],
        value: num(it.q, 1) >= 0 ? '1' : '-1',
        onChange: (v) => { it.q = (v === '-1' ? -1 : 1) * Math.abs(num(it.q, 1) || 1); it.color = v === '-1' ? '#2563eb' : '#e02020'; redraw(); },
      });
      const sQ = GW.ui.slider({ label: '电荷量 |q|', min: 1, max: 3, step: 0.5, value: Math.abs(num(it.q, 1) || 1), onInput: (v) => { it.q = (num(it.q, 1) < 0 ? -1 : 1) * v; redraw(); } });
      const sB = GW.ui.slider({ label: '磁感应强度 B（T）', min: 0.2, max: 3, step: 0.05, value: num(it.B, 1), onInput: (v) => { it.B = v; redraw(); } });
      const sM = GW.ui.slider({ label: '质量 m', min: 0.5, max: 4, step: 0.1, value: num(it.m, 1), onInput: (v) => { it.m = v; redraw(); } });
      const sV = GW.ui.slider({ label: '速率 v', min: 40, max: 400, step: 5, value: num(it.v, 160), onInput: (v) => { it.v = v; redraw(); } });
      const sA = GW.ui.slider({ label: '入射角', min: -60, max: 60, step: 5, unit: '°', value: Math.round((num(it.tilt, 0) * 180) / Math.PI), onInput: (v) => { it.tilt = (v * Math.PI) / 180; redraw(); } });
      const sT = GW.ui.slider({ label: '入射位置', min: 0, max: 100, step: 1, value: Math.round((it.t == null ? 0 : it.t) * 100), onInput: (v) => { L.setT(it, v / 100); apply(); } });
      const tv = GW.ui.toggle({ label: '显示初速度箭头', value: it.showV !== false, onChange: (v) => { it.showV = v; apply(); } });
      const tr = GW.ui.toggle({ label: '显示半径圆', value: !!it.showR, onChange: (v) => { it.showR = v; apply(); } });
      const inf = L.info(it);
      return [
        sg.el,
        sQ.el, sB.el, sM.el, sV.el, sA.el, sT.el,
        tv.el, tr.el,
        h('p', { class: 'muted', style: { margin: '8px 0 0', lineHeight: 1.6 } },
          '半径 r = m·v/(|q|B) = ' + inf.r.toFixed(1) + '，周期 T = ' + inf.T.toFixed(2) + ' 秒。'),
        h('p', { class: 'muted', style: { margin: '4px 0 0', lineHeight: 1.6 } },
          '磁场方向取那片磁场填充：× 向里、· 向外。改参数圆弧立刻变；出场之后没有洛伦兹力，所以只画场内这一段。'),
      ];
    }
    const sd = GW.ui.toggle({ label: '虚线', value: !!it.dash, onChange: (v) => { it.dash = v; apply(); } });
    // WP6：完整填充控件（模式 / 颜色 / alpha / 图案 5 种 / 密度 / 线宽）。
    // 老图形（无 fillMode）按 it.fill 还原成等价的「纯色半透明」状态，打开面板不报错。
    const curMode = it.fillMode || (it.fill ? 'solid' : 'none');
    const fst = {
      mode: curMode,
      color: it.fillColor || it.color || '#3366ff',
      alpha: it.fillAlpha != null ? it.fillAlpha : 0.18,
      pattern: it.fillPattern || 'hatch',
      density: it.fillDensity != null ? it.fillDensity : 8,
      lineWidth: it.fillLineWidth != null ? it.fillLineWidth : 1,
    };
    const setFill = () => { Object.assign(it, GW.fillFieldsFor(fst)); apply(); };
    const fMode = GW.ui.segmented({
      options: [{ value: 'none', label: '无' }, { value: 'solid', label: '纯色' }, { value: 'pattern', label: '图案' }],
      value: curMode, onChange: (v) => { fst.mode = v; setFill(); },
    });
    const fColor = swatches(['#1b2433', '#3366ff', '#e02020', '#0f9d8a', '#f2a541', '#ffffff'],
      fst.color, (c) => { fst.color = c; setFill(); });
    const fAlpha = GW.ui.slider({ label: '填充浓度', min: 0, max: 100, step: 1, unit: '%', value: Math.round(fst.alpha * 100), onInput: (v) => { fst.alpha = v / 100; setFill(); } });
    const fPat = GW.ui.segmented({
      options: [{ value: 'hatch', label: '斜线' }, { value: 'cross', label: '网格' }, { value: 'dots', label: '点' }, { value: 'h', label: '横' }, { value: 'v', label: '竖' }],
      value: fst.pattern, onChange: (v) => { fst.pattern = v; setFill(); },
    });
    const fDen = GW.ui.slider({ label: '图案密度', min: 2, max: 32, step: 1, value: fst.density, onInput: (v) => { fst.density = v; setFill(); } });
    const fLw = GW.ui.slider({ label: '图案线宽', min: 0.5, max: 5, step: 0.5, value: fst.lineWidth, onInput: (v) => { fst.lineWidth = v; setFill(); } });
    const fillParts = [
      h('div', { class: 'gb-sec' }, h('span', { class: 'muted' }, '填充模式'), fMode.el),
      fColor, fAlpha.el,
      h('div', { class: 'gb-sec' }, h('span', { class: 'muted' }, '图案'), fPat.el),
      fDen.el, fLw.el,
    ];
    // 1.6.8（R3）：换个形状（保包围盒）。库图形（pb/ms/lor）没有这个入口。
    const reshapeSel = (it.kind === 'shape' && it.type !== 'pb' && it.type !== 'ms' && it.type !== 'lor' && GW.reshapeTo)
      ? GW.ui.segmented({
        options: [{ value: '', label: '原样' }, { value: 'rect', label: '矩形' }, { value: 'ellipse', label: '圆' },
          { value: 'triangle', label: '三角' }, { value: 'diamond', label: '菱形' }, { value: 'line', label: '直线' }],
        value: it.shapeKind || '',
        onChange: (v) => { if (v) { GW.reshapeTo(it, v); apply(); } },
      }) : null;
    // 1.3.2：磁场填充（只有闭合图形才有「里面」）
    if (!it.closed) return [sd.el, ...fillParts, reshapeSel].filter(Boolean);
    // 2.0.4：放电荷的按钮改为常驻渲染。1.3.3 把磁场三档从基础页搬进「参数」之后，
    // 这里原来只在建面板那一刻判断 it.mf —— 老师最自然的路径「打开参数 → 在同一个面板
    // 里选 × 向里 → 找放电荷」永远看不到按钮（要关掉重开才出现），看起来像功能被删了。
    // 现在常驻 + 按 it.mf 即时启停，同一次打开就能用；没磁场时禁用并说明原因。
    const chargeBtns = [];
    const chargeHint = h('p', { class: 'muted', style: { margin: '0', lineHeight: 1.5, fontSize: '12px' } }, '');
    const setChargeEnabled = (on) => {
      chargeBtns.forEach((b) => {
        b.disabled = !on;
        b.style.opacity = on ? '' : '.5';
        b.style.cursor = on ? '' : 'not-allowed';
        b.title = on ? '在这片磁场的边界上放一个带电粒子' : '先选「× 向里」或「· 向外」';
      });
      chargeHint.textContent = on
        ? '电荷从边界射入；沿边界拖动可改入射位置，选中粒子后点「参数」可调 B、q、m、v。'
        : '先选上面的磁场方向，再放电荷。';
    };
    const sm = GW.ui.segmented({
      options: [{ value: '', label: '无' }, { value: 'cross', label: '× 向里' }, { value: 'dot', label: '· 向外' }],
      value: it.mf || '',
      onChange: (v) => { it.mf = v || null; setChargeEnabled(!!it.mf); apply(); },
    });
    const parts = [sd.el, ...fillParts, reshapeSel,
      h('div', { class: 'gb-sec' }, h('span', { class: 'muted' }, '磁场填充'), sm.el)].filter(Boolean);
    // 1.3.2：往磁场边界放电荷（没有磁场就没有洛伦兹力，所以未选方向时禁用而不是隐藏）
    if (GW.lorentz) {
      const mk = (sign, label) => {
        const b = h('button', {
          class: 'gw-btn', style: { flex: '1' },
          onclick: () => {
            if (!it.mf) { if (GW.toast) GW.toast('先选磁场方向（× 向里 / · 向外）'); return; }
            const p = GW.lorentz.add(it, sign);
            if (p) GW.selection.set([p]);
          },
        }, label);
        chargeBtns.push(b);
        return b;
      };
      parts.push(h('div', { class: 'gb-sec' }, h('span', { class: 'muted' }, '磁场里的电荷（从边界射入）'),
        h('div', { style: { display: 'flex', gap: '8px' } }, mk(1, '+ 正电荷'), mk(-1, '− 负电荷')),
        chargeHint));
      setChargeEnabled(!!it.mf);
    }
    return parts;
  }

  function styleTarget() {
    const items = GW.selection.items;
    if (items.length !== 1) return null;
    const it = items[0];
    if (!it || it.kind !== 'shape' || !it.pts) return null;
    if (it.type === 'lor') return it;            // 1.3.3：带电粒子跟普通图形共用同一个参数面板
    if (it.type !== 'poly' && it.type !== 'arrow') return null;
    // 正多边形有自己的「边数/半径/旋转」弹层（ngonPop），样式开关并进那一层，不再弹第二个框。
    if (GW.ngon && GW.ngon.fit(it)) return null;
    return it;
  }

  // 1.1.15：调参过程中的实时同步 —— 拖动滑杆时对端立刻跟着变，不用等 400ms 的合并提交。
  // 只推基本类型字段（数值/字符串/布尔）：它们就是物理、数学图形与图形样式的全部可调项。
  function pushObjLive(it) {
    if (!GW.netLive || !it || !it.id) return;
    const d = {};
    for (const k of Object.keys(it)) {
      const v = it[k], t = typeof v;
      if (t === 'number' || t === 'string' || t === 'boolean') d[k] = v;
    }
    GW.netLive('pp', { k: 'pp', id: it.id, data: d, rot: it.rot });
  }

  function stylePop(anchor, it) {
    let before = GW.clone(it), pending = false, timer = 0, self = false;
    const flush = () => {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (!pending) return;
      pending = false;
      if (GW.page().ink.indexOf(it) < 0) return;
      self = true;
      try { GW.commit({ update: [{ before, after: it }] }); } finally { self = false; }
      before = GW.clone(it);
    };
    const touch = () => { pending = true; pushObjLive(it); if (timer) clearTimeout(timer); timer = setTimeout(flush, 400); };
    const el = h('div', { style: { width: '260px' } },
      h('h4', null, '图形样式'),
      styleCtl(it, touch),
      h('p', { class: 'muted', style: { margin: '8px 0 0', lineHeight: 1.5 } }, '只影响选中的这一个图形；一次调整记一步撤销。'),
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
        h('button', { class: 'gw-btn primary', onclick: () => { flush(); closePop(); } }, '完成')));
    const offSel = GW.bus.on('selection', () => { if (isMulti() || GW.selection.items.indexOf(it) < 0) closePop(); });
    const offHist = GW.bus.on('history', () => { if (!self) closePop(); });
    const below = innerHeight - (anchor.getBoundingClientRect().bottom + 10) > 240;
    const avoid = GW.settings.paramAside ? () => avoidBox(it) : null;
    pop(anchor, el, { place: below ? 'bottom' : 'top', avoid, onClose: () => { flush(); offSel(); offHist(); } });
  }

  function ngonPop(anchor, it) {
    const f = GW.ngon.fit(it);
    if (!f) return;
    const p = Object.assign({}, f);
    const deg = (rad) => ((rad * 180 / Math.PI) % 360 + 360) % 360;
    let before = GW.clone(it), pending = false, timer = 0, self = false;
    const flush = () => {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (!pending) return;
      pending = false;
      if (GW.page().ink.indexOf(it) < 0) return;   // 已经被删掉了，别往历史里塞无效条目
      self = true;                                  // 自己提交的那一步不该把弹层关掉
      try { GW.commit({ update: [{ before, after: it }] }); } finally { self = false; }
      before = GW.clone(it);
    };
    const touch = () => { pending = true; pushObjLive(it); if (timer) clearTimeout(timer); timer = setTimeout(flush, 400); };
    const rebuild = () => { GW.ngon.set(it, p); GW.requestRender(); GW.selection.render(); touch(); };
    const r0 = Math.max(1, Math.round(p.r));
    const nS = GW.ui.slider({ label: '边数', min: 3, max: 12, step: 1, value: p.n, onInput: (v) => { p.n = v; rebuild(); } });
    const rS = GW.ui.slider({ label: '外接圆半径', min: Math.max(1, Math.round(r0 * 0.2)), max: Math.max(200, r0 * 5), step: 1, value: r0, onInput: (v) => { p.r = v; rebuild(); } });
    const aS = GW.ui.slider({ label: '旋转角', min: 0, max: 359, step: 1, value: Math.min(359, Math.round(deg(p.rot))), unit: '°', onInput: (v) => { p.rot = v * Math.PI / 180; rebuild(); } });
    const el = h('div', { style: { width: '270px' } },
      h('h4', null, '正多边形参数'),
      nS.el, rS.el, aS.el,
      h('h4', { style: { marginTop: '12px' } }, '样式'),
      ...styleCtl(it, touch),
      h('p', { class: 'muted', style: { margin: '8px 0 0', lineHeight: 1.5 } }, '拖动即时预览；一次调整记一步撤销（Ctrl+Z 可退）。'),
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
        h('button', { class: 'gw-btn primary', onclick: () => { flush(); closePop(); } }, '完成')));
    // range 的 change 在松手时触发 —— 松手立刻落一步历史，不用等 400ms 的兜底定时器
    for (const s of [nS, rS, aS]) { const inp = s.el.querySelector('input'); if (inp) inp.addEventListener('change', flush); }
    // 选中项被换掉 / 删掉就收起；外部撤销重做换了对象也收起（这里引用的已经不是页里的那一个了）
    const offSel = GW.bus.on('selection', () => { if (isMulti() || GW.selection.items.indexOf(it) < 0) closePop(); });
    const offHist = GW.bus.on('history', () => { if (!self) closePop(); });
    // 弹层默认开在工具条**下面**（工具条本来就挂在图形下沿，往下是空的，边拖滑块边看图形）；
    // 图形贴着视口底部时下面放不下（弹层约 300px 高），才翻到工具条上方。
    const below = innerHeight - (anchor.getBoundingClientRect().bottom + 10) > 320;
    const avoid = GW.settings.paramAside ? () => avoidBox(it) : null;
    pop(anchor, el, { place: below ? 'bottom' : 'top', avoid, onClose: () => { flush(); offSel(); offHist(); } });
  }

  // 物理图形库（core/physshapes.js）的参数：每个图形自带几个到十个滑块（平抛的初速/高度、
  // 透镜的焦距/物距、线圈的匝数…），参数直接存在对象上，改完重算包围盒再重画。
  // 物理图形的「样式」段：大小 / 线宽 / 颜色 / 线型 / 填充比例。
  // 和作者那张「斜面-可调参.html」右侧面板一一对应（那张图的面板就是这五项），
  // 所以所有物理图形（含仿真）默认都有同一套控件 —— 不只是新加的斜面。
  function pbStyleCtl(it, touch) {
    const apply = () => { GW.invalidate(it); GW.requestRender(); GW.selection.render(); touch(); };
    // 大小按「进入面板时的外框」等比缩放：物理图形的几何都由 x1..y2 这个框反推，缩放框＝整体缩放。
    const b0 = {
      cx: (it.x1 + it.x2) / 2, cy: (it.y1 + it.y2) / 2,
      w: Math.abs(it.x2 - it.x1), h: Math.abs(it.y2 - it.y1),
    };
    const sizeS = GW.ui.slider({
      label: '大小', min: 0.3, max: 2, step: 0.02, value: 1,
      onInput: (v) => {
        const w = Math.max(8, b0.w * v), h = Math.max(8, b0.h * v);
        it.x1 = b0.cx - w / 2; it.x2 = b0.cx + w / 2;
        it.y1 = b0.cy - h / 2; it.y2 = b0.cy + h / 2;
        apply();
      },
    });
    const lwS = GW.ui.slider({
      label: '线宽', min: 1, max: 10, step: 0.5, value: Math.max(1, it.width || 3),
      onInput: (v) => { it.width = v; it.size = v; apply(); },
    });
    // 1.1.7 透明度：图形整体调淡，避免把底下已经写好的板书盖住。
    // 调过的值同时写回 GW.settings.shapeAlpha —— 下次启动还是这一档，新插入的图形也直接沿用。
    const opaV = it.opacity != null ? it.opacity : ((GW.settings && GW.settings.shapeAlpha != null) ? GW.settings.shapeAlpha : 1);
    const opaS = GW.ui.slider({
      label: '透明度', min: 10, max: 100, step: 1, unit: '%',
      value: Math.round(Math.max(0.1, Math.min(1, opaV)) * 100),
      onInput: (v) => {
        it.opacity = Math.max(0.1, Math.min(1, v / 100));
        if (GW.settings) { GW.settings.shapeAlpha = it.opacity; GW.saveSettings(); }
        apply();
      },
    });
    const dashS = GW.ui.segmented({
      options: [{ value: 'solid', label: '实线' }, { value: 'dashed', label: '虚线' }, { value: 'center', label: '点划线' }],
      value: it.dashStyle || (it.dash ? 'dashed' : 'solid'),
      onChange: (v) => { it.dashStyle = v; it.dash = v !== 'solid'; apply(); },
    });
    // 1.1.9：颜色一行从参数面板里撤掉了 —— 面板本来就挡画布，颜色在「选中虚线框下面那条
    // 工具条」里也有一个（#sel-bar），同一个功能放两处反而更难找。
    const fillS = GW.ui.slider({
      label: '填充', min: 0, max: 60, step: 1, unit: '%',
      value: Math.round((it.fill ? (it.fillAlpha != null ? it.fillAlpha : 0.2) : 0) * 100),
      onInput: (v) => { it.fillAlpha = v / 100; it.fill = v > 0; apply(); },
    });
    return { els: [sizeS.el, lwS.el, opaS.el, dashS.el, fillS.el], ranges: [sizeS, lwS, opaS, fillS] };
  }

  function pbTarget() {
    const items = GW.selection.items;
    if (items.length !== 1) return null;
    const it = items[0];
    if (!it || it.type !== 'pb' || it.kind !== 'shape' || !GW.physShapes) return null;
    // 有没有专有参数都返回：参数段可能为空，但样式段（大小/线宽/颜色/线型/填充）每个物理图形都有
    return it;
  }
  // 数学可调参图形（core/mathshapes.js）：和 pb 共用同一个「参数」弹层与撤销逻辑。
  function msTarget() {
    const items = GW.selection.items;
    if (items.length !== 1) return null;
    const it = items[0];
    if (!it || it.type !== 'ms' || it.kind !== 'shape' || !GW.mathShapes) return null;
    return GW.mathShapes.paramList(it.key).length ? it : null;
  }
  function paramTarget() { return pbTarget() || msTarget(); }
  // 「播放 / 暂停」「重置」：镜像原版白板的单对象动画控制，只在选中单个动画图形时出现。
  function animTarget() {
    const items = GW.selection.items;
    if (items.length !== 1) return null;
    const it = items[0];
    if (!it || it.type !== 'pb' || !GW.physShapes || !GW.physShapes.isAnim(it)) return null;
    return it;
  }

  // 面板透明度（1.1.8）：只改弹层的底色 alpha，正文/滑杆照旧不透明，读得清也看得见底下的图。
  // 0 = 完全不透明，100% = 底板全透（按用户要求不再留那 6% 的「保底」）。
  function applyPanelAlpha(v) {
    const a = Math.max(0, Math.min(1, v == null ? (GW.settings.panelAlpha == null ? 0.9 : GW.settings.panelAlpha) : v));
    document.documentElement.style.setProperty('--pop-alpha', String(a));
    applyUiTheme();
    return a;
  }
  GW.applyPanelAlpha = applyPanelAlpha;

  // 激光笔设置（1.1.14）：storage 的 sanitize 已经夹过范围，这里只把合法字段并进 tool.laser。
  // 启动时调一次，之后 laserPop 改动会直接写 tool.laser + GW.settings.laser。
  function applyLaserSettings() {
    const s = GW.settings.laser;
    if (!s || typeof s !== 'object') return;
    const L = GW.tool.laser;
    if (/^#[0-9a-f]{6}$/i.test(String(s.color || ''))) L.color = s.color;
    if (isFinite(s.width)) L.width = Math.max(1, Math.min(40, Number(s.width)));
    if (s.mode === 'demo' || s.mode === 'formula') L.mode = s.mode;
    if (isFinite(s.hold)) L.hold = Math.max(1, Math.min(30, Number(s.hold)));
  }
  GW.applyLaserSettings = applyLaserSettings;

  // 界面透明度（1.1.8）：一根滑杆管「所有外壳」—— 顶栏、四角工具条、底部 Dock、参数/设置面板、
  // 选中条、悬浮球。走 CSS 变量 --ui-alpha，只有这些元素读它，画布与板书一个像素都不受影响。
  // 存的是「不透明度」（1 = 全显），滑杆显示的是「透明度」（0 = 全显），跟面板那根保持一致。
  const uiAlphaCtl = [];
  function applyUiAlpha(v) {
    const a = Math.max(0, Math.min(1, v == null ? (GW.settings.uiAlpha == null ? 1 : GW.settings.uiAlpha) : v));
    document.documentElement.style.setProperty('--ui-alpha', String(a));
    applyUiTheme();
    return a;
  }
  GW.applyUiAlpha = applyUiAlpha;
  function uiAlphaSlider() {
    const s = GW.ui.slider({
      label: '界面透明度', min: 0, max: 100, step: 1, unit: '%',
      value: Math.round((1 - applyUiAlpha()) * 100),
      onInput: (v) => {
        const a = 1 - v / 100;
        GW.settings.uiAlpha = a; GW.saveSettings(); applyUiAlpha(a);
        for (const c of uiAlphaCtl) if (c.ctl !== s) c.ctl.set(Math.round((1 - a) * 100));
      },
    });
    uiAlphaCtl.push({ ctl: s, el: s.el });
    return s.el;
  }
  GW.uiAlphaSlider = uiAlphaSlider;

  // =============== 1.1.11 界面主题：随画布底色自动取色 ===============
  // 反馈第 3 条：工具栏和每个菜单的字、缩略图、UI 颜色都要跟着画布底色走。
  // 做法只改 CSS 变量（--ink / --menu-bg / --menu-tile …），不写任何元素的内联颜色：
  // 深底 → 深色玻璃底纹 + 浅色字，浅底 → 浅色玻璃底纹 + 深色字。缩略图与 logo 不参与。
  const uiMix = (a, b, k) => [0, 1, 2].map((i) => Math.round(a[i] * (1 - k) + b[i] * k));
  const uiLum = (c) => {
    const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const uiContrast = (a, b) => { const x = uiLum(a), y = uiLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function uiHue(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return -1;
    let h; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }
  function canvasRGB() {
    const bg = (GW.page() && GW.page().bg) || GW.settings.defaultBg || {};
    // 底色可以是预设 id（白板/米黄纸/磨砂黑板…），不是 #rrggbb；先过一遍 bgTheme 换成真实填充色，
    // 否则深色预设会被当成解析失败、落到兜底的黑，菜单配色就跟画布对不上了。
    const th = (GW.bgTheme && GW.bgTheme(bg.color)) || null;
    return hexRGB((th && th.fill) || bg.color) || [8, 12, 18];
  }
  function uiTheme() {
    const rgb = canvasRGB();
    const dark = !!(GW.isDarkBg && GW.isDarkBg());
    const base = dark ? uiMix(rgb, [18, 24, 33], 0.76) : uiMix(rgb, [255, 255, 255], 0.92);
    return {
      rgb: rgb, dark: dark, base: base,
      fg: dark ? '#eef3fa' : '#1b2433',
      fg2: dark ? 'rgba(238,243,250,.66)' : 'rgba(27,36,51,.60)',
      accent: dark ? '#3fd0b6' : '#0f9d8a',
    };
  }
  function applyUiTheme() {
    const S = GW.settings;
    const t = (GW.uiThemeCache = uiTheme());
    const root = document.documentElement.style;
    // 反馈 2 的一层意思：老师调「工具栏底纹不透明度」时，别只把工具栏调透、菜单还死死实心。
    // 所以菜单底纹 alpha 也乘上底纹不透明度。注意 barAlpha 的出厂值是 0.98（几乎不透明），
    // 这里按 0.98 归一（barAlpha/0.98，封顶 1）—— 否则「面板透明度 0%（最实）」只能到 0.98，
    // 「完全不同透」这个手感就没了；归一之后：不动滑杆时菜单照样全实，往下拉时菜单才跟着透。
    const BA = Math.max(0, Math.min(1, S.barAlpha == null ? 0.98 : S.barAlpha));
    const BMENU = Math.min(1, BA / 0.98);
    const ARAW = Math.max(0, Math.min(1, S.uiAlpha == null ? 1 : S.uiAlpha));
    const A = ARAW * BMENU;
    const PA = Math.max(0, Math.min(1, S.panelAlpha == null ? 0.9 : S.panelAlpha));
    // 项目底纹（按钮、卡片）单独一层：界面透明度越低它越透，但保留一点底，缩略图才有衬底。
    const tileA = Math.min(1, A + (1 - A) * 0.42);
    const tile = t.dark ? uiMix(t.base, [255, 255, 255], 0.07) : [255, 255, 255];
    const tileHover = t.dark ? uiMix(t.base, [255, 255, 255], 0.13) : [243, 251, 249];
    const sel = t.dark ? [24, 74, 68] : [233, 247, 244];
    const seg = t.dark ? uiMix(t.base, [255, 255, 255], 0.10) : [233, 237, 242];
    const drawer = t.dark ? uiMix(t.base, [255, 255, 255], 0.04) : uiMix(t.base, [255, 255, 255], 1);
    const line = t.dark ? 'rgba(255,255,255,' + (0.10 + 0.08 * A).toFixed(2) + ')' : 'rgba(27,36,51,' + (0.08 + 0.06 * A).toFixed(2) + ')';
    root.setProperty('--ink', t.fg);
    root.setProperty('--ink-2', t.fg2);
    root.setProperty('--line', line);
    root.setProperty('--accent', t.accent);
    // 反馈 2（1.1.12）：深底上原来那三个「正色」强调色（#e4572e 砖红 / #3366ff 蓝 / #f2a541 金）
    // 在深色面板上只有 2~3 的对比度，边框、小图标、章节行都是糊的 —— 深底统一换成提亮版。
    root.setProperty('--accent-2', t.dark ? '#ff9d7a' : '#e4572e');
    root.setProperty('--accent-3', t.dark ? '#8fb3ff' : '#3366ff');
    root.setProperty('--gold', t.dark ? '#ffc76b' : '#f2a541');
    // 主按钮（实心强调色）上的字：深底强调色偏亮，白字只有 1.9 的对比度，得用深墨色。
    root.setProperty('--accent-fg', t.dark ? '#04211c' : '#ffffff');
    // 悬浮球（反馈 4，1.1.12）：整颗球跟着菜单风格走 —— 深底是亮青球 + 深色图标，
    // 浅底是教材青球 + 白图标，两种底色上都够跳，也不会出现「白球白图标」。
    root.setProperty('--ball-bg', t.accent);
    root.setProperty('--ball-hi', '#' + uiMix(t.dark ? [63, 208, 182] : [15, 157, 138], [255, 255, 255], t.dark ? 0.34 : 0.20).map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
    root.setProperty('--ball-fg', t.dark ? '#04211c' : '#ffffff');
    root.setProperty('--ui-fg', t.fg);
    root.setProperty('--ui-bg', rgbaOf(t.base, A));
    root.setProperty('--pop-bg', rgbaOf(t.base, A * PA));
    // 1.1.15：参数面板透明度以前只作用在 .pop 弹层上，生物/数学图形自带的「参数条」
    // （.anim-bar）与仿真参数面板（.gw-sim-panel）各自写死了底色，拉滑杆完全没反应 ——
    // 老师看到的就是「调参面板透明度没生效」。这两类面板统一读这个变量。
    root.setProperty('--panel-alpha', String(Math.round(PA * 1000) / 1000));
    root.setProperty('--menu-bg', rgbaOf(t.base, A));
    root.setProperty('--menu-bg2', rgbaOf(drawer, Math.max(0.10, A)));
    root.setProperty('--menu-tile', rgbaOf(tile, tileA));
    root.setProperty('--menu-tile-hover', rgbaOf(tileHover, tileA));
    root.setProperty('--menu-sel', rgbaOf(sel, tileA));
    root.setProperty('--menu-hover', rgbaOf(t.dark ? [255, 255, 255] : [27, 36, 51], (t.dark ? 0.08 : 0.05) * Math.max(0.35, A)));
    root.setProperty('--menu-seg', rgbaOf(seg, tileA));
    root.setProperty('--menu-line', line);
    root.setProperty('--dlg-bg', rgbaOf(t.dark ? uiMix(t.base, [0, 0, 0], 0.18) : [255, 255, 255], A));
    // 2.2.7 修（白字看不见的一族）：CSS 里有一批 var(--x, 浅色兜底) 从来没被赋值过 ——
    // 兜底值全是浅色主题的（#66707c 灰字 / #f4f6f9 浅底），换到深色画布就成了
    // 「深底 + 深灰字」或「浅底 + 浅字」，正文直接读不出来（.sv-line b、.bk-hint、.bk-meta、
    // .dep-hint、.exp-tip、.about-me 等都是这一族）。在唯一真源 applyUiTheme 里补上赋值，
    // 各处 CSS 一个字都不用改，深/浅两套自动跟着走。
    root.setProperty('--fg-dim', t.fg2);
    root.setProperty('--bg-2', t.dark ? uiMix(t.base, [255, 255, 255], 0.06) : '#f4f6f9');
    root.setProperty('--sel', rgbaOf(sel, tileA));
    root.setProperty('--dk-on', t.dark ? '#eef3fa' : '#1b2433');
    root.setProperty('--dk-on-fg', t.dark ? '#11161d' : '#ffffff');
    root.setProperty('--dk-hover', t.dark ? 'rgba(255,255,255,.10)' : 'rgba(27,36,51,.06)');
    document.body.classList.toggle('ui-dark', t.dark);
    document.body.classList.toggle('pop-clear', A * PA < 0.985);
    // applyBarLook 末尾会回过头来调 applyUiTheme（见那里的注释），这个闸门防止无限递归。
    GW._inTheme = true;
    try { applyBarLook(); } finally { GW._inTheme = false; }
  }
  GW.applyUiTheme = applyUiTheme;

  // ---------- 反馈第 3 条后半：笔色板按画布底色智能置顶 5 个高对比色 ----------
  // 规则：先按与底色的对比度排序（对比度 < 1.5 的直接不推荐），再挑色相相差 ≥32° 的 5 个；
  // 不够 5 个就按对比度补齐。剩下的颜色保持原顺序排在后面 —— 老师习惯的位置不会乱跳。
  function smartPenColors() {
    const bg = canvasRGB();
    const hidden = tcHide('pen');
    const extra = (tc().extraColors || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
    const all = COLORS.concat(extra).filter((c, i, arr) => arr.indexOf(c) === i && hidden.indexOf(c) < 0);
    const ranked = all.map((c) => { const rgb = hexRGB(c) || [0, 0, 0]; return { c: c, k: uiContrast(rgb, bg), h: uiHue(rgb) }; })
      .sort((a, b) => b.k - a.k);
    // 灰阶（中明度、几乎无彩度）对比度再高也不往置顶里放：老师要的是「看得舒服的彩色」，
    // 黑白两端保留（深底上白、浅底上黑都必须能一眼找到）。
    const dull = (c) => {
      const rgb = hexRGB(c) || [0, 0, 0];
      const mx = Math.max(rgb[0], rgb[1], rgb[2]) / 255, mn = Math.min(rgb[0], rgb[1], rgb[2]) / 255;
      const l = (mx + mn) / 2, sat = mx === mn ? 0 : (l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn));
      return sat < 0.16 && l > 0.18 && l < 0.94;
    };
    const top = [];
    for (const r of ranked) {
      if (top.length >= 5) break;
      if (r.k < 1.5) continue;
      if (dull(r.c)) continue;
      if (top.some((x) => x.h >= 0 && r.h >= 0 && (Math.min(Math.abs(x.h - r.h), 360 - Math.abs(x.h - r.h)) < 32))) continue;
      top.push(r);
    }
    for (const r of ranked) { if (top.length >= 5) break; if (top.indexOf(r) < 0) top.push(r); }
    const out = top.map((r) => r.c);
    for (const c of all) if (out.indexOf(c) < 0) out.push(c);
    return out;
  }
  GW.smartPenColors = smartPenColors;

  // ---------- 反馈第 4 条：工具栏 / 菜单自主定制 ----------
  // settings.toolCustom.hidden 里按「组」记被隐藏条目的 id；默认全空 = 全开启。
  const TC_GROUPS = ['pen', 'shapeTabs', 'mathSubs', 'physSubs', 'insert', 'sims', 'geo', 'class', 'resTabs'];
  function tc() {
    const S = GW.settings;
    let t = S.toolCustom;
    if (!t || typeof t !== 'object') t = S.toolCustom = {};
    if (!t.hidden || typeof t.hidden !== 'object') t.hidden = {};
    if (!Array.isArray(t.extraColors)) t.extraColors = [];
    for (const g of TC_GROUPS) if (!Array.isArray(t.hidden[g])) t.hidden[g] = [];
    return t;
  }
  function tcHide(group) { return tc().hidden[group] || []; }
  function tcOn(group, id) { return tcHide(group).indexOf(String(id)) < 0; }
  function tcSet(group, id, on) {
    const t = tc();
    const arr = (t.hidden[group] || []).filter((x) => x !== String(id));
    if (!on) arr.push(String(id));
    t.hidden[group] = arr;
    GW.saveSettings();
  }
  // 某一类被老师整组收起时，菜单里给一句话指出恢复入口，不留空面板
  const tcEmptyTip = () => h('p', { class: 'muted', style: { margin: '6px 2px 2px' } },
    '这一类已经全部收起 —— 在 ☰ 菜单 →「自定义工具栏…」里可以勾回来。');
  function tcClear() {
    GW.settings.toolCustom = null;
    GW.saveSettings();
    applyUiTheme();
    return true;
  }
  GW.toolCustom = { tc: tc, hide: tcHide, on: tcOn, set: tcSet, clear: tcClear, groups: TC_GROUPS };

  // 定制面板：一个弹窗里按「画笔 / 图形 / 插入 / 仿真 / 尺规 / 课堂 / 资源库」分区，
  // 每项一个开关块；每区带「全显示 / 全隐藏」。点一下立即生效并落盘。
  function customizeToolbar() {
    const wrap = h('div', { class: 'tc-wrap' });
    let d = null;
    const reopen = () => { if (d) d.close(); customizeToolbar(); };
    // 每区一组「开/关」；api 传了就用它（工具栏 16 个按钮走 GW.uiCustom），否则写 toolCustom.hidden
    const sec = (title, desc, key, items, swatch, api) => {
      const isOn = api ? api.isOn : (id) => tcOn(key, id);
      const set = api ? api.set : (id, on) => tcSet(key, id, on);
      const chips = h('div', { class: 'tc-chips' });
      const paint = () => {
        chips.replaceChildren(...items.map(([id, label]) => {
          const on = isOn(id);
          const lead = swatch ? h('i', { class: 'tc-sw', style: { background: label } }) : null;
          const extra = swatch && (tc().extraColors || []).indexOf(id) >= 0;
          return h('button', {
            class: 'tc-chip' + (on ? ' on' : ''),
            title: extra ? '你添加的颜色：点这里显示/隐藏，点 × 删除' : '',
            onclick: () => { set(id, !isOn(id)); paint(); applyUiTheme(); },
          }, lead, h('span', null, swatch ? '' : label),
             extra ? h('b', { class: 'tc-del', title: '删除这个自定义颜色', onclick: (e) => {
               e.stopPropagation();
               const t = tc();
               t.extraColors = t.extraColors.filter((x) => x !== id);
               t.hidden.pen = (t.hidden.pen || []).filter((x) => x !== id);
               GW.saveSettings(); reopen();
             } }, '×') : null,
             on ? h('b', { class: 'tc-tick' }, '✓') : null);
        }));
      };
      const all = (on) => { for (const [id] of items) set(id, on); paint(); applyUiTheme(); };
      paint();
      return h('div', { class: 'tc-sec' },
        h('div', { class: 'tc-sec-h' },
          h('b', null, title),
          h('span', { class: 'tc-sec-d' }, desc),
          h('button', { class: 'tc-mini', onclick: () => all(true) }, '全显示'),
          h('button', { class: 'tc-mini', onclick: () => all(false) }, '全隐藏')),
        chips,
        swatch ? colorAddRow() : null);
    };
    // 「增添笔的颜色种类」：色板本来就带自定义取色器，这里再加一个可长期保存的颜色槽
    const colorAddRow = () => {
      const inp = h('input', { type: 'color', value: '#ff7a1a', class: 'tc-color' });
      return h('div', { class: 'tc-addrow' },
        h('span', null, '添加颜色：'), inp,
        h('button', { class: 'tc-mini', onclick: () => {
          const t = tc(), v = String(inp.value || '').toLowerCase();
          if (!/^#[0-9a-f]{6}$/.test(v)) return;
          if (COLORS.indexOf(v) >= 0 || t.extraColors.indexOf(v) >= 0) { GW.toast('这个颜色已经在色板里了'); return; }
          t.extraColors.push(v);
          t.hidden.pen = (t.hidden.pen || []).filter((x) => x !== v);
          GW.saveSettings(); reopen();
        } }, '添加'));
    };
    if (GW.uiCustom) {
      const its = GW.uiCustom.items();
      wrap.append(sec('工具栏按钮', '底栏上的 16 个按钮（顺序、停靠位置在 设置 → 界面自定义）', 'dock',
        its.map((x) => [x.id, x.label]), false, {
          isOn: (id) => { const f = GW.uiCustom.items().filter((x) => x.id === id)[0]; return !f || f.on; },
          set: (id, on) => GW.uiCustom.setItemOn(id, on),
        }));
    }
    wrap.append(sec('画笔颜色', '色板里的颜色，隐藏后两个色板都不再显示；也可以在下面加自己的颜色', 'pen',
      COLORS.concat((tc().extraColors || [])).map((c) => [c, c]), true));
    wrap.append(sec('图形分类', '图形面板顶部的学科分页', 'shapeTabs', [['basic', '基础'], ['math', '数学'], ['phys', '物理'], ['chem', '化学'], ['bio', '生物'], ['geo', '地理']]));
    wrap.append(sec('数学子分类', '数学页里的平面几何 / 函数图像 / 模板', 'mathSubs', [['geo', '平面几何'], ['func', '函数图像'], ['tpl', '数学模板']]));
    wrap.append(sec('物理分类', '物理页里按章分的力学 / 电磁学 / 光学…', 'physSubs', (GW.physShapes ? GW.physShapes.cats().filter((c) => c !== 'sketch') : []).map((c) => [c, (GW.physShapes.catLabel || {})[c] || c])));
    wrap.append(sec('插入内容', '插入面板里的每一项', 'insert', INSERT_ITEMS.map((x) => [x[0], x[2]])));
    const simItems = [];
    for (const sim of (GW.sims ? Object.values(GW.sims) : [])) simItems.push([sim.id, (sim.category === 'physics' ? '物理 · ' : '数学 · ') + sim.name]);
    for (const [, arr] of SIM_DEMOS) for (const t of arr) simItems.push([t[0], '演示 · ' + t[1]]);
    wrap.append(sec('数学 / 物理仿真', '仿真抽屉里的内置项目（网页演示也在这里）', 'sims', simItems));
    wrap.append(sec('尺规', '尺规工具条里的工具', 'geo', [['ruler', '直尺'], ['tri45', '三角板 45°'], ['tri60', '三角板 30°/60°'], ['protractor', '量角器'], ['compass', '圆规'], ['clear', '全部收起']]));
    wrap.append(sec('课堂工具', '课堂面板里的工具', 'class', [['timer', '计时器'], ['rollcall', '随机点名'], ['spotlight', '聚光灯'], ['curtain', '板中板'], ['magnifier', '放大镜'], ['calc', '计算器'], ['camera', '截图'], ['scoreboard', '小组计分'], ['constants', '物理常量'], ['croom', '课堂回放'], ['cquiz', '答题器'], ['clesson', '一节课'], ['desktop', '桌面画布'], ['bg', '背景'], ['pages', '页面管理']]));
    wrap.append(sec('资源库', '资源库的五个分页', 'resTabs', [['author', '作者作品'], ['phet', 'PhET 仿真'], ['web', '在线工具'], ['lib', '学科库'], ['mine', '我的资源']]));
    wrap.prepend(h('p', { class: 'tc-tip' }, '默认全部开启。勾掉的项只是从菜单里收起来，不删除任何数据；随时可以在这里勾回来。'),
      h('div', { class: 'tc-acts' },
        h('button', { class: 'gw-btn', onclick: () => { tcClear(); reopen(); } }, '恢复默认（全部开启）')));
    d = GW.dialog({ title: '自定义工具栏', width: 760, ok: '完成', cancel: '', body: wrap });
  }
  GW.customizeToolbar = customizeToolbar;

  function pbPop(anchor, it) {
    // pb（物理图形）与 ms（数学可调参图形）的参数定义格式相同，共用这套滑块/撤销逻辑。
    const PS = it.type === 'ms' ? GW.mathShapes : GW.physShapes;
    const defs = PS.paramList(it.key);
    const d0 = PS.get(it.key) || {};
    let before = GW.clone(it), pending = false, timer = 0, self = false;
    const flush = () => {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (!pending) return;
      pending = false;
      if (GW.page().ink.indexOf(it) < 0) return;
      self = true;
      try { GW.commit({ update: [{ before, after: it }] }); } finally { self = false; }
      before = GW.clone(it);
    };
    const touch = () => { pending = true; pushObjLive(it); if (timer) clearTimeout(timer); timer = setTimeout(flush, 400); };
    // 参数一变，画出来的范围常常也变（振幅、焦距、匝数都会伸到框外），所以包围盒必须重算
    const rebuild = () => { GW.invalidate(it); GW.requestRender(); GW.selection.render(); touch(); };
    const box = h('div', null);
    const ranges = [], byKey = {};
    // 2.0.9：扩展模型库（phys-pm-ext.js）的图形带 showParam(o,key) —— 「这个参数在当前场景下用不到就别显示」
    // （磁场的宽高随区域类型变、动量图的恢复系数只在非完全弹性时才有意义）。上游是靠宿主补丁
    // pm_model_controls.js 的 syncModelParams 做增删行的；这里没有那个补丁，就在面板里包一层行容器，
    // 该藏的行整行 display:none —— 与上游一致：不是置灰，是不出现。
    const rows = {};
    const rowOf = (key, el) => { const w = h('div', null, el); rows[key] = w; box.append(w); };
    const applyShow = () => {
      const show = d0.showParam;
      if (typeof show !== 'function') return;
      for (const p of defs) {
        const w = rows[p.key];
        if (!w) continue;
        let on = true;
        try { on = show(it, p.key) !== false; } catch (e) { on = true; }
        w.style.display = on ? '' : 'none';
      }
    };
    // 2.0.9：扩展模型库的联动参数（def.linkParams(o, key) → {另一参数: 新值}）。
    // 上游是光电效应那张图的「频率 ↔ 波长」两个滑块互为输入：模型内部只认频率，
    // 波长滑块不联动就成了死滑块（拖了画面不变）。这里把联动值写回对象并同步控件。
    const syncLinked = (key) => {
      const link = d0.linkParams;
      if (typeof link !== 'function') return;
      let map = null;
      try { map = link(it, key); } catch (e) { map = null; }
      if (!map) return;
      for (const name in map) {
        it[name] = map[name];
        if (byKey[name]) byKey[name].set(map[name]);
        const row = rows[name];
        if (row) { const inp = row.querySelector('input[type=range]'); if (inp) inp.value = map[name]; }
      }
    };
    // 条件参数（图形声明的 paramCond，例如热学图的「末温度」只在等容过程有效）：
    // 当前过程用不到的滑块置灰、不可拖，免得老师调了没反应以为参数坏了。
    const applyCond = () => {
      const cond = d0.paramCond;
      if (!cond) return;
      for (const p of defs) {
        const s = byKey[p.key];
        if (!s || !s.el) continue;
        let on = true;
        if (cond[p.key]) { try { on = !!cond[p.key](it); } catch (e) { on = true; } }
        s.el.style.opacity = on ? '' : '0.4';
        s.el.style.pointerEvents = on ? '' : 'none';
      }
    };
    for (const p of defs) {
      if (it[p.key] == null) it[p.key] = p.def;
      // 2.0.9：扩展模型库的文本参数（挡板端点、隐藏粒子编号）—— 一次要填一串值，
      // 用输入框而不是滑条；改完照常重算包围盒、记一步撤销。
      if (p.type === 'modelText') {
        const t = GW.ui.text({ label: p.label, value: it[p.key] == null ? '' : String(it[p.key]), onChange: (v) => { it[p.key] = v; rebuild(); applyShow(); } });
        t.el.style.margin = '6px 0';
        rowOf(p.key, t.el);
        // 文本参数没有滑杆，撤销要靠 change 事件落一步（其余参数是 input 事件抖动着改）
        t.el.querySelector('input').addEventListener('change', flush);
        continue;
      }
      if (p.hint) {
        // 分段按钮塞不下多档参数（万用表 14 个挡位会把弹层撑破，后面的挡位在电脑端
        // 根本点不到）；超过 6 项一律换原生下拉，滚轮 / 键盘 / 触屏都能选。
        const many = p.hint.length > 6;
        const opts = p.hint.map((o) => ({ value: o.value, label: o.label }));
        const ctl = many
          ? GW.ui.select({ label: p.label, options: opts, value: it[p.key], onChange: (v) => { it[p.key] = +v; syncLinked(p.key); rebuild(); applyCond(); applyShow(); } })
          : GW.ui.segmented({ options: opts, value: it[p.key], onChange: (v) => { it[p.key] = +v; syncLinked(p.key); rebuild(); applyCond(); applyShow(); } });
        rowOf(p.key, many ? ctl.el
          : h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', margin: '6px 0' } },
            h('span', { style: { fontSize: '13px', minWidth: '64px' } }, p.label), ctl.el));
        continue;
      }
      const s = GW.ui.slider({
        label: p.label, min: p.min, max: p.max, step: p.step || 1, value: it[p.key], unit: p.unit || '',
        onInput: (v) => { it[p.key] = v; syncLinked(p.key); rebuild(); applyShow(); },
      });
      rowOf(p.key, s.el);
      ranges.push(s);
      byKey[p.key] = s;
    }
    applyCond();
    applyShow();
    // 1.1.11（反馈 1）：可动图形的「动画倍速」。默认 0.25×，老师可以 0.25 一档往上调。
    // 只改 animSpeed，不动 animT —— 拖动滑杆不会把正在讲的那一帧打回起点。
    if (it.type === 'pb' && PS.isAnim(it)) {
      PS.ensureAnim(it);
      box.append(h('h4', { style: { margin: '10px 0 2px' } }, '动画'));
      // 1.7.12：电磁振荡的「1×」＝实际 0.05×（老师 13:05 要求每个倍率提速 5 倍、
      // 初始仍取 1×）。只对该图形重标定，其它动画图形不变。
      const isOsc = it.key === 'b_em_lcOsc', OSC_SPEED_UNIT = 0.05;
      const sp = GW.ui.slider({
        label: '播放倍速', min: 0.25, max: 3, step: 0.25, unit: '×',
        value: isOsc ? (it.animSpeed || OSC_SPEED_UNIT) / OSC_SPEED_UNIT : (it.animSpeed || 0.25),
        onInput: (v) => { it.animSpeed = isOsc ? v * OSC_SPEED_UNIT : v; GW.requestRender(); },
        // 步长是 1/4，fmt() 按步长取 1 位小数会把 0.25 显示成 0.3；这里按真实倍数显示。
        fmtText: (v) => String(Math.round(v * 100) / 100),
      });
      box.append(sp.el);
      const playBtn = h('button', {
        class: 'gw-btn', style: { marginTop: '6px' },
        onclick: () => { PS.toggleItem(it); GW.requestRender(); playBtn.textContent = PS.itemPlaying(it) ? '暂停' : '播放'; },
      }, PS.itemPlaying(it) ? '暂停' : '播放');
      box.append(playBtn);
    }
    // 2.0.9：PM 模型库（pm_*）默认是「纯净图」—— 周围说明文字与公式不画，
    // 画布上只留器件本体；这里给一个两档开关，需要讲解时一键显示。
    if (String(it.key || '').indexOf('pm_') === 0) {
      box.append(h('h4', { style: { margin: '8px 0 2px' } }, '标注'));
      const seg = GW.ui.segmented({
        options: [{ label: '纯净图', value: 0 }, { label: '显示文字/公式', value: 1 }],
        value: it.pmText === true ? 1 : 0,
        onChange: (v) => { it.pmText = (+v) === 1; rebuild(); },
      });
      box.append(h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', margin: '6px 0' } }, seg.el));
    }
    // 样式段：只在物理图形上出现（数学图形 ms 的填充语义由 mathshapes 自己管，不混进来）
    let styleRanges = [];
    if (it.type === 'pb') {
      const st = pbStyleCtl(it, touch);
      box.append(h('h4', { style: { margin: '8px 0 2px' } }, '样式'));
      for (const n of st.els) box.append(n);
      styleRanges = st.ranges;
    }
    // 1.1.8：面板本身的不透明度。放到「完成」上面而不是专有参数里 ——
    // 它改的是这块面板，不属于这个图形，改完立刻重画不必重建弹层。
    const pa = GW.ui.slider({
      label: '面板透明度', min: 0, max: 100, step: 1, unit: '%',
      value: Math.round((1 - applyPanelAlpha()) * 100),
      onInput: (v) => { GW.settings.panelAlpha = 1 - v / 100; GW.saveSettings(); applyPanelAlpha(1 - v / 100); },
    });
    const el = h('div', { style: { width: '100%' } },
      h('h4', { style: { margin: '0 0 6px' } }, d0.label || it.key),
      h('div', { style: { maxHeight: '62vh', overflowY: 'auto', paddingRight: '2px' } }, box),
      h('div', { style: { borderTop: '1px solid var(--line)', marginTop: '8px', paddingTop: '8px' } }, pa.el, uiAlphaSlider()),
      h('p', { class: 'muted', style: { margin: '6px 0 0', lineHeight: 1.45 } }, '拖动即时预览；一次调整记一步撤销。'),
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
        h('button', { class: 'gw-btn primary', onclick: () => { flush(); closePop(); } }, '完成')));
    for (const s of ranges.concat(styleRanges)) { const inp = s.el.querySelector('input'); if (inp) inp.addEventListener('change', flush); }
    const offSel = GW.bus.on('selection', () => { if (isMulti() || GW.selection.items.indexOf(it) < 0) closePop(); });
    // 画布上拖图形自己的把手（滑动变阻器的滑片）时：面板里那一格要跟着走，
    // 而那次拖动产生的 commit 不该把面板关掉 —— 老师常常是开着面板看的。
    const syncFn = (o, key) => { if (o !== it) return; const s = byKey[key]; if (s) s.set(it[key]); };
    const rebaseFn = (o) => { if (o !== it) return; before = GW.clone(it); };
    GW.syncParam = syncFn;
    GW.pbPopRebase = rebaseFn;
    const offHist = GW.bus.on('history', () => { if (!self && !GW.pbDrag) closePop(); });
    const below = innerHeight - (anchor.getBoundingClientRect().bottom + 10) > 320;
    // 设置里打开「参数面板避让图形」后，弹层优先落到图形外侧（1.1.14）
    const avoid = GW.settings.paramAside ? () => avoidBox(it) : null;
    pop(anchor, el, {
      place: below ? 'bottom' : 'top', cls: 'pb-pop', avoid,
      onClose: () => {
        flush(); offSel(); offHist();
        if (GW.syncParam === syncFn) GW.syncParam = null;
        if (GW.pbPopRebase === rebaseFn) GW.pbPopRebase = null;
      },
    });
    // 记下这块面板是谁的：点在这件图形自己的把手上时，上面那条「点外面就关」的监听要放行
    if (curPop) curPop.item = it;
  }

  function buildSelUI() {
    const box = h('div', { id: 'sel-ui', style: { display: 'none' } });
    // 1.6.4：旋转手柄收成一颗粒子（只贴上边中点外，没有连杆）。
    // 老师反馈「四个边的手柄太长，只留一个绿色原点就够了」—— 1.3.0 的四向钮是为
    // 「框转 90° 后被参数条压住」加的，但 62px 连杆在窄屏上也确实挡视线。
    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rot'].map((k) => {
      const d = h('div', { class: 'sh ' + k });
      d.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        d.setPointerCapture(e.pointerId);
        const st = {};
        GW.transformSel(st, e, k === 'rot' ? 'rotate' : 'scale-' + k);
        const mv = (ev) => st.move && st.move(ev);
        const up = (ev) => { d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); st.up && st.up(ev); };
        d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up);
      });
      return d;
    });
    // 1.5.1 旋转中心手柄：单独一块 fixed 元素挂在 body 上 —— 放进 #sel-ui 会跟着虚线框
    // 一起旋转，十字变斜、拖动方向也跟着变。它是「磁场里绕圆心外一点转圆」的那个把手。
    const pivotDot = h('div', { id: 'pv-ui', title: '旋转中心：拖到任意位置（图形绕这个点旋转），再点工具条上的「旋转中心」可隐藏', style: { display: 'none' } });
    let pvIt = null, pvBefore = null;
    pivotDot.addEventListener('pointerdown', (e) => {
      const its = GW.pivotTargets();
      // WP5：多选 → 拖组旋转中心（选区级，不进历史）；单选继续走下面原逻辑，逐字保持。
      if (its.length > 1) {
        e.stopPropagation(); e.preventDefault();
        try { pivotDot.setPointerCapture(e.pointerId); } catch (err) { /* 无视 */ }
        const mv = (ev) => GW.setGroupPivot(GW.toWorld(ev.clientX, ev.clientY));
        const up = () => {
          pivotDot.removeEventListener('pointermove', mv);
          pivotDot.removeEventListener('pointerup', up);
          pivotDot.removeEventListener('pointercancel', up);
        };
        pivotDot.addEventListener('pointermove', mv);
        pivotDot.addEventListener('pointerup', up);
        pivotDot.addEventListener('pointercancel', up);
        return;
      }
      if (its.length !== 1) return;
      e.stopPropagation(); e.preventDefault();
      try { pivotDot.setPointerCapture(e.pointerId); } catch (err) { /* 无视 */ }
      pvIt = its[0]; pvBefore = GW.clone(pvIt);
      const base = GW.basePivotOf(pvIt);
      const mv = (ev) => {
        const w = GW.toWorld(ev.clientX, ev.clientY);
        // 靠近图形自己的中心时吸附一下：绕圆心转仍然是最常用的操作
        const tol = 12 / (GW.camera.s || 1);
        if (base && Math.hypot(w.x - base.x, w.y - base.y) < tol) { w.x = base.x; w.y = base.y; }
        GW.setPivot(pvIt, w);
      };
      const up = () => {
        pivotDot.removeEventListener('pointermove', mv);
        pivotDot.removeEventListener('pointerup', up);
        pivotDot.removeEventListener('pointercancel', up);
        if (pvIt && pvBefore && GW.page().ink.indexOf(pvIt) >= 0) GW.commit({ update: [{ before: pvBefore, after: pvIt }] });
        pvIt = null; pvBefore = null;
      };
      pivotDot.addEventListener('pointermove', mv);
      pivotDot.addEventListener('pointerup', up);
      pivotDot.addEventListener('pointercancel', up);
    });
    // 双击旋转中心手柄：收回图形自己的中心（拖歪了不用在画布上抖着找回去）
    pivotDot.addEventListener('dblclick', (e) => {
      e.stopPropagation(); e.preventDefault();
      const its = GW.pivotTargets();
      // WP5：多选双击把组中心收回联合 AABB 中心
      if (its.length > 1) {
        const b = GW.selection.bounds();
        if (b) GW.setGroupPivot({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
        return;
      }
      const one = its[0];
      if (!one) return;
      const before = GW.clone(one);
      GW.setPivot(one, GW.basePivotOf(one));
      GW.commit({ update: [{ before, after: one }] });
    });
    // 「旋转中心」：开关显示 / 隐藏。打开后绕它转（不一定是圆心），关掉退回绕图形中心。
    const pivotBtn = h('button', { style: { display: 'none' }, title: '旋转中心：打开后图形绕这个点旋转，再点一次隐藏（开着时可以把它拖到圆心之外的任意位置）', onclick: () => GW.togglePivot(), html: I('pivot') + '旋转中心' });
    // 「留痕」：把当前图形按半透明虚线再盖一份留在板上；转一点盖一次就是一串轨迹。
    const traceBtn = h('button', { style: { display: 'none' }, title: '留痕：把选中的图形按当前位置盖一个半透明副本（转一点盖一次，学生就看得到扫过的范围）', onclick: () => GW.traceSelection(), html: I('copy') + '留痕' });
    const traceClear = h('button', { style: { display: 'none' }, title: '清除这一页的所有留痕（可撤销）', onclick: () => GW.clearTraces(), html: I('trash') + '清留痕' });
    const lockBtn = h('button', { title: '锁定 / 解锁位置：锁定后可直接在项目上书写，拖动则是平移画布', onclick: () => GW.toggleLockSelection(), html: I('lock') + '锁定' });

    // 「标记」：给选中的手写/内容打一个搜索用的关键词（手写笔迹本身没有文字，标记后才能被搜到）
    const tagBtn = h('button', { title: '给选中内容加标记，之后用 Ctrl+F 搜得到（Ctrl+Shift+L）', onclick: () => GW.search.tagSelection(), html: I('star') + '标记' });
    const tagClear = h('button', { title: '清除选中内容的标记', onclick: () => GW.search.untagSelection(), html: I('trash') });
    // 「参数」：选中正多边形时出现 —— 边数 / 外接圆半径 / 旋转角（桌面原型 shape.js 的三个参数）。
    // 插入后还能继续改，不必删了重画；矩形、三角形、圆、学科模板不显示（GW.ngon.fit 认不出来）。
    const paramBtn = h('button', { title: '调整这个图形的参数（边数 / 半径 / 旋转角，或物理、数学图形、带电粒子的专有参数）', style: { display: 'none' }, onclick: () => { const t = paramTarget(); if (t) return pbPop(paramBtn, t); const n = ngonTarget(); if (n) return ngonPop(paramBtn, n); const s = styleTarget(); if (s) stylePop(paramBtn, s); }, html: I('sliders') + '参数' });
    // 单对象动画控制（原版白板标签栏里的「播放/暂停」「重置」；空格与 R 是全部）
    const animBtn = h('button', { title: '播放 / 暂停这个动画（空格 = 全部播放 / 暂停）', style: { display: 'none' }, onclick: () => { const t = animTarget(); if (!t) return; GW.physShapes.toggleItem(t); syncAnimBtn(t); } });
    const animResetBtn = h('button', { title: '这个动画的时间归零（R = 全部归零）', style: { display: 'none' }, onclick: () => { const t = animTarget(); if (t) GW.physShapes.resetItem(t); } }, h('span', { html: I('rotate') }), h('span', null, '重置'));
    // 播放键的文字跟着「这个动画到底在不在放」变。丢了这一步时按钮是空的，
    // 选中动画图形后标签栏上就只剩「重置」—— probe-physshapes 的 anim-bar-missing 守的就是它。
    const syncAnimBtn = (it) => {
      const on = !!(it && GW.physShapes.itemPlaying(it));
      animBtn.innerHTML = I(on ? 'pause' : 'play') + (on ? '暂停' : '播放');
    };
    // 1.4.0：框选是核心工具 —— 公式识别 / AI 规整 / 板书排版 / 截图都从这里直接调，
    // 不用再去插入菜单里找。AI 类按钮只在「选中的东西里有笔迹」时出现；截图总是出现。
    const aiAct = (name, title, icon, label) => h('button', {
      title: title, onclick: () => { if (GW.ai) GW.ai.act(name); }, html: I(icon) + label,
    });
    const fxBtn = aiAct('formula', '框住手写公式 → 变成可编辑公式（模型在「插入 → AI 助手」里选）', 'formula', '识公式');
    // T01：手写转文字。只在「选区里全是笔迹/图形」时出现（混入文本、公式、图片等对象就隐藏）——
    // 那些东西本来就有字，识别它们只会把版式搅乱。识别结果只写 it.ocr，不改笔迹。
    const txtBtn = aiAct('text', '框住手写 → 识别成可复制文字（只记在笔迹上，搜索能搜到；不改笔迹）', 'text', '转文字');
    const tidyBtn = aiAct('tidy', '框住潦草的图形 / 字迹 → AI 认成规范图形、公式或文字', 'smart', 'AI 规整');
    const layoutBtn = aiAct('layout', '把框选的整块板书转成专业排版（模型在「插入 → AI 助手」里选）', 'text', 'AI 排版');
    const shotBtn = aiAct('shot', '把框选的内容截成图片（也可用课堂工具里的区域截图）', 'camera', '截图');
    // 工具条按「数量 → 常用操作 → 编辑参数 → 颜色 → 删除」排；删除单独隔开，避免手滑
    const delBtn = h('button', { class: 'sb-del', title: '删除选中内容', onclick: () => GW.deleteSelection(), html: I('trash') + '删除' });
    const countEl = h('span', { class: 'sb-count' });
    // 1.6.6（T06）：成组 / 解组。默认隐藏，由 upd() 按选中内容开合 ——
    // 「成组」要 ≥2 项，「解组」要选中的东西里至少一项带 gid。
    const grpBtn = h('button', {
      style: { display: 'none' }, title: '把选中的东西合成一组：之后点其中任何一个都是整组选中、整组移动（Ctrl+G）',
      onclick: () => GW.groupSelection(), html: I('copy') + '成组',
    });
    const ungrpBtn = h('button', {
      style: { display: 'none' }, title: '解散这个组，各项恢复独立（Ctrl+Shift+G）',
      onclick: () => GW.ungroupSelection(), html: I('unlock') + '解组',
    });
    const sep = () => h('div', { class: 'sb-sep' });
    // 1.6.0：低频操作收进「更多」第二行 —— 选中后第一行只留数量、复制、识公式、参数与颜色。
    // 按钮不移出 DOM（探针与快捷键仍可用），只是折叠显示；再次点「更多」或选中消失就收起。
    // 1.6.8（R2/R4）：多选批量改样式 + 对齐分布。都只在「选中 ≥2 项 / 有图形」时由 upd() 显示。
    const batchBtn = (label, title, fn) => h('button', { title, onclick: fn, style: { display: 'none' } }, label);
    const bW2 = batchBtn('细', '选中图形改成 2 号线宽', () => GW.batchStyle({ width: 2 }));
    const bW5 = batchBtn('中', '选中图形改成 5 号线宽', () => GW.batchStyle({ width: 5 }));
    const bW8 = batchBtn('粗', '选中图形改成 8 号线宽', () => GW.batchStyle({ width: 8 }));
    const bDash = batchBtn('虚线', '选中图形改虚线 / 再点改回实线', () => {
      const any = (GW.selection.items || []).find((x) => x.kind === 'shape' && x.dash);
      GW.batchStyle({ dash: any ? 'solid' : 'dashed' });
    });
    // WP6：多选批量填充小面板 —— 与单选 styleCtl 共用 GW.fillFieldsFor 的同一套字段。
    const fillBatchPop = (anchor) => {
      const shapes = selectedItems().filter((x) => x && x.kind === 'shape');
      const f0 = shapes[0] || {};
      const bst = {
        mode: f0.fillMode || (f0.fill ? 'solid' : 'none'),
        color: f0.fillColor || f0.color || '#3366ff',
        alpha: f0.fillAlpha != null ? f0.fillAlpha : 0.18,
        pattern: f0.fillPattern || 'hatch',
        density: f0.fillDensity != null ? f0.fillDensity : 8,
        lineWidth: f0.fillLineWidth != null ? f0.fillLineWidth : 1,
      };
      const mSel = GW.ui.segmented({
        options: [{ value: 'none', label: '无' }, { value: 'solid', label: '纯色' }, { value: 'pattern', label: '图案' }],
        value: bst.mode, onChange: (v) => { bst.mode = v; },
      });
      const cSel = swatches(['#1b2433', '#3366ff', '#e02020', '#0f9d8a', '#f2a541', '#ffffff'], bst.color, (c) => { bst.color = c; });
      const pSel = GW.ui.segmented({
        options: [{ value: 'hatch', label: '斜线' }, { value: 'cross', label: '网格' }, { value: 'dots', label: '点' }, { value: 'h', label: '横' }, { value: 'v', label: '竖' }],
        value: bst.pattern, onChange: (v) => { bst.pattern = v; },
      });
      const aS = GW.ui.slider({ label: '填充浓度', min: 0, max: 100, step: 1, unit: '%', value: Math.round(bst.alpha * 100), onInput: (v) => { bst.alpha = v / 100; } });
      const dS = GW.ui.slider({ label: '图案密度', min: 2, max: 32, step: 1, value: bst.density, onInput: (v) => { bst.density = v; } });
      const lS = GW.ui.slider({ label: '图案线宽', min: 0.5, max: 5, step: 0.5, value: bst.lineWidth, onInput: (v) => { bst.lineWidth = v; } });
      const el = h('div', { style: { width: '248px' } },
        h('h4', null, '批量填充（' + shapes.length + ' 个图形）'),
        h('div', { class: 'gb-sec' }, h('span', { class: 'muted' }, '模式'), mSel.el),
        h('div', { class: 'gb-sec' }, h('span', { class: 'muted' }, '颜色'), cSel),
        h('div', { class: 'gb-sec' }, h('span', { class: 'muted' }, '图案'), pSel.el),
        aS.el, dS.el, lS.el,
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
          h('button', { class: 'gw-btn primary', onclick: () => { GW.batchStyle(GW.fillFieldsFor(bst)); closePop(); } }, '应用')));
      pop(anchor, el, { place: 'bottom' });
    };
    const bFill = batchBtn('填充', '选中图形批量设置填充（模式 / 颜色 / 图案）', () => fillBatchPop(bFill));
    const alBtn = (label, title, mode) => batchBtn(label, title, () => GW.alignSelection(mode));
    const aL = alBtn('左', '左对齐', 'left'), aC = alBtn('中', '水平居中', 'hcenter'), aR = alBtn('右', '右对齐', 'right');
    const aT = alBtn('上', '顶对齐', 'top'), aM = alBtn('中', '垂直居中', 'vcenter'), aB = alBtn('下', '底对齐', 'bottom');
    const dH = batchBtn('横等距', '水平方向等距分布（≥3 项）', () => GW.distributeSelection('h'));
    const dV = batchBtn('竖等距', '垂直方向等距分布（≥3 项）', () => GW.distributeSelection('v'));
    // 1.7.9：取消「更多」折叠，内容全部平铺成常驻第二行。
    // 旧写法里 .sb-row 只有 class 没有 CSS 规则（JS 只写 style.display），默认 display:block，
    // 14 个 display:flex 的按钮是块级盒子 → 各自独占一行，实测堆成 58×462 的竖塔，
    // 再把 flex-basis:100% 的面板撑到 1258×467、整条工具条 1266×557。
    // 现在由 app.css 的 .sb-extra 网格统一排版：13 列 × 28px，批量+对齐+分布正好占满第一行。
    const alignRow = h('div', { class: 'sb-row', style: { display: 'none' } },
      bW2, bW5, bW8, bDash, bFill, aL, aC, aR, aT, aM, aB, dH, dV);
    const actsRow = h('div', { class: 'sb-acts' },
      tidyBtn, layoutBtn, shotBtn,
      pivotBtn, traceBtn, traceClear,
      animBtn, animResetBtn,
      lockBtn, tagBtn, tagClear);
    const extraBox = h('div', { class: 'sb-extra' }, alignRow, actsRow);
    const bar = h('div', { id: 'sel-bar' },
      h('div', { class: 'sb-main' },
        countEl, sep(),
        h('button', { onclick: () => GW.duplicateSelection(), html: I('copy') + '复制' }),
      // 1.3.0（R7）：复制动作已经顺手取样，这里给一个显式入口（老师要「原件复用」时不用记快捷键）
      h('button', {
        title: '把这件（或这几件）原件放进复用架，换文件、换页面都能贴回',
        onclick: () => {
          if (!GW.shelf) return;
          const items = (GW.selection.items || []).map(GW.clone);
          if (!items.length) return;
          GW.shelf.add(items, { kind: 'items' });
          GW.toast('已放进复用架（' + GW.shelf.list().length + '/' + GW.shelf.MAX + '）');
        },
        html: I('shelf') + '取样',
      }),
      sep(),
      grpBtn,
      ungrpBtn,
      sep(),
      fxBtn,
      txtBtn,
      paramBtn,
      sep(),
      ['#1b2433', '#e4572e', '#3366ff', '#0f9d8a', '#f2a541', '#ffffff'].map((c) => h('button', { class: 'c', style: { background: c }, onclick: () => GW.recolorSelection(c) })),
      // 1.1.9：参数面板里那个「颜色」撤掉之后，这里补一个自定义取色 —— 老师想用什么色就用什么色。
      h('label', { class: 'c c-pick', title: '自定义颜色' }, h('input', { type: 'color', oninput: (e) => GW.recolorSelection(e.target.value) })),
        sep(), delBtn),
      // 第二行是 #sel-bar 的独立第二段（纵向两段式）：宽度不再参与首行的 max-content，也就没有循环依赖。
      extraBox);
    box.append(...handles);
    // 工具条单独挂在 body：挂在 #sel-ui 里会跟着虚线框一起旋转，按钮排成斜的。
    // 1.6.4（GoodNotes 式）：首 / 中 / 尾三个点都能拖 —— 曲线三个点、直线只有首尾两个。
    // 与 #pv-ui 一样单独挂 body：它们按屏幕坐标定位，不能跟着虚线框一起旋转。
    const ptDots = ['start', 'mid1', 'end'].map((k) => {
      const d = h('div', {
        class: 'pd ' + k, style: { display: 'none' },
        title: k === 'start' ? '拖动起点：整条线跟着平滑调整'
          : k === 'end' ? '拖动末端：整条线跟着平滑调整（长度、角度都随手指）'
            : '拖动中段：整条曲线平滑微调，两端点不动',
      });
      d.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        try { d.setPointerCapture(e.pointerId); } catch (err) { /* 无视 */ }
        const st = {};
        if (!GW.curveEditBegin || !GW.curveEditBegin(st, e, k)) return;
        const mv = (ev) => { if (st.move) st.move(ev); };
        const up = () => {
          d.removeEventListener('pointermove', mv);
          d.removeEventListener('pointerup', up);
          d.removeEventListener('pointercancel', up);
          if (st.up) st.up();
        };
        d.addEventListener('pointermove', mv);
        d.addEventListener('pointerup', up);
        d.addEventListener('pointercancel', up);
      });
      return d;
    });
    const ptBox = h('div', { id: 'pt-ui', style: { display: 'none' } }, ...ptDots);
    document.body.append(box, bar, pivotDot, ptBox);
    const upd = () => {
      const b = GW.selection.displayBounds();
      if (!b || GW.tool.current !== 'select') {
        box.style.display = 'none'; bar.style.display = 'none'; pivotDot.style.display = 'none'
        ptBox.style.display = 'none';
        return;
      }
      // WP5：所有按钮显隐收敛到唯一纯函数 GW.selBarVisibility（单选 / 多选 / ≥3 / 混合四情形一致）。
      const pvIts = GW.pivotTargets ? GW.pivotTargets() : [];
      const vis = GW.selBarVisibility({
        items: selectedItems(),
        pvIts,
        pageTraces: (GW.pageTraces ? GW.pageTraces() : []),
        singleParam: !!(ngonTarget() || paramTarget() || styleTarget()),
        singleAnim: !!animTarget(),
        pivotOn: (GW.pivotOn ? GW.pivotOn() : false),
      });
      countEl.textContent = selectedItems().length + ' 项';
      grpBtn.style.display = vis.grpBtn ? '' : 'none';
      ungrpBtn.style.display = vis.ungrpBtn ? '' : 'none';
      if (alignRow) alignRow.style.display = vis.alignRow ? '' : 'none';
      [bW2, bW5, bW8, bDash, bFill].forEach((b) => (b.style.display = vis.batchBtns ? '' : 'none'));
      [aL, aC, aR, aT, aM, aB].forEach((b) => (b.style.display = vis.alignBtns ? '' : 'none'));
      dH.style.display = dV.style.display = vis.distBtns ? '' : 'none';
      [fxBtn, tidyBtn, layoutBtn].forEach((b) => (b.style.display = vis.fxGrp ? '' : 'none'));
      txtBtn.style.display = vis.txtBtn ? '' : 'none';
      const a = GW.toScreen(b.x, b.y), c = GW.toScreen(b.x + b.w, b.y + b.h);
      // ★ 墨迹项目四面都不外扩：画布上还画着一圈贴着包围盒的高亮描边（input.js 选区 live 层，
      //   lineWidth = 1/camera.s），这里再外扩 6px，选中后就同时看到两个框、差 6px，
      //   拖动时更像「图形边框和虚线框错位」（反馈 2.7）。两者对齐到同一个 bbox。
      //   对象卡片（kind:'obj'）是例外：它没有 live 高亮（对象用 .obj.active 的描边），
      //   但标题栏与缩放手柄画在盒子外面，所以那两块的尺寸由 displayBounds() 补进框里。
      // 1.6.2 反馈：框贴着线条时，角上的缩放手柄和线本身只差几个像素，一按就抓错。
      // 墨迹类（非对象卡片）多留 8px 边距 —— 只是虚线框与手柄的位置，不影响 bbox 与缩放算法。
      const PAD = 8;
      // 只给「线条类」（手写笔迹 / poly 直线曲线）加边距：尺规、数学物理图形、卡片仍贴包围盒，
      // 那些图形的角上手柄本来就不与内容重叠（probe-geo 也断言过贴着包围盒）。
      const oneIt = GW.selection.items.length === 1 ? GW.selection.items[0] : null;
      // 只有「开放线条」才扩边：手写笔迹、直线/开放曲线。闭合多边形的角手柄本来就落在描边上，
      // 再外扩会与画布上那圈贴着 bbox 的高亮框错位（probe-geo / probe-sel-fit 都盯着这一点）。
      const padOk = !!(oneIt && oneIt.kind !== 'obj' && (oneIt.kind === 'stroke' || (oneIt.type === 'poly' && !oneIt.closed)));
      const pad = padOk ? PAD : 0;
      Object.assign(box.style, { display: '', left: (a.x - pad) + 'px', top: (a.y - pad) + 'px', width: (c.x - a.x + pad * 2) + 'px', height: (c.y - a.y + pad * 2) + 'px' });
      // 单选图形旋转后，虚线框要跟着转（不是轴对齐的大盒子）。
      // 墨迹形状（poly/arrow/axes/multi/stroke）用最小面积矩形：转 45° 的三角形、斜着的手写笔迹
      // 用 AABB 会大出大半圈白边，而「把转之前的框整体转过去」对细长斜线反而更大。
      const one = GW.selection.items.length === 1 ? GW.selection.items[0] : null;
      const mb = one && one.kind !== 'obj' ? GW.minBox(one) : null;
      const oneRot = mb ? mb.rot : (one ? ((one.type === 'ms' || one.type === 'pb') ? (one.rot || 0) : (one._rot || 0)) : 0);
      if (mb) {
        const mw = mb.w * GW.camera.s, mh = mb.h * GW.camera.s;
        const mid = GW.toScreen(mb.cx, mb.cy);
        const pw = mw + (padOk ? PAD * 2 : 0), ph = mh + (padOk ? PAD * 2 : 0);
        Object.assign(box.style, {
          left: (mid.x - pw / 2) + 'px', top: (mid.y - ph / 2) + 'px',
          width: pw + 'px', height: ph + 'px', transformOrigin: '50% 50%',
          transform: `rotate(${oneRot}rad)`,
        });
      } else if (one && oneRot) {
        const boxy = one.type === 'ms' || one.type === 'pb';
        // 数学图形转起来时也要贴着内容走：用 MS.localBox（曲线真实范围）而不是整框，
        // 否则旋转一个指数函数，虚线框会连下半屏的空白一起转。
        let bw, bh, mid;
        if (one.type === 'pb' && GW.physShapes && GW.physShapes.measure) {
          // 物理图形旋转后同样要贴着内容：用「量尺」跑出来的**未旋转内容框**（P.measure），
          // 而不是用户框 |x2-x1|×|y2-y1| —— 很多图形画不满自己的框（斜面、单摆、透镜…），
          // 拿整框转过去虚线框会比图形大出一圈白边。旋转中心仍是整框中心（P.draw 绕它转），
          // 所以内容框中心也要绕框心转过去，否则转角一大就飘出去。
          const lb = GW.physShapes.measure(one);
          bw = lb.w * GW.camera.s; bh = lb.h * GW.camera.s;
          const c0 = Math.cos(oneRot), s0 = Math.sin(oneRot);
          // 旋转中心打开时绕它转（磁场的圆常常绕圆心外的一点转），否则仍是框心
          const pv = GW.pivotOf(one);
          const fcx = pv ? pv.x : (one.x1 + one.x2) / 2, fcy = pv ? pv.y : (one.y1 + one.y2) / 2;
          const dx = lb.x + lb.w / 2 - fcx, dy = lb.y + lb.h / 2 - fcy;
          mid = GW.toScreen(fcx + dx * c0 - dy * s0, fcy + dx * s0 + dy * c0);
        } else if (one.type === 'ms' && GW.mathShapes && GW.mathShapes.localBox) {
          const lb = GW.mathShapes.localBox(one);
          bw = lb.w * GW.camera.s; bh = lb.h * GW.camera.s;
          // 旋转中心是**整框中心**（mathshapes.js applyFrame 绕它转），
          // 内容框中心一般不在框心，所以要把内容框中心也绕框心转过去，否则转角一大就飘出去。
          // 打开「旋转中心」后绕老师指定的点转，这里跟着同一个点算。
          const c0 = Math.cos(oneRot), s0 = Math.sin(oneRot);
          const pv = GW.pivotOf(one);
          const fcx = pv ? pv.x : (one.x1 + one.x2) / 2, fcy = pv ? pv.y : (one.y1 + one.y2) / 2;
          const dx = lb.x + lb.w / 2 - fcx, dy = lb.y + lb.h / 2 - fcy;
          mid = GW.toScreen(fcx + dx * c0 - dy * s0, fcy + dx * s0 + dy * c0);
        } else {
          bw = (boxy ? Math.abs(one.x2 - one.x1) : (one._rw || b.w)) * GW.camera.s;
          bh = (boxy ? Math.abs(one.y2 - one.y1) : (one._rh || b.h)) * GW.camera.s;
          mid = GW.toScreen(b.x + b.w / 2, b.y + b.h / 2);
        }
        const pw2 = bw + (padOk ? PAD * 2 : 0), ph2 = bh + (padOk ? PAD * 2 : 0);
        Object.assign(box.style, {
          left: (mid.x - pw2 / 2) + 'px', top: (mid.y - ph2 / 2) + 'px',
          width: pw2 + 'px', height: ph2 + 'px', transformOrigin: '50% 50%',
          transform: `rotate(${oneRot}rad)`,
        });
        // 工具条单独定位（见上），这里不用再抵消旋转。
      } else {
        box.style.transform = ''; box.style.transformOrigin = '';
      }
      // WP5：旋转中心点统一由 GW.activePivot() 提供 —— 单选 = 对象自己的 pv，多选 = 组中心。
      const pvPt = GW.activePivot ? GW.activePivot() : null;
      const pvScr = pvPt ? GW.toScreen(pvPt.x, pvPt.y) : null;
      bar.style.display = '';
      const bw = bar.offsetWidth || 420;
      bar.style.left = Math.max(bw / 2 + 8, Math.min(innerWidth - bw / 2 - 8, (a.x + c.x) / 2)) + 'px';
      // 老师反馈「下面的图形参数设定太靠近图形，挡住了旋转的位置」：旋转中心在图形下半边时，
      // 整条工具条翻到图形**上方**去，别跟那个点抢位置。（a 是左上角、c 是右下角，都是屏幕点）
      const bh = bar.offsetHeight || 40;
      // 1.3.0（R1）：四向旋转钮中心在框外 78px（钮半径 13 + 连杆），工具条必须整条
      // 退到钮外侧（96 = 78 + 13 + 5），否则低一点的那颗钮正好被 z-index 更高的 bar 盖住。
      // 上下都放得下时优先放在留白更大的一侧；旋转中心在下方时仍翻到上方（原有避让）。
      const upRoom = a.y - 96 - bh, downRoom = innerHeight - c.y - 96 - bh;
      const upFirst = (pvScr && pvScr.y > (a.y + c.y) / 2) ? true : upRoom >= downRoom;
      bar.style.top = Math.max(8, Math.min(innerHeight - bh - 8, upFirst ? a.y - 96 - bh : c.y + 96)) + 'px';
      bar.style.transform = 'translateX(-50%)';
      // 只选中了锁定的对象时，缩放 / 旋转手柄没有意义，隐藏掉，免得老师以为「锁了还能拖」
      const objs = GW.selection.items.filter((i) => i.kind === 'obj');
      const allLocked = objs.length > 0 && objs.every((o) => o.locked);
      for (const el of handles) el.style.display = allLocked ? 'none' : '';
      paramBtn.style.display = vis.paramBtn ? '' : 'none';
      const at = animTarget();
      animBtn.style.display = animResetBtn.style.display = vis.animBtn ? '' : 'none';
      if (vis.animBtn && at) syncAnimBtn(at);
      lockBtn.innerHTML = I(objs.length && objs.every((o) => o.locked) ? 'unlock' : 'lock') + (objs.length && objs.every((o) => o.locked) ? '解锁' : '锁定');
      lockBtn.disabled = !objs.length;
      lockBtn.style.opacity = objs.length ? '' : '.5';
      // WP5：旋转中心开关 / 手柄、留痕按钮统一由 selBarVisibility 决定（放开 pvCan 的单选限制）
      pivotBtn.style.display = vis.pivotBtn ? '' : 'none';
      pivotBtn.classList.toggle('on', !!vis.pivotDot);
      // 留痕：能把任何非对象条目盖成副本；「清留痕」只在这一页真有留痕时出现
      traceBtn.style.display = vis.traceBtn ? '' : 'none';
      traceClear.style.display = vis.traceClear ? '' : 'none';
      if (vis.pivotDot && pvPt) {
        const sp = GW.toScreen(pvPt.x, pvPt.y);
        pivotDot.style.display = '';
        pivotDot.style.left = sp.x + 'px';
        pivotDot.style.top = sp.y + 'px';
      } else pivotDot.style.display = 'none';
      // 1.6.3 曲线塑形点：只有「点列就是几何本身」的单条线/曲线才给手柄
      // （旋转过的图形、对象卡片、文字/图片都不参与，见 input.js 的 curveTarget）。
      const ch = GW.curveEditHandles ? GW.curveEditHandles() : null;
      if (ch) {
        for (const d of ptDots) d.style.display = 'none';
        const put = (el, p) => { el.style.display = ''; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; };
        if (ch.endpoints) put(ptDots[0], ch.start);
        if (ch.mids && ch.mids.length) put(ptDots[1], ch.mids[0]);
        if (ch.endpoints) put(ptDots[2], ch.end);
        ptBox.style.display = '';
      } else ptBox.style.display = 'none';
      // 第二行的列数跟着「实际可见按钮数」走：单选时动作项只剩 6~8 个，
      // 若还按 13 列排，右边会空出一大片（+ 整条工具条无谓地变宽）。
      // 上限按窗口宽度给：≥1000 用 13 列（样式/对齐/分布正好一行），700 以上 7 列，再窄 5 列。
      const fitCols = (n, cap) => Math.max(1, Math.min(cap, innerWidth >= 1000 ? 13 : innerWidth >= 700 ? 7 : 5, n));
      const visCount = (box) => [...box.children].filter((el) => el.style.display !== 'none').length;
      const setCols = (box, n, cap) => {
        box.style.display = n ? '' : 'none';
        const cols = fitCols(n, cap);
        if (box._cols !== cols) { box._cols = cols; box.style.gridTemplateColumns = 'repeat(' + cols + ', max-content)'; }
      };
      // 批量/对齐那一组整体显隐由 vis.alignRow 说了算（子按钮的 display 是独立算的，不能拿来当整组的开关）。
      if (vis.alignRow) setCols(alignRow, visCount(alignRow), 13);
      else { alignRow.style.display = 'none'; alignRow._cols = 0; }
      const nActs = actsRow ? visCount(actsRow) : 0;
      if (actsRow) setCols(actsRow, nActs, 8);
      extraBox.style.display = (vis.alignRow && visCount(alignRow)) || nActs ? '' : 'none';
    };
    GW.bus.on('selection', upd); GW.bus.on('rendered', upd); GW.bus.on('tool', upd);
  }

  // =============== 界面外壳（四角 + 底部工具栏）的显隐 ===============
  // 上课时这些控件会压住板书、正好落在手边。默认**全部收起**，
  // 由悬浮球的开合统一控制：点开球 ⇒ 出现；收起球 ⇒ 连四角一起消失。
  // 想让工具栏常显的，用悬浮球里的「常显」锁定（记在设置里，默认关）。
  // 用 body 上的一个类驱动，纯 CSS 过渡，不触发重排。
  let chromeOn = null;
  // force=true 表示「用户刚刚亲手点的」：绕过「常显锁定」与「演示模式必须收起」这两条自动策略。
  // 起因：批注层（overlay）的工具栏里就有「界面」按钮，而批注态默认把常显锁着，
  // 于是那个按钮按下去 on 恒为 true、与当前值相同直接 early-return —— 一个点了没反应的死按钮。
  // 锁定表达的是默认值，不该否决用户的显式动作；自动路径（启动、进演示）仍走 force=false。
  function setChrome(on, force) {
    on = force ? !!on : (!PRES.on && (!!on || !!GW.settings.chromePinned));
    if (chromeOn === on) return;
    chromeOn = on;
    document.body.classList.toggle('chrome-off', !on);
    updGear();
  }
  // 截图脚本 / 探针用：想拍带工具栏的界面就先调 GW.setChrome(true)
  GW.setChrome = setChrome;
  /* 任务书 §3.2（PPT-UI）：放映期间的「常显」是**另一个状态**。
   * 改前浮球里的「常显」直接翻转 GW.settings.chromePinned —— 那是**整块画布**的外壳偏好，
   * 而放映期间外壳是强制收起的（setChrome 在 PRES.on 时被短路），于是：
   *   · 放映里按「常显」没有任何即时效果（球的高亮变了，浮层照样 3 秒淡出）；
   *   · 退出放映后画布外壳被放映里的选择带跑（老师并没打算改画布偏好）。
   * 现在拆成两份：放映内只读写 showPin，它只控制放映自己的浮层（模式钮/左右竖栏/退出）；
   * 退出放映后浮球与外壳按 GW.settings.chromePinned 原来的语义工作。
   * 「本次进程内放映间复用」——不写设置、不落盘，首次进入用现有自动淡出默认（未选过 = 不常显）。 */
  const showPin = { v: null };                       // null：本次进程还没在放映里选过
  const inShow = () => document.body.classList.contains('slide-on');
  GW.showChrome = {
    inShow,
    chosen: () => showPin.v !== null,
    pinned: () => (inShow() ? showPin.v === true : !!GW.settings.chromePinned),
    set(v) {
      showPin.v = !!v;
      document.body.classList.toggle('show-pin', inShow() && showPin.v);
      if (GW.pptx && GW.pptx.slide && GW.pptx.slide.syncChrome) GW.pptx.slide.syncChrome();
    },
    toggle() { GW.showChrome.set(!GW.showChrome.pinned()); },
    // 进/出放映：进入时若本次进程还没选过，就按「自动淡出」默认（false）起算。
    enter() { document.body.classList.toggle('show-pin', showPin.v === true); },
    leave() { document.body.classList.remove('show-pin'); },
  };
  // 1.4.3：开机默认是否展开三条栏。
  //   手机（短边 < 560）只留一个悬浮球 —— 三条栏在小屏上一开就占掉底部 1/3，新用户第一眼
  //   看到的是按钮而不是画布；平板与桌面触摸设备保持 1.3.1 的结论（默认展开，否则找不到入口）；
  //   鼠标设备收起。
  GW.isTouchUI = function () {
    return !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0;
  };
  GW.chromeDefault = function () {
    const touch = GW.isTouchUI();
    return !!touch && Math.min(innerWidth, innerHeight) >= 560;
  };
  // 启动之后再变视口（旋转屏 / 平板分屏 / CDP 模拟）也要跟着规则走；但用户点过「常显」就别抢。
  // 只在「规则结论翻面」时动手，避免每一次 resize 都把老师手动展开的界面收回去。
  let chromeAuto = null;
  GW.autoChrome = function () {
    if (GW.settings.chromePinned) return;
    const want = GW.chromeDefault();
    if (want === chromeAuto) return;
    chromeAuto = want;
    setChrome(want);
    if (GW.placeDefaultBall && !GW.settings.ballPos) GW.placeDefaultBall(false);
  };
  GW.chromeOn = () => !!chromeOn;

  // =============== 悬浮球 ===============
  function buildBall() {
    const core = h('div', { class: 'core', html: GW.LOGO });
    const ball = h('div', { id: 'ball', class: 'idle' }, core);
    // 1.1.10：顶部同样要躲 —— 键盘弹出 / 网页端在 Safari 里滚动时，fixed 的顶栏会被
    // 1.4.4（R4）：球外面改成**两层扇环**（内环 10 项、外环 3 个子功能），零缝隙。
    // 为什么不能继续用「圆形按钮摆一圈」：球半径 32、10 个按钮要相切 ⇒ 直径只有 28.6px，
    // 比触摸下限还小；实测半径 104 的圆周上 58px 按钮之间必留 7.3px 缝，球与按钮之间还有 43px 空环。
    // 扇环天然 100% 密铺：内环 32→96 十等分（每份 36°）、外环 96→158 只展开被点扇区（36° 里再分 3 份）。
    const R_IN = 32;      // ＝球半径：球和环之间零缝
    const R_MID = 96;     // 内环外径 ＝ 外环内径：两环之间零缝
    // 2.2.3（R4 方案 A）：外径不再是常量。默认档（'sector'）仍是 158，与 2.2.2 逐像素相同；
    // 全展开档（'all'）要把 10 项 × 3 格共 30 格同时铺开，而 12° 一格在 r=127 上只有 26.6px
    // 弧长，塞不进 44px 触摸下限 —— 按 r·12° = 44px 反解得 r ≥ 210，取 214（靠内那圈仍窄，
    // 所以命中判定改成「离哪一格中心最近」，见 hitRing）。
    const R_SECTOR = 158;    // 扇形档外径（默认，零回归）
    const R_ALL = 214;       // 全展开档外径
    const C = R_ALL;         // 画布原点恒在 428×428 的正中心：换档只改「画到哪一圈」，坐标原点不动
    const BOX = R_ALL * 2;
    // 当前档位的外径。drawRing() 每次重画前先按档位与视口算一次，其他所有几何都读 outR。
    let outR = R_SECTOR;
    const NS = 'http://www.w3.org/2000/svg';
    const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    // 扇环路径（角度用「屏幕坐标」，0° 指向 +x、顺时针为正）：外弧顺时针、内弧逆时针，闭合即一块无缝环带
    const arcPath = (r0, r1, a0, a1) => {
      const P = (r, a) => [(C + Math.cos(a) * r).toFixed(2), (C + Math.sin(a) * r).toFixed(2)];
      const [x0, y0] = P(r0, a0), [x1, y1] = P(r0, a1), [x2, y2] = P(r1, a1), [x3, y3] = P(r1, a0);
      return 'M ' + x0 + ' ' + y0 + ' A ' + r0 + ' ' + r0 + ' 0 0 1 ' + x1 + ' ' + y1 +
        ' L ' + x2 + ' ' + y2 + ' A ' + r1 + ' ' + r1 + ' 0 0 0 ' + x3 + ' ' + y3 + ' Z';
    };
    const svg1 = sv('svg', { class: 'ring1', width: BOX, height: BOX, viewBox: '0 0 ' + BOX + ' ' + BOX });
    const svg2 = sv('svg', { class: 'ring2', width: BOX, height: BOX, viewBox: '0 0 ' + BOX + ' ' + BOX });
    const icoLayer = h('div', { class: 'ring-ico' });
    // 1.4.5（R4 修复）：命中要能被浏览器真实命中。`#ball` 自身只有 64×64，扇环画在 316×316 的
    // SVG 里且 pointer-events:none —— 手指落在环上时，事件根本到不了 ball 的监听（都给了
    // 下面的 #capture），表现就是「球能打开、里面一个都点不动」。探针原来是直接
    // dispatchEvent 到 ball 上，绕过了命中测试，所以一直是绿的。
    // 这里补一层透明的圆形命中层：只有展开时才 pointer-events:auto，圆角裁掉方角，
    // 放在 core 之后（prepend）保证球心区域仍归 core 拖动。
    const hitLayer = h('div', { class: 'ring-hit' });
    // 2.2.3（R4）：三层的尺寸与负边距仍写在 CSS 里（316px / -158px），但那一套是按 158 外径硬编码的；
    // 现在画布原点恒在 214 的正中心（BOX=428），所以这里按 BOX 覆盖一次 —— 只改这一处，
    // CSS 保持原样（probe-ball-ring2.js 量的是 SVG 里的 path 圆心，不读 CSS 宽高）。
    const ringBox = { width: BOX + 'px', height: BOX + 'px', margin: (-C) + 'px 0 0 ' + (-C) + 'px' };
    for (const el of [hitLayer, svg1, svg2]) Object.assign(el.style, ringBox);
    ball.prepend(hitLayer);
    ball.append(svg1, svg2, icoLayer);
    document.body.append(ball);

    // 1.4.3：手机上默认把球放在正中间 —— 首次安装只留一个球，新手引导第一步要指它，
    // 放在右下角时引导卡片（接近满屏宽）只能往左边排，反而把它挤出屏幕、点不到「下一步」。
    // 1.1.1：只有「触摸设备 且 短边 < 560」才居中；桌面永远是右下侧，不能因为启动那一帧
    // 视口还没定下来就把球摆到中间（用户实测「桌面端每次打开都在正中间」）。
    const isPhone = () => GW.isTouchUI && GW.isTouchUI() && Math.min(innerWidth, innerHeight) < 560;
    // 1.1.2：桌面端启动时窗口还是「桌面尺寸」甚至还没套用保存的窗口大小，
    // 用 innerWidth 算出来的右侧位置可能是负数，被夹到 6 之后球就停在左上角挡住菜单；
    // 等窗口真正定下来再算一次，位置又「瞬移」。所以默认位置一律按**当前视口**算，
    // 视口还没定（< 240）就先不画，下一帧再来 —— 不再把负数夹成左上角。
    const vp = () => (GW.viewSize ? GW.viewSize() : { w: innerWidth, h: innerHeight });
    const centerPos = () => ({ x: Math.round((vp().w - 64) / 2), y: Math.round((vp().h - 64) / 2) });
    // 2.2.4：全展开档要留出整环 428px 的净空（2.2.9 起它不再是出厂默认，选了 all 才走这条）。以前固定贴右 100px，
    // 球心离右边只剩 68px，一展开半个环在屏外（靠边还会退化成 5 个扇区、只剩 15 格）。
    // 视口装得下整环时，默认位置就放在「右边留够安全边、纵向居中」的地方。
    const sidePos = () => {
      const v = vp();
      if ((GW.settings.ballOpen || 'sector') === 'all' && v.w >= R_ALL * 2 + 40 && v.h >= R_ALL * 2 + 40) {
        return { x: Math.round(v.w - (R_ALL + 8) - 8 - 32), y: Math.round((v.h - 64) / 2) };
      }
      return { x: v.w - 100, y: Math.round(v.h * 0.45) };
    };
    // 早先手机版把这个「居中」当成默认值存进了 settings.ballPos；桌面端读到它就一直居中。
    // 桌面端碰到「正好是正中」的存档，按旧默认处理，不认。
    const saved = GW.settings.ballPos;
    const c0 = centerPos();
    const savedCentered = saved && Math.abs(saved.x - c0.x) < 4 && Math.abs(saved.y - c0.y) < 4;
    let dragged = !!(saved && !(savedCentered && !isPhone()));
    const pos = dragged ? Object.assign({}, saved) : (isPhone() ? centerPos() : sidePos());
    const place = () => {
      const v = vp();
      if (v.w < 240 || v.h < 240) return;   // 视口还没定下来：先不画，等下一帧
      if (!dragged) { const p = isPhone() ? centerPos() : sidePos(); pos.x = p.x; pos.y = p.y; }
      else {
        // 存档是在别的视口下存的（换了显示器/窗口变小/早期版本存歪了）：
        // 夹紧后若偏离超过 2px，说明它本来就在屏外，按默认规则重来，别硬塞左上角。
        const cx = GW.clamp(pos.x, 6, v.w - 70), cy = GW.clamp(pos.y, 6, v.h - 70);
        if (Math.abs(cx - pos.x) > 2 || Math.abs(cy - pos.y) > 2) {
          dragged = false;
          const p = isPhone() ? centerPos() : sidePos();
          pos.x = p.x; pos.y = p.y;
        }
      }
      ball.style.left = Math.max(0, Math.min(pos.x, vp().w - 64)) + 'px';
      ball.style.top = Math.max(0, Math.min(pos.y, vp().h - 64)) + 'px';
    };
    // 启动那一帧视口可能只有 0，连续补几帧直到拿到真实尺寸
    let tries = 0;
    const kick = () => { place(); if (vp().w < 240 && tries++ < 30) requestAnimationFrame(kick); };
    kick();
    // 启动时窗口还是桌面尺寸，手机视口（GW_DEVICE / 安卓 WebView 渲染完成后）才变小：
    // 球的「默认位置」要按最终视口重算一次。用户自己拖过的不重排，那是他的选择。
    GW.placeDefaultBall = (force) => {
      if (force) dragged = false;
      if (dragged) return;
      place();
    };
    addEventListener('resize', () => {
      // 没拖过的球跟着「默认位置规则」走；拖过的只做边界夹紧（place 里统一处理）
      place();
      layoutRing(ball.classList.contains('open'));
    });
    let idleT = 0;
    const wake = () => { ball.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => { if (!ball.classList.contains('open')) ball.classList.add('idle'); }, 3500); };

    // ---------- 内环 10 项 + 外环 30 格子功能（1.3.1 R5，2026-10-31） ----------
    // 内环 10 项与 1.4.3 一致（顺序没动）。点内环哪一项，外环就从那一格起、顺时针把这一项的
    // 子功能铺满整圈（10 扇区 × 3 格 = 30 格），常用项排在前面、离手指最近；不足 30 个的后面留空描边。
    const T = () => GW.classTools;
    // §3.3：改前这里传 null，凡是「需要一个锚点才能定位」的面板（笔色/粗细、形状、背景…）
    // 从球上点开时都拿不到锚点 —— 要么不弹、要么弹到屏幕左上角。锚点统一用**可见的球芯**。
    const dockRun = (id) => { const d = dockMeta[id]; if (d) d.onClick(ball); };
    const pickPen = () => { if (GW.tool.current !== 'pen') GW.tool.set('pen'); };
    const setPenColor = (c) => { pickPen(); GW.tool.pen.color = c; GW.settings.penColor = c; GW.saveSettings(); GW.bus.emit('pen'); };
    const setPenWidth = (w) => { pickPen(); GW.tool.pen.width = w; GW.settings.penWidth = w; GW.saveSettings(); GW.bus.emit('pen'); };
    // 1.6.6（T08）：键盘 1–5 / [ ] 要能改笔宽，而 setPenWidth 原本是这一层里的局部函数。
    // 挂到 GW 上给 input.js 用；**不带 pickPen** —— 面板里点粗细是「顺手切到笔」，
    // 而键盘改宽度只是调粗细，正在用橡皮/选择时不该被悄悄换成笔。
    GW.setPenWidth = (w) => { GW.tool.pen.width = w; GW.settings.penWidth = w; GW.saveSettings(); GW.bus.emit('pen'); };
    const setPenStyle = (k) => { pickPen(); GW.tool.pen.style = k; GW.settings.penStyle = k; GW.saveSettings(); GW.bus.emit('pen'); };
    // 2.2.3（R1）：工具栏的「值类动作」（笔色 · 正红 / 粗细 · 5px / 线型 · 虚线 / 笔种 · 钢笔）
    // 要一步把事情办完，可这几个 setter 都是 buildBall 里的局部函数。挂到 GW 上给 runDockAction 用：
    // 注意 GW.setPenWidth（上面那个）是键盘 1–5 专用的「只改粗细、不切笔」，这里另起 setPenWidthPick
    // ——按钮的语义一直是「顺手把笔切过来」。两个名字不同，谁都别改谁。
    GW.pickPen = pickPen;
    GW.setPenColor = setPenColor;
    GW.setPenStyle = setPenStyle;
    GW.setPenWidthPick = setPenWidth;
    // 笔种的落盘与 penStyleGrid 的 onclick 逐行同义（settings.penInk + 老字段 brush/penMode + emit + toast），
    // 只是不再依赖面板 DOM（工具栏按钮点它时面板根本没打开）。
    GW.setPenInk = (id) => {
      const IS = GW.inkStyle;
      if (!IS || !IS.has(id)) return false;
      GW.settings.penInk = id;
      GW.settings.brush = id === 'pencil' ? 'pencil' : id === 'marker' ? 'marker' : 'pen';
      GW.tool.pen.mode = id === 'brush' ? 'brush' : 'pen';
      GW.settings.penMode = GW.tool.pen.mode;
      GW.saveSettings();
      GW.bus.emit('pen');
      GW.toast('笔种：' + IS.of(id).label, 2200);
      return true;
    };
    // 笔：12 色（COLORS）→ 5 档粗细（WIDTHS）→ 3 种线型 → 荧光笔 / 更多颜色 = 22 格
    const penSubs = [].concat(
      COLORS.map((c, i) => ({ icon: 'pen', sw: c, label: (i === 0 ? '黑色' : i === 1 ? '白色' : '颜色 ' + (i + 1)), fn: () => setPenColor(c), on: () => GW.tool.pen.color === c })),
      // 粗细/线型不用文字：格子太窄，直接画出「多粗的线」「什么线型」，一眼分得清
      WIDTHS.map((w) => ({ kind: 'width', w: w, label: '粗细 ' + w, fn: () => setPenWidth(w), on: () => GW.tool.pen.width === w })),
      [['solid', '实线', ''], ['dashed', '虚线', '5 4'], ['dotted', '点线', '1 3']].map(([k, label, da]) => ({ kind: 'style', da: da, label: label, fn: () => setPenStyle(k), on: () => GW.tool.pen.style === k })),
      [{ icon: 'highlighter', label: '荧光笔', fn: () => GW.tool.set('hl') }, { icon: 'settings', label: '更多颜色', fn: () => ballColors() }]
    );
    const items = [
      { key: 'pen', icon: 'pen', label: '笔', fn: () => { if (GW.tool.current === 'pen') ballColors(); else GW.tool.set('pen'); }, subs: penSubs },
      { key: 'eraser', icon: 'eraser', label: '橡皮', fn: () => GW.tool.set('eraser'),
        subs: [
          { icon: 'eraser', label: '笔迹橡皮', fn: () => GW.tool.set('eraser'), on: () => GW.tool.current === 'eraser' },
          { icon: 'undo', label: '撤销', fn: () => GW.undo() },
          { icon: 'redo', label: '重做', fn: () => GW.redo() },
          { icon: 'trash', label: '清空画布', fn: () => GW.slideClear() },
          { icon: 'save', label: '自动备份', fn: () => GW.storage.save() },
          { icon: 'pages', label: '页面管理', fn: () => pagesDrawer() },
        ] },
      { key: 'hand', icon: 'hand', label: '交互', fn: () => GW.tool.set('hand'),
        subs: [
          { icon: 'hand', label: '交互', fn: () => GW.tool.set('hand'), on: () => GW.tool.current === 'hand' },
          { icon: 'select', label: '选择', fn: () => GW.tool.set('select'), on: () => GW.tool.current === 'select' },
          { icon: 'fit', label: '适应内容', fn: () => GW.fitContent() },
          { icon: 'chevronL', label: '上一页', fn: () => GW.gotoPage(GW.doc.cur - 1) },
          { icon: 'chevronR', label: '下一页', fn: () => GW.gotoPage(GW.doc.cur + 1) },
          { icon: 'plus', label: '新建页面', fn: () => GW.addPage() },
          { icon: 'pages', label: '页面管理', fn: () => pagesDrawer() },
          { icon: 'export', label: '导出图片', fn: () => GW.storage.exportView() },
          { icon: 'bg', label: '背景与底纹', fn: () => bgPop(ball) },
        ] },
      { key: 'undo', icon: 'undo', label: '撤销', fn: () => GW.undo(),
        subs: [
          { icon: 'undo', label: '撤销', fn: () => GW.undo() },
          { icon: 'redo', label: '重做', fn: () => GW.redo() },
          { icon: 'undo', label: '撤销 5 步', fn: () => { for (let i = 0; i < 5; i++) GW.undo(); } },
          { icon: 'save', label: '保存', fn: () => GW.storage.save() },
          { icon: 'copy', label: '另存为', fn: () => GW.storage.save(true) },
          { icon: 'export', label: '导出 SVG/PDF', fn: () => GW.exporter.open() },
          { icon: 'refresh', label: '恢复备份', fn: async () => { if (await GW.storage.restore()) GW.toast('已恢复上次自动备份'); else GW.toast('没有自动备份'); } },
        ] },
      { key: 'laser', icon: 'laser', label: '激光', fn: () => GW.tool.set('laser'),
        subs: [
          { icon: 'laser', label: '激光笔', fn: () => GW.tool.set('laser'), on: () => GW.tool.current === 'laser' },
          { icon: 'unlock', label: '显示常驻', fn: () => pinChrome(!GW.showChrome.pinned()), on: () => !!GW.showChrome.pinned() },
          { icon: 'spotlight', label: '聚光灯', fn: () => T().spotlight() },
          { icon: 'curtain', label: '板中板', fn: () => T().curtain() },
          { icon: 'search', label: '放大镜', fn: () => T().magnifier() },
          { icon: 'settings', label: '设置', fn: () => showSettings() },
        ] },
      { key: 'trash', icon: 'trash', label: '清屏', fn: () => GW.slideClear(),
        subs: [
          { icon: 'trash', label: '清空画布', fn: () => GW.slideClear() },
          { icon: 'undo', label: '撤销', fn: () => GW.undo() },
          { icon: 'plus', label: '新建页面', fn: () => GW.addPage() },
          { icon: 'save', label: '自动备份', fn: () => GW.storage.save() },
          { icon: 'refresh', label: '恢复备份', fn: async () => { if (await GW.storage.restore()) GW.toast('已恢复上次自动备份'); else GW.toast('没有自动备份'); } },
        ] },
      { key: 'physics', icon: 'physics', label: '仿真', fn: () => simDrawer('physics'),
        subs: [
          { icon: 'physics', label: '物理仿真', fn: () => simDrawer('physics') },
          { icon: 'math', label: '数学仿真', fn: () => simDrawer('math') },
          { icon: 'compass', label: '尺规', fn: () => dockRun('geo') },
          { icon: 'classroom', label: '课堂工具', fn: () => dockRun('class') },
          { icon: 'resources', label: '资源库', fn: () => resDrawer() },
          { icon: 'insert', label: '插入', fn: () => dockRun('insert') },
        ] },
      { key: 'toolbox', icon: 'toolbox', label: '工具', fn: () => ballTools(),
        subs: [
          { icon: 'timer', label: '计时器', fn: () => T().timer() },
          { icon: 'users', label: '随机点名', fn: () => T().rollcall() },
          { icon: 'spotlight', label: '聚光灯', fn: () => T().spotlight() },
          { icon: 'stamp', label: '计分板', fn: () => T().scoreboard() },
          { icon: 'curtain', label: '板中板', fn: () => T().curtain() },
          { icon: 'search', label: '放大镜', fn: () => T().magnifier() },
          { icon: 'calc', label: '计算器', fn: () => T().calculator() },
          { icon: 'camera', label: '区域截图', fn: () => T().screenshot() },
          { icon: 'formula', label: '常量表', fn: () => T().constants() },
          { icon: 'toolbox', label: '全部工具', fn: () => ballTools() },
        ] },
      { key: 'desktop', icon: 'desktop', label: GW.overlayMode ? '退出' : '桌面', fn: () => desktopMode(),
        subs: [
          { icon: 'desktop', label: GW.overlayMode ? '退出批注' : '桌面画布', fn: () => desktopMode() },
          { icon: 'insert', label: '导入文件', fn: () => GW.importer.pick('all') },
          { icon: 'export', label: '导出图片', fn: () => GW.storage.exportView() },
          { icon: 'camera', label: '区域截图', fn: () => T().screenshot() },
          { icon: 'settings', label: '设置', fn: () => showSettings() },
          { icon: 'star', label: '关于', fn: () => showAbout() },
        ] },
      { key: 'unlock', icon: 'unlock', label: '常显', fn: () => pinChrome(!GW.showChrome.pinned()),
        subs: [
          { icon: 'lock', label: '锁定界面', fn: () => pinChrome(true) },
          { icon: 'unlock', label: '解锁界面', fn: () => pinChrome(false) },
          { icon: 'star', label: '关于', fn: () => showAbout() },
          { icon: 'settings', label: '设置', fn: () => showSettings() },
        ] },
    ];
    const N = items.length;               // 10
    const PER = 3;                        // 每个内环扇区 3 格
    const SECTOR = (Math.PI * 2) / N;     // 36°
    const SUB = SECTOR / PER;             // 12°
    const CELLS = N * PER;                // 外环总格数 30
    let expanded = -1;
    let lastExpanded = -1;   // 2.2.5：全展开档打开时用来兜底「当前工具没有扇区」的情形
    // 2.2.3（R4）：'hold' 档用 —— 长按球 550ms 才把外环升级成全展开。
    // 只在这一次展开里有效：收起（setOpen(false)）就复位，不做成持久开关。
    let heldLong = false;
    // 2.2.3（R3）：悬浮球扇环定制。settings.ballCustom = null ⇒ 逐位等价内置默认（一个字节都不变）。
    // 非 null 形如 { secs: [ { main: 'item:pen', subs: ['item:pen#0', 'dock:penColor:#e02020', 'item:pen#2'] } ×10 ] }。
    // 引用三族：'item:<key>'＝内置主项；'item:<key>#<c>'＝该内置项的第 c 个子格；'dock:<动作 id>'＝工具栏动作目录里任一项。
    const BASE_BALL = items.map((it) => ({ key: it.key, icon: it.icon, label: it.label, fn: it.fn, subs: it.subs }));
    const BALL_ACTS = dockActions().filter((a) => a.id.indexOf('dock:') !== 0);
    const ballActOf = (id) => { for (const a of BALL_ACTS) if (a.id === id) return a; return null; };
    const ballBaseItem = (key) => { for (const b of BASE_BALL) if (b.key === key) return b; return null; };
    const ballRunAct = (a) => () => runDockAction(a.id, ball);
    // 主项/图标都可在运行时被定制改掉，而 ri-ico 的 DOM 是启动时一次性建好的（图标、文字、
    // data-tool 全烘死在里面），所以定制后必须回写一遍 —— 否则换的是数据、看到的还是旧图标。
    let paintItems = () => {};
    function ballSubOfAct(a) {
      const o = { icon: a.icon || 'settings', label: a.label, fn: ballRunAct(a) };
      if (a.kind === 'penColor' && a.sw) { o.sw = a.sw; o.on = () => GW.tool.pen.color === a.sw; }
      else if (a.kind === 'penWidth') { o.kind = 'width'; o.w = a.w; o.on = () => GW.tool.pen.width === a.w; }
      else if (a.kind === 'penDash') { o.kind = 'style'; o.da = a.da; o.on = () => GW.tool.pen.style === a.styleKey; }
      else if (a.kind === 'penInk') { o.on = () => (GW.settings.penInk || '') === a.inkId; }
      return o;
    }
    function ballSubOfRef(ref) {
      if (!ref) return null;
      if (ref.indexOf('dock:') === 0) { const a = ballActOf(ref.slice(5)); return a ? ballSubOfAct(a) : null; }
      if (ref.indexOf('item:') === 0) {
        const s = ref.slice(5), h = s.indexOf('#');
        const b = ballBaseItem(h < 0 ? s : s.slice(0, h));
        if (!b) return null;
        if (h < 0) return { icon: b.icon, label: b.label, fn: b.fn };
        return b.subs[+s.slice(h + 1)] || null;
      }
      return null;
    }
    function applyBallCustom() {
      // 每次都从 BASE_BALL 重放：设置怎么改都只生效一次，不会一层层叠加。
      for (let k = 0; k < items.length; k++) {
        const it = items[k], b = BASE_BALL[k];
        it.key = b.key; it.icon = b.icon; it.label = b.label; it.fn = b.fn; it.subs = b.subs.slice();
      }
      const bc = GW.settings && GW.settings.ballCustom;
      const secs = bc && bc.secs;
      if (!secs || !secs.length) return;
      for (let k = 0; k < items.length && k < secs.length; k++) {
        const s = secs[k] || {}, it = items[k];
        if (s.main && s.main.indexOf('dock:') === 0) {
          const a = ballActOf(s.main.slice(5));
          if (a) { it.label = a.label; it.icon = a.icon || it.icon; it.fn = ballRunAct(a); }
        } else if (s.main && s.main.indexOf('item:') === 0) {
          // 换成另一个内置扇区：key 也要跟着换（key 决定图标高亮：eraser 亮就是真橡皮），
          // 子格先用被引用那一项的原始三格，随后若 s.subs 有内容再覆盖。
          const b = ballBaseItem(s.main.slice(5));
          if (b) { it.key = b.key; it.icon = b.icon; it.label = b.label; it.fn = b.fn; it.subs = b.subs.slice(); }
        }
        if (s.subs && s.subs.length) {
          const out = [];
          for (let c = 0; c < PER; c++) { const sub = ballSubOfRef(s.subs[c]); if (sub) out.push(sub); }
          if (out.length) it.subs = out;
        }
      }
    }
    applyBallCustom();
    paintItems = () => {
      icos.forEach((d, k) => {
        const it = items[k];
        d.dataset.tool = it.key;
        d.title = it.label;
        const sp = d.querySelector('span'); if (sp) sp.innerHTML = I(it.icon);
        const em = d.querySelector('em'); if (em) em.textContent = it.label;
        const sw = d.querySelector('.sw-mini');
        if (it.key === 'pen' && !sw) d.append(h('i', { class: 'sw-mini' }));
        if (it.key !== 'pen' && sw) sw.remove();
      });
    };
    const paths1 = [], paths2 = [];
    const icos = items.map((it) => {
      const d = h('div', { class: 'ri-ico', 'data-tool': it.key, title: it.label },
        h('span', { html: I(it.icon) }), h('em', null, it.label));
      if (it.key === 'pen') d.append(h('i', { class: 'sw-mini' }));
      icoLayer.append(d);
      return d;
    });
    const subsIco = [];
    for (let c = 0; c < CELLS; c++) {
      const d = h('div', { class: 'ri-sub', title: '' }, h('span', { html: I('plus') }), h('em', null, ''));
      d.style.display = 'none';
      icoLayer.append(d);
      subsIco.push(d);
    }
    function subsOf(k) { return (k >= 0 && items[k] && items[k].subs) ? items[k].subs : []; }
    // 2.2.3（R4）：档位判定。'sector' = 逐位等价 2.2.2；'all' = 一打开就 30 格全铺；
    // 'hold' = 轻点仍走扇形，长按球 550ms 才升级成全展开。
    // 视口小于 900×700 时强制回落 'sector'：整环 428px 再加安全边，小屏上会把球挤到没地方放，
    // 「半个环比没有更糟」（snapTo 里同一条结论）。回落只影响这一次展开，不改设置。
    function useAll() {
      const s = GW.settings || {};
      const mode = s.ballOpen || 'sector';
      if (mode !== 'all' && !(mode === 'hold' && heldLong)) return false;
      return innerWidth >= 900 && innerHeight >= 700;
    }
    // 2.2.5：外环铺的是「当前工具」的二级功能，所以先要知道当前工具落在哪一项。
    // 笔（含荧光笔）算 pen 这一格；工具栏上的图形/选择这些没有扇区，就沿用上一次展开的那一项。
    function curIdx() {
      const t = GW.tool && GW.tool.current;
      let k = items.findIndex((it) => it.key === t);
      if (k < 0 && t === 'hl') k = items.findIndex((it) => it.key === 'pen');
      return k;
    }
    // P0（2.2.9 回归）：靠边半圈把 10 个工具塞进 5 个扇区（一个扇区叠两项：靠内 r=48 是偶数项、
    // 靠外 r=80 是奇数项）。于是「几何槽位」k∈0..4 与「工具索引」i∈0..9 是两个不同的数。
    // 约定：expanded / lastExpanded 一律记**工具索引**（items 下标），只有画几何、算起点时才换算成槽位。
    // 改前 pointerdown 把槽位存进 expanded，主功能用 i、子项却读 items[k] —— 点「仿真」(i=6)
    // 铺出来的却是撤销/重做/另存为（items[3] 的子项）。
    const toolOfSlot = (k, r) => Math.min(k * 2 + (r > 64 ? 1 : 0), N - 1);
    const slotOfTool = (i, half) => (half && i >= 0 ? Math.floor(i / 2) : i);
    function drawRing(nearEdge, base) {
      // 内环：靠边只画朝向屏内的 180°（5 个扇环），否则完整 10 个。
      // 全展开档例外：外环要铺满整圈，内环也得是完整的 10 个扇区当分组标签。
      outR = useAll() ? R_ALL : R_SECTOR;
      svg1.replaceChildren();
      paths1.length = 0;
      const cnt = (nearEdge && !useAll()) ? Math.round(Math.PI / SECTOR) : N;   // 5 / 10
      for (let k = 0; k < cnt; k++) {
        // 全展开档的整圈从 +x（3 点钟）起，与 hitRing 的角度基准一致；扇形档靠边才用 base 偏移
        const a0 = (nearEdge && !useAll()) ? base + k * SECTOR : k * SECTOR;
        const p = sv('path', { d: arcPath(R_IN, R_MID, a0, a0 + SECTOR), class: 'sec' });
        p.dataset.k = String(k);
        p.dataset.a0 = String(a0);
        svg1.append(p);
        paths1.push(p);
      }
      // 外环：只铺「这一项」的二级功能，从它的扇区起点顺时针一格一格排下去。
      // 2.2.5：全展开档与扇形档共用这一段 —— 全展开只是「省掉点第二下」：一打开就把
      // 当前工具（笔/橡皮/…）的二级功能铺满整圈，而不是把 10 个扇区的功能全摊在环上。
      // 没有展开项时外环完全空着（探针 ④：收起后 `.ring2 path` 必须为 0）。
      svg2.replaceChildren();
      paths2.length = 0;
      const cells = cnt * PER;
      // P0：expanded 是工具索引（0..9），起点要按槽位算 —— 靠边时 i=6/7 共用槽位 3。
      if (expanded >= 0 && expanded < N) {
        const start = slotOfTool(expanded, nearEdge && !useAll());
        const a0 = (nearEdge && !useAll()) ? base + start * SECTOR : start * SECTOR;
        const subs = subsOf(expanded);
        // 一圈固定 30 格（12° × 30 = 360°），二级功能不够就把余下的画成空描边格 —— 环始终是完整的，
        // 少画几格会在环上留一道缺口，看着像坏了。超出一圈的（动作目录整段）只铺前 30 个。
        for (let c = 0; c < cells; c++) {
          const p = sv('path', { d: arcPath(R_MID, outR, a0 + c * SUB, a0 + (c + 1) * SUB), class: subs[c] ? 'sec sub' : 'out' });
          p.dataset.c = String(c);
          p.dataset.sec = String(expanded);
          svg2.append(p);
          if (subs[c]) paths2.push(p);
        }
      }
      return cnt;
    }
    function layoutIcons(nearEdge, base, open) {
      // 全展开 + 靠边时内环仍是完整 10 个扇区（见 drawRing），图标也要按 10 项摆
      const cnt = (nearEdge && !useAll()) ? 5 : N;
      const place2 = (el, r, a) => {
        // .ring-ico 是 0×0 的图层，原点就在球心（left/top 50%），所以这里直接用极坐标偏移，
        // 不能再加 R_OUT —— 加了会把整个图标环推到右下角 (158,158) 的位置（截图实测过）。
        el.style.left = (Math.cos(a) * r) + 'px';
        el.style.top = (Math.sin(a) * r) + 'px';
      };
      icos.forEach((d, i) => {
        if (i >= (nearEdge && !useAll() ? N : cnt)) { d.style.display = 'none'; return; }
        d.style.display = open ? '' : 'none';
        if (nearEdge && !useAll()) {
          // 半圈里 5 个扇环各放两项：靠内 r=48 是偶数项、靠外 r=80 是奇数项（都还在内环厚度内）
          const k = Math.floor(i / 2), odd = i % 2;
          place2(d, odd ? 80 : 48, base + k * SECTOR + SECTOR / 2);
          d.dataset.band = odd ? '1' : '0';
        } else {
          place2(d, (R_IN + R_MID) / 2, i * SECTOR + SECTOR / 2);
          d.dataset.band = '';
        }
      });
      const cells = cnt * PER;
      const paint = (d, sub) => {
        const sp = d.querySelector('span');
        if (sub.sw) { sp.innerHTML = ''; sp.append(h('i', { class: 'sw2', style: { background: sub.sw } })); }
        else if (sub.kind === 'width') { sp.innerHTML = ''; sp.append(h('i', { class: 'w-bar', style: { height: Math.max(2, Math.min(10, sub.w || 3)) + 'px' } })); }
        else if (sub.kind === 'style') {
          sp.innerHTML = '<svg class="st-line" viewBox="0 0 24 10"><line x1="2" y1="5" x2="22" y2="5"'
            + (sub.da ? ' stroke-dasharray="' + sub.da + '"' : '') + '/></svg>';
        } else sp.innerHTML = I(sub.icon || 'plus');
        d.querySelector('em').textContent = sub.label;
        d.title = sub.label;
        d.classList.toggle('on', !!(sub.on && sub.on()));
      };
      const subs = expanded >= 0 ? subsOf(expanded) : [];
      // 与 drawRing 同一套换算：图标按工具索引取子项，几何按槽位摆位
      const start = slotOfTool(expanded, nearEdge && !useAll());
      const a0 = (nearEdge && !useAll()) ? base + start * SECTOR : start * SECTOR;
      subsIco.forEach((d, c) => {
        const sub = (open && expanded >= 0 && c < cells && c < subs.length) ? subs[c] : null;
        if (!sub) { d.style.display = 'none'; return; }
        d.style.display = '';
        d.dataset.cells = String(c);
        d.dataset.sec = String(expanded);
        paint(d, sub);
        place2(d, (R_MID + outR) / 2, a0 + c * SUB + SUB / 2);
      });
    }
    function ringGeom() {
      const cx = pos.x + 32, cy = pos.y + 32;
      const nearEdge = cx < 200 || cx > innerWidth - 200 || cy < 200 || cy > innerHeight - 200;
      const toC = Math.atan2(innerHeight / 2 - cy, innerWidth / 2 - cx);
      // 靠边：以「朝屏幕中心」为半圆的起点（-90° 相对 toC），保证整半圈都朝屏内
      const base = nearEdge ? toC - Math.PI / 2 : 0;
      return { cx, cy, nearEdge, base };
    }
    // 2.2.9（P0-2）：靠边展开时环只画半圈，但 .ring-hit 是个整圆 —— 视觉上没有扇区的那半
    // 仍然吃掉点击，竖栏与两个角钮就被挡住（任务书「半环外的空白区域内仍能点击竖栏和角钮」）。
    // 这里按当前 base 把命中层裁成同一半圆：有效扇区照旧可点，空的那半透给下层。
    // 注意不能直接 pointer-events:none —— 那样有效扇区也点不动。
    function hitClipPath(base) {
      const R = C, pts = [];
      const step = Math.PI / 16;
      for (let t = base; t <= base + Math.PI + 1e-6; t += step) {
        pts.push((C + Math.cos(t) * R).toFixed(1) + 'px ' + (C + Math.sin(t) * R).toFixed(1) + 'px');
      }
      pts.push(C + 'px ' + C + 'px');
      return 'polygon(' + pts.join(', ') + ')';
    }
    function layoutRing(open) {
      const g = ringGeom();
      const cnt = drawRing(g.nearEdge, g.base);
      layoutIcons(g.nearEdge, g.base, open);
      ball.dataset.near = g.nearEdge ? '1' : '0';
      ball.dataset.sectors = String(cnt);
      const half = g.nearEdge && !useAll();     // 只有「扇形档 + 靠边」才退化成半圈
      hitLayer.style.clipPath = half ? hitClipPath(g.base) : '';
    }
    /* 「常显」两个入口（激光扇区的「显示常驻」、解锁扇区的「常显/锁定/解锁」）统一走这里。
     * 放映中只改放映自己的 showPin —— 它由 pptx.js 的空闲降装饰读，不影响画布外壳；
     * 画布上仍按原语义写 GW.settings.chromePinned 并立刻应用外壳。 */
    function pinChrome(v) {
      if (GW.showChrome.inShow()) { GW.showChrome.set(v); syncRing(); return; }
      GW.settings.chromePinned = !!v;
      GW.saveSettings();
      setChrome(true);
      syncRing();
    }
    function syncRing() {
      icos.forEach((d) => {
        const k = d.dataset.tool;
        let on = (k === GW.tool.current) || (k === 'pen' && GW.tool.current === 'pen');
        // 放映中高亮必须由**放映内**的常显派生，否则点了没反应（任务书 §3.2）。
        const pin = GW.showChrome.inShow() ? GW.showChrome.pinned() : !!GW.settings.chromePinned;
        if (k === 'unlock') on = pin;
        if (k === 'unlock') { const sp = d.querySelector('span'); if (sp) sp.innerHTML = I(pin ? 'lock' : 'unlock'); }
        d.classList.toggle('on', on);
      });
      const sw = icoLayer.querySelector('.sw-mini'); if (sw) sw.style.background = GW.tool.pen.color;
      // 外环当前值高亮（笔色/粗细/线型）也要跟着刷新
      const subs = expanded >= 0 ? subsOf(expanded) : [];
      subsIco.forEach((d, i) => {
        if (d.style.display === 'none') return;
        d.classList.toggle('on', !!(subs[i] && subs[i].on && subs[i].on()));
      });
    }
    GW.bus.on('tool', syncRing); GW.bus.on('pen', syncRing);
    // 全展开档：外环跟着「当前工具」走。切了笔/橡皮，环上的二级功能立刻换成新的那一套。
    const followTool = () => {
      if (!useAll() || !ball.classList.contains('open')) return;
      const k = curIdx();
      if (k >= 0 && k !== expanded) { expanded = k; layoutRing(true); }
    };
    GW.bus.on('tool', followTool);

    // ---------- 命中：按「半径 + 角度」分派（扇环没法用 DOM 热区精确表达） ----------
    const norm = (a) => { const t = a % (Math.PI * 2); return t < 0 ? t + Math.PI * 2 : t; };
    function hitRing(ev) {
      const g = ringGeom();
      const dx = ev.clientX - g.cx, dy = ev.clientY - g.cy;
      const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const all = useAll();
      const half = g.nearEdge && !all;                        // 只有扇形档会靠边退化成半圈
      const cnt = half ? 5 : N;
      if (r < R_IN || r > outR) return null;                  // 球里面（拖动）与整环外面不算
      const baseA = half ? g.base : 0;
      const rel = norm(a - baseA);
      if (half && rel >= Math.PI) return null;
      const k = Math.floor(rel / SECTOR);
      if (k < 0 || k >= cnt) return null;
      if (r <= R_MID) {
        // 内环：靠边时一个扇环里叠两项（靠内是偶数项、靠外是奇数项）
        if (half) {
          // k 是几何槽位（0..4），i 是工具索引（0..9）：两者都回带，调用方只按 i 记账
          return { ring: 1, k, i: toolOfSlot(k, r), slot: k };
        }
        return { ring: 1, k, i: k };
      }
      // 外环：整圈都从「展开项自己的扇区起点」顺时针编号。
      // 2.2.5：外环铺的是「这一项的二级功能」，不是 10 个扇区的功能 —— 所以角度怎么算都对不上
      // 「哪一格是 A、哪一格是 B」，改成**离哪一格中心最近**（Voronoi）：格子中心与图标落点同一处，
      // 落哪点哪，两格交界没有死区（12° 一格在靠内那圈只有 30px 上下，按角度硬切会点 A 落 B）。
      if (expanded < 0 || expanded >= N) return null;
      const subs = subsOf(expanded);
      // 与 drawRing 同一套起点：靠边扇形档要叠上 base（朝屏内那半圈），全展开档从 +x 起。
      // 起点按槽位算，回带的 k 仍是工具索引（索引与几何分家）。
      const start = slotOfTool(expanded, half);
      const a0 = half ? g.base + start * SECTOR : start * SECTOR;
      const rr = R_MID + (outR - R_MID) * 0.42;
      let best = null, bestD = Infinity;
      const nCells = Math.min(subs.length, cnt * PER);
      for (let c = 0; c < nCells; c++) {
        const ang = a0 + c * SUB + SUB / 2;
        const d2 = (dx - Math.cos(ang) * rr) * (dx - Math.cos(ang) * rr) + (dy - Math.sin(ang) * rr) * (dy - Math.sin(ang) * rr);
        if (d2 < bestD) { bestD = d2; best = { ring: 2, k: expanded, c: c }; }
      }
      // 只认「离得最近的那一格」还不够：格子只铺一圈，其余角度是空的，落在空处不该误触。
      if (best && Math.sqrt(bestD) <= Math.max(28, (outR - R_MID) * 0.5)) return best;
      return null;
    }
    ball.addEventListener('pointerdown', (e) => {
      const m = hitRing(e);
      if (!m) return;
      e.stopPropagation(); e.preventDefault();
      wake();
      if (m.ring === 1) {
        const it = items[m.i];
        if (useAll()) {
          // 2.2.5：全展开档下内环只是「换到哪一项」，外环随即铺开它的二级功能。
          // 点的是当前这一项就不再「收起」——那会让老师点第二下什么也没发生。
          if (m.i !== expanded) { expanded = m.i; layoutRing(true); syncRing(); }
        } else {
          // P0：靠边半圈里 m.k 是槽位（0..4），展开项必须存**工具索引** m.i，
          // 否则子项去读 items[0..4]（笔/橡皮/交互/撤销/激光）—— 点「仿真」铺出撤销/重做/另存为。
          if (expanded === m.i) { expanded = -1; layoutRing(true); return; }   // 再点同一个扇区：收起
          expanded = m.i;
          syncRing(); layoutRing(true);
        }
        it.fn();   // 主功能照旧立刻生效（笔＝切笔、撤销＝撤销…），外环同时铺满子功能
        if (!ball.classList.contains('open')) return;                        // 主功能里可能把球关掉了
      } else {
        // 2.2.5：外环格子都归属当前展开项，m.k 只是回带，直接用 m.c 取。
        const sub = subsOf(m.k)[m.c];
        if (sub) sub.fn();
        layoutRing(ball.classList.contains('open'));
        syncRing();
      }
    }, true);
    // 悬停时只给「指到的那一格」出名字：外环 12° 一格，30 个标签同时摆出来会互相压字（截图实测）
    const clearHov = () => { icos.forEach((d) => d.classList.remove('hov')); subsIco.forEach((d) => d.classList.remove('hov')); };
    ball.addEventListener('pointermove', (e) => {
      if (!ball.classList.contains('open')) return;
      const m = hitRing(e);
      clearHov();
      if (!m) return;
      // 全展开档的 30 个图标按「扇区 × 3 + 格号」顺序排，扇形档按格号排
      const d = m.ring === 1 ? icos[m.i] : subsIco[m.c];
      if (d) d.classList.add('hov');
    });
    ball.addEventListener('pointerleave', clearHov);

    // 2.2.4：全展开档需要整环净空。球被拖到贴边处时，展开前先把它夹进
    // 「离四边各留一个外径 + 8px」的矩形（与 GW.ball.snapTo 同一条判据），再画环；
    // 否则 30 格里有一半落在屏外，点不到。
    function fitBallForAll() {
      const v = vp();
      if (v.w < 240 || v.h < 240) return false;
      const clear = R_ALL + 8;
      const cx = pos.x + 32, cy = pos.y + 32;
      const nx = GW.clamp(cx, 8 + clear, Math.max(8 + clear, v.w - clear - 8));
      const ny = GW.clamp(cy, 8 + clear, Math.max(8 + clear, v.h - clear - 8));
      if (Math.abs(nx - cx) < 1 && Math.abs(ny - cy) < 1) return false;
      dragged = true;      // 与 snapTo 同口径：这是「选定位置」，resize 不再按默认规则重排
      pos.x = Math.round(nx - 32); pos.y = Math.round(ny - 32);
      place();
      GW.settings.ballPos = { x: pos.x, y: pos.y }; GW.saveSettings();
      return true;
    }
    function setOpen(v) {
      if (!v) { expanded = -1; heldLong = false; }
      if (v) {
        if (useAll()) fitBallForAll();
        // 2.2.5：全展开 = 一打开就把「当前工具」的二级功能铺出来，所以先认领当前工具。
        // 工具栏停在「图形 / 选择」这类没有扇区的工具上时，沿用上一次展开的那一项，
        // 否则环上会空空如也，看着像坏了。
        const k = curIdx();
        if (useAll()) expanded = k >= 0 ? k : (lastExpanded >= 0 ? lastExpanded : 0);
        if (expanded >= 0) lastExpanded = expanded;
      }
      ball.classList.toggle('open', v);
      // §3.3（任务书）：放映期间**不许**再联动外壳。改前这里无条件 setChrome(v)，
      // 于是放映中点开球就把整条顶栏/工具栏叫回来（还会盖在课件上），
      // 收起球又把外壳收走 —— 退出放映后老师看到的界面和他进来时的不一样了。
      // 外壳在放映期间的显隐由 pptx.js 的进入/退出统一记账，这里只在非放映态联动。
      if (!document.body.classList.contains('slide-on')) setChrome(v);
      // body.ball-open 只给 CSS 读：放映里点球要把「完全隐藏」的胶囊与底部工具栏放出来，
      // 而外壳的 chrome-off 状态一点不动（探针断言放映中点球不改外壳）。
      document.body.classList.toggle('ball-open', !!v);
      if (GW.pptx && GW.pptx.slide && GW.pptx.slide.syncChrome) GW.pptx.slide.syncChrome();
      layoutRing(v);
      closeSub();
      if (v) { syncRing(); ball.classList.remove('idle'); } else wake();
    }
    // P0（2.2.9）：抽屉/弹层打开时把扇环整个收起来（不联动外壳、不写设置）。
    // 不能直接调 setOpen(false)：那条路径在非放映态会 setChrome(false)，从球上点开抽屉会把
    // 工具栏一起收走。这里只撤环 —— 去掉 .open 之后 `.ring-hit` 不再可命中（CSS 里也有兜底）。
    function retractRing() {
      if (!ball.classList.contains('open') && expanded < 0) return false;
      expanded = -1;
      ball.classList.remove('open');
      document.body.classList.remove('ball-open');
      layoutRing(false);
      closeSub();
      return true;
    }
    // 探针出口（1.4.4 R4）：扇环没有 DOM 按钮了，探针要能直接唤出两个面板、知道内环有哪几项
    GW.ballPanel = {
      colors: ballColors, tools: ballTools, open: setOpen, hit: hitRing,
      items: () => items.map((i) => i.key),
      // 外环 30 格的标签（探针用）：传 key 或序号都行
      subs: (k) => subsOf(typeof k === 'number' ? k : items.findIndex((i) => i.key === k)).map((s) => s.label),
      cells: () => CELLS,
      expandedIndex: () => expanded,          // 工具索引（items 下标）
      // P0：槽位 = 几何起点（靠边半圈 = floor(i/2)，居中/全展开 = i）；探针用它证明两者确实分开了
      slotIndex: () => { const g = ringGeom(); return expanded < 0 ? -1 : slotOfTool(expanded, g.nearEdge && !useAll()); },
      halfMode: () => { const g = ringGeom(); return !!(g.nearEdge && !useAll()); },
      // 2.2.3（R4）：探针以前把 158 硬编码在脚本里（见 probe-ball.js / probe-ball-ring2.js）。
      // 外径现在随档位变（158 / 214），画布原点也固定挪到了 214 的正中心，所以几何一律从这里读。
      radii: () => ({ rIn: R_IN, rMid: R_MID, outR: outR, sector: R_SECTOR, all: R_ALL, center: C, box: BOX, allMode: useAll() }),
      mode: () => (GW.settings.ballOpen || 'sector'),
      setMode: (m) => { GW.settings.ballOpen = m; GW.saveSettings(); layoutRing(ball.classList.contains('open')); },
      holdAll: () => heldLong,
      // 2.2.3（R3）：扇环定制 —— 设置页（工具栏定制 → 悬浮球扇环）通过这些口子读写。
      base: () => BASE_BALL.map((b) => ({ key: b.key, label: b.label, icon: b.icon, subs: b.subs.map((s) => s.label) })),
      custom: () => GW.settings.ballCustom || null,
      refs: () => BALL_ACTS.map((a) => ({ id: a.id, label: a.label, kind: a.kind || '', group: a.group || '' })),
      setCustom: (v) => { GW.settings.ballCustom = v || null; GW.saveSettings(); applyBallCustom(); paintItems(); layoutRing(ball.classList.contains('open')); syncRing(); },
      reloadCustom: () => { applyBallCustom(); paintItems(); layoutRing(ball.classList.contains('open')); syncRing(); },
    };
    // 兼容 1.1.x 的探针口径：旧探针点的是 `.ri[data-tool=x]`，这里给一个「按 key 点一下」的等价入口
    GW.ballClick = (key) => {
      const i = items.findIndex((it) => it.key === key);
      if (i < 0) return false;
      expanded = i;
      if (!ball.classList.contains('open')) setOpen(true);
      else layoutRing(true);
      items[i].fn();
      return true;
    };
    // ---------- 2.1.1：四指召唤的落点接口 ----------
    // 入参是「屏幕坐标锚点」（一般是笔尖），业务只关心「移到哪」，不关心手势从哪来。
    // 与 ClassIn 把四个手指折算成 triggerCenter 一个点的做法同构：手势输出锚点、
    // 业务决定表现，以后要接「语音：把工具盘叫过来」也不用改这里。
    // 2.2.3（R4）：安全边按「最大可能的外径」算 —— 召唤时还不知道这一下会展开成扇形还是全展开，
    // 按 158 算会让球落在边缘附近时 30 格铺出去一半在屏外。恒按 214 算，扇形档只是多留一点空。
    const R_CLEAR = R_ALL + 8;      // 整环外径 + 安全边
    const SUMMON_D = 72;            // 球心离锚点的距离：球半径 32 + 40 呼吸，不压笔尖
    let flyT = 0, openT = 0;
    const ringFits = (cx, cy) => {
      const v = vp();
      return cx - R_CLEAR >= 8 && cy - R_CLEAR >= 8 && cx + R_CLEAR <= v.w - 8 && cy + R_CLEAR <= v.h - 8;
    };
    // §3.3 放映避让：放映态底部的导航胶囊、「更多」、右上「退出放映」都是浮在画面上方的
    // 小控件，球如果正好停在它们上面就点不到（球 z-index 90 > 放映浮层 35）。这里把这些矩形
    // 当不可占据区，把球沿**位移最小**的方向推出去；只改本次放映的位置，**不写进设置**，
    // 退出放映时 releaseAvoid() 原样还回去（老师自己摆的位置不该被一次放映改掉）。
    let avoidPrev = null;
    GW.ball = {
      isOpen: () => ball.classList.contains('open'),
      pos: () => ({ x: pos.x, y: pos.y }),
      open: () => setOpen(true),
      close: () => setOpen(false),
      // 抽屉/弹层用：只撤扇环、不碰外壳（见 buildBall 里的 retractRing）
      retract: retractRing,
      /* opt.open：到达后是否展开（默认展开）；返回落地后的左上角坐标 */
      snapTo(ax, ay, opt) {
        const o = opt || {};
        const v = vp();
        if (v.w < 240 || v.h < 240) return null;     // 视口还没定：这一下不算数
        const K = SUMMON_D * 0.7071;
        // 八向择优：右下优先（右手持笔时顺手），第一个「整环放得下」的方向即采用。
        // 这是对 ClassIn「召唤点落在约束域外就被夹到边角」的直接修正。
        const DIRS = [[1, 1], [1, 0], [0, 1], [-1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1]];
        let goal = null;
        for (const [dx, dy] of DIRS) {
          const cx = ax + dx * K, cy = ay + dy * K;
          if (ringFits(cx, cy)) { goal = { x: cx, y: cy }; break; }
        }
        // 八向都不合法（锚点贴边 / 窗口太小）：夹到「能放下整环」的最近位置。
        // 视口本身装不下整环时只移动不展开 —— 半个环比没有更糟。
        const tiny = v.w < R_CLEAR * 2 + 16 || v.h < R_CLEAR * 2 + 16;
        if (!goal) {
          goal = {
            x: GW.clamp(ax + K, 8 + R_CLEAR, Math.max(8 + R_CLEAR, v.w - R_CLEAR - 8)),
            y: GW.clamp(ay + K, 8 + R_CLEAR, Math.max(8 + R_CLEAR, v.h - R_CLEAR - 8)),
          };
        }
        pos.x = Math.round(goal.x - 32); pos.y = Math.round(goal.y - 32);
        // 这是「用户选定」的位置：resize 时不再按默认规则重排，与手动拖动同口径
        dragged = true;
        const wasOpen = ball.classList.contains('open');
        ball.classList.add('flying');     // 只有飞行这 240ms 有 left/top 过渡，拖动始终跟手
        place();
        clearTimeout(flyT); clearTimeout(openT);
        flyT = setTimeout(() => ball.classList.remove('flying'), 240);
        if (wasOpen) layoutRing(true);    // 已展开：只移动，不重复展开（避免闪一下）
        else if (o.open !== false && !tiny) openT = setTimeout(() => setOpen(true), 220);
        GW.settings.ballPos = { x: pos.x, y: pos.y }; GW.saveSettings();
        return { x: pos.x, y: pos.y };
      },
      /* rects: [{x,y,w,h}] 屏幕坐标（CSS px）。返回球被推到了哪，没动就返回 null。 */
      avoid(rects) {
        const v = vp();
        const list = (rects || []).filter((r) => r && r.w > 1 && r.h > 1);
        if (!list.length || v.w < 240 || v.h < 240) return null;
        if (!avoidPrev) avoidPrev = { x: pos.x, y: pos.y, dragged: dragged };
        const W = 64, H = 64, GAP = 8;
        // 重叠面积：0 就是「干净地躲开了」。夹到屏幕边界上可能仍重叠（球本来就在角落），
        // 所以候选一律按「重叠面积 → 位移」两级排序，而不是先挑位移最小的再撞墙。
        const ov = (x, y) => {
          let s = 0;
          for (const r of list) {
            const w = Math.min(x + W, r.x + r.w) - Math.max(x, r.x);
            const h = Math.min(y + H, r.y + r.h) - Math.max(y, r.y);
            if (w > 0 && h > 0) s += w * h;
          }
          return s;
        };
        const clampX = (x) => Math.max(6, Math.min(x, v.w - W - 6));
        const clampY = (y) => Math.max(6, Math.min(y, v.h - H - 6));
        let bx = clampX(pos.x), by = clampY(pos.y);
        for (let round = 0; round < 6; round++) {
          let hit = null;
          for (const r of list) {
            if (bx + W <= r.x || r.x + r.w <= bx || by + H <= r.y || r.y + r.h <= by) continue;
            hit = r; break;
          }
          if (!hit) break;
          const cand = [
            { x: hit.x - W - GAP, y: by },              // 左
            { x: hit.x + hit.w + GAP, y: by },          // 右
            { x: bx, y: hit.y - H - GAP },              // 上
            { x: bx, y: hit.y + hit.h + GAP },          // 下
            // 四个角也进候选：底部导航横贯整屏时，左右都躲不开、只有往上才是干净解。
            { x: hit.x - W - GAP, y: hit.y - H - GAP },
            { x: hit.x + hit.w + GAP, y: hit.y - H - GAP },
            { x: hit.x - W - GAP, y: hit.y + hit.h + GAP },
            { x: hit.x + hit.w + GAP, y: hit.y + hit.h + GAP },
          ].map((c) => ({ x: clampX(c.x), y: clampY(c.y) }))
            .map((c) => ({ x: c.x, y: c.y, o: ov(c.x, c.y), d: Math.abs(c.x - bx) + Math.abs(c.y - by) }));
          cand.sort((a, b) => (a.o - b.o) || (a.d - b.d));
          bx = cand[0].x; by = cand[0].y;
        }
        if (bx === pos.x && by === pos.y) return null;
        pos.x = Math.round(bx); pos.y = Math.round(by);
        dragged = true;          // 复用「用户摆过」的分支：place() 不再按默认规则把它拉回去
        place();
        layoutRing(ball.classList.contains('open'));
        return { x: pos.x, y: pos.y };
      },
      /* 退出放映：把球放回 avoid() 之前的位置（没避让过就什么都不做）。 */
      releaseAvoid() {
        if (!avoidPrev) return;
        const p = avoidPrev;
        avoidPrev = null;
        // 放映期间老师自己拖过球（pointerdown 里清了 avoidPrev）的话这里根本不会走到。
        pos.x = p.x; pos.y = p.y; dragged = p.dragged;
        place();
        layoutRing(ball.classList.contains('open'));
      },
    };
    // 拖动 / 点击
    core.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      core.setPointerCapture(e.pointerId);
      avoidPrev = null;     // 老师自己动了球：放映结束不再回滚到避让前的位置
      wake();
      const sx = e.clientX, sy = e.clientY, ox = pos.x, oy = pos.y;
      let moved = false;
      // 2.2.3（R4）：'hold' 档 —— 按住球 550ms 不动，就把外环升级成全展开（松手仍是原来的开/合）。
      // 判据只看「按下后没移动」：移动超过 6px 立刻取消，拖动时绝不会被这个计时器抢走。
      let holdT = 0;
      const cancelHold = () => { if (holdT) { clearTimeout(holdT); holdT = 0; } };
      if ((GW.settings.ballOpen || 'sector') === 'hold' && !heldLong) {
        holdT = setTimeout(() => {
          holdT = 0;
          if (moved) return;
          if (!ball.classList.contains('open')) setOpen(true);
          heldLong = true;
          layoutRing(true);
        }, 550);
      }
      const mv = (ev) => {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) { moved = true; cancelHold(); }
        if (moved) {
          dragged = true;   // 用户开始拖了：place() 不许再把它当「默认位置」重排
          if (ball.classList.contains('open')) setOpen(false);
          pos.x = ox + ev.clientX - sx; pos.y = oy + ev.clientY - sy; place();
        }
      };
      const up = () => {
        core.removeEventListener('pointermove', mv); core.removeEventListener('pointerup', up);
        const wasHold = holdT === 0 && heldLong;
        cancelHold();
        if (wasHold) return;      // 长按已经把它展开了：这一次松手不再「再点收起」
        if (moved) {
          // 松手就停在原地 —— 悬浮球可以停在可见窗口的任意位置。
          // （旧行为是强制吸到左/右边缘：于是「停在画布中间」这一档永远走不到，
          //   布局里那圈环绕也就从来没显示过。）
          const v = vp();
          pos.x = GW.clamp(pos.x, 6, Math.max(6, v.w - 70));
          pos.y = GW.clamp(pos.y, 6, Math.max(6, v.h - 70));
          place(); layoutRing(ball.classList.contains('open'));
          GW.settings.ballPos = { x: pos.x, y: pos.y }; GW.saveSettings();
        }
        else setOpen(!ball.classList.contains('open'));
      };
      core.addEventListener('pointermove', mv); core.addEventListener('pointerup', up);
    });
    // 点「球和球的面板」以外的地方收起球。但**四角与工具栏不算外面** ——
    // 否则点一下工具栏，球一收、外壳跟着消失，工具栏根本点不到第二下。
    document.addEventListener('pointerdown', (e) => {
      if (!ball.classList.contains('open')) return;
      if (ball.contains(e.target) || e.target.closest('#ball-sub')) return;
      if (e.target.closest('#dock, #topbar, #winctl, #zoombar, #pagebar')) return;
      // 放映工作区同理：点胶囊/退出/更多也是「球放出来的那一层」，一收球它们就跟着隐身。
      if (e.target.closest('#ppt-ws')) return;
      setOpen(false);
    }, true);
    let sub = null;
    function closeSub() { if (sub) { sub.remove(); sub = null; } }
    function subPanel(content) {
      closeSub();
      sub = h('div', { id: 'ball-sub', class: 'pop' }, content);
      document.body.append(sub);
      const w = sub.offsetWidth, hh = sub.offsetHeight;
      const left = pos.x + 32 < innerWidth / 2 ? pos.x + 190 : pos.x - w - 130;
      sub.style.left = GW.clamp(left, 8, innerWidth - w - 8) + 'px';
      sub.style.top = GW.clamp(pos.y + 32 - hh / 2, 8, innerHeight - hh - 8) + 'px';
    }
    function ballColors() {
      const P = GW.tool.pen;
      if (!P.style) P.style = GW.settings.penStyle || 'solid';
      const st = GW.ui.segmented({
        options: [{ value: 'solid', label: '实线' }, { value: 'dashed', label: '虚线' }, { value: 'dotted', label: '点线' }],
        value: P.style,
        onChange: (v) => { P.style = v; GW.settings.penStyle = v; GW.saveSettings(); GW.bus.emit('pen'); if (GW.selection.items.length) GW.restyleSelection(v); },
      });
      subPanel(h('div', { style: { width: '300px' } }, h('h4', null, '颜色'), swatches(smartPenColors(), P.color, (c) => { P.color = c; GW.bus.emit('pen'); }, false), h('h4', null, '粗细'), widths(WIDTHS, P.width, P.color, (w) => { P.width = w; GW.bus.emit('pen'); }), h('h4', null, '线型'), st.el));
    }
    function ballTools() {
      const T = GW.classTools;
      const it = (icon, label, fn, key) => h('button', { class: 'gb', 'data-ball': key || icon, onclick: () => { setOpen(false); fn(); } }, h('span', { html: I(icon) }), label);
      const sec = (title, nodes) => h('div', { class: 'ball-tools-sec' }, h('h4', null, title), h('div', { class: 'grid-btns', style: { gridTemplateColumns: 'repeat(4, 80px)' } }, ...nodes));
      const stencil = () => { shapePop(core); };
      setTimeout(() => {
        ball.classList.add('open');
        // 「一球控全部」：这里把底部工具栏 16 项、四角控件、课堂 12 项、文件/导出都列全，
        // 不再只挑 16 个快捷工具 —— 隐藏 dock 之后，悬浮球就是唯一的完整入口。
        subPanel(h('div', { class: 'ball-tools', style: { width: '356px' } },
          h('h4', null, '全部工具'),
          sec('绘图', [
            it('select', '选择', () => GW.tool.set('select')), it('pen', '笔', () => GW.tool.set('pen')),
            it('highlighter', '荧光笔', () => GW.tool.set('hl'), 'hl'), it('eraser', '橡皮', () => GW.tool.set('eraser')),
            it('text', '文本', () => GW.tool.set('text')), it('laser', '激光笔', () => GW.tool.set('laser')),
            it('hand', '交互', () => GW.tool.set('hand')),
            it('ruler', '直尺', () => GW.geo.add('ruler'), 'geo'), it('triangle', '三角板 45°', () => GW.geo.add('tri45'), 'geo'),
            it('triangle', '三角板 60°', () => GW.geo.add('tri60'), 'geo'), it('protractor', '量角器', () => GW.geo.add('protractor'), 'geo'),
            it('compass', '圆规', () => GW.geo.add('compass')), it('formula', '公式', () => GW.formulaEditor()),
          ]),
          sec('学科与素材', [
            it('shapes', '图形 / 模板', stencil, 'shape'),
            it('math', '数学工具', () => simDrawer('math')), it('physics', '物理仿真', () => simDrawer('physics')),
            it('resources', '资源库', () => resDrawer(), 'res'), it('insert', '导入文件', () => GW.importer.pick('all'), 'insert'),
            it('ggb', 'GeoGebra', () => GW.importer.insertGgb('graphing')), it('desktop', GW.overlayMode ? '退出批注' : '桌面画布', desktopMode),
            it('bg', '背景', () => bgPop(core)), it('star', '关于', showAbout),
          ]),
          sec('课堂', [
            it('timer', '计时器', T.timer), it('users', '随机点名', T.rollcall),
            it('spotlight', '聚光灯', T.spotlight), it('curtain', '板中板', T.curtain),
            it('magnifier', '放大镜', T.magnifier), it('calc', '计算器', T.calculator),
            it('camera', '截图', () => T.screenshot()), it('star', '小组计分', T.scoreboard),
            it('formula', '物理常量', T.constants), it('classroom', '全部课堂工具', () => classPop(core), 'class'),
          ]),
          sec('文件与页面', [
            it('undo', '撤销', () => GW.undo()), it('redo', '重做', () => GW.redo()),
            it('save', '保存', () => GW.storage.save()), it('folder', '打开', () => GW.storage.open()),
            it('plus', '新页面', () => GW.addPage()), it('pages', '页面管理', pagesDrawer),
            it('export', '导出图片', () => GW.storage.exportView()), it('export', '导出 SVG/PDF', () => GW.exporter.open()),
            it('search', '搜索', () => GW.search.open()), it('trash', '清屏', () => GW.slideClear()),
            it('settings', '设置', showSettings),
            GW.isElectron ? it('focus', '全屏', () => window.gewu.win('full')) : null,
          ])));
      }, 0);
    }
    wake();
    // 1.3.1：触摸设备上没有「悬停」，收起后老师找不到入口（iPad 反馈「菜单栏全部消失」），
    // 所以触摸设备默认展开，鼠标设备保持原来的「只留悬浮球」。
    // 判据不能只看 matchMedia：headless/某些嵌入式 WebView 在首帧里 pointer:coarse 还不可信，
    // 用 maxTouchPoints 兜底；再在 400ms 后补一次（那时布局已稳定），避免第一次打开还是收起的。
    chromeAuto = GW.chromeDefault();
    setChrome(chromeAuto);
    // 补一次：首帧里 pointer:coarse 可能还不可信（headless / 部分 WebView），布局稳定后再判。
    setTimeout(() => { if (GW.chromeDefault() && !chromeOn) { chromeAuto = true; setChrome(true); } }, 400);
  }

  // =============== 设置 / 关于 ===============
  let devUI = null;   // 设置面板里「输入设备」那一行的实时刷新句柄（面板关掉后置空）
  GW.bus.on('pen-device', () => { if (devUI) devUI.sync(); });
  // ---------- 外观（1.1.3）：工具栏按钮形状与颜色 ----------
  // 全部读 GW.settings（localStorage 持久化），改完立即 applyLook()，下次启动照旧。
  const lumOfHex = (hex) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 0;
    let s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  function applyLook() {
    const S = GW.settings;
    const style = ['round', 'square', 'pill'].includes(S.dockStyle) ? S.dockStyle : 'round';
    document.body.dataset.dockstyle = style;
    const on = /^#[0-9a-f]{6}$/i.test(String(S.dockColor || '')) ? S.dockColor : '#1b2433';
    const root = document.documentElement.style;
    root.setProperty('--dk-on', on);
    // 选中态文字颜色：深色底配白字、浅色底配深字（避免选了荧光黄之后按钮上的图标看不见）
    root.setProperty('--dk-on-fg', lumOfHex(on) > 0.62 ? '#12161c' : '#ffffff');
    root.setProperty('--dk-hover', lumOfHex(on) > 0.62 ? 'rgba(0,0,0,.06)' : 'rgba(27,36,51,.07)');
    root.setProperty('--dk-ring', on);
  }
  GW.applyLook = applyLook;

  // ---------- 1.1.10 工具栏外观：底纹色 / 风格 / 透明度 / 圆角 / 内边距 / 按钮底纹 ----------
  // 全部写进 CSS 变量（app.css 末尾「工具栏外观」段），所以调一下只重绘三条栏，不重排画布。
  // 颜色一律按「叠在白底上的观感」算前景色：浅底配深图标、深底配白图标 —— 老师把底纹调成
  // 黑板绿或纯黑之后，按钮上的字和图依然看得清。
  function hexRGB(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return null;
    let s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  function overWhite(rgb, a) {
    const k = Math.max(0, Math.min(1, a));
    return rgb.map((v) => Math.round(v * k + 255 * (1 - k)));
  }
  const lumRGB = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const rgbaOf = (rgb, a) => 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (Math.round(a * 1000) / 1000) + ')';
  function applyBarLook() {
    const S = GW.settings;
    const root = document.documentElement.style;
    const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
    // 1.1.11：默认底纹色（#ffffff）不再写死白，而是用「随画布底色算出来的底纹基色」，
    // 这样黑板绿/纯黑的画布上工具栏与菜单一起变深，字自动转白；老师自己调过底纹色就尊重他的选择。
    const themeT = GW.uiThemeCache || uiTheme();
    const themed = !S.barTint || String(S.barTint).toLowerCase() === '#ffffff';
    const tint = themed ? themeT.base : (hexRGB(S.barTint) || hexRGB('#ffffff'));
    const fill = ['solid', 'glass', 'outline', 'none'].indexOf(S.barFill) >= 0 ? S.barFill : 'solid';
    // 界面透明度只作用在底纹 alpha 上（1.1.11）：不再整层 opacity，字与图恒实色。
    const ua = Math.max(0, Math.min(1, S.uiAlpha == null ? 1 : S.uiAlpha));
    const a = clamp(S.barAlpha, 0, 1, 0.98) * ua;
    const r = Math.round(clamp(S.barRadius, 0, 34, 20));
    const pad = Math.round(clamp(S.barPad, 2, 14, 6));
    const filled = fill === 'solid' || fill === 'glass';
    const bgA = fill === 'outline' ? 0.08 : (filled ? a : 0);
    root.setProperty('--bar-bg', bgA > 0 ? rgbaOf(tint, bgA) : 'transparent');
    root.setProperty('--bar-blur', fill === 'glass' ? 'blur(10px) saturate(1.05)' : 'none');
    // 描边风格不画投影（只留一圈内描边），无底纹风格什么都不画 —— 板书上一个像素都不挡
    const shade = fill === 'outline'
      ? 'inset 0 0 0 1.4px ' + rgbaOf(tint, Math.min(0.9, a + 0.15))
      : (filled ? '0 6px 30px rgba(20,30,50,' + (0.18 * a).toFixed(2) + '), 0 0 0 1px rgba(20,30,50,' + (0.06 * (a + 0.2)).toFixed(2) + ')' : 'none');
    const shadeSm = fill === 'outline'
      ? 'inset 0 0 0 1.2px ' + rgbaOf(tint, Math.min(0.85, a + 0.12))
      : (filled ? '0 3px 16px rgba(20,30,50,' + (0.12 * a).toFixed(2) + '), 0 0 0 1px rgba(20,30,50,' + (0.05 * (a + 0.2)).toFixed(2) + ')' : 'none');
    root.setProperty('--bar-shadow', shade);
    root.setProperty('--bar-shadow-sm', shadeSm);
    root.setProperty('--bar-r', r + 'px');
    root.setProperty('--bar-r-sm', Math.max(6, r - 6) + 'px');
    root.setProperty('--bar-pad', pad + 'px');
    root.setProperty('--bar-gap', (pad <= 4 ? 1 : 2) + 'px');
    // 前景色：跟着主题走时用主题文字色；老师自己挑了底纹色就按那个色的亮度算（浅底深字 / 深底白字），
    // 否则黑画布上挑一块浅色底纹会得到「白底白字」。
    const fg = themed ? themeT.fg : (lumRGB(tint) < 0.55 ? '#ffffff' : '#1b2433');
    root.setProperty('--bar-fg', fill === 'none' ? 'inherit' : fg);
    // 按钮底纹：0 = 和以前一样透明（只有选中态有颜色）
    const bt = hexRGB(S.btnTint) || hexRGB('#1b2433');
    const ba = clamp(S.btnAlpha, 0, 1, 0);
    root.setProperty('--btn-bg', ba > 0 ? rgbaOf(bt, ba) : 'transparent');
    root.setProperty('--btn-fg', ba > 0 ? (lumRGB(overWhite(bt, ba)) < 0.55 ? '#ffffff' : '#12161c') : 'inherit');
    // 防遮挡三件：书写淡出的程度、底部额外内缩（平板/网页端躲浏览器工具栏）
    root.setProperty('--bar-fade', String(clamp(S.barFadeTo, 0.05, 0.6, 0.22)));
    root.setProperty('--bar-inset', Math.round(clamp(S.barInset, 0, 64, 0)) + 'px');
    if (GW.relayoutBars) GW.relayoutBars();
    // 底纹不透明度也管菜单底纹（反馈 2）：老师只拉这一根滑杆时，菜单要跟着一起透，
    // 不能等他再去拉「界面透明度」。GW._inTheme 是 applyUiTheme 内部调用时的闸门，防递归。
    if (!GW._inTheme) applyUiTheme();
  }
  GW.applyBarLook = applyBarLook;

  // ---------- 1.1.15 设置镜像的统一入口 ----------
  // 平板与电脑是同一份板书的两块屏，「设置」也是板书的一部分：外观、透明度、激光笔、
  // 界面自定义、资源库分页……对端改了就按同一套应用函数重放一遍。不在这里维护键表 ——
  // 每个应用函数自己读 GW.settings，加新设置项不用改这里。
  GW.applySettingsPatch = function (patch) {
    if (!patch || typeof patch !== 'object') return;
    const S = GW.settings;
    if (!S) return;
    for (const k of Object.keys(patch)) {
      if (k === 'uiCustom') continue;   // 下面单独处理（要重排 Dock，不能只赋值）
      S[k] = patch[k];
    }
    try { if (patch.uiCustom !== undefined) { S.uiCustom = patch.uiCustom; layoutDock(); } } catch (e) { /* 布局重排失败不该影响其余项 */ }
    try { GW.saveSettings(); } catch (e) { /* 隐私模式写不进去就算了 */ }
    GW.applyToolSettings?.();
    try { applyUiTheme(); } catch (e) { /* 主题失败也不影响后面 */ }
    try { applyBarLook(); } catch (e) {}
    try { applyLook(); } catch (e) {}
    try { if (GW.applyPanelAlpha) GW.applyPanelAlpha(S.panelAlpha); } catch (e) {}
    try { if (GW.applyUiAlpha) GW.applyUiAlpha(S.uiAlpha); } catch (e) {}
    try { if (GW.applyLaserSettings) GW.applyLaserSettings(); } catch (e) {}
    if (GW.bus && GW.bus.emit) GW.bus.emit('settings');
  };

  // ---------- 1.1.10 防遮挡：书写淡出 + 贴边浮出 ----------
  // 书写淡出：落笔/画图期间把三条栏与顶栏压淡到 --bar-fade（默认 0.22），抬手 0.8s 后复原。
  // 只改 opacity，不动布局；画布与墨迹完全不读这个变量，所以板书不会跟着变淡。
  let quietTimer = 0;
  function inkQuiet(on) {
    clearTimeout(quietTimer);
    if (!GW.settings.barFade) { document.body.classList.remove('ink-quiet'); return; }
    if (on) document.body.classList.add('ink-quiet');
    else quietTimer = setTimeout(() => document.body.classList.remove('ink-quiet'), 800);
  }
  GW.inkQuiet = inkQuiet;
  // 贴边浮出：界面已收起（chrome-off）时，鼠标/笔贴到「工具栏所在的那一边」就把三条栏浮出来，
  // 移开 0.7s 再收回去。平板/网页端是触摸设备，触摸也会触发 pointermove，所以两端都能用。
  let peekOn = false, peekTimer = 0;
  function barEdgeZone(x, y) {
    const pos = (document.body.dataset.dock || 'bottom');
    const W = window.innerWidth || 1280, H = window.innerHeight || 800;
    const band = 18;
    if (pos === 'bottom') return y >= H - band;
    if (pos === 'top') return y <= band;
    if (pos === 'left') return x <= band;
    return x >= W - band;
  }
  function hookBarDodge() {
    const interactive = '#dock, #zoombar, #pagebar, #topbar, #winctl, #sel-bar, #ball, .pop, .dlg-wrap, .toast, .ui-list, input, textarea, select, button';
    // ① 书写淡出：画布上按下就淡，抬手复原（在捕获阶段挂，input.js 里 stopPropagation 也拦不住）
    const down = (e) => {
      if (e.target && e.target.closest && e.target.closest(interactive)) return;
      if (e.button && e.button !== 0) return;
      inkQuiet(true);
    };
    const up = () => inkQuiet(false);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    // ② 贴边浮出
    const move = (e) => {
      if (!GW.settings.barEdgePeek) return;
      if (e.pointerType === 'touch' && e.buttons === 0) return;   // 触摸只在按住时算，避免误触
      const near = barEdgeZone(e.clientX || 0, e.clientY || 0);
      if (near && !GW.chromeOn()) {
        peekOn = true;
        clearTimeout(peekTimer);
        setChrome(true);
      } else if (peekOn && !near) {
        peekOn = false;
        clearTimeout(peekTimer);
        peekTimer = setTimeout(() => { if (!GW.settings.chromePinned) setChrome(false); peekOn = false; }, 700);
      }
    };
    window.addEventListener('pointermove', move, { passive: true });
  }
  // 视口/底部空档变了要重算四条栏的位置（kit.js 的 viewportVars 会调它）
  GW.relayoutBars = function () { barMetrics = null; layoutDock(); };

  // 1.7.6（R2）：「恢复画布默认设置」的目标由**出厂值**改为**本机正在使用的设置**。
  // 旧版快照单独存 localStorage，读取后并入正常设置和磁盘备份。
  const CANVAS_DEFAULT_KEY = 'gewu.canvasDefault';
  const cloneCanvasCfg = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  function readCanvasDefault() {
    let d = GW.settings.canvasDefault;
    if (!d) { try { d = JSON.parse(localStorage.getItem(CANVAS_DEFAULT_KEY) || 'null'); } catch (_) { d = null; } }
    // 2.1.1（R6）：本机快照缺失时，优先回落到出厂固化的「本机真实默认」
    // （canvasDefault 含采集时的缩放 s、平移 tx/ty 与工具栏布局），而不是返回 null
    // 让 showSettings() 去抓一份运行时临时视图覆盖掉默认。用户显式点过「记为默认」后
    // GW.settings.canvasDefault 有值，仍以用户的选择为准。
    if (!d && GW.factoryDefaults) {
      const f = GW.factoryDefaults();
      if (f && f.canvasDefault) d = cloneCanvasCfg(f.canvasDefault);
    }
    const num = (x) => typeof x === 'number' && isFinite(x);
    const valid = (v) => v && typeof v === 'object'
      && ['free', 'inf2d', 'axis100'].indexOf(v.canvasMode) >= 0
      && num(v.tx) && num(v.ty) && num(v.s) && v.s > 0;
    // 2.1.1（R6）：快照被改乱 / 清空 / 损坏时，也回落到出厂固化的本机真值，
    // 保证「恢复画布默认设置」永远能回到采集时的缩放 / 平移 / 布局，而不是打回原点。
    if (!valid(d) && GW.factoryDefaults) {
      const f = GW.factoryDefaults();
      if (valid(f.canvasDefault)) { d = cloneCanvasCfg(f.canvasDefault); GW.settings.canvasDefault = d; }
    }
    if (!valid(d)) return null;
    if (!GW.settings.canvasDefault) { GW.settings.canvasDefault = d; GW.saveSettings(); }
    return d;
  }
  function snapshotCanvasDefault() {
    const c = GW.camera || { tx: 0, ty: 0, s: 1 };
    const d = {
      canvasMode: GW.settings.canvasMode || 'free',
      tx: c.tx, ty: c.ty, s: c.s,
      uiCustom: cloneCanvasCfg(GW.settings.uiCustom),
    };
    GW.settings.canvasDefault = d;
    GW.saveSettings();
    return d;
  }

  function showSettings() {
    const S = GW.settings;
    // 1.7.6：本机默认只在缺失时采集一次；之后由「记为默认」显式更新，
    // 免得画布被临时调乱后打开设置页，把「默认」也一起冲掉。
    if (!readCanvasDefault()) snapshotCanvasDefault();
    // 「恢复画布默认设置」按下后要把各页的控件拨回默认值：各页把自己的一次性同步函数登记在这里
    const afterReset = [];
    // 1.5.6（P1）：设置行正文在左侧 div 里，开关 label 是空的（旧版把 span 也 display:none 了），
    // 于是 checkBox 在辅助技术里没有名字。这里把行标题（+说明）兜底成按钮的可访问名。
    const row = (title, desc, ctl) => {
      const r = h('div', { class: 'set-row' }, h('div', null, h('b', null, title), h('span', null, desc)), ctl);
      const inp = ctl && ctl.querySelector ? ctl.querySelector('.gw-toggle input') : null;
      if (inp && !inp.getAttribute('aria-label')) inp.setAttribute('aria-label', desc ? title + '：' + desc : title);
      return r;
    };
    const tog = (key, onChange) => GW.ui.toggle({ label: '', value: S[key], onChange: (v) => { S[key] = v; GW.saveSettings(); onChange && onChange(v); } }).el;
    const ggbLabel = h('span', { class: 'muted' }, S.ggbPath || '未设置（使用内置离线包）');
    // 输入设备：红外屏与电磁笔的笔迹问题完全不同，识别出来后各自走不同的滤波与压感策略
    const devLabel = h('span', { class: 'muted' }, GW.pen ? GW.pen.short : '');
    const devSeg = GW.ui.segmented({
      options: [{ value: 'auto', label: '自动识别' }, { value: 'infrared', label: '红外屏（手指书写）' }, { value: 'emr', label: '电磁笔（带压感）' }],
      value: GW.pen ? GW.pen.manual : 'auto',
      onChange: (v) => { if (GW.pen) { GW.pen.setManual(v); devLabel.textContent = GW.pen.short; } },
    });
    const devToken = {};
    if (GW.pen) devUI = { token: devToken, sync() { devLabel.textContent = GW.pen.short; devSeg.set(GW.pen.manual); } };
    const devCtl = h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, devSeg.el, devLabel,
      h('button', { class: 'gw-btn', onclick: () => GW.pen && GW.pen.openDiag() }, '诊断…'));
    // 笔锋 / 抖动抑制 / 笔尖预测：现场真正需要「凭手感调」的三个旋钮
    const taperSeg = GW.ui.segmented({
      options: [{ value: '1', label: '开' }, { value: '0', label: '关' }],
      value: String(S.penTaper == null ? 1 : S.penTaper),
      onChange: (v) => {
        S.penTaper = +v; GW.saveSettings();
        GW.toast(v === '1' ? '已开启笔锋：按行笔速度出粗细，起笔入锋、收笔出锋' : '已关闭笔锋：所有笔画等宽', 2400);
      },
    });
    const smoothSeg = GW.ui.segmented({
      options: [{ value: '0', label: '关（默认）' }, { value: '1', label: '轻' }, { value: '2', label: '中' }, { value: '3', label: '强' }, { value: '', label: '自动' }],
      value: S.penSmooth == null ? '' : String(S.penSmooth),
      onChange: (v) => {
        S.penSmooth = v === '' ? null : +v; GW.saveSettings();
        GW.toast(v === '0' || v === '' ? '已关闭抖动抑制：笔尖最跟手' : '已开启抖动抑制：笔画更平顺，但会略微滞后', 2400);
      },
    });
    const predictSeg = GW.ui.segmented({
      options: [{ value: '-1', label: '自动' }, { value: '0', label: '关' }, { value: '8', label: '1 帧' }, { value: '16', label: '2 帧' }],
      value: String(S.penPredict == null ? -1 : S.penPredict),
      onChange: (v) => { S.penPredict = +v; GW.saveSettings(); },
    });
    // 图形加速状态：教室一体机若是软件渲染，书写会明显变卡，这里能直接看出来
    const gpuLabel = h('span', { class: 'muted' }, '检测中…');
    const gpuRetryBtn = GW.ui.button({ label: '重新尝试硬件加速', onClick: () => { if (window.gewu && window.gewu.gpuRetry) window.gewu.gpuRetry(); } });
    gpuRetryBtn.el.style.display = 'none';   // 只有真的退到软件渲染时才出现
    const gpuWrap = h('span', null, gpuLabel, gpuRetryBtn.el);
    const refreshGpuLabel = (g) => {
      // 桌面能读 GPU 状态，网页 / 手机读不到（没有主进程那条 IPC），如实写「浏览器版」而不是报错
      if (!g) { gpuLabel.textContent = canDesk() ? '无法读取' : '浏览器版'; gpuRetryBtn.el.style.display = 'none'; return; }
      const tier = GW.perf ? GW.perf.tierLabel() : '';
      const soft = !g.accelerated;
      gpuLabel.textContent = g.accelerated
        ? `已启用硬件加速 · 当前档位：${tier}`
        : `未启用（${g.software ? '驱动被系统屏蔽，正在软件渲染' : (g.compositing || g.rasterization || '未知')}）· 当前档位：${tier}`;
      // 上次启动时 GPU 进程起不来 ⇒ 这次是程序自动改的软件渲染（先保证能打开）。
      // 这种情况下给一个出口：换过显卡驱动、或想让画面更细腻时点它，清掉守卫重启再试硬件加速。
      gpuRetryBtn.el.style.display = (soft && (g.softMode || g.guard)) ? '' : 'none';
    };
    const gW = gwBridge();
    if (canDesk() && gW && typeof gW.gpuStatus === 'function') {
      gW.gpuStatus().then((g) => { if (GW.perf) GW.perf.setGpu(g); refreshGpuLabel(g); }).catch(() => { gpuLabel.textContent = '无法读取'; });
    } else refreshGpuLabel(GW.perf ? GW.perf.gpu : null);
    const modeSeg = GW.ui.segmented({
      options: [{ value: 'auto', label: '自动' }, { value: 'high', label: '高质量' }, { value: 'lite', label: '流畅优先' }],
      value: S.renderMode || 'auto',
      onChange: (v) => {
        S.renderMode = v; GW.saveSettings();
        if (!GW.perf) return;
        GW.perf.apply({ mode: v });
        GW.refreshRenderScale && GW.refreshRenderScale();
        GW.requestRender();
        refreshGpuLabel(GW.perf.gpu);
        GW.toast('已切换到「' + GW.perf.tierLabel() + '」：' + (v === 'lite' ? '像素更省，旧机器更跟手' : v === 'high' ? '笔画与图形更精细' : '按显卡状态自动选择'), 2600);
      },
    });
    const canvasSeg = GW.ui.segmented({
      options: [{ value: 'free', label: '无限平移' }, { value: 'inf2d', label: '无限平移 · 100%' },
        { value: 'axis100', label: '单轴无限 · 100%' }],
      value: S.canvasMode || 'free',
      onChange: (v) => {
        S.canvasMode = v; GW.saveSettings();
        // 切到两种锁 100% 的模式立刻把缩放拉回 100%；切回「无限平移」时不动当前缩放，老师自己调
        if (v === 'axis100' || v === 'inf2d') GW.setView(GW.camera.tx, GW.camera.ty, 1);
        GW.toast(v === 'axis100' ? '单轴无限 · 缩放固定 100%'
          : v === 'inf2d' ? '无限平移 · 缩放固定 100%' : '无限平移：可以一直往四周拖，缩放可用', 2600);
      },
    });
    const perfBtn = GW.ui.button({ label: '开始自检', onClick: () => (GW.perfCheck ? GW.perfCheck.open() : GW.toast('自检组件未加载', 2000)) });
    // ---------- 界面自定义（1.0.9）：工具栏按钮的显隐 / 顺序 / 整条位置 + 四角控件停靠的角 ----------
    function uiCustomRows() {
      const uiList = h('div', { class: 'ui-list' });
      const buildUiList = () => {
        const items = GW.uiCustom.items();
        uiList.replaceChildren(...items.map((it) => {
          const cb = GW.ui.toggle({ label: '', value: it.on, onChange: (v) => { GW.uiCustom.setItemOn(it.id, v); buildUiList(); } });
          const mv = (d) => h('button', { class: 'ui-mv', title: d < 0 ? '上移' : '下移', onclick: (e) => { e.preventDefault(); GW.uiCustom.move(it.id, d); buildUiList(); } }, d < 0 ? '↑' : '↓');
          return h('div', { class: 'ui-li' + (it.on ? '' : ' off') }, cb.el, h('span', { class: 'ui-li-t' }, it.label), mv(-1), mv(1));
        }));
      };
      buildUiList();
      const dockSeg = GW.ui.segmented({
        options: [{ value: 'bottom', label: '底部居中' }, { value: 'top', label: '顶部' }, { value: 'left', label: '左侧竖排' }, { value: 'right', label: '右侧竖排' }],
        value: GW.uiCustom.cfg().dockPos,
        onChange: (v) => GW.uiCustom.setDockPos(v),
      });
      const segs = [[dockSeg, 'bottom']];
      const cornerCtl = (id) => {
        const cfg = GW.uiCustom.cfg(), def = (GW.uiCustom.corners.find((c) => c.id === id) || {}).def || 'tl';
        const tg = GW.ui.toggle({ label: '', value: cfg.cornersOff.indexOf(id) < 0, onChange: (v) => GW.uiCustom.setCornerOn(id, v) });
        const seg = GW.ui.segmented({
          options: [{ value: 'tl', label: '左上' }, { value: 'tr', label: '右上' }, { value: 'bl', label: '左下' }, { value: 'br', label: '右下' }],
          value: cfg.corners[id] || def,
          onChange: (v) => GW.uiCustom.setCorner(id, v),
        });
        segs.push([seg, cfg.corners[id] || def]);
        return h('div', { class: 'ui-corner' }, tg.el, seg.el);
      };
      const resetBtn = GW.ui.button({
        label: '恢复默认界面',
        onClick: () => {
          GW.uiCustom.reset();
          buildUiList();
          segs.forEach(([sg, v]) => sg.set(v));
          GW.toast('界面已恢复默认：工具栏在底部居中，四角回到原来的位置', 2400);
        },
      });
      afterReset.push(() => { buildUiList(); segs.forEach(([sg, v]) => sg.set(v)); });
      return [
        row('工具栏位置', '整条工具栏停在哪里。「左侧竖排 / 右侧竖排」会自动改成竖着排，按钮顺序就是从下往上', dockSeg.el),
        row('工具栏按钮', '勾掉就隐藏、↑ ↓ 调顺序，改完立刻生效。别把「笔」「橡皮」「选择」都藏掉，上课就没法写了', uiList),
        row('顶栏（菜单、文件名）', '勾掉就隐藏；右边选停靠的角', cornerCtl('topbar')),
        row('窗口按钮（最小化 / 全屏 / 关闭）', '只有桌面版有这一栏', cornerCtl('winctl')),
        row('缩放条', '左下角的 − 100% ＋；右边选停靠的角', cornerCtl('zoombar')),
        row('页码条', '右下角的页码与新建页；右边选停靠的角', cornerCtl('pagebar')),
        row('恢复默认界面', '把上面的显隐、顺序与位置一次性还原', resetBtn.el),
      ];
    }
    // 1.1.10 工具栏外观 + 防遮挡（见 applyBarLook / inkQuiet / hookBarDodge）。
    // 颜色预设都选「深色底上还能看清白图标」的常用课堂配色；每一项改完立刻预览并落盘。
    function barLookRows() {
      const BAR_TINTS = [['#ffffff', '白'], ['#f4f7fa', '浅灰'], ['#e8eef6', '雾蓝'], ['#1f3b30', '黑板绿'], ['#13284a', '深蓝'], ['#1b2433', '墨黑'], ['#3b2a1a', '牛皮纸'], ['#000000', '纯黑']];
      const BTN_TINTS = [['#1b2433', '墨黑'], ['#ffffff', '白'], ['#2563eb', '蓝'], ['#0e9382', '青'], ['#7c3aed', '紫'], ['#b45309', '棕']];
      const ctl = {};
      const pick = (key, def) => (/^#[0-9a-f]{6}$/i.test(String(S[key] || '')) ? String(S[key]) : def);
      function colorRow(key, colors, def) {
        const sw = h('div', { class: 'look-swatches' });
        const sel = h('input', { type: 'color', class: 'look-pick', value: pick(key, def) });
        function paint() {
          sw.innerHTML = '';
          colors.forEach(([c, name]) => sw.append(h('button', {
            class: 'look-sw' + (String(S[key]).toLowerCase() === c ? ' on' : ''), title: name, style: { background: c },
            onclick: () => { S[key] = c; GW.saveSettings(); sel.value = c; paint(); applyBarLook(); },
          })));
        }
        sel.addEventListener('input', () => {
          if (!/^#[0-9a-f]{6}$/i.test(sel.value)) return;
          S[key] = sel.value; GW.saveSettings(); paint(); applyBarLook();
        });
        paint();
        ctl[key] = { paint: paint, sel: sel };
        return h('div', { class: 'look-ctl' }, sw, sel);
      }
      const fillSeg = GW.ui.segmented({
        options: [{ value: 'solid', label: '实底' }, { value: 'glass', label: '毛玻璃' }, { value: 'outline', label: '描边' }, { value: 'none', label: '无底纹' }],
        value: ['solid', 'glass', 'outline', 'none'].indexOf(S.barFill) >= 0 ? S.barFill : 'solid',
        onChange: (v) => { S.barFill = v; GW.saveSettings(); applyBarLook(); },
      });
      const mkSlider = (key, label, min, max, step, unit, disp, apply) => {
        const s = GW.ui.slider({
          label: label, min: min, max: max, step: step, unit: unit,
          value: disp(S[key]),
          onInput: (v) => { S[key] = apply(v); GW.saveSettings(); applyBarLook(); },
        });
        ctl[key + 'Sl'] = { set: (v) => s.set(disp(v)) };
        return s.el;
      };
      const fadeTog = tog('barFade');
      const peekTog = tog('barEdgePeek');
      const resetBtn = GW.ui.button({
        label: '恢复默认外观',
        onClick: () => {
          // 2.1.1（R6）：两个恢复入口都应用「本机当前配置」的完整默认（111 项），
          // 而不只是各自主管的那一小组；真实值见 core/factory-defaults.js。
          if (GW.applyFactoryDefaults) GW.applyFactoryDefaults();
          const D = GW.factoryDefaults ? GW.factoryDefaults() : (GW.settingsDefaults ? GW.settingsDefaults() : {});
          for (const k of ['barTint', 'barAlpha', 'barFill', 'barRadius', 'barPad', 'btnTint', 'btnAlpha', 'barFade', 'barFadeTo', 'barEdgePeek', 'barInset']) {
            S[k] = k in D ? JSON.parse(JSON.stringify(D[k])) : S[k];
          }
          GW.saveSettings(); applyBarLook();
          fillSeg.set(S.barFill);
          // tog() 返回的是元素（不是 GW.ui 控件），这里直接拨里面的 checkbox，让面板与设置同步
          const syncTog = (el, v) => { const inp = el && el.querySelector && el.querySelector('input'); if (inp) inp.checked = !!v; };
          syncTog(fadeTog, S.barFade); syncTog(peekTog, S.barEdgePeek);
          ctl.barTint.paint(); ctl.btnTint.paint();
          ctl.barAlphaSl.set(S.barAlpha); ctl.barRadiusSl.set(S.barRadius); ctl.barPadSl.set(S.barPad);
          ctl.btnAlphaSl.set(S.btnAlpha); ctl.barFadeToSl.set(S.barFadeTo); ctl.barInsetSl.set(S.barInset);
          GW.toast('已恢复为本机默认配置（全部 ' + (GW.FACTORY_META ? GW.FACTORY_META.total : '默认') + ' 项）', 2400);
        },
      });
      return [
        row('工具栏底纹色', '三条工具栏（底部按钮条、左下缩放条、右下页码条）的背景色。预设八色，或点右边方块自己调 —— 换成深色会自动把图标改成白色', colorRow('barTint', BAR_TINTS, '#ffffff')),
        row('工具栏风格', '实底：不透明底板；毛玻璃：半透明 + 背景模糊（板书透出来，最不挡视线）；描边：只有一圈细线；无底纹：完全不画底板，只剩按钮', fillSeg.el),
        row('底纹不透明度', '底板有多实。上课不想被底板挡住题干就调到 60% 以下，配合「毛玻璃」最好看', mkSlider('barAlpha', '不透明度', 0, 100, 1, '%', (v) => Math.round((v == null ? 0.98 : v) * 100), (v) => v / 100)),
        row('工具栏圆角', '底板的圆角大小。0 = 直角，20 = 现在这样，34 = 接近胶囊', mkSlider('barRadius', '圆角', 0, 34, 1, 'px', (v) => Math.round(v == null ? 20 : v), (v) => v)),
        row('工具栏内边距', '底板与按钮之间留多少。调到 2px 最紧凑、最不挡板书；调大更适合大屏点选', mkSlider('barPad', '内边距', 2, 14, 1, 'px', (v) => Math.round(v == null ? 6 : v), (v) => v)),
        row('按钮底纹', '按钮自己的底色（未选中的按钮）。默认透明 —— 想让每个按钮都像卡片就把它调深、透明度调高', colorRow('btnTint', BTN_TINTS, '#1b2433')),
        row('按钮底纹不透明度', '0 = 只留图标（默认），100 = 每个按钮都是实心方块', mkSlider('btnAlpha', '不透明度', 0, 100, 1, '%', (v) => Math.round((v == null ? 0 : v) * 100), (v) => v / 100)),
        row('书写时自动淡出', '落笔画图期间三条栏与顶栏自动压淡，抬手 0.8 秒后复原 —— 板书被工具栏压住时最有用', fadeTog),
        row('淡出程度', '淡到多透明。越小越不挡视线，太小会「找不着按钮」', mkSlider('barFadeTo', '剩余不透明度', 5, 60, 1, '%', (v) => Math.round((v == null ? 0.22 : v) * 100), (v) => v / 100)),
        row('贴边浮出', '界面收起（点悬浮球收起三条栏）时，把鼠标/笔贴到工具栏所在的那一边，三条栏自动浮出来，移开再收回去', peekTog),
        row('底部额外内缩', '平板 / 手机网页端要留一条给浏览器自己的地址栏与手势条 —— 下方按钮条被盖住就把它调大（8~24px 通常就够）', mkSlider('barInset', '内缩', 0, 64, 2, 'px', (v) => Math.round(v == null ? 0 : v), (v) => v)),
        row('恢复默认外观', '把上面这一整组（底纹色、风格、透明度、圆角、内边距、按钮底纹、防遮挡）一次性还原', resetBtn.el),
      ];
    }
    // 1.1.3：外观三件 —— 工具栏按钮形状、按钮颜色、画布默认底色。
    // 三样都写进 GW.settings（localStorage），下次启动 GW.applyLook() + 页面 bg 原样恢复。
    const styleSeg = GW.ui.segmented({
      options: [{ value: 'round', label: '圆形' }, { value: 'square', label: '方形' }, { value: 'pill', label: '胶囊' }],
      value: S.dockStyle || 'round',
      onChange: (v) => {
        S.dockStyle = v; GW.saveSettings(); GW.applyLook();
        GW.toast('工具栏按钮改成' + ({ round: '圆形', square: '方形', pill: '胶囊' }[v] || v) + '（会记住）', 2000);
      },
    });
    const DOCK_COLORS = [['#1b2433', '墨黑'], ['#2563eb', '蓝'], ['#0e9382', '青'], ['#b45309', '棕'], ['#7c3aed', '紫'], ['#be123c', '红']];
    const dockSw = h('div', { class: 'look-swatches' });
    function paintDockSw() {
      dockSw.innerHTML = '';
      DOCK_COLORS.forEach(([c, name]) => {
        dockSw.append(h('button', {
          class: 'look-sw' + (String(S.dockColor).toLowerCase() === c ? ' on' : ''), title: name, style: { background: c },
          onclick: () => setDockColor(c),
        }));
      });
    }
    const dockPick = h('input', { type: 'color', class: 'look-pick', value: /^#[0-9a-f]{6}$/i.test(String(S.dockColor || '')) ? S.dockColor : '#1b2433', oninput: (e) => setDockColor(e.target.value) });
    function setDockColor(c) {
      if (!/^#[0-9a-f]{6}$/i.test(String(c || ''))) return;
      S.dockColor = c; GW.saveSettings(); GW.applyLook(); paintDockSw();
      dockPick.value = c;
    }
    paintDockSw();
    const bgPickV = /^#[0-9a-f]{6}$/i.test(String((S.defaultBg || {}).color || '')) ? S.defaultBg.color : GW.bgTheme((S.defaultBg || {}).color).fill;
    const bgPick = h('input', { type: 'color', class: 'look-pick', value: /^#[0-9a-f]{6}$/i.test(bgPickV) ? bgPickV : '#ffffff', oninput: (e) => setDefaultBgColor(e.target.value) });
    const BG_QUICK2 = [['#ffffff', '白板'], ['#fbf8f1', '米黄'], ['#1f3b30', '黑板绿'], ['#000000', '纯黑'], ['#13284a', '深蓝']];
    const bgSw = h('div', { class: 'look-swatches' }, BG_QUICK2.map(([c, name]) => h('button', {
      class: 'look-sw' + (GW.bgTheme((S.defaultBg || {}).color).fill === c ? ' on' : ''), title: name, style: { background: c },
      onclick: () => setDefaultBgColor(c),
    })));
    function setDefaultBgColor(c) {
      if (!/^#[0-9a-f]{6}$/i.test(String(c || ''))) return;
      S.defaultBg = Object.assign({ pattern: 'grid' }, S.defaultBg, { color: c });
      GW.saveSettings();
      setBg({ color: c });
      bgPick.value = c;
      bgSw.querySelectorAll('.look-sw').forEach((b) => b.classList.toggle('on', GW.bgTheme(c).fill === b.style.background || b.title === '白板' && c === '#ffffff'));
      if (GW.lansync) GW.lansync.pushSnapshot();
    }
    // 1.4.4（R3）：先按原来的顺序把 30 行铺出来（下面按标题分发到 7 页），控件逻辑一行没改
    const flat = h('div', null,
      row('渲染档位 · 硬件加速', '旧一体机（集显 / 软件渲染）选「流畅优先」，行笔与拖动更跟手；显卡正常的机器用「自动」', modeSeg.el),
      row('图形加速状态', '这里是渲染层实际生效的档位。若上一回显卡驱动崩过，程序会自动改用软件渲染 —— 先保证双击就能打开，此刻右边会出现「重新尝试硬件加速」，换过驱动后再点它', gpuWrap),
      row('性能自检', '在这台一体机上跑一次（约 6 秒，期间别碰屏幕），会量出真实帧率、拖动时的整屏重画次数与显卡状态；一键复制结果发回来即可按这台机器继续调优', perfBtn.el),
      row('免费说明', '首次启动时显示「这个软件完全免费」说明（含制作者、打赏与 QQ 交流群二维码），必须点按钮才能进画布。点右边可随时重新打开', h('button', { class: 'gw-btn', onclick: () => GW.freeNotice() }, '再看一次')),
      row('新手引导', '第一次进画布会自动走一遍：悬浮球、三条工具栏、书写手势、框选调 AI。点右边可以重看（不影响板书）', h('button', { class: 'gw-btn', onclick: () => GW.onboard && GW.onboard.reset() }, '再看一次')),
      row('免费 · 授权', GW.ident('antiPiracy', '本软件完全免费：凡是花钱买来的，都不是官方版本。') + ' ' + GW.ident('license', '免费使用；禁止转售，禁止修改后以任何名义收费发布。'), h('button', { class: 'gw-btn', onclick: () => showAbout() }, '看关于')),
      row('导出物水印', '默认关闭。开启后，PDF、SVG 和课堂截图的右下角会显示来源。', tog('exportWatermark')),
      // 1.7.0（T01/T02/T06/T12/T13/T15）：新一批开关。教室模式是「一次关 4 项」的预设，退出时还原。
      row('导出质量', '同一份板书导出 PDF 的清晰度：最好（原尺寸）/ 中等（0.75）/ 最小（0.5）。发班级群、传给家长时选最小，体积约为原来的四分之一；要打印选最好', (() => {
        return GW.ui.segmented({
          options: [{ value: 'best', label: '最好' }, { value: 'medium', label: '中等' }, { value: 'lowest', label: '最小' }],
          value: S.exportQuality || 'best',
          onChange: (v) => { S.exportQuality = v; GW.saveSettings(); },
        }).el;
      })()),
      row('教室模式', '公开课/录课时一键关掉：导出水印、AI 面板、资源库，并把导出降到最小。退出时逐项还原成你原来的设置（不会把界面定制改掉）', (() => {
        return GW.ui.toggle({
          label: '',
          value: !!S.classroomMode,
          onChange: (v) => {
            const on = GW.flags.classroom(v);
            S.classroomMode = on;   // flags.classroom 已写盘，这里只让面板与设置对象同步
            applyFlags();
            GW.toast(on ? '已进入教室模式：水印、AI、资源库已关，导出降到最小' : '已退出教室模式，原来的设置都回来了', 3000);
          },
        }).el;
      })()),
      row('网格吸附', '拖动图形时靠近格线就自动对齐（阈值 8 屏幕像素）。写板书时觉得黏就关掉', tog('snapGrid')),
      row('对象吸附', '拖动图形时贴近别的图形的边或中线就自动对齐，摆表格、并排图形时最省事', tog('snapObjects')),
      // 1.7.1（T04）：打开板书时续上上次的页与视口（默认开；关掉就是每次都回到第 1 页原始位置）
      row('打开时回到上次位置', '打开板书时回到上次离开的那一页、那个平移与缩放位置。关掉则每次都从第 1 页左上角开始（旧板书没有记录时同样从头开始）', tog('resumeView')),
      // 1.7.2（T07）：打开口令 —— 文案必须诚实：这是门帘不是加密，正文在文件里仍是明文。
      row('打开口令', '给这份板书设一个打开口令，投影前不怕别人随手点开。**不加密正文**：用记事本打开 .gewu 仍能看到内容；忘了口令只能手工改文件', (() => {
        const btn = h('button', { class: 'gw-btn' }, '设置口令…');
        const sync = () => { if (GW.docGuard) btn.textContent = GW.docGuard.has() ? '已设置 · 点此修改' : '设置口令…'; };
        sync();
        btn.onclick = async () => {
          if (!GW.docGuard) return;
          if (GW.docGuard.has()) {
            const cur = await GW.passPrompt('输入当前口令（验证通过后可修改或取消）', '当前口令');
            if (cur == null) return;
            if (!(await GW.docGuard.verify(GW.doc.guard, cur))) { GW.toast('口令不正确', 2400); return; }
            if (await GW.confirm('要取消口令吗？取消后任何人打开都能直接看到板书。', '取消口令')) {
              GW.docGuard.clear(); sync(); GW.toast('已取消口令，记得保存板书', 3200); return;
            }
          }
          const np = await GW.passPrompt('设置打开口令（至少 4 位）', '新口令');
          if (np == null) return;
          if (String(np).length < 4) { GW.toast('口令至少 4 位', 2400); return; }
          const np2 = await GW.passPrompt('再输一次同样的口令', '确认口令');
          if (np2 !== np) { GW.toast('两次输入不一致，已取消', 2600); return; }
          const hint = await GW.passPrompt('口令提示（可留空；输入框标题里会显示）', '例如：班级名');
          try {
            await GW.docGuard.set(np, hint || '');
            sync();
            GW.toast('口令已设置 —— 保存板书后才生效（口令无法找回）', 4200);
          } catch (e) { GW.toast('设置失败：' + ((e && e.message) || e), 3600); }
        };
        return btn;
      })()),
      row('画完停住变形状', '画完一笔后停住约 0.3 秒，把手画的圆 / 矩形 / 直线换成规整图形。**默认关**：写「口、日」这类闭合汉字会被误改，需要的人自己打开', tog('drawHold')),
      row('画圈即选中', '用笔画一个闭合的圈，圈里的对象自动被选中。**默认关**：写「0、口」会被误判，需要的人自己打开', tog('circleLasso')),
      row('教师批注可见', '关掉只是把批注藏起来（投影给学生看时用），批注内容和回复都还在，随时可以再显示', tog('teacherAnnot', () => { if (GW.applyTeacherAnnot) GW.applyTeacherAnnot(true); if (GW.requestRender) GW.requestRender(); })),
      // 1.7.0（T11）：右下角小地图。默认关（不是所有人都想要一块缩略图挡在页面条上面），
      // 打开后点一下就跳过去，右键出「100% / 适合内容」。
      row('小地图', '右下角显示一张整页缩略图，长板书时一眼看到自己在哪；点一下跳过去，右键可切 100% / 适合内容', tog('minimap', (v) => {
        if (!GW.minimap) return;
        GW.minimap.mount();
        if (v) GW.minimap.show(); else GW.minimap.hide();
      })),
      // 1.6.7（T20/R7）：开机自启与更新检查都只在桌面版有意义（网页/安卓没有这些 API）
      GW.isElectron ? row('开机自动启动', '登录 Windows 后自动打开本程序（不弹框、不抢焦点，只是把程序备好）。关掉就是彻底不自启', (() => {
        const btn = h('button', { class: 'gw-btn' }, '读取中…');
        const sync = (st) => {
          btn.textContent = st && st.openAtLogin ? '已开启 · 点此关闭' : (st && st.supported === false ? '当前环境不支持' : '已关闭 · 点此开启');
          btn.disabled = !!(st && st.supported === false);
        };
        if (window.gewu && window.gewu.autolaunch) {
          window.gewu.autolaunch.get().then(sync).catch(() => { btn.textContent = '读取失败'; });
          btn.onclick = () => window.gewu.autolaunch.set(!btn.dataset.on || btn.dataset.on === 'false')
            .then((st) => { btn.dataset.on = String(!!(st && st.openAtLogin)); sync(st); GW.toast(st && st.openAtLogin ? '已设为开机自动启动' : '已取消开机自动启动'); })
            .catch(() => GW.toast('设不了：当前环境不允许'));
        }
        return btn;
      })()) : null,
      GW.isElectron ? row('检查更新', '在本程序的安装目录、桌面和「下载」文件夹里找比当前版本新的安装包（不会自动下载、不会自动安装）；找到就在顶栏提示', h('button', { class: 'gw-btn', onclick: () => {
        if (!(window.gewu && window.gewu.updateCheck)) { GW.toast('当前环境不支持'); return; }
        window.gewu.updateCheck().then((r) => {
          if (r && r.found) { GW.updateUi(r); GW.toast('发现新版本 ' + r.version, 3600); }
          else GW.toast('没有发现更新的安装包（当前 ' + GW.APP_VERSION + '）');
        }).catch(() => GW.toast('检查失败'));
      } }, '立即检查')) : null,
      row('自定义图形（AI 写形状）', 'AI 助手里的「自定义图形」总开关。关闭后不加载已有自定义图形、不显示「＋」入口，板书里用过的自定义图形也不再画（数据还在，重新打开就恢复）。课堂上不想让学生自己加形状时关掉它', tog('customShapes', () => { if (GW.shapeSelf && GW.shapeSelf.applyGate) GW.shapeSelf.applyGate(); })),
      ...uiCustomRows(),
      row('界面透明度', '顶栏、工具栏、底部工具条、参数面板与设置窗口一起调淡 —— 板书与图形不受影响。上课嫌控件抢眼就调低它；调完记住，下次启动还是这个值', uiAlphaSlider()),
      row('工具栏按钮样式', '圆形 / 方形 / 胶囊 —— 只换形状，不影响功能；选完立刻预览，下次启动还是这个样子', styleSeg.el),
      row('工具栏按钮颜色', '当前选中的按钮用这个颜色。预设六色，或点右边方块自己调（选浅色会自动配深色图标）', h('div', { class: 'look-ctl' }, dockSw, dockPick)),
      row('参数面板避让图形', '默认开启。打开后，「参数」「样式」这些调参面板会优先跳到选中图形的外侧（右/左/下/上），不再压住图形本身；图形太大四周放不下时，选遮挡最少的一侧。想让它紧贴按钮弹出的可以关掉', tog('paramAside', () => { if (curPop) repositionPop(); })),
      ...barLookRows(),
      row('画布模式', '无限平移：可以一直往四周拖，缩放仍可用。单轴无限 · 100%：拖动只走水平或竖直一个方向（斜着拖也只走一边），缩放永远 100% —— 滚轮、双指捏合、左下角的 ± 都不改变缩放', canvasSeg.el),
      row('恢复画布默认设置', '一键把全部 111 项设置恢复为「本机当前配置」的出厂默认，并把画布模式、缩放/位置与工具栏布局复位到采集时的真实值；「恢复默认外观」也能达到同样效果。旁边「记为默认」可把当前这套更新成新的默认', (() => {
        return h('div', { class: 'look-ctl' },
          GW.ui.button({
            label: '恢复画布默认设置',
            onClick: () => {
              const d = readCanvasDefault();
              // 2.1.1（R6）：与「恢复默认外观」一致，无条件整体应用本机真实默认（111 项），
              // 下面再把画布模式 / 缩放 / 平移 / 工具栏布局按快照精确复位。
              if (GW.applyFactoryDefaults) GW.applyFactoryDefaults();
              if (!d) {
                // 快照缺失/损坏：回落原有出厂行为，保证按钮永远可用
                S.canvasMode = 'inf2d';
                if (GW.uiCustom) GW.uiCustom.reset();
                GW.saveSettings();
                canvasSeg.set('inf2d');
                for (const f of afterReset) { try { f(); } catch (e) { /* 单页同步失败不影响复位 */ } }
                GW.setView(0, 0, 1);
                GW.toast('未找到本机默认记录，已按出厂设置恢复', 2800);
                return;
              }
              S.canvasMode = d.canvasMode;
              S.uiCustom = cloneCanvasCfg(d.uiCustom);
              GW.saveSettings();
              canvasSeg.set(d.canvasMode);
              for (const f of afterReset) { try { f(); } catch (e) { /* 单页同步失败不影响复位 */ } }
              // 先写模式、再设视图：setView 会按 zoomLock() 把锁 100% 的模式强制拉回 s=1
              GW.setView(d.tx, d.ty, d.s);
              GW.relayoutBars();
              GW.toast('画布已恢复为本机默认设置', 2800);
            },
          }).el,
          GW.ui.button({
            label: '记为默认',
            onClick: () => { snapshotCanvasDefault(); GW.toast('已把当前画布设置记为本机默认', 2200); },
          }).el);
      })()),
      row('画布默认底色', '给当前页换底色，同时作为新页面的默认底色；要更细的底纹与「应用到所有页面」，用课堂工具 → 背景 → 调色盘', h('div', { class: 'look-ctl' }, bgSw, bgPick)),
      row('多指书写', '允许多个手指同时书写（双指快速同时按下仍为缩放）', tog('multiWrite')),
      row('手势擦除', '默认全开，装好就能用：笔拿开 1.5 秒后，巴掌一抹、或三根手指一起划过，就地擦掉；擦完还是原来那支笔。写字时手掌托在屏幕上不受影响（笔在写就只忽略）。「只手掌」= 三指仍然缩放/平移', (() => {
        const s = GW.ui.segmented({
          options: [{ value: 'all', label: '手掌 + 三指' }, { value: 'palm', label: '只手掌' }, { value: 'off', label: '关闭' }],
          // 2.1.1：回落值取自出厂默认，不再写死 'all' —— 免得默认值再调整时界面与实际行为分叉。
          value: (GW.settings.gestErase || (GW.settings.palmErase === true ? 'palm'
            : (GW.settingsDefaults ? GW.settingsDefaults().gestErase : 'all'))),
          onChange: (v) => {
            GW.settings.gestErase = v;
            GW.settings.palmErase = v !== 'off';
            GW.saveSettings();
            GW.toast(v === 'off' ? '手势擦除已关闭' : v === 'palm' ? '手掌一抹即擦（三指仍是缩放）' : '手掌 / 三指都能擦');
          },
        });
        return s.el;
      })()),
      row('四指召唤工具盘', '触摸大屏上，四指同时轻点屏幕任意位置 ⇒ 工具盘飞到笔尖旁并展开，不用再去右下角找球。要求四指在 0.2 秒内同时落下、且笔已离屏 0.4 秒；三指擦除照旧（只慢 0.09 秒，感知不到）', tog('ballSummon')),
      row('鼠标指示点', '给鼠标位置加一枚高对比度小圆点 —— 投影时后排也看得清鼠标在哪。「自动」= 只在鼠标上显示（触摸 / 手写笔不显示，避免和真实触点重影）', (() => {
        const sg = GW.ui.segmented({
          options: [{ value: 'auto', label: '自动' }, { value: 'always', label: '始终' }, { value: 'off', label: '关闭' }],
          value: S.ptrDot || 'auto',
          onChange: (v) => {
            S.ptrDot = v; GW.saveSettings();
            // 关掉时立刻收掉（不等下一次 pointermove）：老师点「关闭」就该马上看不见
            const d = document.getElementById('cur-dot');
            if (d && v === 'off') d.style.display = 'none';
            GW.toast(v === 'off' ? '鼠标指示点已关闭' : v === 'always' ? '指示点始终显示' : '指示点跟随鼠标（触摸/笔不显示）');
          },
        });
        return sg.el;
      })()),
      row('指示点静默隐藏', '鼠标不动多久后把指示点淡出。3 秒是对着工具盘自身 3.5 秒变暗的节奏定的：先收光标、再暗球，画面不会「抽」两下。选「永不」时鼠标点一直留着，只有按下、移出窗口或关掉指示点才收', (() => {
        const sg = GW.ui.segmented({
          options: [{ value: '0', label: '永不' }, { value: '1000', label: '1 秒' }, { value: '2000', label: '2 秒' }, { value: '3000', label: '3 秒' }, { value: '5000', label: '5 秒' }],
          value: String(idleTier(S.ptrIdleMs, 3000)),
          onChange: (v) => { S.ptrIdleMs = +v; GW.saveSettings(); GW.toast(+v === 0 ? '指示点不再自动淡出' : '指示点 ' + (+v / 1000) + ' 秒后淡出'); },
        });
        return sg.el;
      })()),
      // 2.2.3（R5）：手写笔那一路原先是写死的 4000（DOT_IDLE_PEN），没有任何入口。
      // 有的数位板驱动抬笔不发 pointerleave，笔环会僵在屏上，老师只能改设置绕开 —— 所以给它开一行。
      row('笔尖静默隐藏', '手写笔抬起来之后，笔尖光环多久淡出。4 秒是给「写完立刻换位置再写」留的余量；觉得笔环老挡着板书就调短，或者选「永不」', (() => {
        const sg = GW.ui.segmented({
          options: [{ value: '0', label: '永不' }, { value: '1000', label: '1 秒' }, { value: '2000', label: '2 秒' }, { value: '3000', label: '3 秒' }, { value: '4000', label: '4 秒' }, { value: '5000', label: '5 秒' }],
          value: String(idleTier(S.ptrIdlePenMs, 4000, IDLE_TIERS_PEN)),
          onChange: (v) => { S.ptrIdlePenMs = +v; GW.saveSettings(); GW.toast(+v === 0 ? '笔尖光环不再自动淡出' : '笔尖光环 ' + (+v / 1000) + ' 秒后淡出'); },
        });
        return sg.el;
      })()),
      row('书写预设', '一次把笔宽、平滑、笔锋、压感、识别灵敏度调到互相配套的一组值 —— 不用再一个个试。选完仍可继续单项微调（下面的滑杆照旧生效）', (() => {
        const opts = [{ value: 'default', label: '默认' }, { value: 'smooth', label: '顺滑' }, { value: 'precise', label: '精细' }, { value: 'board', label: '板书' }];
        const sg = GW.ui.segmented({
          options: opts, value: S.penPreset || 'default',
          onChange: (v) => {
            const p = GW.pen && GW.pen.applyPreset ? GW.pen.applyPreset(v) : null;
            GW.toast('书写预设：' + ((p && p.label) || v) + (v === 'default' ? '（原样）' : ' —— 笔宽 ' + S.penWidth + '、平滑 ' + (S.penSmooth || '关')), 2200);
          },
        });
        return sg.el;
      })()),
      row('笔种', '八支笔，各有一套独立的宽度律与收笔方式：中性笔（默认，与以前完全一样）、圆珠笔与硬笔（红外屏上最稳，笔锋不累赘）、钢笔与毛笔（电磁笔上有提按）、铅笔与粉笔（带颗粒）、马克笔（平头）。每格左边是这支笔写出来的真实样子', (() => {
        const d = GW.pen ? GW.pen.device() : 'unknown';
        const IS = GW.inkStyle;
        const tip = IS ? IS.suggest(d) : null;
        const box = h('div', null, penStyleGrid(GW.tool.pen));
        if (tip) box.append(h('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '12.5px' } }, '这台机器（' + (GW.pen ? GW.pen.short : '识别中') + '）建议：' + ((IS.of(tip.id) || {}).label || '') + ' —— ' + tip.why));
        return box;
      })()),
      row('笔迹粗细随缩放', '关闭时：无论画布缩放多少，笔在屏幕上的粗细不变', tog('penScaleWithZoom')),
      row('自动反差墨色', '底色和墨色太接近时（典型：黑板上用白笔写满一屏，切到白底投影 / 打印后一片白）按当前底色的墨色画出来。只影响显示，笔迹本身的颜色不变，随时可逆', tog('autoContrastInk', () => GW.requestRender())),
      row('输入设备', '自动识别红外屏 / 电磁笔，并按设备优化笔迹。识别不准时手动指定即可', devCtl),
      row('教室白板笔锋', '仅用于红外触控。普通笔按速度变化粗细，毛笔实时绘制渐细的短尾。两种笔都保留实际落点。', tog('penBoardFeel')),
      row('笔锋（起收笔出锋）', '按行笔速度做粗细变化：起笔由细渐粗、收笔由粗渐细，快写细、慢写饱满。红外屏没有压感，这是让笔迹「有笔锋」的唯一办法', taperSeg.el),
      row('压感灵敏度', '电磁笔/压感屏上「用力压」和「轻轻划」的粗细差多少。1 = 常规；调高更灵敏（轻碰就细、重按更粗），调低更迟钝。红外屏（无压感）时这个滑杆改变的是「写快写慢的粗细差」', GW.ui.slider({
        label: '灵敏度', min: 0.4, max: 3, step: 0.1, unit: '×',
        value: (typeof S.penPress === 'number' ? S.penPress : 1),
        onInput: (v) => { S.penPress = +v; GW.saveSettings(); },
      }).el),
      row('倾斜笔锋', '笔杆放平时线条自动变宽（像铅笔侧锋）。只有支持倾斜的电磁笔才有数据；红外屏与鼠标没有倾斜信息，开了也没有变化。默认关，避免升级后手感突然改变', tog('penTilt')),
      // 1.7.4（R6）：尺规读数单位。只换标签文字，刻度与吸附不动。
      row('尺规单位', '直尺右上角那行读数用厘米还是英寸显示。尺子本身的厘米刻度、吸附距离与量角器角度都不变', (() => {
        const s3 = GW.ui.segmented({
          options: [{ value: 'cm', label: '厘米' }, { value: 'in', label: '英寸' }],
          value: S.geoUnit === 'in' ? 'in' : 'cm',
          onChange: (v) => { S.geoUnit = v; GW.saveSettings(); if (GW.geo && GW.geo.rebuild) GW.geo.rebuild(); GW.toast(v === 'in' ? '尺规读数改用英寸' : '尺规读数改用厘米', 1600); },
        });
        return s3.el;
      })()),
      // 2.0.6（C）：新直尺的默认长度。已插入的尺子拖右端橙色圆钮单独改，两者互不影响。
      row('直尺默认长度', '只管「新插入」的直尺；已插入的尺子拖右端橙色圆钮就能单独改长短（4–30 cm，半厘米一档），改动可撤销、随板书保存。自适应 = 按当前视口宽度取一半', (() => {
        const v = Number(S.geoRulerLen);
        const cur = Number.isFinite(v) && v > 0 ? String(v) : 'auto';
        const sg = GW.ui.segmented({
          options: [{ value: 'auto', label: '自适应' }, { value: '10', label: '10 cm' }, { value: '15', label: '15 cm' }, { value: '20', label: '20 cm' }, { value: '30', label: '30 cm' }],
          value: cur,
          onChange: (n) => {
            if (n === 'auto') delete S.geoRulerLen; else S.geoRulerLen = +n;
            GW.saveSettings();
            GW.toast(n === 'auto' ? '新直尺按视口宽度自适应' : '新直尺默认 ' + n + ' cm', 1600);
          },
        });
        return sg.el;
      })()),
      // 1.7.4（R8）：橡皮按类型筛选（默认全开 = 1.7.3 的老行为）
      row('橡皮只擦哪些', '关掉某一类，橡皮从它上面划过去也不动它。比如关掉「高亮」时，擦手写不会连带把荧光底色擦掉', (() => {
        const F = Object.assign({ ink: true, hl: true, shape: true, obj: true }, S.eraserFilter || {});
        S.eraserFilter = F;
        const box = h('div', { class: 'ef-box' });
        [['ink', '手写'], ['hl', '高亮'], ['shape', '图形'], ['obj', '卡片']].forEach(([k, label]) => {
          const cb = h('input', { type: 'checkbox' });
          cb.checked = F[k] !== false;
          cb.onchange = () => { F[k] = cb.checked; GW.saveSettings(); };
          box.append(h('label', { class: 'ef-item' }, cb, h('span', null, label)));
        });
        return box;
      })()),
      row('收笔锋型', '汉字常见的三种收尾：出锋（撇、捺、悬针，渐细到尖）、藏锋（横、竖回锋，收得圆）、方切（顿笔方收）。这里手动选过之后，就不再跟笔种走（笔种自带的锋型见工具栏 → 笔 → 笔种）', (() => {
        const s2 = GW.ui.segmented({
          options: [{ value: 'sharp', label: '出锋' }, { value: 'round', label: '藏锋' }, { value: 'flat', label: '方切' }],
          value: S.penTip || 'sharp',
          onChange: (v) => {
            S.penTip = v;
            // 2.0.3：手动选锋型 = 明确表态，从此不再被笔种默认值覆盖
            S.penTipAuto = false;
            GW.saveSettings();
            GW.toast(v === 'sharp' ? '收笔出锋：渐细到尖（撇/捺）' : v === 'round' ? '收笔藏锋：收得圆润（横/竖）' : '收笔方切：顿笔方收', 2000);
          },
        });
        return s2.el;
      })()),
      row('出锋长度', '尾巴收细的那一段有多长。小 = 短促有力；大 = 长撇长捺、毛笔味更足（毛笔自动再乘 1.6 倍）', GW.ui.slider({
        label: '长度', min: 0.3, max: 2, step: 0.1, unit: '×',
        value: (typeof S.penExit === 'number' ? S.penExit : 1),
        onInput: (v) => { S.penExit = +v; GW.saveSettings(); },
      }).el),
      row('笔迹抖动抑制', '默认关闭 —— 墨点位置就等于手指位置，最跟手。觉得「写小字发毛」再调到 轻/中/强；加档会带来细微滞后', smoothSeg.el),
      row('图形识别（原智能笔）', '1.3.5 起识别并进了「笔」，不用再切换。自动：像标准图形就规整（矩形、正方形、等边三角形、圆），同一处连笔写字不会被规整；手写体保持原来的笔锋与压感。停笔才识别：收笔时笔尖停一下才规整，最接近 Notability 的手感。关闭：完全按手写笔迹落笔，不规整', (() => {
        const s = GW.ui.segmented({ options: [{ value: 'auto', label: '自动' }, { value: 'hold', label: '停笔才识别' }, { value: 'off', label: '关闭' }], value: GW.settings.smartSnap || 'auto', onChange: (v) => { GW.settings.smartSnap = v; GW.saveSettings(); } });
        return s.el;
      })()),
      // 2.2.3（R7）：小图形停笔驻留 —— 面积门（SHAPE_MIN_AREA_PX2 / SHAPE_MIN_SIDE_PX）一个字没动，
      // 只在「收笔前停住了」这个时间维度上开一条出口：画得小但停了一下，就当成「我确实要这个图形」。
      row('小图形停笔识别', '画得很小的矩形/三角/圆默认不规整（面积门挡着，防止写字被吃掉）。打开这个后，收笔前笔尖停住一小会儿就算「确认要这个图形」，照样规整。默认开', tog('smallShapeHold')),
      row('停笔时长', '小图形要停多久才算确认。太长会觉得「停了没反应」，太短又容易把草稿吃掉；默认 1 秒', GW.ui.slider({
        label: '停笔', min: 300, max: 2500, step: 100, unit: 'ms',
        value: (typeof S.smallShapeHoldMs === 'number' ? S.smallShapeHoldMs : 1000),
        onInput: (v) => { S.smallShapeHoldMs = +v; GW.saveSettings(); },
      }).el),
      row('笔尖跟手预测', '按行笔方向把笔尖多画一小段，抵消触摸框的固有延迟；红外屏默认开 1 帧。若觉得笔「冲出去了」就关掉', predictSeg.el),
      // R9：判据从「是不是桌面版」换成「有没有原生 PPTX 读片能力」。
      // 手机/网页上只有 native 一档（静态页要本机 Office/WPS），所以给一行说明而不是把整行藏掉 ——
      // 藏掉会让老师以为「这台设备根本不能导入 PPT」。
      GW.pptx ? row('PPTX 导入方式', GW.isElectron
        ? '默认读取课件和支持的点击动画。需要由本机 Office 或 WPS 呈现版式时，可以选择静态页。'
        : '手机/网页版直接读课件与点击动画（静态页要本机 Office/WPS，只有桌面版有）。', GW.isElectron ? GW.ui.segmented({
        options: [{ value: 'native', label: '保留动画' }, { value: 'office', label: '静态页' }],
        value: S.pptxMode || 'native', onChange: (v) => { S.pptxMode = v; GW.saveSettings(); },
      }).el : h('span', { class: 'muted' }, '保留动画')) : null,
      GW.isElectron ? row('PPT/Word 自动转为页面', '使用本机 Office 或 WPS 转换旧版 PPT、文档和需要静态转换的 PPTX。关闭后保留文件卡。', tog('officeAutoConvert')) : null,
      row('自动保存', '每 20 秒自动备份到本机，意外关闭也不丢失', tog('autosave')),
      row('GeoGebra 离线包', '已随程序内置离线包，断网可直接打开；也可在这里改用自己的 web3d 文件夹', h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, ggbLabel,
        GW.isElectron ? h('button', { class: 'gw-btn', onclick: async () => { const ps = await window.gewu.openFiles({ title: '选择 web3d 目录中的任意文件（如 web3d.nocache.js）', multi: false }); if (ps[0]) { S.ggbPath = ps[0].replace(/[\\/][^\\/]+$/, ''); GW.saveSettings(); ggbLabel.textContent = S.ggbPath; } } }, '选择') : null,
        h('button', { class: 'gw-btn', onclick: () => { S.ggbPath = ''; GW.saveSettings(); ggbLabel.textContent = '未设置（使用内置离线包）'; } }, '清除'))),
      row('PhET 离线缓存', '在有网络时一次性下载全部 124 个 PhET 仿真（约 750MB），课堂上断网也能用', h('button', { class: 'gw-btn', onclick: () => GW.resources.cacheAll() }, '开始下载')));
    // ---- 新增控件：识别灵敏度（R2 的 SNAP_RESID 变成可调）与课堂/协同的直达行 ----
    const sensRow = row('识别灵敏度', '手画到「离标准图形还有多远也认」的门槛，默认 90（＝对角线的 9%）。画得潦草认不出来就调高；觉得手写的字被吃掉就调低。1.3.2 起这个滑杆同时管矩形 / 正方形 / 等边三角形 / 圆的判据（圆按偏差分位算，这里调的是它的容差），所以拖动时能明显感到松紧变化', GW.ui.slider({
      label: '灵敏度', min: 30, max: 200, step: 5, unit: '',
      value: Math.round((typeof S.snapResid === 'number' ? S.snapResid : 0.09) * 1000),
      onInput: (v) => { S.snapResid = v / 1000; GW.saveSettings(); },
    }).el);
    const smartRow = [].slice.call(flat.children).filter((c) => {
      const b = c.querySelector('b');
      return b && b.textContent === '智能笔识别时机';
    })[0];
    if (smartRow) smartRow.after(sensRow); else flat.append(sensRow);

    // 笔优先（1.3.4）：拿笔写过的平板上，手指从「也写字」改成「拖画布」。
    // 'auto' 是常态；'on' 给「老设备把电磁笔报成触摸 / 系统不给 pen 事件」的兜底；'off' 给习惯用手指写的老师。
    const penFirstRow = row('笔优先（书写时手指拖画布）', '自动：笔最近在屏上动过，手指就用来拖画布、双指缩放，不再落墨（手掌按面积忽略）。' +
      '老是：这台设备把笔报成了触摸，识别不到笔，打开这个后手指一律只拖画布、不写字。关闭：手指照常书写与拖画布，只有笔才是笔', (() => {
      const s = GW.ui.segmented({
        options: [{ value: 'auto', label: '自动' }, { value: 'on', label: '老是（识别不到笔）' }, { value: 'off', label: '关闭' }],
        value: (GW.settings.penFirst || 'auto'),
        onChange: (v) => {
          GW.settings.penFirst = v; GW.saveSettings();
          GW.toast(v === 'off' ? '手指恢复书写' : (v === 'on' ? '手指一律拖画布（不写字）' : '自动：笔在用时手指拖画布'), 2400);
        },
      });
      return s.el;
    })());
    if (smartRow && smartRow.nextSibling) smartRow.parentNode.insertBefore(penFirstRow, smartRow.nextSibling);
    else if (smartRow) smartRow.after(penFirstRow); else flat.append(penFirstRow);
    // 第 ③ 页：固定 17 槽的深度定制 —— 每槽可以从动作目录里任选一项（系统按钮 / 基础图形 / 学科模板 / 笔参数）
    // 2.2.3（R3）：悬浮球扇环定制 —— 10 段 × (1 个主项 + 3 个子格)。
    // 存的是「引用」而不是快照：'item:<key>' 内置主项 / 'item:<key>#<c>' 内置子格 / 'dock:<动作 id>' 工具栏动作目录。
    // 这样以后内置项改了图标、动作目录加了新图形，扇环上的引用跟着一起变，不会钉死在旧值上。
    function ballRows() {
      const list = h('div', { class: 'ball-list' });
      const base = GW.ballPanel && GW.ballPanel.base ? GW.ballPanel.base() : [];
      const acts = GW.uiCustom.actions().filter((a) => a.id.indexOf('dock:') !== 0);
      const cur = () => (GW.settings.ballCustom && GW.settings.ballCustom.secs) || null;
      const mainOpts = (sel) => {
        const frag = [];
        const og1 = h('optgroup', { label: '内置扇区' });
        for (const b of base) og1.append(h('option', { value: 'item:' + b.key, selected: sel === 'item:' + b.key }, b.label));
        frag.push(og1);
        const groups = [];
        for (const a of acts) if (groups.indexOf(a.group) < 0) groups.push(a.group);
        for (const g of groups) {
          const og = h('optgroup', { label: g });
          for (const a of acts) if (a.group === g) og.append(h('option', { value: 'dock:' + a.id, selected: sel === 'dock:' + a.id }, a.label));
          frag.push(og);
        }
        return frag;
      };
      const subOpts = (mainRef, sel) => {
        const frag = [];
        const bi = mainRef && mainRef.indexOf('item:') === 0 ? base.filter((b) => b.key === mainRef.slice(5))[0] : null;
        if (bi) {
          const og = h('optgroup', { label: '这个扇区自带的格子' });
          bi.subs.forEach((t, c) => og.append(h('option', { value: 'item:' + bi.key + '#' + c, selected: sel === 'item:' + bi.key + '#' + c }, t)));
          frag.push(og);
        }
        const groups = [];
        for (const a of acts) if (groups.indexOf(a.group) < 0) groups.push(a.group);
        for (const g of groups) {
          const og = h('optgroup', { label: g });
          for (const a of acts) if (a.group === g) og.append(h('option', { value: 'dock:' + a.id, selected: sel === 'dock:' + a.id }, a.label));
          frag.push(og);
        }
        return frag;
      };
      const commit = (k, patch) => {
        const secs = (cur() || []).map((s) => ({ main: s && s.main, subs: (s && s.subs || []).slice() }));
        while (secs.length < base.length) secs.push({ main: 'item:' + base[secs.length].key, subs: [] });
        const s = secs[k] || (secs[k] = {});
        if (patch.main) s.main = patch.main;
        if (patch.sub !== undefined) { s.subs = s.subs || []; s.subs[patch.c] = patch.sub; }
        GW.ballPanel.setCustom({ secs: secs });
        rebuild();
      };
      const build = () => {
        const secs = cur();
        const out = base.map((b, k) => {
          const s = secs && secs[k];
          const mainRef = (s && s.main) || 'item:' + b.key;
          const main = h('select', { class: 'ball-sel ball-main', 'data-sec': String(k) });
          mainOpts(mainRef).forEach((f) => main.append(f));
          main.addEventListener('change', () => commit(k, { main: main.value }));
          const subs = [0, 1, 2].map((c) => {
            const sub = h('select', { class: 'ball-sel', 'data-sec': String(k), 'data-cell': String(c) });
            subOpts(mainRef, (s && s.subs && s.subs[c]) || '').forEach((f) => sub.append(f));
            sub.addEventListener('change', () => commit(k, { sub: sub.value, c: c }));
            return sub;
          });
          return h('div', { class: 'ball-row' },
            h('b', { class: 'ball-i' }, String(k + 1)),
            main, h('div', { class: 'ball-subs' }, subs));
        });
        list.replaceChildren.apply(list, out);
      };
      const rebuild = build;
      build();
      // 2.2.9：开合方式三档，出厂默认从「一次全部展开」改回「先选一项再展开」（sector）：
      // 2.2.4 起默认 all，但一开球就把当前工具 22 格摊满外环，反而压掉内环 10 个分组。
      const openSeg = GW.ui.segmented({
        options: [
          { value: 'all', label: '点一下直接展开当前功能' },
          { value: 'sector', label: '先选一项再展开' },
          { value: 'hold', label: '长按才展开' },
        ],
        value: (GW.ballPanel && GW.ballPanel.mode ? GW.ballPanel.mode() : (GW.settings.ballOpen || 'sector')),
        onChange: (v) => { GW.ballPanel.setMode(v); },
      });
      return h('div', null,
        row('悬浮球开合方式', '点开悬浮球时外圈铺什么。「点一下直接展开当前功能」= 一打开就把当前工具（笔＝12 色 / 5 档粗细 / 3 种线型…，橡皮＝撤销 / 重做 / 清空…）的二级功能铺满外圈，省掉「再点一下内环」这一步；途中换了工具，外圈会跟着换。「先选一项再展开」= 老行为，先点内环某一项才展开它的二级功能。「长按才展开」= 轻点点头老行为，按住球 0.55 秒才直接展开当前功能。窗口小于 900×700 时一律按「先选一项」铺，不然整环会顶出屏幕', openSeg.el),
        row('悬浮球扇环', '10 个内置扇区 × 每个 3 个子格 = 30 格，全都能换。这里逐格指定「点下去是什么」：可以是内置工具，也可以是工具栏动作目录里的任何一项（某个图形、某个笔色…）。某一项被展开时，它的 3 个子格就按这个顺序铺在外圈最前面（不足 3 个的用空描边格占位）。改完立刻生效；全空就保持出厂默认', list),
        row('恢复默认扇环', '把 10 个扇区的 30 个子格一次还原成出厂样子', h('button', {
          class: 'gw-btn', onclick: () => { GW.ballPanel.setCustom(null); build(); GW.toast('悬浮球扇环已恢复默认', 2200); },
        }, '恢复默认扇环')));
    }
    function dockSlotRows() {
      const list = h('div', { class: 'slot-list' });
      const build = () => {
        const cfg = GW.uiCustom.cfg();
        const acts = GW.uiCustom.actions();
        const groups = [];
        for (const a of acts) if (groups.indexOf(a.group) < 0) groups.push(a.group);
        // 2.2.3（R2）：每槽右边加一枚「预览」—— 下拉里 12 个「笔色 · 正红」光看文字分不出谁是谁，
        // 而值类动作恰恰是「看起来」的事。预览只是一个装饰节点，不参与命中，也不进槽位计数
        // （scripts/probe-ui-custom.js 硬断言 17 个 .slot-sel / 17 行 .slot-li，这里不许加行）。
        const prevOf = (node, a) => {
          node.className = 'slot-prev';
          node.replaceChildren();
          if (!a) return;
          const k = a.kind;
          if (k === 'penColor' && a.sw) {
            node.append(h('i', { class: 'sp-sw', style: { background: a.sw } }));
          } else if (k === 'penWidth') {
            node.append(h('i', { class: 'sp-w', style: { height: Math.max(2, Math.min(10, a.w || 3)) + 'px' } }));
          } else if (k === 'penDash') {
            node.append(h('svg', { class: 'sp-line', viewBox: '0 0 32 10', html: '<line x1="2" y1="5" x2="30" y2="5"' + (a.da ? ' stroke-dasharray="' + a.da + '"' : '') + '/>' }));
          } else if (k === 'penInk' || k === 'pen') {
            node.append(h('em', { class: 'sp-txt' }, k === 'penInk' ? a.label.replace(/^笔种 · /, '') : a.label));
          } else if (k === 'shape') {
            node.append(h('span', { class: 'sp-ico', html: I(a.icon || 'shapes') }));
          } else node.append(h('span', { class: 'sp-ico', html: I(a.icon || 'settings') }));
        };
        const out = cfg.slots.map((aid, i) => {
          const sel = h('select', { class: 'slot-sel', 'data-slot': String(i) });
          for (const g of groups) {
            const og = h('optgroup', { label: g });
            for (const a of acts) if (a.group === g) og.append(h('option', { value: a.id, selected: a.id === aid }, a.label));
            sel.append(og);
          }
          const prev = h('i', { class: 'slot-prev' });
          prevOf(prev, GW.uiCustom.action(aid));
          sel.addEventListener('change', () => {
            if (GW.uiCustom.setSlot(i, sel.value)) {
              const a = GW.uiCustom.action(sel.value);
              prevOf(prev, a);
              GW.toast('第 ' + (i + 1) + ' 个按钮换成「' + ((a && a.label) || sel.value) + '」', 2000);
            }
          });
          return h('div', { class: 'slot-li' }, h('b', { class: 'slot-i' }, String(i + 1)), sel, prev);
        });
        list.replaceChildren.apply(list, out);
      };
      build();
      return h('div', null,
        row('工具栏按钮（17 个槽）', '每一槽放什么由你定：系统按钮（笔、橡皮、撤销…），也可以是某个基础图形、某个学科模板，或者干脆是「笔的颜色 / 粗细 / 整笔」。下拉按「系统 / 基础 / 学科模板 / 笔」分组，改完立刻生效并记住', list),
        row('恢复默认按钮', '把 17 个槽一次还原成出厂顺序（形状、笔、橡皮、插入、课堂…）', h('button', {
          class: 'gw-btn', onclick: () => { GW.uiCustom.reset(); build(); GW.toast('工具栏按钮已恢复默认', 2200); },
        }, '恢复默认按钮')),
        row('工具条外观', '底纹色、风格、透明度、圆角、内边距这些「看起来」的选项在「外观与界面」页', h('button', { class: 'gw-btn', onclick: () => go('look') }, '去外观页')));
    }
    const clsRows = h('div', null,
      row('计时器', '上课计时 / 倒计时，可投到大屏；工具条与悬浮球里也能直接打开', h('button', { class: 'gw-btn', onclick: () => GW.classTools && GW.classTools.timer() }, '打开计时器')),
      row('随机点名', '名单在课堂工具里维护，按班级分开存（高一(1)班、高一(2)班各一份），点一下抽一位', h('button', { class: 'gw-btn', onclick: () => GW.classTools && GW.classTools.rollcall() }, '打开点名')),
      row('聚光灯', '压暗整屏、只留一个亮圈，讲题时把注意力钉在一处', h('button', { class: 'gw-btn', onclick: () => GW.classTools && GW.classTools.spotlight() }, '打开聚光灯')),
      row('计分板', '分组加分 / 减分，课堂用；关掉窗口分数不会丢', h('button', { class: 'gw-btn', onclick: () => GW.classTools && GW.classTools.scoreboard() }, '打开计分板')));
    for (const c of [].slice.call(clsRows.children)) flat.append(c);
    const dockRows = dockSlotRows();
    for (const c of [].slice.call(dockRows.children)) flat.append(c);
    // 2.2.3（R3）：扇环定制跟 17 槽同在「工具栏定制」页 —— 都是「界面上这些东西放什么」。
    const ballCfgRows = ballRows();
    for (const c of [].slice.call(ballCfgRows.children)) flat.append(c);
    // 2.2.8（CAST-05）：投屏接收缓冲三档 A/B/C。2.2.5 起一律把抖动缓冲压到 0（延迟最低），
    // 实测家用路由器上 Wi-Fi 一抖就整段花屏甚至首帧永远不来 —— 默认改回「浏览器自适配」，
    // 想让画面更跟手的人自己降到 0，网络差的人可以给 60ms 缓冲。
    flat.append(row('投屏接收缓冲', '手机投到这台电脑时，画面先攒多久再显示。攒得越少越跟手，但家里 Wi-Fi 一抖就容易花屏、卡住；卡顿明显就往「稳」调，追求零延迟就往「低」调。改完重新投一次生效', GW.ui.segmented({
      options: [
        { value: 'zero', label: '低延迟（0）' },
        { value: 'default', label: '自动（推荐）' },
        { value: 'auto60', label: '稳（60ms）' },
      ],
      value: S.castBuffer || 'default',
      onChange: (v) => { S.castBuffer = v; GW.saveSettings(); GW.toast('投屏接收缓冲：' + (v === 'zero' ? '低延迟' : v === 'auto60' ? '稳 60ms' : '自动'), 2200); },
    }).el));
    flat.append(row('平板协同（局域网）', '把这一屏投到学生平板，或用平板当手写板。开启后学生端只读，写权与翻页都由这台机器控制', h('button', { class: 'gw-btn', onclick: () => GW.lansync && GW.lansync.open() }, '打开协同')));
    // ---- 两栏壳：左 7 项导航 + 右单页滚动 ----
    const SET_PAGES = [
      { key: 'look', label: '外观与界面' },
      { key: 'pen', label: '笔与智能笔' },
      { key: 'dock', label: '工具栏定制' },
      { key: 'canvas', label: '画布与性能' },
      { key: 'cls', label: '课堂' },
      { key: 'io', label: '导入导出与同步' },
      { key: 'about', label: '关于与授权' },
    ];
    const PAGE_OF = {
      '渲染档位 · 硬件加速': 'canvas', '图形加速状态': 'canvas', '性能自检': 'canvas',
      '画布模式': 'canvas', '画布默认底色': 'canvas', '网格吸附': 'canvas', '对象吸附': 'canvas',
      '打开时回到上次位置': 'canvas',
      '笔锋（起收笔出锋）': 'pen', '笔迹抖动抑制': 'pen', '图形识别（原智能笔）': 'pen', '识别灵敏度': 'pen', '笔优先（书写时手指拖画布）': 'pen',
      '笔尖跟手预测': 'pen', '输入设备': 'pen', '教室白板笔锋': 'pen', '多指书写': 'pen', '手掌擦除': 'pen', '笔迹粗细随缩放': 'pen',
      // 2.2.3（R5）：指示点三行都归「笔与智能笔」—— 它们说的是「光标什么时候收起」，不是外观主题。
      '鼠标指示点': 'pen', '指示点静默隐藏': 'pen', '笔尖静默隐藏': 'pen',
      // 2.2.3（R7）：小图形停笔识别两行也是「笔怎么落墨」，跟图形识别同一页
      '小图形停笔识别': 'pen', '停笔时长': 'pen',
      '工具栏按钮（17 个槽）': 'dock', '恢复默认按钮': 'dock', '工具条外观': 'dock',
      '悬浮球开合方式': 'dock', '悬浮球扇环': 'dock', '恢复默认扇环': 'dock',
      '教室模式': 'cls', '教师批注': 'cls', '计时器': 'cls', '随机点名': 'cls', '聚光灯': 'cls', '计分板': 'cls', '投屏接收缓冲': 'cls', '平板协同（局域网）': 'cls',
      '导出物水印': 'io', '导出质量': 'io', 'PPTX 导入方式': 'io', 'PPT/Word 自动转为页面': 'io', '打开口令': 'io', '自动保存': 'io', 'GeoGebra 离线包': 'io', 'PhET 离线缓存': 'io',
      '免费说明': 'about', '新手引导': 'about', '免费 · 授权': 'about', '关于数理无限画布': 'about',
    };
    const pageKids = {};
    for (const p of SET_PAGES) pageKids[p.key] = [];
    for (const c of [].slice.call(flat.children)) {
      const b = c.querySelector('b');
      const t = b ? b.textContent : '';
      const k = PAGE_OF[t] || 'look';       // 未登记的（工具栏位置 / 角落控件 / 底纹外观…）都归「外观与界面」
      pageKids[k].push(c);
    }
    const nav = h('div', { class: 'set-nav' });
    const pageBox = h('div', { class: 'set-page' });
    const search = h('input', { class: 'inp set-search', type: 'search', placeholder: '搜索设置', 'aria-label': '搜索设置' });
    const body = h('div', { class: 'set-wrap' }, nav, h('div', { class: 'set-main' }, search, pageBox));
    let curKey = 'look';
    function go(key) {
      const pg = SET_PAGES.filter((p) => p.key === key)[0] || SET_PAGES[0];
      curKey = pg.key;
      search.value = '';
      for (const el of nav.children) {
        const on = el.dataset.page === curKey;
        el.classList.toggle('on', on);
        if (on) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
      }
      pageBox.replaceChildren.apply(pageBox, pageKids[curKey]);
      pageBox.scrollTop = 0;
      // 1.5.6（P1）：窄屏下分类导航是横向滚动条 —— 当前分类要自己滚进可见区，
      // 否则点完「关于与授权」连自己选的是哪一项都看不见。宽屏是竖排，这里判断后是空操作。
      const reveal = () => {
        const on = nav.querySelector('.set-nav-i.on');
        if (!on || !nav.clientWidth) return;
        const r = on.getBoundingClientRect(), nr = nav.getBoundingClientRect();
        if (r.left < nr.left) nav.scrollLeft -= (nr.left - r.left) + 12;
        else if (r.right > nr.right) nav.scrollLeft += (r.right - nr.right) + 12;
      };
      if (nav.clientWidth) reveal(); else requestAnimationFrame(reveal);   // 弹窗还没入 DOM 时等一帧
      return curKey;
    }
    for (const p of SET_PAGES) nav.append(h('button', { class: 'set-nav-i', 'data-page': p.key, onclick: () => go(p.key) }, p.label));
    search.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      if (!query) { go(curKey); return; }
      const matches = Object.values(pageKids).flat().filter((row) => row.textContent.toLowerCase().includes(query));
      pageBox.replaceChildren(...(matches.length ? matches : [h('p', { class: 'set-search-empty' }, '没有匹配的设置')]));
      pageBox.scrollTop = 0;
    });
    const want = showSettings._want;
    showSettings._want = null;
    go(want || 'look');
    GW.setPage = go;                                   // 探针入口（scripts/probe-settings-nav.js）
    GW.setPageList = () => SET_PAGES.map((p) => p.key);
    GW.dialog({ title: '设置', body, ok: '完成', cancel: null, width: 880, onClose: () => { if (devUI && devUI.token === devToken) devUI = null; GW.setPage = null; } });
  }
  // 菜单「自定义工具栏…」→ 直接落到设置第 ③ 页
  function openSettingsPage(key) { showSettings._want = key; showSettings(); }
  // 关于页正文。关于对话框和首次启动的免费说明共用这一份，免得两处说法对不上。
  function aboutContent() {
    return [
      h('div', { html: GW.LOGO }),
      h('h2', null, '数理无限画布'),
      h('p', { class: 'muted about-ver' }, '唐波 · 高中数理教学无限画布 · v' + (GW.APP_VERSION || '1.0')),
      h('p', { class: 'about-intro', style: { lineHeight: 1.7, fontSize: '14px' } }, '一块写不到边的黑板 —— 数理的推导、图像与仿真都留在同一张画布上。', h('br'), '为高中物理、数学课堂打造：无限画布书写、多格式课件导入、', h('br'), '交互式仿真、尺规作图、课堂工具与桌面批注。'),
      // 快捷键一览：这些键一直在（input.js 的 keydown），以前界面上没写过，老师以为没有
      h('p', { class: 'muted', style: { fontSize: '12px', lineHeight: 1.7 } },
        '常用快捷键：Ctrl+Z 撤销 · Ctrl+Shift+Z / Ctrl+Y 重做 · Ctrl+S 保存 · Ctrl+O 打开 · PageUp / PageDown 翻页 · Shift+← / → 平移一页 · Ctrl+滚轮 缩放'),
      h('div', { class: 'about-qrs' },
        h('div', { class: 'about-me' },
          h('div', { class: 'about-qr' }, h('img', { src: GW.assetPath('donate', 'assets/donate-gewu-official-tangbo.jpg'), alt: '打赏二维码', draggable: 'false' })),
          h('div', { class: 'about-qr-txt' },
            h('b', null, '制作者：' + GW.ident('author', '唐波')),
            h('span', null, GW.ident('authorRole', '高中物理教师 · 一线课堂使用者'), h('br'), GW.ident('authorNote', '这块黑板一直在教室里用，也在一直改。'), h('br'), GW.ident('donateNote', '如果它帮到了你，欢迎扫码打赏 ☕')))),
        h('div', { class: 'about-me' },
          h('div', { class: 'about-qr' }, h('img', { src: GW.assetPath('qq', 'assets/qq-group-gewu-979985385.png'), alt: 'QQ 交流群二维码', draggable: 'false' })),
          h('div', { class: 'about-qr-txt' },
            h('b', null, GW.ident('groupLabel', 'QQ 交流群') + '：' + GW.ident('group', '979985385')),
            h('span', null, GW.ident('groupNote', '手机 QQ 扫码进群，也可以直接搜群号。'), h('br'), GW.ident('groupNote2', '用着有问题、想要新功能，都可以在群里说。'))))),
      h('p', { class: 'muted', style: { fontSize: '12px' } }, '内置组件：pdf.js · KaTeX · Ruffle · Electron', h('br'), 'PhET 仿真版权归科罗拉多大学所有（CC-BY），GeoGebra / Desmos 版权归各自所有者。'),
      // 免费声明 + 授权条款：三处冗余（欢迎页 / 设置 / 关于），改掉一处还有两处
      h('p', { class: 'free-decl', style: { fontSize: '12px', lineHeight: 1.7 } },
        GW.ident('antiPiracy', '本软件完全免费：凡是花钱买来的，都不是官方版本。'), h('br'),
        GW.ident('license', '免费使用；禁止转售，禁止修改后以任何名义收费发布。'), h('br'),
        GW.ident('officialNote', '官方只从作者本人和上面这个 QQ 群发布，别的渠道拿到的都可能是改过的。')),
      h('p', { class: 'muted', style: { fontSize: '11px' } }, GW.buildLine()),
      // 被改过的包才填上（官方包永远空着）—— 见 paintBuildWarn()
      h('p', { class: 'build-warn', style: { display: 'none', fontSize: '12px', lineHeight: 1.6 } }),
    ];
  }

  // 用验签结论去填那条红字：只有被改过的包才显示，官方包永远空着
  function paintBuildWarn(root) {
    const el = root && root.querySelector ? root.querySelector('.build-warn') : null;
    if (!el) return;
    GW.buildStatus().then((st) => {
      if (st.state === 'tampered') { el.textContent = st.text; el.style.color = '#d33'; el.style.display = ''; }
    });
  }

  function showAbout() {
    const body = h('div', { class: 'about' }, aboutContent());
    paintBuildWarn(body);
    GW.dialog({ title: '', width: 500, cancel: null, ok: '好的', body: body });
  }

  // 只有被改过的包才会走到这里：顶栏挂一条红色提示 + 一次 toast。
  // 官方包永远不出现这条 —— 所以对正常使用零影响。
  GW.onBuildTampered = (st) => {
    const bar = document.getElementById('topbar');
    if (bar && !document.getElementById('build-warn')) {
      bar.append(h('div', {
        id: 'build-warn', title: '点开看详情',
        onclick: () => GW.dialog({
          title: '', width: 560, cancel: null, ok: '知道了',
          body: h('div', { class: 'about' },
            h('p', { style: { color: '#d33', lineHeight: 1.7 } }, st.text),
            h('p', { class: 'muted', style: { fontSize: '12px' } }, GW.buildLine())),
        }),
      }, '⚠ 非官方构建'));
    }
    GW.toast('⚠ 本程序可能被改过 —— 点顶栏红色提示看详情');
  };

  // 首次启动的免费说明：点掉按钮才能进画布。
  // 故意做成关不掉的 —— 不给「取消」按钮、不接管 Escape、也不响应点背景，
  // 因为这条提示就是一次性把话说明白：软件免费，打赏随意。
  function showFreeGate() {
    const wrap = h('div', { class: 'dlg-wrap free-gate' });
    wrap.append(h('div', { class: 'dlg', style: { width: '560px' } },
      h('div', { class: 'dlg-h' }, ''),
      h('div', { class: 'dlg-b' },
        h('div', { class: 'free-note' },
          h('b', null, '这个软件完全免费'),
          h('span', null, '没有试用期、没有会员、没有功能锁，以后也不会有。', h('br'), '打赏只是请作者喝杯咖啡 —— 不打赏，全部功能照样能用。')),
        h('div', { class: 'about' }, aboutContent())),
      h('div', { class: 'dlg-f' }, h('button', {
        class: 'gw-btn primary',
        onclick: () => {
          GW.settings.freeNoticeSeen = true; GW.saveSettings(); wrap.remove();
          // 1.4.3：免费声明点掉之后自动开新手引导（只在从没走过的时候，三端一致）
          if (GW.onboard) setTimeout(() => GW.onboard.auto(), 180);
        },
      }, '我没付钱我不是冤大头'))));
    document.body.append(wrap);
    paintBuildWarn(wrap);
  }
  // 设置里「免费说明 · 再看一次」用
  GW.freeNotice = showFreeGate;
  // 探针与快捷键要用（scripts/probe-ui-custom.js 靠它验证「界面自定义」面板真的在设置里）
  GW.showSettings = showSettings;
  // 软著截图脚本要能直接打开「关于」页（正文里那行走访路径依赖按钮文案，改文案就失效）
  GW.showAbout = showAbout;

  // =============== 欢迎页 ===============
  function buildWelcome() {
    const act = (icon, label, fn, primary) => h('button', { class: 'gw-btn' + (primary ? ' primary' : ''), onclick: fn, html: I(icon) + '<span>' + label + '</span>' });
    const restore = act('refresh', '继续上次的板书', async () => { if (await GW.storage.restore()) GW.toast('已恢复'); else GW.toast('没有找到自动备份'); });
    restore.style.display = 'none';
    const wc = h('div', { id: 'welcome' }, h('div', { class: 'wc' },
      h('div', { html: GW.LOGO.replace('<svg', '<svg class="logo"') }),
      h('h1', null, GW.ident('app', '数理无限画布')),
      h('p', null, GW.ident('tagline', '唐波 · 高中数理教学无限画布')),
      h('div', { class: 'wc-acts' },
        act('pen', '开始书写', () => GW.tool.set('pen'), true),
        act('ruler', '直尺', () => GW.geo.add('ruler')),
        act('insert', '导入课件', () => GW.importer.pick('all')),
        act('math', '数学工具', () => simDrawer('math')),
        act('physics', '物理仿真', () => simDrawer('physics')),
        act('hand', '拖动画布', () => GW.tool.set('hand')),
        act('folder', '打开板书', () => GW.storage.open()),
        restore),
      h('p', { class: 'muted', style: { marginTop: '6px' } }, '把 PDF、图片、视频、SWF、GeoGebra、PPT、exe 直接拖进来 · 默认落笔即书写，点「交互」拖动整块画布 · 点击右侧悬浮球快速调用工具'),
      // 免费声明三处冗余之一（另两处在设置页与关于页）：改掉一处还有两处
      h('p', { class: 'free-decl', style: { marginTop: '4px', fontSize: '12px' } },
        GW.ident('antiPiracy', '本软件完全免费：凡是花钱买来的，都不是官方版本。'),
        ' 官方 ' + GW.ident('groupLabel', 'QQ 交流群') + '：' + GW.ident('group', '979985385')),
      h('p', { class: 'muted', style: { marginTop: '2px', fontSize: '11px' } }, GW.buildLine())));
    document.body.append(wc);
    const upd = () => {
      const p = GW.page();
      const show = !(p.ink.length || p.objs.length || GW.doc.pages.length > 1 || GW.geo.tools.length || GW.tool.current !== 'hand');
      wc.style.display = show ? '' : 'none';
      // 欢迎页在最上层，但 #capture（书写层）是固定全屏的，会挡住按钮 —— 显示欢迎页时让它让位
      document.body.classList.toggle('welcome-on', show);
    };
    ['history', 'page', 'doc-loaded', 'dirty', 'tool', 'geo'].forEach((e) => GW.bus.on(e, upd));
    upd();
    (async () => {
      // 有自动备份才亮「恢复上次」：桌面查用户目录里的 autosave.gewu，网页 / 手机查 localStorage 单槽
      const has = await hasAutoBackup();
      if (has) restore.style.display = '';
    })();
  }

  // =============== 启动 ===============
  function loadSims() {
    // 单文件版（scripts/build-mobile-single.py）把 26 个仿真已经并进页面，这里再按 URL 加载会 404
    if (window.__SIM_BUNDLE__) return Promise.resolve();
    return Promise.all(SIM_FILES.map((f) => new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'sims/' + f + '.js';
      s.onload = res;
      s.onerror = () => { console.warn('仿真缺失：', f); res(); };
      document.head.append(s);
    })));
  }

  async function boot() {
    // 本机学科库的根目录：拿到后 html 课件卡片会把它记成相对路径（libRel），换机器也能打开
    if (GW.isElectron) window.gewu.userPath('library').then((p) => { GW.libRoot = p; });
    document.body.dataset.tool = GW.tool.current;   // 默认「笔」：打开就能写
    GW.initBoard();
    GW.initInput();
    GW.initDrop();
    GW.initGeo();
    GW.initStorage();
    // 渲染档位：先按设置里的选择生效，显卡状态稍后由主进程推来再自动校正
    if (GW.perf) {
      GW.perf.apply({ mode: GW.settings.renderMode || 'auto' });
      if (GW.isElectron && window.gewu.gpuStatus) window.gewu.gpuStatus().then((g) => { if (GW.perf.setGpu(g)) GW.refreshRenderScale(); }).catch(() => {});
      window.gewu && window.gewu.on && window.gewu.on('gpu-status', (g) => { if (GW.perf.setGpu(g)) GW.refreshRenderScale(); });
    }
    // 1.1.15：恢复上次的画笔颜色/线宽（桌面批注层另开窗口时靠这条保持「进批注不前突变」）
    try {
      if (GW.settings.penColor) GW.tool.pen.color = GW.settings.penColor;
      if (GW.settings.penWidth) GW.tool.pen.width = GW.settings.penWidth;
      // 1.3.5：'smart' 已并入 'pen'，老存档要迁移，否则笔会停在一个不存在的模式上
      if (GW.settings.penMode) GW.tool.pen.mode = (GW.settings.penMode === 'smart' ? 'pen' : GW.settings.penMode);
      if (GW.settings.penStyle) GW.tool.pen.style = GW.settings.penStyle;
      // 1.3.2：磁场填充的默认档也要记住，否则每次重开都得重新点
      // 1.3.3：磁场填充不再放在基础图形页（老师说那三个按钮污染了主页），改成「画完选中图形 → 参数」里单个改。
      // 所以这里也不再从设置里恢复全局档位，新画的图形一律不带符号。
      if (GW.settings.hlColor) GW.tool.hl.color = GW.settings.hlColor;
    } catch (e) { /* 画笔模块没起来也不影响启动 */ }
    // 任何改笔色的路径（色板 / 深浅底自动反相）都落盘，另一个窗口下次打开就一致
    GW.bus.on('pen', () => {
      try {
        GW.settings.penColor = GW.tool.pen.color;
        GW.settings.penWidth = GW.tool.pen.width;
        GW.settings.penStyle = GW.tool.pen.style || 'solid';
        GW.settings.penMode = GW.tool.pen.mode || 'pen';
        GW.settings.hlColor = GW.tool.hl.color;
        GW.settings.hlWidth = GW.tool.hl.width;
        GW.saveSettings();
      } catch (e) { /* 存不下就算了，别让书写中断 */ }
    });
    buildTop();
    // T05：storage.js 每次备份成功/失败都会 saveState('backup', { quota })，红条跟着它走
    GW.bus.on('save-state', syncQuotaBar);
    syncQuotaBar();
    buildDock();
    applyLook();   // 1.1.3：把上次选的按钮形状/颜色套上去（在 buildDock 之后，样式变量对整条工具栏都生效）
    applyBarLook();   // 1.1.10：底纹色/风格/透明度/圆角/内边距/按钮底纹 + 防遮挡三件
    hookBarDodge();   // 1.1.10：书写淡出 + 贴边浮出（只挂监听，不占资源）
    buildBars();
    buildSelUI();
    buildBall();
    // 1.7.0（T11）：小地图挂到界面层 —— 默认不显示（设置里「小地图」打开），挂上之后它自己订阅
    // 'rendered' 事件低频重绘（≥250ms），不在渲染主循环里做任何事。
    if (GW.minimap) { GW.minimap.mount(); if (GW.settings.minimap) GW.minimap.show(); }
    // 1.1.14：透明批注层不用欢迎页（它要的是「桌面立刻能写」），也不弹免费声明
    if (!GW.overlayMode) buildWelcome();
    // 顶栏被隐藏后的键盘兜底：Ctrl+, 永远能叫出设置（和齿轮、悬浮球「工具 → 设置」三路互备）
    addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== ',' || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      showSettings();
    });
    // 构建指纹 + 身份验签：官方包静默通过，被改过才在顶栏报出来（见 core/build.js）
    GW.buildStatus();
    // 第一次打开：先讲清楚「免费」，点掉按钮才放行进画布
    if (!GW.settings.freeNoticeSeen && !GW.overlayMode) showFreeGate();
    GW.page().bg = Object.assign({}, GW.settings.defaultBg);
    // 1.1.14 透明批注层：底色/材质/格线全部关掉（窗口本身就是透明的），老师要格线时
    // 自己在「格线」按钮里切 —— board.js 会按 overlay 规则画成双描边，压在任何桌面上都看得见。
    // 1.1.14 修正：默认格线从 grid 改成 none。进批注层的目的是「给桌面蒙一层透明画布」，
    // 一进来就铺满方格会挡住桌面内容，老师还以为是底色没清干净。
    if (GW.overlayMode) GW.page().bg = { color: 'none', pattern: 'none', material: 'plain' };
    applyPanelAlpha();   // 上次调过的面板透明度，开机就生效
    applyLaserSettings(); // 上次选过的激光笔颜色/粗细/消失方式（1.1.14）
    applyUiAlpha();      // 上次调过的界面透明度，开机就生效
    syncDark();
    // 画布原点放在屏幕中心
    GW.setView(innerWidth / 2, innerHeight / 2, 1);
    GW.doc.dirty = false;
    await loadSims();
    GW.bus.emit('sims-loaded');
    if (GW.isElectron) {
      const p = await window.gewu.pendingOpen();
      if (p && !GW.overlayMode) await GW.storage.open(p);
      // R5：双击 .ggb 时（文件关联把路径放进 argv）直接插一张 GeoGebra 卡片预览
      const g = window.gewu.pendingGgb ? await window.gewu.pendingGgb() : null;
      if (g && !GW.overlayMode) GW.importer.importOne(g).catch((e) => GW.toast('GeoGebra 文件打不开：' + (e && e.message ? e.message : g), 4000));
    }
    // 1.1.14：透明批注层的最后一步 —— 展开四角/底栏、挂上「鼠标模式 / 发送 / 退出」与快捷键
    if (GW.overlayMode && GW.overlay && GW.overlay.install) GW.overlay.install();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();








