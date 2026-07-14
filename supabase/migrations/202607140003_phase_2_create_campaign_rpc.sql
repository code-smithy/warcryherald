drop function if exists public.create_campaign(text, text, public.campaign_status);
drop function if exists public.create_campaign(text, text, text);

create or replace function public.create_campaign(
  campaign_name text,
  campaign_description text default '',
  campaign_status text default 'draft'
)
returns public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  normalized_status public.campaign_status;
  created_campaign public.campaigns%rowtype;
begin
  actor := auth.uid();

  if actor is null then
    raise exception 'Authentication is required to create a campaign.';
  end if;

  if campaign_status not in ('draft', 'active', 'completed') then
    raise exception 'New campaigns must start as draft, active, or completed.';
  end if;

  normalized_status := campaign_status::public.campaign_status;

  insert into public.profiles (id)
  values (actor)
  on conflict (id) do nothing;

  insert into public.campaigns (name, description, status, created_by)
  values (
    trim(campaign_name),
    trim(coalesce(campaign_description, '')),
    normalized_status,
    actor
  )
  returning *
  into created_campaign;

  return created_campaign;
end;
$$;

grant execute on function public.create_campaign(text, text, text) to authenticated;

notify pgrst, 'reload schema';
