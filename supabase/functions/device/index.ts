// Доступ Android-приложения к задачам. Отключить "Verify JWT" (авторизация: link — по сессии пользователя, остальное — по ключу устройства ?k=...)
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const ok = (o: unknown = {}, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const ymdz = (ms: number) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url), a = url.searchParams.get("a") || "";
  const SU = Deno.env.get("SUPABASE_URL")!, sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const base = SU + "/rest/v1/", hd = { apikey: sk, Authorization: "Bearer " + sk, "Content-Type": "application/json" };
  if (a === "link") {   // страница (с сессией пользователя) выпускает ключ для телефона
    const au = req.headers.get("authorization") || "";
    const ur = await fetch(SU + "/auth/v1/user", { headers: { Authorization: au, apikey: Deno.env.get("SUPABASE_ANON_KEY") || sk } });
    const u = ur.ok ? await ur.json() : null; if (!u || !u.id) return ok({ error: "auth" }, 401);
    const key = hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
    const old = await (await fetch(base + "device_keys?select=id&user_id=eq." + u.id + "&order=created_at.desc&offset=4", { headers: hd })).json();
    for (const o of old || []) await fetch(base + "device_keys?id=eq." + o.id, { method: "DELETE", headers: hd });
    const ir = await fetch(base + "device_keys", { method: "POST", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: u.id, key_hash: await sha(key) }) });
    if (!ir.ok) return ok({ error: "db " + (await ir.text()).slice(0, 200) }, 500);
    return ok({ key, base: SU });
  }
  const k = url.searchParams.get("k") || "";
  if (k.length < 32) return ok({ error: "forbidden" }, 403);
  const kr = await fetch(base + "device_keys?select=id,user_id&key_hash=eq." + (await sha(k)), { headers: hd });
  const row = kr.ok ? (await kr.json())[0] : null; if (!row) return ok({ error: "forbidden" }, 403);
  const uid = row.user_id as string;
  fetch(base + "device_keys?id=eq." + row.id, { method: "PATCH", headers: hd, body: JSON.stringify({ last_seen: new Date().toISOString() }) }).catch(() => {});
  if (a === "list") {   // всё для телефона: задачи (виджет) + будущие напоминания (будильники) + списки
    const since = new Date(Date.now() - 3600e3).toISOString();
    const q = (f: string) => fetch(base + "tasks?select=id,title,due,remind_at,my_day,my_day_date,starred,list_id&user_id=eq." + uid + "&done=eq.false&parent_id=is.null&" + f, { headers: hd }).then((r) => r.ok ? r.json() : []);
    const [rem, tasks, lists] = await Promise.all([
      q("remind_at=gt." + since + "&order=remind_at.asc&limit=200"),
      q("order=due.asc.nullslast&limit=400"),
      fetch(base + "lists?select=id,name,icon&user_id=eq." + uid + "&order=name.asc", { headers: hd }).then((r) => r.ok ? r.json() : []),
    ]);
    return ok({ rem: (rem || []).map((x: any) => ({ ...x, at: Date.parse(x.remind_at) })), tasks, lists, today: ymdz(Date.now()), now: Date.now() });
  }
  if (a === "add") {   // быстрое добавление с телефона (плитка, «Поделиться»)
    let b: any = {}; try { b = await req.json(); } catch { /* пусто */ }
    const title = String(b.title || "").trim().slice(0, 500); if (!title) return ok({ error: "empty" }, 400);
    let list_id: string | null = null;
    if (/^[0-9a-f-]{36}$/i.test(String(b.list_id || ""))) {
      const lr = await fetch(base + "lists?select=id&id=eq." + b.list_id + "&user_id=eq." + uid, { headers: hd });
      if (lr.ok && (await lr.json())[0]) list_id = String(b.list_id);
    }
    const t = { id: crypto.randomUUID(), user_id: uid, title, list_id, due: b.today ? ymdz(Date.now()) : null, note: b.note ? String(b.note).slice(0, 4000) : "", done: false, parent_id: null, category: null, starred: false, my_day: false, my_day_date: null, steps: [], est_minutes: null, status: "active", remind_at: null, repeat_rule: null, files: [], plan_start: null, created_at: new Date().toISOString() };
    const r = await fetch(base + "tasks", { method: "POST", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify(t) });
    return r.ok ? ok({ ok: true, id: t.id }) : ok({ error: "db " + (await r.text()).slice(0, 200) }, 500);
  }
  const id = url.searchParams.get("id") || "";
  if (["done", "snooze", "tom"].includes(a) && /^[0-9a-f-]{36}$/i.test(id)) {
    const tr = await fetch(base + "tasks?select=id&id=eq." + id + "&user_id=eq." + uid, { headers: hd });
    if (!tr.ok || !(await tr.json())[0]) return ok({ error: "no task" }, 404);
    const hk = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("CRON_SECRET") ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = hex(await crypto.subtle.sign("HMAC", hk, new TextEncoder().encode(id + ":" + a))).slice(0, 40);
    const r = await fetch(SU + "/functions/v1/track?ra=1&id=" + id + "&a=" + a + "&sig=" + sig);   // та же логика, что у кнопок пуша (повторы и т.д.)
    return ok({ ok: r.ok }, r.ok ? 200 : 502);
  }
  return ok({ error: "bad" }, 400);
});
