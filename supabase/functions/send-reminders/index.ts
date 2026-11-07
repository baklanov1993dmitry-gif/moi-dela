// Supabase Edge Function «send-reminders»: раз в минуту (по cron) шлёт пуши о наступивших напоминаниях.
// Запасной канал: Telegram-бот — если заданы секреты TG_TOKEN и TG_CHAT (надёжно доходит, когда Android усыпляет Chrome).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// следующее срабатывание цикличного напоминания строго позже minMs; время суток и день считаем по Новосибирску (UTC+7)
function nextRep(iso: string, rule: string, minMs: number): string | null {
  const OFF = 7 * 3600e3, base = new Date(Date.parse(iso) + OFF); if (isNaN(base.getTime())) return null;
  const dom = base.getUTCDate(); let d = new Date(base.getTime());
  if (!["d", "wd", "w", "m"].includes(rule)) return null;
  for (let i = 0; i < 800 && d.getTime() - OFF <= minMs; i++) {
    if (rule === "m") { const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); d = new Date(Date.UTC(y, m, Math.min(dom, last), d.getUTCHours(), d.getUTCMinutes())); }
    else { d = new Date(d.getTime() + (rule === "w" ? 7 : 1) * 864e5); if (rule === "wd") while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 864e5); }
  }
  return new Date(d.getTime() - OFF).toISOString();
}
Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
      console.log("forbidden: secret mismatch");
      return new Response("forbidden", { status: 403 });
    }
    const miss = ["VAPID_PUBLIC", "VAPID_PRIVATE"].filter((k) => !Deno.env.get(k));
    if (miss.length) {
      console.error("missing secrets: " + miss.join(","));
      return new Response("missing secrets: " + miss.join(","), { status: 500 });
    }
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
      Deno.env.get("VAPID_PUBLIC")!,
      Deno.env.get("VAPID_PRIVATE")!,
    );
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Telegram-вебхук для кнопок и ответа «ок»: проверяем раз в ~10 минут, при расхождении ставим сами
    try {
      const tg0 = Deno.env.get("TG_TOKEN"), tk = Deno.env.get("TRACK_KEY");
      if (tg0 && tk && new Date().getMinutes() % 10 === 0) {
        const want = Deno.env.get("SUPABASE_URL") + "/functions/v1/track?k=" + tk + "&tg=1";
        const gi = await (await fetch("https://api.telegram.org/bot" + tg0 + "/getWebhookInfo")).json();
        if (gi?.result?.url !== want) {
          const sr = await fetch("https://api.telegram.org/bot" + tg0 + "/setWebhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: want, allowed_updates: ["message", "callback_query"] }) });
          console.log("setWebhook " + sr.status);
        }
      }
    } catch (err) { console.error("webhook check " + (err as Error).message); }
    // Принудительный вопрос «Все ли внесено в записную книжку?»: пуш в назначенные слоты (будни), до 3 раз с паузой 10 мин, пока нет ответа
    try {
      const nowN = new Date();
      const { data: rules } = await sb.from("nudge_rules").select("user_id,times,days,tz").eq("enabled", true);
      for (const r of rules ?? []) {
        const loc = new Date(nowN.getTime() + (r.tz ?? 7) * 3600e3), wd = loc.getUTCDay() || 7;
        if (!(r.days ?? [1, 2, 3, 4, 5]).includes(wd)) continue;
        const day = loc.toISOString().slice(0, 10), hm = loc.toISOString().slice(11, 16);
        const slots = (r.times ?? []).filter((t: string) => t <= hm).sort();
        const slot = slots[slots.length - 1]; if (!slot) continue;
        const [h, m] = slot.split(":").map(Number), age = (loc.getUTCHours() * 60 + loc.getUTCMinutes()) - (h * 60 + m);
        if (age > 90) continue;
        const key = day + " " + slot;
        const { data: ans } = await sb.from("nudge_log").select("slot").eq("user_id", r.user_id).eq("answer", "ok").gte("slot", key).like("slot", day + "%").limit(1);
        if (ans && ans.length) continue;
        const { data: ex } = await sb.from("nudge_push").select("n,last_at").eq("user_id", r.user_id).eq("slot", key).maybeSingle();
        if (ex && (ex.n >= 3 || nowN.getTime() - Date.parse(ex.last_at) < 9.5 * 60e3)) continue;
        const { data: ss } = await sb.from("push_subs").select("endpoint,p256dh,auth").eq("user_id", r.user_id);
        if (!ss || !ss.length) continue;
        await sb.from("nudge_push").upsert({ user_id: r.user_id, slot: key, n: (ex?.n ?? 0) + 1, last_at: nowN.toISOString() });
        const pl = JSON.stringify({ title: "📝 Все ли внесено в записную книжку?", body: "Откройте «Мои дела» и ответьте — это займёт 5 секунд.", tag: "ng", ng: 1 });
        for (const s of ss) {
          try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, pl, { TTL: 3600, urgency: "high", timeout: 10000 }); }
          catch (e) { const sc = (e as { statusCode?: number }).statusCode; if (sc === 404 || sc === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint); else console.error("ng push " + (e as Error).message); }
        }
      }
    } catch (err) { console.error("nudge " + (err as Error).message); }
    // Несколько напоминаний у задачи: когда ближайшее (remind_at) отработало 3+ минуты назад, ставим следующее из очереди remind_queue
    try {
      const nowQ = Date.now();
      const { data: qs } = await sb.from("tasks").select("id,remind_at,remind_queue").eq("done", false)
        .lte("remind_at", new Date(nowQ - 3 * 60e3).toISOString()).gt("remind_at", new Date(nowQ - 7 * 864e5).toISOString());
      for (const t of qs ?? []) {
        const q: string[] = Array.isArray(t.remind_queue) ? t.remind_queue : []; if (!q.length) continue;
        const fresh = q.filter((x) => Date.parse(x) > nowQ - 3600e3).sort();
        const next = fresh.shift();
        await sb.from("tasks").update(next ? { remind_at: next, remind_queue: fresh, remind_sent_for: null } : { remind_queue: [] }).eq("id", t.id);
      }
    } catch (err) { console.error("queue " + (err as Error).message); }
    // Циклические напоминания (remind_rep: d | wd | w | m): через 3+ минуты после срабатывания переносим remind_at на следующее время по правилу
    try {
      const nowR = Date.now();
      const { data: rs } = await sb.from("tasks").select("id,remind_at,remind_rep,remind_queue").eq("done", false).not("remind_rep", "is", null)
        .lte("remind_at", new Date(nowR - 3 * 60e3).toISOString()).gt("remind_at", new Date(nowR - 400 * 864e5).toISOString());
      for (const t of rs ?? []) {
        if (Array.isArray(t.remind_queue) && t.remind_queue.length) continue;
        const nx = nextRep(t.remind_at, t.remind_rep, nowR); if (!nx) continue;
        await sb.from("tasks").update({ remind_at: nx, remind_sent_for: null }).eq("id", t.id);
      }
    } catch (err) { console.error("rep " + (err as Error).message); }
    // Календарь Битрикс24 (входящий вебхук B24_WEBHOOK): в будни в 08:00 сводка «сегодня N встреч» и каждые 10 минут проверка новых/перенесённых встреч на 14 дней
    try {
      const hook = Deno.env.get("B24_WEBHOOK"), owner = Deno.env.get("TG_USER") ?? Deno.env.get("TRACK_USER");
      const nl = new Date(Date.now() + 7 * 3600e3), hm = nl.toISOString().slice(11, 16), day = nl.toISOString().slice(0, 10), wdn = nl.getUTCDay();
      const morning = hm >= "08:00" && hm < "08:10" && wdn >= 1 && wdn <= 5;
      if (hook && owner && (morning || nl.getUTCMinutes() % 10 === 5)) {
        const hk = hook.endsWith("/") ? hook : hook + "/";
        const { data: row } = await sb.from("user_settings").select("data").eq("user_id", owner).eq("key", "b24:cal").maybeSingle();
        const st: { uid?: string; morning?: string; seen?: Record<string, string> } = (row?.data as any) || {};
        if (!st.uid) { const ur = await (await fetch(hk + "user.current.json")).json().catch(() => ({})); st.uid = String(ur?.result?.ID || ""); }
        if (st.uid) {
          const to = new Date(nl.getTime() + 14 * 864e5).toISOString().slice(0, 10);
          const er = await (await fetch(hk + "calendar.event.get.json?type=user&ownerId=" + st.uid + "&from=" + day + "&to=" + to)).json().catch(() => ({}));
          const raw: any[] = Array.isArray(er?.result) ? er.result : [];
          const pd = (x: string): string | null => {   // «08.11.2026 09:00:00» или «2026-11-08 09:00:00» -> «2026-11-08 09:00»
            const m1 = /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}:\d{2})/.exec(x || ""), m2 = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(x || "");
            return m1 ? m1[3] + "-" + m1[2] + "-" + m1[1] + " " + m1[4] : m2 ? m2[1] + "-" + m2[2] + "-" + m2[3] + " " + m2[4] : null;
          };
          const evs = raw.filter((e) => e && e.MEETING_STATUS !== "N" && e.DELETED !== "Y").map((e) => ({ id: String(e.ID) + "@" + (pd(e.DATE_FROM) || "").slice(0, 10), name: String(e.NAME || "Событие"), at: pd(e.DATE_FROM) || "", allDay: e.SKIP_TIME === "Y" || e.DT_SKIP_TIME === "Y" })).filter((e) => e.at && e.at.slice(0, 10) >= day).sort((x, y) => x.at.localeCompare(y.at));
          const send = async (title: string, body: string, tag: string) => {
            const { data: ss } = await sb.from("push_subs").select("endpoint,p256dh,auth").eq("user_id", owner);
            const pl = JSON.stringify({ title, body, tag });
            await Promise.all((ss ?? []).map(async (x: { endpoint: string; p256dh: string; auth: string }) => {
              try { await webpush.sendNotification({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, pl, { TTL: 3600, urgency: "normal", timeout: 10000 }); }
              catch (e) { const sc = (e as { statusCode?: number }).statusCode; if (sc === 404 || sc === 410) await sb.from("push_subs").delete().eq("endpoint", x.endpoint); }
            }));
            const tt = Deno.env.get("TG_TOKEN"), tc = Deno.env.get("TG_CHAT");
            if (tt && tc) await fetch("https://api.telegram.org/bot" + tt + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: tc, text: title + "\n" + body }) }).catch(() => {});
          };
          const hhmm = (e: { at: string; allDay: boolean }) => (e.allDay ? "весь день" : e.at.slice(11));
          const dm = (d: string) => d.slice(8, 10) + "." + d.slice(5, 7);
          if (morning && st.morning !== day) {
            const td = evs.filter((e) => e.at.slice(0, 10) === day), n = td.length;
            const word = n % 10 === 1 && n % 100 !== 11 ? "встреча" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "встречи" : "встреч";
            await send(n ? "🗓 Сегодня " + n + " " + word : "🗓 Сегодня встреч нет", n ? td.slice(0, 8).map((e) => hhmm(e) + " " + e.name).join("\n") : "Календарь Битрикс24 свободен", "cal-morning");
            st.morning = day;
          }
          const seen = st.seen || null, ns: Record<string, string> = {};
          for (const e of evs) ns[e.id] = e.at;
          if (seen) for (const e of evs) {
            if (!(e.id in seen)) await send("🗓 Новая встреча", (e.at.slice(0, 10) === day ? "сегодня" : dm(e.at.slice(0, 10))) + " " + hhmm(e) + " · " + e.name, "cal-new-" + e.id.slice(0, 30));
            else if (seen[e.id] !== e.at) await send("🗓 Встреча перенесена", dm(e.at.slice(0, 10)) + " " + hhmm(e) + " · " + e.name, "cal-mv-" + e.id.slice(0, 30));
          }
          st.seen = ns;
          await sb.from("user_settings").upsert({ user_id: owner, key: "b24:cal", data: st, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
        }
      }
    } catch (err) { console.error("b24cal " + (err as Error).message); }
    const now = new Date(), since = new Date(now.getTime() - 24 * 3600e3);
    const { data: tasks, error } = await sb.from("tasks")
      .select("id,user_id,title,remind_at,remind_sent_for,due,list_id,remind_via")
      .eq("done", false)
      .lte("remind_at", now.toISOString())
      .gt("remind_at", since.toISOString());
    if (error) { console.error("tasks: " + error.message); return new Response("tasks: " + error.message, { status: 500 }); }

    const due = (tasks ?? []).filter((t) => t.remind_via !== "alarm").filter((t) => !t.remind_sent_for || Date.parse(t.remind_sent_for) !== Date.parse(t.remind_at));
    console.log("due=" + due.length);
    if (!due.length) return new Response("ok: nothing due");

    const users = [...new Set(due.map((t) => t.user_id))];
    const { data: subs, error: e2 } = await sb.from("push_subs").select("endpoint,p256dh,auth,user_id").in("user_id", users);
    if (e2) { console.error("subs: " + e2.message); return new Response("subs: " + e2.message, { status: 500 }); }

    const tgT = Deno.env.get("TG_TOKEN"), tgC = Deno.env.get("TG_CHAT"), tgOwner = Deno.env.get("TG_USER") ?? Deno.env.get("TRACK_USER");   // Telegram — только задачи владельца бота, чужие напоминания не пересылаем
    let sent = 0;
    const lids = [...new Set(due.map((t) => t.list_id).filter(Boolean))];
    const lname: Record<string, string> = {};
    if (lids.length) { const { data: ls } = await sb.from("lists").select("id,name").in("id", lids); (ls ?? []).forEach((l: { id: string; name: string }) => { lname[l.id] = l.name; }); }
    const ymd = (d: Date) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);   // Новосибирск UTC+7
    const today = ymd(now), tomorrow = ymd(new Date(now.getTime() + 86400e3));
    const info = (t: { due?: string | null; list_id?: string | null }) => {
      const p: string[] = [];
      if (t.list_id && lname[t.list_id]) p.push("📋 " + lname[t.list_id]);
      if (t.due) p.push("⏳ " + (t.due < today ? "просрочено " + t.due.slice(8) + "." + t.due.slice(5, 7) : t.due === today ? "срок сегодня" : t.due === tomorrow ? "срок завтра" : "срок " + t.due.slice(8) + "." + t.due.slice(5, 7)));
      return p.join(" · ");
    };
    const hkey = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("CRON_SECRET") ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sign = async (id: string, a: string) => Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", hkey, new TextEncoder().encode(id + ":" + a)))).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
    const actUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/track";
    const dead: string[] = [], tgItems: typeof due = [], okIds = new Set<string>(), pushOk = new Set<string>();
    for (const t of due) {
      const mine = (subs ?? []).filter((s) => s.user_id === t.user_id);
      const tgMine = !!(tgT && tgC && tgOwner && t.user_id === tgOwner);
      if (!mine.length && !tgMine) { console.log("no subs for task " + t.id); continue; }
      const payload = JSON.stringify({ title: "🔔 Напоминание", body: t.title + (info(t) ? "\n" + info(t) : ""), tag: t.id, id: t.id, u: actUrl, sig: { done: await sign(t.id, "done"), snooze: await sign(t.id, "snooze"), tom: await sign(t.id, "tom") } });
      let ok = false;
      await Promise.all(mine.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high", timeout: 10000 });
          ok = true; sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(s.endpoint);
          console.error("push fail " + code + " " + (err as Error).message);
        }
      }));
      if (ok) pushOk.add(t.id);
      if (tgMine) tgItems.push(t); else if (ok) await sb.from("tasks").update({ remind_sent_for: t.remind_at }).eq("id", t.id);
      else continue;
      okIds.add(t.id);
    }
    if (tgT && tgC && tgItems.length) {   // Telegram: одна карточка с кнопками или аккуратная сводка
      const e = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const cut = (x: string, n: number) => (x.length > n ? x.slice(0, n - 1) + "…" : x);
      let text: string, kb: unknown[][];
      if (tgItems.length === 1) {
        const t = tgItems[0], inf = info(t);
        text = "🔔 <b>" + e(t.title) + "</b>" + (inf ? "\n<i>" + e(inf) + "</i>" : "");
        kb = [[{ text: "✅ Готово", callback_data: "d:" + t.id }, { text: "⏰ +1 час", callback_data: "s:" + t.id }, { text: "🌙 Завтра", callback_data: "t:" + t.id }, { text: "🔕 Отмена", callback_data: "c:" + t.id }]];
      } else {
        text = "🔔 <b>Напоминания · " + tgItems.length + "</b>\n" + tgItems.slice(0, 10).map((t, i) => { const inf = info(t); return "\n" + (i + 1) + ". <b>" + e(t.title) + "</b>" + (inf ? "\n    <i>" + e(inf) + "</i>" : ""); }).join("");
        kb = tgItems.slice(0, 10).map((t, i) => [{ text: "✅ " + (i + 1) + ". " + cut(t.title, 28), callback_data: "d:" + t.id }, { text: "⏰ 1ч", callback_data: "s:" + t.id }, { text: "🔕", callback_data: "c:" + t.id }]);
      }
      try {
        const r = await fetch("https://api.telegram.org/bot" + tgT + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: tgC, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: kb } }) });
        if (r.ok) { sent++; for (const t of tgItems) await sb.from("tasks").update({ remind_sent_for: t.remind_at }).eq("id", t.id); }
        else { console.error("tg fail " + r.status + " " + (await r.text()).slice(0, 200)); for (const t of tgItems) if (pushOk.has(t.id)) await sb.from("tasks").update({ remind_sent_for: t.remind_at }).eq("id", t.id); }
      } catch (err) { console.error("tg err " + (err as Error).message); }
    }
    if (dead.length) await sb.from("push_subs").delete().in("endpoint", dead);
    const res = "ok: due=" + due.length + " sent=" + sent + " dead=" + dead.length;
    console.log(res);
    return new Response(res);
  } catch (e) {
    console.error("crash: " + (e as Error).message);
    return new Response("crash: " + (e as Error).message, { status: 500 });
  }
});
