/*
 * physics-adapter-web.js —— SVG 网页试点的父侧状态桥与真实静态导出
 *
 * 只对 web:simhtml/circuit-simplify.html 生效；保持 insertWeb / obj/web / data.url 旧路径不变。
 *  · 校验消息来自预期 iframe（e.source === frame.contentWindow）、预期页面（page 字段）、
 *    当前实例（token + item id）；状态字段白名单 + 32KB 大小限制。
 *  · 旧卡片没有 data.gwState 时 init 不带状态，页面按原来的默认方式启动。
 *  · exportStatic 返回真矢量 SVG 图元；失败时返回 {ok:false, kind:'placeholder', reason}
 *    并记录到 failures，由 export.js 回退到现有占位框。
 *
 * 回滚：删掉 src/index.html 里本文件的 <script> 行、objects.js 的 attach/detach 两处、
 *      export.js 的钩子；旧 obj/web 仍走原来的占位导出。
 */
(function () {
  'use strict';
  if (!window.GW) return;
  var GW = window.GW;
  var M = GW.physicsModels;
  if (!M) return;

  var WEB_ID = M.PILOT.WEB;
  var CHANNEL = 'gw-physics-model';
  var PAGE_ID = 'simhtml/circuit-simplify.html';
  var MAX_BYTES = 32 * 1024;
  var MAX_SVG = 512 * 1024;
  var STATE_KEYS = { nodes: 1, fixedPoints: 1, components: 1, wires: 1 };
  var bridges = Object.create(null);
  var failures = [];
  var reqSeq = 0;

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function reportFailure(id, reason) {
    failures.push({ id: id, reason: String(reason || '未知原因'), at: Date.now() });
    if (failures.length > 50) failures.shift();
  }
  function send(b, type, payload) {
    if (!b || !b.frame || !b.frame.contentWindow) return false;
    try {
      b.frame.contentWindow.postMessage(Object.assign({
        channel: CHANNEL, page: PAGE_ID, type: type, id: b.id, token: b.token
      }, payload || {}), '*');
      return true;
    } catch (e) { return false; }
  }
  function storeState(o, s) {
    if (!s || typeof s !== 'object') return false;
    var raw;
    try { raw = JSON.stringify(s); } catch (e) { return false; }
    if (!raw || raw.length > MAX_BYTES) { reportFailure(o.id, '状态超过 ' + MAX_BYTES + ' 字节'); return false; }
    var clean = {};
    Object.keys(s).forEach(function (k) { if (STATE_KEYS[k]) clean[k] = s[k]; });
    if (!Object.keys(clean).length) { reportFailure(o.id, '状态没有白名单字段'); return false; }
    o.data.gwState = clean;
    if (GW.markDirty) GW.markDirty();
    return true;
  }
  function request(b, type, payload, ms) {
    return new Promise(function (resolve) {
      var req = 'r' + (++reqSeq);
      var t = setTimeout(function () { delete b.pending[req]; resolve(null); }, ms || 2000);
      b.pending[req] = { resolve: resolve, t: t };
      if (!send(b, type, Object.assign({ req: req }, payload))) {
        clearTimeout(t); delete b.pending[req]; resolve(null);
      }
    });
  }
  function resolvePending(b, req, data) {
    var p = b && b.pending[req];
    if (!p) return;
    clearTimeout(p.t); delete b.pending[req]; p.resolve(data);
  }

  // 二次净化：即使页内桥被绕过，导出物也不得带脚本 / 事件属性 / 外链 / 命中层。
  function sanitizeSVG(xml) {
    var s = String(xml || '');
    if (!s) return { ok: false, reason: '页内未返回 SVG 内容' };
    if (s.length > MAX_SVG) return { ok: false, reason: 'SVG 超过 ' + MAX_SVG + ' 字节' };
    s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, '')
      .replace(/<image\b[^>]*\/?>/gi, '')
      .replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi, '');
    s = s.replace(/<([a-zA-Z][\w:-]*)\b([^>]*\bclass\s*=\s*["'][^"']*\b(?:wire-hit|grip-handle)\b[^"']*["'][^>]*)>[\s\S]*?<\/\1\s*>/gi, '');
    s = s.replace(/<[a-zA-Z][\w:-]*\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:wire-hit|grip-handle)\b[^"']*["'][^>]*\/?>/gi, '');
    s = s.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    s = s.replace(/\s(?:xlink:)?href\s*=\s*(?:"(?!#)[^"]*"|'(?!#)[^']*')/gi, '');
    s = s.replace(/\ssrc\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
    s = s.replace(/url\s*\([^)]*\)/gi, 'none');
    if (/<script|\son[a-z]+\s*=|javascript:/i.test(s)) return { ok: false, reason: 'SVG 未通过安全过滤' };
    if (!/<(line|path|circle|rect|text|g|polyline|polygon|ellipse)\b/i.test(s)) {
      return { ok: false, reason: 'SVG 中没有实际图元' };
    }
    return { ok: true, xml: s };
  }

  function attach(o, f) {
    if (!o || !f) return null;
    if (M.templateIdOf(o) !== WEB_ID) return null;   // 新能力只对该试点开放
    detach(o.id);
    var token = GW.uid();
    var b = { id: o.id, frame: f, token: token, ready: false, pending: Object.create(null), off: null };
    var onMessage = function (e) {
      if (e.source !== f.contentWindow) return;                   // 必须来自本实例的 iframe
      var d = e.data;
      if (!d || d.channel !== CHANNEL || d.page !== PAGE_ID) return;  // 必须来自预期页面
      // 页面首次握手还不知道实例 id，只按 source + page 校验；init 会把 id/token 交给它
      if (d.type === 'hello') {
        send(b, 'init', { state: o.data.gwState || null });       // 旧卡无状态 → 原方式启动
        return;
      }
      if (d.id !== o.id || d.token !== token) return;             // 必须是当前实例
      if (d.type === 'ready' || d.type === 'state') {
        b.ready = true;
        if (d.state) storeState(o, d.state);
      } else if (d.type === 'exportSVG') {
        resolvePending(b, d.req, d);
      }
    };
    window.addEventListener('message', onMessage);
    b.off = function () { window.removeEventListener('message', onMessage); };
    bridges[o.id] = b;
    // iframe 可能已 onload（hello 早于 attach）：主动补一次握手
    send(b, 'init', { state: o.data.gwState || null });
    return b;
  }
  function detach(id) {
    var b = bridges[id];
    if (!b) return false;
    if (b.off) b.off();
    Object.keys(b.pending).forEach(function (k) {
      clearTimeout(b.pending[k].t);
      try { b.pending[k].resolve(null); } catch (e) { /* noop */ }
    });
    delete bridges[id];
    return true;                                                // 重复调用返回 false（幂等）
  }
  function exportStatic(o) {
    var b = bridges[o.id];
    if (!b) {
      var why = '实例未挂载状态桥（旧卡片或非试点页）';
      reportFailure(o.id, why);
      return Promise.resolve({ ok: false, kind: M.EXPORT_KIND.PLACEHOLDER, reason: why });
    }
    return request(b, 'exportSVG', {}, 2000).then(function (r) {
      if (!r) {
        reportFailure(o.id, '页内 SVG 导出超时');
        return { ok: false, kind: M.EXPORT_KIND.PLACEHOLDER, reason: '页内 SVG 导出超时' };
      }
      if (r.err || !r.xml) {
        reportFailure(o.id, r.err || '页内未返回 SVG');
        return { ok: false, kind: M.EXPORT_KIND.PLACEHOLDER, reason: r.err || '页内未返回 SVG' };
      }
      var clean = sanitizeSVG(r.xml);
      if (!clean.ok) {
        reportFailure(o.id, clean.reason);
        return { ok: false, kind: M.EXPORT_KIND.PLACEHOLDER, reason: clean.reason };
      }
      return {
        ok: true, kind: M.EXPORT_KIND.VECTOR, source: 'page-svg',
        op: {
          k: 'svg', x: o.x, y: o.y, w: o.w, h: o.h,
          viewBox: r.viewBox || '0 0 800 500', xml: clean.xml
        }
      };
    });
  }

  // 三个电阻旋角是首版开放的命名参数
  var ANGLES = [
    { key: 'R1', label: '电阻 R1 旋角', min: -360, max: 360, step: 1, def: 0 },
    { key: 'R2', label: '电阻 R2 旋角', min: -360, max: 360, step: 1, def: 0 },
    { key: 'R3', label: '电阻 R3 旋角', min: -360, max: 360, step: 1, def: 0 },
  ];
  function ensureState(it) {
    it.data = it.data || {};
    it.data.gwState = it.data.gwState || {};
    it.data.gwState.components = it.data.gwState.components || {};
    return it.data.gwState;
  }
  var adapter = {
    // 纯构造：仍是旧 obj/web 记录（data.url），新增状态放在 data.gwState
    prepare: function (input, box) {
      var v = M.validateParams(WEB_ID, input && input.params, {});
      if (!v.ok) throw new Error(v.error);
      var b = box || { x0: 0, y0: 0, x1: 800, y1: 500 };
      var st = { components: {} };
      ANGLES.forEach(function (p) { st.components[p.key] = { angle: v.params[p.key] }; });
      return {
        id: GW.uid(), kind: 'obj', type: 'web',
        x: Math.min(b.x0, b.x1), y: Math.min(b.y0, b.y1),
        w: Math.abs(b.x1 - b.x0), h: Math.abs(b.y1 - b.y0), z: 0,
        data: { url: PAGE_ID, title: '电路化简', gwState: st },
      };
    },
    readParams: function (it) {
      var c = (it && it.data && it.data.gwState && it.data.gwState.components) || {};
      var out = {};
      ANGLES.forEach(function (p) { out[p.key] = c[p.key] && typeof c[p.key].angle === 'number' ? c[p.key].angle : p.def; });
      return out;
    },
    applyParams: function (it, params) {
      var v = M.validateParams(WEB_ID, params, { partial: true });
      if (!v.ok) throw new Error(v.error);
      var st = ensureState(it);
      Object.keys(v.params).forEach(function (k) {
        st.components[k] = st.components[k] || {};
        st.components[k].angle = v.params[k];
      });
      var b = bridges[it.id];
      if (b) send(b, 'setParams', { params: v.params });   // 同步进已挂载实例
      return it;
    },
    mount: function (o, f) { return attach(o, f); },
    destroy: function (handle) { return detach(handle && handle.id ? handle.id : handle); },
    exportStatic: exportStatic,
  };

  M.register(WEB_ID, {
    label: '电路化简（SVG 网页）', category: 'simhtml', source: 'catalog',
    capabilities: [M.CAP.PREPARE, M.CAP.READ_PARAMS, M.CAP.APPLY_PARAMS, M.CAP.MOUNT,
      M.CAP.DESTROY, M.CAP.EXPORT_STATIC, M.CAP.RESTORE_PARAMS, M.CAP.STATE_BRIDGE],
    params: ANGLES,
    aspect: 800 / 500, defaultSize: { w: 800, h: 500 },
    exportStatic: M.EXPORT_KIND.VECTOR,
    runtime: { mounted: true, destroy: true, restoreParams: true, restoreFrame: false },
    controls: [],
    notes: '受控状态桥落 data.gwState（旋角/元件位置/节点合并/导线控制点）；真实静态 SVG 导出，失败回退占位并记录可判断原因。旧卡无 gwState 时按原方式启动。',
  }, adapter);

  GW.physicsWebBridge = {
    attach: attach, detach: detach, sanitizeSVG: sanitizeSVG,
    list: function () { return Object.keys(bridges); },
    get: function (id) { return bridges[id] || null; },
    reportFailure: reportFailure,
    lastExportFailures: function () { return failures.slice(); },
    clearFailures: function () { failures.length = 0; },
  };
})();
