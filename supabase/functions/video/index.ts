// Supabase Edge Function: «смысл видео» через бесплатный Gemini API (YouTube-ссылка напрямую). Секрет: GEMINI_API_KEY (необязательно GEMINI_MODEL).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const PROMPT = `Ты делаешь подробный конспект видео, чтобы человек мог решить, смотреть ли его, и при этом узнать суть, не смотря. Отвечай по-русски, без воды, но ПОДРОБНО и конкретно (цифры, имена, названия, примеры, аргументы автора). Строго в таком виде:
МИНУТ: <общая длительность видео в минутах, целое число>
**О чём:** 3–4 предложения.
**Подробный конспект:** по ходу видео, разделами. Каждый раздел: [мм:сс] Заголовок — затем 2–5 пунктов с конкретикой.
**Главные выводы:** 5–8 пунктов.
**Спорное и оговорки:** что автор утверждает без доказательств, где возможна предвзятость (если есть).
**Польза:** оценка 1–5, для кого видео и стоит ли тратить время.
**Формат:** можно ли слушать фоном (например, на уборке) или нужно смотреть глазами.`;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "GEMINI_API_KEY не задан" }, 500);
    const { url } = await req.json();
    if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(String(url || ""))) return json({ error: "нужна ссылка на ютуб" }, 400);
    const models = [Deno.env.get("GEMINI_MODEL"), "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"].filter((m, i, a) => m && a.indexOf(m) === i) as string[];
    let j: any = {}, lastErr = "";
    for (const model of models) {   // перегружена или недоступна модель — пробуем следующую
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ model, input: [{ type: "text", text: PROMPT }, { type: "video", uri: String(url).split(/\s/)[0] }] }),
      });
      j = await r.json().catch(() => ({}));
      if (r.ok) { lastErr = ""; break; }
      lastErr = (j?.error?.message || "api error " + r.status) + " [" + model + "]";
      if (!/demand|overload|unavailable|try again|not found|no longer|quota|rate|503|429|404/i.test(lastErr + r.status)) break;
    }
    if (lastErr) return json({ error: lastErr }, 502);
    // схема ответа может меняться: берём текст из шагов model_output, иначе — любой text вне «мыслей»
    const grab = (o: any, out: string[]) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) { o.forEach((x) => grab(x, out)); return; }
      if (/thought|reason/i.test(String(o.type || ""))) return;
      if (typeof o.text === "string") out.push(o.text);
      for (const k of Object.keys(o)) if (k !== "text" && typeof o[k] === "object") grab(o[k], out);
    };
    const parts: string[] = [];
    const steps = (j.steps || []).filter((s: any) => /model_output|output/i.test(String(s?.type || "")));
    grab(steps.length ? steps : j.outputs ?? j, parts);
    let text = parts.join("\n").trim();
    if (!text && typeof j.output_text === "string") text = j.output_text;
    if (!text) return json({ error: "пустой ответ: " + JSON.stringify(j).slice(0, 300) }, 502);
    return json({ text });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
