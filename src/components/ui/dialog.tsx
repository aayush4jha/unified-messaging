"use client";

import { X } from "lucide-react";
import { AlertDialog, Dialog as D } from "radix-ui";
import * as React from "react";
import { create } from "zustand";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  hideClose,
  size = "md",
  ...props
}: React.ComponentProps<typeof D.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  hideClose?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-[60] bg-overlay data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[12vh] z-[61] flex max-h-[80vh] w-[calc(100vw-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-line bg-surface-raised shadow-xl outline-none data-[state=open]:animate-scale-in",
          size === "sm" && "max-w-[400px]",
          size === "md" && "max-w-[520px]",
          size === "lg" && "max-w-[680px]",
          size === "xl" && "max-w-[880px]",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-4">
          <div className="min-w-0">
            <D.Title className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-fg">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-[0.8125rem] text-fg-3">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>}
          </div>
          {!hideClose ? (
            <D.Close className="-mr-1.5 -mt-0.5 inline-flex size-7 items-center justify-center rounded-sm text-fg-3 transition-colors hover:bg-hover hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-3", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-end gap-2 border-t border-line-subtle bg-surface-sunken/60 px-5 py-3", className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Imperative confirm dialog: `const ok = await confirm({...})`                */
/* -------------------------------------------------------------------------- */

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((v: boolean) => void) | null;
  ask(o: ConfirmOptions): Promise<boolean>;
  settle(v: boolean): void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      get().resolve?.(false);
      set({ open: true, options, resolve });
    }),
  settle: (v) => {
    get().resolve?.(v);
    set({ open: false, resolve: null });
  },
}));

export const confirm = (o: ConfirmOptions) => useConfirmStore.getState().ask(o);

export function ConfirmHost() {
  const { open, options, settle } = useConfirmStore();
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !o && settle(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[90] bg-overlay data-[state=open]:animate-fade-in" />
        <AlertDialog.Content className="fixed left-1/2 top-[22vh] z-[91] w-[calc(100vw-2rem)] max-w-[420px] -translate-x-1/2 rounded-lg border border-line bg-surface-raised p-5 shadow-xl outline-none data-[state=open]:animate-scale-in">
          <AlertDialog.Title className="text-[0.9375rem] font-semibold text-fg">{options?.title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-1.5 text-[0.8125rem] leading-5 text-fg-2">{options?.description}</div>
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{options?.cancelLabel ?? "Cancel"}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={options?.danger ? "danger" : "primary"} onClick={() => settle(true)} autoFocus>
                {options?.confirmLabel ?? "Confirm"}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
