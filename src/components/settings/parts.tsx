"use client";

import { cn } from "@/lib/utils";

export function SectionTitle({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[1.0625rem] font-semibold tracking-[-0.015em]">{title}</h2>
        {description ? <p className="mt-1 text-[0.8125rem] leading-5 text-fg-3">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-lg border border-line bg-surface shadow-xs", className)}>{children}</div>;
}

export function SettingRow({ title, description, children, className }: { title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 border-b border-line-subtle px-4 py-3.5 last:border-b-0", className)}>
      <div className="min-w-0 flex-1">
        <div className="text-[0.8125rem] font-medium text-fg">{title}</div>
        {description ? <div className="mt-0.5 text-xs leading-[1.125rem] text-fg-3">{description}</div> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}
