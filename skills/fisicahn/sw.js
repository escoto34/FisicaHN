/**
 * WAVE 9 §9.3 — Service worker de FísicaHN.
 *
 * Reglas innegociables (mejoras.md §9.3):
 *  - El robot NUNCA cachea respuestas de Supabase: un estado de examen o un
 *    pack de retos servido desde caché rompería la integridad del examen.
 *    (Supabase es cross-origin y no entra en el scope del SW, pero la
 *    guardia de abajo deja el contrato escrito.)
 *  - Actualización CONTROLADA: la app decide cuándo recargar; el SW solo
 *    avisa vía postMessage SKIP_WAITING (ver registro en app.js).
 *
 * Estrategia:
 *  - Navegaciones: network-first (HTML fresco; si no hay red → índice en
 *    caché, que es estático).
 *  - Estáticos (js/css/assets): **stale-while-revalidate** — se sirve la copia
 *    en caché (arranque instantáneo y offline) y en paralelo se pide la red
 *    para dejar la versión nueva lista en la siguiente carga. Antes era
 *    cache-first puro: un despliegue que no cambiara `VERSION` no llegaba
 *    NUNCA a quien ya hubiera abierto la app, porque su caché servía los
 *    módulos viejos para siempre.
 *  - El contenido del catálogo y los 46 módulos viven en js/ y se cachean
 *    con la misma regla al primer fetch (import dinámico incluido).
 */
const VERSION = 'fisicahn-v1.6.1';
const CACHE = `fisica-hn-${VERSION}`;

const SHELL = ['./', './index.html', './js/app.js', './js/physics-engine.js', './js/renderer.js', './css/main.css', './css/catalog.css', './manifest.webmanifest', './assets/favicon.svg', './assets/logo.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
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
  const url = new URL(req.url);

  // Regla de examen: nada que vaya a Supabase ni a otro origen se cachea.
  if (url.origin !== self.location.origin || url.hostname.includes('supabase')) {
    return; // se deja pasar: red real, nunca caché
  }

  // Navegaciones: red primero.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || fetch(req)))
    );
    return;
  }

  // Estáticos: se responde con la caché y se revalida en segundo plano.
  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit); // sin red: vale la copia guardada
      // Con copia: respuesta inmediata y actualización silenciosa detrás.
      if (hit) {
        event.waitUntil(fresh);
        return hit;
      }
      return fresh;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});