/* 内容模板生成器（2.0.7 · S3）—— 39 个模板的共用积木。
 *
 * 为什么要它：42 个内容模板如果每个都手写 x/y/w/h，坐标会散成一片，改一个页边距要动 42 处。
 * 这里把「一页的版面」抽象成 K.*：全部按**比例**（0~1）描述，K 实例绑定了页面尺寸 W/H，
 * 内部换算成「以页面中心为原点」的坐标 —— 与 1.6.9 的 CONTENT_TPL.objs 完全同一个规格：
 *   { x, y, w, h, size, html }（x/y 是页面中心系的左上角，见 board.js addPageContent）。
 *
 * 硬约束：
 *   - 单模板对象数 ≤12（board.js 兜底截断；页面 DOM 对象不能失控）。
 *   - 只产出**文本对象**，不新增对象种类、不动 .gewu 格式（落盘就是普通文本对象）。
 *   - 全部带 locked（R2）：模板对象不许挡笔，标题栏仍可点。
 */
(function () {
  const GW = (window.GW = window.GW || {});
  const TBL = 'border-collapse:collapse;width:100%;font-size:13px';
  const TD = 'border:1px solid rgba(60,72,88,.45);padding:6px 8px';
  const TH = TD + ';background:rgba(15,157,138,.12);font-weight:700';
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 一个 K 实例 = 一页的版面工具。W/H 是页面世界尺寸（A4 竖 794×1123 / 横 1123×794）。
  function of(W, H) {
    const px = (u) => (u - 0.5) * W;
    const py = (v) => (v - 0.5) * H;
    const W_ = W, H_ = H;
    const out = (x, y, w, h, html, size) => ({ x: Math.round(px(x)), y: Math.round(py(y)), w: Math.round(w * W_), h: Math.round(h * H_), size: size || 14, html });
    const K = {
      W: W_, H: H_,
      // 标题 + 一行 meta（班级/日期这类填空）
      header(title, meta, o) {
        o = o || {};
        const u0 = o.x == null ? 0.08 : o.x, w = o.w == null ? 0.84 : o.w;
        const v = o.y == null ? 0.055 : o.y;
        const a = out(u0, v, w, 0.055, '<b style="font-size:__S__px">' + esc(title) + '</b>', o.size || 26);
        a.html = a.html.replace('__S__', String(a.size));
        const list = [a];
        if (meta) list.push(out(u0, v + 0.058, w, 0.03, '<span style="opacity:.75">' + esc(meta) + '</span>', 12));
        return list;
      },
      // 空格区（可打字的提示区）：ph 是灰字占位
      zone(u, v, w, h, ph, o) {
        o = o || {};
        const html = ph ? '<span style="opacity:.45">' + esc(ph) + '</span>' : '';
        const it = out(u, v, w, h, html, o.size || 14);
        it.zone = 1;
        return [it];
      },
      // 表格：rows × cols，opt.head 是表头数组，opt.h 是高度比例
      table(rows, cols, opt) {
        opt = opt || {};
        const u = opt.x == null ? 0.08 : opt.x, w = opt.w == null ? 0.84 : opt.w;
        const v = opt.y == null ? 0.16 : opt.y, h = opt.h == null ? 0.5 : opt.h;
        const head = Array.isArray(opt.head) ? opt.head : null;
        let html = '<table style="' + TBL + '">';
        if (head) html += '<tr>' + head.map((x) => '<th style="' + TH + '">' + esc(x) + '</th>').join('') + '</tr>';
        const bodyRows = Math.max(0, rows - (head ? 1 : 0));
        for (let r = 0; r < bodyRows; r++) {
          html += '<tr>' + Array.from({ length: cols }, (_, c) => '<td style="' + TD + ';height:' + (opt.cellH || 30) + 'px">' +
            (opt.c0 && c === 0 ? esc(String(opt.c0).replace('{i}', r + 1)) : '&nbsp;') + '</td>').join('') + '</tr>';
        }
        html += '</table>';
        return [out(u, v, w, h, html, opt.size || 13)];
      },
      // 等宽格子（便签位/画格），cols×rows，cellH 只是提示（高度比例优先）
      grid(cols, rows, opt) {
        opt = opt || {};
        const u = opt.x == null ? 0.08 : opt.x, w = opt.w == null ? 0.84 : opt.w;
        const v = opt.y == null ? 0.16 : opt.y, h = opt.h == null ? 0.6 : opt.h;
        let html = '<table style="' + TBL + '">';
        for (let r = 0; r < rows; r++) html += '<tr>' + Array.from({ length: cols }, () => '<td style="' + TD + ';height:' + (opt.cellH || 60) + 'px">&nbsp;</td>').join('') + '</tr>';
        html += '</table>';
        return [out(u, v, w, h, html, opt.size || 13)];
      },
      // 清单：☐ 条目（打印/手写都能用；点开文字可改）
      checklist(items, opt) {
        opt = opt || {};
        const u = opt.x == null ? 0.08 : opt.x, w = opt.w == null ? 0.84 : opt.w;
        const v = opt.y == null ? 0.14 : opt.y, gap = opt.gap == null ? 0.042 : opt.gap;
        return (items || []).slice(0, 10).map((t, i) => out(u, v + gap * i, w, gap * 0.8,
          '<span style="opacity:.55">☐</span>&nbsp;&nbsp;' + esc(t), opt.size || 15));
      },
      // 时间轴：days 天 × hours 行（左列时间，右列空白）
      timeline(days, hours, opt) {
        opt = opt || {};
        const u = opt.x == null ? 0.08 : opt.x, w = opt.w == null ? 0.84 : opt.w;
        const v = opt.y == null ? 0.14 : opt.y, h = opt.h == null ? 0.72 : opt.h;
        let html = '<table style="' + TBL + '">';
        html += '<tr><th style="' + TH + '">时间</th>' + Array.from({ length: days }, (_, i) => '<th style="' + TH + '">' + (opt.dayLabel ? esc(opt.dayLabel(i)) : '第 ' + (i + 1) + ' 天') + '</th>').join('') + '</tr>';
        for (let r = 0; r < hours; r++) {
          html += '<tr><td style="' + TD + ';text-align:center;opacity:.7">' + String(opt.from == null ? 8 : opt.from + r).padStart(2, '0') + ':00</td>' +
            Array.from({ length: days }, () => '<td style="' + TD + '">&nbsp;</td>').join('') + '</tr>';
        }
        html += '</table>';
        return [out(u, v, w, h, html, 12)];
      },
      // 韦恩图：n 个圈（用 SVG 画，随对象缩放不变形）
      venn(n, opt) {
        opt = opt || {};
        const u = opt.x == null ? 0.2 : opt.x, w = opt.w == null ? 0.6 : opt.w;
        const v = opt.y == null ? 0.12 : opt.y, h = opt.h == null ? 0.4 : opt.h;
        const R = n === 3 ? 30 : 34, pos = n === 3
          ? [[50, 34], [34, 58], [66, 58]]
          : [[36, 50], [64, 50]];
        const circles = pos.slice(0, n).map(([cx, cy]) =>
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="rgba(15,157,138,.07)" stroke="rgba(60,72,88,.5)" stroke-width="1"/>').join('');
        const svg = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%">' + circles + '</svg>';
        return [out(u, v, w, h, svg, 12)];
      },
      // 四象限：labels 四个（左上/右上/左下/右下）
      quadrants(labels, opt) {
        opt = opt || {};
        const u = opt.x == null ? 0.08 : opt.x, w = opt.w == null ? 0.84 : opt.w;
        const v = opt.y == null ? 0.14 : opt.y, h = opt.h == null ? 0.7 : opt.h;
        const L = labels || ['', '', '', ''];
        let html = '<table style="' + TBL + ';height:100%">';
        for (let r = 0; r < 2; r++) {
          html += '<tr>' + [0, 1].map((c) => '<td style="' + TD + ';height:' + (opt.cellH || 120) + 'px;vertical-align:top">' +
            '<b style="opacity:.7">' + esc(L[r * 2 + c] || '') + '</b></td>').join('') + '</tr>';
        }
        html += '</table>';
        return [out(u, v, w, h, html, 13)];
      },
      // 流程：steps 个框，竖向排列（箭头用 ↓ 文字，不依赖图形）
      flow(steps, opt) {
        opt = opt || {};
        const u = opt.x == null ? 0.2 : opt.x, w = opt.w == null ? 0.6 : opt.w;
        const v = opt.y == null ? 0.1 : opt.y, gap = opt.gap == null ? 0.115 : opt.gap;
        const list = [];
        (steps || []).slice(0, 6).forEach((s, i) => {
          list.push(out(u, v + gap * i, w, gap * 0.62,
            '<div style="border:1px solid rgba(60,72,88,.45);border-radius:10px;padding:8px 10px;height:100%;box-sizing:border-box">' + esc(s) + '</div>', 14));
          if (i < Math.min(6, steps.length) - 1) list.push(out(u + w / 2 - 0.02, v + gap * i + gap * 0.64, 0.04, gap * 0.28,
            '<div style="text-align:center;opacity:.5">↓</div>', 14));
        });
        return list.slice(0, 12);
      },
      // 键值对：左边标签、右边空白（规格表/资料卡）
      kvList(pairs, opt) {
        opt = opt || {};
        const u = opt.x == null ? 0.08 : opt.x, w = opt.w == null ? 0.84 : opt.w;
        const v = opt.y == null ? 0.14 : opt.y, gap = opt.gap == null ? 0.045 : opt.gap;
        let html = '<table style="' + TBL + '">';
        (pairs || []).slice(0, 10).forEach((p) => {
          html += '<tr><th style="' + TH + ';width:28%;text-align:left">' + esc(p[0]) + '</th><td style="' + TD + '">&nbsp;</td></tr>';
        });
        html += '</table>';
        return [out(u, v, w, Math.min(0.8, gap * (pairs || []).length + 0.04), html, 13)];
      },
      // 单行文字块（说明/提示）
      note(text, u, v, w, o) {
        o = o || {};
        return [out(u == null ? 0.08 : u, v == null ? 0.92 : v, w == null ? 0.84 : w, o.h || 0.03,
          '<span style="opacity:.6">' + esc(text) + '</span>', o.size || 12)];
      },
      // 兼容 spec 里的旧写法：bare out()（比例 → 居中坐标的对象）
      out,
    };
    return K;
  }

  GW.TPL_KIT = { of, TBL, TD, TH };
})();
