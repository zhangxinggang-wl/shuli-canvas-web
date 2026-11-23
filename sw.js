/* 移动版离线缓存（Service Worker）
 * 策略：
 *   · 页面导航（index.html）—— 网络优先，断网时回落到缓存。
 *     以前是纯「缓存优先」，老师升级后打开的还是旧页面，表现是「界面不对、按钮找不到、
 *     修好的 bug 还在」，而且永远刷不掉。导航必须走网络优先。
 *   · 静态资源 —— 缓存优先 + 后台更新（离线可用）。
 *   · 缓存名带构建版本（构建脚本把 2.2.9-20261123 换成本次版本号），新版本一起来旧缓存全清。
 */
const C = 'gewu-mobile-2.2.9-20261123';
// 审计 F11：本应用缓存的专属前缀。升级与 nuke 只清自己这一份 —— 同域下别的路径
// （例如另一套教学应用）的 CacheStorage 不能被连带删掉。
const PREFIX = 'gewu-';
const ownCaches = (ks) => ks.filter((k) => String(k).indexOf(PREFIX) === 0);

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ownCaches(ks).filter((k) => k !== C).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
  // 1.7.1：页面发现服务器换了版本时，让 SW 把所有缓存清干净再重载。
  // 只删缓存、不 unregister：老师下次离线打开仍然能用（重新联网后又会填满）。
  // 审计 F10/F11：nuke 只清本应用前缀；keep 是页面刚准备好的新缓存名，必须留下（否则「新缓存已就绪」
  // 就被自己删掉，切换不原子）。也接受 {type:'nuke'} 的对象消息。
  const nuke = e.data === 'nuke' || (e.data && e.data.type === 'nuke');
  if (nuke) {
    const keep = (e.data && e.data.keep) || null;
    e.waitUntil(caches.keys().then((ks) => Promise.all(ownCaches(ks).filter((k) => k !== keep).map((k) => caches.delete(k)))).then(() => {
      if (e.source && e.source.postMessage) e.source.postMessage({ type: 'nuked' });
    }));
  }
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  let u;
  try { u = new URL(r.url); } catch (_) { return; }
  if (u.origin !== location.origin) return;
  // 协同接口不能进 Service Worker：/sync 是长连接 SSE（c.put 会把整条流缓存住、永不结束），
  // /op 与 /asset 也不是静态资源。直接交给浏览器。
  if (u.pathname === '/sync' || u.pathname === '/op' || u.pathname === '/asset') return;

  // 1.7.1：版本握手文件永远走网络、绝不进缓存。
  // 其它任何地方（反代、CDN、浏览器 HTTP 缓存）都可以缓存 JS，唯独这个文件不能——
  // 页面靠它判断「服务器上的版本是不是比我新」，它一旧就等于没装这套机制。
  if (u.pathname.endsWith('/version.json') || u.pathname === '/version.json') {
    e.respondWith((async () => {
      try {
        const res = await fetch(r, { cache: 'no-store' });
        if (res && res.ok) {
          const body = await res.text();
          return new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
        }
      } catch (_) {}
      // 审计 F10：握手失败必须能被页面判成「失败」。旧实现返回 200 + {"version":"0.0.0"}，
      // 页面把它当成功响应，再看出版本不同 ⇒ 清缓存 + 重载，纯属把网络故障误判成升级。
      return new Response('{"ok":false,"version":"0.0.0","error":"version-handshake-failed"}', { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    })());
    return;
  }

  // 页面本身：网络优先（2.5 秒拿不到再用缓存），保证升级后第一次打开就是新版本
  const isDoc = r.mode === 'navigate' || (r.headers.get('accept') || '').includes('text/html');
  if (isDoc) {
    e.respondWith((async () => {
      const c = await caches.open(C);
      try {
        const res = await Promise.race([
          fetch(r, { cache: 'no-store' }),
          new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 2500)),
        ]);
        if (res && res.ok) { c.put(r, res.clone()).catch(() => {}); return res; }
        throw new Error('bad');
      } catch (_) {
        const hit = await c.match(r, { ignoreSearch: true }) || await c.match('index.html', { ignoreSearch: true });
        if (hit) return hit;
        return new Response('离线且没有缓存，请先联网打开一次', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  e.respondWith(
    (async () => {
      const c = await caches.open(C);
      // 1.1.14：静态资源从「缓存优先 + 后台更新」改成「网络优先 + 断网回缓存」。
      // 原来只要缓存过一次，之后永远先给旧的 JS/CSS，桌面升级到 1.1.14 后平板还在跑
      // 旧代码（协同字段/相机协议对不上，看起来就是「连上了但不同步」）。局域网里
      // 直连电脑，网络优先的延迟只有几毫秒；断网时仍回落到缓存，离线可用不受影响。
      try {
        const res = await Promise.race([
          fetch(r, { cache: 'no-store' }),
          new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 2500)),
        ]);
        if (res && res.ok) { c.put(r, res.clone()).catch(() => {}); return res; }
        throw new Error('bad');
      } catch (_) {
        const hit = await c.match(r, { ignoreSearch: true });
        if (hit) return hit;
        return new Response('', { status: 504 });
      }
    })()
  );
});
