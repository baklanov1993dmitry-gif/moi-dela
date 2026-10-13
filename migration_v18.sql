-- Напоминания по месту: «когда окажусь рядом с местом»
alter table public.tasks add column if not exists remind_place uuid;            -- id места (places.id)
alter table public.tasks add column if not exists remind_place_in boolean default false;   -- сейчас внутри зоны (для срабатывания только при входе)
alter table public.tasks add column if not exists remind_place_at timestamptz;  -- когда в последний раз напоминали
