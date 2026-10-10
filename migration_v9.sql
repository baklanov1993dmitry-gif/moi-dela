-- Места (названия точек): выполнить один раз в SQL Editor
create table if not exists public.places (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), name text not null, lat double precision not null, lon double precision not null, r int not null default 120, created_at timestamptz not null default now());
alter table public.places enable row level security;
create policy places_own on public.places for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
