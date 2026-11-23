/* =============================================================
 * AI 中心（1.4.0）
 *   GW.ai     = { open, ask, selection, act, freeWeb, panel }
 *   GW.aicfg  = { PROVIDERS, config, save, provider, model, key, has }
 *
 * 1.4.0 起，画布上所有 AI 能力只走这一个入口：
 *   · 模型与密钥：国内外常用「付费 / 按次」大模型，每家一个 Key、各自记模型名
 *   · 免费网页版：不用 Key，复制提示词 → 网页里问 → 粘回回答（原「免费网页版 AI」搬进来）
 *   · AI 工具：手写公式、框选识别、框选规整、板书排版、出题/批改/要点/讲解/讲义/画图/化学/错题本/AI 节点
 *
 * 请求仍走主进程转发（window.gewu.ocrRequest），避免 CORS；浏览器版直连。
 * 各家的差别只有三件事：端点、鉴权头、请求/回包形状 —— 全部收在这一个文件里。
 * ============================================================= */
(function () {
  if (!window.GW || window.GW.ai) return;
  const GW = window.GW;
  const h = GW.h;

  // 审计 F26③：密钥（keys[provider]）以**明文** JSON 存在 localStorage 的 'gewu.ai' 里，
  // 属已知风险（同源脚本 / 本地 profile 都能读到）。改存储介质属于架构改动，本版不做；
  // 这里只保证「日志、错误消息、界面回显」里不出现密钥明文（见下面的 redact()）。
  // 注意：gewu.* 键前缀是冻结契约（老版本迁移与 storage.js 都认它），不得改动。
  const KEY = 'gewu.ai';
  const LEGACY_KEY = 'gewu.ocr';        // 1.3.x 的识别服务设置：Key 直接搬过来，不让人重填
  const DEF = {
    provider: 'deepseek',
    model: '',                          // 空 = 用该服务商默认模型
    keys: {},                           // { provider: key }
    endpoint: '',                        // 自建 / OpenAI 兼容端点
    models: {},                          // { provider: model }
    grade: '高一',
    subject: '数学',
  };

  // ---- 服务商清单 ----------------------------------------------------
  // shape: openai = /v1/chat/completions 兼容；anthropic / gemini 各一套
  const PROVIDERS = {
    deepseek: {
      label: 'DeepSeek（国内，最便宜）',
      shape: 'openai',
      endpoint: 'https://api.deepseek.com/chat/completions',
      models: ['deepseek-flash', 'deepseek-v4-pro'],
      hint: 'platform.deepseek.com 创建 Key。deepseek-flash（V4.1-Flash-1017）便宜且能看图，deepseek-v4-pro（V4-Pro-0813）不支持看图；两者都 1M 上下文。deepseek-chat / deepseek-reasoner 已于 2026-07-24 退役，不要再填。',
    },
    doubao: {
      label: '豆包 · 火山方舟（国内）',
      shape: 'openai',
      endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      models: ['doubao-seed-2-1-pro', 'doubao-seed-2-1-turbo', 'doubao-seed-evolving'],
      hint: 'console.volcengine.com/ark 开通后创建 API Key；模型名填「接入点 ID」或上面的模型名（2.1 代只在国内站，国际站叫 seed-*）。',
    },
    kimi: {
      label: 'Kimi · 月之暗面（国内）',
      shape: 'openai',
      endpoint: 'https://api.moonshot.cn/v1/chat/completions',
      models: ['kimi-k3.1-pro', 'kimi-k3', 'kimi-k2.7-code'],
      hint: 'platform.moonshot.cn 创建 Key；K3 系列 1M 上下文，K2 系列 2026 年底下线，尽量别再用。',
    },
    qwen: {
      label: '通义千问 · 阿里云（国内）',
      shape: 'openai',
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      models: ['qwen3.8-flash', 'qwen3.8-max', 'qwen3.8-plus'],
      hint: 'bailian.console.aliyun.com 创建 API Key；qwen3.8-flash 是多模态（1M 上下文），看图直接用它。',
    },
    glm: {
      label: '智谱 GLM（国内）',
      shape: 'openai',
      endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      models: ['glm-5.3', 'glm-5.3-flash', 'glm-5.2'],
      hint: 'bigmodel.cn 用户中心创建 Key；glm-5.3 只吃文本、始终开思考（1M 上下文），看图请换 glm-ocr 或别家。',
    },
    openai: {
      label: 'OpenAI（国外，需自备网络）',
      shape: 'openai',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      models: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-4.1-mini'],
      hint: 'platform.openai.com 创建 Key；国内直连通常不通，可填下面的自建端点做代理。',
    },
    claude: {
      label: 'Claude · Anthropic（国外）',
      shape: 'anthropic',
      endpoint: 'https://api.anthropic.com/v1/messages',
      models: ['claude-opus-5', 'claude-sonnet-5'],
      hint: 'console.anthropic.com 创建 Key；opus-5 是现行旗舰（$5/$25 每百万 token），国内直连通常不通，可填自建端点做代理。',
    },
    gemini: {
      label: 'Gemini · Google（国外）',
      shape: 'gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      models: ['gemini-3.6-flash', 'gemini-3.5-pro', 'gemini-3.5-flash'],
      hint: 'aistudio.google.com 创建 Key；3.6 Pro 尚未发布，Pro 仍是 3.5。端点填到 /v1beta/models 为止，模型名会自动拼进 URL。',
    },
    custom: {
      label: '自建 / 其他 OpenAI 兼容服务',
      shape: 'openai',
      endpoint: '',
      models: [],
      hint: '任何 OpenAI 兼容端点（新版 vLLM、one-api、各类中转）。填完整 URL，Key 可留空。',
    },
  };

  // ---- 配置 ----------------------------------------------------------
  function readRaw() {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { c = null; }
    if (!c || typeof c !== 'object') {
      c = {};
      // 老版本把 Key 存在 gewu.ocr 里（provider/key/appId/endpoint），迁移一次
      try {
        const o = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
        if (o && typeof o === 'object' && PROVIDERS[o.provider]) {
          const p = PROVIDERS[o.provider] ? o.provider : 'deepseek';
          if (o.key) { c.keys = {}; c.keys[p] = String(o.key); }
          if (o.endpoint) c.endpoint = String(o.endpoint);
          c.provider = p;
        }
      } catch (_) {}
    }
    return c;
  }
  function config() {
    const raw = readRaw();
    const out = Object.assign({}, DEF, raw);
    out.keys = Object.assign({}, raw && raw.keys);
    out.models = Object.assign({}, raw && raw.models);
    if (!PROVIDERS[out.provider]) out.provider = DEF.provider;
    return out;
  }
  function save(patch) {
    const c = Object.assign(config(), patch || {});
    if (patch && patch.keys) c.keys = Object.assign({}, config().keys, patch.keys);
    if (patch && patch.models) c.models = Object.assign({}, config().models, patch.models);
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (_) {}
    return c;
  }
  function provider() { return config().provider; }
  function key(p) { const c = config(); return String((c.keys || {})[p || c.provider] || '').trim(); }
  function model(p) {
    const c = config(), k = p || c.provider;
    return String((c.models || {})[k] || '') || ((PROVIDERS[k] && PROVIDERS[k].models[0]) || '');
  }
  function has(p) { return !!key(p); }

  // ---- 二进制 / 传输 --------------------------------------------------
  function b64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  // 审计 F26③：错误文案里绝不回显密钥。Gemini 把 Key 放在 URL 的 ?key= 里，浏览器给的
  // fetch 失败文案可能整条带上 URL；服务端的 401 回包也常把 Key 原样回显。这里统一打码。
  function redact(s, secrets, req) {
    let t = String(s == null ? '' : s);
    t = t.replace(/([?&]key=)[^&\s'"]+/gi, '$1***');
    const list = (secrets || []).slice();
    const hs = (req && req.headers) || {};
    Object.keys(hs).forEach((k) => {
      if (/api-key|authorization|token|cookie/i.test(k)) list.push(String(hs[k] == null ? '' : hs[k]));
    });
    list.forEach((v) => {
      const one = String(v == null ? '' : v).trim();
      if (one.length >= 8) t = t.split(one).join('***');
    });
    return t;
  }
  // 审计 F26①：浏览器版直连必须自带超时。没有 AbortController 时，一个永不返回的请求会把
  // 整个 AI 面板挂死（「停止」也停不掉 —— 请求根本没结束），只能刷新应用。默认 120 秒，
  // req.timeout 可覆盖；与主进程同口径夹到 1–300 秒（main/main.js:1231 / :1264）。
  const DEF_TIMEOUT = 120000;
  async function defaultTransport(req) {
    const api = window.gewu || {};
    if (api.ocrRequest) return api.ocrRequest(req);
    // 浏览器版直连（没有主进程转发；跨域就要靠服务端允许）
    const ms = Math.min(300000, Math.max(1000, Number(req.timeout) || DEF_TIMEOUT));
    let timer = null, ctl = null;
    try {
      const body = req.body ? Uint8Array.from(atob(req.body), (ch) => ch.charCodeAt(0)) : null;
      const opt = { method: req.method || 'POST', headers: req.headers || {}, body };
      if (typeof AbortController === 'function') { ctl = new AbortController(); opt.signal = ctl.signal; }
      // 超时用 Promise.race 兜住：即便环境里没有 AbortController，也必须能返回可判别的形状，
      // 而不是把面板挂死。先 resolve 再 abort —— 保证赢的是 timeout，不是中断后的 AbortError。
      const guard = new Promise((resolve) => {
        timer = setTimeout(() => {
          resolve({ ok: false, error: 'timeout', aborted: true, timeoutMs: ms });
          if (ctl) { try { ctl.abort(); } catch (_) {} }
        }, ms);
      });
      const run = fetch(req.url, opt).then((r) => r.text().then((t) => ({ ok: true, status: r.status, body: t })));
      return await Promise.race([run, guard]);
    } catch (e) {
      return { ok: false, error: redact(String((e && e.message) || e), [], req) };
    } finally { clearTimeout(timer); }
  }
  let TRANSPORT = defaultTransport;

  // ---- 请求体：三种形状 ----------------------------------------------
  function bodyOf(p, cfg, modelName, sys, user, b64png, o) {
    const opt = o || {};
    const maxTok = opt.maxTokens || 1200;
    const temp = opt.temperature != null ? opt.temperature : 0.2;
    if (p.shape === 'anthropic') {
      return {
        headers: {
          'x-api-key': cfg.key, 'anthropic-version': '2023-06-01',
        },
        body: {
          model: modelName, max_tokens: maxTok,
          temperature: opt.think ? 1 : temp,
          system: sys,
          ...(opt.think ? { thinking: { type: 'enabled', budget_tokens: Math.min(16000, Math.max(1024, o.thinkBudget || (maxTok - 1500))) } } : {}),
          messages: opt.messages && opt.messages.length ? opt.messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: String(m.content || '') })) : [{
            role: 'user',
            content: [
              { type: 'text', text: user },
              b64png ? { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64png } } : null,
            ].filter(Boolean),
          }],
        },
      };
    }
    if (p.shape === 'gemini') {
      const url = p.endpoint.replace(/\/$/, '') + '/' + encodeURIComponent(modelName) + ':generateContent?key=' + encodeURIComponent(cfg.key);
      return {
        url,
        headers: {},
        body: {
          systemInstruction: { parts: [{ text: sys }] },
          contents: opt.messages && opt.messages.length ? opt.messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] })) : [{ role: 'user', parts: [
            { text: user },
            b64png ? { inline_data: { mime_type: 'image/png', data: b64png } } : null,
          ].filter(Boolean) }],
          generationConfig: opt.think
            ? { maxOutputTokens: maxTok, temperature: temp, thinkingConfig: { thinkingBudget: opt.thinkBudget || 2048 } }
            : { maxOutputTokens: maxTok, temperature: temp },
        },
      };
    }
    // OpenAI 兼容（deepseek / 豆包 / Kimi / 千问 / 智谱 / OpenAI / 自建）
    const userParts = [
      { type: 'text', text: user },
      b64png ? { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64png } } : null,
    ].filter(Boolean);
    const msgs = [{ role: 'system', content: sys }];
    if (opt.messages && opt.messages.length) msgs.push.apply(msgs, opt.messages);
    else msgs.push({ role: 'user', content: userParts });
    const body = {
      model: modelName,
      messages: msgs,
      max_tokens: maxTok,
      temperature: temp,
      stream: !!opt.stream,
    };
    if (opt.tools && opt.tools.length) { body.tools = opt.tools; body.tool_choice = opt.toolChoice || 'auto'; }
    // 要结构化结果时一律开 JSON 模式（DeepSeek 也支持；节点 / 规整都靠它拿纯 JSON）
    if (opt.json) body.response_format = { type: 'json_object' };
    if (cfg.provider === 'deepseek') body.thinking = { type: opt.think ? 'enabled' : 'disabled' };
    if (opt.think && cfg.provider === 'openai' && /^(gpt-6|gpt-5|o[1-9])/.test(modelName)) body.reasoning_effort = opt.effort || 'high';
    if (opt.think && cfg.provider === 'qwen') body.enable_thinking = true;
    if (opt.think && cfg.provider === 'glm') body.thinking = { type: 'enabled' };
    if (opt.think && opt.json) delete body.response_format;   // 思考模式与 JSON 模式互斥，改由提示词约束
    return { headers: { Authorization: 'Bearer ' + cfg.key }, body };
  }

  function pickText(json) {
    if (!json) return '';
    if (json.choices && json.choices[0]) {
      const m = json.choices[0].message || json.choices[0];
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) return m.content.map((c) => (c && (c.text || c.content)) || '').join('');
      if (typeof m.text === 'string') return m.text;
    }
    if (json.content && Array.isArray(json.content)) return json.content.map((c) => (c && c.text) || '').join('');
    if (json.candidates && json.candidates[0]) {
      const parts = (json.candidates[0].content || {}).parts || [];
      return parts.map((p) => p && p.text || '').join('');
    }
    return '';
  }
  function errOf(json, status) {
    const e = json && (json.error || json.message);
    if (e) return typeof e === 'string' ? e : (e.message || e.msg || JSON.stringify(e));
    return 'HTTP ' + status;
  }

  // 1.3.18 流式：OpenAI 兼容协议的 SSE（deepseek / 豆包 / Kimi / 通义 / 智谱 / OpenAI / 自建）
  // Anthropic / Gemini 的流式事件结构不同，这一版仍走普通请求（能跑，只是没有逐字输出）。
  function streamOpenAI(req, o, name, modelName) {
    let buf = '';
    let text = '';
    let reasoning = '';
    let error = '';
    const calls = [];
    const feed = (line) => {
      if (!line || line.indexOf('data:') !== 0) return;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') return;
      let j = null;
      try { j = JSON.parse(data); } catch (_) { return; }
      const ch = (j.choices && j.choices[0]) || {};
      const d = ch.delta || {};
      const rc = d.reasoning_content || d.reasoning || '';
      if (rc) { reasoning += rc; if (o.onDelta) o.onDelta('', text, reasoning); }
      if (Array.isArray(d.tool_calls)) {
        d.tool_calls.forEach((t) => {
          const idx = typeof t.index === 'number' ? t.index : 0;
          const cur = calls[idx] || (calls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } });
          if (t.id) cur.id = t.id;
          if (t.function) {
            if (t.function.name && !cur.function.name) cur.function.name = t.function.name;
            if (t.function.arguments) cur.function.arguments += t.function.arguments;
          }
        });
      }
      const piece = typeof d.content === 'string' ? d.content : '';
      if (piece) { text += piece; if (o.onDelta) o.onDelta(piece, text, reasoning); }
      if (j.error) error = errOf(j, 0);
    };
    return window.gewu.aiStream(req, (ev) => {
      if (!ev.chunk) return;
      buf += ev.chunk;
      const NL = String.fromCharCode(10);
      let i;
      while ((i = buf.indexOf(NL)) >= 0) {
        const line = buf.slice(0, i).split(String.fromCharCode(13)).join('');
        buf = buf.slice(i + 1);
        feed(line);
      }
    }).then((res) => {
      if (buf) feed(buf);
      if (!res || res.ok === false) return { error: (res && res.error) || '网络请求失败' };
      if (error) return { error };
      const toolCalls = calls.filter((x) => x && x.function && x.function.name);
      if (!text && !reasoning && !toolCalls.length) return { error: '模型没有返回内容（可能不支持流式，或超时）' };
      return { text, reasoning, toolCalls: toolCalls.length ? toolCalls : null, provider: name, model: modelName, streamed: true };
    });
  }

  // ask(png, sys, user, opt) -> { text } | { error }
  //   png 可以是 Uint8Array（PNG 字节）也可以省略（纯文本问答）
  async function ask(png, sys, user, opt) {
    const o = opt || {};
    const c = config();
    const name = o.provider || c.provider;
    const p = PROVIDERS[name];
    if (!p) return { error: '未知的服务商：' + name };
    const k = key(name);
    if (!k && name !== 'custom') {
      return { error: '「' + p.label + '」还没填 API Key：插入菜单 → AI 助手 → 模型与密钥' };
    }
    const modelName = o.model || model(name);
    if (!modelName && name === 'custom') return { error: '自建服务要填模型名' };
    const bytes = png instanceof Uint8Array ? png : (png ? new Uint8Array(png) : null);
    const b64png = bytes ? b64(bytes) : '';
    const cfg = { key: k, provider: name, endpoint: (c.endpoint || '').trim() };
    const b = bodyOf(p, cfg, modelName, sys, user, b64png, o);
    const url = b.url || ((name === 'custom' ? cfg.endpoint : p.endpoint) || '');
    if (!url) return { error: '这个服务要填端点 URL（自建 / 代理）' };
    const req = {
      url, method: 'POST', headers: b.headers || {},
      contentType: 'application/json',
      timeout: o.timeout,               // 生成图形这类长回答要几十秒到几分钟；主进程按 30–300 秒夹取
      body: b64(new TextEncoder().encode(JSON.stringify(b.body))),
    };
    const bridge = (typeof window !== 'undefined' && window.gewu) || {};
    const hasTools = !!(o.tools && o.tools.length);
    const attempts = [];
    if (o.stream && p.shape === 'openai' && bridge.aiStream) attempts.push({ stream: true, tools: hasTools });
    attempts.push({ stream: false, tools: hasTools });
    if (hasTools) attempts.push({ stream: false, tools: false });
    let lastErr = '';
    for (let i = 0; i < attempts.length; i++) {
      const at = attempts[i];
      const body2 = Object.assign({}, b.body, { stream: at.stream });
      if (at.tools) { body2.tools = o.tools; body2.tool_choice = o.toolChoice || 'auto'; }
      else { delete body2.tools; delete body2.tool_choice; }
      const req2 = Object.assign({}, req, { body: b64(new TextEncoder().encode(JSON.stringify(body2))) });
      if (at.stream) {
        const sr = await streamOpenAI(req2, o, name, modelName);
        if (!sr.error) { sr.fallback = i > 0; sr.toolsDisabled = hasTools && !at.tools; return sr; }
        lastErr = sr.error;
        continue;
      }
      const res = await TRANSPORT(req2);
      // 审计 F26①：超时是硬失败 —— 不能落到下一轮重试（三次尝试会把 120 秒拖成 6 分钟）。
      // 返回可判别形状（aborted/timeout），调用方与面板据此显示「超时」而不是「请求失败」。
      if (res && res.aborted && res.error === 'timeout') return { error: 'timeout', aborted: true, timeoutMs: res.timeoutMs };
      if (!res || res.ok === false) { lastErr = redact((res && res.error) || '网络请求失败', [k], req2); continue; }
      let json = null;
      try { json = JSON.parse(res.body); } catch (_) { lastErr = '返回不是 JSON：' + String(res.body || '').slice(0, 120); continue; }
      if (!(res.status >= 200 && res.status < 300)) { lastErr = errOf(json, res.status); continue; }
      const text = pickText(json);
      const msg = (json.choices && json.choices[0] && json.choices[0].message) || null;
      const toolCalls = (msg && msg.tool_calls) || null;
      const reasoning = (msg && (msg.reasoning_content || msg.reasoning)) || '';
      if (!text && !toolCalls) { lastErr = errOf(json, res.status); continue; }
      return {
        text: String(text || ''), reasoning: String(reasoning || ''), toolCalls,
        provider: name, model: modelName, tok: (json.usage && json.usage.total_tokens) || null,
        fallback: i > 0, toolsDisabled: hasTools && !at.tools,
      };
    }
    // 审计 F26③：把密钥从错误文案里抹掉再往外传（服务端的报错常把 Key 原样回显）
    return { error: redact(lastErr, [k]) || '请求失败' };
}

  // ---- 内部工具：解析 JSON、取选区、提醒 ---------------------------------
  function parseJson(s) {
    let t = String(s || '').trim();
    if (!t) return null;
    if (t.slice(0, 7) === '```json') t = t.slice(7);
    if (t.slice(0, 3) === '```') t = t.slice(3);
    if (t.slice(-3) === '```') t = t.slice(0, -3);
    const i = t.indexOf('{'), j = t.lastIndexOf('}');
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
    try { return JSON.parse(t); } catch (_) { return null; }
  }
  function selStrokes() {
    const items = (GW.selection && GW.selection.items) || [];
    return items.filter((it) => it && it.kind !== 'obj' && Array.isArray(it.pts));
  }
  function needSel() {
    const s = selStrokes();
    if (!s.length) GW.toast('先用「选择」工具框住要处理的内容');
    return s;
  }

  // ---- 框选动作 ------------------------------------------------------
  // 识别公式、规整笔迹、排版板书、截图 —— 都挂在选区工具条上
  const ACTIONS = {
    formula: { label: '识别公式', icon: 'formula', hint: '框选一行手写公式 → 变成可编辑公式对象' },
    text: { label: '转文字', icon: 'text', hint: '框选手写 → 识别成可复制文字（只记在笔迹的 ocr 字段上，不改笔迹）' },
    tidy: { label: 'AI 规整', icon: 'smart', hint: '框选潦草的图/字 → AI 认成规范图形、公式或文字' },
    layout: { label: 'AI 排版', icon: 'text', hint: '框选整块板书 → 一份排好版的讲义' },
    shot: { label: '截图', icon: 'camera', hint: '把框选的内容截成图片' },
  };

  // T01：识别结果面板 —— 文本可改、可复制；改完点「完成」再落一次 ocr。
  // 复制优先 navigator.clipboard，失败（file:// / 没权限 / 老内核）就退回「全选 + Ctrl+C」。
  function textResultPanel(text, strokes) {
    const ta = h('textarea', { class: 'gw-in', style: { width: '100%', height: '124px', resize: 'vertical', lineHeight: '1.55' } });
    ta.value = text;
    let cur = String(text);
    const copyBtn = h('button', {
      class: 'gw-btn',
      onclick: async () => {
        const v = String(ta.value || '');
        try {
          if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard');
          await navigator.clipboard.writeText(v);
          GW.toast('已复制到剪贴板');
        } catch (e) {
          ta.focus();
          ta.select();
          GW.toast('复制失败：已全选，按 Ctrl+C 复制', 2800);
        }
      },
    }, '复制');
    const body = h('div', {},
      h('div', { style: { marginBottom: '8px', fontSize: '12px', opacity: 0.72 } },
        '识别结果只写在笔迹的 ocr 字段上（搜索能搜到），笔迹本身不变。改完点「完成」一起保存。'),
      ta,
      h('div', { style: { marginTop: '8px', display: 'flex', gap: '8px' } }, copyBtn));
    GW.dialog({
      title: '手写转文字', width: 560, body, ok: '完成', cancel: null,
      onOk: () => {
        const v = String(ta.value || '').trim();
        if (!v || v === cur) return true;
        writeOcr(strokes, v);
        cur = v;
        return true;
      },
    });
  }
  function writeOcr(strokes, text) {
    const ups = [];
    for (const it of strokes) {
      if (!it || it.ocr === text) continue;
      const before = GW.clone(it);
      it.ocr = text;
      ups.push({ before, after: it });
    }
    if (ups.length) GW.commit({ update: ups });
    return ups.length;
  }

  async function act(name) {
    if (name === 'formula') {
      const strokes = needSel();
      if (!strokes.length) return null;
      // 笔迹的 pts 是扁平数组 [x0,y0,x1,y1,…]，renderPng 要的是 [{x,y}]，这里转一次。
      // 不转的话包围盒算不出来，整条链会静默返回 null（框选后「点了没反应」）。
      const asXY = (pts) => {
        if (!pts.length) return [];
        if (typeof pts[0] === 'object') return pts;
        const o = [];
        for (let i = 0; i + 1 < pts.length; i += 2) o.push({ x: pts[i], y: pts[i + 1] });
        return o;
      };
      const png = await GW.ocr.renderPng(strokes.map((s) => ({ pts: asXY(s.pts) })));
      if (!png) return null;
      const r = await ask(png, '你是公式识别引擎。把图里的手写公式转成 LaTeX，只回 LaTeX 本身，不要解释、不要 $$。', '识别这个公式');
      if (r.error) { GW.toast(r.error); return null; }
      if (GW.ocr.cleanTex) return GW.ocr.insert(GW.ocr.cleanTex(r.text));
      return null;
    }
    if (name === 'text') {
      const strokes = needSel();
      if (!strokes.length) return null;
      // 没配 Key / 离线：必须明确说「没配置识别服务」，不许安静返回 null。
      if (!GW.ocr || !GW.ocr.canAsk || !GW.ocr.canAsk()) {
        GW.toast('没配置识别服务：插入菜单 → AI 助手 → 模型与密钥', 3600);
        return null;
      }
      const asXY = (pts) => {
        if (!pts || !pts.length) return [];
        if (typeof pts[0] === 'object') return pts;
        const o = [];
        for (let i = 0; i + 1 < pts.length; i += 2) o.push({ x: pts[i], y: pts[i + 1] });
        return o;
      };
      // 复用 formula-ocr 的栅格化：白底黑字、只留包围盒、按高度归一化
      const png = await GW.ocr.renderPng(strokes.map((s) => ({ pts: asXY(s.pts) })));
      if (!png) return null;
      const r = await GW.ocr.ask(
        png,
        '你是手写转写引擎。把图里的手写文字按阅读顺序原样转成纯文本，保留换行；只回文字本身，不要解释、不要 Markdown 围栏、不要加前后缀。',
        '转写这段手写');
      if (!r || r.error) {
        const msg = String((r && r.error) || '');
        if (/还没填|没配置|网络|离线|Failed|fetch|请求失败/i.test(msg)) GW.toast('没配置识别服务：插入菜单 → AI 助手 → 模型与密钥', 3600);
        else GW.toast('识别失败：' + (msg || '没有返回内容'));
        return null;
      }
      const text = String(r.text || '').trim();
      if (!text) { GW.toast('没识别到文字'); return null; }
      writeOcr(strokes, text);
      textResultPanel(text, strokes);
      return text;
    }
    if (name === 'tidy') {
      if (!needSel().length) return null;
      return GW.aiPen && GW.aiPen.tidySelection ? GW.aiPen.tidySelection() : null;
    }
    if (name === 'layout') {
      if (!needSel().length) return null;
      return GW.layout ? GW.layout.convertSelection() : null;
    }
    if (name === 'shot') {
      // 截图：桌面版走系统的区域截图（课堂工具），浏览器版提示用系统截图
      if (GW.classTools && GW.classTools.screenshot) return GW.classTools.screenshot();
      GW.toast('这个版本没有区域截图，用系统截图吧');
      return null;
    }
    return null;
  }

  // ---- 免费网页版（不用 Key）------------------------------------------
  const FREE_SITES = [
    { id: 'deepseek', label: 'DeepSeek 网页版', url: 'https://chat.deepseek.com/' },
    { id: 'doubao', label: '豆包', url: 'https://www.doubao.com/chat/' },
    { id: 'kimi', label: 'Kimi', url: 'https://kimi.moonshot.cn/' },
    { id: 'qwen', label: '通义千问', url: 'https://tongyi.aliyun.com/qianwen/' },
    { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  ];
  function freeWeb() {
    const study = GW.study;
    const tasks = study && study._tasks ? study._tasks() : {};
    const keys = Object.keys(tasks);
    const sel = h('select', { class: 'hw-input', style: { width: '100%' } },
      keys.map((k) => h('option', { value: k }, tasks[k].label)));
    const site = h('select', { class: 'hw-input', style: { width: '100%', marginTop: '6px' } },
      FREE_SITES.map((s) => h('option', { value: s.url }, s.label)));
    const prompt = h('textarea', { class: 'hw-input', style: { width: '100%', height: '120px', marginTop: '8px', fontFamily: 'Consolas, monospace', fontSize: '12px' }, readonly: true });
    const ans = h('textarea', { class: 'hw-input', style: { width: '100%', height: '110px', marginTop: '8px' }, placeholder: '把网页 AI 的回答整段粘回来（带 ```json 围栏也行）' });
    const msg = h('div', { class: 'if-hint', style: { marginTop: '6px' } }, '');
    const fill = () => { const T = tasks[sel.value]; prompt.value = T ? (T.sys + '\n\n' + T.user) : ''; msg.textContent = ''; };
    fill();
    sel.onchange = fill;
    const copyP = () => {
      try {
        Promise.resolve(navigator.clipboard.writeText(prompt.value))
          .then(() => { msg.textContent = '提示词已复制'; })
          .catch(() => { prompt.select(); msg.textContent = '浏览器不让写剪贴板：已全选，按 Ctrl+C'; });
      } catch (_) { prompt.select(); msg.textContent = '已全选，按 Ctrl+C'; }
    };
    const openSite = () => {
      const api = window.gewu || {};
      if (api.openExternal) api.openExternal(site.value);
      else window.open(site.value, '_blank');
      msg.textContent = '已打开网页 AI：把框选的图传上去，再粘贴提示词';
    };
    const saveP = async () => {
      if (!GW.study || !GW.study._saveSelPng) { msg.textContent = '这个版本不能存选区图片，请直接用系统的截图'; return; }
      const p = await GW.study._saveSelPng();
      if (p) msg.textContent = '图片已存到：' + p;
    };
    const d = GW.dialog({
      title: '免费网页版 AI（不用 Key）', width: 660, ok: '生成结果',
      body: h('div', null,
        h('div', { class: 'if-hint', style: { marginBottom: '6px' } }, '① 选任务 → ② 复制提示词 + 存下框选的图 → ③ 网页里上传图片并粘贴提示词 → ④ 把回答粘回来'),
        sel, site,
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' } },
          h('button', { class: 'gw-btn', onclick: copyP }, '复制提示词'),
          h('button', { class: 'gw-btn', onclick: saveP }, '保存框选的图'),
          h('button', { class: 'gw-btn', onclick: openSite }, '打开网页')),
        prompt,
        h('div', { class: 'if-hint', style: { marginTop: '8px' } }, '把回答粘在这里：'),
        ans, msg),
      onOk: () => {
        const o = parseJson(ans.value);
        if (!o) { GW.toast('没看懂粘进来的内容：要的是那段 JSON'); return false; }
        try { if (GW.study && GW.study._land) GW.study._land(tasks[sel.value], o); else GW.toast('这个任务不能直接落地'); }
        catch (e) { GW.toast('没做成：' + ((e && e.message) || e)); return false; }
        return true;
      },
    });
    return d;
  }

  // ---- 主面板 --------------------------------------------------------
  function open() {
    const c = config();
    const p0 = c.provider;
    const provSel = h('select', { class: 'hw-input', style: { width: '100%' } },
      Object.keys(PROVIDERS).map((k) => h('option', { value: k, selected: k === p0 ? 'selected' : null }, PROVIDERS[k].label)));
    const modelIn = h('input', { class: 'hw-input', style: { width: '100%', marginTop: '6px' }, placeholder: '模型名（留空用默认）' });
    const keyIn = h('input', { class: 'hw-input', style: { width: '100%', marginTop: '6px', type: 'password' }, placeholder: 'API Key' });
    const endIn = h('input', { class: 'hw-input', style: { width: '100%', marginTop: '6px' }, placeholder: '端点 URL（自建 / 代理才要改）' });
    const hint = h('div', { class: 'if-hint', style: { marginTop: '6px' } }, '');
    const stat = h('div', { class: 'if-hint', style: { marginTop: '6px' } }, '');
    const showHint = () => {
      const p = PROVIDERS[provSel.value];
      hint.textContent = p.hint;
      modelIn.placeholder = '模型名（留空用 ' + (p.models[0] || '自填') + '）';
      modelIn.value = (config().models || {})[provSel.value] || '';
      keyIn.value = key(provSel.value);
      endIn.value = (provSel.value === 'custom' ? config().endpoint : '') || '';
      provSel.dataset.hint = p.hint;
    };
    provSel.onchange = showHint;
    showHint();

    const testBtn = h('button', { class: 'gw-btn', onclick: async () => {
      stat.textContent = '正在测试…';
      const r = await ask(null, '只回四个字：连接成功', '现在几点了？随便回一句');
      stat.textContent = r.error ? ('✗ ' + r.error) : ('✓ ' + r.provider + ' / ' + r.model + ' 可用');
    } }, '测试连接');

    const saveBtn = h('button', { class: 'gw-btn primary', onclick: () => {
      const pv = provSel.value;
      save({
        provider: pv,
        endpoint: endIn.value.trim(),
        models: { [pv]: modelIn.value.trim() },
        keys: { [pv]: keyIn.value.trim() },
      });
      stat.textContent = '已保存（' + PROVIDERS[pv].label + '）';
    } }, '保存');

    const tools = [
      ['AI 对话（全能力）', '多轮 + 流式 + 深度思考 + 直接调图形库画到画布上', () => (GW.aiChat && GW.aiChat.open())],
      ['手写公式（写板）', '在写板上逐符号写，左右两栏一边写一边看候选', () => (GW.formulaPadPick ? GW.formulaPadPick() : GW.ocr.openPad())],
      ['识别公式（框选）', '框住一行手写公式 → 直接变公式对象', () => act('formula')],
      ['AI 规整（框选）', '框住潦草图形 / 字迹 → 规范图形、公式或文字', () => act('tidy')],
      ['AI 排版板书（框选）', '框住整块板书 → 排好版的讲义（可设置样式）', () => act('layout')],
      ['出题 / 批改 / 要点 / 讲解', 'AI 学习工具：出题、批改作业、课堂要点、分步讲解', () => (GW.study && GW.study.open())],
      ['导出讲义（HTML / Word）', '把画布上的文字和公式排成文档', () => (GW.study && GW.study.exportNotes())],
      ['手写函数 → 画图', '框住手写函数式 → 画曲线', () => (GW.study && GW.study.plot())],
      ['化学式（mhchem）', '2H2 + O2 -> 2H2O 自动排版', () => (GW.study && GW.study.chem())],
      ['错题本', '查看自动归档的错题', () => (GW.study && GW.study.mistakes())],
      ['AI 节点', '在画布上放一个 AI 节点，选模型、写提示词', () => (GW.nodes && GW.nodes.openPicker())],
      // 自定义图形入口已移到「AI 助手 · 统一对话」底部按钮（1.4.2），这里不再重复

    ];

    const btn = (t, sub, fn) => h('button', {
      class: 'gw-btn', style: { display: 'block', width: '100%', textAlign: 'left', marginBottom: '6px', padding: '8px 12px' },
      onclick: () => { d.close(); setTimeout(fn, 60); },
    }, h('b', null, t), sub ? h('div', { class: 'if-hint', style: { marginTop: '2px' } }, sub) : null);

    const d = GW.dialog({
      title: 'AI 设置与工具', width: 660, noFooter: true,
      body: h('div', null,
        h('div', { class: 'if-hint', style: { marginBottom: '6px' } }, '① 模型与密钥（付费 / 按次，填一次即可）'),
        provSel, modelIn, keyIn, endIn,
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } }, saveBtn, testBtn),
        hint, stat,
        h('div', { class: 'if-hint', style: { margin: '14px 0 6px' } }, '② 免费网页版（不用 Key）'),
        btn('免费网页版 AI…', '复制提示词 → 网页里问 → 粘回回答', freeWeb),
        h('div', { class: 'if-hint', style: { margin: '14px 0 6px' } }, '③ AI 工具（框选类要先框住内容）'),
        tools.map((t) => btn(t[0], t[1], t[2])),
        h('div', { class: 'if-hint', style: { marginTop: '10px' } }, '年级/学科（出题、批改用它判断难度）：'),
        h('div', { style: { display: 'flex', gap: '8px' } },
          h('input', { class: 'hw-input', value: c.grade || '高一', style: { width: '120px' }, onchange: (e) => save({ grade: e.target.value.trim() || '高一' }) }),
          h('input', { class: 'hw-input', value: c.subject || '数学', style: { width: '120px' }, onchange: (e) => save({ subject: e.target.value.trim() || '数学' }) }))),
    });
    return d;
  }

  // 1.3.18 能力表：界面按它显示「这家能干什么」，代码按它决定要不要开流式 / 工具 / 思考
  function caps(pv, md) {
    const p = PROVIDERS[pv || config().provider] || {};
    const m = String(md || model(pv) || '').toLowerCase();
    // 也接受协议名（anthropic / gemini），能力表必须与真正实现的协议一致，
    // 不能因为「OpenAI 兼容」就声称支持工具与流式。
    const shape = p.shape || (pv === 'anthropic' || pv === 'gemini' ? pv : 'openai');
    return {
      shape,
      vision: shape !== 'openai' || !/^(deepseek-v4-pro|o[1-9]|glm-5\.3$)/.test(m),
      think: true,
      tools: shape === 'openai',
      stream: shape === 'openai',
      maxOut: shape === 'openai' ? 8192 : 8192,
      longCtx: true,
    };
  }
  GW.aicfg = { PROVIDERS, config, save, provider, model, key, has, FREE_SITES, caps };
  GW.ai = {
    open: () => GW.aiChat ? GW.aiChat.open() : open(),
    openConfig: open,
    ask,
    act,
    freeWeb,
    selection: ACTIONS,
    setTransport(fn) { TRANSPORT = typeof fn === 'function' ? fn : defaultTransport; },
    caps,
    _parseJson: parseJson,
    _bodyOf: bodyOf,
    // 审计 F26 自检钩子（scripts/check-audit-ai.js 直接调这两个，测的是磁盘上这份实现）
    _transport: defaultTransport,
    _redact: redact,
    _pickText: pickText,
  };
})();

