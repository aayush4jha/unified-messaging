import type { Metadata } from "next";
import { Suspense } from "react";
import { FollowUpsView } from "@/components/followups/followups-view";

export const metadata: Metadata = { title: "Follow-ups" };
// Client-state driven (see workspace layout).
export const instant = false;

export default function Page() {
  return (
    <Suspense fallback={null}>
      <FollowUpsView />
    </Suspense>
  );
}
