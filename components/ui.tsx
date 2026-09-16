import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className={`brand ${compact ? "brand--compact" : ""}`} aria-label="6TOC home"><span>6</span>TOC</Link>;
}

export function PaperPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`paper-page ${className}`}>{children}</section>;
}

export function PaperCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`paper-card ${className}`}>{children}</div>;
}

export function HandDrawnButton({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`ink-button ${className}`} {...props}>{children}</button>;
}

export function HandDrawnLink({ children, href, className = "" }: { children: ReactNode; href: string; className?: string }) {
  return <Link href={href} className={`ink-button ${className}`}>{children}</Link>;
}

export function Tape({ color = "cream" }: { color?: "cream" | "pink" | "blue" }) {
  return <span aria-hidden="true" className={`tape tape--${color}`} />;
}

export function ScribbleDivider() { return <div className="scribble-divider" aria-hidden="true"><svg viewBox="0 0 600 14" preserveAspectRatio="none"><path d="M2 8c61-9 114 6 178-1 81-8 125 7 204 0 83-7 132 5 214-2" /></svg></div>; }

export function PreviewRibbon() {
  return <div className="preview-ribbon" role="status"><span>LOCAL PREVIEW</span> Browser-only data — connect Supabase for real accounts.</div>;
}

export function LoadingPage({ message = "Finding your page…" }: { message?: string }) {
  return <main className="center-page"><span className="loading-doodle" aria-hidden="true" /><p className="hand-note">{message}</p></main>;
}
