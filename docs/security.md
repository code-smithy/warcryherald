# Security Model

Warcry Herald treats the frontend as untrusted. Authorization must be enforced
in Supabase through Row-Level Security, constraints, triggers, and database
functions where appropriate.

## Boundaries

- Campaign data is private to campaign members.
- Campaign role checks must happen in database policies or functions.
- Profiles are private to their owning authenticated user.
- Reference data is public read-mostly data, but ordinary users cannot mutate it.
- Supabase service-role keys and other secrets must never be exposed to the
  frontend.

## Phase 1 Profile Rules

- `profiles.id` is owned by `auth.users`.
- Profiles are created and refreshed by a database trigger on `auth.users`.
- Users can select their own profile and the limited profile records of users
  who share a campaign with them.
- Users can update only `display_name`, `preferred_language`, and `timezone`.
- Discord identifiers, avatar URLs, timestamps, and `is_site_admin` are not
  frontend-editable columns.

## Phase 2 Campaign Rules

- `campaigns` are readable only by campaign members.
- Any authenticated user may insert a campaign where `created_by = auth.uid()`.
- A trigger adds the creator as the `owner` member.
- Campaign owners and campaign administrators can update campaign settings.
- Only owners may archive or restore a campaign.
- `campaign_members` are readable only by members of the same campaign.
- Campaign owners and administrators can remove members, and users can remove
  themselves, but the sole owner cannot leave or be removed.
- Ownership transfer is intentionally unavailable in Phase 2.
- Campaign owners and administrators can create and disable invitations.
- Invite acceptance uses the `accept_campaign_invite()` database function so
  token validation, membership insertion, and invite usage increments happen in
  one authoritative database operation.
- Expired, disabled, exhausted, missing, and repeated invitations are rejected
  by the database function.

## Sensitive Operations

Use database functions for multi-table or sensitive operations, including:

- Accepting campaign invitations through `accept_campaign_invite()`.
- Completing aftermath steps.
- Finalizing battles.
- Transferring campaign ownership.

## Phase 3 Reference Data Rules

- Reference-data tables are public read-only through Supabase anon and
  authenticated roles.
- Ordinary users cannot insert, update, or delete source documents, releases,
  factions, runemarks, fighter profiles, weapons, abilities, or blessings.
- Reference imports run only from trusted local or operational tooling with a
  service-role key in the process environment.
- Service-role keys must never use the `VITE_` prefix and must never be exposed
  to browser code.

## Phase 4 Warband Rules

- Warbands are private campaign data and are readable only by campaign members.
- Any campaign member can create multiple warbands in that campaign.
- Only the warband owner or campaign owners/administrators can update a warband
  roster.
- Fighters are added through `add_warband_fighter(...)`, which verifies the
  fighter profile belongs to the warband faction and rules release.
- Fighter profile snapshots are created when a fighter is recruited so later
  reference-data updates do not silently change saved rosters.
- Invalid rosters may remain drafts, but a battle-ready roster must have one
  active leader and stay within point and fighter limits.


## Phase 5 Progression Rules

- Warband progression, encampments, quests, artefacts, fighter renown, heroic
  traits, injuries, and journal entries are readable only by campaign members.
- Only the warband owner or campaign owners/administrators can maintain
  progression records.
- Progression definition tables are public read-only reference data.
- Every warband progression insert or update creates a warband journal entry
  with the actor and timestamp.
- Unique fighter progression assignments are protected with database uniqueness
  constraints so the same artefact or heroic trait cannot be assigned twice.

## Phase 6 Battle Rules

- Battles, participants, selected fighters, and battle events are readable only
  by members of the owning campaign.
- Any campaign member may create a battle in that campaign.
- Battle creators, campaign administrators, and participating warband managers
  can maintain battle drafts and record results.
- Selected battle fighters store copied names, statuses, leadership flags, and
  point values from roster snapshots so battle records remain historical.
- Unavailable fighters cannot be selected unless a campaign administrator uses
  the override path.
- Updating a previously confirmed participant result records a battle event.

## Phase 7 Aftermath Rules

- Aftermath sessions and steps are readable only by members of the owning
  campaign.
- Battle result recording initializes one aftermath session per participant.
- A warband manager or campaign administrator can complete that warband's
  aftermath steps.
- Step completion runs through `complete_aftermath_step(...)` so confirmed
  inputs, applied consequences, session progress, battle completion checks, and
  journal entries happen atomically.
- Completing an already completed step returns the stored step instead of
  applying rewards twice.
- Campaign administrators can reopen a step through `reopen_aftermath_step(...)`;
  reopening logs battle and warband journal events but does not automatically
  reverse previously applied consequences.
- A battle with pending aftermath sessions cannot be completed until all
  sessions are complete.

## Required RLS Test Areas

- Non-member reads.
- Cross-campaign reads.
- Cross-campaign updates.
- Self-promotion to administrator.
- Changing another player's warband.
- Modifying completed aftermath.
- Repeated invite consumption.
- Direct insertion into protected reference tables.
- Storage access for battle images when storage is enabled.
