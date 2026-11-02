// Service worker mínimo: guarda o "casco" do app para abrir rápido e deixa
// tudo que é dado (Supabase, mapas, geocodificação) sempre ir para a rede.
const CACHE = 'simbora-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navegação: rede primeiro, cópia guardada se estiver sem internet.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  // Arquivos do build têm hash no nome: cache primeiro.
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
  }
});

// Toque num aviso: leva para o app que já está aberto, ou abre ele.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => 'focus' in w);
      return open ? open.focus() : self.clients.openWindow('/');
    }),
  );
});
