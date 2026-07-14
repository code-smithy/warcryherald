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
