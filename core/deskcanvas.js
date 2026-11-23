// 桌面画布：把当前页的背景换成实时桌面画面，画布上的工具（书写、图形、对象、AI、框选）全部照常用。
// 与旧的「桌面批注」不同：不是叠在系统上的透明批注层，而是同一个窗口里的一张新画布，
// 这样对象卡片、公式、选中框、撤销历史、导出、协同都能直接复用。
(function () {
  'use strict';
  if (!window.GW) return;

  let stream = null;        // MediaStream（桌面采集）
  let video = null;         // 隐藏的 <video>，画面来源
  let fake = null;          // 探针用：直接给一张 canvas 当画面
  // 把 video 当前帧按「原生像素」先拷到一张离屏画布，再从这张画布做 cover 缩放。
  // 为什么不直接把 <video> 交给 drawImage 缩放：Windows 上 desktopCapturer 的输出
  // 若被 constraints 的 maxWidth/maxHeight 改写过尺寸，Chromium 在做「视频帧 → 画布」
  // 的缩放采样时会出现整行重复的横条（反馈里的「不断重复的横条」）。1:1 拷贝只走一次
  // 原生分辨率采样，横条消失；缩放交给普通 2D 画布，结果稳定。
  let shot = null;          // 最近一帧的原生分辨率快照
  let timer = 0;
  let ticks = 0;            // 画面更新计数，背景缓存靠它判断「要不要重画」
  let last = 0;
  let pending = false;      // 正在弹来源选择框

  const FPS = 8;            // 8 帧够用：背景是桌面，不是视频播放

  function page() { return GW.page(); }
  function active() { const p = page(); return !!(p && p.desk); }
  function tick() { return ticks; }

  function drawCover(ctx, src, sw, sh, W, H) {
    if (!sw || !sh) return false;
    const k = Math.max(W / sw, H / sh);
    const dw = sw * k, dh = sh * k;
    ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return true;
  }

  // 取 video 的当前帧 → 原生分辨率快照（分辨率变了就重建）。
  // 返回 false 表示这一帧还不能读（readyState 不够 / 尺寸还没出来）。
  function grabFrame() {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return false;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!shot || shot.width !== vw || shot.height !== vh) {
      shot = document.createElement('canvas');
      shot.width = vw;
      shot.height = vh;
    }
    const sx = shot.getContext('2d', { alpha: false });
    if (!sx) return false;
    try {
      sx.drawImage(video, 0, 0, vw, vh);
    } catch (e) {
      return false;   // 帧正在切换 / 被回收：这一次不画，下一帧再来
    }
    return true;
  }

  // 由 board 的背景层调用：画一帧桌面
  function paintBg(ctx, W, H) {
    if (fake) { drawCover(ctx, fake, fake.width, fake.height, W, H); return; }
    if (grabFrame()) { drawCover(ctx, shot, shot.width, shot.height, W, H); return; }
    if (video && video.readyState >= 2 && video.videoWidth) {
      // 快照失败（极少见）就直接画 video，至少不让背景空一帧
      drawCover(ctx, video, video.videoWidth, video.videoHeight, W, H);
      return;
    }
    // 还没画面（刚建页 / 重启后没重新采集）：写明怎么恢复，别给一块黑屏让人以为坏了
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '15px "Microsoft YaHei", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('窗口画布：还没有采集画面', W / 2, H / 2 - 12);
    ctx.font = '13px "Microsoft YaHei", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('点「窗口画布」重新选一个应用窗口', W / 2, H / 2 + 14);
  }

  function repaint() {
    if (GW.repaintBg) GW.repaintBg();
    else GW.requestRender();
  }

  function pump() {
    const now = Date.now();
    if (now - last < 1000 / FPS) return;
    last = now;
    if (!active()) return;
    ticks++;
    repaint();
  }

  function stopStream() {
    if (timer) { clearInterval(timer); timer = 0; }
    if (stream) { try { stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* 已停 */ } }
    stream = null;
    if (video) { try { video.pause(); video.srcObject = null; video.remove(); } catch (e) { /* 已移除 */ } }
    video = null;
  }

  function attach(ms) {
    stopStream();
    stream = ms;
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.style.cssText = 'position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    try { video.srcObject = ms; } catch (e) { /* 探针给的假流不接受 srcObject */ }
    document.body.appendChild(video);
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
    timer = setInterval(pump, 1000 / FPS);
    ticks++;
    repaint();
  }

  async function capture(sourceId) {
    // 1.1.14（反馈 1）：以前这里钉了 maxWidth:1920 / maxHeight:1200。
    // 老师的高分屏（2K/4K、或 150% 缩放的笔记本）采集请求的尺寸与屏幕原生尺寸不一致，
    // Chromium 22 在 Windows 上会给每一帧做一次缩放采样，缩放后的帧被合成到画布上时
    // 出现整行重复的横条（就是「不断重复的横条」）。尺寸约束在这里没有任何好处：
    // 背景铺满靠 drawCover，8fps 的带宽也不是瓶颈 —— 直接要原生尺寸，交给离屏画布缩放。
    const constraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxFrameRate: FPS,
        },
      },
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  // 新建一页，把它标成桌面画布
  function ensurePage(src) {
    if (active()) {
      const p = page();
      p.desk = { id: src.id, name: src.name, at: Date.now() };
      GW.markDirty();
      return page();
    }
    GW.addPage();
    const p = page();
    p.desk = { id: src.id, name: src.name, at: Date.now() };
    p.bg = Object.assign({}, p.bg, { pattern: 'none' });   // 桌面当背景，网格线就别再叠上去了
    GW.markDirty();
    if (GW.syncDoc) GW.syncDoc();
    return p;
  }

  function pick(list) {
    return new Promise((resolve) => {
      let sel = list[0] || null;
      const row = (s) => {
        const b = GW.h('button', {
          class: 'ds-src', type: 'button',
          onclick: () => { sel = s; [...box.querySelectorAll('.ds-src')].forEach((x) => x.classList.toggle('on', x === b)); },
        },
        GW.h('img', { class: 'ds-thumb', src: s.thumb || '', alt: '' }),
        GW.h('span', { class: 'ds-name', title: s.name }, s.name));
        if (sel === s) b.classList.add('on');
        return b;
      };
      const box = GW.h('div', { class: 'ds-list' }, list.map(row));
      const dlg = GW.dialog({
        title: '窗口画布',
        width: 600,
        body: GW.h('div', null,
          GW.h('p', { class: 'ds-hint' }, '选一个应用窗口当这张画布的背景（整屏采集已移除）。画布上的书写、图形、框选、AI 都能照常用；这一页可以随文档保存，下次打开还需要重新采集一次画面。'),
          box),
        ok: '开始',
        onOk: () => { resolve(sel); return true; },
        onClose: () => resolve(null),
      });
      dlg.body && dlg.body.querySelector('.ds-src.on') && dlg.body.querySelector('.ds-src.on').focus();
    });
  }

  async function open() {
    if (!GW.isElectron) return GW.toast('窗口画布只在桌面版里能用');
    if (pending) return;
    pending = true;
    try {
      let list = [];
      try {
        list = (await window.gewu.deskSources()) || [];
      } catch (e) {
        GW.toast('列不出窗口：' + (e && e.message ? e.message : e));
        return;
      }
      // 1.1.14：按反馈删掉「整屏采集」，只留单个应用窗口。
      // 整屏那套（每秒 8 次截自己屏幕当背景）会和桌面批注层抢同一块区域；
      // 单个窗口仍有独立用途（PPT 演讲者视图、只标某个 exe 的画面）。
      list = list.filter((s) => !s.isScreen);
      if (!list.length) return GW.toast('没有可采集的窗口：先把要标的应用窗口打开');
      const src = await pick(list);
      if (!src) return;
      let ms = null;
      try { ms = await capture(src.id); } catch (e) {
        GW.toast('采集失败：' + (e && e.message ? e.message : e));
        return;
      }
      ensurePage(src);
      attach(ms);
      GW.toast('已切到窗口画布 · ' + src.name);
      GW.bus.emit('desk', { on: true, src });
    } finally {
      pending = false;
    }
  }

  // 关闭采集：这一页回到普通纸面，已写的内容都留着
  function close() {
    const p = page();
    if (p && p.desk) { delete p.desk; GW.markDirty(); if (GW.syncDoc) GW.syncDoc(); }
    stopStream();
    ticks++;
    repaint();
    GW.toast('已关闭桌面画面，这一页变回普通纸面');
    GW.bus.emit('desk', { on: false });
  }

  function toggle() {
    if (pending) return;
    if (active()) {
      // 已经在这张桌面画布上：给「重新采集」还是「关闭」两个选择
      GW.dialog({
        title: '窗口画布',
        width: 420,
        body: GW.h('p', null, '这一页已经跟桌面连着了。要换个屏幕/窗口，还是关掉画面变回纸面？'),
        ok: '重新采集',
        onOk: () => { stopStream(); delete page().desk; open(); return true; },
      });
      // 第二个按钮直接挂在 body 里，dialog 只给一个 ok
      const d = [...document.querySelectorAll('.dlg-wrap')].pop();
      const foot = d && d.querySelector('.dlg-f');
      if (foot) foot.insertBefore(GW.h('button', { class: 'gw-btn', type: 'button', onclick: () => { d.remove(); close(); } }, '关闭采集'), foot.firstChild);
      return;
    }
    open();
  }

  // 探针入口：不碰真采集，直接喂一张画面
  function setFake(cv) {
    fake = cv || null;
    ticks++;
    repaint();
  }

  GW.desk = { open, close, toggle, active, tick, paintBg, setFake, _stream: () => stream, _fake: () => fake };

  // 切页时：离开桌面页要停采集，回到桌面页要提示重新采集
  GW.bus.on('page', () => {
    if (!active()) { stopStream(); ticks++; repaint(); }
    else if (!stream && !fake) { ticks++; repaint(); }
  });
})();
