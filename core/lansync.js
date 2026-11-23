/* 局域网协同（渲染层）
 *
 * 桌面端：起一个本机静态站（main/lansync.js），把网址与配对码显示给老师；
 * 平板端：用浏览器打开那个网址（`?k=配对码`），从此两边是「同一份文档的两块屏」。
 *
 * 同步粒度是「操作」（GW.commit 的那条 op），不是整份文档：
 * 每写一笔就往下推一条几百字节的 op，平板上是同一套渲染代码把它画出来。
 * 平板打开时先要一份快照（不含图片字节），图片/PDF 这些资产按需再拉。
 */
(function () {
  // 1.1.13（R12）：「本机有服务能力」只对 app:// 下的桌面窗口成立。
  // 另一台电脑用浏览器/桌面端打开「电脑那台」页面时是 http(s) 域，preload 也还在
  // （window.gewu.lan 存在），但这一页是**客户端**，不是宿主 —— 不排掉的话它不会
  // 去 clientConnect，反而弹「开启协同」面板，两边根本连不上。
  const isWebPage = () => /^https?:$/.test(location.protocol);
  const has = () => !!(window.gewu && window.gewu.lan) && !isWebPage();
  const param = (k) => new URLSearchParams(location.search).get(k);

  const LS = {
    live: false,
    // 1.1.13（R12）：「电脑那台」的基准地址（形如 http://192.168.1.5:47810）。
    // 桌面端自己开服时保持空串（相对路径就打自己的本机服务，行为与以前完全一致）；
    // 平板浏览器 / 安卓包 / 另一台电脑用 join() 把它设成电脑的地址 —— 只有这样才能把
    // 下面那些 '/op'、'/sync'、'/asset' 相对路径打成绝对地址（以前在别的域 / file://
    // 下全是 404，等于根本连不上）。
    base: '',
    applying: false,     // 正在应用远端消息：此时不回流，否则两端互相弹球
    code: '',
    url: '',
    cid: '',             // 服务端给的连接 id：POST 时带回，服务端据此跳过「自己发的消息」
    tok: '',             // 服务端随 hello 发的会话令牌：写操作必须带，防「省略 cid / 冒用 cid」
    // 审计 GW-F14（P1）：设备标识 —— 连接 id 是一次性的，断线重连就换；分组书写权限必须挂在
    // 这个可恢复的身份上，否则「断一次线 = 区域限制消失」，权限反而被放大。
    devid: '',
    // 审计 GW-F21（P2）：宿主文档代际（服务端在 hello / snap 里给）。结构变过就必须走快照，
    // 不能只补环形缓冲里的 op/goto —— 增删页不会出现在增量里。
    gen: 0,
    clients: 0,
    es: null,
    liveAt: {},          // 每种实时消息上次发出的时间（限频用）
    camAt: 0,            // 本机最后一次「用户自己」动相机的时间（远端相机别跟它抢）
    // 1.1.13：平板端记住「发送方最近一次相机」（世界中心 + 倍率 + 发送方视口）。
    // 翻页 / 资产重挂 / 断线重连 / 转屏 都要重新按本机视口贴合，不能只靠那一条实时 'c'。
    rcam: null,          // {cx, cy, s, vw, vh}
    camApplied: null,    // 上次贴合写下去的相机 {tx, ty, s, w, h}：用来判断「用户自己动过没有」
    vpHooked: false,
    lastMsgAt: 0,        // 1.1.14：最后一次收到任何 SSE 事件的时间（看门狗判半开连接）
    // 1.4.4（R1）：宿主侧「允许平板书写」的真值。面板每 2 秒重写勾选状态，
    // 而 info() 以前不带 locked ⇒ 恒判成「没锁」⇒ 勾自己弹回来（权限其实已生效）。
    serverLocked: false,
    serverList: null,    // 同一次 IPC 里的已连接平板列表（讨论区按钮靠它，以前也恒空）
    // 1.4.4（R3）：本机最近发出去的文档 op。快照代表宿主的版本，若直接覆盖，
    // 这些「已发未确认」的擦除/清屏就被静默回滚 —— 到达后按顺序重放回来。
    recent: [],
    missCount: 0,        // 1.4.4（R5）：applyRemote 找不到页的次数（pageId 分叉时的自愈计数）
    snapOnce: false,     // 1.4.7（R10）：本次连接已经收过快照 —— 之后的快照不再拽动页面
  };

  // 所有对「电脑那台」的请求都从这里出：base 为空 ⇒ 原样返回（桌面端零变化）。
  const url = (p) => (LS.base || '') + p;

  // 审计 GW-F14：课堂身份的落点。存在 localStorage（key 前缀仍是 gewu.），重连/刷新/换 Wi-Fi
  // 都不变；隐私模式写不进去时退回「本次页面生命期内稳定」的随机值 —— 仍比连接 id 强，
  // 至少同一次课内的断线重连能保住区域限制。
  const DEVKEY = 'gewu.lan.devid';
  function devId() {
    if (LS.devid) return LS.devid;
    let v = '';
    try { v = localStorage.getItem(DEVKEY) || ''; } catch (e) { v = ''; }
    if (!v) {
      v = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(DEVKEY, v); } catch (e) { /* 隐私模式：只在本页有效 */ }
    }
    LS.devid = v;
    return v;
  }

  function syncPage(i) {
    if (!LS.live || LS.applying) return;
    if (has()) window.gewu.lan.goto(i);
    else if (LS.es) post({ type: 'goto', i });
  }

  // 翻页也同步：两台屏必须停在同一页
  function hookPage() {
    if (GW.__lanPageHooked) return;
    GW.__lanPageHooked = true;
    const orig = GW.gotoPage;
    GW.gotoPage = function (i) {
      orig(i);
      syncPage(GW.doc.cur);
      // 1.4.8（R12）：页码之外再补一帧相机，平板才不会用上一页的取景去显示新页
      if (has()) pushCam();
    };
  }

  function applyPage(i) {
    if (!(i >= 0)) return;
    // 1.1.13：平板翻页时不能只是 gotoPage —— 那一页存的是**桌面**的相机（tx/ty/s 都按 1920 宽算的），
    // 照搬到 1024 宽的平板上，横向正好被切掉一半（老师说的「只显示一部分」）。走 clientGoto 重新贴合。
    if (!has() && LS.rcam) { clientGoto(i); return; }
    LS.applying = true;
    try { GW.gotoPage(i); } finally { LS.applying = false; }
  }

  // 1.1.13：平板端翻页 / 重挂资产统一入口：gotoPage 之后把该页的相机换成「世界中心」，
  // 再按本机视口贴合（camFit）。LS.rcam.vw/vh 是发送方的视口，用它才能把桌面的 tx/ty 反算成世界点。
  function clientGoto(i) {
    LS.applying = true;
    try {
      GW.gotoPage(i);
      const s = LS.rcam;
      const cam = (s && camFromView(GW.page() && GW.page().view, s.vw, s.vh)) || s || null;
      if (cam) applyCam(cam);
    } finally {
      LS.applying = false;
    }
  }

  // ---------- 快照 ----------
  function snapshot() {
    const doc = JSON.parse(GW.serialize());
    const assets = [];
    for (const id of Object.keys(doc.assets || {})) {
      const a = doc.assets[id];
      assets.push({ id, mime: a.mime, name: a.name, data: a.data });
    }
    doc.assets = {};
    // 1.1.13：快照必须带上「发这一份快照的那台机器看到的画面」。
    // 以前相机只走实时 'c'，快照/翻页都不带 ⇒ 平板连上时若老师没再平移缩放，
    // 它就永远收不到相机，用自己的默认相机（原点、s=1）显示，看起来就是「只显示画布的一部分」。
    return { doc, assets, cur: GW.doc.cur, cam: camOf(GW.camera), settings: JSON.parse(JSON.stringify(GW.settings || {})), bits: { ver: GW.APP_VERSION || '' } };
  }

  async function pushSnapshot() {
    const snap = snapshot();
    if (has()) {
      if (snap.assets.length) await window.gewu.lan.assets(snap.assets);
      await window.gewu.lan.snapshot(snap);
    }
    return snap;
  }

  async function applySnapshot(snap) {
    if (!snap || !snap.doc) return;
    // 1.4.7（R10）：记下本机当前页。快照是对账，不是翻页指令 —— 下面 GW.loadDoc 会把 cur
    // 换成宿主那一页，而 applySnapshot 末尾的 clientGoto(snap.cur) 等于再确认一次，
    // 平板正在写的页就被拽走了（用户反馈的「页面跳变」）。只有本次连接的**第一份**快照
    // 才跟随宿主（首连/重连要看到老师正在讲的那页），之后的快照都留在本机那页。
    const prevId = (GW.doc && GW.doc.pages && (GW.doc.pages[GW.doc.cur] || {}).id) || '';
    const firstSnap = !LS.snapOnce;
    clearGhosts();   // 快照会把整份文档换掉，旧的过程笔迹没有意义
    LS.applying = true;
    try {
      GW.loadDoc(snap.doc);
      for (const a of snap.assets || []) {
        if (GW.doc.assets[a.id]) continue;
        // 2.2.x：快照自带字节就直接用。手机当主机（LanHost）没有 /asset 路由，
        // 一律去 fetch 的话客户端永远拿不到图片；桌面端 host 仍是「快照不给字节」的老行为，
        // 那时才按需拉。key 的算法与下面 fetch 分支逐字相同，只把 b64 换成 a.data。
        if (a && a.data) {
          GW.doc.assets[a.id] = { key: a.data.length + ':' + a.data.slice(0, 64) + a.data.slice(-64), mime: a.mime, name: a.name, data: a.data };
          continue;
        }
        // 优先从服务端按需拉；拿不到就先空着（对象会显示占位，不炸）
        try {
          const b64 = await fetch(url('/asset?k=' + encodeURIComponent(LS.code) + '&id=' + encodeURIComponent(a.id))).then((r) => (r.ok ? r.text() : ''));
          if (b64) GW.doc.assets[a.id] = { key: b64.length + ':' + b64.slice(0, 64) + b64.slice(-64), mime: a.mime, name: a.name, data: b64 };
        } catch (e) { /* 单张图片失败不影响整份板书 */ }
      }
      // 1.4.4（R3）：快照只代表**宿主**此刻的版本。本机刚发出去、还在出站队列里（或刚到、
      // 宿主还没应用）的 op 若被这一刀覆盖掉，就是老师看到的「擦掉的部分过一会儿又回来了」。
      // 这里按入队顺序重放一遍：remove 按 id、add 按 id 去重，重复投递不会产生第二份，
      // 所以重放是幂等的。必须先 loadDoc 再重放（反过来会被快照盖回去）。
      if (!has() && LS.recent.length) {
        const ops = LS.recent.slice();
        LS.recent.length = 0;   // 先清再放：applyRemote 里万一又产生 op 也不会被这次重放吞掉
        for (const op of ops) { try { GW.applyRemote(op); } catch (e) { /* 单条重放失败不影响其余的 */ } }
      }
      if (snap.cam) LS.rcam = snap.cam;   // 1.1.13：先记下发送方的画面，clientGoto 用它贴合
      if (snap.settings) applySettingsMsg({ all: true, settings: snap.settings });   // 1.1.15：连上来就先对齐外观与设置
      // 之后的快照留在本机原来那页（那页还在的话），页被删了才跟随宿主
      const pi = (!firstSnap && prevId) ? GW.doc.pages.findIndex((p) => p.id === prevId) : -1;
      clientGoto(pi >= 0 ? pi : (snap.cur || 0));
      LS.snapOnce = true;
    } finally {
      LS.applying = false;
    }
  }

  // 平板端：远端插进来的图片 / PDF 字节不在本地，按需拉一次（拉不到先空着，不炸）
  async function fillAssets(items) {
    if (has() || !LS.code) return;
    for (const it of items || []) {
      const id = it && it.data && it.data.asset;
      if (!id || GW.doc.assets[id] || (LS.pulling && LS.pulling[id])) continue;
      (LS.pulling || (LS.pulling = {}))[id] = 1;
      try {
        const b64 = await fetch(url('/asset?k=' + encodeURIComponent(LS.code) + '&id=' + encodeURIComponent(id))).then((r) => (r.ok ? r.text() : ''));
        if (b64) {
          GW.doc.assets[id] = { key: b64.length + ':' + b64.slice(0, 64) + b64.slice(-64), mime: it.data.mime || 'application/octet-stream', name: it.data.name || '', data: b64 };
          // 资产到位后重挂这一页的对象，否则图像对象会停在占位
          // 1.1.13：重挂会重新套用该页存的相机 —— 平板必须再贴合一次，否则一拉图片画面就跳回桌面视角。
          if (!has() && LS.rcam) clientGoto(GW.doc.cur);
          else {
            LS.applying = true;
            try { GW.gotoPage(GW.doc.cur); } finally { LS.applying = false; }
          }
        }
      } catch (e) { /* 单张失败不影响整份板书 */ }
      delete LS.pulling[id];
    }
  }

  // 1.4.8（R11）：桌面端「只存了本地路径」的对象（视频 / 网页课件 / 文档卡片 / PPT 卡片）
  // 以前永远不会被转成资源（data.asset），平板收到的 data.path 是一条它读不到的桌面路径：
  // 视频黑框、网页空白、PPT 卡片点开只提示「浏览器版无法打开本地程序」。
  // 这里在协同开始时（以及之后新导入的同类对象）把它们读成资源、注册进宿主资产表，再发一条
  // update op；接收端照旧走 fillAssets 按 id 拉字节。上限与 importer 的 EMBED_LIMIT 对齐 ——
  // 转进来的字节要随快照/资产通道下发，比「本来就会嵌入的体量」再大就没有意义了。
  const ADOPT_MAX = 25 * 1024 * 1024;
  const MIME_BY_EXT = {
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', aac: 'audio/aac',
    html: 'text/html', htm: 'text/html', pdf: 'application/pdf',
  };
  const adoptBusy = {};
  let adoptWarned = false;
  function pathOfObj(o) {
    const d = o && o.data;
    if (!d || d.asset) return '';
    if (d.libRel && GW.libRoot) return GW.libRoot + '/' + d.libRel;
    return d.path || '';
  }
  async function adoptPathObj(page, o) {
    if (!has() || !GW.isElectron || !o || adoptBusy[o.id]) return false;
    // op 里带的是快照副本，真正要改的是本机这一份
    const live = page ? (page.objs || []).filter((x) => x.id === o.id)[0] : null;
    if (live) o = live;
    const p = pathOfObj(o);
    if (!p) return false;
    adoptBusy[o.id] = 1;
    try {
      const st = await window.gewu.fileInfo(p);
      if (!st || !st.exists) return false;
      const name = o.data.name || p.split(/[\\/]/).pop() || '';
      if (st.size > ADOPT_MAX) {
        if (!adoptWarned) {
          adoptWarned = true;
          GW.toast('「' + name + '」超过 25MB，未随协同下发（平板端打不开它）', 4200);
        }
        return false;
      }
      const b64 = await window.gewu.readFile(p, 'base64');
      if (!b64) return false;
      const ext = (p.split('.').pop() || '').toLowerCase();
      const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
      const before = GW.clone(o);
      const aid = GW.assets.put(b64, mime, name);
      if (GW.invalidate) { try { GW.invalidate(o); } catch (e) { /* 没缓存可清就算了 */ } }
      o.data.asset = aid;
      const after = GW.clone(o);
      // 先注册字节再发 op：接收端收到 update 会立刻按 id 来拉，晚一步就是一次 404
      try { await window.gewu.lan.assets([{ id: aid, mime, name, data: b64 }]); } catch (e) { /* 没开协同就算了 */ }
      if (GW.syncEmit) GW.syncEmit({ pageId: (page && page.id) || '', update: [{ id: o.id, before, after }] });
      if (GW.markDirty) GW.markDirty();
      return true;
    } catch (e) {
      return false;   // 读不到（文件被移走/权限）就维持原样，不影响其它对象
    } finally { delete adoptBusy[o.id]; }
  }
  async function adoptAllPaths() {
    if (!has() || !GW.isElectron) return 0;
    let n = 0;
    for (const page of (GW.doc && GW.doc.pages) || []) {
      for (const o of page.objs || []) {
        if (pathOfObj(o) && (await adoptPathObj(page, o))) n++;
      }
    }
    return n;
  }
  // 连上平板之后才导入的那一批：新人到的 op 里同样要转（否则只有重连才修得好）
  function adoptOp(op) {
    if (!has() || !GW.isElectron || !op) return;
    const page = op.pageId ? (GW.doc.pages || []).filter((p) => p.id === op.pageId)[0] : null;
    for (const it of op.add || []) if (pathOfObj(it)) adoptPathObj(page, it);
    for (const u of op.update || []) if (u && pathOfObj(u.after)) adoptPathObj(page, u.after);
  }

  function applyRemote(op) {
    // 1.1.14：applying 必须在同一次事件里复位。以前用 requestAnimationFrame 复位，
    // 窗口最小化/平板切后台时 rAF 会停，applying 永远停在 true —— 之后 netLive 全部被
    // 挡掉，双端「都显示已连接、写上去却不动」。这里改成 finally 同步复位。
    LS.applying = true;
    let ok = true;
    try { ok = GW.applyRemote(op); } finally { LS.applying = false; }
    // 1.4.4（R5）：applyRemote 找不到页会 return false，以前调用方完全不看返回值 ——
    // 一旦某页 pageId 分叉（新增/删除页走 syncDoc 的窗口期），那一页的擦除/撤销永久静默失效。
    // 客户端每连续丢到第 1/6/11… 条就主动索一次快照，把「永久静默」变成「最多几条后自愈」。
    if (ok === false) {
      LS.missCount++;
      if (LS.missCount % 5 === 1 && !has() && GW.syncDoc) GW.syncDoc();
    }
    fillAssets(op && op.add);
    // 1.4.8（R11）：path→asset 的转换走的是 update op，这条也要按需拉字节
    if (op && op.update) fillAssets(op.update.map((u) => u && u.after));
    // 远端把这一笔正式落下来了：临时笔迹要让位（否则会和真笔迹叠成一条双线）
    if (op && op.add && op.add.length) dropGhosts(op.add.map((it) => it && it.id));
  }

  // ---------- 实时层（1.2.0） ----------
  // 过程性消息（书写中的笔画 / 平移缩放 / 拖动对象 / 仿真播放）不进历史、不落盘，
  // 只画在 live 画布上；等真正提交时那条 op 到了，临时显示自动让位。
  const ghosts = new Map();          // 远端正在写的笔画：id → 假笔迹对象
  // 1.4.3：本机刚发出去的笔迹 id —— 服务端广播偶尔可能在 hello 之前就到（那时 cid 还没拿到），
  // 于是自己的笔会被当成「远端的」再画一条幽灵笔迹，看起来就是「写一笔出现两条、还很像折线」。
  // 本地记一份 id 直接挡掉，不依赖服务端的回声过滤。
  const mine = new Map();
  let ghostOff = null, ghostFrame = 0, ghostSweepAt = 0;
  // 1.4.2：临时笔迹若一直没等到正式 op（对端断线 / 收笔消息丢了 / 旧版回声），
  // 就会永久留在 live 层 —— 老师看到的是「同一笔有两条，其中一条怎么擦都擦不掉、
  // 撤销也撤不掉」。所以给 ghost 加时间戳，超过 7 秒一律清掉：最坏情况只是过程笔迹晚一点消失。
  const GHOST_TTL = 7000;
  // 1.1.2：收笔（sx）后不再立刻删临时笔迹 —— 对方紧接着会发正式 op，先删再插会让那一笔
  // 「闪一下不见了又回来」。改成打 done 标记，等 op 到达时由 dropGhosts 清；op 丢了就靠这个宽限期兜底。
  const GHOST_DONE = 600;
  function sweepGhosts() {
    const now = Date.now();
    if (now - ghostSweepAt < 400) return;
    ghostSweepAt = now;
    let hit = false;
    for (const [id, s] of ghosts) {
      if (now - (s.at || 0) > GHOST_TTL || (s.done && now - s.done > GHOST_DONE)) { clearGhostDev(s); ghosts.delete(id); hit = true; }
    }
    if (hit) { if (ghostFrame) return; ghostFrame = requestAnimationFrame(() => { ghostFrame = 0; GW.requestLive(); }); }
  }

  // 1.3.0（R4a）：device 矩形是否有交叠（ghost 增量绘制用）
  function devOverlap(a, b) {
    return !!(a && b) && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }
  function devUnion(a, b) {
    if (!a) return b;
    if (!b) return a;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  }
  function ensureGhostLayer() {
    if (ghostOff || !GW.live || !GW.live.persist) return;
    // 1.3.0（R4a）：ghost 改成**增量绘制** —— 每帧只画新增的那一段，画过的像素不再重描。
    // 以前每帧对每条 ghost 调一次 drawItem（整条重描、抽稀上限 160 点），远端连写时
    // N 条 ghost × 160 段全在主线程上跑，和书写抢帧。
    // 现在 ghost 不再 mark() 自己的范围（mark 意味着「下一帧请清掉我」，清了就得重画），
    // 只在整层/局部被清到与自己交叠时整条重画；消失时用 GW.liveClearRect 擦掉占过的块。
    // 高亮是半透明的，重叠会加深，这类不能增量 —— 仍走「每帧 mark + 整条重画」。
    ghostOff = GW.live.persist((ctx, o) => {
      const cleared = o && o.cleared;
      const rectOf = o && o.rectOf;
      for (const s of ghosts.values()) {
        if (!s.pts || s.pts.length < 4) continue;
        const n = s.pts.length / 2;
        if (s.hl) {
          if (o && o.mark) { const b = GW.bbox(s); if (b) o.mark(b.x, b.y, b.x + b.w, b.y + b.h); }
          GW.drawItem(ctx, s);
          s.drawn = n;
          continue;
        }
        let from = s.drawn || 0;
        // 本帧被清过（整层或局部）：只有和自己有交叠才需要整条重画
        if (cleared === 'full') { from = 0; s.dev = null; }
        else if (cleared && devOverlap(s.dev, cleared)) { from = 0; s.dev = null; }
        if (n <= from) continue;          // 没有新增点：这一帧什么都不画（画过的像素还在）
        const seg = from >= 2 ? Object.assign({}, s, { pts: s.pts.slice((from - 2) * 2) }) : s;
        GW.drawItem(ctx, seg);
        s.drawn = n;
        const b = GW.bbox(seg);
        if (b) {
          s.wb = s.wb ? { x: Math.min(s.wb.x, b.x), y: Math.min(s.wb.y, b.y),
            w: Math.max(s.wb.x + s.wb.w, b.x + b.w) - Math.min(s.wb.x, b.x),
            h: Math.max(s.wb.y + s.wb.h, b.y + b.h) - Math.min(s.wb.y, b.y) } : b;
          if (rectOf) s.dev = devUnion(s.dev, rectOf([[b.x, b.y, b.x + b.w, b.y + b.h]]));
        }
      }
    });
  }
  // ghost 消失：把它画过的世界矩形登记成「下一帧只清不画」
  function clearGhostDev(s) {
    if (s && s.wb && !s.hl && GW.liveClearRect) GW.liveClearRect(s.wb.x, s.wb.y, s.wb.x + s.wb.w, s.wb.y + s.wb.h);
  }
  function kickGhost() {
    sweepGhosts();
    ensureGhostLayer();
    if (ghostFrame) return;
    ghostFrame = requestAnimationFrame(() => { ghostFrame = 0; GW.requestLive(); });
  }
  function dropGhosts(ids) {
    let hit = false;
    for (const id of ids || []) {
      const s = id && ghosts.get(id);
      if (s) { clearGhostDev(s); ghosts.delete(id); hit = true; }
    }
    if (hit) kickGhost();
  }
  function clearGhosts() {
    if (!ghosts.size) return;
    for (const s of ghosts.values()) clearGhostDev(s);
    ghosts.clear();
    kickGhost();
  }

  // ---------- 远端激光笔（1.1.16 · R1） ----------
  // 发送端（src/core/input.js:1182 / :1229）一直在发 {k:'lsr'}，接收端的 applyLive 却从来没有分支 ——
  // 协同里老师拿激光笔在屏幕上指划，另一端什么都不出现，等于「指了个寂寞」。
  // 轨迹照旧画在实时层（不进历史、不落盘）；淡出用固定的 4s 保持 + 1.2s 淡出，
  // 不跟发送端的 settings.laser.hold 走 —— 那个值没随消息发过来，两端各读各的必然不同步。
  // 发送端发的是**整条轨迹的抽稀快照**（不是增量），所以这里直接整体替换 pts。
  const rLaser = new Map();            // id → {pts:[x,y,t,…], color, width, done, touch}
  let rLaserOff = null, rLaserFrame = 0;
  const RLSR_HOLD = 4000, RLSR_FADE = 1200;
  function kickRemoteLaser() {
    if (rLaserFrame) return;
    rLaserFrame = requestAnimationFrame(() => { rLaserFrame = 0; GW.requestLive(); });
  }
  function ensureRemoteLaserLayer() {
    if (rLaserOff || !GW.live || !GW.live.add || !GW.laser || !GW.laser.paint) return;
    rLaserOff = GW.live.add((ctx, { mark }) => {
      const t = performance.now(), k = GW.camera.s, glow = !GW.perf || GW.perf.glow;
      let alive = false;
      for (const [id, tr] of rLaser) {
        const idle = t - (tr.touch || 0);
        const alpha = idle <= RLSR_HOLD ? 1 : Math.max(0, 1 - (idle - RLSR_HOLD) / RLSR_FADE);
        if (alpha <= 0) { rLaser.delete(id); continue; }
        if (tr.pts.length >= 6) {
          // 实时层只清上一帧占过的矩形：不 mark 就会留下「擦不掉的残影」
          if (mark) {
            let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
            for (let i = 0; i < tr.pts.length; i += 3) { x1 = Math.min(x1, tr.pts[i]); y1 = Math.min(y1, tr.pts[i + 1]); x2 = Math.max(x2, tr.pts[i]); y2 = Math.max(y2, tr.pts[i + 1]); }
            const pad = 16 / k;
            mark(x1 - pad, y1 - pad, x2 + pad, y2 + pad);
          }
          GW.laser.paint(ctx, tr, alpha, k, glow);
        }
        alive = true;   // 还在淡出也得多画几帧，否则半透明那一段根本没人重画
      }
      if (!alive) { rLaserOff && rLaserOff(); rLaserOff = null; }
      return alive;
    });
  }
  function applyRemoteLaser(m) {
    if (m.gone) { if (rLaser.delete(m.id)) kickRemoteLaser(); return; }
    let tr = rLaser.get(m.id);
    if (!tr) { tr = { pts: [], color: '#ff2d55', width: 6, done: false, touch: 0 }; rLaser.set(m.id, tr); }
    if (m.color) tr.color = m.color;
    if (m.width) tr.width = m.width;
    if (Array.isArray(m.pts)) {
      // 线上只传 x/y（时间戳是本机时钟，对端没意义）；paintLaser 的 pts 是 [x,y,t] 三 stride，补 0。
      const src = m.pts, n = Math.floor(src.length / 2), out = new Array(n * 3);
      for (let j = 0, i = 0; i < n; i++, j += 2) { out[i * 3] = src[j]; out[i * 3 + 1] = src[j + 1]; out[i * 3 + 2] = 0; }
      tr.pts = out;
    }
    if (m.done) tr.done = true;
    tr.touch = performance.now();
    ensureRemoteLaserLayer();
    kickRemoteLaser();
  }
  // 切页：远端激光是临时标记，不该跟着跑到新页上（与发送端 clearLaser 对称）
  function clearRemoteLaser() { if (rLaser.size) { rLaser.clear(); kickRemoteLaser(); } }
  if (GW.bus && GW.bus.on) GW.bus.on('page', clearRemoteLaser);

  // ---------- 文档对账（1.1.16 · R2） ----------
  // 增量流没有 ack：客户端出站队列失败 30 次 / 60 秒就整条丢弃（pump），服务端 ring 只有 300 条，
  // 中间丢一条，对端就永久缺一块，而且再没有任何机制能纠正它 —— 用户说的「有时擦除/清屏对面没反应」，
  // 最后都收敛成这个形状。这里让宿主每 5 秒广播一次「当前页指纹」，客户端算同一份指纹，
  // 对不上就索要整份快照（GW.syncDoc 的 {snapreq:1} 通道早就存在，只是以前没人触发）。
  const REV_EVERY = 5000;
  // 1.4.7（R10）：指纹必须是**内容集合**指纹，与数组顺序无关 —— 这是平板「书写中突然跳变」的根因。
  // 老师 PC + 平板同时写时，两端的数组顺序天然不同：自己写的笔迹落本地末尾，收到的远端笔迹
  // 也 push 到末尾，而宿主的顺序是**到达序**。于是只要多端并发写，每 5 秒一次的 rev 都判定
  // 「指纹不一致」→ 客户端索整份快照 → applySnapshot 里 `GW.loadDoc()` 整份重建 + 跟随宿主
  // 的 cur 页 ⇒ 平板上就是「页面和笔迹跳变一下」，跳完继续写、过几秒再跳。
  // 1.4.6 曾把顺序敏感当成特性写进注释，那是错的：叠压顺序差异只影响「两条新笔画谁压谁」，
  // 而整份重载的代价是整屏闪一下，两害相权取其轻。
  // 现在每项单独哈希，再用**加法**折叠（交换律 ⇒ 与顺序无关），只反映「有没有少/多条目」。
  function hashOne(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) | 0; }
    return h | 0;
  }
  function fpOf(items) {
    let x = 0;
    for (const it of items) x = (x + hashOne(String((it && it.id) || ''))) | 0;
    return items.length + ':' + (x >>> 0).toString(36);
  }
  function pageFingerprint() {
    const p = GW.page();
    if (!p) return '';
    return p.id + '|' + fpOf((p.ink || []).concat(p.objs || []));
  }
  // 1.4.5（R8）：pageFingerprint 只算 GW.page() —— 多端各自翻页时，**别人页上**的分叉
  // 永远对不出来（端上不翻到那页就永远不比），只能等谁翻过去才自愈一次。
  // 这里再算一个跨页指纹：每页 id + 该页条目指纹，按页折叠（与页序无关，任一条增删都会变）。
  // 遍历全部条目，5 秒一次、几千条量级，代价可忽略。
  // 1.4.7（R10）：这里的折叠也必须与页序无关 —— 两台设备同时新建页时，页的先后同样是
  // 「本地先、远端后」两边不同，用乘法的旧写法会把这种纯顺序差异判成内容分叉（同上一条）。
  function docFingerprint() {
    const pages = (GW.doc && GW.doc.pages) || [];
    let x = 0;
    for (const p of pages) {
      x = (x + hashOne(String(p.id || '') + '|' + fpOf((p.ink || []).concat(p.objs || [])))) | 0;
    }
    return pages.length + ':' + (x >>> 0).toString(36);
  }
  let revTimer = 0, revReqAt = 0;
  function pushRev() {
    if (!LS.live || !has()) return;    // 只有宿主广播（has() 为真就是桌面端）；客户端收到才比对
    netLive('rev', { k: 'rev', fp: pageFingerprint(), dfp: docFingerprint() });
  }
  // 1.4.4（R3）：记下本机最近发出去的文档 op（只记 op —— 过程性的 live 不落定任何东西，
  // 重放它毫无意义）。快照到达时按入队顺序重放，把「已发、宿主还没应用」的擦除补回来。
  // 1.4.5：50 条在多端同时书写（两台平板 + 老师）时会被挤掉 —— 挤掉的那条就永久丢失重放机会。
  const RECENT_MAX = 200;
  function remember(op) {
    if (!op || !op.pageId) return;     // {snapreq:1} 这类结构消息不是文档操作
    LS.recent.push(op);
    while (LS.recent.length > RECENT_MAX) LS.recent.shift();
  }

  // ---------- 设置与媒体镜像（1.1.15） ----------
  // 设置页里的每一项（外观 / 透明度 / 激光笔 / 资源库分页 / 界面自定义…）都在文档之外，
  // 以前只有本机生效：平板纹丝不动，老师会以为「同步只做了一半」。这里把 saveSettings 接上同步，
  // 推的是「改过的键」而不是整份设置（避免每次滑动都发几 KB）。
  let setJSON = null;
  function settingsNow() { return JSON.stringify(GW.settings || {}); }
  function settingsDiff() {
    const now = settingsNow();
    if (setJSON === null) { setJSON = now; return null; }
    if (now === setJSON) return null;
    let prev = {};
    try { prev = JSON.parse(setJSON); } catch (e) { prev = {}; }
    setJSON = now;
    const cur = GW.settings || {}, patch = {};
    for (const k of Object.keys(cur)) {
      if (JSON.stringify(cur[k]) !== JSON.stringify(prev[k])) patch[k] = cur[k];
    }
    return Object.keys(patch).length ? patch : null;
  }
  function applySettingsMsg(m) {
    if (!GW.applySettingsPatch) return;
    const was = LS.applying;
    LS.applying = true;
    try { GW.applySettingsPatch(m.all ? (m.settings || {}) : (m.patch || {})); } finally { LS.applying = was; }
  }
  function hookSettings() {
    if (GW.__lanSetHooked || !GW.saveSettings) return;
    GW.__lanSetHooked = true;
    const orig = GW.saveSettings;
    GW.saveSettings = function () {
      const r = orig.apply(this, arguments);
      if (LS.live && !LS.applying) {
        const patch = settingsDiff();
        if (patch) netLive('st', { k: 'st', patch });
      } else if (!LS.live) setJSON = settingsNow();
      return r;
    };
  }
  function pushSettings() {
    if (!LS.live) return;
    setJSON = settingsNow();
    sendLive({ k: 'st', all: true, settings: JSON.parse(setJSON) });
  }

  // 视频/音频：哪一端按了播放、拖了进度、改了倍速，另一端跟着做。
  // 用捕获阶段监听：视频元素是对象内部建的，事后逐个挂 listener 容易漏。
  function isMedia(el) { return !!el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO'); }
  function objOfEl(el) {
    const objs = (GW.page() && GW.page().objs) || [];
    for (const o of objs) if (o._el && o._el.contains(el)) return o;
    return null;
  }
  function sendMedia(el, playing) {
    if (!LS.live || LS.applying || !el) return;
    const o = objOfEl(el);
    if (!o) return;
    netLive('v', { k: 'v', id: o.id, p: !!playing, t: Number(el.currentTime) || 0, r: Number(el.playbackRate) || 1 });
  }
  function hookMedia() {
    if (GW.__lanMediaHooked) return;
    GW.__lanMediaHooked = true;
    document.addEventListener('play', (e) => { if (isMedia(e.target)) sendMedia(e.target, true); }, true);
    document.addEventListener('pause', (e) => { if (isMedia(e.target)) sendMedia(e.target, false); }, true);
    document.addEventListener('seeked', (e) => {
      if (isMedia(e.target)) sendMedia(e.target, !e.target.paused);
    }, true);
    document.addEventListener('ratechange', (e) => {
      if (isMedia(e.target)) sendMedia(e.target, !e.target.paused);
    }, true);
  }
  // 播放中每秒补一条进度：只靠事件的话，两端进度会越差越远
  let mediaTimer = 0;
  function pumpMedia() {
    if (!LS.live) return;
    const objs = (GW.page() && GW.page().objs) || [];
    for (const o of objs) {
      const v = o._el && o._el.querySelector('video,audio');
      if (v && !v.paused) sendMedia(v, true);
    }
  }

  // 条目可能在 ink（手写/图形）里，也可能在 objs（卡片/仿真/视频）里：
  // GW.objects.byId 只查 objs，图形调参会因此找不到对象。
  function itemById(id) {
    const p = GW.page();
    if (!p || !id) return null;
    return (p.ink || []).find((x) => x.id === id) || (p.objs || []).find((x) => x.id === id) || null;
  }
  // 1.3.0（R4a）：远端改一个图元 ⇒ 只重画「改前 ∪ 改后」那一块，不再整幅重画。
  // 以前 'o'/'pp' 每条包都 GW.requestRender()（清掉 partial + 整层 clearRect + 重画视口里全部墨迹），
  // 发送端 GAP.o=38 / GAP.pp=45 ⇒ 远端拖动物体时本机 22~26Hz 整屏重画，和书写抢帧。
  // 拿不到包围盒（对象层 / 物理图异常）就退回整幅重画，宁可慢一点也不能留残影。
  function rectOfItem(o) {
    if (!o || o.kind === 'obj') return null;
    try { return GW.bbox ? GW.bbox(o) : null; } catch (e) { return null; }
  }
  function refreshItem(o, before) {
    try { if (GW.invalidate) GW.invalidate(o); } catch (e) { /* 没有缓存可清就算了 */ }
    const after = rectOfItem(o);
    if (before && after && GW.renderPartial) {
      GW.renderPartial(
        Math.min(before.x, after.x), Math.min(before.y, after.y),
        Math.max(before.x + before.w, after.x + after.w), Math.max(before.y + before.h, after.y + after.h));
    } else if (GW.requestRender) GW.requestRender();
  }

  function applyLive(m) {
    if (!m) return;
    // 1.1.15：课堂增强（答题器）等新消息没在下面登记，统一转给 classroom.js
    if (m.k === 'q' || m.k === 'a' || m.k === 'qe' || m.k === 'qerr') {
      if (GW.classRoom && GW.classRoom.onMsg) GW.classRoom.onMsg(m);
      return;
    }
    // 2.0.7（C3）：协同光标。只画一个小圆点 + 名字，不碰文档数据，也不进撤销栈。
    if (m.k === 'cur') {
      if (GW.cursors && GW.cursors.apply) GW.cursors.apply(m);
      return;
    }
    if (m.k === 'gt') {
      // 1.5.2（R15）：尺规拖动实时镜像 —— 只更新本页同 id 的那件工具，不重建 DOM。
      // 换页瞬间到达的位置指令按 pageId 丢掉，免得把尺子挪到新页上。
      const p = GW.page();
      if (p && (!m.pageId || m.pageId === p.id) && m.g && GW.geoApply) GW.geoApply(p, m.g.id, m.g);
      return;
    }
    if (m.k === 's') {
      if (mine.has(m.id)) return;   // 自己刚发的这一笔（回声）：不许当远端笔迹再画一遍
      // 1.1.2：翻页可能有一瞬间不同步（一端刚发 goto、另一端还在旧页），
      // 笔迹必须跟着页走，否则会把别人在另一页写的笔画画到当前页上。
      if (m.pageId && GW.page() && m.pageId !== GW.page().id) return;
      // 压感点数和坐标点数对不上时不带 ws（drawItem 会按逐点宽度画，长度不齐会画歪）
      const pts = m.pts || [];
      const ws = (m.ws && m.ws.length * 2 === pts.length) ? m.ws : undefined;
      // 1.3.0（R4a）：每条 's' 包都是**整条笔画的快照**，但重描可以只画增量。
      // 所以宁可复用同一个 ghost 对象、把「已画到第几个点 / 已占的设备矩形」带过去 ——
      // 以前这里每次 ghosts.set 一个新对象，累积量全丢，增量重描退化成每帧整条重画。
      const prev = ghosts.get(m.id);
      const n = pts.length / 2;
      const g = { kind: 'stroke', id: m.id, pts, color: m.color || '#1b2433', width: m.width || 3, hl: !!m.hl, ws, at: Date.now() };
      if (prev && !(prev.drawn > n)) {   // 点数变少 = 这一笔重新开始了（id 复用），累积量作废
        g.drawn = prev.drawn; g.dev = prev.dev; g.wb = prev.wb;
      }
      ghosts.set(m.id, g);
      // 1.3.0（R4a）：远端一开始写就把实时层粘住，整节课只在第一次切一次 display
      if (GW.setLiveSticky) GW.setLiveSticky(true);
      kickGhost();
    } else if (m.k === 'sx') {
      mine.delete(m.id);
      const g = ghosts.get(m.id);
      if (g) { g.done = Date.now(); kickGhost(); }
    } else if (m.k === 'c') {
      // 远端在平移/缩放：把「它屏幕中心对着的世界点 + 缩放倍率」搬过来。
      // 1.2.0 修：以前发的是 tx/ty（屏幕坐标偏移），两端屏幕尺寸不同 ⇒ 同一个 tx 在平板上
      // 显示的内容整体错位、倍率看着也不一致。改成按世界中心对齐后，两端看到的画面一致。
      // 1.1.9：光对齐世界中心还不够 —— 平板屏比电脑窄，照搬同一个倍率时
      // 「屏幕能装下的世界宽度」比电脑小，网页/图形两侧就被切掉，看起来像「只显示了一部分」。
      // 按两端视口把倍率缩放一下，让两边看到**同一块世界矩形**（发送方带了 vw/vh 才做）。
      // 1.1.13：贴合逻辑统一进 applyCam（快照/翻页/资产重挂也走它），这里只保留「别抢用户」的门槛。
      if (Date.now() - (LS.camAt || 0) < 1200) return;   // 本机刚自己动过：别跟用户抢相机
      applyCam(m);
    } else if (m.k === 'o') {
      const o = itemById(m.id);
      if (!o) return;
      const before = rectOfItem(o);
      o.x = m.x; o.y = m.y; o.w = m.w; o.h = m.h;
      if (m.rot != null) o.rot = m.rot;
      if (o.kind === 'obj') {
        // 对象层（网页/视频/仿真）：DOM 元素自己更新，墨迹层没有它的像素
        try { if (GW.invalidate) GW.invalidate(o); } catch (e) { /* 没有缓存可清就算了 */ }
        try { GW.objects.update(o); } catch (e) { /* 对象没实现 onUpdate 就算了 */ }
      } else {
        refreshItem(o, before);
      }
    } else if (m.k === 'sim') {
      const o = GW.objects.byId(m.id);
      if (!o || !o.data) return;
      // B2（1.7.6 修复）：原地同步，保住 o.data.state 的对象引用 —— 已挂载试点的
      // 运算状态 S 与 inner.__gwState 都指向它，直接替换会让本机后续调参写到旧对象、
      // 保存重开丢值。再由 GW.objects.update(o) -> sim.onUpdate 灌进试点。
      const st = o.data.state || (o.data.state = {});
      const next = m.state || {};
      for (const k of Object.keys(st)) if (!(k in next)) delete st[k];
      Object.assign(st, next);
      // 远端更新不得被 pumpSims 当成「本机改动」再广播回去（更新回环）
      try { o._lanSimState = JSON.stringify(st); } catch (e) { /* noop */ }
      try { GW.objects.update(o); } catch (e) { /* 仿真自己没实现 onUpdate 就算了 */ }
    } else if (m.k === 'simp') {
      // 远端仿真画面（缩略 PNG，带 alpha）：盖在仿真 canvas 上当一层镜像，动画/参数都看得到
      const o = GW.objects.byId(m.id);
      if (!o || !o._el || !m.d) return;
      let stage = o._el.querySelector('.gw-sim-stage');
      // 1.1.15：本机 html 动画（web 对象）也走同一条镜像通道 —— 动画画面在 iframe 里，
      // 只靠「参数条改了 query」对端重新加载一次是看不到播放过程的。
      if (!stage) stage = o._el.querySelector('.obj-body') || o._el;
      let img = stage.querySelector('.lan-sim-ghost');
      if (!img) {
        img = document.createElement('img');
        img.className = 'lan-sim-ghost';
        img.alt = '';
        img.style.position = 'absolute';
        img.style.inset = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.pointerEvents = 'none';
        img.style.zIndex = '3';
        stage.appendChild(img);
      }
      if (img.getAttribute('src') !== m.d) img.src = m.d;
      // 1.1.16（R3）：镜像层必须有寿命 —— 否则对端播过一次动画，静态帧就永久盖在仿真上
      img._at = Date.now();
    } else if (m.k === 'st') {
      // 设置页的所有改动（外观/透明度/激光笔/资源库分页/界面自定义…）
      applySettingsMsg(m);
    } else if (m.k === 'cls') {
      // 1.1.15：课堂效果（聚光灯 / 幕布）—— 各端按自己的窗口尺寸重画，横竖屏都不变形
      if (GW.remoteClass) { try { GW.remoteClass(m); } catch (_) {} }
    } else if (m.k === 'pp') {
      // 调参面板拖动中的实时值（关系式/颜色/线宽/旋转…）：抬手那条 op 才是权威，
      // 这里只让对端在拖动过程中就看得到，不用等 400ms 的合并提交。
      // 参数既可能挂在对象根上（物理/数学图形），也可能挂在 data 里（仿真 state），两边都写。
      const o = itemById(m.id);
      if (!o) return;
      const before = rectOfItem(o);
      if (m.rot != null) o.rot = m.rot;
      if (m.data) {
        const deep = {}, flat = {};
        for (const k of Object.keys(m.data)) {
          if (k === 'state' || k === 'annot' || k === 'path' || k === 'params') deep[k] = m.data[k];
          else flat[k] = m.data[k];
        }
        Object.assign(o, flat);
        if (Object.keys(deep).length) o.data = Object.assign({}, o.data, deep);
      }
      if (o.kind === 'obj') {
        try { GW.objects.update(o); } catch (e) { /* 对象自己没实现 onUpdate 就算了 */ }
      } else {
        // 手写/图形：参数变了画出来的范围也变 —— 重算包围盒后只重画新旧并集那一块
        refreshItem(o, before);
        try { if (GW.selection && GW.selection.render) GW.selection.render(); } catch (e) { /* 没选中就算了 */ }
      }
    } else if (m.k === 'v') {
      // 视频/音频：播放、暂停、拖动进度、变速都在两端一致
      const o = GW.objects.byId(m.id);
      const v = o && o._el ? o._el.querySelector('video,audio') : null;
      if (!v) return;
      const was = LS.applying;
      LS.applying = true;
      try {
        if (Number.isFinite(m.t) && Math.abs(v.currentTime - m.t) > 0.35) {
          try { v.currentTime = m.t; } catch (e) { /* 元数据没到时设不进去 */ }
        }
        if (Number.isFinite(m.r) && m.r > 0 && v.playbackRate !== m.r) v.playbackRate = m.r;
        if (m.p && v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
        if (m.p === false && !v.paused) v.pause();
      } finally { LS.applying = was; }
    } else if (m.k === 'an') {
      // 动画参数条：对端把同样的 query 拼回自己的 iframe src（不重建对象、不丢播放状态以外的东西）
      if (GW.animApplyParams) GW.animApplyParams(GW.objects.byId(m.id), m.p);
    } else if (m.k === 'lsr') {
      // 1.1.16 R1：激光笔（发送端 input.js:1182 / :1229 早就在发，接收端一直没有分支）
      // 1.3.0（R4a）：激光也走实时层 —— 远端一动就把实时层粘住（见 board.js 的 GW.setLiveSticky）
      if (GW.setLiveSticky) GW.setLiveSticky(true);
      applyRemoteLaser(m);
    } else if (m.k === 'rev') {
      // 1.1.16 R2：宿主每 5 秒报一次当前页指纹，对不上就是中间丢了 op（或自己漏过一次快照）。
      if (has() || !m.fp) return;
      // 1.4.5（R8）：出站队列里还有没发出去的 op 时，本机必然领先宿主，怎么比都对不上 ——
      // 此时索快照只会白白整份重载一遍（而且刚发的 op 还得靠 LS.recent 再重放回来）。
      if (outbox.length) return;
      // 当前页指纹 + 跨页指纹（老宿主没有 dfp，就只比当前页，向后兼容）
      if (m.fp === pageFingerprint() && (!m.dfp || m.dfp === docFingerprint())) return;
      if (Date.now() - revReqAt < REV_EVERY) return;   // 别把快照请求打成风暴（快照本身也是几百 KB）
      revReqAt = Date.now();
      if (GW.syncDoc) GW.syncDoc();                     // 客户端走 {snapreq:1}，宿主那边 pushSnapshot
    }
  }

  // 1.1.10：节流间隔整体收窄（40/55/55 → 26/38/38）。手写笔 250Hz 采样下，原来的 40ms
  // 让平板端看到的是「25fps 一段一段」的笔迹；26ms ≈ 38fps，笔尖跟手感明显变好，
  // 而带宽只涨不到 1.6 倍（每包仍按 160 点抽稀）。仿真镜像也提到 220ms。
  // 1.1.16：加了 lsr（激光笔）—— 发送端自己按 33ms 抽帧，这里留 50ms 只做兜底合并；
  // 加了 rev（文档对账指纹）—— 5 秒一条，节流只防重复排空。
  // 1.4.9（R14）：提频提清 —— simp 的节流从 220ms 收到 110ms（≈9fps），
  // 与 pumpSims 的每对象 110ms 一起生效；仍然「画面变了才发」，静止的仿真不会多占带宽。
  const GAP = { s: 26, c: 38, o: 38, sim: 120, simp: 110, st: 140, pp: 45, v: 300, lsr: 50, rev: 4000, gt: 60 };
  const q = {};
  let qTimer = 0;
  function sendLive(m) {
    if (!LS.live) return;
    if (has()) window.gewu.lan.live(m);
    else post({ type: 'live', m });
  }
  // 载荷只在真要发的时候才拼（1.1.2）：手写笔 250Hz，每动一下就 slice 几百个点纯属白烧 CPU。
  // 排队时只存引用，到点再从最新状态取 —— 笔画还在长，发出去的就是它现在的样子。
  function buildLive(kind, payload) {
    if (kind === 's') {
      const st = payload;
      let pts = st.pts, ws = st.ws;
      const np = pts.length / 2;
      if (np > 160) {
        const step = Math.ceil(np / 160), cp = [], cw = ws ? [] : null;
        for (let i = 0; i < np - 1; i += step) {
          cp.push(pts[2 * i], pts[2 * i + 1]);
          if (cw) cw.push(ws[i]);
        }
        const last = np - 1;
        cp.push(pts[2 * last], pts[2 * last + 1]);
        if (cw) cw.push(ws[last]);
        pts = cp; ws = cw || undefined;
      }
      return {
        k: 's', id: st.id, pageId: (GW.page() && GW.page().id) || '',
        color: st.color, width: st.width, hl: !!st.hl,
        pts: pts.slice(), ws: ws ? ws.slice() : undefined,
      };
    }
    if (kind === 'c') {
      const v = GW.viewSize ? GW.viewSize() : { w: innerWidth, h: innerHeight };
      // vw/vh 是发送端的视口大小：接收端据此把倍率缩放到「看到同一块世界矩形」。
      return { k: 'c', cx: (v.w / 2 - payload.x) / payload.s, cy: (v.h / 2 - payload.y) / payload.s, s: payload.s, vw: v.w, vh: v.h };
    }
    if (kind === 'o') return { k: 'o', id: payload.id, x: payload.x, y: payload.y, w: payload.w, h: payload.h };
    if (kind === 'sim') return { k: 'sim', id: payload.id, state: payload.state };
    if (kind === 'simp') return { k: 'simp', id: payload.id, d: payload.d };
    return payload;
  }
  // 两端视口一样大时返回 1；对方屏幕更小就按比例缩小倍率，让两边看到同一块世界矩形。
  // 老版本对端不发 vw/vh ⇒ 返回 1，维持原来的「照搬倍率」行为，不会互相打架。
  function camFit(v, vw, vh) {
    const w = Number(vw), h = Number(vh);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 1;
    if (!v || !v.w || !v.h) return 1;
    const k = Math.min(v.w / w, v.h / h);
    return Number.isFinite(k) && k > 0 ? k : 1;
  }

  // ---------- 相机：三元组 {cx,cy,s,vw,vh}（1.1.13） ----------
  // cx/cy＝发送方屏幕中心对着的世界点；s＝发送方倍率；vw/vh＝发送方视口大小。
  // 带上 vw/vh 才能让接收方算出「同一块世界矩形」：s' = s·min(本机宽/对端宽, 本机高/对端高)。
  function camOf(c) {
    if (!c || !Number.isFinite(c.s) || !(c.s > 0)) return null;
    const tx = Number(c.tx), ty = Number(c.ty);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    const v = GW.viewSize ? GW.viewSize() : { w: innerWidth, h: innerHeight };
    return { cx: (v.w / 2 - tx) / c.s, cy: (v.h / 2 - ty) / c.s, s: c.s, vw: v.w, vh: v.h };
  }
  // 文档里的 p.view 是「发送方视口下的 tx/ty/s」，换算回世界中心
  function camFromView(view, vw, vh) {
    const w = Number(vw), h = Number(vh), s = view && Number(view.s);
    const tx = view && Number(view.tx), ty = view && Number(view.ty);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    if (!Number.isFinite(s) || s <= 0) return null;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    return { cx: (w / 2 - tx) / s, cy: (h / 2 - ty) / s, s, vw: w, vh: h };
  }
  // 把相机写进本机（按本机视口贴合）。不写 p.view：贴合结果是本机视口的产物，别污染文档。
  // 全程 LS.applying=true ⇒ hookView 不会把这个倍率再回流给对端（否则两端互相把倍率越缩越小）。
  function applyCam(cam) {
    const c = GW.camera;
    if (!c || !cam) return false;
    const sNum = Number(cam.s), cx = Number(cam.cx), cy = Number(cam.cy);
    if (!Number.isFinite(sNum) || !(sNum > 0) || !Number.isFinite(cx) || !Number.isFinite(cy)) return false;
    const v = GW.viewSize ? GW.viewSize() : { w: innerWidth, h: innerHeight };
    const s = Math.max(0.05, Math.min(8, sNum * camFit(v, cam.vw, cam.vh)));
    c.s = s;
    c.tx = v.w / 2 - cx * s;
    c.ty = v.h / 2 - cy * s;
    if (!has()) {
      LS.rcam = { cx, cy, s: sNum, vw: Number(cam.vw) || 0, vh: Number(cam.vh) || 0 };
      LS.camApplied = { tx: c.tx, ty: c.ty, s: c.s, w: v.w, h: v.h };
    }
    const was = LS.applying;
    LS.applying = true;
    try { if (GW.viewChanged) GW.viewChanged(); else GW.requestRender(); } finally { LS.applying = was; }
    return true;
  }
  // 平板转屏 / 地址栏收放会改变可视区：此时按本机视口重算倍率，否则「贴合过」的画面又会切边。
  // 只在本机相机仍停在上次贴合的位置时才重贴 —— 老师自己拖过、缩过就别抢。
  function hookClientViewport() {
    if (LS.vpHooked || has()) return;
    LS.vpHooked = true;
    let t = 0;
    const re = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!LS.live || !LS.rcam) return;
        const c = GW.camera, a = LS.camApplied;
        if (!c || !a) return;
        if (Math.abs(c.tx - a.tx) > 0.5 || Math.abs(c.ty - a.ty) > 0.5 || Math.abs(c.s - a.s) > 1e-4) return;
        applyCam(LS.rcam);
      }, 140);
    };
    window.addEventListener('resize', re);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', re);
  }
  function flushQ() {
    qTimer = 0;
    const now = Date.now();
    for (const k of Object.keys(q)) {
      const it = q[k];
      if (!it) continue;
      if (now - it.at < (GAP[k] || 60)) continue;
      delete q[k];
      LS.liveAt[k] = now;
      sendLive(buildLive(it.kind, it.ref));
    }
    const left = Object.keys(q).filter((k) => q[k]);
    if (left.length) qTimer = setTimeout(flushQ, Math.max(16, (GAP[left[0]] || 60) - (Date.now() - q[left[0]].at)));
  }
  function netLive(kind, payload) {
    if (!LS.live || LS.applying) return;
    const now = Date.now();
    if (kind === 'sx') {
      LS.liveAt.s = now;
      mine.delete(payload.id);
      // 1.1.14：收笔时把还没发出去的「过程笔迹」丢掉。否则 sx 之后定时器还会补发一帧旧点集，
      // 对端在收笔后重新长出一条幽灵笔迹（看起来像闪一下又出现一条短线）。
      if (q.s && q.s.ref && q.s.ref.id === payload.id) delete q.s;
      sendLive({ k: 'sx', id: payload.id });
      return;
    }
    if (kind === 's' && payload && payload.id) {
      mine.set(payload.id, now);
      if (mine.size > 240) { for (const [id, t] of mine) { if (now - t > 30000) mine.delete(id); if (mine.size <= 160) break; } }
    }
    const gap = GAP[kind] || 60;
    const last = LS.liveAt[kind] || 0;
    if (now - last >= gap) { LS.liveAt[kind] = now; sendLive(buildLive(kind, payload)); }
    else {
      q[kind] = { kind, ref: payload, at: now };
      if (!qTimer) qTimer = setTimeout(flushQ, Math.max(16, gap - (now - last)));
    }
  }

  // 1.4.8（R12）：翻页要把相机一起补发。以前 goto 只带页码，平板用的是「上一次相机 live」留下的
  // 旧 rcam —— 老师翻到新页却不再移动画面时，平板就停在上一页的取景上（「翻页后画面细节不对」）。
  function pushCam() {
    if (!LS.live || LS.applying || !GW.camera) return;
    LS.camAt = Date.now();
    netLive('c', { x: GW.camera.tx, y: GW.camera.ty, s: GW.camera.s });
  }

  // 相机：平移/缩放/滚轮都走 GW.viewChanged，挂一层就够
  function hookView() {
    if (GW.__lanViewHooked || !GW.viewChanged) return;
    GW.__lanViewHooked = true;
    const orig = GW.viewChanged;
    GW.viewChanged = function () {
      const r = orig.apply(this, arguments);
      pushCam();
      return r;
    };
  }

  // 仿真播放：仿真自己的动画状态在闭包里（26 个仿真各有各的变量），没法通用地序列化。
  // 所以 1.2.0 改成「画面镜像」：把仿真自己的 canvas 缩成 420px 宽的一帧，变了才发；
  // 对端把它当一层覆盖图贴上去 —— 动画、参数变化、播放进度都能看到，且与仿真实现解耦。
  // 1.1.16（R3）：以前先 fillStyle='#fff' 填满再导 JPEG，于是**透明底的仿真**在对端变成一块
  // 不透明白板，把本端正在跑的仿真整个盖住 —— 这就是用户说的「动画交互时有一块静态图遮挡」。
  // 现在保留 canvas 自己的 alpha 导 PNG，再给镜像加 1.5s TTL（sweepSimGhosts），停了就自己消失。
  let simTimer = 0, ghostTimer = 0, animTimer = 0, simGhostTimer = 0;
  const simShot = document.createElement('canvas');
  const simShotCtx = simShot.getContext('2d');
  const SIM_GHOST_TTL = 1500;
  function sweepSimGhosts() {
    const now = Date.now();
    for (const img of document.querySelectorAll('img.lan-sim-ghost')) {
      if (now - (img._at || 0) > SIM_GHOST_TTL) img.remove();
    }
  }
  function grabSim(o) {
    const cv = o._el && o._el.querySelector('.gw-sim-stage canvas');
    if (!cv || !cv.width || !cv.height) return '';
    // 1.4.9（R14）：镜像是「帧宽即画质」，固定 420 在 1080p 投影上明显糊。
    // 按对象当前屏幕宽度取，夹在 480~960 之间 —— 再宽只会把 PNG 撑大，WiFi 吃不消。
    const sx = (o.w || 420) * ((GW.camera && GW.camera.s) || 1);
    const w = Math.max(480, Math.min(960, Math.round(sx) || 480));
    const h = Math.max(1, Math.round((cv.height / cv.width) * w));
    if (simShot.width !== w || simShot.height !== h) { simShot.width = w; simShot.height = h; }
    try {
      simShotCtx.clearRect(0, 0, w, h);
      simShotCtx.drawImage(cv, 0, 0, w, h);
      return simShot.toDataURL('image/png');
    } catch (e) { return ''; }   // 画布被污染（本机没有这情况）就当没抓到
  }
  // 1.4.9（R14）：画面不在视口里就整帧跳过 —— 抓帧（drawImage + PNG 编码）才是这里最贵的一步，
  // 老师滚到别处去了还在给看不见的仿真编码，纯粹是白烧 CPU 和带宽。
  function simOnScreen(o) {
    const s = (GW.camera && GW.camera.s) || 1, tx = (GW.camera && GW.camera.tx) || 0, ty = (GW.camera && GW.camera.ty) || 0;
    const v = GW.viewSize ? GW.viewSize() : { w: innerWidth, h: innerHeight };
    const x = o.x * s + tx, y = o.y * s + ty, w = (o.w || 0) * s, h = (o.h || 0) * s;
    return x + w > -40 && y + h > -40 && x < v.w + 40 && y < v.h + 40;
  }
  function pumpSims() {
    if (!LS.live) return;
    const objs = (GW.page() && GW.page().objs) || [];
    for (const o of objs) {
      if (o.type !== 'sim' || !o._el) continue;
      // 1.1.15 修（这是「仿真/动画效果完全不同步」的硬伤）：这两条消息原来没带 k，
      // buildLive 对未知类型原样返回，于是对端 applyLive 里 if (m.k === 'sim') 永远不成立 ——
      // 消息一直在发，画面上什么都没有。参数 state 也改成「值与上次不同就发」，不再依赖画面变化。
      if (o.data && o.data.state) {
        let st = '';
        try { st = JSON.stringify(o.data.state); } catch (e) { st = ''; }
        if (st && st !== o._lanSimState) {
          o._lanSimState = st;
          netLive('sim', { k: 'sim', id: o.id, state: JSON.parse(st) });
        }
      }
      if (o._lanSimAt && Date.now() - o._lanSimAt < 110) continue;
      if (!simOnScreen(o)) continue;
      const shot = grabSim(o);
      if (!shot || shot === o._lanSimShot) continue;
      o._lanSimAt = Date.now();
      o._lanSimShot = shot;
      netLive('simp', { k: 'simp', id: o.id, d: shot });
    }
  }

  // 本机 html 动画（web 对象）：同源 iframe 里的 canvas 读得到，抓一帧缩略图镜像给对端。
  // 动画的播放状态在页面闭包里、没有统一 API 可序列化，截帧是唯一对「所有动画」都成立的办法。
  function grabIframe(o) {
    const f = o._el && o._el.querySelector('iframe');
    if (!f) return '';
    let d = null;
    try { d = f.contentDocument; } catch (e) { return ''; }   // 跨源（http 资源）读不到就算了
    if (!d) return '';
    let cv = null;
    const list = d.querySelectorAll('canvas');
    for (const c of list) {
      if (c.width * c.height && (!cv || c.width * c.height > cv.width * cv.height)) cv = c;
    }
    if (!cv) return '';
    const w = 480, h = Math.max(1, Math.round((cv.height / cv.width) * w));
    if (simShot.width !== w || simShot.height !== h) { simShot.width = w; simShot.height = h; }
    try {
      simShotCtx.clearRect(0, 0, w, h);
      simShotCtx.drawImage(cv, 0, 0, w, h);
      return simShot.toDataURL('image/png');
    } catch (e) { return ''; }
  }
  function pumpAnims() {
    if (!LS.live) return;
    const objs = (GW.page() && GW.page().objs) || [];
    for (const o of objs) {
      if (o.type !== 'web' || !o._el) continue;
      if (o._lanAnimAt && Date.now() - o._lanAnimAt < 700) continue;
      const shot = grabIframe(o);
      if (!shot || shot === o._lanAnimShot) continue;
      o._lanAnimAt = Date.now();
      o._lanAnimShot = shot;
      netLive('simp', { k: 'simp', id: o.id, d: shot });
    }
  }

  // ---------- 平板端 ----------
  // 1.1.2：以前每次操作都是一条独立 fetch，网络抖一下那条 op 就永远丢了 ——
  // 平板和电脑的分歧从此再也对不回来（老师看到的「擦不掉 / 少一笔」常是这样来的）。
  // 现在改成串行队列：op / goto 必须送达，失败按 250ms 递增重试（最多 30 次 / 60 秒），
  // 成功后再发下一条，天然保证顺序；过程消息（live）丢了无所谓，直接发、不进队列。
  const outbox = [];
  let outTimer = 0, outBusy = false;
  function wireUrl() {
    const cid = LS.cid ? '&cid=' + encodeURIComponent(LS.cid) : '';
    const tok = LS.tok ? '&tok=' + encodeURIComponent(LS.tok) : '';
    return url('/op?k=' + encodeURIComponent(LS.code) + cid + tok);
  }
  function sendNow(msg) {
    return fetch(wireUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    }).then((r) => !!(r && r.ok)).catch(() => false);
  }
  function pump() {
    if (outTimer || outBusy || !outbox.length) return;
    outBusy = true;
    const item = outbox[0];
    sendNow(item.msg).then((ok) => {
      outBusy = false;
      if (ok) { outbox.shift(); pump(); return; }
      item.tries++;
      if (item.tries > 30 || Date.now() - item.at > 60000) outbox.shift();
      else outTimer = setTimeout(() => { outTimer = 0; pump(); }, Math.min(2000, 250 * item.tries));
    });
  }
  function post(msg) {
    if (msg && msg.type === 'live') { sendNow(msg); return null; }
    if (outbox.length > 400) outbox.shift();   // 极端情况别把内存撑爆
    outbox.push({ msg, tries: 0, at: Date.now() });
    pump();
    return null;
  }

  // 1.1.15（ClassIn 五条 · R2）：老师收回书写权后，平板进只读态。
  // 服务端也会丢包，但本地必须先拦住，否则学生看着自己的笔迹出现又消失。
  function setLocked(v) {
    if (LS.locked === v) return;
    LS.locked = v;
    if (v) GW.toast('老师已收回书写权，现在是只读');
    else GW.toast('老师已开放书写，可以写了');
    try { GW.bus.emit('lan-lock', v); } catch (e) { /* 没这个事件就算 */ }
  }

  function clientConnect(code) {
    if (LS.es) return LS.es;
    LS.code = code || param('k');
    LS.lastSeq = 0;
    // 1.4.7（R10）：每建一次连接就重新算「第一次快照」—— 首连/重连要跟老师那一页，
    // 之后的快照只是对账，不许再拽动页面（见 applySnapshot 末尾）。
    LS.snapOnce = false;
    // 1.1.13（R12）：base 可能是空（桌面端）也可能是「电脑那台」；
    // 地址不合法时 EventSource 会直接抛，不能让它变成未捕获异常。
    let es = null;
    try { es = new EventSource(url('/sync?k=' + encodeURIComponent(LS.code) + '&dev=' + encodeURIComponent(devId()))); }
    catch (err) { LS.es = null; if (GW.toast) GW.toast('连不上协同地址，检查电脑那台的网址：' + (LS.base || location.origin)); return null; }
    LS.es = es;
    es.addEventListener('message', (e) => {
      // 1.1.14：任何一条事件（含服务端每 8 秒的 ping）都算「链路活着」。
      LS.lastMsgAt = Date.now();
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      // 1.1.10：记下发到哪一条。断线重连时浏览器会自动带 Last-Event-ID，
      // 服务端按它补发漏掉的 op/goto —— 这里只做一件事：发现「序号跳了」就清一次幽灵笔迹，
      // 免得漏掉的笔画在实时层留下擦不掉的残影。
      const sq = parseInt(e.lastEventId, 10);
      if (Number.isFinite(sq) && sq > 0) {
        if (LS.lastSeq && sq > LS.lastSeq + 1 && m.type !== 'snap') { try { clearGhosts(); } catch (err) { /* 没这函数就跳过 */ } }
        if (!LS.lastSeq || sq > LS.lastSeq) LS.lastSeq = sq;
      }
      if (m.type === 'hello') {
        LS.cid = m.id || '';
        LS.tok = m.tok || '';
        // 审计 GW-F21：记住宿主当前的文档代际；snap 若带来更大的代际，说明结构变过（见 snap 分支）
        LS.gen = m.gen | 0;
        // 1.1.15：连上就同步「老师有没有收回书写权」，不用等第一条被拒的消息
        LS.locked = !!m.locked;
        LS.zone = m.zone || null;
      }
      else if (m.type === 'locked') setLocked(!!m.locked);
      else if (m.type === 'zone') {
        LS.zone = m.zone || null;
        // 1.4.4（R7）：被丢弃时服务端会带 reason，提示里说清是哪一种（老师才知道去改哪）。
        if (m.zone) GW.toast(m.denied
          ? ('这一笔超出了分组讨论区' + (m.reason === 'bbox-center-outside' ? '（笔迹中心在区外）' : ''))
          : '已进入分组讨论区');
      }
      else if (m.type === 'snap') {
        // 审计 GW-F21：带代际的快照即「结构基准确认」。服务端保证跨代际必先发快照，
        // 这里只把代际对齐，后续若出现「增量里的页对不上」仍由 applyRemote 的计数自愈。
        if (m.gen) LS.gen = m.gen | 0;
        applySnapshot(m.snap);
      }
      else if (m.type === 'op' && m.op) applyRemote(m.op);
      else if (m.type === 'goto') { clearGhosts(); applyPage(m.i); }
      else if (m.type === 'live' && m.m) applyLive(m.m);
    });
    es.addEventListener('error', () => {
      // 浏览器会自动重连；断网时页面上给一行提示即可
      if (GW.toast && !GW.__lanWarned) { GW.__lanWarned = true; GW.toast('协同连接中断，正在重连…'); }
    });
    es.addEventListener('open', () => {
      LS.live = true;
      LS.lastMsgAt = Date.now();
      GW.__lanWarned = false;   // 1.1.10：重连成功就把「提醒」复位，下次真断了才再提示
      GW.syncEmit = (op) => { remember(op); return post({ type: 'op', op }); };
      hookPage(); hookView();
      hookClientViewport();   // 1.1.13：转屏/地址栏收放后重新贴合相机
      hookSettings(); hookMedia();   // 1.1.15：设置与视频/动画镜像
      if (!simTimer) simTimer = setInterval(pumpSims, 120);
      if (!animTimer) animTimer = setInterval(pumpAnims, 600);
      if (!mediaTimer) mediaTimer = setInterval(pumpMedia, 1000);
      if (!ghostTimer) ghostTimer = setInterval(sweepGhosts, 1200);
      if (!simGhostTimer) simGhostTimer = setInterval(sweepSimGhosts, 500);
      pump();   // 重连成功：把断线期间积压的操作补发出去
    });
    // 1.1.14：watchdog 不再只看 readyState。笔记本/平板休眠唤醒、切换 Wi-Fi、网线插拔后，
    // TCP 常常停在「OPEN 但什么也收不到」的半开状态，原来只认 CLOSED 就永远不重连 ——
    // 老师看到的是两端都显示已连接、笔迹却不动。现在服务端每 8 秒发一条真正的 ping 事件，
    // 超过 15 秒一条都没收到就主动重建（重建会重新拉快照，状态自然对齐）。
    if (!LS.wdTimer) {
      const wd = () => {
        if (document.visibilityState !== 'visible' || !LS.es) return;
        const stale = LS.lastMsgAt && Date.now() - LS.lastMsgAt > 15000;
        if (LS.es.readyState !== 2 && !stale) return;
        if (LS.reconnectAt && Date.now() - LS.reconnectAt < 10000) return;   // 重连风暴保护
        LS.reconnectAt = Date.now();
        try { LS.es.close(); } catch (err) { /* 已经关了 */ }
        LS.es = null;
        LS.lastMsgAt = 0;
        clientConnect(LS.code);
      };
      LS.wdTimer = setInterval(wd, 4000);
      // 平板切回前台时立刻查一次，不等下一个 4 秒 tick
      document.addEventListener('visibilitychange', wd);
    }
    return es;
  }

  // ---------- 桌面端 ----------
  // 上次的端口与配对码：能复用就复用，平板上加过主屏/收藏的那个网址就不再变
  const HKEY = 'gewu.lan.host';
  function lastHost() {
    try { return JSON.parse(localStorage.getItem(HKEY) || 'null') || {}; } catch (e) { return {}; }
  }
  function saveHost(inf) {
    try { localStorage.setItem(HKEY, JSON.stringify({ port: inf.port, code: inf.code })); } catch (e) { /* 隐私模式写不进去就算了 */ }
  }

  function bindHost() {
    // 桌面端收到平板发来的 op：必须和客户端走同一条路径（applyRemote 会顺手把临时笔迹清掉）。
    // 1.4.1 这里直接调 GW.applyRemote，漏了 dropGhosts ⇒ 电脑上平板写的笔画会是「实笔 + 幽灵」两条，
    // 幽灵不在文档里，擦不掉也撤销不了。1.4.2 改成走下面这个统一入口。
    // 1.1.2：关闭协同再开启会再调一次 bindHost —— 不设防的话监听器叠成两份，
    // 同一条远端 op 被应用两次（虽然 id 去重挡住了重复插入，但快照请求会发两遍）。
    if (GW.__lanHostBound) return;
    GW.__lanHostBound = true;
    window.gewu.on('lan-op-in', (op) => applyRemote(op));
    window.gewu.on('lan-goto-in', (i) => { clearGhosts(); applyPage(i); });
    window.gewu.on('lan-live-in', (m) => applyLive(m));
    window.gewu.on('lan-need-snapshot', () => { pushSnapshot().catch(() => {}); });
    // 连接台数：服务端有增删就推过来，面板那句「当前连接 N 台」直接刷新
    window.gewu.on('lan-clients', (n) => { LS.clients = n | 0; });
  }

  async function start() {
    if (!has()) { GW.toast('当前环境不支持局域网协同（要用桌面版）'); return null; }
    if (LS.live) return info();
    const last = lastHost();
    const inf = await window.gewu.lan.start({ port: last.port, code: last.code });
    LS.live = true;
    LS.code = inf.code;
    LS.url = inf.url;
    LS.clients = inf.clients || 0;
    saveHost(inf);
    GW.syncEmit = (op) => { window.gewu.lan.op(op); adoptOp(op); };
    hookPage();
    bindHost();
    hookView();
    hookSettings(); hookMedia();   // 1.1.15：设置与视频/动画镜像
    if (!simTimer) simTimer = setInterval(pumpSims, 120);
    if (!animTimer) animTimer = setInterval(pumpAnims, 600);
    if (!mediaTimer) mediaTimer = setInterval(pumpMedia, 1000);
    if (!ghostTimer) ghostTimer = setInterval(sweepGhosts, 1200);
    if (!simGhostTimer) simGhostTimer = setInterval(sweepSimGhosts, 500);
    if (!revTimer) revTimer = setInterval(pushRev, REV_EVERY);   // 1.1.16 R2：宿主定期广播当前页指纹
    // 1.4.8（R11）：开会话时把已有板书里「只存本地路径」的对象转成资源，平板才拿得到内容
    adoptAllPaths();
    return inf;
  }

  async function stop() {
    if (!has() || !LS.live) return false;
    await window.gewu.lan.stop();
    LS.live = false;
    LS.url = '';
    GW.syncEmit = null;
    // 1.4.4（R3）：断线后这些 op 已经不对应任何未确认状态，留着只会在重连后重放陈旧操作。
    LS.recent.length = 0;
    LS.missCount = 0;
    clearGhosts();
    // 1.3.0（R4a）：会话结束，实时层回到「没内容就撤出合成」
    if (GW.setLiveSticky) GW.setLiveSticky(false);
    return true;
  }

  // 1.4.4（R1）：locked / list 的真值在主进程（main/lansync.js 的 info()），IPC 是异步的，
  // 而这里必须同步返回。所以 refresh() 每轮先 await 一次 IPC 把真值缓存进 LS，
  // info() 只读缓存 —— 面板的勾选状态与「已连接平板」列表这才对得上实际状态。
  function info() {
    return {
      live: LS.live,
      code: LS.code,
      url: LS.url,
      clients: LS.clients,
      locked: has() ? !!LS.serverLocked : !!LS.locked,
      list: has() && LS.serverList ? LS.serverList : [],
    };
  }

  // ---------- 加入协同（平板浏览器 / 安卓离线包，1.1.13） ----------
  // 平板与安卓包里 window.gewu 没有 lan（起本机服务是桌面主进程的能力），
  // 所以这里不做「开启协同」，只做「加入电脑那台协同」：填电脑上显示的网址，跳过去即可。
  // 跳过去以后 mobile/shim.js 会把 window.gewu 换掉、URL 里带 ?k= ⇒ 自动 clientConnect()。
  const JKEY = 'gewu.lan.join';      // 旧键：1.1.13 只记「上次填的网址」，这里仍读它做兜底
  const BASEKEY = 'gewu.lan.base';   // 新键：{ base, code } —— 记住「电脑那台」的绝对地址与配对码
  function lastJoin() { try { return localStorage.getItem(JKEY) || ''; } catch (e) { return ''; } }
  function saveJoin(u) { try { localStorage.setItem(JKEY, u); } catch (e) { /* 隐私模式写不进去就算了 */ } }
  function lastBase() {
    try { return JSON.parse(localStorage.getItem(BASEKEY) || 'null') || null; } catch (e) { return null; }
  }
  function saveBase(base, code) {
    try { localStorage.setItem(BASEKEY, JSON.stringify({ base, code: code || '' })); } catch (e) { /* 隐私模式 */ }
  }
  // 基准地址规范化：没写协议补 http://、去掉尾部斜杠（否则 url() 会拼出 //op）。
  function normBase(raw) {
    let u = String(raw || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'http://' + u.replace(/^\/+/, '');
    try {
      const x = new URL(u);
      return (x.protocol + '//' + x.host).replace(/\/+$/, '');
    } catch (e) { return ''; }
  }
  function joinUrl(raw, code) {
    let u = String(raw || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'http://' + u.replace(/^\/+/, '');
    const k = String(code || '').trim();
    try {
      const x = new URL(u);
      if (k) x.searchParams.set('k', k);
      return x.href;
    } catch (e) {
      return u + (k ? (u.indexOf('?') >= 0 ? '&' : '?') + 'k=' + encodeURIComponent(k) : '');
    }
  }
  // 1.1.13（R12）：把「电脑那台」设为基准地址，然后就地连过去（不再整页跳走）。
  // 网页版（别的域）与安卓包（file:///android_asset/…）里相对路径打不到电脑，
  // 全靠 LS.base 变成绝对地址；桌面端不开这个，base 恒为空，行为一点不变。
  function join(rawBase, rawCode) {
    const base = normBase(rawBase);
    if (!base) { if (GW.toast) GW.toast('先把电脑上显示的网址填进来'); return ''; }
    // 已经连着别处：先干净断开，否则 clientConnect 里有 es 就直接返回旧连接了
    if (LS.es) { try { LS.es.close(); } catch (e) { /* 已经关了 */ } LS.es = null; }
    LS.base = base;
    const code = String(rawCode || '').trim();
    saveBase(base, code);
    saveJoin(rawBase);
    try {
      clientConnect(code || param('k') || '');
      if (GW.toast) GW.toast('正在连接 ' + base.replace(/^https?:\/\//, '') + ' …');
    } catch (e) {
      // 地址合法但连不上：不抛（EventSource 会自己重连，toast 由 error 事件负责）
      if (GW.toast) GW.toast('连接失败：' + (e && e.message ? e.message : e));
    }
    return base;
  }
  function isClient() { return !!(LS.es || param('k') || (LS.live && !has() && LS.code)); }
  function leaveJoin() {
    LS.live = false;
    // 主动断开就别再自动连回来（否则「断开并返回」一刷新又连上了）
    LS.base = '';
    try { localStorage.removeItem(BASEKEY); } catch (e) { /* 隐私模式 */ }
    if (GW.setLiveSticky) GW.setLiveSticky(false);
    try { if (LS.es) LS.es.close(); } catch (e) { /* 已经关了 */ }
    LS.es = null;
    // 优先退回上一页（安卓包里就是本机离线页）；没有上一页就把 ?k= 摘掉重开，干净地断开
    if (history.length > 1) { history.back(); return; }
    const u = new URL(location.href);
    u.search = ''; u.hash = '';
    location.href = u.href;
  }
  function openJoinDialog() {
    const body = GW.h('div', { style: 'padding:4px 0' });
    // noFooter：面板自己带按钮。留着「取消 / 确定」的话那个「确定」什么也不做（点了只是关窗），
    // 老师会以为已经连上了 —— 这是实测出来的坑，别为了省事把 footer 加回来。
    const d = GW.dialog({ title: '加入平板协同（局域网）', width: 560, body, noFooter: true });
    if (isClient()) {
      const st = GW.h('div', { style: 'font-size:13px;line-height:1.7;color:#5a6472' },
        '已加入协同' + (LS.code ? ('（配对码 ' + LS.code + '）') : '') + '：本机画面跟随电脑，两边都能写。');
      body.appendChild(st);
      const row = GW.h('div', { style: 'display:flex;gap:8px;margin-top:10px' });
      const off = GW.h('button', { class: 'gw-btn' }, '断开并返回');
      off.onclick = () => leaveJoin();
      const shut = GW.h('button', { class: 'gw-btn primary' }, '关闭');
      shut.onclick = () => d.close();
      row.appendChild(off); row.appendChild(shut);
      body.appendChild(row);
      return d;
    }
    const st = GW.h('div', { style: 'font-size:13px;line-height:1.7;color:#5a6472' },
      '在电脑上打开「平板协同（局域网）→ 开启协同」，把显示的网址填到这里（同一 Wi-Fi / 局域网）。' +
      '手机、平板、另一台电脑都用这一处加入，连上后是同一份板书。');
    // 局部变量别叫 url：外层 url(p) 是「拼基准地址」的助手，同名会把它遮住
    const urlIn = GW.h('input', { class: 'inp', placeholder: '电脑上的网址或 IP（例如 192.168.1.5:47810）', style: 'width:100%;font-family:monospace;font-size:13px;margin-top:8px' });
    urlIn.value = lastJoin();
    const codeIn = GW.h('input', { class: 'inp', placeholder: '配对码（网址里已带 ?k= 时可不填）', style: 'width:100%;font-family:monospace;font-size:13px;margin-top:8px' });
    const row = GW.h('div', { style: 'display:flex;gap:8px;margin-top:10px' });
    const btn = GW.h('button', { class: 'gw-btn primary' }, '加入');
    row.appendChild(btn);
    body.appendChild(st); body.appendChild(urlIn); body.appendChild(codeIn); body.appendChild(row);
    // 1.1.13（R12）：以前是 location.href 整页跳走 —— 只有在「电脑那台自己起的站点」里才成立。
    // 现在就地设基准地址再连（join），网页版 / 安卓包 / 另一台电脑都能用，页面不用重载。
    const go = async () => {
      // 桌面端（有本机服务能力）：直接让主进程把窗口导航到对方地址，
      // 这样页面里的相对路径 /op /sync /asset 天然指向对方那台（见 main.js 的 lan-join）。
      if (has() && window.gewu.lan.join) {
        const full = joinUrl(urlIn.value, codeIn.value);
        if (!full) { GW.toast('先把电脑上显示的网址填进来'); return; }
        saveJoin(urlIn.value.trim());
        try {
          const r = await window.gewu.lan.join(full);
          if (r && r.ok) { d.close(); return; }
          GW.toast('这个地址打不开：' + full);
          return;
        } catch (e) { GW.toast('加入失败：' + (e && e.message ? e.message : e)); return; }
      }
      const base = join(urlIn.value, codeIn.value);
      if (!base) return;   // join() 里已经提示过
      d.close();
    };
    btn.onclick = go;
    urlIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => { try { urlIn.focus(); } catch (e) { /* 焦点抢不到就算了 */ } }, 60);
    return d;
  }

  // ---------- 面板 ----------
  function open() {
    if (GW.dialog) {
      if (!has()) return openJoinDialog();   // 1.1.13：平板浏览器 / 安卓包只能加入，不能开服
      const body = GW.h('div', { style: 'padding:4px 0' });
      const d = GW.dialog({ title: '平板协同（局域网）', width: 560, body });
      const st = GW.h('div', { style: 'font-size:13px;line-height:1.7;color:#5a6472' });
      const urlShown = GW.h('input', { class: 'inp', readonly: 'readonly', style: 'width:100%;font-family:monospace;font-size:13px' });
      const codeIn = GW.h('input', { class: 'inp', readonly: 'readonly', style: 'width:100%;font-family:monospace;font-size:13px' });
      const row = GW.h('div', { style: 'display:flex;gap:8px;margin-top:10px' });
      const btn = GW.h('button', { class: 'gw-btn primary' }, '开启协同');
      const copy = GW.h('button', { class: 'gw-btn' }, '复制网址');
      row.appendChild(btn); row.appendChild(copy);
      body.appendChild(st); body.appendChild(urlShown); body.appendChild(codeIn); body.appendChild(row);
      // 1.1.15（R2/R5）：授权开关 + 每个平板的讨论区
      const lockRow = GW.h('label', { style: 'display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13px;cursor:pointer' });
      const lockCb = GW.h('input', { type: 'checkbox' });
      lockRow.appendChild(lockCb);
      lockRow.appendChild(GW.h('span', {}, '允许平板书写（取消后平板只能看，不能写）'));
      body.appendChild(lockRow);
      const zoneBox = GW.h('div', { style: 'margin-top:10px;font-size:13px;line-height:1.9;color:#5a6472' });
      body.appendChild(zoneBox);
      const zoneBtns = GW.h('div', { style: 'display:flex;gap:8px;margin-top:6px' });
      body.appendChild(zoneBtns);
      // 1.1.13（R12）：这台电脑也能去加入别人开的那场协同（老师机上开、笔记本上看）。
      const joinRow = GW.h('div', { style: 'display:flex;gap:8px;margin-top:14px' });
      const joinBtn = GW.h('button', { class: 'gw-btn' }, '加入别人的协同…');
      joinBtn.onclick = () => { joinBtn.disabled = true; try { openJoinDialog(); } finally { joinBtn.disabled = false; } };
      joinRow.appendChild(joinBtn);
      body.appendChild(joinRow);
      lockCb.onchange = async () => {
        try {
          await window.gewu.lan.lock(!lockCb.checked);
          // 1.4.4（R1）：把刚写下去的真值也缓存下来 —— 否则下一次 refresh 会拿缓存里的旧值
          // 把勾改回去（主进程那边的 IPC 也可能慢半拍）。
          LS.serverLocked = !lockCb.checked;
          GW.toast(lockCb.checked ? '已开放书写' : '已收回书写权');
        }
        catch (e) { GW.toast('设置失败：' + (e.message || e)); }
        refresh();
      };

      const refresh = async () => {
        // 1.4.4（R1）：先拿主进程的真值（勾选状态 + 已连接平板 + 讨论区），再重写界面。
        // 以前这里直接用 info() 的同步返回值，而它没有 locked/list 两个字段。
        if (has()) {
          try {
            const r = await window.gewu.lan.info();
            if (r) { LS.serverLocked = !!r.locked; LS.serverList = r.list || []; }
          } catch (e) { /* 主进程没回就沿用上一次的缓存，别把界面清成默认值 */ }
        }
        const i = info();
        st.textContent = i.live ? ('协同中：平板打开下面的网址即可加入（同一 Wi-Fi / 局域网）。当前连接 ' + i.clients + ' 台。') : '未开启。开启后平板与电脑是同一份板书，两边都能写。';
        urlShown.value = i.url || '（开启后显示）';
        codeIn.value = i.code ? ('配对码：' + i.code) : '';
        btn.textContent = i.live ? '关闭协同' : '开启协同';
        lockCb.checked = !i.locked;
        lockCb.disabled = !i.live;
        // 每个已连平板一行：谁能写、有没有划区
        if (!i.live) { zoneBox.textContent = ''; zoneBtns.textContent = ''; }
        else {
          const list = i.list || [];
          zoneBox.textContent = list.length
            ? ('已连接：' + list.map((c) => c.id + (c.zone ? '（有讨论区）' : '')).join('、'))
            : '还没有平板连上。';
          // 按钮只在连接列表变化时重建（避免每 2 秒把 DOM 抖一遍）
          const sig = list.map((c) => c.id + (c.zone ? '1' : '0')).join(',');
          if (zoneBtns.getAttribute('data-sig') !== sig) {
            zoneBtns.setAttribute('data-sig', sig);
            zoneBtns.textContent = '';
            for (const c of list) {
              const b = GW.h('button', { class: 'gw-btn', style: 'font-size:12px;padding:3px 8px' }, c.zone ? '清除 ' + c.id + ' 的区' : '给 ' + c.id + ' 划讨论区');
              b.onclick = async () => {
                try {
                  if (c.zone) { await window.gewu.lan.zone(c.id, null); GW.toast('已清除讨论区'); }
                  else {
                    // 用当前框选的矩形当讨论区（世界坐标）；没框选就提示
                    const sel = GW.selection && GW.selection.bounds && GW.selection.bounds();
                    if (!sel || !(sel.w > 20 && sel.h > 20)) return GW.toast('先在画布上框选一块区域，再给平板划区');
                    await window.gewu.lan.zone(c.id, { x: sel.x, y: sel.y, w: sel.w, h: sel.h });
                    GW.toast('已把 ' + c.id + ' 限定在这块区域');
                  }
                } catch (e) { GW.toast('设置失败：' + (e.message || e)); }
                refresh();
              };
              zoneBtns.appendChild(b);
            }
          }
        }
      };
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          if (info().live) { await stop(); GW.toast('已关闭协同'); }
          else {
            const inf = await start();
            if (inf && inf.url) {
              try { await navigator.clipboard.writeText(inf.url); GW.toast('已开启，网址已复制：' + inf.url); }
              catch (e) { GW.toast('已开启：' + inf.url); }
            }
          }
        } catch (e) { GW.toast('开启失败：' + (e.message || e)); }
        btn.disabled = false;
        refresh();
      };
      copy.onclick = () => {
        const u = urlShown.value;
        if (!u || u.indexOf('http') !== 0) return GW.toast('先开启协同');
        navigator.clipboard.writeText(u).then(() => GW.toast('网址已复制')).catch(() => GW.toast(u));
      };
      refresh();
      const t = setInterval(refresh, 2000);
      // 面板关掉后别再轮询（GW.dialog 只返回 close，DOM 只能按最后一个 .dlg-wrap 认）
      const wrap = [...document.querySelectorAll('.dlg-wrap')].pop();
      if (wrap) {
        const mo = new MutationObserver(() => {
          if (!document.body.contains(wrap)) { clearInterval(t); mo.disconnect(); }
        });
        mo.observe(document.body, { childList: true, subtree: true });
      }
      return d;
    }
    return null;
  }

  // _fp / _revReset 只给探针用（1.4.5：跨页指纹是内部量，探针要能自己算一遍再对照）
  GW.lansync = { start, stop, info, open, openJoinDialog, join, normBase, isHost: has, pushSettings, applySettingsMsg, hookSettings, snapshot, pushSnapshot, applySnapshot, applyRemote, clientConnect, netLive, applyLive, camOf, camFromView, applyCam, clientGoto, joinUrl, setLocked, _state: LS, _ghosts: ghosts, _outbox: outbox, _fp: { page: pageFingerprint, doc: docFingerprint }, _revReset: () => { revReqAt = 0; }, _adopt: { all: adoptAllPaths, one: adoptPathObj, pathOf: pathOfObj }, _hooks: { page: hookPage, view: hookView }, _pump: { sims: pumpSims, anims: pumpAnims } };
  // 1.1.15：书写入口（input.js）只认这一条，不看内部状态
  Object.defineProperty(GW, 'lanLocked', { get: () => !!LS.locked, configurable: true });
  // 绘制/拖动/相机这些路径只认这一个入口（未协同时空转）
  GW.netLive = netLive;

  // 平板端：带着 ?k= 打开就自动连
  // 1.1.13（R12）：开过协同的话下次打开自动连回同一场。
  // ?k= 优先（可以当场换配对码）→ 否则用上次存的 base + code。
  if (!has()) {
    if (param('k')) clientConnect();
    else {
      const last = lastBase();
      if (last && last.base) {
        LS.base = last.base;
        clientConnect(last.code || '');
      }
    }
  }
})();


