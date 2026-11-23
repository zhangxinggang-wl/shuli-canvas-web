/* 纸张库 · C 计划清单（7）+ D 音乐（3）+ E 学科实验（5）—— 2.0.7
 * 契约见 papers.js 顶部。表格一律用 K.table()，谱表用等距线，全部相对坐标。
 */
(function () {
  const GW = (window.GW = window.GW || {});
  const K = GW.paperKit;
  const { begin, seg, rect, txt, pal, lw, table } = K;

  const PAD = 0.055;

  const LIST = [
    // ================= C 计划与清单 =================
    {
      id: 'weekly', name: '周计划', category: '计划清单',
      cfg: { lineHeight: 28, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        const x0 = b.l + b.w * PAD, x1 = b.l + b.w * (1 - PAD);
        const y0 = b.t + b.h * 0.1, y1 = b.t + b.h * (1 - PAD);
        const g = table(ctx, x0, y0, x1, y1, 7, 1, C, k, (y1 - y0) * 0.09);
        const WD = ['一', '二', '三', '四', '五', '六', '日'];
        for (let i = 0; i < 7; i++) {
          txt(ctx, WD[i], x0 + g.cw * (i + 0.5), y0 + (y1 - y0) * 0.045, Math.max(8, g.cw * 0.22), C.text, 'center', 'middle');
        }
        ctx.restore();
      },
    },
    {
      id: 'weekly-timeline', name: '周日程时间轴', category: '计划清单',
      cfg: { lineHeight: 26, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 7 列 × 12 行（每行两小时），左侧时间列
        const x0 = b.l + b.w * 0.08, x1 = b.l + b.w * (1 - PAD);
        const y0 = b.t + b.h * 0.08, y1 = b.t + b.h * (1 - PAD);
        const HOURS = 12;
        const g = table(ctx, x0, y0, x1, y1, 7, HOURS, C, k, (y1 - y0) * 0.07);
        const WD = ['一', '二', '三', '四', '五', '六', '日'];
        for (let i = 0; i < 7; i++) txt(ctx, WD[i], x0 + g.cw * (i + 0.5), y0 + (y1 - y0) * 0.035, Math.max(7, g.cw * 0.2), C.text, 'center', 'middle');
        // 左侧时间列只有 8% 页宽（A4 竖版约 63px，横版约 90px）。原来字号只按行高算，
        // 横版 12 行时 g.rh*0.34 偏大，「08:00」右对齐后左端会越过页框（probe-paper 实测跑出
        // 页面矩形 105,149）—— 打印/导出会被裁掉一截。字号再按剩余宽度夹一次。
        const gutter = Math.max(18, x0 - b.l - 6);
        const lfs = Math.max(6, Math.min(g.rh * 0.34, gutter / 3.0));
        for (let j = 0; j < HOURS; j++) {
          const hh = 8 + j * 2;
          txt(ctx, String(hh).padStart(2, '0') + ':00', x0 - 6, g.top + g.rh * (j + 0.5),
            lfs, C.text, 'right', 'middle');
        }
        ctx.restore();
      },
    },
    {
      id: 'habit', name: '习惯追踪', category: '计划清单',
      cfg: { lineHeight: 24, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 31 列 × 8 行：一列一天，一行一个习惯
        const x0 = b.l + b.w * PAD, x1 = b.l + b.w * (1 - PAD);
        const y0 = b.t + b.h * 0.08, y1 = b.t + b.h * (1 - PAD);
        const g = table(ctx, x0, y0, x1, y1, 31, 8, C, k, (y1 - y0) * 0.06);
        for (let i = 0; i < 31; i++) {
          if ((i + 1) % 5 === 0 || i === 0) txt(ctx, String(i + 1), x0 + g.cw * (i + 0.5), y0 + (y1 - y0) * 0.03, Math.max(5, g.cw * 0.5), C.text, 'center', 'middle');
        }
        ctx.restore();
      },
    },
    {
      id: 'todo', name: '待办清单', category: '计划清单',
      cfg: { lineHeight: 30, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 三段：今天 / 本周 / 以后 —— 每段前面一个方框列
        const x0 = b.l + b.w * PAD, x1 = b.l + b.w * (1 - PAD);
        const boxW = b.w * 0.032;
        const segs = [['今天', 0.1, 0.42], ['本周', 0.46, 0.72], ['以后', 0.76, 0.95]];
        for (const [label, a, c] of segs) {
          const y0 = b.t + b.h * a, y1 = b.t + b.h * c;
          ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.8;
          // 段标题：文字 + 下面一条分段粗线（标题左对齐在页内，不落到世界原点）
          txt(ctx, label, x0, y0 + b.h * 0.02, Math.max(9, b.w * 0.017), C.text, 'left', 'middle');
          seg(ctx, x0, y0 + b.h * 0.035, x1, y0 + b.h * 0.035);
          ctx.strokeStyle = C.ink; ctx.lineWidth = k;
          for (let y = y0 + b.h * 0.06 + K.lhOf(b, cfg); y < y1; y += K.lhOf(b, cfg)) {
            rect(ctx, x0, y - boxW * 0.72, boxW, boxW);
            seg(ctx, x0 + boxW * 1.6, y, x1, y);
          }
        }
        ctx.restore();
      },
    },
    {
      id: 'semester', name: '学期总览', category: '计划清单',
      cfg: { lineHeight: 26, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 20 周 × 6 科：横向一周一格，纵向一科一行
        const x0 = b.l + b.w * 0.1, x1 = b.l + b.w * (1 - PAD);
        const y0 = b.t + b.h * 0.09, y1 = b.t + b.h * (1 - PAD);
        const g = table(ctx, x0, y0, x1, y1, 20, 6, C, k, (y1 - y0) * 0.08);
        for (let i = 0; i < 20; i += 2) txt(ctx, String(i + 1), x0 + g.cw * (i + 0.5), y0 + (y1 - y0) * 0.04, Math.max(6, g.cw * 0.42), C.text, 'center', 'middle');
        ctx.restore();
      },
    },
    {
      id: 'assignment', name: '作业计划', category: '计划清单',
      cfg: { lineHeight: 26, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 科目 × 截止：5 列表头 + 14 行
        const x0 = b.l + b.w * PAD, x1 = b.l + b.w * (1 - PAD);
        const y0 = b.t + b.h * 0.08, y1 = b.t + b.h * (1 - PAD);
        const g = table(ctx, x0, y0, x1, y1, 5, 14, C, k, (y1 - y0) * 0.07);
        const TH = ['科目', '作业', '截止', '完成', '备注'];
        for (let i = 0; i < 5; i++) txt(ctx, TH[i], x0 + g.cw * (i + 0.5), y0 + (y1 - y0) * 0.035, Math.max(7, g.cw * 0.3), C.text, 'center', 'middle');
        ctx.restore();
      },
    },
    {
      id: 'finance', name: '收支记录', category: '计划清单',
      cfg: { lineHeight: 26, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 日期 / 项目 / 收入 / 支出 / 余额 —— 5 列 + 月度合计条
        const x0 = b.l + b.w * PAD, x1 = b.l + b.w * (1 - PAD);
        const y0 = b.t + b.h * 0.08, y1 = b.t + b.h * 0.9;
        const g = table(ctx, x0, y0, x1, y1, 5, 16, C, k, (y1 - y0) * 0.055);
        const TH = ['日期', '项目', '收入', '支出', '余额'];
        for (let i = 0; i < 5; i++) txt(ctx, TH[i], x0 + g.cw * (i + 0.5), y0 + (y1 - y0) * 0.028, Math.max(7, g.cw * 0.3), C.text, 'center', 'middle');
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 2;
        rect(ctx, x0, b.t + b.h * 0.92, x1 - x0, b.h * 0.05);
        txt(ctx, '合计', x0 + g.cw * 0.5, b.t + b.h * 0.945, Math.max(8, b.w * 0.016), C.text, 'center', 'middle');
        ctx.restore();
      },
    },

    // ================= D 音乐 =================
    {
      id: 'music-paper', name: '五线谱', category: '音乐',
      cfg: { lineHeight: 30, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 12 行五线谱：每组 5 线，组内线距 = 行距参数的 1/4
        const groups = 12, padX = b.w * 0.06;
        const x0 = b.l + padX, x1 = b.l + b.w - padX;
        const top = b.t + b.h * 0.05, bot = b.t + b.h * 0.95;
        const groupH = Math.min(K.lhOf(b, cfg), (bot - top) / groups * 0.62);
        const step = groupH / 4, gap = (bot - top) / groups;
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        for (let g = 0; g < groups; g++) {
          const y0 = top + gap * g;
          for (let i = 0; i < 5; i++) seg(ctx, x0, y0 + step * i, x1, y0 + step * i);
          // 行首竖线（谱表括号）
          ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
          seg(ctx, x0, y0, x0, y0 + step * 4);
          ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        }
        ctx.restore();
      },
    },
    {
      id: 'guitar-score', name: '六线谱+和弦图', category: '音乐',
      cfg: { lineHeight: 30, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 顶部一排和弦图位（6 个）+ 下方 8 组六线谱
        const padX = b.w * 0.06, x0 = b.l + padX, x1 = b.l + b.w - padX;
        const chH = b.h * 0.12, chW = chH * 0.86;
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        for (let i = 0; i < 6; i++) {
          const cx = x0 + (x1 - x0) * (i + 0.5) / 6 - chW / 2;
          rect(ctx, cx, b.t + b.h * 0.05, chW, chH);
          for (let s = 1; s < 6; s++) seg(ctx, cx + chW * s / 6, b.t + b.h * 0.05, cx + chW * s / 6, b.t + b.h * 0.05 + chH);
          for (let f = 1; f < 4; f++) seg(ctx, cx, b.t + b.h * 0.05 + chH * f / 4, cx + chW, b.t + b.h * 0.05 + chH * f / 4);
        }
        const top = b.t + b.h * 0.22, bot = b.t + b.h * 0.95;
        const groups = 8, gap = (bot - top) / groups;
        const step = Math.min(K.lhOf(b, cfg), gap * 0.5) / 4;
        for (let g = 0; g < groups; g++) {
          const y0 = top + gap * g;
          ctx.strokeStyle = C.ink; ctx.lineWidth = k;
          for (let i = 0; i < 6; i++) seg(ctx, x0, y0 + step * i, x1, y0 + step * i);
          ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
          seg(ctx, x0, y0, x0, y0 + step * 5);
          seg(ctx, x1, y0, x1, y0 + step * 5);
        }
        ctx.restore();
      },
    },
    {
      id: 'piano', name: '钢琴大谱表', category: '音乐',
      cfg: { lineHeight: 30, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 大谱表 = 高音 5 线 + 低音 5 线成对，中间留钢琴谱的大间距；8 组
        const padX = b.w * 0.06, x0 = b.l + padX, x1 = b.l + b.w - padX;
        const top = b.t + b.h * 0.05, bot = b.t + b.h * 0.95;
        const groups = 8, gap = (bot - top) / groups;
        const step = Math.min(K.lhOf(b, cfg) * 0.55, gap * 0.42) / 4;
        for (let g = 0; g < groups; g++) {
          const y0 = top + gap * g;
          ctx.strokeStyle = C.ink; ctx.lineWidth = k;
          for (let i = 0; i < 5; i++) seg(ctx, x0, y0 + step * i, x1, y0 + step * i);
          const y1 = y0 + step * 4 + step * 3;      // 中间空三线高
          for (let i = 0; i < 5; i++) seg(ctx, x0, y1 + step * i, x1, y1 + step * i);
          ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.8;
          seg(ctx, x0, y0, x0, y1 + step * 4);
          seg(ctx, x1, y0, x1, y1 + step * 4);
        }
        ctx.restore();
      },
    },

    // ================= E 学科与实验 =================
    {
      id: 'lab-record', name: '实验记录纸', category: '学科实验',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 表头三格（实验名/日期/组别）+ 坐标区（方格）+ 底部数据表
        const x0 = b.l + b.w * PAD, x1 = b.l + b.w * (1 - PAD);
        const headY = b.t + b.h * 0.06, headH = b.h * 0.05;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.5;
        rect(ctx, x0, headY, x1 - x0, headH);
        seg(ctx, x0 + (x1 - x0) * 0.55, headY, x0 + (x1 - x0) * 0.55, headY + headH);
        seg(ctx, x0 + (x1 - x0) * 0.8, headY, x0 + (x1 - x0) * 0.8, headY + headH);
        // 坐标区：细方格
        const gy0 = headY + headH + b.h * 0.03, gy1 = b.t + b.h * 0.62;
        const step = Math.max(10, K.lhOf(b, cfg) * 0.5);
        ctx.strokeStyle = C.ink; ctx.lineWidth = k * 0.8;
        for (let x = x0; x <= x1; x += step) seg(ctx, x, gy0, x, gy1);
        for (let y = gy0; y <= gy1; y += step) seg(ctx, x0, y, x1, y);
        // 数据表
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.4;
        rect(ctx, x0, gy0, x1 - x0, gy1 - gy0);
        table(ctx, x0, b.t + b.h * 0.66, x1, b.t + b.h * 0.95, 5, 6, C, k, b.h * 0.03);
        ctx.restore();
      },
    },
    {
      id: 'coord-sheet', name: '整页坐标纸', category: '学科实验',
      cfg: { lineHeight: 24, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 5mm 方格 + 每 5 格粗线 + 轴标签（不在正中，避免和手绘坐标打架）
        const step = Math.max(8, K.lhOf(b, cfg) * 0.5);
        const x0 = b.l + b.w * 0.04, x1 = b.l + b.w * 0.96;
        const y0 = b.t + b.h * 0.04, y1 = b.t + b.h * 0.96;
        ctx.strokeStyle = C.ink; ctx.lineWidth = k * 0.7;
        for (let x = x0; x <= x1; x += step) seg(ctx, x, y0, x, y1);
        for (let y = y0; y <= y1; y += step) seg(ctx, x0, y, x1, y);
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.5;
        for (let i = 1, x = x0; x <= x1; x += step, i++) if (i % 5 === 0) seg(ctx, x, y0, x, y1);
        for (let i = 1, y = y0; y <= y1; y += step, i++) if (i % 5 === 0) seg(ctx, x0, y, x1, y);
        // 轴标签：原点在左下角
        txt(ctx, 'O', x0 - step * 0.6, y1 + step * 0.9, Math.max(7, step * 0.7), C.text, 'center', 'middle');
        txt(ctx, 'x', x1, y1 + step * 0.9, Math.max(7, step * 0.8), C.text, 'center', 'middle');
        txt(ctx, 'y', x0 - step * 0.9, y0, Math.max(7, step * 0.8), C.text, 'center', 'middle');
        ctx.restore();
      },
    },
    {
      id: 'log-sheet', name: '半对数纸', category: '学科实验',
      cfg: { lineHeight: 24, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 半对数：y 按十倍程分 10 段，每段内 8 条递减间距的线（1,2,3…9 的对数位置）
        const x0 = b.l + b.w * 0.12, x1 = b.l + b.w * 0.95;
        const y0 = b.t + b.h * 0.06, y1 = b.t + b.h * 0.94;
        const DEC = Math.max(2, Math.floor((y1 - y0) / (b.h * 0.22)));
        const dh = (y1 - y0) / DEC;
        const lg = [0, 0.301, 0.477, 0.602, 0.699, 0.778, 0.845, 0.903, 0.954, 1];
        ctx.strokeStyle = C.ink; ctx.lineWidth = k * 0.8;
        for (let d = 0; d < DEC; d++) {
          for (let i = 1; i < 9; i++) {
            const y = y0 + d * dh + dh * (1 - lg[i]);
            seg(ctx, x0, y, x1, y);
          }
        }
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
        for (let d = 0; d <= DEC; d++) seg(ctx, x0, y0 + d * dh, x1, y0 + d * dh);
        // 横向等距 10 格
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        for (let i = 1; i < 10; i++) seg(ctx, x0 + (x1 - x0) * i / 10, y0, x0 + (x1 - x0) * i / 10, y1);
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.4;
        seg(ctx, x0, y0, x0, y1); seg(ctx, x0, y1, x1, y1);
        ctx.restore();
      },
    },
    {
      id: 'chem', name: '化学方程式纸', category: '学科实验',
      cfg: { lineHeight: 34, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 三栏（反应物 | 条件/箭头 | 生成物）+ 每行的箭头位
        const x0 = b.l + b.w * 0.06, x1 = b.l + b.w * 0.94;
        const step = K.lhOf(b, cfg) * 1.6;
        const arrowX = (x0 + x1) / 2;
        for (let y = b.t + b.h * 0.08; y < b.t + b.h * 0.95; y += step) {
          ctx.strokeStyle = C.ink; ctx.lineWidth = k;
          seg(ctx, x0, y + step * 0.35, arrowX - b.w * 0.07, y + step * 0.35);
          // 箭头：短线 + 两个箭头尖
          ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
          seg(ctx, arrowX - b.w * 0.05, y + step * 0.35, arrowX + b.w * 0.05, y + step * 0.35);
          seg(ctx, arrowX + b.w * 0.05, y + step * 0.35, arrowX + b.w * 0.035, y + step * 0.28);
          seg(ctx, arrowX + b.w * 0.05, y + step * 0.35, arrowX + b.w * 0.035, y + step * 0.42);
          ctx.strokeStyle = C.ink; ctx.lineWidth = k;
          seg(ctx, arrowX + b.w * 0.07, y + step * 0.35, x1, y + step * 0.35);
        }
        ctx.restore();
      },
    },
    {
      id: 'mm-grid', name: '毫米方格', category: '学科实验',
      cfg: { lineHeight: 20, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 工程制图：1mm 细格（按页宽折算）+ 每 10mm 一条中粗线
        const step = Math.max(3.2, b.w / 190);
        const x0 = b.l, x1 = b.l + b.w, y0 = b.t, y1 = b.t + b.h;
        ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(0.35, k * 0.45);
        ctx.globalAlpha = 0.75;
        for (let x = x0; x <= x1; x += step) seg(ctx, x, y0, x, y1);
        for (let y = y0; y <= y1; y += step) seg(ctx, x0, y, x1, y);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.2;
        for (let i = 1, x = x0; x <= x1; x += step, i++) if (i % 10 === 0) seg(ctx, x, y0, x, y1);
        for (let i = 1, y = y0; y <= y1; y += step, i++) if (i % 10 === 0) seg(ctx, x0, y, x1, y);
        // 图框
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 2;
        rect(ctx, x0 + step * 4, y0 + step * 4, (x1 - x0) - step * 8, (y1 - y0) - step * 8);
        ctx.restore();
      },
    },
  ];

  GW.addPapers(LIST);
})();
