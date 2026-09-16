"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand, HandDrawnButton, PaperPage, PreviewRibbon, Tape } from "@/components/ui";
import { DRAFT_KEY, hasSession, saveOnboarding, sendMagicLink } from "@/lib/data-store";
import { addCalendarMonths, clampDate, toDateInput } from "@/lib/dates";
import type { GoalDraft, OnboardingDraft } from "@/lib/types";

const blankGoal = (): GoalDraft => ({ title: "", successDefinition: "", deadline: "" });

export function OnboardingFlow({ productionMode }: { productionMode: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [goals, setGoals] = useState<GoalDraft[]>([blankGoal()]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "emailed">("idle");
  const today = useMemo(() => toDateInput(new Date()), []);
  const endDate = useMemo(() => toDateInput(addCalendarMonths(today, 6)), [today]);

  useEffect(() => {
    if (!productionMode || !new URLSearchParams(window.location.search).has("resume")) return;
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    queueMicrotask(() => {
      setStatus("saving");
      saveOnboarding(JSON.parse(raw) as OnboardingDraft).then((book) => {
        if (book) router.replace("/book"); else setError("Your link worked, but the draft page went missing. Please start again.");
      }).catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : "We couldn’t make your book."); setStatus("idle"); });
    });
  }, [productionMode, router]);

  function updateGoal(index: number, patch: Partial<GoalDraft>) { setGoals((current) => current.map((goal, i) => i === index ? { ...goal, ...patch } : goal)); }
  function chooseDeadline(index: number, value: string) {
    if (value === "custom") return;
    const months = Number(value);
    const selected = value === "end" ? addCalendarMonths(today, 6) : addCalendarMonths(today, months);
    updateGoal(index, { deadline: toDateInput(clampDate(selected, new Date(), addCalendarMonths(today, 6))) });
  }
  function next(event: FormEvent) {
    event.preventDefault(); setError("");
    if (step === 1 && name.trim().length < 2) return setError("Give us at least two letters to put on the cover.");
    if (step === 2 && !/^\S+@\S+\.\S+$/.test(email)) return setError("That email looks unfinished.");
    setStep((value) => Math.min(3, value + 1));
  }
  async function finish(event: FormEvent) {
    event.preventDefault(); setError("");
    const filled = goals.filter((goal) => goal.title.trim());
    if (!filled.length) return setError("Choose at least one thing for these six months.");
    if (filled.some((goal) => !goal.successDefinition.trim())) return setError("Tell us what ‘done’ looks like for each thing.");
    if (filled.some((goal) => !goal.deadline || goal.deadline < today || goal.deadline > endDate)) return setError(`Every deadline must land between today and ${endDate}.`);
    const draft = { name: name.trim(), email: email.trim(), startDate: today, endDate, goals: filled };
    setStatus("saving");
    try {
      // Someone already signed in (e.g. via /sign-in, with no book yet) can bind it straight away.
      if (productionMode && !(await hasSession())) { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); await sendMagicLink(draft.email); setStatus("emailed"); }
      else if (await saveOnboarding(draft)) router.push("/book");
      else throw new Error("Please sign in again.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn’t turn the page. Try once more."); setStatus("idle"); }
  }

  if (status === "emailed") return <main className="onboarding-shell"><PaperPage className="message-page"><Tape /><p className="folio">A small detour</p><h1>Check your inbox.</h1><p>We sent a magic link to <strong>{email}</strong>. Tap it and we’ll bind these pages into your book.</p><p className="hand-note">You can close this tab. Your draft is tucked away safely.</p></PaperPage></main>;
  if (status === "saving" && new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).has("resume")) return <main className="onboarding-shell"><p className="hand-note">Binding your book…</p></main>;

  return <main className="onboarding-shell">
    {!productionMode && <PreviewRibbon />}
    <header className="book-header"><Brand compact /><span>SETUP · PAGE {step} OF 3</span>{productionMode && <Link href="/sign-in" className="text-button">Have a book? Sign in</Link>}</header>
    <div className="page-progress" aria-label={`Step ${step} of 3`}>{[1,2,3].map((n) => <span key={n} className={n <= step ? "active" : ""} />)}</div>
    <PaperPage className="onboarding-page">
      <span className="binding-holes" aria-hidden="true" />
      <p className="folio">{String(step).padStart(2, "0")} / FIRST THINGS</p>
      {step === 1 && <form onSubmit={next} className="page-form"><div><h1>Whose book<br />is this?</h1><p className="hand-note">Every good story needs a name on the cover.</p></div><label className="line-field"><span>Your name</span><input autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Write it here…" /></label><FormFooter error={error} /> </form>}
      {step === 2 && <form onSubmit={next} className="page-form"><div><h1>Where can we find you when you’re avoiding your goals?</h1><p className="hand-note">Only useful nudges. No inbox confetti.</p></div><label className="line-field"><span>Email address</span><input autoFocus type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label><FormFooter error={error} back={() => setStep(1)} /></form>}
      {step === 3 && <form onSubmit={finish} className="goals-form"><div className="goals-heading"><div><h1>Pick your things.</h1><p>You get three spaces.<br />You don’t have to use all three.</p></div><span className="date-stamp">{today}<br />→ {endDate}</span></div>
        <div className="goal-drafts">{goals.map((goal, index) => <fieldset key={index} className={`goal-draft accent-${["tomato","cobalt","leaf"][index]}`}><legend><span>0{index + 1}</span> YOUR THING</legend><label className="line-field"><span>What are you going to do?</span><input value={goal.title} onChange={(e) => updateGoal(index, { title: e.target.value })} placeholder={index === 0 ? "Pass my AWS certification" : "Another thing (optional)"} /></label><label className="line-field"><span>What does done look like?</span><textarea value={goal.successDefinition} onChange={(e) => updateGoal(index, { successDefinition: e.target.value })} placeholder="Be specific enough that future-you will know." /></label><div className="deadline-row"><label><span>When do you want this done?</span><select aria-label={`Goal ${index + 1} deadline shortcut`} value="" onChange={(e) => chooseDeadline(index, e.target.value)}><option value="" disabled>Choose a pace…</option><option value="1">1 month</option><option value="3">3 months</option><option value="4">4 months</option><option value="end">End of 6TOC</option><option value="custom">Custom date</option></select></label><label><span>Deadline</span><input type="date" min={today} max={endDate} value={goal.deadline} onChange={(e) => updateGoal(index, { deadline: e.target.value })} /></label></div></fieldset>)}</div>
        {goals.length < 3 && <button type="button" className="add-space" onClick={() => setGoals((current) => [...current, blankGoal()])}>＋ use another space</button>}
        <div className="form-footer"><button type="button" className="text-button" onClick={() => setStep(2)}>← Previous page</button><div>{error && <p className="form-error" role="alert">{error}</p>}<HandDrawnButton disabled={status === "saving"}>{productionMode ? "Email my magic link" : "Make my book"} <span aria-hidden="true">→</span></HandDrawnButton></div></div>
      </form>}
    </PaperPage>
  </main>;
}

function FormFooter({ error, back }: { error: string; back?: () => void }) { return <div className="form-footer">{back ? <button type="button" className="text-button" onClick={back}>← Previous page</button> : <span /> }<div>{error && <p className="form-error" role="alert">{error}</p>}<HandDrawnButton>Turn the page <span aria-hidden="true">→</span></HandDrawnButton></div></div>; }
