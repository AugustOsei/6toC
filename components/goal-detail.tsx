"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HandDrawnButton, LoadingPage, PreviewRibbon, ScribbleDivider, Tape } from "@/components/ui";
import { addMilestone, addPlanItem, addPocketItem, completeGoal, loadBook, updatePlanItem } from "@/lib/data-store";
import { daysBetween, formatShortDate } from "@/lib/dates";
import type { BookData, Goal, Milestone, PlanItem, PocketItem } from "@/lib/types";

type Tab = "plan" | "pocket" | "milestones" | "vision";

export function GoalDetail({ goalId, productionMode }: { goalId: string; productionMode: boolean }) {
  const router = useRouter();
  const [book, setBook] = useState<BookData | null>(null);
  const [tab, setTab] = useState<Tab>("plan");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
  const plans = book.planItems.filter((item) => item.goalId === goalId);
  const pockets = book.pocketItems.filter((item) => item.goalId === goalId);
  const milestones = book.milestones.filter((item) => item.goalId === goalId);
  async function mutate(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The ink didn’t stick. Try again."); } finally { setBusy(false); } }
  return <main className={`detail-shell accent-${goal.accentColor}`}>{!productionMode && <PreviewRibbon />}<header className="detail-header"><Link href="/book" className="text-button">← My 6TOC</Link><span>THING {String(goal.sortOrder + 1).padStart(2, "0")} OF {String(book.goals.length).padStart(2, "0")}</span><span className="deadline-chip">{Math.max(0, daysBetween(new Date(), goal.deadline))} days left</span></header>
    <section className="goal-title"><div><span className="goal-title__number">0{goal.sortOrder + 1}</span><p className="eyebrow">THE THING</p><h1>{goal.title}</h1><p className="success-definition"><span>Done looks like:</span> {goal.successDefinition}</p></div><div className="goal-date-note"><Tape /><span>DEADLINE</span><strong>{formatShortDate(goal.deadline)}</strong><small>{goal.deadline.slice(0,4)}</small></div></section>
    {goal.status === "completed" ? <div className="completion-banner"><strong>DONE EARLY ✓</strong><span>{Math.max(0, daysBetween(goal.completedAt ?? goal.deadline, goal.deadline))} days to spare</span></div> : <button className="mark-goal-done" disabled={busy} onClick={() => mutate(() => completeGoal(goal.id))}>I did the thing ✓</button>}
    <nav className="paper-tabs" aria-label="Goal sections">{(["plan", "pocket", "milestones", "vision"] as Tab[]).map((name) => <button key={name} aria-current={tab === name ? "page" : undefined} onClick={() => setTab(name)}>{name === "pocket" ? "Pocket" : name[0].toUpperCase() + name.slice(1)}{name !== "vision" && <span>{name === "plan" ? plans.length : name === "pocket" ? pockets.length : milestones.length}</span>}</button>)}</nav>
    <section className="detail-page">{error && <p className="form-error" role="alert">{error}</p>}{tab === "plan" && <PlanPanel items={plans} goal={goal} busy={busy} mutate={mutate} />}{tab === "pocket" && <PocketPanel items={pockets} goal={goal} busy={busy} mutate={mutate} />}{tab === "milestones" && <MilestonesPanel items={milestones} goal={goal} busy={busy} mutate={mutate} />}{tab === "vision" && <VisionPanel />}</section>
  </main>;
}

function PlanPanel({ items, goal, busy, mutate }: { items: PlanItem[]; goal: Goal; busy: boolean; mutate: (action: () => Promise<void>) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [date, setDate] = useState(""); const [editing, setEditing] = useState<string | null>(null); const [editTitle, setEditTitle] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); if (!title.trim()) return; void mutate(() => addPlanItem(goal.id, title.trim(), date || undefined)).then(() => { setTitle(""); setDate(""); }); }
  return <div className="panel-layout"><div><p className="eyebrow">THE PLAN</p><h2>Small marks,<br />forward motion.</h2><p className="hand-note">Make the next move small enough to begin.</p></div><div><form className="quick-add" onSubmit={submit}><label><span>Add the next move</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Book the exam" /></label><label><span>By when? <small>optional</small></span><input type="date" min={goal.startDate} max={goal.deadline} value={date} onChange={(e) => setDate(e.target.value)} /></label><HandDrawnButton disabled={busy || !title.trim()}>Add to page +</HandDrawnButton></form><ScribbleDivider />
    {!items.length ? <EmptyState title="This page needs a plan." note="Start with one move. You can make it prettier later." /> : <ol className="plan-list">{items.map((item) => <li key={item.id} className={item.completed ? "is-complete" : ""}><button className="hand-checkbox" aria-label={item.completed ? `Mark ${item.title} incomplete` : `Mark ${item.title} complete`} aria-pressed={item.completed} disabled={busy} onClick={() => mutate(() => updatePlanItem(item.id, { completed: !item.completed }))}><svg viewBox="0 0 32 32"><path className="box" d="M4 5c7-2 17-1 24 0 1 8 0 16-1 23-7 1-16 0-23-1C3 20 3 12 4 5Z" /><path className="check" d="m8 16 6 7L26 9" /></svg></button><div>{editing === item.id ? <form className="edit-row" onSubmit={(e) => { e.preventDefault(); if (editTitle.trim()) void mutate(() => updatePlanItem(item.id, { title: editTitle.trim() })).then(() => setEditing(null)); }}><input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /><button>save</button><button type="button" onClick={() => setEditing(null)}>cancel</button></form> : <><strong>{item.title}</strong>{item.dueDate && <span>by {formatShortDate(item.dueDate)}</span>}</>} </div>{editing !== item.id && <button className="edit-button" onClick={() => { setEditing(item.id); setEditTitle(item.title); }}>edit</button>}</li>)}</ol>}</div></div>;
}

function PocketPanel({ items, goal, busy, mutate }: { items: PocketItem[]; goal: Goal; busy: boolean; mutate: (action: () => Promise<void>) => Promise<void> }) {
  const [type, setType] = useState<"note" | "url">("note"); const [title, setTitle] = useState(""); const [value, setValue] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); if (!title.trim() || !value.trim()) return; void mutate(() => addPocketItem(goal.id, type, title.trim(), value.trim())).then(() => { setTitle(""); setValue(""); }); }
  return <div className="panel-layout"><div><p className="eyebrow">POCKET</p><h2>Keep what might<br />help later.</h2><p className="hand-note">Notes, links, odd little sparks.</p></div><div><form className="pocket-form" onSubmit={submit}><div className="type-switch"><button type="button" className={type === "note" ? "active" : ""} onClick={() => setType("note")}>Note</button><button type="button" className={type === "url" ? "active" : ""} onClick={() => setType("url")}>URL</button></div><input aria-label="Pocket item title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give this scrap a title" />{type === "note" ? <textarea aria-label="Note" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Jot it down…" /> : <input aria-label="URL" type="url" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://" />}<HandDrawnButton disabled={busy || !title.trim() || !value.trim()}>Slip it in +</HandDrawnButton></form>
    {!items.length ? <EmptyState title="Nothing in your pocket yet." note="That’s okay. Travel light." /> : <div className="pocket-grid">{items.map((item, index) => <article className={`pocket-scrap pocket-scrap--${index % 3}`} key={item.id}><Tape color={index % 2 ? "pink" : "cream"} /><span>{item.type}</span><h3>{item.title}</h3>{item.type === "note" ? <p>{item.content}</p> : <a href={item.url} target="_blank" rel="noreferrer">Visit link ↗</a>}</article>)}</div>}</div></div>;
}

function MilestonesPanel({ items, goal, busy, mutate }: { items: Milestone[]; goal: Goal; busy: boolean; mutate: (action: () => Promise<void>) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); if (!title.trim()) return; void mutate(() => addMilestone(goal.id, title.trim(), description.trim())).then(() => { setTitle(""); setDescription(""); }); }
  return <div className="panel-layout"><div><p className="eyebrow">MILESTONES</p><h2>Pin the proof<br />to the page.</h2><p className="hand-note">The small wins are the story, too.</p></div><div><form className="quick-add milestone-add" onSubmit={submit}><label><span>What happened?</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="I passed my first practice exam" /></label><label><span>A little more <small>optional</small></span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What made it matter?" /></label><HandDrawnButton disabled={busy || !title.trim()}>Pin this moment +</HandDrawnButton></form>
    {!items.length ? <EmptyState title="Nothing worth pinning to the page yet." note="Keep going. The first pin usually arrives quietly." /> : <div className="milestone-list">{items.map((item) => <article key={item.id}><span className="pin" aria-hidden="true" /><time>{formatShortDate(item.achievedAt)}</time><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}</article>)}</div>}</div></div>;
}

function VisionPanel() { return <div className="vision-panel"><div className="vision-frame" aria-hidden="true"><svg viewBox="0 0 500 300"><path d="M40 238c66-55 92-24 144-77 37-39 57-100 104-90 46 9 39 79 73 93 39 17 59-7 101 46" /><circle cx="395" cy="70" r="28" /><path d="M68 258c107-17 224-9 365-2" /></svg><span>six months from here</span></div><div><p className="eyebrow">VISION</p><h2>See the other side.</h2><p>Before you start, picture where you’re going.</p><button className="ink-button" disabled title="Vision generation is coming in a later phase">Generate my six-month vision ✦</button><p className="hand-note">coming later — the blank space is intentional</p></div></div>; }

function EmptyState({ title, note }: { title: string; note: string }) { return <div className="empty-state"><span aria-hidden="true">↳</span><h3>{title}</h3><p>{note}</p></div>; }
