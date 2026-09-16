# 6TOC — 6 Months to Change

A production-minded first foundation for a playful six-month goal book. A visitor can create one chapter with one to three independently dated goals, open each goal, manage its plan, keep notes and URLs in Pocket, pin milestones, and mark a goal done early.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- Supabase Auth + Postgres + Row Level Security
- Minimal client state; Supabase is the production source of truth
- Explicit browser-only preview store when Supabase is not configured

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3016`. Port `3016` is the project default so 6TOC does not collide with apps commonly running on port 3000. Without valid Supabase variables, the app shows a yellow **LOCAL PREVIEW** ribbon and stores data only in that browser’s `localStorage`. This is intentionally not presented as production auth.

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor**, paste `supabase/migrations/202609150001_initial_schema.sql`, and run it once. With the Supabase CLI, use `supabase db push` instead.
3. In **Authentication → URL Configuration**, set the site URL to `http://localhost:3016` and add `http://localhost:3016/auth/callback` as a redirect URL. Add the deployed Vercel callback URL later.
4. Keep the Email provider enabled. Magic-link email is the Phase 1 sign-in method.
5. Copy `.env.example` to `.env.local` and fill in:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3016
```

Use the public publishable/anon key, never the service-role key. Restart the dev server after changing environment variables.

The initial schema enforces one active challenge per user, exactly six calendar months per challenge, at most three goals, goal ownership, deadline bounds, completion consistency, and RLS. The UI requires at least one goal when creating a challenge. Pocket items and plan items have owner-only policies; supporters receive no automatic private access.

## Project map

- `app/` — routes, layout, error/loading states, and auth callback
- `components/` — notebook UI and interactive product flows
- `lib/` — domain types, calendar-safe date helpers, data adapter, Supabase clients
- `supabase/migrations/` — schema, triggers, indexes, and RLS
- `docs/` — visual system, product narrative, and build status

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

## What's built and what isn't

See [`docs/status.md`](docs/status.md) for the current state: what works, what is not built
yet (supporters, sign-in for returning users, editing, end of chapter, reminders, Vision,
deploy), known rough edges, and decisions already made.
