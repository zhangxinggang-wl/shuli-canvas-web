/* 数理无限画布 · 构建指纹与身份校验（core/build.js）
 *
 * 解决的问题：免费包被人改掉打赏二维码 / 免费声明后拿出去卖。
 * 离线客户端挡不住改，但可以做到「改不干净、一眼可辨」——
 * 身份文案与两个二维码文件的 sha256 用私钥签过，启动时用内嵌公钥验签：
 *   · 官方包：验签通过、二维码哈希对得上 → 什么提示都没有（不影响正常使用）
 *   · 被改过：顶栏出现一条红色提示 + 一次 toast，导出物与 .gewu 里也带着构建指纹，便于追查
 *
 * 数据来源是自动生成的 src/core/build-data.js（见 scripts/sign-content.js），
 * 本文件只负责读它、验它、把结论说出来，不自己编内容。
 */
(function () {
  const D = GW.BUILD_DATA || {};
  const B = D.build || {};
  const ID = D.identity || null;
  const ver = B.version || GW.APP_VERSION || '1.0';

  let payload = null;
  // 被签名的原文是一张定死的 JSON 字符串；解析失败说明 build-data.js 被改坏了，
  // 这时宁可当作「验不了」，也不要让整个应用起不来。
  if (ID && typeof ID.data === 'string') { try { payload = JSON.parse(ID.data); } catch (e) { payload = null; } }
  const ident = (payload && payload.identity) || {};

  GW.BUILD = {
    id: B.id || ('gewu-' + ver + '-local'),
    version: ver,
    date: B.date || '',
    channel: B.channel || 'dev',
    author: ident.author || '',
    group: ident.group || '',
    antiPiracy: ident.antiPiracy || '',
    // 任务书 §五.6：同版本不同内容 —— 构建号只含版本/日期/渠道，内容指纹才是「这一份」的唯一身份。
    // 它由 scripts/sign-content.js 算进签名载荷（改一个字符就变），这里只负责显示与记录。
    content: B.content || '',
    contentShort: B.contentShort || (B.content || '').slice(0, 12),
    contentFiles: B.contentFiles || 0,
    stamp: '数理无限画布 v' + ver + ' · ' + (B.id || 'local')
      + (B.contentShort ? ' · 内容 ' + B.contentShort : ''),
  };
  GW.IDENT = payload;                      // { build, identity, assets }，没签过就是 null
  // 界面文案的唯一来源（签名里说什么就显示什么）；缺字段时才退回调用方给的默认值
  GW.ident = function (key, dflt) {
    const v = ident[key];
    return v === undefined || v === null || v === '' ? dflt : v;
  };

  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) || null;

  function b64bytes(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function hex(buf) {
    const u8 = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16);
    return s;
  }
  // 二维码的真实字节：直接按同源资源取（开发态是 file://，应用里是 app://gewu/，
  // 打包后是 asar 里的同一份文件）—— 比绕 readFile 要绝对路径可靠，headless 里也能验。
  async function sha256Url(rel) {
    if (!subtle) return { unknown: '本环境没有 WebCrypto' };
    let buf;
    try {
      const r = await fetch(new URL(rel, location.href).href);
      if (!r.ok) return { unknown: '取不到 ' + rel + '（HTTP ' + r.status + '）' };
      buf = await r.arrayBuffer();
    } catch (e) { return { unknown: '取不到 ' + rel }; }
    const d = await subtle.digest('SHA-256', buf);
    return { hex: hex(d), bytes: buf.byteLength };
  }

  // 验签：公钥对「逐字节的原文」验证 ECDSA P-256 / SHA-256
  async function verifySig() {
    if (!ID || !ID.pub || !ID.sig || typeof ID.data !== 'string') return { state: 'unknown', why: '缺少签名数据' };
    if (!subtle) return { state: 'unknown', why: '本环境没有 WebCrypto' };
    try {
      const key = await subtle.importKey('jwk', ID.pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key,
        b64bytes(ID.sig), new TextEncoder().encode(ID.data));
      return ok ? { state: 'ok' } : { state: 'tampered', why: '身份签名验不过' };
    } catch (e) {
      return { state: 'tampered', why: '签名数据被改坏（' + (e && e.name ? e.name : '解析失败') + '）' };
    }
  }
  // 二维码文件的真实字节哈希，必须和签名里声明的一致 —— 换掉打赏图就会在这里露出来
  async function verifyAssets() {
    const want = (payload && payload.assets) || {};
    const keys = Object.keys(want);
    if (!keys.length) return { state: 'unknown', why: '签名里没有二维码文件', list: [] };
    const list = [];
    for (const k of keys) {
      const r = await sha256Url(want[k].file);
      if (r.unknown) { list.push({ key: k, state: 'unknown', why: r.unknown }); continue; }
      list.push({ key: k, file: want[k].file, state: r.hex === want[k].sha256 ? 'ok' : 'tampered', got: r.hex });
    }
    if (list.some((x) => x.state === 'tampered')) return { state: 'tampered', why: '二维码文件与官方发布不一致', list: list };
    if (list.some((x) => x.state === 'unknown')) return { state: 'unknown', why: '二维码文件读不到', list: list };
    return { state: 'ok', list: list };
  }

  let pending = null;
  GW.buildVerify = verifySig;          // 单项验签（探针做反向对照用）
  GW.buildCheckAssets = verifyAssets;  // 单项查二维码哈希（同上）
  // 界面只用缓存；传 { refresh: true } 会丢掉缓存重验一遍
  GW.buildStatus = function (opts) {
    if (pending && !(opts && opts.refresh)) return pending;
    pending = (async () => {
      const sig = await verifySig();
      const assets = await verifyAssets();
      const st = { state: 'ok', sig: sig, assets: assets, text: '' };
      if (sig.state === 'tampered' || assets.state === 'tampered') st.state = 'tampered';
      else if (sig.state === 'unknown' || assets.state === 'unknown') st.state = 'unknown';
      if (st.state === 'tampered') {
        st.text = '⚠ 本程序的身份信息与官方发布不一致（可能被人改过）。' +
          (GW.BUILD.group ? '官方 QQ 交流群：' + GW.BUILD.group + '。' : '') +
          (GW.BUILD.antiPiracy || '本软件完全免费：凡是花钱买来的，都不是官方版本。');
      }
      const mm = [];
      if (sig.state === 'tampered') mm.push(sig.why);
      if (assets.state === 'tampered') mm.push(assets.why);
      st.why = mm.join('；');
      GW.bus.emit('build-check', st);
      if (st.state === 'tampered') {
        if (GW.onBuildTampered) GW.onBuildTampered(st);
        else console.warn('[build] ' + st.text);
      }
      return st;
    })();
    return pending;
  };
  // 二维码图片的路径也从签名内容里取（换了图就得重新签名，正好互相绑定）
  GW.assetPath = function (key, dflt) {
    const a = (payload && payload.assets && payload.assets[key]) || null;
    return a && a.file ? a.file : dflt;
  };
  // 校验结果里那条「构建 xxx」的短句，界面与导出复用
  GW.buildLine = function () {
    const ch = GW.BUILD.channel && GW.BUILD.channel !== 'official' ? '（渠道 ' + GW.BUILD.channel + '）' : '';
    // §五.6：带上内容指纹前 12 位。同版本同日期不同源码的两份包，这一行必须不一样。
    const ct = GW.BUILD.contentShort ? ' · 内容 ' + GW.BUILD.contentShort : '';
    return '构建 ' + GW.BUILD.id + ch + ct;
  };
  // 右下角来源水印的文案：导出物（SVG/PDF）与课堂「区域截图」共用这一条，
  // 文案本身在签名内容里（identity.json 的 watermark），改了就会被验签抓出来。
  GW.watermarkText = function () {
    return ident.watermark || '唐波 · 数理无限画布（免费）· QQ群 979985385';
  };
  // 把来源水印画在 canvas 的右下角（截图用）。字号随画布宽度自适应，
  // 配一圈白色描边，保证压在深色墨迹或复杂截图上一样看得清。
  // 返回是否画上了；设置里关掉「导出物水印」时返回 false（不影响功能）。
  GW.watermarkCanvas = function (cv, opts) {
    opts = opts || {};
    if (GW.settings && GW.settings.exportWatermark === false) return false;
    const c = (cv && typeof cv.getContext === 'function') ? cv.getContext('2d') : cv;
    if (!c || !cv || !cv.width || !cv.height) return false;
    const text = opts.text || GW.watermarkText();
    const fs = Math.max(11, Math.round(cv.width * 0.012));
    const pad = Math.round(fs * 0.8);
    c.save();
    c.font = '400 ' + fs + 'px sans-serif';
    c.textAlign = 'right';
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(2, Math.round(fs / 4));
    c.strokeStyle = 'rgba(255,255,255,0.88)';
    c.strokeText(text, cv.width - pad, cv.height - pad);
    c.fillStyle = 'rgba(46,46,46,0.85)';
    c.fillText(text, cv.width - pad, cv.height - pad);
    c.restore();
    return true;
  };
})();
