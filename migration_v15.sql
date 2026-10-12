-- «Траты»: данные для автобэкапа на почту (Apps Script дёргает раз в неделю).
-- Перед запуском замени ВСТАВЬ_СЕКРЕТ на тот же секрет, что в migration_v14.sql.
create or replace function public.fin_backup_dump(p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if p_secret is distinct from 'ВСТАВЬ_СЕКРЕТ' then raise exception 'bad secret'; end if;
  select user_id into uid from public.fin_tx order by created_at desc limit 1;
  if uid is null then select user_id into uid from public.fin_categories limit 1; end if;
  if uid is null then raise exception 'no user'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'categories', coalesce((select jsonb_agg(to_jsonb(c)) from public.fin_categories c where c.user_id = uid), '[]'::jsonb),
    'tx', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'ts',t.ts,'amount',t.amount,'kind',t.kind,'category_id',t.category_id,'note',t.note,'account',t.account) order by t.ts) from public.fin_tx t where t.user_id = uid), '[]'::jsonb)
  );
end $$;
revoke all on function public.fin_backup_dump(text) from public;
grant execute on function public.fin_backup_dump(text) to anon, authenticated;
