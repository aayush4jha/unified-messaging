"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { useWorkspace } from "@/store/workspace";
import { PwaRuntime } from "./pwa/pwa-runtime";
import { ConfirmHost } from "./ui/dialog";
import { TooltipProvider } from "./ui/tooltip";

function useApplyAppearance() {
  const theme = useWorkspace((s) => s.prefs.theme);
  const accent = useWorkspace((s) => s.prefs.accent);
  const density = useWorkspace((s) => s.prefs.density);
  const hydrated = useWorkspace((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    const el = document.documentElement;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      el.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    el.dataset.accent = accent;
    el.dataset.density = density;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, accent, density, hydrated]);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const unsub = useWorkspace.persist.onFinishHydration(() => useWorkspace.getState().setHydrated());
    void useWorkspace.persist.rehydrate();
    if (useWorkspace.persist.hasHydrated()) useWorkspace.getState().setHydrated();
    return unsub;
  }, []);
  useApplyAppearance();

  return (
    <TooltipProvider>
      {children}
      <PwaRuntime />
      <ConfirmHost />
      <Toaster
        position="bottom-center"
        gap={8}
        offset={20}
        toastOptions={{
          classNames: {
            toast:
              "!bg-surface-raised !text-fg !border !border-line !shadow-lg !rounded-md !text-[0.8125rem] !py-2.5 !px-3.5 !gap-2.5 !min-h-0 !font-sans",
            title: "!font-medium !text-[0.8125rem]",
            description: "!text-fg-3 !text-xs",
            actionButton: "!bg-accent !text-accent-contrast !rounded-[5px] !h-6 !px-2 !text-xs !font-medium",
            cancelButton: "!bg-hover !text-fg-2 !rounded-[5px] !h-6 !px-2 !text-xs",
            success: "[&_[data-icon]]:!text-success",
            error: "[&_[data-icon]]:!text-danger",
          },
        }}
      />
    </TooltipProvider>
  );
}
