-- v25: несколько напоминаний у одной задачи. Ближайшее лежит в remind_at, остальные по порядку — в remind_queue (массив ISO-времён).
-- Когда сработало ближайшее, сервер (send-reminders) ставит в remind_at следующее. Ничего не удаляет.
alter table public.tasks add column if not exists remind_queue jsonb not null default '[]'::jsonb;
