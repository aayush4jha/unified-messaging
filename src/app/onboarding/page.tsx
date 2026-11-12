"use client";

import { useRouter } from "next/navigation";
import { OrbitLogo } from "@/components/brand/platform-icon";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/store/workspace";

export default function OnboardingPage() {
  const router = useRouter();
  const loadDemo = useWorkspace((s) => s.loadDemo);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-bg">
      <OrbitLogo />
      <Button
        variant="primary"
        onClick={() => {
          loadDemo();
          setPrefs({ onboarded: true });
          router.replace("/inbox");
        }}
      >
        Explore the sample workspace
      </Button>
    </div>
  );
}
