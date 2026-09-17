import { Brand, HandDrawnLink } from "@/components/ui";
import { SixMonthCalendar } from "@/components/six-month-calendar";
import Link from "next/link";
import { hasSupabaseConfig } from "@/lib/config";
import { addCalendarMonths, toDateInput } from "@/lib/dates";

export default function HomePage() {
  const startDate = toDateInput(new Date());
  const endDate = toDateInput(addCalendarMonths(startDate, 6));
  return <main className="landing">
    <div className="landing__grain" aria-hidden="true" />
    <header className="landing__header"><Brand /><span className="edition">A six-month field guide</span>{hasSupabaseConfig && <Link href="/sign-in" className="text-button">Sign in</Link>}</header>
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
    <section className="how-it-works" aria-labelledby="how-it-works-title">
      <p className="eyebrow">HOW IT WORKS</p>
      <h2 id="how-it-works-title">Four steps. No dashboard.</h2>
      <ol>
        {STEPS.map((step, index) => <li key={step.title} className={`how-step accent-${step.accent}`}>
          <span className="how-step__number">0{index + 1}</span>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
          <span className="how-step__note">{step.note}</span>
        </li>)}
      </ol>
      <HandDrawnLink href="/onboarding">Start my six months <span aria-hidden="true">→</span></HandDrawnLink>
    </section>
    <footer className="landing__footer"><span>Begin anywhere.</span><span>A project by <a href="https://www.augustengine.com/" target="_blank" rel="noopener">August Engine</a></span><span>© 6TOC</span></footer>
  </main>;
}

// Only promise what the app does today.
const STEPS = [
  { accent: "tomato", title: "Pick up to three", body: "Name the things that matter, and write down what “done” looks like for each one.", note: "fewer is fine" },
  { accent: "cobalt", title: "Give each a deadline", body: "Every thing gets its own finish date, somewhere inside the next six months.", note: "1 month? 4? your call" },
  { accent: "leaf", title: "Plan it, tick it off", body: "Break each thing into small moves, keep notes and links in its pocket, and pin the wins as they land.", note: "every tick is progress" },
  { accent: "tomato", title: "Invite your people", body: "Let the people you trust follow the things you choose. They can cheer you on and leave a note. Your pocket stays private.", note: "a little push helps" },
] as const;
