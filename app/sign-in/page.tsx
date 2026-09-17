import { SignInForm } from "@/components/sign-in-form";
import { hasSupabaseConfig } from "@/lib/config";
import { safePath } from "@/lib/safe-path";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  expired: "That link has expired or was already used. Send yourself a fresh one.",
  missing: "That link was missing a piece. Send yourself a fresh one.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { error, next } = await searchParams;
  const code = typeof error === "string" ? error : "";
  return <SignInForm productionMode={hasSupabaseConfig} linkError={code ? ERRORS[code] ?? ERRORS.expired : ""} next={safePath(next, "/book")} />;
}
