/* 数理无限画布 · AI 节点（1.3.0）
 *
 * 把一个「AI 工作流」做成画布上的一个项目：写提示词 → 点生成 → 结果直接显示在节点里，
 * 一键放成公式 / 文字 / 插图 / 仿真。老师不用记 LaTeX，也不用会 ComfyUI。
 *
 * 设计取舍：
 *  · 节点就是普通对象（type:'node'），所以拖动、锁定、缩放、导出、协同全部白拿。
 *  · 执行只有两条路：① 有 Key → 走 DeepSeek（GW.ocr.ask）出结构化 JSON；
 *    ② 没有 Key / 生图生视频 → 打开「网页版 AI」窗口，人在里面问，回来粘/拖结果。
 *    不在本地假装能生成图片和视频 —— 那要模型和显卡，这个包里没有。
 *  · 工作流可导入 ComfyUI / RunningHub 导出的 JSON：只提取其中的提示词与节点标题，
 *    变成这个节点的默认提示词；不尝试执行别人的算图图（执行不了就是执行不了，会写明）。
 */
(function () {
  'use strict';
  const WKEY = 'gewu.nodes.wf';

  // 1x1 白点：纯文字请求也复用 ask()（它固定发 image_url，且要的是**字节**不是 base64），省一条新通道
  const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const BLANK_BYTES = (() => {
    try { return Uint8Array.from(atob(BLANK.slice(BLANK.indexOf(',') + 1)), (c) => c.charCodeAt(0)); }
    catch (e) { return new Uint8Array(0); }
  })();

  const BASE_SYS = '你是数学/物理老师的备课助手。只输出 JSON，不要解释、不要 Markdown 代码围栏。';
  const TEX_RULE = '公式用 KaTeX 能渲染的 LaTeX（不要 $$、不要 \\begin{equation}），分式用 \\frac，上下标用 ^ _。';

  const PRESETS = [
    {
      id: 'formula', name: '生公式', kind: 'tex', icon: '∑',
      hint: '例如：求根公式、二倍角，或直接描述一道题的式子',
      sys: BASE_SYS + TEX_RULE + '输出 {"tex":"…","note":"一句中文说明"}。',
      user: (p) => '把下面的要求写成一条公式：\n' + p,
    },
    {
      id: 'figure', name: '生示意图', kind: 'figure', icon: '📐',
      hint: '例如：直角三角形斜边上的高、平行板电容器',
      sys: BASE_SYS + '输出 {"caption":"标题","segs":[[x1,y1,x2,y2,…]],"arrows":[[x1,y1,x2,y2]],"labels":[{"x":0.5,"y":0.2,"t":"A"}]}；坐标是 0..1 的归一化坐标，x 向右、y 向下。',
      user: (p) => '画一个中学课堂能用的示意图（尽量用直线和折线，不要照片）：\n' + p,
    },
    {
      id: 'quiz', name: '出随堂练习', kind: 'quiz', icon: '✎',
      hint: '例如：一元二次方程配方法，3 道，由易到难',
      sys: BASE_SYS + '输出 {"title":"…","items":[{"q":"题干","a":"答案","hint":"提示"}]}，3~5 题。',
      user: (p) => '出一道随堂练习：\n' + p,
    },
    {
      id: 'explain', name: '讲解步骤', kind: 'text', icon: '💡',
      hint: '例如：为什么光从空气进入水中会向法线偏折',
      sys: BASE_SYS + '输出 {"title":"…","steps":["第一步…","第二步…"],"tip":"一句话提醒"}。',
      user: (p) => '按上课讲解的口吻写解题/推导步骤：\n' + p,
    },
    {
      id: 'lesson', name: '讲义摘要', kind: 'text', icon: '📄',
      hint: '例如：把这段板书整理成三条要点',
      sys: BASE_SYS + '输出 {"title":"…","blocks":[{"h":"小标题","p":"正文"}]}。',
      user: (p) => '整理成讲义摘要：\n' + p,
    },
    {
      id: 'image', name: '生插图（外部）', kind: 'img', icon: '🖼', external: true,
      hint: '描述画面，例如：一个学生在斜面上推箱子，卡通风格',
      sys: '', user: (p) => p,
    },
    {
      id: 'video', name: '生动画（外部）', kind: 'video', external: true,
      hint: '描述动画，例如：单摆从 30° 释放的慢动作',
      sys: '', user: (p) => p,
    },
    {
      id: 'sim', name: '选仿真', kind: 'sim', icon: '⚙',
      hint: '例如：需要演示简谐运动、带电粒子在磁场中',
      sys: BASE_SYS + '输出 {"sim":"仿真 id 或空","why":"一句理由"}。',
      user: (p) => {
        const list = Object.keys(GW.sims || {});
        return '从下面这些仿真里挑一个最合适的（id 必须完全一致，没有就给空字符串）：\n' + list.join(', ') + '\n\n需求：' + p;
      },
    },
  ];

  function custom() {
    try { const a = JSON.parse(localStorage.getItem(WKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function saveCustom(list) { try { localStorage.setItem(WKEY, JSON.stringify(list.slice(-24))); } catch (e) { /* 隐私模式 */ } }
  function all() { return PRESETS.concat(custom()); }
  function get(id) { return all().find((w) => w.id === id) || PRESETS[0]; }

  // ---------- 工作流导入 ----------
  // 支持三种：本应用导出的 {id,name,kind,sys,user}；ComfyUI 的 {nodes:[{type,widgets_values,title}]}；
  // RunningHub 的 {nodeInfoList:[{fieldName,fieldValue}]} / {workflow:{nodes:[…]}}。
  // 只提取提示词与标题 —— 别人的算图图我们执行不了，硬吹「已导入并会执行」是骗人。
  function parseWorkflow(raw, fallbackName) {
    let j;
    try { j = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return { error: '不是合法的 JSON 文件' }; }
    if (!j || typeof j !== 'object') return { error: 'JSON 里没有对象' };
    if (j.sys && (j.user || j.prompt)) return { wf: { id: 'wf' + GW.uid(), name: j.name || fallbackName || '导入的工作流', kind: j.kind || 'text', sys: j.sys, user: typeof j.user === 'string' ? (p) => j.user.replace(/\{p\}/g, p) : (p) => p, hint: j.hint || '', imported: true } };
    const texts = [];
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const w = n.widgets_values;
      if (Array.isArray(w)) {
        for (const v of w) {
          if (typeof v !== 'string') continue;
          const s = v.trim();
          if (s.length < 6) continue;
          if (/\.(safetensors|ckpt|pt|pth|bin|gguf|onnx)$/i.test(s)) continue;
          if (/^(euler|dpmpp|steps|cfg|sampler|normal|randomize|fixed|enable|disable)/i.test(s)) continue;
          texts.push(s);
        }
      }
      if (typeof n.text === 'string' && n.text.trim().length > 5) texts.push(n.text.trim());
      if (n.nodeInfoList) walk(n.nodeInfoList);
      if (n.fieldValue && typeof n.fieldValue === 'string' && n.fieldValue.trim().length > 5) texts.push(n.fieldValue.trim());
      if (n.workflow) walk(n.workflow);
      if (n.nodes) walk(n.nodes);
    };
    walk(j);
    const uniq = [...new Set(texts)].slice(0, 6);
    if (!uniq.length) return { error: '这个 JSON 里没找到提示词（可能只是模型/采样设置）' };
    return { wf: {
      id: 'wf' + GW.uid(),
      name: (j.name || fallbackName || '导入的工作流').replace(/\.json$/i, ''),
      kind: 'text', imported: true,
      hint: uniq[0].slice(0, 40),
      sys: BASE_SYS + '输出 {"title":"…","text":"正文"}。',
      user: (p) => '工作流说明：\n' + uniq.join('\n') + '\n\n本次要求：\n' + p,
    } };
  }

  // ---------- 节点对象 ----------
  function nodeTitle(o) {
    const wf = get(o.data.wf);
    return 'AI 节点 · ' + wf.name + (o.data.state === 'run' ? ' · 生成中…' : '');
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

  function outHtml(d) {
    const out = d.out;
    if (!out) return '<div class="node-empty">写好提示词，点「生成」。</div>';
    if (out.kind === 'tex') {
      try {
        const html = window.katex ? window.katex.renderToString(out.tex, { displayMode: true, throwOnError: false, output: 'html' }) : esc(out.tex);
        return '<div class="node-tex">' + html + '</div>' + (out.note ? '<div class="node-note">' + esc(out.note) + '</div>' : '');
      } catch (e) { return '<div class="node-tex">' + esc(out.tex) + '</div>'; }
    }
    if (out.kind === 'quiz') {
      return '<div class="node-h">' + esc(out.title || '随堂练习') + '</div>' + (out.items || []).map((it, i) =>
        '<div class="node-q"><b>' + (i + 1) + '.</b> ' + esc(it.q) + (it.a ? '<div class="node-a">答：' + esc(it.a) + '</div>' : '') + '</div>').join('');
    }
    if (out.kind === 'text') {
      const blocks = out.blocks || (out.steps ? [{ h: out.title || '', p: out.steps.join('\n') }] : [{ h: out.title || '', p: out.text || '' }]);
      return blocks.map((b) => (b.h ? '<div class="node-h">' + esc(b.h) + '</div>' : '') + '<div class="node-p">' + esc(b.p).replace(/\n/g, '<br>') + '</div>').join('') + (out.tip ? '<div class="node-note">' + esc(out.tip) + '</div>' : '');
    }
    if (out.kind === 'figure') return '<div class="node-note">示意图已生成（点「放到画布」变成矢量图）</div>';
    if (out.kind === 'img') return '<img class="node-img" src="' + out.src + '" alt="">';
    if (out.kind === 'video') return '<video class="node-img" src="' + out.src + '" controls></video>';
    if (out.kind === 'sim') return '<div class="node-h">推荐仿真：' + esc(out.sim || '（没找到合适的）') + '</div>' + (out.why ? '<div class="node-note">' + esc(out.why) + '</div>' : '');
    return '<pre class="node-pre">' + esc(out.text || JSON.stringify(out)) + '</pre>';
  }

  // setData 会换掉对象引用（replaceRaw），挂在旧对象上的 _inst 不再被调用 ⇒ 自己按 id 记住重绘函数
  const UIS = new Map();
  function paint(o) { const f = UIS.get(o && o.id); if (f) f(); }

  // 节点自己的模型选择：服务商 | 模型。空值表示跟随「AI 助手」里的全局设置。
  function modelOptions() {
    const cfg = GW.aicfg;
    if (!cfg) return '';
    const out = [];
    Object.keys(cfg.PROVIDERS).forEach((k) => {
      const p = cfg.PROVIDERS[k];
      (p.models || []).forEach((m) => {
        out.push('<option value="' + k + '|' + m + '">' + String(p.label).replace(/（.*$/, '') + ' · ' + m + '</option>');
      });
    });
    return out.join('');
  }

  function register() {
    if (!GW.defineKind) return;
    GW.defineKind('node', {
      chrome: 'bare', minW: 300, minH: 220,
      title: nodeTitle,
      defaultSize: () => ({ w: 460, h: 360 }),
      create(o, body) {
        const L = () => (GW.page().objs.find((x) => x.id === o.id) || o);
        const wrap = GW.h('div', { class: 'node-wrap' });
        const sel = GW.h('select', { class: 'node-wf' });
        const importBtn = GW.h('button', { class: 'node-mini', title: '导入 ComfyUI / RunningHub / 本应用导出的 JSON 工作流' }, '导入');
        const exportBtn = GW.h('button', { class: 'node-mini', title: '把这个工作流导出成 JSON（可发给同事）' }, '导出');
        const mod = GW.h('select', { class: 'node-wf node-model', title: '这个节点用哪家大模型（默认跟随「AI 助手」里的设置）' });
        const top = GW.h('div', { class: 'node-top' }, sel, mod, importBtn, exportBtn);
        const ta = GW.h('textarea', { class: 'node-prompt', rows: '3', placeholder: '写你要什么，例如：推导勾股定理，画出示意图' });
        const run = GW.h('button', { class: 'node-run' }, '生成');
        const st = GW.h('span', { class: 'node-st' }, '');
        const drop = GW.h('button', { class: 'node-drop', title: '插图/动画节点：把图片或视频拖到卡片上也可以' }, '拖入图片/视频');
        const row = GW.h('div', { class: 'node-row' }, run, st, drop);
        const out = GW.h('div', { class: 'node-out' });
        const bar = GW.h('div', { class: 'node-bar' });
        wrap.append(top, ta, row, out, bar);
        body.append(wrap);

        const fill = () => {
          const d = L().data;
          sel.innerHTML = '';
          all().forEach((w) => sel.append(GW.h('option', { value: w.id }, w.name)));
          sel.value = d.wf || 'formula';
          mod.innerHTML = '<option value="">模型：跟随 AI 助手</option>' + modelOptions();
          mod.value = d.model || '';
          if (document.activeElement !== ta) ta.value = d.prompt || '';
          ta.placeholder = get(d.wf).hint || '写你要什么';
          st.textContent = d.state === 'run' ? '生成中…' : (d.state === 'err' ? (d.err || '出错了') : (d.tok ? '上次用了 ' + d.tok + ' tokens' : ''));
          st.className = 'node-st' + (d.state === 'err' ? ' err' : (d.state === 'run' ? ' busy' : ''));
          out.innerHTML = outHtml(d);
          bar.innerHTML = '';
          if (d.out) {
            bar.append(GW.h('button', { class: 'node-mini', onclick: () => land(L()) }, '放到画布'));
            bar.append(GW.h('button', { class: 'node-mini', onclick: () => copyOut(L()) }, '复制'));
          }
          const ext = get(d.wf).external;
          drop.style.display = ext ? '' : 'none';
        };
        sel.addEventListener('change', () => {
          const d = L().data; d.wf = sel.value;
          GW.objects.setData(L(), { wf: sel.value });
          fill();
        });
        // 1.4.0：原来这里是空转的赋值，提示词从来没写回对象 —— 每次重绘 fill() 又用
        // d.prompt（永远是空）覆盖输入框，所以「写不进去」。现在输入时直接改对象 data
        // （不触发重绘，光标不跳），失焦时再走 setData 落盘。
        ta.addEventListener('input', () => { const cur = L(); cur.data.prompt = ta.value; });
        ta.addEventListener('blur', () => { const cur = L(); if (cur.data.prompt !== ta.value) GW.objects.setData(cur, { prompt: ta.value }); });
        ta.addEventListener('pointerdown', (e) => e.stopPropagation());
        mod.addEventListener('change', () => { GW.objects.setData(L(), { model: mod.value }); });
        run.addEventListener('click', () => runNode(L()));
        importBtn.addEventListener('click', () => importFlow());
        exportBtn.addEventListener('click', () => exportFlow(get(L().data.wf)));
        drop.addEventListener('click', () => { if (GW.toast) GW.toast('把图片或视频文件直接拖到这张卡片上'); });

        // 拖入文件：图片/视频直接成为结果（生图生视频本来就得靠外部工具）
        body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('node-over'); });
        body.addEventListener('dragleave', () => body.classList.remove('node-over'));
        body.addEventListener('drop', (e) => {
          e.preventDefault(); body.classList.remove('node-over');
          const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            const isV = /^video\//.test(f.type);
            GW.objects.setData(L(), { state: 'ok', out: { kind: isV ? 'video' : 'img', src: r.result } });
            paint(L());
          };
          r.readAsDataURL(f);
        });

        UIS.set(o.id, fill);
        fill();
        return {
          onUpdate: fill,
          onView: fill,
          destroy() { UIS.delete(o.id); },
        };
      },
    });
  }

  // ---------- 执行 ----------
  function sysUser(wf, prompt) {
    const user = typeof wf.user === 'function' ? wf.user(prompt) : String(wf.user || prompt).replace(/\{p\}/g, prompt);
    return { sys: wf.sys || BASE_SYS, user: user };
  }

  function parseJson(text) {
    let s = String(text || '').trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  async function runNode(o) {
    const live = GW.page().objs.find((x) => x.id === o.id) || o;
    const d = live.data;
    const wf = get(d.wf);
    const prompt = (d.prompt || '').trim();
    if (!prompt) { GW.toast('先写提示词'); return; }
    if (wf.external) {
      // 生图/生视频：本地生成不了，交给网页版 AI 窗口
      GW.toast('这个节点要外部生图 / 视频服务：生成好之后把文件拖到这张卡片上');
      return;
    }
    if (!(GW.ai && GW.ai.ask)) return;
    // 重跑要先把上一次的结果清掉：否则这次失败（或没 Key）时，卡片上还会留着上一次的
    // 旧结果，看起来像「这次也成功了」（探针里的「非 JSON 时不留半成品」就是守这个）。
    GW.objects.setData(live, { state: 'run', err: '', out: null });
    const { sys, user } = sysUser(wf, prompt);
    const mm = String(d.model || '').split('|');
    const opt = { json: true, maxTokens: 1400 };
    if (mm[0] && mm[1]) { opt.provider = mm[0]; opt.model = mm[1]; }
    let r;
    try { r = await GW.ai.ask(BLANK_BYTES, sys, user, opt); }
    catch (e) { r = { error: e.message }; }
    const cur = GW.page().objs.find((x) => x.id === o.id) || o;
    if (!r || r.error) { GW.objects.setData(cur, { state: 'err', err: r && r.error || '请求失败' }); paint(cur); return; }
    const j = parseJson(r.text);
    if (!j) { GW.objects.setData(cur, { state: 'err', err: '模型没按 JSON 回：' + String(r.text).slice(0, 60) }); paint(cur); return; }
    const out = normalizeOut(wf, j, d.ctx);
    GW.objects.setData(cur, { state: out ? 'ok' : 'err', out: out || undefined, err: out ? '' : '返回里没有能用的字段', tok: r.tok || 0 });
    paint(cur);
  }

  function normalizeOut(wf, j, ctx) {
    if (wf.kind === 'tex' && j.tex) return { kind: 'tex', tex: String(j.tex).replace(/\$\$?/g, ''), note: j.note || '' };
    if (wf.kind === 'figure' && Array.isArray(j.segs)) return { kind: 'figure', segs: j.segs, arrows: j.arrows || [], labels: j.labels || [], caption: j.caption || '' };
    if (wf.kind === 'quiz' && Array.isArray(j.items)) return { kind: 'quiz', title: j.title || '', items: j.items };
    if (wf.kind === 'sim') return { kind: 'sim', sim: j.sim || '', why: j.why || '' };
    if (wf.kind === 'text' || j.blocks || j.steps || j.text) return { kind: 'text', title: j.title || '', text: j.text || '', steps: j.steps, blocks: j.blocks, tip: j.tip };
    if (Array.isArray(j.segs)) return { kind: 'figure', segs: j.segs, arrows: j.arrows || [], labels: j.labels || [] };
    if (j.tex) return { kind: 'tex', tex: String(j.tex), note: j.note || '' };
    return { kind: 'text', text: JSON.stringify(j) };
  }

  // ---------- 结果落地 ----------
  function guessSize(tex) { return { w: Math.min(900, 120 + String(tex).length * 16), h: 110 }; }

  function land(o) {
    const d = o.data;
    const out = d.out;
    if (!out) return;
    const x = o.x + o.w + 24, y = o.y;
    if (out.kind === 'tex') {
      const s = guessSize(out.tex);
      GW.objects.create('formula', { tex: out.tex, color: GW.tool.pen.color, ai: true }, { x, y, w: s.w, h: s.h, exact: true });
    } else if (out.kind === 'text' || out.kind === 'quiz') {
      const html = outHtml(d);
      GW.objects.create('text', { html: html.replace(/^<div class="node-/, '<div class="'), size: 22, color: GW.tool.pen.color, ai: true }, { x, y, w: 520, h: 300, exact: true });
    } else if (out.kind === 'figure' && GW.aiPen && GW.stencils) {
      const box = { x, y, w: o.w, h: o.w * 0.62 };
      const items = buildFigure(out, box);
      if (items.length) GW.addItems(items, true);
    } else if (out.kind === 'sim' && out.sim && GW.importer && GW.importer.insertSim) {
      GW.importer.insertSim(out.sim, { x, y });
    } else if (out.kind === 'img') {
      GW.objects.create('image', { src: out.src, name: 'AI 插图' }, { x, y, w: 420, h: 300, exact: true });
    } else if (out.kind === 'video') {
      GW.objects.create('video', { src: out.src, name: 'AI 动画' }, { x, y, w: 480, h: 300, exact: true });
    }
    GW.toast('已放到画布');
  }

  // 归一化折线 → 画布图元（和 AI 智能笔的 figure 共用一种对象：type:'multi' + segs + texts）
  function buildFigure(out, box) {
    const X = (v) => box.x + Math.max(0, Math.min(1, v)) * box.w;
    const Y = (v) => box.y + Math.max(0, Math.min(1, v)) * box.h;
    const segs = [], texts = [];
    for (const s of out.segs || []) {
      if (!Array.isArray(s) || s.length < 4) continue;
      const seg = [];
      for (let i = 0; i + 1 < s.length; i += 2) seg.push(X(s[i]), Y(s[i + 1]));
      if (seg.length >= 4) segs.push(seg);
    }
    for (const a of out.arrows || []) {
      if (!Array.isArray(a) || a.length < 4) continue;
      const x1 = X(a[0]), y1 = Y(a[1]), x2 = X(a[2]), y2 = Y(a[3]);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const l = Math.max(8, Math.min(len * 0.28, Math.min(box.w, box.h) * 0.12));
      const ux = dx / len, uy = dy / len, px = -uy, py = ux;
      const bx = x2 - ux * l, by = y2 - uy * l;
      segs.push([x1, y1, bx, by]);
      segs.push([bx + px * l * 0.42, by + py * l * 0.42, x2, y2, bx - px * l * 0.42, by - py * l * 0.42, bx + px * l * 0.42, by + py * l * 0.42]);
    }
    const fs = Math.max(10, Math.min(box.w, box.h) * 0.07);
    for (const t of out.labels || []) texts.push({ x: X(t.x || 0), y: Y(t.y || 0), s: fs, t: String(t.t || '').slice(0, 24) });
    if (!segs.length && !texts.length) return [];
    const o = { id: GW.uid(), kind: 'shape', type: 'multi', width: 2.4, fill: null, segs, color: GW.tool.pen.color };
    if (texts.length) o.texts = texts;
    return [o];
  }

  function copyOut(o) {
    const out = o.data.out;
    if (!out) return;
    const s = out.kind === 'tex' ? out.tex : (out.kind === 'text' ? out.text : JSON.stringify(out));
    try { navigator.clipboard.writeText(s); GW.toast('已复制'); } catch (e) { GW.toast('复制失败，可手动选中'); }
  }

  // ---------- 导入 / 导出 ----------
  function importFlow() {
    const inp = GW.h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    document.body.append(inp);
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) { inp.remove(); return; }
      const r = new FileReader();
      r.onload = () => {
        const res = parseWorkflow(r.result, f.name);
        if (res.error) { GW.toast('导入失败：' + res.error, 3000); return; }
        const list = custom(); list.push(res.wf); saveCustom(list);
        const o = GW.selection.items && GW.selection.items[0];
        if (o && o.type === 'node') { GW.objects.setData(o, { wf: res.wf.id }); paint(GW.page().objs.find((x) => x.id === o.id) || o); }
        GW.toast('已导入工作流：' + res.wf.name);
      };
      r.readAsText(f);
      inp.remove();
    });
    inp.click();
  }

  function exportFlow(wf) {
    const data = { name: wf.name, kind: wf.kind || 'text', sys: wf.sys, user: typeof wf.user === 'function' ? String(wf.user('')) : wf.user, hint: wf.hint };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = GW.h('a', { href: URL.createObjectURL(blob), download: (wf.name || 'workflow') + '.json' });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  // ---------- 新建 ----------
  function openPicker() {
    const box = GW.h('div', { class: 'node-picker' });
    const dlg = GW.dialog({
      title: 'AI 节点：选一个工作流', width: 560, noFooter: true,
      body: GW.h('div', null,
        GW.h('div', { class: 'node-note' }, '节点是画布上的一个项目：写提示词 → 生成 → 一键放成公式/文字/图。也可以从 ComfyUI / RunningHub 导入 JSON 工作流。'),
        box,
        GW.h('div', { class: 'node-row' }, GW.h('button', { class: 'node-mini', onclick: () => importFlow() }, '导入工作流 JSON'))),
    });
    all().forEach((w) => {
      box.append(GW.h('button', { class: 'node-pick', onclick: () => { dlg.close(); create(w.id); } },
        GW.h('b', null, (w.icon || '★') + ' ' + w.name),
        GW.h('span', null, w.hint || '')));
    });
  }

  function create(wfId, opts) {
    const o = opts || {};
    const wf = get(wfId);
    const vc = GW.viewCenter ? GW.viewCenter() : { x: 200, y: 160 };
    const x = o.x != null ? o.x : Math.round(vc.x - 230);
    const y = o.y != null ? o.y : Math.round(vc.y - 180);
    const data = { wf: wf.id, prompt: o.prompt || '', state: 'idle', out: null };
    if (o.ctx) data.ctx = o.ctx;
    return GW.objects.create('node', data, { x, y, w: 460, h: 360, exact: true });
  }

  // 以某个项目为输入：把它的文字/公式/仿真名写进提示词
  function fromObject(o) {
    let ctx = '', wf = 'explain';
    if (o.type === 'text') {
      const t = String((o.data && o.data.html) || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
      ctx = t.slice(0, 800); wf = 'explain';
    } else if (o.type === 'formula') {
      ctx = '公式：' + ((o.data && o.data.tex) || ''); wf = 'explain';
    } else if (o.type === 'sim') {
      ctx = '仿真：' + ((o.data && o.data.sim) || ''); wf = 'lesson';
    } else if (o.type === 'book' || o.type === 'pdfpage') {
      ctx = '课件：' + ((o.data && o.data.name) || ''); wf = 'lesson';
    } else if (o.type === 'node') {
      return;
    } else {
      ctx = '项目类型：' + o.type;
    }
    const prompt = '针对下面这段内容，' + (wf === 'lesson' ? '整理成讲义要点' : '写一份上课讲解') + '：\n' + ctx;
    const node = create(wf, { x: o.x + o.w + 24, y: o.y, prompt, ctx });
    GW.toast('已在这个项目旁边新建 AI 节点');
    return node;
  }

  GW.nodes = { WORKFLOWS: PRESETS, all, get, create, openPicker, fromObject, runNode, land, parseWorkflow, custom, saveCustom, exportFlow, _parseJson: parseJson };
  register();
})();

