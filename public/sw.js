const CACHE = 'gpuhunter-v1791518277';
const SHELL = [
  './',
  'index.html',
  'app.css?v=1791518277',
  'app.js?v=1791518277',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, 'index.html'));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req, fallbackUrl) {
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic') {
      const cache = await caches.open(CACHE);
      cache.put(fallbackUrl || req, res.clone());
    }
    return res;
  } catch {
    const cached = (await caches.match(fallbackUrl || req)) || (await caches.match('index.html'));
    if (cached) return cached;
    throw new Error('offline');
  }
}

async function staleWhileRevalidate(req) {
  const cached = await caches.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) {
        caches.open(CACHE).then((cache) => cache.put(req, res.clone()));
      }
      return res;
    })
    .catch(() => null);
  if (cached) {
    network.catch(() => undefined);
    return cached;
  }
  const res = await network;
  if (res) return res;
  return new Response('', { status: 504, statusText: 'offline' });
}
