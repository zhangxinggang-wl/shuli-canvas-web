/* 数理无限画布 · PPT 动画效果登记表（R4）
   ------------------------------------------------------------------
   改前：src/core/pptx.js 的 timing() 把所有 animEffect 一律当成「淡入/淡出」，
   老师课上最常用的飞入、擦除、百叶窗、缩放、轮子全被压成淡入淡出（导入时只会
   给一句「部分特效以淡入淡出呈现」）。根因是它只认 filter 是不是 'fade'，
   既没读 filter 的方向参数，也没读 cTn 上的 presetID / presetClass / presetSubtype。

   这里把两套词表都翻译成画布能画的六个原语：
     fade  透明度       fly   整块位移（可带方向、可斜向）
     wipe  单向擦除     split 两侧对开     blinds 条纹     zoom 从中心放大
   解析不到的一律退回 fade —— 与改前行为完全一致，只会更准，不会更差。

   preset 三元组的判据逐条对照希沃 EasiNote 的
   EasiNote.OfficeDocumentConverter/Cvte/PptxToEnbx/Converters/AnimationConverter/
   *_AnimationSaveInfoConverter.cs（Fly/Zoom/BasicScale/Blinds/Split/Wheel/
   Bounce/Pulse/TranslateFade/Fade/AppearAndDisappear 共 11 个），
   连它们「把轮子降级成斜向擦除」「把出现降级成淡入」的取舍也照抄 ——
   因为画布上能稳定画出来的就是这几样，多认反而更不像。
   ------------------------------------------------------------------ */
(function () {
  'use strict';
  const GW = window.GW;

  // 方向统一成 4 个正方向 + 4 个角（字母序：竖直在前、水平在后，如 'tl' = 左上）
  function dirOf(text) {
    const t = String(text || '').toLowerCase();
    if (!t) return '';
    const v = /top|up/.test(t), b = /bottom|down/.test(t), l = /left/.test(t), r = /right/.test(t);
    const vert = v ? 't' : b ? 'b' : '';
    const horz = l ? 'l' : r ? 'r' : '';
    return vert + horz;
  }

  // PowerPoint 的 filter 词表：slide(...) / wipe(...) / blinds(...) / split(...) / ...
  function byFilter(filter) {
    const raw = String(filter || '').trim();
    if (!raw) return null;
    const m = /^([a-z]+)\s*(?:\(([^)]*)\))?$/i.exec(raw);
    if (!m) return null;
    const name = m[1].toLowerCase(), arg = (m[2] || '').toLowerCase();
    const dir = dirOf(arg);
    if (name === 'fade' || name === 'dissolve' || name === 'checkerboard') return { fx: 'fade', dir: '' };
    if (name === 'slide') return { fx: 'fly', dir: dir || 'b' };
    if (name === 'stretch') return { fx: 'zoom', dir: dir };
    if (name === 'zoom') return { fx: 'zoom', dir: dir };
    if (name === 'blinds') return { fx: 'blinds', dir: /vert/.test(arg) ? 't' : 'l' };
    if (name === 'split') return { fx: 'split', dir: dir || 'l' };
    if (name === 'wipe') return { fx: 'wipe', dir: dir || 'l' };
    if (name === 'barn' || name === 'randombar' || name === 'strips') return { fx: 'blinds', dir: /vert|up|down/.test(arg) ? 't' : 'l' };
    if (name === 'wheel' || name === 'circle' || name === 'diamond' || name === 'plus' || name === 'box' || name === 'wedge') {
      // 希沃把轮子降级成斜向擦除，这里同样降级成擦除（画布上没有便宜的分瓣遮罩）
      return { fx: 'wipe', dir: /out/.test(arg) ? 'r' : 'l' };
    }
    return null;
  }

  // PresetId 判据（与希沃 *AnimationSaveInfoConverter.cs 一一对应）
  // 希沃 GetFlyOrientation 的两张表（FlyAnimationSaveInfoConverter.cs:64-111），记的是**运动方向**：
  //   进入：8→LeftToRight  1→TopToBottom  2→RightToLeft  4→BottomToTop
  //         9→LeftTopToRightBottom  3→RightTopToLeftBottom  6→RightBottomToLeftTop  12→LeftBottomToRightTop
  //   退出：8→RightToLeft  1→BottomToTop  2→LeftToRight  4→TopToBottom
  //         9→RightBottomToLeftTop  3→LeftBottomToRightTop  6→LeftTopToRightBottom  12→RightTopToLeftBottom
  // 画布要的是「藏身的那一侧」：进入 = 运动方向的**起点**、退出 = 运动方向的**终点**。
  // 所以进入取方向串首、退出取方向串尾（对角方向就是两个字母：'tl' = 左上）。
  const FLY_IN = { 8: 'l', 1: 't', 2: 'r', 4: 'b', 9: 'tl', 3: 'tr', 6: 'br', 12: 'lb' };
  const FLY_OUT = { 8: 'l', 1: 't', 2: 'r', 4: 'b', 9: 'tl', 3: 'tr', 6: 'br', 12: 'lb' };

  function byPreset(p) {
    const id = +String(p.id || '');
    const cls = String(p.cls || '').toLowerCase();   // entr / exit / emph / path
    if (!id) return null;
    const out = cls === 'exit';
    if (id === 1) return { fx: 'fade', dir: '' };                      // 出现 / 消失
    // 飞入 / 飞出：direction 表两边同形（进入看起点、退出看终点），缺省 BottomToTop
    if (id === 2) return { fx: 'fly', dir: (out ? FLY_OUT : FLY_IN)[+String(p.sub || '')] || 'b' };
    if (id === 3) return { fx: 'blinds', dir: 't' };                  // 百叶窗
    if (id === 6) return { fx: 'zoom', dir: '' };                     // 强调·缩放
    if (id === 10) return { fx: 'fade', dir: '' };                    // 淡入淡出
    if (id === 16) {                                                  // 劈裂
      const d = { 26: 't', 21: 'l', 42: 'b', 37: 'r' }[+String(p.sub || '')] || 't';
      return { fx: 'split', dir: d };
    }
    if (id === 21) {                                                  // 轮子（希沃按斜向擦除呈现）
      const d = { 1: 't', 2: 't', 3: 't', 4: 't', 8: 't' }[+String(p.sub || '')] || 't';
      return { fx: 'wipe', dir: d };
    }
    if (id === 23) return { fx: 'zoom', dir: '' };                    // 基本缩放
    if (id === 26) return cls === 'emph' ? null : { fx: 'fly', dir: 'b' }; // 弹跳（强调·脉冲走原 animScale 通路）
    if (id === 42) return { fx: 'fly', dir: out ? 't' : 'b' };        // 翻转式淡入淡出
    if (id === 47) return { fx: 'fly', dir: out ? 'b' : 't' };
    return null;
  }

  /* PPT-04：尺寸/位置动画（p:anim 里 ppt_x / ppt_y / ppt_w / ppt_h 的关键帧表达式）。
   *
   * 真实样本（23 页/10 页两份课件）里是这样的一串：
   *   ppt_w: #ppt_w/10 → #ppt_w+.01 → #ppt_w   （先缩到十分之一再回原尺寸，是「强调·脉冲」）
   *   ppt_x: #ppt_x  ...                       （位置同理）
   * 改前 timing() 把 animEffect 之外的 p:anim 整类丢掉，老师看到的就是「动画没了」。
   *
   * 这里只实现一份**白名单数值表达式**解释器：数字、#ppt_* 基准属性、+ - * /、括号。
   * 不用 eval / new Function，也不再支持任何函数调用或标识符 —— 表达式来自课件文件，
   * 是外部输入，能求值任意表达式的实现等于给课件执行代码的口子。
   * 解析不了就抛，由调用方（timing）退回「不还原这个动画」并把原因写进告警。
   */
  const BASE = { 'ppt_x': 0, 'ppt_y': 0, 'ppt_w': 1, 'ppt_h': 1 };
  function evalExpr(text, base) {
    const src = String(text == null ? '' : text).replace(/\s+/g, '');
    if (!src) throw new Error('空表达式');
    if (src.length > 160) throw new Error('表达式过长');
    let i = 0;
    const num = () => {
      const m = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
      if (m) { i += m[0].length; return parseFloat(m[0]); }
      if (src[i] === '#') {
        const m2 = /^#([A-Za-z_][A-Za-z0-9_]*)/.exec(src.slice(i));
        if (!m2) throw new Error('未知的基准属性');
        if (!(m2[1] in BASE)) throw new Error('不支持的基准属性 #' + m2[1]);
        i += m2[0].length;
        const b = base || {};
        return typeof b[m2[1]] === 'number' ? b[m2[1]] : BASE[m2[1]];
      }
      throw new Error('不支持的记号：' + src.slice(i, i + 12));
    };
    const atom = () => {
      if (src[i] === '(') {
        i++;
        const v = expr();
        if (src[i] !== ')') throw new Error('缺少右括号');
        i++;
        return v;
      }
      return num();
    };
    const term = () => {
      let v = atom();
      for (;;) {
        const c = src[i];
        if (c === '*' || c === '/') {
          i++;
          const r = atom();
          if (c === '/' && r === 0) throw new Error('除以零');
          v = c === '*' ? v * r : v / r;
        } else return v;
      }
    };
    function expr() {
      let v = term();
      for (;;) {
        const c = src[i];
        if (c === '+' || c === '-') { i++; const r = term(); v = c === '+' ? v + r : v - r; }
        else return v;
      }
    }
    const out = expr();
    if (i !== src.length) throw new Error('多余的记号：' + src.slice(i, i + 12));
    if (!Number.isFinite(out)) throw new Error('结果不是有限数');
    return out;
  }
  // 关键帧：value 是数值，pct 是「这一步的百分之几」（PPT 的 tm 是百分比）
  function keyframes(list, base) {
    const out = [];
    for (const kv of list || []) {
      const pct = Math.max(0, Math.min(100, +((kv && kv.pct) || 0)));
      out.push({ pct: pct, v: evalExpr(kv && kv.value, base) });
    }
    if (!out.length) return out;
    out.sort((a, b) => a.pct - b.pct);
    if (out[0].pct > 0) out.unshift({ pct: 0, v: out[0].v });
    return out;
  }
  // 在 pct 处线性插值；超出首帧/末帧就取端点值（PPT 的 held keyframe）
  function sample(frames, pct) {
    if (!frames || !frames.length) return NaN;
    const p = Math.max(0, Math.min(100, +pct || 0));
    if (p <= frames[0].pct) return frames[0].v;
    for (let i = 1; i < frames.length; i++) {
      if (p <= frames[i].pct) {
        const a = frames[i - 1], b = frames[i];
        const k = b.pct === a.pct ? 1 : (p - a.pct) / (b.pct - a.pct);
        return a.v + (b.v - a.v) * k;
      }
    }
    return frames[frames.length - 1].v;
  }

  // 统一入口：filter 优先（信息最全），没有 filter 再退回三元组，最后兜底淡入
  function classify(input) {
    const o = input || {};
    const hit = byFilter(o.filter) || byPreset(o.preset || {});
    if (hit) return { fx: hit.fx, dir: hit.dir || '', lossy: false };
    return { fx: 'fade', dir: '', lossy: !!(o.filter && o.filter !== 'fade') };
  }

  GW.pptxFx = { classify: classify, filter: byFilter, preset: byPreset, dirOf: dirOf,
    expr: { eval: evalExpr, keyframes: keyframes, sample: sample, BASE: BASE } };
})();
