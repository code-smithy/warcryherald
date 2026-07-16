do $$
begin
  create type public.battle_status as enum (
    'draft',
    'scheduled',
    'ready',
    'played',
    'aftermath_pending',
    'completed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.battle_participant_result as enum ('winner', 'draw', 'loss', 'unknown');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.battle_fighter_outcome as enum (
    'unharmed',
    'taken_down',
    'injured',
    'killed',
    'missing'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  status public.battle_status not null default 'draft',
  battleplan_name text not null default '' check (char_length(battleplan_name) <= 120),
  location_name text not null default '' check (char_length(location_name) <= 120),
  scheduled_at timestamptz,
  played_at timestamptz,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.battle_participants (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  warband_id uuid not null references public.warbands(id) on delete restrict,
  result public.battle_participant_result not null default 'unknown',
  score integer not null default 0 check (score >= 0),
  notes text not null default '' check (char_length(notes) <= 1000),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (battle_id, warband_id)
);

create table if not exists public.battle_fighters (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  battle_participant_id uuid not null references public.battle_participants(id) on delete cascade,
  warband_fighter_id uuid not null references public.warband_fighters(id) on delete restrict,
  fighter_profile_snapshot_id uuid not null references public.fighter_profile_snapshots(id) on delete restrict,
  name text not null,
  status_at_battle public.warband_fighter_status not null,
  is_leader boolean not null default false,
  points integer not null check (points >= 0),
  outcome public.battle_fighter_outcome not null default 'unharmed',
  casualty_notes text not null default '' check (char_length(casualty_notes) <= 1000),
  selected_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (battle_id, warband_fighter_id)
);

create table if not exists public.battle_events (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  event_type text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists battles_campaign_id_created_at_idx
on public.battles(campaign_id, created_at desc);

create index if not exists battle_participants_battle_id_idx
on public.battle_participants(battle_id);

create index if not exists battle_participants_warband_id_idx
on public.battle_participants(warband_id);

create index if not exists battle_fighters_battle_id_idx
on public.battle_fighters(battle_id);

create index if not exists battle_fighters_participant_id_idx
on public.battle_fighters(battle_participant_id);

create index if not exists battle_events_battle_id_created_at_idx
on public.battle_events(battle_id, created_at desc);

drop trigger if exists set_battles_updated_at on public.battles;
create trigger set_battles_updated_at
before update on public.battles
for each row
execute function public.set_updated_at();

drop trigger if exists set_battle_participants_updated_at on public.battle_participants;
create trigger set_battle_participants_updated_at
before update on public.battle_participants
for each row
execute function public.set_updated_at();

drop trigger if exists set_battle_fighters_updated_at on public.battle_fighters;
create trigger set_battle_fighters_updated_at
before update on public.battle_fighters
for each row
execute function public.set_updated_at();

create or replace function public.is_battle_campaign_member(
  target_battle_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.battles
    where id = target_battle_id
      and public.is_campaign_member(campaign_id, target_user_id)
  );
$$;

create or replace function public.can_manage_battle(
  target_battle_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.battles b
    where b.id = target_battle_id
      and (
        b.created_by = target_user_id
        or public.is_campaign_admin(b.campaign_id, target_user_id)
        or exists (
          select 1
          from public.battle_participants bp
          where bp.battle_id = b.id
            and public.can_manage_warband(bp.warband_id, target_user_id)
        )
      )
  );
$$;

create or replace function public.get_battle_id_for_participant(target_participant_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select battle_id
  from public.battle_participants
  where id = target_participant_id
$$;

create or replace function public.snapshot_battle_fighter(
  target_participant_id uuid,
  target_warband_fighter_id uuid,
  allow_unavailable boolean default false
)
returns public.battle_fighters
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_record public.battle_participants%rowtype;
  battle_record public.battles%rowtype;
  fighter_record public.warband_fighters%rowtype;
  snapshot_record public.fighter_profile_snapshots%rowtype;
  created_fighter public.battle_fighters%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to select battle fighters.';
  end if;

  select * into participant_record
  from public.battle_participants
  where id = target_participant_id;

  if not found then
    raise exception 'Battle participant was not found.';
  end if;

  select * into battle_record
  from public.battles
  where id = participant_record.battle_id;

  if not public.can_manage_battle(participant_record.battle_id, auth.uid()) then
    raise exception 'Only battle managers can select battle fighters.';
  end if;

  if battle_record.status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled battles cannot be changed.';
  end if;

  select * into fighter_record
  from public.warband_fighters
  where id = target_warband_fighter_id;

  if not found then
    raise exception 'Warband fighter was not found.';
  end if;

  if fighter_record.warband_id <> participant_record.warband_id then
    raise exception 'Fighter must belong to the participating warband.';
  end if;

  if fighter_record.status <> 'active'
    and not (
      allow_unavailable
      and public.is_campaign_admin(battle_record.campaign_id, auth.uid())
    )
  then
    raise exception 'Unavailable fighters require a campaign administrator override.';
  end if;

  select * into snapshot_record
  from public.fighter_profile_snapshots
  where id = fighter_record.fighter_profile_snapshot_id;

  insert into public.battle_fighters (
    battle_id,
    battle_participant_id,
    warband_fighter_id,
    fighter_profile_snapshot_id,
    name,
    status_at_battle,
    is_leader,
    points
  )
  values (
    participant_record.battle_id,
    participant_record.id,
    fighter_record.id,
    fighter_record.fighter_profile_snapshot_id,
    fighter_record.name,
    fighter_record.status,
    fighter_record.is_leader,
    snapshot_record.points
  )
  on conflict (battle_id, warband_fighter_id) do update
  set
    name = excluded.name,
    status_at_battle = excluded.status_at_battle,
    is_leader = excluded.is_leader,
    points = excluded.points
  returning *
  into created_fighter;

  return created_fighter;
end;
$$;

create or replace function public.create_battle(
  target_campaign_id uuid,
  battleplan text default '',
  location text default '',
  scheduled_for timestamptz default null,
  battle_notes text default ''
)
returns public.battles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  created_battle public.battles%rowtype;
begin
  if actor is null then
    raise exception 'Authentication is required to create a battle.';
  end if;

  if not public.is_campaign_member(target_campaign_id, actor) then
    raise exception 'Only campaign members can create battles.';
  end if;

  insert into public.battles (
    campaign_id,
    status,
    battleplan_name,
    location_name,
    scheduled_at,
    notes,
    created_by,
    updated_by
  )
  values (
    target_campaign_id,
    case when scheduled_for is null then 'draft'::public.battle_status else 'scheduled'::public.battle_status end,
    trim(coalesce(battleplan, '')),
    trim(coalesce(location, '')),
    scheduled_for,
    trim(coalesce(battle_notes, '')),
    actor,
    actor
  )
  returning *
  into created_battle;

  insert into public.battle_events (battle_id, event_type, summary, created_by)
  values (created_battle.id, 'battle_created', 'Battle created.', actor);

  return created_battle;
end;
$$;

create or replace function public.add_battle_participant(
  target_battle_id uuid,
  target_warband_id uuid
)
returns public.battle_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  battle_record public.battles%rowtype;
  warband_record public.warbands%rowtype;
  created_participant public.battle_participants%rowtype;
  fighter_record record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to add battle participants.';
  end if;

  select * into battle_record
  from public.battles
  where id = target_battle_id;

  if not found then
    raise exception 'Battle was not found.';
  end if;

  if battle_record.status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled battles cannot be changed.';
  end if;

  if not public.can_manage_battle(target_battle_id, auth.uid()) then
    raise exception 'Only battle managers can add participants.';
  end if;

  select * into warband_record
  from public.warbands
  where id = target_warband_id;

  if not found then
    raise exception 'Warband was not found.';
  end if;

  if warband_record.campaign_id <> battle_record.campaign_id then
    raise exception 'Participant warband must belong to the battle campaign.';
  end if;

  insert into public.battle_participants (battle_id, warband_id)
  values (target_battle_id, target_warband_id)
  returning *
  into created_participant;

  for fighter_record in
    select id
    from public.warband_fighters
    where warband_id = target_warband_id
      and status = 'active'
    order by sort_order, created_at
  loop
    perform public.snapshot_battle_fighter(created_participant.id, fighter_record.id, false);
  end loop;

  update public.battles
  set status = case
    when status = 'draft' then 'ready'::public.battle_status
    else status
  end,
  updated_by = auth.uid()
  where id = target_battle_id;

  insert into public.battle_events (battle_id, event_type, summary, details, created_by)
  values (
    target_battle_id,
    'participant_added',
    'Battle participant added.',
    jsonb_build_object('warband_id', target_warband_id),
    auth.uid()
  );

  return created_participant;
end;
$$;

create or replace function public.remove_battle_participant(target_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_record public.battle_participants%rowtype;
  battle_record public.battles%rowtype;
begin
  select * into participant_record
  from public.battle_participants
  where id = target_participant_id;

  if not found then
    return;
  end if;

  select * into battle_record
  from public.battles
  where id = participant_record.battle_id;

  if not public.can_manage_battle(participant_record.battle_id, auth.uid()) then
    raise exception 'Only battle managers can remove participants.';
  end if;

  if battle_record.status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled battles cannot be changed.';
  end if;

  delete from public.battle_participants
  where id = target_participant_id;

  insert into public.battle_events (battle_id, event_type, summary, details, created_by)
  values (
    participant_record.battle_id,
    'participant_removed',
    'Battle participant removed.',
    jsonb_build_object('warband_id', participant_record.warband_id),
    auth.uid()
  );
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

  update public.battles
  set status = 'completed', confirmed_at = coalesce(confirmed_at, now()), updated_by = auth.uid()
  where id = target_battle_id;

  insert into public.battle_events (battle_id, event_type, summary, created_by)
  values (target_battle_id, 'battle_completed', 'Battle completed.', auth.uid());
end;
$$;

create or replace function public.record_battle_participant_result_correction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.confirmed_at is not null
    and (
      old.result is distinct from new.result
      or old.score is distinct from new.score
      or old.notes is distinct from new.notes
    )
  then
    insert into public.battle_events (battle_id, event_type, summary, details, created_by)
    values (
      new.battle_id,
      'battle_result_corrected',
      'Battle result corrected.',
      jsonb_build_object(
        'participant_id', new.id,
        'old_result', old.result,
        'new_result', new.result,
        'old_score', old.score,
        'new_score', new.score
      ),
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists record_battle_participant_result_correction on public.battle_participants;
create trigger record_battle_participant_result_correction
after update on public.battle_participants
for each row
execute function public.record_battle_participant_result_correction();

alter table public.battles enable row level security;
alter table public.battle_participants enable row level security;
alter table public.battle_fighters enable row level security;
alter table public.battle_events enable row level security;

create policy "Battles are readable by campaign members" on public.battles
for select to authenticated
using (public.is_campaign_member(campaign_id));

create policy "Campaign members can create battles" on public.battles
for insert to authenticated
with check (created_by = auth.uid() and public.is_campaign_member(campaign_id));

create policy "Battle managers can update battles" on public.battles
for update to authenticated
using (public.can_manage_battle(id))
with check (public.can_manage_battle(id));

create policy "Draft battle managers can delete battles" on public.battles
for delete to authenticated
using (status = 'draft' and public.can_manage_battle(id));

create policy "Battle participants are readable by campaign members" on public.battle_participants
for select to authenticated
using (public.is_battle_campaign_member(battle_id));

create policy "Battle managers can maintain participants" on public.battle_participants
for all to authenticated
using (public.can_manage_battle(battle_id))
with check (public.can_manage_battle(battle_id));

create policy "Battle fighters are readable by campaign members" on public.battle_fighters
for select to authenticated
using (public.is_battle_campaign_member(battle_id));

create policy "Battle managers can maintain fighters" on public.battle_fighters
for all to authenticated
using (public.can_manage_battle(battle_id))
with check (public.can_manage_battle(battle_id));

create policy "Battle events are readable by campaign members" on public.battle_events
for select to authenticated
using (public.is_battle_campaign_member(battle_id));

revoke all on table public.battles, public.battle_participants, public.battle_fighters, public.battle_events from anon, authenticated;
grant select, insert, update, delete on table public.battles to authenticated;
grant select, insert, update, delete on table public.battle_participants to authenticated;
grant select, insert, update, delete on table public.battle_fighters to authenticated;
grant select on table public.battle_events to authenticated;

grant execute on function public.is_battle_campaign_member(uuid, uuid) to authenticated;
grant execute on function public.can_manage_battle(uuid, uuid) to authenticated;
grant execute on function public.create_battle(uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.add_battle_participant(uuid, uuid) to authenticated;
grant execute on function public.remove_battle_participant(uuid) to authenticated;
grant execute on function public.snapshot_battle_fighter(uuid, uuid, boolean) to authenticated;
grant execute on function public.record_battle_results(uuid, jsonb) to authenticated;
grant execute on function public.complete_battle(uuid) to authenticated;

notify pgrst, 'reload schema';
