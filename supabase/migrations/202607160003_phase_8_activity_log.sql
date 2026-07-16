create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  warband_id uuid references public.warbands(id) on delete set null,
  battle_id uuid references public.battles(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  event_type text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  source_table text,
  source_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_campaign_id_created_at_idx
on public.activity_log(campaign_id, created_at desc);

create index if not exists activity_log_warband_id_created_at_idx
on public.activity_log(warband_id, created_at desc)
where warband_id is not null;

create index if not exists activity_log_battle_id_created_at_idx
on public.activity_log(battle_id, created_at desc)
where battle_id is not null;

create unique index if not exists activity_log_source_unique_idx
on public.activity_log(source_table, source_id)
where source_table is not null and source_id is not null;

create or replace function public.insert_activity_log(
  target_campaign_id uuid,
  target_warband_id uuid,
  target_battle_id uuid,
  next_event_type text,
  next_summary text,
  next_details jsonb default '{}'::jsonb,
  next_actor_id uuid default auth.uid(),
  next_source_table text default null,
  next_source_id uuid default null,
  next_created_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_campaign_id is null or next_event_type is null or trim(next_event_type) = '' then
    return;
  end if;

  insert into public.activity_log (
    campaign_id,
    warband_id,
    battle_id,
    actor_id,
    event_type,
    summary,
    details,
    source_table,
    source_id,
    created_at
  )
  values (
    target_campaign_id,
    target_warband_id,
    target_battle_id,
    next_actor_id,
    trim(next_event_type),
    trim(coalesce(nullif(next_summary, ''), next_event_type)),
    coalesce(next_details, '{}'::jsonb),
    next_source_table,
    next_source_id,
    coalesce(next_created_at, now())
  )
  on conflict (source_table, source_id) where source_table is not null and source_id is not null
  do update
  set
    campaign_id = excluded.campaign_id,
    warband_id = excluded.warband_id,
    battle_id = excluded.battle_id,
    actor_id = excluded.actor_id,
    event_type = excluded.event_type,
    summary = excluded.summary,
    details = excluded.details,
    created_at = excluded.created_at;
end;
$$;

create or replace function public.map_activity_event_type(source_event_type text)
returns text
language sql
immutable
as $$
  select case source_event_type
    when 'injury_added' then 'fighter_injured'
    when 'injury_updated' then 'fighter_injured'
    when 'injury_recovered' then 'fighter_recovered'
    when 'renown_updated' then 'fighter_renown_updated'
    when 'heroic_trait_assigned' then 'fighter_trait_gained'
    when 'heroic_trait_removed' then 'fighter_trait_removed'
    when 'progression_updated' then 'warband_progress_updated'
    else source_event_type
  end;
$$;

create or replace function public.record_campaign_member_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.insert_activity_log(
      new.campaign_id,
      null,
      null,
      'member_joined',
      'Campaign member joined.',
      jsonb_build_object('user_id', new.user_id, 'role', new.role),
      new.user_id,
      null,
      null,
      new.joined_at
    );
  elsif tg_op = 'UPDATE' and old.role is distinct from new.role then
    perform public.insert_activity_log(
      new.campaign_id,
      null,
      null,
      'member_role_changed',
      'Campaign member role changed.',
      jsonb_build_object('user_id', new.user_id, 'old_role', old.role, 'new_role', new.role),
      auth.uid(),
      null,
      null,
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists record_campaign_member_activity on public.campaign_members;
create trigger record_campaign_member_activity
after insert or update on public.campaign_members
for each row execute function public.record_campaign_member_activity();

create or replace function public.record_warband_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.insert_activity_log(
      new.campaign_id,
      new.id,
      null,
      'warband_created',
      'Warband created.',
      jsonb_build_object('warband_id', new.id, 'name', new.name, 'status', new.status),
      new.owner_id,
      'warbands',
      new.id,
      new.created_at
    );
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform public.insert_activity_log(
      new.campaign_id,
      new.id,
      null,
      case when new.status = 'retired' then 'warband_retired' else 'warband_status_changed' end,
      case when new.status = 'retired' then 'Warband retired.' else 'Warband status changed.' end,
      jsonb_build_object(
        'warband_id', new.id,
        'name', new.name,
        'old_status', old.status,
        'new_status', new.status
      ),
      auth.uid(),
      null,
      null,
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists record_warband_activity on public.warbands;
create trigger record_warband_activity
after insert or update on public.warbands
for each row execute function public.record_warband_activity();

create or replace function public.record_warband_fighter_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_campaign_id uuid;
  next_event text;
  next_summary text;
begin
  select campaign_id into target_campaign_id
  from public.warbands
  where id = coalesce(new.warband_id, old.warband_id);

  if target_campaign_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'INSERT' then
    next_event := 'fighter_recruited';
    next_summary := 'Fighter recruited.';
  elsif tg_op = 'DELETE' then
    next_event := 'fighter_removed';
    next_summary := 'Fighter removed.';
  elsif old.status is distinct from new.status then
    next_event := case new.status
      when 'dead' then 'fighter_killed'
      when 'recovering' then 'fighter_injured'
      when 'missing' then 'fighter_missing'
      when 'retired' then 'fighter_retired'
      when 'active' then 'fighter_recovered'
      else 'fighter_status_changed'
    end;
    next_summary := case new.status
      when 'dead' then 'Fighter killed.'
      when 'recovering' then 'Fighter injured.'
      when 'missing' then 'Fighter missing.'
      when 'retired' then 'Fighter retired.'
      when 'active' then 'Fighter returned to active duty.'
      else 'Fighter status changed.'
    end;
  else
    return new;
  end if;

  perform public.insert_activity_log(
    target_campaign_id,
    coalesce(new.warband_id, old.warband_id),
    null,
    next_event,
    next_summary,
    jsonb_build_object(
      'warband_fighter_id', coalesce(new.id, old.id),
      'name', coalesce(new.name, old.name),
      'old_status', case when tg_op = 'UPDATE' then old.status else null end,
      'new_status', case when tg_op <> 'DELETE' then new.status else null end
    ),
    auth.uid(),
    case when tg_op = 'INSERT' then 'warband_fighters' else null end,
    case when tg_op = 'INSERT' then new.id else null end,
    coalesce(new.created_at, old.created_at, now())
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists record_warband_fighter_activity on public.warband_fighters;
create trigger record_warband_fighter_activity
after insert or update or delete on public.warband_fighters
for each row execute function public.record_warband_fighter_activity();

create or replace function public.record_battle_event_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_campaign_id uuid;
begin
  select campaign_id into target_campaign_id
  from public.battles
  where id = new.battle_id;

  perform public.insert_activity_log(
    target_campaign_id,
    null,
    new.battle_id,
    public.map_activity_event_type(new.event_type),
    new.summary,
    new.details,
    new.created_by,
    'battle_events',
    new.id,
    new.created_at
  );

  return new;
end;
$$;

drop trigger if exists record_battle_event_activity on public.battle_events;
create trigger record_battle_event_activity
after insert on public.battle_events
for each row execute function public.record_battle_event_activity();

create or replace function public.record_warband_journal_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_campaign_id uuid;
begin
  select campaign_id into target_campaign_id
  from public.warbands
  where id = new.warband_id;

  perform public.insert_activity_log(
    target_campaign_id,
    new.warband_id,
    null,
    public.map_activity_event_type(new.event_type),
    new.summary,
    new.details,
    new.created_by,
    'warband_journal_entries',
    new.id,
    new.created_at
  );

  return new;
end;
$$;

drop trigger if exists record_warband_journal_activity on public.warband_journal_entries;
create trigger record_warband_journal_activity
after insert on public.warband_journal_entries
for each row execute function public.record_warband_journal_activity();

insert into public.activity_log (
  campaign_id,
  actor_id,
  event_type,
  summary,
  details,
  source_table,
  source_id,
  created_at
)
select
  campaign_id,
  user_id,
  'member_joined',
  'Campaign member joined.',
  jsonb_build_object('user_id', user_id, 'role', role),
  null,
  null,
  joined_at
from public.campaign_members
where not exists (
  select 1
  from public.activity_log existing
  where existing.campaign_id = campaign_members.campaign_id
    and existing.event_type = 'member_joined'
    and existing.details->>'user_id' = campaign_members.user_id::text
);

insert into public.activity_log (
  campaign_id,
  warband_id,
  actor_id,
  event_type,
  summary,
  details,
  source_table,
  source_id,
  created_at
)
select
  campaign_id,
  id,
  owner_id,
  'warband_created',
  'Warband created.',
  jsonb_build_object('warband_id', id, 'name', name, 'status', status),
  'warbands',
  id,
  created_at
from public.warbands
on conflict (source_table, source_id) where source_table is not null and source_id is not null
do nothing;

insert into public.activity_log (
  campaign_id,
  warband_id,
  event_type,
  summary,
  details,
  source_table,
  source_id,
  created_at
)
select
  w.campaign_id,
  wf.warband_id,
  'fighter_recruited',
  'Fighter recruited.',
  jsonb_build_object('warband_fighter_id', wf.id, 'name', wf.name, 'new_status', wf.status),
  'warband_fighters',
  wf.id,
  wf.created_at
from public.warband_fighters wf
join public.warbands w on w.id = wf.warband_id
on conflict (source_table, source_id) where source_table is not null and source_id is not null
do nothing;

insert into public.activity_log (
  campaign_id,
  battle_id,
  actor_id,
  event_type,
  summary,
  details,
  source_table,
  source_id,
  created_at
)
select
  b.campaign_id,
  be.battle_id,
  be.created_by,
  public.map_activity_event_type(be.event_type),
  be.summary,
  be.details,
  'battle_events',
  be.id,
  be.created_at
from public.battle_events be
join public.battles b on b.id = be.battle_id
on conflict (source_table, source_id) where source_table is not null and source_id is not null
do nothing;

insert into public.activity_log (
  campaign_id,
  warband_id,
  actor_id,
  event_type,
  summary,
  details,
  source_table,
  source_id,
  created_at
)
select
  w.campaign_id,
  wje.warband_id,
  wje.created_by,
  public.map_activity_event_type(wje.event_type),
  wje.summary,
  wje.details,
  'warband_journal_entries',
  wje.id,
  wje.created_at
from public.warband_journal_entries wje
join public.warbands w on w.id = wje.warband_id
on conflict (source_table, source_id) where source_table is not null and source_id is not null
do nothing;

alter table public.activity_log enable row level security;

drop policy if exists "Activity is readable by campaign members" on public.activity_log;
create policy "Activity is readable by campaign members"
on public.activity_log
for select to authenticated
using (public.is_campaign_member(campaign_id));

revoke all on table public.activity_log from anon, authenticated;
grant select on table public.activity_log to authenticated;

notify pgrst, 'reload schema';
