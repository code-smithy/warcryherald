create or replace function public.delete_campaign(target_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  actor := auth.uid();

  if actor is null then
    raise exception 'Authentication is required to delete a campaign.';
  end if;

  if not public.is_campaign_owner(target_campaign_id, actor) then
    raise exception 'Only campaign owners may delete campaigns.';
  end if;

  delete from public.battles
  where campaign_id = target_campaign_id;

  delete from public.fighter_artefacts
  where warband_artefact_id in (
    select artefact.id
    from public.warband_artefacts artefact
    join public.warbands warband on warband.id = artefact.warband_id
    where warband.campaign_id = target_campaign_id
  )
  or warband_fighter_id in (
    select fighter.id
    from public.warband_fighters fighter
    join public.warbands warband on warband.id = fighter.warband_id
    where warband.campaign_id = target_campaign_id
  );

  delete from public.fighter_renown
  where warband_fighter_id in (
    select fighter.id
    from public.warband_fighters fighter
    join public.warbands warband on warband.id = fighter.warband_id
    where warband.campaign_id = target_campaign_id
  );

  delete from public.fighter_heroic_traits
  where warband_fighter_id in (
    select fighter.id
    from public.warband_fighters fighter
    join public.warbands warband on warband.id = fighter.warband_id
    where warband.campaign_id = target_campaign_id
  );

  delete from public.fighter_injuries
  where warband_fighter_id in (
    select fighter.id
    from public.warband_fighters fighter
    join public.warbands warband on warband.id = fighter.warband_id
    where warband.campaign_id = target_campaign_id
  );

  delete from public.warband_fighters
  where warband_id in (
    select id
    from public.warbands
    where campaign_id = target_campaign_id
  );

  delete from public.warband_encampments
  where warband_id in (
    select id
    from public.warbands
    where campaign_id = target_campaign_id
  );

  delete from public.warband_quests
  where warband_id in (
    select id
    from public.warbands
    where campaign_id = target_campaign_id
  );

  delete from public.warband_artefacts
  where warband_id in (
    select id
    from public.warbands
    where campaign_id = target_campaign_id
  );

  delete from public.warband_progress
  where warband_id in (
    select id
    from public.warbands
    where campaign_id = target_campaign_id
  );

  delete from public.warband_journal_entries
  where warband_id in (
    select id
    from public.warbands
    where campaign_id = target_campaign_id
  );

  delete from public.activity_log
  where campaign_id = target_campaign_id;

  delete from public.warbands
  where campaign_id = target_campaign_id;

  delete from public.campaigns
  where id = target_campaign_id;
end;
$$;

grant execute on function public.delete_campaign(uuid) to authenticated;

notify pgrst, 'reload schema';
