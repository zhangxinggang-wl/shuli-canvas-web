// 1.6.9：导出用的位图解码 Worker。
// 为什么是这里搬 Worker：导出 PDF/SVG 时要把画布上的图片、截图、仿真画面逐像素
// 拆成 RGB + Alpha 两个平面再塞进 PDF（原来在主线程上一个像素一个像素地拆）。
// 一张 4K 截图就是 800 万像素、2400 万次读写，主线程会卡住两三秒，导出进度条都不动。
// 这段纯数据变换没有任何 DOM 依赖，最适合丢进 Worker：
//   主线程 createImageBitmap(canvas) → transferToImageBitmap 给 Worker（零拷贝），
//   Worker 用 OffscreenCanvas 的 2d 上下文 getImageData，再把两个 ArrayBuffer 转移回来。
// 笔迹的「绘制」没法这样搬 —— 见 docs/notes/1.6.9-01 里的测量结论：
// 600 条笔迹整屏重画 7.2ms，其中路径缓存已经生效，剩下的成本是 canvas 光栅化本身，
// 只有把整层墨迹改成 OffscreenCanvas 才能搬走，那是另一个量级的手术，这一版不做。

self.onmessage = async (e) => {
  const { id, bmp, w, h } = e.data || {};
  try {
    const cv = new OffscreenCanvas(w, h);
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(bmp, 0, 0);
    if (bmp && bmp.close) bmp.close();
    const dd = cx.getImageData(0, 0, w, h).data;
    const n = w * h;
    const rgb = new Uint8Array(n * 3);
    const al = new Uint8Array(n);
    let hasA = 0;
    for (let j = 0, t = 0; j < n; j++, t += 3) {
      const q = j * 4;
      rgb[t] = dd[q]; rgb[t + 1] = dd[q + 1]; rgb[t + 2] = dd[q + 2];
      al[j] = dd[q + 3];
      if (dd[q + 3] !== 255) hasA = 1;
    }
    self.postMessage({ id, ok: true, w, h, hasA, rgb, al }, [rgb.buffer, al.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
