/* 手机投屏（渲染层）：接收端
 *
 * 协议唯一真源：docs/notes/2.2.0-01-phonecast-protocol.md
 *
 * 这一层只做三件事：
 *   1. 打开面板：让主进程起 HTTPS 信令服务，把配对码画成二维码（也能复制成文本贴到手机）；
 *   2. 收视频：Chromium 自己的 RTCPeerConnection 收手机发来的那条 sendonly 视频轨，
 *      ontrack 之后把流挂到 <video>，放进临时视图层 #pc-view；
 *   3. 管画面：拖动 / 缩放 / 铺满 / 停止。
 *
 * 为什么是「临时视图层」而不是画布对象：这块画面是实时视频，不能被保存、撤销、导出，
 * 也不能跟着 LAN 协同广播出去。做成 #stage 之外的 fixed 层天然满足 —— 它不在 items 里，
 * serialize() 看不见它，exportSVG/exportPDF 只遍历 items，协同只发 op 与快照。
 *
 * 为什么不能用 deskcanvas.js 那套（把帧画进画布背景层）：那是 8fps 的抓帧重绘，
 * 手机投屏要的是 24fps 的实时视频与音频/延迟体验，抓帧会把 WebRTC 的意义抹掉。
 */
(function () {
  const GW = window.GW;

  // 只有 Electron 主进程里有信令服务；网页/移动网页打开时连按钮都不该出现
  const hasHost = () => !!(window.gewu && window.gewu.phonecast);

  const S = {
    state: 'idle',        // idle | pairing | waiting-confirm | connecting | playing | error | stopped
    sid: '',
    source: '',           // screen | camera
    streamId: '',
    error: '',
    info: null,
    sessions: [],
    video: { w: 0, h: 0 },
    since: 0,
    startedAt: 0,
  };

  let pc = null;
  let videoEl = null;
  let pendingIce = [];
  let lastSeq = 0;
  let hbTimer = null;
  let watchdog = null;
  let lastPeerMsg = 0;
  // CAST-B：端到端延迟必须用**同一个时钟**实测。
  // 原来手机心跳带手机时钟、桌面心跳带桌面时钟，两边各自自增、谁也没回给谁，
  // 直接相减得到的是两台机器的时钟差（可能上千毫秒），不是延迟。
  // 现在：桌面发 heartbeat 时带上自己的 t，手机原样回一条 heartbeat-ack，
  // 桌面用本地 now - 原样的 t 得到一次真实往返（含信令与解码）。
  let unsub = null;
  let panel = null;
  let view = null;
  let viewBox = { x: 0, y: 0, w: 0, h: 0 };
  let fillMode = false;
  let confirmSid = '';

  // CAST-03：把「连接建立」和「第一帧到达」拆成两件事。
  // 日志里出现过「connectionState=connected、接收尺寸 0x0」持续几十秒的情况：
  // 那时面板已经写「正在接收」，用户看到的却是黑屏。两者必须分开报。
  // 单时钟往返：最近一次实测的端到端延迟（毫秒），null = 还没测到
  let e2eMs = null;
  let e2eN = 0;
  let firstFrameAt = 0;
  let firstFrameTimer = null;
  let connectedAt = 0;
  const FIRST_FRAME_TIMEOUT = 8000; // 连接成功后 8 秒还没有一帧，就不再等了
  const MAX_FRAME_RECOVER = 1;      // 首帧恢复只自动重试 1 次，再失败就把原因交给用户
  let frameRecover = 0;

  const TICK_MS = 1000;
  const PEER_TIMEOUT = 10000;    // 协议：10 秒无消息即判断开
  const CONNECT_TIMEOUT = 20000; // 发起协商后 20 秒还没 ontrack 判超时（AP 隔离最常见）

  const h = (tag, attrs, ...kids) => GW.h(tag, attrs || {}, ...kids);

  // ---------------- 状态文案 ----------------
  const TEXT = {
    idle: '未开始',
    pairing: '等待手机扫码',
    'waiting-confirm': '等待你在电脑上确认',
    connecting: '正在连接…',
    'waiting-frame': '已连接，等待画面…',
    playing: '正在接收',
    error: '连接失败',
    stopped: '已停止',
  };
  const ERR_TEXT = {
    expired: '配对码已过期，请在电脑上点「换一张」重新扫',
    cert: '证书不符：手机上的这个二维码不是本机生成的',
    rejected: '手机端被拒绝或被电脑端拒绝',
    perm: '手机系统权限被取消（录屏/相机授权）',
    timeout: '连接超时，可能是两台设备不在同一个局域网，或路由器开了 AP 隔离',
    busy: '设备被占用：摄像头被别的应用占着',
  };

  const setState = (s, err) => {
    // err 只在「显式给了理由」时才动 S.error。teardown() 是「先写 S.error、再调 setState(S.error?'error':'stopped')」，
    // 老写法会用 undefined 把刚写好的失败文案清成空串 —— 面板上只剩「连接失败」四个字，没有原因。
    if (err !== undefined) S.error = err ? (ERR_TEXT[err] || err) : '';
    else if (s !== 'error') S.error = '';
    S.state = s;
    renderPanel();
  };

  // 2.2.5 排障：渲染层的失败以前只写进 S.error（面板红字），主进程日志里一行都没有，
  // 于是「配对成功 → 手机发了 offer → 之后再没动静」这种故障无从定位。
  // console.warn 会被 main/main.js:335 的 console-message 钩子按 WARN 级别写进日志文件。
  // OBS-A：三级分开。以前只有 console.warn 一条路（console-message 钩子只在 level>=2 时落盘），
  // 于是「接收质量 / 发送质量」这种**正常情况下每 5 秒一条**的采样全被记成 WARN，
  // 日志里真 WARN 被彻底埋掉。现在走 window.gewu.pageLog，级别由调用点决定：
  //   dl()        —— 采样/进展，INFO
  //   dlw()       —— 真需要注意但不致命，WARN
  //   dle()       —— 错误，ERR
  // 没有 pageLog 桥（网页端/老版本）时退回 console.warn，行为与以前一致，不会丢日志。
  const pageLog = (lv, text) => {
    try {
      if (window.gewu && typeof window.gewu.pageLog === 'function') { window.gewu.pageLog(lv, text); return; }
      console.warn(text);
    } catch (e) { /* 控制台没了 */ }
  };
  const dl = (tag, extra) => pageLog('INFO', '[phonecast] ' + tag + (extra ? ' · ' + extra : ''));
  const dlw = (tag, extra) => pageLog('WARN', '[phonecast] ' + tag + (extra ? ' · ' + extra : ''));
  const dle = (tag, extra) => pageLog('ERR', '[phonecast] ' + tag + (extra ? ' · ' + extra : ''));

  // ---------------- 与主进程/手机的管道 ----------------
  const send = (type, payload, streamId) => {
    if (!S.sid || !hasHost()) return;
    S.since++;
    const msg = { v: 1, sid: S.sid, streamId: streamId || S.streamId || '', seq: S.since, type: type, payload: payload || {} };
    try { window.gewu.phonecast.send(S.sid, msg); } catch (e) { /* 服务已关 */ }
  };

  const closePeer = () => {
    clearInterval(hbTimer); hbTimer = null;
    clearInterval(statsTimer); statsTimer = null; statsPrev = null;
    clearTimeout(watchdog); watchdog = null;
    clearTimeout(firstFrameTimer); firstFrameTimer = null;
    firstFrameAt = 0;
    connectedAt = 0;
    frameRecover = 0;
    if (pc) {
      try { pc.ontrack = null; pc.onicecandidate = null; pc.onconnectionstatechange = null; } catch (e) { /* 已关 */ }
      try { pc.close(); } catch (e) { /* 已关 */ }
      pc = null;
    }
    pendingIce = [];
    if (view && view.video) {
      // 先 pause 再置空：play() 返回的 promise 还在路上时直接换 srcObject，
      // Chromium 会抛 "The play() request was interrupted by a new load request"（2.2.5 日志里的 AbortError）。
      try { view.video.pause(); } catch (e) { /* 本来就没在播 */ }
      try { view.video.srcObject = null; } catch (e) { /* 已移除 */ }
    }
  };

  // CAST-02/CAST-04：把「实际收到的画质」写进日志。
  //
  // 原来的写法有两个口径错误：
  //   1) 5 秒采一次，还要靠 decodeFrameRate ?? framesDecoded —— 后者是**累计**解码帧数，
  //      取不到 decodeFrameRate 时日志里就会一路显示 37、120、480… 用户看到「解码=480」以为很好，
  //      其实那只是开播到现在一共解了多少帧。
  //   2) 丢包 / 抖动 取的是累计值与瞬时值混着看，没法判断「这一秒」发生了什么。
  //
  // 现在：1 秒采样，全部用「与上一秒的差分」算，累计量只用于展示；RTT 从 candidate-pair 取。
  let statsTimer = null, statsPrev = null;
  const STAT_MS = 1000;
  const STAT_LOG_EVERY = 5;

  const pickVideo = (list) => {
    let v = null;
    list.forEach((r) => { if (r.type === 'inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) v = r; });
    return v;
  };

  // RTT 只能在 candidate-pair / remote-inbound 里找：inbound-rtp 没有这一项，
  // 旧代码去 inbound-rtp 里摸 currentRoundTripTime，永远是 undefined。
  const pickRtt = (list) => {
    let rtt = -1;
    let cp = null;
    list.forEach((r) => {
      if (r.type === 'candidate-pair' && (r.state === 'succeeded' || r.selected || r.nominated)) cp = r;
      if (r.type === 'remote-inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video') && r.roundTripTime != null) {
        rtt = Math.round(Number(r.roundTripTime) * 1000);
      }
    });
    if (cp && cp.currentRoundTripTime != null) rtt = Math.round(Number(cp.currentRoundTripTime) * 1000);
    return { rtt: rtt, cp: cp };
  };

  const codecOf = (list, v) => {
    let cmime = '?';
    list.forEach((r) => { if (r.type === 'codec' && r.id === v.codecId) cmime = String(r.mimeType || '?'); });
    return cmime;
  };

  /** CAST-08：诊断限频。连续失败时只保留前 3 条与每 20 秒一条，避免刷爆日志。 */
  let diagTimes = [];
  const diagRateOk = () => {
    const now = Date.now();
    diagTimes = diagTimes.filter((t) => now - t < 60000);
    if (diagTimes.length < 12) { diagTimes.push(now); return true; }
    return now - diagTimes[diagTimes.length - 1] > 20000;
  };

  /** CAST-03：首帧超时要把「到底卡在哪一层」一次性打全，否则日志里只剩一句「没画面」。 */
  const dumpDiag = (why) => {
    if (!diagRateOk()) return;
    const head = 'PC诊断(' + why + ')';
    if (!pc) { dl(head, 'pc=null'); return; }
    const v0 = view && view.video ? view.video : null;
    const base = 'connection=' + pc.connectionState +
      ' ice=' + pc.iceConnectionState +
      ' gathering=' + pc.iceGatheringState +
      ' signaling=' + pc.signalingState +
      ' stream=' + (S.streamId || '?') +
      ' 源=' + (S.source || '?');
    Promise.resolve(pc.getStats()).then((list) => {
      const v = pickVideo(list);
      const r = pickRtt(list);
      const cp = r.cp;
      const frames = v ? Number(v.framesDecoded) || 0 : -1;
      const received = v ? Number(v.framesReceived) || 0 : -1;
      const dropped = v ? Number(v.framesDropped) || 0 : -1;
      const jb = (v && v.jitterBufferEmittedCount && v.jitterBufferDelay)
        ? Math.round(Number(v.jitterBufferDelay) / Number(v.jitterBufferEmittedCount) * 1000) : -1;
      dl(head, base +
        ' 解码帧=' + frames + ' 收到帧=' + received + ' 丢帧=' + dropped +
        ' 包=' + (v ? Number(v.packetsReceived) || 0 : -1) +
        ' 丢包=' + (v ? Number(v.packetsLost) || 0 : -1) +
        ' 抖动=' + (v ? Math.round((Number(v.jitter) || 0) * 1000) + 'ms' : -1) +
        ' 码率=' + (v ? Math.round((Number(v.bytesReceived) || 0) * 8 / Math.max(1, (Date.now() - (connectedAt || Date.now())) / 1000) / 1000) + 'kbps' : '-') +
        ' 缓冲=' + (jb >= 0 ? jb + 'ms' : '?') +
        ' RTT=' + (r.rtt >= 0 ? r.rtt + 'ms' : '?') +
        ' 通道=' + (cp ? String(cp.localCandidateId || '?') + '→' + String(cp.remoteCandidateId || '?') : '?') +
        ' 元素=' + (v0 ? (v0.videoWidth + 'x' + v0.videoHeight + ' ready=' + v0.readyState + ' paused=' + v0.paused) : '无'));
    }).catch((e) => { dlw(head, base + ' stats失败=' + (e && e.message)); });
  };

  // CAST-04：getStats 里的累计量一律先差分再读，缺字段记 null（日志写 '?'），
  // 负差（换流 / 计数器回绕）钳成 0 —— 老代码拿 freezeCount 直接当「冻结」，
  // 而 freezeCount 的语义是**累计解冻次数**，不是秒数。
  const nnum = (x) => (x === undefined || x === null || x === '' || isNaN(Number(x)) ? null : Number(x));
  const dlt = (a, b) => (a === null || b === null ? null : Math.max(0, a - b));
  // OBS-A：毫秒数保留 1 位小数。解码耗时正常就是 0.3~0.9ms/帧，Math.round 会把它一律写成 0ms，
  // 看起来像「解码不要时间」；同理抖动缓冲 14.6ms 也不该被四舍五入成 15。
  const msText = (ms) => (Math.abs(ms) >= 10 ? String(Math.round(ms)) : (Math.round(ms * 10) / 10).toFixed(1));

  const startStats = () => {
    clearInterval(statsTimer);
    statsPrev = null;
    let n = 0;
    statsTimer = setInterval(() => {
      if (!pc || (S.state !== 'playing' && S.state !== 'waiting-frame')) { clearInterval(statsTimer); statsTimer = null; return; }
      Promise.resolve(pc.getStats()).then((list) => {
        const v = pickVideo(list);
        if (!v) return;
        const now = Date.now();
        // 代次 = report id + ssrc：换了流就重置基线，否则累计量差分出来的全是垃圾。
        const gen = String(v.id || '') + '|' + String(v.ssrc || '');
        const bytes = nnum(v.bytesReceived);
        const frames = nnum(v.framesDecoded);
        // OBS-A：freezeCount 是**冻结次数**（不是秒、也不是「解冻次数」）。
        // 老注释与日志标签都写成「解冻次数」，跟浏览器规范（freezeCount = 画面卡住的次数）正好反着，
        // 排查时会误判成「恢复了几次」。冻结时长走 freezesDuration（秒）。
        const freezeCnt = nnum(v.freezeCount);
        const used = {
          t: now, gen: gen, b: bytes, f: frames, z: freezeCnt,
          // OBS-A：瞬时量也必须过 nnum —— 缺字段记 null（日志写 '?'），不能 0 顶。
          jit: nnum(v.jitter),
          lost: nnum(v.packetsLost),                       // 累计丢包（CAST-B：必须与窗口量分开显示）
          jbd: nnum(v.jitterBufferDelay),                  // 累计缓冲时长（秒）
          jbe: nnum(v.jitterBufferEmittedCount),           // 累计出缓冲的帧数
          dt: nnum(v.totalDecodeTime),                     // 累计解码耗时（秒）
          drop: nnum(v.framesDropped),                     // 累计丢帧
          rend: nnum(v.framesRendered),                    // 累计渲染帧
          fdur: nnum(v.freezesDuration)                    // 累计冻结秒数（部分实现才有）
        };
        const sameGen = !!(statsPrev && statsPrev.gen === gen);
        const win = !!(sameGen && now > statsPrev.t);

        let kbps = null, fps = null, frozenDelta = null, dropDelta = null, lostDelta = null;
        let jbMs = null, decMs = null, freezeSec = null;
        if (win) {
          const span = now - statsPrev.t;
          const dBytes = dlt(bytes, statsPrev.b);
          const dFrames = dlt(frames, statsPrev.f);
          if (dBytes !== null) kbps = Math.round(dBytes * 8 / span);
          if (dFrames !== null) fps = Math.round(dFrames * 1000 / span);
          frozenDelta = dlt(freezeCnt, statsPrev.z);
          dropDelta = dlt(used.drop, statsPrev.drop);
          // CAST-B：丢包必须「累计」和「本窗口新增」分开报。只看累计数永远在涨，
          // 分不清「一直在丢」还是「开播时丢了 613 个之后再没丢」。
          lostDelta = dlt(used.lost, statsPrev.lost);
          // jitterBufferDelay 的单位是秒：Δdelay / Δ出缓冲帧数 = 平均缓冲毫秒。
          const dJbd = dlt(used.jbd, statsPrev.jbd);
          const dJbe = dlt(used.jbe, statsPrev.jbe);
          if (dJbd !== null && dJbe && dJbe > 0) jbMs = Math.round(dJbd * 1000 / dJbe * 10) / 10;
          const dDec = dlt(used.dt, statsPrev.dt);
          if (dDec !== null && dFrames && dFrames > 0) decMs = Math.round(dDec * 1000 / dFrames * 10) / 10;
          freezeSec = dlt(used.fdur, statsPrev.fdur);
        }
        statsPrev = used;

        // CAST-03：真正「有画面」的判据是解出来的帧数开始增长，而不是 connectionState=connected。
        if (!firstFrameAt && frames !== null && frames > 0) {
          firstFrameAt = now;
          clearTimeout(firstFrameTimer); firstFrameTimer = null;
          dl('首帧到达', '连接后 ' + (connectedAt ? (now - connectedAt) + 'ms' : '?') +
            ' · 累计解码帧=' + frames + ' · 尺寸=' + S.video.w + 'x' + S.video.h);
          if (S.state === 'waiting-frame') setState('playing');
        }

        n++;
        if (n <= 3 || n % STAT_LOG_EVERY === 0) {
          // 标签对齐语义（CAST-04）：
          //   解码fps   = framesDecoded 的窗口差分（本地真的解出来的帧）
          //   收帧fps   = framesPerSecond（inbound-rtp 每秒收到的帧，含没解出来的）
          //   冻结次数  = freezeCount 的窗口差分/累计（**次数**，不是秒）
          //   冻结时长  = freezesDuration 的窗口差分（秒），解码器不报这个字段时写 '?'
          dl('接收质量', S.video.w + 'x' + S.video.h +
            ' 解码fps=' + (win && fps !== null ? fps : '?') +
            ' 累计解码=' + (frames === null ? '?' : frames) +
            ' 收帧fps=' + Math.round(Number(v.framesPerSecond) || 0) +
            ' 码率=' + (kbps === null ? '?' : kbps + 'kbps') +
            // OBS-A：缺字段写 '?'，**不许拿 0 顶**（老写法 Number(x)||0 会把「没报」写成 0ms，
            // 看起来像「解码零耗时、完全不抖」，把真问题抹平）。
            ' 抖动=' + (used.jit === null ? '?' : Math.round(used.jit * 1000) + 'ms') +
            ' 抖动缓冲=' + (jbMs === null ? '?' : msText(jbMs)) +
            // 解码耗时常常是 0.3~0.9ms，Math.round 会一律变成 0；msText 保留一位小数。
            ' 解码耗时=' + (decMs === null ? '?' : msText(decMs) + '/帧') +
            ' 丢包=' + (used.lost === null ? '?' : used.lost +
              (lostDelta === null ? '' : '（本窗口+' + lostDelta + '）')) +
            ' 窗口丢帧=' + (dropDelta === null ? '?' : dropDelta) +
            ' 累计渲染=' + (used.rend === null ? '?' : used.rend) +
            ' 冻结次数=' + (frozenDelta === null ? '0/' + (freezeCnt === null ? '?' : freezeCnt)
              : (frozenDelta > 0 ? '+' + frozenDelta + '/' : '0/') + (freezeCnt === null ? '?' : freezeCnt)) +
            ' 冻结时长=' + (freezeSec === null ? '?' : freezeSec + 's') +
            // CAST-B：端到端延迟用单时钟往返实测（见 heartbeat-ack），不是两台机器的时钟差。
            ' 端到端=' + (e2eMs === null ? '?' : e2eMs + 'ms') +
            ' 编码=' + codecOf(list, v) +
            ' 代次=' + (gen.indexOf('|') === gen.length - 1 ? '?' : gen));
        }
      }).catch(() => {});
    }, STAT_MS);
  };

  /**
   * CAST-03：连接建立后盯着第一帧。
   *
   * 以前 connectionState 一到 connected 就写「正在接收」，可日志里出现过 connected 之后
   * 几十秒都是 0x0 的情况 —— 面板上说在接收，屏幕上什么也没有。
   * 现在：只有 framesDecoded 真的涨了才转 playing；到点没帧就自动补救一次（把 <video> 重新拉起来，
   * 这是「轨到了但元素没播」最常见的成因），补救仍无效才报错并把整条链路打全。
   */
  const startFirstFrameWatch = () => {
    clearTimeout(firstFrameTimer);
    firstFrameTimer = setTimeout(() => {
      firstFrameTimer = null;
      if (!pc || firstFrameAt) return;
      if (frameRecover < MAX_FRAME_RECOVER) {
        frameRecover++;
        dlw('首帧超时，尝试恢复第 ' + frameRecover + ' 次');
        const v = view && view.video ? view.video : null;
        if (v) {
          try { const pr = v.play(); if (pr && pr.then) pr.then(() => {}, () => {}); } catch (e) { /* 忽略 */ }
        }
        startFirstFrameWatch();
        return;
      }
      dumpDiag('首帧超时');
      S.error = '已连上但收不到画面（' + Math.round(FIRST_FRAME_TIMEOUT / 1000) + ' 秒 0 帧）' +
        '：请确认手机端还在投屏，必要时重新扫码';
      teardown('no-frame');
    }, FIRST_FRAME_TIMEOUT);
  };

  const startHeartbeat = () => {
    clearInterval(hbTimer);
    lastPeerMsg = Date.now();
    hbTimer = setInterval(() => {
      if (S.state !== 'playing' && S.state !== 'connecting') return;
      send('heartbeat', { t: Date.now() });
      // 看门狗：对端 10 秒一句话都没有 ⇒ 关轨、清画面、判中断（协议第 3 节）。
      // 但 connecting 段必须用更长的宽限：手机靠 20 秒长轮询才知道自己被允许，
      // 这段时间桌面一句话都收不到是正常的，按 10 秒判定会先把自己拆掉（2.2.5 实测三次全这样）。
      const idle = Date.now() - lastPeerMsg;
      const limit = (S.state === 'connecting') ? Math.max(PEER_TIMEOUT, CONNECT_TIMEOUT) : PEER_TIMEOUT;
      if (idle > limit) {
        S.error = ERR_TEXT.timeout;
        teardown('中断');
      }
    }, TICK_MS);
  };

  const teardown = (why) => {
    dl('收摊', String(why || '') + ' 原因=' + (S.error || '(无)'));
    closePeer();
    if (S.sid && hasHost()) { try { window.gewu.phonecast.end(S.sid, why || 'timeout'); } catch (e) { /* 已关 */ } }
    S.sid = '';
    S.source = '';
    S.streamId = '';
    S.video = { w: 0, h: 0 };
    // 会话结束就把序号与候选缓存清干净：否则旧会话的 seq 会把新会话的首个 offer 当旧包丢掉
    lastSeq = 0;
    pendingIce = [];
    hideView();
    setState(S.error ? 'error' : 'stopped');
  };

  // ---------------- 视频画面层 ----------------
  const ensureView = () => {
    if (view) return view;
    const video = h('video', { class: 'pc-video', playsinline: '', autoplay: '', muted: '' });
    video.setAttribute('playsinline', '');
    video.muted = true;
    const title = h('div', { class: 'pc-t' }, '手机投屏');
    const badge = h('div', { class: 'pc-badge' }, TEXT.playing);
    const bar = h('div', { class: 'pc-bar' });
    const mk = (label, tip, fn) => h('button', { class: 'pc-btn', title: tip, onclick: (e) => { e.stopPropagation(); fn(); } }, label);
    const btnFill = mk('铺满', '铺满窗口（保留比例）', () => setFill(!fillMode));
    const btnStop = mk('停止', '停止接收并关闭画面', () => GW.phonecast.stop());
    const handle = h('div', { class: 'pc-resize', title: '拖动缩放' });
    bar.append(h('span', { class: 'pc-hint' }, '拖动标题移动'), btnFill, btnStop);
    const el = h('div', { id: 'pc-view' }, h('div', { class: 'pc-head' }, title, badge), video, handle, bar);
    document.body.append(el);

    // 拖动：按标题栏拖（画面本身留着不拦，避免误拖时画面抖）
    const head = el.querySelector('.pc-head');
    let drag = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      drag = { dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop };
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* 无捕获也能拖 */ }
      el.classList.add('moving');
      e.preventDefault();
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = el.getBoundingClientRect();
      let x = e.clientX - drag.dx;
      let y = e.clientY - drag.dy;
      // 不许拖到完全看不见（保留 80px 可抓回来）
      x = Math.max(-r.width + 80, Math.min(window.innerWidth - 80, x));
      y = Math.max(0, Math.min(window.innerHeight - 40, y));
      viewBox.x = x; viewBox.y = y;
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    });
    const endDrag = () => { drag = null; el.classList.remove('moving'); };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);

    // 缩放：右下角把手，等比（源比例由 S.video 决定，没有就按当前框比例）
    let rz = null;
    handle.addEventListener('pointerdown', (e) => {
      const r = el.getBoundingClientRect();
      rz = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
      fillMode = false;
      el.classList.remove('fill');
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* 无捕获也能拖 */ }
      e.preventDefault(); e.stopPropagation();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!rz) return;
      const ratio = (S.video.w && S.video.h) ? (S.video.w / S.video.h) : (rz.w / Math.max(1, rz.h));
      const w = Math.max(160, Math.min(window.innerWidth, rz.w + (e.clientX - rz.x)));
      const hh = Math.round(w / Math.max(0.1, ratio));
      viewBox.w = Math.round(w); viewBox.h = hh;
      el.style.width = viewBox.w + 'px';
      el.style.height = Math.min(window.innerHeight, viewBox.h) + 'px';
    });
    handle.addEventListener('pointerup', () => { rz = null; });
    handle.addEventListener('pointercancel', () => { rz = null; });

    view = { el, video, badge, bar, btnFill, head, handle };
    return view;
  };

  const layoutView = () => {
    if (!view) return;
    const el = view.el;
    if (fillMode) {
      const W = window.innerWidth, H = window.innerHeight;
      const ratio = (S.video.w && S.video.h) ? (S.video.w / S.video.h) : 16 / 9;
      let w = W, hh = Math.round(W / ratio);
      if (hh > H) { hh = H; w = Math.round(H * ratio); }
      viewBox = { x: Math.round((W - w) / 2), y: Math.round((H - hh) / 2), w: w, h: hh };
    }
    el.style.left = viewBox.x + 'px';
    el.style.top = viewBox.y + 'px';
    el.style.width = viewBox.w + 'px';
    el.style.height = viewBox.h + 'px';
    el.classList.toggle('fill', fillMode);
    if (view.btnFill) view.btnFill.textContent = fillMode ? '还原' : '铺满';
  };

  const showView = () => {
    const v = ensureView();
    v.el.classList.add('on');
    if (!viewBox.w) {
      // 首次出现：按源比例放到视口中央偏上，长边不超过 62% 视口
      const W = window.innerWidth, H = window.innerHeight;
      const ratio = (S.video.w && S.video.h) ? (S.video.w / S.video.h) : 9 / 16;
      let hh = Math.min(H * 0.62, W * 0.62 / ratio);
      let w = hh * ratio;
      if (w > W * 0.86) { w = W * 0.86; hh = w / ratio; }
      viewBox = { x: Math.round((W - w) / 2), y: Math.round((H - hh) / 2), w: Math.round(w), h: Math.round(hh) };
    }
    layoutView();
  };

  const hideView = () => {
    if (!view) return;
    view.el.classList.remove('on');
    try { view.video.srcObject = null; } catch (e) { /* 忽略 */ }
  };

  const setFill = (on) => {
    fillMode = !!on;
    layoutView();
  };

  // ---------------- RTCPeerConnection ----------------
  const newPeer = () => {
    // iceServers 必须为空：只走局域网直连候选，不许走任何 STUN/TURN（协议第 3 节）
    const c = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
    c.onicecandidate = (e) => {
      if (e.candidate) send('ice', { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex });
    };
    c.ontrack = (e) => {
      const stream = (e.streams && e.streams[0]) || new MediaStream([e.track]);
      const v = ensureView();
      v.video.srcObject = stream;
      // 2.2.8（CAST-05）：抖动缓冲三档，来自「设置 → 课堂 → 投屏接收缓冲」。
      // 2.2.5～2.2.7 一律压 0 —— 那是"延迟优先"的一刀切：家用路由器丢一两个包，0 缓冲的播放器
      // 没有任何重排余量，实测表现为整段花屏 / 冻结，甚至首帧永远不来（日志里 framesDecoded 恒 0）。
      // 现在默认交给浏览器自适配（'default'），极端网络可给 60ms（'auto60'），只有明确要零延迟才 0。
      // Chromium 两代 API 名字不同（jitterBufferTarget / playoutDelayHint），两个都试。
      try {
        const rx = e.receiver;
        const mode = (GW.settings && GW.settings.castBuffer) || 'default';
        if (rx) {
          if (mode === 'zero') {
            if ('jitterBufferTarget' in rx) rx.jitterBufferTarget = 0;
            try { rx.playoutDelayHint = 0; } catch (err2) { /* 旧版本忽略 */ }
          } else if (mode === 'auto60') {
            if ('jitterBufferTarget' in rx) rx.jitterBufferTarget = 60;
            try { rx.playoutDelayHint = 0.06; } catch (err2) { /* 旧版本忽略 */ }
          }
          // 'default'：两个都不设，交给浏览器的抖动估计器自己定
          dl('接收缓冲', mode + (('jitterBufferTarget' in rx) ? ' → ' + rx.jitterBufferTarget : '（浏览器不支持该属性）'));
        }
      } catch (err) { /* 不支持就沿用默认 */ }
      const setDims = () => {
        S.video = { w: v.video.videoWidth || 0, h: v.video.videoHeight || 0 };
        if (!viewBox.w) showView();
        layoutView();
        renderPanel();
      };
      v.video.onloadedmetadata = setDims;
      v.video.onresize = setDims;
      // play() 返回 promise，try/catch 接不住它的异步 reject；必须挂 then 的空失败分支，
      // 否则 teardown 时打断播放就会在控制台抛 AbortError（不影响功能，但会污染日志）。
      try { const pr = v.video.play(); if (pr && pr.then) pr.then(() => {}, () => {}); } catch (err) { /* 用户手势限制，静音自动播放通常能过 */ }
      showView();
      // 注意：这里**不**置 playing —— ontrack 只说明 offer 被应用了，一帧媒体都还没到。
      // 顺序是 connecting → connected（转 waiting-frame）→ framesDecoded 涨了才转 playing（CAST-03）。
    };
    c.onconnectionstatechange = () => {
      const st = c.connectionState;
      dl('连接状态', st);
      if (st === 'connected') {
        // CAST-03：连接建立只是第一步。这里先转「等待画面」，由 startStats 里
        // framesDecoded 真正增长时再转 playing —— 不然面板会对着黑屏说「正在接收」。
        if (S.state === 'connecting') {
          clearTimeout(watchdog); watchdog = null;
          connectedAt = Date.now();
          setState('waiting-frame');
          startFirstFrameWatch();
        }
        startStats();
        return;
      }
      // 'disconnected' 不判死：Wi-Fi 抖一下、DTLS 还没跑完都会短暂落到这一档，它会自己回到 connected。
      // 真的连不上会走 failed；只认 failed / closed（2.2.5 的「闪一下就没了」就是被这一条误杀）。
      if (st === 'failed' || st === 'closed') {
        if (S.state === 'playing' || S.state === 'connecting' || S.state === 'waiting-frame') {
          S.error = ERR_TEXT.timeout;
          teardown('pc-' + st);
        }
      }
    };
    return c;
  };

  const applyIce = async (list) => {
    for (const it of list) {
      try { await pc.addIceCandidate({ candidate: it.candidate, sdpMid: it.sdpMid, sdpMLineIndex: it.sdpMLineIndex }); } catch (e) { /* 过期候选丢掉 */ }
    }
  };

  const onOffer = async (msg) => {
    const p = msg.payload || {};
    if (!p.sdp) return;
    // 先把「SDP 之前就到了的候选」抄出来 —— closePeer() 与下面那句都会清空 pendingIce，
    // 不抄就会被自己清掉，于是最关键的 host 候选全丢、协商永远到不了 connected（2.2.0 实测踩过）。
    const cached = pendingIce.slice();
    dl('收到 offer', msg.sid + ' 长度=' + String(p.sdp).length + ' 带候选=' + cached.length);
    closePeer();
    S.streamId = msg.streamId || '';
    pendingIce = [];
    lastSeq = Math.max(lastSeq, Number(msg.seq) || 0);
    pc = newPeer();
    setState('connecting');
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
      // 缓存里的 + setRemoteDescription 期间刚到的一起按序应用（协议第 3 节：先缓存、后按序）
      const list = cached.concat(pendingIce);
      pendingIce = [];
      if (list.length) await applyIce(list);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      send('answer', { sdp: ans.sdp, sdpType: 'answer' });
      dl('已回 answer', msg.sid + ' 长度=' + String(ans.sdp).length);
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (S.state === 'connecting') { S.error = ERR_TEXT.timeout; teardown('no-track'); }
      }, CONNECT_TIMEOUT);
      startHeartbeat();
    } catch (e) {
      S.error = '收发协商失败：' + (e && e.message);
      dle('协商失败', String(e && e.message));
      teardown('sdp-error');
    }
  };

  const onSignal = async (d) => {
    if (!d) return;
    if (d.ch === 'state') {
      S.sessions = (d.sessions || []);
      S.info = d.info || S.info;
      const waiting = S.sessions.filter((s) => s.state === 'waiting-confirm');
      // 不要再判 !S.sid：上一路残留的 sid 会让新会话永远弹不出「允许」（askConfirm 自己按 sid 去重）
      if (waiting.length) askConfirm(waiting[0]);
      renderPanel();
      return;
    }
    const msg = d.msg;
    if (!msg) return;
    // 没有 S.sid 时一律不收：accept 之前来的 offer 就算建了 pc，answer 也发不出去（send() 会被 S.sid 门控），
    // 只会卡在 connecting 直到 20 秒超时。
    // 例外：主进程那边这个会话已经是 accepted（老师点过允许），本地却还没有 sid —— 说明两侧状态
    // 岔开了（面板重开 / accept 与 offer 撞车）。这时候必须认领，否则手机发来的 offer 会被静默丢掉。
    if (!S.sid && d.sid && (S.sessions || []).some((x) => x.sid === d.sid && x.state === 'accepted')) {
      S.sid = d.sid; S.since = 0; lastSeq = 0;
      dl('补认领会话', d.sid);
    }
    if (!S.sid || !d.sid || d.sid !== S.sid) { dlw('丢弃信令', 'sid=' + d.sid + ' type=' + msg.type + ' 当前sid=' + (S.sid || '(空)')); return; }
    lastPeerMsg = Date.now();
    const seq = Number(msg.seq) || 0;
    if (seq && seq <= lastSeq) return;    // 协议：丢弃已见 seq
    lastSeq = Math.max(lastSeq, seq);
    const t = msg.type;
    if (t === 'offer') return onOffer(msg);
    if (t === 'ice') {
      if (pc && pc.remoteDescription) applyIce([msg.payload || {}]);
      else pendingIce.push(msg.payload || {});
      return;
    }
    if (t === 'source-request') {
      S.source = (msg.payload && msg.payload.source) || '';
      renderPanel();
      return;
    }
    if (t === 'source-status') {
      const s = msg.payload && msg.payload.state;
      if (s === 'preparing') setState('connecting');
      else if (s === 'stopped') teardown('peer-stop');
      return;
    }
    if (t === 'heartbeat') return;
    if (t === 'heartbeat-ack') {
      // p.t 是**桌面自己写下的**时间戳，原样回来才算得了往返。
      const mine = msg.payload ? nnum(msg.payload.t) : null;
      if (mine !== null && mine > 0) {
        const rtt = Date.now() - mine;
        // 负数只可能是手机端把 t 改了或系统时间跳变；记 null 不记 0（0 会被误读成零延迟）。
        e2eMs = (rtt >= 0 && rtt < 60000) ? rtt : null;
        e2eN++;
        if (e2eN % 6 === 1) dl('端到端延迟', (e2eMs === null ? '?' : e2eMs + 'ms') + '（单时钟往返，含信令与解码）');
      }
      return;
    }
    if (t === 'stop') {
      const r = (msg.payload && msg.payload.reason) || '';
      if (r === 'rejected') S.error = ERR_TEXT.rejected;
      teardown(r || 'stop');
    }
  };

  // ---------------- 面板 ----------------
  const drawQR = (canvas, text) => {
    // vendor 里的 qrcode-generator（MIT）。没有就退化成只显示文本，不能让面板崩。
    if (!canvas) return false;
    const q = (typeof window.qrcode === 'function') ? window.qrcode : null;
    if (!q) return false;
    try {
      const qr = q(0, 'M');
      qr.addData(text);
      qr.make();
      const n = qr.getModuleCount();
      const px = Math.max(2, Math.floor(240 / n));
      const size = (n + 8) * px;
      canvas.width = size;
      canvas.height = size;
      const g = canvas.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, size, size);
      g.fillStyle = '#111';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + 4) * px, (r + 4) * px, px, px);
      return true;
    } catch (e) { return false; }
  };

  let panelRefs = null;
  const buildPanel = () => {
    if (panel) return panel;
    const qr = h('canvas', { class: 'pc-qr', width: 240, height: 240 });
    const uri = h('textarea', { class: 'pc-uri', readonly: '', rows: 3 });
    const stateTxt = h('div', { class: 'pc-state' }, '');
    const tip = h('div', { class: 'pc-tip' }, '');
    const srow = h('div', { class: 'pc-srow' });
    const btnCopy = h('button', { class: 'gw-btn', onclick: () => { try { uri.select(); document.execCommand('copy'); GW.toast('配对码已复制到剪贴板'); } catch (e) { GW.toast('复制失败，请手动选中'); } } }, '复制配对码');
    const btnRenew = h('button', { class: 'gw-btn', onclick: async () => { try { const r = await window.gewu.phonecast.renew(); if (r) { S.info = r; renderPanel(); } } catch (e) { GW.toast('换码失败'); } } }, '换一张');
    const btnStop = h('button', { class: 'gw-btn', onclick: () => GW.phonecast.stop() }, '停止接收');
    const close = h('button', { class: 'pc-x', title: '关闭', onclick: () => GW.phonecast.closePanel() }, '×');
    const el = h('div', { id: 'pc-panel' },
      h('div', { class: 'pc-ph' }, h('span', {}, '手机投屏'), close),
      stateTxt, qr, uri,
      h('div', { class: 'pc-acts' }, btnCopy, btnRenew, btnStop),
      srow, tip,
      h('div', { class: 'pc-note' }, '手机与电脑连同一个 Wi-Fi；用手机 App 的「扫一扫」对着二维码扫，或把上面的配对码粘贴到手机里。'));
    document.body.append(el);
    panel = el;
    panelRefs = { el, qr, uri, stateTxt, tip, srow, btnRenew, btnStop };
    return el;
  };

  const renderPanel = () => {
    if (!panel || !panelRefs) return;
    const r = panelRefs;
    r.stateTxt.textContent = TEXT[S.state] || S.state;
    r.stateTxt.className = 'pc-state ' + S.state;
    if (view && view.badge) {
      // 画面层右上角的小标签也要跟着走，否则「等待画面」时它还写着「正在接收」。
      view.badge.textContent = TEXT[S.state] || S.state;
      view.badge.className = 'pc-badge ' + S.state;
    }
    const info = S.info || {};
    if (S.state === 'pairing' || S.state === 'waiting-confirm' || S.state === 'connecting') {
      r.uri.value = info.uri || '';
      drawQR(r.qr, info.uri || '');
      r.qr.style.display = 'block';
      const left = info.leftMs != null ? Math.ceil(info.leftMs / 1000) : 0;
      if (S.state === 'pairing' && left <= 0) r.tip.textContent = '配对码已过期，点「换一张」重新生成。';
      else if (S.state === 'pairing') r.tip.textContent = '配对码 ' + left + ' 秒内有效，只能用一次。';
      else r.tip.textContent = '';
    } else {
      r.uri.value = info.uri || '';
      r.qr.style.display = 'none';
      r.tip.textContent = S.error || (S.state === 'playing' ? '画面已显示在画布上方，可以拖动标题栏移动、拖右下角缩放。' : '');
    }
    // 会话列表
    r.srow.innerHTML = '';
    for (const s of S.sessions) {
      const dev = s.device || {};
      const name = dev.name || dev.model || '手机';
      const row = h('div', { class: 'pc-sess' },
        h('span', { class: 'pc-sidev' }, name),
        h('span', { class: 'pc-sistate' }, s.state === 'accepted' ? (s.source === 'camera' ? '摄像头 · 接收中' : '屏幕 · 接收中') : (s.state === 'waiting-confirm' ? '等待确认' : s.state === 'rejected' ? '已拒绝' : s.state)));
      if (s.state === 'waiting-confirm') {
        row.append(h('button', { class: 'gw-btn primary', onclick: () => accept(s.sid, true) }, '允许'));
        row.append(h('button', { class: 'gw-btn', onclick: () => accept(s.sid, false) }, '拒绝'));
      }
      r.srow.append(row);
    }
    const live = S.sessions.filter((s) => s.state === 'accepted').length;
    r.btnStop.style.display = live ? '' : 'none';
  };

  const askConfirm = (sess) => {
    if (confirmSid === sess.sid) return;
    confirmSid = sess.sid;
    const dev = sess.device || {};
    const name = dev.name || '一台手机';
    const dlg = GW.dialog({
      title: '有手机要投屏',
      width: 420,
      ok: '允许',
      cancel: '拒绝',
      body: h('div', { class: 'pc-ask' },
        h('p', {}, name + ' 想把这台手机的' + '屏幕或摄像头投到这块画布上。'),
        h('p', { class: 'pc-ask-dim' }, '只在你点「允许」之后才会开始传输；拒绝后它可以再扫一次码。')),
      onOk: () => { accept(confirmSid, true); },
      onClose: () => { if (confirmSid) accept(confirmSid, false); confirmSid = ''; },
    });
    return dlg;
  };

  const accept = (sid, yes) => {
    confirmSid = '';
    // 先把 sid 定下来，再通知主进程：confirm() 会立刻唤醒手机的长轮询，
    // 手机会在同一瞬间回 offer，而 onSignal 用 S.sid 当门控 —— 顺序反了这份 offer 会被丢掉。
    if (yes) { S.sid = sid; S.since = 0; lastSeq = 0; }
    try { window.gewu.phonecast.confirm(sid, !!yes); } catch (e) { /* 服务已关 */ }
    dl('点了确认', sid + ' accept=' + !!yes);
    if (yes) {
      setState('connecting');
      startHeartbeat();
    } else {
      setState('pairing');
    }
    renderPanel();
  };

  // ---------------- 对外 API ----------------
  GW.phonecast = {
    open: async function () {
      if (!hasHost()) { GW.toast('手机投屏只在桌面版可用'); return { ok: false }; }
      buildPanel();
      panel.classList.add('on');
      try {
        const r = await window.gewu.phonecast.start({});
        if (!r || !r.ok) { setState('error', (r && r.error) || '启动失败'); return { ok: false }; }
        S.info = r.info;
        if (!unsub) unsub = window.gewu.phonecast.on(onSignal);
        if (S.state === 'idle' || S.state === 'stopped' || S.state === 'error') setState('pairing');
        renderPanel();
        return { ok: true, info: S.info };
      } catch (e) {
        setState('error', String((e && e.message) || e));
        return { ok: false, error: String((e && e.message) || e) };
      }
    },
    stop: async function () {
      const sid = S.sid;
      if (sid && hasHost()) { try { window.gewu.phonecast.send(sid, { v: 1, sid: sid, streamId: S.streamId, seq: ++S.since, type: 'stop', payload: { reason: 'desktop-stop' } }); } catch (e) { /* 已关 */ } }
      closePeer();
      S.error = '';
      teardown('desktop-stop');
      S.state = 'stopped';
      renderPanel();
      return { ok: true };
    },
    // 关面板但保持服务开着（下次开面板还能用同一张配对码）
    closePanel: function () {
      if (panel) panel.classList.remove('on');
      if (unsub) { try { unsub(); } catch (e) { /* 已摘 */ } unsub = null; }
    },
    // 彻底收摊（关窗/退出前）
    shutdown: async function () {
      GW.phonecast.closePanel();
      closePeer();
      hideView();
      if (hasHost()) { try { await window.gewu.phonecast.stop(); } catch (e) { /* 已关 */ } }
      S.state = 'idle'; S.sid = ''; S.sessions = []; S.info = null;
    },
    state: function () {
      return { state: S.state, sid: S.sid, source: S.source, streamId: S.streamId, video: { w: S.video.w, h: S.video.h }, error: S.error, sessions: S.sessions.length };
    },
    // 探针用：直接喂一条信令（没有真手机时验证状态机）
    _feed: function (msg, sid) { return onSignal({ ch: 'signal', sid: sid || S.sid, msg: msg }); },
    _reset: function () { closePeer(); hideView(); S.state = 'idle'; S.sid = ''; S.error = ''; S.sessions = []; },
  };

  window.addEventListener('resize', () => { if (view && view.el.classList.contains('on')) layoutView(); });
})();
