/* 基础 · 标注图形（1.6.0 第1批 B1/B2 起）
   加载顺序：core/physshapes.js、core/physshapes-proj.js 之后（与 chemshapes/bioshapes 同一套协议），
   core/app.js 之前。subject:'base' 的图形不进物理子分类，由 app.js 的「基础」页追加列出。
   首版是**独立标注**：不绑定任何已有对象（plan §4 允许），所以移动/缩放图形后标注不会跟着走，
   老师要么把标注也一起选中，要么重新拖一个。
*/
(function () {
  if (!window.GW || !GW.physShapes) return;
  const P = GW.physShapes;
  P.projErrors = P.projErrors || [];
  P.catLabel = P.catLabel || {};
  P.catLabel.baseDim = '尺寸标注';
  P.catLabel.baseMark = '几何关系';
  P.subjectOf = P.subjectOf || function (d) { return (d && d.subject) || 'phys'; };
  P.subjectCats = P.subjectCats || function (subj) {
    const out = [];
    for (const k in P.shapes) {
      const d = P.shapes[k];
      if (!d || !d.draw || d.hidden) continue;
      if (P.subjectOf(d) !== subj) continue;
      if (P.hide && P.hide.indexOf(k) >= 0) continue;
      if (d.cat && out.indexOf(d.cat) < 0) out.push(d.cat);
    }
    return out;
  };

  function reg(d) {
    const bad = [];
    if (!d || typeof d !== 'object') bad.push('定义不是对象');
    else {
      if (!/^b_[a-z]+_[A-Za-z0-9]+$/.test(d.key || '')) bad.push('key 必须是 b_<分类>_<名字>');
      if (P.shapes[d.key]) bad.push('key 重复: ' + d.key);
      if (!d.label) bad.push('缺 label');
      if (typeof d.draw !== 'function') bad.push('缺 draw');
      if (!d.cat) bad.push('缺 cat');
      (d.params || []).forEach((k) => { if (!P.paramDefs[k]) bad.push('参数未定义: ' + k); });
    }
    if (bad.length) { P.projErrors.push({ key: (d && d.key) || '?', errors: bad }); return null; }
    d.geom = d.geom || 'box';
    d.subject = d.subject || 'base';
    P.shapes[d.key] = d;
    if (d.cat && !P.catLabel[d.cat]) P.catLabel[d.cat] = d.cat;
    return d;
  }
  function param(key, d) {
    P.paramDefs[key] = Object.assign({ step: 1, unit: '' }, d);
    return key;
  }
  function ln(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  function arw(c, gh, x1, y1, x2, y2) { ln(c, x1, y1, x2, y2); gh.head(c, x1, y1, x2, y2, 3); }
  function txt(c, s, x, y, size, align) {
    c.save(); c.fillStyle = '#1b2433';
    c.textAlign = align || 'center'; c.textBaseline = 'middle';
    if (GW.typo) GW.typo.draw(c, String(s), x, y, size, { align: align || 'center', color: '#1b2433' });
    else { c.font = '600 ' + size.toFixed(1) + 'px system-ui, sans-serif'; c.fillText(s, x, y); }
    c.restore();
  }

  /* ---------- B1 长度尺寸线 ---------- */
  // 拖一个框 → 框宽画成一段尺寸线：两端界线和双向箭头。数值要老师自己填（val=0 不写），
  // 因为「框宽=几厘米」只有老师知道比例，工具不把像素冒充长度。
  const DIM_OFF = param('b_base_dimLine_off', { label: '尺寸线偏移', min: 0, max: 1, step: 0.05, def: 0.45, unit: '占框高' });
  const DIM_SHOW = param('b_base_dimLine_show', { label: '显示数值', min: 0, max: 1, step: 1, def: 0, unit: '0隐1显' });
  const DIM_VAL = param('b_base_dimLine_val', { label: '标注值', min: 0, max: 100, step: 0.5, def: 4, unit: '' });

  reg({
    key: 'b_base_dimLine', cat: 'baseDim', subject: 'base', label: '长度尺寸线',
    icon: '<path d="M3 12h18"/><path d="M3 8v8M21 8v8"/><path d="M6 12l3-2v4zM18 12l-3-2v4z"/>',
    params: [DIM_OFF, DIM_SHOW, DIM_VAL],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const off = Math.max(0, Math.min(1, +o.b_base_dimLine_off));
      const show = +o.b_base_dimLine_show > 0.5;
      const val = +o.b_base_dimLine_val;
      c.lineWidth = Math.max(1, o.size * 0.5);
      const x1 = X(0.12), x2 = X(0.88);
      const yEnd = Y(0.34);                       // 被量物体的位置（两条界线从这里出发）
      const yDim = Y(0.34 + 0.42 * off);          // 尺寸线
      const tick = Math.min(b.w, b.h) * 0.03;
      // 两端界线：稍微越过尺寸线一点，教材上就是这样
      ln(c, x1, yEnd - tick, x1, yDim + tick * 0.6);
      ln(c, x2, yEnd - tick, x2, yDim + tick * 0.6);
      // 尺寸线 + 两端箭头
      arw(c, GH, (x1 + x2) / 2, yDim, x1, yDim);
      arw(c, GH, (x1 + x2) / 2, yDim, x2, yDim);
      if (show && val > 0) {
        const fs = Math.max(9.5, Math.min(14, b.h * 0.052));
        txt(c, String(val), (x1 + x2) / 2, yDim - fs * 0.82, fs);
      }
    },
  });

  /* ---------- B2 几何关系标记组 ---------- */
  // 一条短参照边 + 一组标记：等长的单/双短线、平行的单/双箭头、直角方框、等角弧。
  // 用 kind 一个参数切六种（参数协议只有数值，所以 0..5 用整数）。
  const MARK_KIND = param('b_base_marks_kind', { label: '标记', min: 0, max: 5, step: 1, def: 0, unit: '0单线1双线2单箭头3双箭头4直角5等弧' });
  const MARK_LEN = param('b_base_marks_len', { label: '标记长度', min: 0.3, max: 1, step: 0.05, def: 0.7, unit: '占框宽' });

  reg({
    key: 'b_base_marks', cat: 'baseMark', subject: 'base', label: '几何关系标记',
    icon: '<path d="M3 14h18"/><path d="M8 8v12M12 8v12"/>',
    params: [MARK_KIND, MARK_LEN],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const kind = Math.round(o.b_base_marks_kind);
      const L = Math.max(0.3, Math.min(1, +o.b_base_marks_len));
      c.lineWidth = Math.max(1, o.size * 0.5);
      const cx = X(0.5), cy = Y(0.5);
      const half = b.w * 0.36 * L;
      const lw = Math.max(1.2, o.size * 0.5);
      // 参照边（被标记的那条线）
      ln(c, cx - half, cy, cx + half, cy);

      const tick = Math.min(b.w, b.h) * 0.055;      // 短线长度
      const slant = tick * 0.55;
      const slash = function (dx) {
        ln(c, cx + dx - slant, cy + tick, cx + dx + slant, cy - tick);
      };
      const chev = function (dx) {
        // 平行标记：一个「>」形拐角，开口朝右
        ln(c, cx + dx - tick * 0.9, cy - tick, cx + dx, cy);
        ln(c, cx + dx, cy, cx + dx - tick * 0.9, cy + tick);
      };
      if (kind === 0) slash(0);
      else if (kind === 1) { slash(-tick * 0.7); slash(tick * 0.7); }
      else if (kind === 2) chev(0);
      else if (kind === 3) { chev(-tick * 0.9); chev(tick * 0.9); }
      else if (kind === 4) {
        // 直角：在参照边左端画一个小方框（一边压在参照边上）
        const s = tick * 1.5;
        ln(c, cx - half, cy - s, cx - half + s, cy - s);
        ln(c, cx - half + s, cy - s, cx - half + s, cy);
      } else {
        // 等角弧：以左端点为圆心画一小段圆弧
        const r = tick * 2.2;
        c.beginPath();
        c.arc(cx - half, cy, r, -Math.PI / 3, 0);
        c.stroke();
      }
    },
  });

  /* ---------- B5 三次贝塞尔曲线（1.6.0 第3批） ---------- */
  // 四个点全部是参数（P0/P3 端点固定，P1/P2 两个控制点可调），参数面板就是「编辑手柄」。
  // 曲线用 24 段折线采样画出来 —— 与 canvas 的贝塞尔在导出里一致性最好。
  const BEZ_X1 = param('b_base_bezier_x1', { label: '控制点1 x', min: 0, max: 1, step: 0.01, def: 0.32, unit: '占框宽' });
  const BEZ_Y1 = param('b_base_bezier_y1', { label: '控制点1 y', min: 0, max: 1, step: 0.01, def: 0.12, unit: '占框高' });
  const BEZ_X2 = param('b_base_bezier_x2', { label: '控制点2 x', min: 0, max: 1, step: 0.01, def: 0.68, unit: '占框宽' });
  const BEZ_Y2 = param('b_base_bezier_y2', { label: '控制点2 y', min: 0, max: 1, step: 0.01, def: 0.86, unit: '占框高' });
  const BEZ_HANDLE = param('b_base_bezier_handle', { label: '显示手柄', min: 0, max: 1, step: 1, def: 1, unit: '0隐1显' });

  reg({
    key: 'b_base_bezier', cat: 'baseDim', subject: 'base', label: '贝塞尔曲线',
    icon: '<path d="M3 19C8 4 16 20 21 6"/><path d="M4 15l4-3M16 8l4-2"/>',
    params: [BEZ_X1, BEZ_Y1, BEZ_X2, BEZ_Y2, BEZ_HANDLE],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const show = +o.b_base_bezier_handle > 0.5;
      const P0 = { x: X(0.08), y: Y(0.80) }, P3 = { x: X(0.92), y: Y(0.24) };
      const P1 = { x: X(Math.max(0, Math.min(1, o.b_base_bezier_x1))), y: Y(Math.max(0, Math.min(1, o.b_base_bezier_y1))) };
      const P2 = { x: X(Math.max(0, Math.min(1, o.b_base_bezier_x2))), y: Y(Math.max(0, Math.min(1, o.b_base_bezier_y2))) };
      c.lineWidth = Math.max(1, o.size * 0.5);
      // 手柄线（虚线靠 canvas 的 setLineDash，导出里会还原成实线，所以改成小圆点串）
      if (show) {
        const dotR = Math.max(1.4, b.w * 0.006);
        c.save(); c.fillStyle = o.color || '#1b2433';
        const dashLine = (A, B2) => {
          for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            c.beginPath();
            c.arc(A.x + (B2.x - A.x) * t, A.y + (B2.y - A.y) * t, dotR, 0, Math.PI * 2);
            c.fill();
          }
        };
        dashLine(P0, P1); dashLine(P3, P2);
        c.restore();
        [[P1, '1'], [P2, '2']].forEach((h) => {
          const s2 = Math.max(2.2, b.w * 0.012);
          c.save();
          c.beginPath();
          c.rect(h[0].x - s2, h[0].y - s2, s2 * 2, s2 * 2);
          c.stroke();
          c.restore();
        });
      }
      // 曲线本体：24 段采样
      c.beginPath();
      c.moveTo(P0.x, P0.y);
      for (let i = 1; i <= 24; i++) {
        const t = i / 24, u = 1 - t;
        const x = u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x;
        const y = u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y;
        c.lineTo(x, y);
      }
      c.stroke();
      // 端点
      c.save();
      [[P0, 0.6], [P3, 0.6]].forEach((p) => {
        c.beginPath(); c.arc(p[0].x, p[0].y, Math.max(1.6, b.w * 0.007), 0, Math.PI * 2); c.fill();
      });
      c.restore();
    },
  });


  /* ---------- B3 括号 / 区间括号 / 标注引线 ---------- */
  // 首版仍是独立标注（不绑对象）：括号贴在需要的位置，引线从目标点拉到老师写字的地方。
  const BR_KIND = param('b_base_bracket_kind', { label: '样式', min: 0, max: 3, step: 1, def: 0, unit: '0左大括1右大括2圆括3方括' });
  const BR_SIZE = param('b_base_bracket_size', { label: '张角', min: 0.2, max: 1, step: 0.05, def: 0.8, unit: '占框宽' });

  reg({
    key: 'b_base_bracket', cat: 'baseDim', subject: 'base', label: '括号标注',
    icon: '<path d="M8 3c-3 0-3 9 0 9s-3 9 0 9"/><path d="M16 3c3 0 3 9 0 9s3 9 0 9"/>',
    params: [BR_KIND, BR_SIZE],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const kind = Math.round(o.b_base_bracket_kind);
      const k = Math.max(0.2, Math.min(1, +o.b_base_bracket_size));
      c.lineWidth = Math.max(1, o.size * 0.55);
      const half = (b.h * 0.42) * k;               // 上下半高
      const cy = Y(0.5);
      const deep = Math.min(b.w * 0.14, b.h * 0.12) * k;   // 括号「肚子」的横向深度
      const cx = X(0.5);

      // 大括号：用四段二次曲线描（上段-中尖-下段），左/右只差方向
      const brace = function (x, dir) {
        const x0 = x + dir * deep;                 // 上下两端（靠里）
        c.beginPath();
        c.moveTo(x0, cy - half);
        c.quadraticCurveTo(x, cy - half, x, cy - half * 0.52);
        c.lineTo(x, cy - half * 0.14);
        c.quadraticCurveTo(x, cy, x + dir * deep * 0.75, cy);
        c.quadraticCurveTo(x, cy, x, cy + half * 0.14);
        c.lineTo(x, cy + half * 0.52);
        c.quadraticCurveTo(x, cy + half, x0, cy + half);
        c.stroke();
        // 中尖再补一小段，让尖角明显（二次曲线在尖点处会被磨平）
        c.beginPath();
        c.moveTo(x, cy - half * 0.14);
        c.lineTo(x + dir * deep * 0.75, cy);
        c.lineTo(x, cy + half * 0.14);
        c.stroke();
      };
      // 圆括号 / 方括号的「半边」
      const roundHalf = function (x, dir) {
        c.beginPath();
        c.moveTo(x + dir * deep, cy - half);
        c.quadraticCurveTo(x - dir * deep * 0.4, cy, x + dir * deep, cy + half);
        c.stroke();
      };
      const squareHalf = function (x, dir) {
        c.beginPath();
        c.moveTo(x + dir * deep, cy - half);
        c.lineTo(x, cy - half);
        c.lineTo(x, cy + half);
        c.lineTo(x + dir * deep, cy + half);
        c.stroke();
      };

      if (kind === 0) brace(cx, 1);                    // 左大括号（开口朝右）
      else if (kind === 1) brace(cx, -1);              // 右大括号
      else if (kind === 2) { roundHalf(cx - b.w * 0.22, 1); roundHalf(cx + b.w * 0.22, -1); }
      else { squareHalf(cx - b.w * 0.22, 1); squareHalf(cx + b.w * 0.22, -1); }
    },
  });

  // 标注引线：从目标点画一条细斜线到右上角，末端留一小段横线给老师写字
  const LD_LEN = param('b_base_leader_len', { label: '引线长度', min: 0.3, max: 1, step: 0.05, def: 0.7, unit: '占框' });
  const LD_SHELF = param('b_base_leader_shelf', { label: '写字横线', min: 0, max: 0.5, step: 0.05, def: 0.2, unit: '占框宽' });
  const LD_DOT = param('b_base_leader_dot', { label: '目标点', min: 0, max: 1, step: 1, def: 1, unit: '0隐1显' });

  reg({
    key: 'b_base_leader', cat: 'baseDim', subject: 'base', label: '标注引线',
    icon: '<path d="M4 20L14 8"/><path d="M14 8h7"/><circle cx="4" cy="20" r="1.6"/>',
    params: [LD_LEN, LD_SHELF, LD_DOT],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const L = Math.max(0.3, Math.min(1, +o.b_base_leader_len));
      const sh = Math.max(0, Math.min(0.5, +o.b_base_leader_shelf));
      c.lineWidth = Math.max(1, o.size * 0.45);
      const x0 = X(0.14), y0 = Y(0.86);                     // 目标点
      const x1 = X(0.14 + 0.62 * L), y1 = Y(0.86 - 0.62 * L); // 斜线末端
      ln(c, x0, y0, x1, y1);
      if (sh > 0) ln(c, x1, y1, x1 + X(sh) - X(0), y1);
      if (+o.b_base_leader_dot > 0.5) {
        c.beginPath();
        c.arc(x0, y0, Math.max(1.6, b.w * 0.008), 0, Math.PI * 2);
        c.fillStyle = c.strokeStyle;
        c.fill();
      }
    },
  });
})();
