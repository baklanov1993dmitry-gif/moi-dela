-- «Траты»: справочник цен по товарам (личная инфляция). Выполнить один раз в Supabase → SQL Editor.
create table if not exists public.fin_price (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(),
  ts timestamptz not null default now(),
  name text not null default '', pkey text not null default '',
  price numeric(14,2) not null check (price >= 0),      -- цена за единицу (кг/л/шт)
  qty numeric(14,3) not null default 1, amount numeric(14,2) not null default 0,
  shop text not null default '', tx_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists fin_price_user_key on public.fin_price (user_id, pkey, ts desc);
alter table public.fin_price enable row level security;
drop policy if exists fin_price_own on public.fin_price;
create policy fin_price_own on public.fin_price for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
