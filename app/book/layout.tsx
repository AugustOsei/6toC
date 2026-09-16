import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

// The book is private. In preview mode there are no accounts, so the browser copy is the gate.
export default async function BookLayout({ children }: LayoutProps<"/book">) {
  if (hasSupabaseConfig) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/sign-in");
  }
  return children;
}
