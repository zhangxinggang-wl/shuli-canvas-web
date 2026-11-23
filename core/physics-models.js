/*
 * physics-models.js —— 统一物理模型注册中心（PhysicsModelRegistry）与适配器契约
 *
 * 定位：只做「目录 + 能力声明 + 反查 + 纯构造」，不接管任何旧注册表、绘制、菜单或保存路径。
 *   · 原表（GW.physShapes / GW.mathShapes / GW.sims）继续负责各自的构造和绘制；
 *   · .gewu 记录类型不变：原生图形仍写 shape/pb、shape/ms，仿真仍写 obj/sim，网页仍写 obj/web；
 *   · 模板 ID 只是运行期的命名空间映射，不写进磁盘记录。
 *
 * 目录条目：注册中心会枚举现有注册表与网页目录，为「尚未适配」的条目也生成描述符，
 *          其 adapted=false、capabilities=[]，并明确标出该宿主的理论导出类别。
 *
 * 适配器契约（全部可选，按 descriptor.capabilities 声明）：
 *   prepare(input, box)         纯构造，返回 board item；不得改文档/历史/视口
 *   readParams(item)            读白名单参数
 *   applyParams(item, params)   写白名单参数（纯，不 commit）
 *   mount(item, host)           创建运行时，返回 instance
 *   destroy(instance)           必须可重复调用（幂等），清 RAF/RO/总线/window 监听
 *   exportStatic(item, opts)    { kind:'vector'|'raster'|'placeholder', ... }
 *
 * 回滚：删掉 src/index.html 里本文件的 <script> 行即完全关闭；
 *      或运行时 GW.physicsModels.disabled = true 只关新增注册调用。
 *      旧模板键 / URL / 宿主以及已生成的原生图形均沿旧路径读取，不受影响。
 */
(function () {
  'use strict';
  if (!window.GW) return;
  var GW = window.GW;

  var CAP = {
    PREPARE: 'prepare', READ_PARAMS: 'readParams', APPLY_PARAMS: 'applyParams',
    MOUNT: 'mount', DESTROY: 'destroy', EXPORT_STATIC: 'exportStatic',
    BATCH: 'batch', RESTORE_PARAMS: 'restoreParams', RESTORE_FRAME: 'restoreFrame',
    CONTROLS: 'controls', STATE_BRIDGE: 'stateBridge'
  };
  var EXPORT_KIND = { VECTOR: 'vector', RASTER: 'raster', PLACEHOLDER: 'placeholder' };
  var HOSTS = ['pb', 'ms', 'sim', 'web'];

  // 网页目录：运行时不能列目录，按 src/simhtml 实际文件固化（含 sims/ 子目录）。
  // 注意 simhtml/sims/phy-motion.html 与原生 sim:phy-motion 是两条不同入口，不得合并。
  var WEB_PAGES = [
    'simhtml/acfield.html', 'simhtml/bump-demo.html', 'simhtml/circuit-simplify.html',
    'simhtml/collision.html', 'simhtml/conical.html', 'simhtml/cycloid.html',
    'simhtml/efield.html', 'simhtml/forcecompose.html', 'simhtml/incline.html',
    'simhtml/inclinefly.html', 'simhtml/kepler.html', 'simhtml/multimeter.html',
    'simhtml/pendulum.html', 'simhtml/proj.html', 'simhtml/projdecomp.html',
    'simhtml/ringball.html', 'simhtml/satellites.html', 'simhtml/slopespring.html',
    'simhtml/slotball.html', 'simhtml/springcart.html', 'simhtml/springh.html',
    'simhtml/springv.html', 'simhtml/trackball.html',
    'simhtml/sims/phy-circuit.html', 'simhtml/sims/phy-collision.html', 'simhtml/sims/phy-resbox.html',
    'simhtml/sims/phy-efield.html', 'simhtml/sims/phy-incline.html',
    'simhtml/sims/phy-induction.html', 'simhtml/sims/phy-flux.html', 'simhtml/sims/phy-motion.html',
    'simhtml/sims/phy-optics.html', 'simhtml/sims/phy-orbit.html',
    'simhtml/sims/phy-oscillator.html', 'simhtml/sims/phy-particle.html',
    'simhtml/sims/phy-projectile.html', 'simhtml/sims/phy-refraction.html',
    'simhtml/sims/phy-wave.html'
  ];

  var PILOT = {
    PB: 'pb:b_mech_inclineForces',
    MS: 'ms:quadratic',
    SIM: 'sim:phy-motion',
    WEB: 'web:simhtml/circuit-simplify.html',
    WEB_SIM: 'web:simhtml/sims/phy-motion.html'
  };

  var templates = Object.create(null);   // 显式登记 / 覆盖的描述符
  var adapters = Object.create(null);    // templateId -> adapter
  var version = 0;
  var catCache = null, catSig = '';

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function idFor(host, key) { return host + ':' + key; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // 网页 URL 归一：去 query/hash、去 file:// 前缀，只保留 simhtml/ 起始的相对路径。
  function cleanKey(s) {
    var k = String(s == null ? '' : s).replace(/\\/g, '/');
    k = k.replace(/^file:\/+/i, '').replace(/[?#].*$/, '');
    k = k.replace(/^.*?\/simhtml\//i, 'simhtml/').replace(/^\/+/, '');
    return k;
  }
  function normalizeId(id) {
    var s = String(id || '');
    var i = s.indexOf(':');
    if (i < 0 || HOSTS.indexOf(s.slice(0, i)) < 0) return s;
    var h = s.slice(0, i), k = s.slice(i + 1);
    return idFor(h, h === 'web' ? cleanKey(k) : k);
  }

  function normalizeSpecs(arr) {
    var out = [];
    (arr || []).forEach(function (s) {
      if (!s || !s.key) return;
      var o = { key: String(s.key), label: s.label || s.key, type: s.type || 'number' };
      if (isNum(s.min)) o.min = +s.min;
      if (isNum(s.max)) o.max = +s.max;
      if (isNum(s.step)) o.step = +s.step;
      // 1.7.6：仿真参数里有字符串枚举（mode）与布尔（stop），def/enum 不能一律 Number 化
      if (s.def !== undefined) o.def = isNum(s.def) ? +s.def : s.def;
      if (s.unit) o.unit = s.unit;
      if (s.enum && s.enum.length) o.enum = s.enum.slice();
      if (s.hint && s.hint.length) {
        o.hint = s.hint.map(function (h) { return { label: h.label, value: +h.value }; });
        if (!o.enum) o.enum = o.hint.map(function (h) { return h.value; });
      }
      out.push(o);
    });
    return out;
  }

  function desc(host, key, o) {
    o = o || {};
    var caps = (o.capabilities || []).slice();
    return {
      id: idFor(host, key), host: host, key: key,
      label: o.label || key, category: o.category || '',
      source: o.source || 'registry',
      adapted: !!o.adapted,
      capabilities: caps,
      params: normalizeSpecs(o.params || []),
      aspect: isNum(o.aspect) ? o.aspect : 4 / 3,
      defaultSize: o.defaultSize || { w: 400, h: 300 },
      // 导出能力分类：vector=真矢量图元 / raster=位图 / placeholder=占位框。
      // 这是「该宿主的理论类别」，是否已接入由 capabilities 里的 exportStatic 决定。
      exportStatic: o.exportStatic || EXPORT_KIND.PLACEHOLDER,
      runtime: Object.assign({ mounted: false, destroy: false, restoreParams: false, restoreFrame: false },
        o.runtime || {}),
      controls: (o.controls || []).slice(),
      batch: caps.indexOf(CAP.BATCH) >= 0,
      notes: o.notes || ''
    };
  }
  function cloneDesc(d) {
    try { return JSON.parse(JSON.stringify(d)); } catch (e) { return Object.assign({}, d); }
  }

  // ---------- 目录：从现有注册表 / 网页目录读元数据（未适配条目也登记） ----------
  function registrySignature() {
    var pbN = 0, msN = 0, simN = 0;
    try { pbN = Object.keys((GW.physShapes && GW.physShapes.shapes) || {}).length; } catch (e) { /* noop */ }
    try { msN = ((GW.mathShapes && GW.mathShapes.list) ? GW.mathShapes.list() : []).length; } catch (e) { /* noop */ }
    try { simN = Object.keys(GW.sims || {}).length; } catch (e) { /* noop */ }
    return [pbN, msN, simN, version].join('/');
  }

  function specOf(host, key) {
    try {
      var P = host === 'pb' ? GW.physShapes : GW.mathShapes;
      if (P && P.paramList) return normalizeSpecs(P.paramList(key));
    } catch (e) { /* noop */ }
    return [];
  }

  function buildCatalog() {
    var out = Object.create(null);
    try {
      var PS = GW.physShapes;
      if (PS && PS.shapes) Object.keys(PS.shapes).forEach(function (key) {
        var d = PS.shapes[key] || {};
        var a = (isNum(d.dw) && isNum(d.dh) && d.dh > 0) ? d.dw / d.dh : 4 / 3;
        out[idFor('pb', key)] = desc('pb', key, {
          label: d.label || key, category: d.cat || '', source: 'registry',
          params: specOf('pb', key), aspect: a,
          defaultSize: { w: 400, h: Math.round(400 / a) },
          exportStatic: EXPORT_KIND.VECTOR
        });
      });
    } catch (e) { /* noop */ }
    try {
      var MS = GW.mathShapes;
      if (MS && MS.list) MS.list().forEach(function (d) {
        if (!d || !d.key) return;
        out[idFor('ms', d.key)] = desc('ms', d.key, {
          label: d.label || d.key, category: d.cat || '', source: 'registry',
          params: normalizeSpecs(d.params), exportStatic: EXPORT_KIND.VECTOR
        });
      });
    } catch (e) { /* noop */ }
    try {
      Object.keys(GW.sims || {}).forEach(function (sid) {
        var d = GW.sims[sid] || {};
        var w = isNum(d.width) ? d.width : 960, h = isNum(d.height) ? d.height : 600;
        out[idFor('sim', sid)] = desc('sim', sid, {
          label: d.name || sid, category: d.category || '', source: 'registry',
          aspect: w / h, defaultSize: { w: w, h: h }, exportStatic: EXPORT_KIND.RASTER
        });
      });
    } catch (e) { /* noop */ }
    WEB_PAGES.forEach(function (p) {
      out[idFor('web', p)] = desc('web', p, {
        label: p.replace(/^simhtml\//, '').replace(/\.html$/, ''),
        category: p.indexOf('/sims/') >= 0 ? 'sims' : 'simhtml',
        source: 'catalog', exportStatic: EXPORT_KIND.PLACEHOLDER,
        notes: 'obj/web 网页外壳当前 state 为空、save() 为空函数，不能算参数恢复。'
      });
    });
    return out;
  }

  function catalog() {
    var sig = registrySignature();
    if (catCache && catSig === sig) return catCache;
    catCache = buildCatalog();
    catSig = sig;
    return catCache;
  }
  function allDescriptors() {
    var all = Object.create(null), cat = catalog();
    Object.keys(cat).forEach(function (k) { all[k] = cat[k]; });
    Object.keys(templates).forEach(function (k) { all[k] = templates[k]; });
    return all;
  }

  // ---------- 对外：目录查询 ----------
  function list(filter) {
    var f = filter || {}, all = allDescriptors(), q = f.q ? String(f.q).toLowerCase() : '';
    var out = [];
    Object.keys(all).sort().forEach(function (k) {
      var d = all[k];
      if (f.host && d.host !== f.host) return;
      if (f.adapted != null && d.adapted !== !!f.adapted) return;
      if (f.capability && d.capabilities.indexOf(f.capability) < 0) return;
      if (f.pilot && Object.keys(PILOT).map(function (x) { return PILOT[x]; }).indexOf(d.id) < 0) return;
      if (q && (d.id + ' ' + d.label + ' ' + d.key).toLowerCase().indexOf(q) < 0) return;
      out.push(cloneDesc(d));
    });
    return out;
  }
  function get(id) {
    var k = normalizeId(id);
    if (!k) return null;
    var d = templates[k] || catalog()[k] || null;
    return d ? cloneDesc(d) : null;
  }
  function describe(id) {
    var d = get(id);
    if (!d) return null;
    return {
      id: d.id, label: d.label, host: d.host, adapted: d.adapted,
      capabilities: d.capabilities, params: d.params, exportStatic: d.exportStatic,
      runtime: d.runtime, controls: d.controls, batch: d.batch,
      defaultSize: d.defaultSize, aspect: d.aspect, notes: d.notes
    };
  }
  function adapter(id) { return adapters[normalizeId(id)] || null; }
  function has(id, cap) { var d = get(id); return !!(d && d.capabilities.indexOf(cap) >= 0); }

  function register(id, patch, adapterObj) {
    var k = normalizeId(id);
    if (!k) return null;
    var base = templates[k] || catalog()[k] ||
      desc(k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1), { source: 'manual' });
    var merged = Object.assign({}, base, patch || {}, { id: k, host: base.host, key: base.key });
    if (patch && patch.capabilities) merged.capabilities = patch.capabilities.slice();
    if (patch && patch.params) merged.params = normalizeSpecs(patch.params);
    merged.batch = merged.capabilities.indexOf(CAP.BATCH) >= 0;
    merged.adapted = !!adapterObj || merged.adapted;
    templates[k] = merged;
    if (adapterObj) adapters[k] = adapterObj;
    version++;
    catSig = '';
    return cloneDesc(merged);
  }
  function unregister(id) {
    var k = normalizeId(id);
    delete templates[k]; delete adapters[k];
    version++; catSig = '';
  }

  // ---------- 旧记录反查：key / data.sim / data.url / data.work ----------
  function templateIdOf(it) {
    if (!it || typeof it !== 'object') return '';
    var d = it.data || {};
    if (it.type === 'pb' && it.key) return idFor('pb', it.key);
    if (it.type === 'ms' && it.key) return idFor('ms', it.key);
    if ((it.kind === 'obj' || it.type === 'sim') && d.sim) return idFor('sim', d.sim);
    if ((it.kind === 'obj' || it.type === 'web') && (d.url || d.work || d.path || d.libRel)) {
      return idFor('web', cleanKey(d.url || d.work || d.path || d.libRel));
    }
    // 旧记录可能只有 key（没有 type）：先问已登记模板，再问原表
    if (it.key) {
      var k = String(it.key);
      if (templates[idFor('pb', k)] || catalog()[idFor('pb', k)]) return idFor('pb', k);
      if (templates[idFor('ms', k)] || catalog()[idFor('ms', k)]) return idFor('ms', k);
      try { if (GW.physShapes && GW.physShapes.shapes && GW.physShapes.shapes[k]) return idFor('pb', k); } catch (e) { /* noop */ }
      try { if (GW.mathShapes && GW.mathShapes.get && GW.mathShapes.get(k)) return idFor('ms', k); } catch (e) { /* noop */ }
    }
    if (d.sim) return idFor('sim', d.sim);
    if (d.url || d.work) return idFor('web', cleanKey(d.url || d.work));
    return '';
  }
  function resolve(it) {
    var id = templateIdOf(it);
    return id ? get(id) : null;
  }

  // ---------- 参数校验：白名单 + 类型 / 范围 / 枚举 / 有限值 ----------
  function validateParams(id, raw, opts) {
    var d = get(id);
    if (!d) return { ok: false, error: '未知模板：' + id };
    var o = opts || {}, src = raw == null ? {} : raw;
    if (typeof src !== 'object' || Array.isArray(src)) return { ok: false, error: '参数必须是对象' };
    var specs = d.params || [], allowed = Object.create(null), errs = [], out = {};
    specs.forEach(function (s) { allowed[s.key] = s; });
    Object.keys(src).forEach(function (k) {
      if (!allowed[k]) errs.push('参数字段不在白名单：' + k);
    });
    specs.forEach(function (s) {
      var v = own(src, s.key) ? src[s.key] : (o.partial ? undefined : s.def);
      if (v === undefined) { if (!o.partial && s.def !== undefined) out[s.key] = s.def; return; }
      var t = s.type || 'number';
      var enumOfString = s.enum && s.enum.length && typeof s.enum[0] === 'string';
      if (t === 'string' || enumOfString) {
        if (typeof v !== 'string') { errs.push(s.key + ' 必须是字符串'); return; }
      } else if (t === 'boolean') {
        if (typeof v !== 'boolean') { errs.push(s.key + ' 必须是布尔值'); return; }
      } else if (typeof v !== 'number' || !isFinite(v)) {
        errs.push(s.key + ' 必须是有限数值'); return;
      }
      if (s.enum && s.enum.length && s.enum.indexOf(v) < 0) {
        errs.push(s.key + ' 必须取自枚举 ' + JSON.stringify(s.enum)); return;
      }
      if (typeof v === 'number') {
        if (isNum(s.min) && v < s.min - 1e-9) { errs.push(s.key + ' 小于下限 ' + s.min); return; }
        if (isNum(s.max) && v > s.max + 1e-9) { errs.push(s.key + ' 超过上限 ' + s.max); return; }
      }
      out[s.key] = v;
    });
    if (errs.length) return { ok: false, error: errs.join('；') };
    return { ok: true, params: out, templateId: normalizeId(id) };
  }

  // ---------- 两个原生图形适配器：复用原表 make / paramList / drawItem ----------
  function nativeAdapter(host, key) {
    var tid = idFor(host, key);
    function P() { return host === 'pb' ? GW.physShapes : GW.mathShapes; }
    return {
      prepare: function (input, box) {
        var p = P();
        if (!p || !p.make) return null;
        var v = validateParams(tid, input && input.params, {});
        if (!v.ok) throw new Error(v.error);
        var b = box || { x0: 0, y0: 0, x1: 400, y1: 300 };
        var opt = Object.assign({}, (input && input.style) || {}, { params: v.params });
        // make 内部用 GW.uid() 生成实例 id，且把参数平铺到 item 顶层；不改文档/历史/视口。
        return p.make(key, b.x0, b.y0, b.x1, b.y1, opt);
      },
      readParams: function (it) {
        var out = {}, d = get(tid);
        (d ? d.params : []).forEach(function (s) { out[s.key] = it ? it[s.key] : undefined; });
        return out;
      },
      applyParams: function (it, params) {
        var v = validateParams(tid, params, { partial: true });
        if (!v.ok) throw new Error(v.error);
        Object.keys(v.params).forEach(function (k) { it[k] = v.params[k]; });
        if (GW.invalidate) GW.invalidate(it);
        return it;
      },
      exportStatic: function (it) {
        // export.js 的 Ctx 记录器对 shape/pb、shape/ms 直接走 GW.drawItem，
        // 与屏幕同源、是真矢量图元，不需要额外位图或占位。
        return { kind: EXPORT_KIND.VECTOR, source: 'drawItem', item: it };
      }
    };
  }

  function specsFor(host, key, fallback) {
    var s = specOf(host, key);
    return s.length ? s : normalizeSpecs(fallback);
  }

  // ---------- 四个试点的目录登记 ----------
  function registerPilots() {
    var pbCaps = [CAP.PREPARE, CAP.READ_PARAMS, CAP.APPLY_PARAMS, CAP.BATCH, CAP.EXPORT_STATIC];
    register(PILOT.PB, {
      label: '斜面受力分解', category: 'mech', source: 'registry',
      capabilities: pbCaps,
      params: specsFor('pb', 'b_mech_inclineForces', [
        { key: 'b_mech_inclineForces_deg', label: '倾角', min: 10, max: 60, step: 1, def: 30 },
        { key: 'b_mech_inclineForces_fric', label: '摩擦力', min: 0, max: 1, step: 1, def: 1,
          hint: [{ label: '无', value: 0 }, { label: '有', value: 1 }] }
      ]),
      aspect: 4 / 3, defaultSize: { w: 400, h: 300 },
      exportStatic: EXPORT_KIND.VECTOR,
      runtime: { restoreParams: true, restoreFrame: false },
      notes: 'Canvas 原生图形；参数平铺在 item 顶层，沿旧 shape/pb 路径保存。'
    }, nativeAdapter('pb', 'b_mech_inclineForces'));

    register(PILOT.MS, {
      label: '二次函数', category: 'func', source: 'registry',
      capabilities: pbCaps,
      params: specsFor('ms', 'quadratic', [
        { key: 'a', label: '二次项 a', min: -3, max: 3, step: 0.1, def: 1 },
        { key: 'b', label: '一次项 b', min: -6, max: 6, step: 0.1, def: 0 },
        { key: 'c', label: '常数 c', min: -8, max: 8, step: 0.1, def: 0 }
      ]),
      aspect: 4 / 3, defaultSize: { w: 400, h: 300 },
      exportStatic: EXPORT_KIND.VECTOR,
      runtime: { restoreParams: true, restoreFrame: false },
      notes: 'Canvas 原生函数图像；沿旧 shape/ms 路径保存。'
    }, nativeAdapter('ms', 'quadratic'));

    // 阶段三接入适配器；此处只登记目录与「尚未适配」的准确能力声明。
    register(PILOT.SIM, {
      label: '运动学仿真（原生宿主）', category: 'physics', source: 'registry',
      capabilities: [], aspect: 1000 / 620, defaultSize: { w: 1000, h: 620 },
      exportStatic: EXPORT_KIND.RASTER,
      runtime: { mounted: true, destroy: false, restoreParams: false, restoreFrame: false },
      notes: '与 web:simhtml/sims/phy-motion.html 是不同宿主，必须保留两条入口 ID。'
    });

    register(PILOT.WEB, {
      label: '电路化简（SVG 网页）', category: 'simhtml', source: 'catalog',
      capabilities: [], aspect: 800 / 500, defaultSize: { w: 800, h: 500 },
      exportStatic: EXPORT_KIND.PLACEHOLDER,
      runtime: { mounted: true, destroy: false, restoreParams: false, restoreFrame: false },
      notes: '阶段四接入状态桥与真实 SVG 导出；现状静态导出为占位框。'
    });

    register(PILOT.WEB_SIM, {
      label: '运动学仿真（网页外壳宿主）', category: 'sims', source: 'catalog',
      capabilities: [], aspect: 1000 / 620, defaultSize: { w: 1000, h: 620 },
      exportStatic: EXPORT_KIND.PLACEHOLDER,
      runtime: { mounted: true, destroy: false, restoreParams: false, restoreFrame: false },
      notes: 'sim-shell.js 里 state:{} 与 save(){} 都是空实现，参数不落盘，明确不算参数恢复。'
    });

    // 指针式万用表使用与读数（电磁学实验）：原生 pb 适配器，批量 / AI 共用
    // physicsBatch.insert 的预检。挡位是 hint 枚举（含 Ω 倍率）、指针有 min/max，
    // 非法挡位 / 倍率 / 指针值在插入前整批拒绝，不会落到画布上。
    register('pb:em_multimeter_use', {
      label: '指针式万用表使用与读数', category: 'emlab', source: 'registry',
      capabilities: pbCaps,
      params: specsFor('pb', 'em_multimeter_use', [
        { key: 'emMuRange', label: '测量挡位', min: 0, max: 13, step: 1, def: 2,
          hint: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((v) => ({ label: String(v), value: v })) },
        { key: 'emMuT', label: '指针位置', min: 0, max: 1, step: 0.001, def: 0.6 },
        { key: 'emMuProbe', label: '表笔', min: 0, max: 2, step: 1, def: 0,
          hint: [{ label: '测量', value: 0 }, { label: '悬空', value: 1 }, { label: '短接', value: 2 }] },
        { key: 'emMuZero', label: '欧姆调零', min: 0, max: 1, step: 0.01, def: 1 },
        { key: 'emMuShow', label: '显示答案', type: 'toggle', def: 0,
          hint: [{ label: '关', value: 0 }, { label: '开', value: 1 }] }
      ]),
      aspect: 760 / 1200, defaultSize: { w: 380, h: 600 },
      exportStatic: EXPORT_KIND.VECTOR,
      runtime: { restoreParams: true, restoreFrame: false },
      notes: '单份 RANGES/OHM 数据派生挡位、旋钮方向、操作提示与答案；shape/pb 走 drawItem 真矢量导出。'
    }, nativeAdapter('pb', 'em_multimeter_use'));

    // 指针式万用表（测量接线与读数）：表 1:1 + 被测电路 + 读数窗，横版 1300×1280。
    // 与上一张卡共用同一份 RANGES/readOf；场景是 6 项枚举，读数开关是 toggle。
    register('pb:em_multimeter_hookup', {
      label: '指针式万用表（测量接线与读数）', category: 'emlab', source: 'registry',
      capabilities: pbCaps,
      params: specsFor('pb', 'em_multimeter_hookup', [
        { key: 'emMuRange', label: '测量挡位', min: 0, max: 13, step: 1, def: 2,
          hint: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((v) => ({ label: String(v), value: v })) },
        { key: 'emMuScene', label: '被测电路', min: 0, max: 5, step: 1, def: 0,
          hint: [{ label: '自动', value: 0 }, { label: '电压·灯泡', value: 1 }, { label: '电流·灯泡', value: 2 },
            { label: '定值电阻', value: 3 }, { label: '二极管+', value: 4 }, { label: '二极管−', value: 5 }] },
        { key: 'emMuT', label: '指针位置', min: 0, max: 1, step: 0.001, def: 0.6 },
        { key: 'emMuProbe', label: '表笔', min: 0, max: 2, step: 1, def: 0,
          hint: [{ label: '测量', value: 0 }, { label: '悬空', value: 1 }, { label: '短接', value: 2 }] },
        { key: 'emMuZero', label: '欧姆调零', min: 0, max: 1, step: 0.01, def: 1 },
        { key: 'emMuShow', label: '显示读数', type: 'toggle', def: 0,
          hint: [{ label: '关', value: 0 }, { label: '开', value: 1 }] }
      ]),
      aspect: 1300 / 1280, defaultSize: { w: 650, h: 640 },
      exportStatic: EXPORT_KIND.VECTOR,
      runtime: { restoreParams: true, restoreFrame: false },
      notes: '表盘与 em_multimeter_use 共用 drawFace()；读数窗按 RANGES.est 定估读位，默认关闭。'
    }, nativeAdapter('pb', 'em_multimeter_hookup'));
  }

  var API = {
    version: '1.7.6-models-1',
    disabled: false,
    CAP: CAP, EXPORT_KIND: EXPORT_KIND, HOSTS: HOSTS, PILOT: PILOT,
    WEB_PAGES: WEB_PAGES.slice(),
    list: list, get: get, describe: describe, adapter: adapter, has: has,
    register: register, unregister: unregister,
    resolve: resolve, templateIdOf: templateIdOf, normalizeId: normalizeId,
    validateParams: validateParams,
    stats: function () {
      var all = allDescriptors(), s = { total: 0, adapted: 0, byHost: {} };
      HOSTS.forEach(function (h) { s.byHost[h] = 0; });
      Object.keys(all).forEach(function (k) {
        s.total++;
        if (all[k].adapted) s.adapted++;
        if (s.byHost[all[k].host] != null) s.byHost[all[k].host]++;
      });
      return s;
    }
  };
  GW.physicsModels = API;
  registerPilots();
})();
