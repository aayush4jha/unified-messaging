import type { Metadata } from "next";
import { Suspense } from "react";
import { InboxView } from "@/components/inbox/inbox-view";
import { ListSkeleton } from "@/components/ui/empty";

export const metadata: Metadata = { title: "Inbox" };
// Client-state driven (see workspace layout).
export const instant = false;

export default function InboxPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <InboxView />
    </Suspense>
  );
}
