# Supabase Setup

Supabase is not required to run the Phase 0 shell. Until local project values
are configured, protected app areas show a useful configuration notice.

## Frontend Environment Variables

Create `.env` locally:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Only public frontend-safe values may use the `VITE_` prefix.

## Future Setup Work

Later phases will add:

- Discord OAuth configuration.
- Database migrations.
- RLS policies.
- Auth profile triggers.
- Seed data.
- Environment guidance for local, staging, and production.

Do not commit Supabase service-role keys or private credentials.
