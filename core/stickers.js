/* 贴纸库（2.0.7 · B4）—— 30 个纯 canvas 自绘图形，不搬任何素材。
 *
 * 每一项都是一个 geo 条目：{ kind:'shape', type:'stk', key, x1,y1,x2,y2, color, width, rot }。
 * 这样「缩放 / 旋转 / 选中 / 撤销 / 导出」全部复用既有图形机制：
 *   - 缩放：拖动选框的角点改 x1..y2（input.js 的通用图形逻辑）
 *   - 旋转：it.rot（弧度），本文件在 draw 里绕框心旋转
 *   - 导出：export.js 把 GW.drawItem 重放进录制 ctx ⇒ 自动变成矢量路径（不需要额外适配）
 *
 * 画法约定：所有几何都写成 u/v ∈ [0,1] 的比例，落在框内 —— 框变形（拉宽/拉高）时图形跟着变形，
 * 与 stencils.js / mathshapes.js 的相对坐标约定一致。
 */
(function () {
  const GW = (window.GW = window.GW || {});
  const TAU = Math.PI * 2;

  function frame(it) {
    const x1 = Math.min(it.x1, it.x2), y1 = Math.min(it.y1, it.y2);
    const w = Math.abs(it.x2 - it.x1) || 1, h = Math.abs(it.y2 - it.y1) || 1;
    return { x1, y1, w, h, X: (u) => x1 + w * u, Y: (v) => y1 + h * v };
  }
  function poly(ctx, pts, close) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      if (i) ctx.lineTo(pts[i], pts[i + 1]); else ctx.moveTo(pts[i], pts[i + 1]);
    }
    if (close) ctx.closePath();
  }
  // 线稿统一走「描边 + 可选浅填充」，颜色取对象自身（默认跟当前笔色）
  function ink(ctx, it, fill) {
    ctx.strokeStyle = it.color || '#3c4858';
    ctx.fillStyle = it.fillColor || it.color || '#3c4858';
    ctx.lineWidth = Math.max(1.2, it.width || 2.2);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (fill) { ctx.globalAlpha = 0.16; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.stroke();
  }

  // ---------------- 30 个贴纸 ----------------
  const DEFS = {
    'arrow': {
      name: '箭头', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.08), f.Y(0.5), f.X(0.66), f.Y(0.5)]); ink(ctx, it);
        poly(ctx, [f.X(0.62), f.Y(0.26), f.X(0.94), f.Y(0.5), f.X(0.62), f.Y(0.74)], true); ink(ctx, it, true);
      },
    },
    'arrow-curve': {
      name: '弯箭头', draw(ctx, it) {
        const f = frame(it);
        ctx.beginPath();
        ctx.moveTo(f.X(0.1), f.Y(0.78));
        ctx.quadraticCurveTo(f.X(0.45), f.Y(0.1), f.X(0.9), f.Y(0.3));
        ink(ctx, it);
        poly(ctx, [f.X(0.9), f.Y(0.3), f.X(0.74), f.Y(0.16), f.X(0.86), f.Y(0.46)], true); ink(ctx, it, true);
      },
    },
    'circle-num': {
      name: '序号圆片', draw(ctx, it) {
        const f = frame(it), r = Math.min(f.w, f.h) / 2;
        ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), r * 0.9, 0, TAU); ink(ctx, it, true);
        ctx.fillStyle = it.color || '#3c4858';
        ctx.font = '700 ' + Math.round(r * 1.15) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(it.num || 1), f.X(0.5), f.Y(0.52));
      },
    },
    'check': {
      name: '对勾', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.12), f.Y(0.55), f.X(0.4), f.Y(0.82), f.X(0.9), f.Y(0.18)]); ink(ctx, it);
      },
    },
    'cross': {
      name: '叉号', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.15), f.Y(0.15), f.X(0.85), f.Y(0.85)]); ink(ctx, it);
        poly(ctx, [f.X(0.85), f.Y(0.15), f.X(0.15), f.Y(0.85)]); ink(ctx, it);
      },
    },
    'question': {
      name: '问号', draw(ctx, it) {
        const f = frame(it);
        ctx.beginPath();
        ctx.moveTo(f.X(0.24), f.Y(0.32));
        ctx.quadraticCurveTo(f.X(0.3), f.Y(0.08), f.X(0.52), f.Y(0.1));
        ctx.quadraticCurveTo(f.X(0.76), f.Y(0.12), f.X(0.74), f.Y(0.38));
        ctx.quadraticCurveTo(f.X(0.72), f.Y(0.58), f.X(0.5), f.Y(0.62));
        ctx.lineTo(f.X(0.5), f.Y(0.72));
        ink(ctx, it);
        ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.86), Math.min(f.w, f.h) * 0.05, 0, TAU);
        ctx.fillStyle = it.color || '#3c4858'; ctx.fill();
      },
    },
    'exclaim': {
      name: '感叹号', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.42), f.Y(0.1), f.X(0.58), f.Y(0.1), f.X(0.54), f.Y(0.66), f.X(0.46), f.Y(0.66)], true); ink(ctx, it, true);
        ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.84), Math.min(f.w, f.h) * 0.055, 0, TAU);
        ctx.fillStyle = it.color || '#3c4858'; ctx.fill();
      },
    },
    'bulb': {
      name: '灯泡', draw(ctx, it) {
        const f = frame(it);
        ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.4), Math.min(f.w, f.h) * 0.3, 0, TAU); ink(ctx, it, true);
        poly(ctx, [f.X(0.4), f.Y(0.72), f.X(0.6), f.Y(0.72)]); ink(ctx, it);
        poly(ctx, [f.X(0.42), f.Y(0.82), f.X(0.58), f.Y(0.82)]); ink(ctx, it);
        poly(ctx, [f.X(0.5), f.Y(0.02), f.X(0.5), f.Y(0.1)]); ink(ctx, it);
        poly(ctx, [f.X(0.14), f.Y(0.2), f.X(0.2), f.Y(0.26)]); ink(ctx, it);
        poly(ctx, [f.X(0.86), f.Y(0.2), f.X(0.8), f.Y(0.26)]); ink(ctx, it);
      },
    },
    'clock': {
      name: '时钟', draw(ctx, it) {
        const f = frame(it), r = Math.min(f.w, f.h) * 0.42;
        ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), r, 0, TAU); ink(ctx, it, true);
        poly(ctx, [f.X(0.5), f.Y(0.5), f.X(0.5), f.Y(0.24)]); ink(ctx, it);
        poly(ctx, [f.X(0.5), f.Y(0.5), f.X(0.68), f.Y(0.58)]); ink(ctx, it);
      },
    },
    'star': {
      name: '星标', draw(ctx, it) {
        const f = frame(it), pts = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.22 : 0.46;
          pts.push(f.X(0.5 + Math.cos(a) * r), f.Y(0.5 + Math.sin(a) * r));
        }
        poly(ctx, pts, true); ink(ctx, it, true);
      },
    },
    'flag': {
      name: '小旗', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.2), f.Y(0.9), f.X(0.2), f.Y(0.08)]); ink(ctx, it);
        poly(ctx, [f.X(0.2), f.Y(0.1), f.X(0.82), f.Y(0.24), f.X(0.2), f.Y(0.4)], true); ink(ctx, it, true);
      },
    },
    'heart': {
      name: '爱心', draw(ctx, it) {
        const f = frame(it);
        ctx.beginPath();
        ctx.moveTo(f.X(0.5), f.Y(0.86));
        ctx.bezierCurveTo(f.X(0.02), f.Y(0.52), f.X(0.16), f.Y(0.08), f.X(0.5), f.Y(0.3));
        ctx.bezierCurveTo(f.X(0.84), f.Y(0.08), f.X(0.98), f.Y(0.52), f.X(0.5), f.Y(0.86));
        ink(ctx, it, true);
      },
    },
    'bookmark': {
      name: '书签', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.28), f.Y(0.08), f.X(0.72), f.Y(0.08), f.X(0.72), f.Y(0.9), f.X(0.5), f.Y(0.72), f.X(0.28), f.Y(0.9)], true);
        ink(ctx, it, true);
      },
    },
    'pin': {
      name: '图钉', draw(ctx, it) {
        const f = frame(it);
        ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.34), Math.min(f.w, f.h) * 0.24, 0, TAU); ink(ctx, it, true);
        poly(ctx, [f.X(0.5), f.Y(0.58), f.X(0.5), f.Y(0.92)]); ink(ctx, it);
      },
    },
    'cloud': {
      name: '云朵', draw(ctx, it) {
        const f = frame(it);
        ctx.beginPath();
        ctx.arc(f.X(0.34), f.Y(0.56), f.w * 0.16, Math.PI * 0.5, Math.PI * 1.5);
        ctx.arc(f.X(0.5), f.Y(0.4), f.w * 0.18, Math.PI, Math.PI * 1.9);
        ctx.arc(f.X(0.68), f.Y(0.56), f.w * 0.16, Math.PI * 1.4, Math.PI * 0.5);
        ctx.closePath();
        ink(ctx, it, true);
      },
    },
    'sun': {
      name: '太阳', draw(ctx, it) {
        const f = frame(it), r = Math.min(f.w, f.h) * 0.2;
        ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), r, 0, TAU); ink(ctx, it, true);
        for (let i = 0; i < 8; i++) {
          const a = i * TAU / 8;
          poly(ctx, [f.X(0.5 + Math.cos(a) * 0.28), f.Y(0.5 + Math.sin(a) * 0.28),
            f.X(0.5 + Math.cos(a) * 0.44), f.Y(0.5 + Math.sin(a) * 0.44)]); ink(ctx, it);
        }
      },
    },
    'magnifier': {
      name: '放大镜', draw(ctx, it) {
        const f = frame(it), r = Math.min(f.w, f.h) * 0.28;
        ctx.beginPath(); ctx.arc(f.X(0.44), f.Y(0.44), r, 0, TAU); ink(ctx, it, true);
        poly(ctx, [f.X(0.64), f.Y(0.64), f.X(0.9), f.Y(0.9)]); ink(ctx, it);
      },
    },
    'pen': {
      name: '铅笔', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.2), f.Y(0.8), f.X(0.72), f.Y(0.16), f.X(0.86), f.Y(0.28), f.X(0.34), f.Y(0.92)], true);
        ink(ctx, it, true);
        poly(ctx, [f.X(0.2), f.Y(0.8), f.X(0.34), f.Y(0.92), f.X(0.1), f.Y(0.94)], true); ink(ctx, it);
      },
    },
    'book': {
      name: '书本', draw(ctx, it) {
        const f = frame(it);
        ctx.beginPath();
        ctx.moveTo(f.X(0.5), f.Y(0.22));
        ctx.quadraticCurveTo(f.X(0.26), f.Y(0.12), f.X(0.08), f.Y(0.2));
        ctx.lineTo(f.X(0.08), f.Y(0.82));
        ctx.quadraticCurveTo(f.X(0.26), f.Y(0.74), f.X(0.5), f.Y(0.84));
        ctx.quadraticCurveTo(f.X(0.74), f.Y(0.74), f.X(0.92), f.Y(0.82));
        ctx.lineTo(f.X(0.92), f.Y(0.2));
        ctx.quadraticCurveTo(f.X(0.74), f.Y(0.12), f.X(0.5), f.Y(0.22));
        ctx.closePath();
        ink(ctx, it, true);
        poly(ctx, [f.X(0.5), f.Y(0.22), f.X(0.5), f.Y(0.84)]); ink(ctx, it);
      },
    },
    'ruler': {
      name: '直尺', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.06), f.Y(0.34), f.X(0.94), f.Y(0.34), f.X(0.94), f.Y(0.66), f.X(0.06), f.Y(0.66)], true);
        ink(ctx, it, true);
        for (let i = 1; i < 8; i++) {
          const x = f.X(0.06 + 0.88 * i / 8);
          poly(ctx, [x, f.Y(0.34), x, f.Y(i % 2 ? 0.46 : 0.52)]); ink(ctx, it);
        }
      },
    },
    'scissors': {
      name: '剪刀', draw(ctx, it) {
        const f = frame(it);
        ctx.beginPath(); ctx.arc(f.X(0.24), f.Y(0.78), Math.min(f.w, f.h) * 0.12, 0, TAU); ink(ctx, it);
        ctx.beginPath(); ctx.arc(f.X(0.24), f.Y(0.22), Math.min(f.w, f.h) * 0.12, 0, TAU); ink(ctx, it);
        poly(ctx, [f.X(0.34), f.Y(0.26), f.X(0.9), f.Y(0.7)]); ink(ctx, it);
        poly(ctx, [f.X(0.34), f.Y(0.74), f.X(0.9), f.Y(0.3)]); ink(ctx, it);
      },
    },
    'tape': {
      name: '胶带', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.1), f.Y(0.34), f.X(0.9), f.Y(0.28), f.X(0.9), f.Y(0.7), f.X(0.1), f.Y(0.76)], true);
        ink(ctx, it, true);
      },
    },
    'thumb': {
      name: '点赞', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.2), f.Y(0.46), f.X(0.44), f.Y(0.46), f.X(0.5), f.Y(0.14), f.X(0.62), f.Y(0.16),
          f.X(0.58), f.Y(0.46), f.X(0.84), f.Y(0.46), f.X(0.84), f.Y(0.9), f.X(0.2), f.Y(0.9)], true);
        ink(ctx, it, true);
      },
    },
    'smile': {
      name: '笑脸', draw(ctx, it) {
        const f = frame(it), r = Math.min(f.w, f.h) * 0.42;
        ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), r, 0, TAU); ink(ctx, it, true);
        const eye = Math.max(1.5, Math.min(f.w, f.h) * 0.05);
        ctx.beginPath(); ctx.arc(f.X(0.38), f.Y(0.42), eye, 0, TAU);
        ctx.arc(f.X(0.62), f.Y(0.42), eye, 0, TAU);
        ctx.fillStyle = it.color || '#3c4858'; ctx.fill();
        ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.54), r * 0.52, 0.25, Math.PI - 0.25); ink(ctx, it);
      },
    },
    'warning': {
      name: '警示三角', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.5), f.Y(0.1), f.X(0.94), f.Y(0.86), f.X(0.06), f.Y(0.86)], true);
        ink(ctx, it, true);
        poly(ctx, [f.X(0.5), f.Y(0.34), f.X(0.5), f.Y(0.58)]); ink(ctx, it);
        ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.7), Math.min(f.w, f.h) * 0.04, 0, TAU);
        ctx.fillStyle = it.color || '#3c4858'; ctx.fill();
      },
    },
    'target': {
      name: '靶心', draw(ctx, it) {
        const f = frame(it), r = Math.min(f.w, f.h) * 0.42;
        for (const k of [1, 0.62, 0.24]) {
          ctx.beginPath(); ctx.arc(f.X(0.5), f.Y(0.5), r * k, 0, TAU); ink(ctx, it, k === 0.24);
        }
      },
    },
    'battery': {
      name: '电池', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.08), f.Y(0.32), f.X(0.84), f.Y(0.32), f.X(0.84), f.Y(0.68), f.X(0.08), f.Y(0.68)], true);
        ink(ctx, it, true);
        poly(ctx, [f.X(0.84), f.Y(0.44), f.X(0.94), f.Y(0.44), f.X(0.94), f.Y(0.56), f.X(0.84), f.Y(0.56)], true);
        ink(ctx, it, true);
      },
    },
    'calendar': {
      name: '日历', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.1), f.Y(0.2), f.X(0.9), f.Y(0.2), f.X(0.9), f.Y(0.9), f.X(0.1), f.Y(0.9)], true);
        ink(ctx, it, true);
        poly(ctx, [f.X(0.1), f.Y(0.36), f.X(0.9), f.Y(0.36)]); ink(ctx, it);
        for (let i = 0; i < 3; i++) poly(ctx, [f.X(0.26 + i * 0.24), f.Y(0.12), f.X(0.26 + i * 0.24), f.Y(0.26)]), ink(ctx, it);
      },
    },
    'border': {
      name: '边框', draw(ctx, it) {
        const f = frame(it);
        ctx.setLineDash([Math.max(4, f.w * 0.03), Math.max(3, f.w * 0.022)]);
        poly(ctx, [f.X(0.05), f.Y(0.05), f.X(0.95), f.Y(0.05), f.X(0.95), f.Y(0.95), f.X(0.05), f.Y(0.95)], true);
        ink(ctx, it);
        ctx.setLineDash([]);
      },
    },
    'cloud-rain': {
      name: '下雨云', draw(ctx, it) {
        const f = frame(it);
        ctx.beginPath();
        ctx.arc(f.X(0.34), f.Y(0.44), f.w * 0.15, Math.PI * 0.5, Math.PI * 1.5);
        ctx.arc(f.X(0.5), f.Y(0.3), f.w * 0.17, Math.PI, Math.PI * 1.9);
        ctx.arc(f.X(0.66), f.Y(0.44), f.w * 0.15, Math.PI * 1.4, Math.PI * 0.5);
        ctx.closePath(); ink(ctx, it, true);
        for (let i = 0; i < 3; i++) poly(ctx, [f.X(0.32 + i * 0.18), f.Y(0.68), f.X(0.28 + i * 0.18), f.Y(0.9)]), ink(ctx, it);
      },
    },
    'chart': {
      name: '柱状图', draw(ctx, it) {
        const f = frame(it);
        poly(ctx, [f.X(0.1), f.Y(0.1), f.X(0.1), f.Y(0.9), f.X(0.92), f.Y(0.9)]); ink(ctx, it);
        const hs = [0.3, 0.5, 0.24, 0.62];
        for (let i = 0; i < 4; i++) {
          const x = f.X(0.2 + i * 0.18);
          ctx.fillRect(x, f.Y(0.9 - hs[i]), f.w * 0.11, f.h * hs[i]);
          ctx.globalAlpha = 0.3; ctx.fillStyle = it.color || '#3c4858';
          ctx.fillRect(x, f.Y(0.9 - hs[i]), f.w * 0.11, f.h * hs[i]);
          ctx.globalAlpha = 1;
        }
      },
    },
  };

  const KEYS = Object.keys(DEFS);

  GW.stickers = {
    keys: KEYS,
    list: () => KEYS.map((k) => ({ key: k, name: DEFS[k].name })),
    name: (k) => (DEFS[k] ? DEFS[k].name : k),
    // 插入到视口中心，屏幕尺寸恒定（约 120×120 的世界尺寸 × 1/缩放）
    insert(key, opt) {
      const d = DEFS[key];
      if (!d) return null;
      const c = GW.viewCenter ? GW.viewCenter() : { x: 0, y: 0 };
      const s = (GW.camera && GW.camera.s) || 1;
      const w = (opt && opt.w) || 120 / s, h = (opt && opt.h) || 120 / s;
      const it = {
        id: GW.uid(), kind: 'shape', type: 'stk', key,
        x1: c.x - w / 2, y1: c.y - h / 2, x2: c.x + w / 2, y2: c.y + h / 2,
        rot: 0,
        color: (opt && opt.color) || (GW.tool && GW.tool.pen && GW.tool.pen.color) || '#3c4858',
        width: Math.max(1.6, (opt && opt.width) || 2.4),
        opacity: 1,
      };
      if (GW.tool && GW.tool.set) GW.tool.set('select');
      GW.addItems([it]);
      if (GW.selection) { GW.selection.set([it]); GW.selection.render(); }
      if (GW.requestRender) GW.requestRender();
      return it;
    },
    draw(ctx, it) {
      const d = DEFS[it.key];
      if (!d) return;
      ctx.save();
      if (it.opacity != null && it.opacity < 1) ctx.globalAlpha = Math.max(0, it.opacity);
      if (it.rot) {
        const cx = (it.x1 + it.x2) / 2, cy = (it.y1 + it.y2) / 2;
        ctx.translate(cx, cy); ctx.rotate(it.rot); ctx.translate(-cx, -cy);
      }
      try { d.draw(ctx, it); } finally { ctx.restore(); }
    },
    // 包围盒：按旋转后的四角取 AABB（选中框、局部重画、导出都靠它）
    bbox(it) {
      const cs = this.corners(it);
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const c of cs) { x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); x2 = Math.max(x2, c.x); y2 = Math.max(y2, c.y); }
      const m = Math.max(1, (it.width || 2)) * 0.6;
      return { x: x1 - m, y: y1 - m, w: x2 - x1 + m * 2, h: y2 - y1 + m * 2 };
    },
    // 包围盒：按旋转后的四角取 AABB（选中框、局部重画、导出都靠它）
    bbox(it) {
      const cs = this.corners(it);
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const c of cs) { x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); x2 = Math.max(x2, c.x); y2 = Math.max(y2, c.y); }
      const m = Math.max(1, (it.width || 2)) * 0.6;
      return { x: x1 - m, y: y1 - m, w: x2 - x1 + m * 2, h: y2 - y1 + m * 2 };
    },
    // 探针用：给定它，算四个角（含旋转）—— 验证「旋转后几何真的转了」
    corners(it) {
      const x1 = Math.min(it.x1, it.x2), y1 = Math.min(it.y1, it.y2);
      const x2 = Math.max(it.x1, it.x2), y2 = Math.max(it.y1, it.y2);
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, a = it.rot || 0;
      const cs = Math.cos(a), sn = Math.sin(a);
      return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(([x, y]) => ({
        x: cx + (x - cx) * cs - (y - cy) * sn,
        y: cy + (x - cx) * sn + (y - cy) * cs,
      }));
    },
    // 面板：一行 30 个按钮（按需打开，一次建好）
    panel() {
      const h = GW.h;
      const box = h('div', { class: 'stk-grid' });
      for (const k of KEYS) {
        const cv = h('canvas', { class: 'stk-thumb', width: 44, height: 44, title: DEFS[k].name });
        try {
          const c2 = cv.getContext('2d');
          this.draw(c2, { x1: 4, y1: 4, x2: 40, y2: 40, color: '#3c4858', width: 2, key: k });
        } catch (e) { /* 缩略图失败不影响插入 */ }
        box.append(h('button', { class: 'stk-cell', title: '插入「' + DEFS[k].name + '」',
          onclick: () => { this.insert(k); if (GW.toast) GW.toast('已插入「' + DEFS[k].name + '」', 1600); } }, cv));
      }
      return box;
    },
  };
})();
