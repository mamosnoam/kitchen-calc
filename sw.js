// חובה להעלות את VERSION בכל שינוי בקבצי האתר.
// אחרת טלפונים שכבר פתחו את האפליקציה יישארו עם הגרסה הישנה.
const VERSION = '2.1.0';

const SCOPE = self.registration.scope;            // e.g. https://user.github.io/kitchen-calc/
const PREFIX = 'kitchen-calc|' + SCOPE + '|';     // never touch caches of other sites on github.io
const CACHE = PREFIX + VERSION;
const ASSETS = [
  './index.html',
  './styles.css',
  './app.js',
  './core.js',
  './config.js',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];
const ASSET_URLS = new Set(ASSETS.map((a) => new URL(a, SCOPE).href));
const INDEX = new URL('./index.html', SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache:'reload' skips the 10-minute HTTP cache of GitHub Pages; ?v= skips stale CDN copies
    await cache.addAll(ASSETS.map((a) => new Request(a + '?v=' + VERSION, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;
  const isNav = req.mode === 'navigate';
  const clean = url.origin + url.pathname;
  const key = isNav ? INDEX : clean;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
    // Self-healing: a missing file is fetched and stored again
    const res = await fetch(isNav ? INDEX : req);
    if (res.ok && (isNav || ASSET_URLS.has(clean))) await cache.put(key, res.clone());
    return res;
  })());
});

// The page asks for the version and whether every file is stored (offline-ready)
self.addEventListener('message', (event) => {
  const port = event.ports && event.ports[0];
  if (!port) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const found = await Promise.all(ASSETS.map((a) => cache.match(new URL(a, SCOPE).href, { ignoreSearch: true })));
    port.postMessage({ version: VERSION, ok: found.every(Boolean) });
  })());
});
