alter table public.runemarks
drop constraint if exists runemarks_category_check;

alter table public.runemarks
add constraint runemarks_category_check
check (category in ('fighter', 'faction', 'ability', 'universal', 'characteristic', 'weapon'));

notify pgrst, 'reload schema';
