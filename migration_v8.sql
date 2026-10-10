-- Трекер: точки перемещений (OwnTracks) и события воспроизведения (MacroDroid). Выполнить один раз в SQL Editor.
create table if not exists public.loc_points (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  ts timestamptz not null,
  lat double precision not null,
  lon double precision not null,
  vel real, acc real, batt int,
  unique (user_id, ts)
);
create table if not exists public.media_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  ts timestamptz not null default now(),
  app text, title text, artist text, state text
);
create index if not exists loc_points_ts on public.loc_points (user_id, ts desc);
create index if not exists media_events_ts on public.media_events (user_id, ts desc);
alter table public.loc_points enable row level security;
alter table public.media_events enable row level security;
drop policy if exists own_sel on public.loc_points;
drop policy if exists own_sel on public.media_events;
create policy own_sel on public.loc_points for select using (auth.uid() = user_id);
create policy own_sel on public.media_events for select using (auth.uid() = user_id);
