"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand, HandDrawnLink, LoadingPage, PaperPage, PreviewRibbon, Tape } from "@/components/ui";
import { listSupportedBooks, loadBook, signOut } from "@/lib/data-store";
import { formatShortDate } from "@/lib/dates";
import type { SupportedBookSummary } from "@/lib/types";

/** Every book the signed-in person has been let into. */
export function SupportedList({ productionMode }: { productionMode: boolean }) {
  const router = useRouter();
  const [books, setBooks] = useState<SupportedBookSummary[] | null>(null);
  const [hasOwnBook, setHasOwnBook] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!productionMode) return;
    Promise.all([listSupportedBooks(), loadBook()])
      .then(([list, own]) => { setBooks(list); setHasOwnBook(Boolean(own)); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "We couldn’t find those books."));
  }, [productionMode]);
  async function leave() {
    await signOut().catch(() => undefined);
    router.replace("/");
    router.refresh();
  }

  if (!productionMode) return <main className="onboarding-shell"><PreviewRibbon /><PaperPage className="message-page"><Tape /><p className="folio">Local preview</p><h1>Supporting needs real accounts.</h1><p>In preview mode there’s only your own book, in this browser.</p><HandDrawnLink href="/book">Open my book →</HandDrawnLink></PaperPage></main>;
  if (error) return <main className="center-page"><h1>That page got smudged.</h1><p>{error}</p></main>;
  if (!books) return <LoadingPage message="Finding the books you’re in…" />;

  return <main className="book-shell supporting-list">
    <header className="book-header"><Brand compact /><span>IN THEIR CORNER</span>{hasOwnBook ? <Link href="/book" className="text-button">My own book →</Link> : <button type="button" className="text-button" onClick={leave}>Sign out</button>}</header>
    <section className="goal-shelf">
      <div className="section-heading"><p className="eyebrow">BOOKS I SUPPORT</p><h2>People I’m cheering on</h2><span>{books.length} {books.length === 1 ? "book" : "books"}</span></div>
      {!books.length
        ? <div className="corner-note paper-card"><p><strong>You’re not in anyone’s corner right now.</strong></p><p>When someone invites you, open the link they send and it will show up here.</p></div>
        : <div className="corner-grid">{books.map((book) => <Link key={book.supporterId} href={`/supporting/${book.supporterId}`} className="supporter-card supporter-card--link">
            <span className="supporter-card__status">{book.goalCount} {book.goalCount === 1 ? "thing" : "things"} shared</span>
            <h3>{book.ownerName}’s six months</h3>
            <p className="supporter-card__email">{formatShortDate(book.startDate)} → {formatShortDate(book.endDate)}</p>
            <span className="open-note">open their book →</span>
          </Link>)}</div>}
      {!hasOwnBook && <p className="corner-also">Fancy six months of your own? <Link href="/onboarding" className="text-button">Start a book</Link></p>}
    </section>
  </main>;
}
