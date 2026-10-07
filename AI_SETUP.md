# Подключение ИИ-разбора (5 минут, один раз)

1. https://console.anthropic.com → API Keys → Create Key. Скопируй ключ (sk-ant-…). Нужен положительный баланс (пара долларов хватит на месяцы).
2. Supabase → проект → Edge Functions → Secrets → добавь `ANTHROPIC_API_KEY` = твой ключ.
   (необязательно) `ANTHROPIC_MODEL` — если хочешь другую модель.
3. Edge Functions → Deploy a new function → имя строго `analyze` → вставь содержимое `supabase/functions/analyze/index.ts` → Deploy.
   Проверка JWT оставь включённой (приложение шлёт твой токен).
4. В приложении: Журнал → Итоги недели → «ИИ-разбор» (или Питание → Графики).

5. Для «🤖 Найти через ИИ» в Питании нужен включённый веб-поиск: console.anthropic.com → Settings → Privacy (или Features) → включить Web search. Без него остальной ИИ работает, поиск еды — нет.

Ключ никому не показывай и в чат не вставляй — только в Secrets.
