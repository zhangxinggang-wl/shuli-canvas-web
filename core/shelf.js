/* 数理无限画布 · 取样复用架（1.3.0 R7）
   ------------------------------------------------------------------
   老师上课经常要反复用同一张图、同一段板书。以前「复制」只存在内存变量里
   （input.js 的 clipboard）：换页、换文件、重启全没了，课堂上只能重新画。
   这里做一个「架子」——

   · 存在 localStorage['gewu.shelf']：全局键，天然跨页、跨文件、跨重启共用，
     不写进 .gewu（不污染老师的板书文件，也不会跟着文件发给别人）；
   · 最多 12 件，超了丢最旧；
   · 两种件：kind:'items' 是对象/笔迹的深拷贝（原件复用，贴回去还能改）；
     kind:'image' 是区域截图（「两个都可以」）；支持片段被删也能用。

   对外：GW.shelf = { add, list, get, pasteAt, remove, clear, MAX }
   UI 在 app.js 的 shelfPop()（Dock「复用」），快捷键 Ctrl+Shift+V 贴最近一件。
   ------------------------------------------------------------------ */
(function () {
  'use strict';
  const GW = window.GW;
  const KEY = 'gewu.shelf';
  const MAX = 12;

  function load() {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a.filter((x) => x && x.id) : [];
    } catch (e) { return []; }
  }
  // 2.2.3（R6）踩到的坑：drawItem 会往对象上塞渲染缓存（_path / _bb / _pathS…），
  // 一旦这些字段跟着 rec.items 被写进 storage，读回来就是 `_path: {}` 这种假缓存 ——
  // drawItem 看到 `it._path` 有值就不再重建，直接 `ctx.stroke({})` 抛 TypeError，
  // 缩略图变成一片空白（探针 probe-shelf 的「各不相同」就是这么红的）。
  // 所以落盘前统一剥掉下划线字段（GW.clone 用的是同一份 strip，还放行 _rot/_rw/_rh）。
  function cleanList(list) {
    return list.map((rec) => {
      if (!rec || rec.kind !== 'items' || !rec.items) return rec;
      const c = Object.assign({}, rec);
      c.items = clone(rec.items);
      return c;
    });
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(cleanList(list))); }
    catch (e) {
      // 配额满了（截图件很占地方）：退一步，先把图片件丢掉再存一次；还不行就只留在内存里。
      try {
        localStorage.setItem(KEY, JSON.stringify(cleanList(list.filter((x) => x.kind !== 'image'))));
      } catch (e2) {
        // 2.2.3（R6）：还满就把内嵌资产也丢掉（图会变空白，但至少这一件还在架子上、还能贴回来）。
        try {
          localStorage.setItem(KEY, JSON.stringify(cleanList(list.filter((x) => x.kind !== 'image')).map((x) => {
            const c = Object.assign({}, x); delete c.assets; return c;
          })));
        } catch (e3) { /* 真满了就算了，不影响当前这一节课 */ }
      }
    }
  }

  function rectOf(items) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const it of items || []) {
      const b = it.kind === 'obj'
        ? { x: it.x, y: it.y, w: it.w || 0, h: it.h || 0 }
        : GW.bbox(it);
      if (!b) continue;
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
    }
    if (!isFinite(x1)) return null;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function clone(items) {
    return (items || []).filter(Boolean).map((it) => (GW.clone ? GW.clone(it) : JSON.parse(JSON.stringify(it))));
  }
  // 平移一件东西（与 input.js 的 GW.paste 同一套字段）
  function shift(it, dx, dy) {
    if (it.kind === 'obj') { it.x += dx; it.y += dy; }
    else if (it.type === 'pb' || it.type === 'ms') { it.x1 += dx; it.y1 += dy; it.x2 += dx; it.y2 += dy; }
    else if (it.pts) {
      for (let i = 0; i < it.pts.length; i += 2) { it.pts[i] += dx; it.pts[i + 1] += dy; }
      if (it.ann) { it.ann.cx += dx; it.ann.cy += dy; }
    }
    return it;
  }
  // 1.4.0：分类 + 缩略图（老师分不清架子上哪件是哪件）
  //   分类在入库时算好存进 rec.cat；老存档没有就走 catOf 现算，不迁移也能用。
  const CATS = {
    shape: '图形', ink: '笔迹', phys: '物理图', math: '数学图',
    shot: '截图', obj: '对象', mix: '组合',
  };
  function catOf(rec) {
    if (!rec) return 'mix';
    if (rec.cat && CATS[rec.cat]) return rec.cat;
    if (rec.kind === 'image') return 'shot';
    const its = rec.items || [];
    if (!its.length) return 'mix';
    if (its.every((it) => it.kind === 'stroke')) return 'ink';
    if (its.some((it) => it.kind === 'obj')) return its.length > 1 ? 'mix' : 'obj';
    if (its.some((it) => it.type === 'pb')) return 'phys';
    if (its.some((it) => it.type === 'ms')) return 'math';
    if (its.every((it) => it.kind === 'shape' || it.type === 'poly' || it.type === 'lor')) return 'shape';
    return 'mix';
  }
  function catOfItems(its, kind) {
    if (kind === 'image') return 'shot';
    return catOf({ kind: 'items', items: its });
  }

  // thumb(rec, W, H)：把一件东西画成缩略图（dataURL）。截图件直接用它自己那张图；
  // 其它件按包围盒等比塞进 W×H 的白底里，用 GW.drawItem 原样画（跟画布、导出同一套绘制）。
  const thumbCache = new Map();
  // 画布底色：直接采 #bg-canvas 左上角那个像素（底纹/纯色/无底纹都覆盖到）
  let bgCache = null;
  function canvasBg() {
    if (bgCache) return bgCache;
    try {
      const c = document.querySelector('#bg-canvas');
      if (c && c.width > 4 && c.height > 4) {
        const d = c.getContext('2d').getImageData(2, 2, 1, 1).data;
        if (d[3] > 8) { bgCache = 'rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + (d[3] / 255).toFixed(3) + ')'; return bgCache; }
      }
    } catch (e) { /* 取不到就退回深底 */ }
    bgCache = 'rgba(28,32,38,1)';
    return bgCache;
  }
  function thumb(rec, W, H) {
    if (!rec) return '';
    if (rec.kind === 'image') return rec.dataUrl || '';
    const ck = rec.id + '@' + W + 'x' + H;
    if (thumbCache.has(ck)) return thumbCache.get(ck);
    // 在副本上画：GW.drawItem 会往对象上写 _path/_bb，写进真对象就等于把渲染缓存
    // 混进了存档（见 cleanList 那段注释）。
    const items = clone(rec.items || []);
    const r = rectOf(items);
    if (!r || !(r.w > 0) || !(r.h > 0)) return '';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    // 背景必须跟画布一致：深色主题下笔是白墨，缩略图铺白底就整片看不见（踩过）。
    ctx.fillStyle = canvasBg();
    ctx.fillRect(0, 0, W, H);
    const s = Math.min((W - 14) / r.w, (H - 14) / r.h);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(s, s);
    ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
    for (const it of items) {
      try { GW.drawItem(ctx, it, {}); } catch (e) { /* 画不出来就少画一件，不影响别的 */ }
    }
    ctx.restore();
    let url = '';
    try { url = cv.toDataURL('image/png'); } catch (e) { url = ''; }
    thumbCache.set(ck, url);
    return url;
  }

  function titleOf(its) {
    if (its.length !== 1) return its.length + ' 件';
    const it = its[0];
    if (it.kind === 'obj') return (it.data && (it.data.name || it.data.title)) || '对象';
    const t = { stroke: '笔迹', poly: '图形', pb: '物理图', ms: '图形' }[it.type] || '图形';
    return t;
  }

  // ---------- 长期收藏（1.5.3 P5） ----------
  // 桌面：<userData>/favorites/ 下「一件两个文件」——fav-<id>.json 是全文（含资产 base64），
  //   fav-<id>.meta.json 是列表用的小元数据。没有索引文件，目录本身就是真源：
  //   写正文成功之后才写 meta，读不到 meta 的脏文件直接忽略，不会「索引说有、文件没有」。
  // 浏览器/安卓：整件塞一个 localStorage 键（受 4~5MB 配额限制，写失败必须明确报错）。
  const FBODY = 'gewu.fav';
  const FAV_MAX = 60;
  const FAV_VER = 1;

  // 判「有没有 favWrite 这个通道」而不是判是不是桌面：桌面主进程才有真文件通道，
  // 安卓 / 网页的 shim 没有 favWrite（grep 已确认），会自然落到下面的 localStorage 分支。
  const isDesk = () => !!(window.gewu && typeof window.gewu.favWrite === 'function');
  const favName = (id, meta) => 'fav-' + id + (meta ? '.meta' : '') + '.json';
  const recMeta = (rec) => ({
    ver: FAV_VER, id: rec.id, at: rec.at, title: rec.title, cat: rec.cat,
    kind: rec.kind || 'items', w: rec.w || 0, h: rec.h || 0,
    n: (rec.items || []).length, thumb: rec.thumb || '',
    miss: (rec.missing || []).length,
  });

  // 对象数据里的引用：asset 要一起搬走；path/libRel 是搬不走的本机/库内依赖，必须明确标缺失
  function walkRefs(items) {
    const out = { assets: new Set(), ext: [] };
    const seen = new Set();
    const walk = (v, depth) => {
      if (!v || typeof v !== 'object' || depth > 6 || seen.has(v)) return;
      seen.add(v);
      if (typeof v.asset === 'string' && v.asset) out.assets.add(v.asset);
      if (typeof v.path === 'string' && v.path) out.ext.push({ field: 'path', ref: v.path });
      if (typeof v.libRel === 'string' && v.libRel) out.ext.push({ field: 'libRel', ref: v.libRel });
      for (const k in v) walk(v[k], depth + 1);
    };
    for (const it of items || []) walk(it.data, 0);
    return out;
  }
  function grabAssets(ids) {
    const have = {}, miss = [];
    for (const id of ids) {
      const a = GW.doc.assets && GW.doc.assets[id];
      if (a && a.data) have[id] = { mime: a.mime || '', name: a.name || '', data: a.data };
      else miss.push({ asset: id });
    }
    return { have, miss };
  }

  async function browserFavs() {
    try {
      const a = JSON.parse(localStorage.getItem(FBODY) || '[]');
      return Array.isArray(a) ? a.filter((x) => x && x.id) : [];
    } catch (e) { return []; }
  }
  async function favMetaList() {
    if (!isDesk()) {
      const list = await browserFavs();
      return list.map(recMeta).sort((a, b) => b.at - a.at);
    }
    let files = [];
    try { files = await window.gewu.favList(); } catch (e) { return []; }
    const out = [];
    for (const f of files) {
      if (!/\.meta\.json$/.test(f.name)) continue;
      try {
        const m = JSON.parse(await window.gewu.favRead(f.name));
        if (m && m.id) out.push(m);
      } catch (e) { /* 坏件跳过，不拖累其它 */ }
    }
    return out.sort((a, b) => b.at - a.at);
  }
  async function favTrim() {
    const metas = await favMetaList();
    for (const m of metas.slice(FAV_MAX)) {
      try { await window.gewu.favRemove(favName(m.id, false)); } catch (e) { /* 已不在 */ }
      try { await window.gewu.favRemove(favName(m.id, true)); } catch (e) { /* 已不在 */ }
    }
  }
  async function favRead(id) {
    if (!isDesk()) {
      const list = await browserFavs();
      return list.find((x) => x.id === id) || null;
    }
    return JSON.parse(await window.gewu.favRead(favName(id, false)));
  }

  async function favAdd(items, meta) {
    const m = meta || {};
    const its = clone(items);
    if (!its.length) return { ok: false, error: '没有可收藏的内容' };
    const refs = walkRefs(its);
    const got = grabAssets(refs.assets);
    const r = rectOf(its) || { w: 0, h: 0 };
    const rec = {
      ver: FAV_VER, id: GW.uid(), at: Date.now(), kind: 'items',
      title: m.title || titleOf(its), cat: m.cat || catOfItems(its),
      w: r.w, h: r.h, items: its, assets: got.have,
      missing: got.miss.concat(refs.ext),
    };
    rec.thumb = thumb(rec, 240, 140);   // 必须在原文档里生成：这时资产还在 GW.doc.assets 里
    if (isDesk()) {
      try {
        await window.gewu.favWrite(favName(rec.id, false), JSON.stringify(rec));
        await window.gewu.favWrite(favName(rec.id, true), JSON.stringify(recMeta(rec)));
      } catch (e) {
        return { ok: false, error: '收藏没有写成功：' + (e && e.message || e) };
      }
      await favTrim();
      GW.bus && GW.bus.emit('shelf');
      return { ok: true, rec: recMeta(rec), missing: rec.missing.length };
    }
    const list = await browserFavs();
    list.unshift(rec);
    if (list.length > FAV_MAX) list.length = FAV_MAX;
    try { localStorage.setItem(FBODY, JSON.stringify(list)); }
    catch (e) { return { ok: false, error: '浏览器存储空间不足，收藏没有保存（可先导出素材包）' }; }
    GW.bus && GW.bus.emit('shelf');
    return { ok: true, rec: recMeta(rec), missing: rec.missing.length };
  }

  // 把一条「已有完整记录」的内容收藏起来（复用架上的那件就是这种）。
  // 与 favAdd 的区别：不重新 clone/抓资产/画缩略图，直接沿用记录里那份 —— 架子上那件
  // 已经带好了 assets 与 thumb（add() 入库时生成的），重算反而会因为资产不在 GW.doc.assets 里而丢图。
  async function favAddRec(rec) {
    if (!rec || !Array.isArray(rec.items) || !rec.items.length) return { ok: false, error: '这件没有可收藏的内容' };
    const out = {
      ver: FAV_VER, id: GW.uid(), at: Date.now(), kind: 'items',
      title: rec.title || '取样', cat: rec.cat || catOfItems(rec.items),
      w: rec.w || 0, h: rec.h || 0, items: clone(rec.items),
      assets: rec.assets || {}, missing: rec.missing || [],
    };
    out.thumb = rec.thumb || thumb(out, 240, 140);
    if (isDesk()) {
      try {
        await window.gewu.favWrite(favName(out.id, false), JSON.stringify(out));
        await window.gewu.favWrite(favName(out.id, true), JSON.stringify(recMeta(out)));
      } catch (e) { return { ok: false, error: '收藏没有写成功：' + ((e && e.message) || e) }; }
      await favTrim();
    } else {
      const list = await browserFavs();
      list.unshift(out);
      if (list.length > FAV_MAX) list.length = FAV_MAX;
      try { localStorage.setItem(FBODY, JSON.stringify(list)); }
      catch (e) { return { ok: false, error: '浏览器存储空间不足，收藏没有保存（可先导出素材包）' }; }
    }
    GW.bus && GW.bus.emit('shelf');
    return { ok: true, rec: recMeta(out), missing: (out.missing || []).length };
  }
  // 把一条收藏放回复用架（带上它自己的资产与缩略图，不再依赖当前文档）
  async function favToShelf(id) {
    let rec = null;
    try { rec = await favRead(id); } catch (e) { return { ok: false, error: '这条收藏读不出来' }; }
    if (!rec) return { ok: false, error: '找不到这条收藏' };
    const made = GW.shelf.add(rec.items || [], { title: rec.title, cat: rec.cat }, { thumb: rec.thumb, assets: rec.assets });
    if (!made) return { ok: false, error: '复用架满了或者这件是空的' };
    return { ok: true, rec: made };
  }

  function placeItems(its, wx, wy) {
    if (!its || !its.length) return false;
    // 贴回来的是新的一件：必须换 id —— 原来的 id 跟架子上那张（以及纸面上可能还在的原件）一样，
    // 直接 addItems 会被 insertRaw 当成「同一个 id 就地替换」，表现为「贴了但纸面上什么都没多」。
    for (const it of its) it.id = GW.uid();
    const r = rectOf(its);
    if (r) {
      const dx = wx - (r.x + r.w / 2), dy = wy - (r.y + r.h / 2);
      for (const it of its) shift(it, dx, dy);
      // rectOf 里调 GW.bbox 会把包围盒缓存在 _bb 上（当时还是原位），平移之后必须丢掉，
      // 否则命中测试/虚框/局部重画全都按原位的框算 —— 看着贴过去了，一拖就露馅。
      for (const it of its) if (GW.invalidate) { try { GW.invalidate(it); } catch (e) { /* 没缓存就算了 */ } }
    }
    GW.addItems(its);
    try { if (GW.selection) GW.selection.set(its); } catch (e) { /* 选不中也无妨 */ }
    return true;
  }

  async function favPaste(id, x, y) {
    let rec = null;
    try { rec = await favRead(id); }
    catch (e) { return { ok: false, error: '这条收藏读不出来（文件可能被删了）' }; }
    if (!rec) return { ok: false, error: '找不到这条收藏' };
    const its = clone(rec.items || []);
    if (!its.length) return { ok: false, error: '这条收藏没有内容' };
    // 资产要重新登记：收藏里的旧编号在新文档里不存在；GW.assets.put 按内容去重，重复贴不会越贴越大
    const re = {};
    for (const oldId in rec.assets || {}) {
      const a = rec.assets[oldId];
      try { re[oldId] = GW.assets.put(a.data, a.mime, a.name); } catch (e) { /* 单件坏了不影响其它 */ }
    }
    let lost = 0;
    for (const it of its) {
      const d = it.data;
      if (!d || !d.asset) continue;
      if (re[d.asset]) d.asset = re[d.asset];
      else { lost++; delete d.asset; }
    }
    const c = GW.viewCenter();
    placeItems(its, (x == null) ? c.x : x, (y == null) ? c.y : y);
    return { ok: true, missing: (rec.missing || []).length + lost };
  }

  async function favRemove(id) {
    const bad = [];
    try {
      if (isDesk()) {
        // 复审 #12：只把「本来就不在」当成功；磁盘/权限错误必须报出去，不能显示成删掉了
        const r1 = await window.gewu.favRemove(favName(id, false));
        if (r1 && r1.ok === false) bad.push('正文：' + (r1.error || r1.code || '删除失败'));
        const r2 = await window.gewu.favRemove(favName(id, true));
        if (r2 && r2.ok === false) bad.push('索引：' + (r2.error || r2.code || '删除失败'));
      } else {
        const list = (await browserFavs()).filter((x) => x.id !== id);
        localStorage.setItem(FBODY, JSON.stringify(list));
      }
    } catch (e) { return { ok: false, error: '删除失败：' + ((e && e.message) || e) }; }
    GW.bus && GW.bus.emit('shelf');
    if (bad.length) return { ok: false, partial: true, error: '删除没有完全成功：' + bad.join('；') };
    return { ok: true };
  }

  async function favExport() {
    const recs = [];
    for (const m of await favMetaList()) {
      try { const r = await favRead(m.id); if (r) recs.push(r); } catch (e) { /* 坏件跳过 */ }
    }
    if (!recs.length) return { ok: false, error: '收藏夹是空的' };
    const bundle = { fav: FAV_VER, app: 'gewu-board', at: Date.now(), records: recs };
    const text = JSON.stringify(bundle);
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' : '') + n;
    const name = '素材包-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
    try {
      if (window.gewu && window.gewu.saveDialog) {
        const p2 = await window.gewu.saveDialog(name, [{ name: '素材包', extensions: ['json'] }]);
        if (!p2) return { ok: false, cancelled: true };
        await window.gewu.writeFile(p2, text, 'utf8');
        return { ok: true, count: recs.length, path: p2 };
      }
      const blob = new Blob([text], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return { ok: true, count: recs.length };
    } catch (e) { return { ok: false, error: '导出失败：' + (e && e.message || e) }; }
  }

  // 导入：只认带 fav/records 的素材包；同 id 视为已收藏（跳过），不覆盖本地已有
  async function favImport(text) {
    let bundle = null;
    try { bundle = JSON.parse(String(text)); } catch (e) { return { ok: false, error: '不是素材包（JSON 解析失败）' }; }
    if (!bundle || bundle.fav !== FAV_VER || !Array.isArray(bundle.records)) return { ok: false, error: '不是 1.5.3 素材包' };
    const recs = bundle.records.filter((r) => r && r.id && Array.isArray(r.items) && r.items.length);
    if (!recs.length) return { ok: false, error: '素材包里没有可用的内容' };
    if (isDesk()) {
      const have = new Set((await favMetaList()).map((m) => m.id));
      let added = 0, skipped = 0, failed = 0;
      for (const r of recs) {
        if (have.has(r.id)) { skipped++; continue; }
        try {
          await window.gewu.favWrite(favName(r.id, false), JSON.stringify(r));
          await window.gewu.favWrite(favName(r.id, true), JSON.stringify(recMeta(r)));
          added++;
        } catch (e) { failed++; }
      }
      await favTrim();
      GW.bus && GW.bus.emit('shelf');
      return { ok: added > 0 || skipped > 0, added, skipped, failed };
    }
    const list = await browserFavs();
    const have = new Set(list.map((x) => x.id));
    let added = 0, skipped = 0;
    for (const r of recs) {
      if (have.has(r.id)) { skipped++; continue; }
      list.unshift(r); added++;
    }
    try { localStorage.setItem(FBODY, JSON.stringify(list.slice(0, FAV_MAX))); }
    catch (e) { return { ok: false, error: '浏览器存储空间不足，素材包没有导入' }; }
    GW.bus && GW.bus.emit('shelf');
    return { ok: added > 0, added, skipped, failed: 0 };
  }

  const shelf = GW.shelf = {
    MAX: MAX,
    CATS: CATS,
    list: load,
    catOf: catOf,
    thumb: thumb,
    FAV_MAX: FAV_MAX,
    favAdd: favAdd,
    favList: favMetaList,
    favPaste: favPaste,
    favRemove: favRemove,
    favRead: favRead,
    favExport: favExport,
    favImport: favImport,
    // 2.2.3（R6）：复用架 ↔ 收藏互通。两边存的是同一套记录（items + assets + thumb），
    // 所以互转时把已有字段直接搬过去即可 —— 不能再走 favAdd() 现算，那会在「资产已不在文档里」时丢图。
    favAddRec: favAddRec,
    favToShelf: favToShelf,

    // add(items, meta)：复制/取样时进来一件。meta.kind==='image' 时 items 可以是空数组、
    // 用 meta.dataUrl 存图（区域截图那条路）。返回新建的那件（配额满/空 ⇒ null）。
    // 2.2.3（R6）：第三参 pre 有内容时不再自己算缩略图（收藏直接搬进来时已经带好了）。
    add(items, meta, pre) {
      const m = meta || {};
      const list = load();
      let rec = null;
      if (m.kind === 'image' && m.dataUrl) {
        rec = { id: GW.uid(), at: Date.now(), kind: 'image', dataUrl: m.dataUrl,
                title: m.title || '截图', w: m.w || 0, h: m.h || 0, cat: 'shot' };
      } else {
        const its = clone(items);
        if (!its.length) return null;
        const r = rectOf(its) || { w: 0, h: 0 };
        rec = { id: GW.uid(), at: Date.now(), kind: 'items', items: its,
                w: r.w, h: r.h, title: m.title || titleOf(its), cat: catOfItems(its) };
        // 2.2.3（R6）：取样这一刻就把缩略图和外部资产存进来 —— 此刻资产还在 GW.doc.assets 里。
        // 以前只在显示时才现算缩略图，于是「复用架 ↔ 收藏」互通时，转到收藏里的条目只能画个空框；
        // 而且老师清空画布/换文件之后，架子上那张图会变成空白（资产已经不在了）。
        // 只收「这一件真正引用的」资产，避免把整份文档的资源塞进 localStorage。
        if (!(pre && pre.thumb)) {
          try {
            const refs = walkRefs(its);
            const got = grabAssets(refs.assets);
            if (got.have && Object.keys(got.have).length) rec.assets = got.have;
            rec.thumb = thumb(rec, 240, 140);
          } catch (e) { /* 缩略图失败不影响入库 */ }
        }
      }
      if (pre && pre.thumb) rec.thumb = pre.thumb;
      if (pre && pre.assets && !rec.assets) rec.assets = pre.assets;
      list.unshift(rec);                        // 最新在前
      while (list.length > MAX) list.pop();
      save(list);
      GW.bus && GW.bus.emit('shelf');
      return rec;
    },

    get(i) { return load()[i] || null; },

    // pasteAt(i, x, y)：把第 i 件贴到世界坐标 (x,y)（不给就用视口中心）。
    // kind:'items' 的包围盒中心落在 (x,y)；kind:'image' 直接插图片对象。
    pasteAt(i, x, y) {
      const rec = this.get(i);
      if (!rec) return false;
      const c = GW.viewCenter();
      const wx = (x == null) ? c.x : x, wy = (y == null) ? c.y : y;
      if (rec.kind === 'image') {
        if (!rec.dataUrl || !GW.importer) return false;
        GW.importer.insertDataURL(rec.dataUrl, rec.title || '截图', { x: wx, y: wy, w: rec.w || undefined });
        return true;
      }
      // 2.2.3（R6）：add() 现在会把外部资产一起存下来（否则换文件后架子上那张就是空白）。
      // 贴回来时资产编号在本机文档里并不存在，必须重新登记一遍 —— GW.assets.put 按内容去重，
      // 反复贴同一张图不会让文档越来越大（收藏那条路 favPaste 一直是这么做的）。
      const its = clone(rec.items);
      const re = {};
      for (const oldId in rec.assets || {}) {
        const a = rec.assets[oldId];
        try { re[oldId] = GW.assets.put(a.data, a.mime, a.name); } catch (e) { /* 单件坏了不影响其它 */ }
      }
      for (const it of its) {
        const d = it.data;
        if (!d || !d.asset) continue;
        if (re[d.asset]) d.asset = re[d.asset]; else delete d.asset;
      }
      // 贴回来的是新的一件：placeItems 里统一换 id 再贴（见那里的注释）
      return placeItems(its, wx, wy);
    },

    remove(i) {
      const list = load();
      if (!list[i]) return false;
      list.splice(i, 1); save(list);
      GW.bus && GW.bus.emit('shelf');
      return true;
    },
    clear() {
      try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
      GW.bus && GW.bus.emit('shelf');
    },
  };
})();
