import type { Metadata } from "next";
import { OrbitMark } from "@/components/brand/platform-icon";
import { RetryButton } from "@/components/pwa/offline-banner";

export const metadata: Metadata = { title: "Offline" };

/** Served by the service worker when a page has never been opened on this device and there's no network. */
export default function OfflinePage() {
  return (
    <main className="app-frame flex flex-col items-center justify-center gap-4 bg-bg px-8 text-center">
      <OrbitMark size={40} />
      <div>
        <h1 className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-fg">You&apos;re offline</h1>
        <p className="mt-1 max-w-[300px] text-[0.8125rem] text-fg-3">This page hasn&apos;t been saved for offline use yet. Your inbox is available once you&apos;ve opened it on this device.</p>
      </div>
      <RetryButton />
    </main>
  );
}
