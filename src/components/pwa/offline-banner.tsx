"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useOffline } from "next/offline";
import { Button } from "../ui/button";

/** Connectivity banner: navigations and syncs wait and retry on their own when the network returns. */
export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <div role="status" className="flex shrink-0 items-center justify-center gap-2 bg-fg px-3 py-1.5 text-xs font-medium text-fg-inverse animate-fade-in">
      <WifiOff className="size-3.5" aria-hidden />
      You&apos;re offline. Changes sync when you reconnect.
    </div>
  );
}

export function RetryButton() {
  return (
    <Button variant="secondary" onClick={() => location.reload()}>
      <RefreshCw /> Try again
    </Button>
  );
}
