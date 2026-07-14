create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique check (stable_key ~ '^[a-z0-9][a-z0-9-]*$'),
  title text not null check (char_length(trim(title)) between 1 and 160),
  publisher text not null default '',
  source_url text,
  language text not null default 'en' check (char_length(trim(language)) between 2 and 12),
  published_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rules_releases (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique check (stable_key ~ '^[a-z0-9][a-z0-9-]*$'),
  source_document_id uuid references public.source_documents(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  release_date date not null,
  language text not null default 'en' check (char_length(trim(language)) between 2 and 12),
  status text not null default 'draft' check (status in ('draft', 'current', 'retired')),
  source_url text,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grand_alliances (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique check (stable_key ~ '^[a-z0-9][a-z0-9-]*$'),
  name text not null check (char_length(trim(name)) between 1 and 80),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.factions (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique check (stable_key ~ '^[a-z0-9][a-z0-9-]*$'),
  rules_release_id uuid not null references public.rules_releases(id) on delete restrict,
  grand_alliance_id uuid not null references public.grand_alliances(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.runemarks (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique check (stable_key ~ '^[a-z0-9][a-z0-9-]*$'),
  name text not null check (char_length(trim(name)) between 1 and 80),
  category text not null default 'fighter' check (category in ('fighter', 'faction', 'ability', 'universal')),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fighter_profiles (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique check (stable_key ~ '^[a-z0-9][a-z0-9-]*$'),
  rules_release_id uuid not null references public.rules_releases(id) on delete restrict,
  faction_id uuid not null references public.factions(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  movement integer not null check (movement between 1 and 20),
  toughness integer not null check (toughness between 1 and 20),
  wounds integer not null check (wounds between 1 and 200),
  points integer not null check (points > 0),
  base_size_mm integer check (base_size_mm is null or base_size_mm > 0),
  is_leader boolean not null default false,
  is_current boolean not null default true,
  source_document_id uuid references public.source_documents(id) on delete set null,
  source_page text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fighter_profile_runemarks (
  fighter_profile_id uuid not null references public.fighter_profiles(id) on delete cascade,
  runemark_id uuid not null references public.runemarks(id) on delete restrict,
  primary key (fighter_profile_id, runemark_id)
);

create table if not exists public.weapon_profiles (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique check (stable_key ~ '^[a-z0-9][a-z0-9-]*$'),
  fighter_profile_id uuid not null references public.fighter_profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  range_min integer not null default 1 check (range_min >= 0),
  range_max integer not null check (range_max >= range_min),
  attacks integer not null check (attacks between 1 and 20),
  strength integer not null check (strength between 1 and 20),
  damage integer not null check (damage >= 0),
  critical_damage integer not null check (critical_damage >= damage),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.abilities (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique check (stable_key ~ '^[a-z0-9][a-z0-9-]*$'),
  rules_release_id uuid not null references public.rules_releases(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  ability_type text not null default 'faction' check (ability_type in ('faction', 'universal')),
  cost text not null default '',
  effect text not null default '',
  source_document_id uuid references public.source_documents(id) on delete set null,
  source_page text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ability_runemarks (
  ability_id uuid not null references public.abilities(id) on delete cascade,
  runemark_id uuid not null references public.runemarks(id) on delete restrict,
  primary key (ability_id, runemark_id)
);

create table if not exists public.faction_abilities (
  faction_id uuid not null references public.factions(id) on delete cascade,
  ability_id uuid not null references public.abilities(id) on delete cascade,
  primary key (faction_id, ability_id)
);

create table if not exists public.universal_abilities (
  ability_id uuid primary key references public.abilities(id) on delete cascade
);

create table if not exists public.blessings (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique check (stable_key ~ '^[a-z0-9][a-z0-9-]*$'),
  rules_release_id uuid not null references public.rules_releases(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  effect text not null default '',
  points integer check (points is null or points >= 0),
  source_document_id uuid references public.source_documents(id) on delete set null,
  source_page text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rules_releases_status_idx on public.rules_releases(status);
create index if not exists factions_rules_release_id_idx on public.factions(rules_release_id);
create index if not exists factions_grand_alliance_id_idx on public.factions(grand_alliance_id);
create index if not exists fighter_profiles_rules_release_id_idx on public.fighter_profiles(rules_release_id);
create index if not exists fighter_profiles_faction_id_idx on public.fighter_profiles(faction_id);
create index if not exists fighter_profiles_current_idx on public.fighter_profiles(is_current);
create index if not exists weapon_profiles_fighter_profile_id_idx on public.weapon_profiles(fighter_profile_id);
create index if not exists abilities_rules_release_id_idx on public.abilities(rules_release_id);
create index if not exists blessings_rules_release_id_idx on public.blessings(rules_release_id);

drop trigger if exists set_source_documents_updated_at on public.source_documents;
create trigger set_source_documents_updated_at
before update on public.source_documents
for each row
execute function public.set_updated_at();

drop trigger if exists set_rules_releases_updated_at on public.rules_releases;
create trigger set_rules_releases_updated_at
before update on public.rules_releases
for each row
execute function public.set_updated_at();

drop trigger if exists set_grand_alliances_updated_at on public.grand_alliances;
create trigger set_grand_alliances_updated_at
before update on public.grand_alliances
for each row
execute function public.set_updated_at();

drop trigger if exists set_factions_updated_at on public.factions;
create trigger set_factions_updated_at
before update on public.factions
for each row
execute function public.set_updated_at();

drop trigger if exists set_runemarks_updated_at on public.runemarks;
create trigger set_runemarks_updated_at
before update on public.runemarks
for each row
execute function public.set_updated_at();

drop trigger if exists set_fighter_profiles_updated_at on public.fighter_profiles;
create trigger set_fighter_profiles_updated_at
before update on public.fighter_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_weapon_profiles_updated_at on public.weapon_profiles;
create trigger set_weapon_profiles_updated_at
before update on public.weapon_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_abilities_updated_at on public.abilities;
create trigger set_abilities_updated_at
before update on public.abilities
for each row
execute function public.set_updated_at();

drop trigger if exists set_blessings_updated_at on public.blessings;
create trigger set_blessings_updated_at
before update on public.blessings
for each row
execute function public.set_updated_at();

alter table public.source_documents enable row level security;
alter table public.rules_releases enable row level security;
alter table public.grand_alliances enable row level security;
alter table public.factions enable row level security;
alter table public.runemarks enable row level security;
alter table public.fighter_profiles enable row level security;
alter table public.fighter_profile_runemarks enable row level security;
alter table public.weapon_profiles enable row level security;
alter table public.abilities enable row level security;
alter table public.ability_runemarks enable row level security;
alter table public.faction_abilities enable row level security;
alter table public.universal_abilities enable row level security;
alter table public.blessings enable row level security;

drop policy if exists "Reference data is publicly readable" on public.source_documents;
create policy "Reference data is publicly readable" on public.source_documents
for select to anon, authenticated using (true);

drop policy if exists "Reference data is publicly readable" on public.rules_releases;
create policy "Reference data is publicly readable" on public.rules_releases
for select to anon, authenticated using (true);

drop policy if exists "Reference data is publicly readable" on public.grand_alliances;
create policy "Reference data is publicly readable" on public.grand_alliances
for select to anon, authenticated using (true);

drop policy if exists "Reference data is publicly readable" on public.factions;
create policy "Reference data is publicly readable" on public.factions
for select to anon, authenticated using (true);

drop policy if exists "Reference data is publicly readable" on public.runemarks;
create policy "Reference data is publicly readable" on public.runemarks
for select to anon, authenticated using (true);

drop policy if exists "Reference data is publicly readable" on public.fighter_profiles;
create policy "Reference data is publicly readable" on public.fighter_profiles
for select to anon, authenticated using (true);

drop policy if exists "Reference data is publicly readable" on public.fighter_profile_runemarks;
create policy "Reference data is publicly readable" on public.fighter_profile_runemarks
for select to anon, authenticated using (true);

drop policy if exists "Reference data is publicly readable" on public.weapon_profiles;
create policy "Reference data is publicly readable" on public.weapon_profiles
for select to anon, authenticated using (true);

drop policy if exists "Reference data is publicly readable" on public.abilities;
create policy "Reference data is publicly readable" on public.abilities
for select to anon, authenticated using (true);

drop policy if exists "Reference data is publicly readable" on public.ability_runemarks;
create policy "Reference data is publicly readable" on public.ability_runemarks
for select to anon, authenticated using (true);

drop policy if exists "Reference data is publicly readable" on public.faction_abilities;
create policy "Reference data is publicly readable" on public.faction_abilities
for select to anon, authenticated using (true);

drop policy if exists "Reference data is publicly readable" on public.universal_abilities;
create policy "Reference data is publicly readable" on public.universal_abilities
for select to anon, authenticated using (true);

drop policy if exists "Reference data is publicly readable" on public.blessings;
create policy "Reference data is publicly readable" on public.blessings
for select to anon, authenticated using (true);

revoke all on table public.source_documents from anon, authenticated;
revoke all on table public.rules_releases from anon, authenticated;
revoke all on table public.grand_alliances from anon, authenticated;
revoke all on table public.factions from anon, authenticated;
revoke all on table public.runemarks from anon, authenticated;
revoke all on table public.fighter_profiles from anon, authenticated;
revoke all on table public.fighter_profile_runemarks from anon, authenticated;
revoke all on table public.weapon_profiles from anon, authenticated;
revoke all on table public.abilities from anon, authenticated;
revoke all on table public.ability_runemarks from anon, authenticated;
revoke all on table public.faction_abilities from anon, authenticated;
revoke all on table public.universal_abilities from anon, authenticated;
revoke all on table public.blessings from anon, authenticated;

grant select on table public.source_documents to anon, authenticated;
grant select on table public.rules_releases to anon, authenticated;
grant select on table public.grand_alliances to anon, authenticated;
grant select on table public.factions to anon, authenticated;
grant select on table public.runemarks to anon, authenticated;
grant select on table public.fighter_profiles to anon, authenticated;
grant select on table public.fighter_profile_runemarks to anon, authenticated;
grant select on table public.weapon_profiles to anon, authenticated;
grant select on table public.abilities to anon, authenticated;
grant select on table public.ability_runemarks to anon, authenticated;
grant select on table public.faction_abilities to anon, authenticated;
grant select on table public.universal_abilities to anon, authenticated;
grant select on table public.blessings to anon, authenticated;

notify pgrst, 'reload schema';
