-- Журнал: разрешить записи «за период» без времени (выполнить один раз в Supabase → SQL Editor → Run)
alter table public.time_log alter column start_at drop not null;
alter table public.time_log alter column end_at drop not null;
