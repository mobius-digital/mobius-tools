/* Locus as a phone app (2026-10-10): the offline shell.
 *
 * Scope /profit/. Only the app's own files are cached; every number comes from the workers live and is never
 * cached here (those are other origins, and a cached number would be a wrong number).
 *   - Opening Locus (a navigation): the network first, so a deploy shows at once; offline = the last copy of the
 *     page, or offline.html when there is none yet.
 *   - The app's files (scripts, styles, icons, fonts, the mark): the cached copy at once, refreshed behind.
 *     Every script tag carries ?v=, so a new version is a new URL and never waits on the old copy.
 *   - Anything else (the API, Meta and Triple Whale images, POSTs): straight to the network, untouched.
 * Bump VERSION to drop every old copy. */
const VERSION = 'locus-v1';
const SHELL = ['./', './index.html', './offline.html', './manifest.webmanifest', '../icons/locus-round-192.png', '../icons/locus-round-512.png', '../mobius.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const sameOrigin = u => u.origin === self.location.origin;
const isAsset = u => sameOrigin(u) && /\.(js|css|png|svg|webp|jpg|ico|woff2?|webmanifest|gif)$/i.test(u.pathname);
const isFont = u => u.origin === 'https://fonts.googleapis.com' || u.origin === 'https://fonts.gstatic.com';

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (req.mode === 'navigate' && sameOrigin(u) && u.pathname.startsWith('/profit/')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && (u.pathname === '/profit/' || u.pathname === '/profit/index.html')) {
          const c = await caches.open(VERSION); c.put('./index.html', res.clone()).catch(() => {});
        }
        return res;
      } catch {
        const c = await caches.open(VERSION);
        return (await c.match('./index.html')) || (await c.match('./offline.html')) || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }
  if (isAsset(u) || isFont(u)) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || new Response('', { status: 504 });
    })());
  }
});
