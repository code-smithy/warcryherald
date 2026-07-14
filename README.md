# Warcry Herald

Warcry Herald is a campaign manager for Warcry narrative play.

The project is currently in Phase 0: repository and design foundation. The app
is a Vite, React, and TypeScript static frontend intended for GitHub Pages
deployment with Supabase Auth and PostgreSQL added through later phases.

## Prerequisites

- Node.js 20 or newer.
- pnpm 9 or newer.

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

## Scripts

```bash
pnpm dev
pnpm lint
pnpm test
pnpm build
```

## Project Docs

Start with [docs/project-tracker.md](docs/project-tracker.md), then read the
rest of `docs/` before implementing any phase.
