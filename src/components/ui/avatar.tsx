import type * as React from "react";
import { cn, hueFromString, initials } from "@/lib/utils";
import type { PlatformId } from "@/lib/types";
import { PlatformIcon } from "../brand/platform-icon";

const sizes = {
  xs: "size-5 text-[0.5625rem]",
  sm: "size-7 text-[0.6875rem]",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
  xl: "size-16 text-lg",
} as const;

export function Avatar({
  name,
  hue,
  size = "md",
  platform,
  group,
  className,
}: {
  name: string;
  hue?: number;
  size?: keyof typeof sizes;
  platform?: PlatformId;
  group?: boolean;
  className?: string;
}) {
  const h = hue ?? hueFromString(name);
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "avatar-tint inline-flex items-center justify-center font-semibold tracking-[0.01em] select-none",
          group ? "rounded-[30%]" : "rounded-full",
          sizes[size],
        )}
        style={{ "--h": h } as React.CSSProperties}
        data-avatar
        aria-hidden
      >
        {group ? "#" : initials(name)}
      </span>
      {platform ? (
        <span className={cn("absolute -bottom-0.5 -right-0.5 rounded-[5px] ring-2 ring-[var(--avatar-ring,var(--surface))]", size === "lg" || size === "xl" ? "" : "")}>
          <PlatformIcon platform={platform} size={size === "lg" || size === "xl" ? 18 : 14} />
        </span>
      ) : null}
    </span>
  );
}
