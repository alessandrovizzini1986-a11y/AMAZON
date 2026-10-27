/**
 * Service worker del vademecum (scope /vademecum/): le pagine e le immagini già
 * aperte restano consultabili senza rete. Servito da qui (dietro login) e non
 * da public/, così lo scope coincide con la sezione e il middleware resta com'è.
 */
const SW = `
const CACHE = "vademecum-v1";
const isVademecum = (u) => u.pathname === "/vademecum" || u.pathname.startsWith("/vademecum/");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function put(req, res) {
  if (!res || !res.ok || res.redirected || res.type === "opaqueredirect") return;
  const c = await caches.open(CACHE);
  await c.put(req, res.clone());
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    // sessione scaduta o logout: via le copie locali (contengono dati personali)
    if (res.redirected && new URL(res.url).pathname === "/login") {
      await caches.delete(CACHE);
      return res;
    }
    await put(req, res);
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  await put(req, res);
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) return e.respondWith(cacheFirst(req));
  if (url.pathname.startsWith("/vademecum/img/")) return e.respondWith(cacheFirst(req));
  if (url.pathname === "/api/vademecum/search-index") return e.respondWith(networkFirst(req));
  // pagine: solo navigazioni complete (le richieste RSC di Next hanno URL variabili)
  if (req.mode === "navigate" && isVademecum(url)) return e.respondWith(networkFirst(req));
});
`;

export function GET() {
  return new Response(SW, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      // lo script sta in /vademecum/ ma deve controllare anche /vademecum (indice)
      "Service-Worker-Allowed": "/vademecum",
    },
  });
}
