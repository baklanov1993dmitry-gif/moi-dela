-- Журнал: оценка ценности записи (u=полезное, n=нейтральное, x=бесполезное). Supabase → SQL Editor → Run
alter table public.time_log add column if not exists val text;
