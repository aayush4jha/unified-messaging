import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Settings" };
// Client-state driven (see workspace layout).
export const instant = false;

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SettingsView />
    </Suspense>
  );
}
