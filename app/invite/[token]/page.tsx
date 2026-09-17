import { InvitePage } from "@/components/invite-page";
import { hasSupabaseConfig } from "@/lib/config";

export const metadata = { title: "You’re invited" };

export default async function Invite({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  return <InvitePage token={token} productionMode={hasSupabaseConfig} />;
}
