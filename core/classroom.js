/* 课堂增强（1.1.15）：采纳 ClassIn 五条建议里的 R1 回放 / R3 答题器 / R4 一节课容器。
 *
 * 为什么这么做（和 ClassIn 对齐的地方）：
 *   R1 回放 —— 录的是 op 事件流（GW.commit / GW.applyRemote 的增量）+ 起始页面快照，
 *     不录屏：一节课几百笔只有几十 KB，能跳、能倍速，也不会因为分辨率变化糊掉。
 *   R3 答题器 —— 题目做成轻消息走协同的 live 通道（丢了不致命），两端同时出现作答条，
 *     分布用 DOM 条形图就地画，不往板书上插东西（老师下课不会留一堆垃圾对象）。
 *   R4 一节课 —— 课程标题/目标写进 .gewu 的 lesson 段（纯附加字段，旧版本读到会忽略）。
 *   R2 角色授权 / R5 分组讨论在 main/lansync.js（服务端丢弃越权写）与 lansync.js（面板）里，
 *   本文件的 lesson/replay 会跟着 .gewu 一起走，所以回放能跨机复现。
 */
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW || !GW.h) return;
  const h = GW.h;
  const CR = { rec: null, lesson: null, playing: 0, q: null, saved: null, bar: null, results: [] };
  const MAX_OPS = 4000;

  const clone = (o) => { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } };
  const room = () => (GW.lansync && GW.lansync.isHost && GW.lansync.isHost());

  // ---------- R1：记录 ----------
  function pageJSON() {
    const d = GW.doc;
    return {
      cur: d.cur,
      pages: d.pages.map((p) => ({
        id: p.id, name: p.name, bg: clone(p.bg), view: clone(p.view),
        ink: p.ink.map(GW.strip), objs: p.objs.map(GW.strip),
      })),
    };
  }
  function push(ev) {
    if (!CR.rec || CR.playing) return;
    CR.rec.ops.push(ev);
    if (CR.rec.ops.length > MAX_OPS) CR.rec.ops.shift();   // 只保最近一节课的量，别把内存吃穿
  }
  function hook() {
    if (GW.__crHooked) return;
    GW.__crHooked = true;
    // 1.1.18（R1）：克隆必须发生在**原函数跑完之后**。
    //   board.js 的 commit 第一行才是 `op.pageId = op.pageId || GW.page().id;` ——
    //   以前包装器在调用原函数之前克隆，录下来的每一条 op 都没有 pageId，回放时
    //   `findPage(undefined)` 判空后逐条 `return false` 丢掉，于是「录了但画布不动」。
    const c0 = GW.commit;
    GW.commit = function (op, opts) {
      const r = c0.apply(this, arguments);
      if (CR.rec && !CR.playing && op) {
        const c = clone(op);
        if (c) push({ t: Date.now() - CR.rec.t0, op: c });
      }
      return r;
    };
    const a0 = GW.applyRemote;
    GW.applyRemote = function (op) {
      const r = a0.apply(this, arguments);
      if (CR.rec && !CR.playing && op) {
        const c = clone(op);
        if (c) push({ t: Date.now() - CR.rec.t0, op: c });
      }
      return r;
    };
    // 撤销/重做也要进录像：它们不走 commit / applyRemote，不记的话回放只会「一直加」，
    // 和老师当时看到的不一样（录 3 笔再撤 1 笔，回放必须是 2 笔）。
    const u0 = GW.undo, r0 = GW.redo;
    GW.undo = function () {
      const can = !GW.canUndo || GW.canUndo();
      const r = u0.apply(this, arguments);
      if (can && CR.rec && !CR.playing) push({ t: Date.now() - CR.rec.t0, undo: 1 });
      return r;
    };
    GW.redo = function () {
      const can = !GW.canRedo || GW.canRedo();
      const r = r0.apply(this, arguments);
      if (can && CR.rec && !CR.playing) push({ t: Date.now() - CR.rec.t0, redo: 1 });
      return r;
    };
    GW.bus.on('page', () => { if (CR.rec && !CR.playing) push({ t: Date.now() - CR.rec.t0, page: GW.doc.cur }); });
  }

  function recStart() {
    hook();
    CR.rec = { t0: Date.now(), base: pageJSON(), ops: [] };
    GW.toast('开始记录这节课');
    return CR.rec;
  }
  function recStop() {
    if (!CR.rec) return null;
    const r = CR.rec;
    CR.rec = null;
    GW.toast('已记录 ' + r.ops.length + ' 步（约 ' + Math.round((Date.now() - r.t0) / 1000) + ' 秒）');
    return r;
  }

  // 1.1.18（R2）：回放会 `GW.loadDoc(…)` 把整份板书换成录制那一份，
  //   而 `storage.js:219` 的 `doc.path = path || null` 会把「当前文件名」清成「未命名板书」。
  //   所以开播前存一份快照，停播/放完都还原 —— 老师只是想看一眼，不是想把板书换掉。
  let back = null;
  function snapshot() {
    try { back = { json: GW.serialize(), path: GW.doc.path || '', dirty: GW.doc.dirty }; }
    catch (e) { back = null; }
    return !!back;
  }
  function restore() {
    if (!back) return false;
    const b = back;
    back = null;                       // 先清再还原：连点两次「停止」也只还原一次
    const was = CR.playing;
    CR.playing = -1;                   // -1 是真值：还原时 loadDoc→gotoPage 的翻页事件不许被录进录像
    try {
      GW.loadDoc(b.json, b.path || null, { replay: true });
      GW.doc.dirty = b.dirty;
      if (b.dirty) GW.bus.emit('dirty');
    } catch (e) { /* 快照坏了就算了，别让界面卡死 */ }
    CR.playing = was === -1 ? 0 : was;
    return true;
  }

  // 回放：先把画面恢复到录制开始的那一刻，再按时间重放。
  // 资产（图片字节）不重复存一份，用当前文档里的 —— 同一个 .gewu 打开就能放。
  function play(rec, speed) {
    if (TCH.phase === 'live') return GW.toast('请先结束授课，再看回放');
    const r = rec || CR.saved;
    if (!r || !r.ops || !r.ops.length) return GW.toast('还没有可回放的记录');
    if (CR.playing) stopPlay();
    const k = speed || 1;
    const d = GW.doc;
    if (!snapshot()) return GW.toast('回放失败：无法保留当前板书');
    const evs = r.ops.slice();
    const t0 = Date.now();
    // 1.1.18（R3）：playing 必须先于 loadDoc 落地。loadDoc→gotoPage 会 emit('page')，
    //   而翻页监听只判 `CR.rec && !CR.playing` —— 晚一步就会把回放自己的翻页录进这一节。
    CR.playing = t0;
    try {
      GW.loadDoc({
        app: 'gewu-board', version: 1, cur: r.base.cur, pages: r.base.pages,
        assets: Object.fromEntries(Object.entries(d.assets).map(([id, a]) => [id, { mime: a.mime, name: a.name, data: a.data }])),
      }, null, { replay: true });
    } catch (e) {
      CR.playing = 0;
      restore();
      return GW.toast('回放失败：录制数据不完整');
    }
    let i = 0;
    const step = () => {
      if (CR.playing !== t0) return;
      const now = (Date.now() - t0) * k;
      let acted = false;
      while (i < evs.length && evs[i].t <= now) {
        const e = evs[i++];
        try {
          if (e.page != null) GW.gotoPage(e.page);
          else if (e.op) GW.applyRemote(e.op);
          else if (e.undo) GW.undo();
          else if (e.redo) GW.redo();
        } catch (err) { /* 单步坏了继续放，别让整节课卡住 */ }
        acted = true;
      }
      if (acted) GW.requestRender && GW.requestRender();
      if (i >= evs.length) { CR.playing = 0; restore(); GW.toast('回放结束，已恢复你的板书'); return; }
      setTimeout(step, 16);
    };
    step();
    GW.toast('回放中（' + (k > 1 ? k + ' 倍速）' : '1 倍速）'));
    return true;
  }
  function stopPlay() {
    const was = CR.playing;
    CR.playing = 0;
    if (was) { restore(); GW.toast('已停止回放，已恢复你的板书'); }
  }

  // ---------- R3：答题器（1.5.3 · 票按「已配对客户端」计） ----------
  // 统计口径先说清：**每台连上来的客户端一张有效票**（老师本机记作 'host'），
  // 不是学生人数、也不是到课人数。服务端给每条票盖 `from`（连接 id），这里按 from 覆写旧票 ——
  // 同一条重复到达不重复计数，改选覆盖旧票。没开协同时退回「本机点一次算一票」的练习模式。
  function myId() {
    if (room()) return 'host';
    const LS = GW.lansync && GW.lansync._state;
    return (LS && LS.cid) || 'me';
  }
  function recount(q) {
    const c = new Array(q.n).fill(0);
    Object.keys(q.votes || {}).forEach((k) => {
      const i = q.votes[k] | 0;
      if (i >= 0 && i < q.n) c[i]++;
    });
    q.counts = c;
  }
  const voteTotal = (q) => (q.counts || []).reduce((a, b) => a + b, 0);
  function touchDoc() {
    try { if (GW.doc) { GW.doc.dirty = true; GW.bus.emit('dirty'); } } catch (e) { /* 没文档就算了 */ }
  }
  function paintBar() {
    const q = CR.q;
    if (CR.bar) { CR.bar.remove(); CR.bar = null; }
    if (!q) return;
    const row = h('div', { class: 'cr-q-row' });
    const total = voteTotal(q);
    for (let i = 0; i < q.n; i++) {
      const pct = total ? Math.round((q.counts[i] / total) * 100) : 0;
      const b = h('button', {
        class: 'cr-q-opt' + (q.mine === i ? ' on' : ''),
        onclick: () => {
          if (q.ended) return;
          if (q.mine === i) return;
          q.mine = i;
          if (GW.netLive) {
            // 票带着「我是谁」上行；服务端盖章后再广播。自己先记一份，回声不会回到自己。
            q.votes[myId()] = i;
            recount(q);
            net({ k: 'a', id: q.id, i });
          } else {
            if (q.mine >= 0 && q.counts[q.mine] > 0) q.counts[q.mine]--;
            q.counts[i] = (q.counts[i] || 0) + 1;
          }
          paintBar();
        },
      }, h('b', {}, 'ABCDEF'[i]), h('span', { class: 'cr-q-n' }, q.counts[i] ? String(q.counts[i]) : ''),
        h('i', { class: 'cr-q-bar', style: 'width:' + pct + '%' }));
      row.appendChild(b);
    }
    const txt = h('div', { class: 'cr-q-text' }, (q.text ? q.text + '\u3000' : '') + (q.ended ? '投票已结束 · 共 ' + total + ' 票' : '举手作答 · 已收 ' + total + ' 票'));
    const bar = h('div', { class: 'cr-q' }, txt, row);
    if (q.host && !q.ended) {
      bar.appendChild(h('button', {
        class: 'cr-q-end',
        onclick: () => endQuiz(),
      }, '结束投票'));
    }
    document.body.appendChild(bar);
    CR.bar = bar;
  }
  function net(m) {
    if (!GW.netLive) return;
    try { GW.netLive(m.k === 'a' ? 'qz' : 'q', m); } catch (e) { /* 没开协同就当本机练习 */ }
  }
  function startQuiz(text, n) {
    const q = {
      id: GW.uid(), n: n, votes: {}, counts: new Array(n).fill(0), mine: -1,
      host: room(), text: text || '', ended: false, t0: Date.now(), recorded: false,
    };
    CR.q = q;
    paintBar();
    net({ k: 'q', id: q.id, n: q.n, text: q.text });
    return q;
  }
  // 结束是幂等的：重复点、回声、重连都只会留下一份记录（按 quizId 去重）。
  function endQuiz() {
    const q = CR.q;
    if (!q) return null;
    if (q.ended) {
      if (q.host && !q.recorded) recordQuiz(q);
      return q.record || null;
    }
    q.ended = true;
    q.endedAt = Date.now();
    recount(q);
    net({ k: 'qe', id: q.id });
    const rec = q.host ? recordQuiz(q) : null;
    paintBar();
    setTimeout(() => { if (CR.q === q) { CR.q = null; paintBar(); } }, 8000);
    return rec;
  }
  // 归档：只存汇总、不可变；客户端票据不进文档。
  function recordQuiz(q) {
    if (!q || !q.host) return null;
    const old = CR.results.find((r) => r && r.quizId === q.id);
    if (old) { q.recorded = true; q.record = old; return old; }
    const rec = {
      quizId: q.id, text: String(q.text || '').slice(0, 500), n: q.n,
      labels: 'ABCDEF'.slice(0, q.n).split(''),
      counts: (q.counts || []).slice(), total: voteTotal(q),
      startedAt: q.t0 || null, endedAt: q.endedAt || Date.now(),
      unit: 'client',
    };
    CR.results.push(clone(rec));
    if (CR.results.length > 200) CR.results.shift();
    q.recorded = true;
    q.record = rec;
    touchDoc();
    return rec;
  }
  function onMsg(m) {
    if (!m) return;
    if (m.k === 'q') {
      if (CR.q && CR.q.id === m.id) return;      // 自己发起的那条回声
      const n = Math.max(2, Math.min(6, m.n | 0 || 4));
      CR.q = { id: m.id, n: n, votes: {}, counts: new Array(n).fill(0), mine: -1, host: false, text: m.text || '', ended: false, t0: Date.now() };
      paintBar();
      return;
    }
    if (m.k === 'qerr') {
      // 服务端没算这一票：说清是哪一种，不要静默。
      const why = m.reason === 'ended' ? '投票已结束，这一票没有计入'
        : m.reason === 'bad-option' ? '选项超出范围，这一票没有计入'
        : '投票状态已变化，这一票没有计入';
      if (GW.toast) GW.toast(why, 2600);
      return;
    }
    if (!CR.q || CR.q.id !== m.id) return;
    const q = CR.q;
    if (m.k === 'a') {
      if (q.ended) return;                       // 放学后的迟到票不算
      if (m.from) { q.votes[m.from] = m.i | 0; recount(q); }   // 同一端改选：覆盖旧票
      else q.counts[m.i | 0] = (q.counts[m.i | 0] || 0) + 1;   // 老版本没盖 from，退回累加（别 recount，会把它冲掉）
      paintBar();
      return;
    }
    if (m.k === 'qe') {
      if (!q.ended) { q.ended = true; q.endedAt = m.at || Date.now(); }
      if (q.host && !q.recorded) recordQuiz(q);
      paintBar();
      setTimeout(() => { if (CR.q === q) { CR.q = null; paintBar(); } }, 8000);
    }
  }
  // ---------- 答题记录（列表 / 插入板书 / CSV） ----------
  function fmtTime(ts) {
    const d = new Date(ts || Date.now());
    const p2 = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function escText(s0) {
    return String(s0 == null ? '' : s0).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  // CSV：逗号/引号/换行按 RFC4180 转义；= + - @ 开头加前置单引号，避免被表格软件当公式执行。
  function csvCell(v) {
    let s0 = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s0)) s0 = "'" + s0;
    if (/[",\n\r]/.test(s0)) s0 = '"' + s0.replace(/"/g, '""') + '"';
    return s0;
  }
  function csvText() {
    const rows = [['时间', '题干', '选项', '票数', '有效票合计', '统计口径']];
    for (const r of CR.results) {
      rows.push([fmtTime(r.startedAt), r.text || '（口头出题）', '', '', r.total, '每台已配对客户端 1 票']);
      for (let i = 0; i < r.n; i++) rows.push(['', '', r.labels[i], r.counts[i] || 0, '', '']);
    }
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }
  function stampNum() {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    return String(d.getFullYear()) + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes());
  }
  async function exportCSV() {
    if (!CR.results.length) return GW.toast('这节课还没有答题记录');
    const name = '课堂答题记录-' + stampNum() + '.csv';
    const text = '\ufeff' + csvText();      // 带 BOM，Excel 打开中文不乱码
    try {
      // 能力探测：桌面桥 / 安卓外壳 / 网页 shim 都有 saveDialog + writeFile 这一对
      // （桌面弹另存为、安卓写系统下载目录、网页触发下载），所以不判 GW.isElectron。
      const g = window.gewu;
      if (g && typeof g.saveDialog === 'function' && typeof g.writeFile === 'function') {
        const p = await g.saveDialog({
          title: '导出答题记录', defaultPath: name,
          filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
        });
        if (!p) return GW.toast('已取消导出');
        const saved = await g.writeFile(p, text, 'utf8');
        if (saved === false) throw new Error('文件未写入下载目录');
        return GW.toast((window.gewuNative ? '已保存到下载目录：' : '已导出：') + String(p).replace(/^.*[\\/]/, ''), 3200);
      }
      const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), download: name });
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      return GW.toast('已开始下载 CSV（下载完成才算存到磁盘）', 3200);
    } catch (e) {
      return GW.toast('导出失败：' + ((e && e.message) || e), 3200);
    }
  }
  function insertResult(r) {
    if (!r) return false;
    const lines = [(r.text ? r.text : '课堂答题') + '（' + fmtTime(r.startedAt) + '）'];
    for (let i = 0; i < r.n; i++) lines.push(r.labels[i] + ' · ' + (r.counts[i] || 0) + ' 票');
    lines.push('有效票合计 ' + r.total + '（每台已配对客户端 1 票，不是学生人数）');
    const size = 18;
    const w = Math.max(280, Math.min(760, size * 0.62 * Math.max.apply(null, lines.map((l) => l.length)) + 24));
    const obj = {
      kind: 'obj', type: 'text', x: 90, y: 90, w: w, h: size * 1.5 * lines.length + 12,
      data: { html: lines.map(escText).join('<br>'), size: size, color: '#1b2433' },
    };
    try {
      GW.addItems([obj]);
      GW.toast('已插入板书（Ctrl+Z 可撤销）');
      return true;
    } catch (e) {
      GW.toast('插入失败：' + ((e && e.message) || e));
      return false;
    }
  }
  function resultsDlg() {
    const body = h('div', { style: 'padding:4px 0;font-size:13px' });
    body.appendChild(h('p', { style: 'color:#5a6472;margin:0 0 8px' },
      '本课共 ' + CR.results.length + ' 条记录。票数按「每台已配对客户端 1 票」统计，不是学生人数；只保存汇总，不保存谁投了什么。'));
    if (!CR.results.length) body.appendChild(h('p', { style: 'color:#8a929e;margin:0' }, '这节课还没有答题记录。点「答题器」开一场，结束后自动归档。'));
    for (const r of CR.results) {
      const tags = r.labels.map((l, i) => l + ' ' + (r.counts[i] || 0)).join('\u3000');
      const ops = h('div', { style: 'display:flex;gap:6px;margin-top:4px' },
        h('button', { class: 'gw-btn', onclick: () => insertResult(r) }, '插入板书'),
        h('button', {
          class: 'gw-btn', onclick: async () => {
            const ok = await GW.confirm('删除这条答题记录？删了就找不回来了（板书内容不受影响）。');
            if (!ok) return;
            const i = CR.results.indexOf(r);
            if (i >= 0) CR.results.splice(i, 1);
            touchDoc();
            GW.toast('已删除这条记录');
            dlg.close();
            resultsDlg();
          },
        }, '删除'));
      body.appendChild(h('div', { style: 'border:1px solid #e3e7ee;border-radius:8px;padding:8px;margin-bottom:8px' },
        h('div', { style: 'font-weight:600' }, r.text || '（口头出题）'),
        h('div', { style: 'color:#5a6472;margin-top:2px' }, fmtTime(r.startedAt) + ' · 有效票 ' + r.total + ' · ' + tags),
        ops));
    }
    body.appendChild(h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px' },
      h('button', { class: 'gw-btn', onclick: () => exportCSV() }, '导出 CSV'),
      h('button', { class: 'gw-btn', onclick: () => dlg.close() }, '关闭')));
    const dlg = GW.dialog({ title: '本课答题记录', width: 560, noFooter: true, body });
    return dlg;
  }

  function quiz() {
    const body = h('div', { style: 'padding:4px 0;font-size:13px;line-height:1.8' });
    const text = h('input', { class: 'inp', placeholder: '题目（可留空，口头出题也行）', style: 'width:100%' });
    const sel = h('select', { class: 'inp', style: 'margin-top:8px;width:100%' },
      h('option', { value: '4' }, '四个选项（A/B/C/D）'),
      h('option', { value: '2' }, '两个选项（对/错 · A/B）'),
      h('option', { value: '3' }, '三个选项（A/B/C）'));
    const tip = h('p', { style: 'color:#5a6472;margin-top:8px' },
      CWNote());
    body.append(text, sel, tip);
    GW.dialog({
      title: '答题器', width: 480, body, ok: '开始投票', cancel: '关闭',
      onOk: () => { startQuiz(text.value.trim(), parseInt(sel.value, 10) || 4); return true; },
    });
  }
  function CWNote() {
    return room() ? '开始后两台设备都会出现作答条，票数实时汇总；结束投票后显示分布。'
      : '未连接平板时也能用（只是没有学生端可点）。';
  }

  // ---------- P6：一节课（课前准备 / 开始授课 / 结束归档） ----------
  // 运行状态只活在会话里（TCH）；写进文档的只有 CR.lesson.sessions 里那条简明课次记录
  // （开始/结束时间、起始页、本课答题记录 id、真正完成的输出清单；不塞 WebM/base64）。
  const TCH = { phase: 'idle', startedAt: 0, startPage: 0, skipped: [], items: [], recWant: false, closing: false, bar: null, timer: 0, off: null };

  function saveLine() {
    const st = GW.saveState ? GW.saveState() : null;
    if (!st) return '保存状态未知';
    if (st.file && st.file.busy) return '正在保存…';
    if (st.file && st.file.err) return '保存失败';
    const bk = st.lastBackup ? ('已备份 ' + fmtTime(st.lastBackup)) : '未备份';
    return (st.dirty ? '未存文件' : '已存文件') + ' · ' + bk;
  }
  function recLine() {
    const LR = GW.lessonRec;
    if (LR && LR.rec) return '录课中';
    if (LR && LR.last) return '录课已停';
    return '未录课';
  }
  function arcLine(it) {
    if (it.status === 'done') return '完成';
    if (it.status === 'failed') return '失败' + (it.detail ? '：' + it.detail : '');
    if (it.status === 'cancelled') return '已取消' + (it.detail ? '：' + it.detail : '');
    return '跳过' + (it.detail ? '：' + it.detail : '');
  }

  function hideTeachBar() {
    if (TCH.timer) { clearInterval(TCH.timer); TCH.timer = 0; }
    if (TCH.lvlTimer) { clearInterval(TCH.lvlTimer); TCH.lvlTimer = 0; }
    if (TCH.off) { try { TCH.off(); } catch (e) { /* noop */ } TCH.off = null; }
    if (TCH.dockObserver) { TCH.dockObserver.disconnect(); TCH.dockObserver = null; }
    if (TCH.bar) { try { TCH.bar.remove(); } catch (e) { /* noop */ } TCH.bar = null; }
  }
  function paintTeachBar() {
    if (!TCH.bar) return;
    const st = GW.saveState ? GW.saveState() : null;
    const nm = TCH.bar.querySelector('.tb-name');
    const sv = TCH.bar.querySelector('.tb-save');
    const rc = TCH.bar.querySelector('.tb-rec');
    const L = CR.lesson || {};
    if (nm) nm.textContent = (L.title ? ('授课中：' + L.title) : '授课中') + ' · 第 ' + (((GW.doc && GW.doc.cur) || 0) + 1) + ' 页';
    if (sv) {
      sv.textContent = saveLine();
      sv.classList.toggle('bad', !!(st && st.file && st.file.err));
    }
    if (rc) {
      rc.textContent = recLine();
      rc.classList.toggle('on', !!(GW.lessonRec && GW.lessonRec.rec));
    }
  }
  function showTeachBar() {
    hideTeachBar();
    const bar = h('div', { id: 'teach-bar', class: 'teach-bar' },
      h('span', { class: 'tb-name' }, '授课中'),
      h('span', { class: 'tb-save' }, ''),
      h('span', { class: 'tb-rec' }, ''),
      // 1.6.7：麦克风电平（只在录课时有读数）
      h('span', { class: 'tb-lvl', title: '麦克风电平' }, h('i', null)),
      h('button', { class: 'gw-btn tb-end', onclick: async () => {
        try { if ((await endTeach()).ok) archiveDlg(); }
        catch (e) { GW.toast('归档失败：' + ((e && e.message) || e)); }
      } }, '结束授课'));
    document.body.append(bar);
    TCH.bar = bar;
    const dock = document.getElementById('dock');
    if (dock) {
      const sizeDock = () => {
        bar.style.setProperty('--teach-dock-h', dock.offsetHeight + 'px');
        bar.style.setProperty('--teach-dock-w', dock.offsetWidth + 'px');
      };
      sizeDock();
      if (window.ResizeObserver) {
        TCH.dockObserver = new ResizeObserver(sizeDock);
        TCH.dockObserver.observe(dock);
      }
    }
    paintTeachBar();
    TCH.timer = setInterval(paintTeachBar, 1000);
    // 电平要 100ms 级才看得出「有没有声音」，用独立的小循环，别把 1 秒的整条刷新拖快
    TCH.lvlTimer = setInterval(() => {
      const i = bar.querySelector('.tb-lvl > i');
      if (!i) return;
      const on = !!(GW.lessonRec && GW.lessonRec.rec);
      const v = on && GW.lessonRec.level ? GW.lessonRec.level() : 0;
      i.style.width = Math.round(v * 100) + '%';
      bar.querySelector('.tb-lvl').classList.toggle('on', on);
      bar.querySelector('.tb-lvl').classList.toggle('hot', v > 0.92);
    }, 120);
    try { TCH.off = GW.bus.on('save-state', paintTeachBar); } catch (e) { TCH.off = null; }
  }

  async function startTeach(opt) {
    const o = opt || {};
    if (TCH.phase === 'live') return { ok: false, error: '已经在授课中' };
    if (TCH.closing) return { ok: false, error: '正在归档，稍等' };
    if (CR.playing) return { ok: false, error: '请先结束回放，再开始授课' };
    const pages = (GW.doc && GW.doc.pages) || [];
    const pi = Math.max(0, Math.min(Math.max(0, pages.length - 1), o.page != null ? (o.page | 0) : ((GW.doc && GW.doc.cur) || 0)));
    if (o.title != null && String(o.title).trim()) {
      CR.lesson = CR.lesson || {};
      CR.lesson.title = String(o.title).trim();
    }
    if (o.goal != null) { CR.lesson = CR.lesson || {}; CR.lesson.goal = String(o.goal).trim(); }
    TCH.phase = 'live'; TCH.startedAt = Date.now(); TCH.startPage = pi;
    TCH.skipped = Array.isArray(o.skipped) ? o.skipped.slice() : [];
    TCH.items = []; TCH.recWant = !!o.rec; TCH.closing = false;
    // 复审 #10：记下开课前那一刻的录制结果。下课时只有「跟这一份不同的新结果」才算本课的 ——
    // 上一节课失败留下的 LR.last 不能被标本课完成。
    TCH.recLast0 = (GW.lessonRec && GW.lessonRec.last) || null;
    CR.sessionStart = CR.results.length;
    try { if (pi !== ((GW.doc && GW.doc.cur) || 0)) GW.gotoPage(pi); } catch (e) { /* 单页文档照样上课 */ }
    if (o.markDirty !== false) { try { GW.doc.dirty = true; GW.bus.emit('dirty'); } catch (e) { /* noop */ } }
    if (o.rec && GW.lessonRec && GW.lessonRec.start) {
      try {
        const recording = await GW.lessonRec.start();
        if (GW.doc.pages !== pages && recording && GW.lessonRec.rec === recording) GW.lessonRec.stop();
      }
      catch (e) { if (GW.doc.pages === pages) TCH.skipped.push('录课：' + String((e && e.message) || e)); }
    }
    if (GW.doc.pages !== pages) return { ok: false, error: '板书已切换' };
    showTeachBar();
    return { ok: true, page: pi, startedAt: TCH.startedAt, skipped: TCH.skipped.slice() };
  }

  function waitRecStop(ms) {
    const LR = GW.lessonRec;
    if (!LR || !LR.rec) return Promise.resolve();
    return new Promise((res) => {
      const t0 = Date.now();
      const tick = () => {
        if (!LR.rec || Date.now() - t0 > (ms || 15000)) return res();
        setTimeout(tick, 120);
      };
      try { LR.stop(); } catch (e) { /* 已经停了 */ }
      tick();
    });
  }

  async function endTeach() {
    if (TCH.phase !== 'live') return { ok: false, error: '还没有开始授课' };
    if (TCH.closing) return { ok: false, error: '正在归档，稍等' };
    TCH.closing = true;
    const pages = GW.doc.pages;
    const items = [];
    const LR = GW.lessonRec;
    const last0 = TCH.recLast0;
    // 复审 #10：只有「开课之后新落盘」的录制结果才算本课的（上一节课失败留下的 LR.last 不算）
    const fresh = (last) => !!last && last !== last0;
    // 1) 录课：先请求收尾，等它落到 LR.last（成功或错误）再记账
    if (LR && LR.rec) {
      await waitRecStop(15000);
      const last = LR.last || {};
      if (GW.doc.pages !== pages) return { ok: false, error: '板书已切换' };
      if (fresh(last) && last.err) items.push({ k: 'rec', label: '录课文件', status: 'failed', detail: last.err });
      else if (!LR.rec && fresh(last) && (last.done || last.path || last.bytes)) items.push({ k: 'rec', label: '录课文件', status: 'done', ref: last.path || '（内存）', local: !!last.path });
      else items.push({ k: 'rec', label: '录课文件', status: 'cancelled', detail: '没有等到录制结束' });
    } else if (LR && LR.last && fresh(LR.last)) {
      // 本课里手动点过停止、结果已经落盘：错的一律记失败
      if (LR.last.err) items.push({ k: 'rec', label: '录课文件', status: 'failed', detail: LR.last.err });
      else items.push({ k: 'rec', label: '录课文件', status: 'done', ref: LR.last.path || '（内存）', local: !!LR.last.path });
    } else {
      items.push({ k: 'rec', label: '录课文件', status: 'skipped', detail: '这节课没有录课' });
    }
    // 2) 答题：本课真的开过才收尾（endQuiz 自身幂等）
    if (CR.q && !CR.q.ended) { try { endQuiz(); } catch (e) { /* 已经结束 */ } }
    const mine = CR.results.slice(CR.sessionStart || 0);
    if (mine.length) items.push({ k: 'quiz', label: '答题记录', status: 'done', ref: mine.length + ' 份记录' });
    else items.push({ k: 'quiz', label: '答题记录', status: 'skipped', detail: '这节课没有答题记录' });
    const rec = {
      startedAt: TCH.startedAt, endedAt: Date.now(), startPage: TCH.startPage,
      skipped: TCH.skipped.slice(),
      quizIds: mine.map((r) => r.quizId).filter(Boolean),
      outputs: [],
    };
    CR.lesson = CR.lesson || {};
    CR.lesson.sessions = CR.lesson.sessions || [];
    CR.lesson.sessions.push(rec);
    while (CR.lesson.sessions.length > 30) CR.lesson.sessions.shift();
    try { GW.doc.dirty = true; GW.bus.emit('dirty'); } catch (e) { /* noop */ }
    items.push({ k: 'save', label: '板书自动备份' });
    items.push({ k: 'pdf', label: '讲义 PDF', status: 'skipped', detail: '未生成（可在归档面板里手动导出）', optional: true });
    await backupSession(items, rec);
    if (GW.doc.pages !== pages) return { ok: false, error: '板书已切换' };

    TCH.items = items;
    TCH.phase = 'ended';
    hideTeachBar();
    TCH.closing = false;
    return { ok: true, items: items, session: rec };
  }

  async function backupSession(items, rec) {
    const item = items.find((it) => it.k === 'save');
    const writeOutputs = () => {
      rec.outputs = items.map(({ k, label, status, local, ref, detail }) => ({
        k, label, status, local: !!local, ref: status === 'done' ? (ref || '') : '', detail,
      }));
    };
    Object.assign(item, { status: 'done', ref: fmtTime(Date.now()), detail: '', retry: false });
    // 备份自身包含这份清单，只有写入成功才会从该副本读到「已完成」。
    writeOutputs();
    let ok = false;
    try { ok = await GW.storage.autosave(true); } catch (e) { /* 失败保留在归档里供重试 */ }
    if (!ok) {
      const st = GW.saveState?.();
      Object.assign(item, { status: 'failed', ref: '', detail: st?.backup?.err || '备份没有写成功', retry: true });
      writeOutputs();
    }
    return ok;
  }

  function archiveDlg() {
    const body = h('div', { class: 'teach-arc', style: 'font-size:13px' });
    const pages = GW.doc.pages;
    const sessions = CR.lesson?.sessions || [];
    const session = sessions[sessions.length - 1];
    let dlg = null;
    const paint = (items) => {
      body.textContent = '';
      body.append(h('div', { class: 'ta-hint' }, '归档只记真正完成的输出；本地文件路径是本机引用，不随 .gewu 内嵌。'));
      if (!items.length) body.append(h('div', { class: 'ta-hint' }, '还没有归档记录：先点「开始授课」。'));
      for (const it of items) {
        const row = h('div', { class: 'ta-row ' + it.status },
          h('span', { class: 'ta-k' }, it.label),
          h('span', { class: 'ta-s' }, arcLine(it)));
        if (it.ref) row.append(h('span', { class: 'ta-ref' }, it.ref));
        if (it.status === 'failed' && it.retry) {
          const b = h('button', { class: 'gw-btn ta-retry' }, '重试');
          b.onclick = async () => {
            if (GW.doc.pages !== pages || !session) return;
            b.disabled = true;
            touchDoc();
            const ok = await backupSession(items, session);
            if (GW.doc.pages !== pages) return;
            paint(items);
            GW.toast(ok ? '已备份' : '仍然失败，请检查磁盘空间');
          };
          row.append(b);
        }
        body.append(row);
      }
      const foot = h('div', { class: 'ta-foot' });
      const closeB = h('button', { class: 'gw-btn' }, '关闭');
      closeB.onclick = () => { try { if (dlg) dlg.close(); } catch (e) { /* noop */ } };
      const pdfB = h('button', { class: 'gw-btn' }, '导出 PDF（可选）');
      pdfB.onclick = () => {
        if (GW.doc.pages !== pages) return;
        try { if (GW.exportPDF) GW.exportPDF(); else GW.toast('这个版本没有 PDF 导出'); }
        catch (e) { GW.toast('PDF 导出失败：' + ((e && e.message) || e)); }
      };
      const qB = h('button', { class: 'gw-btn' }, '答题记录…');
      qB.onclick = () => { if (GW.doc.pages === pages) resultsDlg(); };
      const saveB = h('button', { class: 'gw-btn', onclick: () => {
        if (GW.doc.pages === pages) GW.storage.save(true);
      } }, '另存板书…');
      foot.append(closeB, saveB, pdfB, qB);
      body.append(foot);
    };
    const items = TCH.items.length ? TCH.items : (session?.outputs || []).map((it) => ({ ...it, retry: it.k === 'save' && it.status === 'failed' }));
    paint(items);
    dlg = GW.dialog({ title: '下课归档', width: 600, noFooter: true, body });
  }

  function insertDemo() {
    if (TCH.phase === 'live' || CR.playing) return GW.toast('请先结束授课或回放');
    const templateId = 'pb:em_multimeter_use';
    if (!GW.physicsBatch || !GW.physicsModels?.has(templateId, GW.physicsModels.CAP.BATCH)) {
      return GW.toast('当前版本没有万用表示范模型');
    }
    const title = '指针式万用表读数';
    const page = GW.addPageWith('plain', title, GW.doc.pages.length - 1);
    if (!page) return;
    const result = GW.physicsBatch.insert({ pageId: page.id, templateId, cols: 3, origin: { x: 24, y: 144 },
      rows: [0, 1, 2].map((emMuRange) => ({ params: { emMuRange, emMuT: 0.6, emMuShow: 0 } })),
    });
    if (!result.ok) return GW.toast('示范页插入失败：' + result.error);
    GW.objects.create('text', {
      html: '<strong>指针式万用表读数</strong><br>从左到右为 2.5 V、10 V、50 V 挡。指针位置相同，请写出三组读数和单位。<br>选中仪表并打开「显示答案」，可高亮对应刻度。导出时会保留当时的仪表状态。',
      size: 24, color: '#172534',
    }, { page, x: 24, y: 18, w: 1188, h: 104, exact: true });
    GW.objects.deactivate();
    GW.fitContent();
    return page;
  }

  function teachPanel() {
    if (TCH.phase === 'live') return GW.toast('授课中，可从下方授课条结束本节课');
    if (CR.playing) return GW.toast('请先结束回放');
    let dlg = null;
    const body = h('div', { class: 'teach-panel', style: 'padding:2px 0;font-size:13px;line-height:1.8' });
    const L = CR.lesson || {};
    const title = h('input', { class: 'inp', style: 'width:100%', value: L.title || '', placeholder: '这节课的标题，例如：必修二 · 圆周运动' });
    const goal = h('textarea', { class: 'inp', style: 'width:100%;height:72px;margin-top:8px;resize:vertical', placeholder: '教学目标（可选）' });
    goal.value = L.goal || '';
    const pages = (GW.doc && GW.doc.pages) || [];
    const sel = h('select', { class: 'inp' });
    pages.forEach((pg, i) => {
      const o = h('option', { value: String(i) }, '第 ' + (i + 1) + ' 页');
      if (i === ((GW.doc && GW.doc.cur) || 0)) o.selected = true;
      sel.append(o);
    });
    const recChk = h('input', { type: 'checkbox' });
    const startBtn = h('button', { class: 'gw-btn teach-start' }, '开始授课');
    const info = h('div', { class: 'teach-info' });
    const steps = h('div', { class: 'teach-steps' });
    let report = null, checking = true;
    const paintInfo = () => {
      const c = report?.counts;
      const resLine = c
        ? ('共 ' + report.total + ' 项 · 缺失 ' + (c.missing || 0) + ' · 需联网 ' + (c.net || 0) + ' · 需外部软件 ' + (c.external || 0) + ' · 未检查 ' + (c.unchecked || 0))
        : (checking ? '正在检查…' : '暂时取不到清单');
      info.textContent = '';
      info.append(
        h('div', { class: 'ti-row' }, h('b', {}, '保存：'), saveLine()),
        h('div', { class: 'ti-row' }, h('b', {}, '资源：'), resLine),
        h('div', { class: 'ti-row' }, h('b', {}, '从'), '第 ' + ((sel.value | 0) + 1) + ' 页开始；录课默认不启动')
      );
    };
    const stepsNow = TCH.phase === 'live' ? 2 : TCH.phase === 'ended' ? 3 : 1;
    ['课前准备', '授课中', '结束归档'].forEach((t, i) => {
      steps.append(h('span', { class: 'teach-step' + (i + 1 === stepsNow ? ' now' : '') + (i + 1 < stepsNow ? ' past' : '') }, (i + 1) + '. ' + t));
    });
    paintInfo();
    const refresh = async () => {
      checking = true;
      try { report = await GW.deps?.collect(); }
      catch (e) { report = null; }
      checking = false;
      if (GW.doc.pages === pages) paintInfo();
      return report;
    };
    refresh();
    sel.onchange = paintInfo;
    const wrap = h('div', { class: 'teach-prep' });
    const saveNow = h('button', { class: 'gw-btn ti-btn' }, '立即备份');
    saveNow.onclick = async () => { const ok = await GW.storage.autosave(true).catch(() => false); GW.toast(ok ? '已备份' : '备份失败'); paintInfo(); };
    const resBtn = h('button', { class: 'gw-btn ti-btn' }, '看资源清单…');
    resBtn.onclick = () => { try { GW.deps.dialog(); } catch (e) { GW.toast('资源清单打不开'); } };
    const packBtn = h('button', { class: 'gw-btn ti-btn', onclick: () => GW.deps?.exportPkg() }, '导出课件包…');
    const arcBtn = h('button', { class: 'gw-btn ti-btn', onclick: archiveDlg }, '最近归档…');
    const lessonBtn = h('button', { class: 'gw-btn ti-btn', onclick: () => {
      if (GW.doc.pages !== pages) return;
      CR.lesson = { ...CR.lesson, title: title.value.trim(), goal: goal.value.trim(), at: Date.now() };
      touchDoc();
      GW.toast('课程信息已写入当前板书');
    } }, '保存课程信息');
    const demoBtn = h('button', { class: 'gw-btn ti-btn', onclick: () => {
      const demo = insertDemo();
      if (demo) {
        sel.add(h('option', { value: String(GW.doc.cur) }, '第 ' + (GW.doc.cur + 1) + ' 页 · ' + demo.name));
        sel.value = String(GW.doc.cur);
        if (!title.value.trim()) title.value = demo.name;
        paintInfo();
      }
    } }, '插入万用表示范页');
    const actions = h('div', { class: 'teach-gap' }, resBtn, saveNow, lessonBtn, demoBtn);
    // 课件包要往老师选的目录里写文件（pickDir + copyFile），安卓外壳与网页版没有这两个能力。
    // 以前整块 append 掉，老师在手机/网页上根本看不到这个功能；现在按钮一直在，
    // 只是没能力时禁用并把原因写进 title（deps.exportPkg 自己也会再兜一次底）。
    const w0 = window.gewu;
    const canPkg = !!(w0 && typeof w0.pickDir === 'function' && typeof w0.copyFile === 'function');
    if (!canPkg) {
      packBtn.disabled = true;
      packBtn.title = '这台设备不能直接写文件夹：请先「另存为」.gewu，再在桌面版导出课件包';
      packBtn.setAttribute('aria-disabled', 'true');
    }
    actions.append(packBtn);
    if (L.sessions?.length) actions.append(arcBtn);
    wrap.append(
      h('div', { class: 'ti-row ti-title' }, h('b', {}, '标题'), title),
      goal,
      h('div', { class: 'ti-row' }, h('b', {}, '起始页'), sel),
      h('div', { class: 'ti-row' }, recChk, h('span', {}, '开始授课时同时录课（默认关闭）')),
      info,
      actions,
      h('div', { class: 'ti-muted' }, '允许跳过准备项，但跳过什么会在归档里写清。')
    );
    body.append(steps, wrap, h('div', { class: 'teach-acts' }, startBtn));
    startBtn.onclick = async () => {
      startBtn.disabled = true;
      const skipped = [];
      const d = await refresh();
      if (GW.doc.pages !== pages) return GW.toast('板书已切换，请重新打开「一节课」');
      if (!d) skipped.push('资源清单检查失败');
      if (d?.counts.missing) skipped.push('资源缺失 ' + d.counts.missing + ' 项');
      if (d?.counts.net) skipped.push('需联网资源 ' + d.counts.net + ' 项');
      if (d?.counts.external) skipped.push('需外部软件 ' + d.counts.external + ' 项');
      if (d?.counts.unchecked) skipped.push('未检查资源 ' + d.counts.unchecked + ' 项');
      const r = await startTeach({ title: title.value, goal: goal.value, page: sel.value | 0, rec: !!recChk.checked, skipped });
      startBtn.disabled = false;
      if (!r.ok) return GW.toast(r.error || '没有开始');
      GW.toast('开始授课 · 第 ' + (r.page + 1) + ' 页');
      try { if (dlg) dlg.close(); } catch (e) { /* noop */ }
    };
    dlg = GW.dialog({ title: '一节课（课前准备 / 授课中 / 结束归档）', width: 560, noFooter: true, body });
  }

  // ---------- 面板（课堂工具抽屉里的三个入口共用一个面板） ----------
  function panel() {
    const body = h('div', { style: 'padding:4px 0;font-size:13px;line-height:1.9' });
    const stat = h('div', { style: 'color:#5a6472' });
    const row = h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px' });
    const refresh = () => {
      const rec = CR.rec ? '正在记录（' + CR.rec.ops.length + ' 步）' : (CR.saved && CR.saved.ops && CR.saved.ops.length ? '已存 ' + CR.saved.ops.length + ' 步，可回放' : '还没有记录');
      const lm = CR.lesson && CR.lesson.title ? ('一节课：' + CR.lesson.title) : '一节课：未设置';
      stat.textContent = rec + ' · ' + lm;
    };
    const mk = (label, fn) => { const b = h('button', { class: 'gw-btn' }, label); b.onclick = () => { fn(); refresh(); }; row.appendChild(b); };
    mk('开始 / 停止记录', () => { if (CR.rec) { CR.saved = recStop(); } else { recStart(); } });
    mk('回放', () => {
      const r = CR.saved || (CR.rec && CR.rec.ops.length ? CR.rec : null);
      if (!r) return GW.toast('先记录一节课，或打开一份带回放的板书');
      play(r, 1);
    });
    mk('2 倍速回放', () => { const r = CR.saved; if (r) play(r, 2); else GW.toast('先记录一节课'); });
    mk('停止回放', stopPlay);
    mk('答题器', quiz);
    mk('一节课', teachPanel);
    mk('本课答题记录', resultsDlg);
    body.append(stat, row);
    refresh();
    GW.dialog({ title: '课堂增强（回放 / 答题器 / 一节课）', width: 560, body, noFooter: true });
  }

  // ---------- 跟着 .gewu 走 ----------
  function exportSeg() {
    const out = {};
    if (CR.lesson && (CR.lesson.title || CR.lesson.goal || CR.lesson.sessions?.length)) out.lesson = clone(CR.lesson);
    // 1.5.3（P4）：可选附加段；旧版本读到会忽略，旧文件没有它时按空处理。
    if (CR.results.length) out.quizResults = clone(CR.results);
    const r = (CR.rec && CR.rec.ops.length) ? CR.rec : CR.saved;
    if (r && r.ops && r.ops.length) out.replay = { t0: r.t0, base: r.base, ops: r.ops };
    return out;
  }
  function importSeg(d = {}) {
    d = d || {};
    if (TCH.phase === 'live' && GW.lessonRec?.rec) { try { GW.lessonRec.stop(); } catch (e) { /* 已在收尾 */ } }
    hideTeachBar();
    Object.assign(TCH, { phase: 'idle', startedAt: 0, startPage: 0, skipped: [], items: [], recWant: false, closing: false, recLast0: null });
    Object.assign(CR, { rec: null, playing: 0, q: null, saved: null, sessionStart: 0, lesson: d.lesson ? clone(d.lesson) : null });
    paintBar();
    back = null;
    // 记录跟着文档走：新文档/旧文件没有这个字段时必须是空的，不能继承上一份课件的记录。
    CR.results = (Array.isArray(d.quizResults) ? clone(d.quizResults) : []) || [];
    if (Array.isArray(d.replay?.ops) && d.replay.ops.length) {
      const r = clone(d.replay);
      // 1.1.18（R1）：1.1.17 及以前录的课，op 里没有 pageId（录制钩子在补 pageId 之前克隆）。
      //   这些录像本来一句也放不出来，按「录制时停在的那一页」补一次才有救。
      const base = r.base || {};
      const pid = (base.pages && base.pages[base.cur || 0] && base.pages[base.cur || 0].id) || '';
      if (pid) for (const e of r.ops) if (e && e.op && !e.op.pageId) e.op.pageId = pid;
      CR.saved = r;
    }
  }

  GW.classRoom = {
    panel, quiz, lesson: teachPanel, play, stopPlay, startQuiz, endQuiz, onMsg, resultsDlg, exportCSV,
    teachPanel, startTeach, endTeach, archiveDlg, _teach: () => TCH, _arcLine: arcLine,
    // 只给探针用：CSV 文本、插入板书、记录数组（不进任何界面）
    _csv: csvText, _insert: insertResult, _records: () => CR.results,
    recStart, recStop, exportSeg, importSeg,
    isRecording: () => !!CR.rec,
    isPlaying: () => !!CR.playing,
    _state: CR,
  };
})();
