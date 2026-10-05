-- Журнал: новые поля в time_log (выполнить один раз в Supabase → SQL Editor → Run)
alter table public.time_log
  add column if not exists cat  text,
  add column if not exists kind text not null default 't',
  add column if not exists d1   date,
  add column if not exists d2   date;
