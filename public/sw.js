/* SALT-FAAMA service worker: rede primeiro, cache como reserva (funciona sem internet para abrir a credencial) */
const CACHE = 'salt-faama-v5';
const CORE = ['./', 'index.html', 'styles.css?v=4', 'app.js?v=5', 'manifest.webmanifest',
  'vendor/supabase.js', 'vendor/591.supabase.js', 'vendor/qrcode.js', 'vendor/jsQR.js', 'vendor/jspdf.umd.min.js',
  'img/salt-faama-branco.png', 'img/salt-faama-marinho.png', 'img/salt-faama-sigla-branco.png', 'img/salt-faama-sigla-marinho.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
