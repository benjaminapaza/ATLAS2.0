/* A.T.L.A.S — Service worker: red primero, caché como respaldo offline.
   Las llamadas /api/ nunca se cachean (son datos y respuestas de IA). */
const CACHE = 'atlas-v2.0.0';
const SHELL = [
  './', './index.html', './css/styles.css', './manifest.webmanifest',
  './js/config.local.js', './js/config.js', './js/store.js', './js/adapters.js', './js/data.js',
  './js/ui.js', './js/ai.js', './js/progress.js', './js/app.js', './js/views2.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0) return; /* siempre red */
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
