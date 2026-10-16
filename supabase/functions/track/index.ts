// Приёмник трекера для «Мои дела». Секреты: TRACK_KEY (общий ключ), TRACK_USER (uuid владельца).
// Отключить "Verify JWT" в настройках функции: авторизация по ключу ?k=...
const H = { "Content-Type": "application/json" };
const ok = (o: unknown = [], s = 200) => new Response(JSON.stringify(o), { status: s, headers: H });
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("ra") === "1") return await raHandle(url);   // кнопки в уведомлении: авторизация по HMAC-подписи
  const key = Deno.env.get("TRACK_KEY"), user = Deno.env.get("TRACK_USER");
  if (!key || !user || url.searchParams.get("k") !== key) return ok({ error: "forbidden" }, 403);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return ok({ error: "bad json" }, 400); }
  const base = Deno.env.get("SUPABASE_URL") + "/rest/v1/";
  const sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const hd = { apikey: sk, Authorization: "Bearer " + sk, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" };
  if (b.update_id !== undefined) { try { await tgHandle(base, hd, user, b); } catch (e) { console.error("tg " + (e as Error).message); } return ok({}); }
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

// ---------- Telegram: кнопки под напоминанием и ответ «ок» ----------
const he = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tgApi = (method: string, payload: Record<string, unknown>) => fetch("https://api.telegram.org/bot" + Deno.env.get("TG_TOKEN") + "/" + method, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch((e) => console.error("tg " + e));
const ymdz = (ms: number) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);   // дата в Новосибирске
function nextDueStr(rule: string, due: string | null): string {
  const today = ymdz(Date.now()), p = rule.split(":"), u = p[0], n = +p[1] || 1;
  const [by, bm, bd] = (due || today).split("-").map(Number);
  const dim = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  let k = 0, d = new Date(Date.UTC(by, bm - 1, bd));
  do {
    k++;
    if (u === "d") d = new Date(Date.UTC(by, bm - 1, bd + n * k));
    else if (u === "w") d = new Date(Date.UTC(by, bm - 1, bd + 7 * n * k));
    else if (u === "m") { const y = by, m = bm - 1 + n * k; d = new Date(Date.UTC(y, m, Math.min(bd, dim(y, m)))); }
    else if (u === "y") { const y = by + n * k; d = new Date(Date.UTC(y, bm - 1, Math.min(bd, dim(y, bm - 1)))); }
    else if (u === "wd") { do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6); }
    else d = new Date(Date.UTC(by, bm - 1, bd + k));
  } while (d.toISOString().slice(0, 10) <= today && k < 5000);
  return d.toISOString().slice(0, 10);
}
type TRow = Record<string, any>;
async function tgComplete(base: string, hd: Record<string, string>, user: string, t: TRow) {
  const ph = { ...hd, Prefer: "return=minimal" }, nowI = new Date().toISOString();
  if (t.repeat_rule) {   // как в приложении: закрыли повторяющуюся — создаём следующую
    const nd = nextDueStr(String(t.repeat_rule), t.due);
    let rem: string | null = null;
    if (t.remind_at) { const r = new Date(Date.parse(t.remind_at) + 7 * 3600e3), [y, m, d] = nd.split("-").map(Number); rem = new Date(Date.UTC(y, m - 1, d, r.getUTCHours(), r.getUTCMinutes()) - 7 * 3600e3).toISOString(); }
    const nt = { id: crypto.randomUUID(), user_id: user, list_id: t.list_id, title: t.title, due: nd, category: t.category, starred: t.starred, note: t.note, est_minutes: t.est_minutes, repeat_rule: t.repeat_rule, remind_at: rem, steps: (t.steps || []).map((x: TRow) => ({ t: x.t, d: false })), status: "active", done: false, created_at: nowI };
    const ir = await fetch(base + "tasks", { method: "POST", headers: ph, body: JSON.stringify(nt) });
    if (!ir.ok) console.error("repeat insert " + ir.status + " " + (await ir.text()).slice(0, 200));
  }
  await fetch(base + "tasks?id=eq." + t.id + "&user_id=eq." + user, { method: "PATCH", headers: ph, body: JSON.stringify({ done: true, done_at: nowI }) });
  await fetch(base + "tasks?parent_id=eq." + t.id + "&done=eq.false", { method: "PATCH", headers: ph, body: JSON.stringify({ done: true, done_at: nowI }) });
}
async function tgSnooze(base: string, hd: Record<string, string>, user: string, id: string, atMs: number) {
  await fetch(base + "tasks?id=eq." + id + "&user_id=eq." + user, { method: "PATCH", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify({ remind_at: new Date(atMs).toISOString(), remind_sent_for: null }) });
}
async function tgGetTask(base: string, hd: Record<string, string>, user: string, id: string): Promise<TRow | null> {
  const r = await fetch(base + "tasks?select=*&id=eq." + id + "&user_id=eq." + user, { headers: hd }); if (!r.ok) return null;
  const a = await r.json(); return a[0] || null;
}
async function tgLastReminded(base: string, hd: Record<string, string>, user: string): Promise<TRow | null> {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString(), out: TRow[] = [];
  for (const col of ["remind_sent_for", "remind_place_at"]) {
    const r = await fetch(base + "tasks?select=*&user_id=eq." + user + "&done=eq.false&" + col + "=gt." + since + "&order=" + col + ".desc&limit=1", { headers: hd });
    if (r.ok) { const a = await r.json(); if (a[0]) out.push({ ...a[0], _at: Date.parse(a[0][col]) }); }
  }
  out.sort((a, b) => b._at - a._at); return out[0] || null;
}

async function raHandle(url: URL): Promise<Response> {
  const id = url.searchParams.get("id") || "", a = url.searchParams.get("a") || "", sig = url.searchParams.get("sig") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["done", "snooze", "tom"].includes(a)) return ok({ error: "bad" }, 400);
  const hk = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("CRON_SECRET") ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", hk, new TextEncoder().encode(id + ":" + a)))).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
  if (sig.length !== want.length || sig !== want) return ok({ error: "forbidden" }, 403);
  const base = Deno.env.get("SUPABASE_URL") + "/rest/v1/", sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const hd = { apikey: sk, Authorization: "Bearer " + sk, "Content-Type": "application/json" };
  const r = await fetch(base + "tasks?select=*&id=eq." + id, { headers: hd }); const arr = r.ok ? await r.json() : []; const t = arr[0];
  if (!t) return ok({ error: "no task" }, 404);
  if (a === "done") { if (!t.done) await tgComplete(base, hd, t.user_id, t); }
  else if (a === "snooze") await tgSnooze(base, hd, t.user_id, id, Date.now() + 3600e3);
  else { const d = ymdz(Date.now() + 86400e3).split("-").map(Number); await tgSnooze(base, hd, t.user_id, id, Date.UTC(d[0], d[1] - 1, d[2], 9, 0) - 7 * 3600e3); }
  return ok({ ok: true });
}
async function tgHandle(base: string, hd: Record<string, string>, user: string, u: TRow) {
  const owner = Deno.env.get("TG_CHAT"); if (!owner) return;
  const cq = u.callback_query as TRow | undefined, msg = (cq ? cq.message : u.message) as TRow | undefined;
  const from = String((cq ? cq.from?.id : msg?.chat?.id) ?? ""); if (from !== owner) return;   // отвечаем только владельцу
  if (cq) {
    const [act, id] = String(cq.data || "").split(":"), t = await tgGetTask(base, hd, user, id);
    const chat = msg?.chat?.id, mid = msg?.message_id;
    if (!t) { await tgApi("answerCallbackQuery", { callback_query_id: cq.id, text: "Задача не найдена" }); return; }
    if (act === "d") { await tgComplete(base, hd, user, t); await tgApi("answerCallbackQuery", { callback_query_id: cq.id, text: "Готово ✅" });
      if (!msg?.reply_markup?.inline_keyboard || msg.reply_markup.inline_keyboard.length <= 1) await tgApi("editMessageText", { chat_id: chat, message_id: mid, parse_mode: "HTML", text: "✅ <s>" + he(String(t.title)) + "</s>" });
      else { const kb = msg.reply_markup.inline_keyboard.filter((r: TRow[]) => !String(r[0]?.callback_data || "").endsWith(id)); await tgApi("editMessageReplyMarkup", { chat_id: chat, message_id: mid, reply_markup: { inline_keyboard: kb } }); }
    } else if (act === "s") { await tgSnooze(base, hd, user, id, Date.now() + 3600e3); await tgApi("answerCallbackQuery", { callback_query_id: cq.id, text: "Напомню через час ⏰" });
      if (!msg?.reply_markup?.inline_keyboard || msg.reply_markup.inline_keyboard.length <= 1) await tgApi("editMessageText", { chat_id: chat, message_id: mid, parse_mode: "HTML", text: "⏰ <b>" + he(String(t.title)) + "</b>\n<i>отложено на час</i>" }); }
    else if (act === "t") { const d = ymdz(Date.now() + 86400e3).split("-").map(Number); await tgSnooze(base, hd, user, id, Date.UTC(d[0], d[1] - 1, d[2], 9, 0) - 7 * 3600e3); await tgApi("answerCallbackQuery", { callback_query_id: cq.id, text: "Напомню завтра в 9:00 🌙" });
      await tgApi("editMessageText", { chat_id: chat, message_id: mid, parse_mode: "HTML", text: "🌙 <b>" + he(String(t.title)) + "</b>\n<i>напомню завтра в 9:00</i>" }); }
    return;
  }
  const text = String(msg?.text || "").trim().toLowerCase().replace(/[.!\s]+$/g, "");
  if (/^(ок|окей|ok|okay|да|готово|сделал|сделала|сделано|выполнено|✅|👍|\+)$/.test(text)) {
    const t = await tgLastReminded(base, hd, user);
    if (!t) { await tgApi("sendMessage", { chat_id: owner, text: "Нет невыполненных напоминаний за последние сутки 🙂" }); return; }
    await tgComplete(base, hd, user, t);
    await tgApi("sendMessage", { chat_id: owner, parse_mode: "HTML", text: "✅ Выполнено: <s>" + he(String(t.title)) + "</s>" });
  } else if (/^(позже|потом|отложи|\+1ч|через час)$/.test(text)) {
    const t = await tgLastReminded(base, hd, user); if (!t) return;
    await tgSnooze(base, hd, user, t.id, Date.now() + 3600e3);
    await tgApi("sendMessage", { chat_id: owner, parse_mode: "HTML", text: "⏰ <b>" + he(String(t.title)) + "</b> — напомню через час" });
  } else if (msg) {
    await tgApi("sendMessage", { chat_id: owner, text: "Отвечай «ок» — закрою последнее напоминание, «позже» — отложу на час. Или жми кнопки под напоминанием." });
  }
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
        if (tg && ch) await tgApi("sendMessage", { chat_id: ch, parse_mode: "HTML", disable_web_page_preview: true,
          text: "📍 <b>Ты рядом: " + he(String(p.name)) + "</b>\n🔔 " + he(String(t.title)) + (t.due ? "\n<i>⏳ срок " + String(t.due).slice(8) + "." + String(t.due).slice(5, 7) + "</i>" : ""),
          reply_markup: { inline_keyboard: [[{ text: "✅ Готово", callback_data: "d:" + t.id }, { text: "⏰ +1 час", callback_data: "s:" + t.id }]] } });
      }
      await fetch(base + "tasks?id=eq." + t.id, { method: "PATCH", headers: ph, body: JSON.stringify(patch) });
    } else if (d > r * 1.6 && inn) {
      await fetch(base + "tasks?id=eq." + t.id, { method: "PATCH", headers: ph, body: JSON.stringify({ remind_place_in: false }) });
    }
  }
}
