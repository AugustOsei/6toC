import { NextResponse } from "next/server";
import { hasSupabaseConfig } from "@/lib/config";
import { safePath } from "@/lib/safe-path";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Only same-site paths are allowed, so a crafted link cannot bounce the reader elsewhere.
  const next = safePath(url.searchParams.get("next"), "/onboarding?resume=1");
  // Preview mode has no accounts, so there is no link to finish.
  if (!hasSupabaseConfig) return NextResponse.redirect(new URL("/sign-in", url.origin));
  if (!code) return NextResponse.redirect(new URL("/sign-in?error=missing", url.origin));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/sign-in?error=expired&next=${encodeURIComponent(next)}`, url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
