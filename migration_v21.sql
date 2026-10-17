-- Способ напоминания: NULL = Telegram (по умолчанию), 'alarm' = будильник на телефоне, 'both' = и то и другое. Выполнить один раз в Supabase → SQL Editor.
alter table public.tasks add column if not exists remind_via text;
