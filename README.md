# Warcry Herald

Warcry Herald is a campaign manager for Warcry narrative play.

The project is currently in Phase 2: campaigns, members, and invitations. The
app is a Vite, React, and TypeScript static frontend intended for GitHub Pages
deployment with Supabase Auth and PostgreSQL.

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

Apply Supabase migrations before testing authentication:

```bash
supabase db push
```

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
```

## Current Features

- Discord OAuth through Supabase Auth.
- User profile settings.
- Campaign creation and campaign list.
- Campaign members with owner, campaign administrator, and player roles.
- Campaign invitation links with optional expiration and usage limits.
- Invite acceptance through `#/join/<token>`.
- Campaign settings and owner-only archiving.

## Project Docs

Start with [docs/project-tracker.md](docs/project-tracker.md), then read the
rest of `docs/` before implementing any phase.
