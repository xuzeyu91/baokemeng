/* 宝可梦卡牌对战 / RPG - Service Worker
 * 缓存应用壳与精灵图片，减少重复下载。
 * 修改 CACHE_VERSION 即可强制刷新缓存。
 */
const CACHE_VERSION = "pk-assets-v3";

// 应用壳资源：关键 HTML/CSS/JS
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/pokemon-battle.html",
  "/rpg.html",
  "/styles.css",
  "/rpg.css",
  "/battle-fx.css",
  "/data.js",
  "/moves.js",
  "/mon_moves.js",
  "/sprite-cache.js",
  "/sw-register.js",
  "/battle-fx.js",
  "/battle-audio.js",
  "/game.js",
  "/rpg.js",
  "/sw.js"
];

const isImage = (url) => url.pathname.startsWith("/sprites/") && url.pathname.endsWith(".png");
const isShell = (url) => SHELL_ASSETS.includes(url.pathname);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isImage(url)) {
    // 精灵图片：stale-while-revalidate，先给缓存，后台更新
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  } else if (isShell(url)) {
    // 应用壳：cache-first，命中后也尝试更新
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          fetch(request)
            .then((response) => {
              if (response && response.ok) cache.put(request, response.clone());
            })
            .catch(() => {});
          return cached;
        }
        return fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => new Response("Network unavailable", { status: 503 }));
      })
    );
  }
  // 其他请求走默认网络
});
