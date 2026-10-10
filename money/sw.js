// «Траты»: оболочка из кэша мгновенно, свежая версия подтягивается в фоне. Версию поднимай при смене иконок/манифеста.
const CACHE = "money-shell-v2";
const SHELL = ["./", "./index.html", "./manifest.json", "./supabase-lib.js", "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png"];
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.searchParams.has("fresh")) return;
  const shell = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html") || url.pathname.endsWith("manifest.json");
  if (shell) {
    const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; });
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => { if (hit) { e.waitUntil(net.catch(() => {})); return hit; } return net.catch(() => caches.match("./index.html") || Response.error()); }));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
});
