"use client";

import { useState } from "react";

/** Deleting takes two taps: the first asks, the second does it. Nothing in 6TOC has an undo. */
export function ConfirmDelete({ label, disabled, onConfirm }: { label: string; disabled?: boolean; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="scrap-action" disabled={disabled} aria-label={`Delete ${label}`} onClick={() => setAsking(true)}>delete</button>;
  return <span className="confirm-delete" role="group" aria-label={`Delete ${label}?`}>
    <span>tear it out?</span>
    <button type="button" className="scrap-action scrap-action--danger" disabled={disabled} onClick={() => { setAsking(false); onConfirm(); }}>yes</button>
    <button type="button" className="scrap-action" autoFocus onClick={() => setAsking(false)}>keep</button>
  </span>;
}
