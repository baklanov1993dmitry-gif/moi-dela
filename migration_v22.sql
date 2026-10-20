-- v22: серверный замок 2FA. Выполнить в Supabase → SQL Editor ПОСЛЕ того, как включил 2FA в приложении.
-- Если у пользователя подтверждён второй фактор, данные отдаются только сессии с кодом (aal2).
-- У тех, кто 2FA не включал (сотрудники), ничего не меняется.
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;
grant execute on function public.mfa_ok() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['lists','tasks','time_log','foods','food_log','weight_log','user_settings','backups','push_subs','device_keys','loc_days','loc_points','media_events','places','fin_categories','fin_inbox','fin_price','fin_tx'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists mfa_guard on public.%I', t);
      execute format('create policy mfa_guard on public.%I as restrictive to authenticated using (public.mfa_ok())', t);
    end if;
  end loop;
end $$;
