"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDelete } from "@/components/confirm-delete";
import { GoalForm } from "@/components/goal-form";
import { HandDrawnButton, LoadingPage, PreviewRibbon, ScribbleDivider, Tape } from "@/components/ui";
import { addMilestone, addPlanItem, addPocketItem, completeGoal, deleteMilestone, deletePlanItem, deletePocketItem, loadBook, removeEncouragement, reopenGoal, reorderPlanItems, updateGoal, updateMilestone, updatePlanItem, updatePocketItem } from "@/lib/data-store";
import { daysBetween, formatShortDate, toDateInput } from "@/lib/dates";
import type { BookData, Encouragement, Goal, Milestone, PlanItem, PocketItem, Supporter } from "@/lib/types";

type Tab = "plan" | "pocket" | "milestones" | "corner" | "vision";
type Mutate = (action: () => Promise<void>) => Promise<boolean>;
interface PanelProps<T> { items: T[]; goal: Goal; busy: boolean; mutate: Mutate; encouragements: Encouragement[] }

export function GoalDetail({ goalId, productionMode }: { goalId: string; productionMode: boolean }) {
  const router = useRouter();
  const [book, setBook] = useState<BookData | null>(null);
  const [tab, setTab] = useState<Tab>("plan");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const refresh = useCallback(async () => { const data = await loadBook(); if (!data) return router.replace("/onboarding"); setBook(data); }, [router]);
  useEffect(() => {
    void loadBook().then((data) => {
      if (!data) router.replace("/onboarding");
      else setBook(data);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "This page got lost."));
  }, [router]);
  if (!book) return <LoadingPage message={error || "Opening this page…"} />;
  const goal = book.goals.find((item) => item.id === goalId);
  if (!goal) return <main className="center-page"><h1>This page isn’t in your book.</h1><Link href="/book">Return to My 6TOC</Link></main>;
  const plans = book.planItems.filter((item) => item.goalId === goalId).sort((a, b) => a.sortOrder - b.sortOrder);
  const pockets = book.pocketItems.filter((item) => item.goalId === goalId);
  const milestones = book.milestones.filter((item) => item.goalId === goalId);
  const encouragements = book.encouragements.filter((item) => item.goalId === goalId);
  // Supporters need accounts, so preview mode has no Corner tab.
  const tabs: Tab[] = productionMode ? ["plan", "pocket", "milestones", "corner", "vision"] : ["plan", "pocket", "milestones", "vision"];
  const counts: Record<Tab, number | null> = { plan: plans.length, pocket: pockets.length, milestones: milestones.length, corner: encouragements.length, vision: null };
  /** Runs a write, reloads the book, and reports whether it worked so forms know when to clear. */
  const mutate: Mutate = async (action) => {
    setBusy(true); setError("");
    try { await action(); await refresh(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The ink didn’t stick. Try again."); return false; }
    finally { setBusy(false); }
  };
  return <main className={`detail-shell accent-${goal.accentColor}`}>{!productionMode && <PreviewRibbon />}<header className="detail-header"><Link href="/book" className="text-button">← My 6TOC</Link><span>THING {String(goal.sortOrder + 1).padStart(2, "0")} OF {String(book.goals.length).padStart(2, "0")}</span><span className="deadline-chip">{Math.max(0, daysBetween(new Date(), goal.deadline))} days left</span></header>
    <section className="goal-title">{editingGoal
      ? <div className="goal-title__edit"><p className="eyebrow">EDIT THE THING</p><GoalForm initial={{ title: goal.title, successDefinition: goal.successDefinition, deadline: goal.deadline }} minDate={book.challenge.startDate} maxDate={book.challenge.endDate} submitLabel="Save this page" busy={busy} onCancel={() => setEditingGoal(false)} onSubmit={(draft) => void mutate(() => updateGoal(goal.id, draft)).then((ok) => ok && setEditingGoal(false))} />{error && <p className="form-error" role="alert">{error}</p>}</div>
      : <div><span className="goal-title__number">0{goal.sortOrder + 1}</span><p className="eyebrow">THE THING</p><h1>{goal.title}</h1><p className="success-definition"><span>Done looks like:</span> {goal.successDefinition}</p><button type="button" className="text-button" onClick={() => setEditingGoal(true)}>Edit this thing</button></div>}
      <div className="goal-date-note"><Tape /><span>DEADLINE</span><strong>{formatShortDate(goal.deadline)}</strong><small>{goal.deadline.slice(0,4)}</small></div></section>
    {goal.status === "completed"
      ? <div className="completion-banner"><strong>DONE EARLY ✓</strong><span>{Math.max(0, daysBetween(goal.completedAt ?? goal.deadline, goal.deadline))} days to spare</span><button type="button" className="scrap-action" disabled={busy} onClick={() => mutate(() => reopenGoal(goal.id))}>not quite — reopen</button></div>
      : <button className="mark-goal-done" disabled={busy} onClick={() => mutate(() => completeGoal(goal.id))}>I did the thing ✓</button>}
    <nav className="paper-tabs" aria-label="Goal sections">{tabs.map((name) => <button key={name} aria-current={tab === name ? "page" : undefined} onClick={() => setTab(name)}>{name[0].toUpperCase() + name.slice(1)}{counts[name] !== null && <span>{counts[name]}</span>}</button>)}</nav>
    <section className="detail-page">{error && !editingGoal && <p className="form-error" role="alert">{error}</p>}{tab === "plan" && <PlanPanel items={plans} goal={goal} busy={busy} mutate={mutate} encouragements={encouragements} />}{tab === "pocket" && <PocketPanel items={pockets} goal={goal} busy={busy} mutate={mutate} encouragements={encouragements} />}{tab === "milestones" && <MilestonesPanel items={milestones} goal={goal} busy={busy} mutate={mutate} encouragements={encouragements} />}{tab === "corner" && <CornerPanel goal={goal} busy={busy} mutate={mutate} encouragements={encouragements} supporters={book.supporters} plans={plans} milestones={milestones} />}{tab === "vision" && <VisionPanel />}</section>
  </main>;
}

function PlanPanel({ items, goal, busy, mutate, encouragements }: PanelProps<PlanItem>) {
  const [title, setTitle] = useState(""); const [date, setDate] = useState("");
  const [editing, setEditing] = useState<string | null>(null); const [editTitle, setEditTitle] = useState(""); const [editDate, setEditDate] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault(); if (!title.trim()) return;
    const nextOrder = items.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0);
    void mutate(() => addPlanItem(goal.id, title.trim(), date || undefined, nextOrder)).then((ok) => { if (ok) { setTitle(""); setDate(""); } });
  }
  function startEditing(item: PlanItem) { setEditing(item.id); setEditTitle(item.title); setEditDate(item.dueDate ?? ""); }
  function saveEdit(event: FormEvent, item: PlanItem) {
    event.preventDefault(); if (!editTitle.trim()) return;
    void mutate(() => updatePlanItem(item.id, { title: editTitle.trim(), dueDate: editDate || null })).then((ok) => ok && setEditing(null));
  }
  function move(index: number, by: -1 | 1) {
    const ordered = [...items];
    [ordered[index], ordered[index + by]] = [ordered[index + by], ordered[index]];
    void mutate(() => reorderPlanItems(ordered));
  }
  return <div className="panel-layout"><div><p className="eyebrow">THE PLAN</p><h2>Small marks,<br />forward motion.</h2><p className="hand-note">Make the next move small enough to begin.</p></div><div><form className="quick-add" onSubmit={submit}><label><span>Add the next move</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Book the exam" /></label><label><span>By when? <small>optional</small></span><input type="date" min={goal.startDate} max={goal.deadline} value={date} onChange={(e) => setDate(e.target.value)} /></label><HandDrawnButton disabled={busy || !title.trim()}>Add to page +</HandDrawnButton></form><ScribbleDivider />
    {!items.length ? <EmptyState title="This page needs a plan." note="Start with one move. You can make it prettier later." /> : <ol className="plan-list">{items.map((item, index) => <li key={item.id} className={item.completed ? "is-complete" : ""}>
      <button className="hand-checkbox" aria-label={item.completed ? `Mark ${item.title} incomplete` : `Mark ${item.title} complete`} aria-pressed={item.completed} disabled={busy} onClick={() => mutate(() => updatePlanItem(item.id, { completed: !item.completed }))}><svg viewBox="0 0 32 32"><path className="box" d="M4 5c7-2 17-1 24 0 1 8 0 16-1 23-7 1-16 0-23-1C3 20 3 12 4 5Z" /><path className="check" d="m8 16 6 7L26 9" /></svg></button>
      <div>{editing === item.id
        ? <form className="edit-row" onSubmit={(e) => saveEdit(e, item)}><input autoFocus aria-label="Step" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /><input type="date" aria-label="Due date" min={goal.startDate} max={goal.deadline} value={editDate} onChange={(e) => setEditDate(e.target.value)} /><button disabled={busy}>save</button><button type="button" onClick={() => setEditing(null)}>cancel</button></form>
        : <><strong>{item.title}</strong><CheerCount items={encouragements.filter((e) => e.planItemId === item.id)} />{item.dueDate && <span>by {formatShortDate(item.dueDate)}</span>}</>}</div>
      {editing !== item.id && <div className="scrap-actions">
        <button type="button" className="scrap-action" disabled={busy || index === 0} aria-label={`Move ${item.title} up`} onClick={() => move(index, -1)}>↑</button>
        <button type="button" className="scrap-action" disabled={busy || index === items.length - 1} aria-label={`Move ${item.title} down`} onClick={() => move(index, 1)}>↓</button>
        <button type="button" className="scrap-action" aria-label={`Edit ${item.title}`} onClick={() => startEditing(item)}>edit</button>
        <ConfirmDelete label={item.title} disabled={busy} onConfirm={() => void mutate(() => deletePlanItem(item.id))} />
      </div>}
    </li>)}</ol>}</div></div>;
}

function PocketPanel({ items, goal, busy, mutate }: PanelProps<PocketItem>) {
  const [type, setType] = useState<"note" | "url">("note"); const [title, setTitle] = useState(""); const [value, setValue] = useState("");
  const [editing, setEditing] = useState<string | null>(null); const [editTitle, setEditTitle] = useState(""); const [editValue, setEditValue] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); if (!title.trim() || !value.trim()) return; void mutate(() => addPocketItem(goal.id, type, title.trim(), value.trim())).then((ok) => { if (ok) { setTitle(""); setValue(""); } }); }
  function startEditing(item: PocketItem) { setEditing(item.id); setEditTitle(item.title); setEditValue((item.type === "note" ? item.content : item.url) ?? ""); }
  function saveEdit(event: FormEvent, item: PocketItem) {
    event.preventDefault(); if (!editTitle.trim() || !editValue.trim()) return;
    void mutate(() => updatePocketItem(item, editTitle.trim(), editValue.trim())).then((ok) => ok && setEditing(null));
  }
  return <div className="panel-layout"><div><p className="eyebrow">POCKET</p><h2>Keep what might<br />help later.</h2><p className="hand-note">Notes, links, odd little sparks.</p></div><div><form className="pocket-form" onSubmit={submit}><div className="type-switch"><button type="button" className={type === "note" ? "active" : ""} onClick={() => setType("note")}>Note</button><button type="button" className={type === "url" ? "active" : ""} onClick={() => setType("url")}>URL</button></div><input aria-label="Pocket item title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give this scrap a title" />{type === "note" ? <textarea aria-label="Note" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Jot it down…" /> : <input aria-label="URL" type="url" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://" />}<HandDrawnButton disabled={busy || !title.trim() || !value.trim()}>Slip it in +</HandDrawnButton></form>
    {!items.length ? <EmptyState title="Nothing in your pocket yet." note="That’s okay. Travel light." /> : <div className="pocket-grid">{items.map((item, index) => <article className={`pocket-scrap pocket-scrap--${index % 3}`} key={item.id}><Tape color={index % 2 ? "pink" : "cream"} /><span>{item.type}</span>
      {editing === item.id
        ? <form className="scrap-edit" onSubmit={(e) => saveEdit(e, item)}><input autoFocus aria-label="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />{item.type === "note" ? <textarea aria-label="Note" value={editValue} onChange={(e) => setEditValue(e.target.value)} /> : <input type="url" aria-label="URL" value={editValue} onChange={(e) => setEditValue(e.target.value)} />}<div className="scrap-actions"><button type="button" className="scrap-action" onClick={() => setEditing(null)}>cancel</button><button className="scrap-action" disabled={busy || !editTitle.trim() || !editValue.trim()}>save</button></div></form>
        : <><h3>{item.title}</h3>{item.type === "note" ? <p>{item.content}</p> : <a href={item.url} target="_blank" rel="noreferrer">Visit link ↗</a>}<div className="scrap-actions"><button type="button" className="scrap-action" aria-label={`Edit ${item.title}`} onClick={() => startEditing(item)}>edit</button><ConfirmDelete label={item.title} disabled={busy} onConfirm={() => void mutate(() => deletePocketItem(item.id))} /></div></>}
    </article>)}</div>}</div></div>;
}

function MilestonesPanel({ items, goal, busy, mutate, encouragements }: PanelProps<Milestone>) {
  const today = toDateInput(new Date());
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [date, setDate] = useState(today);
  const [editing, setEditing] = useState<string | null>(null); const [edit, setEdit] = useState({ title: "", description: "", achievedAt: "" });
  function submit(event: FormEvent) { event.preventDefault(); if (!title.trim() || !date) return; void mutate(() => addMilestone(goal.id, title.trim(), description.trim(), date)).then((ok) => { if (ok) { setTitle(""); setDescription(""); setDate(today); } }); }
  function saveEdit(event: FormEvent, item: Milestone) {
    event.preventDefault(); if (!edit.title.trim() || !edit.achievedAt) return;
    void mutate(() => updateMilestone(item.id, { title: edit.title.trim(), description: edit.description.trim(), achievedAt: edit.achievedAt })).then((ok) => ok && setEditing(null));
  }
  return <div className="panel-layout"><div><p className="eyebrow">MILESTONES</p><h2>Pin the proof<br />to the page.</h2><p className="hand-note">The small wins are the story, too.</p></div><div><form className="quick-add milestone-add" onSubmit={submit}><label><span>What happened?</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="I passed my first practice exam" /></label><label><span>A little more <small>optional</small></span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What made it matter?" /></label><label><span>When?</span><input type="date" min={goal.startDate} max={today} value={date} onChange={(e) => setDate(e.target.value)} /></label><HandDrawnButton disabled={busy || !title.trim() || !date}>Pin this moment +</HandDrawnButton></form>
    {!items.length ? <EmptyState title="Nothing worth pinning to the page yet." note="Keep going. The first pin usually arrives quietly." /> : <div className="milestone-list">{items.map((item) => <article key={item.id}><span className="pin" aria-hidden="true" />
      {editing === item.id
        ? <form className="scrap-edit" onSubmit={(e) => saveEdit(e, item)}><input type="date" aria-label="Date" min={goal.startDate} max={today} value={edit.achievedAt} onChange={(e) => setEdit({ ...edit, achievedAt: e.target.value })} /><input autoFocus aria-label="What happened" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /><input aria-label="A little more" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="What made it matter?" /><div className="scrap-actions"><button type="button" className="scrap-action" onClick={() => setEditing(null)}>cancel</button><button className="scrap-action" disabled={busy || !edit.title.trim() || !edit.achievedAt}>save</button></div></form>
        : <><time dateTime={item.achievedAt}>{formatShortDate(item.achievedAt)}</time><h3>{item.title}</h3><CheerCount items={encouragements.filter((e) => e.milestoneId === item.id)} />{item.description && <p>{item.description}</p>}<div className="scrap-actions"><button type="button" className="scrap-action" aria-label={`Edit ${item.title}`} onClick={() => { setEditing(item.id); setEdit({ title: item.title, description: item.description, achievedAt: item.achievedAt }); }}>edit</button><ConfirmDelete label={item.title} disabled={busy} onConfirm={() => void mutate(() => deleteMilestone(item.id))} /></div></>}
    </article>)}</div>}</div></div>;
}

/** A small "♥ 2" beside a step or milestone that people in the corner reacted to. */
function CheerCount({ items }: { items: Encouragement[] }) {
  if (!items.length) return null;
  const cheers = items.filter((e) => e.kind === "cheer").length;
  const notes = items.length - cheers;
  const words = [cheers && `${cheers} ${cheers === 1 ? "cheer" : "cheers"}`, notes && `${notes} ${notes === 1 ? "note" : "notes"}`].filter(Boolean).join(", ");
  return <small className="cheer-count" title={words} aria-label={`From your corner: ${words}`}>♥ {items.length}</small>;
}

function CornerPanel({ goal, busy, mutate, encouragements, supporters, plans, milestones }: { goal: Goal; busy: boolean; mutate: Mutate; encouragements: Encouragement[]; supporters: Supporter[]; plans: PlanItem[]; milestones: Milestone[] }) {
  const following = supporters.filter((s) => s.status === "accepted" && s.goalIds.includes(goal.id));
  const invited = supporters.filter((s) => s.status === "pending" && s.goalIds.includes(goal.id));
  const nameOf = (id: string) => supporters.find((s) => s.id === id)?.name ?? "Someone";
  function where(e: Encouragement): string {
    if (e.planItemId) return `the step “${plans.find((p) => p.id === e.planItemId)?.title ?? "a step"}”`;
    if (e.milestoneId) return `the milestone “${milestones.find((m) => m.id === e.milestoneId)?.title ?? "a milestone"}”`;
    return "this thing";
  }
  return <div className="panel-layout"><div><p className="eyebrow">CORNER</p><h2>Who’s<br />cheering.</h2><p className="hand-note">{following.length ? `Followed by ${following.map((s) => s.name).join(", ")}.` : "Nobody follows this one yet."}{invited.length ? ` ${invited.length} invite${invited.length === 1 ? "" : "s"} waiting.` : ""}</p><Link href="/book#corner" className="text-button">Manage my corner →</Link></div><div>
    {!encouragements.length ? <EmptyState title="No cheers on this page yet." note={following.length ? "They can see it. Give them something to cheer." : "Invite someone from your book to follow this thing."} /> : <ul className="note-list note-list--owner">{encouragements.map((e) => <li key={e.id} className={`note-list__${e.kind}`}>
      {e.kind === "comment" ? <p>{e.message}</p> : <p><span aria-hidden="true">♥</span> cheered {where(e)}</p>}
      <span>{nameOf(e.supporterId)} · {formatShortDate(toDateInput(new Date(e.createdAt)))}{e.kind === "comment" && e.milestoneId ? ` · on ${where(e)}` : ""}</span>
      <ConfirmDelete label={e.kind === "comment" ? `note from ${nameOf(e.supporterId)}` : `cheer from ${nameOf(e.supporterId)}`} disabled={busy} onConfirm={() => void mutate(() => removeEncouragement(e.id))} />
    </li>)}</ul>}
  </div></div>;
}

function VisionPanel() { return <div className="vision-panel"><div className="vision-frame" aria-hidden="true"><svg viewBox="0 0 500 300"><path d="M40 238c66-55 92-24 144-77 37-39 57-100 104-90 46 9 39 79 73 93 39 17 59-7 101 46" /><circle cx="395" cy="70" r="28" /><path d="M68 258c107-17 224-9 365-2" /></svg><span>six months from here</span></div><div><p className="eyebrow">VISION</p><h2>See the other side.</h2><p>Before you start, picture where you’re going.</p><button className="ink-button" disabled title="Vision generation is coming in a later phase">Generate my six-month vision ✦</button><p className="hand-note">coming later — the blank space is intentional</p></div></div>; }

function EmptyState({ title, note }: { title: string; note: string }) { return <div className="empty-state"><span aria-hidden="true">↳</span><h3>{title}</h3><p>{note}</p></div>; }
