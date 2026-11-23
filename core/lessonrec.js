/* 录课（1.1.18）：把「画布画面 + 系统声音 + 麦克风」录成一个 WebM，边录边落盘。
 *
 * 为什么不用 canvas.captureStream()：
 *   老师要的是「投影仪上看到什么就录什么」——工具栏、擦除动画、放大镜、弹窗全得在画面里。
 *   captureStream 只拿得到墨迹层那一张画布，别的层全是透明的，录出来是一张黑底白线的鬼片。
 * 所以默认走 Electron 的桌面采集（getUserMedia + chromeMediaSource:'desktop'），它录的是整个屏幕。
 *
 * 为什么不用 write-file 一次性写：
 *   write-file 是「整份写一次」，一节 45 分钟的课 100 MB 以上，攒在渲染进程内存里
 *   最后一次性序列化过去，轻则卡两秒，重则 OOM。这里是每 2 秒一片、立刻交给主进程
 *   append 到文件（main.js 的 rec-begin / rec-chunk / rec-end）。
 *
 * 1.1.19 加了两条「极小体积」的路子（都在面板的「录制内容」里选）：
 *   board  —— 只录画板：把四层 canvas 合成一张，captureStream(0) + 按需 requestFrame。
 *             不含工具栏/DOM 浮层/嵌入的 PPT 与网页（那些不是 canvas，合成不到）。
 *   vector —— 只存操作流：复用 classRoom 的 op 记录（GW.commit/applyRemote/undo/redo/翻页），
 *             停止时写一份 .gewu（顶层 pages + replay 段）。四十分钟的课通常 0.3~3 MB，
 *             但只能在数理无限画布里回放，也没有声音。
 *
 * 网页版（没有 window.gewu.recFile）优雅降级：分片留在内存里（LR.last.chunks），能播能下载，
 * 探针也靠这条路径验编码器与分片管线。
 */
(function () {
  const GW = window.GW;
  if (!GW) return;

  const LR = {
    rec: null,        // 正在录的状态对象；没在录是 null
    last: null,       // 最近一次录完的结果 { path, bytes, ms, chunks, done, mode, ... }
    GAINS: { sys: 0.7, mic: 1.0 },   // 系统声压到 0.7：两边同时出声时不容易削波
    MIMES: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],

    // 1.1.19：画质档位。体积 ≈ 码率 × 时长；VP9 走 VBR，画面静止时编码器几乎不产数据
    // （probe-lessonrec 实测纯白板书 3 秒只有 3.3KB ≈ 9kbps），所以 2Mbps 是「整屏一直在动」
    // 的上限而不是常态。high 一字未改 1.1.18 的原值，升级后行为完全不变。
    //   fps  → 采集帧率（写字流畅度；板书讲解 12~15 也够看）
    //   vbps → 视频码率上限（决定最坏体积）
    //   maxH → 分辨率上限，0 = 不限制（直接交给桌面采集的 maxHeight 约束，不做 canvas 中转）
    QUALITY: {
      high: { name: '高清', fps: 30, vbps: 2_000_000, abps: 96_000, maxH: 0 },
      mid: { name: '标准', fps: 20, vbps: 1_200_000, abps: 48_000, maxH: 0 },
      small: { name: '小', fps: 15, vbps: 700_000, abps: 48_000, maxH: 1080 },
      tiny: { name: '极小', fps: 12, vbps: 450_000, abps: 48_000, maxH: 1080 },
    },

    // 1.1.19：录制内容。screen 是 1.1.18 的行为，升级后默认还是它。
    MODES: {
      screen: { name: '整屏', tip: '投影仪上看到的一切：工具栏、PPT、网页、视频都在画面里（体积最大）' },
      board: { name: '只录画板', tip: '只录板书那一块，按画面变化出帧；工具栏与嵌入的 PPT/网页不进画面（体积小）' },
      vector: { name: '操作流', tip: '只存板书操作写成 .gewu，通常几百 KB~几 MB；只能在本应用里回放，没有声音' },
    },
  };

  // 1.6.5：录课期间别让系统把机器睡过去。只挂主进程的 prevent-app-suspension
  // （跟计时器共用同一个引用计数），合盖/手动睡眠仍然照睡 —— 我们不做「阻止关机」那种事。
  let awakeOn = false;
  function keepAwake(on) {
    if (on === awakeOn) return;
    awakeOn = on;
    try { if (window.gewu && window.gewu.keepAwake) window.gewu.keepAwake(on); } catch (e) { /* 网页版没有这个桥 */ }
  }

  // F15：每次录制一个独立会话号。主进程的 rec-begin/rec-chunk/rec-end 只认「当前那一个文件」，
  // 没有会话概念；分片一旦来自别的会话就会混进别人的文件里，所以写文件前必须对一下号。
  let sidSeq = 0;
  function newSid() { sidSeq += 1; return 'r' + Date.now().toString(36) + '-' + sidSeq; }

  // 取档位：显式传入优先（探针用），否则读设置里那一档。
  // sanitize（storage.js）只按 DEFAULTS 的类型校验、不校验枚举，手改 localStorage 能塞进
  // 任意字符串 → 这里必须兜底到 high，否则 qualityOf 返回 undefined 会让 MediaRecorder 报错。
  function qualityOf(k) {
    const Q = LR.QUALITY;
    if (k != null) return Q[k] || Q.high;
    const s = GW.settings && GW.settings.recQuality;
    return Q[s] || Q.high;
  }
  function modeOf(k) {
    const M = LR.MODES;
    if (k != null) return M[k] ? k : 'screen';
    const s = GW.settings && GW.settings.recMode;
    return M[s] ? s : 'screen';
  }

  // 45 分钟的最坏体积（码率 × 时长），只给面板做提示用；实际 VBR 下多半小得多。
  function estMB(q) {
    return Math.round(((q.vbps + q.abps) * 45 * 60) / 8 / 1024 / 1024);
  }

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    for (const m of LR.MIMES) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* 老内核没这个静态方法 */ }
    }
    return '';
  }

  // 混音：系统声 × 0.7 + 麦克风 × 1.0 → 同一路输出。
  // dst 可以换成 OfflineAudioContext 的 destination —— 探针就用这条口子量峰值。
  function buildMix(ctx, sysNode, micNode, dst) {
    const gSys = ctx.createGain(); gSys.gain.value = LR.GAINS.sys;
    const gMic = ctx.createGain(); gMic.gain.value = LR.GAINS.mic;
    if (sysNode) sysNode.connect(gSys);
    if (micNode) micNode.connect(gMic);
    const out = dst || (ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null);
    if (out) { gSys.connect(out); gMic.connect(out); }
    return { dest: out, gSys, gMic };
  }

  // 桌面采集：一次 getUserMedia 同时要画面 + 系统声音（loopback 音轨是桌面源自带的）
  async function desktopStream(id, q) {
    const c = { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxFrameRate: (q && q.fps) || 30 };
    // 分辨率上限直接交给采集约束（桌面采集认 maxWidth/maxHeight），不做 canvas 中转 ——
    // 少一层全屏拷贝，书写期的 CPU 一点不动。maxWidth 给 3840 只是让「宽」不构成额外限制。
    if (q && q.maxH) { c.maxHeight = q.maxH; c.maxWidth = 3840; }
    const video = { mandatory: c };
    const audio = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id } };
    try {
      return await navigator.mediaDevices.getUserMedia({ audio, video });
    } catch (e) {
      // 这台机器/这个内核采不到系统声时只录画面 —— 宁可少一路声，也别让整堂录不了
      const s = await navigator.mediaDevices.getUserMedia({ video });
      s.__noSysAudio = true;
      return s;
    }
  }

  // 只录画板时没有视频的桌面源可借，系统声得单独再采一路（只采 audio）
  async function desktopAudio(id) {
    if (!id) return null;
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id } }, video: false,
      });
    } catch (e) { return null; }
  }

  // 麦克风单独一路：回声消除 + 降噪要开（教室里开着外放），自动增益必须关
  // （AGC 会把粉笔声也当成「太小声」往上抬，回放时声音忽大忽小）
  async function micStream(devId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: devId ? { exact: devId } : undefined,
        echoCancellation: true, noiseSuppression: true, autoGainControl: false,
      } });
    } catch (e) { return null; }
  }

  // ---------- 跨端能力探测（3.x） ----------
  // 安卓 WebView / 纯网页里 GW.isElectron 恒为 false，但落地文件这件事其实有路可走：
  //   桌面：recFile（主进程分片写盘，几 GB 也不进内存）→ 最省内存
  //   安卓：shim 的 writeFile 走 gewuNative.saveFile，直接落系统「下载」目录
  //   纯网页：<a download>
  // 注意：shim 的 userPath('录制') 返回空串，所以路径要自己兜底成「录课-xxx」的裸文件名。
  const gwFn = (k) => !!(window.gewu && typeof window.gewu[k] === 'function');
  // recFile 在桥上是个**对象**（begin/chunk/end/list），不是函数 —— 判 typeof === 'function'
  // 会对桌面也判 false，于是「录课直写文件」这条路径整条失效（分片全落内存）。
  const canRecFile = () => {
    const r = window.gewu && window.gewu.recFile;
    return !!r && typeof r.chunk === 'function' && typeof r.end === 'function';
  };
  const canWriteFile = () => gwFn('writeFile');
  async function recDir() {
    try { const d = await window.gewu.userPath('录制'); return typeof d === 'string' ? d : ''; } catch (e) { return ''; }
  }
  function joinPath(dir, name) {
    if (!dir) return name;                       // 网页 / 安卓：只有文件名，shim 会挑出 basename
    const sep = /[\\/]$/.test(dir) ? '' : (dir.indexOf('\\') >= 0 ? '\\' : '/');
    return dir + sep + name;
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  // ---------- 只录画板：四层 canvas 合成 + 按需出帧 ----------
  // 层序就是 index.html 里的 DOM 顺序（bg → ink → ann → live）。
  const LAYERS = ['bg-canvas', 'ink-canvas', 'ann-canvas', 'live-canvas'];

  function boardSource(q) {
    const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
    let dpr = 1;
    try {
      dpr = (GW.perf && GW.perf.inkDprFor)
        ? GW.perf.inkDprFor((GW.camera && GW.camera.s) || 1, vw, vh)
        : (window.devicePixelRatio || 1);
    } catch (e) { dpr = 1; }
    if (!isFinite(dpr) || dpr <= 0) dpr = 1;
    let w = Math.max(2, Math.round(vw * dpr)), h = Math.max(2, Math.round(vh * dpr));
    if (q && q.maxH && h > q.maxH) {
      const k = q.maxH / h;
      w = Math.max(2, Math.round(w * k)); h = q.maxH;
    }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      for (const id of LAYERS) {
        const el = document.getElementById(id);
        if (el && el.width) {
          try { ctx.drawImage(el, 0, 0, w, h); } catch (e) { /* 某一层还没就绪 */ }
        }
      }
    };
    draw();

    const cap = cv.captureStream ? cv.captureStream(0) : null;
    const track = cap && cap.getVideoTracks ? cap.getVideoTracks()[0] : null;
    let stopped = false, pending = false, timer = 0, frames = 0;

    const emit = () => {
      if (stopped) return;
      draw();
      frames++;
      if (track && track.requestFrame) { try { track.requestFrame(); } catch (e) { /* 轨道已经停了 */ } }
    };
    // 画面变了 → 一帧。40ms 合并抖动：写字时每个 pointermove 都会 requestRender，
    // 但真正要出的帧大约 20fps 就够（帧率这一档由变化驱动，档位里的 fps 对它不生效）。
    const bump = () => {
      if (pending || stopped) return;
      pending = true;
      timer = setTimeout(() => {
        pending = false;
        // 先强制整幅重画：拖动/缩放走的是「只改 CSS 变换」的快速通道，这时墨迹层位图
        // 还是变换前的，直接 drawImage 会录出「画面停在松手前」的录像。
        try { if (GW.requestRender) GW.requestRender(); } catch (e) { /* noop */ }
        setTimeout(emit, 16);          // 等 board 那一帧画完
      }, 40);
    };
    const off = (GW.bus && GW.bus.on) ? GW.bus.on('rendered', () => bump()) : null;
    emit();                            // 首帧立刻出：否则开头会缺一段时间轴
    // 兜底心跳：画面完全静止时也要有帧，否则视频轨的时间轴会停住，播放器里音画会错位
    const beat = setInterval(() => { if (!pending) { pending = false; emit(); } }, 1500);

    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer); clearInterval(beat);
      try { if (off) off(); } catch (e) { /* noop */ }
      try { if (track) track.stop(); } catch (e) { /* noop */ }
    };

    return { stream: cap, stop, canvas: cv, draw, bump, emit, frames: () => frames };
  }

  // ---------- 操作流 ----------
  async function startVector() {
    if (!GW.classRoom || !GW.classRoom.recStart) throw new Error('这个版本没有课堂记录模块');
    const r = GW.classRoom.recStart();
    const s = { t0: (r && r.t0) || Date.now(), mode: 'vector', vrec: r, path: '', bytes: 0, chunks: [], done: false, err: '' };
    LR.rec = s;
    GW.toast('开始录课（操作流）：只存板书操作，停下后存成 .gewu');
    return s;
  }

  async function stopVector(s) {
    s.done = true;
    s.ms = Date.now() - s.t0;
    const r = (GW.classRoom && GW.classRoom.recStop) ? GW.classRoom.recStop() : null;
    if (LR.rec === s) LR.rec = null;
    if (!r || !r.ops || !r.ops.length) { GW.toast('操作流：没录到任何板书操作'); return null; }
    const base = r.base || { cur: 0, pages: [] };
    const assets = {};
    const d = GW.doc;
    for (const [k, a] of Object.entries(d.assets || {})) assets[k] = { mime: a.mime, name: a.name, data: a.data };
    // 顶层 pages = 录制开始那一刻的板书（打开就能看见），replay.base 让 play() 独立还原
    const doc = {
      app: 'gewu-board', version: 1, savedAt: new Date().toISOString(),
      cur: base.cur || 0, build: (GW.BUILD && GW.BUILD.id) || '',
      pages: base.pages || [], assets,
      replay: { t0: r.t0, base: { cur: base.cur || 0, pages: base.pages || [] }, ops: r.ops },
    };
    let json = '';
    try { json = JSON.stringify(doc); } catch (e) { GW.toast('操作流存不下来：' + ((e && e.message) || e)); return null; }
    let p = '';
    // 操作流是 JSON 文本、几 MB 量级，各端都能直接写：桌面写进「录制」目录，
    // 安卓走 shim 的 writeFile（→ gewuNative.saveFile 落系统下载目录），纯网页走 <a download>。
    if (canWriteFile()) {
      try {
        const dir = await recDir();
        p = joinPath(dir, '录课-' + stamp() + '.gewu');
        const wrote = await window.gewu.writeFile(p, json, 'utf8');
        if (wrote === false) { p = ''; s.err = '没有写进下载目录（存储权限被拒或空间不足）'; }
      } catch (e) { p = ''; s.err = String((e && e.message) || e); }
    }
    LR.last = {
      path: p, bytes: json.length, ms: s.ms, chunks: [], done: true,
      mode: 'vector', ops: r.ops.length, json: p ? '' : json,
    };
    if (p) GW.toast('录课已保存（操作流 ' + r.ops.length + ' 步 · ' + Math.round(json.length / 1024) + ' KB）：' + p, 4200);
    else if (s.err) GW.toast('操作流写文件失败：' + s.err);
    else GW.toast('已记录 ' + r.ops.length + ' 步（' + Math.round(json.length / 1024) + ' KB，网页版没写到本地）', 3600);
    return LR.last;
  }

  // ---------- 开始 / 停止 ----------
  async function start(opts) {
    opts = opts || {};
    if (LR.rec) return LR.rec;
    const mode = modeOf(opts.mode);
    if (mode === 'vector') return startVector(opts);

    // F15：一进来就同步占住 LR.rec（starting 态）。以前 s 要等 deskSources / 采集源选择那次
    // await 之后才建，两个并发的 start 都能过上面那行 if(LR.rec) ⇒ 两个 MediaRecorder 抢同一个
    // 主进程录课文件：后一个 begin 把前一个的流关掉，第一个文件 0 片、第二个文件混进两路数据。
    const s = {
      sid: newSid(), starting: true,
      t0: Date.now(), path: '', bytes: 0, chunks: [], done: false, mime: '', q: null, mode,
      src: '', rec: null, stream: null, mic: null, ctx: null, mix: null, err: '', board: null, pending: 0,
    };
    LR.rec = s;
    try {
      const mime = pickMime();
      if (!mime) throw new Error('这个浏览器内核不支持 MediaRecorder 录制 WebM');
      s.mime = mime;
      const q = qualityOf(opts.quality);
      s.q = q;

      let src = opts.source || null;
      // 桌面才有「本机窗口/屏幕」列表可挑；安卓与网页没有这个能力，只能录画板或注入流。
      if (!src && !opts.stream && gwFn('deskSources')) {
        const list = (await window.gewu.deskSources()) || [];
        src = list.find((x) => x.isScreen) || list[0] || null;
      }
      const id = src && src.id;
      // 只录画板不需要屏幕视频源（系统声还要，所以 id 能拿到就顺手用）
      if (!opts.stream && mode !== 'board' && !id) throw new Error('没有可采集的屏幕（网页版请用桌面端录课）');
      s.src = (src && src.name) || (opts.stream ? '注入流' : mode === 'board' ? '画板' : '');
      // 1.6.7（T10）：录音时间轴 —— 每一笔落笔时记一条「相对录制起点的毫秒数」。
      // 不挂在 GW.commit 上：撤销/重做也会 commit，那样时间轴里会混进「撤销时又记了一遍」。
      s.tl = { t0: Date.now(), marks: [] };
      GW.recMark = (it) => {
        if (!s.tl || !it || !it.id) return;
        const t = Math.max(0, (it._t || Date.now()) - s.tl.t0);
        s.tl.marks.push({ id: it.id, t: t, p: GW.doc ? GW.doc.cur : 0 });
      };

      // F15：每次 await 之后确认「这个会话还是当前会话」。starting 期间被 stop() 取消、
      // 或者 LR.rec 已经被别人换掉，都直接退出，不再往主进程的录课文件里写东西。
      const guard = () => { if (s.canceled || LR.rec !== s) throw new Error('录课已取消'); };
      guard();

      let vs = opts.stream || null;
      if (!vs && mode === 'board') { s.board = boardSource(q); vs = s.board.stream; }
      else if (!vs) vs = await desktopStream(id, q);
      s.stream = vs;
      guard();   // F15：采集源等回来时可能已经被取消 / 被别的会话顶掉

      // 音频：系统声（桌面源自带）+ 麦克风，两路都要递进同一路输出，否则 MediaRecorder
      // 只会挑第一条音频轨（= 只剩系统声或只剩人声）
      let audioOut = null;
      let sysStream = null;
      const AC = window.AudioContext || window.webkitAudioContext;
      let hasSys = vs.getAudioTracks().length > 0;
      if (!hasSys && s.board && id) {
        sysStream = await desktopAudio(id);
        if (sysStream && sysStream.getAudioTracks().length) hasSys = true;
      }
      const wantMic = opts.mic !== false;
      const ms = wantMic ? await micStream(opts.micDevice) : null;
      s.mic = ms;
      guard();   // F15：麦克风授权可能要等老师点系统弹窗
      if (AC && (hasSys || ms)) {
        s.ctx = new AC();
        // resume() 要等用户手势，没有手势时这个 promise 会一直挂着。最多等 400ms，
        // 起不来就走下面的退化路径 —— 不能无限等，否则整堂课卡在这一行。
        try {
          const pr = s.ctx.resume();
          if (pr && pr.then) await Promise.race([pr.catch(() => {}), new Promise((r) => setTimeout(r, 400))]);
        } catch (e) { /* 已经是 running */ }
        if (s.ctx.state === 'running') {
          const sysNode = hasSys ? s.ctx.createMediaStreamSource(sysStream || vs) : null;
          const micNode = ms ? s.ctx.createMediaStreamSource(ms) : null;
          s.mix = buildMix(s.ctx, sysNode, micNode);
          audioOut = s.mix.dest && s.mix.dest.stream;
          // 1.6.7：麦克风电平表。借同一路输入做一个旁路 AnalyserNode（不接 dest，不影响录音），
          // 让老师在上课条上看到「到底有没有声音进来」—— 录完才发现麦克风没开太常见了。
          if (micNode) {
            try {
              s.an = s.ctx.createAnalyser();
              s.an.fftSize = 512;
              micNode.connect(s.an);
              s.anBuf = new Uint8Array(s.an.fftSize);
            } catch (e) { s.an = null; }
          }
        } else {
          // 实测：把一路「永远没有采样」的挂起音轨塞给 MediaRecorder，它会一直等，
          // 最后录出 0 字节的文件。宁可不混音，直接带原始音轨。
          try { s.ctx.close(); } catch (e) { /* noop */ }
          s.ctx = null;
          s.mix = null;
        }
      }

      const tracks = vs.getVideoTracks().slice();
      if (audioOut) tracks.push.apply(tracks, audioOut.getAudioTracks());
      else {
        tracks.push.apply(tracks, vs.getAudioTracks());
        if (sysStream) tracks.push.apply(tracks, sysStream.getAudioTracks());
      }
      const out = new MediaStream(tracks);
      s.out = out;

      // 桌面端：先开文件，再开始录（顺序反了会造成前 2 秒没地方写）
      if (canRecFile() && !opts.stream) {
        const dir = await recDir();
        s.path = joinPath(dir, '录课-' + stamp() + '.webm');
        const r0 = await window.gewu.recFile.begin(s.path);
        if (!r0 || !r0.ok) { s.err = (r0 && r0.error) || '建不了录课文件'; s.path = ''; }
        // F15：这个会话才是主进程那个文件的属主；别的会话后 begin 会把文件换掉
        else s.ownsFile = true;
      }
      guard();

      const rec = new MediaRecorder(out, {
        mimeType: mime,
        videoBitsPerSecond: q.vbps,        // 档位表见 LR.QUALITY（high = 1.1.18 的 2Mbps 原值）
        audioBitsPerSecond: q.abps,
      });
      s.rec = rec;
      let writes = Promise.resolve();
      rec.ondataavailable = (ev) => {
        if (!ev.data || !ev.data.size) return;
        s.pending++;
        writes = writes.then(async () => {
          const buf = await ev.data.arrayBuffer();
          const u8 = new Uint8Array(buf);
          s.bytes += u8.length;
          // 只有桌面能把分片直接追加进文件（几 GB 也不进内存）。安卓 / 网页没有 recFile，
          // 分片只能留在内存里 —— 所以绝不在这里转 base64 走 writeFile（GB 级会直接炸掉标签页），
          // 停止后由面板上的「下载这段录课」一次性拼 Blob 交给浏览器 / 系统下载器。
          // F15：只有「本次 begin 成功」的会话才准往主进程那个文件里追加。
          // 没有 ownsFile 的会话（被顶掉的、被取消的）一律留在内存，避免把别人的录课写坏。
          if (s.path && canRecFile() && s.ownsFile) {
            const result = await window.gewu.recFile.chunk(u8);
            if (!result || !result.ok) throw new Error((result && result.error) || '录课分片写入失败');
          } else {
            s.chunks.push(u8);            // 安卓 / 网页 / 探针：留在内存
          }
        }).catch((err) => { s.err = s.err || String((err && err.message) || err); })
          .finally(() => { s.pending--; });
      };
      rec.onstop = async () => {
        s.done = true;
        s.ms = Date.now() - s.t0;
        // 按事件顺序写完所有分片，再关闭文件；慢磁盘也不能截断最后一片。
        await writes;
        let res = null;
        // F15：只关自己那个文件。主进程 rec-end 关的是「当前打开的文件」，
        // 被顶掉的会话在这里调 end() 会把别人正在写的录课掐断。
        if (s.path && canRecFile() && s.ownsFile) {
          try {
            res = await window.gewu.recFile.end();
            if (!res || !res.ok) s.err = s.err || (res && res.error) || '录课文件收尾失败';
          } catch (e) { s.err = s.err || String((e && e.message) || e); }
        }
        // 数据都收完了才关轨道 —— 先关轨道（哪怕只早一个 tick）会让最后一片丢掉，
        // 「只录画板」那种按需出帧的流尤其明显：实测 1.8 秒的课会录出 0 字节。
        closeQuiet(s);
        LR.last = { path: s.path, bytes: (res && res.bytes) || s.bytes, ms: s.ms, chunks: s.chunks, done: true, err: s.err, mixed: !!s.mix, mode: s.mode };
        // F15：只清自己这一份（并发时后来的会话可能已经占住 LR.rec）
        if (LR.rec === s) LR.rec = null;
        GW.recMark = null;
        // 1.6.7（T10）：把时间轴写到视频旁边（同名 .tl.json）。写不进也不影响录课本身。
        if (s.path && s.tl) {
          try {
            const tlPath = s.path.replace(/\.webm$/i, '.tl.json');
            const tl = { v: 1, t0: s.tl.t0, startedAt: new Date(s.tl.t0).toISOString(), ms: s.ms, marks: s.tl.marks };
            if (window.gewu && window.gewu.writeFile) await window.gewu.writeFile(tlPath, JSON.stringify(tl), 'utf8');
            s.tlPath = tlPath;
            LR.last.tlPath = tlPath;
            LR.last.marks = s.tl.marks.length;
          } catch (e) { s.err = s.err || ('时间轴没写成：' + String((e && e.message) || e)); }
        }
        keepAwake(false);
        if (s.err) GW.toast('录课失败：' + s.err);
        else if (s.path) GW.toast('录课已保存：' + s.path, 3800);
        else GW.toast('录课已停止（' + Math.round(s.ms / 1000) + ' 秒，' + Math.round(s.bytes / 1024) + ' KB）', 3200);
      };
      keepAwake(true);                    // 1.6.5：录课期间防挂起。停止 / 失败 / 兜底都会放掉
      rec.start(2000);                    // 每 2 秒一片：掉电最多丢 2 秒
      s.starting = false;
      GW.toast('开始录课' + (s.src ? '：' + s.src : '') + (ms ? '（含麦克风）' : '') + '，再点一次停止');
      return s;
    } catch (err) {
      // F15：只能清掉「自己这一份」；被顶掉/被取消的会话不能把后来者的 LR.rec 抹成 null
      if (LR.rec === s) LR.rec = null;
      GW.recMark = null;
      keepAwake(false);
      s.err = String((err && err.message) || err);
      s.starting = false;
      closeQuiet(s);
      // F15：老师在启动途中点「停止」= 正常取消，不该再弹一条「录课失败」
      if (s.canceled) return null;
      throw err;
    }
  }

  function closeQuiet(s) {
    try { if (s.board) s.board.stop(); } catch (e) { /* noop */ }
    try { if (s.rec && s.rec.state !== 'inactive') s.rec.stop(); } catch (e) { /* 已经停了 */ }
    try { if (s.out) for (const t of s.out.getTracks()) t.stop(); } catch (e) { /* noop */ }
    try { if (s.mic) for (const t of s.mic.getTracks()) t.stop(); } catch (e) { /* noop */ }
    try { if (s.ctx) s.ctx.close(); } catch (e) { /* noop */ }
    keepAwake(false);                   // 1.6.5：兜底放掉防挂起（onstop 没触发也不会一直挂着）
    s.out = null; s.mic = null; s.ctx = null; s.board = null;
  }

  function stop() {
    const s = LR.rec;
    if (!s) return null;
    // F15：还在 starting（采集源 / 麦克风授权还没回来）就点了停止 —— 打上取消标记并立刻释放，
    // 让 start() 里每个 await 之后的 guard() 抛出去；否则它会接着建 MediaRecorder 并录一整段。
    if (s.starting) {
      s.canceled = true;
      if (LR.rec === s) LR.rec = null;
      GW.recMark = null;
      closeQuiet(s);
      keepAwake(false);
      return s;
    }
    if (s.mode === 'vector') { stopVector(s).catch(() => {}); return s; }
    try { s.rec.stop(); } catch (e) { /* 已经停了 */ }
    // 轨道等 onstop 之后再关：先关轨道会让最后一片数据拿不到（正常路径在 rec.onstop 里关，
    // 这里只是 onstop 万一没触发的兜底）
    setTimeout(() => { if (!s.done) closeQuiet(s); }, 3000);
    return s;
  }

  // ---------- 界面 ----------
  function panel() {
    const body = GW.h('div', { style: 'padding:4px 0;font-size:13px;line-height:1.9' });
    const stat = GW.h('div', { style: 'color:#5a6472' });
    const row = GW.h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px' });
    // 1.1.19：画质档位行。录制中不许改（MediaRecorder 的码率是构造时定死的）。
    const qRow = GW.h('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' });
    const qTip = GW.h('div', { style: 'color:#8a94a3;font-size:12px' });
    // 1.1.19：录制内容（整屏 / 只录画板 / 操作流）
    const mRow = GW.h('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px' });
    const mTip = GW.h('div', { style: 'color:#8a94a3;font-size:12px' });

    const paintQ = () => {
      const cur = qualityOf(null), mode = modeOf(null);
      qRow.textContent = '';
      qRow.append(GW.h('span', { style: 'color:#5a6472' }, '画质：'));
      for (const k in LR.QUALITY) {
        const q = LR.QUALITY[k];
        const b = GW.h('button', { class: 'gw-btn' }, q.name);
        if (q === cur) b.setAttribute('style', 'background:#1b2433;color:#fff');
        b.onclick = () => {
          if (LR.rec) return GW.toast('录课中不能改画质，先停下');
          GW.settings.recQuality = k;
          if (GW.saveSettings) GW.saveSettings();
          paintQ(); refresh();
        };
        qRow.append(b);
      }
      qTip.textContent = mode === 'vector'
        ? '操作流不按码率算：45 分钟的板书操作通常 0.3~3 MB（取决于笔数）'
        : '45 分钟约 ' + estMB(cur) + ' MB（最坏值；板书静止时小得多）';
    };
    const paintM = () => {
      const cur = modeOf(null);
      mRow.textContent = '';
      mRow.append(GW.h('span', { style: 'color:#5a6472' }, '录制内容：'));
      for (const k in LR.MODES) {
        const m = LR.MODES[k];
        const b = GW.h('button', { class: 'gw-btn' }, m.name);
        if (k === cur) b.setAttribute('style', 'background:#1b2433;color:#fff');
        b.onclick = () => {
          if (LR.rec) return GW.toast('录课中不能改录制内容，先停下');
          GW.settings.recMode = k;
          if (GW.saveSettings) GW.saveSettings();
          paintM(); paintQ(); refresh();
        };
        mRow.append(b);
      }
      mTip.textContent = LR.MODES[cur].tip;
    };
    const refresh = () => {
      const s = LR.rec;
      if (s) {
        const sec = Math.round((Date.now() - s.t0) / 1000);
        if (s.mode === 'vector') {
          const n = (s.vrec && s.vrec.ops && s.vrec.ops.length) || 0;
          stat.textContent = '正在录课（操作流）：' + sec + ' 秒 · 已记 ' + n + ' 步';
        } else {
          stat.textContent = '正在录课' + (s.mode === 'board' ? '（只录画板）' : '') + '：' + sec + ' 秒 · ' + (s.path || '（内存）') + ' · ' + Math.round(s.bytes / 1024) + ' KB';
        }
      } else if (LR.last) {
        const l = LR.last;
        stat.textContent = '上次录课' + (l.mode === 'vector' ? '（操作流 ' + (l.ops || 0) + ' 步）' : l.mode === 'board' ? '（只录画板）' : '')
          + '：' + Math.round((l.ms || 0) / 1000) + ' 秒 · ' + Math.round((l.bytes || 0) / 1024) + ' KB' + (l.path ? ' · ' + l.path : '');
      } else {
        const m = modeOf(null);
        stat.textContent = '还没有录过。当前录的是' + LR.MODES[m].name
          + (m === 'screen' ? '（含工具栏）' : m === 'board' ? '（不含工具栏与嵌入的 PPT/网页）' : '（不含声音，只能在本应用里回放）')
          + '，声音可含系统声与麦克风。';
      }
    };
    const mk = (label, fn) => { const b = GW.h('button', { class: 'gw-btn' }, label); b.onclick = () => { Promise.resolve(fn()).catch((e) => GW.toast('录课失败：' + ((e && e.message) || e), 3200)); refresh(); }; row.append(b); };
    mk(LR.rec ? '停止录课' : '开始录课', () => (LR.rec ? stop() : start()));
    // 跨端兜底：没有 recFile（安卓 / 网页）时录课只在内存里，必须留一个能把它取出画布的口子，
    // 否则「录完了拿不走」= 静默丢数据。桌面有落盘路径时不显示这个按钮。
    const lastChunks = LR.last && LR.last.chunks;
    if (LR.last && !LR.last.path && lastChunks && lastChunks.length) {
      mk('下载这段录课', () => {
        const parts = lastChunks;
        const blob = new Blob(parts, { type: LR.last.mime || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = GW.h('a', { href: url, download: '录课-' + stamp() + '.webm' });
        document.body.append(a);
        a.click();
        a.remove?.();
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) { /* 已释放 */ } }, 4000);
        GW.toast('已交给浏览器下载：' + Math.round(blob.size / 1024) + ' KB', 3200);
      });
    }
    mk('打开录课文件夹', async () => {
      // 只有桌面主进程能开系统文件夹；安卓 / 网页没有这个能力，就把话说清楚（而不是静默点了没反应）。
      if (!gwFn('userPath') || !gwFn('showInFolder')) {
        return GW.toast('这台设备没有「打开文件夹」这个入口：桌面版会存进「录制」文件夹，安卓与网页版请用右侧的「下载这段录课」', 4200);
      }
      const p = await recDir();
      if (p) window.gewu.showInFolder(p);
      else GW.toast('这台设备没有可打开的录制文件夹，请用「下载这段录课」', 3600);
    });
    body.append(stat, qRow, qTip, mRow, mTip, row);
    paintQ(); paintM();
    refresh();
    const t = setInterval(refresh, 1000);
    GW.dialog({
      title: '录课（画面 + 声音 → WebM / 操作流 → .gewu）', width: 560, body, noFooter: true,
      onClose: () => clearInterval(t),
    });
  }

  LR.start = start;
  LR.stop = stop;
  LR.panel = panel;
  LR.buildMix = buildMix;
  LR.pickMime = pickMime;
  LR.state = () => LR.rec;
  // 1.6.7：麦克风电平 0..1（RMS）。没在录、没混音、没有 AnalyserNode 时恒为 0。
  LR.level = function () {
    const s = LR.rec;
    if (!s || !s.an || !s.anBuf) return 0;
    try {
      s.an.getByteTimeDomainData(s.anBuf);
      let sum = 0;
      for (let i = 0; i < s.anBuf.length; i++) {
        const v = (s.anBuf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / s.anBuf.length) * 3.2);   // ×3.2：正常说话落在 0.3~0.7
    } catch (e) { return 0; }
  };
  LR.qualityOf = qualityOf;
  LR.modeOf = modeOf;
  LR.estMB = estMB;
  LR.boardSource = boardSource;
  LR.startVector = startVector;
  LR.stopVector = stopVector;
  GW.lessonRec = LR;
})();
