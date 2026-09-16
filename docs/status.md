# 6TOC — build status

Last updated 2026-09-16. Read this first when picking the project back up.

## How the app runs today

- No `.env.local` exists, so the app runs in **local preview mode**: a yellow ribbon, no
  real sign-in, and everything is saved in the browser's `localStorage`. Supabase code
  paths exist but have not been exercised against a real project.
- The folder is a git repository (initialised 2026-09-16, no remote yet). The first commit
  is the baseline from before the accounts-and-editing round.
- There are **no automated tests**. Checks are `npm run lint`, `npm run typecheck`,
  `npm run build`.
- Dev server: `npm run dev` on port 3016. Running `next build` while the dev server is
  up overwrites `.next` and has twice knocked the dev server over; restart it after a build.

## Built and working (in preview mode)

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
- Checked on 2026-09-16 against a throwaway copy with placeholder Supabase variables
  (redirects, error messages, open-redirect guard). **Not yet tried against a real
  Supabase project** — see Launch.

**Landing page, "how it works"**
- Three cards under the hero: pick up to three, give each a deadline, plan it and tick it
  off. The hero button is still above the fold at 1440×900.

**Database** (`supabase/migrations/202609150001_initial_schema.sql`)
- One active challenge per user, exactly six months, at most three goals, deadline
  bounds, row-level security on everything. Plan and Pocket items are owner-only by design.

## Not built yet

### The landing page's promise
- **Supporters — "people you trust in your corner".** The hero copy and the calendar's
  Month THREE message ("Ask your people for a push") both lean on this, and none of it
  exists in the UI. Tables `supporters` and `encouragements` exist (with an invite status
  enum) but nothing reads or writes them. Needs: invite flow, the supporter's view,
  sending encouragement, showing it in the book, and **a decision from the owner on what
  supporters may see** (Plan and Pocket must stay private — see the table comments).
  Once it ships, add "invite your people" as a fourth "how it works" card.

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
- Connect a real Supabase project and test the whole magic-link path end to end.
- Deploy (Vercel) and add the deployed `/auth/callback` URL in Supabase.
- Add a git remote, and at least smoke tests for onboarding, sign-in and the book.
- In Supabase **URL Configuration**, allow `…/auth/callback**` (with the wildcard), since
  sign-in links now carry `?next=`.

## Known rough edges

- The landing calendar's tear-off is a first pass. It was checked with measurements and
  paused frames, not by eye at full speed — judge it in a browser before polishing.
- The browser pane used for testing doesn't submit forms on a synthetic Enter key; forms
  were tested by clicking. Real keyboards were not re-checked this round.
- On the book page at ~700px wide, "open this page →" overlaps the milestones count on
  each goal card.
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
- **Spiral binding alignment:** rings and punched holes share one nine-column grid
  driven by `--page-left`, `--page-right`, `--page-border` and `--punch-gutter` on
  `.calendar-stack`. Change those together or the wire drifts off the holes.
