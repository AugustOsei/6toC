"use client";
import { HandDrawnButton } from "@/components/ui";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="center-page"><h1>That page got smudged.</h1><p>Nothing’s ruined. Let’s try the page again.</p><HandDrawnButton onClick={reset}>Try again</HandDrawnButton></main>; }
