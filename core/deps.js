/* 1.5.3（P2）：课件资源依赖检查与携带包。
   这里只做三件事，规则必须与播放端一致（对象模型见 objects.js / importer.js）：
   1) collect()：遍历当前文档每一页每一对象的引用（data.asset / base64 / path / libRel / url / src），
      逐项判状态。内嵌（asset、base64、data:）不可能丢；path / libRel 是本机文件，会丢。
   2) exportPkg()：在老师选的目录里新建「课程包-…」子目录，把可携带的本机文件复制进 assets/，
      克隆文档把引用改成包内相对路径 data.rel，最后写 manifest.json 作为「完成标记」。
      原文档、原文件一律不动；复制中断就不会有 manifest，包不算完成。
   3) adopt()：打开包时把 data.rel 化成真实路径，只认包根之下（拒绝绝对路径与 .. 逃逸）。
   大媒体不整份读进渲染进程：复制走主进程 copy-file。 */
(function () {
  const STATUS = {
    inline: '内嵌可用', local: '本机可用', cache: '缓存可用', net: '需联网',
    missing: '缺失', external: '需外部软件', unchecked: '未检查',
  };
  // 越靠前越需要老师处理
  const ORDER = ['missing', 'net', 'external', 'unchecked', 'local', 'cache', 'inline'];
  const REF_KEYS = ['asset', 'base64', 'path', 'libRel', 'url', 'src'];
  const OFFICE = /^(pptx?|ppsx?|docx?|xlsx?|dps|wps|et)$/i;
  const EXE = /^(exe|bat|cmd|msi|lnk)$/i;

  const baseName = (p) => String(p || '').split(/[\\/]/).pop();
  const extOf = (p) => (String(p || '').match(/\.([A-Za-z0-9]+)$/) || [, ''])[1].toLowerCase();
  const isHttp = (u) => /^https?:\/\//i.test(u || '');
  // 包内相对路径：不许绝对路径、盘符、协议，不许 .. 逃出包根
  function safeRel(rel) {
    if (typeof rel !== 'string' || !rel) return false;
    if (/^[a-zA-Z]:/.test(rel) || rel[0] === '/' || rel[0] === '\\' || /^[a-z]+:/i.test(rel)) return false;
    const parts = rel.replace(/\\/g, '/').split('/');
    return parts.every((s) => s && s !== '.' && s !== '..');
  }
  function walk(ref, out, depth) {
    if (!ref || typeof ref !== 'object' || depth > 3) return;
    if (Array.isArray(ref)) { for (const x of ref) walk(x, out, depth + 1); return; }
    for (const k of REF_KEYS) if (typeof ref[k] === 'string' && ref[k]) out.push([k, ref[k]]);
    for (const k in ref) {
      if (REF_KEYS.includes(k)) continue;
      const v = ref[k];
      if (v && typeof v === 'object') walk(v, out, depth + 1);
    }
  }

  const deps = (GW.deps = { STATUS, safeRel });

  // ---------- 1) 收集 ----------
  async function fileInfo(p) {
    if (!window.gewu || typeof window.gewu.fileInfo !== 'function') return null;
    try { return await window.gewu.fileInfo(p); } catch (e) { return null; }
  }

  async function statusOf(it, assets) {
    if (it.field === 'asset') {
      if (assets[it.ref]) return { status: 'inline', size: Math.round((assets[it.ref].data || '').length * 0.75) };
      return { status: 'missing', detail: '资源表里没有这一条（存档不完整）' };
    }
    if (it.field === 'base64') return { status: 'inline' };
    if (it.field === 'src') {
      if (/^data:/i.test(it.ref)) return { status: 'inline' };
      if (/^blob:/i.test(it.ref)) return { status: 'unchecked', detail: '临时 Blob：重启后失效，不能随课件携带' };
      if (isHttp(it.ref)) return { status: 'net', detail: '在线图片，断网打不开' };
      // 复审 #4：记下它原来是 src 字段 —— 复制后必须写回 src，只改 data.rel 图片仍是旧绝对路径
      it.srcField = 'src';
      it.field = 'path'; // 其余按本机路径判
    }
    if (it.field === 'url') {
      if (isHttp(it.ref)) return { status: 'net', detail: '网页内容需要联网；离线缓存见资源库' };
      if (/^blob:/i.test(it.ref)) return { status: 'unchecked', detail: '临时 Blob：重启后失效' };
      return { status: 'unchecked', detail: '未知地址类型' };
    }
    if (it.field === 'libRel') {
      if (!GW.libRoot) return { status: 'missing', detail: '还没有拿到学科库目录' };
      const p = GW.libRoot + '/' + it.ref;
      const st = await fileInfo(p);
      if (!st || !st.exists) return { status: 'missing', detail: '学科库里找不到这份课件（换机器/升级库版本后可能不同）' };
      it.copyFrom = p;
      return { status: 'local', size: st.size, detail: '学科库内课件' };
    }
    // path
    const ext = extOf(it.ref);
    const isWeb = it.obj && (it.obj.type === 'web' || it.obj.kind === 'web');
    const st = await fileInfo(it.ref);
    if (!st || !st.exists) return { status: 'missing', detail: '本机文件不在了' };
    if (EXE.test(ext)) return { status: 'external', size: st.size, detail: '要装对应软件才能打开' };
    if (isWeb) return { status: 'unchecked', size: st.size, detail: '网页可能依赖同目录的其它文件，无法自动判定' };
    if (OFFICE.test(ext)) return { status: 'external', size: st.size, detail: '需要 Office/WPS 打开；点卡片上的「转为页面」可变成内嵌' };
    it.copyFrom = it.ref;
    return { status: 'local', size: st.size };
  }

  const collect = (deps.collect = async function collect() {
    const items = [];
    const pages = GW.doc.pages || [];
    const assets = GW.doc.assets || {};
    pages.forEach((p, pi) => {
      for (const o of p.objs || []) {
        const refs = [];
        walk(o.data, refs, 0);
        const seen = new Set();
        for (const [field, ref] of refs) {
          const k = field + '|' + ref;
          if (seen.has(k)) continue;
          seen.add(k);
          const d = o.data || {};
          // asset 只认对象顶端声明的那一个；嵌套里的 asset 属于册子页，也算
          items.push({
            key: k, pageIndex: pi, pageNo: pi + 1, pageName: p.name || '',
            objId: o.id, type: o.type, title: (d.name || d.title || baseName(ref) || o.type),
            field, ref, obj: o,
          });
        }
      }
    });
    for (const it of items) Object.assign(it, await statusOf(it, assets));
    items.sort((a, b) => (ORDER.indexOf(a.status) - ORDER.indexOf(b.status)) || (a.pageIndex - b.pageIndex));
    const counts = {};
    for (const k of ORDER) counts[k] = 0;
    for (const it of items) counts[it.status]++;
    return { items, counts, at: Date.now(), total: items.length };
  });

  // ---------- 2) 打开包：相对引用 → 真实路径 ----------
  deps.adopt = function adopt(doc, p, forceRoot) {
    const src = forceRoot || p || (doc && doc.path);
    if (!src) return 0;
    const root = String(src).replace(/[\\/][^\\/]*$/, '');
    if (!root) return 0;
    let n = 0;
    for (const pg of (doc.pages || [])) {
      for (const o of (pg.objs || [])) {
        const d = o && o.data;
        if (!d || !d.rel) continue;
        if (!safeRel(d.rel)) { console.warn('课件包含非法相对路径，已忽略：' + d.rel); continue; }
        d.path = root + '/' + d.rel.replace(/\\/g, '/');
        
        // 复审 #4：图片这类对象渲染读的是 data.src（objects.js:261），必须一起指向包内文件
        if (typeof d.src === 'string' && d.src && !/^(data:|blob:|https?:)/i.test(d.src)) d.src = d.path;n++;
      }
    }
    if (n) doc.pkgRoot = root;
    return n;
  };

  // ---------- 3) 导出携带包 ----------
  const uniqName = (() => {
    const used = new Set();
    return (name) => {
      let base = String(name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80) || 'file';
      const dot = base.lastIndexOf('.');
      const stem = dot > 0 ? base.slice(0, dot) : base, ext = dot > 0 ? base.slice(dot) : '';
      let cand = base, i = 2;
      while (used.has(cand.toLowerCase())) cand = stem + '-' + (i++) + ext;
      used.add(cand.toLowerCase());
      return cand;
    };
  })();

  deps.exportPkg = async function exportPkg() {
    // 纯能力探测（不判 GW.isElectron）：要真的能在磁盘上建目录、拷文件才算有这个能力。
    // 安卓外壳与网页 shim 里 pickDir / copyFile 压根不存在，会走到下面的 toasts ——
    // 这也是「按钮可见但点不了」时的最后一道兜底（按钮的 disabled 在 classroom.js 里设）。
    const gw = window.gewu;
    if (!gw || typeof gw.pickDir !== 'function' || typeof gw.copyFile !== 'function' || typeof gw.mkdirP !== 'function') {
      GW.toast('这台设备不能直接写文件夹；请先「另存为」.gewu，再在桌面版导出课件包', 4200);
      return { result: 'unsupported' };
    }
    const pages = GW.doc.pages;
    const got = await collect();
    const { missing, net, unchecked, external } = got.counts;
    if (missing || net || unchecked || external) {
      if (!(await GW.confirm(`课件包将标为「部分完成」：缺失 ${missing} 项，需联网 ${net} 项，未检查 ${unchecked} 项，需外部软件 ${external} 项。仍然导出吗？`))) return { result: 'cancel' };
    }
    const dir = await window.gewu.pickDir({ title: '选择存放课件包的文件夹（会在里面新建「课程包-…」）' });
    if (!dir) return { result: 'cancel' };
    if (GW.doc.pages !== pages) {
      GW.toast('板书已切换，请重新导出课件包');
      return { result: 'cancel' };
    }
    const raw = JSON.parse(GW.serialize());
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').slice(2);
    const pkg = dir.replace(/[\\/]$/, '') + '/课程包-' + stamp;
    const copyList = got.items.filter((it) => it.copyFrom && (it.field === 'path' || it.field === 'libRel'));
    const manifest = {
      pkg: 1, app: 'gewu-board', builtAt: new Date().toISOString(),
      build: (GW.BUILD && GW.BUILD.id) || '', doc: 'lesson.gewu',
      title: (GW.doc.title || GW.doc.name || ''),
      assets: [], unresolved: [], copies: [],
    };
    try {
      await window.gewu.mkdirP(pkg);
      await window.gewu.mkdirP(pkg + '/assets');
    } catch (e) {
      GW.toast('建不了课件包目录：' + e.message, 4000);
      return { result: 'failed', error: String(e.message || e) };
    }
    const relByObj = new Map();
    let copied = 0, failed = 0;
    for (const it of copyList) {
      const name = uniqName(baseName(it.copyFrom));
      const dest = pkg + '/assets/' + name;
      try {
        const size = await window.gewu.copyFile(it.copyFrom, dest);
        // 记下引用原本挂在哪个字段上（src 的图片必须写回 src）
        relByObj.set(it.objId, { rel: 'assets/' + name, field: it.srcField || it.field });
        manifest.assets.push({ rel: 'assets/' + name, name: baseName(it.copyFrom), size, status: it.status });
        copied++;
      } catch (e) {
        failed++;
        manifest.unresolved.push({ objId: it.objId, title: it.title, ref: it.ref, status: 'missing', reason: '复制失败：' + (e.message || e) });
      }
    }
    // 克隆文档里改成包内相对引用；清掉本机绝对路径（包给别的电脑用，不能泄露/依赖原路径）
    for (const pg of raw.pages || []) {
      for (const o of (pg.objs || [])) {
        if (!o || !o.data) continue;
        const got2 = relByObj.get(o.id);
        if (got2) {
          // 复审 #4：图片渲染读 data.src，必须写回 src；其余一律只留 data.rel，
          // 旧的绝对路径（path/libRel）必须清掉，否则换机打开仍指向原机器的文件。
          if (got2.field === 'src') o.data.src = got2.rel;
          o.data.rel = got2.rel;
          delete o.data.path;
          delete o.data.libRel;
        }
        else if (o.data.rel && !safeRel(o.data.rel)) delete o.data.rel;
      }
    }
    for (const it of got.items) {
      if (manifest.unresolved.some((u) => u.objId === it.objId && u.ref === it.ref)) continue;
      if (!it.copyFrom && (it.status === 'missing' || it.status === 'net' || it.status === 'unchecked' || it.status === 'external')) {
        manifest.unresolved.push({ objId: it.objId, title: it.title, ref: it.ref, status: it.status, reason: STATUS[it.status] });
      }
    }
    try {
      await window.gewu.writeFile(pkg + '/lesson.gewu', JSON.stringify(raw, null, 1), 'utf8');
    } catch (e) {
      GW.toast('写 lesson.gewu 失败：' + e.message + '（这个包不算完成）', 4200);
      return { result: 'failed', error: String(e.message || e) };
    }
    const partial = manifest.unresolved.length > 0 || failed > 0;
    manifest.result = partial ? 'partial' : 'complete';
    try {
      // manifest 最后写 = 完成标记；中断时目录里只有半份 assets，没有 manifest
      await window.gewu.writeFile(pkg + '/manifest.json', JSON.stringify(manifest, null, 1), 'utf8');
    } catch (e) {
      GW.toast('写 manifest.json 失败：这个包不算完成（' + e.message + '）', 4200);
      return { result: 'failed', error: String(e.message || e) };
    }
    GW.toast((partial ? '课件包已导出（部分完成）' : '课件包已导出') + '：' + pkg.split(/[\\/]/).pop() + '，复制 ' + copied + ' 个文件', 4200);
    if (window.gewu.pkgRoot) window.gewu.pkgRoot(pkg);
    return { result: manifest.result, pkg, copied, failed, unresolved: manifest.unresolved };
  };

  // ---------- 4) 面板 ----------
  function rowFor(it, onGo, onFix) {
    const st = STATUS[it.status] || it.status;
    const loc = it.field === 'asset' ? '内嵌资源' : (it.ref || '');
    return GW.h('div', { class: 'dep-row ' + it.status },
      GW.h('div', { class: 'dep-main' },
        GW.h('div', { class: 'dep-title' }, it.title || baseName(loc) || it.type),
        GW.h('div', { class: 'dep-meta' }, '第 ' + it.pageNo + ' 页 · ' + (it.type || '') + ' · ' + loc + (it.detail ? ' · ' + it.detail : ''))),
      GW.h('span', { class: 'dep-badge ' + it.status }, st),
      onGo ? GW.h('button', { class: 'gw-btn dep-go', onclick: onGo }, '定位') : null,
      onFix ? GW.h('button', { class: 'gw-btn dep-fix', onclick: onFix }, '重新指定') : null);
  }

  deps.dialog = async function dialog() {
    const body = GW.h('div', { class: 'dep-wrap' });
    const dlg = GW.dialog({ title: '本课资源', width: 760, noFooter: true, body });
    const bar = GW.h('div', { class: 'dep-bar' });
    const list = GW.h('div', { class: 'dep-list' });
    const hint = GW.h('div', { class: 'dep-hint' }, '正在检查…');
    body.append(hint, bar, list);
    const btn = (label, fn, cls) => GW.h('button', { class: 'gw-btn' + (cls ? ' ' + cls : ''), onclick: fn }, label);
    bar.append(
      btn('重新检查', refresh),
      btn('准备可缓存资源', cachePrep),
      btn('重新指定缺失文件', relink),
      btn('导出课件包…', async () => { const r = await deps.exportPkg(); if (r.result !== 'cancel') refresh(); }, 'primary'),
      btn('关闭', () => dlg.close()));

    async function refresh() {
      hint.textContent = '正在检查…';
      list.innerHTML = '';
      const got = await collect();
      const head = ORDER.filter((k) => got.counts[k]).map((k) => STATUS[k] + ' ' + got.counts[k]).join(' · ');
      hint.textContent = got.total ? '共 ' + got.total + ' 项：' + head : '这一课没有需要携带的外部资源（笔迹、图形、内嵌图片都在 .gewu 里）。';
      let lastPage = -1;
      for (const it of got.items) {
        if (it.pageIndex !== lastPage) {
          lastPage = it.pageIndex;
          list.append(GW.h('div', { class: 'dep-page' }, '第 ' + it.pageNo + ' 页' + (it.pageName ? ' · ' + it.pageName : '')));
        }
        const go = () => { GW.gotoPage(it.pageIndex); if (GW.objects && GW.objects.focus && it.obj) GW.objects.focus(it.obj); };
        const fix = it.status === 'missing' && (it.field === 'path' || it.field === 'libRel') ? () => fixOne(it) : null;
        list.append(rowFor(it, go, fix));
      }
      return got;
    }

    async function fixOne(it) {
      const ps = await window.gewu.openFiles({ title: '重新指定：' + (it.title || ''), multi: false });
      if (!ps || !ps.length) return;
      const d = it.obj.data;
      if (it.field === 'asset') { GW.toast('这是内嵌资源，不需要重新指定'); return; }
      d.path = ps[0];
      delete d.libRel;
      GW.doc.dirty = true;
      GW.bus.emit('dirty');
      GW.toast('已改用：' + baseName(ps[0]));
      refresh();
    }

    async function relink() {
      const got = await collect();
      const miss = got.items.filter((it) => it.status === 'missing' && it.field === 'path');
      if (!miss.length) { GW.toast('没有缺失的本机文件'); return; }
      const ps = await window.gewu.openFiles({ title: '找回缺失文件（可多选，按文件名匹配）', filters: [{ name: '所有文件', extensions: ['*'] }] });
      if (!ps || !ps.length) return;
      let hit = 0;
      const used = new Set();
      for (const it of miss) {
        const want = baseName(it.ref).toLowerCase();
        const p = ps.find((x) => !used.has(x) && baseName(x).toLowerCase() === want);
        if (!p) continue;
        used.add(p);
        it.obj.data.path = p;
        delete it.obj.data.libRel;
        hit++;
      }
      if (hit) { GW.doc.dirty = true; GW.bus.emit('dirty'); GW.toast('已重新指定 ' + hit + ' 个文件' + (hit < miss.length ? '，还有 ' + (miss.length - hit) + ' 个没找到' : ''), 3600); }
      else GW.toast('选中的文件与缺失项文件名都对不上', 3200);
      refresh();
    }

    async function cachePrep() {
      const got = await collect();
      const cand = got.items.filter((it) => it.status === 'net' && it.field === 'url');
      const phet = cand.filter((it) => /phet\.colorado\.edu\/sims\/html\/([a-z0-9-]+)\/latest\//i.test(it.ref));
      if (!phet.length) {
        GW.toast(cand.length ? '本课的在线内容没有已知的离线缓存方式（只有资源库里的 PhET 页面可以预缓存）' : '本课没有需要联网的资源', 4000);
        return;
      }
      let ok = 0;
      for (const it of phet) {
        const m = it.ref.match(/sims\/html\/([a-z0-9-]+)\/latest\/(?:[a-z0-9-]+_)?([a-z]{2})_([A-Z]{2})\.html/i);
        const id = m ? m[1] : '';
        if (!id) continue;
        try {
          if (GW.resources && GW.resources.cachePhet) {
            if (await GW.resources.cachePhet(id, (m[2] + '_' + m[3]).toLowerCase().replace('_', '_'))) ok++;
          }
        } catch (e) { /* 逐项失败不影响其它 */ }
      }
      GW.toast(ok ? '已预缓存 ' + ok + ' 个 PhET 页面' : '预缓存失败（网络或磁盘问题），在线内容仍可联网使用', 3600);
      refresh();
    }

    await refresh();
    return dlg;
  };

  // 菜单入口（app.js 里调用；这里只提供函数，避免依赖加载顺序）
  deps.open = () => deps.dialog();
})();
