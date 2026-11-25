/* Secure Tools offline support: network-first page loads, cache-first assets. */
const CACHE = 'secure-tools-v27';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/styles.css?v=22',
  './assets/css/ssl-checker.css?v=1',
  './assets/js/image-preview.js?v=1',
  './assets/js/script.js?v=29',
  './assets/js/ssl-checker.js?v=1',
  './assets/js/pdf-tool.js?v=19',
  './assets/js/pdf-extra-tools.js?v=4',
  './assets/js/lucide.min.js?v=1.58.0',
  './assets/vendor/pkijs.browser.js?v=3.0.5',
  './assets/vendor/pdfjs/pdf.min.js',
  './assets/vendor/pdfjs/pdf.worker.min.js',
  './assets/vendor/pdf-lib/pdf-lib.min.js?v=2.11.1',
  './assets/img/icon.svg',
  './assets/img/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Reload open pages only when this activation replaces an older cache.
    // That way an update (for example, a new sidebar item) is visible after
    // one reload instead of serving the old app shell until a second reload.
    const replacedOldCache = keys.some((key) => key !== CACHE);

    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();

    if (replacedOldCache) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    }
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  // Network-first for page loads so app-shell changes (new sidebar items,
  // updated script versions) show up on the next load instead of after the
  // old cache-first shell has been replaced by a second reload.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      }).catch(() => caches.match(event.request).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

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
