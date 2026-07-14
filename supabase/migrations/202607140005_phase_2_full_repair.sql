create extension if not exists pgcrypto;

do $$
begin
  create type public.campaign_status as enum ('draft', 'active', 'completed', 'archived');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.campaign_member_role as enum ('owner', 'campaign_admin', 'player');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_user_id text unique,
  display_name text,
  avatar_url text,
  preferred_language text not null default 'en',
  timezone text not null default 'UTC',
  is_site_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  status public.campaign_status not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.campaign_member_role not null default 'player',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_uses is null or use_count <= max_uses)
);

create index if not exists campaigns_created_by_idx on public.campaigns(created_by);
create index if not exists campaign_members_user_id_idx on public.campaign_members(user_id);
create index if not exists campaign_invites_campaign_id_idx on public.campaign_invites(campaign_id);
create index if not exists campaign_invites_token_idx on public.campaign_invites(token);

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_campaigns_updated_at on public.campaigns;
create trigger set_campaigns_updated_at
before update on public.campaigns
for each row
execute function public.set_updated_at();

drop trigger if exists set_campaign_members_updated_at on public.campaign_members;
create trigger set_campaign_members_updated_at
before update on public.campaign_members
for each row
execute function public.set_updated_at();

drop trigger if exists set_campaign_invites_updated_at on public.campaign_invites;
create trigger set_campaign_invites_updated_at
before update on public.campaign_invites
for each row
execute function public.set_updated_at();

create or replace function public.handle_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb;
  discord_id text;
  next_display_name text;
  next_avatar_url text;
begin
  metadata := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  discord_id := coalesce(
    metadata->>'provider_id',
    metadata->>'sub',
    metadata->>'discord_user_id'
  );
  next_display_name := coalesce(
    metadata->'custom_claims'->>'global_name',
    metadata->>'global_name',
    metadata->>'full_name',
    metadata->>'name',
    metadata->>'user_name',
    metadata->>'preferred_username'
  );
  next_avatar_url := coalesce(
    metadata->>'avatar_url',
    metadata->>'picture'
  );

  insert into public.profiles (
    id,
    discord_user_id,
    display_name,
    avatar_url,
    preferred_language,
    timezone,
    last_seen_at
  )
  values (
    new.id,
    discord_id,
    next_display_name,
    next_avatar_url,
    'en',
    'UTC',
    now()
  )
  on conflict (id) do update
  set
    discord_user_id = coalesce(excluded.discord_user_id, public.profiles.discord_user_id),
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    last_seen_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
after insert or update of raw_user_meta_data, last_sign_in_at on auth.users
for each row
execute function public.handle_auth_profile();

create or replace function public.is_campaign_member(
  target_campaign_id uuid,
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
    from public.campaign_members
    where campaign_id = target_campaign_id
      and user_id = target_user_id
  );
$$;

create or replace function public.get_campaign_member_role(
  target_campaign_id uuid,
  target_user_id uuid default auth.uid()
)
returns public.campaign_member_role
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.campaign_members
  where campaign_id = target_campaign_id
    and user_id = target_user_id
  limit 1;
$$;

create or replace function public.is_campaign_admin(
  target_campaign_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    public.get_campaign_member_role(target_campaign_id, target_user_id) in ('owner', 'campaign_admin'),
    false
  );
$$;

create or replace function public.is_campaign_owner(
  target_campaign_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    public.get_campaign_member_role(target_campaign_id, target_user_id) = 'owner',
    false
  );
$$;

create or replace function public.campaign_has_other_owner(
  target_campaign_id uuid,
  target_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.campaign_members
    where campaign_id = target_campaign_id
      and user_id <> target_user_id
      and role = 'owner'
  );
$$;

create or replace function public.shares_campaign_with_user(
  target_user_id uuid,
  actor uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.campaign_members actor_membership
    join public.campaign_members target_membership
      on target_membership.campaign_id = actor_membership.campaign_id
    where actor_membership.user_id = actor
      and target_membership.user_id = target_user_id
  );
$$;

create or replace function public.add_campaign_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (campaign_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_campaign_created_add_owner on public.campaigns;
create trigger on_campaign_created_add_owner
after insert on public.campaigns
for each row
execute function public.add_campaign_owner_membership();

create or replace function public.enforce_campaign_update_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    and (new.status = 'archived' or old.status = 'archived')
    and not public.is_campaign_owner(old.id, auth.uid())
  then
    raise exception 'Only campaign owners may archive or restore campaigns.';
  end if;

  new.created_by = old.created_by;
  return new;
end;
$$;

drop trigger if exists enforce_campaign_update_rules on public.campaigns;
create trigger enforce_campaign_update_rules
before update on public.campaigns
for each row
execute function public.enforce_campaign_update_rules();

create or replace function public.enforce_campaign_member_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.campaign_id = old.campaign_id;
    new.user_id = old.user_id;
    new.joined_at = old.joined_at;

    if old.role = 'owner' or new.role = 'owner' then
      raise exception 'Ownership transfer is not available yet.';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' and not public.campaign_has_other_owner(old.campaign_id, old.user_id) then
      raise exception 'The sole campaign owner cannot leave or be removed.';
    end if;

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists enforce_campaign_member_rules on public.campaign_members;
create trigger enforce_campaign_member_rules
before update or delete on public.campaign_members
for each row
execute function public.enforce_campaign_member_rules();

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

create or replace function public.accept_campaign_invite(invite_token text)
returns table (campaign_id uuid, role public.campaign_member_role)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.campaign_invites%rowtype;
  actor uuid;
begin
  actor := auth.uid();

  if actor is null then
    raise exception 'Authentication is required to accept a campaign invitation.';
  end if;

  select *
  into invite
  from public.campaign_invites
  where token = invite_token
  for update;

  if not found then
    raise exception 'Campaign invitation was not found.';
  end if;

  if invite.disabled_at is not null then
    raise exception 'Campaign invitation is disabled.';
  end if;

  if invite.expires_at is not null and invite.expires_at <= now() then
    raise exception 'Campaign invitation has expired.';
  end if;

  if invite.max_uses is not null and invite.use_count >= invite.max_uses then
    raise exception 'Campaign invitation has no remaining uses.';
  end if;

  if public.is_campaign_member(invite.campaign_id, actor) then
    raise exception 'You are already a member of this campaign.';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (invite.campaign_id, actor, 'player');

  update public.campaign_invites
  set use_count = use_count + 1
  where id = invite.id;

  return query
  select invite.campaign_id, 'player'::public.campaign_member_role;
end;
$$;

drop policy if exists "Profiles are readable by their owner" on public.profiles;
drop policy if exists "Profiles are readable by their owner or campaign members" on public.profiles;
create policy "Profiles are readable by their owner or campaign members"
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.shares_campaign_with_user(id));

drop policy if exists "Profiles are editable by their owner" on public.profiles;
create policy "Profiles are editable by their owner"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Campaigns are readable by members" on public.campaigns;
create policy "Campaigns are readable by members"
on public.campaigns
for select
to authenticated
using (public.is_campaign_member(id) or created_by = auth.uid());

drop policy if exists "Authenticated users can create campaigns" on public.campaigns;
create policy "Authenticated users can create campaigns"
on public.campaigns
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "Campaign administrators can update campaigns" on public.campaigns;
create policy "Campaign administrators can update campaigns"
on public.campaigns
for update
to authenticated
using (public.is_campaign_admin(id))
with check (public.is_campaign_admin(id));

drop policy if exists "Campaign members are readable by campaign members" on public.campaign_members;
create policy "Campaign members are readable by campaign members"
on public.campaign_members
for select
to authenticated
using (public.is_campaign_member(campaign_id));

drop policy if exists "Campaign administrators can update member roles" on public.campaign_members;
create policy "Campaign administrators can update member roles"
on public.campaign_members
for update
to authenticated
using (public.is_campaign_admin(campaign_id))
with check (public.is_campaign_admin(campaign_id));

drop policy if exists "Members and administrators can remove members" on public.campaign_members;
create policy "Members and administrators can remove members"
on public.campaign_members
for delete
to authenticated
using (auth.uid() = user_id or public.is_campaign_admin(campaign_id));

drop policy if exists "Campaign administrators can read invites" on public.campaign_invites;
create policy "Campaign administrators can read invites"
on public.campaign_invites
for select
to authenticated
using (public.is_campaign_admin(campaign_id));

drop policy if exists "Campaign administrators can create invites" on public.campaign_invites;
create policy "Campaign administrators can create invites"
on public.campaign_invites
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_campaign_admin(campaign_id)
);

drop policy if exists "Campaign administrators can update invites" on public.campaign_invites;
create policy "Campaign administrators can update invites"
on public.campaign_invites
for update
to authenticated
using (public.is_campaign_admin(campaign_id))
with check (public.is_campaign_admin(campaign_id));

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
revoke all on table public.campaigns from anon;
revoke all on table public.campaign_members from anon;
revoke all on table public.campaign_invites from anon;
revoke all on table public.campaigns from authenticated;
revoke all on table public.campaign_members from authenticated;
revoke all on table public.campaign_invites from authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, preferred_language, timezone) on table public.profiles to authenticated;
grant select, insert, update (name, description, status) on table public.campaigns to authenticated;
grant select, update (role), delete on table public.campaign_members to authenticated;
grant select, insert, update (disabled_at, max_uses, expires_at) on table public.campaign_invites to authenticated;

grant execute on function public.is_campaign_member(uuid, uuid) to authenticated;
grant execute on function public.get_campaign_member_role(uuid, uuid) to authenticated;
grant execute on function public.is_campaign_admin(uuid, uuid) to authenticated;
grant execute on function public.is_campaign_owner(uuid, uuid) to authenticated;
grant execute on function public.shares_campaign_with_user(uuid, uuid) to authenticated;
grant execute on function public.accept_campaign_invite(text) to authenticated;
grant execute on function public.create_campaign(text, text, text) to authenticated;

notify pgrst, 'reload schema';
