"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { HandDrawnButton } from "@/components/ui";
import { inviteLink, inviteSupporter, listSupportedBooks, removeSupporter, setSupporterAccess, updateSupporter } from "@/lib/data-store";
import type { BookData, Goal, InviteStatus, Supporter } from "@/lib/types";

const STATUS: Record<InviteStatus, string> = {
  pending: "invited",
  accepted: "in my corner",
  revoked: "access paused",
  declined: "stepped out",
};

/**
 * The people the owner has let into their book. Supporters see only the goals picked for
 * them, with those goals' plans and milestones. The Pocket is never shared.
 */
export function CornerShelf({ book, productionMode, onChanged }: { book: BookData; productionMode: boolean; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [fresh, setFresh] = useState<{ name: string; link: string } | null>(null);
  const [supporting, setSupporting] = useState(0);
  useEffect(() => { listSupportedBooks().then((books) => setSupporting(books.length)).catch(() => undefined); }, []);

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true); setError("");
    try { await action(); await onChanged(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That didn’t go through. Try again."); return false; }
    finally { setBusy(false); }
  }

  const heading = <div className="section-heading"><p className="eyebrow">MY CORNER</p><h2>People cheering me on</h2><span>{productionMode ? `${book.supporters.filter((s) => s.status === "accepted").length} in my corner` : "needs accounts"}</span></div>;
  if (!productionMode) return <section className="corner-shelf" id="corner">{heading}<div className="corner-note paper-card"><p><strong>Supporters need real accounts,</strong> so they aren’t part of the local preview.</p><p className="hand-note">Connect Supabase and you can invite the people you trust to follow chosen goals.</p></div></section>;

  return <section className="corner-shelf" id="corner">{heading}
    <p className="corner-intro">Invite people you trust to follow the things you pick. They see those goals, their plans and milestones, and can cheer or leave a note. <strong>Your Pocket stays private.</strong></p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {fresh && <InviteReady {...fresh} onDone={() => setFresh(null)} />}
    <div className="corner-grid">
      {book.supporters.map((supporter) => <SupporterCard key={supporter.id} supporter={supporter} goals={book.goals} encouragementCount={book.encouragements.filter((e) => e.supporterId === supporter.id).length} busy={busy} run={run} />)}
      {inviting
        ? <InviteForm goals={book.goals} busy={busy} onCancel={() => setInviting(false)} onSubmit={async (name, email, goalIds) => {
            let token = "";
            if (await run(async () => { token = await inviteSupporter(book.challenge.id, name, email, goalIds); })) { setInviting(false); setFresh({ name, link: inviteLink(token) }); }
          }} />
        : <button type="button" className="supporter-card supporter-card--empty" onClick={() => { setInviting(true); setFresh(null); }}><strong>＋ invite someone</strong><span className="hand-note">A friend, a mentor, whoever keeps you honest.</span></button>}
    </div>
    {supporting > 0 && <p className="corner-also"><Link href="/supporting" className="text-button">You’re in {supporting === 1 ? "one other person’s" : `${supporting} other people’s`} corner →</Link></p>}
  </section>;
}

function InviteForm({ goals, busy, onSubmit, onCancel }: { goals: Goal[]; busy: boolean; onSubmit: (name: string, email: string, goalIds: string[]) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [goalIds, setGoalIds] = useState(goals.map((goal) => goal.id));
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Who is this invite for?");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("That email looks unfinished.");
    if (!goalIds.length) return setError("Pick at least one thing for them to follow.");
    setError("");
    onSubmit(name.trim(), email.trim(), goalIds);
  }
  return <form className="supporter-card supporter-card--form" onSubmit={submit}>
    <p className="eyebrow">A NEW INVITE</p>
    <label className="line-field"><span>Their name</span><input autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ama" /></label>
    <label className="line-field"><span>Their email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ama@example.com" /></label>
    <p className="corner-hint">They’ll need to sign in with this email to open the invite.</p>
    <GoalPicker goals={goals} value={goalIds} onChange={setGoalIds} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="goal-form__actions"><button type="button" className="text-button" onClick={onCancel}>Cancel</button><HandDrawnButton disabled={busy}>Make the invite</HandDrawnButton></div>
  </form>;
}

function GoalPicker({ goals, value, onChange }: { goals: Goal[]; value: string[]; onChange: (ids: string[]) => void }) {
  return <fieldset className="goal-picker"><legend>What can they follow?</legend>
    {goals.map((goal) => <label key={goal.id} className={`accent-${goal.accentColor}`}><input type="checkbox" checked={value.includes(goal.id)} onChange={(e) => onChange(e.target.checked ? [...value, goal.id] : value.filter((id) => id !== goal.id))} /><span>{goal.title}</span></label>)}
  </fieldset>;
}

/** Shown once, straight after an invite is made: 6TOC doesn't send invite emails itself. */
function InviteReady({ name, link, onDone }: { name: string; link: string; onDone: () => void }) {
  return <div className="invite-ready paper-card" role="status">
    <p className="eyebrow">INVITE READY</p>
    <p>Send this link to <strong>{name}</strong> however you usually talk: text, email, a note on the fridge.</p>
    <CopyLink link={link} />
    <button type="button" className="text-button" onClick={onDone}>Done</button>
  </div>;
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }
  return <div className="copy-link"><input readOnly aria-label="Invite link" value={link} onFocus={(e) => e.target.select()} /><button type="button" className="scrap-action" onClick={copy}>{copied ? "copied ✓" : "copy link"}</button></div>;
}

function SupporterCard({ supporter, goals, encouragementCount, busy, run }: { supporter: Supporter; goals: Goal[]; encouragementCount: number; busy: boolean; run: (action: () => Promise<void>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(supporter.name);
  const [goalIds, setGoalIds] = useState(supporter.goalIds);
  const [showLink, setShowLink] = useState(false);
  const shared = goals.filter((goal) => supporter.goalIds.includes(goal.id));
  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !goalIds.length) return;
    void run(() => updateSupporter(supporter, { name: name.trim(), goalIds })).then((ok) => ok && setEditing(false));
  }
  function startEditing() { setName(supporter.name); setGoalIds(supporter.goalIds); setEditing(true); }

  return <article className={`supporter-card supporter-card--${supporter.status}`}>
    <span className="supporter-card__status">{STATUS[supporter.status]}</span>
    {editing
      ? <form onSubmit={save}>
          <label className="line-field"><span>Name</span><input autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <GoalPicker goals={goals} value={goalIds} onChange={setGoalIds} />
          {!goalIds.length && <p className="form-error">Pick at least one, or remove them instead.</p>}
          <div className="scrap-actions"><button type="button" className="scrap-action" onClick={() => setEditing(false)}>cancel</button><button className="scrap-action" disabled={busy || !name.trim() || !goalIds.length}>save</button></div>
        </form>
      : <>
          <h3>{supporter.name}</h3>
          <p className="supporter-card__email">{supporter.email}</p>
          <ul className="shared-goals" aria-label="Goals they can follow">{shared.map((goal) => <li key={goal.id} className={`accent-${goal.accentColor}`}>{goal.title}</li>)}</ul>
          {supporter.status === "accepted" && <p className="hand-note">{encouragementCount ? `${encouragementCount} ${encouragementCount === 1 ? "cheer or note" : "cheers and notes"} so far` : "No cheers yet"}</p>}
          {supporter.status === "declined" && <p className="corner-hint">They left your book. Remove them if you want to invite them again.</p>}
          {supporter.status === "pending" && (showLink ? <CopyLink link={inviteLink(supporter.inviteToken)} /> : <button type="button" className="scrap-action" onClick={() => setShowLink(true)}>show invite link</button>)}
          <div className="scrap-actions">
            {supporter.status !== "declined" && <button type="button" className="scrap-action" onClick={startEditing}>edit</button>}
            {(supporter.status === "pending" || supporter.status === "accepted") && <button type="button" className="scrap-action" disabled={busy} onClick={() => run(() => setSupporterAccess(supporter, false))}>pause access</button>}
            {supporter.status === "revoked" && <button type="button" className="scrap-action" disabled={busy} onClick={() => run(() => setSupporterAccess(supporter, true))}>restore access</button>}
            <ConfirmDelete label={supporter.name} disabled={busy} onConfirm={() => void run(() => removeSupporter(supporter.id))} />
          </div>
        </>}
  </article>;
}
