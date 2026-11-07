// Supabase Edge Function: распознавание фото кассового чека для «Трат». Секрет: GEMINI_API_KEY (тот же, что у analyze)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PROMPT = `Это фото бумажного кассового чека (Россия). Прочитай его и верни ТОЛЬКО JSON без пояснений:
{"merchant":"название магазина/сети (например Ярче, Ашан), не юрлицо","date":"YYYY-MM-DD","total":число,"items":[{"name":"название как на чеке, без значков [М]","qty":число,"price":число,"amount":число}]}
Правила: qty — количество или вес (для весового 0.436), price — цена за единицу, amount — сумма по строке. Это три разных числа с чека в формате «qty*price=amount»; ничего не вычисляй и не подгоняй, переписывай как напечатано. НДС, итоги налогов, данные карты, QR, адреса не включай в items. total — строка «ИТОГ». Если цифра не читается — всё равно дай лучшее предположение. Дату бери из строки вида 07.11.26 20:37 (год двузначный = 20ХХ).`;
const MODELS = ["gemini-3.5-flash-lite", Deno.env.get("GEMINI_MODEL"), "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.1-flash-lite"].filter((m, i, a) => m && a.indexOf(m) === i) as string[];
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const key = Deno.env.get("GEMINI_API_KEY"); if (!key) return json({ error: "GEMINI_API_KEY не задан" }, 500);
    const { image, mime } = await req.json();
    if (typeof image !== "string" || image.length < 1000) return json({ error: "нет изображения" }, 400);
    if (image.length > 6_000_000) return json({ error: "фото слишком большое" }, 413);
    let lastErr = "";
    for (const model of MODELS) {
      try {
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
          method: "POST", signal: AbortSignal.timeout(30000), headers: { "x-goog-api-key": key, "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime || "image/jpeg", data: image } }] }],
            generationConfig: { temperature: 0, responseMimeType: "application/json" },
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { lastErr = (j?.error?.message || "api " + r.status) + " [" + model + "]"; continue; }
        const text = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("").trim();
        const m = /\{[\s\S]*\}/.exec(text); if (!m) { lastErr = "нет JSON [" + model + "]"; continue; }
        const d = JSON.parse(m[0]);
        if (!Array.isArray(d.items)) { lastErr = "нет позиций [" + model + "]"; continue; }
        return json({ receipt: d, model });
      } catch (e) { lastErr = String(e).slice(0, 120) + " [" + model + "]"; }
    }
    return json({ error: lastErr || "нет ответа" }, 502);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
