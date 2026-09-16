import { NextResponse } from "next/server";
import { hasSupabaseConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

// Only same-site paths are allowed, so a crafted link cannot bounce the reader elsewhere.
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/onboarding?resume=1";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  // Preview mode has no accounts, so there is no link to finish.
  if (!hasSupabaseConfig) return NextResponse.redirect(new URL("/sign-in", url.origin));
  if (!code) return NextResponse.redirect(new URL("/sign-in?error=missing", url.origin));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/sign-in?error=expired", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
