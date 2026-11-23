/* 内容搜索（含手写标记）—— core/search.js
 *
 * 课堂上最常见的需求是「把上次那份板书里的某个东西翻出来」：一条公式、一个便签、
 * 一个导入的文件、或者一段手写。文本/公式/文件天然带字，可以直接搜；手写笔迹本身
 * 没有字，所以这里给了「标记」(tag) 这条低成本通路 —— 选中一段手写，敲一个关键词
 * （楞次定律 / 电磁感应 / 例题3），以后就能在同一个入口搜到，跳过去、闪一下高亮。
 *
 * 索引来源（按页）：
 *   文本 / 便签   data.html 去标签后的纯文本
 *   公式          data.tex（LaTeX 源码，同时把 \frac 之类还原成可读片段一起匹配）
 *   图片/PDF/视频/Flash/GeoGebra/文件/网页/仿真   data.name / title / url / path / sim
 *   笔迹 / 图形   it.tag（手工标记）
 *   页面          页名
 *
 * 对外 API：
 *   GW.search.open() / close() / toggle()     打开搜索面板（Ctrl+F）
 *   GW.search.find(q)                         拿结构化结果（不依赖 UI，方便脚本/自测）
 *   GW.search.goTo(hit)                       跳到某个命中并高亮
 *   GW.search.tagSelection()                  给选中内容打标记（Ctrl+Shift+L）
 *   GW.search.untagSelection()                清除选中内容的标记
 *   GW.search.tagsOf(it)                      读某条内容的标记数组
 *
 * 以后接入手写 OCR 时，只要给笔迹写上 it.ocr（识别出的文字），在 entries() 里加一行
 * 就能一起被搜到 —— 索引字段已经预留。
 */
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW) return;
  const h = GW.h;

  // 对象类型 → 结果里显示的中文类别
  const LABEL = {
    text: '文本', formula: '公式', image: '图片', pdfpage: 'PDF', video: '视频',
    web: '网页', swf: 'Flash', ggb: 'GeoGebra', sim: '仿真', file: '文件',
    node: 'AI 节点', book: '册子', shape: '图形',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
  }
  // HTML 片段 → 纯文本（KaTeX 渲染过的公式也适用）
  function plain(html) {
    if (!html) return '';
    const d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }
  // LaTeX 源码 → 便于肉眼搜索的可读串：\frac{1}{2} 也允许用 "1/2"、"frac" 搜到
  function texReadable(tex) {
    if (!tex) return '';
    return String(tex).replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}$]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function tagsOf(it) {
    return String((it && it.tag) || '').split(/[\s,，、;；]+/).filter(Boolean);
  }

  // ---- 索引 ----
  // 每次搜索现建索引；一页板书通常几十~几百条内容，建一遍是微秒级，
  // 不值得为它维护失效缓存（缓存反而容易和撤销/换页不同步）。
  // 画布上的学科图形（pb）与数学图形（ms）→ 可读名字；其他笔迹返回空串
  function shapeName(it) {
    if (!it || it.kind !== 'shape' || !it.key) return '';
    try {
      const P = GW.physShapes, MS = GW.mathShapes;
      if (it.type === 'pb' && P && P.get) {
        const d = P.get(it.key); if (!d) return '';
        return d.label + (P.catLabel && P.catLabel[d.cat] ? ' · ' + P.catLabel[d.cat] : '');
      }
      if (it.type === 'ms' && MS && MS.get) { const d = MS.get(it.key); return d ? d.label + ' · 数学图形' : ''; }
    } catch (e) { /* 注册表没装好时不让搜索整体失败 */ }
    return '';
  }

  function entries() {
    const out = [];
    const pages = (GW.doc && GW.doc.pages) || [];
    for (let pi = 0; pi < pages.length; pi++) {
      const p = pages[pi];
      // 一次框选里的几条笔迹会被 T01 写上同一段 it.ocr —— 它们只该出一条结果，
      // 否则搜一个词会刷出十几行一模一样的「手写」。带 tag 的照旧各出一条。
      const seenOcr = new Set();
      for (const it of p.ink || []) {
        const tg = tagsOf(it);
        // 2.0（备课断点 1）：学科图形 / 数学图形按名字也能搜到 —— 「上次画过的那个斜面」直接搜「斜面」。
        // 名字取注册表里的 label + 分类名，不写进 .gewu（数据格式不变），老课件打开即可搜。
        const sn = shapeName(it);
        if (!tg.length && !it.ocr) {
          if (sn) out.push({ pi, it, kind: 'shape', label: '图形', text: sn, show: sn });
          continue;
        }
        if (it.ocr && !tg.length && seenOcr.has(it.ocr)) continue;
        if (it.ocr) seenOcr.add(it.ocr);
        out.push({
          pi, it, kind: 'tag', label: it.ocr ? '手写' : (it.kind === 'shape' ? '图形标记' : '手写标记'),
          text: (it.ocr ? it.ocr + ' ' : '') + tg.join(' '),
          show: tg.join(' · ') || it.ocr || '',
        });
      }
      for (const o of p.objs || []) {
        const d = o.data || {};
        let text = '', show = '';
        if (o.type === 'text') { text = plain(d.html); show = text; }
        else if (o.type === 'formula') { text = [d.tex, texReadable(d.tex), plain(d.html)].filter(Boolean).join(' \u0001 '); show = String(d.tex || ''); }
        else {
          text = [d.name, d.title, d.url, d.path, d.sim, GW.sims[d.sim] && GW.sims[d.sim].name].filter(Boolean).join(' ');
          show = text;
        }
        const tg = tagsOf(o);
        if (tg.length) { text += ' ' + tg.join(' '); show += (show ? ' · ' : '') + tg.join(' · '); }
        if (!String(text).trim()) continue;
        out.push({ pi, it: o, kind: o.type, label: LABEL[o.type] || o.type, text: String(text), show });
      }
      if (p.name && /^第\s*\d+\s*页$/.test(p.name) === false) {
        out.push({ pi, it: null, kind: 'page', label: '页面', text: p.name, show: p.name });
      }
    }
    return out;
  }

  // ---- 查询 ----
  // 空格分隔 = 全部都要出现（AND）；大小写不敏感
  function find(q) {
    const terms = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const hits = [];
    for (const e of entries()) {
      const hay = e.text.toLowerCase();
      let ok = true, first = -1;
      for (const t of terms) {
        const at = hay.indexOf(t);
        if (at < 0) { ok = false; break; }
        if (first < 0 || at < first) first = at;
      }
      if (!ok) continue;
      // 打分：标签/公式/文本优先，文件名次之；命中位置越靠前越好
      const w = e.kind === 'tag' ? 0 : e.kind === 'formula' ? 1 : e.kind === 'text' ? 2 : e.kind === 'page' ? 3 : 4;
      hits.push({ e, pi: e.pi, it: e.it, label: e.label, show: e.show, score: w * 1000 + Math.min(first, 999), terms });
    }
    hits.sort((a, b) => a.score - b.score || a.pi - b.pi);
    return hits;
  }

  function snippet(hit) {
    const s = hit.show || '';
    if (s.length <= 90) return s;
    const t = hit.terms[0];
    const at = Math.max(0, s.toLowerCase().indexOf(t) - 24);
    return (at > 0 ? '…' : '') + s.slice(at, at + 90) + (at + 90 < s.length ? '…' : '');
  }
  function marked(hit) {
    let s = esc(snippet(hit));
    for (const t of hit.terms) {
      const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      s = s.replace(re, '<b>$1</b>');
    }
    return s;
  }

  // ---- 高亮：在实时层画一个脉冲虚线框（世界坐标），对象/笔迹通吃 ----
  function flash(b) {
    if (!b) return;
    const x = b.x, y = b.y, w = Math.max(b.w, 8), hh = Math.max(b.h, 8);
    const t0 = performance.now();
    let off = null, dead = false;
    off = GW.live.add((ctx, o) => {
      const el = performance.now() - t0;
      if (dead || el > 2000) { dead = true; if (off) off(); return; }
      const pulse = 0.5 + 0.5 * Math.sin(el / 130);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.5 * pulse;
      ctx.strokeStyle = '#0f9d8a';
      ctx.lineWidth = 3 / o.view.s;
      ctx.setLineDash([12 / o.view.s, 7 / o.view.s]);
      ctx.strokeRect(x, y, w, hh);
      ctx.restore();
      o.mark(x - 8 / o.view.s, y - 8 / o.view.s, x + w + 16 / o.view.s, y + hh + 16 / o.view.s);
      GW.requestLive();
    });
    GW.requestLive();
    setTimeout(() => { dead = true; if (off) off(); GW.requestLive(); }, 2100);
  }

  function boundsOf(it) {
    if (!it) return null;
    if (it.kind === 'stroke' || it.kind === 'shape') return GW.bbox(it);
    return { x: it.x, y: it.y, w: it.w, h: it.h };
  }

  function goTo(hit) {
    if (!hit) return;
    if (hit.pi != null && GW.doc.cur !== hit.pi) GW.gotoPage(hit.pi);
    const b = boundsOf(hit.it);
    if (!b) { GW.toast('第 ' + (hit.pi + 1) + ' 页'); return; }
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    // 让目标占据视口约 40%，并夹在 [0.6, 3] 之间 —— 太远了看不清，太近了失去上下文
    const fit = Math.min((innerWidth * 0.42) / Math.max(b.w, 1), (innerHeight * 0.42) / Math.max(b.h, 1));
    const s = GW.clamp(fit, 0.6, 3);
    GW.animateView(innerWidth / 2 - cx * s, innerHeight / 2 - cy * s, s, 320);
    setTimeout(() => flash(b), 330);
  }

  // ---- 面板 ----
  let panel = null, inputEl = null, listEl = null, cntEl = null;
  let hits = [], curIdx = -1, timer = 0;
  // T02：搜索结果左侧的页缩略图。只在 paint()（结果渲染）里现算，find() 一次都不碰；
  // 缓存按 pageIndex 存，面板 close() 时整个丢掉 —— 下次打开再按当时的文档重新画。
  let thumbCache = null;
  function thumbFor(pi) {
    if (!thumbCache) thumbCache = new Map();
    if (thumbCache.has(pi)) return thumbCache.get(pi);
    let url = '';
    try {
      const pg = GW.doc && GW.doc.pages && GW.doc.pages[pi];
      if (pg && GW.renderThumb) url = GW.renderThumb(pg, 112, 72).toDataURL('image/png');
    } catch (e) { url = ''; }
    thumbCache.set(pi, url);
    return url;
  }

  function build() {
    if (panel) return;
    inputEl = h('input', { class: 'sp-in', type: 'text', spellcheck: 'false', placeholder: '搜索文本 / 公式 / 标记 / 文件名…（回车跳转，Esc 关闭）' });
    cntEl = h('span', { class: 'sp-count' }, '');
    const closeBtn = h('button', { class: 'sp-x', title: '关闭（Esc）', onclick: () => close() }, '✕');
    listEl = h('div', { class: 'sp-list' });
    panel = h('div', { class: 'sp-wrap', id: 'search-panel' },
      h('div', { class: 'sp-head' }, h('span', { class: 'sp-ico' }, '🔍'), inputEl, cntEl, closeBtn),
      listEl);
    document.body.append(panel);

    inputEl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 140); });
    inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter') { e.preventDefault(); const hit = hits[curIdx >= 0 ? curIdx : 0]; if (hit) goTo(hit); else run(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    });
    listEl.addEventListener('mousedown', (e) => {
      const row = e.target.closest && e.target.closest('.sp-row');
      if (!row) return;
      e.preventDefault();
      const i = +row.dataset.i;
      curIdx = i;
      paint();
      goTo(hits[i]);
    });
  }

  function move(d) {
    if (!hits.length) return;
    curIdx = (curIdx + d + hits.length) % hits.length;
    paint();
    const row = listEl.querySelector('.sp-row.on');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }

  function run() {
    if (!panel) return;
    hits = find(inputEl.value);
    curIdx = hits.length ? 0 : -1;
    paint();
  }

  function paint() {
    if (!listEl) return;
    cntEl.textContent = inputEl.value.trim() ? (hits.length ? hits.length + ' 条' : '无') : '';
    listEl.textContent = '';
    if (!inputEl.value.trim()) {
      listEl.append(h('div', { class: 'sp-empty' },
        '输入关键词开始搜索。',
        h('br'),
        h('span', { class: 'sp-tip' }, '手写笔迹本身没有文字：选中它按 Ctrl+Shift+L 打个标记（如「楞次定律」），以后就能搜到。')));
      return;
    }
    if (!hits.length) { listEl.append(h('div', { class: 'sp-empty' }, '没有找到「' + inputEl.value.trim() + '」')); return; }
    let lastPi = -1;
    hits.forEach((hit, i) => {
      if (hit.pi !== lastPi) {
        lastPi = hit.pi;
        const nm = (GW.doc.pages[hit.pi] && GW.doc.pages[hit.pi].name) || '';
        listEl.append(h('div', { class: 'sp-sep' }, '第 ' + (hit.pi + 1) + ' 页' + (nm && nm !== '第 ' + (hit.pi + 1) + ' 页' ? ' · ' + nm : '')));
      }
      listEl.append(h('div', { class: 'sp-row' + (i === curIdx ? ' on' : ''), 'data-i': String(i) },
        (() => { const u = thumbFor(hit.pi); return u ? h('img', { class: 'sp-thumb', src: u, width: 56, height: 36, alt: '' }) : h('span', { class: 'sp-thumb' }); })(),
        h('span', { class: 'sp-kind k-' + hit.label }, hit.label),
        h('span', { class: 'sp-text', html: marked(hit) })));
    });
  }

  function open() {
    build();
    panel.classList.add('on');
    inputEl.focus();
    inputEl.select();
    if (!inputEl.value.trim()) run();
  }
  function close() {
    if (panel) panel.classList.remove('on');
    if (inputEl) inputEl.blur();
    thumbCache = null;   // T02：缩略图缓存只活一次打开，关了下次按新内容重算
  }
  function toggle() {
    build();
    if (panel.classList.contains('on')) close(); else open();
  }

  // ---- 手写标记 ----
  function applyTag(items, val) {
    const ups = [];
    for (const it of items) {
      const before = GW.clone(it);
      const nv = String(val == null ? '' : val).trim();
      if ((it.tag || '') === nv) continue;
      if (nv) it.tag = nv; else delete it.tag;
      ups.push({ before, after: it });
    }
    if (ups.length) {
      GW.commit({ update: ups });
      GW.markDirty();
      GW.bus.emit('tag');
    }
    return ups.length;
  }

  function targetItems() {
    const sel = (GW.selection && GW.selection.items) || [];
    return sel.slice();
  }

  function tagSelection() {
    const items = targetItems();
    if (!items.length) { GW.toast('先圈选一段手写或点选内容，再加标记'); return; }
    const cur = items.map((it) => it.tag || '').filter(Boolean).join(' ');
    GW.prompt('给选中内容加标记（搜索用，空格分隔可写多个）', cur, '例如：楞次定律 电磁感应').then((v) => {
      if (v == null) return;
      const n = applyTag(items, v);
      GW.toast(n ? (v.trim() ? '已标记：' + v.trim() : '已清除标记') : '标记没有变化');
    });
  }

  function untagSelection() {
    const items = targetItems();
    if (!items.length) return;
    const n = applyTag(items, '');
    GW.toast(n ? '已清除标记' : '这些内容本来就没有标记');
  }

  GW.search = { open, close, toggle, find, entries, goTo, flash, tagsOf, tagSelection, untagSelection, applyTag,
    get hits() { return hits; },
    get isOpen() { return !!(panel && panel.classList.contains('on')); } };
})();
