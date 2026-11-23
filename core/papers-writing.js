/* 纸张库 · A 书写练习（6）+ B 横线与分栏（11）—— 2.0.7
 *
 * 全部自研 canvas 参数化绘制：只用「行距 / 分栏 / 格数」这类通用版式语义，
 * 不搬任何外部素材（红线/虚线/数字都是 ctx 现画）。
 * 契约见 papers.js 顶部；几何一律 b.l + b.w*u，A4 竖版与 16:9 横版都不变形。
 */
(function () {
  const GW = (window.GW = window.GW || {});
  const K = GW.paperKit;
  const { begin, seg, rect, txt, pal, lw } = K;

  const LIST = [
    // ================= A 书写练习 =================
    {
      id: 'tian', name: '田字格', category: '书写练习',
      cfg: { lineHeight: 56, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 方格边长跟随行距参数；保留外框留白，格子从左上整齐铺开
        const cs = Math.max(24, K.lhOf(b, cfg));
        const pad = Math.min(b.w, b.h) * 0.06;
        const cols = Math.max(1, Math.floor((b.w - pad * 2) / cs));
        const rows = Math.max(1, Math.floor((b.h - pad * 2) / cs));
        const ox = b.l + (b.w - cols * cs) / 2, oy = b.t + pad;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.4;
        for (let i = 0; i <= cols; i++) seg(ctx, ox + i * cs, oy, ox + i * cs, oy + rows * cs);
        for (let j = 0; j <= rows; j++) seg(ctx, ox, oy + j * cs, ox + cols * cs, oy + j * cs);
        // 每格内部：竖向中线 + 横向中线（虚线，压在主格线之下不抢眼）
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        K.dash(ctx, cs * 0.1, cs * 0.1);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const x = ox + i * cs, y = oy + j * cs;
          seg(ctx, x + cs / 2, y, x + cs / 2, y + cs);
          seg(ctx, x, y + cs / 2, x + cs, y + cs / 2);
        }
        K.nodash(ctx);
        ctx.restore();
      },
    },
    {
      id: 'mizige', name: '米字格', category: '书写练习',
      cfg: { lineHeight: 56, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        const cs = Math.max(24, K.lhOf(b, cfg));
        const pad = Math.min(b.w, b.h) * 0.06;
        const cols = Math.max(1, Math.floor((b.w - pad * 2) / cs));
        const rows = Math.max(1, Math.floor((b.h - pad * 2) / cs));
        const ox = b.l + (b.w - cols * cs) / 2, oy = b.t + pad;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.4;
        for (let i = 0; i <= cols; i++) seg(ctx, ox + i * cs, oy, ox + i * cs, oy + rows * cs);
        for (let j = 0; j <= rows; j++) seg(ctx, ox, oy + j * cs, ox + cols * cs, oy + j * cs);
        // 米字：十字 + 两条对角线，都走虚线
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        K.dash(ctx, cs * 0.1, cs * 0.1);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const x = ox + i * cs, y = oy + j * cs;
          seg(ctx, x + cs / 2, y, x + cs / 2, y + cs);
          seg(ctx, x, y + cs / 2, x + cs, y + cs / 2);
          seg(ctx, x, y, x + cs, y + cs);
          seg(ctx, x + cs, y, x, y + cs);
        }
        K.nodash(ctx);
        ctx.restore();
      },
    },
    {
      id: 'four-line', name: '英语四线三格', category: '书写练习',
      cfg: { lineHeight: 40, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 一组四线：中间两条细虚线，上下两条实线；组间距 = 行距参数
        const gap = Math.max(8, K.lhOf(b, cfg) * 0.28);
        const groupH = gap * 3;
        const padX = b.w * 0.06, x0 = b.l + padX, x1 = b.l + b.w - padX;
        let y = b.t + b.h * 0.08;
        while (y + groupH <= b.t + b.h * 0.95) {
          ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.3;
          seg(ctx, x0, y, x1, y);
          seg(ctx, x0, y + groupH, x1, y + groupH);
          ctx.strokeStyle = C.ink; ctx.lineWidth = k;
          K.dash(ctx, gap * 0.4, gap * 0.35);
          seg(ctx, x0, y + gap, x1, y + gap);
          seg(ctx, x0, y + gap * 2, x1, y + gap * 2);
          K.nodash(ctx);
          y += groupH + Math.max(14, K.lhOf(b, cfg) * 0.55);
        }
        ctx.restore();
      },
    },
    {
      id: 'pinyin', name: '拼音四线格', category: '书写练习',
      cfg: { lineHeight: 44, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 拼音格 = 四线三格 + 竖向格位（每格一个音节），基线加粗
        const gap = Math.max(8, K.lhOf(b, cfg) * 0.3), groupH = gap * 3;
        const padX = b.w * 0.05, x0 = b.l + padX, x1 = b.l + b.w - padX;
        const cellW = Math.max(28, groupH * 0.9);
        let y = b.t + b.h * 0.07;
        while (y + groupH <= b.t + b.h * 0.96) {
          ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.3;
          seg(ctx, x0, y, x1, y);
          seg(ctx, x0, y + groupH, x1, y + groupH);
          ctx.strokeStyle = C.ink; ctx.lineWidth = k;
          seg(ctx, x0, y + gap, x1, y + gap);
          K.dash(ctx, gap * 0.4, gap * 0.35);
          seg(ctx, x0, y + gap * 2, x1, y + gap * 2);
          K.nodash(ctx);
          for (let x = x0; x <= x1 + 0.01; x += cellW) seg(ctx, x, y, x, y + groupH);
          y += groupH + Math.max(12, K.lhOf(b, cfg) * 0.4);
        }
        ctx.restore();
      },
    },
    {
      id: 'huigong', name: '回宫格', category: '书写练习',
      cfg: { lineHeight: 64, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 回宫格 = 外宫 + 内宫（内框占 1/3），书法练字用来定重心
        const cs = Math.max(28, K.lhOf(b, cfg) * 1.1);
        const pad = Math.min(b.w, b.h) * 0.05;
        const cols = Math.max(1, Math.floor((b.w - pad * 2) / cs));
        const rows = Math.max(1, Math.floor((b.h - pad * 2) / cs));
        const ox = b.l + (b.w - cols * cs) / 2, oy = b.t + pad;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const x = ox + i * cs, y = oy + j * cs;
          ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.4;
          rect(ctx, x, y, cs, cs);
          ctx.strokeStyle = C.ink; ctx.lineWidth = k;
          K.dash(ctx, cs * 0.08, cs * 0.08);
          rect(ctx, x + cs / 3, y + cs / 3, cs / 3, cs / 3);
          K.nodash(ctx);
        }
        ctx.restore();
      },
    },
    {
      id: 'trace', name: '描红格', category: '书写练习',
      cfg: { lineHeight: 80, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 描红：大格 + 极淡的田字辅助线 + 底部基线（字写在大格里，练结构）
        const cs = Math.max(40, K.lhOf(b, cfg) * 1.4);
        const pad = Math.min(b.w, b.h) * 0.06;
        const cols = Math.max(1, Math.floor((b.w - pad * 2) / cs));
        const rows = Math.max(1, Math.floor((b.h - pad * 2) / cs));
        const ox = b.l + (b.w - cols * cs) / 2, oy = b.t + pad;
        ctx.strokeStyle = C.ink; ctx.lineWidth = k * 1.2;
        for (let i = 0; i <= cols; i++) seg(ctx, ox + i * cs, oy, ox + i * cs, oy + rows * cs);
        for (let j = 0; j <= rows; j++) seg(ctx, ox, oy + j * cs, ox + cols * cs, oy + j * cs);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        K.dash(ctx, cs * 0.12, cs * 0.12);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const x = ox + i * cs, y = oy + j * cs;
          seg(ctx, x + cs / 2, y, x + cs / 2, y + cs);
          seg(ctx, x, y + cs / 2, x + cs, y + cs / 2);
        }
        K.nodash(ctx);
        ctx.globalAlpha = 1;
        ctx.restore();
      },
    },

    // ================= B 横线与分栏 =================
    {
      id: 'ruled-narrow', name: '窄行横线', category: '横线分栏',
      cfg: { lineHeight: 26, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        const step = K.lhOf(b, cfg);
        K.ruled(ctx, b.l + b.w * 0.05, b.l + b.w * 0.95, b.t + step, b.t + b.h - b.h * 0.04, step, C, k);
        ctx.restore();
      },
    },
    {
      id: 'ruled-wide', name: '宽行横线', category: '横线分栏',
      cfg: { lineHeight: 40, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        const step = K.lhOf(b, cfg);
        K.ruled(ctx, b.l + b.w * 0.05, b.l + b.w * 0.95, b.t + step, b.t + b.h - b.h * 0.04, step, C, k);
        ctx.restore();
      },
    },
    {
      id: 'ruled-margin', name: '带边线横线', category: '横线分栏',
      cfg: { lineHeight: 32, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        const step = K.lhOf(b, cfg);
        const mx = b.l + b.w * 0.14;                     // 左侧批注边线
        K.ruled(ctx, mx + b.w * 0.02, b.l + b.w * 0.95, b.t + step, b.t + b.h - b.h * 0.04, step, C, k);
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
        seg(ctx, mx, b.t + b.h * 0.05, mx, b.t + b.h * 0.95);
        ctx.restore();
      },
    },
    {
      id: 'legal', name: '法条纸', category: '横线分栏',
      cfg: { lineHeight: 34, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 双栏 + 行号列：条文抄写/法条笔记，左侧窄列写条号
        const step = K.lhOf(b, cfg);
        const x0 = b.l + b.w * 0.05, x1 = b.l + b.w * 0.95;
        const mid = (x0 + x1) / 2, numW = b.w * 0.05;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.5;
        seg(ctx, mid, b.t + b.h * 0.06, mid, b.t + b.h * 0.94);
        seg(ctx, x0 + numW, b.t + b.h * 0.06, x0 + numW, b.t + b.h * 0.94);
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        let n = 1;
        for (let y = b.t + b.h * 0.06 + step; y < b.t + b.h * 0.94; y += step) {
          seg(ctx, x0, y, x1, y);
          txt(ctx, String(n++), x0 + numW * 0.5, y - step * 0.3, Math.max(6, step * 0.26), C.text, 'center');
        }
        ctx.restore();
      },
    },
    {
      id: 'single-column', name: '单栏', category: '横线分栏',
      cfg: { lineHeight: 30, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        const step = K.lhOf(b, cfg);
        const x0 = b.l + b.w * 0.07, x1 = b.l + b.w * 0.93;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.4;
        rect(ctx, x0, b.t + b.h * 0.05, x1 - x0, b.h * 0.9);
        K.ruled(ctx, x0, x1, b.t + b.h * 0.05 + step * 1.5, b.t + b.h * 0.95 - step * 0.5, step, C, k);
        ctx.restore();
      },
    },
    {
      id: 'single-column-mix', name: '单栏混合', category: '横线分栏',
      cfg: { lineHeight: 30, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 顶部标题区（3 行 + 粗分隔）+ 正文横线（行距更密）
        const step = K.lhOf(b, cfg);
        const x0 = b.l + b.w * 0.07, x1 = b.l + b.w * 0.93;
        const split = b.t + b.h * 0.26;
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        for (let y = b.t + b.h * 0.06; y < split - step * 0.4; y += step * 1.6) seg(ctx, x0, y, x1, y);
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.8;
        seg(ctx, x0, split, x1, split);
        K.ruled(ctx, x0, x1, split + step, b.t + b.h * 0.94, step * 0.9, C, k);
        ctx.restore();
      },
    },
    {
      id: 'two-column', name: '双栏', category: '横线分栏',
      cfg: { lineHeight: 30, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        const step = K.lhOf(b, cfg);
        const x0 = b.l + b.w * 0.06, x1 = b.l + b.w * 0.94;
        const mid = (x0 + x1) / 2, gap = b.w * 0.04;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.5;
        seg(ctx, mid, b.t + b.h * 0.05, mid, b.t + b.h * 0.95);
        K.ruled(ctx, x0, mid - gap, b.t + b.h * 0.05 + step, b.t + b.h * 0.95, step, C, k);
        K.ruled(ctx, mid + gap, x1, b.t + b.h * 0.05 + step, b.t + b.h * 0.95, step, C, k);
        ctx.restore();
      },
    },
    {
      id: 'two-column-note', name: '双栏笔记', category: '横线分栏',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 标题区（通栏）+ 下面双栏笔记；左窄右宽（左写要点，右写细节）
        const step = K.lhOf(b, cfg);
        const x0 = b.l + b.w * 0.06, x1 = b.l + b.w * 0.94;
        const headY = b.t + b.h * 0.12;
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        // 顶部那条细线的 y 必须是「b.t + 相对高度」：原来写成 headY*0.6，b.t≠0 时
        // 偏移量被一起乘了 0.6（整页平移 70 只挪 42），probe-paper ④ 就是逮这个。
        const topY = b.t + (headY - b.t) * 0.6;
        seg(ctx, x0, topY, x1, topY);
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.8;
        seg(ctx, x0, headY, x1, headY);
        const mid = x0 + (x1 - x0) * 0.36;
        seg(ctx, mid, headY, mid, b.t + b.h * 0.94);
        K.ruled(ctx, x0, mid - b.w * 0.02, headY + step, b.t + b.h * 0.94, step, C, k);
        K.ruled(ctx, mid + b.w * 0.02, x1, headY + step, b.t + b.h * 0.94, step, C, k);
        ctx.restore();
      },
    },
    {
      id: 'three-column', name: '三栏', category: '横线分栏',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        const step = K.lhOf(b, cfg);
        const x0 = b.l + b.w * 0.05, x1 = b.l + b.w * 0.95;
        const w = (x1 - x0) / 3, gap = b.w * 0.018;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.4;
        for (let i = 1; i < 3; i++) seg(ctx, x0 + w * i, b.t + b.h * 0.05, x0 + w * i, b.t + b.h * 0.95);
        for (let i = 0; i < 3; i++) {
          K.ruled(ctx, x0 + w * i + gap, x0 + w * (i + 1) - gap, b.t + b.h * 0.05 + step, b.t + b.h * 0.95, step, C, k);
        }
        ctx.restore();
      },
    },
    {
      id: 'two-column-left', name: '左窄右宽', category: '横线分栏',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        const step = K.lhOf(b, cfg);
        const x0 = b.l + b.w * 0.05, x1 = b.l + b.w * 0.95;
        const mid = x0 + (x1 - x0) * 0.3;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.5;
        seg(ctx, mid, b.t + b.h * 0.05, mid, b.t + b.h * 0.95);
        K.ruled(ctx, x0, mid - b.w * 0.02, b.t + b.h * 0.05 + step, b.t + b.h * 0.95, step, C, k);
        K.ruled(ctx, mid + b.w * 0.02, x1, b.t + b.h * 0.05 + step, b.t + b.h * 0.95, step, C, k);
        ctx.restore();
      },
    },
    {
      id: 'two-column-right', name: '左宽右窄', category: '横线分栏',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        const step = K.lhOf(b, cfg);
        const x0 = b.l + b.w * 0.05, x1 = b.l + b.w * 0.95;
        const mid = x0 + (x1 - x0) * 0.7;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.5;
        seg(ctx, mid, b.t + b.h * 0.05, mid, b.t + b.h * 0.95);
        K.ruled(ctx, x0, mid - b.w * 0.02, b.t + b.h * 0.05 + step, b.t + b.h * 0.95, step, C, k);
        K.ruled(ctx, mid + b.w * 0.02, x1, b.t + b.h * 0.05 + step, b.t + b.h * 0.95, step, C, k);
        ctx.restore();
      },
    },
  ];

  GW.addPapers(LIST);
})();
