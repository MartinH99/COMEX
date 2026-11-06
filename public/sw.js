// Guarda la app en el dispositivo para que abra rápido. Los datos (/api) nunca se guardan:
// son privados de cada usuario y siempre se piden al servidor.
const CACHE = 'comex-v1';
const PRECACHE = ['/offline.html', '/offline.css', '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Páginas: siempre la versión nueva; sin conexión, el aviso
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  // Archivos de la app: los de /assets cambian de nombre en cada versión, así que se pueden reutilizar
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached && url.pathname.startsWith('/assets/')) return cached;
      // El resto (íconos, fotos de la portada) se renueva, y sin conexión se usa la copia guardada
      const network = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      });
      return cached ? network.catch(() => cached) : network;
    })
  );
});
