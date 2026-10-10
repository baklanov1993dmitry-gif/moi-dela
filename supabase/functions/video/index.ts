// Supabase Edge Function: «смысл видео» через бесплатный Gemini API (YouTube-ссылка напрямую). Секрет: GEMINI_API_KEY (необязательно GEMINI_MODEL).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const PROMPT = `Ты помогаешь решить, стоит ли тратить время на это видео. Ответь по-русски, кратко и по делу, строго в таком виде:
**О чём:** 2–3 предложения.
**Главное:** 5–7 коротких пунктов с ключевыми мыслями/фактами (без воды).
**Польза:** оценка от 1 до 5 и одна фраза — чем полезно или почему пустое.
**Формат:** можно ли слушать фоном (например, во время уборки) или нужно смотреть глазами; примерная длительность.`;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "GEMINI_API_KEY не задан" }, 500);
    const { url } = await req.json();
    if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(String(url || ""))) return json({ error: "нужна ссылка на ютуб" }, 400);
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ file_data: { file_uri: String(url).split(/\s/)[0] } }, { text: PROMPT }] }] }),
    });
    const j = await r.json();
    if (!r.ok) return json({ error: j?.error?.message || "api error " + r.status }, 502);
    const text = (j.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("").trim();
    return json({ text: text || "Пустой ответ (возможно, видео недоступно или приватное)" });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
