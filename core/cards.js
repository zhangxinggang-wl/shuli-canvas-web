/* 数理无限画布 · 记忆卡（1.6.7 / T19）
 *
 * 借 Notability 的「flashcard + 间隔重复」思路，但刻意只做最薄的一层：
 *   - 卡是纯数据（正面 / 背面 / 盒子 / 到期时间），存在 GW.settings.cards 里，
 *     .gewu 的格式一个字都不用改（设置本来就会跟着 board 一起存）。
 *   - 复习节奏用「盒子阶梯」而不是完整 SM-2：老师课堂上要的是「今天该看哪几张」，
 *     不是 E-Factor 的浮点精度。六个盒子 = 10 分钟 / 1 天 / 3 天 / 7 天 / 16 天 / 35 天。
 *   - 所有函数都是纯的（除了读写 GW.settings），便于 Node 侧自检与探针断言。
 *
 * 为什么不做「卡片对象」：画布上已经有文本 / 评论钉，卡片再占一种对象会让
 * 命中测试、导出、缩略图全都要多一条分支；而复习本来就该离开画布界面。
 */
(function () {
  'use strict';
  const GW = window.GW || (window.GW = {});

  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  // 盒子 → 下次复习间隔。0 号盒是「刚忘了」，10 分钟后再来一次。
  const LADDER = [10 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY];
  const MAX_BOX = LADDER.length - 1;

  function list() {
    const a = (GW.settings && GW.settings.cards) || [];
    return Array.isArray(a) ? a : [];
  }
  function save(arr) {
    if (!GW.settings) return;
    GW.settings.cards = arr;
    if (GW.saveSettings) GW.saveSettings();
  }
  function norm(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }
  function add(front, back, extra) {
    const f = norm(front);
    if (!f) return null;
    const c = Object.assign({
      id: 'c' + (GW.uid ? GW.uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      front: f,
      back: norm(back),
      box: 0,
      due: Date.now(),
      reps: 0,
      lapses: 0,
      at: Date.now()
    }, extra || {});
    const a = list().concat([c]);
    save(a);
    return c;
  }
  function remove(id) {
    const a = list();
    const i = a.findIndex((c) => c.id === id);
    if (i < 0) return false;
    a.splice(i, 1);
    save(a);
    return true;
  }
  function clear() { save([]); }

  /** 到期队列：due <= now 的卡，按 due 升序。limit 默认 200，避免一次推几千张。 */
  function due(now, limit) {
    const t = now == null ? Date.now() : now;
    const out = list().filter((c) => c && (c.due || 0) <= t);
    out.sort((a, b) => (a.due || 0) - (b.due || 0));
    return out.slice(0, limit || 200);
  }

  /** 打分：'again' | 'hard' | 'good' | 'easy'。就地改这张卡并返回它。 */
  function grade(id, g, now) {
    const t = now == null ? Date.now() : now;
    const a = list();
    const c = a.find((x) => x && x.id === id);
    if (!c) return null;
    c.reps = (c.reps || 0) + 1;
    if (g === 'again') {
      c.box = 0;
      c.lapses = (c.lapses || 0) + 1;
    } else if (g === 'hard') {
      c.box = Math.max(1, Math.min(MAX_BOX, (c.box || 0)));
      // 难：留在本盒，但间隔取本盒的下限（不改盒子，只把到期时间往后挪一档的一半）
      c.due = t + Math.round(LADDER[c.box] * 0.5);
      c.lastAt = t;
      save(a);
      return c;
    } else if (g === 'easy') {
      c.box = Math.min(MAX_BOX, (c.box || 0) + 2);
    } else {
      c.box = Math.min(MAX_BOX, (c.box || 0) + 1);
    }
    c.due = t + LADDER[c.box];
    c.lastAt = t;
    save(a);
    return c;
  }

  function stats(now) {
    const t = now == null ? Date.now() : now;
    const a = list();
    const d = due(t, 1e9).length;
    return {
      total: a.length,
      due: d,
      fresh: a.filter((c) => !c.reps).length,
      learned: a.filter((c) => (c.box || 0) >= MAX_BOX).length,
      next: a.length ? Math.min.apply(null, a.map((c) => c.due || 0)) : 0
    };
  }

  GW.cards = { LADDER, MAX_BOX, MIN, DAY, list, save, add, remove, clear, due, grade, stats, norm };
})();
