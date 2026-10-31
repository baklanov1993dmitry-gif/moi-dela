// «Траты»: оболочка из кэша мгновенно, свежая версия подтягивается в фоне. Версию поднимай при смене иконок/манифеста.
const CACHE = "money-shell-v54";
const SHELL = ["./", "./index.html", "./manifest.json", "./supabase-lib.js", "./rcparse.js", "./price.js", "./food.js", "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png"];
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
// Chrome не отдаёт на переход ответ, прошедший редирект (Cloudflare: /index.html → /): будет «This site can't be reached». Кэш всегда чистый.
const clean = async r => (r && r.redirected) ? new Response(await r.clone().blob(), { status: r.status, statusText: r.statusText, headers: r.headers }) : r;
const offlinePage = () => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui;background:#2b2b2b;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h2>Нет связи</h2><p>Попробую снова…</p></div><script>setTimeout(()=>location.reload(),4000)</script>', { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  // «Поделиться» письмом/текстом в приложение: забираем POST, кладём в кэш, открываем приложение с ?share=1
  if (req.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/share")) {
    e.respondWith((async () => {
      try {
        const fd = await req.formData(), o = { title: fd.get("title") || "", text: fd.get("text") || "", url: fd.get("url") || "", file: "" };
        for (const f of fd.getAll("files")) { if (f && f.text) { try { o.file += (o.file ? "\n" : "") + await f.text(); } catch (x) {} } }
        const c = await caches.open("money-share"); await c.put("shared", new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } }));
      } catch (x) {}
      return Response.redirect("./?share=1", 303);
    })());
    return;
  }
  if (req.method !== "GET" || url.origin !== location.origin || url.searchParams.has("fresh")) return;
  const shell = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html") || url.pathname.endsWith("manifest.json");
  if (shell) {
    const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(async c => c.put(req, await clean(copy))); } return res; });
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => { if (hit) { e.waitUntil(net.catch(() => {})); return clean(hit); } return net.catch(async () => { if (req.mode !== "navigate") return Response.error(); return (await clean(await caches.match("./index.html"))) || (await clean(await caches.match("./"))) || offlinePage(); }); }));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
});
