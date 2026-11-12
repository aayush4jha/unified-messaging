import type { Metadata } from "next";
import { Suspense } from "react";
import { AssistantView } from "@/components/assistant/assistant-view";

export const metadata: Metadata = { title: "Assistant" };
// Client-state driven (see workspace layout).
export const instant = false;

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AssistantView />
    </Suspense>
  );
}
