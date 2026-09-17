import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

// Supporting someone needs an account. Preview mode has none, so the pages explain that.
export default async function SupportingLayout({ children }: LayoutProps<"/supporting">) {
  if (hasSupabaseConfig) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/sign-in?next=/supporting");
  }
  return children;
}
