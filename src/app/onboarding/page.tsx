"use client";

import { OrbitMark } from "@/components/brand/platform-icon";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { useWorkspace } from "@/store/workspace";

export default function OnboardingPage() {
  const hydrated = useWorkspace((s) => s.hydrated);
  if (!hydrated)
    return (
      <div className="flex h-dvh items-center justify-center bg-bg">
        <OrbitMark size={32} className="animate-pulse-dot" />
      </div>
    );
  return <OnboardingFlow />;
}
