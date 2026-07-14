do $$
begin
  create type public.warband_status as enum ('draft', 'battle_ready', 'retired');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.warband_fighter_status as enum ('active', 'recovering', 'missing', 'dead', 'retired');
exception
  when duplicate_object then null;
end
$$;

alter table public.campaigns
add column if not exists rules_release_id uuid references public.rules_releases(id) on delete set null;

alter table public.campaigns
add column if not exists warband_points_limit integer not null default 1000 check (warband_points_limit > 0);

alter table public.campaigns
add column if not exists warband_fighter_limit integer not null default 15 check (warband_fighter_limit > 0);

create index if not exists campaigns_rules_release_id_idx on public.campaigns(rules_release_id);

create table if not exists public.warbands (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  rules_release_id uuid not null references public.rules_releases(id) on delete restrict,
  faction_id uuid not null references public.factions(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 80),
  status public.warband_status not null default 'draft',
  points_limit integer not null default 1000 check (points_limit > 0),
  fighter_limit integer not null default 15 check (fighter_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fighter_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  fighter_profile_id uuid not null references public.fighter_profiles(id) on delete restrict,
  rules_release_id uuid not null references public.rules_releases(id) on delete restrict,
  faction_id uuid not null references public.factions(id) on delete restrict,
  stable_key text not null,
  name text not null,
  movement integer not null,
  toughness integer not null,
  wounds integer not null,
  points integer not null,
  base_size_mm integer,
  is_leader boolean not null default false,
  weapons jsonb not null default '[]'::jsonb,
  runemarks jsonb not null default '[]'::jsonb,
  source_document_id uuid references public.source_documents(id) on delete set null,
  source_page text,
  captured_at timestamptz not null default now()
);

create table if not exists public.warband_fighters (
  id uuid primary key default gen_random_uuid(),
  warband_id uuid not null references public.warbands(id) on delete cascade,
  fighter_profile_snapshot_id uuid not null references public.fighter_profile_snapshots(id) on delete restrict,
  fighter_profile_id uuid not null references public.fighter_profiles(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 80),
  status public.warband_fighter_status not null default 'active',
  is_leader boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists warbands_campaign_id_idx on public.warbands(campaign_id);
create index if not exists warbands_owner_id_idx on public.warbands(owner_id);
create index if not exists warbands_rules_release_id_idx on public.warbands(rules_release_id);
create index if not exists warbands_faction_id_idx on public.warbands(faction_id);
create index if not exists fighter_profile_snapshots_profile_id_idx on public.fighter_profile_snapshots(fighter_profile_id);
create index if not exists warband_fighters_warband_id_idx on public.warband_fighters(warband_id);
create index if not exists warband_fighters_profile_id_idx on public.warband_fighters(fighter_profile_id);
create unique index if not exists warband_fighters_one_active_leader_idx
on public.warband_fighters(warband_id)
where is_leader and status in ('active', 'recovering', 'missing');

drop trigger if exists set_warbands_updated_at on public.warbands;
create trigger set_warbands_updated_at
before update on public.warbands
for each row
execute function public.set_updated_at();

drop trigger if exists set_warband_fighters_updated_at on public.warband_fighters;
create trigger set_warband_fighters_updated_at
before update on public.warband_fighters
for each row
execute function public.set_updated_at();

create or replace function public.can_manage_warband(
  target_warband_id uuid,
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
    from public.warbands
    where id = target_warband_id
      and (
        owner_id = target_user_id
        or public.is_campaign_admin(campaign_id, target_user_id)
      )
  );
$$;

create or replace function public.is_warband_campaign_member(
  target_warband_id uuid,
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
    from public.warbands
    where id = target_warband_id
      and public.is_campaign_member(campaign_id, target_user_id)
  );
$$;

create or replace function public.validate_warband_for_battle_ready(target_warband_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  roster record;
begin
  select
    w.points_limit,
    w.fighter_limit,
    coalesce(sum(s.points) filter (where wf.status = 'active'), 0)::integer as total_points,
    count(*) filter (where wf.status = 'active')::integer as active_count,
    count(*) filter (where wf.status = 'active' and wf.is_leader)::integer as active_leaders
  into roster
  from public.warbands w
  left join public.warband_fighters wf on wf.warband_id = w.id
  left join public.fighter_profile_snapshots s on s.id = wf.fighter_profile_snapshot_id
  where w.id = target_warband_id
  group by w.id, w.points_limit, w.fighter_limit;

  if not found then
    raise exception 'Warband was not found.';
  end if;

  if roster.active_count < 1 then
    raise exception 'A battle-ready warband must include at least one active fighter.';
  end if;

  if roster.active_leaders <> 1 then
    raise exception 'A battle-ready warband must include exactly one active leader.';
  end if;

  if roster.total_points > roster.points_limit then
    raise exception 'Warband exceeds the point limit.';
  end if;

  if roster.active_count > roster.fighter_limit then
    raise exception 'Warband exceeds the fighter limit.';
  end if;
end;
$$;

create or replace function public.enforce_warband_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  faction_release_id uuid;
  campaign_release_id uuid;
begin
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'New warbands must start as drafts.';
  end if;

  select rules_release_id into faction_release_id
  from public.factions
  where id = new.faction_id;

  if faction_release_id is null then
    raise exception 'Warband faction was not found.';
  end if;

  select rules_release_id into campaign_release_id
  from public.campaigns
  where id = new.campaign_id;

  if campaign_release_id is not null and campaign_release_id <> faction_release_id then
    raise exception 'Warband faction must belong to the campaign rules release.';
  end if;

  new.rules_release_id = faction_release_id;

  if tg_op = 'UPDATE' then
    new.campaign_id = old.campaign_id;
    new.owner_id = old.owner_id;
    new.rules_release_id = old.rules_release_id;
    new.faction_id = old.faction_id;
  end if;

  if new.status = 'battle_ready' then
    perform public.validate_warband_for_battle_ready(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_warband_rules on public.warbands;
create trigger enforce_warband_rules
before insert or update on public.warbands
for each row
execute function public.enforce_warband_rules();

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

  if warband_record.status = 'battle_ready' then
    raise exception 'Return the warband to draft before changing its roster.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_warband_fighter_rules on public.warband_fighters;
create trigger enforce_warband_fighter_rules
before insert or update or delete on public.warband_fighters
for each row
execute function public.enforce_warband_fighter_rules();

create or replace function public.create_warband(
  target_campaign_id uuid,
  target_faction_id uuid,
  warband_name text
)
returns public.warbands
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  created_warband public.warbands%rowtype;
  faction_release uuid;
  campaign_record public.campaigns%rowtype;
begin
  actor := auth.uid();

  if actor is null then
    raise exception 'Authentication is required to create a warband.';
  end if;

  if not public.is_campaign_member(target_campaign_id, actor) then
    raise exception 'Only campaign members can create warbands.';
  end if;

  select * into campaign_record
  from public.campaigns
  where id = target_campaign_id;

  if not found then
    raise exception 'Campaign was not found.';
  end if;

  select rules_release_id into faction_release
  from public.factions
  where id = target_faction_id;

  if faction_release is null then
    raise exception 'Warband faction was not found.';
  end if;

  insert into public.warbands (
    campaign_id,
    owner_id,
    rules_release_id,
    faction_id,
    name,
    status,
    points_limit,
    fighter_limit
  )
  values (
    target_campaign_id,
    actor,
    faction_release,
    target_faction_id,
    trim(warband_name),
    'draft',
    campaign_record.warband_points_limit,
    campaign_record.warband_fighter_limit
  )
  returning *
  into created_warband;

  return created_warband;
end;
$$;

create or replace function public.add_warband_fighter(
  target_warband_id uuid,
  target_fighter_profile_id uuid,
  fighter_name text,
  designate_leader boolean default false
)
returns public.warband_fighters
language plpgsql
security definer
set search_path = public
as $$
declare
  warband_record public.warbands%rowtype;
  profile_record public.fighter_profiles%rowtype;
  snapshot_id uuid;
  created_fighter public.warband_fighters%rowtype;
  normalized_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to add a fighter.';
  end if;

  if not public.can_manage_warband(target_warband_id, auth.uid()) then
    raise exception 'Only the warband owner or a campaign administrator can manage this roster.';
  end if;

  select * into warband_record
  from public.warbands
  where id = target_warband_id;

  select * into profile_record
  from public.fighter_profiles
  where id = target_fighter_profile_id;

  if not found then
    raise exception 'Fighter profile was not found.';
  end if;

  if profile_record.rules_release_id <> warband_record.rules_release_id
    or profile_record.faction_id <> warband_record.faction_id
  then
    raise exception 'Fighter profile does not belong to this warband faction and rules release.';
  end if;

  if designate_leader and not profile_record.is_leader then
    raise exception 'Only fighter profiles with the leader runemark can be designated as leader.';
  end if;

  normalized_name := nullif(trim(coalesce(fighter_name, '')), '');

  insert into public.fighter_profile_snapshots (
    fighter_profile_id,
    rules_release_id,
    faction_id,
    stable_key,
    name,
    movement,
    toughness,
    wounds,
    points,
    base_size_mm,
    is_leader,
    weapons,
    runemarks,
    source_document_id,
    source_page
  )
  values (
    profile_record.id,
    profile_record.rules_release_id,
    profile_record.faction_id,
    profile_record.stable_key,
    profile_record.name,
    profile_record.movement,
    profile_record.toughness,
    profile_record.wounds,
    profile_record.points,
    profile_record.base_size_mm,
    profile_record.is_leader,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'stable_key', weapon.stable_key,
          'name', weapon.name,
          'range_min', weapon.range_min,
          'range_max', weapon.range_max,
          'attacks', weapon.attacks,
          'strength', weapon.strength,
          'damage', weapon.damage,
          'critical_damage', weapon.critical_damage
        )
        order by weapon.name
      )
      from public.weapon_profiles weapon
      where weapon.fighter_profile_id = profile_record.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'stable_key', runemark.stable_key,
          'name', runemark.name,
          'category', runemark.category
        )
        order by runemark.display_order, runemark.name
      )
      from public.fighter_profile_runemarks link
      join public.runemarks runemark on runemark.id = link.runemark_id
      where link.fighter_profile_id = profile_record.id
    ), '[]'::jsonb),
    profile_record.source_document_id,
    profile_record.source_page
  )
  returning id into snapshot_id;

  insert into public.warband_fighters (
    warband_id,
    fighter_profile_snapshot_id,
    fighter_profile_id,
    name,
    is_leader,
    sort_order
  )
  values (
    target_warband_id,
    snapshot_id,
    profile_record.id,
    coalesce(normalized_name, profile_record.name),
    designate_leader,
    (
      select coalesce(max(sort_order), 0) + 10
      from public.warband_fighters
      where warband_id = target_warband_id
    )
  )
  returning *
  into created_fighter;

  return created_fighter;
end;
$$;

alter table public.warbands enable row level security;
alter table public.fighter_profile_snapshots enable row level security;
alter table public.warband_fighters enable row level security;

drop policy if exists "Warbands are readable by campaign members" on public.warbands;
create policy "Warbands are readable by campaign members"
on public.warbands
for select
to authenticated
using (public.is_campaign_member(campaign_id));

drop policy if exists "Campaign members can create their own warbands" on public.warbands;
create policy "Campaign members can create their own warbands"
on public.warbands
for insert
to authenticated
with check (owner_id = auth.uid() and public.is_campaign_member(campaign_id));

drop policy if exists "Warband owners and campaign administrators can update warbands" on public.warbands;
create policy "Warband owners and campaign administrators can update warbands"
on public.warbands
for update
to authenticated
using (public.can_manage_warband(id))
with check (public.can_manage_warband(id));

drop policy if exists "Warband owners and campaign administrators can delete warbands" on public.warbands;
create policy "Warband owners and campaign administrators can delete warbands"
on public.warbands
for delete
to authenticated
using (public.can_manage_warband(id));

drop policy if exists "Warband snapshots are readable by campaign members" on public.fighter_profile_snapshots;
create policy "Warband snapshots are readable by campaign members"
on public.fighter_profile_snapshots
for select
to authenticated
using (
  exists (
    select 1
    from public.warband_fighters wf
    where wf.fighter_profile_snapshot_id = id
      and public.is_warband_campaign_member(wf.warband_id)
  )
);

drop policy if exists "Warband fighters are readable by campaign members" on public.warband_fighters;
create policy "Warband fighters are readable by campaign members"
on public.warband_fighters
for select
to authenticated
using (public.is_warband_campaign_member(warband_id));

drop policy if exists "Warband owners and campaign administrators can update fighters" on public.warband_fighters;
create policy "Warband owners and campaign administrators can update fighters"
on public.warband_fighters
for update
to authenticated
using (public.can_manage_warband(warband_id))
with check (public.can_manage_warband(warband_id));

drop policy if exists "Warband owners and campaign administrators can delete fighters" on public.warband_fighters;
create policy "Warband owners and campaign administrators can delete fighters"
on public.warband_fighters
for delete
to authenticated
using (public.can_manage_warband(warband_id));

revoke all on table public.warbands from anon, authenticated;
revoke all on table public.fighter_profile_snapshots from anon, authenticated;
revoke all on table public.warband_fighters from anon, authenticated;

grant select, insert, update (name, status, points_limit, fighter_limit), delete on table public.warbands to authenticated;
grant select on table public.fighter_profile_snapshots to authenticated;
grant select, update (name, status, is_leader, sort_order), delete on table public.warband_fighters to authenticated;
grant update (rules_release_id, warband_points_limit, warband_fighter_limit) on table public.campaigns to authenticated;

grant execute on function public.can_manage_warband(uuid, uuid) to authenticated;
grant execute on function public.is_warband_campaign_member(uuid, uuid) to authenticated;
grant execute on function public.create_warband(uuid, uuid, text) to authenticated;
grant execute on function public.add_warband_fighter(uuid, uuid, text, boolean) to authenticated;

notify pgrst, 'reload schema';
