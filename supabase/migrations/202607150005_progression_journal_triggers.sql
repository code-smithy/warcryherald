create or replace function public.get_warband_id_for_warband_fighter(target_fighter_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select warband_id
  from public.warband_fighters
  where id = target_fighter_id
$$;

create or replace function public.record_warband_encampment_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_warband_id uuid := coalesce(new.warband_id, old.warband_id);
begin
  insert into public.warband_journal_entries (warband_id, event_type, summary, details, created_by)
  values (
    target_warband_id,
    case when tg_op = 'DELETE' then 'encampment_removed' else 'encampment_changed' end,
    case when tg_op = 'DELETE' then 'Encampment removed.' else 'Encampment changed.' end,
    jsonb_build_object(
      'encampment_definition_id',
      coalesce(new.encampment_definition_id, old.encampment_definition_id)
    ),
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists record_warband_encampment_journal on public.warband_encampments;
create trigger record_warband_encampment_journal
after insert or update or delete on public.warband_encampments
for each row execute function public.record_warband_encampment_journal();

create or replace function public.record_warband_quest_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_warband_id uuid := coalesce(new.warband_id, old.warband_id);
  next_event text;
  next_summary text;
begin
  if tg_op = 'INSERT' then
    next_event := 'quest_started';
    next_summary := 'Quest started.';
  elsif tg_op = 'DELETE' then
    next_event := 'quest_removed';
    next_summary := 'Quest removed.';
  elsif old.completed_at is null and new.completed_at is not null then
    next_event := 'quest_completed';
    next_summary := 'Quest completed.';
  else
    next_event := 'quest_updated';
    next_summary := 'Quest progress updated.';
  end if;

  insert into public.warband_journal_entries (warband_id, event_type, summary, details, created_by)
  values (
    target_warband_id,
    next_event,
    next_summary,
    jsonb_build_object(
      'quest_definition_id',
      coalesce(new.quest_definition_id, old.quest_definition_id),
      'progress',
      coalesce(new.progress, old.progress),
      'completed_at',
      coalesce(new.completed_at, old.completed_at)
    ),
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists record_warband_quest_journal on public.warband_quests;
create trigger record_warband_quest_journal
after insert or update or delete on public.warband_quests
for each row execute function public.record_warband_quest_journal();

create or replace function public.record_warband_artefact_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_warband_id uuid := coalesce(new.warband_id, old.warband_id);
begin
  insert into public.warband_journal_entries (warband_id, event_type, summary, details, created_by)
  values (
    target_warband_id,
    case
      when tg_op = 'INSERT' then 'artefact_acquired'
      when tg_op = 'DELETE' then 'artefact_removed'
      else 'artefact_updated'
    end,
    case
      when tg_op = 'INSERT' then 'Artefact acquired.'
      when tg_op = 'DELETE' then 'Artefact removed.'
      else 'Artefact updated.'
    end,
    jsonb_build_object(
      'artefact_definition_id',
      coalesce(new.artefact_definition_id, old.artefact_definition_id),
      'name',
      coalesce(new.name, old.name)
    ),
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists record_warband_artefact_journal on public.warband_artefacts;
create trigger record_warband_artefact_journal
after insert or update or delete on public.warband_artefacts
for each row execute function public.record_warband_artefact_journal();

create or replace function public.record_fighter_artefact_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_warband_id uuid;
begin
  select warband_id into target_warband_id
  from public.warband_artefacts
  where id = coalesce(new.warband_artefact_id, old.warband_artefact_id);

  if target_warband_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  insert into public.warband_journal_entries (warband_id, event_type, summary, details, created_by)
  values (
    target_warband_id,
    case when tg_op = 'DELETE' then 'artefact_unassigned' else 'artefact_assigned' end,
    case when tg_op = 'DELETE' then 'Artefact unassigned.' else 'Artefact assigned.' end,
    jsonb_build_object(
      'warband_artefact_id',
      coalesce(new.warband_artefact_id, old.warband_artefact_id),
      'warband_fighter_id',
      coalesce(new.warband_fighter_id, old.warband_fighter_id)
    ),
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists record_fighter_artefact_journal on public.fighter_artefacts;
create trigger record_fighter_artefact_journal
after insert or update or delete on public.fighter_artefacts
for each row execute function public.record_fighter_artefact_journal();

create or replace function public.record_fighter_progression_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_fighter_id uuid := coalesce(new.warband_fighter_id, old.warband_fighter_id);
  target_warband_id uuid := public.get_warband_id_for_warband_fighter(target_fighter_id);
  next_event text;
  next_summary text;
begin
  if target_warband_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_table_name = 'fighter_renown' then
    next_event := 'renown_updated';
    next_summary := 'Fighter renown updated.';
  elsif tg_table_name = 'fighter_heroic_traits' and tg_op = 'DELETE' then
    next_event := 'heroic_trait_removed';
    next_summary := 'Heroic trait removed.';
  elsif tg_table_name = 'fighter_heroic_traits' then
    next_event := 'heroic_trait_assigned';
    next_summary := 'Heroic trait assigned.';
  elsif tg_table_name = 'fighter_injuries' and tg_op = 'INSERT' then
    next_event := 'injury_added';
    next_summary := 'Fighter injury added.';
  elsif tg_table_name = 'fighter_injuries' and tg_op = 'DELETE' then
    next_event := 'injury_removed';
    next_summary := 'Fighter injury removed.';
  elsif tg_table_name = 'fighter_injuries' and old.recovered_at is null and new.recovered_at is not null then
    next_event := 'injury_recovered';
    next_summary := 'Fighter injury recovered.';
  else
    next_event := 'injury_updated';
    next_summary := 'Fighter injury updated.';
  end if;

  insert into public.warband_journal_entries (warband_id, event_type, summary, details, created_by)
  values (
    target_warband_id,
    next_event,
    next_summary,
    jsonb_build_object('warband_fighter_id', target_fighter_id),
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists record_fighter_renown_journal on public.fighter_renown;
create trigger record_fighter_renown_journal
after insert or update or delete on public.fighter_renown
for each row execute function public.record_fighter_progression_journal();

drop trigger if exists record_fighter_heroic_trait_journal on public.fighter_heroic_traits;
create trigger record_fighter_heroic_trait_journal
after insert or update or delete on public.fighter_heroic_traits
for each row execute function public.record_fighter_progression_journal();

drop trigger if exists record_fighter_injury_journal on public.fighter_injuries;
create trigger record_fighter_injury_journal
after insert or update or delete on public.fighter_injuries
for each row execute function public.record_fighter_progression_journal();
