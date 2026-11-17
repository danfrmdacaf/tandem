/* Tandem service worker. It keeps the application available without a connection. Calendar data is
   stored on the device by the application itself and is never cached here. */
const CACHE = 'tandem-v6';
const ASSETS = ['./', 'index.html', 'styles.css', 'core.js', 'importer.js', 'features.js', 'shell.js', 'assistant.js', 'otter.js', 'app.js', 'config.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/* Files are fetched from the network first, so a new version is used on the very next visit. The saved copy is
   only used when there is no connection. */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? 'index.html' : req, copy)); }
    return res;
  }).catch(() => caches.match(req.mode === 'navigate' ? 'index.html' : req).then((hit) => hit || caches.match('index.html'))));
});

/* Reminders. The server sends a short message shortly before an event starts and this shows it. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const base = self.registration.scope;
  e.waitUntil(self.registration.showNotification(d.title || 'Tandem', {
    body: d.body || '', tag: d.tag || undefined, icon: base + 'icons/icon-192.png', badge: base + 'icons/favicon-32.png', data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow(target);
  }));
});
