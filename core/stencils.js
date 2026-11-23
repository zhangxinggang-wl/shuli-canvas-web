/* 学科模板库（「更多图形」）—— 只挂既有的 shape 链路，不引入任何新的对象语义。
 *
 * 每个模板 make(x0,y0,x1,y1) 返回一个**普通的 shape 对象**，交给 board.js 的 drawItem 画
 * （type:'multi' 复合折线 + 可选 texts 字母标注）。因此选中 / 移动 / 缩放 / 撤销 / 重做 /
 * 序列化 / 读回 / 导出 / 删除全部沿用现成实现，这个文件一行都不用碰那些机制。
 *
 * 坐标：入参是拖拽矩形的两个角（世界坐标），内容必须落在 [l, l+w] × [t, t+h] 内。
 * 曲线（圆/弧/椭圆）一律在这里**稠密化成折线**再交给渲染端，渲染端只认折线。
 */
(function () {
  const GW = (window.GW = window.GW || {});

  // ---------- 造线小工具：一律返回「扁平点数组」[x,y,x,y,...] ----------
  const L = (x1, y1, x2, y2) => [x1, y1, x2, y2];
  const R = (l, t, w, h) => [l, t, l + w, t, l + w, t + h, l, t + h, l, t];
  function C(cx, cy, r, n) {
    const o = [], N = n || 72;
    for (let k = 0; k <= N; k++) { const a = (k / N) * 6.283185307179586; o.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    return o;
  }
  function E(cx, cy, rx, ry, n) {
    const o = [], N = n || 72;
    for (let k = 0; k <= N; k++) { const a = (k / N) * 6.283185307179586; o.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a)); }
    return o;
  }
  function A(cx, cy, r, a0, a1, n) {
    const o = [], N = n || 36;
    for (let k = 0; k <= N; k++) { const a = a0 + ((a1 - a0) * k) / N; o.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    return o;
  }
  // 椭圆弧。★ 别拿 A 当它用：A 只有一个半径，圆柱/烧杯/锥形瓶的底一旦误用 A，
  //   弧会按 w/2 的半径甩出去，整块图形冲出拖拽框（探针量到过 100+ 设计单位的越界）。
  function EA(cx, cy, rx, ry, a0, a1, n) {
    const o = [], N = n || 36;
    for (let k = 0; k <= N; k++) { const a = a0 + ((a1 - a0) * k) / N; o.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a)); }
    return o;
  }
  // 正弦波（DNA、等高线一类用）
  function S(x0, y0, x1, y1, amp, periods, n) {
    const o = [], N = n || 96;
    for (let k = 0; k <= N; k++) { const u = k / N; o.push(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + amp * Math.sin(u * periods * 6.283185307179586)); }
    return o;
  }
  const T = (x, y, s, t) => ({ x: x, y: y, s: s, t: t });
  // ---------- 教材插图的语义色（各模板不要再自己写色值，统一走这里）----------
  // ink = 器件/坐标轴/文字；red = 力、速度、电流、光线这类「有方向的量」；gray = 辅助线与尺寸线；
  // fill / fill2 只当浅色底纹（物块、液体、磁场区…），压在墨线下面。
  const PAL = { ink: '#1b2433', red: '#c8342b', gray: '#7b879b', fill: '#e9eef7', fill2: '#dbe7f6', poleN: '#f4ded9' };
  // 一段线的「颜色 + 线宽 + 填充」小容器：part(颜色, 线宽, [折线…], 填充)
  // 线宽传 0 = 用模板统一线宽（MK 里的 width），颜色传 null = 跟随画笔颜色。
  const part = (c, w, segs, f) => ({ c: c, w: w || 0, f: f || null, s: segs });
  // 浅色底纹（物块 / 液体 / 铁芯 / 磁极 / 细胞质…）：只填色不描边，而且在 MK 里永远排最前，
  // 所以先铺底再画线，墨线不会被底纹盖住。f 省略 = PAL.fill，液体这种偏蓝的传 PAL.fill2。
  const bg = (segs, f) => [{ c: null, w: 0, f: f || PAL.fill, ns: true, s: segs }];
  // 装配：segs 里既可以放折线数组，也可以放 part()（AR / AX / AD 返回的就是 part 数组）。
  // 有一处 part 才走分段上色，否则还是原来的单色行为 —— 老 .gewu 与没上色的模板一字不用改。
  function MK(segs, texts) {
    const flat = [], parts = [], bgs = [], txs = texts ? texts.slice() : [];
    for (const e of segs || []) {
      if (!e) continue;
      if (Array.isArray(e)) flat.push(e);
      else if (Array.isArray(e.s)) { if (e.ns) bgs.push(e); else parts.push(e); }
      else if (typeof e.t === 'string') txs.push(e); // 兜住「T() 被误塞进 segs」的写法（会静默丢字）
    }
    const o = { type: 'multi', width: 2.4, fill: null };
    if (parts.length || bgs.length) {
      o.parts = bgs.concat(flat.length ? [part(null, 0, flat)] : [], parts);
      o.segs = flat.slice();
      for (const p of o.parts) for (const g of p.s) o.segs.push(g);
    } else o.segs = flat;
    if (txs.length) o.texts = txs;
    return o;
  }
  const box = (x0, y0, x1, y1) => { const l = Math.min(x0, x1), t = Math.min(y0, y1); return { l: l, t: t, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }; };
  // 箭头（力 / 速度 / 电场线都用它）：杆 + **实心三角箭头**，默认红色（矢量语义）。
  // 返回的是「一个 part 的数组」，调用点一律 segs.push(...AR(...))，所以换实现不影响任何模板。
  // 羽长按杆长收（hl 是显式羽长，模板都在传），短箭头才不会缩成一团。
  function AR(x1, y1, x2, y2, hl, opt) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const l = Math.max(2.5, Math.min(hl || len * 0.26, len * 0.62)), w2 = l * 0.42;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    const bx = x2 - ux * l, by = y2 - uy * l;
    const c = (opt && opt.c) || PAL.red;
    return [part(c, (opt && opt.w) || 0, [
      [x1, y1, bx + ux * l * 0.5, by + uy * l * 0.5],
      [bx + px * w2, by + py * w2, x2, y2, bx - px * w2, by - py * w2, bx + px * w2, by + py * w2],
    ], c)];
  }
  // 坐标轴箭头：墨色（红轴会让人以为轴是矢量）
  const AX = (x1, y1, x2, y2, hl) => AR(x1, y1, x2, y2, hl, { c: PAL.ink });
  // 尺寸 / 高度 / 间距这类标注箭头：灰色
  const AD = (x1, y1, x2, y2, hl) => AR(x1, y1, x2, y2, hl, { c: PAL.gray });
  // 二次贝塞尔采样（电场线、火焰这种「一弯」的曲线用它，比硬拼折线好控）
  function Q(x0, y0, cxp, cyp, x1, y1, n) {
    const o = [], N = n || 24;
    for (let k = 0; k <= N; k++) {
      const t = k / N, m = 1 - t;
      o.push(m * m * x0 + 2 * m * t * cxp + t * t * x1, m * m * y0 + 2 * m * t * cyp + t * t * y1);
    }
    return o;
  }

  const LIST = [];
  const 组 = (g) => (o) => { o.group = g; LIST.push(o); };
  const U = 组('通用'), M = 组('数学'), X = 组('化学'), B = 组('生物'), G = 组('地理');

  // ================= 通用 =================
  U({ id: 'grid', label: '方格纸', icon: '<path d="M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), segs = [R(b.l, b.t, b.w, b.h)];
      const cn = Math.max(2, Math.max(2, Math.round(b.w / 40))), rn = Math.max(2, Math.max(2, Math.round(b.h / 40)));
      for (let i = 1; i < cn; i++) { const x = b.l + (b.w * i) / cn; segs.push(L(x, b.t, x, b.t + b.h)); }
      for (let j = 1; j < rn; j++) { const y = b.t + (b.h * j) / rn; segs.push(L(b.l, y, b.l + b.w, y)); }
      return MK(segs);
    } });

  U({ id: 'table', label: '表格', icon: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), segs = [R(b.l, b.t, b.w, b.h)];
      for (let i = 1; i < 3; i++) { const x = b.l + (b.w * i) / 3; segs.push(L(x, b.t, x, b.t + b.h)); }
      for (let j = 1; j < 4; j++) { const y = b.t + (b.h * j) / 4; segs.push(L(b.l, y, b.l + b.w, y)); }
      return MK(segs);
    } });

  U({ id: 'tianzige', label: '田字格', icon: '<path d="M3 3h18v18H3zM3 12h18M12 3v18"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1);
      return MK([R(b.l, b.t, b.w, b.h), L(b.l, b.t + b.h / 2, b.l + b.w, b.t + b.h / 2), L(b.l + b.w / 2, b.t, b.l + b.w / 2, b.t + b.h)]);
    } });

  U({ id: 'mizige', label: '米字格', icon: '<path d="M3 3h18v18H3zM3 12h18M12 3v18M4 4l16 16M20 4L4 20"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1);
      return MK([R(b.l, b.t, b.w, b.h),
        L(b.l, b.t + b.h / 2, b.l + b.w, b.t + b.h / 2), L(b.l + b.w / 2, b.t, b.l + b.w / 2, b.t + b.h),
        L(b.l, b.t, b.l + b.w, b.t + b.h), L(b.l + b.w, b.t, b.l, b.t + b.h)]);
    } });

  U({ id: 'silian', label: '四线三格', icon: '<path d="M3 5h18M3 10h18M3 14h18M3 19h18"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), segs = [];
      const ys = [0, 0.3, 0.7, 1];
      for (const u of ys) segs.push(L(b.l, b.t + b.h * u, b.l + b.w, b.t + b.h * u));
      return MK(segs);
    } });

  U({ id: 'staff', label: '五线谱', icon: '<path d="M3 5h18M3 8.5h18M3 12h18M3 15.5h18M3 19h18"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), segs = [];
      for (let i = 0; i < 5; i++) { const y = b.t + (b.h * i) / 4; segs.push(L(b.l, y, b.l + b.w, y)); }
      return MK(segs);
    } });

  // ================= 数学 =================
  // 扇形：面板上的「扇形」按钮现在插的是物理图形库的实现（带「圆心角 / 起始角 / 半径」参数，
  // 插入后还能在「参数」里调）。make() 保留旧的折线版，只给探针与「物理图形库没加载」时兜底用。
  M({ id: 'sector', label: '扇形', pbKey: 'sector', icon: '<path d="M12 12v-9a9 9 0 0 1 9 9z"/><path d="M12 12h9"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), r = Math.min(b.w, b.h) / 2, cx = b.l + r, cy = b.t + b.h - r;
      return MK([A(cx, cy, r, -Math.PI, -Math.PI / 2, 28), L(cx, cy, cx, cy - r), L(cx, cy, cx + r, cy)]);
    } });

  // 立体几何：从「物理图形」挪进数学模板（1.0.9）。按钮插的仍是物理图形库的实现（带参数、插入后可调），
  // make() 只在物理图形库没加载时兜底成方框（probe-stencils 要求每项都有 make 且返回非空）。
  const solidTpl = (id, label, icon) => M({
    id, label, pbKey: id, icon,
    make(x0, y0, x1, y1) { const b = box(x0, y0, x1, y1); return MK([R(b.l, b.t, b.w, b.h)]); },
  });
  solidTpl('solidBox', '长方体', '<path d="M4 8h12v12H4zM4 8l4-4h12v12l-4 4M16 8l4-4M16 20l4-4"/>');
  solidTpl('solidCylinder', '圆柱体', '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/>');
  solidTpl('solidSphere', '球体', '<circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="8" ry="3"/>');
  solidTpl('solidCone', '圆锥', '<path d="M12 3l7 15M12 3L5 18"/><ellipse cx="12" cy="18" rx="7" ry="3"/>');
  solidTpl('solidPrism3', '三棱柱', '<path d="M4 9l6-4 10 3v10l-6 3-10-3zM10 5v13M20 8L10 18M4 9l6 9"/>');
  solidTpl('solidHalfCyl', '半圆柱', '<path d="M3 15a9 9 0 0 1 18 0v4H3z"/><path d="M3 15a4.5 9 0 0 1 9 0"/>');
  solidTpl('solidWedge', '斜面体', '<path d="M3 19h18L3 7zM3 19V7M21 19l-4-4M3 7l4 4"/>');
  solidTpl('solidFrustum', '圆台', '<ellipse cx="12" cy="7" rx="5" ry="2.2"/><ellipse cx="12" cy="17" rx="8" ry="3"/><path d="M7 7l-3 10M17 7l3 10"/>');

  M({ id: 'angle', label: '角', icon: '<path d="M3 20h18M3 20L18 4M12 20a10 10 0 0 0-8-9"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), vx = b.l, vy = b.t + b.h;
      return MK([L(vx, vy, b.l + b.w, vy), L(vx, vy, b.l + b.w, b.t), A(vx, vy, Math.min(b.w, b.h) * 0.22, -Math.PI / 2, 0, 20)]);
    } });

  M({ id: 'cube', label: '正方体', icon: '<path d="M4 8h12v12H4zM4 8l4-4h12v12l-4 4M16 8l4-4M16 20l4-4"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), d = Math.min(b.w, b.h) * 0.34;
      const l = b.l, t = b.t + d, w = b.w - d, h = b.h - d;
      return MK([R(l, t, w, h), R(l + d, t - d, w, h),
        L(l, t, l + d, t - d), L(l + w, t, l + w + d, t - d), L(l + w, t + h, l + w + d, t + h - d), L(l, t + h, l + d, t + h - d)]);
    } });

  M({ id: 'cylinder', label: '圆柱', icon: '<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), rx = b.w / 2, ry = Math.min(b.h * 0.18, b.w * 0.22), cx = b.l + rx;
      return MK([E(cx, b.t + ry, rx, ry), EA(cx, b.t + b.h - ry, rx, ry, 0, Math.PI, 24),
        L(b.l, b.t + ry, b.l, b.t + b.h - ry), L(b.l + b.w, b.t + ry, b.l + b.w, b.t + b.h - ry)]);
    } });

  M({ id: 'sphere', label: '球', icon: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), r = Math.min(b.w, b.h) / 2, cx = b.l + b.w / 2, cy = b.t + b.h / 2;
      return MK([C(cx, cy, r), E(cx, cy, r, r * 0.36)]);
    } });

  // ---- 下面三条是初中板书画得最多、又纯静态（画完在上面手写标注）的图 ----
  M({ id: 'parallel-cut', label: '三线八角', icon: '<path d="M3 8h18M3 16h18M7 3l10 18"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1);
      const ya = b.t + b.h * 0.28, yb = b.t + b.h * 0.72;
      const xa = b.l + b.w * 0.18, xb = b.l + b.w * 0.82;
      // 截线两端是 (xa, b.t) → (xb, b.t + b.h)，与两条平行线的交点按同一条参数线算
      const xOn = (y) => xa + (xb - xa) * ((y - b.t) / b.h);
      const X1 = xOn(ya), X2 = xOn(yb);
      const d = Math.min(b.w, b.h) * 0.08, fs = Math.max(10, Math.min(b.w, b.h) * 0.11);
      return MK([L(b.l, ya, b.l + b.w, ya), L(b.l, yb, b.l + b.w, yb), L(xa, b.t, xb, b.t + b.h)],
        [T(X1 - d, ya - d, fs, '1'), T(X1 + d, ya - d, fs, '2'), T(X1 - d, ya + d, fs, '3'), T(X1 + d, ya + d, fs, '4'),
          T(X2 - d, yb - d, fs, '5'), T(X2 + d, yb - d, fs, '6'), T(X2 - d, yb + d, fs, '7'), T(X2 + d, yb + d, fs, '8')]);
    } });

  M({ id: 'pythagoras', label: '勾股定理', icon: '<path d="M3 21h10V11zM3 21H1v-2M13 11h2v2M3 21l10-10"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1);
      const A_ = 4, B_ = 3;                        // 两直角边取 3-4-5，斜边上的正方形才不会挤成一团
      const wid = A_ + 2 * B_, hei = 2 * A_ + B_;  // 整幅图（含三个外接正方形）的包围盒
      // 直角顶点放在 (0,0)，横边往 +x、竖边往 -y；再整体等比缩放进拖拽框
      const s = Math.min(b.w / wid, b.h / hei);
      const W_ = (x, y) => [b.l + (x + B_) * s, b.t + (y + A_ + B_) * s];
      const poly = (ps) => {
        const o = [];
        for (const p of ps) { const q = W_(p[0], p[1]); o.push(q[0], q[1]); }
        const q0 = W_(ps[0][0], ps[0][1]); o.push(q0[0], q0[1]);
        return o;
      };
      const fs = Math.max(10, Math.min(b.w, b.h) * 0.09);
      return MK([
        poly([[0, 0], [A_, 0], [0, -B_]]),                                  // 直角三角形
        poly([[0, 0], [A_, 0], [A_, A_], [0, A_]]),                          // 横边外侧正方形
        poly([[0, 0], [0, -B_], [-B_, -B_], [-B_, 0]]),                      // 竖边外侧正方形
        poly([[A_, 0], [0, -B_], [B_, -B_ - A_], [A_ + B_, -A_]])            // 斜边外侧正方形（法向 (B_,-A_)）
      ], [T(...W_(A_ / 2, A_ * 0.2), fs, 'a'), T(...W_(-B_ * 0.22, -B_ / 2), fs, 'b'),
        T(...W_(A_ / 2 + B_ * 0.26, -B_ / 2 - A_ * 0.26), fs, 'c')]);
    } });

  M({ id: 'circle-parts', label: '圆的要素', icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M5 8l14 9"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), r = Math.min(b.w, b.h) / 2, cx = b.l + b.w / 2, cy = b.t + b.h / 2;
      const at = (deg) => { const a = (deg * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
      const P1 = at(180), P2 = at(0), Q1 = at(210), Q2 = at(330), K = at(90), R1 = at(135);
      const fs = Math.max(10, r * 0.3);
      return MK([C(cx, cy, r), L(P1[0], P1[1], P2[0], P2[1]), L(Q1[0], Q1[1], Q2[0], Q2[1]),
        L(K[0], K[1], Q1[0], Q1[1]), L(K[0], K[1], Q2[0], Q2[1]), L(cx, cy, R1[0], R1[1])],
        [T(cx + r * 0.1, cy + r * 0.12, fs, 'O'), T(cx - r * 0.86, cy - r * 0.2, fs, 'A'),
          T(cx + r * 0.86, cy - r * 0.2, fs, 'B'), T(cx, cy + r * 0.82, fs, 'C')]);
    } });

  // ================= 物理 =================
  // 物理模板已按要求全部撤下（2026-10-17），待重新设计后再加。
  // 加回时：在此处按章建组（组名「物理 <册> · 第N章 <章名>」），并把组名补进文件末尾
  // GW.stencils.groups 的数组里。

  // 每条模板 = 一个复合图形（type multi 折线 + 可选 texts 标注），不引入任何新的对象语义。

  // 新写的模板统一用 X(u)=l+w*u、Y(v)=t+h*v（u,v∈[0,1]）取点：几何必然落在拖拽框内

  // （probe-stencils 会逐条量越界），改比例也只动小数。

  // 注：角弧一律用 A()（单半径），椭圆弧用 EA()；A 只有一个半径，别拿它画椭圆。

  X({ id: 'beaker', label: '烧杯', icon: '<path d="M5 4h14v16H5z"/><path d="M5 10h14"/><path d="M5 4l-2-2"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v, m = Math.min(b.w, b.h), fs = Math.max(9, m * 0.08);
      const l0 = X(0.24), r0 = X(0.82), t0 = Y(0.18), b0 = Y(0.88), ly = Y(0.5), segs = [];
      segs.push([l0, t0, l0, b0, r0, b0, r0, t0]);                       // 杯壁
      segs.push(L(l0, t0, r0, t0));                                       // 杯口
      segs.push(L(l0, t0, X(0.15), Y(0.1)), L(X(0.15), Y(0.1), X(0.22), Y(0.18))); // 引流嘴
      segs.push(L(l0, ly, r0, ly));                                       // 液面
      for (let i = 0; i < 3; i++) segs.push(L(X(0.76), Y(0.62 + i * 0.09), r0, Y(0.62 + i * 0.09)));
      return MK(segs, [T(X(0.53), Y(0.95), fs * 0.9, '烧杯')]);
    } });

  X({ id: 'testtube', label: '试管', icon: '<path d="M9 2v15a3 3 0 0 0 6 0V2M8 6h2M14 6h2"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), w = Math.min(b.w * 0.42, b.h * 0.28), cx = b.l + b.w / 2;
      const top = b.t + b.h * 0.08, bot = b.t + b.h - w / 2 - b.h * 0.04, ly = bot - (bot - top) * 0.46;
      const liquid = [cx - w / 2, ly, cx + w / 2, ly].concat(A(cx, bot, w / 2, 0, Math.PI, 22));
      const segs = [];
      segs.push(L(cx - w / 2, top, cx - w / 2, bot), A(cx, bot, w / 2, Math.PI, 0, 22), L(cx + w / 2, bot, cx + w / 2, top));
      segs.push(L(cx - w * 0.62, top, cx + w * 0.62, top));               // 管口
      segs.push(L(cx - w / 2, ly, cx + w / 2, ly));                       // 液面
      for (let i = 0; i < 3; i++) {
        const ty = bot - w * (0.28 + i * 0.2);
        segs.push(L(cx + w / 2 - w * 0.18, ty, cx + w / 2, ty));
      }
      return MK(segs);
    } });

  X({ id: 'flask', label: '锥形瓶', icon: '<path d="M9 3h6v5l5 11H4l5-11z"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v;
      const nw = b.w * 0.16, cx = X(0.5), top = Y(0.12), shoulder = Y(0.44), base = Y(0.92);
      const ly = Y(0.72), tt = (ly - shoulder) / (base - shoulder), hw = nw + (b.w * 0.4 - nw) * tt;
      const segs = [];
      segs.push(L(cx - nw, top, cx - nw, shoulder), L(cx + nw, top, cx + nw, shoulder));
      segs.push(L(cx - nw, shoulder, X(0.1), base), L(cx + nw, shoulder, X(0.9), base));
      segs.push(L(X(0.1), base, X(0.9), base));                           // 平底
      segs.push(L(cx - nw * 1.4, top, cx + nw * 1.4, top));               // 瓶口
      segs.push(L(cx - hw, ly, cx + hw, ly));                             // 液面
      return MK(segs, [T(cx, Y(0.86), Math.max(9, Math.min(b.w, b.h) * 0.075), '锥形瓶')]);
    } });

  X({ id: 'alcohol', label: '酒精灯', icon: '<path d="M5 20h14l-2-6H7zM12 14V9M12 9c-2-2 0-5 2-6-1 3 1 4-2 6z"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v;
      const cx = X(0.5), bodyTop = Y(0.62), bot = Y(0.94), nw = b.w * 0.05, neck = Y(0.46);
      const body = [X(0.2), bodyTop, X(0.8), bodyTop, X(0.9), bot, X(0.1), bot, X(0.2), bodyTop];
      const segs = [];
      segs.push(body);
      segs.push(L(cx - nw, bodyTop, cx - nw, neck), L(cx + nw, bodyTop, cx + nw, neck), L(cx - nw, neck, cx + nw, neck));
      segs.push(part(PAL.red, 0, [Q(cx, Y(0.1), cx - b.w * 0.16, Y(0.3), cx - nw, neck, 24),
        Q(cx, Y(0.1), cx + b.w * 0.16, Y(0.3), cx + nw, neck, 24)]));      // 火焰（红）
      segs.push(L(cx, neck, cx, Y(0.38)));                                 // 灯芯
      return MK(segs, [T(X(0.5), Y(0.86), Math.max(9, Math.min(b.w, b.h) * 0.075), '酒精')]);
    } });

  X({ id: 'funnel', label: '漏斗', icon: '<path d="M3 4h18l-7 8v8l-4-2v-6z"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v;
      const cx = X(0.5), neck = Y(0.46), nl = b.w * 0.05, segs = [];
      const cone = [X(0.04), Y(0.08), X(0.96), Y(0.08), cx + nl, neck, cx - nl, neck, X(0.04), Y(0.08)];
      segs.push(cone);
      segs.push(L(cx - nl, neck, cx - nl, Y(0.95)), L(cx + nl, neck, cx + nl, Y(0.95)));
      segs.push(L(cx - nl, Y(0.95), cx + nl, Y(0.95)));                    // 管口
      return MK(segs, [T(cx, Y(0.24), Math.max(9, Math.min(b.w, b.h) * 0.075), '漏斗')]);
    } });

  X({ id: 'atom', label: '原子结构', icon: '<circle cx="12" cy="12" r="2.5"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-60 12 12)"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), cx = b.l + b.w / 2, cy = b.t + b.h / 2, m = Math.min(b.w, b.h);
      // 60° 旋转后的椭圆半高 = √((a·sin60)² + (b·cos60)²)，必须 ≤ 框半高，否则轨道会甩出拖拽框。
      const a0 = b.w / 2, b0 = b.h * 0.17;
      const ext = Math.sqrt(Math.pow(a0 * Math.sin(1.0471975511965976), 2) + Math.pow(b0 * Math.cos(1.0471975511965976), 2));
      const k = Math.min(1, (b.h / 2) / Math.max(1e-6, ext));
      const rx = a0 * k, ry = b0 * k, segs = [];
      segs.push(C(cx, cy, Math.max(3, m * 0.06), 24));                      // 原子核
      for (const ang of [0, 1.0471975511965976, -1.0471975511965976]) {
        const co = Math.cos(ang), si = Math.sin(ang), o = [];
        for (let kk = 0; kk <= 64; kk++) { const a = (kk / 64) * 6.283185307179586, px = rx * Math.cos(a), py = ry * Math.sin(a); o.push(cx + px * co - py * si, cy + px * si + py * co); }
        segs.push(o);
        const ea = ang * 2 + 0.7, epx = rx * Math.cos(ea), epy = ry * Math.sin(ea);
        segs.push(C(cx + epx * co - epy * si, cy + epx * si + epy * co, Math.max(2.6, m * 0.024), 12)); // 电子
      }
      return MK(segs);
    } });

  B({ id: 'cell', label: '动物细胞', icon: '<ellipse cx="12" cy="12" rx="10" ry="7"/><circle cx="10" cy="11" r="2.4"/><ellipse cx="16" cy="9" rx="2.2" ry="1.2"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v, m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.075);
      const cx = X(0.5), cy = Y(0.5), segs = [];
      for (const q of [[0.28, 0.3], [0.72, 0.68]]) {
        const mx = X(q[0]), my = Y(q[1]), rx = m * 0.1, ry = m * 0.055;
        segs.push(E(mx, my, rx, ry, 32));
        segs.push(L(mx - rx * 0.6, my + ry * 0.2, mx + rx * 0.6, my - ry * 0.2));
      }
      segs.push(E(cx, cy, b.w / 2, b.h / 2, 96));                               // 细胞膜
      segs.push(C(X(0.44), Y(0.44), m * 0.15, 36));
      segs.push(EA(X(0.66), Y(0.3), m * 0.16, m * 0.1, 0.2, 2.6, 24));          // 内质网
      segs.push(EA(X(0.66), Y(0.3), m * 0.22, m * 0.14, 0.2, 2.6, 24));
      return MK(segs, [T(X(0.44), Y(0.44), fs * 0.8, '核'),
        T(X(0.28), Y(0.19), fs * 0.7, '线粒体')]);
    } });

  B({ id: 'plantcell', label: '植物细胞', icon: '<rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="8" cy="9" r="2.2"/><ellipse cx="15" cy="15" rx="3.4" ry="1.8"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v, m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.075);
      const ch = [[0.24, 0.72], [0.44, 0.2], [0.8, 0.74]], segs = [];
      segs.push(R(X(0.08), Y(0.1), b.w * 0.84, b.h * 0.8), R(X(0.1), Y(0.13), b.w * 0.8, b.h * 0.74));
      segs.push(C(X(0.26), Y(0.3), m * 0.09, 32));
      segs.push(E(X(0.62), Y(0.58), b.w * 0.2, b.h * 0.24, 48));
      for (const c of ch) {
        segs.push(EA(X(c[0]), Y(c[1]), b.w * 0.075, b.h * 0.055, 0, Math.PI, 20));
        segs.push(EA(X(c[0]), Y(c[1]), b.w * 0.075, b.h * 0.055, Math.PI, 2 * Math.PI, 20));
      }
      return MK(segs, [T(X(0.13), Y(0.2), fs * 0.9, '细胞壁'), T(X(0.26), Y(0.3), fs * 0.85, '核'),
        T(X(0.62), Y(0.58), fs, '液泡'), T(X(0.24), Y(0.84), fs * 0.85, '叶绿体')]);
    } });

  B({ id: 'dna', label: 'DNA 双螺旋', icon: '<path d="M7 2c0 6 10 6 10 12s-10 6-10 12M17 2c0 6-10 6-10 12s10 6 10 12M8 8h8M8 16h8"/>',
    make(x0, y0, x1, y1) {
      // 振幅要「留出竖直行程」：正弦在 u=1/12 就爬到 +amp，而线性项那时只走了 h/12。
      // 若线性行程直接取整个框高，波形必然冲出上下边界（实测宽扁框越界 23、窄高 15）。
      const b = box(x0, y0, x1, y1), amp = Math.min(b.w * 0.22, b.h * 0.22), cx = b.l + b.w / 2;
      const yTop = b.t + amp, span = b.h - 2 * amp;
      const a1 = S(cx, yTop, cx, yTop + span, amp, 3, 120), a2 = S(cx, yTop, cx, yTop + span, -amp, 3, 120), segs = [a1, a2];
      for (let i = 1; i < 12; i++) {
        const u = i / 12, y = yTop + span * u, dx = amp * Math.sin(u * 3 * 6.283185307179586);
        segs.push(L(cx + dx, y, cx - dx, y));
      }
      return MK(segs);
    } });

  B({ id: 'scope', label: '显微镜视野', icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v, m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.07);
      const cx = X(0.5), cy = Y(0.5), Ro = Math.min(b.w * 0.36, b.h * 0.4), Ri = Ro * 0.66, segs = [];
      segs.push(C(cx, cy, Ro, 96), C(cx, cy, Ri, 80));
      // 洋葱表皮细胞：蜂巢状排列的多边形细胞，每格一个细胞核；不再是四个方块。
      const hex = (hx, hy, r) => {
        const o = [];
        for (let i = 0; i <= 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; o.push(hx + r * Math.cos(a), hy + r * Math.sin(a)); }
        return o;
      };
      for (const c of [[0, 0], [1, 0], [-1, 0], [0.5, 0.87], [-0.5, 0.87], [0.5, -0.87], [-0.5, -0.87]]) {
        const hx = cx + c[0] * Ri * 0.52, hy = cy + c[1] * Ri * 0.52;
        segs.push(hex(hx, hy, Ri * 0.3));
        segs.push(C(hx, hy, Ri * 0.055, 14));
      }
      segs.push(L(cx - Ri * 0.3, cy + Ri * 0.9, cx + Ri * 0.3, cy + Ri * 0.9));   // 比例尺
      return MK(segs, [T(cx, cy + Ro * 1.14, fs, '洋葱表皮细胞'), T(cx + Ri * 0.66, cy + Ri * 0.9, fs * 0.8, '50μm')]);
    } });

  // 地球仪：经线 + 赤道 + 两条纬线 + 地轴与南北极
  G({ id: 'globe', label: '地球仪', icon: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M12 1v22"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v, m = Math.min(b.w, b.h), fs = Math.max(9, m * 0.075);
      const cx = X(0.5), cy = Y(0.5), R = Math.min(b.w * 0.34, b.h * 0.34), segs = [C(cx, cy, R, 96)];
      segs.push(E(cx, cy, R * 0.52, R, 48));
      segs.push(E(cx, cy, R, R * 0.2, 60));
      segs.push(E(cx, cy - R * 0.56, R * 0.83, R * 0.13, 40));
      segs.push(E(cx, cy + R * 0.56, R * 0.83, R * 0.13, 40));
      segs.push(L(cx, cy - R * 1.12, cx, cy + R * 1.12));
      return MK(segs, [T(cx, cy - R * 1.28, fs, 'N'), T(cx, cy + R * 1.34, fs, 'S'),
        T(cx, cy + R * 0.3, fs * 0.9, '赤道')]);
    } });

  // 经纬网：教材画法 = 圆 + 赤道 + 纬线（水平弦）+ 经线（竖椭圆），不是方格
  G({ id: 'graticule', label: '经纬网', icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M6 7h12M6 17h12"/><ellipse cx="12" cy="12" rx="4" ry="9"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), r = Math.min(b.w, b.h) / 2, cx = b.l + b.w / 2, cy = b.t + b.h / 2;
      const segs = [C(cx, cy, r, 96)];
      for (const v of [-0.62, -0.32, 0, 0.32, 0.62]) {
        const yy = cy + r * v, half = Math.sqrt(Math.max(0, r * r - (r * v) * (r * v)));
        segs.push(L(cx - half, yy, cx + half, yy));
      }
      for (const k of [0.35, 0.68, 1]) segs.push(E(cx, cy, r * k, r, 72));
      return MK(segs);
    } });

  // 等高线：四圈闭合曲线 + 高程标注（标注角错开，避免挤成一堆）
  G({ id: 'contour', label: '等高线', icon: '<path d="M2 17c0-5 4-8 10-8s10 3 10 8"/><path d="M6 15c0-3 3-4 6-4s6 1 6 4"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v, m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.07);
      const cx = X(0.5), cy = Y(0.54), segs = [], texts = [];
      const rings = [[0.44, 0.34], [0.32, 0.25], [0.21, 0.16], [0.1, 0.075]];
      const ang = [-0.35, -1.15, 0.45, 2.5];
      for (let i = 0; i < rings.length; i++) {
        const rx = b.w * rings[i][0], ry = b.h * rings[i][1], o = [];
        for (let j = 0; j <= 72; j++) {
          const a = (j / 72) * 6.283185307179586;
          const wob = 1 + 0.045 * Math.sin(a * 3 + i * 0.9) + 0.022 * Math.sin(a * 5 - i * 0.6);
          o.push(cx + rx * wob * Math.cos(a), cy + ry * wob * Math.sin(a));
        }
        segs.push(o);
        texts.push(T(cx + rx * Math.cos(ang[i]), cy + ry * Math.sin(ang[i]), fs, String((i + 1) * 100)));
      }
      segs.push([cx - m * 0.03, cy + m * 0.022, cx, cy - m * 0.05, cx + m * 0.03, cy + m * 0.022, cx - m * 0.03, cy + m * 0.022]);
      return MK(segs, texts);
    } });

  // ================= 1.0.10 补充：化 / 生 / 地最常用的基础图形 =================

  // 量筒：细长筒身 + 底座 + 右侧刻度
  X({ id: 'meascylinder', label: '量筒', icon: '<path d="M8 2h8v17a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z"/><path d="M8 8h3M8 12h3M8 16h3"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v;
      const m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.075), segs = [];
      const l0 = X(0.34), r0 = X(0.66), top = Y(0.08), bot = Y(0.9), ry = b.h * 0.035;
      segs.push(L(l0, top, l0, bot), L(r0, top, r0, bot));
      segs.push(EA(X(0.5), bot, (r0 - l0) / 2, ry, 0, Math.PI, 24));
      segs.push(E(X(0.5), top, (r0 - l0) / 2, ry, 24));
      segs.push(L(X(0.28), Y(0.93), X(0.72), Y(0.93)));
      segs.push(L(X(0.28), Y(0.93), X(0.34), bot), L(X(0.72), Y(0.93), X(0.66), bot));
      for (let i = 0; i < 6; i++) {
        const yy = Y(0.2 + i * 0.11);
        segs.push(L(i % 2 ? X(0.53) : X(0.49), yy, r0, yy));
      }
      return MK(segs);
    } });

  // 集气瓶：广口瓶（瓶身 + 瓶肩 + 瓶颈 + 瓶口）
  X({ id: 'gasjar', label: '集气瓶', icon: '<path d="M9 2h6v6l3 3v11H6V11l3-3z"/><path d="M9 2h6"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v;
      const m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.075), segs = [];
      segs.push(L(X(0.38), Y(0.08), X(0.38), Y(0.24)), L(X(0.62), Y(0.08), X(0.62), Y(0.24)));
      segs.push(L(X(0.38), Y(0.08), X(0.62), Y(0.08)));                    // 瓶口
      segs.push(L(X(0.38), Y(0.24), X(0.24), Y(0.34)), L(X(0.62), Y(0.24), X(0.76), Y(0.34)));
      segs.push(L(X(0.24), Y(0.34), X(0.24), Y(0.9)), L(X(0.76), Y(0.34), X(0.76), Y(0.9)));
      segs.push(L(X(0.24), Y(0.9), X(0.76), Y(0.9)));
      segs.push(L(X(0.32), Y(0.4), X(0.32), Y(0.86)));   // 玻璃反光
      return MK(segs, [T(X(0.5), Y(0.68), fs, '集气瓶')]);
    } });

  // 蒸发皿：浅口圆盘 + 小嘴 + 液体
  X({ id: 'evapdish', label: '蒸发皿', icon: '<path d="M3 10h18c0 6-4 9-9 9s-9-3-9-9z"/><path d="M20 9l2-2"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v;
      const m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.07), segs = [];
      const rim = Y(0.34), rx = b.w * 0.42, ry = b.h * 0.2;
      segs.push(EA(X(0.5), rim, rx, ry, 0, Math.PI, 48));       // 浅口圆底
      segs.push(L(X(0.08), rim, X(0.92), rim));                  // 皿口
      segs.push(L(X(0.92), rim, X(0.99), Y(0.27)));              // 小嘴
      return MK(segs, [T(X(0.5), Y(0.94), fs, '蒸发皿')]);
    } });

  // 叶片：两段对称曲线 + 主脉 + 侧脉
  B({ id: 'leaf', label: '叶片', icon: '<path d="M20 4C10 4 3 9 4 18c9 1 16-5 16-14z"/><path d="M4 18C8 12 12 8 20 4"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v;
      const m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.075), segs = [];
      const tipX = X(0.5), tipY = Y(0.06), baseX = X(0.5), baseY = Y(0.94);
      segs.push(Q(tipX, tipY, X(0.02), Y(0.34), baseX, baseY, 40));
      segs.push(Q(tipX, tipY, X(0.98), Y(0.34), baseX, baseY, 40));
      segs.push(L(tipX, tipY, baseX, baseY));                             // 主脉
      for (let i = 1; i <= 3; i++) {
        const u = i / 4, y = tipY + (baseY - tipY) * u, dx = b.w * (0.05 + 0.22 * (1 - u));
        segs.push(Q(X(0.5), y, X(0.5) - dx * 0.7, y + b.h * 0.06, X(0.5) - dx, y + b.h * 0.1, 16));
        segs.push(Q(X(0.5), y, X(0.5) + dx * 0.7, y + b.h * 0.06, X(0.5) + dx, y + b.h * 0.1, 16));
      }
      return MK(segs, [T(X(0.5), Y(0.98), fs * 0.9, '叶片')]);
    } });

  // 种子：肾形轮廓 + 种脐
  B({ id: 'seed', label: '种子', icon: '<path d="M12 3c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9z"/><path d="M7 15c2-2 2-4 0-6"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v;
      const m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.075), segs = [];
      const P = (u, v) => [X(u), Y(v)];
      const q = (a, c, d, n) => Q(a[0], a[1], c[0], c[1], d[0], d[1], n);
      // 肾形（豆形）种子：右侧鼓起、左侧带种脐凹口，不是正圆。
      let o = [];
      o = o.concat(q(P(0.55, 0.08), P(0.98, 0.18), P(0.9, 0.5), 18));
      o = o.concat(q(P(0.9, 0.5), P(0.86, 0.86), P(0.5, 0.92), 18));
      o = o.concat(q(P(0.5, 0.92), P(0.2, 0.86), P(0.28, 0.5), 18));
      o = o.concat(q(P(0.28, 0.5), P(0.2, 0.14), P(0.55, 0.08), 18));
      segs.push(o);
      segs.push(q(P(0.2, 0.43), P(0.3, 0.5), P(0.2, 0.57), 10));            // 种脐
      return MK(segs, [T(X(0.5), Y(0.97), fs * 0.9, '种子')]);
    } });

  // 神经元：胞体 + 树突 + 长轴突 + 末梢
  B({ id: 'neuron', label: '神经元', icon: '<circle cx="9" cy="9" r="4"/><path d="M9 5V2M5 9H2M9 13v4M12 6l3-3"/><path d="M13 12h9"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v;
      const m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.07), segs = [];
      const cx = X(0.32), cy = Y(0.5), r = m * 0.12;
      segs.push(C(cx, cy, r, 40));
      segs.push(C(X(0.32), Y(0.38), r * 0.32, 20));
      const branches = [[-1, -0.75], [-1, -0.2], [-1, 0.25], [-0.7, -0.95], [-0.4, 0.95]];
      for (const d of branches) {
        const ex = cx + d[0] * b.w * 0.2, ey = cy + d[1] * b.h * 0.34;
        segs.push(L(cx + d[0] * r * 0.8, cy + d[1] * r * 0.8, ex, ey));
        segs.push(L(ex, ey, ex - b.w * 0.03, ey - b.h * 0.04));
      }
      segs.push(L(cx + r, cy, X(0.86), Y(0.5)));                            // 轴突
      segs.push(L(X(0.86), Y(0.5), X(0.95), Y(0.4)), L(X(0.86), Y(0.5), X(0.95), Y(0.6)));
      segs.push(L(X(0.95), Y(0.4), X(0.99), Y(0.36)), L(X(0.95), Y(0.6), X(0.99), Y(0.64)));
      return MK(segs, [T(X(0.32), Y(0.14), fs * 0.9, '胞体'), T(X(0.62), Y(0.42), fs * 0.85, '轴突')]);
    } });

  // 太阳：圆面 + 八条光芒
  G({ id: 'sun', label: '太阳', icon: '<circle cx="12" cy="12" r="5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4M4 4l3 3M17 17l3 3M20 4l-3 3M7 17l-3 3"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v;
      const m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.075), segs = [];
      const cx = X(0.5), cy = Y(0.5), R = m * 0.26;
      segs.push(C(cx, cy, R, 64));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 6.283185307179586;
        segs.push(L(cx + R * 1.18 * Math.cos(a), cy + R * 1.18 * Math.sin(a),
                    cx + R * 1.55 * Math.cos(a), cy + R * 1.55 * Math.sin(a)));
      }
      return MK(segs, [T(cx, Y(0.96), fs, '太阳')]);
    } });

  // 地球：圆 + 倾斜地轴 + 赤道 + 南北极
  G({ id: 'earth', label: '地球', icon: '<circle cx="12" cy="12" r="8"/><path d="M6 6c4 3 8 6 12 12M12 4v16M4 12h16"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v;
      const m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.07), segs = [];
      const cx = X(0.5), cy = Y(0.5), R = m * 0.34;
      segs.push(C(cx, cy, R, 72));
      segs.push(E(cx, cy, R, R * 0.26, 64));                              // 赤道
      const tilt = 23.4 * Math.PI / 180, ux = Math.sin(tilt), uy = Math.cos(tilt);
      segs.push(L(cx - ux * R * 1.25, cy - uy * R * 1.25, cx + ux * R * 1.25, cy + uy * R * 1.25));
      segs.push(L(cx - ux * R * 0.92, cy - uy * R * 0.92, cx - ux * R * 1.15, cy - uy * R * 1.15));
      return MK(segs, [T(cx + ux * R * 1.32, cy - uy * R * 1.32, fs * 0.9, 'N'),
        T(cx - ux * R * 1.32, cy + uy * R * 1.32, fs * 0.9, 'S'), T(cx, cy + R * 0.5, fs * 0.85, '赤道')]);
    } });

  // 月球：圆面 + 环形山
  G({ id: 'moon', label: '月球', icon: '<circle cx="12" cy="12" r="8"/><circle cx="9" cy="9" r="2"/><circle cx="15" cy="14" r="2.4"/><circle cx="9" cy="16" r="1.2"/>',
    make(x0, y0, x1, y1) {
      const b = box(x0, y0, x1, y1), X = (u) => b.l + b.w * u, Y = (v) => b.t + b.h * v;
      const m = Math.min(b.w, b.h), fs = Math.max(8, m * 0.075), segs = [];
      const cx = X(0.5), cy = Y(0.48), R = m * 0.32;
      segs.push(C(cx, cy, R, 72));
      for (const c of [[-0.35, -0.3, 0.14], [0.22, 0.18, 0.19], [-0.28, 0.36, 0.1], [0.4, -0.38, 0.08]]) {
        segs.push(C(cx + R * c[0], cy + R * c[1], R * c[2], 24));
      }
      return MK(segs, [T(cx, Y(0.95), fs, '月球')]);
    } });

  // ================= 对外接口 =================
  GW.stencils = {
    list: LIST,
    groups: [
      '通用', '数学', '化学', '生物', '地理'],
    byId: (id) => LIST.find((s) => s.id === id) || null,
    // 返回普通 shape 对象（或数组，视模板而定），由调用方补 id / kind / 样式
    make(id, x0, y0, x1, y1) {
      const s = LIST.find((q) => q.id === id);
      if (!s) return null;
      try { return s.make(x0, y0, x1, y1); } catch (e) { console.error('模板 ' + id + ' 生成失败', e); return null; }
    },
    util: { L: L, R: R, C: C, E: E, A: A, S: S, T: T, MK: MK, box: box },
  };
})();
