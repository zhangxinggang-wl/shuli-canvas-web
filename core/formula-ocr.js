/* 手写公式 · 在线识别 —— core/formula-ocr.js
 *
 * 老师的真实需求是「写着写着就要一个公式」：不许切窗口、不许记 LaTeX。
 * 这里给一块弹出式书写板：笔停约 0.7 秒，把笔迹栅格化成 PNG 送到线上识别服务，
 * 预览确认后落成一个可双击再编辑的 formula 对象（复用 objects.js 的 formula 类型）。
 *
 * 一、为什么笔迹要先栅格化，而不是直接发墨迹
 *   现有三家能用的服务（SimpleTex / Mathpix / 自建）都是「传图、回 LaTeX」的形态，
 *   墨迹协议只有 Mathpix Digital Ink 一类，且要额外买。所以统一走 PNG：
 *   白底、黑笔、只保留包围盒、按高度归一化 —— 送出去一张「干净」的图，
 *   比整块画布截图识别率高得多（黑板上还有网格、坐标轴、别的板书）。
 *
 * 二、为什么不直接在渲染进程 fetch
 *   SimpleTex / Mathpix 都不发 CORS 头，渲染进程里 fetch 会被浏览器拦成
 *   「Failed to fetch」，用户根本看不到「密钥错」还是「额度用完」。
 *   正式版走 main/main.js 的 ocr-request（Electron net 直连，无跨域、带 30s 超时）；
 *   浏览器里跑（开发 / 探针）退回 fetch。两条路通过 TRANSPORT 切换。
 *
 * 三、接口契约（这几条是硬编码的，换服务要改 buildRequest / parse）
 *   simpletex  POST https://server.simpletex.net/api/latex_ocr
 *              header: token: <UAT>；body: multipart/form-data，字段 file
 *              → {status:true, res:{latex, conf}}
 *   mathpix    POST https://api.mathpix.com/v3/text
 *              header: app_id / app_key；body: JSON {src:"data:image/png;base64,..."}
 *              → {latex_styled, confidence}
 *   deepseek   POST https://api.deepseek.com/chat/completions（OpenAI 兼容）
 *              header: Authorization: Bearer <Key>；body: JSON，模型 deepseek-flash
 *              （DeepSeek-V4.1-Flash-1017，图像理解，每图上限 1024 tokens），
 *              image_url 走 data:image/png;base64；显式 thinking:{type:'disabled'}
 *              关掉思考模式（默认开启，不关会多等好几秒、还按输出价计费）。
 *              → choices[0].message.content 里是 LaTeX 文本，需剥 ```latex 围栏
 *   custom     任意 https 地址；multipart 字段 file；有 key 就带 Authorization: Bearer
 *              → 在返回 JSON 的任意一层找 latex / tex / text
 *   文档：https://doc.simpletex.cn/en/api/api_formula_recognition.html
 *
 * 四、密钥只存在本机 localStorage 的 'gewu.ocr'，程序不内置任何密钥、不代付费用。
 *   界面上写明「需要你自己申请」，因为这是按次计费的服务。
 */
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW) return;
  const h = GW.h;

  const CFG_KEY = 'gewu.ocr';

  // 三家服务差别只在「怎么带密钥、怎么塞图、怎么取 latex」，其余流程完全共用。
  const PROVIDERS = {

    deepseek: {
      label: 'DeepSeek（V4.1-Flash，最便宜）',
      endpoint: 'https://api.deepseek.com/chat/completions',
      hint: '在 platform.deepseek.com 创建 API Key 填到上面即可。走 deepseek-flash（V4.1-Flash-1017）的图像理解，每次约 0.001 元；它是通用模型，手写结构复杂时不如专用引擎稳，可在上面切回 SimpleTex 对比。',
    },
    simpletex: {
      label: 'SimpleTex（国内，有免费额度）',
      endpoint: 'https://server.simpletex.net/api/latex_ocr',
      hint: '在 simpletex.cn 用户中心创建「用户授权令牌」，填到 API Key 里；标准接口 500 次/日免费额度，之后按次计费。',
    },
    mathpix: {
      label: 'Mathpix（识别最稳，按次计费）',
      endpoint: 'https://api.mathpix.com/v3/text',
      hint: '需要 Mathpix 控制台的 app_id 与 app_key 两个值，分别填到下面两栏。',
    },
    custom: {
      label: '自建 / 其他服务',
      endpoint: '',
      hint: 'POST multipart/form-data，字段名 file；返回的 JSON 里任意一层出现 latex / tex / text 即可。有 Key 会带 Authorization: Bearer。',
    },
  };
  const DEF_CFG = { provider: 'deepseek', key: '', appId: '', endpoint: '' };
  const DS_MODEL = 'deepseek-flash';

  function config() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (_) { c = {}; }
    const out = Object.assign({}, DEF_CFG, c);
    // 1.0.17 存过 provider:'local'（离线引擎，1.0.19 已删）。不归一化的话
    // PROVIDERS[provider] 是 undefined，打开写板时读 .hint 直接抛异常 ——
    // 表现就是「点了没反应」。旧配置必须在这里兜回默认服务。
    if (!PROVIDERS[out.provider]) out.provider = DEF_CFG.provider;
    return out;
  }
  function saveConfig(patch) {
    const c = Object.assign(config(), patch || {});
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (_) {}
    return c;
  }

  // ---------- 二进制小工具 ----------
  function b64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function fromB64(s) {
    const bin = atob(String(s || ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // 主进程收的是「已经拼好的 multipart 原文」，所以这里手工拼 boundary，
  // 不依赖 FormData（它没法序列化成 base64 穿过 IPC）。
  function multipart(field, filename, mime, bytes) {
    const boundary = '----gewu' + Date.now().toString(16) + Math.random().toString(16).slice(2, 10);
    const head = new TextEncoder().encode(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="' + field + '"; filename="' + filename + '"\r\n' +
      'Content-Type: ' + mime + '\r\n\r\n');
    const tail = new TextEncoder().encode('\r\n--' + boundary + '--\r\n');
    const body = new Uint8Array(head.length + bytes.length + tail.length);
    body.set(head, 0);
    body.set(bytes, head.length);
    body.set(tail, head.length + bytes.length);
    return { body, contentType: 'multipart/form-data; boundary=' + boundary };
  }

  // ---------- 笔迹 → PNG ----------
  function bboxOf(strokes) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const s of strokes) for (const p of s.pts) {
      if (p.x < x1) x1 = p.x;
      if (p.y < y1) y1 = p.y;
      if (p.x > x2) x2 = p.x;
      if (p.y > y2) y2 = p.y;
    }
    if (!isFinite(x1)) return null;
    return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
  }

  // 只留包围盒、按高度归一化到 ~220px、四周留 28px 白边：识别服务对「挤在角落的
  // 小字」最不友好，送进去的图必须是字号统一、留白足够的。
  function renderPng(strokes) {
    const b = bboxOf(strokes);
    const PAD = 28;
    if (!b) return Promise.resolve(null);
    let scale = 220 / b.h;
    if (b.w * scale > 1400) scale = 1400 / b.w;   // 超长公式别把宽度撑爆
    scale = Math.max(0.25, Math.min(scale, 3));
    const W = Math.ceil(b.w * scale + PAD * 2);
    const H = Math.ceil(b.h * scale + PAD * 2);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#111';
    g.fillStyle = '#111';
    g.lineWidth = Math.max(2.6, 4 * scale);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const s of strokes) {
      const pts = s.pts;
      if (pts.length === 1) {
        g.beginPath();
        g.arc((pts[0].x - b.x) * scale + PAD, (pts[0].y - b.y) * scale + PAD, g.lineWidth / 2, 0, 6.2832);
        g.fill();
        continue;
      }
      g.beginPath();
      g.moveTo((pts[0].x - b.x) * scale + PAD, (pts[0].y - b.y) * scale + PAD);
      for (let i = 1; i < pts.length; i++) g.lineTo((pts[i].x - b.x) * scale + PAD, (pts[i].y - b.y) * scale + PAD);
      g.stroke();
    }
    return new Promise((res) => cv.toBlob((blob) => {
      if (!blob) return res(null);
      blob.arrayBuffer().then((buf) => res(new Uint8Array(buf)));
    }, 'image/png'));
  }

  // ---------- 请求构造与响应解析 ----------
  // 通用大模型不是公式专用 OCR，必须把「只回 LaTeX、别自作主张」写死进系统提示，
  // 否则它会把 \frac{a}{b} 展开成 a/b、把上下标拍平成 x1、还在前后加解释。
  const DS_SYS = [
    '你是一个数学公式 OCR 引擎。用户给你一张手写公式的图片，你只输出这段公式对应的 LaTeX。',
    '硬性要求：',
    '1. 只输出 LaTeX 本体：不要 $ 或 $$，不要 markdown 代码块，不要任何解释、编号、前后缀。',
    '2. 忠实还原二维结构：分式用 \\frac{}{}，根号覆盖范围用 \\sqrt{}，上下标用 _{} ^{}，',
    '   求和与积分带上限 \\sum_{}^{} \\int_{}^{}，括号用 \\left( \\right)。',
    '3. 不确定的字符按最像的那个写；不要省略、不要改写、不要补全用户没写的内容。',
    '4. 多行或分段用 \\\\ 换行；化学式用 \\mathrm{} 包住元素符号。',
    '5. 如果图里确实没有公式，只输出 EMPTY。',
    '示例：图片是 s=vt 加上二分之一 a t 平方 → 输出 s=vt+\\frac{1}{2}at^2',
  ].join('\n');

  function dsPayload(png) {
    return {
      model: DS_MODEL,
      messages: [
        { role: 'system', content: DS_SYS },
        {
          role: 'user',
          content: [
            { type: 'text', text: '识别这张手写公式，只回 LaTeX。' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64(png) } },
          ],
        },
      ],
      max_tokens: 900,
      temperature: 0,
      stream: false,
      // 默认是思考模式：关掉才快（几秒 vs 十几秒），也才不会把思维链算进输出费。
      thinking: { type: 'disabled' },
    };
  }

  function buildRequest(cfg, png) {
    const p = cfg.provider;
    const endpoint = (cfg.endpoint || '').trim() || PROVIDERS[p].endpoint;
    if (p === 'deepseek') {
      const body = new TextEncoder().encode(JSON.stringify(dsPayload(png)));
      return { url: endpoint, headers: { Authorization: 'Bearer ' + (cfg.key || '') }, contentType: 'application/json', body };
    }
    if (p === 'mathpix') {
      const body = new TextEncoder().encode(JSON.stringify({
        src: 'data:image/png;base64,' + b64(png),
        formats: ['latex_styled', 'text'],
        ocr: ['math', 'text'],
      }));
      return { url: endpoint, headers: { app_id: cfg.appId || '', app_key: cfg.key || '' }, contentType: 'application/json', body };
    }
    const mp = multipart('file', 'formula.png', 'image/png', png);
    const headers = {};
    if (p === 'simpletex') headers.token = cfg.key || '';
    else if (cfg.key) headers.Authorization = 'Bearer ' + cfg.key;
    return { url: endpoint, headers, contentType: mp.contentType, body: mp.body };
  }

  // LaTeX 清理：有的服务回 $$...$$、\[...\]、\begin{equation}...\end{equation}，全部剥掉，
  // 只留公式本体（formula 对象自己会 displayMode 渲染，不需要外面这层壳）。
  function cleanTex(tex) {
    let t = String(tex == null ? '' : tex).trim();
    t = t.replace(/^\$\$([\s\S]*?)\$\$$/, '$1').replace(/^\$([\s\S]*?)\$$/, '$1');
    t = t.replace(/^\\\[([\s\S]*?)\\\]$/, '$1').replace(/^\\\(([\s\S]*?)\\\)$/, '$1');
    t = t.replace(/^\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}$/, '$1');
    return t.trim();
  }

  function parseSimpleTex(json) {
    if (!json || typeof json !== 'object') return { error: '返回内容不是 JSON' };
    if (json.status === false) return { error: json.message || json.msg || json.error || '识别失败' };
    const r = json.res || {};
    const tex = String(r.latex == null ? '' : r.latex);
    if (/^\[EMPTY\]$/.test(tex)) return { error: '没识别到内容：写大一点、写清楚一点再试' };
    if (/^\[DOCIMG\]$/.test(tex)) return { error: '这张图更像整页文档，请只写一条公式' };
    if (!tex) return { error: '服务没返回 LaTeX' };
    return { tex: cleanTex(tex), conf: r.conf != null ? +r.conf : null };
  }

  function parseMathpix(json) {
    if (!json || typeof json !== 'object') return { error: '返回内容不是 JSON' };
    if (json.error) {
      const info = (json.error_info && (json.error_info.message || json.error_info.id)) || '';
      return { error: String(json.error) + (info ? '：' + info : '') };
    }
    const tex = json.latex_styled || json.latex || '';
    if (!tex) return { error: '服务没返回 LaTeX' };
    return { tex: cleanTex(tex), conf: json.confidence != null ? +json.confidence : null };
  }

  // 大模型回的是一段文本，可能带 ```latex 围栏、前后解释、甚至「这个公式是…」。
  // 这里只挑 LaTeX 本体：优先取围栏，其次 $$…$$，最后把纯中文说明行丢掉。
  function pickLatex(text) {
    let t = String(text == null ? '' : text).trim();
    const fence = t.match(/```(?:latex|tex)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1];
    const dd = t.match(/\$\$([\s\S]*?)\$\$/);
    if (dd) t = dd[1];
    t = t.replace(/^\s*(?:LaTeX|latex|公式|答案)\s*[:：]\s*/, '');
    {
      const lines = t.split('\n').map((s) => s.trim()).filter((s) => {
        if (!s) return false;
        // 纯中文说明行（没有任何 LaTeX 记号）丢掉，多行公式本身带 \ ^ _ { }，不会误删
        return !(/[\u4e00-\u9fa5]/.test(s) && !/[\\^_{}]/.test(s));
      });
      t = lines.join(' ');
    }
    return t.trim();
  }

  function parseDeepseek(json) {
    if (!json || typeof json !== 'object') return { error: '返回内容不是 JSON' };
    if (json.error) {
      const e = json.error;
      return { error: String((e && (e.message || e.code)) || e) };
    }
    const ch = (json.choices && json.choices[0]) || null;
    const raw = String((ch && ch.message && ch.message.content) || '');
    if (!raw) return { error: '模型没返回内容' + (ch && ch.finish_reason === 'content_filter' ? '（被内容策略拦截）' : '') };
    const tok = json.usage ? (json.usage.total_tokens || 0) : 0;
    const tex = pickLatex(raw);
    if (!tex) return { error: '模型只回了说明文字，没给 LaTeX' };
    if (/^EMPTY$/i.test(tex)) return { error: '没识别到内容：写大一点、写清楚一点再试' };
    if (ch && ch.finish_reason === 'length') return { error: '输出被截断（公式太长），重写一次' };
    return { tex: cleanTex(tex), conf: null, tok: tok || null };
  }

  // 自建服务没有统一契约，就往常见的几个位置找；找到就用，找不到如实报错。
  function parseCustom(json) {
    if (typeof json === 'string') return json.trim() ? { tex: cleanTex(json), conf: null } : { error: '空返回' };
    if (!json || typeof json !== 'object') return { error: '返回内容不是 JSON' };
    const pools = [json, json.res, json.data, json.result, json.ocr, json.data && json.data.res];
    for (const o of pools) {
      if (!o || typeof o !== 'object') continue;
      const t = o.latex || o.LaTeX || o.tex || o.text || o.formula;
      if (t) return { tex: cleanTex(t), conf: o.conf != null ? +o.conf : (o.confidence != null ? +o.confidence : null) };
    }
    return { error: json.message || json.msg || json.error || '返回里找不到 latex 字段' };
  }

  function httpError(status, body) {
    let msg;
    if (status === 401 || status === 403) msg = '密钥无效或没有权限（HTTP ' + status + '）';
    else if (status === 429) msg = '调用太频繁、或这一档额度用完了（HTTP 429）';
    else if (status >= 500) msg = '服务端出错（HTTP ' + status + '），过一会儿再试';
    else msg = '接口返回 HTTP ' + status;
    const brief = String(body || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    return brief ? msg + '：' + brief : msg;
  }

  function defaultTransport(o) {
    if (window.gewu && typeof window.gewu.ocrRequest === 'function') return window.gewu.ocrRequest(o);
    // 浏览器直连（开发/探针环境）：识别服务多半不给 CORS，这里如实说明，
    // 免得把一个跨域错误说成「密钥错」。
    return fetch(o.url, { method: o.method, headers: o.headers, body: fromB64(o.body) })
      .then(async (r) => ({ ok: true, status: r.status, body: await r.text() }))
      .catch((e) => ({ ok: false, error: e.message + '（浏览器直连被跨域拦截，正式版走主进程）' }));
  }
  let TRANSPORT = defaultTransport;

  async function callProvider(cfg, png) {
    const req = buildRequest(cfg, png);
    const res = await TRANSPORT({ url: req.url, method: 'POST', headers: req.headers, contentType: req.contentType, body: b64(req.body) });
    if (!res || res.ok === false) return { error: (res && res.error) || '网络请求失败' };
    if (!(res.status >= 200 && res.status < 300)) return { error: httpError(res.status, res.body) };
    let json;
    try { json = JSON.parse(res.body); } catch (_) { return { error: '返回不是 JSON：' + String(res.body || '').slice(0, 120) }; }
    if (cfg.provider === 'deepseek') return parseDeepseek(json);
    if (cfg.provider === 'mathpix') return parseMathpix(json);
    if (cfg.provider === 'simpletex') return parseSimpleTex(json);
    return parseCustom(json);
  }

  // 通用问答：给一张图 + 系统提示，要回纯文本（板书排版用它，不复用上面那条「只回 LaTeX」的提示）。
  // 只有 deepseek 与 custom（OpenAI 兼容）支持；simpletex / mathpix 的接口只回单条公式，排不了整版。
  async function ask(png, sys, user, opt) {
    if (GW.ai && GW.aicfg) return GW.ai.ask(png, sys, user, opt);
    const cfg = config();
    const o = opt || {};
    if (!cfg.key) return { error: '还没填识别服务的 Key' };
    if (cfg.provider === 'simpletex' || cfg.provider === 'mathpix') {
      return { error: '这个服务只返回单条公式，不支持整版排版；请在识别服务设置里切到 DeepSeek 或自建接口' };
    }
    const url = (cfg.endpoint || '').trim() || PROVIDERS[cfg.provider].endpoint;
    const body = {
      model: cfg.provider === 'deepseek' ? DS_MODEL : (o.model || 'gpt-4o-mini'),
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: [
          { type: 'text', text: user },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64(png) } },
        ] },
      ],
      max_tokens: o.maxTokens || 1600,
      temperature: o.temperature != null ? o.temperature : 0.1,
      stream: false,
      thinking: { type: 'disabled' },
    };
    if (o.json) body.response_format = { type: 'json_object' };
    const req = { url, method: 'POST', headers: { Authorization: 'Bearer ' + cfg.key }, contentType: 'application/json', body: b64(new TextEncoder().encode(JSON.stringify(body))) };
    const res = await TRANSPORT(req);
    if (!res || res.ok === false) return { error: (res && res.error) || '网络请求失败' };
    if (!(res.status >= 200 && res.status < 300)) return { error: httpError(res.status, res.body) };
    let json;
    try { json = JSON.parse(res.body); } catch (_) { return { error: '返回不是 JSON：' + String(res.body || '').slice(0, 120) }; }
    const msg = json && json.choices && json.choices[0] && json.choices[0].message;
    if (!msg) return { error: (json && json.error && (json.error.message || json.error)) || '返回里没有 choices' };
    const tok = json.usage && json.usage.total_tokens;
    return { text: String(msg.content || ''), tok: tok || null };
  }

  // ---------- 落地成 formula 对象 ----------
  // 尺寸沿用 importer.js 里 formulaEditor 的量法（48px 隐藏 div 里渲染一遍再读 scrollWidth），
  // 这样手写插入的公式和菜单插入的公式在画布上一样大、一样能双击再编辑。
  function insert(tex) {
    const t = String(tex || '').trim();
    if (!t) return null;
    const tmp = h('div', { style: { position: 'absolute', visibility: 'hidden', fontSize: '48px' } });
    document.body.append(tmp);
    try { window.katex.render(t, tmp, { displayMode: true, throwOnError: false }); } catch (_) { /* 渲染失败也照样插入，后面还能改 */ }
    const w = (tmp.scrollWidth || 240) + 20;
    const hh = (tmp.scrollHeight || 80) + 10;
    tmp.remove();
    const s = GW.camera.s;
    return GW.objects.create('formula', { tex: t, color: GW.tool.pen.color, handwritten: true },
      { w: w / s, h: hh / s, exact: true });
  }

  // ---------- 公式书写板 ----------
  const PAD_W = 900, PAD_H = 260;

  function openPad() {
    const cfg0 = config();
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    const cv = h('canvas', { class: 'hw-canvas' });
    cv.width = PAD_W * DPR;
    cv.height = PAD_H * DPR;
    cv.style.width = PAD_W + 'px';
    cv.style.height = PAD_H + 'px';
    const g = cv.getContext('2d');
    g.scale(DPR, DPR);

    const strokes = [];
    let cur = null;
    let timer = 0;
    let lastTex = '';
    let busy = false;
    let dead = false;

    const hint = h('span', { class: 'hw-hint' }, '在框内手写公式，停笔约 0.7 秒自动识别');
    const prev = h('div', { class: 'fx-prev hw-prev' }, hint);
    const status = h('div', { class: 'hw-status' }, '');
    const setStatus = (msg, kind) => { status.textContent = msg || ''; status.className = 'hw-status' + (kind ? ' ' + kind : ''); };

    // 画布：两条淡基准线 —— 「写在基线上」比「在框里随便写」的识别率高，
    // 这条线是给老师看的书写提示，不进 PNG。
    const drawPath = (pts) => {
      if (!pts.length) return;
      if (pts.length === 1) {
        g.beginPath();
        g.arc(pts[0].x, pts[0].y, 1.8, 0, 6.2832);
        g.fill();
        return;
      }
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.stroke();
    };
    const redraw = () => {
      g.clearRect(0, 0, PAD_W, PAD_H);
      g.fillStyle = '#fff';
      g.fillRect(0, 0, PAD_W, PAD_H);
      g.setLineDash([7, 7]);
      g.lineWidth = 1;
      g.strokeStyle = '#d9e4ef';
      g.beginPath(); g.moveTo(18, PAD_H * 0.70); g.lineTo(PAD_W - 18, PAD_H * 0.70); g.stroke();
      g.strokeStyle = '#eef4f9';
      g.beginPath(); g.moveTo(18, PAD_H * 0.50); g.lineTo(PAD_W - 18, PAD_H * 0.50); g.stroke();
      g.setLineDash([]);
      g.strokeStyle = '#1b2433';
      g.fillStyle = '#1b2433';
      g.lineWidth = 3.2;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const s of strokes) drawPath(s.pts);
    };

    const at = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      cur = { pts: [at(e)] };
      strokes.push(cur);
      clearTimeout(timer);
      redraw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const p = at(e);
      const last = cur.pts[cur.pts.length - 1];
      if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 1.2) return;
      cur.pts.push(p);
      redraw();
    });
    const endStroke = () => {
      if (!cur) return;
      cur = null;
      clearTimeout(timer);
      if (!strokes.length) return;
      timer = setTimeout(() => { recognize(); }, 700);
    };
    cv.addEventListener('pointerup', endStroke);
    cv.addEventListener('pointercancel', endStroke);

    const renderPreview = (tex) => {
      prev.textContent = '';
      try { window.katex.render(tex, prev, { displayMode: true, throwOnError: false }); } catch (_) { prev.textContent = tex; }
    };

    async function recognize() {
      if (dead || busy || !strokes.length) return { error: '没有笔迹' };
      const cfg1 = config();

      if (cfg1.provider !== 'custom' && !cfg1.key) {
        setStatus('先在下面「识别服务设置」里填 API Key', 'err');
        return { error: 'no-key' };
      }
      busy = true;
      setStatus('识别中…', 'busy');
      try {
        const png = await renderPng(strokes);
        if (!png) return { error: '笔迹为空' };
        const r = await callProvider(cfg1, png);
        if (dead) return r;
        if (r.tex) {
          lastTex = r.tex;
          renderPreview(r.tex);
          setStatus('识别完成' + (r.conf != null ? ' · 置信度 ' + Math.round(r.conf * 100) + '%' : '') + (r.tok ? ' · ' + r.tok + ' tokens' : '') + ' · 不对就改笔迹重写', 'ok');
        } else {
          lastTex = '';
          setStatus(r.error || '没识别出来', 'err');
        }
        return r;
      } catch (e) {
        if (!dead) setStatus('识别失败：' + e.message, 'err');
        return { error: e.message };
      } finally {
        busy = false;
      }
    }

    // ---- 识别服务设置 ----
    const sel = h('select', { class: 'hw-input' },
      Object.keys(PROVIDERS).map((k) => h('option', { value: k, selected: k === cfg0.provider }, PROVIDERS[k].label)));
    const keyIn = h('input', { class: 'hw-input', type: 'password', autocomplete: 'off', placeholder: '粘贴 API Key（只存在本机）', value: cfg0.key || '' });
    const idIn = h('input', { class: 'hw-input', type: 'text', autocomplete: 'off', placeholder: 'app_id（Mathpix 用）', value: cfg0.appId || '' });
    const urlIn = h('input', { class: 'hw-input', type: 'text', autocomplete: 'off', placeholder: 'https://…', value: cfg0.endpoint || '' });
    const provHint = h('p', { class: 'muted hw-provhint' }, PROVIDERS[cfg0.provider].hint);
    const rowId = h('div', { class: 'hw-row' }, h('label', null, 'APP ID'), idIn);
    const rowUrl = h('div', { class: 'hw-row' }, h('label', null, '接口地址'), urlIn);
    const syncRows = () => {
      const p = sel.value;
      rowId.style.display = p === 'mathpix' ? '' : 'none';
      rowUrl.style.display = p === 'custom' ? '' : 'none';
      urlIn.placeholder = p === 'custom' ? 'https://你的服务/api/latex_ocr' : '';
      provHint.textContent = PROVIDERS[p].hint;
    };
    sel.addEventListener('change', syncRows);
    const readPanel = () => Object.assign(config(), { provider: sel.value, key: keyIn.value.trim(), appId: idIn.value.trim(), endpoint: urlIn.value.trim() });

    const saveBtn = h('button', { class: 'gw-btn', onclick: () => { saveConfig(readPanel()); setStatus('识别服务设置已保存', 'ok'); } }, '保存');
    const testBtn = h('button', { class: 'gw-btn', onclick: async () => {
      const c = readPanel();
      saveConfig(c);

      if (c.provider !== 'custom' && !c.key) return setStatus('先填 API Key', 'err');
      setStatus('测试连接中…', 'busy');
      // 用一张画着 "x" 的小图打一次真实请求：只关心「通不通」，不关心认出什么。
      const cv2 = document.createElement('canvas');
      cv2.width = 240; cv2.height = 120;
      const g2 = cv2.getContext('2d');
      g2.fillStyle = '#fff'; g2.fillRect(0, 0, 240, 120);
      g2.fillStyle = '#111'; g2.font = '64px serif'; g2.fillText('x', 88, 92);
      const blob = await new Promise((res) => cv2.toBlob(res, 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const r = await callProvider(c, bytes);
      if (r.tex) setStatus('连接正常，返回：' + r.tex, 'ok');
      else setStatus('连接失败：' + (r.error || '未知错误'), 'err');
    } }, '测试');
    const clearBtn = h('button', { class: 'gw-btn', onclick: () => {
      strokes.length = 0; cur = null; lastTex = ''; clearTimeout(timer);
      prev.textContent = ''; prev.append(hint);
      redraw(); setStatus('', '');
    } }, '清空');
    const nowBtn = h('button', { class: 'gw-btn primary', onclick: () => { clearTimeout(timer); recognize(); } }, '立即识别');

    const cfgBox = h('details', { class: 'hw-cfg' },
      h('summary', null, '识别服务设置（需要你自己申请 API Key）'),
      h('div', { class: 'hw-row' }, h('label', null, '服务'), sel),
      h('div', { class: 'hw-row' }, h('label', null, 'API Key'), keyIn),
      rowId, rowUrl,
      h('div', { class: 'hw-row hw-cfgbtns' }, saveBtn, testBtn),
      provHint);
    syncRows();
    // 1.0.13 修：没填 Key 时立刻把「识别服务设置」展开并给出可执行提示。
    // 以前打开写板一切正常、但一落笔就只报「先在下面填 Key」，老师容易以为是「点了没反应」。
    if (cfg0.provider !== 'custom' && !cfg0.key) {
      cfgBox.open = true;
      setStatus('还没有填 API Key —— 在下方「识别服务设置」里粘贴后点保存；DeepSeek 有免费额度', 'err');
      try { setTimeout(() => keyIn.focus(), 120); } catch (_) {}
    }

    const body = h('div', { class: 'hw' },
      h('div', { class: 'hw-board' }, cv),
      prev,
      h('div', { class: 'hw-bar' }, status, h('div', { class: 'hw-tools' }, clearBtn, nowBtn)),
      cfgBox);

    const dlg = GW.dialog({
      title: '手写公式（在线识别）',
      width: 980,
      body,
      ok: '插入公式',
      onOk() {
        if (!lastTex) { GW.toast('还没有识别结果'); return false; }
        insert(lastTex);
        GW.toast('已插入公式');
      },
      onClose() {
        dead = true;
        clearTimeout(timer);
      },
    });

    redraw();
    setTimeout(() => { try { cv.focus(); } catch (_) {} }, 50);

    return {
      canvas: cv,
      strokes,
      addStroke(pts) { strokes.push({ pts: pts.slice() }); redraw(); },
      recognize,
      clear: () => clearBtn.click(),
      tex: () => lastTex,
      insert: () => (lastTex ? insert(lastTex) : null),
      save: () => { saveConfig(readPanel()); },
      statusEl: status,
      previewEl: prev,
      close: () => dlg.close(),
    };
  }

  // ---------- 快捷键 ----------
  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey && e.shiftKey) || String(e.key).toLowerCase() !== 'f') return;
    if (document.querySelector('.dlg-wrap')) return;       // 已有弹窗时不抢
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    e.preventDefault();
    openPad();
  }, true);

  GW.ocr = {
    providers: PROVIDERS,
    config,
    canAsk: () => GW.aicfg ? (GW.aicfg.provider() === 'custom' || GW.aicfg.has()) : !!config().key,
    saveConfig,
    // 探针/自测用：换掉传输层，不真的联网也能跑完整条链路
    setTransport(fn) { TRANSPORT = typeof fn === 'function' ? fn : defaultTransport; },
    renderPng,
    insert,
    openPad,
    cleanTex,
    callProvider,
    ask,
  };
})();
