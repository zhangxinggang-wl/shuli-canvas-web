/* 自定义图形 · 运行时：校验、注册、存储、面板入口（GW.shapeSelf）
   - 代码存 <userData>/shapes-self.json（主进程 IPC）；浏览器里退回 localStorage
   - 校验只在 Worker 里试画（2s 超时），Worker 起不来/出错/超时一律拒绝导入，不回退主线程执行用户代码（审计 F04 ①③）
   - 注册进 GW.physShapes（对象 type 仍是 'pb'，按 P 的绘制管线走，风格/参数/旋转/动画全部复用）
   - 物理按子类（cat=group）进面板；数学/化学/生物/地理由 app.js 注入到各自页
*/
(function () {
  'use strict';
  const GW = window.GW;
  const L = GW.shapeSelfLint;
  const h = GW.h;
  const LS_KEY = 'gewu.shapesSelf';
  const SUBJECTS = [
    ['phys', '物理'], ['math', '数学'], ['chem', '化学'], ['bio', '生物'], ['geo', '地理'],
  ];
  const PHYS_GROUPS = ['mech', 'wave', 'orbit', 'optics', 'em', 'emlab', 'sketch'];

  // 「需求 C」每行的示例值（灰色占位）；用户留空时就用它
  const DEMAND_SEED = {
    static: {
      subject: '物理', group: '力学', name: '斜面受力分解',
      use: '讲斜面受力时，能调倾角看三个力怎么变',
      params: '倾角 10–60°（默认 30）；摩擦力 无/有（默认 有）',
      layout: '斜面在左下起坡、右侧竖直封口；物块贴在斜面上；三个力箭头共点于物块中心',
      labels: 'mg / N / f，13px；角度读数带 °',
    },
    dynamic: {
      subject: '物理', group: '电磁', name: '平行束磁聚焦',
      use: '讲平行粒子束射入圆形磁场后汇聚到一点',
      params: '汇聚时间 1–5 s（默认 2.4）；粒子数 1–5（默认 3）',
      layout: '圆形虚线场区；粒子从左侧入射，轨迹为圆弧，汇聚到场区最低点 O',
      labels: 'B / O，13px；不写公式',
    },
  };

  // 二次编辑专用契约：不带任何示例代码，避免模型把示例当答案抄回来
  const REFINE_SYS = [
    '你是「数理无限画布」的图形代码修改助手。',
    '输入：一份现有的 shape({...}) 代码 + 用户的一句话修改要求。',
    '输出：修改后的完整代码，只输出代码块，不要解释。',
    '硬规则：',
    '1. 只能用这些绘图助手：U.line / U.arrow / U.circle / U.arc / U.poly / U.text，以及 U.bbox(o) / U.alpha / U.lerp / U.clamp；不要直接用 ctx 画。',
    '2. 所有坐标由 const b = U.bbox(o) 推出（b.x1 / b.y1 / b.x2 / b.y2 / b.cx / b.cy / b.w / b.h），不要写死像素。',
    '3. 参数用 param(名字, {label,min,max,step,def,unit}) 声明，并在 shape 的 params 数组里列出；draw 里用 o.名字 读取。',
    '4. 动画图形用 o.animT（单位秒）取模算 prog，不要用 Date.now / Math.random / setInterval。',
    '5. 现有代码是唯一基准：只改用户要求改的地方，其它行逐字保留，不要重排版、不要改 key / label。',
  ].join('\n');
  const ICON_DEF = '<path d="M4 20h16"/><circle cx="12" cy="10" r="4"/>';

  // 从模型回复里剥出代码块（有的模型爱带 ```js 围栏和解释）
  function stripFence(t) {
    let x = String(t || '').trim();
    const m = x.match(/```(?:js|javascript)?\s*([\s\S]*?)```/);
    if (m) x = m[1];
    return x.trim();
  }
  function errText(r) {
    const out = [];
    (r.errors || []).forEach(function (e) { out.push(e.code + '：' + e.msg); });
    (r.defs || []).forEach(function (d) { (d.errors || []).forEach(function (e) { out.push(e.code + '：' + e.msg); }); });
    return out.join('；') || '未知错误';
  }
  // 任意图片 -> 压到 max 边长的 PNG 字节（ask() 只收 PNG bytes）
  function imgToPng(im, max) {
    max = max || 1024;
    const sc = Math.min(1, max / Math.max(im.width || 1, im.height || 1));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round((im.width || 1) * sc));
    cv.height = Math.max(1, Math.round((im.height || 1) * sc));
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    return new Promise(function (res) {
      cv.toBlob(function (b) {
        if (!b) { res(null); return; }
        b.arrayBuffer().then(function (a) { res(new Uint8Array(a)); }).catch(function () { res(null); });
      }, 'image/png');
    });
  }

  /* ---------- 存储 ---------- */
  function blank() { return { version: 1, shapes: [] }; }
  function readDB() {
    let raw = '';
    try { if (window.gewu && window.gewu.shapeSelfRead) raw = window.gewu.shapeSelfRead() || ''; } catch (e) { raw = ''; }
    if (!raw) { try { raw = localStorage.getItem(LS_KEY) || ''; } catch (e) { raw = ''; } }
    if (!raw) return blank();
    try {
      const db = JSON.parse(raw);
      if (!db || !Array.isArray(db.shapes)) return blank();
      return { version: 1, shapes: db.shapes.filter((x) => x && x.key && x.code) };
    } catch (e) { return blank(); }
  }
  function writeDB(db) {
    db.shapes = (db.shapes || []).slice(0, L.MAX_SHAPES);
    const s = JSON.stringify(db);
    let ok = false;
    try {
      if (window.gewu && window.gewu.shapeSelfWrite) { window.gewu.shapeSelfWrite(s); ok = true; }
    } catch (e) { ok = false; }
    try { localStorage.setItem(LS_KEY, s); ok = true; } catch (e) { /* 配额满 */ }
    return ok;
  }

  /* ---------- 运行期 U 助手（与校验环境同签名） ---------- */
  function makeU(GH, it, ctx) {
    const size = Math.max(1, it.width || 3);
    const bb = () => {
      const x1 = Math.min(it.x1, it.x2), y1 = Math.min(it.y1, it.y2);
      const x2 = Math.max(it.x1, it.x2), y2 = Math.max(it.y1, it.y2);
      return { x1: x1, y1: y1, x2: x2, y2: y2, w: x2 - x1, h: y2 - y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
    };
    return {
      size: size,
      bbox: bb,
      line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); },
      arrow(x1, y1, x2, y2, opt) {
        const head = Math.max(10, (opt && opt.head) || size * 4);
        const ang = Math.atan2(y2 - y1, x2 - x1), sp = 0.42;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(ang - sp), y2 - head * Math.sin(ang - sp));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(ang + sp), y2 - head * Math.sin(ang + sp));
        ctx.stroke();
      },
      circle(cx, cy, r, opt) {
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2);
        if (opt && opt.fill != null) { ctx.fillStyle = GH.alpha(it.color, opt.fill); ctx.fill(); }
        ctx.stroke();
      },
      arc(cx, cy, r, a0, a1) { ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, r), a0, a1); ctx.stroke(); },
      poly(pts, close) {
        if (!pts || !pts.length) return;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        if (close) ctx.closePath();
        ctx.stroke();
      },
      text(s, x, y, opt) {
        const o2 = opt || {};
        ctx.save();
        ctx.font = (o2.bold ? '600 ' : '') + (o2.size || 13) + 'px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = o2.color || '#1b2433';
        ctx.textAlign = o2.align || 'center';
        ctx.textBaseline = o2.baseline || 'middle';
        ctx.fillText(String(s), x, y);
        ctx.restore();
      },
      alpha: (col, a) => GH.alpha(col, a),
      lerp: (a, b, t) => a + (b - a) * t,
      clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    };
  }

  function shortProxy(it, map) {
    return new Proxy(it, {
      get(t, k) { return t[typeof k === 'string' && map[k] ? map[k] : k]; },
      set(t, k, v) { t[typeof k === 'string' && map[k] ? map[k] : k] = v; return true; },
      has(t, k) { return (typeof k === 'string' && map[k] ? map[k] : k) in t; },
    });
  }

  /* ---------- 注册 ---------- */
  const regged = Object.create(null);
  // 审计 F04 ②：主线程编译前再跑一次 lint。入口（validate）已经在 Worker 里查过，但库里
  // 存着的旧代码、以及以后新加的调用点都可能绕过入口 —— 这里是主线程的最后一关，命中就
  // 不编译。注意：lint 只是纵深防御，不是沙箱；真正的边界是「跑不到主线程」，见 validate()。
  function compileMain(code) {
    const hit = (L.escapes && L.escapes(code)) || [];
    if (hit.length) {
      return { defs: [], params: Object.create(null), errors: hit.map(function (n) {
        return { code: 'E_ESCAPE', msg: '不能用 ' + n + '（会够到页面/宿主环境，S7 / 契约 A）' };
      }) };
    }
    return L.compile(code);
  }
  function findDef(code, key) {
    const c = compileMain(code);
    return (c.defs || []).find((d) => d && d.key === key) || null;
  }

  function regOne(entry) {
    const d = findDef(entry.code, entry.key);
    if (!d || typeof d.draw !== 'function') return { ok: false, msg: '代码里找不到 key 为 ' + entry.key + ' 的 shape' };
    const P = GW.physShapes;
    const full = Object.keys(regged);
    const prefix = 'cs_' + entry.key + '_';
    const map = Object.create(null);
    const params = (d.params || []).map((p) => {
      const k = prefix + p;
      map[p] = k;
      const pd = (compileMain(entry.code).params || {})[p] || {};
      // 1.6.0 G5：Lint 是入口之一，历史库里已经存下的坏定义还得在这里兜一层 ——
      // 有限性、min<max、step>0、default 落在区间内，全部规整后再交给参数控件。
      const finite = (v, d) => {
        if (v == null || v === '') return d;
        const n = Number(v);
        return isFinite(n) ? n : d;
      };
      let lo = finite(pd.min, 0), hi = finite(pd.max, 1);
      if (!(lo < hi)) { const t = lo; lo = Math.min(lo, hi); hi = Math.max(t, hi); if (!(lo < hi)) hi = lo + 1; }
      const stStep = finite(pd.step, 0.01);
      P.paramDefs[k] = {
        label: pd.label || p, min: lo, max: hi,
        step: stStep > 0 ? stStep : 0.01,
        def: Math.max(lo, Math.min(hi, finite(pd.def, lo))), unit: pd.unit || '',
      };
      return k;
    });
    const key = 'cs_' + entry.key;
    const isPhys = entry.subject === 'phys';
    const def = {
      key: key,
      cat: isPhys && PHYS_GROUPS.indexOf(entry.group) >= 0 ? entry.group : 'mech',
      label: d.label || entry.label || entry.key,
      geom: 'box',
      icon: d.icon || entry.icon || ICON_DEF,
      fill: !!d.fill,
      animatable: !!d.animatable,
      params: params,
      custom: true,
      hidden: !isPhys,
      draw(c, it, GH) {
        const o = shortProxy(it, map);
        const U = makeU(GH, it, c);
        try { d.draw(c, o, U); }
        catch (e) {
          it.__csErr = (it.__csErr || 0) + 1;
          def.__err = String((e && e.message) || e);
          if (it.__csErr === 1) GW.toast && GW.toast('自定义图形「' + def.label + '」画不出来：' + def.__err);
          if (it.__csErr >= 3 && !def.hidden) def.hidden = true;
        }
      },
    };
    if (P.shapes[key]) delete P.shapes[key];
    P.shapes[key] = def;
    regged[key] = entry;
    return { ok: true, def: def };
  }

  function unreg(key) {
    if (GW.physShapes && GW.physShapes.shapes[key]) delete GW.physShapes.shapes[key];
    delete regged[key];
  }

  function loadAll() {
    const db = readDB();
    db.shapes.forEach((e) => {
      try { regOne(e); } catch (err) { /* 单条坏掉不影响其它 */ }
    });
    return db;
  }

  /* ---------- 校验 ---------- */
  // 审计 F04 ①：旧实现在「Worker 建不出来」和「Worker 800ms 内 onerror」两处回退到主线程，
  // 用 L.envFactory().check() 在主线程 new Function 编译并试画用户代码 —— 不可信代码由此落到
  // 页面里（能碰到 window.gewu），死循环也会卡死 UI。现在 Worker 是唯一执行点：起不来就报错，
  // 绝不回退。注意：Worker 是「不在主线程跑」的隔离手段，不是沙箱 —— 同源 Worker 仍能发消息，
  // 本次目标只是「用户代码不再落到主线程」。
  function validate(code) {
    return new Promise((resolve) => {
      let done = false, w = null, url = null, timer = null;
      function finish(r) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (w) { try { w.terminate(); } catch (e) { /* noop */ } }
        if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* noop */ } }
        resolve(r);
      }

      try {
        url = URL.createObjectURL(new Blob([L.workerSrc()], { type: 'text/javascript' }));
        w = new Worker(url);
      } catch (e) { w = null; }
      // 审计 F04 ①：Worker 起不来（旧版 Electron / blob worker 被策略拦）就直接拒绝导入，
      // 而不是退回主线程。宁可这台机器用不了自定义图形，也不在主线程执行用户代码。
      if (!w) {
        finish({ ok: false, defs: [], errors: [{ code: 'E_NOWORKER', msg: '这台机器起不了校验线程（Worker 不可用），为安全起见不在主线程执行图形代码，无法导入' }] });
        return;
      }
      timer = setTimeout(function () {
        finish({ ok: false, errors: [{ code: 'E_TIMEOUT', msg: '代码跑了 2 秒还没结束，已中止（多半是死循环）' }], defs: [] });
      }, 2000);   // 审计 F04 ③：2s 硬超时 + finish 里 terminate()，死循环只烧一个 Worker
      w.onmessage = function (ev) { finish(ev.data); };
      // 审计 F04 ①：旧实现在 800ms 内 onerror 时回退主线程重跑，等于把用户代码请回页面。
      // 现在无论何时出错都只报错，主线程一行用户代码都不执行。
      w.onerror = function () {
        finish({ ok: false, errors: [{ code: 'E_WORKER', msg: '校验线程出错，为安全起见不在主线程重试 —— 再点一次导入试试' }], defs: [] });
      };
      w.postMessage({ code: code });
    });
  }

  /* ---------- 导入 ---------- */
  // 1.6.0 G4：整批导入是一个事务。旧实现边遍历边 unreg/splice，满库时到最后的 E_MAX
  // 才拒绝，但被替换的旧项早已从内存注册表注销 —— 结果是「导入报错，原来那张图却画不出来了」，
  // 磁盘上还留着旧条目，重启后它又回来。现在先在副本上算完整批（重复 key / 替换 / 容量），
  // 再一次性写盘并注册；注册阶段出问题就把磁盘和注册表一起退回导入前。
  function importCode(opt) {
    const o = opt || {};
    return validate(o.code).then((r) => {
      if (!r.ok) return r;
      const old = readDB();
      const next = old.shapes.slice();
      const entries = [], replaced = [], seen = Object.create(null);
      for (const d of r.defs) {
        if (seen[d.key]) {
          return { ok: false, errors: [{ code: 'E_DUP', msg: '这一批代码里 key 重复：' + d.key }], defs: [] };
        }
        seen[d.key] = 1;
        const at = next.findIndex((x) => x.key === d.key);
        if (at >= 0) {
          if (!o.replace) {
            return { ok: false, errors: [{ code: 'E_DUP', msg: '已经有 key 为 ' + d.key + ' 的自定义图形了，先删掉旧的或换个 key' }], defs: [] };
          }
          next.splice(at, 1);
          replaced.push(d.key);
        }
        entries.push({
          key: d.key, label: d.label || d.key, subject: o.subject || 'phys',
          group: o.group || 'mech', icon: (findDef(o.code, d.key) || {}).icon || '', code: o.code, ts: Date.now(),
        });
      }
      if (next.length + entries.length > L.MAX_SHAPES) {
        return { ok: false, errors: [{ code: 'E_MAX', msg: '自定义图形最多 ' + L.MAX_SHAPES + ' 个，先删掉一些' }], defs: [] };
      }
      const nwDB = { version: old.version || 1, shapes: next.concat(entries) };
      if (!writeDB(nwDB)) {
        return { ok: false, errors: [{ code: 'E_IO', msg: '保存失败（存储空间不足或被拦），旧库没有改动' }], defs: [] };
      }
      const oldEntries = Object.create(null);
      replaced.forEach((k) => { oldEntries[k] = old.shapes.find((x) => x.key === k) || null; });
      try {
        replaced.forEach((k) => unreg('cs_' + k));
        entries.forEach((e) => {
          const rr = regOne(e);
          if (!rr || !rr.ok) throw new Error((rr && rr.msg) || ('注册失败：' + e.key));
        });
      } catch (err) {
        replaced.forEach((k) => unreg('cs_' + k));
        entries.forEach((e) => unreg('cs_' + e.key));
        Object.keys(oldEntries).forEach((k) => {
          if (!oldEntries[k]) return;
          try { regOne(oldEntries[k]); } catch (e2) { /* 旧定义本身坏了也别再抛 */ }
        });
        writeDB(old);
        return { ok: false, errors: [{ code: 'E_REG', msg: '注册失败，已回滚：' + String((err && err.message) || err) }], defs: [] };
      }
      return { ok: true, entries: entries, defs: r.defs };
    });
  }

  function remove(key) {
    const k = key.indexOf('cs_') === 0 ? key : 'cs_' + key;
    const db = readDB();
    const before = db.shapes.length;
    db.shapes = db.shapes.filter((x) => 'cs_' + x.key !== k);
    writeDB(db);
    unreg(k);
    return before !== db.shapes.length;
  }

  function list(subject) {
    const out = [];
    const P = GW.physShapes;
    for (const k in regged) {
      const e = regged[k];
      if (subject && e.subject !== subject) continue;
      const d = P && P.shapes[k];
      if (!d) continue;
      out.push({ key: k, label: d.label, icon: d.icon, subject: e.subject, group: e.group });
    }
    return out;
  }

  function codeOf(key) {
    const k = key.indexOf('cs_') === 0 ? key.slice(3) : key;
    const db = readDB();
    const e = db.shapes.find((x) => x.key === k);
    return e ? e.code : '';
  }

  /* ---------- 提示词（1.3.12：静态调参图 / 动态调参图 两套模板，各存一份） ---------- */
  function getPrompt(mode) {
    const key = L.promptKeyFor(mode);
    try { const s = localStorage.getItem(key); if (s && s.trim()) return s; } catch (e) { /* noop */ }
    return L.promptDefault(mode);
  }
  function setPrompt(s, mode) {
    try { localStorage.setItem(L.promptKeyFor(mode), String(s || '')); } catch (e) { /* noop */ }
  }
  function resetPrompt(mode) {
    try { localStorage.removeItem(L.promptKeyFor(mode)); } catch (e) { /* noop */ }
    return L.promptDefault(mode);
  }

  /* ---------- 界面 ---------- */
  const EX_SIMPLE = `// 示例：五角星（22 行）—— 最小图形定义
shape({
  key: 'myStar',
  label: '我的五角星',
  icon: '<path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8z"/>',
  draw(c, o, U) {
    const b = U.bbox(o);
    const R = Math.min(b.w, b.h) * 0.42;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? R * 0.42 : R;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push([b.cx + Math.cos(a) * r, b.cy + Math.sin(a) * r]);
    }
    U.poly(pts, true);
  },
});`;

  const EX_ANIM = `// 示例：单摆（动画）—— animatable + o.animT（秒制，自己取周期）
param('T', { label: '周期', min: 0.6, max: 3, step: 0.1, def: 1.6, unit: 's' });
param('sw', { label: '摆角', min: 10, max: 45, step: 1, def: 30, unit: '°' });

shape({
  key: 'myPend',
  label: '单摆',
  animatable: true,
  icon: '<path d="M12 3v9"/><circle cx="12" cy="16" r="4"/>',
  params: ['T', 'sw'],
  draw(c, o, U) {
    const b = U.bbox(o);
    const pvx = b.cx, pvy = b.y1 + b.h * 0.08;   // 悬点
    const L = b.h * 0.72;                        // 摆长（跟着框缩放，不写死像素）
    const amp = Math.max(6, o.sw || 30);
    const th = amp * Math.PI / 180 * Math.sin((o.animT || 0) * Math.PI * 2 / Math.max(0.2, o.T || 1.6));
    const bx = pvx + Math.sin(th) * L, by = pvy + Math.cos(th) * L;
    const arc = [];
    for (let k = 0; k <= 24; k++) {
      const a = (-amp + 2 * amp * k / 24) * Math.PI / 180;
      arc.push([pvx + Math.sin(a) * L, pvy + Math.cos(a) * L]);
    }
    c.save();
    c.lineWidth = Math.max(1, o.width * 0.6);
    c.setLineDash([4, 4]);
    U.poly(arc, false);                          // 摆动范围（辅助线）
    c.restore();
    U.line(pvx - 18, pvy, pvx + 18, pvy);        // 悬点横梁
    U.line(pvx, pvy, bx, by);                    // 摆线
    U.circle(bx, by, Math.max(6, o.width * 2.6), { fill: 0.16 });
  },
});`;

  const EX_MAG = `// 示例：磁聚焦（动画）—— 平行粒子射入圆形磁场后汇聚到同一点
param('T', { label: '汇聚时间', min: 1, max: 5, step: 0.1, def: 2.4, unit: 's' });
param('n', { label: '粒子数', min: 1, max: 5, step: 1, def: 3, unit: '束' });

shape({
  key: 'myMagFocus',
  label: '磁聚焦（粒子汇聚）',
  animatable: true,
  icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>',
  params: ['T', 'n'],
  draw(c, o, U) {
    const b = U.bbox(o);
    const R = Math.min(b.w, b.h) * 0.34;
    const fx = b.cx, fy = b.cy - b.h * 0.04;   // 圆形磁场区域
    const oy = fy + R;                          // 所有粒子汇聚到区域最低点 O
    c.save();
    c.lineWidth = Math.max(1, o.width * 0.6);
    c.setLineDash([5, 4]);
    U.circle(fx, fy, R, {});                    // 场区边界（辅助线）
    c.restore();
    U.text('B', fx + R * 0.45, fy - R * 0.5, { size: 12 });
    const n = Math.max(1, Math.round(o.n || 3));
    const T = Math.max(0.5, o.T || 2.4);
    const prog = Math.min(1, ((o.animT || 0) % T) / T);   // 0→1 走半个圆周到 O
    for (let i = 0; i < n; i++) {
      const v = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      const dy = v * R * 0.55;
      const ex = fx - Math.sqrt(Math.max(0, R * R - dy * dy));   // 入点（圆上）
      const ey = fy + dy;
      const Cx = ex, Cy = ey + R;          // 轨道圆心：入点正下方 R 处（半径 = 场区半径）
      const a = -Math.PI / 2 + prog * Math.PI;
      U.arrow(ex - 30, ey, ex - 2, ey, { head: Math.max(8, o.width * 3) });
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const aa = -Math.PI / 2 + (a + Math.PI / 2) * (k / 24);
        pts.push([Cx + R * Math.cos(aa), Cy + R * Math.sin(aa)]);
      }
      U.poly(pts, false);
      U.circle(Cx + R * Math.cos(a), Cy + R * Math.sin(a), Math.max(2.2, o.width), {});
    }
    U.circle(fx, oy, Math.max(2.4, o.width), { fill: 0.6 });
    U.text('O', fx + 12, oy + 18, { size: 12 });
  },
});`;

  function el(tag, attrs, ...kids) { return h(tag, attrs || {}, ...kids.flat(3)); }

  function openDialog() {
    let subject = 'phys', group = 'mech';
    const ta = el('textarea', {
      class: 'hw-input',
      style: {
        width: '100%', height: '230px', boxSizing: 'border-box', fontFamily: 'Consolas, monospace',
        fontSize: '12px', lineHeight: '1.5', whiteSpace: 'pre', overflow: 'auto', resize: 'vertical',
      },
      spellcheck: false,
      placeholder: '// 点上面的示例 → 复制 / 插入，或直接粘贴 AI 给的 shape({...}) 代码',
    });
    const status = el('div', { class: 'if-hint', style: { minHeight: '18px', color: '#666' } }, '支持直接粘贴 / 修改，保存前先在后台试画校验。');
    const subSel = el('select', { class: 'hw-input', style: { width: '96px' } },
      SUBJECTS.map(([k, label]) => el('option', { value: k }, label)));
    const grpSel = el('select', { class: 'hw-input', style: { width: '120px' } },
      PHYS_GROUPS.map((k) => el('option', { value: k }, (GW.physShapes.catLabel && GW.physShapes.catLabel[k]) || k)));
    function syncGroups() {
      const opts = subject === 'phys'
        ? PHYS_GROUPS.map((k) => [k, (GW.physShapes.catLabel && GW.physShapes.catLabel[k]) || k])
        : subject === 'math' ? [['geo', '平面几何'], ['func', '函数图像']] : [];
      if (opts.length) {
        grpSel.replaceChildren(...opts.map(([k, l]) => el('option', { value: k }, l)));
        if (!opts.some(([k]) => k === group)) group = opts[0][0];
        grpSel.value = group;
      }
      grpSel.disabled = !opts.length;
      grpSel.style.opacity = opts.length ? '1' : '0.45';
    }
    subSel.onchange = () => {
      subject = subSel.value;
      syncGroups();
    };
    grpSel.onchange = () => { group = grpSel.value; };

    // 1.3.12：两套模板。静态调参图 / 动态调参图，生成时用各自那份提示词
    let mode = 'static';
    let replaceMode = false;
    const modeBtns = ['static', 'dynamic'].map((m) => el('button', {
      class: 'gw-btn', style: { flex: '0 0 auto', padding: '3px 10px' },
      onclick: () => { mode = m; syncMode(); },
    }, m === 'dynamic' ? '动态调参图（动画）' : '静态调参图'));
    const modeRow = el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' } },
      el('span', { class: 'if-hint' }, '类型：'), ...modeBtns,
      el('span', { class: 'if-hint', id: 'cs-mode-hint' }, ''));

    const listBox = el('div', { style: { marginTop: '8px', maxHeight: '120px', overflow: 'auto' } });
    function refreshList() {
      const items = list();
      listBox.replaceChildren();
      if (!items.length) { listBox.append(el('div', { class: 'if-hint' }, '还没有自定义图形。')); return; }
      items.forEach((it) => {
        listBox.append(el('div', {
          style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', borderBottom: '1px solid #eee' },
        },
        el('span', { style: { flex: '1', fontSize: '13px' } }, it.label + '（' + (it.subject === 'phys' ? (GW.physShapes.catLabel[it.group] || it.group) : (SUBJECTS.find((s) => s[0] === it.subject) || ['', ''])[1]) + '）'),
        el('button', {
          class: 'gw-btn', style: { flex: '0 0 auto', padding: '2px 8px' },
          onclick: () => {
            const c = codeOf(it.key);
            if (!c) { status.textContent = '没找到这个图形的源码。'; return; }
            ta.value = c;
            replaceMode = true;
            if (it.subject) { subject = it.subject; subSel.value = it.subject; subSel.onchange(); }
            if (it.subject === 'phys' && it.group) { group = it.group; grpSel.value = it.group; }
            status.style.color = '#666';
            status.textContent = '已把「' + it.label + '」的代码载入编辑区：改完点「保存并执行」会覆盖它（key 不变）。';
          },
        }, '编辑'),
        el('button', {
          class: 'gw-btn', style: { flex: '0 0 auto', padding: '2px 8px' },
          onclick: () => { remove(it.key); refreshList(); status.textContent = '已删除「' + it.label + '」。'; },
        }, '删除')));
      });
    }

    async function saveRun() {
      const code = ta.value.trim();
      if (!code) { status.textContent = '先把代码粘贴进来。'; return; }
      status.textContent = '正在试画校验（最多 2.5 秒）…';
      const r = await importCode({ code: code, subject: subject, group: group, replace: replaceMode });
      if (!r.ok) {
        const e = (r.errors && r.errors[0]) || { msg: '未知错误' };
        const d = r.defs && r.defs.find((x) => x.errors && x.errors.length);
        const d1 = d && d.errors[0];
        status.textContent = '✗ ' + (d1 ? d1.code + '：' + d1.msg : e.code + '：' + e.msg);
        if (d && d.metrics) status.textContent += '（墨迹 ' + d.metrics.ink + 'px，占框 ' + d.metrics.ratio.join('×') + '）';
        status.style.color = '#c0392b';
        return;
      }
      const keys = r.entries.map((e) => 'cs_' + e.key);
      status.style.color = '#2c7a3f';
      status.textContent = '✓ 已加入 ' + r.entries.length + ' 个图形：' + r.entries.map((e) => e.label).join('、') + '。可以在面板里调参数了。';
      refreshList();
      ta.value = '';
      if (keys[0] && GW.physShapes) {
        setTimeout(() => { try { GW.physShapes.insert(keys[0]); } catch (e) { /* noop */ } }, 120);
      }
    }

    const btn = (label, fn, cls) => el('button', { class: 'gw-btn' + (cls ? ' ' + cls : ''), onclick: fn }, label);
    const exRow = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } },
      btn('复制提示词（给网页版 AI）', () => {
        const p = L.buildPrompt(mode, demandFields());
        try { navigator.clipboard.writeText(p); status.textContent = '已复制「' + (mode === 'dynamic' ? '动态' : '静态') + '调参图」提示词，粘到 DeepSeek / 豆包，把最后一段「需求 C」改成你想要的图形。'; }
        catch (e) { status.textContent = '复制失败，请手动从「编辑提示词」里选。'; }
      }),
      btn('编辑提示词', () => promptDialog(mode)));

    // 需求 C：逐行填 —— 生成时整段替换进提示词（没填的行用灰色示例值）
    const demandInputs = {};
    let demandTouched = false;
    const demandRows = L.DEMAND_LINES.map(function (row) {
      const inp = el('input', {
        class: 'hw-input',
        style: { flex: '1', minWidth: '0', fontSize: '12px', padding: '2px 6px' },
      });
      inp.addEventListener('input', function () { demandTouched = true; });
      demandInputs[row[0]] = inp;
      return el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '3px' } },
        el('span', { class: 'if-hint', style: { flex: '0 0 66px', textAlign: 'right' } }, row[1]),
        inp);
    });
    // 参考图：选本地图片或直接 Ctrl+V 粘贴（压到 1024px 再上传，省 token）
    let imgBytes = null, imgUrl = '';
    const imgPrev = el('img', { style: { maxWidth: '132px', maxHeight: '84px', display: 'none', border: '1px solid #ddd', borderRadius: '3px' } });
    const imgNameEl = el('span', { class: 'if-hint' }, '没有参考图（可选，也可以直接 Ctrl+V 粘贴）');
    const fileInp = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    function setImageFile(f) {
      if (!f) return;
      if (imgUrl) { try { URL.revokeObjectURL(imgUrl); } catch (e) { /* noop */ } }
      imgUrl = URL.createObjectURL(f);
      const im = new Image();
      im.onload = async function () {
        imgBytes = await imgToPng(im);
        imgPrev.src = imgUrl; imgPrev.style.display = '';
        imgNameEl.textContent = (f.name || '剪贴板图片') + (imgBytes ? '（' + Math.round(imgBytes.length / 1024) + ' KB）' : '（读取失败）');
        status.style.color = '#666';
        status.textContent = '已录入参考图：生成时会把它一起发给 AI（需要模型支持看图，如 deepseek-flash / qwen3.8-flash / gpt-6.1-sol）。';
      };
      im.src = imgUrl;
    }
    fileInp.onchange = function () { setImageFile(fileInp.files && fileInp.files[0]); fileInp.value = ''; };
    function onPaste(e) {
      const it = e.clipboardData && e.clipboardData.items;
      if (!it) return;
      for (let i = 0; i < it.length; i++) {
        if (it[i].type && it[i].type.indexOf('image') === 0) {
          const f = it[i].getAsFile();
          if (f) { setImageFile(f); e.preventDefault(); }
          return;
        }
      }
    }
    const thinkCk = el('input', { type: 'checkbox' });
    thinkCk.checked = true;
    const thinkRow = el('label', { class: 'if-hint', style: { display: 'flex', alignItems: 'center', gap: '5px', margin: '0 0 8px 72px' } },
      thinkCk, '深度思考（更慢，但质量接近网页版；模型不支持时会被忽略）');
    const modifyTa = el('input', {
      class: 'hw-input',
      style: { flex: '1', minWidth: '0', fontSize: '12px', padding: '2px 6px' },
      placeholder: '要改哪里？例如：箭头加长一倍 / 轨迹画细一点 / 再加一个「入射角」参数',
    });
    function demandFields() {
      const seed = DEMAND_SEED[mode];
      const o = {};
      L.DEMAND_LINES.forEach(function (row) {
        const k = row[0];
        o[k] = (demandInputs[k].value || '').trim() || seed[k] || '';
      });
      return o;
    }
    async function genAI() {
      const cfg = GW.aicfg, ai = GW.ai;
      if (!ai || !ai.ask || !cfg) { status.style.color = '#c0392b'; status.textContent = 'AI 模块没加载。'; return; }
      const pv = cfg.provider();
      const label = ((cfg.PROVIDERS && cfg.PROVIDERS[pv]) || {}).label || pv;
      if (!cfg.has(pv)) {
        status.style.color = '#c0392b';
        status.textContent = '「' + label + '」还没填 API Key：插入菜单 → AI 助手 → 模型与密钥。也可以点「复制提示词」去网页版 AI。';
        return;
      }
      const fields = demandFields();
      const onlyImage = !!imgBytes && !demandTouched;
      let sys;
      if (onlyImage) {
        const bare = '【需求 C】\n学科：（照图）\n子类：（照图）\n图形名：照图还原\n用途：按参考图还原图形，图上没有的不要自己加\n要调的参数：（图上没有参数，就给 1–3 个可选的，比如尺寸/角度）\n构图：（照参考图，含虚实线与文字）\n标注：（照抄图上的字）';
        sys = L.promptDefault(mode).replace(/【需求 C[\s\S]*$/, bare);
      } else {
        sys = L.buildPrompt(mode, fields);
      }
      if (imgBytes) sys += '\n\n' + L.IMAGE_HINT;
      const user = imgBytes
        ? '照着这张参考图把图形画出来：先还原图上已有的几何与标注，需求 C 里写了的参数/交互再补进去。'
        : '请按上面的【需求 C】写出完整的 shape({...}) 代码，只输出一个代码块。';
      status.style.color = '#666';
      status.textContent = imgBytes
        ? '正在让「' + label + '」看图写代码（最长 90 秒）…'
        : '正在让「' + label + '」写「' + (mode === 'dynamic' ? '动态' : '静态') + '调参图」代码（最长 90 秒）…';
      const deep = !!thinkCk.checked;
      const t0 = Date.now();
      const r = await ai.ask(imgBytes, sys, user, {
        maxTokens: deep ? 8000 : 3000, temperature: 0.3, think: deep, timeout: deep ? 180000 : 90000,
      });
      const secs = ((Date.now() - t0) / 1000).toFixed(1) + 's';
      if (r.error) { status.style.color = '#c0392b'; status.textContent = '✗ ' + r.error; return; }
      let code = stripFence(r.text);
      let v = await validate(code);
      // 不过关就把报错回喂一次，让 AI 自己修（减少用户返工）
      for (let round = 0; !v.ok && round < 1; round++) {
        status.style.color = '#666';
        status.textContent = '第一次没过校验（' + errText(v) + '），正在让「' + label + '」按报错修…';
        const e2 = await ai.ask(null, REFINE_SYS,
          '现有代码：\n```js\n' + code + '\n```\n\n校验报错：' + errText(v) + '\n请只修这些报错，其余代码保持不变。',
          { maxTokens: deep ? 6000 : 2600, temperature: 0.2, timeout: deep ? 150000 : 90000 });
        if (e2.error) { break; }
        code = stripFence(e2.text);
        v = await validate(code);
      }
      ta.value = code;
      if (v.ok) {
        status.style.color = '#2c7a3f';
        status.textContent = '✓ ' + label + (r.model ? ' · ' + r.model : '') + ' 写完了（' + secs +
          (r.tok ? '，' + r.tok + ' tokens' : '') + '）' + (deep ? ' · 深度思考' : '') + '。点「保存并执行」入图形库。';
      } else {
        status.style.color = '#c0392b';
        status.textContent = '⚠ 这份代码还没过校验：' + errText(v) + '。可以在「再改一版」里说怎么改，或直接改代码。';
      }
    }

    // 1.3.12：二次编辑 —— 拿编辑区现有代码 + 一句修改要求，让 AI 只改这几处（减少返工）
    async function refine() {
      const code = (ta.value || '').trim();
      const want = (modifyTa.value || '').trim();
      if (!code) { status.style.color = '#c0392b'; status.textContent = '编辑区还没有代码：先用 AI 生成或粘贴一份。'; return; }
      if (!want) { status.style.color = '#c0392b'; status.textContent = '在「再改一版」那行写清楚要改什么，例如「箭头加长一倍」「再加一个入射角参数」。'; return; }
      const cfg = GW.aicfg, ai = GW.ai;
      if (!ai || !ai.ask || !cfg) { status.style.color = '#c0392b'; status.textContent = 'AI 模块没加载。'; return; }
      const pv = cfg.provider();
      const label = ((cfg.PROVIDERS && cfg.PROVIDERS[pv]) || {}).label || pv;
      if (!cfg.has(pv)) { status.style.color = '#c0392b'; status.textContent = '「' + label + '」还没填 API Key，去 AI 助手 → 模型与密钥。'; return; }
      const deep = !!(thinkCk && thinkCk.checked);
      const sys = REFINE_SYS;
      const user = '现有代码：\n```js\n' + code + '\n```\n\n要改的地方：' + want;
      status.style.color = '#666';
      status.textContent = '正在让「' + label + '」按你的要求改（最长 ' + (deep ? 150 : 90) + ' 秒' + (deep ? '，深度思考' : '') + '）…';
      const r = await ai.ask(null, sys, user, { maxTokens: deep ? 6000 : 2600, temperature: 0.2, timeout: deep ? 150000 : 90000 });
      if (r.error) { status.style.color = '#c0392b'; status.textContent = '✗ ' + r.error; return; }
      ta.value = String(r.text || '');
      status.style.color = '#2c7a3f';
      status.textContent = '✓ ' + label + ' 改完了' + (r.tok ? '（' + r.tok + ' tokens）' : '') + '。确认后点「保存并执行」。';
    }

    function syncMode() {
      modeBtns.forEach((b, i) => {
        const on = (i === 0 ? 'static' : 'dynamic') === mode;
        b.style.background = on ? '#1b2433' : '';
        b.style.color = on ? '#fff' : '';
        b.style.borderColor = on ? '#1b2433' : '';
      });
      const h = modeRow.querySelector('.if-hint:last-child');
      if (h) h.textContent = mode === 'dynamic' ? '会动：粒子 / 摆动 / 波动这类过程动画' : '不动：改参数就换样子的板书图';
      const seed = DEMAND_SEED[mode];
      L.DEMAND_LINES.forEach(function (row) { demandInputs[row[0]].placeholder = seed[row[0]] || ''; });
    }

    const d = GW.dialog({
      title: '自定义图形', width: 760, noFooter: true,
      onClose: function () {
        document.removeEventListener('paste', onPaste);
        if (imgUrl) { try { URL.revokeObjectURL(imgUrl); } catch (e) { /* noop */ } }
      },
      body: el('div', null,
        el('div', { class: 'if-hint', style: { marginBottom: '6px' } },
          '有参考图（板书截图 / 题目配图）就先「选参考图」或直接 Ctrl+V 粘贴——AI 照图定形状；下面 7 行需求只作补充，填好点「用 AI 直接生成」。不满意就在「再改一版」里说一句接着改，校验不过会自动按报错再修一次。'),
        el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' } },
          el('span', { class: 'if-hint' }, '放到：'), subSel, grpSel),
        modeRow,
        exRow,
        el('div', { class: 'if-hint', style: { margin: '2px 0 6px' } },
          '下面 7 行就是提示词里的「需求 C」：填好后点生成，会自动替换进固定提示词再发给 AI；留空的行用灰色示例值。'),
        el('div', { style: { marginBottom: '8px' } }, demandRows),
        el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' } },
          btn('选参考图', () => fileInp.click()),
          btn('粘贴图片', () => { status.style.color = '#666'; status.textContent = '点一下这个框，然后 Ctrl+V 粘贴截图。'; }),
          btn('清除图片', () => { imgBytes = null; imgPrev.style.display = 'none'; imgPrev.removeAttribute('src'); imgNameEl.textContent = '没有参考图（可选，也可以直接 Ctrl+V 粘贴）'; }),
          fileInp, imgPrev),
        thinkRow,
        el('div', { style: { margin: '0 0 8px 72px' } }, imgNameEl),
        el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' } },
          btn('用 AI 直接生成', genAI)),
        el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' } },
          el('span', { class: 'if-hint', style: { flex: '0 0 66px', textAlign: 'right' } }, '再改一版'),
          modifyTa, btn('按当前代码再改一版', refine)),
        ta,
        status,
        el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' } },
          btn('保存并执行', () => saveRun(), 'primary'),
          btn('清空编辑区', () => { ta.value = ''; status.textContent = ''; status.style.color = '#666'; }),
          btn('关闭', () => d.close())),
        el('div', { class: 'if-hint', style: { margin: '10px 0 0' } }, '已有：'),
        listBox),
    });
    document.addEventListener('paste', onPaste);
    refreshList();
    subSel.onchange();
    syncMode();
  }

  function promptDialog(mode) {
    const md = mode === 'dynamic' ? 'dynamic' : 'static';
    const ta = el('textarea', {
      class: 'hw-input',
      style: { width: '100%', height: '300px', boxSizing: 'border-box', fontFamily: 'Consolas, monospace', fontSize: '12px', lineHeight: '1.5' },
    });
    ta.value = getPrompt(md);
    const st = el('div', { class: 'if-hint', style: { marginTop: '6px' } }, '');
    const d = GW.dialog({
      title: '提示词 · ' + (md === 'dynamic' ? '动态调参图（动画）' : '静态调参图'), width: 760, noFooter: true,
      body: el('div', null,
        el('div', { class: 'if-hint', style: { marginBottom: '6px' } }, '粘贴给 AI 的整段提示词。建议只改最后「需求 C」；改坏契约会提示。两套模板各存一份，互不影响。'),
        ta, st,
        el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
          el('button', {
            class: 'gw-btn primary', onclick: () => {
              const r = L.promptCheck(ta.value, md);
              setPrompt(ta.value, md);
              st.textContent = r.ok ? '已保存。' : '已保存，但缺了：' + r.missing.join('、') + ' —— AI 产出很可能过不了校验。';
              st.style.color = r.ok ? '#2c7a3f' : '#c0392b';
            },
          }, '保存'),
          el('button', { class: 'gw-btn', onclick: () => { ta.value = resetPrompt(md); st.textContent = '已恢复默认。'; st.style.color = '#666'; } }, '恢复默认'),
          el('button', { class: 'gw-btn', onclick: () => d.close() }, '关闭'))),
    });
  }

  /* ---------- 总闸与开机 ---------- */
  function gateOn() { return !(GW.settings && GW.settings.customShapes === false); }
  function unregAll() { Object.keys(regged).forEach((k) => unreg(k)); }
  function applyGate() {
    if (gateOn()) loadAll(); else unregAll();
    GW.requestRender && GW.requestRender();
  }
  // 换设备打开 .gewu：对象还在（type:'pb' + key），但这台机器没有它的代码。提示一次，别让老师以为文件坏了。
  function checkMissing() {
    if (!GW.doc || !GW.doc.pages || !GW.physShapes) return;
    const miss = Object.create(null);
    GW.doc.pages.forEach((p) => {
      (p.ink || []).concat(p.objs || []).forEach((it) => {
        const k = it && it.key;
        if (typeof k === 'string' && k.indexOf('cs_') === 0 && !GW.physShapes.shapes[k]) miss[k] = 1;
      });
    });
    const n = Object.keys(miss).length;
    if (n) GW.toast('这个文件里有 ' + n + ' 个自定义图形，本机的图形库里没有它们的代码（其它图形照常显示）。让作者把代码发你，用「自定义图形」粘进来即可恢复');
  }

  GW.shapeSelf = {
    open: openDialog,
    validate: validate,
    import: importCode,
    list: list,
    remove: remove,
    applyGate: applyGate,
    prompt: getPrompt,
    setPrompt: setPrompt,
    resetPrompt: resetPrompt,
    promptDefault: L.promptDefault,
    promptCheck: L.promptCheck,
    subjects: SUBJECTS,
    groups: PHYS_GROUPS,
    _db: readDB,
    _regged: regged,
    _makeU: makeU,
    _ex: { simple: EX_SIMPLE, anim: EX_ANIM, mag: EX_MAG },
  };

  if (gateOn()) loadAll();
  // board.js 在 physshapes.js 之后、shapeself.js 之后才建好 GW.doc；等一拍再查缺定义的图形
  setTimeout(checkMissing, 2600);
})();
