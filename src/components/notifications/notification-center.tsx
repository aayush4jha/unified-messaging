"use client";

import { isToday } from "date-fns";
import { AtSign, Bell, BellOff, CheckCheck, MessageSquare, Moon, Settings, TriangleAlert, Trash2, X, Zap } from "lucide-react";
import Link from "next/link";
import { Dialog as D } from "radix-ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { inQuietHours } from "@/lib/notify";
import { inboxHref } from "@/lib/routes";
import type { AppNotification } from "@/lib/types";
import { cn, formatRelative } from "@/lib/utils";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";
import { PlatformIcon } from "../brand/platform-icon";
import { Button, IconButton } from "../ui/button";
import { Segmented, Switch } from "../ui/controls";
import { EmptyState } from "../ui/empty";

type Filter = "all" | "priority" | "unread";

export function NotificationCenter() {
  const open = useUI((s) => s.notificationsOpen);
  const setOpen = useUI((s) => s.setNotifications);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-overlay/60 data-[state=open]:animate-fade-in" />
        <D.Content
          className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-[400px] flex-col pb-safe pt-safe border-l border-line bg-surface-raised shadow-xl outline-none data-[state=open]:animate-[slide-in-right_220ms_var(--ease-out)]"
          aria-describedby={undefined}
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
        >
          {open ? <Panel onClose={() => setOpen(false)} /> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const notifications = useWorkspace((s) => s.notifications);
  const accounts = useWorkspace((s) => s.accounts);
  const prefs = useWorkspace((s) => s.prefs);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  const { markNotificationRead, markAllNotificationsRead, clearNotifications } = useWorkspace.getState();
  const [filter, setFilter] = useState<Filter>("all");

  const list = useMemo(
    () =>
      notifications.filter((n) => (filter === "priority" ? n.kind === "priority" || n.kind === "reminder" : filter === "unread" ? !n.read : true)),
    [notifications, filter],
  );
  const today = list.filter((n) => isToday(new Date(n.createdAt)));
  const earlier = list.filter((n) => !isToday(new Date(n.createdAt)));
  const quiet = inQuietHours(prefs.quietHours);
  const unread = notifications.filter((n) => !n.read).length;

  const openNotification = (n: AppNotification) => {
    markNotificationRead(n.id);
    onClose();
    if (n.conversationId) router.push(inboxHref({ c: n.conversationId }));
    else if (n.reminderId) router.push("/follow-ups");
    else if (n.accountId) router.push(`/settings?tab=accounts`);
  };

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line-subtle px-4">
        <D.Title className="text-[0.9375rem] font-semibold">Notifications</D.Title>
        {unread > 0 ? <span className="rounded-full bg-accent px-1.5 text-[0.6875rem] font-semibold leading-[18px] text-accent-contrast">{unread}</span> : null}
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton label="Mark all as read" onClick={markAllNotificationsRead} disabled={unread === 0}>
            <CheckCheck />
          </IconButton>
          <IconButton label="Notification settings" onClick={() => (onClose(), router.push("/settings?tab=notifications"))}>
            <Settings />
          </IconButton>
          <IconButton label="Close" onClick={onClose}>
            <X />
          </IconButton>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-b border-line-subtle px-4 py-2.5">
        <Segmented
          value={filter}
          onChange={setFilter}
          size="xs"
          ariaLabel="Filter notifications"
          options={[
            { value: "all", label: "All" },
            { value: "priority", label: "Priority" },
            { value: "unread", label: "Unread" },
          ]}
        />
        <label className="ml-auto flex items-center gap-2 text-xs text-fg-2">
          {prefs.doNotDisturb ? <BellOff className="size-3.5 text-fg-3" /> : <Bell className="size-3.5 text-fg-3" />}
          Do Not Disturb
          <Switch checked={prefs.doNotDisturb} onCheckedChange={(v) => setPrefs({ doNotDisturb: v })} aria-label="Do Not Disturb" />
        </label>
      </div>

      {prefs.doNotDisturb || quiet ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-line-subtle bg-info-soft px-4 py-2 text-xs text-fg-2">
          <Moon className="size-3.5 text-info" />
          {prefs.doNotDisturb ? "Do Not Disturb is on. Notifications are collected here silently." : `Quiet hours until ${prefs.quietHours.end}. Only priority items interrupt.`}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {list.length === 0 ? (
          <EmptyState compact icon={<Bell />} title={filter === "all" ? "No notifications" : "Nothing here"} description="New messages, mentions and reminders will show up here." />
        ) : (
          <>
            {today.length ? <Group title="Today" items={today} accounts={accounts} onOpen={openNotification} /> : null}
            {earlier.length ? <Group title="Earlier" items={earlier} accounts={accounts} onOpen={openNotification} /> : null}
          </>
        )}
      </div>

      {notifications.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between border-t border-line-subtle px-4 py-2.5">
          <Link href="/settings?tab=notifications" onClick={onClose} className="text-xs font-medium text-fg-3 hover:text-fg">
            Customize notifications
          </Link>
          <Button size="xs" variant="ghost" onClick={clearNotifications}>
            <Trash2 /> Clear all
          </Button>
        </div>
      ) : null}
    </>
  );
}

function Group({ title, items, accounts, onOpen }: { title: string; items: AppNotification[]; accounts: ReturnType<typeof useWorkspace.getState>["accounts"]; onOpen: (n: AppNotification) => void }) {
  return (
    <section>
      <h3 className="sticky top-0 z-[1] bg-surface-raised/95 px-4 pb-1.5 pt-3 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4 backdrop-blur">{title}</h3>
      {items.map((n) => {
        const account = n.accountId ? accounts.find((a) => a.id === n.accountId) : undefined;
        const Icon = n.kind === "priority" ? (n.body.includes("@") ? AtSign : Zap) : n.kind === "reminder" ? Bell : n.kind === "system" ? TriangleAlert : MessageSquare;
        return (
          <button key={n.id} onClick={() => onOpen(n)} className={cn("relative flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-hover", !n.read && "bg-accent-soft/50")}>
            <span className="relative mt-0.5 shrink-0">
              <span
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full [&_svg]:size-4",
                  n.kind === "priority" ? "bg-accent-soft text-accent-text" : n.kind === "system" ? "bg-warning-soft text-warning" : n.kind === "reminder" ? "bg-info-soft text-info" : "bg-hover text-fg-2",
                )}
              >
                <Icon />
              </span>
              {account ? (
                <span className="absolute -bottom-1 -right-1 rounded-[5px] ring-2 ring-surface-raised">
                  <PlatformIcon platform={account.platform} size={14} />
                </span>
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className={cn("truncate text-[0.8125rem]", n.read ? "font-medium text-fg-2" : "font-semibold text-fg")}>{n.title}</span>
                <span className="ml-auto shrink-0 text-[0.6875rem] text-fg-4">{formatRelative(n.createdAt)}</span>
              </span>
              <span className="mt-0.5 line-clamp-2 block text-xs leading-[1.125rem] text-fg-3">{n.body}</span>
              {account ? <span className="mt-1 block text-[0.6875rem] text-fg-4">{account.label}</span> : null}
            </span>
            {!n.read ? <span className="absolute left-1.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-accent" aria-label="Unread" /> : null}
          </button>
        );
      })}
    </section>
  );
}
