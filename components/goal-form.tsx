"use client";

import { FormEvent, useState } from "react";
import { HandDrawnButton } from "@/components/ui";
import type { GoalDraft } from "@/lib/types";

/** Title, "done looks like" and deadline — used to add a goal later and to edit one. */
export function GoalForm({ initial, minDate, maxDate, submitLabel, busy, onSubmit, onCancel }: {
  initial: GoalDraft;
  minDate: string;
  maxDate: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (draft: GoalDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const clean = { title: draft.title.trim(), successDefinition: draft.successDefinition.trim(), deadline: draft.deadline };
    if (!clean.title) return setError("Give this thing a name.");
    if (!clean.successDefinition) return setError("Tell us what ‘done’ looks like.");
    if (!clean.deadline || clean.deadline < minDate || clean.deadline > maxDate) return setError(`The deadline must land between ${minDate} and ${maxDate}.`);
    setError("");
    onSubmit(clean);
  }

  return <form className="goal-form" onSubmit={submit}>
    <label className="line-field"><span>What are you going to do?</span><input autoFocus maxLength={160} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
    <label className="line-field"><span>What does done look like?</span><textarea value={draft.successDefinition} onChange={(e) => setDraft({ ...draft, successDefinition: e.target.value })} placeholder="Be specific enough that future-you will know." /></label>
    <label className="line-field goal-form__date"><span>Deadline</span><input type="date" min={minDate} max={maxDate} value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="goal-form__actions"><button type="button" className="text-button" onClick={onCancel}>Cancel</button><HandDrawnButton disabled={busy}>{submitLabel}</HandDrawnButton></div>
  </form>;
}
