-- «Траты»: месячный лимит по категории (необязательный)
alter table public.fin_categories add column if not exists lim numeric(14,2);
