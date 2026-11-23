/* 整页模板面板（2.0.7 · S2/S3）—— 49+ 张纸与 42 个内容模板的入口。
 *
 * 为什么要重写：1.7 的面板把 4 张纸排成一行还够用；49 张纸 + 42 个模板一次全画缩略图，
 * 打开抽屉要 1s 以上（每张缩略图都是一次全页 canvas 绘制）。这里的四条硬约束：
 *   ① 分类芯片（书写/横线/计划/音乐/学科/几何/课堂）+ 组内折叠 —— 首屏 ≤20 卡片；
 *   ② 缩略图懒渲染（IntersectionObserver）—— 滚到眼前才画；
 *   ③ 搜索框（id / 中文名模糊匹配）；
 *   ④ 二级「纸张设置」：行距 18–48、横/竖版、深/浅纸，改完即时重绘当前页。
 *
 * 只接管「绘制面板」，套用逻辑仍走 board.js 的 API（applyPageTpl / addPageContent /
 * enterPaged），所以探针可以直接调用 API，不依赖这个文件。
 */
(function () {
  const GW = (window.GW = window.GW || {});
  const h = GW.h;
  if (!h) return;                      // kit 没加载（探针环境异常）就直接退出，不影响画布

  const CATS = ['全部', '书写练习', '横线分栏', '计划清单', '音乐', '学科实验', '几何思维', '课堂会议', '其他'];
  const hkey = 'gw.tpl.collapsed';

  function collapsed() {
    try { return JSON.parse(localStorage.getItem(hkey) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveCollapsed(o) {
    try { localStorage.setItem(hkey, JSON.stringify(o)); } catch (e) { /* 隐私模式忽略 */ }
  }

  // 缩略图：120×150 定尺，纸在 794×1123 的空间里画完再缩放（与真实纸张同一个 draw）
  // 缩略图的线宽地板：纸张的线是 0.66~1.1 **世界单位**，缩到 120px 宽只剩 0.1 设备像素 ——
  // 抗锯齿后几乎全白（用户看到的就是「缩略图发灰/空白」）。这里用 Proxy 把 lineWidth 抬到
  // 4 世界单位（≈1.2 设备像素），只影响缩略图，真实页面仍是原来的细线。
  function thick(c2) {
    return new Proxy(c2, {
      get(t, p) { const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; },
      set(t, p, v) { t[p] = (p === 'lineWidth' ? Math.max(v, 4) : v); return true; },
    });
  }
  function thumb(cv, fn) {
    const dpr2 = Math.min(2, window.devicePixelRatio || 1);
    // 240×300 缓冲区（显示 120×150）：2× 采样 + 线宽地板，细线缩略图才不会糊成一片白
    cv.width = 240; cv.height = 300;
    const c2 = cv.getContext('2d');
    c2.setTransform(240 / 120, 0, 0, 300 / 150, 0, 0);
    c2.fillStyle = '#fff'; c2.fillRect(0, 0, 120, 150);
    c2.setTransform(240 / 794, 0, 0, 300 / 1123, 0, 0);
    fn(thick(c2));
  }

  let io = null;
  function lazy(cv, fn) {
    if (!('IntersectionObserver' in window)) { thumb(cv, fn); return; }
    if (!io) {
      io = new IntersectionObserver((es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          const f = e.target._gwPaint;
          e.target._gwPaint = null;
          try { if (f) f(); } catch (err) { /* 画不出来不影响卡片 */ }
        }
      }, { root: null, rootMargin: '120px' });
    }
    cv._gwPaint = () => thumb(cv, fn);
    io.observe(cv);
  }

  // 面板本体：app.js 的 GW.newPageDialog() 只负责把它塞进抽屉（这里只管返回 body）
  GW.tplPanel = function () {
    const nameIn = h('input', { class: 'gw-in', placeholder: '页名（可留空）', style: { width: '100%' } });
    const search = h('input', { class: 'gw-in', type: 'search', placeholder: '搜索纸张 / 模板（中文名或 id）', style: { width: '100%', marginTop: '8px' } });
    const chips = h('div', { class: 'tpl-chips' });
    const paperWrap = h('div', {});
    const cGrid = h('div', { class: 'tpl-grid ctl-grid' });
    let cat = '全部', q = '';

    const closeIfDrawer = () => { if (document.querySelector('.drawer')) GW.closeDrawer ? GW.closeDrawer() : null; };

    // ---------- 套用 ----------
    const applyPaper = (p) => {
      const pg = GW.page();
      pg.paper = p.id;
      if (p.cfg) pg.paperCfg = Object.assign({}, p.cfg, pg.paperCfg || {});
      pg.box = GW.ensurePageBox(pg);
      if (GW.repaintBg) GW.repaintBg();
      if (GW.enterPaged) GW.enterPaged(true); else if (GW.requestRender) GW.requestRender();
      if (GW.markDirty) GW.markDirty();
      if (pg._legacyInk && GW.toast) GW.toast('已按内容扩展纸框（原有笔迹全部保留）', 2400);
      else if (GW.toast) GW.toast('当前页已换成「' + p.name + '」', 1800);
      pg._legacyInk = false;
    };
    const newPaperPage = (p) => {
      GW.addPageWith('plain', nameIn.value.trim(), GW.doc.pages.length - 1);
      const pg = GW.page();
      pg.paper = p.id;
      if (p.cfg) pg.paperCfg = Object.assign({}, p.cfg);
      pg.box = GW.ensurePageBox(pg);
      if (GW.repaintBg) GW.repaintBg();
      if (GW.enterPaged) GW.enterPaged(true); else if (GW.requestRender) GW.requestRender();
      closeIfDrawer();
      GW.toast('已新建「' + p.name + '」页面', 1800);
    };

    const paperCard = (p) => {
      const cv = h('canvas', { class: 'tpl-paper', style: { background: p.tone === 'dark' ? '#1d2b26' : '#fff' } });
      lazy(cv, (c2) => {
        if (p.tone === 'dark') { c2.fillStyle = '#1d2b26'; c2.fillRect(0, 0, 794, 1123); }
        // R4：noClear —— begin() 的 clearRect 会把白底清成透明
        GW.paperDraw(c2, p.id, { l: 0, t: 0, w: 794, h: 1123 }, { noClear: true, cfg: p.cfg || null });
      });
      return h('button', { class: 'tpl-card', 'data-t': 'paper', title: '新建一页「' + p.name + '」', onclick: () => newPaperPage(p) },
        cv, h('span', { class: 'tpl-name' }, p.name),
        h('span', { class: 'tpl-apply', title: '把当前页换成这种纸', onclick: (e) => { e.stopPropagation(); applyPaper(p); } }, '套用到当前页'));
    };

    const renderPapers = () => {
      paperWrap.innerHTML = '';
      const list = (GW.papers || []).filter((p) => {
        if (cat !== '全部' && p.category !== cat) return false;
        if (!q) return true;
        return (p.id + ' ' + p.name + ' ' + p.category).toLowerCase().indexOf(q) >= 0;
      });
      if (!list.length) { paperWrap.append(h('div', { class: 'tpl-hint' }, '没有匹配的纸张')); return; }
      const st = collapsed();
      // 按分类分组 + 组内折叠（首屏卡片数自然 ≤20：只展开第一个分类）
      const groups = {};
      for (const p of list) (groups[p.category] = groups[p.category] || []).push(p);
      let first = true;
      for (const k of Object.keys(groups)) {
        const open = q ? true : (st[k] != null ? !st[k] : first);
        first = first && false;
        const head = h('button', { class: 'tpl-group' + (open ? ' open' : ''), onclick: () => {
          const cur = collapsed();
          cur[k] = !open;
          saveCollapsed(cur);
          renderPapers();
        } }, k + '（' + groups[k].length + '）');
        const grid = h('div', { class: 'tpl-grid', style: open ? {} : { display: 'none' } });
        for (const p of groups[k]) grid.append(paperCard(p));
        paperWrap.append(head, grid);
      }
    };

    // ---------- 内容模板 ----------
    // 42 个模板一进来全铺开会把纸张区挤到屏幕外，所以默认收起（搜索时自动展开）。
    const renderCtpl = () => {
      cGrid.innerHTML = '';
      const st = collapsed();
      const open = q ? true : !!st.__ctpl;
      const list = (GW.CONTENT_TPL || []).filter((t) => !q || (t.id + ' ' + t.name + ' ' + (t.desc || '')).toLowerCase().indexOf(q) >= 0);
      cGrid.append(h('button', { class: 'tpl-group' + (open ? ' open' : ''), onclick: () => {
        const cur = collapsed();
        cur.__ctpl = !open;
        saveCollapsed(cur);
        renderCtpl();
      } }, '内容模板 · ' + list.length + ' 个'));
      const grid = h('div', { class: 'tpl-grid ctl-grid', style: open ? {} : { display: 'none' } });
      for (const t of list) {
        grid.append(h('button', {
          class: 'tpl-card ctl-card', 'data-t': 'ctpl', title: '新建一页并放入「' + t.name + '」',
          onclick: () => {
            GW.addPageContent(t.id);
            closeIfDrawer();
            GW.toast('已新建「' + t.name + '」页面，文字可以直接点开改', 2200);
          },
        },
          h('span', { class: 'ctl-thumb', 'data-k': t.id }, t.id === 'seating' ? '▦' : t.id === 'score' ? '▤' : '𖤍'),
          h('span', { class: 'tpl-name' }, t.name),
          h('span', { class: 'ctl-desc' }, t.desc || '')));
      }
      cGrid.append(grid);
      if (!list.length) cGrid.append(h('div', { class: 'tpl-hint' }, '没有匹配的模板'));
    };

    // ---------- 纸张设置（A2）----------
    const cfgBox = h('div', { class: 'tpl-set' });
    const renderCfg = () => {
      cfgBox.innerHTML = '';
      const pg = GW.page();
      const pid = pg.paper;
      const pap = pid && GW.paperById ? GW.paperById(pid) : null;
      if (!pap) { cfgBox.append(h('div', { class: 'tpl-hint' }, '当前页还没有纸张版式；先点一张纸的「套用到当前页」。')); return; }
      const cfg = GW.paperCfgOf ? GW.paperCfgOf(pap, pg.paperCfg) : Object.assign({}, pap.cfg, pg.paperCfg || {});
      const put = (patch) => {
        pg.paperCfg = Object.assign({}, cfg, patch);
        if (GW.markDirty) GW.markDirty();
        if (GW.repaintBg) GW.repaintBg();
        if (GW.requestRender) GW.requestRender();
        renderCfg();
      };
      const row = (label, node) => h('div', { class: 'tpl-setrow' }, h('span', { class: 'tpl-setlab' }, label), node);
      const lh = h('input', { type: 'range', min: 18, max: 48, step: 1, value: cfg.lineHeight, style: { flex: '1' } });
      const lhVal = h('span', { class: 'tpl-setval' }, cfg.lineHeight + 'px');
      lh.addEventListener('input', () => { lhVal.textContent = lh.value + 'px'; });
      lh.addEventListener('change', () => put({ lineHeight: +lh.value }));
      const orient = h('button', { class: 'gw-btn', onclick: () => put({ orientation: cfg.orientation === 'landscape' ? 'portrait' : 'landscape' }) },
        cfg.orientation === 'landscape' ? '横版' : '竖版');
      const tone = h('button', { class: 'gw-btn', onclick: () => put({ tone: cfg.tone === 'dark' ? 'light' : 'dark' }) },
        cfg.tone === 'dark' ? '深色纸' : '浅色纸');
      cfgBox.append(
        h('div', { class: 'tpl-sub' }, '纸张设置（当前页：' + pap.name + '）'),
        row('行距', h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flex: '1' } }, lh, lhVal)),
        row('方向', orient),
        row('色调', tone));
    };

    // ---------- 组装 ----------
    const renderAll = () => { renderPapers(); renderCtpl(); renderCfg(); };
    for (const c of CATS) {
      chips.append(h('button', {
        class: 'tpl-chip' + (c === cat ? ' on' : ''),
        onclick: () => {
          cat = c;
          for (const b of chips.children) b.classList.toggle('on', b.textContent === c);
          renderPapers();
        },
      }, c));
    }
    search.addEventListener('input', () => { q = String(search.value || '').trim().toLowerCase(); renderAll(); });

    renderAll();
    return h('div', { class: 'dr-body' },
      h('div', { style: { marginBottom: '6px' } }, nameIn),
      search,
      chips,
      paperWrap,
      h('div', { class: 'tpl-hint' }, '点纸样 = 新建一页；点「套用到当前页」= 只换当前页的纸。底纹属于页面属性，不进撤销栈。'),
      h('div', { class: 'tpl-sub' }, '内容模板（一页现成的板书，共 ' + (GW.CONTENT_TPL || []).length + ' 个）'),
      cGrid,
      cfgBox);
  };

  // 面板样式：追加到 <head>（项目约定不改 app.css 的既有规则，新增类名在这里集中定义）
  (function css() {
    if (document.getElementById('gw-tpl-ui-css')) return;
    const s = document.createElement('style');
    s.id = 'gw-tpl-ui-css';
    s.textContent = [
      '.tpl-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}',
      '.tpl-chip{font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid rgba(120,140,160,.35);background:transparent;cursor:pointer;color:inherit}',
      '.tpl-chip.on{background:rgba(15,157,138,.16);border-color:rgba(15,157,138,.5);font-weight:700}',
      '.tpl-group{display:flex;align-items:center;gap:6px;margin:12px 0 6px;font-size:13px;font-weight:700;opacity:.78;background:none;border:none;cursor:pointer;color:inherit}',
      '.tpl-group:before{content:"▸";font-size:11px;opacity:.7}',
      '.tpl-group.open:before{content:"▾"}',
      '.tpl-set{margin-top:14px;padding-top:10px;border-top:1px solid rgba(120,140,160,.22)}',
      '.tpl-setrow{display:flex;align-items:center;gap:10px;margin:8px 0}',
      '.tpl-setlab{width:44px;font-size:12.5px;opacity:.7}',
      '.tpl-setval{font-size:12px;opacity:.7;width:44px;text-align:right}',
      '.ctl-grid .ctl-card{min-height:74px}',
      '.ctl-desc{font-size:11.5px;opacity:.62;line-height:1.35}',
    ].join('\n');
    document.head.append(s);
  })();
})();
