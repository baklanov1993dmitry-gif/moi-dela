// Supabase Edge Function: ИИ-разбор для «Мои дела». Секрет: GEMINI_API_KEY
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SYS: Record<string, string> = {
  journal: "Ты — спокойный коуч по тайм-менеджменту. Тебе дают агрегаты дневника времени за последние недели (минуты по категориям, число дней с записями). Ответь по-русски, кратко (до 150 слов): 1) что бросается в глаза, 2) что изменилось к прошлым неделям, 3) один конкретный совет на следующую неделю. Без воды, без морали, можно немного юмора. Если записей мало — так и скажи.",
  nutrition: "Ты — внимательный нутрициолог-практик. Тебе дают цели (ккал/БЖУ), дневные итоги питания и динамику веса. Цель пользователя — рекомпозиция тела. Ответь по-русски, кратко (до 150 слов): оценка соответствия цели, связь питания с весом, 2–3 конкретных шага. Не ставь диагнозов и не давай медицинских назначений. Если данных мало — скажи.",
  food: "Ты помогаешь заполнить дневник питания. По названию блюда/продукта найди в интернете (российские сайты калорийности, этикетки, справочники) типичные значения на 100 г. Ответь ТОЛЬКО одним JSON без пояснений и markdown: {\"name\":\"короткое название\",\"kcal\":число,\"protein\":число,\"fat\":число,\"carbs\":число,\"portion_name\":\"необязательно, например шт.\",\"portion_g\":число или null,\"note\":\"1 короткая фраза: на чём основана оценка, диапазон\"}. Если источники расходятся — бери середину диапазона. Если блюда нет — оцени по составу и скажи об этом в note.",
};
SYS.markup = "Ты размечаешь записи дневника времени. Вход JSON: tags — темы, которые пользователь уже использует (по убыванию частоты); examples — записи, которые он уже разметил сам: {t — текст, c — темы через запятую, v — оценка: u полезное, n нейтральное, x бесполезное}; items — новые записи {i, t — текст, m — минуты или null}. Для каждой новой записи предложи 1–3 темы и оценку v в стиле его примеров. Темы бери из tags; новую тему придумывай, только если ни одна не подходит (1–2 слова, строчными). Ответь ТОЛЬКО JSON-массивом вида [{\"i\":0,\"c\":\"тема1, тема2\",\"v\":\"u\"}] — без пояснений и без markdown.";
SYS.categorize = "Ты раскладываешь записи дневника времени по категориям. Тебе дают JSON: cats — уже существующие категории пользователя (по убыванию частоты), items — записи {i, t (текст), m (минуты или null)}. Для каждой записи выбери ОДНУ категорию из cats; новую (1–2 слова, строчными) заводи только если ни одна не подходит. Если запись про несколько дел — бери то, что заняло больше времени/названо первым. Ответь ТОЛЬКО JSON-массивом без пояснений и markdown: [{\"i\":0,\"c\":\"категория\"}, ...] — по элементу на каждую запись.";
SYS.nutrition_report = `Ты — клинически мыслящий нутрициолог-аналитик. Тебе дают JSON с дневником питания пользователя за период: профиль, цели, средние за день с записями, дневные итоги (kcal, p, f, c), список продуктов (foods_cols: название, граммы за период, ккал, Б, Ж, У, число записей, число дней). Микронутриенты, клетчатка, сахар и соль НЕ записывались — оценивай их по названиям продуктов и объёмам (приблизительно, помечай это).
Опирайся на: ВОЗ (свободные сахара <10% ккал, насыщенные жиры <10%, соль <5 г, клетчатка ≥25–30 г, овощи/фрукты ≥400 г), EFSA DRV 2017 (клетчатка 25 г, белок 0,83 г/кг минимум, жиры 20–35%, углеводы 45–60%), Методические рекомендации Минздрава РФ МР 2.3.1.0253-21 (нормы потребления), для активных/похудения — позиция ISSN/ACSM по белку 1,4–2,2 г/кг; рекомендации по красному и переработанному мясу (IARC, WCRF: <350–500 г/нед, колбасы минимум), омега-3 (рыба 2 раза в неделю), Ca 1000 мг, Fe 8–18 мг, Mg 310–420 мг, K 3500–4000 мг, vit D, B12, йод.
Формат ответа — markdown, по-русски, дружеский деловой тон, без воды, до ~550 слов:
## Итог — 2–3 предложения и оценка «питание: хорошо / нормально / есть проблемы» с главной причиной.
## Что хорошо — 3–5 пунктов с цифрами из данных.
## Что плохо — пункты с цифрами (калории vs цель, баланс БЖУ в % ккал, разброс по дням, пропущенные дни, доля ультрапереработанного/сладкого/колбас, вода).
## Чего, скорее всего, не хватает — 3–6 нутриентов/групп продуктов (клетчатка, овощи, омега-3, Ca, Fe, K, Mg, D …) с пометкой «оценка по названиям продуктов».
## Чего в избытке — например, насыщенные жиры, сахар, соль, красное/переработанное мясо, калории.
## Что сделать — 3–5 конкретных шагов с продуктами и граммами.
## Опора — 3–5 коротких ссылок на источники (организация, год, тезис), без выдуманных цифр.
Правила: не придумывай то, чего нет в данных; если дней записи мало или данные неполные — скажи это в начале; не ставь диагнозов и не назначай лекарства/добавки в дозах, при тревожных признаках (очень низкие ккал <1200, длительный сильный дефицит) мягко советуй врача/диетолога. Различай факты из данных и оценки.`;

async function groq(sys: string, user: string): Promise<{ text: string; model: string } | null> {
  const k = Deno.env.get("GROQ_API_KEY"); if (!k) return null;
  for (const model of ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + k, "content-type": "application/json" }, body: JSON.stringify({ model, temperature: 0.3, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }) });
      if (!r.ok) continue; const j = await r.json().catch(() => ({})); const t = j?.choices?.[0]?.message?.content; if (t) return { text: String(t).trim(), model };
    } catch { /* следующая */ }
  }
  return null;
}
// Бесплатный разбор питания через Gemini API (тот же GEMINI_API_KEY, что у video)
async function gemini(sys: string, body: string, search = false, label = "Данные (JSON):\n"): Promise<{ text: string; model: string }> {
  const key = Deno.env.get("GEMINI_API_KEY"); if (!key) throw new Error("GEMINI_API_KEY не задан");
  const models = [Deno.env.get("GEMINI_MODEL"), "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"].filter((m, i, a) => m && a.indexOf(m) === i) as string[];
  let j: any = {}, lastErr = "", used = "";
  for (const model of models) {
    const call = (withSearch: boolean) => fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ model, input: [{ type: "text", text: sys + "\n\n" + label + body }], ...(withSearch ? { tools: [{ type: "google_search" }] } : {}) }),
    });
    let r = await call(search);
    if (search && !r.ok && r.status === 400) r = await call(false);   // поиск не принят — отвечаем без него
    j = await r.json().catch(() => ({}));
    if (r.ok) { lastErr = ""; used = model; break; }
    lastErr = (j?.error?.message || "api error " + r.status) + " [" + model + "]";
    if (!/demand|overload|unavailable|try again|not found|no longer|quota|rate|permission|403|503|429|404/i.test(lastErr + r.status)) break;
  }
  if (lastErr) { const g = await groq(sys, label + body); if (g) return g; throw new Error(lastErr); }
  const grab = (o: any, out: string[]) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach((x) => grab(x, out)); return; }
    if (/thought|reason/i.test(String(o.type || ""))) return;
    if (typeof o.text === "string") out.push(o.text);
    for (const k of Object.keys(o)) if (k !== "text" && typeof o[k] === "object") grab(o[k], out);
  };
  const parts: string[] = [], steps = (j.steps || []).filter((x: any) => /model_output|output/i.test(String(x?.type || "")));
  grab(steps.length ? steps : j.outputs ?? j, parts);
  let text = parts.join("\n").trim(); if (!text && typeof j.output_text === "string") text = j.output_text;
  if (!text) throw new Error("пустой ответ: " + JSON.stringify(j).slice(0, 300));
  return { text, model: used };
}
const nice = (m: string) => m.replace(/^gemini-/, "Gemini ").replace(/^llama/, "Groq Llama").replace(/-/g, " ");
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { kind, data } = await req.json();
    const sys = SYS[kind];
    if (!sys) return json({ error: "unknown kind" }, 400);
    const body = JSON.stringify(data ?? {});
    if (body.length > 20000) return json({ error: "too large" }, 413);
    // всё бесплатно через Gemini (Claude API не используется); подпись — какая нейронка ответила
    const g = kind === "food" ? await gemini(sys, String((data ?? {}).query ?? "").slice(0, 200), true, "Продукт/блюдо: ") : await gemini(sys, body);
    const model = nice(g.model), signed = kind === "nutrition" || kind === "nutrition_report" || kind === "journal";
    return json({ text: signed ? g.text + "\n\n— 🤖 " + model : g.text, model });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
