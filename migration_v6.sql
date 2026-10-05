-- Питание: таблицы foods, food_log, weight_log, user_settings (выполнить один раз: Supabase → SQL Editor → Run)
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, kcal numeric not null default 0, p numeric not null default 0, f numeric not null default 0, c numeric not null default 0,
  portions jsonb not null default '[]'::jsonb, barcode text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.food_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null, t text not null default '12:00', name text not null, grams numeric not null default 0,
  kcal numeric not null default 0, p numeric not null default 0, f numeric not null default 0, c numeric not null default 0, food_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists food_log_user_day on public.food_log (user_id, day);
create table if not exists public.weight_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null, kg numeric not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, day));
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null, data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, key));

do $$ declare t text; begin
  foreach t in array array['foods','food_log','weight_log','user_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
    begin execute format('alter publication supabase_realtime add table public.%I', t); exception when duplicate_object then null; end;
  end loop;
end $$;
