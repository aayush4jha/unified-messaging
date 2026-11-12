"use client";

import Link from "next/link";
import { useEffect } from "react";
import { OrbitMark } from "@/components/brand/platform-icon";

/** Route-level error boundary: keeps the rest of the app usable and offers recovery. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[orbit] route error", error);
  }, [error]);
  return (
    <div className="app-frame flex flex-col items-center justify-center bg-bg px-6 text-center" role="alert">
      <OrbitMark size={40} />
      <h1 className="mt-6 text-[1.25rem] font-semibold tracking-[-0.02em]">Something went wrong</h1>
      <p className="mt-2 max-w-[380px] text-[0.875rem] text-fg-2">Orbit hit an unexpected error on this screen. Your messages are safe; nothing was sent or deleted.</p>
      {error.digest ? <p className="mt-2 font-mono text-[0.6875rem] text-fg-3">Reference: {error.digest}</p> : null}
      <div className="mt-6 flex gap-2">
        <button onClick={reset} className="inline-flex h-9 items-center rounded-sm bg-accent px-4 text-[0.8125rem] font-medium text-accent-contrast hover:bg-accent-hover">
          Try again
        </button>
        <Link href="/inbox" className="inline-flex h-9 items-center rounded-sm border border-line bg-surface px-4 text-[0.8125rem] font-medium hover:bg-hover">
          Go to inbox
        </Link>
      </div>
    </div>
  );
}
