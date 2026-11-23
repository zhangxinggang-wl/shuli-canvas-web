/* 数理无限画布 · .gwanim 单文件动画包（方案 L3）
 *
 * 一个 .gwanim 就是 zip：anim.html + meta.json + preview.png（不压缩，store only —— 运行期零依赖，
 * 自己写 60 行 zip 比引入一个库更划算；动画件本来就小，压不压差别不大）。
 *
 * 为什么值得有：单文件动画要能在老师之间传（微信/QQ/网盘），落地方便才会有人做内容。
 * 导入 = 解出 anim.html + 同目录 sidecar .json（R6 的按章元数据），放进 <userData>/library/物理/<章节>/
 * 导出 = 反过来打一个包，顺手把 meta.json 从课件自己的 meta 注释块里生成，作者不用手写第二份。
 *
 * 只认 zip 的 store 模式；遇到 deflate / zip64 / 加密包就明确报错，而不是解出半个文件。
 */
(function () {
  'use strict';
  const GW = window.GW;

  // ---------- CRC32（zip 的头字段）----------
  const CRCT = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8');
  const u8 = (x) => (x instanceof Uint8Array ? x : enc.encode(String(x == null ? '' : x)));

  // ---------- 写：store only ----------
  function zipStore(files) {
    const locals = [], centrals = [];
    let off = 0;
    files.forEach((f) => {
      const name = u8(f.name);
      const data = u8(f.data);
      const crc = crc32(data);
      const lh = new Uint8Array(30 + name.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);        // 需要版本 2.0
      lv.setUint16(6, 0x0800, true);    // bit 11：文件名是 UTF-8
      lv.setUint16(8, 0, true);         // method 0 = store
      lv.setUint16(10, 0, true);        // time
      lv.setUint16(12, 0x21, true);     // date（1996-01-01，固定值让产物可复现）
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      lh.set(name, 30);
      locals.push(lh, data);

      const ch = new Uint8Array(46 + name.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, off, true);      // 本地头偏移
      ch.set(name, 46);
      centrals.push(ch);
      off += lh.length + data.length;
    });
    const cdSize = centrals.reduce((a, b) => a + b.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, off, true);
    const total = off + cdSize + eocd.length;
    const out = new Uint8Array(total);
    let at = 0;
    locals.forEach((b) => { out.set(b, at); at += b.length; });
    centrals.forEach((b) => { out.set(b, at); at += b.length; });
    out.set(eocd, at);
    return out;
  }

  // ---------- 读：只认 store ----------
  function unzipStore(u8in) {
    const b = u8in instanceof Uint8Array ? u8in : new Uint8Array(u8in);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // EOCD 在最末尾（可能有注释），从后往前扫最多 64KB
    let eocd = -1;
    const from = Math.max(0, b.length - 0xFFFF - 22);
    for (let i = b.length - 22; i >= from; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是 zip（找不到中央目录结尾）');
    const n = dv.getUint16(eocd + 10, true);
    const cdOff = dv.getUint32(eocd + 16, true);
    if (n === 0xFFFF || cdOff === 0xFFFFFFFF) throw new Error('不支持 zip64 包');
    const files = [];
    let p = cdOff;
    for (let i = 0; i < n; i++) {
      if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('中央目录损坏');
      const flags = dv.getUint16(p + 8, true);
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const cmtLen = dv.getUint16(p + 32, true);
      const lo = dv.getUint32(p + 42, true);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + cmtLen;
      if (flags & 1) throw new Error('不支持加密的 zip：' + name);
      if (method !== 0) throw new Error('只支持未压缩（store）的 zip：' + name + ' 用了 method=' + method);
      if (dv.getUint32(lo, true) !== 0x04034b50) throw new Error('本地文件头损坏：' + name);
      const lNameLen = dv.getUint16(lo + 26, true);
      const lExtraLen = dv.getUint16(lo + 28, true);
      const dataAt = lo + 30 + lNameLen + lExtraLen;
      files.push({ name, data: b.subarray(dataAt, dataAt + csize) });
    }
    return files;
  }

  // ---------- dataURL ↔ 字节 ----------
  function dataUrlToBytes(url) {
    const m = /^data:([^;]*);base64,(.*)$/.exec(String(url || ''));
    if (!m) throw new Error('不是 base64 data URL');
    const bin = atob(m[2]);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { mime: m[1] || 'application/octet-stream', data: out };
  }
  function bytesToDataUrl(bytes, mime) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return 'data:' + (mime || 'application/octet-stream') + ';base64,' + btoa(s);
  }

  // ---------- 打包 / 解包 ----------
  // opts: { html: string, meta: object|string|null, previewPng: Uint8Array|null }
  function buildBundle(opts) {
    const html = String((opts && opts.html) || '');
    if (!html) throw new Error('没有动画内容（anim.html 为空）');
    const parsed = GW.parseAnimMeta ? GW.parseAnimMeta(html) : null;
    if (!parsed) throw new Error('内容里没有 meta 注释块（缺 @title），不能打包');
    if (html.indexOf('__anim') < 0) throw new Error('内容里没有 window.__anim（见契约 §4），不能打包');
    const meta = opts.meta || {
      title: parsed.meta.title || '',
      chapter: parsed.meta.chapter || '',
      tags: String(parsed.meta.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
      params: parsed.params.map((x) => x.k + '=' + x.v).join(','),
      contract: 1,
    };
    const files = [{ name: 'anim.html', data: html }, { name: 'meta.json', data: JSON.stringify(meta, null, 2) }];
    const pv = opts.previewPng;
    if (pv && pv.length) files.push({ name: 'preview.png', data: pv });
    return zipStore(files);
  }

  // 解包：返回 { html, meta, preview }；不合格的包直接抛错说明原因
  function readBundle(bytes) {
    const files = unzipStore(bytes);
    const find = (n) => files.filter((f) => f.name.toLowerCase() === n)[0] || null;
    const htmlFile = find('anim.html') || find('index.html');
    if (!htmlFile) throw new Error('包里没有 anim.html');
    const html = dec.decode(htmlFile.data);
    const parsed = GW.parseAnimMeta ? GW.parseAnimMeta(html) : null;
    if (!parsed) throw new Error('anim.html 里没有 meta 注释块（缺 @title）');
    if (html.indexOf('__anim') < 0) throw new Error('anim.html 里没有 window.__anim（见契约 §4）');
    let sidecar = null;
    const mf = find('meta.json');
    if (mf) { try { sidecar = JSON.parse(dec.decode(mf.data)); } catch (e) { sidecar = null; } }
    const pv = find('preview.png');
    return {
      html,
      meta: parsed.meta,
      params: parsed.params,
      sidecar: sidecar && typeof sidecar === 'object' ? sidecar : null,
      preview: pv ? pv.data : null,
      chapter: (sidecar && sidecar.chapter) || parsed.meta.chapter || '',
      title: (sidecar && sidecar.title) || parsed.meta.title || '',
    };
  }

  GW.gwanim = {
    crc32, zipStore, unzipStore, dataUrlToBytes, bytesToDataUrl, buildBundle, readBundle,
    EXT: '.gwanim',
    // 逐文件名 → 章节路径的落盘目录：必修三/第11章 X/11.4 Y → [必修三, 第11章 X, 11.4 Y]
    chapterDirs(chapter) {
      return String(chapter || '').split('/').map((s) => s.trim()).filter(Boolean)
        .map((s) => s.replace(/[\\/:*?"<>|]/g, '_'));   // Windows 文件名非法字符统一换掉
    },
  };
})();
