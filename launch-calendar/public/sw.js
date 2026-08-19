/*
 * Service worker for the home-screen app.
 *
 * Deliberately small. The board is live data polled every ten seconds, so
 * nothing that could go stale is ever cached:
 *   - pages and API calls always go to the network
 *   - when a page load fails with no connection, the offline screen is shown
 *   - build assets under /_next/static/ are content-hashed and immutable, so
 *     those are kept once seen and served from cache — that is what makes the
 *     app open instantly on a weak signal instead of showing a blank screen
 *
 * Bump CACHE when the offline page changes; old caches are dropped on activate.
 */
const CACHE = "mc-shell-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Full page loads: network, falling back to the offline screen.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(
          (cached) =>
            cached ||
            new Response("You're offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            }),
        ),
      ),
    );
    return;
  }

  // Immutable build output: cache first, fill the cache from the network.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
  }

  // Everything else (API, RSC payloads, fonts, the logo) is left to the browser.
});
