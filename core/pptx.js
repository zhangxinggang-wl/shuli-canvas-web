/* PPTX / PPSX：只读取声明式课件内容，放映和输出共用绘制。 */
(function () {
  'use strict';
  const GW = window.GW, h = GW.h;
  // 2.2.5：64 MB 只是「内联进 .gewu」的上限。桌面版打开的本机路径 PPT 走烘焙产物外链，
  // 不再把源文件 base64 塞进存档，所以本机路径单独一档（512 MB）。
  const MB = 1024 * 1024, MAX_FILE = 64 * MB, MAX_ENTRY = 24 * MB, MAX_LOCAL = 512 * MB;
  const utf8 = new TextDecoder();
  const children = (n) => Array.from(n ? n.children : []);
  const child = (n, key) => children(n).find((v) => v.localName === key);
  const descendants = (n, key) => n ? Array.from(n.getElementsByTagNameNS('*', key)) : [];
  const attr = (n, k, fallback = '') => n && n.hasAttribute(k) ? n.getAttribute(k) : fallback;
  const px = (value) => (+value || 0) / 9525;
  const clamp = (v, low, high) => Math.min(high, Math.max(low, v));
  const relId = (node, key = 'id') => Array.from(node ? node.attributes : []).find((a) => a.localName === key && /\/relationships$/.test(a.namespaceURI || ''))?.value;

  // ── ZIP 中央目录（两条路共用同一份判据）───────────────────────────────
  // PPT-06：一份 217 MB 的课件以前是整份 readFile 进渲染进程再解析（V8 常驻 ~450 MB，
  // 自动备份/切页都跟着抖）。现在本机大文件只把**中央目录**（十几 KB）拿进来，条目按需随机读。
  // 关键约束：预算 / 名字穿越 / 重名 / 方法 / CRC / 防 zip 炸弹**只能有一份判据**，
  // 否则「≤64 MB 内联副本」和「文件后备」两条路迟早各错一半 —— 所以下面把判据抽出来共用。
  const zipBad = () => { throw new Error('PPT 压缩目录损坏或格式不受支持'); };
  /**
   * 压缩比判据（PPT-06 防 zip 炸弹）：单条目展开后 >8 MB 且展开比 >1000 倍就拒。
   * 真实课件里 media/*.mp4 本身已是压缩格式（比值≈1），xml 的比值能到几十倍但体积都很小，
   * 所以 8 MB + 1000 倍这两个门槛不会误伤，却能把「几百 KB 炸成几个 G」的构造挡在解压之前。
   */
  function zipRatioOk(packed, size) { return !(size > 8 * MB && packed > 0 && size / packed > 1000); }

  /** 中央目录解析：start/end 是中央目录在 dv 里的绝对区间，cdOffset 是中央目录在文件里的偏移。 */
  function zipIndex(dv, u16, u32, start, end, cdOffset, count) {
    const entries = new Map(), byteAt = dv.byteOffset;
    let cursor = start;
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > end || u32(cursor) !== 0x02014b50) zipBad();
      const flags = u16(cursor + 8), method = u16(cursor + 10);
      const packed = u32(cursor + 20), size = u32(cursor + 24), local = u32(cursor + 42);
      const nameLen = u16(cursor + 28), next = cursor + 46 + nameLen + u16(cursor + 30) + u16(cursor + 32);
      if (next > end || local + 30 > cdOffset) zipBad();
      const name = utf8.decode(new Uint8Array(dv.buffer, byteAt + cursor + 46, nameLen));
      if (!name || /[\\:\0]/.test(name) || name.startsWith('/') || name.split('/').includes('..') || entries.has(name)) zipBad();
      if ((flags & 1) || ![0, 8].includes(method) || (method === 0 && packed !== size)) zipBad();
      entries.set(name, { local, flags, method, packed, size, crc: u32(cursor + 16) });
      cursor = next;
    }
    return entries;
  }

  /** 条目解码：两条 archive 共用（method 0 直接校验 CRC；deflate 走 DecompressionStream 并卡死展开上限）。 */
  async function decodeEntry(data, e) {
    if (e.method === 0) {
      if (GW.gwanim.crc32(data) !== e.crc) zipBad();
      return data;
    }
    if (!zipRatioOk(e.packed, e.size)) throw new Error('PPT 条目压缩比异常（' + Math.round(e.size / Math.max(1, e.packed)) + ' 倍），已拒绝解压');
    const out = new Uint8Array(e.size);
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    let written = 0;
    try {
      for (;;) {
        const { value, done } = await stream.read();
        if (done) break;
        if (written + value.length > out.length) zipBad();
        out.set(value, written);
        written += value.length;
      }
    } finally { await stream.cancel().catch(() => {}); }
    if (written !== out.length || GW.gwanim.crc32(out) !== e.crc) zipBad();
    return out;
  }

  function archive(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_LOCAL) throw new Error('PPT 文件超过 512 MB');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = (i) => dv.getUint16(i, true), u32 = (i) => dv.getUint32(i, true);
    let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557)) {
      if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length) break;
      end--;
    }
    if (end < Math.max(0, bytes.length - 65557)) zipBad();
    const count = u16(end + 10), offset = u32(end + 16), centralEnd = offset + u32(end + 12);
    if (u16(end + 4) || u16(end + 6) || count !== u16(end + 8) || count > 4096 || centralEnd > end) zipBad();
    const index = zipIndex(dv, u16, u32, offset, centralEnd, offset, count);
    const entries = new Map();
    for (const [name, e] of index) {
      if (u32(e.local) !== 0x04034b50) zipBad();
      const start = e.local + 30 + u16(e.local + 26) + u16(e.local + 28);
      if (start + e.packed > offset) zipBad();
      entries.set(name, { start, packed: e.packed, size: e.size, method: e.method, crc: e.crc });
    }
    // 大文件展开后的总量天然更大：按源文件体积放大预算（最少仍是 96 MB，最多 2 GB）
    const cap = Math.max(96 * MB, Math.min(2048 * MB, bytes.length * 8));
    let budget = 0;
    const api = {
      size: bytes.length,
      async read(name, limit = MAX_ENTRY) {
        const e = entries.get(name);
        if (!e) return null;
        // 大文件展开后的总量天然更大：按源文件体积放大预算（最少仍是 96 MB，最多 2 GB）
        if (e.size > limit || budget + e.size > cap) throw new Error('PPT 展开后的内容超过导入预算');
        budget += e.size;
        const data = bytes.subarray(e.start, e.start + e.packed);
        return decodeEntry(data, e);
      },
      /**
       * PPT-05：媒体（mp4/mp3）走这里。它跟 read() 的差别只有两条，都是故意的：
       * 不占解析预算（媒体本来就不参与排版），但**保留压缩比判据**和 CRC ——
       * 把「条目里其实是个 zip 炸弹」挡在播放器之前，而不是等 Chromium 解出几个 G 再崩。
       */
      async pack(name) {
        const e = entries.get(name);
        if (!e) return { ok: false, why: 'missing', detail: '条目不存在：' + name };
        if (e.size > MAX_LOCAL) return { ok: false, why: 'too-big', detail: '媒体条目超过 512 MB' };
        if (!zipRatioOk(e.packed, e.size)) return { ok: false, why: 'bomb', detail: '压缩比异常，已拒绝解压：' + name };
        const data = await decodeEntry(bytes.subarray(e.start, e.start + e.packed), e);
        return { ok: true, blob: true, data: data, bytes: e.size };
      },
    };
    return api;
  }

  /**
   * 文件后备 archive（PPT-06）：中央目录已由主进程读出交回，这里只按条目做随机读。
   * 本地头（30 字节）按需读一次来算数据起点 —— 目录里存的是 local 偏移，名字/扩展域长度
   * 只在本地头里，所以数据起点必须等这 30 字节到手才能算。读完缓存，一页只读一次。
   */
  function archiveFile(info) {
    const central = info.central instanceof Uint8Array ? info.central : new Uint8Array(info.central || 0);
    const dv = new DataView(central.buffer, central.byteOffset, central.byteLength);
    const u16 = (i) => dv.getUint16(i, true), u32 = (i) => dv.getUint32(i, true);
    const index = zipIndex(dv, u16, u32, 0, central.length, info.cdOffset, info.count);
    const token = info.token, size = info.size, g = window.gewu;
    const cap = Math.max(96 * MB, Math.min(2048 * MB, size * 8));
    const starts = new Map();
    let budget = 0;
    // 关闭只做一次：模型可能被「关闭形状」「切页」「退出」多条路径各调一次 close()，
    // 重复把 token 递回去只会让主进程白抛 bad-token。
    let closed = false;
    async function readAt(at, len) {
      const r = await g.pptZipRead(token, at, len);
      if (!r || !r.ok) throw new Error('PPT 源文件读取失败：' + ((r && r.detail) || '未知原因'));
      const d = r.data;
      return d instanceof Uint8Array ? d : new Uint8Array(d);
    }
    function startOf(e) {
      const key = e.local;
      if (!starts.has(key)) {
        const job = readAt(e.local, 30).then((head) => {
          if (head.length !== 30) zipBad();
          const hd = new DataView(head.buffer, head.byteOffset, head.byteLength);
          if (hd.getUint32(0, true) !== 0x04034b50) zipBad();
          return e.local + 30 + hd.getUint16(26, true) + hd.getUint16(28, true);
        });
        starts.set(key, job);
        job.catch(() => starts.delete(key));
      }
      return starts.get(key);
    }
    return {
      size: size,
      token: token,
      async read(name, limit = MAX_ENTRY) {
        const e = index.get(name);
        if (!e) return null;
        if (e.size > limit || budget + e.size > cap) throw new Error('PPT 展开后的内容超过导入预算');
        budget += e.size;
        const start = await startOf(e);
        if (start + e.packed > info.cdOffset) zipBad();
        return decodeEntry(await readAt(start, e.packed), e);
      },
      /** 媒体（mp4/mp3）交给主进程展开成真实文件：只有真文件 <video> 才能按字节范围取。 */
      async pack(name) {
        const e = index.get(name);
        if (!e) return null;
        const start = await startOf(e);
        return g.pptMediaPack(token, { name: name, start: start, packed: e.packed, size: e.size, method: e.method });
      },
      close() { if (closed) return; closed = true; if (token && g && g.pptZipClose) { const t = token; try { g.pptZipClose(t).catch(() => {}); } catch (err) { /* 已释放 */ } } },
    };
  }

  function partPath(source, target) {
    if (!target || /[:\\?#\0]/.test(target)) return '';
    const parts = target.startsWith('/') ? [] : source.split('/').slice(0, -1);
    for (const item of target.split('/')) {
      if (!item || item === '.') continue;
      if (item === '..') {
        if (!parts.length) return '';
        parts.pop();
      } else parts.push(item);
    }
    return parts.join('/');
  }

  function color(n, theme, fallback = '') {
    const val = (k) => attr(child(n, k), 'val');
    const rgb = val('srgbClr') || attr(child(n, 'sysClr'), 'lastClr');
    if (/^[0-9a-f]{6}$/i.test(rgb)) return '#' + rgb;
    return theme[val('schemeClr')] || fallback;
  }

  function gradient(n, theme) {
    const stops = children(child(n, 'gsLst')).map((s) => [clamp(+attr(s, 'pos') / 100000, 0, 1), color(s, theme)]).filter((v) => v[1]);
    const lin = child(n, 'lin');
    return stops.length && lin ? { stops, angle: +attr(lin, 'ang') * Math.PI / 10800000 } : null;
  }

  function paintFill(ctx, value, w, ht) {
    if (!value || typeof value === 'string') return value || '#fff';
    const x = Math.cos(value.angle), y = Math.sin(value.angle), size = Math.abs(x) * w / 2 + Math.abs(y) * ht / 2;
    const gr = ctx.createLinearGradient(w / 2 - x * size, ht / 2 - y * size, w / 2 + x * size, ht / 2 + y * size);
    for (const [position, stop] of value.stops) gr.addColorStop(position, stop);
    return gr;
  }

  function shapeBox(x, fallback) {
    if (!x) return fallback || null;
    const off = child(x, 'off'), ext = child(x, 'ext');
    if (!off || !ext) return fallback || null;
    const w = px(attr(ext, 'cx')), ht = px(attr(ext, 'cy'));
    if (!(w >= 0 && ht >= 0 && w + ht > 0 && w <= 40000 && ht <= 40000)) return null;
    return { x: px(attr(off, 'x')), y: px(attr(off, 'y')), w, ht, rot: +attr(x, 'rot') * Math.PI / 10800000,
      flipX: attr(x, 'flipH') === '1', flipY: attr(x, 'flipV') === '1' };
  }

  function paragraphs(tx, theme, defaults, themeFonts) {
    return children(tx).filter((p) => p.localName === 'p').map((p) => {
      const props = child(p, 'pPr'), inherited = child(props, 'defRPr') || defaults;
      const level = clamp(+attr(props, 'lvl') || 0, 0, 8);
      const runs = children(p).flatMap((r) => {
        if (r.localName === 'br') return [{ text: '\n', size: 20 }];
        const t = child(r, 't');
        if (!t) return [];
        const rp = child(r, 'rPr'), prop = (k) => attr(rp, k, attr(inherited, k));
        const f = attr(child(rp, 'latin'), 'typeface') || attr(child(inherited, 'latin'), 'typeface');
        return [{ text: t.textContent.slice(0, 8000), size: clamp((+prop('sz') || 1800) / 75, 5, 250),
          color: color(child(rp, 'solidFill'), theme, color(child(inherited, 'solidFill'), theme, theme.tx1)),
          bold: prop('b') === '1', italic: prop('i') === '1', font: themeFonts[f] || f }];
      });
      // 2.2.5：PowerPoint 的行距/段前段后/左缩进/悬挂缩进以前一律不读，于是多行文本框
      // 与 PPT 里对不上（高矮、行数全乱）。这里按 DrawingML 的语义读出来：
      //   lnSpc  → spcPct val 是千分比（90000 = 100%），spcPts val 是百分之一磅（1800 = 18pt）
      //   spcBef/spcAft → 同上，只认 spcPts（缺省不加）
      //   marL   → 百分之一磅级别的 EMU（直接走 px()）；indent 同
      const pct = (k) => {
        const pctNode = child(child(props, k), 'spcPct'), ptsNode = child(child(props, k), 'spcPts');
        if (pctNode) return { pct: clamp((+attr(pctNode, 'val', 100000) || 100000) / 100000, 0.2, 5) };
        // spcPts@val 是「百分之一磅」，换算成 CSS px：val/100 pt × 96/72
        if (ptsNode) return { px: Math.max(0, (+attr(ptsNode, 'val', 0) || 0) / 100 * 96 / 72) };
        return null;
      };
      return { runs, level, bullet: attr(child(props, 'buChar'), 'char'), align: attr(props, 'algn', 'l'),
        lnSpc: pct('lnSpc'), spcBef: pct('spcBef'), spcAft: pct('spcAft'),
        marL: Math.max(0, px(attr(props, 'marL', 0))), indent: px(attr(props, 'indent', 0)) };
    });
  }

  function placeholder(n) {
    return children(n).filter((v) => v.localName.startsWith('nv')).map((v) => child(child(v, 'nvPr'), 'ph')).find(Boolean);
  }

  /* PPT-04：把 p:anim 的 ppt_x/ppt_y/ppt_w/ppt_h 关键帧取出来。
   *
   * 结构是：<p:anim><p:cBhvr><p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst>
   *        </p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_w/10"/></p:val></p:tav>…
   * tm 是**这一步的百分比**，val 是白名单表达式（见 pptx-fx.js 的 expr 解释器）。
   * 解析不了（自定义函数、未知基准属性、超长）就退回「不还原这个动画」并写进告警 ——
   * 绝不静默当成 100% 处理，那样看起来像「动画放完了」而其实是丢了。
   */
  function geomEvent(n, warning) {
    const names = descendants(child(n, 'cBhvr'), 'attrName').map((v) => String(v.textContent || '').trim());
    // 注意：局部变量不能叫 attr —— 外层有个同名工具函数 attr(node,name)，遮蔽了就没法读属性了。
    const prop = names.find((v) => /^ppt_(x|y|w|h)$/.test(v));
    if (!prop) {
      warning.add('部分对象动画使用了不支持的属性');
      return null;
    }
    const tavs = descendants(n, 'tav');
    if (!tavs.length) return null;
    const keys = [];
    for (const t of tavs) {
      const text = attr(descendants(t, 'strVal')[0], 'val');
      const pct = clamp(+attr(t, 'tm') || 0, 0, 100);
      if (!text) { warning.add('部分对象动画的关键帧缺少取值'); return null; }
      const probe = GW.pptxFx && GW.pptxFx.expr;
      if (probe) {
        try { probe.eval(text, { ppt_x: 0.5, ppt_y: 0.5, ppt_w: 0.2, ppt_h: 0.2 }); }
        catch (e) { warning.add('尺寸/位置动画表达式超出支持范围（未还原）：' + text); return null; }
      }
      keys.push({ pct: pct, text: text });
    }
    if (keys.length < 1) return null;
    return { kind: 'geom', attr: prop, keys: keys };
  }

  function timing(node, warning, extra) {
    const steps = [];
    const trig = (extra && extra.triggers) || [];
    let group = null, start = 0, end = 0, inTrig = 0, autoGroups = 0, trigGroups = 0;
    const stats = (extra && extra.stats) || { autoGroups: 0, trigGroups: 0, nodeTypes: {}, unknown: [] };
    // R4：presetID / presetClass / presetSubtype 挂在「外层」的 cTn（clickEffect / afterEffect）上，
    // 而 dur 在行为自己的 cTn 里 —— 一路走下来，记住当前这串动画的预设三元组。
    let preset = null;
    function walk(n) {
      const type = attr(n, 'nodeType');
      const trigSeq = n.localName === 'cTn' && type === 'interactiveSeq';
      if (n.localName === 'cTn') {
        if (attr(n, 'presetID')) preset = { id: attr(n, 'presetID'), cls: attr(n, 'presetClass'), sub: attr(n, 'presetSubtype') };
        else if (/^(clickEffect|afterEffect|withEffect|interactiveSeq)$/.test(type)) preset = null;
      }
      // PPT-02：一次「单击 / 页开始自动播 / 对象点击触发」在 XML 里有三套写法，改前只认 nodeType="clickEffect"。
      //  · cTn 的 stCondLst 首项 delay="indefinite" 表示「等一个触发」；
      //    其中带 evt="onBegin" + <tn val="2"> 的是「本页开始时自动播」—— 真实样本第 1、2 页的入页动画就是
      //    这个结构（匿名 cTn，无 nodeType），改前整棵进不去 group，被下面那句 warning 当「触发方式未还原」
      //    丢掉，于是第 2 页解析出 0 步、放映时永远停在初态。
      //  · tmRoot / mainSeq 自己的 delay 也是 indefinite，它们只是根容器，不算一步。
      //  · interactiveSeq = 对象点击触发：不并入单击步序（否则放映会凭空多出老师没点的步），
      //    但必须解析出来记到 slide.triggers，不能静默删除。
      const condLst = n.localName === 'cTn' ? child(n, 'stCondLst') : null;
      const conds = condLst ? descendants(condLst, 'cond') : [];
      const waiting = conds.length > 0 && attr(conds[0], 'delay') === 'indefinite';
      // 「本页开始时自动播」的判据是 evt=onBegin + <tn val="2">（tn=2 是「页」这个时间节点）。
      // 只靠 delay="indefinite" 会把「等单击的空容器」也当自动播 —— 第 11 页就是那种容器，
      // 它里面才是 clickEffect，判错会让步数翻倍。
      const onBegin = conds.some((c) => attr(c, 'evt') === 'onBegin' && attr(descendants(c, 'tn')[0], 'val') === '2');
      const rootish = type === 'tmRoot' || type === 'mainSeq';
      if (type) stats.nodeTypes[type] = (stats.nodeTypes[type] || 0) + 1;
      if (n.localName === 'cTn' && type && !rootish && !trigSeq && !/^(clickEffect|withEffect|afterEffect|interactiveSeq|tmRoot|mainSeq|animEffect|set|anim|animMotion|animScale|animRot|animClr|cmd|video|audio)$/.test(type)) {
        // PPT-02：未知触发类型必须留诊断，不能静默删除。
        if (!stats.unknown.includes(type)) stats.unknown.push(type);
        warning.add('未识别的动画触发类型（已尽量保留）：' + type);
      }
      if (trigSeq && !inTrig) {
        // 对象点击触发：单独记到 slide.triggers，不并入单击步序（否则放映会多出老师没点的步）。
        inTrig = 1;
        trigGroups++;
        group = [];
        const tgt = descendants(n, 'spTgt')[0];
        trig.push({ target: attr(tgt, 'spid'), events: group });
        start = end = 0;
      } else if (n.localName === 'cTn' && !rootish && !inTrig && type === 'clickEffect') {
        group = [];
        steps.push(group);
        start = end = 0;
      } else if (n.localName === 'cTn' && !rootish && !inTrig && onBegin && waiting) {
        // A 类：入页自动组（第 1、2 页）。匿名 cTn，无 nodeType，cond 是 delay=indefinite + onBegin tn=2。
        group = [];
        steps.push(group);
        autoGroups++;
        start = end = 0;
      }
      if (n.localName === 'cTn' && type === 'afterEffect' && !inTrig) start = end;
      if (['animEffect', 'set', 'animMotion', 'animScale', 'animRot', 'animClr', 'anim'].includes(n.localName)) {
        const behavior = child(n, 'cBhvr'), target = descendants(child(behavior, 'tgtEl'), 'spTgt')[0];
        const id = attr(target, 'spid'), filter = attr(n, 'filter'), ct = child(behavior, 'cTn');
        // R6：dur / delay 上限从 4 秒放到 60 秒 —— 希沃的转换器把时长原样带过来
        // （Framework/.../ElementAnimationDurationExtension.cs），4 秒会把慢速飞入截断。
        const dur = clamp(+attr(ct, 'dur', 200) || 0, 0, 60000);
        const delay = clamp(+attr(child(child(ct, 'stCondLst'), 'cond'), 'delay') || 0, 0, 60000);
        // R4：filter / 预设三元组 → 六个原语（fade / fly / wipe / split / blinds / zoom）
        const hit = GW.pptxFx ? GW.pptxFx.classify({ filter: filter, preset: preset }) : null;
        let event = null;
        if (n.localName === 'animEffect') {
          event = { kind: attr(n, 'transition') === 'out' ? 'hide' : 'show' };
          // 改前只认 filter 是不是 'fade'（飞入/擦除/百叶窗/缩放/轮子全被压成淡入淡出）
          if (hit && hit.fx && hit.fx !== 'fade') { event.fx = hit.fx; event.dir = hit.dir || ''; }
          if (hit && hit.lossy) warning.add('部分特效以淡入淡出呈现');
        } else if (n.localName === 'set' && /visibility/.test(child(behavior, 'attrNameLst')?.textContent || '')) {
          const value = attr(child(child(n, 'to'), 'strVal'), 'val');
          if (value === 'visible' || value === 'hidden') event = { kind: value === 'visible' ? 'show' : 'hide' };
        } else if (n.localName === 'animMotion') {
          const nums = /^M\s+([-+.\d]+)\s+([-+.\d]+)\s+L\s+([-+.\d]+)\s+([-+.\d]+)\s*E?$/i.exec(attr(n, 'path'));
          if (nums && nums.slice(1).every((v) => Number.isFinite(+v))) event = { kind: 'move', dx: clamp(nums[3] - nums[1], -4, 4), dy: clamp(nums[4] - nums[2], -4, 4) };
        } else if (n.localName === 'animRot' && n.hasAttribute('by')) {
          event = { kind: 'rotate', angle: clamp(+attr(n, 'by') || 0, -86400000, 86400000) * Math.PI / 10800000 };
        } else if (n.localName === 'animScale' && child(n, 'by')) {
          const by = child(n, 'by');
          event = { kind: 'scale', sx: clamp(+attr(by, 'x', 100000) / 100000 || 1, 0.05, 20), sy: clamp(+attr(by, 'y', 100000) / 100000 || 1, 0.05, 20) };
        } else if (n.localName === 'anim') {
          // PPT-04：尺寸/位置关键帧（p:anim + attrNameLst = ppt_x/ppt_y/ppt_w/ppt_h）。
          // 真实样本里是 ppt_w: #ppt_w/10 → #ppt_w+.01 → #ppt_w 这种「脉冲」。
          // 改前这一整类被丢弃（只留一句「部分动画未还原」），动画对象就永远停在初态。
          event = geomEvent(n, warning);
        }
        if (!id || !event || !group) warning.add('部分动画或对象触发方式未还原');
        else {
          const pos = start + delay;
          const previous = group.find((v) => v.id === id && v.kind === event.kind && v.start === pos);
          if (previous) {
            // PPT-01：同一个逻辑动画在 XML 里常由两条行为合成 —— set（可见性）+ animEffect（真效果）。
            // 改前合并只取「更长的时长」，fx/dir/reverse 全丢：先来的 set 没有 fx，后到的 animEffect 被
            // 合进去以后特效就没了，飞入/擦除变成「瞬间出现」。现在把缺失的特效方向补上。
            previous.dur = Math.max(previous.dur, dur);
            if (!previous.fx && event.fx) { previous.fx = event.fx; previous.dir = event.dir; }
            if (event.reverse && !previous.reverse) previous.reverse = true;
          }
          else group.push({ ...event, id, start: pos, dur, reverse: attr(ct, 'autoRev') === '1' });
          end = Math.max(end, pos + dur);
        }
        return;
      }
      for (const c of children(n)) walk(c);
      if (trigSeq) inTrig = 0;
    }
    if (node) walk(node);
    stats.autoGroups = autoGroups;
    stats.trigGroups = trigGroups;
    return steps.filter((v) => v.length);
  }

  /**
   * PPT-05/06：parse 现在能吃两种来源 ——
   * ① 内存字节（≤64 MB 内联副本 / 浏览器拖入）：老路不变；
   * ② 文件后备（file = 主进程开的 token + 中央目录）：217 MB 的课件也只用十几 KB 内存。
   * 两条路的 zip 对象对外是同一种 {read(name,limit)}，所以下面一行都不用分叉。
   */
  async function parse(bytes, file, srcPath) {
    const zip = file ? archiveFile(file) : archive(bytes), parser = new DOMParser(), xmls = new Map(), rels = new Map();
    const progress = (msg) => { try { if (GW.progress) GW.progress(msg); } catch (err) { /* 进度条不是关键路径 */ } };
    function xml(name) {
      if (!name) return Promise.resolve(null);
      if (!xmls.has(name)) xmls.set(name, zip.read(name, 3 * MB).then((data) => {
        if (!data) return null;
        const text = utf8.decode(data);
        if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('PPT XML 包含不受支持的声明');
        const root = parser.parseFromString(text, 'application/xml').documentElement;
        if (root.localName === 'parsererror') throw new Error('PPT XML 损坏：' + name);
        return root;
      }));
      return xmls.get(name);
    }
    function relations(name) {
      if (!name) return Promise.resolve([]);
      if (!rels.has(name)) {
        const slash = name.lastIndexOf('/') + 1;
        rels.set(name, xml(name.slice(0, slash) + '_rels/' + name.slice(slash) + '.rels').then((r) => children(r).flatMap((v) => {
          if (attr(v, 'TargetMode') === 'External') return [];
          const target = partPath(name, attr(v, 'Target'));
          return target ? [{ id: attr(v, 'Id'), type: attr(v, 'Type').split('/').pop(), target }] : [];
        })));
      }
      return rels.get(name);
    }
    const presPath = 'ppt/presentation.xml', pres = await xml(presPath);
    if (!pres) throw new Error('找不到 PPT 演示文稿');
    const presRels = await relations(presPath), size = child(pres, 'sldSz');
    const w = px(attr(size, 'cx')), ht = px(attr(size, 'cy'));
    const ids = children(child(pres, 'sldIdLst')).map((v) => relId(v));
    if (!(w >= 16 && ht >= 16 && w <= 8192 && ht <= 8192) || !ids.length || ids.length > 500) throw new Error('PPT 页尺寸无效或超过 500 页');
    const slides = [];
    for (const id of ids) {
      const warning = new Set();
      // PPT-12：逐页记「源对象 → 模型对象 → 渲染结果」覆盖清单。
      // 以前只有一串去重后的 warning 文案，出问题时既不知道是**哪个对象**丢了，
      // 也不知道那一页原本有几个对象 —— 只能靠肉眼比对原课件。
      // §五.3：覆盖清单要能「逐条关联真实对象」—— 只记 id 与分类，老师看到
      // 「1 占位 / 51 部分 / 6 丢失」也没法知道是原课件里的哪一块。这里补上
      // **页号（1 起）**与 cNvPr 里的显示名（PowerPoint 给每个形状起的名字，
      // 形如「矩形 3」「图片 12」），下面每条 cover() 都尽量带上名字。
      const pageNo = slides.length + 1;
      const coverage = [];
      const cover = (id, kind, outcome, why, name) => {
        const entry = { page: pageNo, id: id || '', name: name || '', kind: kind, outcome: outcome, why: why || '' };
        coverage.push(entry);
        return entry;
      };
      const path = presRels.find((r) => r.id === id && r.type === 'slide')?.target;
      const root = await xml(path);
      if (!root) throw new Error('PPT 缺少第 ' + (slides.length + 1) + ' 页');
      const sr = await relations(path), layoutPath = sr.find((r) => r.type === 'slideLayout')?.target;
      const layout = await xml(layoutPath), lr = await relations(layoutPath);
      const masterPath = lr.find((r) => r.type === 'slideMaster')?.target;
      const master = await xml(masterPath), mr = await relations(masterPath);
      const themeRoot = await xml(mr.find((r) => r.type === 'theme')?.target);
      const theme = { dk1: '#000000', lt1: '#ffffff', dk2: '#202c42', lt2: '#f4f6fa', accent1: '#4472c4' };
      for (const t of children(descendants(themeRoot, 'clrScheme')[0])) theme[t.localName] = color(t, {}, theme[t.localName]);
      const colorMap = child(master, 'clrMap');
      for (const key of ['bg1', 'tx1', 'bg2', 'tx2']) theme[key] = theme[attr(colorMap, key)] || theme[{ bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }[key]];
      const scheme = descendants(themeRoot, 'fontScheme')[0];
      const themeFonts = { '+mj-lt': attr(child(child(scheme, 'majorFont'), 'latin'), 'typeface'), '+mn-lt': attr(child(child(scheme, 'minorFont'), 'latin'), 'typeface') };
      const cs = (v) => child(v, 'cSld');
      const tree = (v) => children(child(cs(v), 'spTree'));
      const bg = [root, layout, master].map((n) => child(cs(n), 'bg')).find(Boolean);
      const bgPr = child(bg, 'bgPr');
      const bgGradient = gradient(child(bgPr, 'gradFill'), theme);
      const back = bgGradient || color(child(bgPr, 'solidFill'), theme, color(child(bg, 'bgRef'), theme, theme.bg1));
      if (bgPr && !bgGradient && children(bgPr).some((n) => ['gradFill', 'pattFill', 'blipFill'].includes(n.localName))) warning.add('背景使用了近似色');
      const list = [];
      function add(nodes, relationsForPart, inherited, depth = 0, layer = '') {
        if (depth > 12) { warning.add('组合嵌套过深'); return; }
        for (const n of nodes) {
          const kind = n.localName;
          if (kind === 'grpSp') {
            const xf = child(child(n, 'grpSpPr'), 'xfrm'), box = shapeBox(xf);
            const off = child(xf, 'chOff'), ext = child(xf, 'chExt');
            const gname = attr(child(child(n, 'nvGrpSpPr'), 'cNvPr'), 'name');
            if (!box || !px(attr(ext, 'cx')) || !px(attr(ext, 'cy'))) { warning.add('部分组合无法还原'); cover('', 'group', 'dropped', '组合缺少坐标域', gname); continue; }
            const first = list.length;
            add(children(n), relationsForPart, inherited, depth + 1, layer);
            const items = list.splice(first);
            // 组合本身只提供坐标域，不单独占一个「源对象」——按你看到的形状计数才有意义。
            list.push({ id: layer + attr(child(child(n, 'nvGrpSpPr'), 'cNvPr'), 'id'), group: items, box,
              childX: px(attr(off, 'x')), childY: px(attr(off, 'y')), childW: px(attr(ext, 'cx')), childH: px(attr(ext, 'cy')) });
            continue;
          }
          if (kind === 'graphicFrame') {
            // 2.2.5：表格/图表/SmartArt 我们画不出来（要完整 DrawingML 布局引擎），但也**不能整块消失** ——
            // 那会让整页版式塌掉、后面的对象看着全错位。这里留一个同尺寸的占位框并标明是什么，
            // 桌面版有 WPS/Office 时这些内容由烘焙的 PNG 原样呈现，占位框只在降级路径上出现。
            const xf = child(n, 'xfrm'), gbox = shapeBox(xf);
            const gnv = child(children(n).find((v) => v.localName.startsWith('nv')), 'cNvPr');
            const gid = layer + attr(gnv, 'id');
            const gu = attr(child(n, 'graphic'), 'uri') || '';
            const hasTable = !!descendants(n, 'tbl').length, hasChart = /chart/i.test(gu);
            const hasOle = /\/ole\b|\boleObject\b|ole/i.test(gu) || !!descendants(n, 'oleObj').length;
            const note = hasTable ? '表格占位' : hasChart ? '图表占位' : hasOle ? 'OLE 对象占位' : 'SmartArt 占位';
            // PPT-04：OLE（公式/嵌入对象）**不执行**，但它自带一张预览图（oleObj 里的 p:pic，
            // 或 mc:Fallback 里那张 WMF/EMF）。按关系把预览件取出来，解析末尾统一试着解码：
            // 能解码就换成真图片（公式可见），解不了必须退回占位框并写明原因。
            // 不把 wmf/emf 加进 MIME 白名单就当「能画」—— Chromium 没有这两个解码器。
            const preview = descendants(n, 'blip')
              .map((v) => relationsForPart.find((r) => r.id === relId(v, 'embed') && r.type === 'image')?.target)
              .find(Boolean) || '';
            const item = { id: gid, kind: 'frame', box: gbox, note: note };
            if (preview) item.olePreview = preview;
            if (gbox) list.push(item);
            item.cov = cover(gid, 'frame', gbox ? 'placeholder' : 'dropped',
              note + (preview ? '（OLE 预览待解码：' + preview + '）' : '（表格/图表/SmartArt 无版式引擎）'), attr(gnv, 'name'));
            warning.add(hasOle ? '公式/嵌入对象按预览图呈现（未执行 OLE）' : '表格、图表或 SmartArt 未还原（已留占位框）');
            continue;
          }
          // PPT-12：mc:AlternateContent 里通常是「新特性 + 旧版回退」两份，回退件是看得见的形状。
          // 以前整块被 continue 掉，页面上就少东西；现在至少记进清单并告警。
          if (kind === 'AlternateContent' || kind === 'Fallback') {
            const inner = children(n).filter((v) => ['sp', 'pic', 'cxnSp', 'grpSp', 'graphicFrame'].includes(v.localName));
            if (inner.length) { add(inner, relationsForPart, inherited, depth + 1, layer); continue; }
            warning.add('部分兼容写法对象未还原');
            const anv = child(children(n).find((v) => v.localName.startsWith('nv')), 'cNvPr');
            cover(layer + attr(anv, 'id'), kind, 'dropped', 'mc:AlternateContent 无法还原', attr(anv, 'name'));
            continue;
          }
          if (!['sp', 'pic', 'cxnSp'].includes(kind)) continue;
          const ph = placeholder(n);
          if (layer && ph) continue;
          const same = (v) => {
            const p = placeholder(v);
            return p && (attr(ph, 'idx') ? attr(ph, 'idx') === attr(p, 'idx') : attr(ph, 'type', 'body') === attr(p, 'type', 'body'));
          };
          const base = ph ? inherited.find(same) : null;
          const pr = child(n, 'spPr'), basePr = child(base, 'spPr');
          const box = shapeBox(child(pr, 'xfrm'), shapeBox(child(basePr, 'xfrm')));
          const nv = children(n).find((v) => v.localName.startsWith('nv'));
          const id = layer + attr(child(nv, 'cNvPr'), 'id');
          const objName = attr(child(nv, 'cNvPr'), 'name');
          if (!box) { warning.add('部分对象缺少版式位置'); cover(id, kind, 'dropped', '缺少版式位置', objName); continue; }
          const tx = child(n, 'txBody'), bp = child(tx, 'bodyPr');
          const baseTx = child(base, 'txBody'), baseBp = child(baseTx, 'bodyPr');
          const style = child(n, 'style');
          const type = attr(child(pr, 'prstGeom'), 'prst', kind === 'cxnSp' ? 'line' : 'rect');
          // 2.2.9：Freeform/曲线/编辑过顶点的形状走 a:custGeom 的真实路径，不再一律按矩形兜底
          const geo = customGeo(pr);
          // 画的出来的形状不再告警（PRST_KNOWN 与 shape() 的 POLY 表同源）；解析不出路径的才退回矩形
          if (!geo && (child(pr, 'custGeom') || !PRST_KNOWN.has(type))) warning.add('部分几何形状以矩形呈现');
          const fillGradient = gradient(child(pr, 'gradFill'), theme);
          if (children(pr).some((v) => ['pattFill', 'effectLst'].includes(v.localName) || (v.localName === 'gradFill' && !fillGradient))) warning.add('部分填充或阴影使用近似样式');
          const line = child(pr, 'ln'), blip = child(n, 'blipFill');
          const image = relationsForPart.find((r) => r.id === relId(child(blip, 'blip'), 'embed') && r.type === 'image')?.target;
          // PPT-12：图片加载失败以前是**静默转 null**（pptx.js 的 picture()），画出来是一块灰底，
          // 页面上没有任何提示、日志里也没有一行。这里把失败原因记进覆盖清单并告警。
          const imageOk = /\.(png|jpe?g|gif|webp|bmp)$/i.test(image || '');
          if (kind === 'pic' && (!image || !imageOk)) warning.add('部分图片格式或外部媒体无法呈现');
          // PPT-12：OMML 公式（oMath）与 OLE 对象既画不出来也不该悄悄消失 —— 单独计数并告警。
          const omath = descendants(n, 'oMath').length, ole = descendants(n, 'oleObj').length;
          if (omath) warning.add('公式以纯文本近似呈现（未渲染 LaTeX）');
          if (ole) warning.add('嵌入对象无法呈现（OLE）');
          const crop = child(blip, 'srcRect');
          // PPT-05：媒体形状（视频 / 音频）。真课件里 5 个播放动作只对应 4 个 mp4 ——
          // 同一个文件会被多页复用，所以「动作数」绝不能用「文件数」去数（少一个就误判成缺件）。
          // 目标文件的取法有优先级而不是二选一：a:videoFile / a:audioFile 的 r:link 是 PowerPoint 的原生写法，
          // 无效（缺失、外链、关系不存在）时退 p14:media 的 r:embed（office 2007 的 media 关系）。
          // 实测第 17/18/19 页的 videoFile 是 TargetMode="External" Target="NULL" —— 外链拿不到内容，
          // relations() 又会把 External 直接丢掉，所以这三页只有 p14:media 可用；6/10 页两种都能用。
          const nvPr = child(nv, 'nvPr');
          const videoFile = child(nvPr, 'videoFile'), audioFile = child(nvPr, 'audioFile');
          const p14media = descendants(child(nvPr, 'extLst'), 'media')[0];
          const pickRel = (...ids) => ids
            .map((v) => relationsForPart.find((r) => r.id === v && ['video', 'audio', 'media'].includes(r.type)))
            .find(Boolean);
          const mediaRel = pickRel(relId(videoFile, 'link'), relId(audioFile, 'link'), relId(p14media, 'embed'));
          const cNvPr = child(nv, 'cNvPr');
          const media = mediaRel ? {
            kind: audioFile ? 'audio' : 'video',
            target: mediaRel.target,
            // 封面就是 blipFill 里那张图（第 6 页是 image18.png）；没有封面时播放器自己出首帧
            cover: imageOk ? image : '',
            id: attr(cNvPr, 'id'),
            name: attr(cNvPr, 'name'),
            trigger: '',   // 触发方式在 parse 尾部按 timing 的 interactiveSeq 回填
            // 形状自带的点击播放标记（a:hlinkClick action="ppaction://media"）：没有 timing 的
            // 老课件只靠它表达「点一下才播」，所以它优先于「一律按自动播放」的兜底。
            hint: descendants(cNvPr, 'hlinkClick').some((v) => /ppaction:\/\/media/.test(attr(v, 'action'))) ? 'click' : '',
          } : null;
          if (!media && (videoFile || audioFile)) warning.add('部分音视频是外部链接，文件内没有可播放的副本');
          const bodyAttr = (k, d) => attr(bp, k, attr(baseBp, k, d));
          const baseText = child(child(child(baseTx, 'p'), 'pPr'), 'defRPr');
          const defaultText = baseText || child(child(child(child(master, 'txStyles'), attr(ph, 'type') === 'title' ? 'titleStyle' : 'bodyStyle'), 'lvl1pPr'), 'defRPr');
          list.push({ id, kind, media, box, type,
            fill: child(pr, 'noFill') ? '' : fillGradient || color(child(pr, 'solidFill'), theme, color(child(style, 'fillRef'), theme)),
            stroke: child(line, 'noFill') ? '' : color(child(line, 'solidFill'), theme, color(child(style, 'lnRef'), theme, type === 'line' ? theme.tx1 : '')),
            lineWidth: Math.max(0.5, px(attr(line, 'w', 9525))), image: /\.(png|jpe?g|gif|webp|bmp)$/i.test(image || '') ? image : '',
            crop: ['l', 't', 'r', 'b'].map((k) => clamp(+attr(crop, k) / 100000, 0, 0.99)),
            text: paragraphs(tx, theme, defaultText, themeFonts), anchor: bodyAttr('anchor', 't'),
            padding: ['lIns', 'tIns', 'rIns', 'bIns'].map((k, i) => px(bodyAttr(k, i % 2 ? 45720 : 91440))),
            fontScale: clamp(+attr(child(bp, 'normAutofit'), 'fontScale', 100000) / 100000, 0.25, 2),
            // 2.2.9：bodyPr 带 normAutofit = PowerPoint 的「溢出时缩排文字」。
            // PowerPoint 常常不写 fontScale 缓存值，只靠这个标记 + 字号自己算，所以必须留一个布尔。
            autofit: !!child(bp, 'normAutofit'),
            geo: geo,
          });
          if (kind === 'pic') {
            cover(id, 'pic', imageOk ? 'rendered' : 'dropped', imageOk ? '' : (image ? '格式不支持：' + image : '缺少图片关系'), objName);
          } else if (omath || ole) {
            cover(id, 'shape', 'partial', (omath ? 'OMML 公式以纯文本呈现' : '') + (ole ? (omath ? '；' : '') + 'OLE 嵌入对象无法呈现' : ''), objName);
          } else if (!geo && (child(pr, 'custGeom') || !PRST_KNOWN.has(type))) {
            cover(id, 'shape', 'partial', '几何以矩形呈现：' + type, objName);
          } else {
            cover(id, 'shape', 'rendered', '', objName);
          }
        }
      }
      if (attr(root, 'showMasterSp') !== '0' && attr(layout, 'showMasterSp') !== '0') add(tree(master), mr, [], 0, 'm:');
      add(tree(layout), lr, [], 0, 'l:');
      add(tree(root), sr, tree(layout).concat(tree(master)));
      if (child(root, 'transition')) warning.add('保留翻页顺序，未还原页间转场');
      const timingNode = child(root, 'timing');
      if (descendants(timingNode, 'bldP').length) warning.add('段落逐条动画按对象呈现');
      // 2.2.5：烘焙要用「顶层形状在 Slide.Shapes 里的 1 基序号」。Shapes 的顺序就是 spTree 的顺序，
      // 所以这里按 DOM 顺序把顶层 sp/pic/cxnSp/grpSp/graphicFrame 的 cNvPr@id 记下来（layout/master 不算）。
      const shapeIds = tree(root)
        .filter((n) => ['sp', 'pic', 'cxnSp', 'grpSp', 'graphicFrame'].includes(n.localName))
        .map((n) => attr(child(children(n).find((v) => v.localName.startsWith('nv')), 'cNvPr'), 'id'));
      // PPT-02：timing 现在还要吐出「对象点击触发」与「未识别触发类型的统计」，
      // 一起挂到 slide 上（triggers 供后续交互实现，animStats 供诊断输出），不许静默丢弃。
      const anim = { triggers: [], stats: { autoGroups: 0, trigGroups: 0, nodeTypes: {}, unknown: [] } };
      const steps = timing(timingNode, warning, anim);
      if (anim.stats.unknown.length) warning.add('未识别的动画触发类型（已尽量保留）：' + anim.stats.unknown.join(','));
      if (anim.triggers.length) warning.add('对象点击触发已解析但未接入交互（' + anim.triggers.length + ' 处）');
      /**
       * PPT-05：媒体的触发方式 + 「媒体动作」补记。
       * 触发判据（不硬编码任何页码/文件名）：
       * · timing 的 interactiveSeq 里有 onClick 且 spTgt 指向本形状 ⇒ 'click'（老师点它才播）；
       * · 否则看 cMediaNode 的 cond：有 onBegin 或 delay 有具体值 ⇒ 'auto'（翻到这一页就播）；
       * · 两者都没有时退回形状自带的 hlinkClick action=ppaction://media ⇒ 'click'，再不行按 'auto'。
       * 步骤：媒体动作**不塞进 steps** —— steps 是动画时间轴，往里塞媒体步会让 effects() 按未知 kind
       * 走一遍变换（画面无害但 animReport/诊断会多出假条目）。这里单独记 slide.media，
       * 并把「本页有 N 个媒体动作」写进 animStats，供探针与诊断断言。
       */
      const mediaItems = [];
      (function walkMedia(items) {
        for (const it of items || []) {
          if (!it) continue;
          if (it.group) walkMedia(it.group);
          else if (it.media) mediaItems.push(it);
        }
      })(list);
      const ctnOf = descendants(timingNode, 'cMediaNode');
      for (const it of mediaItems) {
        const m = it.media;
        // 只认 spTgt：媒体形状的 clickEffect 常常是 p:cmd（togglePause），不产生行为事件，
        // 按事件再筛一遍会把「明明点了才播」误判成匿名自动组。
        const trig = (anim.triggers || []).find((t) => t.target === m.id);
        if (trig) m.trigger = 'click';
        else if (m.hint) m.trigger = m.hint;
        else if (ctnOf.length) {
          const cond = descendants(ctnOf[0], 'cond')[0];
          const autoplay = !!cond && (attr(cond, 'evt') === 'onBegin' || (attr(cond, 'delay') && attr(cond, 'delay') !== 'indefinite'));
          m.trigger = autoplay ? 'auto' : 'click';
        } else m.trigger = 'auto';
        if (m.trigger === 'click') warning.add('视频/音频需点击播放（已接入，翻页自动停止）');
      }
      const media = mediaItems.map((it) => Object.assign({}, it.media));
      anim.stats.media = media.length;
      /**
       * 媒体动作也是一步：课件里「点一下播视频」和「点一下出现文字」在放映时同样是「按一次下一步」。
       * 所以这里把没被既有动画步覆盖的媒体补成一步（stepDuration=0，effects() 里走不到任何变换分支），
       * 于是「第 6/10/17/18/19 页各 1 个媒体动作」直接能用 steps 数断言。
       * 已经有动画步覆盖它（timing 里给了 spTgt 的行为节点）就不重复补，避免多出一次空点击。
       */
      const covered = new Set();
      for (const group of steps) for (const e of group) covered.add(e.id);
      for (const it of mediaItems) {
        if (covered.has(it.id)) continue;
        steps.push([{ kind: 'media', id: it.id, start: 0, dur: 0, fx: '', media: it.media.kind }]);
      }
      slides.push({ back, list, steps: steps, media: media, triggers: anim.triggers, animStats: anim.stats, warnings: [...warning], shapeIds, coverage });
      // PPT-06：大文件按需读取时每页都要走几次 IPC，几十页下来会有一段时间界面没动静。
      // 必须先算出总页数（ids 已经拿到了），进度才有分母；每页都报，别等到每 8 页。
      progress('正在读取：第 ' + slides.length + ' 页 / 共 ' + ids.length + ' 页');
      if (slides.length % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const pictures = new Map(), mediaFail = new Map();
    /* PPT-A：WMF/EMF 是**矢量**图元记录，Chromium 没有这两个解码器（createImageBitmap 只会回
     * "The source image could not be decoded"），而 OLE 公式/嵌入对象的预览图恰恰几乎都是 WMF。
     * 所以必须先**探测内容格式**，命中了才交主进程用 GDI+ 光栅化成 PNG 再解码 ——
     * 不把 wmf/emf 塞进 MIME 白名单当「能画」，那只会把解码失败换成一张空白。
     * 判据按**字节头**而不是扩展名：真课件里有扩展名写错、以及 .bin 承载 EMF 的情况。
     */
    const rasterStat = { asked: 0, ok: 0, failed: 0, why: '' };
    function sniffVector(data) {
      if (!data || data.length < 8) return '';
      if (data[0] === 0xd7 && data[1] === 0xcd && data[2] === 0xc6 && data[3] === 0x9a) return 'wmf';   // 可放置 WMF
      if ((data[0] === 0x01 || data[0] === 0x02) && data[1] === 0x00 && data[2] === 0x09 && data[3] === 0x00) return 'wmf';
      if (data.length >= 44 && data[0] === 0x01 && data[1] === 0 && data[2] === 0 && data[3] === 0
        && data[40] === 0x20 && data[41] === 0x45 && data[42] === 0x4d && data[43] === 0x46) return 'emf';
      return '';
    }
    async function rasterPicture(path, data, kind) {
      const bw = window.gewu;
      rasterStat.asked++;
      // 没有桥就是没有桥：明确记 no-bridge，绝不「当作没有这张图」悄悄放过。
      if (!bw || typeof bw.pptRaster !== 'function') {
        rasterStat.failed++;
        rasterStat.why = rasterStat.why || 'no-bridge';
        if (!mediaFail.has(path)) { mediaFail.set(path, 'raster:no-bridge'); diag('矢量预览件无法转换（主进程桥不可用）' + path + ' 格式=' + kind); }
        return null;
      }
      let png = null, why = '';
      try {
        const res = await bw.pptRaster([{ name: path, bytes: data }]);
        const first = res && Array.isArray(res.items) ? res.items[0] : null;
        if (first && first.ok && first.png) png = first.png;
        else why = (first && first.why) || (res && res.why) || 'raster-failed';
      } catch (e) {
        why = 'raster-ipc:' + ((e && e.message) || e);
      }
      if (!png) {
        rasterStat.failed++;
        rasterStat.why = rasterStat.why || why;
        if (!mediaFail.has(path)) { mediaFail.set(path, 'raster:' + why); diag('矢量预览件转换失败 ' + path + ' 格式=' + kind + ' 原因=' + why); }
        return null;
      }
      const bytes = png instanceof Uint8Array ? png : new Uint8Array(png);
      return createImageBitmap(new Blob([bytes], { type: 'image/png' })).then((im) => {
        rasterStat.ok++;
        noteThrottled('raster|' + String(path).slice(-40), '矢量预览件已转换 ' + path + ' 格式=' + kind + ' 尺寸=' + im.width + 'x' + im.height + ' 字节=' + bytes.length, 60000);
        return im;
      }).catch((e) => {
        rasterStat.failed++;
        rasterStat.why = rasterStat.why || ('png-decode:' + ((e && e.name) || 'err'));
        if (!mediaFail.has(path)) { mediaFail.set(path, 'raster-png:' + ((e && e.name) || 'err')); diag('转换出的 PNG 仍无法解码 ' + path); }
        return null;
      });
    }
    async function picture(path) {
      if (!pictures.has(path)) pictures.set(path, zip.read(path).then(async (data) => {
        if (!data) { if (!mediaFail.has(path)) { mediaFail.set(path, 'missing'); diag('图片缺失 ' + path); } return null; }
        const vec = sniffVector(data);
        if (vec) return rasterPicture(path, data, vec);
        const blob = new Blob([data]);
        return createImageBitmap(blob).catch((e) => {
          if (!mediaFail.has(path)) { mediaFail.set(path, 'decode:' + ((e && e.name) || 'err')); diag('图片解码失败 ' + path + ' ' + ((e && e.message) || e)); }
          return null;
        });
      }).catch((e) => {
        if (!mediaFail.has(path)) { mediaFail.set(path, 'read:' + ((e && e.message) || 'err')); diag('图片读取失败 ' + path); }
        return null;
      }));
      return pictures.get(path);
    }
    // PPT-04：graphicFrame 里的 OLE（公式/嵌入对象）**不执行**，只把它自带的预览图当图片画。
    // 能解码 → 换成普通图片路径（老师看到真公式）；解不了 → 保留占位框并把原因写进覆盖清单。
    // 这一步必须显式 await：picture() 解不出来时会返回 null，绝不允许「假定 Chromium 能画 WMF」。
    /* PPT-A：必须**递归组合**。组合里的 OLE 预览件与顶层是同一套结构（group 项形如
     * {id, group: items, box, childX/childY/childW/childH}），改前只遍历 s.list 顶层，
     * 于是「组合内部的公式」一个都没被试着解码 —— 23 页件有 3 个、10 页件有 6 个，
     * 老师看到的就是这些公式位置上一块空白。递归时**不重建对象**：id、组合坐标矩阵、
     * 原始边界全部原地保留，只把 olePreview 换成 image。
     * 同源预览只转一次：pictures 是按 path 记忆的 Promise，重复出现直接命中同一份位图。
     */
    const eachOleFrame = (items, fn) => {
      for (const it of items) {
        if (!it) continue;
        if (Array.isArray(it.group)) { eachOleFrame(it.group, fn); continue; }
        if (it.olePreview) fn(it);
      }
    };
    const pendingOle = [];
    for (const s of slides) eachOleFrame(s.list, (it) => { pendingOle.push(it); });
    for (const it of pendingOle) {
      const src = it.olePreview;
      delete it.olePreview;
      const im = await picture(src);
      if (im) {
        it.image = src;
        if (it.cov) { it.cov.outcome = 'partial'; it.cov.why = '按 OLE 预览图呈现（未执行 OLE）：' + src; }
      } else if (it.cov) {
        it.cov.outcome = 'dropped';
        it.cov.why = 'OLE 预览图无法解码（不是 MIME 白名单问题）：' + src;
      }
    }
    // 汇总成一份可断言、可打日志的「覆盖清单」：源对象总数必须能对上，丢了多少一眼可见。
    const audit = { pages: slides.length, sources: 0, rendered: 0, placeholder: 0, partial: 0, text: 0, dropped: 0, mediaFail: [], items: [], byPage: [] };
    // §五.3：计数只回答「丢了多少」，回答不了「丢的是哪一块」。这里把**每一条非完美
    // 覆盖**连同页号、显示名、原因一起留下（items），再按页汇总一份（byPage），
    // 「信息 → 放映信息」与导入日志都能逐条指到原课件里的某个形状。
    // 上限 240 条：上百页的课件全量留会把内存与诊断文本撑爆，超过就只留计数。
    const AUDIT_ITEM_CAP = 240;
    let pageIdx = 0;
    for (const s of slides) {
      pageIdx++;
      const pg = { page: pageIdx, sources: 0, rendered: 0, placeholder: 0, partial: 0, text: 0, dropped: 0 };
      for (const c of (s.coverage || [])) {
        audit.sources++;
        audit[c.outcome] = (audit[c.outcome] || 0) + 1;
        pg.sources++;
        pg[c.outcome] = (pg[c.outcome] || 0) + 1;
        if (c.outcome !== 'rendered' && audit.items.length < AUDIT_ITEM_CAP) {
          audit.items.push({ page: c.page || pageIdx, id: c.id || '', name: c.name || '', kind: c.kind || '', outcome: c.outcome, why: c.why || '' });
        }
      }
      audit.byPage.push(pg);
    }
    audit.itemsCut = audit.sources - audit.rendered - audit.items.length > 0;
    for (const pair of mediaFail) audit.mediaFail.push({ path: pair[0], why: pair[1] });
    // PPT-A：矢量预览件的转换结果必须单独可断言 —— 「解码失败 18 个」里到底有几个是被转成功的，
    // 只看 mediaFail 是分不出来的（转换成功的就从失败表里消失了，不记就等于没发生）。
    if (rasterStat.asked) audit.raster = { asked: rasterStat.asked, ok: rasterStat.ok, failed: rasterStat.failed, why: rasterStat.why };
    // PPT-02：动画侧的「解析到了什么」也要能一眼核对 —— 改前只有一句「部分动画未还原」，
    // 既看不出是入页自动组丢了、对象点击触发丢了，还是真有不认识的节点。
    const anim = { steps: 0, autoGroups: 0, trigGroups: 0, unknown: [] };
    for (const s of slides) {
      anim.steps += (s.steps || []).length;
      const st = s.animStats || {};
      anim.autoGroups += st.autoGroups || 0;
      anim.trigGroups += st.trigGroups || 0;
      for (const t of (st.unknown || [])) if (anim.unknown.indexOf(t) < 0) anim.unknown.push(t);
    }
    audit.anim = anim;
    // LOG 段：覆盖清单是「成功摘要」还是「真丢了东西」必须分开 —— 全渲染且无媒体失败走 INFO，
    // 只要有占位/部分/丢失/媒体失败就仍是 WARN（那才是老师要看的）。
    const auditClean = audit.rendered === audit.sources && !audit.placeholder && !audit.partial && !audit.mediaFail.length;
    (auditClean ? note : diag)('覆盖清单 页=' + audit.pages + ' 源对象=' + audit.sources
      + ' 已渲染=' + audit.rendered + ' 占位=' + audit.placeholder
      + ' 部分=' + audit.partial + ' 仅文字=' + audit.text
      + ' 丢失=' + audit.dropped + ' 媒体失败=' + audit.mediaFail.length
      + ' 动画步数=' + anim.steps + ' 入页组=' + anim.autoGroups + ' 对象触发=' + anim.trigGroups
      + ' 未知触发=' + (anim.unknown.length ? anim.unknown.join(',') : '无'));
    // §五.3：非完美覆盖逐条落到诊断里（每行一条，最多 12 行；页面名在前，
    // 「第 3 页 · 矩形 7（placeholder）：表格/图表/SmartArt 无版式引擎」这种形态
    // 老师也能看懂是被哪一块替代了）。
    for (const it of audit.items.slice(0, 12)) {
      diag('覆盖明细 第' + it.page + '页 · ' + (it.name || '(未命名)') + ' [' + it.kind + '/' + it.outcome + ']'
        + (it.id ? ' id=' + it.id : '') + (it.why ? '：' + it.why : ''));
    }
    if (audit.itemsCut) diag('覆盖明细已截断：仅保留前 ' + AUDIT_ITEM_CAP + ' 条（总非完美 ' + (audit.sources - audit.rendered) + '）');
    // PPT-05：媒体播放器要能拿到「这个 target 对应的可播放地址」。走 pack（内存副本给 Blob URL，
    // 文件后备交给主进程展开成真实文件后给 app://_local URL），并在 model 上留一个账号级缓存，
    // 同一个 mp4 被多页复用时只展开一次 —— 4 个 mp4 撑起 5 个播放动作就是这么来的。
    const mediaCache = new Map();
    /**
     * PPT-05b：媒体地址改成**引用计数**。
     * 改前 stop() 会直接把 URL.revokeObjectURL(el.__objUrl) 掉，可那个 URL 是 mediaCache 里
     * 缓存的那一个 —— 同一份 mp4 被多页/多对象复用时，第一个播放器离页就把地址销毁了，
     * 第二个播放器从缓存里拿到的是一个已失效的 blob URL（表现为「视频黑着、控件能点但不动」）。
     * 现在只有引用计数归零（最后一个使用者离开）才撤销，并把缓存条目一起删掉，下次重新解包。
     */
    const mediaRefs = new Map();
    function revokeMedia(target) {
      const job = mediaCache.get(target);
      mediaCache.delete(target);
      if (job) job.then((r) => { if (r && r.blob && r.url) { try { URL.revokeObjectURL(r.url); } catch (e) { /* 已回收 */ } } }).catch(() => {});
    }
    function acquireMedia(target) {
      mediaRefs.set(target, (mediaRefs.get(target) || 0) + 1);
      return mediaURL(target);
    }
    function releaseMedia(target) {
      const n = (mediaRefs.get(target) || 0) - 1;
      if (n > 0) { mediaRefs.set(target, n); return; }
      mediaRefs.delete(target);
      revokeMedia(target);
    }
    async function mediaURL(target) {
      if (!target) return { ok: false, why: 'no-target', detail: '媒体目标为空' };
      if (mediaCache.has(target)) return mediaCache.get(target);
      const job = (async () => {
        let r;
        try { r = await zip.pack(target); } catch (e) { return { ok: false, why: 'read', detail: String((e && e.message) || e) }; }
        if (!r || !r.ok) return r || { ok: false, why: 'missing', detail: '条目不存在：' + target };
        if (r.blob) return { ok: true, url: URL.createObjectURL(new Blob([r.data], { type: mimeOf(target) })), bytes: r.bytes, blob: true };
        // 网页版 / 安卓没有主进程，GW.fileURL 会原样返回路径（不可用）：明确说清楚，别给一个死链
        if (typeof GW.fileURL !== 'function') return { ok: false, why: 'no-bridge', detail: '此设备没有本机文件通道，视频无法播放' };
        return { ok: true, url: GW.fileURL(r.path), bytes: r.bytes, path: r.path };
      })();
      mediaCache.set(target, job);
      job.then((r) => { if (!r || !r.ok) mediaCache.delete(target); });
      return job;
    }
    /** §二 V2：兼容转换要「真文件」，内联副本没路径 —— 由调用方拿字节交给主进程落盘（只在点了转换时用）。 */
    const packMedia = (target) => zip.pack(target);
    return { w, ht, slides, picture, audit, mediaURL, acquireMedia, releaseMedia, packMedia, close: () => { for (const [t, job] of mediaCache) job.then((r) => { if (r && r.blob && r.url) URL.revokeObjectURL(r.url); }).catch(() => {}); mediaCache.clear(); mediaRefs.clear(); if (zip.close) zip.close(); } };
  }
  const mimeOf = (name) => /\.mp4$/i.test(name) ? 'video/mp4' : /\.(m4v)$/i.test(name) ? 'video/x-m4v'
    : /\.(mp3)$/i.test(name) ? 'audio/mpeg' : /\.(wav)$/i.test(name) ? 'audio/wav'
      : /\.(m4a)$/i.test(name) ? 'audio/mp4' : /\.(ogg|oga)$/i.test(name) ? 'audio/ogg'
        : /\.(webm)$/i.test(name) ? 'video/webm' : 'application/octet-stream';

  function visibility(slide, step) {
    const result = new Map();
    for (const events of slide.steps) for (const e of events) if ((e.kind === 'hide' || e.kind === 'show') && !result.has(e.id)) result.set(e.id, e.kind === 'hide');
    for (const events of slide.steps.slice(0, step)) for (const e of events) if (e.kind === 'hide' || e.kind === 'show') result.set(e.id, e.kind === 'show');
    return result;
  }

  const stepDuration = (events) => (events || []).reduce((max, e) => Math.max(max, e.start + e.dur), 0);

  // R4：飞入的起点偏移（局部坐标，单位是对象自身宽高）—— dir 是「从哪一侧来」
  function flyOffset(dir, w, ht) {
    let x = 0, y = 0;
    if (dir.indexOf('l') >= 0) x -= w; else if (dir.indexOf('r') >= 0) x += w;
    if (dir.indexOf('t') >= 0) y -= ht; else if (dir.indexOf('b') >= 0) y += ht;
    if (!x && !y) x -= w;                      // 没方向就按「从左边飞入」
    return { x: x, y: y };
  }
  // R4：擦除/劈裂/百叶窗的裁剪路径（局部坐标：原点在对象左上角，尺寸 w×ht）
  function revealPath(ctx, rv, w, ht) {
    const p = clamp(rv.p, 0, 1), dir = String(rv.dir || 'l');
    if (rv.fx === 'wipe') {
      if (dir.indexOf('t') >= 0) ctx.rect(0, 0, w, ht * p);
      else if (dir.indexOf('b') >= 0) ctx.rect(0, ht * (1 - p), w, ht * p);
      else if (dir.indexOf('r') >= 0) ctx.rect(w * (1 - p), 0, w * p, ht);
      else ctx.rect(0, 0, w * p, ht);
      return;
    }
    if (rv.fx === 'split') {
      if (dir.indexOf('t') >= 0 || dir.indexOf('b') >= 0) { ctx.rect(0, 0, w, ht * p / 2); ctx.rect(0, ht - ht * p / 2, w, ht * p / 2); }
      else { ctx.rect(0, 0, w * p / 2, ht); ctx.rect(w - w * p / 2, 0, w * p / 2, ht); }
      return;
    }
    if (rv.fx === 'blinds') {
      const n = 8, across = dir.indexOf('t') >= 0 || dir.indexOf('b') >= 0;
      for (let i = 0; i < n; i++) {
        if (across) { const sh = ht / n; ctx.rect(0, i * sh, w, sh * p); }
        else { const sw = w / n; ctx.rect(i * sw, 0, sw * p, ht); }
      }
      return;
    }
    ctx.rect(0, 0, w, ht);                     // 兜底：不裁，交给透明度
  }

  /**
   * PPT-04：几何（尺寸/位置）关键帧的基准值 —— 取对象**本身**的几何换成「页的比例」。
   * PPT 的 ppt_x / ppt_y 是对象中心相对页面的比例（默认 0.5），ppt_w / ppt_h 是对象宽高占页面的比例。
   * 用对象自己的基准值，表达式 #ppt_w/10 才是「相对当前尺寸的十分之一」，而不是一个和对象无关的常数。
   */
  function geomBase(item, w, ht) {
    const b = (item && item.box) || { x: 0, y: 0, w: 0, ht: 0 };
    return {
      ppt_x: w > 0 ? (b.x + b.w / 2) / w : 0.5,
      ppt_y: ht > 0 ? (b.y + b.ht / 2) / ht : 0.5,
      ppt_w: w > 0 ? b.w / w : 1,
      ppt_h: ht > 0 ? b.ht / ht : 1,
    };
  }

  function effects(slide, step, phase, w, ht) {
    const transforms = new Map(), opacity = new Map(), reveals = new Map();
    const current = slide.steps[step - 1] || [], now = phase * stepDuration(current);
    // geom 事件要按对象自己的几何算基准，先把 id → item 建好（组合里的子对象也要能找到）
    const byId = new Map();
    (function index(items) {
      for (const it of items || []) {
        if (!it) continue;
        byId.set(it.id, it);
        if (it.group) index(it.group);
      }
    })(slide.list);
    for (let i = 0; i < step; i++) {
      for (const e of slide.steps[i]) {
        const p = i === step - 1 && phase < 1 ? clamp((now - e.start) / (e.dur || 1), 0, 1) : 1;
        const fx = e.fx || '';
        if (e.kind === 'show' || e.kind === 'hide') {
          if (i === step - 1) {
            // 无特效：沿用改前的纯透明度；有特效：出现只做 0/1 的硬开关（几何负责观感），
            // 消失仍然是淡出 —— PPT 里「退出」几乎都带淡出
            if (!fx) opacity.set(e.id, e.kind === 'show' ? p : 1 - p);
            else opacity.set(e.id, e.kind === 'hide' ? 1 - p : (p > 0 ? 1 : 0));
          }
          if (fx && fx !== 'fade' && p < 1) {
            // 进入：从「起点侧」滑进来，p=0 时整块在画外、p=1 归位；退出：反过来往外滑，
            // p=0 归位、p=1 滑出画外。两者用同一个 s（0→1 的「离开本位」量），别写反。
            const s = e.kind === 'hide' ? p : 1 - p;
            if (fx === 'zoom') {
              const v = transforms.get(e.id) || { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };
              const k = 1 - 0.4 * s;
              v.sx *= k; v.sy *= k; transforms.set(e.id, v);
            } else if (fx === 'fly') {
              const v = transforms.get(e.id) || { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };
              const off = flyOffset(e.dir || '', w, ht);
              v.x += off.x * s; v.y += off.y * s; transforms.set(e.id, v);
            } else {
              // 擦除/劈裂/百叶窗：进入是「铺开」，退出是「收回去」
              reveals.set(e.id, { fx: fx, dir: e.dir || '', p: e.kind === 'hide' ? 1 - p : p });
            }
          }
          continue;
        }
        const v = transforms.get(e.id) || { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };
        const factor = e.reverse ? 1 - Math.abs(p * 2 - 1) : p;
        if (e.kind === 'move') { v.x += e.dx * w * factor; v.y += e.dy * ht * factor; }
        if (e.kind === 'rotate') v.angle += e.angle * factor;
        if (e.kind === 'scale') { v.sx *= 1 + (e.sx - 1) * factor; v.sy *= 1 + (e.sy - 1) * factor; }
        if (e.kind === 'geom') {
          // PPT-04：尺寸/位置关键帧。factor 是本步的进度（0→1），PPT 的 tm 是百分比，所以乘 100。
          // 取不到解（表达式超范围）就**保持原样**并把原因留在导入告警里 —— 绝不猜一个值。
          const it = byId.get(e.id), EX = GW.pptxFx && GW.pptxFx.expr;
          if (it && EX && Array.isArray(e.keys) && e.keys.length) {
            let val = NaN;
            try {
              const frames = EX.keyframes(e.keys.map((k) => ({ pct: k.pct, value: k.text })), geomBase(it, w, ht));
              val = EX.sample(frames, factor * 100);
            } catch (err) { val = NaN; }
            if (Number.isFinite(val)) {
              const b = geomBase(it, w, ht), bx = it.box || { x: 0, y: 0, w: 0, ht: 0 };
              if (e.attr === 'ppt_w' && b.ppt_w > 0) v.sx *= clamp(val / b.ppt_w, 0.01, 20);
              else if (e.attr === 'ppt_h' && b.ppt_h > 0) v.sy *= clamp(val / b.ppt_h, 0.01, 20);
              else if (e.attr === 'ppt_x') v.x += clamp(val * w - (bx.x + bx.w / 2), -4 * w, 4 * w);
              else if (e.attr === 'ppt_y') v.y += clamp(val * ht - (bx.y + bx.ht / 2), -4 * ht, 4 * ht);
            }
          }
        }
        transforms.set(e.id, v);
      }
    }
    return { transforms, opacity, reveals };
  }

  // ── PPT-13：动画对象的几何账本 ────────────────────────────────────────────
  // 改前只有 transforms 里的几个数（x/y/angle/sx/sy），谁也没法回答「这个对象动画结束时
  // 到底多大、落在哪」。真出问题（对象动画后放大到页外、后退重播不回到原位）时只能靠眼睛看。
  // 这里用与 draw() 完全相同的矩阵语义算出**前后两个包围盒**，并保留父子关系，
  // 探针可以直接在 0/25/50/75/100% 五个相位上断言。
  const TR_ID = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };
  function boxOf(item, moved) {
    const b = item.box;
    if (!b) return { x: 0, y: 0, w: 0, ht: 0 };
    const m = moved || TR_ID;
    // 缩放/旋转都以对象中心为原点（draw() 里就是 translate(w/2,ht/2) → rotate → scale → 回移）
    const a = Math.abs(m.sx) * b.w / 2, c = Math.abs(m.sy) * b.ht / 2;
    const rot = (b.rot || 0) + m.angle;
    const cos = Math.abs(Math.cos(rot)), sin = Math.abs(Math.sin(rot));
    const ex = a * cos + c * sin, ey = a * sin + c * cos;
    const cx = b.x + b.w / 2 + m.x, cy = b.y + b.ht / 2 + m.y;
    const r = (v) => Math.round(v * 100) / 100;
    return { x: r(cx - ex), y: r(cy - ey), w: r(2 * ex), ht: r(2 * ey) };
  }
  /**
   * 每个对象在给定相位上的动画状态。百分比语义统一在这里说明：
   * - animScale 的 by 是「相对当前尺寸的百分比」，100000 = 不变 ⇒ sx = 1 + (by/100000 - 1) * 进度；
   *   多次缩放**相乘**（父子与先后步骤都按矩阵复合），这就是 PPT 的语义。
   * - animMotion 的 dx/dy 是「页宽的百分比」，所以乘的是 model.w / model.ht（页面坐标域），
   *   不是对象自身宽高 —— 早先 zoom 用对象尺寸乘过一次，就是那个「对象飞得比应该的远」的来源。
   */
  function animReport(model, page, step, phase = 1) {
    const slide = model.slides[page];
    if (!slide) return [];
    const eff = effects(slide, step, phase, model.w, model.ht);
    const out = [];
    (function walk(items, parent) {
      for (const item of items) {
        if (item.group) { walk(item.group, item.id); continue; }
        const m = eff.transforms.get(item.id);
        const op = eff.opacity.get(item.id);
        out.push({
          id: item.id, kind: item.kind, parent: parent || '',
          sx: m ? Math.round(m.sx * 1e4) / 1e4 : 1,
          sy: m ? Math.round(m.sy * 1e4) / 1e4 : 1,
          dx: m ? Math.round(m.x * 100) / 100 : 0,
          dy: m ? Math.round(m.y * 100) / 100 : 0,
          deg: m ? Math.round(m.angle * 1800 / Math.PI) / 10 : 0,
          opacity: op == null ? 1 : Math.round(op * 1000) / 1000,
          before: boxOf(item, null),
          now: boxOf(item, m),
        });
      }
    })(slide.list, '');
    return out;
  }

  function drawText(ctx, item) {
    if (!item.text.some((p) => p.runs.length)) return;
    const [l, t, r, b] = item.padding, w = item.box.w - l - r, ht = item.box.ht - t - b;
    if (!(w > 0 && ht > 0)) return;
    let lines = [], total = 0, sc = 1;
    function newLine(p, indent = 0) {
      // marL/indent 是 DrawingML 的真值（EMU→px），读不到时才退回「每级 18px」的老做法
      const base = (p.marL || p.level * 18) + indent;
      const line = { runs: [], width: 0, height: 12, indent: base + Math.max(0, p.indent || 0), align: p.align,
        // 行距：lnSpc 的百分比作用在字高上；段前段后是绝对 px，加在行与行之间
        lnSpc: p.lnSpc && p.lnSpc.pct ? p.lnSpc.pct : 1,
        bef: (p.spcBef && p.spcBef.px) || 0, aft: (p.spcAft && p.spcAft.px) || 0 };
      lines.push(line);
      return line;
    }
    function append(line, run, text) {
      const size = run.size * item.fontScale * sc;
      const family = (run.font || '').replace(/["\\\n\r]/g, '').slice(0, 100);
      const font = (run.italic ? 'italic ' : '') + (run.bold ? 'bold ' : '') + size + 'px ' + (family ? '"' + family + '", ' : '') + 'sans-serif';
      ctx.font = font;
      const width = ctx.measureText(text).width;
      line.runs.push({ text, font, width, color: run.color });
      line.width += width;
      // 1.2 是 PowerPoint 的缺省行高（改前写死 1.18，多行文本会一行比一行挤）
      line.height = Math.max(line.height, size * 1.2 * (line.lnSpc || 1));
    }
    const build = () => {
      lines = [];
      for (const p of item.text) {
        let line = newLine(p);
        if (p.bullet && p.runs.length) append(line, p.runs[0], p.bullet + ' ');
        for (const run of p.runs) {
          const tokens = run.text.match(/\n|[\t ]+|[\u2e80-\u9fff\uf900-\ufaff]|[^\s\u2e80-\u9fff\uf900-\ufaff]+/g) || [];
          for (const token of tokens) {
            if (token === '\n') { line = newLine(p); continue; }
            append(line, run, token);
            if (line.runs.length > 1 && line.width + line.indent > w) {
              const removed = line.runs.pop();
              line.width -= removed.width;
              line = newLine(p, p.bullet ? 16 : 0);
              if (token.trim()) append(line, run, token);
            }
          }
        }
      }
      total = lines.reduce((sum, line) => sum + line.height + (line.bef || 0) + (line.aft || 0), 0);
    };
    build();
    // 2.2.9：bodyPr 的 normAutofit = PowerPoint「溢出时缩排文字」。改前只认它缓存的 fontScale
    // （PowerPoint 经常根本不写这个值），文字于是按原字号铺出来、被文本框裁掉或压出框外 ——
    // 老师看到的就是「动画后文字大小和位置全乱」。这里按实际排版高度回缩，最多迭代 3 次。
    if (item.autofit) {
      for (let i = 0; i < 3 && ht > 0 && total > ht + 0.5; i++) {
        sc *= Math.max(0.2, (ht / total) * 0.995);
        build();
      }
    }
    let y = t + (item.anchor === 'ctr' ? Math.max(0, (ht - total) / 2) : item.anchor === 'b' ? Math.max(0, ht - total) : 0);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, item.box.w, item.box.ht); ctx.clip();
    ctx.textBaseline = 'alphabetic';
    for (const line of lines) {
      // 段前段后（spcBef/spcAft）：第一行只吃段前的一半，末行之后不再加段后 ——
      // 与 PowerPoint 一样，文本框高度等于内容高度，不额外顶出一行。
      y += (line.bef || 0) + (line === lines[lines.length - 1] ? 0 : line.aft || 0);
      const remain = w - line.width - line.indent;
      let x = l + line.indent + (line.align === 'ctr' ? remain / 2 : line.align === 'r' ? remain : 0);
      for (const run of line.runs) {
        ctx.fillStyle = run.color || '#000'; ctx.font = run.font;
        ctx.fillText(run.text, x, y + line.height * 0.8);
        x += run.width;
      }
      y += line.height;
    }
    ctx.restore();
  }

  function transform(ctx, box) {
    ctx.translate(box.x + box.w / 2, box.y + box.ht / 2);
    ctx.rotate(box.rot || 0);
    ctx.scale(box.flipX ? -1 : 1, box.flipY ? -1 : 1);
    ctx.translate(-box.w / 2, -box.ht / 2);
  }

  // 2.2.5：prstGeom 的预设形状有 180 多种，改前只画得出 7 种，其余一律变矩形（老师眼里就是
  // 「所有形状都成方块了」）。这里按 DrawingML 的几何定义补上课堂最常用的一批：
  // 顶点用 (u, v) 归一化坐标写在表里，统一按 w/ht 拉伸 —— PowerPoint 的预设形状也都是拉伸的。
  const POLY = {
    triangle: [[0.5, 0], [1, 1], [0, 1]],
    rtTriangle: [[0, 0], [1, 1], [0, 1]],
    diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
    parallelogram: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]],
    trapezoid: [[0.25, 0], [0.75, 0], [1, 1], [0, 1]],
    pentagon: [[0.5, 0], [1, 0.38], [0.82, 1], [0.18, 1], [0, 0.38]],
    hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
    heptagon: [[0.5, 0], [0.95, 0.22], [1, 0.78], [0.65, 1], [0.35, 1], [0, 0.78], [0.05, 0.22]],
    octagon: [[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]],
    star5: [[0.5, 0], [0.61, 0.35], [1, 0.38], [0.7, 0.6], [0.81, 1], [0.5, 0.76], [0.19, 1], [0.3, 0.6], [0, 0.38], [0.39, 0.35]],
    star6: [[0.5, 0], [0.62, 0.3], [1, 0.25], [0.75, 0.5], [1, 0.75], [0.62, 0.7], [0.5, 1], [0.38, 0.7], [0, 0.75], [0.25, 0.5], [0, 0.25], [0.38, 0.3]],
    rightArrow: [[0, 0.3], [0.65, 0.3], [0.65, 0], [1, 0.5], [0.65, 1], [0.65, 0.7], [0, 0.7]],
    leftArrow: [[1, 0.3], [0.35, 0.3], [0.35, 0], [0, 0.5], [0.35, 1], [0.35, 0.7], [1, 0.7]],
    upArrow: [[0.3, 1], [0.3, 0.35], [0, 0.35], [0.5, 0], [1, 0.35], [0.7, 0.35], [0.7, 1]],
    downArrow: [[0.3, 0], [0.7, 0], [0.7, 0.65], [1, 0.65], [0.5, 1], [0, 0.65], [0.3, 0.65]],
    chevron: [[0, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0, 1], [0.25, 0.5]],
    homePlate: [[0, 0], [0.8, 0], [1, 0.5], [0.8, 1], [0, 1]],
    plus: [[0.35, 0], [0.65, 0], [0.65, 0.35], [1, 0.35], [1, 0.65], [0.65, 0.65], [0.65, 1], [0.35, 1], [0.35, 0.65], [0, 0.65], [0, 0.35], [0.35, 0.35]],
    flowChartProcess: [[0, 0], [1, 0], [1, 1], [0, 1]],
    flowChartDecision: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
    flowChartData: [[0.2, 0], [1, 0], [0.8, 1], [0, 1]],
    flowChartDocument: [[0, 0], [1, 0], [1, 0.85], [0.75, 1], [0.5, 0.88], [0.25, 1], [0, 0.85]],
  };
  const PRST_KNOWN = new Set(['rect', 'roundRect', 'ellipse', 'line', 'donut', 'pie', 'arc', 'chord',
    'triangle', 'rtTriangle', 'diamond', 'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'heptagon', 'octagon',
    'star5', 'star6', 'rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'chevron', 'homePlate', 'plus',
    'flowChartProcess', 'flowChartDecision', 'flowChartData', 'flowChartDocument']);
  function shape(ctx, type, w, ht) {
    ctx.beginPath();
    if (type === 'line') { ctx.moveTo(0, 0); ctx.lineTo(w, ht); return; }
    if (type === 'ellipse') { ctx.ellipse(w / 2, ht / 2, w / 2, ht / 2, 0, 0, 2 * Math.PI); return; }
    if (type === 'roundRect' && ctx.roundRect) { ctx.roundRect(0, 0, w, ht, Math.min(w, ht) * 0.15); return; }
    if (type === 'donut') {
      ctx.ellipse(w / 2, ht / 2, w / 2, ht / 2, 0, 0, 2 * Math.PI);
      ctx.ellipse(w / 2, ht / 2, w / 4, ht / 4, 0, 0, 2 * Math.PI, true);
      return;
    }
    if (type === 'pie' || type === 'arc' || type === 'chord') {
      const r = Math.min(w, ht) / 2;
      ctx.moveTo(w / 2, ht / 2);
      ctx.arc(w / 2, ht / 2, r, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      return;
    }
    const pts = POLY[type];
    if (pts) {
      pts.forEach(([u, v], i) => (i ? ctx.lineTo(u * w, v * ht) : ctx.moveTo(u * w, v * ht)));
      ctx.closePath();
      return;
    }
    ctx.rect(0, 0, w, ht);
  }
  /**
   * 2.2.9：a:custGeom（自由曲线 / 任意多边形 / 编辑过顶点的形状）以前一律按矩形画 ——
   * 老师反馈的「插入的动画里 Freeform 全变成方框、大小位置跟原课件对不上」就是这条兜底造成的。
   * 这里按 DrawingML 的语义把 pathLst 读出来：路径空间的 (x, y) 线性映射到形状的 ext（这就是
   * PowerPoint 对 custGeom 的定义，不存在别的缩放规则），曲线保留为贝塞尔，绝不采样成折线。
   * 返回 [{ segs, noFill, noStroke }]（坐标已归一化到 0..1），解析不出时返回 null 交回矩形兜底。
   */
  function customGeo(pr) {
    const lst = child(child(pr, 'custGeom'), 'pathLst');
    const paths = children(lst).filter((v) => v.localName === 'path');
    if (!paths.length) return null;
    const out = [];
    for (const p of paths) {
      let nw = +attr(p, 'w'), nh = +attr(p, 'h');
      const segs = [];
      let cx = 0, cy = 0, sx = 0, sy = 0;
      const pt = (v) => [+attr(v, 'x'), +attr(v, 'y')];
      const ptsOf = (c) => children(c).filter((v) => v.localName === 'pt').map(pt);
      for (const c of children(p)) {
        const k = c.localName;
        if (k === 'moveTo') {
          const q = ptsOf(c)[0]; if (!q) continue;
          cx = q[0]; cy = q[1]; sx = cx; sy = cy;
          segs.push({ m: q });
        } else if (k === 'lnTo') {
          const q = ptsOf(c)[0]; if (!q) continue;
          segs.push({ l: q }); cx = q[0]; cy = q[1];
        } else if (k === 'cubicBezTo') {
          const v = ptsOf(c); if (v.length < 3) continue;
          segs.push({ c: [v[0], v[1], v[2]] }); cx = v[2][0]; cy = v[2][1];
        } else if (k === 'quadBezTo') {
          const v = ptsOf(c); if (v.length < 2) continue;
          segs.push({ q: [v[0], v[1]] }); cx = v[1][0]; cy = v[1][1];
        } else if (k === 'arcTo') {
          // 椭圆弧：从当前点起、按 stAng 扫 swAng（单位 1/60000 度）。按 16 段折线近似，
          // 圆心取「当前点回推一个 (wR·cos stAng, hR·sin stAng)」—— 与 DrawingML 的定义一致。
          const rx = +attr(c, 'wR'), ry = +attr(c, 'hR');
          const st0 = (+attr(c, 'stAng') || 0) * Math.PI / 10800000;
          const sw = (+attr(c, 'swAng') || 0) * Math.PI / 10800000;
          if (!rx || !ry || !sw) continue;
          const ox = cx - rx * Math.cos(st0), oy = cy - ry * Math.sin(st0);
          const N = Math.max(2, Math.min(16, Math.ceil(Math.abs(sw) / (Math.PI / 8))));
          for (let i = 1; i <= N; i++) {
            const th = st0 + sw * (i / N);
            const q = [ox + rx * Math.cos(th), oy + ry * Math.sin(th)];
            segs.push({ l: q }); cx = q[0]; cy = q[1];
          }
        } else if (k === 'close') { segs.push({ z: true }); cx = sx; cy = sy; }
      }
      if (!segs.length) continue;
      // 路径空间尺寸缺失时用坐标包围盒兜底（个别生成器不写 path@w/h）
      if (!(nw > 0 && nh > 0)) {
        let mx = 0, my = 0;
        for (const s of segs) for (const q of (s.c || s.q || [s.m || s.l]).filter(Boolean)) { mx = Math.max(mx, Math.abs(q[0])); my = Math.max(my, Math.abs(q[1])); }
        nw = mx || 1; nh = my || 1;
      }
      const nx = (q) => [q[0] / nw, q[1] / nh];
      out.push({
        segs: segs.map((s) => s.z ? { z: true } : s.m ? { m: nx(s.m) } : s.l ? { l: nx(s.l) }
          : s.c ? { c: s.c.map(nx) } : { q: s.q.map(nx) }),
        noFill: attr(p, 'fill') === 'none', noStroke: attr(p, 'stroke') === '0',
      });
    }
    return out.length ? out : null;
  }
  /** 把 customGeo() 的子路径画进 (0..w, 0..ht) —— 填充/描边按每条路径自己的 fill/stroke 开关。 */
  function paintGeo(ctx, geo, w, ht, fill, stroke, lw) {
    const X = (q) => q[0] * w, Y = (q) => q[1] * ht;
    for (const p of geo) {
      ctx.beginPath();
      for (const s of p.segs) {
        if (s.m) ctx.moveTo(X(s.m), Y(s.m));
        else if (s.l) ctx.lineTo(X(s.l), Y(s.l));
        else if (s.c) ctx.bezierCurveTo(X(s.c[0]), Y(s.c[0]), X(s.c[1]), Y(s.c[1]), X(s.c[2]), Y(s.c[2]));
        else if (s.q) ctx.quadraticCurveTo(X(s.q[0]), Y(s.q[0]), X(s.q[1]), Y(s.q[1]));
        else if (s.z) ctx.closePath();
      }
      if (fill && !p.noFill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke && !p.noStroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    }
  }

  // 每份课件一份统计（唯一资源用 Set 记账，重复绘制不再累加）
  function statsOf(model) {
    return model.dstat || (model.dstat = { ok: new Set(), bad: new Set(), tries: 0, frames: 0, plays: 0 });
  }

  async function render(model, page, step, target, width, phase = 1) {
    const slide = model.slides[page];
    if (!slide) throw new Error('找不到该页 PPT');
    const media = new Map();
    function collect(items) {
      for (const item of items) {
        if (item.group) collect(item.group);
        else if (item.image && !media.has(item.image)) media.set(item.image, model.picture(item.image));
      }
    }
    collect(slide.list);
    const loaded = new Map(await Promise.all([...media].map(async ([name, promise]) => [name, await promise])));
    // PPT-04：导入那一刻 mediaFail 必然是空的 —— picture() 是**懒解码**，parse 结束时一张图都还没读。
    // 所以「实际解码了多少、失败了多少」只能在真正画的时候统计，否则日志里的 mediaFail=0 会误导排查。
    // 2.2.9-04（P1-D）：统计必须按**资源键**去重。
    // 改前每绘制一次就给累计数 +1，而日志节流的 key 里又塞了轮次（'media|页|轮次'），
    // 于是 key 每轮都不同 —— 节流从来没生效，日志从 10278 涨到 10614，那个数字反映的
    // 只是「这页画了几次」。现在分别记：唯一资源解码成功/失败、解码尝试、成功绘制帧、视频播放。
    const dst = statsOf(model);
    dst.frames++;
    for (const [name, im] of loaded) {
      dst.tries++;
      if (im) { dst.ok.add(name); dst.bad.delete(name); } else { dst.bad.add(name); dst.ok.delete(name); }
    }
    if (loaded.size) {
      const line = '媒体解码 页=' + (page + 1)
        + ' 本页资源=' + loaded.size + ' 唯一已解码=' + dst.ok.size + ' 唯一失败=' + dst.bad.size
        + ' 解码尝试=' + dst.tries + ' 绘制帧=' + dst.frames + ' 视频播放=' + dst.plays
        + ' 覆盖清单坏项=' + ((model.audit && model.audit.mediaFail) ? model.audit.mediaFail.length : 0);
      // 有失败 ⇒ 保留 WARN 明细（5s 限频，便于确认「还在发生」）；
      // 零失败 ⇒ 只是成功摘要，降级到 info，同一页 60s 一条、统计一变再放一条。
      // 无失败的 key 只能用「唯一已解码」这种**资源口径**的量：解码尝试 / 绘制帧每画一次就 +1，
      // 一旦进 key 就相当于每帧一个新 key，节流等于没做（首版本探针实测 3 帧 3 条）。
      if (dst.bad.size) diagThrottled('media|' + page, line);
      else noteThrottled('media|' + page + '|ok=' + dst.ok.size, line, 60000);
    }
    const scale = Math.min(width / model.w, Math.sqrt(10000000 / (model.w * model.ht)), 8192 / Math.max(model.w, model.ht));
    target.width = Math.max(1, Math.round(model.w * scale));
    target.height = Math.max(1, Math.round(model.ht * scale));
    const ctx = target.getContext('2d');
    ctx.scale(target.width / model.w, target.height / model.ht);
    ctx.fillStyle = paintFill(ctx, slide.back, model.w, model.ht);
    ctx.fillRect(0, 0, model.w, model.ht);
    const shown = visibility(slide, step), effect = effects(slide, step, phase, model.w, model.ht);
    function draw(items) {
      for (const item of items) {
        const alpha = effect.opacity.get(item.id) ?? (shown.get(item.id) === false ? 0 : 1);
        if (alpha <= 0) continue;
        ctx.save();
        ctx.globalAlpha *= alpha;
        const moved = effect.transforms.get(item.id);
        // 位移必须先在**页面坐标**里加，再进对象自己的坐标系（transform 内含绕中心的旋转/翻转）——
        // 反过来的话，一个转过的文本框会被沿它自己的斜轴推走，看着就是「错位」。
        if (moved) ctx.translate(moved.x, moved.y);
        transform(ctx, item.box);
        const { w, ht } = item.box;
        if (moved) {
          ctx.translate(w / 2, ht / 2); ctx.rotate(moved.angle); ctx.scale(moved.sx, moved.sy); ctx.translate(-w / 2, -ht / 2);
        }
        // R4：擦除 / 劈裂 / 百叶窗 —— 在对象局部坐标里裁一块「已经揭开的区域」
        const reveal = effect.reveals && effect.reveals.get(item.id);
        if (reveal) { ctx.beginPath(); revealPath(ctx, reveal, w, ht); ctx.clip(); }
        if (item.group) {
          ctx.scale(w / item.childW, ht / item.childH); ctx.translate(-item.childX, -item.childY);
          draw(item.group);
        } else if (item.kind === 'frame' && item.image && loaded.get(item.image)) {
          // PPT-04：OLE 公式自带的预览图能解码 → 直接画它（老师看到的是真公式，不是虚线框）。
          // 走的是和普通图片完全相同的解码路径：解不出来时 item.image 会被清空，落回下面的占位框。
          const img = loaded.get(item.image);
          ctx.drawImage(img, 0, 0, w, ht);
        } else if (item.kind === 'frame') {
          // 表格/图表/SmartArt 的占位框：虚线边框 + 说明，让老师一眼知道「这里本来有内容」，
          // 而不是整块消失、后面的对象看着错位。桌面版烘焙接管后这条路径不会被走到。
          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = 'rgba(90,115,150,.75)';
          ctx.lineWidth = Math.max(1, Math.min(w, ht) * 0.006);
          ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, Math.max(0, w - ctx.lineWidth), Math.max(0, ht - ctx.lineWidth));
          ctx.restore();
          if (w > 56 && ht > 22) {
            ctx.fillStyle = 'rgba(90,115,150,.9)';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.note || '内容占位', w / 2, ht / 2, Math.max(0, w - 12));
          }
        } else if (item.kind === 'pic') {
          const img = loaded.get(item.image);
          if (img) {
            const [l, t, r, b] = item.crop;
            if (l + r < 1 && t + b < 1) ctx.drawImage(img, img.width * l, img.height * t, img.width * (1 - l - r), img.height * (1 - t - b), 0, 0, w, ht);
          } else {
            ctx.fillStyle = '#e4e8ef'; ctx.fillRect(0, 0, w, ht);
            ctx.fillStyle = '#354860'; ctx.font = '14px sans-serif'; ctx.fillText('图片无法呈现', 8, 21, Math.max(0, w - 16));
          }
        } else if (item.geo) {
          // 2.2.9：custGeom 走真实路径（自由曲线不再变方框）
          if (item.fill || item.stroke) paintGeo(ctx, item.geo, w, ht, item.fill, item.stroke, item.lineWidth);
          drawText(ctx, item);
        } else {
          if (item.fill || item.stroke) {
            shape(ctx, item.type, w, ht);
            if (item.fill && item.type !== 'line') { ctx.fillStyle = paintFill(ctx, item.fill, w, ht); ctx.fill(); }
            if (item.stroke) { ctx.strokeStyle = item.stroke; ctx.lineWidth = item.lineWidth; ctx.stroke(); }
          }
          drawText(ctx, item);
        }
        ctx.restore();
      }
    }
    draw(slide.list);
    // PPT-13：动画把对象推出页面外是最常见的「动画后尺寸/位置不对」。
    // 只在动画相位结束那一帧算一次，不与绘制争开销；命中就写一行日志（带页码/对象 ID/包围盒）。
    if (step > 0 && phase >= 1 && model.w > 0) {
      const out = animReport(model, page, step).filter((it) => {
        const n = it.now;
        return n.w >= 1 && n.ht >= 1 && (n.x + n.w < 0 || n.y + n.ht < 0 || n.x > model.w || n.y > model.ht);
      });
      if (out.length) {
        diagThrottled('anim|' + page + '|' + step, '动画出界 页=' + (page + 1) + ' 步=' + step + ' 对象=' + out.length
          + ' 首个=' + out[0].id + '[' + out[0].now.x + ',' + out[0].now.y + ' ' + out[0].now.w + 'x' + out[0].now.ht + ']'
          + ' 页面=' + Math.round(model.w) + 'x' + Math.round(model.ht));
      }
    }
    return target;
  }

  const cache = new WeakMap(), pathCache = new Map();
  /**
   * PPT-06 资源生命周期：文件后备的模型握着一个主进程文件句柄，谁都不能「用完就关」——
   * 同一个 .pptx 可能在板书里放了两个对象，也可能从对象卡与放映两处同时取用。
   * 所以按路径键做引用计数：最后一个使用者销毁时才关句柄并清缓存，
   * 关掉之后再打开会重新开表（重试即重开，不需要额外的重试状态机）。
   */
  const pathRefs = new Map();
  function retainPath(p) { if (p) pathRefs.set(p, (pathRefs.get(p) || 0) + 1); }
  function releasePath(p) {
    if (!p) return;
    const n = (pathRefs.get(p) || 0) - 1;
    if (n > 0) { pathRefs.set(p, n); return; }
    pathRefs.delete(p);
    // 同一个路径在 pathCache 里可能有多份（文件被换过）：一起收掉。
    for (const key of Array.from(pathCache.keys())) {
      if (key.slice(0, p.length + 1) !== p + '|') continue;
      const job = pathCache.get(key);
      pathCache.delete(key);
      job.then((model) => { if (model && typeof model.close === 'function') model.close(); }).catch(() => {});
    }
  }
  async function modelOf(o) {
    const asset = o.data.asset ? GW.doc.assets[o.data.asset] : null;
    if (asset) {
      if (asset.data.length > Math.ceil(MAX_FILE / 3) * 4) throw new Error('PPT 源文件缺失或超过 64 MB');
      if (!cache.has(asset)) cache.set(asset, parse(GW.assets.bytes(o.data.asset)));
      return cache.get(asset);
    }
    // 2.2.5：大 PPT 不再把源文件 base64 内联进 .gewu（一份 150 MB 的 PPT 会让存档与
    // 每 20 秒一次的自动备份一起卡死）。这类对象只记本机路径，用时从磁盘读。
    const p = o.data.path;
    if (!p || !(window.gewu && window.gewu.readFile)) throw new Error('PPT 源文件缺失');
    const info = await window.gewu.fileInfo(p);
    if (!info || !info.exists) throw new Error('PPT 源文件已移动或删除：' + p);
    const key = p + '|' + info.size + '|' + info.mtime;
    if (!pathCache.has(key)) {
      // PPT-06：大于 64 MB 的课件只开表（中央目录十几 KB），解析时按条目随机读。
      // 小文件维持老做法（整读后解析，顺带能复用同一次 readFile 的结果做 hash/内联）。
      const big = info.size > MAX_FILE && window.gewu && window.gewu.pptZipOpen;
      const job = big
        ? window.gewu.pptZipOpen(p).then((opened) => {
          if (!opened || !opened.ok) {
            const why = (opened && (opened.detail || opened.why)) || '未知原因';
            diag('重新打开失败 阶段=open 原因=' + why + ' 路径=' + String(p).slice(-80));
            throw new Error('PPT 源文件无法读取：' + why);
          }
          return parse(null, opened);
        })
        : window.gewu.readFile(p).then((buf) => parse(buf instanceof Uint8Array ? buf : new Uint8Array(buf)));
      pathCache.set(key, job);
      job.catch(() => pathCache.delete(key));
    }
    return pathCache.get(key);
  }
  const position = (model, data) => {
    const page = clamp(Math.trunc(+data.page || 0), 0, model.slides.length - 1);
    return { page, step: clamp(Math.trunc(+data.step || 0), 0, model.slides[page].steps.length) };
  };
  const live = (o) => GW.doc.pages.flatMap((p) => p.objs).find((it) => it.id === o.id);

  // ── 烘焙（2.2.5）──────────────────────────────────────────────────────────
  // 原生解析器只画得出 7 种 prstGeom、丢掉表格/图表/SmartArt、行距与自动缩放也读不全，
  // 所以「绝大部分动画和内容大小全是乱的」不是调参能解决的。桌面版有 WPS/Office 时，
  // 直接让 Office 自己把**每个动画步骤的末态**渲染成整页 PNG（主进程 main/bake.js 干这事），
  // 放映时贴图即可 —— 排版/字体/表格/图表全保真，且不再逐帧跑我们的绘制器。
  // 没有 WPS/Office 或文件已移动时返回 null，一切照旧走 canvas 渲染（降级不报错）。
  // 与 visibility() 同一套语义（值 = 是否可见），只是返回「这一步开始前隐藏了哪些 id」，
  // 交给 Office 侧把那些形状的 Visible 设成 0 再导出 —— 于是每一帧都是 Office 自己渲染的末态。
  function visibleAt(slide, step) {
    const cur = new Map();
    for (const events of slide.steps) for (const e of events) {
      if ((e.kind === 'show' || e.kind === 'hide') && !cur.has(e.id)) cur.set(e.id, e.kind === 'hide');
    }
    for (const events of slide.steps.slice(0, step)) for (const e of events) {
      if (e.kind === 'show' || e.kind === 'hide') cur.set(e.id, e.kind === 'show');
    }
    return cur;
  }
  function bakePlan(model) {
    return { slides: model.slides.map((slide) => {
      if (!slide.shapeIds || !slide.shapeIds.length) return { hidden: null };
      const list = [];
      for (let k = 0; k <= slide.steps.length; k++) {
        const cur = visibleAt(slide, k);
        // 只有「有动画、且此刻不可见」的形状才隐藏；没动画的形状 Visible 判断为 undefined，保持可见。
        list.push(slide.shapeIds.filter((id) => cur.get(id) === false));
      }
      return { hidden: list };
    }) };
  }
  /* PPT-10：烘焙这条链路的现场必须能追。
   *
   * 以前 ensureBake 失败只是 `.catch(() => null)` —— 界面上没有任何提示，日志里也没有一行，
   * 于是「PPT 模型渲染不出数学公式」和「这台机器根本没装 WPS」在反馈里长得一模一样。
   * 现在每次烘焙都带 reqId，成功记 PNG 数/页步数/耗时，失败记 why/stage/detail，
   * 并把失败原因留在界面上（降级说明），而不是悄悄吞掉。
   */
  /* §四「信息」：失败时要能「复制脱敏诊断」，而改前 diag 只往 console 打一行、内存里什么都不留，
   * 老师一反馈「视频黑屏」，我们手里就只有一句口头描述。这里补一个 200 行的环形缓冲：
   * 真正给老师看的还是「更多 → 放映信息」里那几个正常字段，调试字段只在复制出来的文本里。 */
  const DIAG_LOG = [];
  const diag = (msg) => {
    try {
      const line = String(msg);
      DIAG_LOG.push(line);
      if (DIAG_LOG.length > 200) DIAG_LOG.shift();
      console.warn('[ppt] ' + line);
    } catch (e) { /* 控制台不可用就算了 */ }
  };
  /* CAST-08 同类问题：诊断也要限频。
   * render() 会被每一帧、每一次缩放调用，而「动画出界」这类判断在同一个 页+步 上是恒定的，
   * 不加限频就会在拖动画布时每秒往日志里灌几十行同样的内容，把真正的失败淹没掉。
   * 同一个 key 在窗口期内只放行一次，跨窗口再放行一次（便于确认「还在发生」）。
   */
  const diagSeen = new Map();
  const diagThrottled = (key, msg, windowMs) => {
    const now = Date.now(), win = windowMs || 5000;
    const last = diagSeen.get(key) || 0;
    if (now - last < win) return;
    diagSeen.set(key, now);
    if (diagSeen.size > 200) diagSeen.clear();
    diag(msg);
  };
  /* LOG 段（任务书）：成功摘要不该占用 WARN。
   * 现场日志 2026-11-20 当天 5,973 条 WARN 里 5,824 条是「媒体解码」成功摘要（唯一失败恒 0），
   * 真实失败全被淹掉。所以拆两条通道：
   *   diag()  —— 真失败/异常，console.warn，维持限频（5s）；
   *   note()  —— 正常级别 console.info，仍进 DIAG_LOG 环形缓冲（「复制诊断」里照样能看到），
   *              但不再抬高 WARN 计数；成功摘要另按 60s + 统计变化去重。
   * 判「统计变化」用 唯一已解码/唯一失败/解码尝试 三元组：数字一动说明这页真的又解码了新东西。 */
  const noteSeen = new Map();
  const note = (msg) => {
    try {
      const line = String(msg);
      DIAG_LOG.push(line);
      if (DIAG_LOG.length > 200) DIAG_LOG.shift();
      console.info('[ppt] ' + line);
    } catch (e) { /* 控制台不可用就算了 */ }
  };
  const noteThrottled = (key, msg, windowMs) => {
    const now = Date.now(), win = windowMs || 60000;
    const last = noteSeen.get(key) || 0;
    if (now - last < win) return;
    noteSeen.set(key, now);
    if (noteSeen.size > 200) noteSeen.clear();
    note(msg);
  };
  const bakeFail = new Map();   // path -> { why, stage, detail, at, tries }
  /* PPT-B（2026-11-20 真机复现）：bakeJob 在 2.2.9 里**只有使用处、没有声明** ——
   * :1360 `bakeJob.has(p)` 直接抛 ReferenceError（文件头是 'use strict'），而它发生在
   * 「烘焙开始」这条日志（:1378）之前，所以生产日志里连一行烘焙记录都没有，
   * 表现为「PPT 永远不会走烘焙路线」。声明必须与 bakeFail/bakeSeq 放在同一处。
   */
  const bakeJob = new Map();    // path -> Promise<Bake|null>，同源并发烘焙去重
  let bakeSeq = 0;

  /** 人话版的失败原因（界面与日志共用一份，避免两处说法不一致）。 */
  function whyText(res) {
    const w = (res && res.why) || '';
    if (w === 'no-com') return '本机没有可用的 WPS/Office（演示文稿引擎不可用）';
    if (w === 'open-failed') return '演示文稿打不开（文件被占用或已损坏）';
    if (w === 'timeout') return '转换超时（WPS 可能弹了窗）';
    if (w === 'missing') return '源文件已被移动或删除';
    if (w === 'bad-src') return '源文件路径无效';
    if (w === 'hash-failed') return '源文件读不出来';
    if (w === 'no-result' || w === 'bad-json') return '转换进程没有返回结果';
    return '转换失败（' + (w || '未知') + '）';
  }

  /** 当前对象的降级说明；没降级就返回空串（界面直接拼在状态行后面）。 */
  function degradeNote(o) {
    const p = o && o.data && o.data.path;
    if (!p) return '';
    const f = bakeFail.get(p);
    if (!f) return '';
    return ' · 兼容渲染（' + whyText(f) + '）';
  }

  /**
   * PPT-01：**计划路线**与**实际路线**是两件事，必须分开记。
   * plannedRoute 是导入时按「有没有源路径 / 有没有烘焙桥」做的预判；actualRoute 是**真的渲染出来了**
   * 之后才写得出来的事实（bake 成功贴图 / 回退画布 / 原生渲染）。改前只有一个 route=bake，
   * 内联副本、烘焙失败、贴图缺失全都显示成 bake —— 于是「Office 渲染成功」这句话根本没有依据。
   */
  function setRoute(o, actual, why) {
    const cur = live(o);
    if (!cur) return;
    const r = cur.data.route = cur.data.route || {};
    r.actual = actual;
    r.actualWhy = why || '';
    r.actualAt = Date.now();
    if (GW.markDirty) GW.markDirty();
  }
  function routeOf(o) {
    const r = (o && o.data && o.data.route) || {};
    return { planned: r.planned || '', actual: r.actual || '', why: r.actualWhy || '', at: r.actualAt || 0 };
  }

  /**
   * PPT-A（2026-11-20 现场日志：同一进程内重复插入同一份课件）：
   * **共享产物**与**逐对象绑定**是两件事，2.2.9 把它们混成了一件。
   * 改前烘焙成功后只写 `live(o).data.bake`（最初调用的那一个对象），而成功 Promise 一直留在
   * bakeJob 里，于是第二个同源对象的 ensureBake() 直接拿到同一个 Promise、只 refresh 一次，
   * data.bake 始终是空的 —— bakeOf() 返回 null，放映退回原生 canvas 渲染（动画失真）。
   *
   * 现在：bakeStore(path → 产物) 存「这份文件的烘焙结果」，data.bake 只表示「这个对象用哪份产物」；
   * 产物落地后**所有仍存活的同源对象各自绑定**并让各自的绘制签名失效；in-flight 表只去重
   * 正在执行的任务，settle 后按任务身份清除。清缓存不能当修法（任务书明确禁止）。
   */
  const bakeStore = new Map();   // path -> { bake, reqId, hit, fp, ver }

  /** 板书里还有哪些对象用着这个源文件（重复插入同一份课件会有多个）。 */
  function liveByPath(p) {
    const out = [];
    try {
      for (const pg of GW.doc.pages) {
        for (const it of pg.objs) {
          if (it && it.type === 'slides' && it.data && it.data.path === p) out.push(it);
        }
      }
    } catch (e) { /* 文档还没就绪：视为没有其它对象 */ }
    return out;
  }

  function framesOf(bake) {
    let n = 0;
    for (const files of (bake && bake.slides) || []) for (const x of files) if (x) n++;
    return n;
  }

  /** 把一份产物绑到单个对象上：只动这个对象的数据，并让它的卡片/放映重新算签名。 */
  function bindBake(o, bake, meta) {
    const cur = live(o);
    if (!cur) return false;
    const old = cur.data.bake;
    const same = !!(old && old.dir === bake.dir && old.slides === bake.slides);
    if (!same) {
      cur.data.bake = bake;
      if (GW.markDirty) GW.markDirty();
      // 只叫醒这个对象的实例（player.refresh）。**不能**用 GW.objects.update ——
      // 元素不在 DOM 上时它会 remount，把别的页上的卡片也挂起来。
      try { if (cur._inst && typeof cur._inst.onUpdate === 'function') cur._inst.onUpdate(); } catch (e) { /* 卡片不在屏上 */ }
      if (ST.on && ST.o && ST.o.id === cur.id) paintSlide(false);
    }
    setRoute(cur, 'bake', meta.hit);
    note('烘焙绑定 任务=' + (meta.reqId || '-') + ' 对象=' + String(cur.id) + ' 源指纹=' + (meta.fp || '-')
      + ' 命中=' + meta.hit + ' 帧=' + framesOf(bake) + ' 目录=' + String(bake.dir || '').slice(-36)
      + (same ? ' 状态=已是同一产物' : ' 状态=新绑定'));
    return !same;
  }

  /** 产物落地：存一份给后续同源对象用，然后给所有存活同源对象各自绑定。 */
  function publishBake(p, bake, meta) {
    const prev = bakeStore.get(p);
    if (!prev || prev.bake !== bake) {
      const entry = { bake, reqId: meta.reqId, hit: meta.hit, fp: meta.fp, ver: auditBake(bake) };
      bakeStore.set(p, entry);
      // 复验不过就立刻作废：否则新对象进来会反复「绑定→验证失败→重烘」。
      entry.ver.then((v) => { if (!v || !v.complete) { if (bakeStore.get(p) === entry) bakeStore.delete(p); } })
        .catch(() => { if (bakeStore.get(p) === entry) bakeStore.delete(p); });
    }
    const objs = liveByPath(p);
    let fresh = 0;
    for (const it of objs) if (bindBake(it, bake, meta)) fresh++;
    note('烘焙产物 任务=' + (meta.reqId || '-') + ' 源=' + String(p).slice(-40) + ' 命中=' + meta.hit
      + ' 光标=' + String(meta.fp || '-') + ' 同源对象=' + objs.length + ' 本次新绑定=' + fresh
      + ' 帧=' + framesOf(bake) + ' 完整=' + (bake.complete ? '是' : '否'));
    return bake;
  }

  function ensureBake(o) {
    const p = o && o.data && o.data.path;
    if (!p || !(window.gewu && window.gewu.pptBake)) return Promise.resolve(null);
    if (o.data.bake && o.data.bake.dir) {
      // PPT-02：缓存命中必须复验。改前只要 data.bake.dir 在就直接当可用，
      // PNG 被删、被写成 0 字节、截断，全都照样贴 —— 坏缓存于是成了「永久成功」。
      const hit = o.data.bake;
      return auditBake(hit).then((v) => {
        if (v.complete) {
          // 缓存命中：本对象记 cached，同时把这份产物补给其它还没绑定的同源对象
          const meta = { reqId: hit.reqId || '-', hit: 'cached', fp: 'data' };
          const prev = bakeStore.get(p);
          if (!prev || prev.bake !== hit) {
            bakeStore.set(p, { bake: hit, reqId: meta.reqId, hit: 'cached', fp: 'data', ver: Promise.resolve(v) });
          }
          for (const it of liveByPath(p)) bindBake(it, hit, meta);
          if (!(o.data.bake && o.data.bake.dir)) setRoute(o, 'bake', 'cached');
          return hit;
        }
        diag('烘焙缓存失效 来源=数据里的 bake 页=' + v.pages + ' 帧=' + v.steps + ' 可用=' + v.ok + ' 缺陷=' + v.bad.length + ' → 作废重烘');
        delete o.data.bake;
        if (GW.markDirty) GW.markDirty();
        if (bakeStore.get(p) && bakeStore.get(p).bake === hit) bakeStore.delete(p);
        return ensureBake(o);
      });
    }
    // 同源对象已经烘好一份：直接复用产物（不重烘），但仍然逐个绑定 + 复验。
    const shared = bakeStore.get(p);
    if (shared) {
      return shared.ver.then((v) => {
        if (!v || !v.complete) {
          if (bakeStore.get(p) === shared) bakeStore.delete(p);
          return ensureBake(o);
        }
        const meta = { reqId: shared.reqId || '-', hit: 'shared', fp: shared.fp || 'shared' };
        for (const it of liveByPath(p)) bindBake(it, shared.bake, meta);
        return shared.bake;
      });
    }
    if (bakeJob.has(p)) {
      // 只去重「正在执行」的任务：它 settle 时会通过 publishBake 绑给所有存活同源对象（含后来者）。
      note('烘焙去重 源=' + String(p).slice(-40) + ' 等待进行中的任务');
      return bakeJob.get(p);
    }
    const job = (async () => {
      const reqId = 'p' + (++bakeSeq);
      const t0 = performance.now();
      let model;
      try {
        model = await modelOf(o);
      } catch (e) {
        bakeFail.set(p, { why: 'parse', stage: 'read', detail: String(e && e.message || e), at: Date.now(), tries: 1 });
        diag(reqId + ' 解析失败 ' + (e && e.message));
        return null;
      }
      const passed = Object.assign({
        width: 1920, height: Math.round(1920 * (model.ht / model.w)),
      }, bakePlan(model));
      // PPT-01：烘焙从这一行才算真的开始 —— 有 requestId、有源文件标识、有预期页步数、有起始时刻。
      // PPT-B：预期帧数必须按**计划结构**算。改前读的是 s.files，而 bakePlan() 返回的是
      // { hidden: [...] }（没有 files 字段），于是「预期帧=0」恒成立，日志里的分母永远是 0、
      // 「完成度」也就无从对照。主进程的规则（main/bake.js:292）是：
      // hidden 为数组 → 帧数 = hidden.length；hidden 为 null（该页没有按步骤隐藏的判据）→ 只导末态 1 帧。
      const wantSteps = (passed.slides || []).reduce((n, s) => n + (s && Array.isArray(s.hidden) ? s.hidden.length : 1), 0);
      const wantPages = (passed.slides || []).length;
      note('烘焙开始 ' + reqId + ' 源=' + String(p).slice(-40) + ' 页=' + wantPages + ' 预期帧=' + wantSteps
        + ' 输出=' + passed.width + 'x' + passed.height + ' 开始=' + Math.round(t0));
      let res = null;
      try {
        res = await window.gewu.pptBake(p, passed);
      } catch (e) {
        res = { ok: false, why: 'ipc', stage: 'ipc', detail: String(e && e.message || e) };
      }
      const ms = Math.round(performance.now() - t0);
      if (!res || !res.ok || !Array.isArray(res.slides)) {
        const fail = {
          why: (res && res.why) || 'empty', stage: (res && res.stage) || '?',
          detail: (res && res.detail) || '', at: Date.now(),
          tries: ((bakeFail.get(p) || {}).tries || 0) + 1,
        };
        bakeFail.set(p, fail);
        // PPT-01：失败也是一条可断言的事实 —— 实际路线是「原生画布渲染」，原因可关联到具体 requestId。
        setRoute(o, 'native', fail.why + '@' + fail.stage);
        // 页数/页步数这些「本该有多少」的量也一起记 —— 失败时才知道是整份没出来还是只坏了几页。
        diag('烘焙失败 ' + reqId + ' hash=' + String((res && res.hash) || '').slice(0, 8)
          + ' 页=' + model.slides.length + ' 引擎=' + ((res && res.app) || '?-')
          + ' why=' + fail.why + ' 阶段=' + fail.stage + ' 第' + fail.tries + '次'
          + ' 耗时=' + ms + 'ms' + (fail.detail ? ' detail=' + String(fail.detail).slice(0, 300) : '')
          + '（' + whyText(res) + '）');
        return null;
      }
      const bake = {
        dir: res.dir,
        slides: res.slides.map((s) => (s && Array.isArray(s.files) ? s.files : [])),
        reqId: res.reqId || reqId,
        complete: res.complete === true,
        defects: Array.isArray(res.defects) ? res.defects : [],
      };
      let pngs = 0, steps = 0;
      for (const files of bake.slides) { steps += files.length; for (const x of files) if (x) pngs++; }
      // PPT-02：主进程的 PNG 头校验之外，再按「真的能贴出来」复验一次。
      // 两条判据都过才叫完整；有一条不过就**不写进数据、不进缓存**（下次会重烘），
      // 但可用帧照常回给界面 —— 老师不该因为第 7 页坏了一张就整份看不了。
      const ver = await auditBake(bake);
      const complete = !!(bake.complete && ver.complete);
      // 逐页完成度日志：每页的帧数/可用数/首个缺陷，出问题能直接指到页。
      const perPage = [];
      for (let i = 0; i < bake.slides.length; i++) {
        const files = bake.slides[i];
        const n = Array.isArray(files) ? files.length : 0;
        const bad = ver.bad.filter((b) => b.page === i + 1).length;
        if (bad || !n) perPage.push('第' + (i + 1) + '页 ' + n + '帧 坏' + bad);
      }
      note('烘焙完成 ' + (res.reqId || reqId) + ' hash=' + String(res.hash || '').slice(0, 8)
        + ' 页=' + model.slides.length + ' 页步=' + steps + ' PNG=' + pngs
        + ' 可用=' + ver.ok + ' 缺陷=' + (ver.bad.length + (bake.defects || []).length)
        + ' 完整=' + (complete ? '是' : '否')
        + ' 引擎=' + (res.app || '?-')
        + ' 缓存=' + (res.cached === 'hit' ? '命中' : '新烘')
        + (perPage.length ? ' 坏页=' + perPage.slice(0, 6).join('；') : '')
        + (res.exportErrors ? ' 导出报错=' + res.exportErrors.length : '')
        + ' 耗时=' + ms + 'ms');
      if (!complete) {
        // 不完整：**不**写进 data.bake（否则下次进来被当成完整缓存复用，就是 PPT-02 说的伪成功）。
        bakeFail.set(p, {
          why: 'partial-export', stage: 'export',
          detail: (bake.defects[0] ? bake.defects[0].kind + '@' + bake.defects[0].page + '/' + bake.defects[0].step : (ver.bad[0] ? ver.bad[0].kind + '@' + ver.bad[0].page + '/' + ver.bad[0].step : '')),
          at: Date.now(), tries: ((bakeFail.get(p) || {}).tries || 0) + 1,
        });
        // 缓存目录里确实有可用帧时，仍然让这一次放映用它（不完整但不空白）；
        // 只是不落进 data.bake、不落 manifest，重进/重试会重新烘焙。
        if (ver.ok > 0) { bake.partial = true; return bake; }
        return null;
      }
      bakeFail.delete(p);
      // 产物与绑定分开：publishBake 会把这份产物给**所有**存活的同源对象各自绑上。
      publishBake(p, bake, {
        reqId: res.reqId || reqId,
        hit: res.cached === 'hit' ? 'cached' : 'fresh',
        fp: String(res.hash || '').slice(0, 8) || 'nohash',
      });
      return bake;
    })().catch((e) => { diag('烘焙异常 ' + (e && e.message)); return null; });
    bakeJob.set(p, job);
    // settle 后按**任务身份**清除：失败要能重来，成功也要让后来者走「共享产物」路径，
    // 而不是拿到一个已经绑给别人的旧 Promise（那正是 2.2.9 的重复插入故障）。
    job.finally(() => { if (bakeJob.get(p) === job) bakeJob.delete(p); });
    return job;
  }
  function bakeOf(o) {
    const b = o && o.data && o.data.bake;
    return b && b.dir && Array.isArray(b.slides) ? b : null;
  }
  function bakeUrl(bake, page, step) {
    const files = bake && bake.slides[page];
    if (!Array.isArray(files) || !files.length) return '';
    const name = files[clamp(step, 0, files.length - 1)];
    return name ? GW.fileURL(String(bake.dir).replace(/[\\/]+$/, '') + '/' + name) : '';
  }
  const imgCache = new Map();
  /**
   * PPT-02：**失败的结果不许永久缓存**。
   * 改前 onerror 直接 resolve(null) 并把这个 Promise 留在 imgCache 里，于是「缓存目录被清理」
   * 「一次被占用没读到」这类临时失败会跟着这个对象走一整个会话 —— 源文件恢复正常了也再不会重试，
   * 老师看到的永远是「步骤图片模式」却贴不出图。现在只缓存**成功**的位图；
   * 失败当场从表里删掉，下一帧还能重新试一次（真坏了也只是每帧多一次 onerror，不占内存）。
   */
  function bakeImage(url) {
    if (!url) return Promise.resolve(null);
    if (imgCache.has(url)) return imgCache.get(url);
    const job = new Promise((resolve) => {
      const im = new Image();
      im.onload = () => {
        // 零尺寸 = 文件在、内容无效（截断/被写成 0 字节），按失败处理而不是当可用帧。
        if (!(im.naturalWidth > 0 && im.naturalHeight > 0)) { imgCache.delete(url); resolve(null); return; }
        resolve(im);
      };
      im.onerror = () => { imgCache.delete(url); resolve(null); };
      im.src = url;
    });
    imgCache.set(url, job);
    return job;
  }
  /**
   * PPT-02：逐页逐帧复验烘焙产物（渲染层视角）。
   * 主进程那边按 PNG 头校验过一遍；这里再从「能不能真的贴出来」验一次 —— 两边判据不同，
   * 一条能过一条不能过时，正是「manifest 说完整、画面是空白」的典型场景，必须暴露出来。
   * 不拿像素全白/全黑当失败判据：源动画本来就可能是一张空白页。
   */
  async function auditBake(bake) {
    // complete 一开始就是 false：null / 结构不对的输入必须算「不完整」，不许因为没走到赋值
    // 而让 out.complete 变成 undefined（那在 `=== false` 的判断里就是「不完整但看着像通过」）。
    const out = { pages: 0, steps: 0, ok: 0, bad: [], complete: false };
    if (!bake || !bake.dir || !Array.isArray(bake.slides)) return out;
    for (let p = 0; p < bake.slides.length; p++) {
      const files = bake.slides[p];
      out.pages++;
      if (!Array.isArray(files)) { out.bad.push({ kind: 'no-files', page: p + 1, step: 0 }); continue; }
      for (let s = 0; s < files.length; s++) {
        out.steps++;
        const url = bakeUrl(bake, p, s);
        if (!files[s]) { out.bad.push({ kind: 'empty', page: p + 1, step: s }); continue; }
        const im = await bakeImage(url);
        if (!im) { out.bad.push({ kind: 'missing', page: p + 1, step: s, name: String(files[s]) }); continue; }
        out.ok++;
      }
    }
    out.complete = out.bad.length === 0 && out.steps > 0;
    if (!out.complete) {
      const first = out.bad.slice(0, 3).map((b) => b.kind + '@' + b.page + '/' + b.step).join(',');
      diag('烘焙复验未通过 页=' + out.pages + ' 帧=' + out.steps + ' 可用=' + out.ok + ' 缺陷=' + out.bad.length + ' 首个=' + first);
    }
    return out;
  }
  // ── PPT-D：原版放映 ─────────────────────────────────────────────────────
  // 任务书写明：Office 的 Slide.Export 只能出静态步骤图，连续动画/视频不可能靠烘焙呈现。
  // 所以「不支持连续动画」这句话必须配一个**真的能用**的出口 —— 用本机 WPS/Office 打开
  // 课件并进放映。这里只做三件事：能不能（hasShow）、开始、结束；具体 COM 操作全在主进程。
  const hasShow = () => !!(window.gewu && typeof window.gewu.pptShowStart === 'function');
  function showWhy(e) {
    const w = (e && e.why) || '';
    if (w === 'no-com') return '本机没有可用的 WPS/Office（无法原版放映）';
    if (w === 'busy') return '已经有一个原版放映在运行';
    if (w === 'missing') return '源文件已移动或删除，无法原版放映';
    if (w === 'open-failed') return '演示文稿打不开（文件被占用或损坏）';
    if (w === 'start-timeout') return '等待放映启动超时（Office 可能被弹窗挡住）';
    if (w === 'no-path') return '这份课件只有内联副本，没有源路径（Office 必须按路径打开）';
    return w || (e && e.detail) || '未知原因';
  }
  async function showExternal(o) {
    if (!hasShow()) { GW.toast('此设备不支持原版放映（需要桌面版 + WPS/Office）', 4200); return false; }
    const p = o && o.data && o.data.path;
    if (!p) { GW.toast('这份课件没有源路径，无法交给 Office 原版放映（请用「从本机文件」重新插入）', 5200); return false; }
    GW.toast('正在用本机 Office 打开放映…', 2600);
    let r = null;
    try { r = await window.gewu.pptShowStart(p); } catch (e) { r = { ok: false, why: 'ipc', detail: String((e && e.message) || e) }; }
    if (r && r.ok) {
      note('原版放映已启动 阶段=' + r.stage + ' 页=' + (r.pages || 0) + ' 文件=' + String(p).slice(-70));
      GW.toast('原版放映已在新窗口打开（Esc 退出）', 3600);
      return true;
    }
    diag('原版放映启动失败 原因=' + ((r && r.why) || '?') + ' detail=' + String((r && r.detail) || '').slice(0, 200));
    GW.toast('原版放映启动失败：' + showWhy(r), 5200);
    return false;
  }
  // 放映期间画布里的「结束原版放映」按一次就收场（不 taskkill，让 Office 自己退出）
  async function stopExternal() {
    if (!(window.gewu && window.gewu.pptShowStop)) return null;
    try {
      const r = await window.gewu.pptShowStop();
      // 收场结果四分类（idle/graceful/forced/error）照实记账：内部有 residue 时不能装作干净。
      if (r && r.mode && r.mode !== 'idle') {
        diag('原版放映收场 方式=' + r.mode + ' 会话=' + (r.session || '-') + ' PID=' + (r.pid || 0)
          + ' 强杀=' + (r.killed ? '是' : '否') + ' 退出码=' + (r.code === null || r.code === undefined ? '-' : r.code)
          + (r.signal ? ' 信号=' + r.signal : '') + ' 阶段=' + (r.exitStage || '-'));
      }
      return r;
    } catch (e) { diag('原版放映收场失败 ' + ((e && e.message) || e)); return null; }
  }

  // 把烘焙图按 contain 画进目标画布（保留黑边，与全屏放映一致）
  function drawBaked(ctx, im, w, ht) {
    if (!im) return false;
    const k = Math.min(w / im.width, ht / im.height);
    const dw = Math.max(1, Math.round(im.width * k)), dh = Math.max(1, Math.round(im.height * k));
    ctx.drawImage(im, Math.round((w - dw) / 2), Math.round((ht - dh) / 2), dw, dh);
    return true;
  }

  async function snapshot(o, scale) {
    const model = await modelOf(o), { page, step } = position(model, o.data);
    const width = Math.max(1, o.w * (scale || 1));
    const bake = await ensureBake(o).catch(() => null);
    if (bake) {
      const im = await bakeImage(bakeUrl(bake, page, step));
      if (im) {
        const k = Math.min(width / model.w, 8192 / model.w);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(model.w * k));
        cv.height = Math.max(1, Math.round(model.ht * k));
        const ctx = cv.getContext('2d');
        drawBaked(ctx, im, cv.width, cv.height);
        return cv;
      }
    }
    return render(model, page, step, document.createElement('canvas'), width);
  }

  function report(model) {
    const list = h('ul', { class: 'pptx-report' });
    model.slides.forEach((slide, page) => {
      if (slide.warnings.length) list.append(h('li', null, '第 ' + (page + 1) + ' 页 · ' + slide.warnings.join('、')));
    });
    GW.dialog({ title: 'PPT 导入说明', width: 560, ok: '完成', cancel: null,
      body: h('div', null, h('p', null, model.slides.length + ' 页。请在放映前核对图文和揭示顺序。'), list) });
  }

  /**
   * PPT-05：媒体播放层。
   * 为什么是「浮层 + 封面」而不是把视频直接画进画布：画布是离屏重绘的（每帧 render 一遍），
   * 视频帧没法跟着画；而且 <video> 自带控件（暂停/重播/拖进度/音量）是老师唯一能用的东西，
   * 自绘控件等于重写一遍播放器。所以画布只画封面（本来就是 pic 分支里那张 blipFill 图），
   * 视频浮在同一个框上、封面当 poster 先显示，点一下才开始播。
   * 资源释放：任何一次翻页/关闭都会 pause() + removeAttribute('src') + load() —— 三连缺一不可，
   * 只 pause 句柄还握着解码器，翻几十页之后 Chromium 会开始拒绝再建新的 video 元素。
   */
  // ---------- §二 V2：媒体会话记账（真实帧 / 会话代次 / 视图模式） ----------
  // 任务书 §二要求直接对照「当前包 + 实际轨道帧」，而不是拿上一轮 Electron 45 的结论。
  // 两条硬约束写进这里：
  //   ① 必须能分辨「谁在放」—— viewMode（card/show）+ showSessionId + 页/步 + 请求来源；
  //   ② playing / currentTime 在走**不算**播成功，只有真的呈现出新帧才算（真帧另记 frames）。
  let showSeq = 0;                    // 放映会话号：每次进放映 +1，异步回调靠它判过期
  const MEDIA = new Map();            // 记账表：key -> rec（供「信息/复制诊断」与探针断言）
  const MEDIA_MAX = 60;
  const CARD_PAUSED = new Map();      // 进放映时被暂停的卡片播放器 -> 进来时它是否本来在播
  const RFC = (typeof HTMLVideoElement !== 'undefined'
    && 'requestVideoFrameCallback' in HTMLVideoElement.prototype);
  function trackRec(vm, oid, sid, m) {
    const key = [vm, oid, sid, m.id, m.target].join('|');
    let rec = MEDIA.get(key);
    if (!rec) {
      rec = { key: key, vm: vm, oid: oid, sid: sid, id: m.id, target: m.target, kind: m.kind,
        trigger: m.trigger || 'auto', req: '', at: Date.now(), page: 0, step: 0,
        plays: 0, frames: 0, diff: 0, api: RFC ? 'rVFC' : 'canvas', frameErr: '',
        videoW: 0, videoH: 0, dur: 0, t: 0, ready: 0, net: 0, err: 0, code: 0,
        seeked: 0, ended: false, blocked: 0, src: '' };
      MEDIA.set(key, rec);
      if (MEDIA.size > MEDIA_MAX) { const k = MEDIA.keys().next(); if (!k.done) MEDIA.delete(k.value); }
    }
    return rec;
  }
  /**
   * 真实帧探针。requestVideoFrameCallback 每「有一帧真的呈现给屏幕」回调一次（Chromium 83+）；
   * 缺这个 API 或它不回调时退回 64×36 的画面差分。两个指标并行记，
   * 因为「时间轴在走但一帧没出」正是任务书点名的那种假成功（videoWidth=0 / 帧数 0）。
   */
  function frameWatch(el, rec) {
    let live = true;
    const stopCv = () => { live = false; };
    rec.watch = 1;
    if (RFC && typeof el.requestVideoFrameCallback === 'function') {
      const step = () => {
        if (!live || !el.isConnected) return;
        rec.frames++;
        if (el.videoWidth) { rec.videoW = el.videoWidth; rec.videoH = el.videoHeight; }
        try { el.requestVideoFrameCallback(step); } catch (e) { /* 元素销毁 */ }
      };
      try { el.requestVideoFrameCallback(step); } catch (e) { /* 回退差分 */ }
    }
    let ctx = null, cv = null;
    try {
      cv = document.createElement('canvas'); cv.width = 64; cv.height = 36;
      ctx = cv.getContext('2d', { willReadFrequently: true });
    } catch (e) { ctx = null; }
    let prev = null, n = 0;
    const timer = setInterval(() => {
      if (!live || !el.isConnected || !ctx) { clearInterval(timer); return; }
      try {
        ctx.drawImage(el, 0, 0, cv.width, cv.height);
        const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
        if (el.videoWidth) { rec.videoW = el.videoWidth; rec.videoH = el.videoHeight; }
        if (!prev) prev = px.slice(0);
        else {
          let d = 0;
          for (let i = 0; i < px.length; i += 4) {
            if (Math.abs(px[i] - prev[i]) + Math.abs(px[i + 1] - prev[i + 1]) + Math.abs(px[i + 2] - prev[i + 2]) > 18) d++;
          }
          if (d > 6) n++;
          prev.set(px);
        }
        rec.diff = n;
      } catch (e) { rec.frameErr = String((e && e.name) || e); clearInterval(timer); }
    }, 400);
    return () => { stopCv(); clearInterval(timer); rec.watch = 0; };
  }
  const cardPlayers = () => Array.from(document.querySelectorAll('.pptx-stage video, .pptx-stage audio'));
  /** 进放映：先停住卡片里的播放器（否则两路声音一起响），只记不改。 */
  function handOffToShow() {
    CARD_PAUSED.clear();
    for (const el of cardPlayers()) {
      const was = !el.paused;
      CARD_PAUSED.set(el, was);
      if (was) { try { el.pause(); } catch (e) { /* 已销毁 */ } }
    }
  }
  /** 退出放映：只恢复「进来时本来在播」的那些 —— 任务书明确不许无条件自动播放。 */
  function returnFromShow() {
    for (const [el, was] of CARD_PAUSED) {
      if (!was || !el.isConnected) continue;
      try { const r = el.play(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 已销毁 */ }
    }
    CARD_PAUSED.clear();
  }
  /**
   * §二 V2：判定「时间轴在走、但一帧画面都没有」。
   * 任务书点名的那种假成功：playing 事件照发、currentTime 照涨、videoWidth 恒 0。
   * 只在真的播过一小段之后才判（0.4s），否则刚挂上 src 的那一两帧会被误判成坏。
   */
  function badMedia(el, rec) {
    if (!el || el.tagName !== 'VIDEO') return false;
    if (rec && rec.err) return true;
    if (el.videoWidth > 0) return false;
    if ((el.currentTime || 0) <= 0.4) return false;
    const frames = rec ? (rec.frames || 0) : 0, diff = rec ? (rec.diff || 0) : 0;
    return frames === 0 && diff === 0;
  }
  /** 兼容转换通道探测（结果缓存；没有 ffmpeg 时明确报 no-ffmpeg，不给一个转不动的按钮）。 */
  const TC = { probe: null, job: null };
  function tcProbe() {
    if (TC.probe) return Promise.resolve(TC.probe);
    const g = window.gewu;
    if (!g || typeof g.pptTranscodeProbe !== 'function') {
      TC.probe = { ok: false, why: 'no-bridge', detail: '此设备没有本机转换通道' };
      return Promise.resolve(TC.probe);
    }
    return Promise.resolve(g.pptTranscodeProbe()).then((r) => {
      TC.probe = r && typeof r === 'object' ? r : { ok: false, why: 'error', detail: '转换通道没有应答' };
      return TC.probe;
    }, (e) => {
      TC.probe = { ok: false, why: 'error', detail: String((e && e.message) || e) };
      return TC.probe;
    });
  }
  /**
   * §二 V2：坏轨的出路浮层。三条路按「老师手上有什么」给，不摆不能点的按钮：
   * ① 转成 H.264（本机有 ffmpeg 才给，进度实时、可取消）；
   * ② 原版放映（交给 WPS/Office 自己的引擎，HEVC 那边通常自带解码器）；
   * ③ 关掉提示（只是不想看这块覆盖层，不动视频本身）。
   */
  function showCompat(slot, el, rec, m) {
    if (slot.__compat) return;
    const box = h('div', { class: 'gw-ppt-compat' });
    const line = h('div', { class: 'gw-ppt-compat-s' }, '正在检查本机有没有可用的转换器…');
    const acts = h('div', { class: 'gw-ppt-compat-a' });
    const btnTc = h('button', { class: 'gw-btn', disabled: true }, '转成 H.264 再看');
    const btnSh = h('button', { class: 'gw-btn', title: '交给 WPS/Office 自己的放映窗口（它能解更多编码）' }, '用原版放映打开');
    const btnX = h('button', { class: 'gw-btn', title: '只关掉这块提示' }, '知道了');
    btnX.onclick = () => { if (slot.__compat) { slot.__compat.remove(); slot.__compat = null; } };
    btnSh.onclick = () => { openOriginal(); };
    acts.append(btnTc, btnSh, btnX);
    box.append(
      h('div', { class: 'gw-ppt-compat-t' }, '这段视频只出声音、没有画面'),
      // 文案只说「测出来的是这样」，不猜原因：同一条 HEVC 素材在软件渲染下解不出画面、
      // 在有硬件解码的机器上却能正常出帧（本机实测两种结果都出现过），所以不能写成「引擎不支持 HEVC」。
      h('div', { class: 'gw-ppt-compat-w' },
        '这段视频的时间轴在走、声音也有，但一帧画面都没出来。常见原因是本机的视频解码器解不了它的编码'
        + '（HEVC、MPEG-4 等），或者当前是软件渲染、硬件解码没生效。可以转一份 H.264 兼容副本再放，'
        + '课件本身不会被改动；也可以先用原版放映，交给 WPS/Office 自己的引擎。'),
      acts, line);
    slot.append(box);
    slot.__compat = box;
    const off = () => { if (slot.__tcOff) { slot.__tcOff(); slot.__tcOff = null; } };
    tcProbe().then((p) => {
      if (!slot.__live || !slot.__compat) { off(); return; }
      if (p && p.ok) {
        btnTc.disabled = false;
        line.textContent = '本机有转换器（ffmpeg ' + (p.version || '可用') + '），转一份兼容副本再放。';
        btnTc.onclick = () => tcRun(slot, el, rec, btnTc, line);
      } else {
        line.textContent = (p && (p.detail || p.why)) || '本机没有找到可用的转换器，可以先用原版放映。';
      }
    });
    diag('兼容提示 页媒体=' + (m && m.target) + ' 尺寸=0 真帧=' + (rec ? rec.frames + '/' + rec.diff : '0'));
  }
  /**
   * §二 V2：拿到「可交给 ffmpeg 的真实文件路径」。
   * 文件后备的课件本来就有路径；内联副本（≤64 MB 的 .pptx、页面里造的字节）没有 ——
   * 那就把已经解出来的媒体字节交给主进程，落成 <userData>/ppt-media 下的真文件再转。
   * 只在老师点了「转成」时才走这一步：正常播放绝不写盘。
   */
  async function mediaSrcFor(el) {
    if (el.__mediaPath) return { ok: true, path: el.__mediaPath };
    const g = window.gewu;
    if (!g || typeof g.pptMediaStage !== 'function') return { ok: false, why: 'no-bridge', detail: '此设备没有本机文件通道，无法转换 —— 可以用原版放映' };
    if (typeof el.__mediaPack !== 'function') return { ok: false, why: 'no-bytes', detail: '这份课件没有可读的媒体字节，无法转换 —— 可以用原版放映' };
    let r;
    try { r = await el.__mediaPack(); } catch (e) { return { ok: false, why: 'read', detail: String((e && e.message) || e) }; }
    if (!r || !r.ok) return { ok: false, why: (r && r.why) || 'missing', detail: (r && r.detail) || '媒体读不出来' };
    if (!r.blob || !r.data) return { ok: false, why: 'no-bytes', detail: '这个媒体条目没有字节可落盘' };
    const name = String(el.getAttribute('data-media-target') || 'media.mp4').split('/').pop();
    let st;
    try { st = await g.pptMediaStage(name, r.data); } catch (e) { return { ok: false, why: 'stage', detail: String((e && e.message) || e) }; }
    if (!st || !st.ok) return { ok: false, why: (st && st.why) || 'stage', detail: (st && (st.detail || st.why)) || '媒体落盘失败' };
    el.__mediaPath = st.path;
    return { ok: true, path: st.path };
  }
  /** 真去转：进度写回浮层，成功就把 src 换成兼容副本（沿用同一个媒体槽位与引用计数）。 */
  function tcRun(slot, el, rec, btn, line) {
    const g = window.gewu;
    const reqId = 'tc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    btn.disabled = true;
    line.textContent = '开始转换…';
    const cancel = h('button', { class: 'gw-btn' }, '取消转换');
    cancel.onclick = () => { try { g.pptTranscodeCancel(reqId); } catch (e) { /* 已结束 */ } line.textContent = '正在取消…'; };
    if (slot.__tcBtn) slot.__tcBtn.remove();
    slot.__tcBtn = cancel;
    if (slot.__compat) slot.__compat.append(cancel);
    if (slot.__tcOff) { slot.__tcOff(); slot.__tcOff = null; }
    if (g && typeof g.pptTranscodeOn === 'function') {
      slot.__tcOff = g.pptTranscodeOn(reqId, (msg) => {
        if (!msg) return;
        if (msg.phase === 'progress') { line.textContent = '转换中 ' + (msg.pct || 0) + '%'; return; }
        if (msg.phase === 'done') { applyDone(msg.path, msg.cached); return; }
        if (msg.phase === 'fail' || msg.phase === 'cancel') {
          if (slot.__tcOff) { slot.__tcOff(); slot.__tcOff = null; }
          if (slot.__tcBtn) { slot.__tcBtn.remove(); slot.__tcBtn = null; }
          btn.disabled = false;
          line.textContent = (msg.phase === 'cancel' ? '已取消转换。' : '转换失败：') + (msg.detail || msg.why || '未知原因');
        }
      });
    }
    // 用过一次的兼容副本会命中缓存，这时主进程直接把 path 回来（不会再发一轮事件）。
    const applyDone = (path, cached) => {
      if (slot.__tcOff) { slot.__tcOff(); slot.__tcOff = null; }
      if (slot.__tcBtn) { slot.__tcBtn.remove(); slot.__tcBtn = null; }
      if (!slot.__live || !el.isConnected || !path) return;
      if (rec) { rec.frames = 0; rec.diff = 0; rec.err = 0; rec.code = 0; rec.videoW = 0; rec.videoH = 0; rec.t = 0; rec.src = 'compat'; }
      line.textContent = '已生成兼容副本' + (cached ? '（用了上次转好的）' : '') + '，正在切换…';
      el.src = GW.fileURL(path);
      try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 自动播放被拒 */ }
      setTimeout(() => {
        if (badMedia(el, rec)) { line.textContent = '兼容副本仍然没有画面，请用原版放映。'; }
        else if (slot.__compat) { slot.__compat.remove(); slot.__compat = null; }
      }, 2200);
    };
    const fail = (r) => {
      if (slot.__tcOff) { slot.__tcOff(); slot.__tcOff = null; }
      if (slot.__tcBtn) { slot.__tcBtn.remove(); slot.__tcBtn = null; }
      btn.disabled = false;
      line.textContent = '转换失败：' + ((r && (r.detail || r.why)) || '没有回执');
    };
    // 先把「可交给 ffmpeg 的真文件」准备好（内联副本在这一步落盘），再开转。
    mediaSrcFor(el).then((s) => {
      if (!slot.__live || !el.isConnected) return;
      if (!s || !s.ok) { fail(s); return; }
      return Promise.resolve(g.pptTranscodeStart({ id: reqId, src: s.path })).then((r) => {
        if (r && r.ok && r.path) { applyDone(r.path, r.cached); return; }
        if (r && r.ok) return;
        fail(r);
      });
    }).catch((e) => { fail({ detail: String((e && e.message) || e) }); });
  }
  /** 播放器挂上 src 之后延迟复查一次：真坏轨才弹浮层，不打扰正常播放。 */
  function armCompat(slot, el, rec, m) {
    if (slot.__compatTimer) clearTimeout(slot.__compatTimer);
    slot.__compatTimer = setTimeout(() => {
      slot.__compatTimer = 0;
      if (!slot.__live || !el.isConnected) return;
      if (badMedia(el, rec)) showCompat(slot, el, rec, m);
    }, 1800);
  }
  function mediaPane(model, host, rectFn, opts) {
    const ctx = Object.assign({ vm: 'card', oid: 0, sid: 0 }, opts || {});
    const layer = h('div', { class: 'gw-ppt-media',
      style: { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden', zIndex: '2' } });
    host.append(layer);
    let page = -1;
    const els = new Map();
    const posters = new Map();
    function stop(slot) {
      // PPT-05b：先摘掉「还活着」的牌子。sync 里每个 await 之后都要复查它 ——
      // 否则切页/连点两次时，上一轮异步回来的 poster/mediaURL 会把已经拆掉的槽位再写一次。
      slot.__live = false;
      const v = slot.querySelector('video,audio');
      if (v) {
        try { v.pause(); } catch (e) { /* 已销毁 */ }
        v.removeAttribute('src');
        try { v.load(); } catch (e) { /* 同 */ }
        // 这里**不能**直接 URL.revokeObjectURL：那个地址是 mediaCache 里的共享地址，
        // 同一份 mp4 还被别的页/别的播放器拿着时撤销，后者就拿到一个死链
        // （表现为「视频黑着、控件能点但画面不动」）。改为归还引用，最后一个用户走时才撤销。
        if (v.__mediaTarget) { model.releaseMedia(v.__mediaTarget); v.__mediaTarget = ''; }
      }
      if (slot.__unwatch) { slot.__unwatch(); slot.__unwatch = null; }
      // §二 V2：兼容提示与转换订阅都属于这个槽位，槽位一拆就必须一起走 ——
      // 否则转换完成时会往一个已经不存在的播放器上写 src（跨页脏写），监听也永远摘不掉。
      if (slot.__compatTimer) { clearTimeout(slot.__compatTimer); slot.__compatTimer = 0; }
      if (slot.__tcOff) { slot.__tcOff(); slot.__tcOff = null; }
      if (slot.__tcBtn) { slot.__tcBtn.remove(); slot.__tcBtn = null; }
      if (slot.__compat) { slot.__compat.remove(); slot.__compat = null; }
      if (slot.parentNode) slot.parentNode.removeChild(slot);
    }
    function clear() { for (const slot of els.values()) stop(slot); els.clear(); page = -1; }
    // 页面在容器里的 contain 矩形：画布与放映都按同一口径缩放居中，所以媒体框直接由它换算
    function pageRect() {
      // 放映那边用的是「设备像素 fit + 居中」，这里必须按同一口径换算成 CSS 像素，
      // 否则媒体框会跟画布里的封面差半个黑边（全屏时尤其明显）。
      if (rectFn) return rectFn();
      const r = host.getBoundingClientRect();
      const k = Math.min(r.width / model.w, r.height / model.ht) || 0;
      return { k, ox: (r.width - model.w * k) / 2, oy: (r.height - model.ht * k) / 2 };
    }
    function layout() {
      const pr = pageRect();
      for (const slot of els.values()) {
        const b = slot.__box || { x: 0, y: 0, w: 0, ht: 0 };
        slot.style.left = Math.round(pr.ox + b.x * pr.k) + 'px';
        slot.style.top = Math.round(pr.oy + b.y * pr.k) + 'px';
        slot.style.width = Math.max(1, Math.round(b.w * pr.k)) + 'px';
        slot.style.height = Math.max(1, Math.round(b.ht * pr.k)) + 'px';
      }
    }
    async function posterOf(cover) {
      if (!cover || !model.picture) return '';
      if (!posters.has(cover)) posters.set(cover, (async () => {
        const im = await model.picture(cover).catch(() => null);
        if (!im) return '';
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        c.getContext('2d').drawImage(im, 0, 0);
        try { return c.toDataURL('image/jpeg', 0.82); } catch (e) { return ''; }
      })());
      return posters.get(cover);
    }
    async function sync(nextPage, step) {
      // §二 V2：放映期间卡片的媒体层必须彻底闭嘴 —— 两套播放器同时活着就会两路出声。
      // （handOffToShow 只负责停已有的；这里挡的是放映中被 refresh 重新同步出来的新播放器。）
      if (ctx.vm === 'card' && ST.on) return;
      const slide = model.slides[nextPage];
      if (!slide) { clear(); return; }
      if (nextPage !== page) { clear(); page = nextPage; }
      const steps = slide.steps || [], media = slide.media || [];
      const want = new Set();
      for (const m of media) {
        // 这个媒体动作在第几步：媒体是「一次点击」的，所以到达该步才出现播放器
        let at = 0;
        for (let i = 0; i < steps.length; i++) {
          if (steps[i].some((e) => e.kind === 'media' && e.id === m.id)) at = i + 1;
        }
        if (step < at) continue;
        const key = m.id + '|' + m.target;
        want.add(key);
        if (els.has(key)) continue;
        const slot = h('div', { class: 'gw-ppt-media-slot',
          style: { position: 'absolute', pointerEvents: 'auto', background: '#000', display: 'block' } });
        // §二 V2：这个槽位属于哪次放映/哪一页哪一步 —— 异步回调回来时靠它判「是不是还有效」。
        slot.__rec = trackRec(ctx.vm, ctx.oid || (model && model.oid) || 0, ctx.sid, m);
        const el = h(m.kind === 'audio' ? 'audio' : 'video', { controls: true, preload: 'metadata', playsinline: true,
          'data-media-target': m.target, 'data-media-id': m.id, 'data-media-trigger': m.trigger || 'auto',
          style: m.kind === 'audio' ? { width: '100%', height: '100%' } : { width: '100%', height: '100%', display: 'block', background: '#000' } });
        slot.__box = (slide.list.find((v) => v && v.media && v.media.id === m.id) || {}).box || { x: 0, y: 0, w: 0, ht: 0 };
        // 代次令牌的初值必须是「活着」：stop() 会把它置 false，下面每个 await 之后靠它判废。
        // （漏了这一行 = 每次都在第一个 await 之后就 continue，播放器永远建不出 src —— 视频全黑。）
        slot.__live = true;
        slot.append(el);
        layer.append(slot);
        els.set(key, slot);
        layout();
        // PPT-05b：代次令牌就是 slot 自己（slot.__live）。改前这里是个 `mine < 0` 的恒假判断，
        // 等于完全没有代次校验：切页后旧的一次 await 回来仍会继续往下写 src。
        const poster = await posterOf(m.cover);
        if (els.get(key) !== slot || !slot.__live) continue;
        if (poster) el.poster = poster;
        const info = await model.acquireMedia(m.target);
        if (els.get(key) !== slot || !slot.__live) { if (info && info.ok) model.releaseMedia(m.target); continue; }
        if (!info || !info.ok) {
          model.releaseMedia(m.target);
          slot.append(h('div', { style: { position: 'absolute', left: '0', top: '0', right: '0', bottom: '0', color: '#fff',
            background: 'rgba(12,18,26,.86)', font: '13px sans-serif', padding: '10px', pointerEvents: 'none' } },
          '视频无法播放：' + ((info && (info.detail || info.why)) || '未知原因')));
          continue;
        }
        el.__objUrl = info.blob ? info.url : '';
        el.__mediaTarget = m.target;
        // §二 V2：兼容转换要的是**本机真实文件路径**（内联副本没有路径，转不了，只能走原版放映）。
        el.__mediaPath = info.path || '';
        // 内联副本（无路径）在真要转兼容副本时按需重新解一次字节，交给主进程落成真文件。
        // 平时不碰：正常播放始终走 blob，不写盘。
        if (!el.__mediaPath && typeof model.packMedia === 'function') el.__mediaPack = () => model.packMedia(m.target);
        el.src = info.url;
        // PPT-05b：真实播放事件记账（P1-D 的「视频播放」一项），并写进日志 ——
        // 日志字段与探针断言的同一个：页/对象/内部路径/关系类型/readyState/networkState/currentTime/error。
        // §二 V2：plays 只是「时间轴开走了」，不代表有画面。真帧数由 frameWatch 记（rec.frames / rec.diff），
        // 失败诊断里要能同时看到 videoWidth=0 与 frames=0 —— 任务书禁止把 playing 当成功。
        const rec = slot.__rec;
        rec.req = (el.__req || 'sync') + ':' + ctx.vm;
        el.__rec = rec;
        el.addEventListener('playing', () => {
          const dst = statsOf(model);
          dst.plays++;
          if (rec) {
            rec.plays++;
            rec.ready = el.readyState; rec.net = el.networkState;
            rec.videoW = el.videoWidth || 0; rec.videoH = el.videoHeight || 0;
            rec.dur = isFinite(el.duration) ? el.duration : 0;
          }
          note('媒体播放 页=' + (nextPage + 1) + ' 对象=' + m.id + ' 路径=' + m.target
            + ' 触发=' + (m.trigger || 'auto') + ' 视图=' + ctx.vm + (ctx.sid ? ('s' + ctx.sid) : '')
            + ' 就绪=' + el.readyState + '/' + el.networkState
            + ' 尺寸=' + (el.videoWidth || 0) + 'x' + (el.videoHeight || 0)
            + ' 时长=' + (isFinite(el.duration) ? el.duration.toFixed(2) : '?'));
        }, { once: true });
        // 真帧探针要在 src 落地前挂上（首帧就可能在没有 playing 事件的情况下出来）。
        if (rec && !slot.__unwatch) slot.__unwatch = frameWatch(el, rec);
        const noteSeek = () => { if (rec) { rec.seeked++; rec.t = el.currentTime || 0; } };
        el.addEventListener('seeked', noteSeek);
        el.addEventListener('timeupdate', () => { if (rec) { rec.t = el.currentTime || 0; rec.ended = !!el.ended; } });
        el.addEventListener('ended', () => { if (rec) { rec.ended = true; rec.t = el.currentTime || 0; } });
        el.addEventListener('error', () => {
          const code = (el.error && el.error.code) || 0;
          if (rec) { rec.err = 1; rec.code = code; rec.videoW = el.videoWidth || 0; }
          diag('媒体播放失败 ' + m.target + ' 页=' + (nextPage + 1) + ' 码=' + code
            + ' 视图=' + ctx.vm + ' 尺寸=' + (el.videoWidth || 0) + 'x' + (el.videoHeight || 0)
            + ' 真帧=' + (rec ? rec.frames + '/' + rec.diff : '0'));
        }, { once: true });
        if (m.trigger === 'auto') { try { await el.play(); } catch (e) { if (rec) rec.blocked = 1; diag('媒体自动播放被拒 ' + m.target + '：' + ((e && e.message) || e)); } }
        // §二 V2：延时复查「有声无画」。手点播放的、自动播放的都要查 —— 老师点一下才发现没画面才是真尴尬。
        armCompat(slot, el, rec, m);
      }
      for (const [key, slot] of Array.from(els)) if (!want.has(key)) { stop(slot); els.delete(key); }
      layout();
    }
    return { sync, clear, layout, layer, nodes: () => Array.from(layer.querySelectorAll('video,audio')) };
  }

  function player(o, model, host, presenting) {
    const canvas = h('canvas', { class: 'pptx-canvas', 'aria-label': '幻灯片画面' });
    const status = h('span', { class: 'pptx-status', 'aria-live': 'polite' });
    const prev = h('button', { class: 'gw-btn', title: '上一步', 'aria-label': '上一步' }, '‹');
    const next = h('button', { class: 'gw-btn', title: '下一步', 'aria-label': '下一步' }, '›');
    const reportBtn = h('button', { class: 'gw-btn', onclick: () => report(model) }, '导入说明');
    const actions = h('div', { class: 'pptx-actions' }, prev, status, next, reportBtn);
    // PPT-05：媒体浮层与画布同框（.pptx-stage 内 absolute），stage 需要 position:relative。
    // 内联样式是唯一选择：src/styles/app.css 不在本次允许改动的文件里。
    const stage = h('div', { class: 'pptx-stage', style: { position: 'relative' } }, canvas);
    host.append(stage, actions);
    // §二 V2：卡片也要记账（viewMode='card'）—— 任务书要求两种模式共用同一份记账，
    // 才能对照「同一份素材在卡片能出帧、在放映却不能」这类只在一边发生的问题。
    const pane = mediaPane(model, stage, null, { vm: 'card', oid: o.id });
    let frame = 0, turnId = 0, closed = false, black = false, last = '';
    const draw = async (animate = false) => {
      const current = live(o);
      if (!current || closed) return;
      const { page, step } = position(model, current.data), count = model.slides[page].steps.length;
      // PPT-11：降级说明跟页码/步骤写在一起 —— 老师看到「兼容渲染」才知道是引擎没接上，
      // 而不是以为这份课件就长这样。
      status.textContent = (page + 1) + ' / ' + model.slides.length
        + (count ? ' · 步骤 ' + step + ' / ' + count : '') + degradeNote(current);
      prev.disabled = page === 0 && step === 0;
      next.disabled = page === model.slides.length - 1 && step === count;
      // 媒体与画布同步（幂等）：翻页/翻步时这里就把上一页的 <video> 停掉并释放，
      // 而不是等下一次 render —— 老师切页的瞬间声音必须断。
      pane.sync(page, step).catch((e) => diag('媒体层同步失败 ' + ((e && e.message) || e)));
      const width = presenting ? Math.min(innerWidth * devicePixelRatio, 2800) : Math.max(640, Math.min(2200, current.w * GW.camera.s * devicePixelRatio));
      /* PPT-C：失效判据必须含**实际渲染资源**的版本。
       * 改前 signature 只有 页:步:宽度 —— 后台烘焙完成时 controller.refresh() 会走到这里，
       * 页/步/宽度全都没变，于是被判成「同一帧」直接 return，烘焙图永远贴不上去；
       * 老师看到的就是「等多久都还是那张 canvas 渲染的糊图，除非手动翻页再翻回来」。
       * 现在把路线与烘焙产物标识并进 signature：data.bake 一落地（或缓存失效被删掉）签名就变，
       * 同一页的一次同步也会真的重画。dir 为空 → 'n'，表示这一帧本该走 canvas 渲染。
       */
      const bk = bakeOf(current);
      const routeSig = bk ? 'b' + String(bk.dir) + '#' + (bk.slides || []).map((f) => (Array.isArray(f) ? f.length : 0)).join(',') : 'n';
      const signature = [page, step, Math.round(width / 96), routeSig].join(':');
      if (last === signature && !animate) return;
      last = signature;
      const id = ++turnId;
      const out = document.createElement('canvas'), start = performance.now();
      const duration = clamp(stepDuration(model.slides[page].steps[step - 1]), 80, 60000);
      cancelAnimationFrame(frame);
      // 有烘焙产物就贴图（Office 自己渲染的排版/表格/图表全保真），没有就退回 canvas 绘制。
      const bake = bakeOf(current);
      /**
       * PPT-11：先画进 offscreen，**画成功了才替换画布**。
       * 改前是「先改 canvas.width（这一步就把画面清空了）再 drawImage」，一旦 drawImage
       * 或 render 抛错，老师看到的就是一块纯黑，而原因只写在一个不起眼的状态行里。
       * 现在失败时画布上仍是上一帧，状态行写明原因，并且自动切回 canvas 渲染继续推进。
       */
      async function paint() {
        const phase = animate ? Math.min(1, (performance.now() - start) / duration) : 1;
        let wentBake = false;
        if (bake) {
          const im = await bakeImage(bakeUrl(bake, page, step));
          if (im) {
            const k = Math.min(width / im.width, (width * 9 / 16) / im.height);
            const dw = Math.max(1, Math.round(im.width * k)), dh = Math.max(1, Math.round(im.height * k));
            try {
              out.width = dw; out.height = dh;
              out.getContext('2d').drawImage(im, 0, 0, dw, dh);
              wentBake = true;
            } catch (e) {
              wentBake = false;
              diag('烘焙贴图失败，切回 canvas 渲染：' + (e && e.message));
            }
          } else if (bake) {
            // 图片本身没加载出来（缓存目录被清、文件被删）：同样切回 canvas 渲染。
            diag('烘焙图片缺失 ' + bakeUrl(bake, page, step));
          }
        }
        // PPT-03：判据必须看**本帧实际走的路径**。改前是「有 bake 对象就不推进」，
        // 于是烘焙帧缺失、临时读不到、尺寸为 0 时退回画布渲染的那一帧不会接着画，
        // 带进入动画的页面永远停在第 0%（对象全在画外/全透明，看起来就是黑屏）。
        if (!wentBake) {
          await render(model, page, step, out, width, phase);
          if (bake) diagThrottled('cardfb|' + page + '|' + step, '卡片回退到画布渲染 页=' + (page + 1) + ' 步=' + step + ' 原因=烘焙帧缺失或损坏 路线=native');
        }
        if (closed || id !== turnId) return;
        if (canvas.width !== out.width || canvas.height !== out.height) { canvas.width = out.width; canvas.height = out.height; }
        canvas.getContext('2d').drawImage(out, 0, 0);
        // PPT-01：只有**真的贴出了烘焙图**才把实际路线写成 bake；否则写 native 并带上原因。
        const prevRoute = routeOf(o).actual;
        const nowRoute = wentBake ? 'bake' : 'native';
        if (prevRoute !== nowRoute) {
          setRoute(o, nowRoute, wentBake ? 'shown' : (bake ? '烘焙帧缺失或损坏' : '没有烘焙产物'));
          (nowRoute === 'bake' ? note : diag)('实际路线 ' + (nowRoute === 'bake' ? 'bake（Office 渲染的步骤图）' : 'native（画布渲染）')
            + ' 对象=' + String(o.data.name || '').slice(0, 40) + ' 页=' + (page + 1) + ' 步=' + step + ' 原因=' + routeOf(o).why);
        }
        if (phase < 1) frame = requestAnimationFrame(() => paint().catch(fail));
      }
      await paint();
    };
    const fail = (e) => {
      // 失败不清空画面：last 置空只是允许下一次重画，画布上保留上一帧。
      last = '';
      if (closed) return;
      status.textContent = '渲染失败（保留上一帧）：' + ((e && e.message) || e) + degradeNote(live(o));
      diag('对象卡渲染失败 ' + ((e && e.message) || e));
    };
    function go(direction) {
      const current = live(o);
      if (!current) return;
      let { page, step } = position(model, current.data);
      const previous = page, count = model.slides[page].steps.length;
      if (direction > 0 && step < count) step++;
      else if (direction < 0 && step > 0) step--;
      else if (direction > 0 && page < model.slides.length - 1) { page++; step = 0; }
      else if (direction < 0 && page > 0) { page--; step = model.slides[page].steps.length; }
      else return;
      GW.objects.setData(current, { page, step });
      draw(direction > 0 && page === previous).catch(fail);
    }
    prev.onclick = () => go(-1); next.onclick = () => go(1);
    if (presenting) {
      canvas.onclick = () => go(1);
      actions.append(h('button', { class: 'gw-btn', onclick: async () => {
        try {
          const current = live(o);
          if (!current) return;
          const shot = await snapshot(current, 2);
          await GW.importer.insertDataURL(shot.toDataURL('image/png'), 'PPT 定格', { x: current.x + current.w + 24, y: current.y, w: current.w });
          GW.toast('定格已放到 PPT 右侧');
        } catch (e) { GW.toast('PPT 定格失败：' + e.message); }
      } }, '定格到板书'));
    } else {
      actions.append(h('button', { class: 'gw-btn primary', onclick: () => present(o, model) }, '放映'));
      // PPT-D：连续动画/视频只有原版放映能呈现（烘焙是静态步骤图）。按钮常驻但按可用性禁用，
      // 而不是「只在 CAPS 里写一句 external」——那样老师点不到。
      const showBtn = h('button', {
        class: 'gw-btn',
        title: hasShow()
          ? (o.data.path ? '用本机 WPS/Office 打开原版放映（连续动画、视频都是原生行为）' : '这份课件没有源路径，无法原版放映')
          : '桌面版且本机装有 WPS/Office 才可用',
        onclick: () => showExternal(o),
      }, '原版放映');
      if (!hasShow() || !o.data.path) { showBtn.disabled = true; showBtn.style.opacity = '0.55'; }
      actions.append(showBtn);
    }
    const key = (e) => {
      if (!presenting || !host.isConnected || e.altKey || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '')) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); go(1); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); go(-1); }
      if (e.key.toLowerCase() === 'b') { black = !black; canvas.classList.toggle('black', black); }
    };
    if (presenting) document.addEventListener('keydown', key, true);
    const off = GW.bus.on('history', () => { if (!presenting) draw().catch(fail); });
    draw().catch(fail);
    return { refresh: () => draw().catch(fail), pane: pane, destroy() {
      closed = true; off(); cancelAnimationFrame(frame); document.removeEventListener('keydown', key, true);
      // 关闭 PPT 对象：播放器停止并放掉解码器，媒体浮层整层移除。
      pane.clear();
    } };
  }

  // ── R1：画布内放映 ────────────────────────────────────────────────────────
  // 改前 present() 把放映塞进 GW.dialog：.dlg-wrap 是 position:fixed; inset:0; z-index:200 的
  // 模态层，整块盖住 #stage 与所有画布层（墨迹 3 / 标注 4 / 书写面 5），放映期间**没有任何
  // 可以落笔的表面** —— 所以「全屏播放 PPT 时画布工具用不了」不是笔坏了，是放映压根不在画布里。
  // 现在把放映画到 #stage 里的 #slide-canvas（z-index 2，背景之上、对象层与墨迹层之下）：
  // 画面铺满视口，笔迹照旧落在 #ink-canvas(3) 上面，于是放映期间书写/荧光笔/橡皮/图形/
  // 尺规/仿真全部照常可用，切工具、撤销、翻页也都不受影响。
  const ST = { on: false, o: null, model: null, cv: null, bar: null, chip: null, off: null, frame: 0, turnId: 0,
    black: false, key: null, onResize: null, el: null, tap: null, outPage: null, down: null, pane: null,
    mode: 'operate', ws: null, more: null, thumb: null, lastTool: 'pen', dockHome: null, stageEl: null };

  // ---------- 放映全屏：真全屏 + 所有权 + 失败反馈（任务书 §3.1） ----------
  // 三件事必须分开记，混成一个布尔就必然出错：
  //   FS.want  —— 我们**想要**全屏（进放映时置真、退出放映时置假）；
  //   FS.real  —— 系统**真的**进了全屏（只由主进程推的 win-fs / 浏览器 fullscreenchange 改）；
  //   FS.owner —— 这次全屏是我们申请的（老师自己按 F11 进来的不算，退出放映不许替他关）。
  // 平台判断一律用 GW.isElectron（kit.js:67 就是由 window.gewu.isElectron 推出来的）：
  // 网页端 shim 里 win() 是**空实现**，按「函数在不在」判会把网页误当成桌面版。
  const FS = { want: false, real: false, owner: false, retry: false, timer: 0, unsub: null };
  function fsDesk() {
    const g = window.gewu;
    return !!(GW.isElectron && g && g.isElectron === true && typeof g.win === 'function');
  }
  function fsSync(on) {
    FS.real = !!on;
    document.body.dataset.pptFs = FS.real ? '1' : '0';
    if (FS.real) FS.retry = false;
  }
  function fsFailed(why) {
    if (!FS.want) return;
    FS.retry = true;
    fsSync(false);
    // 不许静默宣称成功：失败要让老师说得出「刚才那次没全屏」，并留一个重试入口（更多菜单）。
    GW.toast('没能切到全屏（' + why + '）· 放映仍会铺满画布，可在「更多 → 重试全屏」再试一次', 4600);
  }
  function fsAsk() {
    // 必须在**用户点击的激活链里同步**发起：先 await 烘焙/媒体，浏览器就会判成非用户手势直接拒绝。
    FS.want = true; FS.owner = true; FS.retry = false;
    clearTimeout(FS.timer);
    try {
      if (fsDesk()) {
        window.gewu.win('fs-own');
        // 主进程 setFullScreen 是异步的：等 enter-full-screen 把 win-fs 推回来，1.5s 没动静算失败。
        FS.timer = setTimeout(() => { if (FS.want && !FS.real) fsFailed('系统没有进入全屏'); }, 1500);
        // 老师进放映前可能**本来就是全屏**（自己按过 F11）：那样 enter-full-screen 不会再触发一次，
        // 只靠事件就会在 1.5s 后误报失败。先问一次真实状态，问到就行。
        Promise.resolve(window.gewu.win('fs-state')).then((st) => {
          if (!FS.want) return;
          if (st && st.full) { clearTimeout(FS.timer); fsSync(true); }
        }).catch(() => { /* 旧版主进程没有 fs-state，退回事件 */ });
        return;
      }
      const el = (document.documentElement || document.body);
      if (el && typeof el.requestFullscreen === 'function') {
        if (document.fullscreenElement) { fsSync(true); return; }
        const p = el.requestFullscreen();
        if (p && p.catch) p.catch((e) => fsFailed((e && e.message) || '浏览器拒绝'));
        FS.timer = setTimeout(() => { if (FS.want && !FS.real) fsFailed('浏览器没有进入全屏'); }, 1500);
      } else {
        fsFailed('这台设备没有全屏接口');
      }
    } catch (e) { fsFailed((e && e.message) || '全屏接口不可用'); }
  }
  function fsRelease() {
    const was = FS.owner || FS.want;
    FS.want = false; FS.owner = false; FS.retry = false;
    clearTimeout(FS.timer);
    if (was) {
      try {
        if (fsDesk()) window.gewu.win('fs-release');
        else if (document.fullscreenElement && document.exitFullscreen) {
          const p = document.exitFullscreen();
          if (p && p.catch) p.catch(() => { /* 已经不在全屏 */ });
        }
      } catch (e) { /* 窗口正在关，忽略 */ }
    }
    fsSync(false);
  }
  // 真源订阅：桌面端由主进程推（enter/leave-full-screen、maximize、resize、换显示器都推），
  // 网页端只有 fullscreenchange。两条都收，只认「现在到底是不是全屏」。
  if (window.gewu && typeof window.gewu.on === 'function') {
    try {
      FS.unsub = window.gewu.on('win-fs', (st) => {
        if (!FS.want) return;
        if (st && st.full) fsSync(true);
        else if (FS.real) fsSync(false);
      });
    } catch (e) { /* 旧版 preload 没有这个通道 */ }
  }
  document.addEventListener('fullscreenchange', () => {
    if (!FS.want && !FS.owner) return;
    fsSync(!!document.fullscreenElement);
  });

  /**
   * PPT-05 演示工作区（任务书 §3）。
   *
   * 改前是「放映画面铺满整个视口 + 一条 fixed 居中的 #slide-bar」：
   *  · #slide-bar 是 left:50%/bottom:18px/z-index:30，而 #dock 是 bottom:var(--bar-bottom)/z-index:40，
   *    两条各自 fixed 的横条在 1280×720、150% 缩放、底部工具栏这些组合下必然互相压；
   *  · app.js 的 fitRow/layoutDock 避障只认 #dock 与两条侧栏，压根不知道 PPT 控制器存在，
   *    所以「算出来的避障」永远是错的。
   * 现在统一成一个容器 #ppt-ws：顶部状态区 + 内容区（contentRect）+ 底部同一个容器里的两行
   * （演示控制行 + 原来的完整画布工具行 #dock 整体搬进来）。画布工具一个都没少，
   * 但屏幕上只有一条底部横条，且内容矩形由我们自己算 —— 显示、视频布局、命中测试、
   * 批注坐标全部用同一个 wsContentRect()，不可能再各自为政。
   */
  function wsContentRect() {
    // 返回 **#stage 内局部坐标**（CSS 像素）：paintSlide 画在 #slide-canvas 上，
    // 而 #slide-canvas 是 #stage 的子节点，用视口坐标会差一个 --vt 的偏移。
    const vp = GW.viewSize();
    const stage = ST.stageEl;
    const st = stage ? stage.getBoundingClientRect() : { top: 0, left: 0 };
    // 任务书 §3.2 沉浸布局：内容区就是**整块视口**。
    // 顶部模式胶囊、右上退出、底部导航/更多都是绝对定位的小浮层，不参与布局，
    // 所以这里不再像改前那样从内容区里扣掉「顶栏 + 底部双行」的高度（改前扣完只剩
    // 视口中间一条，画面被两条深色横条夹着，远看就是「PPT 只有一半屏幕」）。
    // 唯一口径仍是这个函数：画面、视频、批注层、命中测试全部用它，谁都不许自己再算。
    const el = ST.ws && ST.ws.content;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) {
        return {
          x: Math.round(r.left - st.left), y: Math.round(r.top - st.top),
          w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)),
        };
      }
    }
    return { x: 0, y: 0, w: Math.max(1, vp.w), h: Math.max(1, vp.h) };
  }

  /**
   * 统一投影（任务书 §一 V1）：把 PPT 的模型单位（model.w × model.ht）contain 装进 cr。
   *
   * 这是**唯一**的缩放口径：paintSlide 的黑边、mediaPane 的视频框、批注层 inkMatrix、
   * 以及命中测试全部走它，谁都不许自己再算一遍。
   *
   * 返回值单位说清楚（改前就是这里混了单位）：
   *  · scale  无量纲 —— 1 个模型单位 = 几个 CSS 像素（= min(cr.w/model.w, cr.h/model.ht)）；
   *  · pageW / pageH  适配后的幻灯片 CSS 像素尺寸；
   *  · x / y  幻灯片相对 **cr 左上角** 的偏移（CSS 像素），要绝对坐标就自己加 cr.x / cr.y。
   *
   * 历史缺陷：present() 曾经把「设备像素宽度」（Math.min(pw, ph*ratio)，1400 宽的内容区
   * 在 DPR 1.25 下算出 1280 之类的值）直接当 mediaPane 的 k 用，而 mediaPane.layout 是
   * `left = ox + b.x * k`（按 CSS 像素理解 k）⇒ 视频框被放大上千倍并甩到屏幕外，
   * 页面上只剩 layer 的 background 色，看起来就是「满屏纯色」。
   * 注意：paintSlide 喂给 render() 的 fit 需要的是**设备像素宽度**，那是另一个量，
   * 它由同一个投影在设备像素坐标系里算（见 paintSlide），不能拿 scale 顶替。
   */
  function projection(model, cr) {
    const scale = (model && model.w > 0 && model.ht > 0)
      ? Math.min(cr.w / model.w, cr.h / model.ht) : 0;
    const pageW = model.w * scale, pageH = model.ht * scale;
    return { cr, scale, pageW, pageH, x: (cr.w - pageW) / 2, y: (cr.h - pageH) / 2 };
  }

  const stLive = () => { const o = ST.o; return o ? live(o) : null; };

  function paintSlide(animate) {
    const cv = ST.cv, model = ST.model;
    if (!cv || !model || !ST.on) return;
    const cur = stLive();
    if (!cur) return closeSlide();
    // PPT-05：画面只在**内容区**里，不再铺满整块 #stage —— 顶部状态区与底部两行工具条
    // 是工作区自己的地盘，PPT 不许钻到它们底下（改前 fixed 横条压画面就是这么来的）。
    const cr = wsContentRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(cr.w * dpr)), ph = Math.max(1, Math.round(cr.h * dpr));
    // 这里**不**改 cv.width/cv.height：那是可见画布，一改就把上一帧清了。
    // 尺寸与画面一起在 put() 里提交（见那一段注释）。
    cv.style.width = cr.w + 'px'; cv.style.height = cr.h + 'px';
    // 沉浸布局的内容区一般从 (0,0) 起，但四角/安全区一变 x/y 就可能非 0 —— 两个都得写，
    // 改前只写了 top，一旦内容区横向偏移，画面会横着错位（视频和批注层却是对的）。
    cv.style.left = cr.x + 'px';
    cv.style.top = cr.y + 'px';
    const { page, step } = position(model, cur.data);
    const count = model.slides[page].steps.length;
    // PPT-05：翻页/翻步时立刻同步媒体 —— 切页的瞬间就要把上一页的 <video> 停掉并释放，
    // 不能等 render 完成（渲染是异步的，声音会多响半秒）。
    if (ST.pane) ST.pane.sync(page, step).catch((e) => diag('放映媒体层同步失败 ' + ((e && e.message) || e)));
    // 两栏各有一枚页码步数入口 —— 两处必须写同一份文案，否则左右栏看到的进度会不一致。
    const chipText = (page + 1) + ' / ' + model.slides.length
      + (count ? ' · 步骤 ' + step + ' / ' + count : '') + degradeNote(cur);
    if (ST.chips && ST.chips.length) {
      for (const c of ST.chips) if (c) c.textContent = chipText;
    } else if (ST.chip) ST.chip.textContent = chipText;
    // 放映期「自动反差墨色」的纸色 = 这一页 PPT 的背景（需求：图形/文字随 PPT 背景深浅反转）。
    // paintSlide 是翻页/翻步的唯一汇聚点，所以在这里写；背景真变了才重画一次板书上的图形。
    // 按了 B 主动黑屏时，压在墨迹底下的是那块 #0b0f14 —— 纸色也得跟着变深，否则批注笔迹变黑看不见。
    const paperNow = ST.black ? '#0b0f14' : paperOf(model.slides[page]);
    if (GW.setInkPaper && GW.setInkPaper(paperNow)) {
      if (GW.requestRender) GW.requestRender();
    }
    // contain 装进视口、留黑边 —— 与「全屏播放幻灯片」的观感一致。
    // 缩放口径统一由 projection() 给（它算的是 CSS 像素尺度），这里要的是**设备像素宽度**，
    // 所以乘 dpr —— 不能再像改前那样「用设备像素宽除以 dpr 当无量纲比例」（V1 的根）。
    const pj = projection(model, cr);
    const fit = Math.max(1, Math.round(pj.pageW * dpr));
    const id = ++ST.turnId;
    const duration = clamp(stepDuration(model.slides[page].steps[step - 1]), 80, 60000);
    const t0 = performance.now();
    cancelAnimationFrame(ST.frame);
    const bake = bakeOf(cur);
    const loop = () => {
      if (!ST.on || id !== ST.turnId) return;
      const phase = animate ? Math.min(1, (performance.now() - t0) / duration) : 1;
      const out = ST.off || (ST.off = document.createElement('canvas'));
      // 烘焙优先：直接贴 Office 渲染的整页 PNG（不补间 —— PPT 的动画本来就是「一步到位」的观感）
      /**
       * PPT-11：黑屏必须能区分「老师按了 B（主动黑屏）」和「这一帧没画出来」。
       *
       * 改前只有「画好了就贴、出错就改一行状态文字」，而 fillRect('#0b0f14') 在 draw 之前就执行，
       * 所以任何一次失败都会留下一整屏黑的 —— 看起来和按了 B 一模一样。
       * 现在先画进离屏画布，**画成功才提交**；失败保留上一帧并写清原因。
       */
      const put = (draw, viaBake) => {
        if (!ST.on || id !== ST.turnId) return;
        // PPT-01：放映这边同样是「贴出烘焙图才算 bake」，与实际画面保持一致。
        const prevRoute = routeOf(cur).actual, nowRoute = viaBake ? 'bake' : 'native';
        if (prevRoute !== nowRoute) setRoute(cur, nowRoute, viaBake ? 'shown' : (bake ? '烘焙帧缺失或损坏' : '没有烘焙产物'));
        /**
         * PPT-05：可见画布的尺寸提交挪到**这里**。
         * 改前 paintSlide 一进门就给 cv.width 赋值，而给 canvas 的 width/height 赋值本身
         * 就会把画面清空 —— 于是下面那句「失败保留上一帧」是假的：旧帧在进门那一刻就没了，
         * 渲染一慢老师就先看到一整屏黑。现在只有真要贴新帧时才动尺寸。
         */
        if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
        // 黑屏必须同时盖住**视频背景组**：媒体层是独立的一层，只填 PPT 画布的话
        // 视频还亮着，「黑屏」就成了笑话。
        if (ST.pane) ST.pane.layer.style.visibility = ST.black ? 'hidden' : '';
        if (!ST.black) {
          const off = ST.off2 || (ST.off2 = document.createElement('canvas'));
          if (off.width !== pw || off.height !== ph) { off.width = pw; off.height = ph; }
          const octx = off.getContext('2d');
          octx.setTransform(1, 0, 0, 1, 0, 0);
          octx.clearRect(0, 0, pw, ph);
          draw(octx);
          // P1-C：透明批注模式下画布底色必须让位给桌面 —— 只有 PPT 画面本身不透明，
          // 内容区以外的部分留空（#stage 的 background 也已在 app.css 里置 transparent）。
          const transparent = !!GW.overlayMode;
          const ctx = GW.perf.ctx2d(cv, { alpha: transparent });
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          if (transparent) ctx.clearRect(0, 0, pw, ph);
          else { ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, pw, ph); }
          ctx.drawImage(off, 0, 0);
          return;
        }
        // 主动黑屏：这里是**故意的**黑板，不写错误。
        const transparent = !!GW.overlayMode;
        const ctx = GW.perf.ctx2d(cv, { alpha: transparent });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (transparent) { ctx.clearRect(0, 0, pw, ph); return; }
        ctx.fillStyle = '#0b0f14';
        ctx.fillRect(0, 0, pw, ph);
      };
      (bake ? bakeImage(bakeUrl(bake, page, step)) : Promise.resolve(null)).then((im) => {
        if (im) return put((ctx) => drawBaked(ctx, im, pw, ph), true);
        // PPT-03：这一步真正走的是画布渲染（bake 不存在，或 bake 存在但这一帧的 PNG 缺失/坏了）。
        // 改前的推进判据是「有没有 bake 对象」，于是**实际在走画布渲染**的情况下动画也不推进，
        // 停在第 0 帧 —— 带进入动画的页看起来就是一屏全隐藏（黑屏）。判据必须看本帧的真实路径。
        if (bake) diagThrottled('slidefb|' + page + '|' + step, '放映回退到画布渲染 页=' + (page + 1) + ' 步=' + step + ' 原因=烘焙帧缺失或损坏 路线=native');
        return render(model, page, step, out, fit, phase).then(() => {
          put((ctx) => ctx.drawImage(out, Math.round((pw - out.width) / 2), Math.round((ph - out.height) / 2)));
          if (phase < 1) ST.frame = requestAnimationFrame(loop);
        });
      }).catch((e) => {
        // 保留上一帧（put 没执行过），只更新状态文字，并把原因写进日志。
        const failText = '渲染失败（保留上一帧）：' + ((e && e.message) || e);
        if (ST.chips && ST.chips.length) { for (const c of ST.chips) if (c) c.textContent = failText; }
        else if (ST.chip) ST.chip.textContent = failText;
        diag('放映渲染失败 ' + page + '/' + step + ' ' + ((e && e.message) || e));
      });
    };
    loop();
  }

  // ---------- PPT-05 演示工作区：翻步 / 批注 / 工作区骨架 ----------
  // 批注按「课件稳定标识 + 页」保存：同一份课件（同 hash/path）反复进出放映、来回翻页都能拿回来。
  // 用内存表而不是写进 GW.settings —— 批注是临时演算痕迹，不该把 .gewu 撑大，也不该进撤销栈。
  const NOTE = new Map();
  let noteSeq = 0;
  // 批注的撤销/重做（§四「批注：撤销重做」）。NOTE 只是内存表，本来没有任何历史；
  // 这里记「某条键在改动之前的数组快照」，撤销就是把快照放回去 —— 落笔、清本页、清全部
  // 三种改动共用同一套记账，不用给每种操作各写一份反向逻辑。
  const INK_UNDO = [];
  const INK_REDO = [];
  const INK_HISTORY_CAP = 40;
  // §五.5：批注是**内存表**，不写进 .gewu，也不进撤销栈。老师画完退出放映、
  // 再关掉应用，这些笔迹就彻底没了 —— 所以必须记「改过几次」与「导出时的水位」，
  // 退出放映时判断有没有「改了但没导出」的内容，有就明确提示（不能默默丢）。
  let notesStamp = 0;
  let notesExported = 0;
  function notesTouch() { notesStamp++; }
  function inkCheckpoint(key) {
    if (!key) return;
    INK_UNDO.push({ key, before: (NOTE.get(key) || []).slice() });
    if (INK_UNDO.length > INK_HISTORY_CAP) INK_UNDO.shift();
    INK_REDO.length = 0;
  }
  function inkUndo() {
    const e = INK_UNDO.pop();
    if (!e) { GW.toast('没有可撤销的批注'); return; }
    INK_REDO.push({ key: e.key, before: (NOTE.get(e.key) || []).slice() });
    if (e.before.length) NOTE.set(e.key, e.before); else NOTE.delete(e.key);
    notesTouch();
    inkSync();
    GW.toast('已撤销一笔批注');
  }
  function inkRedo() {
    const e = INK_REDO.pop();
    if (!e) { GW.toast('没有可重做的批注'); return; }
    INK_UNDO.push({ key: e.key, before: (NOTE.get(e.key) || []).slice() });
    if (e.before.length) NOTE.set(e.key, e.before); else NOTE.delete(e.key);
    notesTouch();
    inkSync();
    GW.toast('已重做一笔批注');
  }
  function noteKeyOf(o, page) {
    const id = String((o && o.data && (o.data.hash || o.data.path)) || 'o' + ((o && o.id) || 0));
    return id + '|' + page;
  }

  // ---------- PPT-05 批注层 ----------
  // 演示工作区的批注不复用 annot.js 那层（它钉在对象盒子上、按 0..1 归一化存 o.data.ann）。
  // 这里是 #stage 里的独立画布：坐标先换算到 PPT 内容矩形，笔迹按课件+页存进 NOTE，
  // 所以来回翻页 / 退出再进都能拿回来，且**不写进 .gewu、不进撤销栈**。
  function inkMatrix() {
    const model = ST.model;
    const cr = wsContentRect();
    const stage = ST.stageEl;
    const st = stage ? stage.getBoundingClientRect() : { top: 0, left: 0 };
    // 批注层是 body 直属的 fixed 画布（见文件头层序说明：留在 #stage 里会被 #capture 永远压住），
    // 所以这里要把 contentRect 从「#stage 局部坐标」换成视口坐标。
    const vx = cr.x + (st.left || 0), vy = cr.y + (st.top || 0);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // V1 同款缺陷：改前把「设备像素适配宽 / dpr」当无量纲比例，笔迹坐标被放大上千倍。
    // 现在与 paintSlide / mediaPane 共用 projection()：k 是无量纲 scale（CSS 像素 / 模型单位），
    // 页面尺寸单独给 pageW（批注线宽的视觉基准要用它，不能用 scale）。
    const pj = projection(model, cr);
    return { cr, dpr, k: pj.scale, pageW: pj.pageW, pageH: pj.pageH,
      vx, vy, ox: pj.x, oy: pj.y };
  }
  function inkCtx() {
    const cv = ST.inkCv;
    if (!cv) return null;
    const m = inkMatrix();
    const w = Math.max(1, Math.round(m.cr.w * m.dpr)), h = Math.max(1, Math.round(m.cr.h * m.dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    cv.style.left = m.vx + 'px';
    cv.style.top = m.vy + 'px';
    cv.style.width = m.cr.w + 'px';
    cv.style.height = m.cr.h + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
    return { ctx, m };
  }
  function inkStrokes(key) {
    if (!NOTE.has(key)) NOTE.set(key, []);
    return NOTE.get(key);
  }
  // ---------- 批注笔迹的渲染口径（PPT-INK） ----------
  // 目标：放映批注层与普通画布**同一套笔感** —— 同一套几何（board.js 的 curveOutline）、
  // 同一套笔宽律（ink-style 的压感 / 速度 / 入锋 / 斜率钳制，算式逐项对应 input.js:2347-2390）。
  // 唯一的差别是坐标系：批注按「页归一化 0..1」存点，这里先乘成 CSS 像素再交给轮廓生成器，
  // 所以 curveOutline 的 scale 恒传 1、W 传 CSS 像素笔宽 —— 旧版那个 m.pageW / 240 的
  // 「屏幕宽度倍率」正是「同一支笔在 PPT 里和普通画布上不一样粗」的根因，已删除。
  function inkStyleOf(st) {
    const IS = GW.inkStyle;
    if (!IS || (st && st.hl)) return null;
    // 老笔迹没有 pen 字段 ⇒ 按 gel 画（对齐 board.js 的 renderOf 对老笔迹回落 LEGACY_GEL_203）
    return IS.of((st && st.pen) || 'gel');
  }
  function inkTipOf(sty) {
    const IS = GW.inkStyle;
    if (!IS || !sty) return { cap: 'round', tipFlat: 0, alpha: 1 };
    const tc = IS.tipConfig(sty.id, (GW.settings || {}).penTipCfg);
    return { cap: sty.cap || 'round', tipFlat: (+tc.penTipFlat || 0), alpha: sty.alpha || 1 };
  }
  function inkSync() {
    const cv = ST.inkCv;
    if (!cv || !ST.model) return;
    const g = inkCtx();
    if (!g) return;
    const { ctx, m } = g;
    // 每一次整层重画都推进一个「代」：增量落墨只在同一代里继续追加，
    // 换页 / 缩放 / 擦除 / 隐藏批注之后的画布已经被清过，旧笔迹的 _n 不再可信。
    ST.inkGen = (ST.inkGen || 0) + 1;
    cv.__syncN = (cv.__syncN || 0) + 1;         // 供探针核对「到底有没有走增量」
    ctx.clearRect(0, 0, m.cr.w, m.cr.h);
    // §四「显示/隐藏批注」：只是**不画**，批注本身仍在 NOTE 里（再点回来还在）。
    if (ST.notesHidden) return;
    const live = stLive();
    if (!live) return;
    const model = ST.model;
    const page = position(model, live.data).page;
    const mw = model.w * m.k, mh = model.ht * m.k, paths = GW.paths;
    for (const st of inkStrokes(noteKeyOf(live, page))) {
      const pts = st && st.pts;
      if (!pts || !pts.length) continue;
      const n = pts.length;
      st._gen = ST.inkGen; st._n = n;        // 增量落墨的起点（这一笔此刻已经完整落在画布上）
      // 与主画布 board.js 的 drawItem 同一口径：显示层过一次自动反差墨色（荧光笔不换算）。
      // 增量落墨那段已经是 inkFix 过的颜色，这里若用原色，同一笔会在「松手后」变色。
      const raw = st.c || '#e02020';
      const color = (GW.inkFix && !st.hl) ? (GW.inkFix(raw) || raw) : raw;
      const stW = Math.max(0.5, +st.w || 2);
      const sty = inkStyleOf(st);
      const tip = inkTipOf(sty);
      const alpha = st.hl ? 0.38 : (sty ? tip.alpha : 1);
      // 归一化 → CSS 像素（canvas 自己的坐标系，原点在内容区左上角，与 paintSlide 同一份投影）
      const flat = new Array(n * 2);
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        flat[i * 2] = m.ox + p.x * mw;
        flat[i * 2 + 1] = m.oy + p.y * mh;
      }
      // 老笔迹没有 ws（宽度数组）⇒ 走等宽轮廓，不炸也不变形
      const wsa = (st.ws && st.ws.length === n) ? st.ws : null;
      const sig = m.k.toFixed(4) + '|' + m.ox.toFixed(2) + '|' + m.oy.toFixed(2) + '|'
        + cv.width + 'x' + cv.height + '|' + stW.toFixed(2) + '|' + color + '|' + n + '|'
        + tip.cap + '|' + (+tip.tipFlat).toFixed(3) + '|' + alpha.toFixed(2);
      // 每笔缓存轮廓：签名（缩放/偏移/画布尺寸/笔宽/颜色/点数/端帽）没变就直接 fill 复用。
      // 正在画的那一笔（ST.inkCur）每次强制重建 —— 它的点列每秒都在变。
      if (st !== ST.inkCur && st._sig === sig && st._path) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fill(st._path);
        continue;
      }
      let path = null;
      if (n >= 3 && paths && typeof paths.curveOutline === 'function') {
        try { path = paths.curveOutline(flat, wsa, 1, stW, tip.cap, tip.tipFlat); } catch (_) { path = null; }
      }
      if (path) {
        st._path = path; st._sig = sig;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fill(path);
        // 颗粒笔（铅笔 / 粉笔）：轮廓内打孔，口径同 board.js:1086-1103 —— 一次 clip + 一次 fill，
        // 孔洞按笔迹派生种子生成，所以每帧/每次重画的位置都一样（不会闪）。
        const gr = (sty && !st.hl) ? (+sty.grain || 0) : 0;
        if (gr > 0 && paths && typeof paths.grainPath === 'function') {
          let gp = null;
          if (st._gpSig === sig && st._gpPath !== undefined) gp = st._gpPath;
          else {
            const gi = {
              pts: flat,
              id: st._gid || (st._gid = ((st.pen || 'gel') + ':' + pts[0].x.toFixed(4) + ',' + pts[0].y.toFixed(4))),
            };
            try { gp = paths.grainPath(gi, stW, gr); } catch (_) { gp = null; }
            st._gpSig = sig; st._gpPath = gp;
          }
          if (gp) {
            ctx.save();
            ctx.clip(path);
            ctx.globalCompositeOperation = 'destination-out';
            if (ctx.globalCompositeOperation === 'destination-out') {
              ctx.globalAlpha = Math.min(0.85, 0.42 + 0.45 * gr);
              ctx.fill(gp);
            }
            ctx.restore();
          }
        }
        continue;
      }
      // 回退（n < 3、老数据、curveOutline 不可用）：原来的中心线描边，笔宽仍是 CSS px
      st._path = null; st._sig = sig;
      const lwFb = wsa ? (wsa.reduce((a, v) => a + v, 0) / wsa.length) : stW;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(0.5, lwFb);
      if (n === 1) {
        ctx.beginPath();
        ctx.arc(flat[0], flat[1], Math.max(0.5, lwFb / 2), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(flat[0], flat[1]);
      for (let i = 1; i < n; i++) ctx.lineTo(flat[i * 2], flat[i * 2 + 1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // 批注模式下若当前工具不是笔 / 荧光笔 / 橡皮（选择、文字、图形、尺规、激光），批注层必须让开，
  // 让事件落到真正的画布上走原命令 —— 否则「批注模式里尺规不能拖」。
  // 橡皮是**例外**：它必须在批注模式里擦掉批注（局部擦除，见 inkEraseAt），
  // 但只在 annotate 模式吃事件；切到「操作 PPT」后橡皮照旧落到画布上擦板书。
  function inkHit() {
    const cv = ST.inkCv;
    if (!cv) return;
    const toolId = (GW.tool && GW.tool.current) || '';
    const on = ST.mode === 'annotate'
      && (toolId === 'pen' || toolId === 'hl' || toolId === 'eraser');
    cv.style.pointerEvents = on ? 'auto' : 'none';
  }
  function inkAttach(o, model) {
    if (!ST.stageEl) return;
    // 必须挂 body：#stage 自成堆叠上下文，而 #capture 是 body 直属、z-index:5 且
    // body:not([data-tool="hand"]) 时覆盖全屏 —— 画布留在 #stage 里就永远收不到笔。
    const cv = h('canvas', { id: 'ppt-ink' });
    document.body.append(cv);
    ST.inkCv = cv;
    ST.inkCur = null;
    let cur = null, erasing = false;
    // ---------- 笔尖预测线（与画布同一套口径，见 input.js:2402-2452 的实测结论） ----------
    // 预测线必须画在 #pen-pred 这个 DOM 元素上，**不能**画进批注画布：4K 软件渲染下画进
    // 画布 p50 46.2ms（≈22fps）、画在元素上 16.9ms（≈59fps）。#pen-pred 是 #stage 的子节点，
    // 放映期 #stage 仍在；画布与批注不会同时落笔，所以这个单例可以共用。
    const predEl = document.getElementById('pen-pred');
    let predProf = null, predOff = null;
    let lastCx = 0, lastCy = 0, lastCw = 2;
    const hidePred = () => { if (predEl && predEl.style.display !== 'none') predEl.style.display = 'none'; };
    // 圆心在已画出来的墨迹末端，向预测点拉一条同宽短段（口径同 input.js 的 drawPred）。
    const drawPred = (bx, by) => {
      if (!predEl || !ST.stageEl) return;
      const sr = ST.stageEl.getBoundingClientRect();
      const ax = lastCx, ay = lastCy;
      const dx = bx - ax, dy = by - ay, L0 = Math.hypot(dx, dy);
      if (!(L0 > 0.5)) { hidePred(); return; }
      const ux = dx / L0, uy = dy / L0, ov = 2;
      const h = Math.max(1, lastCw);
      predEl.style.display = 'block';
      predEl.style.width = (L0 + ov) + 'px';
      predEl.style.height = h + 'px';
      predEl.style.background = (GW.inkFix && cur) ? GW.inkFix(cur.c) : ((cur && cur.c) || '#e02020');
      predEl.style.transform = 'translate3d(' + (ax - sr.left - ux * ov) + 'px,'
        + (ay - sr.top - uy * ov - h / 2) + 'px,0) rotate(' + Math.atan2(dy, dx) + 'rad)';
    };
    // ---- 与 input.js penDown 同构的采样状态（input.js:2320-2390）----
    const PTau = 18, VTau = 39;                 // 压感平滑 / 速度 EMA 的时间常数（毫秒）
    let travelledPx = 0, vSmooth = 0, pSmooth = 0, pSeen = false, pressSeen = false;
    let mPrev = 0, lastT = 0, lastX = 0, lastY = 0;
    let sty = null, tc = null, W = 2, baseW = 2, entryPx = 3.5, isHl = false;
    let eraseDid = false;
    const tsOf = (e) => {
      const t = e && e.timeStamp;
      return (typeof t === 'number' && isFinite(t) && t > 0) ? t : performance.now();
    };
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const colorOf = () => {
      if (isHl) return ((GW.tool && GW.tool.hl) || {}).color || (GW.settings && GW.settings.hlColor) || '#ffd23f';
      const p = (GW.tool && GW.tool.pen) || {};
      return p.color || (GW.settings && GW.settings.penColor) || '#e02020';
    };
    const widthOf = () => {
      if (isHl) { const hh = (GW.tool && GW.tool.hl) || {}; return Math.max(1, +hh.width || 22); }
      const p = (GW.tool && GW.tool.pen) || {};
      return Math.max(1, +p.width || 2);
    };
    const toolIdOf = () => (GW.tool && GW.tool.current) || '';
    // 笔宽律：算式与 input.js:2347-2390 的 widthAt 逐项一致（压感分支 / 速度分支 / 共用斜率钳制 /
    // 入锋）。批注里 W 本来就是 CSS 像素，所以 entryPx 不再乘 camera.s —— 即 k 恒 1。
    const widthAt = (ev, dPx, dt) => {
      const ms = Math.max(1, dt);
      const IS = GW.inkStyle || null;
      let m;
      const pRaw = ev.pressure;
      if (!pressSeen && ev.pointerType === 'pen' && pRaw > 0 && pRaw !== 0.5) pressSeen = true;
      const pGain = GW.clamp((+((GW.settings || {}).penPress)) || 1, 0.4, 3);
      if (pressSeen && pRaw > 0) {
        if (!pSeen) { pSmooth = pRaw; pSeen = true; }
        else pSmooth += (pRaw - pSmooth) * (1 - Math.exp(-ms / PTau));
        const pEff = GW.clamp(0.5 + (pSmooth - 0.5) * pGain * (sty ? (sty.pressK || 1) : 1), 0.02, 1);
        m = (sty && IS) ? IS.pressureCurve(sty, pEff, tc) : (0.26 + pEff * 1.5);
      } else {
        const v = Math.min(6, dPx / ms);
        vSmooth += (v - vSmooth) * (1 - Math.exp(-ms / VTau));
        m = (sty && IS) ? IS.speedW(sty, vSmooth, pGain)
          : GW.clamp(1.25 - vSmooth * 0.30 * (0.55 + 0.45 * pGain), 0.55, 1.25);
      }
      const sl = sty ? sty.slope : 0.18;
      if (mPrev > 0) m = GW.clamp(m, mPrev * (1 - sl), mPrev * (1 + sl));
      mPrev = m;
      const g = (sty && IS) ? IS.entryK(sty, travelledPx, entryPx)
        : (travelledPx >= entryPx ? 1 : 0.34 + 0.66 * (travelledPx / entryPx));
      return W * m * g;
    };
    const posOf = (e, mm, rect) => {
      const mw = model.w * mm.k, mh = model.ht * mm.k;
      const x = mw > 0 ? (e.clientX - rect.left - mm.ox) / mw : 0;
      const y = mh > 0 ? (e.clientY - rect.top - mm.oy) / mh : 0;
      return { x: clamp01(x), y: clamp01(y) };
    };
    // 局部擦除：只作用批注层，不进主画布撤销栈，擦完 markDirty。
    // 半径按 CSS 像素给（GW.tool.eraser.size / 2），点列先换算到 canvas 的 CSS 坐标再交给内核。
    const inkEraseAt = (e, live0, key0) => {
      const lv = live0 || stLive();
      if (!lv) return false;
      const K = GW.inkKernel;
      if (!K || typeof K.partialErase !== 'function') return false;
      const mm = inkMatrix(), rect = cv.getBoundingClientRect();
      const mw = model.w * mm.k, mh = model.ht * mm.k;
      if (!(mw > 0 && mh > 0)) return false;
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const radius = Math.max(2, (+((GW.tool && GW.tool.eraser) || {}).size || 36) / 2);
      const key = key0 || noteKeyOf(lv, position(model, lv.data).page);
      const list = NOTE.get(key);
      if (!list || !list.length) return false;
      const out = [];
      let changed = false;
      for (const st of list) {
        const pts = st && st.pts;
        if (!pts || !pts.length) { out.push(st); continue; }
        const p2 = new Array(pts.length);
        for (let i = 0; i < pts.length; i++) p2[i] = [mm.ox + pts[i].x * mw, mm.oy + pts[i].y * mh];
        const segs = K.partialErase(p2, [cx, cy], radius);
        const whole = segs.length === 1 && segs[0][0] === 0 && segs[0][1] === pts.length - 1;
        if (whole) { out.push(st); continue; }        // 没碰到：原对象保留（轮廓缓存一起留着）
        changed = true;
        for (const sg of segs) {
          if (sg[1] < sg[0]) continue;
          const sub = { c: st.c, w: st.w, pts: pts.slice(sg[0], sg[1] + 1) };
          if (st.hl) sub.hl = true;
          if (st.pen) sub.pen = st.pen;
          if (st.ws && st.ws.length === pts.length) sub.ws = st.ws.slice(sg[0], sg[1] + 1);
          if (sub.pts.length) out.push(sub);
        }
      }
      if (!changed) return false;
      if (!eraseDid) { inkCheckpoint(key); eraseDid = true; }
      NOTE.set(key, out);
      notesTouch();
      if (GW.markDirty) GW.markDirty();
      inkSync();
      return true;
    };
    // ---------- 收笔整形（与 input.js:2576-2641 同构） ----------
    // 画布上抬手后会把点列与宽度各过一次 1-2-1 核，再做顿笔兜底 / 出锋收尖；
    // 批注层原来抬手就直接结束，于是同一条线在画布上有锋、在 PPT 上是根等宽的香肠。
    // 批注坐标本来就是 CSS 像素（k 恒 1）⇒ input.js 里乘 GW.camera.s 的地方这里一律不乘。
    const shapeEnd = (st) => {
      if (!st || !st.pts || !st.pts.length) return;
      const IS = GW.inkStyle || null;
      const ws = st.ws;
      const smooth1 = (arr) => {
        if (arr.length < 5) return arr;
        const out = arr.slice();
        for (let i = 1; i < arr.length - 1; i++) {
          out[i] = { x: (arr[i - 1].x + 2 * arr[i].x + arr[i + 1].x) / 4, y: (arr[i - 1].y + 2 * arr[i].y + arr[i + 1].y) / 4 };
        }
        return out;
      };
      if (ws && ws.length === st.pts.length && st.pts.length > 12) {
        st.pts = smooth1(st.pts);
        if (ws.length > 3) {
          // 稳定度：0 ⇒ 一次 (a+2b+c)/4，与 2.0.3 逐位等价；调高则多遍 + 加大中心权重。
          const sw = IS ? IS.stabWeights(tc ? tc.penStabilize : 0) : { passes: 1, center: 2 };
          for (let pass = 0; pass < sw.passes; pass++) {
            const w2 = ws.slice();
            for (let i = 1; i < ws.length - 1; i++) w2[i] = (ws[i - 1] + sw.center * ws[i] + ws[i + 1]) / (sw.center + 2);
            for (let i = 0; i < w2.length; i++) ws[i] = w2[i];
          }
        }
      } else if (!ws && st.pts.length > 6) {
        st.pts = smooth1(st.pts);           // 荧光笔：等宽，但点列一样要平滑
      }
      if (!ws || ws.length !== st.pts.length) return;
      const mm = inkMatrix();
      const mw = model.w * mm.k, mh = model.ht * mm.k;
      const exitK = (sty && sty.exitLen === 0) ? 0
        : Math.max(10, W * (sty ? sty.exitLen : 3.2) * GW.clamp((+((GW.settings || {}).penExit)) || 1, 0.3, 2));
      if (travelledPx < 3) {
        // 一个顿笔 / 点：不该是个尖，给回满宽（上限仍是笔宽的 2 倍，按屏幕像素算）
        const capW = (baseW || 3) * (GW.__tapCapK || 2);
        const dotW = Math.min(W, capW);
        for (let i = 0; i < ws.length; i++) ws[i] = dotW;
        return;
      }
      const autoTip = !!(sty && sty.id !== 'gel' && (GW.settings || {}).penTipAuto !== false);
      const cfgPen = ((GW.settings || {}).penTipCfg || {})[sty ? sty.id : 'gel'];
      const tip = (cfgPen && cfgPen.penTip) ? cfgPen.penTip
        : (autoTip ? sty.tip : ((GW.settings && GW.settings.penTip) || 'sharp'));
      const floor = tc ? tc.tipFloor : 0.12;
      const bW = autoTip ? (sty ? sty.exitW : 0.12)
        : (tip === 'round' ? 0.58 : tip === 'flat' ? 0.86 : 0.12);
      const sharp = cfgPen ? (+cfgPen.penTipSharp || 0) : 0;
      const tipW = Math.max(floor, Math.min(1, bW - sharp * (bW - floor)));
      let acc = 0;
      for (let i = ws.length - 1; i > 0; i--) {
        const k = exitK > 0 ? Math.min(1, acc / exitK) : 1;
        let t = tip === 'sharp' ? Math.pow(k, 0.72) : k;
        if (tip === 'back') t = 0.25 + 0.75 * Math.pow(k, 0.72);
        else if (tip === 'flatEnd') t = Math.min(1, 0.15 + 1.35 * k);
        const target = W * (tipW + (1 - tipW) * t);
        ws[i] = cfgPen ? Math.min(ws[i], Math.max(target, ws[i] * (1 - 0.5 * (1 - t))))
          : Math.min(ws[i], target);
        acc += Math.hypot((st.pts[i].x - st.pts[i - 1].x) * mw, (st.pts[i].y - st.pts[i - 1].y) * mh);
        if (acc > exitK) break;
      }
    };
    // ---------- 增量落墨（与 board.js:2139-2171 的 trailSeg 同构） ----------
    // 画布上写字时每帧只画新增的一小段圆头短段，抬手再按最终轮廓重画一遍；
    // 批注层原来是每来一个点就 clearRect + 重画当前页所有笔迹 —— 一笔写长一点就逐帧变卡。
    // 判据与 GW.inkTrail.ok 一致：荧光笔、半透明笔种、颗粒笔（铅笔/粉笔）不走增量。
    let trailOk = false, trailCtx = null;
    const trailEligible = () => {
      if (isHl) return false;
      const styNow = inkStyleOf(cur);
      const tip = inkTipOf(styNow);
      if (!(tip.alpha >= 1)) return false;
      if (styNow && +styNow.grain > 0) return false;
      return true;
    };
    const inkTrailNew = () => {
      if (!cur || !cur.pts || !cur.ws || cur.ws.length !== cur.pts.length) return false;
      if (cur._gen !== ST.inkGen || !(cur._n >= 1)) return false;   // 不在同一代 ⇒ 画布已清，老 _n 不可信
      const n = cur.pts.length;
      if (n <= cur._n) return true;
      const w0px = cv.width, h0px = cv.height;
      const g = inkCtx();
      if (!g) return false;
      if (cv.width !== w0px || cv.height !== h0px) return false;    // 尺寸变了说明刚被清过，交给整层重画
      const ctx = g.ctx, m = g.m;
      const mw = model.w * m.k, mh = model.ht * m.k;
      const X = (i) => m.ox + cur.pts[i].x * mw;
      const Y = (i) => m.oy + cur.pts[i].y * mh;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = ctx.strokeStyle = (GW.inkFix && GW.inkFix(cur.c)) || cur.c || '#e02020';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const half = (i) => Math.max(0.3, cur.ws[i] / 2);
      for (let i = cur._n; i < n; i++) {
        const a = i - 1, c = i;
        const p0 = a > 0 ? a - 1 : a, p3 = c < n - 1 ? c + 1 : c;
        const x0 = X(p0), y0 = Y(p0), x1 = X(a), y1 = Y(a);
        const x2 = X(c), y2 = Y(c), x3 = X(p3), y3 = Y(p3);
        // 段内按 Catmull-Rom 再插几段：60Hz 采样下两点常有十几像素，直连就是可见折角
        const segPx = Math.hypot(x2 - x1, y2 - y1);
        const parts = Math.max(2, Math.min(8, Math.ceil(segPx / 7)));
        const wa = half(a), wc = half(c);
        let px = x1, py = y1;
        for (let k2 = 1; k2 <= parts; k2++) {
          const t = k2 / parts, t2 = t * t, t3 = t2 * t;
          const qx = 0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3);
          const qy = 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
          ctx.lineWidth = Math.max(0.6, (wa + (wc - wa) * t) * 2);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(qx, qy);
          ctx.stroke();
          px = qx; py = qy;
        }
      }
      cur._n = n;
      ST.inkCur = cur;
      cv.__trailN = (cv.__trailN || 0) + 1;      // 供探针核对「增量确实走了」
      return true;
    };
    const down = (e) => {
      if (ST.mode !== 'annotate') return;
      const tid = toolIdOf();
      const eraser = tid === 'eraser';
      if (!eraser && tid !== 'pen' && tid !== 'hl') return;
      if (e.button != null && e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('video,audio')) return;
      e.preventDefault(); e.stopPropagation();
      const live0 = stLive();
      if (!live0) return;
      const page = position(model, live0.data).page;
      const key = noteKeyOf(live0, page);
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件无捕获 */ }
      if (eraser) {
        erasing = true;
        eraseDid = false;
        inkEraseAt(e, live0, key);
        return;
      }
      isHl = tid === 'hl';
      const IS = GW.inkStyle || null;
      const styleId = isHl ? null : ((GW.settings || {}).penInk || 'gel');
      sty = (IS && styleId) ? IS.of(styleId) : null;
      tc = IS ? IS.tipConfig(sty && sty.id, (GW.settings || {}).penTipCfg) : null;
      baseW = widthOf();
      W = baseW * (sty ? sty.wScale : 1);
      entryPx = Math.max(3.5, W * (sty ? sty.entry : 2.0));
      pressSeen = !isHl && e.pointerType === 'pen' && e.pressure > 0 && e.pressure !== 0.5;
      travelledPx = 0; vSmooth = 0; pSmooth = 0; pSeen = false; mPrev = 0;
      lastT = tsOf(e);
      const mm = inkMatrix(), rect = cv.getBoundingClientRect();
      const p0 = posOf(e, mm, rect);
      lastX = mm.ox + p0.x * model.w * mm.k;
      lastY = mm.oy + p0.y * model.ht * mm.k;
      const st = { c: colorOf(), w: baseW, pts: [p0] };
      if (isHl) st.hl = true; else st.pen = (sty && sty.id) || 'gel';
      if (!isHl) st.ws = [widthAt(e, 0, 1)];      // 老数据没有 ws ⇒ 渲染走等宽回退路径
      inkCheckpoint(key);
      notesTouch();
      inkStrokes(key).push(st);
      cur = st;
      ST.inkCur = st;
      // 预测线只在设备真支持时才开（prof.predict：只有红外屏是 8，其余 0 ⇒ 零开销）。
      predProf = (GW.pen && GW.pen.profile) ? GW.pen.profile() : null;
      lastCx = e.clientX; lastCy = e.clientY; lastCw = W;
      predOff = (!isHl && predProf && predProf.predict > 0 && predEl) ? hidePred : null;
      if (!predOff) hidePred();
      trailOk = trailEligible();                 // 这一笔是否走增量落墨（判据同 GW.inkTrail.ok）
      inkSync();
      cur._gen = ST.inkGen; cur._n = cur.pts.length;
    };
    // 采样：合并事件逐点喂（同 input.js:2134），点距阈值按 CSS 像素（默认 0.7），
    // 存的是归一化坐标；宽度数组与点列严格等长。
    const addPoint = (ev, mm, rect) => {
      if (!cur || !cur.pts) return;
      const mw = model.w * mm.k, mh = model.ht * mm.k;
      if (!(mw > 0 && mh > 0)) return;
      const nx = clamp01((ev.clientX - rect.left - mm.ox) / mw);
      const ny = clamp01((ev.clientY - rect.top - mm.oy) / mh);
      const x = mm.ox + nx * mw, y = mm.oy + ny * mh;
      const minD = ((GW.perf && GW.perf.minPoint) || 0.7);
      const d = Math.hypot(x - lastX, y - lastY);
      if (d < minD) return;
      const now = tsOf(ev);
      travelledPx += d;
      lastX = x; lastY = y;
      cur.pts.push({ x: nx, y: ny });
      if (cur.ws) { cur.ws.push(widthAt(ev, d, now - lastT)); lastCw = cur.ws[cur.ws.length - 1]; }
      lastCx = ev.clientX; lastCy = ev.clientY;
      lastT = now;
    };
    const move = (e) => {
      if (erasing) { e.preventDefault(); e.stopPropagation(); inkEraseAt(e); return; }
      if (!cur) return;
      if (ST.mode !== 'annotate') return;
      e.preventDefault(); e.stopPropagation();
      const mm = inkMatrix(), rect = cv.getBoundingClientRect();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      const list = (evs && evs.length) ? evs : [e];
      for (let i = 0; i < list.length; i++) addPoint(list[i], mm, rect);
      // 快路径：这一笔符合增量条件就只补画新增的一小段（同 board.js 的 inkTrail），
      // 否则整层重画。做不到增量时 inkTrailNew 返回 false，不会画半截。
      if (!(trailOk && inkTrailNew())) inkSync();
      // 笔尖预测：用浏览器给的前瞻点（GW.settings.inkPredict 打开时）—— 拿不到就按画布同一
      // 口径隐藏，绝不自己编一个位置（编出来的线会在真实落点上「甩尾」）。
      if (predOff) {
        let pe = null;
        if ((GW.settings || {}).inkPredict && e.getPredictedEvents) pe = e.getPredictedEvents();
        if (pe && pe.length) {
          const p = pe[pe.length - 1];
          drawPred(p.clientX, p.clientY);
        } else hidePred();
      }
    };
    const endStroke = (e) => {
      try {
        if (cv.hasPointerCapture && cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
      } catch (_) { /* 合成事件 / 已被释放 */ }
      if (erasing) { erasing = false; eraseDid = false; return; }
      if (!cur) return;
      e.preventDefault(); e.stopPropagation();
      // 宽度数组补齐到与点列等长（curveOutline 用 ws.length === 点数 判定是否变宽）
      if (cur.ws && cur.pts && cur.ws.length !== cur.pts.length) {
        const lw = cur.ws.length ? cur.ws[cur.ws.length - 1] : W;
        while (cur.ws.length < cur.pts.length) cur.ws.push(lw);
        cur.ws.length = cur.pts.length;
      }
      // pointercancel 也走这里：已经画出来的部分**保留**，只收笔（不再丢整笔）
      if (predOff) { predOff = null; hidePred(); }
      shapeEnd(cur);
      cur._sig = null; cur._path = null;      // 收笔整形改了宽度数组，轮廓缓存必须作废
      cur = null;
      ST.inkCur = null;
      if (GW.markDirty) GW.markDirty();
      inkSync();
    };
    cv.addEventListener('pointerdown', down, true);
    cv.addEventListener('pointermove', move, true);
    cv.addEventListener('pointerup', endStroke, true);
    cv.addEventListener('pointercancel', endStroke, true);
    ST.inkTap = () => {
      cv.removeEventListener('pointerdown', down, true);
      cv.removeEventListener('pointermove', move, true);
      cv.removeEventListener('pointerup', endStroke, true);
      cv.removeEventListener('pointercancel', endStroke, true);
      ST.inkCur = null;
    };
    return cv;
  }
  function notesClear(all) {
    const cur = stLive();
    if (!cur) return;
    if (all) {
      let n = 0;
      const idp = noteKeyOf(cur, 0).split('|')[0];
      for (const k of Array.from(NOTE.keys())) if (k.indexOf(idp + '|') === 0) { inkCheckpoint(k); NOTE.delete(k); n++; }
      if (n) notesTouch();
      GW.toast(n ? '已清除全部批注' : '这份课件还没有批注');
    } else {
      const page = position(ST.model, cur.data).page;
      const k = noteKeyOf(cur, page);
      const had = NOTE.get(k);
      if (had && had.length) { inkCheckpoint(k); NOTE.delete(k); }
      if (had && had.length) notesTouch();
      GW.toast(had && had.length ? '已清除本页批注' : '本页还没有批注');
    }
    inkSync();
  }

  function stGo(direction) {
    const cur = stLive(), model = ST.model;
    if (!cur || !model) return;
    let { page, step } = position(model, cur.data);
    const previous = page, count = model.slides[page].steps.length;
    if (direction > 0 && step < count) step++;
    else if (direction < 0 && step > 0) step--;
    else if (direction > 0 && page < model.slides.length - 1) { page++; step = 0; }
    else if (direction < 0 && page > 0) { page--; step = model.slides[page].steps.length; }
    else return;
    // PPT-05：翻步游标**不进撤销栈**。改前走 GW.objects.setData，它内部 GW.commit 一条 update ⇒
    // 老师按 Ctrl+Z 会先撤销「翻了一页」，把板书撤销历史搅乱。这里直接改 data 再刷两种视图。
    cur.data.page = page;
    cur.data.step = step;
    if (GW.markDirty) GW.markDirty();
    // 卡片模式的 player 用签名缓存判断要不要重画，游标变了必须显式通知它（否则退出放映后卡片还是旧页）。
    if (cur._inst && typeof cur._inst.onUpdate === 'function') { try { cur._inst.onUpdate(); } catch (e) { /* 卡片已销毁 */ } }
    paintSlide(direction > 0 && page === previous);
    inkSync();
  }

  function closeSlide() {
    if (!ST.on) return;
    ST.on = false;
    ST.turnId++;
    // 只释放**自己申请的**全屏（FS.owner）：老师按 F11 进来的全屏不许被退出放映顺手关掉。
    fsRelease();
    cancelAnimationFrame(ST.frame);
    if (ST.key) document.removeEventListener('keydown', ST.key, true);
    if (ST.onResize) window.removeEventListener('resize', ST.onResize);
    // 空闲降装饰的计时器与监听：不留就等着下一场放映被上一场的定时器改 class。
    if (ST.idleTimer) { clearTimeout(ST.idleTimer); ST.idleTimer = 0; }
    if (ST.wake) {
      ['pointermove', 'pointerdown', 'wheel', 'touchstart'].forEach((ev) =>
        window.removeEventListener(ev, ST.wake, true));
      window.removeEventListener('keydown', ST.wake, true);
      ST.wake = null;
    }
    if (ST.tap) ST.tap.remove();
    // §二 V2：退出放映按「进来前的原状」恢复卡片播放器，不做无条件自动播放。
    returnFromShow();
    if (ST.outPage) { ST.outPage(); ST.outPage = null; }
    // PPT 对象本身在放映期间要让位（它在 #world 里，DOM 顺序排在放映层之后，会盖住画面）。
    if (ST.el) { ST.el.style.display = ''; }
    // PPT-05：退出放映 = 释放媒体（pause + removeAttribute('src') + load()）并移除整层，
    // 否则解码器会一直挂在后台，连续放映几份大课件后 Chromium 就不肯再建 <video> 了。
    if (ST.pane) { ST.pane.clear(); if (ST.pane.layer.parentNode) ST.pane.layer.parentNode.removeChild(ST.pane.layer); ST.pane = null; }
    // 工具订阅（§3.3）：离开放映必须注销，否则下一节课换工具还在改一个已经拆掉的批注层。
    if (ST.outTool) { ST.outTool(); ST.outTool = null; }
    if (ST.outObj) { ST.outObj(); ST.outObj = null; }
    if (ST.outDoc) { ST.outDoc(); ST.outDoc = null; }
    // 放映避让结束：球回到老师自己摆的位置（§3.3）。
    if (ST.avoid) { ST.avoid = null; if (GW.ball && GW.ball.releaseAvoid) GW.ball.releaseAvoid(); }
    // 批注层：退出时撤掉指针监听并清空，笔迹本身留在 NOTE 里，下次进来按课件+页还原。
    if (ST.inkTap) ST.inkTap();
    ST.inkTap = null;
    if (ST.inkCv) {
      const c = ST.inkCv.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, ST.inkCv.width, ST.inkCv.height);
      if (ST.inkCv.parentNode) ST.inkCv.parentNode.removeChild(ST.inkCv);
      ST.inkCv = null;
    }
    // 演示工作区：#dock 搬回 body —— 先摘下来再拆容器，否则 removeChild(ws) 会连工具条一起销毁。
    if (ST.dockHome && ST.dock && ST.dock.parentNode !== ST.dockHome) {
      ST.dockHome.append(ST.dock);
    }
    if (ST.ws && ST.ws.root && ST.ws.root.parentNode) ST.ws.root.parentNode.removeChild(ST.ws.root);
    // 两个浮层走同一套幂等关闭（M1）—— 同时也把引用清空，否则下次进来 toggle 判到旧引用就再也打不开。
    closePanels();
    ST.ws = null; ST.dock = null; ST.dockHome = null; ST.stageEl = null;
    ST.bar = null; ST.chip = null; ST.chips = null; ST.cv = null; ST.off = null; ST.key = null; ST.onResize = null;
    ST.tap = null; ST.el = null; ST.mode = 'operate';
    ST.black = false; ST.o = null; ST.model = null;
    // 退出放映：反差墨色回到板书自己的纸色，否则画布上的图形会一直按最后那一页 PPT 的反差画。
    if (GW.setInkPaper) GW.setInkPaper(null);
    document.body.classList.remove('slide-on');
    if (GW.showChrome) GW.showChrome.leave();
    delete document.body.dataset.pptMode;
    // 退出时把画布工具/焦点还给老师：演示前是什么工具就切回什么（批注模式会临时切笔）。
    // M1：**必须先读 ST.lastTool 再清它** —— 改前这一行前面已经写了 `ST.lastTool = 'pen'`，
    // 于是不管进来前用的是选择/橡皮/尺规，退出放映都变成笔（快照形同虚设）。
    const backTool = ST.lastTool;
    ST.lastTool = null;
    if (GW.tool && backTool) { try { GW.tool.set(backTool); } catch (e) { /* 工具已不可用 */ } }
    if (GW.requestRender) GW.requestRender();
    // PPT-D：退出画布放映时把「原版放映」也收场（没有在跑就是空操作，主进程回 idle）。
    stopExternal();
  }

  // ---------- PPT-05 演示工作区：缩略图 / 更多 两个浮层 ----------
  // 两个浮层都挂在 .ppt-ws-bottom 上方，跟着工作区的底部走 —— 不再各自 fixed 到屏幕底部
  // （旧 #slide-bar 与 #dock 互相压就是这么来的）。
  /**
   * M1：统一的面板关闭（任务书 §二）。
   *
   * 改前这里只有「把节点从 DOM 摘掉」两句，**不清 ST.more / ST.thumb**。于是：
   *  · toggleThumb/toggleMore 开头那句 `if (ST.thumb) { closePanels(); return; }` 判的是残留引用 ⇒
   *    面板关掉之后再点「缩略图」，只是又调了一次 closePanels，永远打不开（要退出放映才好）；
   *  · Esc 里 `if (ST.more || ST.thumb)` 成了死分支（引用永远非 null）⇒ 第一次 Esc 就退出放映；
   *  · resize / 退出放映走同一条路，节点被摘了但引用还在，后续 append 会把旧节点搬回来。
   *
   * 现在一个函数管完：摘节点 → 清引用 → 幂等（没有面板时是空操作，随便调多少次）。
   * 面板上挂的都是 onclick 属性，没有额外的 window/document 监听要摘；若将来加了，
   * 在这里补 removeEventListener，别在调用点各写一遍。
   */
  function closePanel(el) {
    if (!el) return null;
    // 事件监听：面板本身的事件都是 onclick 属性（随节点一起被回收），
    // 这里只兜底掉 pointerdown 上的捕获（未来若加就靠这句）。
    if (el.__off) { try { el.__off(); } catch (e) { /* 已释放 */ } el.__off = null; }
    if (el.parentNode) el.parentNode.removeChild(el);
    return null;
  }
  function closePanels() {
    const had = !!(ST.more || ST.thumb);
    ST.more = closePanel(ST.more);
    ST.thumb = closePanel(ST.thumb);
    if (had && ST.avoid) ST.avoid();
  }
  /**
   * 浮层定位（任务书 §3.2「弹窗从角落向内展开、限高可滚动、不挡自己的触发按钮」）。
   * 底部导航现在是**绝对定位的窄胶囊**，不再是整条 flex 行，所以浮层不能再用
   * `bottom: calc(100% + 8px)` 挂在它身上（那样会算到屏幕外面去）。改成：
   * 挂到 #ppt-ws 根节点，用底部导航的**实测矩形**反推浮层的 bottom —— 换分辨率、
   * 改缩放、切到 44px 触摸目标时都不会压住按钮，也不用写死高度。
   */
  function panelAt(el) {
    if (!ST.ws) return el;
    el.style.position = 'absolute';
    el.style.zIndex = '2';
    el.style.maxWidth = 'calc(100% - 20px)';
    /**
     * P1（回归任务书）：浮层按**右栏的触发按钮**锚定，并约束在安全区内。
     * 改前是「水平居中 + 底边贴底部控制行」—— 触发钮搬到右侧竖栏以后，
     * 面板会从屏幕正中弹出来，跟按下的按钮隔着大半个屏幕。
     * 现在：底边贴「更多 / 缩略图入口」按钮的上沿再往上 8px，右边缘对齐竖栏内侧；
     * 放不下时（矮屏 / 窄屏）自动收回到安全区里并允许限高滚动。
     */
    const rr = ST.ws.root.getBoundingClientRect();
    const rh = rr.height || innerHeight;
    // 触发「更多」的是右下角栏（两条角栏内容一模一样），面板就贴着它向上展开、
    // 右边缘与角栏右边对齐 —— 从角落向内弹，不横跨半个屏幕。
    const anchorEl = ST.ws.railR || ST.ws.moreBtn || ST.ws.bottom;
    let rightPx = 10, bottomPx = 68;
    try {
      const ar = anchorEl.getBoundingClientRect();
      if (ar.width > 0 && ar.height > 0) {
        rightPx = Math.max(10, Math.round(rr.right - ar.right));
        bottomPx = Math.max(8, Math.round(rr.bottom - ar.top + 8));
      }
    } catch (e) { /* 布局还没就绪，用兜底值 */ }
    if (rightPx > (rr.width || innerWidth) - 80) rightPx = 10;
    el.style.right = rightPx + 'px';
    el.style.left = 'auto';
    el.style.transform = 'none';
    el.style.bottom = bottomPx + 'px';
    el.dataset.anchorBottom = String(bottomPx);
    return el;
  }
  /** 挂好之后再量一次：面板比可用高度还高时，把它整体压回安全区内（限高滚动交给 CSS）。 */
  function fitPanel(el) {
    if (!el || !ST.ws) return el;
    try {
      const rr = ST.ws.root.getBoundingClientRect();
      const rh = rr.height || innerHeight;
      const h = el.getBoundingClientRect().height || 0;
      const b = +(el.dataset.anchorBottom || 0);
      const maxBottom = Math.max(8, Math.round(rh - h - 10));
      if (h > 0 && b > maxBottom) el.style.bottom = maxBottom + 'px';
      if (h > rh - 20) el.style.maxHeight = Math.round(rh - 30) + 'px';
    } catch (e) { /* 量不到就算了 */ }
    return el;
  }
  /**
   * 幻灯片背景的代表色（放映期给 GW.inkFix 当「纸色」用）。
   * slide.back 是 '#rrggbb' 或 { stops: [[pos, color], …], angle } 的线性渐变；
   * 渐变取所有 stop 的算术平均（只用来判深浅，不需要精确）。
   * 返回 null 表示这一页没有可解析的纯色背景 —— 交回画布自己的纸色兜底。
   */
  function paperOf(sl) {
    const b = sl && sl.back;
    const rgb = (v) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(v || '').trim());
      if (!m) return null;
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    if (typeof b === 'string') {
      const c = rgb(b);
      if (!c) return null;
      return '#' + c.map((v) => (v < 16 ? '0' : '') + v.toString(16)).join('');
    }
    if (!b || !b.stops || !b.stops.length) return null;
    const acc = [0, 0, 0];
    let n = 0;
    for (const pair of b.stops) {
      const c = rgb(pair[1]);
      if (!c) continue;
      acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; n++;
    }
    if (!n) return null;
    const h = (v) => { const s = Math.round(v / n).toString(16); return s.length < 2 ? '0' + s : s; };
    return '#' + h(acc[0]) + h(acc[1]) + h(acc[2]);
  }

  /** 浮层一律挂 #ppt-ws 根节点（不再挂底部行），保证 absolute 的包含块就是整块工作区。 */
  function mountPanel(el) {
    if (ST.ws && ST.ws.root) { ST.ws.root.append(el); fitPanel(el); }
    return el;
  }

  function toggleThumb() {
    if (ST.thumb) { closePanels(); return; }
    closePanels();
    const model = ST.model, cur = stLive();
    if (!model || !cur) return;
    const { page: curPage } = position(model, cur.data);
    const box = h('div', { class: 'ppt-ws-thumbs' });
    model.slides.forEach((sl, i) => {
      const b = h('button', { class: 'ppt-ws-thumb' + (i === curPage ? ' on' : ''), title: '第 ' + (i + 1) + ' 页' },
        h('span', { class: 'ppt-ws-thumb-n' }, String(i + 1)));
      // 缩略图先用页码方块占位、随后异步补烘焙帧（没有烘焙产物就保持页码，不阻塞打开）。
      const bake = bakeOf(cur);
      if (bake) {
        bakeImage(bakeUrl(bake, i, 0)).then((im) => {
          if (!im || !b.parentNode) return;
          const c = document.createElement('canvas');
          const w = 128, hh = Math.max(1, Math.round(w * (model.ht / model.w)));
          c.width = w; c.height = hh; c.style.width = w + 'px'; c.style.height = hh + 'px';
          c.getContext('2d').drawImage(im, 0, 0, w, hh);
          b.insertBefore(c, b.firstChild);
        }).catch(() => { /* 单页烘焙帧缺失就只显示页码 */ });
      }
      b.onclick = () => { closePanels(); stJump(i, 0); };
      box.append(b);
    });
    const p = mountPanel(panelAt(h('div', { class: 'ppt-ws-panel ppt-ws-pick' }, box)));
    ST.thumb = p;
    if (ST.avoid) ST.avoid();
  }

  // ---------- §四「更多」七组能力：共用小件 ----------
  /** 当前页当前步真正存在的播放器（唯一真源是媒体层 DOM，别重算 slide.media 的步位）。 */
  function mediaNodes() {
    return (ST.pane && typeof ST.pane.nodes === 'function') ? ST.pane.nodes() : [];
  }
  /** §二 V2：记账表的只读快照（信息面板、复制诊断、探针都用它，不另算）。 */
  function mediaRecs() { return Array.from(MEDIA.values()); }
  /** 一条媒体的记账摘要：谁在放、哪一页哪一步、有没有真帧（playing 不算）。 */
  function mediaBrief(rec) {
    const head = '对象=' + rec.id + ' 路径=' + rec.target + ' 视图=' + rec.vm + (rec.sid ? ('s' + rec.sid) : '');
    // 任务书 §二：playing / currentTime 在走不算成功，videoWidth=0 且真帧 0 才是「时间轴在走、画面没出」。
    const frame = '尺寸=' + rec.videoW + 'x' + rec.videoH + ' 真帧=' + rec.frames + '/' + rec.diff + '（' + rec.api + '）';
    if (rec.err) return head + ' ' + frame + ' 错误码=' + rec.code;
    return head + ' ' + frame + ' 就绪=' + rec.ready + '/' + rec.net + ' 时刻=' + (rec.t || 0).toFixed(2)
      + ' 播放次数=' + rec.plays + (rec.blocked ? ' 自动播放被拒' : '');
  }
  /**
   * 媒体的人话状态（§四：「控件不得假报视频画面正常」）。
   * videoWidth=0 是「有声音没画面」的硬证据 —— 只报 readyState 会把黑屏说成播放中。
   */
  function mediaStateOf(el) {
    if (!el) return '无';
    const e = el.error;
    if (e) return '打不开（错误码 ' + (e.code || 0) + '）';
    if (!el.currentSrc && !el.getAttribute('src')) return '等待加载';
    if (el.readyState < 2) return '加载中';
    // §二 V2：videoWidth=0 是「只有声音没有画面」的硬证据；videoWidth>0 但真帧计数一直是 0
    // 则是「有尺寸、没出帧」（解码器接了但不出画面）—— 也必须说出来，不能报「播放中」。
    if (el.tagName === 'VIDEO' && !el.videoWidth) return '只有声音，没有画面';
    if (el.ended) return '已播完';
    if (el.paused) return el.currentTime > 0 ? '已暂停' : '待播放';
    const rec = el.__rec;
    if (el.tagName === 'VIDEO' && rec && !rec.err && rec.frames === 0 && rec.diff === 0 && el.currentTime > 0.4) return '时间轴在走，没出画面';
    return '播放中';
  }
  function pauseAllMedia() {
    for (const el of mediaNodes()) { try { el.pause(); } catch (e) { /* 已销毁 */ } }
  }
  function blackToggle() {
    ST.black = !ST.black;
    paintSlide(false);
    GW.toast(ST.black ? '黑屏中 · 再点一次或按 B 恢复' : '画面已恢复');
  }
  /** 演示「从当前页重播」：本页动画是按 step 走的，回到第 0 步就是从头揭示。 */
  function replayPage() {
    const cur = stLive(), model = ST.model;
    if (!cur || !model) return;
    const { page } = position(model, cur.data);
    stJump(page, 0);
    GW.toast('已回到本页第 0 步');
  }
  /** 保真：原版放映前先把内部媒体全停 —— 否则两路声音一起响（§四明确禁止）。 */
  function openOriginal() {
    const c = ST.o || stLive();
    if (!c) return;
    pauseAllMedia();
    showExternal(c);
  }
  function notesPrefix() {
    const c = ST.o || stLive();
    return c ? noteKeyOf(c, 0).split('|')[0] : '';
  }
  function notesHiddenToggle() {
    ST.notesHidden = !ST.notesHidden;
    inkSync();
    GW.toast(ST.notesHidden ? '批注已隐藏（批注本身还在）' : '批注已显示');
  }
  /** 这份课件当前还剩多少笔「改了但没导出」的批注（§五.5）。 */
  function notesPending() {
    const pre = notesPrefix();
    if (!pre) return 0;
    if (notesStamp === notesExported) return 0;
    let n = 0;
    for (const [k, list] of NOTE) if (k.indexOf(pre + '|') === 0) n += list.length;
    return n;
  }
  /**
   * §五.5 退出前的批注提示。
   *
   * 改前批注只活在 NOTE 这张内存表里，退出放映、再关掉应用就彻底没了，而界面上
   * 一句提示都没有 —— 老师会以为「和板书一样自动保存过了」。现在只要本次放映里
   * 画过又没导出，退出时先问一句：导出后退出 / 直接放弃 / 继续放映。
   * 没画过（或已经导出过）就直接退出，不给正常使用加摩擦。
   */
  function askExit() {
    if (!ST.on) return;
    const n = notesPending();
    if (!n) { closeSlide(); return; }
    let dlg = null;
    // 老师明确选了「放弃」= 已经知道这批批注不会留下来了，水位拉平，
    // 下次退出不再追问（否则每次退出都弹一次，比不提示更烦）。
    const go = () => { if (dlg) dlg.close(); notesExported = notesStamp; closeSlide(); };
    const body = h('div', { class: 'ppt-ws-info' },
      h('p', { class: 'ppt-ws-note', style: { margin: '0 0 8px' } },
        '这份课件有 ' + n + ' 笔批注还没导出。批注只保存在内存里（不写进 .gewu），退出放映后关掉应用就找不回来了。'),
      h('div', { class: 'ppt-ws-mbtns' },
        h('button', { class: 'gw-btn', onclick: () => { if (dlg) dlg.close(); notesExport(); setTimeout(() => { if (ST.on) closeSlide(); }, 60); } }, '导出批注再退出'),
        h('button', { class: 'gw-btn', onclick: go }, '直接退出（放弃这些批注）')));
    dlg = GW.dialog({
      title: '批注还没保存', width: 460, ok: '继续放映', cancel: null, body,
      onOk: () => { /* 「继续放映」= 什么都不做，只关框 */ },
    });
  }
  /** 强制收场（对象被删 / 换了板书）也要留一句提示，不能把批注一起静默丢掉。
   *  改前只在「有没导出的批注」时才 toast —— 于是删掉 PPT 对象、放映自己没了，
   *  界面上什么都不说（任务书 §3.3：终止演示的操作必须有明确的状态转移/提示）。
   *  现在理由**永远**说，批注残留作为追加说明。 */
  function exitSoft(why) {
    const left = notesPending();
    closeSlide();
    if (left) GW.toast(why + ' · ' + left + ' 笔批注只在内存里，没有随退出保存', 4200);
    else GW.toast(why, 2600);
  }
  /**
   * 把本页批注画到快照上（「定格含批注」）。
   * PPT-INK：线宽基准与 inkSync 统一按 **CSS 像素** —— st.w 就是 CSS 像素笔宽，
   * 离屏画布是「页面真实尺寸」（W = 模型页宽 × k），所以只要乘一次 kk = W / model.w。
   * 改前用的是 Math.max(0.4, W / 240) 这个屏幕宽度倍率，同一条批注在定格图和放映里粗细不同。
   */
  function notesOnCanvas(cv, o, page) {
    const list = NOTE.get(noteKeyOf(o, page)) || [];
    if (!list.length) return 0;
    const ctx = cv.getContext('2d');
    // 快照画布可能带着 render() 留下的 ctx.scale(target.width/model.w, …)：
    // 那是「页面单位 → 快照像素」的缩放，而这里的点列已经乘过 W/H 到了快照像素，
    // 再乘一次就会把批注整体放大到画布外、线宽翻倍（实测 8.6px 画成 17px、跨度铺满整幅）。
    // 所以进来先把变换复位；restore() 之后调用方也不会继承这个复位（改前它本来就没复用）。
    try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch (_) { /* 老环境没有 setTransform 就按原样 */ }
    const W = cv.width, H = cv.height;
    // 定格图里的批注粗细要跟**屏幕上看到的相对粗细**一致：屏幕上页面占 displayW 个 CSS 像素、
    // 笔画是 lwCss 个 CSS 像素；快照的页面占 W 个像素 ⇒ 比例换算就是 W / displayW。
    // 改前这里直接用 W / model.w：那是「一整页宽」而不是「页面在屏幕上的实际显示宽」，
    // 页面没铺满内容区（contain 有黑边）时就会偏粗。放映中拿 inkMatrix().k 反推 displayW；
    // 不在放映里（理论上没有别的调用点）回落到旧口径。 */
    let kk = W / (ST.model && ST.model.w ? ST.model.w : 1280);
    if (ST.on && ST.model && ST.stageEl) {
      try {
        const mm0 = inkMatrix();
        const dispW = ST.model.w * mm0.k;
        if (dispW > 1) kk = W / dispW;
      } catch (_) { /* 量不到就按旧口径 */ }
    }
    let n = 0;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const st of list) {
      if (!st.pts || !st.pts.length) continue;
      ctx.strokeStyle = st.c || '#e02020';
      // 有宽度数组（PPT-INK 新笔迹）就用它的均值，老笔迹回落固定宽度：都是 CSS 像素 ⇒ 乘 kk。
      let lwCss = +st.w || 2;
      if (st.ws && st.ws.length) {
        let sum = 0;
        for (let i = 0; i < st.ws.length; i++) sum += (+st.ws[i] || lwCss);
        lwCss = sum / st.ws.length;
      }
      // 与放映里 inkSync **共用同一个轮廓生成器**：定格图上的笔锋/变宽/端帽必须和屏幕上一致，
      // 否则「定格含批注」出来的粗细跟刚才看到的不一样（任务书 PPT-INK）。
      let done = false;
      const paths = GW.paths;
      if (st.pts.length >= 3 && paths && typeof paths.curveOutline === 'function') {
        try {
          const flat = new Array(st.pts.length * 2);
          for (let i = 0; i < st.pts.length; i++) {
            flat[i * 2] = st.pts[i].x * W;
            flat[i * 2 + 1] = st.pts[i].y * H;
          }
          const wsa = (st.ws && st.ws.length === st.pts.length)
            ? st.ws.map((v) => Math.max(0.5, +v || lwCss) * kk) : null;
          const sty0 = inkStyleOf(st);
          const tip0 = inkTipOf(sty0);
          const path = paths.curveOutline(flat, wsa, kk, Math.max(1, lwCss * kk),
            st.hl ? 'round' : tip0.cap, st.hl ? 0 : tip0.tipFlat);
          if (path) {
            ctx.globalAlpha = st.hl ? 0.38 : (sty0 ? tip0.alpha : 1);
            ctx.fillStyle = st.c || '#e02020';
            ctx.fill(path);
            ctx.globalAlpha = 1;
            done = true;
          }
        } catch (_) { done = false; }
      }
      if (!done) {
        // 回退：中心线描边（老数据 / 点数太少 / 轮廓生成器不可用），笔宽同样乘 kk
        ctx.globalAlpha = st.hl ? 0.38 : 1;
        ctx.lineWidth = Math.max(1, lwCss * kk);
        ctx.beginPath();
        for (let i = 0; i < st.pts.length; i++) {
          const p = st.pts[i];
          const x = p.x * W, y = p.y * H;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        if (st.pts.length === 1) {
          const p = st.pts[0];
          ctx.lineTo(p.x * W + 0.01, p.y * H);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      n++;
    }
    ctx.restore();
    return n;
  }
  /**
   * 定格到板书（§四：「完成 toast 提供『退出后查看』，不能只插到不可见远处」）。
   * 改前固定落在 PPT 右侧 24px 处 —— 课件一贴到画布右下角，定格就插在视口外，
   * 老师点完什么也没看见。现在先试右侧，放不下就落到当前视口内并居中。
   */
  async function dropToBoard(withNotes) {
    closePanels();
    const c = stLive(), model = ST.model;
    if (!c || !model) return;
    try {
      const page = position(model, c.data).page;
      const shot = await snapshot(c, 2);
      if (withNotes) notesOnCanvas(shot, c, page);
      const vr = GW.viewRect();
      const w = Math.min(c.w, Math.max(120, vr.w * 0.9));
      let x = c.x + c.w + 24, y = c.y;
      if (x + w > vr.x + vr.w) { x = vr.x + (vr.w - w) / 2; y = vr.y + 12; }
      const obj = await GW.importer.insertDataURL(shot.toDataURL('image/png'),
        withNotes ? 'PPT 定格（含批注）' : 'PPT 定格', { x, y, w });
      if (!obj) { GW.toast('定格没能插到板书上（存储空间不足？先导出备份）', 3600); return; }
      GW.toast('定格已放到板书上 · 退出放映后即可查看', 3200);
    } catch (e) { GW.toast('PPT 定格失败：' + e.message); }
  }
  /** 批注导出（§四）：批注只在内存里，不写 .gewu —— 导出是唯一能留存的路径，必须在 toast 里说清。 */
  function notesExport() {
    closePanels();
    const c = ST.o || stLive();
    const model = ST.model;
    if (!c || !model) return;
    const pre = notesPrefix();
    const pages = {};
    let total = 0;
    for (const [k, list] of NOTE) {
      if (!k.startsWith(pre + '|') || !list.length) continue;
      pages[k.split('|')[1]] = list.map((st) => ({ color: st.c || '#e02020', width: +st.w || 2, points: st.pts || [] }));
      total += list.length;
    }
    if (!total) { GW.toast('这份课件还没有批注可以导出'); return; }
    const name = String((c.data && c.data.name) || 'PPT').replace(/[\\/:*?"<>|]/g, '_');
    const data = {
      app: 'gewu-board', kind: 'ppt-notes', version: 1,
      slide: name, source: (c.data && c.data.path) || '', hash: (c.data && c.data.hash) || '',
      size: { w: model.w, h: model.ht }, exportedAt: new Date().toISOString(),
      note: '坐标按页归一化（0..1），points 为 [x,y] 对；批注原本只在内存里，本文件是它的留存副本。',
      pages,
    };
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: name + '-批注.json' });
      a.click();
      setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) { /* 已回收 */ } }, 4000);
      notesExported = notesStamp;
      GW.toast('已导出 ' + total + ' 笔批注（批注原本只在内存里，不写进 .gewu）', 4200);
    } catch (e) { GW.toast('批注导出失败：' + e.message); }
  }
  /** 复制到剪贴板（与项目其它地方同一套：优先 clipboard API，失败退回 execCommand）。 */
  function copyText(text) {
    const s = String(text || '');
    const fallback = () => {
      try {
        const ta = h('textarea', { style: { position: 'fixed', left: '-9999px', top: '0' } });
        ta.value = s;
        document.body.append(ta);
        ta.focus(); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        GW.toast(ok ? '已复制到剪贴板' : '复制失败：内容已全选，按 Ctrl+C 复制', 2800);
      } catch (e) { GW.toast('复制失败：' + e.message); }
    };
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) { fallback(); return; }
      navigator.clipboard.writeText(s).then(() => GW.toast('已复制到剪贴板'), fallback);
    } catch (e) { fallback(); }
  }
  /** 诊断脱敏：只留「哪台机器出的问题」这层线索，抹掉用户名与常见密钥字段。 */
  function scrubText(s) {
    let t = String(s == null ? '' : s);
    t = t.replace(/[A-Za-z]:\\Users\\[^\\\s"']+/g, '%USERPROFILE%');
    t = t.replace(/\/Users\/[^\/\s"']+/g, '~');
    t = t.replace(/\/home\/[^\/\s"']+/g, '~');
    t = t.replace(/(token|key|secret|password|passwd|pwd)=([^\s&]+)/gi, '$1=***');
    return t;
  }
  /** §五.3：覆盖清单的读取口（模型上没有就返回 null，导入前的对象也能安全调用）。 */
  function auditOf() {
    const model = ST.model;
    return (model && model.audit) || null;
  }
  function auditText(au) {
    if (!au) return '未解析';
    return '源 ' + au.sources + ' · 已渲染 ' + au.rendered + ' · 占位 ' + au.placeholder
      + ' · 部分 ' + au.partial + ' · 丢失 ' + au.dropped
      + (au.mediaFail && au.mediaFail.length ? ' · 媒体失败 ' + au.mediaFail.length : '');
  }
  function diagText() {
    const c = ST.o || stLive();
    const model = ST.model;
    const rt = routeOf(c);
    const cap = CAPS[rt.actual] || CAPS[rt.planned] || null;
    const pos = (c && model) ? position(model, c.data) : { page: 0, step: 0 };
    const B = GW.BUILD || {};
    const nodes = mediaNodes();
    const head = [
      '【放映信息】',
      '课件：' + ((c && c.data && c.data.name) || 'PPT'),
      '页/步：' + (pos.page + 1) + '/' + (model ? model.slides.length : '?') + ' · 第 ' + pos.step + ' 步',
      '路线：' + (cap ? cap.label : '?') + (rt.why ? '（' + rt.why + '）' : ''),
      '源文件：' + ((c && c.data && c.data.path) ? String(c.data.path).split(/[\\/]/).pop() : '内联副本'),
      '构建：' + (B.id || '?') + ' 版本 ' + (B.version || '?') + (B.channel ? ' 渠道 ' + B.channel : '')
        + ' 内容指纹 ' + (B.content || '无（未签名构建）'),
      '全屏：真实=' + (FS.real ? 1 : 0) + ' 申请=' + (FS.want ? 1 : 0) + ' 待重试=' + (FS.retry ? 1 : 0),
      '媒体：' + (nodes.length ? nodes.map((el, i) => (el.tagName === 'VIDEO' ? '视频' : '音频') + (i + 1) + '=' + mediaStateOf(el)).join('; ') : '无'),
      '媒体记账：' + (mediaRecs().length ? mediaRecs().slice(-4).map(mediaBrief).join(' | ') : '无'),
      '覆盖：' + auditText(auditOf()),
      '视口：' + innerWidth + 'x' + innerHeight + ' dpr=' + (window.devicePixelRatio || 1),
      '—— 诊断日志（末 60 条）——',
    ].join('\n');
    // §五.3：非完美覆盖逐条点名（页号 + 形状名 + 分类 + 原因），最多 40 行。
    const au = auditOf();
    const cov = (au && au.items && au.items.length)
      ? au.items.slice(0, 40).map((it) => '  第' + it.page + '页 · ' + (it.name || '(未命名)') + ' [' + it.kind + '/' + it.outcome + ']' + (it.why ? '：' + it.why : '')).join('\n')
      : '  （无：所有源对象都按原样还原）';
    const covHead = (au && au.items && au.items.length) ? '—— 覆盖明细（' + au.items.length + ' 条' + (au.itemsCut ? '，已截断' : '') + '）——' : '—— 覆盖明细 ——';
    return scrubText(head + '\n' + covHead + '\n' + cov + '\n' + DIAG_LOG.slice(-60).join('\n'));
  }
  /**
   * §五.3 覆盖明细：把 audit.items 逐条列出来（页号 / 形状名 / 分类 / 原因）。
   * 只读，不做任何跳转之外的动作 —— 「跳到该页」按钮让老师直接看到被替代的那一块。
   */
  function coverageDialog() {
    const au = auditOf();
    const model = ST.model;
    if (!au || !au.items || !au.items.length) { GW.toast('这份课件的所有对象都已按原样还原'); return; }
    const LABEL = { placeholder: '占位（无版式引擎）', partial: '部分还原', dropped: '丢失', text: '仅文字' };
    const rows = au.items.map((it) => h('div', { class: 'ppt-ws-cov' },
      h('div', { class: 'ppt-ws-covh' },
        h('b', null, '第 ' + it.page + ' 页'),
        h('span', { class: 'ppt-ws-covn' }, ' · ' + (it.name || '(未命名)')),
        h('span', { class: 'ppt-ws-covt' }, ' · ' + (LABEL[it.outcome] || it.outcome))),
      it.why ? h('div', { class: 'ppt-ws-covw' }, it.why) : null,
      (model && it.page >= 1 && it.page <= model.slides.length)
        ? h('button', {
            class: 'gw-btn', style: { marginTop: '2px' },
            onclick: () => { closePanels(); stJump(it.page - 1, 0); GW.toast('已跳到第 ' + it.page + ' 页'); },
          }, '跳到该页')
        : null));
    const body = h('div', { class: 'ppt-ws-info' },
      h('div', { class: 'ppt-ws-kv' },
        h('span', { class: 'ppt-ws-k' }, '汇总'), h('span', { class: 'ppt-ws-v' }, auditText(au) + (au.itemsCut ? '（明细已截断）' : ''))),
      h('div', { style: { marginTop: '8px' } }, ...rows));
    GW.dialog({ title: '覆盖明细', width: 560, ok: '关闭', cancel: null, body });
  }
  /** 信息面板（§四「信息」）：普通用户只看人话字段；调试字段只在「复制诊断」里。 */
  function infoDialog() {
    const c = ST.o || stLive();
    const model = ST.model;
    const rt = routeOf(c);
    const cap = CAPS[rt.actual] || CAPS[rt.planned] || null;
    const pos = (c && model) ? position(model, c.data) : { page: 0, step: 0 };
    const B = GW.BUILD || {};
    const nodes = mediaNodes();
    const au = auditOf();
    const kv = (k, v) => h('div', { class: 'ppt-ws-kv' }, h('span', { class: 'ppt-ws-k' }, k), h('span', { class: 'ppt-ws-v' }, v));
    const body = h('div', { class: 'ppt-ws-info' },
      kv('课件名', (c && c.data && c.data.name) || 'PPT'),
      kv('当前页', (pos.page + 1) + ' / ' + (model ? model.slides.length : '?') + ' 页 · 第 ' + pos.step + ' 步'),
      kv('播放路线', cap ? cap.label : '（未知）'),
      kv('源文件', (c && c.data && c.data.path) ? String(c.data.path).split(/[\\/]/).pop() : '内联副本（无源文件）'),
      kv('构建', (B.id || '未知') + ' · 版本 ' + (B.version || '?') + (B.channel ? ' · 渠道 ' + B.channel : '')),
      // §五.6：同版本不同内容 —— 构建号会被「同一天打两次」撞上，内容指纹才是唯一身份。
      kv('内容指纹', B.content ? (B.contentShort + '…（' + B.contentFiles + ' 个源文件）') : '未签名构建（无指纹）'),
      kv('全屏', FS.real ? '真实全屏' : (FS.want ? '已申请，尚未生效' : '窗口内放映')),
      kv('媒体', nodes.length ? nodes.map((el, i) => (el.tagName === 'VIDEO' ? '视频' : '音频') + (i + 1) + '：' + mediaStateOf(el)).join(' · ') : '本页当前步没有媒体'),
      // §五.3：覆盖统计要能落到「哪一页的哪一个形状」。这里只给一行汇总，
      // 明细进「覆盖明细」（逐条列页号/名字/原因），普通用户不必看 id 与调试字段。
      kv('覆盖', auditText(au)),
      cap && cap.note ? h('p', { class: 'ppt-ws-note' }, cap.note) : null,
      h('div', { class: 'ppt-ws-mbtns', style: { marginTop: '10px' } },
        (au && au.items && au.items.length)
          ? h('button', { class: 'gw-btn', title: '逐条列出没有按原样还原的对象（页号 / 形状名 / 原因）', onclick: () => coverageDialog() }, '覆盖明细')
          : null,
        h('button', { class: 'gw-btn', title: '复制人话字段 + 已脱敏的诊断日志', onclick: () => copyText(diagText()) }, '复制诊断')));
    GW.dialog({ title: '放映信息', width: 560, ok: '关闭', cancel: null, body });
  }
  /** 页面跳转对话框（§四「导航：页码跳转」）：页码 1 起、步数 0 起，超范围不关框只提示。 */
  function jumpDialog() {
    const model = ST.model, c = stLive();
    if (!model || !c) return;
    const pos = position(model, c.data);
    const pg = h('input', { class: 'hw-input', type: 'number', min: 1, max: model.slides.length, step: 1, value: String(pos.page + 1), style: { width: '96px' } });
    const sd = h('input', { class: 'hw-input', type: 'number', min: 0, step: 1, value: String(pos.step), style: { width: '96px' } });
    const hint = h('span', { class: 'ppt-ws-note', style: { marginLeft: '10px' } });
    const body = h('div', null,
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
        h('label', null, '页码'), pg,
        h('label', { style: { marginLeft: '8px' } }, '步数'), sd),
      h('p', { class: 'ppt-ws-note' }, '共 ' + model.slides.length + ' 页；步数 0 表示该页第 1 帧，超范围按最后一帧算。'),
      hint);
    GW.dialog({
      title: '跳到指定页', width: 420, ok: '跳转', body,
      onOk: () => {
        const p = Math.trunc(+pg.value || 0) - 1;
        if (!(p >= 0 && p < model.slides.length)) { hint.textContent = '页码要在 1 ~ ' + model.slides.length + ' 之间'; return false; }
        const count = model.slides[p].steps.length;
        const st = Math.max(0, Math.min(count, Math.trunc(+sd.value || 0)));
        closePanels();
        stJump(p, st);
        // 跳到别的页要把它自己的批注取回来（批注是按「课件+页」存的）。
        inkSync();
        GW.toast('已跳到第 ' + (p + 1) + ' 页 · 第 ' + st + ' 步');
        return true;
      },
    });
    setTimeout(() => { try { pg.focus(); pg.select(); } catch (e) { /* 无焦点 */ } }, 30);
  }
  /** 媒体面板（§四「媒体」）：逐条 播放/暂停/重播/静音/音量/重试 + 实时状态。 */
  function mediaDialog() {
    let timer = 0;
    const nodes = mediaNodes();
    const body = h('div', null);
    const states = [], toggles = [];
    if (!nodes.length) {
      body.append(h('p', { class: 'ppt-ws-note' }, '本页当前步没有视频或音频。媒体动作是按步揭示的 —— 往后翻一步再打开这里。'));
    } else {
      nodes.forEach((el, i) => {
        const isV = el.tagName === 'VIDEO';
        const stEl = h('span', { class: 'ppt-ws-mstate' }, mediaStateOf(el));
        const tgEl = h('button', { class: 'gw-btn', onclick: () => {
          if (el.paused) el.play().catch((e) => GW.toast('播不了：' + (e && e.message ? e.message : e)));
          else el.pause();
        } }, el.paused ? '播放' : '暂停');
        states.push({ el, node: stEl });
        toggles.push({ el, node: tgEl });
        body.append(h('div', { class: 'ppt-ws-mediaitem' },
          h('div', { class: 'ppt-ws-mediahead' },
            h('strong', null, (isV ? '视频 ' : '音频 ') + (i + 1)),
            h('span', { class: 'ppt-ws-mpath', title: el.getAttribute('data-media-target') || '' }, el.getAttribute('data-media-target') || ''),
            stEl),
          h('div', { class: 'ppt-ws-mbtns' },
            tgEl,
            h('button', { class: 'gw-btn', onclick: () => { try { el.currentTime = 0; } catch (e) { /* 元数据未就绪 */ } el.play().catch(() => {}); } }, '重播'),
            h('button', { class: 'gw-btn', onclick: () => { el.muted = !el.muted; } }, el.muted ? '取消静音' : '静音'),
            h('button', { class: 'gw-btn', title: '减小音量', onclick: () => { el.volume = Math.round(Math.max(0, el.volume - 0.1) * 10) / 10; } }, '音量 −'),
            h('button', { class: 'gw-btn', title: '增大音量', onclick: () => { el.volume = Math.round(Math.min(1, el.volume + 0.1) * 10) / 10; } }, '音量 ＋'),
            h('button', { class: 'gw-btn', title: '重新加载这条媒体（播放失败时用）', onclick: () => {
              try { el.load(); } catch (e) { /* 已销毁 */ }
              el.play().catch(() => {});
            } }, '重试'))));
      });
    }
    GW.dialog({
      title: '本页媒体', width: 560, ok: '关闭', cancel: null, body,
      onClose: () => { if (timer) { clearInterval(timer); timer = 0; } },
    });
    // 状态要实时刷（老师在面板里点暂停，状态字得跟着变；但不能假报「播放中」）。
    if (nodes.length) {
      timer = setInterval(() => {
        for (const it of states) it.node.textContent = mediaStateOf(it.el);
        for (const it of toggles) it.node.textContent = it.el.paused ? '播放' : '暂停';
      }, 600);
    }
  }

  function mRow(label, ...btns) {
    return h('div', { class: 'ppt-ws-mrow' }, h('span', { class: 'ppt-ws-mgl' }, label), btns.filter(Boolean));
  }

  function toggleMore() {
    if (ST.more) { closePanels(); return; }
    closePanels();
    const cur = stLive();
    const hasSlide = !!(ST.o || cur);
    const nodes = mediaNodes();
    // 统一入口：h() 对 disabled:false 会跳过，所以这里传布尔值即可。
    const mk = (label, title, fn, off) => h('button', { class: 'gw-btn', title, onclick: fn, disabled: !!off }, label);
    const rows = [];
    // ① 导航：缩略图目录 + 页码/步数跳转，并显示当前页与步数（chip 常驻底部，这里再说一次总数）。
    rows.push(mRow('导航',
      mk('上一步', '上一步（← / PageUp）：只在当前页里往回走一步动画', () => { closePanels(); stGo(-1); }, !hasSlide),
      mk('下一步', '下一步（→ / PageDown / 空格）：揭示下一步动画', () => { closePanels(); stGo(1); }, !hasSlide),
      mk('缩略图', '按页挑页（带烘焙缩略图）', () => { closePanels(); toggleThumb(); }, !hasSlide),
      mk('跳到某页…', '按页码 / 步数跳转（选择后恢复该页自己的批注）', () => { closePanels(); jumpDialog(); }, !hasSlide),
      h('span', { class: 'ppt-ws-mgl', style: { minWidth: '0', marginLeft: '2px' } },
        hasSlide ? ('共 ' + ST.model.slides.length + ' 页') : '')));
    // ② 演示：从当前页重播 / 回首页 / 黑屏（黑屏同时盖课件与视频，批注仍可用）。
    rows.push(mRow('演示',
      mk('重播本页', '回到本页第 0 步，从头揭示动画', () => { closePanels(); replayPage(); }, !hasSlide),
      mk('回首页', '跳到第 1 页第 0 步', () => { closePanels(); stJump(0, 0); }, !hasSlide),
      mk(ST.black ? '恢复画面' : '黑屏', '黑屏同时盖住课件与视频，批注工具仍可用（B 键同效）', () => { closePanels(); blackToggle(); })));
    // ③ 媒体：没有媒体就禁用并说明，绝不摆一个点了没反应的按钮。
    rows.push(mRow('媒体',
      mk('本页媒体…', nodes.length ? '播放 / 暂停 / 重播 / 静音 / 音量 / 重试' : '本页当前步没有视频或音频（媒体是按步揭示的）',
        () => { closePanels(); mediaDialog(); }, !nodes.length),
      h('span', { class: 'ppt-ws-mgl', style: { minWidth: '0', marginLeft: '2px' } },
        nodes.length ? (nodes.length + ' 个 · ' + mediaStateOf(nodes[0])) : '无媒体')));
    // ④ 批注：显示隐藏 / 撤销重做 / 清本页清全部（清全部要防误触）/ 导出。
    rows.push(mRow('批注',
      mk(ST.notesHidden ? '显示批注' : '隐藏批注', '只影响显示，批注本身还在', () => { closePanels(); notesHiddenToggle(); }, !hasSlide),
      mk('撤销', '撤销一笔批注（落笔、清本页、清全部都算）', () => { closePanels(); inkUndo(); }),
      mk('重做', '重做刚撤销的一笔', () => { closePanels(); inkRedo(); }),
      mk('清除本页', '清除当前页的全部批注', () => { closePanels(); notesClear(false); }, !hasSlide),
      mk('清除全部', '清除这份课件的全部批注（会再确认一次）', () => {
        closePanels();
        GW.confirm('清除这份课件在本次放映里的全部批注？此操作不可恢复。', '清除全部').then((yes) => { if (yes) notesClear(true); });
      }, !hasSlide),
      mk('导出批注', '导出为 JSON 文件（批注只在内存里，不写进 .gewu）', () => notesExport(), !hasSlide)));
    // ⑤ 定格：含 / 不含批注两档，落点保证在当前视口内。
    rows.push(mRow('定格',
      mk('定格到板书', '当前页画面（不含批注）放到板书上', () => { dropToBoard(false); }, !hasSlide),
      mk('定格（含批注）', '当前页画面连同本页批注一起放到板书上', () => { dropToBoard(true); }, !hasSlide)));
    // ⑥ 保真：原版放映（先停内部媒体）；再挂上不可移除的「全部工具」「设置」保底入口。
    rows.push(mRow('保真',
      mk('原版放映', hasShow() ? '用本机 WPS/Office 打开原版放映（会先停掉这里的媒体）' : '需要桌面版 + WPS/Office',
        () => { closePanels(); openOriginal(); }, !hasSlide),
      // §3.3「保留不可移除的『全部工具』『设置』入口」：悬浮球扇区可定制，老师换掉「工具」扇区后
      // 球上就没有它了，而放映时原工具栏整条被隐藏 —— 这里是唯一保底出口。
      mk('全部工具', '打开全部工具面板（与悬浮球同一份目录）', () => { closePanels(); if (GW.ballPanel && GW.ballPanel.tools) GW.ballPanel.tools(); }),
      mk('设置', '设置（Esc 关掉后回到放映）', () => { closePanels(); if (GW.showSettings) GW.showSettings(); })));
    // ⑦ 信息：人话字段 + 复制脱敏诊断；全屏失败时的「重试全屏」也归在这里。
    rows.push(mRow('信息',
      mk('放映信息…', '课件名 / 播放路线 / 构建 / 媒体状态，可复制诊断', () => { closePanels(); infoDialog(); }),
      // §3.1：进放映时已经自动申请过全屏，这里只负责「刚才那次失败了，再试一次」。
      FS.retry ? mk('重试全屏', FS.real ? '已经在全屏中' : '全屏申请失败，再试一次', () => { closePanels(); fsAsk(); }) : null));
    const p = mountPanel(panelAt(h('div', { class: 'ppt-ws-panel ppt-ws-more' }, rows)));
    ST.more = p;
    if (ST.avoid) ST.avoid();
  }

  // ---------- PPT-05 演示工作区：模式切换 / 页码跳转 ----------
  // 两种模式的分工（任务书 §3.3）：
  //  · 操作 PPT：指针与键盘都交给课件（点击/空格翻步，视频控件可点可拖），画布菜单照常可用；
  //  · 批注：笔/荧光笔/橡皮落在 #ppt-ink 批注层（按课件+页保存、不进撤销栈），
  //    选择/文字/图形/尺规等工具照旧落到真正的画布上走原命令。
  /**
   * 切换放映模式（任务书 §3.3）。
   * skipTool=true 表示「模式是被工具变化带过来的」—— 这时**不许**再回头去调 GW.tool.set，
   * 否则 tool 事件 → setMode → tool.set → tool 事件 会自激，老师在球上点一次笔能连切两次。
   */
  function setMode(mode, skipTool) {
    const m = (mode === 'annotate') ? 'annotate' : 'operate';
    ST.mode = m;
    if (!ST.on) return;
    document.body.dataset.pptMode = m;
    if (!skipTool && GW.tool) {
      try {
        const cur = GW.tool.current;
        if (m === 'operate') { if (cur !== 'hand') GW.tool.set('hand'); }
        else if (cur === 'hand') GW.tool.set('pen');
      } catch (e) { /* 工具已不可用 */ }
    }
    inkHit();
    inkSync();
  }
  // 工具 → 模式（§3.3「选笔/橡皮→批注，选交互→操作 PPT」）。改前 inkHit 只在 setMode 里被调一次，
  // 放映中老师从悬浮球换工具时批注层永远停在进来那一刻的 pointer-events 上：
  // 选回笔时画不上、选橡皮时批注层还在吞事件。
  const ANNOTATE_TOOLS = ['pen', 'hl', 'eraser'];
  const OPERATE_TOOLS = ['hand', 'select'];
  function syncModeFromTool(name) {
    if (!ST.on) return;
    const n = String(name || '');
    if (ANNOTATE_TOOLS.indexOf(n) >= 0) { if (ST.mode !== 'annotate') setMode('annotate', true); }
    else if (OPERATE_TOOLS.indexOf(n) >= 0) { if (ST.mode !== 'operate') setMode('operate', true); }
    // 其余工具（文字/图形/尺规/激光…）保持不变：批注层按 inkHit 让开，事件落到真正的画布上。
  }

  // 上一页 / 下一页（任务书 §3.2 底部导航）：整页跳，步数归零（后退时落到该页最后一步，
  // 与 stGo 的「后退跨页」手感一致）。同样不进撤销栈 —— 与 stGo/stJump 同一口径。
  function stPageJump(dir) {
    const cur = stLive(), model = ST.model;
    if (!cur || !model) return;
    const { page } = position(model, cur.data);
    const last = model.slides.length - 1;
    const to = Math.max(0, Math.min(last, page + (dir > 0 ? 1 : -1)));
    if (to === page) return;
    stJump(to, dir > 0 ? 0 : model.slides[to].steps.length);
  }

  // 跳到指定页/步（缩略图点选用）。同样**不进撤销栈**，理由与 stGo 一致。
  function stJump(page, step) {
    const cur = stLive(), model = ST.model;
    if (!cur || !model) return;
    const last = model.slides.length - 1;
    page = Math.max(0, Math.min(last, page | 0));
    const count = model.slides[page].steps.length;
    step = Math.max(0, Math.min(count, step | 0));
    cur.data.page = page;
    cur.data.step = step;
    if (GW.markDirty) GW.markDirty();
    if (cur._inst && typeof cur._inst.onUpdate === 'function') { try { cur._inst.onUpdate(); } catch (e) { /* 卡片已销毁 */ } }
    paintSlide(true);
    inkSync();
  }

  // 放映只认自己的那几个键，其余一律放行：本项目的 keydown 有三套（input.js:4561 的全局、
  // app.js 的 PRES.key、这里），全都用 capture 且没有优先级仲裁 —— 所以这里不做「大包大揽」，
  // 只 claim ←→/PageUp/PageDown/空格/B/Esc，Ctrl+Z 之类照旧落到全局那套去。
  function present(o, model) {
    if (!model) return;
    closeSlide();
    const cv = document.getElementById('slide-canvas');
    const stage = document.getElementById('stage');
    if (!cv || !stage) return;
    // 演示前老师用的是什么工具，退出时要还回去（切模式会临时把工具换成手型/笔）。
    ST.lastTool = (GW.tool && GW.tool.current) || 'pen';
    ST.stageEl = stage;
    // 任务书 §3.1：点「放映」就是**真实全屏**，不再让老师再去找一次全屏按钮。
    // 这一句必须留在用户点击的同步激活链里（本函数此前的 await 都在后面），否则浏览器
    // 会判成非用户手势而拒绝 requestFullscreen，桌面端也会因为丢焦点拿不到真全屏。
    fsAsk();

    // ---------- 沉浸布局（任务书 §3.2 · PPT-UI 2026-11 改版）：四组**绝对定位浮层** ----------
    //  · 左上：课件名（只读小胶囊，给顶栏一个「有内容且不挡画面」的浮层）；
    //  · 右上：退出放映（唯一且常驻的出口）；
    //  · 左下角 / 右下角：各一条与 #dock 同款的白色圆角面板，四个键（上一页/下一页/页码/更多）；
    //  · 「上一步 / 下一步」收进「更多」面板（两侧角栏只留最常用的整页翻页，尽量不压画面）；
    //  · 操作 PPT / 批注两种模式不再有专门按钮：底部工具栏当前工具就决定模式（syncModeFromTool）。
    // 角栏贴在两个下角（CSS 里写死），命中区 ≥ 44 CSS px。
    // 内容区（.ppt-ws-content）仍铺满整块视口，画面按 contain 装进去 —— 控件一律不占布局高度。
    // .ppt-ws-nav 仍是导航的**逻辑容器**（零高度、贴底）：四条导航与页码步数都在它里面，
    // 「更多」面板的定位口径（panelAt）以底部行的上沿为准，所以它必须留在底部。
    const deckName = String((o && o.name) || (model && model.name) || '').replace(/\.(pptx|ppt)$/i, '').trim();
    const top = h('div', { class: 'ppt-ws-top' },
      h('span', { class: 'ppt-ws-title', title: deckName || '放映中' }, deckName || '放映中'));
    const exitBtn = h('button', { class: 'gw-btn ppt-ws-exit', title: '退出放映（Esc）', onclick: () => askExit() }, '退出放映');

    // ---------- 内容区：整块视口（画面/视频/批注层/命中测试全部按它算） ----------
    const content = h('div', { class: 'ppt-ws-content' });

    // ---------- 左下 / 右下两条角栏（与 #dock 同款白色圆角面板） ----------
    const navBtn = (label, title, fn) => h('button', { class: 'gw-btn', title, 'aria-label': label, onclick: fn }, label);
    // 两栏放**同一套四个键**（上一页 / 下一页 / 页码步数 / 更多）：老师从哪一侧伸手都能操作，
    // 所以每条键都得各建一份 DOM（同一个节点不能挂在两个父节点下）。
    const mkRail = (side) => {
      const st = h('span', { class: 'pptx-status', 'aria-live': 'polite' });
      const more = h('button', { class: 'gw-btn ppt-ws-morebtn', title: '更多：上一步 / 下一步 / 导航 / 演示 / 媒体 / 批注 / 定格 / 保真 / 信息', onclick: () => toggleMore(o) }, '更多');
      // 页码步数入口：点一下就是「跳到某页…」（原来要两步：更多 → 跳到某页）。
      const jump = h('button', { class: 'gw-btn ppt-ws-jump', title: '跳到某页 / 某一步', 'aria-label': '跳到某页', onclick: () => { closePanels(); jumpDialog(); } }, st);
      const rail = h('div', { class: 'ppt-ws-rail ppt-ws-rail-' + side },
        navBtn('上一页', '上一页（整页后退）', () => stPageJump(-1)),
        navBtn('下一页', '下一页（整页前进）', () => stPageJump(1)),
        jump, more);
      return { rail, chip: st, moreBtn: more, jump };
    };
    const railLBox = mkRail('l'), railRBox = mkRail('r');
    const railL = railLBox.rail, railR = railRBox.rail;
    const chip = railLBox.chip, moreBtn = railLBox.moreBtn;
    const nav = h('div', { class: 'ppt-ws-nav' }, railL, railR);
    const ctrl = h('div', { class: 'ppt-ws-ctrl' }, nav);
    const bottom = h('div', { class: 'ppt-ws-bottom' }, ctrl);
    const root = h('div', { id: 'ppt-ws' }, content, top, exitBtn, bottom);
    document.body.append(root);

    ST.on = true; ST.o = o; ST.model = model; ST.cv = cv; ST.chip = chip;
    ST.chips = [railLBox.chip, railRBox.chip];
    ST.off = null; ST.black = false; ST.notesHidden = false;
    ST.ws = { root, top, bottom, content, ctrl, nav,
      exitBtn, moreBtn, moreBtns: [railLBox.moreBtn, railRBox.moreBtn],
      railL, railR, chipBtns: [railLBox.jump, railRBox.jump], chipBtn: railLBox.jump };

    // 放映期间原底部工具栏 #dock 整条隐藏（§3.2）—— 工具全部从悬浮球调用（§3.3）。
    // 记住它原来的父节点，退出时原样还回去；节点本身留在 body 里不动，所以几何计算不受影响。
    ST.dock = document.getElementById('dock');
    ST.dockHome = ST.dock ? ST.dock.parentNode : null;

    // 媒体浮层留在 #stage 里（z-index 2：压着 PPT 图片、被墨迹(3)/批注层压住），
    // 布局口径与 paintSlide **共用同一份 wsContentRect()**，所以视频永远贴着画面不会漂。
    // V1：这里必须以 projection() 的**无量纲 scale** 回给 mediaPane —— 它的 layout 是
    // `left = pr.ox + b.x * pr.k`，k 的单位就是「CSS 像素 / 模型单位」。改前这里塞的是
    // 「设备像素宽度」（1400 宽的内容区在 DPR 1.25 下算出 ≈1280），于是视频框被乘了上千倍、
    // 偏移变成 -54 万像素，页面上只剩媒体层的纯色背景。
    // §二 V2：进放映先把卡片里的播放器停住（否则同一份素材两路出声），只记状态、退出时按原状恢复。
    handOffToShow();
    ST.showId = ++showSeq;
    ST.pane = mediaPane(model, stage, () => {
      const cr = wsContentRect();
      const pj = projection(model, cr);
      return { k: pj.scale, ox: cr.x + pj.x, oy: cr.y + pj.y };
    }, { vm: 'show', oid: o.id, sid: ST.showId });
    ST.pane.layer.style.zIndex = '2';
    ST.pane.layer.style.pointerEvents = 'none';

    document.body.classList.add('slide-on');
    // 放映内「常显」是一个独立的进程内状态（见 app.js GW.showChrome）：
    // 进入时按上次在放映里的选择起算（没选过就是自动淡出），退出时清掉 body 上的痕迹。
    if (GW.showChrome) GW.showChrome.enter();
    inkAttach(o, model);
    // 工具变化要实时反映到批注层与模式（§3.3）：退出时在 closeSlide 里注销。
    if (GW.bus && GW.bus.on) ST.outTool = GW.bus.on('tool', syncModeFromTool);
    setMode('operate');

    // 空闲降装饰（§3.2「悬停/聚焦恢复对比度」）：3 秒无操作把模式条/导航/退出降到 42%，
    // 鼠标一动、触摸一下、按任意键立刻回来。浮层打开期间不降（否则面板和它的触发按钮一起变淡）。
    // 2026-11 需求：放映内浮层**完全隐藏**，只有「点悬浮球」或「常显」才出现。
    // 所以鼠标划过不再把它们叫回来 —— 一旦挂上 .idle 就保持到点球为止（CSS 侧
    // body.ball-open / body.show-pin 是唯一的显现来源）。
    const wake = () => {
      if (ST.idleTimer) { clearTimeout(ST.idleTimer); ST.idleTimer = 0; }
      const byBall = document.body.classList.contains('ball-open');
      if (byBall && root.classList.contains('idle')) root.classList.remove('idle');
      if (byBall) return;
      if (root.classList.contains('idle')) return;
      ST.idleTimer = setTimeout(() => {
        ST.idleTimer = 0;
        if (!ST.on || ST.more || ST.thumb || ST.black) return;
        // 任务书 §3.2：放映内选了「常显」，浮层就不许再淡出；打开的菜单/焦点/正在按的钮
        // 本来就已经被上面两条挡住了。
        if (GW.showChrome && GW.showChrome.pinned()) return;
        if (root.contains(document.activeElement)) return;
        root.classList.add('idle');
      }, 3000);
    };
    ST.wake = wake;
    ['pointermove', 'pointerdown', 'wheel', 'touchstart'].forEach((ev) =>
      window.addEventListener(ev, wake, { passive: true, capture: true }));
    window.addEventListener('keydown', wake, true);
    root.addEventListener('focusin', wake);
    // 需求（2026-11）：进来就是**完全隐藏** —— 只有点悬浮球或选「常显」才出现。
    // 所以首帧直接挂上 .idle，wake() 在没点球时不会把它撤掉（见上面的 byBall 分支）。
    root.classList.add('idle');
    wake();

    /**
     * P0-4（回归任务书）：放映期打开的资源抽屉 / 仿真抽屉 / 工具浮层，输入必须归它们。
     * 改前只认 .dlg-wrap（模态框）、video/audio 与输入框，抽屉是 body 直属的 .drawer，
     * 于是在抽屉里按方向键 / 空格会**翻 PPT 页**，点空白处还会继续翻步。
     */
    const layerOpen = () => !!document.querySelector('.drawer');
    ST.key = (e) => {
      const t = e.target;
      if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName || ''))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // 快捷键归属（任务书 §3.3）：弹层/菜单 > 视频控件 > 演示控制器 > 画布。
      if (document.querySelector('.dlg-wrap')) return;
      // 抽屉优先：抽屉里的方向键/空格归抽屉自己的列表与控件；Esc 先关抽屉。
      if (layerOpen() || document.querySelector('.pop')) {
        if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation();
          GW.bus.emit('escape');
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'PageDown'
          || e.key === 'PageUp' || e.key === ' ' || e.key === 'Spacebar') return;
      }
      if (t && t.closest && t.closest('video,audio')) return;
      // §二 V2：焦点在播放器上时（点过原生控件之后就是这种状态），空格/方向键归视频进度，不归演示。
      const ae = document.activeElement;
      if (ae && /^(VIDEO|AUDIO)$/.test(ae.tagName || '')) return;
      const k = e.key;
      if (k === 'Escape') {
        // Esc 优先级（任务书 §3.4）：对话框/编辑器 → 球与更多面板 → 视频控件 → 演示 → 画布。
        // 前两级在上面已经 return 掉（.dlg-wrap 与 video/audio 里的按键交给它们自己）。
        // 这里按「最上层的、最临时的那一档」往下剥：
        //   ① 展开的更多/缩略图浮层（它们盖在画面上，且有自己的触发按钮要收）；
        //   ② 展开的悬浮球（扇环 + 子面板；老师刚点开它，多半是想收回去而不是退出放映）；
        //   ③ 批注模式退回操作模式；
        //   ④ 画布选区（属于画布级，退出放映才是最后一步）；
        //   ⑤ 真的退出放映。
        if (ST.more || ST.thumb) { closePanels(); e.preventDefault(); return; }
        if (GW.ball && GW.ball.isOpen && GW.ball.isOpen()) { GW.ball.close(); e.preventDefault(); return; }
        if (ST.mode === 'annotate') { setMode('operate'); e.preventDefault(); return; }
        if (GW.selection && GW.selection.items && GW.selection.items.length) { GW.selection.clear(); e.preventDefault(); return; }
        // §五.5：先过一道「批注还没导出」的确认，再真的收场。
        askExit(); return;
      }
      if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Spacebar') { e.preventDefault(); e.stopPropagation(); stGo(1); return; }
      if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); e.stopPropagation(); stGo(-1); return; }
      if (k === 'b' || k === 'B') { e.preventDefault(); e.stopPropagation(); ST.black = !ST.black; paintSlide(false); }
    };
    document.addEventListener('keydown', ST.key, true);

    // §3.3 放映避让：球要躲开顶部模式胶囊、右上退出、底部导航与「更多」（球 z-index 90 会盖住它们）。
    // 球的位置只在本次放映里被推开，退出时由 closeSlide 调 releaseAvoid() 还回去。
    ST.avoid = () => {
      if (!GW.ball || typeof GW.ball.avoid !== 'function' || !ST.ws) return;
      // 展开的面板也一起躲（面板最大 720px 宽，会整块盖住球）。
      // 左右竖栏与两个模式角钮都要躲：它们比原来那条居中胶囊更贴边，球停在左下/右下
      // 会直接被盖住（§3.2 明确要求「按安全区避让浮球/底角/原生控件」）。
      const pads = [ST.ws.top, ST.ws.exitBtn, ST.ws.ctrl,
        ST.ws.railL, ST.ws.railR, ST.ws.moreBtn, ST.ws.chipBtn,
        ST.dock, ST.more, ST.thumb];
      // 必须转成 {x,y,w,h}：DOMRect 的尺寸属性叫 width/height，而 GW.ball.avoid 读的是 w/h，
      // 直接丢 DOMRect 进去会让每个命中框都算成 0×0，避让形同虚设（探针 ③b 就是抓这个的）。
      const rects = pads.filter(Boolean)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 1 && r.height > 1)
        .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
      GW.ball.avoid(rects);
    };
    requestAnimationFrame(() => { if (ST.on) ST.avoid(); });

    ST.onResize = () => { closePanels(); paintSlide(false); inkSync(); if (ST.avoid) ST.avoid(); };
    window.addEventListener('resize', ST.onResize);
    // 放映期间若老师翻走了当前页，PPT 对象已经不在这一页 —— 直接收场，别留在黑屏上。
    ST.outPage = GW.bus.on('page', () => { if (!stLive()) closeSlide(); else paintSlide(false); });
    // §3.3「切板书/替换文件等会终止演示的操作要有明确状态转移/提示」：
    //  · 当前这份 PPT 对象被删掉（撤销删除、清空页面、换文件都走 objects.remove）—— 直接收场，
    //    否则老师会停在一块已经没有数据源的画面上，翻页还会抛错；
    //  · 打开别的板书（.gewu）—— 整块画布被换掉了，放映状态必须一起撤掉。
    // 两条都给一句 toast：安静地退回板书会让人以为「放映自己崩了」。
    // 注意比的是 ST.o（present 时记下的那个对象）**而不是** stLive()：事件是在
    // GW.removeItems 之后发的，那时它已经不在页面里，stLive() 恒为 null，判据会永远不成立。
    ST.outObj = GW.bus.on('objremove', (rm) => {
      if (!ST.on) return;
      const o0 = ST.o;
      if (o0 && rm && (rm === o0 || (rm.id && o0.id && rm.id === o0.id))) {
        exitSoft('PPT 对象已移除，已退出放映');
      }
    });
    ST.outDoc = GW.bus.on('doc-loaded', () => {
      if (!ST.on) return;
      closeSlide();
    });
    // 放映时把这张 PPT 的对象卡从 #world 里藏掉，否则它自己会盖在放映画面上。
    if (o._el) { ST.el = o._el; o._el.style.display = 'none'; }

    // 自动翻步（任务书 §3.3）：只认「未被任何子工具消费的空白 PPT 背景」+ 同一主指针 +
    // 没有拖动/缩放 + 操作 PPT 模式。改前只判 data-tool==='hand' 与 ST.bar.contains，
    // 于是视频控件、缩略图、菜单里的点击都可能被误当成翻页。
    const down = (e) => { ST.down = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
    const up = (e) => {
      const d = ST.down; ST.down = null;
      if (!d || d.id !== e.pointerId) return;
      if (ST.mode !== 'operate') return;
      // P0-4：抽屉/浮层开着时，画布上的点按不许翻步（老师是在调仿真/资源，不是翻页）。
      if (layerOpen() || document.querySelector('.pop')) return;
      if (document.body.dataset.tool !== 'hand') return;
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) return;
      if (e.defaultPrevented) return;
      const t = e.target;
      // §二 V2：媒体槽位（含视频、原生控件、进度条）上的点按归视频，不许翻页。
      if (t && t.closest && t.closest('video,audio,.gw-ppt-media-slot,button,a,input,select,textarea,#ppt-ws')) return;
      const cr = wsContentRect();
      const sr = stage.getBoundingClientRect();
      const px = e.clientX - sr.left, py = e.clientY - sr.top;
      if (px < cr.x || py < cr.y || px > cr.x + cr.w || py > cr.y + cr.h) return;
      stGo(1);
    };
    stage.addEventListener('pointerdown', down, true);
    stage.addEventListener('pointerup', up, true);
    ST.tap = { remove() {
      stage.removeEventListener('pointerdown', down, true);
      stage.removeEventListener('pointerup', up, true);
    } };

    paintSlide(false);
    // 放映时若还没烘焙好（比如直接从演示模式进），等一下再补一帧；期间先显示 canvas 渲染的画面。
    // PPT-B：这里必须 .catch。ensureBake 内部虽有 .catch，但它自己可能在更早的地方抛
    // （2.2.9 的 bakeJob 漏声明就是这样），没有 .catch 就成了未捕获的 Promise 拒绝，
    // 烘焙失败在界面与日志里**一句话都不留** —— 老师的感受就是「PPT 从来不烘焙」。
    if (!bakeOf(o)) ensureBake(o).then((bake) => { if (bake && ST.on) paintSlide(false); })
      .catch((e) => diag('放映补帧失败（继续 canvas 渲染）：' + ((e && e.message) || e)));
  }

  GW.defineKind('slides', {
    chrome: 'bare', keepAspect: true, minW: 240, minH: 160,
    title: (o) => o.data.name || 'PPT',
    defaultSize: (d) => ({ w: 960, h: 960 * clamp(+d.ratio || 9 / 16, 0.1, 10) }),
    create(o, body) {
      body.classList.add('pptx-player');
      body.textContent = '正在读取 PPT…';
      let alive = true, controller = null;
      // PPT-06：按源路径做引用计数（同一份课件可以插两个对象），最后一个销毁时才关主进程句柄。
      const heldPath = o.data.path || '';
      retainPath(heldPath);
      modelOf(o).then((model) => {
        if (!alive) return;
        body.textContent = '';
        controller = player(o, model, body, false);
        // 后台预热烘焙产物：第一次导入时让 Office 把每步末态渲成 PNG，之后放映/定格直接贴图。
        // 失败（没装 WPS/Office、文件已移动、超时）只是没有烘焙，画面仍走 canvas 渲染。
        // PPT-B：同 present() —— 烘焙异常必须留痕，不许静默吞掉。
        if (!bakeOf(o)) ensureBake(o).then((bake) => { if (bake && alive && controller) controller.refresh(); })
          .catch((e) => diag('后台烘焙失败（继续 canvas 渲染）：' + ((e && e.message) || e)));
      }).catch((e) => { if (alive) body.textContent = 'PPT 无法打开：' + e.message; });
      const refresh = () => { if (controller) controller.refresh(); };
      return { onView: refresh, onUpdate: refresh, destroy() {
        alive = false;
        if (controller) controller.destroy();
        // 关掉对象就把「这次打开」的引用还回去：最后一个用户走时文件句柄与媒体层一起释放。
        releasePath(heldPath);
      } };
    },
  });

  /**
   * PPT-01：模式能力表 —— 一条课件最终走哪条路线、能保真到什么程度，必须写在代码里、
   * 也写在界面上（degradeNote 就是它的出口），不能靠老师自己猜「为什么动画没了」。
   * 这四种模式是互斥的实际路由，不是可选功能清单：
   * · bake      桌面版 + 本机 WPS/Office：每页每步由 Office 自己渲成 PNG，排版/表格/图表保真，
   *             但**只有每步末态的静态图**，过程中的连续运动看不到。
   * · native    没有 Office 时的自解析渲染：形状/文字/图片 + 有限动画（淡入/飞入/擦除/劈裂/百叶窗/缩放/位移/旋转）。
   * · static    单页静态呈现（不推进步骤）。
   * · external  外部原版放映（交给 Office 自己的放映窗口）。
   */
  const CAPS = {
    bake: { label: '步骤图片（Office 渲染）', fidelity: 'high', motion: false, note: '排版与表格图表保真，但每步只有静态图，过程中的连续运动不呈现' },
    native: { label: '原生渲染', fidelity: 'medium', motion: true, note: '形状/文字/图片与有限动画可呈现，复杂版式与未支持特效会降级' },
    static: { label: '静态页', fidelity: 'low', motion: false, note: '只呈现当前步画面，不推进动画' },
    external: { label: '外部原版放映', fidelity: 'exact', motion: true, note: '由本机 Office/WPS 自己放映，保真度最高' },
  };
  const hasBake = () => !!(typeof window !== 'undefined' && window.gewu && window.gewu.pptBake);
  /** 8 位内容指纹：只用于把日志里的失败和某个具体课件对上，不做安全用途。 */
  function hashOf(bytes) {
    let h = 0x811c9dc5;
    const n = bytes.length, step = n > 262144 ? Math.floor(n / 262144) : 1;
    for (let i = 0; i < n; i += step) { h ^= bytes[i]; h = (h * 0x01000193) >>> 0; }
    h ^= n; h = (h * 0x01000193) >>> 0;
    return ('0000000' + h.toString(16)).slice(-8);
  }

  async function insert(source, name, at) {
    const doc = GW.doc.pages, page = GW.page();
    const isPath = typeof source === 'string';
    const scope = isPath ? await window.gewu.fileInfo(source) : source;
    if (!scope) {
      diag('导入失败 来源=' + (isPath ? '本机路径' : '拖入/浏览器') + ' 阶段=read 原因=文件无法读取'
        + (isPath ? ' 路径=' + String(source).slice(-80) : ''));
      throw new Error('PPT 文件无法读取');
    }
    if (scope.size > MAX_LOCAL) {
      diag('导入失败 来源=' + (isPath ? '本机路径' : '拖入/浏览器') + ' 字节=' + scope.size + ' 阶段=read 原因=超过 512MB 上限');
      throw new Error('PPT 文件超过 512 MB');
    }
    // 两条通道：
    // · ≤64 MB 且不是本机路径 → 老规矩，源文件 base64 内联进 .gewu（自包含，换机也能打开）。
    // · >64 MB 的本机路径 → 不再内联，只记路径，用时从磁盘读（否则 .gewu 与每 20 秒一次的
    //   自动备份会被一份上百 MB 的课件拖死）。这类对象换机后需要重新指定文件。
    const asPath = isPath && scope.size > MAX_FILE;
    if (!isPath && scope.size > MAX_FILE) throw new Error('PPT 文件超过 64 MB：桌面版请用「插入 → 从本机文件」的方式导入，浏览器版请换较小文件');
    let bytes, b64 = '', file = null;
    if (asPath) {
      /**
       * PPT-06：217 MB 的课件不再整份读进渲染进程（以前这一步会让 V8 常驻 ~450 MB，
       * 之后的自动备份/翻页都跟着抖）。现在只在主进程开一个随机读句柄，把中央目录（十几 KB）拿回来，
       * 之后每个 XML/图片/媒体条目按需读 —— parse() 一行都没改，因为它看到的还是同一种 {read}。
       * 失败要能说清原因（文件被移动 / 不是 zip / 超过 512MB），并且重试就是重新走一遍这段。
       */
      const opener = window.gewu && window.gewu.pptZipOpen;
      if (!opener) throw new Error('此设备不支持直接读取大文件，请换较小的课件');
      const opened = await opener(source);
      if (!opened || !opened.ok) {
        const why = (opened && (opened.detail || opened.why)) || '未知原因';
        diag('导入失败 来源=本机路径 阶段=open 原因=' + why + ' 路径=' + String(source).slice(-80));
        throw new Error('PPT 文件无法读取：' + why);
      }
      file = opened;
    } else if (isPath) {
      b64 = await window.gewu.readFile(source, 'base64');
      if (b64.length > Math.ceil(MAX_FILE / 3) * 4) throw new Error('PPT 文件超过 64 MB');
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } else {
      b64 = GW.b64FromBuffer(await source.arrayBuffer());
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    }
    // PPT-02：一次导入从哪来、多大、多少页、什么比例、走哪条路线、多少告警、花了多久，
    // 全部落一行日志。改前失败了只有一句 toast，日志里连文件都认不出来。
    const t0 = performance.now();
    // 文件后备时没有整份字节可采样，用「路径末段 + 大小」做 hash（日志里够用了）
    const hash = bytes ? hashOf(bytes) : hashOf(file.name + '|' + file.size);
    const tParse = performance.now();
    let model;
    try {
      model = await parse(bytes, file);
    } catch (e) {
      if (file && window.gewu && window.gewu.pptZipClose) { try { await window.gewu.pptZipClose(file.token); } catch (err) { /* 已释放 */ } }
      diag('导入失败 hash=' + hash + ' 名称=' + String(name).slice(0, 60) + ' 字节=' + (bytes ? bytes.length : file.size)
        + ' 来源=' + (isPath ? '本机路径' : '拖入/浏览器') + (file ? '（按需读取）' : '') + ' 阶段=parse 耗时=' + Math.round(performance.now() - t0) + 'ms'
        + ' 原因=' + ((e && e.message) || e));
      throw e;
    }
    const parseMs = Math.round(performance.now() - tParse);
    if (doc !== GW.doc.pages || page !== GW.page()) throw new Error('导入期间切换了板书或页面，请在目标页重试');
    const data = { name, ratio: model.ht / model.w, page: 0, step: 0 };
    // 本机导入时把路径也记下来：渲染层要拿它去烘焙（Office 只能按文件路径打开），
    // 源文件搬走后仍有内联副本（≤64 MB 那档）或者给一句「源文件已移动」的明确提示。
    if (isPath) {
      data.path = source;
      pathCache.set(source + '|' + scope.size + '|' + scope.mtime, Promise.resolve(model));
    }
    if (!asPath) {
      const asset = GW.assets.put(b64, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', name);
      cache.set(GW.doc.assets[asset], Promise.resolve(model));
      data.asset = asset;
    }
    // PPT-01：**计划路线**不是「能力 + 有数据」就能定的。
    // ensureBake() 的第一行是 `const p = o.data.path; if (!p) return null` —— Office 只能按文件路径打开，
    // 所以**只有内联副本（data.asset）而没有源路径的文件永远烘焙不了**。改前把 data.asset 也算进
    // 「可以 bake」，这类文件被标成 route=bake，实际一路走画布渲染，日志与界面都在说假话。
    // 现在：内联副本显式记为 native 并写明原因（要烘焙得先把内联数据落到受控临时文件，需要主进程配合，
    // 不在本次范围内）；真烘焙要等 ensureBake 真的贴出图才算 actualRoute=bake。
    const route = hasBake() && data.path ? 'bake' : 'native';
    const routeWhy = route === 'bake' ? '有源路径 + 烘焙桥'
      : !hasBake() ? '本机没有 WPS/Office（烘焙桥不可用）'
        : '只有内联副本，没有源路径（Office 必须按路径打开）';
    const o = GW.objects.create('slides', Object.assign({}, data, { route: { planned: route, plannedWhy: routeWhy, actual: '', actualWhy: '' } }), at);
    const warnings = model.slides.filter((s) => s.warnings.length).length;
    const au = model.audit || {};
    ((au.dropped || au.placeholder || (au.mediaFail && au.mediaFail.length)) ? diag : note)('导入完成 hash=' + hash + ' 名称=' + String(name).slice(0, 60)
      + ' 字节=' + (bytes ? bytes.length : file.size) + ' 来源=' + (isPath ? '本机路径' : '拖入/浏览器')
      + (file ? '（按需读取，未整份载入）' : asPath ? '（仅记路径）' : '（内联副本）')
      + ' 页=' + model.slides.length + ' 页尺寸=' + Math.round(model.w) + 'x' + Math.round(model.ht)
      + ' 对象=' + (au.sources || 0) + '/已渲染=' + (au.rendered || 0) + '/占位=' + (au.placeholder || 0)
      + '/部分=' + (au.partial || 0) + '/丢失=' + (au.dropped || 0)
      + ' 动画步数=' + ((au.anim && au.anim.steps) || 0) + '/入页组=' + ((au.anim && au.anim.autoGroups) || 0)
      + '/对象触发=' + ((au.anim && au.anim.trigGroups) || 0)
      + ' 告警页=' + warnings + ' 计划路线=' + route + (CAPS[route] ? '（' + CAPS[route].label + '）' : '') + ' 依据=' + routeWhy
      + ' 时机=insert 解析=' + parseMs + 'ms 总计=' + Math.round(performance.now() - t0) + 'ms');
    // 告警存在时告诉老师「哪些页有兼容提示」，而不是只说「有几页」。
    const pagesWarn = model.slides.map((s, i) => (s.warnings.length ? i + 1 : 0)).filter(Boolean);
    GW.toast('已导入 ' + model.slides.length + ' 页 PPT'
      + (warnings ? ' · 第 ' + pagesWarn.slice(0, 6).join('、') + (pagesWarn.length > 6 ? '…' : '') + ' 页有兼容提示' : '')
      + (CAPS[route] && route === 'bake' ? ' · 步骤图片模式（过程中的连续动画不呈现）' : ''), 5200);
    return o;
  }

  GW.pptx = { parse, render, snapshot, insert, visibility, animReport, CAPS, routeOf,
    // 烘焙内部件对外只读暴露，供探针断言；业务代码不要直接调它们。
    bake: { plan: bakePlan, url: bakeUrl, of: bakeOf, draw: drawBaked, visibleAt, audit: auditBake, ensure: ensureBake, image: bakeImage },
    slide: { open: present, close: closeSlide, go: stGo, isOn: () => ST.on,
      // 放映内「常显」刚被改过（app.js 的 GW.showChrome.set 调它）：立刻把 faint 淡出撤回。
      syncChrome: () => {
        if (!ST.on || !ST.ws || !ST.ws.root) return;
        // 球开着 ⇒ 浮层显现；球收起且没选常显 ⇒ 立刻隐回去（不等那 3 秒空闲计时）。
        if (GW.ball && GW.ball.isOpen && GW.ball.isOpen()) { if (ST.wake) ST.wake(); }
        else if (!(GW.showChrome && GW.showChrome.pinned())) ST.ws.root.classList.add('idle');
      } },
    // PPT-D：原版放映（真起 WPS/Office 的放映窗口）。探针用它断言「按钮背后真的有出口」。
    show: { available: hasShow, start: showExternal, stop: stopExternal },
    // PPT-05：媒体层内部件，只给探针用（挂到给定容器上、按页/步同步、整层清空）。
    // §二 V2：媒体会话记账（viewMode / showSessionId / 真帧 / 错误码），只读对外；
    // 业务代码不要调，探针靠它断言「播了但没有画面」这类假成功。
    media: { pane: mediaPane, mime: mimeOf, url: (model, target) => model.mediaURL(target),
      recs: () => mediaRecs().map((r) => Object.assign({}, r)), state: mediaStateOf,
      session: () => ({ showSeq: showSeq, on: ST.on, id: ST.showId || 0 }), rfc: RFC },
    // §四「信息」：诊断拼装与脱敏的只读入口 —— 探针靠它断言「复制诊断」真的脱敏；业务代码不要调。
    diag: { text: diagText, scrub: scrubText, log: () => DIAG_LOG.slice() },
    // 探针专用：按内存副本读单个条目，用来验证预算/CRC/压缩比判据（业务代码不要调）。
    zip: { read: (bytes, name, limit) => archive(bytes).read(name, limit), ratioOk: (packed2, size2) => zipRatioOk(packed2, size2) } };
})();
