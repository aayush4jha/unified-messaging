"use client";

import { Menu as MenuIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUI } from "@/store/ui";
import { IconButton } from "../ui/button";

export function PageHeader({ title, description, actions, className, children }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; className?: string; children?: React.ReactNode }) {
  const setMobileNav = useUI((s) => s.setMobileNav);
  return (
    <header className={cn("shrink-0 border-b border-line bg-surface", className)}>
      <div className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-6">
        <IconButton label="Open navigation" className="-ml-1.5 md:hidden" onClick={() => setMobileNav(true)}>
          <MenuIcon />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.0625rem] font-semibold tracking-[-0.02em]">{title}</h1>
          {description ? <p className="mt-0.5 truncate text-xs text-fg-3">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
