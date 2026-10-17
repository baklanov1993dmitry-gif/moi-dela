// Версию поднимай при каждом обновлении оболочки (иконки/манифест). index.html отдаётся из кэша мгновенно и обновляется в фоне.
const CACHE = "moidela-shell-v94";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png", "./manifest-journal.json", "./manifest-food.json", "./manifest-tasks.json", "./icon-journal-192.png", "./icon-food-192.png", "./icon-tasks-192.png", "./foods.json?v=4"];

self.addEventListener("install", e => {
  self.skipWaiting();
  // страница обязательна: если сеть подвела — установка не удаётся и остаётся прежний рабочий кэш (а не пустой)
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "./index.html"]).then(() => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// нет ни сети, ни кэша — вместо «This site can't be reached» своя страничка, которая сама пробует снова
const offlinePage = () => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui;background:#f6f7f9;color:#334;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><div style="font-size:42px">📡</div><p>Нет связи с сервером.<br>Пробую снова…</p><button onclick="location.reload()" style="padding:10px 18px;border-radius:20px;border:0;background:#2563eb;color:#fff;font-size:15px">Обновить</button></div><script>setTimeout(()=>location.reload(),3000)</script></body>', { headers: { "Content-Type": "text/html; charset=utf-8" } });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // Supabase и всё чужое — мимо кэша, всегда напрямую
  if (url.pathname.endsWith("build.txt")) return;
  if (url.searchParams.has("fresh")) return;           // принудительно с сервера (обновление версии)      // метка версии — всегда с сервера
  const isShell = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html") || url.pathname.endsWith("manifest.json");
  if (isShell) {                                        // страница: мгновенно из кэша, свежая версия подтягивается в фоне (новый билд подхватит checkBuild)
    const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; });
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net.catch(async () => {
        if (req.mode !== "navigate") return Response.error();
        return (await caches.match("./index.html")) || (await caches.match("./")) || offlinePage();
      });
    }));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {   // иконки: кэш первым
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});

// ---- Web Push: приходит с сервера (Supabase Edge Function), работает при закрытом приложении ----
self.addEventListener("push", e => {
  let d = {}; try { d = e.data.json(); } catch (_) { d = { title: "Напоминание", body: e.data ? e.data.text() : "" }; }
  // Chrome требует показать уведомление на КАЖДЫЙ пуш; иначе он сам рисует заглушку «tap to copy the url for this app». Поэтому показываем всегда.
  e.waitUntil(self.registration.showNotification(d.title || "Напоминание", {
    body: d.body || "", tag: d.tag || d.id || "moidela", renotify: true, requireInteraction: true, silent: false,
    icon: "icon-192.png", badge: "icon-192.png", vibrate: [250, 100, 250, 100, 250], data: { id: d.id || null, u: d.u || null, sig: d.sig || null, t: d.title || "" },
    actions: d.sig && d.u ? [{ action: "done", title: "✅ Готово" }, { action: "snooze", title: "⏰ +1 час" }, { action: "tom", title: "🌙 Завтра" }] : []   // кнопки прямо в шторке
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const dt = e.notification.data || {}, id = dt.id;
  if (e.action && dt.sig && dt.u && dt.sig[e.action]) {   // действие из шторки: сервер проверяет подпись и меняет задачу
    const lab = { done: "✅ Выполнено", snooze: "⏰ Отложено на час", tom: "🌙 Перенесено на завтра 9:00" }[e.action];
    e.waitUntil(fetch(dt.u + "?ra=1&id=" + encodeURIComponent(id) + "&a=" + e.action + "&sig=" + dt.sig[e.action], { mode: "no-cors", cache: "no-store" })
      .then(() => self.registration.showNotification(lab, { body: dt.t || "", tag: "ra-" + id, silent: true, icon: "icon-192.png", badge: "icon-192.png", data: { id } }))
      .catch(() => self.registration.showNotification("⚠️ Не получилось", { body: "Нет связи — открой приложение: " + (dt.t || ""), tag: "ra-" + id, icon: "icon-192.png", data: { id } }))
      .then(() => new Promise(r => setTimeout(r, 3500))).then(() => self.registration.getNotifications({ tag: "ra-" + id })).then(l => l.forEach(n => n.close())));
    return;
  }
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    if (cs.length) { cs[0].postMessage({ type: "open", id }); return cs[0].focus(); }
    return self.clients.openWindow("./" + (id ? "?t=" + encodeURIComponent(id) : ""));
  }));
});
