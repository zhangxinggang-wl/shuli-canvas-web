/* 应用内性能自检 —— 在教室那台真机上量，而不是在开发机上猜。
   为什么必须做在应用里：
     · 我在开发机上复现不出希沃 H65EA / TE70-DB02 / TL65-DB01 的真实帧率；
     · JS 侧计时也看不到真正的开销 —— Canvas2D 只是把绘制指令「记录」下来，光栅化在别的线程完成，
       performance.now() 量 renderAll 只有 0.1ms，这个数字真实但会误导人（见 scripts/bench-renderall.js）。
   所以这里量三件在真机上才有意义的事：
     1) 帧间隔分布与掉帧数：空转 / 拖动 / 书写三种情形；
     2) 整屏重画（renderAll）发生次数：给墨迹层的整屏 clearRect 打桩，拖动时不应每帧一次；
     3) 渲染环境：显卡是否真的在加速、当前档位、画布像素数。
   结果给出一段可直接复制回传的文本。 */
(() => {
  const GW = window.GW;
  if (!GW || !GW.perf) return;
  const now = () => performance.now();

  const el = (t, a, ...kids) => GW.h(t, a, ...kids);

  // ---------- 整屏重画计数 ----------
  // renderAll() 里有一条 inkCtx.clearRect(0,0,inkCv.width,inkCv.height)（board.js:395），
  // 墨迹层整屏清一次 = 整屏重画一次。这是可判定的判据，不依赖任何耗时猜测。
  let fullRepaints = 0;
  const origClear = CanvasRenderingContext2D.prototype.clearRect;
  const installCounter = () => {
    CanvasRenderingContext2D.prototype.clearRect = function (x, y, w, h) {
      const c = this.canvas;
      if (c && c.id === 'ink-canvas' && w >= c.width * 0.98 && h >= c.height * 0.98) fullRepaints++;
      return origClear.apply(this, arguments);
    };
  };
  const removeCounter = () => { CanvasRenderingContext2D.prototype.clearRect = origClear; };

  const pe = (type, x, y, id) => new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true,
    clientX: x, clientY: y, pressure: 0.5, width: 12, height: 12, buttons: type === 'pointerup' ? 0 : 1,
  });

  // ---------- 帧间隔采样 ----------
  function sampleFrames(ms, perFrame) {
    return new Promise((resolve) => {
      const gaps = [];
      let last = now(), stop = false, i = 0;
      const loop = () => {
        const n = now();
        gaps.push(n - last);
        last = n;
        if (perFrame) { try { perFrame(++i); } catch (e) {} }
        if (!stop) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      setTimeout(() => {
        stop = true;
        setTimeout(() => {
          gaps.shift();
          const s = gaps.slice().sort((a, b) => a - b);
          const q = (p) => (s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : 0);
          const med = q(0.5);
          resolve({
            帧数: s.length,
            中位帧间隔ms: med,
            折算帧率: med ? Math.round(1000 / med) : 0,
            p95帧间隔ms: q(0.95),
            最长帧间隔ms: s.length ? +s[s.length - 1].toFixed(1) : 0,
            掉帧数: gaps.filter((g) => g > 32).length,
          });
        }, 60);
      }, ms);
    });
  }

  function blank(ms) { return sampleFrames(ms, null); }

  // 拖动：手型工具，每帧推一段位移
  async function dragTest(ms) {
    const before = fullRepaints;
    const v0 = GW.viewRect ? JSON.stringify(GW.viewRect()) : '';
    const world0 = (document.getElementById('world') || {}).style ? document.getElementById('world').style.transform : '';
    GW.tool.set('hand');
    const cap = document.getElementById('capture');
    const id = 91;
    let k = 0;
    cap.dispatchEvent(pe('pointerdown', Math.round(innerWidth * 0.6), Math.round(innerHeight * 0.5), id));
    const r = await sampleFrames(ms, () => {
      k++;
      cap.dispatchEvent(pe('pointermove', Math.round(innerWidth * 0.6) - k * 6, Math.round(innerHeight * 0.5) - k * 3, id));
    });
    cap.dispatchEvent(pe('pointerup', 0, 0, id));
    const world1 = (document.getElementById('world') || {}).style ? document.getElementById('world').style.transform : '';
    r.整屏重画次数 = fullRepaints - before;
    r.每帧整屏重画 = +(r.整屏重画次数 / Math.max(1, k)).toFixed(2);
    r.视图确实变了 = world0 !== world1;
    void v0;
    return r;
  }

  // 书写：钢笔，每帧推一个点
  async function writeTest(ms) {
    const before = fullRepaints;
    GW.tool.set('pen');
    const cap = document.getElementById('capture');
    const id = 92;
    let k = 0;
    const x0 = Math.round(innerWidth * 0.2), y0 = Math.round(innerHeight * 0.4);
    cap.dispatchEvent(pe('pointerdown', x0, y0, id));
    const r = await sampleFrames(ms, () => {
      k++;
      cap.dispatchEvent(pe('pointermove', x0 + k * 7, y0 + Math.sin(k / 6) * 60, id));
    });
    cap.dispatchEvent(pe('pointerup', x0 + k * 7, y0, id));
    r.整屏重画次数 = fullRepaints - before;
    r.落笔点数 = k;
    return r;
  }

  function envInfo() {
    const ink = document.getElementById('ink-canvas');
    return {
      窗口: innerWidth + '×' + innerHeight,
      设备像素比: window.devicePixelRatio,
      墨迹层像素: ink ? ink.width + '×' + ink.height + '（' + (ink.width * ink.height / 1e6).toFixed(1) + ' Mpx）' : '?',
      渲染档位: GW.perf.tierLabel ? GW.perf.tierLabel() : GW.perf.tier,
      CPU线程数: navigator.hardwareConcurrency || '?',
      内存GB: navigator.deviceMemory || '读不到',
    };
  }

  let busy = false;
  async function run() {
    if (busy) return null;
    busy = true;
    const prevTool = GW.tool.current;
    const bad = [];
    installCounter();
    try {
      GW.toast('性能自检中…请先别碰屏幕（约 6 秒）', 4000);
      await new Promise((r) => setTimeout(r, 300));

      const env = envInfo();
      const gpu = GW.perf.gpu ? { accelerated: !!GW.perf.gpu.accelerated, 说明: JSON.stringify(GW.perf.gpu) } : null;

      const r空转 = await blank(1300);
      const r拖动 = await dragTest(1600);
      await new Promise((r) => setTimeout(r, 250));
      const r书写 = await writeTest(1600);
      await new Promise((r) => setTimeout(r, 250));

      // ---- 自检：数字必须建立在「真的发生了」之上 ----
      if (!r拖动.视图确实变了) bad.push('拖动阶段视图没有变化，拖动数据不成立');
      if (r书写.落笔点数 < 20) bad.push('书写阶段落笔点太少，书写数据不成立');
      if (r空转.帧数 < 20) bad.push('空转采样帧数太少');

      const out = { 环境: env, 显卡: gpu, 空转: r空转, 拖动: r拖动, 书写: r书写, 自检: bad.length ? bad : '通过' };
      out.文本 = render(out);
      GW.perfCheck.last = out;
      return out;
    } finally {
      removeCounter();
      GW.tool.set(prevTool || 'pen');
      GW.requestRender();
      busy = false;
    }
  }

  function render(o) {
    const L = [];
    L.push('数理无限画布 · 性能自检');
    L.push('时间 ' + new Date().toLocaleString());
    L.push('');
    L.push('【环境】');
    for (const k in o.环境) L.push('  ' + k + '：' + o.环境[k]);
    if (o.显卡) L.push('  硬件加速：' + (o.显卡.accelerated ? '已启用' : '未启用（软件渲染，书写会明显变卡）') + ' ' + o.显卡.说明);
    L.push('');
    const blk = (name, r, extra) => {
      L.push('【' + name + '】帧数 ' + r.帧数 + '，折算帧率 ' + r.折算帧率 + ' fps');
      L.push('  中位帧间隔 ' + r.中位帧间隔ms + ' ms ／ p95 ' + r.p95帧间隔ms + ' ms ／ 最长 ' + r.最长帧间隔ms + ' ms');
      L.push('  掉帧数（>32ms）：' + r.掉帧数);
      if (extra) L.push('  ' + extra);
    };
    blk('空转', o.空转);
    blk('拖动画布', o.拖动, '整屏重画 ' + o.拖动.整屏重画次数 + ' 次（每帧 ' + o.拖动.每帧整屏重画 + '）· 视图已变化：' + (o.拖动.视图确实变了 ? '是' : '否'));
    blk('书写', o.书写, '落笔点 ' + o.书写.落笔点数 + ' 个 · 整屏重画 ' + o.书写.整屏重画次数 + ' 次');
    L.push('');
    L.push('【判读】');
    L.push('  · 拖动时「每帧整屏重画」应接近 0；若接近 1，说明视图快速通道没生效。');
    L.push('  · 书写帧率应接近空转帧率；明显低一截说明落笔的开销压不住。');
    L.push('  · 硬件加速若显示「未启用」，先在设置里把渲染档位改成「流畅优先」。');
    L.push('');
    L.push('【自检】' + (Array.isArray(o.自检) ? o.自检.join('；') : o.自检));
    return L.join('\n');
  }

  // ---------- 结果面板 ----------
  function show(o) {
    const pre = el('pre', {
      style: { margin: '0', padding: '12px', background: '#f6f8fa', border: '1px solid #e3e8ee', borderRadius: '10px',
        font: '12px/1.6 Consolas,Menlo,monospace', whiteSpace: 'pre-wrap', maxHeight: '52vh', overflow: 'auto', userSelect: 'text' },
    }, o.文本);
    const copy = el('button', { class: 'gw-btn primary' }, '复制结果');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(o.文本);
        GW.toast('已复制，直接发给我即可', 2600);
      } catch (e) {
        const ta = el('textarea', { style: { position: 'fixed', left: '-9999px' } });
        ta.value = o.文本; document.body.append(ta); ta.select();
        try { document.execCommand('copy'); GW.toast('已复制，直接发给我即可', 2600); } catch (e2) { GW.toast('复制失败，请手动选中上面的文字', 3000); }
        ta.remove();
      }
    });
    const again = el('button', { class: 'gw-btn' }, '重测一次');
    const close = el('button', { class: 'gw-btn' }, '关闭');
    const wrap = el('div', { class: 'dlg-wrap' },
      el('div', { class: 'dlg', style: { width: 'min(760px, 92vw)' } },
        el('div', { style: { padding: '16px 18px 6px', fontSize: '16px', fontWeight: '600' } }, '性能自检结果'),
        el('div', { style: { padding: '0 18px', color: '#63707f', fontSize: '12.5px', lineHeight: '1.6' } },
          '这份结果量的是这台机器上的真实帧率与整屏重画次数。把整段文字发回来，就能按这台机器的表现继续调优。'),
        el('div', { style: { padding: '12px 18px' } }, pre),
        el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '0 18px 16px' } }, again, copy, close)));
    const kill = () => wrap.remove();
    close.addEventListener('click', kill);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) kill(); });
    again.addEventListener('click', async () => { kill(); const r = await run(); if (r) show(r); });
    document.body.append(wrap);
  }

  GW.perfCheck = {
    run,
    last: null,
    async open() {
      const r = await run();
      if (r) show(r); else GW.toast('自检正在进行中', 1800);
    },
  };
})();
