import { SupportedList } from "@/components/supported-list";
import { hasSupabaseConfig } from "@/lib/config";

export const metadata = { title: "Books I support" };
export default function SupportingPage() { return <SupportedList productionMode={hasSupabaseConfig} />; }
