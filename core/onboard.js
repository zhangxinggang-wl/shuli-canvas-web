/* 新手引导（首次安装显示一次）
   1.4.3：三端（Windows / 安卓 / 网页）第一次进入画布 —— 免费说明·打赏页点掉之后 ——
   自动走一遍：悬浮球 → 三条菜单栏 → 书写手势 → 框选调 AI → 结束。
   设计要求：
   · 只在第一次装完显示（localStorage 的 gewu.onboard），设置里可以「再看一次」；
   · 不阻断书写以外的操作：Esc / 跳过 立刻退出，退出后不再自动弹；
   · 高亮用「一个带巨大外阴影的圆角框」做挖洞，不依赖目标元素自己的层级与裁剪；
   · 手机上默认只有悬浮球，所以第一步必须指到球上 —— 否则新用户找不到任何按钮。
*/
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW || GW.onboard) return;

  const KEY = 'gewu.onboard';
  const DONE = '1';
  let box = null;        // 遮罩根节点
  let idx = 0;
  let steps = [];
  let card = null;
  let hi = null;

  // 注意：不能用 offsetParent 判可见 —— 悬浮球 / 三条栏都是 position:fixed，fixed 元素的
  // offsetParent 恒为 null，按它判会把「明明在屏幕上的球」当成不存在（第一版就踩了，
  // 表现是第一步高亮框 0×0）。用 getClientRects() 才是「有没有参与排版」。
  const has = (sel) => { const el = document.querySelector(sel); return el && el.getClientRects().length ? el : null; };

  function rectOf(sel) {
    const el = has(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  // 每一步的文案按「这一端能看到的入口」写：手机只有球，电脑有整条工具栏。
  function build() {
    const phone = Math.min(innerWidth, innerHeight) < 560;
    const list = [
      {
        sel: '#ball', title: '右下角这颗球是总入口',
        body: phone
          ? '手机上为了让你看到整块画布，工具栏默认是收起的：点这颗球，笔、橡皮、插入、框选都会从它周围展开。'
          : '点它可以随时收起/展开下方工具栏；双击不做任何危险操作，只是展开。',
        place: 'left',
      },
      {
        sel: '#dock', title: threeBarTitle(),
        body: '从左到右依次是选择、钢笔、毛笔、橡皮、尺规、插入、仿真、课堂工具……鼠标悬停（平板是长按）能看到名字。',
        place: 'top',
        when: () => has('#dock'),
      },
      {
        sel: null, title: '写字就三种手势', body:
          '单指 = 书写（笔尖的位置就是墨点的位置）\n' +
          '双指 = 平移与缩放（苹果 Pencil 写字时手掌压上去不会落墨）\n' +
          '三指下滑 = 撤销，上滑 = 重做',
        place: 'center',
      },
      {
        sel: '#sel-bar', title: '框选之后，右边会出现 AI', body:
          '用「选择」圈住一块板书：工具条上能直接「识公式 / AI 规整 / AI 排版 / 截图」，不用再去插入菜单里找。',
        place: 'top',
        when: () => has('#sel-bar'),
      },
      {
        sel: null, title: '开始上课', body:
          '插入菜单里还有一个「AI 助手」：模型与密钥、免费网页版 AI、全部 AI 工具都在那一个入口里。\n' +
          '设置里可以随时重看这份引导。',
        place: 'center',
      },
    ];
    return list.filter((s) => !s.when || s.when());
  }

  function threeBarTitle() {
    const phone = Math.min(innerWidth, innerHeight) < 560;
    return phone ? '下方三条栏各管什么' : '工具栏在这里';
  }

  function close() {
    if (box) { box.remove(); box = null; }
    card = null; hi = null;
    window.removeEventListener('resize', place, true);
    window.removeEventListener('keydown', onKey, true);
  }

  function onKey(e) {
    if (e.key === 'Escape') { finish(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  }

  function finish() {
    try { localStorage.setItem(KEY, DONE); } catch (e) { /* 隐私模式就算了 */ }
    close();
    GW.toast && GW.toast('引导结束：随时可以在设置里重看');
  }

  function next() { if (idx >= steps.length - 1) return finish(); idx++; show(); }
  function prev() { if (idx <= 0) return; idx--; show(); }

  function place() {
    if (!box || !card) return;
    const st = steps[idx];
    const r = st.sel ? rectOf(st.sel) : null;
    if (hi) {
      if (r) {
        hi.style.display = '';
        hi.style.left = (r.x - 8) + 'px';
        hi.style.top = (r.y - 8) + 'px';
        hi.style.width = (r.w + 16) + 'px';
        hi.style.height = (r.h + 16) + 'px';
      } else hi.style.display = 'none';
    }
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const pad = 14;
    let x, y;
    if (!r) { x = (innerWidth - cw) / 2; y = Math.max(pad, innerHeight / 2 - ch / 2); }
    else if (st.place === 'left') {
      x = r.x - cw - pad - 4;
      if (x < pad) x = r.x + r.w + pad + 4;
      y = GW.clamp ? GW.clamp(r.y + r.h / 2 - ch / 2, pad, innerHeight - ch - pad) : Math.max(pad, r.y);
    } else if (st.place === 'top') {
      x = GW.clamp ? GW.clamp(r.x + r.w / 2 - cw / 2, pad, innerWidth - cw - pad) : r.x;
      y = r.y - ch - pad - 4;
      if (y < pad) y = r.y + r.h + pad + 4;
    } else {
      x = GW.clamp ? GW.clamp(r.x + r.w / 2 - cw / 2, pad, innerWidth - cw - pad) : r.x;
      y = r.y - ch - pad - 4;
      if (y < pad) y = Math.min(r.y + r.h + pad + 4, innerHeight - ch - pad);
    }
    // 收口：卡片必须整个落在视口里。手机上卡片接近满屏宽，「放在目标左边」会直接算出负数，
    // 结果整块卡片跑到屏幕外，看起来就是「引导卡住、点不到下一步」。
    x = Math.max(pad, Math.min(x, innerWidth - cw - pad));
    y = Math.max(pad, Math.min(y, innerHeight - ch - pad));
    card.style.left = Math.round(x) + 'px';
    card.style.top = Math.round(y) + 'px';
  }

  function show() {
    if (!box) {
      box = document.createElement('div');
      box.className = 'ob-wrap';
      hi = document.createElement('div');
      hi.className = 'ob-hi';
      box.append(hi);
      card = document.createElement('div');
      card.className = 'ob-card';
      box.append(card);
      document.body.append(box);
      window.addEventListener('resize', place, true);
      window.addEventListener('keydown', onKey, true);
    }
    const st = steps[idx];
    card.textContent = '';
    const n = document.createElement('div');
    n.className = 'ob-step';
    n.textContent = (idx + 1) + ' / ' + steps.length;
    const t = document.createElement('div');
    t.className = 'ob-t';
    t.textContent = st.title;
    const b = document.createElement('div');
    b.className = 'ob-b';
    b.style.whiteSpace = 'pre-line';
    b.textContent = st.body;
    const bar = document.createElement('div');
    bar.className = 'ob-bar';
    const skip = document.createElement('button');
    skip.className = 'gw-btn ob-skip';
    skip.textContent = '跳过';
    skip.onclick = finish;
    const pre = document.createElement('button');
    pre.className = 'gw-btn';
    pre.textContent = '上一步';
    pre.disabled = idx === 0;
    pre.onclick = prev;
    const nxt = document.createElement('button');
    nxt.className = 'gw-btn primary';
    nxt.textContent = idx === steps.length - 1 ? '开始用' : '下一步';
    nxt.onclick = next;
    bar.append(skip, pre, nxt);
    card.append(n, t, b, bar);
    place();
  }

  function auto() {
    let seen = false;
    try { seen = localStorage.getItem(KEY) === DONE; } catch (e) { seen = true; }
    if (seen) return false;
    steps = build();
    idx = 0;
    // 手机上悬浮球可能在开机动画里还没定位好，等两帧再量
    setTimeout(() => requestAnimationFrame(() => show()), 120);
    return true;
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    return auto();
  }

  GW.onboard = { auto, reset, open: reset, done: () => localStorage.getItem(KEY) === DONE, close };
})(window);
