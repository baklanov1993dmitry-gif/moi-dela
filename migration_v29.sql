-- Здоровье: личный дневник симптомов, лекарств, болезней, визитов (виден только владельцу)
create table if not exists public.health_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'sym',          -- sym | med | ill | doc | test | mood
  name text not null default '',
  note text,
  sev int,                                   -- 1..5 (симптом / самочувствие)
  at timestamptz not null default now(),     -- когда (для болезни — начало)
  until timestamptz,                         -- конец болезни (null = идёт)
  ep_id uuid,                                -- к какой болезни относится запись
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists health_user_at on public.health_log (user_id, at desc);
alter table public.health_log enable row level security;
drop policy if exists "own rows" on public.health_log;
create policy "own rows" on public.health_log for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists touch on public.health_log;
create trigger touch before update on public.health_log for each row execute function public.touch_updated_at();
notify pgrst, 'reload schema';
