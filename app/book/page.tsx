import { BookView } from "@/components/book-view";
import { hasSupabaseConfig } from "@/lib/config";

export const metadata = { title: "My 6TOC" };
export default function BookPage() { return <BookView productionMode={hasSupabaseConfig} />; }
