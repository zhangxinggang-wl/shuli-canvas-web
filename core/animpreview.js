/* 数理无限画布 · 单文件动画的沙箱预览 + 一键入库（方案 L2）
 *
 * 老师拿到一份来路不明的「动画 HTML」时，应用要能做到两件事：
 *   ① 先看一遍再决定 —— 预览 iframe 带 `sandbox="allow-scripts"`，**故意不给 allow-same-origin**，
 *      于是页面里的脚本拿不到画板、拿不到本书的 .gewu、也拿不到 window.gewu（不透明源）；
 *   ② 合格了才进学科库 —— 用的判据和 `scripts/check-anim.js` 是同一份（src/core/animlint.js）。
 *
 * L2 的边界（写在这里免得后面又走回头路）：
 *   - 预览态插进画布的动画对象带 `data.sandbox=true`，因此「截帧到板书」（R4）用不了 —— 那条路要同源。
 *     想截帧就把它入库，再从资源库打开：库里的文件是过过闸的，走原有同源通路。
 *   - 判据分两层：C1/C2/C4–C10 是硬伤（页面本身有问题）；C3 的章节格式只是「能不能入库」的门槛。
 *     硬伤也允许插入画布（你也许就想把它当一张网页贴上去），但入库一律拒绝。
 */
(function () {
  'use strict';
  const GW = window.GW;
  if (!GW || GW.animPreview) return;

  const LINT = () => GW.animlint || window.animlint;
  const HARD = { isContent: false, requireName: false };
  const STORE = { isContent: true, requireName: false };

  function lintOf(html, name, mode) {
    const L = LINT();
    if (!L) return { ok: false, errors: [{ code: 'L0', msg: 'animlint.js 没加载' }], checks: 0, meta: null };
    return L.lint(html, { name: name, label: name, bytes: undefined, isContent: mode.isContent, requireName: mode.requireName });
  }

  const BADGE = '沙箱预览：这个页面与画板不同源，读不到板书，也截不了帧';

  /**
   * 打开预览弹层。
   * @param {{path?:string, html?:string, name?:string, onDone?:function}} opts
   *   path  磁盘上的 .html；给了就自己读
   *   html  直接给源码（探针/内存里的内容用这个，优先于 path）
   * @returns {Promise<object|null>} { el, close, hard, need, fields, insert(), store() }
   */
  GW.animPreview = async function (opts) {
    opts = opts || {};
    let html = typeof opts.html === 'string' ? opts.html : '';
    const path = String(opts.path || '');
    if (!html) {
      if (!path) { GW.toast('没有可预览的动画文件'); return null; }
      const g = window.gewu;
      if (!g || !g.readFile) { GW.toast('预览本机文件要桌面版'); return null; }
      try { html = await g.readFile(path, 'utf8'); } catch (e) { GW.toast('读不了这个文件：' + ((e && e.message) || e)); return null; }
    }
    const name = opts.name || path.split(/[\\/]/).pop() || 'anim.html';

    const hard = lintOf(html, name, HARD);        // 页面硬伤
    const need = lintOf(html, name, STORE);       // 入库门槛 = 硬伤 + 章节格式
    const hardMsgs = new Set(hard.errors.map((e) => e.msg));
    const needOnly = need.errors.filter((e) => !hardMsgs.has(e.msg));
    const canStore = need.ok;

    const meta = need.meta || hard.meta || {};
    const titleIn = GW.h('input', { class: 'anim-pv-in', type: 'text', value: String(meta.title || name.replace(/\.html?$/i, '')) });
    const chapterDefault = meta.chapter && !/^未分配$/.test(meta.chapter) ? meta.chapter : (opts.chapter || '');
    const chapterIn = GW.h('input', { class: 'anim-pv-in', type: 'text', value: chapterDefault, placeholder: '必修三/第11章/11.4 串联电路和并联电路' });
    const tagsIn = GW.h('input', { class: 'anim-pv-in', type: 'text', value: String(meta.tags || '') });

    const list = (errs) => GW.h('ul', { class: 'anim-pv-errs' }, errs.slice(0, 12).map((e) => GW.h('li', null, GW.h('b', null, e.code + ' '), e.msg.replace(/^[^：]*：/, ''))));

    let status;
    if (hard.ok && canStore) {
      status = GW.h('div', { class: 'anim-pv-status ok' }, '✓ 通过 C1–C10', GW.h('span', { class: 'muted' }, ' · ' + need.checks + ' 条规则，可以插入画布，也可以一键入库'));
    } else if (hard.ok) {
      status = GW.h('div', { class: 'anim-pv-status warn' },
        '可以插入画布，但还不能入库',
        list(needOnly.length ? needOnly : need.errors));
    } else {
      status = GW.h('div', { class: 'anim-pv-status bad' },
        '这份页面有 ' + hard.errors.length + ' 处硬伤（仍可插入画布，但不能入库）',
        list(hard.errors));
    }

    const frame = GW.h('iframe', {
      class: 'anim-pv-frame',
      sandbox: 'allow-scripts allow-pointer-lock allow-forms',
      srcdoc: html,
      title: '沙箱预览',
    });

    const fields = GW.h('div', { class: 'anim-pv-fields' },
      GW.h('label', { class: 'anim-pv-field' }, GW.h('span', null, '标题（入库后的文件名）'), titleIn),
      GW.h('label', { class: 'anim-pv-field' }, GW.h('span', null, '章节（入库目录）'), chapterIn),
      GW.h('label', { class: 'anim-pv-field' }, GW.h('span', null, '标签（逗号分隔，可检索）'), tagsIn));

    const btnInsert = GW.h('button', { class: 'gw-btn', title: '以沙箱方式插入画布（不能截帧）' }, '插入画布（沙箱）');
    const btnStore = GW.h('button', { class: 'gw-btn primary', title: canStore ? '写进学科库' : '先过 C1–C10 与章节格式' }, '一键入库');
    if (!canStore) btnStore.disabled = true;

    const body = GW.h('div', { class: 'anim-pv' },
      GW.h('div', { class: 'anim-pv-stage' }, frame, GW.h('div', { class: 'anim-pv-badge' }, BADGE)),
      GW.h('div', { class: 'anim-pv-side' }, status, fields,
        GW.h('p', { class: 'anim-pv-note' }, '入库位置：学科库 › 物理 › ' + (chapterDefault ? chapterDefault.replace(/\//g, ' › ') : '（章节目录）') +
          '。入库后从资源库打开时走同源通路，可以截帧；预览里插入的对象是沙箱的。')),
      GW.h('div', { class: 'anim-pv-foot' }, GW.h('button', { class: 'gw-btn', onclick: () => close() }, '关闭'), btnStore, btnInsert));

    const readFields = () => ({
      title: String(titleIn.value || '').trim(),
      chapter: String(chapterIn.value || '').trim(),
      tags: String(tagsIn.value || '').split(/[,，;；]/).map((s) => s.trim()).filter(Boolean),
    });

    function insert() {
      const f = readFields();
      const data = { title: f.title || name.replace(/\.html?$/i, ''), preset: 'anim', sandbox: true };
      if (path) data.path = path;
      else data.url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const o = GW.objects.create('web', data, {});
      GW.toast('已插入（沙箱）：' + (data.title || '动画'));
      close();
      if (opts.onDone) { try { opts.onDone('insert', o); } catch (e) { console.error(e); } }
      return o;
    }

    async function store() {
      if (!need.ok) { GW.toast('还差 ' + need.errors.length + ' 条才够入库，先看左边那份名单'); return null; }
      const g = window.gewu;
      if (!g || !g.writeFile || !g.userPath) { GW.toast('一键入库只在桌面版可用'); return null; }
      const f = readFields();
      if (!f.title) { GW.toast('先填标题'); return null; }
      if (!/^(必修|选择性必修)[一二三]\/第\d+章\/.+$/.test(f.chapter)) {
        GW.toast('章节要写成「必修三/第11章/11.4 串联电路和并联电路」');
        return null;
      }
      try {
        const dirs = GW.gwanim ? GW.gwanim.chapterDirs(f.chapter) : f.chapter.split('/');
        const stem = f.title.replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 60) || 'anim';
        const htmlPath = await g.userPath('library/物理/' + dirs.join('/') + '/' + stem + '.html');
        await g.writeFile(htmlPath, html, 'utf8');
        await g.writeFile(htmlPath.replace(/\.html?$/i, '.json'), JSON.stringify({ chapter: f.chapter, tags: f.tags, title: f.title }, null, 2), 'utf8');
        GW.toast('已入库「' + f.title + '」');
        close();
        if (opts.onDone) { try { opts.onDone('store', htmlPath); } catch (e) { console.error(e); } }
        return htmlPath;
      } catch (e) {
        GW.toast('入库失败：' + ((e && e.message) || e));
        return null;
      }
    }

    btnInsert.addEventListener('click', () => { insert(); });
    btnStore.addEventListener('click', () => { store(); });

    const dlg = GW.dialog({ title: '预览动画（沙箱）· ' + name, body: body, width: 940, noFooter: true });
    const close = dlg.close;

    return { el: body, close: close, hard: hard, need: need, fields: { title: titleIn, chapter: chapterIn, tags: tagsIn }, insert: insert, store: store };
  };

  /** 选一个 .html → 直接开预览（资源库按钮走这里） */
  GW.animPick = async function (opts) {
    opts = opts || {};
    const g = window.gewu;
    if (!g || !g.openFiles) { GW.toast('导入动画只在桌面版可用'); return null; }
    let paths = [];
    try {
      paths = await g.openFiles({ title: '选择单文件动画（.html）', filters: [{ name: '动画网页', extensions: ['html', 'htm'] }], multi: false });
    } catch (e) { paths = []; }
    const one = (paths || []).filter((p) => /\.html?$/i.test(p))[0];
    if (!one) return null;
    return GW.animPreview({ path: one, name: one.split(/[\\/]/).pop(), onDone: opts.onDone });
  };
})();
