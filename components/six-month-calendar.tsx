"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { toCanvas } from "html-to-image";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type * as THREE from "three";
import { addCalendarMonths, daysBetween, parseLocalDate, toDateInput } from "@/lib/dates";
import { createPageTexture, createPageTurn, createTurnRenderer, RESTING_TURN, type PageTurn } from "@/lib/page-turn";

gsap.registerPlugin(useGSAP);

let activeCoverLoopId = 0;

const PAGE_WORDS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX"];
const WEEK_MARKERS = ["01", "02", "03", "04", "05", "06", "07"];
const PAGE_COLORS = ["#3037d4", "#ed3c32", "#159447", "#f2a51d", "#7950b8", "#19191d"];
const PAGE_INKS = ["#ffffff", "#ffffff", "#ffffff", "#19191d", "#ffffff", "#ffffff"];
const PAGE_HIGHLIGHTS = ["#ffd25c", "#fff1a6", "#d9ff7a", "#3037d4", "#ffe176", "#ff6e61"];
const PAGE_MESSAGES = [
  "Make the promise. Pick no more than three.",
  "Build the rhythm. Let consistency do the work.",
  "Halfway is close. Ask your people for a push.",
  "Three pages left. Notice how far you’ve come.",
  "Almost there. Protect the progress you’ve made.",
  "Last page. Bring each goal home.",
];

// Cover mode is an illustration, so each sheet carries its own "today": the pages read
// as a chapter getting further along, with the days before it already ticked off.
const COVER_TODAY = [5, 9, 12, 16, 20, 24];
// How long each page rests. Long enough for its checkmarks to finish drawing in.
const COVER_DWELL = 2600;

// Where the perforation sits below the top of a sheet, just under the punched holes.
const TEAR_LINE = 24;
// Stop-motion rate. Smooth 60fps motion reads as software; this reads as hand-made.
const TEAR_FPS = 12;

/** A ragged line across the sheet at TEAR_LINE, the same every time so it never shimmers. */
function tearEdge() {
  const teeth = 22;
  return Array.from({ length: teeth + 1 }, (_, index) => {
    const wobble = Math.sin(index * 12.9898) * 43758.5453;
    const offset = ((wobble - Math.floor(wobble)) - 0.5) * 7 + (index % 2 ? 2.5 : -2.5);
    return `${((index / teeth) * 100).toFixed(2)}% ${(TEAR_LINE + offset).toFixed(1)}px`;
  });
}
const TEAR_EDGE = tearEdge();
// The torn-away sheet keeps everything below the edge; the stub keeps everything above it.
const SHEET_CLIP = `polygon(${TEAR_EDGE.join(",")},100% 100%,0% 100%)`;
const STUB_CLIP = `polygon(0% 0%,100% 0%,${[...TEAR_EDGE].reverse().join(",")})`;

/**
 * The landing page's month change: the sheet is torn off and falls away.
 *
 * Everything above the calendar has to stay readable, and any turn that pivots on the
 * binding has to travel up into it. A tear goes the other way: the sheet rips along the
 * perforation, leaves a ragged stub on the rings, and drops out of the bottom. It also
 * says the right thing -- a torn-off month is a finished one.
 */
function coverTear(stack: HTMLElement, outgoing: HTMLElement, incoming: HTMLElement, stub: HTMLElement, color: string) {
  // Pivoting on the top-right corner makes the left side give way first, the way a
  // sheet actually tears when it is pulled from one side. Rotation is negative because
  // CSS turns clockwise, and clockwise about that corner would lift the left side.
  gsap.set(outgoing, { transformOrigin: `100% ${TEAR_LINE}px` });
  gsap.set(stub, { autoAlpha: 0, clipPath: STUB_CLIP, "--stub-color": color });

  const tear = gsap.timeline({ paused: true })
    // The tug: the sheet stretches against the perforation before anything gives.
    .to(outgoing, { y: 5, scaleY: 1.012, duration: 0.2, ease: "power2.out" }, 0)
    .to(stack, { y: 3, duration: 0.2, ease: "power2.out" }, 0)
    // The left side rips first.
    .to(outgoing, { rotation: -6, y: 9, scaleY: 1, duration: 0.2, ease: "power1.in" }, 0.2)
    // Free: the edge is ragged, the stub is left on the rings, and the block springs back.
    .set(outgoing, { clipPath: SHEET_CLIP }, 0.4)
    .set(stub, { autoAlpha: 1 }, 0.4)
    .to(stack, { y: -4, duration: 0.08, ease: "power1.out" }, 0.4)
    .to(stack, { y: 0, duration: 0.5, ease: "elastic.out(1, 0.45)" }, 0.48)
    // The fall. It only ever moves down and out, away from the copy above.
    .to(outgoing, { yPercent: 62, xPercent: -5, rotation: -17, duration: 0.7, ease: "power2.in" }, 0.4)
    .to(outgoing, { autoAlpha: 0, duration: 0.3, ease: "power1.in" }, 0.8)
    .to(incoming, { scale: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, 0.42)
    // The stub lingers long enough to be read as torn paper, then is tidied away.
    .to(stub, { autoAlpha: 0, duration: 0.4 }, 1.25);

  // Played through a stepped driver, so every tween keeps its own easing but the whole
  // thing advances in held frames. Each held frame also nudges the block a hair, like
  // a hand-drawn line that is never redrawn in quite the same place.
  const clock = { progress: 0 };
  let lastFrame = -1;
  return gsap.to(clock, {
    progress: 1,
    duration: tear.duration(),
    ease: `steps(${Math.round(tear.duration() * TEAR_FPS)})`,
    onUpdate() {
      tear.progress(clock.progress);
      if (clock.progress === lastFrame) return;
      lastFrame = clock.progress;
      gsap.set(stack, { skewX: gsap.utils.random(-0.5, 0.5), skewY: gsap.utils.random(-0.25, 0.25) });
    },
  });
}

type PageCells = Array<{
  day: number;
  value: string;
  isToday: boolean;
  isPast: boolean;
}>;

export function SixMonthCalendar(props: {
  startDate: string;
  endDate: string;
  mode?: "book" | "cover";
}) {
  return <InteractiveSixMonthCalendar {...props} />;
}

function InteractiveSixMonthCalendar({
  startDate,
  endDate,
  mode = "book",
}: {
  startDate: string;
  endDate: string;
  mode?: "book" | "cover";
}) {
  const isCover = mode === "cover";
  const today = toDateInput(new Date());
  const totalDays = isCover ? 180 : Math.max(1, daysBetween(startDate, endDate));
  const daysLeft = isCover ? 180 : Math.max(0, daysBetween(today, endDate));
  const elapsed = Math.max(0, Math.min(totalDays, totalDays - daysLeft));
  const boundaries = Array.from({ length: 7 }, (_, index) => toDateInput(addCalendarMonths(startDate, index)));
  const foundIndex = boundaries.findIndex((boundary, index) => index < 6 && today >= boundary && today < boundaries[index + 1]);
  const initialIndex = isCover ? 0 : today < startDate ? 0 : foundIndex === -1 ? 5 : foundIndex;
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [isAnimating, setIsAnimating] = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<Array<HTMLElement | null>>([]);
  const frontsRef = useRef<Array<HTMLDivElement | null>>([]);
  const curlCanvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<gsap.core.Animation | null>(null);
  const currentIndexRef = useRef(initialIndex);
  const animatingRef = useRef(false);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const texturesRef = useRef(new Map<number, THREE.Texture>());
  const staleTexturesRef = useRef(false);

  function stackPage(index: number, activeIndex: number) {
    const page = pagesRef.current[index];
    if (!page) return;

    gsap.set(page, {
      autoAlpha: index === activeIndex ? 1 : 0,
      zIndex: index === activeIndex ? 20 : 10 - index,
      pointerEvents: index === activeIndex ? "auto" : "none",
    });
  }

  function normalizeStack(activeIndex: number) {
    PAGE_WORDS.forEach((_, index) => stackPage(index, activeIndex));
  }

  function purgeTextures() {
    texturesRef.current.forEach((texture) => texture.dispose());
    texturesRef.current.clear();
  }

  useGSAP(() => {
    normalizeStack(initialIndex);
    return () => timelineRef.current?.kill();
  }, { scope: scopeRef, dependencies: [isCover, initialIndex] });

  // One WebGL context and at most six rasters for the component's whole life.
  useEffect(() => {
    const stack = scopeRef.current?.querySelector<HTMLElement>(".calendar-stack");
    if (!stack) return;

    const observer = new ResizeObserver(() => { staleTexturesRef.current = true; });
    observer.observe(stack);

    return () => {
      observer.disconnect();
      purgeTextures();
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  function getRenderer() {
    const canvas = curlCanvasRef.current;
    if (!canvas) return null;
    if (!rendererRef.current) rendererRef.current = createTurnRenderer(canvas);
    return rendererRef.current;
  }

  async function getPageTexture(pageIndex: number) {
    // Purging here rather than on the resize itself means a turn in flight can never
    // lose the texture out from under it.
    if (staleTexturesRef.current) {
      purgeTextures();
      staleTexturesRef.current = false;
    }

    const cached = texturesRef.current.get(pageIndex);
    if (cached) return cached;

    const page = frontsRef.current[pageIndex];
    const renderer = getRenderer();
    if (!page || !renderer) throw new Error("Calendar page is unavailable");

    // Rasterising before the hand-lettering arrives would bake the fallback face into the turn.
    await document.fonts.ready;
    const source = await toCanvas(page, {
      backgroundColor: "#fbf8ef",
      cacheBust: true,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    });
    const texture = createPageTexture(renderer, source);
    texturesRef.current.set(pageIndex, texture);
    return texture;
  }

  function mountTurn(pageIndex: number, texture: THREE.Texture) {
    const canvas = curlCanvasRef.current;
    const page = frontsRef.current[pageIndex];
    const renderer = getRenderer();
    if (!canvas || !page || !renderer) return null;

    // The canvas has to be laid out before it can be measured.
    canvas.hidden = false;
    const bounds = canvas.getBoundingClientRect();
    const pageBounds = page.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);

    return createPageTurn(
      renderer,
      { width, height },
      {
        width: Math.max(1, pageBounds.width),
        height: Math.max(1, pageBounds.height),
        left: pageBounds.left - bounds.left,
        top: pageBounds.top - bounds.top,
      },
      texture,
    );
  }

  /**
   * One turn, phrased the way paper moves: a reluctant peel, a carry over the wire, then a
   * drop that its own weight drives. A single symmetric ease is what makes a flip read as
   * machinery rather than paper.
   */
  function createTurnTimeline(curl: PageTurn, canvas: HTMLCanvasElement) {
    const turn = { ...RESTING_TURN };
    const timeline = gsap.timeline({ paused: true, onUpdate: () => curl.draw(turn) });
    timeline
      .to(turn, { progress: 0.18, duration: 0.44, ease: "power2.out" }, 0)
      .to(turn, { progress: 0.56, duration: 0.48, ease: "sine.inOut" }, 0.44)
      .to(turn, { progress: 1, duration: 0.5, ease: "power2.in" }, 0.92)
      .to(turn, { flutter: 0.42, duration: 0.2, ease: "power1.out" }, 0.98)
      .to(turn, { flutter: 0, duration: 0.45, ease: "elastic.out(1.1, 0.42)" }, 1.18)
      // It leaves the frame over the back of the block rather than dissolving mid-air.
      .to(canvas, { opacity: 0, duration: 0.32, ease: "power2.in" }, 1.3);
    return { turn, timeline };
  }

  useEffect(() => {
    if (!isCover || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const runId = activeCoverLoopId + 1;
    activeCoverLoopId = runId;
    let cancelled = false;
    let pauseTimer: number | undefined;

    const pause = (milliseconds: number) => new Promise<void>((resolve) => {
      pauseTimer = window.setTimeout(resolve, milliseconds);
    });

    async function playCoverLoop() {
      // The first page inks itself in on arrival; let that finish before anything turns.
      await pause(COVER_DWELL + 600);
      if (cancelled || activeCoverLoopId !== runId) return;

      while (!cancelled && activeCoverLoopId === runId) {
        const fromIndex = currentIndexRef.current;
        const targetIndex = (fromIndex + 1) % 6;
        const outgoing = pagesRef.current[fromIndex];
        const incoming = pagesRef.current[targetIndex];
        const stack = scopeRef.current?.querySelector<HTMLElement>(".calendar-stack");
        const stub = scopeRef.current?.querySelector<HTMLElement>(".calendar-stub");
        if (!outgoing || !incoming || !stack || !stub) return;

        gsap.set(incoming, { autoAlpha: 1, zIndex: 19, scale: 0.99, y: 3 });
        stack.style.setProperty("--page-color", PAGE_COLORS[targetIndex]);
        stack.style.setProperty("--page-ink", PAGE_INKS[targetIndex]);

        await new Promise<void>((resolve) => {
          const tear = coverTear(stack, outgoing, incoming, stub, PAGE_COLORS[fromIndex]);
          timelineRef.current = tear;
          tear.eventCallback("onComplete", () => {
            gsap.set(stack, { skewX: 0, skewY: 0 });
            resolve();
          });
        });
        if (cancelled || activeCoverLoopId !== runId) return;

        gsap.set(outgoing, { clearProps: "transform,transformOrigin,clipPath" });
        normalizeStack(targetIndex);
        currentIndexRef.current = targetIndex;
        setSelectedIndex(targetIndex);
        await pause(COVER_DWELL);
      }
    }

    void playCoverLoop();

    return () => {
      cancelled = true;
      if (activeCoverLoopId === runId) activeCoverLoopId += 1;
      if (pauseTimer) window.clearTimeout(pauseTimer);
      timelineRef.current?.kill();
    };
    // This loop intentionally owns the stable calendar refs for the lifetime of cover mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCover]);

  async function turnTo(nextIndex: number) {
    const targetIndex = (nextIndex + 6) % 6;
    const fromIndex = currentIndexRef.current;
    if (targetIndex === fromIndex || animatingRef.current) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      normalizeStack(targetIndex);
      currentIndexRef.current = targetIndex;
      setSelectedIndex(targetIndex);
      return;
    }

    animatingRef.current = true;
    setIsAnimating(true);
    const isForward = targetIndex > fromIndex;
    const textureIndex = isForward ? fromIndex : targetIndex;

    try {
      const texture = await getPageTexture(textureIndex);
      const canvas = curlCanvasRef.current;
      if (!canvas) throw new Error("Calendar curl canvas is unavailable");

      if (isForward) {
        gsap.set(pagesRef.current[targetIndex], { autoAlpha: 1, zIndex: 19 });
        gsap.set(pagesRef.current[fromIndex], { autoAlpha: 0 });
      }

      const curl = mountTurn(textureIndex, texture);
      if (!curl) throw new Error("Calendar curl could not start");
      gsap.set(canvas, { opacity: 1 });

      timelineRef.current?.kill();
      const { timeline } = createTurnTimeline(curl, canvas);
      const settle = () => {
        curl.dispose();
        canvas.hidden = true;
        normalizeStack(targetIndex);
        currentIndexRef.current = targetIndex;
        setSelectedIndex(targetIndex);
        animatingRef.current = false;
        setIsAnimating(false);
      };
      // Under a finger the turn should feel quicker than the idle loop's.
      timeline.timeScale(1.4).eventCallback("onComplete", settle).eventCallback("onReverseComplete", settle);
      timelineRef.current = timeline;
      // Stepping back is the same sheet coming home, so it plays the same motion in reverse.
      if (isForward) timeline.play(0);
      else timeline.progress(1).reverse();
    } catch (error) {
      console.error(error);
      normalizeStack(targetIndex);
      currentIndexRef.current = targetIndex;
      setSelectedIndex(targetIndex);
      animatingRef.current = false;
      setIsAnimating(false);
    }
  }

  function getCells(pageIndex: number): PageCells {
    const pageStart = parseLocalDate(boundaries[pageIndex]);
    const pageEndBoundary = parseLocalDate(boundaries[pageIndex + 1]);
    const cellCount = isCover ? 30 : daysBetween(pageStart, pageEndBoundary) + (pageIndex === 5 ? 1 : 0);

    return Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(pageStart.getFullYear(), pageStart.getMonth(), pageStart.getDate() + index);
      const value = toDateInput(date);
      return {
        day: index + 1,
        value,
        isToday: isCover ? index + 1 === COVER_TODAY[pageIndex] : value === today,
        isPast: isCover ? index + 1 < COVER_TODAY[pageIndex] : value < today,
      };
    });
  }

  function renderPage(pageIndex: number) {
    const cells = getCells(pageIndex);
    const monthsRemaining = 6 - pageIndex;
    const isSelected = pageIndex === selectedIndex;
    const pageStyle = {
      "--page-color": PAGE_COLORS[pageIndex],
      "--page-ink": PAGE_INKS[pageIndex],
      "--page-highlight": PAGE_HIGHLIGHTS[pageIndex],
      opacity: pageIndex === initialIndex ? 1 : 0,
      visibility: pageIndex === initialIndex ? "visible" : "hidden",
      zIndex: pageIndex === initialIndex ? 20 : 10 - pageIndex,
    } as CSSProperties;

    return <article
      key={pageIndex}
      ref={(node) => { pagesRef.current[pageIndex] = node; }}
      // Cover pages ink themselves in when they land on top; see .is-live in the CSS.
      className={`calendar-page${isCover && isSelected ? " is-live" : ""}`}
      style={pageStyle}
      aria-hidden={!isSelected}
    >
      <div className="calendar-page__front" ref={(node) => { frontsRef.current[pageIndex] = node; }}>
        <div className="calendar-punches" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <span key={index} />)}</div>
        <header className="calendar-page__header">
          <div>
            <span>PAGE {String(pageIndex + 1).padStart(2, "0")} OF 06</span>
            <h2>Month <em>{PAGE_WORDS[pageIndex]}</em></h2>
          </div>
          <p><strong>{monthsRemaining}</strong><br /><i>{monthsRemaining === 1 ? "month" : "months"}</i><br />including this</p>
        </header>
        <p className="calendar-page__message"><span aria-hidden="true">✦</span> {PAGE_MESSAGES[pageIndex]}</p>
        <div className="calendar-weekdays" aria-hidden="true">{WEEK_MARKERS.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid" role="grid" aria-label={`Days in month ${pageIndex + 1}`}>
          {cells.map(({ day, value, isToday, isPast }) => <time
            key={value}
            dateTime={isCover ? undefined : value}
            aria-label={`Month ${pageIndex + 1}, day ${day}`}
            className={`${isToday ? "is-today" : ""} ${isPast ? "is-past" : ""}`}
            // Stagger index for the cover's ink-in; the tick inside inherits it.
            style={isToday || isPast ? { "--n": day } as CSSProperties : undefined}
          >{day} {isPast ? <i aria-hidden="true">✓</i> : null}</time>)}
        </div>
        <footer className="calendar-page__footer">
          <div><strong>{isCover ? monthsRemaining : daysLeft}</strong><span>{isCover ? (monthsRemaining === 1 ? "month" : "months") : (daysLeft === 1 ? "day" : "days")}<br />still open</span></div>
          <p>{isCover ? `PAGE ${pageIndex + 1} / 6` : `DAY ${Math.min(totalDays, elapsed + 1)} / ${totalDays}`}</p>
          <div className="calendar-progress" aria-hidden="true"><span style={{ width: isCover ? `${((pageIndex + 1) / 6) * 100}%` : `${Math.max(1, (elapsed / totalDays) * 100)}%` }} /></div>
        </footer>
        {isSelected && !isAnimating && !isCover
          ? <button type="button" className="calendar-corner" onClick={() => turnTo(selectedIndex === 5 ? 0 : selectedIndex + 1)} aria-label="Turn to the next month"><span>flip</span></button>
          : <span className="calendar-corner" aria-hidden="true" />}
      </div>
      <div className="calendar-page__back" aria-hidden="true"><b>{String(pageIndex + 1).padStart(2, "0")}</b><span>page turned</span><i>keep going ↗</i></div>
    </article>;
  }

  const pageNote = selectedIndex === initialIndex
    ? "today lives here"
    : selectedIndex < initialIndex
      ? "this page is behind you"
      : "this page is waiting";
  const stackStyle = {
    "--page-color": PAGE_COLORS[selectedIndex],
    "--page-ink": PAGE_INKS[selectedIndex],
  } as CSSProperties;

  return <div ref={scopeRef} className={`six-calendar six-calendar--${mode}`} aria-label={isCover ? "Six month calendar illustration" : `Interactive six month calendar, ${daysLeft} days remaining`}>
    {!isCover ? <p className="six-calendar__callout">pick a month.<br />watch it flip. <b>↘</b></p> : null}
    <div className="calendar-stack" style={stackStyle} aria-busy={isAnimating}>
      {[5, 4, 3, 2, 1].map((sheet) => <span key={sheet} className="calendar-stack__sheet" style={{ "--sheet": sheet } as CSSProperties} />)}
      {PAGE_WORDS.map((_, index) => renderPage(index))}
      {isCover
        // What a torn-off month leaves on the rings.
        ? <div className="calendar-stub" aria-hidden="true"><div className="calendar-punches">{Array.from({ length: 9 }, (_, index) => <span key={index} />)}</div></div>
        : null}
      <canvas ref={curlCanvasRef} className="calendar-curl-layer" hidden aria-hidden="true" />
      <div className="calendar-rings" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <span key={index} />)}</div>
      <div className="calendar-ring-tips" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <span key={index} />)}</div>
    </div>
    {!isCover ? <nav className="calendar-controls" aria-label="Move between months">
      <button type="button" disabled={isAnimating || selectedIndex === 0} onClick={() => turnTo(selectedIndex - 1)}>← earlier</button>
      <span>month {selectedIndex + 1} of 6</span>
      <button type="button" disabled={isAnimating || selectedIndex === 5} onClick={() => turnTo(selectedIndex + 1)}>later →</button>
    </nav> : null}
    {!isCover ? <p className="six-calendar__note">{pageNote} <span>{selectedIndex === initialIndex ? "↑" : selectedIndex < initialIndex ? "✓" : "↗"}</span></p> : null}
  </div>;
}
