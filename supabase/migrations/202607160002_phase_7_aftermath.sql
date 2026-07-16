do $$
begin
  create type public.aftermath_session_status as enum ('pending', 'in_progress', 'completed');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.aftermath_step_status as enum ('pending', 'completed', 'reopened');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.aftermath_step_key as enum (
    'award_glory',
    'resolve_injuries',
    'resolve_renown',
    'update_quest',
    'exploration',
    'manage_warband',
    'encampment_check',
    'review'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.aftermath_sessions (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  battle_participant_id uuid not null references public.battle_participants(id) on delete cascade,
  warband_id uuid not null references public.warbands(id) on delete restrict,
  status public.aftermath_session_status not null default 'pending',
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (battle_participant_id)
);

create table if not exists public.aftermath_steps (
  id uuid primary key default gen_random_uuid(),
  aftermath_session_id uuid not null references public.aftermath_sessions(id) on delete cascade,
  step_key public.aftermath_step_key not null,
  position integer not null check (position > 0),
  status public.aftermath_step_status not null default 'pending',
  instructions text not null default '',
  input jsonb not null default '{}'::jsonb,
  consequences jsonb not null default '{}'::jsonb,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  correction_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aftermath_session_id, step_key),
  unique (aftermath_session_id, position)
);

create index if not exists aftermath_sessions_battle_id_idx
on public.aftermath_sessions(battle_id);

create index if not exists aftermath_sessions_warband_id_idx
on public.aftermath_sessions(warband_id);

create index if not exists aftermath_steps_session_position_idx
on public.aftermath_steps(aftermath_session_id, position);

drop trigger if exists set_aftermath_sessions_updated_at on public.aftermath_sessions;
create trigger set_aftermath_sessions_updated_at
before update on public.aftermath_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists set_aftermath_steps_updated_at on public.aftermath_steps;
create trigger set_aftermath_steps_updated_at
before update on public.aftermath_steps
for each row
execute function public.set_updated_at();

create or replace function public.enforce_warband_fighter_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  warband_record public.warbands%rowtype;
  snapshot_record public.fighter_profile_snapshots%rowtype;
begin
  if tg_op = 'DELETE' then
    select * into warband_record
    from public.warbands
    where id = old.warband_id;

    if found and warband_record.status = 'battle_ready' then
      raise exception 'Return the warband to draft before changing its roster.';
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE' then
    new.warband_id = old.warband_id;
    new.fighter_profile_snapshot_id = old.fighter_profile_snapshot_id;
    new.fighter_profile_id = old.fighter_profile_id;
  end if;

  select * into warband_record
  from public.warbands
  where id = new.warband_id;

  if not found then
    raise exception 'Warband was not found.';
  end if;

  if warband_record.status = 'battle_ready' then
    if tg_op = 'UPDATE'
      and new.name = old.name
      and new.is_leader = old.is_leader
      and new.sort_order = old.sort_order
      and new.warband_id = old.warband_id
      and new.fighter_profile_snapshot_id = old.fighter_profile_snapshot_id
      and new.fighter_profile_id = old.fighter_profile_id
    then
      return new;
    end if;

    raise exception 'Return the warband to draft before changing its roster.';
  end if;

  if tg_op = 'UPDATE'
    and old.fighter_profile_snapshot_id = new.fighter_profile_snapshot_id
    and old.fighter_profile_id = new.fighter_profile_id
    and old.warband_id = new.warband_id
    and (
      new.is_leader = old.is_leader
      or new.is_leader = false
    )
  then
    return new;
  end if;

  select * into snapshot_record
  from public.fighter_profile_snapshots
  where id = new.fighter_profile_snapshot_id;

  if not found then
    raise exception 'Fighter snapshot was not found.';
  end if;

  if snapshot_record.rules_release_id <> warband_record.rules_release_id
    or snapshot_record.faction_id <> warband_record.faction_id
    or snapshot_record.fighter_profile_id <> new.fighter_profile_id
  then
    raise exception 'Fighter profile does not belong to this warband faction and rules release.';
  end if;

  if new.is_leader and not snapshot_record.is_leader then
    raise exception 'Only fighter profiles with the leader runemark can be designated as leader.';
  end if;

  return new;
end;
$$;

create or replace function public.initialize_aftermath_sessions(target_battle_id uuid)
returns setof public.aftermath_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  battle_record public.battles%rowtype;
  participant_record public.battle_participants%rowtype;
  created_session public.aftermath_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to start aftermath.';
  end if;

  select * into battle_record
  from public.battles
  where id = target_battle_id;

  if not found then
    raise exception 'Battle was not found.';
  end if;

  if not public.can_manage_battle(target_battle_id, auth.uid()) then
    raise exception 'Only battle managers can start aftermath.';
  end if;

  if battle_record.status not in ('aftermath_pending', 'completed') then
    raise exception 'Record battle results before starting aftermath.';
  end if;

  for participant_record in
    select *
    from public.battle_participants
    where battle_id = target_battle_id
    order by created_at
  loop
    insert into public.aftermath_sessions (
      battle_id,
      battle_participant_id,
      warband_id,
      created_by,
      updated_by
    )
    values (
      target_battle_id,
      participant_record.id,
      participant_record.warband_id,
      auth.uid(),
      auth.uid()
    )
    on conflict (battle_participant_id) do update
    set updated_by = auth.uid()
    returning *
    into created_session;

    insert into public.aftermath_steps (
      aftermath_session_id,
      step_key,
      position,
      instructions
    )
    values
      (created_session.id, 'award_glory', 1, 'Enter the glory and reputation changes earned after the battle.'),
      (created_session.id, 'resolve_injuries', 2, 'Record injury rolls, lasting injuries, deaths, missing fighters, or recoveries.'),
      (created_session.id, 'resolve_renown', 3, 'Enter renown changes for fighters that earned advancement.'),
      (created_session.id, 'update_quest', 4, 'Record quest progress or completion notes.'),
      (created_session.id, 'exploration', 5, 'Enter exploration dice and any rewards that change warband totals.'),
      (created_session.id, 'manage_warband', 6, 'Record recruitment, retirement, or other roster decisions handled after the battle.'),
      (created_session.id, 'encampment_check', 7, 'Record encampment checks or notes for administrator follow-up.'),
      (created_session.id, 'review', 8, 'Confirm that all prior aftermath decisions are correct.')
    on conflict (aftermath_session_id, step_key) do nothing;

    return next created_session;
  end loop;
end;
$$;

create or replace function public.complete_aftermath_step(
  target_step_id uuid,
  step_input jsonb default '{}'::jsonb,
  step_consequences jsonb default '{}'::jsonb
)
returns public.aftermath_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  step_record public.aftermath_steps%rowtype;
  session_record public.aftermath_sessions%rowtype;
  battle_record public.battles%rowtype;
  glory_delta integer := coalesce(nullif(step_consequences->>'gloryDelta', '')::integer, 0);
  reputation_delta integer := coalesce(nullif(step_consequences->>'reputationDelta', '')::integer, 0);
  item jsonb;
  target_fighter_id uuid;
  next_delta integer;
  next_status public.warband_fighter_status;
  injury_name text;
  injury_description text;
begin
  if actor is null then
    raise exception 'Authentication is required to complete aftermath.';
  end if;

  select * into step_record
  from public.aftermath_steps
  where id = target_step_id
  for update;

  if not found then
    raise exception 'Aftermath step was not found.';
  end if;

  select * into session_record
  from public.aftermath_sessions
  where id = step_record.aftermath_session_id
  for update;

  select * into battle_record
  from public.battles
  where id = session_record.battle_id
  for update;

  if battle_record.status not in ('aftermath_pending', 'completed') then
    raise exception 'Aftermath can only be completed after battle results are recorded.';
  end if;

  if not (
    public.can_manage_warband(session_record.warband_id, actor)
    or public.is_campaign_admin(battle_record.campaign_id, actor)
  ) then
    raise exception 'Only the warband manager or a campaign administrator can complete this aftermath step.';
  end if;

  if step_record.status = 'completed' and step_record.completed_at is not null then
    return step_record;
  end if;

  if exists (
    select 1
    from public.aftermath_steps prior_step
    where prior_step.aftermath_session_id = step_record.aftermath_session_id
      and prior_step.position < step_record.position
      and prior_step.status <> 'completed'
  ) then
    raise exception 'Complete earlier aftermath steps first.';
  end if;

  if glory_delta <> 0 or reputation_delta <> 0 then
    insert into public.warband_progress (
      warband_id,
      glory,
      reputation,
      updated_by
    )
    values (
      session_record.warband_id,
      greatest(0, glory_delta),
      greatest(0, reputation_delta),
      actor
    )
    on conflict (warband_id) do update
    set
      glory = greatest(0, public.warband_progress.glory + glory_delta),
      reputation = greatest(0, public.warband_progress.reputation + reputation_delta),
      updated_by = actor;
  end if;

  for item in
    select *
    from jsonb_array_elements(coalesce(step_consequences->'renown', '[]'::jsonb))
  loop
    target_fighter_id := (item->>'fighterId')::uuid;
    next_delta := coalesce(nullif(item->>'delta', '')::integer, 0);

    if next_delta <> 0 then
      if not exists (
        select 1
        from public.warband_fighters
        where id = target_fighter_id
          and warband_id = session_record.warband_id
      ) then
        raise exception 'Renown change targets a fighter outside this warband.';
      end if;

      insert into public.fighter_renown (
        warband_fighter_id,
        renown,
        updated_by
      )
      values (
        target_fighter_id,
        greatest(0, next_delta),
        actor
      )
      on conflict (warband_fighter_id) do update
      set
        renown = greatest(0, public.fighter_renown.renown + next_delta),
        updated_by = actor;
    end if;
  end loop;

  for item in
    select *
    from jsonb_array_elements(coalesce(step_consequences->'fighterStatuses', '[]'::jsonb))
  loop
    target_fighter_id := (item->>'fighterId')::uuid;
    next_status := (item->>'status')::public.warband_fighter_status;

    update public.warband_fighters
    set status = next_status
    where id = target_fighter_id
      and warband_id = session_record.warband_id;

    if not found then
      raise exception 'Status change targets a fighter outside this warband.';
    end if;
  end loop;

  for item in
    select *
    from jsonb_array_elements(coalesce(step_consequences->'injuries', '[]'::jsonb))
  loop
    target_fighter_id := (item->>'fighterId')::uuid;
    injury_name := trim(coalesce(item->>'name', ''));
    injury_description := trim(coalesce(item->>'description', ''));

    if injury_name <> '' then
      if not exists (
        select 1
        from public.warband_fighters
        where id = target_fighter_id
          and warband_id = session_record.warband_id
      ) then
        raise exception 'Injury targets a fighter outside this warband.';
      end if;

      insert into public.fighter_injuries (
        warband_fighter_id,
        name,
        description,
        created_by
      )
      values (
        target_fighter_id,
        injury_name,
        injury_description,
        actor
      );
    end if;
  end loop;

  update public.aftermath_steps
  set
    status = 'completed',
    input = coalesce(step_input, '{}'::jsonb),
    consequences = coalesce(step_consequences, '{}'::jsonb),
    completed_by = actor,
    completed_at = now()
  where id = target_step_id
  returning *
  into step_record;

  update public.aftermath_sessions
  set
    status = case
      when exists (
        select 1
        from public.aftermath_steps
        where aftermath_session_id = session_record.id
          and status <> 'completed'
      )
      then 'in_progress'::public.aftermath_session_status
      else 'completed'::public.aftermath_session_status
    end,
    completed_at = case
      when exists (
        select 1
        from public.aftermath_steps
        where aftermath_session_id = session_record.id
          and status <> 'completed'
      )
      then null
      else now()
    end,
    updated_by = actor
  where id = session_record.id;

  insert into public.warband_journal_entries (
    warband_id,
    event_type,
    summary,
    details,
    created_by
  )
  values (
    session_record.warband_id,
    'aftermath_step_completed',
    'Aftermath step completed.',
    jsonb_build_object(
      'battle_id', session_record.battle_id,
      'step_key', step_record.step_key,
      'input', step_record.input,
      'consequences', step_record.consequences
    ),
    actor
  );

  insert into public.battle_events (
    battle_id,
    event_type,
    summary,
    details,
    created_by
  )
  values (
    session_record.battle_id,
    'aftermath_step_completed',
    'Aftermath step completed.',
    jsonb_build_object(
      'warband_id', session_record.warband_id,
      'step_key', step_record.step_key
    ),
    actor
  );

  if not exists (
    select 1
    from public.aftermath_sessions
    where battle_id = session_record.battle_id
      and status <> 'completed'
  ) then
    update public.battles
    set status = 'completed', confirmed_at = coalesce(confirmed_at, now()), updated_by = actor
    where id = session_record.battle_id;

    insert into public.battle_events (battle_id, event_type, summary, created_by)
    values (session_record.battle_id, 'aftermath_completed', 'All aftermath sessions completed.', actor);
  end if;

  return step_record;
end;
$$;

create or replace function public.reopen_aftermath_step(
  target_step_id uuid,
  correction_reason text default ''
)
returns public.aftermath_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  step_record public.aftermath_steps%rowtype;
  session_record public.aftermath_sessions%rowtype;
  battle_record public.battles%rowtype;
begin
  if actor is null then
    raise exception 'Authentication is required to reopen aftermath.';
  end if;

  select * into step_record
  from public.aftermath_steps
  where id = target_step_id
  for update;

  if not found then
    raise exception 'Aftermath step was not found.';
  end if;

  select * into session_record
  from public.aftermath_sessions
  where id = step_record.aftermath_session_id
  for update;

  select * into battle_record
  from public.battles
  where id = session_record.battle_id
  for update;

  if not public.is_campaign_admin(battle_record.campaign_id, actor) then
    raise exception 'Only campaign administrators can reopen aftermath steps.';
  end if;

  update public.aftermath_steps
  set
    status = 'reopened',
    reopened_by = actor,
    reopened_at = now(),
    correction_reason = trim(coalesce(correction_reason, '')),
    completed_at = null,
    completed_by = null
  where id = target_step_id
  returning *
  into step_record;

  update public.aftermath_sessions
  set status = 'in_progress', completed_at = null, updated_by = actor
  where id = session_record.id;

  update public.battles
  set status = 'aftermath_pending', updated_by = actor
  where id = session_record.battle_id;

  insert into public.warband_journal_entries (
    warband_id,
    event_type,
    summary,
    details,
    created_by
  )
  values (
    session_record.warband_id,
    'aftermath_step_reopened',
    'Aftermath step reopened for correction.',
    jsonb_build_object(
      'battle_id', session_record.battle_id,
      'step_key', step_record.step_key,
      'reason', trim(coalesce(correction_reason, ''))
    ),
    actor
  );

  insert into public.battle_events (
    battle_id,
    event_type,
    summary,
    details,
    created_by
  )
  values (
    session_record.battle_id,
    'aftermath_step_reopened',
    'Aftermath step reopened for correction.',
    jsonb_build_object(
      'warband_id', session_record.warband_id,
      'step_key', step_record.step_key,
      'reason', trim(coalesce(correction_reason, ''))
    ),
    actor
  );

  return step_record;
end;
$$;

create or replace function public.record_battle_results(
  target_battle_id uuid,
  participant_results jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  next_participant_id uuid;
  next_result public.battle_participant_result;
  next_score integer;
  next_notes text;
begin
  if not public.can_manage_battle(target_battle_id, auth.uid()) then
    raise exception 'Only battle managers can record results.';
  end if;

  if not exists (select 1 from public.battle_participants where battle_id = target_battle_id) then
    raise exception 'A battle must have participants before results can be recorded.';
  end if;

  for item in select * from jsonb_array_elements(participant_results)
  loop
    next_participant_id := (item->>'participantId')::uuid;
    next_result := (item->>'result')::public.battle_participant_result;
    next_score := greatest(coalesce((item->>'score')::integer, 0), 0);
    next_notes := trim(coalesce(item->>'notes', ''));

    update public.battle_participants
    set
      result = next_result,
      score = next_score,
      notes = next_notes,
      confirmed_by = auth.uid(),
      confirmed_at = now()
    where id = next_participant_id
      and battle_id = target_battle_id;
  end loop;

  update public.battles
  set
    status = 'aftermath_pending',
    played_at = coalesce(played_at, now()),
    confirmed_at = now(),
    updated_by = auth.uid()
  where id = target_battle_id;

  insert into public.battle_events (battle_id, event_type, summary, details, created_by)
  values (
    target_battle_id,
    'battle_results_recorded',
    'Battle results recorded.',
    jsonb_build_object('participant_count', jsonb_array_length(participant_results)),
    auth.uid()
  );

  perform public.initialize_aftermath_sessions(target_battle_id);
end;
$$;

create or replace function public.complete_battle(target_battle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_battle(target_battle_id, auth.uid()) then
    raise exception 'Only battle managers can complete battles.';
  end if;

  if not exists (select 1 from public.battle_participants where battle_id = target_battle_id) then
    raise exception 'A battle cannot be completed without participants.';
  end if;

  if exists (
    select 1
    from public.battle_participants
    where battle_id = target_battle_id
      and result = 'unknown'
  ) then
    raise exception 'A battle cannot be completed while participant results are unknown.';
  end if;

  if exists (
    select 1
    from public.aftermath_sessions
    where battle_id = target_battle_id
      and status <> 'completed'
  ) then
    raise exception 'Complete all aftermath sessions before completing the battle.';
  end if;

  update public.battles
  set status = 'completed', confirmed_at = coalesce(confirmed_at, now()), updated_by = auth.uid()
  where id = target_battle_id;

  insert into public.battle_events (battle_id, event_type, summary, created_by)
  values (target_battle_id, 'battle_completed', 'Battle completed.', auth.uid());
end;
$$;

alter table public.aftermath_sessions enable row level security;
alter table public.aftermath_steps enable row level security;

drop policy if exists "Aftermath sessions are readable by campaign members" on public.aftermath_sessions;
create policy "Aftermath sessions are readable by campaign members"
on public.aftermath_sessions
for select to authenticated
using (public.is_battle_campaign_member(battle_id));

drop policy if exists "Aftermath steps are readable by campaign members" on public.aftermath_steps;
create policy "Aftermath steps are readable by campaign members"
on public.aftermath_steps
for select to authenticated
using (
  exists (
    select 1
    from public.aftermath_sessions session
    where session.id = aftermath_steps.aftermath_session_id
      and public.is_battle_campaign_member(session.battle_id)
  )
);

revoke all on table public.aftermath_sessions, public.aftermath_steps from anon, authenticated;
grant select on table public.aftermath_sessions, public.aftermath_steps to authenticated;

grant execute on function public.initialize_aftermath_sessions(uuid) to authenticated;
grant execute on function public.complete_aftermath_step(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.reopen_aftermath_step(uuid, text) to authenticated;

notify pgrst, 'reload schema';
