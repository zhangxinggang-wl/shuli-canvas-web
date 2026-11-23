/* 页面与文档级 UI（2.0.7 · B5/A5/A6/C1/C3）
 *
 * 这里放的是「一排按钮 + 一组纯数据 API」：
 *   B5 页面标签（≤3，保留各自视口与页序）
 *   A5 模板库 JSON 导入/导出（只导 spec 纯数据，不导函数、不 eval）
 *   A6 页面旋转 0/90/180/270（渲染在 board.js 的 pageMatrix 里）
 *   C1 模板锁定一键切换（批量改 data-tpl="1" 的 locked）
 *   C3 诊断包（自写 store-only ZIP：日志 + 版本 + 最近操作，不引第三方库）
 *
 * 所有 API 都挂在 GW 上，探针直接调（不依赖按钮是否可见）。
 */
(function () {
  const GW = (window.GW = window.GW || {});
  const h = GW.h;

  // ---------------- 诊断日志（C3） ----------------
  const NL = String.fromCharCode(10);   // 换行常量（源码里不写转义，避免被批量改写误伤）
  const LOG = [];
  const MAXLOG = 300;
  GW.diagLog = function (msg) {
    LOG.push({ t: Date.now(), m: String(msg).slice(0, 400) });
    if (LOG.length > MAXLOG) LOG.shift();
  };
  GW.diagRecent = () => LOG.slice(-80);
  (function hookBus() {
    if (!GW.bus || !GW.bus.on) return;
    const put = (name) => { try { GW.bus.on(name, (a) => GW.diagLog(name + (a && a.id ? ':' + a.id : ''))); } catch (e) { /* 事件名不存在就跳过 */ } };
    ['page', 'commit', 'save', 'open', 'rendered'].forEach(put);
  })();

  // ---------------- C3：store-only ZIP ----------------
  // 不压缩（模板/日志都很小），只为「一个文件带走现场」。CRC32 用标准多项式。
  const CRC = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return (buf) => {
      let c = 0xFFFFFFFF;
      for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    };
  })();
  function zipStore(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = CRC(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((n, a) => n + a.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    const total = all.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  // 诊断信息与日志各自收成一个函数：打包（bytes）与下载（diagBundle）共用同一份内容
  function diagInfo() {
    const p = GW.page ? GW.page() : {};
    return {
      app: 'gewu-board', version: GW.APP_VERSION || '', build: (GW.BUILD && GW.BUILD.id) || '',
      at: new Date().toISOString(), ua: navigator.userAgent, dpr: window.devicePixelRatio || 1,
      size: [innerWidth, innerHeight], layout: (GW.settings && GW.settings.layout) || '',
      pages: (GW.doc && GW.doc.pages.length) || 0, cur: (GW.doc && GW.doc.cur) || 0,
      page: {
        name: p.name || '', paper: p.paper || '', paged: !!p.paged, rot: p.rot || 0,
        ink: (p.ink || []).length, objs: (p.objs || []).length,
      },
      papers: (GW.papers || []).length, ctpl: (GW.CONTENT_TPL || []).length,
    };
  }
  function diagLog() {
    return GW.diagRecent().map((l) => new Date(l.t).toISOString().slice(11, 23) + '  ' + l.m).join('\n') || '(empty)';
  }
  // 探针用：只产出字节，不触发下载
  GW.__diagBytes = function () {
    const info = JSON.stringify(diagInfo(), null, 2);
    return zipStore([
      { name: 'version.json', data: info },
      { name: 'ops.log', data: diagLog() },
      { name: 'report.txt', data: info + '\n\n最近操作：\n' + diagLog() + '\n' },
    ]);
  };
  // 诊断信息与日志各自收成一个函数：打包（bytes）与下载（diagBundle）共用同一份内容
  function diagInfo() {
    const p = GW.page ? GW.page() : {};
    return {
      app: 'gewu-board', version: GW.APP_VERSION || '', build: (GW.BUILD && GW.BUILD.id) || '',
      at: new Date().toISOString(), ua: navigator.userAgent, dpr: window.devicePixelRatio || 1,
      size: [innerWidth, innerHeight], layout: (GW.settings && GW.settings.layout) || '',
      pages: (GW.doc && GW.doc.pages.length) || 0, cur: (GW.doc && GW.doc.cur) || 0,
      page: {
        name: p.name || '', paper: p.paper || '', paged: !!p.paged, rot: p.rot || 0,
        ink: (p.ink || []).length, objs: (p.objs || []).length,
      },
      papers: (GW.papers || []).length, ctpl: (GW.CONTENT_TPL || []).length,
    };
  }
  function diagLog() {
    return GW.diagRecent().map((l) => new Date(l.t).toISOString().slice(11, 23) + '  ' + l.m).join(NL) || '(empty)';
  }
  // 探针用：只产出字节，不触发下载
  GW.__diagBytes = function () {
    const info = JSON.stringify(diagInfo(), null, 2);
    return zipStore([
      { name: 'version.json', data: info },
      { name: 'ops.log', data: diagLog() },
      { name: 'report.txt', data: info + NL + NL + '最近操作：' + NL + diagLog() + NL },
    ]);
  };
  GW.diagBundle = function () {
    const bytes = GW.__diagBytes();
    const name = 'gewu-diag-' + (GW.APP_VERSION || 'dev') + '-' + Date.now() + '.zip';
    let saved = false;
    try {
      const blob = new Blob([bytes], { type: 'application/zip' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      saved = true;
    } catch (e) { GW.diagLog('诊断包保存失败：' + (e && e.message)); }
    return { name, size: bytes.length, saved, files: 3 };
  };

  // ---------------- C3：协同光标 ----------------
  // 一条消息 = 一个世界坐标点 + 名字。画在 #gw-cursors（fixed 覆盖层），4 秒没更新就淡出。
  // 不写进文档、不进撤销栈：它是「看对方笔尖在哪」，不是板书内容。
  const CURS = new Map();      // id → { x, y, name, at, el }
  function cursorLayer() {
    let el = document.getElementById('gw-cursors');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gw-cursors';
      document.body.append(el);
    }
    return el;
  }
  GW.cursors = {
    list: () => [...CURS.entries()].map(([id, c]) => ({ id, x: c.x, y: c.y, name: c.name })),
    // 收到远端光标（本机渲染）。id 用发送方的连接名；同一个人只留一个点。
    apply(m) {
      if (!m || !isFinite(m.x) || !isFinite(m.y)) return null;
      const id = String(m.id || m.from || 'peer');
      let c = CURS.get(id);
      if (!c) {
        const el = document.createElement('div');
        el.className = 'gw-cur';
        el.innerHTML = '<i></i><b></b>';
        cursorLayer().append(el);
        c = { x: 0, y: 0, name: '', at: 0, el };
        CURS.set(id, c);
      }
      c.x = +m.x; c.y = +m.y; c.name = String(m.name || '对方').slice(0, 8); c.at = Date.now();
      const sp = GW.toScreen(c.x, c.y);
      c.el.style.transform = 'translate3d(' + Math.round(sp.x) + 'px,' + Math.round(sp.y) + 'px,0)';
      c.el.querySelector('b').textContent = c.name;
      c.el.style.opacity = '1';
      return c;
    },
    // 本机发出光标（有局域网会话才有对端，没会话时 netLive 自己会早退）
    send(x, y) {
      if (!GW.lansync || !GW.lansync.netLive) return false;
      GW.lansync.netLive('cur', { k: 'cur', x, y, name: (GW.settings && GW.settings.userName) || '我' });
      return true;
    },
    clear() {
      for (const [, c] of CURS) c.el.remove();
      CURS.clear();
    },
    // 4 秒没消息就淡出（人走了光标不该永远停在屏幕上）
    tick() {
      const now = Date.now();
      for (const [id, c] of CURS) {
        if (now - c.at > 4000) {
          c.el.style.opacity = '0';
          if (now - c.at > 6000) { c.el.remove(); CURS.delete(id); }
        }
      }
    },
  };
  setInterval(() => GW.cursors.tick(), 1000);

  // ---------------- B5：页面标签（≤3） ----------------
  const TABS = [];
  GW.tabs = {
    list: () => TABS.slice(),
    // 把当前页钉成一个标签：记住页 id + 视口 + 在原文档里的序号
    pin(pageIndex) {
      const i = pageIndex == null ? GW.doc.cur : pageIndex;
      const p = GW.doc.pages[i];
      if (!p) return null;
      if (TABS.some((t) => t.pageId === p.id)) { this.activate(p.id); return p.id; }
      while (TABS.length >= 3) TABS.shift();            // 上限 3：丢最旧的（不弹窗，不打断上课）
      TABS.push({ pageId: p.id, index: i, view: Object.assign({}, GW.camera) });
      render();
      return p.id;
    },
    close(pageId) {
      const k = TABS.findIndex((t) => t.pageId === pageId);
      if (k < 0) return false;
      TABS.splice(k, 1);
      render();
      return true;
    },
    // 切到某个标签：先把当前视口记回当前标签，再恢复目标页的视口（不重载文档）
    activate(pageId) {
      const t = TABS.find((x) => x.pageId === pageId);
      if (!t) return false;
      const cur = TABS.find((x) => x.pageId === (GW.page() || {}).id);
      if (cur) cur.view = Object.assign({}, GW.camera);
      const idx = GW.doc.pages.findIndex((p) => p.id === pageId);
      if (idx < 0) { this.close(pageId); return false; }
      if (idx !== GW.doc.cur) GW.gotoPage(idx);
      if (t.view) GW.setView(t.view.tx, t.view.ty, t.view.s);
      render();
      return true;
    },
  };
  function render() {
    let bar = document.getElementById('gw-tabs');
    if (!TABS.length) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'gw-tabs';
      document.body.append(bar);
    }
    bar.innerHTML = '';
    for (const t of TABS) {
      const p = GW.doc.pages.find((x) => x.id === t.pageId);
      if (!p) continue;
      const on = (GW.page() || {}).id === t.pageId;
      const b = document.createElement('button');
      b.className = 'gw-tab' + (on ? ' on' : '');
      b.textContent = (p.name || ('第 ' + (GW.doc.pages.indexOf(p) + 1) + ' 页')).slice(0, 10);
      b.title = '切到这一页（保留各自的视口）';
      b.onclick = () => GW.tabs.activate(t.pageId);
      const x = document.createElement('span');
      x.className = 'gw-tab-x'; x.textContent = '×'; x.title = '关闭标签';
      x.onclick = (e) => { e.stopPropagation(); GW.tabs.close(t.pageId); };
      b.append(x);
      bar.append(b);
    }
  }

  // ---------------- A6：页面旋转 ----------------
  GW.rotatePage = function (deg) {
    const p = GW.page();
    if (!p) return 0;
    const cur = +p.rot || 0;
    const v = deg == null ? (cur + 90) % 360 : ((+deg % 360) + 360) % 360;
    p.rot = v === 90 || v === 180 || v === 270 ? v : 0;
    if (GW.markDirty) GW.markDirty();
    if (GW.repaintBg) GW.repaintBg();
    if (GW.requestRender) GW.requestRender();
    if (GW.toast) GW.toast('页面旋转 ' + p.rot + '°', 1400);
    return p.rot;
  };

  // ---------------- C1：模板锁定一键切换 ----------------
  // 关 = 全部解锁（可以整块拖走）；开 = 全部锁定（穿透，可以书写）。逐条记历史，撤销可回。
  GW.tplLock = function (on) {
    const p = GW.page();
    if (!p || !GW.objects) return 0;
    const want = on == null ? true : !!on;
    let n = 0;
    for (const o of p.objs) {
      if (!(o.tpl || (o.data && o.data.tpl))) continue;
      if (!!o.locked === want) continue;
      const before = GW.clone(o);
      o.locked = want;
      n++;
      GW.commit({ update: [{ before, after: o }] });
      const el = GW.objects.el(o);
      if (el) GW.objects.update(o);
    }
    if (GW.toast) GW.toast(want ? '模板已锁定：可直接在模板上书写' : '模板已解锁：可拖动整块模板', 2200);
    return n;
  };
  GW.tplLocked = function () {
    const p = GW.page();
    if (!p) return null;
    const list = (p.objs || []).filter((o) => o.tpl || (o.data && o.data.tpl));
    if (!list.length) return null;
    return list.every((o) => o.locked);
  };

  // ---------------- A5：模板库 JSON 导入/导出 ----------------
  // 只导 spec 纯数据：build 函数**不导出**（导了就必然要 eval，绝对不能做）。
  // 因此导出时把 build 物化成 objs（与运行时 page.objs 完全同规格），导入方拿到的是纯数据模板。
  const LIM = { w: 4000, h: 4000, objs: 12 };
  function specOf(t) {
    const objs = GW.tplObjs ? GW.tplObjs(t) : (t.objs || []);
    return {
      id: t.id, name: t.name, desc: t.desc || '', w: t.w || 794, h: t.h || 1123,
      objs: objs.map((o) => ({
        x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w), h: Math.round(o.h),
        size: o.size || 14, html: String(o.html || ''), zone: o.zone ? 1 : 0,
      })),
    };
  }
  GW.exportTpl = function (ids) {
    const list = (GW.CONTENT_TPL || []).filter((t) => !ids || ids.indexOf(t.id) >= 0).map(specOf);
    return JSON.stringify({ app: 'gewu-board', kind: 'tpl', version: 1, at: new Date().toISOString(), templates: list }, null, 2);
  };
  GW.importTpl = function (text) {
    let d;
    try { d = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, error: 'JSON 解析失败' }; }
    if (!d || d.kind !== 'tpl' || !Array.isArray(d.templates)) return { ok: false, error: '不是模板库文件' };
    const added = [], skipped = [];
    for (const raw of d.templates.slice(0, 200)) {
      if (!raw || typeof raw !== 'object') { skipped.push('(坏条目)'); continue; }
      const id = String(raw.id || '').trim();
      if (!id || !/^[a-z0-9][a-z0-9-]{0,38}$/i.test(id)) { skipped.push(id || '(空 id)'); continue; }
      if ((GW.CONTENT_TPL || []).some((t) => t.id === id)) { skipped.push(id + '（id 已存在）'); continue; }
      const w = Math.min(LIM.w, Math.max(200, +raw.w || 794));
      const hh = Math.min(LIM.h, Math.max(200, +raw.h || 1123));
      if (!Array.isArray(raw.objs) || !raw.objs.length) { skipped.push(id + '（没有对象）'); continue; }
      const objs = [];
      for (const o of raw.objs.slice(0, LIM.objs)) {
        if (!o || typeof o !== 'object') continue;
        const it = {
          x: +o.x || 0, y: +o.y || 0, w: Math.min(LIM.w, +o.w || 100), h: Math.min(LIM.h, +o.h || 40),
          size: Math.min(96, Math.max(8, +o.size || 14)),
          html: String(o.html == null ? '' : o.html).slice(0, 20000),
        };
        if (o.zone) it.zone = 1;
        objs.push(it);
      }
      if (!objs.length) { skipped.push(id + '（对象全部无效）'); continue; }
      GW.CONTENT_TPL.push({ id, name: String(raw.name || id).slice(0, 40), desc: String(raw.desc || '').slice(0, 80), w, h: hh, objs, imported: 1 });
      added.push(id);
    }
    return { ok: added.length > 0, added, skipped };
  };

  // ---------------- 按钮条 ----------------
  // 挂一条工具条（右下角，可关）：页面标签 / 旋转 / 模板锁定 / 贴纸 / 诊断包
  GW.docTools = function () {
    let bar = document.getElementById('gw-doctools');
    if (bar) { bar.remove(); return null; }
    bar = document.createElement('div');
    bar.id = 'gw-doctools';
    const mk = (label, tip, fn) => {
      const b = document.createElement('button');
      b.className = 'gw-dt-btn'; b.textContent = label; b.title = tip;
      b.onclick = fn;
      bar.append(b);
      return b;
    };
    mk('📌 标签', '把当前页钉成标签（最多 3 个）', () => { GW.tabs.pin(); GW.toast('已钉住当前页（共 ' + GW.tabs.list().length + ' 个标签）', 1800); });
    mk('⟳ 旋转', '页面旋转 90°（0/90/180/270）', () => GW.rotatePage());
    mk('🔓 模板', '模板锁定/解锁一键切换', () => GW.tplLock(!GW.tplLocked()));
    mk('⭐ 贴纸', '打开贴纸库（30 个自绘图形）', () => {
      if (GW.drawer) GW.drawer('贴纸库', null, h('div', { class: 'dr-body' }, GW.stickers.panel()), { width: 'min(420px, 92vw)' });
    });
    mk('🩺 诊断', '导出诊断包（zip：版本 + 日志 + 最近操作）', () => {
      const r = GW.diagBundle();
      GW.toast(r.saved ? '诊断包已导出：' + r.name + '（' + Math.round(r.size / 1024) + ' KB）' : '诊断包生成失败，见日志', 2600);
    });
    document.body.append(bar);
    return bar;
  };

  (function css() {
    if (document.getElementById('gw-docui-css')) return;
    const s = document.createElement('style');
    s.id = 'gw-docui-css';
    s.textContent = [
      '#gw-doctools{position:fixed;right:14px;bottom:76px;display:flex;gap:6px;z-index:60;flex-wrap:wrap;max-width:220px}',
      '.gw-dt-btn{font-size:12px;padding:6px 9px;border-radius:9px;border:1px solid rgba(120,140,160,.35);' +
        'background:rgba(255,255,255,.9);cursor:pointer;color:#2f3a45}',
      '.gw-dt-btn:hover{background:#fff;border-color:rgba(90,150,230,.6)}',
      '#gw-tabs{position:fixed;left:14px;bottom:76px;display:flex;gap:6px;z-index:60}',
      '.gw-tab{display:flex;align-items:center;gap:6px;font-size:12px;padding:6px 8px;border-radius:9px;' +
        'border:1px solid rgba(120,140,160,.35);background:rgba(255,255,255,.9);cursor:pointer;color:#2f3a45}',
      '.gw-tab.on{background:rgba(15,157,138,.16);border-color:rgba(15,157,138,.5);font-weight:700}',
      '.gw-tab-x{opacity:.5;font-size:13px;line-height:1}.gw-tab-x:hover{opacity:1}',
      '#gw-cursors{position:fixed;left:0;top:0;pointer-events:none;z-index:59}',
      '.gw-cur{position:absolute;left:-4px;top:-4px;transition:opacity .5s;will-change:transform}',
      '.gw-cur i{display:block;width:9px;height:9px;border-radius:50%;background:rgba(228,87,46,.95);box-shadow:0 0 0 3px rgba(228,87,46,.18)}',
      '.gw-cur b{position:absolute;left:12px;top:-2px;font-size:11px;font-weight:600;color:#fff;background:rgba(40,50,62,.82);padding:1px 5px;border-radius:6px;white-space:nowrap}',
      '.stk-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}',
      '.stk-cell{border:1px solid rgba(120,140,160,.3);border-radius:9px;background:rgba(255,255,255,.7);padding:2px;cursor:pointer}',
      '.stk-cell:hover{border-color:rgba(90,150,230,.6)}',
      '.stk-thumb{display:block;width:100%;height:auto}',
    ].join('\n');
    document.head.append(s);
  })();
})();
