# Warcry Herald

Warcry Herald is a campaign manager for Warcry narrative play.

The project currently has the Phase 3 reference-data foundation in progress.
Phase 2 campaign, member, and invitation work is complete.

## Prerequisites

- Node.js 20 or newer.
- pnpm 10.x when using Node.js 20.

## Setup

```bash
pnpm install
```

Create a local `.env` file when Supabase is available:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The app intentionally runs without those values and shows a configuration error
instead of failing silently.

Apply Supabase migrations before testing authenticated profile or campaign
features:

```bash
supabase db push
```

If the Supabase CLI is unavailable, run the SQL migration files in order from
the Supabase Dashboard SQL Editor:

1. `supabase/migrations/202607140001_phase_1_profiles.sql`
2. `supabase/migrations/202607140002_phase_2_campaigns.sql`
3. `supabase/migrations/202607140003_phase_2_create_campaign_rpc.sql`
4. `supabase/migrations/202607140004_phase_1_profiles_repair.sql`
5. `supabase/migrations/202607140005_phase_2_full_repair.sql`
6. `supabase/migrations/202607140006_profile_upsert_rpc.sql`
7. `supabase/migrations/202607140007_phase_3_reference_data.sql`
8. `supabase/migrations/202607140008_phase_3_reference_mechanics.sql`

Then reload the PostgREST schema cache:

```sql
notify pgrst, 'reload schema';
```

For an already-migrated Supabase project that still reports
`public.profiles` missing from the schema cache, run
`202607140005_phase_2_full_repair.sql` from the SQL Editor. It recreates the
Phase 1 and Phase 2 database objects in dependency order and reloads the
PostgREST schema cache.

Configure Discord OAuth in Supabase Auth and allow the app URL as a redirect
target. The local development callback is:

```text
http://127.0.0.1:5173/#/auth/callback
```

## Scripts

```bash
pnpm dev
pnpm lint
pnpm test
pnpm build
pnpm discover:reference-sources
pnpm validate:reference-data
pnpm import:reference-data -- --dry-run
```

## Current Features

- Discord OAuth through Supabase Auth.
- User profile settings.
- Campaign creation and campaign list.
- Campaign members with owner, campaign administrator, and player roles.
- Campaign invitation links with optional expiration and usage limits.
- Invite acceptance through `#/join/<token>`.
- Campaign settings and owner-only archiving.
- Public reference browser shell at `#/reference`.
- Versioned reference-data migration and validated JSON import scaffolding.

These features require the database migrations above. A production app connected
to a Supabase project without those migrations will sign in successfully but
fail when loading profiles or campaigns.

Reference-data mutation is intentionally not available through frontend
credentials. To import reviewed data, run the import script with
`SUPABASE_SERVICE_ROLE_KEY` set in the local process environment.

GitHub Actions also has a manual **Reference Data Import** workflow. Run it in
`dry-run` mode first. That mode validates local JSON and performs a read-only
remote configuration check against Supabase. Choose `import` only after
reviewing the JSON input files and confirming the target Supabase project.

## Project Docs

Start with [docs/project-tracker.md](docs/project-tracker.md), then read the
rest of `docs/` before implementing any phase.
