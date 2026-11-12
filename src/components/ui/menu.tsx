"use client";

import { Check, ChevronRight } from "lucide-react";
import { DropdownMenu as M } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Kbd } from "./kbd";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuGroup = M.Group;
export const MenuSub = M.Sub;
export const MenuRadioGroup = M.RadioGroup;

const contentCls =
  "z-[70] min-w-[200px] overflow-hidden rounded-md border border-line bg-surface-raised p-1 text-[0.8125rem] text-fg shadow-lg outline-none data-[state=open]:animate-scale-in origin-[var(--radix-dropdown-menu-content-transform-origin)]";

export function MenuContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={sideOffset} collisionPadding={8} className={cn(contentCls, className)} {...props} />
    </M.Portal>
  );
}

const itemCls =
  "relative flex h-8 cursor-default select-none items-center gap-2 rounded-[5px] px-2 outline-none transition-colors data-[highlighted]:bg-hover data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-3";

export function MenuItem({
  className,
  shortcut,
  danger,
  children,
  ...props
}: React.ComponentProps<typeof M.Item> & { shortcut?: string; danger?: boolean }) {
  return (
    <M.Item className={cn(itemCls, danger && "text-danger [&_svg]:text-danger data-[highlighted]:bg-danger-soft", className)} {...props}>
      {children}
      {shortcut ? <Kbd className="ml-auto pl-4">{shortcut}</Kbd> : null}
    </M.Item>
  );
}

export function MenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem className={cn(itemCls, "pr-7", className)} {...props}>
      {children}
      <M.ItemIndicator className="absolute right-2 inline-flex">
        <Check className="!text-accent-text" />
      </M.ItemIndicator>
    </M.CheckboxItem>
  );
}

export function MenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(itemCls, "pr-7", className)} {...props}>
      {children}
      <M.ItemIndicator className="absolute right-2 inline-flex">
        <Check className="!text-accent-text" />
      </M.ItemIndicator>
    </M.RadioItem>
  );
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 pb-1 pt-2 text-[0.6875rem] font-medium uppercase tracking-[0.04em] text-fg-4", className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: React.ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn("-mx-1 my-1 h-px bg-line-subtle", className)} {...props} />;
}

export function MenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof M.SubTrigger>) {
  return (
    <M.SubTrigger className={cn(itemCls, "data-[state=open]:bg-hover", className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </M.SubTrigger>
  );
}

export function MenuSubContent({ className, ...props }: React.ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent sideOffset={4} collisionPadding={8} className={cn(contentCls, className)} {...props} />
    </M.Portal>
  );
}
