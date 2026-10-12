-- «Траты»: входящие чеки из почты (Apps Script кладёт письма сюда, приложение разбирает).
-- Перед запуском замени ВСТАВЬ_СЕКРЕТ на любую длинную случайную строку (та же строка идёт в Apps Script).
create table if not exists public.fin_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  msgid text not null,
  subject text not null default '',
  sender text not null default '',
  received timestamptz not null default now(),
  plain text not null default '',
  html text not null default '',
  status text not null default 'new' check (status in ('new','done','skip')),
  created_at timestamptz not null default now(),
  unique (user_id, msgid)
);
alter table public.fin_inbox enable row level security;
drop policy if exists fin_inbox_own on public.fin_inbox;
create policy fin_inbox_own on public.fin_inbox for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.fin_inbox_push(
  p_secret text, p_msgid text, p_subject text, p_sender text, p_received timestamptz, p_plain text, p_html text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if p_secret is distinct from 'ВСТАВЬ_СЕКРЕТ' then raise exception 'bad secret'; end if;
  select user_id into uid from public.fin_tx order by created_at desc limit 1;
  if uid is null then select user_id into uid from public.fin_categories limit 1; end if;
  if uid is null then raise exception 'no user'; end if;
  insert into public.fin_inbox (user_id, msgid, subject, sender, received, plain, html)
  values (uid, p_msgid, left(coalesce(p_subject,''),300), left(coalesce(p_sender,''),300), coalesce(p_received, now()), left(coalesce(p_plain,''),200000), left(coalesce(p_html,''),400000))
  on conflict (user_id, msgid) do nothing;
  return 'ok';
end $$;
revoke all on function public.fin_inbox_push(text,text,text,text,timestamptz,text,text) from public;
grant execute on function public.fin_inbox_push(text,text,text,text,timestamptz,text,text) to anon, authenticated;
