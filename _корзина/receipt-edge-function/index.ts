// Supabase Edge Function: распознавание чека для «Трат». Секрет: ANTHROPIC_API_KEY (тот же, что у analyze)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const SYS = `Ты разбираешь фотографию кассового чека (Россия) для приложения учёта расходов.
Верни данные ТОЛЬКО через инструмент receipt.
Правила:
- items: каждая товарная строка чека. amount — итоговая стоимость этой строки в рублях (цена × количество, уже со скидкой, если скидка указана под товаром — вычти её). Не включай строки «ИТОГ», «НДС», «Сдача», «Наличными/Картой», бонусы и скидки отдельными позициями.
- name: короткое понятное название товара по-русски (без артикулов и сокращений вроде «Мол.пит.» → «Молоко»).
- cat: id категории из списка cats, которая лучше всего подходит позиции. Учитывай магазин и примеры заметок ex (так пользователь обычно называет траты в этой категории). Если ни одна не подходит — пустая строка.
- date: дата покупки YYYY-MM-DD, если видна на чеке; иначе пустая строка.
- total: итоговая сумма чека, если видна.
- note: одна короткая фраза, только если что-то нечитаемо или сумма строк не сходится с итогом.
Если на фото не чек — items пустой массив, в note объясни.`;
const TOOL = {
  name: "receipt",
  description: "Распознанный чек",
  input_schema: {
    type: "object",
    properties: {
      merchant: { type: "string" },
      date: { type: "string" },
      total: { type: "number" },
      items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, amount: { type: "number" }, cat: { type: "string" } }, required: ["name", "amount"] } },
      note: { type: "string" },
    },
    required: ["items"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "ANTHROPIC_API_KEY не задан" }, 500);
    const { image, media, cats, today } = await req.json();
    if (typeof image !== "string" || image.length < 100) return json({ error: "нет изображения" }, 400);
    if (image.length > 6_000_000) return json({ error: "фото слишком большое" }, 413);
    const mt = ["image/jpeg", "image/png", "image/webp"].includes(media) ? media : "image/jpeg";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL_RECEIPT") || "claude-haiku-4-5",
        max_tokens: 2500,
        system: SYS,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "receipt" },
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mt, data: image } },
          { type: "text", text: "Сегодня " + String(today || "").slice(0, 10) + ". cats (JSON): " + JSON.stringify(cats ?? []).slice(0, 12000) },
        ] }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return json({ error: j?.error?.message || "api error" }, 502);
    const tu = (j.content || []).find((c: { type: string }) => c.type === "tool_use");
    if (!tu) return json({ error: "не удалось разобрать чек" }, 502);
    return json(tu.input);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
