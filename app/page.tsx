import { Brand, HandDrawnLink } from "@/components/ui";
import { SixMonthCalendar } from "@/components/six-month-calendar";
import { addCalendarMonths, toDateInput } from "@/lib/dates";

export default function HomePage() {
  const startDate = toDateInput(new Date());
  const endDate = toDateInput(addCalendarMonths(startDate, 6));
  return <main className="landing">
    <div className="landing__grain" aria-hidden="true" />
    <header className="landing__header"><Brand /><span className="edition">A six-month field guide</span></header>
    <section className="hero">
      <div className="hero__copy">
        <p className="eyebrow">TOO MANY GOALS. NOT ENOUGH FOLLOW-THROUGH?</p>
        <h1><span>3 goals max.</span><br />6 months.</h1>
        <p className="hero__question">Life is full of things you want to change. 6TOC helps you choose up to three that matter most, give them six focused months, and finish with people you trust in your corner.</p>
        <HandDrawnLink href="/onboarding">Pick what matters <span aria-hidden="true">→</span></HandDrawnLink>
        <p className="hero__aside">Less juggling. More finishing.<br />Real people cheering you on.</p>
      </div>
      <SixMonthCalendar startDate={startDate} endDate={endDate} mode="cover" />
    </section>
    <footer className="landing__footer"><span>Begin anywhere.</span><span>© 6TOC</span></footer>
  </main>;
}
