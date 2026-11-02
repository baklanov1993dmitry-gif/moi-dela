// «team-notify»: руководитель правит/ставит задачу сотруднику → сотруднику уходит браузерный пуш (Web Push).
// Вызов: POST {user_id, title, body, id} с сессией руководителя (проверяем e-mail). Telegram не используется.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const MANAGER = "baklanov-dmitry@mail.ru";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const out = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const SU = Deno.env.get("SUPABASE_URL")!, sk = Deno.env.get("SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ur = await fetch(SU + "/auth/v1/user", { headers: { Authorization: req.headers.get("authorization") || "", apikey: Deno.env.get("SUPABASE_ANON_KEY") || sk } });
    const u = ur.ok ? await ur.json() : null;
    if (!u || String(u.email || "").toLowerCase() !== MANAGER) return out({ error: "forbidden" }, 403);
    const b = await req.json().catch(() => ({}));
    const uid = String(b.user_id || ""); if (!/^[0-9a-f-]{36}$/i.test(uid)) return out({ error: "bad user" }, 400);
    if (!Deno.env.get("VAPID_PUBLIC") || !Deno.env.get("VAPID_PRIVATE")) return out({ error: "no vapid" }, 500);
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);
    const sb = createClient(SU, sk, { auth: { persistSession: false } });
    const { data: subs } = await sb.from("push_subs").select("endpoint,p256dh,auth").eq("user_id", uid);
    if (!subs || !subs.length) return out({ sent: 0, note: "у сотрудника не включены уведомления" });
    const payload = JSON.stringify({ title: String(b.title || "Руководитель").slice(0, 80), body: String(b.body || "").slice(0, 300), tag: "tm-" + String(b.id || Date.now()).slice(0, 40), id: null });
    let sent = 0; const dead: string[] = [];
    await Promise.all(subs.map(async (s) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high", timeout: 10000 }); sent++; }
      catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) dead.push(s.endpoint); }
    }));
    if (dead.length) await sb.from("push_subs").delete().in("endpoint", dead);
    return out({ sent });
  } catch (e) { return out({ error: String((e as Error).message || e) }, 500); }
});
