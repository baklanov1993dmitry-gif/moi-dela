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
  if (Math.random() < 0.02) { // чистка сырых точек старше 45 дней
    const d = new Date(Date.now() - 45 * 864e5).toISOString();
    await fetch(base + "loc_points?ts=lt." + d, { method: "DELETE", headers: hd });
  }
  if (r && !r.ok) return ok({ error: "db" }, 500);
  return ok([]); // OwnTracks ждёт массив
});
