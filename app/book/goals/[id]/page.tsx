import { GoalDetail } from "@/components/goal-detail";
import { hasSupabaseConfig } from "@/lib/config";

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <GoalDetail goalId={id} productionMode={hasSupabaseConfig} />; }
