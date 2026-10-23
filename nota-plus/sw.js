// Offline shell for Nota+. Bump VERSION whenever any file in SHELL changes.
const VERSION = 'nota-plus-v13';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/ai.js', 'js/export.js', 'js/i18n.js', 'js/recorder.js', 'js/selfcheck.js', 'js/state.js', 'js/stt.js', 'js/store.js', 'js/util.js', 'js/views.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.svg'
];

self.addEventListener('install', (e) => {
  // 'reload' skips the browser's own 10 minute cache so every file of a release comes from the same deploy
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nota-plus') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first with a short timeout, so a fix is live on the next open and a bad connection never leaves a blank screen.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // AI calls go straight to the network

  e.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const net = fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      });
      net.catch(() => {});
      try {
        return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
      } catch {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const index = await caches.match('index.html');
          if (index) return index;
        }
        return net; // nothing cached, let the network answer or fail
      }
    })()
  );
});
