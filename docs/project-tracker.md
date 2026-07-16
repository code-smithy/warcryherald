# Warcry Herald - Agent Project Tracker

This file is the working memory for Codex agents implementing Warcry Herald. Read it before starting any phase, then update it when scope, assumptions, decisions, setup steps, or unresolved questions change.

## Agent Operating Rules

Before changing code for any phase:

1. Read `README.md` and every file under `docs/`.
2. Inspect existing database migrations and TypeScript models.
3. Implement only the current phase or task. Do not build later phases speculatively.
4. Do not modify unrelated code.
5. Preserve static GitHub Pages compatibility.
6. Do not expose Supabase service-role keys or other secrets to the frontend.
7. Treat the frontend as untrusted.
8. Enforce authorization through Supabase Row-Level Security.
9. Add database migrations for every schema change.
10. Add automated tests for validation and important UI behavior.
11. Update documentation when setup or behavior changes.
12. Run lint, tests, and the production build before completing a phase.

Every implementation response should include:

- Summary of changes.
- Files changed.
- Migration and configuration instructions.
- Test results.
- Assumptions and unresolved questions.

Stay inquisitive. If a rule, table shape, workflow, copyright boundary, or UI behavior is unclear at first glance, pause long enough to inspect the existing docs and code. If the answer still is not clear, record the question in this file and ask before making a risky assumption.

## Current Status

- Project stage: Phase 7 complete; Phase 8 campaign dashboard and chronicle is ready to start.
- Current phase: Phase 8 - Campaign Dashboard And Chronicle.
- Last completed phase: Phase 7 - Guided Aftermath Workflow.
- MVP target: complete after `WH-018 Chronicle and audit history`.
- Broader readiness target: complete after `WH-020 Security review and production deployment`.

## Delivery Approach

Build Warcry Herald as a separate application while reusing the proven Questboard architecture and implementation patterns:

- Vite.
- React.
- TypeScript.
- React Router.
- Supabase Auth and PostgreSQL.
- Discord OAuth.
- React Hook Form and Zod.
- Vitest and Testing Library.
- Static deployment through GitHub Pages.

Do not add a custom backend unless a requirement cannot be handled safely with Supabase, PostgreSQL functions, Row-Level Security, or Supabase Edge Functions.

Each numbered phase should be treated as a separate task or pull request. Later phases are reference only until their phase is active.

## Core Architecture

### Application Tenancy

The primary security boundary is the campaign.

A user may:

- Create multiple campaigns.
- Join multiple campaigns.
- Have one or more warbands in a campaign.
- Have different roles in different campaigns.

Campaign roles:

- `owner`
- `campaign_admin`
- `player`

The owner is also a campaign administrator.

### Reference Data Versus Player Data

Keep reference data and player data clearly separated.

Reference data is mostly read-only game definition data:

- Rulesets.
- Source publications.
- Factions.
- Grand alliances.
- Runemarks.
- Fighter profiles.
- Weapon profiles.
- Abilities.
- Reactions.
- Blessings.
- Artefacts.
- Heroic traits.
- Quests.
- Encampment locations.
- Battleplans.
- Campaign data definitions.

Player data is user-created and campaign-specific state:

- Campaigns.
- Members.
- Invitations.
- Warbands.
- Named fighter instances.
- Progression.
- Injuries.
- Renown.
- Artefact ownership.
- Quests.
- Encampments.
- Battles.
- Results.
- Aftermath decisions.
- Campaign journal entries.

A fighter profile is a reusable rules definition. A warband fighter is a named campaign instance of that profile.

### Versioned Rules

All reference records must be associated with a rules release.

Suggested `rules_release` fields:

- `id`
- `name`
- `release_date`
- `language`
- `status`
- `source_url`
- `imported_at`

Do not overwrite a fighter profile when points or statistics change. Create a new version and retire the old one.

Battles and roster entries must retain historical snapshots so an old battle remains understandable after later balance updates.

Fighter data must support movement, toughness, wounds, points, weapon profiles, and runemarks as represented by the core rules.

### Copyright Constraint

Do not copy publication layouts, artwork, logos, or images into the application.

Rules text, table descriptions, names, structured effects, and explanatory text
may be relevant product data for campaign workflows. Import them deliberately,
with source attribution and language tracking, and keep the copied surface
limited to what the feature requires.

The import system should initially support:

- Structured statistics.
- Names and identifiers.
- Point costs.
- Runemark relationships.
- Rules text, table descriptions, and structured effects where needed for app
  workflows.
- Source name, page, and external link.
- User-supplied or original artwork only.

Reference data source handling:

- Automated internet collection, website scraping, PDF downloading, and
  generated extraction workbench files are out of scope for Phase 3.
- Reference-data imports must track source language and should use reviewed,
  versioned input files entered manually.
- Imports must respect the copyright constraint above.

## Phase Roadmap

### Phase 0 - Repository And Design Foundation

Objective: create the new project and establish technical and documentation structure.

Create:

- `docs/design.md`
- `docs/domain-model.md`
- `docs/reference-data.md`
- `docs/security.md`
- `docs/supabase-setup.md`
- `src/app/`
- `src/components/`
- `src/features/`
- `src/hooks/`
- `src/lib/`
- `src/pages/`
- `src/styles/`
- `src/types/`
- `scripts/`
- `supabase/functions/`
- `supabase/migrations/`
- `supabase/seed/`
- `tests/`

Set up:

- Vite, React, and TypeScript.
- React Router.
- ESLint.
- Vitest.
- React Testing Library.
- Environment variable validation.
- GitHub Pages build workflow.
- Error boundary.
- Not-found route.
- Basic responsive application shell.

Environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Acceptance criteria:

- `npm run lint` passes.
- `npm run test` passes.
- `npm run build` passes.
- The app runs without Supabase by showing a useful configuration error.
- GitHub Pages routing works after a page reload.
- No secret credentials are committed.
- Initial design documents define project terminology.

### Phase 1 - Authentication And Profiles

Objective: implement Discord login through Supabase Auth.

Database:

- `profiles`
  - `id uuid PK references auth.users`
  - `discord_user_id text`
  - `display_name text`
  - `avatar_url text`
  - `preferred_language text`
  - `timezone text`
  - `is_site_admin boolean`
  - `created_at timestamptz`
  - `updated_at timestamptz`
  - `last_seen_at timestamptz`

Create an auth trigger that creates or updates the profile after login.

UI:

- Landing page.
- Sign in with Discord action.
- OAuth callback handling.
- Protected application routes.
- User menu.
- Logout.
- Profile page.
- Display name override.
- Language and timezone settings.

Acceptance criteria:

- A user can sign in and sign out.
- A profile is created automatically.
- Refreshing preserves the authenticated session.
- Unauthenticated users cannot access protected routes.
- Users can update only their own editable profile fields.
- Discord identifiers cannot be modified manually from the frontend.

Do not use Discord server membership or Discord roles for authorization.

### Phase 2 - Campaigns, Members, And Invitations

Objective: allow users to create campaigns and invite friends.

Database:

- `campaigns`
- `campaign_members`
- `campaign_invites`

Campaign status:

- `draft`
- `active`
- `completed`
- `archived`

Behavior:

- Any authenticated user may create a campaign.
- Creator becomes owner and campaign administrator.
- Owners and administrators can create invite links.
- A valid invite allows an authenticated user to join.
- A user cannot join the same campaign twice.
- Campaign administrators can deactivate invitations.
- Owners can promote players to campaign administrator.
- Ownership transfer is deferred unless straightforward.

UI:

- Campaign list.
- Create campaign form.
- Campaign overview.
- Member list.
- Invite management.
- Join-by-invite flow.
- Campaign settings.
- Archive campaign action.

RLS:

- Only campaign members may read private campaign data.
- Only owners may archive a campaign.
- Only owners and administrators may manage invites.
- Only owners and administrators may manage member roles.
- Users may remove themselves, except the sole owner.

Acceptance criteria:

- Two users can join the same campaign through an invitation.
- A non-member cannot retrieve the campaign through direct Supabase requests.
- Expired, disabled, and exhausted invites are rejected.
- Membership changes are covered by tests.
- Campaign switching works without leaking data between campaigns.

Closeout checklist:

- Apply `202607140001_phase_1_profiles.sql` and
  `202607140002_phase_2_campaigns.sql` and
  `202607140003_phase_2_create_campaign_rpc.sql` and
  `202607140006_profile_upsert_rpc.sql` to the target Supabase project.
- If production reports `public.profiles` missing from the schema cache, run
  `202607140005_phase_2_full_repair.sql` from the Supabase SQL Editor.
- Reload the PostgREST schema cache after migration.
- Confirm Discord login creates or refreshes a profile row.
- Confirm an authenticated user can create a campaign and becomes owner.
- Confirm a second authenticated user can join through an open invite.
- Confirm repeated, disabled, expired, and exhausted invites are rejected.
- Confirm a non-member cannot select campaign, member, or invite data through
  direct Supabase requests.
- Confirm campaign administrators can manage invites and member roles, while
  players cannot self-promote.
- Confirm the sole owner cannot leave or be removed.
- Run `pnpm verify:phase2` with two temporary authenticated user access tokens
  against the migrated target Supabase project.
- Run `pnpm lint`, `pnpm test`, and `pnpm build` after any closeout fixes.

### Phase 3 - Versioned Warcry Reference Data

Objective: create the structured, versioned reference database used by the roster builder.

Database tables:

- `source_documents`
- `rules_releases`
- `grand_alliances`
- `factions`
- `runemarks`
- `fighter_profiles`
- `fighter_profile_runemarks`
- `weapon_profiles`
- `abilities`
- `ability_runemarks`
- `faction_abilities`
- `universal_abilities`
- `blessings`

Importer commands:

- `npm run import:reference-data`
- `npm run validate:reference-data`

Initial input files:

- `data/reference/releases.json`
- `data/reference/factions.json`
- `data/reference/runemarks.json`
- `data/reference/fighters.json`
- `data/reference/weapons.json`
- `data/reference/abilities.json`

Importer requirements:

- Validate input with Zod.
- Produce stable identifiers.
- Reject duplicate stable keys.
- Reject invalid faction references.
- Reject invalid runemark references.
- Detect impossible statistics.
- Produce inserted, updated, and retired summaries.
- Support dry-run mode.
- Be idempotent.
- Do not scrape websites at runtime.

UI:

- Read-only reference browser.
- Faction list.
- Fighter list.
- Search.
- Filters by faction, alliance, and runemark.
- Fighter details.
- Source and release information.
- Current rules only by default.
- Optional display of retired profiles.

Acceptance criteria:

- Same import can run twice without duplication.
- New rules releases do not destroy old profiles.
- Fighter details display all weapons and runemarks.
- Search works without authentication.
- Reference tables cannot be modified by ordinary users.
- Source release is visible for every fighter.

### Phase 4 - Warband Roster Management

Objective: allow a campaign member to create and manage a narrative warband.

Database:

- `warbands`
- `warband_fighters`
- `fighter_profile_snapshots`

Fighter status:

- `active`
- `recovering`
- `missing`
- `dead`
- `retired`

Validation service shape:

```ts
type ValidationResult = {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  totalPoints: number
  fighterCount: number
}
```

Validate:

- A warband has a leader.
- Fighter profiles belong to permitted factions.
- Point totals.
- Fighter count.
- Duplicate restrictions where applicable.
- Campaign-specific house-rule overrides.
- Only active fighters count toward the active roster.

UI:

- Create warband.
- Choose faction.
- Add fighter.
- Name fighter.
- Remove or retire fighter.
- Designate leader where legal.
- Live point total.
- Validation messages.
- Roster summary.
- Printable roster view.
- Mobile-friendly fighter cards.

Acceptance criteria:

- A player can create multiple warbands in one campaign.
- Fighters are selected from the campaign's configured rules release.
- Invalid rosters can be saved as drafts but cannot be declared battle-ready.
- A fighter instance keeps its own name and campaign status.
- Profile updates do not silently alter historical roster snapshots.

### Phase 5 - Encampment And Warband Progression

Objective: represent persistent narrative state of a warband.

Database:

- `warband_progress`
- `encampment_definitions`
- `warband_encampments`
- `quest_definitions`
- `warband_quests`
- `artefact_definitions`
- `warband_artefacts`
- `fighter_artefacts`
- `heroic_trait_definitions`
- `fighter_heroic_traits`
- `fighter_renown`
- `fighter_injuries`

UI dashboard:

- Current glory.
- Reputation.
- Encampment.
- Active quest.
- Quest progress.
- Artefact inventory.
- Fighter renown.
- Heroic traits.
- Injuries and availability.
- Recent changes.

Acceptance criteria:

- Every progression change records who changed it and when.
- Artefacts can be owned by a warband and optionally assigned to a fighter.
- A fighter cannot receive the same unique progression record twice.
- Dead or retired fighters remain visible in history.
- Administrators can correct data, but corrections are logged.
- All progression modifications produce journal entries.

### Phase 6 - Battle Creation And Results

Objective: record games between campaign warbands.

Use a participant table so the model can support more than two players.

Database:

- `battles`
- `battle_participants`
- `battle_fighters`
- `battle_events`

Battle status:

- `draft`
- `scheduled`
- `ready`
- `played`
- `aftermath_pending`
- `completed`
- `cancelled`

Participant result:

- `winner`
- `draw`
- `loss`
- `unknown`

Workflow:

- Create battle.
- Select participants.
- Select participating fighters.
- Validate battle rosters.
- Enter battleplan information.
- Play offline.
- Record scores and casualties.
- Confirm results.
- Begin aftermath.
- Complete battle.

Acceptance criteria:

- Injured unavailable fighters cannot be selected without administrator override.
- Battle point totals are calculated from snapshots.
- A battle cannot be completed without participants and a result.
- Draws are supported.
- Historical battle records do not change when reference profiles are updated.
- Editing a confirmed result creates an audit entry.

### Phase 7 - Guided Aftermath Workflow

Objective: guide players through post-battle progression without requiring automatic rolls.

Database:

- `aftermath_sessions`
- `aftermath_steps`

Suggested step keys:

- `award_glory`
- `resolve_injuries`
- `resolve_renown`
- `update_quest`
- `exploration`
- `manage_warband`
- `encampment_check`
- `review`

Behavior:

- Explain what the player must resolve.
- Allow manual dice-result entry.
- Show calculated consequences.
- Require confirmation.
- Store original input and resulting changes.
- Prevent accidental double application.
- Allow an administrator to correct or reopen a step.
- Log every correction.
- Use database transactions or PostgreSQL functions when applying progression changes.

UI:

- Wizard with progress indicator.
- Pending decisions.
- Fighter-specific injury handling.
- Renown results.
- Quest updates.
- Exploration results.
- Recruitment or retirement actions.
- Final review.
- Completion summary.

Acceptance criteria:

- Refreshing resumes the current step.
- Completing a step twice does not duplicate rewards.
- Two participants may complete aftermath independently.
- A battle remains `aftermath_pending` until all required sessions are complete.
- Final completion updates all relevant warband and fighter records atomically.
- Every state change is visible in the campaign journal.

### Phase 8 - Campaign Dashboard And Chronicle

Objective: make campaign state understandable at a glance.

Dashboard:

- Campaign name and status.
- Members.
- Active warbands.
- Recent battles.
- Pending aftermath sessions.
- Glory and reputation summaries.
- Active quests.
- Recent injuries and deaths.
- Campaign activity.
- Quick actions.

Warband page:

- Current roster.
- Total points.
- Leader.
- Active and unavailable fighters.
- Glory and reputation.
- Encampment.
- Quest.
- Artefacts.
- Battle record.
- Fighter histories.

Chronicle table:

- `activity_log`

Example event types:

- `warband_created`
- `fighter_recruited`
- `fighter_injured`
- `fighter_killed`
- `quest_started`
- `quest_completed`
- `battle_created`
- `battle_completed`
- `artefact_acquired`
- `encampment_changed`
- `member_joined`

Acceptance criteria:

- Activity feed is generated from authoritative changes, not only UI actions.
- Users see only campaigns to which they belong.
- Dashboard statistics are derived from stored results.
- Dead and retired fighters remain present in historical views.
- Pending actions are clearly visible.

### Phase 9 - Visual Design System

Objective: create a distinctive fantasy campaign-ledger interface without compromising usability.

Original styling inspiration:

- Heraldic records.
- Wax seals.
- Inked maps.
- Weathered parchment.
- Carved stone and aged metal.
- Faction-colored accents.

Do not reproduce Games Workshop page layouts or imagery.

Reusable components:

- `HeraldPanel`
- `ParchmentCard`
- `SectionBanner`
- `WaxSealBadge`
- `StatBlock`
- `RunemarkBadge`
- `FighterCard`
- `WarbandBanner`
- `CampaignTimeline`
- `LedgerTable`
- `ConfirmationScroll`

Requirements:

- Desktop and mobile layouts.
- Accessible contrast.
- Keyboard navigation.
- Visible focus states.
- Reduced-motion support.
- No essential information conveyed solely through color.
- Dense data views remain readable.
- Fantasy typography limited to headings.
- Body text uses a highly readable font.

Acceptance criteria:

- Core workflows work at 360-pixel width.
- Forms remain usable without horizontal scrolling.
- Decorative effects do not block interaction.
- Theme components are documented in a visual style guide.
- No third-party copyrighted game imagery is included.

### Phase 10 - Security And Production Hardening

Objective: prepare the MVP for real users.

Security review must verify RLS for every campaign table.

Test:

- Non-member reads.
- Cross-campaign reads.
- Cross-campaign updates.
- Self-promotion to administrator.
- Changing another player's warband.
- Modifying completed aftermath.
- Consuming invitations repeatedly.
- Direct insertion into protected reference tables.
- Storage access for battle images, when enabled.

Use database functions for sensitive operations:

- `accept_campaign_invite()`
- `complete_aftermath_step()`
- `finalize_battle()`
- `transfer_campaign_ownership()`

Operational requirements:

- Error logging.
- Database indexes.
- Pagination.
- Loading and empty states.
- Retry-safe mutations.
- Optimistic locking or `updated_at` conflict checks.
- Backup and restore documentation.
- Supabase migration deployment instructions.
- Seed data instructions.
- Staging and production environment guidance.

Acceptance criteria:

- RLS integration tests cover all important tables.
- No campaign data is readable by outsiders.
- Sensitive multi-table operations are transactional.
- Build and deployment are documented.
- Production application has no console errors.
- Database migrations can rebuild a clean environment.

## Post-MVP Backlog

These should not block the first usable release:

- Scheduling.
- Battleplan generator.
- Campaign arcs.
- Public campaign chronicle.
- Battle reports and media.
- Notifications.
- Administrative import tools.

## Recommended Pull Request Sequence

1. `WH-001 Project scaffold`
2. `WH-002 Discord authentication and profiles`
3. `WH-003 Campaigns and membership`
4. `WH-004 Invitations and campaign RLS`
5. `WH-005 Rules release and source model`
6. `WH-006 Faction and fighter reference data`
7. `WH-007 Reference-data import pipeline`
8. `WH-008 Warband creation`
9. `WH-009 Roster validation`
10. `WH-010 Fighter campaign instances`
11. `WH-011 Encampments, quests and progression`
12. `WH-012 Artefacts, traits and injuries`
13. `WH-013 Battle creation and participants`
14. `WH-014 Battle results and confirmation`
15. `WH-015 Aftermath session framework`
16. `WH-016 Aftermath progression steps`
17. `WH-017 Campaign dashboard`
18. `WH-018 Chronicle and audit history`
19. `WH-019 Visual design system`
20. `WH-020 Security review and production deployment`

## Open Questions

Track questions here as soon as they are discovered.

1. Which existing Questboard repository or codebase should be used as the architectural reference?
2. Resolved: this repo root is the app. The source plan's nested `warcry-herald/` directory is treated as the repository root because this workspace is already `warcryherald`.
3. Which Supabase project naming convention and environment strategy should be used for local, staging, and production?
4. What is the first rules release and source set that should seed the reference database?
5. What exact attribution format should imported rules text and table descriptions use?

## Decision Log

Record durable decisions here.

- 2026-07-14: Created this tracker before implementation.
- 2026-07-14: Implemented Phase 0 at the repository root rather than creating a nested `warcry-herald/` directory.
- 2026-07-14: Chose hash-based React Router routing plus a GitHub Pages `404.html` fallback to preserve static hosting compatibility.
- 2026-07-14: Supabase frontend configuration is validated with Zod and missing values render a user-facing configuration notice.
- 2026-07-14: Clarified that reference-data imports must use reviewed structured input with source attribution and language tracking, while artwork, logos, images, layouts, and publication presentation remain out of scope.
- 2026-07-14: Pinned pnpm to 10.17.1 for Node.js 20 compatibility in GitHub Pages CI. pnpm 11 requires Node.js 22.13 or newer.
- 2026-07-14: Phase 1 profile edits are limited through column-level grants to `display_name`, `preferred_language`, and `timezone`; Discord metadata is maintained by the auth trigger.
- 2026-07-14: Phase 2 ownership transfer remains deferred; the database rejects direct owner role changes.
- 2026-07-14: Campaign invitation acceptance uses the `accept_campaign_invite()` PostgreSQL function so invite validation, membership creation, and use-count increments happen atomically.
- 2026-07-14: Profile reads are expanded only to users who share a campaign so member lists can show display names without making profiles public.
- 2026-07-14: Phase 2 live closeout is verified by `pnpm verify:phase2`, which requires two temporary authenticated user access tokens and a migrated target Supabase project.
- 2026-07-14: Added a new migration for `create_campaign(...)` rather than relying on edits to an already-applied Phase 2 migration. Applied databases must receive `202607140003_phase_2_create_campaign_rpc.sql`.
- 2026-07-14: Added `202607140004_phase_1_profiles_repair.sql` to repair partially migrated Supabase projects where `public.profiles` is absent from the PostgREST schema cache.
- 2026-07-14: Added `202607140005_phase_2_full_repair.sql` after production showed both `public.campaigns` and `public.create_campaign(...)` absent. This is the preferred SQL Editor repair file for partially migrated production projects.
- 2026-07-14: Added `202607140006_profile_upsert_rpc.sql` and switched profile load/save to RPCs so existing auth users without a `profiles` row can recover without direct frontend inserts.
- 2026-07-14: Updated `pnpm verify:phase2` to load frontend-safe Supabase project values from `.env`; temporary user access tokens must still be passed through the process environment.
- 2026-07-14: User confirmed Phase 2 target migrations and live two-user RLS verification are complete.
- 2026-07-14: Started Phase 3 with public read-only reference tables, empty reviewed-input JSON scaffolds, and service-role-only import tooling.
- 2026-07-14: Phase 3 foundation local verification passed `pnpm validate:reference-data`, `pnpm import:reference-data -- --dry-run`, `pnpm lint`, `pnpm test` with 15 tests, and `pnpm build`.
- 2026-07-14: Added a manual `Reference Data Import` GitHub Actions workflow with `dry-run` as the default and `import` as an explicit operation using `SUPABASE_SERVICE_ROLE_KEY`.
- 2026-07-14: Tightened the reference-data workflow dry-run so it also performs a read-only remote configuration check against `rules_releases` with the configured Supabase secret.
- 2026-07-14: User-provided GitHub Actions log confirmed `Reference Data Import` dry-run passed validation, local dry-run, and the read-only remote Supabase configuration check.
- 2026-07-14: Added fictional English/German reference-data examples and documented the Phase 3 convention of language-suffixed stable keys until dedicated translation tables exist.
- 2026-07-14: Added `mechanics` JSONB fields for abilities and blessings so reviewed imports can preserve exact operative clauses without relying only on prose summaries.
- 2026-07-14: Removed automated internet collection, PDF download/extraction, source-catalogue refresh, and Warcrier extraction attempts from the Phase 3 workflow; reviewed data must be entered manually.
- 2026-07-14: Started Phase 4 with warband, fighter instance, and fighter profile snapshot tables plus roster RPCs and validation.
- 2026-07-15: Started Phase 5 with warband progression tables, progression definition tables, fighter progression state, and warband journal entries.
- 2026-07-16: User confirmed Phase 5 target Supabase migrations and closeout checks are complete.
- 2026-07-16: Completed Phase 6 locally with battle, participant, selected fighter, result, and battle event support.
- 2026-07-16: Completed Phase 7 locally with aftermath sessions, guided steps, transactional step completion, administrator reopen support, and battle completion gating.

## Phase Completion Log

Record completed phases and verification results here.

- 2026-07-14: Completed Phase 0 - Repository And Design Foundation.
  - Added Vite, React, TypeScript, React Router, ESLint, Vitest, Testing Library, and GitHub Pages workflow foundation.
  - Added required docs: `design.md`, `domain-model.md`, `reference-data.md`, `security.md`, and `supabase-setup.md`.
  - Added placeholder directories for app code, scripts, Supabase functions, migrations, seed data, and tests.
  - Verification: `pnpm lint` passed.
  - Verification: `pnpm test` passed with 3 tests.
  - Verification: `pnpm build` passed.
- 2026-07-14: Completed Phase 1 - Authentication And Profiles.
  - Added Discord OAuth sign-in, sign-out, callback handling, persisted Supabase session loading, protected routes, user menu, and profile settings UI.
  - Added `profiles` migration with auth trigger, RLS policies, and column-level grants limiting frontend profile edits to display name, preferred language, and timezone.
  - Updated Supabase setup and security documentation with Discord redirect and profile authorization requirements.
  - Verification: `pnpm lint` passed.
  - Verification: `pnpm test` passed with 5 tests.
  - Verification: `pnpm build` passed.
- 2026-07-14: Completed Phase 2 - Campaigns, Members, And Invitations.
  - Added campaign, member, and invite tables with RLS, role helper functions, owner membership trigger, invite acceptance RPC, and guard triggers for archiving, owner removal, and owner role changes.
  - Replaced the campaign placeholder with campaign list/create, campaign overview, member management, invite management, join-by-invite, campaign settings, and owner archive UI.
  - Updated setup and security documentation for Phase 2 tables, policies, and invitation workflow.
  - Added TypeScript tests for campaign draft validation, invite normalization, and invite state classification.
  - Added callback fixes for both PKCE `code` and implicit `access_token` OAuth redirects.
  - Added campaign creation RPC and shared Supabase error-message extraction after production testing exposed missing database objects and masked errors.
  - Added `pnpm verify:phase2` to run the live two-user Phase 2 acceptance and RLS checks. The verifier reads frontend-safe Supabase project values from `.env` and requires two temporary user access tokens in the process environment.
  - Verification: `pnpm lint` passed.
  - Verification: `pnpm test` passed with 12 tests.
  - Verification: `pnpm build` passed.
  - Verification: 2026-07-14 local closeout recheck passed `pnpm lint`, `pnpm test` with 12 tests, and `pnpm build`.
  - Verification: 2026-07-14 user confirmed target Supabase migrations and `pnpm verify:phase2` live two-user RLS checks are complete.

- 2026-07-14: Completed Phase 3 - Versioned Warcry Reference Data.
  - Added public read-only reference tables for source documents, rules releases, factions, runemarks, fighter profiles, weapon profiles, abilities, and blessings.
  - Added deterministic JSON validation and import tooling with dry-run support and service-role-only mutation.
  - Added the public reference browser with search, filters, fighter details, and source/release labels.
  - Added progression definition import support for encampments, quests, artefacts, and heroic traits.
  - Verification: `pnpm validate:reference-data` passed.
  - Verification: `pnpm import:reference-data -- --dry-run` passed.
  - Verification: `pnpm lint` passed.
  - Verification: `pnpm test` passed with 15 tests.
  - Verification: `pnpm build` passed.

- 2026-07-15: Completed Phase 4 - Warband Roster Management.
  - Added warband, fighter instance, and fighter profile snapshot persistence with roster RPCs and validation.
  - Added roster management UI for warband creation, faction selection, fighter recruitment, fighter naming, removal/retirement, leader designation, live totals, validation messaging, summary cards, printable roster output, and mobile-friendly fighter cards.
  - Documented Phase 4 setup and security expectations for private campaign warbands, owner/admin roster management, fighter rules-release enforcement, roster snapshotting, and battle-ready validation.
  - Verification: `pnpm lint` passed.
  - Verification: `pnpm test` passed with 20 tests.
  - Verification: `pnpm build` passed.

- 2026-07-16: Completed Phase 5 - Encampment And Warband Progression.
  - Added warband progression, encampment, quest, artefact, heroic trait, fighter renown, fighter injury, and warband journal persistence.
  - Added progression definition metadata for source attribution, scoped quests, artefact categories, and structured mechanics.
  - Added journal triggers for progression, encampment, quest, artefact, fighter artefact, renown, heroic trait, and injury changes.
  - Added campaign detail progression UI for glory, reputation, notes, encampments, quests, artefact inventory and assignment, fighter renown, heroic traits, injuries, and recent journal entries.
  - Updated setup, security, and README documentation for Phase 5 migration and feature coverage.
  - Verification: 2026-07-16 user confirmed target Supabase Phase 5 migrations and closeout checks are complete.
  - Verification: `pnpm lint` passed.
  - Verification: `pnpm test` passed with 23 tests.
  - Verification: `pnpm build` passed.

- 2026-07-16: Completed Phase 6 - Battle Creation And Results.
  - Added battle, battle participant, selected battle fighter, and battle event persistence.
  - Added database functions for battle creation, participant management, fighter snapshot selection, result recording, and battle completion.
  - Added RLS so campaign members can read battles while battle creators, campaign administrators, and participating warband managers can maintain battle records.
  - Added battle event auditing, including result correction events after confirmed results are edited.
  - Added campaign detail UI for battle creation, participant selection, fighter inclusion/removal, score/result capture, completion, and recent battle events.
  - Added TypeScript battle helpers and unit coverage for draft validation, result normalization, completion validation, selected fighter point totals, and unavailable fighter filtering.
  - Verification: `pnpm lint` passed.
  - Verification: `pnpm test` passed with 26 tests.
  - Verification: `pnpm build` passed.

- 2026-07-16: Completed Phase 7 - Guided Aftermath Workflow.
  - Added aftermath session and step persistence with one session per battle participant.
  - Added transactional aftermath RPCs for session initialization, idempotent step completion, progression consequence application, administrator reopen/correction logging, and battle completion after all sessions are complete.
  - Added guided battle-tab UI for current-step resume, manual dice/result notes, glory and reputation changes, injury/status handling, fighter renown changes, completion preview, step confirmation, and administrator reopen.
  - Updated setup and security documentation for the Phase 7 migration and aftermath authorization rules.
  - Verification: `pnpm lint` passed.
  - Verification: `pnpm test` passed with 28 tests.
  - Verification: `pnpm build` passed.
