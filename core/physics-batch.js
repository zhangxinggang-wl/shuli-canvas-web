/*
 * physics-batch.js —— 同页批量插入命令（菜单与 AI 共用同一个入口）
 *
 *   GW.physicsBatch.insert({ pageId, templateId, rows:[{params:{...}}], cols, origin, cell, gap })
 *   GW.physicsBatch.remove(ids)
 *   GW.physicsBatch.openPanel()   —— 菜单用的极简配置浮层
 *
 * 约束（首版）：
 *   · 只支持同一页、且模板显式声明了 batch 能力的条目；
 *   · 预检全部通过后才提交；任何一行非法 / 分页越界 / 目标页已删除，整批在提交前失败；
 *   · 一次 GW.addItemsOn(page, items, true, {atomic:true})，一次 commit = 单步撤销/重做；
 *     绝不逐条 insert（避免多次历史与视口副作用）；
 *   · 记录仍按原 ink/objs 结构保存，不新增 .gewu 字段；普通 gid 继续服务选区。
 *
 * 回滚：删掉 src/index.html 里本文件的 <script> 行；board.js 的 opts.atomic 分支对旧调用是死代码。
 */
(function () {
  'use strict';
  if (!window.GW) return;
  var GW = window.GW;
  var M = GW.physicsModels;
  if (!M) return;   // 注册中心被回滚时，本模块自动失效

  var MAX_ROWS = 200, MAX_COLS = 20;
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function fail(error, extra) { return Object.assign({ ok: false, error: error }, extra || {}); }
  function clampInt(v, def, lo, hi) {
    var n = Math.floor(Number(v));
    return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
  }

  function findPage(pageId) {
    var doc = GW.doc;
    if (!doc || !Array.isArray(doc.pages)) return null;
    if (!pageId) return (GW.page && GW.page()) || doc.pages[doc.cur] || null;
    for (var i = 0; i < doc.pages.length; i++) if (doc.pages[i] && doc.pages[i].id === pageId) return doc.pages[i];
    return null;   // 页已删除 / 不属于当前文档
  }
  function pool(page) { return (page.ink || []).concat(page.objs || []); }
  function idSet(page) {
    var s = Object.create(null);
    pool(page).forEach(function (it) { if (it && it.id) s[it.id] = 1; });
    return s;
  }
  function defaultOrigin(cols, nRows, cw, ch, gx, gy) {
    var cam = GW.camera || { tx: 0, ty: 0, s: 1 }, s = cam.s || 1;
    var W = (typeof window !== 'undefined' && window.innerWidth) || 1200;
    var H = (typeof window !== 'undefined' && window.innerHeight) || 800;
    var cx = (W / 2 - (cam.tx || 0)) / s, cy = (H / 2 - (cam.ty || 0)) / s;
    return { x: cx - cols * (cw + gx) / 2 + gx / 2, y: cy - nRows * (ch + gy) / 2 + gy / 2 };
  }
  function freshUid(taken) {
    if (!GW.uid) return '';
    for (var i = 0; i < 16; i++) {
      var id = GW.uid();
      if (id && !taken[id]) return id;
    }
    return '';
  }

  // ---------- 唯一的批量命令：菜单 / AI 都调它 ----------
  function insert(input) {
    var inp = input || {};
    if (M.disabled) return fail('注册中心已关闭（回滚状态）');

    // 1) 目标页仍属于当前文档
    var page = findPage(inp.pageId);
    if (!page) return fail('目标页不在当前文档内（可能已被删除）', { pageId: inp.pageId || '' });

    // 2) 模板显式声明了批量能力
    var tid = M.normalizeId(inp.templateId);
    var d = M.get(tid);
    if (!d) return fail('未知模板：' + tid, { templateId: tid });
    if (!d.adapted || !M.has(tid, M.CAP.BATCH)) {
      return fail('模板未声明批量能力：' + tid, { templateId: tid, capabilities: d.capabilities });
    }
    var A = M.adapter(tid);
    if (!A || typeof A.prepare !== 'function') return fail('模板没有 prepare：' + tid, { templateId: tid });

    // 3) 参数行 / 网格列数
    var rows = inp.rows;
    if (!Array.isArray(rows) || !rows.length) return fail('参数行 rows 必须是非空数组');
    if (rows.length > MAX_ROWS) return fail('参数行超过上限 ' + MAX_ROWS, { rows: rows.length });
    var cols = clampInt(inp.cols == null ? Math.min(4, rows.length) : inp.cols, 1, 1, MAX_COLS);
    var nRows = Math.ceil(rows.length / cols);

    // 4) 按模板宽高比算世界坐标网格
    var cell = inp.cell || {}, gap = inp.gap || {};
    var cw = isNum(cell.w) && cell.w > 0 ? cell.w : (d.defaultSize.w || 400);
    var ch = isNum(cell.h) && cell.h > 0 ? cell.h : cw / (d.aspect || 4 / 3);
    var gx = isNum(gap) ? gap : (isNum(gap.x) ? gap.x : 24);
    var gy = isNum(gap) ? gap : (isNum(gap.y) ? gap.y : 24);
    var origin = inp.origin || defaultOrigin(cols, nRows, cw, ch, gx, gy);
    if (!isNum(origin.x) || !isNum(origin.y)) return fail('origin 必须是有限数值');

    // 5) 逐行预检 + 纯构造（此时不改文档 / 历史 / 视口）
    var items = [], boxes = [], rowErrors = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      var raw = (r.params && typeof r.params === 'object') ? r.params : r;
      var v = M.validateParams(tid, raw, {});
      if (!v.ok) { rowErrors.push({ index: i, error: v.error }); continue; }
      var c = i % cols, rr = Math.floor(i / cols);
      var x0 = origin.x + c * (cw + gx), y0 = origin.y + rr * (ch + gy);
      var box = { x0: x0, y0: y0, x1: x0 + cw, y1: y0 + ch };
      var it;
      try { it = A.prepare({ params: v.params, style: r.style }, box); }
      catch (e) { rowErrors.push({ index: i, error: '无法构造：' + e.message }); continue; }
      if (!it || !it.id) { rowErrors.push({ index: i, error: 'prepare 未返回有效实例' }); continue; }
      items.push(it); boxes.push(box);
    }
    if (rowErrors.length) return fail('预检未通过，整批未提交', { rowErrors: rowErrors, templateId: tid });

    // 6) 独立 ID：批内唯一且不与页内已有条目冲突
    var taken = idSet(page), seen = Object.create(null);
    for (var j = 0; j < items.length; j++) {
      var id = items[j].id;
      if (seen[id] || taken[id]) {
        id = freshUid(taken);
        if (!id) return fail('无法生成独立实例 ID（GW.uid 不可用）', { index: j });
        items[j].id = id;
      }
      seen[id] = 1; taken[id] = 1;
    }

    // 7) 分页越界预检：任一条会被纸框裁掉就整批失败（并指出对应行）
    //    A3：按「目标页」纸框算，与 GW.addItemsOn 的 atomic 预检同一规则
    if (GW.pageClipItems) {
      var clipped = [];
      for (var k = 0; k < items.length; k++) {
        var keeps = GW.pageClipItems(items[k], page);
        if (keeps.length !== 1 || keeps[0] !== items[k]) clipped.push({ index: k, id: items[k].id });
      }
      if (clipped.length) return fail('分页越界：有实例落在纸框外，整批未提交', { rowErrors: clipped });
    }

    // 8) 一次提交（一次 commit = 单步撤销/重做），提交失败时 board.js 已保证无部分插入/历史
    var res;
    try { res = GW.addItemsOn(page, items, true, { atomic: true }); }
    catch (e) { return fail('整批提交抛错：' + e.message, { templateId: tid }); }
    if (!res || !res.ok) {
      return fail('整批提交失败（无部分插入、无残留历史）', { submit: res || null, templateId: tid });
    }
    if (res.count !== items.length || res.ids.length !== items.length) {
      return fail('整批结果数量不符', { submit: res, expected: items.length });
    }

    // 9) 可验证的整批结果：逐条确认确实落库
    var stored = idSet(page), missing = res.ids.filter(function (id) { return !stored[id]; });
    if (missing.length) return fail('提交后落库校验失败', { missing: missing, submit: res });

    return {
      ok: true, pageId: page.id, templateId: tid, ids: res.ids.slice(),
      count: items.length, cols: cols, gridRows: nRows, boxes: boxes,
      history: 1, verified: true
    };
  }

  // ---------- 批量删除：复用 GW.removeItems（作用于当前页，与选区定位一致） ----------
  function remove(ids) {
    var page = (GW.page && GW.page()) || null;
    if (!page) return fail('没有当前页');
    var want = Array.isArray(ids) ? ids : [ids];
    if (!want.length) return fail('ids 为空');
    var byId = Object.create(null);
    pool(page).forEach(function (it) { if (it && it.id) byId[it.id] = it; });
    var found = want.map(function (id) { return byId[id]; }).filter(Boolean);
    if (!found.length) return fail('当前页找不到这些实例');
    GW.removeItems(found);
    return { ok: true, pageId: page.id, ids: found.map(function (it) { return it.id; }), count: found.length, history: 1 };
  }

  // ---------- 菜单浮层：与 AI 共用同一个 insert ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function openPanel() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('gw-pm-batch-panel')) return;
    var list = M.list({ capability: M.CAP.BATCH });
    if (!list.length) return;
    var wrap = document.createElement('div');
    wrap.id = 'gw-pm-batch-panel';
    wrap.style.cssText = 'position:fixed;z-index:99999;inset:0;background:rgba(0,0,0,.35);display:flex;' +
      'align-items:center;justify-content:center;font:600 14px/1.6 "Microsoft YaHei",sans-serif;';
    var opts = list.map(function (d) {
      return '<option value="' + esc(d.id) + '">' + esc(d.label) + '（' + esc(d.id) + '）</option>';
    }).join('');
    wrap.innerHTML =
      '<div style="width:440px;max-width:92vw;max-height:86vh;overflow:auto;background:#1f2733;color:#eef3fa;' +
      'border:1px solid #3b4a5e;border-radius:12px;padding:18px 20px;box-shadow:0 18px 50px rgba(0,0,0,.5)">' +
      '<div style="font-size:17px;font-weight:800;margin-bottom:12px">批量插入物理模型' +
      '<span id="pm-close" style="float:right;cursor:pointer;color:#9fb0c6">×</span></div>' +
      '<div style="display:grid;grid-template-columns:76px 1fr;gap:8px 10px;align-items:center">' +
      '<label>模板</label><select id="pm-tpl" style="width:100%;padding:6px">' + opts + '</select>' +
      '<label>行数</label><input id="pm-rows" type="number" min="1" max="' + MAX_ROWS + '" value="4" style="width:100%;padding:6px">' +
      '<label>网格列数</label><input id="pm-cols" type="number" min="1" max="' + MAX_COLS + '" value="2" style="width:100%;padding:6px">' +
      '</div><div id="pm-params" style="margin:14px 0 8px"></div>' +
      '<div id="pm-msg" style="min-height:22px;color:#8fd6a8;font-size:12px"></div>' +
      '<div style="text-align:right;margin-top:8px"><button id="pm-cancel" style="padding:7px 16px;margin-right:8px">取消</button>' +
      '<button id="pm-go" style="padding:7px 18px;background:#3a8ee6;color:#fff;border:0;border-radius:6px;font-weight:800">插入</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    var $ = function (id) { return document.getElementById(id); };
    var msg = function (t, bad) { $('pm-msg').textContent = t; $('pm-msg').style.color = bad ? '#ff9b8f' : '#8fd6a8'; };

    function renderParams() {
      var d = M.describe($('pm-tpl').value);
      if (!d) return;
      $('pm-params').innerHTML = '<div style="color:#9fb0c6;font-size:12px;margin-bottom:6px">' +
        '参数白名单与取值范围（每行按起点+步长递增，枚举参数轮换）</div>' +
        d.params.map(function (s) {
          var range = (isNum(s.min) && isNum(s.max)) ? s.min + ' ~ ' + s.max : '';
          var step = isNum(s.step) ? s.step : 1;
          var start = isNum(s.def) ? s.def : 0;
          return '<div style="display:grid;grid-template-columns:1fr 78px 78px;gap:8px;align-items:center;margin:5px 0">' +
            '<span>' + esc(s.label) + ' <small style="color:#9fb0c6">' + esc(s.key) + ' ' + esc(range) + '</small></span>' +
            '<input id="pm-st-' + esc(s.key) + '" type="number" step="' + step + '" value="' + start + '" title="起点">' +
            '<input id="pm-sp-' + esc(s.key) + '" type="number" step="' + step + '" value="' + step + '" title="步长"></div>';
        }).join('');
    }
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    $('pm-tpl').onchange = renderParams;
    $('pm-close').onclick = close;
    $('pm-cancel').onclick = close;
    wrap.onclick = function (e) { if (e.target === wrap) close(); };
    $('pm-go').onclick = function () {
      var tid = $('pm-tpl').value;
      var d = M.describe(tid);
      var n = clampInt($('pm-rows').value, 4, 1, MAX_ROWS);
      var cols = clampInt($('pm-cols').value, 2, 1, MAX_COLS);
      var rowsOut = [];
      for (var i = 0; i < n; i++) {
        var p = {};
        d.params.forEach(function (s) {
          var st = $('pm-st-' + s.key), sp = $('pm-sp-' + s.key);
          var start = Number(st && st.value), step = Number(sp && sp.value);
          if (!isFinite(start)) start = isNum(s.def) ? s.def : 0;
          if (!isFinite(step)) step = isNum(s.step) ? s.step : 1;
          var v = (s.enum && s.enum.length) ? s.enum[i % s.enum.length] : start + step * i;
          if (isNum(s.min)) v = Math.max(s.min, v);
          if (isNum(s.max)) v = Math.min(s.max, v);
          p[s.key] = v;
        });
        rowsOut.push({ params: p });
      }
      var r = insert({ templateId: tid, rows: rowsOut, cols: cols });
      if (!r.ok) {
        msg('失败：' + r.error + (r.rowErrors ? '（第 ' + r.rowErrors.map(function (x) { return x.index + 1; }).join('、') + ' 行）' : ''), true);
        return;
      }
      msg('已插入 ' + r.count + ' 个实例（' + r.cols + ' 列 × ' + r.gridRows + ' 行，单步可撤销）');
      if (GW.selection && GW.selection.set) {
        var byId = Object.create(null);
        pool(GW.page()).forEach(function (it) { byId[it.id] = it; });
        GW.selection.set(r.ids.map(function (id) { return byId[id]; }).filter(Boolean));
      }
    };
    renderParams();
  }

  GW.physicsBatch = {
    version: '1.7.6-batch-1',
    insert: insert, remove: remove, openPanel: openPanel,
    MAX_ROWS: MAX_ROWS, MAX_COLS: MAX_COLS
  };
})();
