-- v17: сжатые дни трекера (упрощённая траектория + остановки + километры) — хранятся годами
create table if not exists public.loc_days (
  user_id uuid not null default auth.uid(),
  day date not null,
  data jsonb not null,
  n_raw int,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.loc_days enable row level security;
drop policy if exists loc_days_own on public.loc_days;
create policy loc_days_own on public.loc_days for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- чистка сырых точек старше 14 дней (приложение удаляет их только после сжатия дня)
drop policy if exists own_del on public.loc_points;
create policy own_del on public.loc_points for delete using (auth.uid() = user_id);
