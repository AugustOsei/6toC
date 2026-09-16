import { SignInForm } from "@/components/sign-in-form";
import { hasSupabaseConfig } from "@/lib/config";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  expired: "That link has expired or was already used. Send yourself a fresh one.",
  missing: "That link was missing a piece. Send yourself a fresh one.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <SignInForm productionMode={hasSupabaseConfig} linkError={error ? ERRORS[error] ?? ERRORS.expired : ""} />;
}
