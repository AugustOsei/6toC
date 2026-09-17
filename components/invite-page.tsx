"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand, HandDrawnButton, HandDrawnLink, LoadingPage, PaperPage, PreviewRibbon, Tape } from "@/components/ui";
import { acceptInvite, getInvite, hasSession, sendMagicLink, signOut } from "@/lib/data-store";
import type { InviteDetails } from "@/lib/types";

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; invite: InviteDetails; signedIn: boolean }
  | { kind: "failed"; message: string };

/**
 * Where an invite link lands. Before sign-in it shows only names and a masked email; the
 * database lets the signed-in person accept only if their email is the one invited.
 */
export function InvitePage({ token, productionMode }: { token: string; productionMode: boolean }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    if (!productionMode) return;
    Promise.all([getInvite(token), hasSession()])
      .then(([invite, signedIn]) => setState(invite ? { kind: "ready", invite, signedIn } : { kind: "missing" }))
      .catch((cause: unknown) => setState({ kind: "failed", message: cause instanceof Error ? cause.message : "We couldn’t open this invite." }));
  }, [token, productionMode]);

  let body;
  if (!productionMode) body = <><p className="folio">Local preview</p><h1>Invites need real accounts.</h1><p>This copy of 6TOC keeps books in one browser, so there’s no one to invite yet.</p><HandDrawnLink href="/">Back to the cover</HandDrawnLink></>;
  else if (state.kind === "loading") return <LoadingPage message="Opening your invite…" />;
  else if (state.kind === "missing") body = <><p className="folio">Hmm</p><h1>This invite doesn’t exist.</h1><p>The link may be incomplete, or the person who sent it removed it. Ask them for a fresh one.</p><HandDrawnLink href="/">What is 6TOC?</HandDrawnLink></>;
  else if (state.kind === "failed") body = <><p className="folio">Hmm</p><h1>That page got smudged.</h1><p>{state.message}</p></>;
  else body = <Invitation token={token} invite={state.invite} signedIn={state.signedIn} />;

  return <main className="onboarding-shell">
    {!productionMode && <PreviewRibbon />}
    <header className="book-header"><Brand compact /><span>AN INVITATION</span></header>
    <PaperPage className="message-page invite-page"><Tape />{body}</PaperPage>
  </main>;
}

function Invitation({ token, invite, signedIn }: { token: string; invite: InviteDetails; signedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const things = invite.goalCount === 1 ? "one thing" : `${invite.goalCount} things`;
  const owner = invite.ownerName;

  if (invite.status === "revoked") return <><p className="folio">For {invite.supporterName}</p><h1>This invite is on hold.</h1><p>{owner} has paused this invite for now. If that’s a surprise, ask them about it.</p></>;

  async function join() {
    setBusy(true); setError("");
    try { const supporterId = await acceptInvite(token); router.replace(`/supporting/${supporterId}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn’t accept this invite."); setBusy(false); }
  }
  async function switchAccount() {
    await signOut().catch(() => undefined);
    window.location.reload();
  }
  async function sendLink(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("That email looks unfinished.");
    setBusy(true);
    try { await sendMagicLink(email.trim(), `/invite/${token}`); setSent(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn’t send the link. Try once more."); }
    finally { setBusy(false); }
  }

  const intro = <><p className="folio">For {invite.supporterName}</p><h1>{owner} wants you in their corner.</h1><p>{owner} is giving six months to {things} that matter to them, and asked you to follow along. You’ll see their progress and can cheer them on or leave a note.</p></>;

  if (signedIn) return <>{intro}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sign-in-actions"><HandDrawnButton disabled={busy} onClick={join}>{busy ? "Opening…" : `Join ${owner}’s corner →`}</HandDrawnButton>{error && <button type="button" className="text-button" onClick={switchAccount}>Use a different email</button>}</div>
  </>;

  if (sent) return <><p className="folio">A small detour</p><h1>Check your inbox.</h1><p>We sent a sign-in link to <strong>{email}</strong>. Open it in this browser and you’ll come straight back here.</p><button type="button" className="text-button" onClick={() => setSent(false)}>Use a different email</button></>;

  return <>{intro}
    <form onSubmit={sendLink}>
      <p className="hand-note">First, sign in with the email this was sent to ({invite.emailHint}). No password needed.</p>
      <label className="line-field"><span>Your email</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="sign-in-actions"><HandDrawnButton disabled={busy}>{busy ? "Sending…" : "Email my sign-in link →"}</HandDrawnButton><Link href="/" className="text-button">What is 6TOC?</Link></div>
    </form>
  </>;
}
