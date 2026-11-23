/* 数理无限画布 · 点列预处理线程（I5 基础设施）
 *
 * 定位：把「平滑 + 拟合」这段纯计算从主线程挪到 Worker。**不搬光栅化** —— 那需要
 * OffscreenCanvas 转移控制权，等于重写 board.js 的整条绘制路径（法线限幅、斜切、椭圆帽、
 * 增量快路径都在那儿），风险远大于收益。任务书里 I5 的前置条件就是「实测确认主线程瓶颈」，
 * 在拿到采样之前不赌。
 *
 * 与任务书的差异（必须知情）：TASK-2.0.8 的 I5 原文写「Worker + OffscreenCanvas 卸载光栅化」。
 * 实现时改为「卸载点列预处理」，原因如上；光栅化仍留主线程。后续若实测确认瓶颈在填 Path2D，
 * 再把 board.js 的 paint 抽成可在 worker 里跑的纯函数，那时才是真正的 OffscreenCanvas 化。
 *
 * 一致性保证：worker 里 importScripts 的就是主线程同一份 core/ink-kernel.js，
 * 所以两边跑的是**同一段代码**，不存在"两套实现漂移"。失败/超时/不支持一律回落主线程。
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  const GW = (root.GW = root.GW || {});
  GW.inkThread = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  let worker = null;
  let seq = 0;
  let broken = false;
  const pending = new Map();
  const stats = { sent: 0, done: 0, failed: 0, fallback: 0, msTotal: 0 };

  // worker 源码：只做「收点列 → 调同一份 ink-kernel → 回点列」
  function workerSource(kernelUrl) {
    return [
      "self.importScripts('" + kernelUrl + "');",
      'self.onmessage = function (e) {',
      '  var d = e.data || {};',
      '  try {',
      '    var drv = self.GW.inkKernel.inkDriver(d.cfg || {});',
      '    var out = drv.run(d.pts, d.opts || {});',
      // 用 Float32Array 传输：1 万点从 ~1MB 的 JS 数组降到 160KB，且可 transfer 不拷贝
      '    var flat = new Float32Array(out.length * 4);',
      '    for (var i = 0; i < out.length; i++) {',
      '      flat[i * 4] = out[i][0]; flat[i * 4 + 1] = out[i][1];',
      '      flat[i * 4 + 2] = out[i][2] == null ? 0 : out[i][2];',
      '      flat[i * 4 + 3] = out[i][3] == null ? 0 : out[i][3];',
      '    }',
      '    self.postMessage({ id: d.id, ok: true, n: out.length, flat: flat }, [flat.buffer]);',
      '  } catch (err) {',
      '    self.postMessage({ id: d.id, ok: false, err: String(err && err.message || err) });',
      '  }',
      '};',
    ].join('\n');
  }

  function kernelUrl() {
    try {
      // app:// 下相对路径在 blob worker 里解析不了，必须绝对化
      const here = (root.document && root.document.baseURI) || (root.location && root.location.href) || '';
      return new URL('core/ink-kernel.js', here).href;
    } catch (_) { return 'core/ink-kernel.js'; }
  }

  function available() {
    if (broken) return false;
    if (typeof root.Worker !== 'function') return false;
    if (!(root.GW && root.GW.settings && root.GW.settings.inkOffthread)) return false;
    return true;
  }

  function ensure() {
    if (worker || !available()) return worker;
    try {
      const blob = new Blob([workerSource(kernelUrl())], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      worker = new root.Worker(url);
      worker.onmessage = (e) => {
        const d = e.data || {};
        const job = pending.get(d.id);
        if (!job) return;
        pending.delete(d.id);
        if (!d.ok) { stats.failed++; job.reject(new Error(d.err || 'worker 失败')); return; }
        const flat = d.flat;
        const out = new Array(d.n);
        for (let i = 0; i < d.n; i++) {
          out[i] = [flat[i * 4], flat[i * 4 + 1], flat[i * 4 + 2], flat[i * 4 + 3]];
        }
        stats.done++;
        job.resolve(out);
      };
      worker.onerror = () => {
        // 一旦出错就永久退回主线程：反复重启 worker 只会在崩溃循环里打转
        broken = true;
        stats.failed++;
        pending.forEach((j) => j.reject(new Error('worker error')));
        pending.clear();
      };
    } catch (_) {
      broken = true;
      worker = null;
    }
    return worker;
  }

  function syncRun(pts, cfg, opts) {
    const drv = root.GW.inkKernel.inkDriver(cfg || {});
    return drv.run(pts, opts || {});
  }

  // 返回 Promise<[[x,y,t,p], …]>。**任何时候都不 reject**：失败即回落同步计算，
  // 因为调用方是在书写热路径上，抛错会直接丢笔。
  function preprocess(pts, cfg, opts, timeoutMs) {
    if (!pts || !pts.length) return Promise.resolve([]);
    if (!available() || !ensure()) {
      stats.fallback++;
      return Promise.resolve(syncRun(pts, cfg, opts));
    }
    const id = ++seq;
    stats.sent++;
    const t0 = (root.performance && root.performance.now()) || Date.now();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        stats.fallback++;
        resolve(syncRun(pts, cfg, opts));       // 超时：主线程补算，宁可多算一次也不丢笔
      }, timeoutMs || 40);
      pending.set(id, {
        resolve: (out) => { clearTimeout(timer); stats.msTotal += ((root.performance && root.performance.now()) || Date.now()) - t0; resolve(out); },
        reject: () => { clearTimeout(timer); stats.fallback++; resolve(syncRun(pts, cfg, opts)); },
      });
      try { worker.postMessage({ id, pts, cfg: cfg || {}, opts: opts || {} }); }
      catch (_) { clearTimeout(timer); pending.delete(id); stats.fallback++; resolve(syncRun(pts, cfg, opts)); }
    });
  }

  function report() {
    return Object.assign({ available: available(), broken, worker: !!worker, pending: pending.size }, stats);
  }
  function destroy() {
    if (worker) { try { worker.terminate(); } catch (_) {} }
    worker = null; pending.clear();
  }

  return { available, preprocess, report, destroy, syncRun };
});
