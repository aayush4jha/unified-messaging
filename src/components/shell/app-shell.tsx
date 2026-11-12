"use client";

import { Dialog as D } from "radix-ui";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useHotkeys } from "@/lib/hotkeys";
import { inboxHref } from "@/lib/routes";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";
import { OrbitMark } from "../brand/platform-icon";
import { Skeleton } from "../ui/empty";
import { GlobalOverlays } from "./overlays";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useWorkspace((s) => s.hydrated);
  const onboarded = useWorkspace((s) => s.prefs.onboarded);
  const mode = useWorkspace((s) => s.mode);
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !onboarded && mode === "empty") router.replace("/onboarding");
  }, [hydrated, onboarded, mode, router]);

  if (!hydrated) return <ShellSkeleton />;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-fg">
      <Suspense fallback={<div className="w-[244px] border-r border-line bg-surface-sunken" />}>
        <div className="hidden md:flex">
          <Sidebar />
        </div>
        <MobileNav />
      </Suspense>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      <GlobalShortcuts />
      <Suspense fallback={null}>
        <GlobalOverlays />
      </Suspense>
    </div>
  );
}

function MobileNav() {
  const open = useUI((s) => s.mobileNavOpen);
  const setOpen = useUI((s) => s.setMobileNav);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname, setOpen]);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in md:hidden" />
        <D.Content className="fixed inset-y-0 left-0 z-50 flex shadow-xl outline-none data-[state=open]:animate-[slide-in-left_200ms_var(--ease-out)] md:hidden" aria-label="Navigation">
          <D.Title className="sr-only">Navigation</D.Title>
          <D.Description className="sr-only">Folders, accounts and workspace pages</D.Description>
          <Sidebar mobile />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function GlobalShortcuts() {
  const router = useRouter();
  const { openCompose, setPalette, setShortcuts, setNotifications } = useUI();
  const setPrefs = useWorkspace((s) => s.setPrefs);
  const collapsed = useWorkspace((s) => s.prefs.sidebarCollapsed);
  const go = (href: string) => () => router.push(href);

  useHotkeys({
    "mod+k": () => setPalette(!useUI.getState().paletteOpen),
    "/": () => setPalette(true),
    c: () => openCompose(),
    "?": () => setShortcuts(true),
    "mod+\\": () => setPrefs({ sidebarCollapsed: !collapsed }),
    "mod+,": go("/settings"),
    "g i": go(inboxHref()),
    "g u": go(inboxHref({ folder: "unread" })),
    "g s": go(inboxHref({ folder: "starred" })),
    "g d": go(inboxHref({ folder: "drafts" })),
    "g e": go(inboxHref({ folder: "archived" })),
    "g t": go(inboxHref({ folder: "sent" })),
    "g c": go("/contacts"),
    "g f": go("/follow-ups"),
    "g a": go("/assistant"),
    "g n": () => setNotifications(true),
  });
  return null;
}

function ShellSkeleton() {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg" aria-busy="true" aria-label="Loading Orbit">
      <div className="hidden w-[244px] shrink-0 flex-col gap-2 border-r border-line bg-surface-sunken p-3 md:flex">
        <div className="mb-2 flex items-center gap-2">
          <OrbitMark size={22} />
          <Skeleton className="h-3.5 w-14" />
        </div>
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-6" />
        ))}
      </div>
      <div className="w-full max-w-[400px] border-r border-line p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="mb-4 flex gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden flex-1 lg:block" />
    </div>
  );
}
