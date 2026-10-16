// Supabase Edge Function «send-reminders»: раз в минуту (по cron) шлёт пуши о наступивших напоминаниях.
// Запасной канал: Telegram-бот — если заданы секреты TG_TOKEN и TG_CHAT (надёжно доходит, когда Android усыпляет Chrome).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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
    const now = new Date(), since = new Date(now.getTime() - 24 * 3600e3);
    const { data: tasks, error } = await sb.from("tasks")
      .select("id,user_id,title,remind_at,remind_sent_for,due,list_id")
      .eq("done", false)
      .lte("remind_at", now.toISOString())
      .gt("remind_at", since.toISOString());
    if (error) { console.error("tasks: " + error.message); return new Response("tasks: " + error.message, { status: 500 }); }

    const due = (tasks ?? []).filter((t) => !t.remind_sent_for || Date.parse(t.remind_sent_for) !== Date.parse(t.remind_at));
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
        kb = [[{ text: "✅ Готово", callback_data: "d:" + t.id }, { text: "⏰ +1 час", callback_data: "s:" + t.id }, { text: "🌙 Завтра", callback_data: "t:" + t.id }]];
      } else {
        text = "🔔 <b>Напоминания · " + tgItems.length + "</b>\n" + tgItems.slice(0, 10).map((t, i) => { const inf = info(t); return "\n" + (i + 1) + ". <b>" + e(t.title) + "</b>" + (inf ? "\n    <i>" + e(inf) + "</i>" : ""); }).join("");
        kb = tgItems.slice(0, 10).map((t, i) => [{ text: "✅ " + (i + 1) + ". " + cut(t.title, 28), callback_data: "d:" + t.id }, { text: "⏰ 1ч", callback_data: "s:" + t.id }]);
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
