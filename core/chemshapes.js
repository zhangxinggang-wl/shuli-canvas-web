/* 化形 · 化学可调参图形（1.6.0 第1批 C2 起）
   加载顺序：core/physshapes.js、core/physshapes-proj.js 之后，core/app.js 之前（见 src/index.html）。
   与物理图形共用同一套注册表/参数协议/P.draw 绘制链路，只多一个元数据 subject:
     · subject 缺省按 'phys' 算（老图形一个字都不用改）；
     · 化学分类 id 不写进 P.catOrder，所以物理页的 P.cats() 永远看不到它们；
     · 化学页按 P.subjectCats('chem') 取分类，app.js 再拼上「化学模板」。
   参数 key 一律 b_<科目>_<图形>_<参数>，与内置 129 个物理图形不撞名。
   新增一个图形后跑：
     node scripts/check-shape-one.js
     GW_URL="file:///…/src/index.html#shape=<key>" bash scripts/run-page.sh scripts/probe-one-shape.js 9931 1400,900
*/
(function () {
  if (!window.GW || !GW.physShapes) return;
  const P = GW.physShapes;
  P.projErrors = P.projErrors || [];
  P.catLabel = P.catLabel || {};
  P.catLabel.chemCell = '电化学';   // 化学分类的中文名（物理的分类名在 physshapes.js 里）
  P.catLabel.chemPrep = '气体制备';
  P.catLabel.chemTitrate = '酸碱滴定';
  P.catLabel.chemDistill = '蒸馏与分馏';
  P.catLabel.chemElectro = '电解池';

  // 学科元数据：老定义没有 subject 字段，一律当物理
  P.subjectOf = P.subjectOf || function (d) { return (d && d.subject) || 'phys'; };
  // 某个学科下出现过的分类 id（注册顺序；物理仍走 P.catOrder / P.cats()）
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

  // 注册：字段不合法只记错不抛出（抛出去会让后面的图形全部注册不上）
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
    d.subject = d.subject || 'chem';
    P.shapes[d.key] = d;
    if (d.cat && !P.catLabel[d.cat]) P.catLabel[d.cat] = d.cat;
    return d;
  }

  function param(key, d) {
    P.paramDefs[key] = Object.assign({ step: 1, unit: '' }, d);
    return key;
  }

  // 画图小助手：线宽/颜色由外面定（P.draw 已设 o.size），这里只描路径
  function ln(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  function arw(c, gh, x1, y1, x2, y2) { ln(c, x1, y1, x2, y2); gh.head(c, x1, y1, x2, y2, 3); }
  function rect(c, x, y, w, h, fill) {
    c.beginPath(); c.rect(x, y, w, h);
    if (fill) c.fill(); else c.stroke();
  }
  function polyline(c, pts) {
    if (!pts || !pts.length) return;
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.stroke();
  }
  // 标注：字号跟着框高走（框从 220×140 到 640×480 都要好看），不写死像素
  function txt(c, s, x, y, size, align) {
    c.save();
    c.fillStyle = '#1b2433';
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    // 1.6.0 排版：化学式与单位一律正体（Zn、SO₄、mol/L），变量斜体
    if (GW.typo) GW.typo.draw(c, String(s), x, y, size, { align: align || 'left', color: '#1b2433' });
    else {
      c.font = '600 ' + size.toFixed(1) + 'px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
      c.fillText(s, x, y);
    }
    c.restore();
  }

  /* ---------- 电化学 · 锌铜原电池 ---------- */
  const CELL_SW = param('b_chem_zncu_sw', { label: '电路', min: 0, max: 1, step: 1, def: 1, unit: '0断1通' });
  const CELL_E = param('b_chem_zncu_e', { label: '电子流', min: 0, max: 1, step: 1, def: 1, unit: '0隐1显' });
  const CELL_ION = param('b_chem_zncu_ion', { label: '盐桥离子', min: 0, max: 1, step: 1, def: 1, unit: '0隐1显' });
  // 默认少写字（1.6.0 定稿）：图上只留 Zn/Cu 这种「不看名字读不懂」的符号，其余标注老师自己写
  const CELL_LAB = param('b_chem_zncu_lab', { label: '文字标注', min: 0, max: 1, step: 1, def: 0, unit: '0隐1显' });

  reg({
    key: 'b_chem_zncu', cat: 'chemCell', subject: 'chem', label: '锌铜原电池',
    icon: '<path d="M6 3v7M18 3v7"/><path d="M3 10h7v9H3z"/><path d="M14 10h7v9h-7z"/><path d="M10 5h4"/><path d="M6 6h2M16 6h2"/>',
    params: [CELL_SW, CELL_E, CELL_ION, CELL_LAB],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const on = (k, d) => (o[k] == null ? d : +o[k] > 0.5);
      const sw = on(CELL_SW, true), eFlow = sw && on(CELL_E, true);
      const iFlow = sw && on(CELL_ION, true), lab = on(CELL_LAB, true);
      const fs = Math.max(8.5, Math.min(13, b.h * 0.048));
      const sm = fs * 0.86;

      // 几何（u/v 都是框内比例）：两只烧杯、两片电极、外电路、盐桥
      const B1 = [0.10, 0.34], B2 = [0.66, 0.90];   // 烧杯左右边界
      const RIM = 0.46, BOT = 0.90;                 // 杯口 / 杯底
      const SOL = 0.56;                             // 液面
      const EX1 = 0.22, EX2 = 0.78;                 // 电极中心
      const ETOP = 0.50, EBOT = 0.86;               // 电极上下端
      const WY = 0.16;                              // 导线高度
      const SW0 = 0.44, SW1 = 0.56;                 // 开关两端
      const BR = 0.30;                              // 盐桥横管
      const BS1 = 0.30, BS2 = 0.70, BDIP = 0.66;    // 盐桥两脚与插入深度

      // 溶液（浅色填充 + 液面线）
      c.fillStyle = GH.tint(o.color, 0.10);
      rect(c, X(B1[0]), Y(SOL), X(B1[1]) - X(B1[0]), Y(BOT) - Y(SOL), true);
      rect(c, X(B2[0]), Y(SOL), X(B2[1]) - X(B2[0]), Y(BOT) - Y(SOL), true);
      c.fillStyle = o.color;
      ln(c, X(B1[0]), Y(SOL), X(B1[1]), Y(SOL));
      ln(c, X(B2[0]), Y(SOL), X(B2[1]), Y(SOL));

      // 杯体（U 形：左壁 - 底 - 右壁）
      [B1, B2].forEach((r) => polyline(c, [[X(r[0]), Y(RIM)], [X(r[0]), Y(BOT)], [X(r[1]), Y(BOT)], [X(r[1]), Y(RIM)]]));

      // 电极片（窄实心条，30% 淡填，一眼能看出是金属片）
      const ew = Math.max(1.5, b.w * 0.011);
      c.fillStyle = GH.tint(o.color, 0.30);
      rect(c, X(EX1) - ew, Y(ETOP), ew * 2, Y(EBOT) - Y(ETOP), true);
      rect(c, X(EX2) - ew, Y(ETOP), ew * 2, Y(EBOT) - Y(ETOP), true);
      c.fillStyle = o.color;

      // 外电路：左电极 → 上 → 开关左端；开关右端 → 上 → 右电极
      polyline(c, [[X(EX1), Y(ETOP)], [X(EX1), Y(WY)], [X(SW0), Y(WY)]]);
      polyline(c, [[X(SW1), Y(WY)], [X(EX2), Y(WY)], [X(EX2), Y(ETOP)]]);
      // 开关：闭合是一条直连杆；断开把连杆抬起来（角度随框，避免小框上糊成一团）
      if (sw) ln(c, X(SW0), Y(WY), X(SW1), Y(WY));
      else ln(c, X(SW0), Y(WY), X(SW0 + (SW1 - SW0) * 0.92), Y(WY - 0.075));
      const kr = Math.max(1.8, o.size * 0.9);
      c.beginPath();
      c.arc(X(SW0), Y(WY), kr, 0, Math.PI * 2);
      c.arc(X(SW1), Y(WY), kr, 0, Math.PI * 2);
      c.fill();

      // 盐桥：倒 U 形管，两脚插进两侧溶液
      polyline(c, [[X(BS1), Y(BDIP)], [X(BS1), Y(BR)], [X(BS2), Y(BR)], [X(BS2), Y(BDIP)]]);

      // 外电路电子流：e⁻ 从 Zn（负极）经导线到 Cu（正极），箭头只画在导线段上
      if (eFlow) {
        arw(c, GH, X(0.255), Y(WY), X(0.345), Y(WY));
        arw(c, GH, X(0.615), Y(WY), X(0.735), Y(WY));
        if (lab) txt(c, 'e⁻', X(0.30), Y(WY - 0.045), sm, 'center');
      }

      // 盐桥离子：Cl⁻ 向锌半池（左）、K⁺ 向铜半池（右）——盐桥里走的是离子，不画电子
      if (iFlow) {
        arw(c, GH, X(0.43), Y(BR), X(0.355), Y(BR));
        arw(c, GH, X(0.57), Y(BR), X(0.645), Y(BR));
        if (lab) {
          txt(c, 'Cl⁻', X(0.40), Y(BR - 0.038), sm, 'center');
          txt(c, 'K⁺', X(0.60), Y(BR - 0.038), sm, 'center');
        }
      }

      // 元素符号常驻：电极片是空白矩形，不写字就分不出锌铜
      txt(c, 'Zn', X(EX1 - 0.055), Y(0.505), fs, 'right');
      txt(c, 'Cu', X(EX2 + 0.055), Y(0.505), fs, 'left');
      if (lab) {
        const c1 = (B1[0] + B1[1]) / 2, c2 = (B2[0] + B2[1]) / 2;
        txt(c, '负极·阳极', X(c1), Y(0.935), sm, 'center');
        txt(c, '正极·阴极', X(c2), Y(0.935), sm, 'center');
        txt(c, 'ZnSO₄ 溶液', X(c1), Y(0.975), sm, 'center');
        txt(c, 'CuSO₄ 溶液', X(c2), Y(0.975), sm, 'center');
        txt(c, '盐桥（KCl）', X(0.50), Y(BR + 0.048), sm, 'center');
        if (!sw) txt(c, '断路', X(0.50), Y(WY - 0.022), sm, 'center');
      }
    },
  });

  /* ---------- 气体制备 · 发生—收集装置（1.6.0 C1） ---------- */
  // 只收录经核对的两种发生装置 × 两种收集方式，不做「挑气体→自动推断反应」：
  //   dev=0 固液常温（锥形瓶 + 双氧水/MnO₂），dev=1 固固加热（试管 + 酒精灯，管口塞棉花）
  //   col=0 向上排空气（导管插到瓶底），col=1 排水法（集气瓶倒扣在水槽里，气泡上升）
  // 默认不写字：装置本身能认出来，气体名/药品名留给老师写。
  const C1_DEV = param('b_chem_gasPrep_dev', { label: '发生装置', min: 0, max: 1, step: 1, def: 0, unit: '0固液常温1固固加热' });
  const C1_COL = param('b_chem_gasPrep_col', { label: '收集方式', min: 0, max: 1, step: 1, def: 0, unit: '0向上排空气1排水法' });
  const C1_LAB = param('b_chem_gasPrep_lab', { label: '文字标注', min: 0, max: 1, step: 1, def: 0, unit: '0隐1显' });

  reg({
    key: 'b_chem_gasPrep', cat: 'chemPrep', subject: 'chem', label: '气体制备与收集',
    icon: '<path d="M5 20V9h4v11z"/><path d="M7 9V3h2"/><path d="M15 4v16h5V4z"/>',
    params: [C1_DEV, C1_COL, C1_LAB],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const on = (k, d) => (o[k] == null ? d : +o[k] > 0.5);
      const heated = on(C1_DEV, false), drain = on(C1_COL, false), lab = on(C1_LAB, false);
      const fs = Math.max(8.5, Math.min(12.5, b.h * 0.045));
      const lw = Math.max(1, o.size * 0.5);
      c.lineWidth = lw;

      const JX = 0.68, JW = 0.085;         // 集气瓶中心与半宽
      const TOP = 0.28, BOT = 0.72;        // 集气瓶上下
      const TUBE_Y = 0.20;                 // 导管水平段高度
      const OUT = [];                      // 导管折线（供箭头定位）

      if (!heated) {
        // 锥形瓶：颈 + 锥体（左右斜边）
        const cx = 0.20, NW = 0.030, BW = 0.115;
        const NTOP = 0.24, BTOP = 0.38, BBOT = 0.82;
        polyline(c, [[X(cx - NW), Y(NTOP)], [X(cx - NW), Y(BTOP)], [X(cx - BW), Y(BBOT)],
          [X(cx + BW), Y(BBOT)], [X(cx + NW), Y(BTOP)], [X(cx + NW), Y(NTOP)]]);
        // 液面以下浅色填充（梯形，按锥体当时的半宽算，边线不会露出来）
        const hwAt = (v) => NW + (BW - NW) * (v - BTOP) / (BBOT - BTOP);
        const level = 0.58;
        c.save();
        c.beginPath();
        c.moveTo(X(cx - hwAt(level)), Y(level));
        c.lineTo(X(cx - BW), Y(BBOT));
        c.lineTo(X(cx + BW), Y(BBOT));
        c.lineTo(X(cx + hwAt(level)), Y(level));
        c.closePath();
        c.fillStyle = GH.tint(o.color, 0.10);
        c.fill();
        c.restore();
        ln(c, X(cx - hwAt(level)), Y(level), X(cx + hwAt(level)), Y(level));
        // 固体催化剂：瓶底几粒（位置写死，保证每次画一样）
        c.save();
        c.fillStyle = GH.tint(o.color, 0.45);
        const gr = Math.max(1.2, b.w * 0.006);
        [[-0.055, 0.765], [-0.02, 0.79], [0.02, 0.768], [0.055, 0.792], [0, 0.752]].forEach((g) => {
          c.beginPath(); c.arc(X(cx + g[0]), Y(g[1]), gr, 0, Math.PI * 2); c.fill();
        });
        c.restore();
        // 单孔塞
        c.save();
        c.beginPath();
        c.rect(X(cx - NW * 1.5), Y(NTOP - 0.035), X(NW * 3) - X(0), Y(NTOP + 0.012) - Y(NTOP - 0.035));
        c.fillStyle = GH.tint(o.color, 0.30);
        c.fill();
        c.stroke();
        c.restore();
        OUT.push([cx, NTOP - 0.03], [cx, TUBE_Y], [JX, TUBE_Y]);
      } else {
        // 试管（竖直，带圆底）+ 酒精灯
        const cx = 0.18, TW = 0.045, TTOP = 0.24, TBOT = 0.66;
        c.beginPath();
        c.moveTo(X(cx - TW), Y(TTOP));
        c.lineTo(X(cx - TW), Y(TBOT - 0.06));
        c.quadraticCurveTo(X(cx - TW), Y(TBOT), X(cx), Y(TBOT));
        c.quadraticCurveTo(X(cx + TW), Y(TBOT), X(cx + TW), Y(TBOT - 0.06));
        c.lineTo(X(cx + TW), Y(TTOP));
        c.stroke();
        // 药品：斜铺在管底
        c.save();
        c.beginPath();
        c.moveTo(X(cx - TW), Y(0.56));
        c.lineTo(X(cx + TW), Y(0.60));
        c.lineTo(X(cx + TW), Y(TBOT - 0.01));
        c.lineTo(X(cx - TW), Y(TBOT - 0.01));
        c.closePath();
        c.fillStyle = GH.tint(o.color, 0.30);
        c.fill();
        c.restore();
        // 管口棉花（交叉短线）
        const cy0 = Y(0.30), cy1 = Y(0.35);
        for (let i = 0; i < 3; i++) {
          const px = X(cx - TW) + (X(cx + TW) - X(cx - TW)) * (i + 0.5) / 3;
          ln(c, px - b.w * 0.008, cy0, px + b.w * 0.008, cy1);
          ln(c, px + b.w * 0.008, cy0, px - b.w * 0.008, cy1);
        }
        // 酒精灯：灯体梯形 + 火焰
        const lamp = Y(0.84);
        polyline(c, [[X(cx - 0.07), lamp], [X(cx - 0.045), Y(0.74)], [X(cx + 0.045), Y(0.74)], [X(cx + 0.07), lamp], [X(cx - 0.07), lamp]]);
        ln(c, X(cx - 0.012), Y(0.74), X(cx - 0.012), Y(0.72));
        ln(c, X(cx + 0.012), Y(0.74), X(cx + 0.012), Y(0.72));
        c.save();
        c.beginPath();
        c.moveTo(X(cx - 0.022), Y(0.72));
        c.quadraticCurveTo(X(cx), Y(0.665), X(cx + 0.022), Y(0.72));
        c.closePath();
        c.fillStyle = GH.tint(o.color, 0.30);
        c.fill();
        c.restore();
        OUT.push([cx, TTOP], [cx, TUBE_Y], [JX, TUBE_Y]);
      }

      // 导管：从发生装置出来 → 水平段 → 进入收集装置
      if (!drain) {
        // 向上排空气：导管插到瓶底
        const tube = OUT.concat([[JX, BOT - 0.04]]);
        polyline(c, tube.map((p) => [X(p[0]), Y(p[1])]));
        // 集气瓶：瓶口朝上（U 形），气体从下往上把空气压出去
        polyline(c, [[X(JX - JW), Y(TOP)], [X(JX - JW), Y(BOT)], [X(JX + JW), Y(BOT)], [X(JX + JW), Y(TOP)]]);
        // 气流箭头画在导管水平段中部（贴在瓶口右侧会看着像脱离装置）
        arw(c, GH, X(0.40), Y(TUBE_Y), X(0.47), Y(TUBE_Y));
      } else {
        // 排水法：水槽 + 倒扣的集气瓶 + 气泡
        c.save();
        c.beginPath();
        c.rect(X(0.54), Y(0.60), X(0.94) - X(0.54), Y(0.90) - Y(0.60));
        c.fillStyle = GH.tint(o.color, 0.10);
        c.fill();
        c.restore();
        polyline(c, [[X(0.54), Y(0.60)], [X(0.54), Y(0.90)], [X(0.94), Y(0.90)], [X(0.94), Y(0.60)]]);
        // 倒扣集气瓶：瓶口在水下，瓶底在上
        polyline(c, [[X(JX - JW), Y(0.66)], [X(JX - JW), Y(TOP)], [X(JX + JW), Y(TOP)], [X(JX + JW), Y(0.66)]]);
        // 瓶内水面（气体已收集到一半）
        ln(c, X(JX - JW), Y(0.50), X(JX + JW), Y(0.50));
        // 导管从水槽边下去、从瓶口伸进去
        const tube = OUT.concat([[0.52, TUBE_Y], [0.52, 0.86], [JX, 0.86], [JX, 0.63]]);
        polyline(c, tube.map((p) => [X(p[0]), Y(p[1])]));
        // 气泡：从管口升到瓶内水面
        c.save();
        const br = Math.max(1.2, b.w * 0.007);
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.arc(X(JX + (i % 2 ? 0.03 : -0.012)), Y(0.60 - i * 0.024), br, 0, Math.PI * 2);
          c.stroke();
        }
        c.restore();
        arw(c, GH, X(0.40), Y(TUBE_Y), X(0.47), Y(TUBE_Y));
      }

      if (lab) {
        if (!heated) txt(c, 'MnO₂', X(0.20), Y(0.86), fs, 'center');
        else txt(c, 'KMnO₄', X(0.18), Y(0.78), fs, 'center');
        txt(c, 'O₂', X(JX), Y(drain ? 0.40 : 0.56), fs, 'center');
      }
    },
  });

  /* ---------- 酸碱滴定（1.6.0 C3） ---------- */
  // 滴定管 + 锥形瓶。滴入体积越大，瓶内液面越高、颜色越深；到终点后颜色突变一次。
  // 不写「终点」两个字：颜色变化本身就是信号（少写字原则）。
  const TIT_V = param('b_chem_titrate_v', { label: '滴入体积', min: 0, max: 25, step: 0.5, def: 8, unit: 'mL' });
  const TIT_END = param('b_chem_titrate_end', { label: '终点', min: 0, max: 1, step: 1, def: 0, unit: '0未到1已到' });
  const TIT_LAB = param('b_chem_titrate_lab', { label: '文字标注', min: 0, max: 1, step: 1, def: 0, unit: '0隐1显' });

  reg({
    key: 'b_chem_titrate', cat: 'chemTitrate', subject: 'chem', label: '酸碱滴定',
    icon: '<path d="M9 3v14h6V3"/><path d="M7 21h12l-3-5H10z"/><path d="M9 8h6"/>',
    params: [TIT_V, TIT_END, TIT_LAB],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const v = Math.max(0, Math.min(25, +o.b_chem_titrate_v));
      const ended = +o.b_chem_titrate_end > 0.5;
      const lab = +o.b_chem_titrate_lab > 0.5;
      const fs = Math.max(8.5, Math.min(12.5, b.h * 0.042));
      c.lineWidth = Math.max(1, o.size * 0.5);

      // 滴定管：细长管 + 刻度 + 旋塞
      const bxc = 0.30, bw = 0.022;
      polyline(c, [[X(bxc - bw), Y(0.10)], [X(bxc - bw), Y(0.46)], [X(bxc + bw), Y(0.46)], [X(bxc + bw), Y(0.10)]]);
      for (let i = 1; i < 10; i++) {
        const yy = Y(0.10 + 0.036 * i);
        ln(c, X(bxc + bw), yy, X(bxc + bw - (i % 5 ? 0.010 : 0.016)), yy);
      }
      // 管内液面：滴得越多，液面越低
      const lvl = 0.14 + (v / 25) * 0.26;
      c.save();
      c.beginPath();
      c.rect(X(bxc - bw), Y(lvl), X(2 * bw) - X(0), Y(0.46) - Y(lvl));
      c.fillStyle = GH.tint(o.color, 0.16);
      c.fill();
      c.restore();
      ln(c, X(bxc - bw), Y(lvl), X(bxc + bw), Y(lvl));
      // 旋塞
      ln(c, X(bxc - bw), Y(0.46), X(bxc - bw), Y(0.50));
      ln(c, X(bxc + bw), Y(0.46), X(bxc + bw), Y(0.50));
      ln(c, X(bxc - 0.03), Y(0.50), X(bxc + 0.03), Y(0.50));
      // 滴管尖 + 一滴液滴
      polyline(c, [[X(bxc - 0.012), Y(0.50)], [X(bxc), Y(0.55)], [X(bxc + 0.012), Y(0.50)]]);
      if (v > 0 && !ended) {
        c.save();
        c.beginPath();
        c.arc(X(bxc), Y(0.585), Math.max(1.2, b.w * 0.006), 0, Math.PI * 2);
        c.fillStyle = GH.tint(o.color, 0.6);
        c.fill();
        c.restore();
      }

      // 锥形瓶
      const fx = 0.30, hw = 0.115, nw = 0.030;
      const NTOP = 0.62, BTOP = 0.70, BBOT = 0.90;
      polyline(c, [[X(fx - nw), Y(NTOP)], [X(fx - nw), Y(BTOP)], [X(fx - hw), Y(BBOT)],
        [X(fx + hw), Y(BBOT)], [X(fx + nw), Y(BTOP)], [X(fx + nw), Y(NTOP)]]);
      // 瓶内液体：体积越多越高，终点颜色深一档（指示剂变色）
      const lv = 0.80 - (v / 25) * 0.05;
      const hwAt = (vv) => nw + (hw - nw) * (vv - BTOP) / (BBOT - BTOP);
      c.save();
      c.beginPath();
      c.moveTo(X(fx - hwAt(lv)), Y(lv));
      c.lineTo(X(fx - hw), Y(BBOT));
      c.lineTo(X(fx + hw), Y(BBOT));
      c.lineTo(X(fx + hwAt(lv)), Y(lv));
      c.closePath();
      c.fillStyle = GH.tint(o.color, ended ? 0.34 : 0.12);
      c.fill();
      c.restore();
      ln(c, X(fx - hwAt(lv)), Y(lv), X(fx + hwAt(lv)), Y(lv));
      // 搅拌：瓶里一根细杆 + 小圈
      ln(c, X(fx + 0.03), Y(0.66), X(fx + 0.055), Y(0.86));
      if (lab) {
        txt(c, 'NaOH', X(0.30), Y(0.075), fs, 'center');
        txt(c, 'HCl', X(0.30), Y(0.955), fs, 'center');
      }
    },
  });

  /* ---------- 蒸馏（1.6.0 C4） ---------- */
  // 圆底烧瓶 + 温度计 + 直形冷凝管 + 接收瓶。冷凝水没通时，蒸出的气体画成「直冲」的箭头；
  // 通了就画成沿管壁流下的液滴 —— 一眼能看出冷凝管的作用。
  const DIST_FLOW = param('b_chem_distill_flow', { label: '冷凝水', min: 0, max: 1, step: 1, def: 1, unit: '0断1通' });
  const DIST_LAB = param('b_chem_distill_lab', { label: '文字标注', min: 0, max: 1, step: 1, def: 0, unit: '0隐1显' });

  reg({
    key: 'b_chem_distill', cat: 'chemDistill', subject: 'chem', label: '蒸馏装置',
    icon: '<circle cx="7" cy="16" r="4"/><path d="M7 12V5h2l10 6"/><path d="M19 16l-3 4"/>',
    params: [DIST_FLOW, DIST_LAB],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const flow = +o.b_chem_distill_flow > 0.5;
      const lab = +o.b_chem_distill_lab > 0.5;
      const fs = Math.max(8.5, Math.min(12.5, b.h * 0.042));
      c.lineWidth = Math.max(1, o.size * 0.5);

      // 圆底烧瓶（瓶颈 + 圆底）
      const fx = 0.16, fy = 0.62, fr = 0.10;
      c.save();
      c.beginPath();
      c.moveTo(X(fx - 0.035), Y(0.46));
      c.lineTo(X(fx - 0.035), Y(0.54));
      c.arc(X(fx), Y(fy), X(fr) - X(0), Math.PI * 0.68, Math.PI * 0.32, true);
      c.lineTo(X(fx + 0.035), Y(0.46));
      c.stroke();
      c.restore();
      // 瓶内液体
      c.save();
      c.beginPath();
      c.arc(X(fx), Y(fy), X(fr * 0.86) - X(0), 0, Math.PI * 2);
      c.fillStyle = GH.tint(o.color, 0.12);
      c.fill();
      c.restore();
      // 温度计的球部必须落在支管口这一层（蒸气从这儿出去，量的才是馏出温度）。
      // 以前球心在 0.54、支管在 0.44，低了 0.10H，是错的构图（复审问题 6）。
      const JUNC = 0.44;
      const bulbR = Math.max(1.8, b.w * 0.011);
      ln(c, X(fx), Y(0.28), X(fx), Y(JUNC) - bulbR);
      c.save();
      c.beginPath();
      c.arc(X(fx), Y(JUNC), bulbR, 0, Math.PI * 2);
      c.fill();
      c.restore();
      // 支管：从球部所在的支管口向右引到冷凝管
      polyline(c, [[X(fx), Y(JUNC)], [X(0.34), Y(0.38)], [X(0.42), Y(0.38)]]);
      // 冷凝管：外管（倾斜）+ 内管
      const cx1 = 0.42, cx2 = 0.70, cy1 = 0.38, cy2 = 0.46;
      ln(c, X(cx1), Y(cy1 - 0.05), X(cx2), Y(cy2 - 0.05));
      ln(c, X(cx1), Y(cy1 + 0.05), X(cx2), Y(cy2 + 0.05));
      ln(c, X(cx1), Y(cy1 - 0.05), X(cx1), Y(cy1 + 0.05));
      ln(c, X(cx2), Y(cy2 - 0.05), X(cx2), Y(cy2 + 0.05));
      // 冷凝水进出小管
      ln(c, X(cx1 + 0.02), Y(cy1 + 0.05), X(cx1 + 0.02), Y(cy1 + 0.11));
      ln(c, X(cx2 - 0.02), Y(cy2 - 0.05), X(cx2 - 0.02), Y(cy2 - 0.11));
      // 管内：通水就是向下的小液滴，没通就是向前的蒸汽箭头
      if (flow) {
        for (let i = 0; i < 5; i++) {
          const t = (i + 0.5) / 5;
          const px = X(cx1 + (cx2 - cx1) * t), py = Y(cy1 + (cy2 - cy1) * t) + Math.min(b.w, b.h) * 0.02;
          arw(c, GH, px, py - b.h * 0.02, px + b.w * 0.012, py + b.h * 0.004);
        }
      } else {
        arw(c, GH, X(cx1 + 0.04), Y(cy1 + 0.005), X(cx2 - 0.04), Y(cy2 + 0.005));
      }
      // 接收瓶（锥形瓶小号）
      const rx = 0.82;
      polyline(c, [[X(rx - 0.022), Y(0.56)], [X(rx - 0.022), Y(0.62)], [X(rx - 0.075), Y(0.84)],
        [X(rx + 0.075), Y(0.84)], [X(rx + 0.022), Y(0.62)], [X(rx + 0.022), Y(0.56)]]);
      c.save();
      c.beginPath();
      c.moveTo(X(rx - 0.055), Y(0.76));
      c.lineTo(X(rx - 0.075), Y(0.84));
      c.lineTo(X(rx + 0.075), Y(0.84));
      c.lineTo(X(rx + 0.055), Y(0.76));
      c.closePath();
      c.fillStyle = GH.tint(o.color, 0.14);
      c.fill();
      c.restore();
      // 冷凝管到接收瓶的连接弯管
      polyline(c, [[X(cx2), Y(cy2 + 0.005)], [X(rx), Y(cy2 + 0.005)], [X(rx), Y(0.56)]]);
      if (lab) {
        txt(c, '水', X(fx), Y(0.70), fs, 'center');
        txt(c, '冷凝管', X(0.56), Y(0.28), fs, 'center');
      }
    },
  });

  /* ---------- 电解池（1.6.0 C5） ---------- */
  // 烧杯里两支电极接直流电源。通电后阳极冒气泡、阴极析出（用气泡/沉积点表示），
  // 断电就都停下 —— 与 C2 原电池共用「烧杯 + 电极 + 导线」的画法。
  const EL_ON = param('b_chem_electro_on', { label: '通电', min: 0, max: 1, step: 1, def: 1, unit: '0断1通' });
  const EL_GAS = param('b_chem_electro_gas', { label: '气泡', min: 0, max: 1, step: 1, def: 1, unit: '0隐1显' });
  const EL_LAB = param('b_chem_electro_lab', { label: '文字标注', min: 0, max: 1, step: 1, def: 0, unit: '0隐1显' });

  reg({
    key: 'b_chem_electro', cat: 'chemElectro', subject: 'chem', label: '电解池',
    icon: '<path d="M4 6h4v12H4zM16 6h4v12h-4z"/><path d="M8 9h4M12 15h4"/><path d="M12 6v12"/>',
    params: [EL_ON, EL_GAS, EL_LAB],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const on = +o.b_chem_electro_on > 0.5, gas = on && +o.b_chem_electro_gas > 0.5;
      const lab = +o.b_chem_electro_lab > 0.5;
      const fs = Math.max(8.5, Math.min(12.5, b.h * 0.042));
      c.lineWidth = Math.max(1, o.size * 0.5);

      const L = 0.16, R = 0.84, RIM = 0.44, BOT = 0.88, SOL = 0.56;
      const EX1 = 0.32, EX2 = 0.68, ETOP = 0.50, EBOT = 0.84;
      // 溶液与杯体
      c.save();
      c.beginPath();
      c.rect(X(L), Y(SOL), X(R) - X(L), Y(BOT) - Y(SOL));
      c.fillStyle = GH.tint(o.color, 0.10);
      c.fill();
      c.restore();
      ln(c, X(L), Y(SOL), X(R), Y(SOL));
      polyline(c, [[X(L), Y(RIM)], [X(L), Y(BOT)], [X(R), Y(BOT)], [X(R), Y(RIM)]]);
      // 电极
      const ew = Math.max(1.5, b.w * 0.010);
      c.save();
      c.fillStyle = GH.tint(o.color, 0.30);
      c.fillRect(X(EX1) - ew, Y(ETOP), ew * 2, Y(EBOT) - Y(ETOP));
      c.fillRect(X(EX2) - ew, Y(ETOP), ew * 2, Y(EBOT) - Y(ETOP));
      c.restore();
      // 电源 + 导线
      polyline(c, [[X(EX1), Y(ETOP)], [X(EX1), Y(0.20)], [X(0.44), Y(0.20)]]);
      polyline(c, [[X(EX2), Y(ETOP)], [X(EX2), Y(0.20)], [X(0.56), Y(0.20)]]);
      // 直流电源符号：长线（正极）+ 短线（负极）
      ln(c, X(0.44), Y(0.20), X(0.44), Y(0.14));
      ln(c, X(0.47), Y(0.20), X(0.47), Y(0.16));
      ln(c, X(0.56), Y(0.20), X(0.56), Y(0.16));
      ln(c, X(0.53), Y(0.20), X(0.53), Y(0.14));
      // 气泡：阳极一侧多、阴极一侧少（用数量差表示产物不同）
      if (gas) {
        const br = Math.max(1.2, b.w * 0.006);
        for (let i = 0; i < 7; i++) {
          c.beginPath();
          c.arc(X(EX1 + 0.035 + (i % 2) * 0.03), Y(0.80 - i * 0.026), br, 0, Math.PI * 2);
          c.stroke();
        }
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.arc(X(EX2 + 0.035 + (i % 2) * 0.03), Y(0.78 - i * 0.03), br, 0, Math.PI * 2);
          c.stroke();
        }
      }
      if (lab) {
        txt(c, '阳极', X(EX1), Y(0.94), fs, 'center');
        txt(c, '阴极', X(EX2), Y(0.94), fs, 'center');
      }
    },
  });

})();
