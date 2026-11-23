/* AI 选区识别引擎（原 AI 智能笔）—— core/ai-pen.js
 *
 * 「边画边转」：笔停在原地约 0.9 秒，把刚画的一簇笔迹交给 DeepSeek（V4.1-Flash）看，
 * 认成公式就落成可编辑公式，认成示意图就落成学科模板 / 规范折线图，然后把原笔迹撤掉。
 * 一次 Ctrl+Z 退回手写，所以「转错了」不会毁掉板书。
 *
 * 一、为什么不做「真·逐笔实时」
 *   每笔都发一次请求，一分钟几十次、每次几百毫秒，画到一半就被替换，比手写还慢；
 *   而且单笔的信息量不足以判断「这是斜面」还是「一条斜线」。这里用「笔迹块」：
 *   同一簇（包围盒相距不到 80 屏幕像素）的笔迹攒在一起，停手 0.9 秒才发一次。
 *
 * 二、为什么模型只回归一化坐标
 *   模型不知道画布的世界坐标，也不该知道。它把图形画在 0..1 的方框里，
 *   我们按这簇笔迹的真实包围盒映射回画布 —— 位置永远对得上，认错也只是形状不对。
 *   模板 / 仿真的 id 一律拿清单做白名单校验，模型不可能让我们插入不存在的东西。
 *
 * 三、落地规则（安全边界）
 *   · conf >= 0.6 且 kind 有效：直接替换（addItems 不记历史，removeItems 记一次 ⇒ 单步撤销）；
 *   · conf 不够或 kind=none：保留手写，底部弹一条「认成『斜面』？点这里换」的浮条，点才换；
 *   · 任何解析失败 / 网络失败：一律保留手写，只提示，不动画布。
 *
 * 四、入口（1.4.0 起只剩框选）
 *   · 框选笔迹 → 选区工具条「AI 规整」或「插入 → AI 助手」→ AI 规整；
 *   · 原「AI 笔」书写模式（边画边转）已按用户要求删除，识别内核保留给框选用；
 *   · 快捷键：选中笔迹后按 Alt+G 直接规整。
 */
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW) return;
  const h = GW.h;

  const AI_CFG = 'gewu.aipen';
  const DS_URL = 'https://api.deepseek.com/chat/completions';
  const DS_MODEL = 'deepseek-flash';
  const IDLE_MS = 900;      // 停手多久开始转
  const GAP_PX = 80;        // 新一笔离上一簇超过这么远（屏幕像素）就算另一块
  const AUTO_CONF = 0.6;    // 到这个把握才自动替换，否则弹浮条让老师点

  function config() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(AI_CFG) || '{}') || {}; } catch (_) { c = {}; }
    
    return Object.assign({ key: '', auto: true }, c);
  }
  function saveConfig(patch) {
    const c = Object.assign(config(), patch || {});
    try { localStorage.setItem(AI_CFG, JSON.stringify(c)); } catch (_) {}
    return c;
  }
  // 1.4.0：Key 只在「插入 → AI 助手」里配一处，这里问 AI 中心要，不再自己存一份。
  function apiKey() {
    if (GW.aicfg && GW.aicfg.has && GW.aicfg.has()) return String(GW.aicfg.key() || '').trim();
    const c = config();
    return c.key ? String(c.key).trim() : '';
  }

  // ---------- 二进制 ----------
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
  function defaultTransport(o) {
    if (window.gewu && typeof window.gewu.ocrRequest === 'function') return window.gewu.ocrRequest(o);
    return fetch(o.url, { method: o.method, headers: o.headers, body: fromB64(o.body) })
      .then(async (r) => ({ ok: true, status: r.status, body: await r.text() }))
      .catch((e) => ({ ok: false, error: e.message }));
  }
  let TRANSPORT = defaultTransport;

  // ---------- 笔迹小工具（画布笔迹的 pts 是扁平的 [x,y,x,y,…]）----------
  function pairsOf(pts) {
    const out = [];
    for (let i = 0; i + 1 < pts.length; i += 2) out.push({ x: pts[i], y: pts[i + 1] });
    return out;
  }
  function bboxOf(strokes) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const s of strokes) {
      const p = s.pts || [];
      for (let i = 0; i + 1 < p.length; i += 2) {
        if (p[i] < x1) x1 = p[i];
        if (p[i] > x2) x2 = p[i];
        if (p[i + 1] < y1) y1 = p[i + 1];
        if (p[i + 1] > y2) y2 = p[i + 1];
      }
    }
    if (!isFinite(x1)) return null;
    return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
  }

  function gapPx(a, b) {
    const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
    const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
    return Math.hypot(dx, dy) * (GW.camera.s || 1);
  }

  // ---------- 提示词 ----------
  const SYS = [
    '你是中学数学 / 物理课堂的板书识别引擎。用户给你一张手绘草图：可能是一条公式，可能是一幅示意图。',
    '只输出一个 JSON 对象，不要解释，不要 markdown 代码块。字段如下：',
    '{"kind":"formula|text|stencil|sim|figure|none", "conf":0到1的小数, "caption":"中文短语，说明你认成了什么",',
    ' "tex":"kind=formula 时的 LaTeX", "text":"kind=text 时逐字转写的文字（多行用 \\n 分隔）",',
    ' "id":"kind=stencil/sim 时从清单里选的 id",',
    ' "segs":[[x1,y1,x2,y2,…]], "arrows":[[x1,y1,x2,y2]], "labels":[{"x":0.3,"y":0.9,"t":"m"}]}',
    '判断规则：',
    '1. 含等号 / 分式 / 根号 / 上下标，明显是数学式子 → formula，tex 里给完整 LaTeX，不要 $ 包裹。',
    '1b. 写的是汉字 / 英文 / 数字，成句、成词，不是数学式子 → text：**逐字转写**，不许改错别字、不许补标点、',
    '   不许润色、不许把多行并成一行；每行原样用 \\n 分隔。看不清的字用「□」占位，不要猜。',
    '2. 画的是示意图（斜面、电路、透镜、滑轮、坐标轴、容器、受力图、波形…）→ 先到清单里找最接近的模板，选 stencil，id 用清单里的。',
    '2b. 只要清单里有一个「大致对得上」的模板，就必须用模板，不要自己画；教材插图几乎都有对应模板。',
    '3. 清单里只有「能交互演示」的仿真对应得上 → sim。',
    '4. 清单里确实找不到 → figure：**只画骨架**（几条直线 + 箭头 + 字母），不要描细节、不要反复描边、不要画阴影和填色。',
    '   坐标归一化到 0..1（左上角是 0,0，右下角是 1,1）。直线给两个点，曲线给 0..1 之间 8~12 个点。',
    '   方向量（力、速度、光线、电流）放 arrows；字母标注放 labels。折线最多 24 条、每条最多 200 个数字。',
    '   本地会把你的折线拉直、把近似圆整成圆、把端点对齐，所以你只要把「形状和位置」画对，不必画得平。',
    '5. 什么都认不出 → kind:"none"，conf 给低分。',
    '6. conf 表示「这条结果能不能直接拿去上课」，拿不准就写 0.4 以下，不要虚报。',
  ].join('\n');

  function catalog() {
    const st = ((GW.stencils && GW.stencils.list) || []).map((s) => s.id + '=' + s.label + '（' + s.group + '）');
    const sim = Object.keys(GW.sims || {}).map((k) => k + '=' + ((GW.sims[k] && GW.sims[k].name) || k));
    return '模板：' + st.join('；') + '\n仿真：' + sim.join('；');
  }

  function payload(png) {
    return {
      model: DS_MODEL,
      messages: [
        { role: 'system', content: SYS },
        {
          role: 'user',
          content: [
            { type: 'text', text: '识别这张草图，按约定只回 JSON。可选清单：\n' + catalog() },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64(png) } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1400,
      temperature: 0.2,
      stream: false,
      thinking: { type: 'disabled' },
    };
  }

  // ---------- 结果清洗：模型的输出一律不可信，逐字段校验 ----------
  const KINDS = { formula: 1, text: 1, stencil: 1, sim: 1, figure: 1, none: 1 };
  function clamp01(n, d) {
    n = +n;
    if (!isFinite(n)) return d;
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }
  function cleanSegs(list, maxN) {
    const out = [];
    for (const s of Array.isArray(list) ? list : []) {
      if (!Array.isArray(s) || s.length < 4 || s.length > 400) continue;
      const seg = s.slice(0, 400).map((n) => clamp01(n, 0));
      out.push(seg);
      if (out.length >= (maxN || 60)) break;
    }
    return out;
  }
  function cleanLabels(list, maxN) {
    const out = [];
    for (const t of Array.isArray(list) ? list : []) {
      if (!t || typeof t.t !== 'string' || !t.t.trim()) continue;
      out.push({ x: clamp01(t.x, 0.5), y: clamp01(t.y, 0.5), t: t.t.trim().slice(0, 12) });
      if (out.length >= (maxN || 20)) break;
    }
    return out;
  }
  function parseSpec(text) {
    let t = String(text == null ? '' : text).trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1];
    const i = t.indexOf('{'), j = t.lastIndexOf('}');
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
    let o;
    try { o = JSON.parse(t); } catch (_) { return { error: '模型没回合法 JSON' }; }
    if (!o || typeof o !== 'object') return { error: '返回不是对象' };
    const kind = KINDS[o.kind] ? o.kind : 'none';
    const spec = { kind: kind, conf: clamp01(o.conf, 0), caption: String(o.caption || '').slice(0, 40) };
    if (kind === 'formula') {
      const tex = String(o.tex || '').trim();
      if (!tex) return { error: '回了 formula 却没给 tex' };
      spec.tex = GW.ocr ? GW.ocr.cleanTex(tex) : tex;
    } else if (kind === 'text') {
      // 转写结果只做「去首尾空白 + 合并超长空行」，一个字的正文都不许改
      let txt = String(o.text == null ? '' : o.text).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
      txt = txt.replace(/[ \t]+$/gm, '').trim();
      if (!txt) return { error: '回了 text 却没给文字' };
      if (txt.length > 1200) txt = txt.slice(0, 1200);
      if (txt.replace(/[\s\p{P}]/gu, '').length < 1) return { error: 'text 里没有可识别的字' };
      spec.text = txt;
    } else if (kind === 'stencil') {
      const s = GW.stencils && GW.stencils.byId(o.id);
      if (!s) return { error: '清单里没有模板 ' + String(o.id || '(空)') };
      spec.id = s.id; spec.label = s.label;
    } else if (kind === 'sim') {
      const d = GW.sims && GW.sims[o.id];
      if (!d) return { error: '清单里没有仿真 ' + String(o.id || '(空)') };
      spec.id = o.id; spec.label = d.name || o.id;
    } else if (kind === 'figure') {
      spec.segs = cleanSegs(o.segs, 60);
      spec.arrows = cleanSegs(o.arrows, 20);
      spec.labels = cleanLabels(o.labels, 20);
      if (!spec.segs.length && !spec.arrows.length) return { error: 'figure 里没有画任何线' };
    }
    return spec;
  }

  // 1.4.0：不再自己拼 HTTP 请求 —— 统一走 GW.ai.ask（模型、Key、端点都在「插入 → AI 助手」里配，跟着走）。
  async function request(png) {
    if (!(GW.ai && GW.ai.ask)) return { error: 'AI 中心没加载' };
    const tok = GW.docTok ? GW.docTok() : 0;
    const user = '识别这张草图，按约定只回 JSON。可选清单：\n' + catalog();
    const r = await GW.ai.ask(png, SYS, user, { json: true, maxTokens: 1400, temperature: 0.2 });
    // 1.5.4 复审 #7：识别回来前换了文档 → 结果作废，别落到新文档上。
    if (GW.docTok && GW.docTok() !== tok) return { error: '文档已经切换，这次识别结果已丢弃' };
    if (r && r.error) {
      return /Key/i.test(r.error) ? { error: 'no-key' } : { error: r.error };
    }
    const spec = parseSpec(String(r.text || ''), true);
    if (spec.error) return spec;
    spec.tok = r.tok || null;
    return spec;
  }

  // ---------- 落地 ----------
  function measure(tex) {
    const tmp = h('div', { style: { position: 'absolute', visibility: 'hidden', fontSize: '48px' } });
    document.body.append(tmp);
    try { window.katex.render(tex, tmp, { displayMode: true, throwOnError: false }); } catch (_) {}
    const w = (tmp.scrollWidth || 240) + 20, hh = (tmp.scrollHeight || 80) + 10;
    tmp.remove();
    const s = GW.camera.s;
    return { w: w / s, h: hh / s };
  }

  // ---------- 草图几何美化 ----------
  // 模型的折线只是「大概照着描」，直接落地会抖。这里对每一笔做三件事：
  //   ① 折线抽稀（RDP）；② 判「直线 / 圆 / 矩形 / 多边形」并换成精确几何；
  //   ③ 端点吸附（几条线本来想连在一起的，接缝对齐）。
  // 纯几何、不花 token —— 模型负责「这是什么图」，这一层负责「线要正」。
  function toPts(flat) {
    const out = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const x = flat[i], y = flat[i + 1];
      const p = out[out.length - 1];
      if (!p || Math.hypot(x - p[0], y - p[1]) > 1e-6) out.push([x, y]);
    }
    return out;
  }
  const flatPts = (pts) => {
    const a = [];
    for (const p of pts) a.push(p[0], p[1]);
    return a;
  };
  function distSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = dx * dx + dy * dy;
    if (!L) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    let idx = 0, far = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distSeg(pts[i], pts[0], pts[pts.length - 1]);
      if (d > far) { far = d; idx = i; }
    }
    if (far > eps) {
      const a = rdp(pts.slice(0, idx + 1), eps), b = rdp(pts.slice(idx), eps);
      return a.slice(0, -1).concat(b);
    }
    return [pts[0], pts[pts.length - 1]];
  }
  function polyArea(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }
  function cleanStroke(flat, diag) {
    const pts = toPts(flat);
    if (pts.length < 2) return flat.slice();
    const a = pts[0], b = pts[pts.length - 1];
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const closed = chord < diag * 0.16 && pts.length > 6;
    const simp = rdp(pts, diag * 0.012);
    if (!closed) {
      let far = 0;
      for (const p of pts) far = Math.max(far, distSeg(p, a, b));
      if (chord > diag * 0.22 && far < chord * 0.055) {
        // 当直线处理；顺手把「差不多水平/竖直」的线摆正
        let [x1, y1, x2, y2] = [a[0], a[1], b[0], b[1]];
        const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
        if (dy < dx * 0.14) { const y = (y1 + y2) / 2; y1 = y2 = y; }
        else if (dx < dy * 0.14) { const x = (x1 + x2) / 2; x1 = x2 = x; }
        return [x1, y1, x2, y2];
      }
      return flatPts(simp);
    }
    // 闭合：先试圆，再试矩形，都不是就保留抽稀后的多边形
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    cx /= pts.length; cy /= pts.length;
    const rs = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
    const rMin = Math.min.apply(null, rs), rMax = Math.max.apply(null, rs);
    const rAvg = rs.reduce((s, r) => s + r, 0) / rs.length;
    if (rAvg > diag * 0.08 && (rMax - rMin) / rAvg < 0.3) {
      const ring = [];
      for (let i = 0; i < 36; i++) {
        const t = (i / 36) * Math.PI * 2;
        ring.push([cx + Math.cos(t) * rAvg, cy + Math.sin(t) * rAvg]);
      }
      ring.push(ring[0].slice());
      return flatPts(ring);
    }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of pts) {
      if (p[0] < x1) x1 = p[0]; if (p[0] > x2) x2 = p[0];
      if (p[1] < y1) y1 = p[1]; if (p[1] > y2) y2 = p[1];
    }
    const bw = x2 - x1, bh = y2 - y1;
    if (bw > diag * 0.1 && bh > diag * 0.1 && polyArea(pts) > bw * bh * 0.72) {
      return [x1, y1, x2, y1, x2, y2, x1, y2, x1, y1];
    }
    const news = simp.length > 2 ? simp.concat([simp[0].slice()]) : simp;
    return flatPts(news);
  }
  function beautify(segs, diag) {
    const out = [];
    for (const s of segs || []) {
      if (!Array.isArray(s) || s.length < 4) continue;
      const c = cleanStroke(s, diag);
      if (c.length >= 4) out.push(c);
    }
    // 端点吸附：两条线本来想接在一起的，接缝别错开
    const snap = diag * 0.018;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const A = out[i], B = out[j];
        const ai = [[0, 1], [A.length - 2, A.length - 1]];
        const bi = [[0, 1], [B.length - 2, B.length - 1]];
        for (const [i1, i2] of ai) for (const [j1, j2] of bi) {
          const dd = Math.hypot(A[i1] - B[j1], A[i2] - B[j2]);
          if (dd > 0 && dd < snap) {
            const mx = (A[i1] + B[j1]) / 2, my = (A[i2] + B[j2]) / 2;
            A[i1] = B[j1] = mx; A[i2] = B[j2] = my;
          }
        }
      }
    }
    return out;
  }

  function figureShape(spec, box, color) {
    const X = (u) => box.x + u * box.w, Y = (v) => box.y + v * box.h;
    const raw = [], texts = [];
    for (const s of spec.segs || []) {
      const seg = [];
      for (let i = 0; i + 1 < s.length; i += 2) seg.push(X(s[i]), Y(s[i + 1]));
      if (seg.length >= 4) raw.push(seg);
    }
    const diag = Math.hypot(box.w, box.h) || 1;
    const segs = beautify(raw, diag);
    for (const a of spec.arrows || []) {
      const x1 = X(a[0]), y1 = Y(a[1]), x2 = X(a[2]), y2 = Y(a[3]);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const l = Math.max(8, Math.min(len * 0.28, Math.min(box.w, box.h) * 0.12));
      const ux = dx / len, uy = dy / len, px = -uy, py = ux;
      const bx = x2 - ux * l, by = y2 - uy * l;
      segs.push([x1, y1, bx, by]);
      segs.push([bx + px * l * 0.42, by + py * l * 0.42, x2, y2, bx - px * l * 0.42, by - py * l * 0.42, bx + px * l * 0.42, by + py * l * 0.42]);
    }
    const fs = Math.max(10, Math.min(box.w, box.h) * 0.07);
    for (const t of spec.labels || []) texts.push({ x: X(t.x), y: Y(t.y), s: fs, t: t.t });
    const o = { kind: 'shape', type: 'multi', width: 2.4, fill: null, segs: segs, color: color };
    if (texts.length) o.texts = texts;
    return o;
  }

  // 文字块：按行数与最长行反推字号，让落下来的字正好铺满原来那簇手写
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
  }
  function textItem(spec, box, color) {
    const lines = String(spec.text || '').split('\n');
    const wide = (s) => {
      let n = 0;
      for (const ch of s) n += /[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.56;
      return Math.max(1, n);
    };
    const maxW = lines.reduce((m, l) => Math.max(m, wide(l)), 2);
    const fs = GW.clamp(Math.min(box.h / (lines.length * 1.42), box.w / (maxW * 0.62)), 12, 96);
    const w = GW.clamp(maxW * fs * 0.62 + 10, 60, Math.max(60, box.w * 1.4));
    const hh = Math.max(fs * 1.5, lines.length * fs * 1.42);
    return { kind: 'obj', type: 'text', x: box.x, y: box.y, w: w, h: hh,
      data: { html: escHtml(spec.text), size: Math.round(fs), color: color, ai: true } };
  }

  // 把 spec 变成「要插进画布的一批 item」，位置严格贴在这簇笔迹的包围盒上。
  function buildItems(spec, box) {
    const color = GW.tool.pen.color || '#1b2433';
    const base = { kind: 'shape', color: color };
    if (spec.kind === 'text') return [textItem(spec, box, color)];
    if (spec.kind === 'formula') {
      const m = measure(spec.tex);
      return [{ kind: 'obj', type: 'formula', x: box.x, y: box.y, w: m.w, h: m.h,
        data: { tex: spec.tex, color: color, handwritten: true, ai: true } }];
    }
    if (spec.kind === 'stencil') {
      const st = GW.stencils.make(spec.id, box.x, box.y, box.x + box.w, box.y + box.h);
      if (!st) return [];
      const wrap = (o) => Object.assign({}, base, o, { id: GW.uid() });
      return (Array.isArray(st) ? st : [st]).map(wrap);
    }
    if (spec.kind === 'sim') {
      const def = GW.sims[spec.id] || {};
      let w = def.width || 960, hh = def.height || 600;
      const s = GW.camera.s || 1, maxW = (innerWidth * 0.8) / s, maxH = (innerHeight * 0.78) / s;
      if (w > maxW || hh > maxH) { const f = Math.min(maxW / w, maxH / hh); w *= f; hh *= f; }
      return [{ kind: 'obj', type: 'sim', x: box.x, y: box.y, w: w, h: hh, data: { sim: spec.id, state: {} } }];
    }
    if (spec.kind === 'figure') {
      return [Object.assign({ id: GW.uid() }, figureShape(spec, box, color))];
    }
    return [];
  }

  function normalizeItems(items) {
    const page = GW.page();
    let z = page.objs.reduce((m, x) => Math.max(m, x.z || 0), 0);
    for (const it of items) {
      it.id = it.id || GW.uid();
      if (it.kind === 'obj') z += 1;
      if (it.kind === 'obj') it.z = z;
    }
    return items;
  }

  // 替换：新对象与删旧笔迹合成**一条**历史（add + remove 放在同一个 op 里），
  // 老师按一下 Ctrl+Z 就回到手写、图形同时消失；再按 Ctrl+Shift+Z 又换回来。
  function replace(strokes, items) {
    if (!items.length) return null;
    normalizeItems(items);
    GW.addItems(items, false);
    GW.removeItems(strokes, false);
    GW.commit({ add: items, remove: strokes });
    return items;
  }

  // ---------- 底部浮条（不确定时的确认层）----------
  let chipEl = null, chipTimer = 0;
  function hideChip() {
    clearTimeout(chipTimer);
    if (chipEl) { chipEl.remove(); chipEl = null; }
  }
  function showChip(text, onOk, onCancel) {
    hideChip();
    const ok = h('button', { class: 'gw-btn primary', onclick: () => { hideChip(); if (onOk) onOk(); } }, '换掉手写');
    const no = h('button', { class: 'gw-btn', onclick: () => { hideChip(); if (onCancel) onCancel(); } }, '保留');
    chipEl = h('div', { class: 'ai-chip' }, h('span', { class: 'ai-chip-t' }, text), ok, no);
    document.body.append(chipEl);
    chipTimer = setTimeout(hideChip, 9000);
  }

  // ---------- 笔迹块（1.4.0：不再由「AI 笔」模式驱动，只由框选调用） ----------
  let block = [], timer = 0, busy = false;
  function reset() { clearTimeout(timer); block = []; }

  function onStrokeEndUnused(stroke) {
    if (!stroke || !stroke.pts || GW.tool.pen.mode !== 'ai') return;
    if (block.length) {
      const b1 = bboxOf(block), b2 = bboxOf([stroke]);
      if (b1 && b2 && gapPx(b1, b2) > GAP_PX) flush();
    }
    block.push(stroke);
    clearTimeout(timer);
    timer = setTimeout(flush, IDLE_MS);
  }

  async function flush() {
    clearTimeout(timer);
    if (busy || !block.length) return null;
    const strokes = block.slice();
    block = [];
    busy = true;
    try {
      const r = await convert(strokes);
      return r;
    } finally {
      busy = false;
    }
  }


  async function cloudSpec(strokes) {
    if (!apiKey()) return { error: 'no-key' };
    const png = await GW.ocr.renderPng(strokes.map((s) => ({ pts: pairsOf(s.pts) })));
    if (!png) return { error: '笔迹为空' };
    return request(png);
  }

  async function convert(strokes) {
    const box = bboxOf(strokes);
    if (!box) return { error: '没有笔迹' };
    const spec = await cloudSpec(strokes);
    if (spec.error === 'no-key') {
      GW.toast('AI 规整要一个 Key：插入菜单 → AI 助手 → 模型与密钥');
    }
    if (spec.error) { GW.toast('AI 规整：' + spec.error); return spec; }
    if (spec.kind === 'none') { GW.toast('AI 规整：没认出是什么，保留手写'); return spec; }
    const items = buildItems(spec, box);
    if (!items.length) { GW.toast('AI 规整：识别结果落不到画布上，保留手写'); return spec; }
    const label = spec.caption || spec.label || (spec.kind === 'formula' ? '公式' : '图形');
    if (spec.conf >= AUTO_CONF && config().auto !== false) {
      replace(strokes, items);
      GW.toast('已转成「' + label + '」（Ctrl+Z 退回手写）');
    } else {
      showChip('认成「' + label + '」？' + (spec.tex ? ' ' + spec.tex : ''), () => {
        replace(strokes, items);
        GW.toast('已换成「' + label + '」');
      });
    }
    return spec;
  }

  // ---------- 「板书一键规整」：把选中的笔迹整块认成规范图形 ----------
  // 离线引擎只认公式，所以「多行板书」走另一条路：按行切开 → 每行一个公式对象。
  // 这也是离线通道对「简单板书」的全部承诺：一行一个式子，复杂版面交给在线排版。
  async function tidySelection() {
    const sel = GW.selection && GW.selection.items ? GW.selection.items : [];
    const strokes = sel.filter((it) => it && it.kind !== 'obj' && Array.isArray(it.pts));
    if (!strokes.length) { GW.toast('先框选要规整的笔迹（选择工具拖一个框）'); return null; }


    const r = await convert(strokes);
    if (r && !r.error && r.kind && r.kind !== 'none') GW.selection.clear();
    return r;
  }

  // Alt+G：框选后一键规整（不给快捷键就没人会发现这个功能）
  addEventListener('keydown', (e) => {
    if (!e.altKey || String(e.key).toLowerCase() !== 'g') return;
    if (document.querySelector('.dlg-wrap')) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    if (!(GW.selection && GW.selection.items && GW.selection.items.length)) return;
    e.preventDefault();
    tidySelection();
  }, true);

  GW.aiPen = {
    config,
    saveConfig,
    catalog,
    parseSpec,
    buildItems,
    request,
    convert,
    flush,
    tidySelection,

    // 探针用：换传输层；直接喂一组笔迹（不走真实指针）
    setTransport(fn) { if (GW.ai && GW.ai.setTransport) GW.ai.setTransport(fn); else TRANSPORT = typeof fn === 'function' ? fn : defaultTransport; },
    fallbackTransport() { TRANSPORT = defaultTransport; },
    reset,
    _block: () => block.slice(),
  };
})();




