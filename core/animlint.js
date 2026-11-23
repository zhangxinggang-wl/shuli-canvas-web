/* 数理无限画布 · 单文件动画契约检查（方案 L2；规则号与 docs/动画单文件契约.md §9.5 一一对应）
 *
 * 为什么要有这个文件：同一套 C1–C10 规则原先只活在 scripts/check-anim.js 里（纯 Node）。
 * 老师在应用里「导入动画 HTML」时要先看到同一份结论，所以把规则抽成**浏览器与 Node 共用**的一份实现：
 *   - 浏览器：GW.animlint.lint(html) → 预览弹层里那份红/绿名单就是它给的
 *   - Node：scripts/check-anim.js require() 它，行为与换抽之前逐条一致（它的 14 条反向对照守着这件事）
 * 两个入口不许各写一份规则 —— 一份跑绿、另一份判红是最难查的那类 bug。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && root.GW) { root.GW.animlint = api; root.GW.animLint = api.lint; }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var MAX_BYTES = 120 * 1024;      // 契约 §2：单文件 ≤120KB
  var META_KEYS = ['title', 'chapter', 'tags', 'params', 'fallback'];
  var CONTENT_NAME = /^bx\d+-\d+-\d+-[a-z0-9-]+\.html$/;   // 契约 §2 命名
  var CHAPTER_FORMAT = /^(必修|选择性必修)[一二三]\/第\d+章\/.+$/;

  /** 取第一个含 @title 的 HTML 注释块（与骨架、objects.js 的解析口径一致） */
  function parseMeta(text) {
    if (!text || typeof text !== 'string') return null;
    var re = /<!--([\s\S]*?)-->/g, m, block = null;
    while ((m = re.exec(text))) { if (/@title/.test(m[1])) { block = m[1]; break; } }
    if (!block) return null;
    var meta = {};
    block.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var hit = line.match(/^\s*@(\w+)\s+(.*)$/);
      if (!hit) return;                      // 注释里的散文行不算错
      meta[hit[1]] = hit[2].trim();
    });
    return { meta: meta, block: block };
  }

  /** @params k=数字 → [{k, v}]（合法的才收；非法片段交给 C3 报） */
  function paramsFromMeta(meta) {
    var out = [];
    String((meta && meta.params) || '').split(/[,;]/).forEach(function (kv) {
      var s = kv.trim(), i = s.indexOf('=');
      if (i <= 0) return;
      var k = s.slice(0, i).trim(), v = Number(s.slice(i + 1).trim());
      if (k && isFinite(v)) out.push({ k: k, v: v });
    });
    return out;
  }

  /* 去掉注释再查代码：注释里写「本文件不许 fetch(」不许被误判，
     而注释里写「window.__anim」也不许算通过 —— 两头都错，所以 C5–C9 查代码、C4 查原文 */
  function stripComments(text) {
    return String(text || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
  }

  function basename(name) {
    return String(name || '').replace(/\\/g, '/').split('/').pop();
  }

  /**
   * 检查一份单文件动画。
   * @param {string} text  文件的 UTF-8 文本
   * @param {object} opts  { name, label, bytes, isContent }
   *   name      文件名（用于 C3 命名规则），可带路径
   *   label     报错前缀，默认取 name / 'anim.html'
   *   bytes     字节数；不给就按 UTF-8 现算
   *   isContent 是否是「入库内容件」（模板/骨架传 false：不查章节格式与文件名编号）
   *   requireName 是否查文件名编号（不给就跟随 isContent）
   */
  function lint(text, opts) {
    text = typeof text === 'string' ? text : '';
    opts = opts || {};
    function label0(v) { return v ? String(v).split(/[\\/]/).pop() : ''; }
    var name = opts.name || label0(opts.label) || 'anim.html';
    var label = opts.label || name;
    var errors = [];
    var checks = 0;
    function fail(code, msg) { errors.push({ code: code, msg: msg }); }
    function ok() { checks++; }

    /* ---------- C1 体积 / 编码 ---------- */
    var bytes = typeof opts.bytes === 'number' ? opts.bytes : new TextEncoder().encode(text).length;
    if (bytes > MAX_BYTES) fail('C1', label + '：' + bytes + 'B 超过 ' + MAX_BYTES + 'B');
    if (text.charCodeAt(0) === 0xFEFF) fail('C1', label + '：带 UTF-8 BOM');
    if (text.indexOf('\u0000') >= 0) fail('C1', label + '：含 NUL 字节（二进制混入）');
    if (text.indexOf('\uFFFD') >= 0) fail('C1', label + '：不是合法 UTF-8（出现替换字符）');
    ok();

    /* ---------- C2 meta 块 ---------- */
    var parsed = parseMeta(text);
    var meta = parsed ? parsed.meta : null;
    if (!parsed) fail('C2', label + '：找不到含 @title 的注释块');
    if (meta) META_KEYS.forEach(function (k) { if (!meta[k]) fail('C2', label + '：meta 缺 @' + k); });
    ok();

    /* ---------- C3 meta 取值 / @params 格式 ---------- */
    var isContent = !!opts.isContent;
    // 文件名编号规则只约束「随包内容件」（src/anim/*）；老师从应用里入库的文件按标题命名，所以可关掉
    var requireName = opts.requireName === undefined ? isContent : !!opts.requireName;
    if (meta) {
      if (isContent) {
        if (/^未分配$/.test(meta.chapter || '')) fail('C3', label + '：@chapter 还是「未分配」');
        if (!CHAPTER_FORMAT.test(meta.chapter || '')) {
          fail('C3', label + '：@chapter 格式应为「必修三/第11章/11.4 串联电路和并联电路」，实际「' + meta.chapter + '」');
        }
        if (requireName && !CONTENT_NAME.test(basename(name))) fail('C3', label + '：文件名应为 bx<册>-<章>-<节>-<slug>.html');
      }
      if (meta.params !== undefined) {
        var pairs = String(meta.params).split(/[,;]/).filter(function (s) { return s.trim(); });
        if (!pairs.length) fail('C3', label + '：@params 为空');
        pairs.forEach(function (p) {
          var i = p.indexOf('=');
          if (i <= 0) { fail('C3', label + '：@params 片段「' + p + '」不是 k=v'); return; }
          var k = p.slice(0, i).trim(), v = p.slice(i + 1).trim();
          if (!/^[A-Za-z_]\w*$/.test(k)) fail('C3', label + '：@params 键名「' + k + '」不合法');
          if (!/^-?\d+(\.\d+)?$/.test(v)) fail('C3', label + '：@params 的值「' + v + '」不是数字');
        });
      }
      if (/[，、；]/.test(meta.tags || '') && !/[,;]/.test(meta.tags || '')) {
        fail('C3', label + '：@tags 要用半角逗号');
      }
    }
    ok();

    /* ---------- C4 零外链（查原文：注释里藏的外链也算） ---------- */
    var hits = [];
    var attrRe = /\b(?:src|href|poster|data-src)\s*=\s*["']([^"']*)["']/gi;
    var m;
    while ((m = attrRe.exec(text))) {
      var v = m[1].trim();
      if (!v || v.charAt(0) === '#' || /^data:/i.test(v) || /^about:blank$/i.test(v)) continue;
      hits.push(v);
    }
    var cssRe = /\burl\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    while ((m = cssRe.exec(text))) {
      var u = m[1].trim();
      if (!/^data:/i.test(u) && u.charAt(0) !== '#') hits.push('url(' + u + ')');
    }
    if (/@import\s+(?:url\()?['"]?https?:/i.test(text)) hits.push('@import http');
    if (/<link\b[^>]*\brel\s*=\s*["']?stylesheet/i.test(text)) hits.push('<link rel=stylesheet>');
    if (/\/\/cdn\.|\/\/unpkg\.|\/\/cdnjs\./i.test(text)) hits.push('CDN 域名');
    if (hits.length) fail('C4', label + '：外链 ' + hits.join(' | '));
    ok();

    var code = stripComments(text);

    /* ---------- C5 运行期网络/存储 API ---------- */
    var banned = [
      [/\bfetch\s*\(/, 'fetch('],
      [/XMLHttpRequest/, 'XMLHttpRequest'],
      [/new\s+WebSocket/, 'new WebSocket'],
      [/EventSource/, 'EventSource'],
      [/importScripts\s*\(/, 'importScripts('],
      [/navigator\s*\.\s*sendBeacon/, 'navigator.sendBeacon'],
      [/new\s+Worker\s*\(/, 'new Worker('],
      [/localStorage|sessionStorage/, 'localStorage/sessionStorage'],
      [/indexedDB/, 'indexedDB'],
      [/document\s*\.\s*domain/, 'document.domain'],
      [/document\s*\.\s*write/, 'document.write'],
    ];
    banned.forEach(function (pair) { if (pair[0].test(code)) fail('C5', label + '：出现 ' + pair[1]); });
    ok();

    /* ---------- C6 翻出框架 ---------- */
    var pats = [
      [/\bwindow\s*\.\s*parent\b/, 'window.parent'],
      [/(^|[^.\w$])parent\s*\.\s*\w/, 'parent.'],
      [/(^|[^.\w$])top\s*\.\s*(document|location|frames|window)\b/, 'top.document 等'],
      [/\bwindow\s*\.\s*opener\b/, 'window.opener'],
      [/\bframeElement\b/, 'frameElement'],
    ];
    pats.forEach(function (pair) { if (pair[0].test(code)) fail('C6', label + '：出现 ' + pair[1]); });
    ok();

    /* ---------- C7 契约 API 与固定 DOM ---------- */
    ['stage', 'ui', 'hint'].forEach(function (id) {
      if (!new RegExp('id\\s*=\\s*["\']' + id + '["\']').test(code)) fail('C7', label + '：缺固定 DOM #' + id);
    });
    if (!/window\s*\.\s*__anim\s*=/.test(code)) fail('C7', label + '：没有 window.__anim = …');
    ['reset', 'setParam', 'capture'].forEach(function (k) {
      if (!new RegExp('\\b' + k + '\\s*:\\s*function').test(code) &&
          !new RegExp('\\b' + k + '\\s*[:(]').test(code)) {
        fail('C7', label + '：__anim 缺 ' + k + '()');
      }
    });
    if (!/toDataURL\s*\(\s*['"]image\/png['"]\s*\)/.test(code)) {
      fail('C7', label + "：capture() 必须 toDataURL('image/png')");
    }
    ok();

    /* ---------- C8 自适应 devicePixelRatio ---------- */
    if (!/devicePixelRatio/.test(code)) fail('C8', label + '：没读 devicePixelRatio（1080p 会糊）');
    if (!/setTransform\s*\(/.test(code)) fail('C8', label + '：位图重建后没 setTransform');
    ok();

    /* ---------- C9 建了位图 ---------- */
    if (!/\.width\s*=/.test(code)) fail('C9', label + '：没建位图（cv.width = …）');
    ok();

    /* ---------- C10 3D 降级契约（R7） ---------- */
    var threeD = /getContext\s*\(\s*['"](webgl|webgl2|experimental-webgl)['"]/.test(code) ||
      /\bTHREE\s*\./.test(code) || /WebGLRenderer/.test(code) || /\bnew\s+WebGLRenderingContext\b/.test(code);
    if (threeD) {
      var fb = String((meta && meta.fallback) || '').trim();
      if (!fb || /^无/.test(fb)) {
        fail('C10', label + '：用了 3D 但 @fallback 写的是「' + (fb || '空') + '」（必须有真正的 2D 回退）');
      } else if (!/(canvas|2d|静态|剖面|截图|图|svg)/i.test(fb)) {
        fail('C10', label + '：@fallback 没说是哪种 2D 回退：' + fb);
      }
      if (!/\btier\b/.test(code)) fail('C10', label + '：用了 3D 但没读 ?tier=（宿主没法把它降成 2D）');
    }
    ok();

    return {
      ok: errors.length === 0,
      errors: errors,
      checks: checks,
      meta: meta,
      params: paramsFromMeta(meta),
      title: (meta && meta.title) || '',
      chapter: (meta && meta.chapter) || '',
    };
  }

  return {
    lint: lint,
    parseMeta: parseMeta,
    params: paramsFromMeta,
    stripComments: stripComments,
    MAX_BYTES: MAX_BYTES,
    META_KEYS: META_KEYS,
    CONTENT_NAME: CONTENT_NAME,
    CHAPTER_FORMAT: CHAPTER_FORMAT,
  };
});
