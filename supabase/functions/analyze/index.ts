// Supabase Edge Function: ИИ-разбор для «Мои дела». Секрет: ANTHROPIC_API_KEY
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SYS: Record<string, string> = {
  journal: "Ты — спокойный коуч по тайм-менеджменту. Тебе дают агрегаты дневника времени за последние недели (минуты по категориям, число дней с записями). Ответь по-русски, кратко (до 150 слов): 1) что бросается в глаза, 2) что изменилось к прошлым неделям, 3) один конкретный совет на следующую неделю. Без воды, без морали, можно немного юмора. Если записей мало — так и скажи.",
  nutrition: "Ты — внимательный нутрициолог-практик. Тебе дают цели (ккал/БЖУ), дневные итоги питания и динамику веса. Цель пользователя — рекомпозиция тела. Ответь по-русски, кратко (до 150 слов): оценка соответствия цели, связь питания с весом, 2–3 конкретных шага. Не ставь диагнозов и не давай медицинских назначений. Если данных мало — скажи.",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "ANTHROPIC_API_KEY не задан" }, 500);
    const { kind, data } = await req.json();
    const sys = SYS[kind];
    if (!sys) return json({ error: "unknown kind" }, 400);
    const body = JSON.stringify(data ?? {});
    if (body.length > 20000) return json({ error: "too large" }, 413);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5",
        max_tokens: 600,
        system: sys,
        messages: [{ role: "user", content: "Данные (JSON):\n" + body }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return json({ error: j?.error?.message || "api error" }, 502);
    const text = (j.content || []).map((c: { text?: string }) => c.text || "").join("").trim();
    return json({ text });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
