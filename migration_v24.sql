-- v24: серверные пуши для вопроса «Все ли внесено в записную книжку?» (доходит, даже если браузер свёрнут).
-- Выполнить в Supabase → SQL Editor один раз. Ничего не удаляет.
alter table public.nudge_rules add column if not exists tz int not null default 7;   -- смещение часового пояса сотрудника от UTC (Новосибирск = 7)
create table if not exists public.nudge_push (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null,                       -- 'ГГГГ-ММ-ДД ЧЧ:ММ'
  n int not null default 1,                 -- сколько пушей отправлено по этому слоту (макс. 3)
  last_at timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.nudge_push enable row level security;   -- без политик: пишет только сервер (service key)
-- чтобы руководитель видел, у кого подключены пуши
create or replace function public.team_push_users() returns setof uuid
language sql security definer set search_path = public as $$
  select distinct user_id from public.push_subs where (auth.jwt() ->> 'email') = 'baklanov-dmitry@mail.ru';
$$;
grant execute on function public.team_push_users() to authenticated;
