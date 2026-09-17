# 6TOC — build status

Last updated 2026-09-17. Read this first when picking the project back up.

## How the app runs today

- **Live:** https://6toc.augustministry.workers.dev (Cloudflare Worker `6toc`, deploys on
  every push to `main`). Checked 2026-09-16: Supabase mode, `/book` redirects to sign-in,
  callback errors handled, no console errors. A real magic-link sign-in worked on
  2026-09-17, once the Supabase URL configuration was fixed.

- Supabase project `kkwrrakcsebrwronsydh` is connected for builds through the committed
  `.env.production` (public URL + publishable key; the schema has been run). `npm run dev`
  doesn't read that file, so local dev without `.env.local` still runs in **local preview mode**: a yellow ribbon, no
  real sign-in, and everything is saved in the browser's `localStorage`. Sign-in has now been
  used for real; the supporter paths were exercised against the local stack below, not yet
  against Supabase itself.
- Git remote is `github.com/AugustOsei/6toC` (`main`). Cloudflare builds and deploys on
  every push, so a push is a release.
- Checks are `npm run lint`, `npm run typecheck`, `npm run build` and `npm run test:rls`.
  `test:rls` is the only automated test: it applies every migration to a throwaway local
  Postgres and checks the row-level-security rules as an owner, a supporter, a stranger and a
  signed-out reader (32 checks, `supabase/tests/`). There are still **no tests of the UI**.
- `supabase/local-stack/start.sh` plus `npm run dev:local` runs the app against a local
  Postgres + PostgREST + an auth stub, which is how the whole supporter flow was walked
  through without email. Needs `brew install postgresql@16 postgrest`. See the README.
- Dev server: `npm run dev` on port 3016. `npm run preview` runs the Cloudflare Workers
  build locally on port 8787. Running `next build` while the dev server is
  up overwrites `.next` and has twice knocked the dev server over; restart it after a build.

## Built and working

**Landing page** (`app/page.tsx`)
- Hero: headline, one paragraph, "Pick what matters" button, handwritten aside.
- The button sits above the fold on a 1440×900 laptop; no horizontal scroll on phones.
- Six-month calendar illustration (`SixMonthCalendar mode="cover"`), animated:
  - each month is **torn off** along the perforation and falls downward, leaving a
    ragged stub on the rings; played at 12fps for a stop-motion feel;
  - the next page then "inks in": ticks draw day by day, today gets stamped, the
    progress rule fills;
  - nothing moves above the rings, so the copy above is never covered;
  - reduced-motion users see Month ONE already inked, with no motion.
- One caption under the calendar, "↑ every tick is progress", with its arrow lined up on
  the first column of days (where the ticks always start) at desktop and phone widths.

**Onboarding** (`/onboarding`, three pages)
- Name → email → one to three goals, each with a "what does done look like" and a
  deadline inside the six months (quick picks or a custom date).
- Preview mode: saves straight to `localStorage` and opens the book.
- Supabase mode: stores the draft, emails a magic link, and on return
  (`/auth/callback` → `/onboarding?resume=1`) creates the profile, challenge and goals.

**The book** (`/book`)
- Chapter intro, start/end dates, the interactive six-month calendar with earlier/later
  buttons and a WebGL page curl (`lib/page-turn.ts`).
- One card per goal: deadline, days left, plan progress, Pocket and milestone counts.
  Each card uses its goal's colour (tomato / cobalt / leaf). Until 2026-09-16 a CSS
  ordering bug made every card and goal page tomato.
- **Add a goal later:** while fewer than three spaces are used, a dashed "use another
  space" card opens the goal form (deadline between today and the end of the chapter).
- **Sign out** in the header (Supabase mode). Preview mode keeps "Close book ×".

**A goal** (`/book/goals/[id]`)
- **The goal itself:** "Edit this thing" changes title, "done looks like" and deadline
  (kept inside the chapter).
- **Plan:** add a step (optional due date), tick / untick, edit title and due date,
  move up / down, delete. New steps get the next `sort_order` (in Supabase mode they used
  to all get 0).
- **Pocket:** add, edit or delete a note or a link (type can't change after adding).
- **Milestones:** pin a win with an optional description and a date (chapter start to
  today); edit or delete it.
- **Done:** "I did the thing ✓" marks the goal complete and shows days to spare;
  "not quite — reopen" undoes it.
- Every delete asks first ("tear it out? yes / keep"). There is no undo.
- **Vision:** placeholder panel; the generate button is deliberately disabled.

**Accounts** (Supabase mode)
- `/sign-in`: email → magic link → `/auth/callback?next=/book` → the book. In preview mode
  the page explains there are no accounts and links to the book.
- `/auth/callback` only follows same-site `next` paths, and sends failed or missing codes
  to `/sign-in?error=…` with a message.
- `/book` is guarded twice: `proxy.ts` 307s signed-out readers to `/sign-in`, and
  `app/book/layout.tsx` checks `getUser()` on the server.
- Onboarding saves straight away if the reader is already signed in (e.g. signed in with
  no book yet) instead of sending a second link.
- Sign-in links appear in the landing header and on onboarding, only in Supabase mode.
- `next` paths are checked by one guard (`lib/safe-path.ts`). It also refuses backslashes:
  `/\evil.com` used to pass the old check and browsers read it as `//evil.com`, so a crafted
  sign-in link could have bounced the reader off-site. Fixed 2026-09-17.
- A real magic-link sign-in was done on 2026-09-17. The supporter flows have only been run
  against the local stack.

**Landing page, "how it works"**
- Four cards under the hero: pick up to three, give each a deadline, plan it and tick it
  off, invite your people. Four across on wide screens, two by two under 1100px, one on
  phones. The hero button is still above the fold at 1440×900.
- Footer credits "A project by August Engine" (links to augustengine.com).

**Supporters — "people you trust in your corner"** (Supabase mode only)
- **What a supporter may see was decided 2026-09-17:** only the goals the owner picks for
  them, plus those goals' plans and milestones. **Pocket is never shared.** Supporter access
  is read-only and enforced by row-level security, not by the UI.
- **Owner's side** — "My corner" on `/book` (`components/corner-shelf.tsx`): invite by name
  and email with a per-goal tick list, copy the invite link, edit a supporter's name and
  goals, pause or restore access, remove them (which removes their cheers and notes too).
  Goal cards gained a "From my corner" count.
- **The invite** — `/invite/[token]`. 6TOC sends no email: the owner passes the link on
  themselves. Before sign-in the page shows both names, how many things are shared and a
  masked email, nothing else. The invited person signs in with the invited email (a magic
  link that returns to the invite), and the database refuses anyone else, so a forwarded
  link is useless.
- **Supporter's side** — `/supporting` lists the books they're in; `/supporting/[id]` shows
  the shared goals with plans and milestones, a cheer toggle on a goal, a step or a
  milestone, notes on a goal or a milestone, "take back" on their own notes, and "leave this
  book" (which only they can undo).
- **In the owner's book** — a "Corner" tab on each goal page lists every cheer and note with
  who and when, and lets the owner tear one out; steps and milestones show a "♥ n" count.
- Signing in with an account that supports others but has no book of its own opens
  `/supporting` instead of onboarding.
- Landing page now has a fourth "how it works" card, "Invite your people".
- Checked end to end on 2026-09-17 against the local stack: invite, wrong-email refusal,
  accept, cheers and notes both ways, pause, restore, leave, remove, duplicate invite,
  broken link, and both phone and desktop widths.

**Database** (`supabase/migrations/202609150001_initial_schema.sql`,
`supabase/migrations/202609160001_supporters.sql`)
- One active challenge per user, exactly six months, at most three goals, deadline
  bounds, row-level security on everything. Pocket items are owner-only by design.
- The supporters migration adds per-goal access (`supporter_goals`), a secret invite token,
  the `accept_invite` / `leave_book` / `my_supported_books` functions, and cheers and
  comments on a goal, a step or a milestone. Only `accept_invite` can link an account to an
  invite, and an owner can't reinstate someone who chose to leave.
- **Not yet run on the Supabase project** (`kkwrrakcsebrwronsydh`) as of 2026-09-17. Run
  `supabase/migrations/202609160001_supporters.sql` once in the SQL editor before the next
  deploy, or supporters will error in production while the rest of the app keeps working.

## Not built yet

### Supporters, next round
- 6TOC sends no invite email; the owner passes the link on. An emailed invite needs a mail
  sender (Supabase auth email can't carry this).
- Supporters get no notification when something is shared, and owners get none when a cheer
  or note arrives.
- A supporter with several books sees them listed, but there's no single feed.
- `preferences` on `supporters` is unused.

### Editing what already exists (leftovers)
- Goals: the `paused` status is unused; goals can't be deleted.
- Plan: the `month` / `week` / `day` plan types exist in the schema but only `task` is used.
- Pocket: no file or image uploads (Storage not set up).
- Milestones: `shareable` is never set.

### The rest of the six months
- **End of chapter:** nothing happens when the six months end — no recap, no way to
  close the chapter or start a new one (`completed` / `archived` statuses unused).
- **Reminders:** `notification_preferences` table exists (off / weekly / twice weekly);
  no settings screen and no emails are sent.
- **Shareable milestone cards.**
- **Vision:** AI-generated six-month vision image (`vision_images` table exists).
- **AI goal review and planning help.**
- **PWA / install to home screen.**

### Launch
- **Run the supporters migration on Supabase** before the next deploy (see Database above).
- Sign in as a real person and walk through inviting a supporter on the live site: the
  supporter flow has never run against Supabase itself.
- Deploy to **Cloudflare Workers** (chosen over Vercel, 2026-09-16) and add the deployed
  `…/auth/callback**` URL in Supabase. The OpenNext setup is done (`wrangler.jsonc`,
  `open-next.config.ts`, `npm run preview` / `deploy`; see the README). A local Workers
  build passed every route check, including the `proxy.ts` redirect, which OpenNext still
  calls experimental. Re-check `/book` while signed out after the first real deploy.
- Add a git remote, and smoke tests for onboarding, sign-in and the book (the only
  automated tests today are the row-level-security ones).
- In Supabase **URL Configuration**, allow `…/auth/callback**` (with the wildcard), since
  sign-in links now carry `?next=`. Done on 2026-09-17: a real magic-link sign-in worked
  after the site URL and callback URL were set (before that, links landed on
  `http://localhost:3000/?code=…`, Supabase's default site URL).

## Known rough edges

- The landing calendar's tear-off is a first pass. It was checked with measurements and
  paused frames, not by eye at full speed — judge it in a browser before polishing.
- The browser pane used for testing doesn't submit forms on a synthetic Enter key; forms
  were tested by clicking. Real keyboards were not re-checked this round.
- On narrow phones the calendar page's bottom row (days 29–30) is partly cut off by the
  page frame. This predates the recent work.
- The book's WebGL page curl rasterises each page with `html-to-image`, which is heavy
  and adds `three` to the bundle. If the book calendar gets the same treatment as the
  landing page, `lib/page-turn.ts` and the `three` / `html-to-image` dependencies can go.

## Decisions already made (don't relitigate without a reason)

- **Calendar animation style:** flat and hand-drawn to match the ink-and-paper look.
  Realistic 3D (a WebGL curl on the landing page, then a Blender cloth-sim video) was
  tried and rejected: it looked pasted onto the page, and any page that flips *up* over
  the binding covers the hero copy, especially on phones.
- **The landing calendar is illustrative:** fixed "today" per page and 30 generic days.
  It is not tied to the visitor's real dates.
- **What supporters may see** (2026-09-17): the goals the owner picks for them, with those
  goals' plans and milestones. Pocket is never shared — it's where the honest, unflattering
  notes go, and sharing it would change what people write. Enforced in the database, so a UI
  mistake can't leak it.
- **Invites are links, not emails** (2026-09-17): 6TOC has no mail sender, and Supabase's
  auth email can't carry an invite. The owner passes the link on themselves, which also
  keeps the app out of the middle of a personal ask. The link is useless to anyone but the
  invited email address.
- **Spiral binding alignment:** rings and punched holes share one nine-column grid
  driven by `--page-left`, `--page-right`, `--page-border` and `--punch-gutter` on
  `.calendar-stack`. Change those together or the wire drifts off the holes.
