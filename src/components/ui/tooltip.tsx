"use client";

import { Tooltip as T } from "radix-ui";
import * as React from "react";
import { Kbd } from "./kbd";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={450} skipDelayDuration={250}>
      {children}
    </T.Provider>
  );
}

export function Tooltip({
  label,
  shortcut,
  side = "bottom",
  children,
  disabled,
}: {
  label: React.ReactNode;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
  disabled?: boolean;
}) {
  if (disabled) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[80] flex max-w-[280px] items-center gap-2 rounded-[6px] bg-fg px-2 py-1 text-xs font-medium text-fg-inverse shadow-md data-[state=delayed-open]:animate-fade-in"
        >
          <span>{label}</span>
          {shortcut ? <Kbd tone="inverse">{shortcut}</Kbd> : null}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
