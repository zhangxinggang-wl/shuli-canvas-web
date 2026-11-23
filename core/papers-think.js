/* 纸张库 · F 几何思维（10）+ G 课堂会议（7）—— 2.0.7
 * 契约见 papers.js 顶部。几何图形（六边形/同心圆/象限）全部用 ctx 现算，
 * 不引用任何第三方图标或素材。
 */
(function () {
  const GW = (window.GW = window.GW || {});
  const K = GW.paperKit;
  const { begin, seg, rect, txt, pal, lw, cell } = K;

  const PAD = 0.06;

  const LIST = [
    // ================= F 几何与思维 =================
    {
      id: 'iso-grid', name: '等轴测格', category: '几何思维',
      cfg: { lineHeight: 32, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 等轴测：两组 30° 斜线 + 一组竖线，构成菱形网格（画立体图/物理受力用）
        const s = Math.max(12, K.lhOf(b, cfg));
        const dx = s * Math.cos(Math.PI / 6), dy = s * Math.sin(Math.PI / 6);
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        ctx.save();
        ctx.beginPath(); ctx.rect(b.l, b.t, b.w, b.h); ctx.clip();
        for (let x = b.l - b.h; x < b.l + b.w + b.h; x += dx * 2) {
          seg(ctx, x, b.t, x + b.h / Math.tan(Math.PI / 3), b.t + b.h);
          seg(ctx, x, b.t, x - b.h / Math.tan(Math.PI / 3), b.t + b.h);
        }
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.2;
        for (let y = b.t; y <= b.t + b.h; y += dy * 2) seg(ctx, b.l, y, b.l + b.w, y);
        ctx.restore();
        ctx.restore();
      },
    },
    {
      id: 'hex-grid', name: '六边格', category: '几何思维',
      cfg: { lineHeight: 30, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 正六边形蜂窝：横向间距 1.5R，纵向 √3R，奇偶行错半格
        const R = Math.max(10, K.lhOf(b, cfg));
        const hx = R * 1.5, hy = R * Math.sqrt(3);
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        ctx.save();
        ctx.beginPath(); ctx.rect(b.l, b.t, b.w, b.h); ctx.clip();
        let row = 0;
        for (let y = b.t; y < b.t + b.h + hy; y += hy / 2, row++) {
          const off = row % 2 ? hx / 2 : 0;
          for (let x = b.l + off; x < b.l + b.w + hx; x += hx) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const a = Math.PI / 180 * (60 * i - 30);
              const px = x + R * Math.cos(a), py = y + R * Math.sin(a);
              if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
            }
            ctx.closePath(); ctx.stroke();
          }
        }
        ctx.restore();
        ctx.restore();
      },
    },
    {
      id: 'venn2', name: '韦恩二圈', category: '几何思维',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 两个相交圆：半径取页宽的 0.2，圆心左右各偏 0.11
        const cx = b.l + b.w / 2, cy = b.t + b.h * 0.3, r = b.w * 0.2;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.arc(cx + s * b.w * 0.11, cy, r, 0, Math.PI * 2); ctx.stroke();
        }
        // 下半个页面留横线写字（比较/结论）
        const step = K.lhOf(b, cfg);
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        for (let y = b.t + b.h * 0.62; y < b.t + b.h * 0.95; y += step) seg(ctx, b.l + b.w * PAD, y, b.l + b.w * (1 - PAD), y);
        ctx.restore();
      },
    },
    {
      id: 'venn3', name: '韦恩三圈', category: '几何思维',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        const cx = b.l + b.w / 2, cy = b.t + b.h * 0.3, r = b.w * 0.19;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r, 0, Math.PI * 2); ctx.stroke();
        }
        const step = K.lhOf(b, cfg);
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        for (let y = b.t + b.h * 0.64; y < b.t + b.h * 0.95; y += step) seg(ctx, b.l + b.w * PAD, y, b.l + b.w * (1 - PAD), y);
        ctx.restore();
      },
    },
    {
      id: 'concept-map', name: '概念图', category: '几何思维',
      cfg: { lineHeight: 26, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 中心椭圆 + 6 个分支椭圆 + 连线（角度均匀分布）
        const cx = b.l + b.w / 2, cy = b.t + b.h / 2;
        const rx = b.w * 0.13, ry = b.h * 0.1, brx = b.w * 0.09, bry = b.h * 0.07;
        const R = Math.min(b.w, b.h) * 0.36;
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 3;
          const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
          seg(ctx, cx + Math.cos(a) * rx * 0.9, cy + Math.sin(a) * ry * 0.9, x - Math.cos(a) * brx * 0.9, y - Math.sin(a) * bry * 0.9);
          ctx.beginPath(); ctx.ellipse(x, y, brx, bry, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.7;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      },
    },
    {
      id: 'flowchart', name: '流程图框位', category: '几何思维',
      cfg: { lineHeight: 26, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 竖排 5 个框位：起止圆角、中间矩形，箭头连起来（流程图画布骨架）
        const x0 = b.l + b.w * 0.28, w = b.w * 0.44, h = b.h * 0.11;
        let y = b.t + b.h * 0.06;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.5;
        for (let i = 0; i < 5; i++) {
          const round = i === 0 || i === 4;
          if (round) cell(ctx, x0, y, w, h, C, k * 1.5, h / 2);
          else { ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.5; rect(ctx, x0, y, w, h); }
          if (i < 4) {
            const ax = b.l + b.w / 2, ay0 = y + h, ay1 = y + h + b.h * 0.035;
            ctx.strokeStyle = C.ink; ctx.lineWidth = k;
            seg(ctx, ax, ay0, ax, ay1);
            seg(ctx, ax, ay1, ax - b.w * 0.012, ay1 - b.h * 0.012);
            seg(ctx, ax, ay1, ax + b.w * 0.012, ay1 - b.h * 0.012);
          }
          y += h + b.h * 0.035;
        }
        ctx.restore();
      },
    },
    {
      id: 'kwl', name: 'KWL 三列', category: '几何思维',
      cfg: { lineHeight: 26, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // K / W / L 三列：列头带字母，下面横线
        const x0 = b.l + b.w * PAD, x1 = b.l + b.w * (1 - PAD);
        const y0 = b.t + b.h * 0.08, y1 = b.t + b.h * (1 - PAD);
        const w = (x1 - x0) / 3;
        const step = K.lhOf(b, cfg);
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
        rect(ctx, x0, y0, x1 - x0, y1 - y0);
        seg(ctx, x0, y0 + b.h * 0.09, x1, y0 + b.h * 0.09);
        for (let i = 1; i < 3; i++) seg(ctx, x0 + w * i, y0, x0 + w * i, y1);
        const HD = ['K  已知', 'W  想知', 'L  学到'];
        for (let i = 0; i < 3; i++) txt(ctx, HD[i], x0 + w * (i + 0.5), y0 + b.h * 0.045, Math.max(9, w * 0.08), C.text, 'center', 'middle');
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        for (let i = 0; i < 3; i++) {
          for (let y = y0 + b.h * 0.09 + step; y < y1; y += step) {
            seg(ctx, x0 + w * i + w * 0.04, y, x0 + w * (i + 1) - w * 0.04, y);
          }
        }
        ctx.restore();
      },
    },
    {
      id: 'swot', name: 'SWOT 四象限', category: '几何思维',
      cfg: { lineHeight: 26, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        const x0 = b.l + b.w * PAD, x1 = b.l + b.w * (1 - PAD);
        const y0 = b.t + b.h * 0.08, y1 = b.t + b.h * (1 - PAD);
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
        rect(ctx, x0, y0, x1 - x0, y1 - y0);
        seg(ctx, (x0 + x1) / 2, y0, (x0 + x1) / 2, y1);
        seg(ctx, x0, (y0 + y1) / 2, x1, (y0 + y1) / 2);
        const LAB = [['S 优势', x0, y0], ['W 劣势', (x0 + x1) / 2, y0], ['O 机会', x0, (y0 + y1) / 2], ['T 威胁', (x0 + x1) / 2, (y0 + y1) / 2]];
        for (const [t, x, y] of LAB) txt(ctx, t, x + b.w * 0.02, y + b.h * 0.045, Math.max(9, b.w * 0.016), C.text, 'left', 'middle');
        ctx.restore();
      },
    },
    {
      id: 'mindmap', name: '思维导图', category: '几何思维',
      cfg: { lineHeight: 26, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 中心圆 + 8 条曲线分支（二次贝塞尔，比直线更像导图）
        const cx = b.l + b.w / 2, cy = b.t + b.h / 2;
        const R = Math.min(b.w, b.h) * 0.16, L = Math.min(b.w, b.h) * 0.42;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.7;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = C.ink; ctx.lineWidth = k * 1.2;
        for (let i = 0; i < 8; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 4;
          const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L;
          const mx = cx + Math.cos(a + 0.35) * L * 0.55, my = cy + Math.sin(a + 0.35) * L * 0.55;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
          ctx.quadraticCurveTo(mx, my, ex, ey);
          ctx.stroke();
          ctx.beginPath(); ctx.arc(ex, ey, R * 0.14, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      },
    },
    {
      id: 'matrix', name: '四象限矩阵', category: '几何思维',
      cfg: { lineHeight: 26, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 二维矩阵：带轴标签（重要度/紧急度这类二维分类）
        const x0 = b.l + b.w * 0.12, x1 = b.l + b.w * 0.95;
        const y0 = b.t + b.h * 0.08, y1 = b.t + b.h * 0.9;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.7;
        rect(ctx, x0, y0, x1 - x0, y1 - y0);
        seg(ctx, (x0 + x1) / 2, y0, (x0 + x1) / 2, y1);
        seg(ctx, x0, (y0 + y1) / 2, x1, (y0 + y1) / 2);
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        seg(ctx, x0, y1, x0 - b.w * 0.03, y1);                    // 轴
        seg(ctx, x0, y1, x0, y1 + b.h * 0.04);
        txt(ctx, '→', x1 + b.w * 0.01, y1, Math.max(10, b.w * 0.018), C.text, 'left', 'middle');
        txt(ctx, '↑', x0, y0 - b.h * 0.03, Math.max(10, b.w * 0.018), C.text, 'center', 'middle');
        ctx.restore();
      },
    },

    // ================= G 课堂与会议 =================
    {
      id: 'retro', name: '复盘四象限', category: '课堂会议',
      cfg: { lineHeight: 26, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 四格：做得好 / 待改进 / 新想法 / 下一步；每格左上角一个小标题位
        const x0 = b.l + b.w * PAD, x1 = b.l + b.w * (1 - PAD);
        const y0 = b.t + b.h * 0.08, y1 = b.t + b.h * (1 - PAD);
        const w = (x1 - x0) / 2, h = (y1 - y0) / 2;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) rect(ctx, x0 + w * i, y0 + h * j, w, h);
        const LAB = ['做得好', '待改进', '新想法', '下一步'];
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        for (let i = 0; i < 4; i++) {
          const x = x0 + w * (i % 2), y = y0 + h * Math.floor(i / 2);
          txt(ctx, LAB[i], x + w * 0.05, y + h * 0.1, Math.max(9, w * 0.07), C.text, 'left', 'middle');
          seg(ctx, x + w * 0.05, y + h * 0.16, x + w * 0.95, y + h * 0.16);
        }
        ctx.restore();
      },
    },
    {
      id: 'standup', name: '站会三问', category: '课堂会议',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 三段，每段一个问题标题 + 横线
        const x0 = b.l + b.w * PAD, x1 = b.l + b.w * (1 - PAD);
        const Q = ['昨天做了什么', '今天准备做什么', '有什么阻碍'];
        const step = K.lhOf(b, cfg);
        for (let i = 0; i < 3; i++) {
          const y = b.t + b.h * (0.08 + i * 0.3);
          ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.7;
          seg(ctx, x0, y, x1, y);
          txt(ctx, Q[i], x0, y - b.h * 0.024, Math.max(10, b.w * 0.019), C.text, 'left', 'middle');
          ctx.strokeStyle = C.ink; ctx.lineWidth = k;
          for (let yy = y + step; yy < y + b.h * 0.26; yy += step) seg(ctx, x0, yy, x1, yy);
        }
        ctx.restore();
      },
    },
    {
      id: 'crazy8s', name: '八格速写', category: '课堂会议',
      cfg: { lineHeight: 28, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 4×2 八个格子，格内一个序号角标
        const x0 = b.l + b.w * 0.04, x1 = b.l + b.w * 0.96;
        const y0 = b.t + b.h * 0.1, y1 = b.t + b.h * 0.95;
        const cw = (x1 - x0) / 4, ch = (y1 - y0) / 2;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.5;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
          rect(ctx, x0 + cw * i, y0 + ch * j, cw, ch);
          txt(ctx, String(j * 4 + i + 1), x0 + cw * i + cw * 0.08, y0 + ch * j + ch * 0.12, Math.max(8, cw * 0.08), C.text, 'left', 'middle');
        }
        ctx.restore();
      },
    },
    {
      id: 'idea-poster', name: '点子海报', category: '课堂会议',
      cfg: { lineHeight: 28, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 中央大标题位 + 四周 6 个便签位（圆角框）
        const x0 = b.l + b.w * 0.06, x1 = b.l + b.w * 0.94;
        const y0 = b.t + b.h * 0.06, y1 = b.t + b.h * 0.94;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.7;
        cell(ctx, x0 + (x1 - x0) * 0.18, y0, (x1 - x0) * 0.64, b.h * 0.14, C, k * 1.7, b.w * 0.012);
        const bw = (x1 - x0) / 3, bh = b.h * 0.16;
        for (let i = 0; i < 6; i++) {
          const cx = x0 + bw * (i % 3), cy = b.t + b.h * (0.26 + 0.3 * Math.floor(i / 3));
          cell(ctx, cx + bw * 0.05, cy, bw * 0.9, bh, C, k, b.w * 0.01);
        }
        ctx.restore();
      },
    },
    {
      id: 'study-board', name: '学习看板', category: '课堂会议',
      cfg: { lineHeight: 26, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 三列看板：待学 / 在学 / 已掌握，列为圆角大卡
        const x0 = b.l + b.w * 0.04, x1 = b.l + b.w * 0.96;
        const y0 = b.t + b.h * 0.08, y1 = b.t + b.h * 0.95;
        const w = (x1 - x0) / 3;
        const LAB = ['待学', '在学', '已掌握'];
        for (let i = 0; i < 3; i++) {
          cell(ctx, x0 + w * i + w * 0.03, y0, w * 0.94, y1 - y0, C, k * 1.4, b.w * 0.008);
          txt(ctx, LAB[i], x0 + w * (i + 0.5), y0 + (y1 - y0) * 0.05, Math.max(9, w * 0.07), C.text, 'center', 'middle');
          ctx.strokeStyle = C.ink; ctx.lineWidth = k;
          seg(ctx, x0 + w * i + w * 0.07, y0 + (y1 - y0) * 0.09, x0 + w * (i + 1) - w * 0.07, y0 + (y1 - y0) * 0.09);
        }
        ctx.restore();
      },
    },
    {
      id: 'project-planning', name: '项目规划', category: '课堂会议',
      cfg: { lineHeight: 26, orientation: 'landscape' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 甘特骨架：左列任务名 + 右侧 8 个时间格
        const x0 = b.l + b.w * 0.05, x1 = b.l + b.w * 0.95;
        const y0 = b.t + b.h * 0.1, y1 = b.t + b.h * 0.92;
        const nameW = (x1 - x0) * 0.3;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
        rect(ctx, x0, y0, x1 - x0, y1 - y0);
        seg(ctx, x0 + nameW, y0, x0 + nameW, y1);
        const cols = 8, cw = (x1 - x0 - nameW) / cols;
        ctx.strokeStyle = C.ink; ctx.lineWidth = k;
        for (let i = 1; i < cols; i++) seg(ctx, x0 + nameW + cw * i, y0, x0 + nameW + cw * i, y1);
        const rows = 8, rh = (y1 - y0) / rows;
        for (let j = 1; j < rows; j++) seg(ctx, x0, y0 + rh * j, x1, y0 + rh * j);
        for (let j = 0; j < rows; j++) txt(ctx, String(j + 1), x0 + nameW * 0.5, y0 + rh * (j + 0.5), Math.max(7, rh * 0.4), C.text, 'center', 'middle');
        ctx.restore();
      },
    },
    {
      id: 'icebreaker', name: '破冰九宫格', category: '课堂会议',
      cfg: { lineHeight: 26, orientation: 'portrait' },
      draw(ctx, b, cfg) {
        const C = pal(cfg), k = lw(b);
        begin(ctx, b);
        // 3×3 九宫格：每格居中一个淡淡的问号（找人签名/找相同点的活动纸）
        const x0 = b.l + b.w * 0.08, x1 = b.l + b.w * 0.92;
        const y0 = b.t + b.h * 0.12, y1 = b.t + b.h * 0.88;
        const cw = (x1 - x0) / 3, ch = (y1 - y0) / 3;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = k * 1.6;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          rect(ctx, x0 + cw * i, y0 + ch * j, cw, ch);
          txt(ctx, '?', x0 + cw * (i + 0.5), y0 + ch * (j + 0.5), Math.min(cw, ch) * 0.4, C.ink, 'center', 'middle');
        }
        ctx.restore();
      },
    },
  ];

  GW.addPapers(LIST);
})();
