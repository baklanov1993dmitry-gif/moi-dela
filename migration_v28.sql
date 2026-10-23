-- Заметки: личные мысли (видны только владельцу)
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '',
  tags text[] not null default '{}',
  task_id uuid,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user_created on public.notes (user_id, created_at desc);
alter table public.notes enable row level security;
drop policy if exists "own rows" on public.notes;
create policy "own rows" on public.notes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists touch on public.notes;
create trigger touch before update on public.notes for each row execute function public.touch_updated_at();
notify pgrst, 'reload schema';
