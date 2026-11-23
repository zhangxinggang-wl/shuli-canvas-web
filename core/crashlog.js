/* 数理无限画布 · 崩溃与错误留痕（Sentry 等价物，纯本地优先）
 *
 * 为什么需要它（对照反编译产物的 04-sentry-update）：
 *   原版把 renderer 的异常经 Sentry SDK 打成 envelope 发往云端，带 breadcrumbs（用户
 *   在崩溃前点了什么）、tags（版本/平台/文档类型）和采样率。目标项目此前只有
 *   kit.js 里一个 20 条的 GW.__errlog 内存数组 + 主进程一行日志 —— 窗口一关就没了，
 *   老师报「它坏了」时我们拿不到「坏之前他按了什么」。这个模块补的就是这一段。
 *
 * 移植口径（重要，和原版刻意不同）：
 *   · **不上报**。原版默认直连厂商 DSN，这里默认 dsn 为空 = 只落本地；填了 dsn 才外发，
 *     且外发必须用户显式打开设置项（GW.settings.crashDsn）。
 *   · **不引第三方 SDK**。74KB 的 @sentry/browser 在经典 <script> 体系里不好接，
 *     而我们要的只是「面包屑 + 采样 + 离线队列」三件事，300 行足够。
 *   · **不碰主进程协议**。落盘复用已有的 userPath/writeFile IPC（main.js 的 write-file），
 *     不新增 IPC 通道 —— 新增通道意味着 preload、security 白名单、安卓桥三处都要跟着改。
 *
 * 接口（保持稳定，UI 面板与 scripts/check-crashlog.js 都依赖）：
 *   GW.crashlog.init(opts)              安装（重复调用无害）
 *   GW.crashlog.breadcrumb(cat, msg, d) 记一条面包屑
 *   GW.crashlog.capture(err, ctx)       记一条异常
 *   GW.crashlog.message(msg, level, ctx)
 *   GW.crashlog.setUser({id, role}) / setTag(k, v)
 *   GW.crashlog.read()                  取本地留存（数组，新的在前）
 *   GW.crashlog.exportText()            导出成人能读的文本（关于对话框/反馈用）
 *   GW.crashlog.flush()                 有 dsn 时尝试外发
 *   GW.crashlog.clear() / stats()
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const GW = (root.GW = root.GW || {});
  GW.crashlog = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const KEY = 'gewu.crashlog';
  const MAX_CRUMBS = 120;      // 面包屑只留最近 120 条（原版默认 100，这里按「一节课的操作量」放宽）
  const MAX_RECORDS = 60;      // 本地最多留 60 条异常，超出丢最老的
  const MAX_BYTES = 220 * 1024; // localStorage 单键上限留足余量（配额一般 5–10MB，但不能让一个键吃满）
  const SESSION_LIMIT = 30;    // 单次会话最多记 30 条，防「每秒报错」把队列刷爆
  const DEDUPE_MS = 5000;      // 同一条消息 5s 内只记一次（渲染循环里的报错常常每帧一次）

  let api = null; // 供 init/内部函数回指（factory 末尾赋值）

  const state = {
    installed: false,
    records: [],
    crumbs: [],
    session: 0,
    seen: Object.create(null),
    tags: Object.create(null),
    user: null,
    opts: { dsn: '', sampleRate: 1, maxRecords: MAX_RECORDS, persist: true },
  };

  // ---------- 环境 ----------
  function env() {
    const g = typeof window !== 'undefined' ? window : null;
    const gw = g && g.GW;
    return {
      ver: (gw && gw.APP_VERSION) || '0',
      electron: !!(g && g.gewu && g.gewu.isElectron),
      platform: (g && g.gewu && g.gewu.platform) || 'web',
      ua: (g && g.navigator && g.navigator.userAgent) || '',
      w: (g && g.innerWidth) || 0,
      h: (g && g.innerHeight) || 0,
      doc: (gw && gw.board && gw.board.title) || '',
    };
  }

  function nowIso() { return new Date().toISOString(); }

  // ---------- 本地留存 ----------
  function storage() {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage;
    } catch (_) { return null; }
  }

  function load() {
    const ls = storage();
    if (!ls) return;
    try {
      const raw = ls.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.records)) state.records = data.records.slice(0, MAX_RECORDS);
      if (data && Array.isArray(data.crumbs)) state.crumbs = data.crumbs.slice(-MAX_CRUMBS);
    } catch (_) { /* 坏数据当没有：这里绝不能抛，否则启动就崩 */ }
  }

  // 写回时按「条数 + 字节」双上限裁剪：先丢最老的整条，再不行就丢掉 crumbs
  function save() {
    if (!state.opts.persist) return;
    const ls = storage();
    if (!ls) return;
    let payload = { v: 1, records: state.records.slice(0, state.opts.maxRecords), crumbs: state.crumbs };
    let text = '';
    try { text = JSON.stringify(payload); } catch (_) { return; }
    while (text.length > MAX_BYTES && payload.records.length > 1) {
      payload.records.pop();
      text = JSON.stringify(payload);
    }
    if (text.length > MAX_BYTES) { payload.crumbs = []; text = JSON.stringify(payload); }
    try { ls.setItem(KEY, text); } catch (_) {
      // 配额满：丢掉一半再试一次，还不行就认命（不能因为存日志把主流程搞挂）
      try {
        payload.records = payload.records.slice(0, Math.ceil(payload.records.length / 2));
        payload.crumbs = [];
        ls.setItem(KEY, JSON.stringify(payload));
      } catch (__) {}
    }
    mirrorToDisk();
  }

  // Electron 下再写一份到 <userData>/crashlog.json：localStorage 会被「卸载时删除数据」清掉，
  // 而崩溃报告恰恰要在重装/换机之后还能拿到。写盘失败不影响任何功能。
  let diskTimer = 0;
  function mirrorToDisk() {
    const g = typeof window !== 'undefined' ? window : null;
    if (!g || !g.gewu || typeof g.gewu.writeFile !== 'function' || typeof g.gewu.userPath !== 'function') return;
    if (diskTimer) return;
    diskTimer = setTimeout(async () => {
      diskTimer = 0;
      try {
        const p = await g.gewu.userPath('crashlog.json');
        if (p) await g.gewu.writeFile(p, JSON.stringify({ v: 1, records: state.records, crumbs: state.crumbs }, null, 1), 'utf8');
      } catch (_) {}
    }, 4000); // 4s 合并：崩溃往往连着来，别每条都写一次盘
  }

  // ---------- 面包屑 ----------
  function breadcrumb(cat, msg, data) {
    const c = { t: Date.now(), cat: String(cat || 'log'), msg: String(msg == null ? '' : msg).slice(0, 200) };
    if (data && typeof data === 'object') {
      const flat = {};
      let n = 0;
      for (const k in data) {
        if (n++ >= 8) break; // 只留 8 个字段，防止把整张画布塞进面包屑
        const v = data[k];
        // 字符串也要截断：面包屑里最常见的就是「一整段题干」或「一条长路径」
        flat[k] = typeof v === 'object' ? jsonish(v) : (typeof v === 'string' && v.length > 160 ? v.slice(0, 160) + '…' : v);
      }
      c.data = flat;
    }
    state.crumbs.push(c);
    if (state.crumbs.length > MAX_CRUMBS) state.crumbs.splice(0, state.crumbs.length - MAX_CRUMBS);
  }

  function jsonish(v) {
    try {
      const s = JSON.stringify(v);
      return s.length > 160 ? s.slice(0, 160) + '…' : s;
    } catch (_) { return '[unserializable]'; }
  }

  // ---------- 采集 ----------
  function normalize(err) {
    if (err instanceof Error) return { msg: err.message, stack: err.stack || '', name: err.name };
    if (err && typeof err === 'object') return { msg: String(err.msg || err.message || jsonish(err)), stack: String(err.stack || ''), name: err.name || 'Object' };
    return { msg: String(err == null ? 'unknown' : err), stack: '', name: 'String' };
  }

  function capture(err, ctx) {
    const e = normalize(err);
    const msg = e.msg.slice(0, 500);
    if (!msg) return null;
    // 去重 + 限流：渲染循环里的异常每帧一次，不限流会把队列和 localStorage 一起打死。
    // 去重指纹只取「类型 + 消息」，不含调用栈 —— 同一个 bug 在不同帧里栈顶常常不同，
    // 带上栈就一条都去不掉（原版 Sentry 的 fingerprint 默认也是消息级）。
    const forced = !!(ctx && ctx.force);
    const key = e.name + '|' + msg;
    const last = state.seen[key] || 0;
    if (!forced && Date.now() - last < DEDUPE_MS) return null;
    state.seen[key] = Date.now();
    if (!forced && state.session >= SESSION_LIMIT) return null;
    if (!forced) state.session += 1;

    const rec = {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      t: Date.now(),
      iso: nowIso(),
      level: (ctx && ctx.level) || 'error',
      name: e.name,
      msg,
      stack: String(e.stack || '').slice(0, 4000),
      tags: Object.assign({}, state.tags, (ctx && ctx.tags) || {}),
      extra: ctx && ctx.extra ? (typeof ctx.extra === 'object' ? JSON.parse(safeJson(ctx.extra)) : String(ctx.extra)) : null,
      user: state.user,
      env: env(),
      crumbs: state.crumbs.slice(-40),
    };
    state.records.unshift(rec);
    while (state.records.length > state.opts.maxRecords) state.records.pop();

    // 主进程已经有 ERR 日志通道，这里顺带喂一份，保证「日志文件里能看到带栈的一行」
    try {
      const g = typeof window !== 'undefined' ? window : null;
      if (g && g.gewu && typeof g.gewu.rendererError === 'function') {
        g.gewu.rendererError({ msg: rec.msg, stack: rec.stack, src: (ctx && ctx.src) || '', line: (ctx && ctx.line) || 0, col: 0, t: rec.t });
      }
    } catch (_) {}

    save();
    if (state.opts.dsn) flush();
    return rec;
  }

  function safeJson(v) { try { return JSON.stringify(v); } catch (_) { return '"[unserializable]"'; } }

  function message(msg, level, ctx) {
    // 手动上报（用户点「反馈问题」自己写的）不受去重与限流约束 —— 那是人主动给的线索
    return capture({ message: String(msg), msg: String(msg), stack: '' }, Object.assign({}, ctx, { level: level || 'info', force: true }));
  }

  // ---------- 外发（默认关闭）----------
  // 协议用 Sentry 的 envelope 形状，方便以后换成任意兼容接收端；没配 dsn 时整个函数是空转。
  function envelope(rec) {
    const header = JSON.stringify({ event_id: rec.id, sent_at: rec.iso, dsn: state.opts.dsn });
    const item = JSON.stringify({ type: 'event' });
    const body = JSON.stringify({
      event_id: rec.id,
      timestamp: rec.t / 1000,
      level: rec.level,
      platform: 'javascript',
      release: rec.env.ver,
      environment: rec.env.electron ? 'electron' : 'web',
      tags: rec.tags,
      user: rec.user || undefined,
      message: rec.msg,
      exception: { values: [{ type: rec.name, value: rec.msg, stacktrace: rec.stack ? { frames: [{ text: rec.stack }] } : undefined }] },
      breadcrumbs: rec.crumbs.map((c) => ({ timestamp: c.t / 1000, category: c.cat, message: c.msg, data: c.data })),
      extra: rec.extra || undefined,
    });
    return header + '\n' + item + '\n' + body;
  }

  let flushing = false;
  function flush() {
    if (flushing || !state.opts.dsn) return Promise.resolve(false);
    if (typeof fetch !== 'function') return Promise.resolve(false);
    flushing = true;
    const batch = state.records.filter((r) => !r.sent).slice(0, 5);
    if (!batch.length) { flushing = false; return Promise.resolve(false); }
    return Promise.all(batch.map((r) => fetch(state.opts.dsn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope(r),
      keepalive: true,
    }).then((res) => { if (res && res.ok) r.sent = true; return true; }).catch(() => false)))
      .then((arr) => { flushing = false; save(); return arr.some(Boolean); });
  }

  // ---------- 安装 ----------
  function init(opts) {
    Object.assign(state.opts, opts || {});
    if (state.installed) return api;
    state.installed = true;
    load();

    const g = typeof window !== 'undefined' ? window : null;
    if (!g) return api;

    // 1. 接住 kit.js 已有的全局钩子：它已经把 window.onerror / unhandledrejection
    //    收敛到 GW.reportRendererError 一个出口，这里包一层比再注册两个监听更不容易漏。
    const gw = g.GW || (g.GW = {});
    const prev = gw.reportRendererError;
    gw.reportRendererError = function (msg, stack, src, line, col) {
      try { capture({ msg, stack, name: 'Error' }, { src, line, col }); } catch (_) {}
      if (typeof prev === 'function') return prev.apply(this, arguments);
    };

    // 2. 面包屑自动化：总线上凡是「老师做了什么」的事件都留一条。
    //    只订阅语义明确的几个，避免总线高频事件（pointermove/zoom）把环形缓冲刷空。
    if (gw.bus && typeof gw.bus.on === 'function') {
      const map = {
        tool: 'ui.tool', docOpen: 'nav.open', docClose: 'nav.close', save: 'doc.save',
        ai: 'ai.call', aiDone: 'ai.done', export: 'doc.export', import: 'doc.import',
        sim: 'sim.open', teach: 'class.teach', sync: 'sync', error: 'app.error',
      };
      Object.keys(map).forEach((ev) => {
        gw.bus.on(ev, (d) => breadcrumb(map[ev], ev, d && typeof d === 'object' ? d : { v: d }));
      });
    }

    // 3. 页面隐藏时补一次外发（Electron 关窗前是最后的窗口期）
    try {
      g.document.addEventListener('visibilitychange', () => { if (g.document.hidden) flush(); });
      g.addEventListener('beforeunload', () => flush());
    } catch (_) {}

    breadcrumb('app', 'crashlog 就绪 v' + env().ver);
    return api;
  }

  function setUser(u) { state.user = u ? { id: String(u.id || '').slice(0, 64), role: String(u.role || '').slice(0, 32) } : null; }
  function setTag(k, v) { if (k) state.tags[String(k).slice(0, 32)] = String(v).slice(0, 120); }
  function read() { return state.records.slice(); }
  function crumbs() { return state.crumbs.slice(); }
  function clear() { state.records = []; save(); }
  function stats() {
    return {
      installed: state.installed,
      records: state.records.length,
      crumbs: state.crumbs.length,
      session: state.session,
      dsn: !!state.opts.dsn,
      bytes: (function () { try { return (storage() && storage().getItem(KEY) || '').length; } catch (_) { return 0; } })(),
    };
  }

  function exportText() {
    const recs = state.records;
    const head = [
      '数理无限画布 · 运行记录',
      '版本 ' + env().ver + ' · ' + env().platform + ' · ' + nowIso(),
      '异常 ' + recs.length + ' 条，面包屑 ' + state.crumbs.length + ' 条',
      '',
    ].join('\n');
    const body = recs.map((r) => [
      '【' + r.iso + '】' + r.level + ' ' + r.msg,
      r.stack ? r.stack : '(无调用栈)',
      r.crumbs.length ? '最近操作：' + r.crumbs.slice(-8).map((c) => c.cat + ':' + c.msg).join(' / ') : '',
      '',
    ].filter(Boolean).join('\n')).join('\n');
    return head + body;
  }

  api = {
    init, capture, message, breadcrumb, setUser, setTag, read, crumbs, clear, stats, flush, exportText,
    // 测试钩子（不参与产品逻辑）
    __state: state,
  };
  return api;
});

// 浏览器/Electron 里脚本一加载就装上：kit.js 的全局钩子在同一轮 <script> 里已经就绪，
// 早于此位置的异常本来就抓不到，晚于此位置又会漏掉启动期的错，所以放在模块末尾。
// Node（单测）不自动安装，否则 require 就产生副作用。
if (typeof window !== 'undefined' && window.GW && window.GW.crashlog && typeof window.document !== 'undefined') {
  try { window.GW.crashlog.init(); } catch (_) {}
}
