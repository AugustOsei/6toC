# 6TOC — build status

Last updated 2026-09-16. Read this first when picking the project back up.

## How the app runs today

- No `.env.local` exists, so the app runs in **local preview mode**: a yellow ribbon, no
  real sign-in, and everything is saved in the browser's `localStorage`. Supabase code
  paths exist but have not been exercised against a real project.
- The folder is **not a git repository** yet. Run `git init` before the next round of
  changes so there is history to diff against.
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

**A goal** (`/book/goals/[id]`)
- **Plan:** add a step (optional due date), tick it off / untick it, edit its title.
- **Pocket:** add a note or a link.
- **Milestones:** pin a win with an optional description (dated today).
- **Done:** "I did the thing ✓" marks the goal complete and shows days to spare.
- **Vision:** placeholder panel; the generate button is deliberately disabled.

**Database** (`supabase/migrations/202609150001_initial_schema.sql`)
- One active challenge per user, exactly six months, at most three goals, deadline
  bounds, row-level security on everything. Plan and Pocket items are owner-only by design.

## Not built yet

### The landing page's promise
- **Supporters — "people you trust in your corner".** The hero copy and the calendar's
  Month THREE message ("Ask your people for a push") both lean on this, and none of it
  exists in the UI. Tables `supporters` and `encouragements` exist (with an invite status
  enum) but nothing reads or writes them. Needs: invite flow, the supporter's view,
  sending encouragement, showing it in the book, and a decision on what supporters may
  see (Plan and Pocket must stay private — see the table comments).
- **A "how it works" section** under the hero. Suggested three steps, all true today:
  pick up to three things and define "done"; give each a deadline inside six months;
  plan and track it. Add "invite your people" only once supporters ship.

### Accounts
- **No sign-in page for returning users.** The only way to get a magic link is to go
  through onboarding again (it skips creating a second challenge if one exists).
- **No sign-out.**
- **`/book` is guarded only in the browser** — it redirects to onboarding when no book
  loads. There is no server-side auth check.
- **`/auth/callback` ignores a failed code exchange** and redirects regardless.

### Editing what already exists
- Goals: cannot edit title, "done looks like", or deadline after onboarding; cannot
  add a goal later when fewer than three were used; cannot undo "done"; the `paused`
  status is unused.
- Plan: no delete, no reordering, no changing a due date after adding; the
  `month` / `week` / `day` plan types exist in the schema but only `task` is used.
- Pocket: no edit, no delete, no file or image uploads (Storage not set up).
- Milestones: no edit or delete; the date is always today; `shareable` is never set.

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
- `git init`, and add at least smoke tests for onboarding and the book.

## Known rough edges

- The landing calendar's tear-off is a first pass. It was checked with measurements and
  paused frames, not by eye at full speed — judge it in a browser before polishing.
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
