const CACHE_NAME = 'flare-cmms-v7-pages';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'styles.css',
  'config.js',
  'i18n.js',
  'image-utils.js',
  'api.js',
  'app.js',
  'ext.js',
  'logo.png',
  'icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url || '';
  // Always network for Apps Script API calls
  if (url.includes('script.google.com') || event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
