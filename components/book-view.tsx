"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SixMonthCalendar } from "@/components/six-month-calendar";
import { Brand, LoadingPage, PreviewRibbon, ScribbleDivider, Tape } from "@/components/ui";
import { loadBook } from "@/lib/data-store";
import { daysBetween, formatShortDate } from "@/lib/dates";
import type { BookData, GoalAccent } from "@/lib/types";

export function BookView({ productionMode }: { productionMode: boolean }) {
  const [book, setBook] = useState<BookData | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();
  useEffect(() => { loadBook().then((data) => { if (!data) router.replace("/onboarding"); else setBook(data); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "We couldn’t find your book.")); }, [router]);
  if (error) return <main className="center-page"><h1>That page got smudged.</h1><p>{error}</p><Link href="/onboarding">Back to the beginning</Link></main>;
  if (!book) return <LoadingPage />;
  return <main className="book-shell">{!productionMode && <PreviewRibbon />}<header className="book-header"><Brand compact /><span>MY 6TOC · {book.profile.name.toUpperCase()}</span><Link href="/" className="text-button">Close book ×</Link></header>
    <section className="book-spread"><div className="book-spread__intro"><p className="folio">CHAPTER 01 · {book.challenge.startDate.slice(0,4)}</p><h1>These are<br />my six months.</h1><p className="hand-note">Started {formatShortDate(book.challenge.startDate)}<br />Ends {formatShortDate(book.challenge.endDate)}</p><ScribbleDivider /><p className="book-quote">“A lot can happen<br />when you pick fewer things.”</p></div><SixMonthCalendar startDate={book.challenge.startDate} endDate={book.challenge.endDate} /></section>
    <section className="goal-shelf"><div className="section-heading"><p className="eyebrow">THE THINGS</p><h2>What I said I’d do</h2><span>{book.goals.length} / 3 spaces used</span></div><div className="goal-grid">{book.goals.map((goal, index) => { const plans = book.planItems.filter((p) => p.goalId === goal.id); const done = plans.filter((p) => p.completed).length; const days = Math.max(0, daysBetween(new Date(), goal.deadline)); return <Link href={`/book/goals/${goal.id}`} key={goal.id} className={`goal-scrap accent-${goal.accentColor as GoalAccent}`}><Tape color={index === 1 ? "blue" : "cream"} /><span className="goal-scrap__number">0{index + 1}</span><h3>{goal.title}</h3>{goal.status === "completed" && <strong className="done-early">DONE EARLY ✓</strong>}<p className="goal-scrap__deadline">Deadline <strong>{formatShortDate(goal.deadline)}</strong><br /><span>{days} days left</span></p><ScribbleDivider /><dl><div><dt>This plan</dt><dd>{done} / {plans.length} done</dd></div><div><dt>Pocket</dt><dd>{book.pocketItems.filter((p) => p.goalId === goal.id).length} things</dd></div><div><dt>Milestones</dt><dd>{book.milestones.filter((m) => m.goalId === goal.id).length}</dd></div></dl><span className="open-note">open this page →</span></Link>; })}</div></section>
  </main>;
}
