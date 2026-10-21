-- v23: вопрос сотруднику «Все ли внесено в записную книжку?» (правила ставит руководитель).
-- Выполнить в Supabase → SQL Editor один раз. Ничего не удаляет и не меняет в существующих таблицах.
create table if not exists public.nudge_rules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  times text[] not null default array['11:00','15:00','17:30'],   -- местное время сотрудника, формат HH:MM
  days int[] not null default array[1,2,3,4,5],                   -- 1=пн … 7=вс
  updated_at timestamptz not null default now()
);
create table if not exists public.nudge_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null,                                              -- 'ГГГГ-ММ-ДД ЧЧ:ММ'
  answer text not null check (answer in ('ok','add')),             -- ok = «Да, всё внесено», add = «Сейчас добавлю»
  tasks_today int not null default 0,                              -- сколько задач создано за день к моменту ответа
  created_at timestamptz not null default now()
);
create index if not exists nudge_log_user_idx on public.nudge_log (user_id, created_at desc);
alter table public.nudge_rules enable row level security;
alter table public.nudge_log enable row level security;

drop policy if exists nudge_rules_mgr on public.nudge_rules;
create policy nudge_rules_mgr on public.nudge_rules for all to authenticated
  using ((auth.jwt() ->> 'email') = 'baklanov-dmitry@mail.ru') with check ((auth.jwt() ->> 'email') = 'baklanov-dmitry@mail.ru');
drop policy if exists nudge_rules_own_read on public.nudge_rules;
create policy nudge_rules_own_read on public.nudge_rules for select to authenticated using (auth.uid() = user_id);

drop policy if exists nudge_log_mgr_read on public.nudge_log;
create policy nudge_log_mgr_read on public.nudge_log for select to authenticated using ((auth.jwt() ->> 'email') = 'baklanov-dmitry@mail.ru');
drop policy if exists nudge_log_own on public.nudge_log;
create policy nudge_log_own on public.nudge_log for select to authenticated using (auth.uid() = user_id);
drop policy if exists nudge_log_own_ins on public.nudge_log;
create policy nudge_log_own_ins on public.nudge_log for insert to authenticated with check (auth.uid() = user_id);

-- если у тебя включена 2FA (migration_v22): те же замки и на новые таблицы
do $$
begin
  if to_regprocedure('public.mfa_ok()') is not null then
    execute 'drop policy if exists mfa_guard on public.nudge_rules';
    execute 'create policy mfa_guard on public.nudge_rules as restrictive to authenticated using (public.mfa_ok())';
    execute 'drop policy if exists mfa_guard on public.nudge_log';
    execute 'create policy mfa_guard on public.nudge_log as restrictive to authenticated using (public.mfa_ok())';
  end if;
end $$;
