create or replace function public.ensure_current_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  auth_metadata jsonb;
  discord_id text;
  next_display_name text;
  next_avatar_url text;
  current_profile public.profiles%rowtype;
begin
  actor := auth.uid();

  if actor is null then
    raise exception 'Authentication is required to load a profile.';
  end if;

  select coalesce(raw_user_meta_data, '{}'::jsonb)
  into auth_metadata
  from auth.users
  where id = actor;

  auth_metadata := coalesce(auth_metadata, '{}'::jsonb);
  discord_id := coalesce(
    auth_metadata->>'provider_id',
    auth_metadata->>'sub',
    auth_metadata->>'discord_user_id'
  );
  next_display_name := coalesce(
    auth_metadata->'custom_claims'->>'global_name',
    auth_metadata->>'global_name',
    auth_metadata->>'full_name',
    auth_metadata->>'name',
    auth_metadata->>'user_name',
    auth_metadata->>'preferred_username'
  );
  next_avatar_url := coalesce(
    auth_metadata->>'avatar_url',
    auth_metadata->>'picture'
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
    actor,
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
    last_seen_at = now()
  returning *
  into current_profile;

  return current_profile;
end;
$$;

create or replace function public.update_current_profile(
  next_display_name text,
  next_preferred_language text,
  next_timezone text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles%rowtype;
begin
  current_profile := public.ensure_current_profile();

  update public.profiles
  set
    display_name = trim(coalesce(next_display_name, '')),
    preferred_language = coalesce(nullif(trim(next_preferred_language), ''), 'en'),
    timezone = coalesce(nullif(trim(next_timezone), ''), 'UTC')
  where id = current_profile.id
  returning *
  into current_profile;

  return current_profile;
end;
$$;

grant execute on function public.ensure_current_profile() to authenticated;
grant execute on function public.update_current_profile(text, text, text) to authenticated;

notify pgrst, 'reload schema';
