create or replace function public.enforce_warband_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  faction_release_id uuid;
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
    fighter_minimum,
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
    campaign_record.warband_fighter_minimum,
    campaign_record.warband_fighter_limit
  )
  returning * into created_warband;

  return created_warband;
end;
$$;
