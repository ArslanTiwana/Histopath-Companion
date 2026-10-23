const STATIC_CACHE = "histopath-static-v2";
const CASE_CACHE = "histopath-recent-cases-v1";
const APP_SHELL = [
  "/",
  "/cases",
  "/briefing",
  "/search",
  "/learned",
  "/settings",
  "/end-day",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== CASE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  const isCaseRead =
    url.pathname === "/api/cases" || /^\/api\/cases\/\d+$/.test(url.pathname);
  if (isCaseRead) {
    event.respondWith(networkFirst(event.request, CASE_CACHE));
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, STATIC_CACHE, "/cases"));
    return;
  }
  if (
    url.pathname.startsWith("/_next/static/") ||
    APP_SHELL.includes(url.pathname)
  )
    event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (fallback && (await cache.match(fallback))) || Response.error();
  }
}
