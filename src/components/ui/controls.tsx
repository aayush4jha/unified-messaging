"use client";

import { Popover as P, Switch as S } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- Popover */
export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-[70] rounded-md border border-line bg-surface-raised p-3 text-fg shadow-lg outline-none data-[state=open]:animate-scale-in origin-[var(--radix-popover-content-transform-origin)]",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}

/* ---------------------------------------------------------------- Switch */
export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full bg-line-strong transition-colors duration-200 data-[state=checked]:bg-accent disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-[14px] translate-x-[2px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out data-[state=checked]:translate-x-[14px]" />
    </S.Root>
  );
}

/* ---------------------------------------------------------------- Segmented control */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "sm",
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  className?: string;
  size?: "xs" | "sm";
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex items-center gap-0.5 rounded-sm bg-surface-sunken p-0.5 ring-1 ring-inset ring-line-subtle", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium text-fg-3 transition-[background-color,color,box-shadow] duration-150 hover:text-fg [&_svg]:size-3.5",
            size === "xs" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[0.8125rem]",
            value === o.value && "bg-surface text-fg shadow-sm",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Inputs */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-sm border border-line bg-surface px-2.5 text-[0.8125rem] text-fg shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-fg-4 hover:border-line-strong focus:border-accent focus:ring-3 focus:ring-accent-soft disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-none rounded-sm border border-line bg-surface px-2.5 py-2 text-[0.8125rem] leading-5 text-fg shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-fg-4 hover:border-line-strong focus:border-accent focus:ring-3 focus:ring-accent-soft",
        className,
      )}
      {...props}
    />
  );
});

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-fg-2">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-fg-3">{hint}</span> : null}
    </label>
  );
}

/* ---------------------------------------------------------------- Badge */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "outline";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center gap-1 rounded-[4px] px-1.5 text-[0.6875rem] font-medium leading-none [&_svg]:size-3",
        tone === "neutral" && "bg-hover text-fg-2",
        tone === "accent" && "bg-accent-soft text-accent-text",
        tone === "success" && "bg-success-soft text-success",
        tone === "warning" && "bg-warning-soft text-[color-mix(in_oklch,var(--warning)_70%,var(--text))]",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "info" && "bg-info-soft text-info",
        tone === "outline" && "border border-line text-fg-3",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Count pill */
export function Count({ value, tone = "muted", className }: { value: number; tone?: "muted" | "accent"; className?: string }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "tabular ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-semibold leading-none",
        tone === "accent" ? "bg-accent text-accent-contrast" : "text-fg-3",
        className,
      )}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}
