// Приёмник трекера для «Мои дела». Секреты: TRACK_KEY (общий ключ), TRACK_USER (uuid владельца).
// Отключить "Verify JWT" в настройках функции: авторизация по ключу ?k=...
const H = { "Content-Type": "application/json" };
const ok = (o: unknown = [], s = 200) => new Response(JSON.stringify(o), { status: s, headers: H });
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const key = Deno.env.get("TRACK_KEY"), user = Deno.env.get("TRACK_USER");
  if (!key || !user || url.searchParams.get("k") !== key) return ok({ error: "forbidden" }, 403);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return ok({ error: "bad json" }, 400); }
  const base = Deno.env.get("SUPABASE_URL") + "/rest/v1/";
  const sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const hd = { apikey: sk, Authorization: "Bearer " + sk, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" };
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
  let r: Response | null = null;
  if (b._type === "location" && num(b.lat) !== null && num(b.lon) !== null) {
    const ts = new Date((num(b.tst) ?? Date.now() / 1000) * 1000).toISOString();
    r = await fetch(base + "loc_points?on_conflict=user_id,ts", { method: "POST", headers: hd,
      body: JSON.stringify({ user_id: user, ts, lat: b.lat, lon: b.lon, vel: num(b.vel), acc: num(b.acc), batt: num(b.batt) }) });
  } else if (b._type === "media") {
    const s = (v: unknown) => String(v ?? "").slice(0, 300);
    r = await fetch(base + "media_events", { method: "POST", headers: hd,
      body: JSON.stringify({ user_id: user, app: s(b.app), title: s(b.title), artist: s(b.artist), state: s(b.state).slice(0, 20) }) });
  }
  if (r && r.ok && b._type === "location" && (num(b.acc) === null || (num(b.acc) as number) <= 150)) {
    try { await placeCheck(base, hd, user, b.lat as number, b.lon as number); } catch (e) { console.error("placeCheck " + (e as Error).message); }
  }
  if (Math.random() < 0.02) { // чистка сырых точек старше 45 дней
    const d = new Date(Date.now() - 45 * 864e5).toISOString();
    await fetch(base + "loc_points?ts=lt." + d, { method: "DELETE", headers: hd });
  }
  if (r && !r.ok) return ok({ error: "db" }, 500);
  return ok([]); // OwnTracks ждёт массив
});

// Напоминания по месту: задача с remind_place срабатывает при ВХОДЕ в зону места (гистерезис: выход = 1.6 радиуса), не чаще раза в 2 часа.
function dist(a: number, b: number, c: number, d: number) {
  const R = 6371000, t = (x: number) => x * Math.PI / 180, dl = t(c - a), dg = t(d - b);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
async function placeCheck(base: string, hd: Record<string, string>, user: string, lat: number, lon: number) {
  const q = await fetch(base + "tasks?select=id,title,due,remind_place,remind_place_in,remind_place_at&user_id=eq." + user + "&done=eq.false&remind_place=not.is.null", { headers: hd });
  if (!q.ok) return;
  const ts = await q.json() as Array<Record<string, string | boolean | null>>;
  if (!ts.length) return;
  const ids = [...new Set(ts.map((t) => t.remind_place as string))];
  const pr = await fetch(base + "places?select=id,name,lat,lon,r&id=in.(" + ids.join(",") + ")", { headers: hd });
  if (!pr.ok) return;
  const pls = await pr.json() as Array<{ id: string; name: string; lat: number; lon: number; r: number }>;
  const ph = { ...hd, Prefer: "return=minimal" };
  for (const t of ts) {
    const p = pls.find((x) => x.id === t.remind_place); if (!p) continue;
    const d = dist(lat, lon, p.lat, p.lon), r = p.r || 120, inn = !!t.remind_place_in;
    if (d <= r + 30 && !inn) {
      const last = t.remind_place_at ? Date.parse(t.remind_place_at as string) : 0, fire = Date.now() - last > 2 * 3600e3;
      const patch: Record<string, unknown> = { remind_place_in: true };
      if (fire) {
        patch.remind_place_at = new Date().toISOString();
        const tg = Deno.env.get("TG_TOKEN"), ch = Deno.env.get("TG_CHAT");
        if (tg && ch) await fetch("https://api.telegram.org/bot" + tg + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: ch, text: "📍 Ты рядом: " + p.name + "\n🔔 " + t.title + (t.due ? "\n⏳ срок " + String(t.due).slice(8) + "." + String(t.due).slice(5, 7) : "") }) });
      }
      await fetch(base + "tasks?id=eq." + t.id, { method: "PATCH", headers: ph, body: JSON.stringify(patch) });
    } else if (d > r * 1.6 && inn) {
      await fetch(base + "tasks?id=eq." + t.id, { method: "PATCH", headers: ph, body: JSON.stringify({ remind_place_in: false }) });
    }
  }
}
