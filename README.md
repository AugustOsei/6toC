# 6TOC — 6 Months to Change

A production-minded first foundation for a playful six-month goal book. A visitor can create one chapter with one to three independently dated goals, come back later through a magic-link sign-in, open each goal, edit it, manage and reorder its plan, keep notes and URLs in Pocket, pin milestones, and mark a goal done early. They can also invite people they trust to follow chosen goals and cheer them on; the Pocket is never shared.

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
2. Open **SQL Editor** and run the migrations in `supabase/migrations/` once each, in
   filename order (the initial schema first, then supporters). With the Supabase CLI, use
   `supabase db push` instead. Neither migration can be run twice.
3. In **Authentication → URL Configuration**, set the site URL to `http://localhost:3016` and add `http://localhost:3016/auth/callback**` as a redirect URL (the trailing `**` matters: sign-in links carry a `?next=` path). Add the deployed Vercel callback URL the same way later.
4. Keep the Email provider enabled. Magic-link email is the Phase 1 sign-in method.
5. Copy `.env.example` to `.env.local` and fill in:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3016
```

`NEXT_PUBLIC_SITE_URL` is optional. Without it, magic links return to whatever address the reader signed in from. Set it only to force one address, such as your own domain.

Use the public publishable/anon key, never the service-role key. Restart the dev server after changing environment variables.

The initial schema enforces one active challenge per user, exactly six calendar months per challenge, at most three goals, goal ownership, deadline bounds, completion consistency, and RLS. The UI requires at least one goal when creating a challenge. Pocket items and plan items have owner-only policies; supporters receive no automatic private access.

## Deploy to Cloudflare

6TOC runs on Cloudflare Workers through the [OpenNext adapter](https://opennext.js.org/cloudflare).
`wrangler.jsonc` names the Worker `6toc`.

- `npm run preview` builds for Workers and serves it locally (http://localhost:8787), in the
  same runtime Cloudflare uses.
- `npm run deploy` builds and deploys from your machine (run `npx wrangler login` once first).

The `NEXT_PUBLIC_*` variables are baked in **at build time**:
- when deploying from your machine, they come from `.env.local`;
- when Cloudflare builds from GitHub, add them under the Worker's **Settings → Build →
  Variables and secrets**, then trigger a new build.

`proxy.ts` (session refresh and the `/book` redirect) runs as Node.js middleware, which
OpenNext labels experimental on Cloudflare. It was tested locally on 2026-09-16 with
`@opennextjs/cloudflare` 1.20.6 and Wrangler 4.132. `app/book/layout.tsx` repeats the auth
check on the server, so the book stays private even if the proxy misbehaves.

## Supporters

An owner invites someone by name and email, and picks which of their goals that person may
follow. 6TOC does not send the invite: it gives the owner a link to pass on however they
like. The invited person signs in with the email the invite was sent to — the database
checks that, so a forwarded link is useless to anyone else — and then sees those goals,
their plans and their milestones, and can cheer or leave a note.

Supporter access is read-only and enforced by row-level security, not by the UI:

- **Pocket items are never shared**, with any supporter, in any state.
- A supporter sees only the goals they were given, and only while their invite is accepted.
- The owner can pause access, restore it, or remove the person (which also removes
  everything they wrote). A supporter can leave a book, and only they can undo that.
- Invite links carry a secret token; before sign-in the invite page shows names and a masked
  email, nothing else.

`supabase/tests/` checks all of this against a throwaway local Postgres — see below.

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
npm run test:rls
```

`npm run test:rls` runs `supabase/tests/run.sh`: it builds a throwaway local Postgres
database, applies every migration, and checks the row-level-security rules from the point of
view of an owner, a supporter, a stranger and a signed-out reader. It needs Postgres 16+ on
your PATH (`brew install postgresql@16`) and never touches your Supabase project.

## A local stand-in for Supabase

To walk through invites and the supporter's view without email or a real project:

```bash
supabase/local-stack/start.sh   # Postgres + PostgREST + a stub for the auth calls
npm run dev:local               # 6TOC, pointed at it, on port 3016
```

The seed gives you Olive (owns a book with three goals) plus two accounts with no book. Sign
in as one of them from the browser console:

```js
document.cookie = 'sb-127-auth-token=' +
  await (await fetch('http://127.0.0.1:54400/__cookie?who=olive')).json() + '; path=/'
```

`who` is `olive`, `sam` or `tess`. Needs `brew install postgresql@16 postgrest`. Everything
listens on 127.0.0.1 only and the tokens are signed with a fixed local-only secret, so none
of it is safe for anything but local testing.

## What's built and what isn't

See [`docs/status.md`](docs/status.md) for the current state: what works, what is not built
yet (end of chapter, reminders, Vision, uploads), known rough edges, and decisions already made.
