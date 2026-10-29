// Guarda las pantallas de la app para que abra sin conexión. Los datos van aparte (IndexedDB, js/almacen.js).
// VERSION la cambia movil/construir.py en cada publicación: así el móvil recoge la versión nueva.
const VERSION = "20261029-0853";
const CACHE = `panel-buffett-${VERSION}`;
const FICHEROS = [
  "./", "index.html", "app.css", "tema.css", "vars.css", "plotly.min.js", "manifest.webmanifest",
  "js/app.js", "js/almacen.js", "js/github.js", "js/formato.js", "js/bloques.js", "js/pantallas.js", "js/cartera.js", "js/ajustes.js",
  "iconos/icono.svg", "iconos/icono-192.png", "iconos/icono-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHEROS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n.startsWith("panel-buffett-") && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return; // la API de GitHub va siempre a la red
  // se responde al instante con lo guardado y se renueva por detrás (la versión nueva entra en la siguiente apertura)
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const guardado = await c.match(e.request, { ignoreSearch: true });
      const red = fetch(e.request)
        .then((r) => {
          if (r.ok) c.put(e.request, r.clone());
          return r;
        })
        .catch(() => guardado || c.match("index.html"));
      return guardado || red;
    }),
  );
});
