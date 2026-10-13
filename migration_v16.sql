-- migration_v16: руководитель (baklanov-dmitry@mail.ru) читает задачи и списки сотрудников. Только чтение.
create policy mgr_read_tasks on public.tasks for select to authenticated using ((auth.jwt() ->> 'email') = 'baklanov-dmitry@mail.ru');
create policy mgr_read_lists on public.lists for select to authenticated using ((auth.jwt() ->> 'email') = 'baklanov-dmitry@mail.ru');
create or replace function public.team_users() returns table(id uuid, email text) language sql security definer set search_path = public, auth as $$ select u.id, u.email::text from auth.users u where (auth.jwt() ->> 'email') = 'baklanov-dmitry@mail.ru' and u.id <> auth.uid() $$;
revoke all on function public.team_users() from public, anon;
grant execute on function public.team_users() to authenticated;
