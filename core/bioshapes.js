/* 生化 · 生物可调参图形（1.6.0 第1批 L1/L2 起）
   加载顺序：core/physshapes.js、core/physshapes-proj.js、core/chemshapes.js 之后，core/app.js 之前。
   与物理/化学图形共用注册表与参数协议，只多 subject:'bio'；生物页按 P.subjectCats('bio') 取分类。
*/
(function () {
  if (!window.GW || !GW.physShapes) return;
  const P = GW.physShapes;
  P.projErrors = P.projErrors || [];
  P.catLabel = P.catLabel || {};
  P.catLabel.bioCell = '细胞分裂';
  P.catLabel.bioOsmosis = '水分代谢';
  P.catLabel.bioGenetics = '遗传规律';
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
    d.subject = d.subject || 'bio';
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
  function cellOval(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2); c.stroke(); }
  function fillOval(c, gh, col, x, y, rx, ry, a) {
    c.save();
    c.beginPath(); c.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    c.fillStyle = gh.tint(col, a == null ? 0.12 : a);
    c.fill(); c.restore();
  }
  function txt(c, s, x, y, size, align) {
    c.save(); c.fillStyle = '#1b2433';
    c.textAlign = align || 'center'; c.textBaseline = 'middle';
    if (GW.typo) GW.typo.draw(c, String(s), x, y, size, { align: align || 'center', color: '#1b2433' });
    else { c.font = '600 ' + size.toFixed(1) + 'px system-ui, sans-serif'; c.fillText(s, x, y); }
    c.restore();
  }
  // 一条染色体：dup=true 画成「X」（两条姐妹染色单体共用一个着丝点），否则一根短棒。
  // 用两根交叉的棒表示 X —— 比画「横杠 + 四条弯臂」干净得多（第一版糊成一团，看图才发现）。
  function chrom(c, x, y, L, ang, dup) {
    c.save();
    c.lineWidth = Math.max(1.2, L * 0.10);
    const rod = function (a) {
      const dx = Math.cos(a) * L * 0.5, dy = Math.sin(a) * L * 0.5;
      ln(c, x - dx, y - dy, x + dx, y + dy);
    };
    if (dup) { rod((ang || 0) + 0.40); rod((ang || 0) - 0.40); }
    else rod(ang || 0);
    c.restore();
  }

  /* ---------- L1 有丝分裂 / 减数分裂对照 ---------- */
  // 2n=4：左边有丝分裂、右边减数分裂，同一个「阶段」滑块同时推进两边（有丝只有 4 个阶段）。
  // 染色体数/DNA 数按阶段表算：间期复制后 DNA 加倍但染色体数不变；减 I 末同源分开、减 II 末姐妹分开。
  const DIV_STAGE = param('b_bio_cellDiv_stage', { label: '阶段', min: 0, max: 5, step: 1, def: 1, unit: '' });
  const DIV_LAB = param('b_bio_cellDiv_lab', { label: '文字标注', min: 0, max: 1, step: 1, def: 0, unit: '0隐1显' });

  reg({
    key: 'b_bio_cellDiv', cat: 'bioCell', subject: 'bio', label: '有丝/减数分裂对照',
    icon: '<circle cx="8" cy="10" r="5"/><circle cx="17" cy="14" r="5"/><path d="M8 8v4M17 12v4"/>',
    params: [DIV_STAGE, DIV_LAB],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const stage = Math.max(0, Math.min(5, Math.round(o.b_bio_cellDiv_stage)));
      const lab = +o.b_bio_cellDiv_lab > 0.5;
      const fs = Math.max(8.5, Math.min(12.5, b.h * 0.042));
      const R = Math.min(b.w * 0.20, b.h * 0.30);
      const L = R * 0.36;

      // 两个细胞：左有丝、右减数
      const L1 = { x: X(0.26), y: Y(0.52) }, R1 = { x: X(0.74), y: Y(0.52) };
      c.lineWidth = Math.max(1, o.size * 0.5);
      cellOval(c, L1.x, L1.y, R, R * 0.92);
      cellOval(c, R1.x, R1.y, R, R * 0.92);

      // ---- 左：有丝分裂（stage 0..3，>3 停在末期） ----
      const ms = Math.min(3, stage);
      if (ms === 0) {
        chrom(c, L1.x - R * 0.30, L1.y - R * 0.28, L, 0.5, true);
        chrom(c, L1.x + R * 0.12, L1.y - R * 0.42, L, -0.4, true);
        chrom(c, L1.x - R * 0.10, L1.y + R * 0.20, L, 1.1, true);
        chrom(c, L1.x + R * 0.34, L1.y + R * 0.30, L, 0.2, true);
      } else if (ms === 1) {
        for (let i = 0; i < 4; i++) chrom(c, L1.x + (i - 1.5) * R * 0.42, L1.y, L, Math.PI / 2, true);
      } else if (ms === 2) {
        for (let i = 0; i < 4; i++) {
          const dx = (i - 1.5) * R * 0.42;
          chrom(c, L1.x + dx, L1.y - R * 0.42, L * 0.9, 0, false);
          chrom(c, L1.x + dx, L1.y + R * 0.42, L * 0.9, 0, false);
        }
      } else {
        // 末期：两个子核，每个核里 4 条染色体（2n=4 的物种，每个子细胞仍是 4 条）。
        // 拆成 2×2 排布，缩到原来一半大小 —— 别写「每核 2 条」，那是把染色体数除以 2 了。
        for (let k = 0; k < 2; k++) {
          const nx = L1.x - R * 0.40, ny = L1.y + (k ? R * 0.30 : -R * 0.30);
          fillOval(c, GH, o.color, nx, ny, R * 0.30, R * 0.245, 0.10);
          for (let i = 0; i < 4; i++) {
            chrom(c, nx + (i % 2 ? R * 0.11 : -R * 0.11), ny + (i < 2 ? -R * 0.10 : R * 0.10), L * 0.42, 0.5, false);
          }
        }
      }

      // ---- 右：减数分裂 ----
      if (stage === 0) {
        // 减 I 前期：两个四分体（同源染色体两两配对）
        // 两个四分体斜放在细胞内（同源染色体配对，两两靠在一起）
        for (let i = 0; i < 2; i++) {
          const bx = R1.x + (i ? 0.22 : -0.24) * R, by = R1.y + (i ? 0.20 : -0.22) * R;
          chrom(c, bx - R * 0.11, by - R * 0.05, L, 1.1, true);
          chrom(c, bx + R * 0.11, by + R * 0.05, L, -1.1, true);
        }
      } else if (stage === 1) {
        // 减 I 中期：同源染色体分别朝向两极，排在赤道两侧
        for (let i = 0; i < 2; i++) {
          const dx = (i - 0.5) * R * 0.66;
          chrom(c, R1.x + dx, R1.y - R * 0.20, L, 0, true);
          chrom(c, R1.x + dx, R1.y + R * 0.20, L, 0, true);
        }
      } else if (stage === 2) {
        // 减 I 后期：同源染色体分开，每极仍是 2 条「X」
        for (let i = 0; i < 2; i++) {
          const dx = (i - 0.5) * R * 0.50;
          chrom(c, R1.x + dx, R1.y - R * 0.46, L * 0.9, 0, true);
          chrom(c, R1.x + dx, R1.y + R * 0.46, L * 0.9, 0, true);
        }
      } else if (stage === 3) {
        // 减 II 中期：两个子细胞，各 2 条 X 排在赤道
        cellOval(c, R1.x - R * 0.52, R1.y, R * 0.44, R * 0.40);
        cellOval(c, R1.x + R * 0.52, R1.y, R * 0.44, R * 0.40);
        for (let i = 0; i < 2; i++) {
          chrom(c, R1.x - R * 0.52, R1.y + (i - 0.5) * R * 0.34, L * 0.5, Math.PI / 2, true);
          chrom(c, R1.x + R * 0.52, R1.y + (i - 0.5) * R * 0.34, L * 0.5, Math.PI / 2, true);
        }
      } else if (stage === 4) {
        // 减 II 后期：姐妹染色单体分开
        cellOval(c, R1.x - R * 0.52, R1.y, R * 0.44, R * 0.40);
        cellOval(c, R1.x + R * 0.52, R1.y, R * 0.44, R * 0.40);
        for (const cx2 of [R1.x - R * 0.52, R1.x + R * 0.52]) {
          chrom(c, cx2 - R * 0.16, R1.y - R * 0.14, L * 0.45, 0, false);
          chrom(c, cx2 + R * 0.16, R1.y - R * 0.14, L * 0.45, 0, false);
          chrom(c, cx2 - R * 0.16, R1.y + R * 0.14, L * 0.45, 0, false);
          chrom(c, cx2 + R * 0.16, R1.y + R * 0.14, L * 0.45, 0, false);
        }
      } else {
        // 减 II 末期：四个子细胞，各 2 条单棒
        const pts = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (const p of pts) {
          const cx2 = R1.x + p[0] * R * 0.50, cy2 = R1.y + p[1] * R * 0.44;
          cellOval(c, cx2, cy2, R * 0.30, R * 0.26);
          chrom(c, cx2 - R * 0.08, cy2, L * 0.38, 0.3, false);
          chrom(c, cx2 + R * 0.08, cy2, L * 0.38, -0.3, false);
        }
      }

      if (lab) {
        txt(c, '2n=4', L1.x, Y(0.93), fs);
        txt(c, '有丝分裂', L1.x, Y(0.06), fs);
        txt(c, '减数分裂', R1.x, Y(0.06), fs);
      }
    },
  });

  /* ---------- L2 渗透 / 质壁分离 ---------- */
  // 成熟植物细胞（有大液泡、细胞壁）。外液浓度低 → 吸水；高 → 失水、原生质层收缩离开细胞壁。
  // 只做定性关系，不凭浓度算体积。
  const OSM_EXT = param('b_bio_osmosis_ext', { label: '外液浓度', min: 0, max: 1, step: 0.05, def: 0.8, unit: '相对' });
  const OSM_LAB = param('b_bio_osmosis_lab', { label: '文字标注', min: 0, max: 1, step: 1, def: 0, unit: '0隐1显' });

  reg({
    key: 'b_bio_osmosis', cat: 'bioOsmosis', subject: 'bio', label: '渗透与质壁分离',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><ellipse cx="12" cy="12" rx="6" ry="5"/>',
    params: [OSM_EXT, OSM_LAB],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const ext = Math.max(0, Math.min(1, +o.b_bio_osmosis_ext));
      const lab = +o.b_bio_osmosis_lab > 0.5;
      const fs = Math.max(8.5, Math.min(12.5, b.h * 0.042));
      const cx = X(0.50), cy = Y(0.50);
      const W = b.w * 0.30, H = b.h * 0.32;

      // 细胞壁（双线，保持形状）
      c.lineWidth = Math.max(1, o.size * 0.5);
      roundRect(c, cx - W, cy - H, W * 2, H * 2, Math.min(W, H) * 0.22);
      roundRect(c, cx - W * 0.93, cy - H * 0.93, W * 1.86, H * 1.86, Math.min(W, H) * 0.20);

      // 原生质层：外液浓度越高，收缩越明显（0.5 为等渗，不收缩）
      const shrink = Math.max(0, (ext - 0.5) / 0.5);      // 0..1
      const k = 1 - 0.30 * shrink;
      const prx = W * 0.80 * k, pry = H * 0.80 * k;
      fillOval(c, GH, o.color, cx, cy, prx, pry, 0.10);
      cellOval(c, cx, cy, prx, pry);
      // 液泡
      fillOval(c, GH, o.color, cx, cy, prx * 0.55, pry * 0.55, 0.16);
      cellOval(c, cx, cy, prx * 0.55, pry * 0.55);
      // 细胞核：贴在原生质层内侧
      fillOval(c, GH, o.color, cx + prx * 0.55, cy - pry * 0.42, W * 0.09, H * 0.09, 0.30);
      cellOval(c, cx + prx * 0.55, cy - pry * 0.42, W * 0.09, H * 0.09);

      // 水流方向：高于等渗 → 水出来（箭头朝外），低于 → 吸水（箭头朝里）
      const out = ext > 0.5 + 1e-6, inn = ext < 0.5 - 1e-6;
      if (out || inn) {
        // 箭头从细胞壁外侧起、朝外指（失水）或朝里指（吸水）：贴着壁画会连成一片斜线
        const rx = W * 1.14, ry = H * 1.16;
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2;   // 上下左右四条边各一个，别放角上（会和圆角糊在一起）
          const ux = Math.cos(ang), uy = Math.sin(ang);
          const x1 = cx + ux * rx, y1 = cy + uy * ry;
          const x2 = cx + ux * (rx + b.h * 0.11), y2 = cy + uy * (ry + b.h * 0.11);
          if (out) arw(c, GH, x1, y1, x2, y2); else arw(c, GH, x2, y2, x1, y1);
        }
      }

      if (lab) {
        txt(c, out ? '失水' : inn ? '吸水' : '等渗', cx, Y(0.06), fs);
        txt(c, '细胞壁', cx - W * 1.05, cy - H * 1.0, fs, 'left');
        txt(c, '液泡', cx, cy, fs);
      }
    },
  });

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y); c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr); c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h); c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr); c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
    c.stroke();
  }

  /* ---------- 叶绿体（1.6.0 L3） ---------- */
  // 双层膜 + 基粒（一摞一摞的类囊体）+ 基质。光参数只影响外面的入射箭头，
  // 结构不随参数变形 —— 这是「结构图」，不是动力学模型。
  const CHL_LIGHT = param('b_bio_chloroplast_light', { label: '光照', min: 0, max: 1, step: 1, def: 1, unit: '0暗1光' });
  const CHL_LAB = param('b_bio_chloroplast_lab', { label: '文字标注', min: 0, max: 1, step: 1, def: 0, unit: '0隐1显' });

  reg({
    key: 'b_bio_chloroplast', cat: 'bioCell', subject: 'bio', label: '叶绿体结构',
    icon: '<ellipse cx="12" cy="12" rx="9" ry="5"/><path d="M6 10h4M6 14h4M14 10h4M14 14h4"/>',
    params: [CHL_LIGHT, CHL_LAB],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const light = +o.b_bio_chloroplast_light > 0.5;
      const lab = +o.b_bio_chloroplast_lab > 0.5;
      const fs = Math.max(8.5, Math.min(12.5, b.h * 0.042));
      c.lineWidth = Math.max(1, o.size * 0.5);
      const cx = X(0.50), cy = Y(0.52), rx = b.w * 0.34, ry = b.h * 0.26;
      // 双层膜
      c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(cx, cy, rx * 0.94, ry * 0.92, 0, 0, Math.PI * 2); c.stroke();
      // 基粒：3 摞类囊体（每摞 3–4 片圆角短线）
      const grana = [[-0.16, -0.06], [0.02, 0.10], [0.18, -0.10]];
      for (let gi = 0; gi < grana.length; gi++) {
        const gx = cx + grana[gi][0] * rx, gy = cy + grana[gi][1] * ry;
        for (let i = 0; i < 4; i++) {
          const yy = gy + (i - 1.5) * ry * 0.10;
          c.save();
          c.lineWidth = Math.max(1.2, o.size * 0.55);
          c.beginPath();
          c.moveTo(gx - rx * 0.055, yy);
          c.quadraticCurveTo(gx, yy - ry * 0.05, gx + rx * 0.055, yy);
          c.stroke();
          c.restore();
        }
      }
      // 基质：几个小点（核糖体/DNA 的意思，不写字）
      c.save();
      c.fillStyle = GH.tint(o.color, 0.5);
      const r0 = Math.max(1, b.w * 0.005);
      [[-0.26, 0.12], [-0.22, 0.16], [0.26, 0.06], [0.24, 0.12]].forEach((p) => {
        c.beginPath(); c.arc(cx + p[0] * rx, cy + p[1] * ry, r0, 0, Math.PI * 2); c.fill();
      });
      c.restore();
      if (light) {
        for (let i = 0; i < 3; i++) {
          arw(c, GH, X(0.06), Y(0.20 + i * 0.09), X(0.22), Y(0.30 + i * 0.09));
        }
      }
      if (lab) txt(c, '基粒', cx, Y(0.92), fs, 'center');
    },
  });

  /* ---------- 线粒体（1.6.0 L4） ---------- */
  // 外膜 + 内膜（向内折成嵴）。嵴的数量是参数，但结构保持「一整个细胞器」。
  const MITO_CRI = param('b_bio_mito_cristae', { label: '嵴的数量', min: 3, max: 9, step: 1, def: 6, unit: '条' });
  const MITO_LAB = param('b_bio_mito_lab', { label: '文字标注', min: 0, max: 1, step: 1, def: 0, unit: '0隐1显' });

  reg({
    key: 'b_bio_mito', cat: 'bioCell', subject: 'bio', label: '线粒体结构',
    icon: '<ellipse cx="12" cy="12" rx="9" ry="5"/><path d="M8 9v6M12 9v6M16 9v6"/>',
    params: [MITO_CRI, MITO_LAB],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const n = Math.max(3, Math.min(9, Math.round(o.b_bio_mito_cristae)));
      const lab = +o.b_bio_mito_lab > 0.5;
      const fs = Math.max(8.5, Math.min(12.5, b.h * 0.042));
      c.lineWidth = Math.max(1, o.size * 0.5);
      const cx = X(0.50), cy = Y(0.52), rx = b.w * 0.34, ry = b.h * 0.24;
      c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(cx, cy, rx * 0.94, ry * 0.90, 0, 0, Math.PI * 2); c.stroke();
      // 嵴：从上/下内膜交替折进去
      c.save();
      c.lineWidth = Math.max(1.1, o.size * 0.5);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = cx - rx * 0.78 + rx * 1.56 * t;
        const up = i % 2 === 0;
        const y0 = cy + (up ? -1 : 1) * ry * 0.88;
        const y1 = cy + (up ? 1 : -1) * ry * 0.42;
        c.beginPath();
        c.moveTo(x, y0);
        c.quadraticCurveTo(x + rx * 0.05, (y0 + y1) / 2, x, y1);
        c.stroke();
      }
      c.restore();
      if (lab) txt(c, '嵴', cx, Y(0.90), fs, 'center');
    },
  });

  /* ---------- 单基因杂交棋盘格（1.6.0 L5） ---------- */
  // 2×2 的配子棋盘格。字母就是内容本身（A/a 必须写），所以这张图不是「少写字」的反例。
  const PUN_MODE = param('b_bio_punnett_mode', { label: '亲本组合', min: 0, max: 2, step: 1, def: 0, unit: '0Aa×Aa 1Aa×aa 2AA×aa' });
  const PUN_LAB = param('b_bio_punnett_lab', { label: '表型标注', min: 0, max: 1, step: 1, def: 0, unit: '0隐1显' });

  reg({
    key: 'b_bio_punnett', cat: 'bioGenetics', subject: 'bio', label: '单基因杂交棋盘格',
    icon: '<rect x="5" y="5" width="14" height="14"/><path d="M12 5v14M5 12h14"/>',
    params: [PUN_MODE, PUN_LAB],
    draw(c, o, GH) {
      const b = GH.box(o);
      const X = (u) => b.x1 + b.w * u, Y = (v) => b.y1 + b.h * v;
      const mode = Math.round(o.b_bio_punnett_mode);
      const lab = +o.b_bio_punnett_lab > 0.5;
      const fs = Math.max(11, Math.min(20, b.h * 0.075));
      c.lineWidth = Math.max(1, o.size * 0.5);
      // 配子（上：父本、左：母本）
      let top, left;
      if (mode === 0) { top = ['A', 'a']; left = ['A', 'a']; }
      else if (mode === 1) { top = ['A', 'a']; left = ['a', 'a']; }
      else { top = ['A', 'A']; left = ['a', 'a']; }
      const x0 = X(0.24), y0 = Y(0.22), cell = Math.min(b.w * 0.26, b.h * 0.26);
      // 棋盘
      for (let r = 0; r <= 2; r++) ln(c, x0, y0 + cell * r, x0 + cell * 2, y0 + cell * r);
      for (let cix = 0; cix <= 2; cix++) ln(c, x0 + cell * cix, y0, x0 + cell * cix, y0 + cell * 2);
      // 表头字母
      for (let i = 0; i < 2; i++) {
        txt(c, top[i], x0 + cell * (i + 0.5), y0 - cell * 0.42, fs);
        txt(c, left[i], x0 - cell * 0.40, y0 + cell * (i + 0.5), fs);
      }
      // 格子里的基因型（大写在前，符合书写习惯）：先算出来，比例也由这四格统计
      const cells = [];
      for (let r = 0; r < 2; r++) {
        for (let cix = 0; cix < 2; cix++) {
          const norm = (left[r] + top[cix]).split('').sort().join('');
          cells.push(norm);
          txt(c, norm, x0 + cell * (cix + 0.5), y0 + cell * (r + 0.5), fs);
        }
      }
      if (lab) {
        // 单基因完全显性：只要带 A 就是显性表型。比例直接从四格统计，不再写死 3:1
        const dom = cells.filter((g) => g.indexOf('A') >= 0).length;
        const rec = cells.length - dom;
        const ratio = rec === 0 ? '全为显性'
          : dom === 0 ? '全为隐性'
          : dom === rec ? '1 : 1'
          : dom + ' : ' + rec;
        txt(c, ratio, X(0.50), Y(0.90), fs);
      }
    },
  });

})();
