// Minimal service worker — its main job is satisfying the browser's PWA
// "installability" checklist (a registered SW with a fetch handler is
// required for Chrome/Android's install prompt; iOS's "Add to Home Screen"
// doesn't need it but tolerates it fine). Runtime caching is a bonus on
// top: same-origin GETs get a stale-while-revalidate cache so the shell
// still loads offline or on a flaky connection, while cross-origin
// requests (Supabase API/auth, Unsplash images) are left completely
// untouched so this never interferes with live data or auth.
const CACHE_NAME = "invyta-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  // Audio and video (e.g. the sample invitation's music) stream in partial
  // "range" chunks, which the Cache API can't store — and a whole song
  // isn't worth keeping offline anyway. Let the browser handle them.
  if (request.headers.has("range") || request.destination === "audio" || request.destination === "video") return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);

      // Cached copy first for instant repeat loads (and offline support);
      // the network request still runs in the background to refresh it.
      return cached || network;
    }),
  );
});
