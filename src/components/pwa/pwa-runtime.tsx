"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/store/workspace";

/** Pages pre-cached for offline launches (the app shell for each workspace screen). */
const OFFLINE_PAGES = ["/inbox", "/search", "/contacts", "/follow-ups", "/assistant", "/settings", "/analytics", "/onboarding"];

/**
 * Registers the service worker (production builds only), keeps the app icon
 * badge in sync with unread conversations, and routes messages from the worker
 * (notification taps, pushes that arrive while Orbit is open).
 */
export function PwaRuntime() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string; payload?: { title?: string; body?: string; url?: string } } | undefined;
      if (data?.type === "navigate" && data.url?.startsWith("/")) router.push(data.url);
      if (data?.type === "push" && data.payload) {
        const url = data.payload.url;
        toast(data.payload.title ?? "Orbit", { description: data.payload.body, action: url?.startsWith("/") ? { label: "Open", onClick: () => router.push(url) } : undefined });
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        await navigator.serviceWorker.ready;
        if (cancelled) return;
        const worker = reg.active ?? navigator.serviceWorker.controller;
        // Assets this page loaded before the worker existed.
        const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/_next/static/"));
        worker?.postMessage({ type: "cache-urls", urls });
        const warmKey = "orbit-sw-warm-v1";
        if (localStorage.getItem(warmKey) !== "1") {
          worker?.postMessage({ type: "cache-pages", paths: OFFLINE_PAGES });
          localStorage.setItem(warmKey, "1");
        }
      } catch {
        /* unsupported or blocked (private mode): Orbit works without it */
      }
    };
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("load", register);
    };
  }, [router]);

  useAppBadge();
  return null;
}

/** Unread conversations on the home-screen icon (installed apps on iOS 16.4+, Android, desktop). */
function useAppBadge() {
  const hydrated = useWorkspace((s) => s.hydrated);
  const conversations = useWorkspace((s) => s.conversations);
  const unread = useMemo(() => conversations.filter((c) => c.unreadCount > 0 && !c.archived && !c.muted).length, [conversations]);
  useEffect(() => {
    if (!hydrated) return;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge) return;
    void (unread > 0 ? nav.setAppBadge(unread) : nav.clearAppBadge?.())?.catch(() => undefined);
  }, [hydrated, unread]);
}
