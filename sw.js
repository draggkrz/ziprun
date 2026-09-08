// Cache "najpierw sieć, w razie braku pamięć" — aplikacja działa bez internetu
// (Bluetooth i tak nie wymaga sieci), ale po wejściu online zawsze bierze
// najnowszą wersję plików.

const CACHE = 'ziprun-v1';
const ASSETS = [
  './',
  'index.html',
  'app.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/plans.js',
  'js/engine.js',
  'js/speech.js',
  'js/storage.js',
  'js/ble/uuids.js',
  'js/ble/ftms.js',
  'js/ble/proprietary.js',
  'js/ble/diagnostics.js',
  'js/ble/manager.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
