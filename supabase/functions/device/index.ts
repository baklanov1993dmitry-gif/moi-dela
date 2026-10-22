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
    let vcfg: unknown = null;   // настройки голосового добавления (общие для сайта и телефона)
    try { const vr = await fetch(base + "user_settings?select=data&user_id=eq." + uid + "&key=eq.voice:cfg", { headers: hd }); if (vr.ok) vcfg = ((await vr.json())[0] || {}).data || null; } catch { /* без настроек */ }
    return ok({ rem: (rem || []).map((x: any) => ({ ...x, at: Date.parse(x.remind_at) })), tasks, lists, vcfg, today: ymdz(Date.now()), now: Date.now() });
  }
  if (a === "cmd") {   // голосовые команды «бортовой компьютер»: текст фразы → намерение (Gemini) → действие → фраза для озвучки
    let b: any = {}; try { b = await req.json(); } catch { /* пусто */ }
    const text = String(b.text || "").trim().slice(0, 400); if (!text) return ok({ speak: "Не расслышал.", intent: "none" });
    const TZ = 7 * 3600e3, nowMs = Date.now(), loc = new Date(nowMs + TZ);
    const pad = (n: number) => String(n).padStart(2, "0"), hm = (ms: number) => { const d = new Date(ms + TZ); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); };
    const today = ymdz(nowMs), tomorrow = ymdz(nowMs + 864e5);
    const WD = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"], MN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    const toUtc = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s || ""); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - TZ).toISOString() : null; };
    const gr = await fetch(base + "tasks?select=id,title,due,remind_at,my_day_date,created_at&user_id=eq." + uid + "&done=eq.false&parent_id=is.null&order=due.asc.nullslast&limit=150", { headers: hd });
    const open: any[] = gr.ok ? await gr.json() : [];
    const last = b.last && b.last.id ? b.last : null;
    // --- 1. намерение: Gemini, а если недоступен — простые правила ---
    const rulesOf = (tx: string): any => {
      const t = tx.toLowerCase();
      return /который час|сколько времени|какое число|какой день/.test(t) ? { intent: "time" } : /погод/.test(t) ? { intent: "weather", day: /завтра/.test(t) ? "tomorrow" : "today" } : /ближайш|что на сегодня|что у меня|какие дела|что по делам/.test(t) ? { intent: "read_today" } : /что дальше|следующ.* напоминан|ближайш.* напоминан/.test(t) ? { intent: "read_next" } : /сколько дел/.test(t) ? { intent: "count" } : /^(готово|сделал|сделано|выполнено|выполнил)/.test(t) ? { intent: "done", target: "last" } : /^отложи/.test(t) ? { intent: "snooze", target: "last", minutes: /полчаса|30 минут/.test(t) ? 30 : /2 часа|два часа/.test(t) ? 120 : 60 } : /перенеси.*завтра|на завтра$/.test(t) && /^перенеси/.test(t) ? { intent: "tomorrow", target: "last" } : /^(отмена|отмени|удали последн)/.test(t) ? { intent: "undo" } : /что (ты )?умеешь|^помощь|какие команды/.test(t) ? { intent: "help" } : { intent: "add", title: tx.replace(/^(запиши|запись|добавь|новая задача)[,:]?\s*/i, "") };
    };
    const hasTimeWords = /завтра|сегодня|послезавтра|через|понедельник|вторник|сред[ауы]|четверг|пятниц|суббот|воскресень|утром|вечером|днём|днем|ночью|\d{1,2}[:.]\d{2}|\bв \d|\d+ (час|минут|дн|недел)/i.test(text);
    let I: any = rulesOf(text); const needAI = I.intent === "add" && hasTimeWords;   // ИИ нужен только для разбора срока/времени
    if (needAI) I = null;
    try {
      const key = needAI ? Deno.env.get("GEMINI_API_KEY") : "";
      if (key) {
        const sys = `Ты разбираешь голосовую команду владельца личного списка дел. Сейчас ${loc.toISOString().slice(0, 16).replace("T", " ")} (${WD[loc.getUTCDay()]}), часовой пояс +7. Ответь ТОЛЬКО JSON без пояснений: {"intent":"add|read_today|read_next|count|done|snooze|tomorrow|undo|time|weather|help","title":"текст дела (для add) без слов про срок и без слов-команд, с заглавной буквы","due":"YYYY-MM-DD или null","remind":"YYYY-MM-DD HH:MM или null","target":"last или id задачи из списка или null","minutes":число или null,"day":"today|tomorrow|null"}. Правила: add — любая фраза, похожая на новое дело/поручение/«запиши…/напомни…» (если названо время «в 15:00» — remind; «завтра» — due). read_today — что на сегодня/ближайшие дела/что у меня; read_next — какое следующее напоминание/что дальше; count — сколько дел; done — «готово/сделал/выполнено» (target last или id); snooze — «отложи/напомни позже» (minutes, по умолчанию 60); tomorrow — «перенеси на завтра»; undo — «отмена/удали последнее»; time — который час/какое число; weather — погода (day); help — «что ты умеешь/помощь». Если сомневаешься — add с полным текстом.`;
        const body = "Фраза: " + text + "\nПоследняя задача из разговора: " + (last ? last.id + " | " + last.title : "нет") + "\nОткрытые задачи (id | название | срок | напоминание):\n" + open.slice(0, 60).map((t) => t.id + " | " + t.title + " | " + (t.due || "") + " | " + (t.remind_at ? new Date(Date.parse(t.remind_at) + TZ).toISOString().slice(0, 16).replace("T", " ") : "")).join("\n");
        for (const model of [Deno.env.get("GEMINI_MODEL"), "gemini-3.8-flash", "gemini-3.5-flash-lite"].filter((m) => m) as string[]) {
          const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify({ model, input: [{ type: "text", text: sys + "\n\n" + body }] }) });
          if (!r.ok) continue; const j = await r.json().catch(() => ({})); const parts: string[] = [];
          const grab = (o: any) => { if (!o || typeof o !== "object") return; if (Array.isArray(o)) { o.forEach(grab); return; } if (/thought|reason/i.test(String(o.type || ""))) return; if (typeof o.text === "string") parts.push(o.text); for (const k of Object.keys(o)) if (k !== "text" && typeof o[k] === "object") grab(o[k]); };
          grab(j.steps ?? j.outputs ?? j); const m = /\{[\s\S]*\}/.exec(parts.join("\n")); if (m) { try { I = JSON.parse(m[0]); break; } catch { /* дальше */ } }
        }
      }
    } catch { /* правила ниже */ }
    if (!I || !I.intent) { I = rulesOf(text); }
    if (false) {
      const t = text.toLowerCase();
      I = /который час|сколько времени/.test(t) ? { intent: "time" } : /погод/.test(t) ? { intent: "weather", day: /завтра/.test(t) ? "tomorrow" : "today" } : /ближайш|что на сегодня|что у меня/.test(t) ? { intent: "read_today" } : /сколько дел/.test(t) ? { intent: "count" } : /^(готово|сделал|выполнено)/.test(t) ? { intent: "done", target: "last" } : /^отмена|удали последн/.test(t) ? { intent: "undo" } : { intent: "add", title: text.replace(/^(запиши|запись|добавь|новая задача)[,:]?\s*/i, "") };
    }
    const dueOf = (t: any) => t.due || "";
    const tasksToday = () => open.filter((t) => (t.due && t.due <= today) || t.my_day_date === today || (t.remind_at && ymdz(Date.parse(t.remind_at)) === today)).sort((x, y) => (dueOf(x) || "9").localeCompare(dueOf(y) || "9") || String(x.remind_at || "z").localeCompare(String(y.remind_at || "z")));
    const pick = (): any => { const tg = String(I.target || "last"); if (tg === "last") return last ? open.find((t) => t.id === last.id) || { id: last.id, title: last.title } : null; return open.find((t) => t.id === tg) || null; };
    const nm = (n: number, one: string, few: string, many: string) => { const m = n % 100, d = n % 10; return m >= 11 && m <= 14 ? many : d === 1 ? one : d >= 2 && d <= 4 ? few : many; };
    const done = (speak: string, extra: Record<string, unknown> = {}) => ok({ intent: I.intent, speak, ...extra });
    switch (I.intent) {
      case "time": return done("Сейчас " + hm(nowMs) + ". " + WD[loc.getUTCDay()] + ", " + loc.getUTCDate() + " " + MN[loc.getUTCMonth()] + ".");
      case "count": { const tt = tasksToday(), od = open.filter((t) => t.due && t.due < today).length; return done(tt.length ? "На сегодня " + tt.length + " " + nm(tt.length, "дело", "дела", "дел") + (od ? ", из них просрочено " + od : "") + "." : "На сегодня дел нет."); }
      case "read_today": {
        const tt = tasksToday().slice(0, 5); if (!tt.length) return done("На сегодня дел нет.");
        const ord = ["Первое", "Второе", "Третье", "Четвёртое", "Пятое"];
        return done("На сегодня " + tasksToday().length + " " + nm(tasksToday().length, "дело", "дела", "дел") + ". " + tt.map((t, i) => ord[i] + ": " + t.title + (t.remind_at && ymdz(Date.parse(t.remind_at)) === today ? ", в " + hm(Date.parse(t.remind_at)) : "") + (t.due && t.due < today ? ", просрочено" : "") + ".").join(" "), { id: tt[0].id, title: tt[0].title });
      }
      case "read_next": {
        const nx = open.filter((t) => t.remind_at && Date.parse(t.remind_at) > nowMs).sort((x, y) => Date.parse(x.remind_at) - Date.parse(y.remind_at))[0];
        if (!nx) return done("Напоминаний впереди нет.");
        const d = ymdz(Date.parse(nx.remind_at)); return done("Ближайшее напоминание " + (d === today ? "сегодня" : d === tomorrow ? "завтра" : d.slice(8) + "." + d.slice(5, 7)) + " в " + hm(Date.parse(nx.remind_at)) + ": " + nx.title + ".", { id: nx.id, title: nx.title });
      }
      case "done": { const t = pick(); if (!t) return done("Не понял, какое дело отметить."); await fetch(base + "tasks?id=eq." + t.id + "&user_id=eq." + uid, { method: "PATCH", headers: hd, body: JSON.stringify({ done: true, done_at: new Date().toISOString() }) }); return done("Выполнено: " + t.title + ".", { id: t.id, title: t.title }); }
      case "snooze": { const t = pick(); if (!t) return done("Не понял, какое дело отложить."); const mins = Math.max(5, Math.min(1440, +I.minutes || 60)); await fetch(base + "tasks?id=eq." + t.id + "&user_id=eq." + uid, { method: "PATCH", headers: hd, body: JSON.stringify({ remind_at: new Date(nowMs + mins * 60e3).toISOString(), remind_sent_for: null }) }); return done("Отложено на " + (mins % 60 === 0 ? mins / 60 + " " + nm(mins / 60, "час", "часа", "часов") : mins + " минут") + ": " + t.title + ".", { id: t.id, title: t.title }); }
      case "tomorrow": { const t = pick(); if (!t) return done("Не понял, какое дело перенести."); await fetch(base + "tasks?id=eq." + t.id + "&user_id=eq." + uid, { method: "PATCH", headers: hd, body: JSON.stringify({ due: tomorrow, remind_at: toUtc(tomorrow + " 09:00"), remind_sent_for: null }) }); return done("Перенесено на завтра: " + t.title + ".", { id: t.id, title: t.title }); }
      case "undo": {
        const ad = b.added && b.added.id ? b.added : null; if (!ad) return done("Отменять нечего.");
        const q = await fetch(base + "tasks?select=id,title,created_at&id=eq." + ad.id + "&user_id=eq." + uid, { headers: hd }); const row = q.ok ? (await q.json())[0] : null;
        if (!row || nowMs - Date.parse(row.created_at) > 15 * 60e3) return done("Отменять нечего.");
        await fetch(base + "tasks?id=eq." + row.id + "&user_id=eq." + uid, { method: "DELETE", headers: hd }); return done("Отменено: " + row.title + ".", { undone: true });
      }
      case "weather": {
        const lat = +b.lat || 55.03, lon = +b.lon || 82.92;
        try {
          const wr = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=Asia%2FNovosibirsk&forecast_days=2&wind_speed_unit=ms");
          const w = await wr.json(); const WC = (c: number) => c === 0 ? "ясно" : c <= 2 ? "переменная облачность" : c === 3 ? "пасмурно" : c <= 48 ? "туман" : c <= 57 ? "морось" : c <= 67 ? "дождь" : c <= 77 ? "снег" : c <= 82 ? "ливень" : c <= 86 ? "снегопад" : "гроза";
          const r0 = (x: number) => Math.round(x), sg = (n: number) => (n > 0 ? "плюс " : n < 0 ? "минус " : "") + Math.abs(r0(n));
          if (I.day === "tomorrow") { const d = w.daily; return done("Завтра " + WC(d.weather_code[1]) + ", от " + sg(d.temperature_2m_min[1]) + " до " + sg(d.temperature_2m_max[1]) + ", вероятность осадков " + r0(d.precipitation_probability_max[1]) + " процентов."); }
          const c = w.current, d = w.daily; return done("Сейчас " + sg(c.temperature_2m) + ", " + WC(c.weather_code) + ", ощущается как " + sg(c.apparent_temperature) + ", ветер " + r0(c.wind_speed_10m) + " метров в секунду. Сегодня от " + sg(d.temperature_2m_min[0]) + " до " + sg(d.temperature_2m_max[0]) + ", осадки " + r0(d.precipitation_probability_max[0]) + " процентов.");
        } catch { return done("Не получилось узнать погоду."); }
      }
      case "help": return done("Можно сказать: запиши и само дело; ближайшие дела; что дальше; сколько дел; готово; отложи на час; перенеси на завтра; отмена; который час; погода.");
      default: break;
    }
    // add
    const title = String(I.title || text).trim().slice(0, 500) || text;
    let list_id: string | null = null; if (/^[0-9a-f-]{36}$/i.test(String(b.list_id || ""))) { const lr = await fetch(base + "lists?select=id&id=eq." + b.list_id + "&user_id=eq." + uid, { headers: hd }); if (lr.ok && (await lr.json())[0]) list_id = String(b.list_id); }
    const dueD = /^\d{4}-\d{2}-\d{2}$/.test(String(I.due || "")) ? String(I.due) : null, rem = toUtc(String(I.remind || ""));
    const due = dueD || (rem ? ymdz(Date.parse(rem)) : b.dm === 1 ? today : b.dm === 2 ? tomorrow : null);
    const t = { id: crypto.randomUUID(), user_id: uid, title, list_id, due, note: "", done: false, parent_id: null, category: null, starred: false, my_day: !!b.myday, my_day_date: b.myday ? today : null, steps: [], est_minutes: null, status: "active", remind_at: rem, repeat_rule: null, files: [], plan_start: null, created_at: new Date().toISOString() };
    const r = await fetch(base + "tasks", { method: "POST", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify(t) });
    if (!r.ok) return ok({ intent: "add", speak: "Не получилось записать.", error: "db" }, 500);
    return done("Записано. " + title + (rem ? ". Напоминание в " + hm(Date.parse(rem)) : due === today ? ". На сегодня" : due === tomorrow ? ". На завтра" : "") + ".", { id: t.id, title, added: true });
  }
  if (a === "vset") {   // телефон сохраняет настройки голоса, чтобы они были видны и на сайте
    let b: any = {}; try { b = await req.json(); } catch { /* пусто */ }
    const d = { list: String(b.list ?? ""), due: Math.max(0, Math.min(2, +b.due || 0)), myday: !!b.myday, say: Math.max(0, Math.min(2, +b.say || 0)), rate: Math.max(0, Math.min(3, +b.rate || 0)), beep: b.beep !== false, smart: b.smart !== false, ts: +b.ts || Date.now() };
    const r = await fetch(base + "user_settings?on_conflict=user_id,key", { method: "POST", headers: { ...hd, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: uid, key: "voice:cfg", data: d, updated_at: new Date().toISOString() }) });
    return r.ok ? ok({ ok: true }) : ok({ error: "db " + (await r.text()).slice(0, 200) }, 500);
  }
  if (a === "add") {   // быстрое добавление с телефона (плитка, «Поделиться»)
    let b: any = {}; try { b = await req.json(); } catch { /* пусто */ }
    const title = String(b.title || "").trim().slice(0, 500); if (!title) return ok({ error: "empty" }, 400);
    let list_id: string | null = null;
    if (/^[0-9a-f-]{36}$/i.test(String(b.list_id || ""))) {
      const lr = await fetch(base + "lists?select=id&id=eq." + b.list_id + "&user_id=eq." + uid, { headers: hd });
      if (lr.ok && (await lr.json())[0]) list_id = String(b.list_id);
    }
    if (!list_id && b.list_name) {   // список по имени (например «Файлы» с телефона); нет такого — создаём
      const nm = String(b.list_name).trim().slice(0, 100);
      const lr = await fetch(base + "lists?select=id,name&user_id=eq." + uid + "&name=ilike." + encodeURIComponent(nm), { headers: hd });
      const f1 = lr.ok ? (await lr.json())[0] : null;
      if (f1) list_id = f1.id;
      else {
        const nid = crypto.randomUUID(), cr = await fetch(base + "lists", { method: "POST", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify({ id: nid, user_id: uid, name: nm, icon: "📎", position: 999, created_at: new Date().toISOString() }) });
        if (cr.ok) list_id = nid;
      }
    }
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due || "")) ? String(b.due) : (b.today || b.myday) ? ymdz(Date.now()) : null;
    const t = { id: crypto.randomUUID(), user_id: uid, title, list_id, due, note: b.note ? String(b.note).slice(0, 4000) : "", done: false, parent_id: null, category: null, starred: false, my_day: !!b.myday, my_day_date: b.myday ? ymdz(Date.now()) : null, steps: [], est_minutes: null, status: "active", remind_at: null, repeat_rule: null, files: [], plan_start: null, created_at: new Date().toISOString() };
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
  if (a === "jrc") {   // темы журнала для формы на телефоне: каждая тема отдельно (в записях они хранятся через запятую), по частоте
    const r = await fetch(base + "time_log?select=cat&user_id=eq." + uid + "&cat=not.is.null&order=created_at.desc&limit=2000", { headers: hd });
    const cnt: Record<string, { n: number; t: string }> = {};
    if (r.ok) for (const x of await r.json()) for (const t0 of String(x.cat || "").split(",")) { const t = t0.trim().replace(/^#/, "").slice(0, 40), k = t.toLowerCase(); if (!t) continue; (cnt[k] = cnt[k] || { n: 0, t }).n++; }
    let last = 0;   // конец последней записи журнала (не в будущем) — от него телефон считает начало нового дела
    try { const lr = await fetch(base + "time_log?select=end_at&user_id=eq." + uid + "&end_at=not.is.null&end_at=lte." + encodeURIComponent(new Date(Date.now() + 60e3).toISOString()) + "&order=end_at.desc&limit=1", { headers: hd }); if (lr.ok) { const x = (await lr.json())[0]; if (x && x.end_at) last = Date.parse(x.end_at) || 0; } } catch { /* без него */ }
    return ok({ cats: Object.values(cnt).sort((p, q) => q.n - p.n).slice(0, 60).map((v) => v.t), last });
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
