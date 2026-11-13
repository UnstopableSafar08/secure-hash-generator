/* Secure Tools offline support: cache-first app shell, same-origin GET only. */
const CACHE = 'secure-tools-v12';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/styles.css?v=18',
  './assets/js/image-preview.js?v=1',
  './assets/js/script.js?v=18',
  './assets/js/pdf-tool.js?v=18',
  './assets/js/lucide.min.js?v=1.58.0',
  './assets/vendor/pdfjs/pdf.min.js',
  './assets/vendor/pdfjs/pdf.worker.min.js',
  './assets/vendor/pdf-lib/pdf-lib.min.js',
  './assets/img/icon.svg',
  './assets/img/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        }).catch(() => caches.match('./index.html'))
    )
  );
});
