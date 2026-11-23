/* 纸张库（1.7 · T14）—— 整页纸张的**画法**，不碰页面模型。
 *
 * 每张纸 = { id, name, category, tone, cfg, draw(ctx, b, cfg) }：
 *   - b 是**页面世界矩形** { l, t, w, h }，几何一律写成 b.l + b.w*u / b.t + b.h*v，
 *     所以 A4 竖版、16:9 黑板页、任意缩放下版式都不变形（同 stencils.js 的相对坐标约定）。
 *   - ctx 用世界坐标：调用方先把「世界 → 设备」的 transform 设好（页面矩阵见 board.js 的 pageMatrix）。
 *   - draw() 只管自己那一个页面矩形，开头 begin()：
 *     同一张纸连画两次像素完全一致（幂等），套用两次不会叠出双线。
 *   - cfg（2.0.7 A2）= 页面级纸张参数 { lineHeight, orientation, tone }，由 page.paperCfg 传进来；
 *     每张纸给一份缺省值（写在 cfg 字段里），面板改参数后即时重绘。
 *
 * 与整页模板（GW.PAGE_TPL，board.js）的关系：
 *   PAGE_TPL 管**底纹族**（横线/方格/坐标/点阵/黑板，由 drawBg 按屏幕换挡平铺），
 *   纸张库管**版式**（康奈尔分栏、月计划表格、六线谱）—— 这些不是平铺纹理，
 *   必须按整页一次画完，不能靠 background 平铺。两者是并存关系，不是替代。
 *
 * 2.0.7：从 4 张扩到 49 张，分三个文件（writing / plan / think）挂到同一个 GW.papers 上。
 * 面板只认 GW.papers 这一个数组，分类用 category 字段（tpl-ui.js）。
 */
(function () {
  const GW = (window.GW = window.GW || {});

  // ---------- 纸线色板（与既有横线纸 #c9d3dd 同色系，压在白纸上不抢墨迹）----------
  const INK = '#c3cfdb';   // 细线：行线 / 弦线 / 网格
  const INK2 = '#9fb0c2';  // 主分栏线：康奈尔中线、月计划外框、谱表起止小节线
  const DOT = '#a9b8c8';   // 点阵
  const TEXT = '#8fa1b3';  // 星期行等小字

  // 深色纸（tone:'dark'）的反色一套：只在深纸上用，不新造颜色体系（同 app.css 的黑板页）
  const DINK = 'rgba(255,255,255,.20)', DINK2 = 'rgba(255,255,255,.38)';
  const DDOT = 'rgba(255,255,255,.26)', DTEXT = 'rgba(255,255,255,.55)';

  // 线宽跟着页宽走（同样的相对版式，A4 与 16:9 上粗细观感一致）
  const lw = (b) => Math.max(0.6, b.w / 1200);

  // 每张纸的开头：清掉自己的页面矩形（幂等的根），存一份 ctx 状态，画完必须 restore()
  // 1.7.0 接线：board.js 的底纹层**已经**画好底色与平铺纹，这时候再 clearRect 会把底色抠成
  // 透明（窗口就透出桌面了）—— 所以接线方传 `{noClear:true}`，只叠线不清底。
  let noClear = false;
  let curCfg = null;
  function begin(ctx, b) {
    ctx.save();
    if (!noClear) ctx.clearRect(b.l, b.t, b.w, b.h);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
  }
  function seg(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function rect(ctx, x, y, w, h) { ctx.strokeRect(x, y, w, h); }
  function txt(ctx, s, x, y, size, color, align, baseline) {
    ctx.fillStyle = color;
    ctx.font = size + 'px sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'alphabetic';
    ctx.fillText(s, x, y);
  }
  function dash(ctx, a, b2) { ctx.setLineDash([a, b2]); }
  function nodash(ctx) { ctx.setLineDash([]); }

  // 参数归一：cfg 只认白名单里的三个字段，坏值一律回落到纸张自己的缺省
  function cfgOf(p, c) {
    const d = p.cfg || {};
    const o = c && typeof c === 'object' ? c : {};
    const lh = +o.lineHeight;
    return {
      lineHeight: lh >= 18 && lh <= 48 ? lh : (d.lineHeight || 28),
      orientation: o.orientation === 'landscape' ? 'landscape' : (d.orientation || 'portrait'),
      tone: o.tone === 'dark' ? 'dark' : (o.tone === 'light' ? 'light' : (p.tone === 'dark' ? 'dark' : 'light')),
    };
  }
  // 色板：深纸/浅纸各一套（纸张 draw 里只取色，不判断 tone）
  function pal(cfg) {
    const dark = cfg && cfg.tone === 'dark';
    return dark
      ? { ink: DINK, ink2: DINK2, dot: DDOT, text: DTEXT, dark: true }
      : { ink: INK, ink2: INK2, dot: DOT, text: TEXT, dark: false };
  }
  // 行距（世界单位）：cfg.lineHeight 是「A4 宽度下的相对值」，按页宽等比缩放 ——
  // 横版 1123 宽时同参数的行距也自然变大，版式不变形。
  // cfg 允许缺省：纸张 def 的 draw(ctx,b,cfg) 在纸库内部总是拿到 cfgOf() 归一过的配置，
  // 但探针 / 外部导出（如「模板库导出」逐张渲染）会直接调 def.draw(ctx,b) —— 少一个参数
  // 就抛 TypeError 会把整批 44 张纸一起打断，这里兜一下默认值。
  function lhOf(b, cfg) { const c = cfg || {}; return Math.max(8, (c.lineHeight || 28) * (b.w / 794)); }

  // 表格：给外框与内线，cols/rows 是**格子数**
  function table(ctx, x0, y0, x1, y1, cols, rows, C, k, headH) {
    ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
    rect(ctx, x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = C.ink; ctx.lineWidth = k;
    const cw = (x1 - x0) / cols;
    for (let i = 1; i < cols; i++) seg(ctx, x0 + cw * i, y0, x0 + cw * i, y1);
    const top = y0 + (headH || 0);
    if (headH) seg(ctx, x0, top, x1, top);
    const rh = (y1 - top) / rows;
    for (let j = 1; j < rows; j++) seg(ctx, x0, top + rh * j, x1, top + rh * j);
    return { cw, rh, top };
  }
  // 一叠等距横线（写字纸主力）
  function ruled(ctx, x0, x1, y0, y1, step, C, k, colorLine) {
    ctx.strokeStyle = colorLine || C.ink; ctx.lineWidth = k;
    for (let y = y0; y <= y1 + 0.01; y += step) seg(ctx, x0, y, x1, y);
  }
  // 点阵
  function dots(ctx, x0, y0, x1, y1, step, C, r) {
    ctx.fillStyle = C.dot;
    const s = r || Math.max(0.7, step * 0.075);
    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }
  // 圆角/直角框（便签位、流程框）
  function cell(ctx, x, y, w, h, C, k, r) {
    ctx.strokeStyle = C.ink; ctx.lineWidth = k;
    ctx.beginPath();
    const rr = Math.min(r == null ? 8 : r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.stroke();
  }

  // 2.0.7：纸张文件的共用工具（papers-*.js 用；面板与探针也能用）
  GW.paperKit = { INK, INK2, DOT, TEXT, lw, begin, seg, rect, txt, dash, nodash, cfgOf, pal, lhOf, table, ruled, dots, cell };
  GW.papers = GW.papers || [];
  GW.addPapers = function (list) {
    for (const p of list || []) {
      if (!p || !p.id || typeof p.draw !== 'function') continue;
      if (GW.paperById && GW.paperById(p.id)) continue;      // id 冲突：先注册的赢（4 个老 id 冻结）
      p.category = p.category || '其他';
      p.tone = p.tone === 'dark' ? 'dark' : 'light';
      p.cfg = Object.assign({ lineHeight: 28, orientation: 'portrait' }, p.cfg || {});
      GW.papers.push(p);
    }
    return GW.papers.length;
  };

  GW.papers = [
    // ---------- 1. 康奈尔笔记：左线索栏 1/3 + 下方总结栏 1/5 + 整页横线 ----------
    {
      id: 'cornell',
      name: '康奈尔笔记',
      category: '横线分栏',
      tone: 'light',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw: function (ctx, b, c) {
        const cfg = cfgOf(this, c), C = pal(cfg);
        const k = lw(b), pad = 0.04;
        begin(ctx, b);
        // 整页横线：行距按参数（A2），缺省 26 行等分 —— 两条路都落在同一组坐标上
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = k;
        const step = lhOf(b, cfg);
        for (let y = b.t + step * 1.1; y <= b.t + b.h * (1 - 0.2); y += step) {
          seg(ctx, b.l + b.w * pad, y, b.l + b.w * (1 - pad), y);
        }
        // 两条主分栏线粗一档：竖线（线索栏 1/3）只到总结栏，横线（总结栏 1/5）通栏
        ctx.strokeStyle = C.ink2;
        ctx.lineWidth = k * 1.6;
        const ux = b.l + b.w / 3;
        const vy = b.t + b.h * (1 - 0.2);
        seg(ctx, ux, b.t + b.h * pad, ux, vy);
        seg(ctx, b.l + b.w * pad, vy, b.l + b.w * (1 - pad), vy);
        ctx.restore();
      },
    },

    // ---------- 2. 月计划：7 列 × 5 行格子 + 顶部星期行 ----------
    {
      id: 'monthly',
      name: '月计划',
      category: '计划清单',
      tone: 'light',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw: function (ctx, b, c) {
        const cfg = cfgOf(this, c), C = pal(cfg);
        const k = lw(b), pad = 0.05;
        const COLS = 7, ROWS = 5;
        begin(ctx, b);
        const x0 = b.l + b.w * pad, x1 = b.l + b.w * (1 - pad);
        const y0 = b.t + b.h * pad, y1 = b.t + b.h * (1 - pad);
        const headH = (y1 - y0) * 0.09;             // 顶部星期行
        const cw = (x1 - x0) / COLS;
        const rh = (y1 - y0 - headH) / ROWS;
        // 外框 + 星期行分隔线重一档
        ctx.strokeStyle = C.ink2;
        ctx.lineWidth = k * 1.6;
        rect(ctx, x0, y0, x1 - x0, y1 - y0);
        seg(ctx, x0, y0 + headH, x1, y0 + headH);
        // 内部格线
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = k;
        for (let i = 1; i < COLS; i++) {
          const x = x0 + cw * i;
          seg(ctx, x, y0, x, y1);
        }
        for (let j = 1; j < ROWS; j++) {
          const y = y0 + headH + rh * j;
          seg(ctx, x0, y, x1, y);
        }
        // 星期小字：字号跟着格子和行高走，别写死 px
        const fs = Math.max(8, Math.min(headH * 0.48, cw * 0.28));
        const WD = ['一', '二', '三', '四', '五', '六', '日'];
        for (let i = 0; i < COLS; i++) txt(ctx, WD[i], x0 + cw * (i + 0.5), y0 + headH * 0.5, fs, C.text, 'center', 'middle');
        ctx.restore();
      },
    },

    // ---------- 3. 吉他六线谱：6 条等距横线 + 小节竖线 ----------
    {
      id: 'guitar-tab',
      name: '吉他六线谱',
      category: '音乐',
      tone: 'light',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw: function (ctx, b, c) {
        const cfg = cfgOf(this, c), C = pal(cfg);
        const k = lw(b), padX = 0.05;
        const S = 6, BARS = 8;
        begin(ctx, b);
        const x0 = b.l + b.w * padX, x1 = b.l + b.w * (1 - padX);
        // 六条弦只占页面中段的 56%（上下留白，谱面不顶到页边）
        const y0 = b.t + b.h * 0.22, y1 = b.t + b.h * 0.78;
        const gap = (y1 - y0) / (S - 1);
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = k;
        for (let i = 0; i < S; i++) {
          const y = y0 + gap * i;
          seg(ctx, x0, y, x1, y);
        }
        // 小节竖线：贯穿六条弦；起止两条（谱表边框）粗一档
        for (let i = 0; i <= BARS; i++) {
          const x = x0 + ((x1 - x0) * i) / BARS;
          const end = i === 0 || i === BARS;
          ctx.strokeStyle = end ? C.ink2 : C.ink;
          ctx.lineWidth = end ? k * 2 : k;
          seg(ctx, x, y0, x, y1);
        }
        ctx.restore();
      },
    },

    // ---------- 4. 几何点阵：等距小点（比底纹里的「点阵」更细）----------
    {
      id: 'dot-grid',
      name: '几何点阵',
      category: '几何思维',
      tone: 'light',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw: function (ctx, b, c) {
        const cfg = cfgOf(this, c), C = pal(cfg);
        begin(ctx, b);
        // 间距比「点阵」底纹（世界 40 / 屏幕 16px）更细，整页均匀居中，四周留半步
        const step = Math.min(b.w, b.h) / 52;
        const s = Math.max(0.8, step * 0.09);       // 点径跟着间距走，密而不糊
        const nx = Math.max(2, Math.floor(b.w / step));
        const ny = Math.max(2, Math.floor(b.h / step));
        const ox = b.l + (b.w - (nx - 1) * step) / 2;
        const oy = b.t + (b.h - (ny - 1) * step) / 2;
        ctx.fillStyle = C.dot;
        for (let j = 0; j < ny; j++) {
          const y = oy + j * step - s / 2;
          for (let i = 0; i < nx; i++) ctx.fillRect(ox + i * step - s / 2, y, s, s);
        }
        ctx.restore();
      },
    },
  ];

  // 接线用：按 id 查（找不到返回 null）。与 PAGE_TPL 的 find 写法一致，
  // 两张表各在自己的命名空间里，id 同名也不会串。
  GW.paperById = function (id) {
    const list = GW.papers || [];
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  // 接线用：把某张纸画到 ctx 的页面世界矩形 b 上；id 不认识就返回 false（不抛异常）。
  // 幂等由各张纸的 begin()/clearRect 保证 —— 同一次套用重复调用不会叠加。
  // opts.noClear = true：叠在已有底色/平铺纹之上时用（画布底纹层），只画线、不清底。
  // opts.cfg = { lineHeight, orientation, tone }：页面级纸张参数（A2）。
  GW.paperDraw = function (ctx, id, b, opts) {
    const p = GW.paperById(id);
    if (!p) return false;
    noClear = !!(opts && opts.noClear);
    curCfg = (opts && opts.cfg) || null;
    try { p.draw(ctx, b, cfgOf(p, curCfg)); } finally { noClear = false; curCfg = null; }
    return true;
  };
  GW.paperCfgOf = function (p, c) { return cfgOf(p || { cfg: {} }, c); };
})();
