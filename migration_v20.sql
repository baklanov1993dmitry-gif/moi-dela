-- Android-приложение: ключи устройств (доступ нативного кода к задачам без сессии браузера). Выполнить один раз в Supabase → SQL Editor.
create table if not exists public.device_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  key_hash text not null unique,
  name text not null default 'android',
  created_at timestamptz not null default now(),
  last_seen timestamptz
);
alter table public.device_keys enable row level security;   -- политик нет: читает только сервис-ключ функции device
