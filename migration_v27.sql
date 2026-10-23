-- Telegram-контакты для голосовых сообщений («Напиши в телеграм Мартынову: …»)
create table if not exists public.tg_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id bigint not null,
  tg_name text, tg_username text,
  alias text,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, chat_id)
);
alter table public.tg_people enable row level security;   -- политик нет: читает/пишет только сервер (service role)
notify pgrst, 'reload schema';
