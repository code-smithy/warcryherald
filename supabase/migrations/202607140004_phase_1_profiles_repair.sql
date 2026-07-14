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

alter table public.profiles enable row level security;

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

create or replace function public.shares_campaign_with_user(
  target_user_id uuid,
  actor uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  shares_campaign boolean;
begin
  if to_regclass('public.campaign_members') is null then
    return false;
  end if;

  execute $query$
    select exists (
      select 1
      from public.campaign_members actor_membership
      join public.campaign_members target_membership
        on target_membership.campaign_id = actor_membership.campaign_id
      where actor_membership.user_id = $1
        and target_membership.user_id = $2
    )
  $query$
  into shares_campaign
  using actor, target_user_id;

  return coalesce(shares_campaign, false);
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

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, preferred_language, timezone) on table public.profiles to authenticated;

notify pgrst, 'reload schema';
