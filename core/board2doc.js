/* 数理无限画布 · 整块板书转排版
 * ─────────────────────────────────────────────────────────────────────────
 * 框选一块板书 → 渲染成一张图 → 让云端模型吐「带结构的 JSON」（标题/正文/公式/列表）
 * → 合成一个可编辑的 rich-text 对象（公式用 KaTeX 渲染）贴在旁边。
 *
 * 设计取舍：
 *  1. 版面分组在服务端做不了，这里也不做：整块图直接给模型，让它按看到的行文分块。
 *     好处是横排、多栏、公式插在句子中间都能处理；坏处是模型可能把两行并成一段。
 *     所以提示里写死「按看到的视觉行文分块，别改写、别合并」，且最多 200 块。
 *  2. 生成后**默认保留原板书**（老师可以对照），设置里可改；另给一个「只留排版版」按钮。
 *  3. 输出是 text 对象（editable:true），双击还能改字；公式是 KaTeX 的 HTML，不额外建对象，
 *     避免一块板书变成几十个散落对象。
 *  4. 取消/失败时不留半成品：对象只在全部解析成功后才 create。
 */
(function () {
  const GW = window.GW;
  if (!GW || GW.layout) return;
  const h = GW.h;
  const KEY = 'gewu.layout';
  const DEF = {
    keepOriginal: true,     // 默认保留原板书
    style: 'lesson',        // lesson=讲义 / board=板书 / compact=紧凑
    fontSize: 20,           // 世界坐标下的字号
    width: 760,             // 排版版宽度（屏幕像素，落地时按相机换算）
    maxBlocks: 200,
  };
  const STYLE = {
    lesson: { lh: 1.75, h1: 1.5, gap: 10, pad: '6px 2px' },
    board: { lh: 1.6, h1: 1.38, gap: 6, pad: '2px 0' },
    compact: { lh: 1.45, h1: 1.3, gap: 4, pad: '0' },
  };

  function settings() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { s = null; }
    return Object.assign({}, DEF, s || {});
  }
  function saveSettings(patch) {
    const s = Object.assign(settings(), patch || {});
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* 隐私模式下写不进去，不影响本次 */ }
    return s;
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ---------- 选区 → 墨迹 ----------
  function strokesOf(items) {
    const out = [];
    for (const it of items || []) if (it && it.kind === 'stroke' && it.pts && it.pts.length >= 4) out.push(it);
    return out;
  }
  function bboxOf(strokes) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const s of strokes) {
      for (let i = 0; i < s.pts.length; i += 2) {
        const x = s.pts[i], y = s.pts[i + 1];
        if (x < x1) x1 = x; if (x > x2) x2 = x;
        if (y < y1) y1 = y; if (y > y2) y2 = y;
      }
    }
    if (!isFinite(x1)) return null;
    return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
  }

  // 渲染：白底黑字、只留包围盒、最长边归一到 ~1400（视觉模型每图最多约 1024 token，太大反而被压缩）。
  // 返回 PNG 字节。
  function renderPng(strokes, opt) {
    const b = bboxOf(strokes);
    if (!b) return Promise.resolve(null);
    const o = opt || {};
    const PAD = 28;
    const scale = Math.max(0.2, Math.min(3, Math.min(1400 / Math.max(1, b.w), 1000 / Math.max(1, b.h))));
    const cv = document.createElement('canvas');
    cv.width = Math.round(b.w * scale + PAD * 2);
    cv.height = Math.round(b.h * scale + PAD * 2);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = '#111';
    g.lineWidth = Math.max(2.4, 3.2 * scale);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const s of strokes) {
      const p = s.pts;
      g.beginPath();
      g.moveTo((p[0] - b.x) * scale + PAD, (p[1] - b.y) * scale + PAD);
      for (let i = 2; i < p.length; i += 2) g.lineTo((p[i] - b.x) * scale + PAD, (p[i + 1] - b.y) * scale + PAD);
      g.stroke();
    }
    return new Promise((res) => {
      if (o.canvas) { res(cv); return; }
      cv.toBlob((blob) => {
        if (!blob) return res(null);
        blob.arrayBuffer().then((buf) => res(new Uint8Array(buf)));
      }, 'image/png');
    });
  }

  // ---------- 提示词 ----------
  const SYS = [
    '你是课堂板书排版引擎。用户给你一张手写板书的图片，你把它转成结构化的排版内容。',
    '只输出一个 JSON 对象，不要 markdown 代码块，不要解释。格式：',
    '{"title":"可选的一句话标题","blocks":[{"kind":"heading|text|formula|list","text":"...","tex":"...","items":["..."]}]}',
    '规则：',
    '1. 按图片里的视觉行文分块：一行标题就是 heading，一段说明就是 text，独立成行的数学式就是 formula。',
    '2. 文字**逐字照抄**：不许改错别字、不许补标点、不许把口语改成书面语、不许合并两行。看不清的字写 □。',
    '3. 公式放 tex（不带 $），忠实还原分式、根号、上下标、积分上下限；不要把 \\frac 展开成 a/b。',
    '4. 并列的几条（编号、破折号、项目符号）合成一个 list，每条一行。',
    '5. 图里没有可读内容就回 {"title":"","blocks":[]}。',
    '6. 最多 200 块；不要输出除 JSON 以外的任何字符。',
  ].join('\n');

  function stripFence(t) {
    let s = String(t || '').trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i >= 0 && j > i) s = s.slice(i, j + 1);
    return s;
  }

  function parseSpec(text) {
    let j;
    try { j = JSON.parse(stripFence(text)); } catch (_) { return { error: '模型没有返回 JSON' }; }
    if (!j || typeof j !== 'object') return { error: '返回不是对象' };
    const blocks = Array.isArray(j.blocks) ? j.blocks : [];
    if (!blocks.length) return { error: '没识别出内容（可能是空白或只有图形）' };
    return { title: String(j.title || '').slice(0, 120), blocks: blocks.slice(0, DEF.maxBlocks) };
  }

  // ---------- 合成 HTML ----------
  function buildHtml(spec, st) {
    const sy = STYLE[st.style] || STYLE.lesson;
    const parts = [];
    if (spec.title) {
      parts.push('<p style="margin:0 0 ' + (sy.gap + 4) + 'px;font-size:' + (st.fontSize * sy.h1).toFixed(1) +
        'px;font-weight:700;line-height:1.35">' + esc(spec.title) + '</p>');
    }
    let dropped = 0;
    for (const b of spec.blocks) {
      const kind = String(b && b.kind || '').toLowerCase();
      if (kind === 'heading') {
        const t = String(b.text || '').trim();
        if (!t) { dropped++; continue; }
        parts.push('<p style="margin:' + (sy.gap + 6) + 'px 0 ' + sy.gap + 'px;font-size:' + (st.fontSize * sy.h1).toFixed(1) +
          'px;font-weight:700;line-height:1.4">' + esc(t) + '</p>');
      } else if (kind === 'formula') {
        const tex = String(b.tex || b.text || '').trim();
        if (!tex) { dropped++; continue; }
        let html;
        try {
          html = window.katex.renderToString(tex, { displayMode: true, throwOnError: false, output: 'html' });
        } catch (_) { html = esc(tex); }
        parts.push('<div style="margin:' + (sy.gap + 2) + 'px 0;text-align:center">' + html + '</div>');
      } else if (kind === 'list') {
        const items = (Array.isArray(b.items) ? b.items : []).map((x) => String(x || '').trim()).filter(Boolean);
        if (!items.length) { dropped++; continue; }
        parts.push('<ul style="margin:' + sy.gap + 'px 0 ' + sy.gap + 'px 1.4em;padding:0;line-height:' + sy.lh + '">' +
          items.map((x) => '<li style="margin:0 0 ' + Math.round(sy.gap / 2) + 'px">' + esc(x) + '</li>').join('') + '</ul>');
      } else {
        const t = String(b.text || '').trim();
        if (!t) { dropped++; continue; }
        parts.push('<p style="margin:0 0 ' + sy.gap + 'px;line-height:' + sy.lh + '">' + esc(t) + '</p>');
      }
    }
    return { html: parts.join(''), dropped };
  }

  // ---------- 落地 ----------
  function insertDoc(html, box, st) {
    const s = GW.camera.s;
    const W = st.width / s;
    const tmp = h('div', { style: { position: 'absolute', visibility: 'hidden', width: (st.width - 28) + 'px', fontSize: st.fontSize + 'px' } });
    tmp.innerHTML = html;
    document.body.append(tmp);
    let hh = 0;
    try { hh = tmp.scrollHeight || 0; } catch (_) { hh = 0; }
    tmp.remove();
    if (!hh) hh = Math.max(80, st.fontSize * 6);
    const obj = GW.objects.create('text', {
      html: html, size: st.fontSize, color: '#1b2433', ai: true,
    }, { w: W, h: (hh + 24) / s, x: box.x, y: box.y, exact: true });
    return obj;
  }

  let BUSY = false;

  async function convertSelection() {
    if (BUSY) return;
    const sel = GW.selection && GW.selection.items ? GW.selection.items : [];
    const strokes = strokesOf(sel);
    if (!strokes.length) {
      GW.toast('先用选择工具框选一块板书（只框笔迹）');
      return;
    }
    const cfg = GW.ocr && GW.ocr.config ? GW.ocr.config() : null;
    if (GW.ocr && GW.ocr.canAsk ? !GW.ocr.canAsk() : (!cfg || !cfg.key)) {
      GW.toast('还没填识别服务的 Key：插入菜单 → 手写公式 → 识别服务设置', 4200);
      return;
    }
    const box = bboxOf(strokes);
    // 1.5.4 复审 #7：结果回来时可能已经换了文档 / 换了页 —— 记下身份，落地前必须一致。
    const tok = GW.docTok ? GW.docTok() : 0;
    const pageId = GW.page() && GW.page().id;
    const lost = () => (GW.docTok && GW.docTok() !== tok) || !(GW.page() && GW.page().id === pageId);
    BUSY = true;
    const tip = GW.toast('正在把这块板书转成排版…（大约 3~10 秒）', 60000);
    try {
      const png = await renderPng(strokes);
      if (!png) throw new Error('这块板书是空的');
      const r = await GW.ocr.ask(png, SYS, '把这张板书转成 JSON。忠实照抄，不要改写。', { json: true, maxTokens: 2200 });
      if (lost()) throw new Error('这块板书所在的文档/页已经切换，本次排版已取消（新文档没有被改动）');
      if (r.error) throw new Error(r.error);
      const spec = parseSpec(r.text);
      if (spec.error) throw new Error(spec.error);
      const st = settings();
      const built = buildHtml(spec, st);
      if (!built.html) throw new Error('这版排版是空的（可能只框到了图形）');
      if (lost()) throw new Error('文档已经切换，本次排版已取消');
      const obj = insertDoc(built.html, { x: box.x + box.w + 36 / GW.camera.s, y: box.y }, st);
      if (!st.keepOriginal) {
        // 与建对象合成一步：GW.addItems(obj,false) 已经由 objects.create 记录过，
        // 这里改成「一条 op 同时带 add 与 remove」，Ctrl+Z 一次就能整块退回。
        GW.removeItems(strokes, false);
        GW.commit({ add: [obj], remove: strokes.slice() });
      }
      GW.selection.clear();
      if (tip) tip.remove();
      GW.toast('已生成排版版' + (st.keepOriginal ? '（原板书保留在左侧）' : '，原板书已移除（Ctrl+Z 可退回）') +
        (built.dropped ? '；丢弃空块 ' + built.dropped + ' 个' : ''), 3600);
      return obj;
    } catch (e) {
      if (tip) tip.remove();
      GW.toast('转排版失败：' + (e && e.message ? e.message : e), 5200);
      return null;
    } finally {
      BUSY = false;
    }
  }

  // ---------- 设置面板 ----------
  function openSettings() {
    const st = settings();
    const selStyle = h('select', { class: 'hw-input' },
      h('option', { value: 'lesson' }, '讲义（宽松，行距 1.75）'),
      h('option', { value: 'board' }, '板书（中等，行距 1.6）'),
      h('option', { value: 'compact' }, '紧凑（省版面，行距 1.45）'));
    selStyle.value = st.style;
    const keep = h('input', { type: 'checkbox' });
    keep.checked = !!st.keepOriginal;
    const size = h('input', { class: 'hw-input', type: 'number', min: 12, max: 64, step: 1 });
    size.value = st.fontSize;
    const wid = h('input', { class: 'hw-input', type: 'number', min: 320, max: 1600, step: 20 });
    wid.value = st.width;
    const row = (a, b, c) => h('div', { class: 'set-row' }, h('div', null, h('b', null, a), h('span', null, b)), c);
    const body = h('div', null,
      row('保留原板书', '生成后原来的手写留在左边，便于对照；关掉则替换', keep),
      row('排版风格', '影响行距与标题比例', selStyle),
      row('字号', '世界坐标字号，缩放画布时会跟着变', size),
      row('排版宽度', '屏幕像素宽度（100% 缩放时）', wid),
      h('p', { style: { margin: '10px 0 0', color: '#6b7280', fontSize: '13px', lineHeight: '1.6' } }, '识别服务沿用「手写公式」里填的那一个（DeepSeek / 自建接口支持整版；SimpleTex、Mathpix 只回单条公式）。'));
    GW.dialog({
      title: '板书转排版设置', width: 520, body, ok: '保存',
      onOk() {
        saveSettings({
          keepOriginal: !!keep.checked,
          style: selStyle.value,
          fontSize: Math.max(12, Math.min(64, +size.value || 20)),
          width: Math.max(320, Math.min(1600, +wid.value || 760)),
        });
        GW.toast('已保存，下次转排版直接生效', 2200);
      },
    });
  }

  GW.layout = { settings, saveSettings, renderPng, parseSpec, buildHtml, convertSelection, openSettings, SYS };
})();
