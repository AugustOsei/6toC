"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand, HandDrawnButton, HandDrawnLink, LoadingPage, PaperPage, PreviewRibbon, ScribbleDivider, Tape } from "@/components/ui";
import { cheer, comment, leaveBook, loadSupportedBook, removeEncouragement } from "@/lib/data-store";
import { daysBetween, formatShortDate, toDateInput } from "@/lib/dates";
import type { Encouragement, EncouragementTarget, Goal, SupportedBook } from "@/lib/types";

type Run = (action: () => Promise<void>) => Promise<boolean>;

const sameTarget = (e: Encouragement, t: EncouragementTarget) =>
  e.goalId === t.goalId && e.planItemId === t.planItemId && e.milestoneId === t.milestoneId;

/** Someone else's book, read-only, with room to cheer and leave notes. */
export function SupportedBookView({ supporterId, productionMode }: { supporterId: string; productionMode: boolean }) {
  const router = useRouter();
  const [book, setBook] = useState<SupportedBook | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const refresh = useCallback(async () => setBook(await loadSupportedBook(supporterId)), [supporterId]);
  useEffect(() => {
    if (!productionMode) return;
    loadSupportedBook(supporterId).then(setBook).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "We couldn’t open this book."));
  }, [supporterId, productionMode]);

  const run: Run = async (action) => {
    setBusy(true); setError("");
    try { await action(); await refresh(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That didn’t go through. Try again."); return false; }
    finally { setBusy(false); }
  };

  if (!productionMode) return <main className="onboarding-shell"><PreviewRibbon /><PaperPage className="message-page"><Tape /><p className="folio">Local preview</p><h1>Supporting needs real accounts.</h1><HandDrawnLink href="/book">Open my book →</HandDrawnLink></PaperPage></main>;
  if (book === undefined) return <LoadingPage message={error || "Opening their book…"} />;
  if (book === null) return <main className="center-page"><h1>This book is closed to you.</h1><p>They may have paused your access, or you left it.</p><Link href="/supporting">Books I support</Link></main>;

  const daysLeft = Math.max(0, daysBetween(new Date(), book.endDate));
  return <main className="book-shell supported-book">
    <header className="book-header"><Link href="/supporting" className="text-button">← Books I support</Link><span>IN {book.ownerName.toUpperCase()}’S CORNER</span><Brand compact /></header>
    <section className="supported-intro paper-page">
      <p className="folio">{formatShortDate(book.startDate)} → {formatShortDate(book.endDate)} · {daysLeft} days left</p>
      <h1>{book.ownerName}’s<br />six months.</h1>
      <p>You can see the {book.goals.length === 1 ? "thing" : `${book.goals.length} things`} {book.ownerName} shared with you. Tap <strong>cheer</strong> on anything worth celebrating, or leave a note. Only {book.ownerName} sees what you write.</p>
    </section>
    {error && <p className="form-error supported-error" role="alert">{error}</p>}
    {!book.goals.length && <div className="corner-note paper-card"><p>{book.ownerName} hasn’t shared any goals with you right now.</p></div>}
    {book.goals.map((goal) => <SharedGoal key={goal.id} goal={goal} book={book} busy={busy} run={run} />)}
    <footer className="supported-footer">{leaving
      ? <span className="confirm-delete" role="group" aria-label="Leave this book?"><span>stop following {book.ownerName}’s book?</span><button type="button" className="scrap-action scrap-action--danger" disabled={busy} onClick={() => void run(() => leaveBook(supporterId)).then((ok) => ok && router.replace("/supporting"))}>yes, leave</button><button type="button" className="scrap-action" autoFocus onClick={() => setLeaving(false)}>stay</button></span>
      : <button type="button" className="scrap-action" onClick={() => setLeaving(true)}>leave this book</button>}</footer>
  </main>;
}

function SharedGoal({ goal, book, busy, run }: { goal: Goal; book: SupportedBook; busy: boolean; run: Run }) {
  const plans = book.planItems.filter((item) => item.goalId === goal.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const milestones = book.milestones.filter((item) => item.goalId === goal.id);
  const notes = book.encouragements.filter((e) => e.goalId === goal.id && e.kind === "comment");
  const done = plans.filter((item) => item.completed).length;
  const days = Math.max(0, daysBetween(new Date(), goal.deadline));
  const cheerProps = { book, busy, run };

  return <article className={`shared-goal accent-${goal.accentColor}`}>
    <div className="shared-goal__head">
      <div>
        <p className="eyebrow">THING {String(goal.sortOrder + 1).padStart(2, "0")}</p>
        <h2>{goal.title}</h2>
        <p className="success-definition"><span>Done looks like:</span> {goal.successDefinition}</p>
      </div>
      <div className="goal-date-note"><Tape /><span>DEADLINE</span><strong>{formatShortDate(goal.deadline)}</strong><small>{goal.status === "completed" ? "done ✓" : `${days} days left`}</small></div>
    </div>
    {goal.status === "completed" && <p className="done-early">DONE EARLY ✓</p>}
    <div className="shared-goal__cheer"><CheerButton target={{ goalId: goal.id }} label={`Cheer ${goal.title}`} big {...cheerProps} /></div>
    <ScribbleDivider />
    <div className="shared-goal__body">
      <section>
        <h3>The plan <small>{done} / {plans.length} done</small></h3>
        {!plans.length ? <p className="hand-note">No steps written down yet.</p> : <ol className="plan-list plan-list--readonly">{plans.map((item) => <li key={item.id} className={item.completed ? "is-complete" : ""}>
          <span className="hand-checkbox" role="img" aria-label={item.completed ? "Done" : "Not done yet"}><svg viewBox="0 0 32 32"><path className="box" d="M4 5c7-2 17-1 24 0 1 8 0 16-1 23-7 1-16 0-23-1C3 20 3 12 4 5Z" /><path className="check" d="m8 16 6 7L26 9" /></svg></span>
          <div><strong>{item.title}</strong>{item.dueDate && <span>by {formatShortDate(item.dueDate)}</span>}</div>
          <CheerButton target={{ goalId: goal.id, planItemId: item.id }} label={`Cheer ${item.title}`} {...cheerProps} />
        </li>)}</ol>}
      </section>
      <section>
        <h3>Milestones <small>{milestones.length}</small></h3>
        {!milestones.length ? <p className="hand-note">Nothing pinned yet. The first one usually arrives quietly.</p> : <div className="milestone-list">{milestones.map((item) => <article key={item.id}><span className="pin" aria-hidden="true" />
          <time dateTime={item.achievedAt}>{formatShortDate(item.achievedAt)}</time><h4>{item.title}</h4>{item.description && <p>{item.description}</p>}
          <div className="scrap-actions"><CheerButton target={{ goalId: goal.id, milestoneId: item.id }} label={`Cheer ${item.title}`} {...cheerProps} /><NoteForm target={{ goalId: goal.id, milestoneId: item.id }} supporterId={book.supporterId} compact busy={busy} run={run} /></div>
        </article>)}</div>}
      </section>
    </div>
    <section className="shared-goal__notes">
      <h3>A note for {book.ownerName}</h3>
      <NoteForm target={{ goalId: goal.id }} supporterId={book.supporterId} busy={busy} run={run} />
      {notes.length > 0 && <ul className="note-list">{notes.map((note) => <li key={note.id}>
        <p>{note.message}</p>
        <span>{formatShortDate(toDateInput(new Date(note.createdAt)))}{note.milestoneId && ` · on “${milestones.find((m) => m.id === note.milestoneId)?.title ?? "a milestone"}”`}</span>
        <button type="button" className="scrap-action" disabled={busy} onClick={() => run(() => removeEncouragement(note.id))}>take back</button>
      </li>)}</ul>}
    </section>
  </article>;
}

function CheerButton({ target, label, book, busy, run, big = false }: { target: EncouragementTarget; label: string; book: SupportedBook; busy: boolean; run: Run; big?: boolean }) {
  const mine = book.encouragements.find((e) => e.kind === "cheer" && sameTarget(e, target));
  return <button type="button" className={`cheer-button${big ? " cheer-button--big" : ""}`} aria-pressed={Boolean(mine)} aria-label={mine ? `${label} (cheered — tap to undo)` : label} disabled={busy}
    onClick={() => run(() => mine ? removeEncouragement(mine.id) : cheer(book.supporterId, target))}>
    <span aria-hidden="true">{mine ? "♥" : "♡"}</span> {mine ? "cheered" : big ? "cheer this on" : "cheer"}
  </button>;
}

function NoteForm({ target, supporterId, busy, run, compact = false }: { target: EncouragementTarget; supporterId: string; busy: boolean; run: Run; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const [message, setMessage] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    void run(() => comment(supporterId, target, message.trim())).then((ok) => { if (ok) { setMessage(""); if (compact) setOpen(false); } });
  }
  if (!open) return <button type="button" className="scrap-action" onClick={() => setOpen(true)}>leave a note</button>;
  return <form className={`note-form${compact ? " note-form--compact" : ""}`} onSubmit={submit}>
    <textarea autoFocus={compact} aria-label="Your note" maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={compact ? "Well done on this…" : "Something encouraging, honest, or both."} />
    <div className="scrap-actions">{compact && <button type="button" className="scrap-action" onClick={() => setOpen(false)}>cancel</button>}<HandDrawnButton disabled={busy || !message.trim()}>Send note</HandDrawnButton></div>
  </form>;
}
