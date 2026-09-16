import { OnboardingFlow } from "@/components/onboarding-flow";
import { hasSupabaseConfig } from "@/lib/config";

export default function OnboardingPage() { return <OnboardingFlow productionMode={hasSupabaseConfig} />; }
