-- v30: руководитель может ставить/править/удалять задачи сотрудников (и создавать им списки).
-- Выполнить в Supabase → SQL Editor один раз. Ничего не удаляет.
create policy mgr_write_tasks on public.tasks for all to authenticated
  using ((auth.jwt() ->> 'email') = 'baklanov-dmitry@mail.ru') with check ((auth.jwt() ->> 'email') = 'baklanov-dmitry@mail.ru');
create policy mgr_write_lists on public.lists for all to authenticated
  using ((auth.jwt() ->> 'email') = 'baklanov-dmitry@mail.ru') with check ((auth.jwt() ->> 'email') = 'baklanov-dmitry@mail.ru');
-- пометка «поставил руководитель» (сотрудник видит значок 👤 у такой задачи)
alter table public.tasks add column if not exists from_mgr boolean not null default false;
