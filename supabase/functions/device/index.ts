// Доступ Android-приложения к задачам. Отключить "Verify JWT" (авторизация: link — по сессии пользователя, остальное — по ключу устройства ?k=...)
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const ok = (o: unknown = {}, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const ymdz = (ms: number) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
const durMin = (str: string): number => {   // «20 минут», «полтора часа», «час», «полчаса» -> минуты
  const W: Record<string, number> = { один: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, десять: 10, пятнадцать: 15, двадцать: 20, тридцать: 30, сорок: 40, полтора: 1.5 };
  if (/полчаса/i.test(str)) return 30;
  const m = /(?:(\d+(?:[.,]\d+)?|[а-яё]+)\s*)?(часа|часов|час|ч|минут[ыу]?|мин)(?![а-яё])/i.exec(str); if (!m) return 0;
  const n = m[1] ? (W[m[1].toLowerCase()] ?? parseFloat(m[1].replace(",", "."))) : 1; if (!(n > 0)) return 0;
  return Math.round(n * (/^ч/i.test(m[2]) ? 60 : 1));
};
async function suggestTags(text: string, existing: string[]): Promise<string[]> {   // 1–3 коротких тега; существующие в приоритете
  const t = text.trim().slice(0, 1500); if (t.length < 8) return [];
  const ex = [...new Set(existing.map((x) => String(x).toLowerCase()))].slice(0, 60);
  const out = await askAI("Ты расставляешь теги для личной заметки на русском. Верни ТОЛЬКО JSON-массив из 1–3 тегов: строчные, одно слово (или два через _), существительные в именительном падеже, без #. Если подходит существующий тег из списка — бери его. Имя человека — тоже тег. Новые теги только если существующие не подходят. Существующие теги: " + (ex.join(", ") || "нет"), t);
  if (!out) return [];
  try { const m = /\[[\s\S]*?\]/.exec(out); const arr = JSON.parse(m ? m[0] : "[]"); return [...new Set(arr.map((x: any) => String(x).toLowerCase().replace(/^#/, "").replace(/[^\p{L}\d_-]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 30)).filter((x: string) => x.length >= 2))].slice(0, 3) as string[]; } catch { return []; }
}
async function askAI(sys: string, user: string): Promise<string | null> {   // Groq (быстрый) -> Gemini, таймауты чтобы телефон не ждал
  const qk = Deno.env.get("GROQ_API_KEY");
  if (qk) for (const model of ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant"]) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + qk, "content-type": "application/json" }, body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }), signal: AbortSignal.timeout(7000) });
      if (!r.ok) continue; const j = await r.json().catch(() => ({})); const t = j?.choices?.[0]?.message?.content; if (t) return String(t);
    } catch { /* дальше */ }
  }
  const gk = Deno.env.get("GEMINI_API_KEY");
  if (gk) for (const model of [Deno.env.get("GEMINI_MODEL"), "gemini-3.8-flash"].filter((m) => m) as string[]) {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", { method: "POST", headers: { "x-goog-api-key": gk, "content-type": "application/json" }, body: JSON.stringify({ model, input: [{ type: "text", text: sys + "\n\n" + user }] }), signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue; const j = await r.json().catch(() => ({})); const parts: string[] = [];
      const grab = (o: any) => { if (!o || typeof o !== "object") return; if (Array.isArray(o)) { o.forEach(grab); return; } if (/thought|reason/i.test(String(o.type || ""))) return; if (typeof o.text === "string") parts.push(o.text); for (const k of Object.keys(o)) if (k !== "text" && typeof o[k] === "object") grab(o[k]); };
      grab(j.steps ?? j.outputs ?? j); if (parts.length) return parts.join("\n");
    } catch { /* дальше */ }
  }
  return null;
}
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
  if (a === "ntag") {   // авто-теги для заметки: text, tags (уже существующие) -> {tags:[…]}; вход по сессии
    const au = req.headers.get("authorization") || "";
    const ur = await fetch(SU + "/auth/v1/user", { headers: { Authorization: au, apikey: Deno.env.get("SUPABASE_ANON_KEY") || sk } });
    const u1 = ur.ok ? await ur.json() : null; if (!u1 || !u1.id) return ok({ error: "auth" }, 401);
    let b: any = {}; try { b = await req.json(); } catch { /* пусто */ }
    return ok({ tags: await suggestTags(String(b.text || ""), Array.isArray(b.tags) ? b.tags : []) });
  }
  if (a === "gdiag") {   // диагностика Gemini: сырые ответы Google по каждой модели (ключ не показываем)
    const au = req.headers.get("authorization") || "";
    const ur = await fetch(SU + "/auth/v1/user", { headers: { Authorization: au, apikey: Deno.env.get("SUPABASE_ANON_KEY") || sk } });
    const u0 = ur.ok ? await ur.json() : null; if (!u0 || !u0.id) return ok({ error: "auth" }, 401);
    const gk = Deno.env.get("GEMINI_API_KEY"); if (!gk) return ok({ error: "GEMINI_API_KEY не задан" });
    const out: any[] = [];
    for (const model of [Deno.env.get("GEMINI_MODEL") || "", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"].filter((m) => m)) {
      for (const [ep, body] of [["interactions", { model, input: [{ type: "text", text: "Скажи: ок" }] }], [`models/${model}:generateContent`, { contents: [{ parts: [{ text: "Скажи: ок" }] }] }]] as any[]) {
        try { const r = await fetch("https://generativelanguage.googleapis.com/v1beta/" + ep, { method: "POST", headers: { "x-goog-api-key": gk, "content-type": "application/json" }, body: JSON.stringify(body) }); const t = await r.text(); out.push({ model, ep: ep.split("/")[0], status: r.status, body: t.slice(0, 350) }); } catch (e) { out.push({ model, ep, err: String(e).slice(0, 200) }); }
      }
    }
    try { const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", { headers: { "x-goog-api-key": gk } }); const j = await r.json().catch(() => ({})); out.push({ list: r.status, names: (j.models || []).map((m: any) => String(m.name).replace("models/", "")).filter((n: string) => /flash|pro/.test(n)).slice(0, 40), err: j.error?.message?.slice(0, 200) }); } catch (e) { out.push({ list_err: String(e).slice(0, 200) }); }
    return ok({ diag: out });
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
      const nmm = /^(?:новая\s+|запиши\s+|добавь\s+)?(?:заметк[ауие]|мысль)[,:]?\s*(.+)$/i.exec(tx.trim());
      if (nmm) return { intent: "note", text: nmm[1].trim() };
      const jm = /^(?:в\s+)?журнал[,:]?\s*(.+)$/i.exec(tx.trim());
      if (jm) {
        let rest = jm[1], mins = 0;
        const dm = /(?:(\d+(?:[.,]\d+)?|полтора|пол|один|одну|два|две|три|четыре|пять)\s*)?(часа|часов|час|ч|минут[ы]?|мин)(?![а-яё])/i.exec(rest) || /(полчаса)/i.exec(rest);
        const W: Record<string, number> = { один: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, полтора: 1.5, пол: 0.5 };
        if (dm) {
          if (/полчаса/i.test(dm[0])) mins = 30;
          else { const n = dm[1] ? (W[dm[1].toLowerCase()] ?? parseFloat(dm[1].replace(",", "."))) : 1; mins = Math.round(n * (/^ч/i.test(dm[2]) ? 60 : 1)); }
          rest = rest.replace(dm[0], "");
        }
        const title = rest.replace(/^[\s,.:—-]+|[\s,.:—-]+$/g, "").replace(/\s{2,}/g, " ");
        return { intent: "journal", title: title ? title[0].toUpperCase() + title.slice(1) : "", minutes: mins };
      }
      let m2: RegExpExecArray | null;
      if ((m2 = /^(?:позвони|набери|вызови|звони)\s+(?:пожалуйста\s+)?(.+)$/i.exec(tx.trim()))) return { intent: "call", name: m2[1].replace(/\s+на\s+(мобильный|рабочий|домашний)$/i, "").trim() };
      if ((m2 = /^(?:напиши|отправь|пошли)\s+в\s+(?:телеграм+|телегу|тг)\s+(.+?)(?:\s*[:,—]\s*|\s+что\s+)(.+)$/i.exec(tx.trim())) || (m2 = /^(?:напиши|отправь|пошли)\s+(.+?)\s+в\s+(?:телеграм+|телегу|тг)(?:\s*[:,—]\s*|\s+что\s+|\s+)(.+)$/i.exec(tx.trim())) || (m2 = /^(?:передай|скажи)\s+(.+?)(?:\s*[:,—]\s*|\s+что\s+)(.+)$/i.exec(tx.trim()))) return { intent: "tg", name: m2[1].trim(), text: m2[2].trim().replace(/^./, (c) => c.toUpperCase()) };
      if ((m2 = /^(?:напиши|отправь\s+(?:сообщение|смс)|смс)\s+(.+?)(?:\s*[:,—]\s*|\s+что\s+)(.+)$/i.exec(tx.trim()))) return { intent: "sms", name: m2[1].trim(), text: m2[2].trim().replace(/^./, (c) => c.toUpperCase()) };
      if ((m2 = /^(?:поставь\s+)?таймер(?:\s+на)?\s+(.+)$/i.exec(tx.trim())) && durMin(m2[1])) return { intent: "timer", minutes: durMin(m2[1]), title: "Таймер" };
      if ((m2 = /^напомни(?:\s+мне)?\s+через\s+((?:\d+(?:[.,]\d+)?\s*|[а-яё]+\s+)?(?:часа|часов|час|минут[ыу]?|мин)(?![а-яё])|полчаса)\s*[,:]?\s*(.*)$/i.exec(tx.trim())) && durMin(m2[1])) return { intent: "timer", minutes: durMin(m2[1]), title: (m2[2] || "Напоминание").trim().replace(/^./, (c) => c.toUpperCase()) };
      if ((m2 = /^(?:спроси(?:\s+у\s+(?:ии|нейронки))?|вопрос(?:\s+к\s+ии)?|расскажи|объясни|подскажи)[,:]?\s+(.{3,})$/i.exec(tx.trim()))) return { intent: "ask", text: m2[1].trim() };
      if (/^(съел[аи]?|поел[аи]?|выпил[аи]?|перекусил[аи]?|позавтракал[аи]?|пообедал[аи]?|поужинал[аи]?|на (завтрак|обед|ужин|перекус)|в питание|добавь в питание)(?![а-яё])/i.test(tx.trim())) return { intent: "food", text: tx.trim() };
      if (/(сколько|что).*(калори|ккал|белк|съел)|итоги питания|питание за сегодня/i.test(tx)) return { intent: "foodsum" };
      if (/напомин/.test(t) && /(есть|какие|какой|сколько|во сколько|когда|скажи|прочита|что)/.test(t) && !/^(напомни|поставь|добавь)/.test(t.trim())) return { intent: "reminders", day: /завтра/.test(t) ? "tomorrow" : "today" };
      return /который час|сколько времени|какое число|какой день/.test(t) ? { intent: "time" } : /погод/.test(t) ? { intent: "weather", day: /завтра/.test(t) ? "tomorrow" : "today" } : /ближайш|что на сегодня|что у меня|какие дела|что по делам/.test(t) ? { intent: "read_today" } : /что дальше|следующ.* напоминан|ближайш.* напоминан/.test(t) ? { intent: "read_next" } : /сколько дел/.test(t) ? { intent: "count" } : /^(готово|сделал|сделано|выполнено|выполнил)/.test(t) ? { intent: "done", target: "last" } : /^отложи/.test(t) ? { intent: "snooze", target: "last", minutes: /полчаса|30 минут/.test(t) ? 30 : /2 часа|два часа/.test(t) ? 120 : 60 } : /перенеси.*завтра|на завтра$/.test(t) && /^перенеси/.test(t) ? { intent: "tomorrow", target: "last" } : /^(отмена|отмени|удали последн)/.test(t) ? { intent: "undo" } : /что (ты )?умеешь|^помощь|какие команды/.test(t) ? { intent: "help" } : { intent: "add", title: tx.replace(/^(запиши|запись|добавь|новая задача)[,:]?\s*/i, "") };
    };
    const hasTimeWords = /завтра|сегодня|послезавтра|через|понедельник|вторник|сред[ауы]|четверг|пятниц|суббот|воскресень|утром|вечером|днём|днем|ночью|\d{1,2}[:.]\d{2}|\bв \d|\d+ (час|минут|дн|недел)/i.test(text);
    // быстрый разбор типовых сроков правилами (без ИИ): завтра / в 17:30 / в 5 вечера / через 2 часа / в понедельник / через 3 дня; сомнительное -> null (тогда ИИ)
    const parseWhen = (tx: string): { title: string; due: string | null; remind: string | null } | null => {
      let s = " " + tx.trim() + " ", due: string | null = null, remind: string | null = null, found = false, m: RegExpExecArray | null;
      const NUM: Record<string, number> = { один: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12 };
      const cut = (r: RegExpExecArray) => { s = s.replace(r[0], " "); found = true; };
      const dstr = (off: number) => ymdz(nowMs + off * 864e5);
      if ((m = /\sчерез\s+((?:\d+(?:[.,]\d+)?\s*|[а-яё]+\s+)?(?:часа|часов|час|минут[ыу]?|мин)(?![а-яё])|полчаса)/i.exec(s)) && (/полчаса/i.test(m[1]) || durMin(m[1]))) {
        const mins = /полчаса/i.test(m[1]) ? 30 : durMin(m[1]), t = nowMs + mins * 60000; remind = ymdz(t) + " " + hm(t); cut(m);
      } else if ((m = /\sчерез\s+(\d+|[а-яё]+)\s+(дн(?:я|ей)|день|недел[юиь])(?![а-яё])/i.exec(s))) {
        const n = /^\d+$/.test(m[1]) ? +m[1] : NUM[m[1].toLowerCase()]; if (!n) return null; due = dstr(/^недел/i.test(m[2]) ? n * 7 : n); cut(m);
      } else {
        let off: number | null = null;
        if ((m = /\s(послезавтра|завтра|сегодня)(?![а-яё])/i.exec(s))) { off = /^после/i.test(m[1]) ? 2 : /^завтра/i.test(m[1]) ? 1 : 0; cut(m); }
        else if ((m = /\s(?:(?:в|во|на)\s+)?(понедельник|вторник|сред[уа]|четверг|пятниц[уа]|суббот[уа]|воскресенье)(?![а-яё])/i.exec(s))) {
          const idx = ["воскресенье", "понедельник", "вторник", "сред", "четверг", "пятниц", "суббот"].findIndex((w) => m![1].toLowerCase().startsWith(w));
          off = (idx - loc.getUTCDay() + 7) % 7 || 7; cut(m);
        }
        let h = -1, mi = 0;
        if ((m = /\s(?:в|к)\s+(\d{1,2})[:.](\d{2})(?!\d)(?:\s*(утра|вечера|дня|ночи))?/i.exec(s))) { h = +m[1]; mi = +m[2]; const sf = (m[3] || "").toLowerCase(); if ((sf === "вечера" || sf === "дня") && h < 12) h += 12; cut(m); }
        else if ((m = /\s(?:в|к)\s+(\d{1,2}|один|два|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать)(?:\s+час(?:а|ов)?)?\s+(утра|вечера|дня|ночи)(?![а-яё])/i.exec(s)) || (m = /\s(?:в|к)\s+(\d{1,2}|один|два|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать)\s+час(?:а|ов)?(?![а-яё])/i.exec(s))) {
          const n = /^\d+$/.test(m[1]) ? +m[1] : NUM[m[1].toLowerCase()], sf = (m[2] || "").toLowerCase(); if (n == null || n > 23) return null;
          h = n; if ((sf === "вечера" || sf === "дня") && n < 12) h = n + 12; else if (sf === "ночи" && n === 12) h = 0; else if (!sf && n >= 1 && n <= 7) return null; cut(m);
        }
        if (h >= 0) {
          if (h > 23 || mi > 59) return null;
          const base0 = off != null ? off : (h * 60 + mi <= loc.getUTCHours() * 60 + loc.getUTCMinutes() ? 1 : 0);
          remind = dstr(base0) + " " + pad(h) + ":" + pad(mi);
        } else if (off != null) due = dstr(off);
      }
      if (!found) return null;
      if (/\sчерез\s|утром|вечером|днём|днем|ночью|\sв\s+\d|завтра|сегодня|послезавтра|понедельник|вторник|\sсред[ау]|четверг|пятниц|суббот|воскресень|\d[:.]\d\d/i.test(s)) return null;
      const title = s.replace(/^\s*(?:пожалуйста[,\s]*)?(?:запиши|добавь|создай\s+задачу|поставь\s+задачу|напомни(?:\s+мне)?)[,:\s]*(?:что\s+|о\s+том,?\s+что\s+)?/i, " ").replace(/\s+(?:на|в|к|во)\s*$/i, "").replace(/^[\s,.:—-]+|[\s,.:—-]+$/g, "").replace(/\s{2,}/g, " ");
      if (title.length < 2) return null;
      return { title: title[0].toUpperCase() + title.slice(1), due, remind };
    };
    let I: any = rulesOf(text); let needAI = I.intent === "add" && hasTimeWords;
    if (needAI) { const pw = parseWhen(text); if (pw) { I = { intent: "add", title: pw.title, due: pw.due, remind: pw.remind }; needAI = false; } }   // ИИ нужен только для разбора срока/времени
    if (needAI) I = null;
    let GSYS = "", GBODY = "";
    try {
      const key = needAI ? Deno.env.get("GEMINI_API_KEY") : "";
      if (needAI) {
        GSYS = `Ты разбираешь голосовую команду владельца личного списка дел. Сейчас ${loc.toISOString().slice(0, 16).replace("T", " ")} (${WD[loc.getUTCDay()]}), часовой пояс +7. Ответь ТОЛЬКО JSON без пояснений: {"intent":"add|journal|reminders|read_today|read_next|count|done|snooze|tomorrow|undo|time|weather|help","title":"текст дела (для add) без слов про срок и без слов-команд, с заглавной буквы","due":"YYYY-MM-DD или null","remind":"YYYY-MM-DD HH:MM или null","target":"last или id задачи из списка или null","minutes":число или null,"day":"today|tomorrow|null"}. Правила: add — любая фраза, похожая на новое дело/поручение/«запиши…/напомни…» (если названо время «в 15:00» — remind; «завтра» — due). reminders — вопрос про напоминания на день: есть ли напоминания сегодня/завтра, какие и во сколько (day today|tomorrow); read_today — что на сегодня/ближайшие дела/что у меня; read_next — какое следующее напоминание/что дальше; count — сколько дел; done — «готово/сделал/выполнено» (target last или id); snooze — «отложи/напомни позже» (minutes, по умолчанию 60); tomorrow — «перенеси на завтра»; undo — «отмена/удали последнее»; time — который час/какое число; weather — погода (day); help — «что ты умеешь/помощь». Если сомневаешься — add с полным текстом.`;
        GBODY = "Фраза: " + text + "\nПоследняя задача из разговора: " + (last ? last.id + " | " + last.title : "нет") + "\nОткрытые задачи (id | название | срок | напоминание):\n" + open.slice(0, 60).map((t) => t.id + " | " + t.title + " | " + (t.due || "") + " | " + (t.remind_at ? new Date(Date.parse(t.remind_at) + TZ).toISOString().slice(0, 16).replace("T", " ") : "")).join("\n");
      }
      if (needAI && !I) {   // быстрый Groq первым
        const gk = Deno.env.get("GROQ_API_KEY");
        if (gk) { const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + gk, "content-type": "application/json" }, body: JSON.stringify({ model: "llama-3.3-70b-versatile", temperature: 0, messages: [{ role: "user", content: GSYS + "\n\n" + GBODY }] }), signal: AbortSignal.timeout(7000) });
          if (r.ok) { const j = await r.json().catch(() => ({})); const m = /\{[\s\S]*\}/.exec(j?.choices?.[0]?.message?.content || ""); if (m) { try { I = JSON.parse(m[0]); } catch { /* правила */ } } } }
      }
      if (needAI && !I && key) {   // Groq не вышел — Gemini
        for (const model of [Deno.env.get("GEMINI_MODEL"), "gemini-3.8-flash"].filter((m) => m) as string[]) {
          const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify({ model, input: [{ type: "text", text: GSYS + "\n\n" + GBODY }] }), signal: AbortSignal.timeout(6000) });
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
      case "reminders": {
        const dy = I.day === "tomorrow" ? tomorrow : today, nm2 = dy === today ? "сегодня" : "завтра";
        const rs = open.filter((t) => t.remind_at && ymdz(Date.parse(t.remind_at)) === dy).sort((x, y) => Date.parse(x.remind_at) - Date.parse(y.remind_at));
        if (!rs.length) return done("На " + nm2 + " напоминаний нет.");
        const left = dy === today ? rs.filter((t) => Date.parse(t.remind_at) > nowMs) : rs, pass = rs.length - left.length;
        if (!left.length) return done("На сегодня напоминаний больше нет, все " + rs.length + " уже прошли.");
        const sh = left.slice(0, 6);
        return done((dy === today ? "Сегодня осталось " : "Завтра ") + left.length + " " + nm(left.length, "напоминание", "напоминания", "напоминаний") + (pass ? " (ещё " + pass + " уже прошло)" : "") + ". " + sh.map((t) => "В " + hm(Date.parse(t.remind_at)) + " — " + t.title + ".").join(" ") + (left.length > sh.length ? " И ещё " + (left.length - sh.length) + "." : ""), { id: sh[0].id, title: sh[0].title });
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
      case "note": {
        const t = String(I.text || "").trim().slice(0, 4000);
        if (!t) return done("Не расслышал, что записать в заметки.");
        const tg = [...new Set((t.match(/(?:^|\s)#([\p{L}\d_-]{2,30})/gu) || []).map((x) => x.trim().slice(1).toLowerCase()))];
        if (!tg.length) { try { const er = await fetch(base + "notes?select=tags&user_id=eq." + uid + "&order=created_at.desc&limit=150", { headers: hd }); const ej: any[] = er.ok ? await er.json() : []; tg.push(...await suggestTags(t, ej.flatMap((x) => x.tags || []))); } catch { /* без тегов */ } }
        const nr = await fetch(base + "notes", { method: "POST", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify({ id: crypto.randomUUID(), user_id: uid, text: t[0].toUpperCase() + t.slice(1), tags: tg }) });
        if (!nr.ok) return done("Не получилось записать заметку.");
        return done("Записал в заметки.");
      }
      case "journal": {
        const mn = Math.round(Number(I.minutes) || 0), ttl = String(I.title || "").trim().slice(0, 500);
        if (!ttl) return done("Не расслышал, что записать в журнал.");
        if (mn < 1 || mn > 600) return done("Не понял длительность. Скажи, например: в журнал, расчёт щита, сорок минут.");
        const en = Date.now(), row: any = { id: crypto.randomUUID(), user_id: uid, title: ttl, note: "", kind: "t", start_at: new Date(en - mn * 60e3).toISOString(), end_at: new Date(en).toISOString() };
        const jr = await fetch(base + "time_log", { method: "POST", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify(row) });
        if (!jr.ok) return done("Не получилось записать в журнал.");
        const h = Math.floor(mn / 60), m = mn % 60;
        return done("В журнале: " + ttl + ", " + (h ? h + " " + nm(h, "час", "часа", "часов") + (m ? " " : "") : "") + (m ? m + " " + nm(m, "минута", "минуты", "минут") : "") + ".");
      }
      case "ask": {
        const out = await askAI("Ты голосовой помощник инженера-электрика. Отвечай по-русски очень кратко: одно-два предложения, не длиннее 200 символов, без списков, markdown, скобок и эмодзи. Числа и единицы пиши так, как их произносят вслух (например, «тридцать три ампера», «двадцать два киловатта»). Если для ответа нужен точный расчёт по нормам или ты не уверен, скажи об этом одной фразой. Не давай медицинских, юридических и финансовых рекомендаций.", String(I.text || text));
        if (!out) return done("Сейчас не получилось спросить у ИИ.");
        let ans = out.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim();
        if (ans.length > 240) { const cut = ans.slice(0, 240), k = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? ")); ans = k > 80 ? cut.slice(0, k + 1) : cut.replace(/\s+\S*$/, "") + "."; }
        return done(ans);
      }
      case "tg": {   // сообщение сотруднику через Telegram-бота: находим подтверждённого человека по имени, дальше телефон спрашивает «Отправить?» и зовёт a=tgsend
        const ppr = await fetch(base + "tg_people?select=id,alias&user_id=eq." + uid + "&approved=eq.true", { headers: hd }), ppl: any[] = ppr.ok ? await ppr.json() : [];
        const stem = (w: string) => { w = w.toLowerCase().replace(/ё/g, "е"); return w.length > 5 ? w.slice(0, -2) : w.length > 3 ? w.slice(0, -1) : w; };
        const tk = String(I.name || "").toLowerCase().replace(/[^а-яa-z0-9ё ]/g, " ").trim().split(/\s+/).filter(Boolean);
        const hit = ppl.filter((p) => tk.length && tk.every((t) => String(p.alias || "").toLowerCase().replace(/ё/g, "е").split(/\s+/).some((w: string) => w.startsWith(stem(t)))));
        if (!ppl.length) return done("Пока никто не подключён к боту. Пусть сотрудники нажмут «Старт» у бота.");
        if (hit.length !== 1) return done(hit.length ? "Подходит несколько: " + hit.map((p) => p.alias).join(", ") + ". Назовите точнее." : "Не нашёл в Telegram: " + I.name + ".");
        return ok({ intent: "tg", pid: hit[0].id, name: hit[0].alias, text: String(I.text || "").slice(0, 1000), speak: "" });
      }
      case "call": case "sms": return ok({ intent: I.intent, name: String(I.name || "").slice(0, 80), text: String(I.text || "").slice(0, 600), speak: "" });
      case "timer": {
        const mn = Math.round(Number(I.minutes) || 0); if (mn < 1 || mn > 1440) return done("Не понял, на сколько поставить.");
        const rem = new Date(nowMs + mn * 60e3).toISOString(), title = String(I.title || "Таймер").slice(0, 200);
        const t = { id: crypto.randomUUID(), user_id: uid, title, list_id: null, due: today, note: "", done: false, parent_id: null, category: null, starred: false, my_day: false, my_day_date: null, steps: [], est_minutes: null, status: "active", remind_at: rem, repeat_rule: null, files: [], plan_start: null, created_at: new Date().toISOString() };
        const r = await fetch(base + "tasks", { method: "POST", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify(t) });
        if (!r.ok) return done("Не получилось поставить таймер.");
        const h = Math.floor(mn / 60), m = mn % 60;
        return done((title === "Таймер" ? "Таймер на " : "Напомню через ") + (h ? h + " " + nm(h, "час", "часа", "часов") + (m ? " " : "") : "") + (m ? m + " " + nm(m, "минуту", "минуты", "минут") : "") + (title === "Таймер" ? "." : ": " + title + "."), { id: t.id, title, added: true });
      }
      case "food": {
        const out = await askAI("Ты диетолог-помощник. По фразе человека оцени, что он съел. Ответь ТОЛЬКО JSON без пояснений и markdown: {\"items\":[{\"name\":\"название с заглавной\",\"grams\":число,\"kcal\":число,\"p\":число,\"f\":число,\"c\":число}]} — значения на всю порцию (kcal ккал, p белки, f жиры, c углеводы в граммах). Если порция не названа, возьми типичную. Не более 8 позиций. Блюда россии учитывай.", "Фраза: " + String(I.text || text));
        const mj = out && /\{[\s\S]*\}/.exec(out); let items: any[] = [];
        try { items = mj ? (JSON.parse(mj[0]).items || []) : []; } catch { items = []; }
        items = items.filter((x) => x && x.name && Number(x.kcal) >= 0).slice(0, 8);
        if (!items.length) return done("Не удалось оценить еду. Повторите или внесите вручную.");
        const rows = items.map((x) => ({ id: crypto.randomUUID(), user_id: uid, day: today, t: hm(nowMs), name: String(x.name).slice(0, 120), grams: Math.round(Number(x.grams) || 0), kcal: Math.round(Number(x.kcal) || 0), p: Math.round((Number(x.p) || 0) * 10) / 10, f: Math.round((Number(x.f) || 0) * 10) / 10, c: Math.round((Number(x.c) || 0) * 10) / 10 }));
        const r = await fetch(base + "food_log", { method: "POST", headers: { ...hd, Prefer: "return=minimal" }, body: JSON.stringify(rows) });
        if (!r.ok) return done("Не получилось записать в питание.");
        const sum = rows.reduce((a, x) => a + x.kcal, 0), sp2 = rows.reduce((a, x) => a + x.p, 0);
        let tot = "";
        try { const tr = await fetch(base + "food_log?select=kcal,p&user_id=eq." + uid + "&day=eq." + today, { headers: hd }); const ta: any[] = tr.ok ? await tr.json() : []; tot = " Всего за сегодня " + Math.round(ta.reduce((a, x) => a + Number(x.kcal), 0)) + " ккал, белка " + Math.round(ta.reduce((a, x) => a + Number(x.p), 0)) + " г."; } catch { /* без итога */ }
        return done("Записал: " + rows.map((x) => x.name.toLowerCase()).join(", ") + ". Это примерно " + sum + " ккал, белка " + Math.round(sp2) + " г." + tot);
      }
      case "foodsum": {
        const tr = await fetch(base + "food_log?select=kcal,p,f,c&user_id=eq." + uid + "&day=eq." + today, { headers: hd }); const ta: any[] = tr.ok ? await tr.json() : [];
        if (!ta.length) return done("Сегодня в питании пока ничего не записано.");
        const S = (k: string) => Math.round(ta.reduce((a, x) => a + Number(x[k]), 0));
        return done("За сегодня " + S("kcal") + " ккал. Белка " + S("p") + " граммов, жиров " + S("f") + ", углеводов " + S("c") + ".");
      }
      case "help": return done("Можно сказать: «заметка …» — записать мысль; «напиши в телеграм Мартынову: …»; спроси и вопрос; съел и что съел; таймер на 20 минут; напомни через час; позвони Ивану; напиши Ивану и текст; в журнал и дело с длительностью; запиши и само дело; ближайшие дела; что дальше; сколько дел; готово; отложи на час; перенеси на завтра; отмена; который час; погода.");
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
  if (a === "tgsend") {   // отправка сообщения сотруднику ботом: {pid, text}
    const tg = Deno.env.get("TG_TOKEN"); if (!tg) return ok({ error: "no_bot" }, 501);
    let b: any = {}; try { b = await req.json(); } catch { /* пусто */ }
    const pid = String(b.pid || ""), text = String(b.text || "").trim().slice(0, 1000);
    if (!/^[0-9a-f-]{36}$/i.test(pid) || !text) return ok({ error: "bad" }, 400);
    const pr = await fetch(base + "tg_people?select=chat_id&id=eq." + pid + "&user_id=eq." + uid + "&approved=eq.true", { headers: hd }), prow = pr.ok ? (await pr.json())[0] : null;
    if (!prow) return ok({ error: "no_person" }, 404);
    const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const r = await fetch("https://api.telegram.org/bot" + tg + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: prow.chat_id, parse_mode: "HTML", text: "💬 <b>Дмитрий:</b>\n" + esc(text) }) });
    return ok({ ok: r.ok }, r.ok ? 200 : 502);
  }
  if (a === "tts") {   // озвучка Яндекс SpeechKit v3: {text, voice, speed} -> {audio: base64 mp3}. Секреты YANDEX_API_KEY, YANDEX_FOLDER_ID
    const yk = Deno.env.get("YANDEX_API_KEY"), yf = Deno.env.get("YANDEX_FOLDER_ID");
    if (!yk || !yf) return ok({ error: "no_keys" }, 501);
    let b: any = {}; try { b = await req.json(); } catch { /* пусто */ }
    const text = String(b.text || "").trim().slice(0, 250); if (!text) return ok({ error: "empty" }, 400);
    const voice = /^[a-z_]{3,20}$/.test(String(b.voice || "")) ? String(b.voice) : "filipp";
    const speed = Math.max(0.6, Math.min(1.6, Number(b.speed) || 1));
    const r = await fetch("https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis", { method: "POST", headers: { Authorization: "Api-Key " + yk, "x-folder-id": yf, "Content-Type": "application/json" },
      body: JSON.stringify({ text, outputAudioSpec: { containerAudio: { containerAudioType: "MP3" } }, loudnessNormalizationType: "LUFS", hints: [{ voice }, { speed }] }) });
    if (!r.ok) return ok({ error: "yandex " + r.status + " " + (await r.text()).slice(0, 200) }, 502);
    const chunks: Uint8Array[] = []; let n = 0;
    for (const line of (await r.text()).split("\n")) {
      if (!line.trim()) continue;
      try { const d = JSON.parse(line)?.result?.audioChunk?.data; if (d) { const bin = atob(d), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); chunks.push(u8); n += u8.length; } } catch { /* пропуск */ }
    }
    if (!n) return ok({ error: "no_audio" }, 502);
    const all = new Uint8Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    let sb = ""; for (let i = 0; i < all.length; i += 0x8000) sb += String.fromCharCode(...all.subarray(i, i + 0x8000));
    return ok({ audio: btoa(sb) });
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
