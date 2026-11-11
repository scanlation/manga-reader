// 离线 APP 模式 Service Worker 模板（位于 public/，构建时原样复制到 dist/）。
// 构建后由 scripts/inject-sw-precache.mjs 扫描 dist/ 并替换下方两个占位：
//   PRECACHE_MANIFEST —— 全量构建产物清单（"/" 与所有静态资源）
//   BUILD_VERSION     —— 由清单内容哈希派生，版本变化即触发新缓存替换旧缓存
// 行为：
//   install   预缓存清单全部资源并 skipWaiting
//   activate  删除旧版本缓存并 clients.claim 接管页面
//   fetch     页面导航 network-first（离线回退缓存的壳），静态资源 cache-first
//             （assets/ 文件名带 hash、vendor/ 内容不可变，命中即最新）
const PRECACHE_MANIFEST = /* @precache */ [];
const BUILD_VERSION = /* @version */ "dev";

const CACHE_PREFIX = "mtr-offline";
const CACHE_NAME = `${CACHE_PREFIX}-${BUILD_VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_MANIFEST);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：网络优先（保证发版后拿到新壳），离线时回退缓存的壳。
  // 应用为 hash 路由，任何导航路径都以缓存的 "/" 兜底。
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put("/", fresh.clone());
          return fresh;
        } catch {
          return (await caches.match(request)) ?? caches.match("/");
        }
      })(),
    );
    return;
  }

  // 静态资源：缓存优先，未命中取网络并回填（hash 文件名保证版本新鲜度）。
  event.respondWith(
    (async () => {
      const hit = await caches.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, res.clone());
      }
      return res;
    })(),
  );
});
