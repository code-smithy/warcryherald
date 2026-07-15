create or replace function public.enforce_warband_fighter_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  warband_record public.warbands%rowtype;
  snapshot_record public.fighter_profile_snapshots%rowtype;
  active_count integer;
  active_points integer;
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
    raise exception 'Return the warband to draft before changing its roster.';
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

  select
    count(*) filter (where wf.status = 'active')::integer,
    coalesce(sum(s.points) filter (where wf.status = 'active'), 0)::integer
  into active_count, active_points
  from public.warband_fighters wf
  join public.fighter_profile_snapshots s on s.id = wf.fighter_profile_snapshot_id
  where wf.warband_id = new.warband_id
    and (tg_op = 'INSERT' or wf.id <> new.id);

  if new.status = 'active' then
    active_count := active_count + 1;
    active_points := active_points + snapshot_record.points;
  end if;

  if active_count > warband_record.fighter_limit then
    raise exception 'Warband exceeds the fighter limit.';
  end if;

  if active_points > warband_record.points_limit then
    raise exception 'Warband exceeds the point limit.';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
