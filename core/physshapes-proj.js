/* 物形 · 项目自加图形（逐图形迭代）
   加载顺序：core/physshapes.js 之后、core/app.js 之前（见 src/index.html）。
   每个图形一段 reg({...})；参数用 param(key, {...}) 声明。
   命名：图形 key = b_<分类>_<名字>；参数 key = <图形 key>_<参数名>（避免和内置 129 个撞名）。
   draw 的第三个参数是上游的 GH（box / alpha / head / tint / deg），不是自定义图形那套 U 助手：
   线宽 / 颜色 / 半透明 / 虚线 / 旋转 / 动画裁剪都由 P.draw 统一处理，这里只画几何。
   新增一个图形后跑：
     node scripts/check-shape-one.js
    GW_URL="file:///<项目绝对路径>/src/index.html#shape=<key>" bash scripts/run-page.sh scripts/probe-one-shape.js 9931 1400,900
   1.3.14：按用户要求恢复这三个图形（1.3.12 误删）——它们是内置图形，不是示例。
*/
(function () {
  if (!window.GW || !GW.physShapes) return;
  const P = GW.physShapes;
  P.projErrors = P.projErrors || [];
  // 1.7.12：三处 RK4 数值磁感线已撤；电磁振荡改用 ggb 原生的离散矢量箭头，不再缓存流线路径。

  // 注册：字段不合法只记错不抛出（抛出去会让后面的图形全部注册不上）
  function reg(d) {
    const bad = [];
    if (!d || typeof d !== 'object') bad.push('定义不是对象');
    else {
      if (!/^b_[a-z]+_[A-Za-z0-9]+$/.test(d.key || '')) bad.push('key 必须是 b_<分类>_<名字>');
      if (P.shapes[d.key]) bad.push('key 重复: ' + d.key);
      if (!d.label) bad.push('缺少 label');
      if (typeof d.draw !== 'function') bad.push('缺 draw');
      (d.params || []).forEach((k) => { if (!P.paramDefs[k]) bad.push('参数未定义: ' + k); });
      if (d.cat && P.catOrder.indexOf(d.cat) < 0) bad.push('分类不在 catOrder: ' + d.cat);
    }
    if (bad.length) { P.projErrors.push({ key: (d && d.key) || '?', errors: bad }); return null; }
    d.geom = d.geom || 'box';
    P.shapes[d.key] = d;
    return d;
  }

  function param(key, d) {
    P.paramDefs[key] = Object.assign({ step: 1, unit: '°' }, d);
    return key;
  }

  // 画图小助手：线宽/颜色由外面定，这里只描路径
  function ln(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  function arw(c, gh, x1, y1, x2, y2) { ln(c, x1, y1, x2, y2); gh.head(c, x1, y1, x2, y2, 3); }
  function circ(c, cx, cy, r) { c.beginPath(); c.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2); c.stroke(); }
  function dot(c, cx, cy, r) { c.beginPath(); c.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2); c.fill(); }
  function arc(c, cx, cy, r, a0, a1) { c.beginPath(); c.arc(cx, cy, Math.max(0.5, r), a0, a1); c.stroke(); }
  function poly(c, pts, close) {
    if (!pts || !pts.length) return;
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    if (close) c.closePath();
    c.stroke();
  }

  // 12~16px 的标注；不设 strokeStyle 的线一律跟随 o.color（老师改色时会被统一换掉）。
  const FONT = '600 13px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  // 物理量沿用教材字形（原稿就是 Cambria Math / Times 斜体），不换成别的字体。
  const MATH_FONT = '"Cambria Math","Times New Roman",serif';
  // 文字颜色跟着底色走：深底（黑板/科技深空/护眼暗色）上黑字换成反相墨色。
  // 换算直接复用全局「自动反差墨色」GW.inkFix，跟笔迹用的是同一套判据。
  function inkOf(col) {
    const base = col || '#1b2433';
    if (GW.inkFix) { try { return GW.inkFix(base); } catch (e) { /* 退回下面 */ } }
    return (GW.isDarkBg && GW.isDarkBg()) ? '#ffffff' : base;
  }
  // 纸色：仪表圆盘、电阻体这类「实心块」要盖住底下的线，填的是当前画布底色
  function paperOf() {
    // 纸色取「当前真正的纸」：放映 PPT 时会跟着幻灯片背景走（app.js/pptx.js 的 inkPaper 覆盖），
    // 平时就是板书页的背景色。否则深色幻灯片上仪表盘/电阻体会贴一块白底。
    const c = (GW.inkPaper && GW.inkPaper()) || ((GW.page && GW.page() && GW.page().bg && GW.page().bg.color) || '#ffffff');
    if (GW.bgTheme) { try { return GW.bgTheme(c).fill; } catch (e) { /* 退回下面 */ } }
    return c;
  }
  // 与 draw 时同一套字体量宽（手摆下标要用，typo.width 量的是另一套字体）
  function mw(c, s, size, italic) {
    c.save();
    c.font = (italic ? 'italic ' : '') + (size || 13) + 'px ' + MATH_FONT;
    const w = c.measureText(String(s)).width;
    c.restore();
    return w;
  }
  function txt(c, s, x, y, align) {
    c.save();
    const col = inkOf(null);
    c.fillStyle = col;
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    // 1.6.0 排版：变量斜体（F、v、N），单位与数字正体（3 N、m/s）
    if (GW.typo) GW.typo.draw(c, String(s), x, y, FONT_SIZE(), { align: align || 'left', color: col });
    else { c.font = FONT; c.fillText(s, x, y); }
    c.restore();
  }
  function FONT_SIZE() { return 13; }

  /* ---------- 力学 · 斜面受力分解 ---------- */
  const INCLINE_DEG = param('b_mech_inclineForces_deg', { label: '倾角', min: 10, max: 60, step: 1, def: 30 });
  const INCLINE_FRIC = param('b_mech_inclineForces_fric', { label: '摩擦力', min: 0, max: 1, step: 1, def: 1, unit: '0无1有' });

  reg({
    key: 'b_mech_inclineForces', cat: 'mech', label: '斜面受力分解',
    icon: '<path d="M3 20h17"/><path d="M3 20l14-14v14"/>',
    params: [INCLINE_DEG, INCLINE_FRIC],
    draw(c, o, GH) {
      const b = GH.box(o);
      const w = b.w, h = b.h;
      const deg = o.b_mech_inclineForces_deg, rad = deg * Math.PI / 180;
      const on = o.b_mech_inclineForces_fric >= 0.5;

      const x0 = b.x1 + w * 0.10, y0 = b.y1 + h * 0.84;      // 左下角
      const x1 = b.x1 + w * 0.90;                            // 右上角 x
      const hh = (x1 - x0) * Math.tan(rad);
      const yTop = y0 - hh;

      // 斜面 + 竖直边 + 底边
      ln(c, x0, y0, x1, y0);
      ln(c, x1, y0, x1, yTop);
      ln(c, x1, yTop, x0, y0);
      // 直角标记
      const t = Math.max(6, Math.min(w, h) * 0.03);
      ln(c, x1 - t, y0, x1 - t, y0 - t);
      ln(c, x1 - t, y0 - t, x1, y0 - t);

      // 物块：贴斜面（沿坡方向 u、法向 n），方块随斜面一起倾斜，底面压在坡面上
      const ux = Math.cos(rad), uy = -Math.sin(rad);
      const nx = -Math.sin(rad), ny = -Math.cos(rad);
      const sb = Math.min(w, h) * 0.17;
      const s = 0.46;
      const cxp = x0 + (x1 - x0) * s, cyp = y0 - hh * s;      // 接触点（物块底面中点）
      const h2 = sb / 2;
      const bcx = cxp + nx * h2, bcy = cyp + ny * h2;          // 物块中心
      poly(c, [
        [bcx - ux * h2 - nx * h2, bcy - uy * h2 - ny * h2],
        [bcx + ux * h2 - nx * h2, bcy + uy * h2 - ny * h2],
        [bcx + ux * h2 + nx * h2, bcy + uy * h2 + ny * h2],
        [bcx - ux * h2 + nx * h2, bcy - uy * h2 + ny * h2],
      ], true);

      // 三个力都从物块中心出发
      const len = Math.min(w, h) * 0.30;
      arw(c, GH, bcx, bcy, bcx, bcy + len);                            // 重力
      arw(c, GH, bcx, bcy, bcx + nx * len, bcy + ny * len);            // 支持力
      // 本图表达的是「物块沿斜面下滑」，所以摩擦力沿坡向上 = +u。1.6.0 G6。
      // 旧代码写成 -u，30° 时箭头位置 [-62.35, 36] 指向坡下，与图上标注的 f 正好相反。
      if (on) arw(c, GH, bcx, bcy, bcx + ux * len * 0.8, bcy + uy * len * 0.8); // 摩擦力（沿坡向上）

      txt(c, 'mg', bcx + 6, bcy + len - 2, 'left');
      txt(c, 'N', bcx + nx * len - 16, bcy + ny * len - 2, 'left');
      if (on) txt(c, 'f', bcx + ux * len * 0.8 + 6, bcy + uy * len * 0.8 - 4, 'left');

      // 倾角弧与读数
      const r = Math.min(w, h) * 0.12;
      const ap = [];
      for (let i = 0; i <= 16; i++) {
        const a2 = -rad * i / 16;
        ap.push([x0 + r * Math.cos(a2), y0 + r * Math.sin(a2)]);
      }
      poly(c, ap, false);
      txt(c, deg + '°', x0 + r * 1.45 * Math.cos(rad / 2), y0 - r * 1.45 * Math.sin(rad / 2) + 6, 'left');
    },
  });

  /* ---------- 力学 · 单摆（摆动范围） ---------- */
  const PEN_T = param('b_mech_pendulumSwing_T', { label: '周期', min: 0.6, max: 3, step: 0.1, def: 1.6, unit: 's' });
  const PEN_A = param('b_mech_pendulumSwing_a', { label: '摆角', min: 10, max: 45, step: 1, def: 30 });

  reg({
    key: 'b_mech_pendulumSwing', cat: 'mech', label: '单摆', animatable: true,
    icon: '<path d="M8 4h8"/><path d="M12 4v8"/><circle cx="12" cy="16" r="3"/>',
    params: [PEN_T, PEN_A],
    draw(c, o, GH) {
      const b = GH.box(o);
      const w = b.w, h = b.h;
      const T = Math.max(0.2, o.b_mech_pendulumSwing_T || 1.6);
      const A = (o.b_mech_pendulumSwing_a || 30) * Math.PI / 180;
      const px = b.x1 + w / 2, py = b.y1 + h * 0.16;
      const L = h * 0.60;
      const t = ((o.animT || 0) % T) / T;
      const a = A * Math.cos(Math.PI * 2 * t);
      const bx = px + L * Math.sin(a), by = py + L * Math.cos(a);

      // 支架
      ln(c, px - w * 0.12, py, px + w * 0.12, py);
      // 摆动范围那条虚线弧不要了（老师反馈挡视线），只留支架、摆线与摆球
      // 摆线 + 摆球
      ln(c, px, py, bx, by);
      const r = Math.min(9, Math.min(w, h) * 0.032);
      c.save(); c.fillStyle = GH.alpha(o.color, 0.18); dot(c, bx, by, r); c.restore();
      circ(c, bx, by, r);
      // 角度与周期读数按老师要求隐藏，图上只留摆动本身

    },
  });

  /* =====================================================================
   * 1.7.11 · 二维磁场图形（保留 2 个：直导线磁感线、环形电流磁场）
   * 其余 6 个（螺线管/磁通量 ΔΦ/安培力/平行导线/洛伦兹力方向/磁感线流动）
   * 已按老师意见撤下，后续一个一个重做，不再批量上。
   * 命名：图形 key = b_em_<名字>；参数 key = <图形 key>_<参数>。
   * 尺度一律以 min(w,h) 为基准，任意包围盒比例都能看；
   * 细辅助线（磁感线）用 lineWidth*0.55~0.75，主线沿用 o.width。
   * ===================================================================== */
  function MG_N(v, d) { v = +v; if (!isFinite(v)) v = d; return v; }
  function MG_R(v, d) { return Math.round(MG_N(v, d)); }
  function MG_K(v, lo, hi) { v = MG_N(v, lo); return v < lo ? lo : (v > hi ? hi : v); }

  // GH.head 最短 12px，画在半径几十像素的磁感线圆上会盖住整圈；磁感线专用 6~8px 小箭头
  function tip(c, x1, y1, x2, y2, len, sp) {
    const a = Math.atan2(y2 - y1, x2 - x1), L = len || 7, s = sp || 0.45;
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - L * Math.cos(a - s), y2 - L * Math.sin(a - s));
    c.moveTo(x2, y2);
    c.lineTo(x2 - L * Math.cos(a + s), y2 - L * Math.sin(a + s));
    c.stroke();
  }

  // 导线截面：圆 + × 或实心点
  function mgWire(c, x, y, r, into) {
    circ(c, x, y, r);
    if (into) {
      const a = r * 0.55;
      c.beginPath();
      c.moveTo(x - a, y - a); c.lineTo(x + a, y + a);
      c.moveTo(x + a, y - a); c.lineTo(x - a, y + a);
      c.stroke();
    } else {
      c.save(); c.fillStyle = c.strokeStyle; dot(c, x, y, r * 0.42); c.restore();
    }
  }

  /* ---------- 磁场 · 1 直导线磁感线（俯视） ---------- */
  const WF_CUR = param('b_em_wireField_cur', { label: '电流方向', min: 0, max: 1, step: 1, def: 0, unit: '0向里1向外' });
  const WF_N   = param('b_em_wireField_n',   { label: '磁感线圈数', min: 2, max: 6, step: 1, def: 4, unit: '圈' });
  const WF_R0  = param('b_em_wireField_r0',  { label: '最内圈半径', min: 0.14, max: 0.62, step: 0.02, def: 0.28, unit: '' });
  const WF_AR  = param('b_em_wireField_arrow', { label: '流向箭头', min: 0, max: 1, step: 1, def: 1, unit: '0无1有' });

  reg({
    key: 'b_em_wireField', cat: 'em', label: '直导线磁感线',
    icon: '<circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="8.4"/>' +
          '<path d="M12 3.6l2 1.4M12 20.4l-2-1.4"/>',
    params: [WF_CUR, WF_N, WF_R0, WF_AR],
    draw(c, o, GH) {
      const b = GH.box(o), w = b.w, h = b.h, lw = Math.max(1, o.width || 3);
      const cx = b.x1 + w / 2, cy = b.y1 + h / 2;
      const Rmax = Math.min(w, h) * 0.45;
      const n = MG_K(MG_R(o[WF_N], 4), 1, 8);
      const into = MG_R(o[WF_CUR], 0) === 0;
      const rc = Math.max(3, Math.min(Rmax * 0.12, lw * 2.6));
      const r0 = Math.max(Rmax * MG_K(MG_N(o[WF_R0], 0.28), 0.12, 0.7), rc * 2);
      const showArrow = MG_R(o[WF_AR], 1) === 1;
      const dir = into ? 1 : -1;              // 向里 → 顺时针（俯视右手螺旋）

      c.save();
      c.lineWidth = Math.max(1, lw * 0.72);
      for (let i = 0; i < n; i++) {
        const r = n === 1 ? Rmax : r0 + (Rmax - r0) * i / (n - 1);
        circ(c, cx, cy, r);
        if (showArrow) {
          for (let k = 0; k < 4; k++) {
            const a = (k * 90 + 24) * Math.PI / 180;
            const a2 = a + 0.22 * dir;
            c.beginPath();
            c.arc(cx, cy, r, a, a2, dir < 0);
            c.stroke();
            const p1x = cx + r * Math.cos(a2 - 0.05 * dir), p1y = cy + r * Math.sin(a2 - 0.05 * dir);
            const p2x = cx + r * Math.cos(a2), p2y = cy + r * Math.sin(a2);
            tip(c, p1x, p1y, p2x, p2y, Math.min(10, Math.max(6, r * 0.15)));
          }
        }
      }
      c.restore();

      c.save();
      c.lineWidth = Math.max(1.4, lw * 0.95);
      mgWire(c, cx, cy, rc, into);
      c.restore();
    },
  });

  /* ---------- 磁场 · 2 环形电流磁场（斜视：环面压成椭圆，轴竖直） ---------- */
  const LP_CUR = param('b_em_loopField_cur',  { label: '电流方向', min: 0, max: 1, step: 1, def: 0, unit: '0逆1顺' });
  const LP_AX  = param('b_em_loopField_axis', { label: '画轴线', min: 0, max: 1, step: 1, def: 1, unit: '0无1有' });

  reg({
    key: 'b_em_loopField', cat: 'em', label: '环形电流磁场',
    icon: '<ellipse cx="12" cy="14" rx="8" ry="3.2"/><path d="M12 3.6v20.8" stroke-dasharray="2 2"/>' +
          '<path d="M12 3.6l-1.7 2.1M12 3.6l1.7 2.1"/>',
    params: [LP_CUR, LP_AX],
    draw(c, o, GH) {
      const b = GH.box(o), w = b.w, h = b.h, lw = Math.max(1, o.width || 3);
      const cx = b.x1 + w / 2, cy = b.y1 + h * 0.54;
      const rx = Math.min(w * 0.31, h * 0.58), ry = rx * 0.34;
      const ccw = MG_R(o[LP_CUR], 0) === 0;      // 逆时针 → B 沿轴向上（出纸面）
      const up = ccw ? -1 : 1;                   // 屏幕上「向上」= y 减小
      const at = (t) => [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];

      if (MG_R(o[LP_AX], 1) === 1) {
        c.save();
        c.lineWidth = Math.max(1, lw * 0.55);
        c.setLineDash([6, 5]);
        ln(c, cx, cy + ry * 2.2, cx, cy - ry * 2.2);
        c.setLineDash([]);
        c.restore();

        c.save();
        c.lineWidth = Math.max(1.4, lw * 0.85);
        const ay = cy + up * ry * 0.55;
        ln(c, cx, ay - up * 13, cx, ay + up * 13);
        tip(c, cx, ay - up * 13, cx, ay + up * 13, 9);
        c.restore();
      }

      c.save();
      c.lineWidth = Math.max(1.1, lw * 0.9);
      c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();

      c.lineWidth = Math.max(2.2, lw * 1.4);
      c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, -0.30, 0.30, false); c.stroke();
      if (ccw) {
        const p1 = at(-0.23), p2 = at(-0.30);
        tip(c, p1[0], p1[1], p2[0], p2[1], 10);
      } else {
        const p1 = at(0.23), p2 = at(0.30);
        tip(c, p1[0], p1[1], p2[0], p2[1], 10);
      }
      c.restore();

      txt(c, 'I', cx + rx * 0.80, cy - ry * 1.75, 'left');
    },
  });

  /* ---------- 电磁 · 磁聚焦（平行束） ---------- */
  const MAG_T = param('b_em_magFocus_T', { label: '汇聚时间', min: 1, max: 5, step: 0.1, def: 2.4, unit: 's' });
  const MAG_N = param('b_em_magFocus_n', { label: '粒子数', min: 1, max: 5, step: 1, def: 3 });

  reg({
    key: 'b_em_magFocus', cat: 'em', label: '磁聚焦（平行束）', animatable: true,
    icon: '<path d="M3 7h6"/><path d="M3 12h6"/><path d="M3 17h6"/><circle cx="15" cy="12" r="5" stroke-dasharray="2 2"/>',
    params: [MAG_T, MAG_N],
    draw(c, o, GH) {
      const b = GH.box(o);
      const w = b.w, h = b.h;
      const T = Math.max(0.4, o.b_em_magFocus_T || 2.4);
      const n = Math.max(1, Math.round(o.b_em_magFocus_n || 3));
      const R = Math.min(w, h) * 0.30;
      const fx = b.x1 + w / 2, fy = b.y1 + h * 0.46;
      const oy = fy + R;
      const prog = ((o.animT || 0) % T) / T;

      // 场区
      c.save(); c.setLineDash([6, 4]);
      circ(c, fx, fy, R);
      c.restore();
      txt(c, 'B', fx + R * 0.45, fy - R * 0.5, 'center');
      txt(c, 'O', fx + 12, oy + 18, 'left');

      for (let i = 0; i < n; i++) {
        const v = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        const dy = v * R * 0.55;
        const ex = fx - Math.sqrt(Math.max(0, R * R - dy * dy));
        const ey = fy + dy;
        const cx0 = ex, cy0 = ey + R;
        // 入射箭头
        arw(c, GH, ex - R * 0.5, ey, ex - 6, ey);
        // 轨迹
        const aEnd = -Math.PI / 2 + Math.PI * prog;
        const N = 28, pts = [];
        for (let k = 0; k <= N; k++) {
          const ang = -Math.PI / 2 + (aEnd + Math.PI / 2) * k / N;
          pts.push([cx0 + R * Math.cos(ang), cy0 + R * Math.sin(ang)]);
        }
        poly(c, pts, false);
        // 粒子位置必须跟着当前轨迹的末角走。1.6.0 G7：旧实现固定画在入射点
        // (cx0, cy0-R)，所以轨迹在动、粒子不动）。aEnd 与上面 pts 用的是同一个参数源。
        if (prog > 0.02) {
          const r = Math.min(4, Math.min(w, h) * 0.013);
          c.save(); c.fillStyle = GH.alpha(o.color, 0.9);
          dot(c, cx0 + R * Math.cos(aEnd), cy0 + R * Math.sin(aEnd), r);
          c.restore();
        }
      }
    },
  });

    /* ---------- 力学 · 功与能量账本（初速度 → 减速到零） ---------- */
  // 动画：物块以 v₀ 出发，在恒定阻力 f 下匀减速，走完 d停 = v₀²/(2a) 后停下。
  // 位置按 x = d停(2u − u²)（u = t/t停）、速度按 v₀(1 − u) 线性减小 —— 所以「动能减少、
  // 阻力做功增加、两者之和不变」是从物块的运动本身看出来的，不是硬凑的数字。
  const WE_M = param('b_mech_workEnergy_m', { label: '质量', min: 0.5, max: 10, step: 0.1, def: 2, unit: 'kg' });
  const WE_V = param('b_mech_workEnergy_v', { label: '初速度', min: 1, max: 10, step: 0.1, def: 4, unit: 'm/s' });
  const WE_F = param('b_mech_workEnergy_f', { label: '恒阻力', min: 0.5, max: 20, step: 0.1, def: 2, unit: 'N' });

  reg({
    key: 'b_mech_workEnergy', cat: 'mech', label: '功与能量账本', animatable: true,
    icon: '<path d="M3 20h18"/><path d="M7 20V9h6v11"/><path d="M16 20V13h4v7"/>',
    params: [WE_M, WE_V, WE_F],
    draw(c, o, GH) {
      const b = GH.box(o);
      const w = b.w, h = b.h;
      const m = Math.max(0.1, o.b_mech_workEnergy_m || 2);
      const v0 = Math.max(0.1, o.b_mech_workEnergy_v || 4);
      const f = Math.max(0.1, o.b_mech_workEnergy_f || 2);
      const Ek0 = 0.5 * m * v0 * v0;
      const a = f / m, tStop = v0 / a, dStop = Ek0 / f;

      // 播放：运动占 84%，最后 16% 停在终点让人看清「动能已清零」
      const CYCLE = Math.max(2.0, Math.min(4.5, tStop * 0.8 + 1.0));
      const ph = ((((o.animT || 0) / CYCLE) % 1) + 1) % 1;
      const u = Math.min(1, ph / 0.84);
      const x = dStop * (2 * u - u * u);
      const vv = v0 * (1 - u);
      const Ek = 0.5 * m * vv * vv, Wf = Ek0 - Ek;

      const gy = b.y1 + h * 0.40;                    // 地面
      const x0 = b.x1 + w * 0.10;
      const span = w * 0.78;
      const k = span / Math.max(0.4, dStop);         // 米 → 像素
      ln(c, x0 - w * 0.02, gy, x0 + span + w * 0.03, gy);

      const bs = Math.max(6, Math.min(w, h) * 0.085);
      const bx = x0 + x * k;
      poly(c, [[bx - bs, gy - bs * 2], [bx + bs, gy - bs * 2], [bx + bs, gy], [bx - bs, gy]], true);

      // 速度箭头：长度随当前速度收缩（速度为零时箭头消失）
      if (vv > 0.02 * v0) {
        const al = Math.max(bs * 1.2, span * 0.22 * (vv / v0));
        arw(c, GH, bx + bs + bs * 0.5, gy - bs, bx + bs + bs * 0.5 + al, gy - bs);
      }

      // 起点 / 终点标记（虚线刻度），让人看出「还能走多远」
      c.save();
      c.setLineDash([4, 4]);
      ln(c, x0 + bs, gy - bs * 3.0, x0 + bs, gy + bs);
      ln(c, x0 + dStop * k - bs, gy - bs * 3.0, x0 + dStop * k - bs, gy + bs);
      c.restore();

      // 两条能量条：剩余动能 / 阻力已做功能量
      const bw = span, bx0 = x0 - w * 0.02;
      const bh = Math.max(5, Math.min(w, h) * 0.042);
      const ym = gy + bs * 3.2;
      const full = Math.max(Ek0, 1e-6);
      c.save();
      c.fillStyle = GH.alpha(o.color, 0.75);
      const w1 = bw * (Ek / full);
      if (w1 > 0.3) c.fillRect(bx0, ym, w1, bh);
      c.fillStyle = GH.alpha(o.color, 0.30);
      const w2 = bw * (Wf / full);
      if (w2 > 0.3) c.fillRect(bx0, ym + bh * 1.9, w2, bh);
      c.restore();
      c.save();
      c.globalAlpha = 0.22;
      ln(c, bx0, ym, bx0 + bw, ym); ln(c, bx0, ym + bh, bx0 + bw, ym + bh);
      ln(c, bx0, ym + bh * 1.9, bx0 + bw, ym + bh * 1.9);
      ln(c, bx0, ym + bh * 2.9, bx0 + bw, ym + bh * 2.9);
      c.restore();
      txt(c, '动能', bx0, ym - bh * 0.9, 'left');
      txt(c, '阻力做功', bx0, ym + bh * 1.0, 'left');
    },
  });

/* ---------- 热学 · 四张状态图共用坐标系（1.7.10） ---------- */
  // 轴标签一律大写斜体（教材字形）：P、V、T；「1/V」里 V 斜体。
  function heatLab(c, s, x, y, size, align) {
    c.save();
    c.font = 'italic 600 ' + size.toFixed(1) + 'px ' + MATH_FONT;
    // 和库里其他标注一致：纸色深时自动反相成白字（离线探针页面没建纸色，会判成白字，属测试环境特例）
    c.fillStyle = inkOf(null);
    c.textAlign = align || 'center';
    c.textBaseline = 'middle';
    c.fillText(s, x, y);
    c.restore();
  }
  function fmtNum(v) {
    if (!isFinite(v)) return '';
    const a = Math.abs(v);
    if (a >= 100) return String(Math.round(v));
    if (a >= 10) return v.toFixed(0);
    if (a >= 1) return v.toFixed(1);
    return v.toFixed(2);
  }
  // 画轴 + 轴标签 +（可选）网格与刻度数值；返回 X/Y 映射，四张图共用一套。
  function heatAxes(c, GH, b, cfg) {
    const w = b.w, h = b.h;
    const ox = b.x1 + w * 0.14, oy = b.y1 + h * 0.84;
    const aw = w * 0.73, ah = h * 0.70;
    const X = (v) => ox + (v / cfg.xmax) * aw;
    const Y = (v) => oy - (v / cfg.ymax) * ah;
    c.save();
    ln(c, ox, oy, ox + aw, oy);
    arw(c, GH, ox + aw, oy, ox + aw + w * 0.026, oy);
    ln(c, ox, oy, ox, oy - ah);
    arw(c, GH, ox, oy - ah, ox, oy - ah - h * 0.034);
    c.restore();
    const fs = Math.max(11, Math.min(17, Math.min(w, h) * 0.085));
    heatLab(c, cfg.xlab, ox + aw + w * 0.030, oy + h * 0.040, fs, 'left');
    heatLab(c, cfg.ylab, ox - w * 0.030, oy - ah - h * 0.020, fs, 'right');
    if (cfg.grid) {
      c.save();
      c.globalAlpha = 0.18;
      c.setLineDash([Math.max(2, w * 0.008), Math.max(3, w * 0.012)]);
      for (let i = 1; i <= 3; i++) {
        ln(c, ox + aw * i / 4, oy, ox + aw * i / 4, oy - ah);
        ln(c, ox, oy - ah * i / 4, ox + aw, oy - ah * i / 4);
      }
      c.restore();
    }
    if (cfg.val) {
      const vs = Math.max(8, Math.min(12, Math.min(w, h) * 0.060));
      c.save();
      c.fillStyle = inkOf(null);
      c.font = vs.toFixed(1) + 'px system-ui,"Microsoft YaHei",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'top';
      for (let i = 0; i <= 3; i++) c.fillText(fmtNum(cfg.xmax * i / 3), X(cfg.xmax * i / 3), oy + 3);
      c.textAlign = 'right'; c.textBaseline = 'middle';
      for (let i = 1; i <= 3; i++) c.fillText(fmtNum(cfg.ymax * i / 3), ox - 4, Y(cfg.ymax * i / 3));
      c.restore();
    }
    return { X, Y, ox, oy, aw, ah };
  }

// 三种过程在面板里做成三个分段按钮（不给 hint 的话会退化成 0~2 的滑块，
  // 只能看到两档刻度，老师点不到「等容」）。
  const HEAT_MODE_HINT = [{ label: '等温', value: 0 }, { label: '等压', value: 1 }, { label: '等容', value: 2 }];

/* ---------- 热学 · 活塞—pV 过程图（1.6.0 P2） ---------- */
  // 理想气体 pV = nRT（n 固定 1 mol）。三种过程二选一：等温（T 不变，p ∝ 1/V）、
  // 等压（p 不变）、等容（V 不变）。图上画 pV 坐标系、初末状态点、过程曲线，以及
  // 曲线下的面积（气体做功）。等容过程没有面积 —— 不做假阴影。
  const PV_MODE = param('b_heat_pvMode_mode', { label: '过程', min: 0, max: 2, step: 1, def: 0, hint: HEAT_MODE_HINT });
  const PV_T = param('b_heat_pvMode_T', { label: '温度', min: 200, max: 600, step: 10, def: 300, unit: 'K' });
  const PV_V0 = param('b_heat_pvMode_v0', { label: '初体积', min: 1, max: 10, step: 0.1, def: 2, unit: 'L' });
  const PV_V1 = param('b_heat_pvMode_v1', { label: '末体积', min: 1, max: 10, step: 0.1, def: 6, unit: 'L' });
  // 等容过程体积不变，必须有另一个独立量才能定末态：给「末温度」。等温、等压不用它。
  const PV_T1 = param('b_heat_pvMode_t1', { label: '末温度（仅等容用）', min: 100, max: 900, step: 10, def: 450, unit: 'K' });
  const PV_GRID = param('b_heat_pvMode_grid', { label: '网格', min: 0, max: 1, step: 1, def: 0, unit: '0无1有' });
  const PV_VAL = param('b_heat_pvMode_val', { label: '刻度数值', min: 0, max: 1, step: 1, def: 0, unit: '0无1有' });

  reg({
    key: 'b_heat_pvMode', cat: 'heat', label: '活塞—pV 过程图',
    icon: '<path d="M4 20V4"/><path d="M4 20h17"/><path d="M7 16c4-1 6-4 6-9"/>',
    params: [PV_MODE, PV_T, PV_V0, PV_V1, PV_T1, PV_GRID, PV_VAL],
    // 末温度只在等容过程里用到；别的模式下它不改画面（探针会误报「参数没接上」）
    paramCond: {
      b_heat_pvMode_t1: (o) => Math.round(o.b_heat_pvMode_mode) === 2,
      b_heat_pvMode_v1: (o) => Math.round(o.b_heat_pvMode_mode) !== 2,
    },
    draw(c, o, GH) {
      const b = GH.box(o);
      const R = 8.314, n = 1;
      const mode = Math.round(o.b_heat_pvMode_mode);
      const T0 = Math.max(50, o.b_heat_pvMode_T);
      let V0 = Math.max(0.2, o.b_heat_pvMode_v0), V1 = Math.max(0.2, o.b_heat_pvMode_v1);
      const pOf = (V, TT) => (n * R * TT) / (100 * V);   // p 以 10⁵ Pa 计
      const p0 = pOf(V0, T0);
      let T1 = Math.max(20, o.b_heat_pvMode_t1 == null ? 450 : o.b_heat_pvMode_t1);
      let p1;
      if (mode === 0) p1 = pOf(V1, T0);                      // 等温：p ∝ 1/V
      else if (mode === 1) { p1 = p0; T1 = T0 * V1 / V0; }   // 等压：V 变则 T 必须跟着变（原来 T 不变，违反 pV=nRT）
      else { V1 = V0; p1 = pOf(V0, T1); }                    // 等容：末压由末温定
      // 固定 V 轴到参数上限（10.5 L）、p 轴按 10 的整数档：老师调参数时曲线在轴里移动，
      // 而不是「轴跟着曲线缩放、怎么调都长一个样」。
      const Vmax = 10.5;
      const pmax = Math.max(20, Math.ceil(Math.max(p0, p1) / 10) * 10);
      const ax = heatAxes(c, GH, b, {
        xlab: 'V', ylab: 'P', xmax: Vmax, ymax: pmax,
        grid: o.b_heat_pvMode_grid >= 0.5, val: o.b_heat_pvMode_val >= 0.5,
      });
      const X = ax.X, Y = ax.Y;
      // 过程曲线：等温是双曲线，等压是水平线，等容是竖线
      const pts = [];
      if (mode === 0) {
        for (let i = 0; i <= 40; i++) {
          const V = V0 + (V1 - V0) * (i / 40);
          pts.push([X(V), Y(pOf(V, T0))]);
        }
      } else if (mode === 1) {
        pts.push([X(V0), Y(p0)], [X(V1), Y(p0)]);
      } else {
        pts.push([X(V0), Y(p0)], [X(V0), Y(p1)]);
      }
      // 面积（气体做功）：只有 p–V 图的曲线下面积是 ∫p dV，等容不画
      if (mode !== 2 && Math.abs(V1 - V0) > 1e-6) {
        c.save();
        c.fillStyle = GH.alpha(o.color, 0.16);
        c.beginPath();
        c.moveTo(X(V0), Y(0));
        for (let i = 0; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
        c.lineTo(X(V1), Y(0));
        c.closePath();
        c.fill();
        c.restore();
      }
      poly(c, pts, false);
      const r = Math.max(2.2, Math.min(b.w, b.h) * 0.012);
      c.save();
      c.fillStyle = GH.alpha(o.color, 0.85);
      dot(c, X(V0), Y(p0), r);
      dot(c, X(V1), Y(p1), r);
      c.restore();
    },
  });

  /* ---------- 热学 · 四张状态图的公共参数（1.7.10） ---------- */
  // 一张图一个「网格」「刻度数值」开关，默认都关：讲解时不抢图线，需要读数再打开。
  function heatSwitches(key) {
    return [
      param(key + '_grid', { label: '网格', min: 0, max: 1, step: 1, def: 0, unit: '0无1有' }),
      param(key + '_val', { label: '刻度数值', min: 0, max: 1, step: 1, def: 0, unit: '0无1有' }),
    ];
  }
  // 理想气体统一取值：n = 1 mol，p 用 10⁵ Pa 计（V 以 L 代入）
  const HG_R = 8.314, HG_N = 1;
  const hgP = (V, T) => (HG_N * HG_R * T) / (100 * V);

  /* ---------- 热学 · p–1/V 图（等温线是过原点的直线） ---------- */
  const PIV_MODE = param('b_heat_pInvV_mode', { label: '过程', min: 0, max: 2, step: 1, def: 0, hint: HEAT_MODE_HINT });
  const PIV_T0 = param('b_heat_pInvV_t0', { label: '初温', min: 200, max: 600, step: 10, def: 300, unit: 'K' });
  const PIV_V0 = param('b_heat_pInvV_v0', { label: '初体积', min: 1, max: 10, step: 0.1, def: 2, unit: 'L' });
  const PIV_V1 = param('b_heat_pInvV_v1', { label: '末体积', min: 1, max: 10, step: 0.1, def: 6, unit: 'L' });
  const PIV_T1 = param('b_heat_pInvV_t1', { label: '末温度（仅等容用）', min: 100, max: 900, step: 10, def: 450, unit: 'K' });

  reg({
    key: 'b_heat_pInvV', cat: 'heat', label: 'p–1/V 图（等温为过原点直线）',
    icon: '<path d="M4 20V4"/><path d="M4 20h17"/><path d="M6 18L18 6"/>',
    params: [PIV_MODE, PIV_T0, PIV_V0, PIV_V1, PIV_T1].concat(heatSwitches('b_heat_pInvV')),
    paramCond: {
      b_heat_pInvV_t1: (o) => Math.round(o.b_heat_pInvV_mode) === 2,
      b_heat_pInvV_v1: (o) => Math.round(o.b_heat_pInvV_mode) !== 2,
    },
    draw(c, o, GH) {
      const b = GH.box(o);
      const mode = Math.round(o.b_heat_pInvV_mode);
      const T0 = Math.max(50, o.b_heat_pInvV_t0);
      let V0 = Math.max(0.2, o.b_heat_pInvV_v0), V1 = Math.max(0.2, o.b_heat_pInvV_v1);
      const T1 = Math.max(20, o.b_heat_pInvV_t1 == null ? 450 : o.b_heat_pInvV_t1);
      const p0 = hgP(V0, T0);
      const x0 = 1 / V0, x1 = 1 / V1;
      let p1;
      if (mode === 0) p1 = hgP(V1, T0);
      else if (mode === 1) p1 = p0;
      else { V1 = V0; p1 = p0 * T1 / T0; }
      const xmax = 1.05;   // 1/V 轴固定到 V=1 L 处
      const pmax = 60;     // 固定档：T 拉到 600 K 时最高点约 52，抬高参数只是让线更陡
      const ax = heatAxes(c, GH, b, {
        xlab: '1/V', ylab: 'P', xmax: xmax, ymax: pmax,
        grid: o.b_heat_pInvV_grid >= 0.5, val: o.b_heat_pInvV_val >= 0.5,
      });
      const X = ax.X, Y = ax.Y;
      const pts = [];
      let ext = null;
      if (mode === 0) {
        // 等温：p = (nRT)·(1/V) 过原点。实线画过程段，虚线延长到原点表示正比关系
        pts.push([X(x0), Y(p0)], [X(x1), Y(p1)]);
        ext = [X(0), Y(0)];
      } else if (mode === 1) {
        pts.push([X(x0), Y(p0)], [X(x1), Y(p0)]);
      } else {
        pts.push([X(x0), Y(p0)], [X(x0), Y(p1)]);
      }
      if (ext) {
        c.save();
        c.globalAlpha = 0.42;
        c.setLineDash([Math.max(3, b.w * 0.012), Math.max(3, b.w * 0.012)]);
        ln(c, ext[0], ext[1], pts[0][0], pts[0][1]);
        c.restore();
      }
      poly(c, pts, false);
      const r = Math.max(2.2, Math.min(b.w, b.h) * 0.012);
      c.save();
      c.fillStyle = GH.alpha(o.color, 0.85);
      dot(c, X(x0), Y(p0), r);
      dot(c, X(mode === 2 ? x0 : x1), Y(p1), r);
      c.restore();
    },
  });

  /* ---------- 热学 · p–T 图（等容线是过原点的直线） ---------- */
  const PT_MODE = param('b_heat_pT_mode', { label: '过程', min: 0, max: 2, step: 1, def: 2, hint: HEAT_MODE_HINT });
  const PT_T0 = param('b_heat_pT_t0', { label: '初温', min: 200, max: 600, step: 10, def: 300, unit: 'K' });
  const PT_T1 = param('b_heat_pT_t1', { label: '末温（等容用）', min: 100, max: 900, step: 10, def: 450, unit: 'K' });
  const PT_V0 = param('b_heat_pT_v0', { label: '体积（等容线斜率）', min: 1, max: 10, step: 0.1, def: 2, unit: 'L' });
  const PT_V1 = param('b_heat_pT_v1', { label: '末体积（等压用）', min: 1, max: 10, step: 0.1, def: 4, unit: 'L' });

  reg({
    key: 'b_heat_pT', cat: 'heat', label: 'p–T 图（等容为过原点直线）',
    icon: '<path d="M4 20V4"/><path d="M4 20h17"/><path d="M6 18L18 6"/>',
    params: [PT_MODE, PT_T0, PT_T1, PT_V0, PT_V1].concat(heatSwitches('b_heat_pT')),
    paramCond: {
      b_heat_pT_t1: (o) => Math.round(o.b_heat_pT_mode) === 2,
      b_heat_pT_v1: (o) => Math.round(o.b_heat_pT_mode) !== 2,
    },
    draw(c, o, GH) {
      const b = GH.box(o);
      const mode = Math.round(o.b_heat_pT_mode);
      const T0 = Math.max(50, o.b_heat_pT_t0);
      const T1 = Math.max(20, o.b_heat_pT_t1 == null ? 450 : o.b_heat_pT_t1);
      const V0 = Math.max(0.2, o.b_heat_pT_v0), V1 = Math.max(0.2, o.b_heat_pT_v1);
      const p0 = hgP(V0, T0);
      let p1, Tx = T1;
      if (mode === 0) p1 = hgP(V1, T0);                 // 等温：竖线
      else if (mode === 1) { p1 = p0; Tx = T0 * V1 / V0; } // 等压：V 变 ⇒ T 跟着变
      else p1 = p0 * T1 / T0;                           // 等容：过原点直线
      const Tmax = 900;    // T 轴固定到参数上限，等容线自然伸展
      const pTop = mode === 2 ? p0 * Tmax / T0 : Math.max(p0, p1);
      const pmax = Math.max(20, Math.ceil(pTop / 10) * 10);
      const ax = heatAxes(c, GH, b, {
        xlab: 'T', ylab: 'P', xmax: Tmax, ymax: pmax,
        grid: o.b_heat_pT_grid >= 0.5, val: o.b_heat_pT_val >= 0.5,
      });
      const X = ax.X, Y = ax.Y;
      const pts = [];
      let ext = null;
      if (mode === 0) pts.push([X(T0), Y(p0)], [X(T0), Y(p1)]);
      else if (mode === 1) pts.push([X(T0), Y(p0)], [X(Tx), Y(p0)]);
      else {
        // 等容：p ∝ T，实线画过程段，虚线延长到原点
        pts.push([X(T0), Y(p0)], [X(T1), Y(p1)]);
        ext = [X(0), Y(0)];
      }
      if (ext) {
        c.save();
        c.globalAlpha = 0.42;
        c.setLineDash([Math.max(3, b.w * 0.012), Math.max(3, b.w * 0.012)]);
        ln(c, ext[0], ext[1], pts[0][0], pts[0][1]);
        c.restore();
      }
      poly(c, pts, false);
      const r = Math.max(2.2, Math.min(b.w, b.h) * 0.012);
      c.save();
      c.fillStyle = GH.alpha(o.color, 0.85);
      dot(c, X(T0), Y(p0), r);
      dot(c, X(mode === 0 ? T0 : (mode === 1 ? Tx : Tx)), Y(p1), r);
      c.restore();
    },
  });

  /* ---------- 热学 · V–T 图（等压线是过原点的直线） ---------- */
  const VT_MODE = param('b_heat_vT_mode', { label: '过程', min: 0, max: 2, step: 1, def: 1, hint: HEAT_MODE_HINT });
  const VT_T0 = param('b_heat_vT_t0', { label: '初温', min: 200, max: 600, step: 10, def: 300, unit: 'K' });
  const VT_T1 = param('b_heat_vT_t1', { label: '末温（等容用）', min: 100, max: 900, step: 10, def: 450, unit: 'K' });
  const VT_V0 = param('b_heat_vT_v0', { label: '初体积', min: 1, max: 10, step: 0.1, def: 2, unit: 'L' });
  const VT_V1 = param('b_heat_vT_v1', { label: '末体积（等温/等压用）', min: 1, max: 10, step: 0.1, def: 4, unit: 'L' });

  reg({
    key: 'b_heat_vT', cat: 'heat', label: 'V–T 图（等压为过原点直线）',
    icon: '<path d="M4 20V4"/><path d="M4 20h17"/><path d="M6 18L18 6"/>',
    params: [VT_MODE, VT_T0, VT_T1, VT_V0, VT_V1].concat(heatSwitches('b_heat_vT')),
    paramCond: {
      b_heat_vT_t1: (o) => Math.round(o.b_heat_vT_mode) === 2,
      b_heat_vT_v1: (o) => Math.round(o.b_heat_vT_mode) !== 2,
    },
    draw(c, o, GH) {
      const b = GH.box(o);
      const mode = Math.round(o.b_heat_vT_mode);
      const T0 = Math.max(50, o.b_heat_vT_t0);
      const T1 = Math.max(20, o.b_heat_vT_t1 == null ? 450 : o.b_heat_vT_t1);
      const V0 = Math.max(0.2, o.b_heat_vT_v0), V1 = Math.max(0.2, o.b_heat_vT_v1);
      let Vx = V1, Tx = T1;
      if (mode === 0) Vx = V1;                        // 等温：T 不变、V 变（横线）
      else if (mode === 1) Tx = T0 * V1 / V0;          // 等压：V ∝ T，过原点直线
      else { Vx = V0; }                                // 等容：V 不变、T 变（竖线）
      const Tmax = Math.max(900, Tx * 1.05);   // 等压时末温可超过 900 K，轴要装得下
      const Vmax = 12;                          // V 轴固定（参数上限 10 L + 余量）
      const ax = heatAxes(c, GH, b, {
        xlab: 'T', ylab: 'V', xmax: Tmax, ymax: Vmax,
        grid: o.b_heat_vT_grid >= 0.5, val: o.b_heat_vT_val >= 0.5,
      });
      const X = ax.X, Y = ax.Y;
      const pts = [];
      let ext = null;
      if (mode === 0) pts.push([X(T0), Y(V0)], [X(T0), Y(Vx)]);
      else if (mode === 1) {
        // 等压：V ∝ T，实线画过程段，虚线延长到原点
        pts.push([X(T0), Y(V0)], [X(Tx), Y(V1)]);
        ext = [X(0), Y(0)];
      } else pts.push([X(T0), Y(V0)], [X(Tx), Y(V0)]);
      if (ext) {
        c.save();
        c.globalAlpha = 0.42;
        c.setLineDash([Math.max(3, b.w * 0.012), Math.max(3, b.w * 0.012)]);
        ln(c, ext[0], ext[1], pts[0][0], pts[0][1]);
        c.restore();
      }
      poly(c, pts, false);
      const r = Math.max(2.2, Math.min(b.w, b.h) * 0.012);
      c.save();
      c.fillStyle = GH.alpha(o.color, 0.85);
      dot(c, X(T0), Y(V0), r);
      if (mode === 2) dot(c, X(Tx), Y(V0), r);
      else if (mode === 0) dot(c, X(T0), Y(Vx), r);
      else dot(c, X(Tx), Y(V1), r);
      c.restore();
    },
  });

    /* ---------- 电磁 · 电磁振荡（1.7.12：按「4.1 电磁振荡.ggb」原格式复刻） ----------
       ggb 原稿参数：A=(0,-4) B=(0,4) a=2 b=0.5 n=5.5 Len=Distance[A,B]-2b=7 unitL=Len/n
         c1  线圈：A+(0,b+i)+(a·cos(-π/2-2πu), b·sin(-π/2-2πu))，u=(i mod unitL)/unitL
              两端正好落在 A/B 上，导线从 A/B 接出，接头严丝合缝
         l1  导线：PolyLine[B,(10,4),(10,2)] / PolyLine[A,(10,-4),(10,-2)] + 极板 y=±2
         l2  电场：ceil|q|+1 条竖箭头，x=7+i·6/ceil|q|，y 从 2 到 -2（q>0）
         l3/4 电荷：极板外 y=±2.4，x 同上，用线段画 +/−
         l5/6/7 → l8：三点 (x,6)/(x',0)/(x,-6) 的 CircumcircleArc 外接圆弧组
         l9  磁感线中部：y=±0.5 的竖直小箭头，方向随 I
         l10 电流：上导线 y=4 从 5-0.3I 到 5+0.3I，下导线反向
         cq/cI 曲线：O1=(14,4)/O2=(14,-4)，x=i∈[0,t]，y=4+2cos(2πi/T)，只画到当前 t
       文字只保留 ggb 的 q / I 两个坐标标签；公式条、读数、刻度、L/C 一律不画。
       「磁感线」是 ggb 原生的外接圆弧 + 中部箭头，不是 1.7.10 那套 RK4 数值流线。
       配色跟随 o.color / inkOf，浓淡用 GH.alpha，不引入 ggb 的红蓝黄。
    */
  const LC_C = param('b_em_lcOsc_c', { label: '电容 C', min: 1, max: 10, step: 0.1, def: 4, unit: '相对' });
  const LC_L = param('b_em_lcOsc_l', { label: '电感 L', min: 1, max: 10, step: 0.1, def: 4, unit: '相对' });
  // 上限 355° 而非 360°：0°/360° 是同一相位，参数敏感性探针会误判成「改了没变」。
  const LC_PHI = param('b_em_lcOsc_phi', { label: '初相 φ', min: 0, max: 355, step: 5, def: 0, unit: '°' });
  const LC_PAUSE = param('b_em_lcOsc_pause', {
    label: '自动暂停', def: 0, min: 0, max: 3, step: 1, unit: '',
    hint: [{ label: '不暂停', value: 0 }, { label: '每¼周期', value: 1 }, { label: '每½周期', value: 2 }, { label: '每周期', value: 3 }],
  });
  function lcSw(k, label, def) {
    return param('b_em_lcOsc_' + k, {
      label: label, def: def, min: 0, max: 1, step: 1, unit: '',
      hint: [{ label: '隐藏', value: 0 }, { label: '显示', value: 1 }],
    });
  }
  const LC_SQ    = lcSw('showQ', '电荷 ±', 1);
  const LC_SI    = lcSw('showI', '电流', 1);
  const LC_SE    = lcSw('showE', '电场线', 1);
  const LC_SB    = lcSw('showB', '磁感线', 0);
  const LC_SQT   = lcSw('showQt', 'q-t 图', 0);
  const LC_SIT   = lcSw('showIt', 'I-t 图', 0);
  const LC_SEN   = lcSw('showEnergy', '能量条', 0);   // 插入时默认收起，需要再打开
  const LC_SFLOW = lcSw('showFlow', '流动电荷点', 1);
  // 教学对比按钮：1＝磁场能最大（q=0、|I| 最大，初相 90°）；0＝电场能最大（q=+Qm）
  const LC_INIT = param('b_em_lcOsc_init', {
    label: '初始条件', def: 0, min: 0, max: 1, step: 1, unit: '',
    hint: [{ label: '电场能最大', value: 0 }, { label: '磁场能最大', value: 1 }],
  });
  // 老师 2026-11-11 第四轮：红色系＝正电荷/电场线/电流/q/电场能；蓝色系＝磁感线/I/磁场能
  const OSC_RED = '#e53935', OSC_BLUE = '#1e88e5';   // 复用项目磁铁同款红蓝

  // 相对单位：T = T₀·√(L·C)，T₀ 标定成默认 C=L=4 时 1.4 s（沿用旧图讲课速度）。
  function lcT(C, L) { return 0.35 * Math.sqrt(Math.max(0.2, C) * Math.max(0.2, L)); }
  function lcOn(o, k, def) { const v = o[k]; return v == null ? def : (+v >= 0.5 ? 1 : 0); }
  // 实心尖锐箭头（坐标轴样式）：杆 + 填充三角，填色跟随 strokeStyle
  function lcArrow(c, x1, y1, x2, y2, s) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const bx = x2 - Math.cos(ang) * s * 1.7, by = y2 - Math.sin(ang) * s * 1.7;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(bx, by); c.stroke();
    c.fillStyle = c.strokeStyle;
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - Math.cos(ang - 0.36) * s * 1.6, y2 - Math.sin(ang - 0.36) * s * 1.6);
    c.lineTo(x2 - Math.cos(ang + 0.36) * s * 1.6, y2 - Math.sin(ang + 0.36) * s * 1.6);
    c.closePath(); c.fill();
  }
  // 坐标轴标准标注（斜体数学字形）
  function lcMath(c, s, x, y, align) {
    c.save();
    c.fillStyle = inkOf(null);
    c.font = 'italic 14px "Cambria Math", "Times New Roman", serif';
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    c.fillText(s, x, y);
    c.restore();
  }
  // ggb CircumcircleArc[P1,P2,P3]：过三点的圆弧，从 P1 经 P2 到 P3
  function lcArc3(c, p1, p2, p3) {
    const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1], x3 = p3[0], y3 = p3[1];
    const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(d) < 1e-6) {
      // 三点共线（正好中间那条）：画成与周围等长的直线，别让它只剩一小截
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x3, y3); c.stroke();
      return;
    }
    const s1 = x1 * x1 + y1 * y1, s2 = x2 * x2 + y2 * y2, s3 = x3 * x3 + y3 * y3;
    const cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / d;
    const cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / d;
    const r = Math.hypot(x1 - cx, y1 - cy);
    if (!(r > 0) || r > 1e6) return;
    const a1 = Math.atan2(y1 - cy, x1 - cx), a2 = Math.atan2(y2 - cy, x2 - cx), a3 = Math.atan2(y3 - cy, x3 - cx);
    const nrm = (a) => { let v = a % (Math.PI * 2); if (v < 0) v += Math.PI * 2; return v; };
    const d13 = nrm(a3 - a1), d12 = nrm(a2 - a1);
    c.beginPath();
    c.arc(cx, cy, r, a1, a3, !(d12 < d13));
    c.stroke();
  }

  reg({
    key: 'b_em_lcOsc', cat: 'em', label: '电磁振荡（q / I / 能量）', animatable: true,
    animSpeed: 0.05,
    icon: '<path d="M3 12h3M18 12h3"/><path d="M6 8v8M18 8v8"/><path d="M9 12c1.5-3 3-3 4.5 0s3 3 4.5 0"/>',
    params: [LC_C, LC_L, LC_PHI, LC_INIT, LC_PAUSE, LC_SQ, LC_SI, LC_SE, LC_SB, LC_SQT, LC_SIT, LC_SEN, LC_SFLOW],
    // 「自动暂停」只作用于动画推进（animGate），静态帧上本来就该一模一样，通用探针跳过它；
    // 节拍夹停的正确性由专门的动画探针单独验证。
    paramCond: { b_em_lcOsc_pause: () => false },
    // 全局动画推进到本图形时调用：跨过节拍就把 animT 夹在节拍上并停下，老师按播放继续。
    animGate(it, prevT, nextT) {
      const pv = +(it.b_em_lcOsc_pause || 0);
      if (pv <= 0) return nextT;
      const stepT = lcT(it.b_em_lcOsc_c, it.b_em_lcOsc_l) * (pv === 1 ? 0.25 : pv === 2 ? 0.5 : 1);
      const a = Math.floor(prevT / stepT), b2 = Math.floor(nextT / stepT);
      if (b2 > a) { it.animPlaying = false; return b2 * stepT; }
      return nextT;
    },
    draw(c, o, GH) {
      const b = GH.box(o);
      const w = b.w, h = b.h, ms = Math.min(w, h);
      const C = Math.max(0.2, +o.b_em_lcOsc_c || 4);
      const L = Math.max(0.2, +o.b_em_lcOsc_l || 4);
      const T = lcT(C, L);
      // 初始条件按钮优先：磁场能最大档相当于初相 90°（q=0、I 最大）
      const phi = ((+o.b_em_lcOsc_init || 0) >= 0.5 ? 0.25 : 0) + (+o.b_em_lcOsc_phi || 0) / 360;
      const ph = ((((+o.animT || 0) / T + phi) % 1) + 1) % 1;
      const tNow = Math.max(0, (+o.animT || 0));      // 曲线横轴：与 ggb 一样只画到当前 t
      const q = Math.cos(ph * Math.PI * 2);           // 归一化电荷：+1 上板正电最多
      const I = -Math.sin(ph * Math.PI * 2);          // 归一化电流：+1 顺时针最大
      const Ee = q * q, Em = I * I;
      const ink = o.color || '#1a1a1a';
      const lw = Math.max(1, (o.size || 4) * 0.26);
      const sQ = lcOn(o, 'b_em_lcOsc_showQ', 1), sI = lcOn(o, 'b_em_lcOsc_showI', 1);
      const sE = lcOn(o, 'b_em_lcOsc_showE', 1), sB = lcOn(o, 'b_em_lcOsc_showB', 0);
      const sQT = lcOn(o, 'b_em_lcOsc_showQt', 0), sIT = lcOn(o, 'b_em_lcOsc_showIt', 0);
      const sEN = lcOn(o, 'b_em_lcOsc_showEnergy', 1), sFLOW = lcOn(o, 'b_em_lcOsc_showFlow', 1);

      // ---- 按 ggb 的 10×8 单位网格映射到用户框（x: 0 线圈轴, 10 电容中心；y: ±4 导线）----
      const xL = b.x1 + w * 0.13;
      const xR = b.x1 + w * 0.53;
      const ux = (xR - xL) / 10;
      const top = b.y1 + h * 0.09, bot = b.y1 + h * 0.73;
      const uy = (bot - top) / 8;
      const cy = (top + bot) / 2;
      const rx = 2 * ux;                                   // a = 2
      const ry = Math.min(0.5 * ux, (bot - top) * 0.10);    // b = 0.5
      const pw = 3 * ux;                                   // 极板半宽 3
      const gap = 4 * uy;                                  // 极板间距 4（y = ±2）
      const span = bot - top, spanEff = span - 2 * ry;

      // ---- 线圈 c1：每匝从轴心起绕，两端正好在 (xL,top)/(xL,bot)，与导线无缝 ----
      const turns = 5.5;                                   // ggb n = 5.5
      const segs = Math.ceil(turns * 48);
      const helixAt = (t) => {
        const th = -Math.PI / 2 - Math.PI * 2 * ((t * turns) % 1);
        return [xL + rx * Math.cos(th), top + ry + spanEff * t + ry * Math.sin(th)];
      };
      // 前侧（sin>0，靠近观察者）实线；后侧（sin<0）虚线，体现空间感
      for (let pass = 0; pass < 2; pass++) {
        const front = pass === 1;
        c.save();
        if (!front) {
          c.setLineDash([Math.max(2.5, lw * 2.2), Math.max(2.5, lw * 2)]);
          c.globalAlpha = 0.55;
        }
        c.beginPath();
        let pen = false;
        for (let k = 0; k <= segs; k++) {
          const tt = k / segs;
          const th = -Math.PI / 2 - Math.PI * 2 * ((tt * turns) % 1);
          const p = helixAt(tt);
          const isFront = Math.sin(th) > 0;
          if (isFront !== front) {
            if (pen) c.lineTo(p[0], p[1]);
            pen = false;
            continue;
          }
          if (!pen) { c.moveTo(p[0], p[1]); pen = true; } else c.lineTo(p[0], p[1]);
        }
        c.stroke();
        c.restore();
      }

      // ---- 导线与极板 l1 ----
      ln(c, xL, top, xR, top);
      ln(c, xR, top, xR, cy - gap / 2);
      ln(c, xL, bot, xR, bot);
      ln(c, xR, bot, xR, cy + gap / 2);
      ln(c, xR - pw, cy - gap / 2, xR + pw, cy - gap / 2);
      ln(c, xR - pw, cy + gap / 2, xR + pw, cy + gap / 2);

      // ---- 电场线 l2：ceil|q|+1 条贯通极板的竖箭头（ggb q 量纲 10）----
      const nE = Math.max(1, Math.ceil(Math.abs(q) * 10));
      if (sE && Math.abs(q) > 0.02) {
        const aS = Math.max(2.2, ms * 0.012);
        c.save();
        c.strokeStyle = OSC_RED;
        c.globalAlpha = 0.25 + 0.75 * Math.abs(q);
        c.lineWidth = lw;
        for (let i = 0; i <= nE; i++) {
          const xx = xR - pw + (2 * pw) * i / nE;
          if (q >= 0) lcArrow(c, xx, cy - gap / 2 + 2, xx, cy + gap / 2 - 2, aS);
          else lcArrow(c, xx, cy + gap / 2 - 2, xx, cy - gap / 2 + 2, aS);
        }
        c.restore();
      }

      // ---- 电荷 l3/l4：极板外 y=±2.4 的线段 +/−（q>0 上板 +、下板 −）----
      if (sQ && Math.abs(q) > 0.03) {
        const hw = 0.2 * ux, hh = 0.2 * uy;
        const yT = cy - gap / 2 - 0.4 * uy, yB = cy + gap / 2 + 0.4 * uy;
        c.save();
        c.strokeStyle = OSC_RED;
        c.lineWidth = Math.max(1.2, lw * 1.15);
        c.lineCap = 'round';
        for (let i = 0; i <= nE; i++) {
          const xx = xR - pw + (2 * pw) * i / nE;
          const plusTop = q >= 0;
          // 上板
          ln(c, xx - hw, yT, xx + hw, yT);
          if (plusTop) ln(c, xx, yT - hh, xx, yT + hh);
          // 下板
          ln(c, xx - hw, yB, xx + hw, yB);
          if (!plusTop) ln(c, xx, yB - hh, xx, yB + hh);
        }
        c.restore();
      }

      // ---- 磁感线：l5/l6/l7 三点外接圆弧组成的长场线（蓝色，全部等长）----
      if (sB && Math.abs(I) > 0.04) {
        const nB = Math.max(1, Math.ceil(Math.abs(I) * 8));
        const arcH = Math.min(6 * uy, (cy - b.y1) * 0.92, (b.y1 + h * 0.78 - cy) * 0.92);
        c.save();
        c.strokeStyle = OSC_BLUE;
        c.lineWidth = Math.max(1.2, lw * 1.05);
        c.globalAlpha = 0.32 + 0.6 * Math.abs(I);
        for (let i = 0; i <= nB; i++) {
          const xa = xL + (-2.2 + 4.4 * i / nB) * ux;
          const xm = xL + (-1.6 + 3.2 * i / nB) * ux;
          lcArc3(c, [xa, cy - arcH], [xm, cy], [xa, cy + arcH]);
          // l9：外接圆弧在 (xm,cy) 处切线竖直，在这里补一个方向随 I 的小箭头（ggb 原稿的磁感线方向标记）。
          // tip 只画箭头尖，杆单独补一小段；颜色与透明度继承上面设好的 OSC_BLUE / globalAlpha。
          const aB = Math.min(8, Math.max(5, ms * 0.011));
          const dB = I >= 0 ? -1 : 1;
          const yB0 = cy - dB * aB * 1.6, yB1 = cy + dB * aB * 1.6;
          c.beginPath(); c.moveTo(xm, yB0); c.lineTo(xm, yB1); c.stroke();
          tip(c, xm, yB0, xm, yB1, aB);
        }
        c.restore();
      }

      // ---- 电流 l10：上导线 y=4 从 5-0.3I 到 5+0.3I，下导线反向 ----
      if (sI && Math.abs(I) > 0.03) {
        const half = 2.4 * Math.abs(I) * ux;          // ggb: 0.3·I，I 量纲 8 → 半长 2.4|I|
        const xm = (xL + xR) / 2;
        c.save();
        c.strokeStyle = OSC_RED;
        c.globalAlpha = 0.32 + 0.68 * Math.abs(I);
        c.lineWidth = lw;
        const aI = Math.max(3.5, ms * 0.014);
        if (I >= 0) {
          lcArrow(c, xm - half, top - 0.5 * uy, xm + half, top - 0.5 * uy, aI);
          lcArrow(c, xm + half, bot + 0.5 * uy, xm - half, bot + 0.5 * uy, aI);
        } else {
          lcArrow(c, xm + half, top - 0.5 * uy, xm - half, top - 0.5 * uy, aI);
          lcArrow(c, xm - half, bot + 0.5 * uy, xm + half, bot + 0.5 * uy, aI);
        }
        c.restore();
      }

      // ---- 流动电荷点：沿「下导线 → 右竖（跳过电容间隙）→ 上导线 → 螺旋线圈」整圈走 ----
      if (sFLOW) {
        let helixLen = 0, pp = helixAt(0);
        for (let k = 1; k <= 96; k++) {
          const p = helixAt(k / 96);
          helixLen += Math.hypot(p[0] - pp[0], p[1] - pp[1]);
          pp = p;
        }
        const wire = xR - xL;
        const segB = bot - (cy + gap / 2), segT = (cy - gap / 2) - top;
        const per = wire + segB + segT + wire + helixLen;
        const at = (s) => {
          let d = ((s % per) + per) % per;
          if (d < wire) return [xL + d, bot];
          d -= wire;
          if (d < segB) return [xR, bot - d];
          d -= segB;
          if (d < segT) return [xR, cy - gap / 2 - d];
          d -= segT;
          if (d < wire) return [xR - d, top];
          d -= wire;
          return helixAt(Math.max(0, Math.min(1, d / helixLen)));
        };
        const off = per * (1 - q) / 2;
        const sp = Math.max(ms * 0.14, 18);
        const dr = Math.max(1.8, ms * 0.012);
        c.save();
        c.fillStyle = OSC_RED;
        for (let s = 0; s < per; s += sp) {
          const p = at(s + off);
          dot(c, p[0], p[1], dr);
        }
        c.restore();
      }

      // ---- q-t / I-t：标准坐标轴 + 一个周期、随动点渐进绘制 ----
      if (sQT || sIT) {
        const gx0 = b.x1 + w * 0.68, gx1 = b.x2 - w * 0.03;
        const gyT = b.y1 + h * 0.22, gyB = b.y1 + h * 0.64;
        const gu = (gyB - gyT) / 8;
        const guX = (gx1 - gx0) / T;          // 横轴正好铺满一个周期 T
        const aAxis = Math.max(5.5, lw * 3.2);      // 坐标轴箭头按标准样式放大
        const plot = (base, fn, col, label) => {
          c.save();
          c.lineWidth = lw;
          c.strokeStyle = GH.alpha(ink, 0.42);
          // 竖轴向上、横轴向右，均为实心尖锐箭头
          lcArrow(c, gx0, base + 2.5 * gu, gx0, base - 2.5 * gu, aAxis);
          lcArrow(c, gx0, base, gx1, base, aAxis);
          // 原点 O：实心圆点 + 斜体 O
          c.fillStyle = c.strokeStyle;
          dot(c, gx0, base, Math.max(2.2, lw * 1.6));   // 原点 O 的圆点
          c.restore();
          lcMath(c, 'O', gx0 - 7, base + 10, 'right');
          lcMath(c, 't', gx1 - 2, base + 11, 'right');
          lcMath(c, label, gx0 - 7, base - 2.5 * gu - 2, 'right');
          // 曲线：从 0 渐进画到当前相位 tCur，只显示一个周期
          c.save();
          c.lineWidth = Math.max(1.2, lw * 1.05);
          c.strokeStyle = col;
          c.beginPath(); c.rect(gx0, base - 2.5 * gu, gx1 - gx0, 5 * gu); c.clip();
          const tCur = ph * T;
          const segs = Math.max(2, Math.ceil(320 * ph));   // 按已绘制比例保持采样密度
          c.beginPath();
          for (let k = 0; k <= segs; k++) {
            const tt = tCur * k / segs;
            const xx = gx0 + tt * guX;
            const yy = base + fn(tt);
            if (k === 0) c.moveTo(xx, yy); else c.lineTo(xx, yy);
          }
          c.stroke();
          // 动点：当前相位处，曲线随它移动逐渐绘出
          c.fillStyle = col;
          dot(c, gx0 + tCur * guX, base + fn(tCur), Math.max(2.2, lw * 1.8));
          c.restore();
        };
        // ggb：q 曲线 y=4+2cos，I 曲线 y=-4-2sin；canvas y 向下
        if (sQT) plot(gyT, (tt) => -2 * gu * Math.cos(Math.PI * 2 * (tt / T + phi)), OSC_RED, 'q');
        if (sIT) plot(gyB, (tt) => 2 * gu * Math.sin(Math.PI * 2 * (tt / T + phi)), OSC_BLUE, 'I');
      }

      // ---- 电场能 / 磁场能双条（项目原有，两者之和恒定）----
      if (sEN) {
        const lx = b.x1 + w * 0.03;
        const bx0 = b.x1 + w * 0.22, bw = w * 0.72;
        const bh = Math.max(4, ms * 0.032);
        const y1 = b.y1 + h * 0.83, y2 = b.y1 + h * 0.91;
        txt(c, '电场能', lx, y1 + bh / 2, 'left');
        txt(c, '磁场能', lx, y2 + bh / 2, 'left');
        c.save();
        c.globalAlpha = 0.22;
        ln(c, bx0, y1, bx0 + bw, y1); ln(c, bx0, y1 + bh, bx0 + bw, y1 + bh);
        ln(c, bx0, y2, bx0 + bw, y2); ln(c, bx0, y2 + bh, bx0 + bw, y2 + bh);
        c.restore();
        c.save();
        c.globalAlpha = 0.78;
        c.fillStyle = OSC_RED;
        if (bw * Ee > 0.4) c.fillRect(bx0, y1, bw * Ee, bh);
        c.globalAlpha = 0.52;
        c.fillStyle = OSC_BLUE;
        if (bw * Em > 0.4) c.fillRect(bx0, y2, bw * Em, bh);
        c.restore();
      }
    },
  });

/* ---------- 力学 · 斜抛运动分解 ----------
     六项参数沿用原实现：初速度 / 发射角 / 运动进度 / 视图缩放 / 分解模式 / 辅助线。
    运动进度走原生滑块（0% 起点、50% 最高点、100% 落地点），这里不读 animT、也没有自动播放。
    比例固定：像素/米 = 0.75 × 视图缩放，不按轨迹自动拟合，所以改初速度/发射角的变化是真实的。
     （代价是 v₀ 大 + 缩放 3 时轨迹会顶出坐标区，这是要求的「保持固定物理比例」）。 */
  const OBL_RED = '#dc2626', OBL_BLUE = '#0284c7', OBL_GREEN = '#16a34a', OBL_GRAY = '#94a3b8';
  const OBL_V0 = param('b_mech_oblique_v0', { label: '初速度 v₀', min: 10, max: 60, step: 1, def: 35, unit: 'm/s' });
  const OBL_ANG = param('b_mech_oblique_ang', { label: '发射角 θ', min: 10, max: 80, step: 1, def: 45, unit: '°' });
  const OBL_PRG = param('b_mech_oblique_prg', { label: '运动进度', min: 0, max: 100, step: 1, def: 30, unit: '%' });
  const OBL_ZOOM = param('b_mech_oblique_zoom', { label: '视图缩放', min: 0.5, max: 3, step: 0.1, def: 2, unit: '×' });
  const OBL_MODE = param('b_mech_oblique_mode', { label: '分解模式', min: 0, max: 1, step: 1, def: 1, unit: '0正交1斜交' });
  const OBL_AUX = param('b_mech_oblique_aux', { label: '辅助线', min: 0, max: 1, step: 1, def: 1, unit: '0隐藏1显示' });

  reg({
    key: 'b_mech_oblique', cat: 'mech', label: '斜抛运动分解',
    icon: '<path d="M2 21h20"/><path d="M3 21Q12 2 21 21"/>',
    params: [OBL_V0, OBL_ANG, OBL_PRG, OBL_ZOOM, OBL_MODE, OBL_AUX],
    draw(c, o, GH) {
      const b = GH.box(o);
      const w = b.w, h = b.h;
      if (!(w > 24) || !(h > 24)) return;

      const pick = (v, d) => (v == null ? d : +v);
      const G = 10;
      const v0 = Math.max(1, pick(o.b_mech_oblique_v0, 35));
      const ang = Math.min(89, Math.max(1, pick(o.b_mech_oblique_ang, 45)));
      const prog = Math.min(100, Math.max(0, pick(o.b_mech_oblique_prg, 30)));
      const zoom = Math.max(0.2, pick(o.b_mech_oblique_zoom, 2));
      const mode = pick(o.b_mech_oblique_mode, 1) >= 0.5 ? 1 : 0;
      const aux = pick(o.b_mech_oblique_aux, 1) >= 0.5;
      const TEXT = inkOf(null);
      const RED = OBL_RED, BLUE = OBL_BLUE, GREEN = OBL_GREEN, GRAY = OBL_GRAY;

      // 参考画布 540×335（原实现的坐标就是照它摆的），等比缩放进用户框
      const ls = Math.min(w / 540, h / 335);
      const ox = b.x1 + 48 * ls, oy = b.y2 - 45 * ls;        // 原点
      const axR = b.x1 + 519 * ls, axT = b.y1 + 18 * ls;     // 轴端
      const k = 1.3 * zoom * ls;                              // 像素 / 米
      const X = (v) => ox + v * k, Y = (v) => oy - v * k;

      const rad = ang * Math.PI / 180;
      const vx = v0 * Math.cos(rad), vy0 = v0 * Math.sin(rad);
      const T = 2 * vy0 / G, t = T * prog / 100;
      const vy = vy0 - G * t;
      const R = vx * T, H = vy0 * vy0 / (2 * G);
      const xm = vx * t, ym = vy0 * t - 0.5 * G * t * t, sy = vy0 * t;
      const px = X(xm), py = Y(ym), psy = Y(sy);
      const fs = Math.max(10, Math.min(13, 13 * ls));
      const thin = Math.max(1, o.size * 0.6);

      // 字体照原稿：物理量 Cambria Math 斜体（'i'），下标里的数字正体（'r'），读数走 system-ui 正体
      const lb = (s, x, y, size, align, col, opt) => {
        c.save();
        c.fillStyle = col || TEXT;
        c.textAlign = align || 'left';
        c.textBaseline = 'middle';
        const sz = size || fs;
        c.font = opt === 'i' ? 'italic ' + sz + 'px ' + MATH_FONT
          : opt === 'r' ? sz + 'px ' + MATH_FONT
            : sz + 'px system-ui, "Microsoft YaHei", sans-serif';
        c.fillText(String(s), x, y);
        c.restore();
      };
      // 带下标的物理量：v₀ 这类 unicode 下标在雅黑里会缺字，手动摆小字更稳。
      const sub = (m, sb, x, y, size, align, col) => {
        const w1 = mw(c, m, size, true);
        const w2 = mw(c, sb, size * 0.72, false);
        let x0 = x;
        if (align === 'center') x0 = x - (w1 + w2) / 2; else if (align === 'right') x0 = x - w1 - w2;
        lb(m, x0, y, size, 'left', col, 'i');
        lb(sb, x0 + w1 + 0.6, y + size * 0.24, size * 0.72, 'left', col, 'r');
      };
      // ½gt² 的教材印法：1/2 上下分式 + gt²，不许退化成「½gt²」字符串
      const halfGT2 = (x, y, size, col) => {
        const bw = Math.max(7, size * 0.6);
        lb('1', x + bw / 2, y - size * 0.56, size * 0.8, 'center', col, 'r');
        lb('2', x + bw / 2, y + size * 0.58, size * 0.8, 'center', col, 'r');
        c.save();
        c.strokeStyle = col; c.lineWidth = Math.max(1, o.size * 0.5);
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + bw, y); c.stroke();
        c.restore();
        const x2 = x + bw + size * 0.22;
        lb('gt', x2, y + size * 0.06, size, 'left', col, 'i');
        lb('2', x2 + mw(c, 'gt', size, true), y - size * 0.3, size * 0.7, 'left', col, 'r');
      };
      // 原稿的 v₀t 写法：v 斜体 + 0 正体小一号 + t 斜体（雅黑缺下标字形，不许写 v₀t 字符串）
      const v0t = (x, y, size, align, col) => {
        const w1 = mw(c, 'v', size, true), w0 = mw(c, '0', size * 0.7, false), w2 = mw(c, 't', size, true);
        let x0 = x;
        if (align === 'center') x0 = x - (w1 + w0 + w2) / 2; else if (align === 'right') x0 = x - w1 - w0 - w2;
        lb('v', x0, y, size, 'left', col, 'i');
        lb('0', x0 + w1, y + size * 0.2, size * 0.7, 'left', col, 'r');
        lb('t', x0 + w1 + w0, y, size, 'left', col, 'i');
      };
      // 轴端用项目统一的 GH.head（头长 12px）；速度/位移箭头短，头长按杆长比例缩，否则头比杆还长
      const head = (x1, y1, x2, y2, small) => {
        if (!small) { GH.head(c, x1, y1, x2, y2, o.size); return; }
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const hl = Math.max(4, Math.min(10 * ls, len * 0.32));
        const ang = Math.atan2(y2 - y1, x2 - x1), sp = 0.42;
        c.beginPath();
        c.moveTo(x2, y2); c.lineTo(x2 - hl * Math.cos(ang - sp), y2 - hl * Math.sin(ang - sp));
        c.moveTo(x2, y2); c.lineTo(x2 - hl * Math.cos(ang + sp), y2 - hl * Math.sin(ang + sp));
        c.stroke();
      };

      c.save();
      c.beginPath(); c.rect(b.x1, b.y1, w, h); c.clip();

      // 坐标轴
      ln(c, ox, oy, axR, oy);
      ln(c, ox, oy, ox, axT);
      head(axR - 16 * ls, oy, axR, oy);
      head(ox, axT + 16 * ls, ox, axT);
      lb('O', ox - 7 * ls, oy + 15 * ls, 15, 'right', null, 'i');
      lb('x', axR - 4 * ls, oy + 16 * ls, 15, 'right', null, 'i');
      lb('y', ox + 12 * ls, axT + 13 * ls, 15, 'left', null, 'i');

      // 抛物线：整条灰色虚线 + 已经飞过的一段红色实线，都裁到坐标区里
      c.save();
      c.beginPath(); c.rect(ox, axT, Math.max(1, axR - ox), Math.max(1, oy - axT)); c.clip();
      const NP = 90;
      c.save();
      c.setLineDash([6 * ls, 5 * ls]); c.lineWidth = thin; c.strokeStyle = GRAY;
      c.beginPath();
      for (let i = 0; i <= NP; i++) {
        const u = T * i / NP;
        const xx = X(vx * u), yy = Y(vy0 * u - 0.5 * G * u * u);
        if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy);
      }
      c.stroke();
      c.restore();
      if (prog > 0) {
        const M = Math.max(2, Math.ceil(NP * prog / 100));
        c.save();
        c.lineWidth = o.size * 1.05; c.strokeStyle = RED;
        c.beginPath();
        for (let i = 0; i <= M; i++) {
          const u = t * i / M;
          const xx = X(vx * u), yy = Y(vy0 * u - 0.5 * G * u * u);
          if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy);
        }
        c.stroke();
        c.restore();
      }
      c.restore();

      if (mode === 0) {
        // 正交分解：瞬时速度的两个分量 + 合速度
        const vs = 2.6 * ls;
        // 速度分量：vy 是「向上为正」的分量，画布 y 轴朝下，箭头纵坐标要取负。
        // 否则合速度箭头会被镜像到轨迹下方，看着就不是切线了
        const dx = vx * vs, dy = -vy * vs;
        c.save();
        c.strokeStyle = BLUE;
        ln(c, px, py, px + dx, py);
        head(px, py, px + dx, py, true);
        if (Math.abs(dy) > 4 * ls) {
          c.strokeStyle = GREEN;
          ln(c, px, py, px, py + dy);
          head(px, py, px, py + dy, true);
        }
        c.strokeStyle = RED;
        ln(c, px, py, px + dx, py + dy);
        head(px, py, px + dx, py + dy, true);
        if (aux) {
          c.strokeStyle = GRAY; c.setLineDash([5 * ls, 4 * ls]); c.lineWidth = thin;
          ln(c, px + dx, py, px + dx, py + dy);
          ln(c, px, py + dy, px + dx, py + dy);
        }
        c.restore();
        sub('v', 'x', px + dx * 0.5, py + 17 * ls, fs, 'center', BLUE);
        if (Math.abs(dy) > 4 * ls) sub('v', 'y', px - 8 * ls, py + dy * 0.5, fs, 'right', GREEN);
        lb('v', px + dx + 6 * ls, py + dy - 5 * ls, fs, 'left', RED, 'i');
      } else {
        // 斜交分解：沿初速度方向的匀速位移 v₀t（蓝），竖直向下的自由落体位移 ½gt²（绿）。
        c.save();
        c.strokeStyle = BLUE;
        ln(c, ox, oy, px, psy);
        head(ox, oy, px, psy, true);
        if (py - psy > 4 * ls) {
          c.strokeStyle = GREEN;
          ln(c, px, psy, px, py);
          head(px, psy, px, py, true);
        }
        if (aux) {
          c.strokeStyle = GRAY; c.setLineDash([5 * ls, 4 * ls]); c.lineWidth = thin;
          ln(c, ox, oy, px, py);                              // 合位移
        }
        c.restore();
        // 标签落在箭杆外侧（法向），否则蓝字会压在蓝箭上看不清
        const nx = -Math.sin(rad), ny = -Math.cos(rad);
        v0t((ox + px) / 2 + nx * 9 * ls, (oy + psy) / 2 + ny * 9 * ls, fs, 'right', BLUE);
        if (py - psy > 4 * ls) halfGT2(px + 13 * ls, (psy + py) / 2, fs, GREEN);
      }

      // 小球
      c.save();
      c.fillStyle = o.color;
      dot(c, px, py, Math.max(3.2, 5 * ls));
      c.restore();

      // 底部读数
      const ry = oy + 31 * ls, fsr = Math.max(10, Math.min(12, 11 * ls));
      lb('R = ' + R.toFixed(1) + ' m', ox, ry, fsr, 'left');
      lb('H = ' + H.toFixed(1) + ' m', b.x1 + 275 * ls, ry, fsr, 'center');
      lb('T = ' + T.toFixed(1) + ' s', axR, ry, fsr, 'right');

      c.restore();
    },
  });

  /* ---------- 电磁学 · 滑动变阻器 P-R 功率曲线（电源的功率极值） ----------
     原稿是 1100×425 的独立画布，这里保留那套逻辑坐标、按框等比缩放进世界坐标（不 ctx.scale，
     线宽与字号才不会跟着框一起放大）。电路：串联（R₀ 可旁路短接）/ 并联（R₀ 单独一条支路，
     不接入时整条支路移除，绝不用短接电源的办法）。曲线按戴维南等效 Vth / Rth 算。
     滑片拖动：命中与拖动写在文件末尾的 P.projHandles 里，由 input.js 的 selectDown 调用。 */
  const PR_E = param('b_em_powerR_E', { label: '电动势 E', min: 3, max: 24, step: 1, def: 12, unit: 'V' });
  const PR_r = param('b_em_powerR_r', { label: '内阻 r', min: 0.5, max: 5, step: 0.5, def: 2, unit: 'Ω' });
  const PR_R0 = param('b_em_powerR_R0', { label: '定值电阻 R0', min: 1, max: 10, step: 0.5, def: 4, unit: 'Ω' });
  const PR_R = param('b_em_powerR_R', { label: '变阻器 R', min: 0, max: 20, step: 0.1, def: 3, unit: 'Ω' });
  const PR_MODE = param('b_em_powerR_mode', { label: '连接方式', min: 0, max: 1, step: 1, def: 0, unit: '0串联1并联' });
  const PR_INC = param('b_em_powerR_inc', { label: 'R0 接入', min: 0, max: 1, step: 1, def: 1, unit: '0不接入1接入' });
  const PR_SW = param('b_em_powerR_sw', { label: '开关 S', min: 0, max: 1, step: 1, def: 1, unit: '0断开1闭合' });
  const PR_EQ = param('b_em_powerR_eq', { label: '等功率线', min: 0, max: 1, step: 1, def: 1, unit: '0隐藏1显示' });

  const PR_W = 1100, PR_H = 425, PR_RMAX = 20;
  const PR_RED = '#c63838';

  function prNum(o, k, d) { const v = o['b_em_powerR_' + k]; return Number.isFinite(+v) ? +v : d; }

  // 从滑动变阻器 R 两端看进去的戴维南等效：串联 = E/(r+R₀)；并联且接 R₀ = E·R₀/(r+R₀) 与 r‖R₀
  function prModel(o) {
    const E = prNum(o, 'E', 12);
    const r = Math.max(0.001, prNum(o, 'r', 2));
    const R0 = Math.max(0.001, prNum(o, 'R0', 4));
    const R = Math.max(0, Math.min(PR_RMAX, prNum(o, 'R', 3)));
    const parallel = prNum(o, 'mode', 0) >= 0.5;
    const included = prNum(o, 'inc', 1) >= 0.5;
    const closed = prNum(o, 'sw', 1) >= 0.5;
    const equal = prNum(o, 'eq', 1) >= 0.5;
    let Vth, Rth;
    if (!parallel) { Vth = E; Rth = r + (included ? R0 : 0); }
    else if (included) { Vth = E * R0 / (r + R0); Rth = r * R0 / (r + R0); }
    else { Vth = E; Rth = r; }
    const power = (x) => Vth * Vth * x / ((Rth + x) * (Rth + x));
    const pTheory = power(R);
    return {
      E, r, R0, R, parallel, included, closed, equal, Vth, Rth,
      power, peakR: Rth, peakP: power(Rth), pTheory,
      // 开关断开 ⇒ 全部负载没有电流，实际功率必须是 0（曲线仍画理论值，工作点不画）
      pReal: closed ? pTheory : 0,
      otherR: R > 0 ? Rth * Rth / R : null,
    };
  }

  function prFrame(it, W0, H0) {
    const x1 = Math.min(it.x1, it.x2), y1 = Math.min(it.y1, it.y2);
    const w = Math.abs(it.x2 - it.x1), h = Math.abs(it.y2 - it.y1);
    const vw = W0 || PR_W, vh = H0 || PR_H;
    const ls = Math.min(w / vw, h / vh);
    return { x1, y1, w, h, ls, ox: x1 + (w - vw * ls) / 2, oy: y1 + (h - vh * ls) / 2 };
  }

  // 世界坐标 → 逻辑坐标：先绕框中心逆旋转（pb 的 draw 是绕框中心转的），再按版心换算
  // W0/H0 可选：14 张静态电路图各有自己的逻辑画布尺寸，命中/拖动按各自尺寸反变换；
  // 不传时仍是 b_em_* 大图那套 PR_W/PR_H，4 处现有 projHandles 行为不变。
  function prToLogic(it, wx, wy, W0, H0) {
    const f = prFrame(it, W0, H0);
    const cx = (it.x1 + it.x2) / 2, cy = (it.y1 + it.y2) / 2, a = -(it.rot || 0);
    const dx = wx - cx, dy = wy - cy;
    const ux = cx + dx * Math.cos(a) - dy * Math.sin(a);
    const uy = cy + dx * Math.sin(a) + dy * Math.cos(a);
    return { lx: (ux - f.ox) / f.ls, ly: (uy - f.oy) / f.ls, f };
  }

  // 滑片逻辑坐标：接入电阻是滑片到右端那段，所以 R=0 在最右（340）、R=20 在最左（140）
  function prSliderX(R) { return 340 - (Math.max(0, Math.min(PR_RMAX, R)) / PR_RMAX) * 200; }

  P.projHandles = P.projHandles || {};
  // 数值模型也挂出来：验收探针要拿闭合解逐点核对，而不是只看画面像不像
  P.projModel = P.projModel || {};
  P.projModel.b_em_powerR = prModel;
  P.projHandles.b_em_powerR = {
    param: 'b_em_powerR_R',                       // 拖动时同步参数面板里的那一格
    hit(it, wx, wy) {
      const q = prToLogic(it, wx, wy);
      if (!(q.f.ls > 0)) return false;
      const tol = Math.max(18, 14 / q.f.ls);       // 热区按屏幕尺度给，缩得很小时也好抓
      return Math.abs(q.lx - prSliderX(prNum(it, 'R', 3))) <= tol && q.ly >= 40 && q.ly <= 140;
    },
    drag(it, wx, wy) {
      const q = prToLogic(it, wx, wy);
      if (!(q.f.ls > 0)) return false;
      const next = Math.round(Math.max(0, Math.min(PR_RMAX, (340 - q.lx) / 10)) * 10) / 10;
      if (next === it.b_em_powerR_R) return false;
      it.b_em_powerR_R = next;
      return true;
    },
  };

  reg({
    key: 'b_em_powerR', cat: 'emlab', label: '滑动变阻器 P-R 功率曲线',
    icon: '<path d="M2 12h5m10 0h5M7 9h10v6H7z"/><path d="M12 2v7m-3-3 3 3 3-3"/>',
    params: [PR_E, PR_r, PR_R0, PR_R, PR_MODE, PR_INC, PR_SW, PR_EQ],
    draw(c, o, GH) {
      const m = prModel(o);
      const f = prFrame(o);
      if (!(f.ls > 0.02)) return;
      const ls = f.ls;
      const X = (x) => f.ox + x * ls, Y = (y) => f.oy + y * ls;
      const FT = (k) => Math.max(8.5, Math.min(14, (k || 22) * ls));
      const lb = (s, x, y, size, align, col) => {
        c.save();
        c.fillStyle = col || inkOf('#1b2433');
        c.textAlign = align || 'center';
        c.textBaseline = 'middle';
        // 原稿《电源的功率极值》全篇就是 Times 斜体，这里照搬，不换字体
        c.font = 'italic ' + size + 'px "Times New Roman", serif';
        c.fillText(String(s), x, y);
        c.restore();
      };
      // 逻辑坐标的画笔：T/PL/RC/D 都吃原稿的坐标，落到画布上是世界坐标
      const T = (s, x, y, k, align, col) => lb(s, X(x), Y(y + (k || 22) * 0.18), FT(k), align, col);
      // 雅黑没有下标字形（Pₘ 会显示成半截方块），下标一律手摆小一号的字
      const SUBT = (main, sb, x, y, k, align, col) => {
        const sz = FT(k), s2 = sz * 0.62;
        const wm = mw(c, main, sz, true);
        const w2 = mw(c, sb, s2, true);
        let x0 = X(x);
        if (align === 'center') x0 -= (wm + w2) / 2;
        else if (align === 'right') x0 -= wm + w2;
        const wy = Y(y + (k || 22) * 0.18);
        lb(main, x0, wy, sz, 'left', col);
        lb(sb, x0 + wm, wy + sz * 0.3, s2, 'left', col);
      };
      const PL = (pts, close) => poly(c, pts.map((p) => [X(p[0]), Y(p[1])]), close);
      const L = (x1, y1, x2, y2) => ln(c, X(x1), Y(y1), X(x2), Y(y2));
      const RC = (x, y, w2, h2) => { c.strokeRect(X(x), Y(y), w2 * ls, h2 * ls); };
      const D = (x1, y1, x2, y2, col) => {
        c.save();
        c.strokeStyle = col || o.color;
        c.lineWidth = Math.max(1, o.size * 0.5);
        c.setLineDash([6 * ls, 5 * ls]);
        L(x1, y1, x2, y2);
        c.restore();
      };
      const V = null;                              // 尖头一律用 PL 摆 V 形，这里不留函数

      c.save();
      c.beginPath(); c.rect(f.x1, f.y1, f.w, f.h); c.clip();
      c.lineCap = 'round'; c.lineJoin = 'round';

      const sx = prSliderX(m.R);

      /* --- 变阻器本体 --- */
      RC(140, 123, 200, 34);
      // 滑片：一条连续路径（竖直段 → 上方水平段 → 落到底座上沿），箭头尖端正好落在 123 上
      PL([[45, 140], [45, 45], [sx, 45], [sx, 123]]);
      PL([[sx - 7, 112], [sx, 123], [sx + 7, 112]]);   // 箭头两臂，尖端与导线终点重合
      T('R', 240, 176, 26);

      /* --- 电路 --- */
      const bat = () => { L(160, 319, 160, 350); L(185, 310, 185, 358); T('E, r', 108, 288, 23, 'left'); };
      const sw = () => {
        L(370, 335, m.closed ? 436 : 426, m.closed ? 335 : 307);
        c.save(); c.fillStyle = o.color;
        dot(c, X(370), Y(335), Math.max(2, 4.5 * ls));
        dot(c, X(436), Y(335), Math.max(2, 4.5 * ls));
        c.restore();
        T('S', 403, 316, 22);
      };
      if (m.parallel) {
        // 并联：R 支路与 R₀ 支路接在同一对节点上；不接入 R₀ 时整条支路不画
        L(45, 140, 140, 140); L(340, 140, 535, 140);
        PL([[535, 140], [535, 335], [436, 335]]);
        L(370, 335, 185, 335);
        PL([[160, 335], [45, 335], [45, 140]]);
        if (m.included) {
          PL([[45, 140], [45, 230], [220, 230]]);
          RC(220, 213, 110, 34);
          PL([[330, 230], [535, 230], [535, 140]]);
          SUBT('R', '0', 275, 272, 24, 'center');
        }
      } else {
        // 串联：R₀ 一直在回路里，不接入 = 用导线把它短路（旁路）
        PL([[45, 140], [140, 140]]);
        L(340, 140, 402, 140); L(500, 140, 545, 140);
        PL([[545, 140], [545, 335], [436, 335]]);
        L(370, 335, 185, 335);
        PL([[160, 335], [45, 335], [45, 140]]);
        RC(402, 123, 98, 34);
        SUBT('R', '0', 451, 188, 24, 'center');
        if (!m.included) PL([[402, 140], [402, 78], [500, 78], [500, 140]]);
      }
      bat(); sw();

      /* --- P-R 曲线 --- */
      const ox = 641, oy = 335, cw = 400, ch = 245;
      const xmax = Math.max(24, 4 * m.peakR);         // 横轴范围只看 Rth，拖动滑片时曲线不跳
      const ymax = Math.max(0.001, m.peakP * 1.2);
      const CX = (r) => ox + cw * r / xmax, CY = (p) => oy - ch * p / ymax;
      PL([[ox, 35], [ox, oy], [1060, oy]]);
      PL([[636, 45], [ox, 35], [650, 45]]);
      PL([[1050, 330], [1060, oy], [1050, 340]]);
      T('P/W', ox + 10, 22, 19, 'left');
      T('R/Ω', 1010, 366, 19, 'left');
      T('O', ox - 12, oy + 16, 17, 'right');

      // 理论曲线
      c.beginPath();
      for (let i = 0; i <= 240; i++) {
        const rr = xmax * i / 240;
        const xx = X(CX(rr)), yy = Y(CY(m.power(rr)));
        if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy);
      }
      c.stroke();

      // 峰值辅助线
      const xp = CX(m.peakR), yp = CY(m.peakP);
      D(xp, yp, xp, oy);
      D(ox, yp, xp, yp);
      // 峰值离纵轴太近时不摆这个标签（会压在轴上），底部读数里已经写了 R 的值
      if (xp - ox >= 45) SUBT('R', 'm', xp, oy + 22, 17, 'center');
      SUBT('P', 'm', ox - 8, yp - 6, 17, 'right');

      // 当前工作点
      const xr = CX(m.R), yr = CY(m.pTheory);
      D(xr, yr, xr, oy);
      if (m.closed) {
        c.save(); c.fillStyle = PR_RED;
        dot(c, X(xr), Y(yr), Math.max(2.2, 7 * ls));
        c.restore();
      }
      if (m.equal && m.R > 0) {
        // 等功率水平线：与曲线的两个交点在同一高度（R 与 Rth²/R）
        c.save();
        c.strokeStyle = PR_RED; c.lineWidth = Math.max(1, o.size * 0.55);
        c.setLineDash([8 * ls, 6 * ls]);
        L(ox, yr, ox + cw, yr);
        c.restore();
        // P₁ 放在右端：Pₘ 与 P₁ 的高度常常只差几个像素，两个标签都放左边会叠在一起。
        SUBT('P', '1', ox + cw - 4, yr - 12, 17, 'right');
        const other = m.otherR;
        if (other !== null && other <= xmax) {
          const xo = CX(other);
          D(xo, yr, xo, oy);
          c.save(); c.fillStyle = PR_RED;
          dot(c, X(xo), Y(yr), Math.max(2, 6 * ls));
          c.restore();
        }
      }

      // 底部读数：E 与 r、R₀ 只改变功率的数值，不写数字的话调完看不出变化
      const ry = 408;
      T('R = ' + m.R.toFixed(1) + ' Ω', 45, ry, 19, 'left');
      T('P = ' + m.pReal.toFixed(1) + ' W', 400, ry, 19, 'center');
      T('最大功率 ' + m.peakP.toFixed(1) + ' W（R = ' + m.peakR.toFixed(1) + ' Ω）', 1060, ry, 19, 'right');

      c.restore();
    },
  });

  /* ---------- 电磁学实验 · 欧姆表原理（欧姆表原理.js） ----------
     原稿是 1060×535 的独立画布：左边欧姆表内部电路 + 红黑表笔 + 待测电阻，
     右上放大刻度盘，右下 I–Rx 曲线。这里保留那套逻辑坐标，按框等比缩放后落到世界坐标。
     刻度按「调零理想状态」标定（R1 = 1000E/Ig − r − Rg），所以拨 R1 指针动、刻度不动。
     「刻度定标」三档讲定标原理：① 电流 I/Ig（表头原刻度，均匀）② 电阻 Ω（不均匀）
     ③ 中值倍数 R/R中（中值刻度加粗标红；依据 I/Ig = R中/(R中+Rx)，R中 = 1000E/Ig）。 */
  const OH_E = param('b_em_ohmmeter_E', { label: '电动势 E', min: 1, max: 6, step: 0.5, def: 3, unit: 'V' });
  const OH_r = param('b_em_ohmmeter_r', { label: '内阻 r', min: 0.5, max: 5, step: 0.5, def: 1, unit: 'Ω' });
  const OH_Rg = param('b_em_ohmmeter_Rg', { label: '表头 Rg', min: 50, max: 300, step: 10, def: 100, unit: 'Ω' });
  const OH_R1 = param('b_em_ohmmeter_R1', { label: '调零 R1', min: 0, max: 600, step: 1, def: 199, unit: 'Ω' });
  const OH_Rx = param('b_em_ohmmeter_Rx', { label: '待测 Rx', min: 0, max: 3000, step: 10, def: 300, unit: 'Ω' });
  const OH_Ig = param('b_em_ohmmeter_Ig', { label: '满偏 Ig', min: 5, max: 15, step: 5, def: 10, unit: 'mA' });
  const OH_MODE = param('b_em_ohmmeter_mode', {
    label: '表笔', min: 0, max: 2, step: 1, def: 0, unit: '',
    hint: [{ label: '测 Rx', value: 0 }, { label: '短接', value: 1 }, { label: '断开', value: 2 }],
  });
  const OH_CURVE = param('b_em_ohmmeter_curve', { label: 'I-Rx 曲线', min: 0, max: 1, step: 1, def: 1, unit: '0隐藏1显示' });
  // 刻度定标：同一根指针、同一组角位置，只换读数口径 —— 讲「电流表怎么变成欧姆表」
  const OH_SCALE = param('b_em_ohmmeter_scale', {
    label: '刻度定标', min: 0, max: 2, step: 1, def: 1, unit: '',
    hint: [{ label: '电流 I/Ig', value: 0 }, { label: '电阻 Ω', value: 1 }, { label: '倍数 R/R中', value: 2 }],
  });

  const OH_W = 1060, OH_H = 535;
  const OH_RED = '#e94e66', OH_DIAL = '#d23d43';
  const ohClamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function ohNum(o, k, d) { const v = o['b_em_ohmmeter_' + k]; return Number.isFinite(+v) ? +v : d; }

  function ohmModel(o) {
    const E = ohNum(o, 'E', 3), r = Math.max(0.1, ohNum(o, 'r', 1));
    const Rg = Math.max(1, ohNum(o, 'Rg', 100)), R1 = ohClamp(ohNum(o, 'R1', 199), 0, 600);
    const Rx0 = Math.max(0, ohNum(o, 'Rx', 300)), Ig = Math.max(1, ohNum(o, 'Ig', 10));
    const mode = Math.round(ohClamp(ohNum(o, 'mode', 0), 0, 2));
    const R0 = r + Rg + R1;
    const Rx = mode === 2 ? Infinity : mode === 1 ? 0 : Rx0;
    const I = Number.isFinite(Rx) ? 1000 * E / (R0 + Rx) : 0;      // mA
    const frac = ohClamp(I / Ig, 0, 1);
    const targetR1 = 1000 * E / Ig - r - Rg;                        // 调零需要的 R1
    const calR1 = ohClamp(targetR1, 0, 600);
    const calR0 = Math.max(1, r + Rg + calR1);                      // 刻度参考的总内阻
    return {
      E, r, Rg, R1, Ig, mode, R0, Rx, I, frac, targetR1, calR0,
      canZero: targetR1 >= 0 && targetR1 <= 600,
      zeroed: Math.abs(R1 - calR1) < 0.5,
      overloaded: I > Ig + 1e-9,
    };
  }

  function ohmFrame(o) {
    const x1 = Math.min(o.x1, o.x2), y1 = Math.min(o.y1, o.y2);
    const w = Math.abs(o.x2 - o.x1), h = Math.abs(o.y2 - o.y1);
    const ls = Math.min(w / OH_W, h / OH_H);
    return { ls, ox: x1 + (w - OH_W * ls) / 2, oy: y1 + (h - OH_H * ls) / 2 };
  }

  // 世界坐标 → 逻辑坐标（pb 的 draw 绕框中心旋转，命中要反着转回去）
  function ohToLogic(it, wx, wy) {
    const f = ohmFrame(it);
    const cx = (it.x1 + it.x2) / 2, cy = (it.y1 + it.y2) / 2, a = -(it.rot || 0);
    const dx = wx - cx, dy = wy - cy;
    const ux = cx + dx * Math.cos(a) - dy * Math.sin(a);
    const uy = cy + dx * Math.sin(a) + dy * Math.cos(a);
    return { lx: (ux - f.ox) / f.ls, ly: (uy - f.oy) / f.ls, f };
  }

  // R1 竖直电阻上的滑片纵坐标（R1 越大，滑片越靠上，接入长度越短）
  function ohWiperY(R1) { return 170 + 82 * (1 - ohClamp(R1 / 600, 0, 1)); }

  P.projModel.b_em_ohmmeter = ohmModel;

  reg({
    key: 'b_em_ohmmeter', cat: 'emlab', label: '欧姆表原理',
    icon: '<path d="M3 18a9 9 0 1 1 18 0"/><path d="M12 18l4.5-6"/><path d="M4 21h16"/>',
    params: [OH_E, OH_r, OH_Rg, OH_R1, OH_Rx, OH_Ig, OH_MODE, OH_CURVE, OH_SCALE],
    draw(c, o, GH) {
      const m = ohmModel(o);
      const f = ohmFrame(o);
      if (!(f.ls > 0.02)) return;
      const ls = f.ls;
      const X = (x) => f.ox + x * ls, Y = (y) => f.oy + y * ls;
      const S = (k) => k * ls;
      const FZ = (k) => elFontScale(k, ls);
      const TXT = inkOf(o.color || '#252525');
      const MUT = inkOf('#8f8f8f');
      const CRED = inkOf(OH_RED), CDIAL = inkOf(OH_DIAL);
      const th = Math.max(1, o.size * 0.62), thin = Math.max(0.8, o.size * 0.34);

      // 折线：不给颜色就跟随 o.color（老师改色时会被统一换掉）
      const LNW = (pts, col, wd, dash) => {
        c.save();
        if (col) c.strokeStyle = col;
        if (wd) c.lineWidth = wd;
        if (dash) c.setLineDash(dash);
        poly(c, pts.map((p) => [X(p[0]), Y(p[1])]));
        c.restore();
      };
      // 带曲线的引线（原稿用它画表笔软线）
      const CAB = (x, y0, y1, col) => {
        c.save();
        c.beginPath();
        c.moveTo(X(x), Y(y0));
        c.bezierCurveTo(X(x + 17), Y(y0 + 23), X(x - 17), Y(y0 + 41), X(x), Y(y0 + 62));
        c.bezierCurveTo(X(x + 16), Y(y0 + 83), X(x - 13), Y(y1 - 16), X(x), Y(y1));
        c.strokeStyle = col; c.lineWidth = Math.max(1, 3.2 * ls); c.lineCap = 'round';
        c.stroke();
        c.restore();
      };
      const RCW = (x, y, w2, h2, col, fill) => {
        c.save();
        if (fill) { c.fillStyle = fill; c.fillRect(X(x), Y(y), S(w2), S(h2)); }
        if (col) c.strokeStyle = col;
        c.lineWidth = th;
        c.strokeRect(X(x), Y(y), S(w2), S(h2));
        c.restore();
      };
      const CIR = (x, y, r, col, fill) => {
        c.save();
        if (fill) { c.fillStyle = fill; dot(c, X(x), Y(y), S(r)); }
        c.beginPath(); c.arc(X(x), Y(y), Math.max(0.5, S(r)), 0, Math.PI * 2);
        if (col) c.strokeStyle = col;
        c.lineWidth = th; c.stroke();
        c.restore();
      };
      // 原稿的 label()：Georgia 斜体；表盘刻度数字用 Arial 正体
      const TX = (s, x, y, size, align, col, upright) => {
        c.save();
        c.fillStyle = col || TXT;
        c.textAlign = align || 'left';
        c.textBaseline = 'alphabetic';
        c.font = (upright ? '' : 'italic ') + FZ(size).toFixed(1) + 'px ' +
          (upright ? 'Arial, sans-serif' : 'Georgia, "Times New Roman", serif');
        c.fillText(String(s), X(x), Y(y));
        c.restore();
      };
      // 无转轴圆点的指针（原稿 arrowNeedle；画布 y 朝下，方向按「向上为正」换算）
      const NEEDLE = (cx, cy, frac2, len, col, wd) => {
        const a = Math.PI * (1 - frac2);
        const ux = Math.cos(a), uy = Math.sin(a);
        const tipX = cx + ux * len, tipY = cy - uy * len;
        const tx = cx - ux * 12 * ls, ty = cy + uy * 12 * ls;
        c.save();
        c.strokeStyle = col; c.lineWidth = wd || th; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(tx, ty); c.lineTo(tipX, tipY); c.stroke();
        const back = 8 * ls, wing = 5 * ls;
        c.beginPath();
        c.moveTo(tipX - back * ux + wing * uy, tipY + back * uy + wing * ux);
        c.lineTo(tipX, tipY);
        c.lineTo(tipX - back * ux - wing * uy, tipY + back * uy - wing * ux);
        c.stroke();
        c.restore();
      };

      c.save();
      c.beginPath(); c.rect(o.x1, o.y1, o.x2 - o.x1, o.y2 - o.y1); c.clip();

      const wy = ohWiperY(m.R1);

      // 仪表内部区域：虚线框 + 一层极淡的底（跟随墨色，深底浅底都不突兀）
      c.save();
      c.setLineDash([S(7), S(6)]);
      c.fillStyle = GH.tint(o.color || '#1b2433', 0.08);
      c.fillRect(X(16), Y(18), S(510), S(306));
      c.strokeStyle = TXT; c.lineWidth = thin;
      c.strokeRect(X(16), Y(18), S(510), S(306));
      c.restore();

      // 电源、表头、调零电阻的走线
      LNW([[60, 165], [60, 77], [247, 77]]);
      LNW([[259, 77], [474, 77], [474, wy], [433, wy]]);
      LNW([[60, 213], [60, 278], [195, 278]]);
      LNW([[331, 278], [420, 278], [420, 252]]);
      // 电池：长板为 +、短板为 −。+ 在右（经 R1 → 右接线柱 → 黑表笔），
      // − 在左（经表头 → 左接线柱 → 红表笔）—— 欧姆表内部电源极性就是这样：红表笔接负极。
      LNW([[247, 62], [247, 94]]);
      LNW([[259, 56], [259, 99]]);
      CIR(60, 189, 24);
      NEEDLE(X(60), Y(189), m.frac, S(19));
      // 调零电阻 R1（竖直）+ 滑片
      RCW(407, 170, 26, 82);
      LNW([[444, wy - 7], [433, wy], [444, wy + 7]]);

      TX('E', 230, 45, 23);
      TX('r', 275, 45, 23);
      TX('Rg', 98, 197, 23);
      TX('R1', 450, 259, 23);

      // 两个接线柱
      CIR(195, 278, 5, TXT, '#ffffff');
      CIR(331, 278, 5, TXT, '#ffffff');

      // 红黑软导线 + 表笔握柄
      CAB(195, 283, 391, CRED);
      CAB(331, 283, 391, TXT);
      c.save();
      c.fillStyle = CRED; c.fillRect(X(189), Y(389), S(12), S(31));
      c.fillStyle = TXT; c.fillRect(X(325), Y(389), S(12), S(31));
      c.restore();

      if (m.mode === 0) {
        LNW([[195, 420], [195, 441], [228, 441]], CRED, Math.max(1, 2.5 * ls));
        LNW([[331, 420], [331, 441], [310, 441]], TXT, Math.max(1, 2.5 * ls));
        RCW(228, 426, 82, 30);
        TX('Rx', 269, 492, 25, 'center');
      } else if (m.mode === 1) {
        LNW([[195, 420], [195, 440], [331, 440], [331, 420]]);
        TX('表笔短接', 263, 480, 18, 'center');
      } else {
        LNW([[195, 420], [195, 440], [233, 440]], CRED);
        LNW([[331, 420], [331, 440], [295, 440]], TXT);
        TX('表笔断开', 263, 480, 18, 'center');
      }

      // ---- 右上：放大刻度盘 ----
      const dcx = 808, dcy = 218, dr = 174;
      c.save();
      c.beginPath(); c.arc(X(dcx), Y(dcy), S(dr), Math.PI, 0); c.stroke();
      c.restore();
      // 同一根指针、同一组角位置，三种定标口径（讲定标原理就是在这三者之间换算）：
      //   ① 电流 I/Ig —— 表头原本的均匀刻度，满偏 Ig 对应指针最右；
      //   ② 电阻 Ω   —— 串上内阻后 I/Ig = R中/(R中+Rx)，刻度立刻变得不均匀；
      //   ③ 中值倍数 —— 用「多少倍中值电阻」读数，Rx = R中 处指针正好居中（半偏）。
      const scale = Math.round(ohClamp(ohNum(o, 'scale', 1), 0, 2));
      const Rmid = Math.max(1, m.calR0);                       // 中值电阻 = 调零后的总内阻
      const frOf = (rv) => (Number.isFinite(rv) ? ohClamp(Rmid / (Rmid + rv), 0, 1) : 0);
      let marks;
      if (scale === 0) {
        marks = [];
        for (let i = 0; i <= 10; i++) marks.push({ fr: i / 10, lab: i === 0 ? '0' : (i / 10).toFixed(1), mid: 0 });
      } else if (scale === 1) {
        marks = [Infinity, 3000, 1500, 1000, 600, 400, 300, 200, 100, 50, 0].map((rv) => ({
          fr: frOf(rv), lab: Number.isFinite(rv) ? String(rv) : '∞', mid: 0,
        }));
      } else {
        marks = [Infinity, 10, 5, 3, 2, 1, 0.5, 0.2, 0.1, 0].map((x2) => ({
          fr: Number.isFinite(x2) ? 1 / (1 + x2) : 0, lab: Number.isFinite(x2) ? String(x2) : '∞', mid: x2 === 1 ? 1 : 0,
        }));
      }
      for (let i = 0; i < marks.length; i++) {
        const mk = marks[i];
        const a2 = Math.PI * (1 - mk.fr);
        const ux2 = Math.cos(a2), uy2 = Math.sin(a2);      // uy2 向上为正
        const acc = mk.mid === 1;                          // 中值刻度：加长 + 强调色
        LNW([[dcx + (acc ? 149 : 157) * ux2, dcy - (acc ? 149 : 157) * uy2],
             [dcx + (acc ? 176 : 173) * ux2, dcy - (acc ? 176 : 173) * uy2]], acc ? CDIAL : TXT, acc ? th : thin, null);
        TX(mk.lab, dcx + 194 * ux2, dcy - 194 * uy2 + 5, acc ? 16 : 14, 'center', acc ? CDIAL : TXT, true);
      }
      // 指针与中心圆点
      const a3 = Math.PI * (1 - m.frac);
      LNW([[dcx, dcy], [dcx + 155 * Math.cos(a3), dcy - 155 * Math.sin(a3)]], CDIAL, Math.max(1.2, 3.7 * ls));
      c.save(); c.fillStyle = CDIAL; dot(c, X(dcx), Y(dcy), Math.max(1.5, 6 * ls)); c.restore();
      TX(scale === 0 ? 'I/Ig' : scale === 2 ? 'R/R中' : 'Ω', dcx, 257, scale === 0 ? 21 : 24, 'center');
      // 倍数档副标题直接给换算依据（一行放得下，不压表盘圆弧也不压 I–Rx 曲线）
      TX(scale === 2 ? 'I/Ig = R中/(R中+Rx)，R中 = ' + Rmid.toFixed(0) + ' Ω'
        : scale === 0 ? '表头原本是均匀的电流刻度'
        : '欧姆表放大刻度盘', dcx, 286, 15, 'center', MUT, true);

      // ---- 右下：I–Rx 曲线 ----
      if (ohNum(o, 'curve', 1) >= 0.5) {
        const left = 596, bottom = 464, cw = 416, chh = 132, maxRx = 3000;
        const maxI = 1000 * m.E / m.R0;
        LNW([[left, bottom - 152], [left, bottom], [left + 440, bottom]]);
        TX('I', 594, 301, 19);
        TX('Rx', 997, 498, 19);
        c.save();
        c.beginPath();
        for (let i = 0; i <= 200; i++) {
          const rx = maxRx * i / 200;
          const cur = 1000 * m.E / (m.R0 + rx);
          const xx = X(left + cw * rx / maxRx), yy = Y(bottom - chh * cur / maxI);
          if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy);
        }
        c.lineWidth = th; c.stroke();
        c.restore();
        if (Number.isFinite(m.Rx) && m.Rx <= maxRx && maxI > 0) {
          const xx = X(left + cw * m.Rx / maxRx), yy = Y(bottom - chh * m.I / maxI);
          c.save();
          c.strokeStyle = CDIAL; c.lineWidth = Math.max(0.9, 1.4 * ls); c.setLineDash([S(5), S(5)]);
          ln(c, xx, yy, xx, Y(bottom));
          ln(c, X(left), yy, xx, yy);
          c.restore();
          c.save(); c.fillStyle = CDIAL; dot(c, xx, yy, Math.max(1.6, 5.5 * ls)); c.restore();
        }
      }

      // 读数：调零是否到位 / 电流（原稿没有，但老师上课要能一眼看出「还差多少」）
      const ry = 518;
      TX('I = ' + m.I.toFixed(2) + ' mA', 40, ry, 20, 'left', TXT, true);
      TX('R1 = ' + m.R1.toFixed(0) + ' Ω', 300, ry, 20, 'left', TXT, true);
      // 定标换算的中间量：同一指针偏转 = I/Ig = R中/(R中+Rx)
      TX('I/Ig = ' + m.frac.toFixed(2), 500, ry, 20, 'left', TXT, true);
      TX(m.zeroed ? '已调零' : (m.canZero ? '未调零（R1 → ' + m.targetR1.toFixed(0) + ' Ω）' : '调零电阻不够'),
        700, ry, 20, 'left', m.zeroed ? TXT : CDIAL, true);

      c.restore();
    },
  });

  P.projHandles.b_em_ohmmeter = {
    param: 'b_em_ohmmeter_R1',
    hit(it, wx, wy) {
      const q = ohToLogic(it, wx, wy);
      if (!(q.f.ls > 0)) return false;
      const tol = Math.max(18, 14 / q.f.ls);
      return Math.abs(q.lx - 433) <= tol && Math.abs(q.ly - ohWiperY(ohNum(it, 'R1', 199))) <= tol;
    },
    drag(it, wx, wy) {
      const q = ohToLogic(it, wx, wy);
      if (!(q.f.ls > 0)) return false;
      const next = Math.round(600 * (1 - ohClamp((q.ly - 170) / 82, 0, 1)));
      if (next === it.b_em_ohmmeter_R1) return false;
      it.b_em_ohmmeter_R1 = next;
      return true;
    },
  };

  /* ---------- 电磁学实验 · 伏安法测电动势和内阻（测电动势和内阻.js） ----------
     原稿 960×420：左边甲/乙实验电路（带可拖滑片），右边真实 U-I 直线与测量 U-I 直线。
     甲（电流表外接）：E测 = E·RV/(RV+r)、r测 = r·RV/(RV+r)；
     乙（电流表内接）：E测 = E、r测 = r+RA。图像量程固定 7V/7A，方便看整条线平移。 */
  const EF_E = param('b_em_emfInternal_E', { label: '电动势 E', min: 1, max: 6, step: 0.1, def: 6, unit: 'V' });
  const EF_r = param('b_em_emfInternal_r', { label: '内阻 r', min: 0.1, max: 3, step: 0.1, def: 1, unit: 'Ω' });
  const EF_R = param('b_em_emfInternal_R', { label: '滑动变阻器 R', min: 1, max: 20, step: 0.1, def: 5, unit: 'Ω' });
  const EF_RA = param('b_em_emfInternal_RA', { label: '电流表 RA', min: 0.01, max: 2, step: 0.01, def: 0.2, unit: 'Ω' });
  const EF_RV = param('b_em_emfInternal_RV', { label: '电压表 RV', min: 5, max: 200, step: 1, def: 20, unit: 'Ω' });
  const EF_MODE = param('b_em_emfInternal_mode', { label: '接法', min: 0, max: 1, step: 1, def: 0, unit: '0甲(外接)1乙(内接)' });
  const EF_SW = param('b_em_emfInternal_sw', { label: '开关 S', min: 0, max: 1, step: 1, def: 1, unit: '0断开1闭合' });
  const EF_TRUE = param('b_em_emfInternal_true', { label: '真实 U-I 线', min: 0, max: 1, step: 1, def: 1, unit: '0隐藏1显示' });
  const EF_MEAS = param('b_em_emfInternal_meas', { label: '测量 U-I 线', min: 0, max: 1, step: 1, def: 1, unit: '0隐藏1显示' });

  const EF_W = 960, EF_H = 420;
  const EF_INK = '#25313e', EF_GREEN = '#298e68', EF_ORANGE = '#d99030', EF_BOX = '#d9eff8';

  function efNum(o, k, d) { const v = o['b_em_emfInternal_' + k]; return Number.isFinite(+v) ? +v : d; }

  function emfModel(o) {
    const E = Math.max(0.1, efNum(o, 'E', 6)), r = Math.max(0.01, efNum(o, 'r', 1));
    const R = Math.max(0.1, efNum(o, 'R', 5)), RA = Math.max(0, efNum(o, 'RA', 0.2));
    const RV = Math.max(0.1, efNum(o, 'RV', 20));
    const outer = Math.round(efNum(o, 'mode', 0)) === 0;
    const closed = Math.round(efNum(o, 'sw', 1)) === 1;
    const showTrue = Math.round(efNum(o, 'true', 1)) === 1;
    const showMeas = Math.round(efNum(o, 'meas', 1)) === 1;
    const Rp = R * RV / (R + RV);
    const Efit = outer ? E * RV / (RV + r) : E;
    const rfit = outer ? r * RV / (RV + r) : r + RA;
    let I = 0, U = 0;
    if (closed) {
      if (outer) {
        I = E / (R + RA + r * (1 + (R + RA) / RV));
        U = I * (R + RA);
      } else {
        I = E / (r + RA + Rp);
        U = I * Rp;
      }
    } else if (outer) {
      U = E * RV / (RV + r);      // 开关断开时电压表仍跨接电源
    }
    return { E, r, R, RA, RV, outer, closed, showTrue, showMeas, Rp, I, U, Efit, rfit };
  }

  function emfFrame(o) {
    const x1 = Math.min(o.x1, o.x2), y1 = Math.min(o.y1, o.y2);
    const w = Math.abs(o.x2 - o.x1), h = Math.abs(o.y2 - o.y1);
    const ls = Math.min(w / EF_W, h / EF_H);
    return { ls, ox: x1 + (w - EF_W * ls) / 2, oy: y1 + (h - EF_H * ls) / 2 };
  }

  function efToLogic(it, wx, wy) {
    const f = emfFrame(it);
    const cx = (it.x1 + it.x2) / 2, cy = (it.y1 + it.y2) / 2, a = -(it.rot || 0);
    const dx = wx - cx, dy = wy - cy;
    const ux = cx + dx * Math.cos(a) - dy * Math.sin(a);
    const uy = cy + dx * Math.sin(a) + dy * Math.cos(a);
    return { lx: (ux - f.ox) / f.ls, ly: (uy - f.oy) / f.ls, f };
  }

  // 滑片越靠右，接入电阻越小（左端与滑片短接，有效电阻是滑片右侧那段）
  function efWiperX(R) { return 280 - ((ohClamp(R, 1, 20) - 1) / 19) * 100; }

  P.projModel.b_em_emfInternal = emfModel;

  reg({
    key: 'b_em_emfInternal', cat: 'emlab', label: '伏安法测电动势和内阻',
    icon: '<path d="M3 19h18M6 19V9m12 10V9"/><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M9 6h6"/><path d="M4 12h4M16 12h4"/>',
    params: [EF_E, EF_r, EF_R, EF_RA, EF_RV, EF_MODE, EF_SW, EF_TRUE, EF_MEAS],
    draw(c, o, GH) {
      const m = emfModel(o);
      const f = emfFrame(o);
      if (!(f.ls > 0.02)) return;
      const ls = f.ls;
      const X = (x) => f.ox + x * ls, Y = (y) => f.oy + y * ls;
      const S = (k) => k * ls;
      const FZ = (k) => elFontScale(k, ls);
      const INK = inkOf(EF_INK), GREEN = inkOf(EF_GREEN), ORANGE = inkOf(EF_ORANGE);
      const MUT = inkOf('#899aa6');
      const PANEL = inkOf(EF_BOX);
      const PAPER = paperOf();
      const WIRE = Math.max(0.8, o.size * 0.85);

      const W = (pts, col, wd, dash) => {
        c.save();
        c.strokeStyle = col || INK;
        c.lineWidth = wd || WIRE;
        c.lineCap = 'round'; c.lineJoin = 'round';
        if (dash) c.setLineDash(dash);
        poly(c, pts.map((p) => [X(p[0]), Y(p[1])]));
        c.restore();
      };
      // 原稿的 text()：Georgia 衬线，默认居中；图例/标题用无衬线
      const TX = (s, x, y, size, opt) => {
        const t = opt || {};
        c.save();
        c.fillStyle = t.color || INK;
        c.font = (t.italic ? 'italic ' : '') + FZ(size).toFixed(1) + 'px ' + (t.font || 'Georgia, serif');
        c.textAlign = t.align || 'center';
        c.textBaseline = 'alphabetic';
        c.fillText(String(s), X(x), Y(y));
        c.restore();
      };
      const CIRF = (x, y, r, fill) => {
        c.save();
        c.beginPath(); c.arc(X(x), Y(y), Math.max(0.6, S(r)), 0, Math.PI * 2);
        c.fillStyle = fill || PAPER; c.fill();
        c.strokeStyle = INK; c.lineWidth = WIRE; c.stroke();
        c.restore();
      };
      const METER = (letter, x, y) => { CIRF(x, y, 25); TX(letter, x, y + 9, 28); };
      const JUNC = (x, y) => { c.save(); c.fillStyle = INK; dot(c, X(x), Y(y), Math.max(1.2, S(3.5))); c.restore(); };
      const DASH = (pts, col) => W(pts, col || ORANGE, Math.max(0.6, S(1.6)), [S(5), S(5)]);

      c.save();
      c.beginPath(); c.rect(o.x1, o.y1, o.x2 - o.x1, o.y2 - o.y1); c.clip();

      // 标题 + 左右分隔线
      TX('实验电路', 230, 24, 16, { font: 'sans-serif' });
      TX('U–I 图像', 728, 24, 16, { font: 'sans-serif' });
      W([[483, 36], [483, 393]], MUT, 1);

      /* ---- 左：甲 / 乙 实验电路 ---- */
      // 教材虚线框
      c.save();
      c.globalAlpha = 0.22;
      c.fillStyle = PANEL;
      if (m.outer) c.fillRect(X(27), Y(160), S(423), S(196));
      else c.fillRect(X(89), Y(258), S(212), S(98));
      c.restore();
      c.save();
      c.setLineDash([S(7), S(6)]);
      c.strokeStyle = MUT; c.lineWidth = Math.max(0.6, S(1.2));
      if (m.outer) c.strokeRect(X(27), Y(160), S(423), S(196));
      else c.strokeRect(X(89), Y(258), S(212), S(98));
      c.restore();

      // 滑动变阻器：主引线 + 电阻体 + 回接导线 + 滑片
      const sx = efWiperX(m.R);
      W([[54, 82], [180, 82]]);
      W([[280, 82], [448, 82]]);
      c.save();
      c.fillStyle = PAPER;
      c.fillRect(X(180), Y(70), S(100), S(24));
      c.strokeStyle = INK; c.lineWidth = WIRE;
      c.strokeRect(X(180), Y(70), S(100), S(24));
      c.restore();
      W([[160, 82], [160, 33], [sx, 33], [sx, 70]]);
      W([[sx - 7, 60], [sx, 70], [sx + 7, 60]]);
      TX('R', 230, 131, 24, { italic: true });

      // 右侧主导线
      W([[448, 82], [448, 185]]);
      W([[448, 185], [448, 310], [362, 310]]);
      // 电压表支路
      W([[54, 185], [215, 185]]);
      W([[265, 185], [448, 185]]);
      METER('V', 240, 185);

      if (m.outer) {
        W([[54, 82], [54, 107]]);
        METER('A', 54, 132);
        W([[54, 157], [54, 185]]);
        W([[54, 185], [54, 310]]);
        W([[54, 310], [203, 310]]);
      } else {
        W([[54, 82], [54, 185], [54, 310]]);
        W([[54, 310], [96, 310]]);
        METER('A', 121, 310);
        W([[146, 310], [203, 310]]);
      }

      // 电池极板
      W([[203, 288], [203, 332]]);
      W([[219, 296], [219, 324]]);
      W([[219, 310], [294, 310]]);
      TX('E,r', 211, 381, 23, { italic: true });

      // 开关 S
      if (m.closed) {
        W([[294, 310], [362, 310]]);
      } else {
        W([[294, 310], [310, 310]]);
        W([[310, 310], [353, 287]]);
        W([[362, 310], [448, 310]]);
      }
      TX('S', 328, 358, 22, { italic: true });

      JUNC(54, 185);
      JUNC(448, 185);

      /* ---- 右：U–I 图像 ---- */
      const gx0 = 545, gy0 = 350, gx1 = 926, gy1 = 53, maxI = 7, maxU = 7;
      // GX/GY 给的是「逻辑坐标」，最后统一由 X()/Y() 换算成世界坐标（别在这里就换算，会换两次）
      const GX = (I) => gx0 + 360 * I / maxI;
      const GY = (U) => gy0 - 270 * U / maxU;
      W([[gx0, gy1], [gx0, gy0], [gx1, gy0]], INK, Math.max(0.9, o.size * 0.85));
      W([[540, 61], [545, 53], [550, 61]], INK);
      W([[918, 345], [926, 350], [918, 355]], INK);
      TX('U', 520, 51, 21, { italic: true });
      TX('I', 933, 377, 21, { italic: true });
      TX('O', 526, 374, 19, { italic: true });

      c.save();
      c.beginPath(); c.rect(X(545), Y(53), S(375), S(297)); c.clip();
      const line = (a, b2, col) => W([[GX(0), GY(a)], [GX(b2), GY(0)]], col, Math.max(1, o.size * 1.0));
      if (m.showTrue) line(m.E, m.E / m.r, GREEN);
      if (m.showMeas) line(m.Efit, m.Efit / m.rfit, ORANGE);
      if (m.closed && m.showMeas) {
        const px = GX(m.I), py = GY(m.U);
        DASH([[px, py], [px, gy0]]);
        DASH([[gx0, py], [px, py]]);
        c.save(); c.fillStyle = ORANGE; dot(c, X(px), Y(py), Math.max(1.6, S(6))); c.restore();
      }
      c.restore();

      // 图例
      W([[645, 398], [671, 398]], GREEN, Math.max(1, o.size * 1.0));
      TX('真实', 679, 404, 15, { align: 'left', font: 'sans-serif' });
      W([[760, 398], [786, 398]], ORANGE, Math.max(1, o.size * 1.0));
      TX('测量', 794, 404, 15, { align: 'left', font: 'sans-serif' });

      c.restore();
    },
  });

  P.projHandles.b_em_emfInternal = {
    param: 'b_em_emfInternal_R',
    hit(it, wx, wy) {
      const q = efToLogic(it, wx, wy);
      if (!(q.f.ls > 0)) return false;
      const tol = Math.max(18, 14 / q.f.ls);
      return Math.abs(q.lx - efWiperX(efNum(it, 'R', 5))) <= tol && q.ly >= 25 && q.ly <= 86;
    },
    drag(it, wx, wy) {
      const q = efToLogic(it, wx, wy);
      if (!(q.f.ls > 0)) return false;
      const next = Math.round((1 + ohClamp((280 - q.lx) / 100, 0, 1) * 19) * 10) / 10;
      if (next === it.b_em_emfInternal_R) return false;
      it.b_em_emfInternal_R = next;
      return true;
    },
  };

  /* ---------- 电磁学实验 · 伏阻法 / 安阻法测电动势与内阻（伏阻法和安阻法.js） ---------- */
  // 一张图里左边实验电路、右边函数图像，共用一个对象：插入一次只产生一个对象。
  const VR_W = 1000, VR_H = 430;
  const VR_INK = '#252a30', VR_GREEN = '#268b66', VR_ORANGE = '#d59631';
  const VR_MUT = '#858c98', VR_HINT = '#737b86';
  const vrClamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const vrNum = (o, k, d) => {
    const v = o['b_em_emfResist_' + k];
    return typeof v === 'number' && isFinite(v) ? v : d;
  };

  // 1000×430 的逻辑画布等比放进用户框，居中；不 ctx.scale，线宽与字号不跟着变粗
  function vrFrame(o) {
    const w = Math.abs(o.x2 - o.x1), h = Math.abs(o.y2 - o.y1);
    const ls = Math.min(w / VR_W, h / VR_H);
    return { ls, ox: o.x1 + (w - VR_W * ls) / 2, oy: o.y1 + (h - VR_H * ls) / 2 };
  }
  function vrToLogic(it, wx, wy) {
    const f = vrFrame(it);
    const cx = (it.x1 + it.x2) / 2, cy = (it.y1 + it.y2) / 2, a = -(it.rot || 0);
    const dx = wx - cx, dy = wy - cy;
    const ux = cx + dx * Math.cos(a) - dy * Math.sin(a);
    const uy = cy + dx * Math.sin(a) + dy * Math.cos(a);
    return { lx: (ux - f.ox) / f.ls, ly: (uy - f.oy) / f.ls, f };
  }
  // 滑片越靠左，接入电阻越大（左端与滑片短接，有效电阻是滑片左侧那段）
  function vrWiperX(R) { return 335 - ((vrClamp(R, 1, 20) - 1) / 19) * 120; }

  function vrModel(o) {
    const E = vrClamp(vrNum(o, 'E', 6), 1, 6);
    const r = vrClamp(vrNum(o, 'r', 1), 0.1, 3);
    const R = vrClamp(vrNum(o, 'R', 5), 1, 20);
    const mode = vrClamp(Math.round(vrNum(o, 'mode', 0)), 0, 2);
    const closed = vrNum(o, 'sw', 1) >= 0.5;
    const ext = vrNum(o, 'ext', 1) >= 0.5;
    const guide = vrNum(o, 'guide', 1) >= 0.5;
    const I = closed ? E / (R + r) : 0;
    const U = closed ? I * R : 0;
    let a, k, xInt;
    // 伏阻法：1/U = 1/E + (r/E)·(1/R)；安阻法甲：1/I = (1/E)R + r/E；安阻法乙：R = E·(1/I) − r
    if (mode === 0) { a = 1 / E; k = r / E; xInt = -1 / r; }
    else if (mode === 1) { a = r / E; k = 1 / E; xInt = -r; }
    else { a = -r; k = E; xInt = r / E; }
    return { E, r, R, mode, closed, ext, guide, I, U, a, k, xInt };
  }
  P.projModel.b_em_emfResist = vrModel;

  const VR_MODE = param('b_em_emfResist_mode', {
    label: '实验与图像', def: 0, min: 0, max: 2, step: 1, unit: '',
    hint: [{ label: '伏阻法', value: 0 }, { label: '安阻法甲', value: 1 }, { label: '安阻法乙', value: 2 }],
  });
  const VR_E = param('b_em_emfResist_E', { label: '电动势 E', min: 1, max: 6, step: 0.1, def: 6, unit: 'V' });
  const VR_r = param('b_em_emfResist_r', { label: '内阻 r', min: 0.1, max: 3, step: 0.1, def: 1, unit: 'Ω' });
  const VR_R = param('b_em_emfResist_R', { label: '接入电阻 R', min: 1, max: 20, step: 0.1, def: 5, unit: 'Ω' });
  const VR_SW = param('b_em_emfResist_sw', {
    label: '开关 S', def: 1, min: 0, max: 1, step: 1, hint: [{ label: '断开', value: 0 }, { label: '闭合', value: 1 }],
  });
  const VR_EXT = param('b_em_emfResist_ext', {
    label: '截距延长线', def: 1, min: 0, max: 1, step: 1, hint: [{ label: '隐藏', value: 0 }, { label: '显示', value: 1 }],
  });
  const VR_GUIDE = param('b_em_emfResist_guide', {
    label: '测量点辅助线', def: 1, min: 0, max: 1, step: 1, hint: [{ label: '隐藏', value: 0 }, { label: '显示', value: 1 }],
  });

  reg({
    key: 'b_em_emfResist', cat: 'emlab', label: '伏阻法 / 安阻法测电动势',
    icon: '<path d="M3 19h18M5 19V8m14 11V8"/><path d="M9 8h6"/><path d="M5 12h3m8 0h3"/><circle cx="12" cy="15" r="2.2"/><path d="M12 5v3"/>',
    params: [VR_MODE, VR_E, VR_r, VR_R, VR_SW, VR_EXT, VR_GUIDE],
    draw(c, o, GH) {
      const m = vrModel(o);
      const f = vrFrame(o);
      if (!(f.ls > 0.02)) return;
      const ls = f.ls;
      const X = (x) => f.ox + x * ls, Y = (y) => f.oy + y * ls;
      const S = (k) => k * ls;
      const FZ = (k) => elFontScale(k, ls);
      const INK = inkOf(VR_INK), GREEN = inkOf(VR_GREEN), ORANGE = inkOf(VR_ORANGE);
      const MUT = inkOf(VR_MUT), HINT = inkOf(VR_HINT), PAPER = paperOf();
      const WIRE = Math.max(0.8, o.size * 0.85);

      const W = (pts, col, wd, dash) => {
        c.save();
        c.strokeStyle = col || INK;
        c.lineWidth = wd || WIRE;
        c.lineCap = 'round'; c.lineJoin = 'round';
        if (dash) c.setLineDash(dash);
        poly(c, pts.map((p) => [X(p[0]), Y(p[1])]));
        c.restore();
      };
      const TX = (s, x, y, size, opt) => {
        const t = opt || {};
        c.save();
        c.fillStyle = t.color || INK;
        c.font = (t.italic ? 'italic ' : '') + FZ(size).toFixed(1) + 'px ' + (t.font || MATH_FONT);
        c.textAlign = t.align || 'center';
        c.textBaseline = 'middle';
        c.fillText(String(s), X(x), Y(y));
        c.restore();
      };
      const TRI = (pts) => {
        c.save();
        c.beginPath();
        c.moveTo(X(pts[0][0]), Y(pts[0][1]));
        for (let i = 1; i < pts.length; i++) c.lineTo(X(pts[i][0]), Y(pts[i][1]));
        c.closePath(); c.fillStyle = INK; c.fill();
        c.restore();
      };
      const CIR = (x, y, rr) => {
        c.save();
        c.beginPath(); c.arc(X(x), Y(y), Math.max(0.6, S(rr)), 0, Math.PI * 2);
        c.fillStyle = PAPER; c.fill();
        c.strokeStyle = INK; c.lineWidth = WIRE; c.stroke();
        c.restore();
      };
      const JT = (x, y) => { c.save(); c.fillStyle = INK; dot(c, X(x), Y(y), Math.max(1.2, S(3.4))); c.restore(); };
      // 真正的上下分式：字母斜体、数字正体、中间一条分数线
      const FR = (num, den, x, y, kk, neg) => {
        const sz = 21 * kk;
        const it1 = /[A-Za-z]/.test(num), it2 = /[A-Za-z]/.test(den);
        const wn = mw(c, num, FZ(sz), it1), wd = mw(c, den, FZ(sz), it2);
        const wp = Math.max(wn, wd) + 9;
        const cx = X(x), cy = Y(y);
        const put = (t, px, py, ital) => {
          c.save(); c.fillStyle = INK;
          c.font = (ital ? 'italic ' : '') + FZ(sz).toFixed(1) + 'px ' + MATH_FONT;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(String(t), px, py); c.restore();
        };
        if (neg) {
          c.save(); c.fillStyle = INK;
          c.font = FZ(sz).toFixed(1) + 'px ' + MATH_FONT;
          c.textAlign = 'right'; c.textBaseline = 'middle';
          c.fillText('−', cx - wp / 2 - 3, cy); c.restore();
        }
        put(num, cx, cy - S(15 * kk), it1);
        put(den, cx, cy + S(17 * kk), it2);
        c.save(); c.strokeStyle = INK; c.lineWidth = Math.max(0.7, S(1.4));
        c.beginPath(); c.moveTo(cx - wp / 2, cy); c.lineTo(cx + wp / 2, cy); c.stroke(); c.restore();
      };
      const ML = (val, x, y, kk) => {
        if (Array.isArray(val)) { FR(val[0], val[1], x, y, kk, !!val[2]); return; }
        if (val === 'NEG_R') {
          TX('−', x - S(9 * kk) / ls, y, 22 * kk);
          TX('r', x + S(6 * kk) / ls, y, 22 * kk, { italic: true });
          return;
        }
        TX(val, x, y, 23 * kk, { italic: true });
      };

      c.save();
      c.beginPath(); c.rect(o.x1, o.y1, o.x2 - o.x1, o.y2 - o.y1); c.clip();

      // 标题与左右分隔线
      TX('实验电路', 250, 25, 17, { font: 'sans-serif' });
      TX('函数图像', 760, 25, 17, { font: 'sans-serif' });
      W([[508, 38], [508, 393]], MUT, Math.max(0.6, S(1)));

      /* ---- 左：实验电路 ---- */
      const volt = m.mode === 0;
      W([[55, 115], [55, 320], [175, 320]]);
      W([[340, 115], [465, 115]]);
      W([[465, 115], [465, 320], [380, 320]]);
      // 电池：长线正极、短线负极
      W([[175, 291], [175, 349]]);
      W([[195, 300], [195, 340]]);
      TX('E', 171, 375, 24, { italic: true });
      TX(',', 185, 375, 23);
      TX('r', 198, 375, 24, { italic: true });
      // 开关
      W([[195, 320], [312, 320]]);
      JT(312, 320); JT(380, 320);
      if (m.closed) W([[312, 320], [380, 320]]);
      else W([[312, 320], [372, 292]]);
      TX('S', 345, 369, 24);
      if (volt) {
        // 电压表并联在变阻器两端
        W([[55, 115], [210, 115]]);
        W([[55, 210], [215, 210]]);
        W([[265, 210], [465, 210]]);
        CIR(240, 210, 25); TX('V', 240, 211, 29);
        JT(55, 210); JT(465, 210);
      } else {
        // 安阻法：电流表真串联，不允许绕过它
        W([[55, 115], [89, 115]]);
        CIR(114, 115, 25); TX('A', 114, 116, 29);
        W([[139, 115], [210, 115]]);
      }
      // 三端滑片式变阻器：电阻体 + 上方滑片 + 左端折线回接
      const wx = vrWiperX(m.R);
      c.save();
      c.fillStyle = PAPER;
      c.fillRect(X(210), Y(102), S(130), S(26));
      c.strokeStyle = INK; c.lineWidth = WIRE;
      c.strokeRect(X(210), Y(102), S(130), S(26));
      c.restore();
      W([[195, 115], [195, 54], [wx, 54], [wx, 101]]);
      W([[wx - 8, 91], [wx, 101], [wx + 8, 91]]);
      TX('R', 358, 148, 25, { italic: true });
      TX('拖动上方滑片，改变接入电阻', 250, 414, 13, { color: HINT, font: 'sans-serif' });

      /* ---- 右：函数图像 ---- */
      let xMin, xMax, yMin, yMax;
      if (m.mode === 0) {
        xMin = m.xInt * 1.14; xMax = 1.05; yMin = -0.04;
        yMax = Math.max(0.65, m.a + m.k * xMax + 0.12);
      } else if (m.mode === 1) {
        xMin = m.xInt * 1.14; xMax = 22; yMin = -0.35;
        yMax = Math.max(5, m.a + m.k * xMax + 0.8);
      } else {
        xMin = -0.09; xMax = Math.max(1.2, (m.R + m.r) / m.E * 1.2);
        yMin = -m.r * 1.2; yMax = Math.max(8, m.R * 1.25);
      }
      const GL = 575, GT = 58, GR = 946, GB = 337;
      const GX = (t) => GL + (t - xMin) / (xMax - xMin) * (GR - GL);
      const GY = (t) => GB - (t - yMin) / (yMax - yMin) * (GB - GT);
      const ox = GX(0), oy = GY(0);

      // 坐标轴（负半轴只比截距略长）
      const axisL = m.mode === 2 ? ox - 14 : GX(m.xInt) - 14;
      W([[axisL, oy], [GR + 14, oy]]);
      TRI([[GR + 5, oy - 5], [GR + 14, oy], [GR + 5, oy + 5]]);
      const axisB = m.mode === 2 ? GY(-m.r) + 16 : oy + 13;
      W([[ox, axisB], [ox, GT - 15]]);
      TRI([[ox - 5, GT - 6], [ox, GT - 15], [ox + 5, GT - 6]]);

      c.save();
      c.beginPath();
      c.rect(X(GL - 3), Y(GT - 3), S(GR - GL + 6), S(GB - GT + 6));
      c.clip();
      if (m.ext) {
        W([[GX(m.xInt), GY(0)], [GX(0), GY(m.a)]], MUT,
          Math.max(0.7, S(2.2)), [S(7), S(6)]);
      }
      const endX = Math.min(xMax, (yMax - m.a) / m.k);
      W([[GX(0), GY(m.a)], [GX(endX), GY(m.a + m.k * endX)]], GREEN, Math.max(1, S(3.2)));
      if (m.closed) {
        // 断电时不计算 1/0，也不画无穷远的测量点
        const px = m.mode === 0 ? 1 / m.R : m.mode === 1 ? m.R : 1 / m.I;
        const py = m.mode === 0 ? 1 / m.U : m.mode === 1 ? 1 / m.I : m.R;
        if (m.guide) {
          W([[GX(px), GY(py)], [GX(px), oy]], ORANGE, Math.max(0.6, S(1.4)), [S(5), S(5)]);
          W([[ox, GY(py)], [GX(px), GY(py)]], ORANGE, Math.max(0.6, S(1.4)), [S(5), S(5)]);
        }
        c.save(); c.fillStyle = ORANGE;
        dot(c, X(GX(px)), Y(GY(py)), Math.max(1.6, S(6)));
        c.restore();
      }
      c.restore();

      // 截距刻线
      W([[ox - 5, GY(m.a)], [ox + 5, GY(m.a)]], INK, Math.max(0.6, S(1.3)));
      W([[GX(m.xInt), oy - 5], [GX(m.xInt), oy + 5]], INK, Math.max(0.6, S(1.3)));

      // 教材数学符号
      TX('O', ox - 13, oy + 20, 20, { italic: true, align: 'right' });
      const yTitle = m.mode === 0 ? ['1', 'U'] : m.mode === 1 ? ['1', 'I'] : 'R';
      const xTitle = m.mode === 0 ? ['1', 'R'] : m.mode === 1 ? 'R' : ['1', 'I'];
      const yIntLabel = m.mode === 0 ? ['1', 'E'] : m.mode === 1 ? ['r', 'E'] : 'NEG_R';
      const xIntLabel = m.mode === 0 ? ['1', 'r', true] : m.mode === 1 ? 'NEG_R' : ['r', 'E'];
      // 伏阻法的纵轴在框的中间偏右，标题又居中在框顶 —— 这一支要把纵轴标题压到箭头下方，否则两行字叠在一起
  ML(yTitle, ox - 46, m.mode === 0 ? GT + 24 : GT - 8, 0.83);
      ML(xTitle, GR + 7, oy + 28, 0.83);
      // 甲/乙图的原点被挤在左下角，截距标签按模式各自让开，避免和 O 叠在一起
      if (m.mode === 2) {
        ML(yIntLabel, ox - 16, GY(-m.r) + 16, 0.78);
      } else {
        ML(yIntLabel, m.mode === 1 ? ox - 44 : ox - 35, GY(m.a), 0.78);
      }
      ML(xIntLabel, GX(m.xInt), oy + (m.mode === 1 ? 42 : 35), 0.78);

      c.restore();
    },
  });

  P.projHandles.b_em_emfResist = {
    param: 'b_em_emfResist_R',
    hit(it, wx, wy) {
      const q = vrToLogic(it, wx, wy);
      if (!(q.f.ls > 0)) return false;
      const tol = Math.max(20, 14 / q.f.ls);
      return Math.abs(q.lx - vrWiperX(vrNum(it, 'R', 5))) <= tol && q.ly >= 70 && q.ly <= 130;
    },
    drag(it, wx, wy) {
      const q = vrToLogic(it, wx, wy);
      if (!(q.f.ls > 0)) return false;
      const next = Math.round((1 + vrClamp((335 - q.lx) / 120, 0, 1) * 19) * 10) / 10;
      if (next === it.b_em_emfResist_R) return false;
      it.b_em_emfResist_R = next;
      return true;
    },
  };

  /* ---------- 电磁学实验 · 静态实验电路（14 个，线宽 + 滑片位置可调） ---------- */
  // 每个图形就是一张教科书式的局部电路：逻辑坐标等比放进用户框、居中，线条与字号不跟着框缩放变粗。
  const EL_INK = '#252a30', EL_MUT = '#8b929c';
  const EL_ICON = '<path d="M2 12h3m14 0h3"/><path d="M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"/>';

  // 字号与坐标 X/Y/S 同一套线性缩放：去掉原来 7px 下限（缩小框时它会把字母相对元件
  // 放大、压住导线/圆圈），只在极端缩小到几乎看不见时给 1px 屏幕下限；50%~200% 全线性。
  function elFontScale(sz, ls) { return Math.max(1, sz * ls); }
  P.elFZ = elFontScale;                 // 自检探针直接调用绘制用的同一套规则
  // 电表符号按国标用正体（A / V / G）；物理量与元件代号仍是斜体。绘制与自检共用这一条判据。
  function elMeterRoman(letter) { return /^[AVG]$/.test(String(letter)); }
  P.elMeterRoman = elMeterRoman;
  const elClamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const elSlide = (v) => { const x = +v; return Number.isFinite(x) ? elClamp(x, 0, 100) : 50; };

  // 收集一张 spec 里所有滑动变阻器（rheo）的逻辑几何：不依赖 canvas，
  // 供命中/拖动共用，保证「画在哪」和「点得到哪」是同一份数据。
  function elCollectRheos(spec) {
    const out = [];
    const noop = () => {};
    const base = {
      rheo: (x, y, w, h, from) => out.push({ x, y, w, h, from: from === 'right' ? 'right' : 'top' }),
      res: noop, vres: noop, rbox: noop, met: noop, metPtr: noop, hump: noop,
      jt: noop, term: noop, dash: noop, batt: noop, sw: noop, arr: noop,
      lab: noop, txt: noop, wire: noop, head: noop,
      slide: () => 0.5,
      X: (v) => v, Y: (v) => v, S: (v) => v, FZ: (v) => v,
      ls: 1, INK: '', MUT: '', PAPER: '', LW: 2,
    };
    const g = new Proxy(base, { get: (t, k) => (k in t ? t[k] : noop) });
    spec.paint(g);
    return out;
  }

  // 给定滑片位置 p(0~100)，算 rheo 滑片箭头的尾端 top 与尖端 tip（逻辑坐标）。
  // 默认 50 时与原来固定中点的画法完全一致；from:'right' 的侧向滑片沿竖直方向移动。
  function elRheoTip(r, p) {
    const t = elClamp(p, 0, 100) / 100;
    if (r.from === 'right') {
      const yy = r.y + r.h * t;
      return { tip: [r.x + r.w, yy], top: [r.x + r.w + 26, yy] };
    }
    const xx = r.x + r.w * t;
    return { tip: [xx, r.y], top: [xx, r.y - 26] };
  }

  function elShape(spec) {
    const W0 = spec.w, H0 = spec.h;
    // 1.7.10：线宽统一走「样式段」的 it.width（P.draw 同步到 o.size）。
    // 原来每个图另注册一个 <key>_lw，于是面板上出现两个「线宽」，样式段那个被这里覆盖、完全没用。
    // 滑片位置：照 b_em_* 大图 1.7.4-03 的 projHandles 约定，参数名 = <图形key>_<参数名>，
    // 值直接挂在对象上，撤销/重做、参数面板、文档保存全走 input.js/app.js 现成的那套。
    const SLIDE_KEY = spec.key + '_slide';
    const SLIDE_DEF = param(SLIDE_KEY, { label: '滑片位置', min: 0, max: 100, step: 1, def: 50, unit: '%' });
    const RH = elCollectRheos(spec);
    const hasRheo = RH.length > 0;    // 没有滑片就没有「滑片位置」参数，也不该抢整体拖动
    reg({
      key: spec.key, cat: 'emlab', label: spec.label, geom: 'box',
      W0: spec.w, H0: spec.h,          // 逻辑画布尺寸（自检探针按 1:1 映射核对几何）
      padBBox: spec.padBBox || 0,      // 量尺量不全时由图形自己声明外扩（见 measureBox）
      params: hasRheo ? [SLIDE_DEF] : [],
      icon: spec.icon || EL_ICON,
      draw(c, o, GH) {
        const b = GH.box(o);
        if (!b || b.w < 60 || b.h < 40) return;
        const ls = Math.min(b.w / W0, b.h / H0);
        const ox = b.x1 + (b.w - W0 * ls) / 2, oy = b.y1 + (b.h - H0 * ls) / 2;
        const X = (v) => ox + v * ls, Y = (v) => oy + v * ls, S = (v) => v * ls;
        const FZ = (sz) => elFontScale(sz, ls);
        const INK = inkOf(EL_INK), MUT = inkOf(EL_MUT), PAPER = paperOf();
        // 线宽取「样式段」那一个（P.draw 里 it.size = it.width，这里就是 o.size）。
        // 单位是屏幕像素，不跟 ls 缩放 —— 老师把图拖小，线不该细成一根丝。
        const LW = Math.max(0.5, o.size || 3);
        // 箭头长度按线宽定（4.4 倍线宽），再夹在元件框内（≤62% 框高、≤24% 框宽）。
        // 原来 rbox/rheo 的 head 用 S(...) 走逻辑坐标，框一小箭头就缩到 3px，细得像根刺。
        const headLen = (hpx, wpx) => Math.max(4.5,
          Math.min(Math.max(4.5, LW * 4.4), Math.min(hpx * 0.62, wpx * 0.24)));

        // 符号与数字的正体字：字母一律数学斜体，与课本插图一致
        const lab = (m, s, x, y, size, opt) => {
          const t = opt || {};
          const sz = FZ(size);
          const ital = !t.roman && /[A-Za-z]/.test(String(m));
          const wm = mw(c, String(m), sz, ital);
          const ss = s ? FZ(size * 0.62) : 0;
          const ws = s ? mw(c, String(s), ss, /[A-Za-z]/.test(String(s))) : 0;
          const tot = wm + (s ? ws * 0.98 : 0);
          // 可选锚点/避让偏移（逻辑坐标，随 ls 缩放）：默认 0 → 旧图坐标一字不改，
          // 个别拥挤的 spec 可传 { dx, dy } 把字母挪开导线/圆圈，不全局重排。
          let sx = X(x + (t.dx || 0));
          if (t.align === 'center') sx -= tot / 2;
          else if (t.align === 'right') sx -= tot;
          const sy = Y(y + (t.dy || 0));
          c.save();
          c.fillStyle = t.color || INK;
          c.textAlign = 'left'; c.textBaseline = 'middle';
          c.font = (ital ? 'italic ' : '') + sz.toFixed(1) + 'px ' + MATH_FONT;
          c.fillText(String(m), sx, sy);
          if (s) {
            c.font = ((t.roman ? false : /[A-Za-z]/.test(String(s))) ? 'italic ' : '') + ss.toFixed(1) + 'px ' + MATH_FONT;
            c.fillText(String(s), sx + wm, sy + sz * 0.26);
          }
          c.restore();
        };
        const txt = (s, x, y, size, opt) => {
          const t = opt || {};
          c.save();
          c.fillStyle = t.color || INK;
          c.font = FZ(size).toFixed(1) + 'px ' + (t.font || 'system-ui,"Microsoft YaHei",sans-serif');
          c.textAlign = t.align || 'center'; c.textBaseline = 'middle';
          c.fillText(String(s), X(x), Y(y));
          c.restore();
        };
        const wire = (pts, opt) => {
          const t = opt || {};
          c.save();
          c.strokeStyle = t.color || INK;
          c.lineWidth = t.w || LW;
          c.lineCap = 'round'; c.lineJoin = 'round';
          if (t.dash) c.setLineDash(t.dash);
          poly(c, pts.map((p) => [X(p[0]), Y(p[1])]), !!t.fill);
          if (t.fill) { c.fillStyle = t.color || INK; c.fill(); }   // 实心符号（二极管三角）
          c.restore();
        };
        const rect = (x, y, w, h) => {
          c.save();
          c.beginPath(); c.rect(X(x), Y(y), S(w), S(h));
          c.fillStyle = PAPER; c.fill();
          c.strokeStyle = INK; c.lineWidth = LW; c.stroke();
          c.restore();
        };
        const head = (ex, ey, ang, hd) => {
          c.beginPath();
          c.moveTo(ex, ey);
          c.lineTo(ex - hd * Math.cos(ang - 0.42), ey - hd * Math.sin(ang - 0.42));
          c.lineTo(ex - hd * Math.cos(ang + 0.42), ey - hd * Math.sin(ang + 0.42));
          c.closePath(); c.fillStyle = INK; c.fill();
        };
        // 定值/待测电阻
        const res = (x, y, w, h) => rect(x, y, w, h);
        // 可变电阻：方框 + 斜穿的箭头
        const vres = (x, y, w, h) => {
          rect(x, y, w, h);
          c.save();
          c.strokeStyle = INK; c.lineWidth = LW; c.lineCap = 'round';
          const sx = X(x + w * 0.26), sy = Y(y + h + 14), ex = X(x + w * 0.80), ey = Y(y - 14);
          const ang = Math.atan2(ey - sy, ex - sx);
          const hd = Math.min(Math.max(5, LW * 4.4), Math.hypot(ex - sx, ey - sy) * 0.34);
          c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex - Math.cos(ang) * hd * 0.6, ey - Math.sin(ang) * hd * 0.6); c.stroke();
          c.restore();
          head(ex, ey, ang, hd);
        };
        // 滑动变阻器：方框 + 从上方（或侧向 from:'right'）压下来的真滑片箭头，
        // 位置由滑片参数决定，几何与命中/拖动共用 elRheoTip。
        const rheo = (x, y, w, h, from) => {
          rect(x, y, w, h);
          const a = elRheoTip({ x, y, w, h, from: from === 'right' ? 'right' : 'top' }, elSlide(o[SLIDE_KEY]));
          const sx = X(a.top[0]), sy = Y(a.top[1]), ex = X(a.tip[0]), ey = Y(a.tip[1]);
          const ang = Math.atan2(ey - sy, ex - sx);
          const hd = Math.min(Math.max(5, LW * 4.4), Math.hypot(ex - sx, ey - sy) * 0.55);
          c.save();
          c.strokeStyle = INK; c.lineWidth = LW; c.lineCap = 'round';
          c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex - Math.cos(ang) * hd * 0.6, ey - Math.sin(ang) * hd * 0.6); c.stroke();
          c.restore();
          head(ex, ey, ang, hd);
        };
        // 电阻箱（可调电阻器）：矩形电阻体 + 一条斜向上的长箭头，两端都伸出电阻体外。
        // GB/IEC 60617 可调电阻符号。与滑动变阻器区分：后者是从外部压向电阻体的滑片箭头，
        // 电阻箱是斜穿电阻体的可调标记，没有独立滑片。
        const rbox = (x, y, w, h) => {
          rect(x, y, w, h);
          const sx = X(x + w * 0.22), sy = Y(y + h + 16);
          const ex = X(x + w * 0.82), ey = Y(y - 16);
          const ang = Math.atan2(ey - sy, ex - sx);
          const hd = Math.min(Math.max(5, LW * 4.4), Math.hypot(ex - sx, ey - sy) * 0.30);
          c.save();
          c.strokeStyle = INK; c.lineWidth = LW; c.lineCap = 'round';
          c.beginPath(); c.moveTo(sx, sy);
          c.lineTo(ex - Math.cos(ang) * hd * 0.6, ey - Math.sin(ang) * hd * 0.6);
          c.stroke();
          c.restore();
          head(ex, ey, ang, hd);
        };
        const met = (cx, cy, r, letter, sub) => {
          c.save();
          c.beginPath(); c.arc(X(cx), Y(cy), S(r), 0, Math.PI * 2);
          c.fillStyle = PAPER; c.fill();
          c.strokeStyle = INK; c.lineWidth = LW; c.stroke();
          c.restore();
          // 电表符号按国标用正体：A / V / G 都不斜（物理量符号才斜体）
          if (letter) lab(letter, sub, cx - (sub ? r * 0.2 : 0), cy, r * 1.18,
            { align: 'center', roman: elMeterRoman(letter) });
        };
        // 指针式表头：圆 + 竖直指针（多档位表用）
        const metPtr = (cx, cy, r) => {
          c.save();
          c.beginPath(); c.arc(X(cx), Y(cy), S(r), 0, Math.PI * 2);
          c.fillStyle = PAPER; c.fill();
          c.strokeStyle = INK; c.lineWidth = LW; c.stroke();
          c.restore();
          c.save(); c.strokeStyle = INK; c.lineWidth = Math.max(0.9, LW * 0.7); c.lineCap = 'round';
          c.beginPath(); c.moveTo(X(cx), Y(cy + r * 0.5)); c.lineTo(X(cx), Y(cy - r * 0.6)); c.stroke();
          c.restore();
          head(X(cx), Y(cy - r * 0.66), -Math.PI / 2, Math.max(3, S(r * 0.62)));
        };
        const hump = (cx, cy, r) => {
          c.save();
          c.strokeStyle = INK; c.lineWidth = LW; c.lineCap = 'round';
          c.beginPath(); c.arc(X(cx), Y(cy), S(r), Math.PI, Math.PI * 2); c.stroke();
          c.restore();
        };
        const jt = (x, y) => { c.save(); c.fillStyle = INK; dot(c, X(x), Y(y), Math.max(1.4, S(5.2))); c.restore(); };
        const term = (x, y) => {
          c.save();
          c.beginPath(); c.arc(X(x), Y(y), Math.max(1.8, S(8)), 0, Math.PI * 2);
          c.fillStyle = PAPER; c.fill();
          c.strokeStyle = INK; c.lineWidth = Math.max(0.8, LW * 0.9); c.stroke();
          c.restore();
        };
        const dash = (x, y, w, h) => {
          c.save();
          c.strokeStyle = INK; c.lineWidth = Math.max(0.7, LW * 0.9);
          c.setLineDash([S(9), S(7)]);
          c.beginPath(); c.rect(X(x), Y(y), S(w), S(h)); c.stroke();
          c.restore();
        };
        // 电池：左长板为正极
        const batt = (x, y) => {
          c.save();
          c.strokeStyle = INK; c.lineWidth = LW;
          c.beginPath(); c.moveTo(X(x - 13), Y(y)); c.lineTo(X(x), Y(y)); c.stroke();
          c.beginPath(); c.moveTo(X(x), Y(y - 20)); c.lineTo(X(x), Y(y + 20)); c.stroke();
          c.beginPath(); c.moveTo(X(x + 9), Y(y - 12)); c.lineTo(X(x + 9), Y(y + 12)); c.stroke();
          c.beginPath(); c.moveTo(X(x + 9), Y(y)); c.lineTo(X(x + 22), Y(y)); c.stroke();
          c.restore();
        };
        // 水平开关：断开时抬起
        const sw = (x, y, len, open) => {
          jt(x, y); jt(x + len, y);
          if (open) {
            c.save();
            c.strokeStyle = INK; c.lineWidth = LW; c.lineCap = 'round';
            c.beginPath(); c.moveTo(X(x), Y(y)); c.lineTo(X(x + len * 0.9), Y(y - len * 0.62)); c.stroke();
            c.restore();
          } else wire([[x, y], [x + len, y]]);
        };
        const arr = (x1, y1, x2, y2) => {
          c.save();
          c.strokeStyle = INK; c.lineWidth = Math.max(0.8, LW * 0.9); c.lineCap = 'round';
          const ang = Math.atan2(Y(y2) - Y(y1), X(x2) - X(x1));
          const hd = Math.min(Math.max(4, LW * 3.6), Math.hypot(X(x2) - X(x1), Y(y2) - Y(y1)) * 0.45);
          c.beginPath(); c.moveTo(X(x1), Y(y1)); c.lineTo(X(x2), Y(y2)); c.stroke();
          head(X(x2), Y(y2), ang, hd);
          c.restore();
        };

        c.save();
        c.beginPath(); c.rect(o.x1, o.y1, o.x2 - o.x1, o.y2 - o.y1); c.clip();
        spec.paint({ c, X, Y, S, FZ, ls, INK, MUT, PAPER, LW, lab, txt, wire, res, vres, rbox, rheo, met, metPtr, hump, jt, term, dash, batt, sw, arr, head,
          slide: () => elSlide(o[SLIDE_KEY]) / 100 });
        c.restore();
      },
    });

    // 复用 b_em_* 大图那套 projHandles：input.js 的 selectDown 用 type:'pb' + key 找到这里，
    // hit/drag 只负责命中与改参数，invalidate/requestRender/syncParam/commit 由 input.js/app.js
    // 现成的通用逻辑触发（撤销/重做、参数面板、文档保存自动生效），不另造拖拽系统。
    // 没有滑动变阻器（RH 为空）的图不注册：否则会凭空多一个没用的「滑片位置」参数、
    // 还会把「点空白处整体拖动」误判成抓滑片。
    if (hasRheo) {
      P.projHandles = P.projHandles || {};
      P.projHandles[spec.key] = {
        param: SLIDE_KEY, W0: spec.w, H0: spec.h, rheos: RH,
        hit(it, wx, wy) {
          const q = prToLogic(it, wx, wy, spec.w, spec.h);
          if (!(q.f.ls > 0)) return false;
          const p = elSlide(it[SLIDE_KEY]);
          const tol = Math.max(16, 14 / q.f.ls);   // 缩得很小时热区按屏幕尺度放大，仍好抓
          for (const r of RH) {
            const a = elRheoTip(r, p);
            if (q.lx >= Math.min(a.top[0], a.tip[0]) - tol && q.lx <= Math.max(a.top[0], a.tip[0]) + tol &&
                q.ly >= Math.min(a.top[1], a.tip[1]) - tol && q.ly <= Math.max(a.top[1], a.tip[1]) + tol) return true;
          }
          return false;
        },
        drag(it, wx, wy) {
          const q = prToLogic(it, wx, wy, spec.w, spec.h);
          if (!(q.f.ls > 0)) return false;
          let r = null, best = Infinity;
          for (const cand of RH) {                // 多个变阻器时挑离指针最近的那一个
            const d = Math.abs(q.lx - (cand.x + cand.w / 2)) + Math.abs(q.ly - (cand.y + cand.h / 2));
            if (d < best) { best = d; r = cand; }
          }
          const next = r
            ? Math.round(elClamp(r.from === 'right' ? (q.ly - r.y) / r.h * 100 : (q.lx - r.x) / r.w * 100, 0, 100))
            : Math.round(elClamp(q.lx / spec.w * 100, 0, 100));
          if (next === elSlide(it[SLIDE_KEY])) return false;
          it[SLIDE_KEY] = next;                    // 与 4 处大图完全一致：直接写对象字段
          return true;
        },
      };
    }
  }

  // ① 电压表改装：表头串联大电阻，虚线框内是改装后的电压表
  elShape({
    // 右侧接线柱与标号的字体度量在离屏量尺上比主画布窄，418 宽时虚线框差 9.6px（探针实测），
    // 这里按设计单位声明 20 的外扩（缩到一半时 ≈10px），量尺按缩放比例递减。
    key: 'b_emlab_voltMod', label: '电压表改装', w: 836, h: 261, padBBox: 20,
    paint: (g) => {
      g.dash(150, 34, 494, 197);
      g.term(23, 158);
      g.wire([[30, 158], [212, 158]]);
      g.res(212, 135, 148, 46);
      g.wire([[360, 158], [483, 158]]);
      g.met(533, 158, 50, 'G');
      g.wire([[583, 158], [795, 158]]);
      g.term(802, 158);
      g.lab('A', '', 40, 100, 52);
      g.lab('B', '', 806, 100, 52);
      g.lab('R', '', 286, 92, 52);
      g.lab('R', 'g', 566, 60, 46);
    },
  });

  // ② 电流表改装：表头并联小电阻分流
  elShape({
    key: 'b_emlab_ampMod', label: '电流表改装', w: 619, h: 239,
    paint: (g) => {
      g.term(17, 77);
      g.wire([[24, 77], [296, 77]]);
      g.met(333, 77, 37, 'G');
      g.wire([[371, 77], [601, 77]]);
      g.wire([[162, 77], [162, 220], [280, 220]]);
      g.res(280, 203, 112, 34);
      g.wire([[392, 220], [501, 220], [501, 77]]);
      g.arr(52, 77, 96, 77); g.lab('I', '', 110, 40, 40);
      g.arr(232, 77, 268, 77); g.lab('I', 'g', 284, 22, 30);
      g.arr(162, 108, 162, 146);
      g.lab('I', '', 180, 130, 38);
      g.wire([[198, 132], [212, 132]], { w: Math.max(1.4, g.LW * 0.55) });
      g.lab('I', 'g', 216, 136, 30);
      g.lab('R', '', 336, 258, 44);
      g.jt(162, 77); g.jt(501, 77);
    },
  });

  // ③ 多档位电流表：两个分流电阻串在表头两端，抽头 A/B/C
  elShape({
    key: 'b_emlab_ampMulti', label: '多档位电流表', w: 621, h: 452,
    paint: (g) => {
      g.dash(10, 8, 602, 317);
      g.wire([[79, 73], [278, 73]]);
      g.metPtr(315, 73, 38);
      g.wire([[353, 73], [541, 73]]);
      g.wire([[81, 73], [81, 364]]);
      g.wire([[541, 73], [541, 364]]);
      g.wire([[81, 210], [148, 210]]);
      g.res(148, 193, 111, 34);
      g.wire([[259, 210], [376, 210]]);
      g.res(376, 193, 112, 34);
      g.wire([[488, 210], [541, 210]]);
      g.wire([[317, 210], [317, 364]]);
      g.jt(81, 210); g.jt(317, 210); g.jt(541, 210);
      g.term(81, 375); g.term(317, 375); g.term(541, 375);
      g.lab('R', 'g', 372, 116, 46);
      g.lab('R', '1', 196, 284, 52);
      g.lab('R', '2', 428, 284, 52);
      g.lab('A', '', 81, 424, 50);
      g.lab('B', '', 317, 424, 50);
      g.lab('C', '', 541, 424, 50);
    },
  });

  // ④ 多档位电压表：表头串两个分压电阻，抽头 a/b/c
  elShape({
    key: 'b_emlab_voltMulti', label: '多档位电压表', w: 883, h: 364,
    paint: (g) => {
      g.dash(18, 20, 842, 258);
      g.wire([[54, 101], [180, 101]]);
      g.metPtr(217, 101, 38);
      g.wire([[255, 101], [394, 101]]);
      g.res(394, 84, 111, 34);
      g.wire([[505, 101], [622, 101]]);
      g.res(622, 84, 112, 34);
      g.wire([[734, 101], [812, 101]]);
      g.wire([[54, 101], [54, 291]]);
      g.wire([[812, 101], [812, 291]]);
      g.wire([[558, 101], [558, 291]]);
      g.jt(558, 101);
      g.term(54, 300); g.term(558, 300); g.term(812, 300);
      g.lab('R', '1', 450, 52, 50);
      g.lab('R', '2', 678, 52, 50);
      g.lab('R', 'g', 217, 178, 46);
      g.lab('a', '', 40, 330, 44);
      g.lab('b', '', 544, 330, 44);
      g.lab('c', '', 828, 330, 44);
      g.txt('3 V', 620, 344, 40);
      g.txt('15 V', 878, 344, 40, { align: 'right' });
    },
  });

  // ⑤ 安安法（甲）：两只电流表并联，间接测电压
  elShape({
    key: 'b_emlab_aa1', label: '安安法（甲）', w: 509, h: 336,
    paint: (g) => {
      g.wire([[70, 41], [211, 41]]);
      g.met(248, 41, 37, 'A', '2');
      g.wire([[286, 41], [437, 41]]);
      g.wire([[70, 215], [211, 215]]);
      g.met(248, 215, 37, 'A', '1');
      g.wire([[286, 215], [437, 215]]);
      g.wire([[72, 41], [72, 215]]);
      g.wire([[437, 41], [437, 215]]);
      g.wire([[0, 128], [72, 128]]);
      g.wire([[437, 128], [508, 128]]);
      g.jt(72, 128); g.jt(437, 128);
    },
  });

  // ⑥ 安安法（乙）：一只电流表串已知电阻，间接测电压
  elShape({
    key: 'b_emlab_aa2', label: '安安法（乙）', w: 509, h: 332,
    paint: (g) => {
      g.wire([[71, 41], [207, 41]]);
      g.met(244, 41, 37, 'A', '2');
      g.wire([[282, 41], [438, 41]]);
      g.wire([[71, 215], [122, 215]]);
      g.met(159, 215, 37, 'A', '1');
      g.wire([[197, 215], [261, 215]]);
      g.res(261, 198, 111, 34);
      g.wire([[372, 215], [438, 215]]);
      g.wire([[73, 41], [73, 215]]);
      g.wire([[438, 41], [438, 215]]);
      g.wire([[0, 128], [73, 128]]);
      g.wire([[438, 128], [508, 128]]);
      g.jt(73, 128); g.jt(438, 128);
      g.lab('R', '0', 300, 176, 48);
    },
  });

  // ⑦ 伏伏法（甲）：两只电压表串联，间接测电流
  elShape({
    key: 'b_emlab_vv1', label: '伏伏法（甲）', w: 397, h: 207,
    paint: (g) => {
      g.wire([[0, 40], [51, 40]]);
      g.met(88, 40, 37, 'V', '1');
      g.wire([[126, 40], [261, 40]]);
      g.met(298, 40, 37, 'V', '2');
      g.wire([[336, 40], [396, 40]]);
    },
  });

  // ⑧ 伏伏法（乙）：电压表并联已知电阻，再串另一只电压表
  elShape({
    key: 'b_emlab_vv2', label: '伏伏法（乙）', w: 492, h: 247,
    paint: (g) => {
      g.wire([[0, 41], [125, 41]]);
      g.met(162, 41, 37, 'V', '1');
      g.wire([[200, 41], [347, 41]]);
      g.met(384, 41, 37, 'V', '2');
      g.wire([[422, 41], [491, 41]]);
      g.wire([[51, 41], [51, 156], [104, 156]]);
      g.res(104, 139, 111, 34);
      g.wire([[215, 156], [271, 156], [271, 41]]);
      g.jt(51, 41); g.jt(271, 41);
      g.lab('R', '0', 160, 205, 46);
    },
  });

  // ⑨ 电流半偏法：R₁ 是滑动变阻器（限流），R₀ 是电阻箱（与电流表并联、S₂ 控制）
  elShape({
    key: 'b_emlab_halfA', label: '电流半偏法', w: 311, h: 242,
    paint: (g) => {
      g.wire([[4, 20], [87, 20]]);
      g.met(106, 20, 19, 'A');
      g.wire([[125, 20], [230, 20], [230, 92]]);
      g.wire([[4, 92], [38, 92]]);
      g.rbox(38, 83, 56, 18);
      g.wire([[94, 92], [138, 92]]);
      g.sw(138, 92, 31, true);
      g.wire([[169, 92], [306, 92], [306, 164]]);
      g.wire([[4, 20], [4, 164]]);
      g.wire([[4, 164], [57, 164]]);
      g.batt(70, 164);
      g.wire([[92, 164], [139, 164]]);
      g.sw(139, 164, 30, true);
      g.wire([[169, 164], [206, 164]]);
      g.rheo(206, 155, 57, 17);
      g.wire([[263, 164], [306, 164]]);
      g.wire([[206 + 57 * g.slide(), 129], [206 + 57 * g.slide(), 117], [306, 117]]);
      g.jt(230, 92);
      g.lab('R', '0', 66, 122, 34, { dy: 4 });   // 避让偏移示例：R₀ 下移离导线
      g.lab('E', '', 62, 202, 34);
      g.lab('S', '2', 138, 64, 30);
      g.lab('S', '1', 150, 202, 30);
      g.lab('R', '1', 234, 198, 34);
      g.lab('I', '', 268, 74, 32);
      g.arr(250, 92, 284, 92);
    },
  });

  // ⑩ 电压半偏法：R₁ 是滑动变阻器（分压），R₀ 是电阻箱（与电压表串联、S₂ 短接）
  elShape({
    key: 'b_emlab_halfV', label: '电压半偏法', w: 250, h: 276,
    paint: (g) => {
      g.wire([[4, 58], [41, 58]]);
      g.met(60, 58, 20, 'V');
      g.wire([[80, 58], [121, 58]]);
      g.wire([[121, 40], [159, 40]]);
      g.sw(159, 40, 30, true);
      g.wire([[189, 40], [228, 40]]);
      g.wire([[121, 40], [121, 76], [143, 76]]);
      g.rbox(143, 68, 57, 17);
      g.wire([[200, 76], [228, 76], [228, 40]]);
      // R₁ 滑片引线：从右轨下来接到滑片箭头尾部，随滑片位置移动，不会和图脱开
      g.wire([[228, 58], [249, 58], [249, 126], [98 + 56 * g.slide(), 126]]);
      g.wire([[4, 161], [98, 161]]);
      g.rheo(98, 152, 56, 18);
      g.wire([[154, 161], [249, 161], [249, 202]]);
      g.wire([[4, 58], [4, 202]]);
      g.wire([[4, 202], [28, 202]]);
      g.batt(41, 202);
      g.wire([[63, 202], [204, 202]]);
      g.sw(204, 202, 42, true);
      g.jt(121, 58); g.jt(228, 58);
      g.lab('S', '2', 172, 24, 28);
      g.lab('R', '0', 172, 104, 32);
      g.lab('R', '1', 126, 192, 32);
      g.lab('E', '', 56, 240, 32);
      g.lab('S', '1', 224, 240, 28);
    },
  });

  // ⑪ 等效替代法：待测电阻与电阻箱 R₁ 由换向开关切换，R₂ 是滑动变阻器
  elShape({
    key: 'b_emlab_equiv', label: '等效替代法', w: 289, h: 239,
    paint: (g) => {
      g.res(32, 36, 57, 17);
      g.wire([[5, 44], [32, 44]]);
      g.wire([[89, 44], [135, 44]]);
      g.rbox(46, 112, 57, 17);
      g.wire([[5, 121], [46, 121]]);
      g.wire([[103, 121], [138, 121]]);
      g.wire([[5, 44], [5, 222]]);
      g.jt(5, 121);
      g.jt(135, 44); g.jt(138, 121);
      g.jt(156, 74);
      g.wire([[152, 72], [108, 56]]);
      g.wire([[156, 74], [180, 73]]);
      g.met(205, 73, 25, 'A');
      g.wire([[230, 73], [254, 73], [254, 140]]);
      g.rheo(246, 140, 17, 57, 'right');
      g.wire([[254, 197], [254, 222]]);
      // R₂ 滑片引线：从滑片箭头尾部折到底轨，随滑片位置移动
      g.wire([[263, 140 + 57 * g.slide()], [288, 140 + 57 * g.slide()], [288, 222]]);
      g.wire([[5, 222], [102, 222]]);
      g.batt(115, 222);
      g.wire([[137, 222], [288, 222]]);
      g.txt('待测电阻', 62, 16, 30);
      g.lab('1', '', 128, 16, 30);
      g.lab('R', '1', 74, 158, 38, { dy: 4 });   // 避让偏移示例：R₁ 下移离换向支路
      g.lab('2', '', 132, 156, 30);
      g.lab('S', '', 104, 88, 34);
      g.lab('R', '2', 238, 168, 38, { align: 'right' });
      g.lab('a', '', 277, 113, 26);
      g.lab('P', '', 271, 150, 23);              // 滑片符号：字号收到 23，和 a 拉开距离
      g.lab('b', '', 272, 200, 26);
    },
  });

  // ⑫ 电桥平衡法：甲接检流计，乙断开待接
  elShape({
    key: 'b_emlab_bridge', label: '电桥平衡法', w: 580, h: 269,
    paint: (g) => {
      const one = (dx, tag, withG) => {
        g.wire([[dx + 4, 32], [dx + 4, 219]]);
        g.wire([[dx + 253, 32], [dx + 253, 219]]);
        g.res(dx + 26, 24, 57, 17);
        g.wire([[dx + 4, 32], [dx + 26, 32]]);
        g.wire([[dx + 83, 32], [dx + 170, 32]]);
        g.res(dx + 170, 24, 57, 17);
        g.wire([[dx + 227, 32], [dx + 253, 32]]);
        g.rbox(dx + 26, 143, 57, 17);   // R₃ 是电阻箱（可调臂），不是滑动变阻器
        g.wire([[dx + 4, 152], [dx + 26, 152]]);
        g.wire([[dx + 83, 152], [dx + 170, 152]]);
        g.res(dx + 170, 143, 57, 17);
        g.wire([[dx + 227, 152], [dx + 253, 152]]);
        g.jt(dx + 123, 32); g.jt(dx + 123, 152);
        if (withG) {
          g.wire([[dx + 123, 32], [dx + 123, 72]]);
          g.met(dx + 123, 96, 24, 'G');
          g.wire([[dx + 123, 120], [dx + 123, 152]]);
        } else {
          g.wire([[dx + 123, 32], [dx + 123, 58]]);
          g.wire([[dx + 123, 126], [dx + 123, 152]]);
        }
        g.wire([[dx + 4, 219], [dx + 81, 219]]);
        g.batt(dx + 94, 219);
        g.wire([[dx + 116, 219], [dx + 183, 219]]);
        g.sw(dx + 183, 219, 32, true);
        g.wire([[dx + 215, 219], [dx + 253, 219]]);
        g.lab('R', '1', dx + 54, 64, 40);
        g.lab('R', '2', dx + 198, 64, 40);
        g.lab('R', '3', dx + 54, 186, 40);
        g.lab('R', 'x', dx + 198, 186, 40);
        g.lab('A', '', dx + 123, 10, 40);
        g.lab('B', '', dx + 123, 174, 40);
        g.txt(tag, dx + 140, 248, 40);
      };
      one(0, '甲', true);
      one(300, '乙', false);
    },
  });

  // ⑬ 二极管
  elShape({
    key: 'b_emlab_diode', label: '二极管', w: 560, h: 300,
    paint: (g) => {
      g.wire([[30, 150], [170, 150]]);
      g.wire([[330, 150], [530, 150]]);
      g.wire([[170, 78], [170, 222], [330, 150], [170, 78]], { fill: true });  // 实心二极管三角
      g.wire([[330, 64], [330, 236]]);
    },
  });

  // ⑭ 电感
  elShape({
    key: 'b_emlab_inductor', label: '电感', w: 900, h: 280,
    paint: (g) => {
      const r = 48, n = 5, x0 = 210, y = 180;
      g.wire([[30, y], [x0, y]]);
      g.wire([[x0 + n * 2 * r, y], [870, y]]);
      for (let i = 0; i < n; i += 1) g.hump(x0 + r + i * 2 * r, y, r);
      g.lab('L', '', x0 + n * r, 100, 56);
    },
  });

  /* ====================== 2.0：光学基本元件 / 交流与变压器 / 热学器材 ======================
     这批都是「简单几何基元 + 参数」，不画整幅教材插图（见总纲五-A）：
     图形按框的短边等比缩放，不随框拉伸变形（2.0 反馈「插入的图形严重失真变形」）。 */
  const on01 = (v, d) => ((v == null ? d : v) >= 0.5);
  // 两种透镜各自一套参数（契约：参数名以图形 key 开头）
  const lensParams = (k) => [
    param(k + '_axis', { label: '主光轴与焦点', min: 0, max: 1, step: 1, def: 1, unit: '0无1有' }),
    param(k + '_sym', { label: '画法', min: 0, max: 1, step: 1, def: 0, unit: '0实物1符号' }),
    param(k + '_f', { label: '焦距（占半宽）', min: 0.15, max: 0.48, step: 0.01, def: 0.3, unit: '' }),
  ];
  const LP = (o, k, name, d) => { const v = o[k + '_' + name]; return v == null ? d : v; };
  // 主光轴 + O、F、2F（两侧对称；2F 出框时不画）
  function lensAxis(c, o, b, cx, cy, k) {
    if (LP(o, k, 'axis', 1) < 0.5) return;
    const f = LP(o, k, 'f', 0.3) * b.w / 2;        // 焦距 = 框半宽 × 比例
    const lw = c.lineWidth;
    c.save(); c.lineWidth = Math.max(1, lw * 0.5); ln(c, b.x1, cy, b.x2, cy); c.restore();
    c.save(); c.fillStyle = c.strokeStyle;
    [[-1, 'F'], [1, 'F'], [-2, '2F'], [2, '2F']].forEach(([k, s]) => {
      const x = cx + k * f;
      if (x < b.x1 + 4 || x > b.x2 - 4) return;
      dot(c, x, cy, Math.max(2, lw * 0.9));
      txt(c, s, x, cy + 14, 'center');
    });
    c.restore();
    txt(c, 'O', cx + 8, cy + 14, 'left');
  }
  function lensFrame(b) {
    const cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2, H = b.h * 0.9;
    return { cx, cy, H, t: Math.max(4, Math.min(b.w * 0.08, H * 0.16)) };
  }
  reg({
    key: 'b_optics_convexLens', cat: 'optics', label: '凸透镜',
    icon: '<path d="M12 3c3 3 3 15 0 18c-3-3-3-15 0-18z"/><path d="M2 12h20" opacity=".5"/>',
    params: lensParams('b_optics_convexLens'),
    draw(c, o, GH) {
      const b = GH.box(o), L = lensFrame(b), { cx, cy, H, t } = L;
      if (LP(o, 'b_optics_convexLens', 'sym', 0) >= 0.5) {
        ln(c, cx, cy - H / 2, cx, cy + H / 2);
        const a = Math.max(6, H * 0.06);
        poly(c, [[cx - a, cy - H / 2 + a], [cx, cy - H / 2], [cx + a, cy - H / 2 + a]]);
        poly(c, [[cx - a, cy + H / 2 - a], [cx, cy + H / 2], [cx + a, cy + H / 2 - a]]);
      } else {
        const R = (t * t + H * H / 4) / (2 * t), A = Math.asin(Math.min(1, H / 2 / R));
        c.beginPath();
        c.arc(cx - (R - t), cy, R, -A, A);
        c.arc(cx + (R - t), cy, R, Math.PI - A, Math.PI + A);
        c.closePath();
        if (o.fill !== false) { c.save(); c.fillStyle = GH.tint(o.color, o.fillAlpha ?? 0.12); c.fill(); c.restore(); }
        c.stroke();
      }
      lensAxis(c, o, b, cx, cy, 'b_optics_convexLens');
    },
  });
  reg({
    key: 'b_optics_concaveLens', cat: 'optics', label: '凹透镜',
    icon: '<path d="M8 3h8c-3 4-3 14 0 18H8c3-4 3-14 0-18z"/><path d="M2 12h20" opacity=".5"/>',
    params: lensParams('b_optics_concaveLens'),
    draw(c, o, GH) {
      const b = GH.box(o), { cx, cy, H, t } = lensFrame(b);
      if (LP(o, 'b_optics_concaveLens', 'sym', 0) >= 0.5) {
        ln(c, cx, cy - H / 2, cx, cy + H / 2);
        const a = Math.max(6, H * 0.06);
        poly(c, [[cx - a, cy - H / 2 - a], [cx, cy - H / 2], [cx + a, cy - H / 2 - a]]);
        poly(c, [[cx - a, cy + H / 2 + a], [cx, cy + H / 2], [cx + a, cy + H / 2 + a]]);
      } else {
        const e = t * 1.3, m = t * 0.35;          // 边缘半厚 / 中心半厚
        c.beginPath();
        c.moveTo(cx - e, cy - H / 2); c.lineTo(cx + e, cy - H / 2);
        c.quadraticCurveTo(cx + 2 * m - e, cy, cx + e, cy + H / 2);
        c.lineTo(cx - e, cy + H / 2);
        c.quadraticCurveTo(cx - 2 * m + e, cy, cx - e, cy - H / 2);
        c.closePath();
        if (o.fill !== false) { c.save(); c.fillStyle = GH.tint(o.color, o.fillAlpha ?? 0.12); c.fill(); c.restore(); }
        c.stroke();
      }
      lensAxis(c, o, b, cx, cy, 'b_optics_concaveLens');
    },
  });

  // 平面镜：反射面一侧画斜纹（背面）；可选法线与入射 / 反射光线（反射角 = 入射角）
  const MIR_RAY = param('b_optics_planeMirror_ray', { label: '入射角（0 不画光线）', min: 0, max: 80, step: 1, def: 40 });
  reg({
    key: 'b_optics_planeMirror', cat: 'optics', label: '平面镜（反射定律）',
    icon: '<path d="M3 16h18"/><path d="M5 16l-2 3M9 16l-2 3M13 16l-2 3M17 16l-2 3M21 16l-2 3"/><path d="M5 5l7 11 7-11"/>',
    params: [MIR_RAY],
    draw(c, o, GH) {
      const b = GH.box(o), lw = c.lineWidth;
      const my = b.y1 + b.h * 0.78, cx = b.x1 + b.w / 2, tick = Math.max(6, Math.min(14, b.h * 0.08));
      c.save(); c.lineWidth = lw * 1.4; ln(c, b.x1, my, b.x2, my); c.restore();
      c.save(); c.lineWidth = Math.max(1, lw * 0.5); c.strokeStyle = GH.alpha(o.color, 0.55);
      for (let x = b.x1 + tick; x <= b.x2; x += tick * 1.2) ln(c, x, my, x - tick, my + tick);
      c.restore();
      const deg = o.b_optics_planeMirror_ray ?? 40;
      if (deg > 0) {
        const th = deg * Math.PI / 180, L = Math.min(b.w / 2 / Math.sin(th) * 0.92, (my - b.y1) / Math.cos(th) * 0.95);
        c.save(); c.setLineDash([6, 5]); c.lineWidth = Math.max(1, lw * 0.5); ln(c, cx, my, cx, Math.max(b.y1, my - L * 1.02)); c.restore();
        const ix = cx - L * Math.sin(th), iy = my - L * Math.cos(th), rx = cx + L * Math.sin(th);
        arw(c, GH, ix, iy, (ix + cx) / 2, (iy + my) / 2); ln(c, (ix + cx) / 2, (iy + my) / 2, cx, my);
        arw(c, GH, cx, my, (cx + rx) / 2, (iy + my) / 2); ln(c, (cx + rx) / 2, (iy + my) / 2, rx, iy);
        const r = Math.min(L * 0.3, 40);
        arc(c, cx, my, r, -Math.PI / 2 - th, -Math.PI / 2); arc(c, cx, my, r * 1.15, -Math.PI / 2, -Math.PI / 2 + th);
        txt(c, 'i', cx - (r + 8) * Math.sin(th / 2) - 4, my - (r + 8) * Math.cos(th / 2), 'center');
        txt(c, 'r', cx + (r * 1.15 + 8) * Math.sin(th / 2) + 4, my - (r * 1.15 + 8) * Math.cos(th / 2), 'center');
        txt(c, '法线', cx + 6, Math.max(b.y1 + 8, my - L * 0.98), 'left');
      }
    },
  });

  // 三棱镜（等腰，顶角可调）：可画一条单色光两次折射（按 n 真算，不是示意折线）
  const PR_A = param('b_optics_prism_apex', { label: '顶角', min: 30, max: 90, step: 1, def: 60 });
  const PR_N = param('b_optics_prism_n', { label: '折射率 n（0 不画光线）', min: 0, max: 2, step: 0.01, def: 1.5, unit: '' });
  reg({
    key: 'b_optics_prism', cat: 'optics', label: '三棱镜（折射光路）',
    icon: '<path d="M12 3l8 16H4z"/><path d="M2 13l7-1 6 2 7 4" opacity=".7"/>',
    params: [PR_A, PR_N],
    draw(c, o, GH) {
      const b = GH.box(o), A = (o.b_optics_prism_apex ?? 60) * Math.PI / 180, n = o.b_optics_prism_n ?? 1.5;
      // 等腰三角形，底边水平；按框的短边等比放
      const hgt0 = 1, half0 = Math.tan(A / 2);
      const sc = Math.min(b.h * 0.88 / hgt0, b.w * 0.6 / (2 * half0));
      const cx = b.x1 + b.w / 2, top = b.y1 + (b.h - sc) / 2, bot = top + sc, hw = half0 * sc;
      const P0 = [cx, top], PL = [cx - hw, bot], PR = [cx + hw, bot];
      c.beginPath(); c.moveTo(P0[0], P0[1]); c.lineTo(PL[0], PL[1]); c.lineTo(PR[0], PR[1]); c.closePath();
      if (o.fill !== false) { c.save(); c.fillStyle = GH.tint(o.color, o.fillAlpha ?? 0.1); c.fill(); c.restore(); }
      c.stroke();
      if (n < 1.01) return;
      // 光线：入射点在左侧面中点，入射角 i1 = 45°（相对左侧面法线），偏向底边方向
      const ux = (PL[0] - P0[0]) / sc / Math.hypot(half0, 1), uy = (PL[1] - P0[1]) / sc / Math.hypot(half0, 1); // 左侧面方向（顶→底）
      const nx = -uy, ny = ux;                         // 左侧面外法线（指向左上外侧）
      const outN = (nx * (cx - P0[0]) + ny * (top + sc / 2 - P0[1])) > 0 ? [-nx, -ny] : [nx, ny];
      const M1 = [(P0[0] + PL[0]) / 2, (P0[1] + PL[1]) / 2];
      const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
      const i1 = 45 * Math.PI / 180;
      const inDir = rot([-outN[0], -outN[1]], -i1);    // 射入方向（从法线向底边一侧偏 i1）
      const refract = (d, nrm, n1, n2) => {             // 斯涅耳定律（向量形式）；nrm 与 d 反向
        const cosi = -(d[0] * nrm[0] + d[1] * nrm[1]), k = n1 / n2, s2 = k * k * (1 - cosi * cosi);
        if (s2 > 1) return null;
        const ct = Math.sqrt(1 - s2);
        return [k * d[0] + (k * cosi - ct) * nrm[0], k * d[1] + (k * cosi - ct) * nrm[1]];
      };
      const d1 = refract(inDir, outN, 1, n);
      const L0 = sc * 0.55;
      arw(c, GH, M1[0] - inDir[0] * L0, M1[1] - inDir[1] * L0, M1[0] - inDir[0] * L0 * 0.4, M1[1] - inDir[1] * L0 * 0.4);
      ln(c, M1[0] - inDir[0] * L0 * 0.4, M1[1] - inDir[1] * L0 * 0.4, M1[0], M1[1]);
      if (!d1) return;
      // 与右侧面求交
      const ex = PR[0] - P0[0], ey = PR[1] - P0[1];
      const den = d1[0] * ey - d1[1] * ex;
      if (Math.abs(den) < 1e-9) return;
      const tt = ((P0[0] - M1[0]) * ey - (P0[1] - M1[1]) * ex) / den;
      const M2 = [M1[0] + d1[0] * tt, M1[1] + d1[1] * tt];
      ln(c, M1[0], M1[1], M2[0], M2[1]);
      let rn = [ey, -ex]; const ll = Math.hypot(rn[0], rn[1]); rn = [rn[0] / ll, rn[1] / ll];
      if (rn[0] * d1[0] + rn[1] * d1[1] < 0) rn = [-rn[0], -rn[1]];   // 外法线与光线同向
      const d2 = refract(d1, [-rn[0], -rn[1]], n, 1);
      if (!d2) { txt(c, '全反射', M2[0] + 6, M2[1], 'left'); return; }
      arw(c, GH, M2[0], M2[1], M2[0] + d2[0] * L0 * 0.6, M2[1] + d2[1] * L0 * 0.6);
      ln(c, M2[0] + d2[0] * L0 * 0.6, M2[1] + d2[1] * L0 * 0.6, M2[0] + d2[0] * L0, M2[1] + d2[1] * L0);
      c.save(); c.setLineDash([4, 4]); c.lineWidth = Math.max(1, c.lineWidth * 0.45);
      ln(c, M1[0] - outN[0] * sc * 0.18, M1[1] - outN[1] * sc * 0.18, M1[0] + outN[0] * sc * 0.18, M1[1] + outN[1] * sc * 0.18);
      ln(c, M2[0] - rn[0] * sc * 0.18, M2[1] - rn[1] * sc * 0.18, M2[0] + rn[0] * sc * 0.18, M2[1] + rn[1] * sc * 0.18);
      c.restore();
    },
  });

  // 交流电源符号：圆 + 一个完整正弦周期
  reg({
    key: 'b_em_acSource', cat: 'em', label: '交流电源',
    icon: '<circle cx="12" cy="12" r="7"/><path d="M8 12c1-3 3-3 4 0s3 3 4 0"/><path d="M2 12h3M19 12h3"/>',
    draw(c, o, GH) {
      const b = GH.box(o), cx = b.x1 + b.w / 2, cy = b.y1 + b.h / 2, r = Math.min(b.w * 0.3, b.h / 2 * 0.92);
      ln(c, b.x1, cy, cx - r, cy); ln(c, cx + r, cy, b.x2, cy);
      circ(c, cx, cy, r);
      c.beginPath();
      for (let i = 0; i <= 40; i++) { const u = i / 40, x = cx - r * 0.6 + u * r * 1.2, y = cy - Math.sin(u * Math.PI * 2) * r * 0.36; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    },
  });

  // 理想变压器（电路符号）：两组线圈 + 中间两条竖线（铁芯）；匝数比只影响画出来的圈数
  const TR_N1 = param('b_em_transformer_n1', { label: '原线圈圈数', min: 2, max: 8, step: 1, def: 4, unit: '' });
  const TR_N2 = param('b_em_transformer_n2', { label: '副线圈圈数', min: 2, max: 8, step: 1, def: 2, unit: '' });
  reg({
    key: 'b_em_transformer', cat: 'em', label: '理想变压器',
    icon: '<path d="M8 4c-3 0-3 4 0 4c-3 0-3 4 0 4c-3 0-3 4 0 4M16 6c3 0 3 4 0 4c3 0 3 4 0 4"/><path d="M11 3v18M13 3v18"/>',
    params: [TR_N1, TR_N2],
    draw(c, o, GH) {
      const b = GH.box(o), cx = b.x1 + b.w / 2, top = b.y1 + b.h * 0.08, bot = b.y2 - b.h * 0.08;
      const n1 = Math.round(o.b_em_transformer_n1 ?? 4), n2 = Math.round(o.b_em_transformer_n2 ?? 2);
      const gap = Math.max(4, b.w * 0.035);
      ln(c, cx - gap, top, cx - gap, bot); ln(c, cx + gap, top, cx + gap, bot);
      const coil = (n, x, dir) => {
        const r = Math.min((bot - top) / (2 * n), b.w * 0.12), y0 = (top + bot) / 2 - n * r;
        c.beginPath();
        for (let i = 0; i < n; i++) c.arc(x, y0 + r + i * 2 * r, r, -Math.PI / 2, Math.PI / 2, dir < 0);
        c.stroke();
        ln(c, x, y0, x + dir * b.w * 0.2, y0); ln(c, x, y0 + 2 * n * r, x + dir * b.w * 0.2, y0 + 2 * n * r);
        return y0;
      };
      const y1 = coil(n1, cx - gap * 3, -1), y2 = coil(n2, cx + gap * 3, 1);
      txt(c, 'n₁', cx - gap * 3 - b.w * 0.12, (top + bot) / 2, 'right');
      txt(c, 'n₂', cx + gap * 3 + b.w * 0.12, (top + bot) / 2, 'left');
      void y1; void y2;
    },
  });

  // 温度计（液柱高度可调，刻度 −20…100 °C）
  const TH_T = param('b_heat_thermometer_t', { label: '示数', min: -20, max: 100, step: 1, def: 25, unit: '°C' });
  reg({
    key: 'b_heat_thermometer', cat: 'heat', label: '温度计',
    icon: '<path d="M10 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z"/><path d="M12 9v8"/>',
    params: [TH_T],
    draw(c, o, GH) {
      const b = GH.box(o), cx = b.x1 + b.w / 2;
      const R = Math.min(b.w * 0.18, b.h * 0.09), w = R * 0.9, top = b.y1 + w, by = b.y2 - R * 1.05;
      c.beginPath(); c.moveTo(cx - w / 2, by - R * 0.8); c.lineTo(cx - w / 2, top); c.arc(cx, top, w / 2, Math.PI, 0); c.lineTo(cx + w / 2, by - R * 0.8); c.stroke();
      circ(c, cx, by, R);
      const t = o.b_heat_thermometer_t ?? 25, lo = by - R * 1.2, hi = top + w * 0.2;
      const Y = (v) => lo + (hi - lo) * (v + 20) / 120;
      c.save(); c.fillStyle = '#e02020';
      dot(c, cx, by, R * 0.72);
      c.fillRect(cx - w * 0.22, Y(t), w * 0.44, by - Y(t)); c.restore();
      c.save(); c.lineWidth = Math.max(1, c.lineWidth * 0.5);
      for (let v = -20; v <= 100; v += 10) { const y = Y(v), L = v % 50 === 0 ? w * 0.9 : w * 0.5; ln(c, cx + w / 2, y, cx + w / 2 + L, y); if (v % 20 === 0) txt(c, String(v).replace('-', '−'), cx + w / 2 + w * 1.1 + 2, y, 'left'); }
      c.restore();
      txt(c, '°C', cx - w / 2 - 4, top + w, 'right');
    },
  });

})();
