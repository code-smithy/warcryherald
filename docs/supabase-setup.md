# Supabase Setup

Supabase is required for authenticated campaign features. Until local project
values are configured, protected app areas show a useful configuration notice.

## Frontend Environment Variables

Create `.env` locally:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Only public frontend-safe values may use the `VITE_` prefix.

## Discord OAuth

In Supabase Auth, enable Discord as an external provider and add redirect URLs
for each hosted environment.

Local development callback:

```text
http://127.0.0.1:5173/#/auth/callback
```

GitHub Pages callback shape:

```text
https://<owner>.github.io/<repository>/#/auth/callback
```

The frontend uses Supabase Auth with persisted browser sessions. Never expose a
Discord client secret or Supabase service-role key through `VITE_` variables.

## Migrations

Apply migrations to create the profile, campaign, member, invite, grants, helper
functions, and Row-Level Security policies:

```bash
supabase db push
```

If the Supabase CLI is not available, run the migration SQL files in order from
the Supabase Dashboard SQL Editor:

1. `supabase/migrations/202607140001_phase_1_profiles.sql`
2. `supabase/migrations/202607140002_phase_2_campaigns.sql`
3. `supabase/migrations/202607140003_phase_2_create_campaign_rpc.sql`
4. `supabase/migrations/202607140004_phase_1_profiles_repair.sql`
5. `supabase/migrations/202607140005_phase_2_full_repair.sql`

Then reload the PostgREST schema cache:

```sql
notify pgrst, 'reload schema';
```

The browser error `Could not find the table 'public.profiles' in the schema
cache` means the target Supabase project has not received the migrations or the
PostgREST schema cache has not reloaded after migration.

For a production project that is already partially migrated and reports
`public.profiles`, `public.campaigns`, or `public.create_campaign(...)` missing,
run this consolidated repair migration from the SQL Editor:

```text
supabase/migrations/202607140005_phase_2_full_repair.sql
```

It creates or repairs the Phase 1 profile objects and Phase 2 campaign objects
in dependency order, then reloads the PostgREST schema cache.

The auth trigger creates or refreshes a profile whenever Supabase receives
Discord metadata for a user. Frontend clients can update only these profile
columns:

- `display_name`
- `preferred_language`
- `timezone`

Discord identifiers, avatar URL, site-admin status, timestamps, and ownership
fields are controlled by database triggers, grants, or privileged operations.

The Phase 2 migration adds:

- `campaigns`
- `campaign_members`
- `campaign_invites`
- `campaign_status` and `campaign_member_role` enum types
- campaign membership and administrator helper functions
- `accept_campaign_invite(invite_token text)`
- `create_campaign(campaign_name text, campaign_description text, campaign_status text)`

Invitation acceptance should call `accept_campaign_invite()` through Supabase
RPC. Do not insert campaign membership directly from the frontend.

## Phase 2 Verification

Before marking Phase 2 complete, verify against the target Supabase project:

- Discord login creates or refreshes a `profiles` row.
- A signed-in user can create a campaign and is inserted as `owner`.
- A second signed-in user can join through an active invite.
- Reusing the same invite as an existing member is rejected.
- Disabled, expired, and exhausted invites are rejected.
- A non-member cannot select campaign rows through direct Supabase requests.
- Players cannot promote themselves or manage invites.
- Campaign administrators can create and disable invites.
- The sole owner cannot leave or be removed.

The automated verification command covers these checks against a migrated
Supabase project. Use two temporary authenticated users, then pass their current
access tokens through environment variables:

```bash
PHASE2_USER_A_ACCESS_TOKEN=<user-a-access-token> \
PHASE2_USER_B_ACCESS_TOKEN=<user-b-access-token> \
pnpm verify:phase2
```

On PowerShell:

```powershell
$env:PHASE2_USER_A_ACCESS_TOKEN = "<user-a-access-token>"
$env:PHASE2_USER_B_ACCESS_TOKEN = "<user-b-access-token>"
pnpm verify:phase2
```

The command creates temporary campaigns and invites in the target project. Run
it against staging or a disposable verification campaign when possible. Do not
commit access tokens or paste callback URLs containing `access_token` fragments
into issue trackers, logs, or documentation.

## Future Setup Work

Later phases will add:

- Seed data.
- Environment guidance for local, staging, and production.

Do not commit Supabase service-role keys or private credentials.
