"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Brand, HandDrawnButton, HandDrawnLink, PaperPage, PreviewRibbon, Tape } from "@/components/ui";
import { sendMagicLink } from "@/lib/data-store";

/** `next` is where the emailed link lands once it has signed the reader in. */
export function SignInForm({ productionMode, linkError, next }: { productionMode: boolean; linkError: string; next: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(linkError);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("That email looks unfinished.");
    setStatus("sending");
    try { await sendMagicLink(email.trim(), next); setStatus("sent"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn’t send the link. Try once more."); setStatus("idle"); }
  }

  return <main className="onboarding-shell">
    {!productionMode && <PreviewRibbon />}
    <header className="book-header"><Brand compact /><span>WELCOME BACK</span></header>
    <PaperPage className="message-page sign-in-page">
      <Tape />
      {!productionMode ? <>
        <p className="folio">Local preview</p>
        <h1>No accounts here yet.</h1>
        <p>In preview mode your book lives in this browser, so there is nothing to sign in to.</p>
        <div className="sign-in-actions"><HandDrawnLink href="/book">Open my book →</HandDrawnLink><Link href="/onboarding" className="text-button">Start a new one</Link></div>
      </> : status === "sent" ? <>
        <p className="folio">A small detour</p>
        <h1>Check your inbox.</h1>
        <p>We sent a sign-in link to <strong>{email}</strong>. Tap it and your book opens where you left it.</p>
        <button type="button" className="text-button" onClick={() => setStatus("idle")}>Use a different email</button>
      </> : <form onSubmit={submit}>
        <p className="folio">Welcome back</p>
        <h1>Open your book.</h1>
        <p className="hand-note">We’ll email you a link. No password to forget.</p>
        <label className="line-field"><span>Email address</span><input autoFocus type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="sign-in-actions"><HandDrawnButton disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Email my link →"}</HandDrawnButton><Link href="/onboarding" className="text-button">New here? Start a book</Link></div>
      </form>}
    </PaperPage>
  </main>;
}
