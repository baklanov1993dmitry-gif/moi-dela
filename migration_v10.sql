-- Траты: категории и операции. Выполнить один раз в SQL Editor.
create table if not exists public.fin_categories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(),
  name text not null, icon text not null default '💰', color text not null default '#4fa3d9',
  kind text not null default 'exp' check (kind in ('exp','inc')), position int not null default 0,
  archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.fin_tx (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(),
  ts timestamptz not null default now(), amount numeric(14,2) not null check (amount >= 0),
  kind text not null default 'exp' check (kind in ('exp','inc')), category_id uuid references public.fin_categories(id) on delete set null,
  note text not null default '', account text not null default 'Основной',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists fin_tx_user_ts on public.fin_tx (user_id, ts desc);
alter table public.fin_categories enable row level security;
alter table public.fin_tx enable row level security;
create policy fin_categories_own on public.fin_categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy fin_tx_own on public.fin_tx for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
