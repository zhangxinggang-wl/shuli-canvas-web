/* =============================================================
 * AI 学习工具（1.0.13）
 *   GW.study = { open, quiz, grade, mistakes, summary, solve, exportNotes, plot, chem }
 *
 * 复用两套已有设施，不新增网络依赖：
 *   · GW.ocr.ask(png, sys, user, opt) —— 走主进程转发（Key 由用户自己填）
 *   · GW.layout.renderPng(strokes)    —— 墨迹 → 白底黑字 PNG
 * 这一层只做三件事：取选区 → 拼提示词 → 把结果落成画布对象。
 * ============================================================= */
(function () {
  if (!GW || GW.study) return;

  const MKEY = 'gewu.mistakes';
  const CKEY = 'gewu.study';

  // ---------- 配置 ----------
  function cfg() {
    try { return Object.assign({ grade: '高一', subject: '数学', keepMistakes: true }, JSON.parse(localStorage.getItem(CKEY) || '{}') || {}); }
    catch (e) { return { grade: '高一', subject: '数学', keepMistakes: true }; }
  }
  function saveCfg(patch) {
    const c = Object.assign(cfg(), patch || {});
    try { localStorage.setItem(CKEY, JSON.stringify(c)); } catch (e) { /* 存不下就只在本次生效 */ }
    return c;
  }
  function who() { const c = cfg(); return c.grade + '·' + c.subject; }

  // ---------- 小工具 ----------
  function parseJson(s) {
    let t = String(s || '').trim();
    if (!t) return null;
    if (t.slice(0, 7) === '```json') t = t.slice(7);
    if (t.slice(0, 3) === '```') t = t.slice(3);
    if (t.slice(-3) === '```') t = t.slice(0, -3);
    const i = t.indexOf('{'), j = t.lastIndexOf('}');
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
    try { return JSON.parse(t); } catch (e) { return null; }
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function needKey() {
    // 1.4.0：GW.ocr.ask 已转发到统一的 GW.ai.ask，Key 也统一在 GW.aicfg 里，
    // 前置检查必须跟着改，否则「填了通用 Key 仍提示没填」。
    if (GW.aicfg && GW.ai && GW.aicfg.key) {
      const pv = GW.aicfg.provider();
      if (!GW.aicfg.key(pv)) {
        GW.toast('先填一个 Key：AI 助手 → 模型与密钥');
        return true;
      }
      return false;
    }
    const c = GW.ocr && GW.ocr.config ? GW.ocr.config() : null;
    if (GW.ocr && GW.ocr.canAsk ? !GW.ocr.canAsk() : (!c || !c.key)) {
      GW.toast('先填一个 Key：插入菜单 →「手写公式」→「在线识别」→ 识别服务设置');
      return true;
    }
    return false;
  }

  function selInk() { return ((GW.selection && GW.selection.items) || []).filter((it) => it && it.kind === 'stroke'); }
  function selObjs() { return ((GW.selection && GW.selection.items) || []).filter((it) => it && it.kind !== 'stroke'); }
  function selBounds() {
    const its = (GW.selection && GW.selection.items) || [];
    if (!its.length) return null;
    const b = GW.selection.bounds();
    return b && b.w > 0 && b.h > 0 ? b : null;
  }

  // 选区的图：墨迹自己渲染；单张图片直接画进 canvas；其它（PDF 页）不支持
  async function pngOfSelection() {
    const ink = selInk();
    if (ink.length) {
      const png = await GW.layout.renderPng(ink);
      if (!png) throw new Error('选中的板书是空的');
      return png;
    }
    const objs = selObjs();
    const img = objs.find((o) => o.type === 'image');
    if (!img) throw new Error('先用选择工具框住要处理的板书（或选中一张图片）');
    const src = img.data.asset ? GW.assets.url(img.data.asset) : img.data.src;
    const el = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('这张图片读不出来'));
      im.src = src;
    });
    const max = 1400;
    const k = Math.min(1, max / Math.max(el.width, el.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(el.width * k));
    cv.height = Math.max(1, Math.round(el.height * k));
    cv.getContext('2d').drawImage(el, 0, 0, cv.width, cv.height);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (!blob) throw new Error('图片转 PNG 失败');
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function askJson(sys, user, png, maxTokens) {
    const r = await GW.ocr.ask(png, sys, user, { json: true, maxTokens: maxTokens || 1600 });
    if (r && r.error) throw new Error(r.error);
    const o = parseJson(r && r.text);
    if (!o) throw new Error('模型没返回可用的 JSON，稍后再试一次');
    return { o, tok: (r && r.tok) || 0 };
  }

  // 落一个文本对象（尺寸按内容量一次，避免手调）
  function addTextObj(html, anchor, page) {
    const s = GW.camera.s;
    const fs = 30;
    const w = Math.min(760, Math.max(320, window.innerWidth * 0.42)) / s;
    const tmp = GW.h('div', { style: { position: 'absolute', visibility: 'hidden', width: (w * s) + 'px', fontSize: fs + 'px', whiteSpace: 'pre-wrap', lineHeight: '1.6' } });
    tmp.innerHTML = html;
    document.body.append(tmp);
    const hh = Math.max(120, tmp.scrollHeight + 24) / s;
    tmp.remove();
    const b = anchor || selBounds() || GW.viewCenter();
    const o = GW.objects.create('text', { html, size: fs, color: GW.tool.pen.color }, { w, h: hh, exact: true, x: b.x, y: b.y, page: page || undefined });
    return o;
  }

  // 生成结果时把原板书挪到下面，免得重叠（保留原板书，不删）
  function dropBelow() {
    const b = selBounds();
    if (!b) return GW.viewCenter();
    return { x: b.x, y: b.y + b.h + 40 / GW.camera.s };
  }

  async function run(promise, busyText) {
    GW.toast(busyText || 'AI 正在看…');
    const tok = GW.docTok ? GW.docTok() : 0;
    try {
      const r = await promise;
      // 1.5.4 复审 #7：等结果期间换了文档/新建了文档，就别再把结果落到新文档上。
      if (GW.docTok && GW.docTok() !== tok) throw new Error('文档已经切换，这次 AI 结果已丢弃');
      return r;
    }
    catch (e) { GW.toast('没做成：' + (e && e.message ? e.message : e)); return null; }
  }

  // ---------- 1~4. 四个「看图做事」的任务 ----------
  // 提示词与渲染只写一份：在线（API）走 askJson，免费网页版走「复制提示词 / 粘回回答」，
  // 两条路的结果必须长得一模一样，否则老师在两种模式下会得到两种排版。
  function tasks() {
    const w = who();
    return {
      quiz: {
        label: '① 出 3 道变式练习', max: 1800,
        sys: '你是' + w + '老师。看这张板书/题目，出 3 道同水平的变式练习。只输出 JSON：'
          + '{"title":"小标题","items":[{"q":"题干（可用 LaTeX，用 $…$ 包裹）","a":"答案","hint":"一句提示"}]}。'
          + '题干必须能独立作答，不要只写「同上」；难度与原题持平。',
        user: '按这个内容出 3 道变式练习，只回 JSON。',
        render(o) {
          const items = (o.items || []).slice(0, 6);
          if (!items.length) throw new Error('没有出出题来');
          return {
            html: '<b>' + esc(o.title || '随堂练习') + '</b><br>'
              + items.map((it, i) => (i + 1) + '. ' + esc(it.q || '') + (it.a ? '<br><span style="opacity:.7;font-size:.82em">答案：' + esc(it.a) + '</span>' : '')).join('<br>'),
            note: '已出 ' + items.length + ' 道练习',
          };
        },
      },
      grade: {
        label: '② 拍照批改作业', max: 1800,
        sys: '你是' + w + '老师，正在批改学生作业。逐题判断对错，指出错在哪一步（要具体，不要只说「粗心」）。只输出 JSON：'
          + '{"title":"作业","score":"3/5","items":[{"no":1,"ok":true,"why":"..."}],"comment":"整体一句评语"}。'
          + '看不清的地方判 ok=false、why 写「看不清」；不许替学生改答案。',
        user: '批改这份作业，只回 JSON。',
        render(o) {
          const items = (o.items || []).slice(0, 30);
          const wrong = items.filter((x) => !x.ok);
          const html = '<b>' + esc(o.title || '批改') + '</b>　<span style="color:#e4572e">' + esc(o.score || '') + '</span><br>'
            + items.map((x) => (x.ok ? '✅ ' : '❌ ') + '第 ' + esc(x.no) + ' 题' + (x.why ? '：' + esc(x.why) : '')).join('<br>')
            + (o.comment ? '<br><span style="opacity:.75">评语：' + esc(o.comment) + '</span>' : '');
          let note = '已批改';
          if (cfg().keepMistakes !== false && wrong.length) {
            const arr = loadMistakes();
            for (const x of wrong) arr.push({ t: Date.now(), title: o.title || '作业', no: x.no, why: x.why || '', score: o.score || '' });
            saveMistakes(arr);
            note = '已批改，错题存进错题本（' + wrong.length + ' 道）';
          }
          return { html, note };
        },
      },
      summary: {
        label: '③ 板书 → 课堂要点', max: 1200,
        sys: '把这张板书整理成本节课的要点。只输出 JSON：{"title":"标题","points":["要点1","要点2"],"homework":"一句作业建议"}。'
          + '要点 3~8 条，每条不超过 30 字，只写板书里真有的内容，不许补充课外知识。',
        user: '整理这段板书的要点，只回 JSON。',
        render(o) {
          const pts = (o.points || []).slice(0, 10);
          const html = '<b>' + esc(o.title || '课堂要点') + '</b><br>' + pts.map((p, i) => (i + 1) + '. ' + esc(p)).join('<br>')
            + (o.homework ? '<br><span style="opacity:.75">作业：' + esc(o.homework) + '</span>' : '');
          return { html, note: '要点已落画布', copy: pts.map((p, i) => (i + 1) + '. ' + p).join('\n') };
        },
      },
      solve: {
        label: '④ 题目 → 分步讲解', max: 2200,
        sys: '你是' + w + '老师。看这道题，给出**分步**讲解。只输出 JSON：'
          + '{"title":"题目复述","steps":["第 1 步：…","第 2 步：…"],"answer":"最终答案","trap":"易错点"}。'
          + '每步写清「做什么 + 为什么」，公式用 $…$ 包裹；不确定的地方写「需确认条件」，不许编造数据。',
        user: '讲解这道题，只回 JSON。',
        render(o) {
          const steps = (o.steps || []).slice(0, 20);
          const html = '<b>' + esc(o.title || '题目讲解') + '</b><br>' + steps.map((s, i) => (i + 1) + '. ' + esc(s)).join('<br>')
            + (o.answer ? '<br><b>答案：</b>' + esc(o.answer) : '')
            + (o.trap ? '<br><span style="color:#e4572e">易错：' + esc(o.trap) + '</span>' : '');
          return { html, note: '讲解已落画布' };
        },
      },
    };
  }

  // 把模型返回的 JSON 落成画布对象（两条路共用）
  function land(T, o, page) {
    const r = T.render(o);
    addTextObj(r.html, dropBelow(), page);
    if (r.copy) {
      try {
        Promise.resolve(navigator.clipboard.writeText(r.copy))
          .then(() => GW.toast(r.note + '，并复制到剪贴板'))
          .catch(() => GW.toast(r.note));
      } catch (e) { GW.toast(r.note); }
    } else GW.toast(r.note);
    return o;
  }

  async function runTask(kind, busyText) {
    if (needKey()) return null;
    const T = tasks()[kind];
    const page0 = GW.page();   // 复审 B10：结果落回发起时那一页
    return run((async () => {
      const png = await pngOfSelection();
      const { o } = await askJson(T.sys, T.user, png, T.max);
      return land(T, o, page0);
    })(), busyText || 'AI 正在看…');
  }

  const quiz = () => runTask('quiz', '正在出题…');
  const grade = () => runTask('grade', '正在批改…');
  const summary = () => runTask('summary', '正在整理要点…');
  const solve = () => runTask('solve', '正在讲解…');

  // ---------- 2. 批改 ----------
  function loadMistakes() {
    try { const a = JSON.parse(localStorage.getItem(MKEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function saveMistakes(a) {
    try { localStorage.setItem(MKEY, JSON.stringify(a.slice(-200))); } catch (e) { /* 满了就算了 */ }
  }

  function mistakes() {
    const arr = loadMistakes();
    const list = GW.h('div', { style: { maxHeight: '46vh', overflow: 'auto' } },
      arr.slice().reverse().slice(0, 80).map((m) => GW.h('div', { style: { padding: '6px 2px', borderBottom: '1px solid rgba(0,0,0,.08)' } },
        GW.h('b', null, (m.title || '作业') + ' · 第 ' + m.no + ' 题'),
        GW.h('div', { class: 'if-hint' }, m.why || ''))));
    if (!arr.length) list.append(GW.h('div', { class: 'if-hint' }, '还是空的：用「拍照批改」批一次，错的题自动进来'));
    const clear = GW.h('button', { class: 'gw-btn', onclick: () => { saveMistakes([]); list.textContent = ''; GW.toast('错题本已清空'); } }, '清空错题本');
    return GW.dialog({
      title: '错题本', width: 560, ok: '关闭',
      body: GW.h('div', null,
        GW.h('div', { class: 'if-hint', style: { marginBottom: '8px' } }, arr.length ? '共 ' + arr.length + ' 道（存在本机，最多留 200 道）' : ''),
        list, GW.h('div', { style: { marginTop: '10px' } }, clear)),
    });
  }

  // ---------- 5. 讲义导出（把画布上的文本/公式排成一份可交出去的 HTML/Word） ----------
  function collectNotes() {
    // 选中了文本/公式就只导选中的；否则整页的文本和公式都导
    const picked = ((GW.selection && GW.selection.items) || []).filter((o) => o && (o.type === 'text' || o.type === 'formula'));
    const objs = (picked.length ? picked : GW.page().objs).filter((o) => o && (o.type === 'text' || o.type === 'formula'));
    return objs;
  }
  function texToMathml(tex) {
    try { return window.katex.renderToString(String(tex || ''), { displayMode: true, throwOnError: false, output: 'mathml' }); }
    catch (e) { return '<code>' + esc(tex) + '</code>'; }
  }
  function notesHtml(title) {
    const objs = collectNotes();
    if (!objs.length) throw new Error('画布上还没有文本或公式');
    const parts = objs.map((o) => {
      if (o.type === 'formula') return '<div class="fx">' + texToMathml(o.data.tex) + '</div>';
      return '<div class="tx">' + (o.data.html || '') + '</div>';
    });
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title || '课堂讲义') + '</title>'
      + '<style>body{font:16px/1.75 system-ui,"Microsoft YaHei",sans-serif;max-width:820px;margin:36px auto;padding:0 20px;color:#1b2433}'
      + 'h1{font-size:22px;margin:0 0 18px}.tx{margin:10px 0}.fx{margin:14px 0;text-align:center}'
      + '@media print{body{margin:0}}</style></head><body><h1>' + esc(title || '课堂讲义') + '</h1>' + parts.join('\n') + '</body></html>';
  }
  async function exportNotes() {
    return run((async () => {
      const title = (GW.page().name || '课堂讲义') + ' · ' + new Date().toLocaleDateString('zh-CN');
      const html = notesHtml(title);
      const api = window.gewu || {};
      if (!api.saveDialog || !api.writeFile) throw new Error('导出要在桌面版里用');
      const p = await api.saveDialog({ title: '导出讲义', defaultPath: title.replace(/[\\/:*?"<>|]/g, '-') + '.html', filters: [{ name: '网页（Word 也能打开）', extensions: ['html'] }, { name: 'Word 文档', extensions: ['doc'] }] });
      if (!p) return null;
      await api.writeFile(p, html, 'utf8');
      GW.toast('已导出：' + p);
      return { path: p, count: collectNotes().length };
    })(), '正在导出讲义…');
  }

  // ---------- 6. 手写函数式 → 画图（纯本地，不花 token） ----------
  function texToJs(tex) {
    let s = String(tex || '');
    s = s.replace(/\\left|\\right|\\,|\\;|\\!|\\ /g, '');
    s = s.replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=\s*/i, '');
    for (let i = 0; i < 8; i++) s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))');
    for (let i = 0; i < 4; i++) s = s.replace(/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)');
    s = s.replace(/\\pi/g, 'PI').replace(/\\cdot|\\times/g, '*').replace(/\\div/g, '/')
      .replace(/\\sin/g, 'sin').replace(/\\cos/g, 'cos').replace(/\\tan/g, 'tan')
      .replace(/\\ln/g, 'ln').replace(/\\log/g, 'log10').replace(/\\abs/g, 'abs')
      .replace(/\^/g, '**').replace(/−/g, '-');
    return s.replace(/\{/g, '(').replace(/\}/g, ')').trim();
  }
  function sample(fn, x0, x1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      let y;
      try { y = fn(x); } catch (e) { y = NaN; }
      out.push(x, isFinite(y) ? Math.max(-1e6, Math.min(1e6, y)) : NaN);
    }
    return out;
  }
  // 画一条 y=f(x)（anchor 是左上角，默认在公式对象右侧）
  function drawCurve(js, anchor) {
    let fn;
    try {
      fn = GW.compileExpr(js.replace(/\*\*/g, '^').replace(/\bPI\b/g, 'pi').replace(/\blog10\b/g, 'lg'));
    } catch (e) {
      GW.toast('这个式子还画不出来：' + (e && e.message ? e.message : e) + '。可先把式子改成 y=x^2-1 这种形式');
      return null;
    }
    const W = 620 / GW.camera.s, H = W * 0.62;
    const x0 = anchor.x, y0 = anchor.y;
    const X0 = -6, X1 = 6, N = 240;
    const pts = sample(fn, X0, X1, N);
    let lo = Infinity, hi = -Infinity;
    for (let i = 1; i < pts.length; i += 2) if (isFinite(pts[i])) { lo = Math.min(lo, pts[i]); hi = Math.max(hi, pts[i]); }
    if (!isFinite(lo)) { GW.toast('这条曲线在 -6..6 之间没有有效点'); return null; }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const px = (x) => x0 + ((x - X0) / (X1 - X0)) * W;
    const py = (y) => y0 + H - ((y - lo) / (hi - lo)) * H;
    // 断点（NaN / 巨跳）拆段
    const segs = [];
    let cur = [];
    let last = null;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], y = pts[i + 1];
      if (!isFinite(y) || (last != null && Math.abs(y - last) > (hi - lo) * 3)) {
        if (cur.length >= 4) segs.push(cur);
        cur = [];
        last = null;
        continue;
      }
      cur.push(px(x), py(y));
      last = y;
    }
    if (cur.length >= 4) segs.push(cur);
    if (!segs.length) { GW.toast('这条曲线没画出连续的一段'); return null; }
    const ax = [px(0), py(0), px(0), py(lo - (hi - lo) * 0.06)];   // y 轴
    const ay = [px(X0), py(0), px(X1), py(0)];                      // x 轴
    const item = { kind: 'shape', type: 'multi', x: x0, y: y0, w: W, h: H, width: 2.4, fill: null, color: GW.tool.pen.color, segs: [ax, ay].concat(segs), texts: [{ x: px(X0), y: py(0) + 16, s: 'x', t: 20 }, { x: px(0) - 16, y: py(hi) + 8, s: 'y', t: 20 }] };
    GW.addItems([item]);
    return item;
  }

  // 手写函数式 → 画图：1.0.13 起走 API（模型把图里的式子读成 LaTeX），
  // 选中的是已经成形的公式对象时就不用再花一次请求。
  const PLOT_SYS = '看这张手写图，把它里面的函数式逐条读出来。只输出 JSON：'
    + '{"exprs":[{"tex":"y=x^{2}-1"}],"none":false}。'
    + 'tex 只用 LaTeX、必须能写成 y=f(x)；一个图里有多条就按顺序都列出来；'
    + '看不清或不是函数式就返回 {"exprs":[],"none":true}，不许猜、不许编。';
  async function plot() {
    const items = (GW.selection && GW.selection.items) || [];
    const f = items.find((o) => o && o.type === 'formula');
    if (f) {
      const js = texToJs(f.data.tex);
      const it = drawCurve(js, { x: f.x + f.w + 40 / GW.camera.s, y: f.y });
      if (!it) return null;
      GW.selection.set([it]);
      GW.toast('已按 ' + js + ' 画出曲线（可撤销）');
      return it;
    }
    if (!selInk().length) { GW.toast('先用选择工具框住手写的公式（或选中一个公式对象），再点「函数画图」'); return null; }
    if (needKey()) return null;
    return run((async () => {
      const png = await pngOfSelection();
      const { o } = await askJson(PLOT_SYS, '读出图里的函数式，只回 JSON。', png, 900);
      const exprs = (o.exprs || []).filter((e) => e && e.tex).slice(0, 3);
      if (!exprs.length || o.none) throw new Error('没从这张图里读出函数式（要写成 y=… 的形式）');
      const b = selBounds() || GW.viewCenter();
      const made = [];
      for (let i = 0; i < exprs.length; i++) {
        const it = drawCurve(texToJs(exprs[i].tex), { x: b.x, y: b.y + b.h + 40 / GW.camera.s + i * (620 / GW.camera.s) * 0.72 });
        if (it) made.push(it);
      }
      if (!made.length) throw new Error('读出来的式子画不成曲线');
      GW.selection.set(made);
      GW.toast('已按「' + exprs.map((e) => e.tex).join('、') + '」画出 ' + made.length + ' 条曲线（可撤销）');
      return made;
    })(), 'AI 正在读式子…');
  }

  // ---------- 7. 化学式（mhchem） ----------
  function chem() {
    const inp = GW.h('input', { class: 'hw-input', placeholder: '例：2H2 + O2 -> 2H2O', style: { width: '100%' } });
    const d = GW.dialog({
      title: '化学式', width: 460,
      body: GW.h('div', null,
        GW.h('div', { class: 'if-hint', style: { marginBottom: '6px' } }, '按 mhchem 写法（-> 表示箭头，^ 表示上标，_ 表示下标），自动转成 \u5316\u5b66\u5f0f'),
        inp),
      ok: '插入', onOk: () => {
        const t = (inp.value || '').trim();
        if (!t) return;
        const tex = '\\ce{' + t + '}';
        addTextObj('<span style="font-size:.9em">' + esc(t) + '</span>');
        GW.objects.create('formula', { tex, color: GW.tool.pen.color }, { w: 420 / GW.camera.s, h: 110 / GW.camera.s, exact: true });
        d.close();
        GW.toast('已插入化学式（右击可再编辑）');
      },
    });
    return d;
  }

  // ---------- 免费网页版 AI（不用 Key） ----------
  // 老师没有 API Key 时的兜底：本机拼好提示词 → 复制 → 在网页版 AI 里问 → 把回答粘回来。
  // 粘回来的 JSON 走的是同一个 land()，所以排版和在线模式一模一样。
  function bytesToB64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  async function saveSelPng() {
    const png = await pngOfSelection();
    const api = window.gewu || {};
    if (!api.saveDialog || !api.writeFile) throw new Error('保存图片要在桌面版里用');
    const p = await api.saveDialog({
      title: '保存要上传的图片', defaultPath: '板书-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png',
      filters: [{ name: '图片 PNG', extensions: ['png'] }],
    });
    if (!p) return null;
    await api.writeFile(p, bytesToB64(png), 'base64');
    return p;
  }
  function webAI() {
    const ts = tasks();
    const keys = Object.keys(ts);
    const sel = GW.h('select', { class: 'hw-input', style: { width: '100%' } }, keys.map((k) => GW.h('option', { value: k }, ts[k].label)));
    const prompt = GW.h('textarea', { class: 'hw-input', style: { width: '100%', height: '132px', marginTop: '8px', fontFamily: 'Consolas, monospace', fontSize: '12px' }, readonly: true });
    const ans = GW.h('textarea', { class: 'hw-input', style: { width: '100%', height: '110px', marginTop: '8px' }, placeholder: '把网页 AI 的回答整段粘到这里（带 ```json 围栏也行）' });
    const msg = GW.h('div', { class: 'if-hint', style: { marginTop: '6px' } }, '');
    const fill = () => { const T = ts[sel.value]; prompt.value = T.sys + '\n\n' + T.user; msg.textContent = ''; };
    fill();
    sel.onchange = fill;
    const copyP = () => {
      try {
        Promise.resolve(navigator.clipboard.writeText(prompt.value))
          .then(() => { msg.textContent = '提示词已复制，去网页 AI 里粘贴（先上传图片）'; })
          .catch(() => { prompt.select(); msg.textContent = '浏览器不让写剪贴板：已全选，按 Ctrl+C 复制'; });
      } catch (e) { prompt.select(); msg.textContent = '已全选，按 Ctrl+C 复制'; }
    };
    const saveP = () => run((async () => {
      const p = await saveSelPng();
      if (p) msg.textContent = '图片已存到：' + p;
      return p;
    })(), '正在存图片…');
    const openP = () => {
      const api = window.gewu || {};
      const url = 'https://chat.deepseek.com/';
      if (api.openExternal) api.openExternal(url);
      else window.open(url, '_blank');
      msg.textContent = '已打开网页版 AI（也可以用豆包 / ChatGPT 之类）；图片上传后把上面的提示词粘进去';
    };
    // 1.4.0：画布内嵌网页版 AI 已删除 —— 真实浏览器更稳，也不会被站点改版打穿。
    // 免费网页版的入口统一收到「插入菜单 → AI 助手」。
    const d = GW.dialog({
      title: '免费网页版 AI（不用 Key）', width: 660, ok: '生成结果',
      body: GW.h('div', null,
        GW.h('div', { class: 'if-hint', style: { marginBottom: '6px' } }, '① 选任务 → ② 复制提示词 + 存下框选的图 → ③ 在网页 AI 里上传图片并粘贴提示词 → ④ 把它给的 JSON 粘回来'),
        sel,
        GW.h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' } },
          GW.h('button', { class: 'gw-btn', onclick: copyP }, '复制提示词'),
          GW.h('button', { class: 'gw-btn', onclick: saveP }, '保存框选的图'),
          GW.h('button', { class: 'gw-btn', onclick: openP }, '在外部浏览器打开')),
        prompt,
        GW.h('div', { class: 'if-hint', style: { marginTop: '8px' } }, '把回答粘在这里：'),
        ans, msg),
      onOk: () => {
        const o = parseJson(ans.value);
        if (!o) { GW.toast('没看懂粘进来的内容：要的是那段 JSON（带 ```json 围栏也行）'); return false; }
        try { land(ts[sel.value], o); } catch (e) { GW.toast('没做成：' + (e && e.message ? e.message : e)); return false; }
        return true;
      },
    });
    return d;
  }

  // ---------- 入口面板 ----------
  function open() {
    const btn = (t, sub, fn) => GW.h('button', {
      class: 'gw-btn', style: { display: 'block', width: '100%', textAlign: 'left', marginBottom: '8px', padding: '10px 14px' },
      onclick: () => { d.close(); setTimeout(fn, 60); },
    }, GW.h('b', null, t), GW.h('div', { class: 'if-hint', style: { marginTop: '2px' } }, sub));
    const c = cfg();
    const setSel = (k, v) => { saveCfg({ [k]: v }); GW.toast('已设置：' + v); };
    const d = GW.dialog({
      title: 'AI 学习工具', width: 620, noFooter: true,
      body: GW.h('div', null,
        GW.h('div', { class: 'if-hint', style: { marginBottom: '10px' } }, '当前：' + who() + '　（第一次用先到「手写公式 → 在线识别」里填 Key）'),
        btn('① 出 3 道变式练习', '框住板书/例题 → 生成同水平练习，落在下方', quiz),
        btn('② 拍照批改作业', '框住作业照片 → 逐题判对错 + 存进错题本', grade),
        btn('③ 板书 → 课堂要点', '框住板书 → 3~8 条要点，同时复制到剪贴板', summary),
        btn('④ 题目 → 分步讲解', '框住题目图片/板书 → 分步讲解 + 易错点', solve),
        btn('⑤ 导出讲义（HTML / Word）', '把画布上的文本和公式排成一份可发出去的文档', exportNotes),
        btn('⑥ 手写函数 → 自动画图', '框住手写公式 → AI 读成式子并画曲线（要 Key）；选中公式对象则直接画', plot),
        btn('⑦ 化学式（mhchem）', '输 2H2 + O2 -> 2H2O，自动排出化学式', chem),
        btn('⑧ 错题本', '查看/清空自动归档的错题', mistakes),
        btn('⑨ 免费网页版 AI（不用 Key）', '复制提示词 → 在网页 AI 里问 → 粘回回答，排版与在线模式一致', webAI),
        GW.h('div', { class: 'if-hint', style: { marginTop: '6px' } }, '年级/学科：'),
        GW.h('div', { class: 'hw-row', style: { display: 'flex', gap: '8px' } },
          GW.h('input', { class: 'hw-input', value: c.grade, style: { width: '120px' }, onchange: (e) => setSel('grade', e.target.value.trim() || '高一') }),
          GW.h('input', { class: 'hw-input', value: c.subject, style: { width: '120px' }, onchange: (e) => setSel('subject', e.target.value.trim() || '数学') }))),
    });
    return d;
  }

  GW.study = { open, quiz, grade, mistakes, summary, solve, exportNotes, plot, chem, webAI, _land: land, _saveSelPng: saveSelPng, config: cfg, saveConfig: saveCfg, _parseJson: parseJson, _texToJs: texToJs, _notesHtml: notesHtml, _tasks: tasks, mistakesData: loadMistakes };
})();


