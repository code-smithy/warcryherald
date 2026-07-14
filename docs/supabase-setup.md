# Supabase Setup

Supabase is required for authenticated Phase 1 features. Until local project
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

Apply migrations to create the Phase 1 `profiles` table, auth trigger, grants,
and Row-Level Security policies:

```bash
supabase db push
```

The auth trigger creates or refreshes a profile whenever Supabase receives
Discord metadata for a user. Frontend clients can update only these profile
columns:

- `display_name`
- `preferred_language`
- `timezone`

Discord identifiers, avatar URL, site-admin status, timestamps, and ownership
fields are controlled by database triggers, grants, or privileged operations.

## Future Setup Work

Later phases will add:

- Seed data.
- Environment guidance for local, staging, and production.

Do not commit Supabase service-role keys or private credentials.
