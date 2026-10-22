-- v26: подписка на пуши «переезжает» к тому, кто сейчас вошёл. Если этот же браузер раньше был подписан под другим аккаунтом
-- (endpoint уникален), обычный upsert блокировался RLS и подписка нового аккаунта не сохранялась.
create or replace function public.push_claim(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.push_subs(endpoint, p256dh, auth, user_id) values (p_endpoint, p_p256dh, p_auth, auth.uid())
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_id = auth.uid();
end $$;
grant execute on function public.push_claim(text, text, text) to authenticated;
notify pgrst, 'reload schema';
