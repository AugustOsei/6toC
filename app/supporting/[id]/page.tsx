import { SupportedBookView } from "@/components/supported-book";
import { hasSupabaseConfig } from "@/lib/config";

export const metadata = { title: "In their corner" };

export default async function SupportedBookPage({ params }: PageProps<"/supporting/[id]">) {
  const { id } = await params;
  return <SupportedBookView supporterId={id} productionMode={hasSupabaseConfig} />;
}
