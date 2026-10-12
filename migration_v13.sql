-- migration_v13: очередь выполнения задач
alter table public.tasks add column if not exists ord integer;
