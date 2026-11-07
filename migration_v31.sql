-- v31: циклические напоминания. Правило: d (каждый день) | wd (по будням) | w (каждую неделю) | m (каждый месяц)
alter table public.tasks add column if not exists remind_rep text;
