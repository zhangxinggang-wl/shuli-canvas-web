/* 手机端投屏（2.2.1）：手机当「发送端」，把屏幕或摄像头推给电脑
 *
 * 和 core/phonecast.js 的关系：
 *   phonecast.js = 接收端（电脑收到手机的画面，画在画布上的临时视图层）。
 *   castphone.js = 发送端（手机扫码 → 选屏幕/摄像头 → 交给安卓原生采帧）。
 * 两者都用同一个配对码（gewu-cast:v1?h=…&p=…&f=…&t=…），协议见 docs/notes/2.2.0-01-phonecast-protocol.md。
 *
 * 网页里不碰 SDP、不碰采集：扫码 / 开始 / 停止 / 状态 全部转给 window.gewuNative.cast（mobile/shim.js），
 * 原生侧是 ScanActivity / CastService / CameraCastActivity，状态经 CastBridge 以 gewu-cast-state 事件回推。
 * 所以这里只做三件事：面板、状态机、把用户点按翻译成原生调用。
 */
(function () {
  const nat = () => window.gewuNative || null;
  const cast = () => { const n = nat(); return (n && n.cast) || null; };
  const canSend = () => !!(cast() && typeof cast().scan === 'function');
  const canRecv = () => !!(cast() && typeof cast().recv === 'function');   // 2.2.1：安卓当接收端（安卓↔安卓 / Windows→安卓）
  const canReceive = () => !!(window.gewu && window.gewu.phonecast);
  // 2.2.1：电脑也能当发送端（本机屏幕 → 另一台电脑 / 安卓接收端），见 src/core/pcsend.js
  const canPcSend = () => !!(window.gewu && window.gewu.pcsend);

  const h = (tag, attrs, ...kids) => GW.h(tag, attrs || {}, ...kids);

  const TEXT = {
    idle: '还没配对',
    scanned: '已扫到配对码，选一个分享内容',
    'waiting-confirm': '等对面点「允许」',
    connecting: '正在建立连接…',
    playing: '正在分享',
    stopped: '已停止',
    error: '出错了',
  };
  // 原生给的是中文原文（CastService/CastAgent 里写好的），这里只补几类「网页侧才知道」的引导
  const TIP = {
    idle: '点「扫一扫」，对着另一台设备上「手机投屏」面板里的二维码扫。',
    scanned: '屏幕 = 把你手机现在看到的画面推过去；摄像头 = 用手机当实物展台。',
    'waiting-confirm': '对面会弹一个确认框，点「允许」才开始。',
    connecting: '同一个 Wi-Fi 下一般 1~3 秒。连不上多半是两台设备不在同一网段，或路由器开了 AP 隔离。',
    playing: '现在可以把手机放下去讲课了；要停就点「停止分享」。',
    stopped: '可以重新扫一次码继续。',
    error: '',
  };

  // 原生在 stopped 状态里推的是英文原因码（CastAgent.stop / CameraCastActivity.stopCast / CastService.stopCast
  // 都是原样往下传），以前直接塞进红字框，用户看到的就是光秃秃一个 "busy"。
  // 这里翻成中文；认不出来的原样显示，免得把真正的未知原因吞掉。
  const REASON = {
    busy: '手机摄像头被别的应用占着（相机、微信视频、扫码 App 都会占），关掉那个应用再扫一次',
    leave: '切到后台了，分享已停止',
    destroy: '分享界面被关掉了',
    system: '系统结束了这次共享（有的机型在通知栏点「停止」就是这样）',
    restart: '重新开始了分享',
    error: '采集出错了，请重新扫一次码',
    user: '你按了停止',
  };
  const reasonText = (s) => REASON[String(s == null ? '' : s).trim()] || String(s == null ? '' : s);

  const CP = { state: 'idle', message: '', uri: '', panel: null, refs: null, busy: false };

  const pairOf = (uri) => {
    const s = String(uri || '');
    const i = s.indexOf('?');
    if (i < 0) return null;
    const q = new URLSearchParams(s.slice(i + 1));
    const h_ = q.get('h') || '', p_ = q.get('p') || '';
    if (!h_ || !p_) return null;
    return { host: h_, port: p_, raw: s };
  };

  const setState = (st, msg) => {
    CP.state = st || 'idle';
    CP.message = msg == null ? '' : String(msg);
    if (CP.state === 'scanned') CP.uri = CP.message;
    render();
  };

  // ---------------- 原生状态推送 ----------------
  window.addEventListener('gewu-cast-state', (e) => {
    const d = (e && e.detail) || {};
    setState(d.state, d.message);
  });

  const syncFromNative = () => {
    const c = cast();
    if (!c || typeof c.state !== 'function') return Promise.resolve();
    return Promise.resolve(c.state()).then((raw) => {
      let v = raw;
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch (err) { v = null; } }
      if (v && v.state) setState(v.state, v.message);
    }).catch(() => {});
  };

  // ---------------- 面板 ----------------
  const build = () => {
    if (CP.panel) return CP.panel;
    const stateTxt = h('div', { class: 'pc-state' });
    const pairTxt = h('div', { class: 'cp-pair' });
    const tip = h('div', { class: 'pc-tip' });
    // 2.2.1 修：原来只建了 srcBox 却从未把两个来源按钮放进去，导致扫到码后「分享手机屏幕 /
    // 摄像头」两个按钮根本不出现（面板只会显示一行空的 cp-src）。按钮必须挂进 srcBox。
    const srcBox = h('div', { class: 'cp-src' });
    const paste = h('textarea', { class: 'pc-uri', rows: 2, placeholder: '也可以直接把电脑上的配对码粘贴到这里' });
    const msgBox = h('div', { class: 'cp-msg' });

    const btnScan = h('button', { class: 'gw-btn cp-primary', onclick: () => doScan() }, '扫一扫');
    const btnScreen = h('button', { class: 'gw-btn', onclick: () => doStart('screen') }, '分享手机屏幕');
    const btnCam = h('button', { class: 'gw-btn', onclick: () => doStart('camera') }, '分享手机摄像头');
    const btnPaste = h('button', { class: 'gw-btn', onclick: () => doPaste() }, '用粘贴的配对码连接');
    const btnStop = h('button', { class: 'gw-btn', onclick: () => doStop() }, '停止分享');
    // 2.2.1：手机也能当接收端 —— 点开原生 CastRecvActivity，那里面显示自己的配对码让对面来扫
    const btnRecv = h('button', { class: 'gw-btn', onclick: () => doRecv() }, '接收别人的投屏');
    const btnClose = h('button', { class: 'pc-x', title: '关闭', onclick: () => close() }, '×');

    srcBox.append(btnScreen, btnCam);

    const el = h('div', { id: 'cp-panel' },
      h('div', { class: 'pc-ph' }, h('span', {}, '手机投屏'), btnClose),
      stateTxt, pairTxt, tip,
      h('div', { class: 'cp-acts' }, btnScan),
      srcBox,
      h('div', { class: 'cp-paste' }, paste, h('div', { class: 'cp-acts' }, btnPaste)),
      h('div', { class: 'cp-acts' }, btnStop),
      h('div', { class: 'cp-acts' }, btnRecv),
      msgBox,
      h('div', { class: 'pc-note' }, '手机和电脑要在同一个 Wi-Fi（不需要外网）。分享屏幕时手机状态栏会出现投屏提示，这是系统的。'));
    document.body.append(el);
    CP.panel = el;
    CP.refs = { el, stateTxt, pairTxt, tip, srcBox, paste, msgBox, btnScan, btnScreen, btnCam, btnPaste, btnStop, btnRecv };
    return el;
  };

  const render = () => {
    if (!CP.panel) return;
    const r = CP.refs;
    const st = CP.state || 'idle';
    r.stateTxt.textContent = TEXT[st] || st;
    r.stateTxt.className = 'pc-state' + (st === 'playing' ? ' playing' : (st === 'error' ? ' error' : ''));
    r.tip.textContent = (st === 'error' || st === 'stopped' || st === 'idle')
      ? (TIP[st] || '') : (TIP[st] || '');
    const pair = pairOf(CP.uri);
    r.pairTxt.textContent = pair ? ('电脑 ' + pair.host + ':' + pair.port) : '';
    r.pairTxt.classList.toggle('on', !!pair);

    const scanned = st === 'scanned' && !!pair;
    const live = st === 'waiting-confirm' || st === 'connecting' || st === 'playing';
    r.btnScan.style.display = (scanned || live) ? 'none' : '';
    r.srcBox.style.display = scanned ? 'flex' : 'none';
    r.btnStop.style.display = (live || scanned) ? '' : 'none';
    r.paste.parentNode.style.display = scanned || live ? 'none' : '';
    r.msgBox.textContent = (st === 'error' || st === 'stopped') && CP.message ? reasonText(CP.message) : '';
    r.msgBox.style.display = r.msgBox.textContent ? '' : 'none';
    r.btnScan.disabled = !!CP.busy;
    r.btnScreen.disabled = r.btnCam.disabled = !!CP.busy;
    // 接收按钮：只在这台设备真的能收（安卓 App 有 cast.recv）且当前没在发送时出现
    const recvOk = canRecv();
    r.btnRecv.parentNode.style.display = recvOk ? '' : 'none';
    r.btnRecv.style.display = (live || scanned) ? 'none' : '';
    r.btnRecv.disabled = !!CP.busy;
  };

  // ---------------- 动作 ----------------
  const withBusy = (fn) => {
    if (CP.busy) return Promise.resolve(false);
    CP.busy = true; render();
    return Promise.resolve()
      .then(fn)
      .catch((e) => { GW.toast('操作失败：' + ((e && e.message) || e)); return false; })
      .then((r) => { CP.busy = false; render(); return r; });
  };

  const doScan = () => withBusy(() => {
    const c = cast();
    if (!c || typeof c.scan !== 'function') { GW.toast('当前环境不能发起投屏'); return false; }
    return c.scan().then((ok) => { if (!ok) GW.toast('打不开扫码界面'); return ok; });
  });

  const doStart = (kind) => withBusy(() => {
    const c = cast();
    const uri = CP.uri;
    if (!c || !uri) { GW.toast('还没有配对码，先扫一扫'); return false; }
    if (kind === 'camera') {
      if (typeof c.camera !== 'function') { GW.toast('这个版本还不支持摄像头投屏'); return false; }
      return c.camera(uri).then((ok) => { if (!ok) GW.toast('打不开摄像头界面'); return ok; });
    }
    return c.start(uri).then((ok) => { if (!ok) GW.toast('系统拒绝了屏幕共享'); return ok; });
  });

  // 接收别人的投屏：原生 CastRecvActivity 自己会显示配对码与二维码，网页这里只负责拉起它
  const doRecv = () => withBusy(() => {
    const c = cast();
    if (!c || typeof c.recv !== 'function') { GW.toast('这个版本还不能接收投屏'); return false; }
    return c.recv().then((ok) => { if (!ok) GW.toast('打不开接收界面'); return ok; });
  });

  const doStop = () => withBusy(() => {
    const c = cast();
    if (!c || typeof c.stop !== 'function') return false;
    return c.stop().then(() => { setState('stopped', ''); return true; });
  });

  const doPaste = () => withBusy(() => {
    const raw = String(CP.refs.paste.value || '').trim();
    if (!raw) { GW.toast('把电脑上的配对码粘贴进来'); return false; }
    const pair = pairOf(raw);
    if (!pair) { GW.toast('这不是一个有效的配对码'); return false; }
    setState('scanned', raw);
    CP.refs.paste.value = '';
    GW.toast('配对码已识别，选一个分享内容');
    return true;
  });

  // ---------------- 开关 ----------------
  const open = () => {
    if (canReceive()) return GW.phonecast.open();   // 电脑：走接收面板
    if (!canSend()) { GW.toast('这个环境不能发起投屏：网页版请用安卓 App，或让电脑接收'); return null; }
    build().classList.add('on');
    syncFromNative();
    render();
    return CP.panel;
  };
  const close = () => { if (CP.panel) CP.panel.classList.remove('on'); };

  GW.castphone = {
    open: open,
    close: close,
    state: () => ({ state: CP.state, message: CP.message, uri: CP.uri }),
    _set: setState,      // 探针用：不接原生也能验状态机
    _render: render,
  };

  // 电脑同时能收能发：先问一句要哪一头，别让人猜菜单点进去是哪个方向。
  const pickDirection = () => {
    let dlg = null;
    const opt = (title, desc, fn) => h('button', {
      class: 'cp-opt',
      onclick: () => { try { dlg.close(); } catch (e) { /* 已关 */ } fn(); },
    }, h('b', null, title), h('span', null, desc));
    dlg = GW.dialog({
      title: '投屏',
      width: 420,
      noFooter: true,
      body: h('div', { class: 'cp-pick' },
        opt('接收投屏', '手机扫码后把屏幕或摄像头推到这台电脑的画布上', () => GW.phonecast.open()),
        opt('发送这台电脑的屏幕', '把本机屏幕推给另一台电脑或安卓设备（对方要先开「接收投屏」）', () => { if (GW.pcsend) GW.pcsend.open(); })),
    });
    return dlg;
  };

  // 全平台唯一入口：电脑能收能发就问方向，手机开发送面板，都没有就说清楚为什么
  GW.openCast = function () {
    if (canReceive() && canPcSend()) return pickDirection();
    if (canReceive()) return GW.phonecast.open();
    if (canSend()) return open();
    GW.toast('这个环境不能投屏：Windows 端可以接收；安卓 App 可以扫码发送；浏览器网页版不支持');
    return null;
  };
})();
