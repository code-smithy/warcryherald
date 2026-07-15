create table if not exists public.warband_progress (
  id uuid primary key default gen_random_uuid(),
  warband_id uuid not null unique references public.warbands(id) on delete cascade,
  glory integer not null default 0 check (glory >= 0),
  reputation integer not null default 0 check (reputation >= 0),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.encampment_definitions (
  id uuid primary key default gen_random_uuid(),
  rules_release_id uuid not null references public.rules_releases(id) on delete cascade,
  stable_key text not null,
  name text not null,
  description text not null default '',
  unique (rules_release_id, stable_key)
);

create table if not exists public.quest_definitions (
  id uuid primary key default gen_random_uuid(),
  rules_release_id uuid not null references public.rules_releases(id) on delete cascade,
  stable_key text not null,
  name text not null,
  description text not null default '',
  unique (rules_release_id, stable_key)
);

create table if not exists public.artefact_definitions (
  id uuid primary key default gen_random_uuid(),
  rules_release_id uuid not null references public.rules_releases(id) on delete cascade,
  stable_key text not null,
  name text not null,
  description text not null default '',
  unique (rules_release_id, stable_key)
);

create table if not exists public.warband_encampments (
  id uuid primary key default gen_random_uuid(),
  warband_id uuid not null unique references public.warbands(id) on delete cascade,
  encampment_definition_id uuid not null references public.encampment_definitions(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null default auth.uid(),
  assigned_at timestamptz not null default now()
);

create table if not exists public.warband_quests (
  id uuid primary key default gen_random_uuid(),
  warband_id uuid not null references public.warbands(id) on delete cascade,
  quest_definition_id uuid not null references public.quest_definitions(id) on delete restrict,
  progress integer not null default 0 check (progress >= 0),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warband_artefacts (
  id uuid primary key default gen_random_uuid(),
  warband_id uuid not null references public.warbands(id) on delete cascade,
  artefact_definition_id uuid not null references public.artefact_definitions(id) on delete restrict,
  name text not null,
  notes text not null default '',
  acquired_by uuid references auth.users(id) on delete set null default auth.uid(),
  acquired_at timestamptz not null default now()
);

create table if not exists public.fighter_artefacts (
  id uuid primary key default gen_random_uuid(),
  warband_artefact_id uuid not null references public.warband_artefacts(id) on delete cascade,
  warband_fighter_id uuid not null references public.warband_fighters(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null default auth.uid(),
  assigned_at timestamptz not null default now(),
  unique (warband_artefact_id)
);

create table if not exists public.heroic_trait_definitions (
  id uuid primary key default gen_random_uuid(),
  rules_release_id uuid not null references public.rules_releases(id) on delete cascade,
  stable_key text not null,
  name text not null,
  description text not null default '',
  unique (rules_release_id, stable_key)
);

create table if not exists public.fighter_heroic_traits (
  id uuid primary key default gen_random_uuid(),
  warband_fighter_id uuid not null references public.warband_fighters(id) on delete cascade,
  heroic_trait_definition_id uuid not null references public.heroic_trait_definitions(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null default auth.uid(),
  assigned_at timestamptz not null default now(),
  unique (warband_fighter_id, heroic_trait_definition_id)
);

create table if not exists public.fighter_renown (
  id uuid primary key default gen_random_uuid(),
  warband_fighter_id uuid not null unique references public.warband_fighters(id) on delete cascade,
  renown integer not null default 0 check (renown >= 0),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fighter_injuries (
  id uuid primary key default gen_random_uuid(),
  warband_fighter_id uuid not null references public.warband_fighters(id) on delete cascade,
  name text not null,
  description text not null default '',
  recovered_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.warband_journal_entries (
  id uuid primary key default gen_random_uuid(),
  warband_id uuid not null references public.warbands(id) on delete cascade,
  event_type text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists warband_journal_entries_warband_id_created_at_idx
on public.warband_journal_entries(warband_id, created_at desc);

drop trigger if exists set_warband_progress_updated_at on public.warband_progress;
create trigger set_warband_progress_updated_at
before update on public.warband_progress
for each row
execute function public.set_updated_at();

drop trigger if exists set_warband_quests_updated_at on public.warband_quests;
create trigger set_warband_quests_updated_at
before update on public.warband_quests
for each row
execute function public.set_updated_at();

create or replace function public.record_warband_progress_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.warband_journal_entries (warband_id, event_type, summary, details, created_by)
  values (
    new.warband_id,
    'progression_updated',
    'Warband progression updated.',
    jsonb_build_object('glory', new.glory, 'reputation', new.reputation),
    auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists record_warband_progress_journal on public.warband_progress;
create trigger record_warband_progress_journal
after insert or update on public.warband_progress
for each row
execute function public.record_warband_progress_journal();

alter table public.warband_progress enable row level security;
alter table public.encampment_definitions enable row level security;
alter table public.quest_definitions enable row level security;
alter table public.artefact_definitions enable row level security;
alter table public.warband_encampments enable row level security;
alter table public.warband_quests enable row level security;
alter table public.warband_artefacts enable row level security;
alter table public.fighter_artefacts enable row level security;
alter table public.heroic_trait_definitions enable row level security;
alter table public.fighter_heroic_traits enable row level security;
alter table public.fighter_renown enable row level security;
alter table public.fighter_injuries enable row level security;
alter table public.warband_journal_entries enable row level security;

create policy "Progression is readable by campaign members" on public.warband_progress
for select to authenticated
using (public.is_warband_campaign_member(warband_id));

create policy "Warband managers can maintain progression" on public.warband_progress
for all to authenticated
using (public.can_manage_warband(warband_id))
with check (public.can_manage_warband(warband_id));

create policy "Progression definitions are readable" on public.encampment_definitions
for select to anon, authenticated using (true);
create policy "Quest definitions are readable" on public.quest_definitions
for select to anon, authenticated using (true);
create policy "Artefact definitions are readable" on public.artefact_definitions
for select to anon, authenticated using (true);
create policy "Heroic trait definitions are readable" on public.heroic_trait_definitions
for select to anon, authenticated using (true);

create policy "Encampments are readable by campaign members" on public.warband_encampments
for select to authenticated using (public.is_warband_campaign_member(warband_id));
create policy "Warband managers can maintain encampments" on public.warband_encampments
for all to authenticated using (public.can_manage_warband(warband_id)) with check (public.can_manage_warband(warband_id));

create policy "Quests are readable by campaign members" on public.warband_quests
for select to authenticated using (public.is_warband_campaign_member(warband_id));
create policy "Warband managers can maintain quests" on public.warband_quests
for all to authenticated using (public.can_manage_warband(warband_id)) with check (public.can_manage_warband(warband_id));

create policy "Artefacts are readable by campaign members" on public.warband_artefacts
for select to authenticated using (public.is_warband_campaign_member(warband_id));
create policy "Warband managers can maintain artefacts" on public.warband_artefacts
for all to authenticated using (public.can_manage_warband(warband_id)) with check (public.can_manage_warband(warband_id));


create policy "Fighter artefacts are readable by campaign members" on public.fighter_artefacts
for select to authenticated using (
  exists (
    select 1 from public.warband_artefacts wa
    where wa.id = fighter_artefacts.warband_artefact_id
      and public.is_warband_campaign_member(wa.warband_id)
  )
);
create policy "Warband managers can maintain fighter artefacts" on public.fighter_artefacts
for all to authenticated using (
  exists (
    select 1 from public.warband_artefacts wa
    where wa.id = fighter_artefacts.warband_artefact_id
      and public.can_manage_warband(wa.warband_id)
  )
) with check (
  exists (
    select 1 from public.warband_artefacts wa
    where wa.id = fighter_artefacts.warband_artefact_id
      and public.can_manage_warband(wa.warband_id)
  )
);

create policy "Heroic traits are readable by campaign members" on public.fighter_heroic_traits
for select to authenticated using (
  exists (
    select 1 from public.warband_fighters wf
    where wf.id = fighter_heroic_traits.warband_fighter_id
      and public.is_warband_campaign_member(wf.warband_id)
  )
);
create policy "Warband managers can maintain heroic traits" on public.fighter_heroic_traits
for all to authenticated using (
  exists (
    select 1 from public.warband_fighters wf
    where wf.id = fighter_heroic_traits.warband_fighter_id
      and public.can_manage_warband(wf.warband_id)
  )
) with check (
  exists (
    select 1 from public.warband_fighters wf
    where wf.id = fighter_heroic_traits.warband_fighter_id
      and public.can_manage_warband(wf.warband_id)
  )
);

create policy "Renown is readable by campaign members" on public.fighter_renown
for select to authenticated using (
  exists (
    select 1 from public.warband_fighters wf
    where wf.id = fighter_renown.warband_fighter_id
      and public.is_warband_campaign_member(wf.warband_id)
  )
);
create policy "Warband managers can maintain renown" on public.fighter_renown
for all to authenticated using (
  exists (
    select 1 from public.warband_fighters wf
    where wf.id = fighter_renown.warband_fighter_id
      and public.can_manage_warband(wf.warband_id)
  )
) with check (
  exists (
    select 1 from public.warband_fighters wf
    where wf.id = fighter_renown.warband_fighter_id
      and public.can_manage_warband(wf.warband_id)
  )
);

create policy "Injuries are readable by campaign members" on public.fighter_injuries
for select to authenticated using (
  exists (
    select 1 from public.warband_fighters wf
    where wf.id = fighter_injuries.warband_fighter_id
      and public.is_warband_campaign_member(wf.warband_id)
  )
);
create policy "Warband managers can maintain injuries" on public.fighter_injuries
for all to authenticated using (
  exists (
    select 1 from public.warband_fighters wf
    where wf.id = fighter_injuries.warband_fighter_id
      and public.can_manage_warband(wf.warband_id)
  )
) with check (
  exists (
    select 1 from public.warband_fighters wf
    where wf.id = fighter_injuries.warband_fighter_id
      and public.can_manage_warband(wf.warband_id)
  )
);

create policy "Journal is readable by campaign members" on public.warband_journal_entries
for select to authenticated using (public.is_warband_campaign_member(warband_id));

revoke all on table public.warband_progress, public.warband_encampments, public.warband_quests, public.warband_artefacts, public.fighter_artefacts, public.fighter_heroic_traits, public.fighter_renown, public.fighter_injuries, public.warband_journal_entries from anon, authenticated;
grant select, insert, update, delete on table public.warband_progress, public.warband_encampments, public.warband_quests, public.warband_artefacts, public.fighter_artefacts, public.fighter_heroic_traits, public.fighter_renown, public.fighter_injuries to authenticated;
grant select on table public.warband_journal_entries to authenticated;
grant select on table public.encampment_definitions, public.quest_definitions, public.artefact_definitions, public.heroic_trait_definitions to anon, authenticated;
