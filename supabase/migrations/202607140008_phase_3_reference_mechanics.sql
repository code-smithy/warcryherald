alter table public.abilities
add column if not exists mechanics jsonb not null default '{}'::jsonb;

alter table public.blessings
add column if not exists mechanics jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
