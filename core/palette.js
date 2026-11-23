/* 万能插入（2.0）—— core/palette.js
 *
 * 备课最常见的一步是「我要一个 ××」：斜面、凸透镜、光电效应仿真、上次写过的楞次定律板书……
 * 以前要先想好它在哪个抽屉、哪个分页（物理 → 光学 → 第几个），现在一个框里打字就行：
 *   · 学科图形（GW.physShapes，含电磁学实验 / 化学 / 生物）   回车 = 插到视口中心并选中（可立即调参）
 *   · 数学图形（GW.mathShapes）
 *   · 数学仿真（GW.sims，category='math'）                       回车 = GW.importer.insertSim
 *   · 物理仿真（GW.simDemos，simhtml 独立页）                     回车 = GW.importer.insertWeb
 *   · 本课件内容（GW.search.find：文本 / 公式 / 标记 / 图形名）   回车 = 跳过去并闪一下
 * 最近插入过的 8 项记在 localStorage['gewu.palette.recent']（只存 id，不存内容）。
 * 不改任何数据结构；插入走的都是原来抽屉里同一条函数。
 *
 * 对外：GW.palette.open() / close() / toggle() / items(q) —— items 不依赖界面，探针可直接调。
 */
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW) return;
  const h = GW.h;
  const RKEY = 'gewu.palette.recent';
  const KINDS = [
    { k: 'all', label: '全部' }, { k: 'shape', label: '图形' }, { k: 'sim', label: '仿真' }, { k: 'board', label: '本课件' },
  ];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
  const svg = (inner) => (inner && /^\s*<svg/.test(inner) ? inner : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (inner || '') + '</svg>');
  const after = (fn) => () => { try { if (GW.tool) GW.tool.set('hand'); } catch (e) { /* noop */ } return fn(); };

  // ---------- 目录（每次打开现建，几百条，毫秒级） ----------
  function catalog() {
    const out = [];
    const P = GW.physShapes;
    if (P && P.cats && P.list) {
      P.cats().forEach((cat) => P.list(cat).forEach((d) => out.push({
        id: 'pb:' + d.key, kind: 'shape', tag: '图形', name: d.label, sub: (P.catLabel && P.catLabel[cat]) || cat,
        icon: svg(d.icon), words: d.key + ' ' + (d.keywords || ''), run: () => P.insert(d.key),
      })));
    }
    const MS = GW.mathShapes;
    if (MS && MS.list) MS.list().forEach((d) => out.push({
      id: 'ms:' + d.key, kind: 'shape', tag: '数学图形', name: d.label, sub: (MS.catLabel && MS.catLabel[d.cat]) || '数学',
      icon: svg(d.icon || '<path d="M4 20L20 4M4 4h6M14 20h6"/>'), words: d.key, run: () => MS.insert(d.key),
    }));
    Object.values(GW.sims || {}).filter((s) => s.category === 'math').forEach((s) => out.push({
      id: 'sim:' + s.id, kind: 'sim', tag: '数学仿真', name: s.name, sub: s.group || '数学', desc: s.desc,
      icon: svg(s.icon), words: (s.keywords || '') + ' ' + (s.desc || ''), run: after(() => GW.importer.insertSim(s.id)),
    }));
    (GW.simDemos || []).forEach(([g, arr]) => arr.forEach((t) => {
      const sid = (/sims\/([\w-]+)\.html$/.exec(t[0]) || [])[1];
      const def = sid && GW.sims && GW.sims[sid];
      out.push({
        id: 'web:' + t[0], kind: 'sim', tag: '物理仿真', name: t[1], sub: g, desc: t[2],
        icon: svg((def && def.icon) || '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M10 9l5 2.5-5 2.5z"/>'), words: t[2] + ' ' + ((def && (def.keywords + ' ' + def.desc)) || ''),
        run: after(() => GW.importer.insertWeb(t[0], t[1])),
      });
    }));
    return out;
  }
  function score(it, terms) {
    const n = it.name.toLowerCase(), all = (it.name + ' ' + it.sub + ' ' + it.tag + ' ' + (it.desc || '') + ' ' + (it.words || '')).toLowerCase();
    let s = 0;
    for (const t of terms) {
      if (!all.includes(t)) return -1;
      s += n === t ? 100 : n.startsWith(t) ? 60 : n.includes(t) ? 40 : (it.sub || '').toLowerCase().includes(t) ? 15 : 5;
    }
    return s + (it.kind === 'sim' ? 1 : 0);
  }
  function recent() { try { return JSON.parse(localStorage.getItem(RKEY) || '[]').slice(0, 8); } catch (e) { return []; } }
  function remember(id) { try { const r = [id].concat(recent().filter((x) => x !== id)).slice(0, 8); localStorage.setItem(RKEY, JSON.stringify(r)); } catch (e) { /* 存不下就算了 */ } }

  // 结构化结果（不依赖界面）
  function items(q, kind) {
    kind = kind || 'all';
    const terms = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const cat = catalog();
    if (!terms.length) {
      const map = new Map(cat.map((x) => [x.id, x]));
      return recent().map((id) => map.get(id)).filter(Boolean).filter((x) => kind === 'all' || x.kind === kind).map((x) => Object.assign({ recent: true }, x));
    }
    let res = kind === 'board' ? [] : cat.filter((x) => kind === 'all' || x.kind === kind).map((x) => [x, score(x, terms)]).filter((p) => p[1] >= 0)
      .sort((a, b) => b[1] - a[1]).slice(0, 60);
    // 同类放一组：组与组按各自最高分排（搜「透镜」先出仿真组还是图形组，看哪组更贴题）
    const best = {}; res.forEach(([x, sc]) => { if (best[x.kind] == null) best[x.kind] = sc; });
    res = res.sort((a, b) => (best[b[0].kind] - best[a[0].kind]) || (b[1] - a[1])).map((p) => p[0]);
    if ((kind === 'all' || kind === 'board') && GW.search && GW.search.find) {
      let hits = [];
      try { hits = GW.search.find(q) || []; } catch (e) { hits = []; }
      res = res.concat(hits.slice(0, kind === 'board' ? 60 : 12).map((hit, i) => ({
        id: 'hit:' + i, kind: 'board', tag: hit.label || '内容', name: String(hit.show || hit.text || '').slice(0, 60),
        sub: '第 ' + (hit.pi + 1) + ' 页', icon: svg('<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h6"/>'), run: () => GW.search.goTo(hit), noRecent: true,
      })));
    }
    return res;
  }

  // ---------- 界面 ----------
  let wrap = null, input = null, list = null, foot = null, kind = 'all', res = [], cur = 0, timer = 0, chips = [];
  function build() {
    if (wrap) return;
    input = h('input', { class: 'pal-in', type: 'text', spellcheck: 'false', placeholder: '想插什么？斜面、凸透镜、光电效应、导数、楞次定律…' });
    list = h('div', { class: 'pal-list', role: 'listbox' });
    foot = h('div', { class: 'pal-foot' });
    const seg = h('div', { class: 'pal-kinds' }, KINDS.map((k) => {
      const b = h('button', { class: 'pal-kind' + (k.k === kind ? ' on' : ''), type: 'button', onclick: () => { kind = k.k; chips.forEach((c) => c.classList.toggle('on', c.dataset.k === kind)); run(); input.focus(); } }, k.label);
      b.dataset.k = k.k; chips.push(b); return b;
    }));
    const box = h('div', { class: 'pal-box', role: 'dialog', 'aria-label': '万能插入' },
      h('div', { class: 'pal-head' }, h('span', { class: 'pal-ico', html: GW.icon ? GW.icon('search') : '' }), input, h('kbd', null, 'Esc')),
      seg, list, foot);
    wrap = h('div', { class: 'pal-wrap', id: 'palette' }, box);
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
    document.body.append(wrap);
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 90); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(cur); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Tab') { e.preventDefault(); const i = KINDS.findIndex((k) => k.k === kind); chips[(i + (e.shiftKey ? KINDS.length - 1 : 1)) % KINDS.length].click(); }
    });
    list.addEventListener('mousemove', (e) => { const r = e.target.closest && e.target.closest('.pal-row'); if (r && +r.dataset.i !== cur) { cur = +r.dataset.i; mark(); } });
    list.addEventListener('click', (e) => { const r = e.target.closest && e.target.closest('.pal-row'); if (r) pick(+r.dataset.i); });
  }
  function run() {
    res = items(input.value, kind); cur = 0; paint();
  }
  function paint() {
    list.textContent = '';
    const q = input.value.trim();
    if (!res.length) {
      list.append(h('div', { class: 'pal-empty', html: q ? '没有找到「' + esc(q) + '」<br><small>试试更短的词，例如「透镜」「电场」「函数」</small>'
        : '输入关键词，回车插到画布中央。<br><small>↑↓ 选择 · Tab 切换分类 · 最近插入过的会出现在这里</small>' }));
      foot.textContent = '';
      return;
    }
    let last = '';
    res.forEach((it, i) => {
      const grp = it.recent ? '最近使用' : it.kind === 'board' ? '本课件里' : it.kind === 'sim' ? '仿真' : '图形';
      if (grp !== last) { last = grp; list.append(h('div', { class: 'pal-sep' }, grp)); }
      list.append(h('div', { class: 'pal-row' + (i === cur ? ' on' : ''), role: 'option', 'data-i': String(i) },
        h('span', { class: 'pal-ri', html: it.icon }),
        h('span', { class: 'pal-rn' }, h('b', null, it.name), it.desc ? h('small', null, it.desc) : null),
        h('span', { class: 'pal-rs' }, it.sub),
        h('span', { class: 'pal-rt k-' + it.kind }, it.tag)));
    });
    foot.innerHTML = '<span>' + res.length + ' 项</span><span>回车 ' + (res[cur] && res[cur].kind === 'board' ? '跳转' : '插入') + ' · ↑↓ 选择 · Tab 分类</span>';
  }
  function mark() {
    list.querySelectorAll('.pal-row').forEach((r) => r.classList.toggle('on', +r.dataset.i === cur));
    const r = list.querySelector('.pal-row.on'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
    const f = foot.querySelector('span:last-child'); if (f && res[cur]) f.textContent = '回车 ' + (res[cur].kind === 'board' ? '跳转' : '插入') + ' · ↑↓ 选择 · Tab 分类';
  }
  function move(d) { if (!res.length) return; cur = (cur + d + res.length) % res.length; mark(); }
  function pick(i) {
    const it = res[i]; if (!it) return;
    close();
    if (!it.noRecent) remember(it.id);
    try { it.run(); } catch (e) { if (GW.toast) GW.toast('插入失败：' + (e && e.message || e)); }
  }
  function open(q) {
    build();
    wrap.classList.add('on');
    input.value = q || '';
    run();
    setTimeout(() => { input.focus(); input.select(); }, 0);
  }
  function close() { if (wrap) wrap.classList.remove('on'); }
  function isOpen() { return !!(wrap && wrap.classList.contains('on')); }
  function toggle() { isOpen() ? close() : open(); }

  // Ctrl+K：在输入框 / 可编辑区里不抢（老师可能在写文字）
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) && t !== input) return;
      e.preventDefault(); e.stopPropagation(); toggle();
    }
  }, true);

  GW.palette = { open, close, toggle, isOpen, items, catalog };
})();
