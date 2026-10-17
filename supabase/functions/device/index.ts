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
      q("remind_at=gt." + since + "&remind_via=in.(alarm,both)&order=remind_at.asc&limit=200"),
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
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due || "")) ? String(b.due) : b.today ? ymdz(Date.now()) : null;
    const t = { id: crypto.randomUUID(), user_id: uid, title, list_id, due, note: b.note ? String(b.note).slice(0, 4000) : "", done: false, parent_id: null, category: null, starred: false, my_day: false, my_day_date: null, steps: [], est_minutes: null, status: "active", remind_at: null, repeat_rule: null, files: [], plan_start: null, created_at: new Date().toISOString() };
    const r = await fetch(base + "tasks", { method: "POST", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify(t) });
    return r.ok ? ok({ ok: true, id: t.id }) : ok({ error: "db " + (await r.text()).slice(0, 200) }, 500);
  }
  if (a === "up") {   // файл/картинка к задаче с телефона («Поделиться» → Мои дела): тело — сырые байты, ?id=<задача>&name=<имя файла>
    const tid = url.searchParams.get("id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(tid)) return ok({ error: "bad id" }, 400);
    const ct = (req.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase() || "application/octet-stream";
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) return ok({ error: "size" }, 413);
    const tr = await fetch(base + "tasks?select=id,files&id=eq." + tid + "&user_id=eq." + uid, { headers: hd });
    const task = tr.ok ? (await tr.json())[0] : null; if (!task) return ok({ error: "no task" }, 404);
    let nm = "Файл"; try { nm = decodeURIComponent(url.searchParams.get("name") || "") || nm; } catch { /* оставим по умолчанию */ }
    nm = nm.replace(/[\\/\r\n]/g, " ").trim().slice(0, 120) || "Файл";
    const byCt: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };
    let ext = (nm.match(/\.[A-Za-z0-9]{1,8}$/) || [""])[0].toLowerCase();
    if (!ext && byCt[ct]) { ext = byCt[ct]; nm += ext; }
    const path = uid + "/" + tid + "/" + crypto.randomUUID() + ext;
    const ur = await fetch(SU + "/storage/v1/object/attachments/" + path, { method: "POST", headers: { apikey: sk, Authorization: "Bearer " + sk, "Content-Type": ct }, body: bytes });
    if (!ur.ok) return ok({ error: "storage " + (await ur.text()).slice(0, 200) }, 500);
    const files = (Array.isArray(task.files) ? task.files : []).concat([{ name: nm, path, size: bytes.length }]);
    const pr = await fetch(base + "tasks?id=eq." + tid + "&user_id=eq." + uid, { method: "PATCH", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify({ files }) });
    return pr.ok ? ok({ ok: true, path }) : ok({ error: "db " + (await pr.text()).slice(0, 200) }, 500);
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
  if (a === "jrc") {   // темы журнала для формы на телефоне: самые частые
    const r = await fetch(base + "time_log?select=cat&user_id=eq." + uid + "&cat=not.is.null&order=created_at.desc&limit=400", { headers: hd });
    const cnt: Record<string, number> = {};
    if (r.ok) for (const x of await r.json()) if (x.cat) cnt[x.cat] = (cnt[x.cat] || 0) + 1;
    return ok({ cats: Object.keys(cnt).sort((p, q) => cnt[q] - cnt[p]).slice(0, 12) });
  }
  if (a === "jr") {   // запись в журнал с телефона (таймер старт/стоп): title, start (мс), end (мс), cat, val = u|n|x
    let b: any = {}; try { b = await req.json(); } catch { /* пусто */ }
    const title = String(b.title || "").trim().slice(0, 500); if (!title) return ok({ error: "empty" }, 400);
    const st = Number(b.start), en = Number(b.end);
    if (!(st > 0) || !(en > st) || en - st > 24 * 3600e3) return ok({ error: "time" }, 400);
    const row: any = { id: crypto.randomUUID(), user_id: uid, title, note: "", kind: "t", start_at: new Date(st).toISOString(), end_at: new Date(en).toISOString() };
    const cat = String(b.cat || "").trim().slice(0, 60); if (cat) row.cat = cat;
    if (["u", "n", "x"].includes(b.val)) row.val = b.val;
    let r = await fetch(base + "time_log", { method: "POST", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify(row) });
    if (!r.ok) { delete row.val; r = await fetch(base + "time_log", { method: "POST", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify(row) }); }   // колонки val ещё нет
    return r.ok ? ok({ ok: true, id: row.id, noval: b.val && !row.val ? true : undefined }) : ok({ error: "db " + (await r.text()).slice(0, 200) }, 500);
  }
  return ok({ error: "bad" }, 400);
});
