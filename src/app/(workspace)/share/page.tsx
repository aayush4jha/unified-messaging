import type { Metadata } from "next";
import { Suspense } from "react";
import { ShareHandler } from "@/components/pwa/share-handler";
import { ListSkeleton } from "@/components/ui/empty";

export const metadata: Metadata = { title: "New message" };
// Client-state driven (see workspace layout).
export const instant = false;

/** Target of the "Share → Orbit" system share sheet and the Compose home-screen shortcut. */
export default function SharePage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ShareHandler />
    </Suspense>
  );
}
