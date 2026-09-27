/* Service worker — funcionamento offline e lembrete semanal */
const CACHE = 'meuprogresso-v1';
const META_CACHE = 'meuprogresso-meta';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== META_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Responde do cache e atualiza em segundo plano (stale-while-revalidate)
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const key = req.mode === 'navigate' ? './index.html' : req;
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(key, { ignoreSearch: true });
      const network = fetch(req)
        .then(res => { if (res && res.ok) cache.put(key, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Lembrete semanal (Android/Chrome com o app instalado)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'lembrete-semanal') event.waitUntil(maybeRemind());
});

async function maybeRemind() {
  const c = await caches.open(META_CACHE);
  const r = await c.match('./__meta');
  if (!r) return;
  const m = await r.json();
  if (!m.reminder) return;
  const now = new Date();
  if (now.getDay() !== m.weighDay) return;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (m.lastEntry === today || m.lastNotified === today) return;
  await self.registration.showNotification('Dia de pesagem ⚖️', {
    body: `Hoje é ${m.weighDayName || 'dia de pesagem'}: registre seu peso e suas medidas.`,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'lembrete',
    data: { url: './?add=1' },
  });
  m.lastNotified = today;
  await c.put('./__meta', new Response(JSON.stringify(m), { headers: { 'Content-Type': 'application/json' } }));
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) { client.navigate(url); return client.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
