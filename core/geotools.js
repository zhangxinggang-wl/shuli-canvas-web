/* 数理无限画布 · 尺规工具：直尺、三角板(45°/30°)、量角器、圆规 —— 笔迹靠近边缘自动吸附
 *
 * 交互约定（鼠标 / 手指 / 触控笔完全一致）：
 *  · 每件工具上方都有一条工具条：「⠿ 移动」「⟳ 旋转（吸附 15°）」「✕ 收起」，
 *    按住即拖动、点一下收起 —— 反向缩放，屏幕上始终同样大小、始终点得到；
 *  · 量角器另有测量臂圆钮（拖动改角度），圆规另有针尖（移动）、笔尖（调半径）、顶部手柄（画弧）；
 *  · 「交互」模式下按住工具本体也能拖动；笔 / 荧光笔 / 图形等模式下本体不接收指针事件，
 *    笔可以压在尺子上起笔，再沿边缘自动吸附；
 *  · 拖动期间在 window 上跟踪 pointermove / pointerup，不使用 setPointerCapture：
 *    光标移出图形、工具被置顶移动都不会丢事件；
 *  · **拖动中绝不重建承载这个指针的节点**：触摸有「隐式指针捕获」，节点一被删就从文档里
 *    摘掉捕获目标，Chromium 会补一个 pointercancel 把这次手势掐掉（鼠标看不出来）。
 *    圆规的画弧手柄因此只在第一次建出来，重绘只改属性（见 drawCompass）；
 *  · 每个手柄都画在尺寸合适的 SVG 视口内（viewBox 覆盖全部内容），不依赖视口之外的命中测试。
 */
(function () {
  'use strict';
  const GW = window.GW, h = GW.h;
  const CM = 40;                  // 1 厘米 = 40 世界单位
  // 1.7.4（R6）：尺规读数（照 GoodNotes 的「显示数字 + 厘米/英寸」）。
  // 单位只影响**标签文字**，尺子本身的厘米刻度与吸附间距一律不动 —— 换单位不该改手感。
  function readLen(cm) {
    if (((GW.settings || {}).geoUnit) === 'in') return (cm / 2.54).toFixed(2) + ' in';
    return cm.toFixed(1) + ' cm';
  }
  const NS = 'http://www.w3.org/2000/svg';
  const HIT = 30;                 // 手柄热区半径
  const KNOB = 20;                // 手柄可见半径
  const PAD = 14;                 // SVG 视口留边
  const tools = [];
  let layer;

  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  function local2world(t, x, y) { const c = Math.cos(t.angle), s = Math.sin(t.angle); return { x: t.x + x * c - y * s, y: t.y + x * s + y * c }; }
  function world2local(t, x, y) { const c = Math.cos(t.angle), s = Math.sin(t.angle), dx = x - t.x, dy = y - t.y; return { x: dx * c + dy * s, y: -dx * s + dy * c }; }

  // ---------- 手柄 ----------
  function iconPath(name, cx, cy) {
    // GW.ICONS 里是 24×24 的图形片段，直接塞进 <g> 并缩小、居中到圆钮上
    const g = svgEl('g', { class: 'geo-ic', transform: `translate(${cx - 11} ${cy - 11}) scale(${22 / 24})` });
    g.innerHTML = GW.ICONS[name] || GW.ICONS.plus;
    return g;
  }
  // 可拖动圆钮：大热区 + 可见圆 + 图标
  function knob(x, y, dataH, icon, cls) {
    const g = svgEl('g', { class: 'geo-h', 'data-h': dataH });
    g.append(svgEl('circle', { cx: x, cy: y, r: HIT, class: 'geo-hit' }));
    g.append(svgEl('circle', { cx: x, cy: y, r: KNOB, class: 'geo-knob' + (cls ? ' ' + cls : '') }));
    if (icon) g.append(iconPath(icon, x, y));
    return g;
  }
  function hudBtn(dataH, icon, title, cls) {
    return h('div', { class: 'geo-hbtn' + (cls ? ' ' + cls : ''), 'data-h': dataH, title, html: GW.icon(icon) });
  }

  // 返回 { g: 本体图形, handles: 手柄组, arm?: 测量臂, edges: 吸附边, arc?: 吸附弧, center: 旋转中心, bounds: [x1,y1,x2,y2] }
  // 旋转中心都取工具自己的基准点：直尺 = 0 刻度，三角板 = 直角顶点，量角器 = 自带圆心，圆规 = 针尖
  // ---------- 2.0.6：直尺长度可调（A 右端手柄 + C 新尺默认长度） ----------
  // 只有直尺的 len 能改；三角板 / 量角器的 len 仍是插入时定下的边长，不跟着变。
  const RULER_MIN = 4, RULER_MAX = 30, RULER_DEF = 20;   // 厘米，半厘米一档
  const clampLen = (cm) => GW.clamp(Math.round(cm * 2) / 2, RULER_MIN, RULER_MAX);
  // 1.5.2 之前的旧存档可能压根没有 len，或存了脏值；不兜底的话 t.len * CM 变 NaN，刻度循环直接崩。
  // 合法值原样保留（不擅自量化，免得悄悄改掉老师已经存好的板书）。
  function safeLen(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? GW.clamp(n, RULER_MIN, RULER_MAX) : RULER_DEF;
  }
  // 就地重绘直尺：**绝不删除承载指针的节点**。两个圆钮都在独立 handles 层一次建好，
  // 改长度只平移它们的 transform；触摸有隐式指针捕获，节点一删 Chromium 就补 pointercancel，
  // 手指按住手柄刚一动手势就断（见文件头与 drawCompass 的注释）。数字文本不承载指针，可增删。
  function drawRuler(t, sh) {
    const R = sh && sh._ruler;
    if (!R) return;
    const L = t.len * CM, W = 2.2 * CM;
    if (R.L === L) return;                       // 长度没变就别碰 DOM
    R.L = L;
    R.body.setAttribute('width', L);
    let d = '';
    const mmN = Math.round(t.len * 10);
    for (let mm = 0; mm <= mmN; mm++) { const x = (mm * CM) / 10, len = mm % 10 === 0 ? 22 : mm % 5 === 0 ? 15 : 9; d += `M${x} 0v${len}`; }
    R.ticks.setAttribute('d', d);
    const nN = Math.floor(t.len) + 1;
    while (R.nums.childNodes.length < nN) R.nums.append(svgEl('text', { y: 38, class: 'geo-num' }));
    while (R.nums.childNodes.length > nN) R.nums.lastChild.remove();
    Array.prototype.forEach.call(R.nums.childNodes, (tx, c) => { tx.setAttribute('x', c * CM); tx.textContent = c; });
    // 1.7.4（R6）：尺长读数（贴右端上沿，单位跟着 GW.settings.geoUnit）
    R.readLab.setAttribute('x', L - 4);
    R.readLab.textContent = readLen(t.len);
    R.rot.setAttribute('transform', `translate(${L / 2} 0)`);
    R.sizer.setAttribute('transform', `translate(${L} 0)`);
    sh.edges[0][2] = L; sh.edges[1][2] = L;    // 吸附边跟着伸缩
    sh.bounds[2] = L + HIT + PAD;              // 右端手柄的热区必须落在 viewBox 内，否则点不到
  }

  // ---------- 各工具外形 ----------
  const SHAPES = {
    ruler(t) {
      const L = t.len * CM, W = 2.2 * CM, g = svgEl('g', {});
      const body = svgEl('rect', { x: 0, y: 0, width: L, height: W, rx: 6, class: 'geo-body' });
      const ticks = svgEl('path', { class: 'geo-tick' });
      const nums = svgEl('g', { class: 'geo-nums' });
      const readLab = svgEl('text', { y: -10, class: 'geo-read', 'text-anchor': 'end' });
      g.append(body, ticks, nums, svgEl('circle', { cx: 0, cy: 0, r: 6, class: 'geo-pivot' }), readLab);
      const handles = svgEl('g', {});
      // 两个圆钮都建在局部原点，靠 transform 平移。旋转钮落在尺身正中（从前挂在右端外 46 单位，
      // 脱离本体、像一颗掉落的小圆点，小屏上还容易被裁掉）；右端橙色钮 = 拖它改长度。
      const rot = knob(0, W / 2, 'rotate', 'rotate');
      const sizer = knob(0, W / 2, 'resize', 'resize', 'pen');
      handles.append(rot, sizer);
      const sh = {
        g, handles, edges: [[0, 0, L, 0], [0, W, L, W]], center: [0, 0],
        bounds: [-PAD, -PAD, L + HIT + PAD, W + PAD],
        body: (tt) => [0, 0, tt.len * CM, 2.2 * CM],
        _ruler: { body, ticks, nums, readLab, rot, sizer, L: null },
      };
      drawRuler(t, sh);
      return sh;
    },
    tri45(t) {
      const L = t.len * CM, g = svgEl('g', {}), k = 0.27 * L;
      g.append(svgEl('path', { d: `M0 0H${L}L0 ${-L}Z M${k * 0.55} ${-k * 0.55}V${-L + k * 1.85}L${L - k * 1.85} ${-k * 0.55}Z`, class: 'geo-body', 'fill-rule': 'evenodd' }));
      g.append(tickPath(L, 0)); g.append(tickPath(L, -Math.PI / 2));
      g.append(svgEl('circle', { cx: 0, cy: 0, r: 7, class: 'geo-pivot' }));   // 直角顶点
      const handles = svgEl('g', {});
      handles.append(knob(L * 0.32, -L * 0.32 - 46, 'rotate', 'rotate'));
      return { g, handles, edges: [[0, 0, L, 0], [0, 0, 0, -L], [L, 0, 0, -L]], center: [0, 0], bounds: [-PAD, -L - PAD, L + PAD, PAD], body: (tt) => { const LL = tt.len * CM; return [0, -LL, LL, 0]; } };
    },
    tri60(t) {
      const L = t.len * CM, H = L * Math.tan(Math.PI / 6), g = svgEl('g', {}), k = 0.22;
      g.append(svgEl('path', { d: `M0 0H${L}L0 ${-H}Z M${L * 0.09} ${-H * 0.14}V${-H * (1 - k * 1.6)}L${L * (1 - k * 1.85)} ${-H * 0.14}Z`, class: 'geo-body', 'fill-rule': 'evenodd' }));
      g.append(tickPath(L, 0)); g.append(tickPath(H, -Math.PI / 2));
      g.append(svgEl('circle', { cx: 0, cy: 0, r: 7, class: 'geo-pivot' }));   // 直角顶点
      const handles = svgEl('g', {});
      handles.append(knob(L * 0.3, -H * 0.3 - 44, 'rotate', 'rotate'));
      return { g, handles, edges: [[0, 0, L, 0], [0, 0, 0, -H], [L, 0, 0, -H]], center: [0, 0], bounds: [-PAD, -H - PAD, L + PAD, PAD], body: (tt) => { const LL = tt.len * CM, HH = LL * Math.tan(Math.PI / 6); return [0, -HH, LL, 0]; } };
    },
    protractor(t) {
      const R = t.len * CM, g = svgEl('g', {});
      g.append(svgEl('path', { d: `M${-R} 0A${R} ${R} 0 0 1 ${R} 0Z M${-R * 0.42} 0A${R * 0.42} ${R * 0.42} 0 0 1 ${R * 0.42} 0Z`, class: 'geo-body', 'fill-rule': 'evenodd' }));
      let d = '';
      for (let a = 0; a <= 180; a++) {
        const r1 = R, r2 = R - (a % 10 === 0 ? 24 : a % 5 === 0 ? 16 : 9), th = (a * Math.PI) / 180;
        d += `M${r1 * Math.cos(th)} ${-r1 * Math.sin(th)}L${r2 * Math.cos(th)} ${-r2 * Math.sin(th)}`;
      }
      g.append(svgEl('path', { d, class: 'geo-tick' }));
      for (let a = 0; a <= 180; a += 10) {
        const th = (a * Math.PI) / 180;
        const t1 = svgEl('text', { x: (R - 40) * Math.cos(th), y: -(R - 40) * Math.sin(th) + 5, class: 'geo-num' }); t1.textContent = a; g.append(t1);
        const t2 = svgEl('text', { x: (R - 64) * Math.cos(th), y: -(R - 64) * Math.sin(th) + 5, class: 'geo-num small' }); t2.textContent = 180 - a; g.append(t2);
      }
      g.append(svgEl('path', { d: 'M-14 0H14M0 0V-14', class: 'geo-tick strong' }));
      g.append(svgEl('circle', { cx: 0, cy: 0, r: 8, class: 'geo-pivot' }));   // 自带圆心
      // 测量臂：末端圆钮可拖动改角度
      const arm = svgEl('g', { class: 'geo-arm geo-line', 'data-h': 'arm' });
      arm.append(svgEl('line', { x1: 0, y1: 0, x2: R + 40, y2: 0, class: 'geo-arm-line' }));
      arm.append(knob(R + 40, 0, 'arm', null, 'arm'));
      const lab = svgEl('text', { x: R * 0.55, y: -14, class: 'geo-read' });
      arm.append(lab);
      t._arm = arm; t._armLab = lab; t._armLabAt = [R * 0.55, -14];
      const handles = svgEl('g', {});
      handles.append(knob(0, -R - 46, 'rotate', 'rotate'));
      setArm(t, t.arm || 60);
      return { g, handles, arm, edges: [[-R, 0, R, 0]], arc: { cx: 0, cy: 0, r: R }, center: [0, 0], bounds: [-R - PAD, -R - 46 - HIT - PAD, R + 46 + HIT + PAD, PAD], body: (tt) => { const RR = tt.len * CM; return [-RR, -RR, RR, 0]; } };
    },
    compass(t) {
      const g = svgEl('g', {}), hk = svgEl('g', {});
      t._cg = g; t._hk = hk;
      // 圆规是「空心的」：bounds 是个大方框（给顶部旋弧手柄留位置），但真正能按住拖动本体的
      // 只有两条腿、针脚和铰链 —— 见 bodies 与下面 geoAt 的注释（反馈 2.7「缩放后定位不准」）。
      return {
        g,
        handles: hk,
        edges: [],
        center: [0, 0],
        compass: true,
        bounds: (tt) => { const R = Math.max(140, tt.r * 0.9) + 96; return [-R, -R, R, R]; },
        // 1.3.0（R6）：最后一段 6 元组是「两腿与地面围成的三角形内部」——
        // 原来只有两条腿的线段，点在腿间空白会穿透到画布落墨，拖不动圆规。
        bodies: (tt) => { const r = tt.r, hy = -Math.max(140, r * 0.9), hx = r / 2; return [[0, 0, hx, hy], [r, 0, hx, hy], [0, 0, 6], [hx, hy, 18], [0, 0, r, 0, hx, hy]]; },
      };
    },
  };
  // 沿边缘的毫米刻度：ang=0 沿 +x 边（刻度朝上），ang=-π/2 沿竖直边（刻度朝右）
  function tickPath(L, ang) {
    let d = '';
    const vertical = ang !== 0;
    for (let mm = 0; mm * CM / 10 <= L - 6; mm++) {
      const x = (mm * CM) / 10, len = mm % 10 === 0 ? 18 : mm % 5 === 0 ? 12 : 7;
      d += vertical ? `M0 ${-x}h${len}` : `M${x} 0v${-len}`;
    }
    return svgEl('path', { d, class: 'geo-tick' });
  }
  // 量角器测量臂：臂绕自带圆心转，角度读数反向旋转以保持水平可读
  function setArm(t, deg) {
    if (!t._arm) return;
    t.arm = GW.clamp(deg, 0, 180);
    t._arm.setAttribute('transform', `rotate(${-t.arm})`);
    t._armLab.textContent = Math.round(t.arm) + '°';
    t._armLab.setAttribute('transform', `rotate(${t.arm} ${t._armLabAt[0]} ${t._armLabAt[1]})`);
  }

  // 圆规：装饰部分（针脚 / 笔脚 / 铰链 / 读数）+ 手柄（针尖 / 笔尖 / 画弧），一起随画弧角度旋转
  //
  // ★ 手柄层只在第一次建出来，之后每次重绘**只改属性**（从前是 hks.innerHTML='' 整体重建）。
  //   拖动中的 [data-h=spin] 上挂着这个指针：触摸的指针捕获绑在被删掉的节点上，Chromium
  //   会释放捕获并补一个 pointercancel —— 手指按住手柄刚一动，手势就断了。鼠标没有隐式捕获，
  //   所以毛病只在电容屏上出现（「圆规无法正常使用画圆」）。装饰层是 pointer-events:none，
  //   不承载任何指针，继续整体重建。
  function drawCompass(t) {
    const deco = t._cg, hks = t._hk, r = t.r;
    const full = (t.arcSpan || 0) >= 2 * Math.PI - 0.05;   // 转满一圈即整圆：不再显示半径虚线 / 圆心角
    const hy = -Math.max(140, r * 0.9), hx = r / 2, deg = (t.arcAngle * 180) / Math.PI, rot = `rotate(${deg})`;
    if (!t._cp) {                                    // ---- 手柄层：一次性建好 ----
      const h1 = svgEl('g', {});
      h1.append(knob(0, 0, 'move', null, ''));       // 针尖：拖动整件工具（也是旋转 / 画弧的圆心）
      const kRad = svgEl('g', { class: 'geo-h', 'data-h': 'radius' });
      const kRadHit = svgEl('circle', { cx: r, cy: 0, r: HIT, class: 'geo-hit' });
      const kRadKnob = svgEl('circle', { cx: r, cy: 0, r: KNOB, class: 'geo-knob pen' });
      kRad.append(kRadHit, kRadKnob);                // 笔尖：拖动调半径
      h1.append(kRad);
      h1.append(svgEl('circle', { cx: 0, cy: 0, r: 9, class: 'geo-pivot' }));
      const spin = svgEl('g', { class: 'geo-h', 'data-h': 'spin' });
      const hit = svgEl('circle', { cx: hx, cy: hy - 44, r: HIT, class: 'geo-hit' });
      const grip = svgEl('rect', { x: hx - 9, y: hy - 70, width: 18, height: 56, rx: 8, class: 'cp-grip' });
      const kc = svgEl('circle', { cx: hx, cy: hy - 44, r: KNOB, class: 'geo-knob' });
      const ic = iconPath('rotate', hx, hy - 44);
      spin.append(hit, grip, kc, ic);
      h1.append(spin);
      hks.append(h1);
      t._cp = { h1, kRadHit, kRadKnob, hit, grip, kc, ic };
    }
    const cp = t._cp;
    // 顶部旋弧手柄的「抓手」按屏幕像素恒定：整层会被 #geo-layer 乘以 s，
    // 这里除以 s 抵消，屏幕上永远是 18×56px 的抓手 + 22px 的图标（缩放时不跟着变大）
    const k = 1 / GW.camera.s;
    cp.h1.setAttribute('transform', rot);
    cp.kRadHit.setAttribute('cx', r); cp.kRadKnob.setAttribute('cx', r);
    cp.hit.setAttribute('cx', hx); cp.hit.setAttribute('cy', hy - 44);
    cp.grip.setAttribute('x', hx - 9 * k); cp.grip.setAttribute('y', hy - 44 - 28 * k);
    cp.grip.setAttribute('width', 18 * k); cp.grip.setAttribute('height', 56 * k); cp.grip.setAttribute('rx', 8 * k);
    cp.kc.setAttribute('cx', hx); cp.kc.setAttribute('cy', hy - 44);
    cp.ic.setAttribute('transform', `translate(${hx - 11 * k} ${hy - 44 - 11 * k}) scale(${k * (22 / 24)})`);

    deco.innerHTML = '';
    const d1 = svgEl('g', { transform: rot });
    d1.append(svgEl('line', { x1: 0, y1: 0, x2: hx, y2: hy, class: 'cp-leg' }));
    d1.append(svgEl('line', { x1: r, y1: 0, x2: hx, y2: hy, class: 'cp-leg' }));
    d1.append(svgEl('circle', { cx: hx, cy: hy, r: 16, class: 'cp-hinge' }));
    // 圆心：小圆 + 十字 + 「O」，画弧时一眼看清圆心在哪
    d1.append(svgEl('circle', { cx: 0, cy: 0, r: 4, class: 'cp-pin' }));
    d1.append(svgEl('path', { d: 'M-11 0H11M0 -11V11', class: 'cp-cross' }));
    const otag = svgEl('text', { x: -16, y: 24, class: 'cp-otag' });
    otag.textContent = 'O';
    d1.append(otag);
    // 虚线半径：从圆心指到笔尖（跟着画弧角度一起转）；整圆不显示半径辅助线
    if (!full) d1.append(svgEl('line', { x1: 0, y1: 0, x2: r, y2: 0, class: 'cp-radius' }));
    d1.append(svgEl('path', { d: `M${r - 6} -10L${r} 0L${r + 6} -10`, class: 'cp-pin' }));
    deco.append(d1);
    // 读数不随工具旋转，固定在圆心正上 / 正下，屏幕上始终水平可读
    const lab = svgEl('text', { x: 0, y: -24 * k, class: 'geo-read' });
    lab.textContent = 'r = ' + (r / CM).toFixed(1) + ' cm';
    deco.append(lab);
    if (!full && (t.arcSpan || 0) > 0.001) {
      const alab = svgEl('text', { x: 0, y: 40 * k, class: 'geo-read' });
      alab.textContent = '圆心角 ' + Math.round((t.arcSpan || 0) * (180 / Math.PI)) + '°';
      deco.append(alab);
    }
    sizeHandles(t);
  }

  // ---------- 创建 / 销毁 ----------
  const TIP = {
    ruler: '直尺已就位：笔沿尺边画线自动吸附；拖右端橙色圆钮改长度（4–30 cm，半厘米一档），中间圆钮旋转、按住尺身不动可拖动',
    tri45: '三角板已就位：现在就是书写状态，笔沿直角边或斜边书写会自动吸附（按住板身不动可拖动）',
    tri60: '三角板已就位：现在就是书写状态，笔沿直角边或斜边书写会自动吸附（按住板身不动可拖动）',
    protractor: '量角器已就位：现在就是书写状态，笔沿底边或弧书写会自动吸附；拖橙色圆钮改角度（按住器身不动可拖动）',
    compass: '圆规已就位：拖针尖移动、拖橙色笔尖调半径、拖顶部手柄画弧（实时显示圆心角，转满一圈即整圆）',
  };
  // ---------- 1.5.2（R15）：尺规进文档模型 ----------
  // 原来 tools 只是模块内存里的 DOM 叠层：关掉就没了、换台机器更看不到（「对端看不到同一把尺子」）。
  // 现在每件工具的状态存在 page.geo（可保存、可撤销、随协同下发），tools 只是「当前页那几件」的 DOM 缓存。
  function recordOf(t) {
    const r = { id: t.id, type: t.type, x: t.x, y: t.y, angle: t.angle };
    if (t.len != null) r.len = t.len;
    if (t.arm != null) r.arm = t.arm;
    if (t.r != null) r.r = t.r;
    if (t.arcAngle != null) r.arcAngle = t.arcAngle;
    if (t.arcSpan != null) r.arcSpan = t.arcSpan;
    return r;
  }
  function geoArr(page) { return page.geo || (page.geo = []); }
  function makeTool(rec) {
    const t = { id: rec.id, type: rec.type, x: rec.x, y: rec.y, angle: rec.angle || 0 };
    // 2.0.6：直尺没有 len 的旧存档一律按 20cm 兜底，否则 SHAPES.ruler 里 t.len * CM = NaN
    if (rec.type === 'ruler') t.len = safeLen(rec.len);
    else if (rec.len != null) t.len = rec.len;
    if (rec.arm != null) t.arm = rec.arm;
    if (rec.r != null) t.r = rec.r;
    if (rec.arcAngle != null) t.arcAngle = rec.arcAngle;
    if (rec.arcSpan != null) t.arcSpan = rec.arcSpan;
    const svg = svgEl('svg', { class: 'geo-svg' });
    const shape = SHAPES[rec.type](t);
    shape.g.classList.add('geo-shape');
    svg.append(shape.g);
    if (shape.arm) svg.append(shape.arm);
    if (shape.handles) svg.append(shape.handles);
    // 工具条本身也是拖动把手（data-h="move"）：空白处一按就拖，不必长按本体去够它
    const hud = h('div', { class: 'geo-hud', 'data-h': 'move' },
      hudBtn('move', 'move', '按住拖动：移动工具（拖这条工具条的空白处同样能移动）'),
      hudBtn('rotate', 'rotate', '按住拖动：旋转（吸附 15°）'),
      h('div', { class: 'geo-angle' }),
      hudBtn('close', 'close', '点一下：收起这件工具', 'danger'));
    const el = h('div', { class: 'geo-tool geo-' + rec.type }, svg, hud);
    t.el = el; el.__geoTool = t; t.shape = shape; t._svg = svg; t._hud = hud; t._angLab = hud.querySelector('.geo-angle');
    layer.append(el);
    tools.push(t);
    if (rec.type === 'compass') drawCompass(t);
    place(t);
    bind(t);
    return t;
  }
  // 只拆 DOM，不动文档（换页 / 应用远端删除都走这里）
  function dropLocal(t) {
    const i = tools.indexOf(t);
    if (i < 0) return;
    if (t._destroy) t._destroy();
    tools.splice(i, 1);
    t.el.remove();
    GW.bus.emit('geo');
  }
  function add(type) {
    const vc = GW.viewCenter(), vr = GW.viewRect();
    const rec = { id: GW.uid(), type, x: vc.x, y: vc.y, angle: 0 };
    const fitCm = Math.max(4, Math.floor((vr.w * 0.5) / CM));
    if (type === 'ruler') {
      // 2.0.6（C）：设置里选了固定长度就用它；没选（默认）仍按视口一半自适应，行为与从前一致。
      const pref = Number((GW.settings || {}).geoRulerLen);
      rec.len = Number.isFinite(pref) && pref > 0 ? clampLen(pref) : Math.min(RULER_MAX, fitCm);
      rec.x -= (rec.len * CM) / 2;
    }
    else if (type === 'tri45' || type === 'tri60') { rec.len = Math.min(16, Math.max(6, Math.floor(fitCm * 0.6))); rec.x -= (rec.len * CM) / 3; rec.y += (rec.len * CM) / 3; }
    else if (type === 'protractor') { rec.len = Math.min(10, Math.max(4, Math.floor(fitCm * 0.4))); rec.y += (rec.len * CM) / 3; rec.arm = 60; }
    else if (type === 'compass') { rec.r = 4 * CM; rec.arcAngle = 0; rec.arcSpan = 0; }
    const t = makeTool(rec);
    const page = GW.page && GW.page();
    if (page) {
      const one = recordOf(t);
      geoArr(page).push(one);
      GW.commit({ geo: [{ id: t.id, before: null, after: one }] });
    }
    GW.bus.emit('geo');
    GW.toast(TIP[type] || '拖动工具条上的「移动」「旋转」调整位置和角度', 3200);
    return t;
  }
  // 插入尺规后立刻进入书写状态：老师选完工具不用再点一次「笔」就能直接画线
  function enterWriteMode() {
    if (GW.tool.current !== 'pen') GW.tool.set('pen');
    else GW.bus.emit('tool', 'pen');
  }
  function addAndWrite(type) {
    const t = add(type);
    enterWriteMode();
    return t;
  }
  function remove(t) {
    const i = tools.indexOf(t);
    if (i < 0) return;
    const before = recordOf(t);
    dropLocal(t);
    const page = GW.page && GW.page();
    if (page) {
      const arr = geoArr(page), k = arr.findIndex((g) => g.id === t.id);
      if (k >= 0) arr.splice(k, 1);
      GW.commit({ geo: [{ id: t.id, before: before, after: null }] });
    }
  }
  // 拖完一次：把「按下那一刻」和「松手这一刻」的差记成一条可撤销的 op
  function geoCommit(t) {
    const before = t._geoBefore;
    t._geoBefore = null;
    if (!before) return;
    const after = recordOf(t);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const page = GW.page && GW.page();
    if (!page) return;
    const arr = geoArr(page), k = arr.findIndex((g) => g.id === t.id);
    if (k >= 0) arr[k] = after; else arr.push(after);
    GW.commit({ geo: [{ id: t.id, before: before, after: after }] });
  }
  // 拖动过程中的实时镜像：60ms 一道，只发位置/角度这类小字段（对端按 id 就地更新，不重建 DOM）
  let geoLiveAt = 0;
  function geoLive(t) {
    if (!GW.netLive) return;
    const now = Date.now();
    if (now - geoLiveAt < 60) return;
    geoLiveAt = now;
    const page = GW.page && GW.page();
    if (!page) return;
    GW.netLive('gt', { k: 'gt', pageId: page.id, g: recordOf(t) });
  }
  // 应用一条工具状态（rec 为 null 即删除）：本地撤销/远端 op/远端 live 共用同一条路径
  GW.geoApply = function (page, id, rec) {
    if (!page) return;
    const arr = geoArr(page), k = arr.findIndex((g) => g.id === id);
    if (!rec) {
      if (k >= 0) arr.splice(k, 1);
      if (page === GW.page()) { const t = tools.filter((x) => x.id === id)[0]; if (t) dropLocal(t); }
      return;
    }
    if (k >= 0) arr[k] = rec; else arr.push(rec);
    if (page !== GW.page()) return;
    const t = tools.filter((x) => x.id === id)[0];
    if (!t) { makeTool(rec); GW.bus.emit('geo'); return; }
    t.x = rec.x; t.y = rec.y; t.angle = rec.angle;
    if (t.type === 'ruler') {
      if (rec.len != null) t.len = safeLen(rec.len);   // rec 只带位置时保留本地已调好的长度
      drawRuler(t, t.shape);                          // 撤销 / 重做 / 远端下发都得看得见长度变化
    } else if (rec.len != null) t.len = rec.len;
    if (rec.arm != null) setArm(t, rec.arm);
    if (rec.r != null) {
      t.r = rec.r;
      if (rec.arcAngle != null) t.arcAngle = rec.arcAngle;
      if (rec.arcSpan != null) t.arcSpan = rec.arcSpan;
      drawCompass(t);
    }
    place(t);
  };
  // 换页 / 载入文档：按当前页的 page.geo 重建 DOM 叠层
  function rebuildGeo() {
    for (const t of tools.slice()) dropLocal(t);
    const page = GW.page && GW.page();
    if (!page) return;
    for (const g of geoArr(page)) makeTool(g);
  }
  GW.geo = {
    add: addAndWrite, addQuiet: add, snapper, tools, enterWriteMode,
    clear() { tools.slice().forEach(remove); },
    CM, rebuild: rebuildGeo, record: recordOf,
    // 2.0.6：程序化改长度（设置面板 / 教学脚本 / 验收探针）。与手柄拖完走同一套 page.geo + commit。
    setLen(id, cm) {
      const t = tools.filter((x) => x.id === id && x.type === 'ruler')[0];
      if (!t) return null;
      const before = recordOf(t);
      t.len = clampLen(cm);
      if (JSON.stringify(before) === JSON.stringify(recordOf(t))) return t.len;
      drawRuler(t, t.shape); place(t);
      const page = GW.page && GW.page();
      if (page) {
        const after = recordOf(t), arr = geoArr(page), k = arr.findIndex((g) => g.id === id);
        if (k >= 0) arr[k] = after; else arr.push(after);
        GW.commit({ geo: [{ id, before, after }] });
      }
      return t.len;
    },
    _t: { commit: geoCommit, live: geoLive },   // 探针用（模拟拖动收尾 / 拖动中的实时镜像）
  };

  const boundsOf = (t) => (typeof t.shape.bounds === 'function' ? t.shape.bounds(t) : t.shape.bounds);
  // 手柄与热区按屏幕像素恒定（反馈 2.7「尺规在画布缩放后吸附和画圆功能位置定位不准」）：
  // 圆钮 / 热区本来是 20 / 30 个**世界单位**，而 #geo-layer 会整层乘 s —— 放大 2 倍后
  // 圆钮直径变 80px、圆规顶部热区直径变 120px（实测），手指会碰到一大片看不见的拖动区，
  // 看上去就是「缩放后位置不准 / 一点就乱动」。这里统一除以 s 抵消，屏幕上永远是 20/30px。
  function sizeHandles(t) {
    if (!t._svg) return;
    const k = 1 / GW.camera.s;
    t._svg.querySelectorAll('.geo-hit').forEach((c) => c.setAttribute('r', HIT * k));
    t._svg.querySelectorAll('.geo-knob').forEach((c) => c.setAttribute('r', KNOB * k));
  }
  // 屏幕坐标 → 某件工具（用于「按住尺身不动 = 挪工具」：笔模式下尺身是 pointer-events:none，
  // 命中测试拿不到它，只能自己在世界坐标里判断）
  //
  // ★ 三条边界，都是反馈 2.7「尺规无法正常使用吸附画线 / 尺规与图形错位 / 缩放后定位不准」的根因：
  //   ① 能被吸附的点一律不算本体。尺边外侧 2.5 单位正是「沿尺边画线」的书写带（吸附把笔迹
  //      外移到尺边外），原先它落在命中区内 —— 老师落笔后停 0.22s，笔迹被撤掉、尺子被拖走。
  //   ② 上方不再多留 62px。那片空白画布是正常的书写区，从前在那儿顿一下笔就被判成「按住
  //      尺身」，整件工具凭空横移几百单位，看起来就是「插入的尺规错位」。工具条自己带
  //      data-h="move"，直接按就拖，不需要靠长按去够它。
  //   ③ 只认「本体」（body / bodies），不认给手柄留的余量，而且余量按屏幕像素（8px）算。
  //      用 bounds 判定时，bounds 给手柄留的空白（PAD / 46+HIT 世界单位）比吸附容差
  //      （26px）还宽，缩放越大越宽：实测 s=2 时直尺左/上各留出 36px 的死带（吸不到、
  //      一停笔却算「按住尺身」），圆规更是一整片 488px 见方的隐形拖动区。现在余量恒为
  //      8px < 26px，吸附带把死带整条盖住，两者之间不再有缝。
  function geoAt(sx, sy) {
    const w = GW.toWorld(sx, sy);
    if (snapper(w)) return null;
    const pad = 8 / GW.camera.s, hit = HIT / GW.camera.s;
    for (let i = tools.length - 1; i >= 0; i--) {
      const t = tools[i], l = world2local(t, w.x, w.y);
      const body = t.shape.body ? t.shape.body(t) : null;
      if (body) {
        if (l.x >= body[0] - pad && l.x <= body[2] + pad && l.y >= body[1] - pad && l.y <= body[3] + pad) return t;
        continue;
      }
      const bodies = t.shape.bodies ? t.shape.bodies(t) : null;
      if (!bodies) continue;
      for (const bd of bodies) {
        if (bd.length === 6) {
          // 三角形（6 元组：三个顶点）：内部任意一点都算按住本体，边线仍用 30px 容差。
          const [ax, ay, bx, by, cx, cy] = bd;
          const d1 = (l.x - bx) * (ay - by) - (ax - bx) * (l.y - by);
          const d2 = (l.x - cx) * (by - cy) - (bx - cx) * (l.y - cy);
          const d3 = (l.x - ax) * (cy - ay) - (cx - ax) * (l.y - ay);
          if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return t;
          const de = Math.min(
            GW.geom.distSeg(l.x, l.y, ax, ay, bx, by),
            GW.geom.distSeg(l.x, l.y, bx, by, cx, cy),
            GW.geom.distSeg(l.x, l.y, cx, cy, ax, ay));
          if (de <= hit) return t;
          continue;
        }
        const d = bd.length === 3
          ? Math.abs(Math.hypot(l.x - bd[0], l.y - bd[1]) - bd[2])
          : GW.geom.distSeg(l.x, l.y, bd[0], bd[1], bd[2], bd[3]);
        if (d <= hit) return t;
      }
    }
    return null;
  }
  // 视口覆盖全部内容（含手柄），命中测试不再依赖「视口之外」
  function fitSvg(t) {
    const b = boundsOf(t), svg = t._svg;
    const w = Math.max(1, b[2] - b[0]), hh = Math.max(1, b[3] - b[1]);
    svg.setAttribute('viewBox', `${b[0]} ${b[1]} ${w} ${hh}`);
    svg.setAttribute('width', w);
    svg.setAttribute('height', hh);
    svg.style.left = b[0] + 'px';
    svg.style.top = b[1] + 'px';
  }
  function place(t) {
    t.el.style.transform = `translate(${t.x}px,${t.y}px) rotate(${t.angle}rad)`;
    const b = boundsOf(t);
    // 工具条反向旋转 + 反向缩放：文字始终水平，屏幕上大小不变
    t._hud.style.left = b[0] + 'px';
    t._hud.style.top = b[1] - 56 + 'px';
    t._hud.style.transform = `rotate(${-t.angle}rad) scale(${1 / GW.camera.s})`;
    fitSvg(t);
    sizeHandles(t);
    t._angLab.textContent = Math.round(((((-t.angle * 180) / Math.PI) % 360) + 360) % 360) + '°';
  }

  const snapAngle = (a) => { const s = Math.round(a / (Math.PI / 12)) * (Math.PI / 12); return Math.abs(a - s) < 0.05 ? s : a; };

  // ---------- 交互 ----------
  // 拖动状态在 window 上跟踪：不用 setPointerCapture，光标离开图形也不会丢事件
  //
  // 「按住尺身不动 = 挪工具」：笔模式下尺子本体是 pointer-events:none（要让笔能压着尺子起笔），
  // 因此收不到 pointerdown。这里在 window 捕获阶段监听，用坐标反查是不是落在某件工具的本体上；
  // 按住约 0.22s 没怎么动，就撤掉已经起笔的那一笔，改拖工具 —— 想划线直接落笔就走。
  let holdTimer = 0, holdOn = null;
  const WRITE_TOOLS = new Set(['pen', 'hl', 'eraser', 'shape', 'text', 'laser']);
  function cancelHold() { if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; } holdOn = null; }
  function initHoldTracking() {
    const down = (e) => {
      if (e.button > 0) return;
      // 只有「写字类」工具才需要长按让位：交互模式本来就按得住，选择工具的长按是框选
      if (!WRITE_TOOLS.has(GW.tool.current)) return;
      // 落在手柄 / 工具条按钮上时，它们自己就能拖，不需要长按
      const top = document.elementFromPoint(e.clientX, e.clientY);
      if (top && top.closest && top.closest('[data-h]')) return;
      const t = geoAt(e.clientX, e.clientY);
      if (!t) return;
      holdOn = { t, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      clearTimeout(holdTimer);
      holdTimer = setTimeout(fireHold, 220);
    };
    const move = (e) => {
      if (!holdOn || e.pointerId !== holdOn.pointerId) return;
      if (Math.hypot(e.clientX - holdOn.x, e.clientY - holdOn.y) > 10) cancelHold();
    };
    perfOn(window, 'pointerdown', down, true);
    perfOn(window, 'pointermove', move, true);
    perfOn(window, 'pointerup', cancelHold, true);
    perfOn(window, 'pointercancel', cancelHold, true);
  }
  function fireHold() {
    holdTimer = 0;
    const c = holdOn;
    holdOn = null;
    if (!c || !c.t.el.isConnected) return;
    // 先把已经落在墨迹层上的那一小段撤掉，再开始拖工具，不留墨点
    if (GW.yieldPointer) GW.yieldPointer.fire('longpress');
    GW.inking = true;
    c.t._press(null, null, c.x, c.y, c.pointerId);
  }
  // 触摸 / 指针事件监听：once 参数在 Chromium 108 上可能把 passive 顶掉，统一容错
  function perfOn(target, type, fn, opts) {
    try { target.addEventListener(type, fn, opts); }
    catch (e) { target.addEventListener(type, fn, typeof opts === 'object' ? opts.capture : opts); }
  }

  function bind(t) {
    const ptrs = new Map();
    let base = null, tracking = false;

    function track(on) {
      if (on === tracking) return;
      tracking = on;
      const fn = on ? 'addEventListener' : 'removeEventListener';
      window[fn]('pointermove', onMove, { passive: false });
      window[fn]('pointerup', onUp, true);
      // ★ 中断不能当成「画完」：pointercancel 从前走 onUp，会把「当前弧角」当成本次画出的弧
      //   提交上去 —— 触摸被系统/浏览器取消（手指被系统手势抢走、手柄节点被重建）时，
      //   手指一碰圆规就凭空落下一段谁也没画的弧，然后这次拖动直接结束。
      window[fn]('pointercancel', onCancel, true);
      window[fn]('blur', onCancel);
    }
    function onMove(e) {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (e.cancelable) e.preventDefault();
      update();
    }
    function onUp(e) {
      cancelHold();
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      if (p.h === 'close') {                                   // 点一下（没有拖动）才收起
        if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 10) { remove(t); return; }
        ptrs.delete(e.pointerId);
        t.el.classList.remove('dragging');
        if (!ptrs.size) { finishDrag(); }
        return;
      }
      ptrs.delete(e.pointerId);
      if (base && base.arc && p.h === 'spin') finishArc();
      t.el.classList.remove('dragging');
      finishDrag();
    }
    function finishDrag() {
      begin();
      geoCommit(t);   // 1.5.2（R15）：一次拖动 = 一条可撤销、可下发的 geo op
      if (!ptrs.size) { track(false); GW.inking = false; }
    }
    function onCancel() {
      cancelHold();
      let aborted = false;
      for (const id of [...ptrs.keys()]) {
        const p = ptrs.get(id);
        ptrs.delete(id);
        if (base && base.arc && p.h === 'spin') aborted = true;   // 被打断的这一笔圆弧作废
      }
      if (aborted) discardArc();
      t.el.classList.remove('dragging');
      begin();
      geoCommit(t);
      track(false);
      GW.inking = false;
    }
    t._destroy = onCancel;

    // 真正开始拖这件工具（长按让位与直接按手柄都走这里）
    t._press = (hd, ev, sx, sy, pid) => {
      const id = ev && ev.pointerId != null ? ev.pointerId : pid;
      const x = ev ? ev.clientX : sx, y = ev ? ev.clientY : sy;
      if (id == null || ptrs.has(id)) return;
      if (!t._geoBefore) t._geoBefore = recordOf(t);   // 1.5.2（R15）：记下起手状态，松手时才知道改了什么
      ptrs.set(id, { x, y, x0: x, y0: y, h: hd });
      if (layer.lastElementChild !== t.el) layer.append(t.el);  // 置顶
      t.el.classList.add('dragging');
      begin();
      track(true);
    };

    t.el.addEventListener('pointerdown', (e) => {
      const hit = e.target.closest ? e.target.closest('[data-h]') : null;
      const hd = hit ? hit.getAttribute('data-h') : null;
      if (!hd && GW.tool.current !== 'hand') return;           // 笔模式下本体不挡笔（长按拖动走全局监听）
      e.stopPropagation(); e.preventDefault();
      cancelHold();
      t._press(hd, e);
    });

    function begin() {
      if (base && base.arc) { base.arc.off(); base.arc = null; }
      const ps = [...ptrs.values()];
      if (!ps.length) { base = null; return; }
      const w0 = GW.toWorld(ps[0].x, ps[0].y);
      const B = { x: t.x, y: t.y, angle: t.angle, r: t.r, arcAngle: t.arcAngle };
      base = { B, w0, h: ps.length === 1 ? ps[0].h : 'two' };
      if (base.h === 'two') {
        const w1 = GW.toWorld(ps[1].x, ps[1].y);
        base.a0 = Math.atan2(w1.y - w0.y, w1.x - w0.x);
        base.mid = { x: (w0.x + w1.x) / 2, y: (w0.y + w1.y) / 2 };
      }
      if (base.h === 'rotate') {
        base.c = local2world(t, t.shape.center[0], t.shape.center[1]);
        base.a0 = Math.atan2(w0.y - base.c.y, w0.x - base.c.x);
      }
      if (base.h === 'resize') {
        const l = world2local(t, w0.x, w0.y);
        base.lenOff = l.x - t.len * CM;      // 手指没按在钮正中时也不跳一格
      }
      if (base.h === 'spin') {
        const arc = { start: t.arcAngle, prevSpan: t.arcSpan || 0 };
        base.swept = 0;            // 累计扫过的角度：转满一圈即视为整圆
        base.net = 0;
        // ★ 起手记下「手指相对圆心」的角度：第一帧必须按**增量**走，不能把指针的绝对角直接
        //   当成弧角。从前第一帧把弧角从 0 跳到指针绝对角（约 -67°），于是想画 90° 的弧会多出
        //   67°，手柄还会在起手瞬间从手指底下甩开 67° —— 现场就是「圆规画不准 / 用不了」。
        base.aPrev = Math.atan2(w0.y - t.y, w0.x - t.x);
        arc.off = GW.live.add((ctx, { mark }) => {
          const a0 = arc.start, a1 = t.arcAngle;
          // 转满一圈即整圆：拖拽预览也不再画两条虚线半径（与 finishArc 的判定一致）
          const full = (base.swept || 0) >= 2 * Math.PI - 0.05 || Math.abs(a1 - a0) >= 2 * Math.PI - 0.05;
          if (mark) { const r = t.r + Math.max(2, GW.tool.pen.width) + 2; mark(t.x - r, t.y - r, t.x + r, t.y + r); }
          ctx.strokeStyle = GW.tool.pen.color; ctx.lineWidth = Math.max(2, GW.tool.pen.width) / GW.camera.s; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(t.x, t.y, t.r, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
          // 画弧时把圆心与两条虚线半径一起显示出来（半径 = 圆心到起点、圆心到笔尖）
          const s = GW.camera.s || 1, dash = [6 / s, 5 / s];
          ctx.save();
          ctx.setLineDash(dash);
          ctx.lineWidth = Math.max(1.4, 1.8 / s);
          ctx.strokeStyle = '#e4572e';
          if (!full) {
            for (const aa of [a0, a1]) {
              ctx.beginPath();
              ctx.moveTo(t.x, t.y);
              ctx.lineTo(t.x + t.r * Math.cos(aa), t.y + t.r * Math.sin(aa));
              ctx.stroke();
            }
          }
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(t.x - 9 / s, t.y); ctx.lineTo(t.x + 9 / s, t.y);
          ctx.moveTo(t.x, t.y - 9 / s); ctx.lineTo(t.x, t.y + 9 / s);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(t.x, t.y, 3.2 / s, 0, Math.PI * 2);
          ctx.fillStyle = '#e4572e'; ctx.fill();
          ctx.restore();
        });
        base.arc = arc;
      }
    }

    function update() {
      if (!base || base.h === 'close') return;
      const ps = [...ptrs.values()];
      if (!ps.length) return;
      const B = base.B, w = GW.toWorld(ps[0].x, ps[0].y);
      if (base.h === 'two' && ps.length >= 2) {
        const w1 = GW.toWorld(ps[1].x, ps[1].y);
        const a = Math.atan2(w1.y - w.y, w1.x - w.x), da = snapAngle(B.angle + a - base.a0) - B.angle;
        const mid = { x: (w.x + w1.x) / 2, y: (w.y + w1.y) / 2 };
        const c = Math.cos(da), s = Math.sin(da), dx = B.x - base.mid.x, dy = B.y - base.mid.y;
        t.x = mid.x + dx * c - dy * s; t.y = mid.y + dx * s + dy * c; t.angle = B.angle + da;
      } else if (base.h === 'rotate') {
        const a = Math.atan2(w.y - base.c.y, w.x - base.c.x);
        const da = snapAngle(B.angle + a - base.a0) - B.angle;
        const c = Math.cos(da), s = Math.sin(da), dx = B.x - base.c.x, dy = B.y - base.c.y;
        t.x = base.c.x + dx * c - dy * s; t.y = base.c.y + dx * s + dy * c; t.angle = B.angle + da;
      } else if (base.h === 'resize') {
        const l = world2local(t, w.x, w.y);
        t.len = clampLen((l.x - (base.lenOff || 0)) / CM);   // 0.5cm 量化，4–30cm，旋转中心仍是 0 刻度
        drawRuler(t, t.shape);
      } else if (base.h === 'arm') {
        const l = world2local(t, w.x, w.y);
        setArm(t, (Math.atan2(-l.y, l.x) * 180) / Math.PI);
      } else if (base.h === 'radius') {
        let r = Math.hypot(w.x - t.x, w.y - t.y);
        if (Math.abs(r / (CM / 2) - Math.round(r / (CM / 2))) < 0.12) r = Math.round(r / (CM / 2)) * (CM / 2);   // 吸附 0.5cm
        t.r = Math.max(CM * 0.5, r);
        t.arcAngle = Math.atan2(w.y - t.y, w.x - t.x);
        drawCompass(t);
      } else if (base.h === 'spin') {
        const a = Math.atan2(w.y - t.y, w.x - t.x);
        let d = a - base.aPrev;                            // 指针角增量（不是绝对角，见 begin 的注释）
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        base.aPrev = a;
        t.arcAngle += d;
        base.swept += Math.abs(d);
        base.net += d;
        t.arcSpan = Math.abs(t.arcAngle - base.arc.start);   // 边画边显示圆心角
        drawCompass(t);
        GW.requestLive();
      } else {                                                  // 拖动本体 / 「移动」按钮
        t.x = B.x + (w.x - base.w0.x); t.y = B.y + (w.y - base.w0.y);
      }
      place(t);
      geoLive(t);   // 1.5.2（R15）：拖动中实时同步，对端看到的是同一把在动的尺子
    }

    function finishArc() {
      if (!base || !base.arc) return;
      const a0 = base.arc.start, a1 = t.arcAngle;
      // 扫过一整圈（即使起点与终点角度相同）也算整圆
      const full = (base.swept || 0) >= 2 * Math.PI - 0.05 || Math.abs(a1 - a0) >= 2 * Math.PI - 0.05;
      if (!full && Math.abs(a1 - a0) < 0.02) return;
      const n = Math.max(12, Math.ceil(Math.abs(a1 - a0) * 40)), pts = [];
      const dir = Math.sign(base.net || a1 - a0) || 1;
      const A1 = full ? a0 + 2 * Math.PI * dir : a1;
      for (let k = 0; k <= n; k++) { const a = a0 + ((A1 - a0) * k) / n; pts.push(t.x + t.r * Math.cos(a), t.y + t.r * Math.sin(a)); }
      if (full) pts.splice(-2, 2);
      t.arcSpan = full ? 2 * Math.PI : Math.abs(a1 - a0);     // 保留本次画出的圆心角
      drawCompass(t);
      // 圆心 / 虚线半径 / 圆心角直接烧进这条墨迹（it.ann），不再只是圆规工具的装饰层。
      // 画完把圆规挪走、甚至删掉工具，标注都留在圆上；导出 / 撤销 / 保存也自然跟着走。
      const shp = { id: GW.uid(), kind: 'shape', type: 'poly', pts, closed: full, smooth: true, color: GW.tool.pen.color, width: Math.max(2, GW.tool.pen.width) / GW.camera.s, ann: { cx: t.x, cy: t.y, r: t.r, a0, a1: A1, full } };
      GW.addItems([shp]);
      GW.toast((full ? '已画出整圆' : '已画出圆弧 ' + Math.round((t.arcSpan * 180) / Math.PI) + '°') + '（可撤销）');
    }

    // 被打断（pointercancel / 窗口失焦）时把画了一半的弧**作废**：角度退回起手那一下，
    // 不落任何对象 —— 手指被系统手势抢走，不该在画布上留下半段谁也没画的弧。
    function discardArc() {
      if (!base || !base.arc) return;
      t.arcAngle = base.arc.start;
      t.arcSpan = base.arc.prevSpan;
      drawCompass(t);
    }
  }

  // ---------- 吸附：笔迹起点靠近边缘 → 返回投影函数 ----------
  function snapper(p) {
    const tol = 26 / GW.camera.s;
    let best = null, bd = tol;
    for (const t of tools) {
      const l = world2local(t, p.x, p.y);
      for (const [x1, y1, x2, y2] of t.shape.edges) {
        const d = GW.geom.distSeg(l.x, l.y, x1, y1, x2, y2);
        if (d < bd) { bd = d; best = { t, line: [x1, y1, x2, y2] }; }
      }
      const arc = t.shape.arc;
      if (arc) { const d = Math.abs(Math.hypot(l.x - arc.cx, l.y - arc.cy) - arc.r); if (d < bd && l.y <= 4) { bd = d; best = { t, arc }; } }
    }
    if (!best) return null;
    const { t } = best;
    // 笔迹画在工具外侧：沿法线偏移半个线宽
    const off = (GW.tool.pen.width / GW.camera.s) / 2 + 1 / GW.camera.s;
    if (best.arc) {
      const { cx, cy, r } = best.arc;
      return (q) => { const l = world2local(t, q.x, q.y), a = Math.atan2(l.y - cy, l.x - cx); return local2world(t, cx + (r + off) * Math.cos(a), cy + (r + off) * Math.sin(a)); };
    }
    const [x1, y1, x2, y2] = best.line;
    const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    const l0 = world2local(t, p.x, p.y);
    const side = Math.sign((l0.x - x1) * -uy + (l0.y - y1) * ux) || -1;
    const nx = -uy * side * off, ny = ux * side * off;
    const ext = 1.5 * CM;
    return (q) => {
      const l = world2local(t, q.x, q.y);
      const s = GW.clamp((l.x - x1) * ux + (l.y - y1) * uy, -ext, L + ext);
      return local2world(t, x1 + ux * s + nx, y1 + uy * s + ny);
    };
  }
  GW.initGeo = function () {
    layer = document.getElementById('geo-layer');
    let lastS = 0;
    const sync = () => {
      layer.style.transform = `translate(${GW.camera.tx}px,${GW.camera.ty}px) scale(${GW.camera.s})`;
      if (GW.camera.s !== lastS) { lastS = GW.camera.s; tools.forEach(place); }  // 缩放变化时同步工具条的反向缩放
    };
    GW.bus.on('rendered', sync);
    GW.bus.on('page', rebuildGeo);
    // 打开板书 / 回放换整份文档时页事件不一定发（同页索引不变），单独补一条
    GW.bus.on('doc-loaded', rebuildGeo);
    initHoldTracking();
    rebuildGeo();
    sync();
  };
})();
