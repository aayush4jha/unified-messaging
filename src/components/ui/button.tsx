"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium select-none transition-[background-color,color,box-shadow,opacity,transform] duration-150 ease-out disabled:pointer-events-none disabled:opacity-45 active:scale-[0.985] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-contrast shadow-xs hover:bg-accent-hover",
        secondary: "bg-surface text-fg border border-line shadow-xs hover:bg-hover hover:border-line-strong",
        ghost: "text-fg-2 hover:bg-hover hover:text-fg",
        subtle: "bg-hover text-fg hover:bg-active",
        danger: "bg-danger text-white shadow-xs hover:opacity-90",
        "danger-ghost": "text-danger hover:bg-danger-soft",
        link: "text-accent-text hover:underline underline-offset-2 px-0 h-auto",
      },
      size: {
        xs: "h-6 px-2 text-xs rounded-[5px] [&_svg]:size-3.5",
        sm: "h-7 px-2.5 text-[0.8125rem] rounded-sm [&_svg]:size-3.5",
        md: "h-8 px-3 text-[0.8125rem] rounded-sm [&_svg]:size-4",
        lg: "h-10 px-4 text-sm rounded-md [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading ? <Spinner /> : null}
      {children}
    </Comp>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-3.5 animate-spin", className)} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const iconButtonVariants = cva(
  "inline-flex items-center justify-center shrink-0 text-fg-3 transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-fg active:scale-95 disabled:pointer-events-none disabled:opacity-40 data-[active=true]:text-fg data-[active=true]:bg-active",
  {
    variants: {
      size: {
        xs: "size-6 rounded-[5px] [&_svg]:size-3.5",
        sm: "size-7 rounded-sm [&_svg]:size-4",
        md: "size-8 rounded-sm [&_svg]:size-[1.0625rem]",
      },
    },
    defaultVariants: { size: "sm" },
  },
);

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButtonVariants> {
  label: string;
  shortcut?: string;
  active?: boolean;
  tooltipSide?: "top" | "bottom" | "left" | "right";
  noTooltip?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, size, className, active, tooltipSide, noTooltip, children, ...props },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      data-active={active ? "true" : undefined}
      aria-pressed={active === undefined ? undefined : active}
      className={cn(iconButtonVariants({ size }), className)}
      {...props}
    >
      {children}
    </button>
  );
  if (noTooltip) return btn;
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      {btn}
    </Tooltip>
  );
});
