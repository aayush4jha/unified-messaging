"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OrbitMark } from "@/components/brand/platform-icon";
import { useWorkspace } from "@/store/workspace";

export default function Home() {
  const router = useRouter();
  const hydrated = useWorkspace((s) => s.hydrated);
  const onboarded = useWorkspace((s) => s.prefs.onboarded);
  const mode = useWorkspace((s) => s.mode);

  useEffect(() => {
    if (!hydrated) return;
    router.replace(!onboarded && mode === "empty" ? "/onboarding" : "/inbox");
  }, [hydrated, onboarded, mode, router]);

  return (
    <div className="app-frame flex items-center justify-center bg-bg">
      <OrbitMark size={32} className="animate-pulse-dot" />
    </div>
  );
}
