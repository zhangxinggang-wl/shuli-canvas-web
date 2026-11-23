/* 桌面端投屏（2.2.1）：电脑当「发送端」，把自己的屏幕推给另一台设备
 *
 * 和同目录另外两个文件的分工：
 *   phonecast.js = 电脑收手机的画面（接收端，临时视图层 #pc-view）；
 *   castphone.js = 手机自己发（安卓原生采帧，面板 #cp-panel）；
 *   pcsend.js    = 电脑自己发（本文件；Chromium 的 getDisplayMedia 采屏，面板 #ps-panel）。
 * 三者共用同一个配对码 gewu-cast:v1?h=…&p=…&f=…&t=…，协议见 docs/notes/2.2.0-01-phonecast-protocol.md。
 *
 * 链路：主进程 main/pcsend.js 负责 HTTPS 信令（配对 + 长轮询），这里只做三件事：
 *   1. 面板与状态机；
 *   2. 采屏（getDisplayMedia，没有就退 window.gewu.captureScreen 的仍帧）；
 *   3. RTCPeerConnection 协商：桌面发 offer、对端回 answer，ice 双向补齐。
 *
 * 为什么 iceServers 是空数组：协议规定只走局域网直连候选，不引入 STUN/TURN（教室没有外网也能用）。
 * 为什么 answer 之前到达的 ice 要缓存：addIceCandidate 在 setRemoteDescription 之前会抛
 * InvalidStateError，而服务端只保证「按 seq 顺序投递」，不保证 answer 一定比 ice 先到。
 */
(function () {
  const GW = window.GW;

  // preload 按这个形状暴露（main/preload.js 的 pcsend 段）：{ start, stop, send, poll, on }
  const host = () => { const g = window.gewu; return (g && g.pcsend) || null; };
  const canSend = () => !!host();

  const h = (tag, attrs, ...kids) => GW.h(tag, attrs || {}, ...kids);

  const S = {
    state: 'idle',       // idle | waiting-confirm | connecting | playing | stopped | error
    message: '',
    uri: '',
    sid: '',
    video: { w: 0, h: 0 },
  };

  // 面板文案：状态机每一档一句话
  const TEXT = {
    idle: '还没开始',
    'waiting-confirm': '已发出请求，等对方点「允许」',
    ready: '对方已允许，等你点「开始共享」',
    connecting: '正在建立连接…',
    playing: '正在分享屏幕',
    stopped: '已停止',
    error: '出错了',
  };
  // 每条只教一件事，别堆成说明书
  const TIP = {
    idle: '把另一台设备上「手机投屏」面板里的配对码复制过来，粘在下面再点「开始分享」。',
    'waiting-confirm': '对方设备上会弹出确认框，点「允许」就开始。',
    ready: '点下面的「开始共享」，系统会问你要共享哪块屏幕（选「整个屏幕」画面最完整）。这一步必须由你的这次点按触发：系统只在真实点按时才允许采屏，所以收到「允许」后不会自己开录。',
    connecting: '同一个 Wi-Fi 下一般 1~3 秒。连不上多半是两台设备不在同一网段，或路由器开了 AP 隔离。',
    playing: '现在可以把这台电脑的画面共享出去了；要停就点「停止」。',
    stopped: '可以再点一次「开始分享」，或换一张配对码。',
    error: '',
  };
  const ERR_TEXT = {
    expired: '配对码已过期，请让对方重新生成一张',
    used: '这张配对码已经被用过了，请让对方重新生成',
    'bad-token': '配对码不正确，检查是不是复制全了',
    'no-session': '对方已经结束了这个会话',
    rejected: '对方拒绝了这次投屏',
    'bad-version': '两边版本不一致，请升级到同一版本',
    rate: '请求太频繁，稍等一下再试',
    'cert-mismatch': '证书不符：这个配对码不是那台设备生成的，或者网络被中间人改过',
    timeout: '连接超时，多半是两台设备不在同一个局域网，或路由器开了 AP 隔离',
  };

  let pc = null;
  let stream = null;
  let pendingIce = [];
  let remoteSet = false;
  let unsub = null;        // preload.on() 的取消函数
  let panel = null;
  let refs = null;
  let waitTimer = null;    // 「已请求、等对方允许」的超时
  let connTimer = null;    // 协商开始后还没 connected 的超时
  let peerAt = 0;          // 最后一次收到对端消息的时刻（协议：10 秒没有就判断开）
  let peerTimer = null;
  let fallbackStop = null; // captureScreen 仍帧回落时的定时器清理
  let busy = false;
  let t0 = 0;              // 本次会话起点：日志里记阶段耗时
  let capFail = false;     // 采屏失败过一次（据此点亮「改用低帧兼容模式」，由老师自己决定）
  let gen = 0;             // 会话代次：上一次会话残留的 onState/onSignal 一律丢弃

  // 现场排障：渲染层这一侧的关键节点也要进日志。main/main.js:335 的 console-message 钩子会把
  // console.warn / console.error 写进日志文件，所以这里不必新增 IPC 通道。
  // 会话号只记前 6 位；配对码里的令牌一个字符都不记。
  const diag = (stage, extra) => {
    try {
      const sid = S.sid ? String(S.sid).slice(0, 6) : '(空)';
      const ms = t0 ? (Date.now() - t0) : 0;
      console.warn('[pcsend] ' + stage + ' sid=' + sid + ' +' + ms + 'ms' + (extra ? ' ' + extra : ''));
    } catch (e) { /* 日志失败绝不能影响投屏 */ }
  };

  const WAIT_TIMEOUT = 60000;   // 等对方点「允许」最多 60 秒（配对码本身 120 秒过期）
  const CONN_TIMEOUT = 20000;   // 发出 offer 后 20 秒还没连上就判超时（AP 隔离最常见）
  // 协议：10 秒收不到对端任何消息 = 断线。但对端的长轮询一次就能挂 20 秒（main/pcsend.js 的
  // POLL_MS），所以「还没 playing」的协商段必须给更长宽限，否则连接与媒体都正常也会被自己拆掉。
  const PEER_TIMEOUT = 10000;
  const PEER_TIMEOUT_CONN = 25000;

  // ---------------- 状态 ----------------
  const setState = (st, msg) => {
    S.state = st || 'idle';
    if (msg !== undefined) S.message = msg == null ? '' : String(msg);
    else if (st !== 'error' && st !== 'stopped') S.message = '';
    render();
  };
  const failState = (code, extra) => {
    // extra 是「这一处具体为什么失败」，比通用文案有用 —— 先给 extra。
    // （原来 ERR_TEXT 优先，于是「没拿到屏幕：xxx」永远被压成「连接超时…」，查不出原因。）
    const m = extra || ERR_TEXT[code] || String(code || '未知错误');
    setState('error', m);
    GW.toast(m);
  };

  // ---------------- 面板 ----------------
  const build = () => {
    if (panel) return panel;
    const title = h('span', {}, '桌面投屏 · 发送');
    const stateTxt = h('div', { class: 'pc-state' });
    const tip = h('div', { class: 'pc-note', style: { borderTop: '0', paddingTop: '0' } });
    const uri = h('textarea', { class: 'pc-uri', rows: 3, spellcheck: 'false', placeholder: 'gewu-cast:v1?h=…&p=…&f=…&t=…' });
    const msg = h('div', { class: 'pc-msg' });
    // 一个按钮两种含义：还没被允许时是「发起请求」，对方允许后是「开始共享」。
    // 后者必须走老师这一次真实点按 —— getDisplayMedia 要 transient activation。
    const btnStart = h('button', { class: 'gw-btn cp-primary', onclick: () => onPrimary() }, '开始分享');
    // 只在采屏失败之后出现：低帧兼容模式是「每秒截一张图」的退路，画质与流畅度都差，
    // 必须老师自己点，绝不自动切过去（任务书 PC-01：权限拒绝不得自动绕到截图链路）。
    const btnLow = h('button', { class: 'gw-btn', onclick: () => beginCapture(true) }, '改用低帧兼容模式');
    const btnStop = h('button', { class: 'gw-btn', onclick: () => doStop() }, '停止');
    const btnX = h('button', { class: 'pc-x', title: '关闭', onclick: () => close() }, '×');

    const el = h('div', { id: 'ps-panel' },
      h('div', { class: 'pc-ph' }, title, btnX),
      stateTxt, tip, uri,
      h('div', { class: 'cp-acts' }, btnStart, btnLow, btnStop),
      msg,
      h('div', { class: 'pc-note' }, '另一台设备打开接收面板，把你的配对码粘贴到这里。两台设备要在同一个 Wi-Fi（不需要外网）。'));

    // 面板观感由 src/styles/app.css 的 #ps-panel 段负责（与 #pc-panel / #cp-panel 同一套 .pc-* 类）。
    // 这里只兜底定位与显隐：lead 若还没接线，面板也不会在页面底部散成一堆。
    el.style.cssText = 'position:fixed;right:14px;top:66px;z-index:46;width:min(360px,calc(100vw - 24px));' +
      'max-height:calc(100vh - 100px);overflow-y:auto;display:none;flex-direction:column;gap:10px;' +
      'padding:12px 14px 14px;border-radius:16px;background:var(--menu-tile,#fff);color:var(--ink,#1b2433);' +
      'box-shadow:0 18px 50px rgba(20,30,50,.28),0 0 0 1px rgba(20,30,50,.08);';

    document.body.append(el);
    panel = el;
    refs = { el, stateTxt, tip, uri, msg, btnStart, btnLow, btnStop };
    return el;
  };

  const setShown = (on) => {
    if (!panel) return;
    panel.classList.toggle('on', !!on);
    panel.style.display = on ? 'flex' : 'none';
  };

  const render = () => {
    if (!panel) return;
    const r = refs;
    const st = S.state || 'idle';
    r.stateTxt.textContent = TEXT[st] || st;
    r.stateTxt.className = 'pc-state' + (st === 'playing' ? ' playing' : (st === 'error' ? ' error' : ''));
    r.tip.textContent = TIP[st] || '';
    // ready 也算「会话活着」（停止按钮要留着、配对码要锁住），但主按钮必须可点：
    // 采屏只能由老师这一次真实点按触发（transient activation）。
    const live = st === 'waiting-confirm' || st === 'ready' || st === 'connecting' || st === 'playing';
    r.btnStart.disabled = busy || (live && st !== 'ready');
    r.btnStart.textContent = st === 'ready' ? '开始共享' : '开始分享';
    r.btnLow.style.display = (capFail && !live) ? '' : 'none';
    r.btnLow.disabled = busy || st === 'ready';
    r.btnStop.disabled = busy || (!live && st !== 'stopped');
    r.btnStop.style.display = live ? '' : 'none';
    r.uri.readOnly = live;
    r.uri.style.opacity = live ? '.6' : '';
    r.msg.textContent = (st === 'error' || st === 'stopped') && S.message ? S.message : '';
    r.msg.className = 'pc-msg';
    r.msg.style.color = st === 'error' ? '#c0392b' : '';
  };

  // ---------------- 采屏 ----------------
  // 首选 getDisplayMedia（真视频轨）；Electron 22 的 Chromium 108 在 mac 上不支持，
  // 有些打包环境也会被禁 —— 那就退主进程的 captureScreen（仍是帧，用 canvas.captureStream 变成流）。
  // forceLow：老师点了「改用低帧兼容模式」才为真。这是显式选择，不是自动降级 ——
  // 采屏权限被拒绝绝不能偷偷绕到每秒截图那条路上（任务书 PC-01）。
  const grabStream = (forceLow) => {
    const md = navigator.mediaDevices;
    if (!forceLow && md && typeof md.getDisplayMedia === 'function') {
      return md.getDisplayMedia({ video: { frameRate: 24 }, audio: false }).then((st) => {
        if (!st) throw new Error('没有拿到屏幕流');
        return st;
      });
    }
    const cs = window.gewu && window.gewu.captureScreen;
    if (typeof cs !== 'function') return Promise.reject(new Error('这个环境不支持屏幕共享'));
    return cs({}).then((dataUrl) => {
      if (!dataUrl) throw new Error('截不到屏幕');
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth || 1280;
          cv.height = img.naturalHeight || 720;
          const ctx = cv.getContext('2d');
          const draw = () => { try { ctx.drawImage(img, 0, 0, cv.width, cv.height); } catch (e) { /* 画布已释放 */ } };
          draw();
          const out = cv.captureStream(10);
          // 仍帧会「冻住」画面，所以再按 1 秒一张重截同一块屏，让对端至少能看到变化
          const tick = setInterval(() => {
            cs({}).then((u) => {
              if (!u) return;
              const im2 = new Image();
              im2.onload = () => { try { ctx.drawImage(im2, 0, 0, cv.width, cv.height); } catch (e) { /* 忽略 */ } };
              im2.src = u;
            }).catch(() => {});
          }, 1000);
          fallbackStop = () => { clearInterval(tick); try { out.getTracks().forEach((t) => t.stop()); } catch (e) { /* 已关 */ } };
          resolve(out);
        };
        img.onerror = () => reject(new Error('截屏数据读不出来'));
        img.src = dataUrl;
      });
    });
  };

  // ---------------- 协商 ----------------
  const flushIce = () => {
    if (!pc || !remoteSet) return;
    const list = pendingIce;
    pendingIce = [];
    list.forEach((c) => { try { pc.addIceCandidate(c).catch(() => {}); } catch (e) { /* 候选过期就算了 */ } });
  };

  const teardown = () => {
    if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
    if (connTimer) { clearTimeout(connTimer); connTimer = null; }
    if (peerTimer) { clearInterval(peerTimer); peerTimer = null; }
    if (unsub) { try { unsub(); } catch (e) { /* 已摘 */ } unsub = null; }
    if (pc) {
      try { pc.onicecandidate = null; pc.onconnectionstatechange = null; } catch (e) { /* 忽略 */ }
      try { pc.close(); } catch (e) { /* 已关 */ }
      pc = null;
    }
    remoteSet = false;
    pendingIce = [];
    if (fallbackStop) { try { fallbackStop(); } catch (e) { /* 忽略 */ } fallbackStop = null; }
    if (stream) {
      try { stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* 已停 */ } }); } catch (e) { /* 忽略 */ }
      stream = null;
    }
    S.video = { w: 0, h: 0 };
  };

  // 对端 10 秒一句话都没有 ⇒ 收尾（协议第 3 节）。connectionState 不一定翻得过来：
  // 对端断网时本端常常一直停在 connected，所以必须自己看信令面。
  const startPeerWatch = () => {
    peerAt = Date.now();
    if (peerTimer) clearInterval(peerTimer);
    peerTimer = setInterval(() => {
      if (S.state !== 'playing' && S.state !== 'connecting') return;
      const limit = (S.state === 'connecting') ? Math.max(PEER_TIMEOUT, PEER_TIMEOUT_CONN) : PEER_TIMEOUT;
      if (Date.now() - peerAt <= limit) return;
      diag('peer-timeout', '空闲=' + (Date.now() - peerAt) + 'ms 阈值=' + limit + 'ms');
      teardown();
      setState('error', ERR_TEXT.timeout);
      const api = host();
      if (api) Promise.resolve(api.stop()).catch(() => {});
    }, 2000);
  };

  const inbound = (msg) => {
    const m = msg || {};
    const t = String(m.type || '');
    peerAt = Date.now();
    if (t === 'answer') {
      if (!pc) return;
      const sdp = (m.payload && m.payload.sdp) || '';
      if (!sdp) return;
      pc.setRemoteDescription({ type: 'answer', sdp: sdp }).then(() => {
        remoteSet = true;
        flushIce();
        if (connTimer) { clearTimeout(connTimer); connTimer = null; }
        setState('connecting');
      }).catch((e) => { failState('timeout', '协商失败：' + ((e && e.message) || e)); stopAll(true); });
      return;
    }
    if (t === 'ice') {
      const p = m.payload || {};
      const cand = { candidate: String(p.candidate || ''), sdpMid: p.sdpMid == null ? null : p.sdpMid, sdpMLineIndex: p.sdpMLineIndex == null ? null : p.sdpMLineIndex };
      if (!cand.candidate) return;
      if (!pc || !remoteSet) { pendingIce.push(cand); return; }
      try { pc.addIceCandidate(cand).catch(() => {}); } catch (e) { /* 候选过期就算了 */ }
      return;
    }
    if (t === 'stop') {
      teardown();
      setState('stopped', (m.payload && m.payload.reason) || '对方结束了对端');
    }
    // heartbeat / source-* 不在这里处理（本端是发送端，来源固定是屏幕）
  };

  const startPc = () => {
    const RTC = window.RTCPeerConnection;
    if (!RTC) { failState('timeout', '这个环境不支持 WebRTC'); return Promise.resolve(false); }
    pc = new RTC({ iceServers: [], bundlePolicy: 'max-bundle' });
    pc.onicecandidate = (e) => {
      if (!e || !e.candidate) return;
      host().send({ type: 'ice', streamId: 'screen', payload: e.candidate.toJSON ? e.candidate.toJSON() : { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex } });
    };
    pc.onconnectionstatechange = () => {
      const cs = pc ? pc.connectionState : '';
      if (cs === 'connected') { setState('playing'); if (connTimer) { clearTimeout(connTimer); connTimer = null; } startPeerWatch(); return; }
      if (cs === 'failed' || cs === 'disconnected') {
        teardown();
        setState('error', cs === 'failed' ? '连接失败，可能是两台设备不在同一个局域网' : '连接中断了');
      }
    };
    (stream.getTracks() || []).forEach((t) => { try { pc.addTrack(t, stream); } catch (e) { /* 重复加轨就算了 */ } });
    const v0 = stream.getVideoTracks()[0];
    if (v0 && v0.getSettings) { const s = v0.getSettings(); S.video = { w: s.width || 0, h: s.height || 0 }; }
    return pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => host().send({ type: 'offer', streamId: 'screen', payload: { sdp: pc.localDescription.sdp, type: 'offer', sdpType: 'offer' } }))
      .then((r) => {
        if (r && r.ok === false) throw new Error(r.error || 'send failed');
        setState('connecting');
        connTimer = setTimeout(() => {
          if (S.state !== 'playing') { teardown(); setState('error', ERR_TEXT.timeout); host().stop(); }
        }, CONN_TIMEOUT);
        return true;
      });
  };

  // ---------------- 动作 ----------------
  // 主按钮两种含义：还没被允许 → 发起请求；已被允许 → 真正开始共享。
  // 后者必须在这次 onclick 里同步进 getDisplayMedia，中间不许 await 任何网络往返：
  // Chromium 只认用户激活（transient activation），跨过网络确认再采屏会直接 InvalidStateError。
  const onPrimary = () => {
    if (S.state === 'ready') return beginCapture(false);
    return doStart();
  };

  const doStart = (rawUri) => {
    if (busy) return Promise.resolve(false);
    const uri = String(rawUri != null ? rawUri : (refs ? refs.uri.value : '') || '').trim();
    if (!uri) { GW.toast('先把另一台设备上的配对码粘贴进来'); return Promise.resolve(false); }
    const api = host();
    if (!api) { GW.toast('这个环境不能发送投屏：网页版不支持，请用 Windows 端或安卓 App'); return Promise.resolve(false); }

    busy = true;
    t0 = Date.now();
    const myGen = ++gen;   // 本次会话代次：上一轮残留的 onState/onSignal 全部丢弃
    capFail = false;
    S.uri = uri;
    render();
    teardown();
    setState('waiting-confirm', '');
    diag('request-start');

    const finish = (ok) => { busy = false; render(); return ok; };

    // 订阅必须在 api.start 之前挂上：主进程是在 IPC 处理里就 push onState 的
    // （accepted / rejected 可能在 start 的返回值回来之前就已经发出去了），
    // 等 await 完再订阅就会漏掉第一帧事件 —— 那正是「已允许却一直等」的另一种成因。
    if (unsub) { try { unsub(); } catch (e) { /* 忽略 */ } }
    unsub = api.on((d) => {
      const m = d || {};
      if (m.ch === 'state') {
        if (myGen !== gen) return;   // 上一轮会话的迟到事件，丢掉
        diag('state', 'state=' + m.state);
        if (m.state === 'accepted') {
          // PC-01：这里绝不能直接采屏 —— 事件是网络回来的，早已不是老师那次点按。
          // 停在 ready，等老师点「开始共享」，getDisplayMedia 才拿得到用户激活。
          if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
          setState('ready', '');
        }
        else if (m.state === 'rejected') { teardown(); setState('error', ERR_TEXT.rejected); }
        else if (m.state === 'ended') { teardown(); setState('stopped', '对方结束了会话'); }
        else if (m.state === 'error' || m.state === 'disconnected') { teardown(); setState('error', ERR_TEXT[m.error] || '连接中断了'); }
        return;
      }
      inbound(m.ch === 'signal' ? m.msg : m);
    });

    return Promise.resolve(api.start({ uri: uri })).then((res) => {
      if (!res || res.ok === false) { diag('request-fail', 'error=' + ((res && res.error) || 'timeout')); failState((res && res.error) || 'timeout'); return finish(false); }
      S.sid = String(res.sid || '');
      diag('pair-ok', '阶段=已发出请求，等对方允许');
      waitTimer = setTimeout(() => {
        if (S.state !== 'waiting-confirm') return;
        teardown();
        try { api.stop(); } catch (e) { /* 忽略 */ }
        setState('error', '对方一直没有确认，请重新生成配对码再试');
      }, WAIT_TIMEOUT);
      return finish(true);
    }).catch((e) => { failState('timeout', (e && e.message) || String(e)); return finish(false); });
  };

  // 对方点了「允许」之后才开始采屏：被拒绝时不该已经抓着老师的屏幕
  // forceLow 只由「改用低帧兼容模式」按钮或 ready 态的主按钮传 false 进来。
  const beginCapture = (forceLow) => {
    if (S.state !== 'waiting-confirm' && S.state !== 'ready' && S.state !== 'connecting') return Promise.resolve(false);
    setState('connecting');
    diag('capture-start', 'mode=' + (forceLow ? 'low' : 'display'));
    return grabStream(!!forceLow).then((st) => {
      stream = st;
      const v = stream.getVideoTracks()[0];
      if (v && v.addEventListener) v.addEventListener('ended', () => { if (S.state === 'playing' || S.state === 'connecting') doStop(); });
      return startPc();
    }).then(() => true).catch((e) => {
      // 采屏被拒/失败：先记日志再收尾。这里的 error.name 是排障的唯一线索
      // （NotAllowedError = 老师点了取消或系统拒绝；InvalidStateError = 没拿到用户激活）。
      const name = (e && e.name) || '';
      const msg = (e && e.message) || String(e);
      diag('capture-fail', 'error=' + name + ' msg=' + msg + ' mode=' + (forceLow ? 'low' : 'display'));
      capFail = true;
      teardown();
      try { host().stop(); } catch (err) { /* 忽略 */ }
      failState('timeout', '没拿到屏幕（' + (name || '未知') + '）：' + msg);
      return false;
    });
  };

  const stopAll = (silent) => {
    gen++;   // 停止之后到达的 onState/onSignal 一律作废，避免把新会话推进旧状态
    teardown();
    const api = host();
    if (api) Promise.resolve(api.stop()).catch(() => {});
    S.sid = '';
    if (!silent) setState('stopped', '');
  };

  const doStop = () => {
    if (busy) return Promise.resolve(false);
    busy = true;
    render();
    return Promise.resolve(stopAll(false)).then(() => { busy = false; render(); return true; });
  };

  // ---------------- 开关 ----------------
  const open = () => {
    if (!canSend()) { GW.toast('这个环境不能发送投屏：网页版不支持，请用 Windows 端或安卓 App'); return null; }
    build();
    setShown(true);
    if (S.state === 'playing' || S.state === 'connecting') { /* 已在进行中：只把面板打开 */ }
    render();
    return panel;
  };
  const close = () => {
    // 关面板不等于停止：正在投的时候关掉只是收起面板，画面继续推
    setShown(false);
    render();
  };

  GW.pcsend = {
    open: open,
    close: close,
    start: (uri) => doStart(uri),
    stop: () => doStop(),
    state: () => ({ state: S.state, message: S.message, uri: S.uri, sid: S.sid, video: { w: S.video.w, h: S.video.h } }),
    // 探针用：不接主进程也能验状态机与面板
    _set: setState,
    _inbound: inbound,
    _render: render,
  };
})();
