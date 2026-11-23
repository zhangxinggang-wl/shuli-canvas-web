/* 数理无限画布 · 笔记包与模板素材读取（protobuf wire + ZIP）
 *
 * 从哪来：反编译产物里的 02-assets 全是这三种容器 ——
 *   · `.ntb`   一本笔记本 = 一个 ZIP（version / noteBundle / manifest.json / assets/ / thumbnail.png）
 *   · `.dat`   模板页内容（如思维导图、KWL 表）= 裸 protobuf
 *   · `.element` 贴纸集合 = 裸 protobuf
 * 原版用内部 schema 直接反序列化；我们没有 .proto，所以这里做的是**无 schema 的结构解码**：
 * 按 wire format 逐字段拆，能递归成消息就递归，否则当字符串/字节。目的是「看懂并统计」，
 * 不是「渲染出原版页面」—— 后者需要字段语义，反编译产物里没有。
 *
 * 合规边界（照 反编译报告.md 第四节）：
 *   · 只读格式，不搬运内容。模块不内置任何 .dat/.element/.ntb，也不注册到导入 UI；
 *     要开放给老师用，必须先确认素材来源可分发。
 *   · 默认不挂载。`GW.noteproto` 存在，但 importer.js 不主动调用它。
 *
 * 依赖：零。inflate 优先用 Web 的 DecompressionStream('deflate-raw')（Chromium 103+，
 * 本项目 Electron 45 / 安卓 WebView 都满足），Node 下退到 zlib。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const GW = (root.GW = root.GW || {});
  GW.noteproto = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MAX_DEPTH = 22;      // 与反编译报告的递归深度一致；再深基本都是同构嵌套
  const MAX_FIELDS = 20000;  // 单条消息字段上限，防畸形包把内存吃光
  const WIRE = { VARINT: 0, I64: 1, LEN: 2, I32: 5 };

  // ---------- varint ----------
  function readVarint(buf, pos) {
    let result = 0;
    let shift = 0;
    let p = pos;
    while (p < buf.length) {
      const b = buf[p++];
      result += (b & 0x7f) * Math.pow(2, shift);
      if ((b & 0x80) === 0) return { value: result, pos: p };
      shift += 7;
      if (shift > 70) return null; // 超过 10 字节必是坏数据
    }
    return null;
  }

  function isPrintable(bytes) {
    // 允许 \t \n \r 与 0x20–0x7E，或合法 UTF-8 多字节（宽松：只要不是一大片控制字符）
    let bad = 0;
    const n = Math.min(bytes.length, 256);
    for (let i = 0; i < n; i++) {
      const b = bytes[i];
      if (b === 9 || b === 10 || b === 13) continue;
      if (b < 0x20) bad++;
    }
    return bytes.length > 0 && bad / n < 0.02;
  }

  function decodeMessage(bytes, depth, out) {
    const fields = [];
    let pos = 0;
    while (pos < bytes.length) {
      const tag = readVarint(bytes, pos);
      if (!tag) return null;
      pos = tag.pos;
      const fieldNo = Math.floor(tag.value / 8);
      const wire = tag.value % 8;
      if (fieldNo === 0) return null; // field 0 不可能出现

      if (wire === WIRE.VARINT) {
        const v = readVarint(bytes, pos);
        if (!v) return null;
        pos = v.pos;
        fields.push({ f: fieldNo, w: 'v', n: v.value });
      } else if (wire === WIRE.I64) {
        if (pos + 8 > bytes.length) return null;
        // 低 32 位足够表达 double 的位模式；这里只留十六进制，避免把 f64 误读成时间戳
        fields.push({ f: fieldNo, w: 'b64', n: hex(bytes, pos, 8) });
        pos += 8;
      } else if (wire === WIRE.I32) {
        if (pos + 4 > bytes.length) return null;
        fields.push({ f: fieldNo, w: 'b32', n: hex(bytes, pos, 4) });
        pos += 4;
      } else if (wire === WIRE.LEN) {
        const len = readVarint(bytes, pos);
        if (!len) return null;
        pos = len.pos;
        if (pos + len.value > bytes.length) return null;
        const slice = bytes.subarray(pos, pos + len.value);
        pos += len.value;

        // 长度前缀字段可能是：嵌套消息 / 字符串 / 裸字节（图片、UUID）
        let nested = null;
        if (depth < MAX_DEPTH && slice.length >= 2) nested = tryNested(slice, depth + 1, out);
        if (nested) fields.push({ f: fieldNo, w: 'm', v: nested });
        else if (isPrintable(slice)) fields.push({ f: fieldNo, w: 's', v: utf8(slice) });
        else fields.push({ f: fieldNo, w: 'x', n: hex(bytes, pos - len.value, Math.min(len.value, 64)), len: len.value });
      } else {
        return null; // 3/4/6/7 是旧协议或坏数据
      }
      if (fields.length > MAX_FIELDS) return null;
    }
    out.depth = Math.max(out.depth, depth);
    out.fields += fields.length;
    return fields;
  }

  // 「看起来像消息」才递归。三级判定（踩过的坑都在这）：
  //   ① 单字段消息极常见（本例 .dat 的 field 1 里只有一个 field 21），不能因为「只有 1 个字段」
  //      就否掉 —— 那会把整棵模板树压成一坨 hex（第一版就栽在这）。
  //   ② 但纯 ASCII 字符串（UUID/标题）也常常能"凑巧"解析成功，所以先看可打印率。
  //   ③ 单字段 + wire=2 且长度 ≥16 才认，能把 "D6154DF3-2CBA-…" 这种 UUID 挡在外面
  //      （它首字节 'D'=0x44 → field 8 / wire 4，本来也过不了 wire 校验）。
  // 统计口径：嵌套层的 depth/fields 必须回填到**顶层** out，否则「6 个字段 / 深度 1」
  // 这种假数据会误导诊断（第一版就是这么错的）。用 probe 试解，接受才合并。
  function tryNested(slice, depth, out) {
    if (slice.length < 2) return null;
    const probe = { depth: 0, fields: 0 };
    const got = decodeMessage(slice, depth, probe);
    if (!got || !got.length) return null;
    let accept = false;
    if (got.length >= 2) accept = true;
    else {
      const only = got[0];
      if (only.w === 'm' && slice.length >= 8) accept = true;
      else if (only.w === 's' && slice.length >= 16 && !isMostlyText(slice)) accept = true;
    }
    if (!accept) return null;
    if (out) {
      out.depth = Math.max(out.depth || 0, probe.depth || 0, depth);
      out.fields += probe.fields;
    }
    return got;
  }

  // 是否「几乎全是可打印文本」——用于把字符串从消息里分出来
  function isMostlyText(bytes) {
    let printable = 0;
    const n = Math.min(bytes.length, 64);
    for (let i = 0; i < n; i++) {
      const b = bytes[i];
      if (b === 9 || b === 10 || b === 13 || (b >= 0x20 && b < 0x7f)) printable++;
    }
    return n > 0 && printable / n > 0.9;
  }

  function hex(bytes, pos, n) {
    let s = '';
    for (let i = 0; i < Math.min(n, bytes.length - pos); i++) s += (bytes[pos + i] < 16 ? '0' : '') + bytes[pos + i].toString(16);
    return s;
  }

  function utf8(bytes) {
    try { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); } catch (_) { return ''; }
  }

  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw new Error('noteproto: 需要 Uint8Array / ArrayBuffer');
  }

  // ---------- 公开：结构解码 ----------
  function decode(input, opts) {
    const bytes = toBytes(input);
    const out = { depth: 0, fields: 0 };
    const tree = decodeMessage(bytes, 1, out);
    if (!tree) return null;
    const stat = summarize(tree);
    return {
      size: bytes.length,
      fields: out.fields,
      depth: out.depth,
      strings: stat.strings,
      nested: stat.nested,
      tree,
    };
  }

  function summarize(tree) {
    let strings = 0, nested = 0;
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.w === 's') strings++;
        else if (n.w === 'm') { nested++; walk(n.v); }
      }
    };
    walk(tree);
    return { strings, nested };
  }

  // 把树压成「字段号 → 出现次数」的直方图，用于快速判断一个包长什么样
  function histogram(tree) {
    const h = Object.create(null);
    const walk = (nodes) => {
      for (const n of nodes) {
        const k = n.f + ':' + n.w;
        h[k] = (h[k] || 0) + 1;
        if (n.w === 'm') walk(n.v);
      }
    };
    if (tree) walk(tree);
    return h;
  }

  // ---------- 容器嗅探 ----------
  // 反编译报告把 noteBundle 归成 protobuf，实测不是：它是 4 字节小端长度前缀的记录流
  // （`24 00 00 00 | 20 00 48 00 32 00 …`）。这里如实分类，别把「解析失败」说成「格式如此」。
  function sniff(input) {
    const b = toBytes(input);
    if (!b.length) return { kind: 'empty', bytes: 0 };
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return { kind: 'zip', bytes: b.length };
    // 长度前缀记录流：连续帧能否正好铺满整个 buffer
    let p = 0, frames = 0;
    while (p + 4 <= b.length) {
      const len = (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
      if (len === 0 || p + 4 + len > b.length) break;
      p += 4 + len;
      frames++;
    }
    if (frames > 0 && p === b.length) return { kind: 'lprec', frames, bytes: b.length };
    // FlatBuffers：noteBundle 实际就是它（反编译报告记成了 protobuf）。
    // 判定方式：首 4 字节是根表 uoffset，根表首字段是回指 vtable 的 soffset，
    // vtable 头部是 (vtable 字节数, 表字节数) —— 三个数同时合理才认。
    const fb = sniffFlatbuf(b);
    if (fb) return Object.assign({ kind: 'flatbuf', bytes: b.length }, fb);
    const tree = decode(b);
    if (tree) return { kind: 'protobuf', fields: tree.fields, depth: tree.depth, bytes: b.length };
    // UTF-16LE 文本（每两个字节一个可打印字符）
    let pairs = 0, printable = 0;
    for (let i = 0; i + 1 < Math.min(b.length, 512); i += 2) {
      pairs++;
      const c = b[i] | (b[i + 1] << 8);
      if (c === 9 || c === 10 || c === 13 || (c >= 0x20 && c < 0x7f)) printable++;
    }
    if (pairs && printable / pairs > 0.9) return { kind: 'utf16', bytes: b.length };
    return { kind: 'unknown', bytes: b.length };
  }

  // FlatBuffers 探针：只验结构，不解释字段（字段语义在 .fbs 里，反编译不含）
  function sniffFlatbuf(b) {
    if (b.length < 16) return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const rootOff = dv.getUint32(0, true);
    if (rootOff < 4 || rootOff + 8 > b.length) return null;
    const root = rootOff;
    const soffset = dv.getInt32(root, true);
    const vt = root - soffset;
    if (vt < 0 || vt + 4 > b.length) return null;
    const vtSize = dv.getUint16(vt, true);
    const tblSize = dv.getUint16(vt + 2, true);
    if (vtSize < 4 || vtSize % 2 || vtSize > 128) return null;
    if (tblSize === 0 || tblSize > 4096) return null;
    const fields = (vtSize - 4) / 2;
    // 抽查前两个字段的偏移是否落在表内
    let inTable = 0;
    for (let i = 0; i < Math.min(fields, 4); i++) {
      const off = dv.getUint16(vt + 4 + i * 2, true);
      if (off === 0 || (off > 0 && off < tblSize)) inTable++;
    }
    if (!inTable) return null;
    return { root, fields, tableSize: tblSize };
  }

  // ---------- ZIP（.ntb）----------
  function findEOCD(b) {
    const min = Math.max(0, b.length - 65557);
    for (let i = b.length - 22; i >= min; i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) return i;
    }
    return -1;
  }

  function listZip(b) {
    const eocd = findEOCD(b);
    if (eocd < 0) return [];
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const size = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = utf8(b.subarray(p + 46, p + 46 + nameLen));
      out.push({ name, method, compSize, size, localOff });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate-raw');
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    // Node 兜底（单测环境没有 DecompressionStream 的实现差异）
    const zlib = require('zlib');
    return new Uint8Array(zlib.inflateRawSync(Buffer.from(bytes)));
  }

  async function readZip(input) {
    const b = toBytes(input);
    const entries = listZip(b);
    if (!entries.length) throw new Error('noteproto: 不是合法的 ZIP');
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const files = Object.create(null);
    for (const e of entries) {
      if (e.name.endsWith('/') || e.size === 0) { files[e.name] = new Uint8Array(0); continue; }
      const lo = e.localOff;
      if (dv.getUint32(lo, true) !== 0x04034b50) continue;
      const nameLen = dv.getUint16(lo + 26, true);
      const extraLen = dv.getUint16(lo + 28, true);
      const start = lo + 30 + nameLen + extraLen;
      const raw = b.subarray(start, start + e.compSize);
      files[e.name] = e.method === 0 ? raw : await inflateRaw(raw);
    }
    return { entries, files };
  }

  // 读一本 .ntb：只做「结构 + 元数据」，不解析页面内容语义
  async function readNtb(input) {
    const zip = await readZip(input);
    const dec = (name) => {
      const f = zip.files[name];
      if (!f || !f.length) return null;
      try { return decode(f); } catch (_) { return null; }
    };
    const manifestRaw = zip.files['manifest.json'];
    let manifest = null;
    if (manifestRaw) { try { manifest = JSON.parse(utf8(manifestRaw)); } catch (_) {} }
    const versionRaw = zip.files['version'];
    const assets = Object.keys(zip.files).filter((n) => n.startsWith('assets/') && zip.files[n].length);
    return {
      entries: zip.entries.map((e) => ({ name: e.name, size: e.size, method: e.method })),
      version: versionRaw ? utf8(versionRaw).trim() : '',
      manifest,
      noteBundle: dec('noteBundle'),
      noteBundleKind: zip.files['noteBundle'] ? sniff(zip.files['noteBundle']).kind : '',
      assets,
      thumbnail: zip.files['thumbnail.png'] ? zip.files['thumbnail.png'].length : 0,
      bytes: toBytes(input).length,
    };
  }

  // ---------- 统计（给探针/诊断面板用的一句人话） ----------
  function describe(input) {
    const d = decode(input);
    if (!d) return '无法解析（不是 protobuf 结构）';
    return d.fields + ' 个字段 / 深度 ' + d.depth + ' / ' + d.strings + ' 个字符串 / ' + d.nested + ' 个嵌套消息 / ' + d.size + ' 字节';
  }

  return { decode, sniff, readZip, readNtb, histogram, describe, MAX_DEPTH, MAX_FIELDS };
});
